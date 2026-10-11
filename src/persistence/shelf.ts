/**
 * The shelf (P4.7; D-0082 "the shelf"; SPEC §13.6 "capture an immutable baseline into a slot"; D09 lines
 * 135-139): write-once stored snapshots kept outside the ten named slots, modelled on the checkpoint ring
 * (src/persistence/checkpoints.ts, D-0031).
 *
 * - A record is a full save file (the same text, checksum and gzip record as a slot) with an index entry
 *   (SlotInfo: name, tick, worldId, bytes, checksum, automatic: true) plus `shelfKind` and `createdFor`
 *   (the try id or bookmark id it was written for).
 * - Slot ids are `shelf-<kind>-<sequence>-<writer>` (SHELF_SLOT_PREFIX): the writer token keeps two tabs
 *   from choosing the same id. SaveStore.list(), slot() and freeSlot() ignore them, as they ignore checkpoints.
 * - `put` writes one record through ONE backend.commit after the ring's storage preflight (room for this
 *   record and one more save of the same size). It never overwrites, evicts or deletes anything: over a
 *   kind's limit (SHELF_LIMITS) or the storage preflight it refuses with a readable message and nothing
 *   changes. A failed commit changes nothing either (the backend's commit is atomic).
 * - `get` reads and verifies one record: the stored checksum must equal the index's, the text must
 *   decompress and the caller's `verify` must accept it. A record that fails any check is null: there is no
 *   predecessor and never a fallback to another record.
 * - `remove` deletes one record by id, only on an explicit player action (stage 2's storage panel).
 */
import { gunzipText, gzipText } from './compress';
import { isShelfSlot, isStorageFull, SHELF_SLOT_PREFIX, type SlotInfo, type StorageBackend } from './store';
import type { StorageEstimate } from './checkpoints';

export type ShelfKind = 'baseline' | 'snapshot';
export const SHELF_KINDS: readonly ShelfKind[] = ['baseline', 'snapshot'];

/**
 * Records kept per device and kind (D-0082): 10 Try my dish baselines (PROPOSED DECISION in
 * docs/reports/reviews/g4-wave-6a/try-my-dish-build.md), 20 snapshot bookmarks (CT §12.10 "20 snapshot").
 */
export const SHELF_LIMITS: Readonly<Record<ShelfKind, number>> = { baseline: 10, snapshot: 20 };

/** Readable refusals (the caller shows them as they are; nothing was changed). */
export const SHELF_TEXT = {
  full: (kind: ShelfKind, limit: number) =>
    kind === 'baseline'
      ? `This device already keeps ${limit} Try my dish starting points. Remove one you no longer need, then try again. Nothing was changed.`
      : `This device already keeps ${limit} snapshot bookmarks. Remove one you no longer need, then try again. Nothing was changed.`,
  storageFull: (detail: string) => `There is not enough storage space for this starting point (${detail}). Nothing was changed.`,
  writeFailed: (detail: string) => `The starting point could not be stored (${detail}). Nothing was changed.`,
} as const;

export interface ShelfRequest {
  readonly text: string;
  readonly checksum: string;
  readonly name: string;
  readonly worldId: string;
  readonly tick: number;
  readonly savedAt: string;
  readonly recipeId: string | null;
  /** What the record is written for: a try id ('try-<n>') or a bookmark id. */
  readonly createdFor: string;
  readonly evolution?: SlotInfo['evolution'];
  readonly registry?: SlotInfo['registry'];
}

export type ShelfResult =
  | { readonly ok: true; readonly slot: SlotInfo }
  | {
      readonly ok: false;
      /** 'full': the kind's limit; 'storage-full': the preflight or the store refused for lack of space; 'write-failed': any other failure. */
      readonly reason: 'full' | 'storage-full' | 'write-failed';
      readonly message: string;
    };

/** The kind of a shelf slot id, or null when it is not one. */
export function shelfKindOf(slotId: string): ShelfKind | null {
  if (!isShelfSlot(slotId)) return null;
  const kind = slotId.slice(SHELF_SLOT_PREFIX.length).split('-')[0];
  return (SHELF_KINDS as readonly string[]).includes(kind ?? '') ? (kind as ShelfKind) : null;
}

/** A shelf slot id's sequence number (-1 when it has none). */
export function shelfSequenceOf(slotId: string): number {
  const n = Number(slotId.slice(SHELF_SLOT_PREFIX.length).split('-')[1]);
  return Number.isInteger(n) && n >= 0 ? n : -1;
}

/** Oldest first: by sequence, then by id. */
function oldestFirst(a: SlotInfo, b: SlotInfo): number {
  return shelfSequenceOf(a.slotId) - shelfSequenceOf(b.slotId) || (a.slotId < b.slotId ? -1 : a.slotId > b.slotId ? 1 : 0);
}

/** This page's writer token (persistence bookkeeping, never simulation state). */
function writerToken(): string {
  try {
    const bytes = new Uint8Array(4);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, '0');
  }
}

let recordCounter = 0;

export class Shelf {
  private readonly writer: string;

  constructor(
    private readonly backend: StorageBackend,
    /** The platform's storage estimate (web: navigator.storage.estimate); falls back to backend.usage(). */
    private readonly estimate?: () => Promise<StorageEstimate | undefined>,
    /** Keeps this writer's slot ids apart from another tab's (tests pass a fixed one). */
    writer: string = writerToken(),
  ) {
    this.writer = writer.replace(/[^a-z0-9]/giu, '').slice(0, 16) || 'w';
  }

