/**
 * Phase 5 wave 11 region-charts-gates: organism crossings per species (src/worker/probes.ts; SPEC §12.8;
 * D-0119 "membership changes between ticks matched by slot and birthId").
 *
 * - A birth inside a region is not an entry and a death (or a discarded sample) is not a leave: the
 *   whole dish as a region records no crossing in a growing, dying dish.
 * - A slot reused by a new organism is not a crossing (slot AND birthId).
 * - A move by a Sample Transfer counts, also when the sample was held across ticks; overlapping regions
 *   each count their own entries and leaves.
 * - Undo (a restored world) drops the later seconds.
 * - The 60, 180 and 600 s windows are differences of the cumulative record.
 */
import { describe, expect, it } from 'vitest';
import { applyNow, type CommandPayload } from '../../src/sim/commands';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { ProbeSet, type ProbeMask, type ProbeReading } from '../../src/worker/probes';
import { aliveOf, clearWater, place } from '../helpers/world';

const rect = (id: ProbeMask['id'], x0: number, y0: number, x1: number, y1: number): ProbeMask => ({ id, shape: 'rect', x0, y0, x1, y1 });
const circle = (id: ProbeMask['id'], cx: number, cy: number, r: number): ProbeMask => ({ id, shape: 'circle', cx, cy, r });

function stepWith(w: World, ps: ProbeSet, ticks: number, each?: (w: World) => void): void {
  for (let t = 0; t < ticks; t++) {
    step(w, { afterStage: ps.hook });
    ps.afterTick(w);
    each?.(w);
  }
}

let seq = 0;
const cmd = (w: World, payload: CommandPayload) => applyNow(w, `cross-${++seq}`, payload).result!;
const crossingsOf = (r: ProbeReading, species = 'B01') => r.crossings.find((c) => c.species === species) ?? { species, entered: 0, left: 0 };
const totals = (r: ProbeReading) => r.crossings.reduce((s, c) => ({ entered: s.entered + c.entered, left: s.left + c.left }), { entered: 0, left: 0 });

