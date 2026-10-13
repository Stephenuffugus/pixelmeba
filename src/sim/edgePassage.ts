/**
 * Organisms and edge barriers / cell furnishings (Phase 5 wave 9 barrier-movement; SPEC §2.4, §4.9,
 * §6.4; CT §1.1, §4, §5.3; D-0106, D-0108). PURE reads of one world: no randomness, no writes to
 * simulation state.
 *
 * - edgeCodesOf / deviceKindsOf: per-cell views of world.edges / world.devices, cached per world object
 *   (one worker holds several worlds, and every freshly realized world starts at the same
 *   geometryVersion), rebuilt when grid.geometryVersion, the store array's identity or its length moves.
 *   Every writer of an edge or a device must also bump grid.geometryVersion (wave 10's contract); the
 *   array identity catches realizeRecipe's placement, which assigns new arrays without a bump.
 * - pairPermitted: whether two organisms in cells at most one apart (in x and in y) may interact or be
 *   placed across the boundary between them (predation claims, parasite attachment, E12 links,
 *   daughter and fungal placement: D-0106 "never cross an edge that blocks either party's class").
 *   A diagonal pair needs BOTH L-paths around the shared corner clear for both classes, so nothing
 *   squeezes past the end of a barrier through an exact corner (PROPOSED DECISION, wave 9).
 * - segmentPermitted: whether a straight segment crosses no edge that refuses `cls` (edges only;
 *   cells stay the trace's business). Used for hunting targets (SPEC §6.4 "invalid targets cancel").
 * - shelterRefuses: S05 porous shelter occupancy (CT §5.3: Small pass, Medium/Large blocked).
 * - markRefusedEdges: the decision window's trace marks (movement.ts decide's fast path).
 *
 * Gates (D-0103): every function returns at once without reading anything when the store it concerns
 * is empty, and a world can hold edges or devices only when its recorded manifest enables 'barriers' /
 * 'devices' (import and content checks), so a v1.0 world never reaches any of the new rules.
 */
import type { Species } from './content/schema';
import { GRID_W } from './constants';
import { DEVICE_KINDS } from './devices';
import {
  edgeCodeArrays,
  edgeCodeBetween,
  edgePermits,
  freeClassOfSpecies,
  type EdgeCodeArrays,
  type OrganismClass,
} from './barriers';
import { cellIndex, inBounds } from './grid';
import type { World } from './world';

/** A class an organism can have (barriers.ts classOf). */
export type PassageClass = OrganismClass | 'viral';

/** deviceKindsOf's code of an S05 porous shelter (its DEVICE_KINDS index + 1). */
export const KIND_SHELTER = DEVICE_KINDS.indexOf('S05') + 1;
/** deviceKindsOf's code of an S06 attachment mesh. */
export const KIND_MESH = DEVICE_KINDS.indexOf('S06') + 1;

interface PassageCache {
  edgeGeo: number;
  edgeRef: readonly unknown[] | null;
  edgeLen: number;
  codes: EdgeCodeArrays | null;
  devGeo: number;
  devRef: readonly unknown[] | null;
  devLen: number;
  kinds: Uint8Array | null;
}

// Per-world derived views (never saved, never hashed), keyed by the world object.
// eslint-disable-next-line no-restricted-syntax -- lookup only, never iterated
const caches = new WeakMap<object, PassageCache>();

function cacheOf(world: World): PassageCache {
  let pc = caches.get(world);
  if (pc === undefined) {
    pc = {
      edgeGeo: -1,
      edgeRef: null,
      edgeLen: -1,
      codes: null,
      devGeo: -1,
      devRef: null,
      devLen: -1,
      kinds: null,
    };
    caches.set(world, pc);
  }
  return pc;
}

/** The world's per-cell edge codes (barriers.ts edgeCodeArrays), or null when it holds no edge barrier. */
export function edgeCodesOf(world: World): EdgeCodeArrays | null {
  const edges = world.edges;
  if (edges.length === 0) return null;
  const pc = cacheOf(world);
  const geo = world.grid.geometryVersion;
  if (pc.codes === null || pc.edgeGeo !== geo || pc.edgeRef !== edges || pc.edgeLen !== edges.length) {
    pc.codes = edgeCodeArrays(edges);
    pc.edgeGeo = geo;
    pc.edgeRef = edges;
    pc.edgeLen = edges.length;
  }
  return pc.codes;
}

/** The world's furnishing/device kind per cell (0 = none, else DEVICE_KINDS index + 1), or null when it holds none. */
export function deviceKindsOf(world: World): Uint8Array | null {
  const devices = world.devices;
  if (devices.length === 0) return null;
  const pc = cacheOf(world);
  const geo = world.grid.geometryVersion;
  if (pc.kinds === null || pc.devGeo !== geo || pc.devRef !== devices || pc.devLen !== devices.length) {
    const kinds = pc.kinds ?? new Uint8Array(world.grid.substrate.length);
    kinds.fill(0);
    for (let k = 0; k < devices.length; k++) {
      const d = devices[k]!;
      kinds[d.cell] = DEVICE_KINDS.indexOf(d.kind) + 1;
    }
    pc.kinds = kinds;
    pc.devGeo = geo;
    pc.devRef = devices;
    pc.devLen = devices.length;
  }
  return pc.kinds;
}

function permitsBoth(code: number, a: PassageClass, b: PassageClass): boolean {
  return edgePermits(code, a) && (b === a || edgePermits(code, b));
}

/**
 * Whether both L-paths from cell (x, y) to its diagonal neighbour (x + sx, y + sy) cross only edges that
 * permit both classes (the corner rule). Cells off the grid are not this rule's business (true).
 */
