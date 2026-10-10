/**
 * Finite food objects (SPEC §2.4, §2.5, §3.4, §5.1; CT §5.2, §14; world schema 4; P3.6).
 *
 * `world.objects` holds each object's explicit inventory, ordered by id (creation order). Objects are
 * a ledgered compartment (src/sim/ledger.ts computeTotals counts their carbon and nutrient), so a move
 * between a cell and an object is balanced; creating one from nothing is an external input that the
 * CALLER records (createObject never touches the ledger; placeFoodObject records it).
 *
 * P3.6: placeFoodObject (the 'placeObject' command: M10 Slow feeder pellet, M11 Leaf wafer) and
 * releaseFoodObjects (stage 3, before enzymes: each object lets its inventory out into its own cell at
 * the CT §5.2 rates; the last transfer moves the exact remainder; an emptied object leaves the store
 * and emits 'objectEmptied' once). Objects never move, never diffuse and are never eaten directly.
 * A world without objects runs exactly as before (both functions do nothing).
 *
 * The cap (128) is shared with E17 caches (Phase 7, CT §14); a later schema step adds 'cache' to the
 * kind union, which stays a validated union (FOOD_OBJECT_KINDS).
 */
import { CELL_COUNT, DT, GRID_H, GRID_W } from './constants';
import { emit, milestone } from './events';
import type { FieldId } from './fields';
import { worldHasSystem } from './gates';
import { maskCells, NOT_IN_DISH, ST_NONE, ST_OUTSIDE } from './grid';
import { recordInput } from './ledger';
import { markField } from './transport';
import type { World } from './world';

export const FOOD_OBJECT_CAP = 128;
export const FOOD_OBJECT_KINDS = ['pellet', 'wafer'] as const;
export type FoodObjectKind = (typeof FOOD_OBJECT_KINDS)[number];
/** Carbon pools an object may hold (C); its bound nutrient is `n`. */
export const FOOD_OBJECT_POOLS = ['sugar', 'starch', 'protein'] as const;
export type FoodObjectPool = (typeof FOOD_OBJECT_POOLS)[number];

export interface FoodObject {
  /** From world.counters.nextObjectId (never reused). */
  readonly id: number;
  readonly cell: number;
  readonly kind: FoodObjectKind;
  /** Remaining carbon per pool (C). */
  pools: { sugar?: number; starch?: number; protein?: number };
  /** Remaining bound nutrient (N). */
  n: number;
}

export function isFoodObjectKind(x: unknown): x is FoodObjectKind {
  return typeof x === 'string' && (FOOD_OBJECT_KINDS as readonly string[]).includes(x);
}

export type CreateObjectRefusal = 'cap' | 'occupied' | 'outside' | 'structure' | 'invalid';

export interface ObjectSpec {
  readonly cell: number;
  readonly kind: FoodObjectKind;
  readonly pools: FoodObject['pools'];
  readonly n: number;
}

/**
 * Add an object to the store. Refuses (and changes nothing) at the cap, on a cell that already holds
 * an object, outside the dish, on a structure, or for a malformed spec. The caller accounts for the
 * material (an external input, or the matching subtraction from a cell for a move).
 */
export function createObject(
  world: World,
  spec: ObjectSpec,
): { ok: true; object: FoodObject } | { ok: false; reason: CreateObjectRefusal } {
  if (world.objects.length >= FOOD_OBJECT_CAP) return { ok: false, reason: 'cap' };
  const candidate: FoodObject = {
    id: world.counters.nextObjectId,
    cell: spec.cell,
    kind: spec.kind,
    pools: { ...spec.pools },
    n: spec.n,
  };
  if (foodObjectProblem(candidate) !== null) return { ok: false, reason: 'invalid' };
  const st = world.grid.structure[spec.cell]!;
  if (st === ST_OUTSIDE) return { ok: false, reason: 'outside' };
  if (st !== ST_NONE) return { ok: false, reason: 'structure' };
  if (objectAt(world, spec.cell) !== null) return { ok: false, reason: 'occupied' };
  world.counters.nextObjectId++;
  world.objects.push(candidate);
  return { ok: true, object: candidate };
}

