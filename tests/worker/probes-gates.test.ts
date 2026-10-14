/**
 * Phase 5 wave 11 region-charts-gates: region probes on dishes with edge barriers (src/worker/probes.ts;
 * SPEC §12.4, §12.8, §13.5; CT §10.3 E207/E209 "sugar crosses membrane; no organisms cross"; D-0108,
 * D-0117, D-0119).
 *
 * The membrane dish: an S01 line on the R edges of column 63 (between x = 63 and x = 64), sugar 1.0 on
 * the left half, Sprinters on both sides, lid closed. Region A is the left half, B the right half, so
 * the only boundary either has inside the dish is the membrane.
 * - A's sugar into is negative, B's positive, equal and opposite; while all sugar crosses left to right
 *   (the first 1,000 ticks) B's window amount equals the S01 gates' window sugar tally, and over the run
 *   their since-start tally; later the net stays at most the gross tally; over 3,000 ticks no Sprinter
 *   crosses (E209's measure) and the gates count 0 organisms; WORLD_GATES sums the tally and grows; there
 *   is no S02 gate.
 * - A small gate in the line: the right half's entries and leaves equal the S02's tallied organisms.
 * - An S04 channel's moves appear in its gate totals.
 * - Salt and silicate are measured; the decaying pools are 'notMeasured' ('decays', or 'resin' where an
 *   S08 selecting the field sits in the region).
 * - A v1.0 dish's reading equals the reading HEAD's probes.ts gave (golden below), with gates [] and the
 *   appended salt and silicate entries only (fix 1: no decaying pool without 'barriers' or 'devices';
 *   v01/v02 only where V01/V02 are recorded).
 * - Read-only: six regions read every 10 ticks over 2,000 ticks change no stateHash, no full trajectory
 *   digest and not the (unhashed) gate tally.
 */
import { describe, expect, it } from 'vitest';
import { GRID_W } from '../../src/sim/constants';
import { cellIndex, cellX, maskCells } from '../../src/sim/grid';
import { WORLD_GATES } from '../../src/sim/objectives';
import { stateHash } from '../../src/sim/serialize';
import { step } from '../../src/sim/tick';
import type { SystemFlag } from '../../src/sim/fields';
import type { World } from '../../src/sim/world';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { listedDecayingFields, PROBE_DECAYING_FIELDS, ProbeSet, type ProbeMask, type ProbeReading } from '../../src/worker/probes';
import { registryWith } from '../helpers/registry';
import { trajectoryDigest } from '../helpers/trajectory';
import {
  barrierRegistry,
  clearWater,
  PHASE5_STRUCTURE_IDS,
  place,
  preFlipRegistry,
  pushDevices,
  pushEdges,
  registry,
  resterRegistry,
  setField,
  verticalLine,
} from '../helpers/world';

const rect = (id: ProbeMask['id'], x0: number, y0: number, x1: number, y1: number): ProbeMask => ({ id, shape: 'rect', x0, y0, x1, y1 });
const circle = (id: ProbeMask['id'], cx: number, cy: number, r: number): ProbeMask => ({ id, shape: 'circle', cx, cy, r });
const LEFT = rect('A', 0, 0, 63, 127);
const RIGHT = rect('B', 64, 0, 127, 127);

/** Step with the probes' stage hook and afterTick, as the host does; `each` after every tick. */
function stepWith(w: World, ps: ProbeSet, ticks: number, each?: (w: World) => void): void {
  for (let t = 0; t < ticks; t++) {
    step(w, { afterStage: ps.hook });
    ps.afterTick(w);
    each?.(w);
  }
}

/**
 * Every Phase 5 system these probes report on: the shipped systems plus barriers, climate, devices,
 * silicate, signals and rivalry, and S01–S12 (allowUnimplemented: the lead lists the structures and
 * systems as implemented at the Phase 5 systems flip, D-0104; signals and rivalry are e2-signals' this wave).
 */
function wideRegistry(): ContentRegistry {
  const systems = [...registry().manifest.enabledSystems, 'barriers', 'climate', 'devices', 'rivalry', 'signals', 'silicate'].sort() as SystemFlag[];
  return registryWith({ enabledSystems: systems, enabledStructures: ['BEAD', ...PHASE5_STRUCTURE_IDS, 'STONE', 'WALL'] }, { allowUnimplemented: true });
}

