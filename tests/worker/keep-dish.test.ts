/**
 * D-0033 "keep the open dish first", through the real DishHost exactly as sim.worker.ts drives it (an
 * in-memory save store). Every action that replaces the open dish — Play shelf / New Dish (create),
 * Saved dishes → Open (a named slot, the autosave, an automatic checkpoint), Import and an experiment
 * card's Start — keeps it through What if?'s one keep step before the new dish opens:
 * - nothing is written when keeping is unnecessary: a What if? dish still exactly at its start
 *   ('unchanged'), or a dish its own slot already holds exactly ('saved': same checksummed file and
 *   name), and a changed dish is never skipped (a tick, a command, a journal note the state hash does
 *   not see, a slot overwritten or deleted meanwhile);
 * - a changed dish goes to its own slot (the store keeps the previous copy) or else the first empty
 *   one, never into the save being opened, and Continue follows (except when Continue is what opens);
 * - with all ten slots used the plan says 'full' and the action is refused with nothing written;
 *   Cancel (the refusal) leaves the dish exactly as it was, in its run state; export and a deliberate
 *   replacement then go ahead; a failed write refuses the replacement and changes nothing;
 * - Continue reopens a dish bound to the slot it was saved to, only while that slot holds the same dish.
 */
import { describe, expect, it } from 'vitest';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { COLUMNS_ADDED_IN, stateHash, type WorldState } from '../../src/sim/serialize';
import { canonicalJson, sha256Hex } from '../../src/sim/hash';
import { SCHEMA_VERSION, type World } from '../../src/sim/world';
import { AUTOSAVE_SLOT, MemoryBackend, SaveStore } from '../../src/persistence/store';
import { gunzipText } from '../../src/persistence/compress';
import { loadSaveFile } from '../../src/persistence/saveFile';
import { DishHost } from '../../src/worker/host';
import type { DishSource, FromWorker, KeepFrom, ToWorker, WhatIfKeep, WhatIfKept } from '../../src/worker/protocol';
import { registry } from '../helpers/world';

const REG = registry();
const GARDEN = { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } as const;
const NAMED = SaveStore.slotIds();

type Of<T extends FromWorker['type']> = Extract<FromWorker, { type: T }>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Replaced = { readonly ok: true; readonly dishId: string; readonly kept: WhatIfKept | null; readonly reply: FromWorker } | { readonly ok: false; readonly reply: Of<'keepRefused'> };

function harness(opts: { store?: boolean; reg?: ContentRegistry; backend?: MemoryBackend } = {}) {
  let now = 0;
  let req = 0;
  let fresh = 0;
  const out: FromWorker[] = [];
  // Fix round 1: a second harness on the same backend stands for a new session (a relaunch).
  const backend = opts.backend ?? new MemoryBackend();
  const store = opts.store === false ? null : new SaveStore(backend);
  const host = new DishHost(opts.reg ?? REG, (m) => out.push(m), { now: () => now, iso: () => '2026-09-29T00:00:00.000Z' }, store, true);
  const h = {
    host,
    out,
    backend,
    store,
    /** Send one request exactly as the worker entry does (host.handle) and wait for its reply. */
    async ask(msg: DistributiveOmit<ToWorker, 'requestId'>): Promise<FromWorker> {
      const requestId = ++req;
      host.handle({ ...msg, requestId } as ToWorker);
      // Asynchronous requests (storage, checksums) answer later; a loaded machine can be slow.
      const deadline = Date.now() + 60_000;
      for (;;) {
        const reply = out.find((m) => 'requestId' in m && m.requestId === requestId);
        if (reply) return reply;
        if (Date.now() > deadline) throw new Error(`no reply to ${msg.type}`);
        await new Promise((r) => setTimeout(r, 2));
      }
    },
    async create(dishId: string, source: DishSource = GARDEN, name?: string): Promise<void> {
      const r = await h.ask({ type: 'create', dishId, source, ...(name ? { name } : {}) });
      if (r.type !== 'ready') throw new Error(JSON.stringify(r));
    },
    world(dishId: string): World {
      const w = host.world(dishId);
      if (!w) throw new Error(`no dish ${dishId}`);
      return w;
    },
    hash: (dishId: string) => stateHash(h.world(dishId)),
    steps(dishId: string, n: number): void {
      for (let k = 0; k < n; k++) host.handle({ type: 'step', dishId });
    },
    frame(ms: number): void {
      now += ms;
      host.pump();
    },
    speedOf(dishId: string): number | undefined {
      const snaps = out.filter((m): m is Of<'snapshot'> => m.type === 'snapshot' && m.dishId === dishId);
      return snaps.at(-1)?.speed;
    },
    async save(dishId: string, slotId: string, name: string): Promise<void> {
      const r = await h.ask({ type: 'saveSlot', dishId, slotId, name });
      if (r.type !== 'slotSaved') throw new Error(JSON.stringify(r));
    },
    /** Everything the store holds (index and record ids): equal before and after means nothing was written. */
    storeState: () => JSON.stringify({ slots: backend.slots, records: Object.keys(backend.records).sort() }),
    /** The state hash of the world a slot's current record holds. */
    async slotHash(slotId: string): Promise<string> {
      const info = backend.slots[slotId];
      if (!info) throw new Error(`slot ${slotId} is empty`);
      return stateHash((await loadSaveFile(await gunzipText(backend.records[info.current]!.data))).world);
    },
    async recordHash(recordId: string): Promise<string> {
      return stateHash((await loadSaveFile(await gunzipText(backend.records[recordId]!.data))).world);
    },
    nextId: () => `new-${++fresh}`,
  };
  return h;
}

type H = ReturnType<typeof harness>;

/** The five replacing actions, each opening a new dish with `keepFrom` (null: no dish is open). */
const ACTIONS = {
  play: async (h: H, keepFrom: KeepFrom | null) => replaced(h, await h.ask({ type: 'create', dishId: h.nextId(), source: GARDEN, name: 'Little Living Garden', ...(keepFrom ? { keepFrom } : {}) })),
  newDish: async (h: H, keepFrom: KeepFrom | null) =>
    replaced(
      h,
      await h.ask({
        type: 'create',
        dishId: h.nextId(),
        source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1', seed: 5, overrides: { mutationPreset: 'accelerated', founderMode: 'varied', empty: false } },
        name: 'My dish',
        ...(keepFrom ? { keepFrom } : {}),
      }),
    ),
  experiment: async (h: H, keepFrom: KeepFrom | null) =>
    replaced(h, await h.ask({ type: 'experimentStart', cardId: 'EXP_103', newDishId: h.nextId(), compare: null, ...(keepFrom ? { keepFrom } : {}) })),
  import: async (h: H, keepFrom: KeepFrom | null) => {
    const text = await gardenFile();
    return replaced(h, await h.ask({ type: 'importDish', text, newDishId: h.nextId(), ...(keepFrom ? { keepFrom } : {}) }));
  },
  open: async (h: H, keepFrom: KeepFrom | null, slotId = 'slot9') => replaced(h, await h.ask({ type: 'loadSlot', slotId, newDishId: h.nextId(), ...(keepFrom ? { keepFrom } : {}) })),
} as const;

function replaced(h: H, reply: FromWorker): Replaced {
  if (reply.type === 'keepRefused') return { ok: false, reply };
  if (reply.type === 'ready' || reply.type === 'loaded' || reply.type === 'experimentStarted') {
    expect(h.host.activeDishId).toBe(reply.info.dishId);
    return { ok: true, dishId: reply.info.dishId, kept: reply.kept ?? null, reply };
  }
  throw new Error(`unexpected reply ${JSON.stringify(reply).slice(0, 300)}`);
}

let gardenText: string | null = null;
/** A small valid .pixelmeba file to import (a Garden that ran 3 ticks). */
async function gardenFile(): Promise<string> {
  if (gardenText) return gardenText;
  const h = harness();
  await h.create('src');
  h.steps('src', 3);
  const r = await h.ask({ type: 'exportDish', dishId: 'src', strip: false });
  gardenText = (r as Of<'exported'>).text;
  return gardenText;
}

const auto = (dishId: string, keep: WhatIfKeep = { kind: 'auto' }): KeepFrom => ({ dishId, keep });

/** A save to open in slot9 (a different dish), written before the test's own saves. */
async function withSaveInSlot9(h: H): Promise<void> {
  await h.create('other', { kind: 'recipe', recipeId: 'FIRST_DISH_V1', seed: 9 });
  h.steps('other', 2);
  await h.save('other', 'slot9', 'Other dish');
  h.host.handle({ type: 'dispose', dishId: 'other' });
}

