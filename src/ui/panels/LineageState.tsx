/**
 * Family tree state and actions (P2.3; SPEC §8.5, UX §5.5): the lineage panel, the trait overlay,
 * follow lineage, specimens and discovery cards. UI state only: the worker answers read-only lineage
 * queries and marks snapshots for the renderer; every change to the dish (names, pins, specimens)
 * goes through the ordinary command path as a 'lineage' command. Nothing here consumes simulation
 * randomness or reads wall-clock time into the simulation (timers only pace notices).
 */
import { batch, signal } from '@preact/signals';
import type { LineageAnswer, LineageBranchRow } from '@sim/lineage';
import { SPECIMEN_RADIUS, type LineageOp } from '@sim/specimens';
import type { SnapshotMsg } from '@worker/protocol';
import { dishInfo, getClient, getRenderer, meta, setSpeed, settings, sheet, showToast } from '../state';
import { pinnedExtinctText } from '../strings/lineage';
import { DiscoveryPacer } from './DiscoveryPacer';

/** Latest lineage answer for the current dish (null until asked). */
export const lineage = signal<LineageAnswer | null>(null);
/** Branch shown in detail (null = the tree). */
export const lineageBranch = signal<number | null>(null);
/** Open the detail view with the ancestor comparison showing. */
export const lineageSection = signal<'top' | 'compare'>('top');
/** Locus whose inherited value tints living organisms (null = off). */
export const traitLocus = signal<number | null>(null);
/** Branch whose living members are ringed and followed (null = none). */
export const followedBranch = signal<number | null>(null);
/** A specimen waiting for a tap on the dish. */
export const specimenPlacement = signal<{ readonly specimen: number; readonly count: number; readonly label: string } | null>(null);
/** Latest render marks for the current dish (counts for the legend). */
export const lineageMarks = signal<SnapshotMsg['lineage'] | null>(null);

export interface DiscoveryNotice {
  readonly branches: readonly number[];
  readonly rows: readonly LineageBranchRow[];
  readonly answer: LineageAnswer;
  readonly paused: boolean;
}
/** The open discovery card (one per burst). */
export const discovery = signal<DiscoveryNotice | null>(null);

export { DISCOVERY_BURST_MS, DISCOVERY_GAP_MS } from './DiscoveryPacer';

let currentDish: string | null = null;
/** Branch count last seen for the current dish (-1 = no snapshot yet: the first one is the baseline). */
let knownBranches = -1;
/** Lineage command ids: a per-session counter, the same scheme as state.ts sendCommand (no clock). */
let counter = 0;

/** One card per burst, at most one new card per 60 s (DiscoveryPacer); timers pace notices only. */
const pacer = new DiscoveryPacer({
  now: () => performance.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  cardOpen: () => discovery.value !== null,
  deliver: (ids, newCard) => showDiscovery(ids, newCard),
});

function dishId(): string | null {
  return dishInfo.value?.dishId ?? null;
}

/** A different dish is open: forget everything that belonged to the previous one. */
function resetFor(id: string | null): void {
  currentDish = id;
  knownBranches = -1;
  pacer.reset();
  // A duplicated dish starts with the view it was copied with: clear it so marks match these signals.
  if (id) getClient().lineageView(id, null);
  getRenderer()?.followLineage(null);
  batch(() => {
    lineage.value = null;
    lineageBranch.value = null;
    traitLocus.value = null;
    followedBranch.value = null;
    specimenPlacement.value = null;
    lineageMarks.value = null;
    discovery.value = null;
  });
}

function ensureDish(): string | null {
  const id = dishId();
  if (id !== currentDish) resetFor(id);
  return id;
}

/** Tell the worker which marks this dish's snapshots should carry (render-only). */
function pushView(): void {
  const id = dishId();
  if (!id) return;
  const locus = traitLocus.value;
  const branch = followedBranch.value;
  getClient().lineageView(id, locus !== null || branch !== null ? { locus, branch } : null);
  getRenderer()?.refreshAggregation();
}

export async function refreshLineage(branch: number | null = lineageBranch.value, birthId: number | null = null): Promise<LineageAnswer | null> {
  const id = ensureDish();
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
  ensureDish();
  lineageSection.value = opts.section ?? 'top';
  if (opts.branch !== undefined) lineageBranch.value = opts.branch;
  sheet.value = 'lineage';
  const ans = await refreshLineage(opts.branch ?? (opts.birthId !== undefined ? null : lineageBranch.value), opts.birthId ?? null);
  if (!ans) return;
  if (opts.branch !== undefined) lineageBranch.value = opts.branch;
  else if (opts.birthId !== undefined) lineageBranch.value = ans.focusBranch !== null && ans.focusBranch >= 0 ? ans.focusBranch : null;
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
  const id = ensureDish();
  if (!id) return null;
  try {
    return await getClient().command(id, `lineage-${++counter}`, { kind: 'lineage', ...op }, undoable);
  } catch (e) {
    showToast(`Nothing was changed: ${(e as Error).message}`, 3500);
    return null;
  }
}

export async function renameBranch(branch: number, name: string | null): Promise<void> {
  const res = await lineageCommand({ op: 'rename', branch, name }, false);
  await refreshLineage(branch);
  if (res && res.accepted > 0) showToast(name && name.trim() ? 'Branch renamed; its ID stays visible.' : 'Generated name restored.');
}

