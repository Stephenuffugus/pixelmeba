/**
 * The cell inspector's Phase 5 lines (P5.1/P5.2; SPEC §4.4 "the inspector shows every factor", §4.7, §4.8,
 * §12.1; UX §5.1–§5.2): climate (warmth, moisture), every light factor, each edge barrier on the cell's four
 * sides with "Show gate", and the furnishing or device with "Settings". Every number is the worker's
 * CellInspect payload (snapshot.ts climateLines, cellEdgeLines, cellDeviceLine); the UI only formats it.
 * Each key is absent on a v1.0 dish, so these lines never appear there.
 */
import type { CellInspect } from '@worker/protocol';
import { dishView } from '../views/LabView';
import {
  DEVICE_COPY,
  deviceLineText,
  edgeLineText,
  lightFactorText,
  moistureText,
  warmthText,
} from '../strings/structures';
import { openDeviceSheet } from '../panels/DeviceSheet';
import { openGateSheet } from '../panels/GateSheet';

/** Warmth and moisture (only in a dish that records 'climate'). */
export function CellClimateLines({ cell }: { cell: CellInspect }) {
  const c = cell.climate;
  if (!c) return null;
  return (
    <>
      <dt>Warmth</dt>
      <dd data-testid="cell-warmth">{warmthText(c)}</dd>
      <dt>Moisture</dt>
      <dd data-testid="cell-moisture">{moistureText(c)}</dd>
    </>
  );
}

/** The light line's text: every factor in Lab, the phase in plain words in Explore; null without factors. */
export function cellLightFactors(cell: CellInspect): string | null {
  const f = cell.lightFactors;
  if (!f) return null;
  return lightFactorText(dishView.value, cell.light, cell.lightBase, cell.shade, f);
}

/** Edge barriers and the furnishing or device, each with its sheet (reachable in Tab order). */
export function CellStructureLines({ cell }: { cell: CellInspect }) {
  const edges = cell.edges ?? [];
  const d = cell.device;
  if (edges.length === 0 && !d) return null;
  return (
    <>
      {edges.map((e) => (
        <div class="cell-structure-line" key={e.id} data-testid={`cell-edge-${e.side}`}>
          <span>{edgeLineText(e)}</span>
          <button
            class="btn"
            onClick={() => openGateSheet(e.id)}
            aria-label={`${DEVICE_COPY.showGate}: ${edgeLineText(e)}`}
            data-testid={`cell-edge-${e.side}-gate`}
          >
            {DEVICE_COPY.showGate}
          </button>
        </div>
      ))}
      {d ? (
        <div class="cell-structure-line" data-testid="cell-device">
          <span>{deviceLineText(d)}</span>
          <button
            class="btn"
            onClick={() => openDeviceSheet()}
            aria-label={`${DEVICE_COPY.settings}: ${deviceLineText(d)}`}
            data-testid="cell-device-settings"
          >
            {DEVICE_COPY.settings}
          </button>
        </div>
      ) : null}
    </>
  );
}
