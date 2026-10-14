/**
 * Per-gate transfer tallies (Phase 5 wave 10 barrier-transport; BUILD_DIRECTIVE P5.2; g5-briefs S8;
 * D-0108, D-0117). OBSERVATION ONLY: world.gateTally is saved, never hashed and never read by the
 * simulation. Nothing here draws randomness or writes any other simulation state.
 *
 * - Fields: right before a field's diffusion step, for each S01, S02 and S03 edge (open or closed; the
 *   S04 channel is closed to ordinary diffusion and its directed moves are tallied by channel.ts), the
 *   flux the kernel will apply, f = k × s × (a_i − a_j), is computed with the kernel's own expression
 *   from the same pre-step array (transport.ts diffuseField reads only pre-step values), and |f| is added
 *   to the edge's tally (cumulative in either direction, in field units).
 * - Organisms: tick.ts brackets stage 4 with gateOrganismsBefore / gateOrganismsAfter. Every organism
 *   alive with the same birthId whose cell changed has its straight start → end segment walked with the
 *   grid DDA of movement.ts traceFraction (the Y step first at an exact corner), and every barrier edge
 *   it crosses gets one crossing. An attached parasite moved with its host counts as its own crossing.
 *   The scratch lives within one step, so a save and reload never loses a crossing.
 *
 * Gates (D-0103): every entry point returns at once without edges or when the world does not record
 * 'barriers', so a v1.0 world pays one length check.
 */
import { AGENT_CAP, GRID_W } from './constants';
import { EDGE_CHANNEL, EDGE_NONE, edgeCodeOf, edgeKey, edgeNeighbour, type EdgeBarrier } from './barriers';
import { edgeCodesOf } from './edgePassage';
import type { FieldId } from './fields';
import { worldHasSystem } from './gates';
import { inBounds } from './grid';
import type { GateTally, World } from './world';

/** One barrier edge whose diffusion flux is tallied: its structure id, its lower cell, its other cell, and whether it is a D edge. */
export interface GateEdge {
  readonly id: number;
  readonly cell: number;
  readonly other: number;
  readonly down: boolean;
}

/**
 * The edges of `edges` whose ordinary diffusion is tallied (S01, S02, S03 open or closed), in store order,
 * written into `out` (cleared first). transport.ts transportCache rebuilds it with its coefficient key.
 */
export function gateEdgesOf(edges: readonly EdgeBarrier[], out: GateEdge[]): void {
  out.length = 0;
  for (let k = 0; k < edges.length; k++) {
    const e = edges[k]!;
    if (edgeCodeOf(e) === EDGE_CHANNEL) continue;
    const other = edgeNeighbour(e.cell, e.dir);
    if (other < 0) continue;
    out.push({ id: e.id, cell: e.cell, other, down: e.dir === 'D' });
  }
}

/** Whether this world keeps gate tallies (it records 'barriers' and holds at least one edge barrier). */
export function gateTallyOn(world: World): boolean {
  return world.edges.length > 0 && worldHasSystem(world, 'barriers');
}

/** The tally record of structure `id`, created (and inserted in id order) when missing. */
export function tallyOf(world: World, id: number): GateTally {
  const list = world.gateTally;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid]!.id < id) lo = mid + 1;
    else hi = mid;
  }
  const at = list[lo];
  if (at !== undefined && at.id === id) return at;
  const rec: GateTally = { id, fields: {}, organisms: 0 };
  list.splice(lo, 0, rec);
  return rec;
}

/** Add a positive field amount to structure `id`'s tally. */
export function addFieldTally(world: World, id: number, field: FieldId, amount: number): void {
  const t = tallyOf(world, id);
  t.fields[field] = (t.fields[field] ?? 0) + amount;
}

/**
 * Tally the diffusion flux of `field` (pre-step values) across every gate edge, with the coefficient pair
 * the kernel is about to use (`kR`, `kD`: film-adjusted, the field's barrier pair) and its `half` scale.
 * Uses the kernel's expression `k × s × (a − b)` so each amount equals the flux it applies.
 */
export function tallyFieldFlux(world: World, gates: readonly GateEdge[], id: FieldId, field: Float64Array, kR: Float64Array, kD: Float64Array, half: boolean): void {
  const s = half ? 0.5 : 1;
  for (let k = 0; k < gates.length; k++) {
    const g = gates[k]!;
    const kr = (g.down ? kD : kR)[g.cell]!;
    if (kr === 0) continue;
    const f = kr * s * (field[g.cell]! - field[g.other]!);
    if (f === 0) continue;
    addFieldTally(world, g.id, id, f < 0 ? -f : f);
  }
}

