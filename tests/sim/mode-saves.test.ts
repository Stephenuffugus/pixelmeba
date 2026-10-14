/**
 * Phase 5 wave 12, e2-light-algae: the A04 saved metabolic mode survives save and reload at every state this task
 * writes (D-0108 general round trip; g5-plan "Carry-overs"). At each point buildSaveFile → loadSaveFile is accepted,
 * the loaded world has the same stateHash, and 300 more ticks give the same stateHash as the uninterrupted run:
 *   - tick 0 with mode-0 recipe founders (the import accepts mode 0: a game save at tick 0 holds it);
 *   - right after initialization (the first stage 4);
 *   - the tick of a Photo → Sugar switch (dusk) and of a Sugar → Photo switch (dawn); a mid-band hold;
 *   - the tick after an A04 divides (both daughters carry their newborn modes);
 *   - a held Sample containing an A04 (its rows carry the mode);
 *   - every rc1 save loaded and saved again (hash unchanged).
 * THE initialization proof (the stage 4 rule against "initialize in commands.ts introduceOrganism"): a dish with
 * growing A05 colonies and the cycle at dusk is saved at tick T and reloaded; after a reload derived.light is
 * recomputed with the CURRENT canopy biomass (D-0113, D-0116), so a stage 1 reader of light would see a different
 * value than the uninterrupted run. An A04 inoculated by command in the first step after the reload, into a cell
 * whose light straddles 0.35 between the two views, equals the uninterrupted run with the same command
 * (stateHash and trajectoryDigest 'full' at T + 300), because its mode is first set in stage 4 from the light
 * stage 2 of that tick computed.
 *
 * LOW_LIGHT_CURVE and MIXOTROPHY are not in IMPLEMENTED_NATIVE_ABILITIES yet (the lead appends them at the wave 12
 * integration, D-0104), so the import would refuse these dishes as "cannot simulate": this file mocks the list with
 * both appended (wave 12), and REG uses allowUnimplemented for the same reason.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/sim/content/implemented', async (importOriginal) => {
  const orig = await importOriginal<{ readonly IMPLEMENTED_NATIVE_ABILITIES: readonly string[] }>();
  // Wave 12 (e2-light-algae): the two abilities this task implements; the lead appends them at integration.
  return { ...orig, IMPLEMENTED_NATIVE_ABILITIES: [...new Set([...orig.IMPLEMENTED_NATIVE_ABILITIES, 'LOW_LIGHT_CURVE', 'MIXOTROPHY'])].sort() };
});

import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { divisionNeeds } from '../../src/sim/births';
import { setLightMode } from '../../src/sim/climate';
import { applyNow, queueCommand } from '../../src/sim/commands';
import { cellIndex, maskCells } from '../../src/sim/grid';
import { MODE_NONE, MODE_PHOTO, MODE_SUGAR } from '../../src/sim/mixotrophy';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { stateHash } from '../../src/sim/serialize';
import { entityCell } from '../../src/sim/spatial';
import { run, step } from '../../src/sim/tick';
import { updateDerived } from '../../src/sim/transport';
import { speciesIndex, type World } from '../../src/sim/world';
import { RC1_SAVE_FILES, readRc1SaveText } from '../helpers/rc1-saves';
import { registryWith } from '../helpers/registry';
import { trajectoryDigest } from '../helpers/trajectory';
import { aliveOf, clearWater, fillField, place, registry } from '../helpers/world';

const SHIPPED = registry().manifest;
const REG = registryWith({ enabledSpecies: [...SHIPPED.enabledSpecies, 'A03', 'A04', 'A05'].sort() }, { allowUnimplemented: true });
const meta = { name: 'mode saves', savedAt: '2026-10-14T00:00:00Z', recipeId: null };
const LONG = 600_000;

/** Save and reload `w` through the real import; then 300 ticks of both: hashes equal throughout. */
async function roundTrip(w: World): Promise<World> {
  const { text } = await buildSaveFile(w, meta);
  const { world: back } = await loadSaveFile(text);
  expect(stateHash(back)).toBe(stateHash(w));
  run(w, 300);
  run(back, 300);
  expect(back.tick).toBe(w.tick);
  expect(stateHash(back)).toBe(stateHash(w));
  return back;
}

function modes(w: World): number[] {
  return aliveOf(w, 'A04').map((s) => w.ents.cols.metabolicMode[s]!);
}

