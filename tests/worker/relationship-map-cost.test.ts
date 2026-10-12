/**
 * P4.13 (D-0085's cost): the relationship map's pool totals (a sum over every dish cell before and after
 * stage 6) run only once the map has been opened for the dish in this session. Before that, no pool sum
 * runs at all; after it, every window's event-based edges are exactly the always-on ledger's, and each
 * pool's total is exactly the always-on ledger's total over the seconds since the first opening, which
 * the map names ("Recorded since m:ss").
 *
 * How this was checked to fail without the mechanism: with the `poolsArmed` guard removed from the
 * watcher's stage-5 hook, the first test counts pool sums before the map is opened (calls > 0).
 */
import { describe, expect, it, vi } from 'vitest';
import { TICKS_PER_SECOND } from '../../src/sim/constants';
import { realizeRecipe } from '../../src/sim/recipes';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { RelationshipWatcher } from '../../src/worker/relationships';
import { RelationshipLedger, type RelationshipMapData, type SecondRecord } from '../../src/worker/relationshipMap';
import { FakeClockHost } from '../helpers/host';
import type * as PairedRun from '../../src/sim/pairedRun';
import { registry } from '../helpers/world';

const calls = vi.hoisted(() => ({ n: 0 }));
vi.mock('../../src/sim/pairedRun', async (orig) => {
  const m = await orig<typeof PairedRun>();
  return {
    ...m,
    poolTotal: (w: World, id: Parameters<typeof m.poolTotal>[1]) => {
      calls.n++;
      return m.poolTotal(w, id);
    },
  };
});

function garden(): World {
  const reg = registry();
  return realizeRecipe(reg, reg.recipes.FIRST_DISH_V1!);
}

function poolRecordOf(rw: RelationshipWatcher): SecondRecord<Map<string, number>> {
  const r = (rw.ledger as unknown as { poolRecord: SecondRecord<Map<string, number>> | null }).poolRecord;
  if (r === null) throw new Error('pools not armed');
  return r;
}

