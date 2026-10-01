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
  /** Painted shade multiplier: 1.0, or the world's recorded shade paint factor (CT §5.1: 0.1). */
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

/**
 * Paint materials the simulation implements, by content `target` (CT §5.1 habitat and shade paint;
 * content/materials WATER, GEL, SEDIMENT, SHADE). A world offers a paint only when its recorded
 * content has a `paint` material with that target; the shade factor is that record's dose.
 */
export const PAINT_TARGETS = ['water', 'gel', 'sediment', 'shade'] as const;
export type PaintTarget = (typeof PAINT_TARGETS)[number];

/**
 * Cell structures the simulation implements, by content ID (CT §4; content/structures). Their
 * behaviour is the grid's (transportOpen, openForFree, sealsCell, isStoneEdge), keyed by ID like a
 * module; a world may place one only when its recorded manifest enables that ID.
 */
export const STRUCTURE_RECORD_IDS: Readonly<Record<PlaceableStructure, string>> = { stone: 'STONE', wall: 'WALL', bead: 'BEAD' };

/**
 * Every habitat edit refused because the world's recorded content lacks it has a note ending with this
 * (structures.ts unavailableHabitatEdit); the UI words the refusal with content names instead.
 */
export const NOT_IN_DISH = 'not in this dish';

/** Lab brush radii (CT §5.1: 1/3/6, default 3). */
export const LAB_RADII = [1, 3, 6] as const;
export const LAB_MAX_RADIUS = 6;

/** A habitat edit carries exactly one of the Lab radii (CT §5.1); anything else is malformed. */
export function isLabRadius(r: unknown): boolean {
  return r === 1 || r === 3 || r === 6;
}

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
 * - 'habitat'   the organism being added cannot live on this substrate (Life brush only);
 * - 'noop'      nothing here for this edit (erasing a cell that has no structure).
 */
export type BrushCellOutcome = 'ok' | 'rim' | 'structure' | 'organism' | 'habitat' | 'noop';
export type LabBrushRule = 'material' | 'substrate' | 'shade' | 'place' | 'erase';

