/**
 * The trajectory fence (tests/fixtures/fence.json; Phase 3 preflight; g3-plan lines 128–134,
 * g3-plan-recheck P-22, P-23).
 *
 * Each entry names a world (a recipe, optionally transformed; a test-only recipe file; a What if?
 * variant; or one arm of an experiment card), the dish tick at which it is digested, and two digests:
 *   - g2Digest: trajectoryDigest(world, 'g2') with the world realized under registryWith(G2_LISTS),
 *     the Phase 2 content set. Permanent (check (a), tests/fixtures/trajectory-fence{,-arms}.test.ts): it
 *     proves no later rule leaks into Phase 2 content. null for entries added after g2.
 *   - currentDigest: trajectoryDigest(world, 'full') with the world realized under the shipped
 *     manifest (check (b), tests/fixtures/trajectory-fence-current*.test.ts).
 *   - changedBy: the DECISIONS ids under which a recorded digest was re-recorded with a new value.
 * Only tools/fence-update.ts writes the digests.
 *
 * Test-only recipe files (kind 'recipeFile', D-0121): a RecipeDef under tests/fixtures/fence-recipes/,
 * never in content/ (a content recipe would appear in the game). It is parsed with RecipeSchema and
 * realized by realizeRecipe under the given registry exactly as a content recipe is (its scheduled
 * commands are queued as the recipe's commands), so it can fence dishes no shipped recipe makes (the
 * light cycle, structures placed by command). Added with `tools/fence-update.ts --add-file <path>`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { RecipeSchema, type RecipeDef } from '../../src/sim/content/schema';
import { realizeExperimentArms } from '../../src/sim/experiments';
import { realizeRecipe } from '../../src/sim/recipes';
import { run } from '../../src/sim/tick';
import { realizeVariant } from '../../src/sim/variants';
import type { World } from '../../src/sim/world';
import { REPO_ROOT } from '../../tools/lib/content-fs';
import { trajectoryDigest, type DigestMode } from './trajectory';

export const FENCE_PATH = join(REPO_ROOT, 'tests', 'fixtures', 'fence.json');

/** Named recipe transforms a fence entry (or a g2 save) may apply. */
export const FENCE_TRANSFORMS = {
  /** STARCH_UNLOCK_V1's founders as Sprinters (B01) carrying Starch release (E01): no g2 content seeds E01, and B06 cannot carry it. */
  e01Carriers: (r: RecipeDef): RecipeDef => ({ ...r, founders: r.founders.map((f) => ({ ...f, species: 'B01', modules: ['E01'] })) }),
} as const;
export type FenceTransform = keyof typeof FENCE_TRANSFORMS;

export interface FenceChange {
  readonly decision: string;
  readonly field: 'g2Digest' | 'currentDigest';
}

interface FenceBase {
  /** Unique entry id: the recipe id for a plain recipe entry. */
  readonly id: string;
  /** Dish tick at which the world is digested. */
  readonly ticks: number;
  g2Digest: string | null;
  currentDigest: string | null;
  changedBy: FenceChange[];
}

export type FenceEntry = FenceBase &
  (
    | { readonly kind: 'recipe'; readonly recipe: string; readonly transform?: FenceTransform }
    /** A test-only recipe file: `file` is its path relative to the repository root (tests/fixtures/fence-recipes/). */
    | { readonly kind: 'recipeFile'; readonly file: string }
    | { readonly kind: 'variant'; readonly variant: string }
    | { readonly kind: 'experimentArm'; readonly experiment: string; readonly arm: 'A' | 'B' }
  );

export interface FenceFile {
  readonly about: string;
  readonly entries: FenceEntry[];
}

export function readFence(path: string = FENCE_PATH): FenceFile {
  return JSON.parse(readFileSync(path, 'utf8')) as FenceFile;
}

