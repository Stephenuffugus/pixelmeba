/**
 * The shared phenotype function (SPEC §6.2, §8.2, CT §6). One pure function turns
 * (species template, genome, life state) into effective values. The simulation, inspector,
 * previews and validator all call this, so displayed abilities can never diverge from behavior.
 *
 * Factor order: ancestor → body size (Phase 7) → quantitative loci → modules → life stage →
 * colony role → temporary state. Neutral loci (50) reproduce the template exactly.
 *
 * Modules (SPEC §9, P2.1) read their numbers from the world's recorded module definitions (the
 * versioned registry saved with the world), never from the build's current content.
 */
import type { FieldId } from './fields';
import {
  L_DIVISION,
  L_DORMANCY,
  L_FEEDING,
  L_MOTILITY,
  L_PH,
  L_SALINITY,
  L_SENSING,
  L_WARMTH,
  type FeedingPolicy,
  type Genome,
} from './genome';
import type { SpeciesRT } from './species';
import {
  DORMANCY_DAMAGE_FACTOR,
  DORMANCY_DRY_SECONDS,
  DORMANCY_DRY_SUITABILITY,
  DORMANCY_ENTRY_MIN_ENERGY,
  DORMANCY_LOCKOUT_SECONDS,
  DORMANCY_NO_INTAKE_SECONDS,
  DORMANCY_PREPARE_COST,
  DORMANCY_PREPARE_SECONDS,
  DORMANCY_REST_MAINTENANCE,
  DORMANCY_WAKE_CONDITION_SECONDS,
  DORMANCY_WAKE_COST,
  DORMANCY_WAKE_MIN_ENERGY,
  DORMANCY_WAKE_SECONDS,
  ENERGY_CAP_BASE,
  ENZYME_EMIT_COST,
  ENZYME_EMIT_MIN_ENERGY,
  ENZYME_EMIT_RATE,
  ENZYME_LOCAL_CAP,
} from './constants';

export interface ModuleRT {
  readonly id: string;
  readonly surcharge: number;
  readonly params: Readonly<Record<string, number>>;
}

/** E_STARCH producer rules (SPEC §5.3): native (B06, F02) or gained through E01. */
export interface StarchRules {
  readonly source: 'native' | 'E01';
  readonly emitRate: number;
  readonly minEnergy: number;
  readonly emitCost: number;
  readonly localCap: number;
}

/**
 * Enzyme producer rules for any activity (SPEC §5.3; P3.7 stage 8): E_STARCH, E_OIL or E_PROTEIN,
 * native or gained through a module (E01 starch, E09 protein). StarchRules is the starch case.
 */
export interface ProducerRules {
  readonly source: 'native' | 'E01' | 'E09';
  readonly emitRate: number;
  readonly minEnergy: number;
  readonly emitCost: number;
  readonly localCap: number;
}

/**
 * Shared-construction rules (SPEC §7.1, §9 E10, CT §12.6; P3.7 stage 8): native B02 film deposition
 * or the E10 matrix builder. Builders submit requests to stage 8's shared construction pass
 * (construction.ts). Null for every species until those systems land (P3.3, wave 4 E10).
 */
export interface BuilderRules {
  readonly source: 'native' | 'E10';
  /** Build only while E is above this (B02 40, E10 35). */
  readonly minEnergy: number;
  /** Body carbon offered per second (0.05 B02, 0.02 E10). */
  readonly ratePerSecond: number;
  /** The body never goes below bodyFloor × B0' (B02 1.0, E10 1.2). */
  readonly bodyFloor: number;
  /** Energy charged per carbon actually accepted (E10 2 E/C; 0 for native film). */
  readonly energyPerC: number;
  /** E10 only: local film must be below this to request (its recorded filmCap, 0.50); native film relies on the pass's FILM_CAP. */
  readonly filmCap?: number;
}

/** Dormancy state machine rules (SPEC §7.6, CT §12.7): native (B12, F04, P08) or gained through E03. */
export interface DormancyRules {
  readonly source: 'native' | 'E03';
  readonly prepareSeconds: number;
  readonly prepareCost: number;
  readonly restMaintenance: number;
  readonly damageFactor: number;
  readonly wakeSeconds: number;
  readonly wakeCost: number;
  readonly wakeMinEnergy: number;
  readonly lockoutSeconds: number;
  readonly noIntakeSeconds: number;
  readonly entryMinEnergy: number;
  readonly drySuitability: number;
  readonly drySeconds: number;
  readonly wakeConditionSeconds: number;
}

