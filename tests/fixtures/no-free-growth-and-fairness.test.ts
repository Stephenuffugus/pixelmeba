/**
 * G0 fixture: no free growth (zero compatible food/CO2 or zero required nutrient ⇒ no new biomass;
 * energy and health decline as specified). The G0 fair-shared-food fixture now lives with the G1
 * finite-feeding fixture in finite-feeding.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { DT, MOVE_COST_PER_CELL, STARVATION_DAMAGE } from '../../src/sim/constants';
import { cellIndex } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
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
