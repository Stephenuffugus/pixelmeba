/**
 * Phase 5 wave 12, e2-light-algae: A03 Shadeleaf's low-light curve (SPEC §6.5 route 2; CT §1.2 A03 "light/0.30";
 * src/sim/mixotrophy.ts lowLightResponse; src/sim/intake.ts).
 *  - per tick, an A03 at suitability 1 with CO2 0.5 (avail 0.5/0.6) requests exactly q × suit × dt ×
 *    min(1, L/0.30) × avail at L = 0.15 (response 0.5), 0.30 and 0.60 (response 1: no gain above 0.30), and an
 *    A01 beside it exactly q × suit × dt × L × avail (Object.is against the closed form, in the code's order);
 *  - LIGHT_LIMITED with limitValue = L for the A03 below 0.30 when it binds, not at or above 0.30;
 *  - its products are 0.50 B, 0.50 sugar and 0.50 O2 per fixed C;
 *  - E06 is refused for A03 (CT §7.1 "not native A03");
 *  - NEUTRAL: a dish of A01 and shipped species under the shipped registry and under REG (A03–A05 recorded, none
 *    placed) keeps byte-identical entity columns and fields (Object.is) over 2,000 ticks.
 *
 * LOW_LIGHT_CURVE and MIXOTROPHY are not in IMPLEMENTED_NATIVE_ABILITIES yet (the lead appends them at the wave 12
 * integration; nothing is enabled before the organism flip, D-0104), so REG uses allowUnimplemented. CANOPY is
 * implemented since wave 9.
 */
import { describe, expect, it } from 'vitest';
import { AVAIL_K, BIOMASS_FRACTION, DT, PHOTO_O2_PER_CARBON, PHOTO_SUGAR_FRACTION } from '../../src/sim/constants';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { ENTITY_COLUMNS } from '../../src/sim/entities';
import { FIELD_IDS } from '../../src/sim/fields';
import { cellIndex, maskCells } from '../../src/sim/grid';
import { validateModuleSet } from '../../src/sim/modules';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { realizeRecipe } from '../../src/sim/recipes';
import { run, step } from '../../src/sim/tick';
import { updateDerived } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, fillField, place, placeWith, preOrganismFlipRegistry, registry, setField } from '../helpers/world';

const SHIPPED = registry().manifest;
const REG = registryWith({ enabledSpecies: [...SHIPPED.enabledSpecies, 'A03', 'A04', 'A05'].sort() }, { allowUnimplemented: true });
const LONG = 600_000;

function dish(light: number): World {
  const w = clearWater({ lid: 'closed' }, REG);
  for (const cell of maskCells()) w.grid.lightBase[cell] = light;
  w.grid.geometryVersion++;
  updateDerived(w);
  fillField(w, 'nutrient', 5);
  return w;
}

const availability = (a: number): number => (a <= 0 ? 0 : a / (a + AVAIL_K));

interface TickRead {
  fixed: number;
  dB: number;
  dSugar: number;
  dO2: number;
}

/** One tick with CO2 held at `co2` in the organism's cell right before stage 6; what stage 6 fixed and reported. */
function oneTick(w: World, s: number, co2: number): { fixed: number; code: number; value: number } {
  const c = w.ents.cols;
  const cell = cellIndex(Math.floor(c.x[s]!), Math.floor(c.y[s]!));
  let acc0 = 0;
  step(w, {
    afterStage: (st, world) => {
      if (st !== 5) return;
      setField(world, 'co2', cell, co2);
      c.intakeAccum[s] = 0; // so the stage 6 addition is read exactly (an observation counter)
      acc0 = c.intakeAccum[s]!;
    },
  });
  return { fixed: c.intakeAccum[s]! - acc0, code: c.limitCode[s]!, value: c.limitValue[s]! };
}

