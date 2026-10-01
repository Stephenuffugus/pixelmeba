/**
 * P04 Siltworm's SEDIMENT_WATER_CROSSING (SPEC §6.4 last bullet; CT §1.3 "sediment (+ ≤ 2 water
 * cells)"; D-0007; P3.4).
 *
 * A crosser lives in its recorded habitats (P04: sediment). From there it may enter up to
 * MAX_WATER_CELLS consecutive open water cells: while crossing they are passable and count as
 * habitat-compatible (stage 4 suitability uses `crossingCompatible`, so a crossing worm sees no
 * SUIT_HABITAT and takes no stress damage). A third water cell is refused, both as a decision
 * candidate and in the edge-checked trace. "Otherwise turns back": from its second water cell the
 * worm may step back into the water cell it came from (its count drops to 1), so a worm that met
 * more water than it may cross can always return to its habitat.
 *
 * The entity column `waterCrossed` (world schema 4) holds the crossing state: bits 0–1 the number of
 * consecutive water cells entered (0, 1 or 2; `waterCount`), bits 2–4 the direction of the step into
 * the current water cell (STEP_*), so a step back is recognised. It is 0 on the worm's habitat (the
 * column's empty value), and resets to 0 as soon as the worm is back on a compatible cell.
 *
 * Only movement uses this rule. `canOccupy`/`habitatCompatible` stay the record's habitats, so
 * inoculation, births and the Life brush keep refusing water for P04.
 *
 * Gating: the rule reads the species' own recorded abilities, so it applies only to organisms that
 * carry it (no g2 world holds one); `waterCrossed` stays 0 everywhere else and the column stays
 * hash-neutral.
 */
import { SUB_WATER, ST_NONE } from './grid';
import type { Profile } from './phenotype';
import type { SpeciesRT } from './species';
import { habitatCompatible, suitabilityAt, type SuitResult } from './suitability';
import type { World } from './world';

/** Consecutive open water cells a crosser may enter from its habitat (CT §1.3). */
export const MAX_WATER_CELLS = 2;

/** Directions of one grid step (the trace moves between four-neighbours only). */
export const STEP_E = 0;
export const STEP_S = 1;
export const STEP_W = 2;
export const STEP_N = 3;
/** No step to go back along (a worm stranded in water: it may only step onto its habitat). */
const STEP_NONE = 4;

const COUNT_MASK = 3;

function stateOf(count: number, dir: number): number {
  return count === 0 ? 0 : count | (dir << 2);
}

/** Consecutive water cells in a crossing state (the `waterCrossed` column). */
export function waterCount(state: number): number {
  return state & COUNT_MASK;
}

/** Whether the species carries the sediment/water crossing ability in its record. */
export function crossesWater(sp: SpeciesRT): boolean {
  return sp.abilities.includes('SEDIMENT_WATER_CROSSING');
}

/** An open water cell (no structure): the only kind of cell a crossing may use. */
export function crossableWater(world: World, cell: number): boolean {
  return world.grid.structure[cell] === ST_NONE && world.grid.substrate[cell] === SUB_WATER;
}

/**
 * The crossing state after a crosser in `state` steps into `cell` in direction `dir` (STEP_*), or −1
 * when the cell is refused: a habitat-compatible cell resets the state to 0; an open water cell adds
 * one to the count while it stays ≤ MAX_WATER_CELLS; from the last allowed water cell, a step back
 * the way it came returns to the previous water cell with count 1; anything else is refused.
 */
export function enterCell(world: World, sp: SpeciesRT, cell: number, state: number, dir: number): number {
  if (habitatCompatible(world, sp, cell)) return 0;
  if (!crossableWater(world, cell)) return -1;
  const count = state & COUNT_MASK;
  if (count < MAX_WATER_CELLS) return stateOf(count + 1, dir);
  const came = state >> 2;
  return came !== STEP_NONE && dir === ((came + 2) & 3) ? stateOf(MAX_WATER_CELLS - 1, dir) : -1;
}

/**
 * Whether the organism in `slot` is crossing in open water: a crosser on an open water cell with
 * 1 … MAX_WATER_CELLS recorded water cells. A crosser that finds itself in water without having
 * entered it from its habitat (water painted under it) is not crossing.
 */
export function isCrossing(world: World, slot: number, sp: SpeciesRT, cell: number): boolean {
  if (!crossesWater(sp) || !crossableWater(world, cell)) return false;
  const n = waterCount(world.ents.cols.waterCrossed[slot]!);
  return n >= 1 && n <= MAX_WATER_CELLS;
}

/** Entity-aware habitat check: the record's habitat, or open water while crossing. */
export function crossingCompatible(world: World, slot: number, sp: SpeciesRT, cell: number): boolean {
  return habitatCompatible(world, sp, cell) || isCrossing(world, slot, sp, cell);
}

/**
 * The crossing state a crosser's trace starts from at its current cell: 0 on a compatible cell, its
 * recorded state while crossing, and "count 2, no way back" when stranded in water (so it may only
 * step onto a compatible cell).
 */
export function startCount(world: World, slot: number, sp: SpeciesRT, cell: number): number {
  if (habitatCompatible(world, sp, cell)) return 0;
  return isCrossing(world, slot, sp, cell) ? world.ents.cols.waterCrossed[slot]! : stateOf(MAX_WATER_CELLS, STEP_NONE);
}

/**
 * Suitability of the organism in `slot` at `cell` as stage 4 computes it (and the inspector shows
 * it): for a crosser the habitat factor is `crossingCompatible`; every other species gets exactly
 * suitabilityAt. Returns suitabilityAt's shared result object.
 */
export function entitySuitabilityAt(world: World, slot: number, sp: SpeciesRT, prof: Profile, cell: number): SuitResult {
  if (!crossesWater(sp)) return suitabilityAt(world, sp, prof, cell);
  return suitabilityAt(world, sp, prof, cell, crossingCompatible(world, slot, sp, cell));
}
