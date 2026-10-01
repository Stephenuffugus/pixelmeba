/**
 * tools/sim-tune.ts: report fields exist, the tuner only observes (endpoint hash equals a plain run, at
 * both presets, and --plain-check proves it per seed), censoring is never an event, module draws are
 * counted exactly as the simulation drafts them, the pooled and per-module rates are compared with the
 * preset chances, the supplementary horizon never changes the D06 checkpoint, and the header names the
 * build and rule versions.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generatedBranchName } from '../../src/sim/branches';
import { introduceOrganism } from '../../src/sim/commands';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { LIFE_ACTIVE, LIFE_RESTING } from '../../src/sim/entities';
import type { Genome } from '../../src/sim/genome';
import { cellIndex, diskCells } from '../../src/sim/grid';
import { eligibleGains, lossOptions } from '../../src/sim/modules';
import {
  draftDaughter,
  moduleGainAttemptChance,
  MUT_MODULE_GAIN,
  MUT_MODULE_LOSS,
  MUT_QUANT,
  MUT_QUANT_NEUTRAL,
  ratesFor,
} from '../../src/sim/mutation';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { entityCell, rebuildIndex } from '../../src/sim/spatial';
import { run as runTicks, step } from '../../src/sim/tick';
import { SCHEMA_VERSION, speciesIndex, type World } from '../../src/sim/world';
import { loadRegistryFs, REPO_ROOT } from '../../tools/lib/content-fs';
import {
  ANALYSIS_END,
  ANALYSIS_START,
  buildInfo,
  buildLine,
  censoredStats,
  chanceOfNone,
  checkpointsOf,
  countRange95,
  extractAnalysis,
  InheritanceObserver,
  integrityProblems,
  medianWaitSecond,
  moduleDrawOf,
  parseTuneArgs,
  pct,
  plainMismatches,
  plainRunHashes,
  renderReport,
  sampleReasons,
  starchWithinReach,
  tuneSeed,
  withinTarget,
  type ModuleDraw,
  type ReportMeta,
  type SeedRun,
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
    expect(run.horizon).toBeNull();
    expect(run.plain).toBeNull();
    expect(run.rules).toEqual({
      simulation: 3,
      evolutionRules: registry.manifest.evolutionRulesVersion,
      moduleRegistry: registry.manifest.moduleRegistryVersion,
      phenotypeMapping: registry.manifest.phenotypeMappingVersion,
      content: registry.manifest.contentVersion,
      worldSchema: SCHEMA_VERSION,
    });
    expect(run.moduleNames.E01).toBe('Starch release');
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
    // Daughter trials: two per committed division, every one re-drafted exactly from its recorded keys.
    const inh = cp.inheritance;
    expect(run.rates).toEqual(ratesFor('standard', false));
    expect(inh.daughters).toBe(2 * cp.births);
    expect(inh.daughters).toBeGreaterThan(0);
    expect(inh.drawsChecked).toBe(inh.daughters);
    expect(inh.drawsMatched).toBe(inh.drawsChecked);
    expect(inh.mismatches).toBe(0);
    expect(inh.quantDraws).toBe(cp.mutationKinds.quantitative + cp.mutationKinds.neutralDraws);
    expect(run.daughtersBySecond).toHaveLength(31);
    expect(run.daughtersBySecond[30]).toBe(inh.daughters);
    expect(run.gainEligibleBySecond[30]).toBe(inh.gainEligible);
  });

  it('only observes: the endpoint hash equals a plain run of the same ticks', () => {
    const world = realizeRecipe(registry, 'FIRST_DISH_V1', { seed: 104729 });
    for (let t = 0; t < 300; t++) step(world);
    expect(run.checkpoint.hash).toBe(stateHash(world));
  });

  it('parses one preset or both presets into one report', () => {
    expect(parseTuneArgs([]).presets).toEqual(['standard']);
    expect(parseTuneArgs(['--preset', 'accelerated']).presets).toEqual(['accelerated']);
    const both = parseTuneArgs(['--presets', 'standard,accelerated', '--out', 'x.md']);
    expect(both).toMatchObject({ presets: ['standard', 'accelerated'], seconds: 600, extend: 1200, out: 'x.md' });
    expect(both.seeds).toEqual([104729, 130363, 155921, 196613, 262147, 314159]);
    expect(() => parseTuneArgs(['--presets', 'standard,fast'])).toThrow(/preset/);
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

describe('sim-tune: module draws are counted exactly as the simulation drafts them', () => {
  const registry = loadRegistryFs();
  const worldAt = (preset: 'standard' | 'accelerated'): World =>
    realizeRecipe(registry, 'FIRST_DISH_V1', { seed: 104729, transform: (r) => ({ ...r, mutationPreset: preset }) });
  const founderGenome = (w: World, id: string): Genome => {
    const c = w.ents.cols;
    for (let i = 0; i < w.ents.highWater; i++)
      if (c.alive[i] === 1 && w.species[c.species[i]!]!.id === id) return w.genomes.get(c.genome[i]!);
    throw new Error(`no ${id} founder`);
  };

  /** Classify `keys` × 2 daughter trials for several parents and compare with the simulation's own draft. */
  function survey(w: World, parents: readonly Genome[], keys: number) {
    const problems: string[] = [];
    const counts: Record<ModuleDraw, number> = { none: 0, gain: 0, loss: 0, unknown: 0 };
    for (let pb = 1; pb <= keys; pb++)
      for (const d of [0, 1]) {
        const draws = parents.map((g) => moduleDrawOf(w, g, pb, d));
        const draw = draws[0]!;
        counts[draw]++;
        if (draws.some((x) => x !== draw)) problems.push(`pb ${pb} d ${d}: the draw depends on the genome (${draws.join(',')})`);
        for (const g of parents) {
          const f = draftDaughter(w, g, pb, d).flags;
          const gained = (f & MUT_MODULE_GAIN) !== 0;
          const lost = (f & MUT_MODULE_LOSS) !== 0;
          const who = `pb ${pb} d ${d} ${g.ancestor}[${g.modules.join('+')}]`;
          if (gained !== (draw === 'gain' && eligibleGains(w, g).length > 0)) problems.push(`${who}: gain flag ${gained}, draw ${draw}`);
          if (lost !== (draw === 'loss' && lossOptions(w, g).length > 0)) problems.push(`${who}: loss flag ${lost}, draw ${draw}`);
        }
      }
    return { problems: problems.slice(0, 10), counts };
  }

  it('recomputes every module draw as draftDaughter makes it, with or without a legal option', () => {
    const w = worldAt('accelerated');
    const b01 = founderGenome(w, 'B01');
    const a01 = founderGenome(w, 'A01');
    const b06 = founderGenome(w, 'B06');
    const parents: Genome[] = [
      b01, // every gain legal, nothing to lose
      { ...b01, modules: ['E01', 'E03', 'E05'] }, // three slots used: no legal gain; each loss legal
      a01, // Reserve chamber is the Sunbead's only legal gain
      { ...a01, modules: ['E05'] }, // nothing left to gain; the loss is legal
      b06, // native starch release: E03 and E05 only
    ];
    expect(eligibleGains(w, parents[0]!)).toEqual(['E01', 'E03', 'E05']);
    expect(lossOptions(w, parents[0]!)).toEqual([]);
    expect(eligibleGains(w, parents[1]!)).toEqual([]);
    expect(eligibleGains(w, parents[2]!)).toEqual(['E05']);
    expect(eligibleGains(w, parents[3]!)).toEqual([]);
    expect(lossOptions(w, parents[3]!)).toEqual(['E05']);
    expect(eligibleGains(w, parents[4]!)).toEqual(['E03', 'E05']);
    const keys = 4000;
    const { problems, counts } = survey(w, parents, keys);
    expect(problems).toEqual([]);
    expect(counts.unknown).toBe(0);
    // Fixed keys, so this is deterministic: the counts lie inside the 95 % range of the Accelerated chances
    // (1 % per daughter; gain and loss half each).
    const trials = 2 * keys;
    const [lo, hi] = countRange95(trials, ratesFor('accelerated', false).module);
    expect(counts.gain + counts.loss).toBeGreaterThanOrEqual(lo);
    expect(counts.gain + counts.loss).toBeLessThanOrEqual(hi);
    const [l, h] = countRange95(trials, 0.005);
    for (const n of [counts.gain, counts.loss]) {
      expect(n).toBeGreaterThanOrEqual(l);
      expect(n).toBeLessThanOrEqual(h);
    }
  });

  it('uses the preset in effect: Standard draws a module change at 0.2 % per daughter', () => {
    const w = worldAt('standard');
    const parents = [founderGenome(w, 'B01'), { ...founderGenome(w, 'A01'), modules: ['E05'] }];
    const { problems, counts } = survey(w, parents, 4000);
    expect(problems).toEqual([]);
    const [lo, hi] = countRange95(8000, ratesFor('standard', false).module);
    expect(counts.gain + counts.loss).toBeGreaterThanOrEqual(lo);
    expect(counts.gain + counts.loss).toBeLessThanOrEqual(hi);
  });

  it('rate helpers: Poisson range, chance of none, median wait and the SPEC §8.7 statement', () => {
    expect(countRange95(1000, 0.001)).toEqual([0, 3]);
    expect(countRange95(0, 0.01)).toEqual([0, 0]);
    const [lo, hi] = countRange95(20000, 0.01); // Poisson, mean 200
    expect(lo).toBeGreaterThan(165);
    expect(lo).toBeLessThan(200);
    expect(hi).toBeGreaterThan(200);
    expect(hi).toBeLessThan(235);
    expect(countRange95(10000, 0.08)).toEqual([746, 854]); // normal approximation, sd ≈ 27.1
    // 1,000 eligible daughters at Standard: SPEC §8.7's 63 % is one minus the chance of none.
    const std = ratesFor('standard', false);
    expect(1 - chanceOfNone(1000, std.module / 2)).toBeCloseTo(moduleGainAttemptChance(std, 1000), 12);
    expect(chanceOfNone(0, 0.001)).toBe(1);
    // ln 0.5 / ln 0.999 ≈ 692.8 daughters: the first second with at least that many.
    expect(medianWaitSecond([0, 100, 500, 692, 693, 900], 0.001)).toBe(4);
    expect(medianWaitSecond([0, 100, 500], 0.001)).toBeNull();
    expect(pct(0.08)).toBe('8 %');
    expect(pct(0.001)).toBe('0.1 %');
    expect(pct(0.1053)).toBe('10.5 %');
    expect(pct(0)).toBe('0 %');
  });
});

