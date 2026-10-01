/**
 * Expansion experiments E201–E204 (P3.6 part 1; CT §10.3, D02 §21; SPEC §13.2). Seed = numeric id;
 * Water Garden without stones; fixed light 0.8; open lid; radius-6 patches; Standard preset;
 * Identical founders placed nearest-first (D-0022). Each card runs once on the shipped content; the
 * gates read the paired-run measurement grammar (converted.*, intake.SP, consumed.<pool>).
 *
 * Measured outcomes (not forced; docs/reports/experiments-g2.md "E201–E204 (G3)") are asserted as
 * relations, never as hash literals.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/sim/hash';
import { strokeCells } from '../../src/sim/commands';
import { experimentProblems, realizeExperimentArms, runExperiment, type ArmResult, type ExperimentResult } from '../../src/sim/experiments';
import { diskCells, inMask } from '../../src/sim/grid';
import { stateHash } from '../../src/sim/serialize';
import type { World } from '../../src/sim/world';
import { registry } from './helpers';

const results: Record<string, ExperimentResult> = {};
beforeAll(() => {
  for (const id of ['EXP_201', 'EXP_202', 'EXP_203', 'EXP_204']) results[id] = runExperiment(registry(), id);
}, 300_000);

function conserved(arm: ArmResult | null): void {
  expect(arm).not.toBeNull();
  expect(arm!.ledger.ok).toBe(true);
  expect(arm!.ledger.everyCheckOk).toBe(true);
  expect(arm!.ledger.relErr.c).toBeLessThan(1e-5);
  expect(arm!.ledger.relErr.n).toBeLessThan(1e-5);
  expect(arm!.unattributedDeaths).toBe(0);
}

function gateReached(r: ExperimentResult): void {
  expect(r.gate.reached, JSON.stringify(r.gate.clauses)).toBe(true);
  expect(r.gate.clauses.every((c) => c.pass)).toBe(true);
  expect(r.stamp).not.toBeNull();
  expect(r.stamp!.worldKeepsRunning).toBe(true);
  for (const c of r.gate.clauses) expect(r.stamp!.values[`${c.arm}:${c.measure}`]).toBe(c.actual);
  // Completion never stops the world: the run continued to the stopping point.
  expect(r.stoppedAtGate).toBe(false);
  expect(r.endTick).toBe(Math.round(registry().experiments[r.experimentId]!.stoppingSeconds * 10));
}

function living(w: World, speciesId: string): { birthId: number; x: number; y: number }[] {
  const c = w.ents.cols;
  const out: { birthId: number; x: number; y: number }[] = [];
  for (let i = 0; i < w.ents.highWater; i++) {
    if (c.alive[i] !== 1 || w.species[c.species[i]!]!.id !== speciesId) continue;
    out.push({ birthId: c.birthId[i]!, x: c.x[i]!, y: c.y[i]! });
  }
  return out;
}

describe('E201 Shared lunch (SHARED_LUNCH_V1, seed 201, 180 s)', () => {
  it('reaches its gate: ≥ 1 starch carbon converted and ≥ 0.5 carbon eaten by Sprinters', () => {
    const r = results.EXP_201!;
    gateReached(r);
    expect(r.paired).toBe(false);
    expect(r.B).toBeNull();
    const A = r.A.reported;
    expect(A['converted.starch']).toBeGreaterThanOrEqual(1);
    expect(A['intake.B01']).toBeGreaterThanOrEqual(0.5);
    conserved(r.A);
  });

  it('the starch account balances: patch input = starch left + starch converted', () => {
    const A = results.EXP_201!.A.reported;
    // 113 patch cells × 0.50 starch (the nutrient half of the patch is not carbon).
    expect(A['patchInput.0']).toBeCloseTo(0.5 * 113, 9);
    expect(A['field.starch']! + A['converted.starch']!).toBeCloseTo(0.5 * 113, 6);
  });
});

describe('E202 Oil neighborhood (OIL_NEIGHBORHOOD_V1, seed 202, 180 s; single arm)', () => {
  it('reaches its gate: ≥ 1 oil carbon converted; Oilwicks and Crossfeeders both ate metabolite', () => {
    const r = results.EXP_202!;
    gateReached(r);
    const A = r.A.reported;
    expect(A['converted.oil']).toBeGreaterThanOrEqual(1);
    expect(A['intake.B07']).toBeGreaterThan(0);
    expect(A['intake.B05']).toBeGreaterThan(0);
    conserved(r.A);
  });

  it('all metabolite came from the oil: feeding removes it net of the eaters’ own 20 % return', () => {
    const A = results.EXP_202!.A.reported;
    // consumed.* is the net removal by feeding; every eater returns METABOLITE_FRACTION 0.2 of its intake as metabolite.
    expect(A['consumed.metabolite']).toBeCloseTo(0.8 * (A['intake.B07']! + A['intake.B05']!), 9);
    expect(A['field.metabolite']! + A['consumed.metabolite']!).toBeCloseTo(A['converted.oil']!, 6);
    expect(A['field.oil']! + A['converted.oil']!).toBeCloseTo(0.5 * 113, 6);
  });
});

describe('E203 Protein chain (PROTEIN_CHAIN_V1, seed 203, 180 s; B without the Brothmakers)', () => {
  it('reaches its gate in copy A: broth made from protein and Creambuds drank it', () => {
    const r = results.EXP_203!;
    gateReached(r);
    expect(r.change).toEqual({ kind: 'omitFounders', founderIndex: 1 });
    expect(r.A.reported['converted.protein']).toBeGreaterThan(0);
    expect(r.A.reported['intake.Y02']).toBeGreaterThan(0);
    conserved(r.A);
    conserved(r.B);
  });

  it('copy B makes no broth at all, so its Creambuds take nothing in', () => {
    const B = results.EXP_203!.B!.reported;
    expect(B['converted.protein']).toBe(0);
    expect(B['field.broth']).toBe(0);
    expect(B['consumed.broth']).toBe(0);
    expect(B['intake.Y02']).toBe(0);
    expect(B['intake.B08']).toBe(0);
    expect(B['field.protein']).toBeCloseTo(0.5 * 113, 9);
  });

  it('every Creambud keeps copy A’s cell and birth id in copy B; only the Brothmakers are missing', () => {
    const arms = realizeExperimentArms(registry(), 'EXP_203');
    const yA = living(arms.A, 'Y02');
    const yB = living(arms.B!, 'Y02');
    expect(yA).toHaveLength(10);
    expect(canonicalJson(yB)).toBe(canonicalJson(yA));
    expect(living(arms.A, 'B08')).toHaveLength(20);
    expect(living(arms.B!, 'B08')).toHaveLength(0);
    expect(stateHash(arms.A)).not.toBe(stateHash(arms.B!));
  });

  it('only the last founder group can be omitted (earlier groups keep their places and birth ids)', () => {
    const reg = registry();
    const def = reg.experiments.EXP_203!;
    const ctx = { species: reg.species, materials: reg.materials, manifest: reg.manifest };
    expect(experimentProblems(def, reg.recipes[def.recipeId], ctx)).toEqual([]);
    const first = experimentProblems({ ...def, change: { kind: 'omitFounders', founderIndex: 0 } }, reg.recipes[def.recipeId], ctx);
    expect(first.map((p) => p.path)).toEqual(['change.founderIndex']);
    expect(first[0]!.message).toMatch(/only the last founder group/);
    const missing = experimentProblems({ ...def, change: { kind: 'omitFounders', founderIndex: 2 } }, reg.recipes[def.recipeId], ctx);
    expect(missing.map((p) => p.path)).toEqual(['change.founderIndex']);
  });
});

describe('E204 Broken catalyst (BROKEN_CATALYST_V1, seed 204, 120 s; B gets enzyme breaker 4 per cell)', () => {
  it('the breaker stroke covers exactly the patch disk, and copy B alone receives it at 0 s', () => {
    const r = results.EXP_204!;
    const stroke = strokeCells([[45.5, 64.5]], 6).sort((a, b) => a - b);
    const patch = diskCells(45, 64, 6)
      .filter((i) => inMask(i % 128, Math.floor(i / 128)))
      .sort((a, b) => a - b);
    expect(stroke).toEqual(patch);
    expect(r.startTick).toBe(0);
    expect(r.interventions).toHaveLength(1);
    expect(r.interventions[0]!.result!.accepted).toBe(113);
    expect(r.B!.reported.interventionAccepted).toBe(113);
  });

  it('reaches its gate (both copies ran 120 s) and reports converted starch B − A, measured', () => {
    const r = results.EXP_204!;
    gateReached(r);
    conserved(r.A);
    conserved(r.B);
    const a = r.A.reported['converted.starch']!;
    const b = r.B!.reported['converted.starch']!;
    expect(a).toBeGreaterThan(0);
    // The measured comparison (D02 §21). Breaker 4 divides effective activity by up to 5 where it lies;
    // it spreads and fades, so the measured ratio is not 1/5. On this content B converted less.
    expect(b - a).toBeLessThan(0);
    expect(b).toBeGreaterThan(0);
  });
});

describe('E201–E204 determinism', () => {
  it('a card run twice from scratch gives identical results', () => {
    expect(canonicalJson(runExperiment(registry(), 'EXP_202'))).toBe(canonicalJson(results.EXP_202));
  });
});
