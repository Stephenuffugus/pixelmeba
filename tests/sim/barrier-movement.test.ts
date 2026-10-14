/**
 * Phase 5 wave 9 barrier-movement: organism paths through edge barriers and S05 shelters (SPEC §2.4,
 * §4.9 "Organism paths check every crossed edge. A host and attached parasite move as one unit in the
 * host's class", §6.4 "reachable by a straight edge-checked trace … no tunneling"; CT §1.1, §4, §5.3;
 * D-0106; src/sim/edgePassage.ts, movement.ts traceFraction/decide, crossing.ts enterCell).
 *
 *  - No tunnelling: a full S01 line holds B01 and P01 on their side for 3,000 ticks with food across.
 *  - The leak fixture: a B01 held two cells from a short S01 segment in open water (no blocked cell in
 *    its decision window) never chooses a target across it (decide's window fast path).
 *  - S02 passes Small (B01) only: P01 (Medium) and P04 (Large, on sediment) never cross.
 *  - S03: closed blocks; open everywhere is exactly "no barrier" (byte-identical entity columns).
 *  - S04's edge is closed to ordinary movement in both directions (D-0106).
 *  - The exact-corner rule, P04's crossing trace, host + parasite as one unit, a free X01 through S02,
 *    S05 shelter occupancy, and positions strictly inside cells near barriers.
 * Worlds: clear water under barrierRegistry() (the shipped manifest plus 'barriers', 'climate',
 * 'devices' and S01–S12), barriers pushed straight into the stores (tests/helpers/world.ts pushEdges /
 * pushDevices, geometryVersion bumped). Shipped species only. "Held" positions and per-tick food
 * resets are labelled test devices; ledgers are not under test here (barrier-determinism checks them).
 */
import { describe, expect, it } from 'vitest';
import { DECISION_INTERVAL_TICKS } from '../../src/sim/constants';
import { deviceKindsOf, KIND_SHELTER } from '../../src/sim/edgePassage';
import { MOVE_TARGET } from '../../src/sim/entities';
import { cellIndex, maskCells, SUB_SEDIMENT, SUB_WATER } from '../../src/sim/grid';
import { canOccupy, traceFraction } from '../../src/sim/movement';
import { hostOf } from '../../src/sim/parasites';
import { rebuildIndex } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import { markField, updateDerived } from '../../src/sim/transport';
import { speciesIndex, type World } from '../../src/sim/world';
import {
  aliveOf,
  barrierDish,
  place,
  placeWith,
  pushDevices,
  pushEdges,
  verticalLine,
} from '../helpers/world';

const Y = 64;

function allAlive(w: World): number[] {
  return aliveOf(w);
}

/** Whether a coordinate sits within 1e-9 of a cell boundary (an integer). */
function onBoundary(v: number): boolean {
  return Math.abs(v - Math.round(v)) < 1e-9;
}

/** Set sugar to `f(x, y)` over the dish (test device; ledgers are not under test in this file). */
function setSugar(w: World, f: (x: number, y: number) => number): void {
  const s = w.fields.sugar!;
  for (const cell of maskCells()) s[cell] = f(cell % 128, Math.floor(cell / 128));
  markField(w, 'sugar');
}

/** Paint every dish cell's substrate from `f` (test geometry; geometryVersion bumped). */
function paint(w: World, f: (x: number, y: number) => number): void {
  for (const cell of maskCells()) w.grid.substrate[cell] = f(cell % 128, Math.floor(cell / 128));
  w.grid.geometryVersion++;
  updateDerived(w);
}

/** The organism `slot` holds now, by birthId (a slot is reused after a death). */
function same(w: World, slot: number): (s: number) => boolean {
  const birth = w.ents.cols.birthId[slot]!;
  return (s) => s === slot && w.ents.cols.birthId[s] === birth;
}

/** Run `ticks` steps; returns every (tick, slot, x) at which an organism matching `bad` was seen. */
function watch(w: World, ticks: number, bad: (slot: number) => boolean, each?: () => void): string[] {
  const out: string[] = [];
  const c = w.ents.cols;
  for (let t = 0; t < ticks; t++) {
    each?.();
    step(w);
    for (const s of allAlive(w))
      if (bad(s))
        out.push(`tick ${w.tick} slot ${s} ${w.species[c.species[s]!]!.id} at (${c.x[s]}, ${c.y[s]})`);
    if (out.length > 5) break;
  }
  return out;
}

