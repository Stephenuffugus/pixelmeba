/**
 * A paired experiment card's run (SPEC §13.2, §13.4; UX §5.6). The card's two copies run through the
 * comparison engine: A as the recipe is written, B with the card's one change, which is already in
 * place (nothing can be added). Setup shows the change, the card's parts and the prediction note;
 * running shows the observation gate as measured; results show the card's measurements for "this
 * paired run", the gate outcome and the journal stamp. Phone: A/B toggle with a synced camera; large
 * screens: both side by side.
 */
import { useEffect, useRef } from 'preact/hooks';
import type { CompareSpeed, ComparisonExperiment } from '@worker/comparison';
import type { ExperimentCardView } from '@sim/experiments';
import { IconBack, IconZoomDish } from '../icons';
import { clock, CONCLUSIONS, describeChanges, fmt, fmtDiff, rowLabel } from '../panels/CompareText';
import {
  closeExperimentRun,
  compareConclusion,
  comparePrediction,
  compareShown,
  compareState,
  dishInfo,
  experimentCard,
  getCompareRenderer,
  loadExperimentCards,
  route,
  runExperimentPair,
  setCompareSpeed,
  setExperimentConclusion,
  showCompareArm,
  stopCompare,
  syncCompareCameras,
  toast,
} from '../state';
import { clauseText, describeArms, durationText, formatDiff, formatMeasure, measureLabel } from '../strings/experiments';
import { ExperimentViewport } from './ExperimentViewport';

export const PREDICTION_MAX = 280;

/** Short viewport titles for the two copies of a card. */
function armTitles(card: ExperimentCardView): { readonly a: string; readonly b: string } {
  const ch = card.change;
  switch (ch.kind) {
    case 'omitPatch':
      return { a: 'A · as written', b: `B · without ${card.patches[ch.patchIndex]?.label ?? 'one patch'}` };
    case 'omitScheduled':
      return { a: 'A · with the later additions', b: 'B · without the later additions' };
    case 'shade':
      return { a: 'A · as written', b: 'B · shaded' };
    default:
      return { a: 'A · as written', b: "B · with the card's change" };
  }
}

