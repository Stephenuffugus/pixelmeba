/**
 * P5.6 test-only overrides (SPEC §13.1 "test-only overrides are applied and disclosed, never available in
 * ordinary sandbox"; CT §10.3 E214; D02 §22; D-0131). A SHELL_HANDLING-like fixture built here (P10 and P05,
 * both at speed 0): realizeRecipe replaces the WORLD's recorded species copies (never the registry's
 * records), records the list in provenance, and stateHash gains one term only when the world records one. A
 * recipe without overrides realizes byte-identically and hashes as before. The validator's refusals.
 */
import { describe, expect, it } from 'vitest';
import { validateContent, type RawPacks } from '../../src/sim/content/registry';
import { RecipeSchema, type RecipeDef } from '../../src/sim/content/schema';
import { canonicalJson, sha256Hex } from '../../src/sim/hash';
import { realizeRecipe, TEST_OVERRIDE_FIELDS, withTestOverrides, worldContentFor } from '../../src/sim/recipes';
import { serializeWorld, stateHash, testOverrideFieldValues } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { contentHashOf } from '../helpers/registry';
import { RC1_SAVE_FILES, readRc1Expected, readRc1SaveText } from '../helpers/rc1-saves';
import { rawPacks, registry } from './helpers';

const OVERRIDES = [
  { description: 'Shell Handler held still (speed 0) so contact lasts', target: 'species:P10', values: { speed: 0 } },
  { description: 'Its prey held still (speed 0)', target: 'species:P05', values: { speed: 0 } },
];

const FIXTURE_DATA = {
  id: 'TEST_SHELL_HOLD',
  revision: 1,
  name: 'Shell hold (test fixture)',
  habitatId: 'WATER_GARDEN',
  seed: 214,
  lid: 'open',
  lightMode: 'fixed',
  drying: false,
  removeStones: true,
  mutationPreset: 'fixed',
  founderMode: 'identical',
  fieldPatches: [],
  founders: [
    { species: 'P10', count: 1, center: [64, 64], radius: 0 },
    { species: 'P05', count: 1, center: [66, 64], radius: 0 },
  ],
  testOnlyOverrides: OVERRIDES,
  labels: ['Test-only override: speed 0'],
  expectedObservationsText: 'A test fixture.',
  phase: 5,
};
const FIXTURE: RecipeDef = RecipeSchema.parse(FIXTURE_DATA);
const PLAIN: RecipeDef = { ...FIXTURE, testOnlyOverrides: [] };

function positions(w: World): string {
  const c = w.ents.cols;
  const out: [number, number, number][] = [];
  for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1) out.push([c.birthId[i]!, c.x[i]!, c.y[i]!]);
  return JSON.stringify(out.sort((a, b) => a[0] - b[0]));
}

/** The shipped packs plus `files` (recipes, variants), with the content hash rewritten; validated. */
function validateWith(files: { readonly recipes?: readonly unknown[]; readonly variants?: readonly unknown[] }) {
  const raw = JSON.parse(JSON.stringify(rawPacks())) as { -readonly [K in keyof RawPacks]: RawPacks[K] };
  raw.recipes = [...raw.recipes, ...(files.recipes ?? []).map((data) => ({ file: `content/recipes/${(data as { id: string }).id}.json`, data }))];
  raw.variants = [...raw.variants, ...(files.variants ?? []).map((data) => ({ file: `content/variants/${(data as { id: string }).id}.json`, data }))];
  (raw.manifest.data as Record<string, unknown>).contentHash = contentHashOf(raw);
  return validateContent(raw);
}
const errorsOf = (res: ReturnType<typeof validateWith>, file: string) => res.issues.filter((i) => i.severity === 'error' && i.file.endsWith(`/${file}`)).map((i) => `${i.path}: ${i.message}`);