/** The membrane dish (see the header); `gate` replaces rows y0…y1 of the line with that edge kind. */
function membraneDish(opts: { sugarLeft?: number; background?: number; gate?: { kind: 'S02'; y0: number; y1: number } } = {}): World {
  const w = clearWater({ lid: 'closed', backgroundOverrides: { sugar: opts.background ?? 0 } }, barrierRegistry());
  const g = opts.gate;
  const line = verticalLine('S01', 63, 0, 127).filter((e) => !g || Math.floor(e.cell / GRID_W) < g.y0 || Math.floor(e.cell / GRID_W) > g.y1);
  pushEdges(w, line);
  if (g) pushEdges(w, verticalLine(g.kind, 63, g.y0, g.y1));
  if (opts.sugarLeft !== undefined) for (const cell of maskCells()) if (cellX(cell) <= 63) setField(w, 'sugar', cell, opts.sugarLeft);
  return w;
}

const boundary = (r: ProbeReading, f: string) => r.boundary.find((b) => b.field === f)!;
const sumWindow = (gates: ReturnType<ProbeSet['read']>['gates'], kind: string, f: string) =>
  gates.filter((g) => g.kind === kind).reduce((s, g) => s + (g.window?.fields.find((x) => x.field === f)?.amount ?? 0), 0);
const sumSince = (gates: ReturnType<ProbeSet['read']>['gates'], kind: string, f: string) =>
  gates.filter((g) => g.kind === kind).reduce((s, g) => s + (g.sinceStart.fields.find((x) => x.field === f)?.amount ?? 0), 0);
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300);

