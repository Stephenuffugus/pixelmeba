/**
 * Phase 5 structure layers (wave 11 structure-render-worker; UX §4.1, §6.5, §7.3; CT §4; D-0119):
 * src/render/structureLayer.ts edge glyphs lie on the shared cell edge (R and D, at the grid's inner bounds),
 * S04 chevrons point by flow (EDGE_FLOW_BACK), every glyph colour is ≥ 3:1 against water, gel and sediment;
 * device frame picks (S08 saturation quartiles, S09/S10 on/off) and the 'device' atlas tile appended last
 * with 13 frames; the warmth and moisture overlays (packOverlay reads, never allocates; max 1; painted
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
import { CHEVRON_DEPTH, DEVICE_FRAME_COUNT, DEVICE_FRAMES, deviceFrame, deviceSprites, EDGE_GLYPH_COLORS, edgeGlyph, edgeGlyphs, edgeSegment, resinQuartile } from '../../src/render/structureLayer';
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
    // Shapes: S01 five short dashes, S02 three longer slots, a closed shutter one full bar, an open one two stubs.
    const len = (code: number) => edgeGlyph(code, cellIndex(10, 10), 'R')!.segments.length / 4;
    expect([len(EDGE_S01), len(EDGE_S02), len(EDGE_SHUTTER_CLOSED), len(EDGE_SHUTTER_OPEN)]).toEqual([5, 3, 1, 2]);
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
