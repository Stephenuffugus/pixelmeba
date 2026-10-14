/**
 * Phase 5 wave 10 barrier-transport: per-gate transfer tallies (BUILD_DIRECTIVE P5.2; g5-briefs S8;
 * D-0108 gateTally is saved, never hashed, never read by the simulation; D-0117 |flux| per field from the
 * kernel's own expression on pre-step values, organism crossings by tracing each organism's straight
 * stage 4 path; an attached parasite counts as its own crossing).
 *
 * Worlds: barrierDish (clear water, shipped manifest + 'barriers', 'climate', 'devices', S01–S12,
 * allowUnimplemented until the systems flip, D-0104), edges pushed with wave 9's helpers.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import type { EdgeBarrier } from '../../src/sim/barriers';
import { DT, ENZYME_DECAY_PER_SECOND } from '../../src/sim/constants';
import { cellIndex, maskCells } from '../../src/sim/grid';
import { gateOrganismsAfter, gateOrganismsBefore } from '../../src/sim/gateTally';
import { stateHash } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import { stageEnvironment } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { aliveOf, barrierDish, clearWater, place, pushEdges, registry, setField, verticalLine } from '../helpers/world';

const meta = { name: 'gate tally', savedAt: '2026-10-14T00:00:00Z', recipeId: null };
const LX = 63;

function relClose(a: number, b: number, rel = 1e-12): void {
  expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(rel * Math.max(Math.abs(a), Math.abs(b)));
}

function dish(edges: readonly Omit<EdgeBarrier, 'id'>[], overrides: Parameters<typeof barrierDish>[0] = {}): World {
  const w = barrierDish({ seed: 104729, ...overrides });
  pushEdges(w, edges);
  return w;
}

function tallySum(w: World, pick: (t: World['gateTally'][number]) => number, ids?: readonly number[]): number {
  let s = 0;
  for (const t of w.gateTally) if (ids === undefined || ids.includes(t.id)) s += pick(t);
  return s;
}

function expectSortedBelowNext(w: World): void {
  for (let k = 0; k < w.gateTally.length; k++) {
    expect(w.gateTally[k]!.id).toBeLessThan(w.counters.nextDeviceId);
    if (k > 0) expect(w.gateTally[k]!.id).toBeGreaterThan(w.gateTally[k - 1]!.id);
  }
}

/** Run `ticks` full steps counting, independently, organisms whose side of the x = 63|64 line changed in stage 4. */
function runCountingSides(w: World, ticks: number): number {
  const side = new Int8Array(w.ents.cols.x.length);
  const birth = new Uint32Array(w.ents.cols.x.length);
  let changes = 0;
  const hooks = {
    afterStage: (stage: number, ww: World) => {
      const c = ww.ents.cols;
      if (stage === 3) {
        for (let i = 0; i < ww.ents.highWater; i++) {
          birth[i] = c.alive[i] === 1 ? c.birthId[i]! : 0;
          side[i] = Math.floor(c.x[i]!) <= LX ? 0 : 1;
        }
      } else if (stage === 4) {
        for (let i = 0; i < ww.ents.highWater; i++) {
          if (birth[i] === 0 || c.alive[i] !== 1 || c.birthId[i] !== birth[i]) continue;
          if ((Math.floor(c.x[i]!) <= LX ? 0 : 1) !== side[i]) changes++;
        }
      }
    },
  };
  for (let t = 0; t < ticks; t++) step(w, hooks);
  return changes;
}

function sugarEverywhere(w: World, v: number): void {
  for (const cell of maskCells()) setField(w, 'sugar', cell, v);
}