describe('region probes on the membrane dish (E207/E209 measures)', () => {
  it('sugar crosses the membrane: A loses what B gains, B equals the S01 tally; no organism crosses', () => {
    const w = membraneDish({ sugarLeft: 1 });
    for (const [x, y] of [[40.5, 64.5], [44.5, 50.5], [90.5, 64.5], [86.5, 80.5]] as const) place(w, 'B01', x, y);
    const ps = new ProbeSet(w);
    ps.set([LEFT, RIGHT], w);
    // Until tick 1000 every membrane edge carries sugar left to right, so the net into B equals the
    // tallied |flux|. Later the Sprinters multiplying on the left eat the sugar beside the membrane and
    // some flows back (net < gross), as a gross tally in either direction should show.
    stepWith(w, ps, 1000);
    const r60 = ps.read(w, 60);
    const [a, b] = r60.masks as [ProbeReading, ProbeReading];
    const sa = boundary(a, 'sugar');
    const sb = boundary(b, 'sugar');
    expect(sa.status).toBe('measured');
    expect(sb.status).toBe('measured');
    expect(sa.into).toBeLessThan(0);
    expect(sb.into).toBeGreaterThan(0);
    expect(rel(-sa.into, sb.into)).toBeLessThan(1e-9);
    // Every S01 sits on both regions' boundary; B's window into is the gates' window sugar tally.
    const s01 = r60.gates.filter((g) => g.kind === 'S01');
    expect(s01.length).toBe(w.edges.length);
    for (const g of s01) expect(g.regions).toEqual(['A', 'B']);
    expect(s01.every((g) => g.window !== null && g.window.recordedSinceSecond === null)).toBe(true);
    expect(rel(sb.into, sumWindow(r60.gates, 'S01', 'sugar'))).toBeLessThan(1e-9);
    // The whole run (inside the 600 s window): B's into equals the cumulative tally and WORLD_GATES.
    const r600 = ps.read(w, 600);
    const total = boundary(r600.masks[1]!, 'sugar').into;
    const tally = w.gateTally.reduce((s, t) => s + (t.fields.sugar ?? 0), 0);
    expect(rel(total, sumSince(r600.gates, 'S01', 'sugar'))).toBeLessThan(1e-9);
    expect(rel(total, tally)).toBeLessThan(1e-9);
    expect(WORLD_GATES.transferred(w, 'S01', 'sugar')).toBe(sumSince(r600.gates, 'S01', 'sugar'));
    const mid = WORLD_GATES.transferred(w, 'S01', 'sugar')!;
    expect(mid).toBeGreaterThan(0);
    // Series: one point per recorded second of the window, the boundary amounts summing to the total.
    expect(b.series.seconds.length).toBe(60);
    expect(b.series.seconds[59]).toBe(99);
    const pool = b.series.pools.find((p) => p.field === 'sugar')!;
    expect(rel(pool.into.reduce<number>((s, v) => s + (v ?? 0), 0), sb.into)).toBeLessThan(1e-9);
    expect(b.series.total.at(-1)).toBe(b.total);
    expect(b.series.biomass.at(-1)).toBeCloseTo(b.biomass, 12);
    // On to 3,000 ticks: still equal and opposite, net never above the gross tally, the tally grows.
    stepWith(w, ps, 2000);
    const end = ps.read(w, 600);
    const ea = boundary(end.masks[0]!, 'sugar').into;
    const eb = boundary(end.masks[1]!, 'sugar').into;
    expect(rel(-ea, eb)).toBeLessThan(1e-9);
    expect(eb).toBeLessThanOrEqual(sumWindow(end.gates, 'S01', 'sugar') * (1 + 1e-9));
    expect(WORLD_GATES.transferred(w, 'S01', 'sugar')!).toBeGreaterThan(mid);
    expect(WORLD_GATES.transferred(w, 'S01', 'sugar')).toBe(sumSince(end.gates, 'S01', 'sugar'));
    // E209: no organism crossed the membrane.
    expect(end.masks.every((m) => m.crossings.length === 0)).toBe(true);
    expect(end.masks.every((m) => m.total > 0)).toBe(true);
    expect(end.gates.every((g) => g.sinceStart.organisms === 0)).toBe(true);
    expect(WORLD_GATES.organisms!(w, 'S01')).toBe(0);
    // The dish has no small gate.
    expect(WORLD_GATES.transferred(w, 'S02', 'sugar')).toBeNull();
    expect(WORLD_GATES.organisms!(w, 'S02')).toBeNull();
  });

  it('a small gate in the line: the right half’s entries and leaves equal the S02’s tallied organisms', () => {
    const w = membraneDish({ background: 0.4, gate: { kind: 'S02', y0: 54, y1: 74 } });
    for (let k = 0; k < 16; k++) place(w, 'B01', 60.5 + (k % 8), 56.5 + 2 * Math.floor(k / 2) + (k % 2) * 0.3);
    const ps = new ProbeSet(w);
    ps.set([LEFT, RIGHT], w);
    stepWith(w, ps, 3000);
    const r = ps.read(w, 600);
    const [a, b] = r.masks as [ProbeReading, ProbeReading];
    const sum = (m: ProbeReading, k: 'entered' | 'left') => m.crossings.reduce((s, c) => s + c[k], 0);
    const s02 = r.gates.filter((g) => g.kind === 'S02').reduce((s, g) => s + g.sinceStart.organisms, 0);
    expect(s02).toBeGreaterThan(0);
    expect(sum(b, 'entered') + sum(b, 'left')).toBe(s02);
    expect(sum(a, 'entered')).toBe(sum(b, 'left'));
    expect(sum(a, 'left')).toBe(sum(b, 'entered'));
    expect(WORLD_GATES.organisms!(w, 'S02')).toBe(s02);
    expect(r.gates.filter((g) => g.kind === 'S01').every((g) => g.sinceStart.organisms === 0)).toBe(true);
    expect(b.crossings.every((c) => c.species === 'B01')).toBe(true);
  });

  it('an S04 channel’s moves appear in its gate totals', () => {
    const w = clearWater({ lid: 'closed', backgroundOverrides: { sugar: 0 } }, barrierRegistry());
    const src = cellIndex(40, 40);
    const [id] = pushEdges(w, [{ kind: 'S04', cell: src, dir: 'R', flow: 1 }]);
    setField(w, 'sugar', src, 1);
    place(w, 'B01', 40.5, 40.5);
    const ps = new ProbeSet(w);
    ps.set([rect('C', 41, 40, 41, 40), rect('D', 40, 40, 40, 40)], w);
    stepWith(w, ps, 100);
    const r = ps.read(w, 60);
    expect(r.gates.length).toBe(1);
    const g = r.gates[0]!;
    expect(g).toMatchObject({ id, kind: 'S04', cell: src, dir: 'R', regions: ['C', 'D'] });
    const sugar = g.sinceStart.fields.find((f) => f.field === 'sugar')!;
    expect(sugar.amount).toBeGreaterThan(0);
    expect(sugar.amount).toBe(w.gateTally.find((t) => t.id === id)!.fields.sugar);
    expect(g.sinceStart.organisms).toBe(w.gateTally.find((t) => t.id === id)!.organisms);
    expect(WORLD_GATES.transferred(w, 'S04', 'sugar')).toBe(sugar.amount);
    // The source cell loses sugar and the destination gains (by the channel, and by diffusion round the
    // channel's edge through their other neighbours).
    expect(boundary(r.masks[0]!, 'sugar').into).toBeGreaterThan(0);
    expect(boundary(r.masks[1]!, 'sugar').into).toBeLessThan(0);
  });
});