describe('P5.6 test-only overrides: realization', () => {
  it('TEST_OVERRIDE_FIELDS is speed alone (PROPOSED DECISION: the one profile field CT names)', () => {
    expect([...TEST_OVERRIDE_FIELDS]).toEqual(['speed']);
  });

  it('replaces the world’s species copies (never the registry’s), records provenance, and the organisms never move', () => {
    const reg = registry();
    const before = canonicalJson([reg.species.P10, reg.species.P05]);
    const w = realizeRecipe(reg, FIXTURE, { worldId: 'fixture' });
    expect(w.content.species.find((s) => s.id === 'P10')!.speed).toBe(0);
    expect(w.content.species.find((s) => s.id === 'P05')!.speed).toBe(0);
    expect(w.species.find((s) => s.id === 'P10')!.def.speed).toBe(0); // the species table compiled from the copy
    expect(reg.species.P10!.speed).toBe(1.2);
    expect(reg.species.P05!.speed).toBe(0.45);
    expect(canonicalJson([reg.species.P10, reg.species.P05])).toBe(before);
    expect((w.content.provenance as { testOnlyOverrides?: unknown }).testOnlyOverrides).toEqual(OVERRIDES);
    expect(testOverrideFieldValues(w)).toEqual([
      { speciesId: 'P05', field: 'speed', value: 0 },
      { speciesId: 'P10', field: 'speed', value: 0 },
    ]);
    const start = positions(w);
    for (let k = 0; k < 100; k++) {
      step(w);
      const c = w.ents.cols;
      for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1) expect(c.movedThisTick[i]).toBe(0);
    }
    expect(positions(w)).toBe(start);
  });

  it('an experiment provenance gains the key (merged, not replaced)', () => {
    const p = { recipeId: FIXTURE.id, recipeRevision: 1, createdFrom: 'experiment', experimentId: 'EXP_T' };
    const w = realizeRecipe(registry(), FIXTURE, { provenance: p });
    expect(w.content.provenance).toEqual({ ...p, testOnlyOverrides: OVERRIDES });
  });

  it('a recipe without overrides adds no key and realizes byte-identically', () => {
    const reg = registry();
    const content = worldContentFor(reg, reg.habitats.WATER_GARDEN!, { recipeId: 'X', recipeRevision: 1, createdFrom: 'recipe' });
    expect(withTestOverrides(content, PLAIN)).toBe(content); // the same object: nothing copied
    const plain = realizeRecipe(reg, PLAIN, { worldId: 'p' });
    expect(Object.keys(plain.content.provenance).sort()).toEqual(['createdFrom', 'recipeId', 'recipeRevision']);
    expect(testOverrideFieldValues(plain)).toBeNull();
    const shipped = realizeRecipe(reg, 'SHARED_LUNCH_V1');
    expect('testOnlyOverrides' in shipped.content.provenance).toBe(false);
    expect(canonicalJson(serializeWorld(realizeRecipe(reg, 'SHARED_LUNCH_V1')))).toBe(canonicalJson(serializeWorld(shipped)));
  });

  it('stateHash differs by exactly the testOnly term: the fixture without its provenance key hashes as the plain recipe', () => {
    const reg = registry();
    const fixture = realizeRecipe(reg, FIXTURE, { worldId: 'h' });
    const plain = realizeRecipe(reg, PLAIN, { worldId: 'h' });
    expect(stateHash(fixture)).not.toBe(stateHash(plain));
    const { testOnlyOverrides: _drop, ...rest } = fixture.content.provenance as Record<string, unknown>;
    const stripped = { ...fixture, content: { ...fixture.content, provenance: rest as World['content']['provenance'] } } as World;
    expect(stateHash(stripped)).toBe(stateHash(plain));
  });

  it('a world that records no override hashes exactly as the v1.0.0-rc1 build hashed it (no testOnly term)', async () => {
    const expected = readRc1Expected();
    for (const f of RC1_SAVE_FILES) {
      const w = (await loadSaveFile(readRc1SaveText(f))).world;
      expect(testOverrideFieldValues(w), f).toBeNull();
      expect(stateHash(w), f).toBe(expected.saves[f]!.hashAtLoad);
    }
  });

  it('save → load keeps the species copies and provenance and continues to the uninterrupted run’s hash at tick 300', async () => {
    const reg = registry();
    const straight = realizeRecipe(reg, FIXTURE, { worldId: 's' });
    run(straight, 300);
    const w = realizeRecipe(reg, FIXTURE, { worldId: 's' });
    run(w, 150);
    const { text, file } = await buildSaveFile(w, { name: 'Fixture', savedAt: '2026-10-18T00:00:00.000Z', recipeId: FIXTURE.id });
    expect(file.meta.testOverrides).toBe(true);
    const loaded = (await loadSaveFile(text)).world;
    expect(loaded.content.species.find((s) => s.id === 'P10')!.speed).toBe(0);
    expect((loaded.content.provenance as { testOnlyOverrides?: unknown }).testOnlyOverrides).toEqual(OVERRIDES);
    expect(stateHash(loaded)).toBe(stateHash(w));
    run(loaded, 150);
    expect(stateHash(loaded)).toBe(stateHash(straight));
    // A world without overrides writes no meta flag.
    const plainFile = (await buildSaveFile(realizeRecipe(reg, PLAIN), { name: 'Plain', savedAt: '2026-10-18T00:00:00.000Z', recipeId: null })).file;
    expect('testOverrides' in plainFile.meta).toBe(false);
  });

  it('the import refuses a forged or contradictory provenance.testOnlyOverrides and loads nothing (fix round 1)', async () => {
    const w = realizeRecipe(registry(), FIXTURE, { worldId: 'forged' });
    run(w, 20);
    const { text } = await buildSaveFile(w, { name: 'Fixture', savedAt: '2026-10-18T00:00:00.000Z', recipeId: FIXTURE.id });
    // Edit the state and re-seal the checksum, so only the override check can refuse the file.
    const forge = async (edit: (state: { content: { provenance: Record<string, unknown>; species: Record<string, unknown>[] } }) => void): Promise<string> => {
      const f = JSON.parse(text) as { state: Parameters<typeof edit>[0]; checksum: string };
      edit(f.state);
      f.checksum = `sha256:${await sha256Hex(canonicalJson(f.state))}`;
      return JSON.stringify(f);
    };
    const set = (v: unknown) => (s: Parameters<Parameters<typeof forge>[0]>[0]) => void (s.content.provenance.testOnlyOverrides = v);
    const forged: Record<string, Parameters<typeof forge>[0]> = {
      notAList: set('x'),
      empty: set([]),
      junkEntries: set([1, null, {}]),
      notANumber: set([{ description: 'd', target: 'species:P10', values: { speed: 'fast' } }]),
      otherField: set([{ description: 'd', target: 'species:P10', values: { maxB: 1 } }]),
      notASpecies: set([{ description: 'd', target: 'stone', values: { speed: 0 } }]),
      twoForOne: set([OVERRIDES[0], OVERRIDES[0]]),
      noDescription: set([{ description: ' ', target: 'species:P10', values: { speed: 0 } }]),
      claimTheCopyContradicts: (s) => {
        s.content.provenance.testOnlyOverrides = [OVERRIDES[0]];
        s.content.species.find((x) => x.id === 'P10')!.speed = 1.2;
      },
    };
    for (const [name, edit] of Object.entries(forged)) {
      await expect(loadSaveFile(await forge(edit)), name).rejects.toThrow(/test-only override record is invalid \(.+\)\. Nothing was loaded\./);
    }
    // The genuine record (in either list order) still loads.
    expect(stateHash((await loadSaveFile(text)).world)).toBe(stateHash(w));
    const reversed = await forge((s) => void (s.content.provenance.testOnlyOverrides = [...OVERRIDES].reverse()));
    expect(stateHash((await loadSaveFile(reversed)).world)).toBe(stateHash(w));
  });
});

