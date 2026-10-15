/**
 * The organism-ui journeys' fixture dishes (wave 13 org-ui, P5.7; D-0119 "Lab screens are reached by importing a
 * fixture dish built in Node against the production build, with no dev flag", as structureFixture.ts and
 * lineage.spec.ts do). Nothing is enabled before the organism flip (D-0104), so a Phase 5 organism reaches the
 * screen only through a dish whose OWN recorded manifest names it. Each dish is a clear-water dish built with a
 * test registry, stepped by the simulation (no state set by hand: the signal is held at 0.5 in the glow cell by a
 * stage hook, as tests/fixtures/signal-glow.test.ts holds it, and the glow then turns on by its own rule), saved
 * with buildSaveFile, and imported through Saved dishes → Import.
 *
 * ORGANISM fixture (abilities this build implements: SIGNAL_GLOW, MIXOTROPHY, HANDLING; systems signals, rivalry):
 * - a glowing B09 Lantern at (40, 50);   - an A04 Turnleaf in Photo mode at (88, 50);
 * - a P10 Needlejaw mid-attempt on a P01 Amoeba at (40, 80) (0.3 of 1.0 s of contact);
 * - a B01 Sprinter in rivalry chemical 0.4 (an M08-style deposit, no B13 in the dish) at (88, 80).
 * TRAP_JACKET fixture (TRAP joined IMPLEMENTED_NATIVE_ABILITIES at the wave 13 integration and E11 joined
 * IMPLEMENTED_MODULES at the organism flip, D-0127, so the import loads it and both journeys run):
 * - an F03 Traplace holding a P04 Siltworm on sediment around (40, 64), 3 s into the hold;
 * - an E11 P07 Dartfin with a jacket built from silicate at (88, 64).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSaveFile } from '../../src/persistence/saveFile';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex, SUB_SEDIMENT } from '../../src/sim/grid';
import { rebuildIndex } from '../../src/sim/spatial';
import { step, type StepHooks } from '../../src/sim/tick';
import { markField } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, fillField, paintRect, place, placeWith, registry, setField } from '../helpers/world';
import { REPO_ROOT } from '../../tools/lib/content-fs';

export const ORGANISM_CELLS = {
  lantern: [40, 50] as const,
  turnleaf: [88, 50] as const,
  needlejaw: [40, 80] as const,
  sprinter: [88, 80] as const,
} as const;

export const TRAP_JACKET_CELLS = {
  traplace: [40, 64] as const,
  dartfin: [88, 64] as const,
} as const;

const shipped = registry().manifest;

/** Pin slots at fixed positions right after stage 4 (as tests/fixtures/handling.test.ts pins a duel). */
function pins(list: readonly (readonly [number, number, number])[], extra?: StepHooks['afterStage']): StepHooks {
  return {
    afterStage: (s, world) => {
      extra?.(s, world);
      if (s !== 4) return;
      for (const [slot, x, y] of list) {
        if (!world.ents.isAlive(slot)) continue;
        world.ents.cols.x[slot] = x;
        world.ents.cols.y[slot] = y;
      }
      rebuildIndex(world);
    },
  };
}