/** A cycling dish (starts at day) with A04s on sugar and a few A01. */
function cycleDish(): World {
  const w = clearWater({ founders: [{ species: 'A04', count: 8, center: [64, 64], radius: 3, modules: [], moduleAssignment: 'all' }, { species: 'A01', count: 4, center: [56, 64], radius: 2, modules: [], moduleAssignment: 'all' }] }, REG);
  expect(setLightMode(w, 'cycle')).toBe(true);
  fillField(w, 'sugar', 0.5);
  fillField(w, 'nutrient', 2);
  return w;
}

describe('A04 mode through save and reload (D-0108)', () => {
  it('tick 0 with mode-0 founders, and right after initialization', async () => {
    const w = cycleDish();
    expect(w.tick).toBe(0);
    expect(modes(w).every((m) => m === MODE_NONE)).toBe(true);
    await roundTrip(w);
    const v = cycleDish();
    step(v);
    expect(modes(v).every((m) => m === MODE_PHOTO)).toBe(true);
    await roundTrip(v);
  }, LONG);

  it(
    'the tick of a Photo → Sugar switch (dusk), a mid-band hold, and the tick of a Sugar → Photo switch (dawn)',
    async () => {
      // Scout the ticks on one run, then rebuild the same deterministic dish to each tick for its round trip.
      const scout = cycleDish();
      let midBand = -1;
      let toSugar = -1;
      let toPhoto = -1;
      while (toPhoto < 0) {
        step(scout);
        const c = scout.ents.cols;
        if (midBand < 0) {
          const held = aliveOf(scout, 'A04').some((s) => {
            const L = scout.derived.light[entityCell(c.x[s]!, c.y[s]!)]!;
            return c.metabolicMode[s] === MODE_PHOTO && L > 0.25 && L < 0.35;
          });
          if (held) midBand = scout.tick;
        }
        const last = scout.events.ring.filter((e) => e.type === 'modeSwitch' && e.tick === scout.tick - 1);
        if (toSugar < 0 && last.some((e) => e.cause === R.MODE_SUGAR)) toSugar = scout.tick;
        if (toSugar >= 0 && last.some((e) => e.cause === R.MODE_PHOTO)) toPhoto = scout.tick;
        expect(scout.tick).toBeLessThan(2600);
      }
      expect(midBand).toBeGreaterThan(900); // dusk
      expect(toSugar).toBeGreaterThan(midBand);
      expect(toPhoto).toBeGreaterThan(2100); // dawn
      for (const t of [midBand, toSugar, toPhoto]) {
        const w = cycleDish();
        run(w, t);
        await roundTrip(w);
      }
    },
    LONG,
  );

  it('the tick after an A04 divides', async () => {
    const w = clearWater({}, REG);
    fillField(w, 'nutrient', 2);
    for (const cell of maskCells()) w.grid.lightBase[cell] = 0.3;
    w.grid.lightBase[cellIndex(65, 64)] = 0.4;
    w.grid.geometryVersion++;
    updateDerived(w);
    const s = place(w, 'A04', 64.5, 64.5);
    step(w);
    const c = w.ents.cols;
    expect(c.metabolicMode[s]).toBe(MODE_SUGAR); // initialized at 0.30: Sugar
    const needs = divisionNeeds(w, s);
    w.ledger.inputs.c += needs.biomass * 1.05 - c.B[s]!; // test-only state, logged as an input
    c.B[s] = needs.biomass * 1.05;
    c.E[s] = profileOf(w, s).energyCap;
    c.age[s] = needs.age + 1;
    c.decisionTimer[s] = 3;
    step(w);
    expect(aliveOf(w, 'A04')).toHaveLength(2);
    expect(modes(w).sort()).toEqual([MODE_PHOTO, MODE_SUGAR]); // the east daughter at 0.40 is Photo
    await roundTrip(w);
  }, LONG);

  it('a held Sample containing an A04 (its rows carry the mode)', async () => {
    const w = clearWater({}, REG);
    for (const cell of maskCells()) w.grid.lightBase[cell] = 0.1;
    w.grid.geometryVersion++;
    updateDerived(w);
    place(w, 'A04', 40.5, 64.5);
    place(w, 'A04', 40.5, 65.5);
    run(w, 3);
    expect(modes(w)).toEqual([MODE_SUGAR, MODE_SUGAR]);
    const res = applyNow(w, 'take', { kind: 'sampleTake', x: 40.5, y: 64.5, radius: 3, mode: 'life' });
    expect(res.result!.accepted).toBeGreaterThan(0);
    const a04 = speciesIndex(w, 'A04');
    const rows = w.sample!.rows.filter((r) => r.cols.species === a04);
    expect(rows.length).toBe(2);
    for (const r of rows) expect(r.cols.metabolicMode).toBe(MODE_SUGAR);
    await roundTrip(w);
  }, LONG);

  it('every rc1 save loaded and saved again keeps its hash', async () => {
    for (const file of RC1_SAVE_FILES) {
      const { world } = await loadSaveFile(readRc1SaveText(file));
      const h = stateHash(world);
      const again = await buildSaveFile(world, meta);
      const { world: back } = await loadSaveFile(again.text);
      expect(stateHash(back), file).toBe(h);
    }
  }, LONG);
});

