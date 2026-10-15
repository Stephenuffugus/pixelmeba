/**
 * Phase 5 habitat helpers (P5.4; wave 14 habitat-geometry; D-0128).
 *
 * realizeGoldenEntries() is the step 0 recipe of tests/fixtures/habitats-p5/realize-golden.json: it was
 * written by the UNMODIFIED HEAD code before the habitat geometry landed, and
 * tests/fixtures/habitats-p5-equivalence.test.ts recomputes it with the new code.
 */
import { createHash } from 'node:crypto';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { canonicalJson } from '../../src/sim/hash';
import { applyRecipeOverrides, realizeRecipe, type RecipeOverridesRecord, type RecipeWorldProvenance } from '../../src/sim/recipes';
import { loadRegistryFs } from '../../tools/lib/content-fs';
import { registryWith } from './registry';
import { serializeWorld, stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { realizeVariant } from '../../src/sim/variants';
import type { World } from '../../src/sim/world';

export interface RealizeGoldenEntry {
  readonly key: string;
  /** sha256 of canonicalJson(serializeWorld(world)) at tick 0, contentHash blanked. */
  readonly serialized: string;
  /** stateHash after run(world, 300), contentHash blanked. */
  readonly stateHash300: string;
}

export const REALIZE_GOLDEN_HOW =
  "Written by the UNMODIFIED HEAD code (1c9d8a2) before wave 14's habitat geometry (step 0a), under the shipped registry (loadRegistryFs()). Entries: every recipe of registry.recipeIds with phase <= buildPhase (realizeRecipe(registry, id)); the three v1.0 New Dish starts, each realized as host.ts build() does: realizeRecipe(registry, 'FIRST_DISH_V1', { seed: 104729, worldId: 'golden', transform: (r) => applyRecipeOverrides(r, o) }) with o = { empty: true }, { empty: true, habitatId: 'GEL_COLONY' } and { empty: true, habitatId: 'SEDIMENT_EDGE' }; every What if? variant of registry.variantIds with phase <= buildPhase (await realizeVariant(registry, id)). Right after realization the world's content is replaced by a copy whose manifest.contentHash is '' (and, for a variant, whose provenance.variant.contentHash and initialStateHash are '': both record the contentHash, which the habitat files move). serialized = sha256 hex of canonicalJson(serializeWorld(world)) at tick 0; stateHash300 = stateHash(world) after run(world, 300). Recompute: tests/helpers/habitats.ts realizeGoldenEntries().";

/** The world with every record of the content hash blanked (the only thing new content files may move). */
function blankContentHash(world: World): void {
  const prov = world.content.provenance as unknown as Record<string, unknown>;
  const variant = prov.variant as Record<string, unknown> | undefined;
  (world as { content: World['content'] }).content = {
    ...world.content,
    manifest: { ...world.content.manifest, contentHash: '' },
    provenance: (variant ? { ...prov, variant: { ...variant, contentHash: '', initialStateHash: '' } } : prov) as unknown as World['content']['provenance'],
  };
}

function entry(key: string, world: World): RealizeGoldenEntry {
  blankContentHash(world);
  const serialized = createHash('sha256').update(canonicalJson(serializeWorld(world))).digest('hex');
  run(world, 300);
  return { key, serialized, stateHash300: stateHash(world) };
}

export const V1_NEW_DISH_STARTS: readonly { readonly key: string; readonly overrides: RecipeOverridesRecord }[] = [
  { key: 'newDish:empty', overrides: { empty: true } },
  { key: 'newDish:empty:GEL_COLONY', overrides: { empty: true, habitatId: 'GEL_COLONY' } },
  { key: 'newDish:empty:SEDIMENT_EDGE', overrides: { empty: true, habitatId: 'SEDIMENT_EDGE' } },
];

export async function realizeGoldenEntries(reg: ContentRegistry): Promise<RealizeGoldenEntry[]> {
  const out: RealizeGoldenEntry[] = [];
  const phase = reg.manifest.buildPhase;
  for (const id of reg.recipeIds) {
    if (reg.recipes[id]!.phase > phase) continue;
    out.push(entry(`recipe:${id}`, realizeRecipe(reg, id)));
  }
  for (const s of V1_NEW_DISH_STARTS) {
    out.push(entry(s.key, realizeRecipe(reg, 'FIRST_DISH_V1', { seed: 104729, worldId: 'golden', transform: (r) => applyRecipeOverrides(r, s.overrides) })));
  }
  for (const id of reg.variantIds) {
    if (reg.variants[id]!.phase > phase) continue;
    out.push(entry(`variant:${id}`, await realizeVariant(reg, id)));
  }
  return out;
}

// ------------------------------------------------------------------ the eight Phase 5 habitats (P5.4)

/** The Phase 5 habitat records (CT §8.2; D-0128), sorted. Not enabled in the shipped manifest. */
export const HABITAT_IDS = [
  'H04_LEAF_POOL',
  'H05_BRINE_MOSAIC',
  'H06_DUSK_MARSH',
  'H07_GLASS_GARDEN',
  'H08_NIGHT_LANTERNS',
  'H09_DRYING_LACE',
  'H10_GATE_LAB',
  'H11_GRAZING_MEADOW',
] as const;
export type HabitatId = (typeof HABITAT_IDS)[number];

let cachedHabitatRegistry: ContentRegistry | null = null;
/** The shipped registry with the eight habitats enabled (every structure, system and material they use is shipped). */
export function habitatRegistry(): ContentRegistry {
  cachedHabitatRegistry ??= registryWith({ enabledHabitats: [...loadRegistryFs().manifest.enabledHabitats, ...HABITAT_IDS].sort() });
  return cachedHabitatRegistry;
}

/**
 * A New Dish habitat start (Empty, plus `extra` choices), realized as host.ts build() does it, with the
 * provenance host.ts recipeProvenance records.
 */
export function habitatStart(reg: ContentRegistry, habitatId: string, extra: RecipeOverridesRecord = {}, seed = 104729): World {
  const o: RecipeOverridesRecord = { empty: true, habitatId, ...extra };
  return realizeRecipe(reg, 'FIRST_DISH_V1', {
    seed,
    worldId: `habitat-${habitatId}-s${seed}`,
    transform: (r) => applyRecipeOverrides(r, o),
    provenance: { recipeId: 'FIRST_DISH_V1', recipeRevision: reg.recipes.FIRST_DISH_V1?.revision ?? null, createdFrom: 'recipe', overrides: { seed, ...o } } as RecipeWorldProvenance,
  });
}
