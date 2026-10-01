/**
 * Stage 7 — maintenance, aging, damage, healing, death and recycling (SPEC §6.7–6.8).
 */
import {
  DT,
  HEAL_MIN_ENERGY,
  HEAL_MIN_SUITABILITY,
  HEAL_RATE,
  INHIBITOR_DAMAGE,
  MOVE_COST_PER_CELL,
  STARVATION_DAMAGE,
  STRESS_DAMAGE,
  STRESS_THRESHOLD,
} from './constants';
import { emit } from './events';
import { LIFE_ACTIVE, LIFE_RESTING } from './entities';
import { recordDeath } from './lineage';
import { removeAllLinks } from './links';
import { onDeath } from './branches';
import { profileOf } from './profiles';
import { R } from './reasons';
import { entityCell } from './spatial';
import { inhibitorExposure } from './suitability';
import type { World } from './world';

/** Exponential weighting for "damage over the final ~10 s" attribution (DECISIONS D-0004). */
const DAMAGE_DECAY = Math.exp(-DT / 10);

export function stageMaintenance(world: World): void {
  const e = world.ents;
  const c = e.cols;
  const EL = world.ledger.energy;
  for (let i = 0; i < e.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const sp = world.species[c.species[i]!]!;
    const prof = profileOf(world, i);

    // Energy costs.
    // Charge maintenance first, then movement; record only what was actually paid. Ordinary
    // maintenance includes each carried module's surcharge exactly once (SPEC §6.7, §9); separate
    // upkeep (E05) is added once. While Resting a flat rest maintenance replaces all of it (§7.6).
    const rest = c.lifeState[i] === LIFE_RESTING ? prof.dormancy : null;
    const surcharge = rest ? 0 : prof.surcharge * DT;
    const upkeep = rest ? 0 : prof.upkeep * DT;
    const maint = rest ? rest.restMaintenance * DT : (prof.m + prof.upkeep) * DT;
    const move = MOVE_COST_PER_CELL * c.movedThisTick[i]! * prof.motilityFactor;
    const E0 = Math.max(0, c.E[i]!);
    const paidMaint = Math.min(maint, E0);
    const paidMove = Math.min(move, E0 - paidMaint);
    // Split what was paid across the categories in proportion to what was due.
    const frac = maint > 0 ? paidMaint / maint : 0;
    const paidSurcharge = surcharge * frac;
    const paidUpkeep = upkeep * frac;
    EL.maintenance += paidMaint - paidSurcharge - paidUpkeep;
    EL.surcharge += paidSurcharge;
    EL.upkeep += paidUpkeep;
    EL.movement += paidMove;
    const E = E0 - paidMaint - paidMove;
    c.E[i] = E;

    // Aging and timers.
    c.age[i]! += DT;
    if (c.attackCooldown[i]! > 0) c.attackCooldown[i] = Math.max(0, c.attackCooldown[i]! - DT);

    // Damage and healing.
    const suit = c.suitability[i]!;
    const cell = entityCell(c.x[i]!, c.y[i]!);
    const exposure = inhibitorExposure(world, sp, cell);
    // Resting: environmental stress and inhibitor damage × 0.10; starvation unchanged (§7.6).
    const damageFactor = rest ? rest.damageFactor : 1;
    const starve = E <= 0 ? STARVATION_DAMAGE * DT : 0;
    const stress = suit < STRESS_THRESHOLD ? STRESS_DAMAGE * DT * damageFactor : 0;
    const inhib = exposure > 0 ? INHIBITOR_DAMAGE * exposure * DT * damageFactor : 0;
    c.dmgStarve[i] = c.dmgStarve[i]! * DAMAGE_DECAY + starve;
    c.dmgStress[i] = c.dmgStress[i]! * DAMAGE_DECAY + stress;
    c.dmgInhib[i] = c.dmgInhib[i]! * DAMAGE_DECAY + inhib;
    c.dmgParasite[i] = c.dmgParasite[i]! * DAMAGE_DECAY;
    let H = c.H[i]! - starve - stress - inhib;
    const infected = c.infectedBy[i] !== 0;
    if (E > HEAL_MIN_ENERGY && suit > HEAL_MIN_SUITABILITY && !infected && c.lifeState[i] === LIFE_ACTIVE && H < 100) {
      H = Math.min(100, H + HEAL_RATE * DT);
    }
    c.H[i] = H;

    if (H <= 0) killEntity(world, i, primaryDamageCause(world, i));
    else if (c.age[i]! >= sp.def.maxAge) killEntity(world, i, R.DEATH_AGE);
  }
}

