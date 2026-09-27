/**
 * Reason codes (SPEC §12.2). The engine records codes and measured values; the UI turns them into
 * words. Numeric values are saved in entity columns: append only, never renumber.
 */
export const REASONS = [
  'NONE',
  // Intake
  'FOOD_ACCESS_LOW',
  'FOOD_NONE_COMPATIBLE',
  'FOOD_EXCLUDED_BY_PREFERENCE',
  'NUTRIENT_LIMITED',
  'OXYGEN_LIMITED',
  'LIGHT_LIMITED',
  'CO2_LIMITED',
  'SILICATE_LIMITED',
  'CROWDING_INTAKE_HALVED',
  'MEAL_DIGESTING',
  'MODE_SUGAR',
  'MODE_PHOTO',
  // Suitability
  'SUIT_PH',
  'SUIT_WARMTH',
  'SUIT_SALINITY',
  'SUIT_MOISTURE',
  'SUIT_HABITAT',
  'SUIT_OXYGEN_HIGH',
  'INHIBITOR_EXPOSURE',
  'RIVAL_EXPOSURE',
  // Energy / health
  'ENERGY_ZERO',
  'ENERGY_LOW',
  'HEALING',
  'INFECTED',
  'PARASITIZED',
  'HELD_IN_TRAP',
  'CAPTURED_HANDLING',
  // Division
  'DIV_BLOCK_BIOMASS',
  'DIV_BLOCK_ENERGY',
  'DIV_BLOCK_HEALTH',
  'DIV_BLOCK_AGE',
  'DIV_BLOCK_PLACEMENT',
  'DIV_BLOCK_CROWDING',
  'DIV_BLOCK_CAPACITY',
  'DIV_BLOCK_STATE',
  'DIV_BLOCK_INFECTED',
  'DIV_PENDING_PROPOSAL',
  // Predation
  'PRED_NO_PREY',
  'PRED_OUT_OF_CONTACT',
  'PRED_COOLDOWN',
  'PRED_MEAL_FULL',
  'PRED_HANDLING_IN_PROGRESS',
  'PRED_ENERGY_HIGH',
  // States
  'RESTING_FOOD_SCARCE',
  'RESTING_DRY',
  'PREPARING',
  'WAKING',
  'DORMANCY_LOCKOUT',
  'ANCHORED',
  'LINKED',
  'BONDED',
  'JUVENILE',
  'SETTLING',
  'DISPERSING',
  'STRANDED',
  'NIGHT_QUIET',
  'EMERGENCY_FEEDING',
  // Secretion
  'SECRETING',
  'SECRETION_NO_SUBSTRATE',
  'SECRETION_ENERGY_LOW',
  'SECRETION_SATURATED',
  'GLOW_ON',
  'GLOW_OFF',
  'NEIGHBORS_DETECTED',
  // Death
  'DEATH_STARVATION',
  'DEATH_STRESS',
  'DEATH_INHIBITOR',
  'DEATH_AGE',
  'DEATH_PREDATION',
  'DEATH_LYSIS',
  'DEATH_PARASITE_DRAIN',
  'DEATH_TRAP_DRAIN',
  'REMOVED_SAMPLED',
  // World
  'CAPACITY_REACHED',
  'HISTORY_COMPACTED',
  'EVIDENCE_EXPIRED',
  'MIXED_CAUSES',
] as const;

export type ReasonName = (typeof REASONS)[number];

export const R = Object.freeze(
  Object.fromEntries(REASONS.map((name, i) => [name, i])) as { [K in ReasonName]: number },
);

export function reasonName(code: number): ReasonName {
  return REASONS[code] ?? 'NONE';
}
