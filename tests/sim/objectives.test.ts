/**
 * P4.4 objective engine (src/sim/objectives.ts; SPEC §13.5; CT §10.5; D-0071).
 *
 * - each of the five predicate types completes, waits and (where it can) ends on small worlds; the gate
 *   type through a fake GateReading;
 * - the three shipped goals on FIRST_DISH_V1 (seed 104729) complete at the tick their evidence appears;
 * - blocked or cancelled division proposals never count as births: crowding (no room), the agent cap,
 *   and a parent holding a drawn proposal removed before it commits leave the goal running; the first
 *   committed birth completes it at that tick;
 * - the starch goal needs converted carbon (a producer secreting enzyme with no starch never completes);
 * - keepSpeciesAlive ends at the first zero tick and a later Add Life does not revive it;
 * - save → load at awkward ticks completes at the same tick as an uninterrupted run;
 * - integrate (objectives-minors item 3): for every event type the validator accepts, a save → load
 *   between a command and the next tick completes at the same tick as an uninterrupted run (event-ring
 *   goals resume from the saved lastEventId); a saved position the dish never reached is refused;
 * - evaluation is read-only: equal stateHash and full trajectory digest with and without armed watches;
 * - nothing in src/sim except the content validator imports the engine.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_CAP, CELL_SOFT_CAPACITY } from '../../src/sim/constants';
import { applyNow, introduceOrganism } from '../../src/sim/commands';
import { cellIndex, maskCells } from '../../src/sim/grid';
import { killEntity } from '../../src/sim/maintenance';
import { quarterOf } from '../../src/sim/history';
import {
  OBJECTIVE_EVENTS,
  ObjectiveError,
  ObjectiveWatch,
  objectiveSupportProblem,
  regionMean,
  typedPredicate,
  type GateReading,
  type ObjectivePredicate,
  type ObjectiveProgress,
} from '../../src/sim/objectives';
import { R } from '../../src/sim/reasons';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { rebuildIndex } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import { FLAG } from '../../src/sim/entities';
import { speciesIndex, type World } from '../../src/sim/world';
import { trajectoryDigest } from '../helpers/trajectory';
import { aliveOf, clearWater, fillField, place, preOrganismFlipRegistry, registry, setField } from '../helpers/world';

const REG = registry();
const pred = (type: ObjectivePredicate['type'], params: Record<string, unknown>, durationSeconds?: number): ObjectivePredicate =>
  ({ type, params, ...(durationSeconds !== undefined ? { durationSeconds } : {}) });
const SPLIT = REG.objectives.SEE_SPRINTER_SPLIT!.predicate;
const KEEP = REG.objectives.KEEP_SPRINTERS_GOING!.predicate;
const STARCH = REG.objectives.WATCH_STARCH_BECOME_FOOD!.predicate;

/** Step `world` once and evaluate every watch (as the worker's runner does after each step). */
function tickAll(world: World, watches: readonly ObjectiveWatch[]): void {
  step(world);
  for (const w of watches) w.afterTick(world);
}

/** Step until `watch` settles or `limit` ticks pass; returns the tick it settled at (null: still running). */
function runUntil(world: World, watch: ObjectiveWatch, limit: number): number | null {
  for (let k = 0; k < limit && watch.state === 'running'; k++) tickAll(world, [watch]);
  return watch.state === 'running' ? null : watch.endTick;
}

function garden(): World {
  return realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: 'goals' });
}

/** A B01 ready to divide (B ≥ 2·b0, energy, health and age above the gates). */
const READY = { B: 2.2, E: 100, H: 100, age: 20 } as const;

