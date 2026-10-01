/**
 * P2.4 comparison engine (SPEC §13.4, UX §5.6; BUILD_DIRECTIVE P2.4 done-when):
 * - A and B advance by exactly equal tick counts whatever the wall clock does (a fake clock with
 *   irregular frames, pauses, speed changes and 'max' pacing all give the same ticks and hashes);
 * - the baseline is preserved: A's hash equals an untouched duplicate run for the same ticks, A never
 *   receives B's intervention, and the source dish is not advanced or changed;
 * - deleting a comparison never deletes a named dish or save.
 * The real DishHost is driven exactly as sim.worker.ts drives it, with a manual clock.
 */
import { describe, expect, it } from 'vitest';
import { applyNow, type CommandPayload } from '../../src/sim/commands';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, stateHash, type WorldState } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import { PAIRED_RUN_LABEL, runPairedComparison, shannonIndex, type CompareSpeed, type ComparisonState } from '../../src/worker/comparison';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';
import { registry } from '../helpers/world';
import { G2_LISTS, registryWith } from '../helpers/registry';
import { expectWaveAComparison } from '../experiments/golden';

const REG = registry();
const GARDEN = { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } as const;
/** B's intervention: a Feed gesture exactly as the UI sends it (sugar, radius 3). */
const FEED: CommandPayload = { kind: 'deposit', materialId: 'SUGAR', points: [[40.5, 64.5]], radius: 3, dose: 0.5 };
const IDS = { compareId: 'cmp1', aDishId: 'cmpA', bDishId: 'cmpB' };

type Of<T extends FromWorker['type']> = Extract<FromWorker, { type: T }>;

function harness(store: SaveStore | null = null) {
  let now = 0;
  let req = 0;
  const out: FromWorker[] = [];
  const host = new DishHost(REG, (m) => out.push(m), { now: () => now, iso: () => '2026-09-27T00:00:00.000Z' }, store);
  const h = {
    host,
    out,
    /** Send a request and return its reply (sync handlers). */
    ask<T extends FromWorker['type']>(type: T, build: (requestId: number) => ToWorker): Of<T> {
      const requestId = ++req;
      host.handle(build(requestId));
      const reply = out.find((m) => 'requestId' in m && m.requestId === requestId);
      if (!reply) throw new Error(`no reply to request ${requestId}`);
      if (reply.type !== type) throw new Error(`expected ${type}, got ${JSON.stringify(reply).slice(0, 300)}`);
      return reply as Of<T>;
    },
    async askAsync<T extends FromWorker['type']>(type: T, build: (requestId: number) => ToWorker): Promise<Of<T>> {
      const requestId = ++req;
      await host.handleAsync(build(requestId));
      const reply = out.find((m) => 'requestId' in m && m.requestId === requestId);
      if (!reply || reply.type !== type) throw new Error(`expected ${type}, got ${JSON.stringify(reply).slice(0, 300)}`);
      return reply as Of<T>;
    },
    /** One frame of `ms` wall-clock milliseconds. */
    frame(ms: number): void {
      now += ms;
      host.pump();
    },
    world(dishId: string): World {
      const w = host.world(dishId);
      if (!w) throw new Error(`no dish ${dishId}`);
      return w;
    },
    hash(dishId: string): string {
      return h.ask('hash', (requestId) => ({ type: 'hash', requestId, dishId })).hash;
    },
    lastCompare(): ComparisonState {
      const m = out.filter((x): x is Of<'compareState'> => x.type === 'compareState').at(-1);
      if (!m) throw new Error('no comparison state yet');
      return m.state;
    },
    create(dishId: string): void {
      h.ask('ready', (requestId) => ({ type: 'create', requestId, dishId, source: GARDEN }));
    },
    /** Run a dish for a while at 4× so the baseline is not simply tick 0. */
    warm(dishId: string, ticks: number): void {
      host.handle({ type: 'setSpeed', dishId, speed: 4 });
      while (h.world(dishId).tick < ticks) h.frame(25);
      host.handle({ type: 'setSpeed', dishId, speed: 0 });
    },
    start(sourceDishId: string, ids = IDS): ComparisonState {
      return h.ask('compareState', (requestId) => ({ type: 'compareStart', requestId, sourceDishId, ...ids })).state;
    },
    command(dishId: string, commandId: string, payload: CommandPayload): Of<'ack'> {
      return h.ask('ack', (requestId) => ({ type: 'command', requestId, dishId, commandId, payload, undoable: true }));
    },
    runCompare(horizonTicks: number | null, speed: CompareSpeed, compareId = IDS.compareId): ComparisonState {
      return h.ask('compareState', (requestId) => ({ type: 'compareRun', requestId, compareId, horizonTicks, speed })).state;
    },
  };
  return h;
}

