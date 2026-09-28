/**
 * Dormancy state machine (SPEC §7.6, CT §12.7) for native resters and E03 carriers (P2.1).
 * Runs in stage 8 as the first, mandatory transition of each organism, before any optional action.
 *
 *   Active    — a trigger must persist (no usable intake — under 1 % of its intake ceiling in a
 *               tick — for the profile's trigger seconds, or
 *               moisture suitability < 0.20 for 10 s), the 30 s lockout after waking must be over,
 *               and E ≥ 15. Entering Preparing pays 10 E once (ledger: energy.dormancy).
 *   Preparing — 5 s; no feeding, movement, reproduction or secretion; ordinary costs and stress.
 *               Death cancels it; nothing is refunded.
 *   Resting   — no intake, photosynthesis, movement, secretion or division; maintenance 0.01 E/s
 *               replaces every other upkeep (stage 7); stress and inhibitor damage × 0.10;
 *               starvation damage unchanged; still prey. Wakes when suitable moisture, a suitable
 *               environment and usable food have persisted 10 s and E ≥ 5, paying 5 E once.
 *   Waking    — 5 s; no feeding or reproduction; ordinary damage. Then Active with a 30 s lockout.
 * Age continues in every state. Nothing grants energy: a resting organism without waking energy
 * stays resting until it starves. Clocks live in entity columns (see entities.ts), so saving and
 * reloading never changes a transition.
 */
import { DT, GRID_H, GRID_W, STRESS_THRESHOLD, USABLE_FOOD_MIN } from './constants';
import { FLAG, LIFE_ACTIVE, LIFE_PREPARING, LIFE_RESTING, LIFE_WAKING, MOVE_NONE } from './entities';
import { emit, milestone } from './events';
import { cellIndex } from './grid';
import { preyAllowed } from './movement';
import type { DormancyRules, Profile } from './phenotype';
import { R } from './reasons';
import { entityCell, forEachInCell } from './spatial';
import { responseBelowOnly, SHOULDER_MOISTURE } from './suitability';
import type { World } from './world';

/** Timer comparisons tolerate float accumulation of dt (0.1 is not exact in binary). */
const EPS = 1e-9;

/** Moisture suitability at a cell (SPEC §6.3: below-only shoulder 0.2). */
export function moistureSuitability(world: World, prof: Profile, cell: number): number {
  return responseBelowOnly(world.derived.moisture[cell]!, prof.moisture[0], SHOULDER_MOISTURE);
}

/**
 * Whether usable food for this organism is present right now: a held meal; light and CO2 for a
 * photosynthesizer; one of its recorded foods in its cell with a nonzero inherited weight; or, for a
 * predator, compatible prey in its cell or a neighboring cell. Pools count from USABLE_FOOD_MIN, so
 * vanishing diffusion tails are not food.
 */
export function usableFoodHere(world: World, i: number, prof: Profile): boolean {
  const c = world.ents.cols;
  const sp = world.species[c.species[i]!]!;
  if (c.mealC[i]! >= USABLE_FOOD_MIN) return true;
  const cell = entityCell(c.x[i]!, c.y[i]!);
  if (sp.photosynthetic) {
    const co2 = world.fields.co2;
    if (world.derived.light[cell]! > 0 && co2 !== undefined && co2[cell]! >= USABLE_FOOD_MIN) return true;
  }
  const foods = prof.foods;
  for (let k = 0; k < foods.length; k++) {
    if (prof.weights !== null && !(prof.weights[k]! > 0)) continue;
    const f = world.fields[foods[k]!];
    if (f !== undefined && f[cell]! >= USABLE_FOOD_MIN) return true;
  }
  if (sp.isPredator) {
    const cx = Math.floor(c.x[i]!);
    const cy = Math.floor(c.y[i]!);
    let found = false;
    for (let y = Math.max(0, cy - 1); y <= Math.min(GRID_H - 1, cy + 1) && !found; y++) {
      for (let x = Math.max(0, cx - 1); x <= Math.min(GRID_W - 1, cx + 1) && !found; x++) {
        forEachInCell(world, cellIndex(x, y), (s) => {
          if (!found && s !== i && c.alive[s] === 1 && preyAllowed(world, sp, s)) found = true;
        });
      }
    }
    if (found) return true;
  }
  return false;
}

export interface WakeConditions {
  readonly food: boolean;
  readonly moisture: boolean;
  readonly environment: boolean;
}

/** The three wake conditions for a resting organism at its current cell (SPEC §7.6). */
export function wakeConditions(world: World, i: number, prof: Profile, rules: DormancyRules): WakeConditions {
  const c = world.ents.cols;
  const cell = entityCell(c.x[i]!, c.y[i]!);
  return {
    food: usableFoodHere(world, i, prof),
    moisture: moistureSuitability(world, prof, cell) >= rules.drySuitability,
    // "Suitable environment": the cell is not in the stress band (suitability ≥ 0.10).
    environment: c.suitability[i]! >= STRESS_THRESHOLD,
  };
}

function haltMotion(world: World, i: number): void {
  const c = world.ents.cols;
  c.flags[i] = c.flags[i]! & ~(FLAG.moving | FLAG.hunting | FLAG.feeding);
  c.moveMode[i] = MOVE_NONE;
  c.preySlot[i] = -1;
  c.preyBirthId[i] = 0;
}

