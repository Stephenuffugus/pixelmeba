/**
 * Stage 8 — state and structures (SPEC §3.2, §5.3). Reservation order per organism: mandatory state
 * transitions (dormancy, SPEC §7.6) → native optional actions in stable action-ID order →
 * supplementary modules E01…E17. Every action reserves its energy before another can use the
 * remainder; costs are paid only for work actually done.
 *
 * E_STARCH secretion (native B06/F02, or gained through E01 — never both, SPEC §9): a producer
 * emits its activity rate into its own cell while Active, E > its threshold after maintenance, a
 * compatible deposited substrate lies in its cell or a four-neighbor cell, and local activity is
 * below the cap; it pays the emit cost per second. The numbers come from the producer's profile:
 * CT constants for a native producer, the world's recorded E01 parameters for a carrier.
 */
import { DT, GRID_W } from './constants';
import { FLAG, LIFE_ACTIVE } from './entities';
import type { FieldId } from './fields';
import { dormancyStep } from './dormancy';
import type { StarchRules } from './phenotype';
import { profileOf } from './profiles';
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
function secrete(world: World, i: number, rules: StarchRules, activity: FieldId, substrate: FieldId): number {
  const c = world.ents.cols;
  const act = world.fields[activity];
  const sub = world.fields[substrate];
  if (!act || !sub) return R.SECRETION_NO_SUBSTRATE;
  if (c.E[i]! <= rules.minEnergy) return R.SECRETION_ENERGY_LOW;
  const cell = entityCell(c.x[i]!, c.y[i]!);
  if (!substrateNear(sub, cell)) return R.SECRETION_NO_SUBSTRATE;
  if (act[cell]! >= rules.localCap) return R.SECRETION_SATURATED;
  const cost = rules.emitCost * DT;
  if (c.E[i]! < cost) return R.SECRETION_ENERGY_LOW;
  c.E[i]! -= cost;
  world.ledger.energy.secretion += cost;
  act[cell]! += rules.emitRate * DT;
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
    const prof = profileOf(world, i);
    // 1. Mandatory transitions.
    dormancyStep(world, i, prof);
    if (c.lifeState[i] !== LIFE_ACTIVE) continue;
    // 2–3. Optional actions: E_STARCH secretion (native action, or the E01 module's).
    if (prof.starch !== null) {
      const outcome = secrete(world, i, prof.starch, 'eStarch', 'starch');
      c.secretionCode[i] = outcome;
      if (outcome === R.SECRETING) {
        c.secreting[i] = 1;
        c.flags[i] = c.flags[i]! | FLAG.secreting;
      }
    }
  }
}
