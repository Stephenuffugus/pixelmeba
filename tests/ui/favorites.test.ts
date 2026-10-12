/**
 * P4.1 Favorite families (SPEC §12.6, UX §5.8, CT §12.10; D-0070): the notebook record's favorites and
 * the worker's membership tracker, driven over real dishes.
 *
 * - at most 3 followed; a 4th Follow is refused with its copy;
 * - Follow next: birth tick, then birth id, never energy, body or health;
 * - membership across divisions and deaths (every tick equals the root's living descendants), a Sample
 *   take (a removal with no 'death' event), a rewind (undo) and a reload;
 * - the extinction record and its exact copy;
 * - more than 200 members: 200 highlighted, then the aggregate (count and mean position);
 * - nickname cleaning (≤ 60 characters) and the default name.
 */
import { describe, expect, it, vi } from 'vitest';
import { applyNow } from '../../src/sim/commands';
import { cancelSample } from '../../src/sim/sample';
import { recordField } from '../../src/sim/lineage';
import { R } from '../../src/sim/reasons';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import {
  cleanNickname,
  emptyNotebook,
  type FavoriteRecord,
  type NotebookRecord,
} from '../../src/persistence/notebook';
import {
  applyFavoriteOp,
  FAVORITE_HIGHLIGHT_MAX,
  FAVORITE_REFUSALS,
  livingDescendants,
} from '../../src/worker/favorites';
import { NotebookWatch } from '../../src/worker/notebookWatch';
import type { FavoriteOp, NotebookChange } from '../../src/worker/protocol';
import {
  extinctLastText,
  extinctTitle,
  FAVORITE_TEXT,
  favoriteDisplayName,
  findLabel,
  followNextText,
} from '../../src/ui/strings/favorites';
import { clearWater, place, registry } from '../helpers/world';
import type { SnapshotMsg } from '../../src/worker/protocol';
import type { SimClient } from '../../src/worker/client';
import type { DishInfo } from '../../src/worker/protocol';
import {
  extinctCard,
  queueExtinctCard,
  favoriteOf,
  findFavoriteAfterChange,
  notebook,
  notebookDroppedFor,
  onFavoriteSnapshot,
  onNotebookNotice,
  wireFavorites,
} from '../../src/ui/favorites';
import { restoredRemovedText } from '../../src/ui/strings/favorites';
import * as uiState from '../../src/ui/state';

// The UI module's state.ts is replaced by a small stand-in (the real one starts a Worker and audio).
const ui = vi.hoisted(() => ({ select: vi.fn(), autosave: vi.fn(() => Promise.resolve()) }));
vi.mock('../../src/ui/state', async () => {
  const { signal } = await import('@preact/signals');
  const toast = signal<string | null>(null);
  return {
    dishInfo: signal<unknown>(null),
    sheet: signal<string>('none'),
    toast,
    showToast: (text: string) => (toast.value = text),
    select: ui.select,
    autosave: ui.autosave,
    getRenderer: () => null,
    getClient: () => {
      throw new Error('no client in this test');
    },
  };
});

const REG = registry();

/** A dish with its notebook and watch, stepped as DishHost.stepDish steps a played dish. */
class Dishlet {
  record: NotebookRecord;
  watch: NotebookWatch;
  readonly changes: NotebookChange[] = [];
  constructor(public world: World) {
    this.record = emptyNotebook(world.worldId);
    this.watch = new NotebookWatch(world, { get: () => this.record, set: (r) => (this.record = r) });
  }
  op(op: FavoriteOp): { refused: string | null } {
    const r = applyFavoriteOp(this.world, this.watch.materialize(), this.watch.favorites, op);
    if (r.refused === null) {
      this.record = r.record;
      this.watch.rebind(this.world);
    }
    return { refused: r.refused };
  }
  tick(n = 1): void {
    for (let i = 0; i < n; i++) {
      step(this.world);
      this.changes.push(...this.watch.afterTick(this.world));
    }
  }
  /** After a command (a removal without a tick), as the host does. */
  afterCommand(): void {
    this.changes.push(...this.watch.afterTick(this.world));
  }
  replaceWorld(w: World): void {
    this.watch.materialize();
    this.world = w;
    this.watch.rebind(w);
  }
  members(id: string): number[] {
    return this.watch
      .materialize()
      .favorites.find((f) => f.id === id)!
      .members.map(([b]) => b);
  }
}

