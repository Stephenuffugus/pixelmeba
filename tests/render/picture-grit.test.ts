/**
 * P5.8 polish (wave 15; D-0125, g5-plan "Carry-overs", org-ui-fix1.md item 4): the share picture's grit (deposit band
 * 7). src/render/picture.ts paints grit specks scaled to the picture's pixels per cell, in layers.ts's two tones
 * (gritPale face, gritEdge corner), 1 / 2 / 3 specks at bands >= 1 / 85 / 170, from a cosmetic key of their own;
 * a speck unit is one sprite pixel of the picture (floor(px / 7)), and specks never cover or touch each other from
 * 5 px per cell.
 *
 *  - A v1.0 band set (seven bands, so no grit band at all) and an eight-band set whose grit is 0 everywhere paint
 *    exactly HEAD's (db1c943) dish layer: the sha256 below was computed from the unmodified picture.ts in this tree
 *    before the grit branch was written (tmp scratch script; the same inputs as here).
 *  - A cell with grit 170 shows three two-tone specks, each a pale face with its dark corner below and right.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CELL_COUNT, GRID_W } from '../../src/sim/constants';
import { cosmetic, DISH_COLORS } from '../../src/render/layers';
import { composePicture, type PictureInput, type PictureItem } from '../../src/render/picture';
import type { AtlasManifestLike } from '../../src/render/renderer';

const MANIFEST: AtlasManifestLike = { width: 1, height: 1, sprites: {}, frames: [] };

function input(deposits: Uint8Array): PictureInput {
  const substrate = new Uint8Array(CELL_COUNT);
  const structure = new Uint8Array(CELL_COUNT);
  const shade = new Float32Array(CELL_COUNT).fill(1);
  for (let i = 0; i < CELL_COUNT; i++) {
    const x = i % GRID_W;
    const y = Math.floor(i / GRID_W);
    const dx = x - 63.5;
    const dy = y - 63.5;
    if (dx * dx + dy * dy > 62 * 62) structure[i] = 4;
    substrate[i] = x < 43 ? 0 : x < 86 ? 1 : 2;
    if (cosmetic(i, 3) < 0.01) structure[i] = structure[i] === 4 ? 4 : 1;
    if (y > 100) shade[i] = 0.5;
  }
  return {
    tick: 0,
    count: 0,
    ents: new Float32Array(0),
    ids: new Uint32Array(0),
    deposits,
    objects: [],
    substrate,
    structure,
    shade,
    speciesIds: [],
    speciesAssets: [],
    speciesNames: [],
    nicknames: [],
  };
}

/** Bands 0-5 filled deterministically (film, band 6, stays 0: it is an atlas tile, not part of the dish layer). */
function v1Bands(n: 7 | 8): Uint8Array {
  const bands = new Uint8Array(n * CELL_COUNT);
  for (let k = 0; k < 6000; k++) {
    const i = Math.floor(cosmetic(k, 7) * CELL_COUNT);
    const band = Math.floor(cosmetic(k, 11) * 6);
    bands[band * CELL_COUNT + i] = Math.floor(cosmetic(k, 29) * 256);
  }
  return bands;
}

function dishLayer(deposits: Uint8Array, crop?: { x0: number; y0: number; cells: number; cellPx?: number; bare?: boolean }) {
  const list = composePicture(input(deposits), MANIFEST, { question: null, identity: null, title: null, timeLabel: null, legend: false, hideLabels: true, ...(crop ? { crop } : {}) });
  const it = list.items.find((x): x is Extract<PictureItem, { kind: 'pixels' }> => x.kind === 'pixels')!;
  return { rgba: it.rgba, w: it.w, cellPx: list.cellPx };
}

const sha = (a: Uint8ClampedArray) => createHash('sha256').update(a).digest('hex');

// HEAD's (db1c943, unmodified picture.ts) dish layer over v1Bands(7), whole dish (7 px per cell) and a 16-cell crop at 12 px.
const HEAD_WHOLE = '9b58c25a83515259d2815b102a0543847b4fc74440c9525b4196b4d0693f5587';
const HEAD_CROP = 'e47198f88b17a95f53fe3e63349c0b48ebb8d161db5bbe0f4db0c02f003b0b2c';

