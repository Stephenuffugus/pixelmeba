/**
 * UI state (Preact signals) and the controller that talks to the worker. Views read signals and call
 * actions; nothing here mutates simulation state except by sending commands.
 */
import { batch, effect, signal, untracked } from '@preact/signals';
import type { CommandPayload, CommandResult } from '@sim/commands';
import { SimClient } from '@worker/client';
import type { CompareSpeed, ComparisonState } from '@worker/comparison';
import type { DishInfo, FamilyAnswer, InspectorPayload, OverlayId, Selection, SnapshotMsg, Speed } from '@worker/protocol';
import type { DishRenderer } from '@render/renderer';
import { clearFeed, pushFeed } from './feed';
import type { ExperimentCardView } from '@sim/experiments';
import type { ExperimentNotice, WorkerErrorNotice } from '@worker/client';
import { addJournalEntry, journalUnseen, updateJournalEntry, type JournalMeasure } from './journal';
import { clauseText, experimentEndedText, formatDiff, formatMeasure, measureLabel, stampToastText, waitingStepsText } from './strings/experiments';

export type Route =
  | { readonly name: 'home' }
  | { readonly name: 'play' }
  | { readonly name: 'dish' }
  | { readonly name: 'guide' }
  | { readonly name: 'settings' }
  | { readonly name: 'about' }
  | { readonly name: 'saves' }
  | { readonly name: 'newDish' }
  /** Paired comparison of two copies of the current dish (SPEC §13.4, UX §5.6). */
  | { readonly name: 'compare' }
  /** Notebook (UX §1): Journal · Experiments (P2.5; the other tabs arrive in later phases). */
  | { readonly name: 'notebook'; readonly tab: 'journal' | 'experiments' }
  /** One experiment card in full, with Start (SPEC §13.2). */
  | { readonly name: 'experiment'; readonly cardId: string }
  /** A paired experiment card's run (the comparison engine with the card's change on B). */
  | { readonly name: 'experimentRun' };

export type Tool =
  | { readonly kind: 'look' }
  | { readonly kind: 'addLife'; readonly speciesId: string; readonly count: number; readonly radius: number }
  | { readonly kind: 'feed'; readonly materialId: string; readonly dose: number; readonly radius: number; readonly paint: boolean };

export interface SnapMeta {
  readonly tick: number;
  readonly speed: Speed;
  readonly effectiveSpeed: number;
  readonly count: number;
  readonly speciesCounts: readonly number[];
  readonly capacityReached: boolean;
  readonly undoAvailable: boolean;
}

export interface Settings {
  readonly reducedMotion: boolean;
  readonly overlayOpacity: number;
  readonly showPrompts: boolean;
  /** Text size as a multiple of the device's default (UX §2 Settings "text size"; §4.1 up to 200 %). */
  readonly textScale: number;
  /** Pause the dish when a discovery card opens (UX §2 Settings "pause on discoveries"; P2.3). Off unless chosen. */
  readonly pauseOnDiscoveries?: boolean;
}

/** Text sizes offered in Settings (UX §4.1 acceptance runs at 100 % and 200 %). */
export const TEXT_SCALES = [1, 1.25, 1.5, 2] as const;

export const route = signal<Route>({ name: 'home' });
export const dishInfo = signal<DishInfo | null>(null);
export const meta = signal<SnapMeta | null>(null);
export const selection = signal<Selection | null>(null);
export const inspector = signal<InspectorPayload | null>(null);
export const candidates = signal<{ x: number; y: number; items: { birthId: number; species: number }[] } | null>(null);
export const tool = signal<Tool>({ kind: 'look' });
export const sheet = signal<'none' | 'addLife' | 'feed' | 'inspect' | 'more' | 'save' | 'history' | 'lineage'>('none');
export const overlay = signal<OverlayId | null>(null);
export const overlayMax = signal<number>(0);
export const toast = signal<string | null>(null);
export const prompt = signal<string | null>(null);
export const busy = signal<boolean>(false);
const REDUCE_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
/** Settings the player chose explicitly (only these are stored; the rest follow the device). */
let savedPrefs: Partial<Settings> = {};
export const settings = signal<Settings>(loadSettings());
/** Living family of the organism asked about with "Where is its family?" (null when not shown). */
export const familyView = signal<FamilyAnswer | null>(null);
/** History opened from "What changed?": show "What happened", filtered to one species. */
export const historyFocus = signal<{ readonly species: number; readonly birthId: number } | null>(null);
/**
 * A single-arm experiment card's measured gate held on a dish and its Journal stamp waits for player
 * steps (P2.5): the dish view's one small notice naming them, until the stamp arrives, the observation
 * ends, another dish opens or the player dismisses it.
 */
export const experimentWaiting = signal<{ readonly dishId: string; readonly cardId: string; readonly text: string } | null>(null);

let client: SimClient | null = null;
let renderer: DishRenderer | null = null;
/** Last snapshot that carried geometry, replayed into a renderer that attaches later. */
let lastGeometrySnapshot: SnapshotMsg | null = null;
let lastSnapshot: SnapshotMsg | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let commandCounter = 0;

function systemReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia(REDUCE_MOTION_QUERY).matches;
}

