/**
 * P5.1 climate, local warmth (SPEC §4.7, §6.3; CT §4, §12.2, §13; D-0106, D-0113; src/sim/climate.ts):
 * - the warmth array is allocated in stage 2 once an S09 or S10 is On, never by an Off device or by a
 *   reader (lightFactors, localWarmthAt, updateDerived);
 * - each tick: relax 1 % toward settings.warmth, diffuse 0.05 across passable edges (stone, wall and a
 *   closed S03 stop it; S01, S02, an open S03 and S04 pass it), the device's own cell ±0.01/s × dt, clamp;
 * - heaters' gradients add; the clamp holds at exactly 0 and 1; every value stays in [0, 1];
 * - round trips through the import; suitability reads local warmth, and the ambient (null) branch is
 *   bit-identical to the shipped registry's.
 * Devices and edges are pushed directly (wave 10 writes the commands); S01–S12 are appended to the
 * world's recorded manifest as tests/sim/world-stores-5.test.ts does.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { sortEdges, type EdgeBarrier, type EdgeKind } from '../../src/sim/barriers';
import { lightFactors } from '../../src/sim/chemistry';
import { localWarmthAt } from '../../src/sim/climate';
import { DT, WARMTH_DEVICE_PER_SECOND, WARMTH_RELAX_PER_TICK } from '../../src/sim/constants';
import { sortDevices, type Device, type DeviceKind } from '../../src/sim/devices';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex, cellX, inMask, maskCells, ST_STONE, ST_WALL } from '../../src/sim/grid';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { stateHash } from '../../src/sim/serialize';
import { response, SHOULDER_WARMTH, suitabilityAt } from '../../src/sim/suitability';
import { run } from '../../src/sim/tick';
import { updateDerived } from '../../src/sim/transport';
import type { World, WorldContent } from '../../src/sim/world';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { registryWith } from '../helpers/registry';
import { clearWater, place, registry } from '../helpers/world';

const S_IDS = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'];
const SYSTEMS = [...registry().manifest.enabledSystems, 'barriers', 'climate', 'devices'].sort() as SystemFlag[];
const REG = registryWith({ enabledSystems: SYSTEMS });
const meta = { name: 'climate warmth', savedAt: '2026-10-13T00:00:00Z', recipeId: null };
const DEV = WARMTH_DEVICE_PER_SECOND * DT;

/** A clear-water dish that records 'climate', 'barriers', 'devices' and S01–S12. */
function climateWorld(reg: ContentRegistry = REG): World {
  const w = clearWater({}, reg);
  const m = w.content.manifest;
  const manifest = { ...m, enabledStructures: [...new Set([...(m.enabledStructures ?? []), ...S_IDS])].sort() };
  (w as { content: WorldContent }).content = { ...w.content, manifest };
  return w;
}

/** Add a device as wave 10's command will: a new id, the store kept sorted, geometryVersion bumped. */
function pushDevice(w: World, kind: DeviceKind, x: number, y: number, extra: Partial<Device> = {}): Device {
  const d: Device = { id: w.counters.nextDeviceId++, kind, cell: cellIndex(x, y), ...(kind === 'S09' || kind === 'S10' ? { on: false } : {}), ...extra };
  w.devices = sortDevices([...w.devices, d]);
  w.grid.geometryVersion++;
  return d;
}

/** A vertical line of edge barriers on the R edges of column x (between x and x + 1), over the whole dish. */
function edgeLine(w: World, kind: EdgeKind, x: number, extra: Partial<EdgeBarrier> = {}): void {
  const add: EdgeBarrier[] = [];
  for (let y = 0; y < 128; y++) {
    if (!inMask(x, y) || !inMask(x + 1, y)) continue;
    add.push({ id: w.counters.nextDeviceId++, kind, cell: cellIndex(x, y), dir: 'R', ...extra });
  }
  w.edges = sortEdges([...w.edges, ...add]);
  w.grid.geometryVersion++;
}

/** Turn cells into stone or wall directly (test geometry). */
function setStructure(w: World, cells: readonly (readonly [number, number])[], code = ST_STONE): void {
  for (const [x, y] of cells) w.grid.structure[cellIndex(x, y)] = code;
  w.grid.geometryVersion++;
}

/** Stone around a set of open cells (their 4-neighbours not in the set). */
function enclose(w: World, open: readonly (readonly [number, number])[]): void {
  const inside = new Set(open.map(([x, y]) => cellIndex(x, y)));
  const ring: [number, number][] = [];
  for (const [x, y] of open)
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) if (!inside.has(cellIndex(x + dx, y + dy))) ring.push([x + dx, y + dy]);
  setStructure(w, ring);
}

