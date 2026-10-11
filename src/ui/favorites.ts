/**
 * Favorite families on the main thread (P4.1; SPEC §12.6, UX §5.8; D-0070). UI state only:
 * - `notebook`: the open dish's notebook record, from the worker's 'notebook' and 'notebookChanged'
 *   packets (the worker owns it; it is saved beside the world, never in it);
 * - `favoriteSlots`: the followed families' summaries from the latest snapshot.
 * Components read only these and snapshots; every change is a 'favorite' request (never a command), and
 * every change autosaves, as a journal note does. Nothing here reads or writes the simulation.
 */
import { computed, effect, signal } from '@preact/signals';
import type { SimClient, NotebookNotice } from '@worker/client';
import { ID_STRIDE, type FavoriteOp, type FavoriteSlotMark, type SnapshotMsg } from '@worker/protocol';
import type { FavoritePattern, FavoriteRecord, NotebookRecord } from '@persist/notebook';
import { autosave, dishInfo, getClient, getRenderer, select, sheet, showToast, toast } from './state';
import { favoriteDisplayName, removedText, restoredRemovedText } from './strings/favorites';
import { shownCard } from './notices';

/** The open dish's notebook record (null until the worker answered, or with no dish open). */
export const notebook = signal<NotebookRecord | null>(null);
/** The followed families' summaries from the latest snapshot of the open dish (slot order). */
export const favoriteSlots = signal<readonly FavoriteSlotMark[]>([]);
/** The favorite the Family sheet (sheet 'favorite') shows. */
export const favoriteSheetId = signal<string | null>(null);
/** The organism the Follow panel is about (opened from the inspector), or null. */
export const followTarget = signal<{ readonly birthId: number; readonly speciesIdx: number } | null>(null);
/**
 * Followed families that have no members left, oldest first, each waiting for its extinction card (UX §5.8;
 * D-0076: no card is lost). A FIFO of favorite ids with no duplicates: the card shows the head; closing
 * it (Close, Look back, Continue exploring, Start a new dish) removes it and the next one shows.
 */
export const extinctQueue = signal<readonly string[]>([]);
/** The favorite id the extinction card is about now: the head of the queue (null: none). */
export const extinctCard = computed<string | null>(() => extinctQueue.value[0] ?? null);

/** A followed family died: its card joins the queue (once). */
export function queueExtinctCard(id: string): void {
  const q = extinctQueue.peek();
  if (!q.includes(id)) extinctQueue.value = [...q, id];
}

/** The player closed the card about `id` (the head; any button): it leaves the queue. */
export function closeExtinctCard(id: string): void {
  const q = extinctQueue.peek();
  if (q.includes(id)) extinctQueue.value = q.filter((x) => x !== id);
}

/** Keep only queued ids whose family is still extinct in `record` (Undo brought it back, or it is gone). */
function pruneExtinctQueue(record: NotebookRecord): void {
  const q = extinctQueue.peek();
  const kept = q.filter((id) => record.favorites.some((f) => f.id === id && f.extinct !== null));
  if (kept.length !== q.length) extinctQueue.value = kept;
}

/**
 * Fix round 1: a dropped notebook's message for the dish it belongs to. The worker's 'loaded' answer
 * arrives before the UI opens that dish (state.ts enterDish runs after the load resolves), and the
 * "Opened …" toast follows: the message waits here, is shown once the dish is open, and is added to any
 * toast posted in the next few seconds instead of being replaced by it. The Favorites tab shows it too.
 */
export const notebookDroppedFor = signal<{ readonly dishId: string; readonly message: string } | null>(null);
const pendingDropped = new Map<string, string>();
let droppedShownUntil = 0;
let droppedMessage: string | null = null;
/** How long after a dish opens a toast still carries its dropped-notebook message. */
const DROPPED_TOAST_MS = 9000;

/** A Find waiting for the snapshot that follows a favorite change (the worker answers first, then sends it). */
let pendingFind: string | null = null;
let wiredTo: SimClient | null = null;
/** The open dish's latest snapshot that carried family marks (read by favoriteOf). */
let latestMarks: SnapshotMsg | null = null;
let lastSlots = '';

