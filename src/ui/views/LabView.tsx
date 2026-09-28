/**
 * Lab view (UX §4.4, SPEC §10; P2.7): the same world as Explore, seen with every tool. This module
 * holds the Lab's UI state (view, open tray, persistent tool, brush settings, chosen overlay) and
 * turns one completed gesture into exactly one command. It never touches simulation state: it sends
 * commands through the worker client, and switching views sends none.
 *
 * Mid-gesture safety: a view switch bumps the view epoch and cancels the uncommitted stroke (its
 * preview disappears and its release commits nothing), so Explore ⇄ Lab never changes the dish.
 */
import { batch, signal } from '@preact/signals';
import type { CommandPayload, CommandResult } from '@sim/commands';
import {
  brushCells,
  strokeFootprint,
  type LabBrushRule,
  type PlaceableStructure,
  type SubstrateName,
} from '@sim/grid';
import type { OverlayId } from '@worker/protocol';
import type { GestureHandlers } from '../gestures';
import { IconLab } from '../icons';
import {
  candidates,
  dishInfo,
  getClient,
  getRenderer,
  overlay,
  select,
  sendCommand,
  setOverlay,
  setTool,
  sheet,
  showToast,
} from '../state';
import {
  habitatEditOutcome,
  LAB_TEXT,
  RADII,
  type LabCategory,
  type LabCount,
  type LabRadius,
} from '../strings/lab';

export type DishView = 'explore' | 'lab';

/** Tool ids: one per tray item that acts on the dish. */
export type LabToolId =
  | 'inspect'
  | `life:${string}`
  | `material:${string}`
  | `paint:${SubstrateName}`
  | 'shade:paint'
  | 'shade:erase'
  | `place:${PlaceableStructure}`
  | 'erase';

export const dishView = signal<DishView>('explore');
/** The open tray (null = closed). Inspect has no tray. */
export const labTray = signal<LabCategory | null>(null);
/** The Lab's selected tool; it persists until the player picks another (unlike Explore). */
export const labTool = signal<LabToolId>('inspect');
export const labRadius = signal<LabRadius>(3);
export const labDoseIndex = signal<number>(1);
export const labCount = signal<LabCount>(5);
/** The overlay chosen in Lab's Observe tray; Explore shows none and Lab restores it on return. */
export const labOverlay = signal<OverlayId | null>(null);
/** Screen-reader announcement of the last view switch (the toggle's live region). */
export const viewAnnouncement = signal<string>('');

export interface BrushInfo {
  /** Covered cells the edit applies to. */
  readonly cells: number;
  /** Covered cells that would be refused (crossed in the preview). */
  readonly refused: number;
}
/** Live footprint summary while a brush is previewed (UX §4.2 "footprint and total dose"). */
export const brushInfo = signal<BrushInfo | null>(null);

let viewEpoch = 0;
let pending: { readonly epoch: number; readonly tool: LabToolId } | null = null;
let cancelGesture: (() => void) | null = null;
let commandCounter = 0;

export function isLab(): boolean {
  return dishView.value === 'lab';
}

/** The view epoch (bumped by every switch); exposed for tests. */
export function currentViewEpoch(): number {
  return viewEpoch;
}

/** gestures.ts hands over a function that drops its uncommitted stroke. */
export function bindGestureCancel(fn: (() => void) | null): void {
  cancelGesture = fn;
}

/**
 * Switch Explore ⇄ Lab. UI state only: the uncommitted stroke is cancelled, Explore's tap-to-place
 * tool returns to Look, Lab's tool is kept, and the Lab overlay is hidden in Explore and restored in
 * Lab (overlays are views: they never modify the simulation, SPEC §10.8).
 */
export function setDishView(v: DishView): void {
  if (dishView.value === v) return;
  viewEpoch++;
  // The gesture layer drops its uncommitted stroke (and forgets the pressed pointers). A pending Lab
  // stroke keeps its old epoch, so a release that still arrives is recognised and dropped.
  cancelGesture?.();
  clearPreview();
  batch(() => {
    dishView.value = v;
    candidates.value = null;
    labTray.value = null;
    if (sheet.value === 'addLife' || sheet.value === 'feed') sheet.value = 'none';
    setTool({ kind: 'look' });
    viewAnnouncement.value = v === 'lab' ? LAB_TEXT.enteredLab : LAB_TEXT.enteredExplore;
  });
  const want = v === 'lab' ? labOverlay.value : null;
  if (overlay.value !== want) setOverlay(want);
}

export function toggleDishView(): void {
  setDishView(isLab() ? 'explore' : 'lab');
}

/** Show the dish in Lab with a tray open (UX §2.3: a new Lab dish opens paused with Life open). */
export function openLabWith(tray: LabCategory | null): void {
  setDishView('lab');
  labTray.value = tray === 'inspect' ? null : tray;
}

let shownDishId: string | null = null;

/**
 * The Lab toolbar shows a dish (on mount, and whenever the dish changes). When another dish opened
 * (load, duplicate, import, new) the view and the Lab's tool, brush and chosen overlay are kept (the
 * toolbar falls back to Inspect when the tool names something the new dish does not have) and the open
 * tray and any uncommitted stroke are dropped. Either way the Lab overlay is (re-)applied, since
 * opening a dish starts with none.
 */
