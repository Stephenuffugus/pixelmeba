/**
 * Phase 5 wave 12, e2-light-algae: the three hooks e3-predation's handling relies on, written in this task's stage
 * files and tested here with the handling columns set by hand (e3-predation builds the attempt state machine in
 * contacts.ts and src/sim/handling.ts). Each check sets the columns right before the stage under test through a
 * step hook and reads the result right after it, so it isolates that stage from contacts (stage 5).
 *  - H1 (movement.ts stageSenseAndMove): a predator with handlingNeed > 0 keeps its target on a decision tick when
 *    a nearer prey appears; with 0 it re-acquires the nearer one; an invalid target is still dropped during an
 *    attempt (and not replaced on that decision tick).
 *  - H2 (births.ts commitDivision): a predator dividing with an open attempt leaves both daughters with need 0 and
 *    progress 0 and emits exactly one 'handlingBreak' (why 'division', prey, progress) under the parent's birthId
 *    and cell; none without an attempt.
 *  - H3 (intake.ts): a meal-less predator reports PRED_HANDLING_IN_PROGRESS during an attempt, PRED_NO_PREY without.
 *  - zero column: a shipped P01 with handlingNeed 0 re-acquires as before and divides without a 'handlingBreak'.
 *
 * P10 (HANDLING) is reached through REG; HANDLING is implemented by e3-predation in this wave (the lead appends it at
 * integration), and LOW_LIGHT_CURVE / MIXOTROPHY by this task, so REG uses allowUnimplemented.
 */
import { describe, expect, it } from 'vitest';
import { divisionNeeds } from '../../src/sim/births';
import { killEntity } from '../../src/sim/maintenance';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { entityCell } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { aliveOf, clearWater, place, registry } from '../helpers/world';

const SHIPPED = registry().manifest;
const REG = registryWith({ enabledSpecies: [...SHIPPED.enabledSpecies, 'A03', 'A04', 'A05', 'P10'].sort() }, { allowUnimplemented: true });

/** One step with `before(stage)` run right before stage `stage` + 1 (i.e. after stage `stage`) and `after` after `stage + 1`. */
function stepAround(w: World, stage: number, before: () => void, after: () => void): void {
  step(w, {
    afterStage: (st) => {
      if (st === stage) before();
      else if (st === stage + 1) after();
    },
  });
}

describe('H1: a predator in an open handling attempt keeps its target', () => {
  function hunt(species: 'P10' | 'P01', preySpecies: 'P01' | 'B01'): { w: World; pred: number; far: number; near: number } {
    const w = clearWater({}, REG);
    const pred = place(w, species, 64.5, 64.5, { E: 50 });
    const far = place(w, preySpecies, 67.5, 64.5);
    const c = w.ents.cols;
    stepAround(
      w,
      3,
      () => (c.decisionTimer[pred] = 0),
      () => undefined,
    );
    expect(c.preySlot[pred]).toBe(far);
    const near = place(w, preySpecies, c.x[pred]! - 1.5, 64.5);
    return { w, pred, far, near };
  }

  it('P10 with handlingNeed > 0 keeps its target on a decision tick; with 0 it re-acquires the nearer prey', () => {
    const { w, pred, far, near } = hunt('P10', 'P01');
    const c = w.ents.cols;
    let target = -2;
    stepAround(
      w,
      3,
      () => {
        c.decisionTimer[pred] = 0;
        c.handlingNeed[pred] = 1;
      },
      () => {
        target = c.preySlot[pred]!;
        c.handlingNeed[pred] = 0; // back to v1.0 state before contacts (stage 5)
      },
    );
    expect(target).toBe(far);
    stepAround(
      w,
      3,
      () => (c.decisionTimer[pred] = 0),
      () => (target = c.preySlot[pred]!),
    );
    expect(target).toBe(near);
    expect(c.preyBirthId[pred]).toBe(c.birthId[near]);
  });

  it('an invalid target is still dropped during an attempt, and not replaced on that decision tick', () => {
    for (const need of [1, 0]) {
      const { w, pred, far, near } = hunt('P10', 'P01');
      const c = w.ents.cols;
      killEntity(w, far, R.DEATH_AGE);
      let target = -2;
      stepAround(
        w,
        3,
        () => {
          c.decisionTimer[pred] = 0;
          c.handlingNeed[pred] = need;
        },
        () => {
          target = c.preySlot[pred]!;
          c.handlingNeed[pred] = 0;
        },
      );
      expect(target).toBe(need > 0 ? -1 : near);
    }
  });

  it('zero column: a shipped P01 re-acquires the nearer prey on its decision tick exactly as before', () => {
    const { w, pred, near } = hunt('P01', 'B01');
    const c = w.ents.cols;
    expect(c.handlingNeed[pred]).toBe(0);
    let target = -2;
    stepAround(
      w,
      3,
      () => (c.decisionTimer[pred] = 0),
      () => (target = c.preySlot[pred]!),
    );
    expect(target).toBe(near);
  });
});

