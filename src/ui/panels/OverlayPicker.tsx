/**
 * Overlay picker (SPEC §10.8, UX §4.4 Observe): one environmental overlay at a time, with a legend
 * and adjustable opacity (the same stored setting as Settings → overlay opacity, 45 % default).
 * Overlays only change what the worker packs into snapshots; they never modify the simulation or
 * consume randomness.
 */
import type { OverlayId } from '@worker/protocol';
import { dishInfo, setOverlay, settings, updateSettings } from '../state';
import { LAB_TEXT, OVERLAYS } from '../strings/lab';
import { labOverlay } from '../views/LabView';
import { OverlayLegend } from './OverlayLegend';

/** Opacity range offered: the same as Settings → overlay opacity (SPEC §10.8 default 45 %). */
export const OPACITY_MIN = 0.2;
export const OPACITY_MAX = 0.9;
export const OPACITY_STEP = 0.05;

/** Overlays this dish can show: fields it allocates, plus light (always derived). */
export function availableOverlays(): typeof OVERLAYS {
  const fields = dishInfo.value?.fieldIds;
  return OVERLAYS.filter((o) => o.id === 'light' || !fields || fields.includes(o.id));
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
    </div>
  );
}
