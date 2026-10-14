/**
 * Phase 5 wave 12, e2-light-algae: A05 Raftball's canopy (CT §1.2 A05, §12.2; SPEC §4.4, §4.10; D-0116; wave 9's
 * CANOPY factor in src/sim/climate.ts, keyed on the ability): effective light × 1/(1 + Σ CANOPY biomass / 10) over
 * a cell and its four neighbours.
 *  - one A05 (B 5) gives baseline × 1/(1 + 5/10) in its cell and its four neighbours, diagonals unshaded;
 *    two in one cell 1/(1 + 1); colonies in neighbouring cells sum;
 *  - the A05's own photosynthesis request uses the shaded light; an A01 and an A03 in a neighbour cell receive it
 *    (the A03 through its curve), each request exact against the closed form;
 *  - after the A05 dies the light recovers at the next stage 2;
 *  - the content prey lists of every species name A05 only for P08 (CT §3.2);
 *  - conservation: lid closed, no input, A05 + A01 + A03, 10,000 ticks in 20 chunks.
 *
 * LOW_LIGHT_CURVE and MIXOTROPHY are not in IMPLEMENTED_NATIVE_ABILITIES yet (the lead appends them at the wave 12
 * integration; D-0104), so REG uses allowUnimplemented; CANOPY is implemented since wave 9.
 */
import { describe, expect, it } from 'vitest';
import { AVAIL_K, DT } from '../../src/sim/constants';
import { cellIndex, maskCells } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { killEntity } from '../../src/sim/maintenance';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { run, step } from '../../src/sim/tick';
import { updateDerived } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, fillField, place, registry, setField } from '../helpers/world';

const SHIPPED = registry().manifest;
const REG = registryWith({ enabledSpecies: [...SHIPPED.enabledSpecies, 'A03', 'A04', 'A05'].sort() }, { allowUnimplemented: true });
const LONG = 600_000;
const BASE = 0.4;

const X = cellIndex(64, 64);
const NEIGHBOURS = [cellIndex(65, 64), cellIndex(64, 65), cellIndex(63, 64), cellIndex(64, 63)];
const DIAGONALS = [cellIndex(65, 65), cellIndex(63, 63), cellIndex(65, 63), cellIndex(63, 65)];
const availability = (a: number): number => (a <= 0 ? 0 : a / (a + AVAIL_K));
const canopy = (sum: number): number => 1 / (1 + sum / 10);

function dish(lid: 'open' | 'closed' = 'closed'): World {
  const w = clearWater({ lid }, REG);
  for (const cell of maskCells()) w.grid.lightBase[cell] = BASE;
  w.grid.geometryVersion++;
  updateDerived(w);
  fillField(w, 'nutrient', 5);
  return w;
}

