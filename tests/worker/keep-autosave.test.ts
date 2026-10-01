/**
 * D-0033 fix round 3, carry-over 1 (lead ruling, D-0033 "Open"): a change made while the dish is paused at
 * an unchanged tick (Add Life, a Lab stroke, a rename, a pin, a journal note, an evolution-setting change
 * — any accepted command or recorded note) reaches Continue at the next autosave event (the 30 s interval,
 * going to the background, leaving the page), not only at the next manual save, keep or tick.
 *
 * The test is the one D-0033 chose for keeping, never a dirty flag: at every autosave event the worker
 * builds the dish's file and writes Continue unless Continue already holds exactly that file (host
 * `autosave`, store `holdsSave`: the same checksum over the canonical serialized world, the same name, the
 * same binding and index copies). The UI no longer skips an event because the tick did not move.
 *
 * The app's own state module runs here against the real worker host (DishHost, in process, behind a
 * stand-in Worker, on an in-memory store), as tests/worker/keep-continue-ui.test.ts does; `autosave()` is
 * what the 30 s interval, going to the background and leaving the page call. The host's clock is driven
 * by the test, so the dish can really run and pause.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as UiState from '../../src/ui/state';
import type * as UiJournal from '../../src/ui/journal';
import { DishHost } from '../../src/worker/host';
import { AUTOSAVE_SLOT, holdsSave, MemoryBackend, SaveStore, slotRecordFor, type SaveRequest, type SlotInfo } from '../../src/persistence/store';
import { gunzipText } from '../../src/persistence/compress';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { realizeRecipe } from '../../src/sim/recipes';
import { serializeWorld, stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';
import { registry } from '../helpers/world';

type Msg = ToWorker & { protocolVersion?: number };

const REG = registry();
const backend = new MemoryBackend();
let host: DishHost;
let now = 0;
const sent: Msg[] = [];
const replies: FromWorker[] = [];

class InProcessWorker {
  onmessage: ((ev: { data: FromWorker }) => void) | null = null;
  constructor() {
    host = new DishHost(
      REG,
      (m) => {
        replies.push(m);
        queueMicrotask(() => this.onmessage?.({ data: m }));
      },
      { now: () => now, iso: () => '2026-10-01T12:00:00.000Z' },
      new SaveStore(backend),
    );
  }
  postMessage(msg: Msg): void {
    sent.push(msg);
    host.handle(msg);
  }
  terminate(): void {}
}

const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};

/** Wait (up to a minute on a loaded machine) until every request the UI sent has its reply. */
async function settled(): Promise<void> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    await flush();
    const asked = sent.filter((m) => 'requestId' in m).map((m) => (m as { requestId: number }).requestId);
    const answered = new Set(replies.filter((r) => 'requestId' in r).map((r) => (r as { requestId?: number }).requestId));
    if (asked.every((id) => answered.has(id))) return;
    if (Date.now() > deadline) throw new Error('requests still unanswered');
    await new Promise((r) => setTimeout(r, 5));
  }
}

let ui: typeof UiState;
let journal: typeof UiJournal;

beforeAll(async () => {
  vi.stubGlobal('Worker', InProcessWorker);
  ui = await import('../../src/ui/state');
  journal = await import('../../src/ui/journal');
});

afterAll(() => {
  vi.unstubAllGlobals();
});

/** Everything the store holds, every byte of every record included: equal means nothing was written. */
function storeBytes(): string {
  const records = Object.keys(backend.records)
    .sort()
    .map((id) => {
      const r = backend.records[id]!;
      return [id, r.checksum, Buffer.from(r.data).toString('base64')];
    });
  return JSON.stringify({ slots: Object.keys(backend.slots).sort().map((id) => backend.slots[id]), records });
}

/** Continue's latest record: its index entry and the world it holds. */
async function continueNow(): Promise<{ readonly info: SlotInfo; readonly world: World; readonly hash: string }> {
  const info = backend.slots[AUTOSAVE_SLOT];
  if (!info) throw new Error('Continue is empty');
  const { world } = await loadSaveFile(await gunzipText(backend.records[info.current]!.data));
  return { info, world, hash: stateHash(world) };
}

