/**
 * P3.3 biofilm (SPEC §7.1; CT §3.5, §12.6, §13 film row; D-0008, D-0038, D-0045; src/sim/film.ts).
 *
 *  - Native B02 deposition: nothing for the first 100 attached Active ticks, then exactly
 *    0.05 × dt body C per tick with N at N/B, stopping exactly at B = B0' (0.20 film from B 1.2).
 *  - The 0.50 headroom: a B02 in a cell preloaded with 0.40 stops exactly at 0.50; two B02 in one
 *    cell share the headroom in proportion to their requests; film never exceeds 0.50.
 *  - E ≤ 40 (energy remaining at stage 8) blocks; just above 40 builds.
 *  - Decay: film C and N move into detritus at 0.1 %/s, matching the closed form over 1,000 ticks.
 *  - Transport: a pulse crosses each of the four edges of a film cell at half rate (film in the source
 *    cell, and film only in the receiving cell), and is untouched across film-free edges.
 *  - Inhibitor exposure halves once (any film amount).
 *  - Film as detritus food: B04 (ordered and weighted genomes) and F01 eat film; the pool falls by
 *    exactly what they took, and the ledger closes. A weighted genome that gives detritus no weight eats
 *    no film. A B04 preference mutation draws identically with and without the film system (D-0038).
 *  - D-0045 carry-over: a B02 carrying E01 reserves its film construction before the E01 producer
 *    runs; both happen in one tick and the ledger closes.
 *
 * Worlds: Empty Gel Colony (New Dish habitat start) under the shipped manifest, which records the film
 * system; background sugar is zeroed (and the ledger re-baselined) where food would interfere.
 * Test-only state (B, E, film clocks, fields) is set directly; material changes are logged as inputs.
 */
