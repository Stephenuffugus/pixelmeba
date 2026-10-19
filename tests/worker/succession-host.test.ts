/**
 * P5.6 part 3: the succession notebook through the worker host (DishHost; src/worker/succession.ts via
 * NotebookWatch; SPEC §12.8; D-0070, D-0131).
 *
 * - detection on vs off over 3,000 ticks at 4× with a mid-run save → load: equal stateHash and full trajectory
 *   digest (the detector only observes);
 * - one NotebookChange { kind: 'succession' } per entry written, and no notice of any other kind for it;
 * - the entries of minutes completed before a save equal the uninterrupted run's after the reload; the minute in
 *   progress carries watchedFromTick (its gains and losses still come from the saved history, exactly);
 * - Undo past a minute drops that minute's entry with its own NotebookChange; Duplicate does not carry the kind.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { feedingKey, successionOf, type SuccessionEntry } from '../../src/persistence/notebookSuccession';
import type { NotebookRecord } from '../../src/persistence/notebook';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import type { CommandPayload } from '../../src/sim/commands';
import { stateHash } from '../../src/sim/serialize';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, NotebookChange, Speed, ToWorker } from '../../src/worker/protocol';
import { successionDetection } from '../../src/worker/succession';
import { trajectoryDigest } from '../helpers/trajectory';
import { registry } from '../helpers/world';

const REG = registry();
const ISO = '2026-10-18T00:00:00.000Z';
const SUGAR: CommandPayload = { kind: 'deposit', materialId: 'SUGAR', points: [[40, 70]], radius: 2, dose: 0.5 };

class Driver {
  now = 0;
  readonly out: FromWorker[] = [];
  readonly host: DishHost;
  private req = 0;
  constructor() {
    this.host = new DishHost(REG, (m) => this.out.push(m), { now: () => this.now, iso: () => ISO }, new SaveStore(new MemoryBackend()));
  }
  id(): number {
    return ++this.req;
  }
  send<T extends FromWorker['type']>(msg: ToWorker, type: T): Extract<FromWorker, { type: T }> {
    this.host.handle(msg);
    const id = (msg as { requestId: number }).requestId;
    const r = this.out.find((m) => m.type === type && (m as { requestId?: number }).requestId === id);
    if (!r) throw new Error(`no ${type}: ${JSON.stringify(this.out.filter((m) => m.type === 'error').slice(-2))}`);
    return r as Extract<FromWorker, { type: T }>;
  }
  async sendAsync(msg: ToWorker): Promise<FromWorker> {
    await this.host.handleAsync(msg);
    const id = (msg as { requestId: number }).requestId;
    return this.out.find((m) => (m as { requestId?: number }).requestId === id)!;
  }
  create(dishId: string, recipeId = 'SHARED_LUNCH_V1'): void {
    this.send({ type: 'create', requestId: this.id(), dishId, source: { kind: 'recipe', recipeId } }, 'ready');
  }
  notebook(dishId: string): NotebookRecord {
    return this.send({ type: 'notebookGet', requestId: this.id(), dishId }, 'notebook').record;
  }
  entries(dishId: string): readonly SuccessionEntry[] {
    return successionOf(this.notebook(dishId));
  }
  runTo(dishId: string, speed: Speed, target: number): void {
    this.host.handle({ type: 'activate', dishId });
    this.host.handle({ type: 'setSpeed', dishId, speed });
    const w = () => this.host.world(dishId)!;
    while (w().tick < target) {
      this.now += (Math.min(target - w().tick, 4) * 100) / speed;
      this.host.pump();
    }
    this.host.handle({ type: 'setSpeed', dishId, speed: 0 });
    expect(w().tick).toBe(target);
  }
  async saveLoad(dishId: string, newDishId: string): Promise<void> {
    expect((await this.sendAsync({ type: 'saveSlot', requestId: this.id(), dishId, slotId: 'slot1', name: dishId })).type).toBe('slotSaved');
    expect((await this.sendAsync({ type: 'loadSlot', requestId: this.id(), slotId: 'slot1', newDishId })).type).toBe('loaded');
    this.host.handle({ type: 'dispose', dishId });
  }
  changes(dishId: string, from = 0): NotebookChange[] {
    return this.out.slice(from).flatMap((m) => (m.type === 'notebookChanged' && m.dishId === dishId ? [m.change] : []));
  }
}

afterEach(() => {
  successionDetection.enabled = true;
});

/** SHARED_LUNCH_V1 at 4× to 3,000 ticks with a feed at 700 and a save → load at 1,450 (mid-minute 3). */
async function scenario(detect: boolean, saveAt: number | null): Promise<{ h: Driver; dish: string; hash: string; digest: string }> {
  successionDetection.enabled = detect;
  const h = new Driver();
  h.create('d');
  h.runTo('d', 4, 700);
  expect(h.send({ type: 'command', requestId: h.id(), dishId: 'd', commandId: 'feed', payload: SUGAR, undoable: true }, 'ack').result?.accepted).toBeGreaterThan(0);
  let dish = 'd';
  if (saveAt !== null) {
    h.runTo(dish, 4, saveAt);
    await h.saveLoad(dish, 'd2');
    dish = 'd2';
  }
  h.runTo(dish, 4, 3000);
  const w = h.host.world(dish)!;
  return { h, dish, hash: stateHash(w), digest: trajectoryDigest(w, 'full') };
}

