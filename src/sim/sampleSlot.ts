/**
 * The sample slot (SPEC §3.4, §10.5; D-0037; Phase 3 foundation, world schema 4).
 *
 * The store only: `world.sample` is null or the single held sample, an accounted compartment of the
 * source world (src/sim/ledger.ts computeTotals counts its carbon, nutrient and mineral), so a move
 * into it is balanced. Take, Transfer, Cancel and Discard (P3.5) come later.
 *
 * In memory each held organism is a full entity row with its original slot (Cancel restores it there
 * exactly). In a save the rows are typed payloads, one array per entity column in that column's dtype
 * (like the entity store's columns), never JSON numbers: JSON turns −0 into 0 while the state hash and
 * a later move read the exact values. Held cells carry each field's value by cell offset from the
 * origin, also as a typed payload.
 */
import { ENTITY_COLUMNS, type ColumnName } from './entities';
import { FIELD_DEFS, isFieldId, type FieldId } from './fields';
import { base64ToBytes, canonicalJson, typedToBase64 } from './hash';
import { cellIndex, inBounds, inMask, isLabRadius, ST_BEAD, ST_NONE } from './grid';
import { foodObjectProblem, foodObjectsProblem, objectTotals, type FoodObject } from './objects';
import type { SavedGenome } from './serialize';

export const SAMPLE_MODES = ['life', 'dissolved', 'deposits', 'all'] as const;
export type SampleMode = (typeof SAMPLE_MODES)[number];

/** One held organism: every entity column's value, and the slot it came from. */
export interface SampleRow {
  readonly slot: number;
  readonly cols: Readonly<Record<ColumnName, number>>;
}

/** One held cell's field contents, by offset from the sample origin. */
export interface SampleCell {
  readonly dx: number;
  readonly dy: number;
  readonly fields: Readonly<Partial<Record<FieldId, number>>>;
}

/** A genome a held row refers to: its index in the source world's genome table and a copy of it. */
export interface SampleGenome {
  readonly index: number;
  readonly genome: SavedGenome;
}

export interface SampleSlot {
  /** Transaction id (cross-dish transfers, Phase 6, use it for prepare/commit). */
  readonly txId: string;
  /** commands.nextSeq of the sampleTake command (D-0037: Cancel returns nextSeq to it). */
  readonly seq: number;
  readonly mode: SampleMode;
  readonly origin: readonly [number, number];
  readonly radius: number;
  readonly rows: readonly SampleRow[];
  readonly cells: readonly SampleCell[];
  readonly objects: readonly FoodObject[];
  readonly genomes: readonly SampleGenome[];
}

// ---- Saved form ---------------------------------------------------------------------------------

type DType = 'f64' | 'f32' | 'i32' | 'u32' | 'u16' | 'u8';
export interface SavedTyped {
  readonly dtype: DType;
  readonly length: number;
  readonly b64: string;
}

export interface SavedSample {
  readonly txId: string;
  readonly seq: number;
  readonly mode: SampleMode;
  readonly origin: readonly [number, number];
  readonly radius: number;
  /** Held rows: original slots (i32) and one typed payload per entity column, each of length rows. */
  readonly rows: {
    readonly count: number;
    readonly slots: SavedTyped;
    readonly columns: Readonly<Record<string, SavedTyped>>;
  };
  /** Held cells: offsets in JSON (small integers) and the field values as one f64 payload in `ids` order. */
  readonly cells: readonly {
    readonly dx: number;
    readonly dy: number;
    readonly ids: readonly FieldId[];
    readonly values: SavedTyped;
  }[];
  readonly objects: readonly FoodObject[];
  readonly genomes: readonly SampleGenome[];
}

const CTOR = {
  f64: Float64Array,
  f32: Float32Array,
  i32: Int32Array,
  u32: Uint32Array,
  u16: Uint16Array,
  u8: Uint8Array,
} as const;
const BYTES: Readonly<Record<DType, number>> = { f64: 8, f32: 4, i32: 4, u32: 4, u16: 2, u8: 1 };

