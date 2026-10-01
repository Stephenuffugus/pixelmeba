/**
 * UX §6.1: "every species is also distinguishable by silhouette and pattern in grayscale". For every
 * pair of same-size species with art (Phase 1 and Phase 3), compare one representative frame each:
 * loop frame 0 facing East (move, else idle); fungi their straight East–West connection tile (mask 10,
 * E = 2 + W = 8); V01 its inspection glyph.
 *   - Silhouette: the alpha masks differ in ≥ 12 % of the union of their pixels.
 *   - Exception: pairs UX §6.3 gives the same outline (B03/B07 curved rods, F01/F02 threads) must
 *     instead differ in grayscale luminance on ≥ 12 % of the pixels both bodies cover.
 *   - Every pair's grayscale pattern differs: ≥ 12 % of union pixels differ in alpha or in luminance.
 * A pixel's luminance "differs" when the Rec. 709 gray values (as tools/lib/png toGrayscale and the
 * asset previewer compute them) are ≥ 32 of 255 apart.
 */
import { describe, expect, it } from 'vitest';
import { SPRITES } from '../../art/src/index';
import { hexToRgba } from '../../art/src/palette';
import type { Px } from '../../art/src/px';
import type { SpriteDef } from '../../art/src/sprite';

const MIN_FRACTION = 0.12;
const LUMA_STEP = 32;
/**
 * UX §6.3 gives these pairs the same outline; they are told apart by value and pattern. B01|B06 is
 * the shipped Phase 1 pair "compact rod" / "short rod" (alpha difference 7.0 %, luminance 31 %): that
 * art is kept byte-identical in Phase 3, so the pair is held to the luminance rule (proposed decision
 * in docs/reports/reviews/g3-wave-1/art-organisms-build.md).
 */
const SAME_OUTLINE = new Set(['B03|B07', 'F01|F02', 'B01|B06']);

function representative(def: SpriteDef): Px {
  const a = def.form === 'fungus' ? def.animations.mask : def.form === 'virus' ? def.animations.glyph : (def.animations.move ?? def.animations.idle);
  const frame = def.form === 'fungus' ? a?.frames[10] : a?.frames[0];
  if (!frame) throw new Error(`${def.assetId}: no representative frame`);
  return frame;
}

/** Gray value per pixel (−1 = transparent). */
function gray(def: SpriteDef, f: Px): Int16Array {
  const out = new Int16Array(f.w * f.h).fill(-1);
  for (let i = 0; i < f.data.length; i++) {
    const idx = f.data[i]!;
    if (idx === 0) continue;
    const [r, g, b] = hexToRgba(def.palette[idx]!);
    out[i] = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }
  return out;
}

interface PairStats {
  readonly alpha: number; // alpha-mask difference / union
  readonly luma: number; // luminance difference / shared pixels
  readonly pattern: number; // (alpha or luminance difference) / union
}

function compare(a: Int16Array, b: Int16Array): PairStats {
  let union = 0;
  let xor = 0;
  let shared = 0;
  let lumaDiff = 0;
  for (let i = 0; i < a.length; i++) {
    const ia = a[i]! >= 0;
    const ib = b[i]! >= 0;
    if (!ia && !ib) continue;
    union++;
    if (ia !== ib) xor++;
    else {
      shared++;
      if (Math.abs(a[i]! - b[i]!) >= LUMA_STEP) lumaDiff++;
    }
  }
  return { alpha: union ? xor / union : 0, luma: shared ? lumaDiff / shared : 0, pattern: union ? (xor + lumaDiff) / union : 0 };
}

const bySize = new Map<number, SpriteDef[]>();
for (const def of SPRITES) bySize.set(def.size, [...(bySize.get(def.size) ?? []), def]);
const pairs: [SpriteDef, SpriteDef][] = [];
for (const size of [...bySize.keys()].sort((x, y) => x - y)) {
  const defs = bySize.get(size)!;
  for (let i = 0; i < defs.length; i++) for (let j = i + 1; j < defs.length; j++) pairs.push([defs[i]!, defs[j]!]);
}
const key = (a: SpriteDef, b: SpriteDef) => [a.speciesId, b.speciesId].sort().join('|');
const stats = (a: SpriteDef, b: SpriteDef) => compare(gray(a, representative(a)), gray(b, representative(b)));

describe('silhouettes and grayscale patterns (UX §6.1, §6.3)', () => {
  it('covers every Phase 1 and Phase 3 sprite, grouped by frame size', () => {
    expect(SPRITES.map((d) => d.speciesId).sort()).toEqual(['A01', 'B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'F01', 'F02', 'P01', 'P02', 'P03', 'P04', 'V01', 'X01', 'Y01', 'Y02']);
    // 15 small (16×16) → 105 pairs; 4 large (32×32) → 6 pairs.
    expect(pairs).toHaveLength(105 + 6);
    for (const k of SAME_OUTLINE) expect(pairs.some(([a, b]) => key(a, b) === k), k).toBe(true);
  });

  it.each(pairs.map(([a, b]) => [key(a, b), a, b] as const))('%s differ by silhouette (or, for a shared outline, by grayscale value)', (k, a, b) => {
    const s = stats(a, b);
    if (SAME_OUTLINE.has(k)) expect(s.luma, `${k} luminance on shared pixels`).toBeGreaterThanOrEqual(MIN_FRACTION);
    else expect(s.alpha, `${k} alpha difference / union`).toBeGreaterThanOrEqual(MIN_FRACTION);
    expect(s.pattern, `${k} grayscale pattern difference / union`).toBeGreaterThanOrEqual(MIN_FRACTION);
  });

  it('the measure is not vacuous: identical frames, and a same-outline pair recoloured alike, fail it', () => {
    const b03 = SPRITES.find((d) => d.speciesId === 'B03')!;
    const b07 = SPRITES.find((d) => d.speciesId === 'B07')!;
    expect(stats(b03, b03)).toEqual({ alpha: 0, luma: 0, pattern: 0 });
    // B07 drawn with B03's palette (indices map to the same roles) keeps only its amber-head pixels apart.
    const alike = compare(gray(b03, representative(b03)), gray({ ...b07, palette: b03.palette }, representative(b07)));
    expect(alike.luma).toBeLessThan(stats(b03, b07).luma);
    // B03 and B07 really do share most of their outline (the exception is needed, not a loophole).
    expect(stats(b03, b07).alpha).toBeLessThan(MIN_FRACTION);
  });
});
