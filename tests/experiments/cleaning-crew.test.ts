/**
 * Foundation experiment 103 "Cleaning crew" (CT §10.1; D01 §15): 10 Recyclers at (50,70) and 10
 * detritus C with 1 bound nutrient across the r 6 patch. Gate: at least 2 detritus C eaten.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExperimentResult } from '../../src/sim/experiments';
import { expectConserved, expectReplayIdentical, expectGateReached, runCard } from './helpers';

let r: ExperimentResult;
beforeAll(() => {
  r = runCard('EXP_103');
});

describe('Cleaning crew (CLEANING_CREW_V1 r1, seed 103)', () => {
  it('reaches its observation gate: at least 2 detritus carbon eaten', () => {
    expectGateReached(r);
    expect(r.stamp!.values['A:consumed.detritus']).toBeGreaterThanOrEqual(2);
  });

  it('conserves materials and replays identically (the untouched dish at 180 s)', () => {
    expectConserved(r.A);
    expectReplayIdentical(r);
  });

  it('Recyclers are the only detritus eaters: detritus consumed equals their intake', () => {
    const m = r.A.reported;
    expect(m['consumed.detritus']).toBeCloseTo(m['intake.B04']!, 9);
    expect(r.A.measurements['patchInput.0']).toBeCloseTo(10, 12);
  });
});
