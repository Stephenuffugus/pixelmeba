/**
 * P2.8 automatic checkpoint ring (SPEC §10.7, D4 §12, CT §12.10 "checkpoint ring 10 × 60 s"): ten
 * automatic checkpoints written through the same atomic, checksummed commit as the save slots; the
 * eleventh removes exactly the oldest automatic checkpoint and never a named slot, the autosave or a
 * predecessor; a failing commit and a full store change nothing and say so; the worker writes one every
 * 60 simulated seconds of the played dish while the ring is on (never otherwise), lists them after the
 * named slots labelled automatic, and opens one as a new paused dish bound to no named slot.
 */
import { describe, expect, it } from 'vitest';
import {
  branchName,
  branchWorldId,
  CHECKPOINT_INTERVAL_TICKS,
  CHECKPOINT_RING_SIZE,
  CheckpointRing,
} from '../../src/persistence/checkpoints';
import { gunzipText } from '../../src/persistence/compress';
import { buildSaveFile, parseSaveFile } from '../../src/persistence/saveFile';
import {
  AUTOSAVE_SLOT,
  isCheckpointSlot,
  MemoryBackend,
  SaveStore,
  type SlotInfo,
} from '../../src/persistence/store';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { DishHost } from '../../src/worker/host';
import type { FromWorker } from '../../src/worker/protocol';
import { registry } from '../helpers/world';

const reg = registry();

async function saveText(ticks: number) {
  const w = realizeRecipe(reg, 'FIRST_DISH_V1', { worldId: 'ring', seed: 104729 });
  run(w, ticks);
  const built = await buildSaveFile(w, { name: 'Garden', savedAt: `t${ticks}`, recipeId: 'FIRST_DISH_V1' });
  return { ...built, tick: ticks, hash: stateHash(w) };
}

const req = (s: Awaited<ReturnType<typeof saveText>>, k: number) => ({
  text: s.text,
  checksum: s.checksum,
  name: 'Garden',
  worldId: 'ring',
  tick: s.tick + k * CHECKPOINT_INTERVAL_TICKS,
  savedAt: `2026-09-28T00:${String(k).padStart(2, '0')}:00Z`,
  recipeId: 'FIRST_DISH_V1',
});

/** A store with the autosave (with its predecessor) and two named slots, as a player would have it. */
async function playerStore() {
  const backend = new MemoryBackend();
  const store = new SaveStore(backend);
  const s = await saveText(20);
  await store.save({
    slotId: AUTOSAVE_SLOT,
    text: s.text,
    checksum: s.checksum,
    name: 'Auto',
    tick: 20,
    savedAt: 'a1',
    recipeId: null,
  });
  await store.save({
    slotId: AUTOSAVE_SLOT,
    text: s.text,
    checksum: s.checksum,
    name: 'Auto',
    tick: 20,
    savedAt: 'a2',
    recipeId: null,
  });
  await store.save({
    slotId: 'slot1',
    text: s.text,
    checksum: s.checksum,
    name: 'Named one',
    tick: 20,
    savedAt: 'n1',
    recipeId: null,
  });
  await store.save({
    slotId: 'slot7',
    text: s.text,
    checksum: s.checksum,
    name: 'Named seven',
    tick: 20,
    savedAt: 'n7',
    recipeId: null,
  });
  return { backend, store, s };
}

/** Everything that is not an automatic checkpoint: slot pointers and the bytes of their records. */
function playerState(backend: MemoryBackend): string {
  const slots = Object.values(backend.slots)
    .filter((x) => !isCheckpointSlot(x.slotId))
    .sort((a, b) => (a.slotId < b.slotId ? -1 : 1));
  const recs = slots.flatMap((x) => [x.current, x.previous]).filter((id): id is string => id !== null);
  return JSON.stringify({ slots, records: recs.map((id) => [id, Array.from(backend.records[id]!.data)]) });
}

const ids = (list: readonly SlotInfo[]) => list.map((x) => x.slotId);