describe('no tunnelling through S01 (SPEC §6.4; CT §5.3)', () => {
  it('a full S01 line holds B01 and P01 on their side for 3,000 ticks with food across; positions never sit on a cell boundary', () => {
    const w = barrierDish();
    pushEdges(w, verticalLine('S01', 63, 0, 127));
    setSugar(w, (x) => (x >= 64 ? 1 : 0));
    for (let k = 0; k < 4; k++) place(w, 'B01', 60.5 + (k % 3), 62.5 + k, { E: 60 });
    place(w, 'P01', 61.5, 60.5, { E: 50 });
    place(w, 'P01', 62.5, 68.5, { E: 50 });
    const c = w.ents.cols;
    let near = 0;
    const bad = watch(w, 3000, (s) => {
      if (Math.abs(c.x[s]! - 64) < 1) near++;
      return c.x[s]! >= 64 || onBoundary(c.x[s]!) || onBoundary(c.y[s]!);
    });
    expect(bad).toEqual([]);
    expect(near).toBeGreaterThan(100); // organism-ticks within one cell of the line: they did press against it
  }, 60_000);

  it('THE LEAK FIXTURE: a B01 held two cells (and one cell) from a short S01 segment (no blocked cell in its window, food only across) never targets across it over 200 decisions each', () => {
    for (const hx of [62.5, 63.5]) {
      const w = barrierDish();
      // Seven S01 edges between x 63 and 64, rows 61–67: every row of the held B01's 5 × 5 window.
      pushEdges(w, verticalLine('S01', 63, 61, 67));
      const s = place(w, 'B01', hx, Y + 0.5, { E: 60 });
      const c = w.ents.cols;
      // No cell of its window is blocked: open water everywhere it can sense.
      const sp = w.species[speciesIndex(w, 'B01')]!;
      for (let y = Y - 2; y <= Y + 2; y++)
        for (let x = Math.floor(hx) - 2; x <= Math.floor(hx) + 2; x++)
          expect(canOccupy(w, sp, cellIndex(x, y))).toBe(true);
      let decisions = 0;
      let targets = 0;
      const across: string[] = [];
      for (let t = 0; decisions < 200 && t < 5000; t++) {
        // Held: back at its start point with food only across the segment (labelled test device).
        c.x[s] = hx;
        c.y[s] = Y + 0.5;
        c.E[s] = 60;
        rebuildIndex(w);
        setSugar(w, (x, y) => (x >= 64 && x <= 66 && Math.abs(y - Y) <= 4 ? 1 : 0));
        step(w);
        if (!w.ents.isAlive(s)) throw new Error('B01 died');
        if (c.x[s] >= 64) across.push(`position ${c.x[s]} at tick ${w.tick}`);
        if (c.decisionTimer[s] === DECISION_INTERVAL_TICKS - 1) {
          decisions++;
          if (c.moveMode[s] === MOVE_TARGET) {
            targets++;
            if (Math.floor(c.targetX[s]!) >= 64)
              across.push(`target (${c.targetX[s]}, ${c.targetY[s]}) at tick ${w.tick}`);
          }
        }
      }
      expect(decisions).toBe(200);
      expect(across, `held at x ${hx}`).toEqual([]);
      expect(targets).toBeGreaterThan(0); // it did choose targets (on its own side)
    }
  }, 30_000);
});

describe('S02 passes Small only (CT §5.3)', () => {
  it('B01 (Small) crosses an S02 line toward food', () => {
    const w = barrierDish();
    pushEdges(w, verticalLine('S02', 63, 0, 127));
    const s = place(w, 'B01', 62.5, Y + 0.5, { E: 60 });
    let crossed = false;
    for (let t = 0; t < 600 && !crossed; t++) {
      setSugar(w, (x) => (x >= 64 ? 1 : 0));
      step(w);
      crossed = w.ents.cols.x[s]! >= 64;
    }
    expect(crossed).toBe(true);
  });

  it('P01 (Medium) never crosses an S02 line toward prey; P04 (Large, on sediment) never does either', () => {
    const w = barrierDish();
    pushEdges(w, verticalLine('S02', 63, 0, 127));
    const p = same(w, place(w, 'P01', 61.5, Y + 0.5, { E: 50 }));
    for (let k = 0; k < 3; k++) place(w, 'B01', 65.5, Y - 1.5 + k);
    const c = w.ents.cols;
    expect(watch(w, 1500, (s) => p(s) && (c.x[s]! >= 64 || onBoundary(c.x[s]!)))).toEqual([]);

    const sed = barrierDish();
    paint(sed, () => SUB_SEDIMENT);
    pushEdges(sed, verticalLine('S02', 63, 0, 127));
    const worm = same(sed, place(sed, 'P04', 61.5, Y + 0.5, { E: 50 }));
    for (let k = 0; k < 3; k++) place(sed, 'B04', 65.5, Y - 1.5 + k);
    const cs = sed.ents.cols;
    expect(watch(sed, 1500, (s) => worm(s) && (cs.x[s]! >= 64 || onBoundary(cs.x[s]!)))).toEqual([]);
  }, 60_000);
});

