/**
 * Spatial index (ARCH §5): per-cell singly linked lists of entity slots in ascending slot order,
 * plus per-cell load Σ B / ancestral B0 (SPEC §6.4 soft capacity).
 */
import { GRID_W } from './constants';
import type { World } from './world';

export function entityCell(x: number, y: number): number {
  return Math.floor(y) * GRID_W + Math.floor(x);
}

export function rebuildIndex(world: World): void {
  const d = world.derived;
  d.cellHead.fill(-1);
  d.cellLoad.fill(0);
  const e = world.ents;
  const c = e.cols;
  // Insert descending so each cell list ends up ascending.
  for (let i = e.highWater - 1; i >= 0; i--) {
    if (c.alive[i] !== 1) {
      d.nextInCell[i] = -1;
      continue;
    }
    const cell = entityCell(c.x[i]!, c.y[i]!);
    d.nextInCell[i] = d.cellHead[cell]!;
    d.cellHead[cell] = i;
    const sp = world.species[c.species[i]!]!;
    d.cellLoad[cell]! += c.B[i]! / sp.def.b0;
  }
}

/** Visit residents of a cell in ascending slot order. Return true from fn to stop early. */
export function forEachInCell(world: World, cell: number, fn: (slot: number) => boolean | void): void {
  const d = world.derived;
  for (let s = d.cellHead[cell]!; s >= 0; s = d.nextInCell[s]!) {
    if (fn(s) === true) return;
  }
}
