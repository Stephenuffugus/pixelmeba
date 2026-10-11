/**
 * P4.6 Share (SPEC §14.4; UX §5.10, §5.11; D09 lines 140-160; D-0080): the Starting recipe file
 * (src/persistence/recipeFile.ts) through the real worker host, the Living dish export at a paused tick
 * with "Strip names and notes", and offline recipe identifiers (src/persistence/recipeId.ts).
 *
 * - A recipe file round-trips: the imported dish's stateHash equals the file's initialStateHash and a
 *   direct realization (FIRST_DISH_V1, the What if? idea R-G3, a New Dish start with choices).
 * - Every refusal leaves the open dish untouched (same dish active, same stateHash, nothing written).
 * - A dish with no recorded start (an experiment card) or one started by other content refuses export.
 * - The stripped Living dish carries no branch name or journal entry, its checksum is over what it
 *   writes, and it runs on bit-identically (strip commutes with 600 more ticks).
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile, MAX_IMPORT_BYTES } from '../../src/persistence/saveFile';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import {
  compatibleBuildText,
  NO_START_TEXT,
  OTHER_BUILD_START_TEXT,
  RECIPE_FORMAT,
  type RecipeFile,
} from '../../src/persistence/recipeFile';
import {
  formatRecipeId,
  parseRecipeId,
  RECIPE_ID_FORMAT_TEXT,
  recipeIdAnswer,
  recipeIdCompatibleText,
  resolveRecipeId,
} from '../../src/persistence/recipeId';
import { generatedBranchName } from '../../src/sim/branches';
import { applyNow } from '../../src/sim/commands';
import { canonicalJson, sha256Hex } from '../../src/sim/hash';
import { putJournalEntry } from '../../src/sim/history';
import { realizeExperimentArms } from '../../src/sim/experiments';
import { realizeRecipe } from '../../src/sim/recipes';
import { serializeWorld, stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { realizeVariant } from '../../src/sim/variants';
import { DishHost } from '../../src/worker/host';
import type { DishSource, FromWorker, ToWorker } from '../../src/worker/protocol';
import { registry } from '../helpers/world';

class Harness {
  readonly out: FromWorker[] = [];
  readonly store = new SaveStore(new MemoryBackend());
  readonly host = new DishHost(
    registry(),
    (m) => this.out.push(m),
    { now: () => 0, iso: () => '2026-10-11T00:00:00.000Z' },
    this.store,
  );
  private n = 0;
  id(): number {
    return ++this.n;
  }
  /** Send one request (sync or async) and return its answer by request id. */
  async ask(build: (requestId: number) => ToWorker): Promise<FromWorker> {
    const requestId = this.id();
    const msg = build(requestId);
    await this.host.handleAsync(msg);
    const m = this.out.find((x) => 'requestId' in x && x.requestId === requestId);
    if (!m) throw new Error(`no answer to ${msg.type}`);
    return m;
  }
  async create(dishId: string, source: DishSource): Promise<void> {
    const m = await this.ask((requestId) => ({ type: 'create', requestId, dishId, source }));
    if (m.type !== 'ready') throw new Error(`not created: ${JSON.stringify(m)}`);
  }
  world(dishId: string) {
    const w = this.host.world(dishId);
    if (!w) throw new Error(`no dish ${dishId}`);
    return w;
  }
  async exportRecipe(dishId: string): Promise<FromWorker> {
    return this.ask((requestId) => ({ type: 'recipeExport', requestId, dishId }));
  }
  async recipeText(dishId: string): Promise<string> {
    const m = await this.exportRecipe(dishId);
    if (m.type !== 'recipeExported') throw new Error(`no recipe: ${JSON.stringify(m)}`);
    return m.text;
  }
  async importRecipe(text: string, newDishId: string, keepFrom: string | null = null): Promise<FromWorker> {
    return this.ask((requestId) => ({
      type: 'recipeImport',
      requestId,
      text,
      newDishId,
      ...(keepFrom ? { keepFrom: { dishId: keepFrom, keep: { kind: 'auto' } } } : {}),
    }));
  }
}

