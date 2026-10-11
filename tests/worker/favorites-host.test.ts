/**
 * P4.1 favorites through the worker host (DishHost; D-0070).
 *
 * - favorite ops (follow, rename, pattern, representative, unpin, pin) answer with the record and never
 *   become commands; snapshots carry the marks;
 * - a tick-0 dish with a followed family is never "unchanged, rebuilds exactly" (D-0033 (a));
 * - Duplicate copies the favorites only, under the copy's world id;
 * - a comparison arm keeps no favorites and gets no watch;
 * - never alters behaviour: three followed families at 4× for 3,000 ticks with a save → load in the
 *   middle give the same stateHash and full trajectory digest as the same commands without favorites.
 */
import { describe, expect, it } from 'vitest';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import { selectSample } from '../../src/sim/sample';
import { stateHash } from '../../src/sim/serialize';
import type { World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, SnapshotMsg, Speed, ToWorker } from '../../src/worker/protocol';
import { trajectoryDigest } from '../helpers/trajectory';
import { registry } from '../helpers/world';

const REG = registry();

class Driver {
  now = 0;
  readonly out: FromWorker[] = [];
  readonly host: DishHost;
  readonly backend = new MemoryBackend();
  private req = 0;
  constructor() {
    this.host = new DishHost(
      REG,
      (m) => this.out.push(m),
      { now: () => this.now, iso: () => '2026-10-10T00:00:00.000Z' },
      new SaveStore(this.backend),
    );
  }
  id(): number {
    return ++this.req;
  }
  reply<T extends FromWorker['type']>(type: T, requestId: number): Extract<FromWorker, { type: T }> {
    const r = this.out.find((m) => m.type === type && (m as { requestId?: number }).requestId === requestId);
    if (!r)
      throw new Error(
        `no ${type} for ${requestId}: ${JSON.stringify(this.out.filter((m) => m.type === 'error').slice(-2))}`,
      );
    return r as Extract<FromWorker, { type: T }>;
  }
  send<T extends FromWorker['type']>(msg: ToWorker, type: T): Extract<FromWorker, { type: T }> {
    this.host.handle(msg);
    return this.reply(type, (msg as { requestId: number }).requestId);
  }
  async sendAsync<T extends FromWorker['type']>(
    msg: ToWorker,
    type: T,
  ): Promise<Extract<FromWorker, { type: T }>> {
    await this.host.handleAsync(msg);
    return this.reply(type, (msg as { requestId: number }).requestId);
  }
  create(dishId: string): World {
    this.send(
      { type: 'create', requestId: this.id(), dishId, source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } },
      'ready',
    );
    return this.host.world(dishId)!;
  }
  follow(dishId: string, birthId: number, nickname: string | null = null) {
    return this.send(
      {
        type: 'favorite',
        requestId: this.id(),
        dishId,
        op: { kind: 'follow', birthId, nickname, pattern: 'circle' },
      },
      'notebook',
    );
  }
  /** Run the active dish at `speed` until it reaches `target` exactly. */
  runTo(dishId: string, speed: Speed, target: number): void {
    this.host.handle({ type: 'setSpeed', dishId, speed });
    const w = () => this.host.world(dishId)!;
    while (w().tick < target) {
      const remaining = target - w().tick;
      this.now += (Math.min(remaining, 4) * 100) / speed;
      this.host.pump();
    }
    this.host.handle({ type: 'setSpeed', dishId, speed: 0 });
    expect(w().tick).toBe(target);
  }
  lastSnapshot(dishId: string): SnapshotMsg | undefined {
    return this.out.filter((m): m is SnapshotMsg => m.type === 'snapshot' && m.dishId === dishId).at(-1);
  }
}

function speciesIds(w: World, speciesId: string, n: number): number[] {
  const c = w.ents.cols;
  const out: number[] = [];
  for (let i = 0; i < w.ents.highWater && out.length < n; i++)
    if (c.alive[i] === 1 && w.species[c.species[i]!]!.id === speciesId) out.push(c.birthId[i]!);
  return out;
}

