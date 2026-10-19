/**
 * Worker protocol (ARCH §7–§8), versioned. The worker owns every world; the main thread only ever
 * holds snapshots. Commands carry a stable commandId; the worker stamps targetTick and seq.
 */
import type { CommandPayload, CommandResult } from '@sim/commands';
import type { WorldState } from '@sim/serialize';
import type { FieldId } from '@sim/fields';
import type { CompareSpeed, ComparisonState } from './comparison';
import type { LineageAnswer } from '@sim/lineage';
import type { VariantErrorCode, VariantPreview, VariantRecord } from '@sim/variants';
import type { ExperimentCardView, JournalStamp, PlayerStep, TestOverrideView } from '@sim/experiments';
import type { SaveMetaVariant } from '@persist/saveFile';
import type { DishJournalEntry, RegionalTraitSeries } from '@sim/history';
import type { FounderOrigin } from '@sim/founders';
import type { EvolutionState, MutationRates } from '@sim/mutation';
import type { MissingMember, SampleHeldSummary } from '@sim/sample';
import type { SampleMode } from '@sim/sampleSlot';
import type { FavoritePattern, NotebookRecord } from '@persist/notebook';
import type { GoalRecord, GoalState } from '@persist/notebookGoals';
import type { TurnRecord } from '@persist/notebookTurns';
import type { ChallengeInput, ChallengeRecord, ChallengeToolGroup } from '@persist/notebookChallenges';
import type { SuccessionEntry } from '@persist/notebookSuccession';
import type { GalleryEntry } from '@persist/notebookGallery';
import type { StorageInfo } from './storage';
import type { MapWindow, RelationshipMapData } from './relationshipMap';
import type { ProbeMask, ProbeReadings } from './probes';

/**
 * 2 since Phase 3 wave 2 (D-0036): ENT_STRIDE 12 → 14 (E_CUE2, E_LINKMASK), seven deposit bands (film),
 * SnapshotMsg.links and .objects, VisualEvent 'objectEmptied'.
 * 3 since Phase 5 wave 11 (D-0102, D-0107, D-0119; the one Phase 5 bump): ENT_STRIDE 14 → 15 (E_CUE3), eight
 * deposit bands (grit, DEPOSIT_GRIT_BAND), GeometryMsg.edges and .devices, SnapshotMsg.resins and
 * .environment, the optional CellInspect climate, lightFactors, edges and device lines, DishInfo.systems
 * and .speciesFreeClass, RecipeOverrides lid / lightMode / drying, NewDishPreview environment and climate,
 * and the 'warmth' and 'moisture' overlays. A v1.0 dish packs exactly as under protocol 2 (E_CUE3 0, the
 * grit band 0, no new keys; tests/worker/protocol3-v1-equivalence.test.ts).
 */
export const PROTOCOL_VERSION = 3;

/** Every packet in both directions carries the protocol version (ARCH §7). */
export interface Envelope {
  readonly protocolVersion: number;
}

export function stamp<T extends object>(msg: T): T & Envelope {
  return { ...msg, protocolVersion: PROTOCOL_VERSION };
}

export type Speed = 0 | 1 | 2 | 4;

/**
 * Overlays the renderer can request (one at a time). 'light' and 'ph' are derived fields. Protocol 3:
 * 'warmth' (the local warmth array, else the ambient settings.warmth everywhere) and 'moisture'
 * (derived.moisture), both a 0–1 index with max 1; packing reads them and never allocates a climate array.
 */
export type OverlayId = FieldId | 'light' | 'ph' | 'foodAccess' | 'warmth' | 'moisture';

export type Selection =
  | { readonly kind: 'entity'; readonly birthId: number }
  | { readonly kind: 'cell'; readonly cell: number };

export interface RecipeOverrides {
  readonly mutationPreset?: 'standard' | 'accelerated' | 'fixed';
  readonly founderMode?: 'identical' | 'varied' | 'diverse';
  /** Start from the recipe's habitat only: no founders, patches or scheduled inputs. */
  readonly empty?: boolean;
  /**
   * P3.2: build on this enabled habitat preset instead of the recipe's (New Dish 'Empty Gel Colony',
   * 'Empty Sediment Edge'); a different habitat drops the recipe's background overrides
   * (@sim/recipes withHabitatOverride). Absent = the recipe's own habitat.
   */
  readonly habitatId?: string;
  /**
   * Protocol 3 (P5.1 New Dish Environment; D-0111, D-0119): the lid, the light mode and drying the dish
   * starts with instead of the recipe's (applyRecipeOverrides). build() refuses an unknown value, and a
   * cycle or drying when this build's registry has no 'climate', before anything is built; recipeProvenance
   * records exactly the keys given. Absent = the recipe's own setting.
   */
  readonly lid?: 'open' | 'closed';
  readonly lightMode?: 'fixed' | 'cycle';
  readonly drying?: boolean;
  /**
   * Phase 5 P5.4 (wave 14, D-0128; CT §8.2 "Empty or Suggested Community"): true = also place the habitat's
   * Suggested Community (five of each named species in its region, and its patches). Needs `empty: true`
   * and a habitat whose community this build offers; build() refuses otherwise, before anything is built.
   * recipeProvenance records it only when true. Absent = no community (every v1.0 start).
   */
  readonly community?: boolean;
}

export type DishSource =
  | { readonly kind: 'recipe'; readonly recipeId: string; readonly seed?: number; readonly overrides?: RecipeOverrides }
  | { readonly kind: 'state'; readonly state: WorldState };

