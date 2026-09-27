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
 */
import { CONTACT_DISTANCE, GRID_H, GRID_W, MEAL_CAP_MULTIPLE } from './constants';
import { emit } from './events';
import { cellIndex } from './grid';
import { recordDeath } from './lineage';
import { onDeath } from './branches';
import { hungryPredator, preyAllowed } from './movement';
import { profileOf } from './profiles';
import { R } from './reasons';
import { det, STREAMS } from './rng';
import { entityCell, forEachInCell } from './spatial';
import { markField } from './transport';
import type { World } from './world';

const KIND_ATTACK = 1;

const claimOf = new Int32Array(6000);
const bestClaimant = new Int32Array(6000);
const bestPriority = new Float64Array(6000);

export function stageContacts(world: World): void {
  const e = world.ents;
  const c = e.cols;
  const hw = e.highWater;
  const contact2 = CONTACT_DISTANCE * CONTACT_DISTANCE;
  let anyClaim = false;
  for (let i = 0; i < hw; i++) {
    claimOf[i] = -1;
    bestClaimant[i] = -1;
  }
  // 1. Claims.
  for (let i = 0; i < hw; i++) {
    if (c.alive[i] !== 1 || c.lifeState[i] !== 0) continue;
    const sp = world.species[c.species[i]!]!;
    if (!sp.isPredator) continue;
    const prof = profileOf(world, i);
    if (!hungryPredator(world, i, prof)) continue;
    if (c.attackCooldown[i]! > 0) continue;
    const px = c.x[i]!;
    const py = c.y[i]!;
    const cx = Math.floor(px);
    const cy = Math.floor(py);
    let best = -1;
    let bestD = Infinity;
    let bestBirth = Infinity;
    for (let y = Math.max(0, cy - 1); y <= Math.min(GRID_H - 1, cy + 1); y++) {
      for (let x = Math.max(0, cx - 1); x <= Math.min(GRID_W - 1, cx + 1); x++) {
        forEachInCell(world, cellIndex(x, y), (s) => {
          if (s === i || c.alive[s] !== 1) return;
          if (!preyAllowed(world, sp, s)) return;
          const d = (c.x[s]! - px) ** 2 + (c.y[s]! - py) ** 2;
          if (d > contact2) return;
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
    claimOf[i] = best;
    anyClaim = true;
    const pri = det(world.seed, STREAMS.contact, world.tick, KIND_ATTACK, c.birthId[i]!);
    if (bestClaimant[best]! < 0 || pri > bestPriority[best]! || (pri === bestPriority[best]! && c.birthId[i]! < c.birthId[bestClaimant[best]!]!)) {
      bestClaimant[best] = i;
      bestPriority[best] = pri;
    }
  }
  if (!anyClaim) return;
  // 2–3. Resolve and commit in ascending predator slot order.
  for (let i = 0; i < hw; i++) {
    const prey = claimOf[i]!;
    if (prey < 0 || bestClaimant[prey] !== i) continue;
    if (c.alive[prey] !== 1 || c.alive[i] !== 1) continue;
    consumePrey(world, i, prey);
  }
}

/** Transfer a captured prey into the predator's meal and remove the prey exactly once. */
export function consumePrey(world: World, pred: number, prey: number): void {
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
    detail: { prey: c.birthId[prey]!, preySpecies: c.species[prey]! },
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
  const preySp = c.species[prey]!;
  world.history.pendingDeaths[preySp] = (world.history.pendingDeaths[preySp] ?? 0) + 1;
  world.ents.free(prey);
  markField(world, 'detritus');
}
