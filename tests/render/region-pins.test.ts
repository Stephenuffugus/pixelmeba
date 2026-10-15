/**
 * Phase 5 wave 14 (P5.7 region pins; D-0128; src/render/regionPins.ts):
 *   - the model: one pin per region, numbered as given, its point on the anchor cell's centre, sized by 1 / zoom so
 *     it keeps its screen size; nothing for an empty list; a pure function of its inputs (no time input);
 *   - six distinct digit glyphs 1–6, none equal to a probe letter A–F (renderer.ts PROBE_GLYPHS, read from source);
 *   - the layer: the renderer's constructor adds the pins Graphics after effects and before selectionG (above the
 *     links, below the selection ring and every layer appended on first use); no test constructs the PixiJS renderer,
 *     so the order is pinned at source level (the gate-tracer test's readFileSync pattern);
 *   - the redraw rule: only when the zoom moved by more than a quarter (never per tick), and the frame loop asks only
 *     that rule.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  drawRegionPinsInto,
  REGION_DIGIT_GLYPHS,
  REGION_PIN_COLORS,
  REGION_PIN_SCREEN,
  regionPinModel,
  regionPinsNeedRedraw,
  type RegionPinInput,
  type RegionPinSurface,
} from '../../src/render/regionPins';

const ROOT = join(__dirname, '..', '..');
const RENDERER = readFileSync(join(ROOT, 'src', 'render', 'renderer.ts'), 'utf8');
const DISH_SCREEN = readFileSync(join(ROOT, 'src', 'ui', 'views', 'DishScreen.tsx'), 'utf8');

const THREE: RegionPinInput[] = [
  { number: 1, anchor: [40, 64] },
  { number: 2, anchor: [88, 64] },
  { number: 3, anchor: [64, 63] },
];

/** The probe letters A–F as renderer.ts declares them (PROBE_GLYPHS). */
function probeLetterGlyphs(): number[][] {
  const block = /PROBE_GLYPHS[^=]*=\s*\{([\s\S]*?)\};/.exec(RENDERER);
  expect(block).not.toBeNull();
  const out = [...block![1]!.matchAll(/([A-F]):\s*\[([\d,\s]+)\]/g)].map((m) => m[2]!.split(',').map((v) => Number(v.trim())));
  expect(out).toHaveLength(6);
  return out;
}

describe('regionPinModel', () => {
  it('numbers each region, puts its point on the anchor cell centre and sizes it by 1 / zoom', () => {
    const at8 = regionPinModel(THREE, 8);
    expect(at8.map((p) => p.number)).toEqual([1, 2, 3]);
    expect(at8.map((p) => [p.cx, p.cy])).toEqual([
      [40.5, 64.5],
      [88.5, 64.5],
      [64.5, 63.5],
    ]);
    expect(at8[0]!.size).toBeCloseTo(REGION_PIN_SCREEN.height / 8, 12);
    const at16 = regionPinModel(THREE, 16);
    for (let k = 0; k < 3; k++) {
      expect(at16[k]!.size * 16).toBeCloseTo(at8[k]!.size * 8, 12); // same screen size at both zooms
      expect(at16[k]!.size).toBeCloseTo(at8[k]!.size / 2, 12);
      expect(at16[k]!.dot).toBeCloseTo(at8[k]!.dot / 2, 12);
    }
    for (const p of at8) {
      // The outline starts at the point; the head is above it and holds the whole 3 × 5 digit.
      expect([p.outline[0], p.outline[1]]).toEqual([p.cx, p.cy]);
      expect(p.headY).toBeLessThan(p.cy);
      const corners: [number, number][] = [
        [p.glyphX, p.glyphY],
        [p.glyphX + 3 * p.dot, p.glyphY + 5 * p.dot],
      ];
      for (const [x, y] of corners) expect(Math.hypot(x - p.headX, y - p.headY)).toBeLessThan(p.headR);
      // Every outline point lies within the pin's height above the point.
      for (let k = 1; k < p.outline.length; k += 2) expect(p.outline[k]!).toBeGreaterThanOrEqual(p.cy - p.size - 1e-9);
    }
  });

  it('gives each pin its own digit glyph', () => {
    const pins = regionPinModel(THREE, 8);
    expect(pins.map((p) => p.glyph)).toEqual([REGION_DIGIT_GLYPHS[1], REGION_DIGIT_GLYPHS[2], REGION_DIGIT_GLYPHS[3]]);
  });

  it('an empty list has no pins, and a number outside 1–6 gets none', () => {
    expect(regionPinModel([], 8)).toEqual([]);
    expect(regionPinModel([{ number: 7, anchor: [1, 1] }], 8)).toEqual([]);
  });

  it('is a pure function of its inputs (two calls equal; no time input)', () => {
    expect(regionPinModel(THREE, 11.5)).toEqual(regionPinModel(THREE, 11.5));
    expect(regionPinModel.length).toBe(2);
    const src = readFileSync(join(ROOT, 'src', 'render', 'regionPins.ts'), 'utf8');
    expect(src).not.toMatch(/\bfrom 'pixi\.js'|Math\.random|Date\.|performance\.now/);
  });
});

