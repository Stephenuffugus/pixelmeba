/**
 * P4.4 goals through the worker host (DishHost; src/worker/goals.ts; D-0070, D-0071).
 *
 * - nothing runs without goalStart (off by default);
 * - goalCatalog: the Garden's three goals for a Garden dish and for the Play card (no dish yet); none for
 *   another recipe or a comparison copy;
 * - completion never changes speed: a running dish keeps running, a paused (stepped) dish stays paused;
 * - Leave goal → continuedFreely; Undo while running → ended 'undone'; a completed goal stays completed;
 * - goal records round-trip through save → load, and a running goal resumes and completes at the same
 *   tick as an uninterrupted run;
 * - a malformed goal record drops the notebook with notebookDropped and the world loads; a stage 1
 *   notebook (no 'goals' key) and a g2 save load with no goals;
 * - never alters behaviour: goals started, completed and resumed across a save → load at 4× for 3,200
 *   ticks give the same stateHash and full trajectory digest as the same run without goals;
 * - integrate (objectives-minors): an error rollback ends a running goal 'failed' (its own words, never
 *   "Undo"), Undo still 'undone'; a restore announces every kind that changed (favorites, stories and the
 *   goal), each with the final record; a goal the dish cannot resume ends 'cannotResume' and is announced
 *   (never a silent rewrite); the runner writes canonical records the validator accepts.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { emptyNotebook, NOTEBOOK_DROPPED_TEXT, sealNotebook, type NotebookRecord } from '../../src/persistence/notebook';
import { goalsOf, goalsProblem, type GoalRecord } from '../../src/persistence/notebookGoals';
import { storiesOf } from '../../src/worker/stories';
import { step } from '../../src/sim/tick';
import { applyNow } from '../../src/sim/commands';
import type { ObjectiveDef } from '../../src/sim/content/schema';
import { GoalRunner } from '../../src/worker/goals';
import { GOAL_TEXT, lastGoalLine } from '../../src/ui/strings/goals';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import type { World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, NotebookChange, SnapshotMsg, Speed, ToWorker } from '../../src/worker/protocol';
import { G2_SAVE_FILES, readG2SaveText } from '../helpers/g2-saves';
import { trajectoryDigest } from '../helpers/trajectory';
import { registry } from '../helpers/world';

const REG = registry();
const META = { name: 'Goal dish', savedAt: '2026-10-11T00:00:00.000Z', recipeId: 'FIRST_DISH_V1' };

class Driver {
  now = 0;
  readonly out: FromWorker[] = [];
  readonly host: DishHost;
  private req = 0;
  constructor() {
    this.host = new DishHost(REG, (m) => this.out.push(m), { now: () => this.now, iso: () => '2026-10-11T00:00:00.000Z' }, new SaveStore(new MemoryBackend()));
  }
  id(): number {
    return ++this.req;
  }
  reply<T extends FromWorker['type']>(type: T, requestId: number): Extract<FromWorker, { type: T }> {
    const r = this.out.find((m) => m.type === type && (m as { requestId?: number }).requestId === requestId);
    if (!r) throw new Error(`no ${type} for ${requestId}: ${JSON.stringify(this.out.filter((m) => m.type === 'error').slice(-2))}`);
    return r as Extract<FromWorker, { type: T }>;
  }
  send<T extends FromWorker['type']>(msg: ToWorker, type: T): Extract<FromWorker, { type: T }> {
    this.host.handle(msg);
    return this.reply(type, (msg as { requestId: number }).requestId);
  }
  async sendAsync<T extends FromWorker['type']>(msg: ToWorker, type: T): Promise<Extract<FromWorker, { type: T }>> {
    await this.host.handleAsync(msg);
    return this.reply(type, (msg as { requestId: number }).requestId);
  }
  create(dishId: string, recipeId = 'FIRST_DISH_V1'): World {
    this.send({ type: 'create', requestId: this.id(), dishId, source: { kind: 'recipe', recipeId } }, 'ready');
    return this.host.world(dishId)!;
  }
  start(dishId: string, objectiveId: string) {
    return this.send({ type: 'goalStart', requestId: this.id(), dishId, objectiveId }, 'notebook');
  }
  leave(dishId: string) {
    return this.send({ type: 'goalLeave', requestId: this.id(), dishId }, 'notebook');
  }
  catalog(dishId: string | null, recipeId: string | null): string[] {
    return this.send({ type: 'goalCatalog', requestId: this.id(), targetDishId: dishId, recipeId }, 'goalCatalog').goals.map((g) => g.id);
  }
  notebook(dishId: string): NotebookRecord {
    return this.send({ type: 'notebookGet', requestId: this.id(), dishId }, 'notebook').record;
  }
  goals(dishId: string): readonly GoalRecord[] {
    return goalsOf(this.notebook(dishId));
  }
  /** Pump the active dish at `speed` (left at that speed) until it reaches `target` exactly. */
  runTo(dishId: string, speed: Speed, target: number, stopAfter = true): void {
    this.host.handle({ type: 'setSpeed', dishId, speed });
    const w = () => this.host.world(dishId)!;
    while (w().tick < target) {
      const remaining = target - w().tick;
      this.now += (Math.min(remaining, 4) * 100) / speed;
      this.host.pump();
    }
    if (stopAfter) this.host.handle({ type: 'setSpeed', dishId, speed: 0 });
    expect(w().tick).toBe(target);
  }
  goalChanges(dishId: string): NotebookChange[] {
    return this.out.flatMap((m) => (m.type === 'notebookChanged' && m.dishId === dishId && m.change.kind === 'goal' ? [m.change] : []));
  }
  lastSnapshot(dishId: string): SnapshotMsg | undefined {
    return this.out.filter((m): m is SnapshotMsg => m.type === 'snapshot' && m.dishId === dishId).at(-1);
  }
}