describe('S03 shutter gate (CT §4, §5.3)', () => {
  it('a closed shutter line blocks B01', () => {
    const w = barrierDish();
    pushEdges(w, verticalLine('S03', 63, 0, 127, { open: false }));
    place(w, 'B01', 62.5, Y + 0.5, { E: 60 });
    place(w, 'B01', 62.5, Y - 2.5, { E: 60 });
    const c = w.ents.cols;
    expect(
      watch(
        w,
        800,
        (s) => c.x[s]! >= 64,
        () => setSugar(w, (x) => (x >= 64 ? 1 : 0)),
      ),
    ).toEqual([]);
  });

  it('open shutters on 300 edges are exactly "no barrier": byte-identical entity columns and fields after 400 ticks', () => {
    const build = (shutters: boolean): World => {
      const w = barrierDish({ seed: 7919 });
      setSugar(w, (x, y) => (Math.abs(x - 64) <= 6 && Math.abs(y - 62) <= 6 ? 0.8 : 0));
      for (let k = 0; k < 8; k++) place(w, 'B01', 58.5 + k * 1.7, 58.5 + (k % 4) * 2.3, { E: 60 });
      place(w, 'P01', 60.5, 64.5, { E: 50 });
      place(w, 'P01', 67.5, 61.5, { E: 50 });
      if (shutters) {
        const edges = [];
        for (let x = 55; x < 75; x++) edges.push(...verticalLine('S03', x, 55, 69, { open: true }));
        expect(edges).toHaveLength(300);
        pushEdges(w, edges);
      }
      return w;
    };
    const a = build(true);
    const b = build(false);
    for (let t = 0; t < 400; t++) {
      step(a);
      step(b);
    }
    expect(a.ents.highWater).toBe(b.ents.highWater);
    const ca = a.ents.cols as unknown as Record<string, ArrayLike<number>>;
    const cb = b.ents.cols as unknown as Record<string, ArrayLike<number>>;
    for (const k of Object.keys(ca)) {
      const x = Array.from(ca[k]!).slice(0, a.ents.highWater);
      const y = Array.from(cb[k]!).slice(0, b.ents.highWater);
      expect(x, k).toEqual(y);
    }
    for (const id of Object.keys(a.fields)) {
      const fa = a.fields[id as keyof typeof a.fields]!;
      const fb = b.fields[id as keyof typeof b.fields]!;
      expect(Buffer.from(fa.buffer).equals(Buffer.from(fb.buffer)), id).toBe(true);
    }
    expect(aliveOf(a).length).toBeGreaterThan(5);
  }, 30_000);
});

describe('S04 one-way channel edge (D-0106)', () => {
  it('is closed to ordinary movement in both directions', () => {
    const w = barrierDish();
    // The channel's directed transfer (wave 10, SPEC §4.9) is held off so only ordinary movement is under test.
    pushEdges(w, verticalLine('S04', 63, 0, 127, { flow: 1, nextOrganismTick: 1_000_000_000 }));
    const left = same(w, place(w, 'B01', 62.5, Y + 0.5, { E: 60 }));
    const right = same(w, place(w, 'B01', 64.5, Y + 6.5, { E: 60 }));
    const c = w.ents.cols;
    // Food on the far side of each: rows ≤ Y + 3 east, rows ≥ Y + 4 west.
    const bad = watch(
      w,
      800,
      (s) => (left(s) && c.x[s]! >= 64) || (right(s) && c.x[s]! < 64),
      () => setSugar(w, (x, y) => (y <= Y + 3 ? (x >= 64 ? 1 : 0) : x <= 63 ? 1 : 0)),
    );
    expect(bad).toEqual([]);
    // Control: the same dish without the channel lets both cross.
    const open = barrierDish();
    const l2 = place(open, 'B01', 62.5, Y + 0.5, { E: 60 });
    const r2 = place(open, 'B01', 64.5, Y + 6.5, { E: 60 });
    let lx = false;
    let rx = false;
    for (let t = 0; t < 800 && !(lx && rx); t++) {
      setSugar(open, (x, y) => (y <= Y + 3 ? (x >= 64 ? 1 : 0) : x <= 63 ? 1 : 0));
      step(open);
      lx ||= open.ents.cols.x[l2]! >= 64;
      rx ||= open.ents.cols.x[r2]! < 64;
    }
    expect([lx, rx]).toEqual([true, true]);
  });
});