function loadSettings(): Settings {
  const base: Settings = { reducedMotion: systemReducedMotion(), overlayOpacity: 0.45, showPrompts: true, textScale: 1 };
  try {
    const raw = localStorage.getItem('pixelmeba.settings');
    savedPrefs = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
  } catch {
    savedPrefs = {};
  }
  const s = { ...base, ...savedPrefs };
  return { ...s, textScale: TEXT_SCALES.includes(s.textScale as (typeof TEXT_SCALES)[number]) ? s.textScale : 1 };
}

/**
 * Push display settings everywhere they matter: the renderer (reduced motion, overlay opacity), the
 * document text size, and a reduced-motion class/attribute for CSS (UX §7.4, §9).
 */
function applyDisplaySettings(): void {
  const s = settings.value;
  renderer?.setOptions({ reducedMotion: s.reducedMotion, overlayOpacity: s.overlayOpacity });
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.fontSize = s.textScale === 1 ? '' : `${Math.round(s.textScale * 100)}%`;
  root.classList.toggle('reduced-motion', s.reducedMotion);
  root.dataset.reducedMotion = String(s.reducedMotion);
  root.dataset.textScale = String(s.textScale);
}

export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
  savedPrefs = { ...savedPrefs, ...patch };
  try {
    localStorage.setItem('pixelmeba.settings', JSON.stringify(savedPrefs));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
  applyDisplaySettings();
}

/** Follow the device's reduced-motion preference until the player sets it in Settings. */
export function initDisplaySettings(): void {
  applyDisplaySettings();
  if (typeof matchMedia !== 'function') return;
  matchMedia(REDUCE_MOTION_QUERY).addEventListener('change', (e) => {
    if (savedPrefs.reducedMotion !== undefined) return;
    settings.value = { ...settings.value, reducedMotion: e.matches };
    applyDisplaySettings();
  });
}

/** Whether reduced motion currently follows the device setting (nothing chosen in Settings). */
export function reducedMotionFollowsDevice(): boolean {
  return savedPrefs.reducedMotion === undefined;
}

/**
 * The global error toast, worded by what really happened (ARCH §7). Only when the worker paused a dish
 * at its last valid state (its command, step or run failed) does it say so. A failed start names the
 * start; a failed save or export says so and claims no pause; anything else (opening a save, importing
 * a file, listing or deleting saves) paused and changed nothing, and says that.
 */
export function errorToastText(e: Pick<WorkerErrorNotice, 'message'> & Partial<WorkerErrorNotice>): string {
  if (e.paused === true) return `Something went wrong and the dish was paused: ${e.message}`;
  switch (e.request) {
    case 'create':
    case 'experimentStart':
      return `The new dish could not be started: ${e.message}`;
    case 'saveSlot':
    case 'autosave':
      return `Saving failed; nothing already saved was changed and the dish was not paused: ${e.message}`;
    case 'exportDish':
      return `The export failed; nothing was paused or changed: ${e.message}`;
    default:
      return `Nothing was paused or changed: ${e.message}`;
  }
}

export function getClient(): SimClient {
  if (!client) {
    client = SimClient.create();
    client.onSnapshot(onSnapshot);
    client.onError((e) => showToast(errorToastText(e)));
    client.onCompare(onCompareState);
    client.onExperiment(onExperimentNotice);
  }
  return client;
}

export function attachRenderer(r: DishRenderer | null): void {
  renderer = r;
  if (r) {
    applyDisplaySettings();
    const info = dishInfo.value;
    if (info) r.setSpecies(info.speciesIds, info.speciesAssets);
    if (lastGeometrySnapshot && info && lastGeometrySnapshot.dishId === info.dishId) r.applyGeometry(lastGeometrySnapshot);
    if (lastSnapshot && info && lastSnapshot.dishId === info.dishId) r.applySnapshot(lastSnapshot);
  }
}

export function getRenderer(): DishRenderer | null {
  return renderer;
}

function onSnapshot(s: SnapshotMsg): void {
  const cmp = compareState.value;
  if (cmp && (s.dishId === cmp.aDishId || s.dishId === cmp.bDishId)) {
    onCompareSnapshot(s.dishId === cmp.aDishId ? 'A' : 'B', s);
    return;
  }
  if (dishInfo.value && s.dishId !== dishInfo.value.dishId) return;
  if (s.geometry) lastGeometrySnapshot = s;
  lastSnapshot = s;
  renderer?.applySnapshot(s);
  if (dishInfo.value) pushFeed(s.events, dishInfo.value.speciesNames);
  batch(() => {
    meta.value = {
      tick: s.tick,
      speed: s.speed,
      effectiveSpeed: s.effectiveSpeed,
      count: s.count,
      speciesCounts: s.speciesCounts,
      capacityReached: s.capacityReached,
      undoAvailable: s.undoAvailable,
    };
    if (s.selection) inspector.value = s.selection;
    if (s.overlay) overlayMax.value = s.overlay.max;
  });
}

export function showToast(text: string, ms = 2600): void {
  toast.value = text;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = null), ms);
}

