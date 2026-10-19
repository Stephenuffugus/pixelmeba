/**
 * P5.6 expansion cards E205–E211 (CT §10.3; D02 §21–22; g5-briefs E1; D-0131). Each card validates under the
 * SHIPPED registry and runs headless from its recipe (runExperiment). A card that reaches its gate pins the
 * gate second and clause values (revision 1 of every recipe but GATE_MEAL_V1: revision 2 sets the background
 * sugar to 0, so the gate's sugar is sugar the Crumbsmiths made; fix round 1); a card that cannot pins
 * the MEASURED limiting factor instead (E205, E206: reported as not release-ready, the lead decides; nothing is
 * scripted). Every run twice gives identical canonical results. The generalized omitFounders (briefs E215).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExperimentDef, RecipeDef } from '../../src/sim/content/schema';
import { RecipeSchema, ExperimentSchema } from '../../src/sim/content/schema';
import { GLOW_ON_THRESHOLD } from '../../src/sim/constants';
import { experimentProblems, omittableFounderGroup, realizeExperimentArms, runExperiment, type ExperimentResult } from '../../src/sim/experiments';
import { canonicalJson } from '../../src/sim/hash';
import { realizeRecipe, recipeShapeProblems, recipeStructures } from '../../src/sim/recipes';
import { sensedSignal } from '../../src/sim/signals';
import { entityCell } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import { ArmObserver, measureArm, stepObserved } from '../../src/sim/pairedRun';
import { phase5RecordsChecked, PHASE5_EXPERIMENT_RECORDS } from '../helpers/registry';
import { rawPacks, registry } from './helpers';

const CARDS = ['EXP_205', 'EXP_206', 'EXP_207', 'EXP_208', 'EXP_209', 'EXP_210', 'EXP_211'] as const;
const results: Record<string, ExperimentResult> = {};
beforeAll(() => {
  for (const id of CARDS) results[id] = runExperiment(registry(), id);
}, 600_000);

const ctx = () => ({ species: registry().species, materials: registry().materials, manifest: registry().manifest, habitats: registry().habitats });
const clauseValues = (r: ExperimentResult) => r.gate.clauses.map((c) => c.actual);

/** The largest signal any living B09 sensed at the end of any tick of `ticks`, and the glow-ons recorded. */
function lanternSignal(recipeId: string, ticks: number): { maxSensed: number; glowOn: number; maxGlowing: number } {
  const w = realizeRecipe(registry(), recipeId);
  const sp = w.species.findIndex((s) => s.id === 'B09');
  let maxSensed = 0;
  let maxGlowing = 0;
  for (let t = 0; t < ticks; t++) {
    step(w);
    const c = w.ents.cols;
    let glowing = 0;
    for (let i = 0; i < w.ents.highWater; i++) {
      if (c.alive[i] !== 1 || c.species[i] !== sp) continue;
      maxSensed = Math.max(maxSensed, sensedSignal(w, entityCell(c.x[i]!, c.y[i]!)));
      if (c.glowState[i] === 1) glowing++;
    }
    maxGlowing = Math.max(maxGlowing, glowing);
  }
  return { maxSensed, glowOn: w.events.totals.glowOn ?? 0, maxGlowing };
}

describe('E205–E211: content', () => {
  it('every card validates under the shipped registry, is phase 5 and uses its number as seed', () => {
    for (const id of CARDS) {
      const def = registry().experiments[id]!;
      expect(def.phase).toBe(5);
      expect(def.seed).toBe(Number(id.slice(4)));
      expect(registry().recipes[def.recipeId]!.seed).toBe(def.seed);
      expect(experimentProblems(def, registry().recipes[def.recipeId], ctx()), id).toEqual([]);
    }
  });

  it('every run twice gives identical canonical results', () => {
    for (const id of CARDS) expect(canonicalJson(runExperiment(registry(), id)), id).toBe(canonicalJson(results[id]));
  }, 600_000);

  it('every arm keeps its ledger', () => {
    for (const id of CARDS) {
      expect(results[id]!.A.ledger.everyCheckOk, id).toBe(true);
      if (results[id]!.B) expect(results[id]!.B.ledger.everyCheckOk, id).toBe(true);
    }
  });
});

