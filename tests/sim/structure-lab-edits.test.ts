/**
 * Phase 5 wave 10 structure-commands: Lab habitat edits respect edge barriers and devices (D-0111
 * carry-over, D-0117; src/sim/structures.ts applyHabitatEdit, src/sim/structurePreview.ts labCellConflict).
 * - A stone, wall or bead stroke skips cells holding a furnishing or device (skipped.device) and the sides
 *   of an S04 channel (skipped.barrier); gel or sediment paint skips an S04 side, water paint is allowed.
 * - The result carries no device/barrier key when none was skipped (v1.0 results byte-identical).
 * - After every Lab edit in a dish full of structures the save loads (the D-0111 regression: without the
 *   skip a stone on a device cell gives a save the import refuses; the refusal sentence is pinned below).
 * - labCellConflict (the wave 11 preview's rule) equals applyHabitatEdit's outcome cell by cell over a
 *   stroke covering the whole dish.
 * Worlds: clear water under barrierRegistry(); structures placed by the commands.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile, parseSaveFile } from '../../src/persistence/saveFile';
import { applyNow, type CommandPayload, type CommandResult } from '../../src/sim/commands';
import { edgeNeighbour } from '../../src/sim/barriers';
import { deviceKindsOf, edgeCodesOf } from '../../src/sim/edgePassage';
import { brushCellOutcome, cellIndex, strokeFootprint, ST_BEAD, ST_NONE, ST_STONE, SUB_GEL, SUB_WATER, type LabBrushRule } from '../../src/sim/grid';
import { stateHash } from '../../src/sim/serialize';
import { habitatEditRule, occupiedCells, type HabitatEditPayload } from '../../src/sim/structures';
import { channelSides, labCellConflict } from '../../src/sim/structurePreview';
import type { World } from '../../src/sim/world';
import { barrierRegistry, clearWater, place, placeObject } from '../helpers/world';

const REG = barrierRegistry();
const meta = { name: 'structure lab edits', savedAt: '2026-10-14T00:00:00Z', recipeId: null };
let seq = 0;
const cmd = (w: World, p: CommandPayload): CommandResult => applyNow(w, `le${seq++}`, p).result!;
const c = cellIndex;

async function roundTrip(w: World): Promise<World> {
  const { text } = await buildSaveFile(w, meta);
  const { world } = await loadSaveFile(text);
  expect(stateHash(world)).toBe(stateHash(w));
  return world;
}

/** A dish with a row of devices on y = 60 (x 40–80, every 4th cell) and S04 channels on y = 70 (x 40–80). */
function structuredDish(): World {
  const w = clearWater({}, REG);
  const kinds = ['S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'] as const;
  for (let x = 40, k = 0; x <= 80; x += 4, k++) expect(cmd(w, { kind: 'placeDevice', structure: kinds[k % kinds.length]!, cell: c(x, 60) }).accepted).toBe(1);
  const channels: (readonly [number, 'R' | 'D'])[] = [];
  for (let x = 40; x <= 80; x += 4) channels.push([c(x, 70), x % 8 === 0 ? 'R' : 'D']);
  expect(cmd(w, { kind: 'placeEdges', structure: 'S04', edges: channels, flow: 1 }).accepted).toBe(channels.length);
  // An S01 too: Lab edits never skip for it (a stone may sit beside a membrane).
  expect(cmd(w, { kind: 'placeEdges', structure: 'S01', edges: [[c(60, 50), 'R']] }).accepted).toBe(1);
  return w;
}

