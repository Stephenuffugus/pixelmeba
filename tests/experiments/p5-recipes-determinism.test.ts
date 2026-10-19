/**
 * Determinism of the Phase 5 experiment recipes (CLAUDE.md "same seed + rules + content + command log ⇒
 * identical state hash at 1×, at 4× and across save/reload"; g5-plan carry-over D-0108: every new recipe gets a
 * buildSaveFile → loadSaveFile round trip at tick 0 and mid-run, so the import never refuses state its rules
 * produce). P5.6 (measures-overrides) registers its seven; cards-curated appends its eight to RECIPES.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { registry } from './helpers';

const RECIPES: readonly string[] = [
  // P5.6 measures-overrides (wave 15): E205–E211.
  'GLOW_THRESHOLD_V1',
  'QUIET_NEIGHBORS_V1',
  'BRINE_CROSSING_V1',
  'GLASS_BUDGET_V1',
  'GATE_MEAL_V1',
  'SLEEPING_SHORTAGE_V1',
  'SHELTERED_LACE_V1',
  // P5.6 cards-curated (wave 15): E213–E218, L302, L305.
  'TEMPORARY_TRAP_V1',
  'SHELL_HANDLING_V1',
  'FUNGAL_HITCHHIKER_V1',
  'DIFFERENT_HOST_V1',
  'RIVAL_NO_WINNER_V1',
  'NIGHT_SHIFT_V1',
  'L302_UNDER_THE_CANOPY',
  'L305_THE_JACKET_GARDEN',
];

const realize = (id: string): World => realizeRecipe(registry(), id, { worldId: `det-${id}` });

async function roundTrip(w: World): Promise<World> {
  const { text } = await buildSaveFile(w, { name: 'Determinism', savedAt: '2026-10-18T00:00:00.000Z', recipeId: w.content.provenance.recipeId });
  return (await loadSaveFile(text)).world;
}

describe('Phase 5 experiment recipes are deterministic at 1×, 4× and across save/reload', () => {
  for (const id of RECIPES) {
    it(`${id}: run 600 = six runs of 100 = 4× chunks; a save at tick 0 and at 300 continues identically`, async () => {
      const straight = realize(id);
      run(straight, 600);
      const end = stateHash(straight);

      const chunked = realize(id);
      for (let k = 0; k < 6; k++) run(chunked, 100);
      expect(stateHash(chunked)).toBe(end);

      // 4×: four steps per frame with the hash observed between frames (what the worker's snapshots read).
      const fast = realize(id);
      const seen: string[] = [];
      while (fast.tick < 600) {
        for (let j = 0; j < 4; j++) step(fast);
        seen.push(stateHash(fast));
      }
      expect(seen.at(-1)).toBe(end);

      // Save and reload at tick 0 (the import accepts what realization wrote) and mid-run.
      const fresh = realize(id);
      const at0 = await roundTrip(fresh);
      expect(stateHash(at0)).toBe(stateHash(fresh));
      run(at0, 300);
      const reloaded = await roundTrip(at0);
      expect(stateHash(reloaded)).toBe(stateHash(at0));
      run(reloaded, 300);
      expect(stateHash(reloaded)).toBe(end);
    }, 240_000);
  }
});

/** Save at tick `at`, reload, and continue to `end`: the same stateHash as the uninterrupted run. */
async function reloadAt(id: string, at: number, end: number): Promise<void> {
  const straight = realize(id);
  run(straight, end);
  const w = realize(id);
  run(w, at);
  const reloaded = await roundTrip(w);
  expect(stateHash(reloaded)).toBe(stateHash(w));
  run(reloaded, end - at);
  expect(stateHash(reloaded)).toBe(stateHash(straight));
}

describe('cards-curated: saves at the states their rules pass through', () => {
  it('NIGHT_SHIFT_V1 saved mid-cycle (tick 1500, the night half) continues identically to 1800', async () => {
    const w = realize('NIGHT_SHIFT_V1');
    run(w, 1500);
    expect(w.events.totals.modeSwitch ?? 0).toBeGreaterThan(0); // past the dusk switch
    await reloadAt('NIGHT_SHIFT_V1', 1500, 1800);
  }, 240_000);

  it('TEMPORARY_TRAP_V1 saved mid-hold (5 ticks after the first trapHold record) continues identically past the release', async () => {
    const w = realize('TEMPORARY_TRAP_V1');
    while ((w.events.totals.trapHold ?? 0) === 0) step(w);
    const at = w.tick + 5;
    run(w, 5);
    expect(w.events.totals.trapRelease ?? 0).toBe(0); // still holding
    await reloadAt('TEMPORARY_TRAP_V1', at, at + 120);
    const after = realize('TEMPORARY_TRAP_V1');
    run(after, at + 120);
    expect(after.events.totals.trapRelease).toBe(1);
  }, 240_000);
});
