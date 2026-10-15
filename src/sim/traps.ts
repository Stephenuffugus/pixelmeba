/**
 * F03 Traplace's trap (Phase 5 wave 13, P5.5 E3-TRAPS; SPEC §7.17, §3.2 rows 5–8, §3.4, §6.5, §6.8, §10.5;
 * CT §3.3, §12.3, §12.5; D02 391–393, 774; D-0106, D-0108, D-0124).
 *
 * A trap is the (slot, birthId) reference pair `owner.trapSlot/trapBirthId` ↔ `target.heldBySlot/heldByBirthId`
 * (schema 5 columns, −1/0 when empty), the owner's reserve `trapReserveC/trapReserveN` (carbon and nutrient
 * the owner moved out of its own body to build the trap: an accounted compartment, SPEC §3.4), the seconds the
 * current target has been held (`trapTimer`) and the cooldown seconds left (`trapCooldown`). Its state is
 * derived from those columns, as protocol 3's cue3Of derives it (no "armed" column):
 *   none     trapReserveC === 0 (never built)
 *   armed    trapReserveC > 0, trapSlot < 0, trapCooldown === 0
 *   holding  trapSlot ≥ 0 with a valid reference (mutual with the target's heldBySlot/heldByBirthId)
 *   cooldown trapCooldown > 0 (never while holding)
 *
 * Transitions (each in one place):
 *   none → armed      stage 8, `trapArmRun` (native action TRAP, id 7, Active owners only): E ≥ 50, B ≥ 1.3 B0' and
 *                     B − 0.20 ≥ B0' (all inclusive) → 0.20 C and N × 0.20 / B move body → reserve, 8 E under
 *                     'construction', one 'trapArmed'. Built once: the reserve persists between captures.
 *   armed → holding   stage 5, `trapCaptures` (contacts.ts, after predation, before parasite attachment): the
 *                     nearest Active, not-held TRAP_TARGETS organism whose centre is in the owner's own cell
 *                     (ties to the lower birthId); one winner per target by det(seed, 'contact', tick, KIND_TRAP,
 *                     owner birthId), then the lower birthId; commits in ascending owner slot; one 'trapHold'.
 *   holding           stage 6, `reserveTrapDrains` / `commitTrapDrains` (intake.ts, beside the host drains): the
 *                     host-drain rules with the owner as the drainer; a holding owner requests no broth.
 *   holding → cooldown stage 8, `trapStep` (structures.ts, after the mineral pass): trapTimer += DT; at ≥ 8 s the pair
 *                     is cleared, trapTimer 0, trapCooldown 30, one 'trapRelease' why 'timer'.
 *                     stage 7 (maintenance.ts): a held target below 0.25 × B0' dies (DEATH_TRAP_DRAIN); killEntity's
 *                     `releaseTrapOnRemoval` clears the pair and starts the cooldown ('targetDied').
 *                     any removal of an end (killEntity, consumePrey): `releaseTrapOnRemoval`.
 *   cooldown → armed  stage 8, `trapStep`: trapCooldown −= DT, snapped to 0 at ≤ 1e-9.
 *   any → (gone)      the owner's death or capture: the reserve goes to detritus in its cell (SPEC §6.8) and a held
 *                     target is released alive in place ('ownerDied' / 'removed').
 *
 * Gate: every function returns at once in a world whose recorded species include no TRAP species (a WeakMap on
 * the world's species array, the climate.ts canopySpecies pattern), so such a world never reads a trap column in
 * any stage. No stream is added: the capture priority uses the shared 'contact' stream with KIND_TRAP = 5
 * (contacts.ts reserved it), keyed by birthId, never by a species index.
 */