describe('predicate shapes', () => {
  it('types the five named predicates and refuses custom, unknown names and bad numbers', () => {
    expect(typedPredicate(SPLIT)).toEqual({ type: 'observeEvent', event: 'birth', species: 'B01', enzyme: null });
    expect(typedPredicate(KEEP)).toEqual({ type: 'keepSpeciesAlive', species: 'B01', durationSeconds: 180 });
    expect(typedPredicate(STARCH)).toEqual({ type: 'observeEvent', event: 'conversion', species: null, enzyme: 'starch' });
    const bad: [ObjectivePredicate, RegExp][] = [
      [pred('custom', { all: [] }), /five named predicate types/],
      [pred('observeEvent', { event: 'hatch' }), /unknown event type/],
      [pred('observeEvent', { event: 'conversion', enzyme: 'cellulose' }), /unknown enzyme/],
      [pred('observeEvent', { event: 'conversion', enzyme: 'starch', species: 'B06' }), /no producer/],
      [pred('keepSpeciesAlive', { species: 'B01' }), /durationSeconds/],
      [pred('keepSpeciesAlive', { species: 'B01' }, 0), /durationSeconds/],
      [pred('keepSpeciesAlive', { species: 'B01' }, Infinity), /durationSeconds/],
      [pred('biomassThreshold', { threshold: -1 }), /threshold/],
      [pred('biomassThreshold', { threshold: Number.NaN }), /threshold/],
      [pred('fieldInRange', { field: 'sugarz', min: 0, max: 1 }, 5), /unknown field/],
      [pred('fieldInRange', { field: 'sugar', region: 'middle', min: 0, max: 1 }, 5), /unknown region/],
      [pred('fieldInRange', { field: 'sugar', min: 2, max: 1 }, 5), /range/],
      [pred('observeEvent', { event: 'birth', speciez: 'B01' }), /no parameter "speciez"/],
      [pred('biomassThreshold', { threshold: 1 }, 5), /takes no durationSeconds/],
    ];
    for (const [p, re] of bad) {
      const t = typedPredicate(p);
      expect('path' in t ? t.message : 'accepted', JSON.stringify(p)).toMatch(re);
    }
  });

  it('a world must have what the predicate names (its own recorded manifest)', () => {
    const w = clearWater({}, preOrganismFlipRegistry()); // no B10 (the shipped dish records it since the organism flip, D-0127)
    expect(objectiveSupportProblem(w, SPLIT)).toBeNull();
    expect(objectiveSupportProblem(w, STARCH)).toBeNull();
    expect(objectiveSupportProblem(w, pred('keepSpeciesAlive', { species: 'B10' }, 5))).toMatch(/no B10/);
    expect(() => new ObjectiveWatch(pred('keepSpeciesAlive', { species: 'B10' }, 5), w)).toThrow(ObjectiveError);
  });
});

describe('keepSpeciesAlive', () => {
  it('waits while one lives, completes after the duration from Start', () => {
    const w = clearWater();
    place(w, 'B01', 40.5, 40.5, { E: 100, H: 100 });
    for (let k = 0; k < 7; k++) step(w); // Start at an odd tick
    const start = w.tick;
    const watch = new ObjectiveWatch(pred('keepSpeciesAlive', { species: 'B01' }, 2), w);
    expect(watch.progress()).toEqual({ startTick: start, holdSinceTick: start, state: 'running' });
    for (let k = 0; k < 19; k++) tickAll(w, [watch]);
    expect(watch.state).toBe('running');
    tickAll(w, [watch]);
    expect(watch.state).toBe('completed');
    expect(watch.endTick).toBe(start + 20);
  });

  it('ends at the first tick with none alive (latched): a later Add Life does not revive it', () => {
    const w = clearWater();
    const a = place(w, 'B01', 40.5, 40.5, { E: 100, H: 100 });
    const b = place(w, 'B01', 60.5, 60.5, { E: 100, H: 100 });
    const watch = new ObjectiveWatch(pred('keepSpeciesAlive', { species: 'B01' }, 30), w);
    tickAll(w, [watch]);
    killEntity(w, a, R.DEATH_STARVATION);
    tickAll(w, [watch]);
    expect(watch.state).toBe('running'); // one remains
    killEntity(w, b, R.DEATH_STARVATION);
    // A command between ticks is seen at the next tick, never as a tick of its own.
    expect(watch.afterTick(w)).toBe(false);
    const zeroTick = w.tick + 1;
    tickAll(w, [watch]);
    expect(watch.state).toBe('ended');
    expect(watch.endTick).toBe(zeroTick);
    applyNow(w, 'addlife', { kind: 'inoculate', speciesId: 'B01', x: 50, y: 50, radius: 2, count: 3 });
    for (let k = 0; k < 20; k++) tickAll(w, [watch]);
    expect(aliveOf(w, 'B01').length).toBeGreaterThan(0);
    expect(watch.state).toBe('ended');
    expect(watch.endTick).toBe(zeroTick);
  });

  it('a Start with none alive ends at once', () => {
    const w = clearWater();
    const watch = new ObjectiveWatch(pred('keepSpeciesAlive', { species: 'B01' }, 5), w);
    expect(watch.state).toBe('ended');
    expect(watch.endTick).toBe(w.tick);
  });
});