export function cornerPermits(
  arrays: EdgeCodeArrays,
  x: number,
  y: number,
  sx: number,
  sy: number,
  a: PassageClass,
  b: PassageClass,
): boolean {
  const hx = x + sx;
  const vy = y + sy;
  if (!inBounds(hx, y) || !inBounds(x, vy)) return true;
  const from = cellIndex(x, y);
  const h = cellIndex(hx, y);
  const v = cellIndex(x, vy);
  const to = cellIndex(hx, vy);
  return (
    permitsBoth(edgeCodeBetween(arrays, from, h), a, b) &&
    permitsBoth(edgeCodeBetween(arrays, h, to), a, b) &&
    permitsBoth(edgeCodeBetween(arrays, from, v), a, b) &&
    permitsBoth(edgeCodeBetween(arrays, v, to), a, b)
  );
}

/**
 * Whether two organisms in cells `a` and `b` (at most one apart in x and in y) of classes `clsA` and
 * `clsB` may interact or be placed across the boundary between those cells (D-0106). Same cell: true.
 * 4-adjacent: the edge between them permits both classes. Diagonal: the corner rule (cornerPermits).
 * With no edge barrier in the world it returns true without reading anything else.
 */
export function pairPermitted(
  world: World,
  a: number,
  b: number,
  clsA: PassageClass,
  clsB: PassageClass,
): boolean {
  if (a === b) return true;
  const arrays = edgeCodesOf(world);
  if (arrays === null) return true;
  const ax = a % GRID_W;
  const ay = (a - ax) / GRID_W;
  const bx = b % GRID_W;
  const by = (b - bx) / GRID_W;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx < -1 || dx > 1 || dy < -1 || dy > 1)
    throw new Error(`pairPermitted(): cells ${a} and ${b} are not neighbours`);
  if (dx === 0 || dy === 0) return permitsBoth(edgeCodeBetween(arrays, a, b), clsA, clsB);
  return cornerPermits(arrays, ax, ay, dx, dy, clsA, clsB);
}

/**
 * Whether the straight segment (x0, y0) → (x1, y1) crosses no edge barrier that refuses `cls`: the grid
 * DDA of movement.ts traceFraction (the Y step first at an exact corner, where the corner rule applies),
 * checking edges only. Cells off the grid end the check (true: cells are the trace's business).
 */
export function segmentPermitted(
  world: World,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cls: PassageClass,
): boolean {
  const arrays = edgeCodesOf(world);
  if (arrays === null) return true;
  let cx = Math.floor(x0);
  let cy = Math.floor(y0);
  const ex = Math.floor(x1);
  const ey = Math.floor(y1);
  if (cx === ex && cy === ey) return true;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = stepX > 0 ? (cx + 1 - x0) / dx : stepX < 0 ? (x0 - cx) / -dx : Infinity;
  let tMaxY = stepY > 0 ? (cy + 1 - y0) / dy : stepY < 0 ? (y0 - cy) / -dy : Infinity;
  for (let guard = 0; guard < 512; guard++) {
    const px = cx;
    const py = cy;
    let t: number;
    if (tMaxX < tMaxY) {
      t = tMaxX;
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      t = tMaxY;
      if (t <= 1 && tMaxX === tMaxY && !cornerPermits(arrays, px, py, stepX, stepY, cls, cls)) return false;
      cy += stepY;
      tMaxY += tDeltaY;
    }
    if (t > 1 || !inBounds(cx, cy)) return true;
    if (!edgePermits(edgeCodeBetween(arrays, cellIndex(px, py), cellIndex(cx, cy)), cls)) return false;
    if (cx === ex && cy === ey) return true;
  }
  return true;
}

/**
 * Whether an S05 porous shelter in `cell` refuses an organism of species `def` (CT §4, §5.3: Small
 * pass, Medium and Large are blocked; Fixed life, including every species that lives attached such as
 * P06, is not affected, and a shelter is no attachment surface). Species-level (barriers.ts
 * freeClassOfSpecies), so the rule lives in movement.ts canOccupy, the occupancy rule every placement
 * path already calls.
 */
export function shelterRefuses(
  world: World,
  def: Pick<Species, 'category' | 'transportClass' | 'attachment'>,
  cell: number,
): boolean {
  const kinds = deviceKindsOf(world);
  if (kinds === null || kinds[cell] !== KIND_SHELTER) return false;
  const cls = freeClassOfSpecies(def);
  return cls === 'medium' || cls === 'large';
}

/**
 * Decision-window trace marks (movement.ts decide): for the (2r + 1)² window centred on (cx, cy), set
 * out[wy * W + wx] = 1 on both cells of every in-window edge whose code refuses `cls`, else 0. A
 * straight trace between two window cells crosses only edges between cells of the rectangle the two
 * span (the corner rule's L-path edges included), so a rectangle without a mark holds no refusing edge.
 */
export function markRefusedEdges(
  arrays: EdgeCodeArrays,
  cx: number,
  cy: number,
  r: number,
  W: number,
  cls: PassageClass,
  out: Uint8Array,
): void {
  for (let k = 0; k < W * W; k++) out[k] = 0;
  for (let wy = 0; wy < W; wy++) {
    const y = cy - r + wy;
    for (let wx = 0; wx < W; wx++) {
      const x = cx - r + wx;
      if (!inBounds(x, y)) continue;
      const cell = cellIndex(x, y);
      if (wx + 1 < W && inBounds(x + 1, y) && !edgePermits(arrays.r[cell]!, cls)) {
        out[wy * W + wx] = 1;
        out[wy * W + wx + 1] = 1;
      }
      if (wy + 1 < W && inBounds(x, y + 1) && !edgePermits(arrays.d[cell]!, cls)) {
        out[wy * W + wx] = 1;
        out[(wy + 1) * W + wx] = 1;
      }
    }
  }
}
