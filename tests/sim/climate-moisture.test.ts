/**
 * P5.1 climate, the moisture index (SPEC §4.8, §6.3; CT §4, §12.2, §12.7; D-0106, D-0113; src/sim/climate.ts):
 * - the moisture array is allocated at the first stage 2 with drying on (water 1, gel/sediment 0.8), or by
 *   the wet brush (ensureMoisture); a wick or roof alone allocates nothing;
 * - drying: uncovered gel/sediment lose 0.001/s × dt down to exactly 0.1; an S11 roof stops it; water stays 1;
 * - wicks: a wick touching water moves its 4-neighbour gel/sediment toward 0.8 at 0.01/s × dt in both
 *   directions; not its diagonals, not its own cell; wicks do not chain; two wicks do not add;
 * - wetCells sets 0.9 and dilutes nothing; drying never concentrates chemicals;
 * - repainting a cell restarts its moisture; derived.moisture and dormancy's moisture response follow it;
 * - round trips through the import; every value stays in [0, 1].
 * GEL_COLONY (gel everywhere but the water channel x 59–68) records 'climate' through registryWith.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { ensureMoisture, moistureAt, wetCells } from '../../src/sim/climate';
import { applyNow } from '../../src/sim/commands';
import { DRYING_PER_SECOND, DT, MOISTURE_FLOOR, WICK_PER_SECOND } from '../../src/sim/constants';
import { sortDevices, type Device, type DeviceKind } from '../../src/sim/devices';
import { moistureSuitability } from '../../src/sim/dormancy';
import { FIELD_IDS, type SystemFlag } from '../../src/sim/fields';
import { cellIndex, maskCells, SUB_GEL, SUB_SEDIMENT, SUB_WATER } from '../../src/sim/grid';
import { profileOf } from '../../src/sim/profiles';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { updateDerived } from '../../src/sim/transport';
import type { World, WorldContent } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, place, preFlipRegistry, registry } from '../helpers/world';

const S_IDS = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'];
const SYSTEMS = [...registry().manifest.enabledSystems, 'barriers', 'climate', 'devices'].sort() as SystemFlag[];
const REG = registryWith({ enabledSystems: SYSTEMS });
const meta = { name: 'climate moisture', savedAt: '2026-10-13T00:00:00Z', recipeId: null };
const DRY = DRYING_PER_SECOND * DT;
const WICK = WICK_PER_SECOND * DT;

/** GEL_COLONY (or another habitat) without organisms, recording 'climate', 'barriers', 'devices' and S01–S12. */
function gelWorld(drying: boolean, habitatId = 'GEL_COLONY'): World {
  const w = clearWater({ habitatId, drying }, REG);
  const m = w.content.manifest;
  const manifest = { ...m, enabledStructures: [...new Set([...(m.enabledStructures ?? []), ...S_IDS])].sort() };
  (w as { content: WorldContent }).content = { ...w.content, manifest };
  return w;
}

function pushDevice(w: World, kind: DeviceKind, x: number, y: number): Device {
  const d: Device = { id: w.counters.nextDeviceId++, kind, cell: cellIndex(x, y) };
  w.devices = sortDevices([...w.devices, d]);
  w.grid.geometryVersion++;
  return d;
}

/** Turn one gel cell into a water "pond" cell (test geometry). */
function pond(w: World, x: number, y: number): void {
  w.grid.substrate[cellIndex(x, y)] = SUB_WATER;
  w.grid.geometryVersion++;
  if (w.climate.moisture) w.climate.moisture[cellIndex(x, y)] = 1;
}

async function reload(w: World): Promise<World> {
  const { text } = await buildSaveFile(w, meta);
  return (await loadSaveFile(text)).world;
}

async function expectRoundTrip(w: World): Promise<void> {
  const back = await reload(w);
  expect(stateHash(back)).toBe(stateHash(w));
  expect(Array.from(back.climate.moisture!)).toEqual(Array.from(w.climate.moisture!));
  run(w, 20);
  run(back, 20);
  expect(stateHash(back)).toBe(stateHash(w));
}

