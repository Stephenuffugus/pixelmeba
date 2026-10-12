/**
 * Event bookmarks, the notebook kind 'bookmarks' (P4.8 part b; SPEC §12.8 "event bookmarks (timestamp +
 * summary ± snapshot; text-only labelled non-replayable)"; CT §12.10 "bookmarks 50 text / 20 snapshot";
 * D02 §20 "Event bookmark"; D-0070 "Notebook state is not world state"; D-0082 "the shelf").
 *
 * - A bookmark is a moment's dish time, a title, a summary in words (a recorded event, or what the dish
 *   held at that moment) and, optionally, a reference to a full save of the dish at that moment stored on
 *   the shelf (src/persistence/shelf.ts, kind 'snapshot'). The save itself never lives in the notebook.
 * - At most 50 per dish (BOOKMARKS_MAX); the 51st is refused, never a silent removal. Snapshot records are
 *   limited per DEVICE by the shelf (SHELF_LIMITS.snapshot = 20).
 * - It is never in the world state, its checksum or its stateHash; nothing in src/sim imports this file.
 * - `bookmarksProblem` validates the kind (notebook.ts KIND_PROBLEMS). Any problem drops the whole notebook
 *   with a message and the world still loads. Bookmarks survive Undo and a rollback like journal notes, so
 *   their ticks are never checked against the dish's time.
 */

/** CT §12.10 "bookmarks 50 text": bookmarks kept per dish (text and snapshot together). */
export const BOOKMARKS_MAX = 50;
/** CT §12.10 "name fields ≤ 60 chars". */
export const BOOKMARK_TITLE_MAX = 60;
/** A bookmark's summary (generated words), at most this many characters. */
export const BOOKMARK_SUMMARY_MAX = 200;

/** A snapshot bookmark's stored moment: the shelf record, the save's checksum and its stored size. */
export interface BookmarkSnapshotRef {
  readonly shelfId: string;
  /** The save file's checksum (sha256 over its canonical state); the shelf record must carry the same. */
  readonly checksum: string;
  /** The stored (compressed) size in bytes, for the storage panel and the bookmark's line. */
  readonly bytes: number;
}

export interface Bookmark {
  /** 'bm-<n>': one more than the highest held when it was made. */
  readonly id: string;
  /** The dish tick the bookmark is about (an event's tick, or the moment it was made). */
  readonly tick: number;
  readonly title: string;
  /** The recorded event or moment in words, e.g. "A Sprinter split in two at 1:12 (event 4512)." */
  readonly summary: string;
  /** The recorded event's id in the dish's event ring, when the bookmark names one. */
  readonly eventId: number | null;
  /** The stored moment (null: text only, not replayable). */
  readonly snapshot: BookmarkSnapshotRef | null;
  /** The dish tick at which the player made it. */
  readonly createdTick: number;
}

const isInt = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const BOOKMARK_KEYS = ['id', 'tick', 'title', 'summary', 'eventId', 'snapshot', 'createdTick'];
const SNAPSHOT_KEYS = ['shelfId', 'checksum', 'bytes'];
/** A shelf id of kind 'snapshot' as Shelf.put writes it. */
const SNAPSHOT_SHELF_ID = /^shelf-snapshot-[0-9]{8,12}-[a-z0-9]{1,16}$/i;
const CHECKSUM = /^sha256:[0-9a-f]{64}$/;

/** Text as a record keeps it: control characters become spaces, trimmed, at most `max` characters. */
function cleanText(text: unknown, max: number): string {
  if (typeof text !== 'string') return '';
  const s = Array.from(text)
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
    .join('')
    .trim();
  return Array.from(s).slice(0, max).join('').trim();
}

/** A title as saveFile.ts cleanName cleans a dish name (≤ 60 characters); empty is null. */
export function cleanBookmarkTitle(text: unknown): string | null {
  const t = cleanText(text, BOOKMARK_TITLE_MAX);
  return t.length > 0 ? t : null;
}

/** A summary as a record keeps it (≤ 200 characters, one line). */
export function cleanBookmarkSummary(text: unknown): string {
  return cleanText(text, BOOKMARK_SUMMARY_MAX);
}

