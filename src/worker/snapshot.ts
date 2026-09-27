/**
 * Snapshot and inspector builders (ARCH §8, SPEC §12.1). Pure reads of authoritative state: no
 * simulation randomness, no mutation. The worker transfers the typed arrays to the main thread.
 */
import { CELL_COUNT, GRID_W } from '@sim/constants';
import { allDivisionBlockers, divisionBlocker } from '@sim/births';
import { FLAG } from '@sim/entities';
import type { SimEvent } from '@sim/events';
import { FIELD_IDS, type FieldId } from '@sim/fields';
import { STRUCTURE_NAMES, SUBSTRATE_NAMES } from '@sim/grid';
import { hungryPredator } from '@sim/movement';
import { childrenOf, field as lineageField } from '@sim/lineage';
import { profileOf } from '@sim/profiles';
import { R } from '@sim/reasons';
import { entityCell, forEachInCell } from '@sim/spatial';
import { response, SHOULDER_PH, SHOULDER_SALINITY, SHOULDER_WARMTH, suitabilityAt } from '@sim/suitability';
import type { World } from '@sim/world';
import {
  CUE_CAPACITY_BLOCKED,
  CUE_FEEDING,
  CUE_HUNTING,
  CUE_JUST_BORN,
  CUE_SECRETING,
  CUE_STRESSED,
  E_CUE,
  E_ENERGY,
  E_FLAGS,
  E_GROWTH,
  E_HEADING,
  E_HEALTH,
  E_LIFE,
  E_SIZE,
  E_SLOT,
  E_SPECIES,
  E_X,
  E_Y,
  ENT_STRIDE,
  ID_STRIDE,
  type CellInspect,
  type EntityInspect,
  type InspectorPayload,
  type OverlayId,
  type Selection,
  type VisualEvent,
} from './protocol';

export function packEntities(world: World, ents: Float32Array | null, ids: Uint32Array | null): { ents: Float32Array; ids: Uint32Array; count: number; speciesCounts: number[] } {
  const e = world.ents;
  const c = e.cols;
  const n = e.count;
  const outE = ents && ents.length >= n * ENT_STRIDE ? ents : new Float32Array(Math.max(64, n) * ENT_STRIDE);
  const outI = ids && ids.length >= n * ID_STRIDE ? ids : new Uint32Array(Math.max(64, n) * ID_STRIDE);
  const speciesCounts = new Array<number>(world.species.length).fill(0);
  let k = 0;
  for (let i = 0; i < e.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const sp = world.species[c.species[i]!]!;
    const prof = profileOf(world, i);
    const o = k * ENT_STRIDE;
    const flags = c.flags[i]!;
    let cue = 0;
    if (flags & FLAG.feeding) cue |= CUE_FEEDING;
    if (flags & FLAG.stressed) cue |= CUE_STRESSED;
    if (flags & FLAG.hunting) cue |= CUE_HUNTING;
    if (c.secreting[i]) cue |= CUE_SECRETING;
    if (flags & FLAG.justBorn) cue |= CUE_JUST_BORN;
    if (flags & FLAG.capacityBlocked) cue |= CUE_CAPACITY_BLOCKED;
    outE[o + E_SLOT] = i;
    outE[o + E_SPECIES] = c.species[i]!;
    outE[o + E_X] = c.x[i]!;
    outE[o + E_Y] = c.y[i]!;
    outE[o + E_HEADING] = c.heading[i]!;
    outE[o + E_FLAGS] = flags;
    outE[o + E_GROWTH] = Math.min(1, c.B[i]! / (2 * sp.def.b0));
    outE[o + E_ENERGY] = c.E[i]! / prof.energyCap;
    outE[o + E_HEALTH] = c.H[i]! / 100;
    outE[o + E_LIFE] = c.lifeState[i]!;
    outE[o + E_SIZE] = 1;
    outE[o + E_CUE] = cue;
    outI[k * ID_STRIDE] = c.birthId[i]!;
    outI[k * ID_STRIDE + 1] = c.entityId[i]!;
    speciesCounts[c.species[i]!]!++;
    k++;
  }
  return { ents: outE, ids: outI, count: k, speciesCounts };
}