/** fence.json's text: entries in file order with a fixed key order, two-space indent, trailing newline. */
export function fenceText(file: FenceFile): string {
  const entries = file.entries.map((e) => {
    const head =
      e.kind === 'recipe'
        ? { id: e.id, kind: e.kind, recipe: e.recipe, ...(e.transform ? { transform: e.transform } : {}) }
        : e.kind === 'recipeFile'
          ? { id: e.id, kind: e.kind, file: e.file }
          : e.kind === 'variant'
            ? { id: e.id, kind: e.kind, variant: e.variant }
            : { id: e.id, kind: e.kind, experiment: e.experiment, arm: e.arm };
    return { ...head, ticks: e.ticks, g2Digest: e.g2Digest, currentDigest: e.currentDigest, changedBy: e.changedBy.map((c) => ({ decision: c.decision, field: c.field })) };
  });
  return `${JSON.stringify({ about: file.about, entries }, null, 2)}\n`;
}

export function writeFence(file: FenceFile, path: string = FENCE_PATH): void {
  writeFileSync(path, fenceText(file));
}

/**
 * The fence's two halves, each checked by its own test files so every file stays well under a minute
 * on an idle machine (the simulation runs about 2.8× slower under vitest than under tsx):
 * 'recipes' (recipe entries, with or without a transform, and test-only recipe files) and 'arms'
 * (What if? variants and experiment arms).
 */
export type FenceGroup = 'recipes' | 'arms';

export function fenceGroup(entries: readonly FenceEntry[], group: FenceGroup): FenceEntry[] {
  return entries.filter((e) => (e.kind === 'recipe' || e.kind === 'recipeFile') === (group === 'recipes'));
}

/** A one-line description of what an entry realizes. */
export function describeEntry(e: FenceEntry): string {
  if (e.kind === 'recipe') return `recipe ${e.recipe}${e.transform ? ` (${e.transform})` : ''} to tick ${e.ticks}`;
  if (e.kind === 'recipeFile') return `test-only recipe ${e.file} to tick ${e.ticks}`;
  if (e.kind === 'variant') return `variant ${e.variant} to tick ${e.ticks}`;
  return `${e.experiment} arm ${e.arm} to tick ${e.ticks}`;
}

/**
 * A test-only fence recipe (kind 'recipeFile'): parsed with RecipeSchema. Its id must not be a content
 * recipe's (a test dish never stands in for a shipped one).
 */
export function readFenceRecipe(file: string, registry?: ContentRegistry): RecipeDef {
  const def = RecipeSchema.parse(JSON.parse(readFileSync(join(REPO_ROOT, file), 'utf8')));
  if (registry?.recipes[def.id] !== undefined) throw new Error(`fence recipe file ${file}: id ${def.id} is a content recipe's`);
  return def;
}

/** The entry's world, realized under `registry` (not yet run). */
export function fenceStart(registry: ContentRegistry, e: FenceEntry & { kind: 'recipe' | 'recipeFile' }): World {
  if (e.kind === 'recipeFile') return realizeRecipe(registry, readFenceRecipe(e.file, registry), { worldId: `fence-${e.id}` });
  const transform = e.transform ? FENCE_TRANSFORMS[e.transform] : undefined;
  if (e.transform && !transform) throw new Error(`fence entry ${e.id}: unknown transform ${e.transform}`);
  return realizeRecipe(registry, e.recipe, { worldId: `fence-${e.id}`, ...(transform ? { transform } : {}) });
}

/** The entry's world, realized under `registry` and run to the entry's tick. */
export async function fenceWorld(registry: ContentRegistry, e: FenceEntry): Promise<World> {
  let w: World;
  if (e.kind === 'recipe' || e.kind === 'recipeFile') {
    w = fenceStart(registry, e);
  } else if (e.kind === 'variant') {
    w = await realizeVariant(registry, e.variant, { worldId: `fence-${e.id}` });
  } else {
    const arms = realizeExperimentArms(registry, e.experiment);
    const arm = e.arm === 'A' ? arms.A : arms.B;
    if (!arm) throw new Error(`fence entry ${e.id}: ${e.experiment} has no arm ${e.arm}`);
    w = arm;
  }
  if (w.tick > e.ticks) throw new Error(`fence entry ${e.id}: the world starts at tick ${w.tick}, after ${e.ticks}`);
  run(w, e.ticks - w.tick);
  return w;
}

export async function fenceDigest(registry: ContentRegistry, e: FenceEntry, mode: DigestMode): Promise<string> {
  return trajectoryDigest(await fenceWorld(registry, e), mode);
}
