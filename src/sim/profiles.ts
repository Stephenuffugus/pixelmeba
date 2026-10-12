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

/**
 * P4.13 (D-0066's hash-neutral first step): how often step() drops cached profiles nothing current refers
 * to. A profile is a pure derivation of (species, genome, the world's modules), all fixed for a world, so
 * an evicted entry rebuilt by profileOfGenome is the same values in the same float order: eviction changes
 * memory only, never a result (tests/sim/profile-eviction.test.ts). world.profiles is never saved or hashed
 * (serialize.ts serializeWorld and stateHash write `genomes` from world.genomes.list and never read it).
 */
export const PROFILE_EVICT_TICKS = 600;

/**
 * Drop cached profiles of genomes with no living carrier and no reference from a living organism's birth
 * proposal or reference genome, the held sample, or a branch record (they are rebuilt on demand if read
 * again). Returns how many entries were dropped. Reads columns by slot index only (no key iteration).
 */
export function evictProfiles(world: World): number {
  const P = world.profiles;
  const n = P.length;
  if (n === 0) return 0;
  const keep = new Uint8Array(n);
  const mark = (g: number): void => {
    if (g >= 0 && g < n) keep[g] = 1;
  };
  const c = world.ents.cols;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    mark(c.genome[i]!);
    mark(c.propG0[i]!);
    mark(c.propG1[i]!);
    mark(c.refGenome[i]!);
  }
  const held = world.sample;
  if (held !== null) for (const sg of held.genomes) mark(sg.index);
  for (const b of world.branches.branches) {
    mark(b.refGenome);
    if (b.ancestorGenome !== undefined) mark(b.ancestorGenome);
  }
  let dropped = 0;
  for (let g = 0; g < n; g++) {
    if (keep[g] === 0 && P[g] !== undefined) {
      P[g] = undefined;
      dropped++;
    }
  }
  return dropped;
}
