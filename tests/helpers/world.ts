/** Test helpers: build worlds from the real content registry with explicit, labelled test states. */
import type { ContentRegistry } from '../../src/sim/content/registry';
import type { RecipeDef } from '../../src/sim/content/schema';
import { introduceOrganism } from '../../src/sim/commands';
import { cellIndex } from '../../src/sim/grid';
import { realizeRecipe } from '../../src/sim/recipes';
import { rebuildIndex } from '../../src/sim/spatial';
import { speciesIndex, type World } from '../../src/sim/world';
import { loadRegistryFs } from '../../tools/lib/content-fs';
import { FIELD_DEFS, type FieldId, type SystemFlag } from '../../src/sim/fields';
import { registryWith } from './registry';
import { markField, updateDerived } from '../../src/sim/transport';
import { inMask, maskCells } from '../../src/sim/grid';
import { sortEdges, type EdgeBarrier } from '../../src/sim/barriers';
import { sortDevices, type Device } from '../../src/sim/devices';
import { initializeLedger } from '../../src/sim/ledger';
import { addAdhesionLink, addFungalLink, LINK_TRANSPORT, type FungalLinkKind } from '../../src/sim/links';
import { createObject, objectTotals, type FoodObject, type FoodObjectKind } from '../../src/sim/objects';

export function registry(): ContentRegistry {
  return loadRegistryFs();
}

/** The systems the systems flip enabled (D-0121); a v1.0 dish records none of them. */
export const FLIP_SYSTEMS: readonly SystemFlag[] = ['barriers', 'climate', 'devices'];

/**
 * The registry of a dish recorded before the systems flip (D-0121), which is what a v1.0 dish records: the
 * shipped manifest without 'barriers', 'climate', 'devices' and S01–S12 (its other content, and therefore its
 * contentHash, equal to the pre-flip build's). For tests whose subject is a dish without the Phase 5 systems,
 * which used the shipped registry for that before the flip.
 */
export function preFlipRegistry(): ContentRegistry {
  const m = registry().manifest;
  return registryWith({
    enabledSystems: m.enabledSystems.filter((s) => !FLIP_SYSTEMS.includes(s)),
    enabledStructures: (m.enabledStructures ?? []).filter((s) => !/^S\d\d$/.test(s)),
  });
}

/**
 * A clear-water dish (Water Garden without stones), background sugar 0, no organisms. `reg` defaults
 * to the shipped registry; a test whose subject is Phase 2 passes registryWith(G2_LISTS).
 */
