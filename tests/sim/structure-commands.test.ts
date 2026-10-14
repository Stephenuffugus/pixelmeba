/**
 * Phase 5 wave 10 structure-commands: the stage 1 semantics of the edge barrier and furnishing/device
 * commands (SPEC §2.4, §10.1, §10.4, §10.5; CT §4, §14; D-0106, D-0108, D-0117; src/sim/structureEdits.ts).
 * - placeEdges of each kind, ids from nextDeviceId in edgeKey order, the sorted store, refusals by reason
 *   (rim, stone, wall, an occupied edge, an S04 touching gel or a bead, the 512 cap), malformed payloads;
 * - placeDevice of S05–S12 starting Off, refusals (rim, stone, wall, bead, an occupied cell, the shared cap);
 * - removeStructures (the resin's export, the basket's object left in place, tallies kept), moveDevice
 *   (id and settings kept, the basket carrying its object), setDevice ('unchanged', refusals);
 * - grid.geometryVersion moves exactly once per accepted command and never on a refused one, and wave 9's
 *   movement sees an edge placed by command (the bump works end to end);
 * - a v1.0 dish (shipped registry) refuses every new kind "not in this dish" and stays byte-identical;
 * - inoculation and Sample Transfer into shelter cells (canOccupy), the mesh, and the basket under Take.
 * Every state change is followed by buildSaveFile → loadSaveFile with an equal stateHash.
 * Worlds: clear water under tests/helpers/world.ts barrierRegistry() (S01–S12 and the 'barriers',
 * 'climate' and 'devices' systems, allowUnimplemented: the lead lists the structures as implemented at the
 * systems flip, D-0104). Edges and devices are placed by the commands themselves unless a test needs a
 * pre-existing store (the caps), which it says.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { applyNow, type CommandPayload, type CommandResult } from '../../src/sim/commands';
import { EDGE_S01, edgeKey, type EdgeBarrier } from '../../src/sim/barriers';
import { DEVICE_KINDS, type DeviceKind } from '../../src/sim/devices';
import { edgeCodesOf } from '../../src/sim/edgePassage';
import { brushCells, cellIndex, inMask, NOT_IN_DISH } from '../../src/sim/grid';
import { canonicalJson } from '../../src/sim/hash';
import { computeTotals } from '../../src/sim/ledger';
import { objectAt } from '../../src/sim/objects';
import { serializeWorld, stateHash } from '../../src/sim/serialize';
import { applyStructureCommand, type StructureCommandPayload } from '../../src/sim/structureEdits';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { aliveOf, barrierRegistry, clearWater, place, placeObject, preFlipRegistry, pushDevices } from '../helpers/world';

const REG = barrierRegistry();
const dish = (): World => clearWater({}, REG);
const meta = { name: 'structure commands', savedAt: '2026-10-14T00:00:00Z', recipeId: null };
let seq = 0;
const cmd = (w: World, p: CommandPayload): CommandResult => applyNow(w, `sc${seq++}`, p).result!;
const c = cellIndex;

/** buildSaveFile → loadSaveFile: the import accepts the file and the reloaded world hashes the same. */
async function roundTrip(w: World): Promise<World> {
  const { text } = await buildSaveFile(w, meta);
  const { world } = await loadSaveFile(text);
  expect(stateHash(world)).toBe(stateHash(w));
  return world;
}

/** Apply a command and check geometryVersion moved exactly once when it changed a store, else not at all. */
function geo(w: World, p: CommandPayload): CommandResult {
  const before = w.grid.geometryVersion;
  const res = cmd(w, p);
  expect(w.grid.geometryVersion, `${p.kind} ${JSON.stringify(res)}`).toBe(before + (res.accepted > 0 && p.kind !== 'wetBrush' && p.kind !== 'setLightMode' && p.kind !== 'setDrying' ? 1 : 0));
  return res;
}

/** The rightmost in-dish cell of row y (its R edge leaves the dish). */
function rimCell(y: number): number {
  let x = 127;
  while (!inMask(x, y)) x--;
  return c(x, y);
}

