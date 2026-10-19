/**
 * P5.6 part 3: the objective engine's Phase 5 parameters and the seven play prompts (src/sim/objectives.ts;
 * CT §10.6; D02 §23; SPEC §13.5; D-0106 "extend the five predicates with parameters; no new types"; D-0131).
 *
 * - each new parameter's typed form and every refusal (an unknown parameter, a region the dish does not record,
 *   minSpecies with species, a cycle window on a fixed-light dish, atLeast on a ring event, and more);
 * - each prompt TRUE on a measured world (a shipped dish, with the player's own gestures where the prompt asks
 *   for counterplay, run headless until it completes: the completion tick and value pinned) and FALSE on a
 *   measured world that cannot satisfy it. NIGHT_GARDEN: no shipped dish glows (E205's measured limiting
 *   factor: Lanterns in water never sense the 0.30 on-threshold), so its TRUE and FALSE worlds hold the sensed
 *   signal with a test hook as tests/fixtures/signal-glow.test.ts does, and the H08 community run is the
 *   measured limiting factor;
 * - RECOVER_A_NEIGHBORHOOD's fromBelow refusal and its completion after one Add Life;
 * - a resumed watch (save → load of the world and the progress) completes at the same tick as an
 *   uninterrupted run, with its saved clauses, amounts and cycle; without them it does not (mutant check);
 * - the v1.0 goals evaluate exactly as before on FIRST_DISH_V1 (split 351, starch 2, keep 1800);
 * - OBJECTIVE_EVENTS is every EventType plus the measured pseudo-events.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyNow, type CommandPayload } from '../../src/sim/commands';
import {
  OBJECTIVE_EVENTS,
  OBJECTIVE_MEASURED_EVENTS,
  OBJECTIVE_RING_EVENTS,
  ObjectiveError,
  ObjectiveStartRefusal,
  ObjectiveWatch,
  objectiveStartProblem,
  objectiveSupportProblem,
  progressKeysOf,
  typedPredicate,
  type ObjectivePredicate,
  type ObjectiveProgress,
} from '../../src/sim/objectives';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { entityCell } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import { markField } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { habitatRegistry, habitatStart } from '../helpers/habitats';
import { trajectoryDigest } from '../helpers/trajectory';

const REG = habitatRegistry();
const P = (id: string): ObjectivePredicate => REG.objectives[id]!.predicate;
const pred = (type: ObjectivePredicate['type'], params: Record<string, unknown>, durationSeconds?: number): ObjectivePredicate => ({ type, params, ...(durationSeconds !== undefined ? { durationSeconds } : {}) });

type Hook = (stage: number, w: World) => void;
interface Cmd {
  readonly at: number;
  readonly payload: CommandPayload;
}

/**
 * Step `w` until `watch` settles or the dish reaches `limit`, with the watch's stage hook (and `extra`, a test
 * hook) in every step; a command is applied right after the step that reaches its tick and the watch is called
 * again as the host calls it after an accepted command. Returns the watch.
 */
function runWatch(w: World, watch: ObjectiveWatch, limit: number, cmds: readonly Cmd[] = [], extra: Hook | null = null): ObjectiveWatch {
  const hook: Hook = extra ? (s, x) => (watch.hook(s, x), extra(s, x)) : watch.hook;
  while (watch.state === 'running' && w.tick < limit) {
    step(w, { afterStage: hook });
    watch.afterTick(w);
    for (const c of cmds)
      if (c.at === w.tick) {
        const r = applyNow(w, `cmd-${c.at}-${c.payload.kind}`, c.payload);
        expect(r.result?.accepted, `${c.payload.kind} at ${c.at}`).toBeGreaterThan(0);
        expect(watch.afterTick(w)).toBe(false); // same tick: seen at the next one
      }
  }
  return watch;
}

