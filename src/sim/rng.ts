/**
 * Stateless deterministic randomness (SPEC §15, ARCH §6).
 *
 * Every simulation draw is a pure function of (worldSeed, stream, keys…). Nothing but the seed is
 * saved, so reloading can never redraw a different value. Cosmetic randomness lives elsewhere.
 */

/** Frozen stream identifiers. Never rename: renaming changes every draw in every saved world. */
export const STREAMS = {
  decide: 'decide',
  tiebreak: 'tiebreak',
  wander: 'wander',
  contact: 'contact',
  infect: 'infect',
  founderInit: 'founder.init',
  founderModule: 'founder.module',
  mutQuant: 'mut.quant',
  mutPref: 'mut.pref',
  mutModule: 'mut.module',
  mutDev: 'mut.dev',
  placement: 'placement',
  jitter: 'jitter',
  inoculate: 'inoculate',
} as const;
export type StreamId = (typeof STREAMS)[keyof typeof STREAMS];

/** 32-bit finalizer (lowbias32 by Chris Wellons). Good avalanche, cheap. */
export function mix32(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** FNV-1a 32 of a string; used only to turn stream names into integers. */
export function hashString32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const streamHashCache: Record<string, number> = {};
function streamHash(stream: StreamId): number {
  const cached = streamHashCache[stream];
  if (cached !== undefined) return cached;
  const h = hashString32(stream);
  streamHashCache[stream] = h;
  return h;
}

const GOLDEN = 0x9e3779b9;
const TWO_32 = 4294967296;

function absorb(h: number, k: number, position: number): number {
  // Keys may be integers up to 2^53; absorb low and high words separately.
  const lo = k >>> 0;
  const hi = Math.floor(k / TWO_32) >>> 0;
  h = mix32((h ^ mix32(lo + Math.imul(GOLDEN, position + 1))) >>> 0);
  if (hi !== 0) h = mix32((h ^ mix32(hi + Math.imul(GOLDEN, position + 101))) >>> 0);
  return h;
}

function assertKey(k: number): void {
  if (!Number.isInteger(k) || k < 0 || k > Number.MAX_SAFE_INTEGER) {
    throw new Error(`det(): keys must be non-negative safe integers, got ${k}`);
  }
}

/** Deterministic uint32 from seed, stream and integer keys. */
export function det(seed: number, stream: StreamId, ...keys: number[]): number {
  let h = mix32((seed >>> 0) ^ GOLDEN);
  h = mix32(h ^ streamHash(stream));
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    assertKey(k);
    h = absorb(h, k, i);
  }
  return mix32(h ^ keys.length);
}

/** Deterministic float in [0, 1). */
export function detFloat(seed: number, stream: StreamId, ...keys: number[]): number {
  return det(seed, stream, ...keys) / TWO_32;
}

/** Deterministic integer in [0, n). */
export function detInt(seed: number, stream: StreamId, n: number, ...keys: number[]): number {
  if (n <= 0) throw new Error('detInt(): n must be positive');
  return Math.floor(detFloat(seed, stream, ...keys) * n);
}

/** Deterministically pick one element. */
export function detPick<T>(arr: readonly T[], seed: number, stream: StreamId, ...keys: number[]): T {
  if (arr.length === 0) throw new Error('detPick(): empty array');
  return arr[detInt(seed, stream, arr.length, ...keys)]!;
}

/** Deterministic Fisher–Yates permutation of [0, n). */
export function detPermutation(n: number, seed: number, stream: StreamId, ...keys: number[]): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = detInt(seed, stream, i + 1, ...keys, i);
    const t = out[i]!;
    out[i] = out[j]!;
    out[j] = t;
  }
  return out;
}
