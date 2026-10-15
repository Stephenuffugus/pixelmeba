/**
 * Phase 5 wave 10, e3-resters: determinism, saves and conservation of a dish with every rule of this
 * task (SPEC §7.4–§7.6; CLAUDE.md "Determinism", "Conservation"; D-0103, D-0117).
 *
 * The dish (GEL_COLONY, drying on, through resterRegistry): B12 Sleepers and P08 Waterbears that rest and
 * wake, an F04 mat dividing into resting daughters (two batches, so daughters rest and wake at the same
 * time), F02 lines with X02 Threadriders, B02 on film with V02 Lacephage, Sunbeads in the channel.
 * - run(w, 400) equals four run(w, 100) (stateHash);
 * - saved at a tick where daughters are both resting and waking, then loaded and run to tick 3,000: equal
 *   stateHash and trajectoryDigest 'full' with the uninterrupted run;
 * - closed lid, 10,000 ticks: carbon and nutrient conserve (relative error < 1e-5);
 * - NEUTRAL: a shipped-registry dish of B01, B02, F01, F02, X01 and V01 never reaches a rule of this task:
 *   no resting newborn, no 'resting' birth, the v02 field stays zero, every infection is V01's, and 1× and
 *   4× agree. (The byte-level before/after comparison with the pre-change code is reported in
 *   docs/reports/reviews/g5-wave-10/e3-resters-build.md; the fence and the rc1 corpus also hold it.)
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { applyNow } from '../../src/sim/commands';
import { FLAG, LIFE_RESTING, LIFE_WAKING } from '../../src/sim/entities';
import { cellIndex } from '../../src/sim/grid';
import { checkLedger, computeTotals, expectedTotals } from '../../src/sim/ledger';
import { stateHash } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { trajectoryDigest } from '../helpers/trajectory';
import { aliveOf, clearWater, linkFungal, place, preOrganismFlipRegistry, rebaseLedger, resterRegistry, setField } from '../helpers/world';

const REG = resterRegistry();
const meta = { name: 'resters determinism', savedAt: '2026-10-14T00:00:00Z', recipeId: null };

/** The second F04 batch is placed at this tick (test setup applied identically in every arm). */
const SECOND_BATCH = 120;

function f04Batch(w: World, y: number): void {
  for (let k = 0; k < 4; k++) place(w, 'F04', 20.5 + k * 4, y + 0.5, { B: 4.2, E: 80, age: 100 });
}

function restersDish(lid: 'open' | 'closed' = 'open'): World {
  const w = clearWater({ habitatId: 'GEL_COLONY', drying: true, lid }, REG);
  // Food: detritus under the F04 mat, sugar for the B12s, film for the B02s.
  for (let y = 26; y <= 50; y++) for (let x = 16; x <= 40; x++) setField(w, 'detritus', cellIndex(x, y), 0.3);
  for (let y = 70; y <= 80; y++) for (let x = 20; x <= 34; x++) setField(w, 'sugar', cellIndex(x, y), 0.4);
  f04Batch(w, 30);
  for (let k = 0; k < 4; k++) place(w, 'B12', 22.5 + k * 3, 74.5);
  for (let k = 0; k < 2; k++) place(w, 'B12', 45.5 + k * 3, 90.5); // no food: these rest
  place(w, 'P08', 46.5, 60.5);
  place(w, 'P08', 63.5, 80.5);
  for (let k = 0; k < 6; k++) place(w, 'A01', 61.5 + (k % 2) * 3, 70.5 + Math.floor(k / 2) * 4);
  // F02 lines with Threadriders.
  for (const y of [86, 92]) {
    const segs = [76, 77, 78, 79].map((x, k) => place(w, 'F02', x + 0.5, y + 0.5, { B: k === 0 ? 3.5 : 2.2 }));
    for (let k = 0; k + 1 < segs.length; k++) linkFungal(w, segs[k]!, segs[k + 1]!);
    place(w, 'X02', 76.7, y + 0.5);
    place(w, 'X02', 80.5, y + 0.5);
  }
  // B02 on film with Lacephage.
  for (let k = 0; k < 6; k++) {
    const x = 80 + (k % 3) * 2;
    const y = 40 + Math.floor(k / 3) * 3;
    setField(w, 'film', cellIndex(x, y), 0.3);
    setField(w, 'sugar', cellIndex(x, y), 0.3);
    place(w, 'B02', x + 0.5, y + 0.5);
  }
  applyNow(w, 'phage', { kind: 'inoculate', speciesId: 'V02', x: 82, y: 41, radius: 3, count: 20 });
  rebaseLedger(w);
  return w;
}

/** Run to tick `to`, placing the second F04 batch at SECOND_BATCH. */
function runTo(w: World, to: number): void {
  while (w.tick < to) {
    if (w.tick === SECOND_BATCH) f04Batch(w, 44);
    step(w);
  }
}

function newbornStates(w: World): { resting: number; waking: number } {
  const c = w.ents.cols;
  let resting = 0;
  let waking = 0;
  for (const s of aliveOf(w, 'F04')) {
    if ((c.flags[s]! & FLAG.restNewborn) === 0) continue;
    if (c.lifeState[s] === LIFE_RESTING) resting++;
    else if (c.lifeState[s] === LIFE_WAKING) waking++;
  }
  return { resting, waking };
}