import { describe, expect, it } from 'vitest';
import { STAGE8_ACTIONS, buildActionTable, type Stage8Action } from '../../src/sim/actions';
import { introduceOrganism } from '../../src/sim/commands';
import { DT, FILM_CAP, GRID_W } from '../../src/sim/constants';
import type { ContentRegistry } from '../../src/sim/content/registry';
import type { SystemFlag } from '../../src/sim/fields';
import {
  FILM_ATTACH_SECONDS,
  FILM_DECAY_PER_SECOND,
  FILM_MIN_ENERGY,
  FILM_RATE_PER_SECOND,
} from '../../src/sim/film';
import { cellIndex } from '../../src/sim/grid';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { MUT_PREF, proposeDaughters } from '../../src/sim/mutation';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { realizeRecipe, withHabitatOverride } from '../../src/sim/recipes';
import { rebuildIndex } from '../../src/sim/spatial';
import { stageStructures } from '../../src/sim/structures';
import { inhibitorExposure } from '../../src/sim/suitability';
import { step } from '../../src/sim/tick';
import { inactiveFieldsNonZero, stageEnvironment } from '../../src/sim/transport';
import { applyNow } from '../../src/sim/commands';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { fungalSegmentCount } from '../../src/sim/fungi';
import { fungalDegree } from '../../src/sim/links';
import { trajectoryDigest } from '../helpers/trajectory';
import { aliveOf } from '../helpers/world';
import { speciesIndex, type World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { fillField, place, rebaseLedger, registry, setField } from '../helpers/world';

/** A gel cell well away from the water channel (x 59–68). */
const GX = 30;
const GY = 64;
const CELL = cellIndex(GX, GY);
const FRAC = FILM_DECAY_PER_SECOND * DT;
const RATE = FILM_RATE_PER_SECOND * DT;

/** Empty Gel Colony as the New Dish habitat start builds it, under `reg` (default: shipped). */
function gel(reg: ContentRegistry = registry(), mutationPreset: 'fixed' | 'accelerated' = 'fixed'): World {
  const base = reg.recipes.FIRST_DISH_V1!;
  const r = withHabitatOverride(base, 'GEL_COLONY');
  return realizeRecipe(
    reg,
    { ...r, founders: [], fieldPatches: [], scheduledCommands: [], mutationPreset },
    { worldId: 'film-test' },
  );
}

/** Gel Colony with no sugar anywhere (ledger re-baselined). */
function hungryGel(): World {
  const w = gel();
  expect(w.fields.film).toBeDefined();
  fillField(w, 'sugar', 0);
  return w;
}

/** A B02 at the centre of (cx, cy) with test-only B and E, its film clock already complete when `ready`. */
function velvet(w: World, cx: number, cy: number, B: number, E: number, ready = false): number {
  const s = place(w, 'B02', cx + 0.5, cy + 0.5, { B, E });
  if (ready) w.ents.cols.filmSeconds[s] = FILM_ATTACH_SECONDS;
  return s;
}

describe('P3.3 native B02 film deposition', () => {
  it('nothing for the first 100 ticks, then exactly 0.05 × dt C per tick with N at N/B, stopping exactly at B = B0′', () => {
    const w = hungryGel();
    const s = velvet(w, GX, GY, 1.2, 60);
    const c = w.ents.cols;
    const film = w.fields.film!;
    const filmN = w.fields.filmN!;
    const b0 = profileOf(w, s).b0;
    expect(b0).toBe(1);
    for (let t = 0; t < 100; t++) {
      step(w);
      expect(film[CELL]).toBe(0);
      expect(c.B[s]).toBe(1.2);
    }
    expect(c.filmSeconds[s]).toBeCloseTo(FILM_ATTACH_SECONDS, 9); // 100 × 0.1 s, summed in floats
    let deposited = 0;
    let ticksDepositing = 0;
    for (let t = 0; t < 80; t++) {
      const B = c.B[s]!;
      const N = c.N[s]!;
      const f0 = film[CELL]!;
      const n0 = filmN[CELL]!;
      step(w);
      const expectA = Math.min(RATE, B - b0);
      const decayed = f0 - f0 * FRAC;
      const decayedN = n0 - n0 * FRAC;
      if (expectA > 0) {
        if (ticksDepositing === 0) expect(expectA).toBe(RATE);
        ticksDepositing++;
        deposited += expectA;
        expect(film[CELL]).toBe(decayed + expectA);
        expect(filmN[CELL]).toBe(decayedN + (N * expectA) / B);
        expect(c.B[s]).toBe(B - expectA);
        expect(c.N[s]).toBe(N - (N * expectA) / B);
      } else {
        expect(film[CELL]).toBe(decayed);
        expect(c.B[s]).toBe(B);
      }
    }
    expect(c.B[s]).toBe(b0);
    expect(deposited).toBeCloseTo(0.2, 12);
    expect(ticksDepositing).toBeGreaterThanOrEqual(40);
    expect(ticksDepositing).toBeLessThanOrEqual(41);
    expect(w.ledger.energy.construction).toBe(0); // native film costs no energy
    expect(checkLedger(w).ok).toBe(true);
  });

  it('a B02 at B 1.5 in a cell preloaded with film 0.40 stops exactly at 0.50, and film never exceeds it', () => {
    const w = hungryGel();
    setField(w, 'film', CELL, 0.4);
    setField(w, 'filmN', CELL, 0.04);
    const s = velvet(w, GX, GY, 1.5, 60, true);
    const film = w.fields.film!;
    let reachedCap = -1;
    for (let t = 0; t < 40; t++) {
      step(w, {
        afterStage: (stage) => {
          if (stage === 8) {
            expect(film[CELL]).toBeLessThanOrEqual(FILM_CAP);
            if (film[CELL] === FILM_CAP && reachedCap < 0) reachedCap = t;
          }
        },
      });
    }
    expect(reachedCap).toBeGreaterThanOrEqual(19); // 0.40 → 0.50 in 0.005 steps less decay
    expect(film[CELL]).toBe(FILM_CAP);
    expect(w.ents.cols.B[s]!).toBeGreaterThan(1);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('two B02 in one cell share the headroom in proportion to their requests', () => {
    const w = hungryGel();
    setField(w, 'film', CELL, 0.498);
    setField(w, 'filmN', CELL, 0.0498);
    const a = velvet(w, GX, GY, 1.5, 60, true);
    const b = velvet(w, GX, GY, 1.002, 60, true);
    const c = w.ents.cols;
    const film = w.fields.film!;
    let f2 = 0;
    let Ba = 0;
    let Bb = 0;
    step(w, {
      afterStage: (stage) => {
        if (stage === 7) {
          f2 = film[CELL]!;
          Ba = c.B[a]!;
          Bb = c.B[b]!;
        }
        if (stage === 8) {
          const ra = Math.min(RATE, Ba - 1);
          const rb = Math.min(RATE, Bb - 1);
          expect(rb).toBeLessThan(ra);
          const headroom = FILM_CAP - f2;
          expect(ra + rb).toBeGreaterThan(headroom);
          const accA = Ba - c.B[a]!;
          const accB = Bb - c.B[b]!;
          expect(accA).toBeCloseTo(ra * (headroom / (ra + rb)), 15);
          expect(accB).toBeCloseTo(rb * (headroom / (ra + rb)), 15);
          expect(accA / accB).toBeCloseTo(ra / rb, 9);
          expect(film[CELL]).toBe(FILM_CAP);
        }
      },
    });
    expect(checkLedger(w).ok).toBe(true);
  });

  it('energy remaining at stage 8 of 40 or less blocks; just above 40 builds', () => {
    for (const [E8, builds] of [
      [FILM_MIN_ENERGY, false],
      [FILM_MIN_ENERGY - 5, false],
      [FILM_MIN_ENERGY + 1e-9, true],
    ] as const) {
      const w = hungryGel();
      const s = velvet(w, GX, GY, 1.5, 60, true);
      step(w, {
        afterStage: (stage, world) => {
          if (stage === 7) world.ents.cols.E[s] = E8;
        },
      });
      expect(w.fields.film![CELL]! > 0).toBe(builds);
      expect(w.ents.cols.B[s]! < 1.5).toBe(builds);
    }
  });

  it('the clock needs an attachment surface and Active state: off-surface or not Active resets it', () => {
    const w = hungryGel();
    // An E03 carrier, so it may rest (no food here, so it stays Resting once put there).
    const s = introduceOrganism(w, speciesIndex(w, 'B02'), CELL, 'test', {
      modules: ['E03'],
      exactCenter: true,
    });
    rebaseLedger(w);
    rebuildIndex(w);
    const c = w.ents.cols;
    c.B[s] = 1.5;
    c.E[s] = 60;
    for (let t = 0; t < 50; t++) step(w);
    expect(c.filmSeconds[s]).toBeCloseTo(5, 9);
    // Not Active: stage 2 resets the clock and stage 8 runs no action.
    c.lifeState[s] = 2;
    step(w);
    expect(c.filmSeconds[s]).toBe(0);
    c.lifeState[s] = 0;
    for (let t = 0; t < 30; t++) step(w);
    expect(c.filmSeconds[s]).toBeCloseTo(3, 9);
    // Habitat paint turns its cell to open water: no surface, no clock, no film.
    w.grid.substrate[CELL] = 0;
    w.grid.geometryVersion++;
    step(w);
    expect(c.filmSeconds[s]).toBe(0);
    expect(w.fields.film![CELL]).toBe(0);
  });
});

describe('P3.3 film decay, transport and exposure', () => {
  it('decay moves 0.1 %/s of film C and N into detritus: the closed form over 1,000 ticks', () => {
    const w = hungryGel();
    setField(w, 'film', CELL, 0.3);
    setField(w, 'filmN', CELL, 0.03);
    const det0 = w.fields.detritus![CELL]!;
    const detN0 = w.fields.detritusN![CELL]!;
    for (let t = 0; t < 1000; t++) step(w);
    const keep = Math.pow(1 - FRAC, 1000);
    expect(w.fields.film![CELL]).toBeCloseTo(0.3 * keep, 14);
    expect(w.fields.filmN![CELL]).toBeCloseTo(0.03 * keep, 15);
    expect(w.fields.detritus![CELL]! - det0).toBeCloseTo(0.3 * (1 - keep), 14);
    expect(w.fields.detritusN![CELL]! - detN0).toBeCloseTo(0.03 * (1 - keep), 15);
    expect(keep).toBeLessThan(0.91); // ≈ e^−0.1: the decay really ran
    expect(checkLedger(w).ok).toBe(true);
  });

  /** One stage-2 step of a 1.0 sugar pulse at CELL; returns the amount each of E, S, W, N received. */
  function pulse(filmAt: readonly number[]): number[] {
    const w = gel();
    fillField(w, 'sugar', 0);
    for (const cell of filmAt) setField(w, 'film', cell, 0.2);
    setField(w, 'sugar', CELL, 1);
    stageEnvironment(w);
    const s = w.fields.sugar!;
    return [s[CELL + 1]!, s[CELL + GRID_W]!, s[CELL - 1]!, s[CELL - GRID_W]!];
  }

  it('a pulse crosses each of the four edges at half rate when the cell has film', () => {
    const open = pulse([]);
    for (const v of open) expect(v).toBeGreaterThan(0);
    const filmed = pulse([CELL]);
    for (let k = 0; k < 4; k++) expect(filmed[k]).toBe(open[k]! * 0.5);
  });

  it('film only in a neighbouring cell halves just that shared edge', () => {
    const open = pulse([]);
    const neighbours = [CELL + 1, CELL + GRID_W, CELL - 1, CELL - GRID_W];
    for (let k = 0; k < 4; k++) {
      const got = pulse([neighbours[k]!]);
      for (let j = 0; j < 4; j++) expect(got[j]).toBe(j === k ? open[j]! * 0.5 : open[j]!);
    }
  });

  it('inhibitor exposure halves once, whatever the amount of film', () => {
    const w = hungryGel();
    setField(w, 'inhBact', CELL, 0.4);
    const sp = w.species[speciesIndex(w, 'B02')]!;
    expect(inhibitorExposure(w, sp, CELL)).toBe(0.4);
    setField(w, 'film', CELL, 0.01);
    expect(inhibitorExposure(w, sp, CELL)).toBe(0.2);
    setField(w, 'film', CELL, 0.5);
    expect(inhibitorExposure(w, sp, CELL)).toBe(0.2);
  });
});

describe('P3.3 film as detritus food (D-0038)', () => {
  /**
   * One tick with film as the only food placed in each eater's cell (decay adds a trace of detritus,
   * which the eaters list first): film taken, film + detritus taken, and the intake each recorded.
   */
  function eatOnce(
    w: World,
    eaters: readonly { slot: number; cell: number }[],
  ): { taken: number[]; pools: number[]; ate: number[] } {
    const c = w.ents.cols;
    const film = w.fields.film!;
    const det = w.fields.detritus!;
    const before = eaters.map(() => 0);
    const beforeDet = eaters.map(() => 0);
    const accum0 = eaters.map((e) => c.intakeAccum[e.slot]!);
    const taken = eaters.map(() => 0);
    const pools = eaters.map(() => 0);
    step(w, {
      afterStage: (stage) => {
        if (stage === 5)
          eaters.forEach((e, k) => ((before[k] = film[e.cell]!), (beforeDet[k] = det[e.cell]!)));
        if (stage === 6)
          eaters.forEach((e, k) => {
            taken[k] = before[k]! - film[e.cell]!;
            pools[k] = taken[k] + (beforeDet[k]! - det[e.cell]!);
          });
      },
    });
    return { taken, pools, ate: eaters.map((e, k) => c.intakeAccum[e.slot]! - accum0[k]!) };
  }

  it('B04 and F01 eat film: the pool falls by exactly what they took, and the ledger closes', () => {
    const w = hungryGel();
    const cb = cellIndex(GX, GY);
    const cf = cellIndex(GX + 4, GY);
    setField(w, 'film', cb, 0.3);
    setField(w, 'filmN', cb, 0.03);
    setField(w, 'film', cf, 0.3);
    setField(w, 'filmN', cf, 0.03);
    const b04 = place(w, 'B04', GX + 0.5, GY + 0.5);
    const f01 = place(w, 'F01', GX + 4.5, GY + 0.5);
    const total0 = computeTotals(w);
    const { taken, pools, ate } = eatOnce(w, [
      { slot: b04, cell: cb },
      { slot: f01, cell: cf },
    ]);
    for (let k = 0; k < 2; k++) {
      expect(taken[k]).toBeGreaterThan(0.005);
      expect(ate[k]).toBeCloseTo(pools[k]!, 15);
    }
    const total1 = computeTotals(w);
    expect(Math.abs(total1.c - total0.c) / total0.c).toBeLessThan(1e-12);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('a weighted genome eats film with its detritus weight; zero detritus weight eats no film', () => {
    for (const [wDet, eats] of [
      [0.4, true],
      [0, false],
    ] as const) {
      const w = hungryGel();
      setField(w, 'film', CELL, 0.3);
      setField(w, 'filmN', CELL, 0.03);
      const s = place(w, 'B04', GX + 0.5, GY + 0.5);
      const c = w.ents.cols;
      const g = w.genomes.get(c.genome[s]!);
      const rest = (1 - wDet) / 3;
      c.genome[s] = w.genomes.intern({
        ancestor: g.ancestor,
        loci: g.loci,
        policy: 'weighted',
        weights: [wDet, rest, rest, rest],
        modules: g.modules,
        dev: g.dev,
      });
      const { taken } = eatOnce(w, [{ slot: s, cell: CELL }]);
      expect(taken[0]! > 0).toBe(eats);
      if (!eats) expect(c.limitCode[s]).toBe(R.FOOD_EXCLUDED_BY_PREFERENCE);
    }
  });

  it('a world without the film system makes no film request and B04 never reads film', () => {
    const shipped = registry();
    const systems = shipped.manifest.enabledSystems.filter(
      (s) => s !== 'film' && s !== 'fungi',
    ) as SystemFlag[];
    const species = shipped.manifest.enabledSpecies.filter((s) => s !== 'B02' && s !== 'F01' && s !== 'F02');
    const w = gel(
      registryWith({ enabledSystems: systems, enabledSpecies: species }, { allowUnimplemented: true }),
    );
    expect(w.fields.film).toBeUndefined();
    fillField(w, 'sugar', 0);
    const s = place(w, 'B04', GX + 0.5, GY + 0.5);
    step(w);
    expect(w.ents.cols.alive[s]).toBe(1);
    expect(w.ents.cols.limitCode[s]).toBe(R.FOOD_NONE_COMPATIBLE);
  });

  it('a B04 preference mutation draws identically with and without the film system (D-0038)', () => {
    const shipped = registry();
    const noFilm = registryWith(
      {
        enabledSystems: shipped.manifest.enabledSystems.filter((s) => s !== 'film' && s !== 'fungi'),
        enabledSpecies: shipped.manifest.enabledSpecies.filter((s) => s !== 'B02' && s !== 'F01' && s !== 'F02'),
      },
      { allowUnimplemented: true },
    );
    const draws = (reg: ContentRegistry): string[] => {
      const w = gel(reg, 'accelerated');
      const s = place(w, 'B04', GX + 0.5, GY + 0.5);
      const out: string[] = [];
      for (let b = 1; b <= 1500; b++) {
        w.ents.cols.birthId[s] = b;
        const p = proposeDaughters(w, s);
        for (const d of [0, 1] as const) {
          if ((p.draws[d].flags & MUT_PREF) === 0) continue;
          const g = w.genomes.get(p.genomes[d]);
          out.push(`${b}:${d}:${g.policy}:${(g.weights ?? []).join(',')}`);
        }
      }
      return out;
    };
    const withFilm = draws(shipped);
    expect(withFilm.length).toBeGreaterThan(20);
    expect(draws(noFilm)).toEqual(withFilm);
  });
});

describe('P3.3 D-0045 carry-over: construction before E01', () => {
  it('a B02 carrying E01 reserves film construction before its E01 producer runs; both happen and the ledger closes', () => {
    const w = hungryGel();
    setField(w, 'starch', CELL, 0.5);
    setField(w, 'starchN', CELL, 0.05);
    const s = introduceOrganism(w, speciesIndex(w, 'B02'), CELL, 'test', {
      modules: ['E01'],
      exactCenter: true,
    });
    rebaseLedger(w);
    const c = w.ents.cols;
    c.filmSeconds[s] = FILM_ATTACH_SECONDS;
    c.B[s] = 1.5;
    c.E[s] = 60;
    rebaseLedger(w);
    rebuildIndex(w);
    const keys = STAGE8_ACTIONS.map((a) => a.key);
    expect(keys.indexOf('BIOFILM')).toBeGreaterThan(keys.indexOf('E_PROTEIN_SECRETION'));
    expect(keys.indexOf('BIOFILM')).toBeLessThan(keys.indexOf('E01'));
    const prof = profileOf(w, s);
    const applying = STAGE8_ACTIONS.filter((a) => a.applies(prof, w, s)).map((a) => a.key);
    expect(applying).toEqual(['BIOFILM', 'E01']);
    // The shipped table, each entry wrapped to log what the organism had left when it ran.
    const log: string[] = [];
    const logged: Stage8Action[] = STAGE8_ACTIONS.map((a) => ({
      ...a,
      run: (ctx) => {
        log.push(`${a.key} B=${ctx.remainingBody().toFixed(4)}`);
        return a.run(ctx);
      },
    }));
    const table = buildActionTable(logged);
    const E0 = c.E[s];
    const secretion0 = w.ledger.energy.secretion;
    stageStructures(w, table);
    expect(log).toEqual(['BIOFILM B=1.5000', `E01 B=${(1.5 - RATE).toFixed(4)}`]);
    expect(c.secretionCode[s]).toBe(R.SECRETING);
    expect(w.fields.film![CELL]).toBe(RATE);
    expect(c.B[s]).toBe(1.5 - RATE);
    const emitCost = 0.4 * DT;
    expect(c.E[s]).toBe(E0 - emitCost);
    expect(w.ledger.energy.secretion - secretion0).toBe(emitCost);
    expect(w.ledger.energy.construction).toBe(0);
    expect(checkLedger(w).ok).toBe(true);
    // And through ordinary ticks with the shipped table.
    for (let t = 0; t < 20; t++) step(w);
    expect(w.fields.film![CELL]!).toBeGreaterThan(RATE);
    expect(checkLedger(w).ok).toBe(true);
  });
});

describe('P3.3 closed-lid Gel Colony with B02, F01 and B04', () => {
  const TICKS = 10_000;
  const HALF = 5_000;

  /** Closed-lid Empty Gel Colony; Velvet, Threadlace and Recyclers added and a debris patch dropped through the tools (logged inputs). */
  function colony(): World {
    const reg = registry();
    const r = withHabitatOverride(reg.recipes.FIRST_DISH_V1!, 'GEL_COLONY');
    const w = realizeRecipe(
      reg,
      {
        ...r,
        lid: 'closed',
        founders: [],
        fieldPatches: [],
        scheduledCommands: [],
        mutationPreset: 'standard',
      },
      { worldId: 'film-colony' },
    );
    expect(w.settings.lid).toBe('closed');
    // A rich debris patch under the Threadlace (a segment feeds only in its own cell; ~4 C per division).
    applyNow(w, 'debris', { kind: 'deposit', materialId: 'DEBRIS', points: [[40, 64]], radius: 6, dose: 6 });
    applyNow(w, 'velvet', { kind: 'inoculate', speciesId: 'B02', x: 30.5, y: 64.5, radius: 5, count: 24 });
    applyNow(w, 'threadlace', { kind: 'inoculate', speciesId: 'F01', x: 40.5, y: 64.5, radius: 3, count: 8 });
    applyNow(w, 'recyclers', { kind: 'inoculate', speciesId: 'B04', x: 34.5, y: 64.5, radius: 5, count: 10 });
    return w;
  }

  it('closes the ledger within 1e-5 over 10,000 ticks; the biology digest is equal at 1× and 4× and across save/reload mid-run', () => {
    // 1× reference, checked every 500 ticks.
    const a = colony();
    const inputs0 = { ...a.ledger.inputs };
    let worst = 0;
    let maxFilm = 0;
    let maxFungi = 0;
    let linked = false;
    let digestHalf = '';
    for (let t = 0; t < TICKS; t += 500) {
      run500(a);
      const check = checkLedger(a);
      expect(check.ok, `tick ${a.tick}: ${JSON.stringify(check)}`).toBe(true);
      worst = Math.max(worst, check.relErr.c, check.relErr.n);
      expect(inactiveFieldsNonZero(a)).toEqual([]);
      for (const v of a.fields.film!) if (v > maxFilm) maxFilm = v;
      maxFungi = Math.max(maxFungi, fungalSegmentCount(a));
      if (aliveOf(a, 'F01').some((s) => fungalDegree(a, s) > 0)) linked = true;
      if (a.tick === HALF) digestHalf = trajectoryDigest(a, 'full');
    }
    expect(a.tick).toBe(TICKS);
    expect(a.ledger.inputs).toEqual(inputs0);
    expect(a.ledger.exchangeC).toBe(0);
    expect(worst).toBeLessThan(1e-5);
    // The run exercised the systems under test.
    expect(maxFilm).toBeGreaterThan(0.05);
    expect(maxFilm).toBeLessThanOrEqual(FILM_CAP);
    expect(maxFungi).toBeGreaterThan(8);
    expect(linked).toBe(true);
    const digestEnd = trajectoryDigest(a, 'full');

    // 4× analogue (steps in fours, observed between) with a save/reload at tick 5,000.
    let b = colony();
    while (b.tick < TICKS) {
      for (let k = 0; k < 4; k++) step(b);
      stateHash(b);
      if (b.tick === HALF) {
        expect(trajectoryDigest(b, 'full')).toBe(digestHalf);
        b = deserializeWorld(
          JSON.parse(JSON.stringify(serializeWorld(b))) as ReturnType<typeof serializeWorld>,
        );
        expect(trajectoryDigest(b, 'full')).toBe(digestHalf);
      }
    }
    expect(trajectoryDigest(b, 'full')).toBe(digestEnd);
    console.info(
      `film colony: worst ledger error ${worst.toExponential(3)}; max film ${maxFilm.toFixed(3)}; max segments ${maxFungi}`,
    );
  }, 1_200_000);
});

function run500(w: World): void {
  for (let k = 0; k < 500; k++) step(w);
}
