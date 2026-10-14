/**
 * The gate inspector (P5.2; SPEC §4.9's last line "a gate preview tracer (paused, no simulation)"; CT §5.3;
 * UX §5.2, §9 "table alternatives"; D-0119). Opened from a cell inspector edge line ("Show gate"). It shows:
 * - a real table with a caption: Dissolved, Activity and Viral with their diffusion factor in %, and Small,
 *   Medium, Large and Fixed with Passes / Blocked, all from barriers.ts edgeFactor / edgePermits for the
 *   edge's current code (strings/structures.ts gateRows), plus the record's rules text;
 * - for a one-way channel, the directed transfer in words;
 * - the measured totals from CellInspect edges[].tally (world.gateTally, observation only), honestly worded;
 * - a shutter's Open / Close (setDevice { id, open });
 * - the tracer: while this sheet is open AND the dish is paused, renderer.setGatePreview({ cell, dir }),
 *   cleared on close, on Run and on dish change. It moves nothing and sends no command.
 */
import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { EDGE_SHUTTER_CLOSED } from '@sim/barriers';
import { IconClose } from '../icons';
import { dishInfo, getRenderer, inspector, meta, selection, sheet } from '../state';
import { sendLabCommand } from '../views/LabView';
import { overlayCopy } from '../strings/lab';
import { structureNameById, structureRecordById } from './LabTrayNames';
import {
  channelLine,
  edgeLineText,
  edgeRefOf,
  GATE_COPY,
  gateRows,
  gateStateText,
  gateTotalsText,
  RESIN_TARGET_WORDS,
} from '../strings/structures';

/** The edge barrier (its id) the gate sheet describes. */
export const gateEdgeId = signal<number | null>(null);

/** Open the gate inspector for the inspected cell's edge barrier `id`. */
export function openGateSheet(id: number): void {
  gateEdgeId.value = id;
  sheet.value = 'gate';
}

function back(): void {
  getRenderer()?.setGatePreview(null);
  sheet.value = 'inspect';
}

/** Words for a field a gate total names ("sugar", "oxygen", a virus by its species name). */
export function tallyFieldName(id: string): string {
  const info = dishInfo.value;
  if (id === 'v01' || id === 'v02') {
    const i = info?.speciesIds.indexOf(id.toUpperCase()) ?? -1;
    return i >= 0 ? `${info!.speciesNames[i]} units` : 'virus units';
  }
  if (RESIN_TARGET_WORDS[id]) return RESIN_TARGET_WORDS[id];
  const extra: Record<string, string> = {
    sugarN: 'nutrient with sugar',
    brothN: 'nutrient with broth',
    broth: 'broth',
    nutrient: 'mineral nutrient',
    acid: 'acid',
    base: 'base',
    buffer: 'buffer',
    silicate: 'silicate',
    eOil: 'oil enzyme',
    eProtein: 'protein enzyme',
    breaker: 'enzyme breaker',
    sGlow: 'glow signal',
    quencher: 'quencher',
  };
  if (extra[id]) return extra[id];
  const name = overlayCopy(id).name;
  return name === id ? 'other material' : name.toLowerCase();
}

export function GateSheet() {
  const p = inspector.value;
  const cell = p?.kind === 'cell' ? p.cell : undefined;
  const sel = selection.value;
  const cellIndex = sel?.kind === 'cell' ? sel.cell : -1;
  const e = cell?.edges?.find((x) => x.id === gateEdgeId.value) ?? null;
  const paused = (meta.value?.speed ?? 0) === 0;
  const dishId = dishInfo.value?.dishId ?? null;
  const ref = e && cellIndex >= 0 ? edgeRefOf(cellIndex, e) : null;
  const refKey = ref ? `${ref[0]}${ref[1]}` : '';

  // The tracer: only while this sheet is open and the dish is paused; cleared on close, Run and dish change.
  useEffect(() => {
    const r = getRenderer();
    r?.setGatePreview(paused && ref ? { cell: ref[0], dir: ref[1] } : null);
    return () => getRenderer()?.setGatePreview(null);
  }, [paused, refKey, dishId]);

  const name = e ? structureNameById(e.kind) : '';
  const rec = e ? structureRecordById(e.kind) : null;
  const rows = e ? gateRows(e.code) : null;
  return (
    <section class="sheet" aria-labelledby="gate-sheet-title" data-testid="gate-sheet">
      <div class="sheet-scroll">
        <header>
          <h2 id="gate-sheet-title">{e ? GATE_COPY.title(name) : name || 'Gate'}</h2>
          <button class="btn ghost" aria-label="Close" onClick={back} data-testid="gate-sheet-close">
            <IconClose />
          </button>
        </header>
        {!e || !rows ? (
          <p data-testid="gate-gone">This edge has no barrier now.</p>
        ) : (
          <>
            <p data-testid="gate-line">{edgeLineText(e)}.</p>
            {gateStateText(e.code) ? <p data-testid="gate-state">{gateStateText(e.code)}</p> : null}
            <div class="gate-table-wrap">
              <table class="gate-table" data-testid="gate-table">
                <caption>{GATE_COPY.caption(name)}</caption>
                <thead>
                  <tr>
                    <th scope="col">{GATE_COPY.classHead}</th>
                    <th scope="col">{GATE_COPY.crossHead}</th>
                    <th scope="col">{GATE_COPY.examplesHead}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows.fields, ...rows.organisms].map((r) => (
                    <tr key={r.label} data-testid={`gate-row-${r.label.toLowerCase()}`}>
                      <th scope="row">{r.label}</th>
                      <td>{r.value}</td>
                      <td>{r.examples}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {e.kind === 'S04' ? <p data-testid="gate-channel">{channelLine(e)}</p> : null}
            <h3 class="panel-h">{GATE_COPY.measured}</h3>
            <p data-testid="gate-totals">{gateTotalsText(e.tally, tallyFieldName)}</p>
            {e.kind === 'S03' ? (
              <button
                class="btn"
                onClick={() =>
                  void sendLabCommand(
                    { kind: 'setDevice', id: e.id, open: e.code === EDGE_SHUTTER_CLOSED },
                    { kinds: ['S03'] },
                  )
                }
                data-testid="gate-shutter"
              >
                {e.code === EDGE_SHUTTER_CLOSED ? GATE_COPY.open : GATE_COPY.close}
              </button>
            ) : null}
            <p class="lab-sub" data-testid="gate-tracer-note" data-paused={paused ? 'yes' : 'no'}>
              {paused ? GATE_COPY.tracerPaused : GATE_COPY.tracerRunning}
            </p>
            {rec ? <p class="lab-sub">{rec.guide.rules}</p> : null}
          </>
        )}
      </div>
    </section>
  );
}
