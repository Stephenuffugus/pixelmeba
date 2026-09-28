/**
 * Founder genomes (SPEC §8.6). Identical: neutral loci, no modules. Varied: each active locus drawn
 * from 45–55 inclusive with the founder.init stream keyed by the founder's birthId. Diverse adds one
 * legal module to 10 % of eligible founders (P2.2).
 *
 * Explicit founder modules (recipes, specimens) must form a legal set for the ancestor under the
 * world's recorded registry (SPEC §9; P2.1): an illegal set is refused, never trimmed.
 */
import { neutralGenome, type GenomeInput } from './genome';
import { validateModuleSet } from './modules';
import { activeLoci } from './phenotype';
import { det, STREAMS } from './rng';
import type { World } from './world';

export class ModuleSetError extends Error {}

export function founderGenome(world: World, spIdx: number, birthId: number, explicitModules: readonly string[]): number {
  const sp = world.species[spIdx]!;
  const base = neutralGenome(sp.id);
  const modules = [...explicitModules].sort();
  const problem = validateModuleSet(world, sp.id, modules);
  if (problem) throw new ModuleSetError(`founder ${sp.id}: ${problem}`);
  let loci = base.loci;
  const mode = world.settings.founderMode;
  if (mode === 'varied' || mode === 'diverse') {
    // Loci that act for this founder's genome (an E03 founder also varies its dormancy threshold).
    const active = activeLoci(sp, { ...base, modules, id: '' });
    loci = base.loci.map((v, l) => (active[l] ? 45 + (det(world.seed, STREAMS.founderInit, birthId, l) % 11) : v));
  }
  const input: GenomeInput = { ...base, loci, modules };
  return world.genomes.intern(input);
}