function newDishId(): string {
  return `dish-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function enterDish(info: DishInfo, promptText: string | null): void {
  clearFeed();
  batch(() => {
    dishInfo.value = info;
    selection.value = null;
    inspector.value = null;
    familyView.value = null;
    historyFocus.value = null;
    tool.value = { kind: 'look' };
    sheet.value = 'none';
    overlay.value = null;
    prompt.value = promptText;
    experimentWaiting.value = null;
    route.value = { name: 'dish' };
  });
  renderer?.setSpecies(info.speciesIds, info.speciesAssets);
  lastAutosaveTick = info.tick;
}

let lastAutosaveTick = -1;

/** Autosave the active dish if it changed since the last autosave (SPEC §14.2). */
export async function autosave(): Promise<boolean> {
  const info = dishInfo.value;
  const m = meta.value;
  if (!info || !m || m.tick === lastAutosaveTick) return true;
  try {
    await getClient().autosave(info.dishId);
    lastAutosaveTick = m.tick;
    return true;
  } catch (e) {
    showToast(`Autosave failed; your previous save is intact. (${(e as Error).message})`, 4000);
    return false;
  }
}

export async function saveToSlot(slotId: string, name: string): Promise<boolean> {
  const info = dishInfo.value;
  if (!info) return false;
  try {
    const s = await getClient().saveSlot(info.dishId, slotId, name);
    dishInfo.value = { ...info, name: s.name };
    // A manual save is an autosave event too (SPEC §14.2), so Continue opens this same moment. Confirm
    // only once both writes have landed: leaving the page right after "Saved" must not lose Continue.
    if (await autosave()) showToast(`Saved "${s.name}".`);
    else showToast(`Saved "${s.name}", but Continue could not be updated; it still opens your previous autosave.`, 4000);
    return true;
  } catch (e) {
    showToast(`Couldn't save; your previous save is intact. (${(e as Error).message})`, 4000);
    return false;
  }
}

export async function loadSlot(slotId: string): Promise<void> {
  busy.value = true;
  try {
    const c = getClient();
    const old = dishInfo.value;
    const { info, usedPredecessor } = await c.loadSlot(slotId, newDishId());
    if (old && old.dishId !== info.dishId) c.dispose(old.dishId);
    enterDish(info, null);
    showToast(usedPredecessor ? 'The latest save was damaged, so the previous copy was opened.' : `Opened "${info.name}" — paused where you left it.`, 3500);
  } catch (e) {
    showToast(`That save could not be opened: ${(e as Error).message}`, 5000);
  } finally {
    busy.value = false;
  }
}

export async function importFile(file: File): Promise<void> {
  busy.value = true;
  try {
    const text = await file.text();
    const c = getClient();
    const old = dishInfo.value;
    const info = await c.importDish(text, newDishId());
    if (old) c.dispose(old.dishId);
    enterDish(info, null);
    showToast(`Imported "${info.name}" — paused.`, 3000);
  } catch (e) {
    showToast(`Nothing was changed: ${(e as Error).message}`, 5000);
  } finally {
    busy.value = false;
  }
}