describe('biomassThreshold', () => {
  it('waits below the threshold and completes on the first tick at or above it (species, and all biomass)', () => {
    const w = clearWater();
    place(w, 'B01', 40.5, 40.5, { B: 1, E: 100, H: 100 });
    const total = aliveOf(w).reduce((s, i) => s + w.ents.cols.B[i]!, 0);
    const sp = new ObjectiveWatch(pred('biomassThreshold', { species: 'B01', threshold: total + 1.5 }), w);
    const all = new ObjectiveWatch(pred('biomassThreshold', { threshold: total + 1.5 }), w);
    const a01 = new ObjectiveWatch(pred('biomassThreshold', { species: 'A01', threshold: 0.5 }), w);
    for (let k = 0; k < 5; k++) tickAll(w, [sp, all, a01]);
    expect([sp.state, all.state, a01.state]).toEqual(['running', 'running', 'running']);
    place(w, 'B01', 60.5, 60.5, { B: 2, E: 100, H: 100 });
    tickAll(w, [sp, all, a01]);
    expect([sp.state, all.state]).toEqual(['completed', 'completed']);
    expect(sp.endTick).toBe(w.tick);
    expect(sp.value).toBeGreaterThanOrEqual(total + 1.5);
    expect(a01.state).toBe('running'); // another species' biomass does not count
  });
});

describe('transferAcrossGate (no gate structure in this build: a fake reader)', () => {
  class FakeGate implements GateReading {
    moved = 4;
    present = true;
    transferred(_w: World, gate: string, field: string): number | null {
      return this.present && gate === 'S02' && field === 'sugar' ? this.moved : null;
    }
  }
  const P = pred('transferAcrossGate', { gate: 'S02', field: 'sugar', threshold: 1 });

  it('counts the quantity moved since Start; a world without the gate is not supported', () => {
    const w = clearWater();
    expect(objectiveSupportProblem(w, P)).toMatch(/no such gate/);
    const gate = new FakeGate();
    gate.present = false;
    expect(objectiveSupportProblem(w, P, gate)).toMatch(/no such gate/);
    expect(() => new ObjectiveWatch(P, w, null, gate)).toThrow(ObjectiveError);
    gate.present = true;
    const watch = new ObjectiveWatch(P, w, null, gate);
    gate.moved = 4.6;
    tickAll(w, [watch]);
    expect(watch.state).toBe('running'); // 0.6 since Start; the 4 before Start do not count
    gate.moved = 5;
    tickAll(w, [watch]);
    expect(watch.state).toBe('completed');
    expect(watch.value).toBeCloseTo(1, 12);
  });
});

