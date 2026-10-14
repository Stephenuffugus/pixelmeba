/**
 * Phase 5 wave 11, e2-signals: glow state survives save and reload at every transition this wave writes
 * (D-0108 carry-over "Wave 11, e2-signals"; g5-plan "Carry-overs": the import refuses state the dish's rules
 * could not have produced, so every writer keeps its invariants). At each point: buildSaveFile → loadSaveFile is
 * accepted, the loaded world has the same stateHash, and 300 more ticks give the same stateHash as the
 * uninterrupted run:
 *   - the tick glow turns on; mid on-dwell (dim, 2.5 s counted); mid off-dwell;
 *   - THE named carry-over: the tick a glowing E02 + E03 carrier starts Preparing (dim in that very tick);
 *   - mid-Resting; the tick after a glowing parent divides (both daughters dim, dwell 0);
 *   - an rc1 save loaded and saved again: energy.signal 0 is added and the hash is unchanged.
 * The signal is held at each glower's cell right before stage 8 by the same hook in both runs.
 *
 * E02 is not yet in IMPLEMENTED_MODULES (the lead appends it at integration, D-0119), so the import would refuse
 * an E02 dish with "this version of Pixelmeba cannot simulate": this file mocks the list with E02 appended. The
 * registry uses allowUnimplemented for the same reason (and SIGNAL_GLOW, RIVALRY).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/sim/content/implemented', async (importOriginal) => {
  const orig = await importOriginal<{ readonly IMPLEMENTED_MODULES: readonly string[] }>();
  return { ...orig, IMPLEMENTED_MODULES: [...new Set([...orig.IMPLEMENTED_MODULES, 'E02'])].sort() };
});

import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { LIFE_ACTIVE, LIFE_PREPARING, LIFE_RESTING } from '../../src/sim/entities';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex } from '../../src/sim/grid';
import { profileOf } from '../../src/sim/profiles';
import { stateHash } from '../../src/sim/serialize';
import { entityCell } from '../../src/sim/spatial';
import { step, type StepHooks } from '../../src/sim/tick';
import { markField } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { RC1_SAVE_FILES, readRc1SaveText } from '../helpers/rc1-saves';
import { clearWater, place, placeWith, registry, setField } from '../helpers/world';

const shipped = registry().manifest;
const REG = registryWith(
  {
    enabledSpecies: [...shipped.enabledSpecies, 'B09', 'B10', 'B11', 'B13'].sort(),
    enabledModules: [...shipped.enabledModules, 'E02'].sort(),
    enabledSystems: [...shipped.enabledSystems, 'rivalry', 'signals'].sort() as SystemFlag[],
    enabledMaterials: [...shipped.enabledMaterials, 'M06', 'M07', 'M08'].sort(),
  },
  { allowUnimplemented: true },
);
const meta = { name: 'glow saves', savedAt: '2026-10-14T00:00:00Z', recipeId: null };
const LONG = 300_000;

/** A hook holding S_GLOW at `signal` in every living glower's cell right before stage 8 (read from the world it runs on). */
function holdAll(signal: () => number): StepHooks {
  return {
    afterStage: (st, world) => {
      if (st !== 7) return;
      const c = world.ents.cols;
      const g = world.fields.sGlow!;
      for (let i = 0; i < world.ents.highWater; i++) {
        if (c.alive[i] !== 1 || profileOf(world, i).glow === null) continue;
        g[entityCell(c.x[i]!, c.y[i]!)] = signal();
      }
      markField(world, 'sGlow');
    },
  };
}
const HOLD = holdAll(() => 0.31);

