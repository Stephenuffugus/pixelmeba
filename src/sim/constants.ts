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

/** Shared film construction (SPEC §7.1, §9 E10, CT §12.6): film carbon per cell never exceeds this. */
export const FILM_CAP = 0.5;

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

/**
 * Climate (Phase 5, P5.1; SPEC §4.4, §4.6–§4.8, §4.10; CT §4, §12.2; src/sim/climate.ts). Per-second
 * rates are converted to per-tick amounts once (rate × DT) in climate.ts.
 */
/** Day/night cycle (CT §12.2): 240 s = 2400 ticks, day 90 s, dusk 30 s, night 90 s, dawn 30 s. */
export const CYCLE_PERIOD_TICKS = 2400;
export const CYCLE_DAY_TICKS = 900;
export const CYCLE_DUSK_TICKS = 300;
export const CYCLE_NIGHT_TICKS = 900;
export const CYCLE_DAWN_TICKS = 300;
/** Light factor at night (CT §12.2 "night 0.05"). */
export const CYCLE_NIGHT_FACTOR = 0.05;
/** Light factor under an S11 shade roof (CT §4, §12.2). */
export const ROOF_SHADE = 0.25;
/** Canopy factor 1/(1 + Σ CANOPY biomass / 10) over a cell and its four neighbours (CT §12.2). */
export const CANOPY_BIOMASS_SCALE = 10;
/** Local warmth (CT §12.2, §13): relax 1 % per tick toward ambient, diffuse 0.05, heater/cooler ±0.01/s. */
export const WARMTH_RELAX_PER_TICK = 0.01;
export const WARMTH_DIFFUSION = 0.05;
export const WARMTH_DEVICE_PER_SECOND = 0.01;
/** Moisture index (CT §12.2): water 1, gel/sediment start 0.8, drying −0.001/s to 0.1, wetting 0.9, wick → 0.8 at 0.01/s. */
export const MOISTURE_WATER = 1;
export const MOISTURE_START = 0.8;
export const DRYING_PER_SECOND = 0.001;
export const MOISTURE_FLOOR = 0.1;
export const WETTING_MOISTURE = 0.9;
export const WICK_TARGET = 0.8;
export const WICK_PER_SECOND = 0.01;

/**
 * Barrier transport (Phase 5 wave 10, P5.2; SPEC §4.9; CT §4, §12.2; src/sim/channel.ts, src/sim/resin.ts).
 * Per-second rates are converted to per-tick amounts once (rate × DT) where they are used.
 */
/** S04 one-way channel: share of every eligible dissolved/viral pool of the source cell requested per second (CT §12.2 "channel 2 %/s pools"). */
export const CHANNEL_POOL_FRACTION_PER_SECOND = 0.02;
/** S04 one-way channel: ticks between two Small organism transfers (CT §12.2 "1 Small/s"). */
export const CHANNEL_ORGANISM_TICKS = 10;
/** S08 adsorption resin: activity units removed per second at most (CT §4, §12.2 "resin 0.05/s"; capacity: devices.ts RESIN_CAPACITY). */
export const RESIN_RATE_PER_SECOND = 0.05;

/**
 * Shells and silicate (Phase 5 wave 10, P5.3 E2-SHELLS; SPEC §5.2, §6.5, §7.11; CT §12.2, §12.3;
 * src/sim/intake.ts, src/sim/conversion.ts). Per-tick amounts are rate × DT, computed once where used.
 */
/** Silicate a shell builder (native SHELL: A02, P05) binds as shell mineral per unit of new biomass (CT §12.3). */
export const SHELL_MINERAL_PER_BIOMASS = 0.1;
/** Share of the remaining shell grit that dissolves into free silicate per second (CT §12.2). */
export const GRIT_DISSOLVE_PER_SECOND = 0.01;

/**
 * Signals and glow (Phase 5 wave 11, P5.3 E2-SIGNALS; SPEC §7.8, §9 E02; CT §12.6; src/sim/signals.ts). Native
 * SIGNAL_GLOW (B09) reads these; an E02 carrier reads its world's recorded E02 parameters (the same numbers in
 * content/modules/E02.json). Per-tick amounts are rate × DT.
 */
/** S_GLOW emitted per second into the emitter's cell (CT §12.6 "signal: 0.02/s"). */
export const SIGNAL_EMIT_RATE = 0.02;
/** Energy per second while emitting, ledgered as 'signal' (CT §12.6 "0.20 E/s"; D-0106). */
export const SIGNAL_EMIT_COST = 0.2;
/** Emission only while E (remaining this tick) is above this (CT §12.6 "E > 35"). */
export const SIGNAL_MIN_ENERGY = 35;
/** Emission stops while the local S_GLOW is at or above this; existing excess is kept (CT §12.6 "cap 1.0"). */
export const SIGNAL_LOCAL_CAP = 1.0;
/** Glow turns on after the sensed signal has been ≥ this for GLOW_DWELL_SECONDS (CT §12.6 "on ≥ 0.30 for 5 s"). */
export const GLOW_ON_THRESHOLD = 0.3;
/** Glow turns off after the sensed signal has been ≤ this for GLOW_DWELL_SECONDS (CT §12.6 "off ≤ 0.15 for 5 s"). */
export const GLOW_OFF_THRESHOLD = 0.15;
/** Continuous seconds either switching condition must hold (CT §12.6 "5 s"). */
export const GLOW_DWELL_SECONDS = 5;
/** Energy per second while glowing, ledgered as 'signal' (CT §12.6 "0.30 E/s"; D-0106). */
export const GLOW_COST = 0.3;
/** Glow turns off at once when E falls below this, and never turns on below it (CT §12.6 "or E < 15"; D-0119). */
export const GLOW_OFF_ENERGY = 15;

/** Rivalry (Phase 5 wave 11; SPEC §7.9, §4.3; CT §3.4, §12.6; src/sim/rivalry.ts). Per-tick amounts are rate × DT. */
/** RIVAL secreted per second by a B13 into its cell (CT §12.6 "RIVAL: 0.02/s"). */
export const RIVAL_EMIT_RATE = 0.02;
/** Energy per second while secreting RIVAL, ledgered as 'secretion' (CT §12.6 "0.60 E/s"; D-0119). */
export const RIVAL_EMIT_COST = 0.6;
/** Secretion only while E (remaining this tick) is above this (CT §12.6 "E > 50"). */
export const RIVAL_MIN_ENERGY = 50;
/** Secretion stops while the local RIVAL is at or above this (CT §12.6 "local < 1.0"). */
export const RIVAL_LOCAL_CAP = 1.0;
/** A target within this many cells (Chebyshev, the 5 × 5 window) triggers secretion (CT §12.6 "within 2 cells"; D-0119). */
export const RIVAL_RADIUS = 2;
/** A RIVAL target's inhibitor exposure gains this × the local RIVAL (CT §3.4, §12.6 "+0.25 × RIVAL exposure"; SPEC §4.3). */
export const RIVAL_EXPOSURE_FACTOR = 0.25;
