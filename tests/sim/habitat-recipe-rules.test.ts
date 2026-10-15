/**
 * Wave 14 fix-minors (P5.4; CT §8.2 "never silently"; D-0128): recipe-level habitat rules no other test pins.
 *   - item 2: a recipe's own `community: true` places life only on its own habitat and only when the start is not
 *     Empty; a habitat start's community comes only from the recorded `community` override (test-only recipe; no
 *     shipped recipe has a community);
 *   - item 3: recipeStructures' id order (saved state): the habitat's edges, devices and furnished areas, then the
 *     recipe's edges and devices; with only furnished areas on the habitat, the furnish ids are the lowest;
 *   - item 4: placeCommunity's offer check reads the world's RECORDED manifest: a world recording no B05 refuses
 *     H07's Suggested Community with a CommunityError even though the registry holds B05's definition;
 *   - item 6: a community group naming a virus species is a CommunityError on the group's path, so
 *     tools/content-validate.ts communityRealizationIssues reports it instead of crashing.
 */
import { describe, expect, it } from 'vitest';
import type { ContentRegistry } from '../../src/sim/content/registry';
import type { HabitatDef, RecipeDef } from '../../src/sim/content/schema';
import { cellIndex } from '../../src/sim/grid';
import { applyRecipeOverrides, CommunityError, realizeRecipe, RecipeError, recipeStructures, type RecipeOverridesRecord } from '../../src/sim/recipes';
import type { World } from '../../src/sim/world';
import { communityRealizationIssues } from '../../tools/content-validate';
import { habitatRegistry } from '../helpers/habitats';
import { aliveOf, registry } from '../helpers/world';

const HREG = habitatRegistry();
const c = (x: number, y: number) => cellIndex(x, y);

/** A test-only recipe on H05 that asks for H05's Suggested Community itself (no founders, patches or ops of its own). */
function communityRecipe(): RecipeDef {
  return {
    ...HREG.recipes.FIRST_DISH_V1!,
    id: 'TEST_COMMUNITY_RECIPE',
    habitatId: 'H05_BRINE_MOSAIC',
    founders: [],
    fieldPatches: [],
    scheduledCommands: [],
    backgroundOverrides: {},
    ops: [],
    removeStones: false,
    community: true,
  };
}

function start(o: RecipeOverridesRecord): World {
  return realizeRecipe(HREG, communityRecipe(), { seed: 104729, worldId: 'community-override', transform: (r) => applyRecipeOverrides(r, o) });
}

const speciesOf = (w: World): string[] => [...new Set(aliveOf(w).map((s) => w.species[w.ents.cols.species[s]!]!.id))].sort();
const groupSpecies = (id: string): string[] => [...new Set(HREG.habitats[id]!.suggestedCommunity!.groups.map((g) => g.species))].sort();

describe('item 2: a recipe’s own Suggested Community never follows an Empty start or a habitat change', () => {
  it('control: on its own habitat, not Empty, the recipe places its habitat’s community', () => {
    const w = start({});
    expect(aliveOf(w).length).toBe(10);
    expect(speciesOf(w)).toEqual(groupSpecies('H05_BRINE_MOSAIC'));
  });

  it('an Empty start places no life (no community founders)', () => {
    expect(applyRecipeOverrides(communityRecipe(), { empty: true }).community).toBeUndefined();
    expect(aliveOf(start({ empty: true })).length).toBe(0);
  });

  it('a habitat change drops the old habitat’s community choice: no life on the new habitat', () => {
    expect(applyRecipeOverrides(communityRecipe(), { habitatId: 'H07_GLASS_GARDEN' }).community).toBeUndefined();
    const w = start({ habitatId: 'H07_GLASS_GARDEN' });
    expect(w.content.habitat.id).toBe('H07_GLASS_GARDEN');
    expect(aliveOf(w).length).toBe(0);
    for (const sp of groupSpecies('H05_BRINE_MOSAIC')) expect(aliveOf(w, sp)).toHaveLength(0);
    // A habitat without a Suggested Community is no longer refused for the old habitat's choice.
    expect(aliveOf(start({ habitatId: 'WATER_GARDEN' })).length).toBe(0);
  });

  it('overrides.community on the new habitat (with empty, as build() sends it) places that habitat’s community', () => {
    const w = start({ empty: true, habitatId: 'H07_GLASS_GARDEN', community: true });
    expect(aliveOf(w).length).toBe(20);
    expect(speciesOf(w)).toEqual(groupSpecies('H07_GLASS_GARDEN'));
  });
});