/** Deposit glyph bands: starch, detritus, oil, protein, sugar haze → 0–255 on a soft log scale. */
export const DEPOSIT_BANDS = 5;
export function packDeposits(world: World, out: Uint8Array | null): Uint8Array {
  const buf = out && out.length === CELL_COUNT * DEPOSIT_BANDS ? out : new Uint8Array(CELL_COUNT * DEPOSIT_BANDS);
  const kinds: FieldId[] = ['starch', 'detritus', 'oil', 'protein', 'sugar'];
  kinds.forEach((id, k) => {
    const f = world.fields[id];
    const base = k * CELL_COUNT;
    if (!f) {
      buf.fill(0, base, base + CELL_COUNT);
      return;
    }
    for (let i = 0; i < CELL_COUNT; i++) {
      const v = f[i]!;
      buf[base + i] = v <= 1e-6 ? 0 : Math.min(255, Math.max(1, Math.round((Math.log10(1 + v * 100) / Math.log10(201)) * 255)));
    }
  });
  return buf;
}

export function packOverlay(world: World, id: OverlayId, out: Float32Array | null): { data: Float32Array; max: number } | null {
  const buf = out && out.length === CELL_COUNT ? out : new Float32Array(CELL_COUNT);
  let src: Float64Array | undefined;
  if (id === 'light') src = world.derived.light;
  else if (id === 'ph') src = world.derived.ph;
  else src = world.fields[id];
  if (!src) return null;
  let max = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    const v = src[i]!;
    buf[i] = v;
    if (v > max) max = v;
  }
  return { data: buf, max };
}

export function visualEvents(events: readonly SimEvent[], sinceId: number): VisualEvent[] {
  const out: VisualEvent[] = [];
  for (const ev of events) {
    if (ev.id <= sinceId) continue;
    if (
      ev.type !== 'birth' &&
      ev.type !== 'death' &&
      ev.type !== 'introduce' &&
      ev.type !== 'capture' &&
      ev.type !== 'conversion' &&
      ev.type !== 'mutation' &&
      ev.type !== 'branchEstablished' &&
      ev.type !== 'branchExtinct'
    )
      continue;
    out.push({
      type: ev.type,
      tick: ev.tick,
      species: ev.species ?? -1,
      cell: ev.cell ?? -1,
      birthId: ev.birthId ?? 0,
      ...(ev.cause !== undefined ? { cause: ev.cause } : {}),
    });
  }
  return out;
}

function findSlotByBirth(world: World, birthId: number): number {
  const c = world.ents.cols;
  for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1 && c.birthId[i] === birthId) return i;
  return -1;
}

