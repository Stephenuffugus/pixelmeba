/**
 * Experiment A "What unlocks starch" (CT §10.2 EXP_A; D06 §8): clear water, 12 Crumbsmiths on a r 3
 * patch with 0.60 starch and a disclosed 0.10 sugar bootstrap per cell, Fixed Traits, seed 104729;
 * copy B omits the starch; both run 180 s. The gate is positive enzyme conversion in copy A over the
 * full comparison. Survival is reported, not required: D06 warns the enzyme's cost may outweigh its
 * gain, and on this content it does (see docs/reports/experiments-g2.md).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExperimentResult } from '../../src/sim/experiments';
import { ENZYME_EMIT_MIN_ENERGY } from '../../src/sim/constants';
import { expectConserved, expectReplayIdentical, expectEqualArms, expectGateReached, runCard, speciesAt } from './helpers';

let r: ExperimentResult;
beforeAll(() => {
  r = runCard('EXP_A');
});

describe('Experiment A — What unlocks starch (STARCH_UNLOCK_V1 r1, seed 104729, 180 s)', () => {
  it('reaches its observation gate: both copies ran 180 s and copy A made sugar from starch', () => {
    expectGateReached(r);
    expect(r.gate.reachedAtSecond).toBe(180);
    expect(r.stamp!.values['A:converted.starch']).toBeGreaterThan(0);
  });

  it('conserves carbon, nutrient and mineral in both copies; the copies advance equally', () => {
    expectConserved(r.A);
    expectConserved(r.B);
    expectEqualArms(r);
  });

  it('replays identically from scratch; copy A is the recipe as written (the untouched dish)', () => {
    expectReplayIdentical(r);
  });

  it('reports enzyme-made sugar separately from the bootstrap, and every pool balances', () => {
    const A = r.A.reported;
    const B = r.B!.reported;
    // The bootstrap is the same logged input in both copies: 0.10 C × 29 cells.
    expect(A['patchInput.0']).toBeCloseTo(2.9, 12);
    expect(B['patchInput.0']).toBeCloseTo(2.9, 12);
    // Copy B has no starch, so no enzyme-made sugar.
    expect(B['converted.starch']).toBe(0);
    expect(B['field.starch']).toBe(0);
    // Copy A: starch left = 17.4 − converted; sugar left = bootstrap + converted − eaten.
    expect(A['converted.starch']).toBeGreaterThan(0);
    expect(A['field.starch']).toBeCloseTo(0.6 * 29 - A['converted.starch']!, 9);
    expect(A['field.sugar']).toBeCloseTo(A['patchInput.0']! + A['converted.starch']! - A['consumed.sugar']!, 9);
    expect(B['field.sugar']).toBeCloseTo(B['patchInput.0']! - B['consumed.sugar']!, 9);
    // Crumbsmiths are the only sugar eaters in the dish.
    expect(A['consumed.sugar']).toBeCloseTo(A['intake.B06']!, 9);
    expect(B['consumed.sugar']).toBeCloseTo(B['intake.B06']!, 9);
  });

  it('records the measured limiting factor for survival that the report explains', () => {
    for (const arm of [r.A, r.B!]) {
      const m = arm.measurements;
      // Both copies: no births and all 12 founders starve before 180 s.
      expect(m['births.B06']).toBe(0);
      expect(m['alive.B06']).toBe(0);
      expect(m['deaths.B06']).toBe(12);
      expect(m['deaths.B06.DEATH_STARVATION']).toBe(12);
      expect(m['extinctAt.B06']).toBeGreaterThan(120);
      expect(m['extinctAt.B06']).toBeLessThan(180);
      // Leading intake limit for every living Crumbsmith at 60 and 120 s: food access (not nutrient, oxygen or crowding).
      for (const second of [60, 120]) {
        const b06 = speciesAt(arm.timeline.find((s) => s.second === second)!, 'B06')!;
        expect(b06.alive).toBe(12);
        expect(b06.limits).toEqual({ FOOD_ACCESS_LOW: 1 });
        expect(b06.meanE).toBeLessThan(ENZYME_EMIT_MIN_ENERGY);
      }
    }
    // In copy A secretion stops for lack of energy once E falls below the 35 E emit threshold.
    const a60 = speciesAt(r.A.timeline.find((s) => s.second === 60)!, 'B06')!;
    expect(a60.secretion).toEqual({ SECRETION_ENERGY_LOW: 1 });
    const a30 = speciesAt(r.A.timeline.find((s) => s.second === 30)!, 'B06')!;
    expect(a30.secretion).toEqual({ SECRETING: 1 });
    // The starch copy fed more, but not enough to cover maintenance.
    expect(r.A.measurements['intake.B06']).toBeGreaterThan(2 * r.B!.measurements['intake.B06']!);
  });
});
