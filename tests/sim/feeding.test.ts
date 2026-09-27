import { describe, expect, it } from 'vitest';
import { cellIndex } from '../../src/sim/grid';
import { stageIntake } from '../../src/sim/intake';
import { stageSenseAndMove } from '../../src/sim/movement';
import { rebuildIndex } from '../../src/sim/spatial';
import { run } from '../../src/sim/tick';
import { checkLedger } from '../../src/sim/ledger';
import { R } from '../../src/sim/reasons';
import { clearWater, place, aliveOf, setField } from '../helpers/world';

const CELL = cellIndex(64, 64);

describe('stage 6 intake and allocation (P0.6)', () => {
  it('fair shared food: identical organisms in one cell get equal allocations regardless of order', () => {
    const w = clearWater();
    w.fields.sugar![CELL] = 0.01; // scarce: forces proportional scaling
    w.fields.nutrient![CELL] = 1;
    const a = place(w, 'B01', 64.3, 64.3);
    const b = place(w, 'B01', 64.6, 64.6);
    const c3 = place(w, 'B01', 64.5, 64.2);
    const before = [a, b, c3].map((s) => w.ents.cols.B[s]!);
    stageSenseAndMove(w); // computes suitability (no movement matters for allocation)
    for (const s of [a, b, c3]) {
      w.ents.cols.x[s] = 64.5;
      w.ents.cols.y[s] = 64.5;
    }
    rebuildIndex(w);
    stageIntake(w);
    const gains = [a, b, c3].map((s, k) => w.ents.cols.B[s]! - before[k]!);
    expect(gains[0]).toBeGreaterThan(0);
    expect(gains[1]).toBeCloseTo(gains[0]!, 12);
    expect(gains[2]).toBeCloseTo(gains[0]!, 12);
    // Total consumed never exceeds what was there: 0.5 of consumed carbon becomes biomass.
    const consumed = (gains[0]! + gains[1]! + gains[2]!) / 0.5;
    expect(consumed).toBeLessThanOrEqual(0.01 + 1e-12);
  });

  it('finite feeding: many competitors never overdraw a pool and no pool goes negative', () => {
    const w = clearWater();
    setField(w, 'sugar', CELL, 0.05);
    setField(w, 'nutrient', CELL, 0.001); // nutrient-limited too
    for (let k = 0; k < 8; k++) place(w, 'B01', 64.1 + k * 0.1, 64.5);
    for (let t = 0; t < 50; t++) run(w, 1);
    for (const id of ['sugar', 'nutrient', 'oxygen', 'co2', 'metabolite'] as const) {
      for (let i = 0; i < 128 * 128; i++) expect(w.fields[id]![i]).toBeGreaterThanOrEqual(0);
    }
    expect(checkLedger(w).ok).toBe(true);
  });

  it('no free growth: zero compatible food means no new biomass and energy declines', () => {
    const w = clearWater();
    const s = place(w, 'B01', 64.5, 64.5);
    const B0 = w.ents.cols.B[s]!;
    const E0 = w.ents.cols.E[s]!;
    run(w, 100);
    expect(w.ents.cols.B[s]).toBe(B0);
    expect(w.ents.cols.E[s]).toBeLessThan(E0);
  });

  it('no free growth: zero nutrient blocks growth even with abundant food', () => {
    const w = clearWater();
    w.fields.nutrient!.fill(0);
    w.fields.sugar![CELL] = 5;
    const s = place(w, 'B01', 64.5, 64.5, { N: 0.1 });
    const B0 = w.ents.cols.B[s]!;
    run(w, 50);
    expect(w.ents.cols.B[s]).toBe(B0);
    expect(w.ents.cols.limitCode[s]).toBe(R.NUTRIENT_LIMITED);
  });

  it('no free growth: zero light or CO2 stops photosynthesis', () => {
    const w = clearWater();
    w.grid.lightBase.fill(0);
    w.grid.geometryVersion++; // light baseline changed: derived light must be recomputed
    const s = place(w, 'A01', 64.5, 64.5);
    const B0 = w.ents.cols.B[s]!;
    run(w, 50);
    expect(w.ents.cols.B[s]).toBe(B0);
    const w2 = clearWater();
    w2.fields.co2!.fill(0);
    w2.settings.lid = 'closed';
    const s2 = place(w2, 'A01', 64.5, 64.5);
    run(w2, 50);
    expect(w2.ents.cols.B[s2]).toBe(w2.species.find((x) => x.id === 'A01')!.def.b0);
  });

  it('photosynthesis converts CO2 into half biomass and half sugar and releases oxygen', () => {
    const w = clearWater();
    w.settings.lid = 'closed';
    const s = place(w, 'A01', 64.5, 64.5);
    const cell = CELL;
    const co2Before = w.fields.co2![cell]!;
    stageSenseAndMove(w);
    stageIntake(w);
    const dB = w.ents.cols.B[s]! - 1.5;
    const dCO2 = co2Before - w.fields.co2![cell]!;
    expect(dB).toBeGreaterThan(0);
    expect(dB).toBeCloseTo(0.5 * dCO2, 12);
    expect(w.fields.sugar![cell]).toBeCloseTo(0.5 * dCO2, 12);
  });

  it('weighted policy with all present foods at zero weight requests nothing (C02)', () => {
    const w = clearWater();
    const s = place(w, 'B04', 64.5, 64.5);
    w.fields.detritus![CELL] = 1;
    w.fields.starch![CELL] = 1;
    // Hand-build a weighted genome whose weights exclude the present foods.
    const g = w.genomes.get(w.ents.cols.genome[s]!);
    const weighted = w.genomes.intern({ ...g, policy: 'weighted', weights: [0, 1, 0, 0] });
    w.ents.cols.genome[s] = weighted;
    stageSenseAndMove(w);
    stageIntake(w);
    expect(w.ents.cols.B[s]).toBe(1);
    expect(w.ents.cols.limitCode[s]).toBe(R.FOOD_EXCLUDED_BY_PREFERENCE);
  });

  it('over-capacity cells halve intake requests', () => {
    const w = clearWater();
    w.fields.sugar![CELL] = 100;
    w.fields.nutrient![CELL] = 100;
    const solo = clearWater();
    solo.fields.sugar![CELL] = 100;
    solo.fields.nutrient![CELL] = 100;
    const one = place(solo, 'B01', 64.5, 64.5);
    const crowd: number[] = [];
    for (let k = 0; k < 9; k++) crowd.push(place(w, 'B01', 64.05 + k * 0.1, 64.5));
    for (const world of [w, solo]) {
      stageSenseAndMove(world);
      const c = world.ents.cols;
      for (const s of aliveOf(world)) {
        c.x[s] = 64.5;
        c.y[s] = 64.5;
      }
      rebuildIndex(world);
      stageIntake(world);
    }
    const soloGain = solo.ents.cols.B[one]! - 1;
    const crowdGain = w.ents.cols.B[crowd[0]!]! - 1;
    expect(crowdGain).toBeCloseTo(soloGain / 2, 9);
    expect(w.ents.cols.limitCode[crowd[0]!]).toBe(R.CROWDING_INTAKE_HALVED);
  });
});