describe('placeEdges', () => {
  it('places each kind with ids from nextDeviceId in edgeKey order, sorted, and the save loads', async () => {
    const w = dish();
    const next = w.counters.nextDeviceId;
    // Given out of edgeKey order: the ids follow edgeKey order, not the stroke's.
    const res = geo(w, { kind: 'placeEdges', structure: 'S01', edges: [[c(70, 60), 'D'], [c(60, 60), 'R'], [c(60, 60), 'D']] });
    expect(res).toEqual({ accepted: 3, rejected: 0, ids: [next, next + 1, next + 2] });
    expect(w.edges).toEqual([
      { id: next, kind: 'S01', cell: c(60, 60), dir: 'R' },
      { id: next + 1, kind: 'S01', cell: c(60, 60), dir: 'D' },
      { id: next + 2, kind: 'S01', cell: c(70, 60), dir: 'D' },
    ]);
    expect(w.counters.nextDeviceId).toBe(next + 3);
    expect(geo(w, { kind: 'placeEdges', structure: 'S02', edges: [[c(50, 50), 'R']] }).accepted).toBe(1);
    expect(geo(w, { kind: 'placeEdges', structure: 'S03', edges: [[c(52, 50), 'R']], open: true }).accepted).toBe(1);
    expect(geo(w, { kind: 'placeEdges', structure: 'S03', edges: [[c(54, 50), 'R']], open: false }).accepted).toBe(1);
    expect(geo(w, { kind: 'placeEdges', structure: 'S04', edges: [[c(56, 50), 'R']], flow: 1 }).accepted).toBe(1);
    expect(geo(w, { kind: 'placeEdges', structure: 'S04', edges: [[c(58, 50), 'D']], flow: -1 }).accepted).toBe(1);
    const at = (cell: number, dir: 'R' | 'D') => w.edges.find((e) => e.cell === cell && e.dir === dir)!;
    expect(at(c(50, 50), 'R')).toEqual({ id: next + 3, kind: 'S02', cell: c(50, 50), dir: 'R' });
    expect(at(c(52, 50), 'R')).toEqual({ id: next + 4, kind: 'S03', cell: c(52, 50), dir: 'R', open: true });
    expect(at(c(54, 50), 'R')).toEqual({ id: next + 5, kind: 'S03', cell: c(54, 50), dir: 'R', open: false });
    expect(at(c(56, 50), 'R')).toEqual({ id: next + 6, kind: 'S04', cell: c(56, 50), dir: 'R', flow: 1 }); // no nextOrganismTick
    expect(at(c(58, 50), 'D')).toEqual({ id: next + 7, kind: 'S04', cell: c(58, 50), dir: 'D', flow: -1 });
    const keys = w.edges.map((e) => edgeKey(e.cell, e.dir));
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
    await roundTrip(w);
  });

  it('refuses by reason: rim, stone, wall, an occupied edge, an S04 touching gel or a bead', async () => {
    const w = dish();
    expect(cmd(w, { kind: 'placeStructure', structure: 'stone', points: [[40.5, 70.5]], radius: 1 }).accepted).toBeGreaterThan(0);
    expect(cmd(w, { kind: 'placeStructure', structure: 'wall', points: [[40.5, 80.5]], radius: 1 }).accepted).toBeGreaterThan(0);
    expect(cmd(w, { kind: 'placeStructure', structure: 'bead', points: [[80.5, 80.5]], radius: 1 }).accepted).toBeGreaterThan(0);
    expect(cmd(w, { kind: 'paintSubstrate', substrate: 'gel', points: [[80.5, 40.5]], radius: 1 }).accepted).toBeGreaterThan(0);
    expect(geo(w, { kind: 'placeEdges', structure: 'S01', edges: [[c(60, 60), 'R']] }).accepted).toBe(1);
    const before = canonicalJson(w.edges);
    const res = geo(w, {
      kind: 'placeEdges',
      structure: 'S01',
      edges: [
        [rimCell(64), 'R'], // the neighbour is outside the dish
        [0, 'R'], // the cell itself is outside
        [c(39, 70), 'R'], // into the stone at (40, 70)
        [c(40, 79), 'D'], // into the wall at (40, 80)
        [c(60, 60), 'R'], // already holds the S01
        [c(79, 80), 'R'], // beside a bead: allowed for an S01
      ],
    });
    expect(res).toMatchObject({ accepted: 1, rejected: 5, refused: { rim: 2, structure: 2, barrier: 1 } });
    expect(canonicalJson(w.edges)).not.toBe(before);
    const ch = geo(w, { kind: 'placeEdges', structure: 'S04', edges: [[c(79, 40), 'R'], [c(80, 79), 'D'], [c(60, 61), 'R']], flow: 1 });
    expect(ch).toMatchObject({ accepted: 1, rejected: 2, refused: { channel: 2 } }); // gel at (80, 40), the bead at (80, 80)
    const none = geo(w, { kind: 'placeEdges', structure: 'S02', edges: [[rimCell(70), 'R']] });
    expect(none).toEqual({ accepted: 0, rejected: 1, note: 'nothing placed', refused: { rim: 1 } });
    await roundTrip(w);
  });

  it('stops at the 512 cap with a partial accept', async () => {
    const w = dish();
    const all: (readonly [number, 'R'])[] = [];
    for (let y = 20; y < 108 && all.length < 512; y++) for (let x = 20; x < 100 && all.length < 512; x += 2) if (inMask(x, y) && inMask(x + 1, y)) all.push([c(x, y), 'R']);
    expect(geo(w, { kind: 'placeEdges', structure: 'S01', edges: all.slice(0, 510) }).accepted).toBe(510);
    const tail = all.slice(510, 512).concat([[c(21, 60), 'R'], [c(23, 60), 'R'], [c(25, 60), 'R']] as const);
    const res = geo(w, { kind: 'placeEdges', structure: 'S02', edges: tail });
    expect(res.accepted).toBe(2);
    expect(res.refused).toEqual({ cap: 3 });
    expect(w.edges.length).toBe(512);
    await roundTrip(w);
  });

  it('refuses a malformed payload whole: nothing changes', () => {
    const w = dish();
    const bad: unknown[] = [
      { kind: 'placeEdges', structure: 'S05', edges: [[c(60, 60), 'R']] },
      { kind: 'placeEdges', structure: 'S03', edges: [[c(60, 60), 'R']] },
      { kind: 'placeEdges', structure: 'S01', edges: [[c(60, 60), 'R']], open: true },
      { kind: 'placeEdges', structure: 'S04', edges: [[c(60, 60), 'R']] },
      { kind: 'placeEdges', structure: 'S01', edges: [[c(60, 60), 'R']], flow: 1 },
      { kind: 'placeEdges', structure: 'S01', edges: [[c(60, 60) + 0.5, 'R']] },
      { kind: 'placeEdges', structure: 'S01', edges: [[-1, 'R']] },
      { kind: 'placeEdges', structure: 'S01', edges: [[c(60, 60), 'L']] },
      { kind: 'placeEdges', structure: 'S01', edges: [[c(60, 60), 'R'], [c(60, 60), 'R']] },
      { kind: 'placeEdges', structure: 'S01', edges: [] },
      { kind: 'placeEdges', structure: 'S01', edges: [[c(60, 60), 'R']], extra: 1 },
      { kind: 'placeDevice', structure: 'S01', cell: c(60, 60) },
      { kind: 'placeDevice', structure: 'S05', cell: 1.5 },
      { kind: 'removeStructures', ids: [] },
      { kind: 'removeStructures', ids: [1, 1] },
      { kind: 'removeStructures', ids: [0] },
      { kind: 'moveDevice', id: 1, cell: -3 },
      { kind: 'setDevice', id: 1 },
      { kind: 'setDevice', id: 1, on: true, open: true },
      { kind: 'setDevice', id: 1, resinSelect: ['rival', 'inhBact'] },
      { kind: 'setDevice', id: 1, on: 1 },
      { kind: 'wetBrush', points: [[60.5, 60.5]], radius: 2 },
      { kind: 'setLightMode', mode: 'dusk' },
      { kind: 'setDrying', drying: 'yes' },
    ];
    const json = canonicalJson(serializeWorld(w));
    for (const p of bad) {
      const res = applyStructureCommand(w, p as StructureCommandPayload);
      expect(res.accepted, JSON.stringify(p)).toBe(0);
      expect(res.rejected, JSON.stringify(p)).toBe(0);
      expect(typeof res.note, JSON.stringify(p)).toBe('string');
    }
    expect(canonicalJson(serializeWorld(w))).toBe(json);
  });
});

