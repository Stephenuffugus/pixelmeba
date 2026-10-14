/**
 * Phase 5 wave 10, e3-resters: X02 Threadrider on F02/F04 segments (SPEC §7.4, §6.5 host drains, §6.8;
 * CT §1.2, §3.3, §12.5; src/sim/parasites.ts, generic over HOST_DRAIN and the record's hostIds).
 *
 * - X02 attaches only to Active F02 or F04 segments: never an F01, never a resting F04 (an adult in rest
 *   here; the resting newborn in resting-daughter.test.ts).
 * - It is released alive when its host starts resting (Preparing) or dies.
 * - It drains 0.015 C/s (0.0015 C per tick) with proportional N, split 50 % body / 30 % CO2 / 20 %
 *   metabolite, +30 E per C, no oxygen.
 * - It never travels along F02 links: attached to one segment of a linked F02 line, it keeps its host's
 *   position every tick while the transport pass moves carbon along the links.
 * - It lives free only on gel or sediment (water is outside its habitat).
 * - A host below 0.25 × B0' with it attached dies with DEATH_PARASITE_DRAIN; X02 is released alive.
 * - Saves: an attached pair round-trips and continues identically.
 *
 * Registry: tests/helpers/world.ts resterRegistry() (X02 and F04 through a test registry, D-0104;
 * allowUnimplemented for F04's DORMANCY and RESTING_DAUGHTER, implemented in this wave, D-0117).
 * Worlds: GEL_COLONY (gel, water channel x 59–68), no food.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { stageContacts } from '../../src/sim/contacts';
import { DT } from '../../src/sim/constants';
import { LIFE_ACTIVE, LIFE_PREPARING, LIFE_RESTING } from '../../src/sim/entities';
import { cellIndex } from '../../src/sim/grid';
import { stageIntake } from '../../src/sim/intake';
import { checkLedger } from '../../src/sim/ledger';
import { fungalDegree } from '../../src/sim/links';
import { killEntity, stageMaintenance } from '../../src/sim/maintenance';
import { HOST_DEATH_FRACTION } from '../../src/sim/parasites';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { stateHash } from '../../src/sim/serialize';
import { habitatCompatible, suitabilityAt } from '../../src/sim/suitability';
import { run, step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { trajectoryDigest } from '../helpers/trajectory';
import { aliveOf, clearWater, linkFungal, place, rebaseLedger, resterRegistry } from '../helpers/world';

const REG = resterRegistry();
const meta = { name: 'parasite x02', savedAt: '2026-10-14T00:00:00Z', recipeId: null };

function gelDish(): World {
  return clearWater({ habitatId: 'GEL_COLONY' }, REG);
}

function deathCause(w: World, birthId: number): number | undefined {
  return w.events.ring.find((e) => e.type === 'death' && e.birthId === birthId)?.cause;
}

/** A segment of `speciesId` at the centre of (x, y) with a Threadrider placed 0.2 cells away. */
function segmentWithRider(w: World, speciesId: string, x: number, y: number, state: Parameters<typeof place>[4] = {}): { host: number; par: number } {
  const host = place(w, speciesId, x + 0.5, y + 0.5, state);
  const par = place(w, 'X02', x + 0.7, y + 0.5);
  return { host, par };
}

