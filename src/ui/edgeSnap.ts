/**
 * Edge snapping for the Build tools (P5.1/P5.2; D-0106 "edges tapped or dragged, snapped to the nearest
 * edge, with a refusal preview before commit"; D-0119). PURE: world points in, edges and ids out; no DOM,
 * no renderer, no worker.
 *
 * - nearestEdge(x, y): the grid edge whose MIDPOINT is nearest the point (an 'R' edge of cell (i, j) has
 *   its midpoint at (i + 1, j + 0.5), a 'D' edge at (i + 0.5, j + 1)). Ties go to the lower edgeKey
 *   (cell × 2, plus 1 for 'D'), so the result never depends on evaluation order. Null outside the grid,
 *   or when no edge with a cell on both sides lies near.
 * - snapStroke(points): a tap (a stroke that never leaves the grid vertex nearest its first point) is the
 *   nearest edge of its first point. A drag is sampled at most 0.25 cell apart, each sample snapped to its
 *   nearest grid VERTEX, and consecutive vertices joined by the grid edges between them (a diagonal step
 *   turns at the corner nearer the stroke, a tie turning horizontally first), so a drag a little off a grid
 *   line gives that line's edges and nothing across it, and every drag gives one connected path (D-0120:
 *   the midpoint rule per sample drew a comb of perpendicular edges along a slightly-off line). The edges
 *   are de-duplicated in stroke order and capped at EDGE_BARRIER_CAP (512): exactly what one placeEdges
 *   command may carry (the command refuses a repeated edge). Leaving the grid breaks the path.
 * - pickRemoveTarget / strokeRemoveIds: what the Remove tool takes (D-0119): a tap within 0.3 cell of a
 *   cell's centre, or where no barrier edge is nearer than the centre, takes that cell's furnishing or
 *   device; otherwise the nearest edge's barrier. A drag takes every barrier edge and device it passes.
 */
import { EDGE_BARRIER_CAP, GRID_H, GRID_W } from '@sim/constants';
import type { GeometryDevice, GeometryEdge } from '@worker/protocol';

export type EdgeDir = 'R' | 'D';
export type EdgeRef = readonly [cell: number, dir: EdgeDir];

/** barriers.ts edgeKey (two per cell: R, then D). */
export function edgeKeyOf(cell: number, dir: EdgeDir): number {
  return cell * 2 + (dir === 'D' ? 1 : 0);
}

/** The midpoint of an edge in world (cell) units. */
export function edgeMidpoint(cell: number, dir: EdgeDir): readonly [number, number] {
  const x = cell % GRID_W;
  const y = Math.floor(cell / GRID_W);
  return dir === 'R' ? [x + 1, y + 0.5] : [x + 0.5, y + 1];
}

function validEdge(i: number, j: number, dir: EdgeDir): boolean {
  if (dir === 'R') return i >= 0 && i + 1 < GRID_W && j >= 0 && j < GRID_H;
  return i >= 0 && i < GRID_W && j >= 0 && j + 1 < GRID_H;
}

/** The edge whose midpoint is nearest (x, y); ties to the lower edgeKey; null outside the grid. */
export function nearestEdge(x: number, y: number): EdgeRef | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  let best: EdgeRef | null = null;
  let bestD = Infinity;
  let bestKey = Infinity;
  for (let j = fy - 1; j <= fy + 1; j++) {
    for (let i = fx - 1; i <= fx + 1; i++) {
      for (const dir of ['R', 'D'] as const) {
        if (!validEdge(i, j, dir)) continue;
        const mx = dir === 'R' ? i + 1 : i + 0.5;
        const my = dir === 'R' ? j + 0.5 : j + 1;
        const d = (x - mx) * (x - mx) + (y - my) * (y - my);
        const cell = j * GRID_W + i;
        const key = edgeKeyOf(cell, dir);
        if (d < bestD || (d === bestD && key < bestKey)) {
          best = [cell, dir];
          bestD = d;
          bestKey = key;
        }
      }
    }
  }
  return best;
}

/** Spacing of the samples along a stroke, in cells. */
export const SNAP_SPACING = 0.25;

/** The stroke's sample points, at most SNAP_SPACING apart (the first point, then each segment's samples). */
export function strokeSamples(
  points: ReadonlyArray<readonly [number, number]>,
): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  if (points.length === 0) return out;
  out.push(points[0]!);
  for (let k = 1; k < points.length; k++) {
    const [ax, ay] = points[k - 1]!;
    const [bx, by] = points[k]!;
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(len / SNAP_SPACING));
    for (let t = 1; t <= n; t++) out.push([ax + ((bx - ax) * t) / n, ay + ((by - ay) * t) / n]);
  }
  return out;
}

/** The grid vertex (integer point, 0..GRID_W × 0..GRID_H) nearest (x, y); null outside the grid. */
export function nearestVertex(x: number, y: number): readonly [number, number] | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
  return [Math.round(x), Math.round(y)];
}

