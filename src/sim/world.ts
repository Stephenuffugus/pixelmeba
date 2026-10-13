/**
 * The authoritative world (SPEC §2, §14.1). Plain data plus derived caches.
 * A world embeds the content definitions it was created with, so a saved dish keeps its recorded
 * rules even after the build's content changes (SPEC §14.5).
 */
import { CELL_COUNT } from './constants';
import type { HabitatDef, Manifest, MaterialDef, ModuleDef, Species } from './content/schema';
import type { LocusDef } from './content/registry';
import { allocateFields, FIELD_IDS, type FieldStore } from './fields';
import type { TransportCache } from './transport';
import { EntityStore } from './entities';
import { GenomeTable } from './genome';
import { createGrid, type Grid } from './grid';
import type { ModuleRT, Profile } from './phenotype';
import { buildSpeciesTable, type SpeciesRT } from './species';
import { createLedger, type Ledger } from './ledger';
import { createLineage, type Lineage } from './lineage';
import { createEventLog, type EventLog } from './events';
import { createHistory, type History } from './history';
import type { Command } from './commands';
import { createBranchBook, type BranchBook } from './branches';
import type { FoodObject } from './objects';
import type { FungalFlowObs } from './fungalTransport';
import { createReactionCells, type ReactionCells } from './reactions';
import { createIntakeSeen, type IntakeSeen } from './intake';
import type { SampleSlot } from './sampleSlot';
import type { EdgeBarrier } from './barriers';
import type { Device } from './devices';
import type { FieldId } from './fields';

/**
 * World schema. 1 = Phase 1. 2 = P2.1 adds the dryTimer entity column (dormancy). 3 = P2.8 adds
 * history records (regional trait samples, the debris total, the dish's journal; see history.ts).
 * 4 = P3 foundation: link, anchor, film, E12 and P04 columns; food-object and sample stores (D-0035;
 * all hash-neutral while empty, so a world without Phase 3 state hashes as the g2 build hashed it).
 * 5 = Phase 5 foundation (D-0102): glow, mixotrophy, trap, held and handling columns; the edge-barrier,
 * device, climate and gate-tally stores, the nextDeviceId counter and settings.cycleStartTick (all
 * hash-neutral while empty or absent, the D-0035 rule, so a world without Phase 5 state hashes as the
 * v1.0 build hashed it). Every save is written at 5, so a v1.0 build refuses a v1.1 dish.
 * Older states are migrated by copy in migrateWorldState (src/sim/serialize.ts); new states are
 * always written at the current version.
 */
export const SCHEMA_VERSION = 5;

export type MutationPreset = 'standard' | 'accelerated' | 'fixed';
export type FounderMode = 'identical' | 'varied' | 'diverse';

export interface WorldSettings {
  lid: 'open' | 'closed';
  lightMode: 'fixed' | 'cycle';
  drying: boolean;
  /** Uniform dish warmth index until local warmth is enabled (Phase 5). */
  warmth: number;
  mutationPreset: MutationPreset;
  founderMode: FounderMode;
  /**
   * Schema 5 (D-0106): the tick the light cycle started, present only while lightMode is 'cycle'; the
   * cycle phase is (tick − cycleStartTick) mod 2400 (SPEC §4.6). Absent in every older world, so their
   * settings hash as before (canonicalJson skips undefined).
   */
  cycleStartTick?: number;
}

export interface WorldContent {
  readonly manifest: Manifest;
  readonly species: readonly Species[];
  readonly modules: readonly ModuleDef[];
  readonly materials: readonly MaterialDef[];
  readonly loci: readonly LocusDef[];
  readonly habitat: HabitatDef;
  readonly provenance: {
    readonly recipeId: string | null;
    readonly recipeRevision: number | null;
    readonly createdFrom: string;
    /** SPEC §14.5 "tags provenance": the schema versions this world was migrated from, oldest first (D-0029). */
    readonly migratedFrom?: readonly number[];
  };
}

