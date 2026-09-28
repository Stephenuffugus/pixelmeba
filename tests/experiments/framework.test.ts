/**
 * P2.5 experiments framework (SPEC §13.2, CT §10, D06 §8): card content and validation, the gate
 * predicate, and the paired-arm contract — arm B differs from arm A only by the declared change,
 * applied at setup or through the ordinary command path.
 */
import { describe, expect, it } from 'vitest';
import { validateContent } from '../../src/sim/content/registry';
import { applyNow, stageCommands } from '../../src/sim/commands';
import {
  evaluateGate,
  experimentCatalog,
  experimentProblems,
  gateClauses,
  parseMeasure,
  realizeExperimentArms,
  runExperiment,
  type ExperimentArms,
  type GateClause,
} from '../../src/sim/experiments';
import { FIELD_IDS } from '../../src/sim/fields';
import { cellIndex, diskCells, inMask, maskCells, transportOpen } from '../../src/sim/grid';
import { canOccupy } from '../../src/sim/movement';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { entityCell } from '../../src/sim/spatial';
import { speciesIndex, type World } from '../../src/sim/world';
import { mutate, rawPacks, registry, runTwiceIdentical } from './helpers';

const errorsOf = (raw: ReturnType<typeof rawPacks>) => validateContent(raw).issues.filter((i) => i.severity === 'error');

describe('experiment cards (SPEC §13.2; CT §10)', () => {
  it('the seven Phase 2 cards ship with the seeds, recipes and pairing CT §10 nominates', () => {
    const cards = experimentCatalog(registry()).map((e) => [e.id, e.seed, e.recipeId, e.paired, e.change.kind, e.stoppingSeconds]);
    expect(cards).toEqual([
      ['EXP_101', 101, 'FOOD_TRAIL_V1', false, 'none', 180],
      ['EXP_102', 102, 'LIGHT_AND_LIFE_V1', true, 'shade', 180],
      ['EXP_103', 103, 'CLEANING_CREW_V1', false, 'none', 180],
      ['EXP_106', 106, 'PREDATOR_BALANCE_V1', true, 'commands', 180],
      ['EXP_A', 104729, 'STARCH_UNLOCK_V1', true, 'omitPatch', 180],
      ['EXP_B', 104729, 'FIRST_DISH_V1', true, 'commands', 300],
      ['EXP_C', 104729, 'RESERVE_COMPARE_V1', true, 'omitScheduled', 600],
    ]);
  });

  it('every card carries every part SPEC §13.2 names and validates against its recipe', () => {
    const reg = registry();
    for (const e of experimentCatalog(reg)) {
      expect(e.question.length, e.id).toBeGreaterThan(0);
      expect(e.intervention?.length ?? 0, e.id).toBeGreaterThan(0);
      expect(e.predictedTradeoff.length, e.id).toBeGreaterThan(0);
      expect(e.measurements.length, e.id).toBeGreaterThan(0);
      expect(e.confounds.length, e.id).toBeGreaterThan(0);
      expect(gateClauses(e).length, e.id).toBeGreaterThan(0);
      expect(e.completion.journalStamp.length, e.id).toBeGreaterThan(0);
      expect(e.completion.worldKeepsRunning).toBe(true);
      expect(e.seed).toBe(reg.recipes[e.recipeId]!.seed);
      expect(experimentProblems(e, reg.recipes[e.recipeId], { species: reg.species, materials: reg.materials, manifest: reg.manifest })).toEqual([]);
      // Honest labels (CLAUDE.md): no card calls a lineage superior, advanced, perfect, adapted or immune.
      expect(JSON.stringify(e)).not.toMatch(/superior|advanced|perfect|adapted|immune/i);
    }
  });
});

