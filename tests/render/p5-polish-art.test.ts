/**
 * P5.8 polish (wave 15; D-0123 MINOR 5, D-0109 taste note): the aggregation layer's ink outline, F04's outline ink
 * and V02's open lace glyph.
 *  - paintAggregationInked (speciesColors.ts): an occupied cell is its identity colour (alpha by density, as before);
 *    the empty cells around it carry the sprites' ink (palette outlineDark) on the sides facing it, `outline` texels
 *    deep, so no organism's colour is covered; the ring is at least one screen pixel at every aggregation zoom.
 *  - Every organism identity tone is >= 3:1 on water, gel and sediment by its tone or its ring (grayscale-readable:
 *    luminance contrast only; no colour coding added).
 *  - F04's sprite outline is sporeveilRing #23272B (>= 3:1 on sediment); V02's glyph is an open lace (most of its
 *    disk transparent, nothing beyond the net's rim), distinct from V01 in silhouette.
 */
import { describe, expect, it } from 'vitest';
import { P } from '../../art/src/palette';
import { SPRITES } from '../../art/src/index';
import { CELL_COUNT, GRID_W } from '../../src/sim/constants';
import { DISH_COLORS } from '../../src/render/layers';
import { AGG_INK, AGG_INK_HEX, AGG_PX, aggOutlineTexels, paintAggregationInked, speciesHex, speciesRgb } from '../../src/render/speciesColors';
import { contrastRatio, GRAPHIC_MIN, parseHex } from '../../src/ui/a11y/contrast';

const W = GRID_W * AGG_PX;
const image = () => ({ width: W, data: new Uint8ClampedArray(W * W * 4) });
const at = (img: ReturnType<typeof image>, x: number, y: number) => Array.from(img.data.slice((y * W + x) * 4, (y * W + x) * 4 + 4));

describe('aggregation identity tones with the ink outline (paintAggregationInked)', () => {
  it('the ink is the sprites’ outlineDark', () => {
    expect(AGG_INK_HEX.toUpperCase()).toBe(P.outlineDark.toUpperCase());
    expect(parseHex(AGG_INK_HEX)).toEqual([...AGG_INK]);
  });

  it('the ring is at least one screen pixel at every aggregation zoom (1.5 … 6 px per cell)', () => {
    for (let z = 1.5; z < 6; z += 0.25) {
      const t = aggOutlineTexels(z);
      expect(t).toBeGreaterThanOrEqual(1);
      expect(t).toBeLessThanOrEqual(AGG_PX);
      expect((t * z) / AGG_PX, `at ${z}`).toBeGreaterThanOrEqual(1 - 1e-9);
    }
  });

  it('a lone cell: its colour inside, ink on every side and corner outside, nothing beyond', () => {
    for (const t of [1, AGG_PX]) {
      const dominant = new Int16Array(CELL_COUNT).fill(-1);
      const density = new Uint16Array(CELL_COUNT);
      const cx = 40;
      const cy = 50;
      dominant[cy * GRID_W + cx] = 0;
      density[cy * GRID_W + cx] = 2;
      const img = image();
      const tone = speciesRgb('Y01');
      paintAggregationInked(img, dominant, density, [tone], t, GRID_W);
      for (let y = 0; y < AGG_PX; y++) for (let x = 0; x < AGG_PX; x++) expect(at(img, cx * AGG_PX + x, cy * AGG_PX + y)).toEqual([...tone, 190]);
      const ink = [...AGG_INK, 255];
      // Facing texels of the four neighbours, and the corner texels of the four diagonal ones.
      for (let k = 0; k < AGG_PX; k++) {
        expect(at(img, cx * AGG_PX - 1, cy * AGG_PX + k)).toEqual(ink);
        expect(at(img, (cx + 1) * AGG_PX, cy * AGG_PX + k)).toEqual(ink);
        expect(at(img, cx * AGG_PX + k, cy * AGG_PX - 1)).toEqual(ink);
        expect(at(img, cx * AGG_PX + k, (cy + 1) * AGG_PX)).toEqual(ink);
      }
      expect(at(img, cx * AGG_PX - 1, cy * AGG_PX - 1)).toEqual(ink);
      expect(at(img, (cx + 1) * AGG_PX, (cy + 1) * AGG_PX)).toEqual(ink);
      // Exactly t texels deep, and nothing two cells away.
      let inked = 0;
      for (let o = 0; o < img.data.length; o += 4) if (img.data[o + 3] === 255 && img.data[o] === AGG_INK[0]) inked++;
      expect(inked).toBe(4 * AGG_PX * t + 4 * t * t);
      expect(at(img, (cx - 2) * AGG_PX, cy * AGG_PX)[3]).toBe(0);
    }
  });

  it('two touching cells of different species share no ink between them (no colour is covered)', () => {
    const dominant = new Int16Array(CELL_COUNT).fill(-1);
    const density = new Uint16Array(CELL_COUNT);
    dominant[64 * GRID_W + 64] = 0;
    dominant[64 * GRID_W + 65] = 1;
    density[64 * GRID_W + 64] = density[64 * GRID_W + 65] = 1;
    const img = image();
    paintAggregationInked(img, dominant, density, [speciesRgb('B01'), speciesRgb('F04')], 1, GRID_W);
    expect(at(img, 65 * AGG_PX - 1, 64 * AGG_PX).slice(0, 3)).toEqual(speciesRgb('B01'));
    expect(at(img, 65 * AGG_PX, 64 * AGG_PX).slice(0, 3)).toEqual(speciesRgb('F04'));
  });

  it('every organism identity tone reads >= 3:1 on water, gel and sediment by its tone or its ring', () => {
    const ids = [...new Set(SPRITES.map((s) => s.speciesId))].filter((id) => !id.startsWith('V'));
    expect(ids.length).toBe(36);
    for (const id of ids)
      for (const bg of [DISH_COLORS.water, DISH_COLORS.gel, DISH_COLORS.sediment]) {
        const best = Math.max(contrastRatio(parseHex(speciesHex(id)), bg), contrastRatio([...AGG_INK], bg));
        expect(best, `${id} on ${bg.join(',')}`).toBeGreaterThanOrEqual(GRAPHIC_MIN);
      }
  });
});

