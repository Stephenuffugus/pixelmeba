/**
 * P4.8b bookmarks, the gallery and the storage panel through the worker host (DishHost; SPEC §12.8; CT §12.10;
 * D-0070, D-0082, D-0084).
 *
 * - a snapshot bookmark opens as a branch whose stateHash equals the bookmarked moment's, under a new world
 *   id, named as a checkpoint branch, with the open dish kept first and no bookmarks copied (favorites only);
 * - the 21st snapshot on the device refuses with its copy and writes nothing; a failed shelf commit adds no
 *   bookmark; the 51st bookmark is refused; an event row's bookmark names the event's id;
 * - a snapshot removed in Storage leaves the bookmark's text readable and Open answers 'bookmarkGone';
 * - D-0084's release condition: a full baseline shelf (10) and a full snapshot shelf (20) are emptied through
 *   the storage panel's own Remove (src/ui/storage.ts askRemove → confirmRemove → storageRemove → Shelf.remove)
 *   and Try my dish, and Bookmark this moment with a snapshot, work again; deleteSlot keeps refusing shelf ids;
 *   storageRemove refuses named slots and Continue;
 * - bookmarks and the gallery survive Undo and a rollback, and Duplicate copies neither;
 * - never alters behaviour: 50 bookmarks (5 with snapshots) and 100 gallery entries vs none, the same commands,
 *   4×, 3,200 ticks, a save → load in the middle: equal stateHash and full trajectory digest.
 */
import { describe, expect, it } from 'vitest';
import { MemoryBackend, SaveStore, SHELF_REMOVE_REFUSED, type SlotInfo } from '../../src/persistence/store';
import { Shelf } from '../../src/persistence/shelf';
import { buildSaveFile } from '../../src/persistence/saveFile';
import { BOOKMARK_TEXT, bookmarksOf } from '../../src/persistence/notebookBookmarks';
import { encodeGround, galleryOf, GALLERY_TEXT } from '../../src/persistence/notebookGallery';
import { branchName } from '../../src/persistence/checkpoints';
import type { CommandPayload } from '../../src/sim/commands';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, GalleryEntryInput, Speed, ToWorker } from '../../src/worker/protocol';
import { askRemove, confirmRemove, refreshStorage, storageInfoNow, type StorageClient } from '../../src/ui/storage';
import { notebookAfterRestore } from '../../src/worker/notebookWatch';
import { trajectoryDigest } from '../helpers/trajectory';
import { registry } from '../helpers/world';

