/**
 * Stage 5 — contacts (SPEC §7.3). Phase 1: contact predation.
 *
 * 1. Every predator that may hunt (hungry: E < 80 and meal < 0.5 B0; cooldown ready) claims its
 *    nearest compatible prey whose center is within contact distance (0.5 cells), using positions
 *    after stage 4. Ties go to the lower prey birthId.
 * 2. A prey claimed by several predators goes to the claimant with the highest seeded priority
 *    det(seed, 'contact', tick, KIND_ATTACK, birthId); losers get nothing this tick.
 * 3. Kills commit together: the prey's B and N become the winner's meal (capped at 2 × B0 carbon;
 *    overflow becomes detritus at the prey's cell), any meal the prey held becomes detritus, prey
 *    energy is discarded, and the winner's cooldown starts. One prey is never awarded twice.
 * 4. Then parasite attachment (parasites.ts) and host-specific infection (viruses.ts), P3.4.
 *
 * Phase 5 wave 12 (P5.5; handling.ts; D-0106, D-0122), reached only in a world whose recorded species include
 * a RADIUS_CAPTURE or HANDLING predator (both tables null otherwise: the loop above runs unchanged):
 *  - RADIUS_CAPTURE (P06): its contact test is a centre distance ≤ 1.0 (inclusive) instead of 0.5; the ±1
 *    cell scan covers it, and the edge rule (pairPermitted, both classes) is unchanged.
 *  - HANDLING (P10): a handler that left Active ends an open attempt ('rest'), one no longer hungry ends it
 *    ('hunger'); one with an open attempt checks only its target (valid, allowed, in contact on positions
 *    after stage 4, not behind a refusing edge): progress += DT, and at progress ≥ need it joins the claim
 *    pool above as a COMPLETING claim with the same priority; otherwise the attempt ends ('target' or
 *    'contact') and nothing new starts this tick. One without an attempt and with its cooldown ready picks
 *    the nearest prey in contact as above: a need of 0 is an instant claim, a need > 0 starts an attempt
 *    (the start tick is the first contact tick). After the commits a winner's attempt ends silently (its
 *    capture event carries detail.handled = the need) and an attempt whose target was taken, or which
 *    completed without winning, ends as 'taken': no progress and no cooldown are kept.
 *  - A predator held by a trap (heldBySlot ≥ 0) is not excluded: it may make contact captures (D-0106).
 *
 * Contact kinds on the 'contact' stream (saved worlds depend on them; never renumber): 1 attack (here),
 * 2 parasite attachment (parasites.ts KIND_PARASITE), 3 infection unit order (viruses.ts KIND_INFECT),
 * 4 reserved for E12 (adhesion.ts resolves pairs by birthId and draws nothing), 5 trap capture (traps.ts KIND_TRAP;
 * Phase 5 wave 13: its claims keep their own pool, since a hold removes nothing).
 * 5. Then E12 link formation (adhesion.ts formAdhesionLinks).
 *
 * Phase 5 wave 13 (P5.5 E3-TRAPS; traps.ts; D-0124): right after predation, armed F03 traps catch a P04 in their
 * own cell (`trapCaptures`, SPEC §3.2 row 5 "Predation claims and handling progress; trap capture; parasite
 * attachment"); it returns at once in a world whose recorded species include no TRAP species. consumePrey
 * releases a trap pair either end of which it removes (defensive: no CT prey list names P04 or F03).
 */
import { CONTACT_DISTANCE, DT, GRID_H, GRID_W, MEAL_CAP_MULTIPLE, RADIUS_CAPTURE_DISTANCE } from './constants';
import { classOf } from './barriers';
import { pairPermitted } from './edgePassage';
import { emit } from './events';
import { endAttempt, handlingNeedOf, handlingSpecies, HANDLING_EPS, radiusCaptureSpecies, startAttempt } from './handling';
import { cellIndex } from './grid';
import { recordDeath } from './lineage';
import { removeAllLinks } from './links';
import { attachParasites, releaseHostPair } from './parasites';
import { formAdhesionLinks, severOnRemoval } from './adhesion';
import { infectHosts } from './viruses';
import { releaseTrapOnRemoval, trapCaptures } from './traps';
import { onDeath } from './branches';
import { hungryPredator, preyAllowed } from './movement';
import { profileOf } from './profiles';
import { R } from './reasons';
import { det, STREAMS } from './rng';
import { entityCell, forEachInCell } from './spatial';
import { markField } from './transport';
import type { SpeciesRT } from './species';
import type { World } from './world';

