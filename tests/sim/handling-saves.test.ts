/**
 * Phase 5 wave 12, e3-predation: handling state survives save and reload at every transition this task writes
 * (D-0108's general round trip; g5-plan "Carry-overs"). At each point buildSaveFile → loadSaveFile is accepted,
 * the loaded world has the same stateHash, and 300 more ticks give the same stateHash as the uninterrupted run:
 * the attempt-start tick; mid-attempt (5 of 10); the tick before completion; the completion tick; the break
 * tick; a P05 attempt at 39 of 40; a jacketed need; the tick a handler divides mid-attempt (H2); a held Sample
 * holding a handler and its prey (the closure takes both), then committed, and the same cancelled.
 *
 * HANDLING (P10), RADIUS_CAPTURE and DETRITUS_FALLBACK are not yet in IMPLEMENTED_NATIVE_ABILITIES (the lead
 * appends them at the wave 12 integration), so the import would refuse these dishes with "this version of
 * Pixelmeba cannot simulate": this file mocks the list with exactly those three appended (wave 12, e3-predation).
 * The registry uses allowUnimplemented for the same reason.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/sim/content/implemented', async (importOriginal) => {
  const orig = await importOriginal<{ readonly IMPLEMENTED_NATIVE_ABILITIES: readonly string[] }>();
  // Wave 12 (e3-predation): the three abilities this task implements.
  return { ...orig, IMPLEMENTED_NATIVE_ABILITIES: [...new Set([...orig.IMPLEMENTED_NATIVE_ABILITIES, 'DETRITUS_FALLBACK', 'HANDLING', 'RADIUS_CAPTURE'])].sort() };
});

import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { applyNow, type CommandPayload } from '../../src/sim/commands';
import type { SystemFlag } from '../../src/sim/fields';
import { cancelSample } from '../../src/sim/sample';
import { stateHash } from '../../src/sim/serialize';
import { rebuildIndex } from '../../src/sim/spatial';
import { step, type StepHooks } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, place, placeWith, registry } from '../helpers/world';

const shipped = registry().manifest;
const REG_P = registryWith(
  {
    // Not A02–A04 (P09's prey): their abilities belong to e2-light-algae, and this file mocks only its own three.
    enabledSpecies: [...shipped.enabledSpecies, 'P05', 'P06', 'P07', 'P09', 'P10'].sort(),
    enabledSystems: [...shipped.enabledSystems, 'silicate'].sort() as SystemFlag[],
  },
  { allowUnimplemented: true },
);
const meta = { name: 'handling saves', savedAt: '2026-10-14T00:00:00Z', recipeId: null };
const LONG = 300_000;

/**
 * A hook keeping the predator at (64.5, 64.5) and the prey 0.3 east right after stage 4, by birthId (so it
 * names the same organisms in a loaded world), while `inContact(tick)`; 0.8 apart otherwise.
 */
function pinHook(predBirth: number, preyBirth: number, inContact: (tick: number) => boolean = () => true): StepHooks {
  return {
    afterStage: (st, w) => {
      if (st !== 4) return;
      const c = w.ents.cols;
      for (let i = 0; i < w.ents.highWater; i++) {
        if (c.alive[i] !== 1) continue;
        if (c.birthId[i] === predBirth) {
          c.x[i] = 64.5;
          c.y[i] = 64.5;
        } else if (c.birthId[i] === preyBirth) {
          c.x[i] = inContact(w.tick) ? 64.8 : 65.3;
          c.y[i] = 64.5;
        }
      }
      rebuildIndex(w);
    },
  };
}

/** Save and reload `w` through the real import, then run both 300 ticks under `hook`: hashes equal throughout. */
async function roundTrip(w: World, hook: StepHooks = {}): Promise<World> {
  const { text } = await buildSaveFile(w, meta);
  const { world: back } = await loadSaveFile(text);
  expect(stateHash(back)).toBe(stateHash(w));
  for (let t = 0; t < 300; t++) {
    step(w, hook);
    step(back, hook);
  }
  expect(back.tick).toBe(w.tick);
  expect(stateHash(back)).toBe(stateHash(w));
  return back;
}

