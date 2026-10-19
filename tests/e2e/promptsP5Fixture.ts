/**
 * P5.6 part 3: the fixture dishes for tests/e2e/prompts-p5.spec.ts, built in Node by the headless simulation and
 * loaded through the ordinary Import path (no dev flag, no fake UI state; D-0119).
 *
 * - `writeBrineCommunityFixture`: an H05 Brine Mosaic New Dish start with its Suggested Community (5 Sprinters in
 *   the fresh pool, 5 Brinecoils in the brine pool), run 20 ticks, no notebook: it offers "Two neighborhoods" and
 *   lists the habitat's regions in the challenge editor.
 * - `writeNearlyHeldFixture`: BRINE_CROSSING_V1 with Two neighborhoods started at tick 0 by the worker's own goal
 *   runner (src/worker/goals.ts) and two Feed strokes in the fresh pool at 60 s and 110 s, run to 179 s: the hold
 *   is real (measured since 0:00, tests/sim/objectives-p5.test.ts: completed at 1800), so the goal completes one
 *   simulated second after the import is run, through the one notice slot.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { applyNow, type CommandPayload } from '../../src/sim/commands';
import { realizeRecipe } from '../../src/sim/recipes';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { buildSaveFile } from '../../src/persistence/saveFile';
import { emptyNotebook, sealNotebook, type NotebookRecord } from '../../src/persistence/notebook';
import { GoalRunner } from '../../src/worker/goals';
import { habitatStart } from '../helpers/habitats';
import { registry } from '../helpers/world';

const SAVED_AT = '2026-10-18T00:00:00.000Z';
export const NEARLY_HELD_TICK = 1790;
const sugarStroke = (cx: number): CommandPayload => ({ kind: 'deposit', materialId: 'SUGAR', points: [[cx - 8, 64], [cx, 56], [cx + 8, 64], [cx, 72], [cx, 64]], radius: 6, dose: 0.5 });

async function write(path: string, w: World, name: string, notebook: NotebookRecord | null): Promise<void> {
  const { text } = await buildSaveFile(w, { name, savedAt: SAVED_AT, recipeId: null }, notebook ? { notebook: await sealNotebook(notebook), includeNicknames: true } : undefined);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export async function writeBrineCommunityFixture(path: string): Promise<void> {
  const w = habitatStart(registry(), 'H05_BRINE_MOSAIC', { community: true });
  for (let t = 0; t < 20; t++) step(w);
  await write(path, w, 'Brine neighborhoods', null);
}

export async function writeNearlyHeldFixture(path: string): Promise<void> {
  const reg = registry();
  const w = realizeRecipe(reg, 'BRINE_CROSSING_V1', { worldId: 'prompts-nearly-held' });
  let record = emptyNotebook(w.worldId);
  const ref = { get: () => record, set: (r: NotebookRecord) => (record = r) };
  const runner = new GoalRunner(w, ref);
  const started = runner.start(w, reg.objectives.TWO_NEIGHBORHOODS!, true);
  if (started.refused !== null) throw new Error(started.refused);
  while (w.tick < NEARLY_HELD_TICK) {
    step(w, { afterStage: runner.hook });
    runner.afterTick(w);
    if (w.tick === 600 || w.tick === 1100) {
      if (!(applyNow(w, `feed-${w.tick}`, sugarStroke(40)).result?.accepted ?? 0)) throw new Error('feed refused');
      runner.afterTick(w);
    }
  }
  const g = record.goals?.[0];
  if (!g || g.state !== 'running' || g.progress.holdSinceTick !== 0) throw new Error(`the hold did not run: ${JSON.stringify(g)}`);
  await write(path, w, 'Two neighborhoods, nearly', record);
}
