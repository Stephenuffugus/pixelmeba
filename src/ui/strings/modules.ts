/**
 * Words for supplementary modules and the resting stage (SPEC §9, §7.6, §12.1; UX §5.1–5.2; P2.1).
 * Every sentence is built from the inspector payload: the world's recorded module numbers, the
 * organism's life state, its dormancy clocks and measured conditions. No claims beyond them; never
 * "immune", "superior" or "adapted". All numbers are fictional game units.
 */
import { R } from '@sim/reasons';
import type { DormancyInspect, EntityInspect, ModuleInspect } from '@worker/protocol';
import { reasonText, secondsLeft } from './reasons';

/** Life states (saved lifeState column; see src/sim/entities.ts). */
export const LIFE_ACTIVE = 0;
export const LIFE_PREPARING = 1;
export const LIFE_RESTING = 2;
export const LIFE_WAKING = 3;

const num = (v: number | undefined, digits = 2): string => (v === undefined || !Number.isFinite(v) ? '?' : String(Number(v.toFixed(digits))));
const secs = (v: number | undefined): string => (v === undefined || !Number.isFinite(v) ? 'some' : String(Math.max(0, Math.round(v))));

/**
 * Chip text for how an organism came into the dish (its lineage origin): 1 = added by the player or
 * the recipe; 2 = a founder whose genome, with its extra abilities, was seeded when the dish was made
 * — labelled "present at creation" wherever it is described (UX §3.3); 0 = born here (no chip).
 */
export function originChip(origin: number): string | null {
  if (origin === 2) return 'present at creation';
  if (origin === 1) return 'added by you or the recipe';
  return null;
}

/**
 * Chip text while the engine's dormancy reason is DORMANCY_LOCKOUT (SPEC §12.2 States: Active in the
 * 30 s after waking), else null. The chip shows only from the reason code, never from art or timing.
 */
export function dormancyChip(d: Pick<DormancyInspect, 'reason'> | null | undefined): string | null {
  return d && d.reason.code === R.DORMANCY_LOCKOUT ? 'just woke up' : null;
}

/** Entity flag bits the inspector's action chip reads (src/sim/entities.ts FLAG; stage 6 sets feeding/usableIntake). */
const FLAG_STRESSED = 1 << 1;
const FLAG_FEEDING = 1 << 2;
const FLAG_HUNTING = 1 << 3;
const FLAG_MOVING = 1 << 6;
const FLAG_USABLE_INTAKE = 1 << 11;

/**
 * The inspector's action chip, from recorded state only. "Eating" needs this tick's intake to reach the
 * usable share of its intake ceiling (FLAG.usableIntake, USABLE_INTAKE_FRACTION); a smaller intake is
 * named as traces, so the chip never says "Eating" beside "No usable food" and "Food access: 0 %".
 */
export function actionLabel(e: Pick<EntityInspect, 'flags' | 'lifeState' | 'predation'> & Partial<Pick<EntityInspect, 'diet' | 'profile'>>): string {
  // A life state other than Active (Preparing, Resting, Waking) is the organism's real state (P2.1).
  if (e.lifeState !== LIFE_ACTIVE) return lifeStateLabel(e.lifeState);
  if (e.flags & FLAG_FEEDING) {
    if (e.predation) return 'Digesting';
    // m6: an organism that makes its food from light is never said to be eating (its intake is fixed carbon).
    if (e.diet?.metabolism === 'photosynthesis' && e.profile?.foods.length === 0) return e.flags & FLAG_USABLE_INTAKE ? 'Making food' : 'Making only a little food';
    return e.flags & FLAG_USABLE_INTAKE ? 'Eating' : 'Finding only traces of food';
  }
  if (e.flags & FLAG_HUNTING) return 'Hunting';
  if (e.flags & FLAG_STRESSED) return 'Stressed';
  if (e.flags & FLAG_MOVING) return 'Moving';
  // Not "resting": that word now names the resting stage.
  return 'Staying in place';
}

/** Chip text for a life state. */
export function lifeStateLabel(state: number): string {
  switch (state) {
    case LIFE_PREPARING:
      return 'Getting ready to rest';
    case LIFE_RESTING:
      return 'Resting';
    case LIFE_WAKING:
      return 'Waking up';
    default:
      return 'Active';
  }
}

/** "while …" wording for division blockers (UX §5.2 DIV_BLOCK_STATE "Can't split while {state}."). */
export function lifeStateWhile(state: number): string {
  switch (state) {
    case LIFE_PREPARING:
      return 'getting ready to rest';
    case LIFE_RESTING:
      return 'resting';
    case LIFE_WAKING:
      return 'waking up';
    default:
      return 'in this state';
  }
}

export interface ModuleText {
  readonly id: string;
  readonly name: string;
  /** What it does, in plain words, from the recorded numbers. */
  readonly does: string;
  /** Every cost, from the recorded numbers. */
  readonly costs: string;
  /** What it is doing right now, if anything. */
  readonly now: string | null;
}

