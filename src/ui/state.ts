/**
 * UI state (Preact signals) and the controller that talks to the worker. Views read signals and call
 * actions; nothing here mutates simulation state except by sending commands.
 */
import { batch, signal } from '@preact/signals';
import type { CommandPayload } from '@sim/commands';
import { SimClient } from '@worker/client';
import type { DishInfo, InspectorPayload, OverlayId, Selection, SnapshotMsg, Speed } from '@worker/protocol';
import type { DishRenderer } from '@render/renderer';
import { clearFeed, pushFeed } from './feed';

export type Route =
  | { readonly name: 'home' }
  | { readonly name: 'play' }
  | { readonly name: 'dish' }
  | { readonly name: 'guide' }
  | { readonly name: 'settings' }
  | { readonly name: 'about' }
  | { readonly name: 'saves' }
  | { readonly name: 'newDish' };

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
}

export const route = signal<Route>({ name: 'home' });
export const dishInfo = signal<DishInfo | null>(null);
export const meta = signal<SnapMeta | null>(null);
export const selection = signal<Selection | null>(null);
export const inspector = signal<InspectorPayload | null>(null);
export const candidates = signal<{ x: number; y: number; items: { birthId: number; species: number }[] } | null>(null);
export const tool = signal<Tool>({ kind: 'look' });
export const sheet = signal<'none' | 'addLife' | 'feed' | 'inspect' | 'more' | 'save' | 'history'>('none');
export const overlay = signal<OverlayId | null>(null);
export const overlayMax = signal<number>(0);
export const toast = signal<string | null>(null);
export const prompt = signal<string | null>(null);
export const busy = signal<boolean>(false);
export const settings = signal<Settings>(loadSettings());

let client: SimClient | null = null;
let renderer: DishRenderer | null = null;
/** Last snapshot that carried geometry, replayed into a renderer that attaches later. */
let lastGeometrySnapshot: SnapshotMsg | null = null;
let lastSnapshot: SnapshotMsg | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let commandCounter = 0;

function loadSettings(): Settings {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const base: Settings = { reducedMotion: reduce, overlayOpacity: 0.45, showPrompts: true };
  try {
    const raw = localStorage.getItem('pixelmeba.settings');
    return raw ? { ...base, ...(JSON.parse(raw) as Partial<Settings>) } : base;
  } catch {
    return base;
  }
}

export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
  try {
    localStorage.setItem('pixelmeba.settings', JSON.stringify(settings.value));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
  renderer?.setOptions({ reducedMotion: settings.value.reducedMotion, overlayOpacity: settings.value.overlayOpacity });
}

export function getClient(): SimClient {
  if (!client) {
    client = SimClient.create();
    client.onSnapshot(onSnapshot);
    client.onError((e) => showToast(`Something went wrong and the dish was paused: ${e.message}`));
  }
  return client;
}

export function attachRenderer(r: DishRenderer | null): void {
  renderer = r;
  if (r) {
    r.setOptions({ reducedMotion: settings.value.reducedMotion, overlayOpacity: settings.value.overlayOpacity });
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
    tool.value = { kind: 'look' };
    sheet.value = 'none';
    overlay.value = null;
    prompt.value = promptText;
    route.value = { name: 'dish' };
  });
  renderer?.setSpecies(info.speciesIds, info.speciesAssets);
  lastAutosaveTick = info.tick;
}

let lastAutosaveTick = -1;

/** Autosave the active dish if it changed since the last autosave (SPEC §14.2). */
export async function autosave(): Promise<void> {
  const info = dishInfo.value;
  const m = meta.value;
  if (!info || !m || m.tick === lastAutosaveTick) return;
  try {
    await getClient().autosave(info.dishId);
    lastAutosaveTick = m.tick;
  } catch (e) {
    showToast(`Autosave failed; your previous save is intact. (${(e as Error).message})`, 4000);
  }
}

export async function saveToSlot(slotId: string, name: string): Promise<boolean> {
  const info = dishInfo.value;
  if (!info) return false;
  try {
    const s = await getClient().saveSlot(info.dishId, slotId, name);
    dishInfo.value = { ...info, name: s.name };
    showToast(`Saved "${s.name}".`);
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
    if (old) c.dispose(old.dishId);
    const info = await c.create(newDishId(), { kind: 'recipe', recipeId: opts.recipeId, seed: opts.seed, overrides: { mutationPreset: opts.mutationPreset, founderMode: opts.founderMode, empty: opts.empty } }, opts.name);
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
    if (old) c.dispose(old.dishId);
    const info = await c.create(newDishId(), { kind: 'recipe', recipeId }, name);
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
    if (sheet.value === 'inspect') sheet.value = 'none';
  } else sheet.value = 'inspect';
  renderer?.select(sel?.kind === 'entity' ? sel.birthId : null, sel?.kind === 'cell' ? sel.cell : null);
  if (info) getClient().view(info.dishId, overlay.value, sel);
}

export function setOverlay(id: OverlayId | null): void {
  overlay.value = id;
  const info = dishInfo.value;
  if (info) getClient().view(info.dishId, id, selection.value);
}

export async function sendCommand(payload: CommandPayload, undoable = true): Promise<void> {
  const info = dishInfo.value;
  if (!info) return;
  const id = `ui-${++commandCounter}`;
  const res = await getClient().command(info.dishId, id, payload, undoable);
  if (!res) return;
  if (payload.kind === 'inoculate') {
    const name = info.speciesNames[info.speciesIds.indexOf(payload.speciesId)] ?? payload.speciesId;
    if (res.accepted === 0) showToast(res.note === 'capacity' ? 'The dish is full.' : `No room here for ${name}.`);
    else showToast(res.rejected > 0 ? `Added ${res.accepted} ${name} (${res.rejected} didn't fit).` : `Added ${res.accepted} ${name}.`);
    renderer?.placementRing(payload.x, payload.y, payload.radius);
  } else if (payload.kind === 'deposit') {
    const mat = info.materials.find((m) => m.id === payload.materialId);
    if (res.accepted === 0) showToast("That can't go there.");
    else showToast(`Added ${mat?.name.toLowerCase() ?? 'food'} to ${res.accepted} cells.`);
    const p = payload.points[payload.points.length - 1];
    if (p) renderer?.placementRing(p[0], p[1], payload.radius);
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
