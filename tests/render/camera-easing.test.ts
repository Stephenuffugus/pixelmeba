/**
 * P4.13 camera easing (src/render/camera.ts; UX §7.4 "camera easing | instant" in reduced motion; UX §7.1
 * "Camera never jumps on its own"). Player-initiated preset moves ease over 220 ms (ease-out cubic);
 * wheel, pinch and drag stay direct; reduced motion is instant; a new move replaces an unfinished one.
 */
import { describe, expect, it } from 'vitest';
import { Camera, CAMERA_EASE_MS, easeOutCubic, easePose, type CameraPose } from '../../src/render/camera';

function cam(clock: { t: number } | null, reduced = false): Camera {
  const c = new Camera();
  c.setViewport(800, 600);
  c.fit(true);
  if (clock) c.clock = () => clock.t;
  c.reducedMotion = reduced;
  return c;
}

const pose = (c: Camera): CameraPose => ({ cx: c.cx, cy: c.cy, zoom: c.zoom });

describe('camera easing (P4.13)', () => {
  it('the pure step: endpoints exact, monotonic, ease-out', () => {
    const from = { cx: 10, cy: 20, zoom: 4 };
    const to = { cx: 70, cy: -5, zoom: 16 };
    expect(easePose(from, to, 0)).toEqual(from);
    expect(easePose(from, to, 1)).toEqual(to);
    expect(easePose(from, to, 7)).toEqual(to);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5); // ease-out: fast start
    let prev = from;
    for (let k = 1; k <= 100; k++) {
      const p = easePose(from, to, k / 100);
      expect(p.cx).toBeGreaterThanOrEqual(prev.cx);
      expect(p.cy).toBeLessThanOrEqual(prev.cy);
      expect(p.zoom).toBeGreaterThanOrEqual(prev.zoom);
      prev = p;
    }
  });

  it('a preset eases over 220 ms and lands exactly; nothing moves on its own afterwards', () => {
    const clock = { t: 1000 };
    const c = cam(clock);
    const start = pose(c);
    c.centerOn(30, 40, 16);
    expect(pose(c)).toEqual(start); // nothing moves until a frame
    expect(c.moving).toBe(true);
    clock.t += CAMERA_EASE_MS / 2;
    c.step(clock.t);
    expect(c.cx).toBeGreaterThan(30);
    expect(c.cx).toBeLessThan(64);
    clock.t += CAMERA_EASE_MS;
    expect(c.step(clock.t)).toBe(false);
    expect(pose(c)).toEqual({ cx: 30, cy: 40, zoom: 16 });
    const end = pose(c);
    c.step(clock.t + 5000);
    expect(pose(c)).toEqual(end);
  });

  it('reduced motion, or no clock: every move is instant', () => {
    for (const c of [cam({ t: 0 }, true), cam(null)]) {
      c.centerOn(30, 40, 16);
      expect(c.moving).toBe(false);
      expect(pose(c)).toEqual({ cx: 30, cy: 40, zoom: 16 });
      c.zoomBy(2);
      expect(c.zoom).toBe(32);
      c.fit();
      expect(c.zoom).toBe(c.fitZoom());
      c.revealAt(50, 50, 300);
      expect(c.moving).toBe(false);
    }
  });

  it('a new move replaces an unfinished one: it starts where the view is and builds on where the last was going', () => {
    const clock = { t: 0 };
    const c = cam(clock);
    const z0 = c.zoom;
    c.zoomBy(1.6);
    clock.t = 50;
    c.step(clock.t);
    const mid = pose(c);
    expect(mid.zoom).toBeGreaterThan(z0);
    expect(mid.zoom).toBeLessThan(z0 * 1.6);
    c.zoomBy(1.6); // a second tap before the first finished
    expect(pose(c)).toEqual(mid); // no jump
    clock.t = 50 + CAMERA_EASE_MS;
    c.step(clock.t);
    expect(c.zoom).toBeCloseTo(z0 * 1.6 * 1.6, 9);
  });

  it('wheel, pinch and drag are direct, and settle an unfinished move first; settle lands on the target', () => {
    const clock = { t: 0 };
    const c = cam(clock);
    c.centerOn(30, 40, 16);
    clock.t = 30;
    c.step(clock.t);
    c.panBy(16, 0); // a drag follows the hand from where the view is going
    expect(c.moving).toBe(false);
    expect(c.cx).toBeCloseTo(30 - 1, 12);
    c.centerOn(80, 80);
    c.zoomAt(400, 300, 1); // wheel
    expect(c.moving).toBe(false);
    expect([c.cx, c.cy]).toEqual([80, 80]);
    c.revealAt(40, 40, 100);
    const target = c.target();
    c.settle();
    expect(pose(c)).toEqual(target);
  });
});

/**
 * D-0099 (v1.0 gate): the inspector's reveal pan moves the view so the organism shows beside the panel. A
 * key closing the inspector undoes it (eased), so the keyboard reticle is again where Enter inspected; any
 * other move since the reveal (pan, zoom, preset, Find, follow) keeps the view where the player put it.
 */
describe('undoing the reveal pan (D-0099)', () => {
  it('undo eases back to the view before the reveal, exactly, and only once', () => {
    const clock = { t: 0 };
    const c = cam(clock);
    c.centerOn(50, 60, 8);
    c.settle();
    const before = pose(c);
    c.revealAt(50, 60, 100); // the organism at the reticle goes up, above a bottom sheet
    c.settle();
    expect(c.cy).not.toBe(before.cy);
    expect(c.undoReveal()).toBe(true);
    expect(c.moving).toBe(true); // eased like the reveal (P4.13)
    clock.t = CAMERA_EASE_MS;
    c.step(clock.t);
    expect(pose(c)).toEqual(before);
    expect(c.undoReveal()).toBe(false); // forgotten
    expect(pose(c)).toEqual(before);
  });

  it('a pan, zoom, preset, Find or follow after the reveal keeps the view; a forgotten reveal is not undone', () => {
    const moves: Array<(c: Camera) => void> = [
      (c) => c.panBy(40, 0),
      (c) => c.zoomBy(1.25),
      (c) => c.zoomAt(400, 300, 2),
      (c) => c.fit(),
      (c) => c.centerOn(30, 30),
      (c) => {
        c.followEntityId = 7;
      },
      (c) => c.forgetReveal(),
    ];
    for (const move of moves) {
      const c = cam(null);
      c.centerOn(50, 60, 8);
      c.revealAt(50, 60, 100);
      move(c);
      c.settle();
      const after = pose(c);
      expect(c.undoReveal()).toBe(false);
      expect(pose(c)).toEqual(after);
    }
  });

  it('a run of reveals (the inspector changes organism, collapses, expands) undoes to the view before the first', () => {
    const c = cam(null);
    c.centerOn(50, 60, 8);
    const before = pose(c);
    c.revealAt(50, 60, 100);
    c.revealAt(55, 62, 120);
    expect(c.undoReveal()).toBe(true);
    expect(pose(c)).toEqual(before);
    // A reveal after another move starts a new run from that view.
    c.revealAt(50, 60, 100);
    c.panBy(0, 40);
    const moved = pose(c);
    c.revealAt(52, 61, 100);
    expect(c.undoReveal()).toBe(true);
    expect(pose(c)).toEqual(moved);
  });

  it('reduced motion: the undo is instant', () => {
    const c = cam({ t: 0 }, true);
    c.centerOn(50, 60, 8);
    const before = pose(c);
    c.revealAt(50, 60, 100);
    expect(c.undoReveal()).toBe(true);
    expect(c.moving).toBe(false);
    expect(pose(c)).toEqual(before);
  });
});
