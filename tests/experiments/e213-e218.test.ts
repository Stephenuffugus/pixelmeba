/**
 * P5.6 expansion cards E213–E218 (CT §10.3; D02 §21–22; g5-briefs E1, E2; D-0131). Each card validates under the
 * SHIPPED registry and runs headless from its recipe (runExperiment) to its gate; the gate second and the clause
 * values are pinned with the recipe revision that reached them. Two recipes needed a revision (E213 and E214,
 * revision 2): their revision 1 geometry is kept here as a transform, and the MEASURED limiting factor it shows
 * is pinned, so the reason for the revision stays checkable. Nothing is scripted: every gate clause is a count of
 * what the rules recorded. Every run twice gives identical canonical results.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { RecipeDef } from '../../src/sim/content/schema';
import { CONTACT_DISTANCE } from '../../src/sim/constants';
import { experimentProblems, realizeExperimentArms, runExperiment, type ExperimentResult } from '../../src/sim/experiments';
import { cellIndex, inMask } from '../../src/sim/grid';
import { canonicalJson } from '../../src/sim/hash';
import { realizeRecipe } from '../../src/sim/recipes';
import { entityCell } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { registry } from './helpers';

const CARDS = ['EXP_213', 'EXP_214', 'EXP_215', 'EXP_216', 'EXP_217', 'EXP_218'] as const;
const results: Record<string, ExperimentResult> = {};
beforeAll(() => {
  for (const id of CARDS) results[id] = runExperiment(registry(), id);
}, 600_000);

const ctx = () => ({ species: registry().species, materials: registry().materials, manifest: registry().manifest, habitats: registry().habitats });
const clauseValues = (r: ExperimentResult) => r.gate.clauses.map((c) => c.actual);

/** Living organisms of species `sp` (slots, in slot order). */
function slotsOf(w: World, sp: string): number[] {
  const c = w.ents.cols;
  const out: number[] = [];
  for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && w.species[c.species[i]!]!.id === sp) out.push(i);
  return out;
}

/** Sorted cells of living `sp`. */
function cellsOf(w: World, sp: string): number[] {
  const c = w.ents.cols;
  return slotsOf(w, sp)
    .map((i) => entityCell(c.x[i]!, c.y[i]!))
    .sort((a, b) => a - b);
}

/** A recipe's revision 1 setup, rebuilt from revision 2 by a transform (realizeRecipe's `transform`). */
function revision1(id: string, extra: RecipeDef['founders'][number]): (r: RecipeDef) => RecipeDef {
  return (r) => {
    expect(r.id).toBe(id);
    return { ...r, revision: 1, scheduledCommands: [], founders: [...r.founders, extra] };
  };
}

