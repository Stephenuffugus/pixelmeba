/**
 * Phase 5 structure placement rules (P5.1/P5.2; SPEC §2.4, §10.4; CT §4, §14; D-0106, D-0117). PURE: grid
 * codes, edge codes and per-cell device kinds in, an outcome out. No World, no randomness, no writes.
 *
 * The structure commands (structureEdits.ts) and Lab habitat edits (structures.ts applyHabitatEdit) decide
 * every cell or edge with these functions, and the renderer's refusal preview (wave 11) calls the same
 * functions on the GeometryMsg arrays, so a preview can never promise what the command refuses.
 * src/render may import this module (ARCH §3: the renderer may read @sim; the ESLint boundary forbids
 * only UI and art imports there). It imports only grid.ts, barriers.ts, devices.ts and constants.ts.
 */
import { CELL_COUNT, DEVICE_CAP, EDGE_BARRIER_CAP, GRID_H, GRID_W } from './constants';
import {
  cellInDish,
  EDGE_CHANNEL,
  EDGE_NONE,
  edgeKey,
  edgeNeighbour,
  type EdgeCodeArrays,
  type EdgeDir,
  type EdgeKind,
} from './barriers';
import { ST_NONE, ST_STONE, ST_WALL, SUB_WATER, type Grid, type LabBrushRule } from './grid';

/** Why an edge of a placeEdges stroke is refused (or 'ok'), in the order they are checked. */
export type EdgePlacementOutcome = 'ok' | 'rim' | 'structure' | 'barrier' | 'channel' | 'cap';

/**
 * How one edge of a placeEdges stroke responds, in this order (D-0117):
 * - 'rim'       either cell of the edge lies outside the dish (cellInDish, edgeNeighbour);
 * - 'structure' either cell is a stone or a wall (a sealed cell holds nothing and no organism; a bead,
 *               being porous, is allowed beside an S01, S02 or S03);
 * - 'barrier'   the edge already holds a barrier (CT §4 "two barriers per edge invalid");
 * - 'channel'   an S04 whose two cells are not both open water (water substrate with no structure);
 * - 'cap'       the store would pass EDGE_BARRIER_CAP (512); `count` is the store's size plus the edges
 *               of this stroke accepted before this one.
 * `codes` are the store's per-cell edge codes (barriers.ts edgeCodeArrays), or null for an empty store.
 */
export function edgePlacementOutcome(
  kind: EdgeKind,
  cell: number,
  dir: EdgeDir,
  grid: Pick<Grid, 'substrate' | 'structure'>,
  codes: EdgeCodeArrays | null,
  count: number,
): EdgePlacementOutcome {
  const other = cellInDish(cell) ? edgeNeighbour(cell, dir) : -1;
  if (other < 0 || !cellInDish(other)) return 'rim';
  for (const side of [cell, other]) {
    const st = grid.structure[side];
    if (st === ST_STONE || st === ST_WALL) return 'structure';
  }
  if (codes !== null && (dir === 'R' ? codes.r : codes.d)[cell] !== EDGE_NONE) return 'barrier';
  if (kind === 'S04') {
    for (const side of [cell, other]) {
      if (grid.substrate[side] !== SUB_WATER || grid.structure[side] !== ST_NONE) return 'channel';
    }
  }
  if (count >= EDGE_BARRIER_CAP) return 'cap';
  return 'ok';
}

/** Why a furnishing or device placement is refused (or 'ok'), in the order they are checked. */
export type DevicePlacementOutcome = 'ok' | 'rim' | 'structure' | 'device' | 'cap';

/**
 * How a placeDevice cell responds, in this order: 'rim' (outside the dish), 'structure' (not ST_NONE: a
 * stone, wall or bead; devices.ts wants open water, gel or sediment), 'device' (a furnishing or device is
 * already there: one per cell), 'cap' (the shared store of DEVICE_CAP = 256 is full; `count` is its size).
 * `kinds` is the per-cell device kind (edgePassage.ts deviceKindsOf, 0 = none), or null for an empty store.
 * A live organism or a food object does not refuse a device (a basket holds the object on its cell).
 */
export function devicePlacementOutcome(
  cell: number,
  structure: ArrayLike<number>,
  kinds: ArrayLike<number> | null,
  count: number,
): DevicePlacementOutcome {
  if (!cellInDish(cell)) return 'rim';
  if (structure[cell] !== ST_NONE) return 'structure';
  if (kinds !== null && kinds[cell] !== 0) return 'device';
  if (count >= DEVICE_CAP) return 'cap';
  return 'ok';
}