describe('placeDevice', () => {
  it('places each of S05–S12 Off, sorted by cell, and the save loads', async () => {
    const w = dish();
    const next = w.counters.nextDeviceId;
    DEVICE_KINDS.forEach((kind, k) => {
      expect(geo(w, { kind: 'placeDevice', structure: kind, cell: c(80 - k, 70) })).toEqual({ accepted: 1, rejected: 0, ids: [next + k] });
    });
    expect(w.devices.map((d) => d.cell)).toEqual(DEVICE_KINDS.map((_, k) => c(80 - k, 70)).sort((a, b) => a - b));
    const of = (kind: DeviceKind) => w.devices.find((d) => d.kind === kind)!;
    expect(of('S09')).toEqual({ id: next + 4, kind: 'S09', cell: c(76, 70), on: false });
    expect(of('S10')).toEqual({ id: next + 5, kind: 'S10', cell: c(75, 70), on: false });
    expect(of('S08')).toEqual({ id: next + 3, kind: 'S08', cell: c(77, 70), resinSelect: [] }); // no bound key
    for (const kind of ['S05', 'S06', 'S07', 'S11', 'S12'] as const) expect(Object.keys(of(kind)).sort()).toEqual(['cell', 'id', 'kind']);
    await roundTrip(w);
  });

  it('refuses the rim, stone, wall, bead and an occupied cell; a live organism or an object does not refuse', async () => {
    const w = dish();
    cmd(w, { kind: 'placeStructure', structure: 'stone', points: [[40.5, 70.5]], radius: 1 });
    cmd(w, { kind: 'placeStructure', structure: 'wall', points: [[40.5, 80.5]], radius: 1 });
    cmd(w, { kind: 'placeStructure', structure: 'bead', points: [[80.5, 80.5]], radius: 1 });
    expect(geo(w, { kind: 'placeDevice', structure: 'S05', cell: 0 })).toEqual({ accepted: 0, rejected: 1, note: 'nothing placed', refused: { rim: 1 } });
    for (const cell of [c(40, 70), c(40, 80), c(80, 80)]) expect(geo(w, { kind: 'placeDevice', structure: 'S06', cell }).refused).toEqual({ structure: 1 });
    expect(geo(w, { kind: 'placeDevice', structure: 'S09', cell: c(60, 60) }).accepted).toBe(1);
    expect(geo(w, { kind: 'placeDevice', structure: 'S05', cell: c(60, 60) }).refused).toEqual({ device: 1 });
    place(w, 'P01', 62.5, 60.5);
    placeObject(w, c(64, 60), 'pellet', { sugar: 10 }, 1);
    expect(geo(w, { kind: 'placeDevice', structure: 'S05', cell: c(62, 60) }).accepted).toBe(1);
    expect(geo(w, { kind: 'placeDevice', structure: 'S07', cell: c(64, 60) }).accepted).toBe(1);
    await roundTrip(w);
  });

  it('furnishings and devices share the one 256 cap (pre-existing store pushed for the test)', async () => {
    const w = dish();
    const cells: number[] = [];
    for (let y = 30; y < 100 && cells.length < 258; y++) for (let x = 30; x < 100 && cells.length < 258; x++) cells.push(c(x, y));
    pushDevices(w, cells.slice(0, 200).map((cell) => ({ kind: 'S05' as const, cell })));
    pushDevices(w, cells.slice(200, 255).map((cell) => ({ kind: 'S09' as const, cell })));
    expect(geo(w, { kind: 'placeDevice', structure: 'S10', cell: cells[255]! }).accepted).toBe(1);
    expect(geo(w, { kind: 'placeDevice', structure: 'S10', cell: cells[256]! }).refused).toEqual({ cap: 1 });
    expect(geo(w, { kind: 'placeDevice', structure: 'S11', cell: cells[257]! }).refused).toEqual({ cap: 1 });
    expect(w.devices.length).toBe(256);
    await roundTrip(w);
  });
});

