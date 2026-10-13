/**
 * Phase 5 wave 8b (structure-content): the New Dish environment choices as recorded overrides (P5.1;
 * UX §2.3; SPEC §4.6, §4.8; D-0106): lid, lightMode and drying in RecipeOverridesRecord, the one applier
 * applyRecipeOverrides (worker build(), What if? rebuild, recipe file), hasRecipeChanges, the recipe
 * file's validator and realizeRecipe's light cycle start (settings.cycleStartTick 0 in cycle mode only).
 * No screen sends these choices yet (structure-ui, wave 11); a light cycle or drying needs the 'climate'
 * system, which no shipped manifest enables (D-0104), so those worlds are built under registryWith.
 */
import { describe, expect, it } from 'vitest';
import type { ContentRegistry } from '../../src/sim/content/registry';
import type { RecipeDef } from '../../src/sim/content/schema';
import type { SystemFlag } from '../../src/sim/fields';
import {
  applyRecipeOverrides,
  hasRecipeChanges,
  realizeRecipe,
  recipeOverridesOf,
  RecipeError,
  withHabitatOverride,
  type RecipeOverridesRecord,
  type RecipeWorldProvenance,
} from '../../src/sim/recipes';
import { serializeWorld, stateHash } from '../../src/sim/serialize';
import type { World } from '../../src/sim/world';
import {
  buildRecipeFile,
  loadRecipeFile,
  realizeRecipeSource,
  recipeFileProblem,
  recipeWithOverrides,
  type RecipeFileSource,
} from '../../src/persistence/recipeFile';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';
import { registryWith } from '../helpers/registry';
import { registry } from '../helpers/world';

const REG = registry();
const CLIMATE = (): ContentRegistry => registryWith({ enabledSystems: [...REG.manifest.enabledSystems, 'climate'].sort() as SystemFlag[] });
const GARDEN = (): RecipeDef => REG.recipes.FIRST_DISH_V1!;

/** The pre-P5.1 inline transform of src/worker/host.ts and recipeFile.ts (for equality with the one applier). */
function legacyTransform(r: RecipeDef, o: RecipeOverridesRecord): RecipeDef {
  return {
    ...withHabitatOverride(r, o.habitatId),
    ...(o.mutationPreset ? { mutationPreset: o.mutationPreset } : {}),
    ...(o.founderMode ? { founderMode: o.founderMode } : {}),
    ...(o.empty ? { founders: [], fieldPatches: [], scheduledCommands: [] } : {}),
  };
}

function source(o: RecipeOverridesRecord, seed = 104729): Extract<RecipeFileSource, { kind: 'recipe' }> {
  return { kind: 'recipe', recipeId: 'FIRST_DISH_V1', revision: 1, seed, overrides: o };
}