describe('observeEvent through the event ring', () => {
  it('a matching record after Start completes it; one before Start or of another species does not', () => {
    const w = clearWater();
    place(w, 'B01', 40.5, 40.5, { E: 100, H: 100 }); // an 'introduce' record before Start
    const watch = new ObjectiveWatch(pred('observeEvent', { event: 'introduce', species: 'B01' }), w);
    tickAll(w, [watch]);
    applyNow(w, 'a01', { kind: 'inoculate', speciesId: 'A01', x: 60, y: 60, radius: 1, count: 1 });
    tickAll(w, [watch]);
    expect(watch.state).toBe('running');
    applyNow(w, 'b01', { kind: 'inoculate', speciesId: 'B01', x: 70, y: 60, radius: 1, count: 1 });
    expect(watch.state).toBe('running'); // seen at the next tick
    tickAll(w, [watch]);
    expect(watch.state).toBe('completed');
    expect(watch.endTick).toBe(w.tick);
  });
});

describe('fieldInRange', () => {
  it('holds while the region mean stays in range; leaving resets the hold without ending; completes after a full hold', () => {
    const w = clearWater();
    fillField(w, 'nutrient', 0.3);
    const p = pred('fieldInRange', { field: 'nutrient', min: 0.25, max: 0.35 }, 3);
    const watch = new ObjectiveWatch(p, w);
    const start = w.tick;
    expect(watch.progress().holdSinceTick).toBe(start);
    for (let k = 0; k < 10; k++) tickAll(w, [watch]);
    fillField(w, 'nutrient', 0.5); // out of range
    tickAll(w, [watch]);
    expect(watch.state).toBe('running');
    expect(watch.progress().holdSinceTick).toBeNull();
    tickAll(w, [watch]);
    fillField(w, 'nutrient', 0.3);
    tickAll(w, [watch]);
    const back = w.tick;
    expect(watch.progress().holdSinceTick).toBe(back);
    expect(runUntil(w, watch, 100)).toBe(back + 30);
    expect(watch.state).toBe('completed');
  });

  it('a quarter is the mean over its own playable cells (quarterOf)', () => {
    const w = clearWater();
    fillField(w, 'nutrient', 0);
    let n = 0;
    for (const cell of maskCells()) {
      if (quarterOf(cell % 128, Math.floor(cell / 128)) !== 2) continue;
      setField(w, 'nutrient', cell, 0.8);
      n++;
    }
    expect(n).toBeGreaterThan(0);
    expect(regionMean(w, 'nutrient', 'topRight')).toBeCloseTo(0.8, 12);
    expect(regionMean(w, 'nutrient', 'topLeft')).toBe(0);
    const watch = new ObjectiveWatch(pred('fieldInRange', { field: 'nutrient', region: 'topRight', min: 0.7, max: 0.9 }, 1), w);
    expect(watch.progress().holdSinceTick).toBe(w.tick);
  });
});

describe('the three goals on FIRST_DISH_V1 (seed 104729)', () => {
  it('each completes at the tick its evidence first appears', () => {
    const w = garden();
    expect(w.seed).toBe(104729);
    const split = new ObjectiveWatch(SPLIT, w);
    const keep = new ObjectiveWatch(KEEP, w);
    const starch = new ObjectiveWatch(STARCH, w);
    let firstStarch: number | null = null;
    for (let k = 0; k < 1800; k++) {
      tickAll(w, [split, keep, starch]);
      if (firstStarch === null && w.conversionTotals.starch > 0) firstStarch = w.tick;
    }
    // The first committed B01 division happens while tick m runs (its birth event's tick); the dish shows it at m + 1.
    const m = w.events.milestones['firstDivision:B01']!;
    expect(m).toBeGreaterThan(0);
    expect([split.state, split.endTick]).toEqual(['completed', m + 1]);
    expect([starch.state, starch.endTick]).toEqual(['completed', firstStarch]);
    expect([keep.state, keep.endTick]).toEqual(['completed', 1800]);
    // Recorded for the report (seed 104729): split 351, starch 2, keep 1800.
    console.log(`FIRST_DISH_V1 goals: split ${split.endTick}, starch ${starch.endTick}, keep ${keep.endTick}`);
  }, 60_000);
});

