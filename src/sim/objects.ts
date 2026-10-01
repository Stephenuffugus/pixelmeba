/**
 * Finite food objects (SPEC §2.4, §2.5, §3.4, §5.1; CT §14; Phase 3 foundation, world schema 4).
 *
 * The store only: `world.objects` holds each object's explicit inventory, ordered by id (creation
 * order). Release (P3.6), the placing tool and the inspector come later. Objects are a ledgered
 * compartment (src/sim/ledger.ts computeTotals counts their carbon and nutrient), so a move between a
 * cell and an object is balanced; creating one from nothing is an external input that the CALLER
 * records (createObject never touches the ledger).
 *
 * The cap (128) is shared with E17 caches (Phase 7, CT §14); a later schema step adds 'cache' to the
 * kind union, which stays a validated union (FOOD_OBJECT_KINDS).
 */
import { CELL_COUNT } from './constants';
import { maskCells, ST_NONE, ST_OUTSIDE } from './grid';
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

/** What is wrong with one object record (untrusted, e.g. from a save), or null. Placement is checked separately. */
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
  for (const k of Object.keys(pools)) {
    if (!(FOOD_OBJECT_POOLS as readonly string[]).includes(k)) return `unknown pool ${k}`;
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