function allInUnit(arr: Float64Array): boolean {
  for (let i = 0; i < arr.length; i++) if (!(arr[i]! >= 0 && arr[i]! <= 1)) return false;
  return true;
}

const GEL = cellIndex(40, 64);
const WATER = cellIndex(64, 64);

describe('moisture allocation', () => {
  it('drying on allocates the array at the first stage 2 (water 1, gel 0.8 then dried once); nothing reads it into existence', async () => {
    const w = gelWorld(true);
    expect(w.grid.substrate[GEL]).toBe(SUB_GEL);
    expect(w.grid.substrate[WATER]).toBe(SUB_WATER);
    updateDerived(w);
    expect(moistureAt(w, GEL)).toBe(0.8);
    expect(w.climate.moisture).toBeNull();
    run(w, 1);
    const m = w.climate.moisture!;
    expect(m[WATER]).toBe(1);
    expect(m[GEL]).toBe(0.8 - DRY);
    expect(allInUnit(m)).toBe(true);
    let bad = 0;
    for (const i of maskCells()) if (m[i] !== (w.grid.substrate[i] === SUB_WATER ? 1 : 0.8 - DRY)) bad++;
    expect(bad).toBe(0);
    await expectRoundTrip(w);
  });

  it('without drying, a wick and a roof alone allocate nothing', () => {
    const w = gelWorld(false);
    pushDevice(w, 'S12', 58, 64);
    pushDevice(w, 'S11', 40, 64);
    run(w, 50);
    expect(w.climate.moisture).toBeNull();
    expect(w.derived.moisture[cellIndex(57, 64)]).toBe(0.8);
  });
});

describe('drying (−0.001/s to 0.1), roof, water', () => {
  it('lowers an uncovered gel cell by 0.0001 per tick to exactly 0.1; a roofed gel cell keeps 0.8; water stays 1; round trip at the floor', async () => {
    const w = gelWorld(true);
    const roofed = pushDevice(w, 'S11', 45, 64);
    let v = 0.8;
    for (let chunk = 0; chunk < 71; chunk++) {
      run(w, 100);
      for (let t = 0; t < 100; t++) v = v > MOISTURE_FLOOR ? Math.max(MOISTURE_FLOOR, v - DRY) : v;
      const m = w.climate.moisture!;
      expect(m[GEL], `tick ${w.tick}`).toBe(v);
      expect(w.derived.moisture[GEL]).toBe(v);
      expect(m[roofed.cell]).toBe(0.8);
      expect(m[WATER]).toBe(1);
      if (chunk === 34) expect(v).toBeCloseTo(0.8 - 3500 * DRY, 9);
    }
    expect(v).toBe(0.1);
    expect(w.climate.moisture![GEL]).toBe(0.1);
    expect(allInUnit(w.climate.moisture!)).toBe(true);
    await expectRoundTrip(w);
  });
  it('sediment dries like gel (SPEC §4.8 "uncovered gel/sediment cells lose 0.001/s"): a roof stops it, a wick from water holds 0.8', async () => {
    const w = gelWorld(true, 'SEDIMENT_EDGE');
    const SED = cellIndex(64, 100);
    const ROOFED = cellIndex(70, 100);
    const WICKED = cellIndex(80, 64);
    for (const i of [SED, ROOFED, WICKED]) expect(w.grid.substrate[i]).toBe(SUB_SEDIMENT);
    expect(w.grid.substrate[cellIndex(80, 63)]).toBe(SUB_WATER);
    pushDevice(w, 'S11', 70, 100);
    pushDevice(w, 'S12', 80, 63);
    let v = 0.8;
    for (let t = 0; t < 300; t++) v = Math.max(MOISTURE_FLOOR, v - DRY);
    run(w, 300);
    const m = w.climate.moisture!;
    expect(m[SED]).toBe(v);
    expect(m[SED]).toBeLessThan(0.8);
    expect(w.derived.moisture[SED]).toBe(v);
    expect(m[ROOFED]).toBe(0.8);
    expect(m[WICKED]).toBe(0.8); // dried by 0.0001, wicked back to 0.8 every tick
    expect(m[cellIndex(64, 40)]).toBe(1);
    expect(allInUnit(m)).toBe(true);
    await expectRoundTrip(w);
  });
});

