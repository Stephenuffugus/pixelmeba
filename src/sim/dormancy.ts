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
 * stays resting until it starves.
 *
 * Resting newborns (Phase 5 wave 10; SPEC §6.9 step 2, §7.2, §7.6; D-0106, D-0108, D-0117): the new
 * daughter of a species with RESTING_DAUGHTER (F04) begins Resting at birth (`startRestingNewborn`, from
 * births.ts) with FLAG.restNewborn, her post-cost half of every pool and fresh clocks; no Preparing, no
 * entry cost, no 'rest' event (the 'birth' event says `resting: 1`). While she is not Active her reason is
 * RESTING_NEWBORN and barriers.ts classOf makes her Small. Her wake test adds `attachable`: her cell must
 * offer one of her surfaces (movement.ts canOccupy), "attachability is part of waking". FLAG.restNewborn
 * clears in the tick she becomes Active (the import refuses it on an Active organism), with the usual
 * lockout. A cell that never offers a surface keeps her resting: nothing rescues her. Clocks live in entity columns (see entities.ts), so saving and
 * reloading never changes a transition.
 *
 * Reasons (SPEC §12.2 States): Preparing/Resting/Waking record PREPARING, RESTING_DRY or
 * RESTING_FOOD_SCARCE, and WAKING as the leading limit. DORMANCY_LOCKOUT (Active during the post-wake
 * lockout) is read from the saved clocks by dormancyReason() and never written to an entity column:
 * every column is part of stateHash, and a label must not change a hash.
 */
import { DT, GRID_H, GRID_W, STRESS_THRESHOLD, USABLE_FOOD_MIN } from './constants';
import { FLAG, LIFE_ACTIVE, LIFE_PREPARING, LIFE_RESTING, LIFE_WAKING, MOVE_NONE, type EntityColumns } from './entities';
import { emit, milestone } from './events';
import { cellIndex } from './grid';
import { canOccupy, preyAllowed } from './movement';
import type { DormancyRules, Profile } from './phenotype';
import { profileOf } from './profiles';
import { R } from './reasons';
import { clearGlow } from './signals';
import { entityCell, forEachInCell } from './spatial';
import type { SpeciesRT } from './species';
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
  /**
   * Resting newborns only (FLAG.restNewborn, not Active; absent for everyone else): her cell offers one
   * of her surfaces (canOccupy), D-0106 "attachability is part of waking".
   */
  readonly attachable?: boolean;
}

/** Whether the species' new daughter begins Resting at birth (native RESTING_DAUGHTER: F04). */
export function restsAtBirth(sp: SpeciesRT): boolean {
  return sp.abilities.includes('RESTING_DAUGHTER');
}

/** Whether organism `i` is a resting newborn: FLAG.restNewborn while not Active (D-0108). */
export function isRestingNewborn(c: EntityColumns, i: number): boolean {
  return (c.flags[i]! & FLAG.restNewborn) !== 0 && c.lifeState[i] !== LIFE_ACTIVE;
}

/** The wake conditions for a resting organism at its current cell (SPEC §7.6; `attachable` for a resting newborn). */
export function wakeConditions(world: World, i: number, prof: Profile, rules: DormancyRules): WakeConditions {
  const c = world.ents.cols;
  const cell = entityCell(c.x[i]!, c.y[i]!);
  const food = usableFoodHere(world, i, prof);
  const moisture = moistureSuitability(world, prof, cell) >= rules.drySuitability;
  // "Suitable environment": the cell is not in the stress band (suitability ≥ 0.10).
  const environment = c.suitability[i]! >= STRESS_THRESHOLD;
  if (!isRestingNewborn(c, i)) return { food, moisture, environment };
  return { food, moisture, environment, attachable: canOccupy(world, world.species[c.species[i]!]!, cell) };
}

function haltMotion(world: World, i: number): void {
  const c = world.ents.cols;
  c.flags[i] = c.flags[i]! & ~(FLAG.moving | FLAG.hunting | FLAG.feeding);
  c.moveMode[i] = MOVE_NONE;
  c.preySlot[i] = -1;
  c.preyBirthId[i] = 0;
}

/** Active: the no-usable-intake clock has reached the profile's trigger (SPEC §7.6). */
function foodTriggerMet(c: EntityColumns, i: number, prof: Profile): boolean {
  return c.stateTimer[i]! >= prof.dormancyTriggerSeconds - EPS;
}

/** Active: the too-dry clock has reached the rule's seconds (SPEC §7.6). */
function dryTriggerMet(c: EntityColumns, i: number, rules: DormancyRules): boolean {
  return c.dryTimer[i]! >= rules.drySeconds - EPS;
}

/**
 * Whether an Active organism would start Preparing now if no lockout were running: a trigger has
 * persisted and it has the entry energy. The same tests, on the same clocks, as dormancyStep's entry.
 */
export function restDue(c: EntityColumns, i: number, prof: Profile, rules: DormancyRules): boolean {
  return (foodTriggerMet(c, i, prof) || dryTriggerMet(c, i, rules)) && c.E[i]! >= rules.entryMinEnergy;
}