export function clearWater(overrides: Partial<RecipeDef> = {}, reg: ContentRegistry = registry()): World {
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

/** Link two organisms with a fungal link (test setup; throws when the store refuses). */
export function linkFungal(world: World, a: number, b: number, kind: FungalLinkKind = LINK_TRANSPORT): void {
  if (!addFungalLink(world, a, b, kind)) throw new Error(`linkFungal: ${a}–${b} refused`);
}

/** Link two organisms with an adhesion link (test setup; throws when the store refuses). */
export function linkAdhesion(world: World, a: number, b: number): void {
  if (!addAdhesionLink(world, a, b)) throw new Error(`linkAdhesion: ${a}–${b} refused`);
}

/**
 * Place a finite food object (test setup): its material is logged as an external input, as the
 * placing tool will (SPEC §5.1 "creation is an external ledger input"). Throws when the store refuses.
 */
export function placeObject(world: World, cell: number, kind: FoodObjectKind, pools: FoodObject['pools'], n: number): FoodObject {
  const res = createObject(world, { cell, kind, pools, n });
  if (!res.ok) throw new Error(`placeObject: refused (${res.reason})`);
  world.ledger.inputs.c += objectTotals([res.object]).c;
  world.ledger.inputs.n += n;
  return res.object;
}

/**
 * Place one organism carrying supplementary `modules` at an exact position (introduceOrganism's
 * { modules, exactCenter }, as tests/fixtures/module-accounting.test.ts placeWith does); material
 * overrides are logged as inputs/exports so ledgers stay exact. Returns its slot.
 */
export function placeWith(world: World, speciesId: string, x: number, y: number, modules: readonly string[], state: Partial<Record<'B' | 'N' | 'E' | 'H' | 'age', number>> = {}): number {
  const slot = introduceOrganism(world, speciesIndex(world, speciesId), cellIndex(Math.floor(x), Math.floor(y)), 'test', { modules, exactCenter: true });
  if (slot < 0) throw new Error('capacity');
  const c = world.ents.cols;
  c.x[slot] = x;
  c.y[slot] = y;
  for (const key of ['B', 'N', 'E', 'H', 'age'] as const) {
    const v = state[key];
    if (v === undefined) continue;
    if (key === 'B') world.ledger.inputs.c += v - c.B[slot]!;
    else if (key === 'N') world.ledger.inputs.n += v - c.N[slot]!;
    c[key][slot] = v;
  }
  rebuildIndex(world);
  return slot;
}

// ---- Phase 5 wave 9 (barrier-movement): edge barriers and devices pushed straight into a world's stores.

/** Every Phase 5 structure id (S01–S12). */
export const PHASE5_STRUCTURE_IDS = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'] as const;

/**
 * Push edge barriers into `world.edges` (test setup, before a run): ids from counters.nextDeviceId, the
 * store re-sorted by edgeKey (one barrier per edge, as the import requires), geometryVersion bumped as
 * every edge writer must. Each entry's `cell` is the edge's lower cell (the left cell for 'R', the upper
 * cell for 'D'). Returns the ids given, in input order.
 */
export function pushEdges(world: World, edges: readonly Omit<EdgeBarrier, 'id'>[]): number[] {
  const ids: number[] = [];
  const added: EdgeBarrier[] = edges.map((e) => {
    const id = world.counters.nextDeviceId++;
    ids.push(id);
    return { ...e, id };
  });
  const sorted = sortEdges([...world.edges, ...added]);
  world.edges.length = 0;
  world.edges.push(...sorted);
  world.grid.geometryVersion++;
  return ids;
}

/** Edge barriers of one kind on the R edges of cells (x, y0 … y1) (a vertical line between x and x + 1). */
export function verticalLine(kind: EdgeBarrier['kind'], x: number, y0: number, y1: number, extra: Partial<Omit<EdgeBarrier, 'id' | 'kind' | 'cell' | 'dir'>> = {}): Omit<EdgeBarrier, 'id'>[] {
  const out: Omit<EdgeBarrier, 'id'>[] = [];
  for (let y = y0; y <= y1; y++) if (inMask(x, y) && inMask(x + 1, y)) out.push({ kind, cell: cellIndex(x, y), dir: 'R', ...extra });
  return out;
}

/**
 * Push furnishings/devices into `world.devices` (test setup): ids from counters.nextDeviceId, the store
 * re-sorted by cell, geometryVersion bumped. Toggled kinds start off unless `on` is given.
 */
export function pushDevices(world: World, devices: readonly Omit<Device, 'id'>[]): number[] {
  const ids: number[] = [];
  const added: Device[] = devices.map((d) => {
    const id = world.counters.nextDeviceId++;
    ids.push(id);
    const rec: Device = { ...d, id };
    if ((d.kind === 'S09' || d.kind === 'S10') && rec.on === undefined) rec.on = false;
    if (d.kind === 'S08' && rec.resinSelect === undefined) rec.resinSelect = [];
    return rec;
  });
  const sorted = sortDevices([...world.devices, ...added]);
  world.devices.length = 0;
  world.devices.push(...sorted);
  world.grid.geometryVersion++;
  return ids;
}

/**
 * The content registry of the wave 9 barrier tests: the shipped manifest plus the 'barriers', 'climate'
 * and 'devices' systems and S01–S12. Since the systems flip (D-0121) the shipped manifest holds them all
 * and the structures are implemented, so the lists equal the shipped ones (registryWith drops the
 * repeats) and no allowUnimplemented is needed. Kept explicit so the barrier tests say what they need.
 */
export function barrierRegistry(): ContentRegistry {
  const systems = [...registry().manifest.enabledSystems, 'barriers', 'climate', 'devices'].sort() as SystemFlag[];
  return registryWith({ enabledSystems: systems, enabledStructures: ['BEAD', ...PHASE5_STRUCTURE_IDS, 'STONE', 'WALL'] });
}

/** A clear-water dish (clearWater) that records the Phase 5 systems and S01–S12. */
export function barrierDish(overrides: Partial<RecipeDef> = {}): World {
  return clearWater(overrides, barrierRegistry());
}

// ---- Phase 5 wave 10 (e3-resters): the resters' and V02/X02 test registry, and painted ground.

/**
 * The content registry of the wave 10 resters tests: the shipped manifest plus B12, F04, P08, X02 and
 * V02, the 'barriers', 'climate' and 'devices' systems and S01–S12. DORMANCY and RESTING_DAUGHTER were
 * listed as implemented at the wave 10 integration (D-0118) and the structures at the systems flip
 * (D-0121), so no allowUnimplemented is needed; registryWith drops the repeated systems.
 */
export function resterRegistry(): ContentRegistry {
  const shipped = registry().manifest;
  const species = [...shipped.enabledSpecies, 'B12', 'F04', 'P08', 'V02', 'X02'].sort();
  const systems = [...shipped.enabledSystems, 'barriers', 'climate', 'devices'].sort() as SystemFlag[];
  return registryWith({ enabledSpecies: species, enabledSystems: systems, enabledStructures: ['BEAD', ...PHASE5_STRUCTURE_IDS, 'STONE', 'WALL'] });
}

/** Paint substrate `sub` (grid.ts SUB_*) on the in-dish cells of the rectangle x0…x1 × y0…y1 (test setup); bumps geometryVersion. */
export function paintRect(world: World, sub: number, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inMask(x, y)) world.grid.substrate[cellIndex(x, y)] = sub;
  world.grid.geometryVersion++;
}
