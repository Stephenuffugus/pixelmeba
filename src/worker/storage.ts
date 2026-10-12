/**
 * Storage use and cleanup (P4.8 part b; D02 §20 "Practical storage: … Show approximate storage used and offer
 * explicit cleanup. Never silently evict named dish saves."; D-0082 "The Storage panel removes records with a
 * confirmation that names what goes and what stays"; D-0084's release condition).
 *
 * `readStorage` is read-only: it lists what this device keeps in the save store (the named slots and the
 * autosave with their kept previous copies, the automatic checkpoints, and the shelf's Try my dish starting
 * points and snapshot bookmarks) with their stored sizes, and the browser's own estimate when it gives one.
 *
 * `storageRemovable` says which records the storage panel may remove: automatic checkpoints and shelf
 * records only. A named slot or the autosave is never removable here (named saves go only through Saved
 * dishes' own Delete… with its confirmation), so no group action can touch one.
 */
import { isCheckpointSlot, type SlotInfo, type StorageBackend } from '@persist/store';
import { shelfKindOf, type ShelfKind } from '@persist/shelf';
import type { StorageEstimate } from '@persist/checkpoints';
import { bookmarkClock, cleanBookmarkSummary } from '@persist/notebookBookmarks';
import type { World } from '@sim/world';
import type { BookmarkEventRef } from './protocol';

export type StorageKind = 'slot' | 'autosave' | 'checkpoint' | ShelfKind;

/** One stored record family member as the storage panel lists it. */
export interface StorageRow {
  readonly slotId: string;
  readonly kind: StorageKind;
  readonly name: string;
  readonly tick: number;
  readonly savedAt: string;
  /** The current record's stored (compressed) size. */
  readonly bytes: number;
  /** The kept previous copy's stored size (0 when there is none). */
  readonly previousBytes: number;
  /** The save file's checksum (a snapshot bookmark checks its own against it). */
  readonly checksum: string;
  /** Shelf records: what it was written for (a try id or a bookmark id); null otherwise. */
  readonly createdFor: string | null;
}

export interface StorageInfo {
  /** navigator.storage.estimate(), rounded by the UI; null when the browser gives none. */
  readonly estimate: { readonly usage: number; readonly quota: number } | null;
  /** Named slots ('slot1' … 'slot10') and the autosave, slot order. */
  readonly slots: readonly StorageRow[];
  /** Automatic checkpoints, newest first. */
  readonly checkpoints: readonly StorageRow[];
  /** Shelf records (baselines and snapshots), oldest first. */
  readonly shelf: readonly StorageRow[];
}

/** Whether the storage panel may remove this record (a checkpoint or a shelf record; never a named save). */
export function storageRemovable(slotId: string): boolean {
  return isCheckpointSlot(slotId) || shelfKindOf(slotId) !== null;
}

function kindOf(s: SlotInfo): StorageKind {
  const shelf = shelfKindOf(s.slotId);
  if (shelf) return shelf;
  if (isCheckpointSlot(s.slotId)) return 'checkpoint';
  return s.slotId === 'autosave' ? 'autosave' : 'slot';
}

function slotRank(id: string): number {
  if (id === 'autosave') return 0;
  const n = Number(/^slot(\d+)$/.exec(id)?.[1]);
  return Number.isInteger(n) ? n : 1000;
}

function seq(id: string): number {
  const m = /-(\d{6,12})-/.exec(id) ?? /^checkpoint-(\d+)/.exec(id);
  return m ? Number(m[1]) : -1;
}

