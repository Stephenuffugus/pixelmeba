/**
 * The systems flip's import rule (D-0121; D-0119 "the import and the build"; saveFile.ts
 * unimplementedRulesProblem). A dish can only run with rules this build implements: a dish whose recorded
 * manifest names a system or structure, or whose recorded species names a native ability, outside
 * IMPLEMENTED_SYSTEMS / IMPLEMENTED_STRUCTURES (with the cell structures) / IMPLEMENTED_NATIVE_ABILITIES is
 * refused by name with kind 'content' and the module refusal's sentence family ("… which this version of
 * Pixelmeba cannot simulate. Nothing was loaded."), before the manifest schema runs, so an unknown future
 * id is named rather than reported as "Manifest: invalid". The current world is untouched. The line is
 * "implemented", not "enabled": both save corpora (which record none of the Phase 5 systems), a dish
 * recording silicate/signals/rivalry (implemented, not enabled) and the wave 10 and 11 fixture dishes load.
 *
 * Every crafted file is re-stamped with a fresh checksum, so only the edit can refuse it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IMPLEMENTED_NATIVE_ABILITIES, IMPLEMENTED_RULES, IMPLEMENTED_STRUCTURES, IMPLEMENTED_SYSTEMS, RULES_VERSIONS } from '../../src/sim/content/implemented';
import { NativeAbility } from '../../src/sim/content/schema';
import { buildSaveFile, loadSaveFile, SaveFileError, type SaveFile } from '../../src/persistence/saveFile';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import { SYSTEM_FLAGS, type SystemFlag } from '../../src/sim/fields';
import { canonicalJson, sha256Hex } from '../../src/sim/hash';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import type { World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import type { FromWorker } from '../../src/worker/protocol';
import { writeMembraneFixture } from '../e2e/regionFixture';
import { writeStructureFixture } from '../e2e/structureFixture';
import { G2_SAVE_FILES, readG2SaveText } from '../helpers/g2-saves';
import { RC1_SAVE_FILES, readRc1SaveText } from '../helpers/rc1-saves';
import { registryWith } from '../helpers/registry';
import { clearWater, registry } from '../helpers/world';
import { REPO_ROOT } from '../../tools/lib/content-fs';
import { join } from 'node:path';

const REG = registry();
const meta = { name: 'implemented', savedAt: '2026-10-14T00:00:00Z', recipeId: null };
const CANNOT = 'which this version of Pixelmeba cannot simulate. Nothing was loaded.';

interface Content {
  manifest: { enabledSystems: string[]; enabledStructures?: string[] };
  species: { id: string; nativeAbilities?: string[] }[];
}

/** A saved shipped dish (FIRST_DISH_V1 at tick 0) edited as JSON and re-checksummed. */
async function crafted(edit: (c: Content) => void, w: World = realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: 'crafted' })): Promise<string> {
  const { text } = await buildSaveFile(w, meta);
  const file = JSON.parse(text) as SaveFile;
  edit((file.state as unknown as { content: Content }).content);
  return JSON.stringify({ ...file, checksum: `sha256:${await sha256Hex(canonicalJson(file.state))}` });
}

async function refusal(text: string): Promise<unknown> {
  return loadSaveFile(text).catch((e: unknown) => e);
}

async function reply(out: FromWorker[], requestId: number): Promise<FromWorker> {
  for (let k = 0; k < 400; k++) {
    const m = out.find((x) => 'requestId' in x && x.requestId === requestId);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`no reply to request ${requestId}`);
}

/** Through the worker's import path: an error reply naming `message`, no new dish, the open dish untouched. */
async function refusedByHost(text: string, message: string): Promise<void> {
  const out: FromWorker[] = [];
  const host = new DishHost(REG, (m) => out.push(m), { now: () => 0 });
  host.handle({ type: 'create', requestId: 1, dishId: 'open', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } });
  const before = stateHash(host.world('open')!);
  const tick = host.world('open')!.tick;
  host.handle({ type: 'importDish', requestId: 2, text, newDishId: 'imported' });
  const r = await reply(out, 2);
  expect(r).toMatchObject({ type: 'error', request: 'importDish' });
  expect(r.type === 'error' ? r.message : '').toContain(message);
  expect(host.world('imported')).toBeNull();
  expect(host.world('open')!.tick).toBe(tick);
  expect(stateHash(host.world('open')!)).toBe(before);
  expect(host.activeDishId).toBe('open');
}