import {
  AGENT_CAP,
  BIOMASS_FRACTION,
  CO2_FRACTION,
  DT,
  METABOLITE_FRACTION,
  NUTRIENT_PER_CARBON,
  TRAP_ARM_ENERGY,
  TRAP_ARM_MIN_BODY_MULTIPLE,
  TRAP_ARM_MIN_ENERGY,
  TRAP_COOLDOWN_SECONDS,
  TRAP_HOLD_SECONDS,
  TRAP_RESERVE_C,
  TRAP_TARGET_DEATH_FRACTION,
  USABLE_INTAKE_FRACTION,
} from './constants';
import { FLAG, LIFE_ACTIVE } from './entities';
import { emit } from './events';
import type { ActionContext, Stage8Action } from './actions';
import { subtractPool } from './ledger';
import { profileOf } from './profiles';
import { R } from './reasons';
import { det, STREAMS } from './rng';
import { entityCell, forEachInCell } from './spatial';
import { markField } from './transport';
import type { World } from './world';

/** CT §3.3 "F03 Traplace | traps P04 only", by ancestor id (the rivalry.ts RIVAL_TARGETS precedent; D-0124). */
export const TRAP_TARGETS: readonly string[] = ['P04'];

/** Stage 5 contact kind for trap capture on the shared 'contact' stream (contacts.ts list; never renumber). */
export const KIND_TRAP = 5;

/** Timer comparisons tolerate float accumulation of dt (the dormancy.ts / signals.ts EPS). */
const EPS = 1e-9;

/** Why a hold ended ('trapRelease' detail.why). */
export type TrapReleaseWhy = 'timer' | 'targetDied' | 'ownerDied' | 'removed';

// ------------------------------------------------------------------------------------- gates

// eslint-disable-next-line no-restricted-syntax -- lookup only, never iterated (a WeakMap cannot be)
const trapFlags = new WeakMap<object, Uint8Array | null>();
// eslint-disable-next-line no-restricted-syntax -- lookup only, never iterated (a WeakMap cannot be)
const targetFlags = new WeakMap<object, Uint8Array | null>();

/** 1 per species index with the TRAP ability, or null when the world records none. */
export function trapSpeciesOf(world: Pick<World, 'species'>): Uint8Array | null {
  let f = trapFlags.get(world.species);
  if (f === undefined) {
    const flags = Uint8Array.from(world.species, (sp) => (sp.abilities.includes('TRAP') ? 1 : 0));
    f = flags.includes(1) ? flags : null;
    trapFlags.set(world.species, f);
  }
  return f;
}

/** 1 per species index whose ancestor id is a trap target (TRAP_TARGETS), or null when none is recorded. */
export function trapTargetsOf(world: Pick<World, 'species'>): Uint8Array | null {
  let f = targetFlags.get(world.species);
  if (f === undefined) {
    const flags = Uint8Array.from(world.species, (sp) => (TRAP_TARGETS.includes(sp.id) ? 1 : 0));
    f = flags.includes(1) ? flags : null;
    targetFlags.set(world.species, f);
  }
  return f;
}

/** Whether the world's recorded species include a TRAP species (every trap rule is off otherwise). */
export function worldHasTraps(world: Pick<World, 'species'>): boolean {
  return trapSpeciesOf(world) !== null;
}

// ------------------------------------------------------------------------------------- references

/** The living target owner `i` holds (a valid reference), or −1. */
export function trapTargetOf(world: World, i: number): number {
  const c = world.ents.cols;
  const t = c.trapSlot[i]!;
  return t >= 0 && world.ents.refValid(t, c.trapBirthId[i]!) ? t : -1;
}

/** The living trap owner holding `i` (a valid reference), or −1. */
export function trapHolderOf(world: World, i: number): number {
  const c = world.ents.cols;
  const h = c.heldBySlot[i]!;
  return h >= 0 && world.ents.refValid(h, c.heldByBirthId[i]!) ? h : -1;
}

/** Whether owner `i` holds a valid target (the "draining" test of stage 6: SPEC §6.5 broth skip; D-0124). */
export function trapHoldsTarget(world: World, i: number): boolean {
  return trapTargetOf(world, i) >= 0;
}

function clearOwnerRefs(world: World, owner: number): void {
  const c = world.ents.cols;
  c.trapSlot[owner] = -1;
  c.trapBirthId[owner] = 0;
}

