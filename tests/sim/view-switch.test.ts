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
 *
 * Also (wave B fixes): a saved specimen waiting for its placement tap takes that tap whatever Lab tool
 * is selected; the Habitat and Tools trays offer exactly what the dish's recorded content has, named
 * and described from content, and an older dish without paints or structures offers none; the Life
 * preview's rule is built from the dish's recorded species exactly as the simulation's species table
 * is; overlays and shade are drawn on porous beads.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as UiState from '../../src/ui/state';
import type * as LabViewModule from '../../src/ui/views/LabView';
import type * as OverlayPickerModule from '../../src/ui/panels/OverlayPicker';
import type { GestureHandlers } from '../../src/ui/gestures';
import { DishHost } from '../../src/worker/host';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';
import { canonicalJson, sha256Hex } from '../../src/sim/hash';
import { CELL_COUNT } from '../../src/sim/constants';
import { cellIndex, ST_BEAD, ST_NONE } from '../../src/sim/grid';
import { buildSpeciesTable } from '../../src/sim/species';
import { DISH_PX_PER_CELL, DISH_TEX, paintDish, paintOverlay } from '../../src/render/layers';
import { registry } from '../helpers/world';

type Msg = ToWorker & { protocolVersion?: number };

let host: DishHost;
let clock = 0;
const sent: Msg[] = [];

