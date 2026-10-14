/**
 * Phase 5 structure layers (wave 11 structure-render-worker; UX §4.1, §6.5, §7.3; CT §4; D-0119):
 * src/render/structureLayer.ts edge glyphs lie on the shared cell edge (R and D, at the grid's inner bounds),
 * S04 chevrons point by flow (EDGE_FLOW_BACK), every glyph colour is ≥ 3:1 against water, gel and sediment;
 * device frame picks (S08 saturation quartiles, S09/S10 on/off) and the 'device' atlas tile appended last
 * with 13 frames (wave 12 structures-art-audio redrew s05, s07 and s08_0–3 with the same names and order: the
 * pins hold); the edge glyphs' mark counts by zoom and the open shutter's posts below 6 px per cell (wave 12); the warmth and moisture overlays (packOverlay reads, never allocates; max 1; painted
 * opaque with their own ramps).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEVICE_FRAME_NAMES } from '../../art/src/tiles/structures';
import { TILES } from '../../art/src/tiles/index';
import { EDGE_CHANNEL, EDGE_S01, EDGE_S02, EDGE_SHUTTER_CLOSED, EDGE_SHUTTER_OPEN } from '../../src/sim/barriers';
import { CELL_COUNT } from '../../src/sim/constants';
import { cellIndex } from '../../src/sim/grid';
import { EDGE_FLOW_BACK } from '../../src/worker/protocol';
import { packOverlay } from '../../src/worker/snapshot';
import { colormapFor, DISH_COLORS, legendStops, paintOverlay } from '../../src/render/layers';
import { CHEVRON_DEPTH, CHEVRON_DEPTH_COARSE, DEVICE_FRAME_COUNT, DEVICE_FRAMES, deviceFrame, deviceSprites, EDGE_GLYPH_COLORS, edgeDetail, edgeGlyph, edgeGlyphs, edgeMarks, edgeSegment, MIN_MARK_PX, resinQuartile } from '../../src/render/structureLayer';
import { contrastRatio, fromInt, GRAPHIC_MIN } from '../../src/ui/a11y/contrast';
import { barrierDish, clearWater } from '../helpers/world';

const ROOT = join(__dirname, '..', '..');

describe('edge glyphs', () => {
  const CELLS: [number, 'R' | 'D'][] = [
    [cellIndex(0, 0), 'R'],
    [cellIndex(0, 0), 'D'],
    [cellIndex(126, 127), 'R'],
    [cellIndex(127, 126), 'D'],
    [cellIndex(63, 64), 'R'],
    [cellIndex(64, 63), 'D'],
  ];

  it('S01, S02 and S03 glyph segments lie on the shared edge (R: x = cx + 1, D: y = cy + 1)', () => {
    for (const [cell, dir] of CELLS) {
      const cx = cell % 128;
      const cy = Math.floor(cell / 128);
      expect(edgeSegment(cell, dir)).toEqual(dir === 'R' ? [cx + 1, cy, cx + 1, cy + 1] : [cx, cy + 1, cx + 1, cy + 1]);
      for (const code of [EDGE_S01, EDGE_S02, EDGE_SHUTTER_CLOSED, EDGE_SHUTTER_OPEN]) {
        const g = edgeGlyph(code, cell, dir)!;
        expect(g.segments.length % 4).toBe(0);
        for (let k = 0; k < g.segments.length; k += 2) {
          const x = g.segments[k]!;
          const y = g.segments[k + 1]!;
          if (dir === 'R') {
            expect(x).toBe(cx + 1);
            expect(y).toBeGreaterThanOrEqual(cy);
            expect(y).toBeLessThanOrEqual(cy + 1);
          } else {
            expect(y).toBe(cy + 1);
            expect(x).toBeGreaterThanOrEqual(cx);
            expect(x).toBeLessThanOrEqual(cx + 1);
          }
        }
      }
    }
    // Shapes: S01 short dashes, S02 longer slots, a closed shutter one full bar, an open one two stubs. Wave 12
    // (structures-art-audio) made the counts follow the zoom (edgeMarks): at the close preset (16 px per cell, the
    // default) four dots and two slots; wave 11's five and three from 20 and 18 px per cell (here at ZOOM_MAX 32).
    const len = (code: number, z?: number) => edgeGlyph(code, cellIndex(10, 10), 'R', z)!.segments.length / 4;
    expect([len(EDGE_S01), len(EDGE_S02), len(EDGE_SHUTTER_CLOSED), len(EDGE_SHUTTER_OPEN)]).toEqual([4, 2, 1, 2]);
    expect([len(EDGE_S01, 32), len(EDGE_S02, 32), len(EDGE_SHUTTER_CLOSED, 32), len(EDGE_SHUTTER_OPEN, 32)]).toEqual([5, 3, 1, 2]);
    expect(edgeGlyph(0, cellIndex(10, 10), 'R')).toBeNull();
  });

  it('S04 chevrons point in the flow direction (EDGE_FLOW_BACK reverses them) across a base line on the edge', () => {
    for (const [cell, dir] of CELLS) {
      const [ex, ey] = edgeSegment(cell, dir);
      const across = (x: number, y: number) => (dir === 'R' ? x - ex : y - ey);
      for (const [code, sign] of [
        [EDGE_CHANNEL, 1],
        [EDGE_CHANNEL | EDGE_FLOW_BACK, -1],
      ] as const) {
        const s = edgeGlyph(code, cell, dir)!.segments;
        // Segment 0 is the base line on the edge; then two chevrons of two segments sharing their tip.
        expect(across(s[0]!, s[1]!)).toBe(0);
        expect(across(s[2]!, s[3]!)).toBe(0);
        for (let c = 4; c < s.length; c += 8) {
          const tip = [s[c + 2]!, s[c + 3]!];
          expect([s[c + 4], s[c + 5]]).toEqual(tip);
          expect(across(tip[0]!, tip[1]!)).toBeCloseTo(sign * CHEVRON_DEPTH, 12);
          expect(across(s[c]!, s[c + 1]!)).toBeCloseTo(-sign * CHEVRON_DEPTH, 12);
        }
      }
    }
  });

  it('every glyph colour is ≥ 3:1 against water, gel and sediment (UX §4.1 essential graphics)', () => {
    const subs = [DISH_COLORS.water, DISH_COLORS.gel, DISH_COLORS.sediment];
    for (const color of [EDGE_GLYPH_COLORS.membrane, EDGE_GLYPH_COLORS.sieve, EDGE_GLYPH_COLORS.shutter, EDGE_GLYPH_COLORS.channel]) {
      for (const bg of subs) expect(contrastRatio(fromInt(color), bg), `#${color.toString(16)} on ${bg.join(',')}`).toBeGreaterThanOrEqual(GRAPHIC_MIN);
    }
    for (const code of [EDGE_S01, EDGE_S02, EDGE_SHUTTER_CLOSED, EDGE_SHUTTER_OPEN, EDGE_CHANNEL]) {
      const g = edgeGlyph(code, 0, 'R')!;
      for (const bg of subs) expect(contrastRatio(fromInt(g.color), bg)).toBeGreaterThanOrEqual(GRAPHIC_MIN);
    }
  });

  it('wave 12: readable at every zoom — mark counts follow the zoom, no straight mark under 1.5 screen px, S01 dots stay apart from S02 slots', () => {
    const cell = cellIndex(10, 10);
    const marks = (code: number, z: number) => edgeGlyph(code, cell, 'R', z)!.segments.length / 4;
    const at = (z: number) => [EDGE_S01, EDGE_S02, EDGE_SHUTTER_CLOSED, EDGE_SHUTTER_OPEN].map((c) => marks(c, z));
    // Whole dish on a phone (~3 px per cell) … neighborhood (8) … close (16) … the maximum (32).
    expect(at(3)).toEqual([1, 1, 1, 2]);
    expect(at(8)).toEqual([2, 1, 1, 2]);
    expect(at(16)).toEqual([4, 2, 1, 2]);
    expect(at(32)).toEqual([5, 3, 1, 2]);
    // S04: one chevron below 12 px per cell, two from 12 (segments: the base line + 2 per chevron).
    expect([3, 8, 12, 16].map((z) => (marks(EDGE_CHANNEL, z) - 1) / 2)).toEqual([1, 1, 2, 2]);
    expect([3, 8, 12, 16].map((z) => edgeMarks(EDGE_CHANNEL, z))).toEqual([1, 1, 2, 2]);
    for (const z of [3, 4, 5, 6, 8, 12, 16, 24, 32]) {
      for (const code of [EDGE_S01, EDGE_S02, EDGE_SHUTTER_CLOSED, EDGE_SHUTTER_OPEN]) {
        const sg = edgeGlyph(code, cell, 'R', z)!.segments;
        for (let k = 0; k < sg.length; k += 4) expect(Math.hypot(sg[k + 2]! - sg[k]!, sg[k + 3]! - sg[k + 1]!) * z, `${code} at ${z}`).toBeGreaterThanOrEqual(MIN_MARK_PX - 1e-9);
      }
      // S01 marks are short with wide gaps; S02 marks long with narrow gaps (pattern, not colour).
      const one = (code: number) => {
        const sg = edgeGlyph(code, cell, 'R', z)!.segments;
        return Math.abs(sg[3]! - sg[1]!);
      };
      expect(one(EDGE_S02), `S02 slot vs S01 dot at ${z}`).toBeGreaterThan(one(EDGE_S01));
    }
    // An open shutter in the whole-dish view: two posts ACROSS the edge (x varies, y fixed for an 'R' edge).
    expect(edgeDetail(5.9)).toBe('coarse');
    expect(edgeDetail(6)).toBe('fine');
    const posts = edgeGlyph(EDGE_SHUTTER_OPEN, cell, 'R', 4)!.segments;
    for (let k = 0; k < posts.length; k += 4) {
      expect(posts[k + 1]).toBe(posts[k + 3]);
      expect(posts[k + 2]! - posts[k]!).toBeGreaterThan(0);
    }
    // The coarse chevron is larger and still points with the flow.
    expect(edgeGlyph(EDGE_CHANNEL, cell, 'R', 4)!.segments[6]! - edgeSegment(cell, 'R')[0]).toBeCloseTo(CHEVRON_DEPTH_COARSE, 12);
    expect(edgeGlyph(EDGE_CHANNEL | EDGE_FLOW_BACK, cell, 'R', 4)!.segments[6]! - edgeSegment(cell, 'R')[0]).toBeCloseTo(-CHEVRON_DEPTH_COARSE, 12);
    // The shutter keeps the boldest minimum width; every glyph at least 1.5 px; colours unchanged by the zoom.
    const minPx = (code: number) => edgeGlyph(code, cell, 'R', 4)!.minPx;
    expect(minPx(EDGE_SHUTTER_CLOSED)).toBeGreaterThan(Math.max(minPx(EDGE_S01), minPx(EDGE_S02), minPx(EDGE_CHANNEL)));
    for (const code of [EDGE_S01, EDGE_S02, EDGE_SHUTTER_CLOSED, EDGE_SHUTTER_OPEN, EDGE_CHANNEL]) {
      expect(minPx(code)).toBeGreaterThanOrEqual(1.5);
      expect(edgeGlyph(code, cell, 'R', 4)!.color).toBe(edgeGlyph(code, cell, 'R', 16)!.color);
    }
  });

  it('edgeGlyphs reads GeometryMsg.edges (codes from r/d, flow back bit included)', () => {
    const r = new Uint8Array(CELL_COUNT);
    const d = new Uint8Array(CELL_COUNT);
    r[100] = EDGE_S01;
    d[200] = EDGE_CHANNEL | EDGE_FLOW_BACK;
    const out = edgeGlyphs({ r, d, list: [{ id: 1, kind: 'S01', cell: 100, dir: 'R' }, { id: 2, kind: 'S04', cell: 200, dir: 'D', flow: -1 }] });
    expect(out.map((o) => [o.cell, o.dir])).toEqual([[100, 'R'], [200, 'D']]);
    expect(out[1]!.glyph).toEqual(edgeGlyph(EDGE_CHANNEL | EDGE_FLOW_BACK, 200, 'D'));
    expect(edgeGlyphs(null)).toEqual([]);
  });
});

describe('device frames', () => {
  it('S08 saturation 0, 0.24, 0.25, 0.99, 1.0 → quartiles 0, 0, 1, 3, 3; S09/S10 by on', () => {
    expect([0, 0.24, 0.25, 0.99, 1.0].map(resinQuartile)).toEqual([0, 0, 1, 3, 3]);
    expect([0, 0.24, 0.25, 0.5, 0.99, 1.0].map((s) => deviceFrame({ kind: 'S08' }, s))).toEqual([3, 3, 4, 5, 6, 6]);
    expect(deviceFrame({ kind: 'S09', on: false })).toBe(DEVICE_FRAMES.S09_OFF);
    expect(deviceFrame({ kind: 'S09', on: true })).toBe(DEVICE_FRAMES.S09_ON);
    expect(deviceFrame({ kind: 'S10', on: false })).toBe(DEVICE_FRAMES.S10_OFF);
    expect(deviceFrame({ kind: 'S10', on: true })).toBe(DEVICE_FRAMES.S10_ON);
    // Each frame index names its art frame.
    const name = (kind: Parameters<typeof deviceFrame>[0]['kind'], on?: boolean, sat = 0) => DEVICE_FRAME_NAMES[deviceFrame(on === undefined ? { kind } : { kind, on }, sat)];
    expect([name('S05'), name('S06'), name('S07'), name('S08', undefined, 0.6), name('S09', true), name('S10', false), name('S11'), name('S12')]).toEqual(['s05', 's06', 's07', 's08_2', 's09_on', 's10_off', 's11', 's12']);
    expect(DEVICE_FRAME_NAMES.length).toBe(DEVICE_FRAME_COUNT);
  });

  it('deviceSprites places each device at its cell centre with the snapshot saturation (by id)', () => {
    const sp = deviceSprites(
      [
        { id: 4, kind: 'S08', cell: cellIndex(10, 20), resinSelect: [] },
        { id: 5, kind: 'S09', cell: cellIndex(11, 20), on: true },
      ],
      [{ id: 4, cell: cellIndex(10, 20), saturation: 0.8 }],
    );
    expect(sp).toEqual([
      { id: 4, cell: cellIndex(10, 20), x: 10.5, y: 20.5, frame: 6 },
      { id: 5, cell: cellIndex(11, 20), x: 11.5, y: 20.5, frame: DEVICE_FRAMES.S09_ON },
    ]);
    expect(deviceSprites(undefined, undefined)).toEqual([]);
  });

  it("the 'device' tile is appended last to TILES and to the atlas, with its 13 frames (no earlier frame moved: D-0112 rule)", () => {
    expect(TILES.map((t) => t.id)).toEqual(['film', 'pellet', 'wafer', 'stain', 'device']);
    const m = JSON.parse(readFileSync(join(ROOT, 'public', 'atlas', 'manifest.json'), 'utf8')) as {
      width: number;
      height: number;
      tiles: Record<string, { size: number; frames: number; frameNames: string[] }>;
      frames: { key: string }[];
    };
    expect([m.width, m.height]).toEqual([1024, 2048]);
    expect(m.tiles.device).toEqual({ size: 16, frames: 13, frameNames: [...DEVICE_FRAME_NAMES] });
    // Appended last: the final 13 frames are the device frames, in order.
    expect(m.frames.slice(-13).map((f) => f.key)).toEqual(DEVICE_FRAME_NAMES.map((_, i) => `tile/device/${i}`));
    expect(m.frames.slice(-14, -13).map((f) => f.key)).toEqual(['tile/stain/0']);
  });
});

describe('warmth and moisture overlays', () => {
  it('packOverlay: warmth from the local array, else settings.warmth everywhere; moisture from derived.moisture; max 1; never allocates', () => {
    const w = barrierDish();
    expect(w.climate).toEqual({ warmth: null, moisture: null });
    const amb = packOverlay(w, 'warmth', null)!;
    expect(amb.max).toBe(1);
    expect(amb.data.every((v) => v === Math.fround(w.settings.warmth))).toBe(true);
    const moist = packOverlay(w, 'moisture', null)!;
    expect(moist.max).toBe(1);
    for (let i = 0; i < CELL_COUNT; i += 97) expect(moist.data[i]).toBe(Math.fround(w.derived.moisture[i]!));
    expect(w.climate).toEqual({ warmth: null, moisture: null }); // observation never allocates
    const warm = new Float64Array(CELL_COUNT).fill(0.5);
    warm[cellIndex(64, 64)] = 0.9;
    w.climate.warmth = warm;
    expect(packOverlay(w, 'warmth', null)!.data[cellIndex(64, 64)]).toBe(Math.fround(0.9));
    // A v1.0 dish packs the same way (ambient everywhere) without allocating anything.
    const old = clearWater();
    expect(packOverlay(old, 'warmth', null)!.data[0]).toBe(Math.fround(old.settings.warmth));
    expect(old.climate).toEqual({ warmth: null, moisture: null });
  });

  it('paintOverlay draws them opaque (0 is a reading) with their own ramps and legends', () => {
    expect(colormapFor('warmth')).toBe('warmth');
    expect(colormapFor('moisture')).toBe('moisture');
    expect(colormapFor('warmth', true)).toBe('simple');
    expect(legendStops('warmth')).toHaveLength(3);
    const img = { width: 128, height: 128, data: new Uint8ClampedArray(CELL_COUNT * 4) } as unknown as ImageData;
    paintOverlay(img, new Float32Array(CELL_COUNT), null, 'moisture', 1);
    expect(img.data[3]).toBe(255);
    paintOverlay(img, new Float32Array(CELL_COUNT), null, 'sugar', 1);
    expect(img.data[3]).toBe(0);
  });
});
