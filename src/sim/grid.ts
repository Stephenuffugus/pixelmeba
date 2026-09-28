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

// ---------------------------------------------------------------------------------------------
// Lab habitat edits (SPEC §2.4, §10.4; CT §4, §5.1; P2.7). Pure rules shared by the simulation
// commands (structures.ts applyHabitatEdit) and the renderer's brush preview, so a preview can never
// promise something the command refuses.

export const SUBSTRATE_CODES: Readonly<Record<SubstrateName, number>> = { water: SUB_WATER, gel: SUB_GEL, sediment: SUB_SEDIMENT };

/** Structures the player can place from the Lab Tools tray (CT §4, Phase 2). */
export const PLACEABLE_STRUCTURES = ['stone', 'wall', 'bead'] as const;
export type PlaceableStructure = (typeof PLACEABLE_STRUCTURES)[number];
export const STRUCTURE_CODES: Readonly<Record<PlaceableStructure, number>> = { stone: ST_STONE, wall: ST_WALL, bead: ST_BEAD };

/** Painted shade factor (CT §5.1 SHADE: light × 0.1; erasing sets the factor back to 1.0). */
export const PAINTED_SHADE = 0.1;

/** Lab brush radii (CT §5.1: 1/3/6, default 3). */
export const LAB_RADII = [1, 3, 6] as const;
export const LAB_MAX_RADIUS = 6;

/** A stone, wall or porous bead (never the outside). */
export function isPlacedStructure(st: number): boolean {
  return st === ST_STONE || st === ST_WALL || st === ST_BEAD;
}

/** A structure that holds no solutes: a cell must be emptied into open cells before it is sealed. */
export function sealsCell(st: number): boolean {
  return st === ST_STONE || st === ST_WALL;
}

/**
 * How one covered cell responds to a Lab brush:
 * - 'ok'        the edit applies here;
 * - 'rim'       outside the dish (never editable; a wall cannot cross the rim);
 * - 'structure' a stone, wall or bead is in the way (paint and placement skip it);
 * - 'organism'  a live organism occupies it (structures never overlap live organisms);
 * - 'noop'      nothing here for this edit (erasing a cell that has no structure).
 */
export type BrushCellOutcome = 'ok' | 'rim' | 'structure' | 'organism' | 'noop';
export type LabBrushRule = 'material' | 'substrate' | 'shade' | 'place' | 'erase';

export function brushCellOutcome(rule: LabBrushRule, structure: number, occupied: boolean): BrushCellOutcome {
  if (structure === ST_OUTSIDE) return 'rim';
  switch (rule) {
    case 'material':
      // Material brushes need a cell solutes can occupy: open water/gel/sediment or a porous bead.
      return structure === ST_NONE || structure === ST_BEAD ? 'ok' : 'structure';
    case 'substrate':
      // The substrate under a structure is kept exactly as it was, so erasing the structure restores it.
      return structure === ST_NONE ? 'ok' : 'structure';
    case 'shade':
      return 'ok';
    case 'place':
      if (structure !== ST_NONE) return 'structure';
      return occupied ? 'organism' : 'ok';
    case 'erase':
      return isPlacedStructure(structure) ? 'ok' : 'noop';
  }
}

/**
 * Cells covered by a stroke: brush disks (brushCells) at points sampled at most one cell apart along
 * each segment, each cell once, ascending. The same footprint as the deposit command's strokeCells
 * (tests/sim/lab-commands.test.ts proves they agree), kept here so the UI preview can use it without
 * pulling the simulation into the main thread.
 */
export function strokeFootprint(points: ReadonlyArray<readonly [number, number]>, radius: number): number[] {
  const seen = new Uint8Array(CELL_COUNT);
  const out: number[] = [];
  const add = (x: number, y: number) => {
    for (const cell of brushCells(x, y, radius)) {
      if (seen[cell] === 1) continue;
      seen[cell] = 1;
      out.push(cell);
    }
  };
  for (let k = 0; k < points.length; k++) {
    const [x, y] = points[k]!;
    if (k === 0) {
      add(x, y);
      continue;
    }
    const [px, py] = points[k - 1]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(x - px, y - py)));
    for (let s = 1; s <= steps; s++) add(px + ((x - px) * s) / steps, py + ((y - py) * s) / steps);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Where the contents of a cell go when it is sealed by stone or wall: the nearest cells solutes can
 * occupy, found breadth-first through the cells being sealed in the same edit (`sealing[i] === 1`)
 * but never through an existing structure or the outside, so nothing jumps across a wall. Returns
 * every open cell of the first ring that has any, ascending; empty when the sealed region has no
 * open neighbor at all. `mark`/`stamp` are caller-owned scratch (mark.length === CELL_COUNT).
 */
export function displacementTargets(g: Grid, start: number, sealing: Uint8Array, mark: Int32Array, stamp: number): number[] {
  const targets: number[] = [];
  let ring = [start];
  mark[start] = stamp;
  while (ring.length > 0 && targets.length === 0) {
    const next: number[] = [];
    for (const i of ring) {
      const x = cellX(i);
      const y = cellY(i);
      const around = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const;
      for (const [nx, ny] of around) {
        if (!inBounds(nx, ny) || !inMask(nx, ny)) continue;
        const n = cellIndex(nx, ny);
        if (mark[n] === stamp) continue;
        mark[n] = stamp;
        if (sealing[n] === 1) next.push(n);
        else if (transportOpen(g, n)) targets.push(n);
      }
    }
    ring = next;
  }
  return targets.sort((a, b) => a - b);
}