describe('digit glyphs', () => {
  it('six distinct 3 × 5 digits 1–6, none equal to a probe letter A–F', () => {
    const digits = [1, 2, 3, 4, 5, 6].map((n) => REGION_DIGIT_GLYPHS[n]!);
    for (const g of digits) {
      expect(g).toHaveLength(5);
      for (const row of g) expect(row >= 0 && row <= 7 && Number.isInteger(row)).toBe(true);
    }
    expect(new Set(digits.map((g) => g.join(','))).size).toBe(6);
    const letters = new Set(probeLetterGlyphs().map((g) => g.join(',')));
    for (const g of digits) expect(letters.has(g.join(','))).toBe(false);
  });
});

describe('the pins layer and its redraw rule', () => {
  it('is added at construction between effects and selectionG (above links; below selection and later layers)', () => {
    const call = /this\.world\.addChild\(\s*([\s\S]*?)\);/.exec(RENDERER);
    expect(call).not.toBeNull();
    const children = call![1]!.split(',').map((c) => c.trim()).filter(Boolean);
    const at = (name: string) => children.indexOf(`this.${name}`);
    expect(at('regionPinsG')).toBeGreaterThan(at('linksG'));
    expect(at('regionPinsG')).toBe(at('effects') + 1);
    expect(at('selectionG')).toBe(at('regionPinsG') + 1);
    expect(at('regionPinsG')).toBeGreaterThan(at('badgesG'));
    // Created at construction, never appended on first use.
    expect(RENDERER).toMatch(/private readonly regionPinsG = new Graphics\(\);/);
    expect(RENDERER.match(/addChild\(this\.regionPinsG\)/g)).toBeNull();
  });

  it('redraws only when the zoom moved by more than a quarter; never with nothing drawn', () => {
    expect(regionPinsNeedRedraw(Number.NaN, 4)).toBe(false);
    expect(regionPinsNeedRedraw(8, 8)).toBe(false);
    expect(regionPinsNeedRedraw(8, 9.9)).toBe(false);
    expect(regionPinsNeedRedraw(8, 10.1)).toBe(true);
    expect(regionPinsNeedRedraw(8, 5.9)).toBe(true);
    // The frame loop asks only that rule; setRegionPins redraws only when the list changed.
    expect(RENDERER).toMatch(/if \(regionPinsNeedRedraw\(this\.regionPinsZoom, cam\.zoom\)\) this\.drawRegionPins\(\);/);
    expect(RENDERER.match(/this\.drawRegionPins\(\)/g)).toHaveLength(2);
  });

  it('six pins: the model for a redraw is cheap (indicative)', () => {
    const six: RegionPinInput[] = [1, 2, 3, 4, 5, 6].map((n) => ({ number: n, anchor: [20 + 14 * n, 64] as const }));
    const t0 = performance.now();
    for (let k = 0; k < 1000; k++) regionPinModel(six, 4 + (k % 20));
    const per = (performance.now() - t0) / 1000;
    expect(regionPinModel(six, 8)).toHaveLength(6);
    expect(per).toBeLessThan(5); // ms per six-pin model (loose; machine shared)
    console.log(`region pins: six-pin model ${(per * 1000).toFixed(1)} µs per redraw`);
  });
});

