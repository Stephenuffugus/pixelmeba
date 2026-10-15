/**
 * Phase 5 wave 14 (P5.7 region pins; D-0128): DishInfo.regions through the real worker host (DishHost).
 *   - A dish whose RECORDED habitat has regions (a FIRST_DISH_V1 world built under the shipped registry, its saved
 *     state given { ...WATER_GARDEN, regions: [two] }, opened from { kind: 'state' }) reports them: ids, labels,
 *     numbers 1–2 in record order and the anchors (regionAnchorCell agrees); Undo leaves them unchanged.
 *   - A FIRST_DISH_V1 dish and every rc1 save report no `regions` key: their DishInfo deep-equals itself with the
 *     key removed (a v1.0 dish's DishInfo is exactly as before).
 *   - The world's record decides, never the build's registry: a host whose WATER_GARDEN gained regions opens the
 *     same v1.0 states with no regions, and a host whose WATER_GARDEN has none still reports the recorded regions.
 *   - The edited-habitat world round-trips buildSaveFile → loadSaveFile with its regions (the import accepts it).
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { cellIndex } from '../../src/sim/grid';
import { regionAnchorCell, type HabitatRegion } from '../../src/sim/content/habitatRules';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { realizeRecipe } from '../../src/sim/recipes';
import { serializeWorld, stateHash, type WorldState } from '../../src/sim/serialize';
import { DishHost } from '../../src/worker/host';
import type { DishInfo, FromWorker } from '../../src/worker/protocol';
import { RC1_SAVE_FILES, readRc1SaveText } from '../helpers/rc1-saves';
import { registry } from '../helpers/world';
import { TWO_REGIONS } from '../e2e/regionPinsFixture';

/** The FIRST_DISH_V1 world's state with its recorded habitat given `regions`. */
function withRegions(state: WorldState, regions: readonly HabitatRegion[]): WorldState {
  const copy = JSON.parse(JSON.stringify(state)) as WorldState;
  return { ...copy, content: { ...copy.content, habitat: { ...copy.content.habitat, regions: regions.map((r) => JSON.parse(JSON.stringify(r)) as HabitatRegion) } } };
}

function firstDishState(): WorldState {
  return serializeWorld(realizeRecipe(registry(), 'FIRST_DISH_V1', { seed: 104729 }));
}

/** A host over `reg` with one dish opened from `state`; info() as the 'ready' reply carried it. */
function open(state: WorldState, reg: ContentRegistry = registry()) {
  const out: FromWorker[] = [];
  const host = new DishHost(reg, (m) => out.push(m), { now: () => 0 });
  host.handle({ type: 'create', requestId: 1, dishId: 'd', source: { kind: 'state', state } });
  const ready = out.find((m): m is Extract<FromWorker, { type: 'ready' }> => m.type === 'ready');
  if (!ready) throw new Error(`not created: ${JSON.stringify(out.filter((m) => m.type === 'error'))}`);
  const priv = host as unknown as { info(d: unknown): DishInfo; dishes: Record<string, unknown> };
  return { host, out, info: ready.info, now: () => priv.info(priv.dishes.d) };
}

const without = (info: DishInfo): DishInfo => {
  const copy = { ...info } as Record<string, unknown>;
  delete copy.regions;
  return copy as unknown as DishInfo;
};

/** A registry whose WATER_GARDEN record gained regions (a later content edit). */
function editedRegistry(): ContentRegistry {
  const reg = registry();
  return { ...reg, habitats: { ...reg.habitats, WATER_GARDEN: { ...reg.habitats.WATER_GARDEN!, regions: TWO_REGIONS } } };
}

describe('DishInfo.regions', () => {
  it('reports the recorded habitat’s regions: ids, labels, numbers 1–2 and anchors; unchanged after Undo', () => {
    const d = open(withRegions(firstDishState(), TWO_REGIONS));
    expect(d.info.regions).toEqual([
      { id: 'FRESH_POOL', label: 'Fresh pool', number: 1, anchor: [40, 64] },
      { id: 'CHANNEL', label: 'Channel', number: 2, anchor: [64, 63] },
    ]);
    for (const [k, r] of d.info.regions!.entries()) expect(cellIndex(r.anchor[0], r.anchor[1])).toBe(regionAnchorCell(TWO_REGIONS[k]!));
    // A command, then Undo: the world is restored from its own saved state, habitat record included.
    d.host.handle({ type: 'command', requestId: 2, dishId: 'd', commandId: 'c1', payload: { kind: 'deposit', materialId: 'SUGAR', points: [[64.5, 64.5]], radius: 3, dose: 0.5 }, undoable: true });
    const ack = d.out.find((m) => m.type === 'ack' && m.requestId === 2) as Extract<FromWorker, { type: 'ack' }> | undefined;
    expect(ack?.error).toBeUndefined();
    d.host.handle({ type: 'undo', requestId: 3, dishId: 'd' });
    const undone = d.out.find((m) => m.type === 'ack' && m.requestId === 3) as Extract<FromWorker, { type: 'ack' }> | undefined;
    expect(undone?.error).toBeUndefined();
    expect(d.now().regions).toEqual(d.info.regions);
  });

  it('the world’s record decides, never the build’s registry', () => {
    const recorded = withRegions(firstDishState(), TWO_REGIONS);
    // A build whose WATER_GARDEN has no regions still pins the recorded ones …
    expect(open(recorded, registry()).info.regions?.map((r) => r.id)).toEqual(['FRESH_POOL', 'CHANNEL']);
    // … and a build whose WATER_GARDEN gained regions never adds pins to a dish recorded without them.
    expect('regions' in open(firstDishState(), editedRegistry()).info).toBe(false);
  });

  it('a FIRST_DISH_V1 dish has no regions key: its DishInfo is exactly as before', () => {
    const { info } = open(firstDishState());
    expect('regions' in info).toBe(false);
    expect(info).toEqual(without(info));
    // The key is absent, not present-and-empty, even with an empty recorded list.
    expect('regions' in open(withRegions(firstDishState(), [])).info).toBe(false);
  });

  it('every rc1 save opens with no regions key, under the shipped and an edited registry', async () => {
    for (const file of RC1_SAVE_FILES) {
      const { world } = await loadSaveFile(readRc1SaveText(file));
      const state = serializeWorld(world);
      for (const reg of [registry(), editedRegistry()]) {
        const { info } = open(state, reg);
        expect('regions' in info, file).toBe(false);
        expect(info).toEqual(without(info));
      }
    }
  });

  it('the edited-habitat world round-trips through the save file with its regions', async () => {
    const state = withRegions(firstDishState(), TWO_REGIONS);
    const d = open(state);
    const w = (d.host as unknown as { dishes: Record<string, { world: Parameters<typeof buildSaveFile>[0] }> }).dishes.d!.world;
    const { text } = await buildSaveFile(w, { name: 'Two regions', savedAt: '2026-10-15T00:00:00.000Z', recipeId: null });
    const back = await loadSaveFile(text);
    expect(back.world.content.habitat.regions).toEqual(TWO_REGIONS);
    expect(stateHash(back.world)).toBe(stateHash(w));
    expect(open(serializeWorld(back.world)).info.regions).toEqual(d.info.regions);
  });
});
