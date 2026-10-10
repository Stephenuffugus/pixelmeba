/**
 * G3 gate fixture "transport-obstacles" (BUILD_DIRECTIVE "G3 gate — evidence": pulse, walls, sampling
 * reconciliation; SPEC §2.4, §3.4, §4.1, §10.5, §10.6; CT §5.3; D01 acceptance "Transport and
 * obstacles": a pulse spreads without creating quantity; walls block transport and motion; sampling and
 * replacement correctly reconcile exports and inputs).
 *
 *  - Pulse: a sugar pulse (with its companion nutrient) spreads for 1,000 ticks with its sum constant to
 *    1e-12, a maximum that never rises and falls overall, no negative cell, and the nutrient still in
 *    the carbon's exact proportion in every cell (SPEC §4.1 "companion moves in the same fraction").
 *  - Rings (the Lab command, brush radius 1, around (64, 64)): a wall ring and a stone ring isolate
 *    inside from outside for a dissolved field (sugar in, broth out), an activity field (starch enzyme)
 *    and the viral field (Pinphage units), and for organisms (Sprinters, Ciliates, Hitchers, Crossfeeders
 *    on both sides): zero crossings over 1,000 full ticks, every newborn on its parent's side, and no
 *    infection outside. A porous bead ring passes all three field classes but no swimmer.
 *  - Film halves the dissolved flux across every edge of its cell (one transport step, exact).
 *  - Sampling (sampleTake / sampleTransfer / sampleDiscard through applyNow, as tests/sim/tools.test.ts
 *    does; Begin/Cancel are host-level) and Clean water reconcile exactly with the ledger: a take and a
 *    transfer are internal moves (totals, inputs and exports unchanged), a discard exports exactly the
 *    held totals, and Clean water exports exactly the removed dissolved carbon and nutrient and logs the
 *    CO2 baseline restoration as an input or export.
 */
import { describe, expect, it } from 'vitest';
import { applyNow, type CommandPayload, type CommandResult } from '../../src/sim/commands';
import type { FieldId } from '../../src/sim/fields';
import { FIELD_DEFS, FIELD_IDS } from '../../src/sim/fields';
import { cellIndex, inMask, maskCells, ST_BEAD, ST_NONE, strokeFootprint, transportOpen } from '../../src/sim/grid';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { field as lineageField } from '../../src/sim/lineage';
import { sampleTotals } from '../../src/sim/sampleSlot';
import { entityCell } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import { cleanWaterRemoves, habitatBaseline } from '../../src/sim/tools';
import { stageEnvironment, updateDerived } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { clearWater, place, placeObject, rebaseLedger, setField } from '../helpers/world';

const W = 128;
let seq = 0;
function cmd(w: World, payload: CommandPayload): CommandResult {
  return applyNow(w, `obst-${++seq}`, payload).result!;
}

function sum(w: World, id: FieldId, cells: Iterable<number> = maskCells()): number {
  const a = w.fields[id]!;
  let s = 0;
  for (const k of cells) s += a[k]!;
  return s;
}

/** Clear water with no sugar, CO2 and oxygen kept at the habitat baseline. */
function dish(): World {
  const w = clearWater();
  w.fields.sugar!.fill(0);
  updateDerived(w);
  rebaseLedger(w);
  return w;
}

describe('a pulse spreads without creating quantity (SPEC §4.1)', () => {
  it('sugar and its nutrient: sum constant to 1e-12, maximum never rises, proportion kept, nothing negative', () => {
    const w = dish();
    const cell = cellIndex(64, 64);
    setField(w, 'sugar', cell, 10);
    setField(w, 'sugarN', cell, 1);
    const S0 = sum(w, 'sugar');
    const N0 = sum(w, 'sugarN');
    let max = 10;
    const cells = maskCells();
    for (let t = 0; t < 1000; t++) {
      step(w);
      const a = w.fields.sugar!;
      const n = w.fields.sugarN!;
      let m = 0;
      for (const k of cells) {
        const v = a[k]!;
        if (v < 0) throw new Error(`negative sugar at ${k}`);
        if (v > m) m = v;
      }
      expect(m).toBeLessThanOrEqual(max);
      max = m;
      if (t % 100 === 99) {
        expect(Math.abs(sum(w, 'sugar') - S0) / S0).toBeLessThan(1e-12);
        expect(Math.abs(sum(w, 'sugarN') - N0) / N0).toBeLessThan(1e-12);
        for (const k of cells) expect(Math.abs(n[k]! - 0.1 * a[k]!)).toBeLessThanOrEqual(1e-15 * Math.max(1, a[k]!));
      }
    }
    expect(max).toBeLessThan(0.1); // it really spread: the peak fell more than a hundredfold
    expect(w.fields.sugar![cellIndex(64, 84)]).toBeGreaterThan(0);
    expect(checkLedger(w).ok).toBe(true);
  });
});

