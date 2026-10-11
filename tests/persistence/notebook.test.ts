/**
 * P4.1 (D-0070): the per-dish notebook record beside the world save (ARCH §11.2 "presentation").
 *
 * - round trip: save → load gives an equal record;
 * - written atomically with the world: a failed commit leaves the previous world and notebook; a damaged
 *   current record falls back to the predecessor pair;
 * - holdsSave sees a notebook-only change;
 * - each malformed record loads the world with notebookDropped and the same stateHash as the file
 *   without a notebook (bad checksum, another world id, an unknown kind key, 4 followed families, a
 *   61-character nickname, a non-integer birth id, notebookVersion 2), and the world checksum is the same
 *   with and without a notebook;
 * - a g2 save and the schema 2 fixture load with an empty notebook and keep their recorded hashes, then
 *   re-save with a notebook while the store keeps the original as the predecessor;
 * - exports carry no nickname unless the player opted in; stripNames drops them always;
 * - goal records (integrate, objectives-minors items 4 and 5): an internally inconsistent record is
 *   refused while every record shape the wave 5b build wrote in its normal flows still loads; a running
 *   goal the dish cannot run (its recorded manifest or fields) or whose saved event position the dish
 *   never reached drops the notebook with NOTEBOOK_DROPPED_TEXT when the refs carry goalWorldRefsOf.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile, type SaveFile } from '../../src/persistence/saveFile';
import {
  emptyNotebook,
  NOTEBOOK_DROPPED_TEXT,
  notebookProblem,
  readNotebook,
  sealNotebook,
  type FavoriteRecord,
  type NotebookRecord,
} from '../../src/persistence/notebook';
import { gunzipText } from '../../src/persistence/compress';
import {
  AUTOSAVE_SLOT,
  holdsSave,
  MemoryBackend,
  SaveStore,
  slotRecordFor,
  type SaveRequest,
} from '../../src/persistence/store';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';
import { G2_SAVE_FILES, readExpected, readG2SaveText } from '../helpers/g2-saves';
import { goalWorldRefsOf, type GoalRecord, type GoalWorldRefs } from '../../src/persistence/notebookGoals';
import { objectiveSupportProblem } from '../../src/sim/objectives';
import { registry } from '../helpers/world';

const REG = registry();
const META = { name: 'Notebook dish', savedAt: '2026-10-10T00:00:00.000Z', recipeId: 'FIRST_DISH_V1' };

function sprinterIds(w: World, n: number): number[] {
  const c = w.ents.cols;
  const out: number[] = [];
  for (let i = 0; i < w.ents.highWater && out.length < n; i++)
    if (c.alive[i] === 1 && w.species[c.species[i]!]!.id === 'B01') out.push(c.birthId[i]!);
  return out;
}

function fav(id: number, birthId: number, extra: Partial<FavoriteRecord> = {}): FavoriteRecord {
  return {
    id: `fav-${id}`,
    rootBirthId: birthId,
    speciesId: 'B01',
    nickname: 'Mango',
    pattern: 'triangle',
    representative: birthId,
    active: true,
    createdTick: 0,
    members: [[birthId, 0]],
    historyIncomplete: false,
    extinct: null,
    ...extra,
  };
}

/** A notebook following the first `n` living organisms (any species) of `w`. */
function notebookFor(w: World, n = 1, nickname: string | null = 'Mango'): NotebookRecord {
  const c = w.ents.cols;
  const picks: [number, string][] = [];
  for (let i = 0; i < w.ents.highWater && picks.length < n; i++)
    if (c.alive[i] === 1) picks.push([c.birthId[i]!, w.species[c.species[i]!]!.id]);
  return {
    ...emptyNotebook(w.worldId),
    favorites: picks.map(([b, sp], k) => fav(k + 1, b, { nickname, speciesId: sp })),
    nextFavorite: n + 1,
  };
}

function garden(): World {
  const w = realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: 'nb-dish' });
  run(w, 120);
  return w;
}

