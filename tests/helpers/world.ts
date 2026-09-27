/** Test helpers: build worlds from the real content registry with explicit, labelled test states. */
import type { ContentRegistry } from '../../src/sim/content/registry';
import type { RecipeDef } from '../../src/sim/content/schema';
import { introduceOrganism } from '../../src/sim/commands';
import { cellIndex } from '../../src/sim/grid';
import { realizeRecipe } from '../../src/sim/recipes';
import { rebuildIndex } from '../../src/sim/spatial';
import { speciesIndex, type World } from '../../src/sim/world';
import { loadRegistryFs } from '../../tools/lib/content-fs';
import { FIELD_DEFS, type FieldId } from '../../src/sim/fields';
import { markField, updateDerived } from '../../src/sim/transport';
import { maskCells } from '../../src/sim/grid';
import { initializeLedger } from '../../src/sim/ledger';

export function registry(): ContentRegistry {
  return loadRegistryFs();
}

/** A clear-water dish (Water Garden without stones), background sugar 0, no organisms. */
export function clearWater(overrides: Partial<RecipeDef> = {}): World {
  const reg = registry();
  const base = reg.recipes.FIRST_DISH_V1!;
  const recipe: RecipeDef = {
    ...base,
    id: 'TEST_CLEAR_WATER',
    removeStones: true,
    fieldPatches: [],
    founders: [],
    scheduledCommands: [],
    backgroundOverrides: { sugar: 0 },
    mutationPreset: 'fixed',
    ...overrides,
  };
  return realizeRecipe(reg, recipe, { worldId: 'test' });
}

/** Place one organism at an exact continuous position; returns its slot. */
export function place(world: World, speciesId: string, x: number, y: number, state: Partial<Record<'B' | 'N' | 'E' | 'H' | 'age', number>> = {}): number {
  const spIdx = speciesIndex(world, speciesId);
  const cell = cellIndex(Math.floor(x), Math.floor(y));
  const slot = introduceOrganism(world, spIdx, cell, 'test', { exactCenter: true });
  if (slot < 0) throw new Error('capacity');
  const c = world.ents.cols;
  c.x[slot] = x;
  c.y[slot] = y;
  // Test-only state overrides are logged as external inputs/exports so the ledger stays honest.
  for (const key of ['B', 'N', 'E', 'H', 'age'] as const) {
    const v = state[key];
    if (v === undefined) continue;
    if (key === 'B') {
      world.ledger.inputs.c += v - c.B[slot]!;
    } else if (key === 'N') {
      world.ledger.inputs.n += v - c.N[slot]!;
    }
    c[key][slot] = v;
  }
  rebuildIndex(world);
  return slot;
}

/** Set one cell of a field, logging the change as an external input/export so ledgers stay exact. */
export function setField(world: World, id: FieldId, cell: number, value: number): void {
  const arr = world.fields[id];
  if (!arr) throw new Error(`field ${id} not allocated`);
  const delta = value - arr[cell]!;
  arr[cell] = value;
  markField(world, id);
  const def = FIELD_DEFS[id];
  if (def.material === 'carbon') world.ledger.inputs.c += delta * (def.carbonPerUnit ?? 1);
  else if (def.material === 'nutrient') world.ledger.inputs.n += delta;
  else if (def.material === 'mineral') world.ledger.inputs.m += delta;
}

/** Overwrite a whole field over the playable mask, re-baselining the ledger (test setup only). */
export function fillField(world: World, id: FieldId, value: number): void {
  const arr = world.fields[id]!;
  for (const k of maskCells()) arr[k] = value;
  markField(world, id);
  updateDerived(world);
  rebaseLedger(world);
}

/** Re-baseline the ledger after hand-built test setup (initial := current totals, no inputs). */
export function rebaseLedger(world: World): void {
  initializeLedger(world);
  world.ledger.inputs = { c: 0, n: 0, m: 0 };
  world.ledger.exports = { c: 0, n: 0, m: 0 };
  world.ledger.exchangeC = 0;
}

export function aliveOf(world: World, speciesId?: string): number[] {
  const out: number[] = [];
  const c = world.ents.cols;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    if (speciesId && world.species[c.species[i]!]!.id !== speciesId) continue;
    out.push(i);
  }
  return out;
}
