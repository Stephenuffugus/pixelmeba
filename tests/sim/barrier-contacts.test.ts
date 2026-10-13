/**
 * Phase 5 wave 9 barrier-movement: contacts across edge barriers (D-0106 "predation claims, parasite
 * attachment, links, and daughter or fungal placement never cross an edge that blocks either party's
 * class"; SPEC §4.9, §6.4 "invalid targets cancel immediately"; CT §5.3; src/sim/edgePassage.ts
 * pairPermitted / segmentPermitted, contacts.ts, parasites.ts, adhesion.ts, movement.ts).
 *
 * Contact rules are exercised by calling stage 5 (stageContacts) directly with the organisms held at
 * fixed points (a labelled test device: their centres are within the 0.5-cell contact distance, so only
 * the edge between their cells decides). Hunting targets are exercised through whole ticks.
 * Worlds: clear water under barrierRegistry(); barriers pushed with pushEdges. Shipped species only.
 */
import { describe, expect, it } from 'vitest';
import type { EdgeBarrier } from '../../src/sim/barriers';
import { stageContacts } from '../../src/sim/contacts';
import { cellIndex } from '../../src/sim/grid';
import { segmentPermitted } from '../../src/sim/edgePassage';
import { adhesionDegree } from '../../src/sim/links';
import { hostOf } from '../../src/sim/parasites';
import { rebuildIndex } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { barrierDish, place, placeWith, pushEdges, verticalLine } from '../helpers/world';

type Edge = Omit<EdgeBarrier, 'id'>;
const Y = 64;
const R = (x: number, y: number, kind: Edge['kind'] = 'S01', open?: boolean): Edge => ({
  kind,
  cell: cellIndex(x, y),
  dir: 'R',
  ...(open === undefined ? {} : { open }),
});

/** Call stage 5 `n` times with the listed slots held at their points; stops early when `done`. */
function contacts(
  w: World,
  held: readonly [number, number, number][],
  n: number,
  done: () => boolean = () => false,
): void {
  const c = w.ents.cols;
  for (let k = 0; k < n && !done(); k++) {
    for (const [s, x, y] of held) {
      if (!w.ents.isAlive(s)) continue;
      c.x[s] = x;
      c.y[s] = y;
    }
    rebuildIndex(w);
    stageContacts(w);
    w.tick++;
  }
}

/** A hungry P01 at (px, py) and a B01 at (bx, by) across `edges`; whether the B01 was captured within 200 calls. */
function captured(edges: readonly Edge[], px: number, py: number, bx: number, by: number): boolean {
  const w = barrierDish();
  if (edges.length > 0) pushEdges(w, edges);
  const pred = place(w, 'P01', px, py, { E: 50 });
  const prey = place(w, 'B01', bx, by);
  const birth = w.ents.cols.birthId[prey]!;
  const gone = () => !w.ents.isAlive(prey) || w.ents.cols.birthId[prey] !== birth;
  contacts(
    w,
    [
      [pred, px, py],
      [prey, bx, by],
    ],
    200,
    gone,
  );
  return gone();
}