describe('X02 Threadrider (SPEC §7.4, CT §3.3, §12.5)', () => {
  it('its record: hosts F02 and F04, drains 0.015 C/s, lives on gel or sediment', () => {
    const x02 = REG.species.X02!;
    expect(x02.hostIds).toEqual(['F02', 'F04']);
    expect(x02.drainRate).toBe(0.015);
    expect(x02.habitats).toEqual(['gel', 'sediment']);
  });

  it('attaches to Active F02 and F04 segments only: never F01, never a resting F04', () => {
    const w = gelDish();
    const resting = place(w, 'F04', 40.5, 30.5, { E: 40 });
    run(w, 251); // no food: the adult F04 rests (20 s trigger + 5 s Preparing)
    const c = w.ents.cols;
    expect(c.lifeState[resting]).toBe(LIFE_RESTING);
    const restingRider = place(w, 'X02', 40.7, 30.5);
    const f01 = segmentWithRider(w, 'F01', 20, 40);
    const f02 = segmentWithRider(w, 'F02', 20, 50);
    const f04 = segmentWithRider(w, 'F04', 20, 60);
    stageContacts(w);
    expect(c.hostSlot[f02.par]).toBe(f02.host);
    expect(c.parasiteSlot[f02.host]).toBe(f02.par);
    expect(c.hostSlot[f04.par]).toBe(f04.host);
    expect(c.hostSlot[f01.par]).toBe(-1);
    expect(c.parasiteSlot[f01.host]).toBe(-1);
    expect(c.hostSlot[restingRider]).toBe(-1);
    expect(c.parasiteSlot[resting]).toBe(-1);
  });

  it('released alive when its F04 host starts resting, and when its F02 host dies', () => {
    const w = gelDish();
    const a = segmentWithRider(w, 'F04', 30, 40, { E: 40 });
    const b = segmentWithRider(w, 'F02', 30, 70);
    const c = w.ents.cols;
    step(w);
    expect(c.hostSlot[a.par]).toBe(a.host);
    expect(c.hostSlot[b.par]).toBe(b.host);
    const parBirth = c.birthId[a.par]!;
    let releasedAt = -1;
    let preparingAt = -1;
    for (let t = 0; t < 300 && releasedAt < 0; t++) {
      step(w);
      if (preparingAt < 0 && c.lifeState[a.host] === LIFE_PREPARING) preparingAt = w.tick;
      if (c.hostSlot[a.par] === -1) releasedAt = w.tick;
    }
    expect(preparingAt).toBeGreaterThan(0);
    expect(releasedAt - preparingAt).toBe(1); // stage 5 of the next tick lets it go
    expect(c.alive[a.par]).toBe(1);
    expect(c.birthId[a.par]).toBe(parBirth);
    expect(c.parasiteSlot[a.host]).toBe(-1);
    // Host death.
    const bPar = c.birthId[b.par]!;
    killEntity(w, b.host, R.DEATH_AGE);
    expect(c.alive[b.par]).toBe(1);
    expect(c.birthId[b.par]).toBe(bPar);
    expect(c.hostSlot[b.par]).toBe(-1);
  });

  it('drains exactly 0.0015 C per tick with proportional N: 50 % body, 30 % CO2, 20 % metabolite, +30 E per C, no oxygen', () => {
    const w = gelDish();
    const { host, par } = segmentWithRider(w, 'F02', 30, 50);
    stageContacts(w);
    rebaseLedger(w);
    const c = w.ents.cols;
    expect(c.hostSlot[par]).toBe(host);
    const cell = cellIndex(30, 50);
    const f = w.fields;
    for (let t = 0; t < 25; t++) {
      const before = { hB: c.B[host]!, hN: c.N[host]!, pB: c.B[par]!, pN: c.N[par]!, pE: c.E[par]!, co2: f.co2![cell]!, met: f.metabolite![cell]!, nut: f.nutrient![cell]!, o2: f.oxygen![cell]! };
      stageIntake(w);
      const C = 0.015 * DT;
      const bound = (before.hN * C) / before.hB;
      expect(before.hB - c.B[host]!).toBeCloseTo(C, 15);
      expect(before.hN - c.N[host]!).toBeCloseTo(bound, 15);
      expect(c.B[par]! - before.pB).toBeCloseTo(0.5 * C, 15);
      expect(f.co2![cell]! - before.co2).toBeCloseTo(0.3 * C, 15);
      expect(f.metabolite![cell]! - before.met).toBeCloseTo(0.2 * C, 15);
      expect(c.N[par]! - before.pN).toBeCloseTo(0.05 * C, 15);
      expect(f.nutrient![cell]! - before.nut).toBeCloseTo(bound - 0.05 * C, 15);
      expect(c.E[par]! - before.pE).toBeCloseTo(30 * C, 12);
      expect(f.oxygen![cell]).toBe(before.o2);
      expect(checkLedger(w).ok).toBe(true);
    }
    expect(c.intakeAccum[par]).toBeCloseTo(25 * 0.0015, 14);
  });

  it('never travels along F02 links: it keeps its host position while transport moves carbon along the line', () => {
    const w = gelDish();
    const segs = [30, 31, 32, 33].map((x, k) => place(w, 'F02', x + 0.5, 50.5, k === 0 ? { B: 3.5 } : { B: 2.2 }));
    for (let k = 0; k + 1 < segs.length; k++) linkFungal(w, segs[k]!, segs[k + 1]!);
    const par = place(w, 'X02', 30.7, 50.5);
    const c = w.ents.cols;
    const host = segs[0]!;
    const far = segs[1]!;
    const farB = c.B[far]!;
    step(w);
    expect(c.hostSlot[par]).toBe(host);
    for (let t = 0; t < 200; t++) {
      step(w);
      expect(c.hostSlot[par]).toBe(host);
      expect([c.x[par], c.y[par]]).toEqual([c.x[host], c.y[host]]);
      for (const s of segs.slice(1)) expect(c.parasiteSlot[s]).toBe(-1);
    }
    expect(fungalDegree(w, host)).toBe(1);
    expect(c.B[far]!).toBeGreaterThan(farB); // carbon moved along the link; the rider did not
  });

  it('lives free only on gel or sediment: water is outside its habitat (suitability 0, SUIT_HABITAT)', () => {
    const w = gelDish();
    const par = place(w, 'X02', 30.5, 50.5);
    const sp = w.species[w.ents.cols.species[par]!]!;
    const prof = profileOf(w, par);
    const gel = cellIndex(30, 50);
    const water = cellIndex(63, 50);
    expect(habitatCompatible(w, sp, gel)).toBe(true);
    expect(habitatCompatible(w, sp, water)).toBe(false);
    expect(suitabilityAt(w, sp, prof, gel).value).toBeGreaterThan(0.1);
    const s = suitabilityAt(w, sp, prof, water);
    expect([s.value, s.reason]).toEqual([0, R.SUIT_HABITAT]);
  });

  it(`a host below ${HOST_DEATH_FRACTION} × B0' with X02 attached dies of the drain (DEATH_PARASITE_DRAIN); X02 is released alive`, () => {
    const w = gelDish();
    const b0 = REG.species.F02!.b0;
    const { host, par } = segmentWithRider(w, 'F02', 30, 50, { B: HOST_DEATH_FRACTION * b0 + 0.001 });
    stageContacts(w);
    rebaseLedger(w);
    const c = w.ents.cols;
    expect(c.hostSlot[par]).toBe(host);
    const hostBirth = c.birthId[host]!;
    const parBirth = c.birthId[par]!;
    stageIntake(w);
    stageMaintenance(w); // 0.501 − 0.0015 = 0.4995 < 0.5
    expect(deathCause(w, hostBirth)).toBe(R.DEATH_PARASITE_DRAIN);
    expect(c.alive[par]).toBe(1);
    expect(c.birthId[par]).toBe(parBirth);
    expect(c.hostSlot[par]).toBe(-1);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('without a parasite the same small F02 does not die of the drain rule', () => {
    const w = gelDish();
    const host = place(w, 'F02', 30.5, 50.5, { B: HOST_DEATH_FRACTION * REG.species.F02!.b0 - 0.01 });
    stageIntake(w);
    stageMaintenance(w);
    expect(w.ents.cols.alive[host]).toBe(1);
    expect(w.ents.cols.lifeState[host]).toBe(LIFE_ACTIVE);
  });
});

describe('X02 saves', () => {
  it('an attached Threadrider round-trips and continues identically (stateHash and trajectory digest)', async () => {
    const w = gelDish();
    const { host, par } = segmentWithRider(w, 'F02', 30, 50, { B: 3 });
    segmentWithRider(w, 'F04', 40, 50, { B: 3 });
    run(w, 20);
    expect(w.ents.cols.hostSlot[par]).toBe(host);
    const back = (await loadSaveFile((await buildSaveFile(w, meta)).text)).world;
    expect(stateHash(back)).toBe(stateHash(w));
    run(w, 400);
    run(back, 400);
    expect(stateHash(back)).toBe(stateHash(w));
    expect(trajectoryDigest(back, 'full')).toBe(trajectoryDigest(w, 'full'));
    expect(aliveOf(w, 'X02').length).toBeGreaterThan(0);
  });
});