describe('the exact-corner rule and the class argument (edgePassage.ts cornerPermits)', () => {
  // (10, 10) lies outside the dish disk (every trace there ends at the rim), so the corner is at (60, 60).
  it('a diagonal trace through an exact corner is refused when either L-path crosses a refusing edge', () => {
    const w = barrierDish();
    const sp = w.species[speciesIndex(w, 'B01')]!;
    expect(traceFraction(w, sp, 60.5, 60.5, 61.5, 61.5, -1, 'small')).toBe(1);
    pushEdges(w, [{ kind: 'S01', cell: cellIndex(60, 60), dir: 'R' }]);
    const tR = traceFraction(w, sp, 60.5, 60.5, 61.5, 61.5, -1, 'small');
    expect(tR).toBeLessThan(1);
    expect(60.5 + tR).toBeLessThan(61);
    expect(60.5 + tR).toBeGreaterThan(60.99);
    // Without a class the trace is the habitat rule exactly (callers pass classOf only when edges exist).
    expect(traceFraction(w, sp, 60.5, 60.5, 61.5, 61.5)).toBe(1);
    // An S02 permits Small at the same corner.
    const w2 = barrierDish();
    pushEdges(w2, [{ kind: 'S02', cell: cellIndex(60, 60), dir: 'R' }]);
    expect(traceFraction(w2, sp, 60.5, 60.5, 61.5, 61.5, -1, 'small')).toBe(1);
    expect(traceFraction(w2, sp, 60.5, 60.5, 61.5, 61.5, -1, 'medium')).toBeLessThan(1);
    const w3 = barrierDish();
    pushEdges(w3, [{ kind: 'S01', cell: cellIndex(60, 60), dir: 'D' }]);
    expect(traceFraction(w3, sp, 60.5, 60.5, 61.5, 61.5, -1, 'small')).toBeLessThan(1);
    // The reverse direction through the same corner is refused too.
    expect(traceFraction(w3, sp, 61.5, 61.5, 60.5, 60.5, -1, 'small')).toBeLessThan(1);
  });
});

describe('P04 crossing water meets an S01 (crossing.ts; SPEC §6.4)', () => {
  /** Sediment for x ≤ 59 and x ≥ 62, open water at x 60–61 (as tests/sim/siltworm-crossing.test.ts strip(2)). */
  function strip(): World {
    const w = barrierDish();
    paint(w, (x) => (x <= 59 || x >= 62 ? SUB_SEDIMENT : SUB_WATER));
    return w;
  }

  it('the crossing trace stops at the membrane; a hunting worm never passes it, while without it the worm crosses', () => {
    const w = strip();
    const sp = w.species[speciesIndex(w, 'P04')]!;
    expect(traceFraction(w, sp, 59.5, Y + 0.5, 62.5, Y + 0.5, 0, 'large')).toBe(1);
    pushEdges(w, verticalLine('S01', 60, 0, 127));
    const t = traceFraction(w, sp, 59.5, Y + 0.5, 62.5, Y + 0.5, 0, 'large');
    expect(59.5 + 3 * t).toBeLessThan(61);
    expect(59.5 + 3 * t).toBeGreaterThan(60.99);

    const run = (membrane: boolean): number => {
      const d = strip();
      if (membrane) pushEdges(d, verticalLine('S01', 60, 0, 127));
      const worm = place(d, 'P04', 58.5, Y + 0.5, { E: 50 });
      const prey = place(d, 'B04', 62.5, Y + 0.5);
      const c = d.ents.cols;
      let maxX = 0;
      for (let k = 0; k < 300 && d.ents.isAlive(prey); k++) {
        c.x[prey] = 62.5;
        c.y[prey] = Y + 0.5;
        c.E[worm] = 50;
        rebuildIndex(d);
        step(d);
        maxX = Math.max(maxX, c.x[worm]!);
        expect(onBoundary(c.x[worm]!)).toBe(false);
      }
      return maxX;
    };
    expect(run(true)).toBeLessThan(61);
    expect(run(false)).toBeGreaterThanOrEqual(62);
  });
});

