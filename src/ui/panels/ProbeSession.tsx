/**
 * Drawing region probes (P4.8; UX §4.2 "one gesture = one command": here one drag = one region, and a
 * region is session state, never a command). Observe → Regions starts the session: the Lab's one-finger
 * drag draws instead of panning (two fingers still pan and cancel the drag), Rectangle / Circle picks
 * the shape, and Done or Escape ends it. The outlines on the dish come from these masks only (the
 * renderer's drawProbes), never from the world.
 */
import { useEffect } from 'preact/hooks';
import { dishInfo, getRenderer, sheet, showToast } from '../state';
import { OBSERVE_TEXT } from '../strings/observe';
import {
  addProbe,
  maskFromDrag,
  nextProbeId,
  probeDraft,
  probeDrawing,
  probeMasks,
  probeShape,
  probesShowDish,
} from '../observe';

let dragEpoch: number | null = null;

/** Start drawing regions (closes the tray so the dish is in view). */
export function startProbeSession(): void {
  probeDrawing.value = true;
  probeDraft.value = null;
}

export function endProbeSession(): void {
  probeDrawing.value = false;
  probeDraft.value = null;
  dragEpoch = null;
}

/** The Lab's drag began while drawing regions. */
export function probeStrokeStart(w: readonly [number, number], epoch: number): void {
  dragEpoch = epoch;
  const id = nextProbeId(probeMasks.value);
  probeDraft.value = id === null ? null : maskFromDrag(probeShape.value, id, w, w);
}

export function probeStrokeMove(points: ReadonlyArray<readonly [number, number]>, epoch: number): void {
  if (dragEpoch !== epoch || points.length === 0) return;
  const id = nextProbeId(probeMasks.value);
  if (id === null) return;
  probeDraft.value = maskFromDrag(probeShape.value, id, points[0]!, points[points.length - 1]!);
}

export function probeStrokeCancel(): void {
  dragEpoch = null;
  probeDraft.value = null;
}

/** The drag ended: one region (a drag started in another view or before a cancel draws nothing). */
export function probeStrokeEnd(points: ReadonlyArray<readonly [number, number]>, epoch: number): void {
  const started = dragEpoch;
  dragEpoch = null;
  probeDraft.value = null;
  if (started !== epoch || points.length === 0) return;
  void addProbe(probeShape.value, points[0]!, points[points.length - 1]!);
}

/** A tap while drawing: nothing is drawn (one drag = one region). */
export function probeTap(): void {
  showToast(OBSERVE_TEXT.tapHint, 3000);
}

/** Keeps the dish's outlines in step with the masks (Lab only; mounted by the Lab tray host). */
export function ProbeOutlines() {
  const dishId = dishInfo.value?.dishId ?? null;
  useEffect(() => probesShowDish(dishId), [dishId]);
  const masks = probeMasks.value;
  const draft = probeDraft.value;
  useEffect(() => {
    getRenderer()?.setProbes(masks, draft);
  }, [masks, draft]);
  useEffect(() => () => getRenderer()?.setProbes([], null), []);
  return null;
}

/** The session bar over the dish while drawing. */
export function ProbeSessionPanel() {
  if (!probeDrawing.value) return null;
  const n = probeMasks.value.length;
  const shape = probeShape.value;
  return (
    <section
      class="sample-panel probe-session"
      aria-labelledby="probe-session-title"
      data-testid="probe-session"
    >
      <h2 id="probe-session-title" class="probe-session-title">
        {OBSERVE_TEXT.drawTitle}
      </h2>
      <p>{OBSERVE_TEXT.drawHint}</p>
      <div class="segmented" role="group" aria-label={OBSERVE_TEXT.shapeGroup}>
        {(['rect', 'circle'] as const).map((s) => (
          <button
            key={s}
            class="btn"
            aria-pressed={shape === s}
            onClick={() => (probeShape.value = s)}
            data-testid={`probe-shape-${s}`}
          >
            <ShapeIcon shape={s} /> {s === 'rect' ? OBSERVE_TEXT.rectangle : OBSERVE_TEXT.circle}
          </button>
        ))}
      </div>
      <div class="probe-session-row">
        <span role="status" data-testid="probe-count">
          {OBSERVE_TEXT.count(n)}
        </span>
        <button
          class="btn"
          onClick={() => {
            endProbeSession();
            sheet.value = 'probes';
          }}
          data-testid="probe-show"
        >
          {OBSERVE_TEXT.showReadings}
        </button>
        <button class="btn primary" onClick={endProbeSession} data-testid="probe-done">
          {OBSERVE_TEXT.done}
        </button>
      </div>
    </section>
  );
}

export function ShapeIcon({ shape }: { shape: 'rect' | 'circle' }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-dasharray="3 2"
    >
      {shape === 'rect' ? <rect x="3" y="4" width="14" height="12" /> : <circle cx="10" cy="10" r="7" />}
    </svg>
  );
}
