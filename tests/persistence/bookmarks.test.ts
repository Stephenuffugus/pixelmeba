/**
 * P4.8b notebook kinds 'bookmarks' and 'gallery' (SPEC §12.8, §14.1; CT §12.10; D-0070).
 *
 * - round trip: bookmarks (text and snapshot references) and gallery entries survive save → load exactly;
 *   the world checksum and stateHash are the same with and without them;
 * - each malformed record drops the notebook with NOTEBOOK_DROPPED_TEXT and the world loads unchanged:
 *   52 bookmarks, a 61-character title, a snapshot reference without checksum, 101 gallery entries, a crop
 *   with 201 sprites, a non-finite tick (each also checked against its validator's own message);
 * - old saves: a g2 save, a wave 5 save (favorites only) and a stage 1 save (a Try my dish turn) load with
 *   every newer kind empty (goals, story cards, turns, bookmarks, gallery, challenges — whichever it predates);
 * - the worst-case notebook (50 bookmarks + 100 full gallery entries + 3 favorites of 6,000 members in all)
 *   stays under NOTEBOOK_MAX_BYTES (the size is printed);
 * - every kind at its limit in ONE record (favorites, story cards, goals, the turn, bookmarks, gallery,
 *   challenges and, P5.6, the succession notebook), written into a real save file, stays under NOTEBOOK_MAX_BYTES
 *   and passes notebookProblem.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile, type SaveFile } from '../../src/persistence/saveFile';
import { emptyNotebook, NOTEBOOK_DROPPED_TEXT, NOTEBOOK_MAX_BYTES, notebookIsEmpty, notebookProblem, sealNotebook, type FavoriteRecord, type NotebookRecord } from '../../src/persistence/notebook';
import { BOOKMARKS_MAX, bookmarksOf, bookmarksProblem, withoutBookmarkNotes, type Bookmark } from '../../src/persistence/notebookBookmarks';
import { encodeGround, GALLERY_MAX, GALLERY_SPRITES_MAX, galleryOf, galleryProblem, type GalleryEntry, type GallerySprite } from '../../src/persistence/notebookGallery';
import { TURN_HORIZON_TICKS, TURN_PREDICTION_MAX, TURNS_MAX, type TurnRecord } from '../../src/persistence/notebookTurns';
import { BOOKMARK_SUMMARY_MAX, BOOKMARK_TITLE_MAX } from '../../src/persistence/notebookBookmarks';
import { GALLERY_LINE_MAX, GALLERY_SUMMARY_LINES } from '../../src/persistence/notebookGallery';
import { FAVORITES_ACTIVE_MAX, FAVORITES_UNPINNED_MAX, NICKNAME_MAX, UNPINNED_MEMBERS_KEPT } from '../../src/persistence/notebook';
import { STORIES_MAX, STORY_EVIDENCE_MAX, type StoryCard } from '../../src/persistence/notebookStories';
import { GOAL_TITLE_MAX, GOALS_MAX, goalsOf, type GoalRecord } from '../../src/persistence/notebookGoals';
import {
  CHALLENGE_BUDGET_MAX,
  CHALLENGE_HORIZON_SECONDS,
  CHALLENGE_NAME_MAX,
  CHALLENGE_TOOL_GROUPS,
  challengeObjectiveId,
  CHALLENGES_MAX,
  challengesOf,
  type ChallengeRecord,
} from '../../src/persistence/notebookChallenges';
import { SHELF_LIMITS } from '../../src/persistence/shelf';
import { SUCCESSION_DEATH_CAUSES, SUCCESSION_EVIDENCE_MAX, SUCCESSION_LINES_MAX, SUCCESSION_MAX, SUCCESSION_MINUTE_TICKS, SUCCESSION_SEEN_MAX, type SuccessionEntry, type SuccessionLine } from '../../src/persistence/notebookSuccession';
import { AGENT_CAP } from '../../src/sim/constants';
import { FIELD_IDS } from '../../src/sim/fields';
import { MODULE_COST_KEYS } from '../../src/sim/lineage';
import { canonicalJson } from '../../src/sim/hash';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { G2_SAVE_FILES, readG2SaveText } from '../helpers/g2-saves';
import { registry } from '../helpers/world';

const REG = registry();
const META = { name: 'Bookmark dish', savedAt: '2026-10-11T00:00:00.000Z', recipeId: 'FIRST_DISH_V1' };
const SUM = `sha256:${'a'.repeat(64)}`;

function garden(): World {
  const w = realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: 'bm-dish' });
  run(w, 120);
  return w;
}

function bookmark(n: number, extra: Partial<Bookmark> = {}): Bookmark {
  return {
    id: `bm-${n}`,
    tick: 10 * n,
    title: `Little Living Garden at 0:${String(n % 60).padStart(2, '0')}`,
    summary: `A Sprinter split in two at 0:${String(n % 60).padStart(2, '0')} (event ${n}).`,
    eventId: n,
    snapshot: null,
    createdTick: 10 * n,
    ...extra,
  };
}

function snapshotRef(n: number): Bookmark['snapshot'] {
  return { shelfId: `shelf-snapshot-${String(n).padStart(8, '0')}-abc123`, checksum: SUM, bytes: 12345 };
}

/** A full gallery entry: 4 summary lines of 120 characters and 200 sprites at the longest coordinates. */
function specimen(n: number, w: World, sprites = GALLERY_SPRITES_MAX, extra: Partial<GalleryEntry> = {}): GalleryEntry {
  const rows: GallerySprite[] = Array.from({ length: sprites }, (_, k) => [k % w.species.length, 15.9, 15.9, 3]);
  return {
    id: `gal-${n}`,
    tick: 100,
    speciesId: w.species[0]!.id,
    birthId: 1,
    summary: ['L'.repeat(120), 'M'.repeat(120), 'N'.repeat(120), 'O'.repeat(120)],
    crop: { x0: 112, y0: 112, cells: 16, sprites: rows, substrate: encodeGround(new Uint8Array(256).fill(63)) },
    ...extra,
  };
}