function garden(seed = 104729): World {
  return realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: `fav-${seed}`, seed });
}

/** Living birth ids of a species, ascending. */
function livingOf(w: World, speciesId: string): number[] {
  const c = w.ents.cols;
  const sp = w.species.findIndex((s) => s.id === speciesId);
  const out: number[] = [];
  for (let i = 0; i < w.ents.highWater; i++)
    if (c.alive[i] === 1 && c.species[i] === sp) out.push(c.birthId[i]!);
  return out.sort((a, b) => a - b);
}

function slotOf(w: World, birthId: number): number {
  const c = w.ents.cols;
  for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && c.birthId[i] === birthId) return i;
  return -1;
}

describe('favorites: limits and names', () => {
  it('follows at most three families; a fourth Follow is refused with its copy and changes nothing', () => {
    const d = new Dishlet(garden());
    const sprinters = livingOf(d.world, 'B01');
    for (let k = 0; k < 3; k++)
      expect(
        d.op({ kind: 'follow', birthId: sprinters[k]!, nickname: null, pattern: 'circle' }).refused,
      ).toBeNull();
    const before = JSON.stringify(d.record);
    const r = d.op({ kind: 'follow', birthId: sprinters[3]!, nickname: 'Fourth', pattern: 'square' });
    expect(r.refused).toBe('You are following three families. Unpin one to follow another.');
    expect(FAVORITE_TEXT.full).toBe(r.refused);
    expect(JSON.stringify(d.record)).toBe(before);
    expect(d.record.favorites.filter((f) => f.active)).toHaveLength(3);
    // Unpinning one makes room; ids are never reused.
    expect(d.op({ kind: 'unpin', id: 'fav-2' }).refused).toBeNull();
    expect(
      d.op({ kind: 'follow', birthId: sprinters[3]!, nickname: 'Fourth', pattern: 'square' }).refused,
    ).toBeNull();
    expect(d.record.favorites.map((f) => f.id)).toEqual(['fav-1', 'fav-2', 'fav-3', 'fav-4']);
    expect(d.record.nextFavorite).toBe(5);
    // Following a family already followed is refused.
    d.op({ kind: 'unpin', id: 'fav-4' });
    expect(d.op({ kind: 'follow', birthId: sprinters[0]!, nickname: null, pattern: 'circle' }).refused).toBe(
      FAVORITE_REFUSALS.already,
    );
  });

  it('cleans nicknames like a dish name (≤ 60 characters, no control characters); empty is the default name', () => {
    expect(cleanNickname('  Mango ')).toBe('Mango');
    expect(cleanNickname('Man\u0007go\n')).toBe('Man go');
    expect(cleanNickname('   ')).toBeNull();
    expect(cleanNickname('')).toBeNull();
    const long = 'x'.repeat(61);
    expect(cleanNickname(long)).toBe('x'.repeat(60));
    expect(Array.from(cleanNickname('🦠'.repeat(70))!)).toHaveLength(60);
    const d = new Dishlet(garden());
    const b = livingOf(d.world, 'B01')[0]!;
    d.op({ kind: 'follow', birthId: b, nickname: long, pattern: 'triangle' });
    expect(d.record.favorites[0]!.nickname).toBe('x'.repeat(60));
    d.op({ kind: 'rename', id: 'fav-1', nickname: '  ' });
    expect(d.record.favorites[0]!.nickname).toBeNull();
    // The default caption uses the ancestor and its id (D08 "Names and sharing").
    const f = d.record.favorites[0]!;
    expect(favoriteDisplayName(f, 'Sprinter')).toBe(`Sprinter #${f.rootBirthId}`);
    expect(favoriteDisplayName({ ...f, nickname: 'Mango' }, 'Sprinter')).toBe('Mango');
    expect(findLabel('Mango', 3)).toBe('Find the Mango family: 3 members');
    expect(followNextText('Sprinter', 61, 455)).toBe('Follow next: Sprinter #61, born 0:45');
  });
});

