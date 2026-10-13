/**
 * World schema 5 stores and columns (Phase 5 foundation; SPEC §2.4–§2.5, §4.6–§4.8, §6.1, §14.1; D-0102):
 * edge barriers, devices, local climate, gate tallies, nextDeviceId, settings.cycleStartTick and the
 * Phase 5 entity columns.
 * - They save and load exactly (serialize → deserialize, and buildSaveFile → loadSaveFile through the
 *   import checks), with equal stateHash.
 * - Hash-neutral only while empty (the D-0035 rule): each store, counter and column changes stateHash
 *   when set and gives it back when cleared; gateTally (observation only) never changes it.
 * - A held sample hashes as before the columns existed until a held row holds a Phase 5 value.
 * - 4× equals 1×: the edge and device stores are carried unchanged; since wave 9 the climate stage reads the
 *   warmth store and its On heater, so warmth evolves, identically at 1× and 4×.
 * Worlds record the 'climate', 'barriers' and 'devices' systems through registryWith, and S01–S12
 * directly on the world's recorded manifest (the registry cannot enable S-structures before wave 8b).
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { edgeStoreProblem, type EdgeBarrier } from '../../src/sim/barriers';
import { deviceStoreProblem, type Device } from '../../src/sim/devices';
import { emptyValueOf, ENTITY_COLUMNS, type ColumnName } from '../../src/sim/entities';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex } from '../../src/sim/grid';
import { canonicalJson } from '../../src/sim/hash';
import { encodeSample, type SampleRow, type SampleSlot } from '../../src/sim/sampleSlot';
import { COLUMNS_ADDED_IN, deserializeWorld, hashedSample, serializeWorld, stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import type { GateTally, World, WorldContent } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, place, registry } from '../helpers/world';

const SCHEMA5 = COLUMNS_ADDED_IN[5]!;
const S_IDS = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'];
const SYSTEMS = [...registry().manifest.enabledSystems, 'barriers', 'climate', 'devices'].sort() as SystemFlag[];
const REG = registryWith({ enabledSystems: SYSTEMS });
const meta = { name: 'schema 5 stores', savedAt: '2026-10-13T00:00:00Z', recipeId: null };

/** A clear-water dish that records the Phase 5 systems and S01–S12, with three organisms. */
function phase5World(): World {
  const w = clearWater({}, REG);
  const m = w.content.manifest;
  const manifest = { ...m, enabledStructures: [...(m.enabledStructures ?? []), ...S_IDS].sort() };
  (w as { content: WorldContent }).content = { ...w.content, manifest };
  place(w, 'B01', 40.5, 64.5, { E: 30 });
  place(w, 'B01', 44.5, 64.5, { E: 30 });
  place(w, 'B04', 48.5, 64.5, { E: 30 });
  return w;
}

const EDGES: readonly EdgeBarrier[] = [
  { id: 1, kind: 'S01', cell: cellIndex(60, 60), dir: 'R' },
  { id: 2, kind: 'S02', cell: cellIndex(60, 62), dir: 'D' },
  { id: 3, kind: 'S03', cell: cellIndex(61, 64), dir: 'R', open: false },
  { id: 4, kind: 'S04', cell: cellIndex(62, 66), dir: 'D', flow: -1, nextOrganismTick: 5 },
];
const DEVICES: readonly Device[] = [
  { id: 5, kind: 'S05', cell: cellIndex(70, 70) },
  { id: 6, kind: 'S06', cell: cellIndex(71, 70) },
  { id: 7, kind: 'S07', cell: cellIndex(72, 70) },
  { id: 8, kind: 'S08', cell: cellIndex(73, 70), resinSelect: ['inhBact', 'rival'], bound: { inhBact: 1.5, rival: 0.25 } },
  { id: 9, kind: 'S09', cell: cellIndex(74, 70), on: true },
  { id: 10, kind: 'S10', cell: cellIndex(75, 70), on: false },
  { id: 11, kind: 'S11', cell: cellIndex(76, 70) },
  { id: 12, kind: 'S12', cell: cellIndex(77, 70) },
];
const TALLY: readonly GateTally[] = [
  { id: 1, fields: { sugar: 0.5, oxygen: 1.25 }, organisms: 0 },
  { id: 2, fields: {}, organisms: 3 },
];

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A world holding every schema 5 store, a light cycle and a set nextDeviceId. */
function storesWorld(): World {
  const w = phase5World();
  w.edges.push(...copy(EDGES));
  w.devices.push(...copy(DEVICES));
  w.climate.warmth = new Float64Array(w.grid.substrate.length).fill(0.5);
  w.climate.warmth[cellIndex(74, 70)] = 0.75;
  w.climate.moisture = new Float64Array(w.grid.substrate.length).fill(0.8);
  w.gateTally.push(...copy(TALLY));
  w.counters.nextDeviceId = 13;
  w.settings = { ...w.settings, lightMode: 'cycle', cycleStartTick: 0 };
  return w;
}