describe('the implemented lists (D-0121)', () => {
  it('IMPLEMENTED_SYSTEMS is sorted, known, and holds the v1.0 systems, barriers, climate, devices, silicate, signals and rivalry; not equipment or developmental', () => {
    expect([...IMPLEMENTED_SYSTEMS]).toEqual([...IMPLEMENTED_SYSTEMS].sort());
    for (const s of IMPLEMENTED_SYSTEMS) expect(SYSTEM_FLAGS as readonly string[]).toContain(s);
    expect(IMPLEMENTED_SYSTEMS).toEqual(['barriers', 'chemistry', 'climate', 'core', 'devices', 'enzymes', 'film', 'foodObjects', 'fungi', 'parasites', 'rivalry', 'signals', 'silicate', 'viruses']);
    expect(SYSTEM_FLAGS.filter((s) => !IMPLEMENTED_SYSTEMS.includes(s))).toEqual(['equipment', 'developmental']);
    // The shipped manifest enables only implemented systems and structures.
    for (const s of REG.manifest.enabledSystems) expect(IMPLEMENTED_SYSTEMS).toContain(s);
    expect(IMPLEMENTED_STRUCTURES).toEqual(['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12']);
  });
});

describe('the import refuses a dish naming rules this build does not implement (D-0121)', () => {
  it("a known but unimplemented system ('equipment') is refused by name; the open dish is untouched", async () => {
    const text = await crafted((c) => {
      c.manifest.enabledSystems = [...c.manifest.enabledSystems, 'equipment'].sort();
    });
    const message = `This dish uses the "equipment" system, ${CANNOT}`;
    const err = await refusal(text);
    expect(err).toBeInstanceOf(SaveFileError);
    expect(err).toMatchObject({ kind: 'content', message });
    await refusedByHost(text, message);
  });

  it('an unknown future system id is named, not reported as "Manifest: invalid"', async () => {
    const text = await crafted((c) => {
      c.manifest.enabledSystems = [...c.manifest.enabledSystems, 'weather'].sort();
    });
    const message = `This dish uses the "weather" system, ${CANNOT}`;
    expect(await refusal(text)).toMatchObject({ kind: 'content', message });
    await refusedByHost(text, message);
  });

  it('a made-up structure id is refused by name', async () => {
    const text = await crafted((c) => {
      c.manifest.enabledStructures = [...(c.manifest.enabledStructures ?? []), 'S99'].sort();
    });
    const message = `This dish uses the structure "S99", ${CANNOT}`;
    expect(await refusal(text)).toMatchObject({ kind: 'content', message });
    await refusedByHost(text, message);
  });

  it('a dish recording P10 (HANDLING, not implemented until wave 13) is refused naming the species and the ability', async () => {
    expect(IMPLEMENTED_NATIVE_ABILITIES).not.toContain('HANDLING');
    const reg = registryWith({ enabledSpecies: [...REG.manifest.enabledSpecies, 'P10'].sort() }, { allowUnimplemented: true });
    const text = await crafted(() => undefined, clearWater({}, reg));
    const message = `This dish's P10 uses the native ability "HANDLING", ${CANNOT}`;
    expect(await refusal(text)).toMatchObject({ kind: 'content', message });
    await refusedByHost(text, message);
  });

  it('an unknown future native ability is named before the species schema runs', async () => {
    const text = await crafted((c) => {
      const b01 = c.species.find((s) => s.id === 'B01')!;
      b01.nativeAbilities = [...(b01.nativeAbilities ?? []), 'TELEPORT'];
    });
    expect(NativeAbility.options as readonly string[]).not.toContain('TELEPORT');
    expect(await refusal(text)).toMatchObject({ kind: 'content', message: `This dish's B01 uses the native ability "TELEPORT", ${CANNOT}` });
  });

  it('every unimplemented native ability of the schema is refused the same way', async () => {
    const missing = NativeAbility.options.filter((a) => !IMPLEMENTED_NATIVE_ABILITIES.includes(a));
    expect(missing.length).toBeGreaterThan(0);
    for (const a of missing) {
      const text = await crafted((c) => {
        c.species.find((s) => s.id === 'B01')!.nativeAbilities = [a];
      });
      expect(await refusal(text), a).toMatchObject({ kind: 'content', message: `This dish's B01 uses the native ability "${a}", ${CANNOT}` });
    }
  });
});