describe('favorites: membership tracker', () => {
  it('follows divisions and deaths: every tick the members are exactly the root’s living descendants', () => {
    const d = new Dishlet(garden());
    const roots = livingOf(d.world, 'B01').slice(0, 3);
    for (const b of roots) d.op({ kind: 'follow', birthId: b, nickname: null, pattern: 'circle' });
    let births = 0;
    let deaths = 0;
    for (let t = 0; t < 2500; t++) {
      d.tick();
      for (const e of d.world.events.ring) {
        if (e.tick !== d.world.tick - 1) continue;
        if (e.type === 'birth') births++;
        else if (e.type === 'death') deaths++;
      }
      if (t % 50 !== 49) continue;
      for (const f of d.record.favorites) {
        if (!f.active) continue;
        expect(d.members(f.id)).toEqual(livingDescendants(d.world, f.rootBirthId).map(([b]) => b));
      }
    }
    expect(births).toBeGreaterThan(20);
    expect(deaths).toBeGreaterThan(0); // members leave too (deaths over the run)
    // At least one followed family grew by division.
    expect(Math.max(...d.record.favorites.map((f) => (f.active ? f.members.length : 0)))).toBeGreaterThan(1);
  });

  it('a Sample take lifts members out with no death event: held, they stay members; Cancel puts them back; Discard ends the family', () => {
    const d = new Dishlet(garden());
    const b = livingOf(d.world, 'B06')[0]!;
    d.op({ kind: 'follow', birthId: b, nickname: 'Taken', pattern: 'square' });
    expect(d.members('fav-1')).toEqual([b]);
    const c = d.world.ents.cols;
    const take = (): void => {
      const slot = slotOf(d.world, b);
      const eventsBefore = d.world.counters.nextEventId;
      const cmd = applyNow(d.world, `take-${d.world.commands.nextSeq}`, {
        kind: 'sampleTake',
        x: c.x[slot]!,
        y: c.y[slot]!,
        radius: 1,
        mode: 'all',
      });
      expect(cmd.result!.accepted).toBeGreaterThan(0);
      expect(slotOf(d.world, b)).toBe(-1); // out of the dish's living table…
      expect(d.world.events.ring.filter((e) => e.id >= eventsBefore && e.type === 'death')).toHaveLength(0); // …with no death event
      d.afterCommand();
    };
    take();
    // Held, not dead: still a member, not in the dish, and the family goes on.
    expect(d.members('fav-1')).toEqual([b]);
    expect(d.record.favorites[0]!.active).toBe(true);
    const marks = d.watch.favorites.marks(d.world)!;
    expect(marks.slots[0]).toMatchObject({
      members: 1,
      representativeEntity: null,
      representativeHeld: true,
      next: null,
    });
    expect(d.changes).toEqual([]);
    // Cancel: back in its slot with the same birth id; the family is as it was.
    cancelSample(d.world);
    d.afterCommand();
    expect(slotOf(d.world, b)).toBeGreaterThanOrEqual(0);
    expect(d.watch.favorites.marks(d.world)!.slots[0]).toMatchObject({
      members: 1,
      representativeHeld: false,
    });
    expect(d.watch.favorites.marks(d.world)!.slots[0]!.representativeEntity).not.toBeNull();
    // Take again and Discard: recorded as removed (REMOVED_SAMPLED); the family has no member left.
    take();
    applyNow(d.world, 'discard', { kind: 'sampleDiscard' });
    d.afterCommand();
    const f = d.record.favorites[0]!;
    expect(f.active).toBe(false);
    expect(f.extinct).toEqual({
      tick: d.world.tick,
      lastBirthId: b,
      cause: R.REMOVED_SAMPLED,
      cell: f.extinct!.cell,
    });
    expect(f.extinct!.cell).toBeGreaterThanOrEqual(0);
    expect(d.changes).toEqual([{ kind: 'favoriteExtinct', id: 'fav-1' }]);
  });

  it('a rewind and a reload rebuild the members from the saved record', async () => {
    const d = new Dishlet(garden());
    const roots = livingOf(d.world, 'B01').slice(0, 2);
    for (const b of roots) d.op({ kind: 'follow', birthId: b, nickname: 'Kept', pattern: 'circle' });
    d.tick(600);
    const earlier = serializeWorld(d.world);
    d.tick(900);
    // Rewind (as Undo replaces the world): the members are the root's descendants alive at that moment.
    d.replaceWorld(deserializeWorld(earlier));
    for (const f of d.record.favorites)
      expect(d.members(f.id)).toEqual(livingDescendants(d.world, f.rootBirthId).map(([b]) => b));
    d.tick(400);
    const want = d.watch.materialize();
    // Reload: the file's notebook rebuilds exactly the same members.
    const built = await buildSaveFile(
      d.world,
      { name: 'Fav', savedAt: '2026-10-10T00:00:00Z', recipeId: 'FIRST_DISH_V1' },
      { notebook: want, includeNicknames: true },
    );
    const loaded = await loadSaveFile(built.text);
    expect(loaded.notebookDropped).toBeNull();
    const e = new Dishlet(loaded.world);
    e.record = loaded.notebook;
    e.watch.rebind(loaded.world);
    expect(e.watch.materialize().favorites).toEqual(want.favorites);
    // And both go on identically.
    d.tick(200);
    e.tick(200);
    expect(e.watch.materialize().favorites).toEqual(d.watch.materialize().favorites);
  });
});

