/**
 * Save slots (SPEC §14.2, ARCH §11.1): ten named slots plus one rolling autosave, each keeping its
 * most recent valid predecessor. A write is one atomic backend transaction: the new record and the
 * updated slot pointer land together or not at all, so a failed write can never lose the previous
 * save. Records are gzip-compressed save-file text.
 */
import { gunzipText, gzipText } from './compress';

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
}

export interface SaveRequest {
  readonly slotId: string;
  readonly text: string;
  readonly checksum: string;
  readonly name: string;
  readonly tick: number;
  readonly savedAt: string;
  readonly recipeId: string | null;
}

let recordCounter = 0;

export class SaveStore {
  constructor(private readonly backend: StorageBackend) {}

  static slotIds(): string[] {
    return Array.from({ length: NAMED_SLOTS }, (_, i) => `slot${i + 1}`);
  }

  async list(): Promise<SlotInfo[]> {
    return (await this.backend.listSlots()).sort((a, b) => (a.slotId < b.slotId ? -1 : a.slotId > b.slotId ? 1 : 0));
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

/** In-memory backend (tests; also a fallback when IndexedDB is unavailable). Can inject failures. */
export class MemoryBackend implements StorageBackend {
  readonly slots: Record<string, SlotInfo> = {};
  readonly records: Record<string, StoredRecord> = {};
  failNextCommit = false;

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
    for (const r of ops.putRecords) this.records[r.recordId] = r;
    for (const s of ops.putSlots) this.slots[s.slotId] = s;
    for (const id of ops.deleteRecords) delete this.records[id];
    for (const id of ops.deleteSlots) delete this.slots[id];
    return Promise.resolve();
  }
}