describe('predation claims never cross a refusing edge (D-0106)', () => {
  it('P01 and B01 0.4 cells apart across S01: no capture in 200 ticks; without the edge, captured', () => {
    expect(captured([R(63, Y)], 63.8, Y + 0.5, 64.2, Y + 0.5)).toBe(false);
    expect(captured([], 63.8, Y + 0.5, 64.2, Y + 0.5)).toBe(true);
  });

  it('across S02 refused (P01 is Medium); across an open shutter allowed; across a closed shutter refused', () => {
    expect(captured([R(63, Y, 'S02')], 63.8, Y + 0.5, 64.2, Y + 0.5)).toBe(false);
    expect(captured([R(63, Y, 'S03', true)], 63.8, Y + 0.5, 64.2, Y + 0.5)).toBe(true);
    expect(captured([R(63, Y, 'S03', false)], 63.8, Y + 0.5, 64.2, Y + 0.5)).toBe(false);
  });

  it('across a diagonal corner: refused when an L-path is blocked (one edge of each, or either one); allowed when both are clear', () => {
    // P01 in cell (63, 64), B01 in (64, 65): centres 0.42 apart. L-path 1 via (64, 64), L-path 2 via (63, 65).
    const at = [63.8, Y + 0.8, 64.1, Y + 1.1] as const;
    expect(captured([R(63, Y), R(63, Y + 1)], ...at)).toBe(false); // one edge of each path
    expect(captured([R(63, Y)], ...at)).toBe(false); // path 1 only (the over-blocking side of the corner rule)
    expect(captured([{ kind: 'S01', cell: cellIndex(63, Y), dir: 'D' }], ...at)).toBe(false); // path 2 only
    expect(captured([R(60, 50)], ...at)).toBe(true); // an edge elsewhere: both paths clear
    expect(captured([], ...at)).toBe(true);
  });

  it('claim ordering among permitted prey is unchanged: with the nearest prey behind S01 the capture is the one the dish without it makes', () => {
    const run = (membrane: boolean, withX: boolean): number => {
      const w = barrierDish();
      if (membrane) pushEdges(w, [R(63, Y)]);
      const pred = place(w, 'P01', 63.7, Y + 0.5, { E: 50 });
      const held: [number, number, number][] = [[pred, 63.7, Y + 0.5]];
      // Z then Y (Z has the lower birthId), both 0.4 cells away in the predator's cell; X 0.3 away behind the edge.
      const z = place(w, 'B01', 63.7, Y + 0.9);
      const y = place(w, 'B01', 63.3, Y + 0.5);
      held.push([z, 63.7, Y + 0.9], [y, 63.3, Y + 0.5]);
      const births = [w.ents.cols.birthId[z]!, w.ents.cols.birthId[y]!];
      if (withX) {
        const x = place(w, 'B01', 64.0, Y + 0.5);
        held.push([x, 64.0, Y + 0.5]);
        births.push(w.ents.cols.birthId[x]!);
      }
      contacts(w, held, 1);
      const eaten = births.filter(
        (b, k) => !w.ents.isAlive(held[k + 1]![0]) || w.ents.cols.birthId[held[k + 1]![0]] !== b,
      );
      expect(eaten).toHaveLength(1);
      return births.indexOf(eaten[0]!);
    };
    expect(run(false, true)).toBe(2); // without the membrane the nearest (X) is taken
    const permitted = run(true, true);
    expect(permitted).not.toBe(2);
    expect(permitted).toBe(run(true, false));
    expect(permitted).toBe(run(false, false));
  });
});

describe('parasite attachment never crosses a refusing edge (D-0106)', () => {
  const attaches = (edges: readonly Edge[]): boolean => {
    const w = barrierDish();
    if (edges.length > 0) pushEdges(w, edges);
    const host = place(w, 'A01', 64.2, Y + 0.5, { E: 60 });
    const para = place(w, 'X01', 63.8, Y + 0.5, { E: 60 });
    contacts(
      w,
      [
        [host, 64.2, Y + 0.5],
        [para, 63.8, Y + 0.5],
      ],
      200,
      () => hostOf(w, para) >= 0,
    );
    return hostOf(w, para) === host;
  };
  it('X01 next to A01 across S01 and across S02 (A01 is Medium) never attaches; without the edge it does', () => {
    expect(attaches([R(63, Y)])).toBe(false);
    expect(attaches([R(63, Y, 'S02')])).toBe(false);
    expect(attaches([])).toBe(true);
  });
});

describe('a free parasite’s host target behind a refusing edge (parasites.ts nearestHost)', () => {
  it('a free X01 whose nearest A01 is behind S01 heads for a reachable A01 and attaches to it; without the membrane it takes the nearest', () => {
    const go = (membrane: boolean): { firstDx: number; host: number; near: number; far: number } => {
      const w = barrierDish();
      if (membrane) pushEdges(w, verticalLine('S01', 62, 0, 127));
      const near = place(w, 'A01', 63.5, Y + 0.5, { E: 60 }); // 1 cell east, across the membrane
      const far = place(w, 'A01', 60.5, Y + 0.5, { E: 60 }); // 2 cells west, on its side
      const para = place(w, 'X01', 62.5, Y + 0.5, { E: 60 });
      step(w);
      const firstDx = w.ents.cols.x[para]! - 62.5;
      for (let t = 0; t < 150 && hostOf(w, para) < 0; t++) step(w);
      return { firstDx, host: hostOf(w, para), near, far };
    };
    const m = go(true);
    expect(m.firstDx).toBeLessThan(0); // west, toward the reachable host: never pressing on the membrane
    expect(m.host).toBe(m.far);
    const open = go(false);
    expect(open.firstDx).toBeGreaterThan(0); // control: east, toward the nearest host
    expect(open.host).toBe(open.near);
  });
});

