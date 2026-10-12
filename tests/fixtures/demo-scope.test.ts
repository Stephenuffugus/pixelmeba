/**
 * SPEC §17 'demo-scope' (P4.11; ARCH §14; D09 §10 lines 209-211; CONFLICT_REGISTER R22).
 *
 * - demoScope(registry) is read from content: exactly the five phase-1 species, the Garden, its four What if?
 *   ideas (R-G0…R-G3) and the Garden's habitat;
 * - a Garden save and every R-G start made by the FULL build pass demoProblem (the demo can hold them whole);
 * - a save holding a species outside the scope (added by a command), an experiment arm and another habitat's
 *   dish fail with the exact display names;
 * - the demo build and the full build write the same file (format and contentHash) from the same dish, and a
 *   demo-made save loads in the full build with an equal stateHash (the full build ignores the scope).
 */
import { describe, expect, it } from 'vitest';
import { demoCommandProblem, demoCommandReason, demoNames, demoProblem, demoReason, demoScope, type DemoScope } from '../../src/platform/demoScope';
import { loadSaveFile } from '../../src/persistence/saveFile';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import { realizeExperimentArms } from '../../src/sim/experiments';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { realizeVariant } from '../../src/sim/variants';
import type { World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import type { DishSource, FromWorker, ToWorker } from '../../src/worker/protocol';
import { registry } from '../helpers/world';

const REG = registry();
const SCOPE = demoScope(REG);
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** The real DishHost as sim.worker.ts drives it, with a fixed clock and an in-memory store. */
function host(demo: DemoScope | null) {
  let req = 0;
  const out: FromWorker[] = [];
  const h = new DishHost(REG, (m) => out.push(m), { now: () => 0, iso: () => '2026-10-12T00:00:00.000Z' }, new SaveStore(new MemoryBackend()), true, undefined, { demo });
  const ask = async (msg: DistributiveOmit<ToWorker, 'requestId'>): Promise<FromWorker> => {
    const requestId = ++req;
    h.handle({ ...msg, requestId } as ToWorker);
    const deadline = Date.now() + 60_000;
    for (;;) {
      const reply = out.find((m) => 'requestId' in m && m.requestId === requestId);
      if (reply) return reply;
      if (Date.now() > deadline) throw new Error(`no reply to ${msg.type}`);
      await new Promise((r) => setTimeout(r, 2));
    }
  };
  return {
    host: h,
    ask,
    async create(dishId: string, source: DishSource): Promise<World> {
      const r = await ask({ type: 'create', dishId, source });
      if (r.type !== 'ready') throw new Error(JSON.stringify(r));
      return h.world(dishId)!;
    },
    steps(dishId: string, n: number): void {
      for (let k = 0; k < n; k++) h.handle({ type: 'step', dishId });
    },
    async command(dishId: string, payload: Extract<ToWorker, { type: 'command' }>['payload']): Promise<void> {
      const r = await ask({ type: 'command', dishId, commandId: `c${req}`, payload, undoable: true });
      if (r.type !== 'ack' || !r.result?.accepted) throw new Error(`command refused: ${JSON.stringify(r).slice(0, 300)}`);
    },
    async export(dishId: string): Promise<string> {
      const r = await ask({ type: 'exportDish', dishId, strip: false });
      if (r.type !== 'exported') throw new Error(JSON.stringify(r));
      return r.text;
    },
  };
}

const GARDEN: DishSource = { kind: 'recipe', recipeId: 'FIRST_DISH_V1' };

describe('demo-scope: the scope is read from content', () => {
  it('is exactly the five phase-1 species, the Garden, R-G0…R-G3 and the Water Garden', () => {
    expect(SCOPE).toEqual({
      species: ['A01', 'B01', 'B04', 'B06', 'P01'],
      recipes: ['FIRST_DISH_V1'],
      variants: ['R-G0', 'R-G1', 'R-G2', 'R-G3'],
      habitats: ['WATER_GARDEN'],
    });
    // Names, as the demo's Add Life and Field Guide show them.
    expect(SCOPE.species.map((id) => REG.species[id]!.name)).toEqual(['Sunbead', 'Sprinter', 'Recycler', 'Crumbsmith', 'Amoeba']);
  });

  it('names: up to three, then "and n more"', () => {
    expect(demoNames(['Dusk'])).toBe('Dusk');
    expect(demoNames(['Dusk', 'Velvet'])).toBe('Dusk and Velvet');
    expect(demoNames(['Dusk', 'Velvet', 'Threadlace'])).toBe('Dusk, Velvet and Threadlace');
    expect(demoNames(['Dusk', 'Velvet', 'Threadlace', 'Ciliate', 'Gel Colony'])).toBe('Dusk, Velvet, Threadlace and 2 more');
    expect(demoReason({ ids: ['B03', 'B05'], names: ['Dusk', 'Velvet'] })).toBe('this dish needs the full version of Pixelmeba (it uses Dusk and Velvet)');
  });
});

describe('demo-scope: what the full build makes', () => {
  it('a Garden save (after a run) and every R-G start pass', async () => {
    const full = host(null);
    await full.create('g', GARDEN);
    full.steps('g', 30);
    const { world } = await loadSaveFile(await full.export('g'));
    expect(demoProblem(world, SCOPE, REG)).toBeNull();
    for (const v of ['R-G0', 'R-G1', 'R-G2', 'R-G3']) expect(demoProblem(await realizeVariant(REG, v, { worldId: v }), SCOPE, REG), v).toBeNull();
    // An empty Water Garden (New Dish "Empty Water Garden") is in scope too.
    expect(demoProblem(realizeRecipe(REG, 'FIRST_DISH_V1', { transform: (r) => ({ ...r, founders: [], fieldPatches: [], scheduledCommands: [] }) }), SCOPE, REG)).toBeNull();
  });

  it('a Garden with Dusk (B03) and Ciliate (P02) added by commands fails with exactly those names', async () => {
    const full = host(null);
    await full.create('g', GARDEN);
    await full.command('g', { kind: 'inoculate', speciesId: 'B03', x: 64, y: 64, radius: 3, count: 5 });
    await full.command('g', { kind: 'inoculate', speciesId: 'P02', x: 60, y: 60, radius: 3, count: 1 });
    full.steps('g', 3);
    const { world } = await loadSaveFile(await full.export('g'));
    const p = demoProblem(world, SCOPE, REG)!;
    expect(p.ids).toEqual(['B03', 'P02']);
    expect(demoReason(p)).toBe('this dish needs the full version of Pixelmeba (it uses Dusk and Ciliate)');
  });

  it('an experiment arm fails with the card (and whatever else it uses)', () => {
    const arms = realizeExperimentArms(REG, 'EXP_103', { worldIds: { A: 'a', B: 'b' } });
    const p = demoProblem(arms.A, SCOPE, REG)!;
    expect(p).not.toBeNull();
    expect(p.ids).toContain('EXP_103');
    expect(p.names).toContain(REG.experiments.EXP_103!.title);
    // Its recipe is not the Garden, so it is named too.
    expect(p.ids).toContain(REG.experiments.EXP_103!.recipeId);
  });

  it("another habitat's dish fails with the habitat's name", async () => {
    const full = host(null);
    const w = await full.create('gel', { kind: 'recipe', recipeId: 'FIRST_DISH_V1', overrides: { habitatId: 'GEL_COLONY', empty: true } });
    const p = demoProblem(w, SCOPE, REG)!;
    expect(p).toEqual({ ids: ['GEL_COLONY'], names: ['Gel Colony'] });
  });

  it('a species held in the sample counts (the sample is part of the dish)', async () => {
    const full = host(null);
    const w = await full.create('g', GARDEN);
    await full.command('g', { kind: 'inoculate', speciesId: 'B03', x: 30, y: 64, radius: 2, count: 3 });
    const held = demoProblem(w, SCOPE, REG);
    expect(held?.ids).toEqual(['B03']);
    // Moving every Dusk into a hand-made sample row keeps it named: alive rows and sample rows are both read.
    const c = w.ents.cols;
    const b03 = w.species.findIndex((s) => s.id === 'B03');
    const rows: { slot: number; cols: Record<string, number> }[] = [];
    for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && c.species[i] === b03) rows.push({ slot: i, cols: { species: b03 } });
    const probe = { ...w, ents: { ...w.ents, highWater: 0 }, sample: { rows } } as unknown as World;
    expect(demoProblem(probe, SCOPE, REG)?.ids).toEqual(['B03']);
  });
});

