/**
 * The sample panel (UX §4.4, §5.11; SPEC §10.5; P3.5; D-0037): shown over the dish in both views while
 * sampling or while a sample is held. It names what a tap would take (the worker's preview, with the
 * whole-unit partners outside the circle), and offers Take / Cancel; with a sample held, Transfer
 * (Complete) / Cancel / Discard — also right after a reload, without running time. Every number is the
 * worker's measurement of the world (fictional game units).
 */
import { useEffect } from 'preact/hooks';
import { dishInfo } from '../state';
import { heldLine, SAMPLE_MODE_LABELS, TOOLS_COPY, units } from '../strings/tools';
import { isLab, setDishView } from '../views/LabView';
import {
  cancelSampling,
  confirmSample,
  discardSample,
  endSession,
  heldSample,
  labSession,
  replaceSample,
  sampleConfirm,
  samplePreview,
  watchSample,
} from './SampleSession';

function Confirm({ text, yes, onYes }: { text: string; yes: string; onYes: () => void }) {
  return (
    <section class="sample-panel" role="alertdialog" aria-labelledby="sample-confirm-text" data-testid="sample-confirm">
      <p id="sample-confirm-text">{text}</p>
      <div class="sample-actions">
        <button class="btn primary" onClick={onYes} data-testid="sample-confirm-yes">
          {yes}
        </button>
        <button class="btn" onClick={() => (sampleConfirm.value = null)} data-testid="sample-confirm-no">
          Keep it
        </button>
      </div>
    </section>
  );
}

export function SamplePanel() {
  const info = dishInfo.value;
  const dishId = info?.dishId ?? null;
  useEffect(() => watchSample(dishId), [dishId]);
  if (!info) return null;
  const held = heldSample.value;
  const session = labSession.value;
  const confirm = sampleConfirm.value;
  if (confirm === 'replace') return <Confirm text={TOOLS_COPY.replaceConfirm} yes="Replace" onYes={() => void replaceSample()} />;
  if (confirm === 'discard') return <Confirm text={TOOLS_COPY.discardConfirm} yes={TOOLS_COPY.discard} onYes={() => void discardSample()} />;
  const nameOf = (id: string) => info.speciesNames[info.speciesIds.indexOf(id)] ?? id;

  if (session === 'sample') {
    const p = samplePreview.value;
    if (!p) {
      return (
        <section class="sample-panel" aria-label={TOOLS_COPY.previewTitle} data-testid="sample-panel" data-state="aim">
          <p role="status">{TOOLS_COPY.aimHint}</p>
          <div class="sample-actions">
            <button class="btn" onClick={() => void cancelSampling()} data-testid="sample-stop">
              {TOOLS_COPY.cancelSampling}
            </button>
          </div>
        </section>
      );
    }
    const v = p.preview;
    const blocked = v.missing.length > 0;
    const empty = v.organisms === 0 && v.objects === 0 && v.c === 0 && v.n === 0 && v.m === 0;
    return (
      <section class="sample-panel" aria-labelledby="sample-preview-title" data-testid="sample-panel" data-state="preview">
        <h2 id="sample-preview-title">
          {TOOLS_COPY.previewTitle}: {SAMPLE_MODE_LABELS[v.mode]}, radius {v.radius}
        </h2>
        <p role="status" data-testid="sample-preview-line">
          {v.organisms} organism{v.organisms === 1 ? '' : 's'}
          {v.objects > 0 ? `, ${v.objects} food object${v.objects === 1 ? '' : 's'}` : ''} · carbon {units(v.c)} · nutrient {units(v.n)} · mineral {units(v.m)}
        </p>
        {blocked ? (
          <div class="sample-missing" data-testid="sample-missing">
            <p>{TOOLS_COPY.missing}</p>
            <ul>
              {v.missing.map((m) => (
                <li key={m.birthId}>
                  {nameOf(m.speciesId)} #{m.birthId} at ({m.cell[0]}, {m.cell[1]})
                </li>
              ))}
            </ul>
          </div>
        ) : empty ? (
          <p>{TOOLS_COPY.nothing}</p>
        ) : null}
        <div class="sample-actions">
          <button class="btn primary" disabled={blocked || empty} onClick={() => void confirmSample()} data-testid="sample-take">
            {TOOLS_COPY.confirm}
          </button>
          <button class="btn" onClick={() => void cancelSampling()} data-testid="sample-cancel-preview">
            {TOOLS_COPY.cancel}
          </button>
        </div>
      </section>
    );
  }

  if (!held) return null;
  return (
    <section class="sample-panel" aria-labelledby="sample-held-title" data-testid="sample-panel" data-state={session === 'transfer' ? 'transfer' : 'held'}>
      <h2 id="sample-held-title">
        {TOOLS_COPY.heldTitle}: {SAMPLE_MODE_LABELS[held.mode]}, radius {held.radius}
      </h2>
      <p data-testid="sample-held-line">{heldLine(held)}</p>
      <p role="status">{session === 'transfer' ? TOOLS_COPY.transferHint : TOOLS_COPY.heldHint}</p>
      <div class="sample-actions">
        {session === 'transfer' ? (
          <button class="btn" onClick={() => endSession()} data-testid="sample-transfer-back">
            Back
          </button>
        ) : (
          <button
            class="btn primary"
            onClick={() => {
              if (!isLab()) setDishView('lab');
              labSession.value = 'transfer';
            }}
            data-testid="sample-transfer"
          >
            {TOOLS_COPY.transfer}
          </button>
        )}
        <button class="btn" onClick={() => void cancelSampling()} data-testid="sample-cancel">
          {TOOLS_COPY.cancel}
        </button>
        <button class="btn" onClick={() => (sampleConfirm.value = 'discard')} data-testid="sample-discard">
          {TOOLS_COPY.discard}
        </button>
      </div>
    </section>
  );
}
