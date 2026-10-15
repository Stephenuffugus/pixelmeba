/**
 * Phase 5 wave 13, e3-jacket: the E11 jacket survives save and reload at every state transition this task writes
 * (D-0108 general carry-over; g5-plan "Carry-overs"). At each point buildSaveFile → loadSaveFile is accepted, the
 * loaded world has the same stateHash, and 300 more ticks give the same stateHash as the uninterrupted run:
 *   - the first building tick; a scaled shared tick (the cell pinned to 0); the tick the target is reached;
 *   - a division whose new daughter lost E11 and dropped her jacket as grit;
 *   - a held carrier's skipped tick (the trap pair set by hand): unreachable in a valid dish (F03 traps P04 only),
 *     so the import refuses it — the round trip of a held P04 is in trap-hooks.test.ts;
 *   - the tick a jacketed carrier dies of age (its jacket in the grit);
 *   - a P10 mid-attempt on a P07 that built its jacket (the need sampled from a real jacket);
 *   - an rc1 save loaded and saved again (hash unchanged).
 *
 * E11 is not yet in IMPLEMENTED_MODULES (the lead appends it at the organism flip, D-0104) and F03's TRAP is not yet
 * in IMPLEMENTED_NATIVE_ABILITIES (the lead appends it at the wave 13 integration), so the import would refuse
 * these dishes with "this version of Pixelmeba cannot simulate": this file mocks the lists with exactly E11 and
 * TRAP appended (wave 13, e3-jacket). The registry uses allowUnimplemented for the same reason.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/sim/content/implemented', async (importOriginal) => {
  const orig = await importOriginal<{ readonly IMPLEMENTED_MODULES: readonly string[]; readonly IMPLEMENTED_NATIVE_ABILITIES: readonly string[] }>();
  return {
    ...orig,
    IMPLEMENTED_MODULES: [...new Set([...orig.IMPLEMENTED_MODULES, 'E11'])].sort(),
    IMPLEMENTED_NATIVE_ABILITIES: [...new Set([...orig.IMPLEMENTED_NATIVE_ABILITIES, 'TRAP'])].sort(),
  };
});

import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { DT } from '../../src/sim/constants';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex } from '../../src/sim/grid';
import { jacketCoverage } from '../../src/sim/handling';
import { profileOf } from '../../src/sim/profiles';
import { stateHash } from '../../src/sim/serialize';
import { entityCell, rebuildIndex } from '../../src/sim/spatial';
import { step, type StepHooks } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { RC1_SAVE_FILES, readRc1SaveText } from '../helpers/rc1-saves';
import { clearWater, fillField, place, placeWith, registry, setField } from '../helpers/world';

const shipped = registry().manifest;
const REG_J = registryWith(
  {
    enabledModules: [...shipped.enabledModules, 'E11'].sort(),
    enabledSystems: [...shipped.enabledSystems, 'silicate'].sort() as SystemFlag[],
    enabledSpecies: [...shipped.enabledSpecies, 'F03', 'P07', 'P10'].sort(),
  },
  { allowUnimplemented: true },
);
const meta = { name: 'jacket saves', savedAt: '2026-10-15T00:00:00Z', recipeId: null };
const LONG = 300_000;
const RATE_P01 = 0.005 * 4 * DT;

/** Save and reload `w` through the real import, then run both 300 ticks under `hook`: hashes equal throughout. */
async function roundTrip(w: World, hook: (world: World) => StepHooks = () => ({})): Promise<World> {
  const { text } = await buildSaveFile(w, meta);
  const { world: back } = await loadSaveFile(text);
  expect(stateHash(back)).toBe(stateHash(w));
  const hw = hook(w);
  const hb = hook(back);
  for (let t = 0; t < 300; t++) {
    step(w, hw);
    step(back, hb);
  }
  expect(back.tick).toBe(w.tick);
  expect(stateHash(back)).toBe(stateHash(w));
  return back;
}

/** Hold these slots at fixed positions right after stage 4 of every tick. */
function pinned(pins: Array<readonly [slot: number, x: number, y: number]>): (world: World) => StepHooks {
  return (world) => ({
    afterStage: (s) => {
      if (s !== 4) return;
      for (const [slot, x, y] of pins) {
        if (!world.ents.isAlive(slot)) continue;
        world.ents.cols.x[slot] = x;
        world.ents.cols.y[slot] = y;
      }
      rebuildIndex(world);
    },
  });
}

function dish(): World {
  return clearWater({}, REG_J);
}