export type ToWorker =
  /**
   * P4.10 (D-0092): the client's FIRST message picks the worker's save store — 'filesystem' (the Android app
   * and the harness build) with the MessagePort to the main thread's file host in the transfer list, or 'idb'
   * (the web). Additive (ARCH §7): no protocol version change; any other first message boots IndexedDB.
   */
  | { readonly type: 'platform'; readonly storage: 'idb' | 'filesystem'; readonly port?: MessagePort }
  /** With `keepFrom` (D-0033) the open dish is kept first, as What if? keeps it: see KeepFrom. */
  | { readonly type: 'create'; readonly requestId: number; readonly dishId: string; readonly source: DishSource; readonly name?: string; readonly keepFrom?: KeepFrom }
  | { readonly type: 'dispose'; readonly dishId: string }
  | { readonly type: 'activate'; readonly dishId: string }
  | { readonly type: 'command'; readonly requestId: number; readonly dishId: string; readonly commandId: string; readonly payload: CommandPayload; readonly undoable: boolean }
  | { readonly type: 'setSpeed'; readonly dishId: string; readonly speed: Speed }
  | { readonly type: 'step'; readonly dishId: string }
  | { readonly type: 'undo'; readonly requestId: number; readonly dishId: string }
  | { readonly type: 'view'; readonly dishId: string; readonly overlay: OverlayId | null; readonly selection: Selection | null }
  | { readonly type: 'save'; readonly requestId: number; readonly dishId: string }
  /**
   * With `keepFrom` (D-0033) the dish being duplicated is kept first, as every replacing action keeps
   * it (the copy then takes its place on screen); a plain duplicate is synchronous as before.
   */
  | { readonly type: 'duplicate'; readonly requestId: number; readonly dishId: string; readonly newDishId: string; readonly keepFrom?: KeepFrom }
  | { readonly type: 'hash'; readonly requestId: number; readonly dishId: string }
  | { readonly type: 'history'; readonly requestId: number; readonly dishId: string; /** Only the most recent N per-second samples. */ readonly lastSeconds?: number }
  /** P2.8: the recorded regional series of one species' locus (whole dish and four quarters), read from history only. */
  | { readonly type: 'traitHistory'; readonly requestId: number; readonly dishId: string; readonly species: number; readonly locus: number }
  /**
   * P4.3 session memory (D08 "a satisfying stopping point"): what the dish recorded since `sinceTick`, read
   * from history samples and branch records only. Read-only: unlike 'history', it records no experiment
   * player step.
   */
  | { readonly type: 'sessionSummary'; readonly requestId: number; readonly dishId: string; readonly sinceTick: number }
  /** P2.8: keep a Notebook entry with this dish (saved, checksummed and exported with it; never in the state hash). */
  | { readonly type: 'journalPut'; readonly requestId: number; readonly dishId: string; readonly entry: unknown }
  /** P2.8: the Notebook entries kept with this dish (read-only). */
  | { readonly type: 'journalGet'; readonly requestId: number; readonly dishId: string }
  /** P2.8: turn the automatic checkpoint ring on or off (Settings; off unless the player turns it on). */
  | { readonly type: 'checkpointRing'; readonly enabled: boolean }
  /** P4.13: Settings "Show performance numbers": snapshots carry `perf` while on (no answer; off by default). */
  | { readonly type: 'diagnostics'; readonly on: boolean }
  | { readonly type: 'release'; readonly buffers: ArrayBuffer[] }
  | { readonly type: 'saveSlot'; readonly requestId: number; readonly dishId: string; readonly slotId: string; readonly name: string }
  | { readonly type: 'autosave'; readonly requestId: number; readonly dishId: string }
  | { readonly type: 'listSlots'; readonly requestId: number }
  | { readonly type: 'loadSlot'; readonly requestId: number; readonly slotId: string; readonly newDishId: string; readonly keepFrom?: KeepFrom }
  | { readonly type: 'deleteSlot'; readonly requestId: number; readonly slotId: string }
  | { readonly type: 'exportDish'; readonly requestId: number; readonly dishId: string; readonly strip: boolean; /** P4.1: keep the favorites' nicknames (the player's opt-in; default off). */ readonly includeNicknames?: boolean }
  | { readonly type: 'importDish'; readonly requestId: number; readonly text: string; readonly newDishId: string; readonly keepFrom?: KeepFrom }
  /**
   * P4.6 Share: the dish's Starting recipe file (@persist/recipeFile; read-only: only its recorded start is
   * read). Answered by 'recipeExported', or 'error' (kind 'no-start' with readable text) when it has none.
   */
  | { readonly type: 'recipeExport'; readonly requestId: number; readonly dishId: string }
  /**
   * P4.6: open a Starting recipe file as a NEW paused dish realized from this build's own content. The file
   * is checked and realized first (a refusal is 'error' and changes nothing), then the open dish is kept
   * (D-0033), then the dish opens: answered by 'loaded' (as an import) or 'keepRefused'.
   */
  | { readonly type: 'recipeImport'; readonly requestId: number; readonly text: string; readonly newDishId: string; readonly keepFrom?: KeepFrom }
  /**
   * P4.6 Import recipe ID ("R-G3 / revision 1 / seed 104729"; @persist/recipeId): only bundled ids, exact
   * revisions and valid seeds. A variant realizes as What if? realizes it, a recipe as 'create' with the
   * seed; built first, then the open dish is kept (D-0033): answered by 'ready', 'keepRefused' or 'error'.
   */
  | { readonly type: 'recipeIdStart'; readonly requestId: number; readonly id: string; readonly newDishId: string; readonly keepFrom?: KeepFrom }
  /**
   * D-0033: how the open dish `aboutDishId` would be kept if an action replaced it now (New Dish, the
   * Saved dishes checkpoint confirmation, an experiment card). With no dish open (null) it is the dish
   * Continue holds (fix round 1: after a relaunch that is the player's dish). `opening` names the save
   * the action opens, if any. Read-only. (Not named dishId: the dish is optional.)
   */
  | { readonly type: 'keepPlan'; readonly requestId: number; readonly aboutDishId: string | null; readonly opening?: string | null }
  /** D-0033: a stored save (the autosave that Continue holds) as a .pixelmeba file, exactly as stored; answered by 'exported'. */
  | { readonly type: 'exportSave'; readonly requestId: number; readonly slotId: string; /** P4.1: keep the favorites' nicknames (default off: the file's notebook goes without them). */ readonly includeNicknames?: boolean }
  /** Read-only family query for the inspector's "Where is its family?" shortcut (SPEC §12.1, UX §5.3). */
  | { readonly type: 'family'; readonly requestId: number; readonly dishId: string; readonly birthId: number }
  /** P3.8 (D-0039): the relationships first seen in this played dish so far (worker state, read-only). */
  | { readonly type: 'relationships'; readonly requestId: number; readonly dishId: string }
  /** P4.8: the relationship map of the last 60/180/600 dish seconds (worker session state, read-only). */
  | { readonly type: 'relationshipMap'; readonly requestId: number; readonly dishId: string; readonly windowSeconds: MapWindow }
  /** P4.8: replace the open dish's region probes (≤ 6; session state, never a command). Answered by 'probes'. */
  | { readonly type: 'probeSet'; readonly requestId: number; readonly dishId: string; readonly probes: readonly ProbeMask[]; readonly windowSeconds?: MapWindow }
  /** P4.8: the region probes' readings now, boundary totals over the window (read-only). Answered by 'probes'. */
  | { readonly type: 'probeRead'; readonly requestId: number; readonly dishId: string; readonly windowSeconds: MapWindow }
  /**
   * P4.1 (D-0070): the dish's notebook record (worker state saved beside the world, never in it). With
   * `inspect`, the answer also carries that living organism's inspector payload (read-only; the Family
   * sheet's inherited differences). Answered by 'notebook'.
   */
  | { readonly type: 'notebookGet'; readonly requestId: number; readonly dishId: string; readonly inspect?: number }
  /** P4.1: change the dish's favorites (notebook state: never a command, never touches the world). Answered by 'notebook'. */
  | { readonly type: 'favorite'; readonly requestId: number; readonly dishId: string; readonly op: FavoriteOp }
  /** P4.2: mark a story card opened ('seen') or dismissed (notebook state: never a command, never touches the world). Answered by 'notebook'. */
  | { readonly type: 'storyMark'; readonly requestId: number; readonly dishId: string; readonly id: string; readonly mark: 'seen' | 'dismissed' }
  /** P4.4 (D-0071): start a goal on this dish at its current tick (notebook state; never a command). Answered by 'notebook'. */
  | { readonly type: 'goalStart'; readonly requestId: number; readonly dishId: string; readonly objectiveId: string }
  /** P4.4: Leave goal — the running goal (or the latest ended one) continues freely. Answered by 'notebook'. */
  | { readonly type: 'goalLeave'; readonly requestId: number; readonly dishId: string }
  /** P4.4: the player dismissed goal `id`'s sentence (it is not offered again). No answer. */
  | { readonly type: 'goalShown'; readonly dishId: string; readonly id: string }
  /**
   * P4.4: the goals offered for dish `targetDishId`, or (null) for recipe `recipeId` before a dish exists
   * (the Play card). Read-only. Answered by 'goalCatalog'. (Not `dishId`: the host's generic error path
   * indexes dishes by a message's `dishId`, which must be a string.)
   */
  | { readonly type: 'goalCatalog'; readonly requestId: number; readonly targetDishId: string | null; readonly recipeId: string | null }
  /** P4.7 Try my dish: the setup's choices for dish `dishId` (read-only). Answered by 'trySetup'. */
  | { readonly type: 'trySetup'; readonly requestId: number; readonly dishId: string }
  /**
   * P4.7 (SPEC §13.6; D-0081): store the paused dish as a baseline on the shelf, keep the open dish first
   * (D-0033), then open turn 1 (`newDishId`) cloned from the baseline, paused, with the goal started at its
   * start tick. Answered by 'tryStarted', 'tryRefused' (nothing changed) or 'keepRefused'.
   */
  | {
      readonly type: 'tryStart';
      readonly requestId: number;
      readonly dishId: string;
      readonly newDishId: string;
      readonly objectiveId: string | null;
      readonly horizonSeconds: number;
      readonly prediction: string;
      readonly keepFrom?: KeepFrom;
    }
  /**
   * P4.7: the next turn from the same baseline, replacing turn dish `dishId` WITHOUT the keep flow. `discard`:
   * the player confirmed "Discard turn" (needed unless the turn's kept slot holds it exactly). Answered by
   * 'tryStarted' or 'tryRefused' (the current turn stays open and unchanged).
   */
  | { readonly type: 'tryNext'; readonly requestId: number; readonly dishId: string; readonly newDishId: string; readonly discard: boolean }
  /** P4.7: Finish — the turn becomes 'finished'; the dish stays open as an ordinary paused dish. Answered by 'tryTurn'. */
  | { readonly type: 'tryFinish'; readonly requestId: number; readonly dishId: string }
  /**
   * P4.8c custom challenge (src/worker/challenge.ts): store the paused dish as the challenge's baseline on the
   * shelf and record the challenge in its notebook. Answered by 'challengeSaved' or 'challengeRefused' (nothing changed).
   */
  | { readonly type: 'challengeSave'; readonly requestId: number; readonly dishId: string; readonly challenge: ChallengeInput }
  /** P4.8c: the challenge file (the baseline save with only this challenge in its notebook). Answered by 'challengeExported' or 'challengeRefused'. */
  | { readonly type: 'challengeExport'; readonly requestId: number; readonly dishId: string; readonly challengeId: string }
  /**
   * P4.8c: start challenge `challengeId` as a Try my dish turn from its baseline (the open dish kept first, D-0033).
   * `check`: only say whether it can start (answered by 'challengeChecked'; nothing is kept, written or opened).
   * Answered by 'challengeStarted', 'challengeRefused' (nothing changed) or 'keepRefused'.
   */
  | { readonly type: 'challengeStart'; readonly requestId: number; readonly dishId: string; readonly challengeId: string; readonly newDishId: string; readonly keepFrom?: KeepFrom; readonly check?: boolean }
  /**
   * P4.8b Bookmark this moment (no `event`) or an event row of History "What happened" (`event`; text only:
   * past moments have no stored state). Notebook state, never a command. With `snapshot` the dish's full save
   * at this tick goes on the shelf (kind 'snapshot', ≤ 20 per device) BEFORE the bookmark is added; a refused
   * or failed write adds nothing. Answered by 'notebook' (`refused`: nothing was added).
   */
  | { readonly type: 'bookmarkAdd'; readonly requestId: number; readonly dishId: string; readonly title: string; readonly snapshot: boolean; readonly event: BookmarkEventRef | null }
  /** P4.8b: delete one bookmark (its snapshot stays on the shelf until removed in Saved dishes → Storage). Answered by 'notebook'. */
  | { readonly type: 'bookmarkDelete'; readonly requestId: number; readonly dishId: string; readonly id: string }
  /**
   * P4.8b: open a snapshot bookmark of dish `dishId` as a NEW branch `newDishId`, exactly as a checkpoint opens
   * (branchWorldId, branchName, favorites only; D-0031), the open dish kept first (D-0033). Answered by
   * 'loaded' (with `branch`), 'keepRefused', or 'bookmarkGone' (the stored moment is gone or unreadable; nothing changed).
   */
  | { readonly type: 'bookmarkOpen'; readonly requestId: number; readonly dishId: string; readonly id: string; readonly newDishId: string; readonly keepFrom?: KeepFrom }
  /** P4.8b: save a specimen to the gallery from the UI's snapshot copy and the inspector lines on screen (notebook state; never spawns). Answered by 'notebook'. */
  | { readonly type: 'galleryAdd'; readonly requestId: number; readonly dishId: string; readonly entry: GalleryEntryInput }
  /** P4.8b: delete one gallery entry. Answered by 'notebook'. */
  | { readonly type: 'galleryDelete'; readonly requestId: number; readonly dishId: string; readonly id: string }
  /** P4.8b: what this device stores (src/worker/storage.ts; read-only). Answered by 'storageInfo'. */
  | { readonly type: 'storageInfo'; readonly requestId: number }
  /**
   * P4.8b: remove one automatic checkpoint or shelf record (the storage panel, after its confirmation). A
   * named slot or the autosave is refused ('error'; nothing changed). Answered by 'storageInfo' (removed).
   */
  | { readonly type: 'storageRemove'; readonly requestId: number; readonly slotId: string }
  /** Read-only lineage panel query (SPEC §8.5, UX §5.5): branches, variation, specimens, and detail for one branch or one organism's branch. */
  | { readonly type: 'lineage'; readonly requestId: number; readonly dishId: string; readonly branch: number | null; readonly birthId: number | null }
  /** Trait overlay and lineage highlight for this dish's snapshots (render-only; never touches the world). */
  | { readonly type: 'lineageView'; readonly dishId: string; readonly view: LineageView | null }
  /**
   * Comparison (SPEC §13.4, P2.4): capture the source dish once as the baseline, realize arms A and B
   * (paused), pause the source. Optional interventions are applied to B only, as paused edits.
   */
  | {
      readonly type: 'compareStart';
      readonly requestId: number;
      readonly compareId: string;
      readonly sourceDishId: string;
      readonly aDishId: string;
      readonly bDishId: string;
      readonly interventions?: readonly { readonly commandId: string; readonly payload: CommandPayload }[];
    }
  /** Clear B's queued change: rebuild B from the stored baseline (setup only). */
  | { readonly type: 'compareReset'; readonly requestId: number; readonly compareId: string }
  /** Advance A and B by equal tick counts: `horizonTicks` each, or until compareStop when null. */
  | { readonly type: 'compareRun'; readonly requestId: number; readonly compareId: string; readonly horizonTicks: number | null; readonly speed: CompareSpeed }
  /** Pacing only; never changes how many ticks either arm receives. */
  | { readonly type: 'compareSpeed'; readonly compareId: string; readonly speed: CompareSpeed }
  /** End the run now; both arms are at the same tick. */
  | { readonly type: 'compareStop'; readonly requestId: number; readonly compareId: string }
  /** Discard A, B and the stored baseline. Never touches the source dish or any save slot. */
  | { readonly type: 'compareDelete'; readonly requestId: number; readonly compareId: string }
  /**
   * What if? (P2.6, UX §3.4): the choices for a source recipe (or, with sourceId null, for the recipe
   * `aboutDishId` came from), each with its preview, and how that dish would be kept if a new dish
   * started (with no dish open: the dish Continue holds, D-0033 fix round 1). Read-only; never
   * simulates. (Not named dishId: the dish is optional.)
   */
  | { readonly type: 'whatIf'; readonly requestId: number; readonly sourceId: string | null; readonly aboutDishId: string | null }
  /**
   * Start a What if? variant as a NEW paused dish with its own world id. The new world is built first
   * (a refusal changes nothing); then `fromDishId` is kept through the save flow (`keep`; with no dish
   * open, the dish Continue holds, D-0033 fix round 1); only then does the new dish open. Again /
   * Another idea need `fromDishId` to be a variant dish.
   */
  | {
      readonly type: 'whatIfStart';
      readonly requestId: number;
      readonly newDishId: string;
      readonly fromDishId: string | null;
      readonly pick: WhatIfPick;
      readonly keep: WhatIfKeep;
    }
  /** Experiment cards (P2.5): the cards this build ships, as the Notebook shows them (recorded content; read-only). */
  | { readonly type: 'experimentCatalog'; readonly requestId: number }
  /**
   * Start an experiment card as a NEW paused dish `newDishId`, realized from the card's recipe and seed
   * (nothing the UI sends can change either). A paired card also opens its paired run through the
   * comparison engine (`compare` ids) with the card's change already on B; a single-arm card's dish
   * carries the card's observation gate while it runs.
   */
  | {
      readonly type: 'experimentStart';
      readonly requestId: number;
      readonly cardId: string;
      /** The new dish's id (not named dishId: a refused start must never touch an existing dish). */
      readonly newDishId: string;
      readonly compare: { readonly compareId: string; readonly aDishId: string; readonly bDishId: string } | null;
      /** D-0033: keep the open dish first (see KeepFrom); the card's arms are realized before it is kept. */
      readonly keepFrom?: KeepFrom;
    }
  /**
   * P4.5 Paired Garden variants (src/worker/variantPair.ts): compare What if? idea `variantId` (R-G1…R-G3)
   * with the unchanged Garden (R-G0) for the fixed 180 s. Both arms are realized from content at tick 0
   * (a refusal changes nothing), then the open dish is kept first (`keepFrom`, D-0033), then a NEW paused
   * dish `newDishId` holding the idea's start opens with the comparison in setup (no change on B; the
   * arms take no command). `sequential`: run A to the horizon, then B (SPEC §13.4). Answered by
   * 'variantPairStarted', 'whatIfRefused' (nothing changed) or 'keepRefused'.
   */
  | {
      readonly type: 'variantPairStart';
      readonly requestId: number;
      readonly variantId: string;
      readonly newDishId: string;
      readonly compare: { readonly compareId: string; readonly aDishId: string; readonly bDishId: string };
      readonly sequential: boolean;
      readonly keepFrom?: KeepFrom;
    }
  /**
   * New Dish (P2.2, UX §2.3): what a dish with these choices would start with — realized in the worker
   * exactly as `create` would build it, summarized, then discarded. Read-only; no dish is created.
   */
  | { readonly type: 'newDishPreview'; readonly requestId: number; readonly recipeId: string; readonly seed: number; readonly overrides: RecipeOverrides }
  /**
   * P3.5 Sample (SPEC §10.5; D-0037). Begin is host-level: the dish pauses and the worker records its
   * stateHash (replied as sampleBegun). Take, Transfer and Discard are commands ('sampleTake',
   * 'sampleTransfer', 'sampleDiscard'). Preview is read-only. Cancel is host-level and exact.
   */
  | { readonly type: 'sampleBegin'; readonly requestId: number; readonly dishId: string }
  | { readonly type: 'samplePreview'; readonly requestId: number; readonly dishId: string; readonly x: number; readonly y: number; readonly radius: number; readonly mode: SampleMode }
  | { readonly type: 'sampleCancel'; readonly requestId: number; readonly dishId: string };

/** What a sample at a point would take (read-only; src/sim/sample.ts selectSample). Amounts are game units. */
export interface SamplePreview {
  readonly mode: SampleMode;
  readonly radius: number;
  readonly origin: readonly [number, number];
  /** Footprint cells (inside the dish, open or porous), ascending. */
  readonly cells: readonly number[];
  readonly organisms: number;
  readonly objects: number;
  readonly c: number;
  readonly n: number;
  readonly m: number;
  /** Partners of whole units outside the circle: non-empty ⇒ Take is refused whole. */
  readonly missing: readonly MissingMember[];
}

