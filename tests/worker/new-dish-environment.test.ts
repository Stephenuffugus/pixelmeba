/**
 * New Dish environment overrides (P5.1; D-0111 carry-over "when the protocol's RecipeOverrides gains lid,
 * lightMode and drying, build() must validate them and record them in recipeProvenance in the same change";
 * D-0119). Under a climate registry (tests/helpers/world.ts barrierRegistry: 'barriers', 'climate',
 * 'devices', allowUnimplemented for S01–S12 until the systems flip) each override is recorded exactly and
 * only when given, and the world's settings follow; an unknown value, and a cycle or drying under the
 * shipped registry, are refused with a readable message before any dish exists; a world built without the
 * keys is byte-identical to the protocol 2 build; every override survives buildSaveFile → loadSaveFile;
 * a lid override is a custom dish (no What if? ideas); newDishPreview reports environment and climate.
 */
import { describe, expect, it } from 'vitest';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { canonicalJson } from '../../src/sim/hash';
import { realizeRecipe, recipeOverridesOf, type RecipeWorldProvenance } from '../../src/sim/recipes';
import { serializeWorld, stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { DishHost } from '../../src/worker/host';
import type { DishInfo, FromWorker, NewDishPreview, RecipeOverrides } from '../../src/worker/protocol';
import { barrierRegistry, registry } from '../helpers/world';

const RECIPE = 'FIRST_DISH_V1';

function hostOn(reg: ContentRegistry) {
  const out: FromWorker[] = [];
  const host = new DishHost(reg, (m) => out.push(m), { now: () => 0 });
  let req = 0;
  const create = (overrides: RecipeOverrides | undefined, seed?: number): { world: World | null; info: DishInfo | null; error: string | null } => {
    const id = `d${++req}`;
    const n = out.length;
    host.handle({ type: 'create', requestId: req, dishId: id, source: { kind: 'recipe', recipeId: RECIPE, ...(seed !== undefined ? { seed } : {}), ...(overrides ? { overrides } : {}) } });
    const fresh = out.slice(n);
    const ready = fresh.find((m): m is Extract<FromWorker, { type: 'ready' }> => m.type === 'ready');
    const err = fresh.find((m): m is Extract<FromWorker, { type: 'error' }> => m.type === 'error');
    const dishes = (host as unknown as { dishes: Record<string, { world: World } | undefined> }).dishes;
    return { world: dishes[id]?.world ?? null, info: ready?.info ?? null, error: err?.message ?? null };
  };
  const preview = (overrides: RecipeOverrides): NewDishPreview => {
    host.handle({ type: 'newDishPreview', requestId: 900 + ++req, recipeId: RECIPE, seed: 104729, overrides });
    return out.filter((m): m is Extract<FromWorker, { type: 'newDishPreview' }> => m.type === 'newDishPreview').at(-1)!.preview;
  };
  return { host, out, create, preview };
}

/** The protocol 2 (HEAD) build of a recipe dish without environment keys: realizeRecipe with the provenance build() recorded then. */
function headBuild(reg: ContentRegistry, dishId: string, extra: { mutationPreset?: 'fixed' } = {}): World {
  return realizeRecipe(reg, RECIPE, {
    worldId: dishId,
    ...(extra.mutationPreset ? { transform: (r) => ({ ...r, mutationPreset: extra.mutationPreset! }) } : {}),
    provenance: { recipeId: RECIPE, recipeRevision: reg.recipes[RECIPE]!.revision, createdFrom: 'recipe', overrides: { ...extra } } as RecipeWorldProvenance,
  });
}

const bytes = (w: World): string => canonicalJson(serializeWorld(w));

describe('New Dish environment overrides (protocol 3)', () => {
  it('each override is recorded in recipeProvenance exactly (and only those given), and the settings follow', () => {
    const h = hostOn(barrierRegistry());
    const cases: [RecipeOverrides, Record<string, unknown>][] = [
      [{ lid: 'closed' }, { lid: 'closed' }],
      [{ lid: 'open' }, { lid: 'open' }],
      [{ lightMode: 'cycle' }, { lightMode: 'cycle' }],
      [{ lightMode: 'fixed' }, { lightMode: 'fixed' }],
      [{ drying: true }, { drying: true }],
      [{ drying: false }, { drying: false }],
      [{ lid: 'closed', lightMode: 'cycle', drying: true, mutationPreset: 'fixed' }, { lid: 'closed', lightMode: 'cycle', drying: true, mutationPreset: 'fixed' }],
    ];
    for (const [o, rec] of cases) {
      const r = h.create(o);
      expect(r.error, JSON.stringify(o)).toBeNull();
      const w = r.world!;
      expect(recipeOverridesOf(w), JSON.stringify(o)).toEqual(rec);
      if (o.lid) expect(w.settings.lid).toBe(o.lid);
      if (o.lightMode) expect(w.settings.lightMode).toBe(o.lightMode);
      if (o.drying !== undefined) expect(w.settings.drying).toBe(o.drying);
      if (o.lightMode === 'cycle') expect(w.settings.cycleStartTick).toBe(0);
      else expect('cycleStartTick' in w.settings).toBe(false);
    }
  });

  it('an unknown value, and a cycle or drying under the shipped registry, are refused readably and create no dish', () => {
    const climate = hostOn(barrierRegistry());
    for (const [o, msg] of [
      [{ lid: 'ajar' }, 'Unknown lid setting "ajar".'],
      [{ lightMode: 'strobe' }, 'Unknown light setting "strobe".'],
      [{ drying: 'yes' }, 'Unknown drying setting "yes".'],
    ] as const) {
      const r = climate.create(o as unknown as RecipeOverrides);
      expect(r.error).toBe(msg);
      expect(r.world).toBeNull();
      expect(r.info).toBeNull();
    }
    const shipped = hostOn(registry());
    const cyc = shipped.create({ lightMode: 'cycle' });
    expect(cyc.error).toBe("Day and night light needs the climate system, which this dish's content does not include.");
    expect(cyc.world).toBeNull();
    const dry = shipped.create({ drying: true });
    expect(dry.error).toBe("Drying needs the climate system, which this dish's content does not include.");
    expect(dry.world).toBeNull();
    // The values that need no climate are accepted under the shipped registry.
    expect(shipped.create({ lightMode: 'fixed', drying: false, lid: 'closed' }).error).toBeNull();
  });

  it('a world built with overrides {} or without overrides is byte-identical to the protocol 2 (HEAD) build', () => {
    const reg = registry();
    const h = hostOn(reg);
    const none = h.create(undefined).world!; // d1
    const empty = h.create({}).world!; // d2
    const preset = h.create({ mutationPreset: 'fixed' }).world!; // d3
    expect(bytes(none)).toBe(bytes(headBuild(reg, 'd1')));
    expect(stateHash(none)).toBe(stateHash(headBuild(reg, 'd1')));
    expect(bytes(empty)).toBe(bytes(headBuild(reg, 'd2')));
    expect(bytes(preset)).toBe(bytes(headBuild(reg, 'd3', { mutationPreset: 'fixed' })));
    expect(recipeOverridesOf(none)).toEqual({});
    // No environment key in the recorded overrides at all.
    for (const w of [none, empty, preset]) for (const k of ['lid', 'lightMode', 'drying']) expect(k in (recipeOverridesOf(w) ?? {})).toBe(false);
  });

  it('every override survives buildSaveFile → loadSaveFile (the import accepts it) with an equal stateHash, at tick 0 and after 120 ticks', async () => {
    const h = hostOn(barrierRegistry());
    for (const o of [{ lid: 'closed' }, { lightMode: 'cycle' }, { drying: true }, { lid: 'open', lightMode: 'fixed', drying: false }] as RecipeOverrides[]) {
      const w = h.create(o).world!;
      for (const ticks of [0, 120]) {
        run(w, ticks);
        const { world: back } = await loadSaveFile((await buildSaveFile(w, { name: 'env', savedAt: '2026-10-14T00:00:00.000Z', recipeId: RECIPE })).text);
        expect(stateHash(back), JSON.stringify(o)).toBe(stateHash(w));
        expect(recipeOverridesOf(back)).toEqual(recipeOverridesOf(w));
        expect(back.settings).toEqual(w.settings);
      }
    }
  });

  it('a lid override makes a custom dish: no What if? ideas (whatif.test.ts authored-recipe rule)', () => {
    const h = hostOn(registry());
    expect(h.create(undefined).info!.whatIfSourceId).toBe(RECIPE);
    expect(h.create({ lid: 'closed' }).info!.whatIfSourceId).toBeNull();
  });

  it('newDishPreview reports the start environment and whether the world records climate', () => {
    const shipped = hostOn(registry()).preview({});
    expect(shipped.environment).toEqual({ lid: expect.stringMatching(/^(open|closed)$/), lightMode: 'fixed', drying: false });
    expect(shipped.climate).toBe(false);
    const climate = hostOn(barrierRegistry());
    const p = climate.preview({ lid: 'closed', lightMode: 'cycle', drying: true });
    expect(p.environment).toEqual({ lid: 'closed', lightMode: 'cycle', drying: true });
    expect(p.climate).toBe(true);
    const def = climate.preview({});
    const w = realizeRecipe(barrierRegistry(), RECIPE, { seed: 104729 });
    expect(def.environment).toEqual({ lid: w.settings.lid, lightMode: w.settings.lightMode, drying: w.settings.drying });
  });
});
