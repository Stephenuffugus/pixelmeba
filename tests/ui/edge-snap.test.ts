/**
 * P5.1/P5.2 edge snapping (src/ui/edgeSnap.ts; D-0106, D-0119): nearestEdge picks the edge whose MIDPOINT
 * is nearest the point, ties going to the LOWER edgeKey (cell × 2, + 1 for 'D'); null outside the grid.
 * snapStroke: a tap is its first point's nearest edge; a drag is sampled at ≤ 0.25 cell, snapped to grid
 * vertices and joined edge by edge (D-0120: no comb of perpendicular edges along a slightly-off line), de-duplicated
 * in stroke order and capped at 512, and a diagonal drag gives a connected staircase. pickRemoveTarget /
 * strokeRemoveIds follow D-0119's Remove rule.
 */
import { describe, expect, it } from 'vitest';
import { EDGE_BARRIER_CAP, GRID_H, GRID_W } from '../../src/sim/constants';
import { edgeKey } from '../../src/sim/barriers';
import { edgeBetween, edgeMidpoint, nearestEdge, nearestVertex, pickRemoveTarget, snapStroke, strokeRemoveIds, type EdgeRef } from '../../src/ui/edgeSnap';

const cell = (x: number, y: number) => y * GRID_W + x;

/** The two end points of an edge (an R edge is the vertical segment x+1, y..y+1). */
function ends(e: EdgeRef): [string, string] {
  const x = e[0] % GRID_W;
  const y = Math.floor(e[0] / GRID_W);
  return e[1] === 'R' ? [`${x + 1},${y}`, `${x + 1},${y + 1}`] : [`${x},${y + 1}`, `${x + 1},${y + 1}`];
}

describe('nearestEdge', () => {
  it('returns the edge at its own midpoint', () => {
    for (const [c, dir] of [
      [cell(10, 20), 'R'],
      [cell(10, 20), 'D'],
      [cell(0, 0), 'R'],
      [cell(126, 126), 'D'],
    ] as const) {
      const [mx, my] = edgeMidpoint(c, dir);
      expect(nearestEdge(mx, my)).toEqual([c, dir]);
    }
  });

  it('near a midpoint, slightly off it, keeps that edge', () => {
    expect(nearestEdge(11.1, 20.4)).toEqual([cell(10, 20), 'R']);
    expect(nearestEdge(10.6, 20.9)).toEqual([cell(10, 20), 'D']);
  });

  it('ties go to the lower edgeKey: a cell centre, and a grid corner', () => {
    // Centre of cell (10, 20): its N (D of (10,19)), W (R of (9,20)), E (R of (10,20)) and S (D of (10,20)) edges are all 0.5 away.
    const centre = nearestEdge(10.5, 20.5)!;
    const tied: EdgeRef[] = [
      [cell(10, 19), 'D'],
      [cell(9, 20), 'R'],
      [cell(10, 20), 'R'],
      [cell(10, 20), 'D'],
    ];
    const lowest = tied.reduce((a, b) => (edgeKey(a[0], a[1]) <= edgeKey(b[0], b[1]) ? a : b));
    expect(centre).toEqual(lowest);
    expect(centre).toEqual([cell(10, 19), 'D']);
    // Corner (11, 21): R of (10,20), R of (10,21), D of (10,20), D of (11,20) are all 0.5 away.
    expect(nearestEdge(11, 21)).toEqual([cell(10, 20), 'R']);
  });

  it('is null outside the grid and for non-finite points', () => {
    expect(nearestEdge(-0.01, 5)).toBeNull();
    expect(nearestEdge(5, -0.01)).toBeNull();
    expect(nearestEdge(GRID_W, 5)).toBeNull();
    expect(nearestEdge(5, GRID_H + 2)).toBeNull();
    expect(nearestEdge(Number.NaN, 5)).toBeNull();
  });

  it('never returns an edge without a cell on both sides (the grid border)', () => {
    for (const [x, y] of [
      [0.01, 0.01],
      [127.99, 50.5],
      [50.5, 127.99],
      [127.99, 127.99],
    ] as const) {
      const e = nearestEdge(x, y)!;
      const cx = e[0] % GRID_W;
      const cy = Math.floor(e[0] / GRID_W);
      if (e[1] === 'R') expect(cx + 1).toBeLessThan(GRID_W);
      else expect(cy + 1).toBeLessThan(GRID_H);
    }
  });
});