function withKinds(w: World, bookmarks: readonly Bookmark[], gallery: readonly GalleryEntry[]): NotebookRecord {
  return { ...emptyNotebook(w.worldId), bookmarks, gallery };
}

async function reseal(nb: Record<string, unknown>): Promise<Record<string, unknown>> {
  return (await sealNotebook(nb as unknown as NotebookRecord)) as unknown as Record<string, unknown>;
}

describe('bookmarks and gallery in the save file', () => {
  it('round trip: save → load gives the same kinds; the world checksum and stateHash are the same with and without them', async () => {
    const w = garden();
    const nb = withKinds(w, [bookmark(1), bookmark(2, { snapshot: snapshotRef(1) })], [specimen(1, w, 3), specimen(2, w)]);
    const built = await buildSaveFile(w, META, { notebook: nb, includeNicknames: true });
    const plain = await buildSaveFile(w, META);
    expect(built.checksum).toBe(plain.checksum);
    const loaded = await loadSaveFile(built.text);
    expect(loaded.notebookDropped).toBeNull();
    expect(bookmarksOf(loaded.notebook)).toEqual(nb.bookmarks);
    expect(galleryOf(loaded.notebook)).toEqual(nb.gallery);
    expect(stateHash(loaded.world)).toBe(stateHash((await loadSaveFile(plain.text)).world));
    // Not empty: a notebook holding only bookmarks or only a gallery is written.
    expect(notebookIsEmpty(withKinds(w, [bookmark(1)], []))).toBe(false);
    expect(notebookIsEmpty(withKinds(w, [], [specimen(1, w, 1)]))).toBe(false);
  });

  it('"Export without names or notes" keeps no bookmark title and no snapshot reference', () => {
    const w = garden();
    const out = withoutBookmarkNotes(withKinds(w, [bookmark(7, { snapshot: snapshotRef(2), title: 'Mango’s big day' })], []));
    expect(bookmarksOf(out)[0]).toMatchObject({ title: 'Bookmark at 0:07', snapshot: null, summary: bookmark(7).summary });
  });
});

