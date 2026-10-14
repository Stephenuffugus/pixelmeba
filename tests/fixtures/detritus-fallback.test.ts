/**
 * P5.5 (Phase 5 wave 12, e3-predation): P09 Wheelgrazer's native DETRITUS_FALLBACK (SPEC §6.5 route 1 "Held
 * meal > 0 ⇒ meal route ... carriers with an empty meal may use the detritus route; a capture this tick
 * cancels a detritus request"; CT §1.2 P09 "aerobic (meal / detritus)", §3.2; D-0122; src/sim/debrisFeeder.ts).
 *
 * DETRITUS_FALLBACK sets Profile.debrisFeeder (phenotype.ts), so P09 takes E08's ROUTE_DETRITUS. Before wave 12
 * P09 reached detritus through its foodPriority ['detritus'] on the field route with the same request; the
 * "HEAD" dish below rebuilds that path by dropping the ability from the dish's runtime species record, and
 * the two dishes eat exactly the same amounts (only the route, its cue and its label differ).
 *
 * P09 (and A02–A04 as its prey) are not enabled (D-0104): test registry with allowUnimplemented, because
 * DETRITUS_FALLBACK (and HANDLING, RADIUS_CAPTURE) join IMPLEMENTED_NATIVE_ABILITIES at the wave 12 integration.
 */
import { describe, expect, it } from 'vitest';
import { DT } from '../../src/sim/constants';
import { FLAG } from '../../src/sim/entities';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex, maskCells } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { preyAllowed } from '../../src/sim/movement';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { rebuildIndex } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import { speciesIndex, type World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, fillField, place, registry, setField } from '../helpers/world';

const shipped = registry().manifest;
const REG_P = registryWith(
  {
    enabledSpecies: [...shipped.enabledSpecies, 'A02', 'A03', 'A04', 'P05', 'P06', 'P07', 'P09', 'P10'].sort(),
    enabledSystems: [...shipped.enabledSystems, 'silicate'].sort() as SystemFlag[],
  },
  { allowUnimplemented: true }, // DETRITUS_FALLBACK, HANDLING, RADIUS_CAPTURE: appended by the lead at integration
);

const X = 60.5;
const Y = 64.5;
const CELL = cellIndex(60, 64);

/**
 * A closed clear-water dish with ample O2 and nutrient. `head`: P09's runtime record without DETRITUS_FALLBACK,
 * i.e. the field route it took before wave 12 (set before any profile is derived).
 */
function dish(head = false): World {
  const w = clearWater({}, REG_P);
  w.settings.lid = 'closed';
  fillField(w, 'oxygen', 5);
  fillField(w, 'nutrient', 1);
  if (head) {
    const k = speciesIndex(w, 'P09');
    const sp = w.species[k]!;
    (w.species as unknown as Record<number, unknown>)[k] = { ...sp, abilities: sp.abilities.filter((a) => a !== 'DETRITUS_FALLBACK') };
  }
  return w;
}

function detritus(w: World, cell: number, amount: number, ratio: number): void {
  setField(w, 'detritus', cell, amount);
  setField(w, 'detritusN', cell, amount * ratio);
}

function total(w: World, id: 'detritus' | 'detritusN' | 'nutrient' | 'co2' | 'metabolite' | 'oxygen'): number {
  const a = w.fields[id]!;
  let s = 0;
  for (const k of maskCells()) s += a[k]!;
  return s;
}

interface Watch {
  det5: number;
  det6: number;
  detN5: number;
  detN6: number;
  meal5: number;
  pools5: Record<string, number>;
  pools6: Record<string, number>;
  budget: number;
}

/** One tick, recording stage 6's change of the pools and the P09's meal and budget after stage 5. */
function tickWatching(w: World, s: number): Watch {
  const c = w.ents.cols;
  const out: Watch = { det5: 0, det6: 0, detN5: 0, detN6: 0, meal5: 0, pools5: {}, pools6: {}, budget: 0 };
  const pools = () => ({ nutrient: total(w, 'nutrient'), co2: total(w, 'co2'), metabolite: total(w, 'metabolite'), oxygen: total(w, 'oxygen') });
  step(w, {
    afterStage: (stage) => {
      if (stage === 5) {
        out.det5 = total(w, 'detritus');
        out.detN5 = total(w, 'detritusN');
        out.meal5 = c.mealC[s]!;
        out.pools5 = pools();
      }
      if (stage === 6) {
        out.det6 = total(w, 'detritus');
        out.detN6 = total(w, 'detritusN');
        out.pools6 = pools();
        out.budget = profileOf(w, s).q * c.suitability[s]! * DT; // no crowding here
      }
    },
  });
  return out;
}

const avail = (a: number) => a / (a + 0.1);