/** Remove the object with `id` (returning it), or null. The caller accounts for what it still holds. */
export function removeObject(world: World, id: number): FoodObject | null {
  const k = world.objects.findIndex((o) => o.id === id);
  if (k < 0) return null;
  return world.objects.splice(k, 1)[0]!;
}

export function objectAt(world: World, cell: number): FoodObject | null {
  return world.objects.find((o) => o.cell === cell) ?? null;
}

/** Carbon and nutrient held by these objects (pools in FOOD_OBJECT_POOLS order, objects in store order). */
export function objectTotals(objects: readonly FoodObject[]): { c: number; n: number } {
  let c = 0;
  let n = 0;
  for (const o of objects) {
    for (const p of FOOD_OBJECT_POOLS) c += o.pools[p] ?? 0;
    n += o.n;
  }
  return { c, n };
}

let maskFlags: Uint8Array | null = null;
/** 1 for each cell inside the dish (the fixed circular mask, independent of any saved grid). */
function inDish(cell: number): boolean {
  if (maskFlags === null) {
    const flags = new Uint8Array(CELL_COUNT);
    const cells = maskCells();
    for (let k = 0; k < cells.length; k++) flags[cells[k]!] = 1;
    maskFlags = flags;
  }
  return maskFlags[cell] === 1;
}

const finiteNonneg = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * What is wrong with one object record (untrusted, e.g. from a save or a held sample), or null: id,
 * cell, kind, nutrient, and pools that are finite, non-negative and the kind's own (FOOD_OBJECT_RULES).
 * Placement is checked separately.
 */
export function foodObjectProblem(o: unknown): string | null {
  if (typeof o !== 'object' || o === null) return 'not a record';
  const r = o as Record<string, unknown>;
  if (!Number.isInteger(r.id) || (r.id as number) < 1) return 'invalid id';
  if (!Number.isInteger(r.cell) || (r.cell as number) < 0 || (r.cell as number) >= CELL_COUNT)
    return 'invalid cell';
  if (!isFoodObjectKind(r.kind)) return `unknown kind ${String(r.kind)}`;
  if (!finiteNonneg(r.n)) return 'invalid nutrient';
  const pools = r.pools;
  if (typeof pools !== 'object' || pools === null || Array.isArray(pools)) return 'invalid pools';
  // Only the kind's own pools (FOOD_OBJECT_RULES): release reads nothing else, so a pellet holding
  // starch would leave the store with that carbon still inside once its sugar is gone.
  const own = FOOD_OBJECT_RULES[r.kind].pools;
  for (const k of Object.keys(pools)) {
    if (!(FOOD_OBJECT_POOLS as readonly string[]).includes(k)) return `unknown pool ${k}`;
    if (!own.some((p) => p.pool === k)) return `a ${r.kind} cannot hold ${k}`;
    if (!finiteNonneg((pools as Record<string, unknown>)[k])) return `invalid ${k} pool`;
  }
  return null;
}

/**
 * The first problem with a list of objects (untrusted, e.g. a save's), or null: the cap, each record,
 * unique ascending ids below `nextObjectId`, one object per cell, every object inside the dish (the
 * fixed mask) and not on a structure.
 */
export function foodObjectsProblem(
  objects: unknown,
  structure: ArrayLike<number>,
  nextObjectId: number,
): string | null {
  if (!Array.isArray(objects)) return 'the food objects are not a list';
  if (objects.length > FOOD_OBJECT_CAP) return `more than ${FOOD_OBJECT_CAP} food objects`;
  let lastId = 0;
  const cells: number[] = [];
  for (const o of objects as unknown[]) {
    const p = foodObjectProblem(o);
    if (p) return `a food object is invalid (${p})`;
    const r = o as FoodObject;
    if (r.id <= lastId || r.id >= nextObjectId) return 'food object ids are out of order';
    lastId = r.id;
    const st = structure[r.cell];
    if (st === ST_OUTSIDE || !inDish(r.cell)) return `a food object lies outside the dish (cell ${r.cell})`;
    if (st !== ST_NONE) return `a food object lies on a structure (cell ${r.cell})`;
    if (cells.includes(r.cell)) return `two food objects share cell ${r.cell}`;
    cells.push(r.cell);
  }
  return null;
}

// ------------------------------------------------------------------------------ P3.6 placement and release