export interface SlotSummary {
  readonly slotId: string;
  readonly name: string;
  readonly tick: number;
  readonly savedAt: string;
  readonly recipeId: string | null;
  readonly bytes: number;
  /**
   * What if? (P2.6): the idea a What if? dish was made from, copied from its save file's meta into the
   * slot index when it was written, so the Saved dishes list can name it without loading the world.
   * Absent for other dishes and for slots written before the index kept it. A display copy only.
   */
  readonly variant?: SaveMetaVariant;
  /** P2.8: an automatic checkpoint (the ring), listed after the named slots; never a named slot. */
  readonly automatic?: true;
  /**
   * P2.2 (UX §3.3 "mode labels … wherever a world is described"): the saved world's evolution setting
   * and founder mode, and whether its recorded registry is partial, from the slot index's copy of the
   * file's meta. Absent for slots written before the index kept it. A display copy only.
   */
  readonly modes?: SlotModes;
  /**
   * P4.3 (UX §2 "live thumbnail"): the saved moment's thumbnail (src/worker/thumbnail.ts), copied into the
   * slot index when it was written; outside the save checksum. Absent for slots written before. A display copy only.
   */
  readonly thumb?: string;
}

/**
 * P4.3 session memory: what a dish recorded between `fromTick` and `toTick` (history samples and branch
 * records). `births`/`deaths` are per species index. `compacted`: part of the span is held only as a
 * one-minute summary that began before `fromTick`; it cannot be split, so it is left out of the counts
 * (they are then a lower bound).
 */
export interface SessionSummary {
  readonly births: readonly number[];
  readonly deaths: readonly number[];
  readonly branches: readonly { readonly id: number; readonly name: string; readonly tick: number }[];
  readonly fromTick: number;
  readonly toTick: number;
  readonly compacted: boolean;
}

/** A saved dish's mode labels (P2.2): what Saved dishes and Continue say about the world in a slot. */
export interface SlotModes {
  readonly mutationPreset: string;
  readonly founderMode: string;
  /** True: "Core prototype — quantitative evolution"; absent when the slot did not record its registry. */
  readonly partial?: boolean;
  /** P5.6 (SPEC §13.1, D02 §22): the saved world records a test-only override (its save meta's testOverrides copy); absent otherwise. */
  readonly testOnly?: true;
}

/** Per-entity record stride in SnapshotMsg.ents (Float32). 14 since protocol 2 (E_CUE2, E_LINKMASK); 15 since protocol 3 (E_CUE3). */
export const ENT_STRIDE = 15;
export const E_SLOT = 0;
export const E_SPECIES = 1;
export const E_X = 2;
export const E_Y = 3;
export const E_HEADING = 4;
export const E_FLAGS = 5;
export const E_GROWTH = 6; // B / (2·B0), 0.5 = newborn, 1 = ready to divide
export const E_ENERGY = 7; // E / cap
export const E_HEALTH = 8; // H / 100
export const E_LIFE = 9; // life state
export const E_SIZE = 10; // body size factor (1 until Phase 7)
export const E_CUE = 11; // cue bits (see CUE_*)
export const E_CUE2 = 12; // Phase 3 cue bits (see CUE2_*); 0 when none
export const E_LINKMASK = 13; // fungal link directions and transfer (see LINKMASK_*); 0 when none
export const E_CUE3 = 14; // Phase 5 cue bits (see CUE3_*, protocol 3); 0 when none

export const CUE_FEEDING = 1;
export const CUE_STRESSED = 2;
export const CUE_HUNTING = 4;
export const CUE_SECRETING = 8;
export const CUE_JUST_BORN = 16;
export const CUE_CAPACITY_BLOCKED = 32;
/**
 * Module visual layers (SPEC §9, UX §6.2; P2.1). Set only from the organism's genome and state:
 * E01 carriers (notched producer marking), E03 carriers (seam; folded pose only while Preparing,
 * Resting or Waking — see E_LIFE), E05 carriers (interior pocket) with its fill band 0–3 in the two
 * bits at CUE_RESERVE_BAND_SHIFT: 0 = no energy above the base cap, 1–3 = thirds of the chamber's
 * extra room in use (actual stored energy, never cosmetic).
 */
export const CUE_MOD_E01 = 64;
export const CUE_MOD_E03 = 128;
export const CUE_MOD_E05 = 256;
export const CUE_RESERVE_BAND_SHIFT = 9;
export const CUE_RESERVE_BAND_MASK = 3 << CUE_RESERVE_BAND_SHIFT;

/**
 * Phase 3 cue bits in E_CUE2 (protocol 2). Each is set only from authoritative state at pack time:
 * INFECTED (infectedBy ≠ 0), PARASITIZED (a live parasite pair on this host), ANCHORED (E04 anchorState
 * 1), LINKED (any valid adhesion link), CUE2_MOD_E0x/E1x (the module is in its genome, like CUE_MOD_E0x),
 * SEEKING_LIGHT (E07 carrier that is moving). DETRITUS_INTAKE and RELEASING_PROTEIN are reserved for
 * wave 4 (their FLAG bits 1 << 13 / 1 << 12 do not exist yet), so they are never set before then.
 */
export const CUE2_INFECTED = 1;
export const CUE2_PARASITIZED = 2;
export const CUE2_ANCHORED = 4;
export const CUE2_LINKED = 8;
export const CUE2_MOD_E04 = 16;
export const CUE2_MOD_E06 = 32;
export const CUE2_MOD_E07 = 64;
export const CUE2_MOD_E08 = 128;
export const CUE2_MOD_E09 = 256;
export const CUE2_MOD_E10 = 512;
export const CUE2_MOD_E12 = 1024;
export const CUE2_SEEKING_LIGHT = 2048;
export const CUE2_DETRITUS_INTAKE = 4096;
export const CUE2_RELEASING_PROTEIN = 8192;

/**
 * Phase 5 cue bits in E_CUE3 (protocol 3; D-0119). Each is set only from authoritative entity columns at
 * pack time (src/worker/snapshot.ts cue3Of), 0 when nothing applies; every value is below 2^24, so exact in
 * Float32. Most stay 0 until the waves that write their columns (12–13): those waves may refine a rule
 * without a protocol bump as long as these names and value ranges hold.
 * - GLOWING: glowState 1 (SPEC §7.8). MOD_E02 / MOD_E11: the module is in the genome (like CUE_MOD_E0x).
 * - MODE (2 bits at CUE3_MODE_SHIFT): metabolicMode 0 none, 1 Photo, 2 Sugar (A04, SPEC §7.10).
 * - HELD: heldBySlot ≥ 0 with a valid reference (an F03 trap holds it). HANDLING: handlingNeed > 0 with a
 *   valid prey reference (P10, SPEC §7.3).
 * - TRAP (2 bits at CUE3_TRAP_SHIFT): 0 none or idle, 1 armed (trapReserveC > 0, no target), 2 holding
 *   (trapSlot ≥ 0, valid), 3 cooldown (trapCooldown > 0); holding wins over cooldown, cooldown over armed.
 * - JACKET (2 bits at CUE3_JACKET_SHIFT): the jacket_rim frame, min(3, max(0, ⌈4c⌉ − 1)) with
 *   c = min(1, jacketMineral / (0.10 × B)) (wave 13: handling.ts jacketCoverage, 0 at B ≤ 0). JACKETED: jacketMineral > 0.
 * - SHELL: the species has SHELL and boundMineral > 0.
 */
export const CUE3_GLOWING = 1;
export const CUE3_MOD_E02 = 2;
export const CUE3_MODE_SHIFT = 2;
export const CUE3_MODE_MASK = 3 << CUE3_MODE_SHIFT;
export const CUE3_HELD = 16;
export const CUE3_HANDLING = 32;
export const CUE3_TRAP_SHIFT = 6;
export const CUE3_TRAP_MASK = 3 << CUE3_TRAP_SHIFT;
export const CUE3_JACKET_SHIFT = 8;
export const CUE3_JACKET_MASK = 3 << CUE3_JACKET_SHIFT;
export const CUE3_JACKETED = 1024;
export const CUE3_MOD_E11 = 2048;
export const CUE3_SHELL = 4096;
/**
 * Wave 13 (org-ui; D-0124; additive inside E_CUE3: no stride, band or version change, every value still below
 * 2^24, and each is 0 for every organism of a v1.0 dish, so the protocol 2 golden holds):
 * - HANDLING_QUARTER (2 bits at CUE3_HANDLING_QUARTER_SHIFT), packed only while CUE3_HANDLING is set: the
 *   handling_arc frame (D-0112) min(3, max(0, ⌈4 × handlingProgress / handlingNeed⌉ − 1)), so the arc shows on
 *   every handler on screen, not only the selected one.
 * - HOLD_CLOSING, packed only with CUE3_HELD: the hold is in its first second (the holding trap's trapTimer ≤ 1 s
 *   since the committed capture), the trap_loop 'closing' frame; 'holding' after (reduced motion: 'holding' only).
 * - GLOWER: the organism has glow rules (native SIGNAL_GLOW or a recorded E02; Profile.glow), so glow_center can
 *   show its dim frame on a native glower that is not glowing (E02 carriers also carry CUE3_MOD_E02).
 * The JACKET band reads src/sim/handling.ts jacketCoverage, the one coverage the simulation uses for speed and
 * handling (c = 0 at B ≤ 0, where wave 11's inline expression gave 1: unreachable for a living organism).
 */
export const CUE3_HANDLING_QUARTER_SHIFT = 13;
export const CUE3_HANDLING_QUARTER_MASK = 3 << CUE3_HANDLING_QUARTER_SHIFT;
export const CUE3_HOLD_CLOSING = 1 << 15;
export const CUE3_GLOWER = 1 << 16;

/**
 * E_LINKMASK (protocol 2): the low four bits are the directions of the segment's live fungal links
 * (y grows south; the art's mask bits, D-0046): N 1, E 2, S 4, W 8. Bit 4 is a transport transfer this
 * second (0 until wave 3's F02 transport).
 */
export const LINKMASK_N = 1;
export const LINKMASK_E = 2;
export const LINKMASK_S = 4;
export const LINKMASK_W = 8;
export const LINKMASK_DIRS = 15;
export const LINKMASK_TRANSFER = 16;

/** SnapshotMsg.links record: [x1, y1, x2, y2, kind] per link, each pair once. */
export const LINK_STRIDE = 5;
/** Link kind in SnapshotMsg.links: an adhesion link (E12). */
export const LINK_KIND_ADHESION = 3;

/**
 * Deposit bands (SnapshotMsg.deposits, CELL_COUNT bytes each, protocol 2): 0 starch, 1 detritus, 2 oil,
 * 3 protein, 4 sugar haze, 5 catalysis, 6 film. The film band's low seven bits are film carbon on a
 * linear scale (0.50 C, the film cap, = 127; any film ≥ 1); bit 7 is set while the film there is eroding
 * (lower than at the packer's previous tick; worker-side scratch, never simulation state).
 */
export const DEPOSIT_FILM_BAND = 6;
export const FILM_LEVEL_MASK = 127;
export const FILM_ERODING = 128;
/**
 * Protocol 3: band 7 is grit (E2-SHELLS), on the same soft log scale as starch and detritus; 0 where the
 * world has no grit field. Packed, not drawn yet (the procedural grit glyph is wave 13's, D-0109).
 */
export const DEPOSIT_GRIT_BAND = 7;

/** One finite food object as the renderer draws it (SnapshotMsg.objects). */
export interface SnapshotObject {
  readonly id: number;
  /** Its cell's centre (cells). */
  readonly x: number;
  readonly y: number;
  readonly kind: string;
  /** Remaining carbon / its full inventory (0–1). */
  readonly fill: number;
}

/** Per-entity id stride in SnapshotMsg.ids (Uint32): birthId, entityId. */
export const ID_STRIDE = 2;

/** GeometryMsg.edges (protocol 3). */
export interface GeometryEdges {
  readonly r: Uint8Array;
  readonly d: Uint8Array;
  readonly list: readonly GeometryEdge[];
}

export interface GeometryMsg {
  readonly version: number;
  readonly substrate: Uint8Array;
  readonly structure: Uint8Array;
  readonly shade: Float32Array;
  /**
   * Protocol 3: the dish's edge barriers, null when world.edges is empty. `r[cell]` / `d[cell]` are the
   * barriers.ts edge code (edgeCodeArrays) of the cell's right / down edge, ORed with EDGE_FLOW_BACK when
   * that edge is an S04 whose flow is −1 (it carries from the right/lower cell to `cell`). `list` is
   * world.edges in its order (never nextOrganismTick: simulation timing, not geometry). The worker
   * (snapshot.ts packGeometry) always sends both keys; they are optional in the type only so a tool that
   * builds a protocol 2 shaped geometry (tools/render-bench.ts) still type-checks, and absent reads as none.
   */
  readonly edges?: GeometryEdges | null;
  /** Protocol 3: furnishings and devices in world.devices order ([] when none), never a resin's `bound` (SnapshotMsg.resins). */
  readonly devices?: readonly GeometryDevice[];
}

/** Bit ORed onto a GeometryMsg edge code: an S04 channel flowing from the right/lower cell to edge.cell (flow −1). */
export const EDGE_FLOW_BACK = 8;

/** One edge barrier as the renderer and inspector see it (GeometryMsg.edges.list). */
export interface GeometryEdge {
  readonly id: number;
  readonly kind: 'S01' | 'S02' | 'S03' | 'S04';
  /** The lower cell (the left cell for 'R', the upper cell for 'D'). */
  readonly cell: number;
  readonly dir: 'R' | 'D';
  /** S03 only. */
  readonly open?: boolean;
  /** S04 only: +1 from `cell` to its neighbour, −1 back. */
  readonly flow?: 1 | -1;
}

