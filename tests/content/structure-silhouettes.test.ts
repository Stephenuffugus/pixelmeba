/**
 * Phase 5 wave 12 (structures-art-audio): the 13 'device' tile frames (art/src/tiles/structures.ts; UX §6.1
 * "distinguishable by silhouette and pattern in grayscale", §6.5 "equipment props as small readable lab pieces
 * with neutral outlines"; CT §4 S08 "darkens as saturated"). The silhouettes.test.ts method: Rec. 709 gray, a
 * pixel's luminance "differs" at ≥ 32 of 255.
 *   - every pair of the 13 frames differs in alpha or luminance on ≥ 12 % of the union of their pixels;
 *   - each On frame differs from its Off frame in ALPHA on ≥ 6 pixels (a shape, never colour alone);
 *   - the S08 quartiles' mean luminance strictly decreases and their fill line rises (empty, a quarter, a half,
 *     three quarters of the inside);
 *   - s11 (the shade roof) is an outline: ≥ 80 % of its interior is transparent, so organisms beneath show.
 */
import { describe, expect, it } from 'vitest';
import { hexToRgba, P } from '../../art/src/palette';
import { DEVICE, DEVICE_FRAME_NAMES, RESIN_FILL_ROWS } from '../../art/src/tiles/structures';
import type { Px } from '../../art/src/px';

const MIN_FRACTION = 0.12;
const LUMA_STEP = 32;

function gray(f: Px): Int16Array {
  const out = new Int16Array(f.w * f.h).fill(-1);
  for (let i = 0; i < f.data.length; i++) {
    const idx = f.data[i]!;
    if (idx === 0) continue;
    const [r, g, b] = hexToRgba(DEVICE.palette[idx]!);
    out[i] = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }
  return out;
}

const frame = (name: (typeof DEVICE_FRAME_NAMES)[number]): Px => DEVICE.frames[DEVICE_FRAME_NAMES.indexOf(name)]!;

describe('device tile frames (grayscale silhouettes)', () => {
  it('13 frames, in wave 11 order (D-0120)', () => {
    expect(DEVICE.frames.length).toBe(13);
    expect([...DEVICE.frameNames]).toEqual(['s05', 's06', 's07', 's08_0', 's08_1', 's08_2', 's08_3', 's09_off', 's09_on', 's10_off', 's10_on', 's11', 's12']);
  });

  it('every pair differs in alpha or luminance on ≥ 12 % of union pixels', () => {
    const g = DEVICE.frames.map(gray);
    const bad: string[] = [];
    for (let i = 0; i < g.length; i++)
      for (let j = i + 1; j < g.length; j++) {
        let union = 0;
        let diff = 0;
        for (let k = 0; k < g[i]!.length; k++) {
          const a = g[i]![k]!;
          const b = g[j]![k]!;
          if (a < 0 && b < 0) continue;
          union++;
          if (a < 0 || b < 0 || Math.abs(a - b) >= LUMA_STEP) diff++;
        }
        if (diff / union < MIN_FRACTION) bad.push(`${DEVICE.frameNames[i]}|${DEVICE.frameNames[j]} ${((100 * diff) / union).toFixed(1)} %`);
      }
    expect(bad).toEqual([]);
  });

  it('each On frame differs from its Off frame in ALPHA on ≥ 6 pixels (shape, not only colour)', () => {
    for (const [off, on] of [
      ['s09_off', 's09_on'],
      ['s10_off', 's10_on'],
    ] as const) {
      const a = frame(off).data;
      const b = frame(on).data;
      let n = 0;
      for (let k = 0; k < a.length; k++) if ((a[k] === 0) !== (b[k] === 0)) n++;
      expect(n, `${off}/${on}`).toBeGreaterThanOrEqual(6);
    }
  });

  it('S08: mean luminance strictly decreases by quartile and the fill line rises', () => {
    const q = ['s08_0', 's08_1', 's08_2', 's08_3'] as const;
    const mean = q.map((n) => {
      const g = gray(frame(n));
      let s = 0;
      let c = 0;
      for (const v of g)
        if (v >= 0) {
          s += v;
          c++;
        }
      return s / c;
    });
    for (let i = 1; i < 4; i++) expect(mean[i]!, `${q[i]} darker than ${q[i - 1]}`).toBeLessThan(mean[i - 1]!);
    // The fill line: the topmost inside row (y 4–11, x 4–11) painted entirely in the light fill-line colour.
    const LIGHT = 4; // palette index of P.deviceLight
    expect(DEVICE.palette[LIGHT]).toBe(P.deviceLight);
    const lineRow = (p: Px): number | null => {
      for (let y = 4; y <= 11; y++) {
        let all = true;
        for (let x = 4; x <= 11; x++) if (p.get(x, y) !== LIGHT) all = false;
        if (all) return y;
      }
      return null;
    };
    const rows = q.map((n) => lineRow(frame(n)));
    expect(rows[0]).toBeNull(); // empty
    expect(rows.slice(1)).toEqual(RESIN_FILL_ROWS.slice(1).map((r) => 12 - r));
    for (let i = 2; i < 4; i++) expect(rows[i]!).toBeLessThan(rows[i - 1]!);
    expect([...RESIN_FILL_ROWS]).toEqual([0, 2, 4, 6]);
  });

  it('s11 is an outline: ≥ 80 % of its interior is transparent', () => {
    const p = frame('s11');
    const b = p.bounds()!;
    let inside = 0;
    let clear = 0;
    for (let y = b.y0 + 1; y < b.y1; y++)
      for (let x = b.x0 + 1; x < b.x1; x++) {
        inside++;
        if (p.get(x, y) === 0) clear++;
      }
    expect(clear / inside).toBeGreaterThanOrEqual(0.8);
  });

  it('every frame keeps a neutral ink outline (palette index 1, P.deviceInk) on its edge pixels', () => {
    for (const [i, f] of DEVICE.frames.entries()) {
      let ink = 0;
      for (let k = 0; k < f.data.length; k++) if (f.data[k] === 1) ink++;
      expect(ink, DEVICE.frameNames[i]).toBeGreaterThan(10);
    }
  });
});
