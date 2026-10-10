/**
 * WCAG 2.x contrast math for the contrast audit (UX §4.1, §9; P3.11 W6-08; tools/contrast-audit.ts).
 * Text needs ≥ 4.5:1 against its background, essential graphics (icons, focus ring, organisms on the
 * substrate, overlay ends) ≥ 3:1.
 */

export type Rgb = readonly [number, number, number];

/** Minimum ratios (WCAG 1.4.3 text, 1.4.11 non-text). */
export const TEXT_MIN = 4.5;
export const GRAPHIC_MIN = 3;

/** "#F2B84B" / "#f2b84b" / "f2b84b" / "#abc" → [242, 184, 75]. Throws on anything else. */
export function parseHex(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.replace(/./g, (c) => c + c);
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`not a hex colour: ${hex}`);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** 0xRRGGBB → [r, g, b]. */
export function fromInt(v: number): Rgb {
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function toHex(c: Rgb): string {
  return `#${c
    .map((v) => Math.round(v).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) … 1 (white). */
export function relativeLuminance(c: Rgb): number {
  return 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
}

/** Contrast ratio (L1 + 0.05) / (L2 + 0.05), 1 … 21, symmetric in its arguments. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** A colour drawn at `alpha` (0–1) over an opaque background (sRGB compositing, as browsers do). */
export function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  const a = Math.min(1, Math.max(0, alpha));
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
}

/**
 * A focus ring made of several concentric colours is visible against a surface when its best ring
 * reaches the graphic minimum there (WCAG 2.4.11/1.4.11: the indicator as a whole must contrast).
 */
export function bestRingRatio(rings: readonly Rgb[], surface: Rgb): number {
  return Math.max(...rings.map((r) => contrastRatio(r, surface)));
}

/** Rounded down to two decimals, so a printed ratio never overstates the measured one. */
export function formatRatio(r: number): string {
  return `${(Math.floor(r * 100) / 100).toFixed(2)}:1`;
}
