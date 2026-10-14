/**
 * Phase 5 wave 11 region-charts-gates: the membrane fixture dish for tests/e2e/region-charts.spec.ts,
 * built in Node by the headless simulation and loaded through the ordinary Import path (no dev flag, no
 * fake UI state; D-0119 "Lab screens are reached by importing a fixture dish built in Node").
 *
 * The dish: clear water under the barrier test registry (the shipped manifest plus 'barriers', 'climate'
 * and 'devices' and S01–S12; tests/helpers/world.ts barrierRegistry), lid closed, a fine membrane (S01)
 * on the R edges of column 63 from rim to rim, sugar 1.0 on its left half, two Sprinters on each side,
 * run 200 ticks, written with buildSaveFile.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { cellX, maskCells } from '../../src/sim/grid';
import { step } from '../../src/sim/tick';
import { buildSaveFile } from '../../src/persistence/saveFile';
import { barrierDish, place, pushEdges, setField, verticalLine } from '../helpers/world';

export const FIXTURE_TICKS = 200;

/** Build the membrane dish and write its save file to `path`. */
export async function writeMembraneFixture(path: string): Promise<void> {
  const w = barrierDish({ lid: 'closed', backgroundOverrides: { sugar: 0 } });
  pushEdges(w, verticalLine('S01', 63, 0, 127));
  for (const cell of maskCells()) if (cellX(cell) <= 63) setField(w, 'sugar', cell, 1);
  for (const [x, y] of [
    [48.5, 60.5],
    [52.5, 70.5],
    [76.5, 60.5],
    [80.5, 70.5],
  ] as const)
    place(w, 'B01', x, y);
  for (let t = 0; t < FIXTURE_TICKS; t++) step(w);
  const { text } = await buildSaveFile(w, { name: 'Membrane regions', savedAt: '2026-10-14T00:00:00.000Z', recipeId: null });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}