export interface Derived {
  /** Display/tolerance pH per cell. */
  readonly ph: Float64Array;
  /** Effective light per cell. */
  readonly light: Float64Array;
  /** Moisture index per cell (water 1.0; gel/sediment 0.8 until climate is enabled). */
  readonly moisture: Float64Array;
  /** Transport cache (per-cell edge coefficients, gas rates, row spans); rebuilt on geometry change. */
  transport: TransportCache | null;
  /** 1 when a field may be non-zero; inactive fields are exactly zero and skipped. */
  readonly fieldActive: Uint8Array;
  /** True while acid/base/buffer are all zero so pH is uniformly 7. */
  phUniform: boolean;
  /** Per-cell load Σ B / ancestral B0 (rebuilt each tick). */
  readonly cellLoad: Float64Array;
  /** Spatial index: head slot per cell, next slot per entity (-1 terminated). */
  readonly cellHead: Int32Array;
  readonly nextInCell: Int32Array;
}

export interface Counters {
  nextEntityId: number;
  nextBirthId: number;
  nextEventId: number;
  /** Next finite food object id (schema 4; hashed only once it moved from 1). */
  nextObjectId: number;
  /**
   * Next edge-barrier or device id (schema 5; hashed only once it moved from 1). One id space for both,
   * so a gate tally or a GateReading names one structure unambiguously.
   */
  nextDeviceId: number;
}

/**
 * Local warmth and moisture per cell (SPEC §4.7–§4.8; schema 5). null = the ambient value
 * (settings.warmth) or the substrate default (derived.moisture). Allocated lazily by the climate stage
 * when a heater or cooler is switched on, drying starts, the wet brush is used or a wick is placed;
 * never by observation.
 */
export interface Climate {
  warmth: Float64Array | null;
  moisture: Float64Array | null;
}

/**
 * Observation only (schema 5): what crossed one edge barrier, cumulatively in either direction. Saved,
 * never hashed and never read by the simulation (it feeds the gate inspector and GateReading).
 */
export interface GateTally {
  /** The edge barrier's id. */
  readonly id: number;
  /** Cumulative amount of each field that crossed. */
  fields: Partial<Record<FieldId, number>>;
  /** Cumulative organism crossings. */
  organisms: number;
}

export interface World {
  readonly schemaVersion: number;
  readonly worldId: string;
  readonly seed: number;
  tick: number;
  settings: WorldSettings;
  readonly content: WorldContent;
  readonly species: readonly SpeciesRT[];
  readonly modules: Readonly<Record<string, ModuleRT>>;
  readonly grid: Grid;
  readonly fields: FieldStore;
  readonly derived: Derived;
  readonly ents: EntityStore;
  readonly genomes: GenomeTable;
  /** Profile cache indexed by genome index (derived; never saved). */
  readonly profiles: (Profile | undefined)[];
  readonly lineage: Lineage;
  readonly ledger: Ledger;
  readonly commands: { pending: Command[]; nextSeq: number; log: Command[] };
  readonly counters: Counters;
  readonly events: EventLog;
  readonly history: History;
  /** Ticks during which the agent cap blocked a birth or inoculation. */
  capacityLimitedTicks: number;
  /** Set by stages 1 and 9 when the cap blocked something this tick; folded in at stage 10. */
  capacityHitThisTick: boolean;
  /** Branch discovery records (observation only). */
  readonly branches: BranchBook;
  /** Carbon converted by each enzyme this tick (observation). */
  readonly conversionTally: { starch: number; oil: number; protein: number };
  /**
   * Carbon converted by enzymes in each cell during the last stage 3 (observation only: never read by
   * the simulation, not hashed, not saved; drives the renderer's catalysis dust, UX §7).
   */
  readonly catalysisCells: Float32Array;
  /** Cumulative carbon converted by each enzyme (observation, saved). */
  readonly conversionTotals: { starch: number; oil: number; protein: number };
  /**
   * Per cell and enzyme, carbon converted and bound nutrient moved in the current and the last whole
   * second (P3.6 reaction ledger; src/sim/reactions.ts). Observation only, like catalysisCells: never
   * read by the simulation, not hashed, not saved.
   */
  readonly reactionCells: ReactionCells;
  /**
   * P3.6 F02 transport: per slot, carbon sent and received along transport links over the last second
   * and the last 10 s, and to/from whom (src/sim/fungalTransport.ts). Observation only: never read by
   * the simulation, never hashed or saved; null until a transfer first happens; a slot's record is
   * cleared when its segment dies, divides or the slot is reused.
   */
  fungalFlow: FungalFlowObs | null;
  /**
   * P3.8: which pools each species took food from in the last stage 6 (src/sim/intake.ts IntakeSeen).
   * Observation only: never read by the simulation, never hashed or saved; cleared every stage 6.
   */
  readonly intakeSeen: IntakeSeen;
  /** Finite food objects (SPEC §5.1; schema 4), ordered by id; at most 128 (src/sim/objects.ts). */
  readonly objects: FoodObject[];
  /** The single held sample (SPEC §10.5; schema 4), or null (src/sim/sampleSlot.ts). */
  sample: SampleSlot | null;
  /** Edge barriers S01–S04 (SPEC §2.4; schema 5), sorted by edgeKey, one per edge (src/sim/barriers.ts). */
  edges: EdgeBarrier[];
  /** Furnishings and devices S05–S12 (SPEC §2.5; schema 5), sorted by cell, one per cell (src/sim/devices.ts). */
  devices: Device[];
  /** Local warmth and moisture (schema 5); both null until the climate stage allocates them. */
  readonly climate: Climate;
  /** Per edge barrier crossing totals (schema 5; observation only: saved, never hashed), sorted by id. */
  gateTally: GateTally[];
}