function duel(preySp = 'P01', preyState: Partial<Record<'B' | 'N' | 'E' | 'H' | 'age', number>> = {}, predState: Partial<Record<'B' | 'N' | 'E' | 'H' | 'age', number>> = { E: 50 }, preyModules: readonly string[] = []) {
  const w = clearWater({}, REG_P);
  const p10 = place(w, 'P10', 64.5, 64.5, predState);
  const prey = preyModules.length > 0 ? placeWith(w, preySp, 64.8, 64.5, preyModules, preyState) : place(w, preySp, 64.8, 64.5, preyState);
  const c = w.ents.cols;
  return { w, p10, prey, hook: pinHook(c.birthId[p10]!, c.birthId[prey]!) };
}

function steps(w: World, n: number, hook: StepHooks): void {
  for (let k = 0; k < n; k++) step(w, hook);
}

describe('handling through save and reload (D-0108 round trip)', () => {
  it('the attempt-start tick', async () => {
    const { w, p10, hook } = duel();
    steps(w, 1, hook);
    expect(w.ents.cols.handlingNeed[p10]).toBe(1);
    expect(w.events.ring.some((e) => e.type === 'handlingStart')).toBe(true);
    await roundTrip(w, hook);
  }, LONG);

  it('mid-attempt (5 of 10)', async () => {
    const { w, p10, hook } = duel();
    steps(w, 5, hook);
    expect(w.ents.cols.handlingProgress[p10]).toBeCloseTo(0.5, 12);
    await roundTrip(w, hook);
  }, LONG);

  it('the tick before completion (9 of 10)', async () => {
    const { w, p10, prey, hook } = duel();
    steps(w, 9, hook);
    expect(w.ents.isAlive(prey)).toBe(true);
    expect(w.ents.cols.handlingProgress[p10]).toBeCloseTo(0.9, 12);
    const back = await roundTrip(w, hook);
    expect(back.events.ring.filter((e) => e.type === 'capture')).toHaveLength(w.events.ring.filter((e) => e.type === 'capture').length);
  }, LONG);

  it('the completion tick', async () => {
    const { w, p10, prey, hook } = duel();
    const birth = w.ents.cols.birthId[prey]!;
    steps(w, 10, hook);
    expect(w.ents.refValid(prey, birth)).toBe(false);
    expect(w.ents.cols.handlingNeed[p10]).toBe(0);
    expect(w.ents.cols.attackCooldown[p10]).toBeGreaterThan(5.8);
    await roundTrip(w, hook);
  }, LONG);

  it('the break tick', async () => {
    const w = clearWater({}, REG_P);
    const p10 = place(w, 'P10', 64.5, 64.5, { E: 50 });
    const prey = place(w, 'P01', 64.8, 64.5);
    const c = w.ents.cols;
    const hook = pinHook(c.birthId[p10]!, c.birthId[prey]!, (t) => t !== 6);
    steps(w, 7, hook);
    expect(c.handlingNeed[p10]).toBe(0);
    expect(w.events.ring.filter((e) => e.type === 'handlingBreak')).toHaveLength(1);
    await roundTrip(w, hook);
  }, LONG);

  it('a P05 attempt at 39 of 40', async () => {
    const { w, p10, hook } = duel('P05');
    steps(w, 39, hook);
    expect(w.ents.cols.handlingNeed[p10]).toBe(4);
    expect(w.ents.cols.handlingProgress[p10]).toBeCloseTo(3.9, 9);
    await roundTrip(w, hook);
  }, LONG);

  it('a jacketed need (c 0.5: 2.5 s), mid-attempt', async () => {
    // The prey carries E11: since the organism flip the import refuses a jacket without it (D-0125, D-0127).
    const { w, p10, prey, hook } = duel('P01', { B: 4 }, { E: 50 }, ['E11']);
    w.ents.cols.jacketMineral[prey] = 0.2;
    w.ledger.inputs.m += 0.2;
    steps(w, 12, hook);
    expect(w.ents.cols.handlingNeed[p10]).toBe(2.5);
    await roundTrip(w, hook);
  }, LONG);

  it('the tick a handler divides mid-attempt (H2: one break, why division; no attempt on either daughter)', async () => {
    const { w, p10, hook } = duel('P01', {}, { E: 75, age: 200 });
    const c = w.ents.cols;
    steps(w, 3, hook);
    expect(c.handlingNeed[p10]).toBe(1);
    // Now big enough to divide (2 × B0 = 24), still hungry (E < 80): test state, logged as an input.
    w.ledger.inputs.c += 25 - c.B[p10]!;
    c.B[p10] = 25;
    c.E[p10] = 75;
    const before = w.events.totals.birth ?? 0;
    step(w, hook);
    expect((w.events.totals.birth ?? 0) - before).toBe(1);
    const br = w.events.ring.filter((e) => e.type === 'handlingBreak');
    expect(br).toHaveLength(1);
    expect(br[0]!.detail!.why).toBe('division');
    expect(br[0]!.detail!.progress as number).toBeCloseTo(0.4, 12);
    for (let i = 0; i < w.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      expect(c.handlingNeed[i]).toBe(0);
      expect(c.handlingProgress[i]).toBe(0);
    }
    await roundTrip(w, hook);
  }, LONG);

  it('a held Sample holding a handler and its prey (the closure takes both); then committed; and the same cancelled', async () => {
    let seq = 0;
    const cmd = (w: World, p: CommandPayload) => applyNow(w, `hs-${++seq}`, p).result!;
    for (const end of ['commit', 'cancel'] as const) {
      const { w, p10, prey, hook } = duel();
      const c = w.ents.cols;
      const predBirth = c.birthId[p10]!;
      const preyBirth = c.birthId[prey]!;
      steps(w, 5, hook);
      expect(c.handlingNeed[p10]).toBe(1);
      // A radius-1 Life sample around the predator's cell; the prey is in the next column's cell too.
      expect(cmd(w, { kind: 'sampleTake', x: 64.5, y: 64.5, radius: 1, mode: 'life' }).accepted).toBeGreaterThan(0);
      const rows = w.sample!.rows;
      expect(rows.map((r) => r.cols.birthId).sort((a, b) => a - b)).toEqual([predBirth, preyBirth].sort((a, b) => a - b));
      expect(rows.find((r) => r.cols.birthId === predBirth)!.cols.handlingNeed).toBe(1);
      // Held: save and reload with the sample in the file (no ticks run while a sample is held).
      const { text } = await buildSaveFile(w, meta);
      const { world: back } = await loadSaveFile(text);
      expect(stateHash(back)).toBe(stateHash(w));
      for (const x of [w, back]) {
        if (end === 'commit') expect(cmd(x, { kind: 'sampleTransfer', dx: 10, dy: 0 }).accepted).toBeGreaterThan(0);
        else cancelSample(x);
        rebuildIndex(x);
      }
      expect(stateHash(back)).toBe(stateHash(w));
      const moved = end === 'commit' ? 10 : 0;
      const shifted = pinHookAt(predBirth, preyBirth, 64.5 + moved);
      await roundTrip(w, shifted);
      // The handler resumes after the commit (cancel: in place; commit: moved by 10 with its prey).
      expect(w.events.ring.some((e) => e.type === 'capture' && e.detail?.handled === 1)).toBe(true);
    }
  }, LONG);
});

/** pinHook with the pair at x0 (after a Transfer of dx). */
function pinHookAt(predBirth: number, preyBirth: number, x0: number): StepHooks {
  return {
    afterStage: (st, w) => {
      if (st !== 4) return;
      const c = w.ents.cols;
      for (let i = 0; i < w.ents.highWater; i++) {
        if (c.alive[i] !== 1) continue;
        if (c.birthId[i] === predBirth) {
          c.x[i] = x0;
          c.y[i] = 64.5;
        } else if (c.birthId[i] === preyBirth) {
          c.x[i] = x0 + 0.3;
          c.y[i] = 64.5;
        }
      }
      rebuildIndex(w);
    },
  };
}
