/**
 * P4.11 DEMO_MODE through the real DishHost (as sim.worker.ts drives it, with `{ demo: demoScope(registry) }`):
 * every request that would open a world the demo cannot hold — Import (a save file), Saved dishes → Open,
 * a Starting recipe file, Import recipe ID, New Dish / Play (create, with and without keepFrom), What if?
 * Start and an experiment card — is refused on the PREPARED world BEFORE the open dish is kept (D-0033):
 * the open dish keeps its state hash and its run state, no slot or record is written (MemoryBackend), and the
 * reply says "this dish needs the full version of Pixelmeba (it uses …)". With demo off, the same requests
 * succeed.
 */
import { describe, expect, it } from 'vitest';
import { demoScope, type DemoScope } from '../../src/platform/demoScope';
import { formatRecipeId } from '../../src/persistence/recipeId';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import { stateHash } from '../../src/sim/serialize';
import { DishHost } from '../../src/worker/host';
import { DEMO_REFUSAL_KIND, type DishSource, type FromWorker, type KeepFrom, type ToWorker } from '../../src/worker/protocol';
import { registry } from '../helpers/world';

const REG = registry();
const SCOPE = demoScope(REG);
const GARDEN: DishSource = { kind: 'recipe', recipeId: 'FIRST_DISH_V1' };
const OTHER = 'CLEANING_CREW_V1';
const OTHER_NAME = REG.recipes[OTHER]!.name;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Of<T extends FromWorker['type']> = Extract<FromWorker, { type: T }>;

function harness(demo: DemoScope | null, backend = new MemoryBackend()) {
  let now = 0;
  let req = 0;
  let fresh = 0;
  const out: FromWorker[] = [];
  const host = new DishHost(REG, (m) => out.push(m), { now: () => now, iso: () => '2026-10-12T00:00:00.000Z' }, new SaveStore(backend), true, undefined, { demo });
  const h = {
    host,
    out,
    backend,
    async ask(msg: DistributiveOmit<ToWorker, 'requestId'>): Promise<FromWorker> {
      const requestId = ++req;
      host.handle({ ...msg, requestId } as ToWorker);
      const deadline = Date.now() + 60_000;
      for (;;) {
        const reply = out.find((m) => 'requestId' in m && m.requestId === requestId);
        if (reply) return reply;
        if (Date.now() > deadline) throw new Error(`no reply to ${msg.type}`);
        await new Promise((r) => setTimeout(r, 2));
      }
    },
    async create(dishId: string, source: DishSource = GARDEN): Promise<void> {
      const r = await h.ask({ type: 'create', dishId, source });
      if (r.type !== 'ready') throw new Error(JSON.stringify(r));
    },
    hash: (dishId: string) => stateHash(host.world(dishId)!),
    tick: (dishId: string) => host.world(dishId)!.tick,
    steps(dishId: string, n: number): void {
      for (let k = 0; k < n; k++) host.handle({ type: 'step', dishId });
    },
    frame(ms: number): void {
      now += ms;
      host.pump();
    },
    storeState: () => JSON.stringify({ slots: backend.slots, records: Object.keys(backend.records).sort() }),
    nextId: () => `new-${++fresh}`,
  };
  return h;
}
type H = ReturnType<typeof harness>;

const keep = (dishId: string): KeepFrom => ({ dishId, keep: { kind: 'auto' } });

/** A full-build save that needs absent content: the Garden with Dusk (B03) added, after a few ticks. */
async function fullSaveWithDusk(): Promise<string> {
  const full = harness(null);
  await full.create('g');
  const r = await full.ask({ type: 'command', dishId: 'g', commandId: 'c1', payload: { kind: 'inoculate', speciesId: 'B03', x: 64, y: 64, radius: 3, count: 4 }, undoable: true });
  if (r.type !== 'ack' || !r.result?.accepted) throw new Error('inoculate refused');
  full.steps('g', 3);
  const e = await full.ask({ type: 'exportDish', dishId: 'g', strip: false });
  return (e as Of<'exported'>).text;
}