describe('a malformed bookmark or gallery record drops the notebook; the world loads unchanged', () => {
  const cases: [string, (nb: Record<string, unknown>, w: World) => Promise<Record<string, unknown>> | Record<string, unknown>, string][] = [
    ['52 bookmarks', (nb) => reseal({ ...nb, bookmarks: Array.from({ length: 52 }, (_, k) => bookmark(k + 1)) }), `more than ${BOOKMARKS_MAX} bookmarks`],
    ['a 61-character title', (nb) => reseal({ ...nb, bookmarks: [bookmark(1, { title: 't'.repeat(61) })] }), 'a bookmark has an invalid title'],
    [
      'a snapshot reference without checksum',
      (nb) => reseal({ ...nb, bookmarks: [bookmark(1, { snapshot: { shelfId: snapshotRef(1)!.shelfId, bytes: 10 } as unknown as Bookmark['snapshot'] })] }),
      'a bookmark’s snapshot has no checksum',
    ],
    ['101 gallery entries', (nb, w) => reseal({ ...nb, gallery: Array.from({ length: 101 }, (_, k) => specimen(k + 1, w, 1)) }), `more than ${GALLERY_MAX} gallery entries`],
    ['a crop with 201 sprites', (nb, w) => reseal({ ...nb, gallery: [specimen(1, w, 201)] }), 'a gallery picture has more than 200 organisms'],
    // JSON cannot write Infinity: the file text carries 1e999, which JSON.parse reads as Infinity.
    ['a non-finite tick', (nb) => ({ ...nb, bookmarks: [bookmark(1, { tick: 987654321 })] }), 'a bookmark has an invalid time'],
  ];
  for (const [label, damage, problem] of cases) {
    it(label, async () => {
      const w = garden();
      const good = await buildSaveFile(w, META, { notebook: withKinds(w, [bookmark(1)], [specimen(1, w, 2)]), includeNicknames: true });
      const plain = await buildSaveFile(w, META);
      const file = JSON.parse(good.text) as SaveFile & { notebook: Record<string, unknown> };
      const bad = { ...file, notebook: await damage(file.notebook, w) };
      const text = JSON.stringify(bad).replace('987654321', '1e999');
      // The validator itself names the problem (the kind check runs before the checksum).
      const parsedNb = (JSON.parse(text) as { notebook: unknown }).notebook;
      expect(await notebookProblem(parsedNb, w.worldId)).toBe(problem);
      const loaded = await loadSaveFile(text);
      expect(loaded.notebookDropped).toBe(NOTEBOOK_DROPPED_TEXT);
      expect(loaded.notebook).toEqual(emptyNotebook(w.worldId));
      expect(loaded.file.notebook).toBeUndefined();
      expect(stateHash(loaded.world)).toBe(stateHash((await loadSaveFile(plain.text)).world));
    });
  }

  it('the validators name each problem directly', () => {
    const w = garden();
    expect(bookmarksProblem([bookmark(1, { tick: Number.POSITIVE_INFINITY })])).toBe('a bookmark has an invalid time');
    expect(bookmarksProblem([bookmark(1, { tick: Number.NaN })])).toBe('a bookmark has an invalid time');
    expect(galleryProblem([specimen(1, w, 1, { tick: Number.POSITIVE_INFINITY })])).toBe('a gallery entry has an invalid time');
    expect(galleryProblem([specimen(1, w, 1, { crop: { ...specimen(1, w, 1).crop, sprites: [[0, Number.NaN, 1, 0]] } })])).toBe('a gallery picture has an organism outside it');
    expect(bookmarksProblem([bookmark(1), bookmark(1)])).toBe('two bookmarks share an id');
    expect(bookmarksProblem(Array.from({ length: 50 }, (_, k) => bookmark(k + 1)))).toBeNull();
    expect(galleryProblem(Array.from({ length: 100 }, (_, k) => specimen(k + 1, w, 1)))).toBeNull();
    expect(galleryProblem([specimen(1, w, 1, { genome: [1, 2, 3] } as unknown as Partial<GalleryEntry>)])).toBe('a gallery entry has an unknown field "genome"');
  });

  it('a gallery entry naming a species the dish does not have drops the notebook', async () => {
    const w = garden();
    const built = await buildSaveFile(w, META, { notebook: withKinds(w, [], [specimen(1, w, 1, { speciesId: 'ZZ9' })]), includeNicknames: true });
    expect((await loadSaveFile(built.text)).notebookDropped).toBe(NOTEBOOK_DROPPED_TEXT);
  });
});

/** Every notebook kind newer than a save's own is empty after loading it. */
function expectNewerKindsEmpty(nb: NotebookRecord, carried: readonly string[]): void {
  const kinds: Record<string, readonly unknown[]> = {
    favorites: nb.favorites,
    goals: goalsOf(nb),
    stories: nb.stories ?? [],
    turns: nb.turns ?? [],
    bookmarks: bookmarksOf(nb),
    gallery: galleryOf(nb),
    challenges: challengesOf(nb),
  };
  for (const [kind, list] of Object.entries(kinds)) if (!carried.includes(kind)) expect(list, kind).toEqual([]);
}

