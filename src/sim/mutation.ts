/**
 * Daughter genome proposals (SPEC §8.3). Draws happen once per proposal from stateless streams
 * keyed by (worldSeed, stream, parentBirthId, daughterIndex, …) so a proposal can never be rerolled.
 *
 * P0.6 wires the proposal slots; P1.2 fills in the mutation draws.
 */
import type { World } from './world';

export interface DaughterProposal {
  readonly genomes: readonly [number, number];
}

export function proposeDaughters(world: World, parentSlot: number): DaughterProposal {
  const g = world.ents.cols.genome[parentSlot]!;
  return { genomes: [g, g] };
}
