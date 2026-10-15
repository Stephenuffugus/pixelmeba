/**
 * Phase 5 wave 12, e2-light-algae: A04 Turnleaf's saved metabolic mode (SPEC §3.2 row 4, §6.4, §6.5, §7.10;
 * CT §3.1 "A04 photosynthesis (light ≥ 0.35) / sugar (light ≤ 0.25)"; D-0106; src/sim/mixotrophy.ts).
 *  - initialization at the first stage 4 (introduced at 0.40 → Photo; 0.30 → Sugar: the init rule has no band;
 *    0.20 → Sugar); a recipe founder has mode 0 at tick 0 and a mode after tick 1; no Active A04 reaches stage 6
 *    with mode 0 over a run with inoculations by command on many ticks;
 *  - hysteresis with inclusive thresholds and one 'modeSwitch' per switch (cause, light); none at initialization
 *    or birth;
 *  - one route per tick: Photo takes CO2 only (sugar untouched, O2 made), Sugar takes sugar only (0.30 O2 per C
 *    consumed); never both over a 600-tick dusk run; never broth; E06 in Photo mode only;
 *    photosynthesizedThisTick follows the route;
 *  - MODE_PHOTO / MODE_SUGAR reasons with the light when nothing binds, a binding limit otherwise;
 *  - movement: Photo scores light, Sugar scores sugar, and the same organism changes target after a switch;
 *  - newborn: from the daughter's own cell's light, else the parent's mode;
 *  - visualEvents drops 'modeSwitch' (and wave 12's handling events).
 *
 * LOW_LIGHT_CURVE and MIXOTROPHY are not in IMPLEMENTED_NATIVE_ABILITIES yet (the lead appends them at the wave 12
 * integration; nothing is enabled before the organism flip, D-0104), so REG uses allowUnimplemented.
 */
import { describe, expect, it } from 'vitest';
import { queueCommand } from '../../src/sim/commands';
import { AVAIL_K, DT, O2_PER_CARBON_AEROBIC, PHOTO_O2_PER_CARBON } from '../../src/sim/constants';
import { LIFE_ACTIVE } from '../../src/sim/entities';
import type { SimEvent } from '../../src/sim/events';
import { cellIndex, cellX, maskCells } from '../../src/sim/grid';
import { photosynthesizedThisTick, tookFromPool } from '../../src/sim/intake';
import { initialMode, MODE_NONE, MODE_PHOTO, MODE_SUGAR, nextMode } from '../../src/sim/mixotrophy';
import { divisionNeeds } from '../../src/sim/births';
import { setLightMode } from '../../src/sim/climate';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { entityCell } from '../../src/sim/spatial';
import { run, step } from '../../src/sim/tick';
import { updateDerived } from '../../src/sim/transport';
import { speciesIndex, type World } from '../../src/sim/world';
import { visualEvents } from '../../src/worker/snapshot';
import { registryWith } from '../helpers/registry';
import { aliveOf, clearWater, fillField, place, placeWith, registry, setField } from '../helpers/world';

const SHIPPED = registry().manifest;
const REG = registryWith({ enabledSpecies: [...SHIPPED.enabledSpecies, 'A03', 'A04', 'A05'].sort() }, { allowUnimplemented: true });
const LONG = 600_000;

/** Set the light baseline of every playable cell (or of `cells`) and recompute derived light. */
function setLight(w: World, light: number, cells: ArrayLike<number> = maskCells()): void {
  for (let k = 0; k < cells.length; k++) w.grid.lightBase[cells[k]!] = light;
  w.grid.geometryVersion++;
  updateDerived(w);
}

function dish(light: number, lid: 'open' | 'closed' = 'closed'): World {
  const w = clearWater({ lid }, REG);
  setLight(w, light);
  fillField(w, 'nutrient', 5);
  return w;
}

const modeSwitches = (w: World): SimEvent[] => w.events.ring.filter((e) => e.type === 'modeSwitch');
const availability = (a: number): number => (a <= 0 ? 0 : a / (a + AVAIL_K));