describe('experiment validation names the file and field', () => {
  const raw = rawPacks();
  const has = (errs: ReturnType<typeof errorsOf>, file: string, path: string) =>
    expect(errs, JSON.stringify(errs)).toContainEqual(expect.objectContaining({ file: `content/${file}`, path }));

  it('rejects unknown measurements and species', () => {
    const errs = errorsOf(mutate(raw, 'experiments', 'EXP_101.json', (d) => (d.measurements as string[]).push('biomass.B99', 'size.B01', 'deaths.B01.FOOD_ACCESS_LOW')));
    has(errs, 'experiments/EXP_101.json', 'measurements.9');
    has(errs, 'experiments/EXP_101.json', 'measurements.10');
    has(errs, 'experiments/EXP_101.json', 'measurements.11');
  });

  it('rejects founder-group measurements with a bad group, an unknown species or a module this build does not enable', () => {
    const n = registry().experiments.EXP_C!.measurements.length;
    const errs = errorsOf(mutate(raw, 'experiments', 'EXP_C.json', (d) => (d.measurements as string[]).push('descendants.B01.reserve', 'descendants.B99.none', 'founders.B01.E09', 'descendants.B01')));
    for (let k = 0; k < 4; k++) has(errs, 'experiments/EXP_C.json', `measurements.${n + k}`);
  });

  it('rejects arm-B clauses on a single-arm card and unsupported gate types', () => {
    const errs = errorsOf(
      mutate(raw, 'experiments', 'EXP_103.json', (d) => {
        ((d.gate as { params: { all: GateClause[] } }).params.all[0]!).arm = 'B';
      }),
    );
    has(errs, 'experiments/EXP_103.json', 'gate.params.all.0.arm');
    const errs2 = errorsOf(mutate(raw, 'experiments', 'EXP_103.json', (d) => ((d.gate as { type: string }).type = 'observeEvent')));
    has(errs2, 'experiments/EXP_103.json', 'gate.type');
    const errs3 = errorsOf(mutate(raw, 'experiments', 'EXP_103.json', (d) => ((d.gate as { params: unknown }).params = { all: [] })));
    has(errs3, 'experiments/EXP_103.json', 'gate.params.all');
  });

  it('a paired card must declare exactly one valid change', () => {
    has(errorsOf(mutate(raw, 'experiments', 'EXP_A.json', (d) => (d.change = { kind: 'none' }))), 'experiments/EXP_A.json', 'change');
    has(errorsOf(mutate(raw, 'experiments', 'EXP_A.json', (d) => (d.change = { kind: 'omitPatch', patchIndex: 5 }))), 'experiments/EXP_A.json', 'change.patchIndex');
    has(errorsOf(mutate(raw, 'experiments', 'EXP_101.json', (d) => (d.change = { kind: 'shade', factor: 0.1 }))), 'experiments/EXP_101.json', 'change');
    has(errorsOf(mutate(raw, 'experiments', 'EXP_102.json', (d) => (d.change = { kind: 'shade', factor: 0.5 }))), 'experiments/EXP_102.json', 'change.factor');
    has(
      errorsOf(mutate(raw, 'experiments', 'EXP_B.json', (d) => ((d.change as { atSecond: number }).atSecond = 300))),
      'experiments/EXP_B.json',
      'change.atSecond',
    );
    // omitScheduled names existing, distinct scheduled commands of the recipe.
    has(errorsOf(mutate(raw, 'experiments', 'EXP_C.json', (d) => (d.change = { kind: 'omitScheduled', indexes: [0, 5] }))), 'experiments/EXP_C.json', 'change.indexes.1');
    has(errorsOf(mutate(raw, 'experiments', 'EXP_C.json', (d) => (d.change = { kind: 'omitScheduled', indexes: [2, 2] }))), 'experiments/EXP_C.json', 'change.indexes.1');
    has(errorsOf(mutate(raw, 'experiments', 'EXP_C.json', (d) => (d.change = { kind: 'omitScheduled', indexes: [] }))), 'experiments/EXP_C.json', 'change.indexes');
    // Species outside this build's manifest cannot be introduced by a shipped card.
    has(
      errorsOf(mutate(raw, 'experiments', 'EXP_106.json', (d) => ((d.change as { commands: { speciesId: string }[] }).commands[0]!.speciesId = 'P02'))),
      'experiments/EXP_106.json',
      'change.commands.0.speciesId',
    );
  });

  it('requires every card part and checks the recipe’s scheduled command payloads', () => {
    has(errorsOf(mutate(raw, 'experiments', 'EXP_103.json', (d) => delete d.completion)), 'experiments/EXP_103.json', 'completion');
    for (const part of ['intervention', 'predictedTradeoff', 'confounds'])
      has(errorsOf(mutate(raw, 'experiments', 'EXP_103.json', (d) => delete d[part])), 'experiments/EXP_103.json', part);
    const errs = errorsOf(
      mutate(raw, 'recipes', 'FOOD_TRAIL_V1.json', (d) => {
        ((d.scheduledCommands as { payload: { materialId: string } }[])[0]!).payload.materialId = 'NOPE';
      }),
    );
    has(errs, 'recipes/FOOD_TRAIL_V1.json', 'scheduledCommands.0.payload.materialId');
    const errs2 = errorsOf(
      mutate(raw, 'recipes', 'FOOD_TRAIL_V1.json', (d) => {
        ((d.scheduledCommands as { payload: { dose: number } }[])[1]!).payload.dose = -1;
      }),
    );
    has(errs2, 'recipes/FOOD_TRAIL_V1.json', 'scheduledCommands.1.payload.dose');
  });
});

