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
 * Wave 12 (structures-art-audio): each class row carries its gate-class pip (render/gateBadges.ts badgeFor:
 * filled passes, half-filled partial, hollow blocked, a chevron one way) as an aria-hidden inline SVG — the
 * row's words stay the accessible meaning; while the sheet is open, running or paused, the renderer shows the
 * gate's badge beside it (renderer.setSelectedGate). Sound (UX §8.1 gate_click; the visible equivalents are
 * the sheet opening and the shutter's table and button changing): one gate_click per open of the sheet (keyed
 * on the open event, so a remount does not replay it) and per accepted shutter Open / Close; a refused toggle
 * sounds placement_error (sendLabCommand's placementCue). The tracer never sounds.
 */
import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { EDGE_SHUTTER_CLOSED, edgeKey } from '@sim/barriers';
import { playCue, playCueFor } from '@audio/cues';
import { badgeFor, type PipState } from '../../render/gateBadges';
import type { CommandResult } from '@sim/commands';
import type { CellEdgeLine } from '../../worker/protocol';
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

/** The latest intentional open of the gate sheet (a new object per open): the gate_click cue is keyed on it. */
export const gateOpenEvent = signal<{ readonly id: number } | null>(null);

/** Open the gate inspector for the inspected cell's edge barrier `id`. */
export function openGateSheet(id: number): void {
  gateEdgeId.value = id;
  gateOpenEvent.value = { id };
  sheet.value = 'gate';
}

/** gate_click once per open event (playCueFor: a remount of the same open sheet does not replay it). True if it played. */
export function gateOpenCue(event: { readonly id: number } | null = gateOpenEvent.value): boolean {
  return event !== null && playCueFor('gate_click', event);
}

/**
 * The cue of a shutter Open / Close's result: gate_click when the dish accepted it. A refused (or unanswered)
 * toggle plays nothing more here: sendLabCommand's placementCue already sounded placement_error for it.
 */
export function shutterCue(res: Pick<CommandResult, 'accepted'> | null): void {
  if (res && res.accepted > 0) playCue('gate_click');
}

/** The shutter's one button: open a closed S03, close an open one (one undoable command), then its cue. */
export async function toggleShutter(e: Pick<CellEdgeLine, 'id' | 'code'>): Promise<void> {
  shutterCue(await sendLabCommand({ kind: 'setDevice', id: e.id, open: e.code === EDGE_SHUTTER_CLOSED }, { kinds: ['S03'] }));
}

/** A gate-class pip by shape (gateBadges.ts): decorative, the row's words carry the meaning. */
export function GatePip({ state }: { state: PipState }) {
  return (
    <svg class="gate-pip" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" data-pip={state}>
      {state === 'pass' ? <circle cx="8" cy="8" r="5.5" fill="currentColor" /> : null}
      {state === 'partial' ? (
        <>
          <circle cx="8" cy="8" r="4.75" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M8 2.5a5.5 5.5 0 0 0 0 11z" fill="currentColor" />
        </>
      ) : null}
      {state === 'blocked' ? <circle cx="8" cy="8" r="4.75" fill="none" stroke="currentColor" stroke-width="1.5" /> : null}
      {state === 'oneWay' ? <path d="M5 2.5 10.5 8 5 13.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /> : null}
    </svg>
  );
}

function back(): void {
  getRenderer()?.setGatePreview(null);
  getRenderer()?.setSelectedGate(null);
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

  // Wave 12: the selected gate's badge, running or paused, while this sheet is open; cleared on close.
  useEffect(() => {
    getRenderer()?.setSelectedGate(ref ? edgeKey(ref[0], ref[1]) : null);
    return () => getRenderer()?.setSelectedGate(null);
  }, [refKey, dishId]);

  // Wave 12: gate_click once per open of this sheet (keyed on the open event).
  const openEvent = gateOpenEvent.value;
  useEffect(() => {
    gateOpenCue(openEvent);
  }, [openEvent]);

  const name = e ? structureNameById(e.kind) : '';
  const rec = e ? structureRecordById(e.kind) : null;
  const rows = e ? gateRows(e.code) : null;
  const pips = e ? badgeFor(e.code) : null;
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
                  {[...rows.fields, ...rows.organisms].map((r, i) => (
                    <tr key={r.label} data-testid={`gate-row-${r.label.toLowerCase()}`}>
                      <th scope="row">{r.label}</th>
                      <td>
                        {pips?.[i] ? <GatePip state={pips[i].state} /> : null}
                        {r.value}
                      </td>
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
                onClick={() => void toggleShutter(e)}
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
