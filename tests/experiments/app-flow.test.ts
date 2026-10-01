/**
 * Experiment cards in the app (P2.5; SPEC §13.2, §13.4): the worker host starts a card as a new
 * paused dish, a paired card through the comparison engine with the card's change on B, watches the
 * gate with the same GateWatch as the headless runner and posts the journal stamp; the world keeps
 * running. The app's arms and numbers are the headless runner's, exactly; nothing the UI sends can
 * change a card's recipe or seed. The real DishHost is driven as sim.worker.ts drives it, with a
 * manual clock.
 */
import { describe, expect, it } from 'vitest';
import type { CommandPayload } from '../../src/sim/commands';
import { experimentOf, realizeExperimentArms, runExperiment } from '../../src/sim/experiments';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { experimentEndedText, stampToastText } from '../../src/ui/strings/experiments';
import { realizeRecipe } from '../../src/sim/recipes';
import { serializeWorld, stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import type { ComparisonState } from '../../src/worker/comparison';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';
import { registry } from './helpers';

type Of<T extends FromWorker['type']> = Extract<FromWorker, { type: T }>;
const FEED: CommandPayload = { kind: 'deposit', materialId: 'SUGAR', points: [[40.5, 64.5]], radius: 3, dose: 0.5 };

function harness() {
  let now = 0;
  let req = 0;
  const out: FromWorker[] = [];
  const host = new DishHost(registry(), (m) => out.push(m), { now: () => now, iso: () => '2026-09-28T00:00:00.000Z' });
  const h = {
    host,
    out,
    ask<T extends FromWorker['type']>(type: T, build: (requestId: number) => ToWorker): Of<T> {
      const requestId = ++req;
      host.handle(build(requestId));
      const reply = out.find((m) => 'requestId' in m && m.requestId === requestId);
      if (!reply) throw new Error(`no reply to request ${requestId}`);
      if (reply.type !== type) throw new Error(`expected ${type}, got ${JSON.stringify(reply).slice(0, 400)}`);
      return reply as Of<T>;
    },
    frame(ms: number): void {
      now += ms;
      host.pump();
    },
    world(id: string): World {
      const w = host.world(id);
      if (!w) throw new Error(`no dish ${id}`);
      return w;
    },
    stamps: () => out.filter((m): m is Of<'experimentStamp'> => m.type === 'experimentStamp'),
    lastCompare(): ComparisonState {
      const m = out.filter((x): x is Of<'compareState'> => x.type === 'compareState').at(-1);
      if (!m) throw new Error('no comparison state');
      return m.state;
    },
  };
  return h;
}

const IDS = { compareId: 'xp1', aDishId: 'xp1-A', bDishId: 'xp1-B' };

describe('Notebook → Experiments: the catalog', () => {
  it('lists the eleven cards with every part SPEC §13.2 names, from recorded content', () => {
    const h = harness();
    const cards = h.ask('experimentCatalog', (requestId) => ({ type: 'experimentCatalog', requestId })).cards;
    expect(cards.map((c) => c.id)).toEqual(['EXP_101', 'EXP_102', 'EXP_103', 'EXP_106', 'EXP_201', 'EXP_202', 'EXP_203', 'EXP_204', 'EXP_A', 'EXP_B', 'EXP_C']);
    for (const c of cards) {
      for (const text of [c.question, c.recipeName, c.intervention, c.predictedTradeoff, c.confounds, c.journalStamp]) expect(text.length, c.id).toBeGreaterThan(0);
      expect(c.measurements.length).toBeGreaterThan(0);
      expect(c.stoppingSeconds).toBeGreaterThan(0);
      expect(c.gate.length).toBeGreaterThan(0);
      expect(c.seed).toBe(registry().experiments[c.id]!.seed);
    }
    expect(cards.find((c) => c.id === 'EXP_C')!.labels).toContain('Seeded traits demonstration');
    expect(cards.find((c) => c.id === 'EXP_A')!.change).toEqual({ kind: 'omitPatch', patchIndex: 1 });
  });
});

describe('a paired card runs through the comparison engine exactly as the headless runner runs it', () => {
  it('Experiment A: new paused dish, change on B, gate reached, stamp and numbers identical to the fixture', () => {
    const headless = runExperiment(registry(), 'EXP_A');
    const h = harness();
    const started = h.ask('experimentStarted', (requestId) => ({ type: 'experimentStart', requestId, cardId: 'EXP_A', newDishId: 'xp-dish', compare: IDS }));
    // A new paused dish from the card's recorded recipe and seed.
    expect(started.info.dishId).toBe('xp-dish');
    expect(started.info.seed).toBe(104729);
    expect(started.info.recipeId).toBe('STARCH_UNLOCK_V1');
    expect(started.info.name).toBe('What unlocks starch');
    const src = h.world('xp-dish');
    expect(src.tick).toBe(0);
    expect(src.content.provenance).toMatchObject({ recipeId: 'STARCH_UNLOCK_V1', recipeRevision: 1, createdFrom: 'experiment', experimentId: 'EXP_A' });
    // The paired run is open in setup with the card's change on B: the arms are the headless arms.
    const c = started.compare!;
    expect(c.status).toBe('setup');
    expect(c.experiment).toMatchObject({ cardId: 'EXP_A', horizonTicks: 1800, change: { kind: 'omitPatch', patchIndex: 1 }, stamp: null, measured: null });
    expect(c.experiment!.gate!.reached).toBe(false);
    const arms = realizeExperimentArms(registry(), 'EXP_A');
    expect(stateHash(h.world(IDS.aDishId))).toBe(stateHash(arms.A));
    expect(stateHash(h.world(IDS.bDishId))).toBe(stateHash(arms.B!));
    expect(stateHash(src)).toBe(stateHash(arms.A));
    expect(h.world(IDS.bDishId).fields.starch!.every((v) => v === 0)).toBe(true);
    // The card's change is the one change: B takes no other, and it cannot be cleared.
    const refused = h.ask('ack', (requestId) => ({ type: 'command', requestId, dishId: IDS.bDishId, commandId: 'extra', payload: FEED, undoable: true }));
    expect(refused.error).toMatch(/one change/);
    h.host.handle({ type: 'compareReset', requestId: 999, compareId: IDS.compareId });
    expect(h.out.find((m) => m.type === 'error' && m.requestId === 999)).toBeDefined();
    expect(stateHash(h.world(IDS.bDishId))).toBe(stateHash(arms.B!));

    // Run: the UI's horizon is ignored — the card runs to its own stopping point.
    h.ask('compareState', (requestId) => ({ type: 'compareRun', requestId, compareId: IDS.compareId, horizonTicks: 600, speed: 'max' }));
    for (let k = 0; h.lastCompare().status === 'running'; k++) {
      h.frame(k % 3 === 0 ? 250 : 16);
      if (k > 100_000) throw new Error('never completed');
    }
    const done = h.lastCompare();
    expect(done.status).toBe('complete');
    expect(done.ticksRun).toBe(1800);
    // One stamp, identical to the headless runner's, with the card's measurements at that moment.
    const stamps = h.stamps();
    expect(stamps).toHaveLength(1);
    const s = stamps[0]!.stamp;
    expect(stamps[0]!.dishId).toBe('xp-dish');
    expect(s.label).toBe('this paired run');
    expect(s.stamp).toEqual(headless.stamp);
    expect(s.measured.A).toEqual(headless.A.reported);
    expect(s.measured.B).toEqual(headless.B!.reported);
    expect(done.experiment!.stamp).toEqual(headless.stamp);
    expect(done.experiment!.gate).toEqual(headless.gate);
    expect(done.experiment!.measured).toEqual({ A: headless.A.reported, B: headless.B!.reported });
    // Same worlds at the end.
    expect(done.results!.a.hash).toBe(headless.A.endHash);
    expect(done.results!.b.hash).toBe(headless.B!.endHash);
    expect(done.results!.label).toBe('this paired run');
    // Closing the comparison discards A and B only; the experiment's dish stays, unchanged.
    h.ask('done', (requestId) => ({ type: 'compareDelete', requestId, compareId: IDS.compareId }));
    expect(h.host.world(IDS.aDishId)).toBeNull();
    expect(stateHash(h.world('xp-dish'))).toBe(stateHash(arms.A));
  }, 300_000);

  it('Experiment B: the dish is prepared to the copy moment (120 s) and B holds the card’s two Amoebae', () => {
    const h = harness();
    const started = h.ask('experimentStarted', (requestId) => ({ type: 'experimentStart', requestId, cardId: 'EXP_B', newDishId: 'xp-b', compare: IDS }));
    const arms = realizeExperimentArms(registry(), 'EXP_B');
    const c = started.compare!;
    expect(c.baselineTick).toBe(1200);
    expect(c.experiment!.horizonTicks).toBe(1800);
    expect(c.interventions.map((i) => [i.commandId, i.result])).toEqual(arms.interventions.map((i) => [i.commandId, i.result]));
    expect(stateHash(h.world(IDS.aDishId))).toBe(arms.baselineHash);
    expect(stateHash(h.world(IDS.bDishId))).toBe(stateHash(arms.B!));
    expect(stateHash(h.world('xp-b'))).toBe(arms.baselineHash);
  }, 300_000);

  // P2.5 fix wave (item 8): Predator balance lists "view the comparison" and "read the prey history".
  it('Predator balance: the results complete one step; the stamp waits for the population history, then equals the headless one', () => {
    const headless = runExperiment(registry(), 'EXP_106');
    expect(headless.stamp).not.toBeNull();
    const h = harness();
    const started = h.ask('experimentStarted', (requestId) => ({ type: 'experimentStart', requestId, cardId: 'EXP_106', newDishId: 'xp-106', compare: IDS }));
    expect(started.compare!.experiment!.steps).toEqual([
      { step: 'viewComparison', done: false },
      { step: 'viewPreyHistory', done: false },
    ]);
    // A history read before the results exist is not "reading the prey history" of the run.
    h.ask('history', (requestId) => ({ type: 'history', requestId, dishId: IDS.bDishId }));
    h.ask('compareState', (requestId) => ({ type: 'compareRun', requestId, compareId: IDS.compareId, horizonTicks: 1800, speed: 'max' }));
    for (let k = 0; h.lastCompare().status === 'running'; k++) {
      h.frame(k % 3 === 0 ? 250 : 16);
      if (k > 100_000) throw new Error('never completed');
    }
    const done = h.lastCompare();
    expect(done.status).toBe('complete');
    // The measured gate held at the stopping point and the results are shown, but no stamp yet.
    expect(done.experiment!.gate).toEqual(headless.gate);
    expect(done.experiment!.steps).toEqual([
      { step: 'viewComparison', done: true },
      { step: 'viewPreyHistory', done: false },
    ]);
    expect(done.experiment!.stamp).toBeNull();
    expect(h.stamps()).toHaveLength(0);
    // The results' population history reads both copies' history: that is the step.
    h.ask('history', (requestId) => ({ type: 'history', requestId, dishId: IDS.aDishId }));
    h.ask('history', (requestId) => ({ type: 'history', requestId, dishId: IDS.bDishId }));
    const stamps = h.stamps();
    expect(stamps).toHaveLength(1);
    expect(stamps[0]!.dishId).toBe('xp-106');
    expect(stamps[0]!.stamp.stamp).toEqual(headless.stamp);
    expect(stamps[0]!.stamp.measured).toEqual({ A: headless.A.reported, B: headless.B!.reported });
    const after = h.lastCompare();
    expect(after.experiment!.stamp).toEqual(headless.stamp);
    expect(after.experiment!.steps.every((st) => st.done)).toBe(true);
  }, 300_000);

  it('refuses without changing anything: an unknown card, a paired card without ids, a second open comparison', () => {
    const h = harness();
    const err = (msg: ToWorker) => {
      const before = h.out.length;
      h.host.handle(msg);
      return h.out.slice(before).find((m) => m.type === 'error');
    };
    expect(err({ type: 'experimentStart', requestId: 901, cardId: 'EXP_Z', newDishId: 'z', compare: null })).toBeDefined();
    expect(err({ type: 'experimentStart', requestId: 902, cardId: 'EXP_A', newDishId: 'z', compare: null })).toBeDefined();
    expect(h.host.world('z')).toBeNull();
    h.ask('experimentStarted', (requestId) => ({ type: 'experimentStart', requestId, cardId: 'EXP_A', newDishId: 'first', compare: IDS }));
    expect(err({ type: 'experimentStart', requestId: 903, cardId: 'EXP_102', newDishId: 'second', compare: { compareId: 'c2', aDishId: 'c2-A', bDishId: 'c2-B' } })).toBeDefined();
    expect(h.host.world('second')).toBeNull();
    expect(h.host.world('c2-A')).toBeNull();
  });
});

describe('a single-arm card watches its own dish while it runs', () => {
  // Behaviour changed by the P2.5 fix wave (item 8): the card lists "resource history opened" (CT §10.1),
  // so the stamp waits for that step; before, the measured gate alone granted it.
  it('Cleaning crew: the measured gate holds while the dish runs; the stamp waits for the history to be opened, then equals the headless one; the dish keeps running', () => {
    const headless = runExperiment(registry(), 'EXP_103', { stopAtSecond: 30 });
    const h = harness();
    const started = h.ask('experimentStarted', (requestId) => ({ type: 'experimentStart', requestId, cardId: 'EXP_103', newDishId: 'crew', compare: null }));
    expect(started.compare).toBeNull();
    expect(started.info.seed).toBe(103);
    expect(started.info.recipeId).toBe('CLEANING_CREW_V1');
    h.host.handle({ type: 'setSpeed', dishId: 'crew', speed: 4 });
    while (h.world('crew').tick < 300) h.frame(25);
    // The measured gate held at 12 s; the measured gate alone does not grant the stamp.
    expect(headless.stamp!.reachedAtSecond).toBeLessThan(30);
    expect(h.stamps()).toHaveLength(0);
    // Opening History (the History sheet asks the worker for the dish's history) is the listed step.
    h.ask('history', (requestId) => ({ type: 'history', requestId, dishId: 'crew', lastSeconds: 300 }));
    const stamps = h.stamps();
    expect(stamps).toHaveLength(1);
    expect(stamps[0]!.stamp.label).toBe('this run');
    expect(stamps[0]!.stamp.stamp).toEqual(headless.stamp);
    expect(stamps[0]!.stamp.measured.B).toBeNull();
    // The world kept running past the gate (12 s) and is exactly the untouched recipe: observation only.
    const w = h.world('crew');
    expect(w.tick).toBeGreaterThanOrEqual(300);
    const plain = realizeRecipe(registry(), 'CLEANING_CREW_V1');
    run(plain, w.tick);
    expect(stateHash(w)).toBe(stateHash(plain));
  }, 300_000);

  it('a step taken before the gate counts: history opened at 0 s, the stamp arrives on the gate tick', () => {
    const headless = runExperiment(registry(), 'EXP_103', { stopAtSecond: 20 });
    const h = harness();
    h.ask('experimentStarted', (requestId) => ({ type: 'experimentStart', requestId, cardId: 'EXP_103', newDishId: 'crew', compare: null }));
    h.ask('history', (requestId) => ({ type: 'history', requestId, dishId: 'crew' }));
    expect(h.stamps()).toHaveLength(0);
    h.host.handle({ type: 'setSpeed', dishId: 'crew', speed: 4 });
    while (h.world('crew').tick < headless.stamp!.reachedAtSecond * 10) h.frame(25);
    expect(h.stamps().map((m) => m.stamp.stamp)).toEqual([headless.stamp]);
  }, 120_000);

  it('Food trail: a command that places nothing keeps the observation; the stamp waits for the inspector to show a Sprinter eating', () => {
    const headless = runExperiment(registry(), 'EXP_101', { stopAtSecond: 20 });
    const h = harness();
    h.ask('experimentStarted', (requestId) => ({ type: 'experimentStart', requestId, cardId: 'EXP_101', newDishId: 'trail', compare: null }));
    // A deposit outside the round dish places nothing (accepted 0): the dish is unchanged, the card keeps observing.
    const outside: CommandPayload = { kind: 'deposit', materialId: 'SUGAR', points: [[1.5, 1.5]], radius: 0, dose: 0.5 };
    const ack = h.ask('ack', (requestId) => ({ type: 'command', requestId, dishId: 'trail', commandId: 'miss', payload: outside, undoable: true }));
    expect(ack.result).toEqual({ accepted: 0, rejected: 1 });
    expect(h.out.filter((m) => m.type === 'experimentEnded')).toEqual([]);
    h.host.handle({ type: 'setSpeed', dishId: 'trail', speed: 4 });
    while (h.world('trail').tick < 150) h.frame(25); // past the card's 7 s gate
    expect(headless.stamp!.reachedAtSecond).toBeLessThan(15);
    // The measured gate alone does not grant the stamp.
    expect(h.stamps()).toHaveLength(0);
    h.host.handle({ type: 'setSpeed', dishId: 'trail', speed: 0 });
    const w = h.world('trail');
    const c = w.ents.cols;
    const b01 = w.species.findIndex((sp) => sp.id === 'B01');
    const view = (birthId: number) => h.host.handle({ type: 'view', dishId: 'trail', overlay: null, selection: { kind: 'entity', birthId } });
    // Selecting a cell, or an organism that no longer exists, is not the step.
    h.host.handle({ type: 'view', dishId: 'trail', overlay: null, selection: { kind: 'cell', cell: 64 * 128 + 50 } });
    view(999_999);
    const idle: number[] = [];
    const eating: number[] = [];
    for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && c.species[i] === b01) (c.intakeLastSecond[i]! > 0 ? eating : idle).push(c.birthId[i]!);
    // A Sprinter the inspector shows without food use is not the step either.
    for (const id of idle) view(id);
    expect(h.stamps()).toHaveLength(0);
    expect(eating.length).toBeGreaterThan(0);
    view(eating[0]!);
    const stamps = h.stamps();
    expect(stamps).toHaveLength(1);
    // The stamp is the one recorded when the measured gate held (the headless runner's), not a later moment.
    expect(stamps[0]!.stamp.stamp).toEqual(headless.stamp);
    expect(stamps[0]!.stamp.label).toBe('this run');
    // Observation only: the world is exactly the recipe run for the same ticks (the refused command changed nothing but the command counter).
    const plain = realizeRecipe(registry(), 'FOOD_TRAIL_V1', { seed: 101 });
    run(plain, w.tick);
    expect(serializeWorld(w).entities).toEqual(serializeWorld(plain).entities);
    expect(serializeWorld(w).fields).toEqual(serializeWorld(plain).fields);
  }, 120_000);

  it('a change to a single-arm dish ends its observation: no stamp, and the dish goes on as the player made it', () => {
    const h = harness();
    h.ask('experimentStarted', (requestId) => ({ type: 'experimentStart', requestId, cardId: 'EXP_101', newDishId: 'trail', compare: null }));
    const ack = h.ask('ack', (requestId) => ({ type: 'command', requestId, dishId: 'trail', commandId: 'feed', payload: FEED, undoable: true }));
    expect(ack.result!.accepted).toBeGreaterThan(0);
    expect(h.out.filter((m) => m.type === 'experimentEnded')).toEqual([expect.objectContaining({ dishId: 'trail', cardId: 'EXP_101', reason: 'changed' })]);
    h.host.handle({ type: 'setSpeed', dishId: 'trail', speed: 4 });
    while (h.world('trail').tick < 150) h.frame(25); // past the card's 7 s gate on the unchanged recipe
    expect(h.stamps()).toHaveLength(0);
  }, 120_000);
});