/** The grid edge joining two adjacent vertices; null when it has no cell on one side (the grid border). */
export function edgeBetween(ax: number, ay: number, bx: number, by: number): EdgeRef | null {
  if (ay === by && Math.abs(ax - bx) === 1) {
    // The horizontal segment at y = ay: the D edge of the cell above it.
    const x = Math.min(ax, bx);
    return x >= 0 && x < GRID_W && ay >= 1 && ay < GRID_H ? [(ay - 1) * GRID_W + x, 'D'] : null;
  }
  if (ax === bx && Math.abs(ay - by) === 1) {
    // The vertical segment at x = ax: the R edge of the cell to its left.
    const y = Math.min(ay, by);
    return ax >= 1 && ax < GRID_W && y >= 0 && y < GRID_H ? [y * GRID_W + ax - 1, 'R'] : null;
  }
  return null;
}

/** A stroke's distinct snapped edges, in stroke order, at most EDGE_BARRIER_CAP (see the header). */
export function snapStroke(points: ReadonlyArray<readonly [number, number]>): EdgeRef[] {
  const out: EdgeRef[] = [];
  const seen = new Set<number>();
  /** Adds an edge once; true when the cap is reached. */
  const add = (e: EdgeRef | null): boolean => {
    if (!e) return false;
    const key = edgeKeyOf(e[0], e[1]);
    if (seen.has(key)) return false;
    seen.add(key);
    out.push(e);
    return out.length >= EDGE_BARRIER_CAP;
  };
  let moved = false;
  let prev: readonly [number, number] | null = null;
  let prevSample: readonly [number, number] | null = null;
  for (const s of strokeSamples(points)) {
    const v = nearestVertex(s[0], s[1]);
    if (!v) {
      prev = null; // leaving the grid breaks the path
      continue;
    }
    if (prev && prevSample && (v[0] !== prev[0] || v[1] !== prev[1])) {
      moved = true;
      // Samples are at most 0.25 apart, so a vertex changes by at most 1 on each axis per sample.
      if (v[0] !== prev[0] && v[1] !== prev[1]) {
        // A diagonal step (the stroke passed near a cell centre): turn at the corner nearer the stroke.
        const mx = (prevSample[0] + s[0]) / 2;
        const my = (prevSample[1] + s[1]) / 2;
        const dH = (mx - v[0]) ** 2 + (my - prev[1]) ** 2; // corner after a horizontal step
        const dV = (mx - prev[0]) ** 2 + (my - v[1]) ** 2; // corner after a vertical step
        const [cx, cy] = dH <= dV ? [v[0], prev[1]] : [prev[0], v[1]];
        if (add(edgeBetween(prev[0], prev[1], cx, cy)) || add(edgeBetween(cx, cy, v[0], v[1]))) break;
      } else if (add(edgeBetween(prev[0], prev[1], v[0], v[1]))) break;
    }
    prev = v;
    prevSample = s;
  }
  if (moved || points.length === 0) return out;
  // A tap: the nearest edge of its first point.
  const tap = nearestEdge(points[0]![0], points[0]![1]);
  return tap ? [tap] : [];
}

/** Within this distance of a cell's centre a Remove tap takes the cell's furnishing or device (D-0119). */
export const REMOVE_CENTRE_RADIUS = 0.3;

/** The structures a Remove gesture can see: the latest geometry's edge list and devices. */
export interface RemoveGeometry {
  readonly edges: readonly Pick<GeometryEdge, 'id' | 'cell' | 'dir'>[];
  readonly devices: readonly Pick<GeometryDevice, 'id' | 'cell'>[];
}

function cellOf(x: number, y: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
  return Math.floor(y) * GRID_W + Math.floor(x);
}

function edgeIdAt(g: RemoveGeometry, e: EdgeRef | null): number | null {
  if (!e) return null;
  return g.edges.find((b) => b.cell === e[0] && b.dir === e[1])?.id ?? null;
}

/** What a Remove tap at (x, y) takes: a structure id, or null when there is nothing there. */
export function pickRemoveTarget(x: number, y: number, g: RemoveGeometry): number | null {
  const cell = cellOf(x, y);
  if (cell === null) return null;
  const device = g.devices.find((d) => d.cell === cell)?.id ?? null;
  const edge = nearestEdge(x, y);
  const edgeId = edgeIdAt(g, edge);
  const cx = (cell % GRID_W) + 0.5;
  const cy = Math.floor(cell / GRID_W) + 0.5;
  const dCentre = Math.hypot(x - cx, y - cy);
  if (device !== null) {
    if (dCentre <= REMOVE_CENTRE_RADIUS || edgeId === null) return device;
    const [mx, my] = edgeMidpoint(edge![0], edge![1]);
    return Math.hypot(x - mx, y - my) < dCentre ? edgeId : device;
  }
  return edgeId;
}

/** Every barrier edge and device a Remove drag passes, ascending (one removeStructures command). */
export function strokeRemoveIds(
  points: ReadonlyArray<readonly [number, number]>,
  g: RemoveGeometry,
): number[] {
  if (points.length === 1) {
    const id = pickRemoveTarget(points[0]![0], points[0]![1], g);
    return id === null ? [] : [id];
  }
  const ids = new Set<number>();
  for (const [x, y] of strokeSamples(points)) {
    const id = edgeIdAt(g, nearestEdge(x, y));
    if (id !== null) ids.add(id);
    const cell = cellOf(x, y);
    const dev = cell === null ? undefined : g.devices.find((d) => d.cell === cell);
    if (dev) ids.add(dev.id);
  }
  return [...ids].sort((a, b) => a - b);
}
