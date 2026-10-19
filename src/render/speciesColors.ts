/** Base identity colors per species for aggregation, legends and markers (UX §6.1). */
const HEX: Readonly<Record<string, string>> = {
  B01: '#EF7B6C',
  B02: '#32A89A',
  B03: '#8B82C6',
  B04: '#D6A64D',
  B05: '#4A90C2',
  B06: '#C8963E',
  B07: '#2E4A7A',
  B08: '#D98CA6',
  B09: '#3FB3A6',
  B10: '#B5552F',
  B11: '#C93B3B',
  B12: '#8B9A3C',
  B13: '#A8412F',
  Y01: '#F2E6C9',
  Y02: '#F5EBD3',
  F01: '#EFE3C6',
  F02: '#B87333',
  F03: '#C98A2B',
  F04: '#B9BEC4',
  A01: '#8CBA4B',
  A02: '#E0B84A',
  A03: '#2F6B3A',
  A04: '#6FAE4E',
  A05: '#2E9E5B',
  P01: '#B8AEDC',
  P02: '#7FD6E8',
  P03: '#F3B48E',
  P04: '#8A5A3C',
  P05: '#EADFC8',
  P06: '#A9C7E6',
  P07: '#5CC8D8',
  P08: '#9C8A6E',
  P09: '#D77FA0',
  P10: '#3B5FB4',
  X01: '#E3C15A',
  X02: '#8C6E9E',
  V01: '#3E7BC4',
  V02: '#6A4FB3',
};

export function speciesHex(id: string): string {
  return HEX[id] ?? '#FFFFFF';
}

export function speciesRgb(id: string): [number, number, number] {
  const h = speciesHex(id).slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// ---- Aggregation zoom with the sprites' ink outline (P5.8 polish, wave 15; D-0123 MINOR 5, the Y01 proposal) ----

type RGB = readonly [number, number, number];

/**
 * The ink outline every organism sprite draws round its body (art/src/palette.ts outlineDark; UX §6.3). At
 * aggregation zoom the identity tones are drawn with it, so a pale tone (Y01, F01, P05 …) still reads against
 * water and gel by its ring, and a dark one against sediment by its body (tools/contrast-audit.ts: the ring and
 * the body together, the better one counts, as the sprite silhouette rows). Shape, never colour coding.
 */
export const AGG_INK_HEX = '#1E2A30';
export const AGG_INK: RGB = [0x1e, 0x2a, 0x30];

/** Aggregation texels per cell (the layer is GRID_W × AGG_PX square; the renderer scales it by 1 / AGG_PX). */
export const AGG_PX = 2;

/**
 * The outline's thickness in texels at `zoom` (screen px per cell): at least one screen pixel (⌈AGG_PX / zoom⌉),
 * from 1 to AGG_PX. Below 2 px per cell (a phone's whole dish) the ring is a whole cell wide.
 */
export function aggOutlineTexels(zoom: number): number {
  const z = Math.max(1e-6, zoom);
  return Math.min(AGG_PX, Math.max(1, Math.ceil(AGG_PX / z - 1e-9)));
}

/**
 * Wide-zoom aggregation with an ink outline (pure; cosmetic only, from the snapshot's dominant species per cell).
 * Each occupied cell is a block of its dominant colour, alpha by density (as layers.ts paintAggregation); an empty
 * cell beside an occupied one (4- or 8-neighbour) carries the ink ring on the sides facing it, `outline` texels
 * deep, so every blob is ringed outside its own cells and no organism's colour is covered. `img` is
 * (GRID_W·AGG_PX)² RGBA.
 */
export function paintAggregationInked(
  img: { readonly width: number; readonly data: Uint8ClampedArray },
  dominant: Int16Array,
  density: Uint16Array,
  colors: readonly RGB[],
  outline: number,
  gridW: number,
): void {
  const S = AGG_PX;
  const W = img.width;
  const d = img.data;
  d.fill(0);
  const t = Math.min(S, Math.max(1, Math.floor(outline)));
  const fill = (cx: number, cy: number, x0: number, x1: number, y0: number, y1: number, rgb: RGB, a: number) => {
    for (let y = y0; y < y1; y++) {
      let o = ((cy * S + y) * W + cx * S + x0) * 4;
      for (let x = x0; x < x1; x++, o += 4) {
        d[o] = rgb[0];
        d[o + 1] = rgb[1];
        d[o + 2] = rgb[2];
        d[o + 3] = a;
      }
    }
  };
  const occ = (x: number, y: number) => x >= 0 && y >= 0 && x < gridW && y < gridW && dominant[y * gridW + x]! >= 0;
  for (let i = 0; i < dominant.length; i++) {
    const cx = i % gridW;
    const cy = (i - cx) / gridW;
    const sp = dominant[i]!;
    if (sp >= 0) {
      fill(cx, cy, 0, S, 0, S, colors[sp] ?? [255, 255, 255], Math.min(255, 110 + density[i]! * 40));
      continue;
    }
    const l = occ(cx - 1, cy);
    const r = occ(cx + 1, cy);
    const u = occ(cx, cy - 1);
    const dn = occ(cx, cy + 1);
    if (l) fill(cx, cy, 0, t, 0, S, AGG_INK, 255);
    if (r) fill(cx, cy, S - t, S, 0, S, AGG_INK, 255);
    if (u) fill(cx, cy, 0, S, 0, t, AGG_INK, 255);
    if (dn) fill(cx, cy, 0, S, S - t, S, AGG_INK, 255);
    // Corners close the ring round a diagonal neighbour.
    if (!l && !u && occ(cx - 1, cy - 1)) fill(cx, cy, 0, t, 0, t, AGG_INK, 255);
    if (!r && !u && occ(cx + 1, cy - 1)) fill(cx, cy, S - t, S, 0, t, AGG_INK, 255);
    if (!l && !dn && occ(cx - 1, cy + 1)) fill(cx, cy, 0, t, S - t, S, AGG_INK, 255);
    if (!r && !dn && occ(cx + 1, cy + 1)) fill(cx, cy, S - t, S, S - t, S, AGG_INK, 255);
  }
}
