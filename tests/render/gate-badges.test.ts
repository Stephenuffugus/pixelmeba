/**
 * Phase 5 wave 12 (structures-art-audio): gate-class badges (src/render/gateBadges.ts; P5.7 "gate badges";
 * UX §6.5, §7.3, §9; CT §5.3).
 *   - badgeFor(code) is barriers.ts edgeFactor / edgePermits for every edge code and every class (no table of
 *     its own): field classes 1 pass, 0 < f < 1 partial, 0 blocked; organism classes pass / blocked; an S04 marks
 *     the classes its directed transfer carries (the tracer's rule: dissolved, viral, Small) one-way, the rest
 *     blocked (D-0106). Its class order is the gate table's row order.
 *   - runsOf: maximal straight runs of same-code edges with their midpoints (a gap, an L, alternating codes).
 *   - worldBadges: run badges only at the 'close' zoom band, plus the selected gate's at every zoom.
 *   - Boundary: no rng, audio, Pixi, Math.random or Date; computing badges between steps never changes the world.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EDGE_CHANNEL,
  EDGE_NONE,
  EDGE_S01,
  EDGE_S02,
  EDGE_SHUTTER_CLOSED,
  EDGE_SHUTTER_OPEN,
  edgeFactor,
  edgeKey,
  edgePermits,
  type TransportClass,
} from '../../src/sim/barriers';
import { CELL_COUNT } from '../../src/sim/constants';
import { cellIndex } from '../../src/sim/grid';
import { stateHash } from '../../src/sim/serialize';
import { step } from '../../src/sim/tick';
import { EDGE_FLOW_BACK, type GeometryEdges } from '../../src/worker/protocol';
import { packEdges } from '../../src/worker/snapshot';
import { ZOOM_CLOSE, ZOOM_NEIGHBORHOOD } from '../../src/render/camera';
import {
  BADGE_CLASSES,
  BADGE_CLOSE_ZOOM,
  BADGE_COLORS,
  badgeBox,
  badgeEdges,
  badgeFor,
  badgeZoomBand,
  runsOf,
  worldBadges,
  type BadgeEdge,
} from '../../src/render/gateBadges';
import { DISH_COLORS } from '../../src/render/layers';
import { GATE_FIELD_ROWS, GATE_ORGANISM_ROWS } from '../../src/ui/strings/structures';
import { contrastRatio, fromInt, GRAPHIC_MIN } from '../../src/ui/a11y/contrast';
import { barrierDish, place, pushEdges, verticalLine } from '../helpers/world';
import { trajectoryDigest } from '../helpers/trajectory';

const ROOT = join(__dirname, '..', '..');
const FIELD: readonly TransportClass[] = ['dissolved', 'activity', 'viral'];
const CODES = [EDGE_NONE, EDGE_S01, EDGE_S02, EDGE_SHUTTER_CLOSED, EDGE_SHUTTER_OPEN];

describe('badgeFor', () => {
  it('is barriers.ts edgeFactor / edgePermits for every non-channel code and every class', () => {
    for (const code of CODES) {
      const pips = badgeFor(code);
      expect(pips.map((p) => p.cls)).toEqual([...BADGE_CLASSES]);
      for (const p of pips) {
        if (FIELD.includes(p.cls)) {
          const f = edgeFactor(code, p.cls as 'dissolved' | 'activity' | 'viral');
          expect(p.state, `${code} ${p.cls}`).toBe(f >= 1 ? 'pass' : f > 0 ? 'partial' : 'blocked');
        } else expect(p.state, `${code} ${p.cls}`).toBe(edgePermits(code, p.cls) ? 'pass' : 'blocked');
      }
    }
  });

  it('reads as CT §5.3: S01 partial / blocked viral, S02 partial fields and Small only, shutters all or nothing', () => {
    const states = (code: number) => badgeFor(code).map((p) => p.state);
    expect(states(EDGE_S01)).toEqual(['partial', 'partial', 'blocked', 'blocked', 'blocked', 'blocked', 'blocked']);
    expect(states(EDGE_S02)).toEqual(['partial', 'partial', 'partial', 'pass', 'blocked', 'blocked', 'blocked']);
    expect(states(EDGE_SHUTTER_CLOSED)).toEqual(Array(7).fill('blocked'));
    expect(states(EDGE_SHUTTER_OPEN)).toEqual(Array(7).fill('pass'));
  });

  it('an S04 (either flow) marks its directed transfer one-way (dissolved, viral, Small) and blocks the rest (D-0106)', () => {
    for (const code of [EDGE_CHANNEL, EDGE_CHANNEL | EDGE_FLOW_BACK]) {
      expect(badgeFor(code).map((p) => p.state)).toEqual(['oneWay', 'blocked', 'oneWay', 'oneWay', 'blocked', 'blocked', 'blocked']);
    }
  });

  it('the flow bit never changes a non-channel badge; its class order is the gate table row order', () => {
    for (const code of CODES) expect(badgeFor(code | EDGE_FLOW_BACK)).toEqual(badgeFor(code));
    expect([...GATE_FIELD_ROWS, ...GATE_ORGANISM_ROWS].map((r) => r.cls)).toEqual([...BADGE_CLASSES]);
  });
});

describe('runsOf', () => {
  const R = (x: number, y: number, code = EDGE_S01): BadgeEdge => ({ cell: cellIndex(x, y), dir: 'R', code });
  const D = (x: number, y: number, code = EDGE_S01): BadgeEdge => ({ cell: cellIndex(x, y), dir: 'D', code });

  it('a straight S01 line with a gap is two runs, each with its midpoint on the line', () => {
    const list = [R(40, 50), R(40, 51), R(40, 52), R(40, 55), R(40, 56)];
    const runs = runsOf([...list].reverse()); // order of the input does not matter
    expect(runs.map((r) => r.cells)).toEqual([[cellIndex(40, 50), cellIndex(40, 51), cellIndex(40, 52)], [cellIndex(40, 55), cellIndex(40, 56)]]);
    expect(runs.map((r) => r.mid)).toEqual([
      [41, 51.5],
      [41, 56],
    ]);
  });

  it('an L-shaped line is two runs (a vertical and a horizontal one)', () => {
    const runs = runsOf([R(40, 50), R(40, 51), D(41, 51), D(42, 51), D(43, 51)]);
    expect(runs.map((r) => [r.dir, r.cells.length])).toEqual([
      ['R', 2],
      ['D', 3],
    ]);
    expect(runs[1]!.mid).toEqual([42.5, 52]);
  });

  it('alternating codes give single-edge runs; a channel flow change splits a run', () => {
    const runs = runsOf([R(40, 50, EDGE_S01), R(40, 51, EDGE_S02), R(40, 52, EDGE_S01), R(40, 53, EDGE_S02)]);
    expect(runs.map((r) => r.cells.length)).toEqual([1, 1, 1, 1]);
    expect(runsOf([D(40, 50, EDGE_CHANNEL), D(41, 50, EDGE_CHANNEL | EDGE_FLOW_BACK)]).length).toBe(2);
    // Horizontal neighbours across a row end are not adjacent.
    expect(runsOf([D(127, 50), D(0, 51)]).length).toBe(2);
  });
});

describe('the world layer', () => {
  const edges = (): GeometryEdges => {
    const r = new Uint8Array(CELL_COUNT);
    const d = new Uint8Array(CELL_COUNT);
    const list: { id: number; kind: 'S01' | 'S02' | 'S03' | 'S04'; cell: number; dir: 'R' | 'D' }[] = [];
    let id = 1;
    for (let y = 50; y <= 54; y++) {
      r[cellIndex(40, y)] = EDGE_S02;
      list.push({ id: id++, kind: 'S02', cell: cellIndex(40, y), dir: 'R' });
    }
    d[cellIndex(60, 60)] = EDGE_SHUTTER_CLOSED;
    list.push({ id, kind: 'S03', cell: cellIndex(60, 60), dir: 'D' });
    return { r, d, list };
  };

  it("shows one badge per run only at the 'close' band, and the selected gate's at every zoom", () => {
    const e = edges();
    expect(badgeZoomBand(ZOOM_CLOSE)).toBe('close');
    expect(badgeZoomBand(ZOOM_NEIGHBORHOOD)).toBe('far');
    expect(BADGE_CLOSE_ZOOM).toBeGreaterThan(ZOOM_NEIGHBORHOOD);
    expect(BADGE_CLOSE_ZOOM).toBeLessThanOrEqual(ZOOM_CLOSE);
    expect(worldBadges(e, ZOOM_CLOSE, null).map((b) => [b.code, b.selected])).toEqual([
      [EDGE_S02, false],
      [EDGE_SHUTTER_CLOSED, false],
    ]);
    for (const z of [3, ZOOM_NEIGHBORHOOD]) expect(worldBadges(e, z, null)).toEqual([]);
    const sel = edgeKey(cellIndex(60, 60), 'D');
    for (const z of [3, ZOOM_NEIGHBORHOOD]) {
      const b = worldBadges(e, z, sel);
      expect(b.map((x) => [x.code, x.selected, x.at])).toEqual([[EDGE_SHUTTER_CLOSED, true, [60.5, 61]]]);
    }
    // At close, the selected edge's run is drawn once (its selected badge), the other run as usual.
    const mid = edgeKey(cellIndex(40, 52), 'R');
    expect(worldBadges(e, ZOOM_CLOSE, mid).map((b) => [b.code, b.selected])).toEqual([
      [EDGE_SHUTTER_CLOSED, false],
      [EDGE_S02, true],
    ]);
    // A selection that names no barrier draws nothing extra.
    expect(worldBadges(e, 3, edgeKey(cellIndex(10, 10), 'R'))).toEqual([]);
    expect(badgeEdges(null)).toEqual([]);
  });

  it('the badge plate sits beside its line, never on it, at a constant screen size', () => {
    for (const z of [4, 8, 16, 32]) {
      const v = badgeBox({ at: [41, 52], dir: 'R' }, z);
      expect(v.x).toBeGreaterThan(41);
      expect(v.w * z).toBeCloseTo(badgeBox({ at: [41, 52], dir: 'R' }, 16).w * 16, 9);
      const h = badgeBox({ at: [60.5, 61], dir: 'D' }, z);
      expect(h.y + h.h).toBeLessThan(61);
    }
  });

  it('pip and plate colours: the pip ≥ 3:1 against water, gel, sediment and its plate', () => {
    for (const bg of [DISH_COLORS.water, DISH_COLORS.gel, DISH_COLORS.sediment, DISH_COLORS.badgePlate])
      expect(contrastRatio(fromInt(BADGE_COLORS.pip), bg)).toBeGreaterThanOrEqual(GRAPHIC_MIN);
  });
});

describe('boundary', () => {
  it('gateBadges.ts imports nothing from src/sim/rng.ts, src/audio or Pixi and uses no Math.random or Date', () => {
    const src = readFileSync(join(ROOT, 'src', 'render', 'gateBadges.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/rng/);
    expect(code).not.toMatch(/\bdet\(/);
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/\bDate\b/);
    expect(code).not.toMatch(/performance\.now/);
    for (const m of code.matchAll(/from '([^']+)'/g)) {
      expect(m[1]).not.toMatch(/pixi|audio|rng/);
      expect(['@sim/barriers', '@sim/constants', '@worker/protocol', './camera', './gateTracer', './layers', './structureLayer']).toContain(m[1]);
    }
  });

  it('a world stepped 400 ticks while badges are computed between steps keeps stateHash and the full digest (reads only)', () => {
    const make = () => {
      const w = barrierDish();
      pushEdges(w, [...verticalLine('S02', 60, 50, 78), { kind: 'S03', cell: cellIndex(70, 60), dir: 'D', open: false }, { kind: 'S04', cell: cellIndex(50, 70), dir: 'R', flow: 1 }]);
      for (let k = 0; k < 12; k++) place(w, k % 2 ? 'B01' : 'P01', 50.5 + 2 * k, 60.5 + (k % 5));
      return w;
    };
    const a = make();
    const b = make();
    for (let t = 0; t < 400; t++) {
      step(a);
      step(b);
      const e = packEdges(b.edges);
      for (const z of [4, 12, 16]) {
        for (const badge of worldBadges(e, z, edgeKey(b.edges[t % b.edges.length]!.cell, b.edges[t % b.edges.length]!.dir))) badgeBox(badge, z);
      }
      runsOf(badgeEdges(e));
    }
    expect(stateHash(b)).toBe(stateHash(a));
    expect(trajectoryDigest(b, 'full')).toBe(trajectoryDigest(a, 'full'));
  });
});
