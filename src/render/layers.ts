/**
 * Procedural world layers drawn into canvases (ARCH §9, UX §6.5): the dish (substrates, stone,
 * walls, beads), deposit glyphs, the active overlay, and wide-zoom aggregation. Cosmetic variation
 * uses a local hash, never simulation randomness.
 */
import { CELL_COUNT, GRID_W } from '@sim/constants';

export const DISH_PX_PER_CELL = 4;
export const DISH_TEX = GRID_W * DISH_PX_PER_CELL;

const C = {
  water: [0xd6, 0xe7, 0xe5],
  waterLight: [0xe3, 0xef, 0xed],
  waterDeep: [0xc9, 0xde, 0xdb],
  gel: [0xe9, 0xe1, 0xc8],
  gelDark: [0xdd, 0xd3, 0xb6],
  sediment: [0x8b, 0x76, 0x61],
  sedimentDark: [0x7a, 0x66, 0x52],
  sedimentLight: [0x9c, 0x88, 0x71],
  stone: [0x6e, 0x7b, 0x84],
  stoneDark: [0x58, 0x64, 0x6c],
  stoneLight: [0x9a, 0xa7, 0xae],
  wall: [0x3a, 0x46, 0x50],
  bead: [0xb7, 0xc2, 0xc8],
  starch: [0xf4, 0xef, 0xdc],
  starchEdge: [0xc9, 0xbd, 0x93],
  detritus: [0x8a, 0x6d, 0x4b],
  detritusLight: [0xa8, 0x8b, 0x62],
  oil: [0xe8, 0xc5, 0x4a],
  protein: [0xd9, 0x9b, 0xa6],
  sugarHaze: [0xf3, 0xc9, 0x5c],
  // Catalysis dust: the Crumbsmith's deep ochre (palette crumbDeep), where enzyme is converting starch.
  catalysis: [0x9e, 0x72, 0x29],
} as const;

type RGB = readonly [number, number, number];

export function cosmetic(i: number, salt: number): number {
  let h = (i * 0x9e3779b1 + salt * 0x85ebca6b) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296; // unsigned: the XOR above yields a signed 32-bit value
}

function put(img: ImageData, px: number, py: number, rgb: RGB, a = 255): void {
  const o = (py * img.width + px) * 4;
  img.data[o] = rgb[0];
  img.data[o + 1] = rgb[1];
  img.data[o + 2] = rgb[2];
  img.data[o + 3] = a;
}

/** Substrates 0 water, 1 gel, 2 sediment; structures 0 none, 1 stone, 2 wall, 3 bead, 4 outside. */
export function paintDish(img: ImageData, substrate: Uint8Array, structure: Uint8Array, shade: Float32Array): void {
  const S = DISH_PX_PER_CELL;
  img.data.fill(0);
  for (let i = 0; i < CELL_COUNT; i++) {
    const st = structure[i]!;
    if (st === 4) continue;
    const cx = (i % GRID_W) * S;
    const cy = Math.floor(i / GRID_W) * S;
    const sub = substrate[i]!;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const r = cosmetic(i * 16 + y * S + x, 7);
        let rgb: RGB;
        if (st === 1) {
          // Stone: light top-left edge, dark bottom-right edge (UX §6.5).
          const up = structure[i - GRID_W] !== 1 && y === 0;
          const left = structure[i - 1] !== 1 && x === 0;
          const down = structure[i + GRID_W] !== 1 && y === S - 1;
          const right = structure[i + 1] !== 1 && x === S - 1;
          rgb = up || left ? C.stoneLight : down || right ? C.stoneDark : r < 0.12 ? C.stoneDark : C.stone;
        } else if (st === 2) {
          rgb = C.wall;
        } else if (sub === 1) {
          rgb = r < 0.08 ? C.gelDark : C.gel;
        } else if (sub === 2) {
          rgb = r < 0.15 ? C.sedimentDark : r > 0.93 ? C.sedimentLight : C.sediment;
        } else {
          rgb = r < 0.03 ? C.waterLight : r > 0.985 ? C.waterDeep : C.water;
        }
        if (st === 3 && (x + y) % 2 === 0) rgb = C.bead;
        // Painted shade shows wherever it is painted (open cells and porous beads alike; SPEC §10.4:
        // shade can be painted on any cell inside the dish), so a shaded bead reads as shaded.
        const sh = shade[i]!;
        if (sh < 1) rgb = [Math.round(rgb[0] * 0.72), Math.round(rgb[1] * 0.74), Math.round(rgb[2] * 0.78)];
        put(img, cx + x, cy + y, rgb);
      }
    }
  }
}

