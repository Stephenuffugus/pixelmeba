/**
 * P2.7: Explore ⇄ Lab is the same world seen two ways, so switching never changes the simulation.
 * The UI's own state module and Lab model run here against the real worker host (DishHost, in
 * process, behind a stand-in Worker), exactly as the app wires them. Every message the UI sends is
 * recorded; the state hash is read through the worker protocol's 'hash' request.
 *
 * Proven: switching (repeatedly, with a Lab overlay, with a persistent Lab tool, while running)
 * sends no command and leaves the hash identical; a stroke or tap interrupted by a switch is dropped
 * (its release commits nothing, the gesture layer's pending stroke is cancelled); and, as a positive
 * control, a completed Lab stroke sends exactly one undoable command and changes the hash, which the
 * ordinary Undo restores.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as UiState from '../../src/ui/state';
import type * as LabViewModule from '../../src/ui/views/LabView';
import type * as OverlayPickerModule from '../../src/ui/panels/OverlayPicker';
import type { GestureHandlers } from '../../src/ui/gestures';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';
import { registry } from '../helpers/world';

type Msg = ToWorker & { protocolVersion?: number };

let host: DishHost;
let clock = 0;
const sent: Msg[] = [];

class InProcessWorker {
  onmessage: ((ev: { data: FromWorker }) => void) | null = null;
  constructor() {
    host = new DishHost(registry(), (m) => queueMicrotask(() => this.onmessage?.({ data: m })), {
      now: () => clock,
    });
  }
  postMessage(msg: Msg): void {
    sent.push(msg);
    host.handle(msg);
  }
  terminate(): void {}
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

// Loaded after the Worker stand-in is installed.
let ui: typeof UiState;
let lab: typeof LabViewModule;
let picker: typeof OverlayPickerModule;

beforeAll(async () => {
  vi.stubGlobal('Worker', InProcessWorker);
  ui = await import('../../src/ui/state');
  lab = await import('../../src/ui/views/LabView');
  picker = await import('../../src/ui/panels/OverlayPicker');
  await ui.startRecipe('FIRST_DISH_V1', 'Garden');
  await flush();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

async function hash(): Promise<string> {
  const info = ui.dishInfo.value!;
  return (await ui.getClient().hash(info.dishId)).hash;
}

/** Message types the UI sent since `from`, excluding read-only hash requests. */
function sentSince(from: number): string[] {
  return sent
    .slice(from)
    .map((m) => m.type)
    .filter((t) => t !== 'hash');
}

const CHANGES_STATE = [
  'command',
  'step',
  'undo',
  'setSpeed',
  'create',
  'duplicate',
  'compareStart',
  'importDish',
  'loadSlot',
];

const STROKE: [number, number][] = [
  [56.5, 30.5],
  [70.5, 30.5],
];