export interface Profile {
  readonly b0: number;
  readonly q: number;
  /** Ordinary maintenance per second, inherited multipliers applied once to (M + surcharges). */
  readonly m: number;
  /** The part of `m` that is module surcharge (Σ 0.02 E/s per carried module, after the multipliers). */
  readonly surcharge: number;
  readonly speed: number;
  readonly sensing: number;
  readonly motilityFactor: number;
  readonly minDivisionAge: number;
  /** Division energy cost (20 × (0.5 + g_div) × size × form × role). */
  readonly divisionCost: number;
  readonly divisionMinEnergy: number;
  readonly energyCap: number;
  /** Energy cap without supplementary capacity (energyCap − baseEnergyCap is E05 room). */
  readonly baseEnergyCap: number;
  readonly ph: readonly [number, number];
  readonly warmth: readonly [number, number];
  readonly salinity: readonly [number, number];
  readonly moisture: readonly [number, number];
  readonly dormancyTriggerSeconds: number;
  readonly policy: FeedingPolicy;
  readonly foods: readonly FieldId[];
  readonly weights: readonly number[] | null;
  readonly modules: readonly string[];
  /** Extra upkeep per second paid separately from maintenance (e.g. E05 chamber). */
  readonly upkeep: number;
  /** Loci that act for this genome: the template's plus module activations (E03 → dormancy). */
  readonly lociActive: readonly boolean[];
  /** Starch-enzyme producer rules, or null when it cannot release starch enzyme. */
  readonly starch: StarchRules | null;
  /** Dormancy rules, or null when it cannot rest. */
  readonly dormancy: DormancyRules | null;
  /** Oil-enzyme producer rules (native B07), or null. Null for every species until P3.6. */
  readonly oil: ProducerRules | null;
  /** Protein-enzyme producer rules (native B08, module E09), or null. Null for every species until P3.6/E09. */
  readonly protein: ProducerRules | null;
  /** Shared-construction rules (native B02 film, module E10), or null. Null for every species until P3.3/E10. */
  readonly builder: BuilderRules | null;
  /**
   * Whether it swims on its own (movement.ts stage 4 gate): the template's speed > 0, or an E07 carrier
   * (P3.7). Equal to SpeciesRT.selfPropelled for every profile without E07.
   */
  readonly selfPropelled: boolean;
  /** E04 surface anchor rules (anchor.ts), or null when it does not carry E04. */
  readonly anchor: AnchorRules | null;
  /** E07 light seeker rules (lightSeeker.ts), or null when it does not carry E07. */
  readonly lightSeeker: LightSeekerRules | null;
  /** E06 shade collector rules (intake.ts photosynthetic route), or null when it does not carry E06. */
  readonly shade: ShadeRules | null;
  /** E08 debris feeder (debrisFeeder.ts): with no held meal it may eat local detritus. */
  readonly debrisFeeder: boolean;
}

/** E04 Surface anchor (SPEC §9 E04, CT §12.6), from the world's recorded module numbers. */
export interface AnchorRules {
  /** Continuous seconds beside support before it attaches (5). */
  readonly attachSeconds: number;
  /** It attaches only with E above this (35). */
  readonly minEnergy: number;
  /** Extra upkeep per second while anchored (0.10), ledgered as 'upkeep'. */
  readonly attachedUpkeep: number;
  /** Seconds without usable intake (the D-0035 clock) after which it lets go (10). */
  readonly detachNoIntakeSeconds: number;
  /** It lets go when E falls below this (15). */
  readonly detachEnergy: number;
  /** Reattach lockout after any detach (10 s). */
  readonly lockoutSeconds: number;
}

/**
 * E06 Shade collector (SPEC §6.5, §9 E06; CT §7.1), from the world's recorded module numbers. Applied on
 * the photosynthetic route only (intake.ts): light response min(1, light / lightHalf) and the intake
 * ceiling × ceilingFactor. Kept out of Profile.q, which the usable-intake threshold and the lineage
 * intake line read.
 */
export interface ShadeRules {
  /** Light at which the response reaches 1 (0.35). */
  readonly lightHalf: number;
  /** Photosynthetic intake ceiling multiplier (0.70). */
  readonly ceilingFactor: number;
}

