/**
 * P4.8b notebook kinds 'bookmarks' and 'gallery' (SPEC §12.8, §14.1; CT §12.10; D-0070).
 *
 * - round trip: bookmarks (text and snapshot references) and gallery entries survive save → load exactly;
 *   the world checksum and stateHash are the same with and without them;
 * - each malformed record drops the notebook with NOTEBOOK_DROPPED_TEXT and the world loads unchanged:
 *   52 bookmarks, a 61-character title, a snapshot reference without checksum, 101 gallery entries, a crop
 *   with 201 sprites, a non-finite tick (each also checked against its validator's own message);
 * - old saves: a g2 save, a wave 5 save (favorites only) and a stage 1 save (a Try my dish turn) load with
 *   both kinds empty;
 * - the worst-case notebook (50 bookmarks + 100 full gallery entries + 3 favorites of 6,000 members in all)
 *   stays under NOTEBOOK_MAX_BYTES (the size is printed).
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile, type SaveFile } from '../../src/persistence/saveFile';
import { emptyNotebook, NOTEBOOK_DROPPED_TEXT, NOTEBOOK_MAX_BYTES, notebookIsEmpty, notebookProblem, sealNotebook, type FavoriteRecord, type NotebookRecord } from '../../src/persistence/notebook';
import { BOOKMARKS_MAX, bookmarksOf, bookmarksProblem, withoutBookmarkNotes, type Bookmark } from '../../src/persistence/notebookBookmarks';
import { encodeGround, GALLERY_MAX, GALLERY_SPRITES_MAX, galleryOf, galleryProblem, type GalleryEntry, type GallerySprite } from '../../src/persistence/notebookGallery';
import type { TurnRecord } from '../../src/persistence/notebookTurns';
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

describe('old saves load with both kinds empty', () => {
  it('a g2 save, a wave 5 save (favorites) and a stage 1 save (a Try my dish turn)', async () => {
    const g2 = await loadSaveFile(readG2SaveText(G2_SAVE_FILES[0]));
    expect(g2.notebookDropped).toBeNull();
    expect(bookmarksOf(g2.notebook)).toEqual([]);
    expect(galleryOf(g2.notebook)).toEqual([]);

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
