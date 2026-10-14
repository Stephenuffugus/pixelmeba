/**
 * P4.8 region probes (src/worker/probes.ts; the host's 'probeSet' / 'probeRead').
 *
 * Mask cell lists follow the content geometry rule (integer cells as centres; a circle holds cells with
 * centre squared distance ≤ r²) clipped to the dish; readings equal direct sums over the world; the
 * boundary transfer is the change of the in-mask total across stage 2, zero for the whole dish on a
 * closed-lid dish and equal to an independently measured stage-2 change for half the dish; overlaps are
 * found; at most six; and probes never alter behaviour.
 */
import { describe, expect, it } from 'vitest';
import { GRID_W, TICKS_PER_SECOND } from '../../src/sim/constants';
import { inMask, maskCells } from '../../src/sim/grid';
import { deserializeWorld, stateHash, type WorldState } from '../../src/sim/serialize';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { realizeRecipe } from '../../src/sim/recipes';
import {
  maskCellList,
  overlapsOf,
  probeSetProblem,
  ProbeSet,
  PROBE_BOUNDARY_FIELDS,
  type ProbeMask,
} from '../../src/worker/probes';
import { FakeClockHost } from '../helpers/host';
import { trajectoryDigest } from '../helpers/trajectory';
import { clearWater, place, registry, setField } from '../helpers/world';

const rect = (id: ProbeMask['id'], x0: number, y0: number, x1: number, y1: number): ProbeMask => ({
  id,
  shape: 'rect',
  x0,
  y0,
  x1,
  y1,
});
const circle = (id: ProbeMask['id'], cx: number, cy: number, r: number): ProbeMask => ({
  id,
  shape: 'circle',
  cx,
  cy,
  r,
});

function stepWith(w: World, ps: ProbeSet, ticks: number, stage?: (s: number, w: World) => void): void {
  for (let t = 0; t < ticks; t++) {
    step(w, {
      afterStage: (s, world) => {
        ps.hook(s, world);
        stage?.(s, world);
      },
    });
    ps.afterTick(w);
  }
}

function sumCells(w: World, field: 'sugar' | 'oxygen' | 'co2', cells: Int32Array): number {
  const a = w.fields[field]!;
  let s = 0;
  for (const c of cells) s += a[c]!;
  return s;
}