/** A dormancy state reason (SPEC §12.2 States) with its measured value. */
export interface DormancyReason {
  code: number;
  /**
   * PREPARING / WAKING: seconds left in the state; RESTING_*: seconds the wake conditions have held;
   * DORMANCY_LOCKOUT: seconds of lockout left; NONE: 0.
   */
  value: number;
  /** DORMANCY_LOCKOUT only: a rest is due now (trigger held, entry energy) and waits for the lockout. */
  restHeld: boolean;
}

/** Why a non-Active organism rests: RESTING_NEWBORN (began Resting at birth), RESTING_DRY or RESTING_FOOD_SCARCE. */
export function restingCause(c: EntityColumns, i: number): number {
  if ((c.flags[i]! & FLAG.restNewborn) !== 0) return R.RESTING_NEWBORN;
  return (c.flags[i]! & FLAG.restDry) !== 0 ? R.RESTING_DRY : R.RESTING_FOOD_SCARCE;
}

function readReason(c: EntityColumns, i: number, prof: Profile, rules: DormancyRules, out: DormancyReason): DormancyReason {
  out.restHeld = false;
  switch (c.lifeState[i]) {
    case LIFE_PREPARING:
      out.code = R.PREPARING;
      out.value = Math.max(0, rules.prepareSeconds - c.stateTimer[i]!);
      break;
    case LIFE_RESTING:
      out.code = restingCause(c, i);
      out.value = c.stateTimer[i]!;
      break;
    case LIFE_WAKING:
      out.code = R.WAKING;
      out.value = Math.max(0, rules.wakeSeconds - c.stateTimer[i]!);
      break;
    default:
      if (c.lockoutTimer[i]! > 0) {
        out.code = R.DORMANCY_LOCKOUT;
        out.value = c.lockoutTimer[i]!;
        out.restHeld = restDue(c, i, prof, rules);
      } else {
        out.code = R.NONE;
        out.value = 0;
      }
  }
  return out;
}

/**
 * The dormancy state reason of organism `i` from its saved clocks (observation only; nothing here is
 * written or read back by the simulation). Organisms that cannot rest have none (NONE). Active
 * organisms in the post-wake lockout read DORMANCY_LOCKOUT with the lockout seconds left, and
 * `restHeld` says whether the lockout is what keeps a due rest from starting right now.
 */
export function dormancyReason(world: World, i: number, prof: Profile = profileOf(world, i)): DormancyReason {
  const out: DormancyReason = { code: R.NONE, value: 0, restHeld: false };
  const rules = prof.dormancy;
  return rules === null ? out : readReason(world.ents.cols, i, prof, rules, out);
}

const scratchReason: DormancyReason = { code: R.NONE, value: 0, restHeld: false };

/** Record the inspector's leading state for a non-Active organism (observation only). */
function stateReason(world: World, i: number, prof: Profile, rules: DormancyRules): void {
  const c = world.ents.cols;
  const r = readReason(c, i, prof, rules, scratchReason);
  c.limitCode[i] = r.code;
  c.limitValue[i] = r.value;
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
      const foodTrigger = foodTriggerMet(c, i, prof);
      const dryTrigger = dryTriggerMet(c, i, rules);
      if (!foodTrigger && !dryTrigger) return;
      if (c.E[i]! < rules.entryMinEnergy) return;
      c.E[i]! -= rules.prepareCost;
      EL.dormancy += rules.prepareCost;
      c.lifeState[i] = LIFE_PREPARING;
      // Phase 5 (D-0106, D-0108): glow is off in every non-Active state, from this very tick (signals.ts).
      if (prof.glow !== null) clearGlow(world, i, 'rest');
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
      // A resting newborn also needs a surface to hold (`attachable` is absent for everyone else).
      const ok = w.food && w.moisture && w.environment && w.attachable !== false;
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
        // A resting newborn is an ordinary Active organism from this tick on (D-0108: never flagged while Active).
        c.flags[i] = c.flags[i]! & ~(FLAG.restDry | FLAG.restNewborn);
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
  if (c.lifeState[i] !== LIFE_ACTIVE) stateReason(world, i, prof, rules);
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

/**
 * Births (births.ts commitDivision, after the reconciliation that reset both daughters' clocks): the new
 * daughter `slot` of a RESTING_DAUGHTER parent begins Resting with fresh clocks and FLAG.restNewborn,
 * keeping the pools the split gave her (no gift, no cost). Her reason is RESTING_NEWBORN from this tick, so
 * the inspector never shows a food or dry rest she never entered. She is never attached and never linked
 * (births.ts skips the branch link).
 */
export function startRestingNewborn(world: World, slot: number): void {
  const c = world.ents.cols;
  const prof = profileOf(world, slot);
  const rules = prof.dormancy;
  if (rules === null) throw new Error(`organism ${c.birthId[slot]!} begins Resting at birth without a resting ability`);
  c.lifeState[slot] = LIFE_RESTING;
  c.stateTimer[slot] = 0;
  c.dryTimer[slot] = 0;
  c.lockoutTimer[slot] = 0;
  c.flags[slot] = (c.flags[slot]! | FLAG.restNewborn) & ~(FLAG.restDry | FLAG.attached);
  haltMotion(world, slot);
  stateReason(world, slot, prof, rules);
}
