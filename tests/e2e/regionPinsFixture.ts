/**
 * Phase 5 wave 14 (region pins, D-0128): the two-region fixture dish for tests/e2e/region-pins.spec.ts and
 * tests/worker/dishinfo-regions.test.ts, built in Node by the headless simulation and loaded through the ordinary
 * Import path (no dev flag, no fake UI state; D-0119 "Lab screens are reached by importing a fixture dish built in
 * Node").
 *
 * The dish: FIRST_DISH_V1 (seed 104729) realized under the shipped registry, its recorded habitat given two
 * regions ({ ...WATER_GARDEN, regions }: "Fresh pool" and "Channel", H05's shapes), run 50 ticks, written with
 * buildSaveFile. Only the recorded habitat gains the regions: the world plays exactly as a FIRST_DISH_V1 dish.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { HabitatRegion } from '../../src/sim/content/habitatRules';
import { buildSaveFile } from '../../src/persistence/saveFile';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { step } from '../../src/sim/tick';
import { registry } from '../helpers/world';

export const TWO_REGIONS: HabitatRegion[] = [
  { id: 'FRESH_POOL', label: 'Fresh pool', shape: { kind: 'disk', center: [40, 64], radius: 18 }, anchor: [40, 64] },
  { id: 'CHANNEL', label: 'Channel', shape: { kind: 'rect', x0: 59, x1: 69, y0: 62, y1: 65 }, anchor: [64, 63] },
];

export const PIN_FIXTURE_TICKS = 50;

/** Build the two-region dish and write its save file to `path`. */
export async function writeRegionPinsFixture(path: string): Promise<void> {
  const state = serializeWorld(realizeRecipe(registry(), 'FIRST_DISH_V1', { seed: 104729 }));
  const regions = TWO_REGIONS.map((r) => JSON.parse(JSON.stringify(r)) as HabitatRegion);
  const w = deserializeWorld({ ...state, content: { ...state.content, habitat: { ...state.content.habitat, regions } } });
  for (let t = 0; t < PIN_FIXTURE_TICKS; t++) step(w);
  const { text } = await buildSaveFile(w, { name: 'Two regions', savedAt: '2026-10-15T00:00:00.000Z', recipeId: null });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}
