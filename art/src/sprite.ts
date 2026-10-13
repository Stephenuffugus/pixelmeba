/**
 * Sprite definitions (ARCH §10.1, UX §6.2). Frames are authored facing East; for 4-heading sprites
 * the build derives South, West and North with lossless 90° rotations and mirroring (never runtime
 * rotation, never blur). Palettes map small indices to named colors.
 */
import { hexToRgba } from './palette';
import type { Px } from './px';

/**
 * Animation (or frame-set) names. Organisms use move/idle, feed, reproduction, stress and death.
 * Fungi (form 'fungus', ARCH §10.1) use `mask` (16 connection-mask tiles: frame index = mask, bit
 * order N=1, E=2, S=4, W=8), `decaying` (the same 16 masks for a dying segment), `tip` and `bud`
 * (overlays drawn over the segment's mask tile at its center), F02's `pulse` (a transfer overlay),
 * and `idle` (one-frame thumbnail). Viruses (form 'virus', UX §6.2) use `glyph` (the inspection
 * glyph) and `idle` (one-frame thumbnail); their density overlay is a field render, not an atlas frame.
 *
 * Phase 5 (ARCH §10.1 required frame counts; P5.7) adds two state-indexed sets, each one name for one
 * recorded state machine rather than one name per state:
 *   - `dormant`: exactly 3 still poses, Preparing, Resting, Waking (frame index = lifeState − 1), for a
 *     species with native DORMANCY (B12's seam forming / folded / unfolding, F04's lone ringed spore
 *     speck). It is the native-rester analogue of the resting_seam layer's three frames: the renderer
 *     holds a still frame in these states (src/render/features.ts bodyFrameIndex), never a loop.
 *   - `trap`: exactly 3 overlays, Open, Holding, Cooldown (the recorded trap state), for a species with
 *     native TRAP (F03). Drawn over the trapping segment's mask tile at its center, like tip and bud.
 */
export type AnimName = 'move' | 'idle' | 'feed' | 'reproduction' | 'stress' | 'death' | 'mask' | 'decaying' | 'tip' | 'bud' | 'pulse' | 'glyph' | 'dormant' | 'trap';
/** What a sprite draws: one organism body, a fungal segment tile set, or a virus glyph. */
export type SpriteForm = 'organism' | 'fungus' | 'virus';
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
  /** Defaults to 'organism' (sized by `size`: small 16, large 32+). */
  readonly form?: SpriteForm;
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
/** Fungi (ARCH §10.1): 16 mask tiles, 16 decaying tiles (by mask), tip, bud, one thumbnail frame. */
export const FUNGUS_REQUIRED: Readonly<Partial<Record<AnimName, number>>> = { mask: 16, decaying: 16, tip: 1, bud: 1, idle: 1 };
/** Viruses (UX §6.2): the inspection glyph and one thumbnail frame. */
export const VIRUS_REQUIRED: Readonly<Partial<Record<AnimName, number>>> = { glyph: 1, idle: 1 };

/**
 * Frame sets a native ability requires (ARCH §10.1 "dormancy prepare/rest/wake; trap
 * open/holding/cooldown"): exactly this many frames, checked by tools/art-build.ts for every sprite
 * whose species record lists the ability, enabled or not.
 */
export const NATIVE_ABILITY_FRAMES: Readonly<Record<string, { readonly anim: AnimName; readonly frames: number; readonly states: string }>> = {
  DORMANCY: { anim: 'dormant', frames: 3, states: 'Preparing, Resting, Waking' },
  TRAP: { anim: 'trap', frames: 3, states: 'Open, Holding, Cooldown' },
};

/** Connection-mask bits for fungal tiles (the frame index of `mask` and `decaying`). */
export const MASK_N = 1;
export const MASK_E = 2;
export const MASK_S = 4;
export const MASK_W = 8;
