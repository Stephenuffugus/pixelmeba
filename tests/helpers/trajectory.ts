/**
 * Trajectory digest: a hash of a world's biology (Phase 3 determinism fence; g3-plan-recheck P-17,
 * P-18; D-0035).
 *
 * stateHash (src/sim/serialize.ts) covers everything that decides a world's future, but it also
 * covers the content hash and content version (every content edit moves it) and it hashes raw index
 * columns (enabling one more species shifts every later species index). trajectoryDigest hashes the
 * same simulation state with every index into a content-ordered table mapped to its ID, so it moves
 * only when the biology moves:
 *   - seed, tick and the six g2 settings (canonical JSON);
 *   - the grid arrays substrate, structure, lightBase and shade;
 *   - every field in G2_FIELD_IDS (the 24 core + enzymes fields a g2 world allocates; one this world
 *     does not allocate counts as all zero);
 *   - the living organisms in ascending slot order: the slot, then every column of
 *     G2_ENTITY_COLUMNS, with `species` as the species ID, `genome`/`refGenome`/`propG0`/`propG1` as
 *     genome keys ('-' for −1) and `propModule0`/`propModule1` as module IDs ('-' for −1);
 *   - lineage: `base` and its 13 record arrays (species → ID, genome → key, mutModule → module ID);
 *   - counters nextEntityId and nextBirthId (never nextEventId, which observation events move);
 *   - ledger initial/inputs/exports/roundoff (c, n, m) and exchangeC;
 *   - the pending commands (as stateHash hashes them) and commands.nextSeq;
 *   - the branch count and every branch's root birthId.
 * Never hashed: contentHash, contentVersion and the other manifest stamps, history, events, world id,
 * provenance, the genome table's order, and derived caches.
 *
 * State added after g2 (fields of later systems, entity columns appended after `dryTimer`, new world
 * stores, counters, grid layers and settings keys) is "post-g2". It counts only while it holds a
 * non-default value: allocating an all-zero field, appending a column at its empty value (0, or −1
 * where the entity store fills −1) or adding a store at its fresh-world value never moves a digest.
 * - mode 'g2' (g2-replay, fence check (a)) throws if any post-g2 state is non-default: Phase 2
 *   content run by the current build must not grow Phase 3 state.
 * - mode 'full' (fence check (b), tools/fence-update.ts --add) appends each non-default post-g2 item,
 *   by name or ID, after the g2 part, so 'full' equals 'g2' while nothing post-g2 is set.
 *
 * Builders who add post-g2 state register index-valued columns in POST_G2_COLUMN_KINDS, store
 * mappings (slot/species/module references → birthId/ID) in POST_G2_STORE_CANON, derived caches in
 * POST_G2_DERIVED_KEYS and the default of a new settings key in POST_G2_SETTINGS_DEFAULTS.
 */
import { CELL_COUNT } from '../../src/sim/constants';
import { ENTITY_COLUMNS, EntityStore, type ColumnName } from '../../src/sim/entities';
import { FIELD_IDS, type FieldId } from '../../src/sim/fields';
import { genomeKey } from '../../src/sim/genome';
import { createGrid } from '../../src/sim/grid';
import { canonicalJson, StateHasher } from '../../src/sim/hash';
import { createEmptyWorld, type World } from '../../src/sim/world';
import type { SampleSlot } from '../../src/sim/sampleSlot';

export type DigestMode = 'g2' | 'full';

/** The 24 fields a g2 world allocates (systems core + enzymes), in FIELD_IDS order. Frozen at g2. */
export const G2_FIELD_IDS: readonly FieldId[] = Object.freeze([
  'sugar',
  'sugarN',
  'starch',
  'starchN',
  'oil',
  'oilN',
  'protein',
  'proteinN',
  'broth',
  'brothN',
  'detritus',
  'detritusN',
  'metabolite',
  'nutrient',
  'oxygen',
  'co2',
  'acid',
  'base',
  'buffer',
  'salt',
  'eStarch',
  'eOil',
  'eProtein',
  'breaker',
] as const satisfies readonly FieldId[]);

