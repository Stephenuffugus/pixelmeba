/**
 * Stage 8 — state and structures (SPEC §3.2, §5.3). Reservation order: mandatory state transitions
 * (none yet) → native optional actions in stable action-ID order → supplementary modules E01…E17.
 * Every action reserves its energy before another can use the remainder; costs are paid only for
 * work actually done.
 *
 * Phase 1: native E_STARCH secretion (Crumbsmith). A producer emits 0.02 activity/s into its own
 * cell while E > 35 after maintenance, a compatible deposited substrate lies in its cell or a
 * four-neighbor cell, and local activity is below 1.0; it pays 0.40 energy/s.
 */
import { DT, ENZYME_EMIT_COST, ENZYME_EMIT_MIN_ENERGY, ENZYME_EMIT_RATE, ENZYME_LOCAL_CAP, GRID_W } from './constants';
import { FLAG } from './entities';
import type { FieldId } from './fields';
import { R } from './reasons';
import { entityCell } from './spatial';
import { markField } from './transport';
import type { World } from './world';

function substrateNear(sub: Float64Array, cell: number): boolean {
  if (sub[cell]! > 0) return true;
  const x = cell % GRID_W;
  if (x + 1 < GRID_W && sub[cell + 1]! > 0) return true;
  if (x > 0 && sub[cell - 1]! > 0) return true;
  if (cell + GRID_W < sub.length && sub[cell + GRID_W]! > 0) return true;
  if (cell - GRID_W >= 0 && sub[cell - GRID_W]! > 0) return true;
  return false;
}

/** Try one secretion action; returns a reason code describing the outcome. */
function secrete(world: World, i: number, activity: FieldId, substrate: FieldId): number {
  const c = world.ents.cols;
  const act = world.fields[activity];
  const sub = world.fields[substrate];
  if (!act || !sub) return R.SECRETION_NO_SUBSTRATE;
  if (c.E[i]! <= ENZYME_EMIT_MIN_ENERGY) return R.SECRETION_ENERGY_LOW;
  const cell = entityCell(c.x[i]!, c.y[i]!);
  if (!substrateNear(sub, cell)) return R.SECRETION_NO_SUBSTRATE;
  if (act[cell]! >= ENZYME_LOCAL_CAP) return R.SECRETION_SATURATED;
  const cost = ENZYME_EMIT_COST * DT;
  if (c.E[i]! < cost) return R.SECRETION_ENERGY_LOW;
  c.E[i]! -= cost;
  world.ledger.energy.secretion += cost;
  act[cell]! += ENZYME_EMIT_RATE * DT;
  markField(world, activity);
  return R.SECRETING;
}

export function stageStructures(world: World): void {
  const e = world.ents;
  const c = e.cols;
  for (let i = 0; i < e.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    c.secreting[i] = 0;
    c.flags[i] = c.flags[i]! & ~FLAG.secreting;
    if (c.lifeState[i] !== 0) continue;
    const sp = world.species[c.species[i]!]!;
    // Native optional actions in stable action-ID order.
    if (sp.secretesStarch) {
      const outcome = secrete(world, i, 'eStarch', 'starch');
      c.secretionCode[i] = outcome;
      if (outcome === R.SECRETING) {
        c.secreting[i] = 1;
        c.flags[i] = c.flags[i]! | FLAG.secreting;
      }
    }
  }
}
