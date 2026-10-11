/**
 * The region probes sheet (P4.8; SPEC §12.8; D02 §20 and line 638): each region's living count by
 * species, biomass, food and gas means per cell, and what drifted across its edge in the window (only
 * for pools the dish's environment stage moves without adding or removing). An overlap warning names
 * every pair that shares a cell. Readings are the worker's measurement of the world, read only; regions
 * are session state and reset on reload.
 */
import { useEffect } from 'preact/hooks';
import { IconClose } from '../icons';
import { dishInfo, sheet } from '../state';
import { MEAN_NAMES, OBSERVE_TEXT, amount } from '../strings/observe';
import { clockText } from './TraitData';
import {
  boundaryText,
  deleteProbe,
  probeMasks,
  probeReadings,
  probeWindow,
  refreshProbes,
  speciesName,
} from '../observe';
import { WindowChoice } from './RelationshipMap';
import { ShapeIcon, startProbeSession } from './ProbeSession';
import { labTray } from '../views/LabView';

const REFRESH_MS = 1000;

export function ProbeSheet() {
  const info = dishInfo.value;
  const w = probeWindow.value;
  useEffect(() => {
    void refreshProbes();
    const t = setInterval(() => void refreshProbes(), REFRESH_MS);
    return () => clearInterval(t);
  }, [w, info?.dishId]);
  if (!info) return null;
  const names = { speciesIds: info.speciesIds, speciesNames: info.speciesNames };
  const readings = probeReadings.value;
  const masks = probeMasks.value;
  const shown = readings && readings.windowSeconds === w ? readings : null;
  return (
    <section class="sheet probe-sheet" aria-labelledby="probe-title" data-testid="probe-sheet">
      <div class="sheet-scroll">
        <header>
          <h2 id="probe-title">{OBSERVE_TEXT.probesTitle}</h2>
          <button
            class="btn ghost"
            aria-label={OBSERVE_TEXT.close2}
            onClick={() => (sheet.value = 'none')}
            data-testid="probe-close"
          >
            <IconClose />
          </button>
        </header>
        <p class="sub">{OBSERVE_TEXT.probesIntro}</p>
        <p class="sub" data-testid="probe-not-saved">
          {OBSERVE_TEXT.notSaved}
        </p>
        <WindowChoice
          name="probe-window"
          value={w}
          onChange={(v) => (probeWindow.value = v)}
          testid="probe-window"
        />
        {shown && shown.overlaps.length > 0 ? (
          <div class="probe-overlap" role="note" data-testid="probe-overlap">
            {shown.overlaps.map(([a, b]) => (
              <p key={`${a}${b}`}>{OBSERVE_TEXT.overlap(a, b)}</p>
            ))}
          </div>
        ) : null}
        {masks.length === 0 ? <p data-testid="probe-none">{OBSERVE_TEXT.none}</p> : null}
        <ul class="probe-list" aria-label={OBSERVE_TEXT.probesTitle} data-testid="probe-list">
          {(shown?.masks ?? []).map((r) => (
            <li key={r.id} class="probe-region" data-testid={`probe-region-${r.id}`}>
              <div class="probe-region-head">
                <h3>
                  <ShapeIcon shape={r.shape} /> {OBSERVE_TEXT.regionHeading(r.id, r.shape, r.cellCount)}
                </h3>
                <button
                  class="btn"
                  aria-label={OBSERVE_TEXT.deleteRegion(r.id)}
                  onClick={() => void deleteProbe(r.id)}
                  data-testid={`probe-delete-${r.id}`}
                >
                  {OBSERVE_TEXT.delete}
                </button>
              </div>
              <p data-testid={`probe-living-${r.id}`}>
                {r.total === 0
                  ? OBSERVE_TEXT.nobody
                  : `${OBSERVE_TEXT.living(r.total)} (${r.population.map((p) => `${speciesName(names, p.species)} ${p.count}`).join(', ')})`}
              </p>
              <p>{OBSERVE_TEXT.biomass(amount(r.biomass))}</p>
              <table class="probe-table">
                <caption>{OBSERVE_TEXT.meansTitle}</caption>
                <tbody>
                  {r.means
                    .filter((m) => m.mean !== null)
                    .map((m) => (
                      <tr key={m.field}>
                        <th scope="row">{MEAN_NAMES[m.field] ?? m.field}</th>
                        <td>{amount(m.mean!)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <table class="probe-table" data-testid={`probe-boundary-${r.id}`}>
                <caption>{OBSERVE_TEXT.boundaryTitle(w)}</caption>
                <tbody>
                  {r.boundary
                    .filter((b) => b.status !== 'absent')
                    .map((b) => (
                      <tr key={b.field}>
                        <th scope="row">{MEAN_NAMES[b.field] ?? b.field}</th>
                        <td>{boundaryText(b.status, b.into)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {r.recordedSinceSecond !== null ? (
                <p class="sub">{OBSERVE_TEXT.recordedSince(clockText(r.recordedSinceSecond))}</p>
              ) : null}
            </li>
          ))}
        </ul>
        {masks.length > 0 ? <p class="sub">{OBSERVE_TEXT.notMeasuredWhy}</p> : null}
        <button
          class="btn"
          onClick={() => {
            sheet.value = 'none';
            labTray.value = null;
            startProbeSession();
          }}
          data-testid="probe-draw"
        >
          {OBSERVE_TEXT.drawAnother}
        </button>
        <p class="sub">{OBSERVE_TEXT.fictional}</p>
      </div>
    </section>
  );
}
