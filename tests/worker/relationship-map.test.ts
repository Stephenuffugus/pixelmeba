/**
 * P4.8 relationship map (src/worker/relationshipMap.ts, fed by src/worker/relationships.ts).
 *
 * Every edge comes from a recorded event or record, and every amount is checked against an independent
 * measure taken by the test itself (event totals, the event ring read every tick, entity columns, pool
 * totals across stage 6, the intake record's bits, conversion totals). No edge appears without a
 * record. The windows cut at whole dish seconds; Undo drops what is later than the restored tick; and
 * the ledger is observation only (stateHash and the full trajectory digest equal with and without it).
 */
import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from '../../src/sim/constants';
import { cellIndex } from '../../src/sim/grid';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, stateHash, type WorldState } from '../../src/sim/serialize';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { tookFromPool } from '../../src/sim/intake';
import { poolTotal } from '../../src/sim/pairedRun';
import { markField } from '../../src/sim/transport';
import { R } from '../../src/sim/reasons';
import { RelationshipWatcher } from '../../src/worker/relationships';
import { RelationshipLedger, type MapEdge, type RelationshipMapData } from '../../src/worker/relationshipMap';
import { FakeClockHost } from '../helpers/host';
import { trajectoryDigest } from '../helpers/trajectory';
import { clearWater, place, registry, setField } from '../helpers/world';

const sec = (tick: number) => Math.floor(tick / TICKS_PER_SECOND);

function watch(
  w: World,
  ticks: number,
  after?: (w: World) => void,
  stage?: (stage: number, w: World) => void,
): RelationshipWatcher {
  const rw = new RelationshipWatcher(w);
  // P4.13 (D-0085): pool totals are measured once the map has been opened; these ledger tests read the
  // map from the first tick, so the watcher starts measuring at once (the P4.8 always-on behaviour).
  rw.armPools();
  for (let t = 0; t < ticks; t++) {
    step(w, {
      afterStage: (s, world) => {
        rw.hook(s, world);
        stage?.(s, world);
      },
    });
    rw.afterTick(w);
    after?.(w);
  }
  return rw;
}

function edge(map: RelationshipMapData, kind: string, actor: string, target: string): MapEdge {
  const e = map.edges.find((x) => x.kind === kind && x.actor === actor && x.target === target);
  expect(e, `${kind}:${actor}:${target}`).toBeDefined();
  return e!;
}

/** New events since the last call, read every tick (the 500-event ring never loses one this way). */
function eventReader(w: World) {
  let last = w.counters.nextEventId - 1;
  return () => {
    const fresh = w.events.ring.filter((e) => e.id > last);
    last = w.counters.nextEventId - 1;
    return fresh;
  };
}

