/**
 * P2.6 What if? through the worker host (SPEC §13.3, UX §3.4, D09 §3–§5; BUILD_DIRECTIVE P2.6).
 * Proves, by driving the real DishHost exactly as sim.worker.ts does (with an in-memory save store):
 * - the sheet's answer: at most three choices in catalog order, each with its preview, old/new patch
 *   cells, identity line and checksums, and the plan for keeping the current dish;
 * - Start builds a NEW paused dish with its own world id whose start hash is the variant's recorded
 *   (and independently recomputed) initial-state hash, keeps the current dish in a named slot and the
 *   autosave, and leaves the current dish's state hash untouched;
 * - Again rebuilds the identical start (same hash) under a new world id; Another idea walks the
 *   catalog order R-G0 → R-G1 → R-G2 → R-G3 and wraps, without touching any world;
 * - when all ten slots are used nothing starts and nothing is written ("Cancel loses nothing"), a
 *   deliberate replacement keeps the current dish in the chosen slot, and "exported" writes no slot;
 * - refusals (a variant revised since the dish was made, an unknown idea, a failed write) change
 *   nothing: no new dish, no save written, the current dish's hash unchanged;
 * - a variant dish's export carries its provenance, and an imported one can be started again exactly.
 */
import { describe, expect, it } from 'vitest';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { stateHash } from '../../src/sim/serialize';
import { realizeVariant, variantRecordOf, type VariantRecord } from '../../src/sim/variants';
import type { World } from '../../src/sim/world';
import { GRID_W } from '../../src/sim/constants';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import { buildSaveFile, loadSaveFile, saveMetaVariant } from '../../src/persistence/saveFile';
import { realizeRecipe } from '../../src/sim/recipes';
import { DishHost } from '../../src/worker/host';
import type {
  DishInfo,
  DishSource,
  FromWorker,
  ToWorker,
  WhatIfKeep,
  WhatIfPick,
} from '../../src/worker/protocol';
import { registry } from '../helpers/world';

const REG = registry();
const GARDEN = { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } as const;
const NAMED = SaveStore.slotIds();

type Of<T extends FromWorker['type']> = Extract<FromWorker, { type: T }>;
type Started = Of<'whatIfStarted'>;
type Refused = Of<'whatIfRefused'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function harness(reg: ContentRegistry = REG) {
  let now = 0;
  let req = 0;
  const out: FromWorker[] = [];
  const backend = new MemoryBackend();
  const store = new SaveStore(backend);
  const host = new DishHost(
    reg,
    (m) => out.push(m),
    { now: () => now, iso: () => '2026-09-28T00:00:00.000Z' },
    store,
    true,
  );
  const h = {
    host,
    out,
    backend,
    store,
    /** Send one request exactly as the worker entry does and return its reply. */
    async ask(msg: DistributiveOmit<ToWorker, 'requestId'>): Promise<FromWorker> {
      const requestId = ++req;
      await host.handleAsync({ ...msg, requestId } as ToWorker);
      const reply = out.find((m) => 'requestId' in m && m.requestId === requestId);
      if (!reply) throw new Error(`no reply to ${msg.type}`);
      return reply;
    },
    async create(dishId: string, source: DishSource = GARDEN): Promise<DishInfo> {
      const r = await h.ask({ type: 'create', dishId, source });
      if (r.type !== 'ready') throw new Error(JSON.stringify(r));
      return r.info;
    },
    world(dishId: string): World {
      const w = host.world(dishId);
      if (!w) throw new Error(`no dish ${dishId}`);
      return w;
    },
    hash(dishId: string): string {
      return stateHash(h.world(dishId));
    },
    /** Advance a dish by single steps (a player pressing Step; no wall clock involved). */
    steps(dishId: string, n: number): void {
      for (let k = 0; k < n; k++) host.handle({ type: 'step', dishId });
    },
    /** One wall-clock frame of the active dish. */
    frame(ms: number): void {
      now += ms;
      host.pump();
    },
    async answer(sourceId: string | null, aboutDishId: string | null) {
      const r = await h.ask({ type: 'whatIf', sourceId, aboutDishId });
      if (r.type !== 'whatIf') throw new Error(JSON.stringify(r));
      return r.answer;
    },
    async start(
      newDishId: string,
      fromDishId: string | null,
      pick: WhatIfPick,
      keep: WhatIfKeep = { kind: 'auto' },
    ): Promise<Started | Refused> {
      const r = await h.ask({ type: 'whatIfStart', newDishId, fromDishId, pick, keep });
      if (r.type !== 'whatIfStarted' && r.type !== 'whatIfRefused') throw new Error(JSON.stringify(r));
      return r;
    },
    async started(
      newDishId: string,
      fromDishId: string | null,
      pick: WhatIfPick,
      keep: WhatIfKeep = { kind: 'auto' },
    ): Promise<Started> {
      const r = await h.start(newDishId, fromDishId, pick, keep);
      if (r.type !== 'whatIfStarted') throw new Error(`refused: ${r.code} ${r.message}`);
      return r;
    },
    async refused(
      newDishId: string,
      fromDishId: string | null,
      pick: WhatIfPick,
      keep: WhatIfKeep = { kind: 'auto' },
    ): Promise<Refused> {
      const r = await h.start(newDishId, fromDishId, pick, keep);
      if (r.type !== 'whatIfRefused') throw new Error(`expected a refusal, started ${r.info.dishId}`);
      return r;
    },
    /** slotId → checksum of what each slot holds now (autosave included). */
    async slotState(): Promise<Record<string, string>> {
      return Object.fromEntries((await store.list()).map((s) => [s.slotId, `${s.checksum}@${s.tick}`]));
    },
    /** The state hash of the world a slot holds (loaded exactly as the Saves screen does). */
    async slotHash(slotId: string): Promise<string> {
      const res = await store.load(slotId, async (text) => {
        await loadSaveFile(text);
        return true;
      });
      if (!res) throw new Error(`slot ${slotId} unreadable`);
      return stateHash((await loadSaveFile(res.text)).world);
    },
    lastSnapshotSpeed(dishId: string): number | undefined {
      const snaps = out.filter((m): m is Of<'snapshot'> => m.type === 'snapshot' && m.dishId === dishId);
      return snaps[snaps.length - 1]?.speed;
    },
  };
  return h;
}

