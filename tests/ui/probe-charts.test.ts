/**
 * Phase 5 wave 11 region-charts-gates: the probe sheet's pure chart helpers (src/ui/observe.ts) and copy
 * (src/ui/strings/observe.ts).
 *
 * - series → polyline scaling: x by index across the width, y from max (top) to min (bottom) inside the
 *   padding, a flat series on the middle line, a single point in the middle, a null breaking the line,
 *   the zero baseline only when 0 lies inside the range;
 * - the table rows hold exactly the series' values (living, biomass, each measured pool's net);
 * - the words for every boundary status and reason, crossings and gate amounts; no forbidden word.
 */
import { describe, expect, it } from 'vitest';
import {
  boundaryText,
  crossingLines,
  gateAmountText,
  gateGroups,
  seriesColumns,
  seriesRows,
  signedAmount,
  sparkLines,
  sparkRange,
} from '../../src/ui/observe';
import { allObserveStrings, amount, edgeCount, OBSERVE_TEXT, organismsCrossed } from '../../src/ui/strings/observe';
import type { ProbeGate, ProbeSeries } from '../../src/worker/probes';

const pts = (line: string) => line.split(' ').map((p) => p.split(',').map(Number) as [number, number]);

describe('sparkLines', () => {
  it('scales min to the bottom and max to the top, x by index', () => {
    const s = sparkLines([2, 6, 4], 200, 48)!;
    expect(s.min).toBe(2);
    expect(s.max).toBe(6);
    expect(s.lines).toHaveLength(1);
    expect(pts(s.lines[0]!)).toEqual([
      [0, 46],
      [100, 2],
      [200, 24],
    ]);
    expect(s.zeroY).toBeNull();
    expect(sparkRange(s)).toBe('from 2.00 to 6.00');
  });

  it('a flat series sits on the middle line; a single point in the middle; no value gives no chart', () => {
    const flat = sparkLines([3, 3, 3, 3], 200, 48)!;
    expect(pts(flat.lines[0]!).map((p) => p[1])).toEqual([24, 24, 24, 24]);
    expect(sparkRange(flat)).toBe('steady at 3.00');
    const one = sparkLines([5], 200, 48)!;
    expect(one.lines).toEqual(['100,24']);
    expect(sparkLines([], 200, 48)).toBeNull();
    expect(sparkLines([null, null], 200, 48)).toBeNull();
  });

  it('a null breaks the line; a net series crossing zero gets a baseline', () => {
    const s = sparkLines([-1, 1, null, 1, 3], 200, 48)!;
    expect(s.lines).toHaveLength(2);
    expect(pts(s.lines[0]!).map((p) => p[0])).toEqual([0, 50]);
    expect(pts(s.lines[1]!).map((p) => p[0])).toEqual([150, 200]);
    // y(0) = 2 + (3 − 0) / 4 × 44 = 35
    expect(s.zeroY).toBe(35);
    expect(sparkRange(s)).toBe('from −1.00 to 3.00');
  });
});

describe('the table alternative', () => {
  const series: ProbeSeries = {
    seconds: [10, 11, 12],
    total: [4, 5, null],
    biomass: [1.5, 2.25, null],
    pools: [
      { field: 'sugar', into: [0.5, -0.25, 0] },
      { field: 'salt', into: [null, 0.004, 0.02] },
    ],
  };

  it('has one row per recorded second and the same values as the charts', () => {
    const cols = seriesColumns(series);
    expect(cols.map((c) => c.label)).toEqual(['Living', 'Biomass (C)', 'Sugar net into the region', 'Salt net into the region']);
    expect(cols.map((c) => c.values)).toEqual([series.total, series.biomass, series.pools[0]!.into, series.pools[1]!.into]);
    const rows = seriesRows(series);
    expect(rows.map((r) => r.second)).toEqual(series.seconds);
    rows.forEach((r, i) => {
      expect(r.cells).toEqual(
        cols.map((c, k) => {
          const v = c.values[i];
          return v === null || v === undefined ? '—' : k === 0 ? String(v) : signedAmount(v);
        }),
      );
    });
    expect(rows[0]!.cells).toEqual(['4', '1.50', '0.50', '—']);
    expect(rows[1]!.cells).toEqual(['5', '2.25', '−0.25', '< 0.01']);
    expect(rows[2]!.cells).toEqual(['—', '—', '0', '0.02']);
  });
});

