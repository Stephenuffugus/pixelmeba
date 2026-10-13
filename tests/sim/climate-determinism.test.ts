/**
 * P5.1 climate, determinism, conservation and neutrality (CLAUDE.md simulation contract; SPEC §3.4, §15;
 * D-0103, D-0113; src/sim/climate.ts). One world with every climate rule live: the light cycle, drying,
 * a heater and a cooler On, an S11 roof, an S12 wick, an A05 colony (CANOPY) and 30 organisms.
 * - 1× equals 4× (run 400 vs four run 100);
 * - a save at tick 1,234 (mid-dusk) reloaded and run to 3,000 equals the uninterrupted run (stateHash and
 *   trajectoryDigest 'full'); every climate value stays in [0, 1] at every 500-tick checkpoint;
 * - a heater switched On through a paused change and saved before the next step allocates at the same
 *   stage 2 after the reload;
 * - closed lid, no inputs, 10,000 ticks: the ledger closes (relative < 1e-5, absolute < 1e-8);
 * - NEUTRAL: a dish that records 'climate' but uses none of it (Fixed light, no drying, no devices, no
 *   CANOPY species) keeps both climate arrays null and evolves byte-identically to the shipped registry.
 * A05 and S01–S12 are enabled only through registryWith and the world's recorded manifest (D-0104).
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { cycleFactor, cyclePhaseTick, setLightMode } from '../../src/sim/climate';
import { sortDevices, type Device, type DeviceKind } from '../../src/sim/devices';
import { FIELD_IDS, type SystemFlag } from '../../src/sim/fields';
import { cellIndex } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { realizeRecipe } from '../../src/sim/recipes';
import { serializeWorld, stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import type { World, WorldContent } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { trajectoryDigest } from '../helpers/trajectory';
import { aliveOf, clearWater, place, rebaseLedger, registry } from '../helpers/world';

const S_IDS = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'];
const SHIPPED = registry().manifest;
const SYSTEMS = [...SHIPPED.enabledSystems, 'barriers', 'climate', 'devices'].sort() as SystemFlag[];
const REG = registryWith({ enabledSystems: SYSTEMS });
const REG_A05 = registryWith({ enabledSystems: SYSTEMS, enabledSpecies: [...SHIPPED.enabledSpecies, 'A05'].sort() });
const meta = { name: 'climate determinism', savedAt: '2026-10-13T00:00:00Z', recipeId: null };

function pushDevice(w: World, kind: DeviceKind, x: number, y: number, on?: boolean): Device {
  const d: Device = { id: w.counters.nextDeviceId++, kind, cell: cellIndex(x, y), ...(on !== undefined ? { on } : {}) };
  w.devices = sortDevices([...w.devices, d]);
  w.grid.geometryVersion++;
  return d;
}

/**
 * GEL_COLONY (gel, with the water channel x 59–68) with every climate rule live. `heaterOn` false leaves
 * the heater Off. `lid` closed for the conservation run.
 */
function fullWorld(opts: { heaterOn?: boolean; lid?: 'open' | 'closed' } = {}): World {
  const w = clearWater({ habitatId: 'GEL_COLONY', drying: true, lid: opts.lid ?? 'open', backgroundOverrides: {} }, REG_A05);
  const m = w.content.manifest;
  const manifest = { ...m, enabledStructures: [...new Set([...(m.enabledStructures ?? []), ...S_IDS])].sort() };
  (w as { content: WorldContent }).content = { ...w.content, manifest };
  expect(setLightMode(w, 'cycle')).toBe(true);
  pushDevice(w, 'S09', 62, 70, opts.heaterOn ?? true);
  pushDevice(w, 'S10', 40, 64, true);
  pushDevice(w, 'S11', 63, 60);
  pushDevice(w, 'S11', 45, 64);
  pushDevice(w, 'S12', 58, 64);
  // The A05 colony (CANOPY) and 30 organisms in the channel.
  for (let k = 0; k < 4; k++) place(w, 'A05', 62.5 + (k % 2), 58.5 + Math.floor(k / 2), { B: 6 });
  for (let k = 0; k < 12; k++) place(w, 'B01', 59.5 + (k % 9), 66.5 + Math.floor(k / 9) * 2);
  for (let k = 0; k < 10; k++) place(w, 'A01', 59.5 + (k % 9), 50.5 + Math.floor(k / 9) * 3);
  for (let k = 0; k < 4; k++) place(w, 'B04', 60.5 + k * 2, 76.5);
  expect(aliveOf(w).length).toBe(30);
  return w;
}

async function reload(w: World): Promise<World> {
  const { text } = await buildSaveFile(w, meta);
  return (await loadSaveFile(text)).world;
}

function climateInUnit(w: World): boolean {
  for (const arr of [w.climate.warmth, w.climate.moisture]) {
    if (arr === null) continue;
    for (let i = 0; i < arr.length; i++) if (!(arr[i]! >= 0 && arr[i]! <= 1)) return false;
  }
  return true;
}

