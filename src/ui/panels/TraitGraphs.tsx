/**
 * Regional trait graphs (P2.8; SPEC §12.4–12.5; UX §5.4). For one organism kind and one inherited
 * trait (locus): the population and the trait's median and range in the whole dish and in each quarter
 * of it, as small multiples in the one validated ink (D-0014), with a shared crosshair readout, a text
 * summary and a table view. Every number is read from the dish's recorded history (a sample every 10
 * simulated seconds; older minutes keep one sample each), never from the screen.
 */
import { useEffect, useState } from 'preact/hooks';
import type { RegionalTraitSeries, RegionStat } from '@sim/history';
import { getClient } from '../state';
import {
  changeMarksText,
  clockText,
  quarterPopulationMax,
  REGION_LABELS,
  rangeText,
  regionSentence,
  traitSummaryText,
  traitRecordNote,
  traitTableRows,
  traitText,
  TRAIT_AXIS,
} from './TraitData';

const INK = '#256E9E';
const GRID = '#D9D6CC';
const MUTED = '#4F5F67';
const SURFACE = '#F5F4EF';

interface Reply {
  readonly series: RegionalTraitSeries;
  readonly available: readonly (readonly number[])[];
  readonly loci: readonly { readonly index: number; readonly name: string }[];
  /** Seconds at which the player changed the dish (recorded history). */
  readonly interventions: readonly number[];
}

/**
 * The quarter of the dish outline each region fills (TRAIT_REGIONS order after the whole dish): a
 * sector from the centre, drawn clockwise, so no element needs a document-wide id.
 */
const QUARTER_SECTORS = [
  'M9,9L1,9A8,8 0 0 1 9,1Z', // top left
  'M9,9L9,1A8,8 0 0 1 17,9Z', // top right
  'M9,9L9,17A8,8 0 0 1 1,9Z', // bottom left
  'M9,9L17,9A8,8 0 0 1 9,17Z', // bottom right
] as const;

/** A small outline of the dish with the region filled, so the region never depends on reading a label alone. */
function RegionGlyph({ region }: { region: number }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" class="trait-glyph">
      {region === 0 ? (
        <circle cx="9" cy="9" r="8" fill={MUTED} />
      ) : (
        <path d={QUARTER_SECTORS[region - 1]} fill={MUTED} />
      )}
      <circle cx="9" cy="9" r="8" fill="none" stroke={MUTED} stroke-width="1.5" />
    </svg>
  );
}

interface PanelProps {
  readonly region: number;
  readonly seconds: readonly number[];
  readonly stats: readonly RegionStat[];
  readonly kind: 'population' | 'trait';
  readonly max: number;
  readonly hover: number | null;
  readonly speciesName: string;
  readonly traitName: string;
  readonly setHover: (k: number | null) => void;
  /** Seconds of the changes made to the dish: dashed vertical lines, like History's other charts. */
  readonly marks: readonly number[];
}

const H = 64;
const PAD = 4;