describe('goals through DishHost', () => {
  it('nothing runs without goalStart', () => {
    const h = new Driver();
    h.create('d1');
    h.runTo('d1', 4, 400);
    expect(h.goalChanges('d1')).toEqual([]);
    expect(h.notebook('d1').goals).toBeUndefined();
  });

  it('goalCatalog: the Garden goals for a Garden dish and the Play card; none elsewhere', () => {
    const h = new Driver();
    h.create('d1');
    const garden = ['KEEP_SPRINTERS_GOING', 'SEE_SPRINTER_SPLIT', 'WATCH_STARCH_BECOME_FOOD'];
    expect(h.catalog('d1', null)).toEqual(garden);
    expect(h.catalog(null, 'FIRST_DISH_V1')).toEqual(garden);
    expect(h.catalog(null, 'HIDDEN_NEIGHBORHOOD_V1')).toEqual([]);
    expect(h.catalog(null, null)).toEqual([]);
    h.create('d2', 'HIDDEN_NEIGHBORHOOD_V1');
    expect(h.catalog('d2', null)).toEqual([]);
    expect(h.start('d2', 'SEE_SPRINTER_SPLIT').refused).toMatch(/not available/);
    // The texts come from content.
    const offer = h.send({ type: 'goalCatalog', requestId: h.id(), targetDishId: 'd1', recipeId: null }, 'goalCatalog').goals[1]!;
    expect(offer).toEqual({
      id: 'SEE_SPRINTER_SPLIT',
      title: 'See a Sprinter split',
      summary: REG.objectives.SEE_SPRINTER_SPLIT!.summary,
      completedText: 'A Sprinter split at {time}.',
      endedText: null,
    });
  });

  it('Start arms at the current tick; one at a time; completion never changes speed (running stays running)', () => {
    const h = new Driver();
    const w = h.create('d1');
    const r = h.start('d1', 'SEE_SPRINTER_SPLIT');
    expect(r.refused).toBeUndefined();
    expect(goalsOf(r.record)).toMatchObject([{ id: 'goal-1', objectiveId: 'SEE_SPRINTER_SPLIT', title: 'See a Sprinter split', state: 'running', startTick: 0, endTick: null, shown: false }]);
    expect(goalsOf(r.record)[0]!.predicate).toEqual(REG.objectives.SEE_SPRINTER_SPLIT!.predicate);
    expect(h.start('d1', 'KEEP_SPRINTERS_GOING').refused).toMatch(/already running/);
    expect(h.start('d1', 'NO_SUCH_GOAL').refused).toMatch(/not available/);
    expect(w.commands.nextSeq).toBe(realizeRecipe(REG, 'FIRST_DISH_V1').commands.nextSeq); // never a command
    h.runTo('d1', 4, 380, false);
    expect(h.goalChanges('d1')).toEqual([{ kind: 'goal', id: 'goal-1', state: 'completed' }]);
    const g = h.goals('d1')[0]!;
    expect([g.state, g.endTick]).toEqual(['completed', w.events.milestones['firstDivision:B01']! + 1]);
    expect(g.value).toBeGreaterThan(0);
    // Still running at 4× after the completion: nothing paused it.
    expect(h.lastSnapshot('d1')!.speed).toBe(4);
    h.now += 1000;
    h.host.pump();
    expect(w.tick).toBeGreaterThan(380);
    expect(h.lastSnapshot('d1')!.speed).toBe(4);
    // A second goal after the first finished.
    expect(h.start('d1', 'KEEP_SPRINTERS_GOING').refused).toBeUndefined();
    expect(h.goals('d1').map((x) => [x.id, x.state])).toEqual([
      ['goal-1', 'completed'],
      ['goal-2', 'running'],
    ]);
    h.host.handle({ type: 'goalShown', dishId: 'd1', id: 'goal-1' }); // no answer
    expect(h.goals('d1')[0]!.shown).toBe(true);
  });

  it('a paused dish stays paused when its goal completes (single steps)', () => {
    const h = new Driver();
    const w = h.create('d1');
    h.start('d1', 'WATCH_STARCH_BECOME_FOOD');
    for (let k = 0; k < 5; k++) h.host.handle({ type: 'step', dishId: 'd1' });
    expect(h.goals('d1')[0]!.state).toBe('completed');
    expect(h.lastSnapshot('d1')!.speed).toBe(0);
    const t = w.tick;
    h.now += 5000;
    h.host.pump();
    expect(w.tick).toBe(t); // paused: no time passed in the dish
  });

  it('Leave goal → continuedFreely; Undo while running → ended undone; a completed goal stays completed', () => {
    const h = new Driver();
    h.create('d1');
    expect(h.leave('d1').refused).toMatch(/No goal is running/);
    h.start('d1', 'KEEP_SPRINTERS_GOING');
    h.runTo('d1', 4, 40);
    const left = goalsOf(h.leave('d1').record)[0]!;
    expect(left).toMatchObject({ state: 'continuedFreely', endTick: 40, endReason: 'left', shown: true });
    expect(h.goalChanges('d1').at(-1)).toEqual({ kind: 'goal', id: 'goal-1', state: 'continuedFreely' });

    // A completed goal, then a running one; an undoable command; Undo.
    h.start('d1', 'WATCH_STARCH_BECOME_FOOD');
    h.runTo('d1', 4, 60);
    expect(h.goals('d1')[1]!.state).toBe('completed');
    h.start('d1', 'SEE_SPRINTER_SPLIT');
    h.send(
      { type: 'command', requestId: h.id(), dishId: 'd1', commandId: 'sugar', payload: { kind: 'deposit', materialId: 'SUGAR', points: [[40, 70]], radius: 2, dose: 0.5 }, undoable: true },
      'ack',
    );
    h.runTo('d1', 4, 100);
    expect(h.goals('d1')[2]!.state).toBe('running');
    h.send({ type: 'undo', requestId: h.id(), dishId: 'd1' }, 'ack');
    const after = h.goals('d1');
    expect(after.map((x) => [x.id, x.state, x.endReason ?? null])).toEqual([
      ['goal-1', 'continuedFreely', 'left'],
      ['goal-2', 'completed', null],
      ['goal-3', 'ended', 'undone'],
    ]);
    expect(after[2]!.endTick).toBe(60);
    // The ended attempt can be left too (Continue freely keeps its end tick and reason); Try again is a new Start.
    const lf = goalsOf(h.leave('d1').record)[2]!;
    expect(lf).toMatchObject({ state: 'continuedFreely', endTick: 60, endReason: 'undone' });
    expect(goalsOf(h.start('d1', 'SEE_SPRINTER_SPLIT').record)[3]).toMatchObject({ id: 'goal-4', state: 'running', startTick: 60 });
    // Nothing runs on: the next ticks complete only goal-4.
    h.runTo('d1', 4, 500);
    expect(h.goals('d1').map((x) => x.state)).toEqual(['continuedFreely', 'completed', 'continuedFreely', 'completed']);
  });

  it('goal records round-trip through save → load; a running goal resumes and completes at the uninterrupted tick', async () => {
    // Uninterrupted reference.
    const ref = new Driver();
    ref.create('r');
    ref.runTo('r', 4, 20);
    ref.start('r', 'KEEP_SPRINTERS_GOING');
    ref.runTo('r', 4, 1830);
    const want = ref.goals('r')[0]!;
    expect([want.state, want.endTick]).toEqual(['completed', 1820]);

    const h = new Driver();
    h.create('d1');
    h.start('d1', 'WATCH_STARCH_BECOME_FOOD');
    h.runTo('d1', 4, 20);
    h.start('d1', 'KEEP_SPRINTERS_GOING');
    h.host.handle({ type: 'goalShown', dishId: 'd1', id: 'goal-1' });
    h.runTo('d1', 4, 357); // mid-second, after the first committed division
    const before = h.goals('d1');
    expect(before.map((g) => [g.state, g.shown])).toEqual([
      ['completed', true],
      ['running', false],
    ]);
    await h.sendAsync({ type: 'saveSlot', requestId: h.id(), dishId: 'd1', slotId: 'slot1', name: 'Goals' }, 'slotSaved');
    await h.sendAsync({ type: 'loadSlot', requestId: h.id(), slotId: 'slot1', newDishId: 'd2' }, 'loaded');
    h.host.handle({ type: 'dispose', dishId: 'd1' });
    expect(h.goals('d2')).toEqual(before);
    h.runTo('d2', 4, 1830);
    const g = h.goals('d2')[1]!;
    expect([g.state, g.endTick, g.startTick]).toEqual(['completed', want.endTick, 20]);
  }, 600_000); // two 1,830-tick runs with save → load: over two minutes on a loaded 2-CPU machine
});

