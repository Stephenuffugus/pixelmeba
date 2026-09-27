/**
 * Species runtime tables derived once per world from the world's embedded content snapshot.
 * Entities store a species *index* into world.species; saves store the ID list, so indices are
 * stable within a world and remapped explicitly on load.
 */
import type { FieldId } from './fields';
import type { Food, NativeAbilityId, Species } from './content/schema';
import { SUB_GEL, SUB_SEDIMENT, SUB_WATER } from './grid';

export const PREY_NONE = -1;
export const PREY_ANY = 0;
export const PREY_FREE = 1;
export const PREY_IN_SEDIMENT = 2;

export const FOOD_FIELD: Readonly<Record<Food, FieldId>> = {
  sugar: 'sugar',
  starch: 'starch',
  oil: 'oil',
  protein: 'protein',
  broth: 'broth',
  detritus: 'detritus',
  metabolite: 'metabolite',
  film: 'film',
};

export interface SpeciesRT {
  readonly idx: number;
  readonly id: string;
  readonly def: Species;
  /** Bit 0 water, bit 1 gel, bit 2 sediment. */
  readonly habitatMask: number;
  readonly attached: boolean;
  readonly foods: readonly FieldId[];
  readonly aerobic: boolean;
  readonly anaerobic: boolean;
  readonly photosynthetic: boolean;
  readonly mixotroph: boolean;
  readonly isPredator: boolean;
  readonly selfPropelled: boolean;
  /** Per prey species index: PREY_* requirement. */
  readonly prey: Int8Array;
  /** Per prey species index: required continuous contact seconds (0 = immediate). */
  readonly preyContact: Float64Array;
  readonly abilities: readonly NativeAbilityId[];
  readonly secretesStarch: boolean;
  readonly inhibitorField: FieldId | null;
  readonly fungal: boolean;
}

export function habitatBit(sub: number): number {
  return sub === SUB_WATER ? 1 : sub === SUB_GEL ? 2 : sub === SUB_SEDIMENT ? 4 : 0;
}

export function buildSpeciesTable(defs: readonly Species[]): SpeciesRT[] {
  const ids = defs.map((d) => d.id);
  return defs.map((def, idx) => {
    let habitatMask = 0;
    for (const h of def.habitats) habitatMask |= h === 'water' ? 1 : h === 'gel' ? 2 : 4;
    const prey = new Int8Array(defs.length).fill(PREY_NONE);
    const preyContact = new Float64Array(defs.length);
    for (const p of def.prey) {
      const j = ids.indexOf(p.id);
      if (j < 0) continue; // prey outside this world's manifest is simply absent
      prey[j] = p.requires === 'any' ? PREY_ANY : p.requires === 'free' ? PREY_FREE : PREY_IN_SEDIMENT;
      preyContact[j] = p.contactSeconds ?? 0;
    }
    const abilities = def.nativeAbilities;
    const inhibitorField: FieldId | null =
      def.category === 'bacterium'
        ? 'inhBact'
        : def.category === 'yeast' || def.category === 'fungus'
          ? 'inhFung'
          : def.category === 'alga'
            ? 'inhPhoto'
            : null;
    return {
      idx,
      id: def.id,
      def,
      habitatMask,
      attached: def.attachment !== null,
      foods: def.foodPriority.filter((f) => f !== 'film').map((f) => FOOD_FIELD[f]),
      aerobic: def.metabolism === 'aerobic' || def.metabolism === 'mixotroph',
      anaerobic: def.metabolism === 'anaerobic',
      photosynthetic: def.metabolism === 'photosynthesis' || def.metabolism === 'mixotroph',
      mixotroph: def.metabolism === 'mixotroph',
      isPredator: abilities.includes('PREDATION'),
      selfPropelled: def.speed > 0,
      prey,
      preyContact,
      abilities,
      secretesStarch: abilities.includes('E_STARCH_SECRETION'),
      inhibitorField,
      fungal: def.category === 'fungus',
    };
  });
}
