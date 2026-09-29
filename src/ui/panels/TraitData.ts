/**
 * Regional trait graphs (P2.8; SPEC §12.4–12.5): pure shaping of a recorded regional series into what
 * the charts, the text summary and the table show. Everything here reads the series the worker built
 * from history (src/sim/history.ts regionalTraitSeries); nothing is estimated or smoothed.
 */
import type { RegionalTraitSeries, RegionStat } from '@sim/history';

/** TRAIT_REGIONS order (whole dish, then the four quarters as they sit on screen). */
export const REGION_LABELS = ['Whole dish', 'Top left', 'Top right', 'Bottom left', 'Bottom right'] as const;

/** Dish time as m:ss (h:mm:ss past an hour), like the dish's clock. */
export function clockText(second: number): string {
  const s = Math.max(0, Math.floor(second));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** A trait value (loci are whole numbers 0–100; a median of an even count can end in .5). */
export function traitText(v: number | null): string {
  if (v === null) return '—';
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function rangeText(r: RegionStat): string {
  return r.min === null || r.max === null
    ? '—'
    : r.min === r.max
      ? traitText(r.min)
      : `${traitText(r.min)}–${traitText(r.max)}`;
}

export interface TraitTableCell {
  readonly alive: string;
  readonly median: string;
  readonly range: string;
}

export interface TraitTableRow {
  readonly second: number;
  readonly time: string;
  /** A compacted minute sample (older than the 10-second window). */
  readonly summary: boolean;
  /** A change was made to the dish after the previous sample, up to this one (recorded history). */
  readonly changed: boolean;
  /** REGION_LABELS order. */
  readonly cells: readonly TraitTableCell[];
}

/**
 * The table view: every recorded sample, newest first, one cell group per region, and whether the dish
 * was changed since the previous sample (`marks`: the recorded change seconds the charts draw).
 */
export function traitTableRows(series: RegionalTraitSeries, marks: readonly number[] = []): TraitTableRow[] {
  return series.points
    .map((p, k) => {
      const prev = k > 0 ? series.points[k - 1]!.second : Number.NEGATIVE_INFINITY;
      return {
        second: p.second,
        time: clockText(p.second),
        summary: p.summary,
        changed: marks.some((m) => m > prev && m <= p.second),
        cells: p.regions.map((r) => ({
          alive: String(r.count),
          median: traitText(r.median),
          range: rangeText(r),
        })),
      };
    })
    .reverse();
}

/**
 * What the trait record does not hold, in words (SPEC §12.4 "Compacted history is labelled incomplete;
 * never reconstruct"). Stated only from recorded facts: the dish second trait recording started at
 * (an older dish migrated to trait recording) and the compaction flag — never from the kept points,
 * because compaction thins and drops the oldest samples.
 */
export function traitRecordNote(series: Pick<RegionalTraitSeries, 'since' | 'compacted'>): string {
  const parts: string[] = [];
  if (series.since !== null && series.since > 0)
    parts.push(
      `Trait samples start after ${clockText(series.since)}: this dish was saved by an older version of Pixelmeba before then, which recorded no trait samples.`,
    );
  if (series.compacted)
    parts.push(
      'This trait history is incomplete: for times older than the last 30 simulated minutes it keeps one sample per minute, and none older than six hours.',
    );
  return parts.join(' ');
}

/** The changes made to the dish in the charted time, in words (the charts draw them as dashed lines). */
export function changeMarksText(marks: readonly number[]): string {
  if (marks.length === 0) return 'No changes were made to the dish in this time.';
  const times = marks.map(clockText);
  if (times.length <= 5) {
    const list = times.length === 1 ? times[0]! : `${times.slice(0, -1).join(', ')} and ${times[times.length - 1]!}`;
    return `Dashed vertical lines mark changes made to the dish: at ${list}.`;
  }
  return `Dashed vertical lines mark changes made to the dish at ${times.length} moments, from ${times[0]!} to ${times[times.length - 1]!}; the table view marks each one.`;
}

/** One region's latest recorded values in words (for the text summary and the charts' labels). */
export function regionSentence(label: string, r: RegionStat, speciesName: string): string {
  if (r.count === 0) return `${label}: no ${speciesName} alive.`;
  if (r.n === 0 || r.median === null) return `${label}: ${r.count} alive; none carries this trait.`;
  const who = r.n === r.count ? `${r.count} alive` : `${r.count} alive, ${r.n} carrying this trait`;
  return `${label}: ${who}, median ${traitText(r.median)} (range ${rangeText(r)}).`;
}

/** The text summary: what the latest sample recorded in each region, and how to read it. */
export function traitSummaryText(
  series: RegionalTraitSeries,
  speciesName: string,
  locusName: string,
): string {
  const last = series.points[series.points.length - 1];
  if (!last) return `No trait samples recorded yet. A sample is taken every 10 simulated seconds.`;
  const lines = last.regions.map((r, k) => regionSentence(REGION_LABELS[k] ?? `Region ${k}`, r, speciesName));
  return `${speciesName}, ${locusName}, at ${clockText(last.second)}: ${lines.join(' ')}`;
}

/** Shared y-range for the population panels of the four quarters (the whole dish has its own). */
export function quarterPopulationMax(series: RegionalTraitSeries): number {
  let max = 0;
  for (const p of series.points)
    for (let k = 1; k < p.regions.length; k++) max = Math.max(max, p.regions[k]!.count);
  return max;
}

/** The trait axis: 0–100 always (every locus is recorded on that scale), so panels compare directly. */
export const TRAIT_AXIS: readonly [number, number] = [0, 100];