/** Re-seal an edited recipe file with a valid checksum (so the check under test is not the checksum's). */
async function reseal(file: Omit<RecipeFile, 'checksum'> & { checksum?: string }): Promise<string> {
  const { checksum: _old, ...payload } = file;
  return JSON.stringify({ ...payload, checksum: `sha256:${await sha256Hex(canonicalJson(payload))}` });
}

function errorOf(m: FromWorker): string {
  if (m.type !== 'error') throw new Error(`expected a refusal, got ${m.type}`);
  return m.message;
}

describe('Starting recipe file: round trip', () => {
  it('FIRST_DISH_V1: export from a dish that has run, import → the start, equal to a direct realization', async () => {
    const h = new Harness();
    await h.create('g', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    const start = stateHash(h.world('g'));
    run(h.world('g'), 120); // the file describes the start, never the dish now
    const text = await h.recipeText('g');
    const file = JSON.parse(text) as RecipeFile;
    expect(file.format).toBe(RECIPE_FORMAT);
    expect(file.source).toEqual({
      kind: 'recipe',
      recipeId: 'FIRST_DISH_V1',
      revision: 1,
      seed: 104729,
      overrides: {},
    });
    expect(file.initialStateHash).toBe(start);
    expect(file.name).toBe('Little Living Garden');
    expect(file.expectedObservationsText).toContain('Sprinters eat the sugar patch');
    expect(file.enabledModules).toEqual(registry().manifest.enabledModules);
    // The build's own versions (read from the manifest, so a legitimate version bump needs no edit here).
    const man = registry().manifest;
    expect(file.versions).toMatchObject({
      simulationVersion: man.simulationVersion,
      evolutionRulesVersion: man.evolutionRulesVersion,
      moduleRegistryVersion: man.moduleRegistryVersion,
      phenotypeMappingVersion: man.phenotypeMappingVersion,
      contentVersion: man.contentVersion,
    });
    // Nothing but the start: no command log, no history, no notebook, no player name.
    for (const k of ['state', 'notebook', 'commands', 'meta']) expect(Object.keys(file)).not.toContain(k);

    const m = await h.importRecipe(text, 'g2', 'g');
    expect(m.type).toBe('loaded');
    const w = h.world('g2');
    expect(w.tick).toBe(0);
    expect(stateHash(w)).toBe(file.initialStateHash);
    expect(stateHash(w)).toBe(stateHash(realizeRecipe(registry(), 'FIRST_DISH_V1')));
    expect(h.host.activeDishId).toBe('g2');
    // The new dish is the same start as the Play shelf's: its whole serialized world (provenance included).
    await h.create('direct', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    expect(canonicalJson({ ...serializeWorld(w), worldId: 'x' })).toBe(
      canonicalJson({ ...serializeWorld(h.world('direct')), worldId: 'x' }),
    );
  });

  it('R-G3 (What if?): the variant file round-trips with its checksums and identity', async () => {
    const h = new Harness();
    const m0 = await h.ask((requestId) => ({
      type: 'whatIfStart',
      requestId,
      newDishId: 'v',
      fromDishId: null,
      pick: { kind: 'variant', variantId: 'R-G3' },
      keep: { kind: 'auto' },
    }));
    expect(m0.type).toBe('whatIfStarted');
    run(h.world('v'), 50);
    const ex = await h.exportRecipe('v');
    if (ex.type !== 'recipeExported') throw new Error(JSON.stringify(ex));
    expect(ex.identity).toBe('R-G3 / revision 1 / seed 104729');
    expect(ex.name).toBe('Dinner farther away');
    expect(ex.question).toBe('Who reaches the food now?');
    const file = JSON.parse(ex.text) as RecipeFile;
    expect(file.source.kind).toBe('variant');
    expect(file.recipe.fieldPatches[0]!.center).toEqual([48, 82]);
    const direct = await realizeVariant(registry(), 'R-G3', { worldId: 'direct' });
    expect(file.initialStateHash).toBe(stateHash(direct));
    const m = await h.importRecipe(ex.text, 'v2', 'v');
    expect(m.type).toBe('loaded');
    expect(stateHash(h.world('v2'))).toBe(stateHash(direct));
    expect(stateHash(h.world('v2'))).toBe(file.initialStateHash);
  });

  it('a New Dish start with choices (seed, setting, founders, habitat) round-trips exactly', async () => {
    const h = new Harness();
    const sources: DishSource[] = [
      {
        kind: 'recipe',
        recipeId: 'FIRST_DISH_V1',
        seed: 7,
        overrides: { mutationPreset: 'accelerated', founderMode: 'varied', empty: false },
      },
      {
        kind: 'recipe',
        recipeId: 'FIRST_DISH_V1',
        seed: 4294967295,
        overrides: {
          mutationPreset: 'standard',
          founderMode: 'identical',
          empty: true,
          habitatId: 'GEL_COLONY',
        },
      },
    ];
    for (const [i, source] of sources.entries()) {
      await h.create(`n${i}`, source);
      const text = await h.recipeText(`n${i}`);
      const file = JSON.parse(text) as RecipeFile;
      expect(file.source.kind === 'recipe' && file.source.seed).toBe(
        source.kind === 'recipe' ? source.seed : -1,
      );
      await h.create(`direct${i}`, source);
      const m = await h.importRecipe(text, `m${i}`);
      expect(m.type).toBe('loaded');
      expect(stateHash(h.world(`m${i}`))).toBe(file.initialStateHash);
      expect(stateHash(h.world(`m${i}`))).toBe(stateHash(h.world(`direct${i}`)));
      expect(canonicalJson({ ...serializeWorld(h.world(`m${i}`)), worldId: 'x' })).toBe(
        canonicalJson({ ...serializeWorld(h.world(`direct${i}`)), worldId: 'x' }),
      );
    }
    // A custom start has no offline identifier (it needs its file); a seed-only start has one.
    const ex = await h.exportRecipe('n0');
    expect(ex.type === 'recipeExported' && ex.identity).toBeNull();
    await h.create('seedOnly', {
      kind: 'recipe',
      recipeId: 'FIRST_DISH_V1',
      seed: 99,
      overrides: { mutationPreset: 'standard', founderMode: 'identical', empty: false },
    });
    const ex2 = await h.exportRecipe('seedOnly');
    expect(ex2.type === 'recipeExported' && ex2.identity).toBe('FIRST_DISH_V1 / revision 1 / seed 99');
  });
});

describe('Starting recipe file: refusals change nothing', () => {
  it('bad checksum, unknown recipe, another revision, seed out of range, non-finite, oversized, version mismatch', async () => {
    const h = new Harness();
    await h.create('open', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    run(h.world('open'), 40);
    const text = await h.recipeText('open');
    const file = JSON.parse(text) as RecipeFile;
    const before = stateHash(h.world('open'));
    const src = file.source as Extract<RecipeFile['source'], { kind: 'recipe' }>;
    const compat = compatibleBuildText(file.versions);
    const v = registry().manifest; // the build's versions (a version bump needs no edit here)
    const cases: [string, string, RegExp | string][] = [
      [
        'bad checksum',
        JSON.stringify({ ...file, checksum: `sha256:${'0'.repeat(64)}` }),
        'This recipe file does not match its checksum, so it may be damaged.',
      ],
      ['unknown recipe', await reseal({ ...file, source: { ...src, recipeId: 'NOT_A_RECIPE_V1' } }), compat],
      ['another revision', await reseal({ ...file, source: { ...src, revision: 2 } }), compat],
      [
        'seed out of range',
        await reseal({ ...file, source: { ...src, seed: 4294967296 } }),
        'This recipe file is damaged or incomplete (seed).',
      ],
      [
        'negative seed',
        await reseal({ ...file, source: { ...src, seed: -1 } }),
        'This recipe file is damaged or incomplete (seed).',
      ],
      [
        'non-finite value',
        text.replace('"sugar":0.4', '"sugar":1e999'),
        /damaged or incomplete \(a number that is not finite at file\.recipe\.fieldPatches\[0\]\.add\.sugar\)/,
      ],
      [
        'oversized',
        `{"format":"pixelmeba-recipe","pad":"${'x'.repeat(MAX_IMPORT_BYTES)}"}`,
        'The file is larger than 25 MB.',
      ],
      [
        'simulation version',
        await reseal({ ...file, versions: { ...file.versions, simulationVersion: v.simulationVersion + 1 } }),
        `This recipe needs a compatible build (simulation ${v.simulationVersion + 1}, rules ${v.evolutionRulesVersion}, content ${v.contentVersion}).`,
      ],
      [
        'content version',
        await reseal({ ...file, versions: { ...file.versions, contentVersion: v.contentVersion + 1 } }),
        `This recipe needs a compatible build (simulation ${v.simulationVersion}, rules ${v.evolutionRulesVersion}, content ${v.contentVersion + 1}).`,
      ],
      ['another start hash', await reseal({ ...file, initialStateHash: 'f'.repeat(16) }), compat],
      ['another recipe body', await reseal({ ...file, recipe: { ...file.recipe, seed: 1 } }), compat],
      ['another module list', await reseal({ ...file, enabledModules: ['E01'] }), compat],
      [
        'an unknown field',
        await reseal({ ...file, script: 'alert(1)' } as unknown as RecipeFile),
        'This recipe file is damaged or incomplete (unknown field "script").',
      ],
      ['not JSON', '{"format":"pixelmeba-recipe",', 'This is not a Pixelmeba file (it is not valid JSON).'],
      ['a save file', '{"format":"pixelmeba-save"}', 'This is not a Pixelmeba recipe file.'],
    ];
    for (const [name, bad, want] of cases) {
      const m = await h.importRecipe(bad, `x-${name}`, 'open');
      const msg = errorOf(m);
      if (typeof want === 'string') expect(msg, name).toBe(want);
      else expect(msg, name).toMatch(want);
      expect(h.host.world(`x-${name}`), name).toBeNull();
      expect(h.host.activeDishId, name).toBe('open');
      expect(stateHash(h.world('open')), name).toBe(before);
    }
    // Nothing was kept or written by any refusal.
    expect(await h.store.list()).toEqual([]);
    // The good file still imports (the cases above edited copies).
    expect((await h.importRecipe(text, 'ok', 'open')).type).toBe('loaded');
  });

  it('a dish with no recorded start refuses the recipe export with its copy', async () => {
    const h = new Harness();
    const reg = registry();
    // An experiment card's dish: its start is the card, not a recipe file.
    const arms = realizeExperimentArms(reg, reg.experiments[reg.experimentIds[0]!]!, {
      worldIds: { A: 'a', B: 'b' },
    });
    await h.create('card', { kind: 'state', state: serializeWorld(arms.A) });
    const m = await h.exportRecipe('card');
    expect(errorOf(m)).toBe(NO_START_TEXT);
    expect(m.type === 'error' && m.kind).toBe('no-start');
    // A save that never recorded its choices and is not the authored start: no recorded start.
    const custom = realizeRecipe(reg, 'FIRST_DISH_V1', { seed: 5, worldId: 'old' });
    const st = serializeWorld(custom);
    const { overrides: _o, ...prov } = st.content.provenance as Record<string, unknown>;
    await h.create('old', {
      kind: 'state',
      state: { ...st, content: { ...st.content, provenance: prov as typeof st.content.provenance } },
    });
    expect(errorOf(await h.exportRecipe('old'))).toBe(NO_START_TEXT);
    // The same older save of the authored start (seed 104729) is recognised (the host's isAuthoredRecipe).
    const authored = serializeWorld(realizeRecipe(reg, 'FIRST_DISH_V1', { worldId: 'old2' }));
    const { overrides: _o2, ...prov2 } = authored.content.provenance as Record<string, unknown>;
    await h.create('old2', {
      kind: 'state',
      state: {
        ...authored,
        content: { ...authored.content, provenance: prov2 as typeof authored.content.provenance },
      },
    });
    expect((await h.exportRecipe('old2')).type).toBe('recipeExported');
    // A dish started under other content cannot have its start written exactly.
    const other = serializeWorld(realizeRecipe(reg, 'FIRST_DISH_V1', { worldId: 'other' }));
    await h.create('other', {
      kind: 'state',
      state: {
        ...other,
        content: { ...other.content, manifest: { ...other.content.manifest, contentHash: 'f'.repeat(64) } },
      },
    });
    expect(errorOf(await h.exportRecipe('other'))).toBe(OTHER_BUILD_START_TEXT);
    // Reading the start changed no dish.
    expect(stateHash(h.world('card'))).toBe(stateHash(arms.A));
  });
});

describe('Living dish', () => {
  it('the exported file loads with an equal stateHash at a paused tick', async () => {
    const h = new Harness();
    await h.create('d', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    run(h.world('d'), 300);
    const m = await h.ask((requestId) => ({ type: 'exportDish', requestId, dishId: 'd', strip: false }));
    if (m.type !== 'exported') throw new Error(m.type);
    expect(m.filename).toMatch(/\.pixelmeba$/);
    const { world, file } = await loadSaveFile(m.text);
    expect(file.tick).toBe(300);
    expect(stateHash(world)).toBe(stateHash(h.world('d')));
  });

  it('strip names and notes: no branch name or journal entry, checksum recomputed, runs on bit-identically', async () => {
    // Seed 101 at Accelerated establishes its first branch by tick 2100 (tests/persistence/strip-names.test.ts).
    const w = realizeRecipe(registry(), 'FIRST_DISH_V1', {
      seed: 101,
      worldId: 'strip',
      transform: (r) => ({ ...r, mutationPreset: 'accelerated' }),
    });
    run(w, 2100);
    expect(w.branches.established).toBeGreaterThanOrEqual(1);
    applyNow(w, 'rename', { kind: 'lineage', op: 'rename', branch: 0, name: 'Quiet savers' });
    expect(
      putJournalEntry(w.history, {
        version: 1,
        kind: 'observation',
        id: 'observation:2026-10-11T00:00:00Z:1',
        saw: 'my secret note about the sprinters',
        coincidedWith: 'the sugar patch',
        recordedAt: '2026-10-11T00:00:00Z',
        dish: { name: 'My private dish', second: 210, recipeId: 'FIRST_DISH_V1', seed: 101 },
        link: null,
        worldId: 'strip',
      }),
    ).toBe(true);
    const h = new Harness();
    await h.create('d', { kind: 'state', state: serializeWorld(w) });
    const ask = async (strip: boolean) => {
      const m = await h.ask((requestId) => ({ type: 'exportDish', requestId, dishId: 'd', strip }));
      if (m.type !== 'exported') throw new Error(m.type);
      return m.text;
    };
    const full = await ask(false);
    const stripped = await ask(true);
    expect(full).toContain('Quiet savers');
    expect(full).toContain('my secret note');
    expect(stripped).not.toContain('Quiet savers');
    expect(stripped).not.toContain('my secret note');
    expect(stripped).not.toContain('My private dish');
    const sf = JSON.parse(stripped) as {
      checksum: string;
      state: { history: { journal: unknown[] }; branches: { branches: { name: string | null }[] } };
    };
    const ff = JSON.parse(full) as { checksum: string };
    expect(sf.state.history.journal).toEqual([]);
    expect(sf.state.branches.branches.every((b) => b.name === null)).toBe(true);
    expect(sf.checksum).toBe(`sha256:${await sha256Hex(canonicalJson(sf.state))}`);
    expect(sf.checksum).not.toBe(ff.checksum);

    // It loads, and runs on bit-identically: stripping then running 600 ticks = running then stripping.
    const S = (await loadSaveFile(stripped)).world;
    expect(S.branches.branches[0]!.name).toBeNull();
    expect(S.branches.branches[0] && generatedBranchName(S, S.branches.branches[0])).toBeTruthy();
    const U = (await loadSaveFile(full)).world;
    expect(stateHash(U)).toBe(stateHash(h.world('d')));
    run(S, 600);
    run(U, 600);
    const later = await buildSaveFile(
      U,
      { name: 'x', savedAt: '2026-10-11T00:00:00Z', recipeId: 'FIRST_DISH_V1' },
      { stripNames: true },
    );
    const U2 = (await loadSaveFile(later.text)).world;
    expect(stateHash(S)).toBe(stateHash(U2));
    expect(serializeWorld(S).entities).toEqual(serializeWorld(U).entities);
    expect(serializeWorld(S).fields).toEqual(serializeWorld(U).fields);
  }, 180_000);
});

describe('offline recipe identifiers', () => {
  it('formats in the SPEC §14.4 form and parses both spellings, any spacing and either hyphen', () => {
    expect(formatRecipeId('R-G3', 1, 104729)).toBe('R-G3 / revision 1 / seed 104729');
    for (const t of [
      'R-G3 / revision 1 / seed 104729',
      'R-G3 / rev 1 / seed 104729',
      'R‑G3 / rev 1 / seed 104729',
      '  R-G3/revision1/seed104729  ',
      'R-G3  /  REV 1 /  Seed 104729',
    ]) {
      const p = parseRecipeId(t);
      expect(p, t).not.toBeNull();
      expect(p!.text).toBe('R-G3 / revision 1 / seed 104729');
    }
    for (const t of [
      '',
      'R-G3',
      'R-G3 / 1 / 104729',
      'R-G3 / revision one / seed 104729',
      'R-G3 / revision 1 / seed 104729 / extra',
      'https://example.com/R-G3',
      'R–G3 / rev 1 / seed 104729',
      'R-G3 / v 1 / seed 1',
      `R-G3 / revision 1 / seed 1${' '.repeat(80)}`,
    ])
      expect(parseRecipeId(t), t).toBeNull();
  });

  it('resolves only exact bundled ids, revisions and valid seeds, with every refusal copy', () => {
    const reg = registry();
    const ok = (t: string) => {
      const a = recipeIdAnswer(t, reg);
      if (!a.ok) throw new Error(a.message);
      return a.start;
    };
    expect(ok('R-G3 / rev 1 / seed 104729')).toEqual({
      kind: 'variant',
      variantId: 'R-G3',
      revision: 1,
      seed: 104729,
      title: 'Dinner farther away',
    });
    expect(ok('R-G0 / revision 1 / seed 104729').kind).toBe('variant');
    expect(ok('FIRST_DISH_V1 / revision 1 / seed 104729')).toEqual({
      kind: 'recipe',
      recipeId: 'FIRST_DISH_V1',
      revision: 1,
      seed: 104729,
      title: 'Little Living Garden',
    });
    expect(ok('FIRST_DISH_V1 / revision 1 / seed 0').seed).toBe(0);
    expect(ok('FIRST_DISH_V1 / revision 1 / seed 4294967295').seed).toBe(4294967295);
    expect(ok('HIDDEN_NEIGHBORHOOD_V1 / revision 2 / seed 9').kind).toBe('recipe');
    const no = (t: string) => {
      const a = recipeIdAnswer(t, reg);
      if (a.ok) throw new Error(`accepted ${t}`);
      return a.message;
    };
    expect(no('R-G3 / revision 1 / seed 5')).toBe('R-G3 revision 1 starts from seed 104729.');
    expect(no('R-G3 / revision 2 / seed 104729')).toBe(
      'This recipe needs a compatible build (R-G3 / revision 2 / seed 104729).',
    );
    expect(no('R-G9 / revision 1 / seed 104729')).toBe(
      'This recipe needs a compatible build (R-G9 / revision 1 / seed 104729).',
    );
    expect(no('r-g3 / revision 1 / seed 104729')).toBe(
      recipeIdCompatibleText('r-g3 / revision 1 / seed 104729'),
    ); // never reinterpreted
    expect(no('FIRST_DISH_V1 / revision 2 / seed 1')).toBe(
      recipeIdCompatibleText('FIRST_DISH_V1 / revision 2 / seed 1'),
    );
    expect(no('HIDDEN_NEIGHBORHOOD_V1 / revision 1 / seed 9')).toBe(
      recipeIdCompatibleText('HIDDEN_NEIGHBORHOOD_V1 / revision 1 / seed 9'),
    );
    expect(no('FIRST_DISH_V1 / revision 1 / seed 4294967296')).toBe(
      recipeIdCompatibleText('FIRST_DISH_V1 / revision 1 / seed 4294967296'),
    );
    expect(no('FIRST_DISH_V1 / revision 1 / seed 0104729')).toBe(
      recipeIdCompatibleText('FIRST_DISH_V1 / revision 1 / seed 0104729'),
    );
    expect(no('FIRST_DISH_V1 / revision 01 / seed 1')).toBe(
      recipeIdCompatibleText('FIRST_DISH_V1 / revision 01 / seed 1'),
    );
    expect(no('constructor / revision 1 / seed 1')).toBe(
      recipeIdCompatibleText('constructor / revision 1 / seed 1'),
    );
    expect(no('hello')).toBe(RECIPE_ID_FORMAT_TEXT);
    expect(resolveRecipeId(parseRecipeId('R-G3 / rev 1 / seed 104729')!, reg).ok).toBe(true);
  });

  it('Import recipe ID through the host: a variant opens as What if? realizes it; a refusal changes nothing', async () => {
    const h = new Harness();
    await h.create('open', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    run(h.world('open'), 30);
    const before = stateHash(h.world('open'));
    const bad = await h.ask((requestId) => ({
      type: 'recipeIdStart',
      requestId,
      id: 'R-G3 / revision 2 / seed 104729',
      newDishId: 'bad',
      keepFrom: { dishId: 'open', keep: { kind: 'auto' } },
    }));
    expect(errorOf(bad)).toBe('This recipe needs a compatible build (R-G3 / revision 2 / seed 104729).');
    expect(h.host.world('bad')).toBeNull();
    expect(h.host.activeDishId).toBe('open');
    expect(stateHash(h.world('open'))).toBe(before);
    expect(await h.store.list()).toEqual([]);
    const m = await h.ask((requestId) => ({
      type: 'recipeIdStart',
      requestId,
      id: 'R-G3 / revision 1 / seed 104729',
      newDishId: 'v',
      keepFrom: { dishId: 'open', keep: { kind: 'auto' } },
    }));
    if (m.type !== 'ready') throw new Error(JSON.stringify(m));
    expect(m.info.name).toBe('Dinner farther away');
    expect(m.kept).toBeTruthy(); // the open dish was kept first (D-0033)
    expect(h.world('v').tick).toBe(0);
    expect(stateHash(h.world('v'))).toBe(
      stateHash(await realizeVariant(registry(), 'R-G3', { worldId: 'x' })),
    );
    // A recipe id with its own seed is the Play shelf's start; another seed is a seed choice.
    const r = await h.ask((requestId) => ({
      type: 'recipeIdStart',
      requestId,
      id: 'FIRST_DISH_V1 / revision 1 / seed 42',
      newDishId: 'r',
    }));
    expect(r.type).toBe('ready');
    expect(h.world('r').seed).toBe(42);
    expect(stateHash(h.world('r'))).toBe(stateHash(realizeRecipe(registry(), 'FIRST_DISH_V1', { seed: 42 })));
  });
});
