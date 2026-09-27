/** Profile cache keyed by genome index (derived, never saved). */
import { deriveProfile, type ModuleRT, type Profile } from './phenotype';
import type { World } from './world';

export function profileOfGenome(world: World, genomeIdx: number, speciesIdx: number): Profile {
  const cached = world.profiles[genomeIdx];
  if (cached) return cached;
  const g = world.genomes.get(genomeIdx);
  const sp = world.species[speciesIdx]!;
  if (g.ancestor !== sp.id) throw new Error(`genome ${g.id} belongs to ${g.ancestor}, not ${sp.id}`);
  const mods: ModuleRT[] = g.modules.map((id) => {
    const m = world.modules[id];
    if (!m) throw new Error(`module ${id} is not in this world's registry`);
    return m;
  });
  const p = deriveProfile(sp, g, mods);
  world.profiles[genomeIdx] = p;
  return p;
}

export function profileOf(world: World, slot: number): Profile {
  const c = world.ents.cols;
  return profileOfGenome(world, c.genome[slot]!, c.species[slot]!);
}