describe('boundary statuses', () => {
  it('salt and silicate are measured; decaying pools are not, with the reason (resin where an S08 selects it)', () => {
    const w = clearWater({ lid: 'closed', backgroundOverrides: { sugar: 0 } }, wideRegistry());
    expect(w.fields.silicate).toBeDefined();
    expect(w.fields.sGlow).toBeDefined();
    expect(w.fields.rival).toBeDefined();
    for (let dx = -3; dx <= 3; dx++)
      for (let dy = -3; dy <= 3; dy++) {
        setField(w, 'salt', cellIndex(63 + dx, 40 + dy), 1);
        setField(w, 'silicate', cellIndex(63 + dx, 80 + dy), 0.5);
      }
    pushDevices(w, [{ kind: 'S08', cell: cellIndex(30, 64), resinSelect: ['rival'] }]);
    const ps = new ProbeSet(w);
    ps.set([LEFT, RIGHT], w);
    stepWith(w, ps, 200);
    const [a, b] = ps.read(w, 60).masks as [ProbeReading, ProbeReading];
    for (const f of ['salt', 'silicate']) {
      expect(boundary(b, f).status, f).toBe('measured');
      expect(boundary(b, f).into, f).toBeGreaterThan(0);
      expect(rel(boundary(a, f).into, -boundary(b, f).into), f).toBeLessThan(1e-9);
      expect(boundary(b, f).why).toBeUndefined();
    }
    for (const f of ['inhBact', 'eStarch', 'sGlow', 'rival', 'quencher', 'v01']) {
      expect(boundary(b, f), f).toEqual({ field: f, status: 'notMeasured', into: 0, why: 'decays' });
    }
    expect(boundary(a, 'rival')).toEqual({ field: 'rival', status: 'notMeasured', into: 0, why: 'resin' });
    expect(boundary(a, 'inhBact').why).toBe('decays');
    // Every decaying pool the world uses is listed, after the boundary pools: the 'viruses' system
    // allocates v02, but V02 is not recorded, so Lacephage is not named (fix 1; D-0104).
    expect(w.fields.v02).toBeDefined();
    expect(a.boundary.slice(10).map((x) => x.field)).toEqual(PROBE_DECAYING_FIELDS.filter((f) => f !== 'v02'));
    expect(listedDecayingFields(w)).toEqual(PROBE_DECAYING_FIELDS.filter((f) => f !== 'v02'));
    // A resin with nothing selected (Off) does not change the reason.
    const w2 = clearWater({ lid: 'closed' }, wideRegistry());
    pushDevices(w2, [{ kind: 'S08', cell: cellIndex(30, 64) }]);
    const ps2 = new ProbeSet(w2);
    ps2.set([LEFT], w2);
    expect(boundary(ps2.read(w2, 60).masks[0]!, 'rival').why).toBe('decays');
  });

  it('the phage pools are listed only where the dish records the phage (fix 1)', () => {
    const w = clearWater({ lid: 'closed' }, resterRegistry());
    expect(w.content.manifest.enabledSpecies).toContain('V02');
    const ps = new ProbeSet(w);
    ps.set([LEFT], w);
    const fields = ps.read(w, 60).masks[0]!.boundary.slice(10).map((x) => x.field);
    expect(fields).toContain('v01');
    expect(fields).toContain('v02');
    expect(boundary(ps.read(w, 60).masks[0]!, 'v02')).toEqual({ field: 'v02', status: 'notMeasured', into: 0, why: 'decays' });
    // barrierRegistry: the shipped species (V01, not V02) with barriers and devices.
    const w2 = clearWater({ lid: 'closed' }, barrierRegistry());
    expect(w2.fields.v02).toBeDefined();
    expect(listedDecayingFields(w2)).toContain('v01');
    expect(listedDecayingFields(w2)).not.toContain('v02');
  });

  it('with the lid open the gases say why', () => {
    const w = clearWater({ lid: 'open' });
    const ps = new ProbeSet(w);
    ps.set([LEFT], w);
    stepWith(w, ps, 20);
    const r = ps.read(w, 60).masks[0]!;
    expect(boundary(r, 'oxygen')).toEqual({ field: 'oxygen', status: 'notMeasured', into: 0, why: 'gas' });
    expect(boundary(r, 'salt').status).toBe('measured');
    expect(boundary(r, 'silicate')).toEqual({ field: 'silicate', status: 'absent', into: 0 });
    expect(boundary(r, 'starch')).toEqual({ field: 'starch', status: 'notMeasured', into: 0 });
  });
});

