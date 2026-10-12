/**
 * P4.7 the shelf (src/persistence/shelf.ts; D-0082; SPEC §13.6 "capture an immutable baseline into a slot"):
 * write-once stored snapshots outside the ten named slots, modelled on the checkpoint ring.
 *
 * - put → get round trip (the exact save text; the index entry carries shelfKind and createdFor);
 * - one atomic commit: with MemoryBackend.failNextCommit nothing is written, and every named slot, the
 *   autosave and the checkpoints are untouched;
 * - the storage preflight and the kind's limit refuse with a message and leave everything as it was;
 * - write-once: a second put never replaces a record; remove only by id (and only shelf ids);
 * - SaveStore.list(), slot() and freeSlot() never show or count shelf ids;
 * - a corrupt shelf record makes get() return null, never a fallback to another record;
 * - two puts of one kind in flight together on one Shelf (a backend whose reads and commits yield) get
 *   distinct ids and both read back; a failed put never blocks the next (writes are serialized);
 * - the refusals name what the records are for (Try my dish and challenges share the baseline limit) and
 *   where to remove one (Saved dishes → Storage).
 */
import { describe, expect, it } from 'vitest';
import { CheckpointRing } from '../../src/persistence/checkpoints';
import { gzipText } from '../../src/persistence/compress';
import { buildSaveFile, parseSaveFile } from '../../src/persistence/saveFile';
import { Shelf, SHELF_LIMITS, SHELF_TEXT, shelfKindOf, type ShelfRequest } from '../../src/persistence/shelf';
import { AUTOSAVE_SLOT, isShelfSlot, MemoryBackend, SaveStore, SHELF_REMOVE_REFUSED, type SlotInfo, type StoredRecord } from '../../src/persistence/store';
import { realizeRecipe } from '../../src/sim/recipes';
import { run } from '../../src/sim/tick';
import { registry } from '../helpers/world';

const reg = registry();

async function saveText(ticks: number) {
  const w = realizeRecipe(reg, 'FIRST_DISH_V1', { worldId: 'shelf', seed: 104729 });
  run(w, ticks);
  const built = await buildSaveFile(w, { name: 'Garden', savedAt: `t${ticks}`, recipeId: 'FIRST_DISH_V1' });
  return { ...built, tick: ticks };
}

function req(s: Awaited<ReturnType<typeof saveText>>, createdFor = 'try-1'): ShelfRequest {
  return { text: s.text, checksum: s.checksum, name: 'Garden', worldId: 'shelf', tick: s.tick, savedAt: '2026-10-11T00:00:00Z', recipeId: 'FIRST_DISH_V1', createdFor };
}

const accept = async (text: string) => {
  await parseSaveFile(text);
  return true;
};

/** A store as a player has it: the autosave (with predecessor), two named slots and one checkpoint. */
async function playerStore() {
  const backend = new MemoryBackend();
  const store = new SaveStore(backend);
  const s = await saveText(20);
  const base = { text: s.text, checksum: s.checksum, name: 'Garden', tick: 20, recipeId: 'FIRST_DISH_V1' };
  await store.save({ ...base, slotId: AUTOSAVE_SLOT, savedAt: 'a1' });
  await store.save({ ...base, slotId: AUTOSAVE_SLOT, savedAt: 'a2' });
  await store.save({ ...base, slotId: 'slot1', savedAt: 's1' });
  await store.save({ ...base, slotId: 'slot2', savedAt: 's2' });
  const ring = new CheckpointRing(backend, undefined, 'ringw');
  const cp = await ring.write({ ...base, worldId: 'shelf', savedAt: 'c1' });
  expect(cp.ok).toBe(true);
  return { backend, store, s };
}

const snapshotOf = (b: MemoryBackend) => JSON.stringify({ slots: b.slots, records: Object.keys(b.records).sort() });