/** E07 Light seeker (SPEC §9 E07, §6.4, §6.7; CT §7.1), from the world's recorded module numbers. */
export interface LightSeekerRules {
  /** Motility baseline in cells per second (0.15), scaled by the motility locus. */
  readonly baseSpeed: number;
  /** Sensing baseline in cells (2), scaled by the sensing locus. */
  readonly lightSensing: number;
  /** Self-propulsion cost factor: factor × (0.5 + g_mot)² E/s while moving (0.10). */
  readonly moveCostFactor: number;
  /** A candidate must be at least this much brighter than its own cell (0.01). */
  readonly brighterBy: number;
}

const PH_DOMAIN: readonly [number, number] = [2, 12];
const UNIT_DOMAIN: readonly [number, number] = [0, 1];

const NATIVE_STARCH: StarchRules = Object.freeze({
  source: 'native',
  emitRate: ENZYME_EMIT_RATE,
  minEnergy: ENZYME_EMIT_MIN_ENERGY,
  emitCost: ENZYME_EMIT_COST,
  localCap: ENZYME_LOCAL_CAP,
});

/** Native oil- and protein-enzyme producers (B07 E_OIL, B08 E_PROTEIN; SPEC §5.3, CT §12.6; P3.6). */
const NATIVE_OIL: ProducerRules = Object.freeze({
  source: 'native',
  emitRate: ENZYME_EMIT_RATE,
  minEnergy: ENZYME_EMIT_MIN_ENERGY,
  emitCost: ENZYME_EMIT_COST,
  localCap: ENZYME_LOCAL_CAP,
});
const NATIVE_PROTEIN: ProducerRules = Object.freeze({
  source: 'native',
  emitRate: ENZYME_EMIT_RATE,
  minEnergy: ENZYME_EMIT_MIN_ENERGY,
  emitCost: ENZYME_EMIT_COST,
  localCap: ENZYME_LOCAL_CAP,
});

const NATIVE_DORMANCY: DormancyRules = Object.freeze({
  source: 'native',
  prepareSeconds: DORMANCY_PREPARE_SECONDS,
  prepareCost: DORMANCY_PREPARE_COST,
  restMaintenance: DORMANCY_REST_MAINTENANCE,
  damageFactor: DORMANCY_DAMAGE_FACTOR,
  wakeSeconds: DORMANCY_WAKE_SECONDS,
  wakeCost: DORMANCY_WAKE_COST,
  wakeMinEnergy: DORMANCY_WAKE_MIN_ENERGY,
  lockoutSeconds: DORMANCY_LOCKOUT_SECONDS,
  noIntakeSeconds: DORMANCY_NO_INTAKE_SECONDS,
  entryMinEnergy: DORMANCY_ENTRY_MIN_ENERGY,
  drySuitability: DORMANCY_DRY_SUITABILITY,
  drySeconds: DORMANCY_DRY_SECONDS,
  wakeConditionSeconds: DORMANCY_WAKE_CONDITION_SECONDS,
});

/**
 * Native B02 film deposition (SPEC §7.1, CT §12.6; P3.3; film.ts): E above 40, 0.05 body C per second,
 * never below B0'. No energy per carbon: SPEC §7.1 and CT §12.6 name none (E10's 2 E/C is its own).
 */
const NATIVE_FILM_BUILDER: BuilderRules = Object.freeze({
  source: 'native',
  minEnergy: 40,
  ratePerSecond: 0.05,
  bodyFloor: 1.0,
  energyPerC: 0,
});

function param(mod: ModuleRT, key: string): number {
  const v = mod.params[key];
  if (v === undefined || !Number.isFinite(v)) throw new Error(`module ${mod.id} has no parameter "${key}"`);
  return v;
}

function starchFrom(mod: ModuleRT): StarchRules {
  return { source: 'E01', emitRate: param(mod, 'emitRate'), minEnergy: param(mod, 'minEnergy'), emitCost: param(mod, 'emitCost'), localCap: param(mod, 'localCap') };
}

/** E09 Protein release (SPEC §9 E09, §5.3): an E_PROTEIN producer with the world's recorded E09 numbers. */
function proteinFrom(mod: ModuleRT): ProducerRules {
  return { source: 'E09', emitRate: param(mod, 'emitRate'), minEnergy: param(mod, 'minEnergy'), emitCost: param(mod, 'emitCost'), localCap: param(mod, 'localCap') };
}