function clearHeldRefs(world: World, target: number): void {
  const c = world.ents.cols;
  c.heldBySlot[target] = -1;
  c.heldByBirthId[target] = 0;
}

/** Hold seconds to the tick (the timer accumulates DT in binary floating point). */
function heldSeconds(timer: number): number {
  return Math.round(timer / DT) * DT;
}

function emitRelease(world: World, owner: number, targetBirth: number, why: TrapReleaseWhy, seconds: number): void {
  const c = world.ents.cols;
  emit(world.events, world.counters, {
    tick: world.tick,
    type: 'trapRelease',
    species: c.species[owner]!,
    birthId: c.birthId[owner]!,
    cell: entityCell(c.x[owner]!, c.y[owner]!),
    detail: { target: targetBirth, why, seconds },
  });
}

/**
 * The tick at which each slot's hold last ended (a scratch keyed by the world object, never iterated, never
 * saved): a cooldown started in a tick, whatever stage ended the hold, first counts down at the next tick's
 * stage 8, so every release is followed by exactly 300 ticks without a capture. Every release of a tick happens
 * before that tick's trapStep, and a save is taken only between ticks, so a reloaded world needs no copy of it.
 */
// eslint-disable-next-line no-restricted-syntax -- lookup only, never iterated (a WeakMap cannot be)
const releaseTickByWorld = new WeakMap<World, Float64Array>();

function markReleased(world: World, owner: number): void {
  let r = releaseTickByWorld.get(world);
  if (r === undefined || r.length !== world.ents.capacity) {
    r = new Float64Array(world.ents.capacity).fill(-1);
    releaseTickByWorld.set(world, r);
  }
  r[owner] = world.tick;
}

function releasedThisTick(world: World, owner: number): boolean {
  const r = releaseTickByWorld.get(world);
  return r !== undefined && r[owner] === world.tick;
}

/**
 * End a hold whose owner stays (timer, target death, target removed): both references cleared together with
 * their birthIds, trapTimer 0, the 30 s cooldown started (every end of a hold, D-0124), one 'trapRelease'.
 */
function endHold(world: World, owner: number, target: number, why: TrapReleaseWhy): void {
  const c = world.ents.cols;
  markReleased(world, owner);
  const seconds = heldSeconds(c.trapTimer[owner]!);
  const targetBirth = c.trapBirthId[owner]!;
  clearOwnerRefs(world, owner);
  if (target >= 0 && c.heldBySlot[target] === owner) clearHeldRefs(world, target);
  c.trapTimer[owner] = 0;
  c.trapCooldown[owner] = TRAP_COOLDOWN_SECONDS;
  emitRelease(world, owner, targetBirth, why, seconds);
}

/**
 * Before organism `i` leaves the dish (maintenance.ts killEntity: `removed` false; contacts.ts consumePrey:
 * `removed` true), with `i` still alive and in place. If `i` holds a target, the target is released alive where it
 * is ('ownerDied' / 'removed'); its reserve goes to detritus in its cell, held or not (SPEC §6.8 "trap reserve →
 * detritus": an internal move, never an input or export). If `i` is held, its trap is freed and starts its
 * cooldown ('targetDied' / 'removed'). Returns at once in a world without a TRAP species.
 */
export function releaseTrapOnRemoval(world: World, i: number, removed: boolean): void {
  if (trapSpeciesOf(world) === null) return;
  const c = world.ents.cols;
  if (c.trapSlot[i]! >= 0) {
    const t = trapTargetOf(world, i);
    const targetBirth = c.trapBirthId[i]!;
    const seconds = heldSeconds(c.trapTimer[i]!);
    if (t >= 0 && c.heldBySlot[t] === i) clearHeldRefs(world, t);
    clearOwnerRefs(world, i);
    c.trapTimer[i] = 0;
    emitRelease(world, i, targetBirth, removed ? 'removed' : 'ownerDied', seconds);
  }
  const rc = c.trapReserveC[i]!;
  const rn = c.trapReserveN[i]!;
  if (rc > 0 || rn > 0) {
    const cell = entityCell(c.x[i]!, c.y[i]!);
    world.fields.detritus![cell]! += rc;
    world.fields.detritusN![cell]! += rn;
    c.trapReserveC[i] = 0;
    c.trapReserveN[i] = 0;
    markField(world, 'detritus');
  }
  if (c.heldBySlot[i]! >= 0) {
    const h = trapHolderOf(world, i);
    if (h >= 0 && c.trapSlot[h] === i) endHold(world, h, i, removed ? 'removed' : 'targetDied');
    clearHeldRefs(world, i);
  }
}

