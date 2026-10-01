/**
 * Fungal branching (SPEC §2.5, §6.9, §7.2; CT §1 F01, §14; ARCH §10.1; D-0043; P3.3).
 *
 * Fungal segments are ordinary organisms of category fungus (F01–F04). They are attached (gel,
 * sediment, bead; mesh in Phase 5: src/sim/attachment.ts) and never move. Division places the new
 * segment on a four-neighbour cell and joins parent and daughter with a fungal link:
 *
 * - Candidates (proposed decision, superseding D-0002 / SPEC §6.9 step 2 for fungi only): the cells
 *   E, S, W, N of the parent's cell that the species can occupy (habitat and attachment surface),
 *   that stay within soft capacity with the daughter, and that hold no fungal segment (of any fungal
 *   species, including daughters placed earlier in this stage). Never the parent's own cell (the
 *   retained segment stays there), never a diagonal: ARCH §10.1's 16 connection-mask tiles and SPEC
 *   §7.7 "links … on four-neighbor cells" define a four-neighbour topology.
 * - Rank: usable food descending (the sum of the species' listed food pools in the cell, plus edible
 *   film for a film digester in a film world), then suitability descending (for the daughter's own
 *   genome), then the fixed order E, S, W, N. No randomness.
 * - No candidate: the proposal is kept, nothing is charged, DIV_BLOCK_PLACEMENT (births.ts).
 * - After the commit: one link parent–daughter, LINK_VISUAL for F01 (carries nothing);
 *   LINK_TRANSPORT for a species with TRANSPORT_LINKS (F02, whose transport pass lands in wave 3).
 *
 * Capacity: segments count against AGENT_CAP (6,000) and FUNGAL_CAP (2,000). At 2,000 living fungal
 * segments, fungal births get DIV_BLOCK_CAPACITY with the capacity flag and fungal introductions are
 * refused (counted as rejected by the inoculate command). Nothing is killed. The count is taken from
 * the living slots each time (ascending slot order), so nothing is saved.
 *
 * Gate: every rule here concerns only organisms of a fungus species, so a world without one (every g2
 * world) never reaches it.
 */
import { CELL_COUNT, CELL_SOFT_CAPACITY, FUNGAL_CAP } from './constants';
import { edibleFilmAt } from './film';
import { cellIndex, inBounds, inMask } from './grid';
import { fungalNeighbors, LINK_TRANSPORT, LINK_VISUAL, type FungalLinkKind } from './links';
import { canOccupy } from './movement';
import { profileOfGenome } from './profiles';
import type { SpeciesRT } from './species';
import { entityCell } from './spatial';
import { suitabilityAt } from './suitability';
import type { World } from './world';

/** Four-neighbour placement order: E, S, W, N. */
export const FUNGAL_NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** Whether any species of this world is a fungus (cheap gate for the per-stage work). */
export function worldHasFungi(world: World): boolean {
  for (let k = 0; k < world.species.length; k++) if (world.species[k]!.fungal) return true;
  return false;
}

/** Living fungal segments, counted from the living slots. */
export function fungalSegmentCount(world: World): number {
  const c = world.ents.cols;
  let n = 0;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] === 1 && world.species[c.species[i]!]!.fungal) n++;
  }
  return n;
}

/** Whether introducing one organism of species `spIdx` must be refused for the fungal subcap (SPEC §2.5). */
export function fungalIntroductionRefused(world: World, spIdx: number): boolean {
  if (!world.species[spIdx]!.fungal) return false;
  return fungalSegmentCount(world) >= FUNGAL_CAP;
}

/** Link kind joining a parent segment and its daughter. */
export function branchLinkKind(sp: SpeciesRT): FungalLinkKind {
  return sp.abilities.includes('TRANSPORT_LINKS') ? LINK_TRANSPORT : LINK_VISUAL;
}

const occupied = new Uint8Array(CELL_COUNT);

/**
 * Per-stage fungal state for births: the cells holding a fungal segment and the live segment count.
 * Null when the world has no fungus species (nothing to do).
 */
export interface FungalBirthState {
  /** 1 where a living fungal segment sits (daughters placed this stage included). */
  readonly occupied: Uint8Array;
  count: number;
}