describe('favorite ops through DishHost', () => {
  it('follow, rename, pattern, representative, unpin and pin answer with the record; snapshots carry the marks; nothing is a command', () => {
    const h = new Driver();
    const w = h.create('d1');
    const seq = w.commands.nextSeq;
    const hash = stateHash(w);
    const [a, b] = speciesIds(w, 'B01', 2);
    const r1 = h.follow('d1', a!, '  Mango  ');
    expect(r1.refused).toBeUndefined();
    expect(r1.record.favorites[0]).toMatchObject({
      id: 'fav-1',
      rootBirthId: a,
      nickname: 'Mango',
      pattern: 'circle',
      representative: a,
      active: true,
      members: [[a, 0]],
    });
    expect(h.lastSnapshot('d1')!.favorites!.slots).toEqual([
      {
        id: 'fav-1',
        pattern: 'circle',
        members: 1,
        highlighted: 1,
        aggregate: null,
        representativeEntity: expect.any(Number),
        representativeHeld: false,
        next: null,
        candidates: [],
        depth: 0,
      },
    ]);
    const rename = h.send(
      {
        type: 'favorite',
        requestId: h.id(),
        dishId: 'd1',
        op: { kind: 'rename', id: 'fav-1', nickname: 'Papaya' },
      },
      'notebook',
    );
    expect(rename.record.favorites[0]!.nickname).toBe('Papaya');
    const pat = h.send(
      {
        type: 'favorite',
        requestId: h.id(),
        dishId: 'd1',
        op: { kind: 'pattern', id: 'fav-1', pattern: 'triangle' },
      },
      'notebook',
    );
    expect(pat.record.favorites[0]!.pattern).toBe('triangle');
    expect(h.lastSnapshot('d1')!.favorites!.slots[0]!.pattern).toBe('triangle');
    // A representative must be a living member of that family.
    const notMember = h.send(
      {
        type: 'favorite',
        requestId: h.id(),
        dishId: 'd1',
        op: { kind: 'representative', id: 'fav-1', birthId: b! },
      },
      'notebook',
    );
    expect(notMember.refused).toBe('That organism is not a living member of this family.');
    // A malformed op is refused, never applied.
    const bad = h.send(
      {
        type: 'favorite',
        requestId: h.id(),
        dishId: 'd1',
        op: { kind: 'follow', birthId: -3, nickname: null, pattern: 'hexagon' } as never,
      },
      'notebook',
    );
    expect(bad.refused).toBe('That change to a favorite could not be read.');
    const unpin = h.send(
      { type: 'favorite', requestId: h.id(), dishId: 'd1', op: { kind: 'unpin', id: 'fav-1' } },
      'notebook',
    );
    expect(unpin.record.favorites[0]!.active).toBe(false);
    expect(h.lastSnapshot('d1')!.favorites).toBeUndefined();
    const pin = h.send(
      { type: 'favorite', requestId: h.id(), dishId: 'd1', op: { kind: 'pin', id: 'fav-1' } },
      'notebook',
    );
    expect(pin.record.favorites[0]!.active).toBe(true);
    // notebookGet, with the representative's inspector payload.
    const got = h.send({ type: 'notebookGet', requestId: h.id(), dishId: 'd1', inspect: a! }, 'notebook');
    expect(got.record).toEqual(pin.record);
    expect(got.inspected!.birthId).toBe(a);
    // Nothing reached the world: no command, the same hash.
    expect(w.commands.nextSeq).toBe(seq);
    expect(stateHash(w)).toBe(hash);
  });

  it('a tick-0 dish with a followed family is kept, never "unchanged"', async () => {
    const h = new Driver();
    const w = h.create('d1');
    const plan0 = await h.sendAsync({ type: 'keepPlan', requestId: h.id(), aboutDishId: 'd1' }, 'keepPlan');
    expect(plan0.plan.kind).toBe('unchanged');
    h.follow('d1', speciesIds(w, 'B01', 1)[0]!);
    const plan1 = await h.sendAsync({ type: 'keepPlan', requestId: h.id(), aboutDishId: 'd1' }, 'keepPlan');
    expect(plan1.plan.kind).toBe('slot');
    // Kept to its slot: the slot then holds it exactly ('saved'), notebook included.
    await h.sendAsync(
      { type: 'saveSlot', requestId: h.id(), dishId: 'd1', slotId: 'slot1', name: 'Garden' },
      'slotSaved',
    );
    expect(
      (await h.sendAsync({ type: 'keepPlan', requestId: h.id(), aboutDishId: 'd1' }, 'keepPlan')).plan.kind,
    ).toBe('saved');
    // A notebook-only change after that save is a change.
    h.send(
      {
        type: 'favorite',
        requestId: h.id(),
        dishId: 'd1',
        op: { kind: 'rename', id: 'fav-1', nickname: 'Renamed' },
      },
      'notebook',
    );
    expect(
      (await h.sendAsync({ type: 'keepPlan', requestId: h.id(), aboutDishId: 'd1' }, 'keepPlan')).plan.kind,
    ).toBe('slot');
  });

  it('Duplicate copies the favorites only, under the copy’s world id', () => {
    const h = new Driver();
    const w = h.create('d1');
    h.follow('d1', speciesIds(w, 'B01', 1)[0]!, 'Mango');
    const ready = h.send({ type: 'duplicate', requestId: h.id(), dishId: 'd1', newDishId: 'd2' }, 'ready');
    expect(ready.info.worldId).not.toBe(w.worldId);
    const a = h.send({ type: 'notebookGet', requestId: h.id(), dishId: 'd1' }, 'notebook').record;
    const b = h.send({ type: 'notebookGet', requestId: h.id(), dishId: 'd2' }, 'notebook').record;
    expect(b.worldId).toBe(ready.info.worldId);
    expect(b.favorites).toEqual(a.favorites);
    expect(b.nextFavorite).toBe(a.nextFavorite);
    expect(Object.keys(b).sort()).toEqual([
      'checksum',
      'favorites',
      'format',
      'nextFavorite',
      'notebookVersion',
      'worldId',
    ]);
    // Independent from here: a change to the copy leaves the original.
    h.send(
      {
        type: 'favorite',
        requestId: h.id(),
        dishId: 'd2',
        op: { kind: 'rename', id: 'fav-1', nickname: 'Copy' },
      },
      'notebook',
    );
    expect(
      h.send({ type: 'notebookGet', requestId: h.id(), dishId: 'd1' }, 'notebook').record.favorites[0]!
        .nickname,
    ).toBe('Mango');
  });

  it('a comparison arm keeps no favorites and gets no watch', () => {
    const h = new Driver();
    const w = h.create('d1');
    h.follow('d1', speciesIds(w, 'B01', 1)[0]!);
    h.send(
      {
        type: 'compareStart',
        requestId: h.id(),
        compareId: 'c1',
        sourceDishId: 'd1',
        aDishId: 'a',
        bDishId: 'b',
      },
      'compareState',
    );
    h.send(
      { type: 'compareRun', requestId: h.id(), compareId: 'c1', horizonTicks: 40, speed: 'max' },
      'compareState',
    );
    for (let i = 0; i < 40; i++) {
      h.now += 50;
      h.host.pump();
    }
    const dishes = (
      h.host as unknown as {
        dishes: Record<string, { notebookWatch?: unknown; notebook: { favorites: unknown[] } }>;
      }
    ).dishes;
    expect(h.host.world('a')!.tick).toBeGreaterThan(0);
    for (const id of ['a', 'b']) {
      expect(dishes[id]!.notebookWatch ?? null).toBeNull();
      expect(dishes[id]!.notebook.favorites).toEqual([]);
      expect(
        h.out
          .filter((m): m is SnapshotMsg => m.type === 'snapshot' && m.dishId === id)
          .every((s) => s.favorites === undefined),
      ).toBe(true);
    }
    const refused = h.send(
      {
        type: 'favorite',
        requestId: h.id(),
        dishId: 'a',
        op: {
          kind: 'follow',
          birthId: speciesIds(h.host.world('a')!, 'B01', 1)[0]!,
          nickname: null,
          pattern: 'square',
        },
      },
      'notebook',
    );
    expect(refused.refused).toBe('Comparison copies keep no favorites.');
  });
});