describe('P5.1 applyRecipeOverrides: the one applier', () => {
  it('applies each environment key alone and together, and leaves everything else as the recipe has it', () => {
    const r = GARDEN();
    expect(applyRecipeOverrides(r, {})).toEqual(r);
    expect(applyRecipeOverrides(r, { lid: 'closed' })).toEqual({ ...r, lid: 'closed' });
    expect(applyRecipeOverrides(r, { lightMode: 'cycle' })).toEqual({ ...r, lightMode: 'cycle' });
    expect(applyRecipeOverrides(r, { drying: true })).toEqual({ ...r, drying: true });
    // drying false is a choice too (never dropped as falsy).
    expect(applyRecipeOverrides({ ...r, drying: true }, { drying: false }).drying).toBe(false);
    expect(applyRecipeOverrides(r, { lid: 'closed', lightMode: 'cycle', drying: true, mutationPreset: 'fixed', empty: true })).toEqual({
      ...r,
      lid: 'closed',
      lightMode: 'cycle',
      drying: true,
      mutationPreset: 'fixed',
      founders: [],
      fieldPatches: [],
      scheduledCommands: [],
    });
  });

  it('for every earlier key it is exactly the transform it replaced (and recipeWithOverrides delegates to it)', () => {
    const r = GARDEN();
    const cases: RecipeOverridesRecord[] = [
      {},
      { seed: 7 },
      { mutationPreset: 'accelerated' },
      { founderMode: 'varied' },
      { empty: true },
      { empty: false },
      { habitatId: 'GEL_COLONY' },
      { habitatId: 'WATER_GARDEN' },
      { seed: 9, mutationPreset: 'fixed', founderMode: 'diverse', empty: true, habitatId: 'SEDIMENT_EDGE' },
    ];
    for (const o of cases) {
      expect(applyRecipeOverrides(r, o), JSON.stringify(o)).toEqual(legacyTransform(r, o));
      expect(recipeWithOverrides(r, o), JSON.stringify(o)).toEqual(legacyTransform(r, o));
    }
  });

  it('hasRecipeChanges: anything but the seed (an empty start only when true)', () => {
    expect(hasRecipeChanges({})).toBe(false);
    expect(hasRecipeChanges({ seed: 5 })).toBe(false);
    expect(hasRecipeChanges({ empty: false })).toBe(false);
    for (const o of [{ empty: true }, { mutationPreset: 'fixed' }, { founderMode: 'varied' }, { habitatId: 'GEL_COLONY' }, { lid: 'open' }, { lid: 'closed' }, { lightMode: 'fixed' }, { drying: false }] as RecipeOverridesRecord[])
      expect(hasRecipeChanges(o), JSON.stringify(o)).toBe(true);
  });
});

describe('P5.1 recipeOverridesOf validates the recorded environment', () => {
  const withOverrides = (o: unknown): World => {
    const w = realizeRecipe(REG, 'FIRST_DISH_V1');
    (w.content as { provenance: RecipeWorldProvenance }).provenance = { ...w.content.provenance, overrides: o as RecipeOverridesRecord };
    return w;
  };
  it('accepts lid, lightMode and drying values and refuses malformed ones', () => {
    for (const o of [{ lid: 'open' }, { lid: 'closed' }, { lightMode: 'fixed' }, { lightMode: 'cycle' }, { drying: true }, { drying: false }, { lid: 'closed', lightMode: 'cycle', drying: true, seed: 3 }])
      expect(recipeOverridesOf(withOverrides(o)), JSON.stringify(o)).toEqual(o);
    for (const o of [{ lid: 'ajar' }, { lid: true }, { lightMode: 'night' }, { lightMode: 1 }, { drying: 'yes' }, { drying: 1 }, { lid: null }])
      expect(recipeOverridesOf(withOverrides(o)), JSON.stringify(o)).toBeNull();
  });
});

describe('P5.1 realizeRecipe: the light cycle starts at tick 0 and needs climate', () => {
  it('settings.cycleStartTick is 0 exactly when the realized mode is cycle', () => {
    const cycle = realizeRecipe(CLIMATE(), 'FIRST_DISH_V1', { transform: (r) => applyRecipeOverrides(r, { lightMode: 'cycle' }) });
    expect(cycle.settings.lightMode).toBe('cycle');
    expect(cycle.settings.cycleStartTick).toBe(0);
    const fixed = realizeRecipe(CLIMATE(), 'FIRST_DISH_V1');
    expect(fixed.settings.lightMode).toBe('fixed');
    expect('cycleStartTick' in fixed.settings).toBe(false);
    const drying = realizeRecipe(CLIMATE(), 'FIRST_DISH_V1', { transform: (r) => applyRecipeOverrides(r, { drying: true }) });
    expect(drying.settings.drying).toBe(true);
    expect('cycleStartTick' in drying.settings).toBe(false);
    const closed = realizeRecipe(REG, 'FIRST_DISH_V1', { transform: (r) => applyRecipeOverrides(r, { lid: 'closed' }) });
    expect(closed.settings.lid).toBe('closed');
    expect('cycleStartTick' in closed.settings).toBe(false);
    // The cycle tick is state: it hashes.
    expect(stateHash(cycle)).not.toBe(stateHash(fixed));
  });

  it('refuses a light cycle or drying when the manifest lacks climate', () => {
    expect(() => realizeRecipe(REG, 'FIRST_DISH_V1', { transform: (r) => applyRecipeOverrides(r, { lightMode: 'cycle' }) })).toThrow(
      new RecipeError('recipe FIRST_DISH_V1: Its light cycle needs the "climate" system (not in these rules).'),
    );
    expect(() => realizeRecipe(REG, 'FIRST_DISH_V1', { transform: (r) => applyRecipeOverrides(r, { drying: true }) })).toThrow(
      new RecipeError('recipe FIRST_DISH_V1: Its drying needs the "climate" system (not in these rules).'),
    );
    // A closed lid or fixed light needs nothing new.
    expect(() => realizeRecipe(REG, 'FIRST_DISH_V1', { transform: (r) => applyRecipeOverrides(r, { lid: 'closed', lightMode: 'fixed', drying: false }) })).not.toThrow();
  });
});

