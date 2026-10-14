/**
 * Phase 5 structures on screen (P5.1/P5.2; SPEC §2.4–§2.5, §10.4; UX §6.5 "equipment props as small
 * readable lab pieces with neutral outlines", §7.3 layer order; ARCH §9; D-0119). PURE geometry and frame
 * picks, no Pixi: the renderer (renderer.ts drawStructures) only strokes and places what these return.
 *
 * Edge glyphs lie ON the shared cell edge, in world units (cell (x, y) spans [x, x + 1) × [y, y + 1)): an
 * 'R' edge of `cell` is the vertical segment x = cx + 1, y ∈ [cy, cy + 1]; a 'D' edge the horizontal
 * segment y = cy + 1, x ∈ [cx, cx + 1]. Per code (barriers.ts EDGE_*; GeometryMsg's EDGE_FLOW_BACK bit
 * gives an S04's direction): S01 dotted (short dashes), S02 slotted (longer dashes with small gaps), S03
 * closed a solid bar, S03 open two short end stubs (a hinge), S04 chevrons pointing in the flow direction
 * across a thin base line. Drawn from the geometry only, redrawn when its version changes, never per tick.
 * Wave 12 (structures-art-audio): readable at every zoom preset. The number of marks follows the zoom so no
 * straight mark is shorter than MIN_MARK_PX (1.5) screen pixels and the patterns stay apart: S01 short dots
 * about 4 px apart (1–5 per edge; five from 20 px per cell), S02 long slots with ~1.25 px gaps (1–3 per edge;
 * three from 18), a closed S03 a solid bar, an open S03 two end stubs (below 6 px per cell two short posts
 * ACROSS the edge, so a run never reads as dots or slots), S04 one chevron below 12 px per cell (larger below
 * 6), two from 12. `minPx` is each glyph's minimum stroke width on screen (the shutter the boldest).
 *
 * Device frames: the 'device' atlas tile (art/src/tiles/structures.ts) by kind, S09/S10 `on`, and an S08's
 * saturation quartile from SnapshotMsg.resins (min(3, ⌊4 × saturation⌋); CT §4 "darkens as saturated").
 */
import { GRID_W } from '@sim/constants';
import { EDGE_CHANNEL, EDGE_NONE, EDGE_S01, EDGE_S02, EDGE_SHUTTER_CLOSED, EDGE_SHUTTER_OPEN } from '@sim/barriers';
import { EDGE_FLOW_BACK, type GeometryDevice, type GeometryEdges, type SnapshotResin } from '@worker/protocol';
import { ZOOM_CLOSE } from './camera';
import { DISH_COLORS } from './layers';

/** The barrier code without GeometryMsg's EDGE_FLOW_BACK bit. */
export const EDGE_CODE_MASK = 7;

/** The shared edge of `cell` in direction `dir`, as [x1, y1, x2, y2] in world units. */
export function edgeSegment(cell: number, dir: 'R' | 'D'): [number, number, number, number] {
  const cx = cell % GRID_W;
  const cy = Math.floor(cell / GRID_W);
  return dir === 'R' ? [cx + 1, cy, cx + 1, cy + 1] : [cx, cy + 1, cx + 1, cy + 1];
}

/** One stroked glyph: flat [x1, y1, x2, y2, …] line segments, a colour (0xRRGGBB) and a width (cells). */
export interface EdgeGlyph {
  readonly segments: number[];
  readonly color: number;
  readonly width: number;
  /** Minimum stroke width in screen pixels (the renderer keeps max(width × zoom, minPx)); the shutter is the boldest. */
  readonly minPx: number;
}

/**
 * Detail bands by zoom (screen px per cell; camera.ts ZOOM_NEIGHBORHOOD 8, ZOOM_CLOSE 16): 'coarse' below 6 px per
 * cell (the whole-dish view on a phone or a small window), 'fine' from 6 up. Within a band the mark counts and
 * lengths follow the zoom (edgeMarks, MIN_MARK_PX); the renderer redraws when the band changes or the zoom moves
 * by more than a quarter.
 */
export const EDGE_FINE_MIN_ZOOM = 6;
export function edgeDetail(zoom: number): 'fine' | 'coarse' {
  return zoom >= EDGE_FINE_MIN_ZOOM ? 'fine' : 'coarse';
}

const rgbInt = (c: readonly [number, number, number]): number => (c[0] << 16) | (c[1] << 8) | c[2];
export const EDGE_GLYPH_COLORS = {
  membrane: rgbInt(DISH_COLORS.edgeMembrane),
  sieve: rgbInt(DISH_COLORS.edgeSieve),
  shutter: rgbInt(DISH_COLORS.edgeShutter),
  channel: rgbInt(DISH_COLORS.edgeChannel),
  halo: rgbInt(DISH_COLORS.edgeHalo),
} as const;

