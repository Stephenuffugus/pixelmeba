/**
 * P4.13 effective-speed indicator (src/ui/speedBadge.ts; SPEC §3.1 "report effective speed"; UX §2.4).
 * Shown after 2 s below 0.8 × the chosen speed, hidden after 2 s at or above 0.9 ×; never paused.
 */
import { describe, expect, it } from 'vitest';
import { BADGE_IDLE, badgeLabel, badgeText, EffectiveSpeedMeter, stepBadge, type BadgeState } from '../../src/ui/speedBadge';

function feed(s: BadgeState, readings: [number, number][], speed = 4, running = true): BadgeState {
  for (const [now, effective] of readings) s = stepBadge(s, { running, speed, effective, now });
  return s;
}
const every100 = (from: number, to: number, eff: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let t = from; t <= to; t += 100) out.push([t, eff]);
  return out;
};

describe('effective-speed badge (P4.13)', () => {
  it('appears only after 2 s below 0.8 ×', () => {
    let s = feed(BADGE_IDLE, every100(0, 1900, 3.0));
    expect(s.shown).toBe(false);
    s = feed(s, [[2000, 3.0]]);
    expect(s.shown).toBe(true);
    // A dip that recovers before 2 s never shows it.
    s = feed(BADGE_IDLE, [...every100(0, 1500, 2.0), [1600, 3.5], ...every100(1700, 3500, 2.0)]);
    expect(s.shown).toBe(false);
    expect(feed(s, [[3700, 2.0]]).shown).toBe(true);
  });

  it('goes only after 2 s at or above 0.9 ×; between 0.8 and 0.9 it stays', () => {
    let s = feed(BADGE_IDLE, every100(0, 2000, 2.0));
    expect(s.shown).toBe(true);
    s = feed(s, every100(2100, 12000, 3.4)); // 0.85 × 4: in the band
    expect(s.shown).toBe(true);
    s = feed(s, every100(12100, 14000, 3.6)); // 0.9 × 4
    expect(s.shown).toBe(true);
    s = feed(s, [[14100, 3.6]]);
    expect(s.shown).toBe(false);
  });

  it('never while paused or stepping; pausing resets the timers', () => {
    let s = feed(BADGE_IDLE, every100(0, 2000, 2.0));
    expect(s.shown).toBe(true);
    s = stepBadge(s, { running: false, speed: 0, effective: 0, now: 2100 });
    expect(s).toEqual(BADGE_IDLE);
    s = feed(s, every100(2200, 3000, 0), 0, false);
    expect(s.shown).toBe(false);
    s = feed(s, every100(3100, 4000, 2.0));
    expect(s.shown).toBe(false); // the 2 s start again after play
  });

  it('text, accessible name and title', () => {
    expect(badgeText(2.345)).toBe(' · running at 2.3×');
    expect(badgeLabel(4, 2.345)).toBe("This device can't keep up with 4×, so the dish runs at 2.3×. No dish time is skipped.");
  });

  it('the meter: ticks per real second / 10 over the last 2 s; a restart starts again', () => {
    const m = new EffectiveSpeedMeter();
    expect(m.push(0, 0)).toBeNaN();
    let v = 0;
    for (let t = 100; t <= 3000; t += 100) v = m.push(t, (t / 1000) * 20); // 20 ticks/s = 2×
    expect(v).toBeCloseTo(2, 9);
    expect(m.push(3100, 5)).toBeNaN(); // tick went back: a new run
  });
});
