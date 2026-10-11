/**
 * P4.7 Try my dish through the worker host (DishHost; src/worker/tryDish.ts; src/persistence/{shelf,
 * notebookTurns}.ts; SPEC §13.6; D09 lines 135-139; D-0081 "Try my dish clones, never mutates").
 *
 * - turn 1 opens paused at the baseline tick with the baseline's stateHash under a new world id; turn 2
 *   from the same baseline too; the same commands in turns 1 and 2 give the same stateHash at the horizon;
 *   the baseline's stored record never changes;
 * - the horizon stops a turn at exactly startTick + horizonTicks at 4×, with 'step', and after a save →
 *   load in the middle (the clock never restarts);
 * - Another turn: refused without Discard for an unkept turn and the worker never writes a discarded turn;
 *   a kept turn is in its slot and needs no Discard; a missing or changed baseline refuses and leaves the
 *   current turn open and unchanged;
 * - Undo below the horizon sets the turn back to running; the goal of a try starts at each turn's start
 *   tick (progress resets), and a goal longer than the turn is refused;
 * - Start refusals change nothing (a comparison copy, a held sample, a full shelf);
 * - the 'turns' kind never alters behaviour (stateHash and full trajectory digest equal with and without
 *   the TurnRecord over 3,200 ticks at 4× with commands and a save → load in the middle);
 * - save/import: a turn dish saves and loads with its record; a malformed record drops the notebook with
 *   notebookDropped and the world loads; a g2 save and a wave 5 save load with no turns; Duplicate and
 *   favoritesOnly never copy a turn.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { favoritesOnly, NOTEBOOK_DROPPED_TEXT, sealNotebook, type NotebookRecord } from '../../src/persistence/notebook';
import { turnOf, turnsProblem, type TurnRecord } from '../../src/persistence/notebookTurns';
import { goalsOf } from '../../src/persistence/notebookGoals';
import { MemoryBackend, SaveStore, SHELF_REMOVE_REFUSED } from '../../src/persistence/store';
import { Shelf } from '../../src/persistence/shelf';
import type { CommandPayload } from '../../src/sim/commands';
import { stateHash } from '../../src/sim/serialize';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, SnapshotMsg, Speed, ToWorker } from '../../src/worker/protocol';
import { G2_SAVE_FILES, readG2SaveText } from '../helpers/g2-saves';
import { trajectoryDigest } from '../helpers/trajectory';
import { registry } from '../helpers/world';

const REG = registry();
const ISO = '2026-10-11T00:00:00.000Z';
const SUGAR: CommandPayload = { kind: 'deposit', materialId: 'SUGAR', points: [[40, 70]], radius: 2, dose: 0.5 };

class Driver {
  now = 0;
  readonly out: FromWorker[] = [];
  readonly backend = new MemoryBackend();
  readonly host: DishHost;
  private req = 0;
  constructor() {
    this.host = new DishHost(REG, (m) => this.out.push(m), { now: () => this.now, iso: () => ISO }, new SaveStore(this.backend));
  }
  id(): number {
    return ++this.req;
  }
  reply<T extends FromWorker['type']>(type: T, requestId: number): Extract<FromWorker, { type: T }> {
    const r = this.out.find((m) => m.type === type && (m as { requestId?: number }).requestId === requestId);
    if (!r) throw new Error(`no ${type} for ${requestId}: ${JSON.stringify(this.out.filter((m) => (m as { requestId?: number }).requestId === requestId || m.type === 'error').slice(-3))}`);
    return r as Extract<FromWorker, { type: T }>;
  }
  send<T extends FromWorker['type']>(msg: ToWorker, type: T): Extract<FromWorker, { type: T }> {
    this.host.handle(msg);
    return this.reply(type, (msg as { requestId: number }).requestId);
  }
  async exported(dishId: string, strip: boolean): Promise<string> {
    const r = await this.sendAsync({ type: 'exportDish', requestId: this.id(), dishId, strip });
    if (r.type !== 'exported') throw new Error(`not exported: ${JSON.stringify(r)}`);
    return r.text;
  }
  async sendAsync(msg: ToWorker): Promise<FromWorker> {
    await this.host.handleAsync(msg);
    const id = (msg as { requestId: number }).requestId;
    const r = this.out.find((m) => (m as { requestId?: number }).requestId === id);
    if (!r) throw new Error(`no answer to ${msg.type}`);
    return r;
  }
  create(dishId: string, recipeId = 'FIRST_DISH_V1') {
    this.send({ type: 'create', requestId: this.id(), dishId, source: { kind: 'recipe', recipeId }, name: 'Little Living Garden' }, 'ready');
    return this.host.world(dishId)!;
  }
  hash(dishId: string): string {
    return this.send({ type: 'hash', requestId: this.id(), dishId }, 'hash').hash;
  }
  notebook(dishId: string): NotebookRecord {
    return this.send({ type: 'notebookGet', requestId: this.id(), dishId }, 'notebook').record;
  }
  turn(dishId: string): TurnRecord | null {
    return turnOf(this.notebook(dishId));
  }
  command(dishId: string, commandId: string, payload: CommandPayload = SUGAR) {
    return this.send({ type: 'command', requestId: this.id(), dishId, commandId, payload, undoable: true }, 'ack');
  }
  async tryStart(dishId: string, newDishId: string, opts: { horizonSeconds?: number; objectiveId?: string | null; prediction?: string } = {}) {
    return this.sendAsync({ type: 'tryStart', requestId: this.id(), dishId, newDishId, objectiveId: opts.objectiveId ?? null, horizonSeconds: opts.horizonSeconds ?? 60, prediction: opts.prediction ?? '' });
  }
  async tryNext(dishId: string, newDishId: string, discard: boolean) {
    return this.sendAsync({ type: 'tryNext', requestId: this.id(), dishId, newDishId, discard });
  }
  /** Run the active dish at `speed` until it reaches `target` (left at that speed unless it paused itself). */
  runTo(dishId: string, speed: Speed, target: number): void {
    this.host.handle({ type: 'setSpeed', dishId, speed });
    const w = () => this.host.world(dishId)!;
    while (w().tick < target) {
      this.now += (Math.min(target - w().tick, 4) * 100) / speed;
      this.host.pump();
    }
    expect(w().tick).toBe(target);
  }
  /** Run at `speed` for `frames` frames of 100 ms (a turn stops itself at its horizon). */
  runFrames(dishId: string, speed: Speed, frames: number): void {
    this.host.handle({ type: 'setSpeed', dishId, speed });
    for (let k = 0; k < frames; k++) {
      this.now += 100;
      this.host.pump();
    }
  }
  lastSnapshot(dishId: string): SnapshotMsg | undefined {
    return this.out.filter((m): m is SnapshotMsg => m.type === 'snapshot' && m.dishId === dishId).at(-1);
  }
  horizons(dishId: string) {
    return this.out.filter((m): m is Extract<FromWorker, { type: 'tryHorizon' }> => m.type === 'tryHorizon' && m.dishId === dishId);
  }
  storeSnapshot(): string {
    return JSON.stringify({ slots: this.backend.slots, records: Object.keys(this.backend.records).sort() });
  }
  shelfRecords() {
    return Object.values(this.backend.slots).filter((s) => s.slotId.startsWith('shelf-'));
  }
}