describe('old saves load with every new kind empty', () => {
  it('old saves load with every new kind empty: a g2 save, a wave 5 save (favorites) and a stage 1 save (a Try my dish turn)', async () => {
    const g2 = await loadSaveFile(readG2SaveText(G2_SAVE_FILES[0]));
    expect(g2.notebookDropped).toBeNull();
    expect(bookmarksOf(g2.notebook)).toEqual([]);
    expect(galleryOf(g2.notebook)).toEqual([]);
    expectNewerKindsEmpty(g2.notebook, []);

    const w = garden();
    let alive = 0;
    for (let i = 0; i < w.ents.highWater; i++) if (w.ents.cols.alive[i] === 1 && alive === 0) alive = w.ents.cols.birthId[i]!;
    const fav: FavoriteRecord = { id: 'fav-1', rootBirthId: alive, speciesId: 'B01', nickname: null, pattern: 'circle', representative: alive, active: true, createdTick: 0, members: [[alive, 0]], historyIncomplete: false, extinct: null };
    const sp = w.species[w.ents.cols.species[0]!]!.id;
    const wave5 = await buildSaveFile(w, META, { notebook: { ...emptyNotebook(w.worldId), favorites: [{ ...fav, speciesId: sp }], nextFavorite: 2 }, includeNicknames: true });
    expect(JSON.parse(wave5.text).notebook.bookmarks).toBeUndefined();
    const l5 = await loadSaveFile(wave5.text);
    expect(l5.notebookDropped).toBeNull();
    expect(l5.notebook.favorites).toHaveLength(1);
    expect(bookmarksOf(l5.notebook)).toEqual([]);
    expect(galleryOf(l5.notebook)).toEqual([]);
    expectNewerKindsEmpty(l5.notebook, ['favorites']);

    const turn: TurnRecord = {
      tryId: 'try-1',
      baseline: { shelfId: 'shelf-baseline-00000001-abc', checksum: SUM, worldId: 'base-dish', tick: w.tick, name: 'Little Living Garden' },
      turn: 1,
      turnWorldId: w.worldId,
      startTick: w.tick,
      horizonTicks: 600,
      objectiveId: null,
      prediction: '',
      state: 'running',
      kept: null,
    };
    const stage1 = await buildSaveFile(w, META, { notebook: { ...emptyNotebook(w.worldId), turns: [turn] }, includeNicknames: true });
    expect(JSON.parse(stage1.text).notebook.gallery).toBeUndefined();
    const l1 = await loadSaveFile(stage1.text);
    expect(l1.notebookDropped).toBeNull();
    expect(l1.notebook.turns).toEqual([turn]);
    expect(bookmarksOf(l1.notebook)).toEqual([]);
    expect(galleryOf(l1.notebook)).toEqual([]);
    expectNewerKindsEmpty(l1.notebook, ['turns']);
  });
});

describe('size', () => {
  it('the worst-case notebook (50 bookmarks + 100 full gallery entries + 3 favorites) stays under NOTEBOOK_MAX_BYTES', async () => {
    const w = garden();
    const bookmarks = Array.from({ length: BOOKMARKS_MAX }, (_, k) =>
      bookmark(k + 1, { title: 'T'.repeat(60), summary: 'S'.repeat(200), eventId: 999_999_999, tick: 999_999_999, createdTick: 999_999_999, snapshot: k < 20 ? snapshotRef(k + 1) : null }),
    );
    const gallery = Array.from({ length: GALLERY_MAX }, (_, k) => specimen(k + 1, w, GALLERY_SPRITES_MAX, { birthId: 999_999_999, tick: 999_999_999 }));
    // Three followed families of 2,000 members each (6,000: the agent cap), nine-digit ids and ticks.
    const favorites: FavoriteRecord[] = [0, 1, 2].map((f) => ({
      id: `fav-${f + 1}`,
      rootBirthId: 100_000_000 + f,
      speciesId: 'B01',
      nickname: 'N'.repeat(60),
      pattern: 'circle',
      representative: 100_000_000 + f,
      active: true,
      createdTick: 0,
      members: Array.from({ length: 2000 }, (_, k) => [100_000_000 + f * 10_000 + k, 999_999_999] as [number, number]),
      historyIncomplete: false,
      extinct: null,
    }));
    const record = await sealNotebook({ ...emptyNotebook('w'.repeat(80)), favorites, nextFavorite: 4, bookmarks, gallery });
    const { checksum: _c, ...payload } = record;
    const bytes = canonicalJson(payload).length;
    console.log(`worst-case notebook: ${bytes} bytes of ${NOTEBOOK_MAX_BYTES} (${((bytes / NOTEBOOK_MAX_BYTES) * 100).toFixed(1)} %)`);
    expect(bytes).toBeLessThan(NOTEBOOK_MAX_BYTES);
    expect(await notebookProblem(record, 'w'.repeat(80))).toBeNull();
  });
});