describe('pure rules', () => {
  it('initialMode / nextMode: inclusive thresholds, hold in the band, the newborn rule', () => {
    expect(initialMode(0.35)).toBe(MODE_PHOTO);
    expect(initialMode(0.3499999)).toBe(MODE_SUGAR);
    expect(initialMode(0.3)).toBe(MODE_SUGAR);
    expect(nextMode(0.35, MODE_SUGAR)).toBe(MODE_PHOTO);
    expect(nextMode(0.34, MODE_SUGAR)).toBe(MODE_SUGAR);
    expect(nextMode(0.26, MODE_PHOTO)).toBe(MODE_PHOTO);
    expect(nextMode(0.25, MODE_PHOTO)).toBe(MODE_SUGAR);
    expect(nextMode(0.3, MODE_NONE)).toBe(MODE_SUGAR);
    expect(nextMode(0.4, MODE_NONE)).toBe(MODE_PHOTO);
    expect(nextMode(0.2, MODE_NONE)).toBe(MODE_SUGAR);
  });
});

describe('initialization at the first stage 4', () => {
  for (const [L, want] of [
    [0.4, MODE_PHOTO],
    [0.3, MODE_SUGAR],
    [0.2, MODE_SUGAR],
  ] as const) {
    it(`introduced at light ${L} → ${want === MODE_PHOTO ? 'Photo' : 'Sugar'} after the first step, with no event`, () => {
      const w = dish(L);
      const s = place(w, 'A04', 64.5, 64.5);
      expect(w.ents.cols.metabolicMode[s]).toBe(MODE_NONE);
      let atIntake = -1;
      step(w, { afterStage: (st) => st === 5 && (atIntake = w.ents.cols.metabolicMode[s]!) });
      expect(atIntake).toBe(want); // set before its first intake
      expect(w.ents.cols.metabolicMode[s]).toBe(want);
      expect(modeSwitches(w)).toEqual([]);
    });
  }

  it('a recipe founder has mode 0 at tick 0 and a mode after tick 1', () => {
    const w = clearWater({ founders: [{ species: 'A04', count: 6, center: [64, 64], radius: 2, modules: [], moduleAssignment: 'all' }] }, REG);
    const ids = aliveOf(w, 'A04');
    expect(ids).toHaveLength(6);
    for (const s of ids) expect(w.ents.cols.metabolicMode[s]).toBe(MODE_NONE);
    step(w);
    const L = w.derived.light[cellIndex(64, 64)]!;
    for (const s of ids) expect(w.ents.cols.metabolicMode[s]).toBe(initialMode(w.derived.light[entityCell(w.ents.cols.x[s]!, w.ents.cols.y[s]!)]!));
    expect(L).toBeGreaterThan(0);
    expect(modeSwitches(w)).toEqual([]);
  });

  it(
    'no Active A04 ever reaches stage 6 with mode 0 (inoculations by command on many ticks, the cycle on)',
    () => {
      const w = clearWater({ lid: 'open' }, REG);
      expect(setLightMode(w, 'cycle')).toBe(true);
      for (let k = 0; k < 40; k++) {
        queueCommand(w, `a04-${k}`, { kind: 'inoculate', speciesId: 'A04', x: 30.5 + (k % 8) * 9, y: 40.5 + Math.floor(k / 8) * 9, radius: 2, count: 3 }, 37 + k * 53);
      }
      let bad = 0;
      let checked = 0;
      const a04 = speciesIndex(w, 'A04');
      run(w, 2400, {
        afterStage: (st, world) => {
          if (st !== 5) return;
          const c = world.ents.cols;
          for (let i = 0; i < world.ents.highWater; i++) {
            if (c.alive[i] !== 1 || c.species[i] !== a04 || c.lifeState[i] !== LIFE_ACTIVE) continue;
            checked++;
            if (c.metabolicMode[i] === MODE_NONE) bad++;
          }
        },
      });
      expect(checked).toBeGreaterThan(10_000);
      expect(bad).toBe(0);
      expect(w.events.totals.modeSwitch ?? 0).toBeGreaterThan(0); // the dusk switched some
    },
    LONG,
  );
});