describe('favorites: Follow next', () => {
  it('offers the representative’s descendants by birth tick, then id; never the healthiest, biggest or best fed', () => {
    const d = new Dishlet(garden());
    // A Sprinter founder whose line divides at least twice within the run.
    const sprinters = livingOf(d.world, 'B01').slice(0, 3);
    for (const b of sprinters) d.op({ kind: 'follow', birthId: b, nickname: null, pattern: 'circle' });
    // Run until a founder (the representative) has divided and its living descendants were born at different ticks.
    let found: { id: string; cands: number[] } | null = null;
    for (let t = 0; t < 4000 && !found; t++) {
      d.tick();
      if (t % 10 !== 0) continue;
      for (const f of d.record.favorites) {
        if (!f.active) continue;
        const cands = d.watch.favorites.candidates(f.id);
        const ticks = new Set(cands.map((b) => recordField(d.world.lineage, 'birthTick', b)!));
        if (ticks.size >= 2) found = { id: f.id, cands };
      }
    }
    expect(found).not.toBeNull();
    if (!found) return;
    // The change the host announces carried the same order when the representative left.
    expect(d.changes.some((ch) => ch.kind === 'favoriteRepresentativeGone' && ch.id === found.id)).toBe(true);
    const order = found.cands.map((b) => [recordField(d.world.lineage, 'birthTick', b)!, b] as const);
    const sorted = [...order].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    expect(order).toEqual(sorted);
    expect(new Set(order.map((o) => o[0])).size).toBeGreaterThanOrEqual(2);
    // Give the youngest candidate the most energy, body and health: the order does not move.
    const youngest = found.cands[found.cands.length - 1]!;
    const s = slotOf(d.world, youngest);
    const c = d.world.ents.cols;
    c.E[s] = 1e6;
    c.B[s] = c.B[s]! * 3;
    c.H[s] = 100;
    for (const b of found.cands.slice(0, -1)) {
      const k = slotOf(d.world, b);
      if (k >= 0) {
        c.E[k] = 0.01;
        c.H[k] = 1;
      }
    }
    const again = d.watch.favorites.candidates(found.id);
    expect(again).toEqual(found.cands.filter((b) => slotOf(d.world, b) >= 0));
    expect(again[0]).toBe(sorted[0]![1]);
    expect(again[0]).not.toBe(youngest);
  });
});

describe('favorites: extinction', () => {
  it('records the last member, its recorded reason and cell, frees the slot and words it exactly (UX §5.8)', () => {
    const d = new Dishlet(garden());
    const b = livingOf(d.world, 'B04')[0]!;
    d.op({ kind: 'follow', birthId: b, nickname: 'Mango', pattern: 'triangle' });
    d.tick(5);
    // Starve every member: maintenance records each death with its reason code.
    const c = d.world.ents.cols;
    let lastSeen = -1;
    for (let t = 0; t < 600 && !d.record.favorites[0]!.extinct; t++) {
      for (const m of d.members('fav-1')) {
        const s = slotOf(d.world, m);
        if (s >= 0) {
          c.E[s] = 0;
          lastSeen = m;
        }
      }
      d.tick();
    }
    const f = d.record.favorites[0]!;
    expect(f.extinct).not.toBeNull();
    expect(f.active).toBe(false);
    expect(f.members).toEqual([]);
    const x = f.extinct!;
    expect(x.lastBirthId).toBe(lastSeen);
    expect(x.cause).toBe(recordField(d.world.lineage, 'deathCause', x.lastBirthId));
    expect(x.cause).toBe(R.DEATH_STARVATION);
    expect(x.cell).toBeGreaterThanOrEqual(0);
    expect(d.changes.filter((ch) => ch.kind === 'favoriteExtinct')).toEqual([
      { kind: 'favoriteExtinct', id: 'fav-1' },
    ]);
    expect(extinctTitle('Mango')).toBe('No members of the Mango family remain.');
    expect(extinctLastText('Crumbsmith', x.lastBirthId, x.tick, x.cause)).toBe(
      `The last member, Crumbsmith #${x.lastBirthId}, was recorded at 0:${String(Math.floor(x.tick / 10)).padStart(2, '0')}: it ran out of energy.`,
    );
    // The record stays in the notebook and cannot be pinned again.
    expect(d.op({ kind: 'pin', id: 'fav-1' }).refused).toBe(FAVORITE_REFUSALS.extinct);
  });
});

