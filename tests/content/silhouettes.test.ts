/**
 * UX §6.1: "every species is also distinguishable by silhouette and pattern in grayscale". For every
 * pair of same-size species with art (Phase 1 and Phase 3), compare one representative frame each:
 * loop frame 0 facing East (move, else idle); fungi their straight East–West connection tile (mask 10,
 * E = 2 + W = 8); V01 its inspection glyph.
 *   - Silhouette: the alpha masks differ in ≥ 12 % of the union of their pixels.
 *   - Exception: a pair that really shares its outline (alpha difference < 12 %) and that UX §6.3
 *     describes alike (B03/B07 "curved rod"; shipped B01/B06 rods) must instead differ in grayscale
 *     luminance on ≥ 12 % of the pixels both bodies cover. The exception is only taken when needed:
 *     every listed pair must measure < 12 % alpha, so it cannot shelter a pair that would pass the
 *     stricter rule (F01/F02, "threads" in §6.3, differ in outline — thin lace vs thick cord — and are
 *     held to the alpha rule, so F02 losing its cord shape fails even if it keeps its copper colours).
 *   - Every pair's grayscale pattern differs: ≥ 12 % of union pixels differ in alpha or in luminance.
 * A pixel's luminance "differs" when the Rec. 709 gray values (as tools/lib/png toGrayscale and the
 * asset previewer compute them) are ≥ 32 of 255 apart.
 */
import { describe, expect, it } from 'vitest';
import { SPRITES } from '../../art/src/index';
import { hexToRgba, P } from '../../art/src/palette';
import type { Px } from '../../art/src/px';
import type { SpriteDef } from '../../art/src/sprite';

const MIN_FRACTION = 0.12;
const LUMA_STEP = 32;
/**
 * Pairs that share an outline and are told apart by value and pattern. B03|B07: UX §6.3 "B03 curved
 * rod" / "B07 curved rod with amber tip". B01|B06 is the shipped Phase 1 pair "compact rod with pale
 * mid band" / "short rod with three notches" (alpha difference 7.0 %, luminance 31 %): that art is
 * kept byte-identical in Phase 3, so the pair is held to the luminance rule (needs an owner ruling or
 * a DECISIONS.md entry; see docs/reports/reviews/g3-wave-1/art-organisms-fix1.md).
 */
const SAME_OUTLINE = new Set(['B03|B07', 'B01|B06']);

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
    if (SAME_OUTLINE.has(k)) {
      // The exception is taken only where the outline really is shared.
      expect(s.alpha, `${k} is listed as a shared outline but differs in alpha; drop it from SAME_OUTLINE`).toBeLessThan(MIN_FRACTION);
      expect(s.luma, `${k} luminance on shared pixels`).toBeGreaterThanOrEqual(MIN_FRACTION);
    } else expect(s.alpha, `${k} alpha difference / union`).toBeGreaterThanOrEqual(MIN_FRACTION);
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
    // F02 drawn with F01's tiles but its own copper palette keeps distinct values, yet fails the
    // silhouette rule that F01|F02 are held to (UX §6.3: F01 lace threads vs F02 copper cords).
    const f01 = SPRITES.find((d) => d.speciesId === 'F01')!;
    const f02 = SPRITES.find((d) => d.speciesId === 'F02')!;
    expect(SAME_OUTLINE.has('F01|F02')).toBe(false);
    const f02AsLace = compare(gray(f01, representative(f01)), gray({ ...f02, animations: f01.animations }, representative(f01)));
    expect(f02AsLace.alpha).toBeLessThan(MIN_FRACTION);
    expect(stats(f01, f02).alpha).toBeGreaterThanOrEqual(MIN_FRACTION);
  });
});

/** Body (non-outline) and outline bounding boxes of a frame; index 1 is the outline in every palette. */
function boxes(f: Px): { body: [number, number]; all: { x0: number; y0: number; x1: number; y1: number } } {
  let bx0 = f.w, by0 = f.h, bx1 = -1, by1 = -1, x0 = f.w, y0 = f.h, x1 = -1, y1 = -1;
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++) {
      const v = f.get(x, y);
      if (v === 0) continue;
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
      if (v !== 1) [bx0, by0, bx1, by1] = [Math.min(bx0, x), Math.min(by0, y), Math.max(bx1, x), Math.max(by1, y)];
    }
  return { body: [bx1 - bx0 + 1, by1 - by0 + 1], all: { x0, y0, x1, y1 } };
}

describe('small body size (UX §6.2 "Small (bacteria, yeast, algae, parasites): 16×16 frames, 8–12 px visible body")', () => {
  // Phase 3 small organisms (fungus tiles join edge to edge by design; V01 is a virus glyph, not a
  // small-organism body). Phase 1 B04 (16×6, a bead chain) shipped before this check and is kept
  // byte-identical. Loop frames (move or idle) are the body as normally seen; reproduction may stretch.
  const small = SPRITES.filter((d) => d.size === 16 && !d.form && !['A01', 'B01', 'B04', 'B06'].includes(d.speciesId));
  it('covers the Phase 3 small organisms', () => {
    expect(small.map((d) => d.speciesId).sort()).toEqual(['B02', 'B03', 'B05', 'B07', 'B08', 'X01', 'Y01', 'Y02']);
  });
  it.each(small.map((d) => [d.speciesId, d] as const))('%s: every loop frame has an 8–12 px body and a clear 1 px margin', (id, d) => {
    const loop = d.animations.move ?? d.animations.idle;
    loop!.frames.forEach((f, i) => {
      const { body, all } = boxes(f);
      const long = Math.max(...body);
      expect(long, `${id} loop frame ${i} body ${body.join('×')}`).toBeGreaterThanOrEqual(8);
      expect(long, `${id} loop frame ${i} body ${body.join('×')}`).toBeLessThanOrEqual(12);
      expect([all.x0, all.y0], `${id} loop frame ${i} outline touches the top/left frame edge`).not.toContain(0);
      expect([all.x1, all.y1], `${id} loop frame ${i} outline touches the bottom/right frame edge`).not.toContain(15);
    });
  });
});

describe('state cues map to real state (CLAUDE.md "every visible feature maps to real state")', () => {
  it('F02 uses its transfer-pulse colour (UX §6.1 "pulse #F6D7B0") only in the pulse frames, never on tips, buds, tiles or the thumbnail', () => {
    const f02 = SPRITES.find((d) => d.speciesId === 'F02')!;
    const pulseIdx = new Set(f02.palette.flatMap((c, i) => (i > 0 && c.toUpperCase() === P.cordPulse.toUpperCase() ? [i] : [])));
    expect(pulseIdx.size).toBeGreaterThan(0);
    const uses = (f: Px) => Array.from(f.data).filter((v) => pulseIdx.has(v)).length;
    for (const [name, a] of Object.entries(f02.animations)) {
      a.frames.forEach((f, i) => {
        if (name === 'pulse') expect(uses(f), `pulse/${i}`).toBeGreaterThan(0);
        else expect(uses(f), `${name}/${i} shows the pulse colour`).toBe(0);
      });
    }
  });
});