/** One carried module as words (Passed to offspring). */
export function moduleText(m: ModuleInspect): ModuleText {
  const p = m.params;
  const carry = `Carrying it costs ${num(m.surchargePerSecond, 3)} energy/s`;
  switch (m.id) {
    case 'E01':
      return {
        id: m.id,
        name: m.name,
        does: 'Releases starch enzyme beside starch, turning it into sugar anyone nearby can eat. It still cannot eat starch itself.',
        costs: `${carry}, plus ${num(p.emitCost)} energy/s while releasing (only above ${num(p.minEnergy, 0)} energy).`,
        now: m.activeNow ? 'Releasing enzyme right now.' : null,
      };
    case 'E03':
      return {
        id: m.id,
        name: m.name,
        does: 'Can rest when food runs out or it gets too dry, and wake when conditions return.',
        costs: `${carry} except while resting; ${num(p.prepareCost, 0)} energy to get ready, ${num(p.restMaintenance)} energy/s while resting (instead of all other upkeep), ${num(p.wakeCost, 0)} energy to wake.`,
        now: m.activeNow ? 'In its resting cycle right now.' : null,
      };
    case 'E05':
      return {
        id: m.id,
        name: m.name,
        does: `Adds ${num(p.capacityBonus, 0)} energy of storage room. It is room, not energy: it fills only from energy the organism gains itself.`,
        costs: `${carry}, plus ${num(p.upkeepPerSecond)} energy/s upkeep.`,
        now: null,
      };
    default:
      return { id: m.id, name: m.name, does: 'A supplementary ability.', costs: `${carry}.`, now: null };
  }
}

/** Energy line for Details: "112.0 / 140 (100 + 40 room from its reserve chamber)". */
export function energyCapText(e: Pick<EntityInspect, 'E' | 'energyCap' | 'energyCapBase'>): string {
  const extra = e.energyCap - e.energyCapBase;
  return extra > 0 ? `${num(e.E, 1)} / ${num(e.energyCap, 0)} (${num(e.energyCapBase, 0)} + ${num(extra, 0)} room from its reserve chamber)` : `${num(e.E, 1)} / ${num(e.energyCap, 0)}`;
}

/** Upkeep line for Details, split the way stage 7 charges it. */
export function upkeepText(e: Pick<EntityInspect, 'upkeep'>): string {
  const u = e.upkeep;
  if (u.resting) return `${num(u.maintenance, 3)} energy/s while resting (instead of all other upkeep)`;
  const parts = [`${num(u.maintenance, 3)} energy/s`];
  if (u.surcharge > 0) parts.push(`${num(u.surcharge, 3)} for carrying extra abilities`);
  if (u.chamber > 0) parts.push(`${num(u.chamber, 3)} reserve chamber upkeep`);
  return parts.join(' + ');
}

/** "Happening now" lines for an organism that has a resting ability (native or E03). */
export function dormancyLines(d: DormancyInspect, E: number): string[] {
  const r = d.rules;
  const lines: string[] = [];
  switch (d.state) {
    case LIFE_PREPARING:
      lines.push(`Getting ready to rest: ${secondsLeft(r.prepareSeconds - d.stateSeconds)} s left. It paid ${num(r.prepareCost, 0)} energy to start, and gets none back.`);
      lines.push('It does not feed, move or split while getting ready.');
      break;
    case LIFE_RESTING: {
      lines.push(d.cause === R.RESTING_DRY ? `Resting because it was too dry for ${secs(d.dryTriggerSeconds)} s.` : 'Resting because food stayed scarce.');
      const need = (ok: boolean, what: string) => `${what}: ${ok ? 'yes' : 'not yet'}`;
      lines.push(
        `It wakes after ${secs(r.wakeConditionSeconds)} s of usable food, wet enough water and suitable conditions, with at least ${num(r.wakeMinEnergy, 0)} energy (it has ${num(E, 1)}).`,
      );
      lines.push(`${need(d.wake.food, 'Food here')} · ${need(d.wake.moisture, 'Wet enough')} · ${need(d.wake.environment, 'Conditions suitable')} · held ${secs(d.stateSeconds)} of ${secs(r.wakeConditionSeconds)} s.`);
      if (E < r.wakeMinEnergy) lines.push(`It has too little energy to pay the ${num(r.wakeCost, 0)} energy it costs to wake. Nothing will give it more.`);
      lines.push(
        `While resting it uses ${num(r.restMaintenance)} energy/s, and harsh water or inhibitors do ${Math.round(r.damageFactor * 100)} % of their usual harm. It still ages, still starves at 0 energy, and can still be eaten.`,
      );
      break;
    }
    case LIFE_WAKING:
      lines.push(`Waking up: ${secondsLeft(r.wakeSeconds - d.stateSeconds)} s left. It paid ${num(r.wakeCost, 0)} energy; it cannot feed until it is awake.`);
      break;
    default:
      // The engine's reason code (DORMANCY_LOCKOUT) and its measured value, in the Lab wording.
      if (d.reason.code === R.DORMANCY_LOCKOUT) lines.push(reasonText(R.DORMANCY_LOCKOUT, 'lab', { value: d.reason.value, restHeld: d.reason.restHeld }));
      if (d.noIntakeSeconds > 0.05)
        lines.push(`No usable food for ${secs(d.noIntakeSeconds)} s; it starts to rest after ${secs(d.triggerSeconds)} s without food if it has at least ${num(r.entryMinEnergy, 0)} energy.`);
      if (d.drySeconds > 0.05) lines.push(`Too dry for ${secs(d.drySeconds)} s; it starts to rest after ${secs(d.dryTriggerSeconds)} s.`);
  }
  return lines;
}