/** One furnishing or device as the renderer sees it (GeometryMsg.devices). */
export interface GeometryDevice {
  readonly id: number;
  readonly kind: 'S05' | 'S06' | 'S07' | 'S08' | 'S09' | 'S10' | 'S11' | 'S12';
  readonly cell: number;
  /** S09/S10 only. */
  readonly on?: boolean;
  /** S08 only: its selection (sorted RESIN_TARGETS subset; [] = Off). */
  readonly resinSelect?: readonly string[];
}

export interface VisualEvent {
  /**
   * 'objectEmptied' (protocol 2): a food object ran out in `cell` (a cosmetic fading stain; wave 3 passes it through).
   * 'wake' (P3.10, additive, no protocol bump): a resting organism became active (src/sim/dormancy.ts); the UI's
   * wake cue only; the renderer and the feed ignore it.
   */
  readonly type: 'birth' | 'death' | 'introduce' | 'capture' | 'conversion' | 'mutation' | 'branchEstablished' | 'branchExtinct' | 'objectEmptied' | 'wake';
  readonly tick: number;
  readonly species: number;
  readonly cell: number;
  readonly birthId: number;
  readonly cause?: number;
  /** Branch id for branchEstablished / branchExtinct (P2.3). */
  readonly branch?: number;
  /**
   * 'mutation' only: the birth's recorded mutation descriptor (D-0034 label ruling), so the feed names a
   * module gained or lost. `flags` are the MUT_* bits (@sim/mutation), `delta` the quantitative change,
   * `module` the gained or lost module's id from the world's recorded content (null when none).
   */
  readonly mutation?: {
    readonly flags: number;
    readonly delta: number;
    readonly module: string | null;
    /**
     * A quantitative change (G2 comprehension M2): its locus and the value in the parent's and the
     * offspring's recorded genomes. Absent when either birth record is no longer kept.
     */
    readonly locus?: number;
    readonly from?: number;
    readonly to?: number;
  };
}

/** One species' recorded diet as the trays describe it (DishInfo.speciesDiets). */
export interface SpeciesDiet {
  readonly metabolism: string;
  readonly foods: readonly string[];
  readonly prey: readonly { readonly id: string; readonly requires: string }[];
  readonly hosts: readonly string[];
  readonly digestsFilm: boolean;
}

export interface DishInfo {
  readonly dishId: string;
  readonly worldId: string;
  readonly name: string;
  readonly seed: number;
  readonly tick: number;
  readonly speciesIds: readonly string[];
  readonly speciesNames: readonly string[];
  readonly speciesAssets: readonly string[];
  readonly materials: readonly { readonly id: string; readonly name: string; readonly target: string; readonly doses: readonly number[]; readonly kind: string }[];
  readonly mutationPreset: string;
  readonly founderMode: string;
  readonly recipeId: string | null;
  readonly contentHash: string;
  readonly manifestLabel: string;
  /** Lab trays (P2.7): each species' recorded habitats, attachment surfaces (null = free-living) and one-line summary, in speciesIds order. */
  readonly speciesHabitats?: readonly (readonly string[])[];
  readonly speciesAttachment?: readonly (readonly string[] | null)[];
  readonly speciesSummaries?: readonly string[];
  /**
   * Add Life and the Lab Life tray (P3.3/P3.4, W2-13): each species' recorded diet, in speciesIds
   * order — metabolism, field foods in the record's order, prey (id and requirement), hosts, and
   * whether it digests film (only when this world's manifest enables the film system).
   */
  readonly speciesDiets?: readonly SpeciesDiet[];
  /** P3.10 audio: each species' recorded category ("bacterium", "alga", …), in speciesIds order; bacterial births make no division cue (UX §8.1). */
  readonly speciesCategories?: readonly string[];
  /** Lab trays (P2.7): each enabled material's one-line summary, in materials order. */
  readonly materialSummaries?: readonly string[];
  /** Fields allocated in this world (the overlays the Lab Observe tray can offer), canonical order. */
  readonly fieldIds?: readonly string[];
  /**
   * Lab trays (P2.7, D-0024): the Structure record IDs this world's own recorded manifest enables
   * (`enabledStructures`; [] for a world recorded before structures were content). The Lab offers a
   * structure tool only when it is listed here, whatever content this build ships.
   */
  readonly structureIds?: readonly string[];
  /** What if? (P2.6): the variant record when this dish was made from a What if? idea (its provenance), else null. */
  readonly variant?: VariantRecord | null;
  /** What if? (P2.6): the recipe whose What if? ideas apply to this dish (its source recipe), or null when none do. */
  readonly whatIfSourceId?: string | null;
  /** P2.2: the module registry this world recorded (UX §3.3 label when partial; export metadata). */
  readonly registry?: RegistryInfo;
  /** P4.7: the dish's Try my dish turn (its notebook's record), when it is a turn dish. */
  readonly turn?: TurnRecord;
  /** Protocol 3: the world's recorded enabledSystems (as structureIds is its enabledStructures), so the UI gates per dish (D-0111). */
  readonly systems?: readonly string[];
  /**
   * Protocol 3: each species' free transport class (barriers.ts freeClassOfSpecies), in speciesIds order.
   * The Life brush sets LifeBrush.shelterBlocked from it ('medium' or 'large'), so its preview refuses an
   * S05 shelter cell exactly as canOccupy does.
   */
  readonly speciesFreeClass?: readonly ('small' | 'medium' | 'large' | 'fixed' | 'viral')[];
  /**
   * Phase 5 wave 14 (region pins, D-0128): the regions of the dish's OWN recorded habitat (world.content.habitat,
   * never this build's registry), in record order: `number` is the 1-based position (1…6), `anchor` the anchor
   * cell (x, y). Present only when that habitat records at least one region; absent otherwise (every v1.0 dish).
   */
  readonly regions?: readonly DishRegion[];
  /**
   * P5.6 (SPEC §13.1 "test-only overrides disclosed"): one entry per overridden field, read from the WORLD's own
   * recorded provenance (testOnlyOverrides) and species copies; `normal` is this build's record value (or the
   * copy's own value when the build lacks the species). Absent when the world records no override.
   */
  readonly testOverrides?: readonly TestOverrideView[];
}

/** One habitat region as DishInfo.regions carries it (the pin and the legend). */
export interface DishRegion {
  readonly id: string;
  readonly label: string;
  readonly number: number;
  readonly anchor: readonly [number, number];
}

export interface SnapshotMsg {
  readonly type: 'snapshot';
  readonly dishId: string;
  readonly gen: number;
  readonly tick: number;
  readonly speed: Speed;
  readonly effectiveSpeed: number;
  readonly count: number;
  readonly ents: Float32Array;
  readonly ids: Uint32Array;
  /** Per cell: starch, detritus, oil, protein, sugar haze, catalysis, film (7 × CELL_COUNT; DEPOSIT_FILM_BAND). */
  readonly deposits: Uint8Array;
  /** Protocol 2: adhesion links as [x1, y1, x2, y2, kind] (LINK_STRIDE; kind LINK_KIND_ADHESION), each pair once. */
  readonly links?: Float32Array;
  /** Protocol 2: the dish's finite food objects (world.objects order). */
  readonly objects?: readonly SnapshotObject[];
  readonly overlay: { readonly id: OverlayId; readonly data: Float32Array; readonly max: number } | null;
  readonly geometry: GeometryMsg | null;
  readonly events: readonly VisualEvent[];
  readonly selection: InspectorPayload | null;
  readonly capacityReached: boolean;
  readonly speciesCounts: readonly number[];
  readonly undoAvailable: boolean;
  /** Named branches recorded in this dish so far (P2.3; ids 0…n-1, so new discoveries are ids ≥ the last count). */
  readonly branchCount?: number;
  /** Trait overlay bands and lineage highlight per entity, in `ents` order (P2.3); absent when off. */
  readonly lineage?: LineageMarks | null;
  /** P2.2: the evolution setting now in effect, its per-daughter rates and the recorded changes (Advanced panel). */
  readonly evolution?: EvolutionState;
  /** P3.1: the dish's lid setting now in effect (SPEC §4.5), for the Habitat tray's lid toggle. */
  readonly lid?: 'open' | 'closed';
  /** P3.5: the held sample (SPEC §10.5), or null; while held the dish refuses Run, Step and other changes. */
  readonly sample?: SampleHeldSummary | null;
  /** P4.1: the followed families' marks and slot summaries (absent when no family is followed). */
  readonly favorites?: FavoriteMarks;
  /** P4.13: the worker's own timings, only while diagnostics are on (src/worker/perfCounters.ts). */
  readonly perf?: PerfSample;
  /**
   * Protocol 3: every S08 resin's saturation (min(1, Σ bound / RESIN_CAPACITY), 0 with nothing bound), in
   * world.devices order; present only when the dish holds an S08. Per snapshot because `bound` changes in
   * stage 2 without a geometry bump.
   */
  readonly resins?: readonly SnapshotResin[];
  /** Protocol 3: the light mode and drying in effect; present only when the world records 'climate'. */
  readonly environment?: SnapshotEnvironment;
}

/** One adsorption resin's fill (SnapshotMsg.resins; CT §4 "darkens as saturated"). */
export interface SnapshotResin {
  readonly id: number;
  readonly cell: number;
  readonly saturation: number;
}

/** The dish's climate settings now in effect (SnapshotMsg.environment). */
export interface SnapshotEnvironment {
  readonly lightMode: 'fixed' | 'cycle';
  readonly drying: boolean;
}

/** P4.13 (ARCH §13): worker timings over the last 300 ticks and snapshots, in ms (wall clock, worker side). */
export interface PerfSample {
  readonly tickMsP50: number;
  readonly tickMsP95: number;
  /** How many tick times the percentiles are over (≤ 300). */
  readonly ticksMeasured: number;
  /** The last snapshot's build time. */
  readonly snapshotMs: number;
  /** The relationship watcher's share of the tick (its stage hooks and after-tick scan), mean over the ring. */
  readonly relationshipMs: number;
}

/**
 * P4.1 (src/worker/favorites.ts): per-entity marks in `ents` order — bit k: a highlighted member of
 * active favorite slot k (k = 0…2, the active favorites in the record's order); bit 3 + k: that slot's
 * representative — and one summary per active slot. Highlighting stops at FAVORITE_HIGHLIGHT_MAX members
 * (the first by birth tick, then birth id); beyond it `aggregate` is the mean position and count of all
 * members (CT §12.10 "descendants highlighted ≤ 200").
 */
export interface FavoriteMarks {
  readonly marks: Uint8Array;
  /**
   * Fix round 1: per entity in `ents` order, bit k = a member of active slot k, highlighted or not (the
   * marks stop at FAVORITE_HIGHLIGHT_MAX; the inspector's "Follow this family" needs every member).
   */
  readonly member: Uint8Array;
  readonly slots: readonly FavoriteSlotMark[];
}

export interface FavoriteSlotMark {
  readonly id: string;
  readonly pattern: FavoritePattern;
  /** Living members now. */
  readonly members: number;
  /** Members carrying the slot bit (at most FAVORITE_HIGHLIGHT_MAX). */
  readonly highlighted: number;
  readonly aggregate: { readonly x: number; readonly y: number; readonly count: number } | null;
  /** The representative's entity id while it is alive in the dish, else null (Find then offers Follow next). */
  readonly representativeEntity: number | null;
  /** The representative is in the held sample (a member, but not in the dish until Transfer or Cancel). */
  readonly representativeHeld: boolean;
  /** When the representative is gone: the first Follow next candidate [birthId, birthTick, speciesIdx], else null. */
  readonly next: readonly [number, number, number] | null;
  /** Fix round 1: the first Follow next candidates (at most FAVORITE_CANDIDATES_SHOWN, `next` first) in the same order and form; [] while the representative is a member. */
  readonly candidates: readonly (readonly [number, number, number])[];
  /** Generation depth: the highest generation among living members minus the root's (null when the root's record is not kept). */
  readonly depth: number | null;
}

/** P4.1: a change to a dish's favorites (notebook state; never a CommandPayload). */
export type FavoriteOp =
  | { readonly kind: 'follow'; readonly birthId: number; readonly nickname: string | null; readonly pattern: FavoritePattern }
  | { readonly kind: 'rename'; readonly id: string; readonly nickname: string | null }
  | { readonly kind: 'pattern'; readonly id: string; readonly pattern: FavoritePattern }
  | { readonly kind: 'representative'; readonly id: string; readonly birthId: number }
  | { readonly kind: 'unpin'; readonly id: string }
  | { readonly kind: 'pin'; readonly id: string };

/** P4.8b: an event row of History "What happened" being bookmarked (its first event: tick, type, species, cause; and the row's words). */
export interface BookmarkEventRef {
  readonly tick: number;
  readonly type: VisualEvent['type'];
  readonly species: number;
  readonly cause: number | null;
  readonly text: string;
}

/** P4.8b: a gallery entry as the UI sends it (the worker gives it its id). */
export type GalleryEntryInput = Omit<GalleryEntry, 'id'>;