describe('snapStroke', () => {
  it('a horizontal drag along a grid line gives each D edge once, in stroke order', () => {
    const edges = snapStroke([
      [10.2, 30],
      [15.8, 30],
    ]);
    expect(edges).toEqual([10, 11, 12, 13, 14, 15].map((x) => [cell(x, 29), 'D']));
    // Reversed, the same edges in the reverse order.
    expect(
      snapStroke([
        [15.8, 30],
        [10.2, 30],
      ]),
    ).toEqual([15, 14, 13, 12, 11, 10].map((x) => [cell(x, 29), 'D']));
  });

  it('de-duplicates a stroke that goes back over itself', () => {
    const edges = snapStroke([
      [40, 40.2],
      [40, 43.8],
      [40, 40.2],
    ]);
    const keys = edges.map((e) => edgeKey(e[0], e[1]));
    expect(new Set(keys).size).toBe(keys.length);
    expect(edges).toEqual([40, 41, 42, 43].map((y) => [cell(39, y), 'R']));
  });

  it('a tap is one edge', () => {
    expect(snapStroke([[20.05, 20.5]])).toEqual([[cell(19, 20), 'R']]);
  });

  it('caps at 512 edges (EDGE_BARRIER_CAP)', () => {
    const pts: Array<readonly [number, number]> = [];
    for (let y = 1; y < 127; y += 2) {
      pts.push([1, y]);
      pts.push([126, y]);
    }
    const edges = snapStroke(pts);
    expect(EDGE_BARRIER_CAP).toBe(512);
    expect(edges.length).toBe(512);
  });

  it('a diagonal drag yields a connected staircase of edges (each shares an end with the next)', () => {
    for (const [a, b] of [
      [
        [10.5, 10.5],
        [30.5, 30.5],
      ],
      [
        [50.2, 70.1],
        [70.3, 50.4],
      ],
      [
        [20, 20],
        [35, 35],
      ],
    ] as const) {
      const edges = snapStroke([a, b]);
      expect(edges.length).toBeGreaterThan(10);
      for (let k = 1; k < edges.length; k++) {
        const [p1, p2] = ends(edges[k - 1]!);
        const [q1, q2] = ends(edges[k]!);
        expect([q1, q2].some((q) => q === p1 || q === p2), `edge ${k} joins edge ${k - 1}`).toBe(true);
      }
    }
  });
});

