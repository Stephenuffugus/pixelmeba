/**
 * P4.3 live thumbnails (UX §2 "Continue (last dish, live thumbnail)", §2.2 "Square live-state
 * thumbnails"): a 32 × 32 majority-species grid read from entity columns. Read-only and deterministic;
 * the snapshot path and the world path agree; the slot index carries the saved moment's picture without
 * breaking "Continue already holds exactly this file" (holdsSave); the Play shelf's picture is the dish
 * the Start button makes.
 */
import { describe, expect, it } from 'vitest';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, SnapshotMsg, ToWorker } from '../../src/worker/protocol';
import { dishThumb, parseThumb, THUMB_SIZE, thumbFromSnapshot, thumbFromState } from '../../src/worker/thumbnail';
import { FakeClockHost } from '../helpers/host';
import { clearWater, place, registry } from '../helpers/world';

const REG = registry();

function garden(ticks: number) {
  const w = realizeRecipe(REG, REG.recipes.FIRST_DISH_V1!, { worldId: 'thumb-test' });
  run(w, ticks);
  return w;
}

function block(thumb: string, bx: number, by: number): string | null {
  const t = parseThumb(thumb)!;
  const v = t.grid[by * THUMB_SIZE + bx]!;
  return v === 0 ? null : t.speciesIds[v - 1]!;
}

describe('dishThumb', () => {
  it('is deterministic and read-only: the state hash is equal before and after, and two reads give the same string', () => {
    const w = garden(300);
    const before = stateHash(w);
    const a = dishThumb(w);
    const b = dishThumb(w);
    expect(stateHash(w)).toBe(before);
    expect(a).toBe(b);
    const t = parseThumb(a)!;
    expect(t.grid.length).toBe(THUMB_SIZE * THUMB_SIZE);
    expect(t.speciesIds).toEqual(w.species.map((s) => s.id));
    // Living organisms are drawn (FIRST_DISH_V1 has 56 founders); most blocks are empty water.
    const filled = t.grid.filter((v) => v > 0).length;
    expect(filled).toBeGreaterThan(5);
    expect(filled).toBeLessThan(THUMB_SIZE * THUMB_SIZE / 2);
  });

  it('the same world gives the same bytes: after a save → load round trip, and from the serialized state', () => {
    const w = garden(200);
    const copy = deserializeWorld(serializeWorld(w));
    expect(dishThumb(copy)).toBe(dishThumb(w));
    expect(thumbFromState(serializeWorld(w))).toBe(dishThumb(w));
    // A different moment is a different picture (organisms moved).
    const later = garden(600);
    expect(dishThumb(later)).not.toBe(dishThumb(w));
  });

  it('each block shows its majority species, and the lowest species index on a tie', () => {
    const w = clearWater();
    const a01 = w.species.findIndex((s) => s.id === 'A01');
    const b01 = w.species.findIndex((s) => s.id === 'B01');
    expect(a01).toBeLessThan(b01);
    // Block (10, 16) = cells x 40–43, y 64–67: two of each → the lower index (A01).
    place(w, 'B01', 40.5, 64.5);
    place(w, 'B01', 41.5, 65.5);
    place(w, 'A01', 42.5, 64.5);
    place(w, 'A01', 43.5, 66.5);
    // Block (12, 16) = cells x 48–51: one A01, two B01 → B01.
    place(w, 'A01', 48.5, 64.5);
    place(w, 'B01', 49.5, 64.5);
    place(w, 'B01', 50.5, 65.5);
    const t = dishThumb(w);
    expect(block(t, 10, 16)).toBe('A01');
    expect(block(t, 12, 16)).toBe('B01');
    expect(block(t, 11, 16)).toBeNull();
    expect(parseThumb(t)!.grid.filter((v) => v > 0).length).toBe(2);
  });

  it('rejects malformed strings (the slot index is stored data)', () => {
    const good = dishThumb(clearWater());
    expect(parseThumb(good)).not.toBeNull();
    expect(parseThumb('')).toBeNull();
    expect(parseThumb(42)).toBeNull();
    expect(parseThumb(good.replace('pt1:', 'pt2:'))).toBeNull();
    expect(parseThumb('pt1:B01:AAAA')).toBeNull(); // wrong size
    const bytes = new Uint8Array(THUMB_SIZE * THUMB_SIZE);
    bytes[0] = 3; // index beyond the listed species
    expect(parseThumb(`pt1:B01:${Buffer.from(bytes).toString('base64')}`)).toBeNull();
  });
});