describe('relationship map cost (P4.13, D-0085)', () => {
  it('no pool sum runs on a played dish until its map is first opened; from then on they run every tick', () => {
    const h = new FakeClockHost();
    h.create('cost', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    h.setSpeed(4);
    // The watcher's pool sums are its stage-5 snapshot and the stage-6 difference (beforeIntake arms the
    // difference). Other readers may call poolTotal now and then (an experiment timeline sample), so the
    // count that matters is the watcher's own.
    const pre6 = vi.spyOn(RelationshipWatcher.prototype as unknown as { beforeIntake: (w: World) => void }, 'beforeIntake');
    h.advanceTo(600);
    expect(pre6).toHaveBeenCalledTimes(0);
    calls.n = 0;
    const id = 91000;
    h.host.handle({ type: 'relationshipMap', requestId: id, dishId: 'cost', windowSeconds: 60 });
    const first = h.out.find((m) => m.type === 'relationshipMap' && m.requestId === id);
    if (first?.type !== 'relationshipMap') throw new Error('no map');
    // Opened at tick 600: the event-based edges cover the whole minute already.
    expect(first.map.recordedSinceSecond).toBeNull();
    expect(first.map.edges.find((e) => e.kind === 'eats' && e.actor === 'B01')?.seconds).toBeGreaterThan(30);
    h.advanceTo(700);
    // Every tick since: the food pools' totals before and after stage 6.
    expect(pre6).toHaveBeenCalledTimes(100);
    expect(calls.n).toBeGreaterThanOrEqual(2 * 100);
    pre6.mockRestore();
    h.host.handle({ type: 'relationshipMap', requestId: id + 1, dishId: 'cost', windowSeconds: 60 });
    const later = h.out.find((m) => m.type === 'relationshipMap' && m.requestId === id + 1);
    if (later?.type !== 'relationshipMap') throw new Error('no map');
    expect(later.map.recordedSinceSecond).toBeNull();
    expect(later.map.poolsRecordedSinceSecond).toBe(60); // "Recorded since 1:00" for the pools
    const sugar = later.map.pools.find((p) => p.pool === 'sugar');
    expect(sugar && sugar.removed).toBeGreaterThan(0);
  }, 120_000);

  it('a map opened before the dish is first played measures pools from the first tick (no "Recorded since")', () => {
    const h = new FakeClockHost();
    h.create('cost2', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    h.host.handle({ type: 'relationshipMap', requestId: 92000, dishId: 'cost2', windowSeconds: 60 });
    h.setSpeed(4);
    h.advanceTo(300);
    h.host.handle({ type: 'relationshipMap', requestId: 92001, dishId: 'cost2', windowSeconds: 60 });
    const m = h.out.find((x) => x.type === 'relationshipMap' && x.requestId === 92001);
    if (m?.type !== 'relationshipMap') throw new Error('no map');
    expect(m.map.poolsRecordedSinceSecond).toBeNull();
    expect(m.map.pools.find((p) => p.pool === 'sugar')!.removed).toBeGreaterThan(0);
  }, 120_000);

  it('after the first open, each window equals the always-on ledger over the same seconds', () => {
    const w = garden();
    const always = new RelationshipWatcher(w);
    always.armPools(); // the P4.8 behaviour: pool totals from the first tick
    const lazy = new RelationshipWatcher(w);
    const OPEN = 1230; // the map is opened at 2:03
    const reads: {
      tick: number;
      lazy: RelationshipMapData;
      always: RelationshipMapData;
      /** The always-on ledger's per-pool sums over [first open, to], taken at the same moment. */
      sinceOpen: Record<string, number>;
    }[] = [];
    const rec = poolRecordOf(always);
    const openSecond = OPEN / TICKS_PER_SECOND;
    while (w.tick < 4200) {
      if (w.tick === OPEN) lazy.armPools();
      step(w, {
        afterStage: (s, world) => {
          always.hook(s, world);
          lazy.hook(s, world);
        },
      });
      always.afterTick(w);
      lazy.afterTick(w);
      if (w.tick === 1800 || w.tick === 3005 || w.tick === 4200)
        for (const win of [60, 180, 600] as const) {
          const l = lazy.ledger.read(w.tick, win);
          const sinceOpen: Record<string, number> = {};
          for (const p of l.pools) {
            let s = 0;
            for (const b of rec.range(openSecond, l.toSecond)) s += b.get(p.pool) ?? 0;
            sinceOpen[p.pool] = s;
          }
          reads.push({ tick: w.tick, lazy: l, always: always.ledger.read(w.tick, win), sinceOpen });
        }
    }
    let partial = 0;
    for (const r of reads) {
      // Event-based edges and their window: identical.
      expect(r.lazy.edges).toEqual(r.always.edges);
      expect([r.lazy.fromSecond, r.lazy.toSecond, r.lazy.recordedSinceSecond]).toEqual([
        r.always.fromSecond,
        r.always.toSecond,
        r.always.recordedSinceSecond,
      ]);
      expect(r.lazy.pools.map((p) => p.pool)).toEqual(r.always.pools.map((p) => p.pool));
      if (r.lazy.fromSecond >= openSecond) {
        // The window starts after the first open: the old ledger's numbers exactly.
        expect(r.lazy.poolsRecordedSinceSecond).toBeNull();
        expect(r.lazy.pools).toEqual(r.always.pools);
      } else {
        // The window reaches back before the first open: the old ledger summed over [open, to] only.
        partial++;
        expect(r.lazy.poolsRecordedSinceSecond).toBe(openSecond);
        for (const p of r.lazy.pools) expect(p.removed, `${r.tick} ${r.lazy.windowSeconds} ${p.pool}`).toBe(r.sinceOpen[p.pool]);
      }
    }
    expect(partial).toBeGreaterThan(0);
    expect(reads.some((r) => r.lazy.poolsRecordedSinceSecond === null)).toBe(true);
  }, 300_000);

  it('a first open mid-second names that second; later opens change nothing; Undo restarts the pools as it does the map', () => {
    const l = new RelationshipLedger(0);
    expect(l.poolsArmed).toBe(false);
    l.poolRemoved(3, 'sugar', 1); // not measured before the first open
    l.seen(3, 'B01', 'sugar');
    expect(l.read(50, 60).pools).toEqual([{ pool: 'sugar', removed: 0, net: true }]);
    l.armPools(1234);
    l.armPools(1500); // a second open keeps the first start
    l.poolRemoved(124, 'sugar', 2);
    l.seen(124, 'B01', 'sugar');
    const m = l.read(2000, 180);
    expect(m.recordedSinceSecond).toBeNull();
    expect(m.poolsRecordedSinceSecond).toBe(123);
    expect(m.pools).toEqual([{ pool: 'sugar', removed: 2, net: true }]);
    l.restoreTo(1100); // Undo to before the first open: the pools restart there, still measured
    expect(l.poolsArmed).toBe(true);
    expect(l.read(1500, 180).poolsRecordedSinceSecond).toBe(110);
  });
});