describe('words', () => {
  it('every boundary status and reason', () => {
    expect(boundaryText('absent', 0)).toBe('not in this dish');
    expect(boundaryText('notMeasured', 0)).toBe('not measured here');
    expect(boundaryText('notMeasured', 0, 'decays')).toBe('Not measured here: it also decays while it spreads.');
    expect(boundaryText('notMeasured', 0, 'resin')).toBe('Not measured here: a resin in this region removes it.');
    expect(boundaryText('notMeasured', 0, 'gas')).toBe('Not measured here: with the lid open, the air trades it.');
    expect(boundaryText('measured', 0.25)).toBe('0.25 into the region');
    expect(boundaryText('measured', -0.25)).toBe('0.25 out of the region');
    expect(boundaryText('measured', 0)).toBe('no change');
  });

  it('crossings and gates', () => {
    const names = { speciesIds: ['B01', 'A01'], speciesNames: ['Sprinter', 'Sunbead'] };
    expect(crossingLines({ crossings: [{ species: 'B01', entered: 3, left: 1 }] }, names)).toEqual(['Sprinter: entered 3, left 1']);
    expect(OBSERVE_TEXT.noCrossings(60)).toBe('No organism entered or left in the last 60 s.');
    expect(organismsCrossed(0)).toBe('0 organisms crossed');
    expect(organismsCrossed(1)).toBe('1 organism crossed');
    expect(edgeCount(1)).toBe('1 edge');
    const gate = (id: number, kind: ProbeGate['kind'], regions: ProbeGate['regions'], sugar: number, win: number | null): ProbeGate => ({
      id,
      kind,
      cell: 100 + id,
      dir: 'R',
      regions,
      sinceStart: { fields: [{ field: 'sugar', amount: sugar }], organisms: 0 },
      window: win === null ? null : { fields: [{ field: 'sugar', amount: win }], organisms: 0, recordedSinceSecond: null },
    });
    const gates = [gate(1, 'S01', ['A', 'B'], 1, 0.5), gate(2, 'S01', ['A', 'B'], 2, 0.25), gate(3, 'S02', ['B'], 4, null), gate(4, 'S01', [], 8, 1)];
    const a = gateGroups(gates, 'A');
    expect(a).toEqual([{ kind: 'S01', edges: 2, since: [{ field: 'sugar', amount: 3 }], sinceOrganisms: 0, window: { fields: [{ field: 'sugar', amount: 0.75 }], organisms: 0, recordedSinceSecond: null } }]);
    const b = gateGroups(gates, 'B');
    expect(b.map((g) => g.kind)).toEqual(['S01', 'S02']);
    expect(b[1]!.window).toBeNull();
    expect(gateGroups(gates, 'C')).toEqual([]);
    expect(gateAmountText(a[0]!.since)).toBe(`Sugar ${amount(3)}`);
    expect(gateAmountText([])).toBe('nothing yet');
    // fix 1: the summed tally counts each current edge since it was placed, not since the dish began
    // (the gate sheet's "Measured since this barrier was placed").
    expect(OBSERVE_TEXT.gateSince('Sugar 3.00')).toBe('Measured since each of these edges was placed: Sugar 3.00');
    expect(OBSERVE_TEXT.gateSince('x')).not.toMatch(/dish began/);
    // Re-pinned in wave 13 (org-ui, D-0120 carry-over): one name per field across screens, sGlow is "Glow signal".
    expect(gateAmountText([{ field: 'salt', amount: 0.001 }, { field: 'sGlow', amount: 0.5 }])).toBe('Salt < 0.01, Glow signal 0.50');
  });

  it('no forbidden word, and never "migrated", "fled" or "chose"', () => {
    const forbidden =
      /mutualis|\bhelps?\b|\bbetter\b|\bneeds?\b|depends? on|superior|advanced|perfect|adapted|immune|symbio|partner|migrat|\bfled\b|\bflee|\bchose\b|\bchooses\b/i;
    for (const s of allObserveStrings()) expect(s, s).not.toMatch(forbidden);
    // "measured" only in words about measuring (never on a value that was not measured).
    expect(OBSERVE_TEXT.notMeasuredDecays).toMatch(/^Not measured here/);
  });
});
