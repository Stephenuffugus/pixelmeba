/**
 * Founder genomes (SPEC §8.6). Identical: neutral loci, no modules. Varied: each active locus drawn
 * from 45–55 inclusive with the founder.init stream keyed by the founder's birthId. Diverse adds one
 * legal module to 10 % of eligible founders (Phase 2).
 */
import { neutralGenome, type GenomeInput } from './genome';
import { det, STREAMS } from './rng';
import type { World } from './world';

export function founderGenome(world: World, spIdx: number, birthId: number, explicitModules: readonly string[]): number {
  const sp = world.species[spIdx]!;
  const base = neutralGenome(sp.id);
  let loci = base.loci;
  const mode = world.settings.founderMode;
  if (mode === 'varied' || mode === 'diverse') {
    loci = base.loci.map((v, l) => (sp.def.lociActive[l] ? 45 + (det(world.seed, STREAMS.founderInit, birthId, l) % 11) : v));
  }
  const modules = [...explicitModules].sort();
  const input: GenomeInput = { ...base, loci, modules };
  return world.genomes.intern(input);
}
