import { describe, expect, it } from 'vitest';
import { FLAG } from '@sim/entities';
import { USABLE_INTAKE_FRACTION } from '@sim/constants';
import { actionLabel, LIFE_ACTIVE, LIFE_RESTING } from '../../src/ui/strings/modules';

const at = (flags: number, extra: Partial<Parameters<typeof actionLabel>[0]> = {}) =>
  actionLabel({ flags, lifeState: LIFE_ACTIVE, predation: null, ...extra });

describe('inspector action chip (honest labels)', () => {
  it('says "Eating" only when this tick\'s intake reached the usable share of its ceiling', () => {
    expect(USABLE_INTAKE_FRACTION).toBeGreaterThan(0);
    expect(at(FLAG.feeding | FLAG.usableIntake)).toBe('Eating');
    // Stage 6 sets FLAG.feeding for any intake above zero; a trace intake is named as such, never "Eating"
    // beside "No usable food" and "Food access: 0 %" (wave C art-marks re-verifier repro).
    expect(at(FLAG.feeding)).toBe('Finding only traces of food');
  });

  it('keeps the other actions and the life state first', () => {
    const predation = { code: 0, targetBirthId: 7, cooldown: 0 };
    expect(at(FLAG.feeding, { predation })).toBe('Digesting');
    expect(at(FLAG.hunting)).toBe('Hunting');
    expect(at(FLAG.stressed)).toBe('Stressed');
    expect(at(FLAG.moving)).toBe('Moving');
    expect(at(0)).toBe('Staying in place');
    expect(at(FLAG.feeding | FLAG.usableIntake, { lifeState: LIFE_RESTING })).toBe('Resting');
  });
});
