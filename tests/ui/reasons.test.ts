/** P1.7: every reason code has Explore and Lab copy; values of 0, unknown and mixed are handled. */
import { describe, expect, it } from 'vitest';
import { REASONS, R } from '../../src/sim/reasons';
import { allReasonCopy, reasonText, secondsLeft } from '../../src/ui/strings/reasons';

const FORBIDDEN = /\b(immune|superior|adapted|advanced|perfect|invincible)\b/i;

describe('reason copy (P1.7)', () => {
  it('every reason code has non-empty Explore and Lab text without forbidden claims', () => {
    const copy = allReasonCopy();
    for (let code = 0; code < REASONS.length; code++) {
      const name = REASONS[code]!;
      expect(copy[name], name).toBeTruthy();
      for (const mode of ['explore', 'lab'] as const) {
        for (const value of [0, 0.5, 1, undefined, Number.NaN]) {
          const t = reasonText(code, mode, value === undefined ? {} : { value });
          expect(t.length, `${name} ${mode}`).toBeGreaterThan(3);
          expect(t, `${name} ${mode}`).not.toMatch(FORBIDDEN);
          expect(t, `${name} ${mode}`).not.toMatch(/undefined|NaN/);
        }
      }
    }
  });

  it('Lab wording includes the measured value where one applies', () => {
    expect(reasonText(R.NUTRIENT_LIMITED, 'lab', { value: 0.18 })).toContain('18 %');
    expect(reasonText(R.FOOD_ACCESS_LOW, 'lab', { value: 0 })).toContain('0 %');
    expect(reasonText(R.FOOD_ACCESS_LOW, 'lab', {})).toContain('unknown');
    expect(reasonText(R.MIXED_CAUSES, 'explore')).toBe('A few things are slowing it down.');
  });

  it('DORMANCY_LOCKOUT: Explore says it just woke; Lab gives the lockout seconds left and whether a rest is waiting', () => {
    expect(reasonText(R.DORMANCY_LOCKOUT, 'explore')).toBe('Just woke up.');
    expect(reasonText(R.DORMANCY_LOCKOUT, 'lab', { value: 12.3 })).toBe(
      'Just woke up: it cannot rest again for 13 s.',
    );
    expect(reasonText(R.DORMANCY_LOCKOUT, 'lab', { value: 4, restHeld: true })).toBe(
      'Just woke up: it would start resting now, but cannot rest again for 4 s.',
    );
    expect(reasonText(R.DORMANCY_LOCKOUT, 'lab', {})).toBe('Just woke up: it cannot rest again yet.');
    expect(reasonText(R.DORMANCY_LOCKOUT, 'lab', { value: Number.NaN, restHeld: true })).toBe(
      'Just woke up: it would start resting now, but cannot rest again yet.',
    );
  });

  it('countdowns (PREPARING, WAKING, DORMANCY_LOCKOUT) round up: never "0 s" while one is still running', () => {
    // The last tick of the 30 s lockout leaves 0.1 s: it still cannot rest, so the copy says 1 s.
    expect(reasonText(R.DORMANCY_LOCKOUT, 'lab', { value: 0.1, restHeld: true })).toBe(
      'Just woke up: it would start resting now, but cannot rest again for 1 s.',
    );
    expect(reasonText(R.DORMANCY_LOCKOUT, 'lab', { value: 0.4 })).toBe(
      'Just woke up: it cannot rest again for 1 s.',
    );
    expect(reasonText(R.DORMANCY_LOCKOUT, 'lab', { value: 30 })).toBe(
      'Just woke up: it cannot rest again for 30 s.',
    );
    // Float accumulation of the 0.1 s tick does not add a second.
    expect(reasonText(R.DORMANCY_LOCKOUT, 'lab', { value: 29.900000000000002 })).toBe(
      'Just woke up: it cannot rest again for 30 s.',
    );
    expect(reasonText(R.DORMANCY_LOCKOUT, 'lab', { value: 2.0000000000004 })).toBe(
      'Just woke up: it cannot rest again for 2 s.',
    );
    expect(reasonText(R.PREPARING, 'lab', { value: 0.4 })).toBe('Getting ready to rest: 1 s left.');
    expect(reasonText(R.PREPARING, 'lab', { value: 5 })).toBe('Getting ready to rest: 5 s left.');
    expect(reasonText(R.WAKING, 'lab', { value: 4.9 })).toBe('Waking up: 5 s left.');
    expect(reasonText(R.WAKING, 'lab', { value: 0.1 })).toBe('Waking up: 1 s left.');
    expect(secondsLeft(0)).toBe('0');
    expect(secondsLeft(undefined)).toBe('some');
    // Elapsed times (not countdowns) keep rounding to the nearest second.
    expect(reasonText(R.RESTING_FOOD_SCARCE, 'lab', { value: 0.4 })).toContain('(0 s so far)');
  });

  it('unknown codes fall back safely', () => {
    expect(reasonText(9999, 'explore')).toBe(allReasonCopy().NONE);
  });
});
