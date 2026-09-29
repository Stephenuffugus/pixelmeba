/**
 * Automatic checkpoint ring (SPEC §10.7, D4 §12, CT §12.10 "checkpoint ring 10 × 60 s"; P2.8).
 *
 * An optional ring of ten automatic checkpoints taken every 60 simulated seconds of the dish being
 * played. Each checkpoint is a full save file (the same text, checksum and gzip record as a slot)
 * written through the same atomic backend commit as the save slots: the new record, its slot entry
 * and — once the ring holds ten — the removal of the OLDEST automatic checkpoint land together or not
 * at all. The ring only ever removes its own oldest entry: named slots, the autosave and every
 * predecessor are never touched.
 *
 * Storage limits (D4 §12 "Before making a checkpoint, enforce the existing storage limits"): before
 * writing, the ring asks the backend (or the browser's storage estimate) how full the store is. A
 * checkpoint is written only if, after it, there is still room for one more save of the same size
 * (so an automatic checkpoint never takes the space the player's next named save needs). If the
 * preflight or the store itself refuses, nothing changes — the older checkpoints stay — and the
 * result says so for the UI to tell the player.
 *
 * Opening a checkpoint loads it like any save, as a new paused dish that is a new branch from a stored
 * state (SPEC §10.7 "Rewinding opens a new branch"): it gets its own dish identity and a name that says
 * which moment it starts from (branchName), and it is never bound to a named slot.
 *
 * Slot ids are `checkpoint-<sequence>-<writer>`: the sequence orders the ring, and the writer token
 * keeps two tabs writing to the same store from ever choosing the same id (one would otherwise replace
 * the other's slot entry and orphan its record). Each write removes every checkpoint beyond the newest
 * nine, so a ring that ever held more than ten shrinks back to ten.
 */
import { gzipText } from './compress';
import {
  CHECKPOINT_SLOT_PREFIX,
  isCheckpointSlot,
  isStorageFull,
  type SlotInfo,
  type StorageBackend,
} from './store';

/** Automatic checkpoints kept (CT §12.10). */
export const CHECKPOINT_RING_SIZE = 10;
/** Simulated time between automatic checkpoints: 60 s (CT §12.10), in ticks. */
export const CHECKPOINT_INTERVAL_TICKS = 600;

/** What the store can say about its space (navigator.storage.estimate() or the backend's own count). */
export interface StorageEstimate {
  readonly usage?: number;
  readonly quota?: number;
}

export interface CheckpointRequest {
  readonly text: string;
  readonly checksum: string;
  /** The dish's name (the checkpoint is labelled automatic wherever it is listed). */
  readonly name: string;
  readonly worldId: string;
  readonly tick: number;
  readonly savedAt: string;
  readonly recipeId: string | null;
  /** P2.2: the file's meta copies for the mode labels (SlotInfo.evolution/registry); display only. */
  readonly evolution?: SlotInfo['evolution'];
  readonly registry?: SlotInfo['registry'];
}

export type CheckpointResult =
  | { readonly ok: true; readonly slot: SlotInfo; readonly evicted: SlotInfo | null }
  | {
      readonly ok: false;
      /** 'storage-full': the preflight or the store refused for lack of space; 'write-failed': any other failed write. */
      readonly reason: 'storage-full' | 'write-failed';
      /** Automatic checkpoints still held (all of them: a refused write changes nothing). */
      readonly kept: number;
      readonly detail: string;
    };

function sequenceOf(slotId: string): number {
  const n = Number(slotId.slice(CHECKPOINT_SLOT_PREFIX.length).split('-')[0]);
  return Number.isInteger(n) && n >= 0 ? n : -1;
}

