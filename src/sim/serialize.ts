/**
 * World serialization and state hashing (SPEC §14.1, §15; ARCH §11.2).
 *
 * serializeWorld() captures the complete authoritative world (plus observation records) as plain
 * JSON-able data; deserializeWorld() rebuilds an identical world. stateHash() covers everything that
 * can influence future simulation, so equal hashes mean equal futures under equal commands.
 */
import { CELL_COUNT } from './constants';
import { emptyValueOf, ENTITY_COLUMNS, FIRST_HASH_NEUTRAL_COLUMN } from './entities';
import { allocatedFieldIds, isFieldId } from './fields';
import { genomeKey, type Genome } from './genome';
import { base64ToBytes, canonicalJson, StateHasher, typedToBase64 } from './hash';
import type { Command } from './commands';
import type { EventLog } from './events';
import type { History } from './history';
import { historyForSchema3, sanitizeHistoryRecords } from './history';
import { createLedger, type Ledger } from './ledger';
import type { Lineage } from './lineage';
import type { BranchBook } from './branches';
import type { FoodObject } from './objects';
import { decodeSample, encodeSample, type SavedSample } from './sampleSlot';
import { rebuildIndex } from './spatial';
import { updateDerived } from './transport';
import { createEmptyWorld, SCHEMA_VERSION, type World, type WorldContent, type WorldSettings } from './world';

type DType = 'f64' | 'f32' | 'i32' | 'u32' | 'u16' | 'u8';
export interface EncodedArray {
  readonly dtype: DType;
  readonly length: number;
  readonly b64: string;
}

function dtypeOf(arr: ArrayBufferView): DType {
  if (arr instanceof Float64Array) return 'f64';
  if (arr instanceof Float32Array) return 'f32';
  if (arr instanceof Int32Array) return 'i32';
  if (arr instanceof Uint32Array) return 'u32';
  if (arr instanceof Uint16Array) return 'u16';
  if (arr instanceof Uint8Array) return 'u8';
  throw new Error('unsupported typed array');
}

export function encodeArray(arr: ArrayBufferView & { length: number }): EncodedArray {
  return { dtype: dtypeOf(arr), length: arr.length, b64: typedToBase64(arr) };
}

export function decodeInto(enc: EncodedArray, target: ArrayBufferView & { length: number }): void {
  if (enc.dtype !== dtypeOf(target)) throw new Error(`array dtype mismatch: ${enc.dtype} vs ${dtypeOf(target)}`);
  if (enc.length > target.length) throw new Error(`array too long: ${enc.length} > ${target.length}`);
  const bytes = base64ToBytes(enc.b64);
  const bpe = (target as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT;
  if (bytes.length !== enc.length * bpe) throw new Error('array byte length mismatch');
  new Uint8Array(target.buffer, target.byteOffset, enc.length * bpe).set(bytes);
}

export interface SavedGenome {
  readonly ancestor: string;
  readonly loci: readonly number[];
  readonly policy: Genome['policy'];
  readonly weights: readonly number[] | null;
  readonly modules: readonly string[];
  readonly dev: Genome['dev'];
}

export interface WorldState {
  readonly format: 'pixelmeba-world';
  readonly schemaVersion: number;
  readonly worldId: string;
  readonly seed: number;
  readonly tick: number;
  readonly settings: WorldSettings;
  readonly content: WorldContent;
  readonly grid: {
    readonly substrate: EncodedArray;
    readonly structure: EncodedArray;
    readonly lightBase: EncodedArray;
    readonly shade: EncodedArray;
    readonly geometryVersion: number;
  };
  readonly fields: Readonly<Record<string, EncodedArray>>;
  readonly entities: { readonly highWater: number; readonly columns: Readonly<Record<string, EncodedArray>> };
  readonly genomes: readonly SavedGenome[];
  readonly lineage: Lineage;
  readonly ledger: Ledger;
  readonly commands: { readonly pending: readonly Command[]; readonly nextSeq: number; readonly log: readonly Command[] };
  readonly counters: World['counters'];
  readonly events: EventLog;
  readonly history: History;
  readonly capacityLimitedTicks: number;
  readonly conversionTotals?: { starch: number; oil: number; protein: number };
  readonly branches?: BranchBook;
  /** Schema 4: finite food objects (absent before; the migration adds []). */
  readonly objects?: readonly FoodObject[];
  /** Schema 4: the held sample with its rows as typed payloads (absent before; the migration adds null). */
  readonly sample?: SavedSample | null;
}

function sliceTo<T extends ArrayBufferView & { subarray(a: number, b: number): T; length: number }>(arr: T, n: number): T {
  return arr.subarray(0, n);
}

export function serializeWorld(world: World): WorldState {
  const fields: Record<string, EncodedArray> = {};
  for (const id of allocatedFieldIds(world.fields)) fields[id] = encodeArray(world.fields[id]!);
  const hw = world.ents.highWater;
  const columns: Record<string, EncodedArray> = {};
  for (const [name] of ENTITY_COLUMNS) {
    const arr = world.ents.cols[name] as unknown as Float64Array;
    columns[name] = encodeArray(sliceTo(arr, hw));
  }
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    format: 'pixelmeba-world',
    schemaVersion: world.schemaVersion,
    worldId: world.worldId,
    seed: world.seed,
    tick: world.tick,
    settings: { ...world.settings },
    content: world.content,
    grid: {
      substrate: encodeArray(world.grid.substrate),
      structure: encodeArray(world.grid.structure),
      lightBase: encodeArray(world.grid.lightBase),
      shade: encodeArray(world.grid.shade),
      geometryVersion: world.grid.geometryVersion,
    },
    fields,
    entities: { highWater: hw, columns },
    genomes: world.genomes.list.map((g) => ({
      ancestor: g.ancestor,
      loci: [...g.loci],
      policy: g.policy,
      weights: g.weights === null ? null : [...g.weights],
      modules: [...g.modules],
      dev: { ...g.dev },
    })),
    lineage: clone(world.lineage),
    ledger: clone(world.ledger),
    commands: clone(world.commands),
    counters: { ...world.counters },
    events: clone(world.events),
    history: clone(world.history),
    capacityLimitedTicks: world.capacityLimitedTicks,
    conversionTotals: { ...world.conversionTotals },
    branches: clone(world.branches),
    objects: clone(world.objects),
    sample: world.sample === null ? null : encodeSample(world.sample),
  };
}