describe('relationship map ledger (P4.8)', () => {
  it('catches: the count of capture events and their carbon, predator → prey; nothing else is an edge', () => {
    const w = clearWater();
    place(w, 'B01', 50.5, 60.5);
    place(w, 'B01', 50.7, 60.5);
    place(w, 'B01', 51.5, 60.5);
    place(w, 'P01', 50.6, 60.5, { E: 50 });
    const read = eventReader(w);
    let n = 0;
    let carbon = 0;
    const rw = watch(w, 600, () => {
      for (const e of read())
        if (e.type === 'capture') {
          n++;
          carbon += e.amount ?? 0;
        }
    });
    expect(n).toBeGreaterThan(0);
    const map = rw.ledger.read(w.tick, 600);
    const e = edge(map, 'catches', 'P01', 'B01');
    expect(e.count).toBe(n);
    expect(e.carbon).toBeCloseTo(carbon, 12);
    expect(e.carbon).toBeGreaterThan(0);
    // Only recorded kinds: catches, and eats by those who were seen eating.
    for (const x of map.edges) expect(['catches', 'eats']).toContain(x.kind);
  });

  it('infects and bursts: new infections counted from the entity columns, bursts from lysis deaths', () => {
    const w = clearWater({ backgroundOverrides: { sugar: 0.2, nutrient: 0.2 } });
    for (let k = 0; k < 6; k++) place(w, 'B01', 40.5 + k, 60.5);
    for (let dx = -3; dx <= 9; dx++)
      for (let dy = -3; dy <= 3; dy++) setField(w, 'v01', cellIndex(40 + dx, 60 + dy), 20);
    markField(w, 'v01');
    // Independent: per slot, an infection is new when infectedBy turns non-zero (or the slot holds a new birth).
    let prevBirth = new Uint32Array(0);
    let prevInf = new Uint8Array(0);
    let infections = 0;
    let lyses = 0;
    const read = eventReader(w);
    const rw = watch(w, 1200, (world) => {
      const c = world.ents.cols;
      const n = world.ents.highWater;
      if (prevBirth.length < n) {
        const b = new Uint32Array(n);
        b.set(prevBirth);
        prevBirth = b;
        const i8 = new Uint8Array(n);
        i8.set(prevInf);
        prevInf = i8;
      }
      for (let i = 0; i < n; i++) {
        if (c.alive[i] !== 1) {
          prevBirth[i] = 0;
          prevInf[i] = 0;
          continue;
        }
        const inf = c.infectedBy[i]!;
        if (inf !== 0 && !(prevBirth[i] === c.birthId[i] && prevInf[i] === inf)) infections++;
        prevBirth[i] = c.birthId[i]!;
        prevInf[i] = inf;
      }
      for (const e of read()) if (e.type === 'death' && e.cause === R.DEATH_LYSIS) lyses++;
    });
    expect(infections).toBeGreaterThan(0);
    expect(lyses).toBeGreaterThan(0);
    const map = rw.ledger.read(w.tick, 600);
    expect(edge(map, 'infects', 'V01', 'B01').count).toBe(infections);
    expect(edge(map, 'bursts', 'V01', 'B01').count).toBe(lyses);
  });

  it('converts: carbon credited only through a producer (D-0051); enzyme alone on starch makes no edge', () => {
    const reg = registry();
    const w = realizeRecipe(reg, 'STARCH_UNLOCK_V1', { worldId: 'map-starch' });
    const start = w.conversionTotals.starch;
    const rw = watch(w, 1200);
    const map = rw.ledger.read(w.tick, 600);
    const e = edge(map, 'converts', 'B06', 'starch');
    expect(e.carbon).toBeGreaterThan(0);
    // Never more than the dish converted in the run (the last open second is not yet credited).
    expect(e.carbon).toBeLessThanOrEqual(w.conversionTotals.starch - start + 1e-12);
    expect(map.edges.filter((x) => x.kind === 'converts').map((x) => x.actor)).toEqual(['B06']);

    const w2 = clearWater({ backgroundOverrides: { sugar: 0, starch: 0.3 } });
    for (let dx = -2; dx <= 2; dx++) setField(w2, 'eStarch', cellIndex(60 + dx, 60), 1);
    const rw2 = watch(w2, 50);
    expect(w2.conversionTotals.starch).toBeGreaterThan(0);
    expect(rw2.ledger.read(w2.tick, 60).edges).toEqual([]);
  });

  it('two species feeding from one pool: each edge counts the seconds it was seen; the pool carries the carbon feeding removed, never split', () => {
    const w = clearWater({ backgroundOverrides: { sugar: 0.3, nutrient: 0.2 } });
    place(w, 'B01', 50.5, 60.5);
    place(w, 'B06', 70.5, 60.5);
    const seen: Record<string, Set<number>> = { B01: new Set(), B06: new Set() };
    let pre = 0;
    let removed = 0;
    const rw = watch(w, 400, undefined, (s, world) => {
      if (s === 5) pre = poolTotal(world, 'sugar');
      if (s === 6) {
        removed += pre - poolTotal(world, 'sugar');
        for (const id of ['B01', 'B06']) {
          const idx = world.species.findIndex((x) => x.id === id);
          if (tookFromPool(world, idx, 'sugar')) seen[id]!.add(sec(world.tick));
        }
      }
    });
    expect(seen.B01!.size).toBeGreaterThan(0);
    expect(seen.B06!.size).toBeGreaterThan(0);
    const map = rw.ledger.read(w.tick, 60);
    expect(edge(map, 'eats', 'B01', 'sugar').seconds).toBe(seen.B01!.size);
    expect(edge(map, 'eats', 'B06', 'sugar').seconds).toBe(seen.B06!.size);
    const pool = map.pools.find((p) => p.pool === 'sugar')!;
    expect(pool.net).toBe(true);
    expect(pool.removed).toBeCloseTo(removed, 9);
    // No edge without a record: exactly these two, and no pool nobody ate from.
    expect(map.edges.map((e) => `${e.kind}:${e.actor}:${e.target}`)).toEqual([
      'eats:B01:sugar',
      'eats:B06:sugar',
    ]);
    expect(map.pools.map((p) => p.pool)).toEqual(['sugar']);
  });

  it('windows 60/180/600 cut at whole dish seconds; older than 600 s is not kept', () => {
    const l = new RelationshipLedger(0);
    // One catch in every second 0…699, carbon = the second number.
    for (let s = 0; s < 700; s++) l.add(s, 'catches', 'P01', 'B01', 1, s);
    const tick = 700 * TICKS_PER_SECOND; // the last tick run was 6999 (second 699)
    for (const w of [60, 180, 600] as const) {
      const m = l.read(tick, w);
      expect([m.fromSecond, m.toSecond]).toEqual([700 - w, 699]);
      const e = m.edges[0]!;
      expect(e.count).toBe(w);
      let c = 0;
      for (let s = 700 - w; s < 700; s++) c += s;
      expect(e.carbon).toBe(c);
      expect(m.recordedSinceSecond).toBeNull();
    }
    // Mid-second: the open second counts as the last one.
    const mid = l.read(tick - 5, 60);
    expect([mid.fromSecond, mid.toSecond]).toEqual([640, 699]);
    // A young dish: the window starts at second 0 and is not "recorded since".
    const young = new RelationshipLedger(0);
    young.add(3, 'infects', 'V01', 'B01', 2, 0);
    const y = young.read(50, 600);
    expect([y.fromSecond, y.toSecond, y.recordedSinceSecond]).toEqual([0, 4, null]);
    expect(y.edges[0]!.count).toBe(2);
    // A record started later than the window: "recorded since".
    const late = new RelationshipLedger(1234);
    expect(late.read(2000, 180).recordedSinceSecond).toBe(123);
  });

  it('Undo drops the seconds later than the restored tick (a whole-second restore keeps the earlier ones; a part second restarts the record)', () => {
    const h = new FakeClockHost();
    h.create('map-undo', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    h.setSpeed(4);
    h.advanceTo(300);
    const map = (w: 60 | 180 | 600) => {
      const id = 70000 + h.out.length;
      h.host.handle({ type: 'relationshipMap', requestId: id, dishId: 'map-undo', windowSeconds: w });
      const r = h.out.find((m) => m.type === 'relationshipMap' && m.requestId === id);
      if (r?.type !== 'relationshipMap') throw new Error('no map');
      return r.map;
    };
    const at300 = map(600);
    const sprinter = edge(at300, 'eats', 'B01', 'sugar');
    expect(sprinter.seconds).toBeGreaterThan(0);
    h.setSpeed(0);
    expect(
      h.command('sugar-1', { kind: 'deposit', materialId: 'SUGAR', points: [[60, 60]], radius: 3, dose: 0.1 })
        ?.accepted,
    ).toBeGreaterThan(0);
    h.setSpeed(4);
    h.advanceTo(600);
    expect(edge(map(600), 'eats', 'B01', 'sugar').seconds).toBeGreaterThan(sprinter.seconds);
    h.setSpeed(0);
    h.host.handle({ type: 'undo', requestId: 79999, dishId: 'map-undo' });
    expect(h.tick).toBe(300);
    const after = map(600);
    expect(after.toSecond).toBe(29);
    expect(after.edges).toEqual(at300.edges);
    expect(after.pools).toEqual(at300.pools);
    expect(after.recordedSinceSecond).toBeNull();

    // A command at a part second (tick 305): Undo restarts the record there.
    h.setSpeed(4);
    h.advanceTo(305);
    h.setSpeed(0);
    expect(
      h.command('sugar-2', { kind: 'deposit', materialId: 'SUGAR', points: [[60, 60]], radius: 3, dose: 0.1 })
        ?.accepted,
    ).toBeGreaterThan(0);
    h.setSpeed(4);
    h.advanceTo(400);
    h.setSpeed(0);
    h.host.handle({ type: 'undo', requestId: 79998, dishId: 'map-undo' });
    expect(h.tick).toBe(305);
    const restarted = map(60);
    expect(restarted.edges).toEqual([]);
    expect(restarted.recordedSinceSecond).toBe(30);
  });

  it('observation only: a host dish played 3,000 ticks at 4× with the map read hashes exactly as the same state stepped plainly', () => {
    const h = new FakeClockHost();
    h.create('map-hash', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    const plain = deserializeWorld(JSON.parse(h.save()) as WorldState);
    h.setSpeed(4);
    let reads = 0;
    for (let t = 500; t <= 3000; t += 500) {
      h.advanceTo(t);
      for (const w of [60, 180, 600] as const) {
        h.host.handle({
          type: 'relationshipMap',
          requestId: 80000 + reads++,
          dishId: 'map-hash',
          windowSeconds: w,
        });
      }
    }
    const last = h.out.filter((m) => m.type === 'relationshipMap').at(-1);
    if (last?.type !== 'relationshipMap') throw new Error('no map');
    expect(last.map.edges.length).toBeGreaterThan(0);
    for (let t = 0; t < 3000; t++) step(plain);
    expect(h.world.tick).toBe(plain.tick);
    expect(stateHash(h.world)).toBe(stateHash(plain));
    expect(trajectoryDigest(h.world, 'full')).toBe(trajectoryDigest(plain, 'full'));
    expect(h.save()).not.toMatch(/recordedSinceSecond|windowSeconds/);
  }, 180_000);
});
