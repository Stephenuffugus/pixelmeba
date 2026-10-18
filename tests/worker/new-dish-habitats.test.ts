/**
 * New Dish habitats on the worker (P5.4 part 2; CT §8.2 "Empty or Suggested Community … previewed and
 * recorded; never silently"; D02 "preview and record every accepted inoculation"; D-0128). DishHost under
 * habitatRegistry() (the shipped registry with H04–H11 enabled):
 *   - build() refuses, before anything is built and in the player's words: a community that is not a
 *     boolean, a community without an empty start, a community on a habitat that has none or whose
 *     community this build does not offer, and a habitat this build does not offer;
 *   - recipeProvenance records `community: true` only when given (a v1.0 request records exactly what it
 *     recorded before);
 *   - a community dish is never the authored recipe (no What if? ideas), and freshStart rebuilds it exactly;
 *   - newDishPreview reports what the habitat places, its regions, the community and its groups, and every
 *     v1.0 start's preview is unchanged except that the new optional keys are absent.
 */
import { describe, expect, it } from 'vitest';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { canonicalJson } from '../../src/sim/hash';
import { recipeGrid, realizeRecipe, recipeOverridesOf, type RecipeWorldProvenance } from '../../src/sim/recipes';
import { serializeWorld, stateHash } from '../../src/sim/serialize';
import type { World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import type { DishInfo, FromWorker, NewDishPreview, RecipeOverrides } from '../../src/worker/protocol';
import { habitatRegistry, habitatStart } from '../helpers/habitats';
import { registryWith } from '../helpers/registry';
import { registry } from '../helpers/world';

const RECIPE = 'FIRST_DISH_V1';
const reg = habitatRegistry();

function hostOn(r: ContentRegistry) {
  const out: FromWorker[] = [];
  const host = new DishHost(r, (m) => out.push(m), { now: () => 0 });
  let req = 0;
  const dishes = () => (host as unknown as { dishes: Record<string, { world: World } | undefined> }).dishes;
  const create = (overrides: RecipeOverrides | undefined, recipeId = RECIPE, seed?: number): { id: string; world: World | null; info: DishInfo | null; error: string | null } => {
    const id = `d${++req}`;
    const n = out.length;
    host.handle({ type: 'create', requestId: req, dishId: id, source: { kind: 'recipe', recipeId, ...(seed !== undefined ? { seed } : {}), ...(overrides ? { overrides } : {}) } });
    const fresh = out.slice(n);
    const ready = fresh.find((m): m is Extract<FromWorker, { type: 'ready' }> => m.type === 'ready');
    const err = fresh.find((m): m is Extract<FromWorker, { type: 'error' }> => m.type === 'error');
    return { id, world: dishes()[id]?.world ?? null, info: ready?.info ?? null, error: err?.message ?? null };
  };
  const createState = (w: World): DishInfo | null => {
    const id = `s${++req}`;
    const n = out.length;
    host.handle({ type: 'create', requestId: req, dishId: id, source: { kind: 'state', state: serializeWorld(w) } });
    return out.slice(n).find((m): m is Extract<FromWorker, { type: 'ready' }> => m.type === 'ready')?.info ?? null;
  };
  const preview = (overrides: RecipeOverrides, recipeId = RECIPE): NewDishPreview => {
    host.handle({ type: 'newDishPreview', requestId: 900 + ++req, recipeId, seed: 104729, overrides });
    const last = out.at(-1)!;
    if (last.type !== 'newDishPreview') throw new Error(`no preview: ${JSON.stringify(last).slice(0, 300)}`);
    return last.preview;
  };
  const freshStart = (w: World): Promise<World | null> => (host as unknown as { freshStart(w: World): Promise<World | null> }).freshStart(w);
  return { host, out, create, createState, preview, freshStart, dishes };
}

const bytes = (w: World): string => canonicalJson(serializeWorld(w));

describe('build() refuses a community it cannot honour, before anything is built', () => {
  it('each refusal has its sentence and builds nothing', () => {
    const h = hostOn(reg);
    const cases: [RecipeOverrides, string][] = [
      [{ empty: true, habitatId: 'H05_BRINE_MOSAIC', community: 'yes' as unknown as boolean }, 'Unknown community setting "yes".'],
      [{ habitatId: 'H05_BRINE_MOSAIC', community: true }, 'A Suggested Community starts from an empty habitat.'],
      [{ empty: false, habitatId: 'H05_BRINE_MOSAIC', community: true }, 'A Suggested Community starts from an empty habitat.'],
      [{ empty: true, community: true }, 'There is no Suggested Community for Water Garden in this version of Pixelmeba.'],
      [{ empty: true, habitatId: 'GEL_COLONY', community: true }, 'There is no Suggested Community for Gel Colony in this version of Pixelmeba.'],
    ];
    for (const [o, message] of cases) {
      const r = h.create(o);
      expect(r.error, JSON.stringify(o)).toBe(message);
      expect(r.world).toBeNull();
      expect(r.info).toBeNull();
    }
    expect(Object.keys(h.dishes())).toEqual([]);
  });

  it('a community this build does not offer (a species not enabled) is refused in words; so is a habitat it does not offer', () => {
    const noY02: ContentRegistry = { ...reg, manifest: { ...reg.manifest, enabledSpecies: reg.manifest.enabledSpecies.filter((id) => id !== 'Y02') } };
    const h = hostOn(noY02);
    const r = h.create({ empty: true, habitatId: 'H04_LEAF_POOL', community: true });
    expect(r.error).toBe('There is no Suggested Community for Leaf Pool in this version of Pixelmeba.');
    expect(r.world).toBeNull();
    // Its Empty start is still offered.
    expect(h.create({ empty: true, habitatId: 'H04_LEAF_POOL' }).error).toBeNull();

    const phase4: ContentRegistry = { ...reg, manifest: { ...reg.manifest, buildPhase: 4 } };
    const p = hostOn(phase4);
    const q = p.create({ empty: true, habitatId: 'H04_LEAF_POOL' });
    expect(q.error).toBe('There is no habitat "H04_LEAF_POOL" in this version of Pixelmeba.');
    expect(q.world).toBeNull();
  });

  it('a build without the habitat enable (the v1.0 habitat list) does not offer the new habitats at all; the shipped one does (D-0130)', () => {
    const v1 = registryWith({ enabledHabitats: ['GEL_COLONY', 'SEDIMENT_EDGE', 'WATER_GARDEN'] });
    const h = hostOn(v1);
    const r = h.create({ empty: true, habitatId: 'H10_GATE_LAB', community: true });
    expect(r.error).toBe('There is no habitat "H10_GATE_LAB" in this version of Pixelmeba.');
    expect(hostOn(registry()).create({ empty: true, habitatId: 'H10_GATE_LAB', community: true }).error).toBeNull();
  });
});

describe('the community choice is recorded, and rebuilds the same dish', () => {
  it('recipeProvenance records community: true only when given; a v1.0 request records exactly what it did before', () => {
    const h = hostOn(reg);
    const c = h.create({ empty: true, habitatId: 'H05_BRINE_MOSAIC', community: true }, RECIPE, 7);
    expect(c.error).toBeNull();
    expect(recipeOverridesOf(c.world!)).toEqual({ seed: 7, empty: true, habitatId: 'H05_BRINE_MOSAIC', community: true });
    const e = h.create({ empty: true, habitatId: 'H05_BRINE_MOSAIC' }, RECIPE, 7);
    expect(recipeOverridesOf(e.world!)).toEqual({ seed: 7, empty: true, habitatId: 'H05_BRINE_MOSAIC' });
    // community: false is a request without a community: nothing recorded, the Empty start.
    const f = h.create({ empty: true, habitatId: 'H05_BRINE_MOSAIC', community: false }, RECIPE, 7);
    expect(recipeOverridesOf(f.world!)).toEqual({ seed: 7, empty: true, habitatId: 'H05_BRINE_MOSAIC' });
    expect(stateHash(f.world!)).toBe(stateHash(e.world!));
    expect(stateHash(c.world!)).not.toBe(stateHash(e.world!));

    // The v1.0 requests: the provenance build() recorded before wave 14 (no community key), and the same world.
    const v1: [RecipeOverrides | undefined, Record<string, unknown>][] = [
      [undefined, {}],
      [{ empty: true }, { empty: true }],
      [{ empty: true, habitatId: 'GEL_COLONY' }, { empty: true, habitatId: 'GEL_COLONY' }],
      [{ empty: true, habitatId: 'SEDIMENT_EDGE', founderMode: 'diverse' }, { empty: true, habitatId: 'SEDIMENT_EDGE', founderMode: 'diverse' }],
    ];
    for (const [o, rec] of v1) {
      const r = h.create(o);
      expect(r.world!.content.provenance, JSON.stringify(o)).toEqual({ recipeId: RECIPE, recipeRevision: reg.recipes[RECIPE]!.revision, createdFrom: 'recipe', overrides: rec });
    }
  });

  it('the host builds exactly what habitatStart realizes (same provenance, same bytes but the world id)', () => {
    const h = hostOn(reg);
    const r = h.create({ empty: true, habitatId: 'H10_GATE_LAB', community: true }, RECIPE, 104729);
    const w = habitatStart(reg, 'H10_GATE_LAB', { community: true }, 104729);
    expect(r.world!.content.provenance).toEqual(w.content.provenance);
    expect(stateHash(r.world!)).toBe(stateHash(w));
  });

  it('a community dish is never the authored recipe: no What if? ideas', () => {
    const h = hostOn(reg);
    const authored = h.create(undefined);
    expect(authored.info!.whatIfSourceId).toBe(RECIPE); // the control: the authored dish has ideas
    const c = h.create({ empty: true, habitatId: 'H11_GRAZING_MEADOW', community: true });
    expect(c.info!.whatIfSourceId ?? null).toBeNull();
    // A world whose recorded choices say only community: true (as a save might) is not the authored recipe either.
    const w = realizeRecipe(reg, RECIPE, {
      worldId: 'community-only',
      provenance: { recipeId: RECIPE, recipeRevision: reg.recipes[RECIPE]!.revision, createdFrom: 'recipe', overrides: { community: true } } as RecipeWorldProvenance,
    });
    const info = h.createState(w);
    expect(info).not.toBeNull();
    expect(info!.whatIfSourceId ?? null).toBeNull();
  });

  it('freshStart of a community dish (What if? keep plan, compare starts) equals its tick-0 state exactly', async () => {
    const h = hostOn(reg);
    for (const habitatId of ['H04_LEAF_POOL', 'H09_DRYING_LACE', 'H10_GATE_LAB']) {
      const c = h.create({ empty: true, habitatId, community: true }, RECIPE, 31337);
      const fresh = await h.freshStart(c.world!);
      expect(fresh, habitatId).not.toBeNull();
      expect(fresh!.worldId).toBe(c.world!.worldId);
      expect(stateHash(fresh!)).toBe(stateHash(c.world!));
      expect(bytes(fresh!)).toBe(bytes(c.world!));
    }
  });
});

describe('newDishPreview: the habitat, its regions and the community', () => {
  it('H04 Empty: what it places, its regions, no community', () => {
    const p = hostOn(reg).preview({ empty: true, habitatId: 'H04_LEAF_POOL' });
    expect(p.habitat.name).toBe('Leaf Pool');
    expect(p.habitat.uses).toEqual([
      { id: 'S06', name: 'Attachment mesh', count: 197 },
      { id: 'S07', name: 'Nutrient basket', count: 2 },
      { id: 'M11', name: 'Leaf wafer', count: 2 },
    ]);
    expect(p.habitat.regions).toEqual([
      { id: 'WEST_WAFER', label: 'West wafer', number: 1 },
      { id: 'MESH', label: 'Mesh patch', number: 2 },
      { id: 'EAST_WAFER', label: 'East wafer', number: 3 },
    ]);
    expect(p.community ?? false).toBe(false);
    expect('community' in p).toBe(false);
    expect('communityGroups' in p).toBe(false);
    expect(p.founders).toEqual([]);
    expect(p.patches).toEqual([]);
    // The wafers are logged inputs.
    expect(p.ledger.added).toEqual({ c: 20, n: 2, m: 0 });
  });

  it('H04 Suggested: five of each group, with the region labels; the ledger counts them as added', () => {
    const p = hostOn(reg).preview({ empty: true, habitatId: 'H04_LEAF_POOL', community: true });
    expect(p.community).toBe(true);
    expect(p.communityGroups).toEqual([
      { speciesId: 'B06', name: 'Crumbsmith', count: 5, regionLabel: 'West wafer' },
      { speciesId: 'B08', name: 'Brothmaker', count: 5, regionLabel: 'East wafer' },
      { speciesId: 'Y02', name: 'Creambud', count: 5, regionLabel: 'East wafer' },
      { speciesId: 'F02', name: 'Cordweaver', count: 5, regionLabel: 'Mesh patch' },
      { speciesId: 'P01', name: 'Amoeba', count: 5, regionLabel: 'Mesh patch' },
    ]);
    expect(p.ledger.added.c).toBeGreaterThan(20);
    expect(p.ledger.added.n).toBeGreaterThan(2);
    // The community's organisms are the dish's founders.
    expect(p.founders.map((f) => [f.speciesId, f.count])).toEqual(
      expect.arrayContaining([
        ['B06', 5],
        ['B08', 5],
        ['Y02', 5],
        ['F02', 5],
        ['P01', 5],
      ]),
    );
    expect(p.habitat.uses?.length).toBe(3);
  });

  it("H06: the habitat's own environment (closed lid, light cycle) reaches the preview", () => {
    const h = hostOn(reg);
    for (const community of [false, true]) {
      const p = h.preview({ empty: true, habitatId: 'H06_DUSK_MARSH', ...(community ? { community } : {}) });
      expect(p.environment).toEqual({ lid: 'closed', lightMode: 'cycle', drying: false });
      expect(p.climate).toBe(true);
      expect('uses' in p.habitat).toBe(false); // H06 places no structure or object
      expect(p.habitat.regions?.map((r) => r.label)).toEqual(['Open water', 'Marsh floor']);
    }
  });

  it("H10 Suggested: the community's starch patch is listed; the gate's membranes are what it places", () => {
    const p = hostOn(reg).preview({ empty: true, habitatId: 'H10_GATE_LAB', community: true });
    expect(p.patches).toEqual(['Starch']);
    expect(p.habitat.uses).toEqual([{ id: 'S01', name: 'Fine membrane', count: 6 }]);
    expect(p.communityGroups?.map((g) => [g.speciesId, g.count, g.regionLabel])).toEqual([
      ['B06', 5, 'Left side'],
      ['B01', 5, 'Right side'],
    ]);
    const e = hostOn(reg).preview({ empty: true, habitatId: 'H10_GATE_LAB' });
    expect(e.patches).toEqual([]);
    // The map is the realized grid: the wall is there in both.
    expect(Array.from(e.habitat.grid!.structure)).toEqual(Array.from(p.habitat.grid!.structure));
  });

  it('H09 Suggested: the wick and the roof; the grid is the realized one', () => {
    const p = hostOn(reg).preview({ empty: true, habitatId: 'H09_DRYING_LACE', community: true });
    expect(p.habitat.uses).toEqual([
      { id: 'S11', name: 'Shade roof', count: 197 },
      { id: 'S12', name: 'Moisture wick', count: 1 },
    ]);
    const w = habitatStart(reg, 'H09_DRYING_LACE', { community: true });
    expect(Array.from(p.habitat.grid!.substrate)).toEqual(Array.from(w.grid.substrate));
    expect(Array.from(p.habitat.grid!.structure)).toEqual(Array.from(w.grid.structure));
  });

  it('every v1.0 start: grid and patches as before (the untransformed recipe), the new keys absent', () => {
    const h = hostOn(reg);
    const starts: [string, RecipeOverrides][] = [
      [RECIPE, {}],
      [RECIPE, { empty: true }],
      [RECIPE, { empty: true, habitatId: 'GEL_COLONY' }],
      [RECIPE, { empty: true, habitatId: 'SEDIMENT_EDGE' }],
      ...reg.recipeIds.filter((id) => reg.recipes[id]!.phase <= reg.manifest.buildPhase).map((id): [string, RecipeOverrides] => [id, {}]),
    ];
    for (const [id, o] of starts) {
      const p = h.preview(o, id);
      const recipe = reg.recipes[id]!;
      const habitat = reg.habitats[o.habitatId ?? recipe.habitatId]!;
      // The pre-wave formulas (the untransformed recipe).
      const before = recipeGrid(habitat, recipe);
      expect(Array.from(p.habitat.grid!.substrate), `${id} ${JSON.stringify(o)}`).toEqual(Array.from(before.substrate));
      expect(Array.from(p.habitat.grid!.structure)).toEqual(Array.from(before.structure));
      expect(p.patches).toEqual(o.empty ? [] : recipe.fieldPatches.map((x, k) => x.label ?? `Patch ${k + 1}`));
      expect(Object.keys(p.habitat).sort()).toEqual(['grid', 'name', 'rules', 'summary']);
      expect('community' in p).toBe(false);
      expect('communityGroups' in p).toBe(false);
      // The rest is what the realized dish says (unchanged code).
      const w = h.create(Object.keys(o).length > 0 ? o : undefined, id, 104729).world!;
      expect(p.ledger.total.c).toBeCloseTo(w.ledger.initial.c + w.ledger.inputs.c, 9);
    }
  });
});