function enc(dtype: DType, values: readonly number[]): SavedTyped {
  const arr = new CTOR[dtype](values.length);
  for (let k = 0; k < values.length; k++) arr[k] = values[k]!;
  return { dtype, length: values.length, b64: typedToBase64(arr) };
}

/** Decode a typed payload (throws on a malformed one). */
function dec(t: SavedTyped, dtype: DType, length: number): ArrayLike<number> {
  if (
    typeof t !== 'object' ||
    t === null ||
    t.dtype !== dtype ||
    t.length !== length ||
    typeof t.b64 !== 'string'
  )
    throw new Error(`sample payload is not ${dtype}[${length}]`);
  const bytes = base64ToBytes(t.b64);
  if (bytes.length !== length * BYTES[dtype]) throw new Error('sample payload has the wrong byte length');
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new CTOR[dtype](copy.buffer, 0, length);
}

export function encodeSample(s: SampleSlot): SavedSample {
  const columns: Record<string, SavedTyped> = {};
  for (const [name, dtype] of ENTITY_COLUMNS)
    columns[name] = enc(
      dtype,
      s.rows.map((r) => r.cols[name]),
    );
  return {
    txId: s.txId,
    seq: s.seq,
    mode: s.mode,
    origin: [s.origin[0], s.origin[1]],
    radius: s.radius,
    rows: {
      count: s.rows.length,
      slots: enc(
        'i32',
        s.rows.map((r) => r.slot),
      ),
      columns,
    },
    cells: s.cells.map((c) => {
      const ids = (Object.keys(c.fields) as FieldId[]).filter(isFieldId).sort();
      return {
        dx: c.dx,
        dy: c.dy,
        ids,
        values: enc(
          'f64',
          ids.map((id) => c.fields[id]!),
        ),
      };
    }),
    objects: s.objects.map((o) => ({ id: o.id, cell: o.cell, kind: o.kind, pools: { ...o.pools }, n: o.n })),
    genomes: s.genomes.map((g) => JSON.parse(JSON.stringify(g)) as SampleGenome),
  };
}

/** Rebuild a held sample from its saved form (throws on a malformed one; the save import checks first). */
export function decodeSample(s: SavedSample): SampleSlot {
  const count = s.rows.count;
  const slots = dec(s.rows.slots, 'i32', count);
  const cols = ENTITY_COLUMNS.map(([name, dtype]) => {
    const t = s.rows.columns[name];
    if (!t) throw new Error(`sample column ${name} missing`);
    return [name, dec(t, dtype, count)] as const;
  });
  const rows: SampleRow[] = [];
  for (let r = 0; r < count; r++) {
    const row: Record<string, number> = {};
    for (const [name, arr] of cols) row[name] = arr[r]!;
    rows.push({ slot: slots[r]!, cols: row as Record<ColumnName, number> });
  }
  const cells = s.cells.map((c) => {
    const values = dec(c.values, 'f64', c.ids.length);
    const fields: Partial<Record<FieldId, number>> = {};
    c.ids.forEach((id, k) => (fields[id] = values[k]!));
    return { dx: c.dx, dy: c.dy, fields };
  });
  return {
    txId: s.txId,
    seq: s.seq,
    mode: s.mode,
    origin: [s.origin[0], s.origin[1]],
    radius: s.radius,
    rows,
    cells,
    objects: s.objects.map((o) => ({ id: o.id, cell: o.cell, kind: o.kind, pools: { ...o.pools }, n: o.n })),
    genomes: s.genomes.map((g) => JSON.parse(JSON.stringify(g)) as SampleGenome),
  };
}

// ---- Accounting ---------------------------------------------------------------------------------

/**
 * Carbon, nutrient and mineral the sample holds: rows (B + mealC, N + mealN, shell + jacket), cells
 * (each field by its material, viral units at 0.01 C) and food objects.
 */
