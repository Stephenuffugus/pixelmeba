/**
 * Experiment C "Why variation can matter" (CT §9.2 RESERVE_COMPARE_V1, §10.2 EXP_C; D06 §8, §11) —
 * a Seeded traits demonstration. Clear water, 24 Sprinters nearest (64,64) within r 3, odd founders
 * carry a reserve chamber (E05) present at creation, even founders none, all at 50 E; one sugar meal
 * (0.50 per cell within r 6); Fixed Traits; seed 104729. Copy A (control) keeps stable food: the same
 * meal again at 60, 120, 180, 240 and 300 s (the recipe's scheduled commands). Copy B (the
 * intervention) is the finite pulse: the later meals are left out. Both run 600 s.
 *
 * The gate asks for the precondition of the card's question ("whether storing surplus changes
 * outcomes when food stops"): in the single-meal copy a reserve chamber must actually hold energy
 * above the normal cap. On V1 it never does. D06 §11 anticipates this ("the initial recipe may fail
 * to charge reserves enough to show a difference; that is a tuning finding"), so this fixture records
 * the measured limiting factor instead; no mechanic, constant or recipe number was changed.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { ENERGY_CAP_BASE, INITIAL_ENERGY } from '../../src/sim/constants';
import { experimentCardView, realizeExperimentArms, type ExperimentResult } from '../../src/sim/experiments';
import { cellIndex, diskCells, inMask, maskCells } from '../../src/sim/grid';
import { field as lineageField } from '../../src/sim/lineage';
import { ArmObserver, measureArm, stepObserved } from '../../src/sim/pairedRun';
import { profileOf } from '../../src/sim/profiles';
import { realizeRecipe } from '../../src/sim/recipes';
import { serializeWorld } from '../../src/sim/serialize';
import { stageCommands } from '../../src/sim/commands';
import type { World } from '../../src/sim/world';
import { expectConserved, expectEqualArms, expectReplayIdentical, registry, runCard, speciesAt } from './helpers';

const PATCH = diskCells(64, 64, 6).filter((i) => inMask(i % 128, Math.floor(i / 128)));

let r: ExperimentResult;
beforeAll(() => {
  r = runCard('EXP_C');
}, 900_000);

function living(w: World): number[] {
  const out: number[] = [];
  for (let i = 0; i < w.ents.highWater; i++) if (w.ents.cols.alive[i] === 1) out.push(i);
  return out;
}

describe('RESERVE_COMPARE_V1 realizes exactly CT §9.2 (a Seeded traits demonstration)', () => {
  it('24 identical Sprinters nearest (64,64) within r 3; odd founders carry E05 present at creation, even none; all at 50 E', () => {
    const reg = registry();
    const recipe = reg.recipes.RESERVE_COMPARE_V1!;
    expect(recipe.labels).toContain('Seeded traits demonstration');
    expect([recipe.seed, recipe.mutationPreset, recipe.founderMode, recipe.removeStones, recipe.lid]).toEqual([104729, 'fixed', 'identical', true, 'open']);
    const w = realizeRecipe(reg, recipe);
    const slots = living(w);
    expect(slots).toHaveLength(24);
    const c = w.ents.cols;
    // Distinct cells, the 24 nearest (64,64) by distance, then y, then x.
    const cells = slots.map((i) => cellIndex(Math.floor(c.x[i]!), Math.floor(c.y[i]!)));
    expect(new Set(cells).size).toBe(24);
    const order = diskCells(64, 64, 3)
      .filter((i) => inMask(i % 128, Math.floor(i / 128)))
      .sort((a, b) => {
        const d = (i: number) => ((i % 128) - 64) ** 2 + (Math.floor(i / 128) - 64) ** 2;
        return d(a) - d(b) || Math.floor(a / 128) - Math.floor(b / 128) || (a % 128) - (b % 128);
      });
    expect([...cells].sort((a, b) => a - b)).toEqual(order.slice(0, 24).sort((a, b) => a - b));
    // Founder ordinal = order of introduction (birthId). Odd → E05, labelled present at creation (origin 2).
    const byBirth = [...slots].sort((a, b) => c.birthId[a]! - c.birthId[b]!);
    byBirth.forEach((i, k) => {
      const modules = w.genomes.get(c.genome[i]!).modules;
      const odd = (k + 1) % 2 === 1;
      expect(modules, `founder ${k + 1}`).toEqual(odd ? ['E05'] : []);
      expect(lineageField(w.lineage, 'origin', c.birthId[i]!)).toBe(odd ? 2 : 1);
      expect(c.E[i]).toBe(INITIAL_ENERGY);
      // E05 raises capacity only: 140 vs 100, same starting energy, same body and neutral loci.
      expect(profileOf(w, i).energyCap).toBe(odd ? ENERGY_CAP_BASE + 40 : ENERGY_CAP_BASE);
      expect(c.B[i]).toBe(c.B[byBirth[0]!]!);
      expect(w.genomes.get(c.genome[i]!).loci.every((v) => v === 50)).toBe(true);
    });
  });

  it('one meal of 0.50 sugar C per water cell within r 6 (113 cells, 56.5 C logged); no other food', () => {
    const w = realizeRecipe(registry(), 'RESERVE_COMPARE_V1');
    expect(PATCH).toHaveLength(113);
    for (const i of maskCells()) expect(w.fields.sugar![i]).toBe(PATCH.includes(i) ? 0.5 : 0);
    for (const f of ['starch', 'detritus'] as const) for (const i of maskCells()) expect(w.fields[f]?.[i] ?? 0).toBe(0);
    const meal = w.ledger.entries.filter((e) => e.source.startsWith('recipe:patch0'));
    expect(meal.map((e) => e.c)).toEqual([expect.closeTo(56.5, 9)]);
  });

  it('the stable-food schedule is five visible scheduled commands, each adding 0.50 to exactly the same 113 cells', () => {
    const w = realizeRecipe(registry(), 'RESERVE_COMPARE_V1');
    expect(w.commands.pending.map((p) => [p.targetTick, p.payload.kind])).toEqual([600, 1200, 1800, 2400, 3000].map((t) => [t, 'deposit']));
    // Apply the first scheduled meal at its tick through stage 1, exactly as the run does.
    const copy = realizeRecipe(registry(), 'RESERVE_COMPARE_V1');
    copy.tick = 600;
    const before = Float64Array.from(copy.fields.sugar!);
    stageCommands(copy);
    const changed = Array.from(maskCells()).filter((i) => copy.fields.sugar![i] !== before[i]);
    expect(changed).toEqual([...PATCH].sort((a, b) => a - b));
    for (const i of PATCH) expect(copy.fields.sugar![i]! - before[i]!).toBeCloseTo(0.5, 12);
    expect(copy.commands.log.at(-1)!.result).toEqual({ accepted: 113, rejected: 0 });
  });
});

describe('Experiment C arms: B differs from A only by the later meals', () => {
  it('copy A is the recipe as written (five meals queued); copy B is identical except the queue is empty', () => {
    const { A, B, startTick, def } = realizeExperimentArms(registry(), 'EXP_C');
    expect(startTick).toBe(0);
    expect(def.change).toEqual({ kind: 'omitScheduled', indexes: [0, 1, 2, 3, 4] });
    expect(A.commands.pending).toHaveLength(5);
    expect(B!.commands.pending).toHaveLength(0);
    const sa = serializeWorld(A);
    const sb = serializeWorld(B!);
    expect(JSON.stringify(sb.entities)).toBe(JSON.stringify(sa.entities));
    expect(JSON.stringify(sb.fields)).toBe(JSON.stringify(sa.fields));
    expect(sb.ledger).toEqual(sa.ledger);
    expect(JSON.stringify(sb.lineage)).toBe(JSON.stringify(sa.lineage));
  });

  it('the card and every view of it carry the "Seeded traits demonstration" label', () => {
    const reg = registry();
    const view = experimentCardView(reg, reg.experiments.EXP_C!);
    expect(view.labels).toContain('Seeded traits demonstration');
    expect(view.intervention.startsWith('Seeded traits demonstration.')).toBe(true);
    expect(view.confounds).toMatch(/present at creation/);
    expect(view.scheduled.map((s) => s.atSecond)).toEqual([60, 120, 180, 240, 300]);
    expect(JSON.stringify(view)).not.toMatch(/superior|advanced|perfect|adapted|immune/i);
  });
});

describe('founder groups follow lineage (checked against an independent walk of parent links)', () => {
  it('descendants per founder group equal the living organisms whose generation-0 ancestor was in that group', () => {
    const w = realizeRecipe(registry(), 'RESERVE_COMPARE_V1');
    const obs = new ArmObserver(w);
    expect(obs.groupKeys).toEqual(['B01.E05', 'B01.none']);
    expect(obs.groupFounders).toEqual([12, 12]);
    for (let t = 0; t < 900; t++) stepObserved(w, obs); // 90 s: the first divisions have happened
    const m = measureArm(w, obs, ['descendants.B01.E05', 'descendants.B01.none', 'births.B01', 'alive.B01']);
    expect(m['births.B01']).toBeGreaterThan(0);
    const c = w.ents.cols;
    const walk = { E05: 0, none: 0 };
    for (const i of living(w)) {
      let id = c.birthId[i]!;
      for (let parent = lineageField(w.lineage, 'parent', id)!; parent !== 0; parent = lineageField(w.lineage, 'parent', id)!) id = parent;
      const g = w.genomes.get(lineageField(w.lineage, 'genome', id)!);
      walk[g.modules.includes('E05') ? 'E05' : 'none']++;
    }
    expect(m['descendants.B01.E05']).toBe(walk.E05);
    expect(m['descendants.B01.none']).toBe(walk.none);
    expect(walk.E05 + walk.none).toBe(m['alive.B01']);
    // Fixed Traits: every E05-group member still carries E05, and no one else does.
    for (const i of living(w)) expect(w.genomes.get(c.genome[i]!).modules.includes('E05')).toBe(obs.groupOfSlot(w, i) === 0);
  });

  it('reserveHeld and reservePeak read energy above the normal cap (labelled test state: one carrier set to 130 E)', () => {
    const w = realizeRecipe(registry(), 'RESERVE_COMPARE_V1');
    const carrier = living(w).find((i) => w.genomes.get(w.ents.cols.genome[i]!).modules.includes('E05'))!;
    w.ents.cols.E[carrier] = 130; // test-only state: a charged reserve (the recipe never reaches it; see below)
    const obs = new ArmObserver(w);
    stepObserved(w, obs);
    const held = w.ents.cols.E[carrier] - ENERGY_CAP_BASE;
    expect(held).toBeGreaterThan(29);
    const m = measureArm(w, obs, ['reserveHeld.B01', 'reservePeak.B01']);
    expect(m['reserveHeld.B01']).toBeCloseTo(held, 12);
    expect(m['reservePeak.B01']).toBeCloseTo(held, 12);
  });
});

describe('Experiment C — Why variation can matter (RESERVE_COMPARE_V1 r1, seed 104729, 600 s)', () => {
  it('both copies ran 600 s, but the gate is not reached: no reserve chamber ever held energy above the normal cap', () => {
    expect(r.label).toBe('this paired run');
    expect(r.endTick).toBe(6000);
    expect(r.gate.reached).toBe(false);
    expect(r.stamp).toBeNull();
    expect(r.gate.clauses.map((c) => [c.measure, c.arm, c.actual, c.pass])).toEqual([
      ['runSeconds', 'A', 600, true],
      ['reservePeak.B01', 'B', 0, false],
    ]);
  });

  it('conserves carbon, nutrient and mineral in both copies; the copies advance equally', () => {
    expectConserved(r.A);
    expectConserved(r.B);
    expectEqualArms(r);
  });

  it('replays identically from scratch; copy A is the recipe as written (the untouched dish)', () => {
    expectReplayIdentical(r);
  }, 900_000);

  it('reports founder groups, food, births and deaths; the stable meals are exact logged inputs in A only', () => {
    const A = r.A.reported;
    const B = r.B!.reported;
    for (const m of [A, B]) {
      expect(m['founders.B01.E05']).toBe(12);
      expect(m['founders.B01.none']).toBe(12);
      // Sprinters are the only sugar eaters: food eaten = sugar removed from the dish.
      expect(m['consumed.sugar']).toBeCloseTo(m['intake.B01']!, 9);
      expect(m['descendants.B01.E05']! + m['descendants.B01.none']!).toBe(m['alive.B01']);
      expect(m['deaths.B01.DEATH_STARVATION']).toBe(m['deaths.B01']);
    }
    expect(A['inputCarbon']).toBeCloseTo(5 * 0.5 * 113, 9);
    expect(B['inputCarbon']).toBe(0);
    expect(A['field.sugar']).toBeCloseTo(56.5 + A['inputCarbon']! - A['consumed.sugar']!, 9);
    expect(B['field.sugar']).toBeCloseTo(56.5 - B['consumed.sugar']!, 9);
    expect(A['intake.B01']).toBeGreaterThan(B['intake.B01']!);
  });

  it('records the measured limiting factor: energy never exceeds the normal cap, food access limits intake, both groups die out', () => {
    for (const arm of [r.A, r.B!]) {
      const m = arm.measurements;
      // The chamber's extra room was never used in either copy, at the end of any tick.
      expect(m['reservePeak.B01']).toBe(0);
      // The leading intake limit of every living Sprinter at every sample from 30 s is food access.
      for (const s of arm.timeline.filter((x) => x.second >= 30)) {
        const b01 = speciesAt(s, 'B01');
        if (b01 && b01.alive > 0) expect(b01.limits, `${s.second} s`).toEqual({ FOOD_ACCESS_LOW: 1 });
      }
      // Mean energy peaks below the 100 E cap (first sample after the meal) and falls from there.
      const peak = Math.max(...arm.timeline.map((s) => speciesAt(s, 'B01')?.meanE ?? 0));
      expect(peak).toBeLessThan(ENERGY_CAP_BASE);
      // Both founder groups died out, every death by starvation.
      expect(m['descendants.B01.E05']).toBe(0);
      expect(m['descendants.B01.none']).toBe(0);
      expect(m['groupExtinctAt.B01.E05']).toBeGreaterThan(0);
      expect(m['groupExtinctAt.B01.none']).toBeGreaterThan(0);
      expect(m['extinctAt.B01']).toBe(Math.max(m['groupExtinctAt.B01.E05']!, m['groupExtinctAt.B01.none']!));
      expect(m['deaths.B01.DEATH_STARVATION']).toBe(m['deaths.B01']);
    }
    // The single-meal copy died out first.
    expect(r.B!.measurements['extinctAt.B01']).toBeLessThan(r.A.measurements['extinctAt.B01']!);
  });
});
