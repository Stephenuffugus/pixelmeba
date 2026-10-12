/**
 * Event bookmarks on the main thread (P4.8b; SPEC §12.8 "event bookmarks (timestamp + summary ± snapshot;
 * text-only labelled non-replayable)"; CT §12.10 "bookmarks 50 text / 20 snapshot"; D-0070, D-0082).
 *
 * - Bookmark this moment (More; Lab → Observe → Bookmarks) opens the BookmarkSheet. The sheet pauses the dish
 *   (the moment it keeps is the one on screen) and Close or Esc restores the prior speed, as the Share sheet does.
 * - An event row of History "What happened" is bookmarked directly, text only (past moments have no stored state).
 * - Every change is a notebook request ('bookmarkAdd' / 'bookmarkDelete'), never a command, and autosaves.
 * - Opening a snapshot bookmark opens a NEW branch, the open dish kept first (D-0033), as a checkpoint opens.
 * - Whether a snapshot is still stored is read from the storage panel's read-only listing ('storageInfo').
 */
import { signal } from '@preact/signals';
import type { Speed, BookmarkEventRef } from '@worker/protocol';
import type { Bookmark } from '@persist/notebookBookmarks';
import { bookmarkClock } from '@persist/notebookBookmarks';
import type { FeedLine } from './feed';
import { autosave, dishInfo, enterBookmarkBranch, freshDishId, getClient, meta, replaceForBookmark, route, setSpeed, sheet, showToast } from './state';
import { notebook } from './favorites';
import { BOOKMARK_UI } from './strings/notebookTools';
import { withKeptLine } from './strings/keep';

/** The dish's run state when the Bookmark sheet opened (restored on close, once). */
let resume: { readonly dishId: string; readonly speed: number } | null = null;

/** Open the Bookmark sheet on the open dish, pausing it. */
export function openBookmarkSheet(): void {
  const info = dishInfo.value;
  if (!info) return;
  const speed = meta.value?.speed ?? 0;
  resume = { dishId: info.dishId, speed };
  if (speed > 0) getClient().setSpeed(info.dishId, 0);
  sheet.value = 'bookmark';
}

/** Close the sheet; the dish runs again at its prior speed unless the player changed it meanwhile. */
export function closeBookmarkSheet(): void {
  if (sheet.value === 'bookmark') sheet.value = 'none';
  const r = resume;
  resume = null;
  if (!r || r.speed <= 0) return;
  if (dishInfo.value?.dishId !== r.dishId || route.value.name !== 'dish') return;
  if ((meta.value?.speed ?? 0) === 0) setSpeed(r.speed as Speed);
}

/** The dish screen's key handler asks this first: while the sheet is open no dish key acts; Esc is Cancel. */
export function bookmarkSheetKey(key: string): boolean {
  if (sheet.value !== 'bookmark') return false;
  if (key === 'Escape') closeBookmarkSheet();
  return true;
}

/** The sheet's prefilled title: "{dish name} at {m:ss}". */
export function defaultBookmarkTitle(name: string, tick: number): string {
  return `${name} at ${bookmarkClock(tick)}`;
}

/** Add a bookmark of the open dish now. Resolves the refusal, or null when it was added. */
export async function addBookmarkNow(title: string, snapshot: boolean): Promise<string | null> {
  const info = dishInfo.value;
  if (!info) return 'No dish is open.';
  try {
    const r = await getClient().bookmarkAdd(info.dishId, title, snapshot, null);
    if (dishInfo.value?.dishId === info.dishId) notebook.value = r.record;
    if (r.refused) return r.refused;
    void autosave();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** The recorded event a History line starts with (its key is "type:species:cause…"). */
export function eventRefOf(line: FeedLine): BookmarkEventRef {
  const [type, , cause] = line.key.split(':');
  const c = cause !== undefined && cause !== '' ? Number(cause) : null;
  return { tick: line.tick, type: type as BookmarkEventRef['type'], species: line.species, cause: c !== null && Number.isInteger(c) ? c : null, text: line.text };
}

/** Bookmark a History line (text only). Resolves the refusal, or null. */
export async function bookmarkEvent(line: FeedLine): Promise<string | null> {
  const info = dishInfo.value;
  if (!info) return 'No dish is open.';
  try {
    const r = await getClient().bookmarkAdd(info.dishId, line.text, false, eventRefOf(line));
    if (dishInfo.value?.dishId === info.dishId) notebook.value = r.record;
    if (r.refused) return r.refused;
    void autosave();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Delete one bookmark of the open dish. Resolves the refusal, or null. */
export async function deleteBookmark(id: string): Promise<string | null> {
  const info = dishInfo.value;
  if (!info) return 'No dish is open.';
  try {
    const r = await getClient().bookmarkDelete(info.dishId, id);
    if (dishInfo.value?.dishId === info.dishId) notebook.value = r.record;
    if (r.refused) return r.refused;
    void autosave();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Snapshot records stored on this device (shelf id → checksum), from the read-only storage listing; null until read. */
export const storedSnapshots = signal<ReadonlyMap<string, string> | null>(null);

export async function refreshStoredSnapshots(): Promise<void> {
  try {
    const info = await getClient().storageInfo();
    storedSnapshots.value = new Map(info.shelf.filter((r) => r.kind === 'snapshot').map((r) => [r.slotId, r.checksum]));
  } catch {
    storedSnapshots.value = new Map();
  }
}

/** Whether a bookmark's stored moment is on this device: 'stored', 'gone', 'none' (text only) or null (not read yet). */
export function snapshotState(b: Bookmark, stored: ReadonlyMap<string, string> | null): 'stored' | 'gone' | 'none' | null {
  if (!b.snapshot) return 'none';
  if (!stored) return null;
  return stored.get(b.snapshot.shelfId) === b.snapshot.checksum ? 'stored' : 'gone';
}

/**
 * Open snapshot bookmark `id` of the open dish as a new branch (the open dish kept first; D-0033). Resolves
 * the message to show when nothing opened (the stored moment is gone, or the keep was refused), else null.
 */
export async function openSnapshotBookmark(id: string, title: string): Promise<string | null> {
  const info = dishInfo.value;
  if (!info) return 'No dish is open.';
  const c = getClient();
  let gone: string | null = null;
  const outcome = await replaceForBookmark(title, async (keepFrom) => {
    const r = await c.bookmarkOpenKeeping(info.dishId, id, freshDishId(), keepFrom);
    if (!r.ok && 'gone' in r) {
      gone = r.gone;
      return { ok: false, code: 'failed', message: r.gone, exclude: null, name: info.name, fromContinue: false };
    }
    if (!r.ok) return r;
    const followed = await enterBookmarkBranch(r.info, info.dishId);
    const at = bookmarkClock(r.branch?.tick ?? r.info.tick);
    showToast(withKeptLine(r.kept, BOOKMARK_UI.branchOpened(r.info.name, at), false) + (followed ? '' : ' Continue could not be updated yet.'), 6000);
    return { ok: true };
  });
  if (gone !== null) {
    void refreshStoredSnapshots();
    return gone;
  }
  return outcome.kind === 'refused' ? outcome.message : null;
}