describe('P5.1 the Starting recipe file carries the environment choices', () => {
  it('round trip with lid closed (shipped build): the file names the choice and loads to the same start', async () => {
    const w = await realizeRecipeSource(REG, source({ seed: 104729, lid: 'closed' }), 'env-a');
    expect(w.settings.lid).toBe('closed');
    const { file, text, start } = await buildRecipeFile(REG, w);
    expect(file.source).toEqual(source({ seed: 104729, lid: 'closed' }));
    expect(file.recipe.lid).toBe('closed');
    expect(start.identity).toBeNull(); // a changed start is not the bundled recipe id
    const loaded = await loadRecipeFile(text, REG, 'env-b');
    expect(stateHash(loaded.world)).toBe(stateHash(w));
    expect(loaded.world.settings.lid).toBe('closed');
    // The same lid as the recipe's own is no change to its identity.
    const same = await realizeRecipeSource(REG, source({ seed: 104729, lid: 'open' }), 'env-c');
    expect((await buildRecipeFile(REG, same)).start.identity).not.toBeNull();
  });

  it('round trip with lightMode cycle under a climate build', async () => {
    const reg = CLIMATE();
    const w = await realizeRecipeSource(reg, source({ seed: 104729, lightMode: 'cycle' }), 'env-d');
    expect(w.settings.cycleStartTick).toBe(0);
    const { text } = await buildRecipeFile(reg, w);
    const loaded = await loadRecipeFile(text, reg, 'env-e');
    expect(stateHash(loaded.world)).toBe(stateHash(w));
    expect(loaded.world.settings.lightMode).toBe('cycle');
  });

  it("the file validator checks the values and refuses a cycle or drying the build's manifest lacks climate for", async () => {
    const w = await realizeRecipeSource(REG, source({ seed: 104729, lid: 'closed' }), 'env-f');
    const raw = JSON.parse((await buildRecipeFile(REG, w)).text) as { source: { overrides: Record<string, unknown> } };
    expect(recipeFileProblem(raw, REG)).toBeNull();
    const withO = (o: Record<string, unknown>) => ({ ...raw, source: { ...raw.source, overrides: { ...raw.source.overrides, ...o } } });
    const damaged = (what: string) => ({ kind: 'integrity', message: `This recipe file is damaged or incomplete (${what}).` });
    expect(recipeFileProblem(withO({ lid: 'ajar' }), REG)).toEqual(damaged('overrides.lid'));
    expect(recipeFileProblem(withO({ lightMode: 'night' }), REG)).toEqual(damaged('overrides.lightMode'));
    expect(recipeFileProblem(withO({ drying: 'yes' }), REG)).toEqual(damaged('overrides.drying'));
    expect(recipeFileProblem(withO({ warmth: 0.9 }), REG)).toEqual(damaged('overrides'));
    // The shipped build has no climate system.
    expect(recipeFileProblem(withO({ lightMode: 'cycle' }), REG)).toEqual(damaged('overrides.lightMode'));
    expect(recipeFileProblem(withO({ drying: true }), REG)).toEqual(damaged('overrides.drying'));
    expect(recipeFileProblem(withO({ lightMode: 'fixed', drying: false }), REG)).toBeNull();
    // Under a climate build the same choices pass the validator.
    const reg = CLIMATE();
    const wc = await realizeRecipeSource(reg, source({ seed: 104729, lightMode: 'cycle', drying: true }), 'env-g');
    const rawC = JSON.parse((await buildRecipeFile(reg, wc)).text) as unknown;
    expect(recipeFileProblem(rawC, reg)).toBeNull();
  });
});