export function sampleTotals(s: SampleSlot | null): { c: number; n: number; m: number } {
  if (s === null) return { c: 0, n: 0, m: 0 };
  let c = 0;
  let n = 0;
  let m = 0;
  for (const r of s.rows) {
    c += r.cols.B + r.cols.mealC;
    n += r.cols.N + r.cols.mealN;
    m += r.cols.boundMineral + r.cols.jacketMineral;
  }
  for (const cell of s.cells) {
    for (const id of Object.keys(cell.fields).sort()) {
      if (!isFieldId(id)) continue;
      const def = FIELD_DEFS[id];
      const amount = cell.fields[id]! * (def.carbonPerUnit ?? 1);
      if (def.material === 'carbon') c += amount;
      else if (def.material === 'nutrient') n += amount;
      else if (def.material === 'mineral') m += amount;
    }
  }
  const o = objectTotals(s.objects);
  c += o.c;
  n += o.n;
  return { c, n, m };
}

// ---- Import integrity ---------------------------------------------------------------------------

export interface SampleCheckContext {
  /** The world's species ids in table order. */
  readonly speciesIds: readonly string[];
  /** The world's genome table. */
  readonly genomes: readonly SavedGenome[];
  /**
   * P3.5 (D-0043, SPEC §14.3): the world's entity columns over [0, highWater), so a held row's slot and
   * birthId can be checked against the living organisms (Cancel restores into that slot).
   */
  readonly entities?: { readonly alive: ArrayLike<number>; readonly birthId: ArrayLike<number>; readonly highWater: number };
  /**
   * P3.5 fix 1: where the sample would go back to on Cancel. The grid's structure codes (held cells and
   * objects must be open dish cells), the world's own food objects and object counter (held objects
   * must not clash with them), the command counter and log (the take is the latest command) and the
   * birth counter (a held organism was born here).
   */
  readonly world?: {
    readonly structure: ArrayLike<number>;
    readonly objects: readonly FoodObject[];
    readonly nextObjectId: number;
    readonly nextSeq: number;
    readonly nextBirthId: number;
    readonly log: readonly LoggedCommand[];
  };
}

/** The part of a logged command the sample check reads. */
interface LoggedCommand {
  readonly seq: number;
  readonly payload: { readonly kind: string };
}

/** Pools a held row may never hold negative (as the save import checks for living organisms). */
const NONNEGATIVE_COLUMNS = ['B', 'N', 'E', 'H', 'age', 'mealC', 'mealN', 'boundMineral', 'jacketMineral'] as const;

/** Held references that must resolve to another held row and be mutual (a prey link may be stale; D-0050). */
const HELD_REFS: readonly (readonly [ColumnName, ColumnName, ColumnName | null])[] = [
  ['hostSlot', 'hostBirthId', 'parasiteSlot'],
  ['parasiteSlot', 'parasiteBirthId', 'hostSlot'],
  ['fLink0', 'fLinkB0', null],
  ['fLink1', 'fLinkB1', null],
  ['fLink2', 'fLinkB2', null],
  ['fLink3', 'fLinkB3', null],
  ['aLink0', 'aLinkB0', null],
  ['aLink1', 'aLinkB1', null],
];

/**
 * P3.5 (D-0043): rows that could not be restored by Cancel: a negative pool, an unknown life state, a
 * slot or birthId shared with a living organism or another held row, or a link or host pair that does
 * not lead, mutually, to another held row (a sample holds whole units only).
 */
