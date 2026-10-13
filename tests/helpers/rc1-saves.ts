/**
 * The rc1 saves (tests/fixtures/saves-rc1/; Phase 5 preflight; g5-plan lead call 1).
 *
 * Real .pixelmeba files written by the v1.0.0-rc1 build (tools/make-rc1-saves.ts, before the Phase 5
 * manifest bump) through the worker host's own save path (DishHost 'exportDish' → buildSaveFile with
 * the dish's notebook record beside the state, nicknames kept, as the device's own saves write it),
 * gzipped. They hold the Phase 3–4 state the g2 corpus cannot: module carriers, film, fungal links,
 * a Hitcher on its host, Pinphage infection and lysis, food objects, Lab chemistry edits, a held
 * Sample and a notebook with favorites, story cards, goals, a bookmark and a gallery specimen.
 *
 * expected.json records, per save, what the rc1 build measured after loading it through the import
 * path (loadSaveFile): the state hash at load, the notebook record's checksum as read back (the record
 * sits outside the world checksum and must survive the load unchanged; null for none), the state hash
 * after the step the app requires before time can run again (RC1_RESUME: Cancel of a held Sample, the
 * host's 'sampleCancel', exact by D-0037; null for none), the state hash 1,000 ticks later and the
 * trajectory digest ('full' mode, which covers post-g2 state) at that tick.
 * tests/fixtures/rc1-replay.test.ts requires every later build to reproduce all of them exactly (CLAUDE.md
 * "Saves are sacred": old saves keep their recorded ruleset). Only `tools/fence-update.ts --rc1 --reason
 * D-00xx` re-records expected.json, under a decision that states the version bump it makes ("<field>
 * N → M", landed in content/manifest.json) and that it re-records the rc1 corpus; a changed value is
 * traced in the file's changedBy. tools/make-rc1-saves.ts writes these files only on the rc1 build.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { loadSaveFile } from '../../src/persistence/saveFile';
import { ManifestSchema, type Manifest } from '../../src/sim/content/schema';
import { cancelSample } from '../../src/sim/sample';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { REPO_ROOT } from '../../tools/lib/content-fs';
import { trajectoryDigest } from './trajectory';

export const RC1_SAVES_DIR = join(REPO_ROOT, 'tests', 'fixtures', 'saves-rc1');
export const RC1_EXPECTED_PATH = join(RC1_SAVES_DIR, 'expected.json');
/** The rc1 build's manifest, every field (content/manifest.json at v1.0.0-rc1). */
export const RC1_MANIFEST_PATH = join(RC1_SAVES_DIR, 'rc1-manifest.json');
/** Ticks each save runs after loading before the second hash and the digest. */
export const RC1_REPLAY_TICKS = 1000;

/** The v1.0.0-rc1 manifest's identity: only a tree whose content/manifest.json carries it writes the rc1 saves. */
export const RC1_STAMPS = Object.freeze({
  buildPhase: 4,
  contentVersion: 2,
  contentHash: 'd3fbd36c4a5e03468389b02508f2a3ecc1ce8d04b25cba5dd5e5be18f184a8bf',
});

/** The save files, in the order tools/make-rc1-saves.ts writes them (names are fixed: they are fixtures). */
export const RC1_SAVE_FILES = [
  'first-dish-diverse-notebook-t3000.pixelmeba.gz',
  'first-dish-lab-food-sample-held-t1500.pixelmeba.gz',
  'borrowed-shelter-velvet-t1500.pixelmeba.gz',
  'fungal-supply-line-t900.pixelmeba.gz',
  'one-host-pinphage-t300.pixelmeba.gz',
] as const;
export type Rc1SaveFile = (typeof RC1_SAVE_FILES)[number];

/**
 * What the app must do with a loaded save before its time can run (null: nothing). A dish holding a
 * Sample stays paused until the sample is transferred, discarded or cancelled (D-0037, D-0054): the
 * replay cancels it as the host's 'sampleCancel' does (src/sim/sample.ts cancelSample), which returns
 * the dish exactly to its state before Sample Begin, also after a save and reload.
 */
export const RC1_RESUME: Readonly<Record<Rc1SaveFile, 'sampleCancel' | null>> = {
  'first-dish-diverse-notebook-t3000.pixelmeba.gz': null,
  'first-dish-lab-food-sample-held-t1500.pixelmeba.gz': 'sampleCancel',
  'borrowed-shelter-velvet-t1500.pixelmeba.gz': null,
  'fungal-supply-line-t900.pixelmeba.gz': null,
  'one-host-pinphage-t300.pixelmeba.gz': null,
};

export interface Rc1Expected {
  readonly hashAtLoad: string;
  /** The notebook record's own checksum as loadSaveFile read it back ("sha256:…"), or null when the file carries none. */
  readonly notebookChecksum: string | null;
  /** stateHash after the RC1_RESUME step, or null when the save needs none. */
  readonly hashAfterResume: string | null;
  readonly hashPlus1000: string;
  readonly digestPlus1000: string;
}