/**
 * Golden: the reading HEAD's src/worker/probes.ts (before this wave; `git show HEAD:src/worker/probes.ts`
 * run on this exact scenario by a scratch script, tmp/region-charts-gates/golden.test.ts) gave. Shipped
 * registry before the systems flip (now preFlipRegistry, D-0121), clear water, lid closed, background sugar 0.2, a sugar patch, three Sprinters and a Sunbead,
 * 50 ticks, window 60.
 */
const V10_GOLDEN =
  '{"tick":50,"windowSeconds":60,"masks":[{"id":"A","shape":"rect","cellCount":364,"population":[{"species":"A01","count":1},{"species":"B01","count":1}],"total":2,"biomass":3.1594192365397302,"means":[{"field":"sugar","mean":0.28645521460241696},{"field":"starch","mean":0},{"field":"detritus","mean":0},{"field":"oil","mean":0},{"field":"protein","mean":0},{"field":"broth","mean":0},{"field":"oxygen","mean":0.7998441286070281},{"field":"co2","mean":0.49959105747257704}],"boundary":[{"field":"sugar","status":"measured","into":-7.203468382009987},{"field":"starch","status":"notMeasured","into":0},{"field":"detritus","status":"notMeasured","into":0},{"field":"oil","status":"notMeasured","into":0},{"field":"protein","status":"notMeasured","into":0},{"field":"broth","status":"measured","into":0},{"field":"oxygen","status":"measured","into":-0.0834882959834431},{"field":"co2","status":"measured","into":0.1418976857470966}],"recordedSinceSecond":null},{"id":"B","shape":"circle","cellCount":197,"population":[{"species":"A01","count":1},{"species":"B01","count":2}],"total":3,"biomass":4.483965247967314,"means":[{"field":"sugar","mean":0.31820268637890514},{"field":"starch","mean":0},{"field":"detritus","mean":0},{"field":"oil","mean":0},{"field":"protein","mean":0},{"field":"broth","mean":0},{"field":"oxygen","mean":0.79920100265752},{"field":"co2","mean":0.4998013215681564}],"boundary":[{"field":"sugar","status":"measured","into":-8.338145257790181},{"field":"starch","status":"notMeasured","into":0},{"field":"detritus","status":"notMeasured","into":0},{"field":"oil","status":"notMeasured","into":0},{"field":"protein","status":"notMeasured","into":0},{"field":"broth","status":"measured","into":0},{"field":"oxygen","status":"measured","into":0.010574021448491067},{"field":"co2","status":"measured","into":0.056885507799393054}],"recordedSinceSecond":null}],"overlaps":[["A","B"]]}';