async function write(w: World, name: string, file: string): Promise<string> {
  const { text } = await buildSaveFile(w, { name, savedAt: '2026-10-15T00:00:00.000Z', recipeId: 'FIRST_DISH_V1' });
  const dir = join(REPO_ROOT, 'tmp', 'e2e-org-ui');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${file}-${process.pid}.pixelmeba`);
  writeFileSync(path, text);
  return path;
}

/** The ORGANISM fixture (importable by this build); returns its path. */
export async function writeOrganismFixture(): Promise<string> {
  const reg = registryWith({
    enabledSpecies: [...shipped.enabledSpecies, 'A04', 'B09', 'P10'].sort(),
    enabledSystems: [...shipped.enabledSystems, 'signals', 'rivalry'].sort() as SystemFlag[],
    enabledMaterials: [...shipped.enabledMaterials, 'M08'].sort(),
  });
  const w = clearWater({ id: 'TEST_ORGANISM_UI' }, reg);
  const [lx, ly] = ORGANISM_CELLS.lantern;
  const [nx, ny] = ORGANISM_CELLS.needlejaw;
  const [sx, sy] = ORGANISM_CELLS.sprinter;
  const lantern = place(w, 'B09', lx + 0.5, ly + 0.5, { E: 80 });
  place(w, 'A04', ORGANISM_CELLS.turnleaf[0] + 0.5, ORGANISM_CELLS.turnleaf[1] + 0.5, { E: 60 });
  const sprinter = place(w, 'B01', sx + 0.5, sy + 0.5, { E: 60 });
  setField(w, 'rival', cellIndex(sx, sy), 0.4);
  // 6 s with the Lantern's cell signal held at 0.5 right before stage 8: it glows by the 5 s threshold rule.
  const holdGlow: StepHooks['afterStage'] = (s, world) => {
    if (s !== 7) return;
    world.fields.sGlow![cellIndex(lx, ly)] = 0.5;
    markField(world, 'sGlow');
    world.fields.rival![cellIndex(sx, sy)] = 0.4;
    markField(world, 'rival');
  };
  for (let t = 0; t < 60; t++) step(w, pins([[lantern, lx + 0.5, ly + 0.5], [sprinter, sx + 0.5, sy + 0.5]], holdGlow));
  // The duel: 3 contact ticks (0.3 of the P01's 1.0 s), still holding the glow and the chemical.
  const p10 = place(w, 'P10', nx + 0.5, ny + 0.5, { E: 50 });
  const prey = place(w, 'P01', nx + 0.8, ny + 0.5);
  for (let t = 0; t < 3; t++)
    step(w, pins([[p10, nx + 0.5, ny + 0.5], [prey, nx + 0.8, ny + 0.5], [lantern, lx + 0.5, ly + 0.5], [sprinter, sx + 0.5, sy + 0.5]], holdGlow));
  const c = w.ents.cols;
  if (c.glowState[lantern] !== 1) throw new Error('fixture: the Lantern is not glowing');
  if (!(c.handlingNeed[p10]! > 0)) throw new Error('fixture: the Needlejaw is not handling');
  return write(w, 'Organism fixture', 'organism-fixture');
}

/** The TRAP_JACKET fixture (loads since the organism flip, D-0127: TRAP and E11 are implemented); returns its path. */
export async function writeTrapJacketFixture(): Promise<string> {
  const reg = registryWith(
    {
      enabledSpecies: [...shipped.enabledSpecies, 'F03', 'P07'].sort(),
      enabledModules: [...shipped.enabledModules, 'E11'].sort(),
      enabledSystems: [...shipped.enabledSystems, 'silicate'].sort() as SystemFlag[],
    },
    { allowUnimplemented: true }, // written before TRAP (wave 13) and E11 (organism flip, D-0127) were implemented; a superset since
  );
  const w = clearWater({ id: 'TEST_TRAP_JACKET_UI' }, reg);
  const [tx, ty] = TRAP_JACKET_CELLS.traplace;
  const [dx, dy] = TRAP_JACKET_CELLS.dartfin;
  paintRect(w, SUB_SEDIMENT, tx - 6, ty - 6, tx + 6, ty + 6);
  fillField(w, 'broth', 0);
  fillField(w, 'silicate', 0.3);
  const f03 = place(w, 'F03', tx + 0.5, ty + 0.5, { B: 2.8, N: 0.28, E: 80 });
  const p04 = place(w, 'P04', tx + 0.6, ty + 0.5, { E: 100 });
  const p07 = placeWith(w, 'P07', dx + 0.5, dy + 0.5, ['E11'], { E: 90 });
  const hooks = pins([[p04, tx + 0.6, ty + 0.5], [p07, dx + 0.5, dy + 0.5]]);
  const c = w.ents.cols;
  let t = 0;
  while (c.heldBySlot[p04]! < 0 && t++ < 100) step(w, hooks);
  for (let k = 0; k < 30; k++) step(w, hooks);
  if (c.trapSlot[f03] !== p04) throw new Error('fixture: the Traplace is not holding the Siltworm');
  if (!(c.jacketMineral[p07]! > 0)) throw new Error('fixture: the Dartfin built no jacket');
  return write(w, 'Trap and jacket fixture', 'trap-jacket-fixture');
}