describe('E11 jacket through save and reload (D-0108 carry-over)', () => {
  it('the first building tick', async () => {
    const w = dish();
    fillField(w, 'silicate', 0.3);
    const s = placeWith(w, 'P01', 64.5, 64.5, ['E11'], { E: 90 });
    step(w);
    expect(w.ents.cols.jacketMineral[s]).toBe(RATE_P01);
    await roundTrip(w);
  }, LONG);

  it('a scaled shared tick: two carriers share 0.003 silicate, the cell pinned to 0', async () => {
    const w = dish();
    const a = placeWith(w, 'P01', 64.2, 64.5, ['E11'], { E: 90 });
    const b = placeWith(w, 'P01', 64.8, 64.5, ['E11'], { E: 90 });
    const pin = pinned([[a, 64.2, 64.5], [b, 64.8, 64.5]]);
    setField(w, 'silicate', cellIndex(64, 64), 0.003);
    step(w, pin(w));
    const c = w.ents.cols;
    expect(c.jacketMineral[a]).toBe(c.jacketMineral[b]);
    expect(c.jacketMineral[a]).toBeLessThan(RATE_P01);
    expect(c.jacketMineral[a]).toBeGreaterThan(0);
    expect(w.fields.silicate![cellIndex(64, 64)]).toBe(0);
    await roundTrip(w, pin);
  }, LONG);

  it('the tick the target is reached', async () => {
    const w = dish();
    fillField(w, 'silicate', 0.3);
    const s = placeWith(w, 'P01', 64.5, 64.5, ['E11'], { E: 90 });
    const c = w.ents.cols;
    for (let t = 0; t < 199; t++) step(w);
    expect(c.jacketMineral[s]).toBeLessThan(0.4);
    step(w);
    expect(c.jacketMineral[s]).toBe(0.1 * c.B[s]!);
    await roundTrip(w);
  }, LONG);

  it('a division whose new daughter lost E11: her half went to grit', async () => {
    const w = dish();
    const c = w.ents.cols;
    const plain = place(w, 'P01', 40.5, 64.5, { B: 4.5 });
    const s = placeWith(w, 'P01', 64.5, 64.5, ['E11'], { E: 100, B: 8.2 });
    c.age[s] = 100;
    c.jacketMineral[s] = 0.6;
    w.ledger.inputs.m += 0.6;
    c.propG0[s] = c.genome[s]!;
    c.propG1[s] = c.genome[plain]!;
    const hw = w.ents.highWater;
    step(w);
    expect(w.ents.highWater).toBe(hw + 1);
    expect(profileOf(w, hw).jacket).toBeNull();
    expect(c.jacketMineral[hw]).toBe(0);
    expect(c.jacketMineral[s]).toBeCloseTo(0.3, 12);
    expect(w.fields.grit![entityCell(c.x[hw]!, c.y[hw]!)]).toBeCloseTo(0.3, 12);
    await roundTrip(w);
  }, LONG);

  // A held carrier is unreachable in a valid dish: F03 traps P04 only (CT §3.3) and E11 is eligible for P01, P02 and
  // P07 only (CT §7.1), so e3-traps' import refuses the pair. jacket.ts's 'held' skip (SPEC §9 E11) is defensive;
  // module-e11.test.ts proves it in the simulation, and trap-hooks.test.ts round-trips a held P04.
  it("a held carrier's skipped tick (an F03 pair set by hand): skipped and still; the import refuses the unreachable pair", async () => {
    const w = dish();
    fillField(w, 'silicate', 0.3);
    const s = placeWith(w, 'P01', 64.6, 64.5, ['E11'], { E: 90 });
    const f = place(w, 'F03', 64.3, 64.5);
    const c = w.ents.cols;
    // A built trap holding the carrier (e3-traps' import: a holding trap has its 0.20 C reserve), logged as inputs.
    c.trapReserveC[f] = 0.2;
    c.trapReserveN[f] = 0.02;
    w.ledger.inputs.c += 0.2;
    w.ledger.inputs.n += 0.02;
    c.trapSlot[f] = s;
    c.trapBirthId[f] = c.birthId[s]!;
    c.heldBySlot[s] = f;
    c.heldByBirthId[s] = c.birthId[f]!;
    const x0 = c.x[s]!;
    step(w);
    expect(c.jacketMineral[s]).toBe(0); // skipped: held
    expect(c.x[s]).toBe(x0); // and did not move (T3)
    const { text } = await buildSaveFile(w, meta);
    await expect(loadSaveFile(text)).rejects.toThrow(/A trap holds an organism it cannot catch/);
  }, LONG);

  it('the tick a jacketed carrier dies of age: its jacket is in the grit', async () => {
    const w = dish();
    fillField(w, 'silicate', 0.3);
    const s = placeWith(w, 'P01', 64.5, 64.5, ['E11'], { E: 90 });
    const c = w.ents.cols;
    for (let t = 0; t < 30; t++) step(w);
    const birth = c.birthId[s]!;
    c.age[s] = 1199.95; // test-only state: P01 maxAge 1200 s
    let guard = 0;
    while (w.ents.refValid(s, birth)) {
      step(w);
      expect(++guard).toBeLessThan(10);
    }
    expect(w.events.ring.filter((e) => e.type === 'death' && e.birthId === birth)).toHaveLength(1);
    await roundTrip(w);
  }, LONG);

  it('a P10 mid-attempt on a P07 that built its jacket', async () => {
    const w = dish();
    fillField(w, 'silicate', 0.3);
    const prey = placeWith(w, 'P07', 64.8, 64.5, ['E11'], { E: 90 });
    const c = w.ents.cols;
    const buildPin = pinned([[prey, 64.8, 64.5]])(w);
    while (jacketCoverage(c.jacketMineral[prey]!, c.B[prey]!) < 0.5) step(w, buildPin);
    const p10 = place(w, 'P10', 64.5, 64.5, { E: 50 });
    const pin = pinned([[p10, 64.5, 64.5], [prey, 64.8, 64.5]]);
    for (let k = 0; k < 10; k++) step(w, pin(w));
    expect(c.handlingNeed[p10]).toBeGreaterThan(2.5 - 1e-9);
    expect(c.handlingProgress[p10]).toBeGreaterThan(0.9);
    await roundTrip(w, pin);
  }, LONG);

  it('an rc1 save loaded and saved again: the hash is unchanged', async () => {
    for (const file of RC1_SAVE_FILES) {
      const { world } = await loadSaveFile(readRc1SaveText(file));
      const h = stateHash(world);
      const again = await buildSaveFile(world, meta);
      const { world: back } = await loadSaveFile(again.text);
      expect(stateHash(back)).toBe(h);
    }
  }, LONG);
});