// ------------------------------------------------------------------------------------- stage 8: arm

/** The organism's species has TRAP and has not built its trap yet (one trap per owner, built once). */
export const trapApplies: Stage8Action['applies'] = (_prof, world, i) => {
  const t = trapSpeciesOf(world);
  if (t === null) return false;
  const c = world.ents.cols;
  return t[c.species[i]!] === 1 && c.trapReserveC[i] === 0;
};

/**
 * Build the trap (SPEC §7.17): with E ≥ 50, B ≥ 1.3 × B0' and B − 0.20 ≥ B0' (all inclusive, on what remains for
 * this action this tick), move exactly 0.20 C and N × 0.20 / B (B, N now) from the body into the reserve and spend
 * 8 E under 'construction'. Commits at once (the reserve is not a cell pool: no shared headroom).
 */
export const trapArmRun: Stage8Action['run'] = (ctx: ActionContext) => {
  const world = ctx.world;
  const i = ctx.i;
  const b0 = ctx.profile.b0;
  if (ctx.remainingEnergy() < TRAP_ARM_MIN_ENERGY) return R.ENERGY_LOW;
  const body = ctx.remainingBody();
  if (body < TRAP_ARM_MIN_BODY_MULTIPLE * b0 || body - TRAP_RESERVE_C < b0) return R.NONE;
  const c = world.ents.cols;
  const B = c.B[i]!;
  const moveN = (c.N[i]! * TRAP_RESERVE_C) / B;
  c.B[i] = B - TRAP_RESERVE_C;
  c.N[i] = c.N[i]! - moveN;
  c.trapReserveC[i] = TRAP_RESERVE_C;
  c.trapReserveN[i] = moveN;
  ctx.spend(TRAP_ARM_ENERGY, 'construction');
  emit(world.events, world.counters, {
    tick: world.tick,
    type: 'trapArmed',
    species: c.species[i]!,
    birthId: c.birthId[i]!,
    cell: entityCell(c.x[i]!, c.y[i]!),
    amount: TRAP_RESERVE_C,
    detail: { reserveN: moveN, energy: TRAP_ARM_ENERGY },
  });
  return R.NONE;
};

// ------------------------------------------------------------------------------------- stage 5: capture

const claimOf = new Int32Array(AGENT_CAP);
const bestClaimant = new Int32Array(AGENT_CAP);
const bestPriority = new Float64Array(AGENT_CAP);

/** Whether `s` may be caught by owner `i`: alive, Active, a trap target, not held, not the owner. */
function catchable(world: World, targets: Uint8Array, i: number, s: number): boolean {
  const c = world.ents.cols;
  return s !== i && c.alive[s] === 1 && c.lifeState[s] === LIFE_ACTIVE && targets[c.species[s]!] === 1 && c.heldBySlot[s] === -1;
}

/**
 * Stage 5 trap capture (contacts.ts stageContacts, after predation and before parasite attachment; SPEC §3.2 row
 * 5). Every living, Active owner with an armed trap claims the nearest catchable target whose centre lies in its
 * own cell ("entering its cell": no edge can lie between them), ties to the lower birthId. A target claimed by
 * several owners goes to the highest det(seed, 'contact', tick, KIND_TRAP, owner birthId), then the lower birthId.
 * Trap claims keep their own pool: a hold removes nothing, so it cannot collide with a predation award. Commits
 * in ascending owner slot: the pair, trapTimer 0, one 'trapHold'. The target is not moved, not killed, keeps its
 * meal and its own prey claim (a held P04 may still make contact captures, D-0106).
 */
