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
