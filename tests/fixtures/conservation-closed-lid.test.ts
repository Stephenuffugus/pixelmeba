/**
 * G0 fixture: closed lid, no external input, 10,000 ticks with all five core species present.
 * Carbon and nutrient must reconcile within 0.001 % of their totals at every checkpoint (SPEC §3.4,
 * D01 §19). Roundoff is reported. The absolute residual per element (C, N, M) is also held under
 * 1e-8 game units, which catches a one-off 0.01 C leak the relative gate cannot (lead fix 4a).
 */
import { describe, expect, it } from 'vitest';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { realizeRecipe } from '../../src/sim/recipes';
import { run } from '../../src/sim/tick';
import { applyNow } from '../../src/sim/commands';
import { registry, aliveOf } from '../helpers/world';
import { inactiveFieldsNonZero } from '../../src/sim/transport';

/** Absolute ledger residual per element, in game units (C, N, M); see the tripwire below. */
const ABS_RESIDUAL_BOUND = 1e-8;

describe('G0 conservation, closed lid', () => {
  it('conserves carbon and nutrient over 10,000 ticks with B01, B04, B06, A01 and P01', () => {
    const reg = registry();
    const w = realizeRecipe(reg, 'FIRST_DISH_V1', { transform: (r) => ({ ...r, lid: 'closed' }) });
    // Add two Amoeba through the ordinary tool path (a logged external input), then no more inputs.
    applyNow(w, 'fixture-amoeba', { kind: 'inoculate', speciesId: 'P01', x: 48.5, y: 64.5, radius: 3, count: 2 });
    const species = new Set(aliveOf(w).map((s) => w.species[w.ents.cols.species[s]!]!.id));
    expect([...species].sort()).toEqual(['A01', 'B01', 'B04', 'B06', 'P01']);
    const inputsAtStart = { ...w.ledger.inputs };
    const totals0 = computeTotals(w);
    expect(totals0.c).toBeGreaterThan(0);
    expect(totals0.n).toBeGreaterThan(0);

    let worstC = 0;
    let worstN = 0;
    // Absolute ledger residual |actual − expected| per element (see the tripwire below).
    const worstAbs = { c: 0, n: 0, m: 0 };
    for (let chunk = 0; chunk < 20; chunk++) {
      run(w, 500);
      const check = checkLedger(w);
      worstC = Math.max(worstC, check.relErr.c);
      worstN = Math.max(worstN, check.relErr.n);
      for (const e of ['c', 'n', 'm'] as const) worstAbs[e] = Math.max(worstAbs[e], Math.abs(check.actual[e] - check.expected[e]));
      expect(check.ok, `tick ${w.tick}: ${JSON.stringify(check)}`).toBe(true);
      expect(inactiveFieldsNonZero(w)).toEqual([]);
    }
    expect(w.tick).toBe(10000);
    expect(w.ledger.exchangeC).toBe(0);
    expect(w.ledger.inputs).toEqual(inputsAtStart);
    expect(worstC).toBeLessThan(1e-5);
    expect(worstN).toBeLessThan(1e-5);
    // Tripwire beyond SPEC §3.4 (lead fix 4a): most of the dish's carbon is dissolved CO2, so 1e-5
    // relative hides a one-off 0.01 C leak (wave-verify-2's v-object-leak mutant: 1.68e-6 relative).
    // The books close to roundoff: worst absolute residual measured 2.9e-11 C, 1.2e-10 N, 0 M
    // (2026-10-10); the bound is 10x the worst, rounded up to a power of ten.
    expect(worstAbs.c).toBeLessThan(ABS_RESIDUAL_BOUND);
    expect(worstAbs.n).toBeLessThan(ABS_RESIDUAL_BOUND);
    expect(worstAbs.m).toBeLessThan(ABS_RESIDUAL_BOUND);
    console.info(
      `conservation-closed-lid: worst relative error C ${worstC.toExponential(3)}, N ${worstN.toExponential(3)}; ` +
        `worst absolute residual C ${worstAbs.c.toExponential(3)}, N ${worstAbs.n.toExponential(3)}, M ${worstAbs.m.toExponential(3)}; ` +
        `alive ${w.ents.count}; births ${w.events.totals.birth ?? 0}; deaths ${w.events.totals.death ?? 0}`,
    );
  }, 600_000); // 10,000 full ticks: over two minutes on a loaded 2-CPU machine
});