describe('goal records in files', () => {
  async function fileWith(goals: unknown, world?: World): Promise<{ text: string; world: World }> {
    const w = world ?? realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: 'goal-file' });
    const notebook = { ...emptyNotebook(w.worldId), goals } as unknown as NotebookRecord;
    const built = await buildSaveFile(w, META, { notebook: await sealNotebook(notebook), includeNicknames: true });
    return { text: built.text, world: w };
  }
  const good = (extra: Partial<GoalRecord> = {}): GoalRecord => ({
    id: 'goal-1',
    objectiveId: 'SEE_SPRINTER_SPLIT',
    title: 'See a Sprinter split',
    predicate: { type: 'observeEvent', params: { event: 'birth', species: 'B01' } },
    state: 'completed',
    startTick: 0,
    endTick: 0,
    progress: { startTick: 0, holdSinceTick: null, state: 'completed' },
    shown: false,
    ...extra,
  });

  it('a valid record loads; malformed ones drop the notebook with notebookDropped and the world loads unchanged', async () => {
    const ok = await fileWith([good()]);
    const loaded = await loadSaveFile(ok.text);
    expect(loaded.notebookDropped).toBeNull();
    expect(goalsOf(loaded.notebook)).toEqual([good()]);
    const bad: [string, unknown][] = [
      ['not a list', { id: 'goal-1' }],
      ['unknown state', [good({ state: 'won' as never })]],
      ['two running', [good({ state: 'running', endTick: null, progress: { startTick: 0, holdSinceTick: null, state: 'running' } }), good({ id: 'goal-2', state: 'running', endTick: null, progress: { startTick: 0, holdSinceTick: null, state: 'running' } })]],
      ['custom predicate', [good({ predicate: { type: 'custom', params: {} } })]],
      ['unknown field', [{ ...good(), score: 10 }]],
      ['ended without a reason', [good({ state: 'ended' })]],
      ['running with an end', [good({ state: 'running', progress: { startTick: 0, holdSinceTick: null, state: 'running' } })]],
      ['bad id', [good({ id: 'goal-0' })]],
      // Every content species is recorded since the organism flip (D-0127): an id no dish records.
      ['unknown species', [good({ predicate: { type: 'observeEvent', params: { event: 'birth', species: 'B99' } } })]],
      ['running after the dish’s time', [good({ state: 'running', startTick: 50, endTick: null, progress: { startTick: 50, holdSinceTick: null, state: 'running' } })]],
      ['too many', Array.from({ length: 21 }, (_, k) => good({ id: `goal-${k + 1}` }))],
    ];
    const plainHash = stateHash(loaded.world);
    for (const [label, goals] of bad) {
      const f = await fileWith(goals);
      const l = await loadSaveFile(f.text);
      expect(l.notebookDropped, label).not.toBeNull();
      expect(l.notebook.goals, label).toBeUndefined();
      expect(stateHash(l.world), label).toBe(plainHash);
      // Through the host: the dish opens and says so.
      const h = new Driver();
      const res = await h.sendAsync({ type: 'importDish', requestId: h.id(), text: f.text, newDishId: 'imp' }, 'loaded');
      expect(res.notebookDropped, label).toMatch(/could not be read/);
      expect(h.host.world('imp')).not.toBeNull();
    }
  });

  it('a stage 1 notebook (no goals key) and a g2 save load with no goals; nothing runs', async () => {
    const w = realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: 'stage1' });
    const b01 = w.ents.cols.birthId[Array.from({ length: w.ents.highWater }, (_, i) => i).find((i) => w.species[w.ents.cols.species[i]!]!.id === 'B01')!]!;
    const stage1: NotebookRecord = {
      ...emptyNotebook(w.worldId),
      favorites: [{ id: 'fav-1', rootBirthId: b01, speciesId: 'B01', nickname: null, pattern: 'circle', representative: b01, active: true, createdTick: 0, members: [[b01, 0]], historyIncomplete: false, extinct: null }],
      nextFavorite: 2,
    };
    expect('goals' in stage1).toBe(false);
    const built = await buildSaveFile(w, META, { notebook: await sealNotebook(stage1), includeNicknames: true });
    const l1 = await loadSaveFile(built.text);
    expect(l1.notebookDropped).toBeNull();
    expect(l1.notebook.favorites).toHaveLength(1);
    expect(goalsOf(l1.notebook)).toEqual([]);

    for (const text of [built.text, readG2SaveText(G2_SAVE_FILES[0])]) {
      const h = new Driver();
      const res = await h.sendAsync({ type: 'importDish', requestId: h.id(), text, newDishId: 'old' }, 'loaded');
      expect(res.notebookDropped).toBeUndefined();
      expect(h.goals('old')).toEqual([]);
      const t = h.host.world('old')!.tick;
      h.host.handle({ type: 'activate', dishId: 'old' });
      h.runTo('old', 4, t + 40);
      expect(h.goalChanges('old')).toEqual([]);
      expect(h.goals('old')).toEqual([]);
    }
  });
});