describe('D-0033: every replacing action keeps the open dish first', () => {
  for (const [name, act] of Object.entries(ACTIONS)) {
    it(`${name}: a changed dish with no slot of its own goes to the first empty slot and Continue, then the new dish opens`, async () => {
      const h = harness();
      await withSaveInSlot9(h);
      await h.create('cur');
      h.steps('cur', 12);
      const before = h.hash('cur');
      const r = await act(h, auto('cur'));
      if (!r.ok) throw new Error(r.reply.message);
      expect(r.kept).toMatchObject({ kind: 'slot', replaced: null, name: 'FIRST_DISH_V1', autosaved: true });
      expect(r.kept!.slot?.slotId).toBe('slot1');
      expect(await h.slotHash('slot1')).toBe(before);
      expect(await h.slotHash(AUTOSAVE_SLOT)).toBe(before);
      // The kept dish itself is not changed by being kept.
      expect(h.hash('cur')).toBe(before);
      expect(r.dishId).not.toBe('cur');
    });

    it(`${name}: with all ten slots used it is refused ('full'), nothing is written, and the dish keeps running exactly as it was`, async () => {
      const h = harness();
      await withSaveInSlot9(h);
      await h.create('filler');
      for (const slotId of NAMED.filter((s) => s !== 'slot9')) {
        h.steps('filler', 1);
        await h.save('filler', slotId, `Old ${slotId}`);
      }
      await h.create('cur');
      h.host.handle({ type: 'setSpeed', dishId: 'cur', speed: 1 });
      h.frame(0);
      h.frame(500);
      const tick = h.world('cur').tick;
      expect(tick).toBeGreaterThan(0);
      const before = h.hash('cur');
      const stored = h.storeState();
      expect((await h.ask({ type: 'keepPlan', aboutDishId: 'cur' })) as Of<'keepPlan'>).toMatchObject({ plan: { kind: 'full', name: 'FIRST_DISH_V1' } });
      const r = await act(h, auto('cur'));
      if (r.ok) throw new Error('expected a refusal');
      expect(r.reply.code).toBe('slots-full');
      expect(r.reply.message).toBe('All ten save slots are used, so "FIRST_DISH_V1" has nowhere to go. Export it as a file or choose a save to replace. Nothing has changed.');
      expect(h.storeState()).toBe(stored);
      expect(h.host.activeDishId).toBe('cur');
      expect(h.world('cur').tick).toBe(tick);
      expect(h.hash('cur')).toBe(before);
      // Cancel is the refusal: the dish resumes its run state (it was running).
      h.frame(1000);
      expect(h.world('cur').tick).toBeGreaterThan(tick);
    });

    it(`${name}: a failed write refuses the replacement with a readable message and changes nothing`, async () => {
      const h = harness();
      await withSaveInSlot9(h);
      await h.create('cur');
      h.steps('cur', 4);
      const before = h.hash('cur');
      const stored = h.storeState();
      const dishes = h.out.filter((m) => m.type === 'ready' || m.type === 'loaded').length;
      h.backend.failNextCommit = true;
      const r = await act(h, auto('cur'));
      if (r.ok) throw new Error('expected a refusal');
      expect(r.reply.code).toBe('save-failed');
      expect(r.reply.message).toMatch(/^"FIRST_DISH_V1" could not be saved, so the (new dish|experiment|file|saved dish) was not (started|opened)\. Your saves are unchanged\. \(simulated write failure\)$/);
      expect(h.storeState()).toBe(stored);
      expect(h.host.activeDishId).toBe('cur');
      expect(h.hash('cur')).toBe(before);
      expect(h.out.filter((m) => m.type === 'ready' || m.type === 'loaded').length).toBe(dishes);
      // The same action now goes ahead.
      expect((await act(h, auto('cur'))).ok).toBe(true);
    });
  }

  it('the refusal words say what was not done, per action', async () => {
    const words: Record<string, string> = {};
    for (const [name, act] of Object.entries(ACTIONS)) {
      const h = harness();
      await withSaveInSlot9(h);
      await h.create('cur');
      h.steps('cur', 1);
      h.backend.failNextCommit = true;
      const r = await act(h, auto('cur'));
      if (r.ok) throw new Error('expected a refusal');
      words[name] = /so (.*) was not/.exec(r.reply.message)![1]!;
    }
    expect(words).toEqual({ play: 'the new dish', newDish: 'the new dish', experiment: 'the experiment', import: 'the file', open: 'the saved dish' });
  });

  it('with no dish open nothing is kept and nothing is written', async () => {
    for (const act of Object.values(ACTIONS)) {
      const h = harness();
      await withSaveInSlot9(h);
      const stored = h.storeState();
      const r = await act(h, null);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.kept).toBeNull();
      expect(h.storeState()).toBe(stored);
    }
  });
});

describe('Nothing is written when keeping is unnecessary (D-0033 (a) and (b))', () => {
  it('(a) a What if? dish still exactly at its start rebuilds exactly: every action writes nothing', async () => {
    for (const act of Object.values(ACTIONS)) {
      const h = harness();
      await withSaveInSlot9(h);
      const s = await h.ask({ type: 'whatIfStart', newDishId: 'v', fromDishId: null, pick: { kind: 'variant', variantId: 'R-G2' }, keep: { kind: 'auto' } });
      expect(s.type).toBe('whatIfStarted');
      expect(((await h.ask({ type: 'keepPlan', aboutDishId: 'v' })) as Of<'keepPlan'>).plan).toEqual({ kind: 'unchanged', name: 'A bigger meal' });
      const stored = h.storeState();
      const r = await act(h, auto('v'));
      if (!r.ok) throw new Error(r.reply.message);
      expect(r.kept).toEqual({ kind: 'unchanged', slot: null, replaced: null, name: 'A bigger meal', autosaved: false });
      expect(h.storeState()).toBe(stored);
    }
  });

  it('(b) a dish its own slot already holds exactly is not written again (not even Continue); the plan says so', async () => {
    for (const act of Object.values(ACTIONS)) {
      const h = harness();
      await withSaveInSlot9(h);
      await h.create('cur');
      h.steps('cur', 6);
      await h.save('cur', 'slot2', 'Mine');
      expect(((await h.ask({ type: 'keepPlan', aboutDishId: 'cur' })) as Of<'keepPlan'>).plan).toEqual({ kind: 'saved', slotId: 'slot2', name: 'Mine' });
      const stored = h.storeState();
      const r = await act(h, auto('cur'));
      if (!r.ok) throw new Error(r.reply.message);
      expect(r.kept).toMatchObject({ kind: 'saved', replaced: null, name: 'Mine', autosaved: false });
      expect(r.kept!.slot?.slotId).toBe('slot2');
      expect(h.storeState()).toBe(stored);
    }
  });

  it('(b) a dish opened from a slot and left untouched is exactly what the slot holds', async () => {
    const h = harness();
    await h.create('cur');
    h.steps('cur', 9);
    await h.save('cur', 'slot4', 'Mine');
    const opened = await ACTIONS.open(h, auto('cur'), 'slot4');
    if (!opened.ok) throw new Error(opened.reply.message);
    // Opening its own unchanged slot needed no keeping either.
    expect(opened.kept?.kind).toBe('saved');
    const stored = h.storeState();
    const r = await ACTIONS.play(h, auto(opened.dishId));
    if (!r.ok) throw new Error(r.reply.message);
    expect(r.kept?.kind).toBe('saved');
    expect(h.storeState()).toBe(stored);
  });

  it('a changed dish is never skipped: a tick, a command, a journal note outside the state hash, its slot overwritten or deleted', async () => {
    const note = (worldId: string) => ({
      version: 1,
      kind: 'observation',
      id: 'observation:keep:1',
      saw: 'films on the stones',
      coincidedWith: 'the lid closing',
      recordedAt: '2026-09-29T10:00:00.000Z',
      dish: { name: 'Mine', second: 0, recipeId: 'FIRST_DISH_V1', seed: 104729 },
      link: null,
      worldId,
    });
    const changes: Record<string, (h: H) => Promise<void>> = {
      tick: (h) => {
        h.steps('cur', 1);
        return Promise.resolve();
      },
      command: async (h) => {
        await h.ask({ type: 'command', dishId: 'cur', commandId: 'c1', payload: { kind: 'deposit', materialId: 'SUGAR', points: [[64.5, 64.5]], radius: 1, dose: 0.1 }, undoable: true });
      },
      'journal note': async (h) => {
        const hash = h.hash('cur');
        const r = (await h.ask({ type: 'journalPut', dishId: 'cur', entry: note(h.world('cur').worldId) })) as Of<'journal'>;
        expect(r.stored).toBe(true);
        expect(h.hash('cur')).toBe(hash); // invisible to the state hash, but part of the save
      },
      'slot overwritten': async (h) => {
        await h.create('intruder', { kind: 'recipe', recipeId: 'FIRST_DISH_V1', seed: 77 });
        await h.save('intruder', 'slot2', 'Mine');
        h.host.handle({ type: 'dispose', dishId: 'intruder' });
      },
      'slot deleted': async (h) => {
        await h.ask({ type: 'deleteSlot', slotId: 'slot2' });
      },
    };
    for (const [what, change] of Object.entries(changes)) {
      const h = harness();
      await h.create('cur');
      h.steps('cur', 5);
      await h.save('cur', 'slot2', 'Mine');
      await change(h);
      const hash = h.hash('cur');
      const plan = ((await h.ask({ type: 'keepPlan', aboutDishId: 'cur' })) as Of<'keepPlan'>).plan;
      expect(plan, what).toEqual({ kind: 'slot', slotId: 'slot2', own: true, name: 'Mine' });
      const r = await ACTIONS.play(h, auto('cur'));
      if (!r.ok) throw new Error(r.reply.message);
      expect(r.kept?.kind, what).toBe('slot');
      expect(r.kept?.slot?.slotId, what).toBe('slot2');
      expect(await h.slotHash('slot2'), what).toBe(hash);
      const text = await gunzipText(h.backend.records[h.backend.slots.slot2!.current]!.data);
      if (what === 'journal note') expect(text).toContain('observation:keep:1');
    }
  });
});

