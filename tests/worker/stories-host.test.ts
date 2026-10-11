/**
 * P4.2 story cards through the worker host (DishHost; D-0070 notebook state).
 *
 * - cards round-trip in the notebook through save → load (slot) and export → import;
 * - a malformed card drops the notebook with notebookDropped, and the world still loads unchanged;
 * - a stage 1 notebook (no 'stories' key) and a g2 save load with no cards, and the g2 dish's species
 *   that already split before are never given "A first split";
 * - 50 cards plus one removes the oldest dismissed card (then opened, then oldest);
 * - storyMark marks a card seen / dismissed as notebook state: no command, the same stateHash;
 * - Undo removes the cards found in the undone time (storiesRestored);
 * - D-0079 first minute: a dish's first story notification comes no sooner than 600 ticks after its watch
 *   began (created at 0; loaded, continued or copied at T): the pickStory choice among the cards that waited;
 * - never alters behaviour: the Garden with one sugar deposit at 4× for 3,000 ticks gives the same
 *   stateHash and full trajectory digest with the detector on and off.
 */
import { describe, expect, it } from 'vitest';
import { sealNotebook, type NotebookRecord } from '../../src/persistence/notebook';
import { STORIES_MAX, type StoryCard } from '../../src/persistence/notebookStories';
import { loadSaveFile } from '../../src/persistence/saveFile';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import { stateHash } from '../../src/sim/serialize';
import type { World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, Speed, ToWorker } from '../../src/worker/protocol';
import { pickStory, storyDetection } from '../../src/worker/stories';
import { STORY_WINDOW_TICKS } from '../../src/persistence/notebookStories';
import { readG2SaveText } from '../helpers/g2-saves';
import { trajectoryDigest } from '../helpers/trajectory';
import { registry } from '../helpers/world';

const REG = registry();
const SUGAR = { kind: 'deposit', materialId: 'SUGAR', points: [[54, 54]], radius: 3, dose: 0.5 } as const;

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
  create(dishId: string): World {
    this.send({ type: 'create', requestId: this.id(), dishId, source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } }, 'ready');
    return this.host.world(dishId)!;
  }
  command(dishId: string, payload: unknown, undoable = true) {
    return this.send({ type: 'command', requestId: this.id(), dishId, commandId: `c${this.req}`, payload, undoable } as ToWorker, 'ack');
  }
  runTo(dishId: string, speed: Speed, target: number): void {
    this.host.handle({ type: 'setSpeed', dishId, speed });
    const w = () => this.host.world(dishId)!;
    while (w().tick < target) {
      this.now += (Math.min(target - w().tick, 4) * 100) / speed;
      this.host.pump();
    }
    this.host.handle({ type: 'setSpeed', dishId, speed: 0 });
    expect(w().tick).toBe(target);
  }
  notebook(dishId: string): NotebookRecord {
    return this.send({ type: 'notebookGet', requestId: this.id(), dishId }, 'notebook').record;
  }
  stories(dishId: string): readonly StoryCard[] {
    return this.notebook(dishId).stories ?? [];
  }
  async exportText(dishId: string): Promise<string> {
    return (await this.sendAsync({ type: 'exportDish', requestId: this.id(), dishId, strip: false }, 'exported')).text;
  }
  async importText(text: string, newDishId: string) {
    return this.sendAsync({ type: 'importDish', requestId: this.id(), text, newDishId }, 'loaded');
  }
  /**
   * Step `dishId` one tick at a time up to `target` (any dish, active or not): every story notification posted (with its tick), and
   * the dish's cards as they stood just before the first one.
   */
  notifications(dishId: string, target: number): { notified: { tick: number; id: string }[]; beforeFirst: readonly StoryCard[] } {
    const notified: { tick: number; id: string }[] = [];
    let beforeFirst: readonly StoryCard[] = [];
    for (let t = this.host.world(dishId)!.tick; t < target; t++) {
      const prior = this.stories(dishId);
      this.out.length = 0; // read tick by tick: what was posted before is not needed again (keeps memory flat)
      this.host.handle({ type: 'step', dishId }); // one stepDish, the same step a running dish takes
      expect(this.host.world(dishId)!.tick).toBe(t + 1);
      for (const m of this.out)
        if (m.type === 'notebookChanged' && m.dishId === dishId && m.change.kind === 'story' && m.change.notify) {
          if (notified.length === 0) beforeFirst = prior;
          notified.push({ tick: this.host.world(dishId)!.tick, id: m.change.id });
        }
    }
    return { notified, beforeFirst };
  }
}

