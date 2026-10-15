/**
 * Determinism of Suggested Community dishes (P5.4 part 2; CLAUDE.md "Determinism"; D-0128). For H05, H09,
 * H10 and H11 Suggested (habitatStart(habitatRegistry(), id, { community: true })): one run of 400 ticks
 * equals four runs of 100; a save at tick 200 (buildSaveFile -> loadSaveFile: the import accepts the
 * community's organisms) continued to 1,000 equals the uninterrupted run; and the worker host builds the
 * same dish from the New Dish request { empty: true, habitatId, community: true } and reaches the same
 * stateHash at tick 600 at 1x and at 4x. Compared relationally: no hash literal.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import type { Speed } from '../../src/worker/protocol';
import { habitatRegistry, habitatStart } from '../helpers/habitats';
import { FakeClockHost } from '../helpers/host';

const reg = habitatRegistry();
const IDS = ['H05_BRINE_MOSAIC', 'H09_DRYING_LACE', 'H10_GATE_LAB', 'H11_GRAZING_MEADOW'] as const;

function hostAt(speed: Speed, habitatId: string, tick: number): string {
  const h = new FakeClockHost(reg);
  h.create(`community-${speed}`, { kind: 'recipe', recipeId: 'FIRST_DISH_V1', seed: 104729, overrides: { empty: true, habitatId, community: true } });
  h.setSpeed(speed);
  h.advanceTo(tick);
  h.setSpeed(0);
  expect(h.tick).toBe(tick);
  return h.hash();
}

describe('Suggested Community dishes are deterministic', () => {
  it.each(IDS)('%s: one run equals chunks; save at 200 -> load -> 1,000 equals uninterrupted', async (id) => {
    const once = habitatStart(reg, id, { community: true });
    run(once, 400);
    const at400 = stateHash(once);
    const chunks = habitatStart(reg, id, { community: true });
    for (let k = 0; k < 4; k++) run(chunks, 100);
    expect(stateHash(chunks)).toBe(at400);
    run(once, 600);
    const ref = stateHash(once);

    const saved = habitatStart(reg, id, { community: true });
    run(saved, 200);
    const built = await buildSaveFile(saved, { name: id, savedAt: '2026-10-15T00:00:00.000Z', recipeId: 'FIRST_DISH_V1' });
    const loaded = (await loadSaveFile(built.text)).world;
    expect(stateHash(loaded)).toBe(stateHash(saved));
    expect(loaded.content.habitat).toEqual(saved.content.habitat);
    run(loaded, 800);
    expect(loaded.tick).toBe(1000);
    expect(stateHash(loaded)).toBe(ref);
  }, 600_000);

  it.each(IDS)('%s: the worker host at 1x and at 4x reaches the same stateHash at tick 600, equal to the headless start', (id) => {
    const one = hostAt(1, id, 600);
    const four = hostAt(4, id, 600);
    expect(four).toBe(one);
    // The host builds exactly the dish habitatStart realizes (same overrides, same provenance).
    const w = habitatStart(reg, id, { community: true });
    const h = new FakeClockHost(reg);
    h.create('community-start', { kind: 'recipe', recipeId: 'FIRST_DISH_V1', seed: 104729, overrides: { empty: true, habitatId: id, community: true } });
    expect(h.world.content.provenance).toEqual(w.content.provenance);
    expect(h.world.ents.highWater).toBe(w.ents.highWater);
    expect(h.hash()).toBe(stateHash(w));
    run(w, 600);
    expect(stateHash(w)).toBe(one);
  }, 600_000);
});
