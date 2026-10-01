/**
 * Shared helpers for the Phase 3 sprites (same conventions as sprites/core.ts): index 0 is
 * transparent, index 1 is the outline, remains colours dissolve with a deterministic erode.
 */
import { Px } from '../px';
import type { AnimationDef } from '../sprite';

export const O = 1; // outline index in every Phase 3 palette

export function anim(frames: readonly Px[], durationMs: number, loop: boolean, reducedMotionFrame = 0): AnimationDef {
  return { frames, durationMs, loop, reducedMotionFrame };
}

/** Recolor a body to remains (outline → remainsDark, everything else → remains) and erode it. */
export function deathFrames(base: Px, fractions: readonly number[], remains: number, remainsDark: number, salt: number): Px[] {
  return fractions.map((f, k) => {
    const p = base.clone();
    for (let i = 0; i < p.data.length; i++) {
      const v = p.data[i]!;
      if (v === 0) continue;
      p.data[i] = v === O ? remainsDark : remains;
    }
    return p.erode(f, salt + k * 7);
  });
}

/**
 * Stress: the body colours turn to a dull gray and a checker of dark specks appears, so stress
 * reads without colour. `body` lists the indices to dull; specks land only on body pixels.
 */
export function stressFrames(base: Px, body: readonly number[], dull: number, speck: number, step = 2): Px[] {
  return [0, 1].map((k) => {
    const p = base.clone();
    for (let i = 0; i < p.data.length; i++) if (body.includes(p.data[i]!)) p.data[i] = dull;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if ((x + y + k) % (step * 2) === 0 && p.get(x, y) === dull) p.set(x, y, speck);
    return p;
  });
}

/** Points along a quadratic Bézier from a through control c to b (n segments). */
export function curve(a: readonly [number, number], c: readonly [number, number], b: readonly [number, number], n = 12): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

/** Canvas of a given size. */
export const canvas = (size: number): Px => new Px(size, size);