/** The demo's Starting recipe file for another recipe (written by the full build). */
async function otherRecipeFile(): Promise<string> {
  const full = harness(null);
  await full.create('o', { kind: 'recipe', recipeId: OTHER });
  const e = await full.ask({ type: 'recipeExport', dishId: 'o' });
  return (e as Of<'recipeExported'>).text;
}

/**
 * A demo session with a changed, RUNNING open dish ('cur'): any keep would write a slot and pause it. The
 * backend already holds a full-build save with Dusk in slot5 (as if written by the full app on this device).
 */
async function demoSession(demo: DemoScope | null = SCOPE): Promise<H> {
  const backend = new MemoryBackend();
  const full = harness(null, backend);
  const text = await fullSaveWithDusk();
  const imp = await full.ask({ type: 'importDish', text, newDishId: 'dusk' });
  if (imp.type !== 'loaded') throw new Error(JSON.stringify(imp));
  const saved = await full.ask({ type: 'saveSlot', dishId: 'dusk', slotId: 'slot5', name: 'Dusk dish' });
  if (saved.type !== 'slotSaved') throw new Error(JSON.stringify(saved));
  const h = harness(demo, backend);
  await h.create('cur');
  h.steps('cur', 7);
  h.host.handle({ type: 'setSpeed', dishId: 'cur', speed: 1 });
  return h;
}

/** The refused request leaves everything as it was: same hash, still running, nothing written, no new dish. */
async function expectRefused(h: H, request: () => Promise<FromWorker>, reason: RegExp): Promise<FromWorker> {
  const hash = h.hash('cur');
  const tick = h.tick('cur');
  const stored = h.storeState();
  const reply = await request();
  expect(h.hash('cur')).toBe(hash);
  expect(h.storeState()).toBe(stored);
  expect(h.host.activeDishId).toBe('cur');
  // Its run state too: the next frames still run it (a keep would have paused it).
  h.frame(250);
  expect(h.tick('cur')).toBeGreaterThan(tick);
  if (reply.type === 'error') {
    expect(reply.message).toMatch(reason);
    expect(reply.paused).toBe(false);
  } else if (reply.type === 'whatIfRefused') expect(reply.message).toMatch(reason);
  else throw new Error(`expected a refusal, got ${JSON.stringify(reply).slice(0, 300)}`);
  return reply;
}

const NEEDS = (names: string) => new RegExp(`^this dish needs the full version of Pixelmeba \\(it uses ${names}\\)$`);

