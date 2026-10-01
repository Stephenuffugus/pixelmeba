/**
 * UI state (Preact signals) and the controller that talks to the worker. Views read signals and call
 * actions; nothing here mutates simulation state except by sending commands.
 */
import { batch, effect, signal, untracked } from '@preact/signals';
import type { CommandPayload, CommandResult } from '@sim/commands';
import { SimClient } from '@worker/client';
import type { CompareSpeed, ComparisonState } from '@worker/comparison';
import type { DishInfo, FamilyAnswer, InspectorPayload, OverlayId, Selection, SnapshotMsg, Speed } from '@worker/protocol';
import type { NewDishPreview, RecipeOverrides } from '@worker/protocol';
import type { EvolutionState } from '@sim/mutation';
import { presetChangedToast, presetChangeText, type PresetId } from './strings/modes';
import type { DishRenderer } from '@render/renderer';
import { clearFeed, pushFeed } from './feed';
import { feed } from './feed';
import type { ExperimentCardView } from '@sim/experiments';
import type { ExperimentNotice, WorkerErrorNotice } from '@worker/client';
import { addJournalEntry, journalUnseen, updateJournalEntry, type JournalMeasure } from './journal';
import { JOURNAL_MAX, mergeJournal, setJournalSink, type JournalEntry } from './journal';
import { journalRemovedText } from './journal';
import type { CheckpointNotice } from '@worker/client';
import { clauseText, experimentEndedText, formatDiff, formatMeasure, measureLabel, stampToastText, waitingStepsText } from './strings/experiments';
import type { KeepRefused } from '@worker/client';
import type { DishSource, KeepFrom, SlotSummary, WhatIfKeep, WhatIfPlan } from '@worker/protocol';
import { duplicatedText, KEEP_TEXT, keptLine, withKeptLine, type KeepVerb } from './strings/keep';
import type { KeepStep } from './panels/KeepChoice';
import { mountKeepHost } from './panels/KeepSheet';

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
  /** Automatic checkpoint ring (UX §2 Settings "checkpoint ring"; SPEC §10.7; P2.8). Off unless chosen. */
  readonly checkpointRing?: boolean;
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
export const sheet = signal<'none' | 'addLife' | 'feed' | 'inspect' | 'more' | 'save' | 'history' | 'lineage' | 'evolution'>('none');
/** P2.2: the open dish's evolution setting, rates and recorded changes (from its snapshots). */
export const evolution = signal<EvolutionState | null>(null);
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
  if (patch.checkpointRing !== undefined) getClient().setCheckpointRing(patch.checkpointRing === true);
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
    // P2.8: automatic checkpoints follow the Settings choice; journal entries of the open dish are kept with it.
    client.onCheckpoint(onCheckpointNotice);
    client.setCheckpointRing(settings.value.checkpointRing === true);
    setJournalSink(keepJournalWithDish);
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

/** The open dish's recorded module names by id (its world's content, never this build's catalog). */
function moduleNamesOf(info: DishInfo): (id: string) => string | undefined {
  const modules = info.registry?.modules ?? [];
  return (id) => modules.find((m) => m.id === id)?.name;
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
  if (dishInfo.value) pushFeed(s.events, dishInfo.value.speciesNames, moduleNamesOf(dishInfo.value));
  if (s.evolution) {
    evolution.value = s.evolution;
    syncEvolutionFeed(s.evolution);
    // The dish's description follows the setting in effect (What if? Details, More), not the one it opened with.
    const info = dishInfo.value;
    if (info && info.mutationPreset !== s.evolution.preset) dishInfo.value = { ...info, mutationPreset: s.evolution.preset };
  }
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

/**
 * History's "What happened" lists every recorded evolution-setting change (P2.2): one line per
 * accepted command still in the dish's command log, at the tick it took effect (newest first, like the
 * feed). Undo removes the command from the log, so its line goes too; a reopened dish lists the changes
 * it recorded. The event feed drops its oldest lines as new events arrive; a recorded change is put
 * back at its time, so it stays listed as long as the dish records it.
 */
function syncEvolutionFeed(e: EvolutionState): void {
  const want = e.changes.map((c) => `evolution:${c.commandId}`);
  const have = feed.value.filter((l) => l.key.startsWith('evolution:')).map((l) => l.key);
  if (have.length === want.length && want.every((k) => have.includes(k))) return;
  let lines = feed.value.filter((l) => !l.key.startsWith('evolution:'));
  for (const c of e.changes) {
    const line = { key: `evolution:${c.commandId}`, tick: c.tick, text: presetChangeText(c), species: -1, count: 1 };
    // Oldest change first: each later one goes above the earlier ones and above older events.
    const at = lines.findIndex((l) => l.tick < c.tick || (l.tick === c.tick && l.key.startsWith('evolution:')));
    lines = at < 0 ? [...lines, line] : [...lines.slice(0, at), line, ...lines.slice(at)];
  }
  feed.value = lines;
}

/** New Dish (P2.2): exactly what a dish with these choices would start with (the worker builds and discards it). */
export async function newDishPreview(recipeId: string, seed: number, overrides: RecipeOverrides): Promise<NewDishPreview> {
  return getClient().newDishPreview(recipeId, seed, overrides);
}

/** Change the open dish's evolution setting during play (P2.2): one undoable, timestamped command. */
export async function setEvolutionPreset(preset: PresetId): Promise<boolean> {
  const info = dishInfo.value;
  if (!info) return false;
  const res = await getClient().command(info.dishId, `ui-${++commandCounter}`, { kind: 'setMutationPreset', preset }, true);
  if (res && res.accepted > 0) {
    showToast(presetChangedToast(preset), 3500);
    return true;
  }
  return false;
}

export function showToast(text: string, ms = 2600): void {
  toast.value = text;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = null), ms);
}