/** The first problem with one bookmark, or null. */
function bookmarkProblem(raw: unknown): string | null {
  if (!isObj(raw)) return 'a bookmark is not an object';
  for (const k of Object.keys(raw)) if (!BOOKMARK_KEYS.includes(k)) return `a bookmark has an unknown field "${k.slice(0, 40)}"`;
  if (typeof raw.id !== 'string' || !/^bm-[1-9][0-9]{0,8}$/.test(raw.id)) return 'a bookmark has an invalid id';
  if (!isInt(raw.tick, 0)) return 'a bookmark has an invalid time';
  if (!isInt(raw.createdTick, 0)) return 'a bookmark has an invalid creation time';
  if (typeof raw.title !== 'string' || cleanBookmarkTitle(raw.title) !== raw.title) return 'a bookmark has an invalid title';
  if (typeof raw.summary !== 'string' || cleanBookmarkSummary(raw.summary) !== raw.summary) return 'a bookmark has an invalid summary';
  if (raw.eventId !== null && !isInt(raw.eventId, 1)) return 'a bookmark names an invalid event';
  const s = raw.snapshot;
  if (s !== null) {
    if (!isObj(s) || Object.keys(s).some((k) => !SNAPSHOT_KEYS.includes(k))) return 'a bookmark has an invalid snapshot reference';
    if (typeof s.shelfId !== 'string' || !SNAPSHOT_SHELF_ID.test(s.shelfId)) return 'a bookmark has an invalid snapshot reference';
    if (typeof s.checksum !== 'string' || !CHECKSUM.test(s.checksum)) return 'a bookmark’s snapshot has no checksum';
    if (!isInt(s.bytes, 1)) return 'a bookmark’s snapshot has an invalid size';
  }
  return null;
}

/** The first problem with the bookmarks kind, or null (notebook.ts KIND_PROBLEMS). */
export function bookmarksProblem(raw: unknown): string | null {
  if (!Array.isArray(raw)) return 'bookmarks is not a list';
  if (raw.length > BOOKMARKS_MAX) return `more than ${BOOKMARKS_MAX} bookmarks`;
  const ids: string[] = [];
  const shelves: string[] = [];
  for (const b of raw as unknown[]) {
    const p = bookmarkProblem(b);
    if (p) return p;
    const r = b as Bookmark;
    if (ids.includes(r.id)) return 'two bookmarks share an id';
    ids.push(r.id);
    if (r.snapshot) {
      if (shelves.includes(r.snapshot.shelfId)) return 'two bookmarks share a snapshot';
      shelves.push(r.snapshot.shelfId);
    }
  }
  return null;
}

/** The bookmarks of a record (a record written before them reads as none). */
export function bookmarksOf(record: { readonly bookmarks?: readonly Bookmark[] }): readonly Bookmark[] {
  return record.bookmarks ?? [];
}

/** The id the next bookmark of `list` takes ('bm-<highest + 1>'). */
export function nextBookmarkId(list: readonly Bookmark[]): string {
  let n = 0;
  for (const b of list) n = Math.max(n, Number(b.id.slice(3)) || 0);
  return `bm-${n + 1}`;
}

/** Dish time as m:ss (h:mm:ss past an hour). */
export function bookmarkClock(tick: number): string {
  const s = Math.max(0, Math.floor(tick / 10));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * The record as "Export without names or notes" carries it (PROPOSED DECISION): each title becomes
 * "Bookmark at m:ss" (a title is the player's own words) and no snapshot reference leaves the device (a
 * shelf record is this device's storage). Summaries are generated from recorded events and stay. Unsealed.
 */
export function withoutBookmarkNotes<T extends { readonly bookmarks?: readonly Bookmark[] }>(record: T): T {
  const list = bookmarksOf(record);
  if (list.length === 0) return record;
  return { ...record, bookmarks: list.map((b) => ({ ...b, title: `Bookmark at ${bookmarkClock(b.tick)}`, snapshot: null })) };
}

/** Readable refusals and labels (worker answers show them as they are; nothing was added or changed). */
export const BOOKMARK_TEXT = {
  full: `This dish keeps ${BOOKMARKS_MAX} bookmarks. Delete one to add another.`,
  snapshotsFull: '20 snapshot bookmarks are stored on this device. Remove one in Saved dishes → Storage, or save a text bookmark.',
  noStore: 'This device cannot store snapshots. Save a text bookmark instead.',
  storageFull: (detail: string) => `There is not enough storage space for a snapshot (${detail}). No bookmark was added; a text bookmark still fits.`,
  writeFailed: (detail: string) => `The snapshot could not be stored (${detail}). No bookmark was added.`,
  arm: 'Comparison copies keep no bookmarks.',
  unknown: 'That bookmark is not in this dish.',
  /** The stored moment is gone (removed in Storage) or failed its checks. */
  gone: 'Its snapshot was removed or could not be read. The bookmark text is kept.',
  /** SPEC §12.8: a text-only bookmark is labelled non-replayable. */
  textOnly: 'Text only — not replayable',
  notOpenable: 'This bookmark is text only: no moment was stored, so there is nothing to open.',
  /** The dish closed while its snapshot was being stored. */
  closed: 'The dish was closed before the bookmark was added. Nothing was added.',
} as const;