/** Subscribe to a client's notebook notices and snapshots (state.ts calls this once, beside onExperiment). */
export function wireFavorites(client: SimClient): void {
  if (wiredTo === client) return;
  wiredTo = client;
  client.onNotebook(onNotebookNotice);
  client.onSnapshot(onFavoriteSnapshot);
  // Started here, not at module load (state.ts imports this module: no top-level reads of its signals).
  effect(() => followOpenDish(dishInfo.value?.dishId ?? null));
  effect(() => keepDroppedInToast(toast.value));
}

/** While a dropped-notebook message is fresh, a toast that replaced it carries it too. */
function keepDroppedInToast(text: string | null): void {
  if (text === null || droppedMessage === null || text.includes(droppedMessage)) return;
  if (Date.now() > droppedShownUntil) {
    droppedMessage = null;
    return;
  }
  showToast(`${text} ${droppedMessage}`, DROPPED_TOAST_MS);
}

function showDropped(dishId: string, message: string): void {
  notebookDroppedFor.value = { dishId, message };
  droppedMessage = message;
  droppedShownUntil = Date.now() + DROPPED_TOAST_MS;
  const cur = toast.peek();
  showToast(cur && !cur.includes(message) ? `${cur} ${message}` : message, DROPPED_TOAST_MS);
}

function openDishId(): string | null {
  return dishInfo.value?.dishId ?? null;
}

/** The snapshot's followed-family summaries (only when they changed, so nothing re-renders 10 times a second). */
export function onFavoriteSnapshot(s: SnapshotMsg): void {
  if (s.dishId !== openDishId()) return;
  latestMarks = s.favorites ? s : null;
  const slots = s.favorites?.slots ?? [];
  const key = JSON.stringify(slots);
  if (key !== lastSlots) {
    lastSlots = key;
    favoriteSlots.value = slots;
  }
  // A Find asked for right after a change (Follow next): it runs on the first snapshot after the change.
  if (pendingFind !== null) {
    const id = pendingFind;
    pendingFind = null;
    findFavorite(id);
  }
}

/** Find `id` once the next snapshot (which reflects the change just answered) has arrived. */
export function findFavoriteAfterChange(id: string): void {
  pendingFind = id;
}

export function onNotebookNotice(n: NotebookNotice): void {
  if (n.type === 'notebookDropped') {
    // The dish this load opens is usually not open yet: keep the message until it is.
    if (n.dishId === openDishId()) showDropped(n.dishId, n.message);
    else pendingDropped.set(n.dishId, n.message);
    return;
  }
  if (n.dishId !== openDishId()) return;
  notebook.value = n.record;
  if (n.change.kind === 'favoriteExtinct') {
    queueExtinctCard(n.change.id);
    if (n.change.removed) showToast(removedText(n.change.removed), 6000);
    void autosave();
  } else if (n.change.kind === 'favoritesRestored') {
    // Undo or a rollback: every queued extinction card whose family is back (or gone from the record)
    // leaves the queue, the shown one and the waiting ones alike.
    pruneExtinctQueue(n.record);
    const open = favoriteSheetId.value;
    if (open !== null && !n.record.favorites.some((f) => f.id === open) && sheet.value === 'favorite')
      sheet.value = 'none';
    const lines = [
      ...(n.change.removed.length > 0 ? [restoredRemovedText(n.change.removed)] : []),
      ...(n.change.unpinnedRemoved ?? []).map(removedText),
    ];
    if (lines.length > 0) showToast(lines.join(' '), 6000);
  }
}

// A different dish (or none): read its notebook; the old one's state goes.
let askedFor: string | null = null;
function followOpenDish(id: string | null): void {
  if (id === askedFor) return;
  askedFor = id;
  notebook.value = null;
  favoriteSlots.value = [];
  lastSlots = '';
  latestMarks = null;
  favoriteSheetId.value = null;
  followTarget.value = null;
  extinctQueue.value = [];
  pendingFind = null;
  if (notebookDroppedFor.peek()?.dishId !== id) notebookDroppedFor.value = null;
  if (id !== null) void refreshNotebook(id);
  const dropped = id !== null ? pendingDropped.get(id) : undefined;
  if (id !== null && dropped !== undefined) {
    pendingDropped.delete(id);
    showDropped(id, dropped);
  }
}

async function refreshNotebook(dishId: string): Promise<void> {
  try {
    const r = await getClient().notebookGet(dishId);
    if (openDishId() === dishId) notebook.value = r.record;
  } catch {
    // The dish is gone already.
  }
}