describe('hysteresis and the modeSwitch event', () => {
  it('Photo holds at 0.30, switches at exactly 0.25; Sugar holds at 0.34, switches at exactly 0.35; one event each', () => {
    const w = dish(0.8);
    const s = place(w, 'A04', 64.5, 64.5);
    const c = w.ents.cols;
    step(w);
    expect(c.metabolicMode[s]).toBe(MODE_PHOTO);
    setLight(w, 0.3);
    run(w, 5);
    expect(c.metabolicMode[s]).toBe(MODE_PHOTO);
    expect(modeSwitches(w)).toEqual([]);
    setLight(w, 0.25);
    step(w);
    expect(w.derived.light[entityCell(c.x[s]!, c.y[s]!)]).toBe(0.25);
    expect(c.metabolicMode[s]).toBe(MODE_SUGAR);
    expect(modeSwitches(w)).toHaveLength(1);
    expect(modeSwitches(w)[0]).toMatchObject({ cause: R.MODE_SUGAR, species: speciesIndex(w, 'A04'), birthId: c.birthId[s], detail: { light: 0.25 } });
    setLight(w, 0.34);
    run(w, 5);
    expect(c.metabolicMode[s]).toBe(MODE_SUGAR);
    expect(modeSwitches(w)).toHaveLength(1);
    setLight(w, 0.35);
    step(w);
    expect(c.metabolicMode[s]).toBe(MODE_PHOTO);
    expect(modeSwitches(w)).toHaveLength(2);
    expect(modeSwitches(w)[1]).toMatchObject({ cause: R.MODE_PHOTO, detail: { light: 0.35 }, cell: entityCell(c.x[s]!, c.y[s]!) });
    run(w, 5);
    expect(modeSwitches(w)).toHaveLength(2);
  });
});

describe("the 'modeSwitch' burst (D-0126: coalesced per tick, species and new mode)", () => {
  it('600 A04 switching in one tick write one event (count 600) and evict nothing earlier from the ring', () => {
    const w = dish(0.8);
    const placed: number[] = [];
    for (let y = 30; y < 100 && placed.length < 600; y += 2) for (let x = 30; x < 100 && placed.length < 600; x += 2) placed.push(place(w, 'A04', x + 0.5, y + 0.5));
    step(w);
    const inoculated = w.tick;
    queueCommand(w, 'b', { kind: 'inoculate', speciesId: 'B01', x: 64.5, y: 64.5, radius: 1, count: 1 }, w.tick);
    step(w);
    // the previous tick's events (as a snapshot taken every few ticks would still need them)
    const intro = w.events.ring.filter((e) => e.tick === inoculated);
    expect(intro.some((e) => e.type === 'introduce')).toBe(true);
    setLight(w, 0.2);
    const t = w.tick;
    step(w);
    const c = w.ents.cols;
    for (const s of placed) expect(c.metabolicMode[s]).toBe(MODE_SUGAR);
    const sw = modeSwitches(w);
    expect(sw).toHaveLength(1);
    expect(sw[0]).toMatchObject({ tick: t, cause: R.MODE_SUGAR, species: speciesIndex(w, 'A04'), birthId: c.birthId[placed[0]!], detail: { light: 0.2, count: 600 } });
    expect(w.events.totals.modeSwitch).toBe(600);
    // the previous tick's events are still in the ring (600 events would have evicted them)
    for (const e of intro) expect(w.events.ring.some((r) => r.id === e.id)).toBe(true);
    // the next switch, a tick later, is a new event
    setLight(w, 0.9);
    step(w);
    expect(modeSwitches(w)).toHaveLength(2);
    expect(modeSwitches(w)[1]).toMatchObject({ tick: t + 1, cause: R.MODE_PHOTO, detail: { count: 600 } });
    expect(w.events.totals.modeSwitch).toBe(1200);
  });

  it('switches to Photo and to Sugar in one tick are two events with their own counts', () => {
    const w = dish(0.3);
    const west: number[] = [];
    const east: number[] = [];
    for (let k = 0; k < 5; k++) west.push(place(w, 'A04', 40.5, 50.5 + 2 * k));
    for (let k = 0; k < 3; k++) east.push(place(w, 'A04', 90.5, 50.5 + 2 * k));
    const c = w.ents.cols;
    for (const s of west) c.metabolicMode[s] = MODE_PHOTO;
    for (const s of east) c.metabolicMode[s] = MODE_SUGAR;
    step(w); // 0.30 is inside the band: both modes hold
    expect(modeSwitches(w)).toEqual([]);
    const westCells: number[] = [];
    const eastCells: number[] = [];
    for (const k of maskCells()) (cellX(k) < 64 ? westCells : eastCells).push(k);
    setLight(w, 0.1, westCells);
    setLight(w, 0.9, eastCells);
    step(w);
    const sw = modeSwitches(w);
    expect(sw).toHaveLength(2);
    const sugar = sw.find((e) => e.cause === R.MODE_SUGAR)!;
    const photo = sw.find((e) => e.cause === R.MODE_PHOTO)!;
    expect(sugar.detail).toMatchObject({ count: 5 });
    expect(photo.detail).toMatchObject({ count: 3 });
    expect(w.events.totals.modeSwitch).toBe(8);
    for (const s of west) expect(c.metabolicMode[s]).toBe(MODE_SUGAR);
    for (const s of east) expect(c.metabolicMode[s]).toBe(MODE_PHOTO);
  });
});

