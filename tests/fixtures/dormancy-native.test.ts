/**
 * Phase 5 wave 10, e3-resters: native dormancy for B12 Sleeper and P08 Waterbear (SPEC §7.6; CT §12.7;
 * src/sim/dormancy.ts, phenotype.ts NATIVE_DORMANCY). No new mechanism: the existing machine runs them.
 *
 * - B12 without food: Preparing once the no-intake clock reaches 20 s with E ≥ 15 (10 E spent once,
 *   ledger energy.dormancy), Resting 5 s later (0.01 E/s, inhibitor damage × 0.10), wakes after 10 s of
 *   food, moisture and environment with E ≥ 5 (5 E spent once), Active 5 s later with a 30 s lockout.
 * - P08 the same (a predator: its food is prey in reach); a resting B12 is still prey (P01 captures it).
 *   No species of CT §3.2 lists P08 as prey, so a resting P08 cannot be shown being eaten.
 * - Moisture (D-0117 owner flag, CT numbers unchanged): a native rester's moisture minimum is 0.2, so with
 *   the shoulder 0.2 its moisture suitability at drying's floor 0.1 is 0.5, above the dry trigger 0.20: it
 *   never rests dry. An E03 B01 (moisture minimum 0.4) on drying gel rests dry (RESTING_DRY) once its
 *   moisture falls below 0.24.
 * - Saves: buildSaveFile → loadSaveFile in each state (Preparing, Resting, Waking, the lockout) continues
 *   identically.
 *
 * Registry: tests/helpers/world.ts resterRegistry() (allowUnimplemented: DORMANCY is implemented natively
 * here and listed as implemented by the lead at integration, D-0117).
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { DT, INHIBITOR_DAMAGE, STRESS_THRESHOLD } from '../../src/sim/constants';
import { moistureSuitability } from '../../src/sim/dormancy';
import { FLAG, LIFE_ACTIVE, LIFE_PREPARING, LIFE_RESTING, LIFE_WAKING } from '../../src/sim/entities';
import { cellIndex } from '../../src/sim/grid';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { inhibitorExposure } from '../../src/sim/suitability';
import { run, step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { trajectoryDigest } from '../helpers/trajectory';
import { clearWater, place, placeWith, resterRegistry, setField } from '../helpers/world';

const REG = resterRegistry();
const meta = { name: 'native dormancy', savedAt: '2026-10-14T00:00:00Z', recipeId: null };

interface Timeline {
  preparing: number;
  resting: number;
  waking: number;
  active: number;
  prepareCost: number;
  wakeCost: number;
}

/** Step until `stop` and record the tick of each transition of slot `s` and the energy each one charged. */
function follow(w: World, s: number, maxTicks: number, onTick?: (t: number) => void): Timeline {
  const c = w.ents.cols;
  const tl: Timeline = { preparing: -1, resting: -1, waking: -1, active: -1, prepareCost: 0, wakeCost: 0 };
  let prev = c.lifeState[s];
  for (let t = 1; t <= maxTicks; t++) {
    const before = w.ledger.energy.dormancy;
    step(w);
    const now = c.lifeState[s];
    if (now !== prev) {
      if (now === LIFE_PREPARING) {
        tl.preparing = t;
        tl.prepareCost = w.ledger.energy.dormancy - before;
      } else if (now === LIFE_RESTING) tl.resting = t;
      else if (now === LIFE_WAKING) {
        tl.waking = t;
        tl.wakeCost = w.ledger.energy.dormancy - before;
      } else if (now === LIFE_ACTIVE) {
        tl.active = t;
        return tl;
      }
      prev = now;
    }
    onTick?.(t);
  }
  return tl;
}

/** The cell organism `s` sits in now (resters wander while Active). */
function cellOf(w: World, s: number): number {
  return cellIndex(Math.floor(w.ents.cols.x[s]!), Math.floor(w.ents.cols.y[s]!));
}

/** Sugar on the cells around organism `s`'s cell. */
function sugarAt(w: World, s: number, amount: number): void {
  const cell = cellOf(w, s);
  sugarAround(w, cell % 128, Math.floor(cell / 128), amount);
}

function sugarAround(w: World, x: number, y: number, amount: number, r = 2): void {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) setField(w, 'sugar', cellIndex(x + dx, y + dy), amount);
}

async function reload(w: World): Promise<World> {
  return (await loadSaveFile((await buildSaveFile(w, meta)).text)).world;
}

/**
 * Save → load, compared with the original `w` itself (stateHash, and the dormancy columns explicitly, so a
 * save that dropped FLAG.restDry or a clock fails here); then the loaded world and an in-memory copy of `w`
 * both continue `ticks`: equal stateHash and trajectory digest. `w` is not stepped.
 */