describe('Lab edits skip device cells and channel sides', () => {
  it.each(['stone', 'wall', 'bead'] as const)('a %s stroke over devices and S04 sides skips them; the save loads', async (structure) => {
    const w = structuredDish();
    const devices = JSON.stringify(w.devices);
    const edges = JSON.stringify(w.edges);
    const onDevices = cmd(w, { kind: 'placeStructure', structure, points: [[40.5, 60.5], [80.5, 60.5]], radius: 1 });
    expect(onDevices.skipped!.device).toBe(11);
    expect(onDevices.skipped!.barrier).toBeUndefined();
    for (const d of w.devices) expect(w.grid.structure[d.cell]).toBe(ST_NONE);
    const onChannels = cmd(w, { kind: 'placeStructure', structure, points: [[40.5, 70.5], [80.5, 70.5]], radius: 1 });
    expect(onChannels.skipped!.barrier).toBeGreaterThanOrEqual(11);
    for (const e of w.edges) if (e.kind === 'S04') for (const side of [e.cell, edgeNeighbour(e.cell, e.dir)]) expect(w.grid.structure[side]).toBe(ST_NONE);
    // Beside the S01: placed (no skip reason for an ordinary membrane).
    const membrane = cmd(w, { kind: 'placeStructure', structure, points: [[60.5, 50.5]], radius: 1 });
    expect(membrane.accepted).toBeGreaterThan(0);
    expect(membrane.skipped).toBeUndefined();
    expect(JSON.stringify(w.devices)).toBe(devices);
    expect(JSON.stringify(w.edges)).toBe(edges);
    await roundTrip(w);
  });

  it('gel and sediment paint skip an S04 side; water paint is allowed; devices never refuse paint', async () => {
    const w = structuredDish();
    for (const substrate of ['gel', 'sediment'] as const) {
      const res = cmd(w, { kind: 'paintSubstrate', substrate, points: [[40.5, 70.5], [80.5, 70.5]], radius: 1 });
      expect(res.skipped!.barrier, substrate).toBeGreaterThanOrEqual(11);
      expect(res.accepted).toBeGreaterThan(0);
      for (const e of w.edges) if (e.kind === 'S04') for (const side of [e.cell, edgeNeighbour(e.cell, e.dir)]) expect(w.grid.substrate[side]).toBe(SUB_WATER);
      await roundTrip(w);
    }
    const water = cmd(w, { kind: 'paintSubstrate', substrate: 'water', points: [[40.5, 70.5], [80.5, 70.5]], radius: 1 });
    expect(water.skipped).toBeUndefined();
    const gelUnderDevices = cmd(w, { kind: 'paintSubstrate', substrate: 'gel', points: [[40.5, 60.5], [80.5, 60.5]], radius: 1 });
    expect(gelUnderDevices.skipped).toBeUndefined();
    for (const d of w.devices) expect(w.grid.substrate[d.cell]).toBe(SUB_GEL);
    await roundTrip(w);
  });

  it('no device or barrier key when none was skipped; shade and erase are unaffected', async () => {
    const w = structuredDish();
    const res = cmd(w, { kind: 'placeStructure', structure: 'stone', points: [[40.5, 90.5]], radius: 3 });
    expect(res.accepted).toBeGreaterThan(0);
    expect(res).not.toHaveProperty('skipped');
    place(w, 'B01', 50.5, 90.5);
    const blocked = cmd(w, { kind: 'placeStructure', structure: 'bead', points: [[50.5, 90.5]], radius: 1 });
    expect(blocked.skipped).toEqual({ rim: 0, structure: 0, organism: 1, enclosed: 0 }); // the v1.0 shape exactly
    expect(cmd(w, { kind: 'paintShade', erase: false, points: [[40.5, 60.5], [80.5, 70.5]], radius: 3 })).not.toHaveProperty('skipped');
    expect(cmd(w, { kind: 'eraseStructure', points: [[40.5, 90.5]], radius: 3 }).accepted).toBeGreaterThan(0);
    await roundTrip(w);
  });

  it('the D-0111 regression: without the skip a stone on a device cell is refused by the import (the sentence pinned)', async () => {
    const w = structuredDish();
    // What the pre-wave-10 Lab edit produced: a stone written over a device cell.
    w.grid.structure[w.devices[0]!.cell] = ST_STONE;
    const { text } = await buildSaveFile(w, meta);
    await expect(parseSaveFile(text)).rejects.toThrow('A device sits on a stone, wall or bead. Nothing was loaded.');
    const v = structuredDish();
    const e = v.edges.find((x) => x.kind === 'S04')!;
    v.grid.substrate[e.cell] = SUB_GEL;
    await expect(parseSaveFile((await buildSaveFile(v, meta)).text)).rejects.toThrow('A one-way channel does not join two open water cells. Nothing was loaded.');
  });
});