describe('item 3: recipeStructures ids (saved state) run habitat furnish areas, then the recipe’s edges, then its devices', () => {
  const base = registry();
  const FURNISH: HabitatDef['furnish'] = [
    { structure: 'S06', area: { kind: 'rect', x0: 40, x1: 41, y0: 70, y1: 71 } },
    { structure: 'S06', area: { kind: 'rect', x0: 88, x1: 88, y0: 70, y1: 70 } },
  ];
  const recipe = (): RecipeDef => ({
    ...base.recipes.FIRST_DISH_V1!,
    edges: [{ structure: 'S01', dir: 'R', x0: 60, y0: 50, x1: 60, y1: 51 }],
    devices: [
      { structure: 'S11', at: [76, 72] },
      { structure: 'S05', at: [70, 72] },
    ],
  });

  it('a habitat with furnished areas only: furnish ids lowest (area order, cells row-major), then recipe edges, then recipe devices; realized the same', () => {
    const habitat: HabitatDef = { ...base.habitats.WATER_GARDEN!, furnish: FURNISH };
    const placed = recipeStructures(habitat, recipe());
    expect(placed.edges.map((e) => [e.id, e.kind, e.cell])).toEqual([
      [6, 'S01', c(60, 50)],
      [7, 'S01', c(60, 51)],
    ]);
    const byId = [...placed.devices].sort((a, b) => a.id - b.id).map((d) => [d.id, d.kind, d.cell]);
    expect(byId).toEqual([
      [1, 'S06', c(40, 70)],
      [2, 'S06', c(41, 70)],
      [3, 'S06', c(40, 71)],
      [4, 'S06', c(41, 71)],
      [5, 'S06', c(88, 70)],
      [8, 'S11', c(76, 72)],
      [9, 'S05', c(70, 72)],
    ]);
    const reg: ContentRegistry = { ...base, habitats: { ...base.habitats, WATER_GARDEN: habitat } };
    const w = realizeRecipe(reg, recipe());
    expect({ edges: w.edges, devices: w.devices }).toEqual(placed);
    expect(w.counters.nextDeviceId).toBe(10);
  });

  it('with the habitat’s own edges and devices too: habitat edges, habitat devices, furnish, recipe edges, recipe devices', () => {
    const habitat: HabitatDef = {
      ...base.habitats.WATER_GARDEN!,
      edges: [{ structure: 'S02', dir: 'D', x0: 50, y0: 60, x1: 51, y1: 60 }],
      devices: [{ structure: 'S11', at: [55, 60] }],
      furnish: [FURNISH[1]!],
    };
    const placed = recipeStructures(habitat, recipe());
    const all = [...placed.edges.map((e) => [e.id, e.kind, e.cell]), ...placed.devices.map((d) => [d.id, d.kind, d.cell])].sort((a, b) => (a[0] as number) - (b[0] as number));
    expect(all).toEqual([
      [1, 'S02', c(50, 60)],
      [2, 'S02', c(51, 60)],
      [3, 'S11', c(55, 60)],
      [4, 'S06', c(88, 70)],
      [5, 'S01', c(60, 50)],
      [6, 'S01', c(60, 51)],
      [7, 'S11', c(76, 72)],
      [8, 'S05', c(70, 72)],
    ]);
  });
});

describe('item 4: the Suggested Community is refused at realization when the world’s recorded manifest lacks a species', () => {
  it('a world recording no B05 refuses H07’s community with a CommunityError, though the registry holds B05', () => {
    const m = HREG.manifest;
    const reg: ContentRegistry = { ...HREG, manifest: { ...m, enabledSpecies: m.enabledSpecies.filter((id) => id !== 'B05') } };
    expect(reg.species.B05).toBeDefined();
    expect(reg.habitats.H07_GLASS_GARDEN!.suggestedCommunity!.groups.some((g) => g.species === 'B05')).toBe(true);
    // Control: the same start under the full manifest places the community.
    const ok = realizeRecipe(HREG, 'FIRST_DISH_V1', { transform: (r) => applyRecipeOverrides(r, { empty: true, habitatId: 'H07_GLASS_GARDEN', community: true }) });
    expect(aliveOf(ok, 'B05')).toHaveLength(5);
    let err: unknown = null;
    try {
      realizeRecipe(reg, 'FIRST_DISH_V1', { transform: (r) => applyRecipeOverrides(r, { empty: true, habitatId: 'H07_GLASS_GARDEN', community: true }) });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CommunityError);
    expect(err).toBeInstanceOf(RecipeError);
    expect((err as CommunityError).path).toBe('suggestedCommunity');
    expect((err as Error).message).toMatch(/H07_GLASS_GARDEN: Its Suggested Community needs B05 \(not enabled\)\./);
  });
});

describe('item 6: a community group naming a virus is reported, never a crash', () => {
  const h07 = HREG.habitats.H07_GLASS_GARDEN!;
  const withVirus: HabitatDef = {
    ...h07,
    suggestedCommunity: { ...h07.suggestedCommunity!, groups: [{ species: 'V01', region: 'WEST_BAY', count: 5, radius: 10 }, ...h07.suggestedCommunity!.groups] },
  };
  const reg: ContentRegistry = { ...HREG, habitats: { ...HREG.habitats, H07_GLASS_GARDEN: withVirus } };

  it('realizeRecipe refuses it with a CommunityError on the group’s species path', () => {
    let err: unknown = null;
    try {
      realizeRecipe(reg, 'FIRST_DISH_V1', { transform: (r) => applyRecipeOverrides(r, { empty: true, habitatId: 'H07_GLASS_GARDEN', community: true }) });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CommunityError);
    expect((err as CommunityError).path).toBe('suggestedCommunity.groups.0.species');
    expect((err as Error).message).toMatch(/V01, a virus/);
  });

  it('communityRealizationIssues reports it on the habitat file at that path', () => {
    const issues = communityRealizationIssues(reg, []).filter((i) => i.file === 'content/habitats/H07_GLASS_GARDEN.json');
    expect(issues).toEqual([{ severity: 'error', file: 'content/habitats/H07_GLASS_GARDEN.json', path: 'suggestedCommunity.groups.0.species', message: expect.stringMatching(/V01, a virus/) }]);
  });
});