describe('host and parasite move as one unit in the host’s class (SPEC §4.9)', () => {
  /** Light 0.9 at x ≥ 63, else 0.5 (test light; not an inventory). */
  function lit(w: World): void {
    for (const cell of maskCells()) w.grid.lightBase[cell] = cell % 128 >= 63 ? 0.9 : 0.5;
    w.grid.geometryVersion++;
    updateDerived(w);
  }

  /** An E07 A01 at (61.5, Y + 0.5) with an X01 attached; returns [host, parasite]. */
  function pair(w: World): [number, number] {
    const host = placeWith(w, 'A01', 61.5, Y + 0.5, ['E07'], { E: 60 });
    const para = place(w, 'X01', 61.5, Y + 0.5, { E: 60 });
    step(w);
    expect(hostOf(w, para)).toBe(host);
    return [host, para];
  }

  it('an A01 carrying an X01 never ends across an S02 (Medium does not pass); the X01 sits on its host every tick; without the S02 the pair does cross', () => {
    const runPair = (gate: boolean): { maxX: number; mismatches: number } => {
      const w = barrierDish();
      lit(w);
      if (gate) pushEdges(w, verticalLine('S02', 62, 0, 127));
      const [host, para] = pair(w);
      const c = w.ents.cols;
      let maxX = 0;
      let mismatches = 0;
      for (let t = 0; t < 200; t++) {
        step(w);
        if (!w.ents.isAlive(host) || hostOf(w, para) !== host) break;
        maxX = Math.max(maxX, c.x[host]!);
        if (c.x[para] !== c.x[host] || c.y[para] !== c.y[host]) mismatches++;
      }
      return { maxX, mismatches };
    };
    const gated = runPair(true);
    expect(gated.mismatches).toBe(0);
    expect(gated.maxX).toBeLessThan(63);
    const open = runPair(false);
    expect(open.mismatches).toBe(0);
    expect(open.maxX).toBeGreaterThanOrEqual(63);
  });

  it('a free X01 (Small) crosses the same S02 to its host and attaches', () => {
    const w = barrierDish();
    pushEdges(w, verticalLine('S02', 62, 0, 127));
    const host = place(w, 'A01', 64.5, Y + 0.5, { E: 60 });
    const para = place(w, 'X01', 61.5, Y + 0.5, { E: 60 });
    for (let t = 0; t < 200 && hostOf(w, para) < 0; t++) step(w);
    expect(hostOf(w, para)).toBe(host);
    expect(w.ents.cols.x[host]).toBeGreaterThanOrEqual(63);
    step(w); // attached in stage 5; stage 4 of the next tick puts it on its host (followHosts)
    expect(w.ents.cols.x[para]).toBe(w.ents.cols.x[host]);
    expect(w.ents.cols.y[para]).toBe(w.ents.cols.y[host]);
  });
});

describe('S05 porous shelter: Small pass, Medium/Large blocked (CT §5.3)', () => {
  /** Shelters on the 5 × 5 block x 64–68, y 62–66. */
  function sheltered(): World {
    const w = barrierDish();
    const devices = [];
    for (let y = 62; y <= 66; y++)
      for (let x = 64; x <= 68; x++) devices.push({ kind: 'S05' as const, cell: cellIndex(x, y) });
    pushDevices(w, devices);
    return w;
  }
  const inShelter = (w: World, x: number, y: number): boolean =>
    deviceKindsOf(w)![cellIndex(Math.floor(x), Math.floor(y))] === KIND_SHELTER;

  it('P01 never enters a shelter cell, by decision or by trace, even hunting prey inside', () => {
    const w = sheltered();
    const p = same(w, place(w, 'P01', 61.5, Y + 0.5, { E: 50 }));
    for (let k = 0; k < 3; k++) place(w, 'B01', 66.5, 63.5 + k);
    const c = w.ents.cols;
    let near = 0;
    const bad = watch(w, 1200, (s) => {
      if (!p(s)) return false;
      if (Math.abs(c.x[s]! - 64) < 1.5 && Math.abs(c.y[s]! - Y) < 3) near++;
      return (
        inShelter(w, c.x[s]!, c.y[s]!) ||
        (c.moveMode[s] === MOVE_TARGET && inShelter(w, c.targetX[s]!, c.targetY[s]!))
      );
    });
    expect(bad).toEqual([]);
    expect(near).toBeGreaterThan(0);
  }, 30_000);

  it('B01 enters a shelter toward food', () => {
    const w = sheltered();
    const s = place(w, 'B01', 62.5, Y + 0.5, { E: 60 });
    let entered = false;
    for (let t = 0; t < 400 && !entered; t++) {
      setSugar(w, (x, y) => (x >= 64 && x <= 68 && y >= 62 && y <= 66 ? 1 : 0));
      step(w);
      entered = inShelter(w, w.ents.cols.x[s]!, w.ents.cols.y[s]!);
    }
    expect(entered).toBe(true);
  });
});
