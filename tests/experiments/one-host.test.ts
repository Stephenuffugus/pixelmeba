/**
 * EXP_105 "One compatible host" (CT §10.1 seed 105; P3.9). ONE_HOST_V1: Water Garden (defaults);
 * 30 Sprinters (B01) nearest-first at (35,64) r 6 with sugar 0.50, 30 Crossfeeders (B05) at (90,64)
 * r 6 with metabolite 0.50, nutrient 0.20 on both patches, and Pinphage (V01) 5 units per patch cell
 * on both; 180 s.
 *
 * Gate: infections.B01 ≥ 1, infections.B05 = 0 and wholeUnitCells.B05 ≥ 1 (a whole unit really sat
 * beside a living Crossfeeder, so "zero B05 infections" is not vacuous). The in-app half ("B01 infection
 * observed") is the player step 'observeInfection'.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { inspectShowsInfection, PlayerSteps, realizeExperimentArms, runExperiment, type ExperimentResult } from '../../src/sim/experiments';
import { ArmObserver, measureArm, stepObserved } from '../../src/sim/pairedRun';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { entityCell } from '../../src/sim/spatial';
import { run, step } from '../../src/sim/tick';
import { DishHost } from '../../src/worker/host';
import type { FromWorker } from '../../src/worker/protocol';
import { registry } from './helpers';

let result: ExperimentResult;
beforeAll(() => {
  result = runExperiment(registry(), 'EXP_105');
}, 300_000);

describe('EXP_105 One compatible host (ONE_HOST_V1, seed 105, 180 s)', () => {
  it('realizes the CT §10.1 setup: 30 B01 and 30 B05 on their own patches, the same Pinphage dose on both', () => {
    const { A } = realizeExperimentArms(registry(), 'EXP_105');
    expect(A.seed).toBe(105);
    const c = A.ents.cols;
    const where: Record<string, number[]> = { B01: [], B05: [] };
    for (let i = 0; i < A.ents.highWater; i++) if (c.alive[i] === 1) where[A.species[c.species[i]!]!.id]!.push(c.x[i]!);
    expect(where.B01).toHaveLength(30);
    expect(where.B05).toHaveLength(30);
    for (const x of where.B01!) expect(Math.abs(x - 35.5)).toBeLessThanOrEqual(6.5);
    for (const x of where.B05!) expect(Math.abs(x - 90.5)).toBeLessThanOrEqual(6.5);
    // Phage: 5 units (0.05 C) in each of the 113 cells of both patches, logged as recipe inputs.
    const v = A.fields.v01!;
    expect(v[64 * 128 + 35]).toBe(5);
    expect(v[64 * 128 + 90]).toBe(5);
    const phage = A.ledger.entries.filter((e) => /^recipe:patch[23]:/.test(e.source));
    expect(phage.map((e) => e.c)).toEqual([expect.closeTo(113 * 0.05, 9), expect.closeTo(113 * 0.05, 9)]);
  });

  it('reaches its gate: Sprinters infected, no Crossfeeder infected, though whole units sat beside them', () => {
    const r = result;
    expect(r.gate.reached, JSON.stringify(r.gate.clauses)).toBe(true);
    expect(r.stamp!.worldKeepsRunning).toBe(true);
    expect(r.stoppedAtGate).toBe(false);
    const A = r.A.reported;
    expect(A['infections.B01']).toBeGreaterThanOrEqual(1);
    expect(A['infections.B05']).toBe(0);
    expect(A['wholeUnitCells.B05']).toBeGreaterThanOrEqual(1);
    expect(A['deaths.B01.DEATH_LYSIS']).toBeLessThanOrEqual(A['infections.B01']!);
    expect(A['deaths.B01.DEATH_LYSIS']).toBeGreaterThan(0);
    expect(r.A.ledger.everyCheckOk).toBe(true);
    expect(r.A.ledger.relErr.c).toBeLessThan(1e-9);
  });

  it('infections.SP counts each newly infected organism once, and wholeUnitCells.SP is the most cells at one tick', () => {
    const reg = registry();
    const w = realizeRecipe(reg, 'ONE_HOST_V1');
    const ids = ['infections.B01', 'infections.B05', 'wholeUnitCells.B01', 'wholeUnitCells.B05'];
    const obs = new ArmObserver(w, { observe: ids });
    const infected = new Set<number>();
    let most = [0, 0];
    for (let t = 0; t < 600; t++) {
      stepObserved(w, obs);
      const c = w.ents.cols;
      const cells = [new Set<number>(), new Set<number>()];
      for (let i = 0; i < w.ents.highWater; i++) {
        if (c.alive[i] !== 1) continue;
        const sp = w.species[c.species[i]!]!.id;
        if (c.infectedBy[i] !== 0) {
          expect(sp).toBe('B01');
          infected.add(c.birthId[i]!);
        }
        const cell = entityCell(c.x[i]!, c.y[i]!);
        if (w.fields.v01![cell]! >= 1) cells[sp === 'B01' ? 0 : 1]!.add(cell);
      }
      most = [Math.max(most[0]!, cells[0]!.size), Math.max(most[1]!, cells[1]!.size)];
    }
    const m = measureArm(w, obs, ids);
    // Lysis takes 20 s and the run is 60 s: every infected Sprinter was seen alive and infected at least once.
    expect(m['infections.B01']).toBe(infected.size);
    expect(m['infections.B05']).toBe(0);
    expect(m['wholeUnitCells.B01']).toBe(most[0]);
    expect(m['wholeUnitCells.B05']).toBe(most[1]);
    expect(most[1]).toBeGreaterThan(0);
  });

  it('player step: only an infected organism the card follows completes "observe an infection"', () => {
    const reg = registry();
    const def = reg.experiments.EXP_105!;
    expect(def.completion.playerSteps).toEqual(['observeInfection']);
    const w = realizeExperimentArms(reg, 'EXP_105').A;
    let infected = -1;
    let healthy = -1;
    let crossfeeder = -1;
    for (let t = 0; t < 100 && infected < 0; t++) {
      step(w);
      const c = w.ents.cols;
      for (let i = 0; i < w.ents.highWater; i++) {
        if (c.alive[i] !== 1) continue;
        const sp = w.species[c.species[i]!]!.id;
        if (sp === 'B01' && c.infectedBy[i] !== 0) infected = c.birthId[i]!;
        else if (sp === 'B01') healthy = c.birthId[i]!;
        else crossfeeder = c.birthId[i]!;
      }
    }
    expect(infected).toBeGreaterThan(0);
    expect(inspectShowsInfection(w, infected, ['B01', 'B05'])).toBe(true);
    expect(inspectShowsInfection(w, healthy, ['B01', 'B05'])).toBe(false);
    expect(inspectShowsInfection(w, crossfeeder, ['B01', 'B05'])).toBe(false);
    expect(inspectShowsInfection(w, infected, ['B05'])).toBe(false);
    const steps = new PlayerSteps(def);
    expect(steps.note('observeInfection')).toBe(true);
    expect(steps.complete).toBe(true);
  });

  it('in the app: the stamp waits for the player to tap an infected Sprinter, then records the gate moment', () => {
    const headless = runExperiment(registry(), 'EXP_105', { stopAtSecond: 5 });
    let now = 0;
    const out: FromWorker[] = [];
    const host = new DishHost(registry(), (m) => out.push(m), { now: () => now, iso: () => '2026-10-10T00:00:00.000Z' });
    host.handle({ type: 'experimentStart', requestId: 1, cardId: 'EXP_105', newDishId: 'host', compare: null });
    expect(out.find((m) => 'requestId' in m && m.requestId === 1)?.type).toBe('experimentStarted');
    host.handle({ type: 'setSpeed', dishId: 'host', speed: 4 });
    const w = () => host.world('host')!;
    while (w().tick < 30) {
      now += 25;
      host.pump();
    }
    host.handle({ type: 'setSpeed', dishId: 'host', speed: 0 });
    const stamps = () => out.filter((m) => m.type === 'experimentStamp');
    expect(headless.stamp!.reachedAtSecond).toBeLessThanOrEqual(2);
    expect(stamps()).toHaveLength(0);
    expect(out.filter((m) => m.type === 'experimentWaiting').at(-1)).toEqual(expect.objectContaining({ cardId: 'EXP_105', missing: ['observeInfection'] }));
    const c = w().ents.cols;
    const view = (birthId: number) => host.handle({ type: 'view', dishId: 'host', overlay: null, selection: { kind: 'entity', birthId } });
    let infected = -1;
    for (let i = 0; i < w().ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      if (c.infectedBy[i] !== 0) infected = c.birthId[i]!;
      else view(c.birthId[i]!); // healthy Sprinters and every Crossfeeder: not the step
    }
    expect(stamps()).toHaveLength(0);
    expect(infected).toBeGreaterThan(0);
    view(infected);
    expect(stamps()).toHaveLength(1);
    expect((stamps()[0] as Extract<FromWorker, { type: 'experimentStamp' }>).stamp.stamp).toEqual(headless.stamp);
  }, 120_000);

  it('measuring is observation: the observed run ends at the same state hash as a plain run', () => {
    const reg = registry();
    const arms = realizeExperimentArms(reg, 'EXP_105');
    const plain = realizeRecipe(reg, 'ONE_HOST_V1');
    for (let t = 0; t < 300; t++) stepObserved(arms.A, arms.obsA);
    run(plain, 300);
    expect(stateHash(arms.A)).toBe(stateHash(plain));
  });
});