describe('one route per tick', () => {
  /** One tick; reads the A04's cell before and right after stage 6. */
  function measured(w: World, s: number): { fixed: number; dCo2: number; dSugar: number; dO2: number; photo: boolean } {
    const c = w.ents.cols;
    let cell = 0;
    let co2 = 0;
    let sugar = 0;
    let o2 = 0;
    let acc = 0;
    const out = { fixed: 0, dCo2: 0, dSugar: 0, dO2: 0, photo: false };
    step(w, {
      afterStage: (st, world) => {
        if (st === 5) {
          cell = entityCell(c.x[s]!, c.y[s]!);
          co2 = world.fields.co2![cell]!;
          sugar = world.fields.sugar![cell]!;
          o2 = world.fields.oxygen![cell]!;
          acc = c.intakeAccum[s]!;
        } else if (st === 6) {
          out.fixed = c.intakeAccum[s]! - acc;
          out.dCo2 = world.fields.co2![cell]! - co2;
          out.dSugar = world.fields.sugar![cell]! - sugar;
          out.dO2 = world.fields.oxygen![cell]! - o2;
          out.photo = photosynthesizedThisTick(world, s);
        }
      },
    });
    return out;
  }

  it('bright light beside sugar: Photo takes CO2 only, leaves the sugar, makes 0.50 O2 per C', () => {
    const w = dish(0.8);
    fillField(w, 'sugar', 2);
    const s = place(w, 'A04', 64.5, 64.5);
    step(w);
    expect(w.ents.cols.metabolicMode[s]).toBe(MODE_PHOTO);
    const a04 = speciesIndex(w, 'A04');
    const r = measured(w, s);
    expect(r.fixed).toBeGreaterThan(0);
    expect(tookFromPool(w, a04, 'co2')).toBe(true);
    expect(tookFromPool(w, a04, 'sugar')).toBe(false);
    expect(r.dCo2).toBeCloseTo(-r.fixed, 12);
    expect(r.dSugar / r.fixed).toBeCloseTo(0.5, 9); // only its product: none of the sugar was eaten
    expect(r.dO2 / r.fixed).toBeCloseTo(PHOTO_O2_PER_CARBON, 9);
    expect(r.photo).toBe(true);
  });

  it('in the dark: Sugar takes sugar only and consumes 0.30 O2 per C', () => {
    const w = dish(0.1);
    fillField(w, 'sugar', 2);
    const s = place(w, 'A04', 64.5, 64.5);
    step(w);
    expect(w.ents.cols.metabolicMode[s]).toBe(MODE_SUGAR);
    const a04 = speciesIndex(w, 'A04');
    const r = measured(w, s);
    expect(r.fixed).toBeGreaterThan(0);
    expect(tookFromPool(w, a04, 'sugar')).toBe(true);
    expect(tookFromPool(w, a04, 'co2')).toBe(false);
    expect(r.dSugar).toBeCloseTo(-r.fixed, 12);
    expect(r.dO2 / r.fixed).toBeCloseTo(-O2_PER_CARBON_AEROBIC, 9);
    expect(r.dCo2).toBeGreaterThan(0); // respired CO2, never fixed
    expect(r.photo).toBe(false);
  });

  it(
    'never both routes in one tick over a 600-tick dusk run; the route always follows the saved mode',
    () => {
      const w = clearWater({ lid: 'open' }, REG);
      fillField(w, 'nutrient', 5);
      fillField(w, 'sugar', 1);
      expect(setLightMode(w, 'cycle')).toBe(true);
      const s = place(w, 'A04', 64.5, 64.5);
      const a04 = speciesIndex(w, 'A04');
      const c = w.ents.cols;
      run(w, 800);
      let photoTicks = 0;
      let sugarTicks = 0;
      for (let t = 0; t < 600; t++) {
        let mode = -1;
        step(w, {
          afterStage: (st, world) => {
            if (st === 5) mode = c.metabolicMode[s]!;
            if (st !== 6) return;
            const co2 = tookFromPool(world, a04, 'co2');
            const sugar = tookFromPool(world, a04, 'sugar');
            expect(co2 && sugar).toBe(false);
            if (co2) {
              expect(mode).toBe(MODE_PHOTO);
              photoTicks++;
            }
            if (sugar) {
              expect(mode).toBe(MODE_SUGAR);
              sugarTicks++;
            }
          },
        });
      }
      expect(c.alive[s]).toBe(1);
      expect(photoTicks).toBeGreaterThan(50);
      expect(sugarTicks).toBeGreaterThan(50);
      expect(modeSwitches(w).length).toBeGreaterThanOrEqual(1);
    },
    LONG,
  );

  it('no broth ever, even when broth is the only food (SPEC §7.10)', () => {
    const w = dish(0.1);
    expect(w.fields.broth).toBeDefined();
    fillField(w, 'broth', 2);
    const s = place(w, 'A04', 64.5, 64.5);
    const a04 = speciesIndex(w, 'A04');
    const c = w.ents.cols;
    let took = 0;
    run(w, 50, { afterStage: (st, world) => st === 6 && tookFromPool(world, a04, 'broth') && took++ });
    expect(took).toBe(0);
    expect(c.metabolicMode[s]).toBe(MODE_SUGAR);
    expect(c.intakeAccum[s]).toBe(0);
    expect(c.limitCode[s]).toBe(R.FOOD_NONE_COMPATIBLE);
  });

  it('E06 acts in Photo mode only: a Sugar-mode carrier requests exactly what a non-carrier does', () => {
    const pair = (light: number) => {
      const out: number[] = [];
      for (const mods of [[], ['E06']] as const) {
        const w = dish(light);
        fillField(w, 'sugar', 2);
        fillField(w, 'co2', 50);
        const s = placeWith(w, 'A04', 64.5, 64.5, mods);
        step(w);
        const acc = w.ents.cols.intakeAccum[s]!;
        step(w);
        out.push(w.ents.cols.intakeAccum[s]! - acc);
      }
      return out as [number, number];
    };
    const [plainDark, e06Dark] = pair(0.1);
    expect(plainDark).toBeGreaterThan(0);
    expect(Object.is(e06Dark, plainDark)).toBe(true);
    const [plainLit, e06Lit] = pair(0.5);
    // Photo mode: the carrier's ceiling 0.70 × min(1, 0.5/0.35) = 0.70 against the plain 0.50.
    expect(e06Lit / plainLit).toBeCloseTo(0.7 / 0.5, 5); // the CO2 left after the first tick differs by a hair
  });
});

