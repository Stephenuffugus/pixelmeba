/**
 * The S04 one-way channel (Phase 5 wave 10 barrier-transport; SPEC §3.2 stage 2, §4.9; CT §4, §12.2;
 * D-0106, D-0117). Stage 2, right after the diffusion loop and before gas exchange.
 *
 * The channel edge is closed to ordinary diffusion and movement (D-0106: transport.ts gives it factor 0
 * and edgePermits refuses every organism); only this directed transfer crosses it.
 *
 * Pools: per second, 2 % of every eligible pool of the source cell (every field of barrier class
 * 'dissolved' or 'viral' that diffuses: never activity fields, deposits, film or food objects) is
 * requested into the destination (× dt). Every request is read from ONE snapshot taken before anything
 * moves, requests are summed per (source cell, field) and scaled down when the sum would exceed the
 * snapshot, then every move is applied. Every pool moves the same fraction, so companions keep their
 * ratio, and what a cell received this tick is not in the snapshot (no multi-hop). An internal move: no
 * ledger line.
 *
 * Organisms: one per channel per second (edge.nextOrganismTick, saved and hashed; a stage write, never a
 * geometry write). Eligible: living, in the source cell, classOf 'small', free (not attached, not a host
 * or a parasite on a host, no fungal or adhesion link, not E04-anchored, not held), in any life state. The
 * lowest birthId goes first. The destination must pass canOccupy, except that a resting newborn needs only
 * its habitat there (attachment is part of waking, D-0106). The organism moves by exactly the integer cell
 * offset and nothing else about it changes ("exact state retained, no extra actions").
 *
 * Gate (D-0103): returns at once without edges or when the world does not record 'barriers'.
 * Deterministic: world.edges order, ascending slots; no randomness.
 */
import { AGENT_CAP, CELL_COUNT, CHANNEL_ORGANISM_TICKS, CHANNEL_POOL_FRACTION_PER_SECOND, DT, GRID_W } from './constants';
import { classOf, edgeNeighbour, type EdgeBarrier } from './barriers';
import { FLAG, LIFE_ACTIVE } from './entities';
import { FIELD_DEFS, FIELD_IDS, type FieldId } from './fields';
import { addFieldTally, tallyOf } from './gateTally';
import { worldHasSystem } from './gates';
import { ST_BEAD, ST_NONE } from './grid';
import { subtractPool } from './ledger';
import { adhesionDegree, fungalDegree } from './links';
import { canOccupy } from './movement';
import { entityCell, rebuildIndex } from './spatial';
import { habitatBit } from './species';
import { isFieldActive, markField } from './transport';
import type { World } from './world';

/** Share of each eligible pool requested per tick (CT §12.2 2 %/s × dt). */
const POOL_FRACTION_PER_TICK = CHANNEL_POOL_FRACTION_PER_SECOND * DT;

/** The pools a channel moves (SPEC §4.9 "every eligible dissolved/viral pool"), in canonical field order. */
export const CHANNEL_FIELDS: readonly FieldId[] = FIELD_IDS.filter((id) => {
  const d = FIELD_DEFS[id];
  return (d.barrier === 'dissolved' || d.barrier === 'viral') && d.diffusion !== 'none';
});

function ledgerMaterial(id: FieldId): 'c' | 'n' | 'm' | null {
  const d = FIELD_DEFS[id];
  if (d.carbonPerUnit !== undefined) return null; // viral units: never below 0 here (see applyPools)
  return d.material === 'carbon' ? 'c' : d.material === 'nutrient' ? 'n' : d.material === 'mineral' ? 'm' : null;
}

// Scratch (allocated once; never saved): per-channel source/destination, snapshot and requests.
let chSrc = new Int32Array(16);
let chDst = new Int32Array(16);
let chEdge = new Int32Array(16);
let snap = new Float64Array(16 * CHANNEL_FIELDS.length);
/** First channel (index into chSrc) with this source cell, −1 when none; reset after every use. */
const groupHead = new Int32Array(CELL_COUNT).fill(-1);
let groupNext = new Int32Array(16);
/** Organism candidates per source cell: first slot, and next slot in the chain. */
const candHead = new Int32Array(CELL_COUNT).fill(-1);
const candNext = new Int32Array(AGENT_CAP);

