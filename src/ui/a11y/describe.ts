/**
 * Text builders for the canvas alternatives (UX §9; P3.11 W6-03): the dish summary (an accessible
 * species list: name, count, trend, extinct state) and the selected-cell description. Pure functions
 * of recorded values the UI already holds (snapshot counts, recorded samples, the inspector's cell
 * payload), so the words never claim more than was measured.
 */

/** Direction of a recorded series (a species' living count or biomass) over a recent window of dish time. */
export type Trend = 'rising' | 'falling' | 'steady' | 'unknown';

/** What a trend measures: the living count (snapshot counts) or living biomass (HistorySample.biomass). */
export type TrendMeasure = 'count' | 'biomass';

/** One recorded sample of a species' series at a whole dish second. */
export interface TrendPoint {
  readonly second: number;
  readonly value: number;
}

/** Relative change below which the trend reads "steady" (5 %). */
export const TREND_THRESHOLD = 0.05;

/**
 * The trend between the oldest and the newest recorded sample of the window: rising or falling when
 * the newest differs from the oldest by more than 5 % of the larger of the two, steady otherwise; with
 * fewer than two samples (or no time between them) it is unknown. `seconds` is the span compared.
 */
export function seriesTrend(points: readonly TrendPoint[]): {
  readonly trend: Trend;
  readonly seconds: number;
} {
  if (points.length < 2) return { trend: 'unknown', seconds: 0 };
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const seconds = last.second - first.second;
  if (!(seconds > 0)) return { trend: 'unknown', seconds: 0 };
  const scale = Math.max(Math.abs(first.value), Math.abs(last.value));
  if (scale === 0) return { trend: 'steady', seconds };
  const change = (last.value - first.value) / scale;
  if (change > TREND_THRESHOLD) return { trend: 'rising', seconds };
  if (change < -TREND_THRESHOLD) return { trend: 'falling', seconds };
  return { trend: 'steady', seconds };
}

export interface SpeciesSummaryInput {
  readonly name: string;
  /** Living members now (SnapshotMsg.speciesCounts). */
  readonly count: number;
  /** Whether members of this species were recorded in this dish's timeline (now or earlier). */
  readonly seen: boolean;
  readonly trend: Trend;
  /** Dish seconds the trend compares (0 when unknown). */
  readonly trendSeconds: number;
  /** What the trend measured (default the living count). */
  readonly measure?: TrendMeasure;
  /** Members taken out of the dish into a held Sample (SampleHeldSummary.speciesHeld; default 0). */
  readonly held?: number;
}

/** "Sprinter: 24 alive, count rising over the last 30 s of dish time." / "Sprinter: extinct in this dish …". */
export function speciesLine(s: SpeciesSummaryInput): string {
  const held = s.held ?? 0;
  const heldText = held > 0 ? `${held} held in the sample` : '';
  if (s.count <= 0 && held > 0) return `${s.name}: none in the dish now; ${heldText}.`;
  if (s.count <= 0) return `${s.name}: extinct in this dish — none alive now, after members were seen.`;
  const what = s.measure === 'biomass' ? 'living biomass' : 'count';
  const trend =
    s.trend === 'unknown'
      ? `no ${what} trend recorded yet`
      : `${what} ${s.trend} over the last ${Math.round(s.trendSeconds)} s of dish time`;
  return `${s.name}: ${s.count} alive, ${trend}${held > 0 ? `; ${heldText}` : ''}.`;
}

export interface DishSummaryText {
  /** "56 alive, 4 kinds of organism." */
  readonly heading: string;
  /** One line per species that is alive or was seen, living ones first (in the dish's species order). */
  readonly lines: readonly string[];
  /** "None in the dish now: Hitcher, Pinphage." or null when every species was seen. */
  readonly absent: string | null;
}

/**
 * The whole summary. Species with no members seen are listed once, together, as none in the dish now
 * (they are offered by Add Life); a species whose members were seen and has none alive now is extinct
 * here (count 0 after members were seen), unless members are held in a Sample: those are named as held.
 */
export function dishSummaryText(species: readonly SpeciesSummaryInput[]): DishSummaryText {
  const alive = species.filter((s) => s.count > 0);
  const extinct = species.filter((s) => s.count <= 0 && (s.seen || (s.held ?? 0) > 0));
  const absent = species.filter((s) => s.count <= 0 && !s.seen && (s.held ?? 0) <= 0);
  const total = alive.reduce((a, s) => a + s.count, 0);
  const kinds = alive.length;
  const heading =
    total === 0
      ? 'Nothing is alive in the dish now.'
      : `${total} alive, ${kinds} kind${kinds === 1 ? '' : 's'} of organism.`;
  return {
    heading,
    lines: [...alive, ...extinct].map(speciesLine),
    absent: absent.length > 0 ? `None in the dish now: ${absent.map((s) => s.name).join(', ')}.` : null,
  };
}

