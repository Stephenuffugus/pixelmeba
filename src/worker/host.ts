/**
 * The dish host: owns worlds, runs the active one in real time, answers requests.
 * Environment-agnostic (no DOM): sim.worker.ts wires it to postMessage; tests drive it directly.
 *
 * Time model: at speed s the host aims for 10·s ticks per real second. Each pump runs due ticks
 * within a work budget; if it falls behind it drops the backlog (never skips biological ticks or
 * changes dt) and reports the effective speed it actually achieved (SPEC §3.1, §16).
 */
import { applyNow, type CommandPayload } from '@sim/commands';
import type { ContentRegistry } from '@sim/content/registry';
import type { RecipeDef } from '@sim/content/schema';
import { applyRecipeOverrides, hasRecipeChanges, realizeRecipe, recipeGrid, recipeOverridesOf, type RecipeOverridesRecord, type RecipeWorldProvenance } from '@sim/recipes';
import { deserializeWorld, serializeWorld, stateHash, type WorldState } from '@sim/serialize';
import { canonicalJson } from '@sim/hash';
import { step } from '@sim/tick';
import type { World } from '@sim/world';
import { allocatedFieldIds } from '@sim/fields';
import { worldHasSystem } from '@sim/gates';
import { buildFamily, buildInspector, lociOfBirth, packDeposits, packEntities, packEnvironment, packGeometry, packLinks, packObjects, packOverlay, packResins, speciesFreeClasses, visualEvents } from './snapshot';
import { buildLineage, packLineageMarks } from '@sim/lineage';
import type { LineageMarks, LineageView } from './protocol';
import { stamp, type DishInfo, type DishSource, type Envelope, type FromWorker, type OverlayId, type Selection, type SlotSummary, type SnapshotMsg, type Speed, type ToWorker } from './protocol';
import type { ExperimentStampMsg } from './protocol';
import { captureBaseline, PairedRun, realizeArm, type CompareSpeed, type CompareStatus, type ComparisonResults, type ComparisonState, type Intervention } from './comparison';
import type { ComparisonExperiment } from './comparison';
import { prepareVariantPair, realizePairArm, VARIANT_PAIR_TEXT, VARIANT_PAIR_TICKS, variantPairRefusal, VariantPairRun, type ComparisonVariantPair, type VariantPairFacts, type VariantPairSugar } from './variantPair';
import { experimentCardView, experimentCatalog, experimentOf, GateWatch, inspectedOxygenReading, inspectShowsFoodUse, inspectShowsInfection, PlayerSteps, realizeExperimentArms, stepSpecies, type PlayerStep } from '@sim/experiments';
import { PAIRED_RUN_LABEL, SINGLE_RUN_LABEL, type ArmObserver } from '@sim/pairedRun';
import { TICKS_PER_SECOND } from '@sim/constants';
import { isIntervention } from '@sim/specimens';
import { evolutionState, isMutationPreset, ratesFor } from '@sim/mutation';
import { founderSummary } from '@sim/founders';
import { creationFounders } from '@sim/founders';
import { computeTotals } from '@sim/ledger';
import { cancelSample, heldSummary, SAMPLE_HELD_REFUSAL, selectSample } from '@sim/sample';
import type { NewDishPreview, RegistryInfo } from './protocol';
import type { HabitatRegion } from '@sim/content/habitatRules';
import { communityOffered, habitatOffered } from '@sim/content/habitatRules';
import type { SlotModes } from './protocol';
import { buildSaveFile, loadSaveFile, SaveFileError, saveMetaVariant } from '@persist/saveFile';
import { saveMetaEvolution, saveMetaRegistry, type SaveFile, type SaveMetaEvolution, type SaveMetaRegistry } from '@persist/saveFile';
import { AUTOSAVE_SLOT, type SaveStore, type SlotInfo } from '@persist/store';
import { holdsSave, SaveStore as SaveStoreClass, type SaveRequest } from '@persist/store';
import { isCheckpointSlot } from '@persist/store';
import { branchName, branchWorldId, CHECKPOINT_INTERVAL_TICKS, CheckpointRing, type StorageEstimate } from '@persist/checkpoints';
import { interventionSeconds, putJournalEntry, regionalTraitSeries, traitAvailability } from '@sim/history';
import {
  MAX_WHAT_IF_CHOICES,
  nextVariantId,
  realizeAgain,
  realizeVariant,
  variantChecksums,
  variantPatchOutlines,
  variantPreview,
  variantRecordOf,
  VariantError,
  whatIfChoices,
  type VariantRecord,
} from '@sim/variants';
import type { WhatIfAnswer, WhatIfChoice, WhatIfKeep, WhatIfKept, WhatIfPlan, WhatIfRefusalCode } from './protocol';
import type { KeepFrom, KeepRefusalCode } from './protocol';
import { RelationshipWatcher } from './relationships';
import { PerfCounters } from './perfCounters';
import { emptyMap, isMapWindow } from './relationshipMap';
import { probeSetProblem, ProbeSet } from './probes';
import { emptyNotebook, favoritesOnly, notebookHasNicknames, notebookIsEmpty, notebookWithoutNicknames, sealNotebook, type NotebookRecord } from '@persist/notebook';
import { notebookAfterRestore, NotebookWatch } from './notebookWatch';
import { GOAL_REFUSALS, goalCatalog } from './goals';
import { markStory } from '@persist/notebookStories';
import { applyFavoriteOp, FAVORITE_REFUSALS, readFavoriteOp, withPatterns } from './favorites';
import type { FavoriteMarks, NotebookChange } from './protocol';
import { dishThumb, parseThumb, thumbFromState } from './thumbnail';
import type { SessionSummary } from './protocol';
import { displayBranchName } from '@sim/branches';
import { SECONDS_PER_SUMMARY } from '@sim/history';
import { buildRecipeFile, loadRecipeFile, NO_START_TEXT, RecipeFileError } from '@persist/recipeFile';
import { recipeIdAnswer } from '@persist/recipeId';
import { gzipText } from '@persist/compress';
import { parseSaveFile } from '@persist/saveFile';
import { isShelfSlot } from '@persist/store';
import { Shelf } from '@persist/shelf';
import { BOOKMARK_TEXT, BOOKMARKS_MAX, bookmarkClock, bookmarksOf, cleanBookmarkTitle, nextBookmarkId, withoutBookmarkNotes, type Bookmark } from '@persist/notebookBookmarks';
import { GALLERY_MAX, GALLERY_TEXT, galleryEntryProblem, galleryOf, nextGalleryId, type GalleryEntry } from '@persist/notebookGallery';
import { eventBookmark, momentSummary, readStorage, storageRemovable } from './storage';
import { cleanPrediction, horizonTicksOf, turnOf, withoutTurnNotes, type TurnBaseline, type TurnChallenge, type TurnHorizonTicks, type TurnRecord } from '@persist/notebookTurns';
import { cloneTurn, goalFitsTurn, TRY_REFUSALS, tryGoalOptions, turnAfterChange, turnAfterTime, turnGoal, turnHoldsTime, turnRecordFor, withTurn } from './tryDish';
import type { TryRefusalCode } from './protocol';
import { challengeExportText, challengeFileName, challengeGoalEndsOnFinish, CHALLENGE_REFUSALS, challengeRefusal, challengeSaveProblem, turnChallengeDef, turnChallengeGoal, turnChallengeOf } from './challenge';
import { challengeObjectiveId, challengePredicate, challengesOf, CHALLENGES_MAX, nextChallengeId, type ChallengeRecord } from '@persist/notebookChallenges';
import { shelfSequenceOf } from '@persist/shelf';
import { objectiveSupportProblem } from '@sim/objectives';
import { demoCommandProblem, demoCommandReason, demoProblem, demoReason, type DemoScope } from '@platform/demoScope'; // P4.11 DEMO_MODE
import { DEMO_REFUSAL_KIND } from './protocol';

export interface HostClock {
  now(): number;
  /** Wall-clock ISO timestamp for save metadata (never enters the simulation). */
  iso?(): string;
}

/**
 * D-0033: what an action that replaces the open dish is about to do, for the keep step's refusals. What
 * if? keeps its own wording byte for byte ('whatIf' and 'start' read the same).
 */
type KeepAction = 'whatIf' | 'start' | 'experiment' | 'open' | 'checkpoint' | 'import' | 'duplicate' | 'tryDish' | 'bookmark';

const NOT_DONE: Readonly<Record<KeepAction, string>> = {
  whatIf: 'the new dish was not started',
  start: 'the new dish was not started',
  experiment: 'the experiment was not started',
  open: 'the saved dish was not opened',
  checkpoint: 'the checkpoint was not opened',
  import: 'the file was not opened',
  duplicate: 'the copy was not made',
  tryDish: 'Try my dish did not start', // P4.7
  bookmark: 'the bookmark was not opened', // P4.8b
};

/** A save file as buildSaveFile builds it (text, checksum, file). */
type BuiltFile = Awaited<ReturnType<typeof buildSaveFile>>;

/** How the keep step is asked to keep a dish (D-0033). */
interface KeepOptions {
  readonly action: KeepAction;
  /**
   * The named slot the action opens: never the target of this keep (it opens exactly as it was saved).
   * Opening the autosave or a checkpoint excludes no named slot.
   */
  readonly exclude: string | null;
  /** The slot the action opens, if any (opening the autosave writes no autosave first). */
  readonly opening: string | null;
}

const WHAT_IF_KEEP: KeepOptions = { action: 'whatIf', exclude: null, opening: null };

/** The named slot an action that opens `slotId` must never write while keeping the open dish. */
function excludedBy(slotId: string | null): string | null {
  return slotId !== null && SaveStoreClass.slotIds().includes(slotId) ? slotId : null;
}

/** A dish name as a file name ("Little Living Garden" → "little-living-garden"). */
/**
 * D-0121 (lead): a slot save that is readable but refused by rule (a newer version, or a system, structure or
 * ability this build cannot simulate) is named when no copy of the slot opens, not reported as damaged.
 */
function ruleRefusal(e: unknown): SaveFileError | null {
  return e instanceof SaveFileError && (e.kind === 'version' || e.kind === 'content') ? e : null;
}

function fileBase(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'dish';
}

/**
 * P4.1: a stored save's text as 'exportSave' sends it. Without the player's opt-in, a notebook carrying a
 * nickname (or one that could not be read) is replaced by the read record without nicknames, sealed
 * again (left out when empty); everything else, the state and its checksum included, is as stored.
 */
async function exportedSaveText(text: string, read: { readonly notebook: NotebookRecord; readonly dropped: boolean } | null, includeNicknames: boolean): Promise<string> {
  if (includeNicknames || read === null || (!read.dropped && !notebookHasNicknames(read.notebook))) return text;
  const file = JSON.parse(text) as Record<string, unknown>;
  if (!('notebook' in file)) return text;
  const clean = notebookWithoutNicknames(read.notebook);
  if (notebookIsEmpty(clean)) delete file.notebook;
  else file.notebook = await sealNotebook(clean);
  return JSON.stringify(file);
}

/** P4.1: two slot index records describe the same notebook (both none, or the same checksum). */
function sameNotebook(a: SlotInfo, b: SlotInfo): boolean {
  return (a.notebookChecksum ?? null) === (b.notebookChecksum ?? null);
}

/** Id prefix of the dish Continue holds, loaded only to be kept (never registered, never run). */
const CONTINUE_DISH = 'continue:';
let continueDishes = 0;

/** A readable What if? refusal (UX §3.4): nothing was started, saved or changed. */
class WhatIfRefusal extends Error {
  constructor(
    readonly code: WhatIfRefusalCode,
    message: string,
  ) {
    super(message);
    this.name = 'WhatIfRefusal';
  }
}

/** P4.11 DEMO_MODE: a world outside the demo scope (the message is demoReason's capability sentence). */
class DemoRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoRefusal';
  }
}

/** P4.11: build options after the six positional constructor arguments (never reordered). */
export interface DishHostOptions {
  /** DEMO_MODE's scope (src/platform/demoScope.ts); null or absent: the full game. */
  readonly demo?: DemoScope | null;
}

/** P2.8: an automatic checkpoint as the Saved dishes list shows it (labelled automatic, like "(autosave)"). */
function checkpointSummary(s: SlotInfo, catalogSize: number): SlotSummary {
  const modes = slotModes(s, catalogSize);
  return { ...summary(s), name: `${s.name} (automatic checkpoint)`, automatic: true, ...(modes ? { modes } : {}) };
}

function summary(s: SlotInfo): SlotSummary {
  // The slot index is stored data: its variant copy is re-validated like a file's meta (a bad one is dropped).
  const variant = saveMetaVariant(s);
  return { slotId: s.slotId, name: s.name, tick: s.tick, savedAt: s.savedAt, recipeId: s.recipeId, bytes: s.bytes, ...(variant ? { variant } : {}), ...(parseThumb(s.thumb) ? { thumb: s.thumb } : {}) };
}

/**
 * P4.3 session memory (D08 "a satisfying stopping point"): what the dish recorded after `sinceTick`, from
 * its history samples (per-second births and deaths; whole one-minute summaries where the span was
 * compacted) and its branch records. Read-only.
 *
 * Tick arithmetic (src/sim/tick.ts, publish.ts): the step that starts at world tick T records into the sample
 * with second ⌊T/10⌋ + 1 and stamps a branch it establishes with establishedTick T. A dish opened at world
 * tick `fromTick` has run exactly the steps T ≥ fromTick since, so a sample (or minute summary) counts only
 * when every step it covers starts at or after `fromTick`; one that straddles the opening cannot be split:
 * it is left out and the answer is flagged `compacted` (the counts are then a lower bound, "At least …").
 * A branch counts when establishedTick ≥ fromTick (established in the first step after opening or later).
 */
export function sessionSummaryOf(world: World, sinceTick: number): SessionSummary {
  const h = world.history;
  const fromTick = Math.max(0, Math.min(Math.floor(sinceTick), world.tick));
  const n = world.species.length;
  const births = new Array<number>(n).fill(0);
  const deaths = new Array<number>(n).fill(0);
  let compacted = false;
  const add = (smp: (typeof h.seconds)[number]) => {
    for (let j = 0; j < n; j++) {
      births[j]! += smp.births[j] ?? 0;
      deaths[j]! += smp.deaths[j] ?? 0;
    }
  };
  // A record with second S spanning `span` seconds covers the steps starting at ticks (S − span)·10 … S·10 − 1.
  const take = (smp: (typeof h.seconds)[number], span: number) => {
    if (smp.second * TICKS_PER_SECOND <= fromTick) return; // wholly before the opening
    // Straddles the opening: left out, and the answer says so, so no count claims births from before.
    if ((smp.second - span) * TICKS_PER_SECOND < fromTick) compacted = true;
    else add(smp);
  };
  for (const m of h.minutes) take(m, SECONDS_PER_SUMMARY);
  for (const smp of h.seconds) take(smp, 1);
  const branches = world.branches.branches
    .filter((b) => b.establishedTick >= fromTick)
    .map((b) => ({ id: b.id, name: displayBranchName(world, b), tick: b.establishedTick }));
  return { births, deaths, branches, fromTick, toTick: world.tick, compacted };
}

/**
 * P2.2 (UX §3.3): a slot's mode labels from the index's copies of the file's meta, re-validated like the
 * variant copy (a bad one is dropped). `partial` compares the recorded registry with this build's catalog.
 */
function slotModes(s: SlotInfo, catalogSize: number): SlotModes | null {
  const evolution = saveMetaEvolution(s);
  if (!evolution) return null;
  const registry = saveMetaRegistry(s);
  return { ...evolution, ...(registry ? { partial: registry.enabledModules.length < catalogSize } : {}) };
}

/** P2.2: the meta copies a slot index keeps with each save (mode labels on Saved dishes and Continue). */
function slotMetaCopies(file: SaveFile): { evolution?: SaveMetaEvolution; registry?: SaveMetaRegistry } {
  return { ...(file.meta.evolution ? { evolution: file.meta.evolution } : {}), ...(file.meta.registry ? { registry: file.meta.registry } : {}) };
}

/** An authored recipe's recorded start: the ledger's initial totals and its tick-0 recipe inputs. */
interface AuthoredStart {
  readonly c: number;
  readonly n: number;
  readonly m: number;
  readonly inputs: string;
}

/**
 * What the recipe itself put into a world at tick 0 (its patches, 'recipe:…', and its founders,
 * 'introduce:recipe:…'), in the ledger's recorded order, as one comparable string.
 */
function recipeStartInputs(w: World): string {
  const own = w.ledger.entries.filter((e) => e.tick === 0 && (e.source.startsWith('recipe:') || e.source.startsWith('introduce:recipe:')));
  return JSON.stringify(own.map((e) => [e.source, e.c, e.n, e.m]));
}

/** UX §3.3 registry label of a world with this manifest (DishInfo.manifestLabel; What if? choices). */
function registryLabel(m: { readonly enabledModules: readonly string[] }, catalogSize: number): string {
  return m.enabledModules.length < catalogSize ? 'Core prototype — quantitative evolution' : 'Standard Evolution';
}

interface Dish {
  readonly id: string;
  world: World;
  name: string;
  speed: Speed;
  acc: number;
  gen: number;
  lastEventId: number;
  lastGeometryVersion: number;
  overlay: OverlayId | null;
  selection: Selection | null;
  undo: WorldState | null;
  /** Last known-good state and the commands applied since, for rollback on error (ARCH §7). */
  checkpoint: WorldState;
  replay: { readonly tick: number; readonly commandId: string; readonly payload: CommandPayload }[];
  ticksWindow: number[];
  effectiveSpeed: number;
  failed: boolean;
  /** Set on the two worlds of a comparison (SPEC §13.4); their time is driven only by the comparison. */
  arm: { readonly compareId: string; readonly role: 'A' | 'B' } | null;
  /** Trait overlay / lineage highlight requested by the lineage panel (P2.3; render-only). */
  lineageView?: LineageView | null;
  /** Names, pins and saved specimens applied since the undoable command (P2.3): re-applied after Undo. */
  undoLabels?: { readonly commandId: string; readonly payload: CommandPayload }[];
  /** A single-arm experiment card running on this dish (P2.5): its gate is watched while it runs. */
  experiment?: SingleArmExperiment | null;
  /** P3.5 (D-0037): the stateHash Sample Begin recorded (worker state; null after a reload or Cancel). */
  sampleBeginHash?: string | null;
  /** P3.8 (D-0039): relationships first seen while this dish is played (worker state; never saved). */
  relationships?: RelationshipWatcher | null;
  /** P4.13 (D-0085): the relationship map was opened for this dish in this session (pool totals are measured from then on). */
  mapOpened?: boolean;
  /** P4.8: the region probes drawn on this dish (session state; never saved, never on a comparison copy). */
  probes?: ProbeSet | null;
  /**
   * P4.1 (D-0070): the dish's notebook record (favorites), saved beside the world and never in it. Kept by
   * Undo and rollback like the journal; empty for comparison and experiment arms.
   */
  notebook: NotebookRecord;
  /** P4.1: the notebook's watch on this played dish (never an arm, never a rollback replay). */
  notebookWatch?: NotebookWatch | null;
  /**
   * D-0033 fix round 1: the dish Continue holds, loaded only so a replacing action can keep it while no
   * dish is open. Never registered, never run. The autosave is written for it only to bind it to the
   * named slot its keep just wrote (the same file; fix round 2).
   */
  transient?: true;
}

/** A single-arm experiment card's observation of its dish (worker state; never saved in the world). */
interface SingleArmExperiment {
  readonly watch: GateWatch;
  readonly obs: ArmObserver;
  readonly labels: readonly string[];
  /** The dish was changed or failed: the card's observation stopped (the dish itself goes on). */
  ended: boolean;
  /** The player steps the card lists, noted from UI events (CT §10.1); the stamp needs them all. */
  readonly steps: PlayerSteps;
  /** The species those steps follow (e.g. the Sprinters whose food use the inspector shows). */
  readonly species: readonly string[];
  /** The stamp as recorded when the measured gate held, kept until every listed step is taken. */
  pending: ExperimentStampMsg | null;
  /** The stamp was posted (the observation is complete). */
  posted: boolean;
  /** The missing steps last announced with experimentWaiting (space-joined), or null before any. */
  waitingFor: string | null;
}

/** An experiment card's paired run (P2.5): the card's own arms, observers and gate. */
interface LiveExperiment {
  readonly watch: GateWatch;
  readonly obsA: ArmObserver;
  readonly obsB: ArmObserver;
  readonly labels: readonly string[];
  readonly horizonTicks: number;
  measured: { readonly A: Readonly<Record<string, number>>; readonly B: Readonly<Record<string, number>> } | null;
  /** The player steps the card lists (results read, population history opened); the stamp needs them all. */
  readonly steps: PlayerSteps;
  /** The stamp as recorded when the measured gate held, kept until every listed step is taken. */
  pending: ExperimentStampMsg | null;
  posted: boolean;
}

/**
 * An open comparison (worker state, never simulation state). The baseline is stored once; A and B
 * are separate dishes realized from it. Deleting it removes A, B and the baseline only.
 */
interface Comparison {
  readonly id: string;
  readonly sourceDishId: string;
  readonly aDishId: string;
  readonly bDishId: string;
  readonly baseline: WorldState;
  readonly priorSpeed: Speed;
  status: CompareStatus;
  horizonTicks: number | null;
  speed: CompareSpeed;
  acc: number;
  lastSnapshot: number;
  interventions: Intervention[];
  run: PairedRun | null;
  results: ComparisonResults | null;
  error: string | null;
  /** Set when this comparison is an experiment card's paired run (P2.5). */
  experiment?: LiveExperiment;
  /** P4.5: set when this comparison is a What if? idea against the unchanged Garden. */
  variantPair?: LiveVariantPair;
}

/** P4.5 (src/worker/variantPair.ts): a Garden variant pair's worker state (never saved). */
interface LiveVariantPair {
  readonly facts: VariantPairFacts;
  readonly sequential: boolean;
  /** The arms' starts (A: R-G0, B: the idea), each under its arm's world id. */
  readonly startA: WorldState;
  readonly startB: WorldState;
  runner: VariantPairRun | null;
  sugarEnd: VariantPairSugar | null;
}

const MAX_PUMP_MS = 30;
const SNAPSHOT_INTERVAL_MS = 100;
const MAX_BACKLOG_TICKS = 20;
/** A fresh rollback checkpoint every 30 simulated seconds (serialize ≈ 20 ms at 700 organisms). */
const CHECKPOINT_TICKS = 300;
/** Requests that change a world and are rolled back if they throw part-way. */
const MUTATING = new Set<ToWorker['type']>(['command', 'step', 'undo', 'sampleCancel']);
/** P3.5: the only commands a dish accepts while it holds a sample (D-0037). */
const WHILE_HELD = new Set<CommandPayload['kind']>(['sampleTransfer', 'sampleDiscard']);
/** Upper bound on comparison pairs per pump at 'max' pacing (the work budget usually stops sooner). */
const MAX_COMPARE_PAIRS_PER_PUMP = 400;

export class DishHost {
  private readonly dishes: Record<string, Dish> = {};
  /** What if? (P2.6): the named slot each dish was opened from or last saved to ("the active slot"). */
  private readonly ownSlots: Record<string, string> = {};
  /** Start totals of each authored recipe on this build, for recognising older saves (isAuthoredRecipe). */
  private readonly authoredStarts: Record<string, AuthoredStart | null> = {};
  private active: string | null = null;
  private comparison: Comparison | null = null;
  private lastPump: number;
  private lastSnapshot = 0;
  /** P2.8: the automatic checkpoint ring (same backend and atomic commit as the slots), off until Settings turns it on. */
  private readonly ring: CheckpointRing | null;
  /** P4.7 (D-0082): write-once stored snapshots (Try my dish baselines), same backend and atomic commit. */
  private readonly shelf: Shelf | null;
  private ringEnabled = false;
  /** P4.13: Settings "Show performance numbers" (off by default): only then are ticks and snapshots timed. */
  private diagnostics = false;
  private readonly perf = new PerfCounters();
  /** P4.13: the relationship watcher's time within the tick being measured (diagnostics only). */
  private relMs = 0;
  /** P4.8b: the platform's storage estimate, read by the storage panel ('storageInfo'). */
  private readonly storageEstimate: (() => Promise<StorageEstimate | undefined>) | undefined;
  private ringBusy = false;
  private ringKept = 0;
  /** The autosave being handled (D-0033 fix round 3): autosaves run one after another. */
  private autosaveTail: Promise<void> = Promise.resolve();
  /** P4.11 DEMO_MODE: the demo scope (null: the full game). Worlds outside it are refused before anything is kept. */
  private readonly demo: DemoScope | null;