describe('F04 outline and V02 lace (art polish)', () => {
  const sprite = (id: string) => SPRITES.find((s) => s.speciesId === id)!;

  it('F04 Sporeveil’s outline (palette index 1) is the ring ink #23272B, >= 3:1 on sediment, water and gel', () => {
    expect(sprite('F04').palette[1]!.toUpperCase()).toBe(P.sporeveilRing.toUpperCase());
    for (const bg of [DISH_COLORS.water, DISH_COLORS.gel, DISH_COLORS.sediment]) expect(contrastRatio(parseHex(P.sporeveilRing), bg)).toBeGreaterThanOrEqual(GRAPHIC_MIN);
  });

  it('V02’s glyph is an open lace: same size and frame counts, most of its disk open, distinct from V01', () => {
    const v02 = sprite('V02');
    expect(v02.size).toBe(16);
    expect(Object.fromEntries(Object.entries(v02.animations).map(([k, a]) => [k, a.frames.length]))).toEqual({ glyph: 1, idle: 1 });
    for (const f of [v02.animations.glyph!.frames[0]!, v02.animations.idle!.frames[0]!]) {
      // Inside the net’s rim (r < 3.5 px from the centre) a fifth or more is open: four holes, not a filled capsid.
      let inside = 0;
      let open = 0;
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          if (Math.hypot(x + 0.5 - 8, y + 0.5 - 8) >= 3.5) continue;
          inside++;
          if (f.get(x, y) === 0) open++;
        }
      expect(open / inside).toBeGreaterThanOrEqual(0.2);
      // No spikes: nothing lies beyond the rim's outline (radius 7.5 from the centre).
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (f.get(x, y) !== 0) expect(Math.hypot(x + 0.5 - 8, y + 0.5 - 8)).toBeLessThan(7.5);
    }
    // V01 is filled head-and-tail: its glyph's head is solid where V02 is open.
    const v01 = sprite('V01').animations.glyph!.frames[0]!;
    const v02g = v02.animations.glyph!.frames[0]!;
    let xor = 0;
    let union = 0;
    for (let i = 0; i < 256; i++) {
      const a = v01.data[i]! > 0;
      const b = v02g.data[i]! > 0;
      if (a || b) union++;
      if (a !== b) xor++;
    }
    expect(xor / union).toBeGreaterThanOrEqual(0.3);
  });
});