/** Record the inspector's leading state for a non-Active organism (observation only). */
function stateReason(world: World, i: number, rules: DormancyRules): void {
  const c = world.ents.cols;
  switch (c.lifeState[i]) {
    case LIFE_PREPARING:
      c.limitCode[i] = R.PREPARING;
      c.limitValue[i] = Math.max(0, rules.prepareSeconds - c.stateTimer[i]!);
      break;
    case LIFE_RESTING:
      c.limitCode[i] = (c.flags[i]! & FLAG.restDry) !== 0 ? R.RESTING_DRY : R.RESTING_FOOD_SCARCE;
      c.limitValue[i] = c.stateTimer[i]!;
      break;
    case LIFE_WAKING:
      c.limitCode[i] = R.WAKING;
      c.limitValue[i] = Math.max(0, rules.wakeSeconds - c.stateTimer[i]!);
      break;
  }
}

/**
 * One tick of the state machine for organism `i` (stage 8, after maintenance). Organisms that cannot
 * rest are untouched and always Active.
 */
export function dormancyStep(world: World, i: number, prof: Profile): void {
  const c = world.ents.cols;
  const rules = prof.dormancy;
  if (rules === null) {
    if (c.lifeState[i] !== LIFE_ACTIVE) throw new Error(`organism ${c.birthId[i]!} is in life state ${c.lifeState[i]!} without a resting ability`);
    return;
  }
  const EL = world.ledger.energy;
  switch (c.lifeState[i]) {
    case LIFE_ACTIVE: {
      if (c.lockoutTimer[i]! > 0) {
        const left = c.lockoutTimer[i]! - DT;
        c.lockoutTimer[i] = left > EPS ? left : 0;
      }
      // Trigger clocks: seconds without usable intake, seconds too dry. Both keep counting during the
      // lockout; the lockout only postpones the attempt.
      c.stateTimer[i] = (c.flags[i]! & FLAG.usableIntake) !== 0 ? 0 : c.stateTimer[i]! + DT;
      const cell = entityCell(c.x[i]!, c.y[i]!);
      c.dryTimer[i] = moistureSuitability(world, prof, cell) < rules.drySuitability ? c.dryTimer[i]! + DT : 0;
      if (c.lockoutTimer[i]! > 0) return;
      const foodTrigger = c.stateTimer[i] >= prof.dormancyTriggerSeconds - EPS;
      const dryTrigger = c.dryTimer[i] >= rules.drySeconds - EPS;
      if (!foodTrigger && !dryTrigger) return;
      if (c.E[i]! < rules.entryMinEnergy) return;
      c.E[i]! -= rules.prepareCost;
      EL.dormancy += rules.prepareCost;
      c.lifeState[i] = LIFE_PREPARING;
      c.stateTimer[i] = 0;
      c.dryTimer[i] = 0;
      c.flags[i] = dryTrigger ? c.flags[i]! | FLAG.restDry : c.flags[i]! & ~FLAG.restDry;
      haltMotion(world, i);
      break;
    }
    case LIFE_PREPARING: {
      c.stateTimer[i]! += DT;
      if (c.stateTimer[i]! >= rules.prepareSeconds - EPS) {
        c.lifeState[i] = LIFE_RESTING;
        c.stateTimer[i] = 0;
        const dry = (c.flags[i]! & FLAG.restDry) !== 0;
        emit(world.events, world.counters, {
          tick: world.tick,
          type: 'rest',
          species: c.species[i]!,
          birthId: c.birthId[i]!,
          cell: entityCell(c.x[i]!, c.y[i]!),
          cause: dry ? R.RESTING_DRY : R.RESTING_FOOD_SCARCE,
        });
        milestone(world.events, 'firstRest', world.tick);
      }
      break;
    }
    case LIFE_RESTING: {
      const w = wakeConditions(world, i, prof, rules);
      const ok = w.food && w.moisture && w.environment;
      c.stateTimer[i] = ok ? Math.min(rules.wakeConditionSeconds, c.stateTimer[i]! + DT) : 0;
      if (ok && c.stateTimer[i] >= rules.wakeConditionSeconds - EPS && c.E[i]! >= rules.wakeMinEnergy) {
        c.E[i]! -= rules.wakeCost;
        EL.dormancy += rules.wakeCost;
        c.lifeState[i] = LIFE_WAKING;
        c.stateTimer[i] = 0;
      }
      break;
    }
    case LIFE_WAKING: {
      c.stateTimer[i]! += DT;
      if (c.stateTimer[i]! >= rules.wakeSeconds - EPS) {
        c.lifeState[i] = LIFE_ACTIVE;
        c.stateTimer[i] = 0;
        c.dryTimer[i] = 0;
        c.lockoutTimer[i] = rules.lockoutSeconds;
        c.flags[i] = c.flags[i]! & ~FLAG.restDry;
        emit(world.events, world.counters, {
          tick: world.tick,
          type: 'wake',
          species: c.species[i]!,
          birthId: c.birthId[i]!,
          cell: entityCell(c.x[i]!, c.y[i]!),
        });
        milestone(world.events, 'firstWake', world.tick);
      }
      break;
    }
    default:
      throw new Error(`organism ${c.birthId[i]!} has unknown life state ${c.lifeState[i]!}`);
  }
  if (c.lifeState[i] !== LIFE_ACTIVE) stateReason(world, i, rules);
}

/** Reset an organism's dormancy clocks (a new individual starts Active with no lockout). */
export function resetDormancy(world: World, i: number): void {
  const c = world.ents.cols;
  c.lifeState[i] = LIFE_ACTIVE;
  c.stateTimer[i] = 0;
  c.lockoutTimer[i] = 0;
  c.dryTimer[i] = 0;
  c.flags[i] = c.flags[i]! & ~FLAG.restDry;
}