describe('Explore ⇄ Lab changes no state (P2.7)', () => {
  it('plain switches, many times, send no command and keep the hash identical', async () => {
    expect(lab.dishView.value).toBe('explore');
    const before = await hash();
    const mark = sent.length;
    for (let i = 0; i < 6; i++) {
      lab.setDishView(i % 2 === 0 ? 'lab' : 'explore');
      await flush();
      expect(await hash()).toBe(before);
    }
    lab.toggleDishView();
    lab.toggleDishView();
    expect(lab.dishView.value).toBe('explore');
    expect(sentSince(mark).filter((t) => CHANGES_STATE.includes(t))).toEqual([]);
    expect(await hash()).toBe(before);
  });

  it('a Lab overlay is hidden in Explore and restored in Lab, through view requests only', async () => {
    const before = await hash();
    const mark = sent.length;
    lab.setDishView('lab');
    picker.chooseOverlay('sugar');
    await flush();
    expect(ui.overlay.value).toBe('sugar');
    lab.setDishView('explore');
    expect(ui.overlay.value).toBeNull();
    lab.setDishView('lab');
    expect(ui.overlay.value).toBe('sugar');
    picker.chooseOverlay(null);
    lab.setDishView('explore');
    await flush();
    expect(new Set(sentSince(mark))).toEqual(new Set(['view']));
    expect(await hash()).toBe(before);
  });

  it('the Lab tool persists across switches; Explore returns to Look', () => {
    lab.setDishView('lab');
    lab.selectLabTool('place:wall');
    ui.setTool({ kind: 'feed', materialId: 'SUGAR', dose: 0.1, radius: 3, paint: true });
    lab.setDishView('explore');
    expect(ui.tool.value.kind).toBe('look');
    lab.setDishView('lab');
    expect(lab.labTool.value).toBe('place:wall');
    expect(lab.labPaints()).toBe(true);
    lab.setDishView('explore');
    expect(lab.labPaints()).toBe(false);
  });

  it('a stroke interrupted by a switch is dropped: nothing is committed and the hash is unchanged', async () => {
    const cancel = vi.fn();
    lab.bindGestureCancel(cancel);
    lab.setDishView('lab');
    lab.selectLabTool('place:wall');
    const before = await hash();
    const mark = sent.length;
    cancel.mockClear();
    lab.labStrokeStart(STROKE[0]!);
    lab.labStrokeMove(STROKE);
    expect(lab.brushInfo.value?.cells).toBeGreaterThan(0); // the preview was up
    lab.setDishView('explore'); // mid-gesture
    expect(cancel).toHaveBeenCalledTimes(1); // the gesture layer dropped its pending stroke
    expect(lab.brushInfo.value).toBeNull(); // and the preview is gone
    // Even if the release still arrives, it commits nothing: in Explore…
    expect(lab.labStrokeEnd(STROKE)).toBe(true);
    // …or after switching straight back to Lab.
    lab.setDishView('lab');
    lab.labStrokeStart(STROKE[0]!);
    lab.setDishView('explore');
    lab.setDishView('lab');
    expect(lab.labStrokeEnd(STROKE)).toBe(true);
    // A tap interrupted the same way (press, switch, release) is dropped too.
    lab.labStrokeStart(STROKE[0]!);
    lab.setDishView('explore');
    expect(lab.labTap(60.5, 30.5)).toBe(true);
    await flush();
    expect(sentSince(mark).filter((t) => CHANGES_STATE.includes(t))).toEqual([]);
    expect(await hash()).toBe(before);
    lab.bindGestureCancel(null);
  });

  it('the wrapped gesture handlers route a switched-away stroke nowhere, and Explore strokes to Explore', async () => {
    const onTap = vi.fn();
    const onStroke = vi.fn();
    const explore: GestureHandlers = { onTap, onStroke, paints: () => false, onCameraMoved: () => undefined };
    const h = lab.labGestures(explore);
    const before = await hash();
    const mark = sent.length;
    lab.setDishView('lab');
    lab.selectLabTool('paint:gel');
    expect(h.paints()).toBe(true);
    h.onStrokeStart?.(STROKE[0]!);
    lab.setDishView('explore');
    h.onStroke(STROKE);
    expect(onStroke).not.toHaveBeenCalled(); // the dropped Lab stroke does not become an Explore one
    expect(h.paints()).toBe(false);
    h.onStroke(STROKE); // an ordinary Explore stroke (no Lab stroke pending) goes to Explore
    expect(onStroke).toHaveBeenCalledTimes(1);
    h.onTap(10, 10, 60.5, 30.5);
    expect(onTap).toHaveBeenCalledTimes(1);
    await flush();
    expect(sentSince(mark).filter((t) => CHANGES_STATE.includes(t))).toEqual([]);
    expect(await hash()).toBe(before);
  });

  it('switching while the dish runs changes nothing either: equal ticks give equal hashes with or without switches', async () => {
    const info = ui.dishInfo.value!;
    const c = ui.getClient();
    // A twin dish from the same saved state runs the same ticks with no switching at all.
    await c.duplicate(info.dishId, 'twin');
    c.activate(info.dishId);
    ui.setSpeed(1);
    await flush();
    for (let f = 0; f < 30; f++) {
      clock += 100;
      host.pump();
      if (f % 3 === 0) lab.toggleDishView();
      await flush();
    }
    ui.setSpeed(0);
    await flush();
    const a = await c.hash(info.dishId);
    expect(a.tick).toBeGreaterThanOrEqual(20); // the dish really ran while the view switched
    c.activate('twin');
    c.setSpeed('twin', 1);
    while ((await c.hash('twin')).tick < a.tick) {
      clock += 100;
      host.pump();
      await flush();
    }
    c.setSpeed('twin', 0);
    const b = await c.hash('twin');
    expect(b.tick).toBe(a.tick);
    // Duplicates keep the same world (the name and dish id are not part of the state hash).
    expect(b.hash).toBe(a.hash);
    c.activate(info.dishId);
    lab.setDishView('explore');
  });

  it('positive control: a completed Lab stroke is exactly one command, and Undo restores the hash', async () => {
    lab.setDishView('lab');
    lab.selectLabTool('place:wall');
    const before = await hash();
    const mark = sent.length;
    lab.labStrokeStart(STROKE[0]!);
    lab.labStrokeMove(STROKE);
    expect(lab.labStrokeEnd(STROKE)).toBe(true);
    await flush();
    const commands = sent
      .slice(mark)
      .filter((m): m is Extract<Msg, { type: 'command' }> => m.type === 'command');
    expect(commands).toHaveLength(1);
    expect(commands[0]!.payload).toMatchObject({ kind: 'placeStructure', structure: 'wall', radius: 3 });
    expect(commands[0]!.undoable).toBe(true);
    const after = await hash();
    expect(after).not.toBe(before);
    // Switching now still changes nothing…
    lab.setDishView('explore');
    lab.setDishView('lab');
    await flush();
    expect(await hash()).toBe(after);
    // …and the ordinary Undo rewinds the edit exactly.
    await ui.undo();
    await flush();
    expect(await hash()).toBe(before);
    lab.setDishView('explore');
  });
});
