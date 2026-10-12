/**
 * P4.11 DEMO_MODE scope (ARCH §14; SPEC §17 'demo-scope'; D09 §10 "the first five implemented organism
 * templates, Garden and its three variants, Explore controls, essential inspection, pause, undo, local
 * saves and recipe/picture export"; CONFLICT_REGISTER R22: the web build is full by default).
 *
 * Pure and data-driven: the scope is READ from the content registry (the phase-1 species, the Garden, its
 * What if? ideas and its habitat); the content pack itself is never trimmed, so a demo save carries the same
 * contentHash and save format as the full build's and imports there unchanged. A world the demo cannot hold
 * is refused whole, never partially loaded (D09 line 211); `demoProblem` names what needs the full game.
 *
 * No DOM, no platform API: the worker (src/worker/host.ts) and the UI both import it.
 */
import type { CommandPayload } from '@sim/commands';
import type { ContentRegistry } from '@sim/content/registry';
import { experimentOf } from '@sim/experiments';
import { variantRecordOf } from '@sim/variants';
import type { World } from '@sim/world';

/** The Garden: the one recipe the demo plays (its ideas are its What if? variants). */
export const DEMO_RECIPE = 'FIRST_DISH_V1';

export interface DemoScope {
  /** Species ids (registry order): every enabled species of content phase 1. */
  readonly species: readonly string[];
  readonly recipes: readonly string[];
  /** The Garden's What if? ideas (variants whose sourceId is the Garden). */
  readonly variants: readonly string[];
  /** The Garden's habitat. */
  readonly habitats: readonly string[];
}

/** What demoScope reads: a validated ContentRegistry, or the same records read raw by the UI (src/platform/web.ts). */
export type ScopeSource = Pick<ContentRegistry, 'manifest' | 'speciesIds' | 'species' | 'recipes' | 'variantIds' | 'variants'>;

/** The demo scope of `registry` (nothing outside the registry is ever named). */
export function demoScope(registry: ScopeSource): DemoScope {
  const enabled = registry.manifest.enabledSpecies;
  const species = registry.speciesIds.filter((id) => registry.species[id]?.phase === 1 && enabled.includes(id));
  const garden = registry.recipes[DEMO_RECIPE];
  const recipes = garden ? [DEMO_RECIPE] : [];
  const variants = registry.variantIds.filter((id) => registry.variants[id]?.sourceId === DEMO_RECIPE);
  const habitats = garden ? [garden.habitatId] : [];
  return { species, recipes, variants, habitats };
}

/** What a world uses outside the demo scope: ids (for tests) and display names (for the refusal). */
export interface DemoProblem {
  readonly ids: readonly string[];
  readonly names: readonly string[];
}

/**
 * Null when the demo can hold `world` whole; otherwise what it uses that needs the full game, in this order:
 * living species (the world's species table order), species held in its sample, the recorded experiment
 * card, What if? idea or recipe start, then its habitat. Names come from the world's own content first
 * (species, habitat), then from `registry` (recipe and card names), else the id itself.
 */
export function demoProblem(world: World, scope: DemoScope, registry?: ContentRegistry): DemoProblem | null {
  const ids: string[] = [];
  const names: string[] = [];
  const add = (id: string, name: string): void => {
    if (ids.includes(id)) return;
    ids.push(id);
    names.push(name);
  };
  // Species living in the dish or held in its sample (the sample is an accounted compartment of the dish).
  const used = new Array<boolean>(world.species.length).fill(false);
  const c = world.ents.cols;
  for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1) used[c.species[i]!] = true;
  for (const row of world.sample?.rows ?? []) used[row.cols.species] = true;
  for (let s = 0; s < world.species.length; s++) {
    const sp = world.species[s]!;
    if (used[s] && !scope.species.includes(sp.id)) add(sp.id, sp.def.name);
  }
  // The recorded start: an experiment card (never in the demo), a What if? idea, or a recipe.
  const card = experimentOf(world);
  if (card !== null) add(card, registry?.experiments[card]?.title ?? card);
  const record = variantRecordOf(world);
  if (record && !scope.variants.includes(record.variantId)) add(record.variantId, record.title);
  const recipeId = world.content.provenance.recipeId;
  if (recipeId !== null && !scope.recipes.includes(recipeId)) add(recipeId, registry?.recipes[recipeId]?.name ?? recipeId);
  const habitat = world.content.habitat;
  if (!scope.habitats.includes(habitat.id)) add(habitat.id, habitat.name);
  return ids.length === 0 ? null : { ids, names };
}

/**
 * P4.11 fix round 1: what a command would bring into the dish from outside the demo scope (null: nothing).
 * An 'inoculate' of a species outside the scope, or a 'spawnSpecimen' of a saved specimen whose species is
 * outside it (a specimen kept in a dish whose species has since died out). The worker refuses such a
 * command before it reaches the world, so the demo never makes a dish it cannot open again.
 */
export function demoCommandProblem(world: World, payload: CommandPayload, scope: DemoScope, registry?: ContentRegistry): DemoProblem | null {
  let speciesId: string | null = null;
  if (payload.kind === 'inoculate') speciesId = payload.speciesId;
  else if (payload.kind === 'lineage' && payload.op === 'spawnSpecimen') {
    speciesId = (world.branches.specimens ?? []).find((s) => s.id === payload.specimen)?.speciesId ?? null;
  }
  if (speciesId === null || scope.species.includes(speciesId)) return null;
  const name = world.species.find((sp) => sp.id === speciesId)?.def.name ?? registry?.species[speciesId]?.name ?? speciesId;
  return { ids: [speciesId], names: [name] };
}

/** The worker's refusal of such a command (the ack's error; the dish is unchanged). */
export function demoCommandReason(problem: DemoProblem): string {
  return `${demoNames(problem.names)} needs the full version of Pixelmeba. Nothing changed.`;
}

/** "Dusk", "Dusk and Velvet", "Dusk, Velvet and Threadlace", "Dusk, Velvet, Threadlace and 2 more". */
export function demoNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`;
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

/** The capability reason (D09 line 211): shown inside "Import failed: …. Nothing changed." and "Couldn't open: …". */
export function demoReason(problem: DemoProblem): string {
  return `this dish needs the full version of Pixelmeba (it uses ${demoNames(problem.names)})`;
}

/** The one line the demo's Home shows (no store link until the owner gives one). */
export const DEMO_HOME_LINE = 'This is the free Pixelmeba demo: the Garden, its three What if? ideas and five organisms.';
