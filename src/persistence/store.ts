/**
 * Save slots (SPEC §14.2, ARCH §11.1): ten named slots plus one rolling autosave, each keeping its
 * most recent valid predecessor. A write is one atomic backend transaction: the new record and the
 * updated slot pointer land together or not at all, so a failed write can never lose the previous
 * save. Records are gzip-compressed save-file text.
 */
import { gunzipText, gzipText } from './compress';
import type { SaveMetaVariant } from './saveFile';
import type { SaveMetaEvolution, SaveMetaRegistry } from './saveFile';

export const NAMED_SLOTS = 10;
export const AUTOSAVE_SLOT = 'autosave';

export interface SlotInfo {
  readonly slotId: string;
  readonly name: string;
  readonly tick: number;
  readonly savedAt: string;
  readonly recipeId: string | null;
  readonly current: string;
  readonly previous: string | null;
  readonly bytes: number;
  readonly checksum: string;
  /**
   * What if? (P2.6): a copy of the save file's meta.variant, kept in the index so the Saved dishes list
   * can name the idea without loading the world. Optional: indexes written before it lack it, and it
   * is re-validated when read (the file's own world record stays authoritative).
   */
  readonly variant?: SaveMetaVariant;
  /**
   * P2.8: an automatic checkpoint of the checkpoint ring (src/persistence/checkpoints.ts), never a named
   * slot or the autosave. Absent on every other slot.
   */
  readonly automatic?: true;
  /** P2.8: the world id of the dish a checkpoint holds (automatic checkpoints only). */
  readonly worldId?: string;
  /**
   * P2.2: copies of the save file's meta.evolution and meta.registry, so Saved dishes and Continue can
   * state the world's mode labels (UX §3.3) without loading it. Optional (indexes written before lack
   * them) and re-validated when read; the file's own world record stays authoritative.
   */
  readonly evolution?: SaveMetaEvolution;
  readonly registry?: SaveMetaRegistry;
}

export interface StoredRecord {
  readonly recordId: string;
  readonly data: Uint8Array;
  readonly checksum: string;
}

/** Storage backend: must apply `commit` atomically (all puts/deletes or none). */
export interface StorageBackend {
  getSlot(slotId: string): Promise<SlotInfo | null>;
  listSlots(): Promise<SlotInfo[]>;
  getRecord(recordId: string): Promise<StoredRecord | null>;
  commit(ops: { putRecords: StoredRecord[]; putSlots: SlotInfo[]; deleteRecords: string[]; deleteSlots: string[] }): Promise<void>;
  /** Bytes used and the limit, when the backend knows them (P2.8: checked before an automatic checkpoint). */
  usage?(): Promise<{ readonly bytes: number; readonly quota: number | null }>;
}

/** Slot ids of automatic checkpoints start with this (src/persistence/checkpoints.ts). */
export const CHECKPOINT_SLOT_PREFIX = 'checkpoint-';

/** Whether a slot id belongs to the automatic checkpoint ring (never a named slot or the autosave). */
export function isCheckpointSlot(slotId: string): boolean {
  return slotId.startsWith(CHECKPOINT_SLOT_PREFIX);
}

export interface SaveRequest {
  readonly slotId: string;
  readonly text: string;
  readonly checksum: string;
  readonly name: string;
  readonly tick: number;
  readonly savedAt: string;
  readonly recipeId: string | null;
  /** The file's meta.variant, when it has one (copied into the slot index). */
  readonly variant?: SaveMetaVariant;
  /** P2.2: the file's meta.evolution and meta.registry (copied into the slot index). */
  readonly evolution?: SaveMetaEvolution;
  readonly registry?: SaveMetaRegistry;
}

let recordCounter = 0;

export class SaveStore {
  /** The backend is shared with the checkpoint ring, which writes through the same atomic commit (P2.8). */
  constructor(readonly backend: StorageBackend) {}

  static slotIds(): string[] {
    return Array.from({ length: NAMED_SLOTS }, (_, i) => `slot${i + 1}`);
  }

  /** Named slots and the autosave (automatic checkpoints are listed by the ring, P2.8). */
  async list(): Promise<SlotInfo[]> {
    return (await this.backend.listSlots()).filter((s) => !isCheckpointSlot(s.slotId)).sort((a, b) => (a.slotId < b.slotId ? -1 : a.slotId > b.slotId ? 1 : 0));
  }