describe('Where a changed dish goes (D-0026 active slot; D-0033)', () => {
  it('its own slot, and the store keeps the previous copy as the predecessor (every action)', async () => {
    for (const [name, act] of Object.entries(ACTIONS)) {
      const h = harness();
      await withSaveInSlot9(h);
      await h.create('cur');
      h.steps('cur', 5);
      await h.save('cur', 'slot3', 'Mine');
      const first = h.hash('cur');
      const firstRecord = h.backend.slots.slot3!.current;
      h.steps('cur', 7);
      const changed = h.hash('cur');
      const r = await act(h, auto('cur'));
      if (!r.ok) throw new Error(r.reply.message);
      expect(r.kept, name).toMatchObject({ kind: 'slot', replaced: null, name: 'Mine', autosaved: true });
      expect(r.kept!.slot?.slotId, name).toBe('slot3');
      expect(await h.slotHash('slot3'), name).toBe(changed);
      expect(h.backend.slots.slot3!.previous, name).toBe(firstRecord);
      expect(await h.recordHash(firstRecord), name).toBe(first);
      expect(Object.keys(h.backend.slots).sort(), name).toEqual([AUTOSAVE_SLOT, 'slot3', 'slot9']);
      expect(await h.slotHash(AUTOSAVE_SLOT), name).toBe(changed);
    }
  });

  it('opening its own slot while changed keeps it in the first empty slot, and opens the slot as it was saved', async () => {
    const h = harness();
    await h.create('cur');
    h.steps('cur', 5);
    await h.save('cur', 'slot1', 'Mine');
    const saved = h.hash('cur');
    h.steps('cur', 8);
    const changed = h.hash('cur');
    const plan = ((await h.ask({ type: 'keepPlan', aboutDishId: 'cur', opening: 'slot1' })) as Of<'keepPlan'>).plan;
    expect(plan).toEqual({ kind: 'slot', slotId: 'slot2', own: false, name: 'Mine' });
    const r = await ACTIONS.open(h, auto('cur'), 'slot1');
    if (!r.ok) throw new Error(r.reply.message);
    expect(r.kept!.slot?.slotId).toBe('slot2');
    expect(await h.slotHash('slot2')).toBe(changed);
    expect(await h.slotHash('slot1')).toBe(saved);
    expect(h.hash(r.dishId)).toBe(saved);
    // The dish opened is bound to slot1: unchanged, it needs no keeping.
    expect(((await h.ask({ type: 'keepPlan', aboutDishId: r.dishId })) as Of<'keepPlan'>).plan).toEqual({ kind: 'saved', slotId: 'slot1', name: 'Mine' });
  });

  it('the save being opened is never offered as the replacement, and choosing it is refused', async () => {
    const h = harness();
    await h.create('filler');
    for (const slotId of NAMED) {
      h.steps('filler', 1);
      await h.save('filler', slotId, `Old ${slotId}`);
    }
    await h.create('cur');
    h.steps('cur', 3);
    const r = await ACTIONS.open(h, auto('cur'), 'slot5');
    if (r.ok) throw new Error('expected a refusal');
    expect(r.reply).toMatchObject({ code: 'slots-full', exclude: 'slot5' });
    const stored = h.storeState();
    const bad = await ACTIONS.open(h, auto('cur', { kind: 'replace', slotId: 'slot5' }), 'slot5');
    if (bad.ok) throw new Error('expected a refusal');
    expect(bad.reply.code).toBe('failed');
    expect(bad.reply.message).toBe('That is the save being opened, so it cannot hold this dish too. Choose another save. Nothing was changed.');
    expect(h.storeState()).toBe(stored);
    // A deliberate replacement of another save, then the save opens.
    const before = h.hash('cur');
    const ok = await ACTIONS.open(h, auto('cur', { kind: 'replace', slotId: 'slot7' }), 'slot5');
    if (!ok.ok) throw new Error(ok.reply.message);
    expect(ok.kept).toMatchObject({ kind: 'slot', replaced: 'Old slot7', autosaved: true });
    expect(await h.slotHash('slot7')).toBe(before);
    expect(h.world(ok.dishId).tick).toBe(5);
  });

  it('after exporting, the action goes ahead with no named slot written (Continue is updated)', async () => {
    const h = harness();
    await h.create('filler');
    for (const slotId of NAMED) {
      h.steps('filler', 1);
      await h.save('filler', slotId, `Old ${slotId}`);
    }
    await h.create('cur');
    h.steps('cur', 3);
    const before = h.hash('cur');
    const named = JSON.stringify(NAMED.map((id) => h.backend.slots[id]));
    const r = await ACTIONS.experiment(h, auto('cur', { kind: 'exported' }));
    if (!r.ok) throw new Error(r.reply.message);
    expect(r.kept).toMatchObject({ kind: 'exported', slot: null, autosaved: true });
    expect(JSON.stringify(NAMED.map((id) => h.backend.slots[id]))).toBe(named);
    expect(await h.slotHash(AUTOSAVE_SLOT)).toBe(before);
  });

  it('a paired experiment card keeps the dish first; refused, it opens no comparison', async () => {
    const h = harness();
    await h.create('filler');
    for (const slotId of NAMED) {
      h.steps('filler', 1);
      await h.save('filler', slotId, `Old ${slotId}`);
    }
    await h.create('cur');
    h.steps('cur', 3);
    const ids = { compareId: 'xp', aDishId: 'xp-A', bDishId: 'xp-B' };
    const refused = await h.ask({ type: 'experimentStart', cardId: 'EXP_A', newDishId: 'xp-dish', compare: ids, keepFrom: auto('cur') });
    expect(refused).toMatchObject({ type: 'keepRefused', code: 'slots-full' });
    expect(h.host.world('xp-A')).toBeNull();
    expect(h.host.world('xp-dish')).toBeNull();
    // The comparison slot is still free: the same card starts once the dish is kept by replacing a save.
    const started = await h.ask({ type: 'experimentStart', cardId: 'EXP_A', newDishId: 'xp-dish', compare: ids, keepFrom: auto('cur', { kind: 'replace', slotId: 'slot2' }) });
    expect(started.type).toBe('experimentStarted');
    expect((started as Of<'experimentStarted'>).kept).toMatchObject({ kind: 'slot', replaced: 'Old slot2' });
    expect((started as Of<'experimentStarted'>).compare?.status).toBe('setup');
  });

  it('a broken import keeps nothing (the file is checked first); an unknown recipe starts nothing and keeps nothing', async () => {
    const h = harness();
    await h.create('cur');
    h.steps('cur', 3);
    const stored = h.storeState();
    const broken = await h.ask({ type: 'importDish', text: 'not a dish', newDishId: 'x', keepFrom: auto('cur') });
    expect(broken).toMatchObject({ type: 'error', request: 'importDish', paused: false });
    const unknown = await h.ask({ type: 'create', dishId: 'y', source: { kind: 'recipe', recipeId: 'NOPE' }, keepFrom: auto('cur') });
    expect(unknown).toMatchObject({ type: 'error', request: 'create', paused: false });
    expect(h.storeState()).toBe(stored);
    expect(h.host.activeDishId).toBe('cur');
  });

  it('a device that cannot save: the plan says so and every action is refused until the dish is exported', async () => {
    const h = harness({ store: false });
    await h.create('cur');
    h.steps('cur', 3);
    expect(((await h.ask({ type: 'keepPlan', aboutDishId: 'cur' })) as Of<'keepPlan'>).plan).toEqual({ kind: 'unavailable', name: 'FIRST_DISH_V1' });
    const r = await ACTIONS.play(h, auto('cur'));
    if (r.ok) throw new Error('expected a refusal');
    expect(r.reply).toMatchObject({ code: 'save-unavailable', message: 'This device cannot save dishes, so the new dish was not started. Export your dish as a file first.' });
    const ok = await ACTIONS.play(h, auto('cur', { kind: 'exported' }));
    expect(ok.ok && ok.kept).toMatchObject({ kind: 'exported', autosaved: false });
  });
});