/** Apply `cmds` at tick 0 (before Start), as a player's gestures on a paused new dish. */
function atStart(w: World, cmds: readonly CommandPayload[]): World {
  for (const [k, p] of cmds.entries()) expect(applyNow(w, `start-${k}`, p).result?.accepted).toBeGreaterThan(0);
  return w;
}

const inoculate = (speciesId: string, x: number, y: number, count: number, radius = 6): CommandPayload => ({ kind: 'inoculate', speciesId, x, y, radius, count });
/** One Feed stroke of sugar across a pool (radius 6, the deposit maximum). */
const sugarStroke = (cx: number): CommandPayload => ({ kind: 'deposit', materialId: 'SUGAR', points: [[cx - 8, 64], [cx, 56], [cx + 8, 64], [cx, 72], [cx, 64]], radius: 6, dose: 0.5 });

/** The NIGHT_GARDEN fixture hook: S_GLOW held at 0.31 in every living Lantern's cell before stage 8 while `on(tick)`. */
function holdGlow(on: (tick: number) => boolean): Hook {
  return (stage, w) => {
    if (stage !== 7 || !on(w.tick)) return;
    const sp = w.species.findIndex((s) => s.id === 'B09');
    const c = w.ents.cols;
    for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && c.species[i] === sp) w.fields.sGlow![entityCell(c.x[i]!, c.y[i]!)] = 0.31;
    markField(w, 'sGlow');
  };
}

describe('OBJECTIVE_EVENTS', () => {
  it('is every EventType (src/sim/events.ts) plus the measured pseudo-events', () => {
    const src = readFileSync(join(__dirname, '../../src/sim/events.ts'), 'utf8');
    const union = src.slice(src.indexOf('export type EventType ='), src.indexOf('export interface SimEvent'));
    const types = [...union.matchAll(/^\s*\|\s*'([A-Za-z]+)'/gm)].map((m) => m[1]!);
    expect([...OBJECTIVE_RING_EVENTS].sort()).toEqual([...types].sort());
    expect([...OBJECTIVE_EVENTS]).toEqual([...OBJECTIVE_RING_EVENTS, ...OBJECTIVE_MEASURED_EVENTS]);
    expect(OBJECTIVE_MEASURED_EVENTS).toEqual(['intake', 'consumption', 'transfer']);
  });
});