async function roundTrip(w: World, ticks = 80): Promise<void> {
  const back = await reload(w);
  expect(stateHash(back)).toBe(stateHash(w));
  const hw = w.ents.highWater;
  for (const col of ['alive', 'lifeState', 'flags', 'stateTimer', 'dryTimer', 'lockoutTimer', 'limitCode'] as const)
    expect(Array.from(back.ents.cols[col].subarray(0, hw)), col).toEqual(Array.from(w.ents.cols[col].subarray(0, hw)));
  const ref = deserializeWorld(serializeWorld(w));
  expect(stateHash(ref)).toBe(stateHash(w));
  run(ref, ticks);
  run(back, ticks);
  expect(stateHash(back)).toBe(stateHash(ref));
  expect(trajectoryDigest(back, 'full')).toBe(trajectoryDigest(ref, 'full'));
}

describe('B12 Sleeper runs the dormancy machine natively (SPEC §7.6, CT §12.7)', () => {
  it('records NATIVE_DORMANCY with CT §12.7 numbers and a 20 s trigger', () => {
    const w = clearWater({}, REG);
    const s = place(w, 'B12', 64.5, 64.5);
    const prof = profileOf(w, s);
    expect(prof.dormancy).not.toBeNull();
    expect(prof.dormancy!.source).toBe('native');
    expect(prof.dormancyTriggerSeconds).toBeCloseTo(20, 12);
    expect(prof.dormancy).toMatchObject({ prepareSeconds: 5, prepareCost: 10, restMaintenance: 0.01, damageFactor: 0.1, wakeSeconds: 5, wakeCost: 5, wakeMinEnergy: 5, lockoutSeconds: 30, entryMinEnergy: 15, drySuitability: 0.2, drySeconds: 10, wakeConditionSeconds: 10 });
  });

  it('without food: Preparing at 20 s (10 E), Resting at 25 s (0.01 E/s); with food back: Waking after 10 s (5 E), Active after 5 s with a 30 s lockout', () => {
    const w = clearWater({}, REG);
    const s = place(w, 'B12', 64.5, 64.5);
    const c = w.ents.cols;
    expect(c.E[s]!).toBeGreaterThanOrEqual(15);
    const restE: number[] = [];
    const tl = follow(w, s, 600, () => {
      if (c.lifeState[s] === LIFE_RESTING) {
        restE.push(c.E[s]!);
        expect(c.limitCode[s]).toBe(R.RESTING_FOOD_SCARCE);
        expect(c.flags[s]! & FLAG.restNewborn).toBe(0);
        if (restE.length === 30) sugarAt(w, s, 0.5); // food back after 3 s of rest
      }
    });
    expect(tl.preparing).toBe(200);
    expect(tl.prepareCost).toBe(10);
    expect(tl.resting - tl.preparing).toBe(50);
    // Resting upkeep: 0.01 E/s replaces every other cost.
    for (let k = 1; k < 29; k++) expect(restE[k - 1]! - restE[k]!).toBeCloseTo(0.01 * DT, 12);
    // Food from the tick after rest tick 30 (resting + 29) on: the wake clock reaches 10 s 100 ticks later.
    expect(tl.waking - (tl.resting + 29)).toBe(100);
    expect(tl.wakeCost).toBe(5);
    expect(tl.active - tl.waking).toBe(50);
    expect(c.lockoutTimer[s]).toBe(30);
  });

  it('resting: inhibitor damage × 0.10 (bacterial inhibitor in its cell)', () => {
    const w = clearWater({}, REG);
    const s = place(w, 'B12', 64.5, 64.5);
    const c = w.ents.cols;
    run(w, 251);
    expect(c.lifeState[s]).toBe(LIFE_RESTING);
    const cell = cellOf(w, s);
    const sp = w.species[c.species[s]!]!;
    for (let t = 0; t < 20; t++) {
      setField(w, 'inhBact', cell, 0.05);
      const H0 = c.H[s]!;
      step(w);
      const exposure = inhibitorExposure(w, sp, cell); // what stage 7 read (nothing after it changes the field)
      expect(exposure).toBeGreaterThan(0);
      expect(c.suitability[s]!).toBeGreaterThanOrEqual(STRESS_THRESHOLD);
      expect(H0 - c.H[s]!).toBeCloseTo(INHIBITOR_DAMAGE * exposure * DT * 0.1, 12);
    }
  });

  it('a resting B12 is still prey: an Amoeba captures it', () => {
    const w = clearWater({}, REG);
    const s = place(w, 'B12', 64.5, 64.5);
    const c = w.ents.cols;
    run(w, 251);
    expect(c.lifeState[s]).toBe(LIFE_RESTING);
    const birthId = c.birthId[s]!;
    place(w, 'P01', c.x[s]! + 0.2, c.y[s]!, { E: 20 });
    let caught = false;
    for (let t = 0; t < 300 && !caught; t++) {
      expect(c.lifeState[s]).toBe(LIFE_RESTING);
      step(w);
      caught = w.events.ring.some((e) => e.type === 'death' && e.birthId === birthId && e.cause === R.DEATH_PREDATION);
    }
    expect(caught).toBe(true);
  });

  it('round trips in Preparing, Resting, Waking and the lockout load and continue identically', async () => {
    const w = clearWater({}, REG);
    const s = place(w, 'B12', 64.5, 64.5);
    const c = w.ents.cols;
    run(w, 220);
    expect(c.lifeState[s]).toBe(LIFE_PREPARING);
    await roundTrip(w);
    run(w, 60);
    expect(c.lifeState[s]).toBe(LIFE_RESTING);
    await roundTrip(w);
    sugarAt(w, s, 0.5);
    run(w, 120);
    expect(c.lifeState[s]).toBe(LIFE_WAKING);
    await roundTrip(w, 40);
    run(w, 60);
    expect(c.lifeState[s]).toBe(LIFE_ACTIVE);
    expect(c.lockoutTimer[s]!).toBeGreaterThan(0);
    await roundTrip(w);
  });
});