export async function pinBranch(branch: number, pinned: boolean): Promise<void> {
  const res = await lineageCommand({ op: 'pin', branch, pinned }, false);
  await refreshLineage(branch);
  if (res && res.accepted > 0) showToast(pinned ? 'Branch pinned.' : 'Branch unpinned.');
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
  if (!p || !dishId()) return false;
  specimenPlacement.value = null;
  void (async () => {
    const res = await lineageCommand({ op: 'spawnSpecimen', specimen: p.specimen, x: wx, y: wy, radius: SPECIMEN_RADIUS, count: p.count }, true);
    if (!res) return;
    if (res.accepted === 0) showToast(res.note === 'capacity' ? 'The dish is full.' : 'No room here for that specimen.');
    else showToast(`Added ${res.accepted} from ${p.label} — a new introduction, logged as an addition to the dish.`, 3500);
    getRenderer()?.placementRing(wx, wy, SPECIMEN_RADIUS);
    if (sheet.value === 'lineage') await refreshLineage();
  })();
  return true;
}

export function setTraitLocus(locus: number | null): void {
  ensureDish();
  traitLocus.value = locus;
  pushView();
}

/**
 * Follow lineage: ring the branch's living members (and its sub-branches'), move the camera to the
 * one nearest the view centre and keep following, moving on to another living member if that one
 * dies. Touching or panning the dish cancels the camera follow; the rings stay until "Stop following".
 */
export async function followLineage(branch: number): Promise<void> {
  const ans = await refreshLineage(branch);
  const det = ans?.selected;
  followedBranch.value = branch;
  pushView();
  sheet.value = 'none';
  const r = getRenderer();
  if (!r || !det || det.members.length === 0) {
    showToast('No living members to follow.', 3500);
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
// Discovery cards: new branches are found from the snapshot's branch count (ids are sequential), so
// a notice is never lost to the event ring; the first snapshot of a dish is the baseline, so opening
// a dish never announces branches it already had.

/**
 * Show newly named branches on a card (a new one, or the open one they join). Resolves to the ids the
 * card really shows now; the pacer keeps every other id waiting (a failed or empty lineage answer, a
 * dish change, or a card dismissed while joining shows nothing and starts no 60 s gap).
 */
async function showDiscovery(newIds: readonly number[], newCard: boolean): Promise<readonly number[]> {
  const id = dishId();
  if (!id) return [];
  let ans: LineageAnswer;
  try {
    ans = await getClient().lineage(id, null, null);
  } catch {
    return [];
  }
  if (dishId() !== id) return [];
  // Joining: the card must still be open (dismissed meanwhile → these wait for the next card).
  if (!newCard && discovery.value === null) return [];
  const ids = [...(newCard ? [] : (discovery.value?.branches ?? [])), ...newIds].filter((b, k, a) => a.indexOf(b) === k).sort((a, b) => a - b);
  const rows = ids.map((b) => ans.branches[b]).filter((r): r is LineageBranchRow => r !== undefined);
  const shown = newIds.filter((b) => ans.branches[b] !== undefined);
  if (shown.length === 0) return [];
  let paused = discovery.value?.paused ?? false;
  if (discovery.value === null && settings.value.pauseOnDiscoveries === true && (meta.value?.speed ?? 0) > 0) {
    setSpeed(0);
    paused = true;
  }
  discovery.value = { branches: rows.map((r) => r.id), rows, answer: ans, paused };
  if (sheet.value === 'lineage') lineage.value = ans;
  return shown;
}

function onSnapshot(s: SnapshotMsg): void {
  const id = dishId();
  if (!id || s.dishId !== id) return;
  ensureDish();
  lineageMarks.value = s.lineage ?? null;
  let changed = false;
  const n = s.branchCount;
  if (n !== undefined) {
    if (knownBranches < 0) knownBranches = n;
    else if (n > knownBranches) {
      const ids: number[] = [];
      for (let b = knownBranches; b < n; b++) ids.push(b);
      knownBranches = n;
      changed = true;
      pacer.discovered(ids);
    } else if (n < knownBranches) {
      // Undo rewound time past a discovery: that branch no longer exists in this dish.
      knownBranches = n;
      pacer.rewound(n);
      const d = discovery.value;
      if (d && d.branches.some((b) => b >= n)) discovery.value = null;
      if (followedBranch.value !== null && followedBranch.value >= n) stopFollowing();
      if (lineageBranch.value !== null && lineageBranch.value >= n) lineageBranch.value = null;
      changed = true;
    }
  }
  const extinct = s.events.filter((e) => e.type === 'branchExtinct' && e.branch !== undefined).map((e) => e.branch!);
  // A pinned branch's extinction is noted (and the tree refreshed); other changes refresh an open tree.
  if (extinct.length > 0) void notePinnedExtinctions(extinct);
  else if (changed && sheet.value === 'lineage') void refreshLineage();
}

async function notePinnedExtinctions(branches: readonly number[]): Promise<void> {
  const ans = await refreshLineage();
  if (!ans) return;
  const pinned = branches.map((b) => ans.branches[b]).filter((r): r is LineageBranchRow => r !== undefined && r.pinned);
  if (pinned.length > 0) showToast(pinnedExtinctText(pinned.map((r) => r.name)), 4500);
}

/** Listen for discoveries on the open dish (the dish screen mounts this). Returns the unsubscribe. */
export function watchLineage(): () => void {
  ensureDish();
  return getClient().onSnapshot(onSnapshot);
}

export function dismissDiscovery(): void {
  discovery.value = null;
  pacer.dismissed();
}