describe('Continue and automatic checkpoints (D-0033)', () => {
  it('Continue reopens a dish bound to the slot it was saved to, only while that slot holds the same dish', async () => {
    const h = harness();
    await h.create('cur');
    h.steps('cur', 4);
    await h.save('cur', 'slot6', 'Mine');
    await h.ask({ type: 'autosave', dishId: 'cur' });
    expect(h.backend.slots[AUTOSAVE_SLOT]).toMatchObject({ activeSlot: 'slot6', worldId: h.world('cur').worldId });
    // A new session: Continue opens the autosave (no dish open), bound to slot6 again.
    const reopened = await ACTIONS.open(h, null, AUTOSAVE_SLOT);
    if (!reopened.ok) throw new Error(reopened.reply.message);
    expect(((await h.ask({ type: 'keepPlan', aboutDishId: reopened.dishId })) as Of<'keepPlan'>).plan).toEqual({ kind: 'saved', slotId: 'slot6', name: 'Mine' });
    h.steps(reopened.dishId, 3);
    const r = await ACTIONS.play(h, auto(reopened.dishId));
    expect(r.ok && r.kept?.slot?.slotId).toBe('slot6');
    // Once slot6 holds another dish, a dish from Continue is bound to nothing (never written over it).
    const h2 = harness();
    await h2.create('cur');
    h2.steps('cur', 4);
    await h2.save('cur', 'slot6', 'Mine');
    await h2.ask({ type: 'autosave', dishId: 'cur' });
    await h2.create('other', { kind: 'recipe', recipeId: 'FIRST_DISH_V1', seed: 12 });
    await h2.save('other', 'slot6', 'Other');
    expect(h2.backend.slots[AUTOSAVE_SLOT]).toMatchObject({ activeSlot: 'slot6' }); // the autosave still names slot6
    const back = await ACTIONS.open(h2, null, AUTOSAVE_SLOT);
    if (!back.ok) throw new Error(back.reply.message);
    expect(((await h2.ask({ type: 'keepPlan', aboutDishId: back.dishId })) as Of<'keepPlan'>).plan).toEqual({ kind: 'slot', slotId: 'slot1', own: false, name: 'Mine' });
  });

  it('opening Continue writes no Continue first; the dish being left still goes to its slot', async () => {
    const h = harness();
    await h.create('cont');
    h.steps('cont', 2);
    await h.ask({ type: 'autosave', dishId: 'cont' });
    const autosave = JSON.stringify(h.backend.slots[AUTOSAVE_SLOT]);
    const contHash = h.hash('cont');
    await h.create('cur', { kind: 'recipe', recipeId: 'FIRST_DISH_V1', seed: 3 });
    h.steps('cur', 5);
    const before = h.hash('cur');
    const r = await ACTIONS.open(h, auto('cur'), AUTOSAVE_SLOT);
    if (!r.ok) throw new Error(r.reply.message);
    expect(r.kept).toMatchObject({ kind: 'slot', autosaved: false });
    expect(await h.slotHash(r.kept!.slot!.slotId)).toBe(before);
    expect(JSON.stringify(h.backend.slots[AUTOSAVE_SLOT])).toBe(autosave);
    expect(h.hash(r.dishId)).toBe(contHash);
  });

  it('a dish opened from an automatic checkpoint is a branch bound to no slot: kept like any changed dish', async () => {
    const h = harness();
    h.host.handle({ type: 'checkpointRing', enabled: true });
    await h.create('cur');
    h.host.handle({ type: 'setSpeed', dishId: 'cur', speed: 4 });
    for (let k = 0; k < 400 && h.world('cur').tick < 600; k++) h.frame(250);
    h.host.handle({ type: 'setSpeed', dishId: 'cur', speed: 0 });
    let checkpoint: string | null = null;
    for (let k = 0; k < 200 && !checkpoint; k++) {
      const n = h.out.find((m): m is Of<'checkpoint'> => m.type === 'checkpoint' && m.ok);
      checkpoint = n?.slot?.slotId ?? null;
      if (!checkpoint) await new Promise((res) => setTimeout(res, 10));
    }
    if (!checkpoint) throw new Error('no checkpoint written');
    const branch = await ACTIONS.open(h, auto('cur'), checkpoint);
    if (!branch.ok) throw new Error(branch.reply.message);
    expect(branch.kept?.slot?.slotId).toBe('slot1'); // the dish left was kept first
    const at = h.hash(branch.dishId);
    expect(((await h.ask({ type: 'keepPlan', aboutDishId: branch.dishId })) as Of<'keepPlan'>).plan).toMatchObject({ kind: 'slot', slotId: 'slot2', own: false });
    const r = await ACTIONS.play(h, auto(branch.dishId));
    expect(r.ok && r.kept?.slot?.slotId).toBe('slot2');
    expect(await h.slotHash('slot2')).toBe(at);
  });
});

// ---------------------------------------------------------------------------------------------
// Fix round 1 (docs/reports/reviews/g2-close/keep-dish-verify-*.md). Each block fails on the tree the
// verifiers read: a stale Continue rebound to its slot, an untouched recipe start written to a slot, the
// dish Continue holds dropped when nothing is open, Duplicate leaving the original unreachable.

/** A journal note about dish `worldId` (the Notebook's observation record). */
const noteFor = (worldId: string, id = 'observation:keep:fix1') => ({
  version: 1,
  kind: 'observation',
  id,
  saw: 'films on the stones',
  coincidedWith: 'the lid closing',
  recordedAt: '2026-09-29T10:00:00.000Z',
  dish: { name: 'Mine', second: 0, recipeId: 'FIRST_DISH_V1', seed: 104729 },
  link: null,
  worldId,
});

const SUGAR = { kind: 'deposit', materialId: 'SUGAR', points: [[64.5, 64.5]], radius: 1, dose: 0.1 } as const;

async function planOf(h: H, aboutDishId: string | null, opening: string | null = null) {
  return ((await h.ask({ type: 'keepPlan', aboutDishId, opening })) as Of<'keepPlan'>).plan;
}

/** Fill every named slot except `except` with saves of another dish. */
async function fillSlots(h: H, except: readonly string[] = []): Promise<void> {
  await h.create('filler', { kind: 'recipe', recipeId: 'FIRST_DISH_V1', seed: 21 });
  for (const slotId of NAMED.filter((s) => !except.includes(s))) {
    h.steps('filler', 1);
    await h.save('filler', slotId, `Old ${slotId}`);
  }
  h.host.handle({ type: 'dispose', dishId: 'filler' });
}