export function labShowsDish(dishId: string): void {
  if (shownDishId !== null && shownDishId !== dishId) {
    pending = null;
    clearPreview();
    labTray.value = null;
  }
  shownDishId = dishId;
  if (isLab() && overlay.value !== labOverlay.value) setOverlay(labOverlay.value);
}

// ---------------------------------------------------------------------------------------- tools

export function selectLabTool(id: LabToolId): void {
  pending = null;
  clearPreview();
  cancelGesture?.();
  labTool.value = id;
  if (id !== 'inspect') candidates.value = null;
}

export function openLabTray(c: LabCategory | null): void {
  if (c === 'inspect') {
    selectLabTool('inspect');
    labTray.value = null;
    return;
  }
  labTray.value = labTray.value === c ? null : c;
}

/** The brush rule a tool follows, or null for tools that do not paint (Inspect, Life). */
export function brushRule(id: LabToolId): LabBrushRule | null {
  if (id.startsWith('material:')) return 'material';
  if (id.startsWith('paint:')) return 'substrate';
  if (id.startsWith('shade:')) return 'shade';
  if (id.startsWith('place:')) return 'place';
  if (id === 'erase') return 'erase';
  return null;
}

/** Whether one-finger drag paints (true for every brush tool in Lab) instead of panning. */
export function labPaints(): boolean {
  return isLab() && brushRule(labTool.value) !== null;
}

/** The dose per cell the selected material tool uses (from the world's recorded material). */
export function materialDose(materialId: string): number {
  const mat = dishInfo.value?.materials.find((m) => m.id === materialId);
  return mat?.doses[labDoseIndex.value] ?? mat?.doses[1] ?? 0.1;
}

/** The one command a completed stroke (or tap) with this tool sends. Null for non-brush tools. */
export function payloadFor(
  id: LabToolId,
  points: ReadonlyArray<readonly [number, number]>,
  radius: number = labRadius.value,
): CommandPayload | null {
  const pts = points.map(([x, y]) => [x, y] as const);
  if (pts.length === 0) return null;
  if (id.startsWith('material:')) {
    const materialId = id.slice('material:'.length);
    return { kind: 'deposit', materialId, points: pts, radius, dose: materialDose(materialId) };
  }
  if (id.startsWith('paint:'))
    return {
      kind: 'paintSubstrate',
      substrate: id.slice('paint:'.length) as SubstrateName,
      points: pts,
      radius,
    };
  if (id === 'shade:paint' || id === 'shade:erase')
    return { kind: 'paintShade', erase: id === 'shade:erase', points: pts, radius };
  if (id.startsWith('place:'))
    return {
      kind: 'placeStructure',
      structure: id.slice('place:'.length) as PlaceableStructure,
      points: pts,
      radius,
    };
  if (id === 'erase') return { kind: 'eraseStructure', points: pts, radius };
  return null;
}

/** Send one Lab command (undoable, like every gesture) and report the simulation's own counts. */
export async function sendLabCommand(payload: CommandPayload): Promise<CommandResult | null> {
  if (payload.kind === 'deposit' || payload.kind === 'inoculate') {
    // The ordinary path reports these with the same words and placement ring as Explore.
    await sendCommand(payload);
    return null;
  }
  const info = dishInfo.value;
  if (!info) return null;
  const res = await getClient().command(info.dishId, `lab-${++commandCounter}`, payload, true);
  if (res && dishInfo.value?.dishId === info.dishId) showToast(habitatEditOutcome(payload, res), 4000);
  return res;
}

// -------------------------------------------------------------------------------- brush preview

function previewCells(
  points: ReadonlyArray<readonly [number, number]>,
): { cells: number[]; rule: LabBrushRule } | null {
  const rule = brushRule(labTool.value);
  if (!rule) return null;
  return { cells: strokeFootprint(points, labRadius.value), rule };
}

function showPreview(cells: readonly number[], rule: LabBrushRule | 'life'): void {
  const r = getRenderer();
  const counts = r ? r.setBrushPreview({ cells, rule }) : null;
  brushInfo.value = counts
    ? { cells: counts.ok, refused: counts.refused }
    : { cells: cells.length, refused: 0 };
}

export function clearPreview(): void {
  getRenderer()?.setBrushPreview(null);
  brushInfo.value = null;
}

/** Mouse hover (before pressing): the footprint of a tap here. Touch has no hover. */
export function labHover(w: readonly [number, number] | null): void {
  if (!isLab() || pending) return;
  if (!w) {
    clearPreview();
    return;
  }
  const id = labTool.value;
  if (id.startsWith('life:')) {
    showPreview(brushCells(w[0], w[1], labRadius.value), 'life');
    return;
  }
  const p = previewCells([w]);
  if (p) showPreview(p.cells, p.rule);
  else clearPreview();
}

