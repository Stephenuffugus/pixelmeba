/**
 * P5.6 test-only overrides through the real DishHost (SPEC §13.1 "never available in ordinary sandbox";
 * D02 §22 "disclosed in the setup panel and export"; D-0131). With a registry holding a fixture recipe
 * (P10 and P05 at speed 0) and a single-arm card on it:
 * - build() (a New Dish create) refuses the fixture with the sentence, and the open dish is untouched;
 * - the card's start opens the dish with DishInfo.testOverrides (species name, field, value 0, normal);
 * - a FIRST_DISH_V1 dish has no testOverrides key;
 * - a saved slot of the card's dish carries SlotModes.testOnly, a FIRST_DISH_V1 slot none.
 */
import { describe, expect, it } from 'vitest';
import { validateContent, type ContentRegistry, type RawPacks } from '../../src/sim/content/registry';
import { stateHash } from '../../src/sim/serialize';
import { testOverrideRefusalText } from '../../src/sim/recipes';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import { DishHost } from '../../src/worker/host';
import type { DishInfo, FromWorker, ToWorker } from '../../src/worker/protocol';
import { contentHashOf } from '../helpers/registry';
import { loadRawPacksFs } from '../../tools/lib/content-fs';

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
  testOnlyOverrides: [
    { description: 'Shell Handler held still (speed 0) so contact lasts', target: 'species:P10', values: { speed: 0 } },
    { description: 'Its prey held still (speed 0)', target: 'species:P05', values: { speed: 0 } },
  ],
  labels: ['Test-only override: speed 0'],
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

let cached: ContentRegistry | null = null;
function fixtureRegistry(): ContentRegistry {
  if (cached) return cached;
  const raw = JSON.parse(JSON.stringify(loadRawPacksFs())) as { -readonly [K in keyof RawPacks]: RawPacks[K] };
  raw.recipes = [...raw.recipes, { file: 'content/recipes/TEST_SHELL_HOLD.json', data: FIXTURE }];
  raw.experiments = [...raw.experiments, { file: 'content/experiments/EXP_T14.json', data: CARD }];
  (raw.manifest.data as Record<string, unknown>).contentHash = contentHashOf(raw);
  const res = validateContent(raw);
  if (!res.registry) throw new Error(JSON.stringify(res.issues.filter((i) => i.severity === 'error')));
  return (cached = res.registry);
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
function harness() {
  let req = 0;
  const out: FromWorker[] = [];
  const store = new SaveStore(new MemoryBackend());
  const host = new DishHost(fixtureRegistry(), (m) => out.push(m), { now: () => 0, iso: () => '2026-10-18T00:00:00.000Z' }, store, true);
  return {
    host,
    out,
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
const infoOf = (r: FromWorker): DishInfo => {
  if (!('info' in r)) throw new Error(JSON.stringify(r));
  return (r as { info: DishInfo }).info;
};

describe('P5.6 test-only overrides in the worker', () => {
  it('build() refuses the fixture with the sentence and the open dish is untouched', async () => {
    const h = harness();
    infoOf(await h.ask({ type: 'create', dishId: 'garden', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } }));
    const before = stateHash(h.host.world('garden')!);
    const reply = await h.ask({ type: 'create', dishId: 'fixture', source: { kind: 'recipe', recipeId: 'TEST_SHELL_HOLD' } });
    expect(reply.type).toBe('error');
    expect((reply as { message?: string }).message).toBe(testOverrideRefusalText('Shell hold (test fixture)'));
    expect(testOverrideRefusalText('Shell hold (test fixture)')).toBe('Shell hold (test fixture) is an experiment fixture with a test-only override; it opens only from its experiment card.');
    expect(h.host.world('fixture') ?? null).toBeNull();
    expect(stateHash(h.host.world('garden')!)).toBe(before);
    // An empty start of the fixture is refused the same way (its override would still travel with it).
    const empty = await h.ask({ type: 'create', dishId: 'fixture2', source: { kind: 'recipe', recipeId: 'TEST_SHELL_HOLD', overrides: { empty: true } } });
    expect((empty as { message?: string }).message).toBe(testOverrideRefusalText('Shell hold (test fixture)'));
  });

  it('the card’s start discloses DishInfo.testOverrides; a FIRST_DISH_V1 dish has no key', async () => {
    const h = harness();
    const garden = infoOf(await h.ask({ type: 'create', dishId: 'garden', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } }));
    expect('testOverrides' in garden).toBe(false);
    const started = await h.ask({ type: 'experimentStart', cardId: 'EXP_T14', newDishId: 'card', compare: null });
    expect(started.type).toBe('experimentStarted');
    // One entry per overridden field, in the world's recorded override order; normal = this build's record value.
    expect(infoOf(started).testOverrides).toEqual([
      { description: 'Shell Handler held still (speed 0) so contact lasts', speciesId: 'P10', speciesName: fixtureRegistry().species.P10!.name, field: 'speed', value: 0, normal: 1.2 },
      { description: 'Its prey held still (speed 0)', speciesId: 'P05', speciesName: fixtureRegistry().species.P05!.name, field: 'speed', value: 0, normal: 0.45 },
    ]);
  });

  it('a saved slot of the card’s dish says testOnly; a FIRST_DISH_V1 slot does not', async () => {
    const h = harness();
    await h.ask({ type: 'experimentStart', cardId: 'EXP_T14', newDishId: 'card', compare: null });
    expect((await h.ask({ type: 'saveSlot', dishId: 'card', slotId: 'slot1', name: 'Card dish' })).type).toBe('slotSaved');
    await h.ask({ type: 'create', dishId: 'garden', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } });
    expect((await h.ask({ type: 'saveSlot', dishId: 'garden', slotId: 'slot2', name: 'Garden' })).type).toBe('slotSaved');
    const slots = await h.ask({ type: 'listSlots' });
    if (slots.type !== 'slots') throw new Error(JSON.stringify(slots));
    const card = slots.slots.find((s) => s.slotId === 'slot1')!;
    const garden = slots.slots.find((s) => s.slotId === 'slot2')!;
    expect(card.modes?.testOnly).toBe(true);
    expect(garden.modes).toBeDefined();
    expect('testOnly' in garden.modes!).toBe(false);
    expect('testOverrides' in card.modes!).toBe(false); // the index copy never leaks into SlotModes under its meta name
  });
});
