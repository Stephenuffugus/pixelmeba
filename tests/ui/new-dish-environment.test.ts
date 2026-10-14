/**
 * P5.1 New Dish Environment group (src/ui/environment.ts; src/ui/state.ts customDishSource): only the keys
 * the player changed become RecipeOverrides; the group is offered only by a build manifest with 'climate'
 * (the shipped manifest has none until the systems flip, D-0104); the overrides reach startCustom's
 * DishSource unchanged, and an untouched group gives exactly the source made without the group.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { effectiveEnvironment, environmentGroupVisible, environmentOverrides, environmentSummary, type DishEnvironment } from '../../src/ui/environment';
import { customDishSource } from '../../src/ui/state';

const DEFAULTS: DishEnvironment = { lid: 'open', lightMode: 'fixed', drying: false };
const shipped = JSON.parse(readFileSync(join(__dirname, '../../content/manifest.json'), 'utf8')) as { enabledSystems: string[] };

describe('environmentOverrides', () => {
  it('returns only the keys that differ from the defaults', () => {
    expect(environmentOverrides(DEFAULTS, {})).toEqual({});
    expect(environmentOverrides(DEFAULTS, { lid: 'open', lightMode: 'fixed', drying: false })).toEqual({});
    expect(environmentOverrides(DEFAULTS, { lid: 'closed' })).toEqual({ lid: 'closed' });
    expect(environmentOverrides(DEFAULTS, { lid: 'open', lightMode: 'cycle', drying: true })).toEqual({ lightMode: 'cycle', drying: true });
    // A habitat whose default is the cycle: choosing the cycle records nothing; choosing Fixed records it.
    const cycleDefaults: DishEnvironment = { lid: 'closed', lightMode: 'cycle', drying: true };
    expect(environmentOverrides(cycleDefaults, { lightMode: 'cycle' })).toEqual({});
    expect(environmentOverrides(cycleDefaults, { lightMode: 'fixed', lid: 'open' })).toEqual({ lid: 'open', lightMode: 'fixed' });
    expect(Object.keys(environmentOverrides(DEFAULTS, { drying: true, lid: 'closed', lightMode: 'cycle' }))).toEqual(['lid', 'lightMode', 'drying']);
  });

  it('the summary states the effective environment in words', () => {
    expect(environmentSummary(effectiveEnvironment(DEFAULTS, {}))).toBe('Lid open, fixed light, drying off.');
    expect(environmentSummary(effectiveEnvironment(DEFAULTS, { lid: 'closed', lightMode: 'cycle', drying: true }))).toBe(
      'Lid closed, day-and-night light (a 240 s cycle), drying on.',
    );
  });
});

describe('the group is gated on the build manifest', () => {
  it('absent for a manifest without climate (the shipped one until the flip), present with it', () => {
    expect(shipped.enabledSystems.includes('climate')).toBe(environmentGroupVisible(shipped));
    expect(environmentGroupVisible({ enabledSystems: shipped.enabledSystems.filter((s) => s !== 'climate') })).toBe(false);
    expect(environmentGroupVisible({ enabledSystems: [...shipped.enabledSystems, 'climate'] })).toBe(true);
    expect(environmentGroupVisible(undefined)).toBe(false);
  });
});

describe('the overrides reach startCustom’s DishSource unchanged', () => {
  const base = { recipeId: 'FIRST_DISH_V1', seed: 104729, mutationPreset: 'standard', founderMode: 'identical', empty: false } as const;

  it('an untouched group gives the source made without the group', () => {
    const without = customDishSource({ ...base });
    expect(customDishSource({ ...base, environment: environmentOverrides(DEFAULTS, {}) })).toEqual(without);
    expect(JSON.stringify(customDishSource({ ...base, environment: {} }))).toBe(JSON.stringify(without));
    expect(without).toEqual({
      kind: 'recipe',
      recipeId: 'FIRST_DISH_V1',
      seed: 104729,
      overrides: { mutationPreset: 'standard', founderMode: 'identical', empty: false },
    });
  });

  it('changed keys arrive as RecipeOverrides keys', () => {
    const src = customDishSource({ ...base, habitatId: 'GEL_COLONY', environment: environmentOverrides(DEFAULTS, { lid: 'closed', lightMode: 'cycle', drying: true }) });
    expect(src).toEqual({
      kind: 'recipe',
      recipeId: 'FIRST_DISH_V1',
      seed: 104729,
      overrides: { mutationPreset: 'standard', founderMode: 'identical', empty: false, habitatId: 'GEL_COLONY', lid: 'closed', lightMode: 'cycle', drying: true },
    });
    const one = customDishSource({ ...base, environment: { drying: true } });
    expect(one.kind === 'recipe' && one.overrides).toEqual({ mutationPreset: 'standard', founderMode: 'identical', empty: false, drying: true });
  });
});