const record = (w: World): VariantRecord => variantRecordOf(w)!;
const xy = (cell: number): [number, number] => [cell % GRID_W, Math.floor(cell / GRID_W)];
function centroid(cells: readonly number[]): [number, number] {
  let sx = 0;
  let sy = 0;
  for (const c of cells) {
    const [x, y] = xy(c);
    sx += x;
    sy += y;
  }
  return [sx / cells.length, sy / cells.length];
}

describe('What if? sheet data (UX §3.4)', () => {
  it('offers at most three choices in catalog order, each with its preview, old/new cells, identity and checksums', async () => {
    const h = harness();
    const a = await h.answer('FIRST_DISH_V1', null);
    expect(a.sourceName).toBe('Little Living Garden');
    expect(a.choices.map((c) => c.preview.id)).toEqual(['R-G1', 'R-G2', 'R-G3']);
    expect(a.plan).toEqual({ kind: 'none' });
    expect(a.current).toBeNull();
    const g3 = a.choices[2]!;
    expect(g3.preview.identity).toBe('R-G3 / rev 1 / seed 104729');
    expect(g3.preview.change).toMatchObject({ kind: 'moved', from: [48, 64], to: [48, 82], radius: 6 });
    // R-G3: an outline at the old patch and a solid new patch, with equal cell counts (D09 §5).
    expect(g3.oldCells.length).toBeGreaterThan(100);
    expect(g3.newCells.length).toBe(g3.oldCells.length);
    expect(centroid(g3.oldCells)).toEqual([48, 64]);
    expect(centroid(g3.newCells)).toEqual([48, 82]);
    // An amount change keeps the same cells before and after.
    expect(a.choices[0]!.oldCells).toEqual(a.choices[0]!.newCells);
    for (const c of a.choices) {
      expect(c.sourceChecksum).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(c.variantChecksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
    // The layout the preview draws is the recipe's own (the sugar patch where the Sprinters begin).
    expect(a.layout.patches[0]).toEqual({ index: 0, center: [48, 64], radius: 6, label: 'Sugar patch' });
    expect(a.layout.founders.find((f) => f.speciesId === 'B01')).toMatchObject({
      name: 'Sprinter',
      count: 24,
      center: [48, 64],
    });
  });

  it('DishInfo names the recipe whose ideas apply, and a recipe without ideas has none', async () => {
    const h = harness();
    expect((await h.create('g')).whatIfSourceId).toBe('FIRST_DISH_V1');
    expect((await h.create('g')).variant ?? null).toBeNull();
    const other = await h.create('x', { kind: 'recipe', recipeId: 'STARCH_UNLOCK_V1' });
    expect(other.whatIfSourceId).toBeNull();
    expect((await h.ask({ type: 'whatIf', sourceId: null, aboutDishId: 'x' })).type).toBe('whatIfRefused');
  });
});

describe('Start: a new paused dish; the current dish is kept (SPEC §13.3; D09 §3)', () => {
  it('opens the variant paused at its recorded start hash with its own world id, and leaves the current dish untouched', async () => {
    const h = harness();
    await h.create('cur');
    h.steps('cur', 25);
    const before = h.hash('cur');
    const tickBefore = h.world('cur').tick;
    const plan = (await h.answer(null, 'cur')).plan;
    expect(plan).toEqual({ kind: 'slot', slotId: 'slot1', own: false, name: 'FIRST_DISH_V1' });

    const s = await h.started('v1', 'cur', { kind: 'variant', variantId: 'R-G3' });
    const w = h.world('v1');
    const rec = record(w);
    expect(s.info).toMatchObject({
      dishId: 'v1',
      worldId: 'v1',
      name: 'Dinner farther away',
      tick: 0,
      whatIfSourceId: 'FIRST_DISH_V1',
    });
    expect(s.info.variant).toEqual(rec);
    expect(w.tick).toBe(0);
    expect(w.worldId).not.toBe(h.world('cur').worldId);
    // The start is exactly the variant's recorded start, and matches an independent realization.
    expect(stateHash(w)).toBe(rec.initialStateHash);
    expect(rec.initialStateHash).toBe(stateHash(await realizeVariant(REG, 'R-G3', { worldId: 'elsewhere' })));
    expect(rec).toMatchObject({
      variantId: 'R-G3',
      variantRevision: 1,
      sourceId: 'FIRST_DISH_V1',
      sourceRevision: 1,
      seed: 104729,
    });
    // Paused, and now the active dish.
    expect(h.lastSnapshotSpeed('v1')).toBe(0);
    expect(h.host.activeDishId).toBe('v1');
    h.frame(1000);
    expect(h.world('v1').tick).toBe(0);
    // The current dish was kept, not changed: same hash, in slot 1 and in the autosave.
    expect(h.hash('cur')).toBe(before);
    expect(h.world('cur').tick).toBe(tickBefore);
    expect(s.kept).toMatchObject({ kind: 'slot', replaced: null, name: 'FIRST_DISH_V1', autosaved: true });
    expect(s.kept.slot?.slotId).toBe('slot1');
    expect(await h.slotHash('slot1')).toBe(before);
    expect(await h.slotHash('autosave')).toBe(before);
  });

  it('saves again to the slot the dish was opened from (its own slot), never to another save', async () => {
    const h = harness();
    await h.create('cur');
    h.steps('cur', 5);
    await h.ask({ type: 'saveSlot', dishId: 'cur', slotId: 'slot3', name: 'Mine' });
    const opened = await h.ask({ type: 'loadSlot', slotId: 'slot3', newDishId: 'again' });
    expect(opened.type).toBe('loaded');
    h.steps('again', 7);
    const before = h.hash('again');
    expect((await h.answer(null, 'again')).plan).toEqual({
      kind: 'slot',
      slotId: 'slot3',
      own: true,
      name: 'Mine',
    });
    const s = await h.started('v', 'again', { kind: 'variant', variantId: 'R-G1' });
    expect(s.kept.slot?.slotId).toBe('slot3');
    expect(s.kept.replaced).toBeNull();
    expect(await h.slotHash('slot3')).toBe(before);
    expect((await h.store.list()).map((x) => x.slotId)).toEqual(['autosave', 'slot3']);
  });

  it('starts from Play with no dish open: nothing to keep, nothing written', async () => {
    const h = harness();
    const s = await h.started('v', null, { kind: 'variant', variantId: 'R-G2' });
    expect(s.kept).toEqual({ kind: 'none', slot: null, replaced: null, name: null, autosaved: false });
    expect(await h.store.list()).toEqual([]);
    expect(record(h.world('v')).variantId).toBe('R-G2');
  });
});

describe('Again and Another idea (D09 §4)', () => {
  it('Again rebuilds the identical start under a new world id; an untouched dish needs no save', async () => {
    const h = harness();
    const first = await h.started('v1', null, { kind: 'variant', variantId: 'R-G3' });
    const start = h.hash('v1');
    const a = await h.answer(null, 'v1');
    expect(a.current).toMatchObject({ variantId: 'R-G3', atStart: true });
    expect(a.plan).toEqual({ kind: 'unchanged', name: 'Dinner farther away' });

    const again = await h.started('v2', 'v1', { kind: 'again' });
    expect(again.kept.kind).toBe('unchanged');
    expect(await h.store.list()).toEqual([]);
    expect(h.hash('v2')).toBe(start);
    expect(record(h.world('v2')).initialStateHash).toBe(first.info.variant!.initialStateHash);
    expect(h.world('v2').worldId).toBe('v2');
    expect(h.world('v2').worldId).not.toBe(h.world('v1').worldId);
    expect(h.hash('v1')).toBe(start);

    // Once the dish has run, Again keeps it (first free slot) and still starts identically.
    h.steps('v2', 12);
    const ran = h.hash('v2');
    const third = await h.started('v3', 'v2', { kind: 'again' });
    expect(third.kept.slot?.slotId).toBe('slot1');
    expect(await h.slotHash('slot1')).toBe(ran);
    expect(h.hash('v3')).toBe(start);
    expect(h.hash('v2')).toBe(ran);
  });

  it('Another idea walks catalog order R-G0 → R-G1 → R-G2 → R-G3 and wraps, never repeating the current one', async () => {
    const h = harness();
    await h.started('d0', null, { kind: 'variant', variantId: 'R-G3' });
    const seen: string[] = [];
    let from = 'd0';
    for (let k = 1; k <= 5; k++) {
      const hashFrom = h.hash(from);
      const a = await h.answer(null, from);
      const s = await h.started(`d${k}`, from, { kind: 'another' });
      const id = s.info.variant!.variantId;
      expect(a.next?.id).toBe(id);
      expect(id).not.toBe(record(h.world(from)).variantId);
      // No simulation randomness is used: the dish left is unchanged, and the new start is the
      // variant's own start (the same as a fresh realization).
      expect(h.hash(from)).toBe(hashFrom);
      expect(h.hash(`d${k}`)).toBe(stateHash(await realizeVariant(REG, id, { worldId: 'x' })));
      seen.push(id);
      from = `d${k}`;
    }
    expect(seen).toEqual(['R-G0', 'R-G1', 'R-G2', 'R-G3', 'R-G0']);
    expect(h.world('d1').content.provenance).toMatchObject({ createdFrom: 'variant' });
  });

  it('Again or Another idea on a dish that is not a What if? dish is refused and changes nothing', async () => {
    const h = harness();
    await h.create('cur');
    h.steps('cur', 3);
    const before = h.hash('cur');
    for (const pick of [{ kind: 'again' }, { kind: 'another' }] as const) {
      const r = await h.refused('n', 'cur', pick);
      expect(r.code).toBe('not-variant');
      expect(h.host.world('n')).toBeNull();
    }
    expect(h.hash('cur')).toBe(before);
    expect(await h.store.list()).toEqual([]);
  });
});

describe('All ten slots used (UX §3.4 "offer export or replace; Cancel loses nothing")', () => {
  async function fullHost() {
    const h = harness();
    await h.create('filler');
    for (const slotId of NAMED) {
      h.steps('filler', 1);
      const r = await h.ask({ type: 'saveSlot', dishId: 'filler', slotId, name: `Old ${slotId}` });
      expect(r.type).toBe('slotSaved');
    }
    await h.create('cur');
    h.host.handle({ type: 'setSpeed', dishId: 'cur', speed: 1 });
    h.frame(0);
    h.frame(1500);
    expect(h.world('cur').tick).toBeGreaterThan(0);
    return h;
  }

  it('refuses to start, writes nothing, and the current dish keeps running exactly as it was', async () => {
    const h = await fullHost();
    const before = h.hash('cur');
    const slots = await h.slotState();
    expect((await h.answer(null, 'cur')).plan).toEqual({ kind: 'full', name: 'FIRST_DISH_V1' });
    const r = await h.refused('v', 'cur', { kind: 'variant', variantId: 'R-G3' });
    expect(r.code).toBe('slots-full');
    expect(r.message).toMatch(/All ten save slots are used/);
    expect(r.message).toMatch(/Nothing has changed/);
    expect(h.host.world('v')).toBeNull();
    expect(h.host.activeDishId).toBe('cur');
    expect(h.hash('cur')).toBe(before);
    expect(await h.slotState()).toEqual(slots);
    // It was not left paused by the refusal: its prior speed resumes.
    const t = h.world('cur').tick;
    h.frame(1000);
    expect(h.world('cur').tick).toBeGreaterThan(t);
  });

  it('a deliberate replacement keeps the current dish in the chosen slot; the other nine are untouched', async () => {
    const h = await fullHost();
    h.host.handle({ type: 'setSpeed', dishId: 'cur', speed: 0 });
    const before = h.hash('cur');
    const slots = await h.slotState();
    const s = await h.started(
      'v',
      'cur',
      { kind: 'variant', variantId: 'R-G1' },
      { kind: 'replace', slotId: 'slot4' },
    );
    expect(s.kept).toMatchObject({ kind: 'slot', replaced: 'Old slot4', autosaved: true });
    expect(s.kept.slot?.slotId).toBe('slot4');
    expect(await h.slotHash('slot4')).toBe(before);
    const now = await h.slotState();
    for (const id of NAMED) if (id !== 'slot4') expect(now[id]).toBe(slots[id]);
    expect(h.hash('cur')).toBe(before);
    expect(record(h.world('v')).variantId).toBe('R-G1');
  });

  it('after exporting, the dish starts without writing any named slot (only Continue is updated)', async () => {
    const h = await fullHost();
    h.host.handle({ type: 'setSpeed', dishId: 'cur', speed: 0 });
    const before = h.hash('cur');
    const exported = await h.ask({ type: 'exportDish', dishId: 'cur', strip: false });
    expect(exported.type).toBe('exported');
    const slots = await h.slotState();
    const s = await h.started('v', 'cur', { kind: 'variant', variantId: 'R-G2' }, { kind: 'exported' });
    expect(s.kept).toMatchObject({ kind: 'exported', slot: null, autosaved: true });
    const now = await h.slotState();
    for (const id of NAMED) expect(now[id]).toBe(slots[id]);
    expect(await h.slotHash('autosave')).toBe(before);
    expect(stateHash((await loadSaveFile((exported as Of<'exported'>).text)).world)).toBe(before);
  });
});

describe('Refusals change nothing (SPEC §13.3 "stops creation with a readable message")', () => {
  it('Again on a dish whose idea was revised since it was made shows a readable message; nothing is started or saved', async () => {
    const made = harness();
    await made.started('v', null, { kind: 'variant', variantId: 'R-G3' });
    made.steps('v', 4);
    const text = ((await made.ask({ type: 'exportDish', dishId: 'v', strip: false })) as Of<'exported'>).text;
    // A later build revised R-G3 (a new revision): the old dish cannot be rebuilt exactly.
    const revised: ContentRegistry = {
      ...REG,
      variants: { ...REG.variants, 'R-G3': { ...REG.variants['R-G3']!, revision: 2 } },
    };
    const h = harness(revised);
    const loaded = await h.ask({ type: 'importDish', text, newDishId: 'old' });
    expect(loaded.type).toBe('loaded');
    const before = h.hash('old');
    const r = await h.refused('n', 'old', { kind: 'again' });
    expect(r.code).toBe('changed');
    expect(r.message).toBe(
      '"Dinner farther away" has been revised since this dish was made, so it cannot be rebuilt exactly. Your dish is unchanged.',
    );
    expect(r.message).not.toMatch(/sha256|[0-9a-f]{16}/);
    expect(h.host.world('n')).toBeNull();
    expect(h.host.activeDishId).toBe('old');
    expect(h.hash('old')).toBe(before);
    expect(await h.store.list()).toEqual([]);
  });

  it('an unknown idea and a failed write are refused the same way', async () => {
    const h = harness();
    await h.create('cur');
    h.steps('cur', 3);
    const before = h.hash('cur');
    const unknown = await h.refused('n', 'cur', { kind: 'variant', variantId: 'R-Z9' });
    expect(unknown.code).toBe('unknown-variant');
    expect(unknown.message).toBe('What if? "R-Z9" is not in this build.');
    h.backend.failNextCommit = true;
    const failed = await h.refused('n', 'cur', { kind: 'variant', variantId: 'R-G3' });
    expect(failed.code).toBe('save-failed');
    expect(failed.message).toMatch(/could not be saved, so the new dish was not started/);
    expect(h.host.world('n')).toBeNull();
    expect(h.hash('cur')).toBe(before);
    expect(await h.store.list()).toEqual([]);
    // The id is still free and the same request now succeeds.
    expect((await h.started('n', 'cur', { kind: 'variant', variantId: 'R-G3' })).kept.slot?.slotId).toBe(
      'slot1',
    );
  });
});

describe('Provenance of a variant dish (D09 §4 "Identity")', () => {
  it('its export carries the variant record, and an imported copy can be started again exactly', async () => {
    const h = harness();
    const s = await h.started('v', null, { kind: 'variant', variantId: 'R-G3' });
    const rec = s.info.variant!;
    h.steps('v', 6);
    const exported = (await h.ask({ type: 'exportDish', dishId: 'v', strip: true })) as Of<'exported'>;
    const file = JSON.parse(exported.text) as { state: { content: { provenance: Record<string, unknown> } } };
    expect(file.state.content.provenance).toMatchObject({
      recipeId: 'FIRST_DISH_V1',
      recipeRevision: 1,
      createdFrom: 'variant',
      variant: rec,
    });
    expect(rec.sourceChecksum).toMatch(/^sha256:/);
    expect(rec.variantChecksum).toMatch(/^sha256:/);

    const loaded = (await h.ask({
      type: 'importDish',
      text: exported.text,
      newDishId: 'imp',
    })) as Of<'loaded'>;
    expect(loaded.info.variant).toEqual(rec);
    expect(loaded.info.whatIfSourceId).toBe('FIRST_DISH_V1');
    const again = await h.started('imp2', 'imp', { kind: 'again' });
    expect(h.hash('imp2')).toBe(rec.initialStateHash);
    expect(again.info.variant?.initialStateHash).toBe(rec.initialStateHash);
  });
});

// ---------------------------------------------------------------------------------------------
// Wave B fix (whatif-verify.md; D-0026)

/** A save file of `w` exactly as an older build wrote it: no recorded overrides, no meta.variant. */
async function oldSaveText(w: World): Promise<string> {
  delete (w.content.provenance as { overrides?: unknown }).overrides;
  return (
    await buildSaveFile(w, {
      name: 'Old dish',
      savedAt: '2026-09-01T00:00:00.000Z',
      recipeId: 'FIRST_DISH_V1',
    })
  ).text;
}

describe('What if? is offered only for the authored recipe or a variant dish (D09 §4; item 1)', () => {
  it('a custom New Dish (own seed, Accelerated/Varied, Empty) gets no ideas; its overrides are recorded', async () => {
    const h = harness();
    // The verifier's repro: every override at once.
    const custom = await h.create('c', {
      kind: 'recipe',
      recipeId: 'FIRST_DISH_V1',
      seed: 5,
      overrides: { mutationPreset: 'accelerated', founderMode: 'varied', empty: true },
    });
    expect(custom.whatIfSourceId).toBeNull();
    expect(h.world('c').content.provenance).toMatchObject({
      recipeId: 'FIRST_DISH_V1',
      recipeRevision: 1,
      createdFrom: 'recipe',
      overrides: { seed: 5, mutationPreset: 'accelerated', founderMode: 'varied', empty: true },
    });
    const r = await h.ask({ type: 'whatIf', sourceId: null, aboutDishId: 'c' });
    expect(r.type).toBe('whatIfRefused');
    // Each single override is already a custom dish.
    const one = [
      { seed: 5, overrides: {} },
      { seed: 104729, overrides: { mutationPreset: 'accelerated' } },
      { seed: 104729, overrides: { founderMode: 'varied' } },
      { seed: 104729, overrides: { empty: true } },
    ] as const;
    for (const [k, o] of one.entries()) {
      const info = await h.create(`c${k}`, {
        kind: 'recipe',
        recipeId: 'FIRST_DISH_V1',
        seed: o.seed,
        overrides: o.overrides,
      });
      expect(info.whatIfSourceId, JSON.stringify(o)).toBeNull();
    }
    // It stays custom through its own save file.
    const text = ((await h.ask({ type: 'exportDish', dishId: 'c', strip: false })) as Of<'exported'>).text;
    const back = (await h.ask({ type: 'importDish', text, newDishId: 'c-back' })) as Of<'loaded'>;
    expect(back.info.whatIfSourceId).toBeNull();
  });

  it('the authored recipe itself (Play → Start, or New Dish with exactly its seed and settings) gets the ideas', async () => {
    const h = harness();
    expect((await h.create('g')).whatIfSourceId).toBe('FIRST_DISH_V1');
    expect(h.world('g').content.provenance).toMatchObject({ createdFrom: 'recipe', overrides: {} });
    const same = await h.create('n', {
      kind: 'recipe',
      recipeId: 'FIRST_DISH_V1',
      seed: 104729,
      overrides: { mutationPreset: 'standard', founderMode: 'identical', empty: false },
    });
    expect(same.whatIfSourceId).toBe('FIRST_DISH_V1');
    expect(h.hash('n')).toBe(h.hash('g')); // it IS the authored start
    expect((await h.answer(null, 'n')).choices.map((c) => c.preview.id)).toEqual(['R-G1', 'R-G2', 'R-G3']);
  });

  it('an older save without recorded overrides counts only when its seed and settings match the recipe exactly', async () => {
    const h = harness();
    const authored = realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: 'old-a' });
    const otherSeed = realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: 'old-b', seed: 5 });
    const accelerated = realizeRecipe(REG, 'FIRST_DISH_V1', {
      worldId: 'old-c',
      transform: (r) => ({ ...r, mutationPreset: 'accelerated' }),
    });
    // Fix round 2 (item 7c): an Empty start of the same recipe, seed and settings is not the recipe.
    const empty = realizeRecipe(REG, 'FIRST_DISH_V1', {
      worldId: 'old-d',
      transform: (r) => ({ ...r, founders: [], fieldPatches: [], scheduledCommands: [] }),
    });
    expect(empty.ents.count).toBe(0);
    const cases: [World, string | null][] = [
      [authored, 'FIRST_DISH_V1'],
      [otherSeed, null],
      [accelerated, null],
      [empty, null],
    ];
    for (const [k, [w, expected]] of cases.entries()) {
      const text = await oldSaveText(w);
      expect(JSON.parse(text).state.content.provenance.overrides).toBeUndefined();
      const loaded = await h.ask({ type: 'importDish', text, newDishId: `old${k}` });
      expect(loaded.type).toBe('loaded');
      expect((loaded as Of<'loaded'>).info.whatIfSourceId).toBe(expected);
    }
  });
});

