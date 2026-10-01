/**
 * P3.3 Dusk suitability fixture (SPEC §6.3 "Special: B03 Dusk × clamp(1 − O2/0.40, 0, 1)"; CT §1.1,
 * §2; content/species/B03.json OXYGEN_SUPPRESSED; src/sim/suitability.ts).
 *
 * 1. The oxygen factor is exactly 1, 0.75, 0.5 and 0 at O2 0, 0.10, 0.20 and ≥ 0.40, and the weakest
 *    factor is reported as SUIT_OXYGEN_HIGH whenever oxygen lowers it. Other species ignore oxygen in
 *    suitability (it limits aerobic intake instead, SPEC §6.5).
 * 2. A closed, low-oxygen sediment dish with Sprinters and Dusk on sugar: oxygen falls as Sprinters
 *    breathe it, Sprinters record OXYGEN_LIMITED, and Dusk's suitability rises.
 *    Why sediment at O2 0.10 (PROPOSED DECISION in docs/reports/reviews/g3-wave-2/organisms-build.md):
 *    in a Water Garden (O2 0.80 everywhere) the dish runs out of sugar long before oxygen (0.80 O2 per
 *    cell against 0.30 O2 per carbon eaten, sugar 0.50 per cell) and fast water diffusion refills any
 *    local dip, so no Sprinter is ever oxygen-limited there, and Dusk at O2 ≥ 0.40 has suitability 0
 *    and dies of stress within 50 s. Slow sediment diffusion and a closed lid let the colony draw its
 *    own oxygen down.
 */
import { describe, expect, it } from 'vitest';
import { applyNow } from '../../src/sim/commands';
import { brushCells, cellIndex, maskCells, SUB_SEDIMENT } from '../../src/sim/grid';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { suitabilityAt } from '../../src/sim/suitability';
import { step } from '../../src/sim/tick';
import { speciesIndex } from '../../src/sim/world';
import { aliveOf, clearWater, fillField, place } from '../helpers/world';

describe('Dusk is suppressed by oxygen (P3.3)', () => {
  it('factor 1, 0.75, 0.5, 0 at O2 0, 0.10, 0.20, ≥ 0.40, reported as SUIT_OXYGEN_HIGH; Sprinter ignores oxygen here', () => {
    const w = clearWater();
    const dusk = place(w, 'B03', 64.5, 64.5);
    const sprinter = place(w, 'B01', 64.5, 64.5);
    const spD = w.species[speciesIndex(w, 'B03')]!;
    const spS = w.species[speciesIndex(w, 'B01')]!;
    expect(spD.abilities).toContain('OXYGEN_SUPPRESSED');
    expect(spS.abilities).not.toContain('OXYGEN_SUPPRESSED');
    const cases: [number, number][] = [
      [0, 1],
      [0.1, 0.75],
      [0.2, 0.5],
      [0.3, 0.25],
      [0.4, 0],
      [0.8, 0],
      [1.5, 0],
    ];
    for (const [o2, factor] of cases) {
      const cell = cellIndex(40 + Math.round(o2 * 10), 64);
      w.fields.oxygen![cell] = o2;
      const s = suitabilityAt(w, spD, profileOf(w, dusk), cell);
      // Exact at the four tabled points; 0.30 differs from 0.25 by float rounding (0.3/0.4).
      if (o2 === 0.3) expect(s.value).toBeCloseTo(factor, 14);
      else expect(s.value, `O2 ${o2}`).toBe(factor);
      expect(s.reason, `O2 ${o2}`).toBe(factor < 1 ? R.SUIT_OXYGEN_HIGH : R.NONE);
      const other = suitabilityAt(w, spS, profileOf(w, sprinter), cell);
      expect(other.value).toBe(1);
      expect(other.reason).toBe(R.NONE);
    }
  });

  it('a closed low-oxygen sediment dish: O2 falls, Sprinters become OXYGEN_LIMITED, Dusk suitability rises', () => {
    const w = clearWater();
    for (const c of maskCells()) w.grid.substrate[c] = SUB_SEDIMENT;
    w.grid.geometryVersion++;
    expect(applyNow(w, 'lid', { kind: 'setLid', lid: 'closed' }).result!.accepted).toBeGreaterThan(0);
    expect(w.settings.lid).toBe('closed');
    fillField(w, 'oxygen', 0.1);
    fillField(w, 'sugar', 0.5);
    fillField(w, 'nutrient', 0.2);
    expect(applyNow(w, 'a', { kind: 'inoculate', speciesId: 'B01', x: 50.5, y: 70.5, radius: 3, count: 20 }).result!.accepted).toBe(20);
    expect(applyNow(w, 'b', { kind: 'inoculate', speciesId: 'B03', x: 50.5, y: 70.5, radius: 3, count: 20 }).result!.accepted).toBe(20);
    const patch = brushCells(50.5, 70.5, 3);
    const o2 = () => patch.reduce((a, c) => a + w.fields.oxygen![c]!, 0) / patch.length;
    const duskSuit = () => {
      const d = aliveOf(w, 'B03');
      return d.reduce((a, s) => a + w.ents.cols.suitability[s]!, 0) / d.length;
    };
    step(w);
    const o2Start = o2();
    const suitStart = duskSuit();
    expect(suitStart).toBeCloseTo(1 - 0.1 / 0.4, 1);
    let oxygenLimited = 0;
    for (let t = 0; t < 300; t++) {
      step(w);
      for (const s of aliveOf(w, 'B01')) if (w.ents.cols.limitCode[s] === R.OXYGEN_LIMITED) oxygenLimited++;
    }
    expect(o2()).toBeLessThan(o2Start * 0.5);
    expect(oxygenLimited).toBeGreaterThan(0);
    expect(duskSuit()).toBeGreaterThan(suitStart + 0.1);
    expect(aliveOf(w, 'B03').length).toBeGreaterThanOrEqual(20);
  });
});
