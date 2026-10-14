/**
 * The structure-ui journeys' fixture dish (P5.1/P5.2; D-0119 "Lab screens are reached by importing a fixture
 * dish built in Node against the production build, with no dev flag"). Before the systems flip (D-0104) the
 * only way a player could reach the Build tools was a dish whose OWN recorded manifest has the systems; since
 * the flip (D-0121) a new dish has them too, and the fixture still gives the journeys a known layout. It is
 * built in Node with the test registry (tests/helpers/world.ts barrierRegistry: the shipped manifest, which
 * holds 'barriers', 'climate' and 'devices' and S01–S12), pushes a few edges and devices,
 * runs it 100 ticks and writes it with buildSaveFile, exactly as lineage.spec.ts builds its fixture.
 *
 * Layout (cell coordinates; the dish keeps the Water Garden's two stones, centred near (42, 45) and (83, 82)):
 * - an S02 small gate line on the east edges of x = 70, y 50–60, with a gap at y = 55;
 * - a closed S03 shutter on the east edge of (75, 64); an S04 channel on the east edge of (80, 64), flow +1;
 * - an S09 heater (Off) at (64, 70); an S08 resin selecting the bacterial inhibitor at (60, 70), holding 1.2;
 * - 2.0 sugar on x 66–70, y 50–60 (west of the gate line), so the gate's tally measures sugar crossing.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSaveFile } from '../../src/persistence/saveFile';
import { cellIndex } from '../../src/sim/grid';
import { step } from '../../src/sim/tick';
import { barrierDish, pushDevices, pushEdges, setField, verticalLine } from '../helpers/world';
import { REPO_ROOT } from '../../tools/lib/content-fs';

export const FIXTURE_CELLS = {
  /** The cell west of the S02 line's edge at y = 52 (its east edge is a Small gate). */
  gateCell: [70, 52] as const,
  shutterCell: [75, 64] as const,
  channelCell: [80, 64] as const,
  heaterCell: [64, 70] as const,
  resinCell: [60, 70] as const,
  /** An empty open water cell for a new heater. */
  newHeaterCell: [64, 30] as const,
} as const;

/** Build the fixture and write it to a per-process file; returns the path. */
export async function writeStructureFixture(): Promise<string> {
  const w = barrierDish({ removeStones: false, id: 'TEST_STRUCTURE_UI' });
  const line = verticalLine('S02', 70, 50, 60).filter((e) => e.cell !== cellIndex(70, 55));
  pushEdges(w, [
    ...line,
    { kind: 'S03', cell: cellIndex(...FIXTURE_CELLS.shutterCell), dir: 'R', open: false },
    { kind: 'S04', cell: cellIndex(...FIXTURE_CELLS.channelCell), dir: 'R', flow: 1 },
  ]);
  pushDevices(w, [
    { kind: 'S09', cell: cellIndex(...FIXTURE_CELLS.heaterCell) },
    { kind: 'S08', cell: cellIndex(...FIXTURE_CELLS.resinCell), resinSelect: ['inhBact'], bound: { inhBact: 1.2 } },
  ]);
  // Sugar west of the gate line (logged as an input, as the test helper does), so the gate measures a crossing.
  for (let y = 50; y <= 60; y++) for (let x = 66; x <= 70; x++) setField(w, 'sugar', cellIndex(x, y), 2);
  for (let t = 0; t < 100; t++) step(w);
  const { text } = await buildSaveFile(w, { name: 'Structure fixture', savedAt: '2026-10-14T00:00:00.000Z', recipeId: 'FIRST_DISH_V1' });
  const dir = join(REPO_ROOT, 'tmp', 'e2e-structure-ui');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `structure-fixture-${process.pid}.pixelmeba`);
  writeFileSync(path, text);
  return path;
}