// ---- Organism crossings ------------------------------------------------------------------------------

const beforeBirth = new Uint32Array(AGENT_CAP);
const beforeX = new Float64Array(AGENT_CAP);
const beforeY = new Float64Array(AGENT_CAP);
let beforeCount = -1;
let beforeWorld: World | null = null;

/** Right before stage 4: capture each living slot's birthId and position (module scratch, one step). */
export function gateOrganismsBefore(world: World): void {
  beforeCount = -1;
  beforeWorld = null;
  if (!gateTallyOn(world)) return;
  const c = world.ents.cols;
  const hw = world.ents.highWater;
  for (let i = 0; i < hw; i++) {
    if (c.alive[i] !== 1) {
      beforeBirth[i] = 0;
      continue;
    }
    beforeBirth[i] = c.birthId[i]!;
    beforeX[i] = c.x[i]!;
    beforeY[i] = c.y[i]!;
  }
  beforeCount = hw;
  beforeWorld = world;
}

/** Right after stage 4: count the barrier edges each moved organism's straight path crossed. */
export function gateOrganismsAfter(world: World): void {
  if (beforeWorld !== world || beforeCount < 0) return;
  const hw = beforeCount;
  beforeCount = -1;
  beforeWorld = null;
  if (!gateTallyOn(world)) return;
  const codes = edgeCodesOf(world);
  if (codes === null) return;
  const c = world.ents.cols;
  for (let i = 0; i < hw; i++) {
    const b = beforeBirth[i]!;
    if (b === 0 || c.alive[i] !== 1 || c.birthId[i] !== b) continue;
    const x0 = beforeX[i]!;
    const y0 = beforeY[i]!;
    const x1 = c.x[i]!;
    const y1 = c.y[i]!;
    if (Math.floor(x0) === Math.floor(x1) && Math.floor(y0) === Math.floor(y1)) continue;
    countCrossings(world, codes.r, codes.d, x0, y0, x1, y1);
  }
}

/** The id of the edge barrier between 4-adjacent cells a and b (world.edges is sorted by edgeKey), or −1. */
function edgeIdBetween(world: World, a: number, b: number): number {
  let cell: number;
  let dir: 'R' | 'D';
  if (b === a + 1) {
    cell = a;
    dir = 'R';
  } else if (a === b + 1) {
    cell = b;
    dir = 'R';
  } else if (b === a + GRID_W) {
    cell = a;
    dir = 'D';
  } else {
    cell = b;
    dir = 'D';
  }
  const key = edgeKey(cell, dir);
  const edges = world.edges;
  let lo = 0;
  let hi = edges.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const e = edges[mid]!;
    if (edgeKey(e.cell, e.dir) < key) lo = mid + 1;
    else hi = mid;
  }
  const e = edges[lo];
  return e !== undefined && e.cell === cell && e.dir === dir ? e.id : -1;
}

function codeBetween(r: Uint8Array, d: Uint8Array, a: number, b: number): number {
  if (b === a + 1) return r[a]!;
  if (a === b + 1) return r[b]!;
  if (b === a + GRID_W) return d[a]!;
  return d[b]!;
}

/**
 * Walk the straight segment (x0, y0) → (x1, y1) with movement.ts traceFraction's grid DDA (the Y step
 * first at an exact corner) and add one crossing to every barrier edge crossed.
 */
function countCrossings(world: World, r: Uint8Array, d: Uint8Array, x0: number, y0: number, x1: number, y1: number): void {
  let cx = Math.floor(x0);
  let cy = Math.floor(y0);
  const ex = Math.floor(x1);
  const ey = Math.floor(y1);
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (dx === 0 && dy === 0) return;
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
      cy += stepY;
      tMaxY += tDeltaY;
    }
    if (t > 1 || !inBounds(cx, cy)) return;
    const a = py * GRID_W + px;
    const b = cy * GRID_W + cx;
    if (codeBetween(r, d, a, b) !== EDGE_NONE) {
      const id = edgeIdBetween(world, a, b);
      if (id >= 0) tallyOf(world, id).organisms += 1;
    }
    if (cx === ex && cy === ey) return;
  }
}
