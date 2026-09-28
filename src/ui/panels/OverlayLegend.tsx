/**
 * Overlay legend (SPEC §10.8, UX §4.4): the active overlay's name, its colour ramp from low to high
 * with the measured range (0 to the largest value in the dish now), and its unit. Read from the
 * snapshot; drawing it never touches the simulation.
 */
import { legendStops } from '@render/layers';
import { overlay, overlayMax } from '../state';
import { LAB_TEXT, overlayCopy } from '../strings/lab';

export function formatOverlayValue(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  if (v >= 10) return v.toFixed(0);
  if (v >= 1) return v.toFixed(1);
  if (v >= 0.01) return v.toFixed(2);
  return v.toExponential(1);
}

export function OverlayLegend({ floating = false }: { floating?: boolean }) {
  const id = overlay.value;
  if (!id) return null;
  const copy = overlayCopy(id);
  const [lo, mid, hi] = legendStops(id);
  return (
    <div class={`overlay-legend${floating ? ' floating' : ''}`} role="group" aria-label={`${copy.name} overlay legend`} data-testid={floating ? 'overlay-legend' : undefined}>
      <span class="ol-name">{copy.name}</span>
      <span class="ol-scale">
        <span class="ol-end">
          <span class="sr-only">{LAB_TEXT.legendLow} </span>0
        </span>
        <span class="ol-ramp" aria-hidden="true" style={{ background: `linear-gradient(to right, ${lo}, ${mid}, ${hi})` }} />
        <span class="ol-end">
          <span class="sr-only">{LAB_TEXT.legendHigh} </span>
          {formatOverlayValue(overlayMax.value)}
        </span>
      </span>
      <span class="ol-unit">{copy.unit}</span>
    </div>
  );
}
