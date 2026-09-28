/** Fixed simulation constants (SPEC §2–§3, CT §12). Changing any of these is a ruleset change. */

export const DT = 0.1;
export const TICKS_PER_SECOND = 10;

export const GRID_W = 128;
export const GRID_H = 128;
export const CELL_COUNT = GRID_W * GRID_H;
export const MASK_CX = 63.5;
export const MASK_CY = 63.5;
export const MASK_R = 60;

export const AGENT_CAP = 6000;
export const FUNGAL_CAP = 2000;
export const DEVICE_CAP = 256;
export const FOOD_OBJECT_CAP = 128;
export const EDGE_BARRIER_CAP = 512;
export const REGION_CAP = 6;
export const CONTROLLER_CAP = 8;

/** Soft cell capacity in biomass-equivalents (Σ B / ancestral B0). */
export const CELL_SOFT_CAPACITY = 8;

/** Diffusion coefficients per tick by habitat (SPEC §4.1). */
export const DIFFUSION_WATER = 0.1;
export const DIFFUSION_GEL = 0.025;
export const DIFFUSION_SEDIMENT = 0.01;

/** Gas exchange (SPEC §4.2). */
export const GAS_EXCHANGE_RATE = 0.02;
export const GAS_EXCHANGE_SEDIMENT_FACTOR = 0.1;
export const O2_ATMOSPHERE = 0.8;
export const CO2_ATMOSPHERE = 0.5;

/** Availability factor half-saturation a / (a + K). */
export const AVAIL_K = 0.1;

/** Metabolism (SPEC §6.5, CT §12.3). */
export const BIOMASS_FRACTION = 0.5;
export const CO2_FRACTION = 0.3;
export const METABOLITE_FRACTION = 0.2;
export const O2_PER_CARBON_AEROBIC = 0.3;
export const NUTRIENT_PER_CARBON = 0.05;
export const PHOTO_SUGAR_FRACTION = 0.5;
export const PHOTO_O2_PER_CARBON = 0.5;
export const INITIAL_NUTRIENT_RATIO = 0.1;

/** Energy and health (SPEC §6.7). */
export const ENERGY_CAP_BASE = 100;
export const MOVE_COST_PER_CELL = 0.2;
export const STARVATION_DAMAGE = 4;
export const STRESS_DAMAGE = 2;
export const STRESS_THRESHOLD = 0.1;
export const INHIBITOR_DAMAGE = 8;
export const HEAL_RATE = 1;
export const HEAL_MIN_ENERGY = 20;
export const HEAL_MIN_SUITABILITY = 0.5;
export const INITIAL_ENERGY = 50;
export const INITIAL_HEALTH = 100;
export const STRESS_DISPLAY_SECONDS = 3;

/** Reproduction (SPEC §6.9). */
export const DIVISION_BIOMASS_MULTIPLE = 2;
export const DIVISION_MIN_ENERGY = 60;
export const DIVISION_MIN_HEALTH = 50;
export const DIVISION_BASE_COST = 20;

/** Movement (SPEC §6.4). */
export const DECISION_INTERVAL_TICKS = 5;
export const WANDER_HOLD_TICKS = 10;
export const SCORE_FOOD = 0.5;
export const SCORE_SUIT = 0.4;
export const SCORE_CROWD = 0.1;
export const CONTACT_DISTANCE = 0.5;

/** Predation (SPEC §6.6, §7.3). */
export const MEAL_CAP_MULTIPLE = 2;
export const HUNT_MAX_ENERGY = 80;
export const HUNT_MAX_MEAL_MULTIPLE = 0.5;

/** Enzymes (SPEC §5.3). */
export const ENZYME_EMIT_RATE = 0.02;
export const ENZYME_EMIT_MIN_ENERGY = 35;
export const ENZYME_EMIT_COST = 0.4;
export const ENZYME_LOCAL_CAP = 1;
export const ENZYME_CONVERSION = 0.1;
export const ENZYME_DECAY_PER_SECOND = 0.02;
export const BREAKER_DECAY_PER_SECOND = 0.01;

/** Dormancy state machine for native resters (SPEC §7.6, CT §12.7). E03 reads its own recorded params. */
export const DORMANCY_PREPARE_SECONDS = 5;
export const DORMANCY_PREPARE_COST = 10;
export const DORMANCY_REST_MAINTENANCE = 0.01;
export const DORMANCY_DAMAGE_FACTOR = 0.1;
export const DORMANCY_WAKE_SECONDS = 5;
export const DORMANCY_WAKE_COST = 5;
export const DORMANCY_WAKE_MIN_ENERGY = 5;
export const DORMANCY_LOCKOUT_SECONDS = 30;
export const DORMANCY_NO_INTAKE_SECONDS = 20;
export const DORMANCY_ENTRY_MIN_ENERGY = 15;
export const DORMANCY_DRY_SUITABILITY = 0.2;
export const DORMANCY_DRY_SECONDS = 10;
export const DORMANCY_WAKE_CONDITION_SECONDS = 10;
/**
 * "Usable" intake and food for the dormancy trigger and wake rule (DECISIONS, P2.1): diffusion leaves
 * vanishing but nonzero tails across the dish, which must not count as food. A tick's intake is usable
 * when it reaches 1 % of the organism's intake ceiling Q'·dt; a food pool is usable from 0.001 C per
 * cell (where avail(a) = a/(a + 0.10) first reaches ≈ 1 %).
 */
export const USABLE_INTAKE_FRACTION = 0.01;
export const USABLE_FOOD_MIN = 0.001;

/** Numerical hygiene (SPEC §3.5). */
export const ROUNDOFF_EPSILON = 1e-8;
export const LEDGER_RELATIVE_TOLERANCE = 1e-5;

/** History and events (SPEC §12.3–12.4). */
export const EVENT_RING_SIZE = 500;
export const HISTORY_SECONDS = 1800;
export const HISTORY_MINUTES = 360;