describe('the line is "implemented", not "enabled": these dishes still load (D-0121)', () => {
  it('a new shipped dish records barriers, climate, devices and S01–S12, and loads', async () => {
    const w = realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: 'new' });
    expect(w.content.manifest.enabledSystems).toEqual(expect.arrayContaining(['barriers', 'climate', 'devices']));
    expect(w.content.manifest.enabledStructures).toEqual(expect.arrayContaining([...IMPLEMENTED_STRUCTURES]));
    const { text } = await buildSaveFile(w, meta);
    const back = await loadSaveFile(text);
    expect(stateHash(back.world)).toBe(stateHash(w));
  });

  it('a dish recording silicate, signals and rivalry (implemented, not enabled) loads', async () => {
    const systems = [...REG.manifest.enabledSystems, 'rivalry', 'signals', 'silicate'].sort() as SystemFlag[];
    const reg = registryWith({ enabledSystems: systems });
    const w = clearWater({}, reg);
    const { text } = await buildSaveFile(w, meta);
    await expect(loadSaveFile(text)).resolves.toBeDefined();
  });

  it('every rc1 and g2 corpus save loads (their manifests record none of the Phase 5 systems)', async () => {
    for (const f of RC1_SAVE_FILES) {
      const loaded = await loadSaveFile(readRc1SaveText(f));
      expect(loaded.world.content.manifest.enabledSystems, f).not.toContain('climate');
    }
    for (const f of G2_SAVE_FILES) await expect(loadSaveFile(readG2SaveText(f)), f).resolves.toBeDefined();
  }, 120_000);

  it('the wave 10/11 fixture dishes (the structure and membrane journeys) load', async () => {
    const structure = await writeStructureFixture();
    const s = await loadSaveFile(readFileSync(structure, 'utf8'));
    expect(s.world.edges.length).toBeGreaterThan(0);
    expect(s.world.devices.length).toBeGreaterThan(0);
    const membrane = join(REPO_ROOT, 'tmp', 'e2e-structure-ui', `membrane-implemented-${process.pid}.pixelmeba`);
    await writeMembraneFixture(membrane);
    expect(existsSync(membrane)).toBe(true);
    const m = await loadSaveFile(readFileSync(membrane, 'utf8'));
    expect(m.world.edges.length).toBeGreaterThan(0);
  }, 120_000);
});