describe('measurement grammar and gate evaluation', () => {
  it('parses every id family and refuses anything else', () => {
    expect(parseMeasure('runSeconds')).toEqual({ kind: 'scalar', name: 'runSeconds' });
    expect(parseMeasure('biomassRatio.B01')).toEqual({ kind: 'species', stat: 'biomassRatio', species: 'B01' });
    expect(parseMeasure('deaths.B01.DEATH_PREDATION')).toMatchObject({ kind: 'deathCause', species: 'B01' });
    expect(parseMeasure('field.starch')).toEqual({ kind: 'field', field: 'starch' });
    expect(parseMeasure('consumed.detritus')).toEqual({ kind: 'consumed', field: 'detritus' });
    expect(parseMeasure('converted.starch')).toEqual({ kind: 'converted', enzyme: 'starch' });
    expect(parseMeasure('patchInput.0')).toEqual({ kind: 'patchInput', index: 0 });
    expect(parseMeasure('descendants.B01.E05')).toEqual({ kind: 'group', stat: 'descendants', species: 'B01', group: 'E05' });
    expect(parseMeasure('groupExtinctAt.B01.none')).toEqual({ kind: 'group', stat: 'groupExtinctAt', species: 'B01', group: 'none' });
    expect(parseMeasure('founders.B04.E03+E05')).toEqual({ kind: 'group', stat: 'founders', species: 'B04', group: 'E03+E05' });
    expect(parseMeasure('reservePeak.B01')).toEqual({ kind: 'species', stat: 'reservePeak', species: 'B01' });
    for (const bad of ['', 'biomass', 'biomass.b01', 'field.gold', 'consumed.nutrient', 'converted.sugar', 'patchInput.01', 'deaths.B01.NONE', 'alive.B01.x', 'descendants.B01', 'descendants.B01.e05', 'founders.B01.E05+', 'groupEnergy.X1.none'])
      expect(typeof parseMeasure(bad), bad).toBe('string');
  });

  it('tests A, B, B − A and |B − A| with each operator', () => {
    const A = { x: 2 };
    const B = { x: 5 };
    const r = evaluateGate(
      [
        { measure: 'x', arm: 'A', op: 'eq', value: 2 },
        { measure: 'x', arm: 'B', op: 'gt', value: 4 },
        { measure: 'x', arm: 'diff', op: 'gte', value: 3 },
        { measure: 'x', arm: 'absDiff', op: 'lte', value: 3 },
        { measure: 'x', arm: 'A', op: 'ne', value: 5 },
        { measure: 'x', arm: 'A', op: 'lt', value: 2 },
      ],
      { A, B },
    );
    expect(r.clauses.map((c) => [c.actual, c.pass])).toEqual([
      [2, true],
      [5, true],
      [3, true],
      [3, true],
      [2, true],
      [2, false],
    ]);
    expect(r.pass).toBe(false);
    expect(() => evaluateGate([{ measure: 'x', arm: 'B', op: 'gt', value: 0 }], { A, B: null })).toThrow(/arm B/);
    expect(() => evaluateGate([{ measure: 'y', arm: 'A', op: 'gt', value: 0 }], { A, B: null })).toThrow(/not recorded/);
  });
});