export function trapCaptures(world: World): void {
  const traps = trapSpeciesOf(world);
  if (traps === null) return;
  const targets = trapTargetsOf(world);
  if (targets === null) return;
  const e = world.ents;
  const c = e.cols;
  const hw = e.highWater;
  let any = false;
  for (let i = 0; i < hw; i++) {
    claimOf[i] = -1;
    bestClaimant[i] = -1;
  }
  for (let i = 0; i < hw; i++) {
    if (c.alive[i] !== 1 || c.lifeState[i] !== LIFE_ACTIVE || traps[c.species[i]!] !== 1) continue;
    if (!(c.trapReserveC[i]! > 0) || c.trapSlot[i]! >= 0 || c.trapCooldown[i] !== 0) continue; // armed only
    const px = c.x[i]!;
    const py = c.y[i]!;
    const cell = entityCell(px, py);
    let best = -1;
    let bestD = Infinity;
    let bestBirth = Infinity;
    forEachInCell(world, cell, (s) => {
      if (!catchable(world, targets, i, s)) return;
      if (entityCell(c.x[s]!, c.y[s]!) !== cell) return;
      const d = (c.x[s]! - px) ** 2 + (c.y[s]! - py) ** 2;
      const b = c.birthId[s]!;
      if (d < bestD || (d === bestD && b < bestBirth)) {
        best = s;
        bestD = d;
        bestBirth = b;
      }
    });
    if (best < 0) continue;
    claimOf[i] = best;
    any = true;
    const pri = det(world.seed, STREAMS.contact, world.tick, KIND_TRAP, c.birthId[i]!);
    const cur = bestClaimant[best]!;
    if (cur < 0 || pri > bestPriority[best]! || (pri === bestPriority[best]! && c.birthId[i]! < c.birthId[cur]!)) {
      bestClaimant[best] = i;
      bestPriority[best] = pri;
    }
  }
  if (!any) return;
  for (let i = 0; i < hw; i++) {
    const t = claimOf[i]!;
    if (t < 0 || bestClaimant[t] !== i) continue;
    c.trapSlot[i] = t;
    c.trapBirthId[i] = c.birthId[t]!;
    c.heldBySlot[t] = i;
    c.heldByBirthId[t] = c.birthId[i]!;
    c.trapTimer[i] = 0;
    emit(world.events, world.counters, {
      tick: world.tick,
      type: 'trapHold',
      species: c.species[i]!,
      birthId: c.birthId[i]!,
      cell: entityCell(c.x[i]!, c.y[i]!),
      cause: R.HELD_IN_TRAP,
      detail: { target: c.birthId[t]!, targetSpecies: c.species[t]! },
    });
  }
}

// ------------------------------------------------------------------------------------- stage 6: drain

const drainC = new Float64Array(AGENT_CAP);
const drainSurplusN = new Float64Array(AGENT_CAP);
const drainCell = new Int32Array(AGENT_CAP);
const drained: number[] = [];

/**
 * Stage 6, before ordinary requests (intake.ts, right after reserveHostDrains): every holding owner with both ends
 * Active reserves its drain from the held target, exactly as parasites.ts reserveHostDrains (SPEC §6.5 lists F03
 * among the host drains; D02 392 "the same resource split as X02"): C = min(drainRate × dt, target B), bound N =
 * target N × C / target B, the owner's 0.05 N per C from bound N then the cell's free nutrient (a shortage scales
 * the whole drain), taken from the target and the cell now.
 */
