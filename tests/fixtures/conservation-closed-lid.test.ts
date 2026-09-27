/**
 * G0 fixture: closed lid, no external input, 10,000 ticks with all five core species present.
 * Carbon and nutrient must reconcile within 0.001 % of their totals at every checkpoint (SPEC §3.4,
 * D01 §19). Roundoff is reported.
 */
import { describe, expect, it } from 'vitest';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { realizeRecipe } from '../../src/sim/recipes';
import { run } from '../../src/sim/tick';
import { applyNow } from '../../src/sim/commands';
import { registry, aliveOf } from '../helpers/world';
import { inactiveFieldsNonZero } from '../../src/sim/transport';

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
    for (let chunk = 0; chunk < 20; chunk++) {
      run(w, 500);
      const check = checkLedger(w);
      worstC = Math.max(worstC, check.relErr.c);
      worstN = Math.max(worstN, check.relErr.n);
      expect(check.ok, `tick ${w.tick}: ${JSON.stringify(check)}`).toBe(true);
      expect(inactiveFieldsNonZero(w)).toEqual([]);
    }
    expect(w.tick).toBe(10000);
    expect(w.ledger.exchangeC).toBe(0);
    expect(w.ledger.inputs).toEqual(inputsAtStart);
    expect(worstC).toBeLessThan(1e-5);
    expect(worstN).toBeLessThan(1e-5);
    console.info(
      `conservation-closed-lid: worst relative error C ${worstC.toExponential(3)}, N ${worstN.toExponential(3)}; ` +
        `alive ${w.ents.count}; births ${w.events.totals.birth ?? 0}; deaths ${w.events.totals.death ?? 0}`,
    );
  }, 600_000); // 10,000 full ticks: over two minutes on a loaded 2-CPU machine
});