describe('snapStroke follows grid vertices (D-0120)', () => {
  /** A drag sampled like a pointer: points 0.9 cell apart along one axis. */
  function drag(fixed: number, from: number, length: number, vertical: boolean): Array<readonly [number, number]> {
    const pts: Array<readonly [number, number]> = [];
    for (let t = from; t <= from + length; t += 0.9) pts.push(vertical ? [fixed, t] : [t, fixed]);
    return pts;
  }

  it('a vertical drag a little off a grid line gives only that line\'s R edges, contiguous (the verifier\'s comb repro)', () => {
    for (const [x, y0] of [
      [64.0, 40.0],
      [64.05, 40.3],
      [64.1, 40.3],
      [64.2, 40.13],
      [63.85, 40.6],
    ] as const) {
      const edges = snapStroke(drag(x, y0, 20, true));
      expect(edges.length, `x=${x}`).toBeGreaterThanOrEqual(19);
      for (const e of edges) {
        expect(e[1], `x=${x}`).toBe('R');
        expect(e[0] % GRID_W, `x=${x}`).toBe(63);
      }
      const rows = edges.map((e) => Math.floor(e[0] / GRID_W));
      for (let k = 1; k < rows.length; k++) expect(rows[k]).toBe(rows[k - 1]! + 1);
    }
  });

  it('a horizontal drag a little off a grid line gives only that line\'s D edges', () => {
    for (const y of [30.0, 30.07, 29.8, 30.2]) {
      const edges = snapStroke(drag(y, 10.3, 15, false));
      expect(edges.length).toBeGreaterThanOrEqual(14);
      for (const e of edges) {
        expect(e[1]).toBe('D');
        expect(Math.floor(e[0] / GRID_W)).toBe(29);
      }
    }
  });

  it('nearestVertex rounds to the grid point; edgeBetween names the edge between two adjacent vertices', () => {
    expect(nearestVertex(64.2, 40.6)).toEqual([64, 41]);
    expect(nearestVertex(-0.1, 3)).toBeNull();
    expect(edgeBetween(64, 40, 64, 41)).toEqual([cell(63, 40), 'R']);
    expect(edgeBetween(64, 41, 64, 40)).toEqual([cell(63, 40), 'R']);
    expect(edgeBetween(10, 30, 11, 30)).toEqual([cell(10, 29), 'D']);
    expect(edgeBetween(0, 5, 0, 6)).toBeNull(); // the grid's left border has no cell on its left
    expect(edgeBetween(5, 0, 6, 0)).toBeNull(); // nor the top border a cell above
    expect(edgeBetween(5, 5, 6, 6)).toBeNull(); // not adjacent
  });

  it('a wiggle that never leaves its first vertex is a tap at its first point', () => {
    const wiggle: Array<readonly [number, number]> = [
      [20.05, 20.4],
      [20.2, 20.3],
      [19.9, 20.45],
    ];
    expect(snapStroke(wiggle)).toEqual([nearestEdge(20.05, 20.4)]);
  });

  it('a step through a cell centre turns at the corner nearer the stroke, so the path stays connected', () => {
    // One sample step from vertex (20, 20) straight to (21, 21). Passing nearer the corner (20, 21): the vertical
    // edge first.
    expect(
      snapStroke([
        [20.4, 20.45],
        [20.6, 20.58],
      ]),
    ).toEqual([
      [cell(19, 20), 'R'],
      [cell(20, 20), 'D'],
    ]);
    // Through the centre itself (a tie): the horizontal edge first, via the corner (21, 20).
    expect(
      snapStroke([
        [20.45, 20.4],
        [20.55, 20.6],
      ]),
    ).toEqual([
      [cell(20, 19), 'D'],
      [cell(20, 20), 'R'],
    ]);
  });
});

describe('Remove picking (D-0119)', () => {
  const g = {
    edges: [
      { id: 7, cell: cell(20, 20), dir: 'R' as const },
      { id: 9, cell: cell(20, 20), dir: 'D' as const },
      { id: 11, cell: cell(21, 20), dir: 'R' as const },
    ],
    devices: [{ id: 8, cell: cell(20, 20) }],
  };

  it('a tap near the centre takes the device; near a barrier edge takes the edge', () => {
    expect(pickRemoveTarget(20.5, 20.5, g)).toBe(8);
    expect(pickRemoveTarget(20.7, 20.6, g)).toBe(8); // within 0.3 of the centre
    expect(pickRemoveTarget(20.97, 20.5, g)).toBe(7); // on the east edge
    expect(pickRemoveTarget(20.5, 20.95, g)).toBe(9); // on the south edge
  });

  it('without a barrier on the nearest edge the device is taken; with neither, nothing', () => {
    expect(pickRemoveTarget(20.05, 20.5, g)).toBe(8); // west edge has no barrier
    expect(pickRemoveTarget(30.5, 30.5, g)).toBeNull();
    expect(pickRemoveTarget(21.95, 20.5, g)).toBe(11);
    expect(pickRemoveTarget(-1, 3, g)).toBeNull();
  });

  it('a drag collects every barrier edge and device it passes, ascending', () => {
    expect(
      strokeRemoveIds(
        [
          [20.5, 20.5],
          [22.5, 20.5],
        ],
        g,
      ),
    ).toEqual([7, 8, 11]);
  });
});