/** No straight mark is drawn shorter than this many screen pixels (at the zoom the glyph is built for). */
export const MIN_MARK_PX = 1.5;

/** Marks per edge at `zoom`: S01 one dot per ~4 screen px (1–5), S02 one slot per ~6 screen px (1–3); others fixed. */
export function edgeMarks(code: number, zoom: number): number {
  const base = code & EDGE_CODE_MASK;
  const z = Math.max(1e-6, zoom);
  if (base === EDGE_S01) return Math.min(5, Math.max(1, Math.floor(z / 4)));
  if (base === EDGE_S02) return Math.min(3, Math.max(1, Math.floor(z / 6)));
  if (base === EDGE_SHUTTER_OPEN) return 2;
  if (base === EDGE_CHANNEL) return z >= 12 ? 2 : 1;
  return base === EDGE_NONE ? 0 : 1;
}

/** `n` marks of length `len` (cells) centred at (k + ½) / n along the edge. */
function evenMarks(n: number, len: number): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const c = (k + 0.5) / n;
    out.push([c - len / 2, c + len / 2]);
  }
  return out;
}

/** Chevron depth across the edge (cells) and half-width along it, from the neighborhood preset up. */
export const CHEVRON_DEPTH = 0.18;
const CHEVRON_HALF = 0.14;
/** The whole-dish chevron: one, larger, so it still points at a few px per cell. */
export const CHEVRON_DEPTH_COARSE = 0.32;
const CHEVRON_HALF_COARSE = 0.28;
/** An open shutter in the whole-dish view: two short posts across the edge near its ends (cells). */
const POST_AT = [0.15, 0.85] as const;
const POST_HALF = 0.3;

function spans(seg: readonly [number, number, number, number], parts: readonly (readonly [number, number])[], out: number[]): void {
  const [x1, y1, x2, y2] = seg;
  for (const [a, b] of parts) out.push(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, x1 + (x2 - x1) * b, y1 + (y2 - y1) * b);
}

/**
 * The glyph of one edge (`code` from GeometryMsg.edges r/d, EDGE_FLOW_BACK included), or null for no barrier.
 * An S04 flowing +1 carries from `cell` to its right/lower neighbour, so its chevrons point +x ('R') or +y
 * ('D'); with EDGE_FLOW_BACK they point back toward `cell`. `zoom` (screen px per cell; default the close
 * preset) picks the detail band (edgeDetail).
 */
export function edgeGlyph(code: number, cell: number, dir: 'R' | 'D', zoom: number = ZOOM_CLOSE): EdgeGlyph | null {
  const base = code & EDGE_CODE_MASK;
  if (base === EDGE_NONE) return null;
  const coarse = edgeDetail(zoom) === 'coarse';
  const seg = edgeSegment(cell, dir);
  const out: number[] = [];
  const z = Math.max(1e-6, zoom);
  const minLen = MIN_MARK_PX / z;
  switch (base) {
    case EDGE_S01:
      spans(seg, evenMarks(edgeMarks(code, z), Math.max(0.1, minLen)), out);
      return { segments: out, color: EDGE_GLYPH_COLORS.membrane, width: 0.16, minPx: 1.5 };
    case EDGE_S02: {
      const n = edgeMarks(code, z);
      spans(seg, evenMarks(n, 1 / n - Math.max(0.08, 1.25 / z)), out);
      return { segments: out, color: EDGE_GLYPH_COLORS.sieve, width: 0.2, minPx: 1.75 };
    }
    case EDGE_SHUTTER_CLOSED:
      spans(seg, [[0, 1]], out);
      return { segments: out, color: EDGE_GLYPH_COLORS.shutter, width: 0.26, minPx: 2.5 };
    case EDGE_SHUTTER_OPEN: {
      if (coarse) {
        // Two posts across the edge (an open gateway), not along it: a run of them never reads as dots or slots.
        const [x1, y1, x2, y2] = seg;
        for (const t of POST_AT) {
          const px = x1 + (x2 - x1) * t;
          const py = y1 + (y2 - y1) * t;
          if (dir === 'R') out.push(px - POST_HALF, py, px + POST_HALF, py);
          else out.push(px, py - POST_HALF, px, py + POST_HALF);
        }
      } else {
        const stub = Math.max(0.2, minLen);
        spans(seg, [[0, stub], [1 - stub, 1]], out);
      }
      return { segments: out, color: EDGE_GLYPH_COLORS.shutter, width: 0.26, minPx: 2.5 };
    }
    case EDGE_CHANNEL: {
      spans(seg, [[0, 1]], out); // thin base line on the edge
      const sign = (code & EDGE_FLOW_BACK) !== 0 ? -1 : 1;
      const [x1, y1, x2, y2] = seg;
      const depth = coarse ? CHEVRON_DEPTH_COARSE : CHEVRON_DEPTH;
      const half = coarse ? CHEVRON_HALF_COARSE : CHEVRON_HALF;
      const n = edgeMarks(code, z);
      for (let k = 0; k < n; k++) {
        const c = (k + 0.5) / n;
        // Along-edge unit (ax, ay) and across-edge unit (nx, ny) in the flow direction.
        const ax = x2 - x1;
        const ay = y2 - y1;
        const nx = dir === 'R' ? sign : 0;
        const ny = dir === 'D' ? sign : 0;
        const mx = x1 + ax * c;
        const my = y1 + ay * c;
        const tipX = mx + nx * depth;
        const tipY = my + ny * depth;
        const backX = mx - nx * depth;
        const backY = my - ny * depth;
        out.push(backX - ax * half, backY - ay * half, tipX, tipY, tipX, tipY, backX + ax * half, backY + ay * half);
      }
      return { segments: out, color: EDGE_GLYPH_COLORS.channel, width: 0.12, minPx: 1.5 };
    }
    default:
      return null;
  }
}