describe('field tallies', () => {
  it('sugar on one side of an S02 line, closed lid, no organisms: the far side’s gain equals the tally’s sugar amount, one-way', () => {
    const w = dish(verticalLine('S02', LX, 0, 127), { lid: 'closed' });
    for (const cell of maskCells()) if (cell % 128 <= LX) setField(w, 'sugar', cell, 0.4);
    const sugar = w.fields.sugar!;
    for (let t = 0; t < 200; t++) {
      // One-way: every left gate cell holds at least its right neighbour's sugar before the step.
      for (const e of w.edges) expect(sugar[e.cell]! >= sugar[e.cell + 1]!).toBe(true);
      step(w);
    }
    let far = 0;
    for (const cell of maskCells()) if (cell % 128 > LX) far += sugar[cell]!;
    expect(far).toBeGreaterThan(0.1);
    relClose(tallySum(w, (t) => t.fields.sugar ?? 0), far);
    expect(w.gateTally.length).toBeGreaterThan(50);
    expect(tallySum(w, (t) => t.organisms)).toBe(0);
    expectSortedBelowNext(w);
  });

  // The tally must use the same coefficient pair and rate scale as the kernel step it observes (wave 10
  // lead fixes item 2): the viral pair for v01/v02 (it differs from the dissolved one at an S01), the half
  // scale for a 'half' field, the film-halved pair beside film. One stage 2 from a field held only left of
  // the line, so the far side's gain is exactly the flux through the gates (then any uniform decay in
  // the same stage, divided out).
  const farSum = (w: World, id: 'v01' | 'eStarch' | 'sugar') => {
    let s = 0;
    for (const cell of maskCells()) if (cell % 128 > LX) s += w.fields[id]![cell]!;
    return s;
  };
  const tallyOf = (w: World, id: 'v01' | 'eStarch' | 'sugar') => tallySum(w, (t) => t.fields[id] ?? 0);

  it('v01 through an S02 line in a dish that also holds an S01 (the viral pair): the far side’s gain equals the tally', () => {
    const edges = [...verticalLine('S02', LX, 0, 63), ...verticalLine('S01', LX, 64, 127)];
    const w = dish(edges, { lid: 'closed' });
    for (const cell of maskCells()) if (cell % 128 <= LX) setField(w, 'v01', cell, 50);
    stageEnvironment(w);
    const gain = farSum(w, 'v01') / (1 - 0.01 * 0.1); // decayViral: × (1 − 0.01 × dt) after transport
    expect(gain).toBeGreaterThan(1);
    relClose(tallyOf(w, 'v01'), gain);
    // No v01 crosses the S01 (viral factor 0), so no S01 gate tallies it.
    const s01 = new Set(w.edges.filter((e) => e.kind === 'S01').map((e) => e.id));
    expect(w.gateTally.filter((t) => s01.has(t.id) && t.fields.v01 !== undefined)).toEqual([]);
  });

  it('eStarch (half rate) through an S01 line: the far side’s gain equals the tally', () => {
    const w = dish(verticalLine('S01', LX, 0, 127), { lid: 'closed' });
    for (const cell of maskCells()) if (cell % 128 <= LX) setField(w, 'eStarch', cell, 0.5);
    stageEnvironment(w);
    const gain = farSum(w, 'eStarch') / (1 - ENZYME_DECAY_PER_SECOND * DT);
    expect(gain).toBeGreaterThan(1e-3);
    relClose(tallyOf(w, 'eStarch'), gain);
  });

  it('sugar through an S02 line beside film (the film-halved pair): the far side’s gain equals the tally over 50 stages', () => {
    const w = dish(verticalLine('S02', LX, 0, 127), { lid: 'closed' });
    for (const cell of maskCells()) {
      if (cell % 128 <= LX) setField(w, 'sugar', cell, 0.4);
      // Film on every other row of the left gate column: half the gates are film-halved, half are not.
      if (cell % 128 === LX && Math.floor(cell / 128) % 2 === 0) {
        setField(w, 'film', cell, 0.2);
        setField(w, 'filmN', cell, 0.02);
      }
    }
    for (let t = 0; t < 50; t++) {
      stageEnvironment(w);
      w.tick++;
    }
    const gain = farSum(w, 'sugar');
    expect(gain).toBeGreaterThan(0.1);
    relClose(tallyOf(w, 'sugar'), gain);
  });

  it('a closed shutter tallies nothing; an S04 is not in the diffusion tallies', () => {
    const w = dish([
      { kind: 'S03', cell: cellIndex(60, 64), dir: 'R', open: false },
      { kind: 'S04', cell: cellIndex(60, 70), dir: 'R', flow: -1 },
    ], { lid: 'closed' });
    setField(w, 'sugar', cellIndex(60, 64), 1);
    setField(w, 'sugar', cellIndex(60, 70), 1);
    stageEnvironment(w);
    expect(w.gateTally.find((t) => t.id === w.edges[0]!.id)).toBeUndefined();
    // The channel at (60,70) flows from (61,70) (holding no sugar) into (60,70): no sugar entry.
    expect(w.gateTally.find((t) => t.id === w.edges[1]!.id)?.fields.sugar).toBeUndefined();
  });

  it('channel moves are tallied', () => {
    const w = dish([{ kind: 'S04', cell: cellIndex(60, 64), dir: 'R', flow: 1 }], { lid: 'closed' });
    setField(w, 'sugar', cellIndex(60, 64), 1);
    place(w, 'B01', 60.5, 64.5);
    stageEnvironment(w);
    const t = w.gateTally[0]!;
    relClose(t.fields.sugar!, w.fields.sugar![cellIndex(61, 64)]!);
    expect(t.organisms).toBe(1);
  });
});

