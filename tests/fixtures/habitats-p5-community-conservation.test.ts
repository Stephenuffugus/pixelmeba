/**
 * Conservation in Suggested Community dishes (P5.4 part 2; CLAUDE.md "Conservation": closed-lid,
 * no-input worlds conserve to < 0.001 % over 10,000 ticks; SPEC §13.1; D-0128). H06 Dusk Marsh Suggested
 * (its own closed lid and light cycle) and H04 Leaf Pool Suggested with the lid override closed, no input
 * after tick 0, 10,000 ticks: carbon, nutrient and mineral within 1e-5 relative of the ledger's
 * expectation, and the ledger's inputs are exactly what realization logged (the community's organisms,
 * H04's wafers): nothing appears from nowhere while the community lives, feeds and dies.
 */
import { describe, expect, it } from 'vitest';
import { checkLedger, computeTotals, expectedTotals } from '../../src/sim/ledger';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { habitatRegistry, habitatStart } from '../helpers/habitats';

const reg = habitatRegistry();
const rel = (a: number, e: number) => (e === 0 ? Math.abs(a) : Math.abs(a - e) / Math.abs(e));

function closedRun(w: World): void {
  expect(w.settings.lid).toBe('closed');
  const inputs0 = { ...w.ledger.inputs };
  expect(inputs0.c).toBeGreaterThan(0);
  run(w, 10_000);
  expect(w.tick).toBe(10_000);
  const actual = computeTotals(w);
  const expected = expectedTotals(w);
  expect(rel(actual.c, expected.c)).toBeLessThan(1e-5);
  expect(rel(actual.n, expected.n)).toBeLessThan(1e-5);
  expect(rel(actual.m, expected.m)).toBeLessThan(1e-5);
  expect(checkLedger(w).ok).toBe(true);
  // No input after realization: the closed lid exchanges nothing.
  expect(w.ledger.inputs).toEqual(inputs0);
}

describe('Suggested Community dishes conserve materials', () => {
  it('H06 Dusk Marsh Suggested (closed lid, light cycle), 10,000 ticks: C, N, M within 0.001 %', () => {
    const w = habitatStart(reg, 'H06_DUSK_MARSH', { community: true });
    expect(w.settings.lightMode).toBe('cycle');
    closedRun(w);
  }, 900_000);

  it('H04 Leaf Pool Suggested, lid closed, 10,000 ticks: C, N, M within 0.001 %', () => {
    const w = habitatStart(reg, 'H04_LEAF_POOL', { community: true, lid: 'closed' });
    closedRun(w);
  }, 900_000);
});
