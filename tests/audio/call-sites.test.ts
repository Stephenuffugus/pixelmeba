/**
 * P3.10 fix round 1: cue call sites the verifier found missing or replaying.
 *   • Transfer (Lab → Tools → Sample, a placement the player makes) plays drop / placement_error like
 *     every other placement (src/ui/panels/SampleSession.tsx transferTap → placementCue), and only while
 *     that dish is still open (a late reply after leaving it makes no sound; lead fix 4a).
 *   • A keyed cue (discovery card, comparison results) plays once per event, not again when its panel
 *     remounts with the same card or results still up (src/audio/cues.ts playCueFor).
 */
import { signal } from '@preact/signals';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Cues from '@audio/cues';

type CuesModule = typeof Cues;

const placementCue = vi.fn();
vi.mock('@audio/cues', async (orig) => {
  const real: CuesModule = await orig();
  return { ...real, placementCue: (n: number): void => void placementCue(n) };
});

const command = vi.fn();
vi.mock('../../src/ui/state', () => ({
  dishInfo: signal({ dishId: 'd1' }),
  getClient: () => ({ command }),
  getRenderer: () => null,
  showToast: () => undefined,
}));

const { heldSample, transferTap } = await import('../../src/ui/panels/SampleSession');
const { playCueFor } = await import('@audio/cues');
const { dishInfo } = await import('../../src/ui/state');

describe('Transfer is a placement: it cues like one', () => {
  beforeEach(() => {
    placementCue.mockClear();
    command.mockReset();
    heldSample.value = { origin: [10, 10], footprint: [0, 0] } as never;
    dishInfo.value = { dishId: 'd1' } as never;
  });

  it('an accepted transfer → placementCue(accepted > 0) (drop, and a buzz with haptics on)', async () => {
    command.mockResolvedValue({ accepted: 5 });
    await transferTap(20, 20);
    expect(command).toHaveBeenCalledTimes(1);
    expect(placementCue).toHaveBeenCalledWith(5);
  });

  it('a refused transfer → placementCue(0) (placement_error)', async () => {
    command.mockResolvedValue({ accepted: 0, note: 'it does not fit there' });
    await transferTap(20, 20);
    expect(placementCue).toHaveBeenCalledWith(0);
  });

  it('a late reply after the player left the dish → no cue (the open-dish check LabView uses)', async () => {
    command.mockImplementation(() => {
      dishInfo.value = { dishId: 'd2' } as never; // another dish opened while the transfer was in flight
      return Promise.resolve({ accepted: 5 });
    });
    await transferTap(20, 20);
    expect(command).toHaveBeenCalledTimes(1);
    expect(placementCue).not.toHaveBeenCalled();
  });

  it('no reply (dish gone) → no cue', async () => {
    command.mockResolvedValue(null);
    await transferTap(20, 20);
    expect(placementCue).not.toHaveBeenCalled();
  });
});

describe('keyed cues play once per event, not on remount', () => {
  it('the same discovery card object does not replay; a new one does', () => {
    const card = { rows: [{ id: 3 }] };
    expect(playCueFor('discovery', card)).toBe(true);
    expect(playCueFor('discovery', card)).toBe(false); // remount (e.g. back from the Field Guide)
    expect(playCueFor('discovery', { rows: [{ id: 3 }] })).toBe(true); // a new card (even same branch id, other dish)
  });

  it('keys are per cue id: results and a discovery do not block each other', () => {
    const results = { rows: [] };
    expect(playCueFor('compare_result', results)).toBe(true);
    expect(playCueFor('compare_result', results)).toBe(false);
    expect(playCueFor('discovery', results)).toBe(true);
  });
});