describe('labCellConflict (the preview) equals applyHabitatEdit cell by cell', () => {
  /** A stroke whose radius-6 footprint covers every cell of the grid. */
  const WHOLE: (readonly [number, number])[] = [];
  for (let y = 3; y < 128 + 6; y += 10) {
    WHOLE.push([0, y]);
    WHOLE.push([127, y]);
  }

  function preview(w: World, p: HabitatEditPayload): Map<number, string> {
    const rule: LabBrushRule = habitatEditRule(p.kind);
    const occupied = rule === 'place' ? occupiedCells(w) : null;
    const objects = new Uint8Array(w.grid.structure.length);
    for (const o of w.objects) objects[o.cell] = 1;
    const kinds = deviceKindsOf(w);
    const sides = channelSides(edgeCodesOf(w));
    const paint = p.kind === 'paintSubstrate' ? ({ water: 0, gel: 1, sediment: 2 } as const)[p.substrate] : null;
    const out = new Map<number, string>();
    for (const cell of strokeFootprint(p.points, p.radius)) {
      const o = brushCellOutcome(rule, w.grid.structure[cell]!, occupied !== null && occupied[cell] === 1, rule === 'place' && objects[cell] === 1);
      if (o !== 'ok') {
        out.set(cell, o);
        continue;
      }
      out.set(cell, labCellConflict(rule, paint, kinds !== null && kinds[cell] !== 0, sides !== null && sides[cell] === 1) ?? 'ok');
    }
    return out;
  }

  it.each([
    ['bead placement', { kind: 'placeStructure', structure: 'bead', points: WHOLE, radius: 6 }],
    ['gel paint', { kind: 'paintSubstrate', substrate: 'gel', points: WHOLE, radius: 6 }],
    ['water paint', { kind: 'paintSubstrate', substrate: 'water', points: WHOLE, radius: 6 }],
    ['shade paint', { kind: 'paintShade', erase: false, points: WHOLE, radius: 6 }],
  ] as [string, HabitatEditPayload][])('%s', (_, p) => {
    const w = structuredDish();
    place(w, 'B01', 30.5, 64.5);
    placeObject(w, c(32, 64), 'pellet', { sugar: 10 }, 1);
    cmd(w, { kind: 'paintSubstrate', substrate: 'sediment', points: [[90.5, 90.5]], radius: 3 });
    const want = preview(w, p);
    expect(want.size).toBeGreaterThan(12000);
    const before = { st: Uint8Array.from(w.grid.structure), sub: Uint8Array.from(w.grid.substrate), shade: Float64Array.from(w.grid.shade) };
    const res = cmd(w, p);
    const counts: Record<string, number> = {};
    for (const [cell, o] of want) {
      counts[o] = (counts[o] ?? 0) + 1;
      if (p.kind === 'placeStructure') expect(w.grid.structure[cell] === ST_BEAD && before.st[cell] !== ST_BEAD, `${cell} ${o}`).toBe(o === 'ok');
      if (p.kind === 'paintSubstrate' && o !== 'ok') expect(w.grid.substrate[cell], `${cell} ${o}`).toBe(before.sub[cell]);
      if (p.kind === 'paintSubstrate' && o === 'ok') expect(w.grid.substrate[cell]).toBe(p.substrate === 'gel' ? SUB_GEL : SUB_WATER);
    }
    expect(res.accepted).toBe(counts.ok ?? 0);
    const sk = res.skipped;
    expect(sk?.device ?? 0).toBe(counts.device ?? 0);
    expect(sk?.barrier ?? 0).toBe(counts.barrier ?? 0);
    expect(sk?.organism ?? 0).toBe(counts.organism ?? 0);
    expect(sk?.object ?? 0).toBe(counts.object ?? 0);
    expect(sk?.structure ?? 0).toBe(counts.structure ?? 0);
    expect(sk?.rim ?? 0).toBe(counts.rim ?? 0);
    if (p.kind === 'placeStructure') expect(counts.device).toBe(11);
    if (p.kind === 'placeStructure' || (p.kind === 'paintSubstrate' && p.substrate === 'gel')) expect(counts.barrier).toBeGreaterThanOrEqual(11);
    if (p.kind === 'paintShade' || (p.kind === 'paintSubstrate' && p.substrate === 'water')) expect(counts.barrier ?? 0).toBe(0);
  });
});