// ---------------------------------------------------------------- paired arms: only the declared change

function fieldEqualExcept(a: World, b: World, except: readonly string[]): string[] {
  const diff: string[] = [];
  for (const id of FIELD_IDS) {
    if (except.includes(id)) continue;
    const fa = a.fields[id];
    const fb = b.fields[id];
    if (!fa || !fb) {
      if (fa !== fb) diff.push(id);
      continue;
    }
    for (let i = 0; i < fa.length; i++) if (fa[i] !== fb[i]) {
      diff.push(id);
      break;
    }
  }
  return diff;
}

function sameEntities(a: World, b: World): boolean {
  const sa = serializeWorld(a).entities;
  const sb = serializeWorld(b).entities;
  return JSON.stringify(sa) === JSON.stringify(sb);
}

// Realizing EXP_B runs FIRST_DISH_V1 for 1,200 ticks; the tests below only read these worlds.
const armsCache: Record<string, ExperimentArms> = {};
const armsOf = (id: string) => (armsCache[id] ??= realizeExperimentArms(registry(), id));

describe('paired arms differ only in the declared variable', () => {
  it('EXP_A: copy B omits exactly the starch deposit (0.60 C in each of the 29 patch cells) and nothing else', () => {
    const { A, B, startTick } = realizeExperimentArms(registry(), 'EXP_A');
    expect(startTick).toBe(0);
    expect(fieldEqualExcept(A, B!, ['starch'])).toEqual([]);
    expect(sameEntities(A, B!)).toBe(true);
    const patch = diskCells(64, 64, 3).filter((i) => inMask(i % 128, Math.floor(i / 128)));
    expect(patch).toHaveLength(29);
    for (const i of maskCells()) {
      expect(B!.fields.starch![i]).toBe(0);
      expect(A.fields.starch![i]).toBe(patch.includes(i) ? 0.6 : 0);
    }
    expect(B!.ledger.initial).toEqual(A.ledger.initial);
    expect(A.ledger.inputs.c - B!.ledger.inputs.c).toBeCloseTo(0.6 * 29, 12);
    expect(A.ledger.inputs.n).toBe(B!.ledger.inputs.n);
    expect(Array.from(A.grid.shade)).toEqual(Array.from(B!.grid.shade));
    expect(stateHash(A)).not.toBe(stateHash(B!));
  });

  it('EXP_102: copy B is shade-painted over the whole dish (light × 0.1 → 0.08) and nothing else', () => {
    const { A, B } = realizeExperimentArms(registry(), 'EXP_102');
    expect(fieldEqualExcept(A, B!, [])).toEqual([]);
    expect(sameEntities(A, B!)).toBe(true);
    expect(Array.from(A.grid.lightBase)).toEqual(Array.from(B!.grid.lightBase));
    expect(A.ledger).toEqual(B!.ledger);
    for (const i of maskCells()) {
      expect(A.grid.shade[i]).toBe(1);
      expect(B!.grid.shade[i]).toBe(0.1);
      expect(A.derived.light[i]).toBe(0.8);
      expect(B!.derived.light[i]).toBeCloseTo(0.08, 12);
    }
  });

  it('EXP_B and EXP_106: both arms are copies of one state; B receives only the card’s commands through the command path', () => {
    for (const id of ['EXP_106', 'EXP_B']) {
      const reg = registry();
      const def = reg.experiments[id]!;
      const arms = armsOf(id);
      if (def.change.kind !== 'commands') throw new Error('expected commands');
      expect(arms.startTick).toBe(Math.round(def.change.atSecond * 10));
      // A is the untouched baseline.
      expect(stateHash(arms.A)).toBe(arms.baselineHash);
      const baseLog = arms.A.commands.log.length;
      expect(arms.B!.commands.log.length).toBe(baseLog + def.change.commands.length);
      expect(arms.B!.commands.log.slice(baseLog).map((c) => c.commandId)).toEqual(def.change.commands.map((_, k) => `experiment:${id}:${k + 1}`));
      expect(arms.interventions.map((i) => i.payload)).toEqual(def.change.commands);
      // Replaying the same commands on another copy of the baseline reproduces B exactly.
      const copy = deserializeWorld({ ...serializeWorld(arms.A), worldId: 'replay' });
      def.change.commands.forEach((cmd, k) => applyNow(copy, `experiment:${id}:${k + 1}`, cmd));
      expect(stateHash(copy)).toBe(stateHash(arms.B!));
      expect(stateHash(arms.B!)).not.toBe(arms.baselineHash);
      // B's only additions are the introduced Amoebae and their logged carbon (4 C each).
      const p01 = speciesIndex(arms.B!, 'P01');
      const count = (w: World) => {
        let n = 0;
        for (let i = 0; i < w.ents.highWater; i++) if (w.ents.cols.alive[i] === 1 && w.ents.cols.species[i] === p01) n++;
        return n;
      };
      const added = def.change.commands.reduce((a, c) => a + (c.kind === 'inoculate' ? c.count : 0), 0);
      expect(count(arms.A)).toBe(0);
      expect(count(arms.B!)).toBe(added);
      expect(arms.B!.ledger.inputs.c - arms.A.ledger.inputs.c).toBeCloseTo(4 * added, 12);
      expect(fieldEqualExcept(arms.A, arms.B!, [])).toEqual([]);
    }
  });

  it('EXP_B places its two Amoebae in the two nearest valid cells to (48,64) (distance, then y, then x)', () => {
    const w = armsOf('EXP_B').B!;
    const sp = w.species[speciesIndex(w, 'P01')]!;
    const nearest = diskCells(48, 64, 3)
      .filter((i) => inMask(i % 128, Math.floor(i / 128)) && canOccupy(w, sp, i))
      .sort((a, b) => {
        const d = (i: number) => ((i % 128) - 48) ** 2 + (Math.floor(i / 128) - 64) ** 2;
        return d(a) - d(b) || Math.floor(a / 128) - Math.floor(b / 128) || (a % 128) - (b % 128);
      })
      .slice(0, 2);
    expect(nearest).toEqual([cellIndex(48, 64), cellIndex(48, 63)]);
    const cells: number[] = [];
    for (let i = 0; i < w.ents.highWater; i++) if (w.ents.cols.alive[i] === 1 && w.ents.cols.species[i] === sp.idx) cells.push(entityCell(w.ents.cols.x[i]!, w.ents.cols.y[i]!));
    expect(cells.sort((a, b) => a - b)).toEqual([...nearest].sort((a, b) => a - b));
  });
});