/** The species name of a favorite in the open dish (its recorded content). */
export function speciesNameOf(speciesId: string): string {
  const info = dishInfo.value;
  if (!info) return speciesId;
  const k = info.speciesIds.indexOf(speciesId);
  return k >= 0 ? (info.speciesNames[k] ?? speciesId) : speciesId;
}

export function nameOf(f: FavoriteRecord): string {
  return favoriteDisplayName(f, speciesNameOf(f.speciesId));
}

export function favoriteById(id: string | null): FavoriteRecord | null {
  if (id === null) return null;
  return notebook.value?.favorites.find((f) => f.id === id) ?? null;
}

/**
 * The favorite the extinction card is about, when it has something to show (its family has no members
 * left and a dish is open), else null. The card asks for the notice place with this (NoticeHost's
 * setCardOpen('extinct', …)), and shows only while that place is its own (notices.ts shownCard).
 */
export function extinctCardFavorite(): FavoriteRecord | null {
  const f = favoriteById(extinctCard.value);
  return f && f.extinct && dishInfo.value ? f : null;
}

/**
 * The extinction card's render guard (FavoriteExtinct): the head favorite when the notice place is the
 * extinction card's (notices.ts shownCard 'extinct'), its family is extinct and a dish is open; else null.
 */
export function extinctCardToShow(): FavoriteRecord | null {
  return shownCard.value === 'extinct' ? extinctCardFavorite() : null;
}

/**
 * The followed favorite whose family the organism `birthId` belongs to, if any: from the latest
 * snapshot's marks (members born since the record was read included), else the record's members.
 */
export function favoriteOf(birthId: number): FavoriteRecord | null {
  const s = latestMarks;
  if (s?.favorites) {
    for (let k = 0; k < s.count; k++) {
      if (s.ids[k * ID_STRIDE] !== birthId) continue;
      // Every member's bit (fix round 1): the highlight marks stop at 200, membership does not.
      const m = (s.favorites.member[k] ?? 0) | (s.favorites.marks[k] ?? 0);
      for (let j = 0; j < s.favorites.slots.length; j++)
        if (m & ((1 << j) | (1 << (3 + j)))) return favoriteById(s.favorites.slots[j]!.id);
      return null;
    }
  }
  return (
    notebook.value?.favorites.find(
      (f) => f.active && (f.representative === birthId || f.members.some(([b]) => b === birthId)),
    ) ?? null
  );
}

/** Send one favorite op for the open dish; on success the record updates and the dish autosaves. Resolves the refusal, if any. */
export async function favoriteOp(op: FavoriteOp): Promise<string | null> {
  const dishId = openDishId();
  if (!dishId) return 'No dish is open.';
  try {
    const r = await getClient().favorite(dishId, op);
    if (openDishId() !== dishId) return null;
    notebook.value = r.record;
    // A favorite removed from the notebook while its extinction card waits: that card is not left stuck
    // at the head of the queue.
    pruneExtinctQueue(r.record);
    if (r.removed) showToast(removedText(r.removed), 6000);
    if (r.refused) return r.refused;
    void autosave();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export function followFamily(
  birthId: number,
  nickname: string,
  pattern: FavoritePattern,
): Promise<string | null> {
  return favoriteOp({ kind: 'follow', birthId, nickname: nickname.length > 0 ? nickname : null, pattern });
}

/**
 * Find (UX §5.8 "tap = Find"): select the representative and bring it into view from the latest snapshot.
 * When it is no longer in the dish, the Family sheet opens on its Follow next candidates.
 */
export function findFavorite(id: string): void {
  const f = favoriteById(id);
  const slot = favoriteSlots.value.find((s) => s.id === id);
  if (!f || !slot) return;
  if (slot.representativeEntity === null) {
    if (slot.representativeHeld) {
      showToast(
        `${speciesNameOf(f.speciesId)} #${f.representative} is in the held sample. Transfer or cancel the sample to see it again.`,
        5000,
      );
      return;
    }
    favoriteSheetId.value = id;
    sheet.value = 'favorite';
    return;
  }
  select({ kind: 'entity', birthId: f.representative });
  const r = getRenderer();
  const p = r?.positionOf(slot.representativeEntity) ?? null;
  if (r && p) r.zoomPreset('neighborhood', p);
}

/** Open the Family sheet for a favorite. */
export function openFavoriteSheet(id: string): void {
  favoriteSheetId.value = id;
  sheet.value = 'favorite';
}
