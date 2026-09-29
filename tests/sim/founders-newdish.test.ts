/**
 * P2.2 New Dish through the worker host: the preview states exactly what Create builds (founders,
 * seeded abilities, initial ledger, rates, registry) and creates nothing; malformed evolution choices
 * build nothing; a dish describes its own recorded registry ("Core prototype — quantitative
 * evolution" while partial) and its snapshots carry the evolution setting in effect.
 */
import { describe, expect, it } from 'vitest';
import { founderSummary } from '../../src/sim/founders';
import { computeTotals } from '../../src/sim/ledger';
import { ratesFor } from '../../src/sim/mutation';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import { DishHost } from '../../src/worker/host';
import type {
  FromWorker,
  NewDishPreview,
  RecipeOverrides,
  SlotSummary,
  SnapshotMsg,
} from '../../src/worker/protocol';
import { registry } from '../helpers/world';

/** Wait for the reply to an asynchronous request (saving and listing run through handleAsync). */
async function reply(out: FromWorker[], requestId: number): Promise<FromWorker> {
  for (let k = 0; k < 400; k++) {
    const m = out.find((x) => 'requestId' in x && x.requestId === requestId);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`no reply to request ${requestId}`);
}

function makeHost(): { host: DishHost; out: FromWorker[] } {
  const out: FromWorker[] = [];
  return { host: new DishHost(registry(), (m) => out.push(m), { now: () => 0 }), out };
}

function preview(
  host: DishHost,
  out: FromWorker[],
  requestId: number,
  seed: number,
  overrides: RecipeOverrides,
): NewDishPreview {
  host.handle({ type: 'newDishPreview', requestId, recipeId: 'FIRST_DISH_V1', seed, overrides });
  const m = out.find((x) => 'requestId' in x && x.requestId === requestId);
  if (!m || m.type !== 'newDishPreview') throw new Error(`no preview: ${JSON.stringify(m)}`);
  return m.preview;
}

