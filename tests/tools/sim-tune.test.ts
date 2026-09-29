/** tools/sim-tune.ts: report fields exist, the tuner only observes, censoring is never an event. */
import { describe, expect, it } from 'vitest';
import { introduceOrganism } from '../../src/sim/commands';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { LIFE_ACTIVE, LIFE_RESTING } from '../../src/sim/entities';
import { cellIndex } from '../../src/sim/grid';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { rebuildIndex } from '../../src/sim/spatial';
import { run as runTicks, step } from '../../src/sim/tick';
import { speciesIndex, type World } from '../../src/sim/world';
import { loadRegistryFs } from '../../tools/lib/content-fs';
import {
  ANALYSIS_END,
  ANALYSIS_START,
  censoredStats,
  extractAnalysis,
  renderReport,
  sampleReasons,
  tuneSeed,
  withinTarget,
} from '../../tools/sim-tune';
import { clearWater, setField } from '../helpers/world';

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

  it('counts secretion from the profile producer rules: E01 carriers as well as native producers', () => {
    const w = clearWater();
    const put = (id: string, x: number, modules: readonly string[]): number => {
      const s = introduceOrganism(w, speciesIndex(w, id), cellIndex(x, 64), 'test', {
        modules,
        exactCenter: true,
      });
      rebuildIndex(w);
      return s;
    };
    const plain = put('B01', 40, []);
    const carriers = [44, 48, 52].map((x) => put('B01', x, ['E01']));
    const native = put('B06', 80, []);
    // Starch beside two of the carriers and the native producer; the third carrier has none nearby.
    for (const x of [44, 48, 80]) setField(w, 'starch', cellIndex(x, 64), 0.6);
    step(w);
    const c = w.ents.cols;
    expect(profileOf(w, plain).starch).toBeNull();
    expect(carriers.map((s) => profileOf(w, s).starch?.source)).toEqual(['E01', 'E01', 'E01']);
    expect(profileOf(w, native).starch?.source).toBe('native');
    expect(carriers.map((s) => c.secretionCode[s])).toEqual([
      R.SECRETING,
      R.SECRETING,
      R.SECRETION_NO_SUBSTRATE,
    ]);
    const sample = sampleReasons(w, w.tick / 10);
    // Three E01 carriers among four Sprinters: the plain one has no producer rules and is not counted.
    expect(sample.species.B01!.alive).toBe(4);
    expect(sample.species.B01!.secretion).toEqual({ SECRETING: 2, SECRETION_NO_SUBSTRATE: 1 });
    expect(sample.species.B06!.secretion).toEqual({ SECRETING: 1 });
  });

  it('a producer that is resting is tallied under its state reason, not a stale secretion outcome', () => {
    const w: World = clearWater();
    const s = introduceOrganism(w, speciesIndex(w, 'B01'), cellIndex(64, 64), 'test', {
      modules: ['E01', 'E03'],
      exactCenter: true,
    });
    rebuildIndex(w);
    const c = w.ents.cols;
    expect(c.lifeState[s]).toBe(LIFE_ACTIVE);
    runTicks(w, 250); // no food: 20 s trigger, 5 s preparing
    expect(c.lifeState[s]).toBe(LIFE_RESTING);
    expect(sampleReasons(w, w.tick / 10).species.B01!.secretion).toEqual({ RESTING_FOOD_SCARCE: 1 });
  });

  it("tuneSeed reports E01 carriers' secretion (founders given E01 at creation)", () => {
    const base = registry.recipes.RESERVE_COMPARE_V1!;
    const starchDish: ContentRegistry = {
      ...registry,
      recipes: {
        ...registry.recipes,
        TUNE_E01_TEST: {
          ...base,
          id: 'TUNE_E01_TEST',
          fieldPatches: [
            ...base.fieldPatches,
            { ...base.fieldPatches[0]!, radius: 5, add: { starch: 0.6 }, label: 'Starch' },
          ],
          founders: base.founders.map((f) => ({ ...f, modules: ['E01'] })),
          scheduledCommands: [],
        },
      },
    };
    const r = tuneSeed(starchDish, {
      recipe: 'TUNE_E01_TEST',
      seed: 104729,
      preset: 'standard',
      seconds: 2,
      extendSeconds: 2,
      sampleSeconds: [1],
    });
    const b01 = r.samples[0]!.species.B01!;
    const counted = Object.values(b01.secretion).reduce((a, b) => a + b, 0);
    // Half the 24 founders carry E01 (alternate-odd); every one is counted, the others are not.
    expect(b01.alive).toBe(24);
    expect(counted).toBe(12);
    expect(b01.secretion.SECRETING).toBeGreaterThan(0);
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