/** Deposit glyphs from the four 0–255 bands: starch grains, detritus flecks, oil sheen, protein motes. */
export function paintDeposits(img: ImageData, bands: Uint8Array): void {
  img.data.fill(0);
  const hasSugar = bands.length >= 5 * CELL_COUNT;
  for (let i = 0; i < CELL_COUNT; i++) paintDepositCell(img, bands, i, hasSugar);
}

/** Pixel rectangle of the deposit texture touched by an incremental repaint (empty when w = 0). */
export interface DirtyRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Incremental form of paintDeposits: repaints only the cells whose bands differ from `prev`
 * (clearing each such 4×4 block first, then drawing it exactly as paintDeposits would), and
 * copies the new bands into `prev`. The resulting pixels are byte-identical to a full paint.
 * Returns the touched pixel rectangle so callers can skip or narrow the canvas/texture update.
 */
export function repaintDepositCells(img: ImageData, bands: Uint8Array, prev: Uint8Array, out: DirtyRect): DirtyRect {
  const S = DISH_PX_PER_CELL;
  const hasSugar = bands.length >= 5 * CELL_COUNT;
  const nb = Math.min(bands.length, prev.length) / CELL_COUNT;
  let x0 = GRID_W;
  let y0 = GRID_W;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < CELL_COUNT; i++) {
    let same = true;
    for (let b = 0; b < nb; b++) {
      const o = b * CELL_COUNT + i;
      if (bands[o] !== prev[o]) {
        same = false;
        prev[o] = bands[o]!;
      }
    }
    if (same) continue;
    const gx = i % GRID_W;
    const gy = (i - gx) / GRID_W;
    const cx = gx * S;
    const cy = gy * S;
    for (let y = 0; y < S; y++) img.data.fill(0, ((cy + y) * img.width + cx) * 4, ((cy + y) * img.width + cx + S) * 4);
    paintDepositCell(img, bands, i, hasSugar);
    if (gx < x0) x0 = gx;
    if (gx > x1) x1 = gx;
    if (gy < y0) y0 = gy;
    if (gy > y1) y1 = gy;
  }
  if (x1 < 0) {
    out.x = out.y = out.w = out.h = 0;
  } else {
    out.x = x0 * S;
    out.y = y0 * S;
    out.w = (x1 - x0 + 1) * S;
    out.h = (y1 - y0 + 1) * S;
  }
  return out;
}

function paintDepositCell(img: ImageData, bands: Uint8Array, i: number, hasSugar: boolean): void {
  const S = DISH_PX_PER_CELL;
  const starch = bands[i]!;
  const det = bands[CELL_COUNT + i]!;
  const oil = bands[2 * CELL_COUNT + i]!;
  const prot = bands[3 * CELL_COUNT + i]!;
  const sugar = hasSugar ? bands[4 * CELL_COUNT + i]! : 0;
  const cat = bands.length >= 6 * CELL_COUNT ? bands[5 * CELL_COUNT + i]! : 0;
  if ((starch | det | oil | prot | sugar | cat) === 0) return;
  const cx = (i % GRID_W) * S;
  const cy = Math.floor(i / GRID_W) * S;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = y * S + x;
      const r = cosmetic(i * 16 + k, 13);
      if (starch > 0 && r < (starch / 255) * 0.55) put(img, cx + x, cy + y, (x + y) % 3 === 0 ? C.starchEdge : C.starch);
      else if (det > 0 && r > 1 - (det / 255) * 0.5) put(img, cx + x, cy + y, r > 0.98 ? C.detritusLight : C.detritus);
      else if (oil > 0 && cosmetic(i * 16 + k, 17) < (oil / 255) * 0.35) put(img, cx + x, cy + y, C.oil, 200);
      else if (prot > 0 && cosmetic(i * 16 + k, 19) < (prot / 255) * 0.35) put(img, cx + x, cy + y, C.protein);
      else if (sugar > 8) put(img, cx + x, cy + y, C.sugarHaze, Math.min(120, 20 + Math.round(sugar * 0.45)));
      // Catalysis dust over everything: bright specks, denser where more starch was converted.
      if (cat > 0 && cosmetic(i * 16 + k, 23) < 0.02 + (cat / 255) * 0.08) put(img, cx + x, cy + y, C.catalysis);
    }
  }
}