describe('P2.2 New Dish preview and dish descriptions', () => {
  it('the preview is exactly the dish Create builds, and builds no dish of its own', () => {
    const { host, out } = makeHost();
    for (const [k, overrides] of (
      [
        { mutationPreset: 'accelerated', founderMode: 'varied', empty: false },
        { mutationPreset: 'standard', founderMode: 'diverse', empty: false },
        { mutationPreset: 'fixed', founderMode: 'identical', empty: true },
      ] as const
    ).entries()) {
      const seed = 424242 + k;
      const active = host.activeDishId;
      const p = preview(host, out, 10 + k, seed, overrides);
      expect(host.activeDishId).toBe(active);
      expect(host.world('new-dish-preview')).toBeNull();
      host.handle({
        type: 'create',
        requestId: 20 + k,
        dishId: `made-${k}`,
        source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1', seed, overrides },
      });
      const w = host.world(`made-${k}`)!;
      expect(p).toMatchObject({
        recipeId: 'FIRST_DISH_V1',
        recipeName: 'Little Living Garden',
        seed,
        mutationPreset: overrides.mutationPreset,
        founderMode: overrides.founderMode,
        empty: overrides.empty,
      });
      expect(p.habitat).toEqual({ name: 'Water Garden', summary: 'Clear water with two stone islands.' });
      expect(p.rates).toEqual(ratesFor(overrides.mutationPreset, false));
      const rows = founderSummary(w);
      expect(p.founders.map((f) => [f.speciesId, f.count, f.eligible, f.withModule])).toEqual(
        rows.map((r) => [w.species[r.species]!.id, r.count, r.eligible, r.withModule]),
      );
      const t = computeTotals(w);
      expect(p.ledger.total).toEqual({ c: t.c, n: t.n, m: t.m });
      expect(p.ledger.habitat.c + p.ledger.added.c).toBeCloseTo(t.c, 9);
      expect(p.patches).toEqual(overrides.empty ? [] : ['Sugar patch', 'Starch patch', 'Debris patch']);
      expect(p.registry).toMatchObject({
        moduleRegistryVersion: 1,
        catalogSize: 17,
        partial: true,
        modules: [{ id: 'E01' }, { id: 'E03' }, { id: 'E05' }],
      });
    }
    // A Diverse preview names the seeded modules it will place (present at creation).
    const d = preview(host, out, 40, 104729, {
      mutationPreset: 'standard',
      founderMode: 'diverse',
      empty: false,
    });
    const seeded = d.founders.reduce((a, f) => a + f.withModule, 0);
    expect(d.founders.reduce((a, f) => a + f.modules.reduce((b, m) => b + m.count, 0), 0)).toBe(seeded);
  });

  it('unknown evolution choices build nothing', () => {
    const { host, out } = makeHost();
    host.handle({
      type: 'create',
      requestId: 1,
      dishId: 'x',
      source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1', overrides: { mutationPreset: 'turbo' as never } },
    });
    expect(out.find((m) => m.type === 'error' && m.requestId === 1)).toMatchObject({
      message: 'Unknown evolution setting "turbo".',
      paused: false,
    });
    host.handle({
      type: 'create',
      requestId: 2,
      dishId: 'y',
      source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1', overrides: { founderMode: 'random' as never } },
    });
    expect(out.find((m) => m.type === 'error' && m.requestId === 2)).toMatchObject({
      message: 'Unknown founder mode "random".',
    });
    expect(host.world('x')).toBeNull();
    expect(host.world('y')).toBeNull();
  });

  it('a dish describes its recorded registry, and its snapshots carry the evolution setting and changes', () => {
    const { host, out } = makeHost();
    host.handle({
      type: 'create',
      requestId: 1,
      dishId: 'd',
      source: {
        kind: 'recipe',
        recipeId: 'FIRST_DISH_V1',
        overrides: { mutationPreset: 'accelerated', founderMode: 'varied' },
      },
    });
    const ready = out.find((m) => m.type === 'ready');
    expect(ready?.type === 'ready' ? ready.info.registry : null).toMatchObject({
      partial: true,
      catalogSize: 17,
      modules: [{ id: 'E01', name: 'Starch release' }, { id: 'E03' }, { id: 'E05' }],
    });
    expect(ready?.type === 'ready' ? ready.info.manifestLabel : null).toBe(
      'Core prototype — quantitative evolution',
    );
    const snaps = () => out.filter((m): m is SnapshotMsg => m.type === 'snapshot');
    expect(snaps().at(-1)!.evolution).toMatchObject({
      preset: 'accelerated',
      founderMode: 'varied',
      rates: ratesFor('accelerated', false),
      changes: [],
    });
    // The founders the dish was made with (the Evolution sheet's "present at creation" line).
    expect(snaps().at(-1)!.evolution!.creation).toMatchObject({ complete: true });
    expect(
      snaps()
        .at(-1)!
        .evolution!.creation!.rows.map((r) => [r.count, r.withModule]),
    ).toEqual([
      [12, 0],
      [24, 0],
      [8, 0],
      [12, 0],
    ]);
    host.handle({
      type: 'command',
      requestId: 2,
      dishId: 'd',
      commandId: 'ui-1',
      payload: { kind: 'setMutationPreset', preset: 'standard' },
      undoable: true,
    });
    expect(snaps().at(-1)!.evolution).toMatchObject({
      preset: 'standard',
      changes: [{ tick: 0, commandId: 'ui-1', from: 'accelerated', to: 'standard' }],
    });
    host.handle({ type: 'undo', requestId: 3, dishId: 'd' });
    expect(snaps().at(-1)!.evolution).toMatchObject({ preset: 'accelerated', changes: [] });
  });

  it('saved dishes keep their mode labels for Saved dishes, the Save sheet and Continue (index copies, re-validated)', async () => {
    const backend = new MemoryBackend();
    const out: FromWorker[] = [];
    const host = new DishHost(registry(), (m) => out.push(m), { now: () => 0 }, new SaveStore(backend), true);
    host.handle({
      type: 'create',
      requestId: 1,
      dishId: 'd',
      source: {
        kind: 'recipe',
        recipeId: 'FIRST_DISH_V1',
        overrides: { mutationPreset: 'accelerated', founderMode: 'diverse' },
      },
    });
    const want = { mutationPreset: 'accelerated', founderMode: 'diverse', partial: true };
    host.handle({ type: 'saveSlot', requestId: 2, dishId: 'd', slotId: 'slot1', name: 'Dish A' });
    const saved = await reply(out, 2);
    expect(saved.type === 'slotSaved' ? saved.slot.modes : null).toEqual(want);
    host.handle({ type: 'autosave', requestId: 3, dishId: 'd' });
    await reply(out, 3);
    const list = async (requestId: number): Promise<readonly SlotSummary[]> => {
      host.handle({ type: 'listSlots', requestId });
      const r = await reply(out, requestId);
      if (r.type !== 'slots') throw new Error(JSON.stringify(r));
      return r.slots;
    };
    expect((await list(4)).map((x) => [x.slotId, x.modes])).toEqual([
      ['autosave', want],
      ['slot1', want],
    ]);
    // A later change is what the next save records.
    host.handle({
      type: 'command',
      requestId: 5,
      dishId: 'd',
      commandId: 'ui-1',
      payload: { kind: 'setMutationPreset', preset: 'fixed' },
      undoable: true,
    });
    host.handle({ type: 'saveSlot', requestId: 6, dishId: 'd', slotId: 'slot1', name: 'Dish A' });
    await reply(out, 6);
    expect((await list(7)).find((x) => x.slotId === 'slot1')!.modes).toEqual({
      ...want,
      mutationPreset: 'fixed',
    });
    // The index is stored data: a malformed copy is dropped, and an index written before the copies
    // existed (or without its registry) states only what it recorded.
    const slot1 = backend.slots.slot1!;
    backend.slots.slot1 = { ...slot1, evolution: { mutationPreset: 'turbo', founderMode: 'diverse' } };
    expect((await list(8)).find((x) => x.slotId === 'slot1')!.modes).toBeUndefined();
    const { evolution: _e, registry: _r, ...older } = slot1;
    backend.slots.slot1 = older;
    expect((await list(9)).find((x) => x.slotId === 'slot1')!.modes).toBeUndefined();
    const { registry: _r2, ...noRegistry } = slot1;
    backend.slots.slot1 = noRegistry;
    expect((await list(10)).find((x) => x.slotId === 'slot1')!.modes).toEqual({
      mutationPreset: 'fixed',
      founderMode: 'diverse',
    });
  });
});