describe('the mode reasons', () => {
  it('MODE_PHOTO with the light when nothing binds; a binding limit otherwise', () => {
    const w = dish(1);
    fillField(w, 'co2', 50);
    const s = place(w, 'A04', 64.5, 64.5);
    run(w, 2);
    const c = w.ents.cols;
    expect(c.metabolicMode[s]).toBe(MODE_PHOTO);
    expect(c.limitCode[s]).toBe(R.MODE_PHOTO);
    expect(c.limitValue[s]).toBe(1);
    // At light 0.50 its food access is 0.5 × avail(CO2) < 0.95: that limit binds.
    setLight(w, 0.5);
    step(w);
    expect(c.limitCode[s]).toBe(R.FOOD_ACCESS_LOW);
    expect(c.limitValue[s]).toBeCloseTo(0.5 * availability(w.fields.co2![entityCell(c.x[s]!, c.y[s]!)]!), 3);
  });

  it('MODE_SUGAR with the light when nothing binds; OXYGEN_LIMITED when oxygen binds', () => {
    const w = dish(0.1);
    fillField(w, 'sugar', 50);
    fillField(w, 'oxygen', 5);
    const s = place(w, 'A04', 64.5, 64.5);
    run(w, 2);
    const c = w.ents.cols;
    expect(c.metabolicMode[s]).toBe(MODE_SUGAR);
    expect(c.limitCode[s]).toBe(R.MODE_SUGAR);
    expect(c.limitValue[s]).toBe(0.1);
    // Oxygen held almost at zero in its cell right before stage 6.
    step(w, { afterStage: (st, world) => st === 5 && setField(world, 'oxygen', entityCell(c.x[s]!, c.y[s]!), 1e-4) });
    expect(c.limitCode[s]).toBe(R.OXYGEN_LIMITED);
  });
});