describe('story cards through DishHost', () => {
  it('cards round-trip in the notebook through save → load and export → import', async () => {
    const h = new Driver();
    h.create('d1');
    h.runTo('d1', 4, 700);
    const before = h.stories('d1');
    expect(before.length).toBeGreaterThan(0);
    expect(before.map((c) => c.template)).toContain('firstSplit');
    await h.sendAsync({ type: 'saveSlot', requestId: h.id(), dishId: 'd1', slotId: 'slot1', name: 'Stories' }, 'slotSaved');
    await h.sendAsync({ type: 'loadSlot', requestId: h.id(), slotId: 'slot1', newDishId: 'd2' }, 'loaded');
    expect(h.stories('d2')).toEqual(before);
    const text = await h.exportText('d1');
    const loaded = await h.importText(text, 'd3');
    expect(loaded.notebookDropped).toBeUndefined();
    expect(h.stories('d3')).toEqual(before);
    expect(stateHash(h.host.world('d3')!)).toBe(stateHash(h.host.world('d1')!));
  }, 120_000);

  it('a malformed card drops the notebook with notebookDropped; the world loads unchanged', async () => {
    const h = new Driver();
    h.create('d1');
    h.runTo('d1', 4, 400);
    const text = await h.exportText('d1');
    const file = JSON.parse(text) as { notebook: NotebookRecord };
    const bad = file.notebook.stories!.map((c, i) => (i === 0 ? { ...c, evidence: [] } : c));
    file.notebook = await sealNotebook({ ...file.notebook, stories: bad }); // a valid checksum: only the card is wrong
    const loaded = await h.importText(JSON.stringify(file), 'd2');
    expect(loaded.notebookDropped).toMatch(/could not be read/);
    expect(h.stories('d2')).toEqual([]);
    expect(stateHash(h.host.world('d2')!)).toBe(stateHash(h.host.world('d1')!));
    // An unknown template and a card from a later time are dropped the same way.
    for (const broken of [
      { ...file.notebook.stories?.[0], template: 'aWinner' },
      { ...(JSON.parse(text) as { notebook: NotebookRecord }).notebook.stories![0], timeRange: [0, 999_999] },
    ]) {
      const f = JSON.parse(text) as { notebook: NotebookRecord };
      f.notebook = await sealNotebook({ ...f.notebook, stories: [broken as StoryCard] });
      const r = await loadSaveFile(JSON.stringify(f));
      expect(r.notebookDropped).not.toBeNull();
      expect(stateHash(r.world)).toBe(stateHash(h.host.world('d1')!));
    }
  }, 120_000);

  it('a stage 1 notebook (no stories key) and a g2 save load with no cards; species that split before get no "first split"', async () => {
    const h = new Driver();
    h.create('d1');
    h.send({ type: 'favorite', requestId: h.id(), dishId: 'd1', op: { kind: 'follow', birthId: 10, nickname: null, pattern: 'circle' } }, 'notebook');
    const w = h.host.world('d1')!;
    // A stage 1 file: favorites only, sealed without the stories key.
    const text = await h.exportText('d1');
    const file = JSON.parse(text) as { notebook: NotebookRecord };
    const { stories: _s, ...stage1 } = file.notebook;
    file.notebook = await sealNotebook(stage1);
    expect('stories' in file.notebook).toBe(false);
    const r = await loadSaveFile(JSON.stringify(file));
    expect(r.notebookDropped).toBeNull();
    expect(r.notebook.favorites).toHaveLength(1);
    expect(r.notebook.stories ?? []).toEqual([]);
    expect(stateHash(r.world)).toBe(stateHash(w));

    const g2 = await h.importText(readG2SaveText('first-dish-t3000.pixelmeba.gz'), 'g2');
    expect(g2.notebookDropped).toBeUndefined();
    expect(h.stories('g2')).toEqual([]);
    const gw = h.host.world('g2')!;
    const t0 = gw.tick;
    h.runTo('g2', 4, t0 + 400);
    // Sprinters split long before this save: playing on never calls one of their splits a first.
    expect(h.stories('g2').filter((c) => c.key === 'firstSplit:B01')).toEqual([]);
  }, 120_000);

  it('50 cards plus one: the oldest dismissed card goes first, then the oldest opened, then the oldest', async () => {
    const h = new Driver();
    h.create('d1');
    h.runTo('d1', 4, 400);
    const text = await h.exportText('d1');
    const file = JSON.parse(text) as { notebook: NotebookRecord };
    const real = file.notebook.stories!;
    const template = real.find((c) => c.template === 'enzymeAtWork')!;
    const filler = Array.from({ length: STORIES_MAX }, (_, i) => ({
      ...template,
      id: `story-${i + 1}`,
      key: `enzymeAtWork:filler-${i + 1}`,
      evidence: [template.evidence[0]!],
      notified: true,
      seen: i === 3 || i === 20,
      dismissed: i === 20 || i === 30,
    })) as StoryCard[];
    file.notebook = await sealNotebook({ ...file.notebook, stories: filler });
    await h.importText(JSON.stringify(file), 'd2');
    expect(h.stories('d2')).toHaveLength(STORIES_MAX);
    const ids = () => h.stories('d2').map((c) => c.id);
    // Run tick by tick until four new cards were recorded, reading which card each one removed.
    const removedOrder: string[] = [];
    let have = ids();
    h.runTo('d2', 4, 420);
    h.command('d2', SUGAR); // a place change later on, so four new cards are recorded in this run
    let tick = h.host.world('d2')!.tick;
    while (removedOrder.length < 4 && tick < 4000) {
      tick += 1;
      h.runTo('d2', 4, tick);
      const now = ids();
      if (now.length !== STORIES_MAX) throw new Error('the dish no longer keeps 50');
      const gone = have.filter((id) => !now.includes(id));
      removedOrder.push(...gone);
      have = now;
    }
    // story-21 (dismissed, oldest dismissed), story-31 (dismissed), story-4 (opened), then the oldest: story-1.
    expect(removedOrder.slice(0, 4)).toEqual(['story-21', 'story-31', 'story-4', 'story-1']);
    expect(h.out.some((m) => m.type === 'error')).toBe(false);
  }, 300_000);

  it('storyMark: seen and dismissed are notebook state; no command, the same stateHash', () => {
    const h = new Driver();
    h.create('d1');
    h.runTo('d1', 4, 400);
    const w = h.host.world('d1')!;
    const seq = w.commands.nextSeq;
    const hash = stateHash(w);
    const id = h.stories('d1')[0]!.id;
    const a = h.send({ type: 'storyMark', requestId: h.id(), dishId: 'd1', id, mark: 'seen' }, 'notebook');
    expect(a.refused).toBeUndefined();
    expect(a.record.stories!.find((c) => c.id === id)).toMatchObject({ seen: true, dismissed: false });
    const b = h.send({ type: 'storyMark', requestId: h.id(), dishId: 'd1', id, mark: 'dismissed' }, 'notebook');
    expect(b.record.stories!.find((c) => c.id === id)).toMatchObject({ seen: true, dismissed: true });
    const c = h.send({ type: 'storyMark', requestId: h.id(), dishId: 'd1', id: 'story-999', mark: 'seen' }, 'notebook');
    expect(c.refused).toBe('That story card is not in this dish.');
    expect(w.commands.nextSeq).toBe(seq);
    expect(stateHash(h.host.world('d1')!)).toBe(hash);
  }, 120_000);

  it('Undo removes the cards found in the undone time (storiesRestored); earlier cards stay', () => {
    const h = new Driver();
    h.create('d1');
    h.runTo('d1', 4, 250);
    const early = h.stories('d1').map((c) => c.id);
    h.command('d1', SUGAR);
    h.runTo('d1', 4, 700);
    expect(h.stories('d1').length).toBeGreaterThan(early.length);
    h.send({ type: 'undo', requestId: h.id(), dishId: 'd1' }, 'ack');
    const after = h.stories('d1');
    expect(after.map((c) => c.id)).toEqual(early);
    const w = h.host.world('d1')!;
    for (const c of after) expect(c.timeRange[1]).toBeLessThanOrEqual(w.tick);
    expect(h.out.some((m) => m.type === 'notebookChanged' && m.change.kind === 'storiesRestored')).toBe(true);
  }, 120_000);
});