/** Every barrier's glyph from GeometryMsg.edges, in its list order (the renderer strokes them), at `zoom`. */
export function edgeGlyphs(edges: GeometryEdges | null | undefined, zoom: number = ZOOM_CLOSE): { cell: number; dir: 'R' | 'D'; glyph: EdgeGlyph }[] {
  if (!edges) return [];
  const out: { cell: number; dir: 'R' | 'D'; glyph: EdgeGlyph }[] = [];
  for (const e of edges.list) {
    const code = (e.dir === 'R' ? edges.r : edges.d)[e.cell]!;
    const glyph = edgeGlyph(code, e.cell, e.dir, zoom);
    if (glyph) out.push({ cell: e.cell, dir: e.dir, glyph });
  }
  return out;
}

// ---- Device frames ----------------------------------------------------------------------------------

/** Frame indices of the 'device' atlas tile (art/src/tiles/structures.ts DEVICE_FRAME_NAMES). */
export const DEVICE_FRAMES = {
  S05: 0,
  S06: 1,
  S07: 2,
  S08: 3, // + saturation quartile 0–3
  S09_OFF: 7,
  S09_ON: 8,
  S10_OFF: 9,
  S10_ON: 10,
  S11: 11,
  S12: 12,
} as const;
export const DEVICE_FRAME_COUNT = 13;

/** A resin's saturation quartile: min(3, ⌊4 × saturation⌋) (0 for anything not a finite number ≥ 0). */
export function resinQuartile(saturation: number): number {
  if (!(saturation > 0)) return 0;
  return Math.min(3, Math.floor(4 * saturation));
}

/** The device tile frame for one furnishing or device; `saturation` is its SnapshotMsg.resins value (S08 only). */
export function deviceFrame(d: Pick<GeometryDevice, 'kind' | 'on'>, saturation = 0): number {
  switch (d.kind) {
    case 'S05':
      return DEVICE_FRAMES.S05;
    case 'S06':
      return DEVICE_FRAMES.S06;
    case 'S07':
      return DEVICE_FRAMES.S07;
    case 'S08':
      return DEVICE_FRAMES.S08 + resinQuartile(saturation);
    case 'S09':
      return d.on === true ? DEVICE_FRAMES.S09_ON : DEVICE_FRAMES.S09_OFF;
    case 'S10':
      return d.on === true ? DEVICE_FRAMES.S10_ON : DEVICE_FRAMES.S10_OFF;
    case 'S11':
      return DEVICE_FRAMES.S11;
    case 'S12':
      return DEVICE_FRAMES.S12;
  }
}

/** Every device's tile frame and cell centre, saturation from the latest snapshot's resins (by id). */
export function deviceSprites(
  devices: readonly GeometryDevice[] | undefined,
  resins: readonly SnapshotResin[] | undefined,
): { id: number; cell: number; x: number; y: number; frame: number }[] {
  if (!devices || devices.length === 0) return [];
  const sat = new Map<number, number>();
  for (const r of resins ?? []) sat.set(r.id, r.saturation);
  return devices.map((d) => ({
    id: d.id,
    cell: d.cell,
    x: (d.cell % GRID_W) + 0.5,
    y: Math.floor(d.cell / GRID_W) + 0.5,
    frame: deviceFrame(d, sat.get(d.id) ?? 0),
  }));
}
