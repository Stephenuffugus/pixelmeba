/**
 * P2.2 fixture: registry imports (BUILD_DIRECTIVE P2.2 "Done when"; SPEC §8.1, §9, §14.3–§14.5).
 *
 *   1. A save that references a module this build does not have fails import clearly: a readable
 *      message naming the ability, a SaveFileError, and nothing built (the host adds no dish and the
 *      open dish is untouched).
 *   2. Changing the active registry (this build's content) never mutates an existing save's
 *      candidates, genomes or recorded registry: the same save loaded by a host whose content changed
 *      (module numbers, eligibility, enabled list and registry version) keeps everything it recorded,
 *      hashes the same and evolves exactly like the original.
 *   3. Export metadata shows the enabled registry (module ids and registry version), always taken from
 *      the world; files without it still load.
 */
import { describe, expect, it } from 'vitest';
import type { ContentRegistry } from '../../src/sim/content/registry';
import type { ModuleDef } from '../../src/sim/content/schema';
import {
  buildSaveFile,
  loadSaveFile,
  saveMetaRegistry,
  SaveFileError,
  type SaveFile,
} from '../../src/persistence/saveFile';
import { canonicalJson, sha256Hex } from '../../src/sim/hash';
import { eligibleGains } from '../../src/sim/modules';
import { realizeRecipe } from '../../src/sim/recipes';
import { serializeWorld, stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import type { DishInfo, FromWorker } from '../../src/worker/protocol';
import { clearWater, place, preFlipRegistry, registry } from '../helpers/world';

const SAVED_AT = '2026-09-28T00:00:00Z';
/** The modules the shipped manifest enables (moduleRegistryVersion 3 since the organism flip, D-0127). */
const SHIPPED_MODULES = ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09', 'E10', 'E11', 'E12'];
/** The modules a dish recorded before the organism flip enables (moduleRegistryVersion 2, D-0059). */
const PRE_FLIP_MODULES = ['E01', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09', 'E10', 'E12'];

/** The parts of a saved state these tests edit, as plain mutable JSON. */
interface Editable {
  content: { modules: ModuleDef[]; manifest: { enabledModules: string[] } };
  genomes: { ancestor: string; modules: string[] }[];
}

/** Re-stamp a file after editing its state, so only the edit (never the checksum) can refuse it. */
async function restamp(file: SaveFile): Promise<string> {
  return JSON.stringify({ ...file, checksum: `sha256:${await sha256Hex(canonicalJson(file.state))}` });
}

async function savedGarden(): Promise<{ world: World; text: string }> {
  const world = realizeRecipe(registry(), 'FIRST_DISH_V1', { seed: 104729, worldId: 'registry-fixture' });
  run(world, 50);
  const { text } = await buildSaveFile(world, {
    name: 'Registry fixture',
    savedAt: SAVED_AT,
    recipeId: 'FIRST_DISH_V1',
  });
  return { world, text };
}

/** A host with a fake clock and no storage; returns the host and everything it posted. */
function makeHost(reg: ContentRegistry): { host: DishHost; out: FromWorker[] } {
  const out: FromWorker[] = [];
  const host = new DishHost(reg, (m) => out.push(m), { now: () => 0 });
  return { host, out };
}

/** Wait for the reply to an asynchronous request (import runs through handleAsync). */
async function reply(out: FromWorker[], requestId: number): Promise<FromWorker> {
  for (let k = 0; k < 200; k++) {
    const m = out.find((x) => 'requestId' in x && x.requestId === requestId);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`no reply to request ${requestId}`);
}

describe('P2.2 fixture: registry imports', () => {
  it('a save whose recorded registry has a module this build cannot simulate is refused by name; nothing is built', async () => {
    const reg = registry();
    const { text } = await savedGarden();
    const file = JSON.parse(text) as SaveFile;
    // Partner bond (CT §7.1): real content, Phase 7, not simulated in this build (E07 was the example until P3.7
    // implemented it, E02 until the organism flip, D-0127).
    const e16 = reg.modules.E16!;
    const state = file.state as unknown as Editable;
    state.content.modules = [...state.content.modules, e16].sort((a, b) => a.id.localeCompare(b.id));
    state.content.manifest.enabledModules = state.content.modules.map((m) => m.id);
    // A Sprinter (B01, eligible for E16) carries it.
    const a01 = state.genomes.findIndex((g) => g.ancestor === 'B01');
    state.genomes[a01] = { ...state.genomes[a01]!, modules: ['E16'] };
    const bad = await restamp(file);

    const err = await loadSaveFile(bad).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SaveFileError);
    expect(err).toMatchObject({ kind: 'content' });
    expect((err as Error).message).toBe(
      'This dish uses the extra ability "Partner bond" (E16), which this version of Pixelmeba cannot simulate. Nothing was loaded.',
    );

    // Through the worker's import path: an error reply with that message, no dish, the open dish untouched.
    const { host, out } = makeHost(reg);
    host.handle({
      type: 'create',
      requestId: 1,
      dishId: 'open',
      source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' },
    });
    const before = stateHash(host.world('open')!);
    host.handle({ type: 'importDish', requestId: 2, text: bad, newDishId: 'imported' });
    const r = await reply(out, 2);
    expect(r).toMatchObject({ type: 'error', paused: false, request: 'importDish' });
    expect(r.type === 'error' ? r.message : '').toContain('"Partner bond" (E16)');
    expect(host.world('imported')).toBeNull();
    expect(stateHash(host.world('open')!)).toBe(before);
    expect(host.activeDishId).toBe('open');
  });

  it('a module from a newer build is named even when this build cannot read its definition', async () => {
    const { text } = await savedGarden();
    const withFuture = async (def: Record<string, unknown>): Promise<unknown> => {
      const file = JSON.parse(text) as SaveFile;
      const state = file.state as unknown as {
        content: { modules: unknown[]; manifest: { enabledModules: string[] } };
      };
      state.content.modules = [...state.content.modules, def];
      state.content.manifest.enabledModules = [...state.content.manifest.enabledModules, 'E18'];
      return loadSaveFile(await restamp(file)).catch((e: unknown) => e);
    };
    const e05 = registry().modules.E05!;
    // Same shape as this build's modules, and a shape this build's schema rejects (a later phase number).
    for (const def of [
      { ...e05, id: 'E18', name: 'Future ability' },
      { ...e05, id: 'E18', name: 'Future ability', phase: 8 },
    ]) {
      const err = await withFuture(def);
      expect(err).toBeInstanceOf(SaveFileError);
      expect(err).toMatchObject({
        kind: 'content',
        message:
          'This dish uses the extra ability "Future ability" (E18), which this version of Pixelmeba cannot simulate. Nothing was loaded.',
      });
    }
    // Without a readable name, the id alone is named.
    expect(await withFuture({ id: 'E18', phase: 8 })).toMatchObject({
      kind: 'content',
      message:
        'This dish uses the extra ability "E18", which this version of Pixelmeba cannot simulate. Nothing was loaded.',
    });
  });

  it('a genome carrying a module missing from its recorded registry, or a registry that disagrees with its manifest, is refused too', async () => {
    const { text } = await savedGarden();
    const f1 = JSON.parse(text) as SaveFile;
    const s1 = f1.state as unknown as Editable;
    const b01 = s1.genomes.findIndex((g) => g.ancestor === 'B01');
    // E13 (Phase 5) is in the catalog but not in this save's recorded registry (E09 was the example
    // until the Phase 3 module flip enabled it, D-0059).
    s1.genomes[b01] = { ...s1.genomes[b01]!, modules: ['E13'] };
    await expect(loadSaveFile(await restamp(f1))).rejects.toMatchObject({
      kind: 'integrity',
      message: 'A genome refers to unknown module E13.',
    });

    const f2 = JSON.parse(text) as SaveFile;
    (f2.state as unknown as Editable).content.manifest.enabledModules = ['E01', 'E05'];
    await expect(loadSaveFile(await restamp(f2))).rejects.toMatchObject({
      kind: 'content',
      message: "The dish's list of extra abilities does not match its manifest.",
    });
  });

  it('a changed active registry never touches an existing save: registry, genomes and candidates as recorded; same future', async () => {
    const reg = registry();
    // A dish with evolved modules and open branch candidates: Accelerated Sprinters in sugar water
    // (many births quickly, so module gains and candidates appear within a short run). Recorded before the
    // organism flip (registry version 2, D-0059), so the build below (version 3) is newer than the dish.
    const world = clearWater(
      {
        mutationPreset: 'accelerated',
        backgroundOverrides: { sugar: 0.5 },
        seed: 101,
      },
      preFlipRegistry(),
    );
    for (let k = 0; k < 40; k++) place(world, 'B01', 40.5 + (k % 8) * 6, 40.5 + Math.floor(k / 8) * 10);
    run(world, 350);
    expect(serializeWorld(world).genomes.filter((g) => g.modules.length > 0).length).toBeGreaterThan(0);
    expect(Object.keys(world.branches.candidates).length + world.branches.branches.length).toBeGreaterThan(0);
    const { text } = await buildSaveFile(world, {
      name: 'Evolved',
      savedAt: SAVED_AT,
      recipeId: 'FIRST_DISH_V1',
    });
    const recorded = JSON.parse(text) as SaveFile;
    const hash = stateHash(world);

    // This build's content changes: E05 numbers and E01 eligibility change, E03 is no longer enabled,
    // and the registry version moves on.
    const e05 = reg.modules.E05!;
    const e01 = reg.modules.E01!;
    const changed: ContentRegistry = {
      ...reg,
      manifest: {
        ...reg.manifest,
        enabledModules: ['E01', 'E05'],
        moduleRegistryVersion: 3,
        contentHash: 'changed-for-test',
      },
      modules: {
        ...reg.modules,
        E05: { ...e05, surchargePerSecond: 0.05, params: { ...e05.params, capacityBonus: 60 } },
        E01: { ...e01, eligibleAncestors: ['B02'] },
      },
    };
    // The change is real: a new dish in the changed build records the new registry.
    const fresh = realizeRecipe(changed, 'FIRST_DISH_V1', { worldId: 'fresh' });
    expect(fresh.content.modules.map((m) => m.id)).toEqual(['E01', 'E05']);
    expect(fresh.content.modules.find((m) => m.id === 'E05')!.params.capacityBonus).toBe(60);
    expect(fresh.content.manifest.moduleRegistryVersion).toBe(3);

    // The old save opened by the changed build.
    const { host, out } = makeHost(changed);
    host.handle({ type: 'importDish', requestId: 1, text, newDishId: 'old' });
    const r = await reply(out, 1);
    expect(r.type).toBe('loaded');
    const info = (r as { info: DishInfo }).info;
    const loaded = host.world('old')!;
    expect(stateHash(loaded)).toBe(hash);
    const again = serializeWorld(loaded);
    expect(again.content.modules).toEqual(recorded.state.content.modules);
    expect(again.content.manifest).toEqual(recorded.state.content.manifest);
    expect(again.genomes).toEqual(recorded.state.genomes);
    expect(again.branches).toEqual(recorded.state.branches);
    expect(loaded.content.modules.find((m) => m.id === 'E05')!.params.capacityBonus).toBe(40);
    // Eligibility follows the recorded registry: a Sprinter can still gain E01, E03, E04, E10 and E12 in this dish.
    expect(eligibleGains(loaded, { ancestor: 'B01', modules: [] })).toEqual(['E01', 'E03', 'E04', 'E05', 'E10', 'E12']);
    // The dish describes its own registry (version 2, D-0059), not the build's.
    expect(info.registry).toMatchObject({
      moduleRegistryVersion: 2,
      modules: PRE_FLIP_MODULES.map((id) => ({ id })),
      partial: true,
    });

    // Same future: the reloaded dish and the original evolve identically.
    run(world, 150);
    run(loaded, 150);
    expect(stateHash(loaded)).toBe(stateHash(world));

    // Re-exported from the changed build, the file still states the recorded registry.
    host.handle({ type: 'exportDish', requestId: 2, dishId: 'old', strip: false });
    const exp = await reply(out, 2);
    expect(exp.type).toBe('exported');
    const reExported = JSON.parse((exp as { text: string }).text) as SaveFile;
    expect(reExported.meta.registry).toEqual({
      moduleRegistryVersion: 2,
      evolutionRulesVersion: 1,
      enabledModules: PRE_FLIP_MODULES,
    });
    expect(reExported.state.content.modules).toEqual(serializeWorld(loaded).content.modules);
  }, 120_000);

  it('export metadata shows the enabled registry and evolution setting, always from the world', async () => {
    const world = realizeRecipe(registry(), 'FIRST_DISH_V1', {
      worldId: 'meta',
      transform: (r) => ({ ...r, mutationPreset: 'accelerated', founderMode: 'diverse' }),
    });
    const forged = { enabledModules: ['E99'], moduleRegistryVersion: 9, evolutionRulesVersion: 9 };
    const { file, text } = await buildSaveFile(world, {
      name: 'Meta',
      savedAt: SAVED_AT,
      recipeId: null,
      registry: forged,
      evolution: { mutationPreset: 'fixed', founderMode: 'identical' },
    });
    expect(file.meta.registry).toEqual({
      moduleRegistryVersion: 3,
      evolutionRulesVersion: 1,
      enabledModules: SHIPPED_MODULES,
    });
    expect(file.meta.evolution).toEqual({ mutationPreset: 'accelerated', founderMode: 'diverse' });
    expect(saveMetaRegistry(JSON.parse(text).meta)).toEqual(file.meta.registry);
    expect(
      saveMetaRegistry({
        registry: { moduleRegistryVersion: 1, evolutionRulesVersion: 1, enabledModules: ['<b>'] },
      }),
    ).toBeNull();
    expect(saveMetaRegistry({})).toBeNull();
    // Meta is outside the checksum: a file written before it existed loads unchanged.
    const old = JSON.parse(text) as { meta: Record<string, unknown> };
    delete old.meta.registry;
    delete old.meta.evolution;
    const { world: back } = await loadSaveFile(JSON.stringify(old));
    expect(stateHash(back)).toBe(stateHash(world));
  });
});