describe('region probes (P4.8)', () => {
  it('cell lists: a rectangle (either corner order), a circle by centre distance ≤ r², both clipped to the dish', () => {
    const r = maskCellList(rect('A', 12, 10, 10, 11));
    expect([...r]).toEqual(
      [
        10 * GRID_W + 10,
        10 * GRID_W + 11,
        10 * GRID_W + 12,
        11 * GRID_W + 10,
        11 * GRID_W + 11,
        11 * GRID_W + 12,
      ].filter((c) => inMask(c % GRID_W, Math.floor(c / GRID_W))),
    );
    const inner = maskCellList(rect('A', 60, 60, 62, 61));
    expect(inner.length).toBe(6);
    const c = maskCellList(circle('B', 64, 64, 2));
    // r = 2: the 13 cells with dx² + dy² ≤ 4.
    expect(c.length).toBe(13);
    for (const cell of c) {
      const dx = (cell % GRID_W) - 64;
      const dy = Math.floor(cell / GRID_W) - 64;
      expect(dx * dx + dy * dy).toBeLessThanOrEqual(4);
    }
    // The whole grid as a rectangle is exactly the dish's playable cells; a corner outside the rim has none.
    expect([...maskCellList(rect('C', 0, 0, 127, 127))]).toEqual([...maskCells()]);
    expect(maskCellList(rect('D', 0, 0, 3, 3)).length).toBe(0);
    expect(probeSetProblem([rect('D', 0, 0, 3, 3)])).toBe('That region has no cells inside the dish.');
    const edge = maskCellList(circle('E', 64, 1, 6));
    for (const cell of edge) expect(inMask(cell % GRID_W, Math.floor(cell / GRID_W))).toBe(true);
    expect(edge.length).toBeLessThan(maskCellList(circle('E', 64, 64, 6)).length);
  });

  it('readings equal direct sums over the world', () => {
    const w = clearWater({ backgroundOverrides: { sugar: 0.2, nutrient: 0.1 } });
    place(w, 'B01', 40.5, 40.5);
    place(w, 'B01', 41.2, 42.9);
    place(w, 'A01', 44.5, 44.5);
    place(w, 'B01', 90.5, 90.5);
    setField(w, 'sugar', 41 * GRID_W + 41, 0.9);
    const m = rect('A', 38, 38, 45, 45);
    const ps = new ProbeSet(w);
    ps.set([m], w);
    const reading = ps.read(w, 60).masks[0]!;
    const cells = maskCellList(m);
    const inside = new Set(cells);
    const c = w.ents.cols;
    let total = 0;
    let biomass = 0;
    const per: Record<string, number> = {};
    for (let i = 0; i < w.ents.highWater; i++) {
      if (c.alive[i] !== 1 || !inside.has(Math.floor(c.y[i]!) * GRID_W + Math.floor(c.x[i]!))) continue;
      total++;
      biomass += c.B[i]!;
      const id = w.species[c.species[i]!]!.id;
      per[id] = (per[id] ?? 0) + 1;
    }
    expect(total).toBe(3);
    expect(reading.total).toBe(total);
    expect(reading.biomass).toBeCloseTo(biomass, 12);
    expect(Object.fromEntries(reading.population.map((p) => [p.species, p.count]))).toEqual(per);
    expect(reading.cellCount).toBe(cells.length);
    for (const { field, mean } of reading.means) {
      const arr = w.fields[field as 'sugar'];
      if (!arr) {
        expect(mean).toBeNull();
        continue;
      }
      let s = 0;
      for (const k of cells) s += arr[k]!;
      expect(mean).toBeCloseTo(s / cells.length, 12);
    }
    expect(reading.means.find((x) => x.field === 'sugar')!.mean).toBeGreaterThan(0.2);
  });

  it('boundary transfer: zero for the whole dish on a closed-lid dish; equal to the stage-2 change for half the dish', () => {
    const w = clearWater({ lid: 'closed', backgroundOverrides: { sugar: 0, nutrient: 0.1 } });
    // A sugar patch straddling x = 64 so diffusion carries sugar across the half-dish line.
    for (let dx = -4; dx <= 4; dx++)
      for (let dy = -4; dy <= 4; dy++) setField(w, 'sugar', (64 + dy) * GRID_W + 62 + dx, 1);
    place(w, 'B01', 30.5, 64.5);
    const whole = rect('A', 0, 0, 127, 127);
    const half = rect('B', 0, 0, 63, 127);
    const ps = new ProbeSet(w);
    ps.set([whole, half], w);
    const halfCells = maskCellList(half);
    const expected: Record<string, number> = { sugar: 0, oxygen: 0, co2: 0 };
    const pre: Record<string, number> = {};
    stepWith(w, ps, 300, (s, world) => {
      for (const f of ['sugar', 'oxygen', 'co2'] as const) {
        if (s === 1) pre[f] = sumCells(world, f, halfCells);
        if (s === 2) expected[f]! += sumCells(world, f, halfCells) - pre[f]!;
      }
    });
    const r = ps.read(w, 60);
    const w60 = r.masks[0]!;
    for (const b of w60.boundary) {
      if (['sugar', 'oxygen', 'co2', 'broth', 'salt', 'silicate'].includes(b.field) && w.fields[b.field as 'sugar']) {
        expect(b.status, b.field).toBe('measured');
        expect(Math.abs(b.into), b.field).toBeLessThan(1e-9);
      } else if (w.fields[b.field as 'sugar']) expect(b.status, b.field).toBe('notMeasured');
    }
    // The run is 30 s: every window holds all of it, so the 60 s total is the whole run's.
    const h = r.masks[1]!;
    const sugar = h.boundary.find((b) => b.field === 'sugar')!;
    expect(sugar.status).toBe('measured');
    expect(Math.abs(sugar.into)).toBeGreaterThan(0.01);
    expect(sugar.into).toBeCloseTo(expected.sugar!, 9);
    for (const f of ['oxygen', 'co2'])
      expect(h.boundary.find((b) => b.field === f)!.into).toBeCloseTo(expected[f]!, 9);
    // Deposits never drift and debris is added to by stage 2: not measured here.
    for (const f of ['starch', 'detritus'])
      expect(h.boundary.find((b) => b.field === f)!.status).toBe('notMeasured');
    expect(PROBE_BOUNDARY_FIELDS).toContain('sugar');
  });

  it('with the lid open, gases are not measured (the air exchanges them in stage 2); sugar still is', () => {
    const w = clearWater({ lid: 'open' });
    const ps = new ProbeSet(w);
    ps.set([rect('A', 0, 0, 127, 127)], w);
    stepWith(w, ps, 20);
    const b = ps.read(w, 60).masks[0]!.boundary;
    expect(b.find((x) => x.field === 'oxygen')!.status).toBe('notMeasured');
    expect(b.find((x) => x.field === 'co2')!.status).toBe('notMeasured');
    expect(b.find((x) => x.field === 'sugar')!.status).toBe('measured');
  });

  it('overlap detection, the six-region limit and unique letters', () => {
    expect(
      overlapsOf([rect('A', 40, 40, 50, 50), circle('B', 52, 52, 3), rect('C', 80, 80, 90, 90)]),
    ).toEqual([['A', 'B']]);
    expect(overlapsOf([rect('A', 40, 40, 50, 50), rect('B', 51, 40, 60, 50)])).toEqual([]);
    expect(
      overlapsOf([rect('C', 40, 40, 50, 50), rect('A', 50, 50, 60, 60), circle('B', 45, 45, 1)]),
    ).toEqual([
      ['A', 'C'],
      ['B', 'C'],
    ]);
    const six = (['A', 'B', 'C', 'D', 'E', 'F'] as const).map((id, k) =>
      rect(id, 30 + k * 10, 60, 35 + k * 10, 65),
    );
    expect(probeSetProblem(six)).toBeNull();
    expect(probeSetProblem([...six, rect('A', 40, 40, 41, 41)])).toBe(
      'Six regions is the most. Delete one to draw another.',
    );
    expect(probeSetProblem([rect('A', 40, 40, 41, 41), rect('A', 50, 50, 51, 51)])).toMatch(
      /two regions are named A/,
    );
    expect(probeSetProblem([{ id: 'G', shape: 'rect', x0: 1, y0: 1, x1: 2, y1: 2 }])).not.toBeNull();
    expect(probeSetProblem([{ id: 'A', shape: 'rect', x0: 1.5, y0: 1, x1: 2, y1: 2 }])).not.toBeNull();
  });

  it('the host: probeSet refuses a seventh region and changes nothing; Undo drops later boundary seconds; a duplicate starts with none', () => {
    const h = new FakeClockHost();
    h.create('probe-host', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    let id = 90000;
    const send = (msg: { type: 'probeSet'; probes: unknown[] } | { type: 'probeRead' }) => {
      const requestId = ++id;
      h.host.handle({ ...(msg as object), requestId, dishId: 'probe-host', windowSeconds: 60 } as never);
      const r = h.out.find((m) => m.type === 'probes' && m.requestId === requestId);
      if (r?.type !== 'probes') throw new Error('no probes reply');
      return r;
    };
    const six = (['A', 'B', 'C', 'D', 'E', 'F'] as const).map((k, i) =>
      rect(k, 20 + i * 12, 50, 28 + i * 12, 70),
    );
    expect(send({ type: 'probeSet', probes: six }).masks.length).toBe(6);
    const seventh = send({ type: 'probeSet', probes: [...six, circle('A', 64, 64, 3)] });
    expect(seventh.refused).toBe('Six regions is the most. Delete one to draw another.');
    expect(seventh.masks).toEqual(six);
    h.setSpeed(4);
    h.advanceTo(200);
    const at200 = send({ type: 'probeRead' }).readings.masks[0]!.boundary.find((b) => b.field === 'sugar')!;
    h.setSpeed(0);
    expect(
      h.command('s1', { kind: 'deposit', materialId: 'SUGAR', points: [[24, 60]], radius: 3, dose: 0.5 })
        ?.accepted,
    ).toBeGreaterThan(0);
    h.setSpeed(4);
    h.advanceTo(400);
    h.setSpeed(0);
    h.host.handle({ type: 'undo', requestId: ++id, dishId: 'probe-host' });
    expect(h.tick).toBe(200);
    const after = send({ type: 'probeRead' });
    expect(after.readings.masks[0]!.boundary.find((b) => b.field === 'sugar')).toEqual(at200);
    // Duplicate: the copy has no regions (session state of the open dish only).
    h.host.handle({ type: 'duplicate', requestId: ++id, dishId: 'probe-host', newDishId: 'probe-copy' });
    const requestId = ++id;
    h.host.handle({ type: 'probeRead', requestId, dishId: 'probe-copy', windowSeconds: 60 });
    const copy = h.out.find((m) => m.type === 'probes' && m.requestId === requestId);
    expect(copy?.type === 'probes' && copy.masks.length).toBe(0);
    expect(h.save()).not.toMatch(/"shape":"(rect|circle)"|recordedSinceSecond/);
  });

  it('probes never alter behaviour: six regions vs none, equal stateHash and full digest over 3,000 ticks at 4×', () => {
    const h = new FakeClockHost();
    h.create('probe-hash', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    const plain = deserializeWorld(JSON.parse(h.save()) as WorldState);
    const masks = [
      rect('A', 30, 30, 60, 60),
      circle('B', 64, 64, 20),
      rect('C', 0, 0, 127, 127),
      circle('D', 90, 40, 8),
      rect('E', 50, 70, 100, 100),
      circle('F', 40, 90, 12),
    ];
    h.host.handle({
      type: 'probeSet',
      requestId: 99001,
      dishId: 'probe-hash',
      probes: masks,
      windowSeconds: 60,
    });
    h.setSpeed(4);
    for (let t = 500; t <= 3000; t += 500) {
      h.advanceTo(t);
      h.host.handle({ type: 'probeRead', requestId: 99001 + t, dishId: 'probe-hash', windowSeconds: 600 });
    }
    const last = h.out.filter((m) => m.type === 'probes').at(-1);
    if (last?.type !== 'probes') throw new Error('no reading');
    expect(last.readings.masks.length).toBe(6);
    expect(last.readings.overlaps.length).toBeGreaterThan(0);
    for (let t = 0; t < 3000; t++) step(plain);
    expect(stateHash(h.world)).toBe(stateHash(plain));
    expect(trajectoryDigest(h.world, 'full')).toBe(trajectoryDigest(plain, 'full'));
  }, 180_000);

  it('a reading is made at whole dish seconds of the window', () => {
    const reg = registry();
    const w = realizeRecipe(reg, 'FIRST_DISH_V1', { worldId: 'probe-win' });
    const ps = new ProbeSet(w);
    ps.set([circle('A', 64, 64, 10)], w);
    stepWith(w, ps, 25);
    const r = ps.read(w, 60);
    expect(r.tick).toBe(25);
    expect(r.masks[0]!.recordedSinceSecond).toBeNull();
    expect(Math.floor((r.tick - 1) / TICKS_PER_SECOND)).toBe(2);
  });
});
