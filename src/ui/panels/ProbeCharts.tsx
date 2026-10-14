/**
 * The probe sheet's per-region charts, table alternative, crossings and gates (Phase 5 wave 11
 * region-charts-gates; SPEC §12.4, §12.8; UX §5.4 charts, §9 "table alternatives for charts"; D-0119).
 *
 * Everything here draws the worker's readings (src/worker/probes.ts), never the world:
 * - small inline SVG sparklines of each recorded second of the window: living organisms and biomass at
 *   the second's end, and the net amount of each measured pool into the region. Every chart is labelled
 *   in words (its name, its value range in game units, the first and last dish second), so colour never
 *   carries the meaning alone; the pictures are hidden from screen readers.
 * - the same series as a captioned table: always in the page for screen readers, and shown instead of the
 *   charts with "Show as table";
 * - organisms that entered or left the region in the window, per species ("entered 3, left 1");
 * - the gates on the region's edge by their content name, summed per kind over the current edges: each
 *   edge's saved tally since it was placed, and the window's change, and how many organisms crossed.
 */
import type { StructureDef } from '@sim/content/schema';
import type { MapWindow } from '@worker/relationshipMap';
import type { ProbeGate, ProbeReading } from '@worker/probes';
import {
  crossingLines,
  gateAmountText,
  gateGroups,
  probeTables,
  seriesColumns,
  seriesRows,
  sparkLines,
  sparkRange,
  toggleProbeTable,
  type Names,
} from '../observe';
import { edgeCount, OBSERVE_TEXT, organismsCrossed } from '../strings/observe';
import { clockText } from './TraitData';
import './probeCharts.css';

const STRUCTURES = Object.values(
  import.meta.glob<StructureDef>('../../../content/structures/*.json', { eager: true, import: 'default' }),
);

/** A gate's content name ("Fine membrane"); generic words when this build has no record. */
function gateName(kind: string): string {
  return STRUCTURES.find((r) => r.id === kind)?.name ?? 'Gate';
}

const W = 200;
const H = 48;

/** One region's charts or table, its crossings and its gates. */
export function ProbeRegionCharts({
  reading,
  gates,
  names,
  windowSeconds,
}: {
  reading: ProbeReading;
  gates: readonly ProbeGate[];
  names: Names;
  windowSeconds: MapWindow;
}) {
  const id = reading.id;
  const asTable = probeTables.value.includes(id);
  const series = reading.series;
  const cols = seriesColumns(series);
  const rows = seriesRows(series);
  const first = series.seconds[0];
  const last = series.seconds.at(-1);
  const crossings = crossingLines(reading, names);
  const groups = gateGroups(gates, id);
  const table = (
    <div class="probe-series-wrap" role="region" aria-label={OBSERVE_TEXT.seriesCaption(id, windowSeconds)} tabIndex={0}>
      <table class="probe-table probe-series" data-testid={`probe-series-${id}`}>
        <caption>{OBSERVE_TEXT.seriesCaption(id, windowSeconds)}</caption>
        <thead>
          <tr>
            <th scope="col">{OBSERVE_TEXT.colSecond}</th>
            {cols.map((c) => (
              <th scope="col" key={c.key}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.second}>
              <th scope="row">{clockText(r.second)}</th>
              {r.cells.map((v, k) => (
                <td key={cols[k]!.key}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div class="probe-charts-block">
      <div class="probe-charts-head">
        <h4>{OBSERVE_TEXT.chartsTitle(windowSeconds)}</h4>
        {rows.length > 0 ? (
          <button
            class="btn"
            aria-pressed={asTable}
            onClick={() => toggleProbeTable(id)}
            data-testid={`probe-table-toggle-${id}`}
          >
            {asTable ? OBSERVE_TEXT.showCharts : OBSERVE_TEXT.showTable}
          </button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p class="sub">{OBSERVE_TEXT.noSeries}</p>
      ) : asTable ? (
        table
      ) : (
        <>
          <div class="probe-charts" aria-hidden="true" data-testid={`probe-charts-${id}`}>
            {cols.map((c) => {
              const s = sparkLines(c.values, W, H);
              return (
                <figure class="probe-spark" key={c.key} data-chart={c.key}>
                  <figcaption>
                    {c.chart}: {s ? sparkRange(s) : OBSERVE_TEXT.noSeries}
                  </figcaption>
                  {s ? (
                    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" focusable="false">
                      {s.zeroY !== null ? <line class="probe-spark-zero" x1="0" x2={W} y1={s.zeroY} y2={s.zeroY} /> : null}
                      {s.lines.map((pts, k) =>
                        pts.includes(' ') ? (
                          <polyline key={k} points={pts} />
                        ) : (
                          <circle key={k} cx={pts.split(',')[0]} cy={pts.split(',')[1]} r="2.5" />
                        ),
                      )}
                    </svg>
                  ) : null}
                  <div class="probe-spark-axis">
                    <span>
                      {OBSERVE_TEXT.chartFrom} {clockText(first!)}
                    </span>
                    <span>{clockText(last!)}</span>
                  </div>
                </figure>
              );
            })}
          </div>
          <div class="sr-only">{table}</div>
        </>
      )}
      <h4>{OBSERVE_TEXT.crossingsTitle(windowSeconds)}</h4>
      <p data-testid={`probe-crossings-${id}`}>
        {crossings.length === 0 ? OBSERVE_TEXT.noCrossings(windowSeconds) : `${crossings.join('; ')}.`}
      </p>
      {groups.length > 0 ? (
        <div class="probe-gates" data-testid={`probe-gates-${id}`}>
          <h4>{OBSERVE_TEXT.gatesTitle}</h4>
          <ul>
            {groups.map((g) => (
              <li key={g.kind} data-gate={g.kind}>
                <p class="probe-gate-name">{OBSERVE_TEXT.gateHeading(gateName(g.kind), edgeCount(g.edges))}</p>
                <p>
                  {OBSERVE_TEXT.gateSince(gateAmountText(g.since))}; {organismsCrossed(g.sinceOrganisms)}.
                </p>
                <p>
                  {g.window === null
                    ? OBSERVE_TEXT.gateNoWindow
                    : `${
                        g.window.recordedSinceSecond !== null
                          ? OBSERVE_TEXT.gateWindowSince(clockText(g.window.recordedSinceSecond), gateAmountText(g.window.fields))
                          : OBSERVE_TEXT.gateWindow(windowSeconds, gateAmountText(g.window.fields))
                      }; ${organismsCrossed(g.window.organisms)}.`}
                </p>
              </li>
            ))}
          </ul>
          <p class="sub">{OBSERVE_TEXT.gatesWhy}</p>
        </div>
      ) : null}
    </div>
  );
}