/** Like oneTick, but reads B, sugar and O2 right after stage 6 (the products of that intake alone). */
function products(w: World, s: number, co2: number): TickRead {
  const c = w.ents.cols;
  const cell = cellIndex(Math.floor(c.x[s]!), Math.floor(c.y[s]!));
  const r: TickRead = { fixed: 0, dB: 0, dSugar: 0, dO2: 0 };
  let B0 = 0;
  let sugar0 = 0;
  let o20 = 0;
  let acc0 = 0;
  step(w, {
    afterStage: (st, world) => {
      if (st === 5) {
        setField(world, 'co2', cell, co2);
        B0 = c.B[s]!;
        sugar0 = world.fields.sugar![cell]!;
        o20 = world.fields.oxygen![cell]!;
        acc0 = c.intakeAccum[s]!;
      } else if (st === 6) {
        r.fixed = c.intakeAccum[s]! - acc0;
        r.dB = c.B[s]! - B0;
        r.dSugar = world.fields.sugar![cell]! - sugar0;
        r.dO2 = world.fields.oxygen![cell]! - o20;
      }
    },
  });
  return r;
}

describe('A03 low-light curve: the photosynthetic request', () => {
  for (const L of [0.15, 0.3, 0.6]) {
    it(`at light ${L}: A03 requests q·dt·min(1, L/0.30)·avail, A01 q·dt·L·avail (exact)`, () => {
      const w = dish(L);
      const a03 = place(w, 'A03', 60.5, 64.5);
      const a01 = place(w, 'A01', 62.5, 64.5);
      step(w); // suitability settles
      const c = w.ents.cols;
      expect(c.suitability[a03]).toBe(1);
      expect(c.suitability[a01]).toBe(1);
      expect(profileOf(w, a03).q).toBeCloseTo(0.1, 12);
      expect(profileOf(w, a01).q).toBeCloseTo(0.16, 12);
      // Both in one tick (each in its own cell, CO2 0.5 in both).
      const cA03 = cellIndex(60, 64);
      const cA01 = cellIndex(62, 64);
      let acc03 = 0;
      let acc01 = 0;
      let light = -1;
      step(w, {
        afterStage: (st, world) => {
          if (st !== 5) return;
          setField(world, 'co2', cA03, 0.5);
          setField(world, 'co2', cA01, 0.5);
          c.intakeAccum[a03] = 0; // so the stage 6 addition is read exactly (an observation counter)
          c.intakeAccum[a01] = 0;
          acc03 = c.intakeAccum[a03]!;
          acc01 = c.intakeAccum[a01]!;
          light = world.derived.light[cA03]!;
          expect(world.derived.light[cA01]).toBe(light);
        },
      });
      expect(light).toBe(L);
      const resp = Math.min(1, L / 0.3);
      const b03 = profileOf(w, a03).q * c.suitability[a03]! * DT * 1;
      const b01 = profileOf(w, a01).q * c.suitability[a01]! * DT * 1;
      const want03 = Math.min(0.5, b03 * resp * availability(0.5));
      const want01 = Math.min(0.5, b01 * L * availability(0.5));
      expect(Object.is(c.intakeAccum[a03]! - acc03, want03)).toBe(true);
      expect(Object.is(c.intakeAccum[a01]! - acc01, want01)).toBe(true);
      // The closed forms of the assignment (0.10 × 1 × 0.1 × min(1, L/0.30) × 0.5/0.6; 0.16 × 0.1 × L × 0.5/0.6).
      expect(want03).toBeCloseTo(0.1 * 0.1 * resp * (0.5 / 0.6), 14);
      expect(want01).toBeCloseTo(0.16 * 0.1 * L * (0.5 / 0.6), 14);
    });
  }

  it('no gain above 0.30: the A03 request at 0.30 equals the one at 0.60, bit for bit', () => {
    const at = (L: number) => {
      const w = dish(L);
      const s = place(w, 'A03', 60.5, 64.5);
      step(w);
      return oneTick(w, s, 0.5).fixed;
    };
    const a = at(0.3);
    expect(Object.is(at(0.6), a)).toBe(true);
    expect(Object.is(at(1), a)).toBe(true);
    expect(at(0.15)).toBeCloseTo(a / 2, 15);
  });

  it('LIGHT_LIMITED with limitValue = L below 0.30 when it binds; not at or above 0.30', () => {
    for (const [L, limited] of [
      [0.15, true],
      [0.06, true],
      [0.3, false],
      [0.6, false],
    ] as const) {
      const w = dish(L);
      const s = place(w, 'A03', 60.5, 64.5);
      step(w);
      const r = oneTick(w, s, 0.5);
      if (limited) {
        expect(r.code).toBe(R.LIGHT_LIMITED);
        expect(r.value).toBe(L);
      } else {
        expect(r.code).not.toBe(R.LIGHT_LIMITED);
        // Its food access is the CO2 it got against its low-light ceiling: avail(0.5) = 0.833 < 0.95.
        expect(r.code).toBe(R.FOOD_ACCESS_LOW);
        expect(r.value).toBeCloseTo(availability(0.5), 12);
      }
    }
  });

  it('products: 0.50 B, 0.50 sugar and 0.50 O2 per fixed C', () => {
    const w = dish(0.2);
    const s = place(w, 'A03', 60.5, 64.5);
    step(w);
    const r = products(w, s, 0.5);
    expect(r.fixed).toBeGreaterThan(0);
    expect(r.dB / r.fixed).toBeCloseTo(BIOMASS_FRACTION, 9);
    expect(r.dSugar / r.fixed).toBeCloseTo(PHOTO_SUGAR_FRACTION, 9);
    expect(r.dO2 / r.fixed).toBeCloseTo(PHOTO_O2_PER_CARBON, 9);
    expect(BIOMASS_FRACTION).toBe(0.5);
    expect(PHOTO_SUGAR_FRACTION).toBe(0.5);
    expect(PHOTO_O2_PER_CARBON).toBe(0.5);
  });

  it('E06 is refused for A03 (CT §7.1 "not native A03"), and accepted for A01 and A04', () => {
    const w = dish(0.5);
    expect(validateModuleSet(w, 'A03', ['E06'])).toMatch(/.+/);
    expect(validateModuleSet(w, 'A01', ['E06'])).toBeNull();
    expect(validateModuleSet(w, 'A04', ['E06'])).toBeNull();
    expect(() => placeWith(w, 'A03', 60.5, 64.5, ['E06'])).toThrow();
  });
});

