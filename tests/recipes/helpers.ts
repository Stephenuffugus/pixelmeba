/** Helpers for recipe and What if? tests: field-by-field world comparison and raw-content mutation. */
import type { RawPacks } from '../../src/sim/content/registry';
import { base64ToBytes } from '../../src/sim/hash';
import { serializeWorld, type EncodedArray } from '../../src/sim/serialize';
import type { World } from '../../src/sim/world';

export interface Difference {
  /** e.g. "fields.sugar[8240]", "ledger.inputs.c", "content.provenance.variant". */
  readonly path: string;
  readonly a: unknown;
  readonly b: unknown;
}

const TYPED: Record<string, new (buf: ArrayBuffer, off: number, len: number) => ArrayLike<number>> = {
  f64: Float64Array,
  f32: Float32Array,
  i32: Int32Array,
  u32: Uint32Array,
  u16: Uint16Array,
  u8: Uint8Array,
};

function isEncoded(v: unknown): v is EncodedArray {
  return typeof v === 'object' && v !== null && typeof (v as EncodedArray).dtype === 'string' && typeof (v as EncodedArray).b64 === 'string';
}

function decode(enc: EncodedArray): ArrayLike<number> {
  const bytes = base64ToBytes(enc.b64);
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new TYPED[enc.dtype]!(copy.buffer, 0, enc.length);
}

function same(x: unknown, y: unknown): boolean {
  return x === y || (typeof x === 'number' && typeof y === 'number' && Number.isNaN(x) && Number.isNaN(y));
}

function walk(x: unknown, y: unknown, path: string, out: Difference[]): void {
  if (isEncoded(x) && isEncoded(y)) {
    if (x.dtype !== y.dtype || x.length !== y.length) {
      out.push({ path: `${path}.shape`, a: `${x.dtype}[${x.length}]`, b: `${y.dtype}[${y.length}]` });
      return;
    }
    const ax = decode(x);
    const ay = decode(y);
    for (let i = 0; i < ax.length; i++) if (!same(ax[i], ay[i])) out.push({ path: `${path}[${i}]`, a: ax[i], b: ay[i] });
    return;
  }
  if (Array.isArray(x) && Array.isArray(y)) {
    if (x.length !== y.length) out.push({ path: `${path}.length`, a: x.length, b: y.length });
    for (let i = 0; i < Math.min(x.length, y.length); i++) walk(x[i], y[i], `${path}.${i}`, out);
    return;
  }
  if (typeof x === 'object' && x !== null && typeof y === 'object' && y !== null && !Array.isArray(x) && !Array.isArray(y)) {
    const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
    for (const k of keys) walk((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k], path ? `${path}.${k}` : k, out);
    return;
  }
  if (!same(x, y)) out.push({ path, a: x, b: y });
}

/**
 * Every difference between two worlds' complete serialized state (the save payload: grid, every
 * field cell, entity columns, genomes, lineage, ledger, commands, events, history, content and
 * provenance), element by element.
 */
export function diffWorlds(a: World, b: World): Difference[] {
  const out: Difference[] = [];
  const sa = JSON.parse(JSON.stringify(serializeWorld(a))) as unknown;
  const sb = JSON.parse(JSON.stringify(serializeWorld(b))) as unknown;
  walk(sa, sb, '', out);
  return out;
}

/** Cell index from a diff path like "fields.sugar[8240]". */
export function cellOf(path: string): number {
  const m = /\[(\d+)\]$/.exec(path);
  if (!m) throw new Error(`no cell in ${path}`);
  return Number(m[1]);
}

export function cloneRaw(raw: RawPacks): RawPacks {
  return JSON.parse(JSON.stringify(raw)) as RawPacks;
}

type Collection = Exclude<keyof RawPacks, 'manifest' | 'loci'>;

/** A copy of the raw packs with one file's data edited (the validator-test pattern). */
export function mutateRaw(raw: RawPacks, collection: Collection | 'manifest', file: string, fn: (d: Record<string, unknown>) => void): RawPacks {
  const r = cloneRaw(raw);
  const list = collection === 'manifest' ? [r.manifest] : (r[collection] as { file: string; data: unknown }[]);
  const f = list.find((x) => x.file.endsWith(file));
  if (!f) throw new Error(`no ${file}`);
  fn(f.data as Record<string, unknown>);
  return r;
}

/** A copy of the raw packs with one extra file in a collection. */
export function addRaw(raw: RawPacks, collection: Collection, file: string, data: unknown): RawPacks {
  const r = cloneRaw(raw);
  (r[collection] as { file: string; data: unknown }[]).push({ file, data });
  return r;
}