describe('"Unchanged, rebuilds exactly" only when this build rebuilds it exactly (item 2)', () => {
  async function exportedAtStart(): Promise<{ text: string; start: string }> {
    const made = harness();
    await made.started('v', null, { kind: 'variant', variantId: 'R-G3' });
    const text = ((await made.ask({ type: 'exportDish', dishId: 'v', strip: false })) as Of<'exported'>).text;
    return { text, start: made.hash('v') };
  }

  it('a tick-0 R-G3 dish imported where R-G3 is revised is kept through the save flow, never called unchanged', async () => {
    const { text, start } = await exportedAtStart();
    const revised: ContentRegistry = {
      ...REG,
      variants: { ...REG.variants, 'R-G3': { ...REG.variants['R-G3']!, revision: 2 } },
    };
    const h = harness(revised);
    await h.ask({ type: 'importDish', text, newDishId: 'old' });
    expect(h.world('old').tick).toBe(0);
    expect(h.hash('old')).toBe(start);
    const a = await h.answer(null, 'old');
    expect(a.current?.atStart).toBe(false);
    expect(a.plan).toEqual({ kind: 'slot', slotId: 'slot1', own: false, name: 'Dinner farther away' });
    const s = await h.started('n', 'old', { kind: 'variant', variantId: 'R-G1' });
    expect(s.kept).toMatchObject({ kind: 'slot', autosaved: true });
    expect(s.kept.slot?.slotId).toBe('slot1');
    expect(await h.slotHash('slot1')).toBe(start);
    expect(await h.slotHash('autosave')).toBe(start);
  });

  it('after a content update elsewhere, Again still starts (D-0021) but the dish is saved, not skipped', async () => {
    const { text, start } = await exportedAtStart();
    const updated: ContentRegistry = {
      ...REG,
      manifest: { ...REG.manifest, contentHash: `${REG.manifest.contentHash}-next` },
    };
    const h = harness(updated);
    await h.ask({ type: 'importDish', text, newDishId: 'old' });
    expect((await h.answer(null, 'old')).plan.kind).toBe('slot');
    const again = await h.started('n', 'old', { kind: 'again' });
    expect(again.kept.kind).toBe('slot');
    expect(await h.slotHash(again.kept.slot!.slotId)).toBe(start);
  });

  it('on this build, an untouched variant dish is still unchanged (nothing written)', async () => {
    const h = harness();
    await h.started('v', null, { kind: 'variant', variantId: 'R-G2' });
    expect((await h.answer(null, 'v')).plan.kind).toBe('unchanged');
    expect((await h.started('w', 'v', { kind: 'another' })).kept.kind).toBe('unchanged');
    expect(await h.store.list()).toEqual([]);
  });
});