describe('the A05 canopy factor', () => {
  it('one A05 (B 5): baseline × 1/(1 + 5/10) in its cell and its four neighbours; diagonals unshaded', () => {
    const w = dish();
    const s = place(w, 'A05', 64.5, 64.5);
    expect(w.ents.cols.B[s]).toBe(5);
    updateDerived(w);
    expect(w.derived.light[X]).toBe(BASE * canopy(5));
    for (const n of NEIGHBOURS) expect(w.derived.light[n]).toBe(BASE * canopy(5));
    for (const d of DIAGONALS) expect(w.derived.light[d]).toBe(BASE);
    expect(w.derived.light[cellIndex(66, 64)]).toBe(BASE);
  });

  it('two in one cell: 1/(1 + 1); colonies in neighbouring cells sum', () => {
    const w = dish();
    place(w, 'A05', 64.3, 64.5);
    place(w, 'A05', 64.7, 64.5);
    updateDerived(w);
    expect(w.derived.light[X]).toBe(BASE * 0.5);
    for (const n of NEIGHBOURS) expect(w.derived.light[n]).toBe(BASE * 0.5);
    const v = dish();
    place(v, 'A05', 64.5, 64.5);
    place(v, 'A05', 65.5, 64.5);
    updateDerived(v);
    expect(v.derived.light[X]).toBe(BASE * canopy(10)); // its own 5 + the east neighbour's 5
    expect(v.derived.light[cellIndex(65, 64)]).toBe(BASE * canopy(10));
    expect(v.derived.light[cellIndex(63, 64)]).toBe(BASE * canopy(5));
    expect(v.derived.light[cellIndex(66, 64)]).toBe(BASE * canopy(5));
    expect(v.derived.light[cellIndex(65, 65)]).toBe(BASE * canopy(5)); // south of the east colony, diagonal to X
  });

  it('the A05 requests on its shaded light; an A01 and an A03 next to it receive the shade (A03 through its curve)', () => {
    const w = dish();
    const a05 = place(w, 'A05', 64.5, 64.5);
    const a01 = place(w, 'A01', 65.5, 64.5);
    const a03 = place(w, 'A03', 63.5, 64.5);
    step(w);
    const c = w.ents.cols;
    const slots = [a05, a01, a03];
    const cells = slots.map((s) => cellIndex(Math.floor(c.x[s]!), Math.floor(c.y[s]!)));
    const acc: number[] = [];
    const light: number[] = [];
    const B05 = c.B[a05]!;
    step(w, {
      afterStage: (st, world) => {
        if (st !== 5) return;
        for (const [k, s] of slots.entries()) {
          setField(world, 'co2', cells[k]!, 0.5);
          c.intakeAccum[s] = 0; // so the stage 6 addition is read exactly (test-only observation counter)
          acc[k] = c.intakeAccum[s]!;
          light[k] = world.derived.light[cells[k]!]!;
        }
      },
    });
    // Stage 2 read the A05's biomass at the start of the tick.
    for (const L of light) expect(L).toBe(BASE * canopy(B05));
    const req = (s: number, response: number): number => Math.min(0.5, profileOf(w, s).q * c.suitability[s]! * DT * 1 * response * availability(0.5));
    for (const s of slots) expect(c.suitability[s]).toBe(1);
    expect(Object.is(c.intakeAccum[a05]! - acc[0]!, Math.min(0.5, profileOf(w, a05).q * c.suitability[a05]! * DT * 1 * light[0]! * availability(0.5)))).toBe(true);
    expect(Object.is(c.intakeAccum[a01]! - acc[1]!, req(a01, light[1]!))).toBe(true);
    expect(Object.is(c.intakeAccum[a03]! - acc[2]!, req(a03, Math.min(1, light[2]! / 0.3)))).toBe(true);
    expect(light[2]! / 0.3).toBeLessThan(1); // 0.267: the A03 is on the rising part of its curve
    expect(c.limitCode[a03]).toBe(R.FOOD_ACCESS_LOW); // response 0.889 > avail 0.833: CO2 access binds
  });

  it('after the A05 dies, the light recovers at the next stage 2', () => {
    const w = dish();
    const s = place(w, 'A05', 64.5, 64.5);
    run(w, 3);
    expect(w.derived.light[X]).toBeLessThan(BASE);
    killEntity(w, s, R.DEATH_AGE);
    let atStage2 = -1;
    step(w, { afterStage: (st, world) => st === 2 && (atStage2 = world.derived.light[X]!) });
    expect(atStage2).toBe(BASE);
    for (const n of NEIGHBOURS) expect(w.derived.light[n]).toBe(BASE);
  });

  it('the content prey lists name A05 only for P08 (CT §3.2 "A05 is prey only for P08")', () => {
    const all = registry().species;
    const eaters = Object.keys(all)
      .sort()
      .filter((id) => all[id]!.prey.some((p) => p.id === 'A05'));
    expect(eaters).toEqual(['P08']);
  });
});

describe('A05 conservation', () => {
  it(
    'lid closed, no input, A05 + A01 + A03, 10,000 ticks in 20 chunks: relErr < 1e-5 for C and N',
    () => {
      const w = dish('closed');
      for (let k = 0; k < 4; k++) place(w, 'A05', 50.5 + 4 * k, 64.5);
      for (let k = 0; k < 8; k++) place(w, 'A01', 49.5 + 2 * k, 65.5);
      for (let k = 0; k < 8; k++) place(w, 'A03', 49.5 + 2 * k, 63.5);
      const inputs = { ...w.ledger.inputs };
      const worstAbs = { c: 0, n: 0 };
      for (let k = 0; k < 20; k++) {
        run(w, 500);
        const check = checkLedger(w);
        expect(check.ok, `tick ${w.tick}: ${JSON.stringify(check)}`).toBe(true);
        expect(check.relErr.c).toBeLessThan(1e-5);
        expect(check.relErr.n).toBeLessThan(1e-5);
        for (const e of ['c', 'n'] as const) worstAbs[e] = Math.max(worstAbs[e], Math.abs(check.actual[e] - check.expected[e]));
      }
      expect(w.tick).toBe(10000);
      expect(w.ledger.inputs).toEqual(inputs);
      expect(w.ledger.exchangeC).toBe(0);
      expect(worstAbs.c).toBeLessThan(1e-8);
      expect(worstAbs.n).toBeLessThan(1e-8);
      expect(w.events.totals.birth ?? 0).toBeGreaterThan(0);
    },
    LONG,
  );
});