export function reserveTrapDrains(world: World): void {
  drained.length = 0;
  const traps = trapSpeciesOf(world);
  if (traps === null) return;
  const c = world.ents.cols;
  const nutrient = world.fields.nutrient!;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1 || traps[c.species[i]!] !== 1 || c.trapSlot[i]! < 0) continue;
    const t = trapTargetOf(world, i);
    if (t < 0 || c.lifeState[t] !== LIFE_ACTIVE || c.lifeState[i] !== LIFE_ACTIVE) continue;
    const sp = world.species[c.species[i]!]!;
    const tB = c.B[t]!;
    if (!(tB > 0)) continue;
    let C = Math.min(sp.def.drainRate * DT, tB);
    let bound = (c.N[t]! * C) / tB;
    const cell = entityCell(c.x[t]!, c.y[t]!);
    const need = Math.max(0, NUTRIENT_PER_CARBON * C - bound);
    let free = 0;
    if (need > 0) {
      const got = Math.min(need, nutrient[cell]!);
      const L = got / need;
      C *= L;
      bound *= L;
      free = got;
    }
    if (C <= 0) continue;
    subtractPool(world, c.B, t, C, 'c');
    subtractPool(world, c.N, t, bound, 'n');
    if (free > 0) subtractPool(world, nutrient, cell, free, 'n');
    drainC[i] = C;
    drainSurplusN[i] = bound + free - NUTRIENT_PER_CARBON * C;
    drainCell[i] = cell;
    drained.push(i);
  }
}

/**
 * Stage 6, after the ordinary commit (intake.ts, right after commitHostDrains): 50 % of C → owner B, 30 % → cell
 * CO2, 20 % → cell metabolite (the target's cell), + 0.05 N per C to the owner, + energyPerCarbon × C energy
 * (capped, the excess dissipated with its record), no oxygen, surplus bound N to the cell's free nutrient; the
 * owner's intake clock, feeding flags and limit (NONE, 1) as for any drain.
 */
export function commitTrapDrains(world: World): void {
  if (drained.length === 0) return;
  const c = world.ents.cols;
  const co2 = world.fields.co2!;
  const metabolite = world.fields.metabolite!;
  const nutrient = world.fields.nutrient!;
  const EL = world.ledger.energy;
  for (let k = 0; k < drained.length; k++) {
    const i = drained[k]!;
    const C = drainC[i]!;
    const cell = drainCell[i]!;
    const sp = world.species[c.species[i]!]!;
    const prof = profileOf(world, i);
    c.B[i]! += BIOMASS_FRACTION * C;
    co2[cell]! += CO2_FRACTION * C;
    metabolite[cell]! += METABOLITE_FRACTION * C;
    c.N[i]! += NUTRIENT_PER_CARBON * C;
    const surplus = drainSurplusN[i]!;
    if (surplus > 0) nutrient[cell]! += surplus;
    const gain = sp.def.energyPerCarbon * C;
    EL.earned += gain;
    const E = c.E[i]! + gain;
    if (E > prof.energyCap) {
      EL.dissipated += E - prof.energyCap;
      c.E[i] = prof.energyCap;
    } else c.E[i] = E;
    c.lastIntakeTick[i] = world.tick;
    c.intakeAccum[i]! += C;
    c.flags[i] = c.flags[i]! | FLAG.feeding;
    if (C >= USABLE_INTAKE_FRACTION * sp.def.drainRate * DT) c.flags[i] = c.flags[i] | FLAG.usableIntake;
    c.limitCode[i] = R.NONE;
    c.limitValue[i] = 1;
  }
  drained.length = 0;
  markField(world, 'co2');
  markField(world, 'metabolite');
  markField(world, 'nutrient');
}

// ------------------------------------------------------------------------------------- stage 7

/**
 * Stage 7 (maintenance.ts, after the parasite drain death): whether held organism `i` dies of the drain now — it
 * is held by a valid trap and B < 0.25 × its B0' (strict; SPEC §7.17 "target below 0.25 B0' dies normally").
 * The caller gates on worldHasTraps.
 */
export function trapDrainDeathDue(world: World, i: number): boolean {
  const c = world.ents.cols;
  if (c.heldBySlot[i]! < 0 || trapHolderOf(world, i) < 0) return false;
  return c.B[i]! < TRAP_TARGET_DEATH_FRACTION * profileOf(world, i).b0;
}

// ------------------------------------------------------------------------------------- stage 8: hold and cooldown