describe('experiment recipes realize exactly what CT §10 describes', () => {
  it('Food trail: two tick-0 strokes cover exactly x 36–80, y 61–67 with 0.50 sugar and 0.20 nutrient per cell', () => {
    const w = realizeRecipe(registry(), 'FOOD_TRAIL_V1');
    expect(w.commands.pending.map((c) => [c.targetTick, c.payload.kind])).toEqual([
      [0, 'deposit'],
      [0, 'deposit'],
    ]);
    stageCommands(w); // stage 1 of tick 0, exactly as the first step applies them
    const trail: number[] = [];
    for (const i of maskCells()) {
      const x = i % 128;
      const y = Math.floor(i / 128);
      const inTrail = x >= 36 && x <= 80 && y >= 61 && y <= 67;
      if (inTrail) trail.push(i);
      if (!transportOpen(w.grid, i)) continue; // the garden's stones hold no inventory
      expect(w.fields.sugar![i]).toBeCloseTo(inTrail ? 0.52 : 0.02, 12); // Water Garden background 0.02
      expect(w.fields.nutrient![i]).toBeCloseTo(inTrail ? 0.3 : 0.1, 12);
    }
    expect(trail).toHaveLength(315);
    const sugarIn = w.ledger.entries.filter((e) => e.source === 'tool:SUGAR');
    const nutIn = w.ledger.entries.filter((e) => e.source === 'tool:NUTRIENT');
    expect(sugarIn.map((e) => e.c)).toEqual([expect.closeTo(157.5, 9)]);
    expect(nutIn.map((e) => e.n)).toEqual([expect.closeTo(63, 9)]);
    expect(w.commands.log.map((c) => c.result)).toEqual([
      { accepted: 315, rejected: 0 },
      { accepted: 315, rejected: 0 },
    ]);
  });

  it('Cleaning crew: 10 detritus C with 1 bound nutrient across the r 6 patch; founders per SPEC §13.1 placement', () => {
    const w = realizeRecipe(registry(), 'CLEANING_CREW_V1');
    const patch = w.ledger.entries.filter((e) => e.source.startsWith('recipe:patch0'));
    expect(patch).toHaveLength(1);
    expect(patch[0]!.c).toBeCloseTo(10, 12);
    expect(patch[0]!.n).toBeCloseTo(1, 12);
    let n = 0;
    for (let i = 0; i < w.ents.highWater; i++) if (w.ents.cols.alive[i] === 1) n++;
    expect(n).toBe(10);
  });
});

