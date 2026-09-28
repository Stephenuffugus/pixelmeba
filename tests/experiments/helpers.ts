/** Shared helpers for the experiment fixtures (BUILD_DIRECTIVE P2.5). */
import { expect } from 'vitest';
import type { ContentRegistry, RawPacks } from '../../src/sim/content/registry';
import { canonicalJson } from '../../src/sim/hash';
import { realizeExperimentArms, runExperiment, type ArmResult, type ExperimentResult, type TimelineSample } from '../../src/sim/experiments';
import { loadRawPacksFs, loadRegistryFs } from '../../tools/lib/content-fs';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';

let cached: ContentRegistry | null = null;
export function registry(): ContentRegistry {
  return (cached ??= loadRegistryFs());
}

export function rawPacks(): RawPacks {
  return loadRawPacksFs();
}

/** Deep-copy raw packs and edit one file's data. */
export function mutate(raw: RawPacks, collection: keyof RawPacks, file: string, fn: (d: Record<string, unknown>) => void): RawPacks {
  const r = JSON.parse(JSON.stringify(raw)) as RawPacks;
  const target = r[collection];
  const list = Array.isArray(target) ? (target as { file: string; data: unknown }[]) : [target as { file: string; data: unknown }];
  const f = list.find((x) => x.file.endsWith(`/${file}`));
  if (!f) throw new Error(`no ${file}`);
  fn(f.data as Record<string, unknown>);
  return r;
}

/**
 * Run a card twice from scratch and require identical results (same seed, rules, content and
 * commands ⇒ same measurements, hashes, timeline and gate). Returns the first run.
 */
export function runTwiceIdentical(id: string): ExperimentResult {
  const first = runExperiment(registry(), id);
  const second = runExperiment(registry(), id);
  expect(canonicalJson(second)).toBe(canonicalJson(first));
  return first;
}

export function runCard(id: string): ExperimentResult {
  return runExperiment(registry(), id);
}

/**
 * Determinism by independent replay: each arm is rebuilt from scratch and run with plain steps and no
 * observer; its state hash must equal the experiment's, at the start and at the end. Arm A is also the
 * recipe as written (the untouched dish). With a read-only observer this means the same seed gives
 * the same measurements; framework.test.ts compares two whole results directly.
 */
export function expectReplayIdentical(r: ExperimentResult): void {
  expect(r.A.endHash).toBe(untouchedRecipeHash(r.experimentId, r.endTick));
  const arms = realizeExperimentArms(registry(), r.experimentId);
  expect(stateHash(arms.A)).toBe(r.A.startHash);
  if (r.B) {
    expect(stateHash(arms.B!)).toBe(r.B.startHash);
    run(arms.B!, r.endTick - arms.startTick);
    expect(stateHash(arms.B!)).toBe(r.B.endHash);
  } else expect(arms.B).toBeNull();
}

/** Every ledger check during the run and at the end passed (conservation, SPEC §3.4). */
export function expectConserved(arm: ArmResult | null): void {
  expect(arm).not.toBeNull();
  expect(arm!.ledger.ok).toBe(true);
  expect(arm!.ledger.everyCheckOk).toBe(true);
  expect(arm!.ledger.checks).toBeGreaterThanOrEqual(7); // every 30 s over 180 s, plus the end
  expect(arm!.timeline.every((s) => s.ledgerOk)).toBe(true);
  expect(arm!.ledger.relErr.c).toBeLessThan(1e-5);
  expect(arm!.ledger.relErr.n).toBeLessThan(1e-5);
  expect(arm!.unattributedDeaths).toBe(0);
}

/** The gate was reached, recorded a stamp whose values match the clauses, and the world kept running. */
export function expectGateReached(r: ExperimentResult): void {
  expect(r.gate.reached, JSON.stringify(r.gate.clauses)).toBe(true);
  expect(r.gate.clauses.every((c) => c.pass)).toBe(true);
  expect(r.stamp).not.toBeNull();
  const s = r.stamp!;
  expect(s.experimentId).toBe(r.experimentId);
  expect(s.reachedAtSecond).toBe(r.gate.reachedAtSecond);
  expect(s.worldKeepsRunning).toBe(true);
  for (const c of r.gate.clauses) expect(s.values[`${c.arm}:${c.measure}`]).toBe(c.actual);
  // Completion never stops the world: the run continued to the stopping point.
  expect(r.stoppedAtGate).toBe(false);
  expect(r.endTick).toBe(Math.round(registry().experiments[r.experimentId]!.stoppingSeconds * 10));
  expect(r.label).toBe(r.paired ? 'this paired run' : 'this run');
}

/** Paired arms advanced by equal tick counts and each reports every card measurement. */
export function expectEqualArms(r: ExperimentResult): void {
  expect(r.B).not.toBeNull();
  expect(r.A.measurements.runSeconds).toBe(r.B!.measurements.runSeconds);
  expect(r.A.timeline.map((s) => s.second)).toEqual(r.B!.timeline.map((s) => s.second));
  const ids = registry().experiments[r.experimentId]!.measurements;
  expect(Object.keys(r.A.reported).sort()).toEqual([...ids].sort());
  expect(Object.keys(r.B!.reported).sort()).toEqual([...ids].sort());
}

export function speciesAt(sample: TimelineSample, id: string) {
  return sample.species.find((s) => s.id === id);
}

/**
 * Hash of the card's recipe realized and run with no experiment code attached, to the same tick.
 * Arm A must equal it: observation never changes a world, and A is the recipe as written.
 */
export function untouchedRecipeHash(experimentId: string, ticks: number): string {
  const reg = registry();
  const def = reg.experiments[experimentId]!;
  const w = realizeRecipe(reg, def.recipeId, { seed: def.seed });
  run(w, ticks);
  return stateHash(w);
}