/** The 67 entity columns at g2 (ENTITY_COLUMNS `alive` … `dryTimer`), frozen. Columns are append-only. */
export const G2_ENTITY_COLUMNS: readonly ColumnName[] = Object.freeze([
  'alive',
  'species',
  'genome',
  'entityId',
  'birthId',
  'x',
  'y',
  'heading',
  'B',
  'N',
  'E',
  'H',
  'age',
  'mealC',
  'mealN',
  'boundMineral',
  'jacketMineral',
  'lifeState',
  'stateTimer',
  'lockoutTimer',
  'flags',
  'decisionTimer',
  'targetX',
  'targetY',
  'moveMode',
  'movedThisTick',
  'attackCooldown',
  'preySlot',
  'preyBirthId',
  'handlingProgress',
  'hostSlot',
  'hostBirthId',
  'parasiteSlot',
  'parasiteBirthId',
  'infectionTimer',
  'infectedBy',
  'suitability',
  'lastIntakeTick',
  'intakeLastSecond',
  'intakeAccum',
  'stressSeconds',
  'recoverSeconds',
  'limitCode',
  'limitValue',
  'dmgStarve',
  'dmgStress',
  'dmgInhib',
  'dmgParasite',
  'divBlockCode',
  'secreting',
  'propG0',
  'propG1',
  'propTick',
  'secretionCode',
  'generation',
  'branchId',
  'candRoot',
  'refGenome',
  'propFlags0',
  'propFlags1',
  'propLocus0',
  'propLocus1',
  'propDelta0',
  'propDelta1',
  'propModule0',
  'propModule1',
  'dryTimer',
] as const satisfies readonly ColumnName[]);

/** World properties at g2 (createEmptyWorld). Any other property is a post-g2 store. */
export const G2_WORLD_KEYS: readonly string[] = Object.freeze([
  'schemaVersion',
  'worldId',
  'seed',
  'tick',
  'settings',
  'content',
  'species',
  'modules',
  'grid',
  'fields',
  'derived',
  'ents',
  'genomes',
  'profiles',
  'lineage',
  'ledger',
  'commands',
  'counters',
  'events',
  'history',
  'capacityLimitedTicks',
  'capacityHitThisTick',
  'branches',
  'conversionTally',
  'catalysisCells',
  'conversionTotals',
]);

/** WorldSettings keys at g2 (hashed in this order's canonical JSON). */
export const G2_SETTINGS_KEYS: readonly string[] = Object.freeze(['lid', 'lightMode', 'drying', 'warmth', 'mutationPreset', 'founderMode']);
/** Counters at g2; nextEventId is never hashed (observation events move it). */
export const G2_COUNTER_KEYS: readonly string[] = Object.freeze(['nextEntityId', 'nextBirthId', 'nextEventId']);
/** Grid properties at g2; geometryVersion is a cache key and never hashed. */
export const G2_GRID_KEYS: readonly string[] = Object.freeze(['substrate', 'structure', 'lightBase', 'shade', 'geometryVersion']);

type IndexKind = 'species' | 'genome' | 'module';
/** Index-valued g2 columns, hashed as IDs. */
const G2_INDEX_COLUMNS: Readonly<Partial<Record<ColumnName, IndexKind>>> = Object.freeze({
  species: 'species',
  genome: 'genome',
  refGenome: 'genome',
  propG0: 'genome',
  propG1: 'genome',
  propModule0: 'module',
  propModule1: 'module',
});