describe('The choice Details describe the world-to-be like provenance does (UX §3.3; item 4)', () => {
  it('the answer carries the registry label a dish of this build shows', async () => {
    const h = harness();
    const info = await h.create('g');
    // Declared on WhatIfAnswer (protocol.ts) and computed by the host's one registryLabel helper.
    const a = await h.answer('FIRST_DISH_V1', null);
    expect(a.registryLabel).toBe(info.manifestLabel);
    const fromDish = await h.answer(null, 'g');
    expect(fromDish.registryLabel).toBe(info.manifestLabel);
  });
});

describe('A variant dish names itself in the save file meta (item 7)', () => {
  it('slot saves and exports carry meta.variant; other dishes do not; files without it still load', async () => {
    const h = harness();
    const s = await h.started('v', null, { kind: 'variant', variantId: 'R-G3' });
    h.steps('v', 3);
    const expected = {
      variantId: 'R-G3',
      variantRevision: 1,
      title: 'Dinner farther away',
      sourceId: 'FIRST_DISH_V1',
      sourceRevision: 1,
      seed: 104729,
    };
    for (const strip of [false, true]) {
      const text = ((await h.ask({ type: 'exportDish', dishId: 'v', strip })) as Of<'exported'>).text;
      expect(JSON.parse(text).meta.variant).toEqual(expected);
      expect(saveMetaVariant(JSON.parse(text).meta)).toEqual(expected);
    }
    await h.ask({ type: 'saveSlot', dishId: 'v', slotId: 'slot2', name: 'Mine' });
    const slotText = (await h.store.load('slot2', () => Promise.resolve(true)))!.text;
    expect(JSON.parse(slotText).meta.variant).toEqual(expected);
    // A dish not made from an idea has none.
    await h.create('g');
    const plain = ((await h.ask({ type: 'exportDish', dishId: 'g', strip: false })) as Of<'exported'>).text;
    expect(JSON.parse(plain).meta.variant).toBeUndefined();
    // A file without it (an older build's) loads, and the world's own record still describes it.
    const file = JSON.parse(slotText) as { meta: Record<string, unknown> };
    delete file.meta.variant;
    const loaded = (await h.ask({
      type: 'importDish',
      text: JSON.stringify(file),
      newDishId: 'old',
    })) as Of<'loaded'>;
    expect(loaded.type).toBe('loaded');
    expect(loaded.info.variant).toEqual(s.info.variant);
    // Meta is untrusted text: a malformed entry reads as absent.
    expect(saveMetaVariant({ variant: { variantId: 7 } })).toBeNull();
    expect(saveMetaVariant(null)).toBeNull();
  });
});

