/**
 * E12 Colony adhesion (SPEC §3.2 rows 5, 7, 8, §6.8, §9 E12, §9.19; CT §7.1, §7.2, §12.6; R17;
 * D04 §6 "E12 Colony adhesion", §13; BUILD_DIRECTIVE P3.7).
 *
 * State lives in entity columns (schema 4, D-0035, D-0043): the adhesion link positions aLink0..1 /
 * aLinkB0..1 (links.ts), `adhPartner` (birthId of the neighbour this organism is timing, 0 none),
 * `adhSeconds` (continuous seconds that neighbour has stayed in reach) and `adhLockout` (seconds left
 * before it may link again). Every number comes from the world's recorded E12 definition
 * (`world.modules.E12`), so a world whose manifest does not enable E12 never runs any of this.
 *
 *  - Pairing (stage 5, after predation, parasite attachment and infection; `formAdhesionLinks`). An
 *    organism may pair while it carries E12, is Active, free (not FLAG.attached and not E04-anchored;
 *    PROPOSED decision), has E ≥ minEnergy (20), is out of lockout and has fewer than maxLinks (2)
 *    links (PROPOSED decision: a full member does not look for more). Each such organism times its
 *    lowest-birthId neighbour that is also able to pair, of the same ancestor (species), whose centre
 *    is within linkDistance (0.5 cells) and that it is not already linked to. The clock adds dt per
 *    tick and restarts when that neighbour changes or leaves reach; it reaches linkSeconds (5 s) on the
 *    50th continuous tick.
 *  - Linking: every organism whose clock reached linkSeconds proposes the pair (itself, its
 *    neighbour); pairs are resolved greedily in ascending (lower birthId, higher birthId) order. A pair
 *    whose ends can no longer pair is dropped silently; one that would give an end a third link or a
 *    colony (adhesionComponent) more than maxComponent (8) members is refused with a 'linkRefused'
 *    event and costs nothing; otherwise both ends pay linkCost (2 E) once, ledgered as energy 'other'
 *    (PROPOSED decision), and a 'linkFormed' event is emitted. Both ends' clocks restart either way.
 *    No randomness is drawn (contact kind 4 stays reserved for E12 and is never used here).
 *  - Linked: no self-propulsion (movement.ts `adhesionLinked`); perLinkUpkeep (0.01 E/s) per incident
 *    link in stage 7 as 'upkeep' (`adhesionUpkeepPerSecond`). Links convey nothing (R17: sharing needs
 *    E15 on both ends, Phase 7).
 *  - Severance in stage 8's release hook (`adhesionRelease`, after the usable-intake clock): an
 *    organism severs all its links on module loss, when not Active (dormancy), after
 *    severNoIntakeSeconds (10 s) without usable intake (D-0035 clock) or below severEnergy (15); any
 *    link whose ends are more than severDistance (0.75 cells) apart breaks. Death and capture
 *    (`severOnRemoval` before removeAllLinks) and division (`onAdhesionDivision`, births.ts) remove
 *    incident links too. Every severed survivor gets the lockoutSeconds (10 s) relink lockout; the
 *    lockout counts down in stage 5 after the pairing check, so it blocks exactly 100 ticks.
 *  - Sampling takes whole colonies (sample.ts); there are no prohibited edges or gates before Phase 5.
 *
 * Every path leaves links symmetric and valid at the end of the tick (links.ts linksValid).
 */
import { DT, GRID_H, GRID_W } from './constants';
import { FLAG, LIFE_ACTIVE } from './entities';
import { emit } from './events';
import { cellIndex } from './grid';
import { addAdhesionLink, adhesionComponent, adhesionDegree, adhesionNeighbors, removeAdhesionLink } from './links';
import type { Profile } from './phenotype';
import { profileOf } from './profiles';
import { forEachInCell } from './spatial';
import type { World } from './world';

/** Timer comparisons tolerate float accumulation of dt (0.1 is not exact in binary). */
const EPS = 1e-9;

export const ADHESION_MODULE = 'E12';

