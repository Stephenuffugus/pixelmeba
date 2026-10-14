/**
 * P5.1 climate, effective light (SPEC §4.4, §4.10; CT §4, §12.2; D-0113; src/sim/climate.ts):
 * effective = clamp(clamp(baseline × cycle, 0, 1) × shade × roof × canopy, 0, 1).
 * - the S11 roof multiplies its own cell's light by 0.25 (with or without 'climate': the rule is gated on
 *   the recorded S11); a new devices array is seen even without a geometryVersion bump;
 * - canopy = 1/(1 + Σ CANOPY biomass/10) over a cell and its 4 neighbours (keyed on the ability), colonies
 *   summed, dead ones not counted; photosynthesis receives the attenuated light;
 * - the full formula at dusk; lightFactors(w, c).effective === derived.light[c] between steps, after a
 *   paused command and after a reload; a shipped-registry world keeps lightFactors' three old keys.
 * A05 (Raftball, CANOPY) is enabled only through registryWith (D-0104: nothing ships enabled).
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { lightFactors } from '../../src/sim/chemistry';
import { cycleFactor, cyclePhaseTick, setLightMode } from '../../src/sim/climate';
import { applyNow } from '../../src/sim/commands';
import { sortDevices, type Device } from '../../src/sim/devices';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex, maskCells } from '../../src/sim/grid';
import { killEntity } from '../../src/sim/maintenance';
import { R } from '../../src/sim/reasons';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { updateDerived } from '../../src/sim/transport';
import type { World, WorldContent } from '../../src/sim/world';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { registryWith } from '../helpers/registry';
import { aliveOf, clearWater, place, preFlipRegistry, registry } from '../helpers/world';

const S_IDS = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'];
const SHIPPED = registry().manifest;
const SYSTEMS = [...SHIPPED.enabledSystems, 'barriers', 'climate', 'devices'].sort() as SystemFlag[];
const REG = registryWith({ enabledSystems: SYSTEMS });
const REG_DEVICES_ONLY = registryWith({ enabledSystems: [...SHIPPED.enabledSystems, 'devices'].sort() as SystemFlag[] });
const REG_A05 = registryWith({ enabledSystems: SYSTEMS, enabledSpecies: [...SHIPPED.enabledSpecies, 'A05'].sort() });
const meta = { name: 'climate light', savedAt: '2026-10-13T00:00:00Z', recipeId: null };

/** A clear-water dish under `reg`, optionally recording S01–S12. */
function world(reg: ContentRegistry, structures: boolean): World {
  const w = clearWater({}, reg);
  if (!structures) return w;
  const m = w.content.manifest;
  const manifest = { ...m, enabledStructures: [...new Set([...(m.enabledStructures ?? []), ...S_IDS])].sort() };
  (w as { content: WorldContent }).content = { ...w.content, manifest };
  return w;
}

function roof(w: World, x: number, y: number, bump = true): Device {
  const d: Device = { id: w.counters.nextDeviceId++, kind: 'S11', cell: cellIndex(x, y) };
  w.devices = sortDevices([...w.devices, d]);
  if (bump) w.grid.geometryVersion++;
  return d;
}

async function reload(w: World): Promise<World> {
  const { text } = await buildSaveFile(w, meta);
  return (await loadSaveFile(text)).world;
}

const X = cellIndex(64, 64);
const NEIGHBOURS = [cellIndex(65, 64), cellIndex(64, 65), cellIndex(63, 64), cellIndex(64, 63)];
const DIAGONALS = [cellIndex(65, 65), cellIndex(63, 63)];

function lightFactorsAgree(w: World): number {
  let bad = 0;
  for (const i of maskCells()) if (!Object.is(lightFactors(w, i).effective, w.derived.light[i])) bad++;
  return bad;
}