function newDishId(): string {
  return `dish-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Show a dish that was just opened or started. The next autosave (every 30 s, going to the background,
 * leaving the page) writes it to Continue unless Continue already holds exactly its file, so Continue is
 * the last dish (UX §2 "Home ─ Continue (last dish …)"; D-0033 fix round 2) and a dish opened from
 * Continue itself is not written again until it changes (the worker decides: see autosave).
 */
function enterDish(info: DishInfo, promptText: string | null): void {
  clearFeed();
  evolution.value = null;
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
  // P2.8: a dish opened from a save or a file brings its journal entries into this device's Notebook.
  void syncDishJournal(info.dishId);
}

/**
 * An autosave event for the open dish (SPEC §14.2: every 30 s while it is open, going to the background,
 * leaving the page; a manual save and a comparison's completion too). D-0033 fix round 3: the worker
 * builds the dish's file and writes Continue unless Continue already holds exactly that file (same
 * checksum over the canonical serialized world, same name, same binding; host `autosave`). The UI no
 * longer skips an event because the tick has not moved: a change made while paused (Add Life, a Lab
 * stroke, a rename or pin, a journal note, an evolution-setting change) keeps the tick, and it reaches
 * Continue at the next event. An unchanged dish is never written again. Resolves false when the write
 * failed (the previous Continue is intact).
 */
export async function autosave(): Promise<boolean> {
  const info = dishInfo.value;
  if (!info) return true; // no dish open: nothing to autosave
  try {
    await getClient().autosave(info.dishId);
    return true;
  } catch (e) {
    showToast(`Autosave failed; your previous save is intact. (${(e as Error).message})`, 4000);
    return false;
  }
}

/** The toast after a manual save (D-0033 K: a quoted dish name takes curly quotes). */
export function savedToastText(name: string, continueUpdated: boolean): string {
  return continueUpdated ? `Saved “${name}”.` : `Saved “${name}”, but Continue could not be updated; it still opens your previous autosave.`;
}

export async function saveToSlot(slotId: string, name: string): Promise<boolean> {
  const info = dishInfo.value;
  if (!info) return false;
  try {
    const s = await getClient().saveSlot(info.dishId, slotId, name);
    dishInfo.value = { ...info, name: s.name };
    // A manual save is an autosave event too (SPEC §14.2), so Continue opens this same moment (D-0033 fix
    // round 1: a Continue older than the slot it names is never bound to it again; the slot's new record
    // is a new binding, so the autosave writes). Confirm only once both writes have landed: leaving the
    // page right after "Saved" must not lose Continue.
    const continueUpdated = await autosave();
    showToast(savedToastText(s.name, continueUpdated), continueUpdated ? 2600 : 4000);
    return true;
  } catch (e) {
    showToast(`Couldn't save; your previous save is intact. (${(e as Error).message})`, 4000);
    return false;
  }
}

/**
 * Saved dishes → Open (a named slot, the autosave or an automatic checkpoint) and Home → Continue.
 * D-0033: the open dish is kept first (the save is read and checked before anything is kept; never into
 * the slot being opened). `label` names the save while the all-slots-used choice waits.
 */