export function ExperimentRun() {
  const c = compareState.value;
  const info = dishInfo.value;
  const x = c?.experiment;
  const card = x ? experimentCard(x.cardId) : null;
  const panel = useRef<HTMLElement>(null);
  const status = c?.status;

  useEffect(() => {
    void loadExperimentCards();
  }, []);

  useEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
  }, [status]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      syncCompareCameras();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Backgrounding pauses (SPEC §14.2): a running experiment stops advancing until the player resumes it.
  useEffect(() => {
    const pause = () => {
      if (compareState.value?.status === 'running' && compareState.value.speed !== 0) setCompareSpeed(0);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pause();
    };
    const onMessage = (e: MessageEvent<unknown>) => {
      const d = e.data as { type?: string } | null;
      if (d && typeof d === 'object' && d.type === 'pixelmeba:pause') pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('message', onMessage);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('message', onMessage);
    };
  }, []);

  if (!c || !info || !x || !card) {
    return (
      <main class="page" aria-labelledby="xp-missing">
        <div class="home-grid">
          <section class="card">
            <h1 id="xp-missing" class="xp-page-title">
              No experiment is running
            </h1>
            <p>{c && !x ? 'The open comparison is not an experiment card.' : 'Open the Notebook to start an experiment card.'}</p>
            <button class="btn primary" onClick={() => (route.value = { name: 'notebook', tab: 'experiments' })}>
              Experiments
            </button>
          </section>
        </div>
      </main>
    );
  }

  const shown = compareShown.value;
  const titles = armTitles(card);
  const progress =
    status === 'setup'
      ? `Paused at ${clock(c.baselineTick)} · nothing has run yet`
      : status === 'running'
        ? `Running · ${clock(c.ticksRun)} of ${clock(x.horizonTicks)}`
        : status === 'complete'
          ? `Finished · both ran ${clock(c.ticksRun)}`
          : 'Stopped by an error';

  return (
    <div class="compare-screen xp-screen" data-testid="experiment-run-screen" data-status={status}>
      <header class="topbar">
        <button class="btn ghost" aria-label="Close the experiment and go to its dish" onClick={() => void closeExperimentRun('dish')} data-testid="experiment-close">
          <IconBack />
        </button>
        <div class="title">
          <strong>Experiment · {card.title}</strong>
          <span class="time" data-testid="experiment-time">
            {progress}
          </span>
        </div>
        <button
          class="btn"
          aria-label="Whole dish"
          onClick={() => {
            getCompareRenderer('A')?.zoomPreset('dish');
            getCompareRenderer('B')?.zoomPreset('dish');
          }}
        >
          <IconZoomDish />
        </button>
      </header>

      <div class="compare-views" data-show={shown}>
        <div class="segmented compare-toggle" role="group" aria-label="Show copy">
          <button class="btn" aria-pressed={shown === 'A'} onClick={() => showCompareArm('A')} data-testid="experiment-show-A">
            A
          </button>
          <button class="btn" aria-pressed={shown === 'B'} onClick={() => showCompareArm('B')} data-testid="experiment-show-B">
            B
          </button>
        </div>
        <ExperimentViewport arm="A" title={titles.a} description={`Copy A: ${describeArms(card).a}`} />
        <ExperimentViewport arm="B" title={titles.b} description={`Copy B: ${describeArms(card).b}`} />
        {toast.value ? (
          <div class="toast" role="status" aria-live="polite">
            {toast.value}
          </div>
        ) : null}
      </div>

      <section class="compare-panel xp-panel" aria-labelledby="xp-heading" ref={panel}>
        {status === 'setup' ? <ExperimentSetup card={card} x={x} /> : null}
        {status === 'running' ? <ExperimentRunning card={card} x={x} /> : null}
        {status === 'complete' ? <ExperimentResults card={card} x={x} /> : null}
        {status === 'failed' ? (
          <div class="compare-body">
            <h2 id="xp-heading">The experiment stopped</h2>
            <p>{c.error ?? 'Something went wrong.'} No results are shown because A and B may not have run the same time. Nothing was stamped.</p>
            <button class="btn primary" onClick={() => void closeExperimentRun('dish')} data-testid="experiment-done">
              Close
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Labels({ card }: { card: ExperimentCardView }) {
  const shown = card.labels.filter((l) => !/^Experiment\b/.test(l));
  if (shown.length === 0) return null;
  return (
    <p class="xp-badges">
      {shown.map((l) => (
        <span key={l} class="xp-badge" data-testid="experiment-label">
          {l}
        </span>
      ))}
    </p>
  );
}

function ExperimentSetup({ card, x }: { card: ExperimentCardView; x: ComparisonExperiment }) {
  const c = compareState.value!;
  const info = dishInfo.value!;
  const arms = describeArms(card);
  const schedule = card.change.kind === 'omitScheduled';
  const duration = durationText(x.horizonTicks / 10);
  return (
    <div class="compare-body xp-body">
      <h2 id="xp-heading">{card.title}</h2>
      <Labels card={card} />
      <p class="xp-question">{card.question}</p>
      <h3>The two copies</h3>
      <dl class="xp-arms">
        <dt>A</dt>
        <dd>{arms.a}</dd>
        <dt>B</dt>
        <dd data-testid="experiment-change-B">{arms.b}</dd>
      </dl>
      {c.interventions.length > 0 ? (
        <p class="xp-note" data-testid="experiment-applied-B">
          <strong>Already applied to B:</strong> {describeChanges(info, c.interventions)}.
        </p>
      ) : null}
      <p class="xp-note">
        Both copies start from “{card.recipeName}” with seed {card.seed} and run exactly {duration} from {clock(c.baselineTick)}. B's change is the only recorded difference.
      </p>
      <h3>Predicted tradeoff</h3>
      <p>{card.predictedTradeoff}</p>
      <details class="xp-details">
        <summary>What is measured, and when it counts as observed</summary>
        <ul class="xp-list">
          {card.measurements.map((id) => (
            <li key={id}>{measureLabel(card, id)}</li>
          ))}
        </ul>
        <p>
          <strong>Observation gate:</strong> {card.gate.map((g) => clauseText(card, g)).join('; ')}. When it is reached your Journal gets a stamp; the run goes on to its end.
        </p>
      </details>
      <details class="xp-details">
        <summary>Confounds</summary>
        <p>{card.confounds}</p>
      </details>
      <h3>
        <label for="xp-prediction">Your prediction (optional)</label>
      </h3>
      <textarea
        id="xp-prediction"
        class="compare-note xp-textarea"
        rows={3}
        maxLength={PREDICTION_MAX}
        placeholder="What do you think will be different in B?"
        value={comparePrediction.value}
        onInput={(e) => (comparePrediction.value = e.currentTarget.value)}
        data-testid="experiment-prediction"
      />
      <button class="btn primary compare-go" onClick={() => void runExperimentPair()} data-testid="experiment-run">
        {schedule ? `Accept the schedule and run both for ${duration}` : `Run A and B for ${duration}`}
      </button>
      <p class="xp-note">Closing discards the two copies. The experiment's dish and your saves are never changed by them.</p>
    </div>
  );
}

const SPEEDS: readonly { readonly speed: CompareSpeed; readonly label: string }[] = [
  { speed: 0, label: 'Pause' },
  { speed: 1, label: '1×' },
  { speed: 4, label: '4×' },
  { speed: 'max', label: 'Fast' },
];

function GateList({ card, x }: { card: ExperimentCardView; x: ComparisonExperiment }) {
  const clauses = x.gate?.clauses ?? card.gate.map((g) => ({ ...g, actual: Number.NaN, pass: false }));
  return (
    <ul class="xp-gate" data-testid="experiment-gate">
      {clauses.map((g, i) => (
        <li key={i} data-pass={g.pass}>
          <span class="xp-mark" aria-hidden="true">
            {g.pass ? '✓' : '○'}
          </span>
          <span>
            {clauseText(card, g)} — {Number.isNaN(g.actual) ? 'not measured yet' : `now ${formatMeasure(g.measure, g.actual)}`}
            <span class="sr-only">{g.pass ? ' (holds)' : ' (not yet)'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function ExperimentRunning({ card, x }: { card: ExperimentCardView; x: ComparisonExperiment }) {
  const c = compareState.value!;
  const text = comparePrediction.value.trim();
  return (
    <div class="compare-body xp-body">
      <h2 id="xp-heading">Running A and B</h2>
      <Labels card={card} />
      <p data-testid="experiment-progress" aria-live="off">
        <strong>{clock(c.ticksRun)}</strong> of {clock(x.horizonTicks)} · both copies at the same moment
      </p>
      <progress class="compare-progress" max={x.horizonTicks} value={c.ticksRun} aria-label="Experiment progress" />
      <div class="segmented xp-speeds" role="group" aria-label="Pace (never changes the result)">
        {SPEEDS.map((s) => (
          <button key={String(s.speed)} class="btn" aria-pressed={c.speed === s.speed} onClick={() => setCompareSpeed(s.speed)} data-testid={`experiment-speed-${s.speed}`}>
            {s.label}
          </button>
        ))}
      </div>
      <p class="xp-note">Pace only changes how long you wait. A and B always get the same number of ticks.</p>
      <h3>Observation gate</h3>
      <GateList card={card} x={x} />
      {x.stamp ? (
        <p class="constraint xp-stamped" role="status" data-testid="experiment-stamped">
          Stamped in your Journal at {clock(x.stamp.reachedAtSecond * 10)}. The run goes on.
        </p>
      ) : null}
      <figure class="compare-prediction">
        <figcaption>Your prediction</figcaption>
        <blockquote data-testid="experiment-prediction-shown">{text || 'No prediction written.'}</blockquote>
      </figure>
      <button class="btn compare-go" onClick={() => void stopCompare()} data-testid="experiment-stop">
        Stop early and see results
      </button>
    </div>
  );
}

function ExperimentResults({ card, x }: { card: ExperimentCardView; x: ComparisonExperiment }) {
  const c = compareState.value!;
  const info = dishInfo.value!;
  const r = c.results;
  const m = x.measured;
  const text = comparePrediction.value.trim();
  const reached = x.gate?.reached === true;
  const others = r ? r.rows.filter((row) => row.key !== 'speciesCount' && row.key !== 'speciesBiomass') : [];
  return (
    <div class="compare-body xp-body">
      <h2 id="xp-heading" data-testid="experiment-results-title">
        Results · this paired run
      </h2>
      <Labels card={card} />
      <p class={reached ? 'constraint' : 'xp-note'} data-testid="experiment-gate-result" data-reached={reached}>
        {reached && x.gate?.reachedAtSecond !== null && x.gate?.reachedAtSecond !== undefined
          ? `Observation gate reached at ${clock(x.gate.reachedAtSecond * 10)}. Your Journal has a stamp: “${card.journalStamp}”.`
          : `The observation gate was not reached${r?.stoppedEarly ? ' (stopped early)' : ''}, so nothing was stamped. What did not happen is a result too; the numbers below say what did.`}
      </p>
      <GateList card={card} x={x} />
      <p class="xp-note">
        A and B each ran {clock(c.ticksRun)} from {clock(c.baselineTick)}. These numbers describe this paired run only; another seed or a longer run could turn out differently.
      </p>
      {m ? (
        <div class="compare-table-wrap" tabIndex={0} role="region" aria-label="The card's measurements, A and B">
          <table class="xp-table" data-testid="experiment-table">
            <caption>The card's measurements at the end</caption>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">A</th>
                <th scope="col">B</th>
                <th scope="col">B − A</th>
              </tr>
            </thead>
            <tbody>
              {card.measurements.map((id) => {
                const a = m.A[id];
                const b = m.B[id];
                if (a === undefined || b === undefined) return null;
                return (
                  <tr key={id}>
                    <th scope="row">{measureLabel(card, id)}</th>
                    <td>{formatMeasure(id, a)}</td>
                    <td>{formatMeasure(id, b)}</td>
                    <td>{formatDiff(id, a, b)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {others.length > 0 ? (
        <details class="xp-details">
          <summary>Whole-dish measures</summary>
          <div class="compare-table-wrap" tabIndex={0} role="region" aria-label="Whole-dish measures, A and B">
            <table class="xp-table">
              <caption>Whole dish at the end of this paired run</caption>
              <thead>
                <tr>
                  <th scope="col">Measure</th>
                  <th scope="col">A</th>
                  <th scope="col">B</th>
                  <th scope="col">B − A</th>
                </tr>
              </thead>
              <tbody>
                {others.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{rowLabel(row, info)}</th>
                    <td>{fmt(row.a, row.key)}</td>
                    <td>{fmt(row.b, row.key)}</td>
                    <td>{fmtDiff(row.diff, row.key)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
      <figure class="compare-prediction">
        <figcaption>Your prediction</figcaption>
        <blockquote>{text || 'No prediction written.'}</blockquote>
      </figure>
      <fieldset class="compare-conclusion">
        <legend>Your conclusion</legend>
        <div class="compare-conclusions" role="radiogroup" aria-label="Your conclusion">
          {CONCLUSIONS.map((k) => (
            <button key={k.id} class="btn" role="radio" aria-checked={compareConclusion.value === k.id} onClick={() => setExperimentConclusion(k.id)}>
              {k.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div class="compare-final-actions">
        <button class="btn primary" onClick={() => void closeExperimentRun('journal')} data-testid="experiment-open-journal">
          Open Journal
        </button>
        <button class="btn" onClick={() => void closeExperimentRun('dish')} data-testid="experiment-done">
          Go to the dish
        </button>
      </div>
    </div>
  );
}
