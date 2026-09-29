/**
 * Comparison setup and progress (UX §5.6): baseline shown, one change queued on B through the
 * ordinary Feed / Add Life tools, horizon 60/180/600 s or Stop, an optional prediction note; then the
 * run, with pacing controls that never change how many ticks A and B receive.
 */
import type { CompareSpeed } from '@worker/comparison';
import { IconFood, IconLife } from '../icons';
import {
  clearCompareChange,
  COMPARE_HORIZONS,
  compareHorizon,
  comparePrediction,
  compareState,
  dishInfo,
  runCompare,
  setCompareSpeed,
  sheet,
  stopCompare,
  tool,
} from '../state';
import { clock, describeChanges, horizonLabel } from './CompareText';
import { worldModesLine } from '../strings/modes';

export const PREDICTION_MAX = 280;

export function CompareSetup() {
  const c = compareState.value;
  const info = dishInfo.value;
  if (!c || !info) return null;
  const queued = c.interventions.length > 0;
  const placing = tool.value.kind !== 'look';
  const h = compareHorizon.value;
  return (
    <div class="compare-body">
      <h2 id="compare-heading">Compare two copies</h2>
      <p class="sub" data-testid="compare-baseline">
        A and B are exact copies of “{info.name}” at {clock(c.baselineTick)}. A stays as it is. Change one thing on B, then both run for exactly the same time.
      </p>
      {/* P2.2: mode labels wherever a world is described (UX §3.3); both copies share them. */}
      <p class="world-modes" data-testid="compare-world-modes">
        Both copies: {worldModesLine(info.mutationPreset, info.founderMode, info.registry)}
      </p>

      <h3>1 · Change one thing on B</h3>
      {queued ? (
        <div class="constraint" data-testid="compare-change">
          <p style={{ margin: 0 }}>
            <strong>Queued on B:</strong> {describeChanges(info, c.interventions)}
          </p>
          <button class="btn" style={{ marginTop: '0.5rem' }} onClick={() => void clearCompareChange()} data-testid="compare-clear">
            Clear change
          </button>
        </div>
      ) : (
        <>
          <div class="compare-change-actions">
            <button class="btn" aria-pressed={sheet.value === 'feed' || tool.value.kind === 'feed'} onClick={() => (sheet.value = sheet.value === 'feed' ? 'none' : 'feed')} data-testid="compare-feed">
              <IconFood /> Feed
            </button>
            <button class="btn" aria-pressed={sheet.value === 'addLife' || tool.value.kind === 'addLife'} onClick={() => (sheet.value = sheet.value === 'addLife' ? 'none' : 'addLife')} data-testid="compare-addlife">
              <IconLife /> Add Life
            </button>
          </div>
          <p class={placing ? 'constraint' : 'sub'} role="status">
            {placing ? 'Now tap dish B to place it.' : 'Nothing is queued yet: A and B are identical.'}
          </p>
        </>
      )}

      <h3 id="compare-horizon-label">2 · How long?</h3>
      <div class="segmented compare-horizons" role="radiogroup" aria-labelledby="compare-horizon-label">
        {COMPARE_HORIZONS.map((s) => (
          <button key={String(s)} class="btn" role="radio" aria-checked={h === s} onClick={() => (compareHorizon.value = s)} data-testid={`compare-horizon-${s ?? 'stop'}`}>
            {horizonLabel(s)}
          </button>
        ))}
      </div>

      <h3>
        <label for="compare-prediction">3 · Your prediction (optional)</label>
      </h3>
      <textarea
        id="compare-prediction"
        class="compare-note"
        rows={3}
        maxLength={PREDICTION_MAX}
        placeholder="What do you think will be different in B?"
        value={comparePrediction.value}
        onInput={(e) => (comparePrediction.value = e.currentTarget.value)}
        data-testid="compare-prediction"
      />

      <button class="btn primary compare-go" disabled={!queued} onClick={() => void runCompare()} data-testid="compare-run">
        {queued ? (h === null ? 'Run A and B until I stop' : `Run A and B for ${horizonLabel(h)}`) : 'Queue a change on B first'}
      </button>
      <p class="sub">Closing a comparison discards its two copies. Your dish and your saves are never changed by it.</p>
    </div>
  );
}

const SPEEDS: readonly { readonly speed: CompareSpeed; readonly label: string }[] = [
  { speed: 0, label: 'Pause' },
  { speed: 1, label: '1×' },
  { speed: 4, label: '4×' },
  { speed: 'max', label: 'Fast' },
];

export function CompareRunning() {
  const c = compareState.value;
  const info = dishInfo.value;
  if (!c || !info) return null;
  const done = c.ticksRun;
  const total = c.horizonTicks;
  return (
    <div class="compare-body">
      <h2 id="compare-heading">Running A and B</h2>
      <p data-testid="compare-progress" aria-live="off">
        <strong>{clock(done)}</strong>
        {total !== null ? ` of ${clock(total)}` : ''} · both copies at the same moment
      </p>
      {total !== null ? <progress class="compare-progress" max={total} value={done} aria-label="Comparison progress" /> : null}
      <div class="segmented" role="group" aria-label="Pace (never changes the result)">
        {SPEEDS.map((s) => (
          <button key={String(s.speed)} class="btn" aria-pressed={c.speed === s.speed} onClick={() => setCompareSpeed(s.speed)} data-testid={`compare-speed-${s.speed}`}>
            {s.label}
          </button>
        ))}
      </div>
      <p class="sub">Pace only changes how long you wait. A and B always get the same number of ticks.</p>
      <p>
        <strong>Change on B:</strong> {describeChanges(info, c.interventions)}
      </p>
      <PredictionNote />
      <button class="btn compare-go" onClick={() => void stopCompare()} data-testid="compare-stop">
        {total === null ? 'Stop and see results' : 'Stop early and see results'}
      </button>
    </div>
  );
}

export function PredictionNote() {
  const text = comparePrediction.value.trim();
  return (
    <figure class="compare-prediction">
      <figcaption>Your prediction</figcaption>
      <blockquote data-testid="compare-prediction-shown">{text || 'No prediction written.'}</blockquote>
    </figure>
  );
}