describe('climate determinism', () => {
  it('1× equals 4×: run 400 equals four run 100', () => {
    const a = fullWorld();
    const b = fullWorld();
    expect(stateHash(a)).toBe(stateHash(b));
    run(a, 400);
    for (let k = 0; k < 4; k++) run(b, 100);
    expect(a.climate.warmth).not.toBeNull();
    expect(a.climate.moisture).not.toBeNull();
    expect(stateHash(a)).toBe(stateHash(b));
  }, 300_000);

  it('a save at tick 1,234 (mid-dusk) reloads and runs to 3,000 exactly as the uninterrupted dish; values stay in [0, 1]', async () => {
    const a = fullWorld();
    run(a, 1234);
    expect(cyclePhaseTick(a, a.tick)).toBe(1234);
    expect(cycleFactor(1233)).toBeLessThan(1); // dusk
    const back = await reload(a);
    expect(stateHash(back)).toBe(stateHash(a));
    for (const w of [a, back]) {
      while (w.tick < 3000) {
        run(w, Math.min(500 - (w.tick % 500), 3000 - w.tick));
        expect(climateInUnit(w), `tick ${w.tick}`).toBe(true);
      }
    }
    expect(stateHash(back)).toBe(stateHash(a));
    expect(trajectoryDigest(back, 'full')).toBe(trajectoryDigest(a, 'full'));
    expect(aliveOf(a, 'A05').length).toBeGreaterThan(0);
  }, 300_000);

  it('a heater switched On through a paused change and saved before stepping equals the uninterrupted dish', async () => {
    const a = fullWorld({ heaterOn: false });
    run(a, 500);
    expect(a.climate.warmth).not.toBeNull(); // the cooler allocated it
    const heater = a.devices.find((d) => d.kind === 'S09')!;
    heater.on = true;
    a.grid.geometryVersion++;
    const back = await reload(a);
    expect(stateHash(back)).toBe(stateHash(a));
    run(a, 700);
    run(back, 700);
    expect(stateHash(back)).toBe(stateHash(a));

    // The allocation moment itself: no device On until the paused change.
    const c = fullWorld({ heaterOn: false });
    c.devices.find((d) => d.kind === 'S10')!.on = false;
    run(c, 500);
    expect(c.climate.warmth).toBeNull();
    c.devices.find((d) => d.kind === 'S09')!.on = true;
    c.grid.geometryVersion++;
    const cBack = await reload(c);
    expect(cBack.climate.warmth).toBeNull();
    run(c, 300);
    run(cBack, 300);
    expect(cBack.climate.warmth).not.toBeNull();
    expect(stateHash(cBack)).toBe(stateHash(c));
  }, 300_000);

  it('closed lid, no inputs: 10,000 ticks in 20 chunks keep the ledger closed (C and N relative < 1e-5, absolute < 1e-8)', () => {
    const w = fullWorld({ lid: 'closed' });
    rebaseLedger(w);
    const inputs = { ...w.ledger.inputs };
    const worstAbs = { c: 0, n: 0, m: 0 };
    let worstC = 0;
    let worstN = 0;
    for (let chunk = 0; chunk < 20; chunk++) {
      run(w, 500);
      const check = checkLedger(w);
      worstC = Math.max(worstC, check.relErr.c);
      worstN = Math.max(worstN, check.relErr.n);
      for (const e of ['c', 'n', 'm'] as const) worstAbs[e] = Math.max(worstAbs[e], Math.abs(check.actual[e] - check.expected[e]));
      expect(check.ok, `tick ${w.tick}`).toBe(true);
      expect(climateInUnit(w)).toBe(true);
    }
    expect(w.ledger.exchangeC).toBe(0);
    expect(w.ledger.inputs).toEqual(inputs);
    expect(worstC).toBeLessThan(1e-5);
    expect(worstN).toBeLessThan(1e-5);
    expect(worstAbs.c).toBeLessThan(1e-8);
    expect(worstAbs.n).toBeLessThan(1e-8);
    expect(worstAbs.m).toBeLessThan(1e-8);
    console.info(`climate-determinism conservation: worst relative C ${worstC.toExponential(3)}, N ${worstN.toExponential(3)}; absolute C ${worstAbs.c.toExponential(3)}, N ${worstAbs.n.toExponential(3)}, M ${worstAbs.m.toExponential(3)}; alive ${w.ents.count}`);
  }, 600_000);

  it('NEUTRAL: a dish that records climate but uses none of it keeps null arrays and evolves byte-identically to the shipped registry', () => {
    const a = realizeRecipe(REG, 'FIRST_DISH_V1');
    const b = realizeRecipe(registry(), 'FIRST_DISH_V1');
    expect(a.content.manifest.enabledSystems).toContain('climate');
    expect(b.content.manifest.enabledSystems).not.toContain('climate');
    for (let k = 0; k < 4; k++) {
      run(a, 500);
      run(b, 500);
      expect(a.climate.warmth).toBeNull();
      expect(a.climate.moisture).toBeNull();
    }
    const sa = serializeWorld(a);
    const sb = serializeWorld(b);
    expect(JSON.stringify(sa.entities)).toBe(JSON.stringify(sb.entities));
    for (const id of FIELD_IDS) {
      const x = a.fields[id];
      const y = b.fields[id];
      if (!x || !y) {
        expect(x, id).toBe(y);
        continue;
      }
      expect(Buffer.from(x.buffer).equals(Buffer.from(y.buffer)), id).toBe(true);
    }
    expect(Buffer.from(a.derived.light.buffer).equals(Buffer.from(b.derived.light.buffer))).toBe(true);
    expect(Buffer.from(a.derived.moisture.buffer).equals(Buffer.from(b.derived.moisture.buffer))).toBe(true);
    expect(trajectoryDigest(a, 'full')).toBe(trajectoryDigest(b, 'full'));
    expect(a.ents.count).toBeGreaterThan(0);
  }, 300_000);
});