describe('the share picture paints grit (deposit band 7) as the live dish does, scaled to its pixels', () => {
  it('a v1.0 band set (7 bands) paints HEAD pixels byte for byte; an 8-band set with no grit too', () => {
    expect(sha(dishLayer(v1Bands(7)).rgba)).toBe(HEAD_WHOLE);
    expect(sha(dishLayer(v1Bands(8)).rgba)).toBe(HEAD_WHOLE);
    const crop = { x0: 40, y0: 40, cells: 16, cellPx: 12, bare: true };
    expect(sha(dishLayer(v1Bands(7), crop).rgba)).toBe(HEAD_CROP);
    expect(sha(dishLayer(v1Bands(8), crop).rgba)).toBe(HEAD_CROP);
  });

  it('a cell with grit 170 shows 3 two-tone specks (pale face, dark corner below-right), only in its own cell', () => {
    const count = (level: number, cellPx?: number) => {
      const bands = new Uint8Array(8 * CELL_COUNT);
      const cx = 60;
      const cy = 64; // gel (x 43-85)
      bands[7 * CELL_COUNT + cy * GRID_W + cx] = level;
      const crop = cellPx === undefined ? undefined : { x0: 56, y0: 60, cells: 9, cellPx, bare: true };
      const { rgba, w, cellPx: px } = dishLayer(bands, crop);
      const ox = crop ? cx - crop.x0 : cx;
      const oy = crop ? cy - crop.y0 : cy;
      let pale = 0;
      let edge = 0;
      let outside = 0;
      let pairs = 0;
      const is = (x: number, y: number, c: readonly number[]) => {
        const o = (y * w + x) * 4;
        return rgba[o] === c[0] && rgba[o + 1] === c[1] && rgba[o + 2] === c[2] && rgba[o + 3] === 255;
      };
      for (let y = 0; y < w; y++)
        for (let x = 0; x < w; x++) {
          const pl = is(x, y, DISH_COLORS.gritPale);
          const ed = is(x, y, DISH_COLORS.gritEdge);
          if (!pl && !ed) continue;
          const inCell = Math.floor(x / px) === ox && Math.floor(y / px) === oy;
          if (!inCell) outside++;
          if (pl) pale++;
          if (ed) edge++;
        }
      // A speck is a pale unit square whose top-left pixel has a dark pixel exactly one unit below-right.
      const u = Math.max(1, Math.floor(px / 7)); // one sprite pixel of the picture
      for (let y = oy * px; y < (oy + 1) * px; y++)
        for (let x = ox * px; x < (ox + 1) * px; x++) {
          const top = !is(x - 1, y, DISH_COLORS.gritPale) && !is(x, y - 1, DISH_COLORS.gritPale);
          if (top && is(x, y, DISH_COLORS.gritPale) && is(x + u, y + u, DISH_COLORS.gritEdge)) pairs++;
        }
      return { pale, edge, outside, pairs };
    };
    expect(count(0)).toEqual({ pale: 0, edge: 0, outside: 0, pairs: 0 });
    for (const px of [undefined, 12, 20]) {
      const one = count(20, px);
      const two = count(85, px);
      const three = count(170, px);
      for (const r of [one, two, three]) {
        expect(r.outside).toBe(0);
        expect(r.pale).toBeGreaterThan(0);
        expect(r.edge).toBeGreaterThan(0);
      }
      expect(three.pairs, `three specks at ${px ?? 7} px per cell`).toBe(3);
      expect(two.pairs).toBe(2);
      expect(one.pairs).toBe(1);
      expect(three.pale + three.edge).toBeGreaterThan(one.pale + one.edge);
      expect(two.pale + two.edge).toBeGreaterThan(one.pale + one.edge - 1);
    }
  });

  it('grit is cosmetic: the same input paints the same pixels twice, and the input is never changed', () => {
    const bands = v1Bands(8);
    for (let k = 0; k < 400; k++) bands[7 * CELL_COUNT + Math.floor(cosmetic(k, 61) * CELL_COUNT)] = Math.floor(cosmetic(k, 67) * 256);
    const copy = bands.slice();
    expect(sha(dishLayer(bands).rgba)).toBe(sha(dishLayer(bands).rgba));
    expect(Buffer.from(bands).equals(Buffer.from(copy))).toBe(true);
  });
});