/** The recorded E12 numbers (CT §12.6). */
export interface AdhesionRules {
  readonly linkDistance: number;
  readonly linkSeconds: number;
  readonly minEnergy: number;
  readonly linkCost: number;
  readonly maxLinks: number;
  readonly maxComponent: number;
  readonly perLinkUpkeep: number;
  readonly severNoIntakeSeconds: number;
  readonly severEnergy: number;
  readonly severDistance: number;
  readonly lockoutSeconds: number;
}

/** Why a link ended (event detail.cause) or was refused (detail.reason). */
export type AdhesionBreakCause = 'moduleLoss' | 'dormancy' | 'noIntake' | 'energy' | 'separation' | 'death' | 'division';

/** The world's recorded E12 rules, or null when its manifest does not enable E12. */
export function adhesionRules(world: World): AdhesionRules | null {
  const mod = world.modules[ADHESION_MODULE];
  if (mod === undefined) return null;
  const p = mod.params;
  const need = (k: keyof AdhesionRules): number => {
    const v = p[k];
    if (v === undefined) throw new Error(`E12: recorded parameter ${k} is missing`);
    return v;
  };
  return {
    linkDistance: need('linkDistance'),
    linkSeconds: need('linkSeconds'),
    minEnergy: need('minEnergy'),
    linkCost: need('linkCost'),
    maxLinks: need('maxLinks'),
    maxComponent: need('maxComponent'),
    perLinkUpkeep: need('perLinkUpkeep'),
    severNoIntakeSeconds: need('severNoIntakeSeconds'),
    severEnergy: need('severEnergy'),
    severDistance: need('severDistance'),
    lockoutSeconds: need('lockoutSeconds'),
  };
}

function carries(prof: Profile): boolean {
  return prof.modules.includes(ADHESION_MODULE);
}

/** Whether any adhesion position of `i` is set (links are always valid at stage boundaries). */
function hasAdhesion(world: World, i: number): boolean {
  const c = world.ents.cols;
  return c.aLink0[i] !== -1 || c.aLink1[i] !== -1;
}

/** Whether `i` holds at least one valid adhesion link (movement.ts: a linked member does not self-propel). */
export function adhesionLinked(world: World, i: number): boolean {
  if (!hasAdhesion(world, i)) return false;
  const c = world.ents.cols;
  const e = world.ents;
  return (c.aLink0[i]! >= 0 && e.refValid(c.aLink0[i]!, c.aLinkB0[i]!)) || (c.aLink1[i]! >= 0 && e.refValid(c.aLink1[i]!, c.aLinkB1[i]!));
}

/** E12 link upkeep, energy per second, that stage 7 charges this tick: perLinkUpkeep × incident links. */
export function adhesionUpkeepPerSecond(world: World, i: number, prof: Profile): number {
  if (!carries(prof) || !hasAdhesion(world, i)) return 0;
  const rules = adhesionRules(world);
  if (rules === null) return 0;
  return rules.perLinkUpkeep * adhesionDegree(world, i);
}

function resetClock(world: World, i: number): void {
  world.ents.cols.adhPartner[i] = 0;
  world.ents.cols.adhSeconds[i] = 0;
}

function distance(world: World, a: number, b: number): number {
  const c = world.ents.cols;
  return Math.hypot(c.x[a]! - c.x[b]!, c.y[a]! - c.y[b]!);
}

/** Break the link a–b (both alive), start both ends' relink lockout and record it from `a`. */
function breakLink(world: World, a: number, b: number, cause: AdhesionBreakCause, rules: AdhesionRules): void {
  const c = world.ents.cols;
  if (!removeAdhesionLink(world, a, b)) return;
  for (const s of [a, b]) {
    c.adhLockout[s] = rules.lockoutSeconds;
    resetClock(world, s);
  }
  emit(world.events, world.counters, {
    tick: world.tick,
    type: 'linkBroken',
    species: c.species[a]!,
    birthId: c.birthId[a]!,
    detail: { kind: 'adhesion', partner: c.birthId[b]!, cause },
  });
}

/**
 * Remove every adhesion link of `i` because `i` is leaving (death, capture) or dividing: the
 * survivors at the other ends start their relink lockout. `i`'s own clocks are left to its caller.
 */