/** P4.4: a goal a dish offers (content texts; "{time}" in the sentences is the dish time m:ss). */
export interface GoalOffer {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly completedText: string;
  readonly endedText: string | null;
  /**
   * P5.6 (CT §10.6 "Recover a neighborhood"): present only on a challenge starting point (the 'goalCatalog'
   * answer to recipeId CHALLENGE_TEMPLATES_REQUEST): its predicate (the region is the challenge's choice) and
   * the template's budget, tools and turn length, which the challenge editor fills in.
   */
  readonly challengeTemplate?: {
    readonly commandBudget: number;
    readonly allowedTools: readonly ChallengeToolGroup[];
    readonly horizonSeconds: 60 | 180 | 600;
    readonly predicate: { readonly type: string; readonly params: Readonly<Record<string, unknown>>; readonly durationSeconds?: number };
  };
}

/**
 * P5.6: the 'goalCatalog' request's recipeId that asks, for an open dish (targetDishId), for its challenge
 * starting points instead of its goals (src/worker/goals.ts challengeTemplates). A dish request's recipeId was
 * ignored before, so every earlier caller (recipeId null) is answered exactly as before.
 */
export const CHALLENGE_TEMPLATES_REQUEST = '#challengeTemplates';

/** P4.1: what changed in a notebook without being asked (stage 2 extends the union). */
export type NotebookChange =
  /** P4.4: a goal completed, ended, or was left (src/worker/goals.ts); the record holds the details. */
  | { readonly kind: 'goal'; readonly id: string; readonly state: GoalState }
  | { readonly kind: 'favoriteExtinct'; readonly id: string; /** An unpinned favorite removed to make room (its display name). */ readonly removed?: string }
  | { readonly kind: 'favoriteRepresentativeGone'; readonly id: string; readonly candidates: readonly number[] }
  /** P4.1 fix round 1: Undo or a rollback restored an earlier dish; the favorites were checked against it (favorites.ts reconcileFavorites). `removed`: display names of favorites whose organisms are not in the restored dish. */
  | { readonly kind: 'favoritesRestored'; readonly removed: readonly string[]; /** Older unpinned favorites removed to keep 20 (display names). */ readonly unpinnedRemoved?: readonly string[] }
  /** P4.2: a story card was recorded or joined by later evidence (`notify` false), or chosen for the one notification (`notify` true). */
  | { readonly kind: 'story'; readonly id: string; readonly notify: boolean }
  /** P4.2: Undo or a rollback removed story cards recorded in the undone time (`removed` cards). */
  | { readonly kind: 'storiesRestored'; readonly removed: number }
  /** P5.6: a succession minute entry was written (unsolicited; read in the Notebook, never a notice, toast or sound). */
  | { readonly kind: 'succession'; readonly entry: SuccessionEntry }
  /** P5.6: Undo or a rollback removed the succession entry of a minute after the restored tick (one change per entry). */
  | { readonly kind: 'successionRestored'; readonly id: string };

/** What the lineage view asks the worker to mark: a locus to band, and/or a branch to highlight. */
export interface LineageView {
  readonly locus: number | null;
  readonly branch: number | null;
}

/**
 * Per-entity lineage marks (see @sim/lineage packLineageMarks): low 3 bits = trait band 0–4 of `locus`
 * (7 = none or inactive), bit 3 = living member of `branch` or a branch descended from it.
 */
export interface LineageMarks {
  readonly locus: number | null;
  readonly branch: number | null;
  readonly marks: Uint8Array;
  readonly bandCounts: readonly number[];
  readonly inactive: number;
  readonly members: number;
}

/** Inspector data (SPEC §12.1). Built in the worker from authoritative state; no randomness. */
export interface InspectorPayload {
  readonly kind: 'entity' | 'cell' | 'gone';
  readonly entity?: EntityInspect;
  readonly cell?: CellInspect;
  /** When the selected organism no longer exists: its last known record. */
  readonly gone?: { readonly birthId: number; readonly deathTick: number; readonly cause: number; readonly divided: boolean; readonly children: readonly number[] };
}

export interface EntityInspect {
  readonly birthId: number;
  readonly entityId: number;
  readonly speciesIdx: number;
  readonly speciesId: string;
  readonly x: number;
  readonly y: number;
  readonly cell: number;
  readonly age: number;
  readonly generation: number;
  readonly parentBirthId: number;
  readonly origin: number;
  readonly B: number;
  readonly B0: number;
  readonly N: number;
  readonly E: number;
  readonly energyCap: number;
  readonly H: number;
  readonly mealC: number;
  readonly suitability: number;
  readonly lifeState: number;
  readonly flags: number;
  readonly limitCode: number;
  readonly limitValue: number;
  readonly intakeLastSecond: number;
  readonly lastIntakeTick: number;
  readonly divisionBlockers: readonly number[];
  /** Thresholds behind the division gates, computed by the simulation (for "Why did it stop?"). */
  readonly divisionNeeds: { readonly biomass: number; readonly energy: number; readonly health: number; readonly age: number };
  readonly proposalPending: boolean;
  readonly predation: { readonly code: number; readonly targetBirthId: number; readonly cooldown: number } | null;
  readonly suitFactors: { readonly ph: number; readonly warmth: number; readonly salinity: number; readonly reason: number };
  readonly profile: {
    readonly q: number;
    readonly m: number;
    readonly speed: number;
    readonly sensing: number;
    readonly minDivisionAge: number;
    readonly divisionCost: number;
    readonly ph: readonly [number, number];
    readonly warmth: readonly [number, number];
    readonly salinity: readonly [number, number];
    readonly policy: string;
    readonly foods: readonly string[];
    readonly weights: readonly number[] | null;
  };
  readonly genome: {
    readonly id: string;
    readonly loci: readonly number[];
    readonly lociActive: readonly boolean[];
    readonly ancestorLoci: readonly number[];
    readonly modules: readonly string[];
    readonly changedFromParent: boolean;
    /** The parent's recorded loci (null for a founder or when the record is not kept); G2 comprehension M2. */
    readonly parentLoci?: readonly number[] | null;
    /** The recorded loci of the founder its line began with (null when not recorded). */
    readonly founderLoci?: readonly number[] | null;
  };
  readonly foodHere: readonly { readonly food: string; readonly amount: number }[];
  /** The species' recorded diet rules in this world's ruleset (for "What does it eat?"). */
  readonly diet: {
    readonly metabolism: string;
    /** Species indices (in this dish) it can catch; empty for non-predators. */
    readonly prey: readonly number[];
    /** Native abilities recorded for the species (e.g. E_STARCH_SECRETION, PREDATION). */
    readonly abilities: readonly string[];
    readonly digestsFilm: boolean;
    /**
     * Species of this world that can put sugar into the water under its recorded rules (G2 comprehension
     * M5): `makers` make food from light and release part of it as sugar; `enzyme` turn starch into sugar.
     * Wave 13: `inLight` (present only when non-empty) lists the makers that release it only in their Photo
     * mode (mixotrophs, A04), so the words say "in light".
     */
    readonly sugarSources?: { readonly makers: readonly number[]; readonly enzyme: readonly number[]; readonly inLight?: readonly number[] };
  };
  /** Loci that act for this genome: the template's plus module activations (E03 → dormancy). */
  readonly lociActiveEffective: readonly boolean[];
  /** Energy cap without supplementary capacity (energyCap − energyCapBase is reserve-chamber room). */
  readonly energyCapBase: number;
  /** Supplementary modules carried (P2.1), each with its recorded costs. */
  readonly modules: readonly ModuleInspect[];
  /** Energy spent per second in its current state, by category (the same split stage 7 records). */
  readonly upkeep: UpkeepInspect;
  /** Dormancy state machine (SPEC §7.6), or null when it has no resting ability. */
  readonly dormancy: DormancyInspect | null;
  /** P2.2: where its line began and how it came to carry each module ("present at creation", inherited, gained). */
  readonly founderOrigin?: FounderOrigin;
  /**
   * P3.3 (W2-08): a fungal segment's network — living segments of its species, how many separate
   * threads (connected components) they form, and the size of this segment's thread. Absent otherwise.
   */
  readonly network?: { readonly segments: number; readonly threads: number; readonly thisThread: number };
  /**
   * P3.6: a segment of a species with transport links (F02): carbon it sent along its links and how many
   * linked segments received it, and what it received and from how many, over the last `windowSeconds`
   * dish seconds (src/sim/fungalTransport.ts fungalFlowOf; observation, empty again after a reload).
   */
  readonly transfer?: {
    readonly sentC: number;
    readonly sentTo: number;
    readonly receivedC: number;
    readonly receivedFrom: number;
    readonly windowSeconds: number;
  };
  /**
   * P3.3: biofilm carbon in its cell (SPEC §12.1 Details "field values"), present only in a world with
   * the film system. A tap on an occupied cell selects the organism, so this is where film under an
   * organism (e.g. the Velvet that built it) is read.
   */
  readonly filmHere?: number;
  /**
   * P3.4 (SPEC §7.5, UX §5.2 INFECTED): the virus infecting it (species index in this dish) and the
   * seconds until lysis (20 s after infection). Absent when it is not infected.
   */
  readonly infection?: { readonly speciesIdx: number; readonly secondsLeft: number };
  /**
   * P3.4 (SPEC §7.4, UX §5.2 PARASITIZED): the live parasite attached to it, with its measured drain
   * (C/s: the carbon the parasite drained in the last whole second). Absent when none is attached.
   */
  readonly parasite?: { readonly speciesIdx: number; readonly birthId: number; readonly rate: number };
  /** P3.4: for an attached parasite, the host it rides. Absent when free or not a parasite. */
  readonly host?: { readonly speciesIdx: number; readonly birthId: number };
  // ---- Phase 5 organism lines (wave 13 org-ui; D-0124). Each is optional and absent when it does not apply,
  // so a v1.0 dish's payload is exactly what it was (tests/worker/inspect-p5.test.ts).
  /** A trap owner (native TRAP, F03): its trap, read by src/sim/traps.ts trapView; absent for every other organism. */
  readonly trap?: TrapInspect;
  /** An organism a trap holds (src/sim/traps.ts heldView): HELD_IN_TRAP is derived from this, never a recorded reason. */
  readonly heldBy?: HeldInspect;
  /** A predator in a handling attempt (handlingNeed > 0 with a valid prey reference; SPEC §7.3). */
  readonly handling?: HandlingInspect;
  /**
   * Every living handler whose valid prey reference (preySlot and preyBirthId) is this organism and whose
   * handlingNeed > 0: CAPTURED_HANDLING ("Being caught.") is derived from this, never written by the simulation.
   */
  readonly beingHandled?: readonly BeingHandledInspect[];
  /** A mixotroph (A04, SPEC §7.10): its recorded metabolicMode (0 not chosen yet, 1 Photo, 2 Sugar) and the light at its cell. */
  readonly mode?: { readonly mode: number; readonly light: number };
  /** An E11 carrier or an organism holding a jacket (src/sim/jacket.ts jacketView). */
  readonly jacket?: JacketInspect;
  /** An organism with glow rules (native SIGNAL_GLOW or E02; SPEC §7.8): what it senses at its cell and its glow. */
  readonly signal?: SignalInspect;
  /**
   * A Phase 5 emitter (glow or rivalry rules): this tick's recorded secretionCode, the `secreting` bits (enzyme
   * 1/2/4, rival 8, signal 16) and which emitter's refusal the code holds when nothing was released (the last
   * emitter in the stage 8 action order), so the words name what it really emits (D-0120 carry-over).
   */
  readonly secretion?: { readonly code: number; readonly bits: number; readonly refusalOf: 'enzyme' | 'signal' | 'rival' };
  /**
   * A RIVAL target species (rivalry.ts RIVAL_TARGETS) in a cell holding rivalry chemical (SPEC §7.9; chemistry.ts
   * exposureBreakdown): the amount, the exposure it adds (0.25 × amount, halved by film), and its whole exposure
   * now (inhibitors and rival: growth factor and health loss per second, as suitability.ts applies them).
   */
  readonly rival?: { readonly amount: number; readonly exposure: number; readonly totalExposure: number; readonly growthFactor: number; readonly damagePerSecond: number };
}

/** EntityInspect.trap (src/sim/traps.ts TrapView, plus the hold time the rules use). */
export interface TrapInspect {
  readonly state: 'none' | 'armed' | 'holding' | 'cooldown';
  readonly reserveC: number;
  readonly reserveN: number;
  readonly target: { readonly birthId: number; readonly speciesIdx: number } | null;
  /** Seconds the current target has been held (0 unless holding). */
  readonly heldSeconds: number;
  /** The hold length (TRAP_HOLD_SECONDS, CT §7.1). */
  readonly holdSeconds: number;
  /** Cooldown seconds left (0 unless cooling down). */
  readonly cooldownLeft: number;
}

/** EntityInspect.heldBy (src/sim/traps.ts HeldView, plus the hold length). */
export interface HeldInspect {
  readonly ownerBirthId: number;
  readonly ownerSpeciesIdx: number;
  readonly heldSeconds: number;
  readonly holdSeconds: number;
  /** The carbon the trap owner actually took in the last whole second (its intakeLastSecond: the measured drain). */
  readonly drained: number;
}

/** EntityInspect.handling: the attempt in the predator's own columns. */
export interface HandlingInspect {
  readonly preyBirthId: number;
  readonly preySpeciesIdx: number;
  /** Seconds of contact so far (handlingProgress) and the seconds needed (handlingNeed, sampled at the attempt start). */
  readonly progress: number;
  readonly need: number;
}

