/**
 * The storage panel's model (P4.8b; D02 §20 "Show approximate storage used and offer explicit cleanup. Never
 * silently evict named dish saves."; D-0082; D-0084's release condition).
 *
 * - `storageGroups` groups what the worker reports (src/worker/storage.ts readStorage): Saved dishes (each
 *   named slot with its kept previous copy), Continue (the autosave), Automatic checkpoints, Try my dish
 *   starting points and Snapshot bookmarks, each with its stored size.
 * - Cleanup always asks first: `askRemove` only records which row waits for confirmation (it never reaches
 *   the worker); `confirmRemove` sends the one removal the player confirmed. Named slots and Continue are
 *   never removable here (`removeQuestion` is null for them, and the worker refuses them too): a saved dish
 *   is deleted only through Saved dishes' own Delete… with its confirmation. There is no group action.
 *
 * UI state only; it imports no app state, so tests drive it with a stand-in client.
 */
import { signal } from '@preact/signals';
import type { StorageInfo, StorageRow } from '@worker/storage';
import { sizeText, STORAGE_UI } from './strings/notebookTools';

export type StorageGroupId = 'saved' | 'continue' | 'checkpoints' | 'baselines' | 'snapshots';

export interface StorageGroup {
  readonly id: StorageGroupId;
  readonly label: string;
  readonly rows: readonly StorageRow[];
  /** Every row's current and previous copies together. */
  readonly bytes: number;
  /** Whether its rows have a Remove (checkpoints and shelf records only). */
  readonly removable: boolean;
}

/** What the panel needs of the worker client (SimClient has both). */
export interface StorageClient {
  storageInfo(): Promise<StorageInfo>;
  storageRemove(slotId: string): Promise<{ readonly storage: StorageInfo; readonly removed: boolean }>;
}

/** A row's stored size: its current record and its kept previous copy. */
export function rowBytes(r: StorageRow): number {
  return r.bytes + r.previousBytes;
}

/** The panel's groups, in UX order, with their sums. */
export function storageGroups(info: StorageInfo): StorageGroup[] {
  const group = (id: StorageGroupId, label: string, rows: readonly StorageRow[], removable: boolean): StorageGroup => ({
    id,
    label,
    rows,
    bytes: rows.reduce((a, r) => a + rowBytes(r), 0),
    removable,
  });
  return [
    group('saved', STORAGE_UI.groupSaved, info.slots.filter((r) => r.kind === 'slot'), false),
    group('continue', STORAGE_UI.groupContinue, info.slots.filter((r) => r.kind === 'autosave'), false),
    group('checkpoints', STORAGE_UI.groupCheckpoints, info.checkpoints, true),
    group('baselines', STORAGE_UI.groupBaselines, info.shelf.filter((r) => r.kind === 'baseline'), true),
    group('snapshots', STORAGE_UI.groupSnapshots, info.shelf.filter((r) => r.kind === 'snapshot'), true),
  ];
}

/** The sum of every group (what this panel lists; the browser's estimate also counts the app itself). */
export function storageTotal(info: StorageInfo): number {
  return storageGroups(info).reduce((a, g) => a + g.bytes, 0);
}

/** The one-step confirmation that names what goes and what stays; null for a row the panel never removes. */
export function removeQuestion(row: StorageRow): string | null {
  switch (row.kind) {
    case 'checkpoint':
      return STORAGE_UI.confirmCheckpoint;
    case 'baseline':
      return STORAGE_UI.confirmBaseline;
    case 'snapshot':
      return STORAGE_UI.confirmSnapshot;
    default:
      return null;
  }
}

/** "About 12 MB of 2.0 GB used on this device", rounded, or that the browser gives no estimate. */
export function usageLine(estimate: StorageInfo['estimate']): string {
  if (!estimate || !Number.isFinite(estimate.quota) || estimate.quota <= 0) return STORAGE_UI.noEstimate;
  return STORAGE_UI.used(sizeText(estimate.usage), sizeText(estimate.quota));
}

/** The panel's state: what the worker last reported, the row waiting for confirmation, and the last outcome. */
export const storageInfoNow = signal<StorageInfo | null>(null);
export const pendingRemove = signal<string | null>(null);
export const storageMessage = signal<string | null>(null);

function rowOf(info: StorageInfo | null, slotId: string): StorageRow | null {
  if (!info) return null;
  return [...info.slots, ...info.checkpoints, ...info.shelf].find((r) => r.slotId === slotId) ?? null;
}

/** Read what this device stores (read-only). */
export async function refreshStorage(client: StorageClient): Promise<StorageInfo | null> {
  try {
    const info = await client.storageInfo();
    storageInfoNow.value = info;
    return info;
  } catch (e) {
    storageMessage.value = STORAGE_UI.failed((e as Error).message);
    return null;
  }
}

/** The player chose Remove… on a row: ask first (nothing is removed yet). False for a row the panel never removes. */
export function askRemove(slotId: string): boolean {
  const row = rowOf(storageInfoNow.peek(), slotId);
  if (!row || removeQuestion(row) === null) return false;
  storageMessage.value = null;
  pendingRemove.value = slotId;
  return true;
}

export function cancelRemove(): void {
  pendingRemove.value = null;
}

/** The player confirmed: remove that one record. Resolves whether it was removed. */
export async function confirmRemove(client: StorageClient): Promise<boolean> {
  const slotId = pendingRemove.peek();
  const row = rowOf(storageInfoNow.peek(), slotId ?? '');
  pendingRemove.value = null;
  if (!slotId || !row || removeQuestion(row) === null) return false;
  try {
    const r = await client.storageRemove(slotId);
    storageInfoNow.value = r.storage;
    storageMessage.value = r.removed ? STORAGE_UI.removed : STORAGE_UI.failed('it was no longer stored.');
    return r.removed;
  } catch (e) {
    storageMessage.value = STORAGE_UI.failed((e as Error).message);
    return false;
  }
}