describe('Fix round 1: a Continue older than the slot it names never replaces that save (saves verifier MAJOR)', () => {
  it('a save written after Continue unbinds it: reopened and replaced, it goes to another slot and the newer save stays', async () => {
    const h = harness();
    await h.create('cur');
    h.steps('cur', 5);
    await h.save('cur', 'slot1', 'Mine');
    h.steps('cur', 5);
    await h.save('cur', 'slot1', 'Mine'); // Save → Slot 1 → Replace …
    await h.ask({ type: 'autosave', dishId: 'cur' }); // … and Continue follows, bound to that record
    expect(h.backend.slots[AUTOSAVE_SLOT]).toMatchObject({ activeSlot: 'slot1', activeRecord: h.backend.slots.slot1!.current });
    // Still paused (same tick): a change, saved to Slot 1 again; this time Continue is not written.
    await h.ask({ type: 'command', dishId: 'cur', commandId: 'c1', payload: SUGAR, undoable: true });
    await h.save('cur', 'slot1', 'Mine');
    const newer = h.backend.slots.slot1!.current;
    const newerHash = await h.slotHash('slot1');
    expect(await h.slotHash(AUTOSAVE_SLOT)).not.toBe(newerHash);
    // A new session: Continue opens the older moment, bound to nothing (the slot was written after it).
    const s2 = harness({ backend: h.backend });
    const reopened = await ACTIONS.open(s2, null, AUTOSAVE_SLOT);
    if (!reopened.ok) throw new Error(reopened.reply.message);
    expect(await planOf(s2, reopened.dishId)).toEqual({ kind: 'slot', slotId: 'slot2', own: false, name: 'Mine' });
    const r = await ACTIONS.play(s2, auto(reopened.dishId));
    if (!r.ok) throw new Error(r.reply.message);
    expect(r.kept?.slot?.slotId).toBe('slot2');
    // The player's newer save is still Slot 1's current record, exactly.
    expect(s2.backend.slots.slot1!.current).toBe(newer);
    expect(await s2.slotHash('slot1')).toBe(newerHash);
  });

  it('a keep binds Continue to the record it wrote: reopened and untouched, that dish is already saved', async () => {
    const h = harness();
    await h.create('cur');
    h.steps('cur', 4);
    const r = await ACTIONS.play(h, auto('cur'));
    expect(r.ok && r.kept?.slot?.slotId).toBe('slot1');
    expect(h.backend.slots[AUTOSAVE_SLOT]).toMatchObject({ activeSlot: 'slot1', activeRecord: h.backend.slots.slot1!.current });
    const s2 = harness({ backend: h.backend });
    const reopened = await ACTIONS.open(s2, null, AUTOSAVE_SLOT);
    if (!reopened.ok) throw new Error(reopened.reply.message);
    expect(await planOf(s2, reopened.dishId)).toEqual({ kind: 'saved', slotId: 'slot1', name: 'FIRST_DISH_V1' });
  });

  it('an autosave from an older build (no recorded record) binds nothing by its recorded slot', async () => {
    const h = harness();
    await h.create('cur');
    h.steps('cur', 4);
    await h.save('cur', 'slot3', 'Mine');
    // Fix round 2: Continue is a later moment than Slot 3 here. (When a slot holds exactly Continue's file
    // it is bound to that slot by content, older index or not: the next test.)
    h.steps('cur', 2);
    await h.ask({ type: 'autosave', dishId: 'cur' });
    const { activeRecord: _gone, ...older } = h.backend.slots[AUTOSAVE_SLOT]!;
    expect(older.activeSlot).toBe('slot3');
    h.backend.slots[AUTOSAVE_SLOT] = older;
    const s2 = harness({ backend: h.backend });
    const reopened = await ACTIONS.open(s2, null, AUTOSAVE_SLOT);
    if (!reopened.ok) throw new Error(reopened.reply.message);
    expect(await planOf(s2, reopened.dishId)).toEqual({ kind: 'slot', slotId: 'slot1', own: false, name: 'Mine' });
  });

  it('fix round 2: a Continue that is exactly a named save is bound to it by content (older index too): untouched it is saved, changed it goes there', async () => {
    const h = harness();
    await h.create('cur');
    h.steps('cur', 4);
    await h.save('cur', 'slot3', 'Mine');
    await h.ask({ type: 'autosave', dishId: 'cur' });
    const record3 = h.backend.slots.slot3!.current;
    const { activeRecord: _gone, activeSlot: _slot, ...older } = h.backend.slots[AUTOSAVE_SLOT]!;
    h.backend.slots[AUTOSAVE_SLOT] = older; // records no binding at all
    const s2 = harness({ backend: h.backend });
    const reopened = await ACTIONS.open(s2, null, AUTOSAVE_SLOT);
    if (!reopened.ok) throw new Error(reopened.reply.message);
    expect(await planOf(s2, reopened.dishId)).toEqual({ kind: 'saved', slotId: 'slot3', name: 'Mine' });
    const stored = s2.storeState();
    const kept = await ACTIONS.play(s2, auto(reopened.dishId));
    expect(kept.ok && kept.kept?.kind).toBe('saved');
    expect(s2.storeState()).toBe(stored); // not a second copy in Slot 1
    // Changed, it is kept to that slot, whose previous record (the same moment as Continue) is kept.
    const s3 = harness({ backend: h.backend });
    const again = await ACTIONS.open(s3, null, AUTOSAVE_SLOT);
    if (!again.ok) throw new Error(again.reply.message);
    s3.steps(again.dishId, 3);
    const changed = s3.hash(again.dishId);
    const r = await ACTIONS.play(s3, auto(again.dishId));
    expect(r.ok && r.kept?.slot?.slotId).toBe('slot3');
    expect(await s3.slotHash('slot3')).toBe(changed);
    expect(s3.backend.slots.slot3!.previous).toBe(record3);
  });

  it('opening Continue while the open dish owns the slot Continue names: the dish goes to its own slot; no slot is "the save being opened" (saves verifier P7)', async () => {
    const h = harness();
    await fillSlots(h, ['slot4']);
    await h.create('cur');
    h.steps('cur', 3);
    await h.save('cur', 'slot4', 'Mine');
    await h.ask({ type: 'autosave', dishId: 'cur' }); // Continue: this moment, bound to Slot 4
    h.steps('cur', 5); // changed since
    const changed = h.hash('cur');
    expect(await planOf(h, 'cur', AUTOSAVE_SLOT)).toEqual({ kind: 'slot', slotId: 'slot4', own: true, name: 'Mine' });
    const r = await ACTIONS.open(h, auto('cur'), AUTOSAVE_SLOT);
    if (!r.ok) throw new Error(`refused: ${r.reply.message} (exclude ${String(r.reply.exclude)})`);
    expect(r.kept).toMatchObject({ kind: 'slot', autosaved: false, replaced: null });
    expect(r.kept!.slot?.slotId).toBe('slot4');
    expect(await h.slotHash('slot4')).toBe(changed);
    // The older moment Continue held opens bound to nothing: Slot 4 now holds the newer one.
    expect(await planOf(h, r.dishId)).toEqual({ kind: 'full', name: 'Mine' });
  });
});

describe('Fix round 1: an untouched start rebuilds exactly and is not written (player verifier MAJOR 1; saves MINOR 4)', () => {
  const STARTS: Record<string, { readonly make: (h: H) => Promise<void>; readonly name: string; readonly seed: number }> = {
    'Play Garden': { make: (h) => h.create('cur', GARDEN, 'Little Living Garden'), name: 'Little Living Garden', seed: 104729 },
    'New Dish with its own seed and choices': {
      make: (h) =>
        h.create('cur', { kind: 'recipe', recipeId: 'FIRST_DISH_V1', seed: 5, overrides: { mutationPreset: 'accelerated', founderMode: 'varied', empty: false } }, 'My dish'),
      name: 'My dish',
      seed: 5,
    },
    'New Dish, Empty': {
      make: (h) => h.create('cur', { kind: 'recipe', recipeId: 'FIRST_DISH_V1', seed: 8, overrides: { mutationPreset: 'standard', founderMode: 'identical', empty: true } }, 'Empty dish'),
      name: 'Empty dish',
      seed: 8,
    },
    'an experiment card': {
      make: async (h) => {
        const r = await h.ask({ type: 'experimentStart', cardId: 'EXP_103', newDishId: 'cur', compare: null });
        if (r.type !== 'experimentStarted') throw new Error(JSON.stringify(r).slice(0, 200));
      },
      name: '',
      seed: REG.experiments.EXP_103!.seed,
    },
  };

  for (const [what, start] of Object.entries(STARTS)) {
    it(`${what} at 0:00: the plan says so and no action writes anything`, async () => {
      for (const [action, act] of Object.entries(ACTIONS)) {
        const h = harness();
        await withSaveInSlot9(h);
        await start.make(h);
        const plan = await planOf(h, 'cur');
        expect(plan, action).toMatchObject({ kind: 'unchanged', seed: start.seed });
        if (start.name) expect(plan, action).toMatchObject({ name: start.name });
        const stored = h.storeState();
        const r = await act(h, auto('cur'));
        if (!r.ok) throw new Error(r.reply.message);
        expect(r.kept?.kind, action).toBe('unchanged');
        expect(h.storeState(), action).toBe(stored);
      }
    });
  }

  it('a change at 0:00 is never skipped: a tick, a command, a journal note, an evolution setting', async () => {
    const changes: Record<string, (h: H) => Promise<void>> = {
      tick: (h) => {
        h.steps('cur', 1);
        return Promise.resolve();
      },
      command: async (h) => {
        await h.ask({ type: 'command', dishId: 'cur', commandId: 'c1', payload: SUGAR, undoable: true });
      },
      'journal note': async (h) => {
        const r = (await h.ask({ type: 'journalPut', dishId: 'cur', entry: noteFor(h.world('cur').worldId) })) as Of<'journal'>;
        expect(r.stored).toBe(true);
      },
      'evolution setting': async (h) => {
        await h.ask({ type: 'command', dishId: 'cur', commandId: 'c2', payload: { kind: 'setMutationPreset', preset: 'accelerated' }, undoable: true });
      },
    };
    for (const [what, change] of Object.entries(changes)) {
      const h = harness();
      await h.create('cur');
      await change(h);
      expect(await planOf(h, 'cur'), what).toEqual({ kind: 'slot', slotId: 'slot1', own: false, name: 'FIRST_DISH_V1' });
      const hash = h.hash('cur');
      const r = await ACTIONS.play(h, auto('cur'));
      if (!r.ok) throw new Error(r.reply.message);
      expect(r.kept?.slot?.slotId, what).toBe('slot1');
      expect(await h.slotHash('slot1'), what).toBe(hash);
      if (what === 'journal note') expect(await gunzipText(h.backend.records[h.backend.slots.slot1!.current]!.data)).toContain('observation:keep:fix1');
    }
  });

  it('fix round 2 (re-verifier MINOR 6): an older save that did not record its choices is compared with the authored start, never assumed', async () => {
    // Exactly the authored Garden at 0:00, without `overrides` in its provenance: it rebuilds exactly.
    const h = harness();
    await h.create('cur', GARDEN, 'Old garden');
    delete (h.world('cur').content.provenance as { overrides?: unknown }).overrides;
    expect(await planOf(h, 'cur')).toEqual({ kind: 'unchanged', name: 'Old garden', seed: 104729 });
    // Another seed whose choices were not recorded: not the authored start, so it is kept.
    const g = harness();
    await g.create('cur', { kind: 'recipe', recipeId: 'FIRST_DISH_V1', seed: 7 }, 'Old garden');
    delete (g.world('cur').content.provenance as { overrides?: unknown }).overrides;
    expect(await planOf(g, 'cur')).toEqual({ kind: 'slot', slotId: 'slot1', own: false, name: 'Old garden' });
    const r = await ACTIONS.play(g, auto('cur'));
    expect(r.ok && r.kept?.slot?.slotId).toBe('slot1');
  });

  it('a What if? dish with a journal note made at its start is kept with the note (saves verifier MINOR 3)', async () => {
    const h = harness();
    const s = await h.ask({ type: 'whatIfStart', newDishId: 'v', fromDishId: null, pick: { kind: 'variant', variantId: 'R-G2' }, keep: { kind: 'auto' } });
    expect(s.type).toBe('whatIfStarted');
    const hash = h.hash('v');
    const put = (await h.ask({ type: 'journalPut', dishId: 'v', entry: noteFor(h.world('v').worldId) })) as Of<'journal'>;
    expect(put.stored).toBe(true);
    expect(h.hash('v')).toBe(hash); // outside the state hash, but a change all the same
    expect(await planOf(h, 'v')).toEqual({ kind: 'slot', slotId: 'slot1', own: false, name: 'A bigger meal' });
    const r = await ACTIONS.play(h, auto('v'));
    if (!r.ok) throw new Error(r.reply.message);
    expect(r.kept?.slot?.slotId).toBe('slot1');
    expect(await gunzipText(h.backend.records[h.backend.slots.slot1!.current]!.data)).toContain('observation:keep:fix1');
  });
});

