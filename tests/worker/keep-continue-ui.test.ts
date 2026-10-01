/**
 * D-0033 fix round 2 (docs/reports/reviews/g2-close/keep-dish-reverify1.md, MAJOR, UI half): Continue is
 * the last dish (UX §2 "Home ─ Continue (last dish …)"). The app's own state module runs here against the
 * real worker host (DishHost, in process, behind a stand-in Worker, on an in-memory save store), exactly
 * as the app wires them; `autosave()` is what the 30 s interval, going to the background and leaving the
 * page call (SPEC §14.2).
 *
 * The defect: opening a dish set "already autosaved at this tick", so a dish that a replacing action
 * opened and the player left unrun was never autosaved; Continue kept the dish before it, and after the
 * next launch Home offered that older dish and the next replacing action kept it again. Proven here:
 * - a dish that Play, a named save, Import, Duplicate or What if? opened is written to Continue by the
 *   next autosave, even at an unchanged tick (Continue then holds exactly that dish, bound to the slot
 *   it was opened from, the very file the slot holds);
 * - a dish opened from Continue itself is not written again until it changes (Continue holds it).
 * Fix round 3: every autosave event now reaches the worker, which writes only when Continue does not
 * already hold exactly the dish's file (tests/worker/keep-autosave.test.ts); so "not written" is read
 * from the store (Continue's record and every byte), not from the requests the UI sent.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as UiState from '../../src/ui/state';
import { DishHost } from '../../src/worker/host';
import { AUTOSAVE_SLOT, MemoryBackend, SaveStore } from '../../src/persistence/store';
import { gunzipText } from '../../src/persistence/compress';
import { loadSaveFile } from '../../src/persistence/saveFile';
import { stateHash } from '../../src/sim/serialize';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';
import { registry } from '../helpers/world';

type Msg = ToWorker & { protocolVersion?: number };

const backend = new MemoryBackend();
let host: DishHost;
const sent: Msg[] = [];

class InProcessWorker {
  onmessage: ((ev: { data: FromWorker }) => void) | null = null;
  constructor() {
    host = new DishHost(registry(), (m) => queueMicrotask(() => this.onmessage?.({ data: m })), { now: () => 0, iso: () => '2026-09-29T12:00:00.000Z' }, new SaveStore(backend));
  }
  postMessage(msg: Msg): void {
    sent.push(msg);
    host.handle(msg);
  }
  terminate(): void {}
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

let ui: typeof UiState;

beforeAll(async () => {
  vi.stubGlobal('Worker', InProcessWorker);
  ui = await import('../../src/ui/state');
});

afterAll(() => {
  vi.unstubAllGlobals();
});

/** What Continue's latest record holds: its world's state hash and world id, and its index entry. */
async function continueNow(): Promise<{ readonly hash: string; readonly worldId: string; readonly record: string; readonly tick: number; readonly activeSlot?: string; readonly checksum: string }> {
  const info = backend.slots[AUTOSAVE_SLOT];
  if (!info) throw new Error('Continue is empty');
  const { world } = await loadSaveFile(await gunzipText(backend.records[info.current]!.data));
  return { hash: stateHash(world), worldId: world.worldId, record: info.current, tick: info.tick, checksum: info.checksum, ...(info.activeSlot ? { activeSlot: info.activeSlot } : {}) };
}

const openWorld = () => host.world(ui.dishInfo.value!.dishId)!;
const openHash = () => stateHash(openWorld());
/** Autosave requests the UI sent since `from`. */
const autosavesSince = (from: number) => sent.slice(from).filter((m) => m.type === 'autosave').length;
/** Everything the store holds, every record's bytes included: equal means nothing was written. */
const storeBytes = () =>
  JSON.stringify({
    slots: Object.keys(backend.slots)
      .sort()
      .map((id) => backend.slots[id]),
    records: Object.keys(backend.records)
      .sort()
      .map((id) => [id, Buffer.from(backend.records[id]!.data).toString('base64')]),
  });

async function runTicks(n: number): Promise<void> {
  for (let k = 0; k < n; k++) ui.stepOnce();
  await flush();
}

