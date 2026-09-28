/**
 * Worker protocol (ARCH §7–§8), versioned. The worker owns every world; the main thread only ever
 * holds snapshots. Commands carry a stable commandId; the worker stamps targetTick and seq.
 */
import type { CommandPayload, CommandResult } from '@sim/commands';
import type { WorldState } from '@sim/serialize';
import type { FieldId } from '@sim/fields';
import type { CompareSpeed, ComparisonState } from './comparison';
import type { LineageAnswer } from '@sim/lineage';

export const PROTOCOL_VERSION = 1;

/** Every packet in both directions carries the protocol version (ARCH §7). */
export interface Envelope {
  readonly protocolVersion: number;
}

export function stamp<T extends object>(msg: T): T & Envelope {
  return { ...msg, protocolVersion: PROTOCOL_VERSION };
}

export type Speed = 0 | 1 | 2 | 4;

/** Overlays the renderer can request (one at a time). 'light' and 'ph' are derived fields. */
export type OverlayId = FieldId | 'light' | 'ph';

export type Selection =
  | { readonly kind: 'entity'; readonly birthId: number }
  | { readonly kind: 'cell'; readonly cell: number };

export interface RecipeOverrides {
  readonly mutationPreset?: 'standard' | 'accelerated' | 'fixed';
  readonly founderMode?: 'identical' | 'varied' | 'diverse';
  /** Start from the recipe's habitat only: no founders, patches or scheduled inputs. */
  readonly empty?: boolean;
}

export type DishSource =
  | { readonly kind: 'recipe'; readonly recipeId: string; readonly seed?: number; readonly overrides?: RecipeOverrides }
  | { readonly kind: 'state'; readonly state: WorldState };

export type ToWorker =
  | { readonly type: 'create'; readonly requestId: number; readonly dishId: string; readonly source: DishSource; readonly name?: string }
  | { readonly type: 'dispose'; readonly dishId: string }
  | { readonly type: 'activate'; readonly dishId: string }
  | { readonly type: 'command'; readonly requestId: number; readonly dishId: string; readonly commandId: string; readonly payload: CommandPayload; readonly undoable: boolean }
  | { readonly type: 'setSpeed'; readonly dishId: string; readonly speed: Speed }
  | { readonly type: 'step'; readonly dishId: string }
  | { readonly type: 'undo'; readonly requestId: number; readonly dishId: string }
  | { readonly type: 'view'; readonly dishId: string; readonly overlay: OverlayId | null; readonly selection: Selection | null }
  | { readonly type: 'save'; readonly requestId: number; readonly dishId: string }
  | { readonly type: 'duplicate'; readonly requestId: number; readonly dishId: string; readonly newDishId: string }
  | { readonly type: 'hash'; readonly requestId: number; readonly dishId: string }
  | { readonly type: 'history'; readonly requestId: number; readonly dishId: string; /** Only the most recent N per-second samples. */ readonly lastSeconds?: number }
  | { readonly type: 'release'; readonly buffers: ArrayBuffer[] }
  | { readonly type: 'saveSlot'; readonly requestId: number; readonly dishId: string; readonly slotId: string; readonly name: string }
  | { readonly type: 'autosave'; readonly requestId: number; readonly dishId: string }
  | { readonly type: 'listSlots'; readonly requestId: number }
  | { readonly type: 'loadSlot'; readonly requestId: number; readonly slotId: string; readonly newDishId: string }
  | { readonly type: 'deleteSlot'; readonly requestId: number; readonly slotId: string }
  | { readonly type: 'exportDish'; readonly requestId: number; readonly dishId: string; readonly strip: boolean }
  | { readonly type: 'importDish'; readonly requestId: number; readonly text: string; readonly newDishId: string }
  /** Read-only family query for the inspector's "Where is its family?" shortcut (SPEC §12.1, UX §5.3). */
  | { readonly type: 'family'; readonly requestId: number; readonly dishId: string; readonly birthId: number }
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
  | { readonly type: 'compareDelete'; readonly requestId: number; readonly compareId: string };

export interface SlotSummary {
  readonly slotId: string;
  readonly name: string;
  readonly tick: number;
  readonly savedAt: string;
  readonly recipeId: string | null;
  readonly bytes: number;
}