/** Newest first: by sequence, then by id (two writers can share a sequence number). */
function newestFirst(a: SlotInfo, b: SlotInfo): number {
  return sequenceOf(b.slotId) - sequenceOf(a.slotId) || (a.slotId < b.slotId ? 1 : a.slotId > b.slotId ? -1 : 0);
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

/** Dish time as m:ss (h:mm:ss past an hour). */
function clock(tick: number): string {
  const s = Math.max(0, Math.floor(tick / 10));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Names are at most 60 characters (SPEC §14.3). */
const NAME_MAX = 60;

/**
 * The name of the branch a checkpoint opens as: the dish's name and the moment it starts from, e.g.
 * "Little Living Garden (from 1:00)". A name that already says where it branched from is replaced, not
 * stacked; a long name is shortened so the moment always shows.
 */
export function branchName(name: string, tick: number): string {
  const suffix = ` (from ${clock(tick)})`;
  const base = name.replace(/ \(from \d+(?::\d\d){1,2}\)$/u, '').trim() || 'Untitled dish';
  const room = NAME_MAX - Array.from(suffix).length;
  const chars = Array.from(base);
  return `${chars.length > room ? `${chars.slice(0, room - 1).join('').trimEnd()}…` : base}${suffix}`;
}

/**
 * The dish (world) id of the branch a checkpoint opens as: the first part of the dish's id (before any
 * "+") and the new dish's id, so a branch opened from a branch's checkpoint does not grow the id
 * (fix round 2: nesting made it grow by about 20 characters each time). Unique because the new dish id
 * is; the world id is neither hashed nor read by the simulation's randomness.
 */
export function branchWorldId(worldId: string, newDishId: string): string {
  return `${worldId.split('+')[0]}+${newDishId}`;
}

export class CheckpointRing {
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

  /** The automatic checkpoints, newest first. */
  async list(): Promise<SlotInfo[]> {
    return (await this.backend.listSlots()).filter((s) => isCheckpointSlot(s.slotId)).sort(newestFirst);
  }

  private async space(): Promise<{ used: number; quota: number } | null> {
    try {
      const est = this.estimate ? await this.estimate() : undefined;
      if (est && typeof est.quota === 'number' && Number.isFinite(est.quota) && est.quota > 0)
        return { used: est.usage ?? 0, quota: est.quota };
      const u = this.backend.usage ? await this.backend.usage() : null;
      if (u && u.quota !== null) return { used: u.bytes, quota: u.quota };
    } catch {
      // No estimate available: the store's own refusal (below) still protects the older checkpoints.
    }
    return null;
  }

  /** Write one automatic checkpoint, rotating out the oldest when the ring is full. Never throws. */
  async write(req: CheckpointRequest): Promise<CheckpointResult> {
    let ring: SlotInfo[] = [];
    try {
      ring = await this.list();
      const data = await gzipText(req.text);
      const next = ring.length > 0 ? Math.max(...ring.map((s) => sequenceOf(s.slotId))) + 1 : 1;
      const slotId = `${CHECKPOINT_SLOT_PREFIX}${String(next).padStart(8, '0')}-${this.writer}`;
      // Only the oldest automatic checkpoints are removed: all beyond the newest nine, so the ring holds
      // ten with this one (normally exactly one; more only if another tab wrote at the same time).
      const evictedAll = ring.slice(CHECKPOINT_RING_SIZE - 1);
      const evicted = evictedAll.length > 0 ? evictedAll[evictedAll.length - 1]! : null;
      const freed = evictedAll.reduce((a, s) => a + s.bytes, 0);
      const space = await this.space();
      // Room for this checkpoint and one more save of the same size afterwards (the next named save).
      if (space && space.used - freed + 2 * data.byteLength > space.quota) {
        return {
          ok: false,
          reason: 'storage-full',
          kept: ring.length,
          detail: `about ${Math.round(space.used / 1024)} KB of ${Math.round(space.quota / 1024)} KB used`,
        };
      }
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
      };
      await this.backend.commit({
        putRecords: [{ recordId, data, checksum: req.checksum }],
        putSlots: [slot],
        deleteRecords: evictedAll.flatMap((e) => [e.current, ...(e.previous ? [e.previous] : [])]),
        deleteSlots: evictedAll.map((e) => e.slotId),
      });
      return { ok: true, slot, evicted };
    } catch (e) {
      return {
        ok: false,
        reason: isStorageFull(e) ? 'storage-full' : 'write-failed',
        kept: ring.length,
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