/** Entity columns added at each world schema version (filled with emptyValueOf when migrating older states). */
export const COLUMNS_ADDED_IN: Readonly<Record<number, readonly (typeof ENTITY_COLUMNS)[number][0][]>> = {
  2: ['dryTimer'],
  // Schema 4 (Phase 3 foundation; D-0035): every column from `filmSeconds` on.
  4: ENTITY_COLUMNS.slice(FIRST_HASH_NEUTRAL_COLUMN).map(([n]) => n),
};

/**
 * Bring an older world state up to SCHEMA_VERSION by copy (the input is never modified; CLAUDE.md
 * "migration by copy"). Each step only adds what that version introduced, with the value an older
 * world implicitly had: dryTimer 0, because no organism could rest before schema 2; at schema 3 an
 * empty trait record and journal, because nothing of either was recorded before it; at schema 4 every
 * Phase 3 column at its empty value (−1 for link slots: a 0 would point at slot 0), no food objects and
 * no held sample, because none of these existed before it.
 */
export function migrateWorldState(state: WorldState): WorldState {
  if (!Number.isInteger(state.schemaVersion) || state.schemaVersion < 1) throw new Error(`unsupported world schema ${String(state.schemaVersion)}`);
  if (state.schemaVersion > SCHEMA_VERSION) throw new Error(`world schema ${state.schemaVersion} is newer than this build (${SCHEMA_VERSION})`);
  let s = state;
  for (let v = state.schemaVersion + 1; v <= SCHEMA_VERSION; v++) {
    const columns: Record<string, EncodedArray> = { ...s.entities.columns };
    for (const name of COLUMNS_ADDED_IN[v] ?? []) {
      if (columns[name]) continue;
      const dtype = ENTITY_COLUMNS.find(([n]) => n === name)![1];
      const Ctor = { f64: Float64Array, f32: Float32Array, i32: Int32Array, u32: Uint32Array, u16: Uint16Array, u8: Uint8Array }[dtype];
      const arr = new Ctor(s.entities.highWater);
      const empty = emptyValueOf(name);
      if (empty !== 0) arr.fill(empty);
      columns[name] = encodeArray(arr);
    }
    s = { ...s, schemaVersion: v, entities: { ...s.entities, columns } };
    // Schema 3 (P2.8): history gains trait samples and the dish's journal, both empty for an older world.
    if (v === 3) s = { ...s, history: historyForSchema3(s.history, s.tick) };
    // Schema 4 (Phase 3 foundation): no finite food objects and no held sample.
    if (v === 4) s = { ...s, objects: [], sample: null };
  }
  // SPEC §14.5: a migration tags provenance. Not in the state hash (stateHash never reads provenance).
  if (state.schemaVersion < SCHEMA_VERSION) {
    const p = s.content.provenance;
    s = { ...s, content: { ...s.content, provenance: { ...p, migratedFrom: [...(p.migratedFrom ?? []), state.schemaVersion] } } };
  }
  return s;
}