describe('P5.6 test-only overrides: the validator', () => {
  it('accepts the fixture', () => {
    const res = validateWith({ recipes: [FIXTURE_DATA] });
    expect(errorsOf(res, 'TEST_SHELL_HOLD.json')).toEqual([]);
  });

  it('refuses a bad target, a species the recipe does not place, a field outside TEST_OVERRIDE_FIELDS, a negative speed, two entries for one species', () => {
    const res = validateWith({
      recipes: [
        { ...FIXTURE_DATA, id: 'TEST_BAD_TARGET', testOnlyOverrides: [{ description: 'x', target: 'P10', values: { speed: 0 } }] },
        { ...FIXTURE_DATA, id: 'TEST_NOT_PLACED', testOnlyOverrides: [{ description: 'x', target: 'species:B01', values: { speed: 0 } }] },
        { ...FIXTURE_DATA, id: 'TEST_FIELD', testOnlyOverrides: [{ description: 'x', target: 'species:P10', values: { maxAge: 10 } }] },
        { ...FIXTURE_DATA, id: 'TEST_NEGATIVE', testOnlyOverrides: [{ description: 'x', target: 'species:P10', values: { speed: -1 } }] },
        { ...FIXTURE_DATA, id: 'TEST_TWICE', testOnlyOverrides: [OVERRIDES[0], { ...OVERRIDES[0], description: 'again' }] },
        { ...FIXTURE_DATA, id: 'TEST_BLANK', testOnlyOverrides: [{ description: '   ', target: 'species:P10', values: { speed: 0 } }] },
      ],
    });
    expect(errorsOf(res, 'TEST_BAD_TARGET.json')).toEqual(['testOnlyOverrides.0.target: target "P10" must be "species:<ID>"']);
    expect(errorsOf(res, 'TEST_NOT_PLACED.json')).toEqual(['testOnlyOverrides.0.target: B01 is not placed by this recipe (its founders or scheduled inoculations)']);
    expect(errorsOf(res, 'TEST_FIELD.json')).toEqual(['testOnlyOverrides.0.values.maxAge: "maxAge" cannot be overridden (only speed)']);
    expect(errorsOf(res, 'TEST_NEGATIVE.json')).toEqual([expect.stringMatching(/^testOnlyOverrides\.0\.values\.speed: the overridden P10 record is invalid/)]);
    expect(errorsOf(res, 'TEST_TWICE.json')).toEqual(['testOnlyOverrides.1.target: P10 already has a test-only override (one entry per species)']);
    expect(errorsOf(res, 'TEST_BLANK.json')).toEqual(['testOnlyOverrides.0.description: a test-only override says what it changes']);
  });

  it('refuses a What if? idea on such a recipe and such a recipe among the New Dish curated dishes', () => {
    const variant = { id: 'R-T9', revision: 1, sourceId: 'TEST_SHELL_HOLD', sourceRevision: 1, requiredCapabilities: ['core'], title: 'Idea', question: 'q', patch: { kind: 'none' }, previewDifference: 'Nothing is changed.', phase: 5 };
    const res = validateWith({ recipes: [FIXTURE_DATA, { ...FIXTURE_DATA, id: 'L399_FIXTURE' }], variants: [variant] });
    expect(errorsOf(res, 'R-T9.json')).toContain('sourceId: source recipe "TEST_SHELL_HOLD" is an experiment fixture with a test-only override; a What if? idea cannot remix it');
    expect(errorsOf(res, 'L399_FIXTURE.json')).toContain(
      'testOnlyOverrides: a New Dish curated dish cannot carry a test-only override (an experiment fixture opens only from its experiment card)',
    );
    expect(errorsOf(res, 'TEST_SHELL_HOLD.json')).toEqual([]);
  });
});