describe('blocked or cancelled proposals never count as births', () => {
  it('crowding (no room) and a drawn proposal removed before it commits: births stay 0; the first committed birth completes it', () => {
    const w = clearWater();
    const cx = 40;
    const cy = 40;
    // Five ready Sprinters in one cell (load 11 > CELL_SOFT_CAPACITY), walled in by stone so none swims away.
    const slots = Array.from({ length: 5 }, (_, k) => place(w, 'B01', cx + 0.2 + k * 0.15, cy + 0.5, READY));
    expect(5 * READY.B).toBeGreaterThan(CELL_SOFT_CAPACITY);
    const ring: [number, number][] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx !== 0 || dy !== 0) ring.push([cx + dx + 0.5, cy + dy + 0.5]);
    applyNow(w, 'stones', { kind: 'placeStructure', structure: 'stone', points: ring, radius: 1 });
    for (const [x, y] of ring) expect(w.grid.structure[cellIndex(Math.floor(x), Math.floor(y))], `${x},${y}`).not.toBe(0);
    expect(w.grid.structure[cellIndex(cx, cy)]).toBe(0);
    const watch = new ObjectiveWatch(SPLIT, w);
    const c = w.ents.cols;
    for (let k = 0; k < 15; k++) tickAll(w, [watch]);
    // Every parent drew its proposal and is blocked by crowding; nothing committed.
    for (const i of slots) {
      expect(c.alive[i]).toBe(1);
      expect(c.propG0[i]).toBeGreaterThanOrEqual(0);
      expect(c.divBlockCode[i]).toBe(R.DIV_BLOCK_CROWDING);
    }
    expect(w.history.pendingBirths[speciesIndex(w, 'B01')]).toBe(0);
    expect(watch.state).toBe('running');
    // A parent holding a drawn proposal is removed before it commits: still no birth.
    killEntity(w, slots[0]!, R.DEATH_STARVATION);
    tickAll(w, [watch]);
    expect(watch.state).toBe('running');
    expect(w.events.milestones['firstDivision:B01']).toBeUndefined();
    // Room again (load 6.6 ≤ 8): the next tick commits, and the goal completes on that tick.
    killEntity(w, slots[1]!, R.DEATH_STARVATION);
    const before = w.tick;
    tickAll(w, [watch]);
    const m = w.events.milestones['firstDivision:B01'];
    expect(m).toBe(before);
    expect(watch.state).toBe('completed');
    expect(watch.endTick).toBe(before + 1);
  });

  it('the agent cap: a capacity-blocked Sprinter never counts; it completes when a slot frees and the division commits', () => {
    const w = clearWater();
    const ready = place(w, 'B01', 40.5, 40.5, READY);
    // Fill the dish to the agent cap with Sunbeads (not ready to divide), one per cell away from the Sprinter.
    const a01 = speciesIndex(w, 'A01');
    let filler = -1;
    for (const cell of maskCells()) {
      if (w.ents.count >= AGENT_CAP) break;
      const x = cell % 128;
      const y = Math.floor(cell / 128);
      if (Math.abs(x - 40) < 3 && Math.abs(y - 40) < 3) continue;
      const s = introduceOrganism(w, a01, cell, 'test', { exactCenter: true });
      if (s >= 0) filler = s;
    }
    rebuildIndex(w);
    expect(w.ents.count).toBe(AGENT_CAP);
    const watch = new ObjectiveWatch(SPLIT, w);
    tickAll(w, [watch]);
    const c = w.ents.cols;
    expect(c.alive[ready]).toBe(1);
    expect(c.flags[ready]! & FLAG.capacityBlocked).not.toBe(0);
    expect(c.divBlockCode[ready]).toBe(R.DIV_BLOCK_CAPACITY);
    expect(watch.state).toBe('running');
    expect(w.ents.count).toBe(AGENT_CAP); // nothing died this tick (the cap still holds)
    killEntity(w, filler, R.DEATH_STARVATION);
    const before = w.tick;
    tickAll(w, [watch]);
    expect(w.events.milestones['firstDivision:B01']).toBe(before);
    expect(watch.state).toBe('completed');
    expect(watch.endTick).toBe(before + 1);
  }, 60_000);
});