describe('typed forms of the new parameters', () => {
  it('types each prompt (every addition optional: the v1.0 shapes are unchanged)', () => {
    expect(typedPredicate(P('TWO_NEIGHBORHOODS'))).toEqual({ type: 'keepSpeciesAlive', species: null, durationSeconds: 180, speciesList: ['B01', 'B10'], regions: ['FRESH_POOL', 'BRINE_POOL'], minCount: 6 });
    expect(typedPredicate(P('LEAVE_A_REFUGE'))).toEqual({ type: 'keepSpeciesAlive', species: null, durationSeconds: 180, speciesList: ['P08', 'F02'] });
    expect(typedPredicate(P('SUSTAIN_THREE_SPECIES'))).toEqual({ type: 'keepSpeciesAlive', species: null, durationSeconds: 180, minSpecies: 3 });
    expect(typedPredicate(P('RECOVER_A_NEIGHBORHOOD'))).toEqual({ type: 'biomassThreshold', species: null, threshold: 20, measure: 'activeCount', fromBelow: 5 });
    const clause = (event: string, more: Record<string, unknown> = {}) => ({ event, species: null, enzyme: null, pool: null, route: null, atLeast: null, ...more });
    expect(typedPredicate(P('NIGHT_GARDEN'))).toEqual({ type: 'observeEvent', event: null, species: null, enzyme: null, window: 'cycle', all: [clause('glowOn', { species: 'B09' }), clause('intake', { species: 'A01' })] });
    expect(typedPredicate(P('FOOD_RELAY'))).toEqual({
      type: 'observeEvent',
      event: null,
      species: null,
      enzyme: null,
      all: [clause('conversion', { enzyme: 'starch' }), clause('consumption', { pool: 'sugar' }), clause('death'), clause('consumption', { pool: 'detritus' })],
    });
    expect(typedPredicate(P('LIVING_BRIDGE'))).toEqual({ type: 'observeEvent', event: null, species: null, enzyme: null, endOn: ['linkBroken', 'externalInput'], all: [clause('transfer', { route: 'fungal', atLeast: 0.5 })] });
    // A single measured event and the region forms.
    expect(typedPredicate(pred('observeEvent', { event: 'intake', species: 'A01', atLeast: 2 }))).toEqual({ type: 'observeEvent', event: 'intake', species: 'A01', enzyme: null, atLeast: 2 });
    expect(typedPredicate(pred('keepSpeciesAlive', { species: 'B01', region: 'topLeft', minCount: 3 }, 30))).toEqual({ type: 'keepSpeciesAlive', species: 'B01', durationSeconds: 30, region: 'topLeft', minCount: 3 });
    expect(typedPredicate(pred('biomassThreshold', { measure: 'count', region: 'MESH', threshold: 4 }))).toEqual({ type: 'biomassThreshold', species: null, threshold: 4, measure: 'count', region: 'MESH' });
    // Progress keys: only the goals that use them.
    const keys = (id: string) => progressKeysOf(typedPredicate(P(id)) as never);
    expect(keys('NIGHT_GARDEN')).toEqual({ clauses: 2, amounts: 2, cycle: true, inputs: false });
    expect(keys('FOOD_RELAY')).toEqual({ clauses: 4, amounts: 4, cycle: false, inputs: false });
    // Fix round 1: a goal ending on 'externalInput' saves its input base.
    expect(keys('LIVING_BRIDGE')).toEqual({ clauses: 1, amounts: 1, cycle: false, inputs: true });
    expect(keys('TWO_NEIGHBORHOODS')).toEqual({ clauses: null, amounts: null, cycle: false, inputs: false });
    for (const id of ['SEE_SPRINTER_SPLIT', 'KEEP_SPRINTERS_GOING', 'WATCH_STARCH_BECOME_FOOD']) expect(keys(id)).toEqual({ clauses: null, amounts: null, cycle: false, inputs: false });
  });

  it('refuses every malformed parameter with its path and words', () => {
    const cases: [ObjectivePredicate, string, RegExp][] = [
      [pred('keepSpeciesAlive', { species: 'B01', colour: 'red' }, 10), 'predicate.params.colour', /has no parameter "colour"/],
      [pred('keepSpeciesAlive', { species: ['B01'], minSpecies: 2 }, 10), 'predicate.params.minSpecies', /minSpecies replaces species/],
      [pred('keepSpeciesAlive', { minSpecies: 1 }, 10), 'predicate.params.minSpecies', /from 2 to 64/],
      [pred('keepSpeciesAlive', { species: 'B01', regions: ['topLeft'] }, 10), 'predicate.params.regions', /aligned with a species list/],
      [pred('keepSpeciesAlive', { species: ['B01', 'B10'], regions: ['topLeft'] }, 10), 'predicate.params.regions', /one region per species/],
      [pred('keepSpeciesAlive', { species: ['B01', 'B01'] }, 10), 'predicate.params.species', /twice/],
      [pred('keepSpeciesAlive', { species: 'B01', minCount: 0 }, 10), 'predicate.params.minCount', /at least 1/],
      [pred('keepSpeciesAlive', { species: 'B01', region: 'top left' }, 10), 'predicate.params.region', /invalid region/],
      [pred('biomassThreshold', { threshold: 20, measure: 'mass' }), 'predicate.params.measure', /unknown measure "mass"/],
      [pred('biomassThreshold', { threshold: 20, fromBelow: 25 }), 'predicate.params.fromBelow', /cannot be above the threshold/],
      [pred('biomassThreshold', { threshold: 20, fromBelow: 2.5 }), 'predicate.params.fromBelow', /whole number/],
      [pred('observeEvent', { event: 'birth', atLeast: 2 }), 'predicate.params.atLeast', /only a measured clause/],
      [pred('observeEvent', { all: [{ event: 'glowOn', atLeast: 1 }] }), 'predicate.params.all.0.atLeast', /only a measured clause/],
      [pred('observeEvent', { event: 'intake' }), 'predicate.params.species', /intake clause needs a species/],
      [pred('observeEvent', { all: [{ event: 'consumption' }] }), 'predicate.params.all.0.pool', /unknown pool/],
      [pred('observeEvent', { all: [{ event: 'consumption', pool: 'sugar', species: 'B01' }] }), 'predicate.params.all.0.species', /measures a pool/],
      [pred('observeEvent', { all: [{ event: 'transfer', route: 'water' }] }), 'predicate.params.all.0.route', /unknown transfer route/],
      [pred('observeEvent', { all: [{ event: 'birth', pool: 'sugar' }] }), 'predicate.params.all.0.pool', /only a consumption clause/],
      [pred('observeEvent', { all: [{ event: 'birth', when: 1 }] }), 'predicate.params.all.0.when', /no parameter "when"/],
      [pred('observeEvent', { all: [] }), 'predicate.params.all', /1 to 8 clauses/],
      [pred('observeEvent', { event: 'birth', all: [{ event: 'birth' }] }), 'predicate.params.event', /names its clauses in "all"/],
      [pred('observeEvent', { event: 'birth', window: 'day' }), 'predicate.params.window', /unknown window "day"/],
      [pred('observeEvent', { event: 'birth', endOn: ['flood'] }), 'predicate.params.endOn', /unknown end "flood"/],
      [pred('observeEvent', { event: 'birth', endOn: [] }), 'predicate.params.endOn', /lists linkBroken/],
      [pred('observeEvent', { all: [{ event: 'conversion', enzyme: 'starch', species: 'B06' }] }), 'predicate.params.all.0.species', /names no producer species/],
    ];
    for (const [p, path, msg] of cases) {
      const t = typedPredicate(p);
      expect('path' in t, JSON.stringify(p)).toBe(true);
      expect(t as { path: string }, JSON.stringify(p)).toMatchObject({ path });
      expect((t as { message: string }).message, JSON.stringify(p)).toMatch(msg);
    }
  });

  it('support: a region the dish does not record, a cycle window on fixed light, species the dish lacks', () => {
    const garden = realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: 'p5-garden' });
    expect(objectiveSupportProblem(garden, P('TWO_NEIGHBORHOODS'))).toBe('this dish has no region FRESH_POOL');
    expect(objectiveSupportProblem(garden, P('NIGHT_GARDEN'))).toBe('this dish has no light cycle');
    expect(objectiveSupportProblem(garden, pred('keepSpeciesAlive', { species: 'B01', region: 'topLeft' }, 10))).toBeNull(); // a quarter is every dish's
    const h05 = habitatStart(REG, 'H05_BRINE_MOSAIC');
    expect(objectiveSupportProblem(h05, P('TWO_NEIGHBORHOODS'))).toBeNull();
    expect(objectiveSupportProblem(h05, pred('biomassThreshold', { threshold: 1, region: 'MESH' }))).toBe('this dish has no region MESH');
    const h08 = habitatStart(REG, 'H08_NIGHT_LANTERNS');
    expect(objectiveSupportProblem(h08, P('NIGHT_GARDEN'))).toBeNull();
    expect(() => new ObjectiveWatch(P('NIGHT_GARDEN'), garden)).toThrow(ObjectiveError);
  });
});