describe('S11 shade roof (× 0.25 on its own cell)', () => {
  for (const [label, reg] of [
    ['with climate', REG],
    ['without climate (devices only)', REG_DEVICES_ONLY],
  ] as const) {
    it(`multiplies its cell's light by exactly 0.25 and leaves its neighbours unchanged (${label})`, () => {
      const w = world(reg, true);
      const b = w.grid.lightBase[X]!;
      roof(w, 64, 64);
      updateDerived(w);
      expect(w.derived.light[X]).toBe(b * 0.25);
      for (const n of [...NEIGHBOURS, ...DIAGONALS]) expect(w.derived.light[n]).toBe(w.grid.lightBase[n]!);
      run(w, 3);
      expect(w.derived.light[X]).toBe(b * 0.25);
      expect(lightFactors(w, X)).toMatchObject({ roof: 0.25, canopy: 1, effective: b * 0.25 });
      expect(lightFactors(w, X).cycle).toBeUndefined();
      expect(lightFactors(w, NEIGHBOURS[0]!)).toMatchObject({ roof: 1 });
    });
  }

  it('a new devices array is seen without a geometryVersion bump (realizeRecipe assigns one)', () => {
    const w = world(REG, true);
    updateDerived(w);
    roof(w, 64, 64, false);
    updateDerived(w);
    expect(w.derived.light[X]).toBe(w.grid.lightBase[X]! * 0.25);
  });
  it('a roof pushed or moved IN PLACE (same array, no geometryVersion bump) is seen at once, and the dish equals its reload', async () => {
    const w = world(REG, true);
    for (const x of [64, 66, 70]) place(w, 'A01', x + 0.5, 64.5);
    const first = roof(w, 64, 64);
    run(w, 5);
    const at = (x: number): number => cellIndex(x, 64);
    const base = (x: number): number => w.grid.lightBase[at(x)]!;
    const gv = w.grid.geometryVersion;
    w.devices.push({ id: w.counters.nextDeviceId++, kind: 'S11', cell: at(70) }); // still sorted by cell
    updateDerived(w);
    expect(w.derived.light[at(70)]).toBe(base(70) * 0.25);
    first.cell = at(66); // moved in place; still sorted (66 < 70)
    updateDerived(w);
    expect(w.grid.geometryVersion).toBe(gv);
    expect(w.derived.light[at(64)]).toBe(base(64));
    expect(w.derived.light[at(66)]).toBe(base(66) * 0.25);
    expect(lightFactorsAgree(w)).toBe(0);
    const back = await reload(w);
    let differ = 0;
    for (let i = 0; i < w.derived.light.length; i++) if (!Object.is(back.derived.light[i], w.derived.light[i])) differ++;
    expect(differ).toBe(0);
    run(w, 200);
    run(back, 200);
    expect(stateHash(back)).toBe(stateHash(w));
    expect(w.derived.light[at(66)]).toBe(base(66) * 0.25);
  });
});

describe('canopy (CANOPY ability: 1/(1 + Σ B/10) over the cell and its 4 neighbours)', () => {
  it('A05 with B = 10 gives 0.5 on its cell and 4 neighbours, 1 on a diagonal; colonies sum; the dead count nothing', () => {
    const w = world(REG_A05, false);
    const s = place(w, 'A05', 64.5, 64.5, { B: 10 });
    updateDerived(w);
    expect(w.derived.light[X]).toBe(w.grid.lightBase[X]! * 0.5);
    for (const n of NEIGHBOURS) expect(lightFactors(w, n).canopy).toBe(0.5);
    for (const n of NEIGHBOURS) expect(w.derived.light[n]).toBe(w.grid.lightBase[n]! * 0.5);
    for (const d of DIAGONALS) expect(lightFactors(w, d).canopy).toBe(1);
    for (const d of DIAGONALS) expect(w.derived.light[d]).toBe(w.grid.lightBase[d]!);

    // Two colonies in one cell: B 5 + 5 → 0.5 (summed, never 0.5 × 0.5).
    const v = world(REG_A05, false);
    place(v, 'A05', 64.25, 64.25, { B: 5 });
    place(v, 'A05', 64.75, 64.75, { B: 5 });
    updateDerived(v);
    expect(lightFactors(v, X).canopy).toBe(0.5);
    expect(v.derived.light[X]).toBe(v.grid.lightBase[X]! * 0.5);

    // A dead A05 counts nothing; light returns to the fast-path value once (lightVersion reset).
    killEntity(w, s, R.DEATH_AGE);
    updateDerived(w);
    expect(lightFactors(w, X).canopy).toBe(1);
    let bad = 0;
    for (const i of maskCells()) if (w.derived.light[i] !== w.grid.lightBase[i]! * w.grid.shade[i]!) bad++;
    expect(bad).toBe(0);
  });

  it('an A01 in the shaded cell photosynthesizes at the attenuated light (half the intake under canopy 0.5)', () => {
    const gain = (shaded: boolean): number => {
      const w = world(REG_A05, false);
      w.settings.lid = 'closed';
      if (shaded) place(w, 'A05', 65.5, 64.5, { B: 10 }); // the east neighbour: no competition in X
      const s = place(w, 'A01', 64.5, 64.5);
      const b0 = w.ents.cols.B[s]!;
      run(w, 1);
      if (shaded) expect(w.derived.light[X]).toBe(w.grid.lightBase[X]! * 0.5);
      return w.ents.cols.B[s]! - b0;
    };
    const open = gain(false);
    const shaded = gain(true);
    expect(open).toBeGreaterThan(0);
    expect(shaded / open).toBeCloseTo(0.5, 6);
  });
});