/** One carbon pool of an object kind: its full inventory (C), release rate (C/s) and target fields. */
interface PoolRule {
  readonly pool: FoodObjectPool;
  readonly full: number;
  readonly perSecond: number;
  readonly field: FieldId;
  readonly fieldN: FieldId;
}

/** An object kind's inventory and release (CT §5.2: M10 pellet, M11 wafer). Pools in release order. */
export interface FoodObjectRule {
  readonly pools: readonly PoolRule[];
  /** Bound nutrient of a new object (N). */
  readonly n: number;
}

/**
 * CT §5.2 rows M10 / M11 (SPEC §5.1). Pellet: 10 sugar C + 1 N, 0.02 C/s with proportional N. Wafer:
 * 6 starch C + 4 protein C + 1 N, 0.012 starch and 0.008 protein C/s as deposits, each with 0.10 N
 * per C (the wafer's own ratio, 1 N / 10 C, so proportional release carries exactly that).
 */
export const FOOD_OBJECT_RULES: Readonly<Record<FoodObjectKind, FoodObjectRule>> = Object.freeze({
  pellet: { pools: [{ pool: 'sugar', full: 10, perSecond: 0.02, field: 'sugar', fieldN: 'sugarN' }], n: 1 },
  wafer: {
    pools: [
      { pool: 'starch', full: 6, perSecond: 0.012, field: 'starch', fieldN: 'starchN' },
      { pool: 'protein', full: 4, perSecond: 0.008, field: 'protein', fieldN: 'proteinN' },
    ],
    n: 1,
  },
});

/** The command's refusal notes (the Lab announces them in its own words; src/ui/strings/lab.ts). */
export const OBJECT_REFUSAL: Readonly<Record<CreateObjectRefusal | 'point' | 'missing', string>> = Object.freeze({
  cap: `The dish holds up to ${FOOD_OBJECT_CAP} food objects`,
  occupied: 'a food object is already in this cell',
  structure: 'a structure is in this cell',
  outside: 'outside the dish',
  invalid: 'invalid food object',
  point: 'invalid point',
  missing: `food objects are ${NOT_IN_DISH}`,
});

export interface PlaceObjectResult {
  readonly accepted: number;
  readonly rejected: number;
  readonly note?: string;
}

/**
 * The 'placeObject' command (stage 1; SPEC §5.1, §10.1): one object of material `materialId` (an
 * enabled 'object' material, in a world whose recorded manifest has the foodObjects system) in the
 * cell under (x, y). Refused, changing nothing, on a cell that already holds an object, on a
 * structure (stone, wall or bead), outside the dish, at the cap (128), or without the system or the
 * material. Live organisms never block an object. Accepted: its full inventory is an external input.
 */
export function placeFoodObject(world: World, materialId: string, x: number, y: number): PlaceObjectResult {
  const refuse = (note: string): PlaceObjectResult => ({ accepted: 0, rejected: 1, note });
  const mat = world.content.materials.find((m) => m.id === materialId);
  if (!worldHasSystem(world, 'foodObjects') || !mat || mat.kind !== 'object' || !isFoodObjectKind(mat.target))
    return refuse(OBJECT_REFUSAL.missing);
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return refuse(OBJECT_REFUSAL.point);
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return refuse(OBJECT_REFUSAL.outside);
  const rule = FOOD_OBJECT_RULES[mat.target];
  for (const p of rule.pools) if (!world.fields[p.field] || !world.fields[p.fieldN]) return refuse(OBJECT_REFUSAL.missing);
  const pools: FoodObject['pools'] = {};
  let c = 0;
  for (const p of rule.pools) {
    pools[p.pool] = p.full;
    c += p.full;
  }
  const made = createObject(world, { cell: Math.floor(y) * GRID_W + Math.floor(x), kind: mat.target, pools, n: rule.n });
  if (!made.ok) return refuse(OBJECT_REFUSAL[made.reason]);
  recordInput(world, `tool:${mat.id}`, c, rule.n);
  milestone(world.events, 'firstFoodObject', world.tick);
  return { accepted: 1, rejected: 0 };
}

