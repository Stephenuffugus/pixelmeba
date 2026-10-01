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
import type { SampleSlot } from './sampleSlot';

/**
 * World schema. 1 = Phase 1. 2 = P2.1 adds the dryTimer entity column (dormancy). 3 = P2.8 adds
 * history records (regional trait samples, the debris total, the dish's journal; see history.ts).
 * 4 = P3 foundation: link, anchor, film, E12 and P04 columns; food-object and sample stores (D-0035;
 * all hash-neutral while empty, so a world without Phase 3 state hashes as the g2 build hashed it).
 * Older states are migrated by copy in migrateWorldState (src/sim/serialize.ts); new states are
 * always written at the current version.
 */
export const SCHEMA_VERSION = 4;

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
  /** Finite food objects (SPEC §5.1; schema 4), ordered by id; at most 128 (src/sim/objects.ts). */
  readonly objects: FoodObject[];
  /** The single held sample (SPEC §10.5; schema 4), or null (src/sim/sampleSlot.ts). */
  sample: SampleSlot | null;
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
    counters: { nextEntityId: 1, nextBirthId: 1, nextEventId: 1, nextObjectId: 1 },
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
    objects: [],
    sample: null,
  };
}
