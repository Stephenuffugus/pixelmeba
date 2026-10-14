/**
 * Phase 5 wave 11 region-charts-gates: WORLD_GATES, the GateReading for transferAcrossGate goals
 * (src/sim/objectives.ts; SPEC §13.5 "transfer quantity across a named gate"; D-0108, D-0117, D-0119).
 *
 * - On the membrane dish (an S01 line, sugar on the left) a transferAcrossGate goal (an objective record
 *   built here: gate 'S01', field 'sugar', threshold 0.05) is offered with no reader passed (the default
 *   is WORLD_GATES) and completes at the first tick the summed tally has grown by the threshold since Start.
 * - On a v1.0 dish (no edges) the same goal is refused with "this dish has no such gate".
 * - WORLD_GATES sums only the current edges of the named kind; a removed gate's share leaves the sum.
 * - Resumed after buildSaveFile → loadSaveFile, the goal counts from the load (gateTally is saved, but the
 *   amount at Start is not: D-0119 carries exact resume to P5.6 and the notebook's goal progress).
 */
import { describe, expect, it } from 'vitest';
import { GRID_W } from '../../src/sim/constants';
import { cellX, maskCells } from '../../src/sim/grid';
import { ObjectiveError, ObjectiveWatch, objectiveSupportProblem, WORLD_GATES, type ObjectivePredicate } from '../../src/sim/objectives';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { barrierRegistry, clearWater, pushEdges, setField, verticalLine } from '../helpers/world';

const GOAL: ObjectivePredicate = { type: 'transferAcrossGate', params: { gate: 'S01', field: 'sugar', threshold: 0.05 } };

function membraneDish(sugarLeft = 1): World {
  const w = clearWater({ lid: 'closed', backgroundOverrides: { sugar: 0 } }, barrierRegistry());
  pushEdges(w, verticalLine('S01', 63, 0, 127));
  for (const cell of maskCells()) if (cellX(cell) <= 63) setField(w, 'sugar', cell, sugarLeft);
  return w;
}

const tallySum = (w: World, field: 'sugar') => w.gateTally.reduce((s, t) => s + (t.fields[field] ?? 0), 0);