describe('wicks (S12)', () => {
  it('a wick on water raises its 4 gel neighbours toward 0.8 at 0.001 per tick, not its diagonals; round trip after a wick', async () => {
    const w = gelWorld(true);
    run(w, 1);
    w.settings.drying = false; // only the wick acts from here (the array stays)
    const m = w.climate.moisture!;
    for (const i of maskCells()) if (w.grid.substrate[i] !== SUB_WATER) m[i] = 0.1;
    pond(w, 40, 64);
    pushDevice(w, 'S12', 40, 64);
    const sides = [cellIndex(41, 64), cellIndex(40, 65), cellIndex(39, 64), cellIndex(40, 63)];
    const diagonals = [cellIndex(41, 65), cellIndex(39, 65), cellIndex(39, 63), cellIndex(41, 63)];
    let v = 0.1;
    for (let t = 0; t < 800; t++) {
      run(w, 1);
      v = Math.min(0.8, v + WICK);
      for (const s of sides) expect(m[s]).toBe(v);
    }
    expect(v).toBe(0.8);
    for (const d of diagonals) expect(m[d]).toBe(0.1);
    expect(m[cellIndex(40, 64)]).toBe(1);
    await expectRoundTrip(w);
  });

  it('a wick on gel touching water wets its gel neighbours but not its own cell', () => {
    const w = gelWorld(true);
    run(w, 1);
    w.settings.drying = false;
    const m = w.climate.moisture!;
    for (const i of maskCells()) if (w.grid.substrate[i] !== SUB_WATER) m[i] = 0.5;
    expect(w.grid.substrate[cellIndex(59, 64)]).toBe(SUB_WATER);
    const wick = pushDevice(w, 'S12', 58, 64); // gel, on the channel's bank
    run(w, 10);
    for (const c of [cellIndex(57, 64), cellIndex(58, 63), cellIndex(58, 65)]) expect(m[c]).toBeCloseTo(0.5 + 10 * WICK, 12);
    expect(m[wick.cell]).toBe(0.5);
  });

  it('wicks do not chain: a wick on gel with no water 4-neighbour does nothing, even next to a wetted cell', () => {
    const w = gelWorld(true);
    run(w, 1);
    w.settings.drying = false;
    const m = w.climate.moisture!;
    for (const i of maskCells()) if (w.grid.substrate[i] !== SUB_WATER) m[i] = 0.3;
    wetCells(w, [cellIndex(31, 70)]);
    pushDevice(w, 'S12', 30, 70);
    run(w, 50);
    expect(m[cellIndex(31, 70)]).toBe(0.9);
    for (const c of [cellIndex(29, 70), cellIndex(30, 69), cellIndex(30, 71)]) expect(m[c]).toBe(0.3);
  });

  it('two wicks touching one cell do not double its rate; a wick lowers a wet-brushed 0.9 cell toward 0.8', () => {
    const w = gelWorld(true);
    run(w, 1);
    w.settings.drying = false;
    const m = w.climate.moisture!;
    for (const i of maskCells()) if (w.grid.substrate[i] !== SUB_WATER) m[i] = 0.2;
    pond(w, 40, 64);
    pond(w, 42, 64);
    pushDevice(w, 'S12', 40, 64);
    pushDevice(w, 'S12', 42, 64);
    const shared = cellIndex(41, 64);
    const wet = cellIndex(40, 65);
    wetCells(w, [wet]);
    expect(m[wet]).toBe(0.9);
    let up = 0.2;
    let down = 0.9;
    for (let t = 0; t < 150; t++) {
      run(w, 1);
      up = Math.min(0.8, up + WICK);
      down = Math.max(0.8, down - WICK);
      expect(m[shared]).toBe(up);
      expect(m[wet]).toBe(down);
    }
    expect(down).toBe(0.8);
    expect(allInUnit(m)).toBe(true);
  });
});