export function brushCellOutcome(rule: LabBrushRule, structure: number, occupied: boolean): Exclude<BrushCellOutcome, 'habitat'> {
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
 * How many brush disks strokeFootprint samples for these points: one for the first point, then
 * max(1, ⌈segment length⌉) per segment (the same count as its loop). Counting stops once it passes
 * `limit`, so an absurd stroke is measured in time proportional to its point count, never its length.
 */
export function strokeSampleCount(points: ReadonlyArray<readonly [number, number]>, limit = Infinity): number {
  let n = points.length > 0 ? 1 : 0;
  for (let k = 1; k < points.length && n <= limit; k++) {
    const [x, y] = points[k]!;
    const [px, py] = points[k - 1]!;
    n += Math.max(1, Math.ceil(Math.hypot(x - px, y - py)));
  }
  return n;
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

/** A species' habitat bits (water 1, gel 2, sediment 4), as the species table builds them. */
export function habitatMaskOf(habitats: readonly string[]): number {
  let mask = 0;
  for (const h of habitats) mask |= h === 'water' ? 1 : h === 'gel' ? 2 : h === 'sediment' ? 4 : 0;
  return mask;
}

/** What the Life brush needs to know about the organism it adds (from its recorded species). */
export interface LifeBrush {
  readonly habitatMask: number;
  /** Attached species may sit on porous beads; free swimmers may not. */
  readonly attached: boolean;
  /**
   * The species record's attachment surfaces ('gel', 'sediment', 'stoneEdge', 'bead', 'mesh'); absent
   * for a free-living species. An attached species needs one of them in the cell (SPEC §2.2, D-0006).
   */
  readonly surfaces?: readonly string[];
}

/**
 * How one covered cell responds to the Life brush: exactly the inoculate command's cell filter
 * (canOccupy → habitatCompatible, src/sim/suitability.ts, with src/sim/attachment.ts's surfaces),
 * stated over the grid codes so the renderer's preview can use it; tests/sim/lab-commands.test.ts ties
 * the two cell by cell. `stoneEdge` says whether the cell is a stone edge (isStoneEdge: an open cell
 * four-adjacent to stone). A cell without one of an attached species' surfaces is 'habitat'.
 */
export function lifeCellOutcome(structure: number, substrate: number, life: LifeBrush, stoneEdge: boolean): BrushCellOutcome {
  if (structure === ST_OUTSIDE) return 'rim';
  if (structure !== ST_NONE && !(structure === ST_BEAD && life.attached)) return 'structure';
  const bit = substrate === SUB_WATER ? 1 : substrate === SUB_GEL ? 2 : substrate === SUB_SEDIMENT ? 4 : 0;
  if ((life.habitatMask & bit) === 0) return 'habitat';
  const surfaces = life.surfaces;
  if (surfaces === undefined) return 'ok';
  const on =
    structure === ST_BEAD
      ? surfaces.includes('bead')
      : (substrate === SUB_GEL && surfaces.includes('gel')) ||
        (substrate === SUB_SEDIMENT && surfaces.includes('sediment')) ||
        (structure === ST_NONE && stoneEdge && surfaces.includes('stoneEdge'));
  return on ? 'ok' : 'habitat';
}

/**
 * Where the contents of newly sealed cells go (stone or wall, SPEC §2.4; D-0024): each sealed cell's
 * contents go, in equal shares, to its nearest open cells, the distance being counted through cells
 * sealed by the same edit only, never through an existing structure or the outside, so nothing jumps
 * across a wall. `targets` of a cell are every open cell at that least distance, ascending. A region
 * of sealed cells with no open neighbour at all is `enclosed` and cannot be sealed.
 */
export interface SealingPlan {
  /** Cells that can be sealed, ascending (the rest of `cells` is enclosed). */
  readonly sealed: Int32Array;
  /** Cell c's targets are `targets[start[c] … start[c] + count[c])` (indexed by cell). */
  readonly start: Int32Array;
  readonly count: Int32Array;
  readonly targets: Int32Array;
  /** How many of `cells` lie in a region with no open neighbour. */
  readonly enclosed: number;
}

/** Up to four in-grid neighbours of cell c (x+1, x−1, y+1, y−1) into `out`; returns how many. */
function neighbours(c: number, out: Int32Array): number {
  const x = c % GRID_W;
  let k = 0;
  if (x + 1 < GRID_W) out[k++] = c + 1;
  if (x > 0) out[k++] = c - 1;
  if (c + GRID_W < CELL_COUNT) out[k++] = c + GRID_W;
  if (c >= GRID_W) out[k++] = c - GRID_W;
  return k;
}

/**
 * Plan sealing `cells` (ascending, each currently open) in near-linear time: one multi-source
 * breadth-first search from the open boundary gives every sealed cell its least distance d to an open
 * cell; a cell at d = 1 sends to its open neighbours, and a cell at d > 1 to the union of the targets
 * of its sealed neighbours at d − 1 (exactly the open cells at distance d, since every shortest path
 * steps down one level at a time). Work is proportional to the cells plus the (cell, target) pairs
 * the moves need anyway; scratch is allocated once per call, never per cell. Pure: reads the grid.
 */
export function planSealing(g: Grid, cells: readonly number[]): SealingPlan {
  const n = cells.length;
  const sealing = new Uint8Array(CELL_COUNT);
  for (let k = 0; k < n; k++) sealing[cells[k]!] = 1;
  const dist = new Int32Array(CELL_COUNT); // 0: not sealing, or not reached from an open cell
  const queue = new Int32Array(n);
  const nb = new Int32Array(4);
  let tail = 0;
  for (let k = 0; k < n; k++) {
    const c = cells[k]!;
    const m = neighbours(c, nb);
    for (let j = 0; j < m; j++) {
      const o = nb[j]!;
      if (sealing[o] !== 1 && transportOpen(g, o)) {
        dist[c] = 1;
        queue[tail++] = c;
        break;
      }
    }
  }
  for (let head = 0; head < tail; head++) {
    const c = queue[head]!;
    const d = dist[c]! + 1;
    const m = neighbours(c, nb);
    for (let j = 0; j < m; j++) {
      const o = nb[j]!;
      if (sealing[o] === 1 && dist[o] === 0) {
        dist[o] = d;
        queue[tail++] = o;
      }
    }
  }
  // Target sets in search order (every cell at d − 1 is finished before any cell at d).
  const start = new Int32Array(CELL_COUNT);
  const count = new Int32Array(CELL_COUNT);
  let arena = new Int32Array(Math.max(64, tail * 4));
  let used = 0;
  let a = new Int32Array(CELL_COUNT);
  let b = new Int32Array(CELL_COUNT);
  for (let h = 0; h < tail; h++) {
    const c = queue[h]!;
    const d = dist[c]!;
    const m = neighbours(c, nb);
    let len = 0;
    if (d === 1) {
      for (let j = 0; j < m; j++) {
        const o = nb[j]!;
        if (sealing[o] === 1 || !transportOpen(g, o)) continue;
        // Insertion into the (at most four) sorted open neighbours.
        let p = len++;
        while (p > 0 && a[p - 1]! > o) {
          a[p] = a[p - 1]!;
          p--;
        }
        a[p] = o;
      }
    } else {
      let first = true;
      for (let j = 0; j < m; j++) {
        const o = nb[j]!;
        if (sealing[o] !== 1 || dist[o] !== d - 1) continue;
        const s0 = start[o]!;
        const k0 = count[o]!;
        if (first) {
          for (let q = 0; q < k0; q++) a[q] = arena[s0 + q]!;
          len = k0;
          first = false;
          continue;
        }
        // Sorted union without duplicates of a[0…len) and arena[s0…s0+k0) into b, then swap.
        let i1 = 0;
        let i2 = 0;
        let out = 0;
        while (i1 < len && i2 < k0) {
          const x1 = a[i1]!;
          const x2 = arena[s0 + i2]!;
          if (x1 < x2) {
            b[out++] = x1;
            i1++;
          } else if (x2 < x1) {
            b[out++] = x2;
            i2++;
          } else {
            b[out++] = x1;
            i1++;
            i2++;
          }
        }
        while (i1 < len) b[out++] = a[i1++]!;
        while (i2 < k0) b[out++] = arena[s0 + i2++]!;
        const t = a;
        a = b;
        b = t;
        len = out;
      }
    }
    if (used + len > arena.length) {
      const grown = new Int32Array(Math.max(arena.length * 2, used + len));
      grown.set(arena);
      arena = grown;
    }
    for (let q = 0; q < len; q++) arena[used + q] = a[q]!;
    start[c] = used;
    count[c] = len;
    used += len;
  }
  const sealed = new Int32Array(tail);
  let s = 0;
  for (let k = 0; k < n; k++) if (dist[cells[k]!]! > 0) sealed[s++] = cells[k]!;
  return { sealed, start, count, targets: arena, enclosed: n - tail };
}