describe('the v1.0 goals evaluate exactly as before (with the stage hooks wired)', () => {
  it('FIRST_DISH_V1 seed 104729: split 351, starch 2, keep 1800 (tests/sim/objectives.test.ts)', () => {
    const w = realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: 'goals' });
    const watches = (['SEE_SPRINTER_SPLIT', 'WATCH_STARCH_BECOME_FOOD', 'KEEP_SPRINTERS_GOING'] as const).map((id) => new ObjectiveWatch(P(id), w));
    for (let k = 0; k < 1800; k++) {
      step(w, { afterStage: (s, x) => watches.forEach((o) => o.hook(s, x)) });
      for (const o of watches) o.afterTick(w);
    }
    expect(watches.map((o) => [o.state, o.endTick])).toEqual([
      ['completed', 351],
      ['completed', 2],
      ['completed', 1800],
    ]);
    // Their progress keeps exactly the v1.0 keys.
    expect(Object.keys(watches[0]!.progress()).sort()).toEqual(['holdSinceTick', 'startTick', 'state']);
    expect(Object.keys(watches[2]!.progress()).sort()).toEqual(['holdSinceTick', 'startTick', 'state']);
  }, 120_000);
});

describe('the seven prompts on measured worlds', () => {
  it('TWO_NEIGHBORHOODS: BRINE_CROSSING_V1 with two Feed strokes in the fresh pool completes at 180 s; Brinecoils only in the fresh pool never hold', () => {
    // TRUE: the Sprinters leave an unfed fresh pool for food (E207 records 0 left there), so the counterplay is food.
    const w = realizeRecipe(REG, 'BRINE_CROSSING_V1', { worldId: 'two-true' });
    const ok = runWatch(w, new ObjectiveWatch(P('TWO_NEIGHBORHOODS'), w), 4000, [
      { at: 600, payload: sugarStroke(40) },
      { at: 1100, payload: sugarStroke(40) },
    ]);
    expect([ok.state, ok.endTick, ok.value]).toEqual(['completed', 1800, 91]);
    expect(ok.progress()).toEqual({ startTick: 0, holdSinceTick: 0, state: 'completed' });
    // Unfed, the fresh pool falls below 6 Sprinters before 180 s and the attempt ends when the Brinecoils die out.
    const unfed = realizeRecipe(REG, 'BRINE_CROSSING_V1', { worldId: 'two-unfed' });
    const u = runWatch(unfed, new ObjectiveWatch(P('TWO_NEIGHBORHOODS'), unfed), 4000);
    expect([u.state, u.endTick, u.value]).toEqual(['ended', 3249, 0]);
    // FALSE: an H05 dish whose Brinecoils were placed only in the fresh pool: the brine pool never holds 6, and the
    // attempt ends at 50 s when the last Brinecoil (a brine kind) dies in fresh water. It never held.
    const f = atStart(habitatStart(REG, 'H05_BRINE_MOSAIC'), [inoculate('B01', 40, 64, 20), inoculate('B10', 40, 64, 20), sugarStroke(40)]);
    const no = runWatch(f, new ObjectiveWatch(P('TWO_NEIGHBORHOODS'), f), 1800);
    expect([no.state, no.endTick, no.value]).toEqual(['ended', 500, 0]);
    expect(no.progress().holdSinceTick).toBeNull();
  }, 240_000);

  it('NIGHT_GARDEN: a Lantern glow and Sunbead intake in one cycle completes; in different cycles it does not; the H08 community never glows (the limiting factor)', () => {
    // TRUE (fixture: the sensed signal is held at 0.31 during cycle 0's first 60 s): Sunbeads take in food from tick 1.
    const t = atStart(habitatStart(REG, 'H08_NIGHT_LANTERNS'), [inoculate('B09', 64, 64, 10, 3), inoculate('A01', 64, 64, 10, 6)]);
    const yes = runWatch(t, new ObjectiveWatch(P('NIGHT_GARDEN'), t), 4800, [], holdGlow((tick) => tick < 600));
    expect([yes.state, yes.endTick]).toEqual(['completed', 50]);
    expect(yes.progress()).toMatchObject({ clauses: [50, 1], cycle: 0 });
    // FALSE: the Lanterns glow only in cycle 0; the Sunbeads arrive at the start of cycle 1 (Add Life at 240 s).
    const f = atStart(habitatStart(REG, 'H08_NIGHT_LANTERNS'), [inoculate('B09', 64, 64, 10, 3)]);
    const no = runWatch(f, new ObjectiveWatch(P('NIGHT_GARDEN'), f), 4800, [{ at: 2400, payload: inoculate('A01', 64, 64, 10, 6) }], holdGlow((tick) => tick < 600));
    expect([no.state, f.tick]).toEqual(['running', 4800]);
    expect(f.events.totals.glowOn).toBeGreaterThan(0);
    expect(no.progress()).toMatchObject({ cycle: 1, clauses: [null, 2401] }); // cycle 0's glow was forgotten at 240 s
    // The measured limiting factor: the H08 community (5 Lanterns) never glows in two cycles; Sunbeads feed in each.
    const c = habitatStart(REG, 'H08_NIGHT_LANTERNS', { community: true });
    const m = runWatch(c, new ObjectiveWatch(P('NIGHT_GARDEN'), c), 4800);
    expect([m.state, c.events.totals.glowOn ?? 0]).toEqual(['running', 0]);
    expect(m.progress().clauses![0]).toBeNull();
  }, 240_000);

  it('FOOD_RELAY: SHARED_LUNCH_V1 with ten Recyclers added completes when debris is eaten; without a decomposer it waits on that step', () => {
    const t = atStart(realizeRecipe(REG, 'SHARED_LUNCH_V1', { worldId: 'relay-true' }), [inoculate('B04', 45, 64, 10, 4)]);
    const yes = runWatch(t, new ObjectiveWatch(P('FOOD_RELAY'), t), 4000);
    expect([yes.state, yes.endTick, yes.value]).toEqual(['completed', 1521, 4]);
    expect(yes.progress().clauses).toEqual([2, 1, 1471, 1521]);
    const f = realizeRecipe(REG, 'SHARED_LUNCH_V1', { worldId: 'relay-false' });
    const no = runWatch(f, new ObjectiveWatch(P('FOOD_RELAY'), f), 3000);
    expect([no.state, f.tick]).toEqual(['running', 3000]);
    expect(no.progress().clauses).toEqual([2, 1, 2046, null]);
    expect(no.progress().amounts![3]).toBe(0);
  }, 240_000);

  it('LIVING_BRIDGE: FUNGAL_SUPPLY_LINE_V1 carries 0.5 carbon at 13.6 s; Add Life after Start ends it', () => {
    const w = realizeRecipe(REG, 'FUNGAL_SUPPLY_LINE_V1', { worldId: 'bridge' });
    const yes = runWatch(w, new ObjectiveWatch(P('LIVING_BRIDGE'), w), 3000);
    expect([yes.state, yes.endTick]).toEqual(['completed', 136]);
    expect(yes.value).toBeCloseTo(0.502, 9);
    const f = realizeRecipe(REG, 'FUNGAL_SUPPLY_LINE_V1', { worldId: 'bridge-input' });
    const no = runWatch(f, new ObjectiveWatch(P('LIVING_BRIDGE'), f), 3000, [{ at: 50, payload: inoculate('B01', 30, 30, 2, 2) }]);
    expect([no.state, no.endTick, no.value]).toEqual(['ended', 51, null]);
  }, 120_000);

  it('LEAVE_A_REFUGE: the H11 community holds both for 180 s; twenty more Waterbears eat every Cordweaver and end it', () => {
    const w = habitatStart(REG, 'H11_GRAZING_MEADOW', { community: true });
    const yes = runWatch(w, new ObjectiveWatch(P('LEAVE_A_REFUGE'), w), 2000);
    expect([yes.state, yes.endTick, yes.value]).toEqual(['completed', 1800, 5]);
    const f = atStart(habitatStart(REG, 'H11_GRAZING_MEADOW', { community: true }), [inoculate('P08', 64, 64, 20, 6)]);
    const no = runWatch(f, new ObjectiveWatch(P('LEAVE_A_REFUGE'), f), 2000);
    expect([no.state, no.endTick, no.value]).toEqual(['ended', 93, 0]);
    const f02 = f.species.findIndex((s) => s.id === 'F02');
    expect(Array.from({ length: f.ents.highWater }, (_, i) => f.ents.cols.alive[i] === 1 && f.ents.cols.species[i] === f02).some(Boolean)).toBe(false);
  }, 120_000);

  it('SUSTAIN_THREE_SPECIES: the H04 community holds three kinds for 180 s; an H05 community (two kinds) never holds', () => {
    const w = habitatStart(REG, 'H04_LEAF_POOL', { community: true });
    const yes = runWatch(w, new ObjectiveWatch(P('SUSTAIN_THREE_SPECIES'), w), 2000);
    expect([yes.state, yes.endTick, yes.value]).toEqual(['completed', 1800, 3]);
    const f = habitatStart(REG, 'H05_BRINE_MOSAIC', { community: true });
    const no = runWatch(f, new ObjectiveWatch(P('SUSTAIN_THREE_SPECIES'), f), 1800);
    expect([no.state, no.progress().holdSinceTick]).toEqual(['running', null]);
  }, 120_000);

  it('RECOVER_A_NEIGHBORHOOD: refused where the region already has 5 active; one Add Life of 20 into an empty pool completes it', () => {
    const recover = (region: string): ObjectivePredicate => ({ ...P('RECOVER_A_NEIGHBORHOOD'), params: { ...P('RECOVER_A_NEIGHBORHOOD').params, region } });
    const c = habitatStart(REG, 'H05_BRINE_MOSAIC', { community: true });
    expect(objectiveStartProblem(c, recover('BRINE_POOL'))).toBe('This region already has 5 or more active organisms.');
    expect(() => new ObjectiveWatch(recover('BRINE_POOL'), c)).toThrow(ObjectiveStartRefusal);
    expect(() => new ObjectiveWatch(recover('BRINE_POOL'), c)).toThrow('This region already has 5 or more active organisms.');
    expect(objectiveStartProblem(c, recover('CHANNEL'))).toBeNull();
    const w = habitatStart(REG, 'H05_BRINE_MOSAIC');
    const watch = new ObjectiveWatch(recover('FRESH_POOL'), w);
    const done = runWatch(w, watch, 600, [{ at: 10, payload: inoculate('B01', 40, 64, 20, 6) }]);
    expect([done.state, done.endTick, done.value]).toEqual(['completed', 11, 20]);
    // A resumed watch never asks fromBelow again (the attempt started below it).
    expect(() => new ObjectiveWatch(recover('FRESH_POOL'), w, { startTick: 0, holdSinceTick: null, state: 'running' })).not.toThrow();
  }, 60_000);
});

