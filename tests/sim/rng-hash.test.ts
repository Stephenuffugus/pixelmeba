import { describe, expect, it } from 'vitest';
import { det, detFloat, detInt, detPermutation, STREAMS } from '../../src/sim/rng';
import { canonicalJson, sha256Hex, StateHasher, typedToBase64, base64ToBytes } from '../../src/sim/hash';

describe('deterministic randomness (P0.3)', () => {
  it('is a pure function of seed, stream and keys', () => {
    expect(det(104729, STREAMS.mutQuant, 7, 0, 1)).toBe(det(104729, STREAMS.mutQuant, 7, 0, 1));
    expect(det(104729, STREAMS.mutQuant, 7, 0, 1)).not.toBe(det(104729, STREAMS.mutQuant, 7, 1, 0));
    expect(det(104729, STREAMS.mutQuant, 7)).not.toBe(det(104730, STREAMS.mutQuant, 7));
    expect(det(104729, STREAMS.mutQuant, 7)).not.toBe(det(104729, STREAMS.mutPref, 7));
  });

  it('pins known values so a mixer change is caught', () => {
    // If this fails, every saved world would redraw differently: bump evolutionRulesVersion instead.
    const snapshot = [det(1, STREAMS.decide, 0), det(104729, STREAMS.wander, 3, 12), det(0, STREAMS.placement, 2 ** 40, 1)];
    expect(snapshot).toMatchInlineSnapshot(`
      [
        2043107266,
        625425598,
        476816651,
      ]
    `);
  });

  it('floats are uniform enough and ints stay in range', () => {
    const n = 20000;
    let sum = 0;
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < n; i++) {
      const f = detFloat(42, STREAMS.jitter, i);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      sum += f;
      buckets[Math.floor(f * 10)]!++;
    }
    expect(sum / n).toBeCloseTo(0.5, 1);
    for (const b of buckets) expect(Math.abs(b - n / 10)).toBeLessThan(n / 10 * 0.1);
    for (let i = 0; i < 1000; i++) {
      const v = detInt(9, STREAMS.tiebreak, 7, i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });

  it('permutations are permutations and reproducible', () => {
    const p = detPermutation(50, 3, STREAMS.inoculate, 11);
    expect([...p].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i));
    expect(detPermutation(50, 3, STREAMS.inoculate, 11)).toEqual(p);
  });

  it('rejects non-integer or negative keys', () => {
    expect(() => det(1, STREAMS.decide, 1.5)).toThrow();
    expect(() => det(1, STREAMS.decide, -1)).toThrow();
  });
});

describe('hashing and canonical serialization (P0.3)', () => {
  it('canonical JSON sorts keys and normalizes -0', () => {
    expect(canonicalJson({ b: 1, a: [-0, { d: 2, c: 1 }] })).toBe('{"a":[0,{"c":1,"d":2}],"b":1}');
    expect(() => canonicalJson({ a: Infinity })).toThrow();
  });

  it('StateHasher is stable, order-sensitive and length-prefixed', () => {
    const h1 = new StateHasher().number(1).string('ab').typed(new Float64Array([1, 2, 3])).hex();
    const h2 = new StateHasher().number(1).string('ab').typed(new Float64Array([1, 2, 3])).hex();
    const h3 = new StateHasher().string('ab').number(1).typed(new Float64Array([1, 2, 3])).hex();
    const h4 = new StateHasher().number(1).string('ab').typed(new Float64Array([1, 2])).hex();
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).not.toBe(h4);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
    expect(new StateHasher().number(0).hex()).toBe(new StateHasher().number(-0).hex());
  });

  it('base64 round-trips typed arrays exactly', () => {
    const a = new Float64Array([0, 1.5, -2.25, 1e-300, Math.PI]);
    const bytes = base64ToBytes(typedToBase64(a));
    expect(new Float64Array(bytes.buffer)).toEqual(a);
  });

  it('sha256 matches a known vector', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