describe('H2: division ends an open attempt', () => {
  /** A `species` predator dividing in this step (state set right before stage 9); `attempt` opens one by hand. */
  function divide(species: 'P10' | 'P01', preySpecies: 'P01' | 'B01', attempt: boolean) {
    const w = clearWater({}, REG);
    const pred = place(w, species, 64.5, 64.5, { E: 50 });
    const prey = place(w, preySpecies, 68.5, 64.5);
    step(w);
    const c = w.ents.cols;
    const parentBirth = c.birthId[pred]!;
    const preyBirth = c.birthId[prey]!;
    let parentCell = -1;
    const n0 = w.ents.count;
    stepAround(
      w,
      8,
      () => {
        const needs = divisionNeeds(w, pred);
        w.ledger.inputs.c += needs.biomass * 1.05 - c.B[pred]!; // test-only state, logged as an input
        c.B[pred] = needs.biomass * 1.05;
        c.E[pred] = profileOf(w, pred).energyCap;
        c.age[pred] = needs.age + 1;
        c.mealC[pred] = 0;
        c.mealN[pred] = 0;
        if (attempt) {
          c.preySlot[pred] = prey;
          c.preyBirthId[pred] = preyBirth;
          c.handlingNeed[pred] = 2;
          c.handlingProgress[pred] = 0.5;
        }
        parentCell = entityCell(c.x[pred]!, c.y[pred]!);
      },
      () => undefined,
    );
    expect(w.ents.count).toBe(n0 + 1);
    const daughters = aliveOf(w, species);
    expect(daughters).toHaveLength(2);
    return { w, daughters, parentBirth, preyBirth, parentCell, breaks: w.events.ring.filter((e) => e.type === 'handlingBreak') };
  }

  it('P10 dividing mid-attempt: both daughters need 0 and progress 0, exactly one handlingBreak (why division)', () => {
    const { w, daughters, parentBirth, preyBirth, parentCell, breaks } = divide('P10', 'P01', true);
    const c = w.ents.cols;
    for (const d of daughters) {
      expect(c.handlingNeed[d]).toBe(0);
      expect(c.handlingProgress[d]).toBe(0);
      expect(c.birthId[d]).not.toBe(parentBirth);
    }
    expect(breaks).toHaveLength(1);
    expect(breaks[0]).toMatchObject({ type: 'handlingBreak', birthId: parentBirth, cell: parentCell, species: c.species[daughters[0]!], detail: { prey: preyBirth, why: 'division', progress: 0.5 } });
  });

  it('no attempt, no event: P10 and the shipped P01 (zero column) divide without a handlingBreak', () => {
    for (const [sp, prey] of [
      ['P10', 'P01'],
      ['P01', 'B01'],
    ] as const) {
      const { w, daughters, breaks } = divide(sp, prey, false);
      expect(breaks).toEqual([]);
      for (const d of daughters) expect(w.ents.cols.handlingProgress[d]).toBe(0);
    }
  });
});

describe('H3: the meal-less predator reason', () => {
  it('PRED_HANDLING_IN_PROGRESS during an attempt, PRED_NO_PREY without', () => {
    const w = clearWater({}, REG);
    const pred = place(w, 'P10', 64.5, 64.5, { E: 50 });
    step(w);
    const c = w.ents.cols;
    expect(c.mealC[pred]).toBe(0);
    for (const [need, code] of [
      [1, R.PRED_HANDLING_IN_PROGRESS],
      [0, R.PRED_NO_PREY],
    ] as const) {
      let got = -1;
      stepAround(
        w,
        5,
        () => (c.handlingNeed[pred] = need),
        () => {
          got = c.limitCode[pred]!;
          c.handlingNeed[pred] = 0;
        },
      );
      expect(got).toBe(code);
    }
  });
});
