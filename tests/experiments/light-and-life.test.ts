/**
 * Foundation experiment 102 "Light and life" (CT §10.1; D01 §15): two Water Garden copies with 30
 * Sunbeads at (50,70) and +0.20 nutrient in the patch; copy B is shade-painted (light × 0.1). Compare
 * 180 s. Gate: the copies' photosynthetic totals differ (no population ratio is required).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExperimentResult } from '../../src/sim/experiments';
import { expectConserved, expectReplayIdentical, expectEqualArms, expectGateReached, runCard } from './helpers';

let r: ExperimentResult;
beforeAll(() => {
  r = runCard('EXP_102');
});

describe('Light and life (LIGHT_AND_LIFE_V1 r1, seed 102, 180 s)', () => {
  it('reaches its observation gate: the photosynthetic totals of the two copies differ', () => {
    expectGateReached(r);
    expect(r.gate.reachedAtSecond).toBe(180);
    expect(r.A.reported['intake.A01']).toBeGreaterThan(0);
    expect(r.B!.reported['intake.A01']).toBeGreaterThan(0);
    expect(r.stamp!.values['absDiff:intake.A01']).toBeCloseTo(Math.abs(r.A.reported['intake.A01']! - r.B!.reported['intake.A01']!), 9);
  });

  it('conserves materials in both copies; both replay identically and copy A is the untouched dish', () => {
    expectConserved(r.A);
    expectConserved(r.B);
    expectEqualArms(r);
    expectReplayIdentical(r);
    expect(r.A.startHash).not.toBe(r.B!.startHash); // the shade is part of B's state from tick 0
  });
});