/** A living organism that a radius-1 Sample take lifts alone (at tick 0 every founder's family is itself). */
function loner(w: World): { b: number; x: number; y: number } {
  const c = w.ents.cols;
  for (let i = 0; i < w.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const x = Math.floor(c.x[i]!) + 0.5;
    const y = Math.floor(c.y[i]!) + 0.5;
    const sel = selectSample(w, x, y, 1, 'life');
    if (sel.missing.length === 0 && sel.slots.length === 1 && sel.slots[0] === i)
      return { b: c.birthId[i]!, x, y };
  }
  throw new Error('no lone organism');
}

function aliveIds(w: World): Set<number> {
  const c = w.ents.cols;
  const s = new Set<number>();
  for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1) s.add(c.birthId[i]!);
  return s;
}

describe('fix round 1: Undo and rollback check the kept favorites against the restored dish', () => {
  function changes(h: Driver, kind: string) {
    return h.out.filter(
      (m): m is Extract<FromWorker, { type: 'notebookChanged' }> =>
        m.type === 'notebookChanged' && m.change.kind === kind,
    );
  }

  it('Undo of a Discard that ended a followed family: the family is followed again, Pin is never refused, and a reload keeps it', async () => {
    const h = new Driver();
    const w = h.create('d1');
    const L = loner(w);
    expect(h.follow('d1', L.b, 'Solo').refused).toBeUndefined();
    h.send({ type: 'sampleBegin', requestId: h.id(), dishId: 'd1' }, 'sampleBegun');
    expect(
      h.send(
        {
          type: 'command',
          requestId: h.id(),
          dishId: 'd1',
          commandId: 't',
          payload: { kind: 'sampleTake', x: L.x, y: L.y, radius: 1, mode: 'life' },
          undoable: false,
        },
        'ack',
      ).result!.accepted,
    ).toBeGreaterThan(0);
    h.send(
      {
        type: 'command',
        requestId: h.id(),
        dishId: 'd1',
        commandId: 'd',
        payload: { kind: 'sampleDiscard' },
        undoable: true,
      },
      'ack',
    );
    expect(changes(h, 'favoriteExtinct')).toHaveLength(1);
    expect(
      h.send({ type: 'notebookGet', requestId: h.id(), dishId: 'd1' }, 'notebook').record.favorites[0]!
        .extinct,
    ).not.toBeNull();
    // Undo: the sample is held again with the member in it; the extinction was the undone change's.
    h.send({ type: 'undo', requestId: h.id(), dishId: 'd1' }, 'ack');
    expect(changes(h, 'favoritesRestored')).toHaveLength(1);
    expect(changes(h, 'favoritesRestored')[0]!.change).toEqual({ kind: 'favoritesRestored', removed: [] });
    let rec = h.send({ type: 'notebookGet', requestId: h.id(), dishId: 'd1' }, 'notebook').record
      .favorites[0]!;
    expect(rec).toMatchObject({ active: true, extinct: null, representative: L.b });
    // Cancel puts the member back in the dish: one living member, Find works.
    h.send({ type: 'sampleCancel', requestId: h.id(), dishId: 'd1' }, 'sampleCancelled');
    expect(aliveIds(h.host.world('d1')!).has(L.b)).toBe(true);
    h.host.handle({ type: 'view', dishId: 'd1', overlay: null, selection: null });
    const slot = h.lastSnapshot('d1')!.favorites!.slots[0]!;
    expect(slot).toMatchObject({ members: 1, representativeHeld: false });
    expect(slot.representativeEntity).not.toBeNull();
    rec = h.send({ type: 'notebookGet', requestId: h.id(), dishId: 'd1' }, 'notebook').record.favorites[0]!;
    expect(rec).toMatchObject({ active: true, extinct: null, members: [[L.b, 0]] });
    // Saved and reloaded: still followed, not extinct.
    await h.sendAsync(
      { type: 'saveSlot', requestId: h.id(), dishId: 'd1', slotId: 'slot1', name: 'Undo' },
      'slotSaved',
    );
    const loaded = await h.sendAsync(
      { type: 'loadSlot', requestId: h.id(), slotId: 'slot1', newDishId: 'd2' },
      'loaded',
    );
    expect(loaded.notebookDropped).toBeUndefined();
    expect(
      h.send({ type: 'notebookGet', requestId: h.id(), dishId: 'd2' }, 'notebook').record.favorites[0],
    ).toMatchObject({ active: true, extinct: null });
  });

  it('Undo to before a family died out (an extinction recorded later than the restored time) brings the favorite back', () => {
    const h = new Driver();
    const w0 = h.create('d1');
    const b = speciesIds(w0, 'B04', 1)[0]!;
    expect(h.follow('d1', b, 'Mango').refused).toBeUndefined();
    h.send(
      {
        type: 'command',
        requestId: h.id(),
        dishId: 'd1',
        commandId: 'c1',
        payload: { kind: 'deposit', materialId: 'SUGAR', points: [[64, 64]], radius: 2, dose: 0.2 },
        undoable: true,
      },
      'ack',
    );
    const restoredTick = h.host.world('d1')!.tick;
    h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 4 });
    // Test-only: starve this family so it dies out (the world is thrown away by the Undo below).
    for (let t = 0; t < 3000 && changes(h, 'favoriteExtinct').length === 0; t++) {
      const w = h.host.world('d1')!;
      const c = w.ents.cols;
      for (let i = 0; i < w.ents.highWater; i++)
        if (c.alive[i] === 1 && w.species[c.species[i]!]!.id === 'B04') c.E[i] = 0;
      h.now += 25;
      h.host.pump();
    }
    h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 0 });
    expect(changes(h, 'favoriteExtinct')).toHaveLength(1);
    const before = h.send({ type: 'notebookGet', requestId: h.id(), dishId: 'd1' }, 'notebook').record
      .favorites[0]!;
    expect(before.extinct!.tick).toBeGreaterThan(restoredTick);
    h.send({ type: 'undo', requestId: h.id(), dishId: 'd1' }, 'ack');
    const w = h.host.world('d1')!;
    expect(w.tick).toBe(restoredTick);
    expect(aliveIds(w).has(b)).toBe(true);
    const after = h.send({ type: 'notebookGet', requestId: h.id(), dishId: 'd1' }, 'notebook').record
      .favorites[0]!;
    expect(after.extinct).toBeNull();
    expect(after.active).toBe(true);
    expect(after.members.some(([x]) => x === b)).toBe(true);
    expect(h.lastSnapshot('d1')!.favorites!.slots[0]!.members).toBeGreaterThan(0);
  });

  it('Undo of the Add Life that introduced a followed organism removes that favorite; its birth id given again is not that family', () => {
    const h = new Driver();
    const w0 = h.create('d1');
    const next = w0.counters.nextBirthId;
    h.send(
      {
        type: 'command',
        requestId: h.id(),
        dishId: 'd1',
        commandId: 'c1',
        payload: { kind: 'inoculate', speciesId: 'B06', x: 30, y: 64, radius: 2, count: 1 },
        undoable: true,
      },
      'ack',
    );
    expect(h.follow('d1', next, 'New').refused).toBeUndefined();
    h.send({ type: 'undo', requestId: h.id(), dishId: 'd1' }, 'ack');
    const restored = changes(h, 'favoritesRestored');
    expect(restored).toHaveLength(1);
    expect(restored[0]!.change).toEqual({ kind: 'favoritesRestored', removed: ['New'] });
    expect(restored[0]!.record.favorites).toEqual([]);
    expect(
      h.send({ type: 'notebookGet', requestId: h.id(), dishId: 'd1' }, 'notebook').record.favorites,
    ).toEqual([]);
    expect(h.lastSnapshot('d1')!.favorites).toBeUndefined();
    // A later Add Life gets the same birth id: it is no member of any favorite; following it is a new favorite.
    h.send(
      {
        type: 'command',
        requestId: h.id(),
        dishId: 'd1',
        commandId: 'c2',
        payload: { kind: 'inoculate', speciesId: 'B01', x: 90, y: 64, radius: 2, count: 1 },
        undoable: true,
      },
      'ack',
    );
    expect(aliveIds(h.host.world('d1')!).has(next)).toBe(true);
    expect(h.lastSnapshot('d1')!.favorites).toBeUndefined();
    const again = h.follow('d1', next, 'Sprinter');
    expect(again.refused).toBeUndefined();
    expect(again.record.favorites).toHaveLength(1);
    expect(again.record.favorites[0]).toMatchObject({ id: 'fav-2', speciesId: 'B01', rootBirthId: next });
  });
});