/** Per-entity record stride in SnapshotMsg.ents (Float32). */
export const ENT_STRIDE = 12;
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

/** Per-entity id stride in SnapshotMsg.ids (Uint32): birthId, entityId. */
export const ID_STRIDE = 2;

export interface GeometryMsg {
  readonly version: number;
  readonly substrate: Uint8Array;
  readonly structure: Uint8Array;
  readonly shade: Float32Array;
}

export interface VisualEvent {
  readonly type: 'birth' | 'death' | 'introduce' | 'capture' | 'conversion' | 'mutation' | 'branchEstablished' | 'branchExtinct';
  readonly tick: number;
  readonly species: number;
  readonly cell: number;
  readonly birthId: number;
  readonly cause?: number;
  /** Branch id for branchEstablished / branchExtinct (P2.3). */
  readonly branch?: number;
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
  /** Lab trays (P2.7): each species' recorded habitats and one-line summary, in speciesIds order. */
  readonly speciesHabitats?: readonly (readonly string[])[];
  readonly speciesSummaries?: readonly string[];
  /** Lab trays (P2.7): each enabled material's one-line summary, in materials order. */
  readonly materialSummaries?: readonly string[];
  /** Fields allocated in this world (the overlays the Observe tray can offer), canonical order. */
  readonly fieldIds?: readonly string[];
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
  /** Per cell: starch, detritus, oil, protein, sugar-haze bands (0–255), 5 × CELL_COUNT. */
  readonly deposits: Uint8Array;
  readonly overlay: { readonly id: OverlayId; readonly data: Float32Array; readonly max: number } | null;
  readonly geometry: GeometryMsg | null;
  readonly events: readonly VisualEvent[];
  readonly selection: InspectorPayload | null;
  readonly capacityReached: boolean;
  readonly speciesCounts: readonly number[];
  readonly undoAvailable: boolean;
  /** Trait overlay bands and lineage highlight per entity, in `ents` order (P2.3); absent when off. */
  readonly lineage?: LineageMarks | null;
}

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
}

export interface DormancyInspect {
  /** 'native' (B12, F04, P08) or 'E03'. */
  readonly source: string;
  /** Life state: 0 Active, 1 Preparing, 2 Resting, 3 Waking. */
  readonly state: number;
  /** Reason code for the current rest (RESTING_FOOD_SCARCE / RESTING_DRY), or NONE while Active. */
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
  /** Current wake conditions (evaluated at its cell now). */
  readonly wake: { readonly food: boolean; readonly moisture: boolean; readonly environment: boolean };
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
}

export type FromWorker =
  | { readonly type: 'ready'; readonly requestId: number; readonly info: DishInfo }
  | SnapshotMsg
  | { readonly type: 'ack'; readonly requestId: number; readonly dishId: string; readonly result: CommandResult | null; readonly error?: string }
  | { readonly type: 'saved'; readonly requestId: number; readonly dishId: string; readonly json: string; readonly hash: string; readonly tick: number }
  | { readonly type: 'hash'; readonly requestId: number; readonly dishId: string; readonly hash: string; readonly tick: number }
  | { readonly type: 'history'; readonly requestId: number; readonly dishId: string; readonly seconds: unknown; readonly minutes: unknown; readonly compacted: boolean }
  | { readonly type: 'error'; readonly dishId: string; readonly requestId?: number; readonly message: string; readonly lastValidTick: number; readonly kind?: string }
  | { readonly type: 'slotSaved'; readonly requestId: number; readonly slot: SlotSummary }
  | { readonly type: 'slots'; readonly requestId: number; readonly slots: readonly SlotSummary[]; readonly persistent: boolean }
  | { readonly type: 'loaded'; readonly requestId: number; readonly info: DishInfo; readonly usedPredecessor: boolean }
  | { readonly type: 'exported'; readonly requestId: number; readonly text: string; readonly filename: string }
  | { readonly type: 'family'; readonly requestId: number; readonly dishId: string; readonly family: FamilyAnswer }
  | { readonly type: 'lineage'; readonly requestId: number; readonly dishId: string; readonly lineage: LineageAnswer }
  | { readonly type: 'done'; readonly requestId: number }
  /** Comparison status; unsolicited (no requestId) while running and when it completes. */
  | { readonly type: 'compareState'; readonly requestId?: number; readonly state: ComparisonState };