/**
 * Stage 3, before enzymes (SPEC §3.2 row 3, §5.1): every object, in id order, releases into its own
 * cell (objectReleasePlan): per pool rate × dt, or the whole pool at the end (release never exceeds
 * inventory, and the last transfer moves the exact remainder); bound nutrient in proportion, and
 * exactly what is left on the emptying transfer. Internal moves (no ledger entry); the targets are
 * marked so transport and feeding see them, and stage 6 can eat them this same tick. An emptied
 * object leaves the store and emits 'objectEmptied' once.
 */
export function releaseFoodObjects(world: World): void {
  const objects = world.objects;
  if (objects.length === 0) return;
  let keep = 0;
  for (let k = 0; k < objects.length; k++) {
    const o = objects[k]!;
    if (!releaseOne(world, o)) objects[keep++] = o;
    else emit(world.events, world.counters, { tick: world.tick, type: 'objectEmptied', cell: o.cell, detail: { cell: o.cell, kind: o.kind, id: o.id } });
  }
  if (keep < objects.length) {
    objects.length = keep;
    milestone(world.events, 'firstObjectEmptied', world.tick);
  }
}

/**
 * A pool left with less than this after a full-rate transfer (C) is moved whole instead: floating-point
 * dust from repeated subtraction, never food (the wafer's starch would otherwise keep 3.8e-13 C for one
 * more tick). The transfer stays within the object's inventory; nothing is zeroed or logged as roundoff.
 */
export const OBJECT_DUST_C = 1e-9;

/** What one object releases this tick: carbon and nutrient per pool (FOOD_OBJECT_RULES order). */
export interface ObjectReleasePlan {
  readonly c: readonly number[];
  readonly n: readonly number[];
  /** True when this transfer moves everything the object holds (it then leaves the store). */
  readonly emptied: boolean;
}

/**
 * This tick's release of one object, without applying it (pure; releaseFoodObjects applies it, tests
 * read it). Per pool: rate × dt, or the whole pool when that is no more than the rate plus
 * OBJECT_DUST_C. Nutrient: n × released / remaining C, split by carbon, the last releasing pool taking
 * what the others left; the emptying transfer moves exactly the remaining n.
 */
export function objectReleasePlan(o: FoodObject): ObjectReleasePlan {
  const pools = FOOD_OBJECT_RULES[o.kind].pools;
  const c: number[] = [];
  let remainingC = 0;
  let released = 0;
  let all = true;
  for (let j = 0; j < pools.length; j++) {
    const have = o.pools[pools[j]!.pool] ?? 0;
    const r = pools[j]!.perSecond * DT;
    const t = have - r < OBJECT_DUST_C ? have : r;
    if (t !== have) all = false;
    c.push(t);
    remainingC += have;
    released += t;
  }
  const nOut = all ? o.n : remainingC > 0 ? (o.n * released) / remainingC : 0;
  let lastWith = -1;
  for (let j = 0; j < c.length; j++) if (c[j]! > 0) lastWith = j;
  if (lastWith < 0) lastWith = pools.length - 1; // no carbon left (a damaged import): the nutrient still leaves whole
  const n: number[] = [];
  let nLeft = nOut;
  for (let j = 0; j < c.length; j++) {
    const nt = j === lastWith ? nLeft : released > 0 ? (nOut * c[j]!) / released : 0;
    nLeft -= nt;
    n.push(nt);
  }
  return { c, n, emptied: all };
}

/** Apply one object's release this tick (see releaseFoodObjects). Returns true when it emptied. */
function releaseOne(world: World, o: FoodObject): boolean {
  const pools = FOOD_OBJECT_RULES[o.kind].pools;
  const plan = objectReleasePlan(o);
  let nTotal = 0;
  for (let j = 0; j < pools.length; j++) {
    const p = pools[j]!;
    const t = plan.c[j]!;
    const nt = plan.n[j]!;
    nTotal += nt;
    if (t === 0 && nt === 0) continue;
    const have = o.pools[p.pool] ?? 0;
    o.pools[p.pool] = t === have ? 0 : have - t;
    world.fields[p.field]![o.cell]! += t;
    world.fields[p.fieldN]![o.cell]! += nt;
    markField(world, p.field);
    markField(world, p.fieldN);
  }
  o.n = plan.emptied ? 0 : o.n - nTotal;
  return plan.emptied;
}
