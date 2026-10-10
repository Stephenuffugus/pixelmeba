/**
 * Sample, Transfer and Clean water in the UI (UX §4.4, §5.11; SPEC §10.5–10.6; P3.5; D-0037). UI state
 * only: Begin, Preview and Cancel are worker requests, Take / Transfer / Discard / Clean water are
 * commands, and the held sample shown here is the worker's snapshot of `world.sample`.
 *
 * A "session" is the Tools-tray tool that takes the next tap or stroke on the dish in place of the Lab's
 * persistent tool: 'sample' (Begin has paused the dish; a tap previews, Confirm takes), 'transfer' (a
 * tap moves the held sample there) and 'cleanWater' (a stroke replaces water under the brush).
 */
import { signal } from '@preact/signals';
import { brushCells } from '@sim/grid';
import type { SampleHeldSummary } from '@sim/sample';
import type { SampleMode } from '@sim/sampleSlot';
import type { CleanWaterFraction } from '@sim/tools';
import type { SamplePreview } from '@worker/protocol';
import { dishInfo, getClient, getRenderer, showToast } from '../state';
import { heldLine, TOOLS_COPY } from '../strings/tools';

export type LabSessionId = 'sample' | 'cleanWater' | 'transfer';

export function isSessionTool(id: string): id is LabSessionId {
  return id === 'sample' || id === 'cleanWater' || id === 'transfer';
}

/** The Tools-tray tool taking the next tap or stroke (null: the Lab's persistent tool does). */
export const labSession = signal<LabSessionId | null>(null);
export const sampleMode = signal<SampleMode>('life');
export const cleanFraction = signal<CleanWaterFraction>(0.5);
/** The open dish's held sample, from its latest snapshot. */
export const heldSample = signal<SampleHeldSummary | null>(null);
/** The preview of the last sample tap, awaiting Take sample / Cancel (with the tap point and radius). */
export const samplePreview = signal<{ readonly x: number; readonly y: number; readonly radius: number; readonly preview: SamplePreview } | null>(null);
/** An inline confirmation the panel is asking for. */
export const sampleConfirm = signal<'replace' | 'discard' | null>(null);

let counter = 0;
let watched: string | null = null;
let unwatch: (() => void) | null = null;

/** Follow the open dish's held sample from its snapshots (called by the panel when the dish changes). */
export function watchSample(dishId: string | null): void {
  if (watched === dishId) return;
  unwatch?.();
  unwatch = null;
  watched = dishId;
  heldSample.value = null;
  samplePreview.value = null;
  sampleConfirm.value = null;
  labSession.value = null;
  if (!dishId) return;
  const c = getClient();
  heldSample.value = c.sampleOf(dishId);
  unwatch = c.onSnapshot((s) => {
    if (s.dishId !== dishId || s.sample === undefined) return;
    heldSample.value = s.sample;
    if (s.sample === null && labSession.value === 'transfer') labSession.value = null;
  });
}

function clearMarks(): void {
  getRenderer()?.setBrushPreview(null);
}

/** Leave any session (a held sample stays held). */
export function endSession(): void {
  labSession.value = null;
  samplePreview.value = null;
  clearMarks();
}

/** Tools → Sample: Begin (pauses the dish), or ask to replace a held sample first. */
export async function beginSample(): Promise<void> {
  const info = dishInfo.value;
  if (!info) return;
  if (heldSample.value !== null) {
    sampleConfirm.value = 'replace';
    return;
  }
  try {
    await getClient().sampleBegin(info.dishId);
  } catch {
    return; // the worker's refusal is shown as a toast
  }
  samplePreview.value = null;
  labSession.value = 'sample';
}

/** PROPOSED DECISION (P3.5): replacing a held sample = Discard (confirmed), then Begin. */
export async function replaceSample(): Promise<void> {
  sampleConfirm.value = null;
  const ok = await discardSample();
  if (ok) await beginSample();
}

/** A tap while sampling: ask the worker what a sample here would hold (read-only). */
export async function sampleTap(x: number, y: number, radius: number): Promise<void> {
  const info = dishInfo.value;
  if (!info) return;
  const preview = await getClient().samplePreview(info.dishId, x, y, radius, sampleMode.value);
  if (labSession.value !== 'sample' || dishInfo.value?.dishId !== info.dishId) return;
  samplePreview.value = { x, y, radius, preview };
  getRenderer()?.setBrushPreview({ cells: [...preview.cells], rule: 'material' });
}

/** Take sample: one command (not an undo point: Undo while held is Cancel). */
export async function confirmSample(): Promise<void> {
  const info = dishInfo.value;
  const p = samplePreview.value;
  if (!info || !p) return;
  const res = await getClient().command(info.dishId, `sample-${++counter}`, { kind: 'sampleTake', x: p.x, y: p.y, radius: p.radius, mode: p.preview.mode }, false);
  if (res && res.accepted > 0) {
    endSession();
    showToast(TOOLS_COPY.taken(heldLine({ ...p.preview, cells: p.preview.cells.length })), 5000);
  } else if (res) showToast(res.note ? `${TOOLS_COPY.nothing} (${res.note})` : TOOLS_COPY.nothing, 5000);
}

/** Cancel: before a take, just stop sampling; with a held sample, the worker's exact Cancel. */
export async function cancelSampling(): Promise<void> {
  const info = dishInfo.value;
  endSession();
  sampleConfirm.value = null;
  if (!info || heldSample.value === null) return;
  await getClient().sampleCancel(info.dishId);
  showToast(TOOLS_COPY.cancelled, 4000);
}

/** Discard (after the panel's confirmation): one command. True when the sample left. */
export async function discardSample(): Promise<boolean> {
  const info = dishInfo.value;
  sampleConfirm.value = null;
  if (!info) return false;
  endSession();
  const res = await getClient().command(info.dishId, `sample-${++counter}`, { kind: 'sampleDiscard' }, true);
  if (res && res.accepted > 0) {
    showToast(TOOLS_COPY.discarded, 4000);
    return true;
  }
  return false;
}

/** Hover while transferring: the held footprint centred on this cell. */
export function transferFootprint(x: number, y: number): number[] {
  const h = heldSample.value;
  if (!h) return [];
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const out: number[] = [];
  for (let k = 0; k < h.footprint.length; k += 2) {
    const fx = cx + h.footprint[k]!;
    const fy = cy + h.footprint[k + 1]!;
    if (fx >= 0 && fy >= 0 && fx < 128 && fy < 128) out.push(fy * 128 + fx);
  }
  return out;
}

/** A tap while transferring: move the held sample so its centre cell lands here (one command, undoable). */
export async function transferTap(x: number, y: number): Promise<void> {
  const info = dishInfo.value;
  const h = heldSample.value;
  if (!info || !h) return;
  const dx = Math.floor(x) - h.origin[0];
  const dy = Math.floor(y) - h.origin[1];
  const res = await getClient().command(info.dishId, `sample-${++counter}`, { kind: 'sampleTransfer', dx, dy }, true);
  if (!res) return;
  if (res.accepted > 0) {
    endSession();
    showToast(TOOLS_COPY.transferred, 4000);
  } else showToast(TOOLS_COPY.transferRefused(res.note ?? 'it does not fit there'), 5000);
}

/** The footprint a sample tap here would cover (hover preview). */
export function sampleFootprint(x: number, y: number, radius: number): number[] {
  return brushCells(x, y, radius);
}