describe('the shelf', () => {
  it('put → get round trip: the exact save text, an index entry of its own kind', async () => {
    const { backend, store, s } = await playerStore();
    const shelf = new Shelf(backend, undefined, 'tab1');
    const r = await shelf.put('baseline', req(s, 'try-7'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.slot.slotId).toBe('shelf-baseline-00000001-tab1');
    expect(isShelfSlot(r.slot.slotId)).toBe(true);
    expect(shelfKindOf(r.slot.slotId)).toBe('baseline');
    expect(r.slot).toMatchObject({ name: 'Garden', tick: 20, worldId: 'shelf', checksum: s.checksum, automatic: true, shelfKind: 'baseline', createdFor: 'try-7', previous: null });
    expect(r.slot.bytes).toBeGreaterThan(0);
    const got = await shelf.get(r.slot.slotId, accept);
    expect(got?.text).toBe(s.text);
    expect((await shelf.list('baseline')).map((x) => x.slotId)).toEqual([r.slot.slotId]);
    expect(await shelf.list('snapshot')).toEqual([]);
    // SaveStore never shows it, never returns it as a slot, and freeSlot ignores it.
    expect((await store.list()).map((x) => x.slotId)).toEqual(['autosave', 'slot1', 'slot2']);
    expect(await store.slot(r.slot.slotId)).toBeNull();
    expect(await store.freeSlot()).toBe('slot3');
    // The ring never lists it either.
    expect((await new CheckpointRing(backend, undefined, 'ringw').list()).some((x) => isShelfSlot(x.slotId))).toBe(false);
  });

  it('fix round 1: SaveStore.remove refuses a shelf id (only Shelf.remove deletes one); named slots still delete', async () => {
    const { backend, store, s } = await playerStore();
    const shelf = new Shelf(backend, undefined, 'tab1');
    const r = await shelf.put('baseline', req(s));
    if (!r.ok) throw new Error('not put');
    const before = snapshotOf(backend);
    await expect(store.remove(r.slot.slotId)).rejects.toThrow(SHELF_REMOVE_REFUSED);
    // Its words name every kind of shelf record: Try my dish and challenge starting points, snapshot bookmarks.
    expect(SHELF_REMOVE_REFUSED).toMatch(/Try my dish/);
    expect(SHELF_REMOVE_REFUSED).toMatch(/challenge/);
    expect(SHELF_REMOVE_REFUSED).toMatch(/snapshot bookmark/);
    expect(snapshotOf(backend)).toBe(before);
    expect((await shelf.get(r.slot.slotId, accept))?.text).toBe(s.text);
    await store.remove('slot2');
    expect((await store.list()).map((x) => x.slotId)).toEqual(['autosave', 'slot1']);
    expect(await shelf.remove(r.slot.slotId)).toBe(true);
    expect(await shelf.list('baseline')).toEqual([]);
  });

  it('one atomic commit: a failed write changes nothing (slots, autosave, checkpoints untouched)', async () => {
    const { backend, s } = await playerStore();
    const before = snapshotOf(backend);
    let commits = 0;
    const commit = backend.commit.bind(backend);
    backend.commit = (ops) => {
      commits++;
      expect(ops.deleteRecords).toEqual([]); // never deletes anything
      expect(ops.deleteSlots).toEqual([]);
      expect(ops.putRecords).toHaveLength(1);
      expect(ops.putSlots).toHaveLength(1);
      return commit(ops);
    };
    backend.failNextCommit = true;
    const shelf = new Shelf(backend, undefined, 'tab1');
    const r = await shelf.put('baseline', req(s));
    expect(r).toMatchObject({ ok: false, reason: 'write-failed' });
    expect(commits).toBe(1);
    expect(snapshotOf(backend)).toBe(before);
    // The next one goes through in one commit.
    expect((await shelf.put('baseline', req(s))).ok).toBe(true);
    expect(commits).toBe(2);
  });

  it('the storage preflight and the limit refuse with a message and leave everything as it was', async () => {
    const { backend, s } = await playerStore();
    const used = (await backend.usage()).bytes;
    // Room for the record but not one more save of the same size.
    backend.quotaBytes = used + 1.5 * (await gzipText(s.text)).byteLength;
    const shelf = new Shelf(backend, undefined, 'tab1');
    const before = snapshotOf(backend);
    const r = await shelf.put('baseline', req(s));
    expect(r).toMatchObject({ ok: false, reason: 'storage-full' });
    if (!r.ok) expect(r.message).toMatch(/not enough storage space.*Nothing was changed\./);
    expect(snapshotOf(backend)).toBe(before);
    expect(await shelf.check('baseline')).toBeNull(); // the count alone is fine

    // The limit: 10 baselines per device; the 11th is refused, nothing is evicted.
    backend.quotaBytes = null;
    for (let k = 0; k < SHELF_LIMITS.baseline; k++) expect((await shelf.put('baseline', req(s, `try-${k + 1}`))).ok).toBe(true);
    const full = snapshotOf(backend);
    const r11 = await shelf.put('baseline', req(s, 'try-11'));
    expect(r11).toMatchObject({ ok: false, reason: 'full' });
    if (!r11.ok) expect(r11.message).toBe(`This device already keeps 10 starting points for Try my dish and challenges. Remove one you no longer need in Saved dishes → Storage, then try again. Nothing was changed.`);
    expect(await shelf.check('baseline')).toMatchObject({ reason: 'full' });
    expect(snapshotOf(backend)).toBe(full);
    // Another kind has its own limit.
    expect((await shelf.put('snapshot', req(s, 'bm-1'))).ok).toBe(true);
  });

  it('write-once: a second put never replaces a record; remove only by id and only shelf ids', async () => {
    const { backend, s } = await playerStore();
    const shelf = new Shelf(backend, undefined, 'tab1');
    const a = await shelf.put('baseline', req(s, 'try-1'));
    const later = await saveText(40);
    const b = await shelf.put('baseline', req(later, 'try-2'));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.slot.slotId).not.toBe(a.slot.slotId);
    expect((await shelf.get(a.slot.slotId, accept))?.text).toBe(s.text);
    expect((await shelf.get(b.slot.slotId, accept))?.text).toBe(later.text);
    // A second writer with the same token and a taken id is refused, never replacing the first.
    const clash = new Shelf(backend, undefined, 'tab1');
    const realList = clash.list.bind(clash);
    clash.list = async () => (await realList()).filter((x) => x.slotId !== b.slot.slotId); // it believes seq 2 is free
    const c = await clash.put('baseline', req(later, 'try-3'));
    expect(c).toMatchObject({ ok: false, reason: 'write-failed' });
    expect((await shelf.get(b.slot.slotId, accept))?.slot.createdFor).toBe('try-2');
    // remove: only that id; a named slot or the autosave is never a shelf record.
    expect(await shelf.remove('slot1')).toBe(false);
    expect(await shelf.remove(AUTOSAVE_SLOT)).toBe(false);
    expect(await shelf.remove(a.slot.slotId)).toBe(true);
    expect(await shelf.get(a.slot.slotId, accept)).toBeNull();
    expect((await shelf.list()).map((x) => x.slotId)).toEqual([b.slot.slotId]);
    expect(backend.slots.slot1).toBeDefined();
    expect(backend.slots[AUTOSAVE_SLOT]).toBeDefined();
  });

  it('SaveStore.save never writes a shelf id (a shelf record cannot be overwritten through a save)', async () => {
    const { backend, store, s } = await playerStore();
    const shelf = new Shelf(backend, undefined, 'tab1');
    const a = await shelf.put('baseline', req(s));
    if (!a.ok) throw new Error('put failed');
    await expect(store.save({ slotId: a.slot.slotId, text: s.text, checksum: s.checksum, name: 'x', tick: 0, savedAt: 'z', recipeId: null })).rejects.toThrow(/unknown slot/);
  });

  it('a corrupt record makes get() return null, never a fallback to another record', async () => {
    const { backend, s } = await playerStore();
    const shelf = new Shelf(backend, undefined, 'tab1');
    const a = await shelf.put('baseline', req(s, 'try-1'));
    const b = await shelf.put('baseline', req(s, 'try-2'));
    if (!a.ok || !b.ok) throw new Error('put failed');
    // Damaged bytes.
    const rec = backend.records[a.slot.current]!;
    backend.records[a.slot.current] = { ...rec, data: rec.data.slice(0, 10) };
    expect(await shelf.get(a.slot.slotId, accept)).toBeNull();
    // A record whose stored checksum differs from the index's.
    const recB = backend.records[b.slot.current]!;
    backend.records[b.slot.current] = { ...recB, checksum: 'sha256:' + '0'.repeat(64) };
    expect(await shelf.get(b.slot.slotId, accept)).toBeNull();
    // The verifier refuses.
    const c = await shelf.put('baseline', req(s, 'try-3'));
    if (!c.ok) throw new Error('put failed');
    expect(await shelf.get(c.slot.slotId, () => Promise.resolve(false))).toBeNull();
    expect((await shelf.get(c.slot.slotId, accept))?.text).toBe(s.text);
    // A missing record and a non-shelf id.
    delete backend.records[c.slot.current];
    expect(await shelf.get(c.slot.slotId, accept)).toBeNull();
    expect(await shelf.get('slot1', accept)).toBeNull();
    expect(await shelf.get('shelf-baseline-99999999-none', accept)).toBeNull();
  });

  it('the refusals are true for every caller: baselines serve Try my dish and challenges; snapshots are named as such', () => {
    expect(SHELF_TEXT.full('snapshot', 20)).toBe('This device already keeps 20 snapshot bookmarks. Remove one you no longer need in Saved dishes → Storage, then try again. Nothing was changed.');
    expect(SHELF_TEXT.storageFull('baseline', 'd')).toBe('There is not enough storage space for this starting point (d). Nothing was changed.');
    expect(SHELF_TEXT.storageFull('snapshot', 'd')).toBe('There is not enough storage space for this snapshot (d). Nothing was changed.');
    expect(SHELF_TEXT.writeFailed('baseline', 'd')).toBe('The starting point could not be stored (d). Nothing was changed.');
    expect(SHELF_TEXT.writeFailed('snapshot', 'd')).toBe('The snapshot could not be stored (d). Nothing was changed.');
  });

  it('two puts of one kind in flight together get distinct ids and both read back; a failed put does not block the next', async () => {
    const { backend, s } = await playerStore();
    const later = await saveText(40);
    // Reads and commits yield macrotasks (a commit takes 25 ms), so two puts started together would interleave:
    // without the chain both read the index before either commits and choose the same sequence number.
    const later2 = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
    const turns = () => later2(0).then(() => later2(0));
    const slow = Object.create(backend) as MemoryBackend;
    slow.listSlots = async (): Promise<SlotInfo[]> => {
      const v = await backend.listSlots();
      await turns();
      return v;
    };
    slow.getSlot = async (id: string): Promise<SlotInfo | null> => {
      const v = await backend.getSlot(id);
      await turns();
      return v;
    };
    slow.getRecord = async (id: string): Promise<StoredRecord | null> => {
      await turns();
      return backend.getRecord(id);
    };
    slow.commit = async (ops) => {
      await turns();
      await later2(25);
      return backend.commit(ops);
    };
    const shelf = new Shelf(slow, undefined, 'tab1');
    const [a, b] = await Promise.all([shelf.put('baseline', req(s, 'try-1')), shelf.put('baseline', req(later, 'try-2'))]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.slot.slotId).toBe('shelf-baseline-00000001-tab1');
    expect(b.slot.slotId).toBe('shelf-baseline-00000002-tab1');
    const gotA = await shelf.get(a.slot.slotId, accept);
    const gotB = await shelf.get(b.slot.slotId, accept);
    expect(gotA?.text).toBe(s.text);
    expect(gotA?.slot.checksum).toBe(s.checksum);
    expect(gotB?.text).toBe(later.text);
    expect(gotB?.slot.checksum).toBe(later.checksum);
    expect((await shelf.list('baseline')).map((x) => [x.slotId, x.createdFor])).toEqual([
      [a.slot.slotId, 'try-1'],
      [b.slot.slotId, 'try-2'],
    ]);
    // A failed write (its commit throws) is answered as such, and the put queued behind it still goes through.
    backend.failNextCommit = true;
    const [c, d] = await Promise.all([shelf.put('snapshot', req(s, 'bm-1')), shelf.put('snapshot', req(later, 'bm-2'))]);
    expect(c).toMatchObject({ ok: false, reason: 'write-failed' });
    expect(d.ok).toBe(true);
    if (d.ok) expect((await shelf.get(d.slot.slotId, accept))?.text).toBe(later.text);
    // A removal waits its turn too, and a later put does not reuse a removed id's neighbour by mistake.
    const [removed, e] = await Promise.all([shelf.remove(a.slot.slotId), shelf.put('baseline', req(s, 'try-3'))]);
    expect(removed).toBe(true);
    expect(e.ok && e.slot.slotId).toBe('shelf-baseline-00000003-tab1');
    expect((await shelf.list('baseline')).map((x) => x.createdFor)).toEqual(['try-2', 'try-3']);
    // A removal whose commit throws rejects, and the put queued behind it still goes through.
    backend.failNextCommit = true;
    const [f, g] = await Promise.allSettled([shelf.remove(b.slot.slotId), shelf.put('baseline', req(later, 'try-4'))]);
    expect(f.status).toBe('rejected');
    expect(g.status === 'fulfilled' && g.value.ok).toBe(true);
    expect((await shelf.list('baseline')).map((x) => x.createdFor)).toEqual(['try-2', 'try-3', 'try-4']);
  });
});