describe('D-0079 first minute: the first story notification waits a full window from the watch start', () => {
  it('a fresh dish announces nothing before tick 600, then the pickStory choice among the cards that waited', () => {
    const h = new Driver();
    h.create('d1');
    const { notified, beforeFirst } = h.notifications('d1', STORY_WINDOW_TICKS + 4);
    expect(beforeFirst.length).toBeGreaterThan(1); // cards were found in the first minute, recorded quietly
    expect(beforeFirst.every((c) => !c.notified)).toBe(true);
    expect(notified).toHaveLength(1);
    expect(notified[0]!.tick).toBe(STORY_WINDOW_TICKS);
    expect(notified[0]!.id).toBe(pickStory(beforeFirst, beforeFirst)!.id);
  }, 120_000);

  it('a loaded dish (Load, and Continue: the autosave slot) waits 600 ticks from its load tick', async () => {
    const h = new Driver();
    h.create('d1');
    h.runTo('d1', 4, 500); // cards found, none announced yet (the first window is still closed)
    expect(h.stories('d1').length).toBeGreaterThan(0);
    expect(h.stories('d1').some((c) => c.notified)).toBe(false);
    await h.sendAsync({ type: 'saveSlot', requestId: h.id(), dishId: 'd1', slotId: 'slot1', name: 'First minute' }, 'slotSaved');
    await h.sendAsync({ type: 'autosave', requestId: h.id(), dishId: 'd1' }, 'slotSaved');
    for (const [slotId, dishId] of [
      ['slot1', 'd2'],
      ['autosave', 'd3'],
    ] as const) {
      await h.sendAsync({ type: 'loadSlot', requestId: h.id(), slotId, newDishId: dishId }, 'loaded');
      const start = h.host.world(dishId)!.tick;
      expect(start).toBe(500);
      const { notified } = h.notifications(dishId, start + STORY_WINDOW_TICKS + 40);
      expect(notified.length).toBeGreaterThan(0);
      expect(notified[0]!.tick).toBeGreaterThanOrEqual(start + STORY_WINDOW_TICKS);
    }
  }, 300_000);

  it('a dish whose watch starts at tick T > 0 (a copy made at T) waits until T + 600', () => {
    const h = new Driver();
    h.create('d1');
    h.runTo('d1', 4, 700);
    h.send({ type: 'duplicate', requestId: h.id(), dishId: 'd1', newDishId: 'd2' }, 'ready');
    const start = h.host.world('d2')!.tick;
    expect(start).toBe(700);
    const { notified } = h.notifications('d2', start + STORY_WINDOW_TICKS + 40);
    expect(notified.length).toBeGreaterThan(0);
    expect(notified[0]!.tick).toBeGreaterThanOrEqual(start + STORY_WINDOW_TICKS);
  }, 300_000);
});

describe('story cards never alter behaviour', () => {
  function run(enabled: boolean): { hash: string; digest: string; cards: number; tick: number } {
    storyDetection.enabled = enabled;
    try {
      const h = new Driver();
      h.create('d1');
      h.runTo('d1', 4, 300);
      h.command('d1', SUGAR);
      h.runTo('d1', 4, 3000);
      const w = h.host.world('d1')!;
      return { hash: stateHash(w), digest: trajectoryDigest(w, 'full'), cards: h.stories('d1').length, tick: w.tick };
    } finally {
      storyDetection.enabled = true;
    }
  }

  it('the Garden with one sugar deposit, 4×, 3,000 ticks: equal stateHash and full trajectory digest with the detector on and off', () => {
    const on = run(true);
    const off = run(false);
    expect(on.tick).toBe(3000);
    expect(on.cards).toBeGreaterThan(3); // the detector really ran (first splits, enzymes, the place change)
    expect(off.cards).toBe(0);
    expect(on.hash).toBe(off.hash);
    expect(on.digest).toBe(off.digest);
  }, 600_000);
});