describe('WORLD_GATES and transferAcrossGate', () => {
  it('is offered on the membrane dish and completes at the tick the reading crosses the threshold', () => {
    // Little sugar, so the 0.05 threshold takes hundreds of ticks.
    const w = membraneDish(0.0001);
    step(w); // some sugar has crossed before Start: it does not count
    const before = WORLD_GATES.transferred(w, 'S01', 'sugar')!;
    expect(before).toBeGreaterThan(0);
    expect(objectiveSupportProblem(w, GOAL)).toBeNull();
    const watch = new ObjectiveWatch(GOAL, w);
    let expected: number | null = null;
    while (watch.state === 'running' && w.tick < 5000) {
      step(w);
      if (expected === null && WORLD_GATES.transferred(w, 'S01', 'sugar')! - before >= 0.05) expected = w.tick;
      watch.afterTick(w);
    }
    expect(expected).not.toBeNull();
    expect(expected!).toBeGreaterThan(100);
    expect(watch.state).toBe('completed');
    expect(watch.endTick).toBe(expected);
    expect(watch.value).toBeGreaterThanOrEqual(0.05);
    expect(watch.value).toBeCloseTo(tallySum(w, 'sugar') - before, 12);
  });

  it('a v1.0 dish has no such gate; another kind is not this gate', () => {
    const v1 = clearWater();
    expect(WORLD_GATES.transferred(v1, 'S01', 'sugar')).toBeNull();
    expect(objectiveSupportProblem(v1, GOAL)).toBe('this dish has no such gate');
    expect(() => new ObjectiveWatch(GOAL, v1)).toThrow(ObjectiveError);
    const w = membraneDish();
    const s02 = { ...GOAL, params: { ...GOAL.params, gate: 'S02' } } as ObjectivePredicate;
    expect(objectiveSupportProblem(w, s02)).toBe('this dish has no such gate');
    // An explicit null reader still refuses (the old behaviour for callers that pass one).
    expect(objectiveSupportProblem(w, GOAL, null)).toBe('this dish has no such gate');
  });

  it('sums only the current edges of the named kind; removing a gate removes its share', () => {
    const w = membraneDish();
    // An S02 in the other half: sugar reaches it only by diffusion through the membrane, but it is a
    // different kind and must not enter the S01 sum.
    pushEdges(w, verticalLine('S02', 80, 60, 62));
    for (let t = 0; t < 400; t++) step(w);
    const s01 = w.edges.filter((e) => e.kind === 'S01').map((e) => e.id);
    const of = (ids: number[]) => ids.reduce((s, id) => s + (w.gateTally.find((t) => t.id === id)?.fields.sugar ?? 0), 0);
    expect(WORLD_GATES.transferred(w, 'S01', 'sugar')).toBe(of(s01));
    expect(WORLD_GATES.transferred(w, 'S02', 'sugar')).toBe(of(w.edges.filter((e) => e.kind === 'S02').map((e) => e.id)));
    expect(WORLD_GATES.transferred(w, 'S01', 'sugar')).toBeLessThan(tallySum(w, 'sugar') + 1e-300);
    expect(WORLD_GATES.transferred(w, 'S01', 'broth')).toBe(0);
    // Remove the S01 at row 64 (the tally record stays in the world): its share leaves the sum.
    const gone = w.edges.find((e) => e.kind === 'S01' && Math.floor(e.cell / GRID_W) === 64)!;
    const share = w.gateTally.find((t) => t.id === gone.id)!.fields.sugar!;
    const full = WORLD_GATES.transferred(w, 'S01', 'sugar')!;
    w.edges.splice(w.edges.indexOf(gone), 1);
    w.grid.geometryVersion++;
    expect(WORLD_GATES.transferred(w, 'S01', 'sugar')).toBeCloseTo(full - share, 9);
    expect(w.gateTally.some((t) => t.id === gone.id)).toBe(true);
  });

  it('resumed after buildSaveFile → loadSaveFile, the goal counts from the load', async () => {
    const w = membraneDish();
    const goal = { ...GOAL, params: { ...GOAL.params, threshold: 500 } } as ObjectivePredicate;
    const startAmount = WORLD_GATES.transferred(w, 'S01', 'sugar')!;
    const watch = new ObjectiveWatch(goal, w);
    for (let t = 0; t < 200; t++) {
      step(w);
      watch.afterTick(w);
    }
    expect(watch.state).toBe('running');
    const progress = watch.progress();
    const { text } = await buildSaveFile(w, { name: 'Gate goal', savedAt: '2026-10-14T00:00:00.000Z', recipeId: null });
    const loaded = (await loadSaveFile(text)).world;
    expect(loaded.gateTally).toEqual(w.gateTally); // the tally is saved
    const atLoad = WORLD_GATES.transferred(loaded, 'S01', 'sugar')!;
    expect(atLoad).toBe(WORLD_GATES.transferred(w, 'S01', 'sugar'));
    const resumed = new ObjectiveWatch(goal, loaded, progress);
    // Both continue: the uninterrupted watch counts from Start, the resumed one from the load.
    let first: number | null = null;
    let fromLoad: number | null = null;
    while ((watch.state === 'running' || resumed.state === 'running') && w.tick < 20_000) {
      step(w);
      step(loaded);
      watch.afterTick(w);
      resumed.afterTick(loaded);
      const now = WORLD_GATES.transferred(loaded, 'S01', 'sugar')!;
      expect(now).toBe(WORLD_GATES.transferred(w, 'S01', 'sugar'));
      if (first === null && now - startAmount >= 500) first = loaded.tick;
      if (fromLoad === null && now - atLoad >= 500) fromLoad = loaded.tick;
    }
    expect(watch.endTick).toBe(first);
    expect(resumed.endTick).toBe(fromLoad);
    expect(fromLoad!).toBeGreaterThan(first!);
  }, 300_000);
});
