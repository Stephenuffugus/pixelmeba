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

export const SCHEMA_VERSION = 1;

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
  readonly provenance: { readonly recipeId: string | null; readonly recipeRevision: number | null; readonly createdFrom: string };
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
    counters: { nextEntityId: 1, nextBirthId: 1, nextEventId: 1 },
    events: createEventLog(),
    history: createHistory(species.length),
    capacityLimitedTicks: 0,
  };
}