const openWorld = () => host.world(ui.dishInfo.value!.dishId)!;
const openHash = () => stateHash(openWorld());
/** The autosave replies since `from` that wrote, and those that did not. */
function autosaveReplies(from: number): { readonly wrote: number; readonly skipped: number } {
  const ids = new Set(sent.slice(from).filter((m) => m.type === 'autosave').map((m) => (m as { requestId: number }).requestId));
  const mine = replies.filter((r): r is Extract<FromWorker, { type: 'slotSaved' }> => r.type === 'slotSaved' && ids.has(r.requestId));
  return { wrote: mine.filter((r) => r.wrote).length, skipped: mine.filter((r) => !r.wrote).length };
}

async function stepTicks(n: number): Promise<void> {
  for (let k = 0; k < n; k++) ui.stepOnce();
  await flush();
}

/** Run the open dish at 1× for `ms` of the host's clock, then pause it (as the Run/Pause button does). */
async function runThenPause(ms: number): Promise<void> {
  ui.setSpeed(1);
  host.pump();
  for (let t = 0; t < ms; t += 100) {
    now += 100;
    host.pump();
  }
  ui.setSpeed(0);
  now += 100;
  host.pump();
  await flush();
}

/** A Garden that has a named branch (seed 101, Accelerated, 1,500 ticks: tests/sim/lineage-host.test.ts). */
async function branchedGardenFile(): Promise<string> {
  const w = realizeRecipe(REG, 'FIRST_DISH_V1', { seed: 101, worldId: 'keep-autosave-branch', transform: (r) => ({ ...r, mutationPreset: 'accelerated' }) });
  run(w, 1500);
  expect(w.branches.established).toBeGreaterThanOrEqual(1);
  return (await buildSaveFile(w, { name: 'Branched garden', savedAt: '2026-10-01T11:00:00.000Z', recipeId: 'FIRST_DISH_V1' })).text;
}