describe('P08 Waterbear runs the same machine (a predator: prey in reach is its food)', () => {
  it('no prey: Preparing at 20 s, Resting at 25 s; prey beside it: Waking after 10 s, Active after 5 s with the lockout', () => {
    const w = clearWater({}, REG);
    const s = place(w, 'P08', 64.5, 64.5);
    const c = w.ents.cols;
    expect(profileOf(w, s).dormancy!.source).toBe('native');
    let restTicks = 0;
    const tl = follow(w, s, 500, () => {
      if (c.lifeState[s] === LIFE_RESTING && ++restTicks === 20) place(w, 'A01', Math.min(c.x[s]! + 1, 120), c.y[s]!);
      if (c.lifeState[s] === LIFE_RESTING) expect(c.flags[s]! & (FLAG.moving | FLAG.hunting)).toBe(0);
    });
    expect(tl.preparing).toBe(200);
    expect(tl.prepareCost).toBe(10);
    expect(tl.resting - tl.preparing).toBe(50);
    expect(tl.waking - (tl.resting + 19)).toBe(100);
    expect(tl.wakeCost).toBe(5);
    expect(tl.active - tl.waking).toBe(50);
    expect(c.lockoutTimer[s]).toBe(30);
  });

  it('no species lists P08 as prey (CT §3.2): nothing can test it being eaten while resting', () => {
    for (const sp of Object.values(REG.species)) expect(sp.prey.map((p) => p.id), sp.id).not.toContain('P08');
  });
});

describe('moisture and the dry trigger (D-0117 owner flag; CT numbers unchanged)', () => {
  it('a native rester at moisture 0.1 (drying floor) has moisture suitability 0.5 and never rests dry', () => {
    const w = clearWater({ habitatId: 'GEL_COLONY', drying: true }, REG);
    const s = place(w, 'B12', 30.5, 64.5);
    sugarAround(w, 30, 64, 1, 6);
    step(w); // the first stage 2 with drying on allocates the moisture array
    const moist = w.climate.moisture!;
    for (let y = 54; y <= 74; y++) for (let x = 20; x <= 40; x++) moist[cellIndex(x, y)] = 0.1; // labelled test state: dried to the floor
    const c = w.ents.cols;
    for (let t = 0; t < 400; t++) {
      step(w);
      const cell = cellIndex(Math.floor(c.x[s]!), Math.floor(c.y[s]!));
      expect(w.derived.moisture[cell]).toBe(0.1);
      expect(moistureSuitability(w, profileOf(w, s), cell)).toBeCloseTo(0.5, 12);
      expect(c.dryTimer[s]).toBe(0);
      expect(c.lifeState[s]).toBe(LIFE_ACTIVE);
    }
  });

  it('an E03 Sprinter (moisture minimum 0.4) on drying gel rests dry once moisture falls below 0.24', async () => {
    const w = clearWater({ habitatId: 'GEL_COLONY', drying: true }, REG);
    const s = placeWith(w, 'B01', 30.5, 64.5, ['E03']);
    sugarAround(w, 30, 64, 1, 10);
    step(w);
    const moist = w.climate.moisture!;
    for (let y = 50; y <= 78; y++) for (let x = 16; x <= 44; x++) moist[cellIndex(x, y)] = 0.25; // labelled test state
    const c = w.ents.cols;
    let dryFrom = -1;
    let preparing = -1;
    for (let t = 1; t <= 400 && c.lifeState[s] !== LIFE_RESTING; t++) {
      step(w);
      const cell = cellIndex(Math.floor(c.x[s]!), Math.floor(c.y[s]!));
      if (dryFrom < 0 && moistureSuitability(w, profileOf(w, s), cell) < 0.2) {
        dryFrom = t;
        expect(w.derived.moisture[cell]!).toBeLessThan(0.24);
        expect(w.derived.moisture[cell]!).toBeGreaterThan(0.239);
      }
      if (preparing < 0 && c.lifeState[s] === LIFE_PREPARING) preparing = t;
    }
    expect(dryFrom).toBeGreaterThan(0);
    expect(preparing - dryFrom).toBe(99); // 10 s too dry (the clock counts from the first dry tick)
    expect(c.lifeState[s]).toBe(LIFE_RESTING);
    expect(c.limitCode[s]).toBe(R.RESTING_DRY);
    expect(c.flags[s]! & FLAG.restDry).toBe(FLAG.restDry);
    await roundTrip(w); // the dry rest round-trips too (climate moisture array included)
  });
});
