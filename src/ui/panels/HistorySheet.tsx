/**
 * History (SPEC §12.4–12.5, P1.10). Species are small multiples — one sparkline each, labelled with
 * the organism's sprite and name — so identity never depends on telling colors apart (the organisms'
 * own hues fail categorical-chart checks; see DECISIONS D-0014). Every chart is single-series in one
 * validated ink, has a crosshair tooltip, and a table view. Interventions are marked on the time axis.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { HistorySample } from '@sim/history';
import { drawFrame, loadAtlas } from '../atlas';
import { feed } from '../feed';
import { IconClose } from '../icons';
import { dishInfo, getClient, meta, sheet } from '../state';

const INK = '#256E9E';
const GRID = '#D9D6CC';
const MUTED = '#4F5F67';
const SURFACE = '#F5F4EF';

interface SparkProps {
  readonly title: string;
  readonly values: readonly number[];
  readonly seconds: readonly number[];
  readonly marks: readonly number[];
  readonly unit: string;
  readonly digits?: number;
  readonly height?: number;
}

function fmt(v: number, digits: number): string {
  return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(digits);
}

function Spark({ title, values, seconds, marks, unit, digits = 0, height = 56 }: SparkProps) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300;
  const H = height;
  const pad = 4;
  const n = values.length;
  const max = Math.max(1e-9, ...values);
  const x = (k: number) => pad + (n <= 1 ? 0 : (k / (n - 1)) * (W - 2 * pad));
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad);
  const path = values.map((v, k) => `${k === 0 ? 'M' : 'L'}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = n > 1 ? `${path}L${x(n - 1).toFixed(1)},${H - pad}L${x(0).toFixed(1)},${H - pad}Z` : '';
  const last = values[n - 1] ?? 0;
  const hk = hover ?? n - 1;
  const onMove = (e: PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(fx * (n - 1)))));
  };
  return (
    <figure style={{ margin: '0.25rem 0 0.75rem' }}>
      <figcaption style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
        <span>{title}</span>
        <span style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
          {hover !== null ? `${Math.floor(seconds[hk] ?? 0)} s: ` : 'now: '}
          {fmt(values[hk] ?? 0, digits)} {unit}
        </span>
      </figcaption>
      {n < 2 ? (
        <p class="sub">Run the dish for a moment to see this chart.</p>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          role="img"
          aria-label={`${title}: now ${fmt(last, digits)} ${unit}, highest ${fmt(max, digits)} ${unit} over the last ${Math.round((seconds[n - 1] ?? 0) - (seconds[0] ?? 0))} seconds`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          style={{ touchAction: 'pan-y', display: 'block' }}
        >
          <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke={GRID} stroke-width="1" />
          {marks.map((m) => {
            const k = seconds.findIndex((s) => s >= m);
            return k >= 0 ? <line key={m} x1={x(k)} x2={x(k)} y1={pad} y2={H - pad} stroke={GRID} stroke-width="1" /> : null;
          })}
          <path d={area} fill={INK} opacity="0.1" />
          <path d={path} fill="none" stroke={INK} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
          {hover !== null ? <line x1={x(hk)} x2={x(hk)} y1={pad} y2={H - pad} stroke={MUTED} stroke-width="1" /> : null}
          <circle cx={x(hk)} cy={y(values[hk] ?? 0)} r="4" fill={INK} stroke={SURFACE} stroke-width="2" />
        </svg>
      )}
    </figure>
  );
}

function SpeciesThumb({ asset }: { asset: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    void loadAtlas().then((a) => {
      if (ref.current) drawFrame(ref.current, a, asset);
    });
  }, [asset]);
  return <canvas ref={ref} width={32} height={32} aria-hidden="true" style={{ imageRendering: 'pixelated', width: 32, height: 32 }} />;
}

export function HistorySheet() {
  const info = dishInfo.value;
  const [samples, setSamples] = useState<readonly HistorySample[]>([]);
  const [compacted, setCompacted] = useState(false);
  const [tab, setTab] = useState<'charts' | 'table' | 'events'>('charts');
  const tick = meta.value?.tick ?? 0;
  useEffect(() => {
    if (!info) return;
    let cancelled = false;
    const load = () =>
      void getClient()
        .history(info.dishId)
        .then((h) => {
          if (cancelled) return;
          setSamples((h.seconds as HistorySample[]).slice(-300));
          setCompacted(h.compacted);
        });
    load();
    const t = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [info?.dishId]);
  if (!info) return null;
  const seconds = samples.map((s) => s.second);
  const marks = samples.filter((s) => s.interventions > 0).map((s) => s.second);
  const species = info.speciesIds.map((id, i) => ({ id, i, name: info.speciesNames[i]!, asset: info.speciesAssets[i]! }));
  const births = samples.map((s) => s.births.reduce((a, b) => a + b, 0));
  const deaths = samples.map((s) => s.deaths.reduce((a, b) => a + b, 0));
  void tick;
  return (
    <section class="sheet" aria-labelledby="history-title">
      <header>
        <h2 id="history-title">History</h2>
        <button class="btn ghost" aria-label="Close" onClick={() => (sheet.value = 'none')}>
          <IconClose />
        </button>
      </header>
      <p class="sub">Last {samples.length} simulated seconds. Vertical lines mark your changes. A chart shows what happened together, not what caused it.</p>
      <div class="tabs" role="tablist">
        {(['charts', 'table', 'events'] as const).map((t) => (
          <button key={t} class="btn" role="tab" aria-selected={tab === t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === 'charts' ? 'Charts' : t === 'table' ? 'Table' : 'What happened'}
          </button>
        ))}
      </div>
      {tab === 'charts' ? (
        <div role="tabpanel">
          {species.map((s) => (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '36px 1fr', gap: '0.5rem', alignItems: 'center' }}>
              <SpeciesThumb asset={s.asset} />
              <Spark title={`${s.name} — organisms`} values={samples.map((x) => x.count[s.i] ?? 0)} seconds={seconds} marks={marks} unit="alive" />
            </div>
          ))}
          <Spark title="Oxygen (dish average)" values={samples.map((x) => x.oxygenMean)} seconds={seconds} marks={marks} unit="" digits={3} />
          <Spark title="Free mineral nutrient (total)" values={samples.map((x) => x.nutrientTotal)} seconds={seconds} marks={marks} unit="units" digits={1} />
          <Spark title="Dissolved sugar (total)" values={samples.map((x) => x.sugarTotal)} seconds={seconds} marks={marks} unit="carbon" digits={2} />
          <Spark title="Births per second" values={births} seconds={seconds} marks={marks} unit="" />
          <Spark title="Deaths per second" values={deaths} seconds={seconds} marks={marks} unit="" />
          {compacted ? <p class="sub">Older history was summarized into one-minute steps.</p> : null}
        </div>
      ) : null}
      {tab === 'table' ? (
        <div role="tabpanel" style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
            <caption class="sub" style={{ textAlign: 'left' }}>
              Every 10th second, newest first
            </caption>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', padding: '0.2rem 0.4rem' }}>
                  Time
                </th>
                {species.map((s) => (
                  <th key={s.id} scope="col" style={{ textAlign: 'right', padding: '0.2rem 0.4rem' }}>
                    {s.name}
                  </th>
                ))}
                <th scope="col" style={{ textAlign: 'right', padding: '0.2rem 0.4rem' }}>
                  Oxygen
                </th>
              </tr>
            </thead>
            <tbody>
              {samples
                .filter((_, k) => (samples.length - 1 - k) % 10 === 0)
                .reverse()
                .map((row) => (
                  <tr key={row.second}>
                    <th scope="row" style={{ textAlign: 'left', padding: '0.2rem 0.4rem', fontWeight: 400 }}>
                      {row.second} s
                    </th>
                    {species.map((s) => (
                      <td key={s.id} style={{ textAlign: 'right', padding: '0.2rem 0.4rem' }}>
                        {row.count[s.i] ?? 0}
                      </td>
                    ))}
                    <td style={{ textAlign: 'right', padding: '0.2rem 0.4rem' }}>{row.oxygenMean.toFixed(3)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {tab === 'events' ? (
        <ul role="tabpanel" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.25rem' }} aria-live="polite">
          {feed.value.length === 0 ? <li class="sub">Nothing recorded yet.</li> : null}
          {feed.value.map((l) => (
            <li key={`${l.key}:${l.tick}`} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.875rem' }}>
              <span class="sub" style={{ minWidth: '3.5rem', fontVariantNumeric: 'tabular-nums' }}>
                {Math.floor(l.tick / 10)} s
              </span>
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
