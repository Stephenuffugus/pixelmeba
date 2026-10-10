/**
 * Clean water replacement (SPEC §10.6; BUILD_DIRECTIVE P3.5; D-0037): the explicit dilution tool,
 * offered on every world (a player tool recorded as a command, not a biology rule).
 *
 * One stroke (points + radius 1/3/6) and a fraction 0.25 / 0.5 / 1:
 * - every dissolved non-gas field in the covered open cells (kinds dissolved, activity and viral;
 *   companion nutrient fields are kind dissolved, so they leave in the same fraction) loses that
 *   fraction; carbon, nutrient and mineral leave as ledger exports ('tool:cleanWater');
 * - oxygen and carbon dioxide in those cells are set to the habitat's baseline for the cell: the
 *   habitat's baseFields, overridden by the fields of every habitat op covering the cell (the preset
 *   geometry as recorded in the world, e.g. SEDIMENT_EDGE oxygen 0.2 over its sediment rows). Carbon
 *   dioxide added is a carbon input, carbon dioxide removed a carbon export; oxygen is not ledgered
 *   (it is not a conserved material, SPEC §3.4);
 * - life, deposits and food objects are untouched.
 * No randomness is drawn.
 */
import type { CommandResult } from './commands';
import type { GeometryOp } from './content/schema';
import { FIELD_DEFS, FIELD_IDS, type FieldId } from './fields';
import { cellX, cellY, inDisk, inMask, isLabRadius, transportOpen } from './grid';
import { recordExport, recordInput } from './ledger';
import { markField } from './transport';
import type { World } from './world';

export const CLEAN_WATER_FRACTIONS = [0.25, 0.5, 1] as const;
export type CleanWaterFraction = (typeof CLEAN_WATER_FRACTIONS)[number];

export type CleanWaterPayload = {
  readonly kind: 'cleanWater';
  readonly points: ReadonlyArray<readonly [number, number]>;
  readonly radius: number;
  readonly fraction: number;
};

/** Field kinds clean water removes: dissolved non-gas fields (SPEC §10.6). */
export function cleanWaterRemoves(id: FieldId): boolean {
  const k = FIELD_DEFS[id].kind;
  return k === 'dissolved' || k === 'activity' || k === 'viral';
}

function opCovers(op: GeometryOp, cell: number): boolean {
  const x = cellX(cell);
  const y = cellY(cell);
  if (op.op === 'disk') return inDisk(x, y, op.center[0], op.center[1], op.radius);
  return x >= op.x0 && x <= op.x1 && y >= op.y0 && y <= op.y1;
}

/** The habitat baseline of a gas field in one cell (baseFields, then each covering op's fields in order). */
export function habitatBaseline(world: World, id: 'oxygen' | 'co2', cell: number): number {
  const h = world.content.habitat;
  let v = h.baseFields[id] ?? 0;
  for (const op of h.ops) {
    const f = op.fields?.[id];
    if (f !== undefined && opCovers(op, cell)) v = f;
  }
  return v;
}

export function cleanWater(world: World, p: CleanWaterPayload, cells: readonly number[]): CommandResult {
  if (!isLabRadius(p.radius)) return { accepted: 0, rejected: 0, note: 'invalid radius' };
  if (!(CLEAN_WATER_FRACTIONS as readonly number[]).includes(p.fraction)) return { accepted: 0, rejected: 0, note: 'invalid fraction' };
  const ids = FIELD_IDS.filter((id) => world.fields[id] !== undefined && cleanWaterRemoves(id));
  let accepted = 0;
  let rejected = 0;
  let outC = 0;
  let outN = 0;
  let outM = 0;
  let addCo2 = 0;
  let removeCo2 = 0;
  const o2 = world.fields.oxygen!;
  const co2 = world.fields.co2!;
  for (const cell of cells) {
    if (!inMask(cellX(cell), cellY(cell)) || !transportOpen(world.grid, cell)) {
      rejected++;
      continue;
    }
    accepted++;
    for (const id of ids) {
      const arr = world.fields[id]!;
      const v = arr[cell]!;
      if (v === 0) continue;
      // The whole value at 100 % (no roundoff left behind), else exactly that fraction of it.
      const take = p.fraction === 1 ? v : v * p.fraction;
      arr[cell] = p.fraction === 1 ? 0 : v - take;
      const def = FIELD_DEFS[id];
      const amount = take * (def.carbonPerUnit ?? 1);
      if (def.material === 'carbon') outC += amount;
      else if (def.material === 'nutrient') outN += amount;
      else if (def.material === 'mineral') outM += amount;
    }
    o2[cell] = habitatBaseline(world, 'oxygen', cell);
    const target = habitatBaseline(world, 'co2', cell);
    const d = target - co2[cell]!;
    if (d > 0) addCo2 += d;
    else removeCo2 -= d;
    co2[cell] = target;
  }
  if (accepted > 0) {
    for (const id of ids) markField(world, id);
    markField(world, 'oxygen');
    markField(world, 'co2');
  }
  if (outC || outN || outM) recordExport(world, 'tool:cleanWater', outC, outN, outM);
  if (removeCo2 > 0) recordExport(world, 'tool:cleanWater:co2', removeCo2, 0, 0);
  if (addCo2 > 0) recordInput(world, 'tool:cleanWater:co2', addCo2, 0, 0);
  return { accepted, rejected };
}