/** One --rc1 re-record that changed recorded values: its decision and the saves whose values changed. */
export interface Rc1ExpectedChange {
  readonly decision: string;
  readonly saves: readonly string[];
}

export interface Rc1ExpectedFile {
  readonly about: string;
  readonly replayTicks: number;
  readonly saves: Readonly<Record<string, Rc1Expected>>;
  /** Present once a decided change has re-recorded values (tools/fence-update.ts --rc1), oldest first. */
  readonly changedBy?: readonly Rc1ExpectedChange[];
}

export const RC1_EXPECTED_ABOUT =
  'Recorded by the v1.0.0-rc1 build (tools/make-rc1-saves.ts) through loadSaveFile: stateHash at load, the notebook record\'s checksum as read back, stateHash after the resume step (Cancel of a held Sample), stateHash after replayTicks more ticks, and trajectoryDigest(world, "full") at that tick. Re-recorded only by tools/fence-update.ts --rc1 --reason D-00xx.';

/** The rc1 manifest as committed (rc1-manifest.json). */
export function rc1Manifest(path: string = RC1_MANIFEST_PATH): Manifest {
  return ManifestSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/** A save's text (the .pixelmeba JSON) from its gzipped fixture. */
export function readRc1SaveText(file: string, dir: string = RC1_SAVES_DIR): string {
  return gunzipSync(readFileSync(join(dir, file))).toString('utf8');
}

export function readRc1Expected(path: string = RC1_EXPECTED_PATH): Rc1ExpectedFile {
  return JSON.parse(readFileSync(path, 'utf8')) as Rc1ExpectedFile;
}

/**
 * expected.json's text: fixed key order (RC1_SAVE_FILES order), two-space indent, trailing newline.
 * `changedBy` is written only when it is not empty, so the file the rc1 build wrote keeps its bytes.
 */
export function rc1ExpectedText(saves: Readonly<Record<string, Rc1Expected>>, changedBy: readonly Rc1ExpectedChange[] = []): string {
  const ordered: Record<string, Rc1Expected> = {};
  for (const f of RC1_SAVE_FILES) {
    const e = saves[f];
    if (!e) throw new Error(`expected.json: no entry for ${f}`);
    ordered[f] = { hashAtLoad: e.hashAtLoad, notebookChecksum: e.notebookChecksum, hashAfterResume: e.hashAfterResume, hashPlus1000: e.hashPlus1000, digestPlus1000: e.digestPlus1000 };
  }
  const file: Rc1ExpectedFile = {
    about: RC1_EXPECTED_ABOUT,
    replayTicks: RC1_REPLAY_TICKS,
    saves: ordered,
    ...(changedBy.length > 0 ? { changedBy: changedBy.map((c) => ({ decision: c.decision, saves: [...c.saves] })) } : {}),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Two recorded entries are the same (every value). */
export function sameRc1Expected(a: Rc1Expected | undefined, b: Rc1Expected): boolean {
  return (
    a !== undefined &&
    a.hashAtLoad === b.hashAtLoad &&
    a.notebookChecksum === b.notebookChecksum &&
    a.hashAfterResume === b.hashAfterResume &&
    a.hashPlus1000 === b.hashPlus1000 &&
    a.digestPlus1000 === b.digestPlus1000
  );
}

/** Apply save `file`'s RC1_RESUME step to its loaded world; returns the state hash after it, or null when it needs none. */
export function resumeRc1(file: Rc1SaveFile, world: World): string | null {
  if (RC1_RESUME[file] === null) return null;
  cancelSample(world);
  return stateHash(world);
}

/**
 * Load save `file` through the import path, hash it and read its notebook back, apply its resume step,
 * run RC1_REPLAY_TICKS ticks, hash and digest it. A notebook the loader dropped is an error (the record
 * must survive the load).
 */
export async function measureRc1Save(file: Rc1SaveFile, text: string): Promise<{ expected: Rc1Expected; world: World }> {
  const { world, notebook, notebookDropped } = await loadSaveFile(text);
  if (notebookDropped !== null) throw new Error(`the save's notebook was dropped at load: ${notebookDropped}`);
  const hasNotebook = (JSON.parse(text) as { notebook?: unknown }).notebook !== undefined;
  const hashAtLoad = stateHash(world);
  const hashAfterResume = resumeRc1(file, world);
  run(world, RC1_REPLAY_TICKS);
  return {
    expected: { hashAtLoad, notebookChecksum: hasNotebook ? notebook.checksum : null, hashAfterResume, hashPlus1000: stateHash(world), digestPlus1000: trajectoryDigest(world, 'full') },
    world,
  };
}