/** Food pools the cell description names, in this order, with their player-facing names. */
export const CELL_FOODS: readonly (readonly [string, string])[] = [
  ['sugar', 'Sugar'],
  ['starch', 'Starch'],
  ['oil', 'Oil'],
  ['protein', 'Protein'],
  ['broth', 'Broth'],
  ['metabolite', 'Metabolite'],
  ['detritus', 'Debris'],
  ['film', 'Biofilm'],
  ['nutrient', 'Mineral nutrient'],
];

export interface CellDescriptionInput {
  readonly x: number;
  readonly y: number;
  /** The ground in content words ("Water", "Gel", "Stone"), as the inspector names it. */
  readonly ground: string;
  readonly ph: number;
  readonly oxygen?: number | undefined;
  /** Effective light in the cell (0–1). */
  readonly light: number;
  readonly fields: Readonly<Record<string, number>>;
  /** Species names of the organisms whose cell this is (CellInspect.residents, already named). */
  readonly residents: readonly string[];
}

function num(v: number): string {
  if (!Number.isFinite(v)) return 'not measured';
  if (v === 0) return '0';
  return Math.abs(v) >= 0.01 ? v.toFixed(2) : v.toExponential(1);
}

/**
 * One line for the selected cell: "Selected cell 48, 64: Water. pH 7.00, oxygen 0.82, light 1.00.
 * Sugar 0.10. Residents: Sprinter × 2, Sunbead × 1." Amounts are game units, as in the inspector.
 */
export function cellDescriptionText(c: CellDescriptionInput): string {
  const env = [`pH ${num(c.ph)}`];
  if (c.oxygen !== undefined) env.push(`oxygen ${num(c.oxygen)}`);
  env.push(`light ${num(c.light)}`);
  const foods = CELL_FOODS.filter(([k]) => (c.fields[k] ?? 0) > 1e-6).map(
    ([k, name]) => `${name} ${num(c.fields[k]!)}`,
  );
  const counts: string[] = [];
  const by: Record<string, number> = {};
  for (const name of c.residents) {
    if (by[name] === undefined) {
      by[name] = 0;
      counts.push(name);
    }
    by[name]++;
  }
  const residents = counts.length === 0 ? 'none' : counts.map((n) => `${n} × ${by[n]}`).join(', ');
  return [
    `Selected cell ${c.x}, ${c.y}: ${c.ground}.`,
    `${env.join(', ')}.`,
    foods.length > 0 ? `${foods.join(', ')}.` : 'No food here.',
    `Residents: ${residents}.`,
  ].join(' ');
}

/** The living counts the UI has seen for one dish, one sample per whole dish second (newest last). */
export interface CountTrack {
  readonly dishId: string;
  /** Per species (dish order): members were alive in some snapshot of this timeline. */
  readonly seen: readonly boolean[];
  readonly samples: readonly { readonly second: number; readonly counts: readonly number[] }[];
}

/**
 * Add one snapshot's counts. A new dish starts a new track; a tick earlier than the last sample (Undo
 * rewinds time, or another moment was opened) starts it again from the present, so "extinct" is only
 * said for members seen on this timeline. Samples older than `window` dish seconds are dropped.
 */
export function recordCounts(
  prev: CountTrack | null,
  dishId: string,
  tick: number,
  counts: readonly number[],
  window = 30,
): CountTrack {
  const second = Math.floor(tick / 10);
  const fresh = (): CountTrack => ({
    dishId,
    seen: counts.map((c) => c > 0),
    samples: [{ second, counts: counts.slice() }],
  });
  if (!prev || prev.dishId !== dishId || prev.seen.length !== counts.length) return fresh();
  const last = prev.samples[prev.samples.length - 1];
  if (!last || second < last.second) return fresh();
  const seen = prev.seen.map((s, i) => s || (counts[i] ?? 0) > 0);
  const kept = prev.samples.filter((p) => p.second >= second - window && p.second !== second);
  return { dishId, seen, samples: [...kept, { second, counts: counts.slice() }] };
}

/**
 * The summary speaks of organisms (snapshot counts). A phage is measured in units per cell, not counted, so
 * the summary never says one is absent or extinct: viral species are left out (their units show in the
 * cell inspector and the Infection overlay).
 */
export function organismInputs(
  inputs: readonly SpeciesSummaryInput[],
  diets: readonly ({ readonly metabolism: string } | null | undefined)[] | undefined,
): SpeciesSummaryInput[] {
  return inputs.filter((_, i) => diets?.[i]?.metabolism !== 'viral');
}

/** The species' summary inputs from a track and the dish's species names (count trend over the track). */
export function summaryInputs(
  track: CountTrack,
  names: readonly string[],
  held: readonly number[] = [],
): SpeciesSummaryInput[] {
  const now = track.samples[track.samples.length - 1];
  return names.map((name, i) => {
    const { trend, seconds } = seriesTrend(
      track.samples.map((p) => ({ second: p.second, value: p.counts[i] ?? 0 })),
    );
    return {
      name,
      count: now?.counts[i] ?? 0,
      seen: track.seen[i] === true,
      trend,
      trendSeconds: seconds,
      measure: 'count' as const,
      held: held[i] ?? 0,
    };
  });
}