describe('removeStructures', () => {
  it('removes edges and devices by id, exports a resin’s bound activity, leaves the basket’s object and keeps tallies', async () => {
    const w = dish();
    const [e1, e2] = cmd(w, { kind: 'placeEdges', structure: 'S02', edges: [[c(60, 60), 'R'], [c(60, 62), 'R']] }).ids!;
    const [resin] = cmd(w, { kind: 'placeDevice', structure: 'S08', cell: c(70, 70) }).ids!;
    const [basket] = cmd(w, { kind: 'placeDevice', structure: 'S07', cell: c(72, 70) }).ids!;
    const [heater] = cmd(w, { kind: 'placeDevice', structure: 'S09', cell: c(74, 70) }).ids!;
    const pellet = placeObject(w, c(72, 70), 'pellet', { sugar: 10 }, 1);
    cmd(w, { kind: 'setDevice', id: resin!, resinSelect: ['inhBact', 'rival'] });
    // Test device: the resin's stage (barrier-transport) is not here, so its bound amounts are set by hand.
    w.devices.find((d) => d.id === resin)!.bound = { inhBact: 1.5, rival: 0.25 };
    w.gateTally.push({ id: e1!, fields: { sugar: 0.5 }, organisms: 2 });
    const totals = computeTotals(w);
    const res = geo(w, { kind: 'removeStructures', ids: [basket!, resin!, e1!, 999] });
    expect(res).toEqual({ accepted: 3, rejected: 1, ids: [e1!, resin!, basket!].sort((a, b) => a - b), refused: { missing: 1 }, exported: { inhBact: 1.5, rival: 0.25 } });
    expect(w.edges.map((e) => e.id)).toEqual([e2]);
    expect(w.devices.map((d) => d.id)).toEqual([heater]);
    expect(objectAt(w, c(72, 70))).toEqual(pellet);
    expect(computeTotals(w)).toEqual(totals);
    expect(w.gateTally).toEqual([{ id: e1!, fields: { sugar: 0.5 }, organisms: 2 }]);
    await roundTrip(w);
    expect(geo(w, { kind: 'removeStructures', ids: [12345] })).toEqual({ accepted: 0, rejected: 1, note: 'nothing removed', refused: { missing: 1 } });
  });
});