describe('movement scoring (D-0106)', () => {
  it('a Photo A04 between a bright and a shaded region moves to the bright side', () => {
    const w = dish(0.8);
    const s = place(w, 'A04', 64.5, 64.5);
    step(w);
    const c = w.ents.cols;
    expect(c.metabolicMode[s]).toBe(MODE_PHOTO);
    // Shade (0.1) to the west, its own column in the band (0.30, so it stays Photo), brighter and brighter to the east.
    for (const cell of maskCells()) {
      const x = cell % 128;
      w.grid.lightBase[cell] = x < 64 ? 0.1 : x === 64 ? 0.3 : Math.min(1, 0.6 + 0.05 * (x - 64));
    }
    w.grid.geometryVersion++;
    updateDerived(w);
    // Sugar in the shade must not attract a Photo A04.
    for (let y = 60; y <= 68; y++) for (let x = 58; x <= 62; x++) setField(w, 'sugar', cellIndex(x, y), 5);
    run(w, 80);
    expect(c.metabolicMode[s]).toBe(MODE_PHOTO);
    expect(c.x[s]).toBeGreaterThan(65);
  });

  it('a Sugar A04 in the dark moves to a sugar patch; after a switch to Photo the same organism changes target', () => {
    const w = dish(0.1);
    const s = place(w, 'A04', 64.5, 64.5);
    step(w);
    const c = w.ents.cols;
    expect(c.metabolicMode[s]).toBe(MODE_SUGAR);
    // Sugar to the west, bright light to the east (beyond the switch threshold only there).
    for (let y = 60; y <= 68; y++) for (let x = 60; x <= 62; x++) setField(w, 'sugar', cellIndex(x, y), 5);
    const east: number[] = [];
    for (const cell of maskCells()) if (cell % 128 >= 66) east.push(cell);
    setLight(w, 0.9, east);
    run(w, 12);
    expect(c.metabolicMode[s]).toBe(MODE_SUGAR);
    expect(c.targetX[s]).toBeLessThan(64);
    run(w, 60);
    expect(c.x[s]).toBeLessThan(64);
    // Light rising to the east everywhere it can reach: a switch to Photo, and the next decision aims at light, not sugar.
    for (const cell of maskCells()) {
      const x = cell % 128;
      w.grid.lightBase[cell] = x < 50 ? 0.3 : Math.min(1, 0.4 + 0.03 * (x - 50));
    }
    w.grid.geometryVersion++;
    updateDerived(w);
    step(w);
    expect(c.metabolicMode[s]).toBe(MODE_PHOTO);
    run(w, 12);
    expect(c.targetX[s]).toBeGreaterThan(c.x[s]!);
  });
});