describe('a resumed watch completes at the same tick as an uninterrupted run', () => {
  /**
   * Run `make()` with `id` to `limit`; at `saveAt` (after that step) the world goes through serialize →
   * JSON → deserialize and the watch through its JSON progress, as the worker saves and loads them.
   * `strip` removes progress keys before the resume (the mutant check).
   */
  function resumed(make: () => World, id: string, limit: number, saveAt: number | null, cmds: readonly Cmd[] = [], extra: Hook | null = null, strip: readonly (keyof ObjectiveProgress)[] = []): { tick: number | null; at: ObjectiveProgress | null } {
    let w = make();
    let watch = new ObjectiveWatch(P(id), w);
    let saved: ObjectiveProgress | null = null;
    if (saveAt !== null) {
      runWatch(w, watch, saveAt, cmds, extra);
      if (watch.state !== 'running') throw new Error(`${id} settled before ${saveAt}`);
      saved = JSON.parse(JSON.stringify(watch.progress())) as ObjectiveProgress;
      const stripped = { ...saved } as Record<string, unknown>;
      for (const k of strip) delete stripped[k];
      w = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
      try {
        watch = new ObjectiveWatch(P(id), w, stripped as unknown as ObjectiveProgress);
      } catch (e) {
        if (strip.length > 0 && e instanceof ObjectiveError) return { tick: -1, at: saved };
        throw e;
      }
    }
    runWatch(w, watch, limit, cmds, extra);
    return { tick: watch.endTick, at: saved };
  }

  it('FOOD_RELAY (clauses, amounts, the event position), NIGHT_GARDEN (cycle) and TWO_NEIGHBORHOODS (the hold)', () => {
    const relay = () => atStart(realizeRecipe(REG, 'SHARED_LUNCH_V1', { worldId: 'relay-resume' }), [inoculate('B04', 45, 64, 10, 4)]);
    const r = resumed(relay, 'FOOD_RELAY', 4000, 1500);
    expect(r.tick).toBe(1521);
    expect(r.at).toMatchObject({ clauses: [2, 1, 1471, null] });
    expect(r.at!.amounts![1]).toBeGreaterThan(0);
    const night = () => atStart(habitatStart(REG, 'H08_NIGHT_LANTERNS'), [inoculate('B09', 64, 64, 10, 3), inoculate('A01', 64, 64, 10, 6)]);
    const n = resumed(night, 'NIGHT_GARDEN', 4800, 30, [], holdGlow((tick) => tick < 600));
    expect(n.tick).toBe(50);
    expect(n.at).toMatchObject({ clauses: [null, 1], cycle: 0 });
    const two = () => realizeRecipe(REG, 'BRINE_CROSSING_V1', { worldId: 'two-resume' });
    const feeds: Cmd[] = [
      { at: 600, payload: sugarStroke(40) },
      { at: 1100, payload: sugarStroke(40) },
    ];
    expect(resumed(two, 'TWO_NEIGHBORHOODS', 4000, 900, feeds).tick).toBe(1800);
  }, 300_000);

  it('mutant check: without its saved clauses a resumed all-of goal is refused (it would forget what it saw)', () => {
    const relay = () => atStart(realizeRecipe(REG, 'SHARED_LUNCH_V1', { worldId: 'relay-mutant' }), [inoculate('B04', 45, 64, 10, 4)]);
    expect(resumed(relay, 'FOOD_RELAY', 4000, 1500, [], null, ['clauses']).tick).toBe(-1);
    expect(resumed(relay, 'FOOD_RELAY', 4000, 1500, [], null, ['amounts']).tick).toBe(-1);
  }, 120_000);
});