describe('goals never alter behaviour', () => {
  async function scenario(withGoals: boolean): Promise<{ hash: string; digest: string; tick: number; goals: readonly GoalRecord[] }> {
    const h = new Driver();
    h.create('d1');
    if (withGoals) h.start('d1', 'SEE_SPRINTER_SPLIT');
    h.runTo('d1', 4, 400);
    if (withGoals) {
      h.start('d1', 'KEEP_SPRINTERS_GOING');
      h.host.handle({ type: 'goalShown', dishId: 'd1', id: 'goal-1' });
    }
    h.send(
      { type: 'command', requestId: h.id(), dishId: 'd1', commandId: 'sugar', payload: { kind: 'deposit', materialId: 'SUGAR', points: [[40, 70]], radius: 2, dose: 0.5 }, undoable: true },
      'ack',
    );
    h.runTo('d1', 4, 1203); // mid-second
    await h.sendAsync({ type: 'saveSlot', requestId: h.id(), dishId: 'd1', slotId: 'slot1', name: 'Fence' }, 'slotSaved');
    await h.sendAsync({ type: 'loadSlot', requestId: h.id(), slotId: 'slot1', newDishId: 'd2' }, 'loaded');
    h.host.handle({ type: 'dispose', dishId: 'd1' });
    h.runTo('d2', 4, 2500);
    if (withGoals) {
      h.start('d2', 'WATCH_STARCH_BECOME_FOOD');
      h.leave('d2');
      h.start('d2', 'SEE_SPRINTER_SPLIT');
    }
    h.runTo('d2', 4, 3200);
    const w2 = h.host.world('d2')!;
    return { hash: stateHash(w2), digest: trajectoryDigest(w2, 'full'), tick: w2.tick, goals: h.goals('d2') };
  }

  it('goals started, completed, left and resumed across a save → load at 4× for 3,200 ticks: equal stateHash and full trajectory digest', async () => {
    const plain = await scenario(false);
    const goals = await scenario(true);
    expect(plain.goals).toEqual([]);
    expect(goals.goals.map((g) => g.state)).toEqual(['completed', 'completed', 'continuedFreely', 'completed']);
    expect(goals.tick).toBe(3200);
    expect(goals.hash).toBe(plain.hash);
    expect(goals.digest).toBe(plain.digest);
  }, 600_000);
});

