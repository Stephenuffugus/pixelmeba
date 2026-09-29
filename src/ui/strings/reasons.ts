/**
 * Reason code → words (SPEC §12.2, UX §5.2). Explore wording is short and plain; Lab wording adds
 * the measured value. Every code has copy; tests enforce it. No claims beyond the recorded code.
 */
import { REASONS, type ReasonName } from '@sim/reasons';

export interface ReasonContext {
  /** Fraction supplied or other measured value for the code (0–1 unless stated). */
  readonly value?: number;
  readonly food?: string;
  readonly speciesName?: string;
  /** DORMANCY_LOCKOUT: a rest is due now and waits only for the lockout (see @sim/dormancy dormancyReason). */
  readonly restHeld?: boolean;
}

const secs = (v?: number) => (v === undefined || !Number.isFinite(v) ? 'some' : String(Math.max(0, Math.round(v))));
/**
 * Whole seconds left in a countdown (PREPARING, WAKING, DORMANCY_LOCKOUT), rounded up so a running
 * countdown never reads "0 s" before it ends (0.1 s left reads "1 s"). The tolerance absorbs float
 * accumulation of the 0.1 s tick (2.0000000000004 reads "2").
 */
export const secondsLeft = (v?: number): string => (v === undefined || !Number.isFinite(v) ? 'some' : String(Math.max(0, Math.ceil(v - 1e-6))));
const pct = (v?: number) => (v === undefined || !Number.isFinite(v) ? 'an unknown share' : `${Math.round(v * 100)} %`);

const EXPLORE: Record<ReasonName, string> = {
  NONE: 'Doing fine right now.',
  FOOD_ACCESS_LOW: 'There is not enough food here.',
  FOOD_NONE_COMPATIBLE: 'Nothing here it can eat.',
  FOOD_EXCLUDED_BY_PREFERENCE: 'It ignores the food here.',
  NUTRIENT_LIMITED: 'It needs minerals to grow.',
  OXYGEN_LIMITED: 'Not enough oxygen here.',
  LIGHT_LIMITED: 'Too dark to make food.',
  CO2_LIMITED: 'Not enough carbon dioxide.',
  SILICATE_LIMITED: 'It needs silicate to grow its shell.',
  CROWDING_INTAKE_HALVED: "It's crowded here.",
  MEAL_DIGESTING: 'Digesting a meal.',
  MODE_SUGAR: 'Eating sugar in the dark.',
  MODE_PHOTO: 'Making food from light.',
  SUIT_PH: "This water's acidity doesn't suit it.",
  SUIT_WARMTH: "The temperature doesn't suit it.",
  SUIT_SALINITY: "The saltiness doesn't suit it.",
  SUIT_MOISTURE: "It's too dry here.",
  SUIT_HABITAT: "It can't live on this ground.",
  SUIT_OXYGEN_HIGH: 'Too much oxygen for it here.',
  INHIBITOR_EXPOSURE: 'Something here is hurting it.',
  RIVAL_EXPOSURE: 'A rival colony is hurting it.',
  ENERGY_ZERO: 'Out of energy — losing health.',
  ENERGY_LOW: 'Running low on energy.',
  HEALING: 'Recovering.',
  INFECTED: "It's infected and can't split.",
  PARASITIZED: 'Something is attached to it.',
  HELD_IN_TRAP: 'Caught in a trap.',
  CAPTURED_HANDLING: 'Being caught.',
  DIV_BLOCK_BIOMASS: 'Needs to grow more before splitting.',
  DIV_BLOCK_ENERGY: 'Needs more energy to split.',
  DIV_BLOCK_HEALTH: 'Too hurt to split.',
  DIV_BLOCK_AGE: 'Too young to split.',
  DIV_BLOCK_PLACEMENT: 'Needs room to split.',
  DIV_BLOCK_CROWDING: 'Needs room to split.',
  DIV_BLOCK_CAPACITY: 'The dish is full.',
  DIV_BLOCK_STATE: "Can't split right now.",
  DIV_BLOCK_INFECTED: "Can't split while infected.",
  DIV_PENDING_PROPOSAL: 'Ready to split when there is room.',
  PRED_NO_PREY: 'Nothing to hunt nearby.',
  PRED_OUT_OF_CONTACT: 'Chasing food.',
  PRED_COOLDOWN: 'Resting after a catch.',
  PRED_MEAL_FULL: 'Full for now.',
  PRED_HANDLING_IN_PROGRESS: 'Holding on to its prey.',
  PRED_ENERGY_HIGH: 'Not hungry.',
  RESTING_FOOD_SCARCE: 'Resting until conditions change.',
  RESTING_DRY: "Resting because it's too dry.",
  PREPARING: 'Getting ready to rest.',
  WAKING: 'Waking up.',
  DORMANCY_LOCKOUT: 'Just woke up.',
  ANCHORED: 'Holding on to a surface.',
  LINKED: 'Linked to its colony.',
  BONDED: 'Paired with a partner.',
  JUVENILE: 'Young and looking for a place to settle.',
  SETTLING: 'Settling down.',
  DISPERSING: 'Travelling to a new place.',
  STRANDED: 'Stranded with nowhere to settle.',
  NIGHT_QUIET: 'Quiet in bright light.',
  EMERGENCY_FEEDING: 'Feeding because energy is low.',
  SECRETING: 'Making enzyme.',
  SECRETION_NO_SUBSTRATE: 'No starch nearby to work on.',
  SECRETION_ENERGY_LOW: 'Too tired to make enzyme.',
  SECRETION_SATURATED: 'Enough enzyme here already.',
  GLOW_ON: 'Glowing.',
  GLOW_OFF: 'Not glowing.',
  NEIGHBORS_DETECTED: 'It senses neighbors.',
  DEATH_STARVATION: 'It ran out of energy.',
  DEATH_STRESS: 'The conditions were too harsh.',
  DEATH_INHIBITOR: 'Something in the water harmed it.',
  DEATH_AGE: 'It reached the end of its life.',
  DEATH_PREDATION: 'It was eaten.',
  DEATH_LYSIS: 'A virus burst it.',
  DEATH_PARASITE_DRAIN: 'A parasite drained it.',
  DEATH_TRAP_DRAIN: 'A trap drained it.',
  REMOVED_SAMPLED: 'It was moved with the sample tool.',
  CAPACITY_REACHED: 'The dish is full.',
  HISTORY_COMPACTED: 'Older details were summarized.',
  EVIDENCE_EXPIRED: 'Older details were summarized.',
  MIXED_CAUSES: 'A few things are slowing it down.',
};