/** Colormaps per overlay kind; alpha is applied by the sprite (45 % default). */
export type Colormap = 'food' | 'gas' | 'nutrient' | 'light' | 'ph' | 'activity' | 'deposit';

const RAMPS: Record<Colormap, readonly RGB[]> = {
  food: [[255, 247, 220], [247, 200, 90], [214, 120, 30]],
  gas: [[235, 245, 255], [120, 180, 235], [25, 80, 170]],
  nutrient: [[245, 255, 240], [150, 210, 120], [40, 120, 50]],
  light: [[20, 30, 45], [150, 140, 90], [255, 240, 160]],
  ph: [[200, 50, 60], [240, 240, 240], [60, 90, 200]],
  activity: [[250, 245, 255], [190, 140, 230], [110, 40, 170]],
  deposit: [[250, 245, 235], [210, 180, 130], [130, 90, 50]],
};

export function colormapFor(id: string): Colormap {
  if (id === 'oxygen' || id === 'co2') return 'gas';
  if (id === 'nutrient' || id.endsWith('N')) return 'nutrient';
  if (id === 'light') return 'light';
  if (id === 'ph') return 'ph';
  if (id.startsWith('e') || id === 'breaker' || id === 'sGlow' || id === 'rival' || id === 'quencher') return 'activity';
  if (id === 'starch' || id === 'detritus' || id === 'oil' || id === 'protein' || id === 'film' || id === 'grit') return 'deposit';
  return 'food';
}

function ramp(map: Colormap, t: number): RGB {
  const r = RAMPS[map];
  const x = Math.min(1, Math.max(0, t)) * (r.length - 1);
  const i = Math.min(r.length - 2, Math.floor(x));
  const f = x - i;
  const a = r[i]!;
  const b = r[i + 1]!;
  return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)];
}

/**
 * One pixel per cell. `scaleMax` is the value mapped to the top of the ramp. Cells that hold nothing
 * (stone, wall, outside the rim) stay clear; porous beads hold and pass dissolved material, so the
 * overlay shows their measured values like open cells.
 */
export function paintOverlay(img: ImageData, data: Float32Array, structure: Uint8Array | null, id: string, scaleMax: number): void {
  const map = colormapFor(id);
  const isPh = id === 'ph';
  for (let i = 0; i < CELL_COUNT; i++) {
    const o = i * 4;
    if (structure && structure[i] !== 0 && structure[i] !== 3) {
      img.data[o + 3] = 0;
      continue;
    }
    const v = data[i]!;
    const t = isPh ? (v - 2) / 10 : scaleMax > 0 ? v / scaleMax : 0;
    const rgb = ramp(map, t);
    img.data[o] = rgb[0];
    img.data[o + 1] = rgb[1];
    img.data[o + 2] = rgb[2];
    img.data[o + 3] = isPh || v > 0 ? 255 : 0;
  }
}

/** Legend stops for the UI (low → high), matching paintOverlay. */
export function legendStops(id: string): string[] {
  const map = colormapFor(id);
  return [0, 0.5, 1].map((t) => {
    const [r, g, b] = ramp(map, t);
    return `rgb(${r}, ${g}, ${b})`;
  });
}

/** Wide-zoom aggregation: one pixel per cell, dominant species color, alpha by density. */
export function paintAggregation(img: ImageData, dominant: Int16Array, density: Uint16Array, colors: readonly RGB[]): void {
  for (let i = 0; i < CELL_COUNT; i++) {
    const o = i * 4;
    const sp = dominant[i]!;
    if (sp < 0) {
      img.data[o + 3] = 0;
      continue;
    }
    const rgb = colors[sp] ?? [255, 255, 255];
    img.data[o] = rgb[0];
    img.data[o + 1] = rgb[1];
    img.data[o + 2] = rgb[2];
    img.data[o + 3] = Math.min(255, 110 + density[i]! * 40);
  }
}