describe('favorites: highlight cap and aggregate (CT §12.10)', () => {
  it('highlights the first 200 members by birth tick then id, and aggregates all of them beyond', () => {
    const w = clearWater();
    const N = 250;
    const slots: number[] = [];
    for (let k = 0; k < N; k++)
      slots.push(place(w, 'B06', 20 + (k % 25) * 3.5, 20 + Math.floor(k / 25) * 8.5));
    const c = w.ents.cols;
    const root = c.birthId[slots[0]!]!;
    // One family: every other organism's recorded parent is the first (test-made lineage records).
    const L = w.lineage;
    for (const s of slots.slice(1)) L.parent[c.birthId[s]! - L.base] = root;
    const d = new Dishlet(w);
    expect(d.op({ kind: 'follow', birthId: root, nickname: null, pattern: 'square' }).refused).toBeNull();
    expect(d.members('fav-1')).toHaveLength(N);
    const marks = d.watch.favorites.marks(w)!;
    const slot = marks.slots[0]!;
    expect(slot.members).toBe(N);
    expect(slot.highlighted).toBe(FAVORITE_HIGHLIGHT_MAX);
    let hi = 0;
    let rep = 0;
    for (let k = 0; k < w.ents.count; k++) {
      if (marks.marks[k]! & 1) hi++;
      if (marks.marks[k]! & 8) rep++;
    }
    expect(hi).toBe(FAVORITE_HIGHLIGHT_MAX);
    expect(rep).toBe(1);
    // Fix round 1: membership bits cover every member, highlighted or not (the inspector reads them).
    let mem = 0;
    for (let k = 0; k < w.ents.count; k++) if (marks.member[k]! & 1) mem++;
    expect(mem).toBe(N);
    // The highlighted ones are the first 200 by birth tick (all 0 here), then birth id.
    const ids = slots.map((s) => c.birthId[s]!).sort((a, b) => a - b);
    const marked: number[] = [];
    let k = 0;
    for (let i = 0; i < w.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      if (marks.marks[k++]! & 1) marked.push(c.birthId[i]!);
    }
    expect(marked.sort((a, b) => a - b)).toEqual(ids.slice(0, FAVORITE_HIGHLIGHT_MAX));
    // The aggregate: all members' count and mean position.
    const mx = slots.reduce((a, s) => a + c.x[s]!, 0) / N;
    const my = slots.reduce((a, s) => a + c.y[s]!, 0) / N;
    expect(slot.aggregate!.count).toBe(N);
    expect(slot.aggregate!.x).toBeCloseTo(mx, 9);
    expect(slot.aggregate!.y).toBeCloseTo(my, 9);
    // At 200 or fewer there is no aggregate.
    const small = new Dishlet(w);
    for (const s of slots.slice(FAVORITE_HIGHLIGHT_MAX)) L.parent[c.birthId[s]! - L.base] = 0;
    small.op({ kind: 'follow', birthId: root, nickname: null, pattern: 'circle' });
    expect(small.watch.favorites.marks(w)!.slots[0]!.aggregate).toBeNull();
    expect(small.watch.favorites.marks(w)!.slots[0]!.members).toBe(FAVORITE_HIGHLIGHT_MAX);
  });
});