describe('P5.1 the What if? rebuild applies the recorded environment (src/worker/host.ts)', () => {
  type Of<T extends FromWorker['type']> = Extract<FromWorker, { type: T }>;
  type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
  function harness() {
    const out: FromWorker[] = [];
    const host = new DishHost(REG, (m) => out.push(m), { now: () => 0, iso: () => '2026-10-13T00:00:00.000Z' }, null, true);
    let req = 0;
    return {
      host,
      async ask(msg: DistributiveOmit<ToWorker, 'requestId'>): Promise<FromWorker> {
        const requestId = ++req;
        host.handle({ ...msg, requestId } as ToWorker);
        const deadline = Date.now() + 60_000;
        for (;;) {
          const reply = out.find((m) => 'requestId' in m && m.requestId === requestId);
          if (reply) return reply;
          if (Date.now() > deadline) throw new Error(`no reply to ${msg.type}`);
          await new Promise((r) => setTimeout(r, 2));
        }
      },
    };
  }

  it('a dish whose provenance records lid closed rebuilds exactly (unchanged); with an open lid in the world it does not', async () => {
    const o: RecipeOverridesRecord = { seed: 104729, lid: 'closed' };
    const w = await realizeRecipeSource(REG, source(o), 'closed-dish');
    // The rebuild the host performs (freshStart): the recipe with the recorded choices, same world id and provenance.
    const rebuilt = realizeRecipe(REG, 'FIRST_DISH_V1', {
      worldId: w.worldId,
      seed: 104729,
      transform: (r) => applyRecipeOverrides(r, o),
      provenance: JSON.parse(JSON.stringify(w.content.provenance)) as World['content']['provenance'],
    });
    expect(stateHash(rebuilt)).toBe(stateHash(w));
    // Through the worker: the keep plan says 'unchanged' only because the rebuild applied the lid.
    const h = harness();
    const r = await h.ask({ type: 'create', dishId: 'closed-dish', source: { kind: 'state', state: serializeWorld(w) }, name: 'Closed garden' });
    expect(r.type).toBe('ready');
    const plan = ((await h.ask({ type: 'keepPlan', aboutDishId: 'closed-dish', opening: null })) as Of<'keepPlan'>).plan;
    expect(plan).toEqual({ kind: 'unchanged', name: 'Closed garden', seed: 104729 });
    // The authored Garden with "lid closed" written into its provenance (but an open lid) is not that start: kept.
    const open = realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: 'open-dish', provenance: { recipeId: 'FIRST_DISH_V1', recipeRevision: 1, createdFrom: 'recipe', overrides: o } as RecipeWorldProvenance });
    const r2 = await h.ask({ type: 'create', dishId: 'open-dish', source: { kind: 'state', state: serializeWorld(open) }, name: 'Open garden' });
    expect(r2.type).toBe('ready');
    const plan2 = ((await h.ask({ type: 'keepPlan', aboutDishId: 'open-dish', opening: null })) as Of<'keepPlan'>).plan;
    expect(plan2.kind).not.toBe('unchanged');
  });
});
