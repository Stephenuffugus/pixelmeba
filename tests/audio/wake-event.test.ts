/**
 * P3.10: the 'wake' event reaches the UI (snapshot visualEvents passes it, additive, no protocol bump),
 * the feed ignores it (no new line), and the cue counter maps births → division and wakes → wake.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { clearFeed, feed, pushFeed } from '../../src/ui/feed';
import { visualEvents } from '../../src/worker/snapshot';
import type { SimEvent } from '../../src/sim/events';
import { divisionAudible, worldCueCounts } from '../../src/audio/cues';

const ev = (id: number, type: SimEvent['type'], extra: Partial<SimEvent> = {}): SimEvent => ({
  id,
  tick: 10,
  type,
  species: 0,
  birthId: 7,
  cell: 300,
  ...extra,
});

describe("the 'wake' visual event", () => {
  beforeEach(() => clearFeed());

  it('visualEvents passes a wake through with its species, cell and birth id', () => {
    const out = visualEvents([ev(1, 'wake'), ev(2, 'birth')], 0);
    expect(out.map((e) => e.type)).toEqual(['wake', 'birth']);
    expect(out[0]).toMatchObject({ type: 'wake', species: 0, cell: 300, birthId: 7, tick: 10 });
  });

  it('the feed ignores wakes and still reports births', () => {
    const vis = visualEvents([ev(1, 'wake'), ev(2, 'wake'), ev(3, 'birth')], 0);
    pushFeed(vis, ['Sunbead']);
    expect(feed.value.map((l) => l.text)).toEqual(['A Sunbead split in two.']);
    clearFeed();
    pushFeed(visualEvents([ev(1, 'wake')], 0), ['Sunbead']);
    expect(feed.value).toEqual([]);
  });

  it('births count toward division and wakes toward wake; other events toward nothing', () => {
    const vis = visualEvents(
      [ev(1, 'birth'), ev(2, 'birth'), ev(3, 'wake'), ev(4, 'death'), ev(5, 'introduce')],
      0,
    );
    const all = () => true;
    expect(worldCueCounts(vis, all)).toEqual({ division: 2, wake: 1 });
    expect(worldCueCounts([], all)).toEqual({ division: 0, wake: 0 });
  });

  it('bacterial and viral births never count toward division (UX §8.1 "No sound per bacterial division burst")', () => {
    // species 0 bacterium, 1 alga, 2 virus, 3 consumer, 4 no recorded category
    const audible = divisionAudible(['bacterium', 'alga', 'virus', 'consumer']);
    const vis = visualEvents(
      [
        ev(1, 'birth', { species: 0 }),
        ev(2, 'birth', { species: 0 }),
        ev(3, 'birth', { species: 2 }),
        ev(4, 'birth', { species: 1 }),
        ev(5, 'birth', { species: 3 }),
        ev(6, 'birth', { species: 4 }),
        ev(7, 'wake', { species: 0 }),
      ],
      0,
    );
    expect(worldCueCounts(vis, audible)).toEqual({ division: 2, wake: 1 });
    // A bacteria-only dish: births never sound at all.
    expect(worldCueCounts(visualEvents([ev(1, 'birth'), ev(2, 'birth')], 0), audible).division).toBe(0);
    // No categories (unknown) → silent.
    expect(worldCueCounts(vis, divisionAudible(undefined)).division).toBe(0);
  });
});

describe('the dish info carries each species category for the division cue (P3.10 fix 1)', () => {
  it('speciesCategories follows speciesIds and the world’s recorded species records', async () => {
    const { DishHost } = await import('../../src/worker/host');
    const { registry } = await import('../helpers/world');
    const out: { type: string; info?: { speciesIds: readonly string[]; speciesCategories?: readonly string[] } }[] = [];
    const reg = registry();
    const host = new DishHost(reg, (m) => out.push(m), { now: () => 0 });
    host.handle({ type: 'create', requestId: 1, dishId: 'd1', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } });
    const info = out.find((m) => m.type === 'ready')!.info!;
    expect(info.speciesCategories).toHaveLength(info.speciesIds.length);
    info.speciesIds.forEach((id, i) =>
      expect(info.speciesCategories![i]).toBe(reg.species[id]!.category),
    );
    const audible = divisionAudible(info.speciesCategories);
    expect(audible(info.speciesIds.indexOf('B01'))).toBe(false);
    expect(audible(info.speciesIds.indexOf('A01'))).toBe(true);
  });
});