/**
 * Stage 8 trap step (structures.ts stageStructures, after the shared construction and E11 mineral passes and
 * before the F02 transport pass; SPEC §3.2 row 8). For each living owner in ascending slot: holding → trapTimer +=
 * DT, and at ≥ 8 s − EPS the release ('timer'): pair cleared, trapTimer 0, trapCooldown 30; otherwise a cooldown
 * counts down by DT, snapped to 0 at ≤ EPS. A cooldown started in this tick (by this release, or earlier in the
 * tick by a target's death or removal) first counts down at the next tick, so 30 s = 300 ticks without a capture
 * follow every release: released at tick T, catching again from stage 5 of T + 301.
 */
export function trapStep(world: World): void {
  const traps = trapSpeciesOf(world);
  if (traps === null) return;
  const c = world.ents.cols;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1 || traps[c.species[i]!] !== 1) continue;
    if (c.trapSlot[i]! >= 0) {
      const t = trapTargetOf(world, i);
      if (t < 0 || c.heldBySlot[t] !== i) {
        // Defensive: every removal passes releaseTrapOnRemoval, so a stale pair is unreachable.
        endHold(world, i, t, 'targetDied');
        continue;
      }
      const timer = c.trapTimer[i]! + DT;
      c.trapTimer[i] = timer;
      if (timer >= TRAP_HOLD_SECONDS - EPS) endHold(world, i, t, 'timer');
      continue;
    }
    const cd = c.trapCooldown[i]!;
    if (cd > 0 && !releasedThisTick(world, i)) {
      const next = cd - DT;
      c.trapCooldown[i] = next <= EPS ? 0 : next;
    }
  }
}

// ------------------------------------------------------------------------------------- inspector readers

export type TrapState = 'none' | 'armed' | 'holding' | 'cooldown';

export interface TrapView {
  readonly state: TrapState;
  readonly reserveC: number;
  readonly reserveN: number;
  readonly target: { readonly birthId: number; readonly speciesIdx: number } | null;
  /** Seconds the current target has been held (0 unless holding). */
  readonly heldSeconds: number;
  /** Cooldown seconds left (0 unless cooling down). */
  readonly cooldownLeft: number;
}

/** The trap of organism `i` (pure; org-ui), or null when its species has no TRAP. */
export function trapView(world: World, i: number): TrapView | null {
  const traps = trapSpeciesOf(world);
  const c = world.ents.cols;
  if (traps === null || c.alive[i] !== 1 || traps[c.species[i]!] !== 1) return null;
  const t = trapTargetOf(world, i);
  const reserveC = c.trapReserveC[i]!;
  const cooldown = c.trapCooldown[i]!;
  const state: TrapState = t >= 0 ? 'holding' : cooldown > 0 ? 'cooldown' : reserveC > 0 ? 'armed' : 'none';
  return {
    state,
    reserveC,
    reserveN: c.trapReserveN[i]!,
    target: t >= 0 ? { birthId: c.birthId[t]!, speciesIdx: c.species[t]! } : null,
    heldSeconds: t >= 0 ? c.trapTimer[i]! : 0,
    cooldownLeft: t >= 0 ? 0 : cooldown,
  };
}

export interface HeldView {
  readonly ownerBirthId: number;
  readonly ownerSpeciesIdx: number;
  readonly heldSeconds: number;
  /** The carbon the owner actually took in the last whole second (intakeLastSecond; its only intake while it holds). */
  readonly drained: number;
}

/** The trap holding organism `i` (pure; org-ui derives "Caught in a trap." from it), or null. */
export function heldView(world: World, i: number): HeldView | null {
  if (trapSpeciesOf(world) === null) return null;
  const c = world.ents.cols;
  if (c.alive[i] !== 1) return null;
  const h = trapHolderOf(world, i);
  if (h < 0) return null;
  return { ownerBirthId: c.birthId[h]!, ownerSpeciesIdx: c.species[h]!, heldSeconds: c.trapTimer[h]!, drained: c.intakeLastSecond[h]! };
}
