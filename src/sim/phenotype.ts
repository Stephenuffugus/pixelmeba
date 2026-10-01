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

function param(mod: ModuleRT, key: string): number {
  const v = mod.params[key];
  if (v === undefined || !Number.isFinite(v)) throw new Error(`module ${mod.id} has no parameter "${key}"`);
  return v;
}

function starchFrom(mod: ModuleRT): StarchRules {
  return { source: 'E01', emitRate: param(mod, 'emitRate'), minEnergy: param(mod, 'minEnergy'), emitCost: param(mod, 'emitCost'), localCap: param(mod, 'localCap') };
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
  return out;
}

export function deriveProfile(sp: SpeciesRT, genome: Genome, modules: readonly ModuleRT[] = []): Profile {
  const def = sp.def;
  const active = activeLoci(sp, genome);
  const g = (l: number) => (active[l] ? locusG(genome, l) : 0.5);

  // Quantitative loci (CT §6.1). Inactive loci act as neutral.
  const motilityFactor = 0.5 + g(L_MOTILITY);
  const speed = def.speed > 0 ? def.speed * motilityFactor : 0;
  const feedFactor = 0.75 + 0.5 * g(L_FEEDING);
  const q = def.intakeRate * feedFactor;
  const sensing =
    active[L_SENSING] && def.sensingRadius >= 1 && def.sensingRadius <= 6
      ? Math.min(6, Math.max(1, Math.round(def.sensingRadius * (0.5 + g(L_SENSING)))))
      : def.sensingRadius;
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

  // Modules: surcharge is part of maintenance; upkeep and capacities are separate.
  let surchargeRaw = 0;
  let upkeep = 0;
  let energyCap = ENERGY_CAP_BASE;
  for (const mod of modules) {
    surchargeRaw += mod.surcharge;
    if (mod.id === 'E01') starch = starchFrom(mod);
    else if (mod.id === 'E03') dormancy = dormancyFrom(mod);
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
    oil: null,
    protein: null,
    builder: null,
  };
}
