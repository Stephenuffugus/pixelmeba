/**
 * P4.10 (D-0092): one StorageBackend contract, run against every backend the app uses (MemoryBackend, and
 * FilesystemBackend over MemoryFsOps in tests/persistence/capacitor-fs.test.ts). It states what SaveStore,
 * the checkpoint ring and the shelf rely on: a save keeps one predecessor, a corrupt current record falls
 * back to it, remove removes, list lists, the ring and the shelf commit atomically, and a failed or
 * out-of-space commit changes nothing.
 */
import { describe, expect, it } from 'vitest';
import { CheckpointRing, CHECKPOINT_RING_SIZE } from '../../src/persistence/checkpoints';
import { Shelf } from '../../src/persistence/shelf';
import { AUTOSAVE_SLOT, isStorageFull, SaveStore, type SaveRequest, type SlotInfo, type StorageBackend } from '../../src/persistence/store';

export interface ContractHarness {
  readonly backend: StorageBackend;
  /** The next commit fails (an ordinary write failure). */
  failNextCommit(): void;
  /** From now on the store refuses any commit that would leave it holding more than `extraBytes` more than now. */
  limitTo(extraBytes: number): Promise<void>;
  /** Damage a stored record so it no longer reads as the record that was saved. */
  corruptRecord(recordId: string): Promise<void>;
}

/** Save texts are plain strings here: `verify` accepts what starts with "SAVE ". */
export const verifyText = (t: string): Promise<boolean> => Promise.resolve(t.startsWith('SAVE '));

let clock = 0;
/** A save request for `slotId` holding `text` (distinct times, so distinct record ids). */
export function req(slotId: string, text: string): SaveRequest {
  clock++;
  return {
    slotId,
    text: `SAVE ${text}`,
    checksum: `sha256:${text}`,
    name: `Dish ${text}`,
    tick: clock,
    savedAt: new Date(Date.UTC(2026, 9, 12, 0, 0, clock)).toISOString(),
    recipeId: 'FIRST_DISH_V1',
    worldId: `w-${text}`,
  };
}

async function loadText(store: SaveStore, slotId: string): Promise<{ text: string; usedPredecessor: boolean } | null> {
  return store.load(slotId, verifyText);
}

function ckReq(text: string, tick: number) {
  return { text: `SAVE ${text}`, checksum: `sha256:${text}`, name: 'Dish', worldId: 'w', tick, savedAt: new Date(Date.UTC(2026, 9, 12, 1, 0, tick)).toISOString(), recipeId: null };
}

