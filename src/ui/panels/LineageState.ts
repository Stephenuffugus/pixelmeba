/**
 * Lineage panel, trait overlay, follow-lineage, specimens and discovery cards (P2.3; SPEC §8.5,
 * UX §5.5). UI state only: the worker answers read-only lineage queries and marks snapshots for the
 * renderer; every change to the dish (names, pins, specimens) goes through the 'lineage' command.
 */
import { batch, signal } from '@preact/signals';
import type { LineageAnswer, LineageBranchRow } from '@sim/lineage';
import type { LineageOp } from '@sim/specimens';
import type { SnapshotMsg } from '@worker/protocol';
import { dishInfo, getClient, getRenderer, meta, setSpeed, settings, sheet, showToast } from '../state';

/** Latest lineage answer for the current dish (null until asked). */
export const lineage = signal<LineageAnswer | null>(null);
/** Branch shown in detail (null = the tree). */
export const lineageBranch = signal<number | null>(null);
/** Scroll target inside the detail view when it opens. */
export const lineageSection = signal<'top' | 'compare'>('top');
/** Locus whose inherited value tints living organisms (null = off). */
export const traitLocus = signal<number | null>(null);
/** Branch whose living members are ringed and followed (null = none). */
export const followedBranch = signal<number | null>(null);
/** A specimen waiting for a tap on the dish. */
export const specimenPlacement = signal<{ readonly specimen: number; readonly count: number; readonly label: string } | null>(null);

export interface DiscoveryNotice {
  readonly branches: readonly number[];
  readonly rows: readonly LineageBranchRow[];
  readonly answer: LineageAnswer;
  readonly paused: boolean;
}
/** The open discovery card (one per burst). */
export const discovery = signal<DiscoveryNotice | null>(null);

/** Discoveries arriving within this window after the first are one notice (UX "one per burst"). */
export const DISCOVERY_BURST_MS = 1500;
/** At most one notice per 60 s (CT §12.10); later discoveries wait and join the next card. */
export const DISCOVERY_GAP_MS = 60_000;

let currentDish: string | null = null;
let pendingBranches: number[] = [];
let lastShownAt = -Infinity;
let timer: ReturnType<typeof setTimeout> | null = null;
let counter = 0;

function dishId(): string | null {
  return dishInfo.value?.dishId ?? null;
}

/** A different dish is open: forget everything that belonged to the previous one. */
function resetFor(id: string | null): void {
  currentDish = id;
  pendingBranches = [];
  if (timer) clearTimeout(timer);
  timer = null;
  getRenderer()?.followLineage(null);
  batch(() => {
    lineage.value = null;
    lineageBranch.value = null;
    traitLocus.value = null;
    followedBranch.value = null;
    specimenPlacement.value = null;
    discovery.value = null;
  });
}

function pushView(): void {
  const id = dishId();
  if (!id) return;
  const locus = traitLocus.value;
  const branch = followedBranch.value;
  getClient().lineageView(id, locus !== null || branch !== null ? { locus, branch } : null);
  getRenderer()?.refreshAggregation();
}

export async function refreshLineage(branch: number | null = lineageBranch.value, birthId: number | null = null): Promise<LineageAnswer | null> {
  const id = dishId();
  if (!id) return null;
  try {
    const ans = await getClient().lineage(id, branch, birthId);
    if (dishId() !== id) return null;
    lineage.value = ans;
    return ans;
  } catch (e) {
    showToast(`Couldn't read the family tree: ${(e as Error).message}`, 3500);
    return null;
  }
}

/** Open the family tree, optionally on one branch (or on the branch of one organism). */
export async function openLineage(opts: { readonly branch?: number; readonly birthId?: number; readonly section?: 'top' | 'compare' } = {}): Promise<void> {
  if (dishId() !== currentDish) resetFor(dishId());
  lineageSection.value = opts.section ?? 'top';
  sheet.value = 'lineage';
  const ans = await refreshLineage(opts.branch ?? null, opts.birthId ?? null);
  if (!ans) return;
  const b = opts.branch ?? (ans.focusBranch !== null && ans.focusBranch >= 0 ? ans.focusBranch : null);
  lineageBranch.value = b;
}

export function closeLineage(): void {
  if (sheet.value === 'lineage') sheet.value = 'none';
}

export async function selectBranch(branch: number | null, section: 'top' | 'compare' = 'top'): Promise<void> {
  lineageSection.value = section;
  lineageBranch.value = branch;
  await refreshLineage(branch);
}

async function lineageCommand(op: LineageOp, undoable: boolean): Promise<{ accepted: number; note?: string } | null> {
  const id = dishId();
  if (!id) return null;
  const res = await getClient().command(id, `lin-${++counter}`, { kind: 'lineage', ...op }, undoable);
  return res;
}

export async function renameBranch(branch: number, name: string | null): Promise<void> {
  const res = await lineageCommand({ op: 'rename', branch, name }, false);
  await refreshLineage(branch);
  if (res && res.accepted > 0) showToast(name && name.trim() ? 'Branch renamed; its ID stays visible.' : 'Generated name restored.');
}

export async function pinBranch(branch: number, pinned: boolean): Promise<void> {
  await lineageCommand({ op: 'pin', branch, pinned }, false);
  await refreshLineage(branch);
  showToast(pinned ? 'Branch pinned.' : 'Branch unpinned.');
}

export async function saveSpecimen(branch: number): Promise<void> {
  const res = await lineageCommand({ op: 'saveSpecimen', from: 'branch', id: branch }, false);
  await refreshLineage(branch);
  if (res && res.accepted > 0) showToast('Specimen saved with this dish.');
  else showToast(res?.note === 'specimen shelf full' ? 'The specimen shelf is full (50).' : "Couldn't save that specimen.", 3500);
}