describe('determinism of the measurement layer', () => {
  it('a card run twice from scratch gives the identical result: measurements, timeline, gate, stamp, hashes', () => {
    const r = runTwiceIdentical('EXP_103');
    expect(r.gate.reached).toBe(true);
  });
});

describe('running options', () => {
  it('stopAtGate stops at the first second every clause holds and still records the stamp', () => {
    const r = runExperiment(registry(), 'EXP_103', { stopAtGate: true });
    expect(r.gate.reached).toBe(true);
    expect(r.stoppedAtGate).toBe(true);
    expect(r.endTick).toBe(r.gate.reachedAtSecond! * 10);
    expect(r.stamp?.reachedAtSecond).toBe(r.gate.reachedAtSecond);
    // The same card run to its stopping point reaches the gate at the same second.
    const full = runExperiment(registry(), 'EXP_103', { stopAtSecond: 30 });
    expect(full.gate.reachedAtSecond).toBe(r.gate.reachedAtSecond);
    expect(full.endTick).toBe(300);
    expect(full.stoppedAtGate).toBe(false);
  });

  it('a gate that is not reached reports every clause value at the end, with no stamp', () => {
    const r = runExperiment(registry(), 'EXP_103', { stopAtSecond: 1 });
    expect(r.gate.reached).toBe(false);
    expect(r.gate.reachedAtSecond).toBeNull();
    expect(r.stamp).toBeNull();
    expect(r.gate.clauses).toHaveLength(1);
    expect(r.gate.clauses[0]!.actual).toBeGreaterThan(0);
    expect(r.gate.clauses[0]!.actual).toBeLessThan(2);
  });
});