/** Irregular frame lengths in ms: dropped frames, zero-length frames, long stalls (pump caps at 250). */
const JITTER_1 = [1, 250, 16, 0, 1000, 33, 7, 120, 2, 400, 16, 16, 90];
const JITTER_2 = [47, 3, 3, 3, 700, 0, 0, 61, 16, 250, 5, 180];

interface Pacing {
  readonly label: string;
  readonly speed: CompareSpeed;
  readonly frames: readonly number[];
  /** Optional mid-run pacing changes: after this many frames, switch to that speed. */
  readonly switches?: readonly (readonly [number, CompareSpeed])[];
}

/**
 * Start a comparison from a warmed Garden, queue the Feed on B, run `horizon` ticks under `pacing`,
 * checking after every frame that A and B hold the same tick. Returns the final state and the frame count.
 */
function pairedRun(pacing: Pacing, horizon: number) {
  const h = harness();
  h.create('src');
  h.warm('src', 57);
  const t0 = h.world('src').tick;
  h.start('src');
  expect(h.command(IDS.bDishId, 'feed-b', FEED).result!.accepted).toBeGreaterThan(0);
  h.runCompare(horizon, pacing.speed);
  let frames = 0;
  let maxPairsInOneFrame = 0;
  while (h.lastCompare().status === 'running') {
    const before = h.world(IDS.aDishId).tick;
    for (const [at, speed] of pacing.switches ?? []) if (frames === at) h.host.handle({ type: 'compareSpeed', compareId: IDS.compareId, speed });
    h.frame(pacing.frames[frames % pacing.frames.length]!);
    frames++;
    const a = h.world(IDS.aDishId).tick;
    const b = h.world(IDS.bDishId).tick;
    expect(b, `after frame ${frames}`).toBe(a);
    expect(a - t0).toBeLessThanOrEqual(horizon);
    maxPairsInOneFrame = Math.max(maxPairsInOneFrame, a - before);
    if (frames > 100_000) throw new Error('comparison never completed');
  }
  const state = h.lastCompare();
  return { h, t0, state, frames, maxPairsInOneFrame };
}

