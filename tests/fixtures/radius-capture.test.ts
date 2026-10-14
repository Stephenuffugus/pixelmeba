/**
 * P5.5 (Phase 5 wave 12, e3-predation): P06 Bellstalk's radius capture (SPEC §7.3 "Radius capture (P06):
 * captures compatible prey within 1 cell without pursuit"; CT §1.3, §3.2, §6.2 "radius capture is a rule,
 * not sensing", §12.5 "P06 radius 1"; D-0106 "a Euclidean centre distance ≤ 1.0, never across a prohibiting
 * edge"; D-0115; D-0122).
 *
 * P06 (RADIUS_CAPTURE) is not enabled (D-0104): these dishes record it through a test registry with
 * allowUnimplemented, because RADIUS_CAPTURE, HANDLING and DETRITUS_FALLBACK join IMPLEMENTED_NATIVE_ABILITIES
 * only at the wave 12 integration (the lead appends them).
 */
import { describe, expect, it } from 'vitest';
import { DT } from '../../src/sim/constants';
import { stageContacts } from '../../src/sim/contacts';
import { cellIndex, ST_STONE } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { det, STREAMS } from '../../src/sim/rng';
import { rebuildIndex } from '../../src/sim/spatial';
import { run } from '../../src/sim/tick';
import { updateDerived } from '../../src/sim/transport';
import type { SystemFlag } from '../../src/sim/fields';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, place, pushEdges, registry } from '../helpers/world';

const shipped = registry().manifest;
/** Shipped content plus the Phase 5 predators and P09's algal prey; 'silicate' for A02 and P05 (SHELL). */
const REG_P = registryWith(
  {
    enabledSpecies: [...shipped.enabledSpecies, 'A02', 'A03', 'A04', 'P05', 'P06', 'P07', 'P09', 'P10'].sort(),
    enabledSystems: [...shipped.enabledSystems, 'silicate'].sort() as SystemFlag[],
  },
  { allowUnimplemented: true }, // RADIUS_CAPTURE, HANDLING, DETRITUS_FALLBACK: appended by the lead at integration
);

const PX = 64.5;
const PY = 64.5;

/** A dish with a stone at (63, 64), so (64, 64) is a stone-edge water cell a P06 may attach to, and a hungry P06 on it. */
function bell(seed?: number): { w: World; p06: number } {
  const w = clearWater(seed === undefined ? {} : { seed }, REG_P);
  w.grid.structure[cellIndex(63, 64)] = ST_STONE;
  w.grid.geometryVersion++;
  updateDerived(w);
  const p06 = place(w, 'P06', PX, PY, { E: 50 });
  return { w, p06 };
}

function caught(w: World, prey: number, birth: number): boolean {
  return !w.ents.refValid(prey, birth);
}

/** One stage 5 with a prey of `species` at (PX + dx, PY + dy); whether it was captured. */
function tryAt(dx: number, dy: number, species = 'B01', px = PX, py = PY): boolean {
  const { w, p06 } = bell();
  w.ents.cols.x[p06] = px;
  w.ents.cols.y[p06] = py;
  const prey = place(w, species, px + dx, py + dy);
  const birth = w.ents.cols.birthId[prey]!;
  rebuildIndex(w);
  stageContacts(w);
  return caught(w, prey, birth);
}