describe('Continue follows the dish a replacing action opened (D-0033 fix round 2)', () => {
  it('Play Start over a changed dish: the kept dish goes to Slot 1, and the next autosave writes the new Garden at 0:00', async () => {
    await ui.startRecipe('FIRST_DISH_V1', 'Little Living Garden');
    await flush();
    await runTicks(12);
    expect(ui.meta.value?.tick).toBe(12);
    expect(await ui.autosave()).toBe(true);
    const old = await continueNow();
    expect(old.tick).toBe(12);

    expect(await ui.startRecipe('FIRST_DISH_V1', 'Little Living Garden')).toEqual({ kind: 'done' });
    await flush();
    expect(backend.slots.slot1?.tick).toBe(12); // the changed dish was kept first
    expect(ui.meta.value?.tick).toBe(0);
    // The new Garden has not run; the 30 s / background autosave still writes it: Continue is the last dish.
    const mark = sent.length;
    expect(await ui.autosave()).toBe(true);
    expect(autosavesSince(mark)).toBe(1);
    const now = await continueNow();
    expect(now.tick).toBe(0);
    expect(now.hash).toBe(openHash());
    expect(now.hash).not.toBe(old.hash);
    // Written once: the next autosave at the same tick has nothing new to write (nothing is written).
    const again = storeBytes();
    expect(await ui.autosave()).toBe(true);
    expect(storeBytes()).toBe(again);
  });

  it('a named save opened and left unrun becomes Continue at the next autosave: the same file, bound to its slot', async () => {
    const mark = sent.length;
    const loaded = await ui.loadSlot('slot1', 'Little Living Garden');
    expect(loaded).toEqual({ kind: 'done' });
    await flush();
    expect(ui.meta.value?.tick).toBe(12);
    expect(await ui.autosave()).toBe(true);
    expect(autosavesSince(mark)).toBe(1);
    const now = await continueNow();
    expect(now.hash).toBe(openHash());
    // Exactly Slot 1's file (the checksum covers the whole state), bound to it: a later launch finds it saved.
    expect(now.checksum).toBe(backend.slots.slot1!.checksum);
    expect(now.activeSlot).toBe('slot1');
  });

  it('a dish opened from Continue itself is not written again until it changes', async () => {
    const before = await continueNow();
    const bytes = storeBytes();
    expect(await ui.loadSlot(AUTOSAVE_SLOT, 'Little Living Garden')).toEqual({ kind: 'done' });
    await flush();
    expect(await ui.autosave()).toBe(true);
    expect(storeBytes()).toBe(bytes); // fix round 3: the event reaches the worker, which writes nothing
    expect((await continueNow()).record).toBe(before.record);
    // Once it changes, it is written as before.
    await runTicks(2);
    expect(await ui.autosave()).toBe(true);
    expect((await continueNow()).record).not.toBe(before.record);
    expect((await continueNow()).tick).toBe(14);
  });

  it('Duplicate and What if? open a dish Continue does not hold yet: the next autosave writes it', async () => {
    const original = openWorld().worldId;
    await ui.duplicateCurrent();
    await flush();
    expect(ui.dishInfo.value?.name).toBe('Little Living Garden (copy)');
    expect(openWorld().worldId).not.toBe(original);
    let mark = sent.length;
    expect(await ui.autosave()).toBe(true);
    expect(autosavesSince(mark)).toBe(1);
    expect((await continueNow()).worldId).toBe(openWorld().worldId); // the copy, not the original

    const from = ui.dishInfo.value!.dishId;
    const started = await ui.getClient().whatIfStart({ newDishId: ui.freshDishId(), fromDishId: from, pick: { kind: 'variant', variantId: 'R-G1' }, keep: { kind: 'auto' } });
    if (!started.ok) throw new Error(started.message);
    ui.enterStartedDish(started.info, from);
    await flush();
    mark = sent.length;
    expect(await ui.autosave()).toBe(true);
    expect(autosavesSince(mark)).toBe(1);
    const now = await continueNow();
    expect(now.tick).toBe(0);
    expect(now.worldId).toBe(openWorld().worldId);
    expect(now.hash).toBe(openHash());
  });
});
