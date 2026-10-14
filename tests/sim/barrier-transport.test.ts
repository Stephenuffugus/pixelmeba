/**
 * Phase 5 wave 10 barrier-transport: edge barriers in ordinary diffusion (SPEC §4.1 "Edge barriers
 * multiply flux by their class factor (CT §5.3). Companion nutrient moves in the same fraction as its
 * carbon"; §4.9; CT §5.3; D-0106 the channel edge is closed to ordinary diffusion; D-0117).
 *
 * Worlds: barrierDish (clear water under the shipped manifest plus 'barriers', 'climate', 'devices' and
 * S01–S12, allowUnimplemented: the lead lists the structures as implemented at the systems flip, D-0104).
 * Edges are pushed with wave 9's helpers (ids below nextDeviceId, geometryVersion bumped). A barrier
 * world is compared with the same dish without the edge, after one stage 2 (only the cell next to the
 * edge holds the field, so the far cell's gain is the flux across that one edge).
 */
import { describe, expect, it } from 'vitest';
import {
  EDGE_CHANNEL,
  EDGE_NONE,
  EDGE_S01,
  EDGE_S02,
  EDGE_SHUTTER_CLOSED,
  EDGE_SHUTTER_OPEN,
  edgeFactor,
  type EdgeBarrier,
} from '../../src/sim/barriers';
import { FIELD_DEFS, FIELD_IDS, type FieldId } from '../../src/sim/fields';
import { cellIndex, diffusionCoefficient, inMask, maskCells, transportOpen } from '../../src/sim/grid';
import { run } from '../../src/sim/tick';
import { stageEnvironment, transportCache } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { barrierDish, clearWater, preFlipRegistry, pushEdges, setField, verticalLine } from '../helpers/world';

const X = 63;
const Y = 64;
const SRC = cellIndex(X, Y);
const DST = cellIndex(X + 1, Y);

function relClose(a: number, b: number, rel = 1e-12): void {
  expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(rel * Math.max(Math.abs(a), Math.abs(b)));
}

/** A closed-lid barrier dish, with the given edges pushed (none when empty). */
function dish(edges: readonly Omit<EdgeBarrier, 'id'>[] = []): World {
  const w = barrierDish({ seed: 104729, lid: 'closed' });
  if (edges.length > 0) pushEdges(w, edges);
  return w;
}

/** The far cell's gain of `field` after one stage 2, with `value` placed at SRC only. */
function gainAcross(edges: readonly Omit<EdgeBarrier, 'id'>[], field: FieldId, value: number, setup?: (w: World) => void): number {
  const w = dish(edges);
  setup?.(w);
  setField(w, field, SRC, value);
  const before = w.fields[field]![DST]!;
  stageEnvironment(w);
  return w.fields[field]![DST]! - before;
}

const S01_LINE = verticalLine('S01', X, 20, 108);
const S02_LINE = verticalLine('S02', X, 20, 108);