const KIND_ATTACK = 1;

const claimOf = new Int32Array(6000);
const bestClaimant = new Int32Array(6000);
const bestPriority = new Float64Array(6000);

export function stageContacts(world: World): void {
  predationContacts(world);
  trapCaptures(world); // Phase 5 wave 13 (traps.ts): F03 trap capture, after predation (SPEC §3.2 row 5)
  // SPEC §3.2 row 5: predation, then parasite attachment, then host-specific infection.
  attachParasites(world);
  infectHosts(world);
  formAdhesionLinks(world); // E12 link formation (adhesion.ts), after infection (SPEC §3.2 row 5)
}

function predationContacts(world: World): void {
  const e = world.ents;
  const c = e.cols;
  const hw = e.highWater;
  const contact2 = CONTACT_DISTANCE * CONTACT_DISTANCE;
  const edgesOn = world.edges.length > 0; // wave 9 gate: edges exist only where 'barriers' is recorded
  // Phase 5 wave 12 gates (handling.ts): null unless the world's recorded species include a HANDLING or a
  // RADIUS_CAPTURE predator, so every other world runs the v1.0 loop and reads no new column.
  const handlers = handlingSpecies(world);
  const radius = radiusCaptureSpecies(world);
  let anyClaim = false;
  let anyAttempt = false;
  for (let i = 0; i < hw; i++) {
    claimOf[i] = -1;
    bestClaimant[i] = -1;
  }
  // 1. Claims.
  for (let i = 0; i < hw; i++) {
    if (c.alive[i] !== 1) continue;
    // A handler that left Active ends its open attempt ('rest'; SPEC §7.3 "continuous contact").
    if (handlers !== null && c.lifeState[i] !== 0 && handlers[c.species[i]!] === 1 && c.handlingNeed[i]! > 0) endAttempt(world, i, 'rest');
    if (c.lifeState[i] !== 0) continue;
    const sp = world.species[c.species[i]!]!;
    if (!sp.isPredator) continue;
    const prof = profileOf(world, i);
    const handler = handlers !== null && handlers[sp.idx] === 1;
    if (!hungryPredator(world, i, prof)) {
      if (handler) endAttempt(world, i, 'hunger'); // "Predators at meal capacity stop hunting" (SPEC §7.3)
      continue;
    }
    // P06 (RADIUS_CAPTURE): a fixed centre distance of 1.0 cell, not its sensing (CT §6.2, D-0106).
    const reach2 = radius !== null && radius[sp.idx] === 1 ? RADIUS_CAPTURE_DISTANCE * RADIUS_CAPTURE_DISTANCE : contact2;
    if (handler && c.handlingNeed[i]! > 0) {
      // An open attempt: its own target only, in contact at every tick (D02 381).
      anyAttempt = true;
      if (continueAttempt(world, i, sp, reach2, edgesOn)) {
        claim(world, i, c.preySlot[i]!);
        anyClaim = true;
      }
      continue;
    }
    if (c.attackCooldown[i]! > 0) continue;
    const px = c.x[i]!;
    const py = c.y[i]!;
    const cx = Math.floor(px);
    const cy = Math.floor(py);
    // Wave 9 (D-0106): no claim across an edge that refuses the predator's or the prey's class.
    const cls = edgesOn ? classOf(world, i) : null;
    const own = cellIndex(cx, cy);
    let best = -1;
    let bestD = Infinity;
    let bestBirth = Infinity;
    for (let y = Math.max(0, cy - 1); y <= Math.min(GRID_H - 1, cy + 1); y++) {
      for (let x = Math.max(0, cx - 1); x <= Math.min(GRID_W - 1, cx + 1); x++) {
        const cell = cellIndex(x, y);
        forEachInCell(world, cell, (s) => {
          if (s === i || c.alive[s] !== 1) return;
          if (!preyAllowed(world, sp, s)) return;
          if (cls !== null && !pairPermitted(world, own, cell, cls, classOf(world, s))) return;
          const d = (c.x[s]! - px) ** 2 + (c.y[s]! - py) ** 2;
          if (d > reach2) return;
          const b = c.birthId[s]!;
          if (d < bestD || (d === bestD && b < bestBirth)) {
            best = s;
            bestD = d;
            bestBirth = b;
          }
        });
      }
    }
    if (best < 0) continue;
    if (handler) {
      const need = handlingNeedOf(world, sp, best);
      if (need > 0) {
        // The start tick is the first contact tick; only a need of one tick or less completes at once.
        anyAttempt = true;
        startAttempt(world, i, best, need);
        if (c.handlingProgress[i]! < need - HANDLING_EPS) continue;
      }
    }
    claim(world, i, best);
    anyClaim = true;
  }
  if (!anyClaim) {
    if (anyAttempt) endTakenAttempts(world, handlers!);
    return;
  }
  // 2–3. Resolve and commit in ascending predator slot order.
  for (let i = 0; i < hw; i++) {
    const prey = claimOf[i]!;
    if (prey < 0 || bestClaimant[prey] !== i) continue;
    if (c.alive[prey] !== 1 || c.alive[i] !== 1) continue;
    if (handlers === null || !(c.handlingNeed[i]! > 0)) {
      consumePrey(world, i, prey);
      continue;
    }
    // A completed handling attempt: the capture event names the need it took; no break event.
    consumePrey(world, i, prey, c.handlingNeed[i]);
    endAttempt(world, i, 'capture');
  }
  if (anyAttempt) endTakenAttempts(world, handlers!);
}

