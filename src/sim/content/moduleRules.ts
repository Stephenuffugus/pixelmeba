/**
 * Supplementary-module rules that content validation and the simulation share (SPEC §9, CT §7).
 * Pure data and pure functions: no world, no randomness. The module *definitions* (eligibility,
 * exclusions, numbers) are content; this file only says which native ability each module duplicates
 * and which parameters an implemented module reads, so a pack can never enable a module whose
 * numbers are missing.
 */
import type { ModuleDef, NativeAbilityId, Species } from './schema';

/** Three supplementary slots per genome (SPEC §9). Native abilities never occupy a slot. */
export const MODULE_SLOTS = 3;

/** The native ability a module duplicates; a species with that ability can never gain it (CT §7.2). */
export const MODULE_NATIVE_ABILITY: Readonly<Record<string, NativeAbilityId>> = {
  E01: 'E_STARCH_SECRETION',
  E02: 'SIGNAL_GLOW',
  E03: 'DORMANCY',
  E06: 'LOW_LIGHT_CURVE',
  E09: 'E_PROTEIN_SECRETION',
};

/** Parameters each implemented module reads from its (versioned) content record. */
export const MODULE_REQUIRED_PARAMS: Readonly<Record<string, readonly string[]>> = {
  E01: ['emitRate', 'minEnergy', 'emitCost', 'localCap'],
  E03: [
    'prepareSeconds',
    'prepareCost',
    'restMaintenance',
    'damageFactor',
    'wakeSeconds',
    'wakeCost',
    'wakeMinEnergy',
    'lockoutSeconds',
    'noIntakeSeconds',
    'entryMinEnergy',
    'drySuitability',
    'drySeconds',
    'wakeConditionSeconds',
  ],
  E05: ['capacityBonus', 'upkeepPerSecond'],
};

/** Categories that can never carry a supplementary module (SPEC §9). */
const NO_MODULE_CATEGORIES: readonly Species['category'][] = ['virus', 'parasite'];

/**
 * Why a species cannot carry this module at all (independent of what else it carries), or null.
 * Eligibility is by ancestor ID in the module's own record; a native equivalent is refused both by
 * the record's `nativeEquivalents` list and by the species' recorded native abilities.
 */
export function moduleIneligibility(def: ModuleDef, species: Species): string | null {
  if (NO_MODULE_CATEGORIES.includes(species.category)) return `${species.id} is a ${species.category} and carries no modules`;
  if (def.nativeEquivalents.includes(species.id)) return `${species.id} has ${def.id} natively`;
  const native = MODULE_NATIVE_ABILITY[def.id];
  if (native !== undefined && species.nativeAbilities.includes(native)) return `${species.id} already has ${native} natively`;
  if (!def.eligibleAncestors.includes(species.id)) return `${species.id} is not eligible for ${def.id}`;
  return null;
}

/**
 * Validate a complete module set for one species against a registry (the world's recorded module
 * definitions). Returns the first problem, or null when the set is legal: every module known and
 * eligible, no duplicates, sorted, at most three, no mutual exclusion, every prerequisite present.
 */
export function moduleSetProblem(defs: readonly ModuleDef[], species: Species, modules: readonly string[]): string | null {
  if (modules.length > MODULE_SLOTS) return `at most ${MODULE_SLOTS} supplementary modules (got ${modules.length})`;
  for (let k = 0; k < modules.length; k++) {
    if (k > 0 && modules[k - 1]! >= modules[k]!) return 'modules must be sorted and unique';
    const id = modules[k]!;
    const def = defs.find((d) => d.id === id);
    if (!def) return `module ${id} is not in this registry`;
    const why = moduleIneligibility(def, species);
    if (why) return why;
    for (const x of def.excludes) if (modules.includes(x)) return `${id} cannot be combined with ${x}`;
    for (const r of def.requires) if (!modules.includes(r)) return `${id} requires ${r}`;
  }
  // Exclusions are mutual even when only one record lists them.
  for (const def of defs) {
    if (!modules.includes(def.id)) continue;
    for (const other of defs) if (other.excludes.includes(def.id) && modules.includes(other.id)) return `${other.id} cannot be combined with ${def.id}`;
  }
  return null;
}

/** Missing required parameters for an implemented module record (empty when complete). */
export function missingModuleParams(def: ModuleDef): string[] {
  const need = MODULE_REQUIRED_PARAMS[def.id] ?? [];
  return need.filter((k) => def.params[k] === undefined);
}