async function reload(w: World): Promise<World> {
  const { text } = await buildSaveFile(w, meta);
  return (await loadSaveFile(text)).world;
}

async function expectRoundTrip(w: World): Promise<void> {
  const back = await reload(w);
  expect(stateHash(back)).toBe(stateHash(w));
  expect(Array.from(back.climate.warmth!)).toEqual(Array.from(w.climate.warmth!));
  run(w, 40);
  run(back, 40);
  expect(stateHash(back)).toBe(stateHash(w));
}

function allInUnit(arr: Float64Array): boolean {
  for (let i = 0; i < arr.length; i++) if (!(arr[i]! >= 0 && arr[i]! <= 1)) return false;
  return true;
}

describe('warmth allocation (driven by recorded devices, never by observation)', () => {
  it('an Off heater allocates nothing over 1,000 ticks, whatever reads warmth or light', () => {
    const w = climateWorld();
    const h = pushDevice(w, 'S09', 60, 64);
    for (let k = 0; k < 10; k++) {
      run(w, 100);
      lightFactors(w, h.cell);
      localWarmthAt(w, h.cell);
      updateDerived(w);
    }
    expect(w.climate.warmth).toBeNull();
    expect(localWarmthAt(w, h.cell)).toBe(w.settings.warmth);
  });

  it('a heater switched On allocates the array at the next stage 2 and not before', async () => {
    const w = climateWorld();
    const h = pushDevice(w, 'S09', 60, 64);
    run(w, 5);
    h.on = true;
    w.grid.geometryVersion++;
    lightFactors(w, h.cell);
    localWarmthAt(w, h.cell);
    updateDerived(w);
    expect(w.climate.warmth).toBeNull();
    // Saved at the paused point, the dish holds no warmth array either; the reload allocates at the same stage 2.
    const back = await reload(w);
    expect(back.climate.warmth).toBeNull();
    expect(stateHash(back)).toBe(stateHash(w));
    run(w, 1);
    run(back, 1);
    const arr = w.climate.warmth!;
    expect(arr).not.toBeNull();
    expect(stateHash(back)).toBe(stateHash(w));
    // Tick 1 of the array: every cell at ambient, the heater's own cell + 0.01/s × dt.
    expect(arr[h.cell]).toBe(0.5 + DEV);
    let off = 0;
    for (let i = 0; i < arr.length; i++) if (i !== h.cell && arr[i] !== 0.5) off++;
    expect(off).toBe(0);
    await expectRoundTrip(w);
  });

  it('the new array starts at settings.warmth (0.62 here), not at the 0.5 default: a far cell reads exactly 0.62', async () => {
    const w = climateWorld();
    w.settings.warmth = 0.62;
    const h = pushDevice(w, 'S09', 60, 64, { on: true });
    const far = cellIndex(90, 64);
    run(w, 1);
    const arr = w.climate.warmth!;
    expect(arr[far]).toBe(0.62);
    expect(arr[h.cell]).toBe(0.62 + DEV);
    let off = 0;
    for (let i = 0; i < arr.length; i++) if (i !== h.cell && arr[i] !== 0.62) off++;
    expect(off).toBe(0);
    run(w, 50);
    expect(w.climate.warmth![far]).toBe(0.62);
    expect(localWarmthAt(w, far)).toBe(0.62);
    await expectRoundTrip(w);
  });
});