describe('organism crossings', () => {
  it('births are not entries and deaths are not leaves (the whole dish as a region)', () => {
    const w = clearWater({ lid: 'closed', backgroundOverrides: { sugar: 0.6 } });
    for (let k = 0; k < 6; k++) place(w, 'B01', 40.5 + 8 * k, 64.5);
    const ps = new ProbeSet(w);
    ps.set([rect('A', 0, 0, 127, 127)], w);
    let births = 0;
    let deaths = 0;
    let prev = new Set(aliveOf(w).map((i) => w.ents.cols.birthId[i]!));
    stepWith(w, ps, 1500, (x) => {
      const now = new Set(aliveOf(x).map((i) => x.ents.cols.birthId[i]!));
      for (const b of now) if (!prev.has(b)) births++;
      for (const b of prev) if (!now.has(b)) deaths++;
      prev = now;
    });
    expect(births).toBeGreaterThan(0);
    expect(deaths).toBeGreaterThan(0); // a dividing parent ends; daughters are new organisms
    const r = ps.read(w, 600).masks[0]!;
    expect(r.crossings).toEqual([]);
    expect(r.total).toBe(aliveOf(w).length);
    // A discarded sample is a removal, not a leave.
    const [slot] = aliveOf(w);
    const c = w.ents.cols;
    expect(cmd(w, { kind: 'sampleTake', x: c.x[slot!]!, y: c.y[slot!]!, radius: 1, mode: 'life' }).accepted).toBeGreaterThan(0);
    expect(cmd(w, { kind: 'sampleDiscard' }).accepted).toBeGreaterThan(0);
    stepWith(w, ps, 5);
    expect(ps.read(w, 600).masks[0]!.crossings).toEqual([]);
  });

  it('a slot reused by a new organism is not a crossing', () => {
    const w = clearWater({ lid: 'closed', backgroundOverrides: { sugar: 0 } });
    const inside = place(w, 'B01', 40.5, 40.5);
    place(w, 'B01', 90.5, 90.5);
    const ps = new ProbeSet(w);
    ps.set([rect('A', 30, 30, 50, 50)], w);
    stepWith(w, ps, 3);
    // Between two ticks: the organism inside A is taken and discarded, and a new one placed far outside
    // takes its slot (lowest free first).
    const c = w.ents.cols;
    const oldBirth = c.birthId[inside]!;
    expect(cmd(w, { kind: 'sampleTake', x: c.x[inside]!, y: c.y[inside]!, radius: 1, mode: 'life' }).accepted).toBeGreaterThan(0);
    expect(cmd(w, { kind: 'sampleDiscard' }).accepted).toBeGreaterThan(0);
    const reused = place(w, 'B01', 100.5, 64.5);
    expect(reused).toBe(inside);
    expect(c.birthId[reused]).not.toBe(oldBirth);
    stepWith(w, ps, 3);
    const r = ps.read(w, 60).masks[0]!;
    expect(r.crossings).toEqual([]);
    expect(r.total).toBe(0);
  });

  it('a Sample Transfer counts (held across ticks too); overlapping regions each count independently', () => {
    const w = clearWater({ lid: 'closed', backgroundOverrides: { sugar: 0 } });
    const slot = place(w, 'B01', 34.5, 34.5);
    const ps = new ProbeSet(w);
    // A and B overlap on 40…50; C holds both and more.
    ps.set([rect('A', 25, 25, 50, 50), rect('B', 40, 40, 70, 70), circle('C', 45, 45, 30)], w);
    stepWith(w, ps, 2);
    const c = w.ents.cols;
    const move = (dx: number, dy: number, ticksHeld = 0) => {
      const s = aliveOf(w, 'B01')[0]!;
      expect(cmd(w, { kind: 'sampleTake', x: c.x[s]!, y: c.y[s]!, radius: 1, mode: 'life' }).accepted).toBeGreaterThan(0);
      if (ticksHeld > 0) stepWith(w, ps, ticksHeld);
      expect(cmd(w, { kind: 'sampleTransfer', dx, dy }).accepted).toBeGreaterThan(0);
      stepWith(w, ps, 1);
    };
    expect(aliveOf(w, 'B01')).toEqual([slot]);
    move(11, 11); // into the overlap: B entered; A and C unchanged
    let [a, b, cc] = ps.read(w, 60).masks as [ProbeReading, ProbeReading, ProbeReading];
    expect(crossingsOf(a)).toEqual({ species: 'B01', entered: 0, left: 0 });
    expect(crossingsOf(b)).toEqual({ species: 'B01', entered: 1, left: 0 });
    expect(cc.crossings).toEqual([]);
    move(20, 20, 3); // held 3 ticks, then into B only: A left; B unchanged
    [a, b, cc] = ps.read(w, 60).masks as [ProbeReading, ProbeReading, ProbeReading];
    expect(crossingsOf(a)).toEqual({ species: 'B01', entered: 0, left: 1 });
    expect(crossingsOf(b)).toEqual({ species: 'B01', entered: 1, left: 0 });
    expect(cc.crossings).toEqual([]);
    move(40, 0); // out of everything
    [a, b, cc] = ps.read(w, 60).masks as [ProbeReading, ProbeReading, ProbeReading];
    expect(crossingsOf(a)).toEqual({ species: 'B01', entered: 0, left: 1 });
    expect(crossingsOf(b)).toEqual({ species: 'B01', entered: 1, left: 1 });
    expect(crossingsOf(cc)).toEqual({ species: 'B01', entered: 0, left: 1 });
  });

  it('Undo drops the later seconds; windows of 60, 180 and 600 s are differences of the cumulative record', () => {
    const w = clearWater({ lid: 'closed', backgroundOverrides: { sugar: 0.3 } });
    for (let k = 0; k < 10; k++) place(w, 'B01', 50.5 + 3 * (k % 5), 50.5 + 6 * Math.floor(k / 5));
    const ps = new ProbeSet(w);
    ps.set([rect('A', 48, 48, 56, 56), circle('B', 58, 58, 4), rect('C', 45, 40, 70, 54)], w);
    // Cumulative entries per region after each whole second (the run is under 600 s, so the 600 s
    // window holds everything recorded).
    const cum: number[][] = [];
    let saved: ReturnType<typeof serializeWorld> | null = null;
    let at100: ReturnType<ProbeSet['read']> | null = null;
    stepWith(w, ps, 2000, (x) => {
      if (x.tick % 10 === 0) cum[x.tick / 10] = ps.read(x, 600).masks.map((m) => totals(m).entered + 1000 * totals(m).left);
      if (x.tick === 1000) {
        saved = serializeWorld(x);
        at100 = ps.read(x, 600);
      }
    });
    const end = ps.read(w, 600);
    expect(end.masks.reduce((s, m) => s + totals(m).entered + totals(m).left, 0)).toBeGreaterThan(0);
    for (const [win, from] of [[60, 140], [180, 20], [600, 0]] as const) {
      const r = ps.read(w, win);
      r.masks.forEach((m, k) => {
        const v = totals(m).entered + 1000 * totals(m).left;
        expect(v, `${win} s, region ${m.id}`).toBe(cum[200]![k]! - (from > 0 ? cum[from]![k]! : 0));
        expect(m.series.seconds.length).toBe(Math.min(win, 200));
      });
    }
    // Undo to tick 1000: the reading equals the one taken at tick 1000.
    const restored = deserializeWorld(saved!);
    const back = ps.read(restored, 600);
    expect(back.masks.map((m) => [m.crossings, m.series.seconds, m.series.total])).toEqual(
      at100!.masks.map((m) => [m.crossings, m.series.seconds, m.series.total]),
    );
    expect(Math.max(...back.masks[0]!.series.seconds)).toBe(99);
    // Recording continues from the restored world.
    stepWith(restored, ps, 20);
    expect(ps.read(restored, 600).masks[0]!.series.seconds.at(-1)).toBe(101);
  });
});