function ensureCapacity(n: number): void {
  if (chSrc.length >= n) return;
  let cap = chSrc.length;
  while (cap < n) cap *= 2;
  chSrc = new Int32Array(cap);
  chDst = new Int32Array(cap);
  chEdge = new Int32Array(cap);
  groupNext = new Int32Array(cap);
  snap = new Float64Array(cap * CHANNEL_FIELDS.length);
}

/** Stage 2: every S04 channel's pool transfers, then its organism transfer. */
export function channelStep(world: World): void {
  const edges = world.edges;
  if (edges.length === 0 || !worldHasSystem(world, 'barriers')) return;
  let n = 0;
  for (let k = 0; k < edges.length; k++) if (edges[k]!.kind === 'S04') n++;
  if (n === 0) return;
  ensureCapacity(n);
  n = 0;
  for (let k = 0; k < edges.length; k++) {
    const e = edges[k]!;
    if (e.kind !== 'S04') continue;
    const other = edgeNeighbour(e.cell, e.dir);
    if (other < 0) continue;
    chEdge[n] = k;
    chSrc[n] = e.flow === -1 ? other : e.cell;
    chDst[n] = e.flow === -1 ? e.cell : other;
    n++;
  }
  applyPools(world, n);
  moveOrganisms(world, n);
}

function applyPools(world: World, n: number): void {
  const nf = CHANNEL_FIELDS.length;
  // Group channels by source cell (a cell has at most four edges, so at most four channels share one).
  for (let c = n - 1; c >= 0; c--) {
    const s = chSrc[c]!;
    groupNext[c] = groupHead[s]!;
    groupHead[s] = c;
  }
  // One snapshot of every source amount, before anything moves.
  for (let f = 0; f < nf; f++) {
    const id = CHANNEL_FIELDS[f]!;
    const arr = world.fields[id];
    const live = arr !== undefined && isFieldActive(world, id);
    for (let c = 0; c < n; c++) snap[c * nf + f] = live ? arr[chSrc[c]!]! : 0;
  }
  // Apply: each channel's request, scaled per (source cell, field) when the requests sum above the snapshot.
  for (let f = 0; f < nf; f++) {
    const id = CHANNEL_FIELDS[f]!;
    const arr = world.fields[id];
    if (arr === undefined || !isFieldActive(world, id)) continue;
    const mat = ledgerMaterial(id);
    let any = false;
    for (let c = 0; c < n; c++) {
      const a = snap[c * nf + f]!;
      if (a <= 0) continue;
      const req = a * POOL_FRACTION_PER_TICK;
      let sum = 0;
      for (let g = groupHead[chSrc[c]!]!; g >= 0; g = groupNext[g]!) sum += snap[g * nf + f]! * POOL_FRACTION_PER_TICK;
      const moved = sum > a ? req * (a / sum) : req;
      if (moved <= 0) continue;
      const src = chSrc[c]!;
      if (mat !== null) subtractPool(world, arr, src, moved, mat);
      else {
        // Never below 0: a source loses at most 4 × 2 % × dt of its snapshot and holds at least that much.
        const v = arr[src]! - moved;
        arr[src] = v > 0 ? v : 0;
      }
      arr[chDst[c]!]! += moved;
      addFieldTally(world, world.edges[chEdge[c]!]!.id, id, moved);
      any = true;
    }
    if (any) markField(world, id);
  }
  for (let c = 0; c < n; c++) groupHead[chSrc[c]!] = -1;
}