// Wave B fix round 2 (item 7e): the idea reaches the slot index, so the Saved dishes list names it
// without loading the world.
describe('A What if? dish names its idea in the slot index (SlotSummary.variant)', () => {
  it('slot and autosave summaries carry the idea; other dishes do not; a malformed index copy is dropped', async () => {
    const h = harness();
    await h.create('g');
    // D-0033 fix round 1: an untouched Garden rebuilds exactly and is not kept, so let it change first.
    h.steps('g', 1);
    await h.started('v', 'g', { kind: 'variant', variantId: 'R-G3' });
    h.steps('v', 3);
    const saved = await h.ask({ type: 'saveSlot', dishId: 'v', slotId: 'slot5', name: 'Far dinner' });
    expect(saved.type).toBe('slotSaved');
    const idea = { variantId: 'R-G3', variantRevision: 1, title: 'Dinner farther away', sourceId: 'FIRST_DISH_V1', sourceRevision: 1, seed: 104729 };
    expect((saved as Of<'slotSaved'>).slot.variant).toEqual(idea);
    await h.ask({ type: 'autosave', dishId: 'v' });
    const list = (await h.ask({ type: 'listSlots' })) as Of<'slots'>;
    const by = (id: string) => list.slots.find((x) => x.slotId === id)!;
    expect(by('slot5').variant).toEqual(idea);
    expect(by('autosave').variant).toEqual(idea);
    // The Garden was kept (slot1) when the What if? dish started: no idea there.
    expect(by('slot1').variant).toBeUndefined();
    expect('variant' in by('slot1')).toBe(false);
    // The index is stored data: a damaged copy is not shown (the save itself still opens).
    h.backend.slots.slot5 = { ...h.backend.slots.slot5!, variant: { ...idea, variantRevision: -1 } };
    const again = (await h.ask({ type: 'listSlots' })) as Of<'slots'>;
    expect(again.slots.find((x) => x.slotId === 'slot5')!.variant).toBeUndefined();
    expect((await h.ask({ type: 'loadSlot', slotId: 'slot5', newDishId: 'back' })).type).toBe('loaded');
  });
});