  constructor(
    private readonly registry: ContentRegistry,
    private readonly postRaw: (msg: FromWorker & Envelope, transfer?: Transferable[]) => void,
    private readonly clock: HostClock,
    private readonly store: SaveStore | null = null,
    private readonly persistent = false,
    /** P2.8: the platform's storage estimate, checked before each automatic checkpoint. */
    storageEstimate?: () => Promise<StorageEstimate | undefined>,
    /** P4.11: build options (sim.worker.ts sets them from import.meta.env; tests pass them directly). */
    options: DishHostOptions = {},
  ) {
    this.demo = options.demo ?? null;
    this.lastPump = clock.now();
    this.ring = store ? new CheckpointRing(store.backend, storageEstimate) : null;
    this.shelf = store ? new Shelf(store.backend, storageEstimate) : null;
    this.storageEstimate = storageEstimate;
  }

  /** Every packet leaves stamped with the protocol version. */
  private post(msg: FromWorker, transfer?: Transferable[]): void {
    this.postRaw(stamp(msg), transfer);
  }

  private iso(): string {
    return this.clock.iso ? this.clock.iso() : new Date(0).toISOString();
  }

  /** Asynchronous requests (storage, checksums). Errors are reported, never thrown. */
  async handleAsync(msg: ToWorker): Promise<void> {
    try {
      switch (msg.type) {
        case 'saveSlot': {
          // A manual save always writes its slot (the store keeps the previous copy).
          const d = this.need(msg.dishId);
          if (!this.store) throw new Error('Saving is unavailable on this device.');
          d.name = msg.name;
          // P4.7 (SPEC §13.6 "a kept result uses a normal slot"): a turn saved to a named slot at its horizon
          // is kept there; the record says so in the file it writes (taken back if the write fails).
          const turn = d.arm ? null : turnOf(d.notebook);
          const keeps = turn !== null && turn.state === 'atHorizon' && SaveStoreClass.slotIds().includes(msg.slotId);
          if (keeps) d.notebook = withTurn(d.notebook, { ...turn, kept: { slotId: msg.slotId } });
          let info: SlotInfo;
          try {
            const savedAt = this.iso();
            const built = await buildSaveFile(d.world, { name: msg.name, savedAt, recipeId: d.world.content.provenance.recipeId }, this.localSave(d));
            info = await this.store.save(this.saveRequest(d, msg.slotId, msg.name, savedAt, built));
          } catch (e) {
            const now = keeps ? turnOf(d.notebook) : null;
            if (now) d.notebook = withTurn(d.notebook, { ...now, kept: turn!.kept });
            throw e;
          }
          this.ownSlots[d.id] = msg.slotId;
          this.post({ type: 'slotSaved', requestId: msg.requestId, slot: this.describeSlot(info), wrote: true });
          if (keeps) this.post({ type: 'tryTurn', dishId: d.id, turn: turnOf(d.notebook) });
          return;
        }
        case 'autosave': {
          // One autosave at a time (the 30 s interval, going to the background and leaving the page can
          // ask together): each one compares with what the one before it wrote. The dish is taken when the
          // request arrives, as before the queue: a replacing action that disposes it meanwhile never turns
          // a waiting autosave into an error (re-verify round 3).
          const dish = this.need(msg.dishId);
          const turn = this.autosaveTail.then(() => this.autosave(msg, dish));
          this.autosaveTail = turn.then(
            () => undefined,
            () => undefined,
          );
          await turn;
          return;
        }
        case 'listSlots': {
          const slots = this.store ? await this.store.list() : [];
          // P2.8: automatic checkpoints follow the named slots, newest first, labelled as such.
          const checkpoints = this.ring ? await this.ring.list() : [];
          this.post({ type: 'slots', requestId: msg.requestId, slots: [...slots.map((s) => this.describeSlot(s)), ...checkpoints.map((s) => checkpointSummary(s, this.catalogSize()))], persistent: this.persistent });
          return;
        }
        case 'loadSlot': {
          if (!this.store) throw new Error('Saving is unavailable on this device.');
          // 1. Read and check the save first: one that cannot be opened keeps nothing and changes nothing.
          const refused: { first: SaveFileError | null } = { first: null };
          const res = await this.store.load(msg.slotId, async (text) => {
            await loadSaveFile(text).catch((e: unknown) => {
              refused.first ??= ruleRefusal(e);
              throw e;
            });
            return true;
          });
          if (!res) throw refused.first ?? new SaveFileError('That save could not be read, and no earlier copy was usable.', 'integrity');
          const { file, world, notebook, notebookDropped } = await loadSaveFile(res.text);
          // P2.8: an automatic checkpoint opens as a new branch from a stored state (SPEC §10.7): like
          // Duplicate, it gets its own dish identity and a name that says the moment it starts from, so
          // it (and the checkpoints it makes) can be told apart from the dish it came from; it is bound
          // to no named slot. The state (and its hash) is exactly the checkpoint's.
          const branch = isCheckpointSlot(msg.slotId) || isShelfSlot(msg.slotId) ? { fromName: file.meta.name, tick: world.tick } : null; // P4.7: a shelf record too
          const opened = branch ? deserializeWorld({ ...file.state, worldId: branchWorldId(world.worldId, msg.newDishId) }) : world;
          this.demoCheck(opened); // P4.11: refused before anything is kept
          // 2. Keep the open dish first, never into the named slot being opened; a refusal opens nothing.
          const kept = await this.keepFirst(msg, { action: branch ? 'checkpoint' : 'open', exclude: excludedBy(msg.slotId), opening: msg.slotId });
          if (kept === false) return;
          // 3. Open it, bound to its named slot (D-0026's active slot; D-0033). Decided after the keep:
          // Continue binds to its slot only while that slot still holds the record Continue was bound to,
          // and the keep may just have written that slot (fix round 1). A copy of Continue read from its
          // predecessor (the latest record was damaged) is bound to nothing, as when it is kept: the
          // index describes the damaged record, and a save newer than this copy may be in that slot.
          const olderContinue = msg.slotId === AUTOSAVE_SLOT && res.usedPredecessor;
          const bindTo = branch || olderContinue ? null : await this.bindingOf(msg.slotId, world.worldId);
          // P4.1: the file's notebook comes along (a checkpoint branch, like Duplicate, keeps the favorites only, under its new world id).
          const dish = this.addDish(msg.newDishId, opened, branch ? branchName(file.meta.name, branch.tick) : file.meta.name, branch ? favoritesOnly(notebook, opened.worldId) : notebook);
          if (bindTo !== null) this.ownSlots[dish.id] = bindTo;
          this.post({
            type: 'loaded',
            requestId: msg.requestId,
            info: this.info(dish),
            usedPredecessor: res.usedPredecessor,
            ...(branch ? { branch } : {}),
            ...(kept ? { kept } : {}),
            ...(notebookDropped !== null ? { notebookDropped } : {}),
          });
          this.sendSnapshot(dish);
          this.experimentReopened(dish);
          return;
        }
        case 'deleteSlot': {
          await this.store?.remove(msg.slotId);
          this.post({ type: 'done', requestId: msg.requestId });
          return;
        }
        case 'exportDish': {
          const d = this.need(msg.dishId);
          // P4.1: the notebook goes along without nicknames unless the player opted in; stripNames drops them always.
          const built = await buildSaveFile(
            d.world,
            { name: d.name, savedAt: this.iso(), recipeId: d.world.content.provenance.recipeId },
            // P4.7: "without names or notes" also leaves out a turn's prediction note and the baseline's name.
            { stripNames: msg.strip, notebook: msg.strip ? withoutBookmarkNotes(withoutTurnNotes(this.notebookOf(d))) : this.notebookOf(d), includeNicknames: msg.includeNicknames === true }, // P4.8b: and bookmark titles
          );
          this.post({ type: 'exported', requestId: msg.requestId, text: built.text, filename: `${fileBase(msg.strip ? 'shared-dish' : d.name)}.pixelmeba` });
          return;
        }
        case 'exportSave': {
          // D-0033: the save Continue holds, as a file, exactly as stored (the Keep sheet's export while no
          // dish is open). It is read and checked like any save being opened; nothing is written.
          if (!this.store) throw new Error('Saving is unavailable on this device.');
          let name = 'dish';
          let read: { readonly notebook: NotebookRecord; readonly dropped: boolean } | null = null;
          const refused: { first: SaveFileError | null } = { first: null };
          const res = await this.store.load(msg.slotId, async (text) => {
            const got = await loadSaveFile(text).catch((e: unknown) => {
              refused.first ??= ruleRefusal(e);
              throw e;
            });
            name = got.file.meta.name;
            read = { notebook: got.notebook, dropped: got.notebookDropped !== null };
            return true;
          });
          if (!res) throw refused.first ?? new SaveFileError('That save could not be read, and no earlier copy was usable.', 'integrity');
          // P4.1: nicknames leave only by the player's choice. Only the file's notebook is replaced (sealed
          // again, without nicknames; left out when it could not be read); the state and its checksum stay as stored.
          this.post({ type: 'exported', requestId: msg.requestId, text: await exportedSaveText(res.text, read, msg.includeNicknames === true), filename: `${fileBase(name)}.pixelmeba` });
          return;
        }
        case 'importDish': {
          // The file is checked first: a refused file keeps nothing and changes nothing (D-0033).
          const { file, world, notebook, notebookDropped } = await loadSaveFile(msg.text);
          this.demoCheck(world); // P4.11: refused before anything is kept
          const kept = await this.keepFirst(msg, { action: 'import', exclude: null, opening: null });
          if (kept === false) return;
          const dish = this.addDish(msg.newDishId, world, file.meta.name, notebook);
          this.post({ type: 'loaded', requestId: msg.requestId, info: this.info(dish), usedPredecessor: false, ...(kept ? { kept } : {}), ...(notebookDropped !== null ? { notebookDropped } : {}) });
          this.sendSnapshot(dish);
          this.experimentReopened(dish);
          return;
        }
        case 'recipeExport': {
          // P4.6 Share (D-0080): the Starting recipe file from the dish's recorded start only (read-only).
          const d = this.need(msg.dishId);
          try {
            if (d.arm) throw new RecipeFileError(NO_START_TEXT, 'no-start');
            const p = d.world.content.provenance;
            const recipe = p.recipeId !== null ? this.registry.recipes[p.recipeId] : undefined;
            const legacyAuthored = p.createdFrom === 'recipe' && recipe !== undefined && recipeOverridesOf(d.world) === undefined && this.isAuthoredRecipe(d.world, recipe);
            const r = await buildRecipeFile(this.registry, d.world, { legacyAuthored });
            const v = r.file.versions;
            this.post({
              type: 'recipeExported',
              requestId: msg.requestId,
              text: r.text,
              filename: r.filename,
              name: r.start.name,
              question: r.start.question,
              identity: r.start.identity,
              versions: { simulationVersion: v.simulationVersion, evolutionRulesVersion: v.evolutionRulesVersion, contentVersion: v.contentVersion, contentHash: v.contentHash },
            });
          } catch (e) {
            if (!(e instanceof RecipeFileError)) throw e;
            this.post({ type: 'error', dishId: msg.dishId, requestId: msg.requestId, message: e.message, lastValidTick: 0, paused: false, request: msg.type, kind: e.kind });
          }
          return;
        }
        case 'recipeImport': {
          // P4.6: the file is checked and its start realized from this build's own content first; a refused
          // file keeps nothing and changes nothing (D-0033). The dish opens paused at tick 0.
          if (this.dishes[msg.newDishId]) throw new Error('That new dish id is already in use.');
          let loaded: Awaited<ReturnType<typeof loadRecipeFile>>;
          try {
            loaded = await loadRecipeFile(msg.text, this.registry, msg.newDishId);
          } catch (e) {
            if (!(e instanceof RecipeFileError)) throw e;
            this.post({ type: 'error', dishId: '', requestId: msg.requestId, message: e.message, lastValidTick: 0, paused: false, request: msg.type, kind: e.kind });
            return;
          }
          this.demoCheck(loaded.world); // P4.11: refused before anything is kept
          const kept = await this.keepFirst(msg, { action: 'import', exclude: null, opening: null });
          if (kept === false) return;
          const dish = this.addDish(msg.newDishId, loaded.world, loaded.name);
          this.post({ type: 'loaded', requestId: msg.requestId, info: this.info(dish), usedPredecessor: false, ...(kept ? { kept } : {}) });
          this.sendSnapshot(dish);
          return;
        }
        case 'recipeIdStart': {
          // P4.6 Import recipe ID: bundled ids, exact revisions and valid seeds only (never reinterpreted). A
          // variant realizes as What if? does; a recipe as 'create' with the seed. Built first, then kept (D-0033).
          const answer = recipeIdAnswer(msg.id, this.registry);
          if (!answer.ok) throw new RecipeFileError(answer.message, 'content');
          if (this.dishes[msg.newDishId]) throw new Error('That new dish id is already in use.');
          const s = answer.start;
          const world =
            s.kind === 'variant'
              ? await realizeVariant(this.registry, s.variantId, { worldId: msg.newDishId })
              : this.build({ kind: 'recipe', recipeId: s.recipeId, ...(s.seed !== this.registry.recipes[s.recipeId]!.seed ? { seed: s.seed } : {}) }, msg.newDishId);
          this.demoCheck(world); // P4.11: refused before anything is kept
          const kept = await this.keepFirst(msg, { action: 'start', exclude: null, opening: null });
          if (kept === false) return;
          const dish = this.addDish(msg.newDishId, world, s.title);
          this.post({ type: 'ready', requestId: msg.requestId, info: this.info(dish), ...(kept ? { kept } : {}) });
          this.sendSnapshot(dish);
          return;
        }
        case 'create': {
          // D-0033 (with keepFrom; a plain create is synchronous, see dispatch): build first, keep, open.
          if (!msg.keepFrom) {
            this.handle(msg);
            return;
          }
          const world = this.build(msg.source, msg.dishId);
          this.demoCheck(world); // P4.11: refused before anything is kept
          const kept = await this.keepFirst(msg, { action: 'start', exclude: null, opening: null });
          if (kept === false) return;
          const dish = this.addDish(msg.dishId, world, msg.name ?? world.content.provenance.recipeId ?? 'Dish');
          this.post({ type: 'ready', requestId: msg.requestId, info: this.info(dish), ...(kept ? { kept } : {}) });
          this.sendSnapshot(dish);
          return;
        }
        case 'experimentStart':
          // D-0033 (with keepFrom; a plain start is synchronous, see dispatch).
          if (msg.keepFrom) await this.experimentStartKeeping(msg);
          else this.handle(msg);
          return;
        case 'keepPlan': {
          const opening = msg.opening ?? null;
          this.post({ type: 'keepPlan', requestId: msg.requestId, plan: await this.planFor(msg.aboutDishId, excludedBy(opening), opening) });
          return;
        }
        case 'duplicate': {
          // D-0033 (with keepFrom; a plain duplicate is synchronous, see dispatch): keep the dish first,
          // then copy it. The keep paused it, so the copy holds the very moment that was kept.
          if (!msg.keepFrom) {
            this.handle(msg);
            return;
          }
          const d = this.need(msg.dishId);
          if (this.dishes[msg.newDishId]) throw new Error('That new dish id is already in use.');
          const kept = await this.keepFirst(msg, { action: 'duplicate', exclude: null, opening: null });
          if (kept === false) return;
          const copy = this.duplicateDish(d, msg.newDishId);
          this.post({ type: 'ready', requestId: msg.requestId, info: this.info(copy), ...(kept ? { kept } : {}) });
          return;
        }
        case 'whatIf':
        case 'whatIfStart':
          await this.handleWhatIf(msg);
          return;
        case 'trySetup': {
          // P4.7: read-only (content, the dish's recorded manifest and the shelf's count).
          const d = this.need(msg.dishId);
          const why = this.tryRefusalFor(d) ?? (await this.shelf!.check('baseline'))?.message ?? null;
          this.post({ type: 'trySetup', requestId: msg.requestId, dishId: d.id, goals: d.arm ? [] : tryGoalOptions(this.registry, d.world), refusal: why });
          return;
        }
        case 'tryStart':
          await this.tryStart(msg);
          return;
        case 'tryNext':
          await this.tryNext(msg);
          return;
        case 'bookmarkAdd': // P4.8b
          await this.bookmarkAdd(msg);
          return;
        case 'bookmarkOpen': // P4.8b
          await this.bookmarkOpen(msg);
          return;
        case 'storageInfo': // P4.8b
        case 'storageRemove':
          await this.storageRequest(msg);
          return;
        case 'challengeSave': // P4.8c (src/worker/challenge.ts)
          await this.challengeSave(msg);
          return;
        case 'challengeExport':
          await this.challengeExport(msg);
          return;
        case 'challengeStart':
          await this.challengeStart(msg);
          return;
        case 'variantPairStart': // P4.5
          await this.variantPairStart(msg);
          return;
        default:
          this.handle(msg);
      }
    } catch (e) {
      // An asynchronous request (save, export, open, import, list, delete) never pauses a dish.
      this.post({
        type: 'error',
        dishId: 'dishId' in msg ? msg.dishId : '',
        requestId: 'requestId' in msg ? msg.requestId : undefined,
        message: e instanceof Error ? e.message : String(e),
        lastValidTick: 0,
        paused: false,
        request: msg.type,
        ...(e instanceof SaveFileError ? { kind: e.kind } : e instanceof DemoRefusal ? { kind: DEMO_REFUSAL_KIND } : {}),
      } as FromWorker);
    }
  }

  /**
   * P4.11 DEMO_MODE (D09 line 211): a world the demo cannot hold whole is refused — called on the PREPARED world,
   * BEFORE keepFirst, so a refusal writes no slot and leaves the open dish and its run state as they were.
   */
  private demoCheck(world: World): void {
    if (!this.demo) return;
    const problem = demoProblem(world, this.demo, this.registry);
    if (problem) throw new DemoRefusal(demoReason(problem));
  }

  private addDish(id: string, world: World, name: string, notebook?: NotebookRecord): Dish {
    const dish = this.makeDish(id, world, name, serializeWorld(world));
    if (notebook) dish.notebook = notebook;
    this.dishes[id] = dish;
    this.active = id;
    return dish;
  }

  private makeDish(id: string, world: World, name: string, checkpoint: WorldState): Dish {
    return {
      id,
      world,
      name,
      speed: 0,
      acc: 0,
      gen: 0,
      lastEventId: world.counters.nextEventId - 1,
      lastGeometryVersion: -1,
      overlay: null,
      selection: null,
      undo: null,
      checkpoint,
      replay: [],
      ticksWindow: [],
      effectiveSpeed: 0,
      failed: false,
      arm: null,
      notebook: emptyNotebook(world.worldId),
    };
  }

  get activeDishId(): string | null {
    return this.active;
  }

  world(dishId: string): World | null {
    return this.dishes[dishId]?.world ?? null;
  }

  handle(msg: ToWorker): void {
    const target = 'dishId' in msg ? this.dishes[msg.dishId] : undefined;
    const tickBefore = target?.world.tick ?? 0;
    try {
      this.dispatch(msg);
    } catch (e) {
      const dishId = 'dishId' in msg ? msg.dishId : '';
      const dish = this.dishes[dishId];
      if (dish) {
        dish.speed = 0;
        dish.failed = true;
        // A step that threw part-way may have left a card's observer part-way through that tick too.
        if (dish === target && msg.type === 'step') this.endExperiment(dish, 'failed');
        // A request that threw part-way may have left partial changes: restore the last valid state.
        if (dish === target && MUTATING.has(msg.type)) this.rollback(dish, tickBefore);
      }
      this.post({
        type: 'error',
        dishId,
        ...('requestId' in msg ? { requestId: msg.requestId } : {}),
        message: e instanceof Error ? e.message : String(e),
        lastValidTick: dish?.world.tick ?? 0,
        // Only an existing dish was paused; a failed create (its dish never existed) paused nothing.
        paused: dish !== undefined,
        request: msg.type,
      });
    }
  }

