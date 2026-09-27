/**
 * Grid geometry (SPEC §2.1–2.2). 128 × 128 cells, circular playable mask, no wraparound.
 *
 * Coordinate conventions:
 * - Continuous world positions: cell (x, y) spans [x, x+1) × [y, y+1); its center is (x+0.5, y+0.5).
 * - Content geometry (habitat ops, recipe patches, founder placement) uses integer cell indices as
 *   centers, matching the design documents ("cells whose centers satisfy (x−cx)² + (y−cy)² ≤ r²",
 *   mask centered at (63.5, 63.5)).
 *
 * Substrate is what a cell is made of (water/gel/sediment); a structure sits on top of it (stone,
 * wall, porous bead). Removing a structure restores the substrate underneath (SPEC §2.4).
 */
import {
  CELL_COUNT,
  DIFFUSION_GEL,
  DIFFUSION_SEDIMENT,
  DIFFUSION_WATER,
  GRID_H,
  GRID_W,
  MASK_CX,
  MASK_CY,
  MASK_R,
} from './constants';

export const SUB_WATER = 0;
export const SUB_GEL = 1;
export const SUB_SEDIMENT = 2;
export const SUBSTRATE_NAMES = ['water', 'gel', 'sediment'] as const;
export type SubstrateName = (typeof SUBSTRATE_NAMES)[number];

export const ST_NONE = 0;
export const ST_STONE = 1;
export const ST_WALL = 2;
export const ST_BEAD = 3;
export const ST_OUTSIDE = 4;
export const STRUCTURE_NAMES = ['none', 'stone', 'wall', 'bead', 'outside'] as const;
export type StructureName = (typeof STRUCTURE_NAMES)[number];

export function cellIndex(x: number, y: number): number {
  return y * GRID_W + x;
}
export function cellX(i: number): number {
  return i % GRID_W;
}
export function cellY(i: number): number {
  return (i / GRID_W) | 0;
}
export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
}

export function inMask(x: number, y: number): boolean {
  const dx = x - MASK_CX;
  const dy = y - MASK_CY;
  return dx * dx + dy * dy <= MASK_R * MASK_R;
}

/** Undirected edges between horizontally/vertically adjacent in-mask cells, in canonical order. */
export interface EdgeList {
  readonly count: number;
  readonly a: Int32Array;
  readonly b: Int32Array;
}

let cachedEdges: EdgeList | null = null;
let cachedMaskCells: Int32Array | null = null;

export function maskCells(): Int32Array {
  if (cachedMaskCells) return cachedMaskCells;
  const out: number[] = [];
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) if (inMask(x, y)) out.push(cellIndex(x, y));
  cachedMaskCells = Int32Array.from(out);
  return cachedMaskCells;
}

export function maskEdges(): EdgeList {
  if (cachedEdges) return cachedEdges;
  const a: number[] = [];
  const b: number[] = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (!inMask(x, y)) continue;
      const i = cellIndex(x, y);
      if (x + 1 < GRID_W && inMask(x + 1, y)) {
        a.push(i);
        b.push(i + 1);
      }
      if (y + 1 < GRID_H && inMask(x, y + 1)) {
        a.push(i);
        b.push(i + GRID_W);
      }
    }
  }
  cachedEdges = { count: a.length, a: Int32Array.from(a), b: Int32Array.from(b) };
  return cachedEdges;
}

export interface Grid {
  /** SUB_* per cell (meaningful inside the mask). */
  readonly substrate: Uint8Array;
  /** ST_* per cell; ST_OUTSIDE outside the mask. */
  readonly structure: Uint8Array;
  /** Habitat light baseline 0–1 (not an inventory). */
  readonly lightBase: Float64Array;
  /** Painted shade multiplier (1.0 or 0.1). */
  readonly shade: Float64Array;
  /**
   * Bumped whenever substrate, structure, light baseline or shade changes, so cached transport
   * coefficients and derived light are rebuilt. Every writer of those arrays must bump it.
   */
  geometryVersion: number;
}

export function createGrid(): Grid {
  const substrate = new Uint8Array(CELL_COUNT);
  const structure = new Uint8Array(CELL_COUNT).fill(ST_OUTSIDE);
  const lightBase = new Float64Array(CELL_COUNT);
  const shade = new Float64Array(CELL_COUNT).fill(1);
  const cells = maskCells();
  for (let k = 0; k < cells.length; k++) structure[cells[k]!] = ST_NONE;
  return { substrate, structure, lightBase, shade, geometryVersion: 0 };
}

/** Solutes can occupy/move through this cell (open cells and porous beads). */
export function transportOpen(g: Grid, i: number): boolean {
  const s = g.structure[i]!;
  return s === ST_NONE || s === ST_BEAD;
}

/** Free (non-attached) organisms can occupy this cell. */
export function openForFree(g: Grid, i: number): boolean {
  return g.structure[i] === ST_NONE;
}

export function diffusionCoefficient(sub: number): number {
  return sub === SUB_WATER ? DIFFUSION_WATER : sub === SUB_GEL ? DIFFUSION_GEL : DIFFUSION_SEDIMENT;
}

/** True when a passable cell is four-adjacent to stone ("stone edge" attachment surface). */
export function isStoneEdge(g: Grid, i: number): boolean {
  if (g.structure[i] !== ST_NONE) return false;
  const x = cellX(i);
  const y = cellY(i);
  const n = [
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1],
  ] as const;
  for (const [nx, ny] of n) {
    if (inBounds(nx, ny) && g.structure[cellIndex(nx, ny)] === ST_STONE) return true;
  }
  return false;
}

/** Integer-center disk membership used by content geometry. */
export function inDisk(x: number, y: number, cx: number, cy: number, r: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Cells of an integer-center disk, clipped to the grid, row-major order. */
export function diskCells(cx: number, cy: number, r: number): number[] {
  const out: number[] = [];
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(GRID_W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(GRID_H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inDisk(x, y, cx, cy, r)) out.push(cellIndex(x, y));
  return out;
}

/** Cells whose continuous centers (x+0.5, y+0.5) lie within r of a continuous point (tools/brushes). */
export function brushCells(px: number, py: number, r: number): number[] {
  const out: number[] = [];
  const x0 = Math.max(0, Math.floor(px - r - 1));
  const x1 = Math.min(GRID_W - 1, Math.ceil(px + r + 1));
  const y0 = Math.max(0, Math.floor(py - r - 1));
  const y1 = Math.min(GRID_H - 1, Math.ceil(py + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - px;
      const dy = y + 0.5 - py;
      if (dx * dx + dy * dy <= r * r) out.push(cellIndex(x, y));
    }
  }
  return out;
}