describe('thumbFromSnapshot', () => {
  it('agrees with dishThumb on the same moment (the open dish draws from its latest snapshot)', () => {
    const h = new FakeClockHost(REG);
    h.create('thumb-dish', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    h.setSpeed(4);
    h.advanceTo(400);
    h.setSpeed(0);
    h.pump(16);
    const snap = h.out.filter((m): m is SnapshotMsg => m.type === 'snapshot' && m.dishId === 'thumb-dish').at(-1)!;
    expect(snap.tick).toBe(h.world.tick);
    const ids = h.world.species.map((s) => s.id);
    expect(thumbFromSnapshot(snap, ids)).toBe(dishThumb(h.world));
  });

  it('agrees for an organism a hair below a block edge (positions are rounded to 32-bit float, as a snapshot carries them)', () => {
    const w = clearWater();
    const slot = place(w, 'B01', 40.5, 64.5);
    w.ents.cols.x[slot] = 43.99999999999; // f64 block 10; float32 rounds it to 44 → block 11
    const ents = new Float32Array(14);
    ents[1] = w.ents.cols.species[slot]!;
    ents[2] = w.ents.cols.x[slot]!;
    ents[3] = w.ents.cols.y[slot]!;
    const ids = w.species.map((s) => s.id);
    expect(thumbFromSnapshot({ ents, count: 1 }, ids)).toBe(dishThumb(w));
    expect(block(dishThumb(w), 11, 16)).toBe('B01');
  });
});

describe('thumbnails in the worker', () => {
  it('the Play shelf preview’s thumbnail is the dish its Start makes, at tick 0', () => {
    const h = new FakeClockHost(REG);
    h.host.handle({ type: 'newDishPreview', requestId: 1, recipeId: 'FIRST_DISH_V1', seed: REG.recipes.FIRST_DISH_V1!.seed, overrides: {} });
    const preview = h.out.find((m) => m.type === 'newDishPreview');
    expect(preview?.type).toBe('newDishPreview');
    const thumb = preview!.type === 'newDishPreview' ? preview!.preview.thumb : undefined;
    h.create('play-garden', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    expect(h.world.tick).toBe(0);
    expect(thumb).toBe(dishThumb(h.world));
  });

  it('named slots and Continue carry the saved moment’s thumbnail; an unchanged dish still writes nothing at the next autosave', async () => {
    let now = 0;
    let req = 0;
    const out: FromWorker[] = [];
    const backend = new MemoryBackend();
    const host = new DishHost(REG, (m) => out.push(m), { now: () => now, iso: () => '2026-10-10T12:00:00.000Z' }, new SaveStore(backend));
    async function ask<T extends FromWorker['type']>(type: T, build: (requestId: number) => ToWorker): Promise<Extract<FromWorker, { type: T }>> {
      const requestId = ++req;
      host.handle(build(requestId));
      for (let i = 0; i < 400; i++) {
        const r = out.find((m) => 'requestId' in m && m.requestId === requestId);
        if (r) {
          if (r.type !== type) throw new Error(JSON.stringify(r).slice(0, 300));
          return r as Extract<FromWorker, { type: T }>;
        }
        await new Promise((res) => setTimeout(res, 5));
      }
      throw new Error(`no ${type} reply`);
    }
    await ask('ready', (requestId) => ({ type: 'create', requestId, dishId: 'd1', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } }));
    host.handle({ type: 'setSpeed', dishId: 'd1', speed: 4 });
    while (host.world('d1')!.tick < 150) {
      now += 25;
      host.pump();
    }
    host.handle({ type: 'setSpeed', dishId: 'd1', speed: 0 });
    const w = host.world('d1')!;
    const want = dishThumb(w);
    const hash = stateHash(w);
    const saved = await ask('slotSaved', (requestId) => ({ type: 'saveSlot', requestId, dishId: 'd1', slotId: 'slot1', name: 'Garden' }));
    expect(saved.slot.thumb).toBe(want);
    expect(backend.slots.slot1!.thumb).toBe(want);
    const first = await ask('slotSaved', (requestId) => ({ type: 'autosave', requestId, dishId: 'd1' }));
    expect(first.wrote).toBe(true);
    expect(first.slot.thumb).toBe(want);
    // Unchanged dish: Continue already holds exactly this file (the thumbnail compares equal too).
    const again = await ask('slotSaved', (requestId) => ({ type: 'autosave', requestId, dishId: 'd1' }));
    expect(again.wrote).toBe(false);
    const listed = await ask('slots', (requestId) => ({ type: 'listSlots', requestId }));
    expect(listed.slots.find((s) => s.slotId === 'autosave')!.thumb).toBe(want);
    expect(stateHash(host.world('d1')!)).toBe(hash);
    // A malformed index copy is left out of the summary, never shown.
    backend.slots.slot1 = { ...backend.slots.slot1!, thumb: 'pt1:XX:bad' };
    const relisted = await ask('slots', (requestId) => ({ type: 'listSlots', requestId }));
    expect(relisted.slots.find((s) => s.slotId === 'slot1')!.thumb).toBeUndefined();
  }, 60_000);
});