describe('segmentPermitted: the corner rule on a straight segment (edgePassage.ts)', () => {
  it('a segment through an exact cell corner is refused when either L-path crosses a refusing edge, though the Y-first walk alone would pass', () => {
    const seg = (edges: readonly Edge[], cls: 'small' | 'medium' = 'medium'): boolean => {
      const w = barrierDish();
      if (edges.length > 0) pushEdges(w, edges);
      return segmentPermitted(w, 60.5, 60.5, 61.5, 61.5, cls);
    };
    expect(seg([R(60, 60)])).toBe(false); // the X-first L-path's first edge: off the Y-first walk
    expect(seg([R(60, 61)])).toBe(false); // on the Y-first walk itself
    expect(seg([R(60, 60, 'S02')])).toBe(false); // S02 refuses Medium
    expect(seg([R(60, 60, 'S02')], 'small')).toBe(true); // and passes Small
    expect(seg([R(62, 60)])).toBe(true); // an edge off both L-paths (control)
    expect(seg([])).toBe(true);
  });
});

describe('E12 links never cross a refusing edge (D-0106)', () => {
  const links = (edges: readonly Edge[]): number => {
    const w = barrierDish();
    if (edges.length > 0) pushEdges(w, edges);
    const a = placeWith(w, 'B01', 63.8, Y + 0.5, ['E12'], { E: 60 });
    const b = placeWith(w, 'B01', 64.2, Y + 0.5, ['E12'], { E: 60 });
    contacts(
      w,
      [
        [a, 63.8, Y + 0.5],
        [b, 64.2, Y + 0.5],
      ],
      80,
    );
    return adhesionDegree(w, a) + adhesionDegree(w, b);
  };
  it('two Small E12 carriers across S02 link; across S01 they never do; with no edge they link', () => {
    expect(links([R(63, Y, 'S02')])).toBe(2);
    expect(links([R(63, Y)])).toBe(0);
    expect(links([])).toBe(2);
  });
});

describe('hunting targets behind a refusing edge (SPEC §6.4 "invalid targets cancel immediately")', () => {
  it('a predator whose prey is behind S01 drops the target on the next tick and acquires a reachable prey instead', () => {
    const run = (
      membrane: boolean,
    ): { after1: number; reachable: boolean; behind: number; reach: number } => {
      const w = barrierDish();
      if (membrane) pushEdges(w, verticalLine('S01', 62, 0, 127));
      const p = place(w, 'P01', 62.5, Y + 0.5, { E: 50 });
      const behind = place(w, 'B01', 63.5, Y + 0.5); // 1 cell away, across the membrane
      const reach = place(w, 'B01', 60.5, Y + 0.5); // 2 cells away, on its side
      const c = w.ents.cols;
      c.preySlot[p] = behind;
      c.preyBirthId[p] = c.birthId[behind]!;
      c.decisionTimer[p] = 3; // not a decision tick: no re-acquisition on the next tick
      step(w);
      const after1 = c.preySlot[p];
      let reachable = false;
      const reachBirth = c.birthId[reach]!;
      for (let t = 0; t < 10 && !reachable; t++) {
        step(w);
        reachable = c.preySlot[p] === reach || !w.ents.isAlive(reach) || c.birthId[reach] !== reachBirth;
      }
      return { after1, reachable, behind, reach };
    };
    const m = run(true);
    expect(m.after1).toBe(-1);
    expect(m.reachable).toBe(true);
    const open = run(false);
    expect(open.after1).toBe(open.behind); // control: without the membrane it keeps its target
  });
});
