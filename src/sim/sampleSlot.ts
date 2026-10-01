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
import { foodObjectProblem, objectTotals, type FoodObject } from './objects';
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
  if (!Number.isInteger(s.radius) || s.radius < 0 || s.radius > 6) return 'the sample has an invalid radius';
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
