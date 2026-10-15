/**
 * Native abilities the simulation currently implements. Grows phase by phase. The content validator
 * refuses to enable a species whose ability is missing here, so a placeholder can never ship as a
 * harmless-looking no-op (ARCH §4).
 */
import type { SystemFlag } from '../fields';
import type { Manifest, NativeAbilityId } from './schema';

export const IMPLEMENTED_NATIVE_ABILITIES: readonly NativeAbilityId[] = ['BIOFILM', 'BRANCHING', 'CANOPY', 'DETRITUS_FALLBACK', 'DORMANCY', 'E_OIL_SECRETION', 'E_PROTEIN_SECRETION', 'E_STARCH_SECRETION', 'HANDLING', 'HOST_DRAIN', 'LOW_LIGHT_CURVE', 'LYSIS', 'MIXOTROPHY', 'OXYGEN_SUPPRESSED', 'PREDATION', 'RADIUS_CAPTURE', 'RESTING_DAUGHTER', 'RIVALRY', 'SEDIMENT_WATER_CROSSING', 'SHELL', 'SIGNAL_GLOW', 'TRANSPORT_LINKS', 'TRAP'];

/**
 * Supplementary modules the simulation implements (checked the same way; P2.1). E02 (Signal glow, wave 11)
 * and E11 (Mineral jacket, wave 13) joined at the organism flip (D-0127); E13–E17 are Phase 7's.
 */
export const IMPLEMENTED_MODULES: readonly string[] = ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09', 'E10', 'E11', 'E12'];

/**
 * Phase 5 structures (S01–S12, CT §4) the simulation implements beyond the cell structures in
 * src/sim/grid.ts STRUCTURE_RECORD_IDS. Since the systems flip (D-0121). The validator refuses to
 * enable a structure listed in neither place, and the import refuses a dish that records one.
 */
export const IMPLEMENTED_STRUCTURES: readonly string[] = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'];

/**
 * Systems (src/sim/fields.ts SYSTEM_FLAGS) the simulation implements, sorted. Since the systems flip
 * (D-0121): the v1.0 systems, barriers, climate and devices, and silicate (wave 10), signals and rivalry
 * (wave 11). "Implemented", not "enabled": the import refuses a dish whose recorded manifest names a
 * system outside this list, and a dish keeps its recorded ruleset. Not equipment or developmental
 * (Phases 6 and 7).
 */
export const IMPLEMENTED_SYSTEMS: readonly SystemFlag[] = ['barriers', 'chemistry', 'climate', 'core', 'devices', 'enzymes', 'film', 'foodObjects', 'fungi', 'parasites', 'rivalry', 'signals', 'silicate', 'viruses'];

/**
 * The newest recorded rules this simulation implements (D-0121, the lead's ceilings). The import refuses
 * a dish whose recorded manifest names a newer version, or developmental changes, with "This dish needs a
 * newer version of Pixelmeba (…)"; the validator refuses a manifest that would ship one, so every new dish
 * reopens. moduleRegistryVersion moved to 3 at the organism flip (D-0127, with the manifest); the Phase 7
 * flip moves the evolution rules, the trait mapping and the registry together and sets developmental
 * (g7-plan call 2).
 */
export const IMPLEMENTED_RULES = {
  simulationVersion: 3,
  evolutionRulesVersion: 1,
  moduleRegistryVersion: 3,
  phenotypeMappingVersion: 1,
  developmental: false,
} as const satisfies Pick<Manifest, 'simulationVersion' | 'evolutionRulesVersion' | 'moduleRegistryVersion' | 'phenotypeMappingVersion'> & { developmental: boolean };

/** The recorded rules versions under IMPLEMENTED_RULES, with the About screen's words for each (strings/about.ts). */
export const RULES_VERSIONS = [
  ['simulationVersion', 'simulation rules'],
  ['evolutionRulesVersion', 'evolution rules'],
  ['moduleRegistryVersion', 'ability registry'],
  ['phenotypeMappingVersion', 'trait mapping'],
] as const satisfies readonly (readonly [keyof typeof IMPLEMENTED_RULES, string])[];
