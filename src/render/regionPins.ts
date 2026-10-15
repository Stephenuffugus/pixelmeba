/**
 * Phase 5 wave 14 (P5.7 "region pins"; D02 631; UX §6.1, §7.3, §9; D-0128): numbered pins at each region
 * anchor of the dish's OWN recorded habitat (DishInfo.regions, read by host.ts info() from
 * world.content.habitat.regions, never from this build's registry), drawn by the renderer as a static overlay.
 * A pin exists only where the world's habitat records a region (CLAUDE.md "every visible feature maps to real
 * state"); a dish whose habitat records none has no pins.
 *
 * PURE: no Pixi, no time input, no rng. The renderer (renderer.ts setRegionPins / drawRegionPins) only fills and
 * strokes what regionPinModel returns, and redraws when the list changes or the zoom moves by more than a quarter
 * (regionPinsNeedRedraw; the D-0120 edge-glyph rule), never per tick. Nothing moves or blinks, so reduced motion
 * needs nothing.
 *
 * The pin: a map-pin teardrop (a round head over a point that rests on the anchor cell's centre) with a dark
 * companion stroke under a light fill, and the region's 1-based number as a dark 3 × 5 pixel digit on the head.
 * Digits, not letters: the player's region probes use the letters A–F (renderer.ts PROBE_GLYPHS). Shape and digit
 * carry the meaning, never colour (no colour coding by region; reads in grayscale). Pins are content, not probes:
 * they never count against the six probe regions.
 */

/** One region as DishInfo.regions carries it (only what the pin needs). */
export interface RegionPinInput {
  /** 1-based position of the region in the habitat record (1…6). */
  readonly number: number;
  /** The region's anchor cell (x, y) in cell indices. */
  readonly anchor: readonly [number, number];
}

/** One pin in world units (cells). */
export interface RegionPin {
  readonly number: number;
  /** The pin's point: the anchor cell's centre. */
  readonly cx: number;
  readonly cy: number;
  /** The digit's 3 × 5 bitmap (rows top to bottom, bit 2 = left column; the PROBE_GLYPHS convention). */
  readonly glyph: readonly number[];
  /** The pin's height, point to top of the head (world units: REGION_PIN_SCREEN.height / zoom). */
  readonly size: number;
  /** The head's centre and radius (world units). */
  readonly headX: number;
  readonly headY: number;
  readonly headR: number;
  /** Top-left of the digit and the side of one digit pixel (world units). */
  readonly glyphX: number;
  readonly glyphY: number;
  readonly dot: number;
  /** The teardrop outline as a flat [x, y, …] polygon (world units), starting at the point. */
  readonly outline: readonly number[];
}

/**
 * The pin in screen pixels at any zoom. A 3 × 5 digit at one screen pixel per dot is 5 px tall, too small to read
 * on a phone, so each dot is 2 px (a 6 × 10 px digit; the probe letters use 3 px) on a head of radius 7 px, and the
 * whole pin is about 19 px tall (PROPOSED DECISION in the region-pins report: the task asked "about 12 px").
 */
export const REGION_PIN_SCREEN = { dot: 2, headR: 7, height: 19 } as const;

/** 3 × 5 pixel digits 1–6 (rows top to bottom, bit 2 = left column). None equals a probe letter A–F. */
export const REGION_DIGIT_GLYPHS: Readonly<Record<number, readonly number[]>> = {
  1: [2, 6, 2, 2, 7],
  2: [6, 1, 2, 4, 7],
  3: [6, 1, 2, 1, 6],
  4: [5, 5, 7, 1, 1],
  5: [7, 4, 6, 1, 6],
  6: [3, 4, 7, 5, 7],
};

/** Habitat records hold at most six regions (D-0128). */
export const REGION_PIN_MAX = 6;

/** Colours (the renderer's dark companion and light fill, as drawProbes and drawLineage use). */
export const REGION_PIN_COLORS = { stroke: 0x172c35, fill: 0xf5f4ef, digit: 0x172c35 } as const;