/** One handler of an organism (EntityInspect.beingHandled). */
export interface BeingHandledInspect {
  readonly predatorBirthId: number;
  readonly predatorSpeciesIdx: number;
  readonly progress: number;
  readonly need: number;
}

/** EntityInspect.jacket (src/sim/jacket.ts JacketView). */
export interface JacketInspect {
  readonly mineral: number;
  /** targetPerBody × current B (0 when it no longer carries E11). */
  readonly target: number;
  /** jacketCoverage(mineral, B), 0..1. */
  readonly coverage: number;
  /** The stage 4 speed factor, 1 − speedPenalty × c (1 without E11). */
  readonly speedFactor: number;
}

/** EntityInspect.signal (src/sim/signals.ts sensedSignal and the organism's glow rules). */
export interface SignalInspect {
  /** S_GLOW / (1 + quencher) at its cell now. */
  readonly sensed: number;
  /** Glow on after sensed ≥ onThreshold for dwellSeconds; off after ≤ offThreshold (Profile.glow). */
  readonly onThreshold: number;
  readonly offThreshold: number;
  readonly dwellSeconds: number;
  readonly glowing: boolean;
}

/** One carried supplementary module and its recorded numbers (world's versioned registry). */
export interface ModuleInspect {
  readonly id: string;
  readonly name: string;
  /** Ordinary-maintenance surcharge while carried, E/s (before inherited multipliers). */
  readonly surchargePerSecond: number;
  /** Recorded parameters (e.g. E05 capacityBonus/upkeepPerSecond, E01 emitCost, E03 prepareCost). */
  readonly params: Readonly<Record<string, number>>;
  /** Whether the module's action is happening right now (E01 releasing; E03 in a dormancy state). */
  readonly activeNow: boolean;
  /** E09 only: whether this organism can itself eat broth (E09 never grants it; src/sim/moduleView.ts). */
  readonly eatsBroth?: boolean;
}

export interface UpkeepInspect {
  /** True while Resting: restMaintenance replaces every other upkeep. */
  readonly resting: boolean;
  /** Native maintenance (after inherited multipliers), E/s; the rest rate while Resting. */
  readonly maintenance: number;
  /** Module surcharges (after inherited multipliers), E/s; 0 while Resting. */
  readonly surcharge: number;
  /** Separate upkeep (E05 chamber), E/s; 0 while Resting. */
  readonly chamber: number;
  /** E04 attached upkeep, E/s; present only while anchored (P3.7). */
  readonly anchor?: number;
  /** E12 link upkeep, E/s (0.01 per incident colony link); present only while linked (P3.7). */
  readonly links?: number;
}

export interface DormancyInspect {
  /** 'native' (B12, F04, P08) or 'E03'. */
  readonly source: string;
  /** Life state: 0 Active, 1 Preparing, 2 Resting, 3 Waking. */
  readonly state: number;
  /** Reason code for the current rest (RESTING_FOOD_SCARCE / RESTING_DRY / RESTING_NEWBORN, D-0106), or NONE while Active. */
  readonly cause: number;
  /** Seconds elapsed in Preparing/Waking; seconds the wake conditions have held while Resting. */
  readonly stateSeconds: number;
  readonly lockoutSeconds: number;
  /** While Active: seconds without usable intake, and the trigger it must reach. */
  readonly noIntakeSeconds: number;
  readonly triggerSeconds: number;
  /** While Active: seconds with moisture suitability below drySuitability, and the trigger. */
  readonly drySeconds: number;
  readonly dryTriggerSeconds: number;
  /**
   * Current wake conditions (evaluated at its cell now). `attachable` (additive, no protocol bump) only for a
   * resting newborn (D-0106: her cell offers one of her surfaces; @sim/dormancy wakeConditions).
   */
  readonly wake: { readonly food: boolean; readonly moisture: boolean; readonly environment: boolean; readonly attachable?: boolean };
  readonly rules: {
    readonly prepareSeconds: number;
    readonly prepareCost: number;
    readonly restMaintenance: number;
    readonly damageFactor: number;
    readonly wakeSeconds: number;
    readonly wakeCost: number;
    readonly wakeMinEnergy: number;
    readonly lockoutSeconds: number;
    readonly entryMinEnergy: number;
    readonly wakeConditionSeconds: number;
  };
  /**
   * The dormancy state reason (SPEC §12.2 States) read from the saved clocks by @sim/dormancy
   * dormancyReason: PREPARING / RESTING_* / WAKING, DORMANCY_LOCKOUT (value = lockout seconds left;
   * restHeld = a due rest waits only for the lockout) or NONE.
   */
  readonly reason: { readonly code: number; readonly value: number; readonly restHeld: boolean };
}

/**
 * P3.8 (D-0039; src/worker/relationships.ts): one relationship first seen in a played dish, from recorded
 * state only. `relationshipId` is `<kind>:<actor species id>:<target>`: kinds eats (target a pool),
 * catches, infects, attaches, bursts, drains (target a species id) and converts (target an enzyme:
 * starch, oil or protein).
 */
export interface RelationshipSeen {
  readonly relationshipId: string;
  /** Simulated second of the tick it was first seen in (floor(tick / 10)). */
  readonly second: number;
  /** The event that showed it, when an event did (capture, lysis or drain death). */
  readonly eventId?: number;
}

/** How a living family member is related to the organism asked about. */
export type FamilyRelation = 'parent' | 'ancestor' | 'child' | 'descendant' | 'sibling' | 'relative';

export interface FamilyMember {
  readonly birthId: number;
  readonly entityId: number;
  readonly speciesIdx: number;
  readonly x: number;
  readonly y: number;
  readonly generation: number;
  readonly relation: FamilyRelation;
  /** Generations from the asked-about organism up to the closest shared ancestor. */
  readonly stepsUp: number;
  /** Generations from that shared ancestor down to this member. */
  readonly stepsDown: number;
}

/**
 * Living members of an organism's family: every living organism descended from the same
 * introduced founder (its lineage root), found by walking recorded parent links. Built from
 * lineage records only; no randomness, no mutation of state.
 */
export interface FamilyAnswer {
  readonly birthId: number;
  readonly tick: number;
  /** Whether the organism asked about is itself alive. */
  readonly alive: boolean;
  /** The organism's parent record, if any (0 when it was introduced). */
  readonly parent: { readonly birthId: number; readonly alive: boolean; readonly divided: boolean } | null;
  /** Oldest retained ancestor: the introduced founder unless older records were compacted. */
  readonly rootBirthId: number;
  readonly rootIntroduced: boolean;
  /** True when the chain reaches compacted history, so the family may be larger than shown. */
  readonly historyIncomplete: boolean;
  /** Closest first (stepsUp + stepsDown, then birthId); at most FAMILY_MAX_MEMBERS. */
  readonly members: readonly FamilyMember[];
  /** Every living family member, excluding the organism itself. */
  readonly livingTotal: number;
}

export const FAMILY_MAX_MEMBERS = 200;

export interface CellInspect {
  readonly cell: number;
  readonly x: number;
  readonly y: number;
  readonly substrate: string;
  readonly structure: string;
  readonly fields: Readonly<Record<string, number>>;
  readonly ph: number;
  readonly light: number;
  readonly residents: readonly { readonly birthId: number; readonly speciesId: string }[];
  readonly load: number;
  /** P3.1 (SPEC §12.1): the salinity index (the salt amount, unclamped). */
  readonly salinity?: number;
  /** P3.1: dissolved oxygen in the cell (shown even at 0). */
  readonly oxygen?: number;
  /** P3.1 (SPEC §4.4): the light factors, effective light = clamp(baseline × shade, 0, 1). */
  readonly lightBase?: number;
  readonly shade?: number;
  /**
   * P3.1 (SPEC §4.3; CT §3.4): inhibitor exposure an organism of each targeted category has here (the
   * amount, × 0.5 once when the cell holds film), with its growth factor and health loss per second.
   * Absent when the world records no inhibitors.
   */
  readonly exposure?: {
    readonly filmHalves: boolean;
    readonly lines: readonly {
      readonly category: 'bacterial' | 'fungal' | 'photosynthetic';
      readonly amount: number;
      readonly exposure: number;
      readonly growthFactor: number;
      readonly damagePerSecond: number;
    }[];
    /**
     * Protocol 3 (e2-signals, chemistry.ts exposureBreakdown): the rival toxin here, present only when the
     * world has the rival field and the amount is > 0; `targets` are the species ids it acts on.
     */
    readonly rival?: { readonly amount: number; readonly exposure: number; readonly targets: readonly string[] };
  };
  /**
   * P3.6 reaction ledger (SPEC §12.1, §5.3): one row per enzyme with activity or conversion in this
   * cell (src/worker/snapshot.ts reactionRows). Absent when the world records no enzymes.
   */
  readonly reactions?: readonly ReactionRow[];
  /**
   * P3.6 (SPEC §5.1): the finite food object in this cell, if any: its kind ('pellet' | 'wafer') and
   * what it still holds, carbon per pool and bound nutrient (game units). Absent when the cell has none.
   */
  readonly object?: {
    readonly id: number;
    readonly kind: string;
    readonly pools: { readonly sugar?: number; readonly starch?: number; readonly protein?: number };
    readonly n: number;
  };
  /**
   * Protocol 3 (SPEC §4.4, §4.7, §4.8, §12.1), present only when the world records 'climate': local warmth
   * (the array's value, else the ambient setting), the ambient setting, moisture (derived.moisture) and
   * whether each comes from an allocated local array.
   */
  readonly climate?: CellClimate;
  /**
   * Protocol 3 (SPEC §4.4 "The inspector shows every factor"): what chemistry.ts lightFactors returns beyond
   * baseline and shade (lightBase and shade above) — the cycle phase, the roof and the canopy factor — present
   * only when it returns any of them (a world recording 'climate', an S11 or a CANOPY species). The light it
   * describes is the last completed stage 2's (D-0113).
   */
  readonly lightFactors?: CellLightFactors;
  /** Protocol 3: every edge barrier on the cell's four sides, in N, E, S, W order; absent when none. */
  readonly edges?: readonly CellEdgeLine[];
  /** Protocol 3: the furnishing or device on the cell; absent when none. */
  readonly device?: CellDeviceLine;
}

export interface CellClimate {
  readonly warmth: number;
  readonly ambientWarmth: number;
  readonly warmthLocal: boolean;
  readonly moisture: number;
  readonly moistureLocal: boolean;
}

export interface CellLightFactors {
  readonly cycle?: { readonly phase: 'day' | 'dusk' | 'night' | 'dawn'; readonly factor: number; readonly secondsIntoPhase: number };
  readonly roof?: number;
  readonly canopy?: number;
}

/** One edge barrier beside an inspected cell (CellInspect.edges). */
export interface CellEdgeLine {
  readonly id: number;
  readonly kind: 'S01' | 'S02' | 'S03' | 'S04';
  /** Which side of this cell it lies on. */
  readonly side: 'N' | 'E' | 'S' | 'W';
  /** The cell across the edge. */
  readonly neighbour: number;
  /** The barriers.ts edge code (EDGE_S01 … EDGE_CHANNEL; no EDGE_FLOW_BACK bit). */
  readonly code: number;
  /** S03 only. */
  readonly open?: boolean;
  /** S04 only: 'out' carries from this cell to the neighbour, 'in' from the neighbour to this cell. */
  readonly flow?: 'out' | 'in';
  /** The gate's cumulative tally (world.gateTally, observation only), or null before its first amount. */
  readonly tally: { readonly fields: Readonly<Record<string, number>>; readonly organisms: number } | null;
}

/** The furnishing or device on an inspected cell (CellInspect.device). */
export interface CellDeviceLine {
  readonly id: number;
  readonly kind: 'S05' | 'S06' | 'S07' | 'S08' | 'S09' | 'S10' | 'S11' | 'S12';
  /** S09/S10 only. */
  readonly on?: boolean;
  /** S08 only: its selection, what it holds per target, and min(1, Σ bound / RESIN_CAPACITY). */
  readonly resinSelect?: readonly string[];
  readonly bound?: Readonly<Record<string, number>>;
  readonly saturation?: number;
}

/** One enzyme's line in the cell inspector's reaction ledger (P3.6). Carbon amounts are game units. */
export interface ReactionRow {
  readonly enzyme: 'starch' | 'oil' | 'protein';
  /** The product field this enzyme makes (sugar, metabolite, broth). */
  readonly product: 'sugar' | 'metabolite' | 'broth';
  /** Enzyme activity in the cell, and activity / (1 + breaker). */
  readonly activity: number;
  readonly effectiveActivity: number;
  readonly breaker: number;
  /** Substrate carbon present in the cell now. */
  readonly substrate: number;
  /** In this cell during the last whole second: substrate carbon converted (= product carbon made) and bound nutrient moved. */
  readonly converted: number;
  readonly nMoved: number;
  /** The same over the whole dish, and the dish's cumulative conversion (world.conversionTotals). */
  readonly dishConverted: number;
  readonly dishNMoved: number;
  readonly cumulative: number;
  /** Species ids of living producers that released this enzyme in the last tick, in the cell or a four-neighbour (empty: "Enzyme present"). */
  readonly madeBy: readonly string[];
}