describe('THE initialization proof: stage 4, not stage 1', () => {
  const TARGET = cellIndex(70, 64);
  /**
   * A growing A05 colony beside TARGET (none in it; started at B 3 so it does not divide before T, which would
   * put a daughter into TARGET), A01s further off, the cycle on; TARGET's own baseline `base`.
   */
  function canopyDish(base: number): World {
    const w = clearWater({ lid: 'open' }, REG);
    for (const cell of maskCells()) w.grid.lightBase[cell] = 0.6;
    w.grid.lightBase[TARGET] = base;
    w.grid.geometryVersion++;
    updateDerived(w);
    expect(setLightMode(w, 'cycle')).toBe(true);
    place(w, 'A05', 71.5, 64.5, { B: 3 });
    for (let k = 0; k < 4; k++) place(w, 'A01', 60.5 + k, 70.5);
    return w;
  }
  const T = 950; // dusk (900–1200): the cycle factor is falling

  /** derived.light[TARGET] in the uninterrupted world at T and in its reload. */
  async function views(base: number): Promise<{ u: number; r: number; w: World; back: World }> {
    const w = canopyDish(base);
    run(w, T);
    expect(aliveOf(w, 'A05')).toHaveLength(1); // no division yet: TARGET is still empty
    const { text } = await buildSaveFile(w, meta);
    const { world: back } = await loadSaveFile(text);
    expect(stateHash(back)).toBe(stateHash(w));
    return { u: w.derived.light[TARGET]!, r: back.derived.light[TARGET]!, w, back };
  }

  it(
    'an A04 inoculated right after a reload, where the two light views straddle 0.35, equals the uninterrupted run',
    async () => {
      // Tune TARGET's baseline so the uninterrupted view (canopy of the biomass at stage 2 of tick T − 1) is ≥ 0.35
      // and the reloaded view (canopy of the current biomass: the colonies grew since) is < 0.35. TARGET holds no
      // organism, so its baseline changes nothing else in the run.
      const probe = await views(0.5);
      expect(probe.r).toBeLessThan(probe.u); // the colonies grew during tick T − 1
      const base = (0.5 * 0.35) / ((probe.u + probe.r) / 2);
      const { u, r, w, back } = await views(base);
      expect(base).toBeLessThan(1);
      expect(u).toBeGreaterThanOrEqual(0.35);
      expect(r).toBeLessThan(0.35);
      const cmd = { kind: 'inoculate', speciesId: 'A04', x: 70.5, y: 64.5, radius: 0.5, count: 1 } as const;
      queueCommand(w, 'a04', cmd, w.tick);
      queueCommand(back, 'a04', cmd, back.tick);
      step(w);
      step(back);
      const a = aliveOf(w, 'A04');
      expect(a).toHaveLength(1);
      expect(entityCell(w.ents.cols.x[a[0]!]!, w.ents.cols.y[a[0]!]!)).toBe(TARGET);
      expect(back.ents.cols.metabolicMode[a[0]!]).toBe(w.ents.cols.metabolicMode[a[0]!]);
      expect(stateHash(back)).toBe(stateHash(w));
      run(w, 299);
      run(back, 299);
      expect(w.tick).toBe(T + 300);
      expect(stateHash(back)).toBe(stateHash(w));
      expect(trajectoryDigest(back, 'full')).toEqual(trajectoryDigest(w, 'full'));
      console.info(`mode-saves: TARGET light uninterrupted ${u} vs reloaded ${r} (base ${base}); A04 mode ${w.ents.cols.metabolicMode[a[0]!]}`);
    },
    LONG,
  );
});

