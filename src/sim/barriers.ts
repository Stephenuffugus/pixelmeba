/**
 * Edge barriers (SPEC §2.4–§2.5, §4.9; CT §4, §5.3, §14; Phase 5 foundation, world schema 5; D-0102,
 * D-0106). PURE: the store's types, the CT §5.3 permission table, the transport class of an organism
 * and the import validator. No stage reads them yet; the transport, movement and placement stages of
 * later waves import this module. Nothing here draws randomness or reads any stage 2–12 module.
 *
 * An edge barrier sits on the edge between two 4-adjacent cells. It is stored on its lower cell: 'R'
 * is the edge between (x, y) and (x + 1, y), 'D' the edge between (x, y) and (x, y + 1). The left and
 * up edges of a cell are its neighbours' R and D edges, so two codes per cell describe every edge
 * (ARCH §5's "4 per cell" halved; each edge is stored once). world.edges is sorted by edgeKey with at
 * most one barrier per edge (CT §4 "two barriers per edge invalid").
 */
import { CELL_COUNT, EDGE_BARRIER_CAP, GRID_W } from './constants';
import type { Species } from './content/schema';
import { FLAG, LIFE_ACTIVE } from './entities';
import type { BarrierClass } from './fields';
import { cellX, cellY, inBounds, inMask, ST_NONE, SUB_WATER, type Grid } from './grid';
import type { World } from './world';

export const EDGE_KINDS = ['S01', 'S02', 'S03', 'S04'] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];
export type EdgeDir = 'R' | 'D';

export interface EdgeBarrier {
  /** One id space with devices (world.counters.nextDeviceId), so a gate tally names one structure. */
  readonly id: number;
  readonly kind: EdgeKind;
  /** The lower cell of the edge (the left cell for 'R', the upper cell for 'D'). */
  readonly cell: number;
  readonly dir: EdgeDir;
  /**
   * S03 only (required there): true = open (no barrier), false = closed (blocks everything). A writer that
   * changes it in place must bump grid.geometryVersion: edgePassage.ts caches per-cell edge codes on that
   * version and the store's identity and length (climate.ts's warmth coefficients compare the closed
   * shutters' content instead).
   */
  open?: boolean;
  /** S04 only (required there): +1 = from `cell` to its neighbour, −1 = from the neighbour to `cell`. */
  flow?: 1 | -1;
  /** S04 only (optional): the first tick the channel may move its next Small organism; absent = now. */
  nextOrganismTick?: number;
}

/** The canonical sort key of an edge: two per cell (R, then D). */
export function edgeKey(cell: number, dir: EdgeDir): number {
  return cell * 2 + (dir === 'D' ? 1 : 0);
}

/** The other cell of an edge, or −1 when it lies off the grid. */
export function edgeNeighbour(cell: number, dir: EdgeDir): number {
  const x = cellX(cell);
  const y = cellY(cell);
  const nx = dir === 'R' ? x + 1 : x;
  const ny = dir === 'D' ? y + 1 : y;
  return inBounds(nx, ny) ? ny * GRID_W + nx : -1;
}

/** A sorted copy (by edgeKey). */
export function sortEdges(edges: readonly EdgeBarrier[]): EdgeBarrier[] {
  return [...edges].sort((a, b) => edgeKey(a.cell, a.dir) - edgeKey(b.cell, b.dir));
}

// ---- The CT §5.3 table -------------------------------------------------------------------------------

/** Every transport class: the three field classes and the four organism classes (CT §5.3 rows). */
export type TransportClass = 'dissolved' | 'activity' | 'viral' | 'small' | 'medium' | 'large' | 'fixed';
export type OrganismClass = 'small' | 'medium' | 'large' | 'fixed';

/** Edge codes (Uint8, one per cell and direction in edgeCodeArrays). */
export const EDGE_NONE = 0;
export const EDGE_S01 = 1;
export const EDGE_S02 = 2;
export const EDGE_SHUTTER_CLOSED = 3;
export const EDGE_SHUTTER_OPEN = 4;
export const EDGE_CHANNEL = 5;

export function edgeCodeOf(edge: Pick<EdgeBarrier, 'kind' | 'open'>): number {
  switch (edge.kind) {
    case 'S01':
      return EDGE_S01;
    case 'S02':
      return EDGE_S02;
    case 'S03':
      return edge.open === true ? EDGE_SHUTTER_OPEN : EDGE_SHUTTER_CLOSED;
    case 'S04':
      return EDGE_CHANNEL;
  }
}