describe('E205–E211: gates (revision 1 of every recipe but GATE_MEAL_V1, revision 2)', () => {
  it('E205 Glow threshold does not reach its gate: the measured limiting factor is the sensed signal (NOT release-ready)', () => {
    const r = results.EXP_205!;
    expect(r.gate.reached).toBe(false);
    expect(clauseValues(r)).toEqual([0]); // events.glowOn.B09
    expect(r.A.reported['alive.B09']).toBe(60);
    // Thirty to sixty Lanterns in open water never sense more than about a third of the 0.30 on-threshold
    // (CT §12.6; water diffusion spreads the 0.02/s emission), so no Lantern can start its 5 s dwell.
    const s = lanternSignal('GLOW_THRESHOLD_V1', 1200);
    expect(s.glowOn).toBe(0);
    expect(s.maxSensed).toBeLessThan(0.1);
    expect(s.maxSensed).toBeLessThan(GLOW_ON_THRESHOLD / 3);
  }, 120_000);

  it('E206 Quiet neighbors: seed 206 never glows by E205’s 120 s, so atSecond is that horizon and the gate’s first clause fails (NOT release-ready)', () => {
    const def = registry().experiments.EXP_206!;
    // There is no first glowing second on seed 206 within E205's run (asserted, so a rule change that makes
    // Lanterns glow fails here and the card's atSecond is revised to that second).
    const s = lanternSignal('QUIET_NEIGHBORS_V1', 1200);
    expect(s.maxGlowing).toBe(0);
    expect(def.change).toMatchObject({ kind: 'commands', atSecond: 120 });
    expect(def.stoppingSeconds).toBe(150);
    const r = results.EXP_206!;
    expect(r.gate.reached).toBe(false);
    expect(clauseValues(r)).toEqual([0, 30, 113]); // glowingStart.B09 A, runSeconds A, interventionAccepted B
    expect(r.B!.reported['field.quencher']).toBeGreaterThan(0);
  }, 120_000);

  it('E207 Brine crossing: salt crossed the shutter and lowered a Sprinter’s suitability at 46 s', () => {
    const r = results.EXP_207!;
    expect(r.gate.reachedAtSecond).toBe(46);
    const [salt, suit] = clauseValues(r);
    expect(salt).toBeCloseTo(2.995644211824584, 9);
    expect(suit).toBeCloseTo(0.4, 9);
    expect(r.A.measurements['alive.B10']).toBe(160);
    expect(r.A.measurements['alive.B01']).toBe(179);
    expect(r.A.reported['alive.B01@FRESH_POOL']).toBe(0); // the Sprinters left the pool for the gel
  });

  it('E207: a shutter closed from the start crosses no salt, yet salt reaches the fresh pool through the gel and Sprinters still meet salt (the texts claim no blocking)', () => {
    const w = realizeRecipe(registry(), 'BRINE_CROSSING_V1', { transform: (x) => ({ ...x, edges: x.edges!.map((e) => ({ ...e, open: false })) }) });
    const ids = ['gateTransfer.S03.salt', 'mean.salt@FRESH_POOL', 'limitSeconds.B01.SUIT_SALINITY'];
    const obs = new ArmObserver(w, { observe: ids });
    for (let t = 0; t < 1800; t++) stepObserved(w, obs);
    const m = measureArm(w, obs, ids);
    expect(m['gateTransfer.S03.salt']).toBe(0);
    expect(m['mean.salt@FRESH_POOL']).toBeCloseTo(0.005912066989411843, 9);
    expect(m['limitSeconds.B01.SUIT_SALINITY']).toBeCloseTo(497.1, 6);
    const def = registry().experiments.EXP_207!;
    const texts = [def.predictedTradeoff, def.confounds, registry().recipes.BRINE_CROSSING_V1!.expectedObservationsText];
    for (const t of texts) expect(t).not.toMatch(/blocks it|stops anything else|keeps the pools apart but/);
    expect(def.predictedTradeoff).toMatch(/seeps slowly through the gel/);
  }, 120_000);

  it('E208 Glass budget: copy A was limited by silicate, copy B received it (180 s)', () => {
    const r = results.EXP_208!;
    expect(r.gate.reachedAtSecond).toBe(180);
    expect(clauseValues(r)).toEqual([180, 113, 4497]);
    expect(r.A.reported['alive.A02']).toBe(0);
    expect(r.B!.reported['alive.A02']).toBe(136);
    // The Water Garden holds no silicate: no background override was needed (CT "set silicate zero").
    const w = realizeRecipe(registry(), 'GLASS_BUDGET_V1');
    expect(w.fields.silicate!.every((v) => v === 0)).toBe(true);
  });

  it('E209 Gate meal (revision 2: background sugar 0): sugar made from starch crossed the membranes and no organism crossed, at 180 s', () => {
    const r = results.EXP_209!;
    // Revision 2 (fix round 1): backgroundOverrides sugar 0.02 -> 0, so every unit of sugar in the dish was made by
    // the Crumbsmiths' enzyme; the gate reads the crossing count over the whole run at the stopping time.
    expect(registry().recipes.GATE_MEAL_V1!.revision).toBe(2);
    expect(r.gate.reachedAtSecond).toBe(180);
    const [secs, sugar, crossings] = clauseValues(r);
    expect(secs).toBe(180);
    expect(sugar).toBeCloseTo(0.7647136653391671, 9);
    expect(crossings).toBe(0);
    expect(r.A.reported['converted.starch']).toBeCloseTo(28.694610426173508, 9);
    expect(r.A.reported['intake.B01']).toBeCloseTo(0.7187125628384773, 9);
    expect(r.A.reported['alive.B06@RIGHT_SIDE']).toBe(0);
    expect(r.A.reported['alive.B01@LEFT_SIDE']).toBe(0);
    // Both founding groups starve within the run (B01 by 127 s, B06 by 173 s): the dish records it; nothing is promised.
    expect(r.A.measurements['extinctAt.B01']).toBe(127);
    expect(r.A.measurements['extinctAt.B06']).toBe(173);
  });

  it('E209: with the Crumbsmiths removed no sugar exists, none crosses and the gate is not reached (the mechanism is load-bearing)', () => {
    const w = realizeRecipe(registry(), 'GATE_MEAL_V1', { transform: (x) => ({ ...x, founders: x.founders.filter((f) => f.species !== 'B06') }) });
    expect(w.fields.sugar!.every((v) => v === 0)).toBe(true);
    const ids = ['gateTransfer.S01.sugar', 'converted.starch', 'gateCrossings.S01'];
    const obs = new ArmObserver(w, { observe: ids });
    for (let t = 0; t < 1800; t++) stepObserved(w, obs);
    expect(measureArm(w, obs, ids)).toEqual({ 'gateTransfer.S01.sugar': 0, 'converted.starch': 0, 'gateCrossings.S01': 0 });
    const gate = registry().experiments.EXP_209!.gate.params as { all: { measure: string }[] };
    expect(gate.all.map((c) => c.measure)).toEqual(['runSeconds', 'gateTransfer.S01.sugar', 'gateCrossings.S01']);
  }, 120_000);

  it('E210 Sleeping shortage: a resting transition then a wake (75 s)', () => {
    const r = results.EXP_210!;
    expect(r.gate.reachedAtSecond).toBe(75);
    expect(clauseValues(r)).toEqual([20, 20]);
    expect(r.A.reported['alive.B12']).toBe(26);
  });

  it('E211 Sheltered lace: 600 s; the roofed gel stayed moist and the open gel dried', () => {
    const r = results.EXP_211!;
    expect(r.gate.reachedAtSecond).toBe(600);
    expect(r.A.reported['moisture@ROOF']).toBeCloseTo(0.8, 9);
    expect(r.A.reported['moisture@OPEN_GEL']).toBeCloseTo(0.2, 9);
    expect([r.A.reported['alive.F04@ROOF'], r.A.reported['alive.F04@OPEN_GEL']]).toEqual([10, 10]);
  });
});

