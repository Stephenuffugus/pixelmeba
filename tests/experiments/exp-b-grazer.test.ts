/**
 * Experiment B "What changes when a grazer arrives" (CT §10.2 EXP_B; D06 §8): FIRST_DISH_V1 runs to
 * 120 s, is copied, and copy B alone gets two Amoebae in the nearest valid cells to (48,64) through the
 * command path; both copies run another 180 s. Reports prey deaths by cause, births, prey biomass and
 * the sugar remaining.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExperimentResult } from '../../src/sim/experiments';
import { expectConserved, expectReplayIdentical, expectEqualArms, expectGateReached, runCard } from './helpers';
import { expectWaveANumbers } from './golden';

let r: ExperimentResult;
beforeAll(() => {
  r = runCard('EXP_B');
});

const predationDeaths = (m: Readonly<Record<string, number>>) =>
  Object.keys(m)
    .filter((k) => /^deaths\.[A-Z0-9]+\.DEATH_PREDATION$/.test(k))
    .reduce((a, k) => a + m[k]!, 0);

describe('Experiment B — What changes when a grazer arrives (FIRST_DISH_V1 r1, seed 104729, 120 s + 180 s)', () => {
  it('reaches its observation gate: two Amoebae arrived in copy B and both copies ran 180 s more', () => {
    expectGateReached(r);
    expect(r.startTick).toBe(1200);
    expect(r.gate.reachedAtSecond).toBe(300);
    expect(r.interventions.map((i) => i.result)).toEqual([
      { accepted: 1, rejected: 0 },
      { accepted: 1, rejected: 0 },
    ]);
  });

  it('conserves materials in both copies, which advance equally from one baseline', () => {
    expectConserved(r.A);
    expectConserved(r.B);
    expectEqualArms(r);
    expect(r.A.startHash).toBe(r.baselineHash);
    expect(r.B!.startHash).not.toBe(r.baselineHash);
  });

  // Re-runs the recipe and both copies to 300 s: over 2 minutes on a loaded 2-CPU machine.
  it('replays identically; copy A is the untouched garden, FIRST_DISH_V1 run straight to 300 s', () => {
    expectReplayIdentical(r);
  }, 600_000);

  it('records the grazers as an external input and every capture as one predation death', () => {
    const A = r.A.measurements;
    const B = r.B!.measurements;
    expect(A.inputCarbon).toBe(0);
    expect(B.inputCarbon).toBeCloseTo(8, 12); // two Amoebae × b0 4
    expect(A['captures.P01']).toBe(0);
    expect(predationDeaths(A)).toBe(0);
    expect(predationDeaths(B)).toBe(B['captures.P01']);
    // The card's measurements are reported for both copies.
    for (const id of ['deaths.B01.DEATH_PREDATION', 'deaths.B01', 'births.B01', 'biomass.B01', 'preyBiomass.P01', 'field.sugar']) {
      expect(typeof r.A.reported[id]).toBe('number');
      expect(typeof r.B!.reported[id]).toBe('number');
    }
    expect(r.A.reported['preyBiomass.P01']).toBeGreaterThan(r.A.reported['biomass.B01']!); // Sunbeads, Recyclers and Crumbsmiths are prey too
  });
});

describe('one paired-run measurement model (SPEC §13.4)', () => {
  it('reproduces every number wave A recorded for this card: gate, stamp, measurements, ledger, timeline', () => {
    expectWaveANumbers(r);
  });
});