describe('demo-scope: one save format', () => {
  it('the demo build and the full build write the same file from the same dish; a demo save loads in the full build with an equal stateHash', async () => {
    const demo = host(SCOPE);
    const full = host(null);
    const dw = await demo.create('d', GARDEN);
    await full.create('d', GARDEN);
    for (const h of [demo, full]) {
      await h.command('d', { kind: 'inoculate', speciesId: 'P01', x: 64, y: 64, radius: 3, count: 2 });
      h.steps('d', 20);
    }
    const demoText = await demo.export('d');
    expect(demoText).toBe(await full.export('d'));
    const file = JSON.parse(demoText) as { contentHash?: string; versions?: { contentHash?: string } };
    expect(JSON.stringify(file)).toContain(REG.manifest.contentHash);
    // The full build opens the demo's file whole: the same state, the same hash.
    const r = await full.ask({ type: 'importDish', text: demoText, newDishId: 'imported' });
    expect(r.type).toBe('loaded');
    expect(stateHash(full.host.world('imported')!)).toBe(stateHash(dw));
  });
});

describe('demo-scope: commands that would bring a species outside the scope into the dish (fix round 1)', () => {
  /** A living organism's birthId of `speciesId` in `w` (for saveSpecimen from: 'organism'). */
  const birthOf = (w: World, speciesId: string): number => {
    const s = w.species.findIndex((sp) => sp.id === speciesId);
    const c = w.ents.cols;
    for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && c.species[i] === s) return c.birthId[i]!;
    throw new Error(`no living ${speciesId}`);
  };

  it('Add Life of Dusk is a problem; of the five it is not; other commands never are', async () => {
    const full = host(null);
    const w = await full.create('g', GARDEN);
    const dusk = { kind: 'inoculate', speciesId: 'B03', x: 64, y: 64, radius: 3, count: 4 } as const;
    expect(demoCommandProblem(w, dusk, SCOPE, REG)).toEqual({ ids: ['B03'], names: ['Dusk'] });
    expect(demoCommandReason(demoCommandProblem(w, dusk, SCOPE, REG)!)).toBe('Dusk needs the full version of Pixelmeba. Nothing changed.');
    for (const id of SCOPE.species) expect(demoCommandProblem(w, { ...dusk, speciesId: id }, SCOPE, REG), id).toBeNull();
    expect(demoCommandProblem(w, { kind: 'setLid', lid: 'closed' }, SCOPE, REG)).toBeNull();
  });

  it('placing a saved specimen of Dusk is a problem (a Sunbead specimen is not)', async () => {
    const full = host(null);
    await full.create('g', GARDEN);
    await full.command('g', { kind: 'inoculate', speciesId: 'B03', x: 64, y: 64, radius: 3, count: 4 });
    const w = full.host.world('g')!;
    await full.command('g', { kind: 'lineage', op: 'saveSpecimen', from: 'organism', id: birthOf(w, 'B03') });
    await full.command('g', { kind: 'lineage', op: 'saveSpecimen', from: 'organism', id: birthOf(w, 'A01') });
    const specimens = full.host.world('g')!.branches.specimens ?? [];
    const duskNo = specimens.find((sp) => sp.speciesId === 'B03')!.id;
    const sunNo = specimens.find((sp) => sp.speciesId === 'A01')!.id;
    const spawn = (specimen: number) => ({ kind: 'lineage', op: 'spawnSpecimen', specimen, x: 30, y: 30, radius: 2, count: 2 }) as const;
    expect(demoCommandProblem(full.host.world('g')!, spawn(duskNo), SCOPE, REG)).toEqual({ ids: ['B03'], names: ['Dusk'] });
    expect(demoCommandProblem(full.host.world('g')!, spawn(sunNo), SCOPE, REG)).toBeNull();
  });
});
