/**
 * Native abilities the simulation currently implements. Grows phase by phase. The content validator
 * refuses to enable a species whose ability is missing here, so a placeholder can never ship as a
 * harmless-looking no-op (ARCH §4).
 */
import type { NativeAbilityId } from './schema';

export const IMPLEMENTED_NATIVE_ABILITIES: readonly NativeAbilityId[] = ['BIOFILM', 'BRANCHING', 'E_OIL_SECRETION', 'E_PROTEIN_SECRETION', 'E_STARCH_SECRETION', 'HOST_DRAIN', 'LYSIS', 'OXYGEN_SUPPRESSED', 'PREDATION', 'SEDIMENT_WATER_CROSSING', 'TRANSPORT_LINKS'];

/** Supplementary modules the simulation implements (checked the same way; P2.1). */
export const IMPLEMENTED_MODULES: readonly string[] = ['E01', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09', 'E10', 'E12'];