describe('P09 DETRITUS_FALLBACK (P5.5)', () => {
  it('with no meal on detritus 0.5 it requests exactly min(0.5, 0.85 × suitability × 0.1 × avail(0.5)) on the detritus route', () => {
    const w = dish();
    detritus(w, CELL, 0.5, 0.15);
    const s = place(w, 'P09', X, Y, { E: 50 });
    const c = w.ents.cols;
    expect(profileOf(w, s).debrisFeeder).toBe(true);
    const N0 = c.N[s]!;
    const B0 = c.B[s]!;
    const earned0 = w.ledger.energy.earned;
    const t = tickWatching(w, s);
    const Cs = t.det5 - t.det6;
    expect(t.meal5).toBe(0);
    expect(c.suitability[s]).toBeGreaterThan(0);
    expect(t.budget).toBeCloseTo(0.85 * c.suitability[s]! * DT, 15);
    expect(Cs).toBeCloseTo(Math.min(0.5, t.budget * avail(0.5)), 14);
    expect(Cs).toBeLessThanOrEqual(t.budget + 1e-15); // never more than one budget
    expect(c.flags[s]! & FLAG.detritusIntake).not.toBe(0);
    expect(c.flags[s]! & FLAG.feeding).not.toBe(0);
    // ROUTE_DETRITUS's conversion: bound N first (0.15 per C carried, 0.05 kept, the rest to the free pool),
    // B 0.50, CO2 0.30, metabolite 0.20, O2 −0.30 per C, 30 E per C.
    expect(t.detN5 - t.detN6).toBeCloseTo(0.15 * Cs, 12);
    expect(c.N[s]! - N0).toBeCloseTo(0.05 * Cs, 12);
    expect(c.B[s]! - B0).toBeCloseTo(0.5 * Cs, 12);
    expect(t.pools6.nutrient! - t.pools5.nutrient!).toBeCloseTo(0.1 * Cs, 10);
    expect(t.pools6.co2! - t.pools5.co2!).toBeCloseTo(0.3 * Cs, 10);
    expect(t.pools6.metabolite! - t.pools5.metabolite!).toBeCloseTo(0.2 * Cs, 10);
    expect(t.pools5.oxygen! - t.pools6.oxygen!).toBeCloseTo(0.3 * Cs, 10);
    expect(w.ledger.energy.earned - earned0).toBeCloseTo(30 * Cs, 9);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('the amount equals the pre-wave-12 field route for the same state; only the route, cue and label differ', () => {
    for (const amount of [0.5, 0.02, 3]) {
      const now = dish();
      const head = dish(true);
      for (const w of [now, head]) detritus(w, CELL, amount, 0.1);
      const a = place(now, 'P09', X, Y, { E: 50 });
      const b = place(head, 'P09', X, Y, { E: 50 });
      expect(profileOf(head, b).debrisFeeder).toBe(false);
      for (let k = 0; k < 5; k++) {
        tickWatching(now, a);
        tickWatching(head, b);
        for (const id of Object.keys(now.fields).sort() as (keyof World['fields'])[]) {
          expect(Buffer.from(now.fields[id]!.buffer).equals(Buffer.from(head.fields[id]!.buffer))).toBe(true);
        }
        for (const col of ['B', 'N', 'E', 'x', 'y'] as const) expect(Object.is(now.ents.cols[col][a], head.ents.cols[col][b])).toBe(true);
        expect(now.ents.cols.flags[a]! & FLAG.detritusIntake).not.toBe(0);
        expect(head.ents.cols.flags[b]! & FLAG.detritusIntake).toBe(0);
        expect(now.ents.cols.flags[a]! & ~FLAG.detritusIntake).toBe(head.ents.cols.flags[b]!);
      }
    }
  });

  it('with a held meal it digests the meal only: the detritus is untouched', () => {
    const w = dish();
    detritus(w, CELL, 0.5, 0.1);
    const s = place(w, 'P09', X, Y, { E: 50 });
    const c = w.ents.cols;
    c.mealC[s] = 1;
    c.mealN[s] = 0.05;
    w.ledger.inputs.c += 1;
    w.ledger.inputs.n += 0.05;
    const t = tickWatching(w, s);
    expect(t.det6).toBe(t.det5);
    expect(t.detN6).toBe(t.detN5);
    expect(c.mealC[s]).toBeLessThan(1);
    expect(c.flags[s]! & FLAG.detritusIntake).toBe(0);
    expect(c.limitCode[s]).toBe(R.MEAL_DIGESTING);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('on a capture tick the meal route wins: the detritus is untouched', () => {
    const w = dish();
    detritus(w, CELL, 0.5, 0.1);
    const s = place(w, 'P09', X, Y, { E: 50 });
    const prey = place(w, 'A03', X + 0.1, Y);
    const birth = w.ents.cols.birthId[prey]!;
    rebuildIndex(w);
    const t = tickWatching(w, s);
    expect(w.ents.refValid(prey, birth)).toBe(false);
    expect(t.meal5).toBeGreaterThan(0);
    expect(t.det6).toBe(t.det5);
    expect(w.ents.cols.flags[s]! & FLAG.detritusIntake).toBe(0);
    expect(w.ents.cols.limitCode[s]).toBe(R.MEAL_DIGESTING);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('no meal and no detritus: no request, no intake', () => {
    const w = dish();
    const s = place(w, 'P09', X, Y, { E: 50 });
    const t = tickWatching(w, s);
    expect(t.det6).toBe(t.det5);
    expect(w.ents.cols.flags[s]! & (FLAG.feeding | FLAG.detritusIntake)).toBe(0);
    expect(w.ents.cols.limitCode[s]).toBe(R.FOOD_NONE_COMPATIBLE);
  });

  it('hunts A02, A03, A04 and Y02 only', () => {
    const w = dish();
    const s = place(w, 'P09', X, Y, { E: 50 });
    const sp = w.species[w.ents.cols.species[s]!]!;
    const allowed: string[] = [];
    let k = 0;
    for (const id of REG_P.manifest.enabledSpecies) {
      if (id === 'V01') continue; // a field virus
      const slot = place(w, id, 30.5 + (k % 10) * 3, 40.5 + Math.floor(k / 10) * 3);
      if (preyAllowed(w, sp, slot)) allowed.push(id);
      k++;
    }
    expect(allowed).toEqual(['A02', 'A03', 'A04', 'Y02']);
  });
});