describe('a v1.0 dish', () => {
  it('reads as before: the old keys and boundary entries equal; gates [], salt measured, silicate absent, nothing else appended', () => {
    // A v1.0 dish records no Phase 5 system: the pre-flip manifest (since the systems flip, D-0121, a new
    // dish under the shipped registry records barriers and devices and lists the decaying pools).
    const w = clearWater({ lid: 'closed', backgroundOverrides: { sugar: 0.2 } }, preFlipRegistry());
    for (const f of ['inhBact', 'eStarch', 'breaker', 'v01', 'v02'] as const) expect(w.fields[f], f).toBeDefined();
    expect(listedDecayingFields(w)).toEqual([]);
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) setField(w, 'sugar', cellIndex(60 + dx, 60 + dy), 1);
    place(w, 'B01', 58.5, 60.5);
    place(w, 'B01', 66.5, 62.5);
    place(w, 'B01', 30.5, 90.5);
    place(w, 'A01', 62.5, 70.5);
    const ps = new ProbeSet(w);
    ps.set([rect('A', 50, 50, 63, 75), circle('B', 64, 64, 8)], w);
    stepWith(w, ps, 50);
    const r = ps.read(w, 60);
    const golden = JSON.parse(V10_GOLDEN) as { tick: number; windowSeconds: number; overlaps: unknown; masks: Record<string, unknown>[] };
    expect(r.gates).toEqual([]);
    expect(r.tick).toBe(golden.tick);
    expect(r.overlaps).toEqual(golden.overlaps);
    r.masks.forEach((m, k) => {
      const old = golden.masks[k]!;
      const { crossings: _c, series: _s, boundary: b, ...rest } = m;
      const { boundary: oldB, ...oldRest } = old as { boundary: unknown[] };
      expect(rest).toEqual(oldRest);
      // fix 1: exactly today's entries plus salt and silicate; no decaying pool (the world has their
      // fields, but records neither 'barriers' nor 'devices'), so no Phase 5 name (Lacephage) appears.
      expect(b).toEqual([...oldB, { field: 'salt', status: 'measured', into: 0 }, { field: 'silicate', status: 'absent', into: 0 }]);
    });
  });
});

describe('probes are read only', () => {
  it('six regions read every 10 ticks over 2,000 ticks: equal stateHash, full digest and gate tally', () => {
    const build = (): World => {
      const w = membraneDish({ sugarLeft: 0.8, background: 0.2, gate: { kind: 'S02', y0: 54, y1: 74 } });
      pushEdges(w, [{ kind: 'S04', cell: cellIndex(30, 40), dir: 'R', flow: 1 }]);
      pushDevices(w, [{ kind: 'S08', cell: cellIndex(90, 30), resinSelect: ['inhBact'] }]);
      for (let k = 0; k < 12; k++) place(w, 'B01', 58.5 + k, 60.5 + (k % 5));
      place(w, 'B01', 30.5, 40.5);
      return w;
    };
    const plain = build();
    const watched = build();
    const ps = new ProbeSet(watched);
    ps.set(
      [LEFT, RIGHT, circle('C', 64, 64, 12), rect('D', 20, 30, 40, 50), circle('E', 90, 30, 6), rect('F', 0, 0, 127, 127)],
      watched,
    );
    let reads = 0;
    stepWith(watched, ps, 2000, (w) => {
      if (w.tick % 10 === 0) {
        ps.read(w, w.tick % 20 === 0 ? 60 : 600);
        reads++;
      }
    });
    for (let t = 0; t < 2000; t++) step(plain);
    expect(reads).toBe(200);
    expect(watched.gateTally.length).toBeGreaterThan(0);
    expect(stateHash(watched)).toBe(stateHash(plain));
    expect(trajectoryDigest(watched, 'full')).toBe(trajectoryDigest(plain, 'full'));
    expect(JSON.stringify(watched.gateTally)).toBe(JSON.stringify(plain.gateTally));
    expect(watched.climate).toEqual(plain.climate);
  }, 300_000);
});
