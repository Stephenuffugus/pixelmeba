/**
 * World gates (Phase 3 preflight; g3-plan-recheck P-25). Every rule added after Phase 2 is gated on
 * the WORLD's own recorded manifest, never on a build constant: a saved dish keeps the content and
 * rules it recorded (SPEC §14.5; CLAUDE.md "old saves keep their recorded ruleset"), so a g2 save
 * never gains a Phase 3 rule even while the shipped manifest enables it.
 *
 * Pure: each function reads `world.content.manifest` and nothing else.
 * Equivalent checks that already exist: `world.fields[id] !== undefined` (a system's fields are
 * allocated from that manifest), `world.modules[id] !== undefined`, and structures.ts
 * `structureEnabled`/`paintMaterial`.
 */
import type { SystemFlag } from './fields';
import type { World } from './world';

type Recorded = Pick<World, 'content'>;

/** Whether this world's recorded manifest enables system `id` ('core' is listed by every valid manifest). */
export function worldHasSystem(world: Recorded, id: SystemFlag): boolean {
  return world.content.manifest.enabledSystems.includes(id);
}

/** Whether this world's recorded manifest enables species `id`. */
export function worldHasSpecies(world: Recorded, id: string): boolean {
  return world.content.manifest.enabledSpecies.includes(id);
}

/** Whether this world's recorded manifest enables supplementary module `id`. */
export function worldHasModule(world: Recorded, id: string): boolean {
  return world.content.manifest.enabledModules.includes(id);
}