describe('the succession notebook through DishHost', () => {
  it('detection on vs off, 3,000 ticks at 4× with a save → load: equal stateHash and trajectory digest; entries across the reload', async () => {
    const off = await scenario(false, 1450);
    const on = await scenario(true, 1450);
    expect(off.h.entries(off.dish)).toEqual([]);
    expect(on.hash).toBe(off.hash);
    expect(on.digest).toBe(off.digest);
    const whole = await scenario(true, null);
    expect(whole.hash).toBe(on.hash);
    const ref = whole.h.entries(whole.dish);
    const got = on.h.entries(on.dish);
    expect(ref.map((e) => e.id)).toEqual(['succ-1', 'succ-2', 'succ-3', 'succ-4', 'succ-5']);
    expect(got.map((e) => e.id)).toEqual(ref.map((e) => e.id));
    // Minutes completed before the save: equal (they were in the saved notebook).
    expect(got.slice(0, 2)).toEqual(ref.slice(0, 2));
    // The minute in progress: watched from the load; its gains and losses come from the saved history.
    expect(got[2]!.watchedFromTick).toBe(1450);
    expect(ref[2]!.watchedFromTick).toBeUndefined();
    const ranked = (e: SuccessionEntry) => e.lines.filter((l) => l.kind === 'gain' || l.kind === 'loss').map((l) => [l.kind, l.species, l.value]);
    expect(ranked(got[2]!)).toEqual(ranked(ref[2]!));
    // Later minutes are watched whole again.
    expect(got.slice(3)).toEqual(ref.slice(3));
    // A feeding link first seen before the save is never written again after the reload (first seen against the
    // notebook's earlier entries), and the reloaded run records exactly the links the uninterrupted one did.
    const links = (list: readonly SuccessionEntry[]) => list.flatMap((e) => e.lines.filter((l) => l.kind === 'newFeeding').map((l) => feedingKey(l)));
    expect(links(got)).toEqual([...new Set(links(got))]);
    expect(links(got)).toEqual(links(ref));
    // One NotebookChange per entry written, carrying the entry (no notice of another kind for it).
    const written = whole.h.changes(whole.dish).filter((c) => c.kind === 'succession');
    expect(written.map((c) => (c).entry)).toEqual(ref);
    console.log('SHARED_LUNCH_V1 minute 3 across the reload:', JSON.stringify(got[2]));
  }, 900_000);

  it('Undo past a minute drops its entry with a NotebookChange; Duplicate does not carry the kind', () => {
    const h = new Driver();
    h.create('d');
    h.runTo('d', 4, 1190);
    expect(h.send({ type: 'command', requestId: h.id(), dishId: 'd', commandId: 'feed', payload: SUGAR, undoable: true }, 'ack').result?.accepted).toBeGreaterThan(0);
    h.runTo('d', 4, 1210);
    expect(h.entries('d').map((e) => e.id)).toEqual(['succ-1', 'succ-2']);
    const mark = h.out.length;
    h.send({ type: 'undo', requestId: h.id(), dishId: 'd' }, 'ack');
    const restored = h.host.world('d')!.tick;
    expect(restored).toBeLessThan(1200);
    expect(h.entries('d').map((e) => e.id)).toEqual(['succ-1']);
    expect(h.changes('d', mark)).toContainEqual({ kind: 'successionRestored', id: 'succ-2' });
    // The watch rebinds at the restored tick: the next minute entry is watched from there.
    h.runTo('d', 4, 1200);
    expect(h.entries('d').at(-1)).toMatchObject({ id: 'succ-2', watchedFromTick: restored });
    h.send({ type: 'duplicate', requestId: h.id(), dishId: 'd', newDishId: 'copy' }, 'ready');
    expect(h.notebook('copy').succession).toBeUndefined();
  }, 300_000);
});