describe('organism crossings', () => {
  it('B01 crossing an S02 gate and an open shutter: counted once per crossing', () => {
    const edges = [...verticalLine('S02', LX, 0, 63), ...verticalLine('S03', LX, 64, 127, { open: true })];
    const w = dish(edges);
    sugarEverywhere(w, 0.05);
    for (let k = 0; k < 40; k++) place(w, 'B01', 58.5 + (k % 10), 40.5 + Math.floor(k / 10) * 12 + (k % 3), { E: 60 });
    const sides = runCountingSides(w, 1500);
    const s02 = w.edges.filter((e) => e.kind === 'S02').map((e) => e.id);
    const s03 = w.edges.filter((e) => e.kind === 'S03').map((e) => e.id);
    expect(sides).toBeGreaterThan(0);
    expect(tallySum(w, (t) => t.organisms)).toBe(sides);
    expect(tallySum(w, (t) => t.organisms, s02)).toBeGreaterThan(0);
    expect(tallySum(w, (t) => t.organisms, s03)).toBeGreaterThan(0);
    expectSortedBelowNext(w);
  }, 60_000);

  it('a diagonal step through an exact corner counts each barrier edge it crosses (Y first)', () => {
    const w = dish([
      { kind: 'S03', cell: cellIndex(60, 60), dir: 'D', open: true },
      { kind: 'S03', cell: cellIndex(60, 61), dir: 'R', open: true },
      { kind: 'S03', cell: cellIndex(60, 60), dir: 'R', open: true },
    ]);
    const s = place(w, 'B01', 60.5, 60.5);
    gateOrganismsBefore(w);
    w.ents.cols.x[s] = 61.5;
    w.ents.cols.y[s] = 61.5;
    gateOrganismsAfter(w);
    // Y first at the exact corner: down through (60,60)D, then right through (60,61)R; (60,60)R is not crossed.
    const byId = (id: number) => w.gateTally.find((t) => t.id === id)?.organisms ?? 0;
    expect(byId(w.edges.find((e) => e.dir === 'D')!.id)).toBe(1);
    expect(byId(w.edges.find((e) => e.cell === cellIndex(60, 61))!.id)).toBe(1);
    expect(byId(w.edges.find((e) => e.cell === cellIndex(60, 60) && e.dir === 'R')!.id)).toBe(0);
  });

  it('an S01 line is never crossed: count 0 over 3,000 ticks with B01 on both sides', () => {
    const w = dish(verticalLine('S01', LX, 0, 127));
    sugarEverywhere(w, 0.05);
    for (let k = 0; k < 30; k++) place(w, 'B01', 56.5 + (k % 15), 44.5 + Math.floor(k / 15) * 20 + (k % 4), { E: 60 });
    const sides = runCountingSides(w, 3000);
    expect(sides).toBe(0);
    expect(tallySum(w, (t) => t.organisms)).toBe(0);
    expect(aliveOf(w, 'B01').length).toBeGreaterThan(0);
    // Diffusion crossed it (sugar is tallied), organisms never did.
    expect(w.gateTally.length).toBeGreaterThan(0);
  }, 120_000);

  it('a host and its attached parasite crossing together count 2', () => {
    const w = dish([{ kind: 'S03', cell: cellIndex(60, 64), dir: 'R', open: true }]);
    const h = place(w, 'A01', 60.5, 64.5);
    const p = place(w, 'X01', 60.5, 64.5);
    const c = w.ents.cols;
    c.hostSlot[p] = h;
    c.hostBirthId[p] = c.birthId[h]!;
    c.parasiteSlot[h] = p;
    c.parasiteBirthId[h] = c.birthId[p]!;
    gateOrganismsBefore(w);
    c.x[h] = 61.5;
    c.x[p] = 61.5;
    gateOrganismsAfter(w);
    expect(w.gateTally[0]!.organisms).toBe(2);
  });

  it('a slot that died and was reused within the step is not counted', () => {
    const w = dish([{ kind: 'S03', cell: cellIndex(60, 64), dir: 'R', open: true }]);
    const s = place(w, 'B01', 60.5, 64.5);
    gateOrganismsBefore(w);
    w.ents.cols.birthId[s] = w.ents.cols.birthId[s]! + 1000;
    w.ents.cols.x[s] = 61.5;
    gateOrganismsAfter(w);
    expect(w.gateTally).toEqual([]);
  });
});

