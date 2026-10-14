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
 *
 * Device frames: the 'device' atlas tile (art/src/tiles/structures.ts) by kind, S09/S10 `on`, and an S08's
 * saturation quartile from SnapshotMsg.resins (min(3, ⌊4 × saturation⌋); CT §4 "darkens as saturated").
 */
import { GRID_W } from '@sim/constants';
import { EDGE_CHANNEL, EDGE_NONE, EDGE_S01, EDGE_S02, EDGE_SHUTTER_CLOSED, EDGE_SHUTTER_OPEN } from '@sim/barriers';
import { EDGE_FLOW_BACK, type GeometryDevice, type GeometryEdges, type SnapshotResin } from '@worker/protocol';
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
}

const rgbInt = (c: readonly [number, number, number]): number => (c[0] << 16) | (c[1] << 8) | c[2];
export const EDGE_GLYPH_COLORS = {
  membrane: rgbInt(DISH_COLORS.edgeMembrane),
  sieve: rgbInt(DISH_COLORS.edgeSieve),
  shutter: rgbInt(DISH_COLORS.edgeShutter),
  channel: rgbInt(DISH_COLORS.edgeChannel),
  halo: rgbInt(DISH_COLORS.edgeHalo),
} as const;

/** Spans [t0, t1] along the edge (0 = its first end, 1 = its second) per code. */
const S01_DASHES: readonly (readonly [number, number])[] = [
  [0.06, 0.16],
  [0.26, 0.36],
  [0.45, 0.55],
  [0.64, 0.74],
  [0.84, 0.94],
];
const S02_SLOTS: readonly (readonly [number, number])[] = [
  [0.03, 0.29],
  [0.37, 0.63],
  [0.71, 0.97],
];
const HINGE_STUBS: readonly (readonly [number, number])[] = [
  [0, 0.2],
  [0.8, 1],
];
/** Chevron depth across the edge (cells) and the along-edge centres of the two chevrons. */
export const CHEVRON_DEPTH = 0.18;
const CHEVRON_CENTRES = [0.3, 0.7] as const;
const CHEVRON_HALF = 0.14;

function spans(seg: readonly [number, number, number, number], parts: readonly (readonly [number, number])[], out: number[]): void {
  const [x1, y1, x2, y2] = seg;
  for (const [a, b] of parts) out.push(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, x1 + (x2 - x1) * b, y1 + (y2 - y1) * b);
}

/**
 * The glyph of one edge (`code` from GeometryMsg.edges r/d, EDGE_FLOW_BACK included), or null for no barrier.
 * An S04 flowing +1 carries from `cell` to its right/lower neighbour, so its chevrons point +x ('R') or +y
 * ('D'); with EDGE_FLOW_BACK they point back toward `cell`.
 */
export function edgeGlyph(code: number, cell: number, dir: 'R' | 'D'): EdgeGlyph | null {
  const base = code & EDGE_CODE_MASK;
  if (base === EDGE_NONE) return null;
  const seg = edgeSegment(cell, dir);
  const out: number[] = [];
  switch (base) {
    case EDGE_S01:
      spans(seg, S01_DASHES, out);
      return { segments: out, color: EDGE_GLYPH_COLORS.membrane, width: 0.16 };
    case EDGE_S02:
      spans(seg, S02_SLOTS, out);
      return { segments: out, color: EDGE_GLYPH_COLORS.sieve, width: 0.2 };
    case EDGE_SHUTTER_CLOSED:
      spans(seg, [[0, 1]], out);
      return { segments: out, color: EDGE_GLYPH_COLORS.shutter, width: 0.26 };
    case EDGE_SHUTTER_OPEN:
      spans(seg, HINGE_STUBS, out);
      return { segments: out, color: EDGE_GLYPH_COLORS.shutter, width: 0.26 };
    case EDGE_CHANNEL: {
      spans(seg, [[0, 1]], out); // thin base line on the edge
      const sign = (code & EDGE_FLOW_BACK) !== 0 ? -1 : 1;
      const [x1, y1, x2, y2] = seg;
      for (const c of CHEVRON_CENTRES) {
        // Along-edge unit (ax, ay) and across-edge unit (nx, ny) in the flow direction.
        const ax = x2 - x1;
        const ay = y2 - y1;
        const nx = dir === 'R' ? sign : 0;
        const ny = dir === 'D' ? sign : 0;
        const mx = x1 + ax * c;
        const my = y1 + ay * c;
        const tipX = mx + nx * CHEVRON_DEPTH;
        const tipY = my + ny * CHEVRON_DEPTH;
        const backX = mx - nx * CHEVRON_DEPTH;
        const backY = my - ny * CHEVRON_DEPTH;
        out.push(backX - ax * CHEVRON_HALF, backY - ay * CHEVRON_HALF, tipX, tipY, tipX, tipY, backX + ax * CHEVRON_HALF, backY + ay * CHEVRON_HALF);
      }
      return { segments: out, color: EDGE_GLYPH_COLORS.channel, width: 0.12 };
    }
    default:
      return null;
  }
}

/** Every barrier's glyph from GeometryMsg.edges, in its list order (the renderer strokes them). */
export function edgeGlyphs(edges: GeometryEdges | null | undefined): { cell: number; dir: 'R' | 'D'; glyph: EdgeGlyph }[] {
  if (!edges) return [];
  const out: { cell: number; dir: 'R' | 'D'; glyph: EdgeGlyph }[] = [];
  for (const e of edges.list) {
    const code = (e.dir === 'R' ? edges.r : edges.d)[e.cell]!;
    const glyph = edgeGlyph(code, e.cell, e.dir);
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