describe('P06 radius capture (P5.5)', () => {
  it('captures a B01 at a centre distance of 0.9 that tick; exactly 1.0 is captured; 1.0001 is not', () => {
    expect(tryAt(0.9, 0)).toBe(true);
    expect(tryAt(1.0, 0)).toBe(true);
    expect(tryAt(1.0001, 0)).toBe(false);
    expect(tryAt(0, -1.0001)).toBe(false);
  });

  it('captures a diagonal neighbour at 0.99 and covers every prey within 1.0: both axes at exactly 1.0 and a cell corner', () => {
    expect(tryAt(0.7, 0.7)).toBe(true); // 0.9899 in the diagonal cell (65, 65)
    expect(tryAt(-0.7, 0.7)).toBe(true); // (63, 65)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      // The P06 at a cell corner (65.0, 65.0): a prey at exactly 1.0 along each axis lies in a ±1 cell.
      expect(tryAt(dx, dy, 'B01', 65, 65)).toBe(true);
      // The P06 just inside the far corner of its cell (64.999, 64.999): the prey sits in the next cell over.
      expect(tryAt(dx, dy, 'B01', 64.999, 64.999)).toBe(true);
    }
    // Ring of radius 0.999 at 24 angles around the corner position: always inside the ±1 scan.
    for (let k = 0; k < 24; k++) {
      const a = (k * Math.PI) / 12;
      expect(tryAt(0.999 * Math.cos(a), 0.999 * Math.sin(a), 'B01', 65, 65)).toBe(true);
    }
  });

  it('never takes B02 or B13 (not in its prey list), even at 0.3', () => {
    expect(tryAt(0.3, 0, 'B02')).toBe(false);
    const reg13 = registryWith(
      {
        enabledSpecies: [...REG_P.manifest.enabledSpecies, 'B13'].sort(),
        enabledSystems: [...REG_P.manifest.enabledSystems, 'rivalry'].sort() as SystemFlag[],
      },
      { allowUnimplemented: true },
    );
    const w = clearWater({}, reg13);
    w.grid.structure[cellIndex(63, 64)] = ST_STONE;
    w.grid.geometryVersion++;
    updateDerived(w);
    place(w, 'P06', PX, PY, { E: 50 });
    const b13 = place(w, 'B13', PX + 0.3, PY);
    const birth = w.ents.cols.birthId[b13]!;
    stageContacts(w);
    expect(caught(w, b13, birth)).toBe(false);
  });

  it('never captures across an S01 edge; the same pair without the S01 is captured; the corner rule holds for a diagonal past an edge end', () => {
    const across = (edges: boolean, dx: number, dy: number, edgeList: Parameters<typeof pushEdges>[1]) => {
      const { w } = bell();
      if (edges) pushEdges(w, edgeList);
      const prey = place(w, 'B01', PX + dx, PY + dy);
      const birth = w.ents.cols.birthId[prey]!;
      stageContacts(w);
      return caught(w, prey, birth);
    };
    const right = [{ kind: 'S01' as const, cell: cellIndex(64, 64), dir: 'R' as const }];
    expect(across(true, 0.6, 0, right)).toBe(false);
    expect(across(false, 0.6, 0, right)).toBe(true);
    // An S02 (passes Small only) still refuses the Fixed P06 (CT §5.3).
    expect(across(true, 0.6, 0, [{ kind: 'S02', cell: cellIndex(64, 64), dir: 'R' }])).toBe(false);
    // Diagonal (65, 65): one edge on either L path refuses the pair (corner rule, edgePassage.ts cornerPermits).
    expect(across(true, 0.6, 0.6, right)).toBe(false); // the (64,64)|(65,64) edge: the horizontal-first path
    expect(across(true, 0.6, 0.6, [{ kind: 'S01', cell: cellIndex(64, 65), dir: 'R' }])).toBe(false); // (64,65)|(65,65): the vertical-first path
    expect(across(true, 0.6, 0.6, [{ kind: 'S01', cell: cellIndex(64, 64), dir: 'D' }])).toBe(false); // (64,64)|(64,65)
    expect(across(true, 0.6, 0.6, [{ kind: 'S01', cell: cellIndex(65, 64), dir: 'D' }])).toBe(false); // (65,64)|(65,65)
    expect(across(true, 0.6, 0.6, [{ kind: 'S01', cell: cellIndex(66, 64), dir: 'D' }])).toBe(true); // an edge elsewhere: captured
  });

  it('waits its 3 s cooldown: the next capture comes no sooner than 30 ticks later', () => {
    const { w, p06 } = bell();
    place(w, 'B01', PX + 0.6, PY);
    stageContacts(w);
    expect(w.ents.cols.attackCooldown[p06]).toBe(3);
    w.ents.cols.mealC[p06] = 0; // keep it hungry: only the cooldown is under test (meal is not material here)
    w.ents.cols.mealN[p06] = 0;
    const second = place(w, 'B01', PX + 0.6, PY + 0.2);
    let calls = 0;
    while (w.ents.isAlive(second) && calls < 60) {
      stageContacts(w);
      calls++;
      w.ents.cols.attackCooldown[p06] = Math.max(0, w.ents.cols.attackCooldown[p06]! - DT); // stage 7's decrement
    }
    expect(calls).toBe(31); // 30 decrements of 0.1 s, then the capture
  });

  it('never moves over 600 ticks among drifting B01', () => {
    const { w, p06 } = bell();
    for (let k = 0; k < 20; k++) place(w, 'B01', 62 + (k % 5) * 1.1, 61 + Math.floor(k / 5) * 1.7);
    const x = w.ents.cols.x[p06]!;
    const y = w.ents.cols.y[p06]!;
    const birth = w.ents.cols.birthId[p06]!;
    for (let t = 0; t < 600 && w.ents.refValid(p06, birth); t++) {
      run(w, 1);
      expect(w.ents.cols.x[p06]).toBe(x);
      expect(w.ents.cols.y[p06]).toBe(y);
    }
  });

  it('fills a meal up to 6 (2 × B0) with the overflow to detritus, and does not hunt with a meal ≥ 1.5', () => {
    const { w, p06 } = bell();
    const c = w.ents.cols;
    c.mealC[p06] = 1.4;
    c.mealN[p06] = 0.14;
    w.ledger.inputs.c += 1.4;
    w.ledger.inputs.n += 0.14;
    place(w, 'B01', PX + 0.8, PY, { B: 5, N: 0.5 });
    stageContacts(w);
    expect(c.mealC[p06]).toBeCloseTo(6, 12);
    expect(w.fields.detritus![cellIndex(65, 64)]).toBeCloseTo(0.4, 12);
    expect(checkLedger(w).ok).toBe(true);

    const fed = bell();
    fed.w.ents.cols.mealC[fed.p06] = 1.5;
    const prey = place(fed.w, 'B01', PX + 0.5, PY);
    const birth = fed.w.ents.cols.birthId[prey]!;
    stageContacts(fed.w);
    expect(caught(fed.w, prey, birth)).toBe(false);
  });

  it('a P06 and a P01 claiming one B01 in one tick: one winner by the det priority, whatever the slot order, and each can win', () => {
    const winners = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      for (const reversed of [false, true]) {
        const { w, p06 } = bell(seed);
        const preyAt = [PX + 0.8, PY] as const;
        let p01: number;
        let prey: number;
        if (reversed) {
          // Free the P06's slot and place the others first: the P06 takes a higher slot than the P01.
          const pBirth = w.ents.cols.birthId[p06]!;
          w.ents.free(p06);
          p01 = place(w, 'P01', PX + 1.2, PY, { E: 50 });
          prey = place(w, 'B01', preyAt[0], preyAt[1]);
          const again = place(w, 'P06', PX, PY, { E: 50 });
          expect(again).toBeGreaterThan(p01);
          expect(w.ents.cols.birthId[again]).not.toBe(pBirth);
        } else {
          p01 = place(w, 'P01', PX + 1.2, PY, { E: 50 });
          prey = place(w, 'B01', preyAt[0], preyAt[1]);
        }
        const c = w.ents.cols;
        const p6 = reversed ? w.ents.highWater - 1 : p06;
        const pri = (s: number) => det(w.seed, STREAMS.contact, w.tick, 1, c.birthId[s]!);
        const expected = pri(p6) > pri(p01) || (pri(p6) === pri(p01) && c.birthId[p6]! < c.birthId[p01]!) ? 'P06' : 'P01';
        stageContacts(w);
        expect(w.ents.isAlive(prey)).toBe(false);
        const got = c.mealC[p6]! > 0 ? 'P06' : 'P01';
        expect(c.mealC[p6]! > 0 !== c.mealC[p01]! > 0).toBe(true);
        expect(got).toBe(expected);
        expect(w.events.totals.capture).toBe(1);
        winners.add(got);
      }
    }
    expect([...winners].sort()).toEqual(['P01', 'P06']);
  });

  it('radius capture belongs to RADIUS_CAPTURE only: a P07 (and a P01) at 0.9 does not capture', () => {
    for (const pred of ['P07', 'P01']) {
      const w = clearWater({}, REG_P);
      place(w, pred, PX, PY, { E: 50 });
      const prey = place(w, 'B01', PX + 0.9, PY);
      const birth = w.ents.cols.birthId[prey]!;
      stageContacts(w);
      expect(caught(w, prey, birth)).toBe(false);
    }
  });
});