  private dispatch(msg: ToWorker): void {
    switch (msg.type) {
      case 'create': {
        if (msg.keepFrom) {
          void this.handleAsync(msg);
          return;
        }
        const world = this.build(msg.source, msg.dishId);
        this.demoCheck(world); // P4.11 (a refused create opened nothing and paused nothing)
        const dish = this.addDish(msg.dishId, world, msg.name ?? world.content.provenance.recipeId ?? 'Dish');
        this.post({ type: 'ready', requestId: msg.requestId, info: this.info(dish) });
        this.sendSnapshot(dish);
        return;
      }
      case 'dispose':
        // Comparison worlds leave only with their comparison (compareDelete).
        if (this.dishes[msg.dishId]?.arm && this.comparison?.id === this.dishes[msg.dishId]!.arm!.compareId) return;
        delete this.dishes[msg.dishId];
        if (this.active === msg.dishId) this.active = null;
        return;
      case 'activate': {
        const d = this.need(msg.dishId);
        this.active = d.id;
        d.lastGeometryVersion = -1;
        this.sendSnapshot(d);
        return;
      }
      case 'setSpeed': {
        const d = this.need(msg.dishId);
        if (d.failed || d.arm) return; // a comparison arm's time is driven only by the comparison
        if (msg.speed !== 0 && this.refuseWhileHeld(d, 'setSpeed')) return;
        // P4.7: a turn at its horizon stays paused (the horizon card is offered again).
        if (msg.speed !== 0 && this.turnHorizon(d, true)) {
          this.sendSnapshot(d);
          return;
        }
        d.speed = msg.speed;
        d.acc = 0;
        this.sendSnapshot(d);
        return;
      }
      case 'step': {
        const d = this.need(msg.dishId);
        if (d.failed || d.arm) return;
        if (this.refuseWhileHeld(d, 'step')) return;
        d.speed = 0;
        // P4.7: a turn never steps past its horizon; reaching it pauses there and offers the horizon card.
        if (!this.turnHorizon(d, true)) {
          this.stepDish(d);
          this.turnHorizon(d);
        }
        this.sendSnapshot(d);
        return;
      }
      case 'command': {
        const d = this.need(msg.dishId);
        // P4.11 fix round 1: the demo never brings a species outside its scope into a dish or a comparison copy (refused before applyNow).
        const demoNo = this.demo ? demoCommandProblem(d.world, msg.payload, this.demo, this.registry) : null;
        if (demoNo) {
          this.post({ type: 'ack', requestId: msg.requestId, dishId: d.id, result: null, error: demoCommandReason(demoNo) });
          return;
        }
        if (d.arm) {
          this.armCommand(d, msg);
          return;
        }
        // P3.5 (D-0037): while a sample is held only Transfer and Discard change the dish; anything else
        // is refused before applyNow, so it takes no sequence number and the vacated slots stay free.
        if (!WHILE_HELD.has(msg.payload.kind) && this.refuseWhileHeld(d, 'command', msg.requestId)) return;
        if (msg.payload.kind === 'sampleTake' && d.speed !== 0) {
          this.post({ type: 'ack', requestId: msg.requestId, dishId: d.id, result: null, error: 'Pause the dish before taking a sample.' });
          return;
        }
        const challengeNo = challengeRefusal(d, msg.payload); if (challengeNo !== null) return this.challengeBlocked(d, msg.requestId, challengeNo); // P4.8c: a challenge turn's tool and budget limits (never reaches the world)
        const before = msg.undoable ? serializeWorld(d.world) : null;
        const tick = d.world.tick;
        const cmd = applyNow(d.world, msg.commandId, msg.payload);
        // A command that placed nothing (accepted 0) left the dish unchanged: the card keeps observing,
        // and it is no undo point (the previous one, if any, stays exactly as it was).
        const changed = cmd.result === undefined || cmd.result.accepted > 0;
        if (d.experiment && !d.experiment.ended && changed && (msg.payload.kind !== 'lineage' || isIntervention(msg.payload))) this.endExperiment(d, 'changed');
        if (before && changed) {
          d.undo = before;
          // The pre-command state doubles as the rollback checkpoint.
          d.checkpoint = before;
          d.replay = [];
          d.undoLabels = [];
        } else if (d.undo && msg.payload.kind === 'lineage' && !isIntervention(msg.payload)) (d.undoLabels ??= []).push({ commandId: msg.commandId, payload: msg.payload });
        d.replay.push({ tick, commandId: msg.commandId, payload: msg.payload });
        // P3.5: a selected organism lifted into the sample is no longer in the dish (it is not dead either).
        if (msg.payload.kind === 'sampleTake' && changed && d.selection?.kind === 'entity') d.selection = null;
        // P4.1: a command can remove members without a tick (a Sample take): the followed families follow it.
        if (changed && d.notebookWatch) this.notebookChanges(d, d.notebookWatch.afterTick(d.world));
        if (changed) this.turnUnkept(d); // P4.7 fix round 1: a changed turn is no longer what its slot holds
        this.post({ type: 'ack', requestId: msg.requestId, dishId: d.id, result: cmd.result ?? null });
        this.sendSnapshot(d);
        return;
      }
      case 'undo': {
        const d = this.need(msg.dishId);
        if (d.arm) {
          this.post({ type: 'ack', requestId: msg.requestId, dishId: d.id, result: null, error: 'Comparison copies are not rewound; clear the change on B instead.' });
          return;
        }
        // P3.5 (D-0037): Undo while a sample is held acts as Cancel.
        if (d.world.sample !== null) {
          this.cancelHeldSample(d);
          this.post({ type: 'ack', requestId: msg.requestId, dishId: d.id, result: null });
          this.sendSnapshot(d);
          return;
        }
        if (!d.undo) {
          this.post({ type: 'ack', requestId: msg.requestId, dishId: d.id, result: null, error: 'nothing to undo' });
          return;
        }
        // P2.8: the player's journal entries are notes about the dish, not part of the undone change: keep them.
        const journal = d.world.history.journal;
        this.notebookOf(d); // P4.1: the notebook is kept too, its members written in before the world goes
        d.world = deserializeWorld(d.undo);
        d.world.history.journal = journal;
        d.checkpoint = d.undo;
        d.replay = [];
        // Names, pins and saved specimens made after the undone command are notebook labels, not part
        // of that change: re-apply them in their original order at the restored tick (P2.3).
        for (const l of d.undoLabels ?? []) {
          applyNow(d.world, l.commandId, l.payload);
          d.replay.push({ tick: d.world.tick, commandId: l.commandId, payload: l.payload });
        }
        d.undoLabels = [];
        d.undo = null;
        d.speed = 0;
        d.lastEventId = d.world.counters.nextEventId - 1;
        d.lastGeometryVersion = -1;
        this.restoreNotebook(d, 'undo'); // P4.1 fix round 1: the kept notebook checked against the restored dish
        this.turnHorizon(d); // P4.7: the turn's clock is the world's tick: below its horizon it runs again
        this.turnUnkept(d); // P4.7 fix round 1: an Undo at the horizon changes the turn too
        // A card's observer counted the ticks being rewound and cannot rewind with them.
        this.endExperiment(d, 'undone');
        this.post({ type: 'ack', requestId: msg.requestId, dishId: d.id, result: null });
        this.sendSnapshot(d);
        return;
      }
      case 'view': {
        const d = this.need(msg.dishId);
        d.overlay = msg.overlay;
        d.selection = msg.selection;
        this.experimentSteps(d);
        this.sendSnapshot(d);
        return;
      }
      case 'save': {
        const d = this.need(msg.dishId);
        const state = serializeWorld(d.world);
        this.post({ type: 'saved', requestId: msg.requestId, dishId: d.id, json: JSON.stringify(state), hash: stateHash(d.world), tick: d.world.tick });
        return;
      }
      case 'duplicate': {
        if (msg.keepFrom) {
          void this.handleAsync(msg);
          return;
        }
        const copy = this.duplicateDish(this.need(msg.dishId), msg.newDishId);
        this.post({ type: 'ready', requestId: msg.requestId, info: this.info(copy) });
        return;
      }
      case 'hash': {
        const d = this.need(msg.dishId);
        this.post({ type: 'hash', requestId: msg.requestId, dishId: d.id, hash: stateHash(d.world), tick: d.world.tick });
        return;
      }
      case 'history': {
        const d = this.need(msg.dishId);
        const h = d.world.history;
        const seconds = msg.lastSeconds !== undefined && msg.lastSeconds >= 0 ? h.seconds.slice(-msg.lastSeconds) : h.seconds;
        this.post({ type: 'history', requestId: msg.requestId, dishId: d.id, seconds, minutes: h.minutes, compacted: h.compacted });
        this.experimentHistoryOpened(d);
        return;
      }
      case 'sessionSummary': {
        // P4.3: read-only (history samples and branch records). Never calls experimentHistoryOpened: this is not the History sheet.
        const d = this.need(msg.dishId);
        this.post({ type: 'sessionSummary', requestId: msg.requestId, dishId: d.id, summary: sessionSummaryOf(d.world, msg.sinceTick) });
        return;
      }
      case 'traitHistory': {
        // Read-only (P2.8): the recorded regional series of one species' locus; never touches the world.
        const d = this.need(msg.dishId);
        const h = d.world.history;
        this.post({
          type: 'traitHistory',
          requestId: msg.requestId,
          dishId: d.id,
          series: regionalTraitSeries(h, msg.species, msg.locus),
          available: traitAvailability(h, d.world.species.length),
          loci: d.world.content.loci.map((l) => ({ index: l.index, name: l.name })),
          interventions: interventionSeconds(h),
        });
        return;
      }
      case 'journalPut': {
        // P2.8: a Notebook entry kept with the dish (observation record; outside the state hash). A
        // malformed entry is refused with stored false and never pauses the dish.
        const d = this.need(msg.dishId);
        const mark = this.keptTurnMark(d);
        const stored = putJournalEntry(d.world.history, msg.entry);
        if (stored) this.turnEdited(d, mark); // P4.7: a note on a kept turn is a change its slot does not hold
        this.post({ type: 'journal', requestId: msg.requestId, dishId: d.id, entries: d.world.history.journal, stored });
        return;
      }
      case 'journalGet': {
        const d = this.need(msg.dishId);
        this.post({ type: 'journal', requestId: msg.requestId, dishId: d.id, entries: d.world.history.journal });
        return;
      }
      case 'checkpointRing':
        this.ringEnabled = msg.enabled === true;
        return;
      case 'diagnostics':
        // P4.13: timings only (worker state; never read by the simulation, saved or hashed).
        if (msg.on === true && !this.diagnostics) this.perf.reset();
        this.diagnostics = msg.on === true;
        return;
      case 'relationshipMap': {
        // P4.8: read-only; the watcher's ledger (empty until the dish has been played this session).
        const d = this.need(msg.dishId);
        const w = isMapWindow(msg.windowSeconds) ? msg.windowSeconds : 60;
        const rw = d.relationships;
        if (rw && !rw.watches(d.world)) rw.rebind(d.world); // Undo or a rollback replaced the world
        // P4.13 (D-0085): the first open starts the pool totals ("Recorded since" for them until the window is covered).
        d.mapOpened = true;
        rw?.armPools();
        const map = rw ? rw.ledger.read(d.world.tick, w) : emptyMap(d.world.tick, w);
        this.post({ type: 'relationshipMap', requestId: msg.requestId, dishId: d.id, map });
        return;
      }
      case 'probeSet':
      case 'probeRead': {
        // P4.8: session state for the open dish (never a command; the world is only read).
        const d = this.need(msg.dishId);
        const w = isMapWindow(msg.windowSeconds) ? msg.windowSeconds : 60;
        let refused: string | undefined;
        if (msg.type === 'probeSet') {
          const problem = d.arm ? 'Comparison copies keep no regions.' : probeSetProblem(msg.probes);
          if (problem === null) (d.probes ??= new ProbeSet(d.world)).set(msg.probes, d.world);
          else refused = problem;
        }
        const ps = d.probes ?? new ProbeSet(d.world);
        this.post({ type: 'probes', requestId: msg.requestId, dishId: d.id, masks: ps.masks, readings: ps.read(d.world, w), ...(refused !== undefined ? { refused } : {}) });
        return;
      }
      case 'relationships': {
        // P3.8 (D-0039): read-only; the watcher's first-seen table for this dish (empty until it ran).
        const d = this.need(msg.dishId);
        const entries = d.relationships?.entries.slice() ?? [];
        this.post({ type: 'relationships', requestId: msg.requestId, dishId: d.id, worldId: d.world.worldId, dishName: d.name, entries });
        return;
      }
      case 'notebookGet': {
        // P4.1: read-only. The record with the followed families' members as they are now.
        const d = this.need(msg.dishId);
        const record = this.notebookOf(d);
        const inspected = msg.inspect !== undefined ? (buildInspector(d.world, { kind: 'entity', birthId: msg.inspect }).entity ?? null) : undefined;
        this.post({ type: 'notebook', requestId: msg.requestId, dishId: d.id, record, ...(inspected !== undefined ? { inspected } : {}) });
        return;
      }
      case 'storyMark': {
        // P4.2 (D-0070): notebook state only (a card opened or dismissed). Never a command; the world is not read.
        const d = this.need(msg.dishId);
        const list = d.arm ? null : markStory(d.notebook.stories ?? [], msg.id, msg.mark === 'dismissed' ? 'dismissed' : 'seen');
        if (list === null) {
          this.post({ type: 'notebook', requestId: msg.requestId, dishId: d.id, record: d.notebook, refused: d.arm ? 'Comparison copies keep no story cards.' : 'That story card is not in this dish.' });
          return;
        }
        const mark = this.keptTurnMark(d);
        d.notebook = { ...d.notebook, stories: list };
        this.turnEdited(d, mark); // P4.7: a story mark on a kept turn is a change its slot does not hold
        this.post({ type: 'notebook', requestId: msg.requestId, dishId: d.id, record: this.notebookOf(d) });
        return;
      }
      case 'favorite': {
        // P4.1 (D-0070): notebook state only. Never a CommandPayload; the world is only read.
        const d = this.need(msg.dishId);
        const nw = this.watchOf(d);
        const op = readFavoriteOp(msg.op);
        if (!nw || !op) {
          this.post({ type: 'notebook', requestId: msg.requestId, dishId: d.id, record: d.notebook, refused: nw ? FAVORITE_REFUSALS.badOp : 'Comparison copies keep no favorites.' });
          return;
        }
        const mark = this.keptTurnMark(d);
        const r = applyFavoriteOp(d.world, nw.materialize(), nw.favorites, op);
        if (r.refused === null) {
          d.notebook = r.record;
          nw.rebind(d.world);
          this.turnEdited(d, mark); // P4.7: a Follow change on a kept turn is a change its slot does not hold
        }
        this.post({ type: 'notebook', requestId: msg.requestId, dishId: d.id, record: d.notebook, ...(r.refused !== null ? { refused: r.refused } : {}), ...(r.removed !== null ? { removed: r.removed } : {}) });
        this.sendSnapshot(d);
        return;
      }
      case 'goalStart':
      case 'goalLeave': {
        // P4.4 (D-0070, D-0071): notebook state only. Never a command, never a speed or pause change.
        const d = this.need(msg.dishId);
        const nw = this.watchOf(d);
        if (!nw) {
          this.post({ type: 'notebook', requestId: msg.requestId, dishId: d.id, record: d.notebook, refused: GOAL_REFUSALS.arm });
          return;
        }
        const mark = this.keptTurnMark(d);
        let r: { refused: string | null; changes: NotebookChange[] };
        if (msg.type === 'goalLeave') r = nw.goals.leave(d.world);
        else {
          const challengeGoal = turnChallengeGoal(d.notebook, msg.objectiveId, d.world.content.manifest.buildPhase); // P4.8c: Try again on a challenge turn's goal
          const def = this.registry.objectives[msg.objectiveId] ?? challengeGoal ?? undefined;
          const offered = def !== undefined && (challengeGoal !== null || goalCatalog(this.registry, { world: d.world }).some((g) => g.id === def.id));
          r = def ? nw.goals.start(d.world, def, offered) : { refused: GOAL_REFUSALS.unknown, changes: [] };
        }
        if (r.refused === null) this.turnEdited(d, mark); // P4.7: a goal started or left on a kept turn is a change too
        this.post({ type: 'notebook', requestId: msg.requestId, dishId: d.id, record: d.notebook, ...(r.refused !== null ? { refused: r.refused } : {}) });
        this.notebookChanges(d, r.changes);
        return;
      }
      case 'goalShown': {
        // P4.4: the sentence was dismissed; a flag in the notebook record only.
        const d = this.dishes[msg.dishId];
        const nw = d ? this.watchOf(d) : null;
        const mark = d ? this.keptTurnMark(d) : null;
        if (nw?.goals.shown(msg.id) && d) this.turnEdited(d, mark); // P4.7: the notebook changed (a kept turn's slot no longer holds it)
        return;
      }
      case 'goalCatalog': {
        // P4.4: read-only (content and the dish's recorded manifest).
        const d = msg.targetDishId !== null ? this.dishes[msg.targetDishId] : undefined;
        const goals = d ? (d.arm ? [] : goalCatalog(this.registry, { world: d.world })) : goalCatalog(this.registry, { recipeId: msg.recipeId, manifest: this.registry.manifest });
        this.post({ type: 'goalCatalog', requestId: msg.requestId, goals });
        return;
      }
      case 'family': {
        // Read-only: answers from lineage records and entity columns, never touches the world.
        const d = this.need(msg.dishId);
        this.post({ type: 'family', requestId: msg.requestId, dishId: d.id, family: buildFamily(d.world, msg.birthId) });
        return;
      }
      case 'lineage': {
        // Read-only (P2.3): branch records, candidates, specimens and one branch's detail.
        const d = this.need(msg.dishId);
        this.post({ type: 'lineage', requestId: msg.requestId, dishId: d.id, lineage: buildLineage(d.world, { branch: msg.branch, birthId: msg.birthId }) });
        return;
      }
      case 'lineageView': {
        // Render-only marks on this dish's snapshots (P2.3); the world is never touched.
        const d = this.need(msg.dishId);
        d.lineageView = msg.view && (msg.view.locus !== null || msg.view.branch !== null) ? msg.view : null;
        this.sendSnapshot(d);
        return;
      }
      case 'newDishPreview':
        // Read-only (P2.2): built exactly as 'create' would build it, summarized, then discarded.
        this.post({ type: 'newDishPreview', requestId: msg.requestId, preview: this.newDishPreview(msg) });
        return;
      case 'experimentCatalog':
        this.post({ type: 'experimentCatalog', requestId: msg.requestId, cards: experimentCatalog(this.registry).map((d) => experimentCardView(this.registry, d)) });
        return;
      case 'experimentStart':
        if (msg.keepFrom) {
          void this.handleAsync(msg);
          return;
        }
        this.experimentStart(msg);
        return;
      case 'compareStart':
        this.compareStart(msg);
        return;
      case 'compareReset': {
        const c = this.needCompare(msg.compareId);
        if (c.status !== 'setup') throw new Error('The change on B can only be cleared before the run starts.');
        if (c.variantPair) throw new Error(VARIANT_PAIR_TEXT.noReset);
        if (c.experiment) throw new Error("This experiment's change is part of the card and cannot be cleared.");
        c.interventions = [];
        this.resetB(c);
        this.postCompare(c, msg.requestId);
        return;
      }
      case 'compareRun': {
        const c = this.needCompare(msg.compareId);
        if (c.status !== 'setup') throw new Error('This comparison has already run.');
        if (c.variantPair) {
          // P4.5: the fixed 180-s horizon; any other refuses and nothing runs.
          this.variantPairRun(c, c.variantPair, msg.horizonTicks, msg.speed);
          this.postCompare(c, msg.requestId);
          return;
        }
        const a = this.dishes[c.aDishId]!;
        const b = this.dishes[c.bDishId]!;
        const x = c.experiment;
        // An experiment card runs its own horizon (its stopping point) with the observers attached at its setup.
        c.run = x
          ? new PairedRun(c.baseline, a.world, b.world, x.horizonTicks, { obsA: x.obsA, obsB: x.obsB, inputBaseB: x.obsB.inputStart })
          : new PairedRun(c.baseline, a.world, b.world, msg.horizonTicks);
        c.horizonTicks = x ? x.horizonTicks : msg.horizonTicks;
        c.speed = msg.speed;
        c.acc = 0;
        c.lastSnapshot = -Infinity;
        c.status = 'running';
        this.postCompare(c, msg.requestId);
        return;
      }
      case 'compareSpeed': {
        const c = this.needCompare(msg.compareId);
        c.speed = msg.speed;
        c.acc = 0;
        this.postCompare(c);
        return;
      }
      case 'compareStop': {
        const c = this.needCompare(msg.compareId);
        if (c.status === 'running' && c.variantPair) this.variantPairStop(c, c.variantPair);
        else if (c.status === 'running') this.finishComparison(c);
        this.postCompare(c, msg.requestId);
        return;
      }
      case 'compareDelete': {
        const c = this.comparison;
        if (c && c.id === msg.compareId) {
          // Only the comparison's own worlds and baseline go. The source dish and every save slot stay.
          delete this.dishes[c.aDishId];
          delete this.dishes[c.bDishId];
          if (this.active === c.aDishId || this.active === c.bDishId) this.active = null;
          this.comparison = null;
        }
        this.post({ type: 'done', requestId: msg.requestId });
        return;
      }
      case 'sampleBegin': {
        const d = this.need(msg.dishId);
        if (d.arm) {
          this.post({ type: 'error', dishId: d.id, requestId: msg.requestId, message: 'Comparison copies take no samples; sample the dish itself.', lastValidTick: d.world.tick, paused: false, request: msg.type });
          return;
        }
        if (this.refuseWhileHeld(d, 'sampleBegin', undefined, msg.requestId)) return;
        // Begin (D-0037): pause and record the pre-begin hash. Nothing in the world changes.
        d.speed = 0;
        d.acc = 0;
        const hash = stateHash(d.world);
        d.sampleBeginHash = hash;
        this.post({ type: 'sampleBegun', requestId: msg.requestId, dishId: d.id, hash, tick: d.world.tick });
        this.sendSnapshot(d);
        return;
      }
      case 'samplePreview': {
        // Read-only: exactly what a take here would hold, with the whole-unit check (sample.ts).
        const d = this.need(msg.dishId);
        const sel = selectSample(d.world, msg.x, msg.y, msg.radius, msg.mode);
        this.post({
          type: 'samplePreview',
          requestId: msg.requestId,
          dishId: d.id,
          preview: { mode: sel.mode, radius: sel.radius, origin: sel.origin, cells: sel.cells, organisms: sel.slots.length, objects: sel.objectIds.length, c: sel.c, n: sel.n, m: sel.m, missing: sel.missing },
        });
        return;
      }
      case 'sampleCancel': {
        const d = this.need(msg.dishId);
        if (d.world.sample === null) {
          this.post({ type: 'error', dishId: d.id, requestId: msg.requestId, message: 'No sample is held.', lastValidTick: d.world.tick, paused: false, request: msg.type });
          return;
        }
        const beginHash = d.sampleBeginHash ?? null;
        this.cancelHeldSample(d);
        this.post({ type: 'sampleCancelled', requestId: msg.requestId, dishId: d.id, hash: stateHash(d.world), tick: d.world.tick, beginHash });
        this.sendSnapshot(d);
        return;
      }
      case 'release':
        return;
      case 'saveSlot':
      case 'autosave':
      case 'listSlots':
      case 'loadSlot':
      case 'deleteSlot':
      case 'exportDish':
      case 'importDish':
      case 'recipeExport':
      case 'recipeImport':
      case 'recipeIdStart':
      case 'keepPlan':
      case 'exportSave':
      case 'whatIf':
      case 'whatIfStart':
      case 'trySetup':
      case 'tryStart':
      case 'tryNext':
      case 'bookmarkAdd': // P4.8b
      case 'bookmarkOpen':
      case 'storageInfo':
      case 'storageRemove':
      case 'challengeSave': // P4.8c
      case 'challengeExport':
      case 'challengeStart':
      case 'variantPairStart': // P4.5
        void this.handleAsync(msg);
        return;
      case 'bookmarkDelete':
      case 'galleryAdd':
      case 'galleryDelete': {
        // P4.8b (D-0070): notebook state only. Never a command; the world is not changed.
        const d = this.need(msg.dishId);
        if (d.arm || d.transient) {
          this.post({ type: 'notebook', requestId: msg.requestId, dishId: d.id, record: d.notebook, refused: msg.type === 'bookmarkDelete' ? BOOKMARK_TEXT.arm : GALLERY_TEXT.arm });
          return;
        }
        const mark = this.keptTurnMark(d);
        const r = msg.type === 'bookmarkDelete' ? this.bookmarkDeleted(d, msg.id) : msg.type === 'galleryDelete' ? this.galleryDeleted(d, msg.id) : this.galleryAdded(d, msg.entry);
        if (r === null) this.turnEdited(d, mark); // P4.7: a notebook change on a kept turn is a change its slot does not hold
        this.post({ type: 'notebook', requestId: msg.requestId, dishId: d.id, record: this.notebookOf(d), ...(r !== null ? { refused: r } : {}) });
        return;
      }
      case 'tryFinish': {
        // P4.7: Finish — the turn becomes an ordinary paused dish (nothing is deleted; the baseline stays on the shelf).
        const d = this.need(msg.dishId);
        if (!d.arm) this.turnHorizon(d);
        const t = d.arm ? null : turnOf(d.notebook);
        const mark = this.keptTurnMark(d); // D-0084: Finish changes what a kept turn's slot holds (the turn's state, a left goal)
        const left = t && t.state !== 'finished' && challengeGoalEndsOnFinish(d.notebook) ? (this.watchOf(d)?.goals.leave(d.world).changes ?? []) : []; // P4.8c fix round 2: Finish leaves the challenge's goal too
        if (t && t.state !== 'finished') d.notebook = withTurn(d.notebook, { ...t, state: 'finished' });
        this.turnEdited(d, mark); // P4.7: a finished turn is no longer the kept one (its slot holds it at the horizon)
        this.post({ type: 'tryTurn', requestId: msg.requestId, dishId: d.id, turn: d.arm ? null : turnOf(d.notebook) });
        this.notebookChanges(d, left);
        return;
      }
      default:
        // An unknown request must fail once, not bounce between handle() and handleAsync() forever.
        throw new Error(`unknown request ${String((msg as { type?: unknown }).type)}`);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Experiment cards (P2.5; SPEC §13.2, UX §1 Notebook → Experiments). A card starts as a NEW paused
  // dish realized from its recipe and seed exactly as the headless runner realizes it
  // (realizeExperimentArms); a paired card opens its paired run through the comparison engine with
  // the card's one change already on B. The same GateWatch as the headless runner watches the gate;
  // reaching it posts the journal stamp and the world keeps running. Worker state only.

  /** A card's start without keeping (synchronous; a refusal throws before anything changes). */
  private experimentStart(msg: Extract<ToWorker, { type: 'experimentStart' }>): void {
    this.openExperiment(msg, this.prepareExperiment(msg), null);
  }

  /** D-0033: the card's arms are realized first (a refusal keeps nothing), then the open dish is kept, then the card opens. */
  private async experimentStartKeeping(msg: Extract<ToWorker, { type: 'experimentStart' }>): Promise<void> {
    const prepared = this.prepareExperiment(msg);
    const kept = await this.keepFirst(msg, { action: 'experiment', exclude: null, opening: null });
    if (kept === false) return;
    // Checked again after the keep's awaits: nothing else may have taken the ids or opened a comparison.
    this.checkExperimentIds(msg, prepared.def.paired);
    this.openExperiment(msg, prepared, kept);
  }

  private checkExperimentIds(msg: Extract<ToWorker, { type: 'experimentStart' }>, paired: boolean): void {
    if (this.dishes[msg.newDishId]) throw new Error('That new dish id is already in use.');
    const ids = msg.compare;
    if (!paired) return;
    if (!ids) throw new Error('A paired experiment needs comparison ids.');
    if (this.comparison) throw new Error('A comparison is already open; finish or delete it first.');
    const all = [msg.newDishId, ids.aDishId, ids.bDishId];
    if (new Set(all).size !== 3 || all.some((id) => this.dishes[id])) throw new Error('comparison dish ids must be new and distinct');
  }

  /** Everything a card's start needs, built without touching any dish (pure realization). */
  private prepareExperiment(msg: Extract<ToWorker, { type: 'experimentStart' }>) {
    const def = this.registry.experiments[msg.cardId];
    if (!def || def.phase > this.registry.manifest.buildPhase) throw new Error(`There is no experiment "${msg.cardId}" in this version of Pixelmeba.`);
    // P4.11 DEMO_MODE: the demo has no experiment cards (D09 §10); refused before anything is built or kept.
    if (this.demo) throw new DemoRefusal(demoReason({ ids: [def.id], names: [def.title] }));
    this.checkExperimentIds(msg, def.paired);
    const ids = msg.compare;
    const recipe = this.registry.recipes[def.recipeId]!;
    const labels = [...recipe.labels];
    // Labels such as "Seeded traits demonstration" travel with the dish name wherever it is shown.
    const name = [def.title, ...labels.filter((l) => !/^Experiment\b/.test(l))].join(' · ');
    const arms = realizeExperimentArms(this.registry, def, {
      worldIds: ids ? { A: `${msg.newDishId}+${ids.compareId}:A`, B: `${msg.newDishId}+${ids.compareId}:B`, shared: msg.newDishId } : { A: msg.newDishId },
    });
    const watch = new GateWatch(def, recipe, this.registry.manifest);
    const steps = new PlayerSteps(def);
    return { def, labels, name, arms, watch, steps };
  }

  private openExperiment(msg: Extract<ToWorker, { type: 'experimentStart' }>, p: ReturnType<DishHost['prepareExperiment']>, kept: WhatIfKept | null): void {
    const { def, labels, name, arms, watch, steps } = p;
    const ids = msg.compare;
    const keptField = kept ? { kept } : {};
    if (!def.paired || !ids || !arms.B || !arms.obsB) {
      const dish = this.addDish(msg.newDishId, arms.A, name);
      dish.experiment = { watch, obs: arms.obsA, labels, ended: false, steps, species: stepSpecies(def), pending: null, posted: false, waitingFor: null };
      this.post({ type: 'experimentStarted', requestId: msg.requestId, cardId: def.id, info: this.info(dish), compare: null, ...keptField });
      this.sendSnapshot(dish);
      return;
    }
    // Paired: the new dish holds the card's start (A's start state); A and B are the card's own arms.
    const baseline: WorldState = { ...serializeWorld(arms.A), worldId: msg.newDishId };
    const src = this.addDish(msg.newDishId, deserializeWorld(baseline), name);
    const horizonTicks = Math.round(def.stoppingSeconds * TICKS_PER_SECOND) - arms.startTick;
    const c: Comparison = {
      id: ids.compareId,
      sourceDishId: src.id,
      aDishId: ids.aDishId,
      bDishId: ids.bDishId,
      baseline,
      priorSpeed: 0,
      status: 'setup',
      horizonTicks,
      speed: 4,
      acc: 0,
      lastSnapshot: -Infinity,
      interventions: [...arms.interventions],
      run: null,
      results: null,
      error: null,
      experiment: { watch, obsA: arms.obsA, obsB: arms.obsB, labels, horizonTicks, measured: null, steps, pending: null, posted: false },
    };
    this.comparison = c;
    for (const [role, world] of [
      ['A', arms.A],
      ['B', arms.B],
    ] as const) {
      const id = role === 'A' ? c.aDishId : c.bDishId;
      const dish = this.makeDish(id, world, `${name} (${role})`, serializeWorld(world));
      dish.arm = { compareId: c.id, role };
      this.dishes[id] = dish;
    }
    this.active = null;
    this.post({ type: 'experimentStarted', requestId: msg.requestId, cardId: def.id, info: this.info(src), compare: this.compareState(c), ...keptField });
    this.sendSnapshot(this.dishes[c.aDishId]!);
    this.sendSnapshot(this.dishes[c.bDishId]!);
  }

  /** The card's measurements in A and B now. */
  private experimentMeasured(run: PairedRun, x: LiveExperiment): NonNullable<LiveExperiment['measured']> {
    const m = x.watch.measured({ world: run.a, obs: x.obsA }, { world: run.b, obs: x.obsB });
    return { A: m.A, B: m.B ?? {} };
  }

  /**
   * After every pair of an experiment's paired run: watch the gate. When it holds, the stamp is recorded
   * with the values of that moment and posted once the card's player steps are taken too (the run goes on).
   */
  private experimentAfterPair(c: Comparison, run: PairedRun, x: LiveExperiment): void {
    const stamp = x.watch.afterTick({ world: run.a, obs: x.obsA }, { world: run.b, obs: x.obsB });
    if (!stamp) return;
    x.measured = this.experimentMeasured(run, x);
    x.pending = { stamp, title: x.watch.def.title, label: PAIRED_RUN_LABEL, labels: x.labels, measured: x.measured };
    if (this.experimentPostPaired(c, x)) this.postCompare(c);
  }

  /** Post a paired card's held stamp once its measured gate held and every listed step was taken. */
  private experimentPostPaired(c: Comparison, x: LiveExperiment): boolean {
    if (x.posted || !x.pending || !x.steps.complete) return false;
    x.posted = true;
    this.post({ type: 'experimentStamp', dishId: c.sourceDishId, stamp: x.pending });
    return true;
  }

  /**
   * The history of a dish was requested — the only request that opens a history view (the History sheet
   * on a dish; the population history on a paired run's results). A UI event, never simulation state.
   */
  private experimentHistoryOpened(d: Dish): void {
    if (d.arm) {
      const c = this.comparison;
      const x = c?.experiment;
      if (!c || !x || c.id !== d.arm.compareId || c.status !== 'complete') return;
      if (x.steps.note('viewPreyHistory') && this.experimentPostPaired(c, x)) this.postCompare(c);
      return;
    }
    this.experimentSteps(d, 'openResourceHistory');
  }

  /**
   * Note a player step on a single-arm card's dish (UI events only: reads the world, never writes it),
   * including "the inspector identifies food use" for the organism selected now, and post the held stamp
   * once the measured gate held and every listed step was taken.
   */
  private experimentSteps(d: Dish, step?: PlayerStep): void {
    const x = d.experiment;
    if (!x || x.ended || x.posted) return;
    if (step) x.steps.note(step);
    // The UI sends a selection only while the inspector shows it (src/ui/state.ts inspectedSelection).
    const sel = d.selection;
    if (x.steps.needs('inspectFoodUse') && sel?.kind === 'entity' && inspectShowsFoodUse(d.world, sel.birthId, x.species)) x.steps.note('inspectFoodUse');
    // P3.9 (CT §10.1): EXP_104's oxygen readings per species, EXP_105's infected Sprinter (reads only).
    if (x.steps.needs('inspectOxygenLimits') && sel?.kind === 'entity') {
      const seen = inspectedOxygenReading(d.world, sel.birthId, x.species);
      if (seen) x.steps.noteOxygenLimit(seen.species, seen.reason, x.species);
    }
    if (x.steps.needs('observeInfection') && sel?.kind === 'entity' && inspectShowsInfection(d.world, sel.birthId, x.species)) x.steps.note('observeInfection');
    if (!x.pending) return;
    if (x.steps.complete) {
      x.posted = true;
      this.post({ type: 'experimentStamp', dishId: d.id, stamp: x.pending });
      return;
    }
    // The measured gate held and a step is still missing: say which, once per change (the dish's notice).
    const missing = x.steps.status().filter((st) => !st.done).map((st) => st.step);
    const key = missing.join(' ');
    if (key === x.waitingFor) return;
    x.waitingFor = key;
    this.post({ type: 'experimentWaiting', dishId: d.id, cardId: x.watch.def.id, reachedAtSecond: x.pending.stamp.reachedAtSecond, missing });
  }

  private experimentView(c: Comparison, x: LiveExperiment): ComparisonExperiment {
    const def = x.watch.def;
    const a = this.dishes[c.aDishId];
    const b = this.dishes[c.bDishId];
    return {
      cardId: def.id,
      title: def.title,
      labels: x.labels,
      recipeId: x.watch.recipe.id,
      recipeRevision: x.watch.recipe.revision,
      seed: def.seed,
      change: def.change,
      horizonTicks: x.horizonTicks,
      gate: a && b ? x.watch.status({ world: a.world, obs: x.obsA }, { world: b.world, obs: x.obsB }) : null,
      steps: x.steps.status(),
      stamp: x.posted ? x.watch.stamp : null,
      measured: x.measured,
    };
  }

  /**
   * One tick of a free-running dish; a single-arm card's observer and gate ride along until the gate
   * (read-only). The stamp is recorded when the measured gate holds and posted once the card's player
   * steps are taken too.
   */
  private stepDish(d: Dish): void {
    const x = d.experiment;
    // P3.8: the relationship watcher rides along on a played dish (never a comparison copy; read-only).
    const rw = d.arm ? null : (d.relationships ??= new RelationshipWatcher(d.world));
    if (rw && !rw.watches(d.world)) rw.rebind(d.world); // undo, rollback or a reload replaced the world
    if (rw && d.mapOpened && !rw.ledger.poolsArmed) rw.armPools(); // P4.13: opened before the dish was first played
    // P4.1: the notebook's watch rides along too (read-only; rebinds after undo, rollback or reload).
    const nw = this.watchOf(d);
    const observing = !!x && !x.ended && !x.watch.reached;
    // One list of the read-only stage hooks (a running card's observer first, as stepObserved does), one step.
    const hooks: ((stage: number, w: World) => void)[] = [];
    if (observing) hooks.push(x.obs.hook);
    const timed = this.diagnostics; // P4.13: time the relationship watcher only while diagnostics are on
    if (rw && timed) {
      const hook = rw.hook;
      hooks.push((stage, w) => {
        const t0 = performance.now();
        hook(stage, w);
        this.relMs += performance.now() - t0;
      });
    } else if (rw) hooks.push(rw.hook);
    if (!d.arm && d.probes && d.probes.size > 0) hooks.push(d.probes.hook); // P4.8: region probes (read-only)
    if (nw?.hook) hooks.push(nw.hook);
    if (hooks.length === 0) step(d.world);
    else if (hooks.length === 1) step(d.world, { afterStage: hooks[0]! });
    else step(d.world, { afterStage: (stage, w) => hooks.forEach((h) => h(stage, w)) });
    if (observing) {
      x.obs.afterTick(d.world);
      const stamp = x.watch.afterTick({ world: d.world, obs: x.obs }, null);
      if (stamp) {
        const measured = x.watch.measured({ world: d.world, obs: x.obs }, null);
        x.pending = { stamp, title: x.watch.def.title, label: SINGLE_RUN_LABEL, labels: x.labels, measured };
      }
    }
    if (rw && timed) {
      const t0 = performance.now();
      rw.afterTick(d.world);
      this.relMs += performance.now() - t0;
    } else rw?.afterTick(d.world);
    if (!d.arm) d.probes?.afterTick(d.world); // P4.8
    if (nw) this.notebookChanges(d, nw.afterTick(d.world));
    if (x && !x.ended && !x.posted) this.experimentSteps(d);
    this.maybeCheckpoint(d);
  }

  /**
   * P4.1: the notebook's watch on a played dish, bound to its current world (created on first use; null
   * for a comparison arm or the transient Continue copy). After undo, rollback or reload it rebuilds from
   * the saved record.
   */
  private watchOf(d: Dish): NotebookWatch | null {
    if (d.arm || d.transient) return null;
    if (!d.notebookWatch) {
      d.notebookWatch = new NotebookWatch(d.world, { get: () => d.notebook, set: (r) => (d.notebook = r) });
    } else if (!d.notebookWatch.watches(d.world)) d.notebookWatch.rebind(d.world);
    return d.notebookWatch;
  }

  /**
   * P4.1 fix round 1: after Undo or a rollback, the notebook (kept, like the journal) is checked against
   * the restored world (notebookWatch.ts notebookAfterRestore) and the watch rebuilt from the result.
   * `cause` names what restored it (a running goal ends 'undone' or 'failed'); every kind that changed is
   * announced as its own notebookChanged, each carrying the final record.
   */
  private restoreNotebook(d: Dish, cause: 'undo' | 'rollback'): void {
    const r = notebookAfterRestore(d.world, d.notebook, cause);
    if (r.changes.length > 0) d.notebook = r.record;
    d.notebookWatch?.rebind(d.world);
    this.notebookChanges(d, r.changes);
  }

  /** P4.1: the dish's notebook as it stands now (followed families' live members written in). */
  private notebookOf(d: Dish): NotebookRecord {
    const nw = d.notebookWatch;
    if (nw && nw.watches(d.world)) return nw.materialize();
    return d.notebook;
  }

  /** P4.1: announce what the watch changed (the record is already updated). */
  private notebookChanges(d: Dish, changes: readonly NotebookChange[]): void {
    for (const change of changes) this.post({ type: 'notebookChanged', dishId: d.id, record: d.notebook, change });
  }

  /** P4.1: the build options every device save of `d` uses (its notebook, nicknames kept: local files keep them). */
  private localSave(d: Dish): { notebook: NotebookRecord; includeNicknames: true } {
    return { notebook: this.notebookOf(d), includeNicknames: true };
  }

  /**
   * P2.8: every 60 simulated seconds of a played dish (never a comparison copy), write an automatic
   * checkpoint when the ring is on. The world is serialized here, synchronously, at this tick; the
   * checksum, compression and the atomic write follow without holding the dish. The outcome is posted
   * (a refused write changes nothing and keeps the older checkpoints).
   */
  private maybeCheckpoint(d: Dish): void {
    if (!this.ring || !this.ringEnabled || d.arm || d.failed) return;
    const tick = d.world.tick;
    if (tick === 0 || tick % CHECKPOINT_INTERVAL_TICKS !== 0) return;
    if (this.ringBusy) {
      this.post({ type: 'checkpoint', dishId: d.id, tick, ok: false, reason: 'busy', kept: this.ringKept });
      return;
    }
    this.ringBusy = true;
    const ring = this.ring;
    const savedAt = this.iso();
    const recipeId = d.world.content.provenance.recipeId;
    const name = d.name;
    const worldId = d.world.worldId;
    // buildSaveFile serializes the world before its first await, so the checkpoint holds exactly this tick.
    void buildSaveFile(d.world, { name, savedAt, recipeId }, this.localSave(d))
      .then((b) => ring.write({ text: b.text, checksum: b.checksum, name, worldId, tick, savedAt, recipeId, ...slotMetaCopies(b.file) }))
      .then(async (r) => {
        this.ringKept = r.ok ? (await ring.list()).length : r.kept;
        if (r.ok) this.post({ type: 'checkpoint', dishId: d.id, tick, ok: true, kept: this.ringKept, slot: checkpointSummary(r.slot, this.catalogSize()) });
        else this.post({ type: 'checkpoint', dishId: d.id, tick, ok: false, reason: r.reason, kept: r.kept });
      })
      .catch(() => this.post({ type: 'checkpoint', dishId: d.id, tick, ok: false, reason: 'write-failed', kept: this.ringKept }))
      .finally(() => {
        this.ringBusy = false;
      });
  }

  /**
   * A dish made from an experiment card was opened from a save or a file. The card's observation is
   * worker state that is not saved (the observer's history), so it cannot resume exactly: say so
   * plainly instead of stopping silently (SPEC §13.2; D-0027). The dish itself goes on as a dish.
   */
  private experimentReopened(d: Dish): void {
    const cardId = experimentOf(d.world);
    if (cardId !== null) this.post({ type: 'experimentEnded', dishId: d.id, cardId, reason: 'closed' });
  }

  /**
   * A single-arm card's dish was changed, failed or rewound: before its gate the observation stops (the
   * dish goes on). Once the measured gate has held, the stamp recorded at that moment stands while that
   * moment is still in the dish's past, and keeps waiting for the card's player steps; only a rewind to
   * before it (Undo) ends the observation.
   */
  private endExperiment(d: Dish, reason: 'changed' | 'failed' | 'undone'): void {
    const x = d.experiment;
    if (!x || x.ended || x.posted) return;
    if (x.pending && d.world.tick >= x.pending.stamp.reachedAtSecond * TICKS_PER_SECOND) return;
    x.ended = true;
    this.post({ type: 'experimentEnded', dishId: d.id, cardId: x.watch.def.id, reason });
  }

  private needCompare(compareId: string): Comparison {
    const c = this.comparison;
    if (!c || c.id !== compareId) throw new Error('That comparison is no longer open.');
    return c;
  }

  private compareStart(msg: Extract<ToWorker, { type: 'compareStart' }>): void {
    // The demo has no Compare (its UI offers none); refusing here keeps a crafted request from building arm B.
    if (this.demo) throw new DemoRefusal('Compare needs the full version of Pixelmeba. Nothing changed.');
    if (this.comparison) throw new Error('A comparison is already open; finish or delete it first.');
    const src = this.need(msg.sourceDishId);
    if (src.arm) throw new Error('A comparison copy cannot start another comparison.');
    if (src.world.sample !== null) throw new Error(SAMPLE_HELD_REFUSAL);
    if (msg.aDishId === msg.bDishId || this.dishes[msg.aDishId] || this.dishes[msg.bDishId]) throw new Error('comparison dish ids must be new and distinct');
    // Blocking panel (UX §2): the source pauses; the UI restores its prior speed when the comparison closes.
    const priorSpeed = src.speed;
    src.speed = 0;
    src.acc = 0;
    const baseline = captureBaseline(src.world);
    const c: Comparison = {
      id: msg.compareId,
      sourceDishId: src.id,
      aDishId: msg.aDishId,
      bDishId: msg.bDishId,
      baseline,
      priorSpeed,
      status: 'setup',
      horizonTicks: null,
      speed: 4,
      acc: 0,
      lastSnapshot: -Infinity,
      interventions: [],
      run: null,
      results: null,
      error: null,
    };
    this.comparison = c;
    const a = this.addArm(c, 'A', src.name);
    const b = this.addArm(c, 'B', src.name);
    if (this.active === src.id) this.active = null;
    for (const iv of msg.interventions ?? []) {
      const cmd = applyNow(b.world, iv.commandId, iv.payload);
      c.interventions.push({ commandId: iv.commandId, payload: iv.payload, result: cmd.result ?? null });
    }
    this.postCompare(c, msg.requestId);
    this.sendSnapshot(a);
    this.sendSnapshot(b);
  }

  private armWorldId(c: Comparison, role: 'A' | 'B'): string {
    return `${c.baseline.worldId}+${c.id}:${role}`;
  }

  private addArm(c: Comparison, role: 'A' | 'B', sourceName: string): Dish {
    const id = role === 'A' ? c.aDishId : c.bDishId;
    const worldId = this.armWorldId(c, role);
    const dish = this.makeDish(id, realizeArm(c.baseline, worldId), `${sourceName} (${role})`, { ...c.baseline, worldId });
    dish.arm = { compareId: c.id, role };
    this.dishes[id] = dish;
    return dish;
  }

  /** B returns to the baseline exactly (a fresh realization of the stored baseline). */
  private resetB(c: Comparison): Dish {
    const b = this.dishes[c.bDishId]!;
    const worldId = this.armWorldId(c, 'B');
    b.world = realizeArm(c.baseline, worldId);
    b.checkpoint = { ...c.baseline, worldId };
    b.replay = [];
    b.undo = null;
    b.failed = false;
    b.lastEventId = b.world.counters.nextEventId - 1;
    b.lastGeometryVersion = -1;
    this.sendSnapshot(b);
    return b;
  }

  /**
   * A command sent to a comparison arm. Only B receives changes, only before the run, and through the
   * ordinary paused-edit path (applyNow), exactly as on any dish. A change that places nothing leaves B
   * identical to A. The baseline arm A never receives a command.
   */
  private armCommand(d: Dish, msg: Extract<ToWorker, { type: 'command' }>): void {
    const c = this.comparison;
    const refuse = (error: string) => this.post({ type: 'ack', requestId: msg.requestId, dishId: d.id, result: null, error });
    if (!c || !d.arm || c.id !== d.arm.compareId) return refuse('This comparison has ended.');
    if (d.arm.role === 'A') return refuse('A is the baseline and never receives changes; queue the change on B.');
    if (c.experiment) return refuse("This experiment's one change is already on B; it takes no other change.");
    if (c.variantPair) return refuse(VARIANT_PAIR_TEXT.noChange); // P4.5: no extra commands (D09 line 115)
    if (c.status !== 'setup') return refuse('Changes can only be queued on B before the run starts.');
    const k = msg.payload.kind;
    if (k === 'sampleTake' || k === 'sampleTransfer' || k === 'sampleDiscard') return refuse('Comparison copies take no samples; sample the dish itself.');
    let result: Intervention['result'];
    try {
      result = applyNow(d.world, msg.commandId, msg.payload).result ?? null;
    } catch (e) {
      // Restore B to the baseline plus the changes already queued (deterministic), then report.
      const b = this.resetB(c);
      for (const iv of c.interventions) applyNow(b.world, iv.commandId, iv.payload);
      this.sendSnapshot(b);
      return refuse(e instanceof Error ? e.message : String(e));
    }
    if (!result || result.accepted === 0) {
      const b = this.resetB(c);
      for (const iv of c.interventions) applyNow(b.world, iv.commandId, iv.payload);
      this.sendSnapshot(b);
    } else {
      c.interventions.push({ commandId: msg.commandId, payload: msg.payload, result });
      this.sendSnapshot(d);
    }
    this.post({ type: 'ack', requestId: msg.requestId, dishId: d.id, result });
    this.postCompare(c);
  }

  private compareState(c: Comparison): ComparisonState {
    return {
      compareId: c.id,
      sourceDishId: c.sourceDishId,
      aDishId: c.aDishId,
      bDishId: c.bDishId,
      baselineTick: c.baseline.tick,
      status: c.status,
      horizonTicks: c.horizonTicks,
      ticksRun: c.run?.ticksRun ?? c.variantPair?.runner?.ticksRun ?? 0,
      speed: c.speed,
      priorSpeed: c.priorSpeed,
      interventions: c.interventions,
      results: c.results,
      error: c.error,
      ...(c.experiment ? { experiment: this.experimentView(c, c.experiment) } : {}),
      ...(c.variantPair ? { variantPair: this.variantPairView(c.variantPair) } : {}),
    };
  }

  private postCompare(c: Comparison, requestId?: number): void {
    this.post({ type: 'compareState', ...(requestId !== undefined ? { requestId } : {}), state: this.compareState(c) });
  }

  private finishComparison(c: Comparison): void {
    c.status = 'complete';
    c.acc = 0;
    c.results = c.run!.results(c.interventions);
    if (c.experiment) c.experiment.measured = this.experimentMeasured(c.run!, c.experiment);
    // The results are on the run's screen from this moment (the paired run's "view the comparison" step).
    if (c.experiment && c.experiment.steps.note('viewComparison')) this.experimentPostPaired(c, c.experiment);
    this.sendSnapshot(this.dishes[c.aDishId]!);
    this.sendSnapshot(this.dishes[c.bDishId]!);
  }

  /**
   * Advance a running comparison. Wall-clock time only decides how many *pairs* run in this frame;
   * every pair steps A once and B once, and the run stops exactly at the horizon, so the two arms
   * always hold equal tick counts.
   */
  private pumpComparison(elapsed: number, now: number): void {
    const c = this.comparison;
    if (c?.variantPair && c.status === 'running') return this.pumpVariantPair(c, c.variantPair, elapsed, now);
    if (!c || c.status !== 'running' || !c.run) return;
    const run = c.run;
    const start = this.clock.now();
    if (c.speed === 'max') c.acc = MAX_COMPARE_PAIRS_PER_PUMP;
    else if (c.speed > 0) c.acc = Math.min(MAX_BACKLOG_TICKS, c.acc + (elapsed / 1000) * 10 * c.speed);
    while (c.acc >= 1 && !run.done) {
      try {
        run.stepPair();
        if (c.experiment) this.experimentAfterPair(c, run, c.experiment);
      } catch (e) {
        c.status = 'failed';
        c.error = e instanceof Error ? e.message : String(e);
        this.postCompare(c);
        return;
      }
      c.acc -= 1;
      if (this.clock.now() - start > MAX_PUMP_MS) {
        c.acc = Math.min(c.acc, 1); // behind real time: drop the backlog, never a tick of either arm
        break;
      }
    }
    if (c.speed === 'max') c.acc = 0;
    if (run.done) {
      this.finishComparison(c);
      this.postCompare(c);
      return;
    }
    if (now - c.lastSnapshot >= SNAPSHOT_INTERVAL_MS) {
      c.lastSnapshot = now;
      this.sendSnapshot(this.dishes[c.aDishId]!);
      this.sendSnapshot(this.dishes[c.bDishId]!);
      this.postCompare(c);
    }
  }

  // -------------------------------------------------------------------------------------------
  // P4.5 Paired Garden variants (src/worker/variantPair.ts; SPEC §13.3–§13.4, D09 line 115). A What if?
  // idea runs against the unchanged Garden for the fixed 180 s, through the comparison engine's state
  // and screens. Modelled on an experiment card's paired start: both arms are realized from content
  // first (a refusal keeps nothing), then the open dish is kept (D-0033), then a NEW paused dish holding
  // the idea's start opens; it never runs during the comparison. The arms take no command.

  /** Why this pair cannot start now (null: it can). Read before and again after the keep's awaits. */
  private variantPairProblem(msg: Extract<ToWorker, { type: 'variantPairStart' }>): string | null {
    const refusal = variantPairRefusal(this.registry, msg.variantId);
    if (refusal !== null) return refusal;
    if (this.comparison) return VARIANT_PAIR_TEXT.busy;
    const all = [msg.newDishId, msg.compare.aDishId, msg.compare.bDishId];
    if (!msg.compare.compareId || new Set(all).size !== 3 || all.some((id) => !id || this.dishes[id])) return VARIANT_PAIR_TEXT.ids;
    return null;
  }

  private async variantPairStart(msg: Extract<ToWorker, { type: 'variantPairStart' }>): Promise<void> {
    const refuse = (e: unknown) =>
      this.post({ type: 'whatIfRefused', requestId: msg.requestId, code: e instanceof VariantError ? e.code : 'failed', message: e instanceof Error ? e.message : String(e) });
    const ids = msg.compare;
    const worldIds = { dish: msg.newDishId, a: `${msg.newDishId}+${ids.compareId}:A`, b: `${msg.newDishId}+${ids.compareId}:B` };
    let prepared: Awaited<ReturnType<typeof prepareVariantPair>>;
    try {
      const problem = this.variantPairProblem(msg);
      if (problem !== null) throw new Error(problem);
      prepared = await prepareVariantPair(this.registry, msg.variantId, worldIds);
    } catch (e) {
      refuse(e);
      return;
    }
    let kept: WhatIfKept | null | false;
    try {
      kept = await this.keepFirst(msg, WHAT_IF_KEEP);
    } catch (e) {
      refuse(e);
      return;
    }
    if (kept === false) return;
    // Checked again after the keep's awaits: nothing else may have taken the ids or opened a comparison.
    const late = this.variantPairProblem(msg);
    if (late !== null) {
      refuse(new Error(late));
      return;
    }
    const { facts, startA, startB, ideaWorld } = prepared;
    // The idea's own dish: paused at tick 0 and never stepped during the comparison.
    const src = this.makeDish(msg.newDishId, ideaWorld, facts.title, { ...startB, worldId: msg.newDishId });
    this.dishes[src.id] = src;
    const vp: LiveVariantPair = { facts, sequential: msg.sequential, startA, startB, runner: null, sugarEnd: null };
    const c: Comparison = {
      id: ids.compareId,
      sourceDishId: src.id,
      aDishId: ids.aDishId,
      bDishId: ids.bDishId,
      baseline: startA,
      priorSpeed: 0,
      status: 'setup',
      horizonTicks: VARIANT_PAIR_TICKS,
      speed: 4,
      acc: 0,
      lastSnapshot: -Infinity,
      interventions: [],
      run: null,
      results: null,
      error: null,
      variantPair: vp,
    };
    this.comparison = c;
    const a = this.makeDish(ids.aDishId, realizePairArm(startA), `${this.registry.variants['R-G0']?.title ?? 'Garden'} (A)`, startA);
    // Sequential: B is realized only once A has run (SPEC §13.4 "sequentially if memory requires"); until
    // then B's view shows the idea's start, read from the idea's own (paused, never stepped) world.
    // The B dish and the idea dish (`src`) then hold the SAME World object. Safe because: the arms refuse
    // every command (armCommand); the idea dish is never stepped or commanded while this comparison is open;
    // and B gets its own world when the runner realizes it (variantPairBindB). No behaviour depends on it.
    const b = this.makeDish(ids.bDishId, msg.sequential ? ideaWorld : realizePairArm(startB), `${facts.title} (B)`, startB);
    for (const [role, dish] of [
      ['A', a],
      ['B', b],
    ] as const) {
      dish.arm = { compareId: c.id, role };
      this.dishes[dish.id] = dish;
    }
    this.active = null;
    this.post({ type: 'variantPairStarted', requestId: msg.requestId, info: this.info(src), compare: this.compareState(c), ...(kept ? { kept } : {}) });
    this.sendSnapshot(a);
    this.sendSnapshot(b);
  }

  private variantPairView(vp: LiveVariantPair): ComparisonVariantPair {
    const r = vp.runner;
    return { ...vp.facts, sequential: vp.sequential, phase: r?.phase ?? null, targetTicks: r?.targetTicks ?? VARIANT_PAIR_TICKS, sugarEnd: vp.sugarEnd };
  }

  /** Run: always the fixed 180 s (D09 "the existing 180-simulation-second paired comparison"). */
  private variantPairRun(c: Comparison, vp: LiveVariantPair, horizonTicks: number | null, speed: CompareSpeed): void {
    if (horizonTicks !== VARIANT_PAIR_TICKS) throw new Error(VARIANT_PAIR_TEXT.horizon);
    const a = this.dishes[c.aDishId]!;
    const b = this.dishes[c.bDishId]!;
    vp.runner = new VariantPairRun(vp.startA, vp.startB, vp.sequential, vp.sequential ? { a: a.world } : { a: a.world, b: b.world });
    c.horizonTicks = VARIANT_PAIR_TICKS;
    c.speed = speed;
    c.acc = 0;
    c.lastSnapshot = -Infinity;
    c.status = 'running';
  }

  /** Stop: paired, both end now; sequential A, B will run to the same tick; sequential B refuses. */
  private variantPairStop(c: Comparison, vp: LiveVariantPair): void {
    const r = vp.runner!;
    const at = r.stop();
    if (at === 'aDone') this.variantPairAfterA(c);
    else if (at === 'done') this.variantPairFinish(c, vp);
  }

  /** Sequential: A's last view is sent, then A's world is let go (its dish entry with it). */
  private variantPairAfterA(c: Comparison): void {
    const a = this.dishes[c.aDishId];
    if (a) this.sendSnapshot(a);
    delete this.dishes[c.aDishId];
    if (this.active === c.aDishId) this.active = null;
    this.postCompare(c);
  }

  /** Sequential: B's dish shows B's own world once the runner has realized it. */
  private variantPairBindB(c: Comparison, vp: LiveVariantPair): void {
    const b = this.dishes[c.bDishId];
    const w = vp.runner?.b;
    if (!b || !w || b.world === w) return;
    b.world = w;
    b.checkpoint = vp.startB;
    b.lastEventId = w.counters.nextEventId - 1;
    b.lastGeometryVersion = -1;
  }

  private variantPairFinish(c: Comparison, vp: LiveVariantPair): void {
    const r = vp.runner!;
    if (vp.sequential) this.variantPairBindB(c, vp);
    c.status = 'complete';
    c.acc = 0;
    c.results = r.results();
    vp.sugarEnd = r.sugarEnd();
    const a = this.dishes[c.aDishId];
    if (a) this.sendSnapshot(a);
    this.sendSnapshot(this.dishes[c.bDishId]!);
  }

  /** As pumpComparison: wall-clock time decides only how many steps run now, never how many ticks either arm gets. */
  private pumpVariantPair(c: Comparison, vp: LiveVariantPair, elapsed: number, now: number): void {
    const r = vp.runner;
    if (!r) return;
    const start = this.clock.now();
    if (c.speed === 'max') c.acc = MAX_COMPARE_PAIRS_PER_PUMP;
    else if (c.speed > 0) c.acc = Math.min(MAX_BACKLOG_TICKS, c.acc + (elapsed / 1000) * 10 * c.speed);
    while (c.acc >= 1 && !r.done) {
      let at: ReturnType<VariantPairRun['step']>;
      try {
        at = r.step();
      } catch (e) {
        c.status = 'failed';
        c.error = e instanceof Error ? e.message : String(e);
        this.postCompare(c);
        return;
      }
      if (at === 'aDone') this.variantPairAfterA(c);
      else if (vp.sequential) this.variantPairBindB(c, vp);
      c.acc -= 1;
      if (this.clock.now() - start > MAX_PUMP_MS) {
        c.acc = Math.min(c.acc, 1);
        break;
      }
    }
    if (c.speed === 'max') c.acc = 0;
    if (r.done) {
      this.variantPairFinish(c, vp);
      this.postCompare(c);
      return;
    }
    if (now - c.lastSnapshot >= SNAPSHOT_INTERVAL_MS) {
      c.lastSnapshot = now;
      const a = this.dishes[c.aDishId];
      if (a && (!vp.sequential || r.phase === 'A')) this.sendSnapshot(a);
      if (!vp.sequential || r.phase === 'B') this.sendSnapshot(this.dishes[c.bDishId]!);
      this.postCompare(c);
    }
  }

  /** Duplicate dish: an independent copy of `d` as a new branch (registered, not activated). */
  private duplicateDish(d: Dish, newDishId: string): Dish {
    // A copy of a copy does not grow the id (as a checkpoint branch; the id is never hashed).
    const state = { ...serializeWorld(d.world), worldId: branchWorldId(d.world.worldId, newDishId) };
    const copy: Dish = {
      ...d,
      id: newDishId,
      world: deserializeWorld(state),
      name: `${d.name} (copy)`,
      speed: 0,
      undo: null,
      // No undo point, so no labels to re-apply; an array of its own so neither dish can push into the other's.
      undoLabels: [],
      checkpoint: state,
      replay: [],
      failed: false,
      ticksWindow: [],
      lastGeometryVersion: -1,
      selection: null,
      arm: null,
      experiment: null,
      // P3.5: the original's Sample Begin hash is not the copy's (as after a reload: null).
      sampleBeginHash: null,
      // P3.8: a watcher of its own, started fresh (as after a reload: the table is never saved). The
      // spread shared the original's, so what the copy showed was written into the original's record.
      relationships: null,
      // P4.8: regions are the open dish's session state; the copy starts with none.
      probes: null,
      // P4.1: the copy follows the same families (favorites only, under its own world id), with its own watch.
      notebook: favoritesOnly(this.notebookOf(d), state.worldId),
      notebookWatch: null,
    };
    this.dishes[newDishId] = copy;
    return copy;
  }

  private need(dishId: string): Dish {
    const d = this.dishes[dishId];
    if (!d) throw new Error(`no dish ${dishId}`);
    return d;
  }

  private build(source: DishSource, dishId: string): World {
    if (source.kind === 'recipe') {
      // P2.2: only the recorded evolution settings exist (a malformed request builds nothing).
      const o0 = source.overrides;
      if (o0?.mutationPreset !== undefined && !isMutationPreset(o0.mutationPreset)) throw new Error(`Unknown evolution setting "${String(o0.mutationPreset)}".`);
      if (o0?.founderMode !== undefined && !['identical', 'varied', 'diverse'].includes(o0.founderMode)) throw new Error(`Unknown founder mode "${String(o0.founderMode)}".`);
      // P3.2: only a habitat preset this build enables.
      if (o0?.habitatId !== undefined && (typeof o0.habitatId !== 'string' || !this.registry.manifest.enabledHabitats.includes(o0.habitatId) || !this.registry.habitats[o0.habitatId]))
        throw new Error(`There is no habitat "${String(o0.habitatId)}" in this version of Pixelmeba.`);
      // P5.4 (wave 14, D-0128): a habitat this build cannot offer (its phase, structures, systems, materials).
      // Defensive: the validator refuses a shipped habitat that fails the offer rule, so this never fires for one.
      if (o0?.habitatId !== undefined && !habitatOffered(this.registry.habitats[o0.habitatId]!, this.registry.manifest))
        throw new Error(`There is no habitat "${o0.habitatId}" in this version of Pixelmeba.`);
      // P5.4: a Suggested Community only on an empty start whose habitat this build offers one for (CT §8.2).
      if (o0?.community !== undefined && typeof o0.community !== 'boolean') throw new Error(`Unknown community setting "${String(o0.community)}".`);
      if (o0?.community === true) {
        if (o0.empty !== true) throw new Error('A Suggested Community starts from an empty habitat.');
        const habitat = this.registry.habitats[o0.habitatId ?? this.registry.recipes[source.recipeId]?.habitatId ?? ''];
        if (habitat !== undefined && !communityOffered(habitat, this.registry.manifest, this.registry.species))
          throw new Error(`There is no Suggested Community for ${habitat.name} in this version of Pixelmeba.`);
      }
      // Protocol 3 (P5.1 New Dish Environment; D-0111 carry-over): only known values, and a cycle or drying only
      // with this build's 'climate' system, refused here in the player's words before anything is built (so
      // realizeRecipe's RecipeError never reaches the player as a raw message).
      if (o0?.lid !== undefined && o0.lid !== 'open' && o0.lid !== 'closed') throw new Error(`Unknown lid setting "${String(o0.lid)}".`);
      if (o0?.lightMode !== undefined && o0.lightMode !== 'fixed' && o0.lightMode !== 'cycle') throw new Error(`Unknown light setting "${String(o0.lightMode)}".`);
      if (o0?.drying !== undefined && typeof o0.drying !== 'boolean') throw new Error(`Unknown drying setting "${String(o0.drying)}".`);
      const climate = this.registry.manifest.enabledSystems.includes('climate');
      if (o0?.lightMode === 'cycle' && !climate) throw new Error("Day and night light needs the climate system, which this dish's content does not include.");
      if (o0?.drying === true && !climate) throw new Error("Drying needs the climate system, which this dish's content does not include.");
      const o = source.overrides;
      return realizeRecipe(this.registry, source.recipeId, {
        worldId: dishId,
        ...(source.seed !== undefined ? { seed: source.seed } : {}),
        ...(o ? { transform: (r) => applyRecipeOverrides(r, o) } : {}),
        // What if? (D09 §4): record exactly what was applied above, so the world says whether it IS the authored recipe.
        provenance: this.recipeProvenance(source),
      });
    }
    return deserializeWorld(source.state);
  }

  /** Provenance of a recipe dish with the overrides build() applies (`{}` = the recipe as authored). */
  private recipeProvenance(source: Extract<DishSource, { kind: 'recipe' }>): RecipeWorldProvenance {
    const o = source.overrides;
    const overrides: RecipeOverridesRecord = {
      ...(source.seed !== undefined ? { seed: source.seed } : {}),
      ...(o?.mutationPreset ? { mutationPreset: o.mutationPreset } : {}),
      ...(o?.founderMode ? { founderMode: o.founderMode } : {}),
      ...(o?.empty ? { empty: true } : {}),
      ...(o?.habitatId !== undefined ? { habitatId: o.habitatId } : {}),
      // Protocol 3: exactly the environment keys given (none when absent: byte-identical to a protocol 2 build).
      ...(o?.lid !== undefined ? { lid: o.lid } : {}),
      ...(o?.lightMode !== undefined ? { lightMode: o.lightMode } : {}),
      ...(o?.drying !== undefined ? { drying: o.drying } : {}),
      // P5.4: recorded only when true (a request without it records exactly what it did before).
      ...(o?.community === true ? { community: true } : {}),
    };
    return { recipeId: source.recipeId, recipeRevision: this.registry.recipes[source.recipeId]?.revision ?? null, createdFrom: 'recipe', overrides };
  }

  // -------------------------------------------------------------------------------------------
  // What if? (P2.6; SPEC §13.3, UX §3.4, D09 §4–§5). Previews and catalog order are pure functions of
  // content; realization builds a fresh world at tick 0 and never touches another world or its random
  // streams. The previous dish is kept through the save flow before the new dish opens.

  /**
   * DishInfo fields: the variant record (provenance) and the recipe whose What if? ideas apply: a
   * variant dish's source, or the recipe a dish IS exactly (D09 §4). A custom dish gets none.
   */
  private whatIfInfo(w: World): { variant: VariantRecord | null; whatIfSourceId: string | null } {
    const record = variantRecordOf(w);
    if (record) return { variant: record, whatIfSourceId: record.sourceId };
    const p = w.content.provenance;
    const recipe = p.createdFrom === 'recipe' && p.recipeId !== null ? this.registry.recipes[p.recipeId] : undefined;
    const ideas = recipe !== undefined && this.isAuthoredRecipe(w, recipe) && whatIfChoices(this.registry, recipe.id).length > 0;
    return { variant: null, whatIfSourceId: ideas && recipe ? recipe.id : null };
  }

  /**
   * D09 §4 "remixes authored starting recipes … In a custom dish, offer Duplicate dish": the world was
   * made from this build's revision of the recipe with its own seed, no overrides and not empty. A
   * save made before overrides were recorded counts only when its seed and settings match exactly AND
   * its recorded start is the authored recipe's: the ledger's initial totals (the habitat) and what
   * the recipe itself put in at tick 0 (its patches and founders, as the ledger's entries record
   * them). So an Empty start of the same recipe and seed never counts, and neither does a save whose
   * earliest ledger entries are gone (the list is bounded): it cannot be told apart. A malformed
   * record never counts.
   */
  private isAuthoredRecipe(w: World, recipe: RecipeDef): boolean {
    if (w.content.provenance.recipeRevision !== recipe.revision || w.seed !== recipe.seed) return false;
    const o = recipeOverridesOf(w);
    if (o === null) return false;
    if (o === undefined) {
      if (w.settings.mutationPreset !== recipe.mutationPreset || w.settings.founderMode !== recipe.founderMode) return false;
      const start = this.authoredStart(recipe);
      const L = w.ledger.initial;
      return start !== null && w.ledger.initialized && L.c === start.c && L.n === start.n && L.m === start.m && recipeStartInputs(w) === start.inputs;
    }
    return (
      o.empty !== true &&
      o.community !== true &&
      (o.habitatId ?? recipe.habitatId) === recipe.habitatId &&
      (o.seed ?? recipe.seed) === recipe.seed &&
      (o.mutationPreset ?? recipe.mutationPreset) === recipe.mutationPreset &&
      (o.founderMode ?? recipe.founderMode) === recipe.founderMode &&
      (o.lid ?? recipe.lid) === recipe.lid &&
      (o.lightMode ?? recipe.lightMode) === recipe.lightMode &&
      (o.drying ?? recipe.drying) === recipe.drying
    );
  }

  /** The recorded start of this build's authored recipe (realized once per recipe; pure). */
  private authoredStart(recipe: RecipeDef): AuthoredStart | null {
    const known = this.authoredStarts[recipe.id];
    if (known !== undefined) return known;
    let start: AuthoredStart | null;
    try {
      const w = realizeRecipe(this.registry, recipe.id, { worldId: `authored:${recipe.id}` });
      start = w.ledger.initialized ? { ...w.ledger.initial, inputs: recipeStartInputs(w) } : null;
    } catch {
      start = null;
    }
    this.authoredStarts[recipe.id] = start;
    return start;
  }

  /** Every What if? failure becomes a readable refusal: nothing was started, saved or changed. */
  private async handleWhatIf(msg: Extract<ToWorker, { type: 'whatIf' | 'whatIfStart' }>): Promise<void> {
    try {
      if (msg.type === 'whatIf') this.post({ type: 'whatIf', requestId: msg.requestId, answer: await this.whatIfAnswer(msg.sourceId, msg.aboutDishId) });
      else await this.whatIfStart(msg);
    } catch (e) {
      const code: WhatIfRefusalCode = e instanceof WhatIfRefusal ? e.code : e instanceof VariantError ? e.code : 'failed';
      this.post({ type: 'whatIfRefused', requestId: msg.requestId, code, message: e instanceof Error ? e.message : String(e) });
    }
  }

  /**
   * The choices, previews and keep plan; `registryLabel` is the UX §3.3 label of the world a choice
   * would build (this build's manifest, by the same rule as DishInfo.manifestLabel).
   */
  private async whatIfAnswer(sourceIdIn: string | null, dishId: string | null): Promise<WhatIfAnswer> {
    const d = dishId !== null ? this.need(dishId) : null;
    const record = d ? variantRecordOf(d.world) : null;
    const sourceId = sourceIdIn ?? (d ? this.whatIfInfo(d.world).whatIfSourceId : null);
    if (sourceId === null) throw new WhatIfRefusal('not-variant', 'This dish did not start from a recipe with What if? ideas.');
    const source = this.registry.recipes[sourceId];
    const choices: WhatIfChoice[] = [];
    if (source) {
      for (const v of whatIfChoices(this.registry, sourceId).slice(0, MAX_WHAT_IF_CHOICES)) {
        const { oldCells, newCells } = variantPatchOutlines(this.registry, v.id);
        choices.push({ preview: variantPreview(this.registry, v.id), oldCells, newCells, ...(await variantChecksums(this.registry, v.id)) });
      }
    }
    const nextId = record && this.registry.variants[record.variantId] ? nextVariantId(this.registry, record.variantId) : null;
    const next = nextId !== null ? this.registry.variants[nextId]! : null;
    return {
      sourceId,
      sourceName: source?.name ?? sourceId,
      sourceQuestion: source?.question ?? null,
      choices,
      layout: {
        patches: (source?.fieldPatches ?? []).map((p, index) => ({ index, center: p.center, radius: p.radius, label: p.label ?? null })),
        founders: (source?.founders ?? []).map((f) => ({ speciesId: f.species, name: this.registry.species[f.species]?.name ?? f.species, count: f.count, center: f.center, radius: f.radius })),
      },
      current: d && record ? { ...record, atStart: await this.rebuildsExactly(d) } : null,
      next: next ? { id: next.id, title: next.title, question: next.question, previewDifference: next.previewDifference } : null,
      // With no dish open, the plan is about the dish Continue holds (D-0033 fix round 1).
      plan: await this.planFor(d?.id ?? null, null, null),
      registryLabel: registryLabel(this.registry.manifest, this.catalogSize()),
    };
  }

  /**
   * "Unchanged, rebuilds exactly" (D-0026; D-0033 (a)): nothing needs keeping because this build rebuilds
   * the dish exactly as it is. The dish is at tick 0 and everything a save of it would hold (the whole
   * serialized world: state, history with the journal, command log, lineage, branches, provenance; what
   * the save file's checksum covers) equals what this build realizes from its recorded start under the
   * same world id (freshStart): a What if? idea, and (fix round 1) a recipe start from the Play shelf
   * or New Dish with its recorded seed and choices, or an experiment card's start. A tick, a command, a
   * rename, a journal note, another build's content or an idea revised since all differ, so such a dish
   * is kept like any other. A start this build cannot realize (a card with a timed change, another
   * recipe revision, malformed recorded choices, an idea not exactly as recorded here) is never called
   * unchanged. An older save that did not record its choices is compared with the recipe's authored
   * start (fix round 2: the comment used to say it was always kept): only an exact match of the whole
   * world, content manifest and provenance included, is unchanged, so a custom seed or setting is kept.
   */
  private async rebuildsExactly(d: Dish): Promise<boolean> {
    if (d.world.tick !== 0) return false;
    // P4.1: a followed family is the player's own record, never rebuilt from the start: such a dish is kept.
    if (!notebookIsEmpty(this.notebookOf(d))) return false;
    let fresh: World | null;
    try {
      fresh = await this.freshStart(d.world);
    } catch {
      fresh = null;
    }
    // Compared after the await, with no await after it: the dish may have been stepped meanwhile.
    return fresh !== null && d.world.tick === 0 && canonicalJson(serializeWorld(d.world)) === canonicalJson(serializeWorld(fresh));
  }

  /**
   * The world this build realizes from `w`'s recorded start, under `w`'s own world id; null when that
   * start cannot be named exactly. A What if? dish only while its idea is exactly as recorded here (the
   * variant revision, both checksums, the content hash and the rule versions: recordMatchesBuild).
   */
  private async freshStart(w: World): Promise<World | null> {
    const record = variantRecordOf(w);
    if (record) return (await this.recordMatchesBuild(record)) ? realizeVariant(this.registry, record.variantId, { worldId: w.worldId }) : null;
    const cardId = experimentOf(w);
    if (cardId !== null) {
      const def = this.registry.experiments[cardId];
      // A card with a timed change starts after its recipe ran to the change: not a tick-0 start.
      if (!def || def.change.kind === 'commands') return null;
      return realizeExperimentArms(this.registry, def, { worldIds: { A: w.worldId, B: `${w.worldId}:B` } }).A;
    }
    const p = w.content.provenance;
    if (p.createdFrom !== 'recipe' || p.recipeId === null) return null;
    const recipe = this.registry.recipes[p.recipeId];
    const o = recipeOverridesOf(w);
    // Undefined overrides: an older save that did not record its choices. Its start is only guessed at
    // here, and any difference (a custom seed or setting) makes the comparison below fail: it is kept.
    if (!recipe || p.recipeRevision !== recipe.revision || o === null) return null;
    const changed = o !== undefined && hasRecipeChanges(o);
    return realizeRecipe(this.registry, recipe.id, {
      worldId: w.worldId,
      ...(o?.seed !== undefined ? { seed: o.seed } : {}),
      ...(changed ? { transform: (r: RecipeDef): RecipeDef => applyRecipeOverrides(r, o) } : {}),
      // Recorded as the dish recorded it: provenance is compared too, never assumed.
      provenance: JSON.parse(JSON.stringify(p)) as World['content']['provenance'],
    });
  }

  /** The variant record names exactly what this build would realize (same idea, same rules). */
  private async recordMatchesBuild(r: VariantRecord): Promise<boolean> {
    const v = this.registry.variants[r.variantId];
    const m = this.registry.manifest;
    if (!v || v.revision !== r.variantRevision || v.sourceId !== r.sourceId || v.sourceRevision !== r.sourceRevision) return false;
    if (m.contentHash !== r.contentHash || m.contentVersion !== r.contentVersion) return false;
    if (m.simulationVersion !== r.simulationVersion || m.evolutionRulesVersion !== r.evolutionRulesVersion) return false;
    try {
      const sums = await variantChecksums(this.registry, r.variantId);
      return sums.sourceChecksum === r.sourceChecksum && sums.variantChecksum === r.variantChecksum;
    } catch {
      return false;
    }
  }

  /** The 'unchanged' plan of `d`: a What if? idea says "that idea again"; any other start names its seed. */
  private unchangedPlan(d: Dish): WhatIfPlan {
    return { kind: 'unchanged', name: d.name, ...(variantRecordOf(d.world) ? {} : { seed: d.world.seed }), ...(d.transient ? { fromContinue: true as const } : {}) };
  }

  /**
   * How 'auto' would keep this dish (UX §3.4; D-0033): nothing when it rebuilds exactly, or when its own
   * slot already holds it exactly as it is; else its own slot (unless the action opens that slot:
   * `exclude`), else the first free named slot; 'full' when all ten are used.
   */
  private async keepPlan(d: Dish | null, exclude: string | null = null): Promise<WhatIfPlan> {
    if (!d) return { kind: 'none' };
    const about = d.transient ? { fromContinue: true as const } : {};
    if (await this.rebuildsExactly(d)) return this.unchangedPlan(d);
    if (!this.store) return { kind: 'unavailable', name: d.name };
    const own = this.ownSlots[d.id];
    if (own !== undefined) {
      if (await this.holdsExactly(own, d)) return { kind: 'saved', slotId: own, name: d.name, ...about };
      if (own !== exclude) return { kind: 'slot', slotId: own, own: true, name: d.name, ...about };
    }
    const free = await this.store.freeSlot();
    return free !== null ? { kind: 'slot', slotId: free, own: false, name: d.name, ...about } : { kind: 'full', name: d.name, ...about };
  }

  /**
   * D-0033: the plan for the open dish `aboutDishId`, or, with no dish open (fix round 1), for the dish
   * Continue holds. Continue is loaded only when it may be an untouched start (tick 0); otherwise its
   * index says everything the plan needs (its bound slot, that slot's checksum, the free slots).
   */
  private async planFor(aboutDishId: string | null, exclude: string | null, opening: string | null): Promise<WhatIfPlan> {
    if (aboutDishId !== null) return this.keepPlan(this.need(aboutDishId), exclude);
    const found = await this.continueToKeep(opening, true, true);
    if (found === null) return { kind: 'none' };
    if (found.kind === 'saved') return { kind: 'saved', slotId: found.held.slotId, name: found.name, fromContinue: true };
    if (found.kind === 'dish') {
      try {
        return await this.keepPlan(found.dish, exclude);
      } finally {
        delete this.ownSlots[found.dish.id];
      }
    }
    // Not a tick-0 start (so never 'unchanged') and not already in its slot: where it would go.
    if (found.bound !== null && found.bound !== exclude) return { kind: 'slot', slotId: found.bound, own: true, name: found.name, fromContinue: true };
    const free = await this.store!.freeSlot();
    return free !== null ? { kind: 'slot', slotId: free, own: false, name: found.name, fromContinue: true } : { kind: 'full', name: found.name, fromContinue: true };
  }

  /**
   * D-0033 fix round 1: the dish Continue holds while no dish is open. Home offers it as the player's
   * dish ("Continue — … Opens paused"), and the next autosave of whatever opens instead would replace it,
   * so a replacing action keeps it first by the same rules as an open dish. Null when there is nothing
   * to keep: no saving on this device, Continue is empty or unreadable, or the action opens Continue.
   * - 'saved': its slot (bindingOf: a named slot holding exactly Continue's file, else D-0026's active
   *   slot while it still holds the record Continue was bound to) holds exactly the same file (index
   *   checksum and name; nothing is loaded; `quick` only). Fix round 2: once kept, the dish Continue
   *   holds is exactly in the slot it was written to, so every later launch answers 'saved';
   * - 'index' (`planOnly`, not a tick-0 start): what a plan needs, without loading it;
   * - 'dish': loaded as a transient dish (never registered or run), bound to that slot, to be kept like
   *   an open dish. The caller removes its binding afterwards.
   */
  private async continueToKeep(
    opening: string | null,
    quick: boolean,
    planOnly = false,
  ): Promise<
    | { readonly kind: 'saved'; readonly held: SlotInfo; readonly name: string }
    | { readonly kind: 'index'; readonly bound: string | null; readonly name: string }
    | { readonly kind: 'dish'; readonly dish: Dish }
    | null
  > {
    if (!this.store || opening === AUTOSAVE_SLOT) return null;
    const auto = await this.store.slot(AUTOSAVE_SLOT);
    if (!auto) return null;
    const bound = await this.bindingOf(AUTOSAVE_SLOT, auto.worldId ?? null);
    if (quick && bound !== null) {
      const held = await this.store.slot(bound);
      if (held && held.checksum === auto.checksum && held.name === auto.name && sameNotebook(held, auto)) return { kind: 'saved', held, name: auto.name };
    }
    if (planOnly && auto.tick !== 0) return { kind: 'index', bound, name: auto.name };
    const got: { v: { file: SaveFile; world: World; notebook: NotebookRecord } | null } = { v: null };
    const res = await this.store.load(AUTOSAVE_SLOT, async (text) => {
      got.v = await loadSaveFile(text);
      return true;
    });
    if (!res || !got.v) return null;
    const { file, world, notebook } = got.v;
    // P4.1: the notebook Continue holds is kept with it.
    const dish: Dish = { ...this.makeDish(`${CONTINUE_DISH}${++continueDishes}`, world, file.meta.name, file.state), transient: true, notebook };
    // An older copy (the latest autosave was damaged) is bound to nothing: it never replaces a newer save.
    if (bound !== null && !res.usedPredecessor) this.ownSlots[dish.id] = bound;
    return { kind: 'dish', dish };
  }

  /** The save file of `d` as a keep would write it now (serialized before the first await: one moment). */
  private buildFor(d: Dish, savedAt: string): ReturnType<typeof buildSaveFile> {
    return buildSaveFile(d.world, { name: d.name, savedAt, recipeId: d.world.content.provenance.recipeId }, this.localSave(d));
  }

  /**
   * D-0033 "unchanged since it was saved to its active slot", proved exactly: the slot's current record
   * has the checksum of the file a save would write now (the checksum covers the whole serialized world:
   * state, history, journal, command log, provenance) and the same name. Only the write time differs.
   * A different name or moment (the tick is part of that state) is a change without building anything;
   * the index can only err towards writing (e.g. an older index with a later tick than its file).
   * `built`: the file already built for this moment (the keep step writes that same file).
   */
  private async holdsExactly(slotId: string, d: Dish, built?: BuiltFile): Promise<boolean> {
    const held = this.store ? await this.store.slot(slotId) : null;
    if (held === null || held.name !== d.name || held.tick !== d.world.tick) return false;
    const file = built ?? (await this.buildFor(d, this.iso()));
    // P4.1: the notebook beside the state counts too (a Follow made since that save is a change).
    return held.checksum === file.checksum && (held.notebookChecksum ?? null) === (file.file.notebook?.checksum ?? null);
  }

  /**
   * D-0033: the named slot a dish opened from `slotId` is bound to (D-0026's active slot: the slot it was
   * opened from or last saved to). A named slot binds to itself. The autosave (Continue) binds to:
   * 1. (fix round 2) a named slot whose current record is exactly Continue's file: the same index
   *    checksum (over the whole serialized state, world id and moment included) and the same name.
   *    Continue is then that save, so that is where it was last saved: the recorded slot when it is one
   *    of them, else the lowest-numbered. This holds however the two were written (a keep of the dish
   *    Continue held, a save and its autosave, a Continue rewrite that failed), and a changed dish never
   *    matches;
   * 2. else the slot its dish was bound to when it was written, only while that slot still holds exactly
   *    the record it held when Continue's state was taken (fix round 1: Continue is then that save or a
   *    later moment of the same dish, so a save written after it is never replaced by the older
   *    Continue) and the same world;
   * 3. else (an older index without that record) none.
   * Only for Continue's latest record: a copy read from its predecessor is bound to nothing (callers).
   */
  private async bindingOf(slotId: string, worldId: string | null): Promise<string | null> {
    if (SaveStoreClass.slotIds().includes(slotId)) return slotId;
    if (slotId !== AUTOSAVE_SLOT || !this.store) return null;
    const auto = await this.store.slot(AUTOSAVE_SLOT);
    if (!auto) return null;
    const exact = await this.exactCopies(auto);
    if (exact.length > 0) return auto.activeSlot !== undefined && exact.includes(auto.activeSlot) ? auto.activeSlot : exact[0]!;
    const bound = auto.activeSlot;
    if (bound === undefined || auto.activeRecord === undefined || !SaveStoreClass.slotIds().includes(bound)) return null;
    const target = await this.store.slot(bound);
    const same = worldId ?? auto.worldId;
    return target !== null && target.current === auto.activeRecord && target.worldId !== undefined && target.worldId === same && auto.worldId === same ? bound : null;
  }

  /**
   * The named slots, in slot order, whose current record is exactly the file `s` describes (same index
   * checksum and name; only the write time may differ). Read from the index: nothing is loaded.
   */
  private async exactCopies(s: SlotInfo): Promise<string[]> {
    const index = this.store ? await this.store.list() : [];
    return SaveStoreClass.slotIds().filter((id) => index.some((x) => x.slotId === id && x.checksum === s.checksum && x.name === s.name && sameNotebook(x, s)));
  }

  /**
   * The dish a keep is about: the open dish `dishId`, or with none open the dish Continue holds (fix
   * round 1; see continueToKeep). A WhatIfKept when Continue's own slot already holds it exactly (nothing
   * to write); null when there is nothing to keep.
   */
  private async keepSource(dishId: string | null, keep: WhatIfKeep, opening: string | null): Promise<Dish | WhatIfKept | null> {
    if (dishId !== null) return this.need(dishId);
    const found = await this.continueToKeep(opening, keep.kind === 'auto');
    if (found === null || found.kind === 'index') return null;
    if (found.kind === 'dish') return found.dish;
    return { kind: 'saved', slot: this.describeSlot(found.held), replaced: null, name: found.name, autosaved: false, fromContinue: true };
  }

  /** keepDish for a keep source (a transient Continue dish is marked as such and unbound afterwards). */
  private async keepSourceDish(d: Dish, keep: WhatIfKeep, options: KeepOptions): Promise<WhatIfKept> {
    try {
      const kept = await this.keepDish(d, keep, options);
      return d.transient ? { ...kept, fromContinue: true } : kept;
    } finally {
      if (d.transient) delete this.ownSlots[d.id];
    }
  }

  /**
   * D-0033: keep the open dish named by a request's `keepFrom` (with none open, the dish Continue holds)
   * before the new dish opens, through the one keep step (keepDish). Returns how it was kept, null when
   * the request keeps nothing, or false when keeping refused the replacement: `keepRefused` has been
   * posted and nothing was changed.
   */
  private async keepFirst(msg: { readonly requestId: number; readonly keepFrom?: KeepFrom }, options: KeepOptions): Promise<WhatIfKept | null | false> {
    if (!msg.keepFrom) return null;
    const src = await this.keepSource(msg.keepFrom.dishId, msg.keepFrom.keep, options.opening);
    if (src === null || !('world' in src)) return src;
    if (src.arm) throw new Error('A comparison copy is not a dish to keep.');
    try {
      return await this.keepSourceDish(src, msg.keepFrom.keep, options);
    } catch (e) {
      if (!(e instanceof WhatIfRefusal)) throw e;
      const code: KeepRefusalCode = e.code === 'slots-full' || e.code === 'save-failed' || e.code === 'save-unavailable' ? e.code : 'failed';
      this.post({ type: 'keepRefused', requestId: msg.requestId, code, message: e.message, exclude: options.exclude, name: src.name, ...(src.transient ? { fromContinue: true as const } : {}) });
      return false;
    }
  }

  private async whatIfStart(msg: Extract<ToWorker, { type: 'whatIfStart' }>): Promise<void> {
    if (this.dishes[msg.newDishId]) throw new WhatIfRefusal('in-use', 'That new dish id is already in use.');
    const from = msg.fromDishId !== null ? this.need(msg.fromDishId) : null;
    if (from?.arm) throw new WhatIfRefusal('not-variant', 'A comparison copy cannot start a What if? dish.');
    // 1. Build the new world first (pure): a refusal here saves nothing and changes nothing.
    const worldId = msg.newDishId;
    let world: World;
    if (msg.pick.kind === 'variant') {
      world = await realizeVariant(this.registry, msg.pick.variantId, { worldId });
    } else {
      const record = from ? variantRecordOf(from.world) : null;
      if (!record) throw new WhatIfRefusal('not-variant', 'This dish was not made from a What if? idea, so there is nothing to start again.');
      if (msg.pick.kind === 'again') {
        world = await realizeAgain(this.registry, record, { worldId });
      } else {
        const nextId = this.registry.variants[record.variantId] ? nextVariantId(this.registry, record.variantId) : null;
        if (nextId === null) throw new WhatIfRefusal('unknown-variant', `There is no other idea for "${record.title}" in this version of Pixelmeba. Your dish is unchanged.`);
        world = await realizeVariant(this.registry, nextId, { worldId });
      }
    }
    // P4.11: a world the demo cannot hold is refused before anything is kept.
    if (this.demo) {
      const problem = demoProblem(world, this.demo, this.registry);
      if (problem) throw new WhatIfRefusal('failed', `Couldn't start: ${demoReason(problem)}. Nothing changed.`);
    }
    // 2. Keep the current dish (with none open, the dish Continue holds: D-0033 fix round 1) through the
    // save flow; a refusal or failed write starts nothing.
    const src = await this.keepSource(msg.fromDishId, msg.keep, null);
    const kept = src === null ? await this.keepDish(null, msg.keep) : 'world' in src ? await this.keepSourceDish(src, msg.keep, WHAT_IF_KEEP) : src;
    // 3. Open the new dish, paused, as a separate dish with its own world id.
    const dish = this.addDish(msg.newDishId, world, variantRecordOf(world)!.title);
    this.post({ type: 'whatIfStarted', requestId: msg.requestId, info: this.info(dish), kept });
    this.sendSnapshot(dish);
  }

  /**
   * Write a built file of dish `d` to a slot exactly as saveSlot/autosave do. The autosave notes the
   * dish's active slot, with `activeRecord`: that slot's record as it stood when the state was taken.
   */
  private async writeBuilt(d: Dish, slotId: string, savedAt: string, built: BuiltFile, activeRecord?: string): Promise<SlotInfo> {
    const own = slotId === AUTOSAVE_SLOT ? this.ownSlots[d.id] : undefined;
    return this.store!.save(this.saveRequest(d, slotId, d.name, savedAt, built, own !== undefined && activeRecord !== undefined ? { slot: own, record: activeRecord } : undefined));
  }

  /**
   * The store request that writes `built` (a file of dish `d`, named `name`) to `slotId`: the one shape
   * every save, autosave and keep writes. For the autosave, `binding` is the named slot the dish is bound
   * to and that slot's record when the state was taken (D-0033 fix round 1).
   */
  private saveRequest(d: Dish, slotId: string, name: string, savedAt: string, built: BuiltFile, binding?: { readonly slot: string; readonly record: string }): SaveRequest {
    const variant = built.file.meta.variant;
    return {
      slotId,
      text: built.text,
      checksum: built.checksum,
      name,
      tick: built.file.tick,
      savedAt,
      recipeId: d.world.content.provenance.recipeId,
      ...(variant ? { variant } : {}),
      ...slotMetaCopies(built.file),
      worldId: built.file.state.worldId,
      // P4.3: the saved moment's thumbnail, read from the file's own state (outside its checksum).
      thumb: thumbFromState(built.file.state),
      ...(binding ? { activeSlot: binding.slot, activeRecord: binding.record } : {}),
      // P4.1: the notebook beside the state, so holdsSave sees a notebook-only change.
      ...(built.file.notebook ? { notebookChecksum: built.file.notebook.checksum } : {}),
    };
  }

  /**
   * An autosave event: every 30 s while a dish is open, going to the background, leaving the page
   * (SPEC §14.2), and after a manual save or a recorded journal note. D-0033 fix round 3: Continue is
   * written unless it already holds exactly the file this write would make. That is the test D-0033 (b)
   * uses for keeping, never a dirty flag: a change path that forgot to set a flag would skip a changed
   * dish, and the checksum cannot. "Exactly" is `holdsSave` (src/persistence/store.ts): Continue's current
   * index record equals, field for field, the record this write would make, apart from the write time and
   * the storage bookkeeping:
   * - the same checksum over the canonical serialized world, so every change a save holds counts (a
   *   tick, a command placed while paused, a rename or pin, a journal note, a preset change);
   * - the same name;
   * - the same binding (activeSlot and activeRecord, as the write would record them);
   * - the same index copies (tick, recipe, world id, variant, evolution, registry).
   * The file is built at every event, and nothing is written for an unchanged dish (the store stays
   * byte-identical). The reply says whether it wrote.
   */
  private async autosave(msg: Extract<ToWorker, { type: 'autosave' }>, d: Dish): Promise<void> {
    if (!this.store) throw new Error('Saving is unavailable on this device.');
    const name = d.name;
    const savedAt = this.iso();
    // D-0033: the autosave remembers the slot its dish is bound to, so Continue reopens it bound again,
    // and (fix round 1) that slot's record as it stands before this state is taken: Continue is bound
    // again only while the slot still holds exactly that record, so an older Continue never replaces
    // a newer save in the slot. Read first: the file below is serialized after it, never before.
    const own = this.ownSlots[d.id];
    const ownRecord = own !== undefined ? (await this.store.slot(own))?.current : undefined;
    const built = await buildSaveFile(d.world, { name, savedAt, recipeId: d.world.content.provenance.recipeId }, this.localSave(d));
    const req = this.saveRequest(d, AUTOSAVE_SLOT, name, savedAt, built, own !== undefined && ownRecord !== undefined ? { slot: own, record: ownRecord } : undefined);
    const held = await this.store.slot(AUTOSAVE_SLOT);
    if (held !== null && holdsSave(held, req)) {
      this.post({ type: 'slotSaved', requestId: msg.requestId, slot: this.describeSlot(held), wrote: false });
      return;
    }
    const info = await this.store.save(req);
    this.post({ type: 'slotSaved', requestId: msg.requestId, slot: this.describeSlot(info), wrote: true });
  }

  /**
   * The one keep step (UX §3.4, D09 §3; D-0026, D-0033): keep the dish being left before a new dish
   * opens. 'auto' writes nothing when the dish rebuilds exactly ('unchanged') or its own slot already
   * holds it exactly ('saved'); else it saves it to its own slot (never the slot being opened) or the
   * first free one, and refuses when all ten are used; 'replace' writes the slot the player chose;
   * 'exported' writes no slot. The autosave (Continue) follows every write, except when the action opens
   * the autosave itself; for the dish Continue holds it is rewritten (the same file) only to bind it to
   * the slot just written (fix round 2). The dish is paused first so everything holds one moment (one
   * file is built and written everywhere); on refusal or a failed write it resumes its prior speed and
   * nothing else changes.
   */
  private async keepDish(d: Dish | null, keep: WhatIfKeep, options: KeepOptions = WHAT_IF_KEEP): Promise<WhatIfKept> {
    if (!d) return { kind: 'none', slot: null, replaced: null, name: null, autosaved: false };
    const priorSpeed = d.speed;
    d.speed = 0;
    d.acc = 0;
    try {
      if (keep.kind === 'auto' && (await this.rebuildsExactly(d))) return { kind: 'unchanged', slot: null, replaced: null, name: d.name, autosaved: false };
      const own = this.ownSlots[d.id];
      // Its slot's record before this state is taken: the autosave below is bound to it (fix round 1).
      const ownRecord = own !== undefined && this.store ? (await this.store.slot(own))?.current : undefined;
      const savedAt = this.iso();
      const built = await this.buildFor(d, savedAt);
      if (keep.kind === 'auto' && own !== undefined && (await this.holdsExactly(own, d, built))) {
        // Unchanged since it was saved to its own slot: nothing is written (not even Continue).
        const held = await this.store!.slot(own);
        return { kind: 'saved', slot: held ? this.describeSlot(held) : null, replaced: null, name: d.name, autosaved: false };
      }
      let written: SlotInfo | null = null;
      let replaced: SlotInfo | null = null;
      if (keep.kind !== 'exported') {
        if (!this.store) throw new WhatIfRefusal('save-unavailable', `This device cannot save dishes, so ${NOT_DONE[options.action]}. Export your dish as a file first.`);
        const slots = await this.store.list();
        let slotId: string | null;
        if (keep.kind === 'replace') {
          if (!SaveStoreClass.slotIds().includes(keep.slotId)) throw new WhatIfRefusal('failed', 'That save slot does not exist. Nothing was changed.');
          if (keep.slotId === options.exclude) throw new WhatIfRefusal('failed', 'That is the save being opened, so it cannot hold this dish too. Choose another save. Nothing was changed.');
          slotId = keep.slotId;
          replaced = (own !== slotId ? slots.find((s) => s.slotId === slotId) : undefined) ?? null;
        } else {
          slotId = own !== undefined && own !== options.exclude ? own : await this.store.freeSlot();
          if (slotId === null) {
            throw new WhatIfRefusal('slots-full', `All ten save slots are used, so “${d.name}” has nowhere to go. Export it as a file or choose a save to replace. Nothing has changed.`);
          }
        }
        try {
          written = await this.writeBuilt(d, slotId, savedAt, built);
        } catch (e) {
          throw new WhatIfRefusal('save-failed', `“${d.name}” could not be saved, so ${NOT_DONE[options.action]}. Your saves are unchanged. (${e instanceof Error ? e.message : String(e)})`);
        }
        this.ownSlots[d.id] = slotId;
      }
      let autosaved = false;
      // Continue holds the very file just written (or exported), bound to the record now in its slot;
      // not when the action opens Continue itself. The dish Continue already holds is written to Continue
      // again only when a named slot was just written (fix round 2): the same file, now bound to that
      // record, so the next launch finds it saved there instead of keeping it again into another slot.
      // An export leaves Continue exactly as it was.
      const follow = options.opening !== AUTOSAVE_SLOT && (!d.transient || written !== null);
      if (this.store && follow) {
        try {
          await this.writeBuilt(d, AUTOSAVE_SLOT, savedAt, built, written?.current ?? ownRecord);
          autosaved = true;
        } catch {
          // The dish is kept in its slot or file; Continue keeps opening the previous autosave (for the
          // dish Continue holds, bindingOf still finds that slot: it holds exactly Continue's file).
        }
      }
      return {
        kind: written ? 'slot' : 'exported',
        slot: written ? this.describeSlot(written) : null,
        replaced: replaced?.name ?? null,
        ...(replaced ? { replacedTick: replaced.tick } : {}),
        name: d.name,
        autosaved,
      };
    } catch (e) {
      d.speed = priorSpeed;
      throw e;
    }
  }

  // -------------------------------------------------------------------------------------------
  // P4.7 Try my dish (SPEC §13.6; D09 lines 135-139; D-0081 "Try my dish clones, never mutates"; D-0082
  // the shelf). The baseline is a write-once shelf record of the paused dish's save; every turn is a new
  // dish cloned from that record's text by the load path under its own world id, opened paused. A turn
  // never runs past its horizon (the record in its notebook, src/persistence/notebookTurns.ts). Turns are
  // notebook state: nothing here is a command or reaches the simulation.

  /**
   * P4.7: hold a turn dish at its horizon. Brings the record's state in line with the world's tick
   * ('atHorizon' at the horizon; 'running' again below it after Undo or a rollback) and announces a change;
   * `announce`: also announce a turn already waiting at its horizon (the player asked to run or step it).
   * True when the dish must not step (it is then paused).
   */
  private turnHorizon(d: Dish, announce = false): boolean {
    if (d.arm || d.transient) return false;
    const next = turnAfterTime(d.notebook, d.world);
    if (next) d.notebook = withTurn(d.notebook, next);
    const holds = turnHoldsTime(d.notebook, d.world);
    if (holds) {
      d.speed = 0;
      d.acc = 0;
    }
    if (next || (holds && announce)) this.postTurn(d);
    return holds;
  }

  /**
   * P4.7 fix round 1: a kept turn whose world changed (a command, Undo) is no longer the dish its slot
   * holds: the record forgets the slot (the card then offers Keep this result again and never says "Kept in
   * Slot n." for a world the slot does not hold). Announced as the record only (no horizon card is raised).
   */
  private turnUnkept(d: Dish): void {
    if (d.arm || d.transient) return;
    const next = turnAfterChange(d.notebook);
    if (!next) return;
    d.notebook = withTurn(d.notebook, next);
    this.post({ type: 'tryTurn', dishId: d.id, turn: next });
  }

  /**
   * P4.7 (wave 6a integration): what a kept turn's slot holds besides the state, read before a notebook or
   * journal edit (holdsExactly compares the world file, journal included, and the notebook checksum).
   * Null when the dish is no kept turn (nothing to compare); '' when it could not be read (treated as changed).
   */
  private keptTurnMark(d: Dish): string | null {
    if (d.arm || d.transient || (turnOf(d.notebook)?.kept ?? null) === null) return null;
    try {
      return canonicalJson([d.notebook, d.world.history.journal ?? []]);
    } catch {
      return '';
    }
  }

  /** P4.7: after an accepted notebook or journal edit, a kept turn whose record or journal changed is no longer kept. */
  private turnEdited(d: Dish, mark: string | null): void {
    if (mark === null || (mark !== '' && mark === this.keptTurnMark(d))) return;
    this.turnUnkept(d);
  }

  /** P4.7: announce a turn dish's record: the horizon card at its horizon, else the record itself. */
  private postTurn(d: Dish): void {
    const t = turnOf(d.notebook);
    if (!t) return;
    if (t.state === 'atHorizon') this.post({ type: 'tryHorizon', dishId: d.id, turn: t, elapsedTicks: d.world.tick - t.startTick, goal: turnGoal(this.notebookOf(d)) });
    else this.post({ type: 'tryTurn', dishId: d.id, turn: t });
  }

  /** P4.7: why Try my dish cannot start from `d` (null: it can). */
  private tryRefusalFor(d: Dish): string | null {
    if (d.arm) return TRY_REFUSALS.arm;
    if (d.world.sample !== null) return TRY_REFUSALS.sample;
    if (d.failed) return TRY_REFUSALS.failed;
    if (!this.shelf) return TRY_REFUSALS.noStore;
    return null;
  }

  private tryRefused(requestId: number, code: TryRefusalCode, message: string): void {
    this.post({ type: 'tryRefused', requestId, code, message });
  }

  /**
   * P4.7: open turn `params.turn` cloned from the baseline: the shelf record is read and verified (its
   * stored checksum, the file's own checks, and the checksum the try recorded), then loaded as a new dish
   * (tryDish.ts cloneTurn), paused, with the try's goal started at the turn's start tick (a fresh notebook:
   * progress resets each turn). Null, with nothing changed, when the baseline is missing or changed.
   */
  private async openTurn(
    newDishId: string,
    baseline: TurnBaseline,
    params: { readonly tryId: string; readonly turn: number; readonly horizonTicks: TurnHorizonTicks; readonly objectiveId: string | null; readonly prediction: string; readonly challenge?: TurnChallenge },
  ): Promise<{ readonly dish: Dish; readonly turn: TurnRecord } | null> {
    if (!this.shelf) return null;
    const got = await this.shelf.get(baseline.shelfId, async (text, slot) => slot.shelfKind === 'baseline' && slot.checksum === baseline.checksum && (await parseSaveFile(text)).checksum === baseline.checksum);
    if (!got) return null;
    // P4.8c: a challenge turn counts its actions from the cloned world's next command sequence number.
    const c = await cloneTurn(got.text, newDishId, (turnWorldId, w) => turnRecordFor({ ...params, baseline, turnWorldId, ...(params.challenge ? { challenge: { ...params.challenge, startSeq: w.commands.nextSeq } } : {}) }));
    if (c.world.tick !== baseline.tick) return null;
    const dish = this.addDish(newDishId, c.world, c.name, c.notebook);
    if (params.objectiveId !== null) {
      const challenge = turnOf(dish.notebook)?.challenge; // P4.8c: a challenge's goal is its own definition, never a registry id
      const def = challenge ? turnChallengeDef(challenge, dish.world.content.manifest.buildPhase) : this.registry.objectives[params.objectiveId];
      const nw = this.watchOf(dish);
      if (def && nw) {
        const offered = challenge !== undefined || tryGoalOptions(this.registry, dish.world).some((o) => o.id === def.id && goalFitsTurn(o, params.horizonTicks / TICKS_PER_SECOND));
        this.notebookChanges(dish, nw.goals.start(dish.world, def, offered).changes);
      }
    }
    return { dish, turn: turnOf(dish.notebook)! };
  }

  /**
   * P4.7 Start (D09 line 136: availability and version checks before accepting the setup): the dish is not
   * a comparison copy, holds no sample, the turn length and goal fit, and the shelf has room; then the
   * baseline (the paused dish's save, built at this tick) waits while the open dish is kept first (D-0033;
   * a refusal starts nothing), goes on the shelf, and turn 1 is cloned from the record just written.
   */
  private async tryStart(msg: Extract<ToWorker, { type: 'tryStart' }>): Promise<void> {
    if (this.dishes[msg.newDishId]) return this.tryRefused(msg.requestId, 'bad-request', TRY_REFUSALS.inUse);
    const d = this.need(msg.dishId);
    const why = this.tryRefusalFor(d);
    if (why) return this.tryRefused(msg.requestId, 'not-here', why);
    const horizonTicks = horizonTicksOf(msg.horizonSeconds);
    if (horizonTicks === null) return this.tryRefused(msg.requestId, 'bad-request', TRY_REFUSALS.horizon);
    if (msg.objectiveId !== null) {
      const opt = tryGoalOptions(this.registry, d.world).find((o) => o.id === msg.objectiveId);
      if (!opt || !goalFitsTurn(opt, msg.horizonSeconds)) return this.tryRefused(msg.requestId, 'bad-request', TRY_REFUSALS.goal);
    }
    // A blocking panel: the dish is paused (the UI restores its run state when nothing starts).
    const priorSpeed = d.speed;
    d.speed = 0;
    d.acc = 0;
    const savedAt = this.iso();
    // Serialized before the first await: the baseline is this paused tick.
    const built = await buildSaveFile(d.world, { name: d.name, savedAt, recipeId: d.world.content.provenance.recipeId }, this.localSave(d));
    const shelf = this.shelf!;
    const full = await shelf.check('baseline', (await gzipText(built.text)).byteLength);
    if (full) {
      d.speed = priorSpeed;
      return this.tryRefused(msg.requestId, 'shelf', full.message);
    }
    const kept = await this.keepFirst(msg, { action: 'tryDish', exclude: null, opening: null });
    if (kept === false) return;
    const tryId = `try-${await shelf.nextSequence('baseline')}`;
    const put = await shelf.put('baseline', {
      text: built.text,
      checksum: built.checksum,
      name: built.file.meta.name,
      worldId: built.file.state.worldId,
      tick: built.file.tick,
      savedAt,
      recipeId: d.world.content.provenance.recipeId,
      createdFor: tryId,
      ...slotMetaCopies(built.file),
    });
    if (!put.ok) return this.tryRefused(msg.requestId, 'shelf', put.message);
    const baseline: TurnBaseline = { shelfId: put.slot.slotId, checksum: built.checksum, worldId: built.file.state.worldId, tick: built.file.tick, name: built.file.meta.name };
    const opened = await this.openTurn(msg.newDishId, baseline, { tryId, turn: 1, horizonTicks, objectiveId: msg.objectiveId, prediction: cleanPrediction(msg.prediction) });
    if (!opened) return this.tryRefused(msg.requestId, 'baseline-missing', TRY_REFUSALS.baselineMissing);
    this.post({ type: 'tryStarted', requestId: msg.requestId, info: this.info(opened.dish), turn: opened.turn, ...(kept ? { kept } : {}) });
    this.sendSnapshot(opened.dish);
  }

  /**
   * P4.7 Another turn (D09 line 137 "Temporary turns replace only the prior unsaved turn after an explicit
   * discard choice"): only from a turn at its horizon; an unkept turn (or one changed since it was kept) needs
   * the player's Discard. The baseline is verified first (a missing or changed one refuses and the current
   * turn stays open and unchanged); then turn n + 1 opens and the prior turn is let go WITHOUT the keep flow.
   */
  private async tryNext(msg: Extract<ToWorker, { type: 'tryNext' }>): Promise<void> {
    if (this.dishes[msg.newDishId]) return this.tryRefused(msg.requestId, 'bad-request', TRY_REFUSALS.inUse);
    const d = this.need(msg.dishId);
    if (d.arm || !turnOf(d.notebook)) return this.tryRefused(msg.requestId, 'no-turn', TRY_REFUSALS.noTurn);
    this.turnHorizon(d);
    const t = turnOf(d.notebook)!;
    if (t.state !== 'atHorizon') return this.tryRefused(msg.requestId, 'no-turn', TRY_REFUSALS.notAtHorizon);
    if (!msg.discard && !(t.kept !== null && (await this.holdsExactly(t.kept.slotId, d)))) {
      // Safety net (wave 6a integration): a record that still names a slot which no longer holds this dish
      // exactly forgets it, so the card never says "Kept in Slot n." beside "Discard this turn?".
      if (t.kept !== null) this.turnUnkept(d);
      return this.tryRefused(msg.requestId, 'unsaved', TRY_REFUSALS.unsaved);
    }
    if (!this.shelf) return this.tryRefused(msg.requestId, 'not-here', TRY_REFUSALS.noStore);
    const opened = await this.openTurn(msg.newDishId, t.baseline, { tryId: t.tryId, turn: t.turn + 1, horizonTicks: t.horizonTicks, objectiveId: t.objectiveId, prediction: t.prediction, ...(t.challenge ? { challenge: t.challenge } : {}) }); // P4.8c: Another turn plays the same challenge
    if (opened && t.challenge) opened.dish.notebook = { ...opened.dish.notebook, challenges: challengesOf(this.notebookOf(d)) }; // P4.8c: its records come along
    if (!opened) return this.tryRefused(msg.requestId, 'baseline-missing', TRY_REFUSALS.baselineMissing);
    // The prior turn goes: discarded by the player's choice, or already in its slot. Never written here.
    delete this.dishes[d.id];
    delete this.ownSlots[d.id];
    this.post({ type: 'tryStarted', requestId: msg.requestId, info: this.info(opened.dish), turn: opened.turn });
    this.sendSnapshot(opened.dish);
  }

  // -------------------------------------------------------------------------------------------
  // P4.8c custom challenges (src/worker/challenge.ts; src/persistence/notebookChallenges.ts; SPEC §13.5;
  // D-0071: the objective is only evaluated; the tool and budget limits refuse commands here, before
  // applyNow, as a comparison arm refuses them).

  /** A command a challenge turn refused: the ack carries the refusal and the UI is told (the dish is unchanged). */
  private challengeBlocked(d: Dish, requestId: number, message: string): void {
    this.post({ type: 'ack', requestId, dishId: d.id, result: null, error: message });
    this.post({ type: 'challengeBlocked', dishId: d.id, message });
  }

  private challengeRefused(requestId: number, message: string): void {
    this.post({ type: 'challengeRefused', requestId, message });
  }

  /** Why no challenge can be made or started from `d` (null: it can). */
  private challengeRefusalFor(d: Dish): string | null {
    if (d.arm) return CHALLENGE_REFUSALS.arm;
    if (d.world.sample !== null) return CHALLENGE_REFUSALS.sample;
    if (d.failed) return CHALLENGE_REFUSALS.failed;
    if (!this.shelf) return CHALLENGE_REFUSALS.noStore;
    return null;
  }

  /**
   * A shelf baseline holding exactly the challenge's baseline (its index and its file's checksum), newest first, or
   * null. `ownOnly`: only records written for a challenge (createdFor 'ch-<n>'), so a challenge never depends on a
   * Try my dish starting point the player may remove in Storage (D-0090).
   */
  private async challengeBaseline(c: Pick<ChallengeRecord, 'baseline'>, ownOnly = false): Promise<{ readonly text: string; readonly slot: SlotInfo } | null> {
    if (!this.shelf) return null;
    const held = (await this.shelf.list('baseline'))
      .filter((s) => s.checksum === c.baseline.checksum && (!ownOnly || (s.createdFor ?? '').startsWith('ch-')))
      .reverse();
    for (const s of held) {
      const got = await this.shelf.get(s.slotId, async (text, slot) => slot.shelfKind === 'baseline' && (await parseSaveFile(text)).checksum === c.baseline.checksum);
      if (got) return got;
    }
    return null;
  }

  /**
   * Save: the typed values are checked (challengeSaveProblem), the paused dish is stored as a baseline on the
   * shelf (preflight first; one atomic write), then the challenge joins the dish's notebook with the baseline's
   * world id, tick and state checksum. A refusal changes nothing.
   */
  private async challengeSave(msg: Extract<ToWorker, { type: 'challengeSave' }>): Promise<void> {
    const d = this.need(msg.dishId);
    const why = this.challengeRefusalFor(d);
    if (why) return this.challengeRefused(msg.requestId, why);
    if (challengesOf(d.notebook).length >= CHALLENGES_MAX) return this.challengeRefused(msg.requestId, CHALLENGE_REFUSALS.full(CHALLENGES_MAX));
    const problem = challengeSaveProblem(this.registry, d.world, msg.challenge);
    if (problem) return this.challengeRefused(msg.requestId, problem);
    d.speed = 0; // the editor is a blocking panel; the baseline is this paused tick
    d.acc = 0;
    const savedAt = this.iso();
    const built = await buildSaveFile(d.world, { name: d.name, savedAt, recipeId: d.world.content.provenance.recipeId }, this.localSave(d));
    const id = nextChallengeId(d.notebook);
    // Challenges made at the same paused moment share one baseline on the shelf (the same state checksum), but
    // only a challenge's own record: a Try my dish starting point can be removed in Storage (D-0090).
    const shared = await this.challengeBaseline({ baseline: { worldId: built.file.state.worldId, tick: built.file.tick, checksum: built.checksum } }, true);
    const put = shared ? ({ ok: true } as const) : await this.shelf!.put('baseline', {
      text: built.text,
      checksum: built.checksum,
      name: built.file.meta.name,
      worldId: built.file.state.worldId,
      tick: built.file.tick,
      savedAt,
      recipeId: d.world.content.provenance.recipeId,
      createdFor: id,
      ...slotMetaCopies(built.file),
    });
    if (!put.ok) return this.challengeRefused(msg.requestId, put.message);
    const input = msg.challenge; // checked above: exactly the editor's typed keys
    const challenge: ChallengeRecord = { ...input, id, baseline: { worldId: built.file.state.worldId, tick: built.file.tick, checksum: built.checksum } };
    const mark = this.keptTurnMark(d);
    d.notebook = { ...d.notebook, challenges: [...challengesOf(d.notebook), challenge] };
    this.turnEdited(d, mark); // P4.7: a notebook change on a kept turn
    this.post({ type: 'challengeSaved', requestId: msg.requestId, dishId: d.id, record: this.notebookOf(d), challenge });
  }

  /**
   * Export: the baseline save from the shelf (or, on a device without it, the open dish while its state checksum
   * still equals the baseline's) with a notebook holding only this challenge. Read-only.
   */
  private async challengeExport(msg: Extract<ToWorker, { type: 'challengeExport' }>): Promise<void> {
    const d = this.need(msg.dishId);
    const c = challengesOf(this.notebookOf(d)).find((x) => x.id === msg.challengeId);
    if (!c) return this.challengeRefused(msg.requestId, CHALLENGE_REFUSALS.unknown);
    let text = (await this.challengeBaseline(c))?.text ?? null;
    if (text === null && !d.arm) {
      const built = await buildSaveFile(d.world, { name: d.name, savedAt: this.iso(), recipeId: d.world.content.provenance.recipeId }, this.localSave(d));
      if (built.checksum === c.baseline.checksum) text = built.text;
    }
    if (text === null) return this.challengeRefused(msg.requestId, CHALLENGE_REFUSALS.noBaseline);
    this.post({ type: 'challengeExported', requestId: msg.requestId, text: await challengeExportText(text, c), filename: challengeFileName(c.name) });
  }

  /**
   * Start: a Try my dish turn from the challenge's baseline with its objective, horizon and limits. The
   * baseline is the shelf record holding it, else the open dish while its state checksum still equals the
   * baseline's (an imported challenge file), stored on the shelf after the open dish is kept first (D-0033).
   */
  private async challengeStart(msg: Extract<ToWorker, { type: 'challengeStart' }>): Promise<void> {
    if (!msg.check && this.dishes[msg.newDishId]) return this.challengeRefused(msg.requestId, CHALLENGE_REFUSALS.inUse);
    const d = this.need(msg.dishId);
    const answer = (refusal: string | null): void => {
      if (msg.check) this.post({ type: 'challengeChecked', requestId: msg.requestId, dishId: d.id, refusal });
      else if (refusal !== null) this.challengeRefused(msg.requestId, refusal);
    };
    const why = this.challengeRefusalFor(d);
    if (why) return answer(why);
    const c = challengesOf(this.notebookOf(d)).find((x) => x.id === msg.challengeId);
    if (!c) return answer(CHALLENGE_REFUSALS.unknown);
    const support = objectiveSupportProblem(d.world, challengePredicate(c));
    if (support !== null) return answer(CHALLENGE_REFUSALS.cannotRun(support));
    const horizonTicks = horizonTicksOf(c.horizonSeconds)!;
    const shelf = this.shelf!;
    const found = await this.challengeBaseline(c);
    let built: Awaited<ReturnType<typeof buildSaveFile>> | null = null;
    const savedAt = this.iso();
    if (!found) {
      built = await buildSaveFile(d.world, { name: d.name, savedAt, recipeId: d.world.content.provenance.recipeId }, this.localSave(d));
      if (built.checksum !== c.baseline.checksum) return answer(CHALLENGE_REFUSALS.changed);
      const full = await shelf.check('baseline', (await gzipText(built.text)).byteLength);
      if (full) return answer(full.message);
    }
    if (msg.check) return answer(null);
    const kept = await this.keepFirst(msg, { action: 'tryDish', exclude: null, opening: null });
    if (kept === false) return;
    let slot = found?.slot ?? null;
    if (!slot && built) {
      const put = await shelf.put('baseline', {
        text: built.text,
        checksum: built.checksum,
        name: built.file.meta.name,
        worldId: built.file.state.worldId,
        tick: built.file.tick,
        savedAt,
        recipeId: d.world.content.provenance.recipeId,
        createdFor: c.id,
        ...slotMetaCopies(built.file),
      });
      if (!put.ok) return this.challengeRefused(msg.requestId, put.message);
      slot = put.slot;
    } else if (found && !(found.slot.createdFor ?? '').startsWith('ch-')) {
      // D-0090: only a Try my dish record holds this moment (a save from before D-0090, or the challenge's own
      // record was removed in Storage). Store the challenge's own copy when the shelf has room, so removing that
      // Try my dish row later cannot take the challenge's starting point; without room, start from it as before.
      const room = (await shelf.check('baseline', (await gzipText(found.text)).byteLength)) === null;
      const own = room
        ? await shelf.put('baseline', {
            text: found.text,
            checksum: found.slot.checksum,
            name: found.slot.name,
            worldId: found.slot.worldId ?? c.baseline.worldId,
            tick: found.slot.tick,
            savedAt: found.slot.savedAt,
            recipeId: found.slot.recipeId,
            createdFor: c.id,
            ...(found.slot.evolution ? { evolution: found.slot.evolution } : {}),
            ...(found.slot.registry ? { registry: found.slot.registry } : {}),
          })
        : null;
      if (own?.ok) slot = own.slot;
    }
    if (!slot) return this.challengeRefused(msg.requestId, TRY_REFUSALS.baselineMissing);
    const baseline: TurnBaseline = { shelfId: slot.slotId, checksum: c.baseline.checksum, worldId: slot.worldId ?? c.baseline.worldId, tick: slot.tick, name: slot.name };
    const opened = await this.openTurn(msg.newDishId, baseline, {
      tryId: `try-${Math.max(1, shelfSequenceOf(slot.slotId))}`,
      turn: 1,
      horizonTicks,
      objectiveId: challengeObjectiveId(c.id),
      prediction: '',
      challenge: turnChallengeOf(c, 0),
    });
    if (!opened) return this.challengeRefused(msg.requestId, TRY_REFUSALS.baselineMissing);
    // The turn dish holds the challenge record too (Start again and Export work from it; a copy never takes it).
    opened.dish.notebook = { ...opened.dish.notebook, challenges: [c] };
    this.post({ type: 'challengeStarted', requestId: msg.requestId, info: this.info(opened.dish), turn: opened.turn, ...(kept ? { kept } : {}) });
    this.sendSnapshot(opened.dish);
  }

  // ── P4.8b: bookmarks, the specimen gallery and storage (notebook state and the store; never a command) ──

  /**
   * P4.8b Bookmark this moment (with `snapshot`: the dish's full save at this tick goes on the shelf, kind
   * 'snapshot', BEFORE the bookmark is added; a refused or failed write adds nothing), or an event row (text
   * only). The world is only read. Answered by 'notebook' (`refused`: nothing was added).
   */
  private async bookmarkAdd(msg: Extract<ToWorker, { type: 'bookmarkAdd' }>): Promise<void> {
    const d = this.need(msg.dishId);
    const refuse = (refused: string): void => this.post({ type: 'notebook', requestId: msg.requestId, dishId: d.id, record: this.notebookOf(d), refused });
    if (d.arm || d.transient) return refuse(BOOKMARK_TEXT.arm);
    if (bookmarksOf(d.notebook).length >= BOOKMARKS_MAX) return refuse(BOOKMARK_TEXT.full);
    if (msg.snapshot && msg.event) return refuse('Past moments have no stored state, so an event bookmark is text only. Nothing was added.');
    if (msg.snapshot && !this.shelf) return refuse(BOOKMARK_TEXT.noStore);
    // Read with no await in between: the words, the moment and (below) the save are the same tick.
    const createdTick = d.world.tick;
    const at = msg.event ? eventBookmark(d.world, msg.event) : { tick: createdTick, eventId: null, summary: momentSummary(d.world) };
    if (!at || at.tick > createdTick) return refuse('That event is not in this dish’s record. Nothing was added.');
    const title = cleanBookmarkTitle(msg.title) ?? cleanBookmarkTitle(`${d.name} at ${bookmarkClock(at.tick)}`)!;
    let snapshot: Bookmark['snapshot'] = null;
    if (msg.snapshot) {
      const shelf = this.shelf!;
      const savedAt = this.iso();
      const id = nextBookmarkId(bookmarksOf(d.notebook));
      // buildSaveFile serializes the world before its first await: the snapshot holds exactly this tick.
      const built = await buildSaveFile(d.world, { name: d.name, savedAt, recipeId: d.world.content.provenance.recipeId }, this.localSave(d));
      const put = await shelf.put('snapshot', {
        text: built.text,
        checksum: built.checksum,
        name: title,
        worldId: built.file.state.worldId,
        tick: built.file.tick,
        savedAt,
        recipeId: d.world.content.provenance.recipeId,
        createdFor: id,
        ...slotMetaCopies(built.file),
      });
      if (!put.ok) {
        const detail = /\(([^)]*)\)/u.exec(put.message)?.[1] ?? put.message;
        return refuse(put.reason === 'full' ? BOOKMARK_TEXT.snapshotsFull : put.reason === 'storage-full' ? BOOKMARK_TEXT.storageFull(detail) : BOOKMARK_TEXT.writeFailed(detail));
      }
      // The dish closed, or its bookmarks filled, while the snapshot was written: that record is taken back.
      if (this.dishes[d.id] !== d || bookmarksOf(d.notebook).length >= BOOKMARKS_MAX) {
        await shelf.remove(put.slot.slotId);
        return refuse(this.dishes[d.id] !== d ? BOOKMARK_TEXT.closed : BOOKMARK_TEXT.full);
      }
      snapshot = { shelfId: put.slot.slotId, checksum: built.checksum, bytes: put.slot.bytes };
    }
    const mark = this.keptTurnMark(d);
    const list = bookmarksOf(d.notebook);
    const bm: Bookmark = { id: nextBookmarkId(list), tick: at.tick, title, summary: at.summary, eventId: at.eventId, snapshot, createdTick };
    d.notebook = { ...d.notebook, bookmarks: [...list, bm] };
    this.turnEdited(d, mark); // P4.7: a bookmark on a kept turn is a change its slot does not hold
    this.post({ type: 'notebook', requestId: msg.requestId, dishId: d.id, record: this.notebookOf(d) });
  }

  /**
   * P4.8b: open a snapshot bookmark as a NEW branch exactly as a checkpoint opens (branchWorldId, branchName,
   * favorites only; D-0031), the open dish kept first (D-0033). The shelf record is read and verified first (its
   * stored checksum, the file's own checks, and the checksum the bookmark recorded): a missing or changed one
   * answers 'bookmarkGone' and nothing changes.
   */
  private async bookmarkOpen(msg: Extract<ToWorker, { type: 'bookmarkOpen' }>): Promise<void> {
    const d = this.need(msg.dishId);
    if (this.dishes[msg.newDishId]) throw new Error('That new dish id is already in use.');
    const bm = bookmarksOf(d.notebook).find((b) => b.id === msg.id);
    if (!bm) throw new Error(BOOKMARK_TEXT.unknown);
    const ref = bm.snapshot;
    if (!ref) return this.post({ type: 'bookmarkGone', requestId: msg.requestId, id: bm.id, message: BOOKMARK_TEXT.notOpenable });
    const got = this.shelf ? await this.shelf.get(ref.shelfId, async (text, slot) => slot.shelfKind === 'snapshot' && slot.checksum === ref.checksum && (await loadSaveFile(text)).file.checksum === ref.checksum) : null;
    if (!got) return this.post({ type: 'bookmarkGone', requestId: msg.requestId, id: bm.id, message: BOOKMARK_TEXT.gone });
    const { file, world, notebook, notebookDropped } = await loadSaveFile(got.text);
    const branch = { fromName: file.meta.name, tick: world.tick };
    const opened = deserializeWorld({ ...file.state, worldId: branchWorldId(world.worldId, msg.newDishId) });
    const kept = await this.keepFirst(msg, { action: 'bookmark', exclude: null, opening: null });
    if (kept === false) return;
    const dish = this.addDish(msg.newDishId, opened, branchName(file.meta.name, branch.tick), favoritesOnly(notebook, opened.worldId));
    this.post({ type: 'loaded', requestId: msg.requestId, info: this.info(dish), usedPredecessor: false, branch, ...(kept ? { kept } : {}), ...(notebookDropped !== null ? { notebookDropped } : {}) });
    this.sendSnapshot(dish);
    this.experimentReopened(dish);
  }

  /** P4.8b: the storage panel's read, or one checkpoint / shelf record removed on the player's confirmed choice. */
  private async storageRequest(msg: Extract<ToWorker, { type: 'storageInfo' | 'storageRemove' }>): Promise<void> {
    if (!this.store) throw new Error('Saving is unavailable on this device.');
    let removed: boolean | undefined;
    if (msg.type === 'storageRemove') {
      // Never a named slot or the autosave (D02 line 657: named dish saves are never evicted from here).
      if (!storageRemovable(msg.slotId)) throw new Error('Saved dishes are deleted only with their own Delete… in Saved dishes; Storage never removes them. Nothing was changed.');
      if (isShelfSlot(msg.slotId)) removed = this.shelf ? await this.shelf.remove(msg.slotId) : false;
      else {
        removed = (await this.store.backend.getSlot(msg.slotId)) !== null;
        await this.store.remove(msg.slotId);
        if (this.ring) this.ringKept = (await this.ring.list()).length;
      }
    }
    this.post({ type: 'storageInfo', requestId: msg.requestId, storage: await readStorage(this.store.backend, this.storageEstimate), ...(removed !== undefined ? { removed } : {}) });
  }

  /** P4.8b: delete one bookmark (its snapshot stays on the shelf until removed in Storage). The refusal, or null. */
  private bookmarkDeleted(d: Dish, id: string): string | null {
    const list = bookmarksOf(d.notebook);
    if (!list.some((b) => b.id === id)) return BOOKMARK_TEXT.unknown;
    d.notebook = { ...d.notebook, bookmarks: list.filter((b) => b.id !== id) };
    return null;
  }

  /** P4.8b: delete one gallery entry. The refusal, or null. */
  private galleryDeleted(d: Dish, id: string): string | null {
    const list = galleryOf(d.notebook);
    if (!list.some((e) => e.id === id)) return GALLERY_TEXT.unknown;
    d.notebook = { ...d.notebook, gallery: list.filter((e) => e.id !== id) };
    return null;
  }

  /**
   * P4.8b: keep a specimen the UI composed from its latest snapshot copy and the inspector lines on screen.
   * Only checked here (its own fields; a species this dish has; an organism it has had); never spawns, never a
   * command. The refusal, or null.
   */
  private galleryAdded(d: Dish, input: Omit<GalleryEntry, 'id'>): string | null {
    const list = galleryOf(d.notebook);
    if (list.length >= GALLERY_MAX) return GALLERY_TEXT.full;
    const entry = { ...(typeof input === 'object' && input !== null ? input : {}), id: nextGalleryId(list) } as GalleryEntry;
    const problem = galleryEntryProblem(entry);
    if (problem) return GALLERY_TEXT.bad(problem);
    const species = d.world.species.map((s) => s.id);
    if (!species.includes(entry.speciesId) || entry.crop.sprites.some(([sp]) => sp >= species.length)) return GALLERY_TEXT.bad('a species this dish does not have');
    if (entry.birthId >= d.world.counters.nextBirthId || entry.tick > d.world.tick) return GALLERY_TEXT.bad('an organism or a time this dish has not had');
    d.notebook = { ...d.notebook, gallery: [...list, entry] };
    return null;
  }

  private info(d: Dish): DishInfo {
    const w = d.world;
    const m = w.content.manifest;
    return {
      dishId: d.id,
      worldId: w.worldId,
      name: d.name,
      seed: w.seed,
      tick: w.tick,
      speciesIds: w.species.map((s) => s.id),
      speciesNames: w.species.map((s) => s.def.name),
      speciesAssets: w.species.map((s) => s.def.assetId),
      materials: w.content.materials.map((mat) => ({ id: mat.id, name: mat.name, target: mat.target, doses: mat.doses, kind: mat.kind })),
      mutationPreset: w.settings.mutationPreset,
      founderMode: w.settings.founderMode,
      recipeId: w.content.provenance.recipeId,
      contentHash: m.contentHash,
      manifestLabel: registryLabel(m, this.catalogSize()),
      // Lab trays (P2.7): recorded content the item details quote (read-only).
      speciesHabitats: w.species.map((s) => [...s.def.habitats]),
      speciesAttachment: w.species.map((s) => (s.def.attachment ? [...s.def.attachment.surfaces] : null)),
      speciesSummaries: w.species.map((s) => s.def.guide.summary),
      speciesCategories: w.species.map((s) => s.def.category), // P3.10: no division cue for bacterial births
      // Diets for Add Life and the Life tray (W2-13): the world's own records; film only with its system.
      speciesDiets: w.species.map((s) => ({
        metabolism: s.def.metabolism,
        foods: s.def.foodPriority.filter((f) => f !== 'film'),
        prey: s.def.prey.map((p) => ({ id: p.id, requires: p.requires })),
        hosts: [...s.def.hostIds],
        digestsFilm: s.def.digestsFilm && worldHasSystem(w, 'film'),
      })),
      materialSummaries: w.content.materials.map((mat) => mat.guide.summary),
      fieldIds: allocatedFieldIds(w.fields),
      // The world's own manifest decides which structure tools its Lab offers (D-0024), never this build's.
      structureIds: [...(m.enabledStructures ?? [])],
      ...this.whatIfInfo(w),
      registry: this.registryInfo(w.content.manifest, w.content.modules),
      // P4.7: a Try my dish turn's record (its notebook's), so the UI can show the turn badge after any open.
      ...(!d.arm && turnOf(d.notebook) ? { turn: turnOf(d.notebook)! } : {}),
      // Protocol 3: the world's own systems (per-dish gating, D-0111) and each species' free transport class.
      systems: [...m.enabledSystems],
      speciesFreeClass: speciesFreeClasses(w),
      // Wave 14 (region pins, D-0128): the regions of the world's OWN recorded habitat, never this build's registry
      // (an old dish never gains pins from a later content edit); absent when it records none (every v1.0 dish).
      ...(w.content.habitat.regions && w.content.habitat.regions.length > 0
        ? {
            regions: w.content.habitat.regions.map((r: HabitatRegion, k) => ({ id: r.id, label: r.label, number: k + 1, anchor: [r.anchor[0], r.anchor[1]] as const })),
          }
        : {}),
    };
  }

  /** A slot as the Saved dishes list and Continue show it, with its mode labels when recorded (P2.2). */
  /** How many modules this build's catalog holds (a world with fewer enabled is a partial registry). */
  private catalogSize(): number {
    return Object.keys(this.registry.modules).length;
  }

  private describeSlot(s: SlotInfo): SlotSummary {
    const modes = slotModes(s, this.catalogSize());
    return { ...summary(s), ...(modes ? { modes } : {}) };
  }

  /**
   * P2.2: a world's recorded module registry (never this build's content), with the build's catalog
   * size so a partial registry is described as "Core prototype — quantitative evolution" (UX §3.3).
   */
  private registryInfo(m: World['content']['manifest'], modules: World['content']['modules']): RegistryInfo {
    const catalogSize = Object.keys(this.registry.modules).length;
    return {
      moduleRegistryVersion: m.moduleRegistryVersion,
      evolutionRulesVersion: m.evolutionRulesVersion,
      modules: modules.map((d) => ({ id: d.id, name: d.name })),
      catalogSize,
      partial: m.enabledModules.length < catalogSize,
      systems: [...m.enabledSystems],
    };
  }

  /** New Dish summary (P2.2, UX §2.3): the world `create` would build with these choices, summarized. */
  private newDishPreview(msg: Extract<ToWorker, { type: 'newDishPreview' }>): NewDishPreview {
    const recipe = this.registry.recipes[msg.recipeId];
    if (!recipe) throw new Error(`There is no recipe "${msg.recipeId}" in this version of Pixelmeba.`);
    const w = this.build({ kind: 'recipe', recipeId: msg.recipeId, seed: msg.seed, overrides: msg.overrides }, 'new-dish-preview');
    const names: Record<string, string> = {};
    for (const d of w.content.modules) names[d.id] = d.name;
    const total = computeTotals(w);
    const L = w.ledger;
    // The recipe as realized, the New Dish choices applied (P5.4: the preview used the untransformed recipe
    // until wave 14; for every v1.0 start the two give the same grid and patches).
    const realized = applyRecipeOverrides(recipe, msg.overrides);
    // The grid realizeRecipe() paints: habitat, stone removal and the recipe's own ops (P3.9; Borrowed Shelter's gel disk).
    const layout = recipeGrid(w.content.habitat, realized);
    const uses = this.habitatUsesOf(w);
    const regions = (w.content.habitat.regions ?? []).map((r, k) => ({ id: r.id, label: r.label, number: k + 1 }));
    const community = realized.community === true;
    const communityPatches = community ? (w.content.habitat.suggestedCommunity?.patches ?? []).map((p, k) => p.label ?? `Community patch ${k + 1}`) : [];
    return {
      recipeId: recipe.id,
      recipeName: recipe.name,
      habitat: {
        name: w.content.habitat.name,
        summary: w.content.habitat.guide.summary,
        rules: w.content.habitat.guide.rules,
        // P3.2: the layout the dish starts with (recipe stone removal and ops included), for the preview map.
        grid: { substrate: layout.substrate, structure: layout.structure },
        // P5.4: what the habitat places and its regions (absent when none: every v1.0 start).
        ...(uses.length > 0 ? { uses } : {}),
        ...(regions.length > 0 ? { regions } : {}),
      },
      seed: w.seed,
      mutationPreset: w.settings.mutationPreset,
      founderMode: w.settings.founderMode,
      empty: msg.overrides.empty === true,
      rates: ratesFor(w.settings.mutationPreset, w.content.manifest.developmentalEnabled),
      developmentalEnabled: w.content.manifest.developmentalEnabled,
      founders: founderSummary(w).map((r) => ({
        speciesId: w.species[r.species]!.id,
        name: w.species[r.species]!.def.name,
        count: r.count,
        eligible: r.eligible,
        withModule: r.withModule,
        modules: r.modules.map((x) => ({ id: x.id, name: names[x.id] ?? x.id, count: x.count })),
      })),
      patches: [...realized.fieldPatches.map((p, k) => p.label ?? `Patch ${k + 1}`), ...communityPatches],
      ledger: {
        habitat: { ...L.initial },
        added: { ...L.inputs },
        total: { c: total.c, n: total.n, m: total.m },
      },
      registry: this.registryInfo(w.content.manifest, w.content.modules),
      // P4.3: the Play shelf's live-state picture of this start (the same world the dish would start as).
      thumb: dishThumb(w),
      // Protocol 3: the start's environment (overrides, else the recipe's, else the habitat's) and whether it records climate.
      environment: { lid: w.settings.lid, lightMode: w.settings.lightMode, drying: w.settings.drying },
      climate: worldHasSystem(w, 'climate'),
      // P5.4: the Suggested Community as placed (absent without one).
      ...(community ? { community: true, communityGroups: this.communityGroupsOf(w) } : {}),
    };
  }

  /**
   * P5.4 (wave 14): what a realized start's habitat places, for New Dish: edges by kind, then devices and
   * furnishings by kind, then food objects by material, each group sorted by id, counted in the world at
   * tick 0; names from the structure records and the world's materials.
   */
  private habitatUsesOf(w: World): { id: string; name: string; count: number }[] {
    const tally = (ids: readonly string[]): [string, number][] => {
      const counts: Record<string, number> = {};
      for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
      return Object.keys(counts)
        .sort()
        .map((id) => [id, counts[id]!]);
    };
    const structure = (id: string) => this.registry.structures[id]?.name ?? id;
    const objectMaterial = (kind: string) => w.content.materials.find((m) => m.kind === 'object' && m.target === kind);
    return [
      ...tally(w.edges.map((e) => e.kind)).map(([id, count]) => ({ id, name: structure(id), count })),
      ...tally(w.devices.map((d) => d.kind)).map(([id, count]) => ({ id, name: structure(id), count })),
      ...tally(w.objects.map((o) => objectMaterial(o.kind)?.id ?? o.kind)).map(([id, count]) => ({ id, name: w.content.materials.find((m) => m.id === id)?.name ?? id, count })),
    ];
  }

  /**
   * P5.4: the Suggested Community's groups in record order with the number of each species actually placed
   * (the start is empty, so every founder of a group's species is the community's; a species named by two
   * groups is shared out in group order) and the region labels.
   */
  private communityGroupsOf(w: World): { speciesId: string; name: string; count: number; regionLabel: string }[] {
    const h = w.content.habitat;
    const placed: Record<string, number> = {};
    for (const r of founderSummary(w)) placed[w.species[r.species]!.id] = r.count;
    return (h.suggestedCommunity?.groups ?? []).map((g) => {
      const count = Math.min(g.count, placed[g.species] ?? 0);
      placed[g.species] = (placed[g.species] ?? 0) - count;
      const sp = w.content.species.find((d) => d.id === g.species);
      return { speciesId: g.species, name: sp?.name ?? g.species, count, regionLabel: h.regions?.find((r) => r.id === g.region)?.label ?? g.region };
    });
  }

  /** Advance the active dish according to wall-clock time. Call frequently (≈ every 16 ms). */
  /**
   * P3.5 (D-0037): while the dish holds a sample, refuse a request that would change it or run time,
   * before anything is applied (no command sequence number is taken). Posts the refusal: an `ack` with
   * the error for a command (so its promise resolves), and an `error` notice the UI shows. True when refused.
   */
  private refuseWhileHeld(d: Dish, request: ToWorker['type'], commandRequestId?: number, requestId?: number): boolean {
    if (d.world.sample === null) return false;
    if (commandRequestId !== undefined) this.post({ type: 'ack', requestId: commandRequestId, dishId: d.id, result: null, error: SAMPLE_HELD_REFUSAL });
    this.post({ type: 'error', dishId: d.id, ...(requestId !== undefined ? { requestId } : {}), message: SAMPLE_HELD_REFUSAL, lastValidTick: d.world.tick, paused: false, request });
    if (d.speed !== 0) d.speed = 0;
    this.sendSnapshot(d);
    return true;
  }

  /**
   * P3.5 Cancel (D-0037): the exact inverse of the take (sample.ts cancelSample, which also drops the
   * take from the command log and returns nextSeq), then the host's command state as Undo leaves it: a
   * fresh rollback checkpoint, no replay and no undo slot.
   */
  private cancelHeldSample(d: Dish): void {
    cancelSample(d.world);
    d.checkpoint = serializeWorld(d.world);
    d.replay = [];
    d.undo = null;
    d.undoLabels = [];
    d.speed = 0;
    d.acc = 0;
    d.sampleBeginHash = null;
    d.lastEventId = d.world.counters.nextEventId - 1;
    // P4.1 fix round 1: the members back from the sample are in place again (read-only, as after a command).
    if (d.notebookWatch) this.notebookChanges(d, d.notebookWatch.afterTick(d.world));
  }

  private checkpoint(d: Dish): void {
    d.checkpoint = serializeWorld(d.world);
    d.replay = [];
  }

  /**
   * Restore the dish to its state at `tick` (ARCH §7: an error preserves the last valid state): the
   * last checkpoint, plus the commands applied since, re-run deterministically. If the replay itself
   * fails, the checkpoint alone is kept.
   */
  private rollback(d: Dish, tick: number): void {
    this.notebookOf(d); // P4.1: kept like the journal; the watch rebuilds against the restored world
    let w = deserializeWorld(d.checkpoint);
    try {
      let k = 0;
      for (;;) {
        while (k < d.replay.length && d.replay[k]!.tick === w.tick) {
          const r = d.replay[k++]!;
          applyNow(w, r.commandId, r.payload);
        }
        if (w.tick >= tick) break;
        step(w);
      }
    } catch {
      w = deserializeWorld(d.checkpoint);
      d.replay = [];
    }
    // P2.8: journal entries written since the checkpoint are the player's notes: keep them.
    w.history.journal = d.world.history.journal;
    d.world = w;
    d.lastEventId = Math.min(d.lastEventId, w.counters.nextEventId - 1);
    d.lastGeometryVersion = -1;
    this.restoreNotebook(d, 'rollback'); // P4.1 fix round 1: the kept notebook checked against the restored dish
    if (!d.arm) this.turnHorizon(d); // P4.7: the turn's state follows the restored tick
  }

  pump(): void {
    const now = this.clock.now();
    const elapsed = Math.min(250, now - this.lastPump);
    this.lastPump = now;
    this.pumpComparison(elapsed, now);
    const d = this.active ? this.dishes[this.active] : undefined;
    if (!d) return;
    let ran = 0;
    if (d.speed > 0 && d.world.sample !== null) d.speed = 0; // P3.5: a held sample keeps time paused
    if (d.speed > 0 && !d.failed) {
      d.acc += (elapsed / 1000) * 10 * d.speed;
      if (d.acc > MAX_BACKLOG_TICKS) d.acc = MAX_BACKLOG_TICKS;
      const start = this.clock.now();
      while (d.acc >= 1) {
        if (this.turnHorizon(d)) break; // P4.7: a turn never runs past its horizon
        if (d.world.tick - d.checkpoint.tick >= CHECKPOINT_TICKS) this.checkpoint(d);
        const t0 = d.world.tick;
        const p0 = this.diagnostics ? performance.now() : 0; // P4.13: timed only while diagnostics are on
        this.relMs = 0;
        try {
          this.stepDish(d);
          if (this.diagnostics) this.perf.recordTick(performance.now() - p0, this.relMs);
        } catch (e) {
          d.speed = 0;
          d.failed = true;
          this.endExperiment(d, 'failed');
          this.rollback(d, t0);
          this.post({ type: 'error', dishId: d.id, message: e instanceof Error ? e.message : String(e), lastValidTick: d.world.tick, paused: true });
          break;
        }
        d.acc -= 1;
        ran++;
        if (this.turnHorizon(d)) break; // P4.7: reaching the horizon pauses the turn at once
        if (this.clock.now() - start > MAX_PUMP_MS) {
          d.acc = Math.min(d.acc, 1); // drop backlog: we are behind real time
          break;
        }
      }
    }
    d.ticksWindow.push(now, ran);
    while (d.ticksWindow.length > 0 && now - d.ticksWindow[0]! > 2000) d.ticksWindow.splice(0, 2);
    let ticks = 0;
    for (let k = 1; k < d.ticksWindow.length; k += 2) ticks += d.ticksWindow[k]!;
    const span = Math.max(250, now - (d.ticksWindow[0] ?? now));
    d.effectiveSpeed = d.speed === 0 ? 0 : ticks / (span / 1000) / 10;
    if (now - this.lastSnapshot >= SNAPSHOT_INTERVAL_MS) this.sendSnapshot(d);
  }

  sendSnapshot(d: Dish): void {
    const p0 = this.diagnostics ? performance.now() : 0; // P4.13: timed only while diagnostics are on
    const w = d.world;
    this.lastSnapshot = this.clock.now();
    const packed = packEntities(w, null, null);
    const deposits = packDeposits(w, null);
    // Protocol 2: adhesion links and food objects, read from authoritative state only.
    const links = packLinks(w);
    const objects = packObjects(w);
    const overlay = d.overlay ? packOverlay(w, d.overlay, null, d.selection) : null;
    const events = visualEvents(w.events.ring, d.lastEventId, w.content.modules, lociOfBirth(w));
    const lv = d.lineageView;
    const lineage: LineageMarks | null = lv ? { locus: lv.locus, branch: lv.branch, ...packLineageMarks(w, lv.locus, lv.branch) } : null;
    // P4.1: the followed families' marks, from the watch and entity columns only (none for an arm).
    const nw = d.notebookWatch || d.notebook.favorites.some((f) => f.active) ? this.watchOf(d) : null;
    const favMarks = nw ? nw.favorites.marks(w) : null;
    const favorites: FavoriteMarks | null = favMarks ? withPatterns(favMarks, d.notebook) : null;
    d.lastEventId = w.counters.nextEventId - 1;
    let geometry: SnapshotMsg['geometry'] = null;
    if (d.lastGeometryVersion !== w.grid.geometryVersion) {
      // Protocol 3: with the edge barriers and devices (snapshot.ts packGeometry), only when the geometry moved.
      geometry = packGeometry(w);
      d.lastGeometryVersion = w.grid.geometryVersion;
    }
    // Protocol 3: resin saturation (bound changes in stage 2 without a geometry bump) and the climate settings, per snapshot.
    const resins = packResins(w);
    const environment = packEnvironment(w);
    const msg: SnapshotMsg = {
      type: 'snapshot',
      dishId: d.id,
      gen: ++d.gen,
      tick: w.tick,
      speed: d.speed,
      effectiveSpeed: d.effectiveSpeed,
      count: packed.count,
      ents: packed.ents,
      ids: packed.ids,
      deposits,
      links,
      objects,
      overlay: overlay && d.overlay ? { id: d.overlay, data: overlay.data, max: overlay.max } : null,
      geometry,
      events,
      selection: d.selection ? buildInspector(w, d.selection) : null,
      capacityReached: w.ents.count >= w.ents.capacity,
      speciesCounts: packed.speciesCounts,
      undoAvailable: d.undo !== null,
      branchCount: w.branches.branches.length,
      ...(lineage ? { lineage } : {}),
      // P2.2: with the founders the dish was made with, so the Evolution sheet can say what they carried.
      evolution: { ...evolutionState(w), creation: creationFounders(w) },
      // P3.1: the lid setting now in effect (the Habitat tray's lid toggle shows it).
      lid: w.settings.lid,
      // P3.5: the held sample (the UI offers Transfer, Cancel and Discard while it is held).
      sample: heldSummary(w),
      ...(favorites ? { favorites } : {}),
      // P4.13: the worker's timings while diagnostics are on (the snapshot time is the previous one's).
      ...(this.diagnostics ? { perf: this.perf.sample() } : {}),
      ...(resins ? { resins } : {}),
      ...(environment ? { environment } : {}),
    };
    const transfer: Transferable[] = [packed.ents.buffer, packed.ids.buffer, deposits.buffer, links.buffer];
    if (overlay) transfer.push(overlay.data.buffer);
    if (lineage) transfer.push(lineage.marks.buffer as ArrayBuffer);
    if (favorites) transfer.push(favorites.marks.buffer as ArrayBuffer, favorites.member.buffer as ArrayBuffer);
    if (geometry) transfer.push(geometry.substrate.buffer, geometry.structure.buffer, geometry.shade.buffer);
    if (geometry?.edges) transfer.push(geometry.edges.r.buffer as ArrayBuffer, geometry.edges.d.buffer as ArrayBuffer);
    this.post(msg, transfer);
    if (this.diagnostics) this.perf.recordSnapshot(performance.now() - p0);
  }
}