const REG = registry();
const ISO = '2026-10-11T00:00:00.000Z';
const SUGAR: CommandPayload = { kind: 'deposit', materialId: 'SUGAR', points: [[64, 64]], radius: 3, dose: 0.5 };

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
  reply(requestId: number): FromWorker {
    const r = this.out.find((m) => (m as { requestId?: number }).requestId === requestId);
    if (!r) throw new Error(`no answer to ${requestId}`);
    return r;
  }
  send(msg: ToWorker): FromWorker {
    this.host.handle(msg);
    return this.reply((msg as { requestId: number }).requestId);
  }
  async sendAsync(msg: ToWorker): Promise<FromWorker> {
    await this.host.handleAsync(msg);
    return this.reply((msg as { requestId: number }).requestId);
  }
  create(dishId: string) {
    this.send({ type: 'create', requestId: this.id(), dishId, source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' }, name: 'Little Living Garden' });
    return this.host.world(dishId)!;
  }
  hash(dishId: string): string {
    const r = this.send({ type: 'hash', requestId: this.id(), dishId });
    if (r.type !== 'hash') throw new Error('no hash');
    return r.hash;
  }
  async bookmark(dishId: string, snapshot: boolean, title = '') {
    const r = await this.sendAsync({ type: 'bookmarkAdd', requestId: this.id(), dishId, title, snapshot, event: null });
    if (r.type !== 'notebook') throw new Error(`not a notebook answer: ${JSON.stringify(r)}`);
    return r;
  }
  gallery(dishId: string, entry: GalleryEntryInput) {
    const r = this.send({ type: 'galleryAdd', requestId: this.id(), dishId, entry });
    if (r.type !== 'notebook') throw new Error(`not a notebook answer: ${JSON.stringify(r)}`);
    return r;
  }
  notebook(dishId: string) {
    const r = this.send({ type: 'notebookGet', requestId: this.id(), dishId });
    if (r.type !== 'notebook') throw new Error('no notebook');
    return r.record;
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
  command(dishId: string, commandId: string, payload: CommandPayload): void {
    const r = this.send({ type: 'command', requestId: this.id(), dishId, commandId, payload, undoable: true });
    expect(r.type).toBe('ack');
  }
  shelf(kind?: 'baseline' | 'snapshot'): SlotInfo[] {
    return Object.values(this.backend.slots).filter((s) => s.slotId.startsWith(kind ? `shelf-${kind}-` : 'shelf-'));
  }
  storeText(): string {
    return JSON.stringify([Object.keys(this.backend.records).sort(), Object.keys(this.backend.slots).sort()]);
  }
  /** The storage panel's client, speaking the protocol to this host. */
  storageClient(): StorageClient {
    return {
      storageInfo: async () => {
        const r = await this.sendAsync({ type: 'storageInfo', requestId: this.id() });
        if (r.type !== 'storageInfo') throw new Error((r as { message?: string }).message ?? r.type);
        return r.storage;
      },
      storageRemove: async (slotId) => {
        const r = await this.sendAsync({ type: 'storageRemove', requestId: this.id(), slotId });
        if (r.type !== 'storageInfo') throw new Error((r as { message?: string }).message ?? r.type);
        return { storage: r.storage, removed: r.removed === true };
      },
    };
  }
}

/** A small valid gallery entry for the Garden (species 0, organism 1). */
function entry(w: { species: readonly { id: string }[] }, tick = 0): GalleryEntryInput {
  return { tick, speciesId: w.species[0]!.id, birthId: 1, summary: ['Sprinter #1', 'moving · age 0 s · generation 0'], crop: { x0: 40, y0: 50, cells: 16, sprites: [[0, 8, 8, 1]], substrate: encodeGround(new Uint8Array(256)) } };
}

/** Fill the shelf with `n` records of `kind` (written directly, as earlier sessions would have). */
async function fillShelf(h: Driver, kind: 'baseline' | 'snapshot', n: number): Promise<void> {
  const shelf = new Shelf(h.backend, undefined, 'seed');
  const w = realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: 'filler' });
  const built = await buildSaveFile(w, { name: 'Filler', savedAt: ISO, recipeId: 'FIRST_DISH_V1' });
  for (let i = 0; i < n; i++) {
    const r = await shelf.put(kind, { text: built.text, checksum: built.checksum, name: `Filler ${i}`, worldId: 'filler', tick: 0, savedAt: ISO, recipeId: 'FIRST_DISH_V1', createdFor: kind === 'baseline' ? `try-${i + 1}` : `bm-${i + 1}` });
    expect(r.ok).toBe(true);
  }
}