describe('the test helper’s Phase 5 drop list (fix round 1)', () => {
  it('names only phase 5 records on disk, and refuses one that is not', () => {
    const raw = JSON.parse(JSON.stringify(rawPacks())) as ReturnType<typeof rawPacks>;
    expect(() => phase5RecordsChecked(raw)).not.toThrow();
    const f = raw.recipes.find((x) => (x.data as { id: string }).id === PHASE5_EXPERIMENT_RECORDS[0])!;
    (f.data as { phase: number }).phase = 3;
    expect(() => phase5RecordsChecked(raw)).toThrow(`missing or not phase 5: ${PHASE5_EXPERIMENT_RECORDS[0]}`);
  });
});

describe('omitFounders generalized (PROPOSED DECISION: a group whose later groups all list their cells)', () => {
  const base = RecipeSchema.parse({
    id: 'TEST_OMIT',
    revision: 1,
    name: 'Omit test',
    habitatId: 'WATER_GARDEN',
    seed: 1,
    removeStones: true,
    mutationPreset: 'fixed',
    founderMode: 'identical',
    founders: [
      { species: 'B01', count: 3, center: [60, 64], radius: 3 },
      { species: 'B04', count: 2, center: [70, 64], radius: 2, cells: [[70, 64], [71, 64]] },
      { species: 'B06', count: 2, center: [64, 70], radius: 2, cells: [[64, 70], [65, 70]] },
    ],
    phase: 5,
  });
  const card = (founderIndex: number): ExperimentDef =>
    ExperimentSchema.parse({
      id: 'EXP_TOMIT',
      seed: 1,
      title: 't',
      question: 'q',
      recipeId: 'TEST_OMIT',
      intervention: 'i',
      predictedTradeoff: 'p',
      measurements: ['alive.B01'],
      stoppingSeconds: 5,
      confounds: 'c',
      gate: { type: 'custom', params: { all: [{ measure: 'runSeconds', arm: 'A', op: 'gte', value: 5 }] } },
      paired: true,
      change: { kind: 'omitFounders', founderIndex },
      completion: { journalStamp: 's', playerSteps: ['viewComparison'] },
      phase: 5,
    });
  const MSG = 'only the last founder group, or a group whose later groups all list their cells, can be omitted';
  const problems = (r: RecipeDef, k: number) => experimentProblems(card(k), r, ctx()).filter((p) => p.path === 'change.founderIndex');

  it('accepts the first group when every later group lists its cells, and the last group always', () => {
    expect(problems(base, 0)).toEqual([]);
    expect(problems(base, 1)).toEqual([]);
    expect(problems(base, 2)).toEqual([]);
    expect(omittableFounderGroup(base, 0)).toBe(true);
  });

  it('refuses a group with a later group placed by nearest or scatter', () => {
    const r: RecipeDef = { ...base, founders: [base.founders[0]!, { ...base.founders[1]!, cells: undefined }, base.founders[2]!] };
    expect(problems(r, 0).map((p) => p.message)).toEqual([MSG]);
    expect(problems(r, 1)).toEqual([]);
    expect(problems(r, 2)).toEqual([]);
    expect(problems(base, 3).map((p) => p.message)).toEqual(['recipe TEST_OMIT has no founder group 3']);
  });

  it('arm B without group 0 keeps every later group’s cells (their birth ids shift by the omitted count)', () => {
    const reg = { ...registry(), recipes: { ...registry().recipes, TEST_OMIT: base } };
    const arms = realizeExperimentArms(reg, card(0));
    const cellsOf = (w: typeof arms.A, sp: string) => {
      const c = w.ents.cols;
      const out: number[] = [];
      for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && w.species[c.species[i]!]!.id === sp) out.push(entityCell(c.x[i]!, c.y[i]!));
      return out.sort((a, b) => a - b);
    };
    for (const sp of ['B04', 'B06']) expect(cellsOf(arms.B!, sp)).toEqual(cellsOf(arms.A, sp));
    expect(cellsOf(arms.B!, 'B01')).toEqual([]);
    expect(cellsOf(arms.A, 'B01')).toHaveLength(3);
  });
});

