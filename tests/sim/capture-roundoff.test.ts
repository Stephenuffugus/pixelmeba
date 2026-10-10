/**
 * A whole-body capture splits the prey's nutrient as takeN = N*take/B. With take === B that can round
 * one ulp above N, so the overflow N - takeN is about −1.4e-17, and on an empty detritus cell
 * detritusN is left a few ulps below zero. The game saved that state itself, but parseSaveFile (and
 * the held-sample check) refused any negative field ("Field detritusN has an invalid value at cell …"),
 * so an autosave could be unloadable. Flip verifier MAJOR (docs/reports/reviews/g3-flip/flip-verify.md).
 *
 * The simulation is deliberately unchanged (changing the split moves recorded trajectories: the wave-A
 * EXP_B golden). The import instead accepts a roundoff negative, bit for bit (src/sim/fieldValue.ts),
 * so the loaded world continues exactly; a real negative pool is still refused.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import type { CommandPayload } from '../../src/sim/commands';
import { applyNow } from '../../src/sim/commands';
import { consumePrey } from '../../src/sim/contacts';
import { FIELD_ROUNDOFF } from '../../src/sim/fieldValue';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { entityCell } from '../../src/sim/spatial';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { clearWater, place, registry, setField } from '../helpers/world';

const meta = { name: 'capture roundoff', savedAt: '2026-10-10T00:00:00Z', recipeId: null };

function negativeCells(w: World): number[] {
  const out: number[] = [];
  for (const a of Object.values(w.fields)) {
    if (!a) continue;
    for (let i = 0; i < a.length; i++) if (a[i]! < 0) out.push(a[i]!);
  }
  return out;
}

/** Save, load, compare hashes; then both copies run 50 ticks and still agree. */
async function roundTrip(w: World): Promise<void> {
  const { text } = await buildSaveFile(w, meta);
  const loaded = (await loadSaveFile(text)).world;
  expect(stateHash(loaded)).toBe(stateHash(w));
  run(w, 50);
  run(loaded, 50);
  expect(stateHash(loaded)).toBe(stateHash(w));
}

/** Labelled test state: a Hunter takes a whole prey of B 0.3, N 0.11 on an empty debris cell. */
function wholeCaptureOnEmptyCell(): { w: World; cell: number } {
  const B = 0.3;
  const N = 0.11;
  expect((N * B) / B).toBeGreaterThan(N); // the roundoff this test exists for
  const w = clearWater();
  const prey = place(w, 'B01', 40.5, 64.5, { B, N });
  const pred = place(w, 'P01', 42.5, 64.5);
  const c = w.ents.cols;
  c.mealC[prey] = 0;
  c.mealN[prey] = 0;
  c.mealC[pred] = 0;
  c.mealN[pred] = 0;
  const cell = entityCell(c.x[prey]!, c.y[prey]!);
  setField(w, 'detritus', cell, 0);
  setField(w, 'detritusN', cell, 0);
  consumePrey(w, pred, prey);
  expect(c.alive[prey]).toBe(0);
  expect(c.mealC[pred]).toBe(B); // the whole body was taken
  return { w, cell };
}

describe('a roundoff-negative field left by a whole-body capture saves and loads exactly', () => {
  it('labelled test state: the cell is a few ulps below zero, and the save loads and continues identically', async () => {
    const { w, cell } = wholeCaptureOnEmptyCell();
    const v = w.fields.detritusN![cell]!;
    expect(v).toBeLessThan(0);
    expect(v).toBeGreaterThanOrEqual(-FIELD_ROUNDOFF);
    await roundTrip(w);
  });

  it('a sample holding that cell (Deposits) saves and loads exactly', async () => {
    const { w, cell } = wholeCaptureOnEmptyCell();
    const take: CommandPayload = { kind: 'sampleTake', x: 40.5, y: 64.5, radius: 1, mode: 'deposits' };
    expect(applyNow(w, 'take', take).result!.accepted).toBeGreaterThan(0);
    expect(w.fields.detritusN![cell]).toBe(0); // the value left the cell exactly…
    const held = w.sample!.cells.map((c) => c.fields.detritusN ?? 0);
    expect(held.some((x) => x < 0)).toBe(true); // …and the sample holds the roundoff negative
    await roundTrip(w);
  });

  it("the verifier's repro: FIRST_DISH_V1 seed 104729 with one Hunter inoculated at tick 20", async () => {
    const w = realizeRecipe(registry(), 'FIRST_DISH_V1', { seed: 104729, worldId: 'neg' });
    run(w, 20);
    applyNow(w, 'amoeba', { kind: 'inoculate', speciesId: 'P01', x: 46.5, y: 64.5, radius: 1, count: 1 } as never);
    run(w, 40);
    const neg = negativeCells(w);
    expect(neg.length).toBeGreaterThan(0); // tick 24's capture left a debris-nutrient cell below zero
    for (const v of neg) expect(v).toBeGreaterThanOrEqual(-FIELD_ROUNDOFF);
    await roundTrip(w);
  });

  it('a genuinely negative pool is still refused, and nothing is built', async () => {
    const w = clearWater();
    const cell = entityCell(40.5, 64.5);
    w.fields.detritusN![cell] = -1e-9; // a damaged save, far beyond roundoff
    const { text } = await buildSaveFile(w, meta);
    await expect(loadSaveFile(text)).rejects.toThrow(`Field detritusN has an invalid value at cell ${cell}.`);
  });
});