describe('moveDevice', () => {
  it('keeps id, kind and settings; a basket carries its object; other kinds leave objects', async () => {
    const w = dish();
    const [resin] = cmd(w, { kind: 'placeDevice', structure: 'S08', cell: c(70, 70) }).ids!;
    const [heater] = cmd(w, { kind: 'placeDevice', structure: 'S09', cell: c(72, 70) }).ids!;
    const [basket] = cmd(w, { kind: 'placeDevice', structure: 'S07', cell: c(74, 70) }).ids!;
    const [roof] = cmd(w, { kind: 'placeDevice', structure: 'S11', cell: c(76, 70) }).ids!;
    cmd(w, { kind: 'setDevice', id: resin!, resinSelect: ['inhFung'] });
    cmd(w, { kind: 'setDevice', id: heater!, on: true });
    w.devices.find((d) => d.id === resin)!.bound = { inhFung: 2 }; // test device: the resin stage's write
    const pellet = placeObject(w, c(74, 70), 'pellet', { sugar: 10 }, 1);
    const wafer = placeObject(w, c(76, 70), 'wafer', { starch: 6, protein: 4 }, 1);
    expect(geo(w, { kind: 'moveDevice', id: resin!, cell: c(40, 40) })).toEqual({ accepted: 1, rejected: 0 });
    expect(w.devices.find((d) => d.id === resin)).toEqual({ id: resin, kind: 'S08', cell: c(40, 40), resinSelect: ['inhFung'], bound: { inhFung: 2 } });
    expect(geo(w, { kind: 'moveDevice', id: heater!, cell: c(40, 41) }).accepted).toBe(1);
    expect(w.devices.find((d) => d.id === heater)).toEqual({ id: heater, kind: 'S09', cell: c(40, 41), on: true });
    const totals = computeTotals(w);
    expect(geo(w, { kind: 'moveDevice', id: basket!, cell: c(50, 50) }).accepted).toBe(1);
    expect(objectAt(w, c(74, 70))).toBeNull();
    expect(objectAt(w, c(50, 50))).toEqual({ ...pellet, cell: c(50, 50) });
    expect(w.objects.map((o) => o.id)).toEqual([pellet.id, wafer.id]); // id order kept
    expect(geo(w, { kind: 'moveDevice', id: roof!, cell: c(52, 50) }).accepted).toBe(1);
    expect(objectAt(w, c(76, 70))).toEqual(wafer); // a roof carries nothing
    expect(computeTotals(w)).toEqual(totals);
    const cells = w.devices.map((d) => d.cell);
    expect(cells).toEqual([...cells].sort((a, b) => a - b));
    await roundTrip(w);
  });

  it('refuses the rim, a structure, a device, a basket onto another object, an unknown id; the same cell is unchanged', async () => {
    const w = dish();
    cmd(w, { kind: 'placeStructure', structure: 'bead', points: [[40.5, 70.5]], radius: 1 });
    const [basket] = cmd(w, { kind: 'placeDevice', structure: 'S07', cell: c(60, 60) }).ids!;
    const [shelter] = cmd(w, { kind: 'placeDevice', structure: 'S05', cell: c(62, 60) }).ids!;
    const [edge] = cmd(w, { kind: 'placeEdges', structure: 'S01', edges: [[c(50, 50), 'R']] }).ids!;
    placeObject(w, c(60, 60), 'pellet', { sugar: 10 }, 1);
    placeObject(w, c(64, 60), 'pellet', { sugar: 10 }, 1);
    expect(geo(w, { kind: 'moveDevice', id: basket!, cell: 0 })).toEqual({ accepted: 0, rejected: 1, note: 'not moved', refused: { rim: 1 } });
    expect(geo(w, { kind: 'moveDevice', id: basket!, cell: c(40, 70) }).refused).toEqual({ structure: 1 });
    expect(geo(w, { kind: 'moveDevice', id: basket!, cell: c(62, 60) }).refused).toEqual({ device: 1 });
    expect(geo(w, { kind: 'moveDevice', id: basket!, cell: c(64, 60) }).refused).toEqual({ object: 1 });
    expect(geo(w, { kind: 'moveDevice', id: shelter!, cell: c(64, 60) }).accepted).toBe(1); // a shelter may sit on an object
    expect(geo(w, { kind: 'moveDevice', id: basket!, cell: c(60, 60) })).toEqual({ accepted: 0, rejected: 0, note: 'unchanged' });
    expect(geo(w, { kind: 'moveDevice', id: 777, cell: c(30, 60) })).toEqual({ accepted: 0, rejected: 1, note: 'no such structure', refused: { missing: 1 } });
    expect(geo(w, { kind: 'moveDevice', id: edge!, cell: c(30, 60) })).toEqual({ accepted: 0, rejected: 0, note: 'an edge barrier cannot be moved' });
    await roundTrip(w);
  });
});