/** E10 Matrix builder (SPEC §9 E10, CT §12.6): a shared-construction builder with the world's recorded E10 numbers. */
function builderFrom(mod: ModuleRT): BuilderRules {
  return {
    source: 'E10',
    minEnergy: param(mod, 'minEnergy'),
    ratePerSecond: param(mod, 'rate'),
    bodyFloor: param(mod, 'minBodyMultiple'),
    energyPerC: param(mod, 'energyPerCarbon'),
    filmCap: param(mod, 'filmCap'),
  };
}

function dormancyFrom(mod: ModuleRT): DormancyRules {
  return {
    source: 'E03',
    prepareSeconds: param(mod, 'prepareSeconds'),
    prepareCost: param(mod, 'prepareCost'),
    restMaintenance: param(mod, 'restMaintenance'),
    damageFactor: param(mod, 'damageFactor'),
    wakeSeconds: param(mod, 'wakeSeconds'),
    wakeCost: param(mod, 'wakeCost'),
    wakeMinEnergy: param(mod, 'wakeMinEnergy'),
    lockoutSeconds: param(mod, 'lockoutSeconds'),
    noIntakeSeconds: param(mod, 'noIntakeSeconds'),
    entryMinEnergy: param(mod, 'entryMinEnergy'),
    drySuitability: param(mod, 'drySuitability'),
    drySeconds: param(mod, 'drySeconds'),
    wakeConditionSeconds: param(mod, 'wakeConditionSeconds'),
  };
}

function anchorFrom(mod: ModuleRT): AnchorRules {
  return {
    attachSeconds: param(mod, 'attachSeconds'),
    minEnergy: param(mod, 'minEnergy'),
    attachedUpkeep: param(mod, 'attachedUpkeep'),
    detachNoIntakeSeconds: param(mod, 'detachNoIntakeSeconds'),
    detachEnergy: param(mod, 'detachEnergy'),
    lockoutSeconds: param(mod, 'lockoutSeconds'),
  };
}

function lightSeekerFrom(mod: ModuleRT): LightSeekerRules {
  return {
    baseSpeed: param(mod, 'baseSpeed'),
    lightSensing: param(mod, 'lightSensing'),
    moveCostFactor: param(mod, 'moveCostFactor'),
    brighterBy: param(mod, 'brighterBy'),
  };
}

/** Shift an interval by delta, preserving width, clamped to stay inside the domain. */
export function shiftInterval(
  [a, b]: readonly [number, number],
  delta: number,
  [lo, hi]: readonly [number, number],
): [number, number] {
  const width = b - a;
  let na = a + delta;
  let nb = b + delta;
  if (width >= hi - lo) return [lo, hi];
  if (na < lo) {
    na = lo;
    nb = lo + width;
  }
  if (nb > hi) {
    nb = hi;
    na = hi - width;
  }
  return [na, nb];
}

export function locusG(genome: Genome, locus: number): number {
  return genome.loci[locus]! / 100;
}

/**
 * Loci that act for a genome (CT §6.1–6.2): the template's activity plus module activations. The
 * dormancy threshold acts for native resters and for any E03 carrier.
 */
export function activeLoci(sp: SpeciesRT, genome: Genome): boolean[] {
  const out = [...sp.def.lociActive];
  if (genome.modules.includes('E03')) out[L_DORMANCY] = true;
  if (genome.modules.includes('E07')) out[L_MOTILITY] = true; // E07: the motility locus maps baseSpeed (SPEC §9)
  if (genome.modules.includes('E07')) out[L_SENSING] = true; // E07: the sensing locus maps lightSensing
  return out;
}