describe('carry-over 1: a change made while paused reaches Continue at the next autosave event', () => {
  it('a paused Add Life: the tick does not move, and the next autosave() writes the dish with the new organisms', async () => {
    expect(await ui.startRecipe('FIRST_DISH_V1', 'Little Living Garden')).toEqual({ kind: 'done' });
    await flush();
    await stepTicks(5);
    expect(await ui.autosave()).toBe(true);
    const before = await continueNow();
    expect(before.info.tick).toBe(5);
    expect(before.hash).toBe(openHash());

    // Paused: Add Life places Amoebas; the tick stays at 0:00.5.
    await ui.sendCommand({ kind: 'inoculate', speciesId: 'P01', x: 64.5, y: 64.5, radius: 3, count: 4 });
    await flush();
    expect(openWorld().tick).toBe(5);
    expect(openHash()).not.toBe(before.hash);
    const mark = sent.length;
    expect(await ui.autosave()).toBe(true);
    const after = await continueNow();
    expect(after.hash).toBe(openHash()); // Continue is the dish with the added Amoebas
    expect(after.info.tick).toBe(5);
    expect(after.info.current).not.toBe(before.info.current);
    expect(after.info.previous).toBe(before.info.current); // the store keeps the previous copy
    expect(autosaveReplies(mark)).toEqual({ wrote: 1, skipped: 0 });
  });

  it('a paused evolution-setting change reaches Continue at the next autosave()', async () => {
    const before = await continueNow();
    expect(await ui.setEvolutionPreset('accelerated')).toBe(true);
    await flush();
    expect(openWorld().tick).toBe(before.info.tick);
    expect(await ui.autosave()).toBe(true);
    const after = await continueNow();
    expect(after.world.settings.mutationPreset).toBe('accelerated');
    expect(after.hash).toBe(openHash());
    expect(after.info.tick).toBe(before.info.tick);
  });

  it('a paused rename and a paused pin of a branch each reach Continue at the next autosave()', async () => {
    const text = await branchedGardenFile();
    await ui.importFile(new File([text], 'branched.pixelmeba'));
    await flush();
    expect(ui.dishInfo.value?.name).toBe('Branched garden');
    expect(await ui.autosave()).toBe(true); // Continue: the imported dish, as opened
    const opened = await continueNow();
    expect(opened.hash).toBe(openHash());

    // Rename branch 0 while paused (the lineage panel's command path: not undoable, the tick stays).
    await ui.sendCommand({ kind: 'lineage', op: 'rename', branch: 0, name: 'Quiet savers' }, false);
    await flush();
    expect(openWorld().tick).toBe(opened.info.tick);
    expect(openHash()).not.toBe(opened.hash);
    expect(await ui.autosave()).toBe(true);
    const renamed = await continueNow();
    expect(renamed.hash).toBe(openHash());
    expect(renamed.world.branches.branches[0]?.name).toBe('Quiet savers');

    await ui.sendCommand({ kind: 'lineage', op: 'pin', branch: 0, pinned: true }, false);
    await flush();
    expect(openHash()).not.toBe(renamed.hash);
    expect(await ui.autosave()).toBe(true);
    const pinned = await continueNow();
    expect(pinned.hash).toBe(openHash());
    expect(pinned.world.branches.branches[0]?.pinned).toBe(true);
    expect(pinned.info.tick).toBe(opened.info.tick);
  });

  it('a paused journal note reaches Continue; when its own autosave failed, the next autosave() still carries it', async () => {
    const info = ui.dishInfo.value!;
    const about = { name: info.name, second: Math.floor(openWorld().tick / 10), recipeId: info.recipeId, seed: info.seed, worldId: info.worldId };
    // D-0031: recording a note autosaves at once (the journal is outside the state hash; the checksum sees it).
    const first = journal.addObservation({ saw: 'the Sunbeads gathered by the stones', coincidedWith: 'the light patch', dish: about, link: null });
    if ('error' in first) throw new Error(first.error);
    await settled(); // the note is put with the dish, then its own autosave lands
    let held = await continueNow();
    expect(held.world.history.journal.map((e) => (e as { id: string }).id)).toContain(first.entry.id);
    // An autosave right after it has nothing new to write: the store stays byte-identical.
    const quiet = storeBytes();
    expect(await ui.autosave()).toBe(true);
    expect(storeBytes()).toBe(quiet);

    // The note's own autosave fails (a storage hiccup): Continue does not have the note yet …
    backend.failNextCommit = true;
    const second = journal.addObservation({ saw: 'a Sprinter stopped at the edge', coincidedWith: 'the sugar running out', dish: about, link: null });
    if ('error' in second) throw new Error(second.error);
    await settled();
    expect(backend.failNextCommit).toBe(false); // the failed write was that autosave
    held = await continueNow();
    expect(held.world.history.journal.map((e) => (e as { id: string }).id)).not.toContain(second.entry.id);
    // … and the next autosave event, at the same tick, writes it.
    const mark = sent.length;
    expect(await ui.autosave()).toBe(true);
    held = await continueNow();
    expect(held.world.history.journal.map((e) => (e as { id: string }).id)).toContain(second.entry.id);
    expect(held.info.tick).toBe(openWorld().tick);
    expect(autosaveReplies(mark)).toEqual({ wrote: 1, skipped: 0 });
  });
});

