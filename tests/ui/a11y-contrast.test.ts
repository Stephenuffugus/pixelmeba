/**
 * P3.11 (UX §4.1, §9, W6-08): the contrast math (src/ui/a11y/contrast.ts) against WCAG's published
 * reference values, and the facts the focus ring and the overlay palette rest on.
 */
import { describe, expect, it } from 'vitest';
import {
  bestRingRatio,
  contrastRatio,
  formatRatio,
  fromInt,
  GRAPHIC_MIN,
  over,
  parseHex,
  relativeLuminance,
  TEXT_MIN,
  toHex,
} from '../../src/ui/a11y/contrast';
import { legendStops, RAMPS } from '../../src/render/layers';

describe('contrast math', () => {
  it('parses and prints colours', () => {
    expect(parseHex('#F2B84B')).toEqual([242, 184, 75]);
    expect(parseHex('abc')).toEqual([170, 187, 204]);
    expect(() => parseHex('#12345')).toThrow();
    expect(fromInt(0x2f6bc0)).toEqual([0x2f, 0x6b, 0xc0]);
    expect(toHex([23, 44, 53])).toBe('#172C35');
  });
  it('matches the WCAG reference values', () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10);
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 10);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBe(1);
    // #767676 on white is the classic 4.54:1 grey.
    expect(contrastRatio(parseHex('#767676'), [255, 255, 255])).toBeCloseTo(4.54, 2);
    expect(contrastRatio(parseHex('#777777'), [255, 255, 255])).toBeLessThan(TEXT_MIN);
    // Symmetric.
    expect(contrastRatio(parseHex('#256E9E'), parseHex('#F5F4EF'))).toBe(
      contrastRatio(parseHex('#F5F4EF'), parseHex('#256E9E')),
    );
  });
  it('prints ratios rounded down, so a value just under a threshold never reads as passing', () => {
    expect(formatRatio(4.4999)).toBe('4.49:1');
    expect(formatRatio(3)).toBe('3.00:1');
  });
  it('composites a translucent colour over its background', () => {
    expect(over([255, 0, 0], 0.5, [0, 0, 255])).toEqual([127.5, 0, 127.5]);
    expect(over([10, 20, 30], 1, [0, 0, 0])).toEqual([10, 20, 30]);
    expect(over([10, 20, 30], 0, [1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe('the facts the UI relies on', () => {
  const amber = parseHex('#F2B84B');
  const ink = parseHex('#172C35');
  it('the amber focus ring alone fails on the light surfaces; with the ink companion every surface passes', () => {
    for (const surface of ['#F5F4EF', '#EBE9E1', '#DEDBD0', '#D6E7E5', '#E9E1C8']) {
      expect(contrastRatio(amber, parseHex(surface))).toBeLessThan(GRAPHIC_MIN);
      expect(bestRingRatio([amber, ink], parseHex(surface))).toBeGreaterThanOrEqual(GRAPHIC_MIN);
    }
    for (const dark of ['#14252D', '#172C35', '#256E9E', '#3A4650'])
      expect(bestRingRatio([amber, ink], parseHex(dark))).toBeGreaterThanOrEqual(GRAPHIC_MIN);
  });
  it('the simplified overlay palette runs light to dark, its ends at least 3:1 apart (also at 45 % over water), and the legend shows it', () => {
    const r = RAMPS.simple;
    const l = r.map((c) => relativeLuminance(c));
    expect(l[0]).toBeGreaterThan(l[1]!);
    expect(l[1]).toBeGreaterThan(l[2]!);
    expect(contrastRatio(r[0]!, r[r.length - 1]!)).toBeGreaterThanOrEqual(GRAPHIC_MIN);
    expect(legendStops('sugar', true)).toEqual([
      'rgb(245, 244, 239)',
      'rgb(122, 146, 158)',
      'rgb(10, 20, 25)',
    ]);
    // Even as a 45 % tint over water (the default overlay opacity) its ends stay 3:1 apart.
    const water = parseHex('#D6E7E5');
    expect(contrastRatio(over(r[0]!, 0.45, water), over(r[2]!, 0.45, water))).toBeGreaterThanOrEqual(
      GRAPHIC_MIN,
    );
    expect(legendStops('ph', true)).toEqual(legendStops('oxygen', true));
    // Off by default: the overlays keep their own ramps.
    expect(legendStops('sugar')).not.toEqual(legendStops('sugar', true));
  });
});