describe('card extensions: region, gate and step validation (PROPOSED DECISION: checked against the recipe’s habitat)', () => {
  const problemsOf = (id: string, edit: (d: ExperimentDef) => ExperimentDef, manifest = registry().manifest) => {
    const def = edit(registry().experiments[id]!);
    return experimentProblems(def, registry().recipes[def.recipeId], { ...ctx(), manifest }).map((p) => `${p.path}: ${p.message}`);
  };
  it('a region measure names a region of the recipe’s habitat; a gate measure a kind the recipe or habitat places', () => {
    expect(problemsOf('EXP_207', (d) => ({ ...d, measurements: [...d.measurements, 'alive.B01@ROOF'] }))).toEqual([
      `measurements.${registry().experiments.EXP_207!.measurements.length}: habitat H05_BRINE_MOSAIC has no region "ROOF" (FRESH_POOL, BRINE_POOL, CHANNEL)`,
    ]);
    expect(problemsOf('EXP_207', (d) => ({ ...d, measurements: [...d.measurements, 'gateTransfer.S01.salt'] }))).toEqual([
      `measurements.${registry().experiments.EXP_207!.measurements.length}: recipe BRINE_CROSSING_V1 and its habitat place no S01 edge`,
    ]);
    expect(problemsOf('EXP_205', (d) => ({ ...d, measurements: [...d.measurements, 'moisture@ROOF'] }))).toEqual([
      `measurements.${registry().experiments.EXP_205!.measurements.length}: habitat WATER_GARDEN has no region "ROOF"`,
    ]);
  });
  it('toggleShutter needs a placed S03, inspectGlow a followed species with glow rules, inspectMoisture a moisture measure', () => {
    const steps = (s: ExperimentDef['completion']['playerSteps']) => (d: ExperimentDef): ExperimentDef => ({ ...d, completion: { ...d.completion, playerSteps: s } });
    expect(problemsOf('EXP_205', steps(['toggleShutter']))).toEqual(['completion.playerSteps.0: "toggleShutter" needs a shutter gate (S03) that recipe GLOW_THRESHOLD_V1 or its habitat places']);
    expect(problemsOf('EXP_210', steps(['inspectGlow']))).toEqual(['completion.playerSteps.0: "inspectGlow" needs a followed species with glow rules (native SIGNAL_GLOW or E02)']);
    expect(problemsOf('EXP_205', steps(['inspectMoisture']))).toEqual(['completion.playerSteps.0: "inspectMoisture" needs a moisture measurement (moisture@REGION)']);
    expect(problemsOf('EXP_207', steps(['toggleShutter']))).toEqual([]);
  });
  it('a shipped card’s habitat is enabled and offered by the build', () => {
    const m = registry().manifest;
    expect(problemsOf('EXP_207', (d) => d, { ...m, enabledHabitats: m.enabledHabitats.filter((h) => h !== 'H05_BRINE_MOSAIC') })).toEqual([
      `recipeId: recipe BRINE_CROSSING_V1's habitat "H05_BRINE_MOSAIC" is not enabled in this build`,
    ]);
    const noS01 = problemsOf('EXP_209', (d) => d, { ...m, enabledStructures: (m.enabledStructures ?? []).filter((s) => s !== 'S01') });
    expect(noS01.some((p) => p.startsWith("recipeId: recipe GATE_MEAL_V1's habitat: "))).toBe(true);
  });
});