/** Choose a specimen to place; the next tap on the dish adds it (then back to Look). */
export function beginSpecimenPlacement(specimen: number, count: number, label: string): void {
  specimenPlacement.value = { specimen, count, label };
  sheet.value = 'none';
  showToast(`Tap the dish to add ${count} from ${label}.`, 3500);
}

export function cancelSpecimenPlacement(): void {
  specimenPlacement.value = null;
}

/** DishScreen tap hook: place the chosen specimen here. Returns true when the tap was used. */
export function placeSpecimenTap(wx: number, wy: number): boolean {
  const p = specimenPlacement.value;
  const id = dishId();
  if (!p || !id) return false;
  specimenPlacement.value = null;
  void (async () => {
    const res = await lineageCommand({ op: 'spawnSpecimen', specimen: p.specimen, x: wx, y: wy, radius: 3, count: p.count }, true);
    if (!res) return;
    if (res.accepted === 0) showToast(res.note === 'capacity' ? 'The dish is full.' : 'No room here for that specimen.');
    else showToast(`Added ${res.accepted} from ${p.label} — a new introduction, logged as an addition.`, 3500);
    getRenderer()?.placementRing(wx, wy, 3);
    if (sheet.value === 'lineage') await refreshLineage();
  })();
  return true;
}

export function setTraitLocus(locus: number | null): void {
  traitLocus.value = locus;
  pushView();
}

/**
 * Follow lineage: ring the branch's living members, move the camera to the one nearest the view
 * centre and keep following (moving on to another living member if that one dies). Touch cancels.
 */
export async function followLineage(branch: number): Promise<void> {
  const ans = await refreshLineage(branch);
  const det = ans?.selected;
  followedBranch.value = branch;
  pushView();
  sheet.value = 'none';
  const r = getRenderer();
  if (!r || !det || det.members.length === 0) {
    showToast('No living members to follow; their rings show if any are born.', 3500);
    r?.followLineage(null);
    return;
  }
  const cam = r.camera;
  let best = det.members[0]!;
  let bestD = Infinity;
  for (const m of det.members) {
    const p = r.positionOf(m.entityId) ?? [m.x, m.y];
    const d = Math.hypot(p[0] - cam.cx, p[1] - cam.cy);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  const p = r.positionOf(best.entityId) ?? [best.x, best.y];
  if (cam.aggregated()) r.zoomPreset('neighborhood', p);
  else cam.centerOn(p[0], p[1]);
  r.followLineage(best.entityId);
  const row = ans.branches[branch];
  showToast(`Following ${row?.name ?? 'this branch'} — ${det.livingTotal} living.`, 3000);
}

export function stopFollowing(): void {
  followedBranch.value = null;
  getRenderer()?.followLineage(null);
  pushView();
}

// ---------------------------------------------------------------------------------------------
// Discovery cards

async function showDiscovery(): Promise<void> {
  timer = null;
  const id = dishId();
  if (!id || pendingBranches.length === 0) return;
  const ids = [...new Set([...(discovery.value?.branches ?? []), ...pendingBranches])].sort((a, b) => a - b);
  pendingBranches = [];
  let ans: LineageAnswer;
  try {
    ans = await getClient().lineage(id, null, null);
  } catch {
    return;
  }
  if (dishId() !== id) return;
  const rows = ids.map((b) => ans.branches[b]).filter((r): r is LineageBranchRow => r !== undefined);
  if (rows.length === 0) return;
  const wasOpen = discovery.value !== null;
  let paused = discovery.value?.paused ?? false;
  if (!wasOpen) {
    lastShownAt = Date.now();
    if (settings.value.pauseOnDiscoveries && (meta.value?.speed ?? 0) > 0) {
      setSpeed(0);
      paused = true;
    }
  }
  discovery.value = { branches: ids, rows, answer: ans, paused };
  if (sheet.value === 'lineage') lineage.value = ans;
}

function schedule(): void {
  if (pendingBranches.length === 0 || timer) return;
  if (discovery.value) {
    // Join the open card.
    timer = setTimeout(() => void showDiscovery(), 200);
    return;
  }
  const wait = Math.max(DISCOVERY_BURST_MS, lastShownAt + DISCOVERY_GAP_MS - Date.now());
  timer = setTimeout(() => void showDiscovery(), wait);
}

async function notePinnedExtinctions(branches: readonly number[]): Promise<void> {
  const id = dishId();
  if (!id) return;
  const ans = await refreshLineage();
  if (!ans) return;
  const pinned = branches.map((b) => ans.branches[b]).filter((r): r is LineageBranchRow => r !== undefined && r.pinned);
  if (pinned.length > 0) showToast(`No members of ${pinned.map((r) => r.name).join(', ')} remain. The record stays in the family tree.`, 4500);
}

function onSnapshot(s: SnapshotMsg): void {
  const id = dishId();
  if (!id || s.dishId !== id) return;
  if (id !== currentDish) resetFor(id);
  let extinct: number[] | null = null;
  for (const ev of s.events) {
    if (ev.branch === undefined) continue;
    if (ev.type === 'branchEstablished') pendingBranches.push(ev.branch);
    else if (ev.type === 'branchExtinct') (extinct ??= []).push(ev.branch);
  }
  if (pendingBranches.length > 0) schedule();
  if (extinct) void notePinnedExtinctions(extinct);
  else if (sheet.value === 'lineage' && s.events.some((e) => e.type === 'branchEstablished')) void refreshLineage();
}

/** Listen for discoveries on the open dish (DiscoveryCard mounts this). Returns the unsubscribe. */
export function watchDiscoveries(): () => void {
  return getClient().onSnapshot(onSnapshot);
}

export function dismissDiscovery(): void {
  discovery.value = null;
  if (pendingBranches.length > 0) schedule();
}