describe('integrate: honest end reasons, every restore change, canonical records (objectives-minors)', () => {
  const clock = (t: number) => `${Math.floor(t / 600)}:${String(Math.floor(t / 10) % 60).padStart(2, '0')}`;
  const notebookChanges = (h: Driver, from: number) =>
    h.out.slice(from).filter((m): m is Extract<FromWorker, { type: 'notebookChanged' }> => m.type === 'notebookChanged');

  it('an error rollback while a goal runs ends it "failed" in the error toast\'s words; Undo stays "undone"', () => {
    // A step that throws (pump → rollback).
    const h = new Driver();
    h.create('d1');
    h.start('d1', 'KEEP_SPRINTERS_GOING');
    h.runTo('d1', 4, 40);
    const mark = h.out.length;
    (h.host.world('d1')!.fields as Record<string, unknown>).oxygen = undefined; // the next tick throws
    h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 4 });
    h.now += 1000;
    h.host.pump();
    const errors = h.out.slice(mark).filter((m) => m.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ paused: true });
    const g = h.goals('d1')[0]!;
    expect(g).toMatchObject({ state: 'ended', endReason: 'failed', endTick: h.host.world('d1')!.tick, progress: { state: 'ended' }, shown: false });
    expect(notebookChanges(h, mark).map((m) => m.change)).toEqual([{ kind: 'goal', id: 'goal-1', state: 'ended' }]);
    expect(GOAL_TEXT.failed(g.title)).toBe('Keep Sprinters going: Something went wrong and the dish was paused, so this attempt ended.');
    expect(lastGoalLine(g, clock)).toBe('Last goal: Keep Sprinters going — ended when something went wrong and the dish was paused.');
    expect(goalsProblem(goalsOf(h.notebook('d1')))).toBeNull();

    // A command that throws part-way (handle → rollback).
    const h2 = new Driver();
    h2.create('d1');
    h2.start('d1', 'SEE_SPRINTER_SPLIT');
    h2.runTo('d1', 4, 30);
    h2.host.handle({ type: 'command', requestId: h2.id(), dishId: 'd1', commandId: 'broken', payload: { kind: 'no-such-command' } as never, undoable: true });
    expect(h2.out.filter((m) => m.type === 'error')).toHaveLength(1);
    expect(h2.goals('d1')[0]).toMatchObject({ state: 'ended', endReason: 'failed', endTick: 30 });
    expect(h2.goalChanges('d1')).toEqual([{ kind: 'goal', id: 'goal-1', state: 'ended' }]);

    // Undo keeps its own reason and words.
    const h3 = new Driver();
    h3.create('d1');
    h3.start('d1', 'KEEP_SPRINTERS_GOING');
    h3.send({ type: 'command', requestId: h3.id(), dishId: 'd1', commandId: 'sugar', payload: { kind: 'deposit', materialId: 'SUGAR', points: [[40, 70]], radius: 2, dose: 0.5 }, undoable: true }, 'ack');
    h3.runTo('d1', 4, 20);
    h3.send({ type: 'undo', requestId: h3.id(), dishId: 'd1' }, 'ack');
    const u = h3.goals('d1')[0]!;
    expect(u).toMatchObject({ state: 'ended', endReason: 'undone', endTick: 0, progress: { state: 'ended' } });
    expect(lastGoalLine(u, clock)).toBe('Last goal: Keep Sprinters going — ended when Undo rewound the dish.');
  });

  it('Undo while a goal runs, with a story card and a favorite from the undone time: favorites, stories and the goal are all announced', () => {
    // (Following a newborn follows its family from the lineage root; the family's members change with the Undo.)
    const h = new Driver();
    h.create('d1');
    h.start('d1', 'KEEP_SPRINTERS_GOING');
    h.runTo('d1', 4, 300);
    const nextBirth = h.host.world('d1')!.counters.nextBirthId;
    const cardsBefore = storiesOf(h.notebook('d1')).length;
    h.send({ type: 'command', requestId: h.id(), dishId: 'd1', commandId: 'sugar', payload: { kind: 'deposit', materialId: 'SUGAR', points: [[40, 70]], radius: 2, dose: 0.5 }, undoable: true }, 'ack');
    h.runTo('d1', 4, 450);
    // A story card and a favorite family that began in the time Undo will remove.
    expect(storiesOf(h.notebook('d1')).length).toBeGreaterThan(cardsBefore);
    const w = h.host.world('d1')!;
    const c = w.ents.cols;
    let born = -1;
    for (let i = 0; i < w.ents.highWater && born < 0; i++) if (c.alive[i] === 1 && c.birthId[i]! >= nextBirth) born = c.birthId[i]!;
    expect(born).toBeGreaterThanOrEqual(nextBirth);
    const fav = h.send({ type: 'favorite', requestId: h.id(), dishId: 'd1', op: { kind: 'follow', birthId: born, nickname: null, pattern: 'circle' } }, 'notebook');
    expect(fav.refused).toBeUndefined();
    expect(h.goals('d1')[0]!.state).toBe('running');

    const mark = h.out.length;
    h.send({ type: 'undo', requestId: h.id(), dishId: 'd1' }, 'ack');
    const posted = notebookChanges(h, mark);
    expect(posted.map((m) => m.change.kind)).toEqual(['favoritesRestored', 'storiesRestored', 'goal']);
    expect(posted[2]!.change).toEqual({ kind: 'goal', id: 'goal-1', state: 'ended' });
    expect((posted[1]!.change as { removed: number }).removed).toBeGreaterThan(0);
    // Each carries the same final record: the goal ended, the undone time's cards gone.
    for (const m of posted) expect(m.record).toBe(posted[0]!.record);
    const final = h.notebook('d1');
    expect(goalsOf(posted[0]!.record)).toEqual(goalsOf(final));
    expect(storiesOf(posted[0]!.record)).toEqual(storiesOf(final));
    expect(goalsOf(final)[0]).toMatchObject({ state: 'ended', endReason: 'undone', endTick: 300 });
    expect(storiesOf(final)).toHaveLength(cardsBefore);
  }, 120_000);

  it('a running goal the dish cannot resume ends "cannotResume" and is announced, never silently rewritten', async () => {
    const g2 = (await loadSaveFile(readG2SaveText(G2_SAVE_FILES[0]))).world;
    const running: GoalRecord = {
      id: 'goal-1',
      objectiveId: 'X_GOAL',
      title: 'Probe',
      predicate: { type: 'fieldInRange', params: { field: 'v01', min: 0, max: 1 }, durationSeconds: 5 },
      state: 'running',
      startTick: 0,
      endTick: null,
      progress: { startTick: 0, holdSinceTick: null, state: 'running' },
      shown: false,
    };
    let rec: NotebookRecord = { ...emptyNotebook(g2.worldId), goals: [running] };
    const runner = new GoalRunner(g2, { get: () => rec, set: (r) => (rec = r) });
    expect(goalsOf(rec)[0]).toEqual({ ...running, state: 'ended', endTick: g2.tick, endReason: 'cannotResume', progress: { ...running.progress, state: 'ended' } });
    expect(goalsProblem(goalsOf(rec))).toBeNull();
    expect(lastGoalLine(goalsOf(rec)[0], clock)).toBe('Last goal: Probe — ended: this dish could not resume it.');
    step(g2);
    expect(runner.afterTick(g2)).toEqual([{ kind: 'goal', id: 'goal-1', state: 'ended' }]);
    step(g2);
    expect(runner.afterTick(g2)).toEqual([]); // announced once
  });

  it('an event-ring goal saved between a command and the next tick completes after the load at the uninterrupted tick (the record keeps lastEventId)', async () => {
    // No shipped goal reads the event ring yet (the P4.8 editor may): a test-only definition through the runner.
    const def = { id: 'X_RING', title: 'See Sprinters added', predicate: { type: 'observeEvent', params: { event: 'introduce', species: 'B01' } } } as unknown as ObjectiveDef;
    const A01 = { kind: 'inoculate', speciesId: 'A01', x: 60, y: 60, radius: 1, count: 1 } as const;
    const B01 = { kind: 'inoculate', speciesId: 'B01', x: 50, y: 50, radius: 2, count: 3 } as const;
    const begin = () => {
      const w = realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: 'ring' });
      let rec: NotebookRecord = emptyNotebook(w.worldId);
      const ref = { get: () => rec, set: (r: NotebookRecord) => (rec = r) };
      const runner = new GoalRunner(w, ref);
      expect(runner.start(w, def, true).refused).toBeNull();
      for (let k = 0; k < 13; k++) {
        step(w);
        runner.afterTick(w);
        if (w.tick === 5) applyNow(w, 'a01', A01); // records that do not match (seen at tick 6)
      }
      const seen = w.counters.nextEventId - 1; // the last record the goal saw (at tick 13)
      applyNow(w, 'b01', B01);
      expect(runner.afterTick(w)).toEqual([]); // same tick: seen at the next one
      return { w, runner, rec: () => rec, seen };
    };
    const settle = (w: World, runner: GoalRunner, rec: () => NotebookRecord): number | null => {
      for (let k = 0; k < 50 && goalsOf(rec())[0]!.state === 'running'; k++) {
        step(w);
        runner.afterTick(w);
      }
      return goalsOf(rec())[0]!.endTick;
    };
    const a = begin();
    const want = settle(a.w, a.runner, a.rec);
    expect(want).toBe(14);

    const b = begin();
    const saved = goalsOf(b.rec())[0]!;
    // The record keeps the last record the goal saw at its last evaluated tick (before the command's records).
    expect(saved.progress.lastEventId).toBe(b.seen);
    expect(b.seen).toBeLessThan(b.w.counters.nextEventId - 1);
    const file = await buildSaveFile(b.w, META, { notebook: await sealNotebook(b.rec()), includeNicknames: true });
    const loaded = await loadSaveFile(file.text);
    expect(loaded.notebookDropped).toBeNull();
    let rec = loaded.notebook;
    const runner = new GoalRunner(loaded.world, { get: () => rec, set: (r) => (rec = r) });
    expect(goalsOf(rec)[0]).toEqual(saved);
    expect(settle(loaded.world, runner, () => rec)).toBe(want);
  });

  it('the runner writes canonical records: progress.state follows the record, and every record passes the validator', async () => {
    const h = new Driver();
    h.create('d1');
    h.start('d1', 'KEEP_SPRINTERS_GOING');
    h.runTo('d1', 4, 40);
    h.leave('d1'); // left while running
    h.start('d1', 'WATCH_STARCH_BECOME_FOOD');
    h.runTo('d1', 4, 60); // completes
    h.start('d1', 'SEE_SPRINTER_SPLIT');
    h.send({ type: 'command', requestId: h.id(), dishId: 'd1', commandId: 'sugar', payload: { kind: 'deposit', materialId: 'SUGAR', points: [[40, 70]], radius: 2, dose: 0.5 }, undoable: true }, 'ack');
    h.runTo('d1', 4, 100);
    h.send({ type: 'undo', requestId: h.id(), dishId: 'd1' }, 'ack'); // ended 'undone'
    h.leave('d1'); // the ended attempt continues freely
    h.start('d1', 'SEE_SPRINTER_SPLIT'); // running
    const goals = h.goals('d1');
    expect(goals.map((g) => [g.state, g.endReason ?? null, g.progress.state, g.value !== undefined, g.shown])).toEqual([
      ['continuedFreely', 'left', 'ended', false, true],
      ['completed', null, 'completed', true, false],
      ['continuedFreely', 'undone', 'ended', false, true],
      ['running', null, 'running', false, false],
    ]);
    expect(goalsProblem(goals)).toBeNull();
    // And through a file: the notebook loads as written.
    await h.sendAsync({ type: 'saveSlot', requestId: h.id(), dishId: 'd1', slotId: 'slot1', name: 'Canon' }, 'slotSaved');
    const loaded = await h.sendAsync({ type: 'loadSlot', requestId: h.id(), slotId: 'slot1', newDishId: 'd2' }, 'loaded');
    expect(loaded.notebookDropped).toBeUndefined();
    expect(h.goals('d2')).toEqual(goals);
  }, 120_000);
});