/**
 * Register predator `i`'s claim on `prey` with its seeded priority det(seed, 'contact', tick, KIND_ATTACK,
 * birthId) (SPEC §3.2 row 5): the highest priority wins, then the lower birthId. Instant claims and
 * completing handling attempts share this one pool, so no prey is claimed twice.
 */
function claim(world: World, i: number, prey: number): void {
  const c = world.ents.cols;
  claimOf[i] = prey;
  const pri = det(world.seed, STREAMS.contact, world.tick, KIND_ATTACK, c.birthId[i]!);
  if (bestClaimant[prey]! < 0 || pri > bestPriority[prey]! || (pri === bestPriority[prey]! && c.birthId[i]! < c.birthId[bestClaimant[prey]!]!)) {
    bestClaimant[prey] = i;
    bestPriority[prey] = pri;
  }
}

/**
 * An Active, hungry handler with an open attempt (handling.ts): its target must still be there (a valid
 * reference to a living organism it may take), within its capture reach on positions after stage 4, and
 * not behind an edge refusing either class. Then the attempt gains DT and returns true when it completes
 * (progress ≥ need − EPS); otherwise the attempt ends ('target', or 'contact' when only too far) and no
 * new attempt starts this tick.
 */
function continueAttempt(world: World, i: number, sp: SpeciesRT, reach2: number, edgesOn: boolean): boolean {
  const e = world.ents;
  const c = e.cols;
  const t = c.preySlot[i]!;
  if (t < 0 || !e.refValid(t, c.preyBirthId[i]!) || !preyAllowed(world, sp, t)) {
    endAttempt(world, i, 'target');
    return false;
  }
  const px = c.x[i]!;
  const py = c.y[i]!;
  const d = (c.x[t]! - px) ** 2 + (c.y[t]! - py) ** 2;
  if (d > reach2) {
    endAttempt(world, i, 'contact');
    return false;
  }
  // Within reach (≤ 1 cell), so the two cells are neighbours and pairPermitted applies.
  if (edgesOn && !pairPermitted(world, cellIndex(Math.floor(px), Math.floor(py)), entityCell(c.x[t]!, c.y[t]!), classOf(world, i), classOf(world, t))) {
    endAttempt(world, i, 'target');
    return false;
  }
  c.handlingProgress[i]! += DT;
  return c.handlingProgress[i]! >= c.handlingNeed[i]! - HANDLING_EPS;
}