describe('Fix round 1: with no dish open, the dish Continue holds is kept first (player verifier MAJOR 3)', () => {
  const none = (keep: WhatIfKeep = { kind: 'auto' }): KeepFrom => ({ dishId: null, keep });

  /** Session 1 leaves a changed dish only in Continue (the 30 s autosave); returns a new session on that device. */
  async function relaunched(prepare?: (h: H) => Promise<void>): Promise<{ readonly s: H; readonly hash: string }> {
    const h = harness();
    await withSaveInSlot9(h);
    if (prepare) await prepare(h);
    await h.create('cur');
    h.steps('cur', 12);
    await h.ask({ type: 'autosave', dishId: 'cur' });
    return { s: harness({ backend: h.backend }), hash: h.hash('cur') };
  }

  for (const [name, act] of Object.entries(ACTIONS)) {
    it(`${name}: Continue's changed dish goes to the first empty slot first; Continue is rebound to that record (fix round 2)`, async () => {
      const { s, hash } = await relaunched();
      const continueBefore = s.backend.slots[AUTOSAVE_SLOT]!;
      expect(await planOf(s, null)).toEqual({ kind: 'slot', slotId: 'slot1', own: false, name: 'FIRST_DISH_V1', fromContinue: true });
      const r = await act(s, none());
      if (!r.ok) throw new Error(r.reply.message);
      expect(r.kept).toMatchObject({ kind: 'slot', replaced: null, name: 'FIRST_DISH_V1', autosaved: true, fromContinue: true });
      expect(r.kept!.slot?.slotId).toBe('slot1');
      expect(await s.slotHash('slot1')).toBe(hash);
      // Fix round 2 (re-verifier MAJOR): Continue holds the same dish, now the very file of Slot 1 and
      // bound to its record, so the next launch finds it saved; the Continue it replaced is its predecessor.
      const slot1 = s.backend.slots.slot1!;
      expect(s.backend.slots[AUTOSAVE_SLOT]).toMatchObject({ checksum: slot1.checksum, name: slot1.name, activeSlot: 'slot1', activeRecord: slot1.current, previous: continueBefore.current });
      expect(await s.slotHash(AUTOSAVE_SLOT)).toBe(hash);
    });
  }

  it('opening Continue itself keeps nothing; an empty Continue keeps nothing', async () => {
    const { s } = await relaunched();
    const stored = s.storeState();
    expect(await planOf(s, null, AUTOSAVE_SLOT)).toEqual({ kind: 'none' });
    const r = await ACTIONS.open(s, none(), AUTOSAVE_SLOT);
    expect(r.ok && r.kept).toBeNull();
    expect(s.storeState()).toBe(stored);
    const fresh = harness();
    expect(await planOf(fresh, null)).toEqual({ kind: 'none' });
    const p = await ACTIONS.play(fresh, none());
    expect(p.ok && p.kept).toBeNull();
    expect(fresh.storeState()).toBe(JSON.stringify({ slots: {}, records: [] }));
  });

  it('already saved exactly in its slot, or an untouched start: nothing is written', async () => {
    const h = harness();
    await h.create('cur');
    h.steps('cur', 6);
    await h.save('cur', 'slot3', 'Mine');
    await h.ask({ type: 'autosave', dishId: 'cur' });
    const s = harness({ backend: h.backend });
    expect(await planOf(s, null)).toEqual({ kind: 'saved', slotId: 'slot3', name: 'Mine', fromContinue: true });
    const stored = s.storeState();
    const r = await ACTIONS.newDish(s, none());
    if (!r.ok) throw new Error(r.reply.message);
    expect(r.kept).toMatchObject({ kind: 'saved', name: 'Mine', fromContinue: true, autosaved: false });
    expect(s.storeState()).toBe(stored);

    const u = harness();
    await u.create('cur', GARDEN, 'Little Living Garden');
    await u.ask({ type: 'autosave', dishId: 'cur' });
    const s2 = harness({ backend: u.backend });
    expect(await planOf(s2, null)).toEqual({ kind: 'unchanged', name: 'Little Living Garden', seed: 104729, fromContinue: true });
    const stored2 = s2.storeState();
    const r2 = await ACTIONS.experiment(s2, none());
    expect(r2.ok && r2.kept?.kind).toBe('unchanged');
    expect(s2.storeState()).toBe(stored2);
  });

  it('bound to its slot and changed since: it goes to that slot, whose previous record is kept', async () => {
    const h = harness();
    await h.create('cur');
    h.steps('cur', 3);
    await h.save('cur', 'slot5', 'Mine');
    const first = h.backend.slots.slot5!.current;
    h.steps('cur', 4);
    await h.ask({ type: 'autosave', dishId: 'cur' }); // Continue: later than Slot 5, bound to it
    const later = h.hash('cur');
    const s = harness({ backend: h.backend });
    expect(await planOf(s, null)).toEqual({ kind: 'slot', slotId: 'slot5', own: true, name: 'Mine', fromContinue: true });
    const r = await ACTIONS.play(s, none());
    expect(r.ok && r.kept?.slot?.slotId).toBe('slot5');
    expect(await s.slotHash('slot5')).toBe(later);
    expect(s.backend.slots.slot5!.previous).toBe(first);
  });

  it('all ten used: refused with its name, nothing written; exported (the stored file) or a chosen replacement then go ahead', async () => {
    const { s, hash } = await relaunched((h) => fillSlots(h, ['slot9']));
    const stored = s.storeState();
    expect(await planOf(s, null)).toEqual({ kind: 'full', name: 'FIRST_DISH_V1', fromContinue: true });
    const refused = await ACTIONS.play(s, none());
    if (refused.ok) throw new Error('expected a refusal');
    expect(refused.reply).toMatchObject({ code: 'slots-full', name: 'FIRST_DISH_V1', fromContinue: true, exclude: null });
    expect(s.storeState()).toBe(stored);
    // "Export it as a file": the file Continue holds, exactly.
    const exported = (await s.ask({ type: 'exportSave', slotId: AUTOSAVE_SLOT })) as Of<'exported'>;
    expect(exported.type).toBe('exported');
    expect(exported.filename).toBe('first-dish-v1.pixelmeba');
    expect(stateHash((await loadSaveFile(exported.text)).world)).toBe(hash);
    const named = JSON.stringify(NAMED.map((id) => s.backend.slots[id]));
    const continueBefore = JSON.stringify(s.backend.slots[AUTOSAVE_SLOT]);
    const ex = await ACTIONS.play(s, none({ kind: 'exported' }));
    expect(ex.ok && ex.kept).toMatchObject({ kind: 'exported', slot: null, fromContinue: true, autosaved: false });
    expect(JSON.stringify(NAMED.map((id) => s.backend.slots[id]))).toBe(named);
    // Fix round 2: no slot was written, so Continue is left exactly as it was (it is rewritten only to
    // bind it to a slot its keep wrote).
    expect(JSON.stringify(s.backend.slots[AUTOSAVE_SLOT])).toBe(continueBefore);
    // (Continue now follows nothing new until the new dish autosaves; the old Continue is in the file.)
    const { s: s2, hash: hash2 } = await relaunched((h) => fillSlots(h, ['slot9']));
    const rep = await ACTIONS.import(s2, none({ kind: 'replace', slotId: 'slot2' }));
    expect(rep.ok && rep.kept).toMatchObject({ kind: 'slot', replaced: 'Old slot2', fromContinue: true });
    expect(await s2.slotHash('slot2')).toBe(hash2);
  });

  it('a failed write refuses the action and changes nothing; the same action then goes ahead', async () => {
    const { s, hash } = await relaunched();
    const stored = s.storeState();
    s.backend.failNextCommit = true;
    const r = await ACTIONS.open(s, none());
    if (r.ok) throw new Error('expected a refusal');
    expect(r.reply).toMatchObject({ code: 'save-failed', fromContinue: true });
    expect(r.reply.message).toBe('"FIRST_DISH_V1" could not be saved, so the saved dish was not opened. Your saves are unchanged. (simulated write failure)');
    expect(s.storeState()).toBe(stored);
    expect(s.host.activeDishId).toBeNull();
    const again = await ACTIONS.open(s, none());
    expect(again.ok).toBe(true);
    expect(await s.slotHash('slot1')).toBe(hash);
  });

  it('What if? from Play with no dish open keeps it too, and its sheet says so', async () => {
    const { s, hash } = await relaunched();
    const a = (await s.ask({ type: 'whatIf', sourceId: 'FIRST_DISH_V1', aboutDishId: null })) as Of<'whatIf'>;
    expect(a.answer.plan).toEqual({ kind: 'slot', slotId: 'slot1', own: false, name: 'FIRST_DISH_V1', fromContinue: true });
    const started = (await s.ask({ type: 'whatIfStart', newDishId: 'v', fromDishId: null, pick: { kind: 'variant', variantId: 'R-G1' }, keep: { kind: 'auto' } })) as Of<'whatIfStarted'>;
    expect(started.type).toBe('whatIfStarted');
    // Fix round 2: Continue is rebound to the record written (autosaved), as for every other action.
    expect(started.kept).toMatchObject({ kind: 'slot', fromContinue: true, autosaved: true });
    expect(await s.slotHash('slot1')).toBe(hash);
    expect(s.backend.slots[AUTOSAVE_SLOT]).toMatchObject({ activeSlot: 'slot1', activeRecord: s.backend.slots.slot1!.current });
  });
});

