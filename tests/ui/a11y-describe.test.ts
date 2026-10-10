/**
 * P3.11 (UX §9, W6-02/W6-03): the canvas alternatives' text builders (src/ui/a11y/describe.ts). Pure:
 * - the trend reads the oldest and newest recorded sample of the window, with a 5 % steady band;
 * - a species is "extinct" only when its count is 0 after members were seen on this timeline;
 * - a rewind (Undo) or another dish starts the track again from the present;
 * - the cell line names ground, pH, oxygen, light, the food present and the residents, nothing else.
 */
import { describe, expect, it } from 'vitest';
import {
  cellDescriptionText,
  dishSummaryText,
  recordCounts,
  seriesTrend,
  speciesLine,
  summaryInputs,
  TREND_THRESHOLD,
  type CountTrack,
} from '../../src/ui/a11y/describe';

const pts = (...v: [number, number][]) => v.map(([second, value]) => ({ second, value }));

describe('seriesTrend', () => {
  it('is unknown with fewer than two samples or no time between them', () => {
    expect(seriesTrend([])).toEqual({ trend: 'unknown', seconds: 0 });
    expect(seriesTrend(pts([3, 10]))).toEqual({ trend: 'unknown', seconds: 0 });
    expect(seriesTrend(pts([3, 10], [3, 12]))).toEqual({ trend: 'unknown', seconds: 0 });
  });
  it('compares the newest with the oldest sample, with a 5 % steady band', () => {
    expect(TREND_THRESHOLD).toBe(0.05);
    expect(seriesTrend(pts([0, 100], [10, 50], [30, 106]))).toEqual({ trend: 'rising', seconds: 30 });
    expect(seriesTrend(pts([0, 100], [20, 104.9]))).toEqual({ trend: 'steady', seconds: 20 });
    expect(seriesTrend(pts([0, 100], [20, 94]))).toEqual({ trend: 'falling', seconds: 20 });
    expect(seriesTrend(pts([0, 0], [20, 0]))).toEqual({ trend: 'steady', seconds: 20 });
    expect(seriesTrend(pts([0, 0], [5, 2]))).toEqual({ trend: 'rising', seconds: 5 });
    expect(seriesTrend(pts([0, 3], [5, 0]))).toEqual({ trend: 'falling', seconds: 5 });
  });
});

describe('species lines and the dish summary', () => {
  const base = { trend: 'rising' as const, trendSeconds: 30, seen: true };
  it('words a living species with its count and the measured trend, never more', () => {
    expect(speciesLine({ ...base, name: 'Sprinter', count: 24 })).toBe(
      'Sprinter: 24 alive, count rising over the last 30 s of dish time.',
    );
    expect(speciesLine({ ...base, name: 'Sprinter', count: 24, measure: 'biomass' })).toBe(
      'Sprinter: 24 alive, living biomass rising over the last 30 s of dish time.',
    );
    expect(speciesLine({ ...base, name: 'Sunbead', count: 1, trend: 'unknown', trendSeconds: 0 })).toBe(
      'Sunbead: 1 alive, no count trend recorded yet.',
    );
  });
  it('says extinct only for count 0 after members were seen; unseen species are listed as none in the dish', () => {
    const s = dishSummaryText([
      { ...base, name: 'Sprinter', count: 20 },
      { ...base, name: 'Sunbead', count: 0, seen: true },
      { ...base, name: 'Hitcher', count: 0, seen: false },
      { ...base, name: 'Recycler', count: 4, trend: 'falling', trendSeconds: 12 },
      { ...base, name: 'Pinphage', count: 0, seen: false },
    ]);
    expect(s.heading).toBe('24 alive, 2 kinds of organism.');
    expect(s.lines).toEqual([
      'Sprinter: 20 alive, count rising over the last 30 s of dish time.',
      'Recycler: 4 alive, count falling over the last 12 s of dish time.',
      'Sunbead: extinct in this dish — none alive now, after members were seen.',
    ]);
    expect(s.absent).toBe('None in the dish now: Hitcher, Pinphage.');
    expect(s.lines.join(' ')).not.toMatch(/superior|advanced|perfect|adapted|immune|winning/i);
  });
  it('an empty dish says nothing is alive, and names no extinction it never saw', () => {
    const s = dishSummaryText([{ ...base, name: 'Sprinter', count: 0, seen: false }]);
    expect(s.heading).toBe('Nothing is alive in the dish now.');
    expect(s.lines).toEqual([]);
    expect(s.absent).toBe('None in the dish now: Sprinter.');
    expect(dishSummaryText([{ ...base, name: 'Sunbead', count: 1 }]).heading).toBe(
      '1 alive, 1 kind of organism.',
    );
  });
});