/**
 * The factor ordinary diffusion of a field of barrier class `cls` gets across an edge with `code`
 * (CT §5.3). No barrier and an open shutter pass everything (1). S01: dissolved and activity 25 %,
 * viral blocked. S02: dissolved, activity and viral 50 %. A closed shutter blocks everything. The S04
 * channel is closed to ordinary diffusion: only its directed transfer crosses it (D-0106). Deposits
 * (class 'none') never diffuse, and cross no barrier.
 */
export function edgeFactor(code: number, cls: BarrierClass): number {
  if (code === EDGE_NONE || code === EDGE_SHUTTER_OPEN) return 1;
  if (cls === 'none') return 0;
  if (code === EDGE_S01) return cls === 'viral' ? 0 : 0.25;
  if (code === EDGE_S02) return 0.5;
  return 0; // closed shutter, channel
}

/**
 * Whether something of class `cls` may cross an edge with `code` (CT §5.3). Organisms: no barrier and an
 * open shutter pass every class; S02 passes Small only; S01, a closed shutter and the channel's ordinary
 * crossing block every organism (the channel moves Small organisms only by its own transfer, D-0106).
 * Fixed never crosses a barrier. For a field class this is "its diffusion factor is above 0".
 */
export function edgePermits(code: number, cls: TransportClass): boolean {
  if (cls === 'dissolved' || cls === 'activity' || cls === 'viral') return edgeFactor(code, cls) > 0;
  if (code === EDGE_NONE || code === EDGE_SHUTTER_OPEN) return true;
  if (code === EDGE_S02) return cls === 'small';
  return false;
}

/**
 * The transport class of the living organism in `slot` (CT §5.3), in this order:
 *  (a) a parasite attached to a host (hostSlot ≥ 0) moves as one unit in its host's class (SPEC §4.9);
 *  (b) an attached organism (FLAG.attached) is Fixed;
 *  (c) an F04 daughter that began Resting at birth (FLAG.restNewborn) is Small while not Active (D-0106);
 *  (d) any other fungus, and any organism of a species that lives attached (record attachment ≠ null:
 *      B02, B13, P06), is Fixed whatever FLAG.attached says: births never copy the flag to a daughter,
 *      so a born colony member or Bellstalk lacks it (D-0114, D-0115). CT §5.3's "B02 disperser" (Small)
 *      and "P06 (free)" (Medium) are states no Phase 5 rule produces;
 *  (e) otherwise the species record's transportClass.
 * An E04-anchored organism keeps its class (anchor.ts: FLAG.attached is never set for it).
 */
export function classOf(world: Pick<World, 'ents' | 'content'>, slot: number): OrganismClass | 'viral' {
  const c = world.ents.cols;
  const host = c.hostSlot[slot]!;
  if (host >= 0 && host !== slot && c.hostSlot[host]! < 0) return ownClass(world, host);
  return ownClass(world, slot);
}

function ownClass(world: Pick<World, 'ents' | 'content'>, slot: number): OrganismClass | 'viral' {
  const c = world.ents.cols;
  const flags = c.flags[slot]!;
  if ((flags & FLAG.attached) !== 0) return 'fixed';
  const sp = world.content.species[c.species[slot]!]!;
  if ((flags & FLAG.restNewborn) !== 0 && c.lifeState[slot] !== LIFE_ACTIVE) return 'small';
  return freeClassOfSpecies(sp);
}

/**
 * The class an organism of species record `def` has when no flag decides it (classOf's rules (d)–(e),
 * the one place they live): a fungus or a species that lives attached is Fixed; otherwise the record's
 * transportClass. The S05 shelter rule (edgePassage.ts shelterRefuses) reads it per species.
 */
export function freeClassOfSpecies(def: Pick<Species, 'category' | 'transportClass' | 'attachment'>): OrganismClass | 'viral' {
  if (def.category === 'fungus' || def.attachment !== null) return 'fixed';
  return def.transportClass;
}

// ---- Edge code arrays --------------------------------------------------------------------------------

export interface EdgeCodeArrays {
  /** Code of each cell's R edge (to x + 1). */
  readonly r: Uint8Array;
  /** Code of each cell's D edge (to y + 1). */
  readonly d: Uint8Array;
}

