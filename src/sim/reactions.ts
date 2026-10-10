/**
 * The reaction ledger's per-cell record (SPEC §12.1 cell inspector, §5.3; P3.6).
 *
 * Stage 3 (conversion.ts) calls `recordReaction` once per enzyme rule and cell that converted
 * something this tick. The record keeps, per cell and per enzyme, the carbon converted and the bound
 * nutrient moved during the current whole simulated second and the last complete one.
 *
 * Observation only, like `world.catalysisCells`: the simulation never reads it, it is not hashed and
 * not saved (a loaded or duplicated world starts with an empty record, so its first second reads 0).
 * The arrays are allocated on the first conversion, so worlds without enzymes never pay for them.
 */
import { CELL_COUNT, TICKS_PER_SECOND } from './constants';
import type { World } from './world';

/** Enzyme rules in conversion order (starch → sugar, oil → metabolite, protein → broth). */
export const REACTION_ENZYMES = ['starch', 'oil', 'protein'] as const;
export type ReactionEnzyme = (typeof REACTION_ENZYMES)[number];

/** Two values per enzyme and cell: carbon converted, bound nutrient moved with it. */
const SLOTS = REACTION_ENZYMES.length * 2;

export interface ReactionCells {
  /** The second being accumulated (ticks floor(tick / 10)); −1 before any conversion. */
  accSecond: number;
  /** The second `last` holds; −1 when none. */
  lastSecond: number;
  acc: Float64Array | null;
  last: Float64Array | null;
}

export function createReactionCells(): ReactionCells {
  return { accSecond: -1, lastSecond: -1, acc: null, last: null };
}

function enzymeIndex(enzyme: ReactionEnzyme): number {
  return enzyme === 'starch' ? 0 : enzyme === 'oil' ? 1 : 2;
}

/**
 * Stage 3 recorder: `c` carbon of `enzyme`'s substrate became product in `cell` this tick, moving `n`
 * bound nutrient with it. Called during the tick `world.tick` (before it is incremented).
 */
export function recordReaction(world: World, enzyme: ReactionEnzyme, cell: number, c: number, n: number): void {
  const rc = world.reactionCells;
  const second = Math.floor(world.tick / TICKS_PER_SECOND);
  if (rc.acc === null || rc.last === null) {
    rc.acc = new Float64Array(SLOTS * CELL_COUNT);
    rc.last = new Float64Array(SLOTS * CELL_COUNT);
  }
  if (second !== rc.accSecond) {
    if (rc.accSecond >= 0 && second === rc.accSecond + 1) {
      const t = rc.last;
      rc.last = rc.acc;
      rc.acc = t;
      rc.lastSecond = rc.accSecond;
    } else {
      rc.last.fill(0);
      rc.lastSecond = -1;
    }
    rc.acc.fill(0);
    rc.accSecond = second;
  }
  const base = enzymeIndex(enzyme) * 2 * CELL_COUNT;
  rc.acc[base + cell]! += c;
  rc.acc[base + CELL_COUNT + cell]! += n;
}

/** The last complete simulated second of a world that has run `world.tick` ticks (−1 before the first). */
export function lastCompleteSecond(world: World): number {
  return Math.floor(world.tick / TICKS_PER_SECOND) - 1;
}

/** The record of the last complete second, or null when nothing was converted in it. Pure read. */
function lastSecondArray(world: World): Float64Array | null {
  const rc = world.reactionCells;
  const want = lastCompleteSecond(world);
  if (want < 0) return null;
  if (rc.lastSecond === want) return rc.last;
  if (rc.accSecond === want) return rc.acc;
  return null;
}

export interface ReactionAmount {
  /** Substrate carbon converted (= product carbon made). */
  readonly c: number;
  /** Bound nutrient moved from the substrate to the product (or released free, for oil). */
  readonly n: number;
}

/** Carbon converted and bound nutrient moved by `enzyme` in `cell` during the last complete second. */
export function reactionInCell(world: World, enzyme: ReactionEnzyme, cell: number): ReactionAmount {
  const a = lastSecondArray(world);
  if (a === null) return { c: 0, n: 0 };
  const base = enzymeIndex(enzyme) * 2 * CELL_COUNT;
  return { c: a[base + cell]!, n: a[base + CELL_COUNT + cell]! };
}

/** The same over the whole dish (cells in ascending index order). */
export function reactionInDish(world: World, enzyme: ReactionEnzyme): ReactionAmount {
  const a = lastSecondArray(world);
  if (a === null) return { c: 0, n: 0 };
  const base = enzymeIndex(enzyme) * 2 * CELL_COUNT;
  let c = 0;
  let n = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    c += a[base + i]!;
    n += a[base + CELL_COUNT + i]!;
  }
  return { c, n };
}

/**
 * Carbon every enzyme made accessible in each cell during the last complete second (the food-access
 * overlay with no organism selected). Writes into `out` (length CELL_COUNT); returns the maximum.
 */
export function accessibleCarbonLastSecond(world: World, out: Float32Array): number {
  out.fill(0);
  const a = lastSecondArray(world);
  if (a === null) return 0;
  let max = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    let v = 0;
    for (let e = 0; e < REACTION_ENZYMES.length; e++) v += a[e * 2 * CELL_COUNT + i]!;
    out[i] = v;
    if (v > max) max = v;
  }
  return max;
}