describe('recordCounts (the summary track)', () => {
  it('keeps one sample per dish second within the window and remembers who was seen', () => {
    let t: CountTrack | null = null;
    t = recordCounts(t, 'd1', 0, [5, 0]);
    t = recordCounts(t, 'd1', 4, [6, 0]); // same second: replaces
    expect(t.samples).toEqual([{ second: 0, counts: [6, 0] }]);
    t = recordCounts(t, 'd1', 100, [8, 2]);
    t = recordCounts(t, 'd1', 350, [0, 3]);
    expect(t.samples.map((s) => s.second)).toEqual([10, 35]); // second 0 is older than 30 s
    expect(t.seen).toEqual([true, true]);
    const inputs = summaryInputs(t, ['Sprinter', 'Recycler']);
    expect(inputs[0]).toMatchObject({
      name: 'Sprinter',
      count: 0,
      seen: true,
      trend: 'falling',
      trendSeconds: 25,
    });
    expect(inputs[1]).toMatchObject({
      name: 'Recycler',
      count: 3,
      seen: true,
      trend: 'rising',
      trendSeconds: 25,
    });
    expect(speciesLine(inputs[0]!)).toContain('extinct');
  });
  it('starts again from the present after a rewind or on another dish, so extinction is never carried over', () => {
    let t = recordCounts(null, 'd1', 0, [5, 1]);
    t = recordCounts(t, 'd1', 200, [5, 0]);
    expect(t.seen).toEqual([true, true]);
    const rewound = recordCounts(t, 'd1', 100, [5, 0]); // Undo rewinds time
    expect(rewound.seen).toEqual([true, false]);
    expect(rewound.samples).toEqual([{ second: 10, counts: [5, 0] }]);
    const other = recordCounts(t, 'd2', 300, [0, 0]);
    expect(other.seen).toEqual([false, false]);
    expect(dishSummaryText(summaryInputs(other, ['Sprinter', 'Recycler'])).lines).toEqual([]);
  });
});

describe('cellDescriptionText', () => {
  it('names ground, pH, oxygen, light, the food present and the residents', () => {
    expect(
      cellDescriptionText({
        x: 48,
        y: 64,
        ground: 'Water',
        ph: 7,
        oxygen: 0.8234,
        light: 1,
        fields: { sugar: 0.1, starch: 0, nutrient: 0.004, eStarch: 0.3 },
        residents: ['Sprinter', 'Sunbead', 'Sprinter'],
      }),
    ).toBe(
      'Selected cell 48, 64: Water. pH 7.00, oxygen 0.82, light 1.00. Sugar 0.10, Mineral nutrient 4.0e-3. Residents: Sprinter × 2, Sunbead × 1.',
    );
  });
  it('says when there is no food and nobody here, and leaves out oxygen the world does not record', () => {
    expect(
      cellDescriptionText({
        x: 1,
        y: 2,
        ground: 'Gel',
        ph: Number.NaN,
        light: 0.5,
        fields: {},
        residents: [],
      }),
    ).toBe('Selected cell 1, 2: Gel. pH not measured, light 0.50. No food here. Residents: none.');
  });
});