describe('starch goal: converted carbon, not enzyme presence', () => {
  it('a Crumbsmith secreting enzyme with no starch never completes; with starch it does', () => {
    const noStarch = clearWater();
    fillField(noStarch, 'starch', 0);
    for (let k = 0; k < 9; k++) place(noStarch, 'B06', 60.5 + (k % 3), 60.5 + Math.floor(k / 3), { E: 100, H: 100 });
    // Enzyme present in the water around them (a producer only secretes beside its substrate, so it is set here).
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setField(noStarch, 'eStarch', cellIndex(61 + dx, 61 + dy), 0.5);
    const w1 = new ObjectiveWatch(STARCH, noStarch);
    expect(noStarch.fields.eStarch!.reduce((s, v) => s + v, 0)).toBeGreaterThan(0); // the enzyme is there
    for (let k = 0; k < 300; k++) tickAll(noStarch, [w1]);
    expect(noStarch.conversionTotals.starch).toBe(0);
    expect(w1.state).toBe('running');

    const withStarch = clearWater();
    fillField(withStarch, 'starch', 0);
    for (let k = 0; k < 9; k++) place(withStarch, 'B06', 60.5 + (k % 3), 60.5 + Math.floor(k / 3), { E: 100, H: 100 });
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setField(withStarch, 'starch', cellIndex(61 + dx, 61 + dy), 0.5);
    const w2 = new ObjectiveWatch(STARCH, withStarch);
    const at = runUntil(withStarch, w2, 300);
    expect(w2.state).toBe('completed');
    expect(at).not.toBeNull();
    expect(w2.value).toBeGreaterThan(0);
  }, 60_000);
});

describe('save → load at awkward ticks', () => {
  /** Serialize the world and the progress, as the worker saves them (the notebook beside the state). */
  function reload(world: World, watch: ObjectiveWatch): { world: World; watch: ObjectiveWatch } {
    const state = JSON.parse(JSON.stringify(serializeWorld(world)));
    const progress = JSON.parse(JSON.stringify(watch.progress())) as ObjectiveProgress;
    const w = deserializeWorld(state);
    return { world: w, watch: new ObjectiveWatch(watch.predicate.type === 'keepSpeciesAlive' ? KEEP : watch.predicate.type === 'observeEvent' && watch.predicate.event === 'birth' ? SPLIT : STARCH, w, progress) };
  }

  it('paused mid-second, right after a commit: each goal completes at the same tick as an uninterrupted run', () => {
    const ref = garden();
    const refWatches = [new ObjectiveWatch(SPLIT, ref), new ObjectiveWatch(KEEP, ref), new ObjectiveWatch(STARCH, ref)];
    for (let k = 0; k < 1800; k++) tickAll(ref, refWatches);
    const want = refWatches.map((x) => x.endTick);
    expect(refWatches.map((x) => x.state)).toEqual(['completed', 'completed', 'completed']);
    const split = want[0]!;

    // Split goal: save at the tick just before the commit shows (mid-second), reload, continue.
    for (const saveAt of [split - 2, split - 4]) {
      let w = garden();
      let watch = new ObjectiveWatch(SPLIT, w);
      while (w.tick < saveAt) tickAll(w, [watch]);
      expect(w.tick % 10).not.toBe(0);
      ({ world: w, watch } = reload(w, watch));
      expect(runUntil(w, watch, 2000)).toBe(split);
    }
    // Keep goal: save right after the first committed division (mid-second), reload, continue to 180 s.
    {
      let w = garden();
      let watch = new ObjectiveWatch(KEEP, w);
      while (w.tick < split) tickAll(w, [watch]);
      expect(w.events.milestones['firstDivision:B01']).toBe(split - 1);
      expect(w.tick % 10).not.toBe(0);
      ({ world: w, watch } = reload(w, watch));
      expect(watch.progress().holdSinceTick).toBe(0);
      expect(runUntil(w, watch, 2000)).toBe(want[1]);
    }
    // Starch goal: save at tick 1, before the first conversion.
    {
      let w = garden();
      let watch = new ObjectiveWatch(STARCH, w);
      tickAll(w, [watch]);
      expect(watch.state).toBe('running');
      ({ world: w, watch } = reload(w, watch));
      expect(runUntil(w, watch, 2000)).toBe(want[2]);
    }
  }, 120_000);
});

