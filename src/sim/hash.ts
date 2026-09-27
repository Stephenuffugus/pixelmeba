/**
 * Hashing and canonical serialization (SPEC §15, ARCH §6).
 * - StateHasher: fast synchronous 64-bit hash (two independent murmur3-style 32-bit lanes over
 *   32-bit words) for state-equality checks. Not cryptographic.
 * - sha256Hex: Web Crypto SHA-256 (browsers, workers, Node ≥ 20) for export checksums.
 */

const C1 = 0xcc9e2d51;
const C2 = 0x1b873593;

function rotl(x: number, r: number): number {
  return ((x << r) | (x >>> (32 - r))) >>> 0;
}

function fmix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class StateHasher {
  private a = 0x5bd1e995;
  private b = 0x27d4eb2f;
  private n = 0;
  private readonly f64 = new Float64Array(1);
  private readonly f64w = new Uint32Array(this.f64.buffer);

  word(w: number): this {
    let k = Math.imul(w >>> 0, C1);
    k = rotl(k, 15);
    k = Math.imul(k, C2);
    this.a ^= k;
    this.a = rotl(this.a, 13);
    this.a = (Math.imul(this.a, 5) + 0xe6546b64) >>> 0;
    let j = Math.imul((w ^ 0xa5a5a5a5) >>> 0, C2);
    j = rotl(j, 17);
    j = Math.imul(j, C1);
    this.b ^= j;
    this.b = rotl(this.b, 11);
    this.b = (Math.imul(this.b, 9) + 0x7f4a7c15) >>> 0;
    this.n++;
    return this;
  }

  number(x: number): this {
    this.f64[0] = x === 0 ? 0 : x; // normalize -0
    return this.word(this.f64w[0]!).word(this.f64w[1]!);
  }

  string(s: string): this {
    this.word(s.length);
    for (let i = 0; i < s.length; i++) this.word(s.charCodeAt(i));
    return this;
  }

  /** Hash a typed array's contents by 32-bit words (length-prefixed). */
  typed(arr: ArrayBufferView): this {
    const bytes = arr.byteLength;
    this.word(bytes);
    const whole = bytes >>> 2;
    if ((arr.byteOffset & 3) === 0) {
      const u32 = new Uint32Array(arr.buffer, arr.byteOffset, whole);
      for (let i = 0; i < whole; i++) this.word(u32[i]!);
    } else {
      const dv = new DataView(arr.buffer, arr.byteOffset, bytes);
      for (let i = 0; i < whole; i++) this.word(dv.getUint32(i * 4, true));
    }
    const u8 = new Uint8Array(arr.buffer, arr.byteOffset, bytes);
    for (let i = whole * 4; i < bytes; i++) this.word(u8[i]!);
    return this;
  }

  hex(): string {
    const a = fmix((this.a ^ this.n) >>> 0);
    const b = fmix((this.b ^ Math.imul(this.n, 0x9e3779b9)) >>> 0);
    return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
  }
}

/** Canonical JSON: sorted object keys, no whitespace, -0 → 0, rejects non-finite numbers. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`canonicalJson: non-finite number ${value}`);
    return value === 0 ? 0 : value;
  }
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (ArrayBuffer.isView(value)) throw new Error('canonicalJson: encode typed arrays explicitly');
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      const v = obj[k];
      if (v === undefined) continue;
      out[k] = canonicalize(v);
    }
    return out;
  }
  throw new Error(`canonicalJson: unsupported value of type ${typeof value}`);
}

const encoder = new TextEncoder();

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Base64 of a typed array's bytes (little-endian as stored). */
export function typedToBase64(arr: ArrayBufferView): string {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    s += String.fromCharCode(...u8.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