describe('P4.11 DEMO_MODE: a world the demo cannot hold is refused before anything is kept', () => {
  it('Import (a .pixelmeba save with Dusk): the D-0083 reason, kind "demo", nothing written', async () => {
    const h = await demoSession();
    const text = await fullSaveWithDusk();
    const r = await expectRefused(h, () => h.ask({ type: 'importDish', text, newDishId: h.nextId(), keepFrom: keep('cur') }), NEEDS('Dusk'));
    expect((r as Of<'error'>).kind).toBe(DEMO_REFUSAL_KIND);
    expect((r as Of<'error'>).request).toBe('importDish');
  });

  it('Saved dishes → Open (slot5 holds a full-build dish with Dusk)', async () => {
    const h = await demoSession();
    const r = await expectRefused(h, () => h.ask({ type: 'loadSlot', slotId: 'slot5', newDishId: h.nextId(), keepFrom: keep('cur') }), NEEDS('Dusk'));
    expect((r as Of<'error'>).kind).toBe(DEMO_REFUSAL_KIND);
  });

  it('a Starting recipe file of another recipe', async () => {
    const h = await demoSession();
    const text = await otherRecipeFile();
    const r = await expectRefused(h, () => h.ask({ type: 'recipeImport', text, newDishId: h.nextId(), keepFrom: keep('cur') }), /^this dish needs the full version of Pixelmeba \(it uses /);
    expect((r as Of<'error'>).message).toContain(OTHER_NAME);
  });

  it('Import recipe ID of another recipe', async () => {
    const h = await demoSession();
    const id = formatRecipeId(OTHER, REG.recipes[OTHER]!.revision, REG.recipes[OTHER]!.seed);
    const r = await expectRefused(h, () => h.ask({ type: 'recipeIdStart', id, newDishId: h.nextId(), keepFrom: keep('cur') }), /^this dish needs the full version of Pixelmeba \(it uses /);
    expect((r as Of<'error'>).message).toContain(OTHER_NAME);
  });

  it('New Dish on another habitat (create with keepFrom) and a plain create', async () => {
    const h = await demoSession();
    const gel: DishSource = { kind: 'recipe', recipeId: 'FIRST_DISH_V1', overrides: { habitatId: 'GEL_COLONY', empty: true } };
    await expectRefused(h, () => h.ask({ type: 'create', dishId: h.nextId(), source: gel, keepFrom: keep('cur') }), NEEDS('Gel Colony'));
    const id = h.nextId();
    await expectRefused(h, () => h.ask({ type: 'create', dishId: id, source: { kind: 'recipe', recipeId: OTHER } }), /^this dish needs the full version of Pixelmeba \(it uses /);
    expect(h.host.world(id)).toBeNull();
  });

  it('What if? Start of an idea outside the scope (a narrower scope stands in for one)', async () => {
    const h = await demoSession({ ...SCOPE, variants: SCOPE.variants.filter((v) => v !== 'R-G3') });
    const r = await expectRefused(
      h,
      () => h.ask({ type: 'whatIfStart', newDishId: h.nextId(), fromDishId: 'cur', pick: { kind: 'variant', variantId: 'R-G3' }, keep: { kind: 'auto' } }),
      /^Couldn't start: this dish needs the full version of Pixelmeba \(it uses Dinner farther away\)\. Nothing changed\.$/,
    );
    expect(r.type).toBe('whatIfRefused');
  });

  it('an experiment card (the demo has none)', async () => {
    const h = await demoSession();
    await expectRefused(
      h,
      () => h.ask({ type: 'experimentStart', cardId: 'EXP_103', newDishId: h.nextId(), compare: null, keepFrom: keep('cur') }),
      new RegExp(`^this dish needs the full version of Pixelmeba \\(it uses ${REG.experiments.EXP_103!.title}\\)$`),
    );
  });

  it('in scope, the demo opens as before: the Garden, every R-G idea, the empty Water Garden, a demo save', async () => {
    const h = await demoSession();
    const ready = await h.ask({ type: 'create', dishId: h.nextId(), source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1', overrides: { empty: true } }, keepFrom: keep('cur') });
    expect(ready.type).toBe('ready');
    const from = h.host.activeDishId!;
    for (const v of SCOPE.variants) {
      const r = await h.ask({ type: 'whatIfStart', newDishId: h.nextId(), fromDishId: from, pick: { kind: 'variant', variantId: v }, keep: { kind: 'auto' } });
      expect(r.type, v).toBe('whatIfStarted');
    }
  });
});

describe('P4.11: with demo off the same requests succeed', () => {
  it('import, open, recipe file, recipe ID, other habitat, other recipe and the experiment all open', async () => {
    const h = await demoSession(null);
    const text = await fullSaveWithDusk();
    expect((await h.ask({ type: 'importDish', text, newDishId: h.nextId(), keepFrom: keep('cur') })).type).toBe('loaded');
    expect((await h.ask({ type: 'loadSlot', slotId: 'slot5', newDishId: h.nextId(), keepFrom: { dishId: h.host.activeDishId, keep: { kind: 'auto' } } })).type).toBe('loaded');
    expect((await h.ask({ type: 'recipeImport', text: await otherRecipeFile(), newDishId: h.nextId(), keepFrom: { dishId: h.host.activeDishId, keep: { kind: 'auto' } } })).type).toBe('loaded');
    const id = formatRecipeId(OTHER, REG.recipes[OTHER]!.revision, REG.recipes[OTHER]!.seed);
    expect((await h.ask({ type: 'recipeIdStart', id, newDishId: h.nextId(), keepFrom: { dishId: h.host.activeDishId, keep: { kind: 'auto' } } })).type).toBe('ready');
    const gel: DishSource = { kind: 'recipe', recipeId: 'FIRST_DISH_V1', overrides: { habitatId: 'GEL_COLONY', empty: true } };
    expect((await h.ask({ type: 'create', dishId: h.nextId(), source: gel, keepFrom: { dishId: h.host.activeDishId, keep: { kind: 'auto' } } })).type).toBe('ready');
    expect((await h.ask({ type: 'create', dishId: h.nextId(), source: { kind: 'recipe', recipeId: OTHER } })).type).toBe('ready');
    const exp = await h.ask({ type: 'experimentStart', cardId: 'EXP_103', newDishId: h.nextId(), compare: null, keepFrom: { dishId: h.host.activeDishId, keep: { kind: 'auto' } } });
    expect(exp.type).toBe('experimentStarted');
  });
});

describe('P4.11 fix round 1: the demo worker refuses a command that adds a species outside the scope', () => {
  const dusk = { kind: 'inoculate', speciesId: 'B03', x: 64, y: 64, radius: 3, count: 4 } as const;

  it('Add Life of Dusk: refused before applyNow (same hash, no undo point, nothing written); a Sunbead is added', async () => {
    const h = harness(SCOPE);
    await h.create('cur');
    h.steps('cur', 3);
    const hash = h.hash('cur');
    const stored = h.storeState();
    const r = await h.ask({ type: 'command', dishId: 'cur', commandId: 'c-dusk', payload: dusk, undoable: true });
    expect(r.type).toBe('ack');
    expect((r as Of<'ack'>).result).toBeNull();
    expect((r as Of<'ack'>).error).toBe('Dusk needs the full version of Pixelmeba. Nothing changed.');
    expect(h.hash('cur')).toBe(hash);
    expect(h.storeState()).toBe(stored);
    // No undo point was taken: there is nothing to undo.
    const u = await h.ask({ type: 'undo', dishId: 'cur' });
    expect((u as Of<'ack'>).error).toBe('nothing to undo');
    const ok = await h.ask({ type: 'command', dishId: 'cur', commandId: 'c-sun', payload: { ...dusk, speciesId: 'A01' }, undoable: true });
    expect((ok as Of<'ack'>).result?.accepted).toBeGreaterThan(0);
    // The dish still opens in the demo after a save (the player can never make a dish the demo refuses).
    const saved = await h.ask({ type: 'saveSlot', dishId: 'cur', slotId: 'slot1', name: 'Mine' });
    expect(saved.type).toBe('slotSaved');
    expect((await h.ask({ type: 'loadSlot', slotId: 'slot1', newDishId: h.nextId() })).type).toBe('loaded');
  });

  it('with demo off the same Add Life of Dusk is accepted', async () => {
    const h = harness(null);
    await h.create('cur');
    const r = await h.ask({ type: 'command', dishId: 'cur', commandId: 'c-dusk', payload: dusk, undoable: true });
    expect((r as Of<'ack'>).error).toBeUndefined();
    expect((r as Of<'ack'>).result?.accepted).toBeGreaterThan(0);
  });
});

describe('P4.11 lead: the demo worker refuses compareStart (the demo has no Compare)', () => {
  it('a crafted compareStart is refused before arm B exists; with demo off it opens', async () => {
    const h = harness(SCOPE);
    await h.create('cur');
    const hash = h.hash('cur');
    const stored = h.storeState();
    const r = await h.ask({ type: 'compareStart', sourceDishId: 'cur', compareId: 'cmp', aDishId: 'ca', bDishId: 'cb' });
    expect(r.type).toBe('error');
    expect(JSON.stringify(r)).toContain('Compare needs the full version of Pixelmeba. Nothing changed.');
    expect(h.hash('cur')).toBe(hash);
    expect(h.storeState()).toBe(stored);
    const off = harness(null);
    await off.create('cur');
    const ok = await off.ask({ type: 'compareStart', sourceDishId: 'cur', compareId: 'cmp', aDishId: 'ca', bDishId: 'cb' });
    expect(ok.type).toBe('compareState');
  });
});