  async save(req: SaveRequest): Promise<SlotInfo> {
    if (req.slotId !== AUTOSAVE_SLOT && !SaveStore.slotIds().includes(req.slotId)) throw new Error(`unknown slot ${req.slotId}`);
    const data = await gzipText(req.text);
    const recordId = `${req.slotId}:${req.savedAt}:${(++recordCounter).toString(36)}`;
    const old = await this.backend.getSlot(req.slotId);
    const info: SlotInfo = {
      slotId: req.slotId,
      name: req.name,
      tick: req.tick,
      savedAt: req.savedAt,
      recipeId: req.recipeId,
      current: recordId,
      previous: old?.current ?? null,
      bytes: data.byteLength,
      checksum: req.checksum,
      ...(req.variant ? { variant: req.variant } : {}),
      ...(req.evolution ? { evolution: req.evolution } : {}),
      ...(req.registry ? { registry: req.registry } : {}),
    };
    // The record older than the retained predecessor is removed in the same transaction.
    const deleteRecords = old?.previous ? [old.previous] : [];
    await this.backend.commit({ putRecords: [{ recordId, data, checksum: req.checksum }], putSlots: [info], deleteRecords, deleteSlots: [] });
    return info;
  }

  /** Load a slot's current save text; falls back to the predecessor if the current record is unreadable. */
  async load(slotId: string, verify: (text: string) => Promise<boolean>): Promise<{ text: string; usedPredecessor: boolean } | null> {
    const slot = await this.backend.getSlot(slotId);
    if (!slot) return null;
    for (const [recordId, usedPredecessor] of [
      [slot.current, false],
      [slot.previous, true],
    ] as const) {
      if (!recordId) continue;
      const rec = await this.backend.getRecord(recordId);
      if (!rec) continue;
      try {
        const text = await gunzipText(rec.data);
        if (await verify(text)) return { text, usedPredecessor };
      } catch {
        // corrupted record: try the predecessor
      }
    }
    return null;
  }

  async remove(slotId: string): Promise<void> {
    const slot = await this.backend.getSlot(slotId);
    if (!slot) return;
    await this.backend.commit({ putRecords: [], putSlots: [], deleteRecords: [slot.current, ...(slot.previous ? [slot.previous] : [])], deleteSlots: [slotId] });
  }

  /** First free named slot, or null when all ten are used. */
  async freeSlot(): Promise<string | null> {
    const used = new Set((await this.backend.listSlots()).map((s) => s.slotId));
    return SaveStore.slotIds().find((id) => !used.has(id)) ?? null;
  }
}

/** An error shaped like the browser's QuotaExceededError (the store refused a write for lack of space). */
export class StorageFullError extends Error {
  override readonly name = 'QuotaExceededError';
}

/** True when a backend error means the store is out of space (IndexedDB QuotaExceededError or StorageFullError). */
export function isStorageFull(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'QuotaExceededError';
}

/**
 * In-memory backend (tests; also a fallback when IndexedDB is unavailable). Can inject failures, and
 * with `quotaBytes` set it refuses (atomically) any commit that would hold more record bytes (P2.8).
 */
export class MemoryBackend implements StorageBackend {
  readonly slots: Record<string, SlotInfo> = {};
  readonly records: Record<string, StoredRecord> = {};
  failNextCommit = false;
  quotaBytes: number | null = null;

  usage(): Promise<{ readonly bytes: number; readonly quota: number | null }> {
    let bytes = 0;
    for (const id of Object.keys(this.records).sort()) bytes += this.records[id]!.data.byteLength;
    return Promise.resolve({ bytes, quota: this.quotaBytes });
  }

  getSlot(slotId: string): Promise<SlotInfo | null> {
    return Promise.resolve(this.slots[slotId] ?? null);
  }
  listSlots(): Promise<SlotInfo[]> {
    return Promise.resolve(Object.values(this.slots));
  }
  getRecord(recordId: string): Promise<StoredRecord | null> {
    return Promise.resolve(this.records[recordId] ?? null);
  }
  commit(ops: { putRecords: StoredRecord[]; putSlots: SlotInfo[]; deleteRecords: string[]; deleteSlots: string[] }): Promise<void> {
    if (this.failNextCommit) {
      this.failNextCommit = false;
      return Promise.reject(new Error('simulated write failure'));
    }
    if (this.quotaBytes !== null) {
      const kept: Record<string, number> = {};
      for (const [id, r] of Object.entries(this.records)) kept[id] = r.data.byteLength;
      for (const id of ops.deleteRecords) delete kept[id];
      for (const r of ops.putRecords) kept[r.recordId] = r.data.byteLength;
      const total = Object.values(kept).reduce((a, b) => a + b, 0);
      if (total > this.quotaBytes) return Promise.reject(new StorageFullError('simulated full store'));
    }
    for (const r of ops.putRecords) this.records[r.recordId] = r;
    for (const s of ops.putSlots) this.slots[s.slotId] = s;
    for (const id of ops.deleteRecords) delete this.records[id];
    for (const id of ops.deleteSlots) delete this.slots[id];
    return Promise.resolve();
  }
}