function heldRowsProblem(held: SampleSlot, ctx: SampleCheckContext): string | null {
  const slots: number[] = [];
  const births: number[] = [];
  for (const r of held.rows) {
    for (const k of NONNEGATIVE_COLUMNS) if (r.cols[k] < 0) return `a sample row has a negative ${k}`;
    const life = r.cols.lifeState;
    if (!Number.isInteger(life) || life < 0 || life > 3) return 'a sample row has an unknown life state';
    if (slots.includes(r.slot)) return 'two sample rows share a slot';
    if (births.includes(r.cols.birthId)) return 'two sample rows share a birth identity';
    slots.push(r.slot);
    births.push(r.cols.birthId);
    const e = ctx.entities;
    if (e) {
      if (r.slot < e.highWater && e.alive[r.slot] === 1) return 'a sample row’s slot is taken by a living organism';
      for (let i = 0; i < e.highWater; i++)
        if (e.alive[i] === 1 && e.birthId[i] === r.cols.birthId) return 'a sample row shares a birth identity with a living organism';
    }
  }
  for (const r of held.rows) {
    const pr = r.cols.preySlot;
    if (!Number.isInteger(pr) || pr < -1 || pr >= 6000) return 'a sample row has a prey link outside the dish';
    for (const [sc, bc, back] of HELD_REFS) {
      const p = r.cols[sc];
      if (p === -1) continue;
      const partner = held.rows.find((x) => x.slot === p);
      if (!partner || partner.cols.birthId !== r.cols[bc] || p === r.slot) return 'a sample row is linked to an organism the sample does not hold';
      if (back) {
        if (partner.cols[back] !== r.slot) return 'a held host and parasite do not refer to each other';
      } else {
        const birthCol = (c: string) => c.replace(/^fLink/, 'fLinkB').replace(/^aLink/, 'aLinkB') as ColumnName;
        const family = sc.startsWith('fLink') ? ['fLink0', 'fLink1', 'fLink2', 'fLink3'] : ['aLink0', 'aLink1'];
        if (!family.some((f) => partner.cols[f as ColumnName] === r.slot && partner.cols[birthCol(f)] === r.cols.birthId))
          return 'a held link is not symmetric';
      }
    }
  }
  return null;
}

/**
 * P3.5 fix 1: whether Cancel could put the sample back. Held cells must be distinct, open (no stone or
 * wall) cells inside the dish; held rows' centres inside the dish with birthIds below the birth counter;
 * held objects must pass the world objects' own checks together with the world's objects (unique
 * ascending ids below the counter, one per cell, in the dish and off structures); the take's seq must be
 * at most the command counter, and every logged command from it on must be the take or a transfer
 * attempt (Cancel drops those entries and returns the counter to that seq).
 */
function heldPlacementProblem(held: SampleSlot, ctx: SampleCheckContext): string | null {
  const w = ctx.world;
  if (!w) return null;
  const [ox, oy] = held.origin;
  if (!inBounds(ox, oy)) return 'the sample origin lies outside the dish area';
  const seen: number[] = [];
  for (const c of held.cells) {
    const x = ox + c.dx;
    const y = oy + c.dy;
    if (!inBounds(x, y) || !inMask(x, y)) return `a sample cell lies outside the dish (offset ${c.dx}, ${c.dy})`;
    const i = cellIndex(x, y);
    const st = w.structure[i];
    if (st !== ST_NONE && st !== ST_BEAD) return `a sample cell lies on a stone or wall (offset ${c.dx}, ${c.dy})`;
    if (seen.includes(i)) return 'two sample cells share a cell';
    seen.push(i);
  }
  for (const r of held.rows) {
    const x = Math.floor(r.cols.x);
    const y = Math.floor(r.cols.y);
    if (!inBounds(x, y) || !inMask(x, y)) return 'a sample row lies outside the dish';
    if (!Number.isInteger(r.cols.birthId) || r.cols.birthId < 0 || !(r.cols.birthId < w.nextBirthId))
      return 'a sample row has a birth identity the dish never gave';
  }
  const merged = [...w.objects, ...held.objects].sort((a, b) => a.id - b.id);
  const objects = foodObjectsProblem(merged, w.structure, w.nextObjectId);
  if (objects) return `a sample food object clashes with the dish (${objects})`;
  if (!Number.isInteger(w.nextSeq) || held.seq > w.nextSeq) return 'the sample’s command sequence lies ahead of the dish';
  const log: readonly LoggedCommand[] = Array.isArray(w.log) ? w.log : [];
  for (const cmd of log) {
    if (!(Number(cmd?.seq) >= held.seq)) continue;
    const kind: unknown = cmd.payload?.kind;
    if (!(kind === 'sampleTransfer' || (kind === 'sampleTake' && cmd.seq === held.seq)))
      return 'the sample’s command is not the dish’s latest';
  }
  return null;
}

const GENOME_COLUMNS = ['genome', 'refGenome', 'propG0', 'propG1'] as const;