  /** The shelf records (of `kind`, when given), oldest first. */
  async list(kind?: ShelfKind): Promise<SlotInfo[]> {
    return (await this.backend.listSlots()).filter((s) => isShelfSlot(s.slotId) && (kind === undefined || shelfKindOf(s.slotId) === kind)).sort(oldestFirst);
  }

  /** The next sequence number of `kind` (1 + the highest one held). */
  async nextSequence(kind: ShelfKind): Promise<number> {
    const held = await this.list(kind);
    return held.length > 0 ? Math.max(...held.map((s) => shelfSequenceOf(s.slotId))) + 1 : 1;
  }

  private async space(): Promise<{ used: number; quota: number } | null> {
    try {
      const est = this.estimate ? await this.estimate() : undefined;
      if (est && typeof est.quota === 'number' && Number.isFinite(est.quota) && est.quota > 0) return { used: est.usage ?? 0, quota: est.quota };
      const u = this.backend.usage ? await this.backend.usage() : null;
      if (u && u.quota !== null) return { used: u.bytes, quota: u.quota };
    } catch {
      // No estimate available: the store's own refusal still protects everything.
    }
    return null;
  }

  /**
   * The refusal `put(kind, …)` would give now for a record of about `bytes` compressed bytes (the kind's
   * limit, then the storage preflight), or null. Read-only: lets a caller check before it changes anything.
   */
  async check(kind: ShelfKind, bytes = 0): Promise<Extract<ShelfResult, { ok: false }> | null> {
    try {
      const limit = SHELF_LIMITS[kind];
      if ((await this.list(kind)).length >= limit) return { ok: false, reason: 'full', message: SHELF_TEXT.full(kind, limit) };
      const space = await this.space();
      // Room for this record and one more save of the same size afterwards (the next named save).
      if (space && bytes > 0 && space.used + 2 * bytes > space.quota) {
        return { ok: false, reason: 'storage-full', message: SHELF_TEXT.storageFull(`about ${Math.round(space.used / 1024)} KB of ${Math.round(space.quota / 1024)} KB used`) };
      }
      return null;
    } catch (e) {
      return { ok: false, reason: 'write-failed', message: SHELF_TEXT.writeFailed(e instanceof Error ? e.message : String(e)) };
    }
  }

  /** Write one record of `kind` (write-once: never overwrites, evicts or deletes anything). Never throws. */
  async put(kind: ShelfKind, req: ShelfRequest): Promise<ShelfResult> {
    try {
      const data = await gzipText(req.text);
      const refused = await this.check(kind, data.byteLength);
      if (refused) return refused;
      const seq = await this.nextSequence(kind);
      const slotId = `${SHELF_SLOT_PREFIX}${kind}-${String(seq).padStart(8, '0')}-${this.writer}`;
      // Write-once: an id already held (another tab's write at the same moment cannot share the writer) is never replaced.
      if (await this.backend.getSlot(slotId)) return { ok: false, reason: 'write-failed', message: SHELF_TEXT.writeFailed('that place on the shelf is taken') };
      const recordId = `${slotId}:${req.savedAt}:${(++recordCounter).toString(36)}`;
      const slot: SlotInfo = {
        slotId,
        name: req.name,
        tick: req.tick,
        savedAt: req.savedAt,
        recipeId: req.recipeId,
        current: recordId,
        previous: null,
        bytes: data.byteLength,
        checksum: req.checksum,
        automatic: true,
        worldId: req.worldId,
        ...(req.evolution ? { evolution: req.evolution } : {}),
        ...(req.registry ? { registry: req.registry } : {}),
        shelfKind: kind,
        createdFor: req.createdFor,
      };
      await this.backend.commit({ putRecords: [{ recordId, data, checksum: req.checksum }], putSlots: [slot], deleteRecords: [], deleteSlots: [] });
      return { ok: true, slot };
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      return isStorageFull(e) ? { ok: false, reason: 'storage-full', message: SHELF_TEXT.storageFull(detail) } : { ok: false, reason: 'write-failed', message: SHELF_TEXT.writeFailed(detail) };
    }
  }

  /**
   * Read shelf record `slotId` and verify it: its stored checksum equals the index's, the text decompresses
   * and `verify(text)` accepts it. Null when it is missing or fails any check (never another record).
   */
  async get(slotId: string, verify: (text: string, slot: SlotInfo) => Promise<boolean>): Promise<{ readonly text: string; readonly slot: SlotInfo } | null> {
    try {
      if (shelfKindOf(slotId) === null) return null;
      const slot = await this.backend.getSlot(slotId);
      if (!slot) return null;
      const rec = await this.backend.getRecord(slot.current);
      if (!rec || rec.checksum !== slot.checksum) return null;
      const text = await gunzipText(rec.data);
      return (await verify(text, slot)) ? { text, slot } : null;
    } catch {
      return null;
    }
  }

  /** Remove shelf record `slotId` (only on an explicit player action). False when it is not a shelf record. */
  async remove(slotId: string): Promise<boolean> {
    if (shelfKindOf(slotId) === null) return false;
    const slot = await this.backend.getSlot(slotId);
    if (!slot) return false;
    await this.backend.commit({ putRecords: [], putSlots: [], deleteRecords: [slot.current, ...(slot.previous ? [slot.previous] : [])], deleteSlots: [slotId] });
    return true;
  }
}