describe('sim-tune: an Accelerated run with module gains and a confirmed branch', () => {
  const registry = loadRegistryFs();
  // Seed 130363 at Accelerated gains a Reserve chamber at 30.2 s and confirms a Sunbead branch at 122.8 s
  // (docs/reports/tune-g2.md), so 150 s covers gains, carriers and a confirmation.
  const SECONDS = 150;
  const acc = tuneSeed(registry, {
    recipe: 'FIRST_DISH_V1',
    seed: 130363,
    preset: 'accelerated',
    seconds: SECONDS,
    extendSeconds: SECONDS,
    sampleSeconds: [],
  });
  const plain = realizeRecipe(registry, 'FIRST_DISH_V1', {
    seed: 130363,
    transform: (r) => ({ ...r, mutationPreset: 'accelerated' }),
  });
  runTicks(plain, SECONDS * 10);
  const cp = acc.checkpoint;
  const inh = cp.inheritance;
  // The same seed at Standard (collected here, outside the per-test timeout).
  const std = tuneSeed(registry, {
    recipe: 'FIRST_DISH_V1',
    seed: 130363,
    preset: 'standard',
    seconds: SECONDS,
    extendSeconds: SECONDS,
    sampleSeconds: [],
  });

  it('only observes: the endpoint hash equals a plain Accelerated run', () => {
    expect(plain.settings.mutationPreset).toBe('accelerated');
    expect(cp.hash).toBe(stateHash(plain));
    expect(acc.rates).toEqual(ratesFor('accelerated', false));
  });

  it('tallies every committed daughter and every module change from the birth records', () => {
    const L = plain.lineage;
    expect(L.compacted).toBe(0);
    const born: number[] = [];
    for (let k = 0; k < L.parent.length; k++) if (L.origin[k] === 0) born.push(k);
    expect(inh.daughters).toBe(born.length);
    expect(inh.daughters).toBe(2 * cp.births);
    expect(inh.drawsChecked).toBe(inh.daughters);
    expect(inh.drawsMatched).toBe(inh.daughters);
    expect(inh.mismatches).toBe(0);
    expect(inh.unknown).toBe(0);
    expect(inh.moduleDraws).toBe(inh.gainAttempts + inh.lossAttempts);
    expect(inh.gainAttempts).toBe(inh.gains + inh.gainNoOption);
    expect(inh.lossAttempts).toBe(inh.losses + inh.lossNoOption);
    const gainRecords = born.filter((k) => (L.mutFlags[k]! & MUT_MODULE_GAIN) !== 0);
    const lossRecords = born.filter((k) => (L.mutFlags[k]! & MUT_MODULE_LOSS) !== 0);
    expect(gainRecords.length).toBeGreaterThan(0);
    expect(inh.gains).toBe(gainRecords.length);
    expect(inh.losses).toBe(lossRecords.length);
    expect(inh.events.filter((e) => e.gained).map((e) => e.birthId)).toEqual(gainRecords.map((k) => k + L.base));
    expect(inh.firstGainTick).toBe(L.birthTick[gainRecords[0]!]);
    expect(inh.quantDraws).toBe(born.filter((k) => (L.mutFlags[k]! & (MUT_QUANT | MUT_QUANT_NEUTRAL)) !== 0).length);
    // Cumulative trials per second, ending at the checkpoint's total.
    expect(acc.daughtersBySecond).toHaveLength(SECONDS + 1);
    expect(acc.daughtersBySecond[SECONDS]).toBe(inh.daughters);
    for (let s = 1; s <= SECONDS; s++)
      expect(acc.daughtersBySecond[s]!).toBeGreaterThanOrEqual(acc.daughtersBySecond[s - 1]!);
  });

  it('counts living carriers and confirmed branches as the world records them', () => {
    const c = plain.ents.cols;
    let carriers = 0;
    for (let i = 0; i < plain.ents.highWater; i++)
      if (c.alive[i] === 1) carriers += plain.genomes.get(c.genome[i]!).modules.length;
    expect(carriers).toBeGreaterThan(0);
    const tallied = Object.values(inh.carriersByModule).reduce(
      (a, t) => a + Object.values(t).reduce((x, y) => x + y, 0),
      0,
    );
    expect(tallied).toBe(carriers);
    expect(inh.carrierStates.reduce((a, s) => a + s.alive, 0)).toBe(carriers);
    // Identical founders: every carried module was gained in this dish and is found in the records.
    expect(inh.carriersUnattributed).toBe(0);
    expect(Object.values(inh.carriersFromGain).reduce((a, b) => a + b, 0)).toBe(carriers);
    expect(Object.values(inh.carrierSeconds).reduce((a, s) => a + s.carrierSeconds, 0)).toBeGreaterThan(0);
    // Branch rows mirror the branch book, with the names a player sees.
    expect(plain.branches.established).toBeGreaterThan(0);
    expect(inh.branches.map((b) => b.name)).toEqual(plain.branches.branches.map((br) => generatedBranchName(plain, br)));
    const first = inh.branches[0]!;
    expect(first.traitKind).toBe('module');
    expect(first.membersAtEstablish).toBeGreaterThanOrEqual(5);
    expect(first.depthAtEstablish).toBeGreaterThanOrEqual(3);
    expect(inh.firstBranchTick).toBe(Math.min(...plain.branches.branches.map((b) => b.establishedTick)));
    expect(inh.firstModuleBranchTick).toBe(first.establishedTick);
    expect(inh.firstCandidateTick).not.toBeNull();
    expect(inh.firstCandidateTick!).toBeLessThanOrEqual(inh.firstBranchTick!);
  });

  it('renders both presets: rates, waiting time, carriers, branches, censoring and the side-by-side table', () => {
    const meta: ReportMeta = {
      command: 'test',
      seconds: SECONDS,
      extendSeconds: SECONDS,
      machine: 'test',
      generatedAt: 'test',
      wallSeconds: 0,
    };
    const md = renderReport([acc, std], meta, null);
    for (const heading of [
      '# Development-seed tuning report — FIRST_DISH_V1 (standard, accelerated)',
      '## FIRST_DISH_V1 · Standard (revision 1)',
      '## FIRST_DISH_V1 · Accelerated (revision 1)',
      `### Module draws per daughter trial at the ${SECONDS} s checkpoint`,
      `#### Per-daughter rates, pooled over 1 seeds (${SECONDS} s each)`,
      `#### Per-module rates, pooled over 1 seeds (${SECONDS} s each)`,
      '#### Waiting time for a module gain (Standard; gain attempt 0.1 % per daughter)',
      '#### Waiting time for a module gain (Accelerated; gain attempt 0.5 % per daughter)',
      '#### Module carriers, pooled over 1 seeds',
      `### Branch confirmations by ${SECONDS} s`,
      `## FIRST_DISH_V1: Standard and Accelerated side by side (${SECONDS} s checkpoint)`,
    ])
      expect(md).toContain(heading);
    // The chance of no gain ATTEMPT counts every daughter; the chance of no COMMITTED gain counts only
    // gain-eligible daughters. After the 30.2 s Reserve chamber gain, carriers' daughters are no longer
    // gain-eligible, so the two differ on this seed.
    expect(inh.gainEligible).toBeLessThan(inh.daughters);
    expect(md).toContain(
      `| Seed | Daughters by ${SECONDS} s | Chance of no gain attempt by ${SECONDS} s | Gain-eligible daughters by ${SECONDS} s | Chance of no committed gain by ${SECONDS} s | Median wait for a committed gain (s) | First gain attempt | First gain |`,
    );
    expect(md).toContain(
      `| 130363 | ${inh.daughters} | ${pct(chanceOfNone(inh.daughters, 0.005))} | ${inh.gainEligible} | ${pct(chanceOfNone(inh.gainEligible, 0.005))} |`,
    );
    // Per-module trials, counted independently here from the birth records: a daughter is a trial for a
    // module's gain when its parent could legally gain it; its chance is the gain-attempt chance ÷ the
    // parent's number of legal gains.
    const L = plain.lineage;
    const trials: Record<string, Record<string, number>> = {};
    const expected: Record<string, number> = {};
    for (let k = 0; k < L.parent.length; k++) {
      if (L.origin[k] !== 0) continue;
      const pb = L.parent[k]!;
      expect(pb).toBeGreaterThanOrEqual(L.base);
      const parent = plain.genomes.get(L.genome[pb - L.base]!);
      const sp = plain.species[L.species[k]!]!.id;
      const legal = eligibleGains(plain, parent);
      for (const m of legal) {
        const t = (trials[m] ??= {});
        t[sp] = (t[sp] ?? 0) + 1;
        expected[m] = (expected[m] ?? 0) + 0.005 / legal.length;
      }
    }
    expect(inh.gainTrialsByModule).toEqual(trials);
    for (const m of Object.keys(expected)) expect(inh.expectedGainsByModule[m]!).toBeCloseTo(expected[m]!, 12);
    expect(Object.values(inh.gainsByModule).reduce((a, b) => a + b, 0)).toBe(inh.gains);
    const e05Trials = Object.values(trials.E05!).reduce((a, b) => a + b, 0);
    const e05Gains = inh.gainsByModule.E05!;
    expect(md).toContain(
      `| E05 Reserve chamber | ${e05Trials} (${Object.entries(trials.E05!)
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .map(([s, n]) => `${s} ${n}`)
        .join(', ')}) | ${e05Gains} | ${pct(e05Gains / e05Trials)} (1 in ${Math.round(e05Trials / e05Gains)}) |`,
    );
    // Standard is rendered first whatever the run order.
    expect(md.indexOf('· Standard (revision')).toBeLessThan(md.indexOf('· Accelerated (revision'));
    expect(md).toContain(first(inh.branches).name);
    // Standard has no module gain by 150 s on this seed: censored, never an event at 150 s.
    expect(std.checkpoint.inheritance.firstGainTick).toBeNull();
    expect(md).toContain(
      `| First module gain (committed) | 0/1 | ≥ ${SECONDS}.0 s (not estimable) | — | 1/1 (no event by ${SECONDS} s) |`,
    );
    expect(md).toContain(`${ANALYSIS_START}\n## Observations`);
  });
});

