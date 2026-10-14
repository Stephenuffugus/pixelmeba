/**
 * Protocol 3 structure data through the worker (wave 11 structure-render-worker; D-0119): a barrierDish
 * (tests/helpers/world.ts: the 'barriers', 'climate' and 'devices' systems and S01–S12, allowUnimplemented
 * because the lead lists the structures as implemented at the systems flip, D-0104) holding every edge kind
 * (S03 open and closed, S04 flow +1 and −1) and every device kind, opened in a DishHost from its state.
 * GeometryMsg edges and devices, when geometry is resent (commands and Undo, never between ticks), per
 * snapshot resins and environment, the CellInspect climate, lightFactors, edges and device lines, the local
 * warmth in EntityInspect, and DishInfo systems and speciesFreeClass.
 */
import { describe, expect, it } from 'vitest';
import { edgeCodeArrays, type EdgeBarrier } from '../../src/sim/barriers';
import { cellIndex } from '../../src/sim/grid';
import { profileOf } from '../../src/sim/profiles';
import { serializeWorld } from '../../src/sim/serialize';
import { response, SHOULDER_WARMTH } from '../../src/sim/suitability';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import { EDGE_FLOW_BACK, type CellInspect, type DishInfo, type EntityInspect, type FromWorker, type SnapshotMsg } from '../../src/worker/protocol';
import { buildInspector } from '../../src/worker/snapshot';
import { barrierDish, barrierRegistry, clearWater, place, preFlipRegistry, pushDevices, pushEdges, registry, verticalLine } from '../helpers/world';

const C = cellIndex;
const S04_FWD = C(60, 60);
const S04_BACK = C(62, 60);
const S01_ROW = 61;

/** The barrierDish with every edge and device kind (and an S08 holding 1.25 units, an S09 on). */
function structureDish(): { world: World; edgeIds: number[]; deviceIds: number[] } {
  const world = barrierDish();
  const edgeIds = pushEdges(world, [
    ...verticalLine('S01', 40, 60, 62),
    { kind: 'S02', cell: C(50, 60), dir: 'R' },
    { kind: 'S03', cell: C(52, 60), dir: 'R', open: true },
    { kind: 'S03', cell: C(54, 60), dir: 'D', open: false },
    { kind: 'S04', cell: S04_FWD, dir: 'R', flow: 1, nextOrganismTick: 40 },
    { kind: 'S04', cell: S04_BACK, dir: 'D', flow: -1 },
  ]);
  const kinds = ['S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'] as const;
  const deviceIds = pushDevices(
    world,
    kinds.map((kind, k) => ({
      kind,
      cell: C(70 + 2 * k, 70),
      ...(kind === 'S09' ? { on: true } : {}),
      ...(kind === 'S08' ? { resinSelect: ['inhBact' as const], bound: { inhBact: 1.25 } } : {}),
    })),
  );
  return { world, edgeIds, deviceIds };
}

function hostWith(world: World) {
  const out: FromWorker[] = [];
  const host = new DishHost(barrierRegistry(), (m) => out.push(m), { now: () => 0 });
  host.handle({ type: 'create', requestId: 1, dishId: 'd', source: { kind: 'state', state: serializeWorld(world) } });
  const snaps = () => out.filter((m): m is SnapshotMsg => m.type === 'snapshot');
  const live = () => (host as unknown as { dishes: Record<string, { world: World }> }).dishes.d!.world;
  const info = () => out.filter((m): m is Extract<FromWorker, { type: 'ready' }> => m.type === 'ready').at(-1)!.info;
  let req = 10;
  const command = (payload: unknown): void => {
    host.handle({ type: 'command', requestId: ++req, dishId: 'd', commandId: `c${req}`, payload: payload as never, undoable: true });
  };
  return { host, out, snaps, live, info, command, step: () => host.handle({ type: 'step', dishId: 'd' }) };
}

