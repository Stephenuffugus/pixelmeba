/**
 * The Starting recipe file carries the Suggested Community choice (P5.4 part 2; SPEC §14.4; D-0082,
 * D-0128). Under habitatRegistry() (H04–H11 enabled): an H05 Suggested dish exports a file whose source
 * records `community: true`, and importing it realizes the same start (stateHash); a malformed
 * `overrides.community` is "damaged"; a community on a habitat this build offers none for (WATER_GARDEN,
 * or a build without the community's species) is "needs a compatible build"; a v1.0 start's file (no
 * community key) still validates and loads to the same start.
 */
import { describe, expect, it } from 'vitest';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { buildRecipeFile, compatibleBuildText, loadRecipeFile, realizeRecipeSource, recipeFileProblem, type RecipeFileSource } from '../../src/persistence/recipeFile';
import type { RecipeOverridesRecord } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { aliveOf } from '../helpers/world';
import { habitatRegistry } from '../helpers/habitats';

const reg = habitatRegistry();
const RECIPE = 'FIRST_DISH_V1';

const source = (overrides: RecipeOverridesRecord, seed = 104729): RecipeFileSource => ({
  kind: 'recipe',
  recipeId: RECIPE,
  revision: reg.recipes[RECIPE]!.revision,
  seed,
  overrides: { seed, ...overrides },
});
const damaged = (what: string) => ({ kind: 'integrity', message: `This recipe file is damaged or incomplete (${what}).` });

type Raw = { source: { overrides: Record<string, unknown> }; versions: Parameters<typeof compatibleBuildText>[0] };

describe('recipe files and the Suggested Community', () => {
  it('H05 Suggested: export -> import realizes the same start', async () => {
    const w = await realizeRecipeSource(reg, source({ empty: true, habitatId: 'H05_BRINE_MOSAIC', community: true }), 'community-a');
    expect(aliveOf(w).length).toBe(10);
    const { file, text, start } = await buildRecipeFile(reg, w);
    expect(file.source).toEqual(source({ empty: true, habitatId: 'H05_BRINE_MOSAIC', community: true }));
    expect(file.recipe.community).toBe(true);
    expect(file.habitat.id).toBe('H05_BRINE_MOSAIC');
    expect(start.identity).toBeNull(); // not the bundled recipe id
    const loaded = await loadRecipeFile(text, reg, 'community-b');
    expect(stateHash(loaded.world)).toBe(stateHash(w));
    expect(stateHash(loaded.world)).toBe(file.initialStateHash);
    expect(aliveOf(loaded.world).length).toBe(10);
  });

  it('the validator: community must be a boolean on an empty start, and offered by this build', async () => {
    const w = await realizeRecipeSource(reg, source({ empty: true, habitatId: 'H05_BRINE_MOSAIC', community: true }), 'community-c');
    const raw = JSON.parse((await buildRecipeFile(reg, w)).text) as Raw;
    expect(recipeFileProblem(raw, reg)).toBeNull();
    const withO = (o: Record<string, unknown>) => ({ ...raw, source: { ...raw.source, overrides: { ...raw.source.overrides, ...o } } });
    const without = (k: string) => {
      const o = { ...raw.source.overrides };
      delete o[k];
      return { ...raw, source: { ...raw.source, overrides: o } };
    };
    const compatible = { kind: 'version', message: compatibleBuildText(raw.versions) };
    expect(recipeFileProblem(withO({ community: 'yes' }), reg)).toEqual(damaged('overrides.community'));
    expect(recipeFileProblem(withO({ community: 1 }), reg)).toEqual(damaged('overrides.community'));
    expect(recipeFileProblem(withO({ empty: false }), reg)).toEqual(damaged('overrides.community'));
    expect(recipeFileProblem(withO({ community: false }), reg)).toBeNull();
    // WATER_GARDEN (the recipe's own habitat) has no Suggested Community.
    expect(recipeFileProblem(without('habitatId'), reg)).toEqual(compatible);
    expect(recipeFileProblem(withO({ habitatId: 'GEL_COLONY' }), reg)).toEqual(compatible);
    // A build that cannot offer it (B10 not enabled) needs a compatible build.
    const noB10: ContentRegistry = { ...reg, manifest: { ...reg.manifest, enabledSpecies: reg.manifest.enabledSpecies.filter((id) => id !== 'B10') } };
    expect(recipeFileProblem(raw, noB10)).toEqual(compatible);
    // A build without the habitat at all (the shipped one before the habitat enable) too.
    const shipped: ContentRegistry = { ...reg, manifest: { ...reg.manifest, enabledHabitats: reg.manifest.enabledHabitats.filter((id) => !id.startsWith('H')) } };
    expect(recipeFileProblem(raw, shipped)).toEqual(compatible);
  });

  it('v1.0 starts: the file has no community key, validates and loads to the same start', async () => {
    const starts: RecipeOverridesRecord[] = [{}, { empty: true }, { empty: true, habitatId: 'GEL_COLONY' }, { empty: true, habitatId: 'SEDIMENT_EDGE', founderMode: 'varied' }];
    for (const o of starts) {
      const w = await realizeRecipeSource(reg, source(o), 'v1-a');
      const { file, text } = await buildRecipeFile(reg, w);
      expect(text.includes('community'), JSON.stringify(o)).toBe(false);
      expect(file.source).toEqual(source(o));
      expect(recipeFileProblem(JSON.parse(text), reg)).toBeNull();
      const loaded = await loadRecipeFile(text, reg, 'v1-b');
      expect(stateHash(loaded.world)).toBe(stateHash(w));
    }
  });
});
