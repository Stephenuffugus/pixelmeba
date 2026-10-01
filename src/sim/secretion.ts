/**
 * Enzyme producers (SPEC §5.3, CT §12.6; P3.7 stage 8). One generic producer action serves every
 * activity: starch → eStarch, oil → eOil, protein → eProtein. A producer emits its activity rate into
 * its own cell while Active, E (remaining this tick) > its threshold, a compatible deposited
 * substrate lies in its cell or a four-neighbor cell, and local activity is below the cap; it pays
 * the emit cost per second into ledger.energy.secretion. The numbers come from the producer's
 * profile: CT constants for a native producer, the world's recorded module parameters for a carrier
 * (E01 starch; E09 protein from wave 4).
 *
 * This replaced the Phase 2 starch-only code with the same comparisons, in the same order, with the
 * same float operations, so native B06 and E01 carriers behave bit-identically (the g2 replay and
 * trajectory fence guard it). With nothing reserved earlier this tick, remainingEnergy() is E − 0 = E.
 */
import { DT, GRID_W } from './constants';
import { FLAG } from './entities';
import type { FieldId } from './fields';
import type { ActionContext, Stage8Action } from './actions';
import type { Profile, ProducerRules } from './phenotype';
import { R } from './reasons';
import { entityCell } from './spatial';
import { markField } from './transport';

/** Which profile slot holds a producer's rules. */
export type ProducerSlot = 'starch' | 'oil' | 'protein';

/** Substrate → activity pairs (SPEC §5.3), by producer slot. */
export const PRODUCER_FIELDS: Readonly<Record<ProducerSlot, { readonly substrate: FieldId; readonly activity: FieldId }>> = Object.freeze({
  starch: Object.freeze({ substrate: 'starch', activity: 'eStarch' }),
  oil: Object.freeze({ substrate: 'oil', activity: 'eOil' }),
  protein: Object.freeze({ substrate: 'protein', activity: 'eProtein' }),
});

/** Whether a deposited substrate lies in `cell` or one of its four neighbors. */
export function substrateNear(sub: Float64Array, cell: number): boolean {
  if (sub[cell]! > 0) return true;
  const x = cell % GRID_W;
  if (x + 1 < GRID_W && sub[cell + 1]! > 0) return true;
  if (x > 0 && sub[cell - 1]! > 0) return true;
  if (cell + GRID_W < sub.length && sub[cell + GRID_W]! > 0) return true;
  if (cell - GRID_W >= 0 && sub[cell - GRID_W]! > 0) return true;
  return false;
}

/** Try one secretion; returns a reason code describing the outcome. Commits its cost at once. */
export function secrete(ctx: ActionContext, rules: ProducerRules, activity: FieldId, substrate: FieldId): number {
  const world = ctx.world;
  const i = ctx.i;
  const c = world.ents.cols;
  const act = world.fields[activity];
  const sub = world.fields[substrate];
  if (!act || !sub) return R.SECRETION_NO_SUBSTRATE;
  if (ctx.remainingEnergy() <= rules.minEnergy) return R.SECRETION_ENERGY_LOW;
  const cell = entityCell(c.x[i]!, c.y[i]!);
  if (!substrateNear(sub, cell)) return R.SECRETION_NO_SUBSTRATE;
  if (act[cell]! >= rules.localCap) return R.SECRETION_SATURATED;
  const cost = rules.emitCost * DT;
  if (ctx.remainingEnergy() < cost) return R.SECRETION_ENERGY_LOW;
  ctx.spend(cost, 'secretion');
  act[cell]! += rules.emitRate * DT;
  markField(world, activity);
  return R.SECRETING;
}

function rulesOf(prof: Profile, slot: ProducerSlot): ProducerRules | null {
  return slot === 'starch' ? prof.starch : slot === 'oil' ? prof.oil : prof.protein;
}

/** Applies when the producer rules in `slot` come from `source` (native, or that module). */
export function producerApplies(slot: ProducerSlot, source: ProducerRules['source']): Stage8Action['applies'] {
  return (prof) => {
    const r = rulesOf(prof, slot);
    return r !== null && r.source === source;
  };
}

/**
 * The producer action for `slot`: secrete, then record the outcome in secretionCode and the
 * secreting column/flag. An organism with two producers shows SECRETING if either secreted this tick
 * (a later refusal never hides an earlier success), otherwise the last producer's refusal.
 */
export function producerRun(slot: ProducerSlot): Stage8Action['run'] {
  const pair = PRODUCER_FIELDS[slot];
  return (ctx) => {
    const rules = rulesOf(ctx.profile, slot);
    if (rules === null) throw new Error(`stage 8: organism slot ${ctx.i} has no ${slot} producer rules`);
    const c = ctx.world.ents.cols;
    const i = ctx.i;
    const outcome = secrete(ctx, rules, pair.activity, pair.substrate);
    if (outcome === R.SECRETING) {
      c.secretionCode[i] = outcome;
      c.secreting[i] = 1;
      c.flags[i] = c.flags[i]! | FLAG.secreting;
    } else if (c.secreting[i] !== 1) {
      c.secretionCode[i] = outcome;
    }
    return outcome;
  };
}
