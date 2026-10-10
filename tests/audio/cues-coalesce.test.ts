/**
 * The shipped cue path coalesces world cues (UX §8.1 "at most one division click per 5 s"; P3.10 fix
 * round 1): src/audio/cues.ts builds its own CueRateLimiter with `coalesceOf: coalesceMsOf`. This drives
 * that shipped limiter through eventCues() (a fake SoundKit records what would sound; the clock is
 * performance.now), so dropping the option from cues.ts brings back the click track and fails here.
 * rate-limiter.test.ts covers the limiter itself with limiters it builds.
 */
import { describe, expect, it, vi } from 'vitest';
import { WORLD_CUE_COALESCE_MS } from '../../src/audio/patches';

const plays: { id: string; count: number }[] = [];
vi.mock('../../src/audio/SoundKit', () => ({
  audioContextCtor: () =>
    function FakeContext(): void {
      /* the fake SoundKit below never touches it */
    },
  SoundKit: class {
    setPrefs(): void {}
    resume(): Promise<void> {
      return Promise.resolve();
    }
    suspend(): Promise<void> {
      return Promise.resolve();
    }
    play(id: string, count: number): void {
      plays.push({ id, count });
    }
  },
}));

let t = 0;
vi.spyOn(performance, 'now').mockImplementation(() => t);
const { initAudio, eventCues, divisionAudible } = await import('../../src/audio/cues');

describe('shipped cue path (cues.ts limiter)', () => {
  it('alga births in every 100 ms snapshot for 10 s: one division click per 5 s, not one per snapshot', () => {
    expect(initAudio()).toBe(true);
    const audible = divisionAudible(['bacterium', 'alga']);
    expect(WORLD_CUE_COALESCE_MS.division).toBe(5000);
    for (t = 0; t < 10_000; t += 100)
      eventCues(
        [
          { type: 'birth', species: 1 },
          { type: 'birth', species: 0 },
        ],
        audible,
      );
    const division = plays.filter((p) => p.id === 'division');
    // 100 snapshots with an audible birth each: at t = 0 and once the 5 s gap has passed, no more.
    expect(division.length).toBeGreaterThanOrEqual(1);
    expect(division.length).toBeLessThanOrEqual(Math.ceil(10_000 / WORLD_CUE_COALESCE_MS.division));
  });
});
