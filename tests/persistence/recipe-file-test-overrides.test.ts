/**
 * P5.6 (SPEC §13.1 "never available in ordinary sandbox"; D-0131): a Starting recipe file whose source names
 * an experiment fixture with a test-only override is refused with the worker's sentence, before anything is
 * realized, and the open dish is untouched; an experiment dish's export stays 'no-start', so this build never
 * writes a Starting recipe file of an overridden dish. The file is written by a registry in which the same
 * recipe id and revision carry no override (as an older or other build would), then imported here.
 */
import { describe, expect, it } from 'vitest';
import { validateContent, type ContentRegistry, type RawPacks } from '../../src/sim/content/registry';
import { realizeRecipe, testOverrideRefusalText, type RecipeWorldProvenance } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { buildRecipeFile, loadRecipeFile, RecipeFileError } from '../../src/persistence/recipeFile';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';
import { contentHashOf } from '../helpers/registry';
import { loadRawPacksFs } from '../../tools/lib/content-fs';

const OVERRIDES = [{ description: 'Shell Handler held still (speed 0) so contact lasts', target: 'species:P10', values: { speed: 0 } }];
const FIXTURE = {
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
  founders: [
    { species: 'P10', count: 1, center: [64, 64], radius: 0 },
    { species: 'P05', count: 1, center: [66, 64], radius: 0 },
  ],
  labels: [],
  expectedObservationsText: 'A test fixture.',
  phase: 5,
};
const CARD = {
  id: 'EXP_T14',
  seed: 214,
  title: 'Shell hold (test card)',
  question: 'A test card on the fixture.',
  recipeId: 'TEST_SHELL_HOLD',
  intervention: 'Watch.',
  predictedTradeoff: 'None.',
  measurements: ['alive.P10'],
  stoppingSeconds: 10,
  confounds: 'A test.',
  gate: { type: 'custom', params: { all: [{ measure: 'runSeconds', arm: 'A', op: 'gte', value: 10 }] } },
  completion: { journalStamp: 'Test stamp', playerSteps: [] },
  phase: 5,
};

const built: Record<string, ContentRegistry> = {};
function withFixture(overrides: boolean): ContentRegistry {
  const key = String(overrides);
  if (built[key]) return built[key];
  const raw = JSON.parse(JSON.stringify(loadRawPacksFs())) as { -readonly [K in keyof RawPacks]: RawPacks[K] };
  raw.recipes = [...raw.recipes, { file: 'content/recipes/TEST_SHELL_HOLD.json', data: { ...FIXTURE, ...(overrides ? { testOnlyOverrides: OVERRIDES } : {}) } }];
  raw.experiments = [...raw.experiments, { file: 'content/experiments/EXP_T14.json', data: CARD }];
  (raw.manifest.data as Record<string, unknown>).contentHash = contentHashOf(raw);
  const res = validateContent(raw);
  if (!res.registry) throw new Error(JSON.stringify(res.issues.filter((i) => i.severity === 'error')));
  return (built[key] = res.registry);
}

/** A Starting recipe file of the fixture recipe, written where the recipe carries no override. */
async function fileNamingFixture(): Promise<string> {
  const plain = withFixture(false);
  const w = realizeRecipe(plain, 'TEST_SHELL_HOLD', { worldId: 'writer', provenance: { recipeId: 'TEST_SHELL_HOLD', recipeRevision: 1, createdFrom: 'recipe', overrides: {} } as RecipeWorldProvenance });
  return (await buildRecipeFile(plain, w)).text;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
function harness(reg: ContentRegistry) {
  let req = 0;
  const out: FromWorker[] = [];
  const host = new DishHost(reg, (m) => out.push(m), { now: () => 0, iso: () => '2026-10-18T00:00:00.000Z' }, null, true);
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

const SENTENCE = testOverrideRefusalText('Shell hold (test fixture)');

describe('P5.6 recipe files and test-only overrides', () => {
  it('a file whose source names the fixture is refused with the sentence (loadRecipeFile)', async () => {
    const text = await fileNamingFixture();
    // The same file opens where the recipe has no override (the file itself is sound).
    expect((await loadRecipeFile(text, withFixture(false), 'ok')).world.tick).toBe(0);
    const err = await loadRecipeFile(text, withFixture(true), 'refused').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RecipeFileError);
    expect((err as RecipeFileError).message).toBe(SENTENCE);
    expect((err as RecipeFileError).kind).toBe('content');
  });

  it('through the worker the import is refused and the open dish is untouched', async () => {
    const h = harness(withFixture(true));
    expect((await h.ask({ type: 'create', dishId: 'garden', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } })).type).toBe('ready');
    const before = stateHash(h.host.world('garden')!);
    const reply = await h.ask({ type: 'recipeImport', text: await fileNamingFixture(), newDishId: 'imported' });
    expect(reply.type).toBe('error');
    expect((reply as { message: string }).message).toBe(SENTENCE);
    expect(h.host.world('imported') ?? null).toBeNull();
    expect(stateHash(h.host.world('garden')!)).toBe(before);
  });

  it('an experiment dish’s export is still no-start', async () => {
    const h = harness(withFixture(true));
    expect((await h.ask({ type: 'experimentStart', cardId: 'EXP_T14', newDishId: 'card', compare: null })).type).toBe('experimentStarted');
    const reply = await h.ask({ type: 'recipeExport', dishId: 'card' });
    expect(reply.type).toBe('error');
    expect((reply as { kind?: string }).kind).toBe('no-start');
    const err = await buildRecipeFile(withFixture(true), h.host.world('card')!).catch((e: unknown) => e);
    expect((err as RecipeFileError).kind).toBe('no-start');
  });
});