export function backendContract(label: string, make: () => Promise<ContractHarness>): void {
  describe(`StorageBackend contract: ${label}`, () => {
    it('save → load returns the exact text; list shows the slot', async () => {
      const h = await make();
      const store = new SaveStore(h.backend);
      const info = await store.save(req('slot1', 'A'));
      expect(await loadText(store, 'slot1')).toEqual({ text: 'SAVE A', usedPredecessor: false });
      expect((await store.list()).map((s) => s.slotId)).toEqual(['slot1']);
      expect(await h.backend.getSlot('slot1')).toEqual(info);
    });

    it('keeps exactly one predecessor and falls back to it when the current record is corrupt', async () => {
      const h = await make();
      const store = new SaveStore(h.backend);
      const a = await store.save(req('slot1', 'A'));
      const b = await store.save(req('slot1', 'B'));
      const c = await store.save(req('slot1', 'C'));
      expect(c.previous).toBe(b.current);
      expect(await h.backend.getRecord(a.current)).toBeNull(); // older than the predecessor: removed in the same commit
      expect(await h.backend.getRecord(b.current)).not.toBeNull();
      await h.corruptRecord(c.current);
      expect(await loadText(store, 'slot1')).toEqual({ text: 'SAVE B', usedPredecessor: true });
    });

    it('remove deletes the slot and both of its records; other slots stay', async () => {
      const h = await make();
      const store = new SaveStore(h.backend);
      await store.save(req('slot1', 'A'));
      const b = await store.save(req('slot1', 'B'));
      await store.save(req('slot2', 'X'));
      await store.remove('slot1');
      expect(await h.backend.getSlot('slot1')).toBeNull();
      expect(await h.backend.getRecord(b.current)).toBeNull();
      expect(await h.backend.getRecord(b.previous!)).toBeNull();
      expect(await loadText(store, 'slot2')).toEqual({ text: 'SAVE X', usedPredecessor: false });
    });

    it('lists named slots and the autosave apart from checkpoints and shelf records', async () => {
      const h = await make();
      const store = new SaveStore(h.backend);
      await store.save(req('slot3', 'C'));
      await store.save(req(AUTOSAVE_SLOT, 'auto'));
      await store.save(req('slot1', 'A'));
      await new CheckpointRing(h.backend, undefined, 'tester').write(ckReq('ck', 600));
      await new Shelf(h.backend, undefined, 'tester').put('snapshot', { ...ckReq('shelf', 700), createdFor: 'bm-1' });
      expect((await store.list()).map((s) => s.slotId)).toEqual(['autosave', 'slot1', 'slot3']);
      expect((await h.backend.listSlots()).length).toBe(5);
      expect(await store.freeSlot()).toBe('slot2');
    });

    it('the checkpoint ring commits a checkpoint and the eviction of the oldest in one commit', async () => {
      const h = await make();
      const store = new SaveStore(h.backend);
      await store.save(req('slot1', 'named'));
      const ring = new CheckpointRing(h.backend, undefined, 'tester');
      const written: SlotInfo[] = [];
      for (let i = 0; i < CHECKPOINT_RING_SIZE + 1; i++) {
        const r = await ring.write(ckReq(`ck${i}`, 600 * (i + 1)));
        expect(r.ok).toBe(true);
        if (r.ok) written.push(r.slot);
      }
      const held = await ring.list();
      expect(held.length).toBe(CHECKPOINT_RING_SIZE);
      expect(held.map((s) => s.slotId)).not.toContain(written[0]!.slotId);
      expect(await h.backend.getRecord(written[0]!.current)).toBeNull();
      expect((await store.load(written[CHECKPOINT_RING_SIZE]!.slotId, verifyText))?.text).toBe(`SAVE ck${CHECKPOINT_RING_SIZE}`);
      expect((await loadText(store, 'slot1'))?.text).toBe('SAVE named');
    });

    it('the shelf commits one write-once record that reads back', async () => {
      const h = await make();
      const shelf = new Shelf(h.backend, undefined, 'tester');
      const r = await shelf.put('baseline', { ...ckReq('base', 300), createdFor: 'try-1' });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const got = await shelf.get(r.slot.slotId, (t) => verifyText(t));
      expect(got?.text).toBe('SAVE base');
      expect(await shelf.remove(r.slot.slotId)).toBe(true);
      expect(await h.backend.getSlot(r.slot.slotId)).toBeNull();
      expect(await h.backend.getRecord(r.slot.current)).toBeNull();
    });

    it('a failed commit keeps everything: the slot, its records and the other slots', async () => {
      const h = await make();
      const store = new SaveStore(h.backend);
      await store.save(req('slot1', 'A'));
      const b = await store.save(req('slot1', 'B'));
      await store.save(req('slot2', 'X'));
      const before = await h.backend.listSlots();
      h.failNextCommit();
      await expect(store.save(req('slot1', 'C'))).rejects.toThrow();
      expect(await h.backend.getSlot('slot1')).toEqual(b);
      expect(await loadText(store, 'slot1')).toEqual({ text: 'SAVE B', usedPredecessor: false });
      expect(await h.backend.getRecord(b.previous!)).not.toBeNull();
      expect(sortById(await h.backend.listSlots())).toEqual(sortById(before));
    });

    it('an out-of-space commit fails with StorageFullError (isStorageFull) and keeps everything', async () => {
      const h = await make();
      const store = new SaveStore(h.backend);
      const a = await store.save(req('slot1', 'A'));
      await h.limitTo(16);
      const big = req('slot1', noise(6000, 1));
      let caught: unknown = null;
      try {
        await store.save(big);
      } catch (e) {
        caught = e;
      }
      expect(isStorageFull(caught)).toBe(true);
      expect(await h.backend.getSlot('slot1')).toEqual(a);
      expect(await loadText(store, 'slot1')).toEqual({ text: 'SAVE A', usedPredecessor: false });
      const ring = await new CheckpointRing(h.backend, undefined, 'tester').write(ckReq(noise(6000, 2), 600));
      expect(ring).toMatchObject({ ok: false, reason: 'storage-full', kept: 0 });
    });
  });
}

/** Text that does not compress much (a fixed LCG; deterministic). */
export function noise(n: number, seed: number): string {
  let x = seed >>> 0 || 1;
  let out = '';
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    out += String.fromCharCode(33 + (x >>> 24) % 90);
  }
  return out;
}

function sortById(s: SlotInfo[]): SlotInfo[] {
  return [...s].sort((a, b) => (a.slotId < b.slotId ? -1 : 1));
}