describe('favorites never alter behaviour (notebook kind "favorites")', () => {
  async function scenario(
    withFavorites: boolean,
  ): Promise<{ hash: string; digest: string; tick: number; marks: number }> {
    const h = new Driver();
    const w = h.create('d1');
    if (withFavorites)
      for (const b of speciesIds(w, 'B01', 3)) expect(h.follow('d1', b).refused).toBeUndefined();
    h.runTo('d1', 4, 700);
    // The same command in both runs (undoable, so the host keeps an undo point), then Undo of a second one.
    h.send(
      {
        type: 'command',
        requestId: h.id(),
        dishId: 'd1',
        commandId: 'sugar',
        payload: { kind: 'deposit', materialId: 'SUGAR', points: [[64, 64]], radius: 3, dose: 0.5 },
        undoable: true,
      },
      'ack',
    );
    h.runTo('d1', 4, 1500);
    h.send(
      {
        type: 'command',
        requestId: h.id(),
        dishId: 'd1',
        commandId: 'sugar2',
        payload: { kind: 'deposit', materialId: 'SUGAR', points: [[40, 70]], radius: 2, dose: 0.5 },
        undoable: true,
      },
      'ack',
    );
    h.send({ type: 'undo', requestId: h.id(), dishId: 'd1' }, 'ack');
    // Save → load in the middle.
    await h.sendAsync(
      { type: 'saveSlot', requestId: h.id(), dishId: 'd1', slotId: 'slot1', name: 'Fence' },
      'slotSaved',
    );
    await h.sendAsync({ type: 'loadSlot', requestId: h.id(), slotId: 'slot1', newDishId: 'd2' }, 'loaded');
    h.host.handle({ type: 'dispose', dishId: 'd1' });
    if (withFavorites) {
      const nb = h.send({ type: 'notebookGet', requestId: h.id(), dishId: 'd2' }, 'notebook').record;
      expect(nb.favorites.filter((f) => f.active).length + nb.favorites.filter((f) => f.extinct).length).toBe(
        3,
      );
    }
    h.runTo('d2', 4, 3200);
    const w2 = h.host.world('d2')!;
    const snap = h.lastSnapshot('d2');
    const marks = snap?.favorites ? snap.favorites.slots.length : 0;
    return { hash: stateHash(w2), digest: trajectoryDigest(w2, 'full'), tick: w2.tick, marks };
  }

  it('three followed families, 4×, 3,200 ticks, a save → load in the middle: equal stateHash and full trajectory digest', async () => {
    const plain = await scenario(false);
    const followed = await scenario(true);
    expect(followed.tick).toBe(3200);
    expect(followed.marks).toBeGreaterThan(0); // the tracker and the marks really ran
    expect(plain.marks).toBe(0);
    expect(followed.hash).toBe(plain.hash);
    expect(followed.digest).toBe(plain.digest);
  }, 600_000);
});