export async function loadSlot(slotId: string, label = 'the saved dish'): Promise<ReplaceOutcome> {
  busy.value = true;
  try {
    const c = getClient();
    const checkpoint = slotId.startsWith('checkpoint-');
    const outcome = await replaceOpenDish(checkpoint ? 'checkpoint' : 'open', label, async (keepFrom) => {
      const old = dishInfo.value;
      const r = await c.loadSlotKeeping(slotId, newDishId(), keepFrom);
      if (!r.ok) return r;
      const { info, usedPredecessor, branch } = r;
      if (old && old.dishId !== info.dishId) c.dispose(old.dishId);
      // The next autosave writes it unless Continue already holds exactly its file (opened from Continue
      // itself, not from its predecessor): the worker compares (D-0033 fix round 3).
      enterDish(info, null);
      // P2.8: an automatic checkpoint is not where the player left a dish: it opens as a new branch.
      if (branch) {
        // P2.8 fix round 2: Continue follows the branch from the moment it opens, as the confirm and the
        // toast say (not only at the next autosave).
        const followed = await c.autosave(info.dishId).then(
          () => true,
          () => false,
        );
        showToast(withKeptLine(r.kept, checkpointOpenedText(branch, info.name, followed), false), 6000);
      } else {
        const opened = usedPredecessor ? 'The latest save was damaged, so the previous copy was opened.' : `Opened “${info.name}” — paused where you left it.`;
        // Opening Continue itself writes no Continue first, so there is nothing to say about it.
        showToast(withKeptLine(r.kept, opened, slotId !== 'autosave'), r.kept && keptLine(r.kept) ? 6000 : 3500);
      }
      return { ok: true };
    });
    if (outcome.kind === 'refused') showToast(outcome.message, 6000);
    return outcome;
  } catch (e) {
    const message = `That save could not be opened: ${(e as Error).message}`;
    showToast(message, 5000);
    return { kind: 'refused', message };
  } finally {
    busy.value = false;
  }
}

/** Import a .pixelmeba file (Saved dishes, More). D-0033: the file is checked first, then the open dish is kept. */
export async function importFile(file: File): Promise<void> {
  busy.value = true;
  try {
    const text = await file.text();
    const c = getClient();
    const outcome = await replaceOpenDish('import', file.name, async (keepFrom) => {
      const old = dishInfo.value;
      const r = await c.importDishKeeping(text, newDishId(), keepFrom);
      if (!r.ok) return r;
      if (old && old.dishId !== r.info.dishId) c.dispose(old.dishId);
      enterDish(r.info, null);
      showToast(withKeptLine(r.kept, `Imported “${r.info.name}” — paused.`), r.kept && keptLine(r.kept) ? 6000 : 3000);
      return { ok: true };
    });
    if (outcome.kind === 'refused') showToast(outcome.message, 6000);
  } catch (e) {
    showToast(`Nothing was changed: ${(e as Error).message}`, 5000);
  } finally {
    busy.value = false;
  }
}