// Wave 5b integration (lead; integrate-verify1.md lead MINOR 1): the production load path. loadSaveFile hands the
// notebook check the dish's manifest, fields and event ids (goalWorldRefsOf), so a running goal this dish cannot run, or
// one whose saved event position the dish never reached, drops the whole notebook with the message and the world loads.
describe('import: a running goal the dish cannot run drops the notebook; the world loads unchanged', () => {
  it('the verifier repro (g2 first-dish-t3000 + a running fieldInRange on v01) and a future event position', async () => {
    const base = await loadSaveFile(readG2SaveText(G2_SAVE_FILES[0]));
    const w = base.world;
    const running = (extra: Partial<GoalRecord>): GoalRecord => ({
      id: 'goal-1',
      objectiveId: 'X_GOAL',
      title: 'Probe',
      predicate: { type: 'fieldInRange', params: { field: 'v01', min: 0, max: 1 }, durationSeconds: 5 },
      state: 'running',
      startTick: 0,
      endTick: null,
      progress: { startTick: 0, holdSinceTick: null, state: 'running' },
      shown: false,
      ...extra,
    });
    const ring = (lastEventId: number): GoalRecord =>
      running({ predicate: { type: 'observeEvent', params: { event: 'command' } }, progress: { startTick: 0, holdSinceTick: null, state: 'running', lastEventId } });
    const fileWith = async (g: GoalRecord): Promise<string> =>
      (
        await buildSaveFile(
          w,
          { name: 'p', savedAt: '2026-10-11T00:00:00.000Z', recipeId: 'FIRST_DISH_V1' },
          { notebook: await sealNotebook({ ...emptyNotebook(w.worldId), goals: [g] }), includeNicknames: true },
        )
      ).text;
    const cases: readonly (readonly [string, GoalRecord, boolean])[] = [
      ['unsupported v01', running({}), true],
      ['an event position the dish never reached', ring(w.counters.nextEventId), true],
      ['an event position in the past', ring(w.counters.nextEventId - 1), false],
    ];
    for (const [label, g, drop] of cases) {
      const text = await fileWith(g);
      const l = await loadSaveFile(text);
      expect(l.notebookDropped, label).toBe(drop ? NOTEBOOK_DROPPED_TEXT : null);
      expect(stateHash(l.world), label).toBe(stateHash(w));
      const out: FromWorker[] = [];
      let now = 0;
      const host = new DishHost(registry(), (m) => out.push(m), { now: () => now, iso: () => '2026-10-11T00:00:00.000Z' }, new SaveStore(new MemoryBackend()));
      await host.handleAsync({ type: 'importDish', requestId: 1, text, newDishId: 'i' });
      const res = out.find((m) => m.type === 'loaded') as Extract<FromWorker, { type: 'loaded' }>;
      expect(res.notebookDropped ?? null, label).toBe(drop ? NOTEBOOK_DROPPED_TEXT : null);
      const t0 = host.world('i')!.tick;
      host.handle({ type: 'activate', dishId: 'i' });
      host.handle({ type: 'setSpeed', dishId: 'i', speed: 4 });
      while (host.world('i')!.tick < t0 + 4) {
        now += 100;
        host.pump();
      }
      host.handle({ type: 'notebookGet', requestId: 2, dishId: 'i' });
      const nb = (out.find((m) => m.type === 'notebook' && (m as { requestId?: number }).requestId === 2) as Extract<FromWorker, { type: 'notebook' }>).record;
      const goalChanges = out.filter((m) => m.type === 'notebookChanged' && m.change.kind === 'goal');
      if (drop) {
        expect(goalsOf(nb), label).toEqual([]);
        expect(goalChanges, label).toEqual([]);
      } else expect(goalsOf(nb)[0]!.state, label).toBe('running');
    }
  }, 120_000);
});