/** Save and reload `w` through the real import, then run both 300 ticks under `hook`: hashes equal throughout. */
async function roundTrip(w: World, hook: StepHooks = HOLD): Promise<World> {
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

function b09(): { w: World; s: number } {
  const w = clearWater({}, REG);
  const s = place(w, 'B09', 64.5, 64.5, { E: 90 });
  return { w, s };
}

describe('glow state through save and reload (D-0108 carry-over)', () => {
  it('the tick glow turns on', async () => {
    const { w, s } = b09();
    for (let t = 0; t < 50; t++) step(w, HOLD);
    expect(w.ents.cols.glowState[s]).toBe(1);
    expect(w.events.ring.at(-1)?.type).toBe('glowOn');
    await roundTrip(w);
  }, LONG);

  it('mid on-dwell (dim, 2.5 s counted)', async () => {
    const { w, s } = b09();
    for (let t = 0; t < 25; t++) step(w, HOLD);
    expect(w.ents.cols.glowState[s]).toBe(0);
    expect(w.ents.cols.glowDwell[s]).toBeCloseTo(2.5, 9);
    const back = await roundTrip(w);
    expect(back.ents.cols.glowState[s]).toBe(1); // it went on after the reload exactly as without it
  }, LONG);

  it('mid off-dwell (glowing, 2.5 s at ≤ 0.15 counted)', async () => {
    const { w, s } = b09();
    for (let t = 0; t < 50; t++) step(w, HOLD);
    const low = holdAll(() => 0.14);
    for (let t = 0; t < 25; t++) step(w, low);
    expect(w.ents.cols.glowState[s]).toBe(1);
    expect(w.ents.cols.glowDwell[s]).toBeCloseTo(2.5, 9);
    const back = await roundTrip(w, low);
    expect(back.ents.cols.glowState[s]).toBe(0);
  }, LONG);

  it('THE carry-over: the tick a glowing E02 + E03 carrier starts Preparing — dim in that tick, accepted by the import; then mid-Resting', async () => {
    const w = clearWater({}, REG);
    const s = placeWith(w, 'B01', 64.5, 64.5, ['E02', 'E03'], { E: 90 });
    const c = w.ents.cols;
    let glowed = false;
    while (c.lifeState[s] === LIFE_ACTIVE) {
      step(w, HOLD);
      if (c.glowState[s] === 1) glowed = true;
      expect(w.tick).toBeLessThan(2000);
    }
    expect(glowed).toBe(true);
    expect(c.lifeState[s]).toBe(LIFE_PREPARING);
    // The import accepts the dish in this very tick (it refuses glowState 1 on a non-Active organism, D-0108).
    const { text } = await buildSaveFile(w, meta);
    await expect(loadSaveFile(text)).resolves.toBeDefined();
    expect(c.glowState[s]).toBe(0);
    expect(w.events.ring.filter((e) => e.type === 'glowOff').at(-1)).toMatchObject({ tick: w.tick - 1, detail: { why: 'rest' } });
    await roundTrip(w);
    // Mid-Resting (on a fresh run to the same point, so no 300-tick detour moves it).
    const r = clearWater({}, REG);
    const t = placeWith(r, 'B01', 64.5, 64.5, ['E02', 'E03'], { E: 90 });
    while (r.ents.cols.lifeState[t] !== LIFE_RESTING) step(r, HOLD);
    for (let k = 0; k < 40; k++) step(r, HOLD);
    expect(r.ents.cols.lifeState[t]).toBe(LIFE_RESTING);
    expect(r.ents.cols.glowState[t]).toBe(0);
    // Food arrives so it wakes within the 300 ticks after the reload (both runs get the same food).
    const cell = entityCell(r.ents.cols.x[t]!, r.ents.cols.y[t]!);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setField(r, 'sugar', cell + cellIndex(dx, dy) - cellIndex(0, 0), 2);
    const back = await roundTrip(r);
    expect(back.ents.cols.lifeState[t]).toBe(LIFE_ACTIVE);
  }, LONG);

  it('the tick after a glowing parent divides (both daughters dim, dwell 0)', async () => {
    const w = clearWater({}, REG);
    const s = placeWith(w, 'B01', 64.5, 64.5, ['E02'], { E: 90 });
    const c = w.ents.cols;
    for (let t = 0; t < 50; t++) step(w, HOLD);
    expect(c.glowState[s]).toBe(1);
    w.ledger.inputs.c += 2.5 - c.B[s]!; // test-only state, logged as an input
    c.B[s] = 2.5;
    c.age[s] = 100;
    c.E[s] = 90;
    const n0 = w.ents.count;
    step(w, HOLD);
    expect(w.ents.count).toBe(n0 + 1);
    expect(w.events.ring.filter((e) => e.type === 'glowOff').at(-1)?.detail).toMatchObject({ why: 'division' });
    for (let i = 0; i < w.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      expect(c.glowState[i]).toBe(0);
      expect(c.glowDwell[i]).toBe(0);
    }
    await roundTrip(w);
  }, LONG);

  it('an rc1 save loaded and saved again: energy.signal 0 is added, the hash is unchanged', async () => {
    const file = RC1_SAVE_FILES[4];
    const text = readRc1SaveText(file);
    const raw = JSON.parse(text) as { state: { ledger: { energy: Record<string, number> } } };
    expect(raw.state.ledger.energy.signal).toBeUndefined();
    const { world } = await loadSaveFile(text);
    expect(world.ledger.energy.signal).toBe(0);
    const h = stateHash(world);
    const again = await buildSaveFile(world, meta);
    expect((JSON.parse(again.text) as typeof raw).state.ledger.energy.signal).toBe(0);
    const { world: back } = await loadSaveFile(again.text);
    expect(stateHash(back)).toBe(h);
    expect(back.ledger.energy.signal).toBe(0);
  }, LONG);
});