/** Post-g2 columns that hold a species, genome or module index (hashed as IDs in 'full' mode). */
export const POST_G2_COLUMN_KINDS: Readonly<Record<string, IndexKind>> = Object.freeze({});
/** Post-g2 stores whose records hold slot/species/module references: map them to birthIds and IDs for 'full' mode. */
export const POST_G2_STORE_CANON: Readonly<Record<string, (world: World, value: unknown) => unknown>> = Object.freeze({
  // Phase 3 foundation (world schema 4): the held sample. Each held row is keyed by its birthId instead
  // of its slot; species, genome and module indices become IDs and genome keys; slot-valued columns are
  // dropped (each has a birthId partner column that keeps the identity).
  sample: (world: World, value: unknown) => canonSample(world, value as SampleSlot),
});
/** Post-g2 world properties that are derived caches (rebuilt from state, never saved): never hashed. */
export const POST_G2_DERIVED_KEYS: readonly string[] = Object.freeze(['reactionCells', 'fungalFlow']);
/** The value a post-g2 WorldSettings key has in a world that never set it (absent counts as default too). */
export const POST_G2_SETTINGS_DEFAULTS: Readonly<Record<string, unknown>> = Object.freeze({});

/** Sample columns holding a slot (identity kept by their birthId partner columns). */
const SAMPLE_SLOT_COLUMNS: readonly string[] = ['preySlot', 'hostSlot', 'parasiteSlot', 'fLink0', 'fLink1', 'fLink2', 'fLink3', 'aLink0', 'aLink1'];

function canonSample(world: World, s: SampleSlot): unknown {
  const map = new Mapper(world);
  const kinds: Readonly<Record<string, IndexKind>> = { ...G2_INDEX_COLUMNS, ...POST_G2_COLUMN_KINDS };
  const rows = s.rows.map((r) => {
    const cols: Record<string, number | string> = {};
    for (const [name] of ENTITY_COLUMNS) {
      if (SAMPLE_SLOT_COLUMNS.includes(name)) continue;
      const kind = kinds[name];
      const v = r.cols[name];
      cols[name] = kind ? map.index(kind, v) : v;
    }
    // P3.5 (D-0043): Cancel restores each row into its original slot, so the slot is future state.
    return { birthId: r.cols.birthId, slot: r.slot, cols };
  });
  const genomes = s.genomes.map((g) => ({ key: map.genome(g.index) })).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { txId: s.txId, seq: s.seq, mode: s.mode, origin: s.origin, radius: s.radius, rows, cells: s.cells, objects: s.objects, genomes };
}

const LINEAGE_ARRAYS = ['parent', 'genome', 'birthTick', 'generation', 'species', 'entityId', 'deathTick', 'deathCause', 'origin', 'mutFlags', 'mutLocus', 'mutDelta', 'mutModule'] as const;

const ZERO_FIELD = new Float64Array(CELL_COUNT);

let emptyStore: EntityStore | null = null;
/** The empty value of an entity column (what a freed or never-used slot holds: 0, or −1), read from a fresh store. */
function emptyColumnValue(name: ColumnName): number {
  emptyStore ??= new EntityStore(1);
  return (emptyStore.cols[name] as ArrayLike<number>)[0]!;
}