describe('barrier factors on ordinary diffusion (CT §5.3)', () => {
  it('a sugar cell beside an S01 line: the first tick flux across is 0.25 of the open dish’s', () => {
    const open = gainAcross([], 'sugar', 1);
    expect(open).toBeGreaterThan(0);
    relClose(gainAcross(S01_LINE, 'sugar', 1), 0.25 * open);
  });

  it('S02: 0.5', () => {
    relClose(gainAcross(S02_LINE, 'sugar', 1), 0.5 * gainAcross([], 'sugar', 1));
  });

  it('closed S03 across the whole dish: the far side stays exactly 0 for 1,000 ticks', () => {
    const line = verticalLine('S03', X, 0, 127, { open: false });
    const w = dish(line);
    for (const cell of maskCells()) if (cell % 128 <= X) setField(w, 'sugar', cell, 0.3);
    run(w, 1000);
    const sugar = w.fields.sugar!;
    for (const cell of maskCells()) if (cell % 128 > X) expect(sugar[cell], `cell ${cell}`).toBe(0);
    expect(sugar[SRC]).toBeGreaterThan(0);
  });

  it('open S03: coefficients byte-equal to no barrier and fields byte-identical after 400 ticks', () => {
    const line = verticalLine('S03', X, 0, 127, { open: true });
    const a = dish(line);
    const b = dish();
    b.grid.geometryVersion = a.grid.geometryVersion;
    const ta = transportCache(a);
    const tb = transportCache(b);
    expect(Buffer.from(ta.kR.buffer).equals(Buffer.from(tb.kR.buffer))).toBe(true);
    expect(Buffer.from(ta.kD.buffer).equals(Buffer.from(tb.kD.buffer))).toBe(true);
    for (const w of [a, b]) {
      setField(w, 'sugar', SRC, 1);
      setField(w, 'v01', SRC, 50);
      setField(w, 'eStarch', SRC, 0.5);
    }
    run(a, 400);
    run(b, 400);
    for (const id of Object.keys(b.fields) as FieldId[]) {
      expect(Buffer.from(a.fields[id]!.buffer).equals(Buffer.from(b.fields[id]!.buffer)), id).toBe(true);
    }
  });

  it('S04: closed to ordinary diffusion both ways (coefficient 0 in both pairs); sugar at the destination never reaches the source', () => {
    const w = dish([{ kind: 'S04', cell: SRC, dir: 'R', flow: 1 }]);
    const tc = transportCache(w);
    expect(tc.kR[SRC]).toBe(0);
    expect(tc.kRv[SRC]).toBe(0);
    setField(w, 'sugar', DST, 1);
    stageEnvironment(w);
    expect(w.fields.sugar![SRC]).toBe(0);
  });

  it('v01: 0 through S01 and 0.5 through S02', () => {
    const open = gainAcross([], 'v01', 100);
    expect(open).toBeGreaterThan(0);
    expect(gainAcross(S01_LINE, 'v01', 100)).toBe(0);
    relClose(gainAcross(S02_LINE, 'v01', 100), 0.5 * open);
  });

  it('v02 moves at half of v01’s rate, and through S02 at 0.5 of that', () => {
    const v01 = gainAcross([], 'v01', 100);
    const v02 = gainAcross([], 'v02', 100);
    relClose(v02, 0.5 * v01);
    relClose(gainAcross(S02_LINE, 'v02', 100), 0.5 * v02);
    expect(gainAcross(S01_LINE, 'v02', 100)).toBe(0);
  });

  it('an enzyme (eStarch, activity): 0.25 through S01 and 0.5 through S02', () => {
    const open = gainAcross([], 'eStarch', 0.5);
    expect(open).toBeGreaterThan(0);
    relClose(gainAcross(S01_LINE, 'eStarch', 0.5), 0.25 * open);
    relClose(gainAcross(S02_LINE, 'eStarch', 0.5), 0.5 * open);
  });

  it('film on one side of an S01: 0.125 (film halves the barrier-adjusted coefficient)', () => {
    const open = gainAcross([], 'sugar', 1);
    const filmed = gainAcross(S01_LINE, 'sugar', 1, (w) => {
      setField(w, 'film', SRC, 0.2);
      setField(w, 'filmN', SRC, 0.02);
    });
    relClose(filmed, 0.125 * open);
    // The viral film pair: v01 still 0 through the S01 with film; through an S02 with film 0.25.
    const v01Open = gainAcross([], 'v01', 100);
    const filmS02 = gainAcross([...S02_LINE, { kind: 'S01', cell: cellIndex(X, 30), dir: 'D' }], 'v01', 100, (w) => {
      setField(w, 'film', SRC, 0.2);
      setField(w, 'filmN', SRC, 0.02);
    });
    relClose(filmS02, 0.25 * v01Open);
  });

  it('companions: the crossing sugarN / sugar ratio equals the source ratio', () => {
    const w = dish(S01_LINE);
    setField(w, 'sugar', SRC, 1);
    setField(w, 'sugarN', SRC, 0.1);
    stageEnvironment(w);
    const c = w.fields.sugar![DST]!;
    const n = w.fields.sugarN![DST]!;
    expect(c).toBeGreaterThan(0);
    relClose(n / c, 0.1);
  });

  it('dissolved and activity factors are equal for every edge code (one shared pair)', () => {
    for (const code of [EDGE_NONE, EDGE_S01, EDGE_S02, EDGE_SHUTTER_CLOSED, EDGE_SHUTTER_OPEN, EDGE_CHANNEL]) {
      expect(edgeFactor(code, 'activity'), `code ${code}`).toBe(edgeFactor(code, 'dissolved'));
    }
    // Viral differs only on S01 (so the viral pair aliases kR/kD without one).
    for (const code of [EDGE_NONE, EDGE_S02, EDGE_SHUTTER_CLOSED, EDGE_SHUTTER_OPEN, EDGE_CHANNEL]) {
      expect(edgeFactor(code, 'viral'), `code ${code}`).toBe(edgeFactor(code, 'dissolved'));
    }
    expect(edgeFactor(EDGE_S01, 'viral')).not.toBe(edgeFactor(EDGE_S01, 'dissolved'));
  });

  it('no field with barrier class none diffuses', () => {
    for (const id of FIELD_IDS) if (FIELD_DEFS[id].barrier === 'none') expect(FIELD_DEFS[id].diffusion, id).toBe('none');
    const w = dish(S01_LINE);
    setField(w, 'detritus', SRC, 0.5);
    setField(w, 'detritusN', SRC, 0.05);
    stageEnvironment(w);
    expect(w.fields.detritus![SRC]).toBe(0.5);
    expect(w.fields.detritus![DST]).toBe(0);
  });
});