export function speciesIndex(world: World, id: string): number {
  const i = world.species.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`species ${id} is not enabled in this world`);
  return i;
}

export function buildModuleTable(defs: readonly ModuleDef[]): Record<string, ModuleRT> {
  const out: Record<string, ModuleRT> = {};
  for (const d of defs) out[d.id] = { id: d.id, surcharge: d.surchargePerSecond, params: d.params };
  return out;
}

export function createEmptyWorld(opts: {
  worldId: string;
  seed: number;
  settings: WorldSettings;
  content: WorldContent;
}): World {
  const species = buildSpeciesTable(opts.content.species);
  return {
    schemaVersion: SCHEMA_VERSION,
    worldId: opts.worldId,
    seed: opts.seed >>> 0,
    tick: 0,
    settings: { ...opts.settings },
    content: opts.content,
    species,
    modules: buildModuleTable(opts.content.modules),
    grid: createGrid(),
    fields: allocateFields(opts.content.manifest.enabledSystems),
    derived: {
      ph: new Float64Array(CELL_COUNT).fill(7),
      light: new Float64Array(CELL_COUNT),
      moisture: new Float64Array(CELL_COUNT),
      transport: null,
      fieldActive: new Uint8Array(FIELD_IDS.length).fill(1),
      phUniform: false,
      cellLoad: new Float64Array(CELL_COUNT),
      cellHead: new Int32Array(CELL_COUNT).fill(-1),
      nextInCell: new Int32Array(6000).fill(-1),
    },
    ents: new EntityStore(),
    genomes: new GenomeTable(),
    profiles: [],
    lineage: createLineage(),
    ledger: createLedger(),
    commands: { pending: [], nextSeq: 1, log: [] },
    counters: { nextEntityId: 1, nextBirthId: 1, nextEventId: 1, nextObjectId: 1, nextDeviceId: 1 },
    events: createEventLog(),
    history: createHistory(species.length),
    capacityLimitedTicks: 0,
    capacityHitThisTick: false,
    branches: createBranchBook(),
    conversionTally: { starch: 0, oil: 0, protein: 0 },
    catalysisCells: new Float32Array(CELL_COUNT),
    conversionTotals: { starch: 0, oil: 0, protein: 0 },
    reactionCells: createReactionCells(),
    fungalFlow: null,
    intakeSeen: createIntakeSeen(),
    objects: [],
    sample: null,
    edges: [],
    devices: [],
    climate: { warmth: null, moisture: null },
    gateTally: [],
  };
}