describe('resters dish: determinism and saves', () => {
  it('run(w, 400) equals four run(w, 100)', () => {
    const a = restersDish();
    const b = restersDish();
    runTo(a, 400);
    for (let k = 1; k <= 4; k++) runTo(b, k * 100);
    expect(stateHash(b)).toBe(stateHash(a));
    expect(trajectoryDigest(b, 'full')).toBe(trajectoryDigest(a, 'full'));
  });

  it('saved while daughters rest and wake, loaded and run to 3,000, equals the uninterrupted run', async () => {
    const w = restersDish();
    let at = -1;
    while (w.tick < 1500) {
      runTo(w, w.tick + 1);
      const n = newbornStates(w);
      if (w.tick > SECOND_BATCH && n.resting > 0 && n.waking > 0) {
        at = w.tick;
        break;
      }
    }
    expect(at).toBeGreaterThan(0);
    const back = (await loadSaveFile((await buildSaveFile(w, meta)).text)).world;
    expect(stateHash(back)).toBe(stateHash(w));
    runTo(w, 3000);
    runTo(back, 3000);
    expect(stateHash(back)).toBe(stateHash(w));
    expect(trajectoryDigest(back, 'full')).toBe(trajectoryDigest(w, 'full'));
    // The dish exercised every rule: resting daughters woke, the machine ran, viruses and riders acted.
    expect(w.events.totals.wake ?? 0).toBeGreaterThan(0);
    console.info(`resters dish: saved at tick ${at}; F04 alive ${aliveOf(w, 'F04').length}, wakes ${w.events.totals.wake ?? 0}, B02 alive ${aliveOf(w, 'B02').length}, X02 alive ${aliveOf(w, 'X02').length}`);
  }, 600_000);

  it('closed lid, 10,000 ticks: carbon and nutrient conserve', () => {
    const w = restersDish('closed');
    let worstC = 0;
    let worstN = 0;
    let worstAbsC = 0;
    let worstAbsN = 0;
    for (let chunk = 0; chunk < 20; chunk++) {
      runTo(w, (chunk + 1) * 500);
      const check = checkLedger(w);
      const act = computeTotals(w);
      const exp = expectedTotals(w);
      worstC = Math.max(worstC, check.relErr.c);
      worstN = Math.max(worstN, check.relErr.n);
      worstAbsC = Math.max(worstAbsC, Math.abs(act.c - exp.c));
      worstAbsN = Math.max(worstAbsN, Math.abs(act.n - exp.n));
      expect(check.ok, `tick ${w.tick}: ${JSON.stringify(check)}`).toBe(true);
    }
    expect(w.tick).toBe(10000);
    expect(worstC).toBeLessThan(1e-5);
    expect(worstN).toBeLessThan(1e-5);
    expect(worstAbsC).toBeLessThan(1e-8);
    expect(worstAbsN).toBeLessThan(1e-8);
    console.info(`resters closed lid: worst relative error C ${worstC.toExponential(3)}, N ${worstN.toExponential(3)}; absolute C ${worstAbsC.toExponential(3)}, N ${worstAbsN.toExponential(3)}`);
  }, 600_000);
});

/** A shipped-registry dish of B01, B02, F01, F02, X01 and V01 (no rule of this task can apply). */
function neutralDish(): World {
  const w = clearWater({ habitatId: 'GEL_COLONY' }, preOrganismFlipRegistry()); // a dish without B12, F04, P08, X02 and V02 (shipped since D-0127)
  for (let y = 30; y <= 90; y++) for (let x = 20; x <= 100; x++) setField(w, 'sugar', cellIndex(x, y), 0.3);
  for (let k = 0; k < 8; k++) place(w, 'B01', 60.5 + (k % 4) * 2, 50.5 + Math.floor(k / 4) * 6);
  for (let k = 0; k < 6; k++) {
    setField(w, 'film', cellIndex(30 + k * 2, 40), 0.3);
    place(w, 'B02', 30.5 + k * 2, 40.5);
  }
  place(w, 'F01', 30.5, 70.5, { B: 4.2, E: 80, age: 100 });
  const segs = [80, 81, 82].map((x) => place(w, 'F02', x + 0.5, 70.5, { B: 4.2, E: 80, age: 100 }));
  linkFungal(w, segs[0]!, segs[1]!);
  for (let k = 0; k < 4; k++) place(w, 'A01', 62.5 + k, 80.5);
  place(w, 'X01', 62.7, 80.5);
  applyNow(w, 'phage', { kind: 'inoculate', speciesId: 'V01', x: 63, y: 52, radius: 3, count: 5 });
  rebaseLedger(w);
  return w;
}

describe('NEUTRAL: a shipped dish never reaches a rule of this task', () => {
  it('B01, B02, F01, F02, X01, V01: no resting newborn, no resting birth, v02 stays zero, only V01 infections; 1× = 4×', () => {
    const w = neutralDish();
    const v = neutralDish();
    expect(w.species.some((sp) => ['B12', 'F04', 'P08', 'X02', 'V02'].includes(sp.id))).toBe(false);
    const c = w.ents.cols;
    for (let t = 0; t < 1200; t++) {
      step(w);
      for (const s of aliveOf(w)) {
        expect(c.flags[s]! & FLAG.restNewborn).toBe(0);
        expect([0, 1]).toContain(c.infectedBy[s]);
      }
    }
    expect(w.fields.v02!.every((u) => u === 0)).toBe(true);
    expect(w.events.ring.some((e) => e.type === 'birth' && e.detail?.resting !== undefined)).toBe(false);
    expect(w.events.totals.birth ?? 0).toBeGreaterThan(0);
    for (let k = 0; k < 4; k++) run(v, 300);
    expect(stateHash(v)).toBe(stateHash(w));
  }, 300_000);
});
