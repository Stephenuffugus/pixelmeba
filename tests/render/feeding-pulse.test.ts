/**
 * P4.13 first feeding pulse (src/render/features.ts bodyAnimFor, feedStartAfterSnapshot, feedFrameClock;
 * UX §6.5 eating pulse; UX §7.1 "feeding and reproduction play only after committed events").
 *
 * The feed animation needs the snapshot's CUE_FEEDING bit; a new bout of eating starts at frame 0 on the
 * first rendered frame after the snapshot in which the cue turned on, so the first pulse shows within one
 * snapshot interval of the recorded intake; it keeps its own clock while the cue stays on.
 */
import { describe, expect, it } from 'vitest';
import { CUE_FEEDING, CUE_STRESSED } from '../../src/worker/protocol';
import { bodyAnimFor, bodyFrameIndex, FEED_START_PENDING, feedFrameClock, feedStartAfterSnapshot } from '../../src/render/features';

const ALL = { stress: true, feed: true, move: true };
const FRAMES = 4;
const FRAME_MS = 120;

/** Simulate snapshots every 100 ms and frames every `frameMs`; returns the feed frame drawn at each frame. */
function run(cues: boolean[], frameMs: number, phase: number) {
  let start = Number.NaN;
  const drawn: { t: number; snapshot: number; frame: number | null }[] = [];
  let t = 0;
  for (let s = 0; s < cues.length; s++) {
    start = feedStartAfterSnapshot(cues[s]!, start);
    const next = (s + 1) * 100;
    for (; t < next; t += frameMs) {
      const anim = bodyAnimFor(cues[s] ? CUE_FEEDING : 0, false, false, ALL);
      if (anim !== 'feed') {
        drawn.push({ t, snapshot: s, frame: null });
        continue;
      }
      if (start === FEED_START_PENDING) start = t;
      drawn.push({ t, snapshot: s, frame: bodyFrameIndex(FRAMES, FRAME_MS, 0, false, false, feedFrameClock(start, t, t + phase)) });
    }
  }
  return drawn;
}

describe('first feeding pulse (P4.13)', () => {
  it('the feed animation needs CUE_FEEDING: never a feed frame without the cue', () => {
    for (let cue = 0; cue < 64; cue++)
      for (const moving of [false, true])
        for (const dormant of [false, true]) {
          const a = bodyAnimFor(cue, moving, dormant, ALL);
          if (a === 'feed') {
            expect(cue & CUE_FEEDING).not.toBe(0);
            expect(moving || dormant).toBe(false);
          }
        }
    expect(bodyAnimFor(CUE_FEEDING, false, false, ALL)).toBe('feed');
    expect(bodyAnimFor(CUE_FEEDING | CUE_STRESSED, false, false, ALL)).toBe('stress');
    expect(bodyAnimFor(CUE_FEEDING, true, false, ALL)).toBe('move'); // moving: locomotion wins
    expect(bodyAnimFor(CUE_FEEDING, false, true, ALL)).toBe('move'); // dormant poses never feed
    expect(bodyAnimFor(0, false, false, { stress: false, feed: true, move: false })).toBe('idle');
  });

  it('a new bout starts at frame 0 on the first frame after its snapshot, whatever the free clock was', () => {
    for (const phase of [0, 37, 250, 999])
      for (const frameMs of [16, 33, 90]) {
        const cues = [false, false, true, true, true, false, true, true];
        const d = run(cues, frameMs, phase);
        // Bout 1 starts in snapshot 2, bout 2 in snapshot 6.
        for (const s of [2, 6]) {
          const first = d.find((x) => x.snapshot === s)!;
          expect(first.frame, `phase ${phase} frame ${frameMs}`).toBe(0);
          // Within one snapshot interval of the recorded intake.
          expect(first.t - s * 100).toBeLessThan(100);
        }
        // While it stays on, its own clock runs on (frames advance in order).
        const bout = d.filter((x) => x.snapshot >= 2 && x.snapshot <= 4).map((x) => x.frame!);
        for (let k = 1; k < bout.length; k++) expect([bout[k - 1]!, (bout[k - 1]! + 1) % FRAMES]).toContain(bout[k]!);
        // Off: no feed frame.
        expect(d.filter((x) => !cues[x.snapshot]).every((x) => x.frame === null)).toBe(true);
      }
  });

  it('carries the start across snapshots and clears it when the cue stops', () => {
    expect(feedStartAfterSnapshot(false, 123)).toBeNaN();
    expect(feedStartAfterSnapshot(true, Number.NaN)).toBe(FEED_START_PENDING);
    expect(feedStartAfterSnapshot(true, 500)).toBe(500);
    expect(feedFrameClock(Number.NaN, 900, 4321)).toBe(4321);
    expect(feedFrameClock(FEED_START_PENDING, 900, 4321)).toBe(0);
    expect(feedFrameClock(500, 900, 4321)).toBe(400);
  });
});