describe('E213–E218: content', () => {
  it('every card validates under the shipped registry, is phase 5 and uses its number as seed', () => {
    for (const id of CARDS) {
      const def = registry().experiments[id]!;
      expect(def.phase).toBe(5);
      expect(def.seed).toBe(Number(id.slice(4)));
      expect(registry().recipes[def.recipeId]!.seed).toBe(def.seed);
      expect(registry().recipes[def.recipeId]!.phase).toBe(5);
      expect(experimentProblems(def, registry().recipes[def.recipeId], ctx()), id).toEqual([]);
    }
  });

  it('revisions: E213 and E214 at revision 2 (the measured limiting factors below), the other four at revision 1', () => {
    const rev = (id: string) => registry().recipes[registry().experiments[id]!.recipeId]!.revision;
    expect(CARDS.map((id) => [id, rev(id)])).toEqual([
      ['EXP_213', 2],
      ['EXP_214', 2],
      ['EXP_215', 1],
      ['EXP_216', 1],
      ['EXP_217', 1],
      ['EXP_218', 1],
    ]);
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

describe('E213 A temporary trap (revision 2)', () => {
  it('revision 1’s limiting factor: a Siltworm in the nearest other cell never entered the Traplace’s cell in 12 s', () => {
    // Founders never share a cell (SPEC 13.1), so revision 1 placed the P04 by 'nearest' at (64,63). The trap is
    // built at once, but capture needs the target's centre in the owner's own cell (D-0124), and this Siltworm
    // wandered in y 62–63.8 without crossing into row 64.
    const w = realizeRecipe(registry(), 'TEMPORARY_TRAP_V1', {
      transform: revision1('TEMPORARY_TRAP_V1', { species: 'P04', count: 1, center: [64, 64], radius: 1, placement: 'nearest', modules: [], moduleAssignment: 'all', label: 'Siltworm' }),
    });
    const p04 = slotsOf(w, 'P04')[0]!;
    expect(entityCell(w.ents.cols.x[p04]!, w.ents.cols.y[p04]!)).toBe(cellIndex(64, 63));
    let maxY = 0;
    for (let t = 0; t < 120; t++) {
      step(w);
      expect(entityCell(w.ents.cols.x[p04]!, w.ents.cols.y[p04]!)).not.toBe(cellIndex(64, 64));
      maxY = Math.max(maxY, w.ents.cols.y[p04]!);
    }
    expect(w.events.totals.trapArmed).toBe(1);
    expect(w.events.totals.trapHold ?? 0).toBe(0);
    expect(maxY).toBeLessThan(64);
    expect(maxY).toBeGreaterThan(63.7);
  });

  it('revision 2 (the Siltworm added in the Traplace’s own cell at 0 s): built, held, drained, released at 9 s; the Siltworm lives', () => {
    const r = results.EXP_213!;
    expect(r.gate.reachedAtSecond).toBe(9);
    const [armed, hold, release, intake] = clauseValues(r);
    expect([armed, hold, release]).toEqual([1, 1, 1]);
    expect(intake).toBeCloseTo(0.24, 9);
    expect(r.A.reported['alive.P04']).toBe(1); // no requirement to kill prey
    expect(r.A.reported['biomass.P04']).toBeCloseTo(7.76, 9);
    const w = realizeRecipe(registry(), 'TEMPORARY_TRAP_V1');
    step(w);
    expect(cellsOf(w, 'P04')).toEqual([cellIndex(64, 64)]);
    expect(cellsOf(w, 'F03')).toEqual([cellIndex(64, 64)]);
  });
});

describe('E214 Shell handling (revision 2, test-only override)', () => {
  it('revision 1’s limiting factor: neighbouring cell centres are 1.0 apart, beyond the 0.5 contact reach, so no attempt starts', () => {
    const w = realizeRecipe(registry(), 'SHELL_HANDLING_V1', {
      transform: revision1('SHELL_HANDLING_V1', { species: 'P05', count: 1, center: [64, 64], radius: 1, cells: [[65, 64]], modules: [], moduleAssignment: 'all', label: 'Shellglider' }),
    });
    const [p10] = slotsOf(w, 'P10');
    const [p05] = slotsOf(w, 'P05');
    const c = w.ents.cols;
    for (let t = 0; t < 100; t++) {
      step(w);
      expect(Math.hypot(c.x[p05!]! - c.x[p10!]!, c.y[p05!]! - c.y[p10!]!)).toBe(1);
    }
    expect(CONTACT_DISTANCE).toBe(0.5);
    expect(w.events.totals.handlingStart ?? 0).toBe(0);
    expect(w.events.totals.capture ?? 0).toBe(0);
  });

  it('revision 2: one attempt from the first tick, no break, the capture at 4.0 s and exactly one meal', () => {
    const r = results.EXP_214!;
    expect(r.gate.reachedAtSecond).toBe(4);
    expect(clauseValues(r)).toEqual([1, 4, 1]);
    expect(r.A.reported['events.handlingBreak.P10']).toBe(0);
    expect(r.A.reported['firstCaptureAt.P10']).toBeGreaterThanOrEqual(4);
    expect(r.A.reported['captures.P10']).toBe(1);
    expect(r.A.reported['alive.P05']).toBe(0);
  });

  it('records its overrides in provenance and on the species copies only; the pair stays in contact until the meal', () => {
    const w = realizeRecipe(registry(), 'SHELL_HANDLING_V1');
    const prov = w.content.provenance as typeof w.content.provenance & { testOnlyOverrides?: readonly { target: string; values: Record<string, number> }[] };
    expect(prov.testOnlyOverrides!.map((o) => [o.target, o.values])).toEqual([
      ['species:P10', { speed: 0 }],
      ['species:P05', { speed: 0 }],
    ]);
    const copy = (id: string) => w.content.species.find((s) => s.id === id)!;
    expect([copy('P10').speed, copy('P05').speed]).toEqual([0, 0]);
    expect([registry().species.P10!.speed, registry().species.P05!.speed]).toEqual([1.2, 0.45]);
    step(w); // the scheduled inoculation lands in stage 1 of the first tick
    const [p10] = slotsOf(w, 'P10');
    const [p05] = slotsOf(w, 'P05');
    const c = w.ents.cols;
    const x0 = [c.x[p10!]!, c.y[p10!]!, c.x[p05!]!, c.y[p05!]!];
    expect(Math.hypot(x0[2]! - x0[0]!, x0[3]! - x0[1]!)).toBeLessThanOrEqual(CONTACT_DISTANCE);
    let firstCapture = -1;
    for (let t = 1; t < 100; t++) {
      step(w);
      if (firstCapture < 0 && (w.events.totals.capture ?? 0) > 0) firstCapture = w.tick;
      if (firstCapture < 0) expect([c.x[p10!]!, c.y[p10!]!, c.x[p05!]!, c.y[p05!]!]).toEqual(x0);
    }
    expect(firstCapture / 10).toBeGreaterThanOrEqual(4);
    expect(w.events.totals.capture).toBe(1);
  });
});

describe('E215 Fungal hitchhiker (revision 1)', () => {
  it('each Threadrider starts on a 4-neighbour of one of the first five Cordweavers; arm B has no Cordweaver and the same rider cells', () => {
    const f = registry().recipes.FUNGAL_HITCHHIKER_V1!.founders;
    const hosts = f[0]!.cells!.slice(0, 5);
    f[1]!.cells!.forEach((cell, k) => expect(Math.abs(cell[0] - hosts[k]![0]) + Math.abs(cell[1] - hosts[k]![1]), `rider ${k}`).toBe(1));
    const arms = realizeExperimentArms(registry(), 'EXP_215');
    expect(cellsOf(arms.B!, 'X02')).toEqual(cellsOf(arms.A, 'X02'));
    expect(cellsOf(arms.A, 'X02')).toHaveLength(5);
    expect(cellsOf(arms.A, 'F02')).toHaveLength(10);
    expect(cellsOf(arms.B!, 'F02')).toEqual([]);
  });

  it('omitting the Cordweavers is accepted only because the later Threadrider group lists its cells', () => {
    const rec = registry().recipes.FUNGAL_HITCHHIKER_V1!;
    const scattered: RecipeDef = { ...rec, founders: [rec.founders[0]!, { ...rec.founders[1]!, cells: undefined, placement: 'scatter' }] };
    const problems = (r: RecipeDef) => experimentProblems(registry().experiments.EXP_215!, r, ctx()).map((p) => `${p.path}: ${p.message}`);
    expect(problems(rec)).toEqual([]);
    expect(problems(scattered)).toEqual(['change.founderIndex: only the last founder group, or a group whose later groups all list their cells, can be omitted']);
  });

  it('attachment and drain in copy A; copy B, hostless, has no Threadrider birth over the whole 120 s', () => {
    const r = results.EXP_215!;
    // Fix round 1 (wave-verify-1 MINOR): the gate waits for the full run (runSeconds A >= 120, as EXP_204), so the
    // copy B zero is stamped at the stop, not at 2 s where it was trivially true.
    expect(r.gate.clauses.map((c) => c.measure)).toEqual(['runSeconds', 'attached.X02', 'intake.X02', 'births.X02']);
    expect(r.gate.reachedAtSecond).toBe(120);
    const [run, attached, intake, birthsB] = clauseValues(r);
    expect(run).toBe(120);
    expect(attached).toBe(9);
    expect(intake).toBeCloseTo(13.506, 6);
    expect(birthsB).toBe(0);
    expect(r.A.reported['births.X02']).toBe(5);
    expect(r.A.reported['attached.X02']).toBe(9);
    expect(r.B!.reported['intake.X02']).toBe(0);
    expect(r.B!.reported['alive.F02']).toBe(0);
  });
});

describe('E216 A different host (revision 1)', () => {
  it('the realized dish has 113 S06 mesh devices, one on every open in-dish cell of the radius-6 disk', () => {
    const w = realizeRecipe(registry(), 'DIFFERENT_HOST_V1');
    let open = 0;
    for (let y = 58; y <= 70; y++) for (let x = 58; x <= 70; x++) if ((x - 64) ** 2 + (y - 64) ** 2 <= 36 && inMask(x, y) && w.grid.structure[cellIndex(x, y)] === 0) open++;
    expect(open).toBe(113);
    const mesh = w.devices.filter((d) => d.kind === 'S06');
    expect(mesh).toHaveLength(open);
    expect(w.fields.v02![cellIndex(64, 64)]).toBe(5);
  });

  it('over 180 s Lacephage infected Velvets and never a Sprinter, although Sprinters sat in cells with whole units', () => {
    const r = results.EXP_216!;
    // Fix round 1 (wave-verify-1 MINOR): the gate waits for the full run (runSeconds A >= 180), so the Sprinters'
    // zero is stamped over the whole run, not at 1 s.
    expect(r.gate.clauses.map((c) => c.measure)).toEqual(['runSeconds', 'infections.B02.V02', 'infections.B01.V02', 'wholeUnitCells.B01.V02']);
    expect(r.gate.reachedAtSecond).toBe(180);
    expect(clauseValues(r)).toEqual([180, 20, 0, 20]);
    expect(r.A.reported['infections.B01.V02']).toBe(0);
    expect(r.A.reported['infections.B02.V02']).toBe(20);
    expect(r.A.reported['wholeUnitCells.B01.V02']).toBe(20);
    expect(r.A.reported['alive.B02']).toBe(0); // every Velvet was infected and lysed in this run
    expect(r.A.reported['alive.B01']).toBe(38);
  });
});

describe('E217 Rival without a winner (revision 1)', () => {
  it('180 s: Sprinters met the rivalry chemical and Ramparts secreted in copy A; in copy B (no Ramparts) neither', () => {
    const r = results.EXP_217!;
    expect(r.gate.reachedAtSecond).toBe(180);
    const [run, exposure, secreting] = clauseValues(r);
    expect(run).toBe(180);
    expect(exposure).toBeCloseTo(5564.8, 6);
    expect(secreting).toBeCloseTo(602.5, 6);
    // Recyclers are not a rivalry target (M08 / rivalry.ts RIVAL_TARGETS: B01, B10, B11), so their exposure is 0.
    expect([r.A.reported['limitSeconds.B04.RIVAL_EXPOSURE'], r.B!.reported['limitSeconds.B04.RIVAL_EXPOSURE']]).toEqual([0, 0]);
    expect([r.B!.reported['limitSeconds.B01.RIVAL_EXPOSURE'], r.B!.reported['secretingSeconds.B13'], r.B!.reported['alive.B13']]).toEqual([0, 0, 0]);
    expect([r.A.reported['alive.B01'], r.A.reported['alive.B04'], r.A.reported['alive.B13']]).toEqual([34, 32, 15]);
    expect([r.B!.reported['alive.B01'], r.B!.reported['alive.B04']]).toEqual([34, 26]);
  });
});

describe('E218 Night shift (revision 1)', () => {
  it('runs the light cycle from tick 0', () => {
    const w = realizeRecipe(registry(), 'NIGHT_SHIFT_V1');
    expect(w.settings.lightMode).toBe('cycle');
    expect(w.settings.cycleStartTick ?? 0).toBe(0);
  });

  it('Turnleafs changed mode at 112 s and took carbon both ways; 240 s in all', () => {
    const r = results.EXP_218!;
    expect(r.gate.reachedAtSecond).toBe(112);
    const [switches, photo, sugar] = clauseValues(r);
    expect(switches).toBe(1);
    expect(photo).toBeCloseTo(372.3953621083903, 6);
    expect(sugar).toBeCloseTo(1.7900843026489697, 9);
    expect(r.A.reported['events.modeSwitch.A04']).toBe(2);
    expect(r.A.reported['intakePhoto.A04']).toBeGreaterThan(0);
    expect(r.A.reported['intakeSugar.A04']).toBeGreaterThan(0);
    expect(r.endTick).toBe(2400);
  });
});