describe('Fix round 1: Duplicate keeps the original first (player verifier MINOR 9; builder PD 10)', () => {
  async function duplicate(h: H, keepFrom: KeepFrom): Promise<Of<'ready'> | Of<'keepRefused'>> {
    const r = await h.ask({ type: 'duplicate', dishId: 'cur', newDishId: 'copy', keepFrom });
    if (r.type !== 'ready' && r.type !== 'keepRefused') throw new Error(JSON.stringify(r).slice(0, 300));
    return r;
  }

  it('a changed dish is kept (first empty slot and Continue), then the copy of that same moment is made', async () => {
    const h = harness();
    await h.create('cur');
    h.steps('cur', 7);
    const hash = h.hash('cur');
    const r = await duplicate(h, auto('cur'));
    if (r.type !== 'ready') throw new Error(r.message);
    expect(r.kept).toMatchObject({ kind: 'slot', replaced: null, autosaved: true, name: 'FIRST_DISH_V1' });
    expect(r.kept!.slot?.slotId).toBe('slot1');
    expect(await h.slotHash('slot1')).toBe(hash);
    expect(r.info.name).toBe('FIRST_DISH_V1 (copy)');
    expect(h.hash('copy')).toBe(hash); // the same world (world id and name are not hashed)
    expect(h.world('copy').worldId).not.toBe(h.world('cur').worldId);
  });

  it('already saved exactly, or untouched: nothing written; all ten used or a failed write: no copy, nothing written', async () => {
    const saved = harness();
    await saved.create('cur');
    saved.steps('cur', 2);
    await saved.save('cur', 'slot2', 'Mine');
    const stored = saved.storeState();
    const a = await duplicate(saved, auto('cur'));
    expect(a.type === 'ready' && a.kept?.kind).toBe('saved');
    expect(saved.storeState()).toBe(stored);

    const untouched = harness();
    await untouched.create('cur');
    const b = await duplicate(untouched, auto('cur'));
    expect(b.type === 'ready' && b.kept?.kind).toBe('unchanged');
    expect(untouched.storeState()).toBe(JSON.stringify({ slots: {}, records: [] }));

    const full = harness();
    await fillSlots(full);
    await full.create('cur');
    full.steps('cur', 2);
    const fullStored = full.storeState();
    const c = await duplicate(full, auto('cur'));
    expect(c).toMatchObject({ type: 'keepRefused', code: 'slots-full', name: 'FIRST_DISH_V1' });
    expect(full.host.world('copy')).toBeNull();
    expect(full.storeState()).toBe(fullStored);

    const failing = harness();
    await failing.create('cur');
    failing.steps('cur', 2);
    failing.backend.failNextCommit = true;
    const d = await duplicate(failing, auto('cur'));
    expect(d).toMatchObject({ type: 'keepRefused', code: 'save-failed' });
    expect((d as Of<'keepRefused'>).message).toBe('"FIRST_DISH_V1" could not be saved, so the copy was not made. Your saves are unchanged. (simulated write failure)');
    expect(failing.host.world('copy')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Fix round 2 (docs/reports/reviews/g2-close/keep-dish-reverify1.md, MAJOR): after every relaunch the dish
// Continue holds was kept again, into a new slot each time, because the keep neither rewrote nor rebound
// Continue. Each launch is a new DishHost on the same device (backend). Between launches the app did not
// autosave the dish the action opened (left unrun, the app closed at once), so Continue still holds the
// dish that was kept: the worst case for the worker alone.

/** Rewrite a current save as schema 1, as an older build wrote it (as in tests/persistence/migration.test.ts). */
async function asSchema1(text: string): Promise<{ readonly text: string; readonly checksum: string }> {
  const file = JSON.parse(text) as { schemaVersion: number; state: WorldState; checksum: string };
  const columns = { ...file.state.entities.columns };
  for (let v = 2; v <= SCHEMA_VERSION; v++) for (const name of COLUMNS_ADDED_IN[v] ?? []) delete columns[name];
  const state = { ...file.state, schemaVersion: 1, entities: { ...file.state.entities, columns } };
  const checksum = `sha256:${await sha256Hex(canonicalJson(state))}`;
  return { text: JSON.stringify({ ...file, schemaVersion: 1, state, checksum }), checksum };
}

/** Every autosave write fails from now on (the named slots still write); returns the undo. */
function failContinueWrites(b: MemoryBackend): () => void {
  const commit = b.commit.bind(b);
  b.commit = (ops) => (ops.putSlots.some((x) => x.slotId === AUTOSAVE_SLOT) ? Promise.reject(new Error('simulated autosave failure')) : commit(ops));
  return () => {
    b.commit = commit;
  };
}

describe('Fix round 2: the dish Continue holds is kept once, never again on later launches (re-verifier MAJOR)', () => {
  const none = (keep: WhatIfKeep = { kind: 'auto' }): KeepFrom => ({ dishId: null, keep });
  /** A new session on the same device. */
  const launch = (h: H) => harness({ backend: h.backend });
  const usedSlots = (h: H) => NAMED.filter((id) => h.backend.slots[id]);

  it('only Continue held it: each action keeps it to Slot 1 once, and three more launches plan "saved" and write nothing (probe Q2)', async () => {
    for (const [name, act] of Object.entries(ACTIONS)) {
      const h = harness();
      await withSaveInSlot9(h);
      await h.create('x');
      h.steps('x', 12);
      await h.ask({ type: 'autosave', dishId: 'x' });
      const hash = h.hash('x');
      const first = await act(launch(h), none());
      if (!first.ok) throw new Error(first.reply.message);
      expect(first.kept, name).toMatchObject({ kind: 'slot', fromContinue: true });
      expect(first.kept!.slot?.slotId, name).toBe('slot1');
      for (let k = 3; k <= 5; k++) {
        const s = launch(h);
        const stored = s.storeState();
        expect(await planOf(s, null), `${name}, launch ${k}`).toEqual({ kind: 'saved', slotId: 'slot1', name: 'FIRST_DISH_V1', fromContinue: true });
        const r = await act(s, none());
        if (!r.ok) throw new Error(r.reply.message);
        expect(r.kept, `${name}, launch ${k}`).toMatchObject({ kind: 'saved', fromContinue: true, autosaved: false });
        expect(s.storeState(), `${name}, launch ${k}`).toBe(stored);
      }
      expect(usedSlots(h), name).toEqual(['slot1', 'slot9']);
      expect(await h.slotHash('slot1'), name).toBe(hash);
    }
  });

  it('bound to its slot and changed since: kept to that slot once (predecessor kept); the next launch writes nothing (probe Q2b)', async () => {
    const h = harness();
    await h.create('x');
    h.steps('x', 10);
    await h.save('x', 'slot5', 'Mine');
    const first5 = h.backend.slots.slot5!.current;
    h.steps('x', 20);
    await h.ask({ type: 'autosave', dishId: 'x' }); // Continue: later than Slot 5, bound to it
    const later = h.hash('x');
    const first = await ACTIONS.play(launch(h), none());
    expect(first.ok && first.kept?.slot?.slotId).toBe('slot5');
    expect(h.backend.slots.slot5!.previous).toBe(first5);
    const s = launch(h);
    const stored = s.storeState();
    expect(await planOf(s, null)).toEqual({ kind: 'saved', slotId: 'slot5', name: 'Mine', fromContinue: true });
    const r = await ACTIONS.newDish(s, none());
    expect(r.ok && r.kept?.kind).toBe('saved');
    expect(s.storeState()).toBe(stored);
    expect(usedSlots(h)).toEqual(['slot5']);
    expect(await h.slotHash('slot5')).toBe(later);
  });

  it('opening its own slot on two launches: the later Continue is kept to the next empty slot once, and the slot opens as saved both times (probe R2)', async () => {
    const h = harness();
    await h.create('x');
    h.steps('x', 10);
    await h.save('x', 'slot1', 'Mine');
    const saved = h.hash('x');
    const record1 = h.backend.slots.slot1!.current;
    h.steps('x', 70);
    await h.ask({ type: 'autosave', dishId: 'x' }); // Continue: 0:08, bound to Slot 1 (0:01)
    const later = h.hash('x');
    const s2 = launch(h);
    const first = await ACTIONS.open(s2, none(), 'slot1');
    if (!first.ok) throw new Error(first.reply.message);
    expect(first.kept).toMatchObject({ kind: 'slot', fromContinue: true });
    expect(first.kept!.slot?.slotId).toBe('slot2'); // never into the save being opened
    expect(s2.hash(first.dishId)).toBe(saved);
    for (let k = 3; k <= 4; k++) {
      const s = launch(h);
      const stored = s.storeState();
      expect(await planOf(s, null, 'slot1'), `launch ${k}`).toEqual({ kind: 'saved', slotId: 'slot2', name: 'Mine', fromContinue: true });
      const r = await ACTIONS.open(s, none(), 'slot1');
      if (!r.ok) throw new Error(r.reply.message);
      expect(r.kept?.kind, `launch ${k}`).toBe('saved');
      expect(s.hash(r.dishId)).toBe(saved);
      expect(s.storeState(), `launch ${k}`).toBe(stored);
    }
    expect(usedSlots(h)).toEqual(['slot1', 'slot2']);
    expect(h.backend.slots.slot1!.current).toBe(record1);
    expect(await h.slotHash('slot2')).toBe(later);
  });

  it('written by an older build (migrated when read): kept once; Continue then holds the migrated file bound to that slot', async () => {
    // The stored older file never equals the migrated copy, so only rebinding Continue to the record the
    // keep wrote (the same file) lets the next launch see that it is saved.
    const h = harness();
    await h.create('x');
    h.steps('x', 12);
    const exported = (await h.ask({ type: 'exportDish', dishId: 'x', strip: false })) as Of<'exported'>;
    const old = await asSchema1(exported.text);
    await h.store!.save({ slotId: AUTOSAVE_SLOT, text: old.text, checksum: old.checksum, name: 'FIRST_DISH_V1', tick: 12, savedAt: '2026-09-20T00:00:00.000Z', recipeId: 'FIRST_DISH_V1' });
    const first = await ACTIONS.play(launch(h), none());
    if (!first.ok) throw new Error(first.reply.message);
    expect(first.kept).toMatchObject({ kind: 'slot', fromContinue: true });
    expect(first.kept!.slot?.slotId).toBe('slot1');
    expect(h.backend.slots.slot1!.checksum).not.toBe(old.checksum); // migrated by copy
    for (let k = 3; k <= 4; k++) {
      const s = launch(h);
      const stored = s.storeState();
      expect(await planOf(s, null), `launch ${k}`).toEqual({ kind: 'saved', slotId: 'slot1', name: 'FIRST_DISH_V1', fromContinue: true });
      const r = await ACTIONS.experiment(s, none());
      expect(r.ok && r.kept?.kind, `launch ${k}`).toBe('saved');
      expect(s.storeState(), `launch ${k}`).toBe(stored);
    }
    expect(usedSlots(h)).toEqual(['slot1']);
    expect(first.kept).toMatchObject({ autosaved: true });
    expect(h.backend.slots[AUTOSAVE_SLOT]).toMatchObject({ checksum: h.backend.slots.slot1!.checksum, activeSlot: 'slot1', activeRecord: h.backend.slots.slot1!.current });
  });

  it('if rebinding Continue fails, the keep stands, and later launches still find it saved: its slot holds exactly the same file', async () => {
    const h = harness();
    await h.create('x');
    h.steps('x', 12);
    await h.ask({ type: 'autosave', dishId: 'x' });
    const continueBefore = JSON.stringify(h.backend.slots[AUTOSAVE_SLOT]);
    const restore = failContinueWrites(h.backend);
    const first = await ACTIONS.play(launch(h), none());
    restore();
    if (!first.ok) throw new Error(first.reply.message);
    expect(first.kept).toMatchObject({ kind: 'slot', fromContinue: true, autosaved: false });
    expect(first.kept!.slot?.slotId).toBe('slot1');
    expect(JSON.stringify(h.backend.slots[AUTOSAVE_SLOT])).toBe(continueBefore); // bound to nothing
    const s = launch(h);
    const stored = s.storeState();
    expect(await planOf(s, null)).toEqual({ kind: 'saved', slotId: 'slot1', name: 'FIRST_DISH_V1', fromContinue: true });
    const r = await ACTIONS.import(s, none());
    expect(r.ok && r.kept?.kind).toBe('saved');
    expect(s.storeState()).toBe(stored);
    // Opened from Continue it is bound to that slot as well: untouched it is saved; changed it goes there.
    const s2 = launch(h);
    const opened = await ACTIONS.open(s2, null, AUTOSAVE_SLOT);
    if (!opened.ok) throw new Error(opened.reply.message);
    expect(await planOf(s2, opened.dishId)).toEqual({ kind: 'saved', slotId: 'slot1', name: 'FIRST_DISH_V1' });
    s2.steps(opened.dishId, 3);
    expect(await planOf(s2, opened.dishId)).toEqual({ kind: 'slot', slotId: 'slot1', own: true, name: 'FIRST_DISH_V1' });
    expect(usedSlots(h)).toEqual(['slot1']);
  });

  it('a changed dish is never skipped: the same state saved under another name, or an earlier moment, is not "saved"', async () => {
    const h = harness();
    await h.create('x');
    h.steps('x', 6);
    await h.save('x', 'slot3', 'Other name');
    await h.save('x', 'slot4', 'Mine');
    await h.ask({ type: 'autosave', dishId: 'x' }); // Continue "Mine": exactly Slot 4 …
    await h.ask({ type: 'deleteSlot', slotId: 'slot4' }); // … which is then deleted
    const hash = h.hash('x');
    expect(h.backend.slots.slot3!.checksum).toBe(h.backend.slots[AUTOSAVE_SLOT]!.checksum);
    const s = launch(h);
    expect(await planOf(s, null)).toEqual({ kind: 'slot', slotId: 'slot1', own: false, name: 'Mine', fromContinue: true });
    const r = await ACTIONS.play(s, none());
    expect(r.ok && r.kept?.slot?.slotId).toBe('slot1');
    expect(await s.slotHash('slot1')).toBe(hash);
    // One tick later than the save in its own slot: not "saved"; the later Continue goes to that slot.
    const e = harness();
    await e.create('x');
    e.steps('x', 3);
    await e.save('x', 'slot2', 'Mine');
    e.steps('x', 1);
    await e.ask({ type: 'autosave', dishId: 'x' });
    expect(await planOf(launch(e), null)).toEqual({ kind: 'slot', slotId: 'slot2', own: true, name: 'Mine', fromContinue: true });
  });

  it('a Continue read from its predecessor (the latest record damaged) is bound to nothing: the newer save in the slot it named is never replaced', async () => {
    const h = harness();
    await h.create('x');
    h.steps('x', 5);
    await h.ask({ type: 'autosave', dishId: 'x' }); // Continue C1 (bound to nothing)
    h.steps('x', 5);
    await h.save('x', 'slot3', 'Mine');
    await h.ask({ type: 'autosave', dishId: 'x' }); // Continue C2: exactly Slot 3, bound to it; C1 kept as its predecessor
    const newer = h.backend.slots.slot3!.current;
    const newerHash = await h.slotHash('slot3');
    const c2 = h.backend.slots[AUTOSAVE_SLOT]!.current;
    h.backend.records[c2] = { ...h.backend.records[c2]!, data: new Uint8Array([1, 2, 3]) };
    const s = launch(h);
    const opened = await ACTIONS.open(s, null, AUTOSAVE_SLOT);
    if (!opened.ok) throw new Error(opened.reply.message);
    expect(opened.reply).toMatchObject({ type: 'loaded', usedPredecessor: true });
    expect(await planOf(s, opened.dishId)).toEqual({ kind: 'slot', slotId: 'slot1', own: false, name: 'FIRST_DISH_V1' });
    const r = await ACTIONS.play(s, auto(opened.dishId));
    expect(r.ok && r.kept?.slot?.slotId).toBe('slot1');
    expect(s.backend.slots.slot3!.current).toBe(newer);
    expect(await s.slotHash('slot3')).toBe(newerHash);
  });
});