function requestFor(slotId: string, built: Awaited<ReturnType<typeof buildSaveFile>>): SaveRequest {
  return {
    slotId,
    text: built.text,
    checksum: built.checksum,
    name: built.file.meta.name,
    tick: built.file.tick,
    savedAt: built.file.meta.savedAt,
    recipeId: built.file.meta.recipeId,
    worldId: built.file.state.worldId,
    ...(built.file.notebook ? { notebookChecksum: built.file.notebook.checksum } : {}),
  };
}

async function verifyLoad(text: string): Promise<boolean> {
  await loadSaveFile(text);
  return true;
}

describe('notebook record in the save file', () => {
  it('round trip: save → load gives an equal record; the world checksum and stateHash are the same with and without it', async () => {
    const w = garden();
    const nb = notebookFor(w, 2);
    const plain = await buildSaveFile(w, META);
    const withNb = await buildSaveFile(w, META, { notebook: nb, includeNicknames: true });
    expect(plain.file.notebook).toBeUndefined();
    expect(withNb.checksum).toBe(plain.checksum);
    expect(withNb.file.notebook!.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(await notebookProblem(withNb.file.notebook, w.worldId)).toBeNull();
    const a = await loadSaveFile(withNb.text);
    const b = await loadSaveFile(plain.text);
    expect(a.notebookDropped).toBeNull();
    expect(a.notebook).toEqual(await sealNotebook(nb));
    expect(b.notebook).toEqual(emptyNotebook(w.worldId));
    expect(stateHash(a.world)).toBe(stateHash(b.world));
    expect(stateHash(a.world)).toBe(stateHash(w));
    // Every record the tracker can write is valid: an extinct, unpinned family whose last cell was not seen (-1).
    const extinct = {
      ...nb,
      favorites: [
        ...nb.favorites,
        fav(3, 999, {
          active: false,
          members: [],
          extinct: { tick: 40, lastBirthId: 999, cause: 0, cell: -1 },
        }),
      ],
      nextFavorite: 4,
    };
    expect(await notebookProblem(await sealNotebook(extinct), w.worldId)).toBeNull();
    // An empty notebook writes nothing: the file is byte-identical to one built without it.
    expect(
      (await buildSaveFile(w, META, { notebook: emptyNotebook(w.worldId), includeNicknames: true })).text,
    ).toBe(plain.text);
  });

  it('is written atomically with the world: a failed commit keeps the previous pair; a damaged record falls back to the predecessor pair', async () => {
    const backend = new MemoryBackend();
    const store = new SaveStore(backend);
    const w = garden();
    const first = await buildSaveFile(w, META, {
      notebook: notebookFor(w, 1, 'First'),
      includeNicknames: true,
    });
    await store.save(requestFor('slot1', first));
    run(w, 30);
    const second = await buildSaveFile(w, META, {
      notebook: notebookFor(w, 2, 'Second'),
      includeNicknames: true,
    });
    backend.failNextCommit = true;
    await expect(store.save(requestFor('slot1', second))).rejects.toThrow('simulated write failure');
    const held = await store.load('slot1', verifyLoad);
    expect(held!.text).toBe(first.text);
    const loaded = await loadSaveFile(held!.text);
    expect(loaded.notebook.favorites.map((f) => f.nickname)).toEqual(['First']);
    expect(loaded.world.tick).toBe(first.file.tick);
    // A successful write; then the current record is damaged: the predecessor pair (world and notebook) opens.
    await store.save(requestFor('slot1', second));
    const slot = (await backend.getSlot('slot1'))!;
    const rec = backend.records[slot.current]!;
    backend.records[slot.current] = { ...rec, data: rec.data.slice(0, 20) };
    const back = await store.load('slot1', verifyLoad);
    expect(back!.usedPredecessor).toBe(true);
    const old = await loadSaveFile(back!.text);
    expect(old.notebook.favorites.map((f) => f.nickname)).toEqual(['First']);
    expect(old.world.tick).toBe(first.file.tick);
  });

  it('holdsSave sees a notebook-only change', async () => {
    const backend = new MemoryBackend();
    const store = new SaveStore(backend);
    const w = garden();
    const a = await buildSaveFile(w, META, { notebook: notebookFor(w, 1, 'Mango'), includeNicknames: true });
    const held = await store.save(requestFor(AUTOSAVE_SLOT, a));
    expect(holdsSave(held, requestFor(AUTOSAVE_SLOT, a))).toBe(true);
    const renamed = await buildSaveFile(w, META, {
      notebook: notebookFor(w, 1, 'Papaya'),
      includeNicknames: true,
    });
    expect(renamed.checksum).toBe(a.checksum); // the world is the same…
    expect(holdsSave(held, requestFor(AUTOSAVE_SLOT, renamed))).toBe(false); // …the notebook is not
    const none = await buildSaveFile(w, META);
    expect(holdsSave(held, requestFor(AUTOSAVE_SLOT, none))).toBe(false);
    expect(
      slotRecordFor(requestFor(AUTOSAVE_SLOT, a), { savedAt: 'x', current: 'c', previous: null, bytes: 1 })
        .notebookChecksum,
    ).toBe(a.file.notebook!.checksum);
  });
});

describe('a malformed notebook is dropped with a message; the world loads unchanged', () => {
  const cases: [string, (nb: Record<string, unknown>, w: World) => Promise<Record<string, unknown>>][] = [
    ['a bad checksum', (nb) => Promise.resolve({ ...nb, checksum: `sha256:${'0'.repeat(64)}` })],
    ['another world id', async (nb) => reseal({ ...nb, worldId: 'someone-else' })],
    ['an unknown kind key', async (nb) => reseal({ ...nb, gallery: [] })],
    [
      'four followed families',
      async (nb, w) =>
        reseal({ ...nb, favorites: sprinterIds(w, 4).map((b, k) => fav(k + 1, b)), nextFavorite: 5 }),
    ],
    [
      'a 61-character nickname',
      async (nb, w) =>
        reseal({ ...nb, favorites: [fav(1, sprinterIds(w, 1)[0]!, { nickname: 'n'.repeat(61) })] }),
    ],
    [
      'a non-integer birth id',
      async (nb, w) => reseal({ ...nb, favorites: [fav(1, sprinterIds(w, 1)[0]!, { members: [[1.5, 0]] })] }),
    ],
    ['notebookVersion 2', async (nb) => reseal({ ...nb, notebookVersion: 2 })],
    // Fix round 1: own keys only (an Object.prototype name is an unknown section), and favorites: null is no list.
    ['a "constructor" section', async (nb) => reseal({ ...nb, constructor: 7 })],
    ['a "toString" section', async (nb) => reseal({ ...nb, toString: [] })],
    ['a "hasOwnProperty" section', async (nb) => reseal({ ...nb, hasOwnProperty: 1 })],
    ['favorites: null', async (nb) => reseal({ ...nb, favorites: null })],
    // Fix round 1: references are checked against the dish the file carries ("Unknown IDs are errors").
    [
      'a species the dish does not have',
      async (nb, w) => reseal({ ...nb, favorites: [fav(1, sprinterIds(w, 1)[0]!, { speciesId: 'ZZ9' })] }),
    ],
    [
      'a family root the dish never had',
      async (nb, w) => reseal({ ...nb, favorites: [fav(1, w.counters.nextBirthId)] }),
    ],
    [
      'a member the dish never had',
      async (nb, w) =>
        reseal({
          ...nb,
          favorites: [
            fav(1, sprinterIds(w, 1)[0]!, {
              members: [
                [sprinterIds(w, 1)[0]!, 0],
                [w.counters.nextBirthId + 5, 0],
              ],
            }),
          ],
        }),
    ],
    [
      'an extinction after the dish’s time',
      async (nb, w) =>
        reseal({
          ...nb,
          favorites: [
            fav(1, sprinterIds(w, 1)[0]!, {
              active: false,
              members: [],
              extinct: { tick: w.tick + 1, lastBirthId: sprinterIds(w, 1)[0]!, cause: 0, cell: -1 },
            }),
          ],
        }),
    ],
  ];
  async function reseal(nb: Record<string, unknown>): Promise<Record<string, unknown>> {
    return (await sealNotebook(nb as unknown as NotebookRecord)) as unknown as Record<string, unknown>;
  }
  for (const [label, damage] of cases) {
    it(label, async () => {
      const w = garden();
      const good = await buildSaveFile(w, META, { notebook: notebookFor(w, 1), includeNicknames: true });
      const plain = await buildSaveFile(w, META);
      const file = JSON.parse(good.text) as SaveFile & { notebook: Record<string, unknown> };
      const bad = { ...file, notebook: await damage(file.notebook, w) };
      const loaded = await loadSaveFile(JSON.stringify(bad));
      expect(loaded.notebookDropped).toBe(NOTEBOOK_DROPPED_TEXT);
      expect(loaded.notebookDropped).toBe(
        "This dish's notebook (favorites, story cards and goals) could not be read, so it was left out. The dish itself loaded.",
      );
      expect(loaded.notebook).toEqual(emptyNotebook(w.worldId));
      expect(loaded.file.notebook).toBeUndefined();
      expect(stateHash(loaded.world)).toBe(stateHash((await loadSaveFile(plain.text)).world));
      // The store's verify never falls back because of a notebook: the current record opens.
      const store = new SaveStore(new MemoryBackend());
      await store.save(requestFor('slot1', plain));
      await store.save({ ...requestFor('slot1', good), text: JSON.stringify(bad) });
      expect((await store.load('slot1', verifyLoad))!.usedPredecessor).toBe(false);
    });
  }
});

describe('old saves: migration by copy with an empty notebook', () => {
  it('a g2 save and the schema 2 fixture load with an empty notebook, keep their hashes, and re-save with one while the original stays the predecessor', async () => {
    const expected = readExpected();
    const texts: [string, string, string | null][] = [
      [G2_SAVE_FILES[0], readG2SaveText(G2_SAVE_FILES[0]), expected.saves[G2_SAVE_FILES[0]]!.hashAtLoad],
      [
        'schema2',
        gunzipSync(
          readFileSync('tests/persistence/fixtures/schema2-cleaning-crew-t1900.pixelmeba.gz'),
        ).toString('utf8'),
        null,
      ],
    ];
    for (const [name, text, hashAtLoad] of texts) {
      expect(JSON.parse(text).notebook, name).toBeUndefined();
      const loaded = await loadSaveFile(text);
      expect(loaded.notebookDropped, name).toBeNull();
      expect(loaded.notebook, name).toEqual(emptyNotebook(loaded.world.worldId));
      const hash = stateHash(loaded.world);
      if (hashAtLoad !== null) expect(hash, name).toBe(hashAtLoad);
      // Store the original as written, then re-save the same world with a notebook.
      const backend = new MemoryBackend();
      const store = new SaveStore(backend);
      const original = JSON.parse(text) as SaveFile;
      await store.save({
        slotId: 'slot1',
        text,
        checksum: original.checksum,
        name: original.meta.name,
        tick: original.tick,
        savedAt: original.meta.savedAt,
        recipeId: original.meta.recipeId,
      });
      const nb = notebookFor(loaded.world, 1);
      expect(nb.favorites.length, name).toBe(1);
      const resaved = await buildSaveFile(
        loaded.world,
        { ...original.meta, name: original.meta.name },
        { notebook: nb, includeNicknames: true },
      );
      await store.save(requestFor('slot1', resaved));
      const slot = (await backend.getSlot('slot1'))!;
      expect(await gunzipText(backend.records[slot.previous!]!.data), name).toBe(text);
      const again = await loadSaveFile((await store.load('slot1', verifyLoad))!.text);
      expect(stateHash(again.world), name).toBe(hash);
      expect(again.notebook.favorites, name).toEqual(nb.favorites);
      // The world record of the re-save is the same world: its hash is the original's.
      expect(stateHash((await loadSaveFile(text)).world), name).toBe(hash);
    }
  });
});

describe('exports and nicknames', () => {
  type Reply = FromWorker;
  async function hostWithDish(): Promise<{
    host: DishHost;
    out: Reply[];
    ask: <T extends Reply['type']>(m: ToWorker, type: T) => Promise<Extract<Reply, { type: T }>>;
    backend: MemoryBackend;
  }> {
    const out: Reply[] = [];
    const backend = new MemoryBackend();
    const host = new DishHost(
      REG,
      (m) => out.push(m),
      { now: () => 0, iso: () => '2026-10-10T00:00:00.000Z' },
      new SaveStore(backend),
    );
    let req = 100;
    const ask = async <T extends Reply['type']>(
      m: ToWorker,
      type: T,
    ): Promise<Extract<Reply, { type: T }>> => {
      const id = (m as { requestId?: number }).requestId;
      await host.handleAsync(m);
      const r = out.filter((x) => x.type === type && (x as { requestId?: number }).requestId === id).at(-1);
      if (!r) throw new Error(`no ${type} reply: ${JSON.stringify(out.filter((x) => x.type === 'error'))}`);
      return r as Extract<Reply, { type: T }>;
    };
    host.handle({
      type: 'create',
      requestId: ++req,
      dishId: 'd1',
      source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' },
    });
    const w = host.world('d1')!;
    const b = sprinterIds(w, 1)[0]!;
    await ask(
      {
        type: 'favorite',
        requestId: req + 1,
        dishId: 'd1',
        op: { kind: 'follow', birthId: b, nickname: 'Mango', pattern: 'triangle' },
      },
      'notebook',
    );
    return { host, out, ask, backend };
  }

  it('exportDish carries no nickname unless includeNicknames; stripNames drops them always', async () => {
    const { ask } = await hostWithDish();
    const nick = async (m: ToWorker) =>
      (JSON.parse((await ask(m, 'exported')).text) as SaveFile).notebook!.favorites[0]!.nickname;
    expect(await nick({ type: 'exportDish', requestId: 1, dishId: 'd1', strip: false })).toBeNull();
    expect(
      await nick({ type: 'exportDish', requestId: 2, dishId: 'd1', strip: false, includeNicknames: true }),
    ).toBe('Mango');
    expect(
      await nick({ type: 'exportDish', requestId: 3, dishId: 'd1', strip: true, includeNicknames: true }),
    ).toBeNull();
    expect(await nick({ type: 'exportDish', requestId: 4, dishId: 'd1', strip: true })).toBeNull();
    // Each exported notebook is valid and sealed (it loads without being dropped).
    const text = (await ask({ type: 'exportDish', requestId: 5, dishId: 'd1', strip: false }, 'exported'))
      .text;
    expect((await loadSaveFile(text)).notebookDropped).toBeNull();
  });

  it('exportSave (the stored autosave as a file) drops nicknames unless opted in; the state text and checksum are as stored', async () => {
    const { ask, backend } = await hostWithDish();
    await ask({ type: 'autosave', requestId: 10, dishId: 'd1' }, 'slotSaved');
    const stored = await gunzipText(backend.records[(await backend.getSlot(AUTOSAVE_SLOT))!.current]!.data);
    const storedFile = JSON.parse(stored) as SaveFile;
    expect(storedFile.notebook!.favorites[0]!.nickname).toBe('Mango'); // local saves keep nicknames
    const plain = (await ask({ type: 'exportSave', requestId: 11, slotId: AUTOSAVE_SLOT }, 'exported')).text;
    const plainFile = JSON.parse(plain) as SaveFile;
    expect(plainFile.notebook!.favorites[0]!.nickname).toBeNull();
    expect(plainFile.checksum).toBe(storedFile.checksum);
    expect(JSON.stringify(plainFile.state)).toBe(JSON.stringify(storedFile.state));
    expect((await loadSaveFile(plain)).notebookDropped).toBeNull();
    const opted = (
      await ask(
        { type: 'exportSave', requestId: 12, slotId: AUTOSAVE_SLOT, includeNicknames: true },
        'exported',
      )
    ).text;
    expect(opted).toBe(stored);
  });
});

describe('goal records: consistent only, and a running goal the dish can run (objectives-minors items 4, 5)', () => {
  const KEEP = { type: 'keepSpeciesAlive', params: { species: 'B01' }, durationSeconds: 180 } as const;
  const SPLIT = { type: 'observeEvent', params: { event: 'birth', species: 'B01' } } as const;
  const RING = { type: 'observeEvent', params: { event: 'command' } } as const;
  const goal = (extra: Partial<GoalRecord>): GoalRecord => ({
    id: 'goal-1',
    objectiveId: 'KEEP_SPRINTERS_GOING',
    title: 'Keep Sprinters going',
    predicate: KEEP,
    state: 'running',
    startTick: 0,
    endTick: null,
    progress: { startTick: 0, holdSinceTick: 0, state: 'running' },
    shown: false,
    ...extra,
  });
  const run = (p: Partial<GoalRecord['progress']>) => ({ startTick: 0, holdSinceTick: 0, state: 'running' as const, ...p });
  const w = garden();
  const refs = (world: World, extras = true): GoalWorldRefs => ({
    speciesIds: world.species.map((s) => s.id),
    nextBirthId: world.counters.nextBirthId,
    tick: world.tick,
    ...(extras ? goalWorldRefsOf(world) : {}),
  });
  async function problem(goals: GoalRecord[], world: World = w): Promise<string | null> {
    const nb = await sealNotebook({ ...emptyNotebook(world.worldId), goals });
    return notebookProblem(nb, world.worldId, refs(world));
  }

  it('every record shape the wave 5b build wrote in its normal flows still loads', async () => {
    const wave5b: [string, GoalRecord][] = [
      ['running keep (hold from Start)', goal({})],
      ['running split', goal({ objectiveId: 'SEE_SPRINTER_SPLIT', predicate: SPLIT, progress: run({ holdSinceTick: null }) })],
      ['completed split', goal({ predicate: SPLIT, state: 'completed', endTick: 351, progress: run({ holdSinceTick: null, state: 'completed' }), value: 1, shown: true })],
      ['completed keep', goal({ state: 'completed', endTick: 1800, progress: run({ state: 'completed' }), value: 4 })],
      ['ended: no Sprinters', goal({ state: 'ended', endTick: 90, endReason: 'zero', progress: run({ state: 'ended' }), value: 0 })],
      ['ended: no Sprinters at Start (hold never began)', goal({ state: 'ended', endTick: 0, endReason: 'zero', progress: run({ holdSinceTick: null, state: 'ended' }), value: 0 })],
      ['continued freely after no Sprinters', goal({ state: 'continuedFreely', endTick: 90, endReason: 'zero', progress: run({ state: 'ended' }), value: 0, shown: true })],
      // The wave 5b runner left progress.state 'running' after Undo and Leave goal (accepted as written).
      ['ended by Undo (before its start)', goal({ startTick: 400, state: 'ended', endTick: 300, endReason: 'undone', progress: run({ startTick: 400, holdSinceTick: 400 }) })],
      ['continued freely after Undo', goal({ state: 'continuedFreely', endTick: 60, endReason: 'undone', progress: run({}), shown: true })],
      ['left while running', goal({ state: 'continuedFreely', endTick: 40, endReason: 'left', progress: run({}), shown: true })],
    ];
    for (const [label, g] of wave5b) expect(await problem([g]), label).toBeNull();
    // And this build's own records.
    const now: [string, GoalRecord][] = [
      ['ended by an error rollback', goal({ state: 'ended', endTick: 50, endReason: 'failed', progress: run({ state: 'ended' }) })],
      ['ended: could not resume', goal({ state: 'ended', endTick: 0, endReason: 'cannotResume', progress: run({ state: 'ended' }) })],
      ['left while running (canonical)', goal({ state: 'continuedFreely', endTick: 0, endReason: 'left', progress: run({ state: 'ended' }), shown: true })],
      ['continued freely after an error', goal({ state: 'continuedFreely', endTick: 0, endReason: 'failed', progress: run({ state: 'ended' }), shown: true })],
      ['running event-ring goal with its position', goal({ predicate: RING, progress: run({ holdSinceTick: null, lastEventId: w.counters.nextEventId - 1 }) })],
    ];
    for (const [label, g] of now) expect(await problem([g]), label).toBeNull();
  });

  it('an internally inconsistent record is refused (the notebook is dropped, the world loads)', async () => {
    const bad: [string, GoalRecord, RegExp][] = [
      ['completed with progress.state running', goal({ predicate: SPLIT, state: 'completed', endTick: 5, progress: run({ holdSinceTick: null }) }), /progress does not match its state/],
      ['completed with endTick < startTick', goal({ predicate: SPLIT, state: 'completed', startTick: 10, endTick: 3, progress: run({ startTick: 10, holdSinceTick: null, state: 'completed' }) }), /ends before it started/],
      ['left with endTick < startTick', goal({ startTick: 10, state: 'continuedFreely', endTick: 3, endReason: 'left', progress: run({ startTick: 10, holdSinceTick: 10, state: 'ended' }), shown: true }), /ends before it started/],
      ['holdSinceTick on an observeEvent goal', goal({ predicate: SPLIT, progress: run({ holdSinceTick: 0 }) }), /duration its predicate does not have/],
      ['value on a running goal', goal({ value: 3 }), /value without a result/],
      ['shown on a running goal', goal({ shown: true }), /marked shown/],
      ['value on an attempt Undo ended', goal({ state: 'ended', endTick: 5, endReason: 'undone', progress: run({ state: 'ended' }), value: 2 }), /value without a result/],
      ['ended after an error with progress running', goal({ state: 'ended', endTick: 5, endReason: 'failed', progress: run({}) }), /progress does not match its state/],
      ['continued freely after zero with progress running', goal({ state: 'continuedFreely', endTick: 5, endReason: 'zero', progress: run({}), value: 0, shown: true }), /progress does not match its state/],
      ['completed with progress ended', goal({ state: 'completed', endTick: 5, progress: run({ state: 'ended' }) }), /progress does not match its state/],
      ['an event position on a birth goal', goal({ predicate: SPLIT, progress: run({ holdSinceTick: null, lastEventId: 0 }) }), /invalid event position/],
      ['a negative event position', goal({ predicate: RING, progress: run({ holdSinceTick: null, lastEventId: -1 }) }), /invalid event position/],
      ['an unknown end reason', goal({ state: 'ended', endTick: 5, endReason: 'rewound' as never, progress: run({ state: 'ended' }) }), /unknown end reason/],
    ];
    for (const [label, g, why] of bad) {
      expect(await problem([g]), label).toMatch(why);
      const nb = await sealNotebook({ ...emptyNotebook(w.worldId), goals: [g] });
      const read = await readNotebook(nb, w.worldId, refs(w));
      expect(read.dropped, label).toBe(NOTEBOOK_DROPPED_TEXT);
      expect(read.record.goals, label).toBeUndefined();
    }
  });

  it('a running goal the dish cannot run, or whose event position it never reached, drops the notebook', async () => {
    const g2 = (await loadSaveFile(readG2SaveText(G2_SAVE_FILES[0]))).world;
    const v01 = { type: 'fieldInRange', params: { field: 'v01', min: 0, max: 1 }, durationSeconds: 5 } as const;
    // The verifier's repro: the g2 dish recorded no viruses system, so it has no v01 field.
    expect(objectiveSupportProblem(g2, v01)).toMatch(/no v01/);
    const unsupported = goal({ objectiveId: 'X_GOAL', title: 'Probe', predicate: v01, progress: run({ holdSinceTick: null }) });
    expect(await problem([unsupported], g2)).toMatch(/cannot run in this dish \(this dish has no v01\)/);
    const read = await readNotebook(await sealNotebook({ ...emptyNotebook(g2.worldId), goals: [unsupported] }), g2.worldId, refs(g2));
    expect(read.dropped).toBe(NOTEBOOK_DROPPED_TEXT);
    // A finished record of that goal is kept like a journal entry (it never runs again).
    expect(await problem([{ ...unsupported, state: 'ended', endTick: 3000, endReason: 'undone', progress: run({ holdSinceTick: null, state: 'ended' }) }], g2)).toBeNull();
    // The event position must be in the dish's past.
    const at = (lastEventId: number) => goal({ predicate: RING, progress: run({ holdSinceTick: null, lastEventId }) });
    expect(await problem([at(g2.counters.nextEventId - 1)], g2)).toBeNull();
    expect(await problem([at(g2.counters.nextEventId)], g2)).toMatch(/saw an event this dish never had/);
  });
});
