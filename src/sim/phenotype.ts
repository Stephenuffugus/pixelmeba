/**
 * The shared phenotype function (SPEC §6.2, §8.2, CT §6). One pure function turns
 * (species template, genome, life state) into effective values. The simulation, inspector,
 * previews and validator all call this, so displayed abilities can never diverge from behavior.
 *
 * Factor order: ancestor → body size (Phase 7) → quantitative loci → modules → life stage →
 * colony role → temporary state. Neutral loci (50) reproduce the template exactly.
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
import { ENERGY_CAP_BASE } from './constants';

export interface ModuleRT {
  readonly id: string;
  readonly surcharge: number;
  readonly params: Readonly<Record<string, number>>;
}

export interface Profile {
  readonly b0: number;
  readonly q: number;
  /** Ordinary maintenance per second, inherited multipliers applied once to (M + surcharges). */
  readonly m: number;
  readonly speed: number;
  readonly sensing: number;
  readonly motilityFactor: number;
  readonly minDivisionAge: number;
  /** Division energy cost (20 × (0.5 + g_div) × size × form × role). */
  readonly divisionCost: number;
  readonly divisionMinEnergy: number;
  readonly energyCap: number;
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
}

const PH_DOMAIN: readonly [number, number] = [2, 12];
const UNIT_DOMAIN: readonly [number, number] = [0, 1];

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

export function deriveProfile(sp: SpeciesRT, genome: Genome, modules: readonly ModuleRT[] = []): Profile {
  const def = sp.def;
  const active = def.lociActive;
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
  const dormancyTriggerSeconds = 20 * (active[L_DORMANCY] ? 1.5 - g(L_DORMANCY) : 1);

  // Modules: surcharge is part of maintenance; upkeep and capacities are separate.
  let surcharge = 0;
  let upkeep = 0;
  let energyCap = ENERGY_CAP_BASE;
  for (const mod of modules) {
    surcharge += mod.surcharge;
    if (mod.id === 'E05') {
      energyCap += mod.params.capacityBonus ?? 40;
      upkeep += mod.params.upkeepPerSecond ?? 0.03;
    }
  }
  const m = (def.maintenanceRate + surcharge) * feedFactor * senseMaint;

  return {
    b0: def.b0,
    q,
    m,
    speed,
    sensing,
    motilityFactor,
    minDivisionAge,
    divisionCost,
    divisionMinEnergy: 60,
    energyCap,
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
  };
}