function severAll(world: World, i: number, cause: AdhesionBreakCause): void {
  if (!hasAdhesion(world, i)) return;
  const rules = adhesionRules(world);
  if (rules === null) return;
  const c = world.ents.cols;
  for (const p of adhesionNeighbors(world, i)) {
    if (!removeAdhesionLink(world, i, p)) continue;
    c.adhLockout[p] = rules.lockoutSeconds;
    resetClock(world, p);
    emit(world.events, world.counters, {
      tick: world.tick,
      type: 'linkBroken',
      species: c.species[i]!,
      birthId: c.birthId[i]!,
      detail: { kind: 'adhesion', partner: c.birthId[p]!, cause },
    });
  }
}

/** Death or capture (maintenance.ts killEntity, contacts.ts consumePrey), before removeAllLinks. */
export function severOnRemoval(world: World, i: number): void {
  severAll(world, i, 'death');
}

/**
 * Birth reconciliation (SPEC §9.19 "Colony links removed; both unlinked"), after rekeyLinks: the
 * retained daughter in slot `i` drops the parent's links (its former partners start their lockout)
 * and starts with fresh pairing state; the new daughter's slot is allocated cleared.
 */
export function onAdhesionDivision(world: World, i: number): void {
  const c = world.ents.cols;
  severAll(world, i, 'division');
  if (c.adhPartner[i] !== 0 || c.adhSeconds[i] !== 0 || c.adhLockout[i] !== 0) {
    resetClock(world, i);
    c.adhLockout[i] = 0;
  }
}

/**
 * Stage 8 release hook (actions.ts releaseInvalidLinks), for every living organism after dormancy
 * transitions and the usable-intake clock: sever on module loss, rest, 10 s without usable intake or
 * E below 15, and break any link pulled more than 0.75 cells apart.
 */
export function adhesionRelease(world: World, i: number, prof: Profile): void {
  if (!hasAdhesion(world, i)) return;
  const rules = adhesionRules(world);
  if (rules === null) return;
  const c = world.ents.cols;
  const partners = adhesionNeighbors(world, i);
  let cause: AdhesionBreakCause | null = null;
  if (!carries(prof)) cause = 'moduleLoss';
  else if (c.lifeState[i] !== LIFE_ACTIVE) cause = 'dormancy';
  else if (c.noUsableIntakeSeconds[i]! >= rules.severNoIntakeSeconds - EPS) cause = 'noIntake';
  else if (c.E[i]! < rules.severEnergy) cause = 'energy';
  for (const p of partners) {
    if (cause !== null) breakLink(world, i, p, cause, rules);
    else if (distance(world, i, p) > rules.severDistance) breakLink(world, i, p, 'separation', rules);
  }
}

// ---- Stage 5: pairing and linking ---------------------------------------------------------------

const canPair = new Uint8Array(6000);

/** Whether living organism `i` may time or take a new link this tick (before the lockout countdown). */
function pairable(world: World, i: number, rules: AdhesionRules): boolean {
  const c = world.ents.cols;
  if (c.lifeState[i] !== LIFE_ACTIVE) return false;
  if ((c.flags[i]! & FLAG.attached) !== 0 || c.anchorState[i] === 1) return false;
  if (!(c.E[i]! >= rules.minEnergy) || c.adhLockout[i]! > 0) return false;
  if (!carries(profileOf(world, i))) return false;
  return adhesionDegree(world, i) < rules.maxLinks;
}

/** Whether a and b hold a link to each other. */
function linkedTo(world: World, a: number, b: number): boolean {
  const c = world.ents.cols;
  const bb = c.birthId[b]!;
  return (c.aLink0[a] === b && c.aLinkB0[a] === bb) || (c.aLink1[a] === b && c.aLinkB1[a] === bb);
}

/**
 * Stage 5 E12 link formation (SPEC §3.2 row 5: after predation, parasite attachment and infection).
 * A no-op unless the world's manifest enables E12.
 */