/** A non-empty test value for each schema 5 column. */
const SET_VALUE: Readonly<Record<string, number>> = { glowState: 1, metabolicMode: 2, trapSlot: 0, heldBySlot: 1, trapBirthId: 7, heldByBirthId: 9 };
const setValueOf = (name: ColumnName) => SET_VALUE[name] ?? 0.5;

function firstLiving(w: World): number {
  for (let i = 0; i < w.ents.highWater; i++) if (w.ents.cols.alive[i] === 1) return i;
  throw new Error('no organism');
}

describe('schema 5 stores save exactly', () => {
  it('the test stores are valid for the dish (edgeStoreProblem / deviceStoreProblem accept them)', () => {
    const w = storesWorld();
    const structures = { enabledStructures: w.content.manifest.enabledStructures! };
    expect(edgeStoreProblem(w.edges, w.grid, structures)).toBeNull();
    expect(deviceStoreProblem(w.devices, w.grid, structures)).toBeNull();
  });

  it('serialize → deserialize keeps every store, the counter and cycleStartTick, with an equal stateHash', () => {
    const w = storesWorld();
    const state = serializeWorld(w);
    expect(state.climate!.warmth!.dtype).toBe('f64'); // a typed payload, never JSON numbers
    const back = deserializeWorld(copy(state));
    expect(stateHash(back)).toBe(stateHash(w));
    expect(back.edges).toEqual(EDGES);
    expect(back.devices).toEqual(DEVICES);
    expect(Array.from(back.climate.warmth!)).toEqual(Array.from(w.climate.warmth!));
    expect(Array.from(back.climate.moisture!)).toEqual(Array.from(w.climate.moisture!));
    expect(back.gateTally).toEqual(TALLY);
    expect(back.counters.nextDeviceId).toBe(13);
    expect(back.settings.cycleStartTick).toBe(0);
    // Deep copies: editing the loaded world never reaches the state it came from.
    back.edges[0]!.open = true;
    back.gateTally[0]!.organisms = 99;
    expect(state.edges![0]!.open).toBeUndefined();
    expect(state.gateTally![0]!.organisms).toBe(0);
  });

  it('buildSaveFile → loadSaveFile (through the import checks) keeps every store with an equal stateHash', async () => {
    const w = storesWorld();
    const { text } = await buildSaveFile(w, meta);
    const json = JSON.parse(text) as { schemaVersion: number };
    expect(json.schemaVersion).toBe(5);
    const { world } = await loadSaveFile(text);
    expect(stateHash(world)).toBe(stateHash(w));
    expect(world.edges).toEqual(EDGES);
    expect(world.devices).toEqual(DEVICES);
    expect(world.gateTally).toEqual(TALLY);
    expect(world.climate.warmth![cellIndex(74, 70)]).toBe(0.75);
    expect(world.settings.cycleStartTick).toBe(0);
    expect(world.content.provenance.migratedFrom).toBeUndefined();
  });

  it('a climate payload of the wrong length is refused when the world is rebuilt', () => {
    const state = serializeWorld(storesWorld());
    const bad = { ...state, climate: { warmth: { ...state.climate!.warmth!, length: 10 }, moisture: null } };
    expect(() => deserializeWorld(bad)).toThrow(/climate warmth has wrong length/);
  });
});