describe('carry-over 1: an unchanged dish is never written again', () => {
  it('repeated autosaves of an unchanged dish write nothing: the store stays byte-identical', async () => {
    expect(await ui.autosave()).toBe(true); // whatever the last change was, it is in Continue now
    const bytes = storeBytes();
    const mark = sent.length;
    for (let k = 0; k < 4; k++) expect(await ui.autosave()).toBe(true);
    expect(storeBytes()).toBe(bytes);
    expect(autosaveReplies(mark)).toEqual({ wrote: 0, skipped: 4 }); // every event asked the worker
  });

  it('run then pause: the next autosave writes once, and the ones after it write nothing', async () => {
    const before = await continueNow();
    await runThenPause(1500);
    expect(openWorld().tick).toBeGreaterThan(before.info.tick);
    expect(ui.meta.value?.speed).toBe(0);
    const mark = sent.length;
    expect(await ui.autosave()).toBe(true);
    const bytes = storeBytes();
    expect(await ui.autosave()).toBe(true);
    expect(await ui.autosave()).toBe(true);
    expect(storeBytes()).toBe(bytes);
    expect(autosaveReplies(mark)).toEqual({ wrote: 1, skipped: 2 });
    const after = await continueNow();
    expect(after.info.tick).toBe(openWorld().tick);
    expect(after.hash).toBe(openHash());
  });

  it('autosaves asked together (going to the background and leaving the page) write once', async () => {
    await stepTicks(3);
    const mark = sent.length;
    const results = await Promise.all([ui.autosave(), ui.autosave(), ui.autosave()]);
    expect(results).toEqual([true, true, true]);
    expect((await continueNow()).hash).toBe(openHash());
    expect(autosaveReplies(mark)).toEqual({ wrote: 1, skipped: 2 });
  });

  it('a manual save rebinds Continue (always written), and the autosaves after it write nothing', async () => {
    expect(await ui.saveToSlot('slot5', 'Branched garden')).toBe(true);
    const auto = (await continueNow()).info;
    expect(auto.activeSlot).toBe('slot5');
    expect(auto.activeRecord).toBe(backend.slots.slot5!.current);
    expect(auto.checksum).toBe(backend.slots.slot5!.checksum);
    const bytes = storeBytes();
    expect(await ui.autosave()).toBe(true);
    expect(storeBytes()).toBe(bytes);
    // Saving again at the same moment writes a new record in Slot 5: Continue follows it (a new binding).
    expect(await ui.saveToSlot('slot5', 'Branched garden')).toBe(true);
    expect((await continueNow()).info.activeRecord).toBe(backend.slots.slot5!.current);
  });

  it('a dish opened from Continue is not written again until it changes, and then it is', async () => {
    // The open dish is exactly Slot 5 and Continue (the test before): opening Continue keeps nothing.
    const before = await continueNow();
    const bytes = storeBytes();
    expect(await ui.loadSlot(AUTOSAVE_SLOT, 'Branched garden')).toEqual({ kind: 'done' });
    await flush();
    expect(storeBytes()).toBe(bytes);
    const mark = sent.length;
    expect(await ui.autosave()).toBe(true);
    expect(await ui.autosave()).toBe(true);
    expect(storeBytes()).toBe(bytes);
    expect((await continueNow()).info.current).toBe(before.info.current);
    expect(autosaveReplies(mark)).toEqual({ wrote: 0, skipped: 2 });
    // A paused change is a change: written at the next event.
    await ui.sendCommand({ kind: 'inoculate', speciesId: 'P01', x: 40.5, y: 64.5, radius: 3, count: 2 });
    await flush();
    expect(await ui.autosave()).toBe(true);
    expect((await continueNow()).hash).toBe(openHash());
    expect(autosaveReplies(mark)).toEqual({ wrote: 1, skipped: 2 });
  });

  it('the binding is part of "exactly": a dish kept into its slot and reopened from Continue is written once to record it, then never again', async () => {
    // The open dish changed since Slot 5 (the Amoebas above) and Continue holds it: opening Continue keeps
    // it first into its own slot, Slot 5, and writes no Continue (Continue itself is what opens).
    const before = await continueNow();
    expect(before.info.activeSlot).toBe('slot5');
    expect(await ui.loadSlot(AUTOSAVE_SLOT, 'Branched garden')).toEqual({ kind: 'done' });
    await flush();
    // Slot 5 now holds exactly Continue's file under a new record; the dish opened is bound to that record.
    expect(backend.slots.slot5!.checksum).toBe(before.info.checksum);
    expect(backend.slots.slot5!.current).not.toBe(before.info.activeRecord);
    expect(backend.slots[AUTOSAVE_SLOT]!.current).toBe(before.info.current);
    const mark = sent.length;
    expect(await ui.autosave()).toBe(true); // records the new binding (the file is the same)
    expect((await continueNow()).info.activeRecord).toBe(backend.slots.slot5!.current);
    const bytes = storeBytes();
    expect(await ui.autosave()).toBe(true);
    expect(storeBytes()).toBe(bytes);
    expect((await continueNow()).hash).toBe(before.hash); // the same dish throughout
    expect(autosaveReplies(mark)).toEqual({ wrote: 1, skipped: 1 });
  });
});

