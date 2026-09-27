/**
 * G1 fixture: photosynthesis (P1.1; SPEC §6.5; CT §2). Sunbeads fix CO2 in light only:
 *  - light 0 ⇒ zero intake (no carbon fixed, no O2 or sugar made, limit reported as light);
 *  - with light, under a closed lid, organism carbon and O2 rise while CO2 falls by exactly the
 *    carbon fixed (half to biomass, half to sugar, 0.5 O2 per carbon) and the ledger closes;
 *  - half the light gives half the intake (CO2 not limiting).
 */
import { describe, expect, it } from 'vitest';
import { BIOMASS_FRACTION, DT, PHOTO_O2_PER_CARBON, PHOTO_SUGAR_FRACTION } from '../../src/sim/constants';
import { checkLedger } from '../../src/sim/ledger';
import { maskCells } from '../../src/sim/grid';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { aliveOf, clearWater, place } from '../helpers/world';

function total(w: World, id: 'oxygen' | 'co2' | 'sugar'): number {
  const arr = w.fields[id]!;
  let s = 0;
  for (const cell of maskCells()) s += arr[cell]!;
  return s;
}

function bodyCarbon(w: World): number {
  let s = 0;
  for (const i of aliveOf(w)) s += w.ents.cols.B[i]!;
  return s;
}

/** Closed-lid clear water (no gas exchange) with the dish light set uniformly. */
function sunbeads(light: number, count: number): { w: World; slots: number[] } {
  const w = clearWater();
  w.settings.lid = 'closed';
  w.grid.lightBase.fill(light);
  w.grid.geometryVersion++; // light baseline changed: derived light must be recomputed
  const slots: number[] = [];
  for (let k = 0; k < count; k++) slots.push(place(w, 'A01', 60.5 + k * 3, 64.5));
  return { w, slots };
}

describe('G1 photosynthesis (P1.1)', () => {
  it('light 0 ⇒ zero intake: no carbon fixed, no O2 or sugar made, energy falls by maintenance only', () => {
    const { w, slots } = sunbeads(0, 3);
    const c = w.ents.cols;
    const o2 = total(w, 'oxygen');
    const co2 = total(w, 'co2');
    const E0 = slots.map((s) => c.E[s]!);
    run(w, 100);
    for (const [k, s] of slots.entries()) {
      expect(c.B[s]).toBe(1.5);
      expect(c.lastIntakeTick[s]).toBe(-1);
      expect(c.limitCode[s]).toBe(R.LIGHT_LIMITED);
      const prof = profileOf(w, s);
      expect(c.E[s]).toBeCloseTo(E0[k]! - 100 * (prof.m + prof.upkeep) * DT, 9);
    }
    expect(total(w, 'oxygen')).toBeCloseTo(o2, 9);
    expect(total(w, 'co2')).toBeCloseTo(co2, 9);
    expect(total(w, 'sugar')).toBe(0);
    expect(w.ledger.energy.earned).toBe(0);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('with light, organism carbon and O2 rise as CO2 is fixed, and the ledger closes', () => {
    const { w } = sunbeads(0.8, 3);
    const o2 = total(w, 'oxygen');
    const co2 = total(w, 'co2');
    const body = bodyCarbon(w);
    run(w, 300);
    const fixed = co2 - total(w, 'co2');
    expect(fixed).toBeGreaterThan(0);
    expect(bodyCarbon(w) - body).toBeGreaterThan(0);
    expect(total(w, 'oxygen') - o2).toBeGreaterThan(0);
    // Closed lid, no consumers: every change traces to fixation.
    expect((bodyCarbon(w) - body) / fixed).toBeCloseTo(BIOMASS_FRACTION, 9);
    expect(total(w, 'sugar') / fixed).toBeCloseTo(PHOTO_SUGAR_FRACTION, 9);
    expect((total(w, 'oxygen') - o2) / fixed).toBeCloseTo(PHOTO_O2_PER_CARBON, 9);
    expect(w.ledger.energy.earned).toBeGreaterThan(0);
    expect(w.ledger.exchangeC).toBe(0);
    expect(checkLedger(w).ok).toBe(true);
    console.info(`photosynthesis: 3 Sunbeads, 300 ticks at light 0.8 fixed ${fixed.toFixed(6)} C; O2 +${(total(w, 'oxygen') - o2).toFixed(6)}`);
  });

  it('scales with light: half the light gives half the intake (CO2 not limiting)', () => {
    const gain = (light: number) => {
      const w = clearWater();
      w.grid.lightBase.fill(light);
      w.grid.geometryVersion++;
      const s = place(w, 'A01', 64.5, 64.5);
      run(w, 1);
      return w.ents.cols.B[s]! - 1.5;
    };
    const full = gain(0.8);
    const half = gain(0.4);
    expect(full).toBeGreaterThan(0);
    expect(half / full).toBeCloseTo(0.5, 6);
  });
});
