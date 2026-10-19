/**
 * P5.8 polish (wave 15; D-0125 leftover (b); org-ui-build.md "Bugs noticed elsewhere"): INHIBITOR_EXPOSURE that is
 * only the suitability reason (EntityInspect.suitFactors.reason) gets its own inspector line, as the rival line does
 * for RIVAL_EXPOSURE: UX §5.2's words ("Something here is hurting it."), in Lab with the measured suitability; never
 * twice (not when the intake limit is INHIBITOR_EXPOSURE as well: the lead constraint and the stop answer say it).
 * Mutant check (by hand, reverted): dropping the limitCode guard fails "never twice".
 */
import { describe, expect, it } from 'vitest';
import { R } from '../../src/sim/reasons';
import { inhibitorSuitLine } from '../../src/ui/panels/Inspector';
import { reasonText } from '../../src/ui/strings/reasons';
import { leadConstraint, stopAnswer } from '../../src/ui/strings/shortcuts';
import type { EntityInspect } from '../../src/worker/protocol';

const base = { suitFactors: { ph: 1, warmth: 1, salinity: 1, reason: R.INHIBITOR_EXPOSURE }, limitCode: R.FOOD_ACCESS_LOW, divisionBlockers: [] as number[], suitability: 0.4237 };

describe('the INHIBITOR_EXPOSURE suitability line (Inspector.tsx inhibitorSuitLine)', () => {
  it('shows UX §5.2 words in Explore and the measured suitability in Lab when it is only the suitability reason', () => {
    expect(reasonText(R.INHIBITOR_EXPOSURE, 'explore')).toBe('Something here is hurting it.');
    expect(inhibitorSuitLine(base, 'explore')).toBe('Something here is hurting it.');
    expect(inhibitorSuitLine(base, 'lab')).toBe('Something here is hurting it: conditions 42 % suitable here.');
    expect(inhibitorSuitLine({ ...base, limitCode: R.NONE }, 'lab')).toBe('Something here is hurting it: conditions 42 % suitable here.');
  });

  it('never twice: not when the intake limit is INHIBITOR_EXPOSURE (the stop answer and lead constraint say it)', () => {
    const both = { ...base, limitCode: R.INHIBITOR_EXPOSURE };
    expect(inhibitorSuitLine(both, 'explore')).toBeNull();
    expect(inhibitorSuitLine(both, 'lab')).toBeNull();
    const e = { ...both, limitValue: 0.5, E: 20, B: 1, B0: 1, H: 100, age: 1, proposalPending: false, divisionNeeds: { biomass: 2, energy: 30, health: 50, age: 10 }, predation: null, foodHere: [], diet: { metabolism: 'heterotroph', prey: [], abilities: [], digestsFilm: false, sugarSources: { makers: [], enzyme: [] } }, profile: { foods: ['sugar'] } } as unknown as EntityInspect;
    expect(stopAnswer(e).items.filter((it) => it.code === R.INHIBITOR_EXPOSURE)).toHaveLength(1);
    expect(leadConstraint(e).code).toBe(R.INHIBITOR_EXPOSURE);
  });

  it('nothing for any other suitability reason (RIVAL_EXPOSURE has the rival line; SUIT_* their factors)', () => {
    for (const reason of [R.NONE, R.RIVAL_EXPOSURE, R.SUIT_PH, R.SUIT_SALINITY, R.SUIT_WARMTH, R.SUIT_MOISTURE, R.SUIT_HABITAT]) {
      expect(inhibitorSuitLine({ ...base, suitFactors: { ...base.suitFactors, reason } }, 'lab')).toBeNull();
    }
  });

  it('says no "because" and no measured claim beyond the suitability', () => {
    expect(inhibitorSuitLine(base, 'lab')).not.toMatch(/because|superior|advanced|perfect|adapted|immune/i);
  });
});
