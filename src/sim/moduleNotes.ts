/**
 * What a module (an inheritable ability) can make a dish note about its carriers (P3.8 Field Guide
 * "Seen in your dishes"; lead fix 4a). Relationships are noted for species, never for an ability
 * (src/worker/relationships.ts), but an ability can be the mechanism behind one:
 *   - 'converts' <enzyme>: credited where a living organism's profile holds that enzyme's producer
 *     rules (snapshot.ts producersNear reads prof.starch / prof.oil / prof.protein);
 *   - 'eats' detritus: the E08 route in stage 6 (intake.ts ROUTE_DETRITUS, gated by prof.debrisFeeder)
 *     marks the detritus pool in the intake record the watcher reads.
 * Derived, not listed: each eligible enabled ancestor's neutral profile is built with and without the
 * module (deriveProfile, the profile every organism of that genome uses) and a relationship counts when
 * the module is what turns that rule on. Pure; reads content only.
 */
import type { ModuleDef, Species } from './content/schema';
import { neutralGenome } from './genome';
import { deriveProfile, type Profile } from './phenotype';
import { REACTION_ENZYMES, type ReactionEnzyme } from './reactions';
import { buildSpeciesTable } from './species';
import { buildModuleTable } from './world';

export interface ModuleNotes {
  /** Enzymes whose conversions a carrier can be credited with because of this module. */
  readonly converts: readonly ReactionEnzyme[];
  /** Food pools a carrier can be noted eating because of this module. */
  readonly eats: readonly string[];
}

/** The producer rules producersNear() reads for an enzyme. */
function producerRules(p: Profile, enzyme: ReactionEnzyme): unknown {
  return enzyme === 'starch' ? p.starch : enzyme === 'oil' ? p.oil : p.protein;
}

/** `species`: the enabled species records (the module's eligible ancestors among them are tried). */
export function moduleNotes(mod: ModuleDef, species: readonly Species[]): ModuleNotes {
  const table = buildSpeciesTable(species);
  const rt = buildModuleTable([mod])[mod.id]!;
  const converts: ReactionEnzyme[] = [];
  const eats: string[] = [];
  for (const sp of table) {
    if (!mod.eligibleAncestors.includes(sp.id)) continue;
    const genome = { ...neutralGenome(sp.id), id: 'guide' };
    const without = deriveProfile(sp, genome, []);
    const withMod = deriveProfile(sp, { ...genome, modules: [mod.id] }, [rt]);
    for (const enzyme of REACTION_ENZYMES) {
      if (
        producerRules(without, enzyme) === null &&
        producerRules(withMod, enzyme) !== null &&
        !converts.includes(enzyme)
      )
        converts.push(enzyme);
    }
    if (
      !without.debrisFeeder &&
      withMod.debrisFeeder &&
      !without.foods.includes('detritus') &&
      !eats.includes('detritus')
    )
      eats.push('detritus');
  }
  return { converts: REACTION_ENZYMES.filter((e) => converts.includes(e)), eats };
}