describe('warmth per tick: relax, diffuse, device, clamp', () => {
  it('relax: a sealed cell at 0.9 moves 1 % of the way to settings.warmth each tick', () => {
    const w = climateWorld();
    enclose(w, [[60, 64]]);
    const c = cellIndex(60, 64);
    w.climate.warmth = new Float64Array(w.grid.substrate.length).fill(w.settings.warmth);
    w.climate.warmth[c] = 0.9;
    let v = 0.9;
    for (let t = 0; t < 50; t++) {
      run(w, 1);
      v = v + WARMTH_RELAX_PER_TICK * (0.5 - v);
      expect(w.climate.warmth[c]).toBe(v);
    }
    expect(v).toBeCloseTo(0.5 + 0.4 * 0.99 ** 50, 12);
  });

  it('diffusion: a heater\'s gradient reaches its 4-neighbours with coefficient 0.05, not its diagonals', () => {
    const w = climateWorld();
    const h = pushDevice(w, 'S09', 60, 64, { on: true });
    run(w, 1);
    const arr = w.climate.warmth!;
    const c1 = arr[h.cell]!;
    run(w, 1);
    const relaxed = c1 + WARMTH_RELAX_PER_TICK * (0.5 - c1);
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) expect(arr[cellIndex(60 + dx!, 64 + dy!)]).toBeCloseTo(0.5 + 0.05 * (relaxed - 0.5), 15);
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) expect(arr[cellIndex(60 + dx!, 64 + dy!)]).toBe(0.5);
    expect(arr[h.cell]).toBeCloseTo(relaxed - 4 * 0.05 * (relaxed - 0.5) + DEV, 15);
  });

  const beyondAtAmbient = (w: World, x0: number): number => {
    let bad = 0;
    for (const i of maskCells()) if (cellX(i) >= x0 && w.climate.warmth![i] !== w.settings.warmth) bad++;
    return bad;
  };

  it('a WALL line and a closed S03 line stop warmth: every cell beyond stays exactly at ambient', () => {
    const wall = climateWorld();
    const cells: [number, number][] = [];
    for (let y = 0; y < 128; y++) if (inMask(70, y)) cells.push([70, y]);
    setStructure(wall, cells, ST_WALL);
    pushDevice(wall, 'S09', 68, 64, { on: true });
    run(wall, 300);
    expect(wall.climate.warmth![cellIndex(69, 64)]).toBeGreaterThan(0.5);
    expect(beyondAtAmbient(wall, 71)).toBe(0);

    const shut = climateWorld();
    edgeLine(shut, 'S03', 69, { open: false });
    pushDevice(shut, 'S09', 68, 64, { on: true });
    run(shut, 300);
    expect(shut.climate.warmth![cellIndex(69, 64)]).toBeGreaterThan(0.5);
    expect(beyondAtAmbient(shut, 70)).toBe(0);
  });

  it('a shutter line toggled IN PLACE (EdgeBarrier.open, no geometryVersion bump) stops or passes warmth at once, and the dish equals its reload', async () => {
    const w = climateWorld();
    edgeLine(w, 'S03', 69, { open: false });
    pushDevice(w, 'S09', 68, 64, { on: true });
    run(w, 100);
    expect(beyondAtAmbient(w, 70)).toBe(0);
    for (const e of w.edges) e.open = true; // a writer that forgets the bump
    let back = await reload(w);
    run(w, 100);
    run(back, 100);
    expect(w.climate.warmth![cellIndex(70, 64)]).toBeGreaterThan(0.5);
    expect(stateHash(back)).toBe(stateHash(w));
    for (const e of w.edges) e.open = false; // and closed again, in place
    const nearSide = w.climate.warmth![cellIndex(69, 64)]!;
    back = await reload(w);
    run(w, 100);
    run(back, 100);
    expect(stateHash(back)).toBe(stateHash(w));
    // Closed again: the near side gains (no outflow across the line), so it ends warmer than it was.
    expect(w.climate.warmth![cellIndex(69, 64)]).toBeGreaterThan(nearSide);
  });

  it('S01, S02, an open S03 and an S04 line pass warmth fully (D-0106)', () => {
    const plain = climateWorld();
    pushDevice(plain, 'S09', 68, 64, { on: true });
    run(plain, 300);
    const free = plain.climate.warmth![cellIndex(70, 64)]!;
    expect(free).toBeGreaterThan(0.5);
    const lines: [EdgeKind, Partial<EdgeBarrier>][] = [
      ['S01', {}],
      ['S02', {}],
      ['S03', { open: true }],
      ['S04', { flow: 1 }],
    ];
    for (const [kind, extra] of lines) {
      const w = climateWorld();
      edgeLine(w, kind, 69, extra);
      pushDevice(w, 'S09', 68, 64, { on: true });
      run(w, 300);
      expect(w.climate.warmth![cellIndex(70, 64)], kind).toBe(free);
    }
  });

  it('device: a heater alone in a sealed cell follows the relax + device recurrence; a cooler mirrors it', () => {
    for (const [kind, sign] of [['S09', 1], ['S10', -1]] as const) {
      const w = climateWorld();
      enclose(w, [[60, 64]]);
      const d = pushDevice(w, kind, 60, 64, { on: true });
      let v = 0.5;
      for (let t = 0; t < 400; t++) {
        run(w, 1);
        v = v + WARMTH_RELAX_PER_TICK * (0.5 - v);
        v = sign > 0 ? v + DEV : v - DEV;
        expect(w.climate.warmth![d.cell], `${kind} tick ${t}`).toBe(v);
      }
      // Toward the equilibrium 0.5 ± 0.1 (0.001 per tick against 1 % relaxation).
      expect(Math.abs(v - 0.5)).toBeGreaterThan(0.09);
    }
  });

  it("two heaters' gradients add (the system is linear while nothing clamps)", () => {
    const at = cellIndex(63, 64);
    const rise = (pos: [number, number][]): number => {
      const w = climateWorld();
      for (const [x, y] of pos) pushDevice(w, 'S09', x, y, { on: true });
      run(w, 200);
      return w.climate.warmth![at]! - 0.5;
    };
    const a = rise([[60, 64]]);
    const b = rise([[66, 64]]);
    const both = rise([[60, 64], [66, 64]]);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(both).toBeCloseTo(a + b, 12);
  });

  it('clamp: two heaters in a sealed chamber reach exactly 1 and stay; coolers reach exactly 0; round trips at the clamp', async () => {
    for (const [kind, ambient, bound] of [['S09', 0.95, 1], ['S10', 0.05, 0]] as const) {
      const w = climateWorld();
      w.settings.warmth = ambient;
      enclose(w, [[60, 64], [61, 64]]);
      const a = pushDevice(w, kind, 60, 64, { on: true });
      const b = pushDevice(w, kind, 61, 64, { on: true });
      run(w, 500);
      expect(w.climate.warmth![a.cell]).toBe(bound);
      expect(w.climate.warmth![b.cell]).toBe(bound);
      run(w, 100);
      expect(w.climate.warmth![a.cell]).toBe(bound);
      expect(allInUnit(w.climate.warmth!)).toBe(true);
      await expectRoundTrip(w);
    }
  });

  it('every value stays in [0, 1] over 5,000 ticks of mixed devices; round trip mid-gradient', async () => {
    const w = climateWorld();
    w.settings.warmth = 0.92;
    for (let k = 0; k < 6; k++) pushDevice(w, 'S09', 50 + k, 60, { on: true });
    for (let k = 0; k < 6; k++) pushDevice(w, 'S10', 50 + k, 70, { on: true });
    pushDevice(w, 'S09', 80, 80, { on: false });
    enclose(w, [[90, 64]]);
    pushDevice(w, 'S09', 90, 64, { on: true });
    let saw1 = false;
    for (let k = 0; k < 10; k++) {
      run(w, 500);
      expect(allInUnit(w.climate.warmth!), `tick ${w.tick}`).toBe(true);
      if (w.climate.warmth![cellIndex(90, 64)] === 1) saw1 = true;
      if (k === 0) await expectRoundTrip(w);
    }
    expect(saw1).toBe(true);
  });
});

