/**
 * E04 Surface anchor (SPEC §9 E04, §9.19; CT §7.1, §12.6; D04 §2 C06; BUILD_DIRECTIVE P3.7).
 *
 * State lives in entity columns (schema 4, D-0035): `anchorState` (0 free, 1 anchored),
 * `anchorSeconds` (continuous qualifying seconds while free), `anchorLockout` (seconds left before it
 * may attach again). Every number comes from the world's recorded E04 definition (Profile.anchor).
 *
 *  - Support: a four-neighbour cell holding a stone, a wall or a porous bead (grid.structure ST_STONE,
 *    ST_WALL, ST_BEAD), or the dish rim (a neighbour outside the dish, ST_OUTSIDE; PROPOSED owner
 *    decision: SPEC §2.1 makes the rim a solid edge). Gel and sediment are substrates, not support;
 *    mesh is Phase 5.
 *  - Attach: an Active carrier out of lockout with E above minEnergy (35), four-adjacent to support,
 *    accumulates anchorSeconds; on the tick it reaches attachSeconds (5 s = the 50th continuous tick)
 *    it anchors. A tick without support, at E ≤ 35, in lockout or not Active resets the clock.
 *  - Anchored: no self-propulsion and no movement cost (movement.ts skips it through `isAnchored`),
 *    attachedUpkeep (0.10 E/s) charged in stage 7 under 'upkeep' (`anchorUpkeepPerSecond`); feeding
 *    and predation are ordinary. FLAG.attached is never set, so an anchored carrier stays "free" for
 *    the CT §3.2 prey rules (PROPOSED owner decision) and keeps its transport class.
 *  - Detach: no usable intake for detachNoIntakeSeconds (10 s, the D-0035 clock), support gone (an
 *    erased stone), E below detachEnergy (15), or Resting (D04 C06: resting overrides and releases
 *    it). Every detach starts the lockoutSeconds (10 s) reattach lockout. A woken organism attaches
 *    again through the same 5 s clock.
 *  - Division (SPEC §9.19): both daughters start unanchored with fresh clocks (`onAnchorDivision`;
 *    the new slot is allocated cleared).
 *  - Non-motile carriers (Y01, Y02) anchor as a state and pay the upkeep; their movement is unchanged.
 *
 * Runs from stage 8's release hook (actions.ts releaseInvalidLinks) for every living organism, Active
 * or not, after dormancy transitions and after the usable-intake clock (intakeClock.ts). Only E04
 * carriers are touched, so worlds without the module never write these columns. No randomness.
 */
import { DT } from './constants';
import { LIFE_ACTIVE, LIFE_RESTING } from './entities';
import { cellIndex, inBounds, ST_BEAD, ST_OUTSIDE, ST_STONE, ST_WALL } from './grid';
import type { Profile } from './phenotype';
import type { World } from './world';

/** Timer comparisons tolerate float accumulation of dt (0.1 is not exact in binary). */
const EPS = 1e-9;

/** Structures an anchor can hold on to (SPEC §9 E04 "solid substrate or mesh"; mesh is Phase 5). */
function isSupport(structure: number): boolean {
  return structure === ST_STONE || structure === ST_WALL || structure === ST_BEAD || structure === ST_OUTSIDE;
}

/** Four-neighbour offsets N, E, S, W. */
const NEIGHBOR_DX: readonly number[] = [0, 1, 0, -1];
const NEIGHBOR_DY: readonly number[] = [-1, 0, 1, 0];

/** Whether the organism's cell has a four-neighbour that offers support (a cell beyond the grid is rim). */
export function anchorSupported(world: World, i: number): boolean {
  const c = world.ents.cols;
  const x = Math.floor(c.x[i]!);
  const y = Math.floor(c.y[i]!);
  const st = world.grid.structure;
  for (let k = 0; k < 4; k++) {
    const nx = x + NEIGHBOR_DX[k]!;
    const ny = y + NEIGHBOR_DY[k]!;
    if (!inBounds(nx, ny)) return true;
    if (isSupport(st[cellIndex(nx, ny)]!)) return true;
  }
  return false;
}

/** Whether this organism is anchored right now (movement.ts: no self-propulsion while anchored). */
export function isAnchored(world: World, i: number): boolean {
  return world.ents.cols.anchorState[i] === 1;
}

/** E04 attached upkeep, energy per second, that stage 7 charges this tick (0 unless anchored). */
export function anchorUpkeepPerSecond(world: World, i: number, prof: Profile): number {
  const rules = prof.anchor;
  if (rules === null || world.ents.cols.anchorState[i] !== 1) return 0;
  return rules.attachedUpkeep;
}

/** Let go of the support and start the reattach lockout. */
function detach(world: World, i: number, prof: Profile): void {
  const c = world.ents.cols;
  c.anchorState[i] = 0;
  c.anchorSeconds[i] = 0;
  c.anchorLockout[i] = prof.anchor!.lockoutSeconds;
}

/**
 * One tick of the E04 state machine for one living organism (stage 8 release hook; after dormancy
 * and the usable-intake clock). A no-op for organisms that do not carry E04.
 */
export function anchorStep(world: World, i: number, prof: Profile): void {
  const rules = prof.anchor;
  if (rules === null) return;
  const c = world.ents.cols;
  // The lockout counts down in every state.
  if (c.anchorLockout[i]! > 0) {
    const left = c.anchorLockout[i]! - DT;
    c.anchorLockout[i] = left > EPS ? left : 0;
  }
  if (c.anchorState[i] === 1) {
    if (
      c.lifeState[i] === LIFE_RESTING ||
      c.noUsableIntakeSeconds[i]! >= rules.detachNoIntakeSeconds - EPS ||
      !anchorSupported(world, i) ||
      c.E[i]! < rules.detachEnergy
    ) {
      detach(world, i, prof);
    }
    return;
  }
  if (c.lifeState[i] !== LIFE_ACTIVE || c.anchorLockout[i]! > 0 || !(c.E[i]! > rules.minEnergy) || !anchorSupported(world, i)) {
    c.anchorSeconds[i] = 0;
    return;
  }
  const held = c.anchorSeconds[i]! + DT;
  if (held >= rules.attachSeconds - EPS) {
    c.anchorState[i] = 1;
    c.anchorSeconds[i] = 0;
  } else {
    c.anchorSeconds[i] = held;
  }
}

/** Birth reconciliation (SPEC §9.19 "E04 attachment resets"): the retained daughter starts unanchored. */
export function onAnchorDivision(world: World, i: number): void {
  const c = world.ents.cols;
  c.anchorState[i] = 0;
  c.anchorSeconds[i] = 0;
  c.anchorLockout[i] = 0;
  c.noUsableIntakeSeconds[i] = 0;
}