function primaryDamageCause(world: World, i: number): number {
  const c = world.ents.cols;
  const pairs: Array<[number, number]> = [
    [c.dmgStarve[i]!, R.DEATH_STARVATION],
    [c.dmgStress[i]!, R.DEATH_STRESS],
    [c.dmgInhib[i]!, R.DEATH_INHIBITOR],
    [c.dmgParasite[i]!, R.DEATH_PARASITE_DRAIN],
  ];
  let best = pairs[0]!;
  for (const p of pairs) if (p[0] > best[0]) best = p;
  return best[1];
}

/** Concurrent contributors: sources with ≥ 25 % of the primary cause's recent damage (SPEC §12.2). */
export function concurrentCauses(world: World, i: number, primary: number): number[] {
  const c = world.ents.cols;
  const pairs: Array<[number, number]> = [
    [c.dmgStarve[i]!, R.DEATH_STARVATION],
    [c.dmgStress[i]!, R.DEATH_STRESS],
    [c.dmgInhib[i]!, R.DEATH_INHIBITOR],
    [c.dmgParasite[i]!, R.DEATH_PARASITE_DRAIN],
  ];
  const top = pairs.find((p) => p[1] === primary)?.[0] ?? 0;
  return pairs.filter((p) => p[1] !== primary && top > 0 && p[0] >= 0.25 * top).map((p) => p[1]);
}

/**
 * Remove an organism exactly once, returning its remaining carbon and nutrient to the cell as
 * detritus, its meal as detritus, and any mineral as grit (SPEC §6.8); its remaining energy is
 * ledgered as dissipated.
 */
export function killEntity(world: World, i: number, cause: number): void {
  const c = world.ents.cols;
  if (c.alive[i] !== 1) throw new Error(`killEntity: slot ${i} is not alive`);
  const cell = entityCell(c.x[i]!, c.y[i]!);
  const det = world.fields.detritus!;
  const detN = world.fields.detritusN!;
  det[cell]! += c.B[i]! + c.mealC[i]!;
  detN[cell]! += c.N[i]! + c.mealN[i]!;
  const mineral = c.boundMineral[i]! + c.jacketMineral[i]!;
  if (mineral > 0) {
    const grit = world.fields.grit;
    if (!grit) throw new Error('killEntity: mineral present but the silicate system is not enabled');
    grit[cell]! += mineral;
  }
  // Energy is not conserved, but every loss is recorded (CLAUDE.md): what the organism still held
  // dissipates with it. (A captured prey's energy is recorded in contacts.ts.)
  world.ledger.energy.dissipated += c.E[i]!;
  const concurrent = concurrentCauses(world, i, cause);
  const detail: Record<string, number> = { biomass: c.B[i]!, age: c.age[i]! };
  concurrent.forEach((code, k) => (detail[`also${k}`] = code));
  emit(world.events, world.counters, {
    tick: world.tick,
    type: 'death',
    species: c.species[i]!,
    birthId: c.birthId[i]!,
    cell,
    cause,
    detail,
  });
  recordDeath(world.lineage, c.birthId[i]!, world.tick, cause);
  onDeath(world, i);
  const sp = c.species[i]!;
  world.history.pendingDeaths[sp] = (world.history.pendingDeaths[sp] ?? 0) + 1;
  removeAllLinks(world, i); // SPEC §6.8: incident links leave both endpoints
  world.ents.free(i);
}