const ARC_STEPS = 18;

/** The teardrop: the point at (cx, cy), the head circle (hx, hy, r) above it, outline from the point round the head. */
function teardrop(cx: number, cy: number, hx: number, hy: number, r: number): number[] {
  const d = cy - hy;
  const spread = Math.acos(Math.min(1, r / d)); // angle between the head-to-point line and each tangent point
  const a1 = Math.PI / 2 - spread; // right tangent (y down: +π/2 points at the tip)
  const a2 = Math.PI / 2 + spread - 2 * Math.PI; // left tangent, reached the long way round over the top
  const out = [cx, cy];
  for (let k = 0; k <= ARC_STEPS; k++) {
    const a = a1 + ((a2 - a1) * k) / ARC_STEPS;
    out.push(hx + r * Math.cos(a), hy + r * Math.sin(a));
  }
  return out;
}

/**
 * The pins for `regions` at `zoom` (screen px per cell). A region numbered outside 1…6 has no digit and gets no pin
 * (the habitat schema allows at most six). Pure: the same inputs give equal outputs.
 */
export function regionPinModel(regions: readonly RegionPinInput[], zoom: number): RegionPin[] {
  const px = 1 / Math.max(1e-6, zoom);
  const size = REGION_PIN_SCREEN.height * px;
  const headR = REGION_PIN_SCREEN.headR * px;
  const dot = REGION_PIN_SCREEN.dot * px;
  const out: RegionPin[] = [];
  for (const r of regions) {
    const glyph = REGION_DIGIT_GLYPHS[r.number];
    if (!glyph) continue;
    const cx = r.anchor[0] + 0.5;
    const cy = r.anchor[1] + 0.5;
    const headX = cx;
    const headY = cy - size + headR;
    out.push({
      number: r.number,
      cx,
      cy,
      glyph,
      size,
      headX,
      headY,
      headR,
      glyphX: headX - 1.5 * dot,
      glyphY: headY - 2.5 * dot,
      dot,
      outline: teardrop(cx, cy, headX, headY, headR),
    });
  }
  return out;
}

/**
 * The drawing calls the pins need (a PixiJS Graphics satisfies it; tests pass a recorder). Structural, so this
 * file never imports PixiJS.
 */
export interface RegionPinSurface {
  clear(): unknown;
  poly(points: number[], close?: boolean): RegionPinSurface;
  stroke(style: { width: number; color: number; alpha: number; join: 'round' }): RegionPinSurface;
  fill(style: { color: number; alpha: number }): RegionPinSurface;
  rect(x: number, y: number, w: number, h: number): RegionPinSurface;
}

/**
 * Clear `g` and draw the pins for `regions` at `zoom` (renderer.ts drawRegionPins calls only this): per pin, the
 * teardrop outline (dark companion stroke under the light fill), then its digit's dots filled dark. Returns the
 * number of pins drawn (the renderer's regionPinsDrawn).
 */
export function drawRegionPinsInto(g: RegionPinSurface, regions: readonly RegionPinInput[], zoom: number): number {
  g.clear();
  const z = Math.max(1e-6, zoom);
  const pins = regionPinModel(regions, z);
  for (const p of pins) {
    g.poly([...p.outline], true)
      .stroke({ width: 3 / z, color: REGION_PIN_COLORS.stroke, alpha: 0.9, join: 'round' })
      .fill({ color: REGION_PIN_COLORS.fill, alpha: 1 });
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) if (p.glyph[row]! & (4 >> col)) g.rect(p.glyphX + col * p.dot, p.glyphY + row * p.dot, p.dot, p.dot);
    }
    g.fill({ color: REGION_PIN_COLORS.digit, alpha: 1 });
  }
  return pins.length;
}

/** Redraw when the zoom moved by more than a quarter since the pins were drawn (NaN = nothing drawn). */
export function regionPinsNeedRedraw(drawnZoom: number, zoom: number): boolean {
  return !Number.isNaN(drawnZoom) && Math.abs(zoom / drawnZoom - 1) > 0.25;
}