/** Plain JSON-able copy (typed arrays become arrays) for canonical hashing and comparison. */
function plain(v: unknown): unknown {
  if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<number>);
  if (Array.isArray(v)) return v.map(plain);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) out[k] = plain((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return canonicalJson(plain(a)) === canonicalJson(plain(b));
}

class Mapper {
  private readonly keys: (string | undefined)[] = [];
  constructor(private readonly world: World) {}

  species(idx: number): string {
    return this.world.species[idx]?.id ?? `#${idx}`;
  }

  genome(idx: number): string {
    if (idx < 0) return '-';
    const cached = this.keys[idx];
    if (cached !== undefined) return cached;
    const g = this.world.genomes.list[idx];
    const key = g ? genomeKey(g) : `#${idx}`;
    this.keys[idx] = key;
    return key;
  }

  module(idx: number): string {
    if (idx < 0) return '-';
    return this.world.content.modules[idx]?.id ?? `#${idx}`;
  }

  index(kind: IndexKind, idx: number): string {
    return kind === 'species' ? this.species(idx) : kind === 'genome' ? this.genome(idx) : this.module(idx);
  }
}

export class PostG2StateError extends Error {}

interface PostG2Item {
  /** Label hashed before the item (also used in the 'g2' error). */
  readonly label: string;
  readonly hash: (h: StateHasher) => void;
}

function nonZeroAt(arr: Float64Array): number {
  for (let k = 0; k < arr.length; k++) if (arr[k] !== 0) return k;
  return -1;
}

/** Every post-g2 item holding a non-default value, in a fixed order. */
function postG2Items(world: World, map: Mapper): PostG2Item[] {
  const out: PostG2Item[] = [];
  // Fields of later systems (FIELD_IDS order).
  for (const id of FIELD_IDS) {
    if (G2_FIELD_IDS.includes(id)) continue;
    const arr = world.fields[id];
    if (!arr) continue;
    const at = nonZeroAt(arr);
    if (at < 0) continue;
    out.push({ label: `field ${id} (non-zero at cell ${at})`, hash: (h) => h.string(`field:${id}`).typed(arr) });
  }
  // Entity columns appended after g2 (ENTITY_COLUMNS order), over the living organisms.
  const c = world.ents.cols;
  const hw = world.ents.highWater;
  for (const [name] of ENTITY_COLUMNS) {
    if (G2_ENTITY_COLUMNS.includes(name)) continue;
    const arr = c[name] as ArrayLike<number>;
    const empty = emptyColumnValue(name);
    let at = -1;
    for (let i = 0; i < hw && at < 0; i++) if (arr[i] !== empty) at = i;
    if (at < 0) continue;
    const kind = POST_G2_COLUMN_KINDS[name];
    out.push({
      label: `entity column ${name} (slot ${at} holds ${arr[at]}, empty is ${empty})`,
      hash: (h) => {
        h.string(`column:${name}`);
        for (let i = 0; i < hw; i++) {
          if (c.alive[i] !== 1) continue;
          h.number(i);
          if (kind) h.string(map.index(kind, arr[i]!));
          else h.number(arr[i]!);
        }
      },
    });
  }
  // Grid layers, world stores and counters added after g2, compared with a fresh world's values
  // (built only when such a property exists).
  let fresh: World | null = null;
  const freshWorld = () => (fresh ??= createEmptyWorld({ worldId: world.worldId, seed: world.seed, settings: world.settings, content: world.content }));
  const grid = world.grid as unknown as Record<string, unknown>;
  const gridKeys = Object.keys(grid).sort().filter((k) => !G2_GRID_KEYS.includes(k));
  const freshGrid = gridKeys.length > 0 ? (createGrid() as unknown as Record<string, unknown>) : {};
  for (const k of gridKeys) {
    if (sameValue(grid[k], freshGrid[k])) continue;
    out.push({ label: `grid layer ${k}`, hash: (h) => h.string(`grid:${k}`).string(canonicalJson(plain(grid[k]))) });
  }
  const w = world as unknown as Record<string, unknown>;
  for (const k of Object.keys(w).sort()) {
    if (G2_WORLD_KEYS.includes(k) || POST_G2_DERIVED_KEYS.includes(k)) continue;
    if (sameValue(w[k], (freshWorld() as unknown as Record<string, unknown>)[k])) continue;
    const canon = POST_G2_STORE_CANON[k];
    out.push({ label: `world store ${k}`, hash: (h) => h.string(`store:${k}`).string(canonicalJson(plain(canon ? canon(world, w[k]) : w[k]))) });
  }
  const counters = world.counters as unknown as Record<string, unknown>;
  for (const k of Object.keys(counters).sort()) {
    if (G2_COUNTER_KEYS.includes(k)) continue;
    if (sameValue(counters[k], (freshWorld().counters as unknown as Record<string, unknown>)[k])) continue;
    out.push({ label: `counter ${k} = ${String(counters[k])}`, hash: (h) => h.string(`counter:${k}`).string(canonicalJson(plain(counters[k]))) });
  }
  const settings = world.settings as unknown as Record<string, unknown>;
  for (const k of Object.keys(settings).sort()) {
    const v = settings[k];
    if (G2_SETTINGS_KEYS.includes(k) || v === undefined || (k in POST_G2_SETTINGS_DEFAULTS && sameValue(v, POST_G2_SETTINGS_DEFAULTS[k]))) continue;
    out.push({ label: `settings key ${k} = ${canonicalJson(plain(v))}`, hash: (h) => h.string(`setting:${k}`).string(canonicalJson(plain(v))) });
  }
  return out;
}

/** The post-g2 state a world holds (empty for any world that Phase 2 content and rules could produce). */
export function postG2State(world: World): string[] {
  return postG2Items(world, new Mapper(world)).map((i) => i.label);
}

/** The biology digest of a world (see the header). 16 hex characters, like stateHash. */
export function trajectoryDigest(world: World, mode: DigestMode): string {
  const map = new Mapper(world);
  const extra = postG2Items(world, map);
  if (mode === 'g2' && extra.length > 0) {
    throw new PostG2StateError(`trajectoryDigest('g2'): world ${world.worldId} at tick ${world.tick} holds post-g2 state: ${extra.map((i) => i.label).join('; ')}`);
  }
  const h = new StateHasher();
  h.number(world.seed).number(world.tick);
  const settings = world.settings as unknown as Record<string, unknown>;
  const s: Record<string, unknown> = {};
  for (const k of G2_SETTINGS_KEYS) s[k] = settings[k];
  h.string(canonicalJson(s));
  const g = world.grid;
  h.typed(g.substrate).typed(g.structure).typed(g.lightBase).typed(g.shade);
  for (const id of G2_FIELD_IDS) h.string(id).typed(world.fields[id] ?? ZERO_FIELD);

  // Living organisms, ascending slot order.
  const c = world.ents.cols;
  const hw = world.ents.highWater;
  const cols = G2_ENTITY_COLUMNS.map((name) => [c[name] as ArrayLike<number>, G2_INDEX_COLUMNS[name]] as const);
  let alive = 0;
  for (let i = 0; i < hw; i++) if (c.alive[i] === 1) alive++;
  h.string('entities').number(alive);
  for (let i = 0; i < hw; i++) {
    if (c.alive[i] !== 1) continue;
    h.number(i);
    for (const [arr, kind] of cols) {
      if (kind) h.string(map.index(kind, arr[i]!));
      else h.number(arr[i]!);
    }
  }

  // Lineage records, indices mapped to IDs.
  const L = world.lineage;
  h.string('lineage').number(L.base);
  for (const name of LINEAGE_ARRAYS) {
    const arr = L[name];
    h.number(arr.length);
    if (name === 'species') for (const v of arr) h.string(map.species(v));
    else if (name === 'genome') for (const v of arr) h.string(map.genome(v));
    else if (name === 'mutModule') for (const v of arr) h.string(map.module(v));
    else for (const v of arr) h.number(v);
  }

  h.number(world.counters.nextEntityId).number(world.counters.nextBirthId);
  const led = world.ledger;
  for (const t of [led.initial, led.inputs, led.exports, led.roundoff]) h.number(t.c).number(t.n).number(t.m);
  h.number(led.exchangeC);
  h.string(canonicalJson(world.commands.pending.map((p) => ({ id: p.commandId, seq: p.seq, t: p.targetTick, p: p.payload }))));
  h.number(world.commands.nextSeq);
  const branches = world.branches.branches;
  h.number(branches.length);
  for (const b of branches) h.number(b.rootBirthId);

  // 'full': the non-default post-g2 state, after the g2 part (nothing appended while none is set).
  if (mode === 'full') for (const item of extra) item.hash(h);
  return h.hex();
}