describe('checkpoint ring store (P2.8)', () => {
  it('keeps ten automatic checkpoints; the eleventh removes only the oldest automatic one, never a named save', async () => {
    const { backend, store, s } = await playerStore();
    const before = playerState(backend);
    const ring = new CheckpointRing(backend);
    const written: string[] = [];
    for (let k = 1; k <= CHECKPOINT_RING_SIZE; k++) {
      const r = await ring.write(req(s, k));
      if (!r.ok) throw new Error(r.detail);
      expect(r.evicted).toBeNull();
      expect(r.slot.automatic).toBe(true);
      written.push(r.slot.slotId);
    }
    expect(ids(await ring.list())).toEqual([...written].reverse());
    const r11 = await ring.write(req(s, 11));
    if (!r11.ok) throw new Error(r11.detail);
    expect(r11.evicted?.slotId).toBe(written[0]);
    const now = await ring.list();
    expect(now).toHaveLength(CHECKPOINT_RING_SIZE);
    expect(ids(now)).toEqual([r11.slot.slotId, ...written.slice(1).reverse()]);
    // The evicted checkpoint's record went in the same commit; nothing else was touched.
    expect(backend.records[r11.evicted!.current]).toBeUndefined();
    expect(playerState(backend)).toBe(before);
    // Named slots and the autosave list without checkpoints; every checkpoint is a verifiable save file.
    expect(ids(await store.list())).toEqual([AUTOSAVE_SLOT, 'slot1', 'slot7']);
    for (const c of now) {
      const loaded = await store.load(c.slotId, async (t) => (await parseSaveFile(t)) !== null);
      expect(loaded?.usedPredecessor).toBe(false);
      expect(JSON.parse(loaded!.text).checksum).toBe(c.checksum);
    }
    // The named-save path can never write over a checkpoint.
    await expect(
      store.save({
        slotId: now[0]!.slotId,
        text: s.text,
        checksum: s.checksum,
        name: 'x',
        tick: 1,
        savedAt: 'x',
        recipeId: null,
      }),
    ).rejects.toThrow(/unknown slot/);
  });

  it('a failing commit changes nothing: the older checkpoints and every save stay, and the result says so', async () => {
    const { backend, s } = await playerStore();
    const ring = new CheckpointRing(backend);
    for (let k = 1; k <= CHECKPOINT_RING_SIZE; k++) expect((await ring.write(req(s, k))).ok).toBe(true);
    const snapshot = JSON.stringify({ slots: backend.slots, records: Object.keys(backend.records).sort() });
    backend.failNextCommit = true;
    const r = await ring.write(req(s, 11));
    expect(r).toMatchObject({ ok: false, reason: 'write-failed', kept: CHECKPOINT_RING_SIZE });
    expect(JSON.stringify({ slots: backend.slots, records: Object.keys(backend.records).sort() })).toBe(
      snapshot,
    );
    // The next write works again and rotates normally.
    const again = await ring.write(req(s, 12));
    expect(again.ok).toBe(true);
    expect(await ring.list()).toHaveLength(CHECKPOINT_RING_SIZE);
  });

  it('a full store: the preflight refuses before writing (room must remain for one more save), keeping everything', async () => {
    const { backend, s } = await playerStore();
    const ring = new CheckpointRing(backend);
    expect((await ring.write(req(s, 1))).ok).toBe(true);
    const used = (await backend.usage()).bytes;
    const size = (await ring.list())[0]!.bytes;
    // Room for exactly one more checkpoint but not for a save after it: refused.
    backend.quotaBytes = used + size + Math.floor(size / 2);
    const snapshot = JSON.stringify({ slots: backend.slots, records: Object.keys(backend.records).sort() });
    const r = await ring.write(req(s, 2));
    expect(r).toMatchObject({ ok: false, reason: 'storage-full', kept: 1 });
    expect(JSON.stringify({ slots: backend.slots, records: Object.keys(backend.records).sort() })).toBe(
      snapshot,
    );
    // With room for it and one more save, it is written.
    backend.quotaBytes = used + 2 * size + 1024;
    expect((await ring.write(req(s, 2))).ok).toBe(true);
    // The platform's estimate is used when given (web: navigator.storage.estimate).
    const tight = new CheckpointRing(backend, () => Promise.resolve({ usage: 1_000_000, quota: 1_000_100 }));
    expect(await tight.write(req(s, 3))).toMatchObject({ ok: false, reason: 'storage-full', kept: 2 });
  });

  it('a full store that refuses at commit (QuotaExceededError): nothing changes and the reason is storage-full', async () => {
    const { backend, s } = await playerStore();
    // The estimate says there is room, but the store itself refuses the write.
    const ring = new CheckpointRing(backend, () => Promise.resolve({ usage: 0, quota: 1e12 }));
    for (let k = 1; k <= 3; k++) expect((await ring.write(req(s, k))).ok).toBe(true);
    backend.quotaBytes = (await backend.usage()).bytes; // not one byte more
    const snapshot = JSON.stringify({ slots: backend.slots, records: Object.keys(backend.records).sort() });
    const r = await ring.write(req(s, 4));
    expect(r).toMatchObject({ ok: false, reason: 'storage-full', kept: 3 });
    expect(JSON.stringify({ slots: backend.slots, records: Object.keys(backend.records).sort() })).toBe(
      snapshot,
    );
  });
});