function inspectEntity(world: World, slot: number): EntityInspect {
  const c = world.ents.cols;
  const sp = world.species[c.species[slot]!]!;
  const prof = profileOf(world, slot);
  const g = world.genomes.get(c.genome[slot]!);
  const cell = entityCell(c.x[slot]!, c.y[slot]!);
  const birthId = c.birthId[slot]!;
  const parent = lineageField(world.lineage, 'parent', birthId) ?? 0;
  const parentGenome = parent > 0 ? lineageField(world.lineage, 'genome', parent) : undefined;
  const suit = suitabilityAt(world, sp, prof, cell);
  let predation: EntityInspect['predation'] = null;
  if (sp.isPredator) {
    let code: number = R.PRED_NO_PREY;
    if (c.mealC[slot]! >= 0.5 * prof.b0) code = R.PRED_MEAL_FULL;
    else if (!hungryPredator(world, slot, prof)) code = R.PRED_ENERGY_HIGH;
    else if (c.attackCooldown[slot]! > 0) code = R.PRED_COOLDOWN;
    else if (c.preySlot[slot]! >= 0) code = R.PRED_OUT_OF_CONTACT;
    predation = { code, targetBirthId: c.preyBirthId[slot]!, cooldown: c.attackCooldown[slot]! };
  }
  const foodHere = prof.foods.map((f) => ({ food: f, amount: world.fields[f]?.[cell] ?? 0 }));
  const blockers = divisionBlocker(world, slot) === R.NONE ? allDivisionBlockers(world, slot) : allDivisionBlockers(world, slot);
  return {
    birthId,
    entityId: c.entityId[slot]!,
    speciesIdx: c.species[slot]!,
    speciesId: sp.id,
    x: c.x[slot]!,
    y: c.y[slot]!,
    cell,
    age: c.age[slot]!,
    generation: c.generation[slot]!,
    parentBirthId: parent,
    origin: lineageField(world.lineage, 'origin', birthId) ?? 0,
    B: c.B[slot]!,
    B0: prof.b0,
    N: c.N[slot]!,
    E: c.E[slot]!,
    energyCap: prof.energyCap,
    H: c.H[slot]!,
    mealC: c.mealC[slot]!,
    suitability: c.suitability[slot]!,
    lifeState: c.lifeState[slot]!,
    flags: c.flags[slot]!,
    limitCode: c.limitCode[slot]!,
    limitValue: c.limitValue[slot]!,
    intakeLastSecond: c.intakeLastSecond[slot]!,
    lastIntakeTick: c.lastIntakeTick[slot]!,
    divisionBlockers: blockers,
    proposalPending: c.propG0[slot]! >= 0,
    predation,
    suitFactors: {
      ph: response(world.derived.ph[cell]!, prof.ph[0], prof.ph[1], SHOULDER_PH),
      warmth: response(world.settings.warmth, prof.warmth[0], prof.warmth[1], SHOULDER_WARMTH),
      salinity: response(world.fields.salt![cell]!, prof.salinity[0], prof.salinity[1], SHOULDER_SALINITY),
      reason: suit.reason,
    },
    profile: {
      q: prof.q,
      m: prof.m,
      speed: prof.speed,
      sensing: prof.sensing,
      minDivisionAge: prof.minDivisionAge,
      divisionCost: prof.divisionCost,
      ph: prof.ph,
      warmth: prof.warmth,
      salinity: prof.salinity,
      policy: prof.policy,
      foods: prof.foods,
      weights: prof.weights,
    },
    genome: {
      id: g.id,
      loci: g.loci,
      lociActive: sp.def.lociActive,
      ancestorLoci: [50, 50, 50, 50, 50, 50, 50, 50],
      modules: g.modules,
      changedFromParent: parentGenome !== undefined && parentGenome !== c.genome[slot],
    },
    foodHere,
  };
}

function inspectCell(world: World, cell: number): CellInspect {
  const fields: Record<string, number> = {};
  for (const id of FIELD_IDS) {
    const f = world.fields[id];
    if (!f) continue;
    const v = f[cell]!;
    if (v !== 0) fields[id] = v;
  }
  const residents: { birthId: number; speciesId: string }[] = [];
  forEachInCell(world, cell, (s) => {
    if (world.ents.cols.alive[s] === 1) residents.push({ birthId: world.ents.cols.birthId[s]!, speciesId: world.species[world.ents.cols.species[s]!]!.id });
  });
  return {
    cell,
    x: cell % GRID_W,
    y: Math.floor(cell / GRID_W),
    substrate: SUBSTRATE_NAMES[world.grid.substrate[cell]!] ?? 'water',
    structure: STRUCTURE_NAMES[world.grid.structure[cell]!] ?? 'none',
    fields,
    ph: world.derived.ph[cell]!,
    light: world.derived.light[cell]!,
    residents,
    load: world.derived.cellLoad[cell]!,
  };
}

export function buildInspector(world: World, sel: Selection): InspectorPayload {
  if (sel.kind === 'cell') return { kind: 'cell', cell: inspectCell(world, sel.cell) };
  const slot = findSlotByBirth(world, sel.birthId);
  if (slot >= 0) return { kind: 'entity', entity: inspectEntity(world, slot) };
  const L = world.lineage;
  const children = childrenOf(L, sel.birthId);
  return {
    kind: 'gone',
    gone: {
      birthId: sel.birthId,
      deathTick: lineageField(L, 'deathTick', sel.birthId) ?? -1,
      cause: lineageField(L, 'deathCause', sel.birthId) ?? 0,
      divided: (lineageField(L, 'deathCause', sel.birthId) ?? 0) === -1,
      children,
    },
  };
}