describe("the import refuses a dish recorded under newer rules than this build implements (D-0121, the lead's ceilings)", () => {
  const NEWER = 'This dish needs a newer version of Pixelmeba';
  const recordedAs = (key: string, value: unknown) => (c: Content) => {
    (c.manifest as unknown as Record<string, unknown>)[key] = value;
  };

  it('the shipped manifest sits exactly at the ceilings, with developmental changes off', () => {
    for (const [key] of RULES_VERSIONS) expect(REG.manifest[key], key).toBe(IMPLEMENTED_RULES[key]);
    expect(IMPLEMENTED_RULES.developmental).toBe(false);
    expect(REG.manifest.developmentalEnabled).toBe(false);
  });

  for (const [key, words] of RULES_VERSIONS) {
    it(`${key} above ${IMPLEMENTED_RULES[key]} is refused as "needs a newer version (${words} …)"; the open dish is untouched`, async () => {
      const v = IMPLEMENTED_RULES[key] + 1;
      const text = await crafted(recordedAs(key, v));
      const message = `${NEWER} (${words} ${v}).`;
      const err = await refusal(text);
      expect(err).toBeInstanceOf(SaveFileError);
      expect(err).toMatchObject({ kind: 'version', message });
      await refusedByHost(text, message);
      // At the ceiling (and below it, for the versions above 1) the same dish loads.
      await expect(loadSaveFile(await crafted(recordedAs(key, IMPLEMENTED_RULES[key])))).resolves.toBeDefined();
    });
  }

  it('a dish recording developmental changes (developmentalEnabled true) is refused; with false it loads', async () => {
    const text = await crafted(recordedAs('developmentalEnabled', true));
    const message = `${NEWER} (developmental changes).`;
    expect(await refusal(text)).toMatchObject({ kind: 'version', message });
    await refusedByHost(text, message);
    await expect(loadSaveFile(await crafted(recordedAs('developmentalEnabled', false)))).resolves.toBeDefined();
  });

  it('a Phase 7 dish (newer evolution rules and the developmental system) is named by its version first', async () => {
    const text = await crafted((c) => {
      recordedAs('evolutionRulesVersion', 2)(c);
      c.manifest.enabledSystems = [...c.manifest.enabledSystems, 'developmental'].sort();
    });
    expect(await refusal(text)).toMatchObject({ kind: 'version', message: `${NEWER} (evolution rules 2).` });
  });
});

describe('a saved slot refused by rule names the rule, not damage (D-0121, lead; the verifier\'s loadSlot finding)', () => {
  async function hostWithSlot(text: string): Promise<{ host: DishHost; out: FromWorker[] }> {
    const out: FromWorker[] = [];
    const store = new SaveStore(new MemoryBackend());
    const file = JSON.parse(text) as SaveFile;
    await store.save({ slotId: 'slot1', text, checksum: file.checksum, name: 'x', tick: 0, savedAt: '2026-10-14T00:00:00Z', recipeId: null });
    const host = new DishHost(REG, (m) => out.push(m), { now: () => 0, iso: () => '2026-10-14T00:00:00.000Z' }, store);
    host.handle({ type: 'create', requestId: 1, dishId: 'open', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } });
    await reply(out, 1);
    return { host, out };
  }

  it('Load and Export of a slot holding an "equipment" dish (or a newer-rules dish) name it; the open dish is untouched', async () => {
    for (const [text, message] of [
      [await crafted((c) => void (c.manifest.enabledSystems = [...c.manifest.enabledSystems, 'equipment'].sort())), `This dish uses the "equipment" system, ${CANNOT}`],
      [await crafted((c) => void ((c.manifest as unknown as Record<string, unknown>).moduleRegistryVersion = IMPLEMENTED_RULES.moduleRegistryVersion + 1)), `This dish needs a newer version of Pixelmeba (ability registry ${IMPLEMENTED_RULES.moduleRegistryVersion + 1}).`],
    ] as const) {
      const { host, out } = await hostWithSlot(text);
      const before = stateHash(host.world('open')!);
      host.handle({ type: 'loadSlot', requestId: 2, slotId: 'slot1', newDishId: 'fromSlot' });
      expect(await reply(out, 2)).toMatchObject({ type: 'error', message });
      expect(host.world('fromSlot')).toBeNull();
      expect(host.activeDishId).toBe('open');
      expect(stateHash(host.world('open')!)).toBe(before);
      host.handle({ type: 'exportSave', requestId: 3, slotId: 'slot1' });
      expect(await reply(out, 3)).toMatchObject({ type: 'error', message });
    }
  });

  it('a slot whose save is not a readable file still reports damage', async () => {
    const { host, out } = await hostWithSlot(JSON.stringify({ checksum: 'sha256:0', format: 'something else' }));
    host.handle({ type: 'loadSlot', requestId: 2, slotId: 'slot1', newDishId: 'fromSlot' });
    expect(await reply(out, 2)).toMatchObject({ type: 'error', message: 'That save could not be read, and no earlier copy was usable.' });
  });
});