/** The real worker host with a memory store and a fake clock. */
class StoreHost {
  now = 0;
  readonly out: FromWorker[] = [];
  readonly backend = new MemoryBackend();
  readonly host: DishHost;
  private req = 0;
  constructor() {
    this.host = new DishHost(
      reg,
      (m) => this.out.push(m),
      { now: () => this.now, iso: () => new Date(Date.UTC(2026, 8, 28) + this.now).toISOString() },
      new SaveStore(this.backend),
      true,
    );
  }
  /** `empty`: the Garden's habitat without life or food (fast to run for many minutes). */
  create(dishId: string, empty = false): void {
    this.host.handle({
      type: 'create',
      requestId: ++this.req,
      dishId,
      source: {
        kind: 'recipe',
        recipeId: 'FIRST_DISH_V1',
        seed: 104729,
        ...(empty ? { overrides: { empty: true } } : {}),
      },
    });
  }
  /** Run the active dish at 4× (4 ticks per 100 ms frame) up to `tick`, letting async writes finish in between. */
  async runTo(dishId: string, tick: number, onTick?: (t: number) => void): Promise<void> {
    this.host.handle({ type: 'setSpeed', dishId, speed: 4 });
    const w = () => this.host.world(dishId)!;
    while (w().tick < tick) {
      this.now += 100;
      this.host.pump();
      onTick?.(w().tick);
      // A checkpoint is due at every whole minute: let its asynchronous write finish before going on.
      if (w().tick % CHECKPOINT_INTERVAL_TICKS === 0) await this.settle();
    }
    this.host.handle({ type: 'setSpeed', dishId, speed: 0 });
    await this.settle();
  }
  /** Wait until no automatic checkpoint write is in flight (its outcome has been posted). */
  async settle(): Promise<void> {
    for (let k = 0; k < 400; k++) {
      await flush();
      if (!(this.host as unknown as { ringBusy: boolean }).ringBusy) return;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error('checkpoint write did not finish');
  }
  async request<T extends FromWorker['type']>(
    msg: Parameters<DishHost['handleAsync']>[0],
    type: T,
  ): Promise<Extract<FromWorker, { type: T }>> {
    const requestId = (msg as { requestId?: number }).requestId;
    await this.host.handleAsync(msg);
    await flush();
    const m = this.out.find((x) => x.type === type && (x as { requestId?: number }).requestId === requestId);
    if (!m)
      throw new Error(`no ${type} reply: ${JSON.stringify(this.out.filter((x) => x.type === 'error'))}`);
    return m as Extract<FromWorker, { type: T }>;
  }
  nextId(): number {
    return ++this.req;
  }
  notices() {
    return this.out.filter((m): m is Extract<FromWorker, { type: 'checkpoint' }> => m.type === 'checkpoint');
  }
}

async function flush(): Promise<void> {
  for (let k = 0; k < 5; k++) await new Promise((r) => setTimeout(r, 0));
}

describe('checkpoint ring in the worker (P2.8)', () => {
  it('off by default: playing past a minute writes no checkpoint', async () => {
    const h = new StoreHost();
    h.create('d', true);
    await h.runTo('d', 700);
    expect(h.notices()).toEqual([]);
    expect(Object.keys(h.backend.slots).filter(isCheckpointSlot)).toEqual([]);
  });

  it('on: one checkpoint per 60 simulated seconds, listed after the named slots as automatic, opening as a new paused dish at that moment', async () => {
    const h = new StoreHost();
    h.create('d');
    h.host.handle({ type: 'checkpointRing', enabled: true });
    // A named save first: the ring must never touch it.
    await h.request(
      { type: 'saveSlot', requestId: h.nextId(), dishId: 'd', slotId: 'slot2', name: 'Mine' },
      'slotSaved',
    );
    const named = JSON.stringify(h.backend.slots.slot2);
    const hashes: Record<number, string> = {};
    await h.runTo('d', 1300, (t) => {
      if (t % 600 === 0) hashes[t] = stateHash(h.host.world('d')!);
    });
    const ok = h.notices().filter((n) => n.ok);
    expect(ok.map((n) => n.tick)).toEqual([600, 1200]);
    expect(h.notices().filter((n) => !n.ok)).toEqual([]);
    const list = await h.request({ type: 'listSlots', requestId: h.nextId() }, 'slots');
    expect(
      list.slots.map((x) => [
        x.slotId.startsWith('checkpoint-') ? 'checkpoint' : x.slotId,
        x.tick,
        x.automatic ?? false,
      ]),
    ).toEqual([
      ['slot2', 0, false],
      ['checkpoint', 1200, true],
      ['checkpoint', 600, true],
    ]);
    expect(list.slots[1]!.name).toBe('Mine (automatic checkpoint)');
    expect(JSON.stringify(h.backend.slots.slot2)).toBe(named);
    // Open the older checkpoint: a new paused dish exactly at 600 ticks.
    const older = list.slots[2]!;
    const loaded = await h.request(
      { type: 'loadSlot', requestId: h.nextId(), slotId: older.slotId, newDishId: 'from-checkpoint' },
      'loaded',
    );
    expect(loaded.info.tick).toBe(600);
    const w = h.host.world('from-checkpoint')!;
    expect(stateHash(w)).toBe(hashes[600]);
    // Fix round 1: it opens as a new branch (SPEC §10.7), named for its moment and with its own dish
    // identity (like Duplicate), so it and its own checkpoints can be told apart from the dish it came from.
    expect(loaded.branch).toEqual({ fromName: 'Mine', tick: 600 });
    expect(loaded.info.name).toBe('Mine (from 1:00)');
    expect(w.worldId).not.toBe(h.host.world('d')!.worldId);
    expect(w.worldId).toBe(`${h.host.world('d')!.worldId}+from-checkpoint`);
    // A named save opens as before: no branch, its own name.
    const named2 = await h.request({ type: 'loadSlot', requestId: h.nextId(), slotId: 'slot2', newDishId: 'from-slot' }, 'loaded');
    expect(named2.branch).toBeUndefined();
    expect(named2.info.name).toBe('Mine');
    expect(await gunzipText(h.backend.records[h.backend.slots[older.slotId]!.current]!.data)).toContain(
      '"format":"pixelmeba-save"',
    );
    // It is bound to no named slot: What if? would keep it in the first free slot, not "its own".
    const wi = await h.request(
      { type: 'whatIf', requestId: h.nextId(), sourceId: null, aboutDishId: 'from-checkpoint' },
      'whatIf',
    );
    expect(wi.answer.plan).toMatchObject({ kind: 'slot', own: false });
  });

  it('eleven minutes of play keep ten checkpoints: the oldest is rotated out with its record', async () => {
    const h = new StoreHost();
    h.create('d', true);
    h.host.handle({ type: 'checkpointRing', enabled: true });
    await h.runTo('d', 11 * 600);
    const ok = h.notices().filter((n) => n.ok);
    expect(ok).toHaveLength(11);
    expect(ok.at(-1)!.kept).toBe(CHECKPOINT_RING_SIZE);
    const slots = Object.values(h.backend.slots).filter((x) => isCheckpointSlot(x.slotId));
    expect(slots.map((x) => x.tick).sort((a, b) => a - b)).toEqual(
      [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((m) => m * 600),
    );
    // Records: exactly one per checkpoint (no orphans left by rotation).
    expect(Object.keys(h.backend.records).filter((id) => id.startsWith('checkpoint-'))).toHaveLength(
      CHECKPOINT_RING_SIZE,
    );
  });

  it("a branch's own checkpoints carry the branch's name (fix round 1)", async () => {
    const h = new StoreHost();
    h.create('d', true);
    h.host.handle({ type: 'checkpointRing', enabled: true });
    await h.runTo('d', 600);
    const first = h.notices().find((n) => n.ok)!;
    const opened = await h.request({ type: 'loadSlot', requestId: h.nextId(), slotId: first.slot!.slotId, newDishId: 'b' }, 'loaded');
    expect(opened.info.name).toMatch(/ \(from 1:00\)$/);
    await h.runTo('b', 1200);
    const list = await h.request({ type: 'listSlots', requestId: h.nextId() }, 'slots');
    const names = list.slots.filter((x) => x.automatic).map((x) => [x.tick, x.name]);
    expect(names).toEqual([
      [1200, `${opened.info.name} (automatic checkpoint)`],
      [600, first.slot!.name],
    ]);
  });

  it("a branch opened from a branch's checkpoint does not grow the dish id, so notes about it are always kept with it (fix round 2)", async () => {
    const h = new StoreHost();
    h.create('d', true);
    h.host.handle({ type: 'checkpointRing', enabled: true });
    const root = h.host.world('d')!.worldId;
    expect(root).not.toContain('+');
    await h.runTo('d', 600);
    let from = h.notices().find((n) => n.ok)!.slot!.slotId;
    // Five nested openings: each branch runs a minute, and its own checkpoint is opened as the next branch.
    for (let k = 1; k <= 5; k++) {
      const id = `dish-mf3a1b2c-${k}`;
      await h.request({ type: 'loadSlot', requestId: h.nextId(), slotId: from, newDishId: id }, 'loaded');
      const w = h.host.world(id)!;
      expect(w.worldId).toBe(branchWorldId(root, id));
      expect(w.worldId).toBe(`${root}+${id}`); // not `${root}+…+…+${id}` (the old code nested one "+id" per opening)
      const before = h.notices().length;
      await h.runTo(id, w.tick + 600);
      const made = h.notices().slice(before).find((n) => n.ok && n.dishId === id);
      if (!made?.slot) throw new Error(`branch ${k} wrote no checkpoint`);
      from = made.slot.slotId;
    }
    // A note about the deepest branch is kept with it.
    const note = {
      version: 1,
      kind: 'observation',
      id: 'observation:nested',
      saw: 'films on the stones',
      coincidedWith: 'the lid closing',
      recordedAt: '2026-09-28T10:00:00.000Z',
      dish: { name: 'Garden (from 5:00)', second: 300, recipeId: 'FIRST_DISH_V1', seed: 104729 },
      link: null,
      worldId: h.host.world('dish-mf3a1b2c-5')!.worldId,
    };
    const kept = await h.request({ type: 'journalPut', requestId: h.nextId(), dishId: 'dish-mf3a1b2c-5', entry: note }, 'journal');
    expect(kept.stored).toBe(true);
    expect(branchWorldId('a+b+c', 'n')).toBe('a+n');
  });
});

describe('checkpoint wording (fix round 2)', () => {
  it('Settings never claims earlier checkpoints that do not exist, and the open toast says whether Continue follows the branch', async () => {
    const { checkpointOpenedText, checkpointSettingText } = await import('../../src/ui/state');
    const failed = (kept: number, reason: 'storage-full' | 'write-failed' | 'busy') => ({ type: 'checkpoint' as const, dishId: 'd', tick: 600, ok: false, reason, kept });
    expect(checkpointSettingText(null)).toBe('');
    expect(checkpointSettingText(failed(0, 'storage-full'))).toBe(' The latest one was not written (storage is nearly full); nothing was removed.');
    expect(checkpointSettingText(failed(1, 'write-failed'))).toBe(' The latest one was not written (the write failed); the earlier one is kept.');
    expect(checkpointSettingText(failed(4, 'busy'))).toBe(' The latest one was not written (the previous one was still being written); the 4 earlier ones are kept.');
    expect(checkpointSettingText({ type: 'checkpoint', dishId: 'd', tick: 1200, ok: true, kept: 2 })).toBe(' Latest: at 2:00 dish time (2 kept).');
    const branch = { fromName: 'Little Living Garden', tick: 600 };
    expect(checkpointOpenedText(branch, 'Little Living Garden (from 1:00)')).toBe(
      'Opened the automatic checkpoint of "Little Living Garden" at 1:00 as a new branch, "Little Living Garden (from 1:00)", paused. Continue now follows this branch.',
    );
    expect(checkpointOpenedText(branch, 'Little Living Garden (from 1:00)', false)).toBe(
      'Opened the automatic checkpoint of "Little Living Garden" at 1:00 as a new branch, "Little Living Garden (from 1:00)", paused. Continue could not be updated, so it still opens the dish it held before.',
    );
  });
});

describe('checkpoint ring edge cases (fix round 1)', () => {
  it('two tabs writing to one store never choose the same checkpoint id, and a ring that held more than ten shrinks back to ten', async () => {
    const { backend, s } = await playerStore();
    const before = playerState(backend);
    const a = new CheckpointRing(backend, undefined, 'taba');
    const b = new CheckpointRing(backend, undefined, 'tabb');
    // Both read the ring before either commits (the old ids were equal: one slot entry replaced the
    // other and orphaned its record).
    const [ra, rb] = await Promise.all([a.write(req(s, 1)), b.write(req(s, 1))]);
    if (!ra.ok || !rb.ok) throw new Error('write failed');
    // Truly concurrent: both chose the same sequence number (the old id was only that number) …
    expect(ra.slot.slotId.split('-')[1]).toBe(rb.slot.slotId.split('-')[1]);
    // … and still two different checkpoints.
    expect(ra.slot.slotId).not.toBe(rb.slot.slotId);
    const records = () => Object.keys(backend.records).filter((id) => id.startsWith('checkpoint-'));
    const slots = () => Object.values(backend.slots).filter((x) => isCheckpointSlot(x.slotId));
    expect(slots()).toHaveLength(2);
    expect(records()).toHaveLength(2);
    for (const x of slots()) expect(backend.records[x.current]).toBeDefined();
    // Concurrent writes can push the ring past ten …
    for (let k = 2; k <= 6; k++) {
      const [x, y] = await Promise.all([a.write(req(s, k)), b.write(req(s, k))]);
      if (!x.ok || !y.ok) throw new Error('write failed');
    }
    expect(slots().length).toBeGreaterThan(CHECKPOINT_RING_SIZE);
    // … and the next write removes every checkpoint beyond the newest nine: ten again, no orphan records.
    const r = await a.write(req(s, 7));
    if (!r.ok) throw new Error(r.detail);
    expect(slots()).toHaveLength(CHECKPOINT_RING_SIZE);
    expect(records()).toHaveLength(CHECKPOINT_RING_SIZE);
    expect(ids(await a.list())[0]).toBe(r.slot.slotId);
    expect(playerState(backend)).toBe(before); // named saves, the autosave and predecessors untouched
  });

  it("a save file's header tick is the serialized state's tick even if the dish keeps running during the checksum", async () => {
    const w = realizeRecipe(reg, 'FIRST_DISH_V1', { worldId: 'header', seed: 104729 });
    run(w, 40);
    const pending = buildSaveFile(w, { name: 'x', savedAt: '2026-09-28T00:00:00Z', recipeId: 'FIRST_DISH_V1' });
    run(w, 7); // the worker keeps stepping a running dish while the checksum is computed
    const { file } = await pending;
    expect(file.state.tick).toBe(40);
    expect(file.tick).toBe(40);
  });

  it('a branch is named for the moment it starts from, within 60 characters', () => {
    expect(branchName('Garden', 600)).toBe('Garden (from 1:00)');
    expect(branchName('Garden (from 1:00)', 1200)).toBe('Garden (from 2:00)');
    expect(branchName('Garden', 37_210)).toBe('Garden (from 1:02:01)');
    const long = branchName('A'.repeat(60), 600);
    expect(Array.from(long)).toHaveLength(60);
    expect(long.endsWith('… (from 1:00)')).toBe(true);
  });
});