// Wave B fix round 2 (item 7d): error packets say whether the worker really paused the dish.
describe('Error packets say what really happened (paused, and which request)', () => {
  it('a failed create paused nothing; a failed save or export paused nothing; a failed command paused its dish', async () => {
    const h = harness();
    const errors = () => h.out.filter((m): m is Of<'error'> => m.type === 'error');
    h.host.handle({ type: 'create', requestId: 900, dishId: 'bad', source: { kind: 'recipe', recipeId: 'NOPE' } });
    expect(errors().at(-1)).toMatchObject({ dishId: 'bad', requestId: 900, paused: false, request: 'create' });
    await h.create('g');
    h.backend.failNextCommit = true;
    await h.host.handleAsync({ type: 'saveSlot', requestId: 901, dishId: 'g', slotId: 'slot2', name: 'x' });
    expect(errors().at(-1)).toMatchObject({ dishId: 'g', requestId: 901, paused: false, request: 'saveSlot', message: 'simulated write failure' });
    await h.host.handleAsync({ type: 'exportDish', requestId: 902, dishId: 'gone', strip: false });
    expect(errors().at(-1)).toMatchObject({ requestId: 902, paused: false, request: 'exportDish' });
    // The dish still runs as before: nothing paused it.
    h.host.handle({ type: 'setSpeed', dishId: 'g', speed: 1 });
    h.frame(200);
    expect(h.world('g').tick).toBeGreaterThan(0);
    // A command that throws inside the simulation pauses its dish at the last valid state.
    const tick = h.world('g').tick;
    h.host.handle({ type: 'command', requestId: 903, dishId: 'g', commandId: 'bad', payload: { kind: 'nonsense' } as never, undoable: false });
    expect(errors().at(-1)).toMatchObject({ dishId: 'g', requestId: 903, paused: true, request: 'command' });
    expect(h.world('g').tick).toBe(tick);
    h.frame(200);
    expect(h.world('g').tick).toBe(tick);
  });
});