/**
 * After the commits: an open attempt that did not end in a capture this stage and whose target is gone, or
 * that completed without winning its target, ends as 'taken' (another claimant won the prey): the loser of
 * a simultaneous completion keeps no progress and gets no cooldown (D02 383).
 */
function endTakenAttempts(world: World, handlers: Uint8Array): void {
  const e = world.ents;
  const c = e.cols;
  for (let i = 0; i < e.highWater; i++) {
    if (c.alive[i] !== 1 || !(c.handlingNeed[i]! > 0) || handlers[c.species[i]!] !== 1) continue;
    if (!e.refValid(c.preySlot[i]!, c.preyBirthId[i]!) || c.handlingProgress[i]! >= c.handlingNeed[i]! - HANDLING_EPS) endAttempt(world, i, 'taken');
  }
}

/** Transfer a captured prey into the predator's meal and remove the prey exactly once. */
export function consumePrey(world: World, pred: number, prey: number, handled = 0): void {
  const c = world.ents.cols;
  const prof = profileOf(world, pred);
  const sp = world.species[c.species[pred]!]!;
  const cell = entityCell(c.x[prey]!, c.y[prey]!);
  const det = world.fields.detritus!;
  const detN = world.fields.detritusN!;
  const B = c.B[prey]!;
  const N = c.N[prey]!;
  const cap = MEAL_CAP_MULTIPLE * prof.b0;
  const space = Math.max(0, cap - c.mealC[pred]!);
  const take = Math.min(B, space);
  const takeN = B > 0 ? (N * take) / B : 0;
  c.mealC[pred]! += take;
  c.mealN[pred]! += takeN;
  // Overflow body and any meal the prey held become detritus separately.
  det[cell]! += B - take + c.mealC[prey]!;
  detN[cell]! += N - takeN + c.mealN[prey]!;
  const mineral = c.boundMineral[prey]! + c.jacketMineral[prey]!;
  if (mineral > 0) world.fields.grit![cell]! += mineral;
  world.ledger.energy.other += c.E[prey]!; // prey energy is discarded
  c.attackCooldown[pred] = sp.def.attackCooldown;
  c.preySlot[pred] = -1;
  c.preyBirthId[pred] = 0;
  emit(world.events, world.counters, {
    tick: world.tick,
    type: 'capture',
    species: c.species[pred]!,
    birthId: c.birthId[pred]!,
    cell,
    amount: take,
    // A handled capture (handling.ts) also names the seconds of contact it needed; every other capture
    // event is unchanged.
    detail: handled > 0 ? { prey: c.birthId[prey]!, preySpecies: c.species[prey]!, handled } : { prey: c.birthId[prey]!, preySpecies: c.species[prey]! },
  });
  emit(world.events, world.counters, {
    tick: world.tick,
    type: 'death',
    species: c.species[prey]!,
    birthId: c.birthId[prey]!,
    cell,
    cause: R.DEATH_PREDATION,
    detail: { predator: c.birthId[pred]! },
  });
  recordDeath(world.lineage, c.birthId[prey]!, world.tick, R.DEATH_PREDATION);
  onDeath(world, prey);
  releaseTrapOnRemoval(world, prey, true); // Phase 5 wave 13 (traps.ts): a trap pair either end of which leaves
  releaseHostPair(world, prey); // SPEC §6.8, §7.4: an attached parasite is released alive
  const preySp = c.species[prey]!;
  world.history.pendingDeaths[preySp] = (world.history.pendingDeaths[preySp] ?? 0) + 1;
  severOnRemoval(world, prey); // E12: its colony partners start their relink lockout (adhesion.ts)
  removeAllLinks(world, prey); // SPEC §6.8: incident links leave both endpoints
  world.ents.free(prey);
  markField(world, 'detritus');
}