export async function exportCurrent(strip: boolean): Promise<void> {
  const info = dishInfo.value;
  if (!info) return;
  try {
    const { text, filename } = await getClient().exportDish(info.dishId, strip);
    const blob = new Blob([text], { type: 'application/vnd.pixelmeba+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast(`Exported ${filename}.`);
  } catch (e) {
    showToast(`Export failed: ${(e as Error).message}`, 4000);
  }
}

export async function duplicateCurrent(): Promise<void> {
  const info = dishInfo.value;
  if (!info) return;
  const c = getClient();
  const copy = await c.duplicate(info.dishId, newDishId());
  c.activate(copy.dishId);
  enterDish(copy, null);
  showToast('Duplicated. You are now in the copy; the original is unchanged.', 3500);
}

/** A fresh dish id for a dish the UI asks the worker to create (UI bookkeeping, never simulation state). */
export function freshDishId(): string {
  return newDishId();
}

/**
 * What if? (P2.6): open a dish the worker has just started (paused) in place of the previous one,
 * which the worker already kept through the save flow; the previous dish is then let go.
 */
export function enterStartedDish(info: DishInfo, previousDishId: string | null): void {
  if (previousDishId && previousDishId !== info.dishId) getClient().dispose(previousDishId);
  enterDish(info, null);
}

export async function startCustom(opts: {
  recipeId: string;
  name: string;
  seed: number;
  mutationPreset: 'standard' | 'accelerated' | 'fixed';
  founderMode: 'identical' | 'varied';
  empty: boolean;
}): Promise<void> {
  busy.value = true;
  try {
    const c = getClient();
    const old = dishInfo.value;
    // The new dish first: a failed start leaves the current dish exactly as it was.
    const info = await c.create(newDishId(), { kind: 'recipe', recipeId: opts.recipeId, seed: opts.seed, overrides: { mutationPreset: opts.mutationPreset, founderMode: opts.founderMode, empty: opts.empty } }, opts.name);
    if (old && old.dishId !== info.dishId) c.dispose(old.dishId);
    enterDish(info, null);
  } finally {
    busy.value = false;
  }
}

export async function startRecipe(recipeId: string, name: string): Promise<void> {
  busy.value = true;
  try {
    const c = getClient();
    const old = dishInfo.value;
    // The new dish first: a failed start leaves the current dish exactly as it was.
    const info = await c.create(newDishId(), { kind: 'recipe', recipeId }, name);
    if (old && old.dishId !== info.dishId) c.dispose(old.dishId);
    enterDish(info, settings.value.showPrompts ? 'Press play and look closely.' : null);
  } finally {
    busy.value = false;
  }
}

export function setSpeed(speed: Speed): void {
  const info = dishInfo.value;
  if (!info) return;
  getClient().setSpeed(info.dishId, speed);
  if (speed > 0 && prompt.value === 'Press play and look closely.') prompt.value = null;
}

export function togglePause(): void {
  const m = meta.value;
  setSpeed(m && m.speed > 0 ? 0 : 1);
}

export function stepOnce(): void {
  const info = dishInfo.value;
  if (info) getClient().stepOnce(info.dishId);
}

export function select(sel: Selection | null): void {
  const info = dishInfo.value;
  selection.value = sel;
  candidates.value = null;
  if (!sel) {
    inspector.value = null;
    familyView.value = null;
    if (sheet.value === 'inspect') sheet.value = 'none';
  } else sheet.value = 'inspect';
  renderer?.select(sel?.kind === 'entity' ? sel.birthId : null, sel?.kind === 'cell' ? sel.cell : null);
  if (info) syncView();
}

/**
 * The selection the worker is told about: the organism or cell only while the inspector sheet shows
 * it. The worker builds the inspector's live data from it and notes a card's "the inspector identifies
 * food use" step from it (P2.5), so an organism tapped earlier must not earn that step later, off
 * screen, after the inspector closed (Look, More, History, …). The highlight on the dish stays: it is
 * the renderer's own and never reaches the worker.
 */
export function inspectedSelection(): Selection | null {
  // Only while the dish screen itself is showing: leaving for Home or the Notebook keeps the sheet
  // state for the way back, but nothing is being inspected meanwhile.
  return route.value.name === 'dish' && sheet.value === 'inspect' ? selection.value : null;
}

let viewSent: { readonly dishId: string; readonly overlay: OverlayId | null; readonly selection: Selection | null } | null = null;

function sameSelection(a: Selection | null, b: Selection | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === 'entity' ? b.kind === 'entity' && a.birthId === b.birthId : b.kind === 'cell' && a.cell === b.cell;
}

/** Tell the worker what the open dish's view shows (overlay, inspected selection) when that changed. */
function syncView(): void {
  const info = dishInfo.value;
  if (!info) return;
  const next = { dishId: info.dishId, overlay: overlay.value, selection: inspectedSelection() };
  const last = viewSent;
  if (last && last.dishId === next.dishId && last.overlay === next.overlay && sameSelection(last.selection, next.selection)) return;
  viewSent = next;
  getClient().view(next.dishId, next.overlay, next.selection);
}

// The inspector sheet closing (or opening again, e.g. History's "Back to …") changes what the worker
// inspects; so does another dish or overlay. Nothing is sent before a dish is open.
effect(() => {
  void [sheet.value, selection.value, overlay.value, dishInfo.value, route.value];
  syncView();
});

// Leaving the dish screen (Home, Notebook, Settings, …) pauses the open dish, so Home's "paused where
// you left it" is true and nothing grows off screen (as with backgrounding). The comparison and
// experiment-run screens step their own copies and never run the dish itself.
effect(() => {
  const name = route.value.name;
  const info = dishInfo.value;
  if (!info || name === 'dish') return;
  const m = untracked(() => meta.value);
  if (m && m.speed > 0) getClient().setSpeed(info.dishId, 0);
});

/** "Where is its family?": ask the worker (read-only) for the organism's living relatives. */
export async function askFamily(birthId: number): Promise<FamilyAnswer | null> {
  const info = dishInfo.value;
  if (!info) return null;
  try {
    const f = await getClient().family(info.dishId, birthId);
    if (dishInfo.value?.dishId !== info.dishId) return null;
    familyView.value = f;
    return f;
  } catch (e) {
    showToast(`Couldn't look up the family: ${(e as Error).message}`, 3500);
    return null;
  }
}

export function clearFamily(): void {
  familyView.value = null;
}

/** "What changed?": open History at "What happened" for this organism's kind. */
export function openHistoryFor(species: number, birthId: number): void {
  historyFocus.value = { species, birthId };
  sheet.value = 'history';
}

/** Select an organism and bring it into view without changing zoom (a player action, not a jump). */
export function showOrganism(birthId: number, x: number, y: number): void {
  select({ kind: 'entity', birthId });
  const r = renderer;
  if (r) r.camera.centerOn(x, y);
}

export function setOverlay(id: OverlayId | null): void {
  overlay.value = id;
  syncView();
}

export async function sendCommand(payload: CommandPayload, undoable = true): Promise<void> {
  const info = dishInfo.value;
  if (!info) return;
  const id = `ui-${++commandCounter}`;
  const res = await getClient().command(info.dishId, id, payload, undoable);
  reportCommand(info, payload, res, renderer);
}

/** The player-facing outcome of a placement command (toast + placement ring on the dish it went to). */
function reportCommand(info: DishInfo, payload: CommandPayload, res: CommandResult | null, ring: DishRenderer | null): void {
  if (!res) return;
  if (payload.kind === 'inoculate') {
    const name = info.speciesNames[info.speciesIds.indexOf(payload.speciesId)] ?? payload.speciesId;
    if (res.accepted === 0) showToast(res.note === 'capacity' ? 'The dish is full.' : `No room here for ${name}.`);
    else showToast(res.rejected > 0 ? `Added ${res.accepted} ${name} (${res.rejected} didn't fit).` : `Added ${res.accepted} ${name}.`);
    ring?.placementRing(payload.x, payload.y, payload.radius);
  } else if (payload.kind === 'deposit') {
    const mat = info.materials.find((m) => m.id === payload.materialId);
    if (res.accepted === 0) showToast("That can't go there.");
    else showToast(`Added ${mat?.name.toLowerCase() ?? 'food'} to ${res.accepted} cells.`);
    const p = payload.points[payload.points.length - 1];
    if (p) ring?.placementRing(p[0], p[1], payload.radius);
  }
}

export async function undo(): Promise<void> {
  const info = dishInfo.value;
  if (!info) return;
  const ok = await getClient().undo(info.dishId);
  showToast(ok ? 'Undone — time rewound to before that change.' : 'Nothing to undo.');
}

export function setTool(t: Tool): void {
  tool.value = t;
}

export function speciesName(idx: number): string {
  return dishInfo.value?.speciesNames[idx] ?? '?';
}

// ---------------------------------------------------------------------------------------------
// Comparison (SPEC §13.4, UX §5.6). UI/worker state only: the worker holds the baseline and the two
// arm worlds; the UI holds the prediction, the conclusion and the two viewports' renderers.

export type CompareArm = 'A' | 'B';
export type Conclusion = 'supports' | 'contradicts' | 'cantTell';

/** Per-arm facts from the latest snapshot (tick and living count), for the viewport labels. */
export interface ArmMeta {
  readonly tick: number;
  readonly count: number;
}

/** Offered horizons in simulated seconds; null = "until I stop" (CT §12.10). */
export const COMPARE_HORIZONS: readonly (number | null)[] = [60, 180, 600, null];

export const compareState = signal<ComparisonState | null>(null);
export const comparePrediction = signal<string>('');
export const compareHorizon = signal<number | null>(60);
export const compareConclusion = signal<Conclusion | null>(null);
export const compareNote = signal<string>('');
export const compareCardSaved = signal<boolean>(false);
export const compareArmMeta = signal<Readonly<Record<CompareArm, ArmMeta | null>>>({ A: null, B: null });
/** Which arm a phone shows (large screens show both side by side). */
export const compareShown = signal<CompareArm>('B');

const compareRenderers: Record<CompareArm, DishRenderer | null> = { A: null, B: null };
const compareLastGeometry: Record<CompareArm, SnapshotMsg | null> = { A: null, B: null };
const compareLastSnapshot: Record<CompareArm, SnapshotMsg | null> = { A: null, B: null };
/** The arm whose camera the player moved last; the other follows it (synced cameras). */
let cameraLeader: CompareArm = 'B';
let compareCounter = 0;

function onCompareState(s: ComparisonState): void {
  const cur = compareState.value;
  if (!cur || cur.compareId !== s.compareId) return; // a closed or foreign comparison
  compareState.value = s;
  // SPEC §14.2: autosave on comparison completion (the source dish; comparisons never enter saves).
  if (s.status === 'complete' && cur.status !== 'complete') void autosave();
}

function onCompareSnapshot(arm: CompareArm, s: SnapshotMsg): void {
  if (s.geometry) compareLastGeometry[arm] = s;
  compareLastSnapshot[arm] = s;
  compareRenderers[arm]?.applySnapshot(s);
  compareArmMeta.value = { ...compareArmMeta.value, [arm]: { tick: s.tick, count: s.count } };
}

/** A comparison viewport's renderer attaches (or detaches with null); replays what it missed. */
export function attachCompareRenderer(arm: CompareArm, r: DishRenderer | null): void {
  compareRenderers[arm] = r;
  if (!r) return;
  const info = dishInfo.value;
  r.setOptions({ reducedMotion: settings.value.reducedMotion, overlayOpacity: settings.value.overlayOpacity });
  if (info) r.setSpecies(info.speciesIds, info.speciesAssets);
  const geo = compareLastGeometry[arm];
  const last = compareLastSnapshot[arm];
  if (geo) r.applyGeometry(geo);
  if (last) r.applySnapshot(last);
  const other = compareRenderers[arm === 'A' ? 'B' : 'A'];
  if (other) copyCamera(other, r);
}

export function getCompareRenderer(arm: CompareArm): DishRenderer | null {
  return compareRenderers[arm];
}

function copyCamera(from: DishRenderer, to: DishRenderer): void {
  const a = from.camera;
  const b = to.camera;
  if (b.cx === a.cx && b.cy === a.cy && b.zoom === a.zoom) return;
  b.cx = a.cx;
  b.cy = a.cy;
  b.zoom = a.zoom;
  b.followEntityId = null;
}

/** The player moved this arm's camera: the other viewport follows it. */
export function leadCamera(arm: CompareArm): void {
  cameraLeader = arm;
  syncCompareCameras();
}

/** Keep the two viewports looking at the same place (called every animation frame). */
export function syncCompareCameras(): void {
  const lead = compareRenderers[cameraLeader];
  const follow = compareRenderers[cameraLeader === 'A' ? 'B' : 'A'];
  if (lead && follow) copyCamera(lead, follow);
}

export function showCompareArm(arm: CompareArm): void {
  compareShown.value = arm;
  cameraLeader = arm;
}

/**
 * "Compare": the worker captures the current dish once as the baseline and realizes A and B from it;
 * the dish itself is paused and left exactly as it is (a blocking panel, UX §2).
 */
export async function openCompare(): Promise<void> {
  const info = dishInfo.value;
  if (!info || compareState.value) return;
  busy.value = true;
  try {
    const n = ++compareCounter;
    const base = `${info.dishId}-cmp${n}`;
    const ids = { compareId: base, aDishId: `${base}-A`, bDishId: `${base}-B` };
    compareLastGeometry.A = compareLastGeometry.B = null;
    compareLastSnapshot.A = compareLastSnapshot.B = null;
    batch(() => {
      // Set before the request so the arms' first snapshots are routed to the comparison.
      compareState.value = {
        ...ids,
        sourceDishId: info.dishId,
        baselineTick: meta.value?.tick ?? 0,
        status: 'setup',
        horizonTicks: null,
        ticksRun: 0,
        speed: 4,
        priorSpeed: meta.value?.speed ?? 0,
        interventions: [],
        results: null,
        error: null,
      };
      comparePrediction.value = '';
      compareHorizon.value = 60;
      compareConclusion.value = null;
      compareNote.value = '';
      compareCardSaved.value = false;
      compareArmMeta.value = { A: null, B: null };
      compareShown.value = 'B';
      cameraLeader = 'B';
    });
    const state = await getClient().compareStart(info.dishId, ids);
    batch(() => {
      compareState.value = state;
      selection.value = null;
      inspector.value = null;
      familyView.value = null;
      candidates.value = null;
      tool.value = { kind: 'look' };
      sheet.value = 'none';
      route.value = { name: 'compare' };
    });
  } catch (e) {
    compareState.value = null;
    showToast(`Couldn't start a comparison: ${(e as Error).message}`, 4000);
  } finally {
    busy.value = false;
  }
}

/** Queue the one change on B through the ordinary command path (a paused edit on B only). */
export async function queueOnB(payload: CommandPayload): Promise<void> {
  const info = dishInfo.value;
  const c = compareState.value;
  if (!info || !c || c.status !== 'setup') return;
  const { result, error } = await getClient().commandAck(c.bDishId, `cmp-${++commandCounter}`, payload, true);
  if (error) {
    showToast(error, 3500);
    return;
  }
  reportCommand(info, payload, result, compareRenderers.B);
}

export async function clearCompareChange(): Promise<void> {
  const c = compareState.value;
  if (!c) return;
  try {
    compareState.value = await getClient().compareReset(c.compareId);
    showToast('Change cleared: B is an exact copy of A again.');
  } catch (e) {
    showToast((e as Error).message, 3500);
  }
}

export async function runCompare(): Promise<void> {
  const c = compareState.value;
  if (!c || c.status !== 'setup') return;
  const h = compareHorizon.value;
  try {
    compareState.value = await getClient().compareRun(c.compareId, h === null ? null : h * 10, 4);
    tool.value = { kind: 'look' };
    sheet.value = 'none';
  } catch (e) {
    showToast(`Couldn't run the comparison: ${(e as Error).message}`, 4000);
  }
}

/** Pacing only: both copies always receive the same number of ticks. */
export function setCompareSpeed(speed: CompareSpeed): void {
  const c = compareState.value;
  if (!c || c.status !== 'running') return;
  compareState.value = { ...c, speed };
  getClient().compareSpeed(c.compareId, speed);
}

export async function stopCompare(): Promise<void> {
  const c = compareState.value;
  if (!c || c.status !== 'running') return;
  try {
    compareState.value = await getClient().compareStop(c.compareId);
  } catch (e) {
    showToast((e as Error).message, 3500);
  }
}

/**
 * Close (delete) the comparison: the worker discards A, B and the stored baseline. The dish the
 * comparison started from — and every save — is untouched; it resumes its prior run state.
 */
export async function closeCompare(): Promise<void> {
  const c = compareState.value;
  if (!c) {
    route.value = { name: 'dish' };
    return;
  }
  const client = getClient();
  try {
    await client.compareDelete(c.compareId);
  } catch {
    /* already gone: nothing else to discard */
  }
  compareRenderers.A = compareRenderers.B = null;
  compareLastGeometry.A = compareLastGeometry.B = null;
  compareLastSnapshot.A = compareLastSnapshot.B = null;
  batch(() => {
    compareState.value = null;
    compareArmMeta.value = { A: null, B: null };
    tool.value = { kind: 'look' };
    sheet.value = 'none';
    route.value = { name: 'dish' };
  });
  client.activate(c.sourceDishId);
  if (c.priorSpeed > 0) client.setSpeed(c.sourceDishId, c.priorSpeed);
  showToast('Comparison closed. Your dish is exactly as you left it.', 3000);
}

/** A saved result card (UI state on this device; the Notebook lists them from Phase 4). */
export interface CompareCard {
  readonly version: 1;
  readonly savedAt: string;
  readonly dishName: string;
  readonly recipeId: string | null;
  readonly seed: number;
  readonly baselineTick: number;
  readonly ticks: number;
  readonly change: string;
  readonly prediction: string;
  readonly conclusion: Conclusion | null;
  readonly note: string;
  readonly label: string;
  readonly hashes: { readonly a: string; readonly b: string };
  readonly rows: readonly { readonly key: string; readonly species?: number; readonly a: number; readonly b: number; readonly diff: number }[];
}

export const COMPARE_CARDS_KEY = 'pixelmeba.compareCards';
const COMPARE_CARDS_MAX = 50;

export function loadCompareCards(): CompareCard[] {
  try {
    const raw = localStorage.getItem(COMPARE_CARDS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as CompareCard[]) : [];
  } catch {
    return [];
  }
}

export function saveCompareCard(change: string): boolean {
  const c = compareState.value;
  const info = dishInfo.value;
  const r = c?.results;
  if (!c || !info || !r) return false;
  const card: CompareCard = {
    version: 1,
    savedAt: new Date().toISOString(),
    dishName: info.name,
    recipeId: info.recipeId,
    seed: info.seed,
    baselineTick: r.baselineTick,
    ticks: r.ticks,
    change,
    prediction: comparePrediction.value,
    conclusion: compareConclusion.value,
    note: compareNote.value,
    label: r.label,
    hashes: { a: r.a.hash, b: r.b.hash },
    rows: r.rows,
  };
  try {
    localStorage.setItem(COMPARE_CARDS_KEY, JSON.stringify([card, ...loadCompareCards()].slice(0, COMPARE_CARDS_MAX)));
    compareCardSaved.value = true;
    showToast('Result card saved on this device.');
    return true;
  } catch {
    showToast("Couldn't save the result card on this device.", 3500);
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Experiment cards (P2.5; SPEC §13.2; UX §1 Notebook → Experiments). The worker realizes a card from
// its recorded recipe and seed as a new paused dish; a paired card's run is a comparison whose one
// change is the card's. When the card's observation gate is reached the worker posts a stamp, the
// journal records it and the world keeps running. Nothing here can change a card's recipe or seed.

export const experimentCards = signal<readonly ExperimentCardView[] | null>(null);
export const experimentCardsError = signal<string | null>(null);
/** The card started most recently in this session (its paired run, or its single dish). */
export const activeExperiment = signal<{ readonly cardId: string; readonly dishId: string; readonly paired: boolean } | null>(null);
/** The journal entry stamped by the open paired run (its conclusion is recorded there). */
export const experimentStampEntry = signal<string | null>(null);

export function experimentCard(id: string): ExperimentCardView | null {
  return experimentCards.value?.find((c) => c.id === id) ?? null;
}

/** The cards this build ships, from the worker (loaded once). */
export async function loadExperimentCards(): Promise<void> {
  if (experimentCards.value) return;
  try {
    experimentCards.value = await getClient().experimentCatalog();
    experimentCardsError.value = null;
  } catch (e) {
    experimentCardsError.value = (e as Error).message;
  }
}

function stampMeasures(card: ExperimentCardView | null, measured: { readonly A: Readonly<Record<string, number>>; readonly B: Readonly<Record<string, number>> | null }): JournalMeasure[] {
  const ids = card ? card.measurements : Object.keys(measured.A);
  return ids
    .filter((id) => measured.A[id] !== undefined)
    .map((id) => {
      const a = measured.A[id]!;
      const b = measured.B ? (measured.B[id] ?? null) : null;
      return {
        id,
        label: card ? measureLabel(card, id) : id,
        a: formatMeasure(id, a, measured.A),
        b: b === null ? null : formatMeasure(id, b, measured.B),
        diff: b === null ? null : formatDiff(id, a, b, measured.A, measured.B),
        rawA: a,
        rawB: b,
      };
    });
}

/** The player closed the dish's "the stamp needs one more step" notice. */
export function dismissExperimentWaiting(): void {
  experimentWaiting.value = null;
}

let experimentNoticeSeq = 0;

function onExperimentNotice(m: ExperimentNotice): void {
  const seq = ++experimentNoticeSeq;
  if (m.type === 'experimentWaiting') {
    // The measured gate held; the stamp waits for the steps named here (worker state, never the world's).
    const show = () => {
      if (seq !== experimentNoticeSeq) return; // a later notice (the stamp, or an end) came first
      const c = experimentCard(m.cardId);
      const text = c ? waitingStepsText(c, m.reachedAtSecond, m.missing) : `The Journal stamp for “${m.cardId}” waits for a step listed on its card.`;
      experimentWaiting.value = { dishId: m.dishId, cardId: m.cardId, text };
    };
    if (experimentCards.value) show();
    else void loadExperimentCards().then(show);
    return;
  }
  if (experimentWaiting.value?.dishId === m.dishId) experimentWaiting.value = null;
  const card = experimentCard(m.type === 'experimentEnded' ? m.cardId : m.stamp.stamp.experimentId);
  if (m.type === 'experimentEnded') {
    // A dish reopened from a save may arrive before this session has read the cards.
    // The reason replaces the card's start prompt ("…gets a stamp when the observation is complete") on
    // the dish it concerns, so a command's own toast arriving in the same frame cannot hide it and the
    // screen never keeps promising a stamp that will not come.
    const show = () => {
      const text = experimentEndedText(m.reason, experimentCard(m.cardId)?.title ?? m.cardId);
      if (dishInfo.value?.dishId === m.dishId) prompt.value = text;
      else showToast(text, m.reason === 'closed' ? 8000 : 5000);
    };
    if (experimentCards.value) show();
    else void loadExperimentCards().then(show);
    return;
  }
  const s = m.stamp;
  const cmp = compareState.value;
  const prediction = cmp?.experiment?.cardId === s.stamp.experimentId ? comparePrediction.value.trim() : '';
  const gate = card
    ? card.gate.map((c) => ({ text: clauseText(card, c), value: formatMeasure(c.measure, s.stamp.values[`${c.arm}:${c.measure}`] ?? Number.NaN) }))
    : Object.keys(s.stamp.values).map((k) => ({ text: k, value: String(s.stamp.values[k]) }));
  const { entry, stored } = addJournalEntry({
    kind: 'experimentStamp',
    experimentId: s.stamp.experimentId,
    title: s.title,
    journalStamp: s.stamp.journalStamp,
    label: s.label,
    labels: s.labels,
    recordedAt: new Date().toISOString(),
    reachedAtSecond: s.stamp.reachedAtSecond,
    seed: s.stamp.seed,
    recipeId: s.stamp.recipeId,
    recipeRevision: s.stamp.recipeRevision,
    contentVersion: s.stamp.contentVersion,
    contentHash: s.stamp.contentHash,
    dishName: dishInfo.value?.name ?? s.title,
    gate,
    measures: stampMeasures(card, s.measured),
    prediction,
  });
  journalUnseen.value += 1;
  if (cmp?.experiment?.cardId === s.stamp.experimentId) experimentStampEntry.value = entry.id;
  showToast(stampToastText(s.stamp.journalStamp, s.measured.B !== null, stored), 4500);
}

/**
 * Start a card as a new paused dish (SPEC §13.2). The current dish is kept in Continue first (a failed
 * write starts nothing). A paired card opens its paired run with the card's change already on B and
 * the prediction note shown; a single-arm card opens its dish, whose gate the worker watches.
 */
export async function startExperiment(cardId: string): Promise<void> {
  const card = experimentCard(cardId);
  if (!card || busy.value) return;
  if (compareState.value) {
    showToast('Close the open comparison first.', 3500);
    return;
  }
  busy.value = true;
  try {
    const old = dishInfo.value;
    if (old && !(await autosave())) {
      showToast('Your current dish could not be kept in Continue, so the experiment was not started. Nothing changed.', 5000);
      return;
    }
    const c = getClient();
    const dishId = newDishId();
    if (card.paired) {
      const base = `${dishId}-xp`;
      const ids = { compareId: base, aDishId: `${base}-A`, bDishId: `${base}-B` };
      compareLastGeometry.A = compareLastGeometry.B = null;
      compareLastSnapshot.A = compareLastSnapshot.B = null;
      experimentStampEntry.value = null;
      batch(() => {
        // Set before the request so the arms' first snapshots are routed to the paired run.
        compareState.value = { ...ids, sourceDishId: dishId, baselineTick: 0, status: 'setup', horizonTicks: null, ticksRun: 0, speed: 4, priorSpeed: 0, interventions: [], results: null, error: null };
        comparePrediction.value = '';
        compareHorizon.value = null;
        compareConclusion.value = null;
        compareNote.value = '';
        compareCardSaved.value = false;
        compareArmMeta.value = { A: null, B: null };
        compareShown.value = 'B';
        cameraLeader = 'B';
      });
      let started: Awaited<ReturnType<SimClient['experimentStart']>>;
      try {
        started = await c.experimentStart(cardId, dishId, ids);
      } catch (e) {
        compareState.value = null;
        throw e;
      }
      if (old && old.dishId !== started.info.dishId) c.dispose(old.dishId);
      enterDish(started.info, null);
      batch(() => {
        compareState.value = started.compare;
        route.value = { name: 'experimentRun' };
      });
    } else {
      const { info } = await c.experimentStart(cardId, dishId, null);
      if (old && old.dishId !== info.dishId) c.dispose(old.dishId);
      enterDish(info, `${card.title}: press play and watch. Your Journal gets a stamp when the observation is complete; the dish keeps running.`);
    }
    activeExperiment.value = { cardId, dishId, paired: card.paired };
  } catch (e) {
    showToast(`The experiment could not start: ${(e as Error).message}`, 5000);
  } finally {
    busy.value = false;
  }
}

/** The player's conclusion for the open paired run; kept on its journal stamp when there is one. */
export function setExperimentConclusion(conclusion: Conclusion): void {
  compareConclusion.value = conclusion;
  const id = experimentStampEntry.value;
  if (id) updateJournalEntry(id, { conclusion });
}

/** Run both copies of a paired card for the card's own stopping point (the worker holds it to that). */
export async function runExperimentPair(): Promise<void> {
  const c = compareState.value;
  if (!c || c.status !== 'setup' || !c.experiment) return;
  try {
    compareState.value = await getClient().compareRun(c.compareId, c.experiment.horizonTicks, 4);
  } catch (e) {
    showToast(`Couldn't run the experiment: ${(e as Error).message}`, 4000);
  }
}

/** Close a paired card's run (its two copies are discarded) and go to the card's dish or the Journal. */
export async function closeExperimentRun(to: 'dish' | 'journal'): Promise<void> {
  await closeCompare();
  if (to === 'journal') route.value = { name: 'notebook', tab: 'journal' };
}