export function formAdhesionLinks(world: World): void {
  const rules = adhesionRules(world);
  if (rules === null) return;
  const e = world.ents;
  const c = e.cols;
  const hw = e.highWater;
  let any = false;
  // 1. Who may pair this tick; organisms that may not lose their clock.
  for (let i = 0; i < hw; i++) {
    canPair[i] = 0;
    if (c.alive[i] !== 1) continue;
    if (pairable(world, i, rules)) {
      canPair[i] = 1;
      any = true;
    } else if (c.adhPartner[i] !== 0 || c.adhSeconds[i] !== 0) resetClock(world, i);
  }
  // 2. Each times its lowest-birthId neighbour in reach (same ancestor, also pairable, not yet linked).
  const reach2 = rules.linkDistance * rules.linkDistance;
  const pairs: [number, number, number, number][] = [];
  if (any) {
    for (let i = 0; i < hw; i++) {
      if (canPair[i] !== 1) continue;
      const px = c.x[i]!;
      const py = c.y[i]!;
      const sp = c.species[i]!;
      const cx = Math.floor(px);
      const cy = Math.floor(py);
      let best = -1;
      let bestBirth = Infinity;
      for (let y = Math.max(0, cy - 1); y <= Math.min(GRID_H - 1, cy + 1); y++) {
        for (let x = Math.max(0, cx - 1); x <= Math.min(GRID_W - 1, cx + 1); x++) {
          forEachInCell(world, cellIndex(x, y), (s) => {
            if (s === i || c.alive[s] !== 1 || canPair[s] !== 1 || c.species[s] !== sp) return;
            const b = c.birthId[s]!;
            if (b >= bestBirth) return;
            if ((c.x[s]! - px) ** 2 + (c.y[s]! - py) ** 2 > reach2) return;
            if (linkedTo(world, i, s)) return;
            best = s;
            bestBirth = b;
          });
        }
      }
      if (best < 0) {
        resetClock(world, i);
        continue;
      }
      if (c.adhPartner[i] === bestBirth) c.adhSeconds[i]! += DT;
      else {
        c.adhPartner[i] = bestBirth;
        c.adhSeconds[i] = DT;
      }
      if (c.adhSeconds[i]! >= rules.linkSeconds - EPS) {
        const bi = c.birthId[i]!;
        pairs.push(bi < bestBirth ? [bi, bestBirth, i, best] : [bestBirth, bi, best, i]);
      }
    }
  }
  // 3. Resolve the proposed pairs greedily in ascending birthId order.
  if (pairs.length > 0) {
    pairs.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    for (let k = 0; k < pairs.length; k++) {
      const [ba, bb, a, b] = pairs[k]!;
      if (k > 0 && pairs[k - 1]![0] === ba && pairs[k - 1]![1] === bb) continue; // proposed by both ends
      if (!e.refValid(a, ba) || !e.refValid(b, bb) || linkedTo(world, a, b)) continue;
      if (!(c.E[a]! >= rules.minEnergy) || !(c.E[b]! >= rules.minEnergy)) continue; // an earlier link this pass spent it
      resetClock(world, a);
      resetClock(world, b);
      let reason: string | null = null;
      if (adhesionDegree(world, a) >= rules.maxLinks || adhesionDegree(world, b) >= rules.maxLinks) reason = 'links';
      else {
        const ca = adhesionComponent(world, a);
        const size = ca.includes(b) ? ca.length : ca.length + adhesionComponent(world, b).length;
        if (size > rules.maxComponent) reason = 'component';
      }
      if (reason !== null) {
        emit(world.events, world.counters, {
          tick: world.tick,
          type: 'linkRefused',
          species: c.species[a]!,
          birthId: ba,
          detail: { kind: 'adhesion', partner: bb, reason },
        });
        continue;
      }
      if (!addAdhesionLink(world, a, b)) continue;
      c.E[a]! -= rules.linkCost;
      c.E[b]! -= rules.linkCost;
      world.ledger.energy.other += 2 * rules.linkCost;
      emit(world.events, world.counters, {
        tick: world.tick,
        type: 'linkFormed',
        species: c.species[a]!,
        birthId: ba,
        detail: { kind: 'adhesion', partner: bb },
      });
    }
  }
  // 4. Relink lockouts count down after this tick's check (a 10 s lockout blocks exactly 100 ticks).
  for (let i = 0; i < hw; i++) {
    if (c.alive[i] !== 1 || !(c.adhLockout[i]! > 0)) continue;
    const left = c.adhLockout[i]! - DT;
    c.adhLockout[i] = left > EPS ? left : 0;
  }
}