describe('the full formula and lightFactors', () => {
  it('cycle × shade 0.1 × roof × canopy equals clamp(clamp(base × cycle) × 0.1 × 0.25 × canopy) at stage 2, through day and dusk', () => {
    const w = world(REG_A05, true);
    w.grid.shade[X] = 0.1;
    roof(w, 64, 64);
    const a05 = place(w, 'A05', 64.5, 64.5, { B: 10, E: 100 });
    expect(setLightMode(w, 'cycle')).toBe(true);
    let checked = 0;
    let dusk = 0;
    run(w, 1100, {
      afterStage: (stage, ww) => {
        if (stage !== 2) return;
        const c = ww.ents.cols;
        const inCell = (x: number, y: number): number => {
          let s = 0;
          for (const i of aliveOf(ww, 'A05')) if (Math.floor(c.x[i]!) === x && Math.floor(c.y[i]!) === y) s += c.B[i]!;
          return s;
        };
        const S = inCell(64, 64) + inCell(65, 64) + inCell(64, 65) + inCell(63, 64) + inCell(64, 63);
        const f = cycleFactor(cyclePhaseTick(ww, ww.tick));
        const src = Math.min(1, Math.max(0, ww.grid.lightBase[X]! * f));
        const e = src * 0.1 * 0.25 * (S === 0 ? 1 : 1 / (1 + S / 10));
        expect(ww.derived.light[X], `tick ${ww.tick}`).toBe(Math.min(1, Math.max(0, e)));
        if (S > 0) checked++;
        if (f < 1 && S > 0) dusk++;
      },
    });
    expect(w.ents.cols.alive[a05]).toBe(1);
    expect(checked).toBe(1100);
    expect(dusk).toBe(1100 - 901);
  });

  it('lightFactors(w, c).effective === derived.light[c] at every dish cell between steps, after a paused command and after a reload', async () => {
    const w = world(REG_A05, true);
    for (let x = 60; x < 70; x++) w.grid.shade[cellIndex(x, 60)] = 0.1;
    roof(w, 64, 64);
    roof(w, 66, 62);
    place(w, 'A05', 64.5, 64.5, { B: 10, E: 100 });
    place(w, 'A05', 66.5, 63.5, { B: 7, E: 100 });
    place(w, 'A01', 40.5, 64.5);
    setLightMode(w, 'cycle');
    for (const k of [10, 1000, 1150]) {
      run(w, k - w.tick);
      expect(lightFactorsAgree(w), `between steps at tick ${w.tick}`).toBe(0);
      const f = lightFactors(w, X);
      expect(f.cycle?.phase).toBe(w.tick > 900 ? 'dusk' : 'day');
      expect(f.cycle?.factor).toBe(cycleFactor(w.tick - 1));
      expect(f.roof).toBe(0.25);
      expect(f.canopy).toBeLessThan(1);
      const back = await reload(w);
      expect(stateHash(back)).toBe(stateHash(w));
      expect(lightFactorsAgree(back), `after a reload at tick ${w.tick}`).toBe(0);
      applyNow(back, `deposit-${k}`, { kind: 'deposit', materialId: 'DEBRIS', points: [[30.5, 64.5]], radius: 1, dose: 0.01 });
      expect(lightFactorsAgree(back), `after a paused command at tick ${w.tick}`).toBe(0);
    }
    expect(lightFactors(w, X).cycle?.secondsIntoPhase).toBeCloseTo((1149 - 900) / 10, 12);
  });

  it('a v1.0 (pre-flip) world keeps exactly the three old keys', () => {
    const w = clearWater({}, preFlipRegistry());
    for (const c of [X, NEIGHBOURS[0]!]) {
      const l = w.grid.lightBase[c]! * w.grid.shade[c]!;
      expect(lightFactors(w, c)).toEqual({ baseline: w.grid.lightBase[c], shade: w.grid.shade[c], effective: l });
    }
  });
});