describe('fix round 1: the UI side of favorites', () => {
  const W = 'ui-world';
  const fake = {
    onNotebook: () => () => undefined,
    onSnapshot: () => () => undefined,
  } as unknown as SimClient;
  const record = (favorites: FavoriteRecord[]): NotebookRecord => ({
    ...emptyNotebook(W),
    favorites,
    nextFavorite: favorites.length + 1,
  });
  const favRec = (extra: Partial<FavoriteRecord> = {}): FavoriteRecord => ({
    id: 'fav-1',
    rootBirthId: 5,
    speciesId: 'B01',
    nickname: 'Mango',
    pattern: 'triangle',
    representative: 5,
    active: true,
    createdTick: 0,
    members: [[5, 0]],
    historyIncomplete: false,
    extinct: null,
    ...extra,
  });
  const snapshot = (
    ids: number[],
    marks: number[],
    member: number[],
    repEntity: number | null,
  ): SnapshotMsg =>
    ({
      type: 'snapshot',
      dishId: 'x',
      count: ids.length,
      ids: new Int32Array(ids.flatMap((b, k) => [b, 100 + k])),
      favorites: {
        marks: new Uint8Array(marks),
        member: new Uint8Array(member),
        slots: [
          {
            id: 'fav-1',
            pattern: 'triangle',
            members: ids.length,
            highlighted: 1,
            aggregate: null,
            representativeEntity: repEntity,
            representativeHeld: false,
            next: null,
            candidates: [],
            depth: 0,
          },
        ],
      },
    }) as unknown as SnapshotMsg;

  it('a dropped notebook’s message waits for its dish to open, then survives the “Opened …” toast', () => {
    wireFavorites(fake);
    const M =
      "This dish's notebook (favorites, story cards, goals, bookmarks, gallery, challenges and its Try my dish turn) could not be read, so it was left out. The dish itself loaded.";
    // The 'loaded' answer arrives before the UI opens the dish (state.ts enterDish runs after the load resolves).
    onNotebookNotice({ type: 'notebookDropped', dishId: 'x', message: M });
    expect(uiState.toast.value).toBeNull();
    uiState.dishInfo.value = { dishId: 'x' } as unknown as DishInfo;
    expect(uiState.toast.value).toBe(M);
    expect(notebookDroppedFor.value).toEqual({ dishId: 'x', message: M });
    // The open toast posted right after does not replace it: it carries it.
    uiState.showToast('Opened “Garden” — paused where you left it.');
    expect(uiState.toast.value).toBe(`Opened “Garden” — paused where you left it. ${M}`);
  });

  it('“Follow this family” knows members beyond the 200 highlighted (membership bits), not only the stale record', () => {
    notebook.value = record([favRec({ members: [[5, 0]] })]);
    // Organism 900 was born after the record was read and is not highlighted (bit 0 of marks clear).
    onFavoriteSnapshot(snapshot([5, 900, 901], [9, 0, 0], [1, 1, 0], 100));
    expect(favoriteOf(900)?.id).toBe('fav-1');
    expect(favoriteOf(901)).toBeNull();
  });

  it('Find after Follow next runs on the snapshot sent after the change, not on the reply', () => {
    ui.select.mockClear();
    notebook.value = record([favRec({ representative: 7 })]);
    onFavoriteSnapshot(snapshot([5], [1], [1], null));
    findFavoriteAfterChange('fav-1');
    expect(ui.select).not.toHaveBeenCalled();
    onFavoriteSnapshot(snapshot([5, 7], [1, 9], [1, 1], 101));
    expect(ui.select).toHaveBeenCalledWith({ kind: 'entity', birthId: 7 });
    // Once only.
    onFavoriteSnapshot(snapshot([5, 7], [1, 9], [1, 1], 101));
    expect(ui.select).toHaveBeenCalledTimes(1);
  });

  it('after Undo (favoritesRestored) the extinction card of a family that is back closes, and removed families are named', () => {
    queueExtinctCard('fav-1');
    expect(extinctCard.value).toBe('fav-1');
    onNotebookNotice({
      type: 'notebookChanged',
      dishId: 'x',
      record: record([favRec()]),
      change: { kind: 'favoritesRestored', removed: ['New'] },
    });
    expect(extinctCard.value).toBeNull();
    expect(notebook.value!.favorites[0]!.extinct).toBeNull();
    expect(uiState.toast.value).toContain(restoredRemovedText(['New']));
    expect(restoredRemovedText(['New'])).toBe(
      'The “New” family is no longer followed: its first organisms are not in the dish at this time.',
    );
  });
});
