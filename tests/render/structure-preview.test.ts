/**
 * Previews equal the commands (wave 11 structure-render-worker; UX §4.2, D-0106 "a refusal preview before
 * commit"). src/render/structurePreviewModel.ts builds its model from the host's GeometryMsg and snapshot and
 * calls the commands' own rules; here every preview is compared with the command it previews, applied to a
 * copy of the same world:
 * - Lab placeStructure (stone, wall, bead) and paintSubstrate (gel, sediment, water) over a band of the
 *   dish holding 20 S05 and 20 S06 on water, gel and sediment, two S04 and an S01 line: accepted cells and
 *   skipped cells by reason equal applyHabitatEdit's;
 * - placeEdges strokes hitting every reason (rim, stone/wall, existing barrier, S04 not water-water, the
 *   cap with a partial accept): per edge and per reason equal;
 * - placeDevice per cell (rim, structure, occupied, cap) equal;
 * - the wetting brush's counts equal wetBrush's accepted/rejected;
 * - the Life preview with the device extras equals canOccupy for every species of a registry enabling every
 *   Phase 5 species (allowUnimplemented: their abilities land in waves 11–13; the occupancy rule is wave 9's).
 * The barrier registry is tests/helpers/world.ts barrierRegistry (allowUnimplemented for S01–S12 until the
 * systems flip, D-0104).
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { freeClassOfSpecies, type EdgeDir, type EdgeKind } from '../../src/sim/barriers';
import { CELL_COUNT, DEVICE_CAP, EDGE_BARRIER_CAP } from '../../src/sim/constants';
import { SYSTEM_FLAGS } from '../../src/sim/fields';
import { cellIndex, habitatMaskOf, inMask, ST_NONE, ST_STONE, ST_WALL, ST_BEAD, SUB_GEL, SUB_SEDIMENT, SUBSTRATE_CODES, strokeFootprint, type LifeBrush } from '../../src/sim/grid';
import { canOccupy } from '../../src/sim/movement';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { applyStructureCommand, type StructureCommandPayload } from '../../src/sim/structureEdits';
import { applyHabitatEdit, type HabitatEditPayload } from '../../src/sim/structures';
import type { World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, SnapshotMsg } from '../../src/worker/protocol';
import { packEntities, packGeometry, packObjects } from '../../src/worker/snapshot';
import { deviceMovePreview, devicePreview, edgeStrokePreview, labCellPreview, lifeCellPreview, previewModel, wetPreview, type StructurePreviewModel } from '../../src/render/structurePreviewModel';
import { registryWith } from '../helpers/registry';
import { barrierDish, barrierRegistry, clearWater, paintRect, place, placeObject, pushDevices, pushEdges, registry, verticalLine, PHASE5_STRUCTURE_IDS } from '../helpers/world';

const C = cellIndex;
const clone = (w: World): World => deserializeWorld(serializeWorld(w));

/** The test dish: gel and sediment ground, 20 S05 and 20 S06, two S04, an S01 line, stone, wall, bead, organisms and a pellet. */
function previewDish(): World {
  const w = barrierDish();
  paintRect(w, SUB_GEL, 20, 40, 60, 60);
  paintRect(w, SUB_SEDIMENT, 70, 40, 110, 60);
  const devices: { kind: 'S05' | 'S06'; cell: number }[] = [];
  for (let k = 0; k < 40; k++) {
    const region = k % 3;
    const i = Math.floor(k / 3);
    const cell = region === 0 ? C(22 + 3 * i, 45) : region === 1 ? C(72 + 3 * i, 50) : C(30 + 5 * i, 75);
    devices.push({ kind: k < 20 ? 'S05' : 'S06', cell });
  }
  pushDevices(w, devices);
  pushEdges(w, [{ kind: 'S04', cell: C(64, 80), dir: 'R', flow: 1 }, { kind: 'S04', cell: C(66, 82), dir: 'D', flow: -1 }, ...verticalLine('S01', 90, 70, 80)]);
  for (let y = 80; y <= 83; y++) for (let x = 30; x <= 33; x++) w.grid.structure[C(x, y)] = ST_STONE;
  for (let x = 100; x <= 103; x++) w.grid.structure[C(x, 86)] = ST_WALL;
  for (let x = 40; x <= 42; x++) w.grid.structure[C(x, 90)] = ST_BEAD;
  w.grid.geometryVersion++;
  for (const [x, y] of [
    [25.5, 52.5],
    [80.5, 44.5],
    [50.5, 70.5],
    [30.5 + 5 * 3, 75.5], // on a device cell
    [64.5, 80.5], // on an S04 side
  ] as const)
    place(w, 'B01', x, y);
  placeObject(w, C(56, 66), 'pellet', { sugar: 10 }, 0.5);
  return w;
}