/**
 * The first problem with a saved sample (untrusted), or null. Rows must decode, hold living organisms
 * of known species whose genomes exist in the world's genome table, belong to that species and are
 * copied in `genomes`; cells must hold known fields with finite nonnegative values; objects must be
 * valid records.
 */
export function savedSampleProblem(raw: unknown, ctx: SampleCheckContext): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object') return 'the sample is not a record';
  const s = raw as SavedSample;
  if (typeof s.txId !== 'string' || s.txId.length === 0 || s.txId.length > 200)
    return 'the sample has no transaction id';
  if (!Number.isInteger(s.seq) || s.seq < 1) return 'the sample has an invalid command sequence';
  if (!(SAMPLE_MODES as readonly string[]).includes(s.mode))
    return `the sample has an unknown mode ${String(s.mode)}`;
  if (!Array.isArray(s.origin) || s.origin.length !== 2 || !s.origin.every((v) => Number.isInteger(v)))
    return 'the sample has an invalid origin';
  if (!isLabRadius(s.radius)) return 'the sample has an invalid radius';
  let held: SampleSlot;
  try {
    if (!s.rows || !Number.isInteger(s.rows.count) || s.rows.count < 0 || s.rows.count > 6000)
      return 'the sample rows are invalid';
    if (!Array.isArray(s.cells) || !Array.isArray(s.objects) || !Array.isArray(s.genomes))
      return 'the sample is incomplete';
    for (const c of s.cells as readonly (SavedSample['cells'][number] | null)[]) {
      if (typeof c !== 'object' || c === null) return 'a sample cell is invalid';
      if (!Number.isInteger(c.dx) || !Number.isInteger(c.dy) || !Array.isArray(c.ids))
        return 'a sample cell is invalid';
      if (!(c.ids as unknown[]).every((id) => typeof id === 'string' && isFieldId(id)))
        return 'a sample cell holds an unknown field';
    }
    held = decodeSample(s);
  } catch (e) {
    return `the sample cannot be read (${(e as Error).message})`;
  }
  for (const r of held.rows) {
    if (!Number.isInteger(r.slot) || r.slot < 0 || r.slot >= 6000) return 'a sample row has an invalid slot';
    for (const [name] of ENTITY_COLUMNS)
      if (!Number.isFinite(r.cols[name])) return `a sample row has a non-finite ${name}`;
    if (r.cols.alive !== 1) return 'a sample row is not a living organism';
    const sp = r.cols.species;
    if (sp >= ctx.speciesIds.length) return 'a sample row refers to an unknown species';
    for (const col of GENOME_COLUMNS) {
      const g = r.cols[col];
      if (g === -1 && col !== 'genome') continue;
      if (!Number.isInteger(g) || g < 0 || g >= ctx.genomes.length)
        return 'a sample row refers to an unknown genome';
      if (!held.genomes.some((x) => x.index === g))
        return 'a sample row refers to a genome the sample does not carry';
    }
    if (ctx.genomes[r.cols.genome]!.ancestor !== ctx.speciesIds[sp])
      return "a sample row's genome belongs to another species";
  }
  const rowsProblem = heldRowsProblem(held, ctx);
  if (rowsProblem) return rowsProblem;
  const placement = heldPlacementProblem(held, ctx);
  if (placement) return placement;
  for (const g of held.genomes) {
    if (!Number.isInteger(g.index) || g.index < 0 || g.index >= ctx.genomes.length)
      return 'the sample carries an unknown genome';
    const own = ctx.genomes[g.index]!;
    if (canonicalJson(own) !== canonicalJson(g.genome))
      return "the sample's copy of a genome differs from the dish's";
  }
  for (const c of held.cells) {
    for (const id of Object.keys(c.fields)) {
      const v = c.fields[id as FieldId]!;
      if (!Number.isFinite(v) || v < 0) return `a sample cell has an invalid ${id}`;
    }
  }
  for (const o of held.objects) {
    const p = foodObjectProblem(o);
    if (p) return `a sample food object is invalid (${p})`;
  }
  return null;
}