/** Whether the living organism in `slot` may ride a channel: Small and free (module doc). */
function eligible(world: World, slot: number): boolean {
  const c = world.ents.cols;
  if ((c.flags[slot]! & FLAG.attached) !== 0) return false;
  if (c.hostSlot[slot]! >= 0 || c.parasiteSlot[slot]! >= 0) return false;
  if (c.heldBySlot[slot]! >= 0 || c.anchorState[slot]! !== 0) return false;
  if (classOf(world, slot) !== 'small') return false;
  return fungalDegree(world, slot) === 0 && adhesionDegree(world, slot) === 0;
}

function restingNewborn(world: World, slot: number): boolean {
  const c = world.ents.cols;
  return (c.flags[slot]! & FLAG.restNewborn) !== 0 && c.lifeState[slot] !== LIFE_ACTIVE;
}

/** Whether `slot` may be put down in `dest`: canOccupy, or only its habitat for a resting newborn. */
function destinationAccepts(world: World, slot: number, dest: number): boolean {
  const sp = world.species[world.ents.cols.species[slot]!]!;
  if (!restingNewborn(world, slot)) return canOccupy(world, sp, dest);
  const st = world.grid.structure[dest]!;
  if (st !== ST_NONE && !(st === ST_BEAD && sp.attached)) return false;
  return (sp.habitatMask & habitatBit(world.grid.substrate[dest]!)) !== 0;
}

function moveOrganisms(world: World, n: number): void {
  const edges = world.edges;
  let ready = 0;
  for (let c = 0; c < n; c++) {
    const e = edges[chEdge[c]!]!;
    if (world.tick >= (e.nextOrganismTick ?? 0)) {
      if (candHead[chSrc[c]!] === -1) candHead[chSrc[c]!] = -2; // mark the source cell as wanted
      ready++;
    }
  }
  if (ready === 0) return;
  // One pass over the slots (ascending): chain the living organisms of every wanted source cell.
  const cols = world.ents.cols;
  const hw = world.ents.highWater;
  for (let i = hw - 1; i >= 0; i--) {
    if (cols.alive[i] !== 1) continue;
    const cell = entityCell(cols.x[i]!, cols.y[i]!);
    const h = candHead[cell]!;
    if (h === -1) continue;
    candNext[i] = h < 0 ? -1 : h;
    candHead[cell] = i;
  }
  let movedAny = false;
  for (let c = 0; c < n; c++) {
    const e: EdgeBarrier = edges[chEdge[c]!]!;
    if (world.tick < (e.nextOrganismTick ?? 0)) continue;
    const src = chSrc[c]!;
    const dst = chDst[c]!;
    let best = -1;
    for (let s = candHead[src]!; s >= 0; s = candNext[s]!) {
      // An organism another channel already moved this tick is no longer in the source cell.
      if (entityCell(cols.x[s]!, cols.y[s]!) !== src) continue;
      if (best >= 0 && cols.birthId[s]! >= cols.birthId[best]!) continue;
      if (!eligible(world, s) || !destinationAccepts(world, s, dst)) continue;
      best = s;
    }
    if (best < 0) continue;
    const dx = (dst % GRID_W) - (src % GRID_W);
    const dy = Math.floor(dst / GRID_W) - Math.floor(src / GRID_W);
    cols.x[best] = shifted(cols.x[best]!, dx);
    cols.y[best] = shifted(cols.y[best]!, dy);
    e.nextOrganismTick = world.tick + CHANNEL_ORGANISM_TICKS;
    tallyOf(world, e.id).organisms += 1;
    movedAny = true;
  }
  for (let c = 0; c < n; c++) candHead[chSrc[c]!] = -1;
  if (movedAny) rebuildIndex(world);
}

/**
 * v + d for an integer offset d ∈ {−1, 0, 1}, landing in cell floor(v) + d. Within one binade the sum is
 * exact (the in-cell position is kept bit for bit); only a position within one ulp below a power of two
 * could round up into the next cell, and then it is put at the largest value below that cell's end.
 */
function shifted(v: number, d: number): number {
  if (d === 0) return v;
  const target = Math.floor(v) + d;
  const nv = v + d;
  if (Math.floor(nv) === target) return nv;
  return target + 1 - (target + 1) * Number.EPSILON;
}
