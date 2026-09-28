/**
 * Foundation experiment 106 "Predator balance" (CT §10.1; D01 §15): 100 Sprinters at (50,70) with 0.50
 * sugar and 0.20 nutrient per patch cell; copy B alone gets 5 Amoebae through the command path at
 * 0 s. Compare 180 s. Gate: the comparison ran, the Amoebae arrived, and they caught prey (there is
 * consumption and prey history to read), whichever way the population went.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExperimentResult } from '../../src/sim/experiments';
import { expectConserved, expectReplayIdentical, expectEqualArms, expectGateReached, runCard } from './helpers';

let r: ExperimentResult;
beforeAll(() => {
  r = runCard('EXP_106');
});

describe('Predator balance (PREDATOR_BALANCE_V1 r1, seed 106, 180 s)', () => {
  it('reaches its observation gate: five Amoebae arrived in copy B and caught prey', () => {
    expectGateReached(r);
    expect(r.gate.reachedAtSecond).toBe(180);
    expect(r.interventions.map((i) => i.result)).toEqual([{ accepted: 5, rejected: 0 }]);
    expect(r.B!.reported['captures.P01']).toBeGreaterThanOrEqual(1);
  });

  it('conserves materials in both copies; both replay identically and copy A is the untouched dish', () => {
    expectConserved(r.A);
    expectConserved(r.B);
    expectEqualArms(r);
    expect(r.A.startHash).toBe(r.baselineHash);
    expectReplayIdentical(r);
  });

  it('every capture is one Sprinter predation death; the grazers are a logged input', () => {
    const A = r.A.reported;
    const B = r.B!.reported;
    expect(A['captures.P01']).toBe(0);
    expect(A['deaths.B01.DEATH_PREDATION']).toBe(0);
    expect(B['deaths.B01.DEATH_PREDATION']).toBe(B['captures.P01']); // Sprinters are the only prey in the dish
    expect(A.inputCarbon).toBe(0);
    expect(B.inputCarbon).toBeCloseTo(20, 12); // five Amoebae × b0 4
    expect(B['capturedCarbon.P01']).toBeGreaterThan(0);
  });
});