describe('evaluation is read-only', () => {
  it('3,000 ticks of SHARED_LUNCH_V1 with every prompt shape armed (hooks wired): equal stateHash and full trajectory digest', () => {
    const plain = realizeRecipe(REG, 'SHARED_LUNCH_V1', { worldId: 'ro' });
    for (let k = 0; k < 3000; k++) step(plain);
    const w = realizeRecipe(REG, 'SHARED_LUNCH_V1', { worldId: 'ro' });
    const watches = [
      new ObjectiveWatch(P('FOOD_RELAY'), w),
      new ObjectiveWatch(P('LIVING_BRIDGE'), w),
      new ObjectiveWatch(P('SUSTAIN_THREE_SPECIES'), w),
      new ObjectiveWatch(pred('keepSpeciesAlive', { species: ['B01', 'B06'], regions: ['topLeft', 'dish'], minCount: 2 }, 300), w),
      new ObjectiveWatch(pred('biomassThreshold', { measure: 'activeCount', region: 'bottomRight', threshold: 1e6 }), w),
      new ObjectiveWatch(pred('observeEvent', { all: [{ event: 'intake', species: 'B01', atLeast: 1e9 }, { event: 'consumption', pool: 'broth' }] }), w),
    ];
    for (let k = 0; k < 3000; k++) {
      step(w, { afterStage: (s, x) => watches.forEach((o) => o.hook(s, x)) });
      for (const o of watches) o.afterTick(w);
    }
    expect(stateHash(w)).toBe(stateHash(plain));
    expect(trajectoryDigest(w, 'full')).toBe(trajectoryDigest(plain, 'full'));
  }, 180_000);
});
