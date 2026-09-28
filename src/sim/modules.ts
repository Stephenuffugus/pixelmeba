/**
 * Supplementary module registry at run time (SPEC §9, CT §7.1–7.2; P2.1).
 *
 * A world records the module definitions it was created with (world.content.modules, the versioned
 * registry for manifest.moduleRegistryVersion), so eligibility is always read from the world, never
 * from the build's current content: a new registry never changes an existing dish's options.
 *
 * Every rule is checked when a genome is *proposed* (founder creation, daughter proposals): a gain is
 * drawn uniformly from the options whose resulting set is legal, and a loss uniformly from the carried
 * modules whose removal leaves a legal set. Nothing ever deletes a conflicting module afterwards.
 */
import { MODULE_SLOTS, moduleSetProblem } from './content/moduleRules';
import type { ModuleDef, Species } from './content/schema';
import type { Genome } from './genome';
import type { World } from './world';

export { MODULE_SLOTS } from './content/moduleRules';

function speciesDef(world: World, ancestor: string): Species {
  const sp = world.species.find((s) => s.id === ancestor);
  if (!sp) throw new Error(`species ${ancestor} is not enabled in this world`);
  return sp.def;
}

/** The world's recorded module definitions, sorted by stable id (canonical draw order). */
export function registryOf(world: World): readonly ModuleDef[] {
  return world.content.modules;
}

export function moduleDef(world: World, id: string): ModuleDef | undefined {
  return world.content.modules.find((d) => d.id === id);
}

/** First problem with a complete module set for this ancestor in this world, or null when legal. */
export function validateModuleSet(world: World, ancestor: string, modules: readonly string[]): string | null {
  return moduleSetProblem(registryOf(world), speciesDef(world, ancestor), modules);
}

/** Modules a genome could gain: uniform draw list, sorted by id, each giving a legal set. */
export function eligibleGains(world: World, g: Pick<Genome, 'ancestor' | 'modules'>): string[] {
  if (g.modules.length >= MODULE_SLOTS) return [];
  const sp = speciesDef(world, g.ancestor);
  const defs = registryOf(world);
  const out: string[] = [];
  for (const def of defs) {
    if (g.modules.includes(def.id)) continue;
    const next = [...g.modules, def.id].sort();
    if (moduleSetProblem(defs, sp, next) === null) out.push(def.id);
  }
  return out.sort();
}

/** Carried modules whose loss leaves a legal set (e.g. never E12 alone while E15 requires it). */
export function lossOptions(world: World, g: Pick<Genome, 'ancestor' | 'modules'>): string[] {
  const sp = speciesDef(world, g.ancestor);
  const defs = registryOf(world);
  return g.modules.filter((id) => moduleSetProblem(defs, sp, g.modules.filter((m) => m !== id)) === null);
}

export function hasModule(g: Pick<Genome, 'modules'>, id: string): boolean {
  return g.modules.includes(id);
}