/** What this device keeps (read-only; never throws for one unreadable record: its previous size reads 0). */
export async function readStorage(backend: StorageBackend, estimate?: () => Promise<StorageEstimate | undefined>): Promise<StorageInfo> {
  const all = await backend.listSlots();
  const rows: StorageRow[] = [];
  for (const s of all) {
    let previousBytes = 0;
    if (s.previous) {
      try {
        previousBytes = (await backend.getRecord(s.previous))?.data.byteLength ?? 0;
      } catch {
        previousBytes = 0;
      }
    }
    rows.push({
      slotId: s.slotId,
      kind: kindOf(s),
      name: s.name,
      tick: s.tick,
      savedAt: s.savedAt,
      bytes: s.bytes,
      previousBytes,
      checksum: s.checksum,
      createdFor: s.createdFor ?? null,
    });
  }
  let est: StorageInfo['estimate'] = null;
  try {
    const e = estimate ? await estimate() : undefined;
    if (e && typeof e.quota === 'number' && Number.isFinite(e.quota) && e.quota > 0) est = { usage: typeof e.usage === 'number' && Number.isFinite(e.usage) ? e.usage : 0, quota: e.quota };
  } catch {
    est = null;
  }
  const byId = (a: StorageRow, b: StorageRow) => (a.slotId < b.slotId ? -1 : a.slotId > b.slotId ? 1 : 0);
  return {
    estimate: est,
    slots: rows.filter((r) => r.kind === 'slot' || r.kind === 'autosave').sort((a, b) => slotRank(a.slotId) - slotRank(b.slotId) || byId(a, b)),
    checkpoints: rows.filter((r) => r.kind === 'checkpoint').sort((a, b) => seq(b.slotId) - seq(a.slotId) || byId(b, a)),
    shelf: rows.filter((r) => r.kind === 'baseline' || r.kind === 'snapshot').sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'baseline' ? -1 : 1) || seq(a.slotId) - seq(b.slotId) || byId(a, b)),
  };
}

// ── Notebook tools in the worker (P4.8b): read-only words for a bookmark, from the world as recorded ──

/**
 * "Bookmark this moment": what the dish held at this tick, from its living organisms (read-only), e.g.
 * "At 1:12: 56 alive — Sprinter 40, Grazer 16." (≤ 200 characters).
 */
export function momentSummary(world: World): string {
  const c = world.ents.cols;
  const counts = new Array<number>(world.species.length).fill(0);
  let alive = 0;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    alive++;
    const sp = c.species[i]!;
    if (sp >= 0 && sp < counts.length) counts[sp]!++;
  }
  const kinds = counts
    .map((n, sp) => ({ n, name: world.species[sp]!.def.name }))
    .filter((k) => k.n > 0)
    .sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((k) => `${k.name} ${k.n}`);
  const head = `At ${bookmarkClock(world.tick)}: ${alive === 0 ? 'no life remains' : `${alive} alive`}`;
  return cleanBookmarkSummary(kinds.length > 0 ? `${head} — ${kinds.join(', ')}.` : `${head}.`);
}

/**
 * An event row being bookmarked: the recorded event it starts with, looked up in the dish's event ring by
 * tick, type, species and cause (read-only), and its words with the dish time and, when the ring still holds
 * it, the event's id: "A Sprinter split in two at 1:12 (event 4512)." Null when the row's tick is not a
 * whole tick at or before the dish's time.
 */
export function eventBookmark(world: World, ref: BookmarkEventRef): { readonly tick: number; readonly eventId: number | null; readonly summary: string } | null {
  if (!Number.isInteger(ref.tick) || ref.tick < 0) return null;
  const birthType = ref.type === 'birth' ? 'birth' : ref.type;
  const ev = world.events.ring.find(
    (e) => e.tick === ref.tick && e.type === birthType && (ref.species < 0 ? e.species === undefined || e.species < 0 : e.species === ref.species) && (ref.cause === null || e.cause === ref.cause),
  );
  const words = cleanBookmarkSummary(ref.text).replace(/[.!?]+$/u, '') || 'Something happened';
  const summary = cleanBookmarkSummary(`${words} at ${bookmarkClock(ref.tick)}${ev ? ` (event ${ev.id})` : ''}.`);
  return { tick: ref.tick, eventId: ev ? ev.id : null, summary };
}
