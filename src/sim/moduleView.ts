/**
 * Observation helpers for supplementary modules and dormancy (SPEC §9, §7.6, §12.1; P2.1). Pure
 * reads of authoritative state for the inspector and the renderer's visual layers: nothing here is
 * read back by the simulation, and every value maps to a recorded rule or a measured column.
 */
import { FLAG, LIFE_ACTIVE, LIFE_RESTING } from './entities';
import { dormancyReason, wakeConditions, type DormancyReason } from './dormancy';
import type { Profile } from './phenotype';
import { profileOf } from './profiles';
import { R } from './reasons';
import type { World } from './world';

/**
 * Reserve-pocket fill band 0–3 (UX §6.2 "four fill bands"): 0 while energy is at or below the base
 * cap (the chamber's extra room is empty), then 1, 2, 3 for up to one third, two thirds and more
 * than two thirds of the extra room in use. Only for E05 carriers; 0 otherwise.
 */
export function reserveBand(E: number, prof: Profile): number {
  const room = prof.energyCap - prof.baseEnergyCap;
  if (room <= 0 || E <= prof.baseEnergyCap) return 0;
  return Math.min(3, Math.max(1, Math.ceil((3 * (E - prof.baseEnergyCap)) / room - 1e-9)));
}

export interface ModuleSummary {
  readonly id: string;
  readonly name: string;
  readonly surchargePerSecond: number;
  readonly params: Readonly<Record<string, number>>;
  readonly activeNow: boolean;
}

/**
 * Carried modules with their recorded numbers from the world's registry (sorted by id). The surcharge
 * is the one this organism is actually charged: the registry rate scaled by its inherited cost
 * multipliers (the profile's surcharge shared out in proportion to the registry rates), so the module
 * card, the upkeep line and the lineage "Game rule:" lines quote the same number.
 */
export function moduleSummaries(world: World, i: number): ModuleSummary[] {
  const c = world.ents.cols;
  const g = world.genomes.get(c.genome[i]!);
  const defs = g.modules.map((id) => {
    const def = world.content.modules.find((d) => d.id === id);
    if (!def) throw new Error(`module ${id} is not in this world's registry`);
    return def;
  });
  let raw = 0;
  for (const def of defs) raw += def.surchargePerSecond;
  const scale = raw > 0 ? profileOf(world, i).surcharge / raw : 1;
  return defs.map((def) => {
    const id = def.id;
    const activeNow = id === 'E01' ? c.secreting[i] === 1 : id === 'E03' ? c.lifeState[i] !== LIFE_ACTIVE : id === 'E05';
    return { id, name: def.name, surchargePerSecond: def.surchargePerSecond * scale, params: { ...def.params }, activeNow };
  });
}

export interface UpkeepSummary {
  readonly resting: boolean;
  readonly maintenance: number;
  readonly surcharge: number;
  readonly chamber: number;
}

/** Energy per second stage 7 charges in the organism's current state (movement excluded). */
export function upkeepNow(world: World, i: number): UpkeepSummary {
  const prof = profileOf(world, i);
  const rest = world.ents.cols.lifeState[i] === LIFE_RESTING ? prof.dormancy : null;
  if (rest) return { resting: true, maintenance: rest.restMaintenance, surcharge: 0, chamber: 0 };
  return { resting: false, maintenance: prof.m - prof.surcharge, surcharge: prof.surcharge, chamber: prof.upkeep };
}

export interface DormancySummary {
  readonly source: string;
  readonly state: number;
  readonly cause: number;
  readonly stateSeconds: number;
  readonly lockoutSeconds: number;
  readonly noIntakeSeconds: number;
  readonly triggerSeconds: number;
  readonly drySeconds: number;
  readonly dryTriggerSeconds: number;
  readonly wake: { readonly food: boolean; readonly moisture: boolean; readonly environment: boolean };
  readonly rules: {
    readonly prepareSeconds: number;
    readonly prepareCost: number;
    readonly restMaintenance: number;
    readonly damageFactor: number;
    readonly wakeSeconds: number;
    readonly wakeCost: number;
    readonly wakeMinEnergy: number;
    readonly lockoutSeconds: number;
    readonly entryMinEnergy: number;
    readonly wakeConditionSeconds: number;
  };
  /** The dormancy state reason (SPEC §12.2 States) from the saved clocks: DORMANCY_LOCKOUT after waking. */
  readonly reason: Readonly<DormancyReason>;
}

/** The dormancy machine as recorded for this organism, or null when it cannot rest. */
export function dormancySummary(world: World, i: number): DormancySummary | null {
  const prof = profileOf(world, i);
  const rules = prof.dormancy;
  if (!rules) return null;
  const c = world.ents.cols;
  const state = c.lifeState[i]!;
  const active = state === LIFE_ACTIVE;
  return {
    source: rules.source,
    state,
    cause: active ? R.NONE : (c.flags[i]! & FLAG.restDry) !== 0 ? R.RESTING_DRY : R.RESTING_FOOD_SCARCE,
    stateSeconds: active ? 0 : c.stateTimer[i]!,
    lockoutSeconds: c.lockoutTimer[i]!,
    noIntakeSeconds: active ? c.stateTimer[i]! : 0,
    triggerSeconds: prof.dormancyTriggerSeconds,
    drySeconds: active ? c.dryTimer[i]! : 0,
    dryTriggerSeconds: rules.drySeconds,
    wake: wakeConditions(world, i, prof, rules),
    rules: {
      prepareSeconds: rules.prepareSeconds,
      prepareCost: rules.prepareCost,
      restMaintenance: rules.restMaintenance,
      damageFactor: rules.damageFactor,
      wakeSeconds: rules.wakeSeconds,
      wakeCost: rules.wakeCost,
      wakeMinEnergy: rules.wakeMinEnergy,
      lockoutSeconds: rules.lockoutSeconds,
      entryMinEnergy: rules.entryMinEnergy,
      wakeConditionSeconds: rules.wakeConditionSeconds,
    },
    reason: dormancyReason(world, i, prof),
  };
}