describe('comparison engine (P2.4)', () => {
  it('advances A and B by exactly equal tick counts whatever the wall clock does', () => {
    const HORIZON = 600; // the 60 s horizon
    const runs = [
      pairedRun({ label: '4× irregular', speed: 4, frames: JITTER_1 }, HORIZON),
      pairedRun({ label: 'fast, other jitter', speed: 'max', frames: JITTER_2 }, HORIZON),
      pairedRun({ label: '1× → pause → 2× → fast', speed: 1, frames: JITTER_2, switches: [[5, 0], [40, 2], [120, 'max']] }, HORIZON),
    ];
    for (const r of runs) {
      expect(r.state.status).toBe('complete');
      expect(r.state.ticksRun).toBe(HORIZON);
      expect(r.h.world(IDS.aDishId).tick).toBe(r.t0 + HORIZON);
      expect(r.h.world(IDS.bDishId).tick).toBe(r.t0 + HORIZON);
      const res = r.state.results!;
      expect(res.label).toBe(PAIRED_RUN_LABEL);
      expect(res.ticks).toBe(HORIZON);
      expect(res.a.tick).toBe(res.b.tick);
      expect(res.stoppedEarly).toBe(false);
      // Further frames never move a completed comparison.
      r.h.frame(250);
      expect(r.h.world(IDS.aDishId).tick).toBe(r.t0 + HORIZON);
      expect(r.h.world(IDS.bDishId).tick).toBe(r.t0 + HORIZON);
    }
    // Frame patterns differed wildly (and so did how many pairs ran per frame) ...
    expect(new Set(runs.map((r) => r.frames)).size).toBe(3);
    expect(runs[1]!.maxPairsInOneFrame).toBeGreaterThan(runs[0]!.maxPairsInOneFrame);
    // ... yet the outcomes are identical: the wall clock paced the run and decided nothing.
    const hashesA = runs.map((r) => r.state.results!.a.hash);
    const hashesB = runs.map((r) => r.state.results!.b.hash);
    expect(new Set(hashesA).size).toBe(1);
    expect(new Set(hashesB).size).toBe(1);
    expect(hashesA[0]).not.toBe(hashesB[0]);
  }, 600_000); // three paired 60 s runs: over a minute on a loaded 2-CPU machine

  it('Stop ends both arms at the same tick, with or without a horizon', () => {
    for (const horizon of [null, 600] as const) {
      const h = harness();
      h.create('src');
      const t0 = h.world('src').tick;
      h.start('src');
      h.command(IDS.bDishId, 'feed-b', FEED);
      h.runCompare(horizon, 4);
      for (let k = 0; k < 40; k++) h.frame(JITTER_1[k % JITTER_1.length]!);
      const stopped = h.ask('compareState', (requestId) => ({ type: 'compareStop', requestId, compareId: IDS.compareId })).state;
      expect(stopped.status).toBe('complete');
      const ticks = h.world(IDS.aDishId).tick - t0;
      expect(ticks).toBeGreaterThan(0);
      expect(h.world(IDS.bDishId).tick - t0).toBe(ticks);
      expect(stopped.ticksRun).toBe(ticks);
      expect(stopped.results!.ticks).toBe(ticks);
      expect(stopped.results!.stoppedEarly).toBe(horizon !== null);
      h.frame(250);
      expect(h.world(IDS.aDishId).tick - t0).toBe(ticks);
    }
  });

  it('preserves the baseline: A equals an untouched duplicate, never receives B’s change, and the source is unchanged', () => {
    const TICKS = 300;
    const h = harness();
    h.create('src');
    h.warm('src', 83);
    const t0 = h.world('src').tick;
    const srcHash = h.hash('src');
    const baselineJson = h.ask('saved', (requestId) => ({ type: 'save', requestId, dishId: 'src' })).json;
    const baseline = JSON.parse(baselineJson) as WorldState;

    const started = h.start('src');
    expect(started.status).toBe('setup');
    expect(started.baselineTick).toBe(t0);
    expect(h.hash(IDS.aDishId)).toBe(srcHash);
    expect(h.hash(IDS.bDishId)).toBe(srcHash);
    expect(h.world(IDS.aDishId).worldId).not.toBe(h.world('src').worldId);

    // The baseline arm refuses changes; B takes one through the ordinary command path.
    const refused = h.command(IDS.aDishId, 'feed-a', FEED);
    expect(refused.error).toMatch(/baseline/);
    expect(refused.result).toBeNull();
    expect(h.hash(IDS.aDishId)).toBe(srcHash);
    const fed = h.command(IDS.bDishId, 'feed-b', FEED);
    expect(fed.error).toBeUndefined();
    expect(fed.result!.accepted).toBeGreaterThan(0);
    expect(h.lastCompare().interventions.map((i) => i.commandId)).toEqual(['feed-b']);
    expect(h.hash(IDS.bDishId)).not.toBe(srcHash);
    // A comparison arm's time belongs to the comparison: speed, step and undo requests do nothing.
    h.host.handle({ type: 'setSpeed', dishId: IDS.aDishId, speed: 4 });
    h.host.handle({ type: 'step', dishId: IDS.bDishId });
    h.frame(500);
    expect(h.world(IDS.aDishId).tick).toBe(t0);
    expect(h.world(IDS.bDishId).tick).toBe(t0);
    expect(h.ask('ack', (requestId) => ({ type: 'undo', requestId, dishId: IDS.bDishId })).error).toBeDefined();
    expect(h.lastCompare().interventions).toHaveLength(1);

    h.runCompare(TICKS, 'max');
    for (let k = 0; h.lastCompare().status === 'running'; k++) h.frame(JITTER_2[k % JITTER_2.length]!);
    const res = h.lastCompare().results!;
    expect(res.ticks).toBe(TICKS);

    // An untouched duplicate of the same moment, run for the same ticks by the plain simulation.
    const dup = deserializeWorld(baseline);
    run(dup, TICKS);
    expect(res.a.hash).toBe(stateHash(dup));
    expect(h.hash(IDS.aDishId)).toBe(stateHash(dup));
    // The same duplicate with B's command replayed reproduces B: each arm is simply deterministic.
    const dupB = deserializeWorld(baseline);
    applyNow(dupB, 'feed-b', FEED);
    run(dupB, TICKS);
    expect(res.b.hash).toBe(stateHash(dupB));
    expect(res.a.hash).not.toBe(res.b.hash);

    // A never received B's intervention: no new commands, no external input since the baseline.
    const a = h.world(IDS.aDishId);
    const b = h.world(IDS.bDishId);
    expect(a.commands.log.map((c) => c.commandId)).toEqual(baseline.commands.log.map((c) => c.commandId));
    expect(a.ledger.inputs.c).toBe(baseline.ledger.inputs.c);
    expect(res.a.carbonAdded).toBe(0);
    expect(b.commands.log.map((c) => c.commandId)).toEqual([...baseline.commands.log.map((c) => c.commandId), 'feed-b']);
    expect(res.b.carbonAdded).toBeGreaterThan(0);

    // The source dish was frozen: not advanced, not changed.
    expect(h.world('src').tick).toBe(t0);
    expect(h.hash('src')).toBe(srcHash);

    // After the run nothing more can be queued on B.
    const late = h.command(IDS.bDishId, 'late', FEED);
    expect(late.error).toMatch(/before the run/);
    expect(h.hash(IDS.bDishId)).toBe(res.b.hash);
  }, 30_000);

  it('a change that places nothing leaves B identical to A, and Clear change rebuilds B from the baseline', () => {
    const h = harness();
    h.create('src');
    const srcHash = h.hash('src');
    h.start('src');
    const outside = h.command(IDS.bDishId, 'outside', { ...FEED, points: [[1.5, 1.5]], radius: 1 });
    expect(outside.result?.accepted ?? 0).toBe(0);
    expect(h.hash(IDS.bDishId)).toBe(srcHash);
    expect(h.lastCompare().interventions).toHaveLength(0);
    h.command(IDS.bDishId, 'feed-b', FEED);
    expect(h.hash(IDS.bDishId)).not.toBe(srcHash);
    const cleared = h.ask('compareState', (requestId) => ({ type: 'compareReset', requestId, compareId: IDS.compareId })).state;
    expect(cleared.interventions).toHaveLength(0);
    expect(h.hash(IDS.bDishId)).toBe(srcHash);
    expect(h.hash(IDS.aDishId)).toBe(srcHash);
  });

  it('deleting a comparison never deletes a named dish or save', async () => {
    const backend = new MemoryBackend();
    const h = harness(new SaveStore(backend));
    h.create('src');
    h.warm('src', 31);
    const srcHash = h.hash('src');
    const saved = await h.askAsync('slotSaved', (requestId) => ({ type: 'saveSlot', requestId, dishId: 'src', slotId: 'slot1', name: 'My garden' }));
    expect(saved.slot.name).toBe('My garden');
    const recordsBefore = Object.keys(backend.records).sort();
    const slotsBefore = JSON.stringify(backend.slots);

    const phases = ['setup', 'running', 'complete'] as const;
    for (const [k, phase] of phases.entries()) {
      const ids = { compareId: `cmp-${phase}`, aDishId: `A-${phase}`, bDishId: `B-${phase}` };
      h.start('src', ids);
      h.command(ids.bDishId, `feed-${k}`, FEED);
      // Disposing a comparison world directly is refused while its comparison is open.
      h.host.handle({ type: 'dispose', dishId: ids.aDishId });
      expect(h.host.world(ids.aDishId)).not.toBeNull();
      if (phase !== 'setup') {
        h.runCompare(phase === 'running' ? null : 120, 4, ids.compareId);
        for (let f = 0; f < 30 || (phase === 'complete' && h.lastCompare().status === 'running'); f++) h.frame(JITTER_1[f % JITTER_1.length]!);
        expect(h.lastCompare().status).toBe(phase);
      }
      h.ask('done', (requestId) => ({ type: 'compareDelete', requestId, compareId: ids.compareId }));
      expect(h.host.world(ids.aDishId)).toBeNull();
      expect(h.host.world(ids.bDishId)).toBeNull();
      // The named dish is still here, unchanged; the store was never written or deleted from.
      expect(h.hash('src')).toBe(srcHash);
      expect(Object.keys(backend.records).sort()).toEqual(recordsBefore);
      expect(JSON.stringify(backend.slots)).toBe(slotsBefore);
      const slots = await h.askAsync('slots', (requestId) => ({ type: 'listSlots', requestId }));
      expect(slots.slots.map((s) => [s.slotId, s.name])).toEqual([['slot1', 'My garden']]);
    }
    // The save still opens, at the saved moment.
    const loaded = await h.askAsync('loaded', (requestId) => ({ type: 'loadSlot', requestId, slotId: 'slot1', newDishId: 'reloaded' }));
    expect(loaded.info.name).toBe('My garden');
    expect(h.hash('reloaded')).toBe(srcHash);
    // Deleting an already-deleted comparison is harmless.
    h.ask('done', (requestId) => ({ type: 'compareDelete', requestId, compareId: 'cmp-complete' }));
    expect(h.hash('src')).toBe(srcHash);
  }, 30_000);

  it('only one comparison is open at a time, and a comparison copy cannot start another', () => {
    const h = harness();
    h.create('src');
    h.start('src');
    const again = h.out.length;
    h.host.handle({ type: 'compareStart', requestId: 999, sourceDishId: 'src', compareId: 'x', aDishId: 'xa', bDishId: 'xb' });
    const err = h.out.slice(again).find((m) => m.type === 'error');
    expect(err && err.type === 'error' && err.message).toMatch(/already open/);
    expect(h.host.world('xa')).toBeNull();
  });

  it('results measure this paired run: equal ticks, B − A differences, deaths by cause, traits, modules, diversity', () => {
    const TICKS = 450;
    const world = realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: 'cmp-results' });
    run(world, 120);
    const baseline = serializeWorld(world);
    const { a, b, results } = runPairedComparison(baseline, [{ commandId: 'add-hunters', payload: { kind: 'inoculate', speciesId: 'P01', x: 48.5, y: 64.5, radius: 3, count: 5 } }], TICKS);
    expect(results.label).toBe('this paired run');
    expect(results.ticks).toBe(TICKS);
    expect(a.tick).toBe(baseline.tick + TICKS);
    expect(b.tick).toBe(a.tick);
    expect(results.interventions[0]!.result!.accepted).toBe(5);

    for (const [arm, world2] of [
      [results.a, a],
      [results.b, b],
    ] as const) {
      // Living totals agree with the world.
      let alive = 0;
      for (let i = 0; i < world2.ents.highWater; i++) if (world2.ents.cols.alive[i] === 1) alive++;
      expect(arm.alive).toBe(alive);
      expect(arm.species.reduce((s, x) => s + x.count, 0)).toBe(alive);
      expect(arm.biomass).toBeCloseTo(arm.species.reduce((s, x) => s + x.biomass, 0), 9);
      // Diversity: surviving kinds and Shannon H over living counts.
      const counts = arm.species.map((s) => s.count);
      expect(arm.speciesAlive).toBe(counts.filter((n) => n > 0).length);
      const total = counts.reduce((s, n) => s + n, 0);
      const h = -counts.filter((n) => n > 0).reduce((s, n) => s + (n / total) * Math.log(n / total), 0);
      expect(arm.shannon).toBeCloseTo(h, 12);
      // Every recorded death is counted once, by species and by cause.
      expect(arm.species.reduce((s, x) => s + x.deaths, 0)).toBe(arm.deaths);
      expect(arm.deathsByCause.reduce((s, x) => s + x.count, 0) + arm.deathsUnattributed).toBe(arm.deaths);
      for (const d of arm.deathsByCause) expect(d.name).toMatch(/^DEATH_/);
      // Trait distributions: one entry per active locus per living species, median inside the range.
      for (const t of arm.traits) {
        expect(t.n).toBe(arm.species[t.species]!.count);
        expect(t.min).toBeLessThanOrEqual(t.median);
        expect(t.median).toBeLessThanOrEqual(t.max);
        expect(world2.species[t.species]!.def.lociActive[t.locus]).toBe(true);
      }
      for (const m of arm.modules) {
        expect(m.count).toBeGreaterThan(0);
        expect(m.share).toBeLessThanOrEqual(1);
      }
      expect(arm.capacityLimitedTicks).toBe(arm.capacityIntervals.reduce((s, [f, t]) => s + t - f + 1, 0));
    }
    // Deaths match an independent count of death events over the same ticks.
    const check = deserializeWorld(baseline);
    const before = check.events.totals.death ?? 0;
    for (let k = 0; k < TICKS; k++) step(check);
    expect(results.a.deaths).toBe((check.events.totals.death ?? 0) - before);
    // Every row is A, B and the absolute difference B − A.
    for (const r of results.rows) expect(r.diff).toBeCloseTo(r.b - r.a, 12);
    const aliveRow = results.rows.find((r) => r.key === 'alive')!;
    expect([aliveRow.a, aliveRow.b]).toEqual([results.a.alive, results.b.alive]);
    const hunters = results.rows.find((r) => r.key === 'speciesCount' && r.species === a.species.findIndex((s) => s.id === 'P01'));
    expect(hunters).toBeDefined();
    expect(results.a.carbonAdded).toBe(0);
    expect(results.b.carbonAdded).toBeGreaterThan(0); // five introduced organisms are external carbon
  }, 30_000);

  it('diversity index is Shannon H over living counts', () => {
    expect(shannonIndex([])).toBe(0);
    expect(shannonIndex([0, 7, 0])).toBe(0);
    expect(shannonIndex([3, 3])).toBeCloseTo(Math.log(2), 12);
    expect(shannonIndex([5, 5, 5, 5])).toBeCloseTo(Math.log(4), 12);
    expect(shannonIndex([9, 1])).toBeLessThan(shannonIndex([5, 5]));
  });
});

