/**
 * G0 fixtures: no free growth (zero compatible food/CO2 or zero required nutrient ⇒ no new biomass;
 * energy and health decline as specified) and fair shared food (identical organisms sharing a cell
 * receive equal proportional allocations; insertion order never decides the winner).
 */
import { describe, expect, it } from 'vitest';
import { DT, MOVE_COST_PER_CELL, STARVATION_DAMAGE } from '../../src/sim/constants';
import { cellIndex } from '../../src/sim/grid';
import { stageIntake } from '../../src/sim/intake';
import { checkLedger } from '../../src/sim/ledger';
import { stageSenseAndMove } from '../../src/sim/movement';
import { rebuildIndex } from '../../src/sim/spatial';
import { run } from '../../src/sim/tick';
import { clearWater, place, setField, fillField } from '../helpers/world';

const CELL = cellIndex(64, 64);

describe('G0 no free growth', () => {
  it('without food a Sprinter never gains biomass; energy falls by maintenance and movement; then health falls at 4/s', () => {
    const w = clearWater();
    const s = place(w, 'B01', 64.5, 64.5, { E: 1 });
    const c = w.ents.cols;
    const B0 = c.B[s]!;
    let prevE = c.E[s]!;
    for (let t = 0; t < 30; t++) {
      run(w, 1);
      expect(c.B[s]).toBe(B0);
      const expectedDrop = 0.5 * DT + MOVE_COST_PER_CELL * c.movedThisTick[s]!;
      expect(c.E[s]).toBeCloseTo(Math.max(0, prevE - expectedDrop), 12);
      prevE = c.E[s]!;
    }
    expect(c.E[s]).toBe(0);
    const H = c.H[s]!;
    run(w, 10);
    expect(c.H[s]).toBeCloseTo(H - STARVATION_DAMAGE * DT * 10, 9);
  });

  it('without free or bound nutrient, abundant sugar produces no biomass', () => {
    const w = clearWater();
    fillField(w, 'nutrient', 0);
    setField(w, 'sugar', CELL, 10);
    const s = place(w, 'B01', 64.5, 64.5);
    run(w, 100);
    expect(w.ents.cols.B[s]).toBe(1);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('division splits the existing budget and never creates biomass', () => {
    const w = clearWater();
    setField(w, 'sugar', CELL, 2);
    const s = place(w, 'B01', 64.5, 64.5, { B: 1.99, N: 0.199, E: 95, age: 30 });
    run(w, 50);
    expect(w.events.totals.birth ?? 0).toBeGreaterThan(0);
    expect(checkLedger(w).ok).toBe(true);
    void s;
  });
});

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