describe('setDevice', () => {
  it('sets a heater’s and a cooler’s on, a shutter’s open and a resin’s selection; the same value is unchanged', async () => {
    const w = dish();
    const [heater] = cmd(w, { kind: 'placeDevice', structure: 'S09', cell: c(70, 70) }).ids!;
    const [cooler] = cmd(w, { kind: 'placeDevice', structure: 'S10', cell: c(72, 70) }).ids!;
    const [resin] = cmd(w, { kind: 'placeDevice', structure: 'S08', cell: c(74, 70) }).ids!;
    const [shutter] = cmd(w, { kind: 'placeEdges', structure: 'S03', edges: [[c(60, 60), 'R']], open: true }).ids!;
    const dev = (id: number) => w.devices.find((d) => d.id === id)!;
    expect(geo(w, { kind: 'setDevice', id: heater!, on: true })).toEqual({ accepted: 1, rejected: 0 });
    expect(dev(heater!).on).toBe(true);
    await roundTrip(w);
    expect(geo(w, { kind: 'setDevice', id: cooler!, on: true }).accepted).toBe(1);
    expect(geo(w, { kind: 'setDevice', id: heater!, on: true })).toEqual({ accepted: 0, rejected: 0, note: 'unchanged' });
    expect(geo(w, { kind: 'setDevice', id: shutter!, open: false }).accepted).toBe(1);
    expect(w.edges[0]!.open).toBe(false);
    await roundTrip(w);
    expect(geo(w, { kind: 'setDevice', id: shutter!, open: false }).note).toBe('unchanged');
    expect(geo(w, { kind: 'setDevice', id: resin!, resinSelect: ['inhBact', 'rival'] }).accepted).toBe(1);
    w.devices.find((d) => d.id === resin)!.bound = { inhBact: 1 }; // test device: the resin stage's write
    expect(geo(w, { kind: 'setDevice', id: resin!, resinSelect: [] }).accepted).toBe(1); // Off; bound kept
    expect(dev(resin!)).toEqual({ id: resin, kind: 'S08', cell: c(74, 70), resinSelect: [], bound: { inhBact: 1 } });
    expect(geo(w, { kind: 'setDevice', id: resin!, resinSelect: [] }).note).toBe('unchanged');
    await roundTrip(w);
  });

  it('refuses a setting the kind does not take (whole) and an unknown id (missing)', () => {
    const w = dish();
    const [shelter] = cmd(w, { kind: 'placeDevice', structure: 'S05', cell: c(70, 70) }).ids!;
    const [heater] = cmd(w, { kind: 'placeDevice', structure: 'S09', cell: c(72, 70) }).ids!;
    const [membrane] = cmd(w, { kind: 'placeEdges', structure: 'S01', edges: [[c(60, 60), 'R']] }).ids!;
    const json = canonicalJson(w.devices) + canonicalJson(w.edges);
    expect(geo(w, { kind: 'setDevice', id: shelter!, on: true })).toEqual({ accepted: 0, rejected: 0, note: 'S05 has no on setting' });
    expect(geo(w, { kind: 'setDevice', id: heater!, open: true })).toEqual({ accepted: 0, rejected: 0, note: 'S09 has no open setting' });
    expect(geo(w, { kind: 'setDevice', id: heater!, resinSelect: ['rival'] })).toEqual({ accepted: 0, rejected: 0, note: 'S09 has no resin setting' });
    expect(geo(w, { kind: 'setDevice', id: membrane!, open: true })).toEqual({ accepted: 0, rejected: 0, note: 'S01 has no open setting' });
    expect(geo(w, { kind: 'setDevice', id: membrane!, on: true })).toEqual({ accepted: 0, rejected: 0, note: 'S01 has no on setting' });
    expect(geo(w, { kind: 'setDevice', id: 4242, on: true })).toEqual({ accepted: 0, rejected: 1, note: 'no such structure', refused: { missing: 1 } });
    expect(canonicalJson(w.devices) + canonicalJson(w.edges)).toBe(json);
  });
});