export type FromWorker =
  /** `kept` (D-0033): how the dish that was open was kept first, when the request carried keepFrom. */
  | { readonly type: 'ready'; readonly requestId: number; readonly info: DishInfo; readonly kept?: WhatIfKept }
  | SnapshotMsg
  | { readonly type: 'ack'; readonly requestId: number; readonly dishId: string; readonly result: CommandResult | null; readonly error?: string }
  | { readonly type: 'saved'; readonly requestId: number; readonly dishId: string; readonly json: string; readonly hash: string; readonly tick: number }
  | { readonly type: 'hash'; readonly requestId: number; readonly dishId: string; readonly hash: string; readonly tick: number }
  | { readonly type: 'history'; readonly requestId: number; readonly dishId: string; readonly seconds: unknown; readonly minutes: unknown; readonly compacted: boolean }
  /** P4.3: the answer to 'sessionSummary' (read-only). */
  | { readonly type: 'sessionSummary'; readonly requestId: number; readonly dishId: string; readonly summary: SessionSummary }
  /** P4.4: the answer to 'goalCatalog' (catalog order). */
  | { readonly type: 'goalCatalog'; readonly requestId: number; readonly goals: readonly GoalOffer[] }
  /** P4.7: the answer to 'trySetup': the goals offered (with durations) and why it cannot start here (null: it can). */
  | { readonly type: 'trySetup'; readonly requestId: number; readonly dishId: string; readonly goals: readonly TryGoalOption[]; readonly refusal: string | null }
  /** P4.7: a turn opened (paused, at its start tick). `kept`: how the dish open before turn 1 was kept (D-0033). */
  | { readonly type: 'tryStarted'; readonly requestId: number; readonly info: DishInfo; readonly turn: TurnRecord; readonly kept?: WhatIfKept }
  /** P4.7: a Try my dish request was refused; nothing was changed. */
  | { readonly type: 'tryRefused'; readonly requestId: number; readonly code: TryRefusalCode; readonly message: string }
  /** P4.7: a turn dish's record changed (an answer to 'tryFinish', or unsolicited: kept, or Undo took it below its horizon). */
  | { readonly type: 'tryTurn'; readonly requestId?: number; readonly dishId: string; readonly turn: TurnRecord | null }
  /** P4.7 (unsolicited): a turn reached its horizon; the dish was paused. `goal`: this turn's goal attempt (null: free observation). */
  | { readonly type: 'tryHorizon'; readonly dishId: string; readonly turn: TurnRecord; readonly elapsedTicks: number; readonly goal: GoalRecord | null }
  /** P4.8c: a challenge was saved; `record`: the dish's notebook now. */
  | { readonly type: 'challengeSaved'; readonly requestId: number; readonly dishId: string; readonly record: NotebookRecord; readonly challenge: ChallengeRecord }
  /** P4.8c: the challenge file to download. */
  | { readonly type: 'challengeExported'; readonly requestId: number; readonly text: string; readonly filename: string }
  /** P4.8c: the answer to a 'challengeStart' check (null: it can start). */
  | { readonly type: 'challengeChecked'; readonly requestId: number; readonly dishId: string; readonly refusal: string | null }
  /** P4.8c: a challenge turn opened (paused, at its baseline tick). `kept`: how the open dish was kept first (D-0033). */
  | { readonly type: 'challengeStarted'; readonly requestId: number; readonly info: DishInfo; readonly turn: TurnRecord; readonly kept?: WhatIfKept }
  /** P4.8c: a challenge request was refused; nothing was changed. */
  | { readonly type: 'challengeRefused'; readonly requestId: number; readonly message: string }
  /** P4.8c (unsolicited, besides the command's ack): a command a challenge turn refused; the dish is unchanged. */
  | { readonly type: 'challengeBlocked'; readonly dishId: string; readonly message: string }
  /** P4.8b: a snapshot bookmark's stored moment is gone or could not be read (the bookmark text is kept; nothing changed). */
  | { readonly type: 'bookmarkGone'; readonly requestId: number; readonly id: string; readonly message: string }
  /** P4.8b: the answer to 'storageInfo', and to 'storageRemove' (`removed`: the record was removed). */
  | { readonly type: 'storageInfo'; readonly requestId: number; readonly storage: StorageInfo; readonly removed?: boolean }
  /** P2.8: a recorded regional trait series; `available` lists, per species, the loci that have records. */
  | {
      readonly type: 'traitHistory';
      readonly requestId: number;
      readonly dishId: string;
      readonly series: RegionalTraitSeries;
      readonly available: readonly (readonly number[])[];
      /** The world's recorded locus names (content/loci.json as this dish recorded it). */
      readonly loci: readonly { readonly index: number; readonly name: string }[];
      /** Seconds at which the player changed the dish, from recorded history (history.interventionSeconds). */
      readonly interventions?: readonly number[];
    }
  /** P2.8: the dish's journal entries (after journalPut, `stored` says whether the entry was kept with the dish). */
  | { readonly type: 'journal'; readonly requestId: number; readonly dishId: string; readonly entries: readonly DishJournalEntry[]; readonly stored?: boolean }
  /**
   * Unsolicited (P2.8): an automatic checkpoint of `dishId` at `tick` was written (`ok`), or it was not
   * ('storage-full', 'write-failed', or 'busy' while the previous one was still being written): then
   * nothing changed and the `kept` older checkpoints are all still there.
   */
  | { readonly type: 'checkpoint'; readonly dishId: string; readonly tick: number; readonly ok: boolean; readonly reason?: 'storage-full' | 'write-failed' | 'busy'; readonly kept: number; readonly slot?: SlotSummary }
  /**
   * A request or a running dish failed. `paused` is true only when the worker paused that dish (at its
   * last valid state) because of this error; `request` names the request that failed (absent for a
   * failure while the dish ran). The UI words the error by what really happened (ARCH §7).
   */
  | {
      readonly type: 'error';
      readonly dishId: string;
      readonly requestId?: number;
      readonly message: string;
      readonly lastValidTick: number;
      readonly kind?: string;
      readonly paused?: boolean;
      readonly request?: ToWorker['type'];
    }
  | {
      readonly type: 'slotSaved';
      readonly requestId: number;
      /** The slot as it now stands (for an autosave that wrote nothing, Continue as it already was). */
      readonly slot: SlotSummary;
      /**
       * Whether anything was written. A manual save always writes. An autosave (D-0033 fix round 3) writes
       * Continue unless Continue already holds exactly the file it would write (host `autosave`; store
       * `holdsSave`): then `wrote` is false and the store is unchanged.
       */
      readonly wrote: boolean;
    }
  | { readonly type: 'slots'; readonly requestId: number; readonly slots: readonly SlotSummary[]; readonly persistent: boolean }
  | {
      readonly type: 'loaded';
      readonly requestId: number;
      readonly info: DishInfo;
      readonly usedPredecessor: boolean;
      /** P2.8: set when an automatic checkpoint was opened as a new branch (the dish it came from, and its moment). */
      readonly branch?: { readonly fromName: string; readonly tick: number };
      /** D-0033: how the dish that was open was kept first, when the request carried keepFrom. */
      readonly kept?: WhatIfKept;
      /** P4.1 (D-0070): the file's notebook could not be read and was left out (the dish loaded). */
      readonly notebookDropped?: string;
    }
  | { readonly type: 'exported'; readonly requestId: number; readonly text: string; readonly filename: string }
  /**
   * P4.6: the answer to 'recipeExport': the file, and what the Share sheet shows of it (the start's own
   * name, the offline identifier for a bundled start, else null, and the versions it needs).
   */
  | {
      readonly type: 'recipeExported';
      readonly requestId: number;
      readonly text: string;
      readonly filename: string;
      readonly name: string;
      readonly question: string | null;
      readonly identity: string | null;
      readonly versions: { readonly simulationVersion: number; readonly evolutionRulesVersion: number; readonly contentVersion: number; readonly contentHash: string };
    }
  | { readonly type: 'family'; readonly requestId: number; readonly dishId: string; readonly family: FamilyAnswer }
  /**
   * P4.1: the dish's notebook record after a 'notebookGet' or 'favorite' request. `refused`: the op was not
   * applied (readable). `removed`: an unpinned favorite removed to make room (its display name).
   * `inspected`: the organism 'notebookGet' asked about, when alive.
   */
  | {
      readonly type: 'notebook';
      readonly requestId: number;
      readonly dishId: string;
      readonly record: NotebookRecord;
      readonly refused?: string;
      readonly removed?: string;
      readonly inspected?: EntityInspect | null;
    }
  /** P4.1: unsolicited — a followed family's representative left, or its last member did. */
  | { readonly type: 'notebookChanged'; readonly dishId: string; readonly record: NotebookRecord; readonly change: NotebookChange }
  /** P3.8: every relationship the dish's watcher has seen since the dish was opened in this session. */
  | {
      readonly type: 'relationships';
      readonly requestId: number;
      readonly dishId: string;
      readonly worldId: string;
      readonly dishName: string;
      readonly entries: readonly RelationshipSeen[];
    }
  /** P4.8: the relationship map (src/worker/relationshipMap.ts). */
  | { readonly type: 'relationshipMap'; readonly requestId: number; readonly dishId: string; readonly map: RelationshipMapData }
  /** P4.8: the region probes' masks and readings (src/worker/probes.ts); `refused` when a probeSet was not taken (nothing changed). */
  | { readonly type: 'probes'; readonly requestId: number; readonly dishId: string; readonly masks: readonly ProbeMask[]; readonly readings: ProbeReadings; readonly refused?: string }
  | { readonly type: 'lineage'; readonly requestId: number; readonly dishId: string; readonly lineage: LineageAnswer }
  | { readonly type: 'done'; readonly requestId: number }
  /** Comparison status; unsolicited (no requestId) while running and when it completes. */
  | { readonly type: 'compareState'; readonly requestId?: number; readonly state: ComparisonState }
  /** What if? choices, previews and the keep plan (P2.6). */
  | { readonly type: 'whatIf'; readonly requestId: number; readonly answer: WhatIfAnswer }
  /** A What if? dish was started (paused) after the previous dish was kept as `kept` says. */
  | { readonly type: 'whatIfStarted'; readonly requestId: number; readonly info: DishInfo; readonly kept: WhatIfKept }
  /**
   * A What if? request was refused: `message` is readable as-is and nothing was started, saved or
   * changed. An expected answer, not a failure of the dish (so it never raises the error toast).
   */
  | { readonly type: 'whatIfRefused'; readonly requestId: number; readonly code: WhatIfRefusalCode; readonly message: string }
  /** The experiment cards this build ships (P2.5). */
  | { readonly type: 'experimentCatalog'; readonly requestId: number; readonly cards: readonly ExperimentCardView[] }
  /** A card started: its new paused dish, and for a paired card its comparison (setup, change on B). */
  | { readonly type: 'experimentStarted'; readonly requestId: number; readonly cardId: string; readonly info: DishInfo; readonly compare: ComparisonState | null; readonly kept?: WhatIfKept }
  /** P4.5: a Garden variant pair opened: the idea's new paused dish and the comparison (setup; `variantPair` set). */
  | { readonly type: 'variantPairStarted'; readonly requestId: number; readonly info: DishInfo; readonly compare: ComparisonState; readonly kept?: WhatIfKept }
  /** D-0033: the answer to keepPlan. */
  | { readonly type: 'keepPlan'; readonly requestId: number; readonly plan: WhatIfPlan }
  /**
   * D-0033: an action that replaces the open dish was refused because the open dish could not be kept
   * first: all ten slots used ('slots-full'), no saving on this device ('save-unavailable'), the write
   * failed ('save-failed'), or the chosen slot cannot be used ('failed'). `message` is readable as-is;
   * nothing was started, opened, imported, saved or changed, and the open dish keeps its run state.
   * `exclude` names a slot the player's replacement choice may not use (the save being opened).
   * `name`: the dish that could not be kept; `fromContinue`: it is the dish Continue holds (no dish was open).
   */
  | {
      readonly type: 'keepRefused';
      readonly requestId: number;
      readonly code: KeepRefusalCode;
      readonly message: string;
      readonly exclude: string | null;
      readonly name: string;
      readonly fromContinue?: true;
    }
  /** Unsolicited: a running card reached its observation gate and every listed player step was taken. */
  | { readonly type: 'experimentStamp'; readonly dishId: string; readonly stamp: ExperimentStampMsg }
  /**
   * Unsolicited: a single-arm card's measured gate held at `reachedAtSecond`, and its Journal stamp
   * (recorded at that moment) waits for the player steps in `missing` (card order). Posted when the
   * gate holds and again whenever a step is taken while others remain; the stamp follows the last one.
   */
  | { readonly type: 'experimentWaiting'; readonly dishId: string; readonly cardId: string; readonly reachedAtSecond: number; readonly missing: readonly PlayerStep[] }
  /**
   * Unsolicited: a card's observation ended without a stamp. A single-arm card's dish was changed by a
   * command before its gate ('changed'), stopped with an error ('failed'), or rewound with Undo before
   * its gate ('undone': the observer cannot rewind with it); or a dish made from a card was opened
   * again from a save or a file ('closed': the observation ended when the dish was closed, because
   * observer history is worker state and is not saved).
   */
  | { readonly type: 'experimentEnded'; readonly dishId: string; readonly cardId: string; readonly reason: ExperimentEndReason }
  /** Reply to newDishPreview (P2.2). */
  | { readonly type: 'newDishPreview'; readonly requestId: number; readonly preview: NewDishPreview }
  /** P3.5: Begin paused the dish; `hash` is its stateHash at that moment (Cancel returns to it exactly). */
  | { readonly type: 'sampleBegun'; readonly requestId: number; readonly dishId: string; readonly hash: string; readonly tick: number }
  | { readonly type: 'samplePreview'; readonly requestId: number; readonly dishId: string; readonly preview: SamplePreview }
  /** P3.5: Cancel restored the dish; `beginHash` is the hash Begin recorded (null after a reload). */
  | { readonly type: 'sampleCancelled'; readonly requestId: number; readonly dishId: string; readonly hash: string; readonly tick: number; readonly beginHash: string | null };

