/**
 * P5.6 part 3: notebooks written before the succession kind load unchanged (D-0131: NOTEBOOK_VERSION stays 1; the
 * kind is one more optional key, as the six since P4.2; D-0070, D-0073).
 *
 * - the rc1 corpus's notebook (favorites, a story card and a goal; tests/fixtures/saves-rc1, written by the
 *   v1.0.0-rc1 build) loads under this build with nothing dropped, every kind equal to the file's, and re-seals
 *   byte-identically (the same canonical record and checksum) when nothing changed;
 * - so does a notebook written by the code at db1c943, before this wave's changes
 *   (tests/fixtures/notebook-v1/head-notebook-t900.pixelmeba.gz: HEAD's DishHost on FIRST_DISH_V1 with a followed
 *   family, a completed and a running goal with HEAD's progress keys, story cards, a bookmark, a gallery specimen
 *   and a challenge, exported through HEAD's own save path; written by a script run on `git archive db1c943`);
 * - the running goal it carries resumes under this build's engine (HEAD's progress keys are exactly what this
 *   build writes for a v1.0 goal);
 * - NOTEBOOK_VERSION is 1 and an empty notebook is written as version 1.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSaveFile, type SaveFile } from '../../src/persistence/saveFile';
import { emptyNotebook, NOTEBOOK_VERSION, sealNotebook } from '../../src/persistence/notebook';
import { goalsOf } from '../../src/persistence/notebookGoals';
import { canonicalJson } from '../../src/sim/hash';
import { ObjectiveWatch } from '../../src/sim/objectives';
import { readRc1SaveText } from '../helpers/rc1-saves';
import { REPO_ROOT } from '../../tools/lib/content-fs';

const HEAD_DIR = join(REPO_ROOT, 'tests', 'fixtures', 'notebook-v1');

async function check(text: string): Promise<{ file: SaveFile & { notebook: Record<string, unknown> }; loaded: Awaited<ReturnType<typeof loadSaveFile>> }> {
  const file = JSON.parse(text) as SaveFile & { notebook: Record<string, unknown> };
  const loaded = await loadSaveFile(text);
  expect(loaded.notebookDropped).toBeNull();
  // Every kind as the file wrote it (no succession key appears; nothing is rewritten).
  expect(loaded.notebook as unknown as Record<string, unknown>).toEqual(file.notebook);
  expect('succession' in loaded.notebook).toBe(false);
  expect(file.notebook.notebookVersion).toBe(1);
  // Re-sealed with nothing changed: the same canonical record and checksum.
  const resealed = await sealNotebook(loaded.notebook);
  expect(canonicalJson(resealed)).toBe(canonicalJson(file.notebook));
  expect(resealed.checksum).toBe(file.notebook.checksum);
  return { file, loaded };
}

describe('notebooks written before the succession kind', () => {
  it('the rc1 corpus notebook (favorites, a story card, a goal)', async () => {
    const { file } = await check(readRc1SaveText('first-dish-diverse-notebook-t3000.pixelmeba.gz'));
    expect(Object.keys(file.notebook).sort()).toEqual(expect.arrayContaining(['favorites', 'goals', 'stories']));
  });

  it('a notebook written by the code before this wave (favorites, goals, stories, bookmarks, gallery, a challenge); its running goal resumes', async () => {
    const { file, loaded } = await check(readRc1SaveText('head-notebook-t900.pixelmeba.gz', HEAD_DIR));
    expect(Object.keys(file.notebook).sort()).toEqual(['bookmarks', 'challenges', 'checksum', 'favorites', 'format', 'gallery', 'goals', 'nextFavorite', 'notebookVersion', 'stories', 'worldId']);
    const goals = goalsOf(loaded.notebook);
    expect(goals.map((g) => [g.objectiveId, g.state, Object.keys(g.progress).sort().join(',')])).toEqual([
      ['SEE_SPRINTER_SPLIT', 'completed', 'holdSinceTick,startTick,state'],
      ['KEEP_SPRINTERS_GOING', 'running', 'holdSinceTick,startTick,state'],
    ]);
    const running = goals[1]!;
    const watch = new ObjectiveWatch(running.predicate as never, loaded.world, running.progress);
    // HEAD's keys are exactly what this build writes for a v1.0 goal.
    expect(watch.progress()).toEqual(running.progress);
  });

  it('NOTEBOOK_VERSION stays 1 (D-0131)', () => {
    expect(NOTEBOOK_VERSION).toBe(1);
    expect(emptyNotebook('w').notebookVersion).toBe(1);
  });
});