/** A dish file the player keeps: `text` offered as a download named `filename` (Export; the keep flow's export). */
export function saveTextFile(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'application/vnd.pixelmeba+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Export a dish as a file the player keeps (no toast); resolves the file name. */
export async function exportDishFile(dishId: string): Promise<string> {
  const { text, filename } = await getClient().exportDish(dishId, false);
  saveTextFile(text, filename);
  return filename;
}

/**
 * Export the dish Continue holds, exactly as stored (the keep flow while no dish is open; D-0033 fix
 * round 1); resolves the file name.
 */
export async function exportContinueFile(): Promise<string> {
  const { text, filename } = await getClient().exportSave('autosave');
  saveTextFile(text, filename);
  return filename;
}

/** The ten named slots as Saved dishes lists them (the autosave and checkpoints left out). */
export async function namedSlots(): Promise<readonly SlotSummary[]> {
  const { slots } = await getClient().listSlots();
  return slots.filter((s) => s.slotId !== 'autosave' && !s.automatic);
}

export async function exportCurrent(strip: boolean): Promise<void> {
  const info = dishInfo.value;
  if (!info) return;
  try {
    const { text, filename } = await getClient().exportDish(info.dishId, strip);
    saveTextFile(text, filename);
    showToast(`Exported ${filename}.`);
  } catch (e) {
    showToast(`Export failed: ${(e as Error).message}`, 4000);
  }
}

/**
 * Duplicate dish (More, Lab Tools → Duplicate). D-0033: the copy takes the dish's place on screen, so the
 * dish is kept first like any replaced dish (its own slot, else the first empty one; nothing when that
 * slot already holds it exactly or it has not changed since it started; the Keep sheet when all ten are
 * used); then the copy of that same moment opens and the original is let go. The line says where the
 * original is (it used to say "unchanged" and then leave it unreachable).
 */
export async function duplicateCurrent(): Promise<void> {
  const info = dishInfo.value;
  if (!info) return;
  busy.value = true;
  try {
    const c = getClient();
    const outcome = await replaceOpenDish('duplicate', `${info.name} (copy)`, async (keepFrom) => {
      const r = await c.duplicateKeeping(info.dishId, newDishId(), keepFrom);
      if (!r.ok) return r;
      c.activate(r.info.dishId);
      c.dispose(info.dishId);
      enterDish(r.info, null);
      showToast(duplicatedText(r.kept), 5000);
      return { ok: true };
    });
    if (outcome.kind === 'refused') showToast(outcome.message, 6000);
  } catch (e) {
    showToast(`The dish was not duplicated; nothing was changed: ${(e as Error).message}`, 5000);
  } finally {
    busy.value = false;
  }
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

/**
 * New Dish → Create (P2.2). D-0033: the dish is built first, then the open dish is kept, then the new
 * one opens; `onStarted` runs once it is open (also after the all-slots-used choice).
 */
export async function startCustom(
  opts: {
    recipeId: string;
    name: string;
    seed: number;
    mutationPreset: 'standard' | 'accelerated' | 'fixed';
    founderMode: 'identical' | 'varied' | 'diverse';
    empty: boolean;
    /** P3.2: a habitat preset instead of the recipe's own (an 'Empty Gel Colony' start). */
    habitatId?: string;
  },
  onStarted?: (info: DishInfo) => void,
): Promise<ReplaceOutcome> {
  const source: DishSource = {
    kind: 'recipe',
    recipeId: opts.recipeId,
    seed: opts.seed,
    overrides: { mutationPreset: opts.mutationPreset, founderMode: opts.founderMode, empty: opts.empty, ...(opts.habitatId !== undefined ? { habitatId: opts.habitatId } : {}) },
  };
  return startDish(source, opts.name, null, onStarted);
}

/** The start prompt of a Play shelf dish (cleared when the dish first runs). */
const PLAY_PROMPT = 'Press play and look closely.';

/** The Play shelf's Start (P1.12). D-0033: the open dish is kept first. */
export async function startRecipe(recipeId: string, name: string): Promise<ReplaceOutcome> {
  const outcome = await startDish({ kind: 'recipe', recipeId }, name, settings.value.showPrompts ? PLAY_PROMPT : null);
  if (outcome.kind === 'refused') showToast(outcome.message, 6000);
  return outcome;
}

/** Create a dish in place of the open one, keeping the open one first (D-0033). */
async function startDish(source: DishSource, name: string, promptText: string | null, onStarted?: (info: DishInfo) => void): Promise<ReplaceOutcome> {
  busy.value = true;
  try {
    const c = getClient();
    return await replaceOpenDish('start', name, async (keepFrom) => {
      const old = dishInfo.value;
      // The new dish first: a failed start leaves the current dish exactly as it was.
      const r = await c.createKeeping(newDishId(), source, name, keepFrom);
      if (!r.ok) return r;
      if (old && old.dishId !== r.info.dishId) c.dispose(old.dishId);
      // The line about the dish that was kept joins the start prompt when there is one (a toast in the
      // same place would cover the prompt); otherwise it is a toast.
      const line = keptLine(r.kept);
      enterDish(r.info, promptText && line ? `${line} ${promptText}` : promptText);
      onStarted?.(r.info);
      if (line && !promptText) showToast(line, 5000);
      return { ok: true };
    });
  } finally {
    busy.value = false;
  }
}

// ---------------------------------------------------------------------------------------------
// D-0033: every action that replaces the open dish (Play shelf Start, New Dish Create, an experiment
// card's Start, Saved dishes → Open, Import; What if? has its own sheet) keeps it first through the
// worker's one keep step: its own slot, else the first empty one, and nothing when nothing needs
// keeping. With all ten slots used the player chooses in the Keep sheet (the shared KeepChoicePanel):
// export it and go ahead, deliberately replace a save, or Cancel (nothing changes, and the dish keeps
// its run state). A failed write refuses the replacement with a readable message.

/** How a replacing action ended for its caller. */
export type ReplaceOutcome =
  /** The new dish is open. */
  | { readonly kind: 'done' }
  /** All ten slots are used (or saving is unavailable): the Keep sheet asks the player. */
  | { readonly kind: 'choosing' }
  /** Nothing was replaced: `message` says why (readable as-is). */
  | { readonly kind: 'refused'; readonly message: string };

/** The Keep sheet's state while the player chooses how to keep the open dish. */
export interface KeepFlow {
  readonly verb: KeepVerb;
  /** What waits to open: the new dish's name, the save's, the file's or the card's. */
  readonly waiting: string;
  /** The open dish being kept (null: no dish is open, the dish Continue holds is kept), and its name. */
  readonly dishId: string | null;
  readonly name: string;
  readonly step: KeepStep;
  /** A slot the replacement may not use (the save being opened). */
  readonly exclude: string | null;
}

export const keepFlow = signal<KeepFlow | null>(null);
export const keepBusy = signal<boolean>(false);
export const keepNotice = signal<string | null>(null);

/**
 * One try of a replacing action with a way of keeping the open dish (`keepFrom.dishId` null: no dish is
 * open, so the worker keeps the dish Continue holds, if any; D-0033 fix round 1).
 */
type KeepAttempt = (keepFrom: KeepFrom) => Promise<{ readonly ok: true } | KeepRefused>;

let keepAttempt: KeepAttempt | null = null;
/** The open dish's run state when the action began: restored when nothing is replaced. */
let keepResume: { readonly dishId: string; readonly speed: Speed } | null = null;
/** The control that started the waiting action and the screen it was on (focus returns there on Cancel). */
let keepOpener: { readonly el: HTMLElement | null; readonly route: Route['name'] } | null = null;

/** Where focus returns when the Keep sheet closes without replacing the dish (null: leave it). */
export function keepReturnTarget(): HTMLElement | null {
  const o = keepOpener;
  if (!o || route.value.name !== o.route || typeof document === 'undefined') return null;
  if (o.el?.isConnected) return o.el;
  return document.querySelector<HTMLElement>('[data-testid="more"]');
}

/** Nothing was replaced: the dish carries on in the run state it had (only while it is on screen). */
function resumeKept(): void {
  const r = keepResume;
  keepResume = null;
  if (r && r.speed > 0 && dishInfo.value?.dishId === r.dishId && route.value.name === 'dish') getClient().setSpeed(r.dishId, r.speed);
}

function isFullRefusal(r: KeepRefused): r is KeepRefused & { readonly code: 'slots-full' | 'save-unavailable' } {
  return r.code === 'slots-full' || r.code === 'save-unavailable';
}

async function replaceOpenDish(verb: KeepVerb, waiting: string, attempt: KeepAttempt): Promise<ReplaceOutcome> {
  const open = dishInfo.value;
  const focused = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  keepOpener = { el: focused, route: route.value.name };
  // The kept dish holds one moment: pause it while it is kept (a running dish is possible behind More → Import).
  const speed = meta.value?.speed ?? 0;
  keepResume = open ? { dishId: open.dishId, speed } : null;
  if (open && speed > 0) getClient().setSpeed(open.dishId, 0);
  let r: { readonly ok: true } | KeepRefused;
  try {
    // With no dish open, the dish Continue holds is what the player left: the worker keeps it (if any).
    r = await attempt({ dishId: open?.dishId ?? null, keep: { kind: 'auto' } });
  } catch (e) {
    resumeKept();
    throw e;
  }
  if (r.ok) {
    keepResume = null;
    return { kind: 'done' };
  }
  if (isFullRefusal(r)) {
    keepAttempt = attempt;
    batch(() => {
      keepNotice.value = null;
      keepBusy.value = false;
      keepFlow.value = {
        verb,
        waiting,
        dishId: open?.dishId ?? null,
        name: r.name,
        step: { stage: 'choose', reason: r.code === 'slots-full' ? 'full' : 'unavailable' },
        exclude: r.exclude,
      };
    });
    mountKeepHost();
    return { kind: 'choosing' };
  }
  resumeKept();
  return { kind: 'refused', message: r.message };
}

/** The player's choice in the Keep sheet: try the waiting action again, keeping the dish that way. */
export async function continueKeep(keep: WhatIfKeep): Promise<void> {
  const flow = keepFlow.value;
  const attempt = keepAttempt;
  if (!flow || !attempt || keepBusy.value) return;
  batch(() => {
    keepBusy.value = true;
    keepNotice.value = null;
    busy.value = true;
  });
  try {
    const r = await attempt({ dishId: flow.dishId, keep });
    if (r.ok) {
      endKeepFlow(false);
      return;
    }
    // Refused again (e.g. the write failed): the choice stays open and says why; nothing was changed.
    const now = keepFlow.value ?? flow;
    batch(() => {
      if (isFullRefusal(r)) keepFlow.value = { ...now, step: { stage: 'choose', reason: r.code === 'slots-full' ? 'full' : 'unavailable' }, exclude: r.exclude };
      keepNotice.value = r.message;
    });
  } catch (e) {
    keepNotice.value = (e as Error).message;
  } finally {
    batch(() => {
      keepBusy.value = false;
      busy.value = false;
    });
  }
}

/** Cancel the Keep sheet: nothing was written, the dish is exactly as it was, in its run state. */
export function cancelKeep(): void {
  if (!keepFlow.value || keepBusy.value) return;
  endKeepFlow(true);
  showToast(KEEP_TEXT.cancelled, 3000);
}

function endKeepFlow(resume: boolean): void {
  keepAttempt = null;
  batch(() => {
    keepFlow.value = null;
    keepNotice.value = null;
  });
  if (resume) resumeKept();
  else keepResume = null;
}

/** All slots used → "Export it as a file": a real export of the open dish, then the action is offered. */
export async function exportBeforeKeep(): Promise<void> {
  const flow = keepFlow.value;
  if (!flow || keepBusy.value) return;
  keepBusy.value = true;
  try {
    const file = flow.dishId !== null ? await exportDishFile(flow.dishId) : await exportContinueFile();
    const now = keepFlow.value;
    if (now) keepFlow.value = { ...now, step: { stage: 'exported', file } };
  } catch (e) {
    keepNotice.value = KEEP_TEXT.exportFailed((e as Error).message);
  } finally {
    keepBusy.value = false;
  }
}

/** All slots used → "Replace a saved dish…": list the ten slots for a deliberate choice. */
export async function chooseKeepReplacement(): Promise<void> {
  const flow = keepFlow.value;
  if (!flow) return;
  try {
    const slots = await namedSlots();
    const now = keepFlow.value;
    if (now) keepFlow.value = { ...now, step: { stage: 'replace', slots, slotId: null } };
  } catch (e) {
    keepNotice.value = (e as Error).message;
  }
}

export function pickKeepReplacement(slotId: string): void {
  const flow = keepFlow.value;
  if (flow?.step.stage === 'replace' && slotId !== flow.exclude) keepFlow.value = { ...flow, step: { ...flow.step, slotId } };
}

/**
 * How the open dish (with none open, the dish Continue holds; D-0033 fix round 1) would be kept if an
 * action replaced it now (New Dish, Saved dishes' checkpoint confirmation, an experiment card), from the
 * worker's keep step; `opening`: the save the action opens. Null when the plan could not be read.
 */
export async function keepPlanNow(opening: string | null = null): Promise<WhatIfPlan | null> {
  try {
    return await getClient().keepPlan(dishInfo.value?.dishId ?? null, opening);
  } catch {
    return null;
  }
}

export function setSpeed(speed: Speed): void {
  const info = dishInfo.value;
  if (!info) return;
  getClient().setSpeed(info.dishId, speed);
  if (speed > 0 && prompt.value?.endsWith(PLAY_PROMPT)) prompt.value = null;
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
    // m4: say why. A deposit goes only into cells open to the water (SPEC §2.4: not stone, a wall or beyond the rim).
    if (res.accepted === 0) showToast("That can't go there: food can't go onto stone, a wall or beyond the rim. Tap open water.", 4000);
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
/** Queue the one change on B. Resolves to how much of it B accepted (0 when refused or failed). */
export async function queueOnB(payload: CommandPayload): Promise<number> {
  const info = dishInfo.value;
  const c = compareState.value;
  if (!info || !c || c.status !== 'setup') return 0;
  const { result, error } = await getClient().commandAck(c.bDishId, `cmp-${++commandCounter}`, payload, true);
  if (error) {
    showToast(error, 3500);
    return 0;
  }
  reportCommand(info, payload, result, compareRenderers.B);
  return result?.accepted ?? 0;
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

/** A saved result card (UI state on this device; Notebook → Journal lists them, G2 comprehension M1). */
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
    showToast('Result card saved on this device. Notebook → Journal lists it.', 4000);
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
  const { entry, stored, removed, problem } = addJournalEntry({
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
    // P2.8: the stamp belongs to the dish it was measured on, and is kept with that dish's saves.
    ...(dishInfo.value?.dishId === m.dishId ? { worldId: dishInfo.value.worldId } : {}),
  });
  // P2.8 fix round 2: a stamp the Journal cannot keep is refused with its reason (never listed, then lost).
  if (problem) {
    showToast(`Journal stamp: ${s.stamp.journalStamp}. It could not be added to your Journal (${problem}).`, 6000);
    return;
  }
  journalUnseen.value += 1;
  if (cmp?.experiment?.cardId === s.stamp.experimentId) experimentStampEntry.value = entry.id;
  showToast(
    `${stampToastText(s.stamp.journalStamp, s.measured.B !== null, stored)}${removed ? ` ${journalRemovedText(removed)}` : ''}`,
    removed ? 9000 : 4500,
  );
}

/**
 * Start a card as a new paused dish (SPEC §13.2). D-0033 (supersedes D-0027's "autosave to Continue
 * without writing a named slot"): the card's arms are realized first, then the open dish is kept like any
 * replaced dish (its own slot, else the first empty one, and Continue), then the card opens. A paired
 * card opens its paired run with the card's change already on B and the prediction note shown; a
 * single-arm card opens its dish, whose gate the worker watches.
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
    const outcome = await replaceOpenDish('experiment', card.title, (keepFrom) => startCard(card, keepFrom));
    if (outcome.kind === 'refused') showToast(outcome.message, 6000);
  } catch (e) {
    showToast(`The experiment could not start: ${(e as Error).message}`, 5000);
  } finally {
    busy.value = false;
  }
}

/** One try of a card's start with a way of keeping the open dish (see startExperiment). */
/**
 * D-0033: the line about the dish kept when a paired card started, shown in the run's setup panel
 * (a toast there would cover the A/B switch on a phone). Null when nothing was written.
 */
export const experimentKeptLine = signal<string | null>(null);

async function startCard(card: ExperimentCardView, keepFrom: KeepFrom): Promise<{ readonly ok: true } | KeepRefused> {
  const c = getClient();
  const old = dishInfo.value;
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
    let started: Awaited<ReturnType<SimClient['experimentStartKeeping']>>;
    try {
      started = await c.experimentStartKeeping(card.id, dishId, ids, keepFrom);
    } catch (e) {
      compareState.value = null;
      throw e;
    }
    if (!started.ok) {
      compareState.value = null;
      return started;
    }
    if (old && old.dishId !== started.info.dishId) c.dispose(old.dishId);
    enterDish(started.info, null);
    batch(() => {
      compareState.value = started.compare;
      experimentKeptLine.value = keptLine(started.kept) || null;
      route.value = { name: 'experimentRun' };
    });
  } else {
    const r = await c.experimentStartKeeping(card.id, dishId, null, keepFrom);
    if (!r.ok) return r;
    if (old && old.dishId !== r.info.dishId) c.dispose(old.dishId);
    // The line about the dish that was kept leads the card's start prompt (a toast would cover it).
    const line = keptLine(r.kept);
    const cardPrompt = `${card.title}: press play and watch. Your Journal gets a stamp when the observation is complete; the dish keeps running.`;
    enterDish(r.info, line ? `${line} ${cardPrompt}` : cardPrompt);
  }
  activeExperiment.value = { cardId: card.id, dishId, paired: card.paired };
  return { ok: true };
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
  experimentKeptLine.value = null;
  await closeCompare();
  if (to === 'journal') route.value = { name: 'notebook', tab: 'journal' };
}

// ---------------------------------------------------------------------------------------------
// P2.8: automatic checkpoints and the dish's journal. The ring itself lives in the worker (same
// atomic store as the slots); Settings only turns it on or off. Journal entries of the open dish are
// sent to the worker so its saves carry them (SPEC §14.1; D-0027).

/** The latest automatic checkpoint outcome of this session (Settings shows it), or null. */
export const lastCheckpoint = signal<CheckpointNotice | null>(null);
let lastCheckpointProblem: string | null = null;

/** Dish time as the dish clock shows it (m:ss; h:mm:ss past an hour). */
export function dishClock(tick: number): string {
  const s = Math.max(0, Math.floor(tick / 10));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * A save's moment as Saved dishes (Continue, the named slots and the automatic checkpoints) and Home's
 * Continue card say it, on the dish clock (D-0033 J: one time format per save; was "5 s simulated").
 */
export function atDishTime(tick: number): string {
  return `at ${dishClock(tick)} dish time`;
}

/** Home's Continue card while no dish is open: the dish Continue holds and its moment (D-0033 J). */
export function continueCardText(name: string, tick: number): string {
  return `${name} — ${atDishTime(tick)}. Opens paused.`;
}

/**
 * Settings' line about this session's latest automatic checkpoint (empty before the first). After a
 * refused or failed one it says what is still kept, and never claims earlier ones when there are none
 * (fix round 2).
 */
export function checkpointSettingText(n: CheckpointNotice | null): string {
  if (!n) return '';
  if (n.ok) return ` Latest: at ${dishClock(n.tick)} dish time (${n.kept} kept).`;
  const why = n.reason === 'storage-full' ? 'storage is nearly full' : n.reason === 'busy' ? 'the previous one was still being written' : 'the write failed';
  const kept = n.kept === 0 ? 'nothing was removed' : n.kept === 1 ? 'the earlier one is kept' : `the ${n.kept} earlier ones are kept`;
  return ` The latest one was not written (${why}); ${kept}.`;
}

/** Quiet on success (every simulated minute); a refused or failed checkpoint says so once per reason. */
export function onCheckpointNotice(n: CheckpointNotice): void {
  lastCheckpoint.value = n;
  if (n.ok) {
    lastCheckpointProblem = null;
    return;
  }
  const reason = n.reason ?? 'write-failed';
  if (reason === lastCheckpointProblem) return;
  lastCheckpointProblem = reason;
  const kept = n.kept === 1 ? 'Your earlier checkpoint is kept' : n.kept > 1 ? `Your ${n.kept} earlier checkpoints are kept` : 'Nothing was removed';
  showToast(
    reason === 'storage-full'
      ? `No automatic checkpoint at ${dishClock(n.tick)}: storage is nearly full. ${kept}, and your saves are untouched.`
      : reason === 'busy'
        ? `No automatic checkpoint at ${dishClock(n.tick)}: the previous one was still being written. ${kept}.`
        : `The automatic checkpoint at ${dishClock(n.tick)} could not be written. ${kept}, and your saves are untouched.`,
    6000,
  );
}

/**
 * Keep a journal entry with the open dish when it belongs to it (same world id): the worker stores it
 * with the dish and Continue is updated so the entry is in the dish's latest save. Best effort: the
 * device Notebook already has it.
 */
export function keepJournalWithDish(entry: JournalEntry): void {
  const info = dishInfo.value;
  if (!info || !entry.worldId || entry.worldId !== info.worldId) return;
  const c = getClient();
  void c
    .journalPut(info.dishId, entry)
    .then((kept) => (kept ? c.autosave(info.dishId) : null))
    .catch(() => undefined);
}

/** What opening an automatic checkpoint did, in words (Saved dishes → Open; D-0033 K: curly quotes). */
export function checkpointOpenedText(branch: { readonly fromName: string; readonly tick: number }, name: string, followed = true): string {
  return `Opened the automatic checkpoint of “${branch.fromName}” at ${dishClock(branch.tick)} as a new branch, “${name}”, paused. ${
    followed ? 'Continue now follows this branch.' : 'Continue could not be updated, so it still opens the dish it held before.'
  }`;
}

/**
 * Merge the journal entries kept with a dish into this device's Notebook (after opening it). Merging
 * never removes an entry already on this device; entries that do not fit stay with the dish, and the
 * player is told.
 */
export async function syncDishJournal(dishId: string): Promise<void> {
  let entries: readonly unknown[];
  try {
    entries = await getClient().journalGet(dishId);
  } catch {
    return; // The dish is gone already; nothing to merge.
  }
  if (entries.length === 0) return;
  const { notListed } = mergeJournal(entries);
  if (notListed > 0)
    showToast(
      `Your Notebook is full (${JOURNAL_MAX} entries), so ${notListed === 1 ? 'one Journal entry' : `${notListed} Journal entries`} of this dish ${notListed === 1 ? 'is' : 'are'} not listed. ${notListed === 1 ? 'It stays' : 'They stay'} with the dish's save; nothing on this device was removed.`,
      7000,
    );
}