// D-0033: What if?'s keep step is now the one every replacing action shares. Its one new case: a dish its
// own slot already holds exactly (same checksummed file and name) is not written again.
describe('D-0033: a dish its own slot already holds exactly is not saved again', () => {
  it('the plan says so, Start writes nothing (not even Continue), and the toast has nothing to say', async () => {
    const h = harness();
    await h.create('cur');
    h.steps('cur', 6);
    await h.ask({ type: 'saveSlot', dishId: 'cur', slotId: 'slot2', name: 'Mine' });
    expect((await h.answer(null, 'cur')).plan).toEqual({ kind: 'saved', slotId: 'slot2', name: 'Mine' });
    const before = await h.slotState();
    const s = await h.started('v', 'cur', { kind: 'variant', variantId: 'R-G1' });
    expect(s.kept).toMatchObject({ kind: 'saved', replaced: null, name: 'Mine', autosaved: false });
    expect(s.kept.slot?.slotId).toBe('slot2');
    expect(await h.slotState()).toEqual(before);
    // Once it has changed, it goes to its own slot again as before.
    h.steps('v', 3);
    await h.ask({ type: 'saveSlot', dishId: 'v', slotId: 'slot4', name: 'Idea' });
    h.steps('v', 1);
    expect((await h.answer(null, 'v')).plan).toEqual({ kind: 'slot', slotId: 'slot4', own: true, name: 'Idea' });
  });
});