describe('snapshot bookmarks through DishHost', () => {
  it('a snapshot bookmark opens as a branch whose stateHash equals the bookmarked moment’s, under a new world id', async () => {
    const h = new Driver();
    const w = h.create('d1');
    h.runTo('d1', 4, 300);
    const at = h.hash('d1');
    const r = await h.bookmark('d1', true);
    expect(r.refused).toBeUndefined();
    const [bm] = bookmarksOf(r.record);
    expect(bm).toMatchObject({ id: 'bm-1', tick: 300, title: 'Little Living Garden at 0:30', eventId: null, createdTick: 300 });
    expect(bm!.summary).toMatch(/^At 0:30: \d+ alive — /);
    expect(bm!.snapshot!.shelfId).toMatch(/^shelf-snapshot-00000001-/);
    expect(h.shelf('snapshot')).toHaveLength(1);
    expect(h.hash('d1')).toBe(at); // bookmarking changed nothing in the dish
    h.runTo('d1', 4, 500);
    const opened = await h.sendAsync({ type: 'bookmarkOpen', requestId: h.id(), dishId: 'd1', id: 'bm-1', newDishId: 'b1', keepFrom: { dishId: 'd1', keep: { kind: 'auto' } } });
    if (opened.type !== 'loaded') throw new Error(JSON.stringify(opened));
    expect(opened.branch).toEqual({ fromName: 'Little Living Garden', tick: 300 });
    expect(opened.info.name).toBe(branchName('Little Living Garden', 300));
    expect(opened.kept).toBeDefined(); // the open dish was kept first (D-0033)
    const b = h.host.world('b1')!;
    expect(b.tick).toBe(300);
    expect(b.worldId).not.toBe(w.worldId);
    expect(b.worldId.startsWith(`${w.worldId.split('+')[0]}+`)).toBe(true);
    expect(stateHash(b)).toBe(at);
    // The branch carries the favorites only (D-0031, D-0073): no bookmarks, no gallery.
    const nb = h.notebook('b1');
    expect(bookmarksOf(nb)).toEqual([]);
    expect(galleryOf(nb)).toEqual([]);
  });

  it('the 21st snapshot on this device refuses with its copy and writes nothing; a failed shelf commit adds no bookmark', async () => {
    const h = new Driver();
    h.create('d1');
    await fillShelf(h, 'snapshot', 20);
    const before = h.storeText();
    const r = await h.bookmark('d1', true);
    expect(r.refused).toBe('20 snapshot bookmarks are stored on this device. Remove one in Saved dishes → Storage, or save a text bookmark.');
    expect(bookmarksOf(r.record)).toEqual([]);
    expect(h.storeText()).toBe(before);
    // A text bookmark still fits.
    expect((await h.bookmark('d1', false)).refused).toBeUndefined();

    const h2 = new Driver();
    h2.create('d1');
    h2.backend.failNextCommit = true;
    const before2 = h2.storeText();
    const f = await h2.bookmark('d1', true);
    expect(f.refused).toMatch(/^The snapshot could not be stored \(.*\)\. No bookmark was added\.$/);
    expect(bookmarksOf(h2.notebook('d1'))).toEqual([]);
    expect(h2.storeText()).toBe(before2);
  });

  it('the 51st bookmark is refused, never a silent removal; an event row names its recorded event', async () => {
    const h = new Driver();
    const w = h.create('d1');
    h.runTo('d1', 4, 400);
    const birth = w.events.ring.find((e) => e.type === 'birth')!;
    expect(birth).toBeDefined();
    const ev = await h.sendAsync({
      type: 'bookmarkAdd',
      requestId: h.id(),
      dishId: 'd1',
      title: 'A Sprinter split in two.',
      snapshot: false,
      event: { tick: birth.tick, type: 'birth', species: birth.species!, cause: null, text: 'A Sprinter split in two.' },
    });
    if (ev.type !== 'notebook') throw new Error('no answer');
    const first = bookmarksOf(ev.record)[0]!;
    expect(first.eventId).toBe(birth.id);
    expect(first.summary).toBe(`A Sprinter split in two at ${Math.floor(birth.tick / 600)}:${String(Math.floor(birth.tick / 10) % 60).padStart(2, '0')} (event ${birth.id}).`);
    expect(first.snapshot).toBeNull();
    for (let i = 1; i < 50; i++) expect((await h.bookmark('d1', false)).refused).toBeUndefined();
    const r = await h.bookmark('d1', false);
    expect(r.refused).toBe('This dish keeps 50 bookmarks. Delete one to add another.');
    expect(bookmarksOf(r.record)).toHaveLength(50);
    expect(bookmarksOf(r.record)[0]!.id).toBe('bm-1');
    // Delete one, then one more fits.
    const del = h.send({ type: 'bookmarkDelete', requestId: h.id(), dishId: 'd1', id: 'bm-3' });
    if (del.type !== 'notebook') throw new Error('no answer');
    expect(bookmarksOf(del.record)).toHaveLength(49);
    expect((await h.bookmark('d1', false)).refused).toBeUndefined();
  });

  it('a snapshot removed in Storage leaves the bookmark text readable; Open answers that the snapshot is gone', async () => {
    const h = new Driver();
    h.create('d1');
    h.runTo('d1', 4, 100);
    const bm = bookmarksOf((await h.bookmark('d1', true, 'Before the bloom')).record)[0]!;
    const client = h.storageClient();
    await refreshStorage(client);
    expect(storageInfoNow.value!.shelf.map((r) => r.slotId)).toEqual([bm.snapshot!.shelfId]);
    expect(askRemove(bm.snapshot!.shelfId)).toBe(true);
    expect(h.shelf('snapshot')).toHaveLength(1); // asking removes nothing
    expect(await confirmRemove(client)).toBe(true);
    expect(h.shelf('snapshot')).toHaveLength(0);
    const kept = bookmarksOf(h.notebook('d1'))[0]!;
    expect(kept).toEqual(bm);
    const r = await h.sendAsync({ type: 'bookmarkOpen', requestId: h.id(), dishId: 'd1', id: bm.id, newDishId: 'b1' });
    expect(r).toMatchObject({ type: 'bookmarkGone', id: bm.id, message: 'Its snapshot was removed or could not be read. The bookmark text is kept.' });
    expect(h.host.world('b1') ?? null).toBeNull();
    expect(bookmarksOf(h.notebook('d1'))).toEqual([bm]);
  });
});