/** A drawing surface that records every call (the PixiJS Graphics calls the pins make). */
function recorder(): { g: RegionPinSurface; calls: { op: string; args: unknown[] }[] } {
  const calls: { op: string; args: unknown[] }[] = [];
  const g: RegionPinSurface = {
    clear: () => calls.push({ op: 'clear', args: [] }),
    poly: (...args) => (calls.push({ op: 'poly', args }), g),
    stroke: (...args) => (calls.push({ op: 'stroke', args }), g),
    fill: (...args) => (calls.push({ op: 'fill', args }), g),
    rect: (...args) => (calls.push({ op: 'rect', args }), g),
  };
  return { g, calls };
}

describe('a pin is drawn (fix-minors item 1)', () => {
  it('drawRegionPinsInto clears, then draws one outlined, filled teardrop and its digit per region, and returns the count', () => {
    const { g, calls } = recorder();
    expect(drawRegionPinsInto(g, THREE, 8)).toBe(3);
    expect(calls[0]!.op).toBe('clear');
    expect(calls.filter((c) => c.op === 'clear')).toHaveLength(1);
    const polys = calls.filter((c) => c.op === 'poly');
    const pins = regionPinModel(THREE, 8);
    expect(polys.map((c) => c.args[0])).toEqual(pins.map((p) => [...p.outline]));
    expect(calls.filter((c) => c.op === 'stroke').map((c) => (c.args[0] as { color: number }).color)).toEqual([REGION_PIN_COLORS.stroke, REGION_PIN_COLORS.stroke, REGION_PIN_COLORS.stroke]);
    // Two fills per pin: the light head, then the dark digit.
    expect(calls.filter((c) => c.op === 'fill').map((c) => (c.args[0] as { color: number }).color)).toEqual(
      pins.flatMap(() => [REGION_PIN_COLORS.fill, REGION_PIN_COLORS.digit]),
    );
    // Each digit's lit dots: one rect per set bit of the glyph.
    const dots = pins.reduce((n, p) => n + p.glyph.reduce((m, row) => m + ((row >> 2) & 1) + ((row >> 1) & 1) + (row & 1), 0), 0);
    expect(calls.filter((c) => c.op === 'rect')).toHaveLength(dots);
  });

  it('no regions: the layer is cleared and nothing is drawn (count 0)', () => {
    const { g, calls } = recorder();
    expect(drawRegionPinsInto(g, [], 8)).toBe(0);
    expect(calls.map((c) => c.op)).toEqual(['clear']);
  });

  it("the renderer's redraw draws through drawRegionPinsInto into its pins layer and exposes the drawn count", () => {
    const body = /private drawRegionPins\(\): void \{([\s\S]*?)\n {2}\}/.exec(RENDERER);
    expect(body).not.toBeNull();
    expect(body![1]!).toMatch(/this\.regionPinsDrawnCount = drawRegionPinsInto\(this\.regionPinsG, this\.regionPins, z\);/);
    expect(body![1]!).toMatch(/this\.regionPinsZoom = this\.regionPinsDrawnCount > 0 \? z : Number\.NaN;/);
    expect(RENDERER).toMatch(/get regionPinsDrawn\(\): number \{\s*return this\.regionPinsDrawnCount;\s*\}/);
    // setRegionPins stores the list and redraws it.
    const set = /setRegionPins\(pins: readonly RegionPinInput\[\]\): void \{([\s\S]*?)\n {2}\}/.exec(RENDERER);
    expect(set).not.toBeNull();
    expect(set![1]!).toMatch(/this\.regionPins = pins\.map/);
    expect(set![1]!).toMatch(/this\.drawRegionPins\(\)/);
  });

  it("DishScreen passes the dish's own regions to the renderer's pin setter in an effect, and clears them on unmount", () => {
    const effect = /useEffect\(\(\) => \{\s*if \(!ready\) return;\s*getRenderer\(\)\?\.setRegionPins\(dishInfo\.value\?\.regions \?\? \[\]\);\s*\}, \[([^\]]*)\]\);/.exec(DISH_SCREEN);
    expect(effect, 'the region pin effect').not.toBeNull();
    // It reruns when the renderer is ready, the dish changes or its regions change.
    expect(effect![1]!.split(',').map((d) => d.trim())).toEqual(['ready', 'info?.dishId', 'regionKey']);
    expect(DISH_SCREEN).toMatch(/const regionKey = JSON\.stringify\(info\?\.regions \?\? \[\]\);/);
    expect(DISH_SCREEN).toMatch(/useEffect\(\(\) => \(\) => getRenderer\(\)\?\.setRegionPins\(\[\]\), \[\]\);/);
  });
});