describe('v1.0 dishes and the end-to-end cache bump', () => {
  it('a v1.0 (pre-flip) dish refuses every new kind "not in this dish" and stays byte-identical', () => {
    const w = clearWater({}, preFlipRegistry());
    const all: StructureCommandPayload[] = [
      { kind: 'placeEdges', structure: 'S01', edges: [[c(60, 60), 'R']] },
      { kind: 'placeEdges', structure: 'S03', edges: [[c(60, 60), 'R']], open: false },
      { kind: 'placeEdges', structure: 'S04', edges: [[c(60, 60), 'R']], flow: 1 },
      ...DEVICE_KINDS.map((k) => ({ kind: 'placeDevice' as const, structure: k, cell: c(60, 60) })),
      { kind: 'removeStructures', ids: [1] },
      { kind: 'moveDevice', id: 1, cell: c(61, 60) },
      { kind: 'setDevice', id: 1, on: true },
      { kind: 'wetBrush', points: [[60.5, 60.5]], radius: 3 },
      { kind: 'setLightMode', mode: 'cycle' },
      { kind: 'setLightMode', mode: 'fixed' },
      { kind: 'setDrying', drying: true },
    ];
    const json = canonicalJson(serializeWorld(w));
    const hash = stateHash(w);
    for (const p of all) {
      const res = applyStructureCommand(w, p);
      expect(res.accepted, p.kind).toBe(0);
      expect(res.rejected, p.kind).toBe(0);
      expect(res.note!.endsWith(NOT_IN_DISH), `${p.kind}: ${res.note}`).toBe(true);
    }
    expect(canonicalJson(serializeWorld(w))).toBe(json);
    expect(stateHash(w)).toBe(hash);
    // Through stage 1 as well: each is logged and takes a sequence number (hashed, as for any refused
    // command), and nothing else changes: the same hash as a twin given as many refused v1.0 commands.
    const twin = clearWater({}, preFlipRegistry());
    for (const p of all) {
      expect(cmd(w, p).accepted).toBe(0);
      expect(cmd(twin, { kind: 'placeObject', materialId: 'NOT_A_MATERIAL', x: 60.5, y: 60.5 }).accepted).toBe(0);
    }
    expect(stateHash(w)).toBe(stateHash(twin));
    expect(w.edges).toEqual([]);
    expect(w.devices).toEqual([]);
    expect(w.counters.nextDeviceId).toBe(1);
  });

  it('after a placeEdges of S01 by command, wave 9’s movement refuses the crossing (edgeCodesOf sees the edge)', () => {
    const w = dish();
    const line: (readonly [number, 'R'])[] = [];
    for (let y = 0; y < 128; y++) if (inMask(63, y) && inMask(64, y)) line.push([c(63, y), 'R']);
    // Warm the per-world edge cache before the command: only the bump (and the new store) can refresh it.
    expect(edgeCodesOf(w)).toBeNull();
    for (let k = 0; k < 6; k++) place(w, 'P01', 61.5 + (k % 2) * 1.8, 50.5 + 4 * k, { E: 60 });
    expect(cmd(w, { kind: 'placeEdges', structure: 'S01', edges: line }).accepted).toBe(line.length);
    expect(edgeCodesOf(w)!.r[c(63, 64)]).toBe(EDGE_S01);
    for (let t = 0; t < 400; t++) {
      step(w);
      for (const s of aliveOf(w, 'P01')) expect(w.ents.cols.x[s]!).toBeLessThan(64);
    }
    expect(aliveOf(w, 'P01').length).toBeGreaterThan(0);
  });
});