describe('NEUTRAL and the coefficient cache', () => {
  it('a world recording barriers with edges [] has kR/kD byte-equal to a v1.0 (pre-flip) world’s and to min(ki, kj); the viral pair is the same array', () => {
    const a = dish();
    const b = clearWater({ seed: 104729, lid: 'closed' }, preFlipRegistry());
    expect(a.content.manifest.enabledSystems).toContain('barriers');
    expect(b.content.manifest.enabledSystems).not.toContain('barriers');
    const ta = transportCache(a);
    const tb = transportCache(b);
    expect(Buffer.from(ta.kR.buffer).equals(Buffer.from(tb.kR.buffer))).toBe(true);
    expect(Buffer.from(ta.kD.buffer).equals(Buffer.from(tb.kD.buffer))).toBe(true);
    expect(ta.kRv).toBe(ta.kR);
    expect(ta.kDv).toBe(ta.kD);
    expect(tb.kRv).toBe(tb.kR);
    // An independent min(ki, kj) over the dish.
    const g = a.grid;
    const kR = new Float64Array(ta.kR.length);
    for (const i of maskCells()) {
      const x = i % 128;
      if (!transportOpen(g, i) || x + 1 >= 128 || !inMask(x + 1, (i - x) / 128) || !transportOpen(g, i + 1)) continue;
      kR[i] = Math.min(diffusionCoefficient(g.substrate[i]!), diffusionCoefficient(g.substrate[i + 1]!));
    }
    expect(Buffer.from(ta.kR.buffer).equals(Buffer.from(kR.buffer))).toBe(true);
    expect(a.gateTally).toEqual([]);
  });

  it('the viral pair is the same array when edges exist but none is S01; separate (and 0 on the S01) when one exists', () => {
    const a = dish(S02_LINE);
    const ta = transportCache(a);
    expect(ta.kRv).toBe(ta.kR);
    expect(ta.kDv).toBe(ta.kD);
    expect(ta.kR[SRC]).toBe(0.05);
    const b = dish(S01_LINE);
    const tb = transportCache(b);
    expect(tb.kRv).not.toBe(tb.kR);
    expect(tb.kR[SRC]).toBe(0.025);
    expect(tb.kRv[SRC]).toBe(0);
    // Off the barrier edges the viral pair equals the dissolved one.
    expect(tb.kRv[cellIndex(40, 64)]).toBe(tb.kR[cellIndex(40, 64)]);
    expect(Buffer.from(tb.kDv.buffer).equals(Buffer.from(tb.kD.buffer))).toBe(true);
  });

  it('replacing world.edges with a new array WITHOUT a bump rebuilds (identity key); toggling a shutter in place WITH a bump rebuilds', () => {
    const w = dish();
    expect(transportCache(w).kR[SRC]).toBe(0.1);
    w.edges = [{ id: w.counters.nextDeviceId++, kind: 'S03', cell: SRC, dir: 'R', open: true }];
    expect(transportCache(w).kR[SRC]).toBe(0.1);
    const geo = w.grid.geometryVersion;
    w.edges = [{ id: w.counters.nextDeviceId++, kind: 'S02', cell: SRC, dir: 'R' }];
    expect(w.grid.geometryVersion).toBe(geo);
    expect(transportCache(w).kR[SRC]).toBe(0.05);
    // In place, with the writer's bump.
    const shutter = w.edges.splice(0, 1, { id: w.counters.nextDeviceId++, kind: 'S03', cell: SRC, dir: 'R', open: true })[0]!;
    expect(shutter.kind).toBe('S02');
    w.grid.geometryVersion++;
    expect(transportCache(w).kR[SRC]).toBe(0.1);
    w.edges[0]!.open = false;
    w.grid.geometryVersion++;
    expect(transportCache(w).kR[SRC]).toBe(0);
  });
});