describe('observation only', () => {
  it('two worlds differing only in gateTally have equal stateHash', () => {
    const a = dish(verticalLine('S02', LX, 30, 90));
    const b = dish(verticalLine('S02', LX, 30, 90));
    b.gateTally.push({ id: b.edges[0]!.id, fields: { sugar: 3.5 }, organisms: 7 });
    expect(stateHash(b)).toBe(stateHash(a));
  });

  it('a world without barriers keeps gateTally []', () => {
    const w = clearWater({ seed: 104729 }, registry());
    sugarEverywhere(w, 0.05);
    for (let k = 0; k < 20; k++) place(w, 'B01', 55.5 + k, 64.5, { E: 60 });
    run(w, 500);
    expect(w.gateTally).toEqual([]);
    const v = barrierDish({ seed: 104729 });
    sugarEverywhere(v, 0.05);
    for (let k = 0; k < 20; k++) place(v, 'B01', 55.5 + k, 64.5, { E: 60 });
    run(v, 500);
    expect(v.gateTally).toEqual([]);
  });

  it('save at tick 777 → load → continue to 2,000 gives a gateTally deep-equal to the uninterrupted run’s', async () => {
    const edges = [
      ...verticalLine('S02', LX, 0, 50),
      ...verticalLine('S01', LX, 51, 60),
      ...verticalLine('S03', LX, 61, 70, { open: true }),
      ...verticalLine('S03', LX, 71, 80, { open: false }),
      ...verticalLine('S04', LX, 81, 82, { flow: 1 }),
      ...verticalLine('S02', LX, 83, 127),
    ];
    const a = dish(edges);
    for (const cell of maskCells()) if (cell % 128 <= LX) setField(a, 'sugar', cell, 0.2);
    for (let k = 0; k < 30; k++) place(a, 'B01', 58.5 + (k % 10), 30.5 + Math.floor(k / 10) * 20 + (k % 4), { E: 60 });
    run(a, 777);
    const { text } = await buildSaveFile(a, meta);
    const { world: b } = await loadSaveFile(text);
    expect(b.gateTally).toEqual(a.gateTally);
    run(a, 2000 - 777);
    run(b, 2000 - 777);
    expect(stateHash(b)).toBe(stateHash(a));
    expect(b.gateTally).toEqual(a.gateTally);
    expect(tallySum(a, (t) => t.organisms)).toBeGreaterThan(0);
    expectSortedBelowNext(a);
  }, 120_000);
});