/** The model the renderer would build from the host's messages for `w` (create from its state). */
function hostModel(w: World): StructurePreviewModel {
  const out: FromWorker[] = [];
  const host = new DishHost(barrierRegistry(), (m) => out.push(m), { now: () => 0 });
  host.handle({ type: 'create', requestId: 1, dishId: 'd', source: { kind: 'state', state: serializeWorld(w) } });
  const snap = out.filter((m): m is SnapshotMsg => m.type === 'snapshot').at(-1)!;
  expect(snap.geometry).not.toBeNull();
  return previewModel(snap.geometry, snap);
}

/** The same model straight from the packers (what the host sends), for worlds the host need not open. */
function packedModel(w: World): StructurePreviewModel {
  const p = packEntities(w, null, null);
  return previewModel(packGeometry(w), { count: p.count, ents: p.ents, objects: packObjects(w) });
}

/** A zigzag covering rows 34–94 of the dish (radius 6). */
const BAND: [number, number][] = [];
for (const [k, y] of [40, 52, 64, 76, 88].entries()) BAND.push(...(k % 2 === 0 ? ([[2, y], [125, y]] as [number, number][]) : ([[125, y], [2, y]] as [number, number][])));

describe('Lab previews equal applyHabitatEdit with Phase 5 structures', () => {
  const w = previewDish();
  const m = hostModel(w);
  const cells = strokeFootprint(BAND, 6);

  const cases: [string, HabitatEditPayload][] = [
    ...(['stone', 'wall', 'bead'] as const).map((s): [string, HabitatEditPayload] => [`place ${s}`, { kind: 'placeStructure', structure: s, points: BAND, radius: 6 }]),
    ...(['gel', 'sediment', 'water'] as const).map((s): [string, HabitatEditPayload] => [`paint ${s}`, { kind: 'paintSubstrate', substrate: s, points: BAND, radius: 6 }]),
  ];
  for (const [name, payload] of cases) {
    it(`${name}: accepted cells and skipped reasons equal the command's`, () => {
      const rule = payload.kind === 'placeStructure' ? 'place' : 'substrate';
      const paint = payload.kind === 'paintSubstrate' ? SUBSTRATE_CODES[payload.substrate] : null;
      const ok: number[] = [];
      const reasons: Record<string, number> = {};
      for (const cell of cells) {
        const o = labCellPreview(m, rule, cell, paint);
        if (o === 'ok') ok.push(cell);
        else if (o !== 'noop') reasons[o] = (reasons[o] ?? 0) + 1;
      }
      const after = clone(w);
      const r = applyHabitatEdit(after, payload);
      const skipped = Object.fromEntries(Object.entries(r.skipped ?? {}).filter(([, n]) => (n ?? 0) > 0));
      expect(skipped.enclosed).toBeUndefined();
      expect(r.accepted).toBe(ok.length);
      expect(skipped).toEqual(reasons);
      // Both reasons the Phase 5 rule adds show up for a placement; the channel sides for gel and sediment paint.
      if (rule === 'place') expect(reasons.device).toBeGreaterThan(0);
      if (rule === 'place' || paint !== SUBSTRATE_CODES.water) expect(reasons.barrier).toBeGreaterThan(0);
      else expect(reasons.barrier).toBeUndefined();
      // Cell by cell: what changed was previewed ok, and every ok cell now holds the edit.
      const okSet = new Uint8Array(CELL_COUNT);
      for (const c of ok) okSet[c] = 1;
      for (let c = 0; c < CELL_COUNT; c++) {
        if (payload.kind === 'placeStructure') {
          const changed = after.grid.structure[c] !== w.grid.structure[c];
          expect(changed, `cell ${c}`).toBe(okSet[c] === 1);
        } else {
          if (after.grid.substrate[c] !== w.grid.substrate[c]) expect(okSet[c], `cell ${c}`).toBe(1);
          if (okSet[c] === 1) expect(after.grid.substrate[c]).toBe(paint);
        }
      }
    });
  }

  it('without edges or devices the model gives exactly the protocol 2 rule (brushCellOutcome alone)', () => {
    const plain = clearWater();
    for (const [x, y] of [[40.5, 64.5], [41.5, 64.5]] as const) place(plain, 'B01', x, y);
    const pm = packedModel(plain);
    expect(pm.codes).toBeNull();
    expect(pm.kinds).toBeNull();
    expect(pm.sides).toBeNull();
    const r = applyHabitatEdit(clone(plain), { kind: 'placeStructure', structure: 'stone', points: [[40.5, 64.5]], radius: 3 });
    const fp = strokeFootprint([[40.5, 64.5]], 3);
    expect(fp.filter((c) => labCellPreview(pm, 'place', c) === 'ok').length).toBe(r.accepted);
    expect(fp.filter((c) => labCellPreview(pm, 'place', c) === 'organism').length).toBe(r.skipped?.organism ?? 0);
  });
});

