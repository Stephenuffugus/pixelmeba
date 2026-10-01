/**
 * Overlay picker (SPEC §10.8, UX §4.4 Observe): one environmental overlay at a time, with a legend
 * and adjustable opacity (the same stored setting as Settings → overlay opacity, 45 % default), and
 * in a dish with viruses a separate Infection markers toggle (the glyph on every infected organism).
 * Overlays only change what the worker packs into snapshots; they never modify the simulation or
 * consume randomness.
 */
import type { OverlayId } from '@worker/protocol';
import { dishInfo, infectionMarkers, setInfectionMarkers, setOverlay, settings, updateSettings } from '../state';
import { LAB_TEXT, OVERLAYS } from '../strings/lab';
import { labOverlay } from '../views/LabView';
import { OverlayLegend } from './OverlayLegend';

/** Opacity range offered: the same as Settings → overlay opacity (SPEC §10.8 default 45 %). */
export const OPACITY_MIN = 0.2;
export const OPACITY_MAX = 0.9;
export const OPACITY_STEP = 0.05;

/** Overlays this dish can show: fields it allocates, plus light and food access (always derived; P3.6). */
export function availableOverlays(): typeof OVERLAYS {
  const fields = dishInfo.value?.fieldIds;
  return OVERLAYS.filter((o) => o.id === 'light' || o.id === 'foodAccess' || !fields || fields.includes(o.id));
}

/** Viral unit fields (Phase 3 Pinphage): a dish holding one offers the Infection markers toggle. */
const VIRAL_FIELDS: readonly string[] = ['v01'];

/** Whether this dish can have infected organisms to mark (it allocates a viral field). */
export function infectionMarkersOffered(): boolean {
  const fields = dishInfo.value?.fieldIds;
  return !!fields && fields.some((f) => VIRAL_FIELDS.includes(f));
}

/** Choose the Lab overlay (null = none). A view request only. */
export function chooseOverlay(id: OverlayId | null): void {
  labOverlay.value = id;
  setOverlay(id);
}

export function OverlayPicker() {
  const current = labOverlay.value;
  const opacity = settings.value.overlayOpacity;
  const list = availableOverlays();
  const choices: { id: string | null; name: string }[] = [
    { id: null, name: LAB_TEXT.overlayNone },
    ...list.map((o) => ({ id: o.id, name: o.copy.name })),
  ];
  return (
    <div class="overlay-picker">
      <div class="lab-items" role="radiogroup" aria-label="Overlay (one at a time)">
        {choices.map((o) => (
          <button
            key={o.id ?? 'none'}
            class="btn lab-item"
            role="radio"
            aria-checked={current === o.id}
            data-testid={`overlay-${o.id ?? 'none'}`}
            onClick={() => chooseOverlay(o.id as OverlayId | null)}
          >
            {o.name}
          </button>
        ))}
      </div>
      <label class="overlay-opacity">
        <span>
          {LAB_TEXT.opacity}{' '}
          <strong data-testid="overlay-opacity-value">{Math.round(opacity * 100)} %</strong>
        </span>
        <input
          type="range"
          min={OPACITY_MIN}
          max={OPACITY_MAX}
          step={OPACITY_STEP}
          value={opacity}
          aria-valuetext={`${Math.round(opacity * 100)} percent`}
          data-testid="overlay-opacity"
          onInput={(e) => updateSettings({ overlayOpacity: Number(e.currentTarget.value) })}
        />
      </label>
      {current ? <OverlayLegend /> : <p class="lab-sub">{LAB_TEXT.noOverlay}</p>}
      {infectionMarkersOffered() ? (
        // SPEC §10.8: a separate toggle, independent of the one-at-a-time overlay; drawing only.
        <button
          type="button"
          class="btn lab-item"
          aria-pressed={infectionMarkers.value}
          aria-describedby="infection-markers-hint"
          data-testid="infection-markers"
          onClick={() => setInfectionMarkers(!infectionMarkers.value)}
        >
          {LAB_TEXT.infectionMarkers}
        </button>
      ) : null}
      {infectionMarkersOffered() ? (
        <p class="lab-sub" id="infection-markers-hint">
          {LAB_TEXT.infectionMarkersHint}
        </p>
      ) : null}
    </div>
  );
}