class InProcessWorker {
  onmessage: ((ev: { data: FromWorker }) => void) | null = null;
  constructor() {
    // D-0033: an import over the open dish keeps that dish first, so this device can save (in memory).
    host = new DishHost(
      registry(),
      (m) => queueMicrotask(() => this.onmessage?.({ data: m })),
      {
        now: () => clock,
      },
      new SaveStore(new MemoryBackend()),
    );
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

// ------------------------------------------------------------------------------------------------
// Wave B fixes.

/** Rewrite a current save as one recorded before the paints and structures were content. */
async function withoutLabContent(text: string): Promise<string> {
  const file = JSON.parse(text) as { state: { content: Record<string, unknown> }; checksum: string };
  const content = file.state.content as {
    manifest: Record<string, unknown> & { enabledMaterials: string[] };
    materials: { kind: string }[];
  };
  const manifest = { ...content.manifest };
  delete manifest.enabledStructures;
  manifest.enabledMaterials = manifest.enabledMaterials.filter((id) => !['GEL', 'SEDIMENT', 'SHADE', 'WATER'].includes(id));
  manifest.contentHash = 'a1'.repeat(32);
  const state = { ...file.state, content: { ...content, manifest, materials: content.materials.filter((m) => m.kind !== 'paint') } };
  const checksum = `sha256:${await sha256Hex(canonicalJson(state))}`;
  return JSON.stringify({ ...file, contentHash: manifest.contentHash, state, checksum });
}

/** Rewrite a current save as one recorded under other content (another contentHash), manifest otherwise unchanged. */
async function withContentHash(text: string, contentHash: string): Promise<string> {
  const file = JSON.parse(text) as { state: { content: { manifest: Record<string, unknown> } }; checksum: string };
  const content = file.state.content;
  const state = { ...file.state, content: { ...content, manifest: { ...content.manifest, contentHash } } };
  const checksum = `sha256:${await sha256Hex(canonicalJson(state))}`;
  return JSON.stringify({ ...file, contentHash, state, checksum });
}

describe('Lab: specimen placement takes the tap (P2.3 × P2.7)', () => {
  it('a saved specimen waiting for its tap is placed by that tap whatever Lab tool is selected', async () => {
    const lineage = await import('../../src/ui/panels/LineageState');
    // The dish screen's own tap handler: the specimen first, as DishScreen.onTap does.
    const onTap = vi.fn((_sx: number, _sy: number, wx: number, wy: number) => {
      lineage.placeSpecimenTap(wx, wy);
    });
    const h = lab.labGestures({ onTap, onStroke: vi.fn(), paints: () => false, onCameraMoved: () => undefined });
    lab.setDishView('lab');
    lab.selectLabTool('place:wall');
    expect(h.paints()).toBe(true);
    const mark = sent.length;
    lineage.beginSpecimenPlacement(0, 3, 'Test line');
    expect(h.paints()).toBe(false); // while it waits, a drag pans instead of painting walls
    h.onTap(10, 10, 60.5, 40.5);
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(lineage.specimenPlacement.value).toBeNull();
    await flush();
    const commands = sent
      .slice(mark)
      .filter((m): m is Extract<Msg, { type: 'command' }> => m.type === 'command');
    expect(commands.map((c) => c.payload.kind)).toEqual(['lineage']);
    expect(commands[0]!.payload).toMatchObject({ kind: 'lineage', op: 'spawnSpecimen', specimen: 0, x: 60.5, y: 40.5 });
    // Positive control: with no specimen waiting, the same tap is the Lab tool's.
    const mark2 = sent.length;
    h.onTap(10, 10, 60.5, 40.5);
    expect(onTap).toHaveBeenCalledTimes(1);
    await flush();
    const after = sent
      .slice(mark2)
      .filter((m): m is Extract<Msg, { type: 'command' }> => m.type === 'command');
    expect(after.map((c) => c.payload)).toMatchObject([{ kind: 'placeStructure', structure: 'wall' }]);
    await ui.undo();
    await flush();
    lab.selectLabTool('inspect');
    lab.setDishView('explore');
  });
});

describe('Lab trays offer what the dish records (content is data; D-0024)', () => {
  it('this build: the paints and structures, named and described from their content records', async () => {
    const tray = await import('../../src/ui/panels/LabTray');
    const reg = registry();
    expect(tray.trayItems('habitat').map((i) => [i.id, i.name])).toEqual([
      ['paint:water', 'Water'],
      ['paint:gel', 'Gel'],
      ['paint:sediment', 'Sediment'],
      ['shade:paint', 'Shade paint'],
      ['shade:erase', 'Remove shade'],
    ]);
    expect(tray.trayItems('tools').map((i) => [i.id, i.name])).toEqual([
      ['place:stone', reg.structures.STONE!.name],
      ['place:wall', reg.structures.WALL!.name],
      ['place:bead', reg.structures.BEAD!.name],
      ['erase', 'Erase structure'],
    ]);
    const wall = tray.itemCopy('place:wall')!;
    expect(wall).toMatchObject({
      name: 'Impermeable wall',
      purpose: reg.structures.WALL!.guide.summary,
      changes: reg.structures.WALL!.guide.rules,
      watch: reg.structures.WALL!.guide.example,
    });
    const gel = tray.itemCopy('paint:gel')!;
    expect(gel.purpose).toBe(reg.materials.GEL!.guide.summary);
    expect(gel.changes).toBe(reg.materials.GEL!.guide.rules);
    expect(gel.watch.startsWith(reg.materials.GEL!.guide.example)).toBe(true);
    expect(tray.itemCopy('shade:paint')!.dose).toContain('Light × 0.1');
  });

  it('the Life preview rule comes from the recorded species of the dish exactly as the species table does', async () => {
    const content = await import('../../src/ui/panels/LabTrayContent');
    const info = ui.dishInfo.value!;
    const reg = registry();
    const table = buildSpeciesTable(info.speciesIds.map((id) => reg.species[id]!));
    for (const sp of table) {
      // A phage dose fills fields (W2-14); an attached species also needs one of its recorded surfaces (P3.2).
      const expected =
        sp.def.metabolism === 'viral'
          ? { habitatMask: 0, attached: false, viral: true }
          : sp.def.attachment
            ? { habitatMask: sp.habitatMask, attached: true, surfaces: [...sp.def.attachment.surfaces] }
            : { habitatMask: sp.habitatMask, attached: sp.attached };
      expect(content.lifeBrushFor(info, sp.id), sp.id).toEqual(expected);
    }
    expect(content.lifeBrushFor(info, 'X99')).toBeNull();
  });

  // Wave B fix round 2 (fix1-lab-verify MAJOR): the world's own manifest decides, never this build's
  // contentHash. Behaviour changed from round 1, where a dish from other content was offered none.
  it('the structure tools follow the world’s own manifest: a dish saved under other content keeps them', async () => {
    const tray = await import('../../src/ui/panels/LabTray');
    const content = await import('../../src/ui/panels/LabTrayContent');
    const info = ui.dishInfo.value!;
    const TOOLS = ['place:stone', 'place:wall', 'place:bead', 'erase'];
    // The worker sends the world manifest's enabledStructures.
    expect(info.structureIds).toEqual(['BEAD', 'STONE', 'WALL']);
    expect(content.structureTools(info)).toEqual(TOOLS);
    expect(content.structureTools({ ...info, structureIds: ['STONE'] })).toEqual(['place:stone', 'erase']);
    expect(content.structureTools({ ...info, structureIds: [] })).toEqual([]);
    // A DishInfo without the list (not from this build's worker) is offered none, as such a world allows.
    const bare: typeof info = { ...info };
    delete (bare as { structureIds?: unknown }).structureIds;
    expect(content.structureTools(bare)).toEqual([]);
    // A dish recorded under other content (another contentHash) whose manifest lists BEAD, STONE and
    // WALL gets exactly those tools, and its simulation accepts them.
    const { text } = await ui.getClient().exportDish(info.dishId, false);
    await ui.importFile(new File([await withContentHash(text, 'b2'.repeat(32))], 'other-content.pixelmeba'));
    await flush();
    const other = ui.dishInfo.value!;
    expect(other.dishId).not.toBe(info.dishId);
    expect(other.contentHash).toBe('b2'.repeat(32));
    expect(other.structureIds).toEqual(['BEAD', 'STONE', 'WALL']);
    expect(tray.trayItems('tools').map((i) => i.id)).toEqual(TOOLS);
    lab.setDishView('lab');
    const res = await lab.sendLabCommand({ kind: 'placeStructure', structure: 'wall', points: STROKE, radius: 3 });
    expect(res!.accepted).toBeGreaterThan(0);
    await ui.undo();
    await flush();
    lab.setDishView('explore');
  });

  it('an older dish without paints or structures still opens, and its Lab offers none of those tools', async () => {
    const tray = await import('../../src/ui/panels/LabTray');
    const content = await import('../../src/ui/panels/LabTrayContent');
    const info = ui.dishInfo.value!;
    const { text } = await ui.getClient().exportDish(info.dishId, false);
    lab.setDishView('lab');
    lab.selectLabTool('place:wall');
    await ui.importFile(new File([await withoutLabContent(text)], 'older.pixelmeba'));
    await flush();
    const older = ui.dishInfo.value!;
    expect(older.dishId).not.toBe(info.dishId);
    expect(older.materials.some((m) => m.kind === 'paint')).toBe(false);
    // Its manifest has no enabledStructures: the worker lists none, so no structure tool is offered.
    expect(older.structureIds).toEqual([]);
    expect(tray.trayItems('habitat')).toEqual([]);
    expect(tray.trayItems('tools')).toEqual([]);
    for (const id of ['paint:gel', 'shade:paint', 'shade:erase', 'place:stone', 'place:wall', 'place:bead', 'erase'] as const) {
      expect(content.toolAvailable(older, id), id).toBe(false);
      expect(tray.itemCopy(id), id).toBeNull();
    }
    // Everything else in its Lab is still there.
    expect(tray.trayItems('life').length).toBe(older.speciesIds.length);
    expect(tray.trayItems('food').length).toBeGreaterThan(0);
    expect(content.toolAvailable(older, 'material:SUGAR')).toBe(true);
    // A wall command from a stale tool is refused whole by the simulation (the dish's own ruleset).
    const res = await lab.sendLabCommand({ kind: 'placeStructure', structure: 'wall', points: STROKE, radius: 3 });
    expect(res).toMatchObject({ accepted: 0, rejected: 0 });
    expect(res?.note).toMatch(/not in this dish/);
    lab.selectLabTool('inspect');
    lab.setDishView('explore');
  });
});

describe('Lab drawing: porous beads show what they hold (P2.7)', () => {
  const image = () => ({ width: DISH_TEX, height: DISH_TEX, data: new Uint8ClampedArray(DISH_TEX * DISH_TEX * 4) }) as unknown as ImageData;

  it('an overlay draws the measured value on a bead cell (stone stays clear)', () => {
    const structure = new Uint8Array(CELL_COUNT);
    const bead = cellIndex(40, 40);
    const stone = cellIndex(41, 40);
    structure[bead] = ST_BEAD;
    structure[stone] = 1;
    const data = new Float32Array(CELL_COUNT);
    data[bead] = 0.5;
    data[stone] = 0.5;
    data[cellIndex(42, 40)] = 0.5;
    const img = { width: 128, height: 128, data: new Uint8ClampedArray(128 * 128 * 4) } as unknown as ImageData;
    paintOverlay(img, data, structure, 'sugar', 1);
    const px = (i: number) => Array.from(img.data.slice(i * 4, i * 4 + 4));
    expect(px(bead)[3]).toBe(255);
    expect(px(bead)).toEqual(px(cellIndex(42, 40))); // the same value looks the same as on open water
    expect(px(stone)[3]).toBe(0);
  });

  it('shade painted on a bead is visible', () => {
    const substrate = new Uint8Array(CELL_COUNT);
    const structure = new Uint8Array(CELL_COUNT);
    const shade = new Float32Array(CELL_COUNT).fill(1);
    const bead = cellIndex(40, 40);
    structure[bead] = ST_BEAD;
    const plain = image();
    paintDish(plain, substrate, structure, shade);
    shade[bead] = 0.1;
    const shaded = image();
    paintDish(shaded, substrate, structure, shade);
    const block = (img: ImageData) => {
      const out: number[] = [];
      for (let y = 0; y < DISH_PX_PER_CELL; y++)
        for (let x = 0; x < DISH_PX_PER_CELL; x++) {
          const o = ((40 * DISH_PX_PER_CELL + y) * DISH_TEX + 40 * DISH_PX_PER_CELL + x) * 4;
          out.push(img.data[o]!, img.data[o + 1]!, img.data[o + 2]!);
        }
      return out;
    };
    const a = block(plain);
    const b = block(shaded);
    expect(b).not.toEqual(a);
    for (let k = 0; k < a.length; k++) expect(b[k]!).toBeLessThan(a[k]!); // every bead pixel is darker
    expect(structure[cellIndex(41, 40)]).toBe(ST_NONE);
  });
});
