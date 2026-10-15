/**
 * Conservation in the Phase 5 habitats (P5.4; CLAUDE.md "Conservation"; SPEC §13.1; D-0128).
 * H04 Leaf Pool, Empty, lid closed (the New Dish override), no input, 10,000 ticks: carbon, nutrient and
 * mineral within 0.001 % of the ledger's expectation; both wafers empty ('objectEmptied' twice, about 500 s
 * in) and their starch and protein have gone into the cells (deposits or what fed on them). The wafers are
 * external inputs logged at realization ('habitat:H04_LEAF_POOL:M11'): without that entry the ledger is
 * 20 C and 2 N short and this test fails (mutant checked by hand).
 * H07 Glass Garden, Empty, lid closed, 2,000 ticks: mineral (silicate, grit) exact to 1e-9 relative.
 */
import { describe, expect, it } from 'vitest';
import { checkLedger, computeTotals, expectedTotals } from '../../src/sim/ledger';
import { run } from '../../src/sim/tick';
import { habitatRegistry, habitatStart } from '../helpers/habitats';

const reg = habitatRegistry();
const rel = (a: number, e: number) => (e === 0 ? Math.abs(a) : Math.abs(a - e) / Math.abs(e));

describe('Phase 5 habitats conserve materials', () => {
  it('H04 Leaf Pool, lid closed, 10,000 ticks: C, N, M within 0.001 %; both wafers emptied', () => {
    const w = habitatStart(reg, 'H04_LEAF_POOL', { lid: 'closed' });
    expect(w.settings.lid).toBe('closed');
    expect(w.objects.length).toBe(2);
    const emptied: number[] = [];
    const seen: number[] = [];
    let starchProteinBefore = 0;
    for (const f of ['starch', 'protein'] as const) for (const v of w.fields[f]!) starchProteinBefore += v;
    for (let t = 0; t < 10_000; t += 100) {
      run(w, 100);
      for (const e of w.events.ring) if (e.type === 'objectEmptied' && !seen.includes(e.id)) {
        seen.push(e.id);
        emptied.push(e.tick);
      }
    }
    const check = checkLedger(w);
    const actual = computeTotals(w);
    const expected = expectedTotals(w);
    expect(rel(actual.c, expected.c)).toBeLessThan(1e-5);
    expect(rel(actual.n, expected.n)).toBeLessThan(1e-5);
    expect(rel(actual.m, expected.m)).toBeLessThan(1e-5);
    expect(check.ok).toBe(true);
    expect(w.ledger.inputs).toEqual({ c: 20, n: 2, m: 0 });
    expect(w.objects.length).toBe(0);
    expect(emptied.length).toBe(2);
    expect(w.events.totals.objectEmptied).toBe(2);
    for (const t of emptied) {
      expect(t).toBeGreaterThan(4500);
      expect(t).toBeLessThan(5500);
    }
    // No organism in an Empty start: the wafers' carbon went into the cells' deposits.
    let starchProteinAfter = 0;
    for (const f of ['starch', 'protein'] as const) for (const v of w.fields[f]!) starchProteinAfter += v;
    expect(starchProteinAfter - starchProteinBefore).toBeCloseTo(20, 6);
  }, 600_000);

  it('H07 Glass Garden, lid closed, 2,000 ticks: mineral exact to 1e-9 relative', () => {
    const w = habitatStart(reg, 'H07_GLASS_GARDEN', { lid: 'closed' });
    const m0 = computeTotals(w).m;
    expect(m0).toBeGreaterThan(0);
    run(w, 2000);
    expect(rel(computeTotals(w).m, expectedTotals(w).m)).toBeLessThan(1e-9);
    expect(rel(computeTotals(w).m, m0)).toBeLessThan(1e-9);
  }, 600_000);
});