describe('protocol 3 structures through the worker', () => {
  it('GeometryMsg carries edgeCodeArrays (EDGE_FLOW_BACK on the backward S04), the edge list without nextOrganismTick and the devices without bound', () => {
    const { world } = structureDish();
    const h = hostWith(world);
    const geo = h.snaps().at(-1)!.geometry!;
    const want = edgeCodeArrays(world.edges);
    want.d[S04_BACK] = want.d[S04_BACK]! | EDGE_FLOW_BACK;
    expect(Buffer.compare(Buffer.from(geo.edges!.r), Buffer.from(want.r))).toBe(0);
    expect(Buffer.compare(Buffer.from(geo.edges!.d), Buffer.from(want.d))).toBe(0);
    expect(geo.edges!.d[S04_BACK]! & EDGE_FLOW_BACK).toBe(EDGE_FLOW_BACK);
    expect(geo.edges!.r[S04_FWD]! & EDGE_FLOW_BACK).toBe(0);
    expect(geo.edges!.list).toEqual(world.edges.map(({ nextOrganismTick: _n, ...rest }: EdgeBarrier) => rest));
    expect(geo.edges!.list.some((e) => 'nextOrganismTick' in e)).toBe(false);
    expect(geo.devices).toEqual(world.devices.map(({ bound: _b, ...rest }) => rest));
    expect(geo.devices!.some((d) => 'bound' in d)).toBe(false);
  });

  it('geometry is resent after a placeEdges command and after Undo, and not between ticks', () => {
    const { world } = structureDish();
    const h = hostWith(world);
    const n0 = h.snaps().length;
    h.step();
    h.step();
    expect(h.snaps().slice(n0).every((s) => s.geometry === null)).toBe(true);
    h.command({ kind: 'placeEdges', structure: 'S02', edges: [[C(30, 64), 'R']] });
    const after = h.snaps().at(-1)!;
    expect(after.geometry).not.toBeNull();
    expect(after.geometry!.edges!.list.some((e) => e.cell === C(30, 64) && e.kind === 'S02')).toBe(true);
    h.step();
    expect(h.snaps().at(-1)!.geometry).toBeNull();
    h.host.handle({ type: 'undo', requestId: 99, dishId: 'd' });
    const undone = h.snaps().at(-1)!;
    expect(undone.geometry).not.toBeNull();
    expect(undone.geometry!.edges!.list.some((e) => e.cell === C(30, 64))).toBe(false);
  });

  it('resins: saturation follows bound per snapshot with no geometry resend', () => {
    const { world, deviceIds } = structureDish();
    const h = hostWith(world);
    const resinId = deviceIds[3]!;
    expect(h.snaps().at(-1)!.resins).toEqual([{ id: resinId, cell: C(76, 70), saturation: 0.25 }]);
    const dev = h.live().devices.find((d) => d.id === resinId)!;
    dev.bound = { inhBact: 3, rival: 2 }; // as resin.ts would bind (a stage write: no geometry bump)
    h.step();
    const s = h.snaps().at(-1)!;
    expect(s.geometry).toBeNull();
    expect(s.resins).toEqual([{ id: resinId, cell: C(76, 70), saturation: 1 }]);
    dev.bound = {};
    h.step();
    expect(h.snaps().at(-1)!.resins![0]!.saturation).toBe(0);
  });

  it('environment is present with climate and follows setLightMode and setDrying', () => {
    const { world } = structureDish();
    const h = hostWith(world);
    expect(h.snaps().at(-1)!.environment).toEqual({ lightMode: 'fixed', drying: false });
    h.command({ kind: 'setLightMode', mode: 'cycle' });
    expect(h.snaps().at(-1)!.environment).toEqual({ lightMode: 'cycle', drying: false });
    h.command({ kind: 'setDrying', drying: true });
    expect(h.snaps().at(-1)!.environment).toEqual({ lightMode: 'cycle', drying: true });
  });

  it('CellInspect: climate lines with a heater on equal climate.warmth and derived.moisture', () => {
    const { world } = structureDish();
    const near = C(79, 70); // beside the S09 (on) at (78, 70)
    const before = buildInspector(world, { kind: 'cell', cell: near }).cell!;
    expect(before.climate).toEqual({ warmth: world.settings.warmth, ambientWarmth: world.settings.warmth, warmthLocal: false, moisture: 1, moistureLocal: false });
    run(world, 200);
    expect(world.climate.warmth).not.toBeNull();
    const c = buildInspector(world, { kind: 'cell', cell: near }).cell!;
    expect(c.climate!.warmth).toBe(world.climate.warmth![near]);
    expect(c.climate!.warmth).not.toBe(world.settings.warmth);
    expect(c.climate!.ambientWarmth).toBe(world.settings.warmth);
    expect(c.climate!.warmthLocal).toBe(true);
    expect(c.climate!.moisture).toBe(world.derived.moisture[near]);
  });

  it('CellInspect: lightFactors in cycle mode with the phase, under an S11 with roof 0.25, and absent in a world without climate, S11 or canopy', () => {
    const { world } = structureDish();
    const under = buildInspector(world, { kind: 'cell', cell: C(82, 70) }).cell!; // the S11
    expect(under.lightFactors!.roof).toBe(0.25);
    expect(under.lightFactors!.cycle).toBeUndefined();
    const open = buildInspector(world, { kind: 'cell', cell: C(20, 64) }).cell!;
    expect(open.lightFactors!.roof).toBe(1);
    world.settings.lightMode = 'cycle';
    world.settings.cycleStartTick = 0;
    run(world, 5);
    const cyc = buildInspector(world, { kind: 'cell', cell: C(20, 64) }).cell!;
    expect(cyc.lightFactors!.cycle!.phase).toBe('day');
    expect(cyc.lightFactors!.cycle!.factor).toBe(1);
    // A v1.0 (pre-flip) dish records no climate, S11 or canopy species: no lightFactors key.
    const v1 = buildInspector(clearWater({}, preFlipRegistry()), { kind: 'cell', cell: C(64, 64) }).cell!;
    expect('lightFactors' in v1).toBe(false);
    expect('climate' in v1).toBe(false);
    // Since the systems flip (D-0121) a new dish under the shipped registry records climate: its factors are listed.
    const shipped = buildInspector(clearWater({}, registry()), { kind: 'cell', cell: C(64, 64) }).cell!;
    expect(shipped.lightFactors).toMatchObject({ roof: 1, canopy: 1 });
  });

  it('CellInspect: edge lines with sides, codes, flow out/in and the gate tally (null before any)', () => {
    const { world, edgeIds } = structureDish();
    const s01Id = edgeIds[1]!; // the S01 on the R edge of (40, 61)
    const left = buildInspector(world, { kind: 'cell', cell: C(40, S01_ROW) }).cell!;
    expect(left.edges).toEqual([{ id: s01Id, kind: 'S01', side: 'E', neighbour: C(41, S01_ROW), code: 1, tally: null }]);
    world.gateTally.push({ id: s01Id, fields: { sugar: 0.5 }, organisms: 2 });
    const right = buildInspector(world, { kind: 'cell', cell: C(41, S01_ROW) }).cell!;
    expect(right.edges).toEqual([{ id: s01Id, kind: 'S01', side: 'W', neighbour: C(40, S01_ROW), code: 1, tally: { fields: { sugar: 0.5 }, organisms: 2 } }]);
    // The S04 flowing +1 from (60,60) to (61,60): out of the left cell, into the right one.
    expect(buildInspector(world, { kind: 'cell', cell: S04_FWD }).cell!.edges![0]).toMatchObject({ kind: 'S04', side: 'E', flow: 'out', code: 5 });
    expect(buildInspector(world, { kind: 'cell', cell: S04_FWD + 1 }).cell!.edges![0]).toMatchObject({ kind: 'S04', side: 'W', flow: 'in' });
    // The S04 flowing −1 on the D edge of (62,60): into the upper cell, out of the lower one.
    expect(buildInspector(world, { kind: 'cell', cell: S04_BACK }).cell!.edges![0]).toMatchObject({ side: 'S', flow: 'in' });
    expect(buildInspector(world, { kind: 'cell', cell: S04_BACK + 128 }).cell!.edges![0]).toMatchObject({ side: 'N', flow: 'out' });
    // Shutters: open and closed codes and the open flag.
    expect(buildInspector(world, { kind: 'cell', cell: C(52, 60) }).cell!.edges![0]).toMatchObject({ kind: 'S03', open: true, code: 4 });
    expect(buildInspector(world, { kind: 'cell', cell: C(54, 61) }).cell!.edges![0]).toMatchObject({ kind: 'S03', side: 'N', open: false, code: 3 });
    // A cell with barriers on two sides lists them N, E, S, W.
    pushEdges(world, [{ kind: 'S02', cell: C(40, S01_ROW - 1), dir: 'D' }]);
    expect(buildInspector(world, { kind: 'cell', cell: C(40, S01_ROW) }).cell!.edges!.map((e) => e.side)).toEqual(['N', 'E']);
    expect('edges' in buildInspector(world, { kind: 'cell', cell: C(20, 20) }).cell!).toBe(false);
  });

  it('CellInspect: device lines (settings, a resin with its bound and saturation)', () => {
    const { world, deviceIds } = structureDish();
    const line = (x: number): CellInspect['device'] => buildInspector(world, { kind: 'cell', cell: C(x, 70) }).cell!.device;
    expect(line(70)).toEqual({ id: deviceIds[0], kind: 'S05' });
    expect(line(76)).toEqual({ id: deviceIds[3], kind: 'S08', resinSelect: ['inhBact'], bound: { inhBact: 1.25 }, saturation: 0.25 });
    expect(line(78)).toEqual({ id: deviceIds[4], kind: 'S09', on: true });
    expect(line(80)).toEqual({ id: deviceIds[5], kind: 'S10', on: false });
    expect(line(71)).toBeUndefined();
  });

  it('EntityInspect suitFactors.warmth reads local warmth with the array, the ambient value without', () => {
    const { world } = structureDish();
    const slot = place(world, 'B01', 79.5, 70.5);
    const birthId = world.ents.cols.birthId[slot]!;
    const prof = profileOf(world, slot);
    const ent0 = buildInspector(world, { kind: 'entity', birthId }).entity as EntityInspect;
    expect(ent0.suitFactors.warmth).toBe(response(world.settings.warmth, prof.warmth[0], prof.warmth[1], SHOULDER_WARMTH));
    // The local warmth array as the climate stage allocates it (a heater on), with this cell warmed.
    const cell = ent0.cell;
    const warm = new Float64Array(16384).fill(world.settings.warmth);
    warm[cell] = 0.95;
    world.climate.warmth = warm;
    const ent = buildInspector(world, { kind: 'entity', birthId }).entity!;
    expect(ent.suitFactors.warmth).toBe(response(0.95, prof.warmth[0], prof.warmth[1], SHOULDER_WARMTH));
    expect(ent.suitFactors.warmth).not.toBe(ent0.suitFactors.warmth);
  });

  it('DishInfo: systems and speciesFreeClass (P01 medium, B01 small, B02 fixed)', () => {
    const { world } = structureDish();
    const h = hostWith(world);
    const info: DishInfo = h.info();
    expect(info.systems).toEqual([...world.content.manifest.enabledSystems]);
    expect(info.systems).toContain('climate');
    const cls = (id: string) => info.speciesFreeClass![info.speciesIds.indexOf(id)];
    expect(cls('P01')).toBe('medium');
    expect(cls('B01')).toBe('small');
    expect(cls('B02')).toBe('fixed');
    expect(cls('F01')).toBe('fixed');
    expect(info.speciesFreeClass!.length).toBe(info.speciesIds.length);
  });
});