function Panel({ region, seconds, stats, kind, max, hover, speciesName, traitName, setHover, marks }: PanelProps) {
  // The whole-dish panel spans both columns: a wider view box keeps every panel the same height.
  const W = region === 0 ? 412 : 200;
  const n = seconds.length;
  const t0 = seconds[0] ?? 0;
  const t1 = seconds[n - 1] ?? 1;
  const x = (s: number) => PAD + (t1 === t0 ? (W - 2 * PAD) / 2 : ((s - t0) / (t1 - t0)) * (W - 2 * PAD));
  const lo = kind === 'trait' ? TRAIT_AXIS[0] : 0;
  const hi = kind === 'trait' ? TRAIT_AXIS[1] : Math.max(1, max);
  const y = (v: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD);
  const value = (st: RegionStat): number | null => (kind === 'population' ? st.count : st.median);
  // Lines break where nothing was recorded (no members there), never interpolate across a gap.
  let line = '';
  let pen = false;
  for (let k = 0; k < n; k++) {
    const v = value(stats[k]!);
    if (v === null) {
      pen = false;
      continue;
    }
    line += `${pen ? 'L' : 'M'}${x(seconds[k]!).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  }
  // Trait range band: one closed shape per unbroken run of recorded samples. The pale fill only groups
  // the band; its minimum and maximum edges are drawn as thin lines in the ink (≥ 3:1 on the surface),
  // so the range reads without the fill.
  const bands: string[] = [];
  const edges: string[] = [];
  if (kind === 'trait') {
    let run: number[] = [];
    const flush = () => {
      if (run.length > 0) {
        const top = run
          .map((k, i) => `${i === 0 ? 'M' : 'L'}${x(seconds[k]!).toFixed(1)},${y(stats[k]!.max!).toFixed(1)}`)
          .join('');
        const bottom = [...run]
          .reverse()
          .map((k) => `L${x(seconds[k]!).toFixed(1)},${y(stats[k]!.min!).toFixed(1)}`)
          .join('');
        bands.push(`${top}${bottom}Z`);
        edges.push(top, `M${bottom.slice(1)}`);
      }
      run = [];
    };
    for (let k = 0; k < n; k++) {
      if (stats[k]!.min === null || stats[k]!.max === null) flush();
      else run.push(k);
    }
    flush();
  }
  const area =
    kind === 'population' && n > 1 && stats.every((s) => s.count >= 0)
      ? `${line}L${x(t1).toFixed(1)},${H - PAD}L${x(t0).toFixed(1)},${H - PAD}Z`
      : '';
  const hk = hover ?? n - 1;
  const at = stats[hk];
  // Every readout names the recorded sample it shows (the latest one too: it can be up to 10 s old).
  const atTime = n > 0 ? `${clockText(seconds[hk] ?? 0)}: ` : '';
  const readout = !at
    ? '—'
    : kind === 'population'
      ? `${at.count} alive`
      : at.median === null
        ? at.count === 0
          ? 'none alive'
          : 'none carry it'
        : `median ${traitText(at.median)}, range ${rangeText(at)}`;
  const label = REGION_LABELS[region] ?? `Region ${region}`;
  const last = stats[n - 1];
  const lastAt = clockText(seconds[n - 1] ?? 0);
  const aria =
    kind === 'population'
      ? `${label}: ${speciesName} alive, ${last?.count ?? 0} at ${lastAt} (the latest sample), highest ${Math.max(0, ...stats.map((s) => s.count))}.`
      : last
        ? `${label}: ${traitName}. ${regionSentence(`At ${lastAt}`, last, speciesName)}`
        : `${label}: no samples yet.`;
  const onMove = (e: PointerEvent) => {
    // The crosshair snaps to the nearest recorded sample in time.
    if (n === 0) return;
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const vx = ((e.clientX - r.left) / Math.max(1, r.width)) * W;
    const sx = t0 + ((vx - PAD) / (W - 2 * PAD)) * (t1 - t0);
    let best = 0;
    for (let k = 1; k < n; k++) if (Math.abs(seconds[k]! - sx) < Math.abs(seconds[best]! - sx)) best = k;
    setHover(best);
  };
  // A tap (touch or pen) reads the sample under it and keeps it, labelled with its time, after the finger
  // lifts; a mouse leaving the chart returns every readout to the latest sample.
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') setHover(null);
  };
  return (
    <figure class={`trait-panel${region === 0 ? ' trait-panel-dish' : ''}`} data-region={region}>
      <figcaption>
        <span class="trait-panel-title">
          <RegionGlyph region={region} /> {label}
        </span>
        <span class="trait-readout">
          {atTime}
          {readout}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={aria}
        onPointerDown={onMove}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={{ touchAction: 'pan-y', display: 'block', height: 'auto' }}
      >
        <line
          x1={PAD}
          x2={W - PAD}
          y1={H - PAD}
          y2={H - PAD}
          stroke={GRID}
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />
        {kind === 'trait' ? (
          <line
            x1={PAD}
            x2={W - PAD}
            y1={y(50)}
            y2={y(50)}
            stroke={GRID}
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
        ) : null}
        {marks
          .filter((m) => n > 1 && m >= t0 && m <= t1)
          .map((m) => (
            <line
              key={`m${m}`}
              x1={x(m)}
              x2={x(m)}
              y1={PAD}
              y2={H - PAD}
              stroke={MUTED}
              stroke-width="1"
              stroke-dasharray="3 3"
              vector-effect="non-scaling-stroke"
            />
          ))}
        {bands.map((d, i) => (
          <path key={i} d={d} fill={INK} opacity="0.12" />
        ))}
        {edges.map((d, i) => (
          <path
            key={`e${i}`}
            d={d}
            fill="none"
            stroke={INK}
            stroke-width="1"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
        ))}
        {area ? <path d={area} fill={INK} opacity="0.1" /> : null}
        <path
          d={line}
          fill="none"
          stroke={INK}
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
        {hover !== null ? (
          <line
            x1={x(seconds[hk]!)}
            x2={x(seconds[hk]!)}
            y1={PAD}
            y2={H - PAD}
            stroke={MUTED}
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
        ) : null}
        {at && value(at) !== null ? (
          <circle
            cx={x(seconds[hk]!)}
            cy={y(value(at)!)}
            r="4"
            fill={INK}
            stroke={SURFACE}
            stroke-width="2"
            vector-effect="non-scaling-stroke"
          />
        ) : null}
      </svg>
      <span class="trait-axis" aria-hidden="true">
        {kind === 'trait' ? 'scale 0–100' : `scale 0–${Math.max(1, max)} alive`}
      </span>
    </figure>
  );
}

/** The regional trait view inside History: picker, charts or table, text summary. */
export function TraitGraphs({ dishId, speciesNames }: { dishId: string; speciesNames: readonly string[] }) {
  const [species, setSpecies] = useState<number | null>(null);
  const [locus, setLocus] = useState<number | null>(null);
  const [view, setView] = useState<'charts' | 'table'>('charts');
  const [reply, setReply] = useState<Reply | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** What the keyboard crosshair moved to, for screen readers (a polite live region). */
  const [spoken, setSpoken] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void getClient()
        .traitHistory(dishId, species ?? 0, locus ?? 0)
        .then((r) => {
          if (cancelled) return;
          setError(null);
          // First answer: choose the first organism kind with recorded traits and its first trait.
          if (species === null || locus === null || !(r.available[species] ?? []).includes(locus)) {
            const sp =
              species !== null && (r.available[species]?.length ?? 0) > 0
                ? species
                : r.available.findIndex((a) => a.length > 0);
            if (sp >= 0) {
              setSpecies(sp);
              setLocus(r.available[sp]![0]!);
              if (sp !== species || r.available[sp]![0] !== locus) return; // refetch for the chosen pair
            }
          }
          setReply({ series: r.series, available: r.available, loci: r.loci, interventions: r.interventions ?? [] });
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        });
    load();
    const t = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [dishId, species, locus]);

  const available = reply?.available ?? [];
  const locusName = (l: number) => reply?.loci.find((d) => d.index === l)?.name ?? `Trait ${l + 1}`;
  const speciesName = species !== null ? (speciesNames[species] ?? '?') : '';
  const series =
    reply && reply.series.species === species && reply.series.locus === locus ? reply.series : null;
  const points = series?.points ?? [];
  const seconds = points.map((p) => p.second);
  const qMax = series ? quarterPopulationMax(series) : 1;
  const dishMax = Math.max(1, ...points.map((p) => p.regions[0]!.count));
  const hk = hover !== null && hover < points.length ? hover : null;
  // The player's changes inside the charted time range (recorded history; drawn and also said in words).
  const marks = (reply?.interventions ?? []).filter(
    (m) => seconds.length > 0 && m >= seconds[0]! && m <= seconds[seconds.length - 1]!,
  );

  const onKey = (e: KeyboardEvent) => {
    if (points.length === 0) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // The readout moves; the dish's own arrow keys (camera pan) do not act behind the chart.
      e.preventDefault();
      e.stopPropagation();
      const cur = hk ?? points.length - 1;
      const k = Math.max(0, Math.min(points.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
      setHover(k);
      const p = points[k]!;
      setSpoken(
        `${clockText(p.second)}${p.summary ? ' (one sample kept for that minute)' : ''}. ${regionSentence('Whole dish', p.regions[0]!, speciesName)}`,
      );
    } else if (e.key === 'Escape' && hk !== null) {
      e.stopPropagation();
      setHover(null);
      setSpoken('Back to the latest sample.');
    }
  };

  const noTraits = reply !== null && available.every((a) => a.length === 0);
  return (
    <div class="trait-view" data-testid="trait-graphs">
      <div class="trait-pickers">
        <label class="trait-field">
          <span>Organism</span>
          <select
            value={species ?? ''}
            disabled={noTraits || reply === null}
            onChange={(e) => {
              const sp = Number(e.currentTarget.value);
              setSpecies(sp);
              setLocus(available[sp]?.[0] ?? null);
              setHover(null);
            }}
            data-testid="trait-species"
          >
            {speciesNames.map((name, i) => (
              <option key={i} value={i} disabled={(available[i]?.length ?? 0) === 0}>
                {name}
                {(available[i]?.length ?? 0) === 0 ? ' (no traits recorded)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label class="trait-field">
          <span>Trait</span>
          <select
            value={locus ?? ''}
            disabled={species === null || (available[species]?.length ?? 0) === 0}
            onChange={(e) => {
              setLocus(Number(e.currentTarget.value));
              setHover(null);
            }}
            data-testid="trait-locus"
          >
            {(species !== null ? (available[species] ?? []) : []).map((l) => (
              <option key={l} value={l}>
                {locusName(l)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div class="segmented trait-view-toggle" role="group" aria-label="Show as">
        {/* Named apart from History's own Charts and Table tabs just above. */}
        <button
          class="btn"
          aria-pressed={view === 'charts'}
          onClick={() => setView('charts')}
          data-testid="trait-view-charts"
        >
          Trait charts
        </button>
        <button
          class="btn"
          aria-pressed={view === 'table'}
          onClick={() => setView('table')}
          data-testid="trait-view-table"
        >
          Trait table
        </button>
      </div>
      {error ? <p class="sub">The trait history could not be read: {error}</p> : null}
      {noTraits || (series && points.length === 0) ? (
        <p class="sub" data-testid="trait-empty">
          No trait samples yet. A sample is recorded every 10 simulated seconds; run the dish for a moment.
        </p>
      ) : null}
      {series && points.length > 0 && species !== null && locus !== null ? (
        <>
          <p class="sub trait-summary" data-testid="trait-summary">
            {traitSummaryText(series, speciesName, locusName(locus))}
          </p>
          <p class="sub">
            Quarters split the dish at its centre. Median and range are over the living {speciesName} in each
            region that carry this trait. A chart shows what happened together, not what caused it.
          </p>
          {traitRecordNote(series) ? (
            <p class="sub" data-testid="trait-record-note">
              {traitRecordNote(series)}
            </p>
          ) : null}
          {view === 'charts' ? (
            <div
              class="trait-charts"
              tabIndex={0}
              role="group"
              aria-label={`${speciesName}, ${locusName(locus)}, by region. Left and right arrow keys move the readout between samples.`}
              onKeyDown={onKey}
              data-testid="trait-charts"
            >
              <h3 class="chart-group">{speciesName} alive, by region</h3>
              <div class="trait-grid">
                {REGION_LABELS.map((_, r) => (
                  <Panel
                    key={`p${r}`}
                    region={r}
                    seconds={seconds}
                    stats={points.map((p) => p.regions[r]!)}
                    kind="population"
                    max={r === 0 ? dishMax : qMax}
                    hover={hk}
                    speciesName={speciesName}
                    traitName={locusName(locus)}
                    setHover={setHover}
                    marks={marks}
                  />
                ))}
              </div>
              <h3 class="chart-group">{locusName(locus)}: median (line) and range (band), by region</h3>
              <div class="trait-grid">
                {REGION_LABELS.map((_, r) => (
                  <Panel
                    key={`t${r}`}
                    region={r}
                    seconds={seconds}
                    stats={points.map((p) => p.regions[r]!)}
                    kind="trait"
                    max={100}
                    hover={hk}
                    speciesName={speciesName}
                    traitName={locusName(locus)}
                    setHover={setHover}
                    marks={marks}
                  />
                ))}
              </div>
              <p class="sub trait-time">
                Dish time {clockText(seconds[0] ?? 0)} to {clockText(seconds[seconds.length - 1] ?? 0)}.
                Traits are on their recorded 0–100 scale. {changeMarksText(marks)}
              </p>
              <p class="sr-only" aria-live="polite" data-testid="trait-spoken">
                {spoken}
              </p>
            </div>
          ) : (
            <>
              <p class="sub trait-time">
                “Alive” counts the living {speciesName} in each region; median and range are over those
                carrying the trait. “Dish changed” says whether a change was made to the dish since the row
                before. Newest first.
              </p>
              <div class="trait-table-wrap" tabIndex={0} role="region" aria-label="Trait by region table">
                <table class="trait-table" data-testid="trait-table">
                  <caption>
                    {speciesName}, {locusName(locus)}, by region
                  </caption>
                  <thead>
                    <tr>
                      <th rowSpan={2} scope="col">
                        Time
                      </th>
                      <th rowSpan={2} scope="col">
                        Dish changed
                      </th>
                      {REGION_LABELS.map((l) => (
                        <th key={l} colSpan={3} scope="colgroup">
                          {l}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {REGION_LABELS.map((l) => [
                        <th key={`${l}-a`} scope="col">
                          Alive
                        </th>,
                        <th key={`${l}-m`} scope="col">
                          Median
                        </th>,
                        <th key={`${l}-r`} scope="col">
                          Range
                        </th>,
                      ])}
                    </tr>
                  </thead>
                  <tbody>
                    {traitTableRows(series, marks).map((row) => (
                      <tr key={row.second}>
                        <th scope="row">
                          {row.time}
                          {row.summary ? ' (minute)' : ''}
                        </th>
                        <td>{row.changed ? 'yes' : 'no'}</td>
                        {row.cells.map((c, k) => [
                          <td key={`${k}-a`}>{c.alive}</td>,
                          <td key={`${k}-m`}>{c.median}</td>,
                          <td key={`${k}-r`}>{c.range}</td>,
                        ])}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