describe('suitability reads local warmth', () => {
  it('an organism whose warmth range excludes the heated cell gets SUIT_WARMTH there, response(localWarmth, …)', () => {
    const w = climateWorld();
    w.settings.warmth = 0.6;
    enclose(w, [[60, 64]]);
    const h = pushDevice(w, 'S09', 60, 64, { on: true });
    const slot = place(w, 'B01', 40.5, 64.5);
    const prof = profileOf(w, slot);
    const sp = w.species[w.ents.cols.species[slot]!]!;
    run(w, 1000);
    const local = localWarmthAt(w, h.cell);
    expect(local).toBeGreaterThan(prof.warmth[1]);
    const r = suitabilityAt(w, sp, prof, h.cell);
    expect(r.reason).toBe(R.SUIT_WARMTH);
    expect(r.value).toBe(response(local, prof.warmth[0], prof.warmth[1], SHOULDER_WARMTH));
    // A cell at ambient (0.6, inside the range) is unaffected.
    expect(suitabilityAt(w, sp, prof, cellIndex(40, 80)).reason).not.toBe(R.SUIT_WARMTH);
  });

  it('without a warmth array, suitabilityAt is bit-identical to the shipped registry world for 50 (species, cell) pairs', () => {
    const make = (reg?: ContentRegistry): { w: World; slots: number[] } => {
      const w = reg ? clearWater({}, reg) : clearWater();
      w.settings.warmth = 0.62;
      const slots = [place(w, 'B01', 40.5, 64.5), place(w, 'A01', 44.5, 64.5), place(w, 'P01', 48.5, 64.5)];
      run(w, 20);
      return { w, slots };
    };
    const a = make(REG);
    const b = make();
    expect(a.w.climate.warmth).toBeNull();
    let n = 0;
    for (let k = 0; k < 17; k++) {
      const cell = maskCells()[(k * 677) % maskCells().length]!;
      for (let s = 0; s < 3 && n < 50; s++, n++) {
        const sa = a.w.species[a.w.ents.cols.species[a.slots[s]!]!]!;
        const sb = b.w.species[b.w.ents.cols.species[b.slots[s]!]!]!;
        const ra = { ...suitabilityAt(a.w, sa, profileOf(a.w, a.slots[s]!), cell) };
        const rb = { ...suitabilityAt(b.w, sb, profileOf(b.w, b.slots[s]!), cell) };
        expect(Object.is(ra.value, rb.value) && ra.reason === rb.reason && Object.is(ra.exposure, rb.exposure), `cell ${cell} species ${sa.id}`).toBe(true);
      }
    }
    expect(n).toBe(50);
  });
});