function lab(name: ReasonName, ctx: ReasonContext): string {
  switch (name) {
    case 'FOOD_ACCESS_LOW':
      return `Food access: ${pct(ctx.value)} of its intake budget found${ctx.food ? ` (${ctx.food})` : ''}.`;
    case 'NUTRIENT_LIMITED':
      return `Growth limited by mineral nutrients: ${pct(ctx.value)} of requested growth supplied.`;
    case 'OXYGEN_LIMITED':
      return `Aerobic intake limited by oxygen: ${pct(ctx.value)} supplied.`;
    case 'LIGHT_LIMITED':
      return `Photosynthesis at ${ctx.value === undefined || !Number.isFinite(ctx.value) ? 'an unknown' : ctx.value.toFixed(2)} light.`;
    case 'CROWDING_INTAKE_HALVED':
      return 'Cell over capacity: intake halved and births blocked until it thins out.';
    case 'DIV_BLOCK_CAPACITY':
    case 'CAPACITY_REACHED':
      return 'Simulation capacity reached (6,000). This is a limit of the game, not the ecosystem.';
    case 'DIV_BLOCK_PLACEMENT':
      return 'No free compatible neighboring cell for a daughter.';
    case 'DIV_BLOCK_CROWDING':
      return 'Its cell is over capacity, so births wait.';
    case 'ENERGY_ZERO':
      return 'Energy 0: losing 4 health per second.';
    case 'RESTING_FOOD_SCARCE':
      // UX §5.2 wording; the measured value is how long the wake conditions have held so far.
      return `Resting because food stayed scarce; wakes after 10 s of food and energy ≥ 5 (${secs(ctx.value)} s so far).`;
    case 'RESTING_DRY':
      return `Resting because it was too dry; wakes after 10 s of moisture and energy ≥ 5 (${secs(ctx.value)} s so far).`;
    case 'PREPARING':
      return `Getting ready to rest: ${secondsLeft(ctx.value)} s left.`;
    case 'WAKING':
      return `Waking up: ${secondsLeft(ctx.value)} s left.`;
    case 'DORMANCY_LOCKOUT': {
      // The measured value is the lockout seconds left (SPEC §7.6: 30 s after waking).
      const wait = ctx.value === undefined || !Number.isFinite(ctx.value) ? 'yet' : `for ${secondsLeft(ctx.value)} s`;
      return ctx.restHeld ? `Just woke up: it would start resting now, but cannot rest again ${wait}.` : `Just woke up: it cannot rest again ${wait}.`;
    }
    default:
      return EXPLORE[name];
  }
}

export function reasonText(code: number, mode: 'explore' | 'lab' = 'explore', ctx: ReasonContext = {}): string {
  const name = (REASONS[code] ?? 'NONE');
  return mode === 'explore' ? EXPLORE[name] : lab(name, ctx);
}

export function allReasonCopy(): Record<ReasonName, string> {
  return EXPLORE;
}