describe('edge, device and wet previews equal the structure commands', () => {
  /** Preview vs placeEdges on a copy: per-reason counts, accepted count and exactly the accepted edges. */
  function compareEdges(w: World, m: StructurePreviewModel, kind: EdgeKind, edges: [number, EdgeDir][], extra: { open?: boolean; flow?: 1 | -1 } = {}) {
    const p = edgeStrokePreview(m, kind, edges);
    const after = clone(w);
    const payload = { kind: 'placeEdges', structure: kind, edges, ...(kind === 'S03' ? { open: extra.open ?? true } : {}), ...(kind === 'S04' ? { flow: extra.flow ?? 1 } : {}) } as StructureCommandPayload;
    const r = applyStructureCommand(after, payload);
    expect(r.accepted).toBe(p.ok);
    expect(r.refused ?? {}).toEqual(p.reasons);
    const before = new Set(w.edges.map((e) => `${e.cell}${e.dir}`));
    const added = after.edges.filter((e) => !before.has(`${e.cell}${e.dir}`)).map((e) => `${e.cell}${e.dir}`).sort();
    expect(added).toEqual(p.items.filter((i) => i.outcome === 'ok').map((i) => `${i.cell}${i.dir}`).sort());
    return p;
  }

  it('placeEdges: rim, stone/wall, existing barrier, S04 not water-water, and ok edges', () => {
    const w = previewDish();
    const m = hostModel(w);
    const s04 = compareEdges(w, m, 'S04', [
      [C(3, 64), 'R'], // rim
      [C(29, 80), 'R'], // beside stone
      [C(100, 85), 'D'], // beside the wall
      [C(64, 80), 'R'], // already an S04
      [C(30, 45), 'R'], // gel: not water-water
      [C(40, 89), 'D'], // a bead below: not open water
      [C(20, 100), 'R'], // ok
      [C(21, 101), 'D'], // ok
    ]);
    expect(s04.reasons).toEqual({ rim: 1, structure: 2, barrier: 1, channel: 2 });
    expect(s04.ok).toBe(2);
    const s01 = compareEdges(w, m, 'S01', [
      [C(90, 72), 'R'], // existing S01
      [C(40, 89), 'D'], // a bead is allowed beside S01–S03
      [C(30, 45), 'R'], // gel is fine for S01
      [C(30, 79), 'D'], // stone below
    ]);
    expect(s01.reasons).toEqual({ barrier: 1, structure: 1 });
    compareEdges(w, m, 'S03', [[C(25, 30), 'R'], [C(25, 30), 'D']], { open: false });
  });

  it('placeEdges at the cap: a partial accept, the rest refused as cap', () => {
    const w = previewDish();
    const fill: ReturnType<typeof verticalLine> = [];
    for (let x = 8; x <= 118 && w.edges.length + fill.length < EDGE_BARRIER_CAP - 2; x += 2) {
      for (const e of verticalLine('S02', x, 96, 115)) if (w.edges.length + fill.length < EDGE_BARRIER_CAP - 2) fill.push(e);
    }
    pushEdges(w, fill);
    expect(w.edges.length).toBe(EDGE_BARRIER_CAP - 2);
    const m = packedModel(w);
    const p = compareEdges(w, m, 'S01', [[C(50, 30), 'R'], [C(52, 30), 'R'], [C(54, 30), 'R'], [C(56, 30), 'R'], [C(58, 30), 'R']]);
    expect(p.ok).toBe(2);
    expect(p.reasons).toEqual({ cap: 3 });
  });

  it('placeDevice per cell: rim, structure, occupied, ok, and the cap', () => {
    const w = previewDish();
    const m = hostModel(w);
    const cells = [C(3, 64), C(31, 81), C(101, 86), C(41, 90), C(22, 45), C(20, 100), C(56, 66), C(25, 52)];
    const prev = devicePreview(m, cells.map((c) => c));
    const outcomes = cells.map((cell) => {
      const r = applyStructureCommand(clone(w), { kind: 'placeDevice', structure: 'S09', cell });
      return r.accepted === 1 ? 'ok' : Object.keys(r.refused ?? {})[0];
    });
    // One placement per command: each cell is previewed against the store as it is (no running count needed below the cap).
    expect(devicePreview(m, cells.slice(0, 1)).map((p) => p.outcome)).toEqual([outcomes[0]]);
    expect(cells.map((c) => devicePreview(m, [c])[0]!.outcome)).toEqual(outcomes);
    expect(outcomes).toEqual(['rim', 'structure', 'structure', 'structure', 'device', 'ok', 'ok', 'ok']);
    expect(prev.map((p) => p.outcome)).toEqual(outcomes);
    // The cap: a full store refuses every new device.
    const full = previewDish();
    const more: { kind: 'S06'; cell: number }[] = [];
    for (let cell = 0; cell < CELL_COUNT && full.devices.length + more.length < DEVICE_CAP; cell++) {
      const x = cell % 128;
      const y = Math.floor(cell / 128);
      if (y >= 100 && y < 120 && inMask(x, y) && full.grid.structure[cell] === ST_NONE) more.push({ kind: 'S06', cell });
    }
    pushDevices(full, more);
    expect(full.devices.length).toBe(DEVICE_CAP);
    const fm = packedModel(full);
    const r = applyStructureCommand(clone(full), { kind: 'placeDevice', structure: 'S06', cell: C(20, 90) });
    expect(r.refused).toEqual({ cap: 1 });
    expect(devicePreview(fm, [C(20, 90)])[0]!.outcome).toBe('cap');
  });

  it('moveDevice: the Move preview equals the command at the device cap and for a basket carrying an object (D-0120)', () => {
    // At the cap a move is still allowed (the store keeps its size), where placement would say 'cap'.
    const full = previewDish();
    const more: { kind: 'S06'; cell: number }[] = [];
    for (let cell = 0; cell < CELL_COUNT && full.devices.length + more.length < DEVICE_CAP; cell++) {
      const x = cell % 128;
      const y = Math.floor(cell / 128);
      if (y >= 100 && y < 120 && inMask(x, y) && full.grid.structure[cell] === ST_NONE) more.push({ kind: 'S06', cell });
    }
    pushDevices(full, more);
    expect(full.devices.length).toBe(DEVICE_CAP);
    const fm = packedModel(full);
    const dev = full.devices.find((d) => d.kind === 'S06')!;
    expect(devicePreview(fm, [C(20, 90)])[0]!.outcome).toBe('cap');
    expect(deviceMovePreview(fm, dev.cell, C(20, 90), 'S06')).toBe('ok');
    expect(applyStructureCommand(clone(full), { kind: 'moveDevice', id: dev.id, cell: C(20, 90) }).accepted).toBe(1);
    // A basket carrying a pellet: refused onto another object, accepted onto an empty cell; the other refusals as placement.
    const w = previewDish();
    pushDevices(w, [{ kind: 'S07', cell: C(50, 100) }]);
    placeObject(w, C(50, 100), 'pellet', { sugar: 10 }, 0.5);
    placeObject(w, C(52, 100), 'pellet', { sugar: 10 }, 0.5);
    const m = packedModel(w);
    const basket = w.devices.find((d) => d.kind === 'S07')!;
    for (const [cell, want] of [
      [C(52, 100), 'object'],
      [C(54, 100), 'ok'],
      [C(3, 64), 'rim'],
      [C(31, 81), 'structure'],
      [C(22, 45), 'device'],
    ] as const) {
      expect(deviceMovePreview(m, basket.cell, cell, 'S07'), `cell ${cell}`).toBe(want);
      const r = applyStructureCommand(clone(w), { kind: 'moveDevice', id: basket.id, cell });
      expect(r.accepted === 1 ? 'ok' : Object.keys(r.refused ?? {})[0], `cell ${cell}`).toBe(want);
    }
  });

  it('wet preview counts equal wetBrush accepted/rejected (water a no-op, outside refused)', () => {
    const w = previewDish();
    const m = hostModel(w);
    for (const [points, radius] of [
      [BAND, 6],
      [[[3.5, 64.5], [10.5, 64.5]], 6],
      [[[64.5, 20.5]], 3],
    ] as [[number, number][], number][]) {
      const prev = wetPreview(m, strokeFootprint(points, radius));
      const r = applyStructureCommand(clone(w), { kind: 'wetBrush', points, radius });
      const ok = prev.filter((p) => p.outcome === 'ok').length;
      expect(r.accepted).toBe(ok);
      expect(r.rejected).toBe(prev.length - ok);
    }
    expect(wetPreview(m, [C(0, 0), C(64, 20), C(30, 45)]).map((p) => p.outcome)).toEqual(['refused', 'noop', 'ok']);
  });
});

