/**
 * G0 fixture: fair shared food. Identical organisms drawing on one scarce pool get equal shares
 * within numeric tolerance, whatever order they were created in (SPEC §6.4 proportional allocation).
 */
import { describe, expect, it } from 'vitest';
import { cellIndex } from '../../src/sim/grid';
import { stageIntake } from '../../src/sim/intake';
import { stageSenseAndMove } from '../../src/sim/movement';
import { rebuildIndex } from '../../src/sim/spatial';
import { clearWater, place, setField } from '../helpers/world';

const CELL = cellIndex(64, 64);

describe('G0 fair shared food', () => {
  function allocationWith(order: number[]): number[] {
    const w = clearWater();
    setField(w, 'sugar', CELL, 0.004);
    const slots: number[] = [];
    // Eight identical organisms (the soft capacity) so their requests exceed the scarce pool and
    // proportional scaling engages; the insertion order is permuted between runs.
    const xs = [64.1, 64.2, 64.3, 64.4, 64.5, 64.6, 64.7, 64.8];
    for (const k of order) slots[k] = place(w, 'B01', xs[k]!, 64.5);
    stageSenseAndMove(w);
    for (const s of slots) {
      w.ents.cols.x[s] = 64.5;
      w.ents.cols.y[s] = 64.5;
      w.ents.cols.suitability[s] = 1;
    }
    rebuildIndex(w);
    stageIntake(w);
    return slots.map((s) => w.ents.cols.B[s]! - 1);
  }

  it('equal allocations within numeric tolerance, independent of insertion order', () => {
    const a = allocationWith([0, 1, 2, 3, 4, 5, 6, 7]);
    const b = allocationWith([7, 4, 2, 0, 6, 3, 1, 5]);
    for (const gain of [...a, ...b]) {
      expect(gain).toBeGreaterThan(0);
      expect(gain).toBeCloseTo(a[0]!, 12);
    }
    // Requests (8 × 0.018 × avail(0.004) ≈ 0.0055) exceed the 0.004 pool, so it is shared out
    // completely: total biomass gained = 0.5 × 0.004.
    expect(a.reduce((x, y) => x + y, 0)).toBeCloseTo(0.002, 12);
  });
});