describe('a reopened experiment dish (P2.5 fix wave, item 7)', () => {
  it('a card’s dish keeps its card in its saved provenance; any other dish has none', async () => {
    const arms = realizeExperimentArms(registry(), 'EXP_103', { worldIds: { A: 'crew' } });
    expect(experimentOf(arms.A)).toBe('EXP_103');
    const { text } = await buildSaveFile(arms.A, { name: 'Cleaning crew', savedAt: '2026-09-28T00:00:00.000Z', recipeId: 'CLEANING_CREW_V1' });
    const { world } = await loadSaveFile(text);
    expect(experimentOf(world)).toBe('EXP_103');
    expect(experimentOf(realizeRecipe(registry(), 'CLEANING_CREW_V1'))).toBeNull();
  });

  it('the worker says so when a card’s dish is opened again (never a silent stop); other dishes get no notice', async () => {
    const h = harness();
    h.ask('experimentStarted', (requestId) => ({ type: 'experimentStart', requestId, cardId: 'EXP_103', newDishId: 'crew', compare: null }));
    const { text } = await buildSaveFile(h.world('crew'), { name: 'Cleaning crew', savedAt: '2026-09-28T00:00:00.000Z', recipeId: 'CLEANING_CREW_V1' });
    const plain = await buildSaveFile(realizeRecipe(registry(), 'CLEANING_CREW_V1'), { name: 'Plain', savedAt: '2026-09-28T00:00:00.000Z', recipeId: 'CLEANING_CREW_V1' });
    const ended = () => h.out.filter((m): m is Of<'experimentEnded'> => m.type === 'experimentEnded');
    await h.host.handleAsync({ type: 'importDish', requestId: 5001, text: plain.text, newDishId: 'plain' });
    expect(ended()).toEqual([]);
    await h.host.handleAsync({ type: 'importDish', requestId: 5002, text, newDishId: 'crew-again' });
    expect(ended().map(({ dishId, cardId, reason }) => ({ dishId, cardId, reason }))).toEqual([{ dishId: 'crew-again', cardId: 'EXP_103', reason: 'closed' }]);
    // The reopened dish has no observer: running it past the gate stamps nothing.
    h.host.handle({ type: 'setSpeed', dishId: 'crew-again', speed: 4 });
    h.ask('history', (requestId) => ({ type: 'history', requestId, dishId: 'crew-again' }));
    while (h.world('crew-again').tick < 200) h.frame(25);
    expect(h.stamps()).toHaveLength(0);
  }, 120_000);

  it('says plainly why a reopened card no longer observes, and never claims a paired run keeps running', () => {
    const closed = experimentEndedText('closed', 'Cleaning crew');
    expect(closed).toContain('it is not watching now');
    expect(closed).toContain('If the card already stamped');
    expect(experimentEndedText('changed', 'Food trail')).toContain('You changed the dish');
    expect(stampToastText('Measured sugar made from starch', true, true)).not.toMatch(/keeps running/);
    expect(stampToastText('Watched a cleaning crew eat debris', false, true)).toContain('The dish keeps running.');
  });
});