describe('the Life preview with the device extras equals canOccupy for every species', () => {
  it('every Phase 5 species, attached and free variants, on water, gel, sediment, stone edges, beads, S05 and S06 cells', () => {
    const all = readdirSync(join(__dirname, '..', '..', 'content', 'species')).map((f) => f.replace('.json', '')).sort();
    const shipped = registry().manifest;
    const reg = registryWith(
      { enabledSpecies: all, enabledSystems: [...SYSTEM_FLAGS].sort(), enabledStructures: ['BEAD', ...PHASE5_STRUCTURE_IDS, 'STONE', 'WALL'], enabledMaterials: [...shipped.enabledMaterials] },
      { allowUnimplemented: true },
    );
    const w = clearWater({}, reg);
    paintRect(w, SUB_GEL, 20, 40, 60, 60);
    paintRect(w, SUB_SEDIMENT, 70, 40, 110, 60);
    const devs: { kind: 'S05' | 'S06'; cell: number }[] = [];
    for (let k = 0; k < 30; k++) devs.push({ kind: k % 2 === 0 ? 'S05' : 'S06', cell: k % 3 === 0 ? C(22 + k, 45) : k % 3 === 1 ? C(72 + k, 50) : C(30 + k, 75) });
    devs.push({ kind: 'S06', cell: C(34, 81) }); // a mesh beside stone
    pushDevices(w, devs);
    for (let y = 80; y <= 83; y++) for (let x = 30; x <= 33; x++) w.grid.structure[C(x, y)] = ST_STONE;
    for (let x = 40; x <= 42; x++) w.grid.structure[C(x, 90)] = ST_BEAD;
    w.grid.geometryVersion++;
    const m = previewModel(packGeometry(w), null);
    expect(w.species.length).toBe(all.length);
    let checked = 0;
    let shelterRefusals = 0;
    for (const sp of w.species) {
      const cls = freeClassOfSpecies(sp.def);
      const base: LifeBrush =
        sp.def.attachment === null
          ? { habitatMask: habitatMaskOf(sp.def.habitats), attached: false }
          : { habitatMask: habitatMaskOf(sp.def.habitats), attached: true, surfaces: [...sp.def.attachment.surfaces] };
      const life: LifeBrush = { ...base, shelterBlocked: cls === 'medium' || cls === 'large' };
      for (const variant of [sp, { ...sp, attached: !sp.attached }]) {
        const rule: LifeBrush = { ...life, attached: variant.attached };
        for (let cell = 0; cell < CELL_COUNT; cell++) {
          const preview = lifeCellPreview(m, rule, cell) === 'ok';
          const command = canOccupy(w, variant, cell);
          if (preview !== command) throw new Error(`${sp.id} (attached ${String(variant.attached)}) cell ${cell}: preview ${String(preview)}, canOccupy ${String(command)}`);
          if (!preview && rule.shelterBlocked && m.kinds![cell] === 1) shelterRefusals++;
          checked++;
        }
      }
    }
    expect(checked).toBe(w.species.length * 2 * CELL_COUNT);
    expect(shelterRefusals).toBeGreaterThan(0);
  });
});
