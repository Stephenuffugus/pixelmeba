/**
 * Worker protocol (ARCH §7–§8), versioned. The worker owns every world; the main thread only ever
 * holds snapshots. Commands carry a stable commandId; the worker stamps targetTick and seq.
 */
import type { CommandPayload, CommandResult } from '@sim/commands';
import type { WorldState } from '@sim/serialize';
import type { FieldId } from '@sim/fields';

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
  | { readonly type: 'family'; readonly requestId: number; readonly dishId: string; readonly birthId: number };

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
  | { readonly type: 'done'; readonly requestId: number };