describe('save → load between a command and the next tick, every event type (objectives-minors item 3)', () => {
  // Every observeEvent type the validator accepts, for any species and for B01, plus the starch conversion goal.
  const PREDS: ObjectivePredicate[] = OBJECTIVE_EVENTS.flatMap((event) =>
    event === 'conversion'
      ? [pred('observeEvent', { event, enzyme: 'starch' })]
      : [pred('observeEvent', { event }), pred('observeEvent', { event, species: 'B01' })],
  );
  const label = (p: ObjectivePredicate) => `${p.params.event as string}${typeof p.params.species === 'string' ? `:${p.params.species}` : ''}`;
  // Commands the player gives between ticks: each adds event-ring records ('command'; 'introduce' too).
  const COMMANDS = [
    { at: 13, id: 'sugar', payload: { kind: 'deposit', materialId: 'SUGAR', points: [[40, 70]], radius: 2, dose: 0.5 } },
    { at: 27, id: 'b01', payload: { kind: 'inoculate', speciesId: 'B01', x: 50, y: 50, radius: 2, count: 3 } },
  ] as const;
  const HORIZON = 400;

  /**
   * FIRST_DISH_V1 with one watch per predicate to HORIZON. A command is applied right after the step that
   * reaches its tick, and the watches are called again as the host calls them after an accepted command.
   * `saveAfter`: right after that command, the world and every running watch's progress go through JSON
   * (as the worker saves them) and the run continues on the loaded copy.
   */
  function run(saveAfter: number | null): { ends: (number | null)[]; saved: ObjectiveProgress[] } {
    let w = garden();
    let watches = PREDS.map((p) => new ObjectiveWatch(p, w));
    let saved: ObjectiveProgress[] = [];
    while (w.tick < HORIZON) {
      tickAll(w, watches);
      for (const c of COMMANDS) {
        if (w.tick !== c.at) continue;
        const before = w.counters.nextEventId;
        applyNow(w, c.id, c.payload);
        expect(w.counters.nextEventId).toBeGreaterThan(before); // the command added records
        for (const x of watches) expect(x.afterTick(w)).toBe(false); // same tick: seen at the next one
        if (saveAfter !== c.at) continue;
        const state = JSON.parse(JSON.stringify(serializeWorld(w)));
        saved = JSON.parse(JSON.stringify(watches.map((x) => x.progress()))) as ObjectiveProgress[];
        w = deserializeWorld(state);
        const loaded = w;
        watches = watches.map((x, k) => (x.state === 'running' ? new ObjectiveWatch(PREDS[k]!, loaded, saved[k]) : x));
      }
    }
    return { ends: watches.map((x) => x.endTick), saved };
  }

  it('each goal completes at the same tick as an uninterrupted run', () => {
    const ref = run(null).ends;
    const at = (name: string) => ref[PREDS.findIndex((p) => label(p) === name)];
    // Not vacuous: the command-fed goals complete at the tick after their command; births and other records follow.
    expect(at('command')).toBe(14);
    expect(at('introduce:B01')).toBe(28);
    expect(at('birth:B01')).toBeGreaterThan(28);
    expect(ref.filter((t) => t !== null).length).toBeGreaterThan(6);
    for (const c of COMMANDS) {
      const { ends, saved } = run(c.at);
      // The event-ring goals saved the last record they had seen (before the command's records).
      for (const [k, p] of PREDS.entries()) {
        const ring = p.params.event !== 'birth' && p.params.event !== 'conversion';
        expect(saved[k]!.lastEventId !== undefined, label(p)).toBe(ring);
      }
      expect(Object.fromEntries(PREDS.map((p, k) => [label(p), ends[k]]))).toEqual(Object.fromEntries(PREDS.map((p, k) => [label(p), ref[k]])));
    }
  }, 240_000);

  it('a saved event position the dish never reached is refused; only event-ring goals carry one', () => {
    const w = garden();
    for (let k = 0; k < 5; k++) step(w);
    const ringGoal = pred('observeEvent', { event: 'command' });
    const p = new ObjectiveWatch(ringGoal, w).progress();
    expect(p.lastEventId).toBe(w.counters.nextEventId - 1);
    expect(new ObjectiveWatch(SPLIT, w).progress().lastEventId).toBeUndefined();
    expect(new ObjectiveWatch(KEEP, w).progress().lastEventId).toBeUndefined();
    expect(() => new ObjectiveWatch(ringGoal, w, { ...p, lastEventId: w.counters.nextEventId })).toThrow(ObjectiveError);
    expect(() => new ObjectiveWatch(ringGoal, w, { ...p, lastEventId: -1 })).toThrow(ObjectiveError);
    expect(() => new ObjectiveWatch(ringGoal, w, { ...p, lastEventId: 1.5 })).toThrow(ObjectiveError);
    // A wave 5b record (no lastEventId) still resumes, from the load moment.
    const { lastEventId: _l, ...old } = p;
    expect(new ObjectiveWatch(ringGoal, w, old).progress().lastEventId).toBe(w.counters.nextEventId - 1);
  });
});