describe('one paired-run measurement model (SPEC §13.4): the comparison engine and experiment cards share it', () => {
  it('reproduces every number wave A recorded for three comparisons (hunters, feed, starch)', () => {
    // Wave A's numbers are Phase 2 numbers: the worlds are realized under the g2 lists (Phase 3
    // preflight, D-0036; g3-plan-recheck G4), so later phases' manifests never move them.
    const G2 = registryWith(G2_LISTS);
    const hunters = realizeRecipe(G2, 'FIRST_DISH_V1', { worldId: 'cmp-results' });
    run(hunters, 120);
    expectWaveAComparison(
      'hunters',
      runPairedComparison(serializeWorld(hunters), [{ commandId: 'add-hunters', payload: { kind: 'inoculate', speciesId: 'P01', x: 48.5, y: 64.5, radius: 3, count: 5 } }], 450).results,
    );
    const feed = realizeRecipe(G2, 'FIRST_DISH_V1', { worldId: 'cmp-feed' });
    run(feed, 57);
    expectWaveAComparison('feed', runPairedComparison(serializeWorld(feed), [{ commandId: 'feed-b', payload: { kind: 'deposit', materialId: 'SUGAR', points: [[40.5, 64.5]], radius: 3, dose: 0.5 } }], 600).results);
    const starch = realizeRecipe(G2, 'STARCH_UNLOCK_V1', { worldId: 'cmp-starch' });
    expectWaveAComparison(
      'starch',
      runPairedComparison(serializeWorld(starch), [{ commandId: 'starch-b', payload: { kind: 'deposit', materialId: 'STARCH', points: [[60.5, 64.5]], radius: 2, dose: 0.5 } }], 300).results,
    );
  }, 600_000); // three paired runs (45 s, 60 s, 30 s): over a minute on a loaded 2-CPU machine
});