describe('the storage panel (D-0084 release condition)', () => {
  it('a full baseline shelf is emptied through the panel’s Remove and Try my dish starts again; deleteSlot keeps refusing shelf ids', async () => {
    const h = new Driver();
    h.create('d1');
    await fillShelf(h, 'baseline', 10);
    const s1 = await h.sendAsync({ type: 'trySetup', requestId: h.id(), dishId: 'd1' });
    if (s1.type !== 'trySetup') throw new Error(JSON.stringify(s1));
    expect(s1.refusal).toMatch(/already keeps 10 Try my dish starting points/);
    const [first] = h.shelf('baseline');
    const del = await h.sendAsync({ type: 'deleteSlot', requestId: h.id(), slotId: first!.slotId });
    expect(del).toMatchObject({ type: 'error', message: SHELF_REMOVE_REFUSED });
    expect(h.shelf('baseline')).toHaveLength(10);
    const client = h.storageClient();
    await refreshStorage(client);
    for (const row of storageInfoNow.value!.shelf.filter((r) => r.kind === 'baseline')) {
      expect(askRemove(row.slotId)).toBe(true);
      expect(await confirmRemove(client)).toBe(true);
    }
    expect(h.shelf('baseline')).toHaveLength(0);
    const s2 = await h.sendAsync({ type: 'trySetup', requestId: h.id(), dishId: 'd1' });
    if (s2.type !== 'trySetup') throw new Error('no setup');
    expect(s2.refusal).toBeNull();
    const t = await h.sendAsync({ type: 'tryStart', requestId: h.id(), dishId: 'd1', newDishId: 't1', objectiveId: null, horizonSeconds: 60, prediction: '' });
    expect(t.type).toBe('tryStarted');
  });

  it('a full snapshot shelf is emptied the same way and Bookmark this moment with a snapshot works again', async () => {
    const h = new Driver();
    h.create('d1');
    await fillShelf(h, 'snapshot', 20);
    expect((await h.bookmark('d1', true)).refused).toBe(BOOKMARK_TEXT.snapshotsFull);
    const client = h.storageClient();
    await refreshStorage(client);
    for (const row of storageInfoNow.value!.shelf) {
      expect(askRemove(row.slotId)).toBe(true);
      expect(await confirmRemove(client)).toBe(true);
    }
    expect(h.shelf('snapshot')).toHaveLength(0);
    const r = await h.bookmark('d1', true);
    expect(r.refused).toBeUndefined();
    expect(bookmarksOf(r.record)[0]!.snapshot).not.toBeNull();
  });

  it('storageRemove never removes a named slot or Continue; storageInfo lists every group with sizes', async () => {
    const h = new Driver();
    h.create('d1');
    await h.sendAsync({ type: 'saveSlot', requestId: h.id(), dishId: 'd1', slotId: 'slot1', name: 'Mine' });
    await h.sendAsync({ type: 'saveSlot', requestId: h.id(), dishId: 'd1', slotId: 'slot1', name: 'Mine' });
    await h.sendAsync({ type: 'autosave', requestId: h.id(), dishId: 'd1' });
    await h.bookmark('d1', true);
    const before = h.storeText();
    for (const slotId of ['slot1', 'autosave']) {
      const r = await h.sendAsync({ type: 'storageRemove', requestId: h.id(), slotId });
      expect(r).toMatchObject({ type: 'error' });
      expect((r as { message: string }).message).toMatch(/Storage never removes them/);
    }
    expect(h.storeText()).toBe(before);
    const info = await h.storageClient().storageInfo();
    expect(info.slots.map((r) => [r.slotId, r.kind])).toEqual([
      ['autosave', 'autosave'],
      ['slot1', 'slot'],
    ]);
    const slot1 = info.slots.find((r) => r.slotId === 'slot1')!;
    expect(slot1.bytes).toBeGreaterThan(0);
    expect(slot1.previousBytes).toBeGreaterThan(0); // its kept previous copy is counted
    expect(info.shelf.map((r) => r.kind)).toEqual(['snapshot']);
    expect(info.shelf[0]!.createdFor).toBe('bm-1');
    expect(info.estimate).toBeNull(); // no browser estimate in this host
  });
});