describe('shelters, the mesh and the basket under Life and Sample', () => {
  it('inoculating into shelter cells: P01 (Medium) is refused with "no compatible cells", B01 (Small) is accepted', async () => {
    const w = dish();
    const cells = brushCells(40.5, 64.5, 1);
    for (const cell of cells) expect(cmd(w, { kind: 'placeDevice', structure: 'S05', cell }).accepted).toBe(1);
    expect(cmd(w, { kind: 'inoculate', speciesId: 'P01', x: 40.5, y: 64.5, radius: 1, count: 3 })).toEqual({ accepted: 0, rejected: 3, note: 'no compatible cells' });
    expect(cmd(w, { kind: 'inoculate', speciesId: 'B01', x: 40.5, y: 64.5, radius: 1, count: 3 }).accepted).toBe(3);
    await roundTrip(w);
  });

  it('Sample Transfer checks the destination with canOccupy: no Medium into a shelter; a mesh species lands on its mesh', async () => {
    const w = dish();
    cmd(w, { kind: 'placeDevice', structure: 'S05', cell: c(70, 64) });
    cmd(w, { kind: 'placeDevice', structure: 'S06', cell: c(70, 80) });
    place(w, 'P01', 40.5, 64.5);
    expect(cmd(w, { kind: 'sampleTake', x: 40.5, y: 64.5, radius: 1, mode: 'life' }).accepted).toBeGreaterThan(0);
    expect(cmd(w, { kind: 'sampleTransfer', dx: 30, dy: 0 })).toMatchObject({ accepted: 0, note: 'Amoeba cannot live where it would land' });
    expect(cmd(w, { kind: 'sampleTransfer', dx: 31, dy: 0 }).accepted).toBeGreaterThan(0);
    // B02 (attached; its surfaces include the mesh) on painted gel, moved to open water: refused, except onto the mesh.
    cmd(w, { kind: 'paintSubstrate', substrate: 'gel', points: [[40.5, 80.5]], radius: 1 });
    place(w, 'B02', 40.5, 80.5);
    expect(cmd(w, { kind: 'sampleTake', x: 40.5, y: 80.5, radius: 1, mode: 'life' }).accepted).toBeGreaterThan(0);
    expect(cmd(w, { kind: 'sampleTransfer', dx: 31, dy: 0 }).accepted).toBe(0);
    expect(cmd(w, { kind: 'sampleTransfer', dx: 30, dy: 0 }).accepted).toBeGreaterThan(0);
    expect(aliveOf(w, 'B02').map((s) => Math.floor(w.ents.cols.x[s]!))).toEqual([70]);
    await roundTrip(w);
  });

  it('a Take over a basket takes its object whole and never the basket (All excludes structures)', async () => {
    const w = dish();
    const [basket] = cmd(w, { kind: 'placeDevice', structure: 'S07', cell: c(60, 60) }).ids!;
    const pellet = placeObject(w, c(60, 60), 'pellet', { sugar: 10 }, 1);
    expect(cmd(w, { kind: 'sampleTake', x: 60.5, y: 60.5, radius: 1, mode: 'all' }).accepted).toBeGreaterThan(0);
    expect(w.objects).toEqual([]);
    expect(w.sample!.objects).toEqual([pellet]);
    expect(w.devices.map((d) => d.id)).toEqual([basket]);
    expect(cmd(w, { kind: 'sampleTransfer', dx: 5, dy: 0 }).accepted).toBeGreaterThan(0);
    expect(objectAt(w, c(65, 60))).toEqual({ ...pellet, cell: c(65, 60) });
    expect(w.devices.map((d) => d.cell)).toEqual([c(60, 60)]);
    await roundTrip(w);
  });
});

// Edges given out of order are placed in edgeKey order (a guard on the helper above, not on the command).
it('rimCell is in the dish and its R neighbour is not', () => {
  const cell = rimCell(64);
  expect(inMask(cell % 128, 64)).toBe(true);
  expect(inMask((cell % 128) + 1, 64)).toBe(false);
  const e: EdgeBarrier = { id: 1, kind: 'S01', cell, dir: 'R' };
  expect(edgeKey(e.cell, e.dir)).toBe(cell * 2);
});