export function deserializeWorld(input: WorldState): World {
  if (input.format !== 'pixelmeba-world') throw new Error('not a Pixelmeba world state');
  const state = migrateWorldState(input);
  const world = createEmptyWorld({ worldId: state.worldId, seed: state.seed, settings: state.settings, content: state.content });
  world.tick = state.tick;
  decodeInto(state.grid.substrate, world.grid.substrate);
  decodeInto(state.grid.structure, world.grid.structure);
  decodeInto(state.grid.lightBase, world.grid.lightBase);
  decodeInto(state.grid.shade, world.grid.shade);
  world.grid.geometryVersion = state.grid.geometryVersion;
  for (const key of Object.keys(state.fields).sort()) {
    if (!isFieldId(key)) throw new Error(`unknown field ${key} in save`);
    const target = world.fields[key];
    if (!target) throw new Error(`field ${key} is not enabled by this world's manifest`);
    if (state.fields[key]!.length !== CELL_COUNT) throw new Error(`field ${key} has wrong length`);
    decodeInto(state.fields[key]!, target);
  }
  for (const [name] of ENTITY_COLUMNS) {
    const enc = state.entities.columns[name];
    if (!enc) throw new Error(`entity column ${name} missing`);
    decodeInto(enc, world.ents.cols[name]);
  }
  world.ents.recount();
  for (const g of state.genomes) world.genomes.intern(g);
  if (world.genomes.size !== state.genomes.length) throw new Error('duplicate genomes in save');
  Object.assign(world.lineage, JSON.parse(JSON.stringify(state.lineage)));
  Object.assign(world.ledger, JSON.parse(JSON.stringify(state.ledger)));
  // Energy categories added later start at zero in older saves (diagnostics only; never conserved).
  world.ledger.energy = { ...createLedger().energy, ...world.ledger.energy };
  world.commands.pending = JSON.parse(JSON.stringify(state.commands.pending)) as Command[];
  world.commands.log = JSON.parse(JSON.stringify(state.commands.log)) as Command[];
  world.commands.nextSeq = state.commands.nextSeq;
  Object.assign(world.counters, state.counters);
  Object.assign(world.events, JSON.parse(JSON.stringify(state.events)));
  Object.assign(world.history, JSON.parse(JSON.stringify(state.history)));
  // Journal entries and trait samples are display records: malformed ones are dropped, never fatal (P2.8).
  sanitizeHistoryRecords(world.history);
  world.capacityLimitedTicks = state.capacityLimitedTicks;
  world.capacityHitThisTick = false;
  if (state.conversionTotals) Object.assign(world.conversionTotals, state.conversionTotals);
  if (state.branches) Object.assign(world.branches, JSON.parse(JSON.stringify(state.branches)));
  for (const o of state.objects ?? []) world.objects.push(JSON.parse(JSON.stringify(o)) as FoodObject);
  world.sample = state.sample ? decodeSample(state.sample) : null;
  updateDerived(world);
  rebuildIndex(world);
  return world;
}

/** Hash of everything that influences future simulation (SPEC §15). */
export function stateHash(world: World): string {
  const h = new StateHasher();
  h.number(world.seed).number(world.tick);
  h.string(canonicalJson(world.settings));
  h.string(world.content.manifest.contentHash).number(world.content.manifest.contentVersion);
  h.typed(world.grid.substrate).typed(world.grid.structure).typed(world.grid.lightBase).typed(world.grid.shade);
  for (const id of allocatedFieldIds(world.fields)) {
    h.string(id);
    h.typed(world.fields[id]!);
  }
  const hw = world.ents.highWater;
  h.number(hw);
  ENTITY_COLUMNS.forEach(([name], k) => {
    const arr = world.ents.cols[name] as unknown as Float64Array;
    // D-0035: a column from schema 4 on is hashed only while some slot holds a non-empty value.
    if (k >= FIRST_HASH_NEUTRAL_COLUMN && isEmptyColumn(arr, hw, emptyValueOf(name))) return;
    h.string(name);
    h.typed(arr.subarray(0, hw));
  });
  h.number(world.genomes.size);
  for (const g of world.genomes.list) h.string(genomeKey(g));
  const L = world.lineage;
  h.number(L.base);
  for (const arr of [L.parent, L.genome, L.birthTick, L.generation, L.species, L.entityId, L.deathTick, L.deathCause, L.origin, L.mutFlags, L.mutLocus, L.mutDelta, L.mutModule]) {
    h.number(arr.length);
    for (const v of arr) h.number(v);
  }
  const c = world.counters;
  h.number(c.nextEntityId).number(c.nextBirthId);
  const led = world.ledger;
  for (const t of [led.initial, led.inputs, led.exports, led.roundoff]) h.number(t.c).number(t.n).number(t.m);
  h.number(led.exchangeC);
  h.string(canonicalJson(world.commands.pending.map((p) => ({ id: p.commandId, seq: p.seq, t: p.targetTick, p: p.payload }))));
  h.number(world.commands.nextSeq);
  h.string(canonicalJson(world.branches));
  // Schema 4 stores and counters (D-0035): hashed only when non-empty / moved from their initial value.
  if (world.objects.length > 0) h.string('objects').string(canonicalJson(world.objects));
  if (world.sample !== null) h.string('sample').string(canonicalJson(encodeSample(world.sample)));
  if (c.nextObjectId !== 1) h.string('nextObjectId').number(c.nextObjectId);
  return h.hex();
}

/** True when every slot in [0, hw) holds `empty` (Object.is, so a −0 in a 0 column counts as state, as the raw bytes do). */
function isEmptyColumn(arr: ArrayLike<number>, hw: number, empty: number): boolean {
  for (let i = 0; i < hw; i++) if (!Object.is(arr[i], empty)) return false;
  return true;
}