describe('bookmarks and the gallery are notebook state', () => {
  it('they survive Undo and a rollback; Duplicate copies neither; the gallery refuses its 101st entry', async () => {
    const h = new Driver();
    const w = h.create('d1');
    h.runTo('d1', 4, 100);
    h.command('d1', 'sugar', SUGAR);
    await h.bookmark('d1', false, 'After the sugar');
    expect(h.gallery('d1', entry(w, 100)).refused).toBeUndefined();
    const hash = h.hash('d1');
    const undo = h.send({ type: 'undo', requestId: h.id(), dishId: 'd1' });
    expect(undo).toMatchObject({ type: 'ack' });
    expect(h.hash('d1')).not.toBe(hash);
    const nb = h.notebook('d1');
    expect(bookmarksOf(nb).map((b) => b.title)).toEqual(['After the sugar']);
    expect(galleryOf(nb)).toHaveLength(1);
    // A rollback takes the same path (host.rollback → restoreNotebook → notebookAfterRestore): both kinds are kept as they are.
    for (const cause of ['undo', 'rollback'] as const) {
      const after = notebookAfterRestore(h.host.world('d1')!, nb, cause);
      expect(bookmarksOf(after.record)).toEqual(bookmarksOf(nb));
      expect(galleryOf(after.record)).toEqual(galleryOf(nb));
    }
    // Duplicate: favorites only.
    const dup = h.send({ type: 'duplicate', requestId: h.id(), dishId: 'd1', newDishId: 'c1' });
    expect(dup.type).toBe('ready');
    expect(bookmarksOf(h.notebook('c1'))).toEqual([]);
    expect(galleryOf(h.notebook('c1'))).toEqual([]);
    // A specimen naming an organism the dish never had is refused (nothing is added).
    const never = h.gallery('d1', { ...entry(w), birthId: h.host.world('d1')!.counters.nextBirthId + 10 });
    expect(never.refused).toMatch(/could not be saved/);
    expect(galleryOf(never.record)).toHaveLength(1);
    for (let i = 1; i < 100; i++) expect(h.gallery('d1', entry(w)).refused).toBeUndefined();
    const full = h.gallery('d1', entry(w));
    expect(full.refused).toBe(GALLERY_TEXT.full);
    expect(full.refused).toBe('This dish keeps 100 gallery specimens. Delete one to add another.');
    expect(galleryOf(full.record)).toHaveLength(100);
  });
});

describe('bookmarks and the gallery never alter behaviour', () => {
  async function scenario(withNotes: boolean): Promise<{ hash: string; digest: string; tick: number; bookmarks: number; gallery: number }> {
    const h = new Driver();
    const w = h.create('d1');
    const notes = async (snapshots: number, n: number, g: number) => {
      if (!withNotes) return;
      for (let i = 0; i < n; i++) expect((await h.bookmark('d1', i < snapshots)).refused).toBeUndefined();
      for (let i = 0; i < g; i++) expect(h.gallery('d1', entry(w, h.host.world('d1')!.tick)).refused).toBeUndefined();
    };
    await notes(2, 10, 30);
    h.runTo('d1', 4, 700);
    h.command('d1', 'sugar', SUGAR);
    await notes(2, 20, 30);
    h.runTo('d1', 4, 1500);
    h.command('d1', 'sugar2', { kind: 'deposit', materialId: 'SUGAR', points: [[40, 70]], radius: 2, dose: 0.5 });
    h.send({ type: 'undo', requestId: h.id(), dishId: 'd1' });
    await notes(1, 20, 40);
    // Save → load in the middle.
    await h.sendAsync({ type: 'saveSlot', requestId: h.id(), dishId: 'd1', slotId: 'slot1', name: 'Fence' });
    const loaded = await h.sendAsync({ type: 'loadSlot', requestId: h.id(), slotId: 'slot1', newDishId: 'd2' });
    expect(loaded.type).toBe('loaded');
    h.host.handle({ type: 'dispose', dishId: 'd1' });
    const nb = h.notebook('d2');
    h.runTo('d2', 4, 3200);
    const w2 = h.host.world('d2')!;
    return { hash: stateHash(w2), digest: trajectoryDigest(w2, 'full'), tick: w2.tick, bookmarks: bookmarksOf(nb).length, gallery: galleryOf(nb).length };
  }

  it('50 bookmarks (5 with snapshots) and 100 gallery entries vs none, 4×, 3,200 ticks, a save → load in the middle: equal stateHash and full trajectory digest', async () => {
    const plain = await scenario(false);
    const noted = await scenario(true);
    expect(noted.tick).toBe(3200);
    expect(noted.bookmarks).toBe(50);
    expect(noted.gallery).toBe(100);
    expect(plain.bookmarks).toBe(0);
    expect(noted.hash).toBe(plain.hash);
    expect(noted.digest).toBe(plain.digest);
  }, 600_000);
});