describe('wetCells, repaint and readers', () => {
  it('wetCells sets 0.9 on gel, leaves water 1, allocates when null, changes no field; round trip after wetCells', async () => {
    const w = gelWorld(false);
    run(w, 3);
    expect(w.climate.moisture).toBeNull();
    const before = FIELD_IDS.map((id) => (w.fields[id] ? Array.from(w.fields[id]) : null));
    const inputs = JSON.stringify(w.ledger);
    expect(wetCells(w, [GEL, WATER])).toBe(true);
    const m = w.climate.moisture!;
    expect(m[GEL]).toBe(0.9);
    expect(m[WATER]).toBe(1);
    expect(m[cellIndex(41, 64)]).toBe(0.8);
    expect(FIELD_IDS.map((id) => (w.fields[id] ? Array.from(w.fields[id]) : null))).toEqual(before);
    expect(JSON.stringify(w.ledger)).toBe(inputs);
    run(w, 1);
    expect(w.derived.moisture[GEL]).toBe(0.9); // no drying: it stays
    await expectRoundTrip(w);
    // Without 'climate' the brush does nothing.
    const plain = clearWater({ habitatId: 'GEL_COLONY' }, preFlipRegistry());
    expect(wetCells(plain, [GEL])).toBe(false);
    expect(ensureMoisture(plain)).toBeNull();
    expect(plain.climate.moisture).toBeNull();
  });

  it('drying never concentrates chemicals: drying on vs off, 3,000 ticks, every field byte-identical', () => {
    const on = gelWorld(true);
    const off = gelWorld(false);
    run(on, 3000);
    run(off, 3000);
    expect(on.climate.moisture![GEL]).toBeLessThan(0.8);
    for (const id of FIELD_IDS) {
      const a = on.fields[id];
      const b = off.fields[id];
      if (!a || !b) {
        expect(a, id).toBe(b);
        continue;
      }
      expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer)), id).toBe(true);
    }
  });

  it('paintSubstrate gel → water → gel resets the cell to 1, then 0.8; gel over gel changes nothing; with no array nothing is allocated', () => {
    const w = gelWorld(true);
    run(w, 200);
    const m = w.climate.moisture!;
    expect(m[GEL]).toBeLessThan(0.8);
    const paint = (substrate: 'water' | 'gel') => applyNow(w, `paint-${substrate}-${w.commands.nextSeq}`, { kind: 'paintSubstrate', substrate, points: [[40.5, 64.5]], radius: 1 });
    const dried = m[GEL];
    paint('gel'); // the substrate it already has: no re-wetting
    expect(m[GEL]).toBe(dried);
    paint('water');
    expect(w.grid.substrate[GEL]).toBe(SUB_WATER);
    expect(m[GEL]).toBe(1);
    expect(w.derived.moisture[GEL]).toBe(1);
    paint('gel');
    expect(m[GEL]).toBe(0.8);
    expect(w.derived.moisture[GEL]).toBe(0.8);
    const dry = gelWorld(false);
    applyNow(dry, 'paint', { kind: 'paintSubstrate', substrate: 'water', points: [[40.5, 64.5]], radius: 1 });
    expect(dry.grid.substrate[GEL]).toBe(SUB_WATER);
    expect(dry.climate.moisture).toBeNull();
    expect(dry.derived.moisture[GEL]).toBe(1);
  });

  it("derived.moisture follows the array, and dormancy's moisture response reads it (range [0.4, 1], shoulder 0.2)", () => {
    const w = gelWorld(true);
    const slot = place(w, 'B01', 63.5, 64.5);
    const prof = profileOf(w, slot);
    expect(prof.moisture[0]).toBe(0.4);
    run(w, 1);
    const m = w.climate.moisture!;
    m[GEL] = 0.1;
    updateDerived(w);
    expect(w.derived.moisture[GEL]).toBe(0.1);
    expect(moistureSuitability(w, prof, GEL)).toBe(0);
    m[GEL] = 0.3;
    updateDerived(w);
    expect(moistureSuitability(w, prof, GEL)).toBeCloseTo(0.5, 12);
    run(w, 1);
    expect(w.derived.moisture[GEL]).toBe(0.3 - DRY);
    expect(moistureAt(w, GEL)).toBe(0.3 - DRY);
  });
});
