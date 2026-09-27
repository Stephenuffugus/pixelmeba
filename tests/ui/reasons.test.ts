/** P1.7: every reason code has Explore and Lab copy; values of 0, unknown and mixed are handled. */
import { describe, expect, it } from 'vitest';
import { REASONS, R } from '../../src/sim/reasons';
import { allReasonCopy, reasonText } from '../../src/ui/strings/reasons';

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

  it('unknown codes fall back safely', () => {
    expect(reasonText(9999, 'explore')).toBe(allReasonCopy().NONE);
  });
});