describe('evaluation is read-only', () => {
  it('3,000 ticks of FIRST_DISH_V1 with every predicate type armed: equal stateHash and full trajectory digest', () => {
    const plain = garden();
    for (let k = 0; k < 3000; k++) step(plain);
    const watched = garden();
    const gate: GateReading = { transferred: () => 0 };
    const watches = [
      new ObjectiveWatch(SPLIT, watched),
      new ObjectiveWatch(KEEP, watched),
      new ObjectiveWatch(STARCH, watched),
      new ObjectiveWatch(pred('biomassThreshold', { threshold: 1e9 }), watched),
      new ObjectiveWatch(pred('fieldInRange', { field: 'oxygen', region: 'bottomLeft', min: 0, max: 0.0001 }, 1000), watched),
      new ObjectiveWatch(pred('observeEvent', { event: 'branchEstablished' }), watched),
      new ObjectiveWatch(pred('transferAcrossGate', { gate: 'S02', field: 'sugar', threshold: 1 }), watched, null, gate),
    ];
    let evaluated = 0;
    for (let k = 0; k < 3000; k++) {
      step(watched);
      for (const x of watches) {
        x.afterTick(watched);
        evaluated++;
      }
    }
    expect(evaluated).toBe(21_000);
    expect(watches.slice(0, 3).map((x) => x.state)).toEqual(['completed', 'completed', 'completed']);
    expect(stateHash(watched)).toBe(stateHash(plain));
    expect(trajectoryDigest(watched, 'full')).toBe(trajectoryDigest(plain, 'full'));
  }, 120_000);
});

describe('where the engine lives', () => {
  it('no src/sim file except src/sim/content/** imports src/sim/objectives.ts', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk('src/sim');
    const importers = files.filter((f) => f !== join('src/sim', 'objectives.ts') && /from\s+['"](\.\.?\/)+(sim\/)?objectives['"]|@sim\/objectives/.test(readFileSync(f, 'utf8')));
    expect(importers.length).toBeGreaterThan(0); // the validator does
    expect(importers.filter((f) => !f.startsWith(join('src/sim', 'content')))).toEqual([]);
  });
});