/** Why a card's observation ended without a stamp (see the experimentEnded packet). */
export type ExperimentEndReason = 'changed' | 'failed' | 'undone' | 'closed';

/**
 * A journal stamp as the worker reports it (P2.5): the card's stamp record (card, seed, recipe and
 * content versions, the gate's measured values) plus the card's own measurements at that moment.
 */
export interface ExperimentStampMsg {
  readonly stamp: JournalStamp;
  readonly title: string;
  readonly label: string;
  /** Recipe labels (e.g. "Seeded traits demonstration"). */
  readonly labels: readonly string[];
  readonly measured: { readonly A: Readonly<Record<string, number>>; readonly B: Readonly<Record<string, number>> | null };
}

// ---------------------------------------------------------------------------------------------
// What if? (P2.6; SPEC §13.3, UX §3.4, D09 §4–§5)

/**
 * Why a What if? request was refused: all ten slots used ('slots-full'), the keep write failed
 * ('save-failed') or this device cannot save ('save-unavailable'); the dish is not a What if? dish or
 * has no ideas ('not-variant'); the new dish id is taken ('in-use'); or the variant itself was refused
 * (the codes of @sim/variants VariantError: 'unknown-variant', 'changed', 'invalid-patch', …).
 */
/** P4.11 DEMO_MODE: the error kind of a world the demo cannot hold (its message is the capability reason). */
export const DEMO_REFUSAL_KIND = 'demo';

export type WhatIfRefusalCode = 'slots-full' | 'save-failed' | 'save-unavailable' | 'not-variant' | 'in-use' | 'failed' | VariantErrorCode;

/** Which variant to start: a chosen one, the same one again, or the next in catalog order. */
export type WhatIfPick =
  | { readonly kind: 'variant'; readonly variantId: string }
  /** Rebuild the variant `fromDishId` was made from (identical start, new world id). */
  | { readonly kind: 'again' }
  /** The next supported variant of the same source after the one `fromDishId` was made from. */
  | { readonly kind: 'another' };

/**
 * How the current dish is kept before a new one opens. 'auto': its own named slot, else the first free
 * one (refused with kind 'slots-full' when all ten are used). 'replace': a named slot the player chose
 * deliberately. 'exported': the player exported it as a file, so no slot is written. Every choice
 * also updates the autosave (Continue).
 */
export type WhatIfKeep = { readonly kind: 'auto' } | { readonly kind: 'replace'; readonly slotId: string } | { readonly kind: 'exported' };

/**
 * D-0033 fix round 1: set on a plan (and a kept result) about the dish Continue holds, when no dish is
 * open (after a relaunch Home offers that dish as the player's own). It is kept by the same rules; the
 * autosave is never written for it (it already holds it).
 */
interface AboutContinue {
  readonly fromContinue?: true;
}

/** How the current dish would be kept on 'auto' (shown before Start). */
export type WhatIfPlan =
  /** No dish is open (and Continue holds none to keep). */
  | { readonly kind: 'none' }
  /**
   * Still exactly its recorded start, and this build rebuilds it exactly: nothing to keep. A What if?
   * dish (no `seed`: "starting that idea again"), or, D-0033 fix round 1, a recipe, New Dish or
   * experiment start (`seed`: the same start with this seed rebuilds it).
   */
  | ({ readonly kind: 'unchanged'; readonly name: string; readonly seed?: number } & AboutContinue)
  /**
   * D-0033: already in its own slot exactly as it is now (the file a save would write has the same
   * checksummed state and name as the slot's current record): nothing is written.
   */
  | ({ readonly kind: 'saved'; readonly slotId: string; readonly name: string } & AboutContinue)
  /** Saved to this named slot (`own`: the slot it was opened from or last saved to). */
  | ({ readonly kind: 'slot'; readonly slotId: string; readonly own: boolean; readonly name: string } & AboutContinue)
  /** All ten named slots are used by other saves. */
  | ({ readonly kind: 'full'; readonly name: string } & AboutContinue)
  /** This device cannot save. */
  | { readonly kind: 'unavailable'; readonly name: string };

/** What happened to the previous dish when a What if? dish started. */
export interface WhatIfKept extends AboutContinue {
  /** 'saved' (D-0033): its own slot already held it exactly as it was, so nothing was written. */
  readonly kind: 'none' | 'unchanged' | 'saved' | 'slot' | 'exported';
  /** The named slot written ('slot') or already holding it ('saved'), with `replaced` naming the save it replaced, if any. */
  readonly slot: SlotSummary | null;
  readonly replaced: string | null;
  /** D-0033 fix round 1: the simulated moment of the save it replaced (tells two saves of one name apart). */
  readonly replacedTick?: number;
  readonly name: string | null;
  /**
   * The autosave (Continue) now holds the previous dish. False if that write failed (the rest stands).
   * For the dish Continue itself holds (`fromContinue`, D-0033 fix round 2): true when Continue was
   * written again, the same file bound to the named slot just written; false when no slot was written
   * (it was exported: Continue is left exactly as it was) or that write failed.
   */
  readonly autosaved: boolean;
}

// ---------------------------------------------------------------------------------------------
// D-0033: every action that replaces the open dish keeps it first, through What if?'s keep flow.

/**
 * Keep the open dish `dishId` before the new one opens: `keep` as for What if? ('auto': its own named
 * slot, else the first empty one; 'replace': a named slot the player chose; 'exported': no slot).
 * The new dish is prepared first (a refusal there keeps and changes nothing); a keep that cannot be
 * done answers `keepRefused` and nothing is opened. `dishId` null (fix round 1): no dish is open, so
 * the dish Continue holds is kept by the same rules (nothing when Continue is empty or is what opens).
 */
export interface KeepFrom {
  readonly dishId: string | null;
  readonly keep: WhatIfKeep;
}

/** Why keeping the open dish refused its replacement (see the keepRefused packet). */
export type KeepRefusalCode = 'slots-full' | 'save-failed' | 'save-unavailable' | 'failed';

/** One What if? choice: the pure preview plus its cells before/after and the record checksums. */
export interface WhatIfChoice {
  readonly preview: VariantPreview;
  /** The changed patch's cells in the source and in the variant (row-major cell indices). */
  readonly oldCells: readonly number[];
  readonly newCells: readonly number[];
  readonly sourceChecksum: string;
  readonly variantChecksum: string;
}

/** The source recipe's layout, for drawing the small before/after preview (recorded values only). */
export interface WhatIfLayout {
  readonly patches: readonly { readonly index: number; readonly center: readonly [number, number]; readonly radius: number; readonly label: string | null }[];
  readonly founders: readonly { readonly speciesId: string; readonly name: string; readonly count: number; readonly center: readonly [number, number]; readonly radius: number }[];
}

export interface WhatIfAnswer {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceQuestion: string | null;
  /** At most three, in catalog order (UX §3.4). */
  readonly choices: readonly WhatIfChoice[];
  readonly layout: WhatIfLayout;
  /** The asked-about dish's variant record when it is a What if? dish; `atStart` = still exactly at its recorded start. */
  readonly current: (VariantRecord & { readonly atStart: boolean }) | null;
  /** "Another idea" for the current variant dish (catalog order), or null. */
  readonly next: { readonly id: string; readonly title: string; readonly question: string; readonly previewDifference: string } | null;
  readonly plan: WhatIfPlan;
  /**
   * UX §3.3 registry label of the world a choice would build (this build's manifest), by the same rule
   * as DishInfo.manifestLabel, for the choice's Details.
   */
  readonly registryLabel: string;
}

/**
 * A world's recorded module registry (P2.2, UX §3.3). `partial` is true while the world enables fewer
 * modules than the full catalog this build knows (`catalogSize`): such a world is described as
 * "Core prototype — quantitative evolution".
 */
export interface RegistryInfo {
  readonly moduleRegistryVersion: number;
  readonly evolutionRulesVersion: number;
  readonly modules: readonly { readonly id: string; readonly name: string }[];
  readonly catalogSize: number;
  readonly partial: boolean;
  /** Simulation systems the manifest enables (read-only in New Dish → Content). */
  readonly systems: readonly string[];
}

/** New Dish summary (P2.2, UX §2.3): exactly what a dish with these choices would start with. */
export interface NewDishPreview {
  readonly recipeId: string;
  readonly recipeName: string;
  /**
   * The habitat as the Field Guide names and summarizes it; `rules` is its guide's rules text (what
   * every cell is preloaded with) and `grid` its substrate and structure layout (@sim/recipes
   * habitatGrid; CELL_COUNT cells, SUB_* and ST_* codes) for the preview map (P3.2).
   */
  readonly habitat: {
    readonly name: string;
    readonly summary: string;
    readonly rules?: string;
    readonly grid?: { readonly substrate: Uint8Array; readonly structure: Uint8Array };
    /**
     * Phase 5 P5.4 (wave 14, D-0128): what the habitat places, one entry per placed structure kind and per
     * object material, in habitat order (edges by kind, devices and furnishings by kind, objects by
     * material), with the realized count (H04: S06 Attachment mesh 197, S07 Nutrient basket 2, M11 Leaf
     * wafer 2). Absent when the habitat places nothing (every v1.0 start).
     */
    readonly uses?: readonly { readonly id: string; readonly name: string; readonly count: number }[];
    /** Phase 5 P5.4: the habitat's regions in record order (`number` 1-based, as the pins show it). Absent when it records none. */
    readonly regions?: readonly { readonly id: string; readonly label: string; readonly number: number }[];
  };
  readonly seed: number;
  readonly mutationPreset: string;
  readonly founderMode: string;
  readonly empty: boolean;
  /** Per-daughter chances the dish would start with. */
  readonly rates: MutationRates;
  readonly developmentalEnabled: boolean;
  /** Founders by species in recipe order: how many, how many can carry an extra ability, how many start with one (present at creation). */
  readonly founders: readonly {
    readonly speciesId: string;
    readonly name: string;
    readonly count: number;
    readonly eligible: number;
    readonly withModule: number;
    readonly modules: readonly { readonly id: string; readonly name: string; readonly count: number }[];
  }[];
  /** The recipe's food and debris patches (labels), as placed. */
  readonly patches: readonly string[];
  /** Carbon, nutrient and mineral at tick 0: the habitat's own, what the recipe adds, and the total (game units). */
  readonly ledger: {
    readonly habitat: { readonly c: number; readonly n: number; readonly m: number };
    readonly added: { readonly c: number; readonly n: number; readonly m: number };
    readonly total: { readonly c: number; readonly n: number; readonly m: number };
  };
  readonly registry: RegistryInfo;
  /** P4.3: the start's thumbnail (src/worker/thumbnail.ts): the Play shelf's live-state picture. */
  readonly thumb?: string;
  /**
   * Protocol 3 (P5.1 New Dish Environment): the realized preview world's lid, light mode and drying (the
   * overrides, else the recipe's, else the habitat's), for the Environment group's defaults.
   */
  readonly environment: { readonly lid: 'open' | 'closed'; readonly lightMode: 'fixed' | 'cycle'; readonly drying: boolean };
  /** Protocol 3: whether the realized preview world records the 'climate' system (light cycle, drying). */
  readonly climate: boolean;
  /**
   * Phase 5 P5.4 (wave 14, D-0128): true only when the realized dish includes its habitat's Suggested
   * Community (RecipeOverrides.community); absent otherwise (every v1.0 start).
   */
  readonly community?: boolean;
  /**
   * Phase 5 P5.4: the Suggested Community's groups in record order, with the number actually placed and
   * the region's label ("5 Sporeveil in Under the roof"). Present only with `community: true`.
   */
  readonly communityGroups?: readonly { readonly speciesId: string; readonly name: string; readonly count: number; readonly regionLabel: string }[];
}

/** P4.7: a goal offered for a Try my dish turn, with its predicate's duration (null: none). */
export interface TryGoalOption extends GoalOffer {
  readonly durationSeconds: number | null;
}

/**
 * P4.7: why a Try my dish request was refused: 'not-here' (a comparison copy, a held sample, a failed dish,
 * no storage), 'bad-request' (turn length or goal), 'shelf' (the shelf refused the baseline), 'unsaved' (the
 * turn is not kept and Discard was not confirmed), 'baseline-missing', 'no-turn' (not a turn dish, or not at
 * its horizon).
 */
export type TryRefusalCode = 'not-here' | 'bad-request' | 'shelf' | 'unsaved' | 'baseline-missing' | 'no-turn';