/** Why a device move is refused (or 'ok'). */
export type DeviceMoveOutcome = 'ok' | 'rim' | 'structure' | 'device' | 'object';

/**
 * How a moveDevice destination responds: 'rim', 'structure' and 'device' as devicePlacementOutcome (the
 * cap never applies: the store keeps its size), then 'object' when a basket carrying a food object would
 * land on a cell that already holds another object (one object per cell). `basketObjectClash` says that.
 */
export function deviceMoveOutcome(
  cell: number,
  structure: ArrayLike<number>,
  kinds: ArrayLike<number> | null,
  basketObjectClash: boolean,
): DeviceMoveOutcome {
  const o = devicePlacementOutcome(cell, structure, kinds, 0);
  if (o !== 'ok') return o as Exclude<DevicePlacementOutcome, 'cap'>;
  return basketObjectClash ? 'object' : 'ok';
}

/** Cells that are one side of an S04 channel (1), from the store's per-cell edge codes; null for none. */
export function channelSides(codes: EdgeCodeArrays | null): Uint8Array | null {
  if (codes === null) return null;
  let out: Uint8Array | null = null;
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (codes.r[cell] === EDGE_CHANNEL) {
      out ??= new Uint8Array(CELL_COUNT);
      out[cell] = 1;
      out[cell + 1] = 1;
    }
    if (codes.d[cell] === EDGE_CHANNEL) {
      out ??= new Uint8Array(CELL_COUNT);
      out[cell] = 1;
      out[cell + GRID_W] = 1;
    }
  }
  return out;
}

/** Why a Lab habitat edit skips a cell because of a Phase 5 structure (D-0111 carry-over), or null. */
export type LabConflict = 'device' | 'barrier' | null;

/**
 * The Lab's structure rule (D-0111, D-0117), applied to a cell the existing brush rule
 * (grid.ts brushCellOutcome) already accepted, so every older reason keeps its precedence:
 * - 'place' (stone, wall, bead): a cell holding a furnishing or device is skipped ('device': devices sit
 *   only on open cells), and so is a side of an S04 ('barrier': a channel joins two open water cells);
 * - 'substrate': painting gel or sediment (`substrate` ≠ water) on a side of an S04 is skipped
 *   ('barrier'); painting water is allowed;
 * - every other rule (shade, erase, material, object) is unaffected: devices never sit on a stone, wall or
 *   bead, and shade is not substrate.
 * Refusal, never removal: the player keeps the structure and sees why.
 */
export function labCellConflict(rule: LabBrushRule, substrate: number | null, hasDevice: boolean, channelSide: boolean): LabConflict {
  if (rule === 'place') return hasDevice ? 'device' : channelSide ? 'barrier' : null;
  if (rule === 'substrate') return channelSide && substrate !== SUB_WATER ? 'barrier' : null;
  return null;
}

/**
 * The grid edge nearest to a continuous point (x, y) (cell (i, j) spans [i, i + 1) × [j, j + 1)), as
 * [lower cell, dir] (barriers.ts EdgeBarrier.cell/dir), or null when that edge has no cell on one side of
 * it inside the grid. Ties go to the vertical edge ('R'). For the wave 11 tap/drag snapping (D-0106).
 */
export function nearestEdge(x: number, y: number): readonly [number, EdgeDir] | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const vx = Math.round(x); // nearest vertical grid line
  const hy = Math.round(y); // nearest horizontal grid line
  const dV = Math.abs(x - vx);
  const dH = Math.abs(y - hy);
  if (dV <= dH) {
    const cx = vx - 1;
    const cy = Math.floor(y);
    if (cx < 0 || cx + 1 >= GRID_W || cy < 0 || cy >= GRID_H) return null;
    return [cy * GRID_W + cx, 'R'];
  }
  const cx = Math.floor(x);
  const cy = hy - 1;
  if (cx < 0 || cx >= GRID_W || cy < 0 || cy + 1 >= GRID_H) return null;
  return [cy * GRID_W + cx, 'D'];
}

/** The canonical order of a stroke's edges (barriers.ts edgeKey), as the command sorts them. */
export function sortStrokeEdges(edges: ReadonlyArray<readonly [number, EdgeDir]>): Array<readonly [number, EdgeDir]> {
  return [...edges].sort((a, b) => edgeKey(a[0], a[1]) - edgeKey(b[0], b[1]));
}
