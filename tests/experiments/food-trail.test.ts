/**
 * Foundation experiment 101 "Food trail" (CT §10.1; D01 §15): Water Garden, 30 Sprinters at (36,64),
 * a trail x 36–80, y 61–67 with 0.50 sugar and 0.20 nutrient per cell. Gate: the followed group's
 * biomass grows by 25 % with recorded food intake (the inspector's "food use").
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExperimentResult } from '../../src/sim/experiments';
import { expectConserved, expectReplayIdentical, expectGateReached, runCard } from './helpers';
import { expectWaveANumbers } from './golden';

let r: ExperimentResult;
beforeAll(() => {
  r = runCard('EXP_101');
});

describe('Food trail (FOOD_TRAIL_V1 r1, seed 101)', () => {
  it('reaches its observation gate: Sprinter biomass +25 % with recorded intake', () => {
    expectGateReached(r);
    expect(r.gate.reachedAtSecond).toBeLessThanOrEqual(180);
    expect(r.stamp!.values['A:biomassRatio.B01']).toBeGreaterThanOrEqual(1.25);
    expect(r.A.reported['biomassStart.B01']).toBe(30);
  });

  it('conserves materials and replays identically (the untouched dish at 180 s)', () => {
    expect(r.B).toBeNull();
    expectConserved(r.A);
    expectReplayIdentical(r);
  });

  it('the trail sugar and the background are the Sprinters’ only food', () => {
    const m = r.A.reported;
    expect(m['intake.B01']).toBeGreaterThan(0);
    expect(m['consumed.sugar']).toBeCloseTo(m['intake.B01']!, 9);
    expect(r.A.measurements.inputCarbon).toBeCloseTo(157.5, 9); // the two tick-0 strokes: 315 cells × 0.50 C
  });
});

describe('one paired-run measurement model (SPEC §13.4)', () => {
  it('reproduces every number wave A recorded for this card: gate, stamp, measurements, ledger, timeline', () => {
    expectWaveANumbers(r);
  });
});