describe('size: every kind at its limit in one record', () => {
  /**
   * ASSUMPTIONS this measure rests on:
   * - each followed family holds at most AGENT_CAP living members (a dish never holds more organisms), and
   *   the FAVORITES_ACTIVE_MAX followed families may each hold all of them: a nested family can be
   *   followed beside its ancestors (src/worker/favorites.ts follow; lineage compaction moves a family's
   *   root), so their member lists overlap; an unpinned favorite keeps UNPINNED_MEMBERS_KEPT;
   * - a story card's summary holds what the story generator writes (src/worker/stories.ts onBranch, a
   *   familyChanged card, the largest template): each text as long as this build's content can make it
   *   (src/sim/branches.ts generatedBranchName and traitDescriptor build names only from content names and
   *   a short id), two profiles and the module changes between two genomes of at most
   *   GENOME_MODULES_MAX modules each, each change with as many cost numbers as a module of this build's
   *   content defines (src/sim/lineage.ts moduleChange keeps only the registry's own params);
   * - snapshot references are bounded by the device's snapshot limit (SHELF_LIMITS.snapshot).
   * Every text a player types (titles, nicknames, names, the prediction) and every gallery line is at its
   * limit in astral-plane characters (two UTF-16 units each); every id, tick and number is long. The size
   * printed is in UTF-16 units, which is what notebookProblem compares with NOTEBOOK_MAX_BYTES (its UTF-8
   * size is printed too). Measured 2026-10-12: 1,285,268 (61.3 % of the 2 MiB cap; with the followed
   * families sharing AGENT_CAP members it was 1,021,268, 97.4 % of the old 1 MiB cap). The same record
   * again with every story card's texts at the validator's 200 units, STORY_EVIDENCE_MAX evidence ids and
   * every module cost key (more than the generator writes; its structure kept) measures 1,647,868 (78.6 %).
   * Nothing checks the size at write time, so this is the tripwire (D-0090): what the app writes must stay
   * under 70 % of the cap, and the wide case under the cap.
   */
  it('favorites, story cards, goals, the turn, bookmarks, gallery and challenges at their limits: the real save file’s notebook stays under NOTEBOOK_MAX_BYTES', async () => {
    // src/sim/genome.ts validates "at most three supplementary modules" and exports no constant for it.
    const GENOME_MODULES_MAX = 3;
    const W = 'w'.repeat(80);
    const w = realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: W });
    run(w, 30);
    const A = '\u{1D538}'; // 𝔸, outside the Basic Multilingual Plane
    const astral = (n: number) => A.repeat(n);
    const BIG = 999_999_999;
    const NUM = 123456.78901234567;
    const field = [...FIELD_IDS].sort((a, b) => b.length - a.length)[0]!;
    const sum = (k: number) => `sha256:${k.toString(16).padStart(64, 'f')}`;
    const tools = [...CHALLENGE_TOOL_GROUPS];
    const horizon = Math.max(...CHALLENGE_HORIZON_SECONDS) as ChallengeRecord['horizonSeconds'];

    const bookmarks: Bookmark[] = Array.from({ length: BOOKMARKS_MAX }, (_, k) => ({
      id: `bm-${BIG - k}`,
      tick: BIG,
      title: astral(BOOKMARK_TITLE_MAX),
      summary: astral(BOOKMARK_SUMMARY_MAX),
      eventId: BIG,
      snapshot: k < SHELF_LIMITS.snapshot ? { shelfId: `shelf-snapshot-${String(BIG - k).padStart(12, '9')}-${'a'.repeat(16)}`, checksum: sum(k), bytes: BIG } : null,
      createdTick: BIG,
    }));
    const gallery: GalleryEntry[] = Array.from({ length: GALLERY_MAX }, (_, k) =>
      specimen(k + 1, w, GALLERY_SPRITES_MAX, {
        id: `gal-${BIG - k}`,
        tick: BIG,
        speciesId: `B${'9'.repeat(31)}`,
        birthId: BIG,
        summary: Array.from({ length: GALLERY_SUMMARY_LINES }, () => astral(GALLERY_LINE_MAX)),
        crop: { x0: 112, y0: 112, cells: 16, sprites: Array.from({ length: GALLERY_SPRITES_MAX }, () => [255, 15.9, 15.9, 3]), substrate: encodeGround(new Uint8Array(256).fill(63)) },
      }),
    );
    const favorite = (n: number, members: number, active: boolean): FavoriteRecord => ({
      id: `fav-${n}`,
      rootBirthId: BIG,
      speciesId: `B${'9'.repeat(31)}`,
      nickname: astral(NICKNAME_MAX),
      pattern: 'triangle',
      representative: BIG,
      active,
      createdTick: BIG,
      members: Array.from({ length: members }, (_, k) => [100_000_000 + n * 100_000 + k, BIG] as [number, number]),
      historyIncomplete: true,
      extinct: null,
    });
    const followed = AGENT_CAP; // each followed family may hold every organism (nested families; see ASSUMPTIONS)
    const favorites = [
      ...Array.from({ length: FAVORITES_ACTIVE_MAX }, (_, k) => favorite(k + 1, followed, true)),
      ...Array.from({ length: FAVORITES_UNPINNED_MAX }, (_, k) => favorite(FAVORITES_ACTIVE_MAX + k + 1, UNPINNED_MEMBERS_KEPT, false)),
    ];
    expect(favorites.filter((f) => f.active).reduce((a, f) => a + f.members.length, 0)).toBe(FAVORITES_ACTIVE_MAX * AGENT_CAP);

    // The generator's bounds from this build (see ASSUMPTIONS): module params per module, foods per species.
    const costKeys = Math.max(...REG.moduleIds.map((id) => MODULE_COST_KEYS.filter((k) => REG.modules[id]!.params[k] !== undefined).length));
    const foodsMax = Math.max(...REG.speciesIds.map((id) => REG.species[id]!.foodPriority.length)); // src/sim/species.ts: foods are the foodPriority fields
    const costsOf = (wide: boolean) => MODULE_COST_KEYS.slice(0, wide ? MODULE_COST_KEYS.length : costKeys).map((key) => ({ key, value: NUM }));
    const longest = (xs: readonly string[]) => Math.max(...xs.map((x) => x.length));
    const moduleName = longest(REG.moduleIds.map((id) => REG.modules[id]!.name));
    const locusText = longest(REG.loci.flatMap((l) => [l.name, l.descriptorHigh, l.descriptorLow]));
    const descriptor = Math.max('Without '.length + moduleName, locusText, 'Ordered feeder'.length, longest(REG.materialIds) + '-leaning'.length);
    const shortId = 3 + 1 + 9; // three hex digits, '-', a nine-digit count (src/sim/branches.ts uniqueShortId)
    const generatedName = longest(REG.speciesIds.map((id) => REG.species[id]!.name)) + 3 + descriptor + 3 + shortId;
    const textOf = (wide: boolean) => (n: number) => 'X'.repeat(wide ? 200 : Math.min(n, 200));
    const moduleId = longest(REG.moduleIds);
    const foodId = longest([...FIELD_IDS]); // a food is a field id
    const profile = {
      speed: NUM,
      moveCostPerCell: NUM,
      moveCostPerSecond: NUM,
      sensesLight: true,
      intake: NUM,
      maintenance: NUM,
      upkeep: NUM,
      sensing: NUM,
      minDivisionAge: NUM,
      divisionCost: NUM,
      energyCap: NUM,
      ph: [NUM, NUM],
      salinity: [NUM, NUM],
      warmth: [NUM, NUM],
      restAfter: NUM,
      policy: 'generalist',
      foods: Array.from({ length: foodsMax }, () => 'X'.repeat(foodId)),
      weights: Array.from({ length: foodsMax }, () => NUM),
      modules: Array.from({ length: GENOME_MODULES_MAX }, () => 'X'.repeat(moduleId)),
    };
    // wide: every text at the validator's 200 units, STORY_EVIDENCE_MAX evidence ids, every cost key.
    const story = (n: number, wide = false): StoryCard => {
      const text = textOf(wide);
      const costs = costsOf(wide);
      return {
        id: `story-${BIG - n}`,
        template: 'familyChanged',
        key: `familyChanged:root-${BIG}`, // src/worker/stories.ts onBranch
        worldId: W,
        ruleset: { simulationVersion: BIG, evolutionRulesVersion: BIG, moduleRegistryVersion: BIG, contentHash: sum(n) },
        evidence: wide
          ? [`event:${999_999_999_999}`, `branch:${9_999_999}`, ...Array.from({ length: STORY_EVIDENCE_MAX - 2 }, (_, k) => `reaction:protein:${9_999_999_999 - k}:999999`)]
          : [`event:${999_999_999_999}`, `branch:${9_999_999}`], // onBranch records exactly these two
        summary: {
          branch: BIG,
          shortId: text(shortId),
          name: text(generatedName),
          species: `B${'9'.repeat(31)}`,
          rootBirthId: BIG,
          rootCell: BIG,
          candidateTick: BIG,
          establishedTick: BIG,
          members: BIG,
          depth: BIG,
          parentName: text(generatedName),
          trait: { kind: 'locus', locus: 7, delta: NUM, mean: false },
          descriptor: text(descriptor),
          module: { id: 'X'.repeat(moduleId), name: text(moduleName), surchargePerSecond: NUM, params: Object.fromEntries(costs.map((c) => [c.key, NUM])) },
          locusValues: { ancestor: NUM, branch: NUM },
          locusName: text(locusText),
          rules: {
            ancestor: profile,
            branch: profile,
            // Gained and lost together: at most GENOME_MODULES_MAX each way.
            modules: Array.from({ length: 2 * GENOME_MODULES_MAX }, (_, k) => ({ id: 'X'.repeat(moduleId), name: text(moduleName), gained: k < GENOME_MODULES_MAX, surchargePerSecond: NUM, costs })),
          },
        } as unknown as Extract<StoryCard, { template: 'familyChanged' }>['summary'],
        timeRange: [BIG, BIG],
        imageRefs: [],
        favoriteId: `fav-${BIG}`,
        notified: true,
        seen: true,
        dismissed: false,
      };
    };
    const stories = Array.from({ length: STORIES_MAX }, (_, k) => story(k));
    const goals: GoalRecord[] = Array.from({ length: GOALS_MAX }, (_, k) => ({
      id: `goal-${BIG - k}`,
      objectiveId: `G${'9'.repeat(63)}`,
      title: astral(GOAL_TITLE_MAX / 2),
      predicate: { type: 'fieldInRange', params: { field, region: 'bottomRight', min: NUM, max: NUM * 2 }, durationSeconds: horizon },
      state: 'completed',
      startTick: BIG - 1,
      endTick: BIG,
      progress: { startTick: BIG - 1, holdSinceTick: BIG - 1, state: 'completed' },
      value: NUM,
      shown: true,
    }));
    const challenges: ChallengeRecord[] = Array.from({ length: CHALLENGES_MAX }, (_, k) => ({
      id: `ch-${BIG - k}`,
      name: astral(CHALLENGE_NAME_MAX),
      objective: { type: 'fieldInRange', params: { field, min: NUM, max: NUM * 2 }, durationSeconds: horizon },
      allowedTools: tools,
      commandBudget: CHALLENGE_BUDGET_MAX,
      horizonSeconds: horizon,
      region: { kind: 'quarter', id: 'bottomRight' },
      baseline: { worldId: 'b'.repeat(200), tick: BIG, checksum: sum(k) },
    }));
    const turns: TurnRecord[] = Array.from({ length: TURNS_MAX }, () => ({
      tryId: `try-${BIG}`,
      baseline: { shelfId: `shelf-baseline-${'9'.repeat(12)}-${'a'.repeat(16)}`, checksum: sum(1), worldId: 'b'.repeat(200), tick: BIG, name: astral(60) },
      turn: 1_000_000,
      turnWorldId: W,
      startTick: BIG,
      horizonTicks: Math.max(...TURN_HORIZON_TICKS) as TurnRecord['horizonTicks'],
      objectiveId: challengeObjectiveId(`ch-${BIG}`),
      prediction: astral(TURN_PREDICTION_MAX),
      state: 'finished',
      kept: { slotId: 'slot10' },
      challenge: {
        id: `ch-${BIG}`,
        name: astral(CHALLENGE_NAME_MAX),
        allowedTools: tools,
        commandBudget: CHALLENGE_BUDGET_MAX,
        startSeq: BIG,
        predicate: { type: 'fieldInRange', params: { field, region: 'bottomRight', min: NUM, max: NUM * 2 }, durationSeconds: horizon },
      },
    }));

    /**
     * P5.6 (D-0131): the succession notebook at SUCCESSION_MAX entries of SUCCESSION_LINES_MAX lines with
     * SUCCESSION_EVIDENCE_MAX evidence ids each. Generator form (src/worker/succession.ts writes these fields): the
     * content's longest species id, a loss line's recorded causes (every death cause the generator counts), the
     * longest pool and enzyme, long values and ids. Validator form (`wide`): the validator's bounds (32-character
     * species ids, every cause, the longest evidence ids, values just under 1e9).
     */
    const succession = (wide: boolean): SuccessionEntry[] => {
      const spId = wide ? `B${'9'.repeat(31)}` : 'X'.repeat(longest(REG.speciesIds));
      const value = wide ? 999_999_999.99 : 123_456.78;
      // Evidence seconds lie in the entry's own minute (the validator checks it): the minute's last seconds.
      const evidence = (minute: number): string[] =>
        Array.from({ length: SUCCESSION_EVIDENCE_MAX }, (_, j) =>
          wide ? `intake:${minute * 60 - j}:${'B'.repeat(32)}:metabolite` : j < 2 ? `history:${minute * 60 - j}` : `event:${999_999_999_999 - j}`,
        );
      const line = (minute: number): SuccessionLine => ({
        kind: 'loss',
        species: spId,
        value,
        deaths: Object.fromEntries(SUCCESSION_DEATH_CAUSES.map((c) => [c, wide ? BIG : 99_999])),
        evidence: evidence(minute),
      });
      return Array.from({ length: SUCCESSION_MAX }, (_, k) => {
        const minute = 1_000_000 + k;
        return { id: `succ-${minute}`, minute, fromTick: (minute - 1) * SUCCESSION_MINUTE_TICKS, toTick: minute * SUCCESSION_MINUTE_TICKS, watchedFromTick: (minute - 1) * SUCCESSION_MINUTE_TICKS + 599, lines: Array.from({ length: SUCCESSION_LINES_MAX }, () => line(minute)) };
      });
    };

    /**
     * P5.6 fix round 1: the seen feeding links at SUCCESSION_SEEN_MAX. Generator form: the content's longest species id
     * on the longest pool ('pool:<id>:metabolite'), minutes of seven digits; validator form: catching links of two
     * 32-character ids at minute 1e8. Keys are unique (the validator checks it).
     */
    const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
    const code = (k: number, n: number): string => Array.from({ length: n }, (_, j) => ALPHA[Math.floor(k / ALPHA.length ** j) % ALPHA.length]!).join('');
    const successionSeen = (wide: boolean): [string, number][] =>
      Array.from({ length: SUCCESSION_SEEN_MAX }, (_, k) =>
        wide ? [`prey:B${code(k, 31)}:B${code(k + 1, 31)}`, 100_000_000] : [`pool:X${code(k, Math.max(2, longest(REG.speciesIds) - 1))}:metabolite`, 1_000_000 + SUCCESSION_MAX],
      );

    const notebook: NotebookRecord = { ...emptyNotebook(W), favorites, nextFavorite: BIG, stories, goals, turns, bookmarks, gallery, challenges, succession: succession(false), successionSeen: successionSeen(false) };
    // The real save file, as the worker writes it (nicknames kept: the larger of the two forms).
    const built = await buildSaveFile(w, META, { notebook, includeNicknames: true });
    const written = (JSON.parse(built.text) as SaveFile).notebook as unknown as Record<string, unknown>;
    expect(Object.keys(written).sort()).toEqual(['bookmarks', 'challenges', 'checksum', 'favorites', 'format', 'gallery', 'goals', 'nextFavorite', 'notebookVersion', 'stories', 'succession', 'successionSeen', 'turns', 'worldId']);
    const { checksum: _c, ...payload } = written;
    const units = canonicalJson(payload).length; // what notebookProblem compares with NOTEBOOK_MAX_BYTES
    const utf8 = new TextEncoder().encode(canonicalJson(payload)).byteLength;
    console.log(
      `every kind at its limit: ${units} of ${NOTEBOOK_MAX_BYTES} (${((units / NOTEBOOK_MAX_BYTES) * 100).toFixed(1)} %; ${utf8} bytes as UTF-8; save file ${built.text.length} characters)`,
    );
    for (const k of ['favorites', 'stories', 'goals', 'turns', 'bookmarks', 'gallery', 'challenges', 'succession', 'successionSeen']) console.log(`  ${k}: ${canonicalJson(written[k]).length}`);
    expect(units).toBeLessThan(NOTEBOOK_MAX_BYTES * 0.7); // the tripwire for what the app writes (D-0090)
    // Every kind passes its validator, the size check and the seal: a load would read this notebook.
    expect(await notebookProblem(written, W)).toBeNull();

    // D-0090: the story cards at the validator's text bounds still fit.
    const wideStories = Array.from({ length: STORIES_MAX }, (_, k) => story(k, true));
    const wide = await buildSaveFile(w, META, { notebook: { ...notebook, stories: wideStories, succession: succession(true), successionSeen: successionSeen(true) }, includeNicknames: true });
    const wideWritten = (JSON.parse(wide.text) as SaveFile).notebook as unknown as Record<string, unknown>;
    const { checksum: _w, ...widePayload } = wideWritten;
    const wideUnits = canonicalJson(widePayload).length;
    console.log(`with story texts at the validator's bounds: ${wideUnits} of ${NOTEBOOK_MAX_BYTES} (${((wideUnits / NOTEBOOK_MAX_BYTES) * 100).toFixed(1)} %)`);
    expect(wideUnits).toBeGreaterThan(units);
    expect(wideUnits).toBeLessThan(NOTEBOOK_MAX_BYTES);
    expect(await notebookProblem(wideWritten, W)).toBeNull();
  });
});