function started(r: FromWorker): Extract<FromWorker, { type: 'tryStarted' }> {
  if (r.type !== 'tryStarted') throw new Error(`not started: ${JSON.stringify(r)}`);
  return r;
}

/** Run turn `dishId` (at tick 50) with one sugar deposit, at 4×, until it pauses at its horizon. */
function playTurn(h: Driver, dishId: string): void {
  h.command(dishId, `sugar-${dishId}`);
  h.runFrames(dishId, 4, 200); // far more than 600 ticks of time: the horizon must stop it
}

describe('Try my dish through DishHost', () => {
  it('each turn clones the baseline (paused, same stateHash, new world id); same commands → same result; the baseline never changes', async () => {
    const h = new Driver();
    const src = h.create('d1');
    h.runTo('d1', 4, 50);
    h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 0 });
    const h0 = h.hash('d1');
    const r1 = started(await h.tryStart('d1', 't1', { prediction: '  More Sprinters\nnear the sugar ' }));
    expect(r1.info).toMatchObject({ dishId: 't1', tick: 50, name: 'Little Living Garden (turn 1)' });
    expect(r1.info.worldId).not.toBe(src.worldId);
    expect(r1.info.worldId.startsWith(`${src.worldId.split('+')[0]}+`)).toBe(true);
    expect(r1.turn).toMatchObject({ tryId: 'try-1', turn: 1, turnWorldId: r1.info.worldId, startTick: 50, horizonTicks: 600, objectiveId: null, prediction: 'More Sprinters near the sugar', state: 'running', kept: null });
    expect(r1.turn.baseline).toMatchObject({ worldId: src.worldId, tick: 50, name: 'Little Living Garden' });
    expect(r1.info.turn).toEqual(r1.turn);
    expect(h.hash('t1')).toBe(h0);
    expect(h.lastSnapshot('t1')!.speed).toBe(0);
    expect(h.host.activeDishId).toBe('t1');
    // The source dish is untouched (the UI lets it go after the start).
    expect(h.hash('d1')).toBe(h0);
    expect(h.host.world('t1')).not.toBe(src);

    const [shelf] = h.shelfRecords();
    expect(shelf).toMatchObject({ shelfKind: 'baseline', createdFor: 'try-1', tick: 50, checksum: r1.turn.baseline.checksum });
    const stored = { slot: JSON.stringify(shelf), bytes: Array.from(h.backend.records[shelf!.current]!.data) };

    playTurn(h, 't1');
    expect(h.host.world('t1')!.tick).toBe(650);
    const end1 = h.hash('t1');
    expect(end1).not.toBe(h0);

    const r2 = started(await h.tryNext('t1', 't2', true));
    expect(r2.turn).toMatchObject({ tryId: 'try-1', turn: 2, startTick: 50, state: 'running', kept: null, prediction: 'More Sprinters near the sugar' });
    expect(r2.info.name).toBe('Little Living Garden (turn 2)');
    expect(r2.info.worldId).not.toBe(r1.info.worldId);
    expect(h.host.world('t1')).toBeNull(); // the discarded turn is gone
    expect(h.hash('t2')).toBe(h0);
    expect(h.lastSnapshot('t2')!.speed).toBe(0);
    playTurn(h, 't2');
    expect(h.host.world('t2')!.tick).toBe(650);
    expect(h.hash('t2')).toBe(end1); // clone, never mutate: the same start and commands give the same dish

    // The baseline's stored record is exactly as written.
    const after = h.shelfRecords();
    expect(after).toHaveLength(1);
    expect(JSON.stringify(after[0])).toBe(stored.slot);
    expect(Array.from(h.backend.records[after[0]!.current]!.data)).toEqual(stored.bytes);
  });

  it('the horizon: exactly startTick + horizonTicks at 4×, with step, and across a save → load (the clock never restarts)', async () => {
    const h = new Driver();
    h.create('d1');
    h.runTo('d1', 4, 30);
    h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 0 });
    started(await h.tryStart('d1', 't1'));
    h.runFrames('t1', 4, 400);
    const w = h.host.world('t1')!;
    expect(w.tick).toBe(630);
    expect(h.lastSnapshot('t1')!.speed).toBe(0);
    expect(h.turn('t1')!.state).toBe('atHorizon');
    const hz = h.horizons('t1');
    expect(hz).toHaveLength(1);
    expect(hz[0]).toMatchObject({ elapsedTicks: 600, goal: null, turn: { state: 'atHorizon', turn: 1 } });
    // Run and Step at the horizon do nothing but offer the horizon card again.
    h.host.handle({ type: 'setSpeed', dishId: 't1', speed: 4 });
    h.now += 1000;
    h.host.pump();
    h.host.handle({ type: 'step', dishId: 't1' });
    expect(w.tick).toBe(630);
    expect(h.lastSnapshot('t1')!.speed).toBe(0);
    expect(h.horizons('t1')).toHaveLength(3);
    const uninterrupted = h.hash('t1');

    // Step from one tick before the horizon: the step reaches it and pauses there.
    const h2 = new Driver();
    h2.create('d1');
    h2.runTo('d1', 4, 30);
    h2.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 0 });
    started(await h2.tryStart('d1', 't1'));
    h2.runTo('t1', 4, 629);
    h2.host.handle({ type: 'setSpeed', dishId: 't1', speed: 0 });
    h2.host.handle({ type: 'step', dishId: 't1' });
    h2.host.handle({ type: 'step', dishId: 't1' });
    expect(h2.host.world('t1')!.tick).toBe(630);
    expect(h2.horizons('t1')).toHaveLength(2); // reached, then offered again by the refused step
    expect(h2.hash('t1')).toBe(uninterrupted);

    // Save in the middle, load it as a new dish, run on: the same horizon tick and the same dish.
    const h3 = new Driver();
    h3.create('d1');
    h3.runTo('d1', 4, 30);
    h3.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 0 });
    started(await h3.tryStart('d1', 't1'));
    h3.runTo('t1', 4, 333);
    h3.host.handle({ type: 'setSpeed', dishId: 't1', speed: 0 });
    expect((await h3.sendAsync({ type: 'saveSlot', requestId: h3.id(), dishId: 't1', slotId: 'slot3', name: 'Mid turn' })).type).toBe('slotSaved');
    const loaded = await h3.sendAsync({ type: 'loadSlot', requestId: h3.id(), slotId: 'slot3', newDishId: 'r1' });
    if (loaded.type !== 'loaded') throw new Error('not loaded');
    expect(loaded.info.turn).toMatchObject({ state: 'running', startTick: 30, horizonTicks: 600, kept: null });
    expect(loaded.info.tick).toBe(333);
    h3.runFrames('r1', 4, 400);
    expect(h3.host.world('r1')!.tick).toBe(630);
    expect(h3.hash('r1')).toBe(uninterrupted);
    expect(h3.turn('r1')!.state).toBe('atHorizon');
  });

  it('Another turn: Discard is needed for an unkept turn; a kept turn is in its slot; the worker never writes a discarded turn', async () => {
    const h = new Driver();
    h.create('d1');
    h.runTo('d1', 4, 20);
    h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 0 });
    started(await h.tryStart('d1', 't1'));
    // Not at its horizon yet: no next turn.
    expect(await h.tryNext('t1', 'x', true)).toMatchObject({ type: 'tryRefused', code: 'no-turn' });
    playTurn(h, 't1');
    const before = h.storeSnapshot();
    const r = await h.tryNext('t1', 't2', false);
    expect(r).toMatchObject({ type: 'tryRefused', code: 'unsaved' });
    expect(h.host.world('t1')!.tick).toBe(620);
    expect(h.host.world('t2')).toBeNull();
    // Discard: the next turn opens and nothing is written for the discarded one.
    const hashT1 = h.hash('t1');
    started(await h.tryNext('t1', 't2', true));
    expect(h.storeSnapshot()).toBe(before);
    expect(h.host.world('t1')).toBeNull();

    // Keep this result: a save to a named slot at the horizon marks the turn kept, in the file too.
    playTurn(h, 't2');
    expect(h.hash('t2')).toBe(hashT1);
    const saved = await h.sendAsync({ type: 'saveSlot', requestId: h.id(), dishId: 't2', slotId: 'slot1', name: 'My turn' });
    expect(saved.type).toBe('slotSaved');
    expect(h.turn('t2')!.kept).toEqual({ slotId: 'slot1' });
    expect(h.out.filter((m) => m.type === 'tryTurn' && m.dishId === 't2').at(-1)).toMatchObject({ turn: { kept: { slotId: 'slot1' }, state: 'atHorizon' } });
    const store = new SaveStore(h.backend);
    const slot = await store.load('slot1', () => Promise.resolve(true));
    const file = await loadSaveFile(slot!.text);
    expect(turnOf(file.notebook)).toMatchObject({ kept: { slotId: 'slot1' }, state: 'atHorizon', turn: 2 });
    expect(stateHash(file.world)).toBe(hashT1);
    // Kept and unchanged: Another turn needs no Discard, and writes nothing.
    const kept = h.storeSnapshot();
    started(await h.tryNext('t2', 't3', false));
    expect(h.storeSnapshot()).toBe(kept);
    expect(h.turn('t3')).toMatchObject({ turn: 3, kept: null, state: 'running' });

    // Kept, then changed at the horizon: Discard is needed again.
    playTurn(h, 't3');
    await h.sendAsync({ type: 'saveSlot', requestId: h.id(), dishId: 't3', slotId: 'slot2', name: 'Turn 3' });
    h.command('t3', 'later-sugar');
    expect(await h.tryNext('t3', 't4', false)).toMatchObject({ type: 'tryRefused', code: 'unsaved' });
  });

  it('a missing or changed baseline refuses Another turn and leaves the current turn open and unchanged', async () => {
    const h = new Driver();
    h.create('d1');
    h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 0 });
    started(await h.tryStart('d1', 't1'));
    playTurn(h, 't1');
    const hash = h.hash('t1');
    const nb = JSON.stringify(h.notebook('t1'));
    const [rec] = h.shelfRecords();
    // Changed: the stored bytes are damaged.
    const data = h.backend.records[rec!.current]!;
    h.backend.records[rec!.current] = { ...data, data: data.data.slice(0, 50) };
    const changed = await h.tryNext('t1', 't2', true);
    expect(changed).toMatchObject({ type: 'tryRefused', code: 'baseline-missing', message: "The saved starting point for these turns is gone, so another turn can't start. This turn is unchanged." });
    expect(h.host.world('t2')).toBeNull();
    expect(h.host.activeDishId).toBe('t1');
    h.backend.records[rec!.current] = data;
    // Missing: the player removed it.
    expect(await new Shelf(h.backend).remove(rec!.slotId)).toBe(true);
    expect(await h.tryNext('t1', 't2', true)).toMatchObject({ type: 'tryRefused', code: 'baseline-missing' });
    expect(h.hash('t1')).toBe(hash);
    expect(JSON.stringify(h.notebook('t1'))).toBe(nb);
    expect(h.host.activeDishId).toBe('t1');
  });

  it('fix round 1: a kept turn that is rewound or changed is no longer kept (the card never claims a slot that does not hold it)', async () => {
    const h = new Driver();
    h.create('d1');
    h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 0 });
    started(await h.tryStart('d1', 't1'));
    h.runTo('t1', 4, 500);
    h.command('t1', 'sugar-500');
    h.runFrames('t1', 4, 100);
    expect(h.host.world('t1')!.tick).toBe(600);
    const lastTurnMsg = () => h.out.filter((m): m is Extract<FromWorker, { type: 'tryTurn' | 'tryHorizon' }> => (m.type === 'tryTurn' || m.type === 'tryHorizon') && m.dishId === 't1').at(-1)!;
    const keep = async () => {
      expect((await h.sendAsync({ type: 'saveSlot', requestId: h.id(), dishId: 't1', slotId: 'slot1', name: 'Kept turn' })).type).toBe('slotSaved');
      expect(h.turn('t1')!.kept).toEqual({ slotId: 'slot1' });
    };
    await keep();
    // Undo below the horizon: running again and no longer kept; back at the horizon the card says so.
    h.send({ type: 'undo', requestId: h.id(), dishId: 't1' }, 'ack');
    expect(h.host.world('t1')!.tick).toBe(500);
    expect(h.turn('t1')).toMatchObject({ state: 'running', kept: null });
    expect(lastTurnMsg()).toMatchObject({ type: 'tryTurn', turn: { state: 'running', kept: null } });
    h.runFrames('t1', 4, 100);
    expect(h.host.world('t1')!.tick).toBe(600);
    expect(h.turn('t1')).toMatchObject({ state: 'atHorizon', kept: null });
    expect(h.horizons('t1').at(-1)!.turn.kept).toBeNull();
    expect(await h.tryNext('t1', 't2', false)).toMatchObject({ type: 'tryRefused', code: 'unsaved' });

    // Kept, then changed at the horizon: the record forgets the slot (announced as the record, no new card).
    await keep();
    const cards = h.horizons('t1').length;
    h.command('t1', 'sugar-600');
    expect(h.turn('t1')).toMatchObject({ state: 'atHorizon', kept: null });
    expect(lastTurnMsg()).toMatchObject({ type: 'tryTurn', turn: { state: 'atHorizon', kept: null } });
    expect(h.horizons('t1')).toHaveLength(cards);

    // Kept, then Undo at the horizon (the command made there): still at the horizon, no longer kept.
    await keep();
    h.send({ type: 'undo', requestId: h.id(), dishId: 't1' }, 'ack');
    expect(h.host.world('t1')!.tick).toBe(600);
    expect(h.turn('t1')).toMatchObject({ state: 'atHorizon', kept: null });
    expect(lastTurnMsg()).toMatchObject({ turn: { kept: null } });
  });

  it('wave 6a integration: a journal note, a Follow, a goal sentence dismissed, a story card opened, a goal start/leave on a kept turn forget the slot; tryNext "unsaved" forgets it too', async () => {
    const h = new Driver();
    h.create('d1');
    h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 0 });
    started(await h.tryStart('d1', 't1', { objectiveId: 'SEE_SPRINTER_SPLIT' }));
    playTurn(h, 't1');
    expect(h.turn('t1')!.state).toBe('atHorizon');
    expect(goalsOf(h.notebook('t1'))).toMatchObject([{ id: 'goal-1', state: 'completed', shown: false }]);
    const lastTurnMsg = () => h.out.filter((m): m is Extract<FromWorker, { type: 'tryTurn' | 'tryHorizon' }> => (m.type === 'tryTurn' || m.type === 'tryHorizon') && m.dishId === 't1').at(-1)!;
    const keep = async () => {
      expect((await h.sendAsync({ type: 'saveSlot', requestId: h.id(), dishId: 't1', slotId: 'slot1', name: 'Kept turn' })).type).toBe('slotSaved');
      expect(h.turn('t1')!.kept).toEqual({ slotId: 'slot1' });
    };
    /** Each change: the record forgets the slot (announced as the record, no new card) and Another turn needs Discard. */
    const forgot = (label: string) => {
      expect(h.turn('t1'), label).toMatchObject({ state: 'atHorizon', kept: null });
      expect(lastTurnMsg(), label).toMatchObject({ type: 'tryTurn', turn: { state: 'atHorizon', kept: null } });
      expect(h.horizons('t1'), label).toHaveLength(cards);
    };
    const cards = h.horizons('t1').length;
    const worldId = h.host.world('t1')!.worldId;
    let n = 0;
    const note = () =>
      h.send(
        {
          type: 'journalPut',
          requestId: h.id(),
          dishId: 't1',
          entry: { version: 1, kind: 'observation', id: `observation:t1:${++n}`, saw: 'films on the stones', coincidedWith: 'the lid', recordedAt: '2026-10-11T00:00:00.000Z', dish: { name: 'Kept turn', second: 60, recipeId: 'FIRST_DISH_V1', seed: 104729 }, link: null, worldId },
        },
        'journal',
      );

    // A kept turn with nothing changed still holds its slot (the control: no false "unkept").
    await keep();
    h.send({ type: 'notebookGet', requestId: h.id(), dishId: 't1' }, 'notebook');
    expect(h.turn('t1')!.kept).toEqual({ slotId: 'slot1' });
    // A refused journal entry changes nothing and keeps the slot.
    expect(h.send({ type: 'journalPut', requestId: h.id(), dishId: 't1', entry: { kind: 'nonsense' } } as unknown as ToWorker, 'journal').stored).toBe(false);
    expect(h.turn('t1')!.kept).toEqual({ slotId: 'slot1' });

    // 1. A stored journal note.
    expect(note().stored).toBe(true);
    forgot('journalPut');
    expect(await h.tryNext('t1', 't2', false)).toMatchObject({ type: 'tryRefused', code: 'unsaved' });

    // 2. An accepted Follow (a favorite op); a refused one keeps the slot.
    await keep();
    const w = h.host.world('t1')!;
    const c = w.ents.cols;
    let birthId = 0;
    for (let i = 0; i < w.ents.highWater && birthId === 0; i++) if (c.alive[i] === 1) birthId = c.birthId[i]!;
    const fav = (op: unknown) => h.send({ type: 'favorite', requestId: h.id(), dishId: 't1', op } as ToWorker, 'notebook');
    expect(fav({ kind: 'follow', birthId: -3, nickname: null, pattern: 'hexagon' }).refused).toBeTruthy();
    expect(h.turn('t1')!.kept).toEqual({ slotId: 'slot1' });
    const followed = fav({ kind: 'follow', birthId, nickname: null, pattern: 'circle' });
    expect(followed.refused).toBeUndefined();
    expect(turnOf(followed.record)).toMatchObject({ kept: null }); // the answer's record already says so
    forgot('favorite');

    // 3. The finished goal's sentence dismissed (goalShown); dismissing it again changes nothing and keeps the slot.
    await keep();
    h.host.handle({ type: 'goalShown', dishId: 't1', id: 'goal-1' });
    expect(goalsOf(h.notebook('t1'))[0]!.shown).toBe(true);
    forgot('goalShown');
    await keep();
    h.host.handle({ type: 'goalShown', dishId: 't1', id: 'goal-1' });
    expect(h.turn('t1')!.kept).toEqual({ slotId: 'slot1' });

    // 3b. A story card opened (storyMark 'seen'); opening it again changes nothing and keeps the slot.
    const storyId = h.notebook('t1').stories![0]!.id;
    const mark = () => h.send({ type: 'storyMark', requestId: h.id(), dishId: 't1', id: storyId, mark: 'seen' }, 'notebook');
    expect(mark().refused).toBeUndefined();
    forgot('storyMark');
    await keep();
    mark();
    expect(h.turn('t1')!.kept).toEqual({ slotId: 'slot1' });

    // 4. A goal started, then 5. left (both accepted).
    const started2 = h.send({ type: 'goalStart', requestId: h.id(), dishId: 't1', objectiveId: 'SEE_SPRINTER_SPLIT' }, 'notebook');
    expect(started2.refused).toBeUndefined();
    forgot('goalStart');
    await keep();
    const left = h.send({ type: 'goalLeave', requestId: h.id(), dishId: 't1' }, 'notebook');
    expect(left.refused).toBeUndefined();
    forgot('goalLeave');

    // 6. Safety net: the slot is overwritten by another dish (no edit of this one): tryNext refuses "unsaved"
    //    and the record forgets the slot it no longer is in.
    await keep();
    expect((await h.sendAsync({ type: 'saveSlot', requestId: h.id(), dishId: 'd1', slotId: 'slot1', name: 'Other' })).type).toBe('slotSaved');
    expect(h.turn('t1')!.kept).toEqual({ slotId: 'slot1' });
    expect(await h.tryNext('t1', 't2', false)).toMatchObject({ type: 'tryRefused', code: 'unsaved' });
    forgot('tryNext unsaved');

    // Kept again with nothing changed: Another turn needs no Discard.
    await keep();
    started(await h.tryNext('t1', 't2', false));
  });

  it('fix round 1: deleting a saved dish never reaches a shelf record (deleteSlot refuses a shelf id)', async () => {
    const h = new Driver();
    h.create('d1');
    h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 0 });
    started(await h.tryStart('d1', 't1'));
    playTurn(h, 't1');
    const [rec] = h.shelfRecords();
    const before = h.storeSnapshot();
    const r = await h.sendAsync({ type: 'deleteSlot', requestId: h.id(), slotId: rec!.slotId });
    expect(r).toMatchObject({ type: 'error', message: SHELF_REMOVE_REFUSED });
    expect(h.storeSnapshot()).toBe(before);
    started(await h.tryNext('t1', 't2', true));
  });

  it('Undo below the horizon sets the turn running again; the try goal starts at each turn start; a goal longer than the turn is refused', async () => {
    const h = new Driver();
    h.create('d1');
    h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 0 });
    const setup = (await h.sendAsync({ type: 'trySetup', requestId: h.id(), dishId: 'd1' })) as Extract<FromWorker, { type: 'trySetup' }>;
    expect(setup.refusal).toBeNull();
    expect(setup.goals.map((g) => [g.id, g.durationSeconds])).toEqual([
      ['KEEP_SPRINTERS_GOING', 180],
      ['SEE_SPRINTER_SPLIT', null],
      ['WATCH_STARCH_BECOME_FOOD', null],
    ]);
    const before = h.storeSnapshot();
    expect(await h.tryStart('d1', 't1', { horizonSeconds: 60, objectiveId: 'KEEP_SPRINTERS_GOING' })).toMatchObject({ type: 'tryRefused', code: 'bad-request' });
    expect(await h.tryStart('d1', 't1', { horizonSeconds: 90 })).toMatchObject({ type: 'tryRefused', code: 'bad-request' });
    expect(h.storeSnapshot()).toBe(before);
    expect(h.host.world('t1')).toBeNull();

    const r1 = started(await h.tryStart('d1', 't1', { horizonSeconds: 60, objectiveId: 'SEE_SPRINTER_SPLIT' }));
    expect(goalsOf(h.notebook('t1'))).toMatchObject([{ id: 'goal-1', objectiveId: 'SEE_SPRINTER_SPLIT', state: 'running', startTick: 0 }]);
    expect(r1.turn.objectiveId).toBe('SEE_SPRINTER_SPLIT');
    h.runTo('t1', 4, 500);
    h.command('t1', 'sugar-500');
    h.runFrames('t1', 4, 100);
    expect(h.host.world('t1')!.tick).toBe(600);
    const hz = h.horizons('t1').at(-1)!;
    expect(hz.goal).toMatchObject({ objectiveId: 'SEE_SPRINTER_SPLIT', state: 'completed' });
    // Undo goes back to tick 500: the turn runs again (its clock is the world's tick).
    h.send({ type: 'undo', requestId: h.id(), dishId: 't1' }, 'ack');
    expect(h.host.world('t1')!.tick).toBe(500);
    expect(h.turn('t1')!.state).toBe('running');
    expect(h.out.filter((m) => m.type === 'tryTurn' && m.dishId === 't1').at(-1)).toMatchObject({ turn: { state: 'running' } });
    h.runFrames('t1', 4, 100);
    expect(h.host.world('t1')!.tick).toBe(600);
    expect(h.turn('t1')!.state).toBe('atHorizon');

    // Turn 2: progress resets — a fresh goal attempt at the start tick.
    started(await h.tryNext('t1', 't2', true));
    expect(goalsOf(h.notebook('t2'))).toMatchObject([{ id: 'goal-1', objectiveId: 'SEE_SPRINTER_SPLIT', state: 'running', startTick: 0 }]);

    // Finish: the turn is an ordinary paused dish and runs on past the horizon.
    h.runFrames('t2', 4, 200);
    expect(h.host.world('t2')!.tick).toBe(600);
    const fin = h.send({ type: 'tryFinish', requestId: h.id(), dishId: 't2' }, 'tryTurn');
    expect(fin.turn).toMatchObject({ state: 'finished' });
    expect(h.lastSnapshot('t2')!.speed).toBe(0);
    h.runTo('t2', 4, 700);
    expect(h.shelfRecords()).toHaveLength(1); // nothing deleted
  });

  it('Start refusals change nothing: a comparison copy, a held sample, a full shelf', async () => {
    const h = new Driver();
    h.create('d1');
    h.runTo('d1', 4, 20);
    h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 0 });
    h.send({ type: 'compareStart', requestId: h.id(), compareId: 'c1', sourceDishId: 'd1', aDishId: 'a', bDishId: 'b' }, 'compareState');
    const before = h.storeSnapshot();
    expect(await h.tryStart('a', 't1')).toMatchObject({ type: 'tryRefused', code: 'not-here' });
    expect(((await h.sendAsync({ type: 'trySetup', requestId: h.id(), dishId: 'b' })) as Extract<FromWorker, { type: 'trySetup' }>).refusal).toMatch(/comparison copy/);
    h.send({ type: 'compareDelete', requestId: h.id(), compareId: 'c1' }, 'done');
    // A held sample.
    h.host.handle({ type: 'activate', dishId: 'd1' });
    h.send({ type: 'sampleBegin', requestId: h.id(), dishId: 'd1' }, 'sampleBegun');
    h.send({ type: 'command', requestId: h.id(), dishId: 'd1', commandId: 'take', payload: { kind: 'sampleTake', x: 48.5, y: 64.5, radius: 3, mode: 'all' }, undoable: false }, 'ack');
    expect(h.host.world('d1')!.sample).not.toBeNull();
    expect(await h.tryStart('d1', 't1')).toMatchObject({ type: 'tryRefused', code: 'not-here' });
    h.send({ type: 'sampleCancel', requestId: h.id(), dishId: 'd1' }, 'sampleCancelled');
    expect(h.storeSnapshot()).toBe(before);
    // A full shelf: ten baselines, then the eleventh start is refused with the shelf's message.
    for (let k = 1; k <= 10; k++) {
      const r = started(await h.tryStart('d1', `t${k}`));
      h.host.handle({ type: 'activate', dishId: 'd1' });
      expect(r.turn.tryId).toBe(`try-${k}`);
    }
    const full = h.storeSnapshot();
    const r11 = await h.tryStart('d1', 't11');
    expect(r11).toMatchObject({ type: 'tryRefused', code: 'shelf' });
    expect((r11 as { message: string }).message).toMatch(/already keeps 10 Try my dish starting points/);
    expect(h.storeSnapshot()).toBe(full);
    expect(h.host.world('t11')).toBeNull();
  });

  it('the turns kind never alters behaviour: equal stateHash and trajectory digest with and without the TurnRecord (3,200 ticks at 4×, save → load)', async () => {
    const h = new Driver();
    h.create('d1');
    h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 0 });
    started(await h.tryStart('d1', 'turn', { horizonSeconds: 600 }));
    // The same moment without a turn record: Duplicate (an ordinary dish; favoritesOnly copies no turn).
    const dup = h.send({ type: 'duplicate', requestId: h.id(), dishId: 'turn', newDishId: 'plain' }, 'ready');
    expect(dup.info.turn).toBeUndefined();
    expect(turnOf(h.notebook('plain'))).toBeNull();
    expect(h.hash('plain')).toBe(h.hash('turn'));
    const play = async (dishId: string, reloadAs: string): Promise<string> => {
      h.host.handle({ type: 'activate', dishId });
      h.runTo(dishId, 4, 300);
      h.command(dishId, `${dishId}-a`);
      h.runTo(dishId, 4, 1600);
      h.host.handle({ type: 'setSpeed', dishId, speed: 0 });
      await h.sendAsync({ type: 'saveSlot', requestId: h.id(), dishId, slotId: dishId === 'turn' ? 'slot4' : 'slot5', name: dishId });
      const l = await h.sendAsync({ type: 'loadSlot', requestId: h.id(), slotId: dishId === 'turn' ? 'slot4' : 'slot5', newDishId: reloadAs });
      expect(l.type).toBe('loaded');
      h.runTo(reloadAs, 4, 2000);
      h.command(reloadAs, `${reloadAs}-b`, { kind: 'deposit', materialId: 'SUGAR', points: [[80, 60]], radius: 2, dose: 0.5 });
      h.runTo(reloadAs, 4, 3200);
      h.host.handle({ type: 'setSpeed', dishId: reloadAs, speed: 0 });
      return h.hash(reloadAs);
    };
    const withTurn = await play('turn', 'turn2');
    const without = await play('plain', 'plain2');
    expect(turnOf(h.notebook('turn2'))).toMatchObject({ state: 'running', horizonTicks: 6000 });
    expect(turnOf(h.notebook('plain2'))).toBeNull();
    expect(withTurn).toBe(without);
    expect(trajectoryDigest(h.host.world('turn2')!, 'full')).toBe(trajectoryDigest(h.host.world('plain2')!, 'full'));
  }, 600_000); // two 3,200-tick runs with save → load: over two minutes on a loaded 2-CPU machine

  it('save/import: a turn dish keeps its record; malformed records drop the notebook and the world loads; g2 and wave 5 saves load with no turns', async () => {
    const h = new Driver();
    h.create('d1');
    h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 0 });
    const r = started(await h.tryStart('d1', 't1', { objectiveId: 'SEE_SPRINTER_SPLIT', prediction: 'A split soon' }));
    h.runTo('t1', 4, 100);
    h.host.handle({ type: 'setSpeed', dishId: 't1', speed: 0 });
    const ex = { text: await h.exported('t1', false) };
    const good = await loadSaveFile(ex.text);
    expect(good.notebookDropped).toBeNull();
    expect(turnOf(good.notebook)).toEqual({ ...r.turn });
    expect(goalsOf(good.notebook)).toHaveLength(1);
    expect(turnsProblem([r.turn], { worldId: r.turn.turnWorldId })).toBeNull();
    // "Export without names or notes" leaves out the prediction and the baseline's name.
    const stripped = await loadSaveFile(await h.exported('t1', true));
    expect(turnOf(stripped.notebook)).toMatchObject({ prediction: '', baseline: { name: 'Shared dish' } });

    // Import: the dish opens with its turn, still running at its tick.
    const imp = await h.sendAsync({ type: 'importDish', requestId: h.id(), text: ex.text, newDishId: 'i1' });
    if (imp.type !== 'loaded') throw new Error('not loaded');
    expect(imp.info.turn).toMatchObject({ state: 'running', turn: 1 });

    const file = JSON.parse(ex.text) as { notebook: NotebookRecord };
    const hash = stateHash(good.world);
    const withTurns = async (turns: unknown): Promise<string> => {
      const nb = await sealNotebook({ ...file.notebook, turns } as unknown as NotebookRecord);
      return JSON.stringify({ ...file, notebook: nb });
    };
    const t = r.turn;
    const bad: [string, unknown][] = [
      ['two records', [t, { ...t, turn: 2 }]],
      ['a negative horizon', [{ ...t, horizonTicks: -600 }]],
      ['an unknown state', [{ ...t, state: 'paused' }]],
      ['a horizon not in 600/1800/6000', [{ ...t, horizonTicks: 1200 }]],
      ['another dish', [{ ...t, turnWorldId: 'other' }]],
      ['a start after the dish time', [{ ...t, startTick: 5000, baseline: { ...t.baseline, tick: 5000 } }]],
      ['a kept slot that is not a named slot', [{ ...t, kept: { slotId: 'autosave' } }]],
      ['an unknown field', [{ ...t, score: 3 }]],
    ];
    for (const [label, turns] of bad) {
      const got = await loadSaveFile(await withTurns(turns));
      expect(got.notebookDropped, label).toBe(NOTEBOOK_DROPPED_TEXT);
      expect(turnOf(got.notebook), label).toBeNull();
      expect(stateHash(got.world), label).toBe(hash);
      // Through the host: the dish still opens, with notebookDropped.
      const opened = await h.sendAsync({ type: 'importDish', requestId: h.id(), text: await withTurns(turns), newDishId: `bad-${label}` });
      expect(opened, label).toMatchObject({ type: 'loaded', notebookDropped: NOTEBOOK_DROPPED_TEXT });
      expect((opened as { info: { turn?: unknown } }).info.turn, label).toBeUndefined();
    }

    // A g2 save and a wave 5 save (a notebook with a goal and no 'turns' key) load with no turns.
    const g2 = await loadSaveFile(readG2SaveText(G2_SAVE_FILES[0]));
    expect(g2.notebookDropped).toBeNull();
    expect(turnOf(g2.notebook)).toBeNull();
    h.create('w5');
    h.send({ type: 'goalStart', requestId: h.id(), dishId: 'w5', objectiveId: 'SEE_SPRINTER_SPLIT' }, 'notebook');
    const w5 = await loadSaveFile(await h.exported('w5', false));
    expect(w5.notebookDropped).toBeNull();
    expect(Object.keys(w5.file.notebook!)).not.toContain('turns');
    expect(turnOf(w5.notebook)).toBeNull();
    expect(goalsOf(w5.notebook)).toHaveLength(1);

    // favoritesOnly never copies a turn; a turn-only notebook is written (not empty).
    expect(turnOf(favoritesOnly(good.notebook, 'copy'))).toBeNull();
    const only = await buildSaveFile(good.world, { name: 'x', savedAt: ISO, recipeId: null }, { notebook: { ...good.notebook, goals: [], stories: [] } });
    expect(turnOf((await loadSaveFile(only.text)).notebook)).toEqual(r.turn);
  });
});