describe('sim-run --preset (the tick-cost command for both presets)', () => {
  const registry = loadRegistryFs();
  const tsx = join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
  const simRun = (...args: string[]) =>
    spawnSync(tsx, [join(REPO_ROOT, 'tools', 'sim-run.ts'), '--recipe', 'FIRST_DISH_V1', '--seed', '130363', ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

  it('realizes the recipe at the chosen preset and reports agents with the tick timing', { timeout: 120_000 }, () => {
    const res = simRun('--ticks', '300', '--preset', 'accelerated', '--perf');
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout) as {
      mutationPreset: string;
      endpointHash: string;
      alive: number;
      perf: {
        wallMs: number;
        tickMs: { p50: number; p95: number; p99: number };
        agents: { start: number; end: number; peak: number; mean: number };
        cpu: { userMs: number; systemMs: number; msPerTick: number; shareOfWall: number };
      };
    };
    const plain = realizeRecipe(registry, 'FIRST_DISH_V1', {
      seed: 130363,
      transform: (r) => ({ ...r, mutationPreset: 'accelerated' }),
    });
    runTicks(plain, 300);
    expect(out.mutationPreset).toBe('accelerated');
    expect(out.endpointHash).toBe(stateHash(plain));
    expect(out.perf.agents.start).toBe(56);
    expect(out.perf.agents.end).toBe(out.alive);
    expect(out.perf.agents.peak).toBeGreaterThanOrEqual(out.perf.agents.end);
    expect(out.perf.agents.mean).toBeGreaterThan(0);
    expect(out.perf.tickMs.p99).toBeGreaterThanOrEqual(out.perf.tickMs.p50);
    // CPU time of the tick loop, per tick, and its share of the loop's wall time.
    const { cpu } = out.perf;
    expect(cpu.userMs + cpu.systemMs).toBeGreaterThan(0);
    expect(cpu.msPerTick).toBeCloseTo((cpu.userMs + cpu.systemMs) / 300, 2);
    expect(cpu.shareOfWall).toBeCloseTo((cpu.userMs + cpu.systemMs) / out.perf.wallMs, 1);
  });

  it('refuses an unknown preset', { timeout: 120_000 }, () => {
    const res = simRun('--ticks', '1', '--preset', 'turbo');
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('--preset must be standard, accelerated or fixed');
  });
});

describe('sim-tune: supplementary horizon, plain-run check, build and integrity', () => {
  const registry = loadRegistryFs();
  const base = { recipe: 'FIRST_DISH_V1', seed: 104729, preset: 'standard' as const, sampleSeconds: [] };
  const meta: ReportMeta = {
    command: 'test',
    seconds: 10,
    extendSeconds: 10,
    horizonSeconds: 20,
    plainCheck: true,
    machine: 'test',
    generatedAt: 'test',
    wallSeconds: 0,
  };
  const withHorizon = tuneSeed(registry, { ...base, seconds: 10, extendSeconds: 10, horizonSeconds: 20 });
  const without = tuneSeed(registry, { ...base, seconds: 10, extendSeconds: 10 });
  withHorizon.plain = plainRunHashes(registry, withHorizon, checkpointsOf(withHorizon).map((c) => c.tick));
  without.plain = plainRunHashes(registry, without, [without.checkpoint.tick]);

  it('the horizon is one more checkpoint of the same run; the D06 checkpoint is unchanged by it', () => {
    expect(withHorizon.checkpoint.tick).toBe(100);
    expect(withHorizon.extended).toBe(false);
    expect(withHorizon.final).toBe(withHorizon.checkpoint);
    expect(withHorizon.horizon!.tick).toBe(200);
    expect(withHorizon.checkpoint.hash).toBe(without.checkpoint.hash);
    const numbers = (r: SeedRun) => JSON.stringify({ ...r.checkpoint, wall: null });
    expect(numbers(withHorizon)).toBe(numbers(without));
    // The D06 sections of the report are the same text with or without the horizon (wall times aside).
    const d06 = (md: string) => md.slice(md.indexOf('## FIRST_DISH_V1 · Standard'), md.indexOf('### Integrity and speed'));
    const a = renderReport([withHorizon], meta, null);
    const b = renderReport([without], { ...meta, horizonSeconds: 0 }, null);
    expect(d06(a)).toBe(d06(b));
    expect(d06(a).length).toBeGreaterThan(1000);
    // The main count series stops at the D06 endpoint; the horizon section has its own.
    expect(a).toContain('## FIRST_DISH_V1 · Standard — supplementary horizon, 20 s (revision 1)');
    expect(a).toContain('### Per seed at 20 s');
    expect(a).toContain(`\`${withHorizon.horizon!.hash}\` | same at 20 s |`);
    expect(b).not.toContain('supplementary horizon');
  });

  it('a plain run (no observer, no hooks) gives the same hash at every checkpoint', () => {
    expect(withHorizon.plain![100]).toBe(withHorizon.checkpoint.hash);
    expect(withHorizon.plain![200]).toBe(withHorizon.horizon!.hash);
    expect(plainMismatches(withHorizon)).toEqual([]);
    expect(integrityProblems([withHorizon, without])).toEqual([]);
    // A differing plain hash is reported in the table and makes the run invalid evidence.
    const tampered: SeedRun = { ...withHorizon, plain: { ...withHorizon.plain!, 200: '0000000000000000' } };
    expect(plainMismatches(tampered)).toEqual([200]);
    expect(integrityProblems([tampered])).toEqual(['FIRST_DISH_V1 standard seed 104729: plain-run hash differs at 20 s']);
    expect(renderReport([tampered], meta, null)).toContain('DIFFERS at 20 s: `0000000000000000`');
  });

  it('prints an endpoint hash only for an extended run (never the checkpoint hash twice)', () => {
    const md = renderReport([without], { ...meta, horizonSeconds: 0 }, null);
    const row = md.split('\n').find((l) => l.startsWith('| 104729 | 10 s | no |'))!;
    expect(row).toBeDefined();
    expect(row.split(without.checkpoint.hash).length - 1).toBe(1);
    expect(row).toContain('— (not extended: the 10 s checkpoint is the endpoint)');
    expect(row).toContain('| same at 10 s |');
  });

  it('takes the horizon during, at or after an extension, and plain hashes agree at each', () => {
    // No mutation by 2 s, so the run is extended to 6 s; the 4 s horizon is taken on the way.
    const mid = tuneSeed(registry, { ...base, seconds: 2, extendSeconds: 6, horizonSeconds: 4 });
    expect(mid.extended).toBe(true);
    expect(checkpointsOf(mid).map((c) => c.tick)).toEqual([20, 40, 60]);
    expect(mid.horizon!.tick).toBe(40);
    const plain = plainRunHashes(registry, mid, [20, 40, 60]);
    expect(checkpointsOf(mid).map((c) => c.hash)).toEqual([plain[20], plain[40], plain[60]]);
    const at = tuneSeed(registry, { ...base, seconds: 2, extendSeconds: 4, horizonSeconds: 4 });
    expect(at.horizon).toBe(at.final);
    expect(checkpointsOf(at).map((c) => c.tick)).toEqual([20, 40]);
  });

  it('names the build and the rule versions in the header', () => {
    const b = buildInfo();
    expect(b.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(Array.isArray(b.simChanges)).toBe(true);
    expect(Array.isArray(b.toolChanges)).toBe(true);
    const clean = { commit: 'a'.repeat(40), simChanges: [], toolChanges: ['tools/sim-tune.ts'] };
    expect(buildLine(clean)).toContain(`git \`${'a'.repeat(40)}\``);
    expect(buildLine(clean)).toContain('are identical to that commit');
    expect(buildLine(clean)).toContain('uncommitted changes (tools/sim-tune.ts)');
    const dirty = { ...clean, simChanges: ['src/sim/tick.ts'] };
    expect(buildLine(dirty)).toContain('**not identical to that commit** (uncommitted: src/sim/tick.ts)');
    expect(buildLine({ commit: null, simChanges: [], toolChanges: [] })).toContain('code revision is unknown');
    const md = renderReport([without], { ...meta, horizonSeconds: 0, build: clean }, null);
    expect(md).toContain(buildLine(clean));
    const m = registry.manifest;
    expect(md).toContain(
      `rule versions (content/manifest.json): simulation 3, evolution rules ${m.evolutionRulesVersion}, module registry ${m.moduleRegistryVersion}, phenotype mapping ${m.phenotypeMappingVersion}, content ${m.contentVersion}; world schema ${SCHEMA_VERSION}.`,
    );
  });

  it('parses --horizon and --plain-check', () => {
    expect(parseTuneArgs([])).toMatchObject({ horizon: 0, plainCheck: false });
    expect(parseTuneArgs(['--horizon', '1200', '--plain-check'])).toMatchObject({ horizon: 1200, plainCheck: true });
    expect(() => parseTuneArgs(['--horizon', '300'])).toThrow(/--horizon/);
  });
});

describe('sim-tune: Starch release carriers, every carrier-second', () => {
  it('tallies the recorded outcome and measures both blockers directly (energy is checked first)', () => {
    const w: World = clearWater();
    const put = (x: number, y: number, e: number): number => {
      const s = introduceOrganism(w, speciesIndex(w, 'B01'), cellIndex(x, y), 'test', {
        modules: ['E01'],
        exactCenter: true,
      });
      w.ents.cols.E[s] = e;
      return s;
    };
    // Starch around two carriers (one with energy, one below the 35 E threshold); none near the others.
    const withStarch = [put(40, 64, 90), put(40, 80, 20)];
    const noStarch = [put(84, 64, 90), put(84, 80, 20)];
    rebuildIndex(w);
    for (const [x, y] of [
      [40, 64],
      [40, 80],
    ] as const)
      for (const i of diskCells(x, y, 4)) setField(w, 'starch', i, 0.6);
    const obs = new InheritanceObserver(w);
    for (let t = 0; t < 10; t++) {
      step(w);
      obs.afterTick(w);
    }
    const c = w.ents.cols;
    const code = (s: number) => c.secretionCode[s];
    expect([...withStarch, ...noStarch].map(code)).toEqual([
      R.SECRETING,
      R.SECRETION_ENERGY_LOW,
      R.SECRETION_NO_SUBSTRATE,
      R.SECRETION_ENERGY_LOW,
    ]);
    // The tool's substrate test agrees with the stage wherever energy let the stage reach it.
    const cell = (s: number) => entityCell(c.x[s]!, c.y[s]!);
    expect(starchWithinReach(w, cell(withStarch[0]!))).toBe(true);
    expect(starchWithinReach(w, cell(noStarch[0]!))).toBe(false);
    const cs = obs.snapshot(w).carrierSeconds['E01 B01']!;
    expect(cs.carrierSeconds).toBe(4);
    expect(cs.outcomes).toEqual({ SECRETING: 1, SECRETION_ENERGY_LOW: 2, SECRETION_NO_SUBSTRATE: 1 });
    expect(cs.secreting).toBe(1);
    expect(cs.starchWithinReach).toBe(2);
    expect(cs.energyAtOrBelowThreshold).toBe(2);
    expect(cs.bothBlocked).toBe(1);
  });
});

function first<T>(xs: readonly T[]): T {
  if (xs.length === 0) throw new Error('empty');
  return xs[0]!;
}