/** Per-cell edge codes from a store (EDGE_NONE where no barrier sits). */
export function edgeCodeArrays(edges: readonly EdgeBarrier[]): EdgeCodeArrays {
  const r = new Uint8Array(CELL_COUNT);
  const d = new Uint8Array(CELL_COUNT);
  for (const e of edges) (e.dir === 'R' ? r : d)[e.cell] = edgeCodeOf(e);
  return { r, d };
}

/** The code of the edge between 4-adjacent cells a and b (symmetric). Throws for cells that are not 4-adjacent. */
export function edgeCodeBetween(arrays: EdgeCodeArrays, a: number, b: number): number {
  const ax = cellX(a);
  const ay = cellY(a);
  const bx = cellX(b);
  const by = cellY(b);
  if (ay === by && bx === ax + 1) return arrays.r[a]!;
  if (ay === by && ax === bx + 1) return arrays.r[b]!;
  if (ax === bx && by === ay + 1) return arrays.d[a]!;
  if (ax === bx && ay === by + 1) return arrays.d[b]!;
  throw new Error(`edgeCodeBetween(): cells ${a} and ${b} are not 4-adjacent`);
}

// ---- Import validation -------------------------------------------------------------------------------

const EDGE_KEYS = ['id', 'kind', 'cell', 'dir', 'open', 'flow', 'nextOrganismTick'];

/** A cell index inside the grid and the dish's circle. */
export function cellInDish(cell: unknown): cell is number {
  return Number.isInteger(cell) && (cell as number) >= 0 && (cell as number) < CELL_COUNT && inMask(cellX(cell as number), cellY(cell as number));
}

/**
 * The first problem with an edge-barrier store (untrusted) on a dish's grid, as a player-facing
 * sentence, or null. `enabledStructures` is the dish's recorded list.
 */
export function edgeStoreProblem(edges: unknown, grid: Pick<Grid, 'substrate' | 'structure'>, opts: { readonly enabledStructures: readonly string[] }): string | null {
  if (!Array.isArray(edges)) return 'The edge barriers are not a list.';
  if (edges.length > EDGE_BARRIER_CAP) return `The dish has more than ${EDGE_BARRIER_CAP} edge barriers.`;
  let lastKey = -1;
  for (const raw of edges as unknown[]) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'An edge barrier is not a record.';
    const e = raw as Record<string, unknown>;
    for (const k of Object.keys(e)) if (!EDGE_KEYS.includes(k)) return `An edge barrier has an unknown setting "${k}".`;
    if (!Number.isInteger(e.id) || (e.id as number) < 1) return 'An edge barrier has an invalid identity.';
    if (typeof e.kind !== 'string' || !(EDGE_KINDS as readonly string[]).includes(e.kind)) return `An edge barrier is of an unknown kind ${JSON.stringify(e.kind)}.`;
    if (!opts.enabledStructures.includes(e.kind)) return `An edge barrier is of kind ${e.kind}, which this dish's rules do not include.`;
    if (e.dir !== 'R' && e.dir !== 'D') return 'An edge barrier has an invalid direction.';
    const cell = e.cell;
    if (!cellInDish(cell)) return 'An edge barrier lies outside the dish.';
    const other = edgeNeighbour(cell, e.dir);
    if (other < 0 || !cellInDish(other)) return 'An edge barrier lies on the rim of the dish.';
    const key = edgeKey(cell, e.dir);
    if (key === lastKey) return 'Two edge barriers share one edge.';
    if (key < lastKey) return 'The edge barriers are out of order.';
    lastKey = key;
    if (e.kind === 'S03') {
      if (typeof e.open !== 'boolean') return 'A shutter gate is neither open nor closed.';
    } else if (e.open !== undefined) return `An edge barrier of kind ${e.kind} has a shutter setting.`;
    if (e.kind === 'S04') {
      if (e.flow !== 1 && e.flow !== -1) return 'A one-way channel has no direction.';
      for (const side of [cell, other]) {
        if (grid.substrate[side] !== SUB_WATER || grid.structure[side] !== ST_NONE) return 'A one-way channel does not join two open water cells.';
      }
      if (e.nextOrganismTick !== undefined && (!Number.isInteger(e.nextOrganismTick) || (e.nextOrganismTick as number) < 0))
        return 'A one-way channel has an invalid organism wait.';
    } else {
      if (e.flow !== undefined) return `An edge barrier of kind ${e.kind} has a channel direction.`;
      if (e.nextOrganismTick !== undefined) return `An edge barrier of kind ${e.kind} has a channel organism wait.`;
    }
  }
  return null;
}