describe('holdsSave: what "Continue already holds exactly that file" compares', () => {
  const req: SaveRequest = {
    slotId: AUTOSAVE_SLOT,
    text: '{}',
    checksum: 'sha256:abc',
    name: 'Little Living Garden',
    tick: 50,
    savedAt: '2026-10-01T12:00:00.000Z',
    recipeId: 'FIRST_DISH_V1',
    evolution: { mutationPreset: 'standard', founderMode: 'identical' },
    worldId: 'dish-1',
    activeSlot: 'slot2',
    activeRecord: 'slot2:r1',
  };
  // Built inside each test, so this file also loads against code without these functions (fix round 3's check).
  const heldRecord = () => slotRecordFor(req, { savedAt: '2026-10-01T09:00:00.000Z', current: 'autosave:r7', previous: 'autosave:r6', bytes: 1234 });

  it('ignores only the write time and the storage bookkeeping', () => {
    const held = heldRecord();
    expect(holdsSave(held, req)).toBe(true);
    expect(holdsSave({ ...held, savedAt: 'later', current: 'x', previous: null, bytes: 1 }, req)).toBe(true);
  });

  it('a different checksum, name, binding or index copy is a different file: it is written', () => {
    const held = heldRecord();
    expect(holdsSave(held, { ...req, checksum: 'sha256:abd' })).toBe(false);
    expect(holdsSave(held, { ...req, name: 'Little Living Garden 2' })).toBe(false);
    expect(holdsSave(held, { ...req, activeRecord: 'slot2:r2' })).toBe(false);
    expect(holdsSave(held, { ...req, activeSlot: 'slot3' })).toBe(false);
    const { activeSlot: _s, activeRecord: _r, ...unbound } = req;
    expect(holdsSave(held, unbound)).toBe(false);
    expect(holdsSave(held, { ...req, tick: 51 })).toBe(false);
    expect(holdsSave(held, { ...req, worldId: 'dish-2' })).toBe(false);
    expect(holdsSave(held, { ...req, evolution: { mutationPreset: 'accelerated', founderMode: 'identical' } })).toBe(false);
    // An index written by an older build (no world id, no binding copy) is written once more.
    const { worldId: _w, activeSlot: _a, activeRecord: _b, ...older } = held;
    expect(holdsSave(older as SlotInfo, req)).toBe(false);
    // Another slot is never "Continue".
    expect(holdsSave({ ...held, slotId: 'slot1' }, req)).toBe(false);
  });

  it('the store writes exactly the record slotRecordFor describes', async () => {
    const b = new MemoryBackend();
    const store = new SaveStore(b);
    const info = await store.save({ ...req, text: 'x' });
    expect(info).toEqual(slotRecordFor({ ...req, text: 'x' }, { savedAt: req.savedAt, current: info.current, previous: null, bytes: info.bytes }));
    expect(holdsSave(info, req)).toBe(true);
  });
});

describe('the worker autosave reply says whether it wrote', () => {
  it('first write, then nothing for the same moment; a new name is written', async () => {
    const b = new MemoryBackend();
    const out: FromWorker[] = [];
    const h = new DishHost(REG, (m) => out.push(m), { now: () => 0, iso: () => '2026-10-01T12:00:00.000Z' }, new SaveStore(b), true);
    const w = realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: 'reply' });
    h.handle({ type: 'create', requestId: 1, dishId: 'd', source: { kind: 'state', state: serializeWorld(w) }, name: 'Garden' });
    let req = 1;
    const ask = async (msg: ToWorker): Promise<Extract<FromWorker, { type: 'slotSaved' }>> => {
      h.handle(msg);
      for (let i = 0; i < 5000; i++) {
        const r = out.find((m) => 'requestId' in m && m.requestId === (msg as { requestId: number }).requestId);
        if (r) {
          if (r.type !== 'slotSaved') throw new Error(JSON.stringify(r).slice(0, 300));
          return r;
        }
        await new Promise((res) => setTimeout(res, 1));
      }
      throw new Error('no reply');
    };
    const first = await ask({ type: 'autosave', requestId: ++req, dishId: 'd' });
    expect(first.wrote).toBe(true);
    const record = b.slots[AUTOSAVE_SLOT]!.current;
    const again = await ask({ type: 'autosave', requestId: ++req, dishId: 'd' });
    expect(again.wrote).toBe(false);
    expect(again.slot).toEqual(first.slot);
    expect(b.slots[AUTOSAVE_SLOT]!.current).toBe(record);
    // A manual save always writes; its new record is a new binding, so the next autosave writes Continue.
    const saved = await ask({ type: 'saveSlot', requestId: ++req, dishId: 'd', slotId: 'slot1', name: 'Garden kept' });
    expect(saved.wrote).toBe(true);
    const renamed = await ask({ type: 'autosave', requestId: ++req, dishId: 'd' });
    expect(renamed.wrote).toBe(true);
    expect(b.slots[AUTOSAVE_SLOT]!.name).toBe('Garden kept');
    expect((await ask({ type: 'autosave', requestId: req + 1, dishId: 'd' })).wrote).toBe(false);
  });
});