describe('newborn mode (D-0106)', () => {
  /** An A04 in mode `parentMode` at (64.5, 64.5) dividing this step; its cell lit 0.30 and the east cell `eastLight`. */
  function divide(parentMode: number, eastLight: number): { w: World; parent: number; daughter: number } {
    const w = dish(parentMode === MODE_PHOTO ? 0.8 : 0.1);
    const s = place(w, 'A04', 64.5, 64.5);
    step(w);
    const c = w.ents.cols;
    expect(c.metabolicMode[s]).toBe(parentMode);
    // Everywhere 0.30 but the east cell (the first empty neighbour findPlacement picks).
    setLight(w, 0.3);
    setLight(w, eastLight, [cellIndex(65, 64)]);
    const needs = divisionNeeds(w, s);
    w.ledger.inputs.c += needs.biomass * 1.05 - c.B[s]!; // test-only state, logged as an input
    c.B[s] = needs.biomass * 1.05;
    c.E[s] = profileOf(w, s).energyCap;
    c.age[s] = needs.age + 1;
    c.decisionTimer[s] = 3; // no move this tick
    const n0 = w.ents.count;
    const before = modeSwitches(w).length;
    step(w);
    expect(w.ents.count).toBe(n0 + 1);
    expect(modeSwitches(w).length).toBe(before);
    const kids = aliveOf(w, 'A04');
    const daughter = kids.find((k) => k !== s)!;
    expect(entityCell(c.x[s]!, c.y[s]!)).toBe(cellIndex(64, 64));
    expect(entityCell(c.x[daughter]!, c.y[daughter]!)).toBe(cellIndex(65, 64));
    return { w, parent: s, daughter };
  }

  it('a Photo parent dividing at 0.30 gives two Photo daughters; a Sugar parent two Sugar daughters', () => {
    for (const m of [MODE_PHOTO, MODE_SUGAR]) {
      const { w, parent, daughter } = divide(m, 0.3);
      expect(w.ents.cols.metabolicMode[parent]).toBe(m);
      expect(w.ents.cols.metabolicMode[daughter]).toBe(m);
    }
  });

  it('a daughter placed in a 0.40 cell is Photo and in a 0.20 cell Sugar, whatever the parent', () => {
    for (const m of [MODE_PHOTO, MODE_SUGAR]) {
      const lit = divide(m, 0.4);
      expect(lit.w.ents.cols.metabolicMode[lit.daughter]).toBe(MODE_PHOTO);
      expect(lit.w.ents.cols.metabolicMode[lit.parent]).toBe(m);
      const dim = divide(m, 0.2);
      expect(dim.w.ents.cols.metabolicMode[dim.daughter]).toBe(MODE_SUGAR);
      expect(dim.w.ents.cols.metabolicMode[dim.parent]).toBe(m);
    }
  });
});

describe('the feed', () => {
  it("visualEvents drops 'modeSwitch', 'handlingStart' and 'handlingBreak' (event ring only in this wave)", () => {
    const w = dish(0.8);
    const s = place(w, 'A04', 64.5, 64.5);
    step(w);
    setLight(w, 0.2);
    step(w);
    expect(w.ents.cols.metabolicMode[s]).toBe(MODE_SUGAR);
    const ring = w.events.ring;
    expect(ring.some((e) => e.type === 'modeSwitch')).toBe(true);
    expect(visualEvents(ring, -1).some((e) => (e.type as string) === 'modeSwitch')).toBe(false);
    const fake: SimEvent[] = [
      { id: 1, tick: 1, type: 'modeSwitch', species: 0, birthId: 1, cell: 0, cause: R.MODE_PHOTO, detail: { light: 0.4 } },
      { id: 2, tick: 1, type: 'handlingStart', species: 0, birthId: 1, cell: 0, cause: R.PRED_HANDLING_IN_PROGRESS, detail: { prey: 2, preySpecies: 1, need: 1 } },
      { id: 3, tick: 1, type: 'handlingBreak', species: 0, birthId: 1, cell: 0, detail: { prey: 2, why: 'division', progress: 0.3 } },
    ];
    expect(visualEvents(fake, 0)).toEqual([]);
    expect(DT).toBe(0.1);
  });
});