describe('card extensions: RecipeSchema.furnish (E216’s mesh)', () => {
  const h09 = () => registry().habitats.H09_DRYING_LACE!;
  const recipe = (extra: Partial<RecipeDef>): RecipeDef => ({ ...registry().recipes.SHELTERED_LACE_V1!, ...extra });
  it('is numbered after the recipe’s devices; a recipe without it keeps today’s ids', () => {
    const habitatOnly = recipeStructures(h09(), recipe({}));
    const withDevice = recipeStructures(h09(), recipe({ devices: [{ structure: 'S05', at: [70, 40] }] }));
    const withFurnish = recipeStructures(h09(), recipe({ devices: [{ structure: 'S05', at: [70, 40] }], furnish: [{ structure: 'S06', area: { kind: 'disk', center: [64, 90], radius: 1 } }] }));
    expect(canonicalJson(recipeStructures(h09(), recipe({ furnish: undefined })))).toBe(canonicalJson(habitatOnly));
    const n = habitatOnly.devices.length; // the habitat's S12 wick and its S11 roof cells: ids 1 … n
    expect(Math.max(...habitatOnly.devices.map((d) => d.id))).toBe(n);
    expect(withDevice.devices.find((d) => d.kind === 'S05')!.id).toBe(n + 1);
    const mesh = withFurnish.devices.filter((d) => d.kind === 'S06');
    expect(mesh).toHaveLength(5); // a radius-1 disk: (64,89), (63,90), (64,90), (65,90), (64,91), row-major
    expect(mesh.map((d) => d.id).sort((a, b) => a - b)).toEqual([n + 2, n + 3, n + 4, n + 5, n + 6]);
  });
  it('is realized and validated as a habitat’s furnished area (in the dish; one per cell)', () => {
    const w = realizeRecipe(registry(), recipe({ furnish: [{ structure: 'S06', area: { kind: 'disk', center: [64, 90], radius: 1 } }] }));
    expect(w.devices.filter((d) => d.kind === 'S06')).toHaveLength(5);
    expect(w.counters.nextDeviceId).toBe(1 + w.edges.length + w.devices.length);
    expect(recipeShapeProblems(recipe({ furnish: [{ structure: 'S06', area: { kind: 'disk', center: [2, 2], radius: 3 } }] }), h09(), registry().species)).toEqual([
      { path: 'furnish.0.area', message: expect.stringMatching(/is outside the dish: a furnished area lies wholly inside it$/) },
    ]);
    expect(() => realizeRecipe(registry(), recipe({ furnish: [{ structure: 'S06', area: { kind: 'disk', center: [88, 64], radius: 1 } }] }))).toThrow(/Two devices share one cell/);
  });
});