export function deriveProfile(sp: SpeciesRT, genome: Genome, modules: readonly ModuleRT[] = []): Profile {
  const def = sp.def;
  const active = activeLoci(sp, genome);
  const g = (l: number) => (active[l] ? locusG(genome, l) : 0.5);

  // E07 (SPEC §9; P3.7): the recorded baseSpeed and lightSensing replace the template's speed and
  // sensing radius as the baselines the motility and sensing loci scale.
  const seekMod = modules.find((m) => m.id === 'E07');
  const lightSeeker = seekMod ? lightSeekerFrom(seekMod) : null;
  const baseSpeed = lightSeeker ? lightSeeker.baseSpeed : def.speed;
  const baseSensing = lightSeeker ? lightSeeker.lightSensing : def.sensingRadius;

  // Quantitative loci (CT §6.1). Inactive loci act as neutral.
  const motilityFactor = 0.5 + g(L_MOTILITY);
  const speed = baseSpeed > 0 ? baseSpeed * motilityFactor : 0;
  const feedFactor = 0.75 + 0.5 * g(L_FEEDING);
  const q = def.intakeRate * feedFactor;
  const sensing =
    active[L_SENSING] && baseSensing >= 1 && baseSensing <= 6
      ? Math.min(6, Math.max(1, Math.round(baseSensing * (0.5 + g(L_SENSING)))))
      : baseSensing;
  const senseMaint = active[L_SENSING] ? 0.75 + 0.5 * g(L_SENSING) : 1;
  const gDiv = g(L_DIVISION);
  const minDivisionAge = def.minDivisionAge * (1.5 - gDiv);
  const divisionCost = 20 * (0.5 + gDiv);

  const ph = shiftInterval(def.tolerances.ph, 2 * (g(L_PH) - 0.5), PH_DOMAIN);
  const salinity = shiftInterval(def.tolerances.salinity, 0.4 * (g(L_SALINITY) - 0.5), UNIT_DOMAIN);
  const warmth = shiftInterval(def.tolerances.warmth, 0.4 * (g(L_WARMTH) - 0.5), UNIT_DOMAIN);

  // Abilities: native first; a module can never duplicate a native ability (validated when the
  // genome is created), so at most one source applies.
  let starch: StarchRules | null = sp.secretesStarch ? NATIVE_STARCH : null;
  let dormancy: DormancyRules | null = sp.abilities.includes('DORMANCY') ? NATIVE_DORMANCY : null;
  let anchor: AnchorRules | null = null;
  let moduleProtein: ProducerRules | null = null; // E09 (never on a native E_PROTEIN producer)
  let moduleBuilder: BuilderRules | null = null; // E10 (never on a native builder)
  let shade: ShadeRules | null = null;
  let debrisFeeder = false;

  // Modules: surcharge is part of maintenance; upkeep and capacities are separate.
  let surchargeRaw = 0;
  let upkeep = 0;
  let energyCap = ENERGY_CAP_BASE;
  for (const mod of modules) {
    surchargeRaw += mod.surcharge;
    if (mod.id === 'E01') starch = starchFrom(mod);
    else if (mod.id === 'E03') dormancy = dormancyFrom(mod);
    else if (mod.id === 'E04') anchor = anchorFrom(mod);
    else if (mod.id === 'E09') moduleProtein = proteinFrom(mod);
    else if (mod.id === 'E10') moduleBuilder = builderFrom(mod);
    else if (mod.id === 'E06') shade = { lightHalf: param(mod, 'lightHalf'), ceilingFactor: param(mod, 'ceilingFactor') };
    else if (mod.id === 'E08') debrisFeeder = true;
    else if (mod.id === 'E05') {
      energyCap += param(mod, 'capacityBonus');
      upkeep += param(mod, 'upkeepPerSecond');
    }
  }
  const multiplier = feedFactor * senseMaint;
  const m = (def.maintenanceRate + surchargeRaw) * multiplier;
  const baseTrigger = dormancy ? dormancy.noIntakeSeconds : DORMANCY_NO_INTAKE_SECONDS;
  const dormancyTriggerSeconds = baseTrigger * (active[L_DORMANCY] ? 1.5 - g(L_DORMANCY) : 1);

  return {
    b0: def.b0,
    q,
    m,
    surcharge: surchargeRaw * multiplier,
    speed,
    sensing,
    motilityFactor,
    minDivisionAge,
    divisionCost,
    divisionMinEnergy: 60,
    energyCap,
    baseEnergyCap: ENERGY_CAP_BASE,
    ph,
    warmth,
    salinity,
    moisture: def.tolerances.moisture,
    dormancyTriggerSeconds,
    policy: genome.policy,
    foods: sp.foods,
    weights: genome.weights,
    modules: genome.modules,
    upkeep,
    lociActive: active,
    starch,
    dormancy,
    oil: sp.abilities.includes('E_OIL_SECRETION') ? NATIVE_OIL : null,
    protein: moduleProtein ?? (sp.abilities.includes('E_PROTEIN_SECRETION') ? NATIVE_PROTEIN : null),
    builder: moduleBuilder ?? (sp.abilities.includes('BIOFILM') ? NATIVE_FILM_BUILDER : null),
    selfPropelled: sp.selfPropelled || lightSeeker !== null,
    anchor,
    lightSeeker,
    shade,
    debrisFeeder,
  };
}
