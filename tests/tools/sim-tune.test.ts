/** tools/sim-tune.ts: report fields exist, the tuner only observes, censoring is never an event. */
import { describe, expect, it } from 'vitest';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { step } from '../../src/sim/tick';
import { loadRegistryFs } from '../../tools/lib/content-fs';
import {
  ANALYSIS_END,
  ANALYSIS_START,
  censoredStats,
  extractAnalysis,
  renderReport,
  tuneSeed,
  withinTarget,
} from '../../tools/sim-tune';

describe('sim-tune', () => {
  const registry = loadRegistryFs();
  const run = tuneSeed(registry, {
    recipe: 'FIRST_DISH_V1',
    seed: 104729,
    preset: 'standard',
    seconds: 30,
    extendSeconds: 30,
    sampleSeconds: [15, 30],
  });

  it('records the per-seed fields at the checkpoint', () => {
    const cp = run.checkpoint;
    expect(cp.tick).toBe(300);
    expect(run.final).toBe(cp);
    expect(run.extended).toBe(false);
    for (const key of [
      'firstIntakeTick',
      'firstDivisionTick',
      'births',
      'deaths',
      'deathsByCause',
      'counts',
      'biomass',
      'food',
      'mutations',
      'branchCandidateEvents',
      'branchesEstablished',
      'wall',
      'ledger',
      'hash',
      'extinct',
    ] as const) {
      expect(cp).toHaveProperty(key);
    }
    expect(Object.keys(cp.counts)).toEqual(expect.arrayContaining(['B01', 'B06', 'B04', 'A01']));
    expect(Object.keys(cp.firstDivisionBySpecies)).toEqual(
      expect.arrayContaining(['B01', 'B06', 'B04', 'A01']),
    );
    expect(cp.food.total).toBeCloseTo(cp.food.sugar + cp.food.starch + cp.food.detritus, 12);
    expect(cp.food.total).toBeLessThanOrEqual(run.initialFood.total + 1e-9);
    expect(cp.ledger.ok).toBe(true);
    expect(cp.deathCauseCoverage.tallied).toBe(cp.deaths);
    expect(cp.wall.ticks).toBe(300);
    expect(run.samples.map((s) => s.second)).toEqual([15, 30]);
    expect(run.samples[0]!.species.B01!.alive).toBeGreaterThan(0);
    // FIRST_DISH_V1 patches: 0.40 sugar over the r 6 sugar patch's cells etc.; all three are probed.
    expect(run.initialPatches).toHaveLength(3);
    expect(run.initialPatches[0]!.carbon).toBeCloseTo(run.initialFood.sugar, 9);
    expect(run.samples[0]!.patches).toHaveLength(3);
    expect(cp.starchConverted).toBeGreaterThan(0);
  });

  it('only observes: the endpoint hash equals a plain run of the same ticks', () => {
    const world = realizeRecipe(registry, 'FIRST_DISH_V1', { seed: 104729 });
    for (let t = 0; t < 300; t++) step(world);
    expect(run.checkpoint.hash).toBe(stateHash(world));
  });

  it('extends to the second stopping time only when no inherited difference exists', () => {
    const r = tuneSeed(registry, {
      recipe: 'FIRST_DISH_V1',
      seed: 104729,
      preset: 'standard',
      seconds: 2,
      extendSeconds: 4,
      sampleSeconds: [],
    });
    expect(r.checkpoint.mutations).toBe(0);
    expect(r.extended).toBe(true);
    expect(r.checkpoint.tick).toBe(20);
    expect(r.final.tick).toBe(40);
  });

  it('never treats a censored value as an event at the stopping time', () => {
    const s = censoredStats([10, 20, null, null, null, null], 600);
    expect(s).toMatchObject({ n: 6, events: 2, censored: 4, min: 10, max: 20 });
    expect(s.median).toEqual({ value: 600, lowerBound: true });
    // Middle ranks 20 and a censored value (≥ 600): only a lower bound (20 + 600) / 2 is known.
    expect(censoredStats([10, null, 20, null], 600).median).toEqual({ value: 310, lowerBound: true });
    expect(censoredStats([10, 20, 30, null], 600).median).toEqual({ value: 25, lowerBound: false });
    expect(censoredStats([30, 10, 20, 40], 600).median).toEqual({ value: 25, lowerBound: false });
  });

  it('treats a milestone censored before a target window closes as unknown, not a miss', () => {
    expect(withinTarget(1300, 120, 600)).toBe('no');
    expect(withinTarget(293, 120, 20)).toBe('yes');
    expect(withinTarget(null, 120, 20)).toBe('unknown');
    expect(withinTarget(null, 120, 600)).toBe('no');
    expect(withinTarget(null, 120, 120)).toBe('no');
  });

  it('renders the report tables and keeps a hand-written analysis block', () => {
    const md = renderReport(
      [run],
      {
        command: 'test',
        seconds: 30,
        extendSeconds: 30,
        preset: 'standard',
        machine: 'test',
        generatedAt: 'test',
        wallSeconds: 0,
      },
      '\n## Observations\nkept\n',
    );
    for (const heading of [
      '### Pacing at the 30 s checkpoint',
      '### Population at the 30 s checkpoint',
      '### Integrity and speed',
      '### Summary over 1 seeds',
      '**D06 targets**',
    ]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain(run.checkpoint.hash);
    expect(md).toContain(`${ANALYSIS_START}\n## Observations\nkept\n${ANALYSIS_END}`);
    expect(extractAnalysis(md)).toBe('\n## Observations\nkept\n');
  });
});