describe('schema 5 state is hash-neutral only while empty (D-0035 rule)', () => {
  it('each store and the counter changes stateHash when set and gives it back when cleared; gateTally never does', () => {
    const w = phase5World();
    const h0 = stateHash(w);
    // An all-zero climate array is state too (allocated means local values exist).
    const toggles: [string, () => void, () => void][] = [
      ['edges', () => w.edges.push(copy(EDGES[0]!)), () => void w.edges.splice(0)],
      ['devices', () => w.devices.push(copy(DEVICES[0]!)), () => void w.devices.splice(0)],
      ['climate.warmth', () => (w.climate.warmth = new Float64Array(w.grid.substrate.length)), () => (w.climate.warmth = null)],
      ['climate.moisture', () => (w.climate.moisture = new Float64Array(w.grid.substrate.length)), () => (w.climate.moisture = null)],
      ['nextDeviceId', () => (w.counters.nextDeviceId = 2), () => (w.counters.nextDeviceId = 1)],
      ['cycleStartTick', () => (w.settings = { ...w.settings, lightMode: 'cycle', cycleStartTick: 0 }), () => {
          const { cycleStartTick: _c, ...rest } = w.settings;
          w.settings = { ...rest, lightMode: 'fixed' };
        },
      ],
    ];
    for (const [name, set, clear] of toggles) {
      set();
      expect(stateHash(w), name).not.toBe(h0);
      clear();
      expect(stateHash(w), name).toBe(h0);
    }
    w.gateTally.push(...copy(TALLY));
    expect(stateHash(w)).toBe(h0);
    w.gateTally[0]!.organisms = 1000;
    expect(stateHash(w)).toBe(h0);
  });

  it('each of the 12 schema 5 columns changes stateHash when set on a living organism and gives it back when cleared', () => {
    const w = phase5World();
    const slot = firstLiving(w);
    const h0 = stateHash(w);
    expect(SCHEMA5).toHaveLength(12);
    for (const name of SCHEMA5) {
      const arr = w.ents.cols[name] as unknown as Float64Array;
      expect(arr[slot]).toBe(emptyValueOf(name));
      arr[slot] = setValueOf(name);
      expect(stateHash(w), name).not.toBe(h0);
      arr[slot] = emptyValueOf(name);
      expect(stateHash(w), name).toBe(h0);
    }
  });

  it('a held sample hashes without the schema 5 columns while every held row holds them empty; a held trap reserve changes it', () => {
    const w = phase5World();
    const slot = firstLiving(w);
    const cols: Record<string, number> = {};
    for (const [name] of ENTITY_COLUMNS) cols[name] = (w.ents.cols[name] as ArrayLike<number>)[slot]!;
    const g = w.ents.cols.genome[slot]!;
    const sample: SampleSlot = {
      txId: 'tx-5',
      seq: w.commands.nextSeq,
      mode: 'life',
      origin: [40, 64],
      radius: 1,
      rows: [{ slot, cols: cols as SampleRow['cols'] }],
      cells: [],
      objects: [],
      genomes: [{ index: g, genome: serializeWorld(w).genomes[g]! }],
    };
    w.ents.free(slot);
    w.sample = sample;
    // The hashed form is the saved form with exactly the 12 schema 5 columns deleted: what the v1.0 build hashed.
    const saved = encodeSample(sample);
    const before = { ...saved, rows: { ...saved.rows, columns: { ...saved.rows.columns } } };
    for (const name of SCHEMA5) delete (before.rows.columns as Record<string, unknown>)[name];
    expect(canonicalJson(hashedSample(sample))).toBe(canonicalJson(before));
    expect(Object.keys(saved.rows.columns)).toEqual(expect.arrayContaining([...SCHEMA5]));
    const h1 = stateHash(w);

    w.sample = { ...sample, rows: [{ slot, cols: { ...sample.rows[0]!.cols, trapReserveC: 0.5 } }] };
    expect(Object.keys(hashedSample(w.sample).rows.columns)).toContain('trapReserveC');
    expect(stateHash(w)).not.toBe(h1);
    w.sample = sample;
    expect(stateHash(w)).toBe(h1);
  });
});

// Wave 9's climate stage reads this world's warmth store and its On heater (the world records 'climate'),
// so warmth now evolves; the edge and device stores are still carried unchanged (lead, wave 9 integration).
describe('the stores are carried, and 4× equals 1×', () => {
  it('4× equals 1×: run(400) and four run(100) give the same hash on a world holding every store', () => {
    const a = storesWorld();
    const b = deserializeWorld(serializeWorld(a));
    expect(stateHash(b)).toBe(stateHash(a));
    run(a, 400);
    for (let k = 0; k < 4; k++) run(b, 100);
    expect(stateHash(b)).toBe(stateHash(a));
    expect(a.edges).toEqual(EDGES);
    expect(a.devices).toEqual(DEVICES);
    expect(a.gateTally).toEqual(TALLY);
    expect(Array.from(b.climate.warmth!)).toEqual(Array.from(a.climate.warmth!));
    expect(a.climate.warmth![cellIndex(74, 70)]).not.toBe(0.75); // the climate stage acted on it
  });
});
