/**
 * Sprite definitions (ARCH §10.1, UX §6.2). Frames are authored facing East; for 4-heading sprites
 * the build derives South, West and North with lossless 90° rotations and mirroring (never runtime
 * rotation, never blur). Palettes map small indices to named colors.
 */
import { hexToRgba } from './palette';
import type { Px } from './px';

export type AnimName = 'move' | 'idle' | 'feed' | 'reproduction' | 'stress' | 'death';
export const HEADING_NAMES = ['e', 's', 'w', 'n'] as const;

export interface AnimationDef {
  readonly frames: readonly Px[];
  readonly durationMs: number;
  readonly loop: boolean;
  /** Frame index shown instead of animating when reduced motion is on. */
  readonly reducedMotionFrame: number;
}

export interface SpriteDef {
  readonly assetId: string;
  readonly speciesId: string;
  readonly size: 16 | 32 | 48;
  readonly headings: 1 | 4;
  /** Index 0 is transparent; the rest are hex colors. */
  readonly palette: readonly string[];
  readonly animations: Readonly<Partial<Record<AnimName, AnimationDef>>>;
  /** Required animation names for this sprite's class (validated by the build). */
  readonly required: readonly AnimName[];
}

export function orient(frame: Px, heading: number): Px {
  switch (heading) {
    case 0:
      return frame;
    case 1:
      return frame.rotateCW();
    case 2:
      return frame.mirrorX();
    case 3:
      return frame.mirrorX().rotateCW();
    default:
      throw new Error(`bad heading ${heading}`);
  }
}

/** RGBA pixels of a frame using the sprite palette. */
export function frameRgba(def: SpriteDef, frame: Px): Uint8Array {
  return paletteRgba(def.palette, frame, def.assetId);
}

/** RGBA pixels of a frame through a palette (index 0 transparent); `owner` names it in errors. */
export function paletteRgba(palette: readonly string[], frame: Px, owner: string): Uint8Array {
  const out = new Uint8Array(frame.w * frame.h * 4);
  const cache = palette.map((hex, i) => (i === 0 ? [0, 0, 0, 0] : hexToRgba(hex)));
  for (let i = 0; i < frame.data.length; i++) {
    const idx = frame.data[i]!;
    if (idx === 0) continue;
    const c = cache[idx];
    if (!c) throw new Error(`${owner}: palette index ${idx} missing`);
    out.set(c, i * 4);
  }
  return out;
}

/** Required frame counts (UX §6.2 / D01 §4). */
export const SMALL_REQUIRED: Readonly<Partial<Record<AnimName, number>>> = { move: 4, reproduction: 4, stress: 2, death: 3 };
export const SMALL_STATIC_REQUIRED: Readonly<Partial<Record<AnimName, number>>> = { idle: 4, reproduction: 4, stress: 2, death: 3 };
export const LARGE_REQUIRED: Readonly<Partial<Record<AnimName, number>>> = { move: 6, feed: 4, reproduction: 4, stress: 2, death: 4 };