export function labStrokeStart(w: readonly [number, number]): void {
  if (!labPaints()) return;
  pending = { epoch: viewEpoch, tool: labTool.value };
  const p = previewCells([w]);
  if (p) showPreview(p.cells, p.rule);
}

export function labStrokeMove(points: ReadonlyArray<readonly [number, number]>): void {
  if (!pending || pending.epoch !== viewEpoch) return;
  const p = previewCells(points);
  if (p) showPreview(p.cells, p.rule);
}

/** Two fingers, pointer cancel, or a view/tool switch: nothing is committed. */
export function labStrokeCancel(): void {
  pending = null;
  clearPreview();
}

/**
 * Release of a paint stroke. Returns true when the Lab handled it (even by dropping it because the
 * view or tool changed mid-gesture); false in Explore, so Explore's own handler runs.
 */
export function labStrokeEnd(points: ReadonlyArray<readonly [number, number]>): boolean {
  const s = pending;
  pending = null;
  clearPreview();
  if (s && s.epoch !== viewEpoch) return true; // started in the other view: dropped
  if (!isLab()) return false;
  if (!s || s.tool !== labTool.value) return true;
  const payload = payloadFor(s.tool, points);
  if (payload) void sendLabCommand(payload);
  return true;
}

/**
 * A tap on the dish. Returns true when the Lab handled it; false lets the ordinary inspect path run
 * (Lab's Inspect tool, and Explore).
 */
export function labTap(wx: number, wy: number): boolean {
  const s = pending;
  pending = null;
  clearPreview();
  if (s && s.epoch !== viewEpoch) return true;
  if (!isLab()) return false;
  const id = labTool.value;
  if (id === 'inspect') return false;
  if (id.startsWith('life:')) {
    void sendLabCommand({
      kind: 'inoculate',
      speciesId: id.slice('life:'.length),
      x: wx,
      y: wy,
      radius: labRadius.value,
      count: labCount.value,
    });
    return true;
  }
  const payload = payloadFor(id, [[wx, wy]]);
  if (payload) void sendLabCommand(payload);
  return true;
}

/**
 * Wrap the dish screen's gesture handlers so the same gestures drive the Lab: in Lab a brush tool
 * paints on drag, a tap uses the persistent tool, and Inspect falls through to the ordinary inspect
 * path. In Explore everything goes to the dish screen's own handlers.
 */
export function labGestures(h: GestureHandlers): GestureHandlers {
  return {
    ...h,
    paints: () => labPaints() || h.paints(),
    onTap: (sx, sy, wx, wy) => {
      if (labTap(wx, wy)) return;
      // Lab's Inspect: the inspector opens where the tray was (a tray would cover it on phones).
      if (isLab()) labTray.value = null;
      h.onTap(sx, sy, wx, wy);
    },
    onStroke: (points) => {
      if (!labStrokeEnd(points)) h.onStroke(points);
    },
    onStrokeStart: labStrokeStart,
    onStrokeMove: labStrokeMove,
    onStrokeCancel: labStrokeCancel,
    onHover: labHover,
    bindCancel: bindGestureCancel,
  };
}

// ------------------------------------------------------------------------------------ keyboard

/**
 * View-specific keys (UX §4.2): I inspect, L life, F feed/food, Esc → Look (Lab: Inspect). Returns
 * true when handled. Shared keys (Space, 1/2/4, `.`, U, +/−, arrows) stay with the dish screen.
 */
export function handleViewKey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key.toLowerCase();
  if (isLab()) {
    if (k === 'i') {
      openLabTray('inspect');
      return true;
    }
    if (k === 'l' || k === 'f') {
      openLabTray(k === 'l' ? 'life' : 'food');
      return true;
    }
    if (e.key === 'Escape') {
      labStrokeCancel();
      cancelGesture?.();
      batch(() => {
        labTray.value = null;
        labTool.value = 'inspect';
      });
      select(null);
      sheet.value = 'none';
      return true;
    }
    return false;
  }
  if (k === 'i') {
    setTool({ kind: 'look' });
    return true;
  }
  if (k === 'l' || k === 'f') {
    sheet.value =
      k === 'l' ? (sheet.value === 'addLife' ? 'none' : 'addLife') : sheet.value === 'feed' ? 'none' : 'feed';
    return true;
  }
  return false;
}

/** Brush radius step (kept to CT's 1/3/6). */
export function setLabRadius(r: LabRadius): void {
  if ((RADII as readonly number[]).includes(r)) labRadius.value = r;
}

// ---------------------------------------------------------------------------------- components

/** Top-strip toggle: Explore ⇄ Lab on the same dish (UX §2.4). */
export function LabViewToggle() {
  const lab = dishView.value === 'lab';
  return (
    <>
      <button
        class="btn view-toggle"
        aria-pressed={lab}
        aria-label={LAB_TEXT.toggleName}
        title={LAB_TEXT.toggleHint}
        onClick={toggleDishView}
        data-testid="view-toggle"
      >
        <IconLab /> <span aria-hidden="true">{LAB_TEXT.toggle}</span>
      </button>
      <span class="sr-only" role="status" aria-live="polite">
        {viewAnnouncement.value}
      </span>
    </>
  );
}