describe('NEUTRAL: shipped species keep their exact behavior in a dish that records A03, A04 and A05', () => {
  function shippedDish(reg: ContentRegistry): World {
    return realizeRecipe(reg, 'FIRST_DISH_V1', { worldId: 'neutral', transform: (r) => ({ ...r, lid: 'closed' }) });
  }

  it(
    'byte-identical entity columns and fields over 2,000 ticks (species by id)',
    () => {
      // Both sides from the pre-organism-flip lists (D-0127): the shipped manifest records the subject itself since the flip.
      const a = shippedDish(preOrganismFlipRegistry());
      const b = shippedDish(preOrganismFlipRegistry({ species: ['A03', 'A04', 'A05'] }));
      expect(a.species.map((s) => s.id)).not.toContain('A03');
      expect(b.species.map((s) => s.id)).toEqual(expect.arrayContaining(['A03', 'A04', 'A05']));
      const compare = () => {
        expect(b.ents.highWater).toBe(a.ents.highWater);
        const ca = a.ents.cols as unknown as Record<string, ArrayLike<number>>;
        const cb = b.ents.cols as unknown as Record<string, ArrayLike<number>>;
        for (const [name] of ENTITY_COLUMNS) {
          for (let i = 0; i < a.ents.highWater; i++) {
            if (name === 'species') {
              expect(b.species[cb.species![i]!]!.id).toBe(a.species[ca.species![i]!]!.id);
              continue;
            }
            if (!Object.is(ca[name]![i], cb[name]![i])) expect.fail(`tick ${a.tick}: column ${name} slot ${i}: ${ca[name]![i]} vs ${cb[name]![i]}`);
          }
        }
        for (const id of FIELD_IDS) {
          const fa = a.fields[id];
          const fb = b.fields[id];
          expect(fb === undefined).toBe(fa === undefined);
          if (!fa || !fb) continue;
          for (let k = 0; k < fa.length; k++) if (!Object.is(fa[k], fb[k])) expect.fail(`tick ${a.tick}: field ${id} cell ${k}: ${fa[k]} vs ${fb[k]}`);
        }
        for (let k = 0; k < a.derived.light.length; k++) if (!Object.is(a.derived.light[k], b.derived.light[k])) expect.fail(`tick ${a.tick}: light cell ${k}`);
      };
      for (let k = 0; k < 20; k++) {
        run(a, 100);
        run(b, 100);
        compare();
      }
      expect(a.events.totals.birth ?? 0).toBeGreaterThan(0);
      expect(b.events.totals.modeSwitch).toBeUndefined();
    },
    LONG,
  );
});