// Wave B fix round 2 (fix1-experiments-verify): a refused command is no undo point; Undo cannot rewind a
// card's observer; once the measured gate has held, a change keeps the held stamp waiting for its step.
describe('Undo, refused commands and a held stamp on a single-arm card', () => {
  const OUTSIDE: CommandPayload = { kind: 'deposit', materialId: 'SUGAR', points: [[1.5, 1.5]], radius: 0, dose: 0.5 };
  const ended = (h: ReturnType<typeof harness>) => h.out.filter((m): m is Of<'experimentEnded'> => m.type === 'experimentEnded');
  const waiting = (h: ReturnType<typeof harness>) => h.out.filter((m): m is Of<'experimentWaiting'> => m.type === 'experimentWaiting');

  it('a refused command arms no Undo: the verifier’s refused-command + Undo sequence stamps the headless values (EXP_103)', () => {
    const headless = runExperiment(registry(), 'EXP_103', { stopAtSecond: 30 });
    const h = harness();
    h.ask('experimentStarted', (requestId) => ({ type: 'experimentStart', requestId, cardId: 'EXP_103', newDishId: 'crew', compare: null }));
    const miss = h.ask('ack', (requestId) => ({ type: 'command', requestId, dishId: 'crew', commandId: 'miss', payload: OUTSIDE, undoable: true }));
    expect(miss.result).toEqual({ accepted: 0, rejected: 1 });
    expect(h.out.filter((m): m is Of<'snapshot'> => m.type === 'snapshot').at(-1)!.undoAvailable).toBe(false);
    h.host.handle({ type: 'setSpeed', dishId: 'crew', speed: 4 });
    while (h.world('crew').tick < 100) h.frame(25);
    h.host.handle({ type: 'setSpeed', dishId: 'crew', speed: 0 });
    const tick = h.world('crew').tick;
    // Nothing to undo: time is not rewound, so the observer's count stays true.
    const undo = h.ask('ack', (requestId) => ({ type: 'undo', requestId, dishId: 'crew' }));
    expect(undo.error).toBe('nothing to undo');
    expect(h.world('crew').tick).toBe(tick);
    h.ask('history', (requestId) => ({ type: 'history', requestId, dishId: 'crew' }));
    h.host.handle({ type: 'setSpeed', dishId: 'crew', speed: 4 });
    while (h.world('crew').tick < 300) h.frame(25);
    expect(ended(h)).toEqual([]);
    expect(h.stamps().map((m) => m.stamp.stamp)).toEqual([headless.stamp]);
    expect(h.stamps()[0]!.stamp.stamp.reachedAtSecond).toBe(12);
  }, 120_000);

  it('a refused command leaves an earlier undo point exactly as it was', () => {
    const h = harness();
    h.ask('ready', (requestId) => ({ type: 'create', requestId, dishId: 'g', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } }));
    const start = stateHash(h.world('g'));
    expect(h.ask('ack', (requestId) => ({ type: 'command', requestId, dishId: 'g', commandId: 'feed', payload: FEED, undoable: true })).result!.accepted).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) h.host.handle({ type: 'step', dishId: 'g' });
    expect(h.ask('ack', (requestId) => ({ type: 'command', requestId, dishId: 'g', commandId: 'miss', payload: OUTSIDE, undoable: true })).result).toEqual({ accepted: 0, rejected: 1 });
    // Undo goes back to before the feed (the last change), not to before the refused command.
    expect(h.ask('ack', (requestId) => ({ type: 'undo', requestId, dishId: 'g' })).error).toBeUndefined();
    expect(h.world('g').tick).toBe(0);
    expect(stateHash(h.world('g'))).toBe(start);
  });

  it('Undo that rewinds a card’s observation ends it truthfully (“undone”): the observer cannot rewind', () => {
    const h = harness();
    h.ask('experimentStarted', (requestId) => ({ type: 'experimentStart', requestId, cardId: 'EXP_103', newDishId: 'crew', compare: null }));
    // A notebook label sent as undoable (the protocol allows it) keeps the observation and is an undo point.
    const w = h.world('crew');
    let founder = -1;
    for (let i = 0; i < w.ents.highWater && founder < 0; i++) if (w.ents.cols.alive[i] === 1) founder = w.ents.cols.birthId[i]!;
    const label = h.ask('ack', (requestId) => ({ type: 'command', requestId, dishId: 'crew', commandId: 'keep', payload: { kind: 'lineage', op: 'saveSpecimen', from: 'organism', id: founder }, undoable: true }));
    expect(label.result!.accepted).toBe(1);
    expect(ended(h)).toEqual([]);
    h.host.handle({ type: 'setSpeed', dishId: 'crew', speed: 4 });
    while (h.world('crew').tick < 60) h.frame(25);
    expect(h.ask('ack', (requestId) => ({ type: 'undo', requestId, dishId: 'crew' })).error).toBeUndefined();
    expect(h.world('crew').tick).toBe(0);
    expect(ended(h)).toEqual([expect.objectContaining({ dishId: 'crew', cardId: 'EXP_103', reason: 'undone' })]);
    h.ask('history', (requestId) => ({ type: 'history', requestId, dishId: 'crew' }));
    h.host.handle({ type: 'setSpeed', dishId: 'crew', speed: 4 });
    while (h.world('crew').tick < 200) h.frame(25);
    expect(h.stamps()).toHaveLength(0);
    expect(experimentEndedText('undone', 'Cleaning crew')).toMatch(/Undo rewound the dish.*cannot be rewound/);
  }, 120_000);

  it('after the measured gate held, a feed and its Undo keep the held stamp (gate-moment values) waiting for the step (EXP_103)', () => {
    const headless = runExperiment(registry(), 'EXP_103', { stopAtSecond: 30 });
    const h = harness();
    h.ask('experimentStarted', (requestId) => ({ type: 'experimentStart', requestId, cardId: 'EXP_103', newDishId: 'crew', compare: null }));
    h.host.handle({ type: 'setSpeed', dishId: 'crew', speed: 4 });
    while (h.world('crew').tick < 200) h.frame(25);
    h.host.handle({ type: 'setSpeed', dishId: 'crew', speed: 0 });
    expect(h.stamps()).toHaveLength(0);
    // The dish is told once which step the held stamp waits for (its notice).
    expect(waiting(h).map(({ dishId, cardId, reachedAtSecond, missing }) => ({ dishId, cardId, reachedAtSecond, missing }))).toEqual([
      { dishId: 'crew', cardId: 'EXP_103', reachedAtSecond: 12, missing: ['openResourceHistory'] },
    ]);
    const feed = h.ask('ack', (requestId) => ({ type: 'command', requestId, dishId: 'crew', commandId: 'feed', payload: FEED, undoable: true }));
    expect(feed.result!.accepted).toBe(29);
    expect(ended(h)).toEqual([]);
    // Undo returns to tick 200, after the gate moment: the held stamp still stands.
    expect(h.ask('ack', (requestId) => ({ type: 'undo', requestId, dishId: 'crew' })).error).toBeUndefined();
    expect(h.world('crew').tick).toBe(200);
    expect(ended(h)).toEqual([]);
    h.ask('history', (requestId) => ({ type: 'history', requestId, dishId: 'crew' }));
    const stamps = h.stamps();
    expect(stamps).toHaveLength(1);
    expect(stamps[0]!.stamp.stamp).toEqual(headless.stamp);
    expect(stamps[0]!.stamp.stamp.reachedAtSecond).toBe(12);
    expect(waiting(h)).toHaveLength(1);
  }, 120_000);

  it('a feed after the gate with no Undo also keeps the stamp; opening History then grants it (the verifier’s gate-then-feed repro)', () => {
    const headless = runExperiment(registry(), 'EXP_103', { stopAtSecond: 30 });
    const h = harness();
    h.ask('experimentStarted', (requestId) => ({ type: 'experimentStart', requestId, cardId: 'EXP_103', newDishId: 'crew', compare: null }));
    h.host.handle({ type: 'setSpeed', dishId: 'crew', speed: 4 });
    while (h.world('crew').tick < 200) h.frame(25);
    expect(h.ask('ack', (requestId) => ({ type: 'command', requestId, dishId: 'crew', commandId: 'feed', payload: FEED, undoable: true })).result!.accepted).toBe(29);
    while (h.world('crew').tick < 260) h.frame(25);
    expect(ended(h)).toEqual([]);
    h.ask('history', (requestId) => ({ type: 'history', requestId, dishId: 'crew' }));
    expect(h.stamps().map((m) => m.stamp.stamp)).toEqual([headless.stamp]);
  }, 120_000);
});
