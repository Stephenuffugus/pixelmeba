/**
 * P5.8 polish (wave 15; D-0123 MINOR 3): S01 (short dots) and S02 (slots) stay distinguishable at every zoom from
 * 1.5 px per cell (a phone's whole dish) up to ZOOM_MAX 32, swept in 0.25 px steps (the structure-layers sweep pattern):
 *
 *   from EDGE_PAIRED_BELOW (3.5) up: every S02 slot is at least 1.5 × the S01 dot's length and both are at least
 *     MIN_MARK_PX on screen, each lying ON the shared edge;
 *   below it, where one edge is too short for both: S02 switches pattern to two paired rails ALONG the edge, one
 *     either side of it, RAIL_PX off the line (a double line) — S01 stays one mark on the edge line — and its own
 *     detail band ('whole'), so the renderer redraws when the zoom crosses 3.5 (renderer.ts compares edgeDetail).
 *
 * Mutant check (by hand, reverted): S02's slot made shorter than S01's dot at 2 px per cell fails the 'whole' case.
 */
import { describe, expect, it } from 'vitest';
import { EDGE_S01, EDGE_S02, EDGE_SHUTTER_CLOSED, EDGE_SHUTTER_OPEN, EDGE_CHANNEL } from '../../src/sim/barriers';
import { cellIndex } from '../../src/sim/grid';
import { EDGE_PAIRED_BELOW, edgeDetail, edgeGlyph, edgeMarks, edgeSegment, MIN_MARK_PX, RAIL_PX } from '../../src/render/structureLayer';

const ZOOMS: number[] = [];
for (let z = 1.5; z <= 32 + 1e-9; z += 0.25) ZOOMS.push(Math.round(z * 100) / 100);

type Seg = [number, number, number, number];
const segs = (code: number, cell: number, dir: 'R' | 'D', z: number): Seg[] => {
  const g = edgeGlyph(code, cell, dir, z)!;
  const out: Seg[] = [];
  for (let k = 0; k < g.segments.length; k += 4) out.push(g.segments.slice(k, k + 4) as Seg);
  return out;
};
const lenPx = (s: Seg, z: number) => Math.hypot(s[2] - s[0], s[3] - s[1]) * z;
/** Signed distance across the edge line (cells) of a point; 0 on the line. */
const across = (cell: number, dir: 'R' | 'D', x: number, y: number) => {
  const [ex, ey] = edgeSegment(cell, dir);
  return dir === 'R' ? x - ex : y - ey;
};

describe('S01 and S02 edge glyphs at every zoom from 1.5 to 32 px per cell (D-0123 MINOR 3)', () => {
  const cases: [number, 'R' | 'D'][] = [
    [cellIndex(10, 10), 'R'],
    [cellIndex(70, 41), 'D'],
  ];

  it('sweeps 1.5 … 32 in 0.25 steps (123 zooms)', () => {
    expect(ZOOMS[0]).toBe(1.5);
    expect(ZOOMS[ZOOMS.length - 1]).toBe(32);
    expect(ZOOMS).toHaveLength(123);
  });

  it.each(cases)('cell %i %s: slots ≥ 1.5 × dots and both ≥ MIN_MARK_PX from 3.5; paired rails below', (cell, dir) => {
    for (const z of ZOOMS) {
      const dots = segs(EDGE_S01, cell, dir, z);
      const slots = segs(EDGE_S02, cell, dir, z);
      // S01: marks on the edge line, never shorter than MIN_MARK_PX, at every zoom.
      expect(dots.length, `S01 at ${z}`).toBe(edgeMarks(EDGE_S01, z));
      for (const d of dots) {
        expect(across(cell, dir, d[0], d[1]), `S01 on the line at ${z}`).toBe(0);
        expect(across(cell, dir, d[2], d[3])).toBe(0);
        expect(lenPx(d, z), `S01 dot at ${z}`).toBeGreaterThanOrEqual(MIN_MARK_PX - 1e-9);
      }
      const dot = Math.max(...dots.map((d) => lenPx(d, z)));
      expect(slots.length, `S02 at ${z}`).toBe(edgeMarks(EDGE_S02, z));
      if (z >= EDGE_PAIRED_BELOW) {
        expect(edgeDetail(z), `band at ${z}`).not.toBe('whole');
        for (const sl of slots) {
          expect(across(cell, dir, sl[0], sl[1]), `S02 on the line at ${z}`).toBe(0);
          expect(across(cell, dir, sl[2], sl[3])).toBe(0);
          expect(lenPx(sl, z), `S02 slot vs MIN_MARK_PX at ${z}`).toBeGreaterThanOrEqual(MIN_MARK_PX - 1e-9);
          expect(lenPx(sl, z), `S02 slot ≥ 1.5 × S01 dot at ${z}`).toBeGreaterThanOrEqual(1.5 * dot - 1e-9);
        }
      } else {
        // The distinct pattern: two parallel rails along the whole edge, one either side, RAIL_PX off the line.
        expect(edgeDetail(z), `band at ${z}`).toBe('whole');
        expect(slots).toHaveLength(2);
        const sides = slots.map((sl) => {
          const a = across(cell, dir, sl[0], sl[1]);
          expect(across(cell, dir, sl[2], sl[3]), `rail parallel to the edge at ${z}`).toBeCloseTo(a, 12);
          expect(lenPx(sl, z), `rail length at ${z}`).toBeCloseTo(z, 9);
          expect(lenPx(sl, z)).toBeGreaterThanOrEqual(MIN_MARK_PX - 1e-9);
          return a * z;
        });
        expect(sides[0]! * sides[1]!, `rails on both sides at ${z}`).toBeLessThan(0);
        for (const px of sides) expect(Math.abs(px)).toBeCloseTo(RAIL_PX, 9);
        // S01 there is one mark on the line, so the two never share a pattern.
        expect(dots).toHaveLength(1);
      }
    }
  });

  it('the bands: whole < 3.5 ≤ coarse < 6 ≤ fine; every other glyph keeps its coarse shapes in the whole band', () => {
    expect(edgeDetail(3.49)).toBe('whole');
    expect(edgeDetail(3.5)).toBe('coarse');
    expect(edgeDetail(5.99)).toBe('coarse');
    expect(edgeDetail(6)).toBe('fine');
    const cell = cellIndex(10, 10);
    for (const code of [EDGE_S01, EDGE_SHUTTER_CLOSED, EDGE_SHUTTER_OPEN, EDGE_CHANNEL]) {
      const at2 = edgeGlyph(code, cell, 'R', 2)!;
      const at4 = edgeGlyph(code, cell, 'R', 4)!;
      expect(at2.segments.length, `code ${code}`).toBe(at4.segments.length);
      expect(at2.color).toBe(at4.color);
    }
    // The open shutter's posts across the edge stay posts in the whole band (not rails, not dots).
    const posts = edgeGlyph(EDGE_SHUTTER_OPEN, cell, 'R', 2)!.segments;
    for (let k = 0; k < posts.length; k += 4) expect(posts[k + 1]).toBe(posts[k + 3]);
  });
});