/** Points of a closed circle of radius r around (64, 64), one per 4 degrees, first point repeated. */
function circle(r: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let d = 0; d <= 360; d += 4) pts.push([64.5 + r * Math.cos((d * Math.PI) / 180), 64.5 + r * Math.sin((d * Math.PI) / 180)]);
  return pts;
}

/** Cells reachable from (64, 64) through four-neighbour cells for which `open` holds. */
function flood(open: (cell: number) => boolean): Uint8Array {
  const seen = new Uint8Array(W * W);
  const stack = [cellIndex(64, 64)];
  seen[stack[0]!] = 1;
  while (stack.length) {
    const k = stack.pop()!;
    const x = k % W;
    const y = Math.floor(k / W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inMask(nx, ny)) continue;
      const n = cellIndex(nx, ny);
      if (seen[n] || !open(n)) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  return seen;
}

type Ring = 'wall' | 'stone' | 'bead';

interface RingDish {
  readonly w: World;
  /** 1 inside the ring (reachable from the centre without crossing it), 0 elsewhere. */
  readonly inside: Uint8Array;
  readonly insideCells: number[];
  readonly outsideCells: number[];
}

/** A ring of `kind` (the Lab command), fields on both sides, organisms on both sides. */
function ringDish(kind: Ring): RingDish {
  const w = dish();
  const res = cmd(w, { kind: 'placeStructure', structure: kind, points: circle(12), radius: 1 });
  expect(res.accepted).toBeGreaterThan(100);
  const ringCells = new Set(strokeFootprint(circle(12), 1));
  // Inside: reachable from the centre through cells that are not part of the ring.
  const inside = flood((k) => !ringCells.has(k) && w.grid.structure[k] === ST_NONE);
  const insideCells: number[] = [];
  const outsideCells: number[] = [];
  for (const k of maskCells()) {
    if (ringCells.has(k) || !transportOpen(w.grid, k) || w.grid.structure[k] !== ST_NONE) continue;
    (inside[k] ? insideCells : outsideCells).push(k);
  }
  expect(insideCells.length).toBeGreaterThan(200);
  expect(outsideCells.length).toBeGreaterThan(5000);
  // The ring closes: no ring-free path from the centre to the dish edge.
  expect(inside[cellIndex(64, 100)]).toBe(0);
  if (kind !== 'bead') expect(flood((k) => transportOpen(w.grid, k))[cellIndex(64, 100)]).toBe(0);
  else {
    expect(w.grid.structure[strokeFootprint(circle(12), 1)[0]!]).toBe(ST_BEAD);
    expect(flood((k) => transportOpen(w.grid, k))[cellIndex(64, 100)]).toBe(1); // solutes have a path
  }
  // Fields: dissolved sugar, the starch enzyme and Pinphage units inside; broth and metabolite outside.
  for (const k of insideCells) {
    const x = k % W;
    const y = Math.floor(k / W);
    if ((x - 64) ** 2 + (y - 64) ** 2 > 36) continue;
    setField(w, 'sugar', k, 0.5);
    setField(w, 'eStarch', k, 0.5);
    setField(w, 'v01', k, 10);
  }
  for (const k of outsideCells) {
    const x = k % W;
    const y = Math.floor(k / W);
    const d2 = (x - 64) ** 2 + (y - 64) ** 2;
    if (d2 < 18 ** 2 || d2 > 26 ** 2) continue;
    setField(w, 'broth', k, 0.2);
    setField(w, 'metabolite', k, 0.2);
  }
  // Organisms: swimmers inside and outside (Crossfeeders eat the outside metabolite).
  const ins: [string, number][] = [['B01', 8], ['P02', 2], ['X01', 2], ['B05', 2]];
  let n = 0;
  for (const [id, count] of ins) for (let k = 0; k < count; k++, n++) place(w, id, 61.5 + (n % 6), 61.5 + Math.floor(n / 6) * 2);
  n = 0;
  const outs: [string, number][] = [['B01', 6], ['P02', 2], ['X01', 2], ['B05', 6]];
  for (const [id, count] of outs) {
    for (let k = 0; k < count; k++, n++) {
      const a = (n * 2 * Math.PI) / 16;
      place(w, id, 64.5 + 21 * Math.cos(a), 64.5 + 21 * Math.sin(a));
    }
  }
  rebaseLedger(w);
  return { w, inside, insideCells, outsideCells };
}

interface RingRun {
  readonly crossings: string[];
  readonly births: number;
  readonly moves: number;
  readonly outsideInfections: number;
  readonly insideInfections: number;
}

/** 1,000 full ticks; every organism stays on the side it was first seen on (newborns: their parent's). */
function runRing(d: RingDish, check: (w: World, t: number) => void): RingRun {
  const { w, inside } = d;
  const c = w.ents.cols;
  const side = new Map<number, number>();
  const crossings: string[] = [];
  let births = 0;
  let moves = 0;
  let outsideInfections = 0;
  let insideInfections = 0;
  const lastCell = new Map<number, number>();
  const infected = new Set<number>();
  for (let t = 0; t < 1000; t++) {
    step(w);
    for (let i = 0; i < w.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      const b = c.birthId[i]!;
      const cell = entityCell(c.x[i]!, c.y[i]!);
      if (w.grid.structure[cell] !== ST_NONE) crossings.push(`tick ${w.tick}: ${w.species[c.species[i]!]!.id} #${b} in a structure cell ${cell}`);
      const s = inside[cell]!;
      const known = side.get(b);
      if (known === undefined) {
        const parent = lineageField(w.lineage, 'parent', b) ?? 0;
        const ps = parent > 0 ? side.get(parent) : undefined;
        if (ps !== undefined) {
          births++;
          if (ps !== s) crossings.push(`tick ${w.tick}: #${b} born on the other side of its parent #${parent}`);
        }
        side.set(b, s);
      } else if (known !== s) crossings.push(`tick ${w.tick}: ${w.species[c.species[i]!]!.id} #${b} crossed`);
      if (lastCell.get(b) !== undefined && lastCell.get(b) !== cell) moves++;
      lastCell.set(b, cell);
      if (c.infectedBy[i] !== 0 && !infected.has(b)) {
        infected.add(b);
        if (s) insideInfections++;
        else outsideInfections++;
      }
    }
    check(w, t);
  }
  return { crossings, births, moves, outsideInfections, insideInfections };
}

describe('obstacles block transport and motion (SPEC §2.4; CT §5.3)', () => {
  for (const kind of ['wall', 'stone'] as const) {
    it(`a ${kind} ring isolates dissolved, activity and viral fields and every organism for 1,000 ticks`, () => {
      const d = ringDish(kind);
      const { w, insideCells, outsideCells } = d;
      const inner = { sugar: sum(w, 'sugar', insideCells), eStarch: sum(w, 'eStarch', insideCells), v01: sum(w, 'v01', insideCells), broth: sum(w, 'broth', outsideCells) };
      expect(inner.sugar).toBeGreaterThan(10);
      const run = runRing(d, (world, t) => {
        if (t % 10 !== 9) return;
        for (const id of ['sugar', 'eStarch', 'v01'] as const) expect(sum(world, id, outsideCells), `${id} outside at tick ${world.tick}`).toBe(0);
        expect(sum(world, 'broth', insideCells), `broth inside at tick ${world.tick}`).toBe(0);
      });
      expect(run.crossings).toEqual([]);
      expect(run.outsideInfections).toBe(0);
      // Non-vacuity: the fields moved inside the ring, organisms moved and fed and the phage acted.
      expect(sum(w, 'eStarch', insideCells)).toBeGreaterThan(0);
      expect(w.fields.sugar![cellIndex(64, 55)]).toBeGreaterThan(0); // spread from the r ≤ 6 disk towards the ring
      expect(run.moves).toBeGreaterThan(100);
      expect(run.insideInfections).toBeGreaterThan(0);
      expect(sum(w, 'broth', outsideCells)).toBeGreaterThan(0);
      expect(checkLedger(w).ok).toBe(true);
      console.info(`transport-obstacles ${kind} ring: moves ${run.moves}, births ${run.births}, infections inside ${run.insideInfections}, alive ${w.ents.count}`);
    }, 300_000);
  }

  it('a porous bead ring passes dissolved, activity and viral fields but no swimmer', () => {
    const d = ringDish('bead');
    const { w, outsideCells } = d;
    const run = runRing(d, () => {});
    expect(run.crossings).toEqual([]);
    expect(run.moves).toBeGreaterThan(100);
    for (const id of ['sugar', 'eStarch', 'v01'] as const) expect(sum(w, id, outsideCells), `${id} passed the beads`).toBeGreaterThan(0);
    expect(sum(w, 'broth', d.insideCells)).toBeGreaterThan(0);
    expect(checkLedger(w).ok).toBe(true);
  }, 300_000);
});

describe('film halves dissolved transport across its cell edges (SPEC §4.1, §7.1)', () => {
  it('one transport step: the flux out of a film cell, and into it, is exactly half', () => {
    const A = cellIndex(64, 64);
    const E = cellIndex(65, 64);
    const Wc = cellIndex(63, 64);
    const flux = (film: number | null, filmCell = A): { e: number; w: number; total: number } => {
      const w = dish();
      if (film !== null) {
        setField(w, 'film', filmCell, film);
        setField(w, 'filmN', filmCell, film * 0.1);
      }
      setField(w, 'sugar', A, 1);
      const S0 = sum(w, 'sugar');
      stageEnvironment(w);
      return { e: w.fields.sugar![E]!, w: w.fields.sugar![Wc]!, total: sum(w, 'sugar') - S0 };
    };
    const open = flux(null);
    const filmed = flux(0.2);
    const onNeighbour = flux(0.2, E);
    expect(open.e).toBeGreaterThan(0);
    expect(filmed.e).toBe(open.e * 0.5);
    expect(filmed.w).toBe(open.w * 0.5);
    // Film in the east neighbour halves only the shared edge.
    expect(onNeighbour.e).toBe(open.e * 0.5);
    expect(onNeighbour.w).toBe(open.w);
    for (const f of [open, filmed, onNeighbour]) expect(Math.abs(f.total)).toBeLessThan(1e-15);
  });
});

describe('sampling and Clean water reconcile exports and inputs exactly (SPEC §3.4, §10.5, §10.6)', () => {
  /** A dish with life, dissolved food, deposits, a food object and phage around (50, 64). */
  function sampleDish(): World {
    const w = dish();
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const k = cellIndex(50 + dx, 64 + dy);
        setField(w, 'sugar', k, 0.3);
        setField(w, 'sugarN', k, 0.03);
        setField(w, 'starch', k, 0.2);
        setField(w, 'starchN', k, 0.02);
        setField(w, 'metabolite', k, 0.05);
        setField(w, 'v01', k, 3);
      }
    }
    for (let k = 0; k < 6; k++) place(w, 'B01', 48.5 + k * 0.7, 64.5);
    place(w, 'A01', 50.5, 62.5);
    placeObject(w, cellIndex(51, 66), 'pellet', { sugar: 10 }, 1);
    rebaseLedger(w);
    for (let t = 0; t < 20; t++) step(w);
    return w;
  }

  const ledgerState = (w: World) => ({ inputs: { ...w.ledger.inputs }, exports: { ...w.ledger.exports } });

  it('take and transfer are internal moves; discard exports exactly the held totals', () => {
    const w = sampleDish();
    const before = computeTotals(w);
    const l0 = ledgerState(w);
    expect(cmd(w, { kind: 'sampleTake', x: 50, y: 64, radius: 3, mode: 'all' }).accepted).toBeGreaterThan(0);
    const held = sampleTotals(w.sample);
    expect(held.c).toBeGreaterThan(5); // the pellet's carbon, organisms, dissolved and deposits
    expect(w.sample!.rows.length).toBeGreaterThan(0);
    expect(w.sample!.objects.length).toBe(1);
    const afterTake = computeTotals(w);
    expect(Math.abs(afterTake.c - before.c)).toBeLessThan(1e-12 * before.c);
    expect(Math.abs(afterTake.n - before.n)).toBeLessThan(1e-12 * before.n);
    expect(ledgerState(w)).toEqual(l0);
    expect(checkLedger(w).ok).toBe(true);

    // Transfer 20 cells east: a move, never a copy; nothing enters or leaves the ledger.
    expect(cmd(w, { kind: 'sampleTransfer', dx: 20, dy: 0 }).accepted).toBeGreaterThan(0);
    expect(w.sample).toBeNull();
    const afterTransfer = computeTotals(w);
    expect(Math.abs(afterTransfer.c - before.c)).toBeLessThan(1e-12 * before.c);
    expect(Math.abs(afterTransfer.n - before.n)).toBeLessThan(1e-12 * before.n);
    expect(ledgerState(w)).toEqual(l0);
    expect(w.fields.starch![cellIndex(70, 64)]).toBeGreaterThan(0);
    expect(w.fields.starch![cellIndex(50, 64)]).toBe(0);
    expect(checkLedger(w).ok).toBe(true);

    // Take the moved sample again and discard it: exports grow by exactly the held totals.
    expect(cmd(w, { kind: 'sampleTake', x: 70, y: 64, radius: 3, mode: 'all' }).accepted).toBeGreaterThan(0);
    const held2 = sampleTotals(w.sample);
    const ex0 = { ...w.ledger.exports };
    const inputs0 = { ...w.ledger.inputs };
    expect(cmd(w, { kind: 'sampleDiscard' }).accepted).toBeGreaterThan(0);
    expect(w.sample).toBeNull();
    expect(w.ledger.exports.c - ex0.c).toBe(held2.c);
    expect(w.ledger.exports.n - ex0.n).toBe(held2.n);
    expect(w.ledger.exports.m - ex0.m).toBe(held2.m);
    expect(w.ledger.inputs).toEqual(inputs0);
    const afterDiscard = computeTotals(w);
    expect(Math.abs(before.c - held2.c - afterDiscard.c)).toBeLessThan(1e-12 * before.c);
    expect(checkLedger(w).ok).toBe(true);
    // Time goes on with the books closed.
    for (let t = 0; t < 50; t++) step(w);
    expect(checkLedger(w).ok).toBe(true);
  });

  for (const fraction of [0.25, 0.5, 1] as const) {
    it(`Clean water at ${fraction * 100} % exports exactly the removed dissolved C and N and logs the CO2 baseline change`, () => {
      const w = sampleDish();
      const footprint = strokeFootprint([[50, 64]], 3).filter((k) => inMask(k % W, Math.floor(k / W)) && transportOpen(w.grid, k));
      // Move the gases off their baseline so the restoration has something to log.
      for (const k of footprint) {
        w.fields.co2![k] = k % 2 === 0 ? 0.9 : 0.1;
        w.fields.oxygen![k] = 0.2;
      }
      rebaseLedger(w);
      const removable = FIELD_IDS.filter((id) => w.fields[id] !== undefined && cleanWaterRemoves(id));
      let wantC = 0;
      let wantN = 0;
      for (const id of removable) {
        const def = FIELD_DEFS[id];
        const s = sum(w, id, footprint) * fraction * (def.carbonPerUnit ?? 1);
        if (def.material === 'carbon') wantC += s;
        else if (def.material === 'nutrient') wantN += s;
      }
      let co2Add = 0;
      let co2Remove = 0;
      for (const k of footprint) {
        const d = habitatBaseline(w, 'co2', k) - w.fields.co2![k]!;
        if (d > 0) co2Add += d;
        else co2Remove -= d;
      }
      const deposits0 = sum(w, 'starch', footprint);
      const life0 = w.ents.count;
      const objects0 = JSON.stringify(w.objects);
      expect(cmd(w, { kind: 'cleanWater', points: [[50, 64]], radius: 3, fraction }).accepted).toBe(footprint.length);
      expect(wantC).toBeGreaterThan(1);
      expect(w.ledger.exports.c).toBeCloseTo(wantC + co2Remove, 12);
      expect(w.ledger.exports.n).toBeCloseTo(wantN, 12);
      expect(w.ledger.inputs.c).toBeCloseTo(co2Add, 12);
      expect(w.ledger.inputs.n).toBe(0);
      for (const k of footprint) {
        expect(w.fields.co2![k]).toBe(habitatBaseline(w, 'co2', k));
        expect(w.fields.oxygen![k]).toBe(habitatBaseline(w, 'oxygen', k));
        if (fraction === 1) for (const id of removable) expect(w.fields[id]![k], id).toBe(0);
      }
      // Life, deposits and objects are left alone.
      expect(sum(w, 'starch', footprint)).toBe(deposits0);
      expect(w.ents.count).toBe(life0);
      expect(JSON.stringify(w.objects)).toBe(objects0);
      expect(checkLedger(w).ok).toBe(true);
      for (let t = 0; t < 50; t++) step(w);
      expect(checkLedger(w).ok).toBe(true);
    });
  }
});