/** Build the per-stage state from the living slots (positions as they are at the start of stage 9). */
export function beginFungalBirths(world: World): FungalBirthState | null {
  if (!worldHasFungi(world)) return null;
  occupied.fill(0);
  const c = world.ents.cols;
  let count = 0;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1 || !world.species[c.species[i]!]!.fungal) continue;
    occupied[entityCell(c.x[i]!, c.y[i]!)] = 1;
    count++;
  }
  return { occupied, count };
}

/** Usable food for a fungal daughter in `cell`: the species' listed food pools present, plus edible film. */
export function usableFood(world: World, sp: SpeciesRT, cell: number): number {
  let sum = 0;
  for (let k = 0; k < sp.foods.length; k++) {
    const f = world.fields[sp.foods[k]!];
    if (f !== undefined) sum += f[cell]!;
  }
  return sum + edibleFilmAt(world, sp, cell);
}

/**
 * The cell for the new segment of fungal parent `i` (daughter genome `daughterGenome`, load
 * `daughterLoad` in biomass-equivalents), or −1 when no four-neighbour cell qualifies.
 */
export function fungalPlacement(
  world: World,
  i: number,
  daughterGenome: number,
  daughterLoad: number,
  state: FungalBirthState,
): number {
  const c = world.ents.cols;
  const spIdx = c.species[i]!;
  const sp = world.species[spIdx]!;
  const prof = profileOfGenome(world, daughterGenome, spIdx);
  const cx = Math.floor(c.x[i]!);
  const cy = Math.floor(c.y[i]!);
  const load = world.derived.cellLoad;
  let best = -1;
  let bestFood = -Infinity;
  let bestSuit = -Infinity;
  for (let k = 0; k < FUNGAL_NEIGHBORS.length; k++) {
    const [dx, dy] = FUNGAL_NEIGHBORS[k]!;
    const x = cx + dx;
    const y = cy + dy;
    if (!inBounds(x, y) || !inMask(x, y)) continue;
    const cell = cellIndex(x, y);
    if (state.occupied[cell] === 1) continue;
    if (!canOccupy(world, sp, cell)) continue;
    if (load[cell]! + daughterLoad > CELL_SOFT_CAPACITY) continue;
    const food = usableFood(world, sp, cell);
    const suit = suitabilityAt(world, sp, prof, cell).value;
    if (food > bestFood || (food === bestFood && suit > bestSuit)) {
      best = cell;
      bestFood = food;
      bestSuit = suit;
    }
  }
  return best;
}

/** Network summary for the inspector (W2-08): segments and separate threads are reported separately. */
export interface FungalNetwork {
  /** Living segments of this species. */
  readonly segments: number;
  /** Connected components (threads) among them. */
  readonly threads: number;
  /** Segments in the thread of the inspected segment. */
  readonly thisThread: number;
}

/** The network of fungal segment `i`'s species, or null for a non-fungal organism. */
export function fungalNetwork(world: World, i: number): FungalNetwork | null {
  const c = world.ents.cols;
  if (c.alive[i] !== 1) return null;
  const spIdx = c.species[i]!;
  if (!world.species[spIdx]!.fungal) return null;
  const seen = new Uint8Array(world.ents.highWater);
  let segments = 0;
  let threads = 0;
  let thisThread = 0;
  for (let s = 0; s < world.ents.highWater; s++) {
    if (c.alive[s] !== 1 || c.species[s] !== spIdx) continue;
    segments++;
    if (seen[s] === 1) continue;
    threads++;
    // Breadth-first over valid fungal links, one shared visited array (linear in segments + links).
    const queue = [s];
    seen[s] = 1;
    let hasI = false;
    for (let q = 0; q < queue.length; q++) {
      const m = queue[q]!;
      if (m === i) hasI = true;
      const next = fungalNeighbors(world, m);
      for (let k = 0; k < next.length; k++) {
        const p = next[k]!;
        if (seen[p] === 1) continue;
        seen[p] = 1;
        queue.push(p);
      }
    }
    if (hasI) thisThread = queue.length;
  }
  return { segments, threads, thisThread };
}
