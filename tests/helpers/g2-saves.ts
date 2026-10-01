/**
 * The g2 saves (tests/fixtures/saves/; Phase 3 preflight; g3-plan-recheck P-20, P-21; D-0035).
 *
 * Real .pixelmeba files written by the g2 build through buildSaveFile (tools/make-g2-saves.ts, before
 * the Phase 3 manifest bump), gzipped. expected.json records, per save, what the g2 build measured
 * after loading it through the import path (loadSaveFile): the state hash at load, the state hash
 * 1,000 ticks later and the trajectory digest ('g2' mode) at that tick. tests/fixtures/g2-replay.test.ts
 * requires every later build to reproduce all three exactly (D-0035: a loaded world without Phase 3
 * state hashes exactly as the g2 build hashed it). Only `tools/fence-update.ts --g2 --reason D-00xx`
 * re-records expected.json, under a decision that states the version bump it makes ("<field> N → M",
 * landed in content/manifest.json) and that it re-records the g2 fence; a changed value is traced
 * in the file's changedBy. tools/make-g2-saves.ts writes these files only on the g2 build itself.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { loadSaveFile } from '../../src/persistence/saveFile';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { REPO_ROOT } from '../../tools/lib/content-fs';
import { trajectoryDigest } from './trajectory';

export const SAVES_DIR = join(REPO_ROOT, 'tests', 'fixtures', 'saves');
export const EXPECTED_PATH = join(SAVES_DIR, 'expected.json');
/** The g2 build's manifest, every field (tests/helpers/registry.ts reads G2_LISTS from it). */
export const G2_MANIFEST_PATH = join(SAVES_DIR, 'g2-manifest.json');
/** Ticks each save runs after loading before the second hash and the digest. */
export const REPLAY_TICKS = 1000;

/** The save files, in the order tools/make-g2-saves.ts writes them (names are fixed: they are fixtures). */
export const G2_SAVE_FILES = [
  'first-dish-t3000.pixelmeba.gz',
  'starch-unlock-t900.pixelmeba.gz',
  'starch-unlock-e01-carriers-t900.pixelmeba.gz',
  'reserve-compare-t600.pixelmeba.gz',
  'first-dish-accelerated-varied-t6000.pixelmeba.gz',
  'exp106-arm-b-t300.pixelmeba.gz',
  'first-dish-lab-edits-t1200.pixelmeba.gz',
  'e03-dormancy-t500.pixelmeba.gz',
] as const;
export type G2SaveFile = (typeof G2_SAVE_FILES)[number];

export interface G2Expected {
  readonly hashAtLoad: string;
  readonly hashPlus1000: string;
  readonly digestPlus1000: string;
}

/** One --g2 re-record that changed recorded values: its decision and the saves whose values changed. */
export interface ExpectedChange {
  readonly decision: string;
  readonly saves: readonly string[];
}

export interface ExpectedFile {
  readonly about: string;
  readonly replayTicks: number;
  readonly saves: Readonly<Record<string, G2Expected>>;
  /** Present once a decided change has re-recorded values (tools/fence-update.ts --g2), oldest first. */
  readonly changedBy?: readonly ExpectedChange[];
}

export const EXPECTED_ABOUT =
  'Recorded by the g2 build (tools/make-g2-saves.ts) through loadSaveFile: stateHash at load, stateHash after replayTicks more ticks, and trajectoryDigest(world, "g2") at that tick. Re-recorded only by tools/fence-update.ts --g2 --reason D-00xx.';

/** A save's text (the .pixelmeba JSON) from its gzipped fixture. */
export function readG2SaveText(file: string, dir: string = SAVES_DIR): string {
  return gunzipSync(readFileSync(join(dir, file))).toString('utf8');
}

export function readExpected(path: string = EXPECTED_PATH): ExpectedFile {
  return JSON.parse(readFileSync(path, 'utf8')) as ExpectedFile;
}

/**
 * expected.json's text: fixed key order (G2_SAVE_FILES order), two-space indent, trailing newline.
 * `changedBy` is written only when it is not empty, so the file the g2 build wrote keeps its bytes.
 */
export function expectedText(saves: Readonly<Record<string, G2Expected>>, changedBy: readonly ExpectedChange[] = []): string {
  const ordered: Record<string, G2Expected> = {};
  for (const f of G2_SAVE_FILES) {
    const e = saves[f];
    if (!e) throw new Error(`expected.json: no entry for ${f}`);
    ordered[f] = { hashAtLoad: e.hashAtLoad, hashPlus1000: e.hashPlus1000, digestPlus1000: e.digestPlus1000 };
  }
  const file: ExpectedFile = {
    about: EXPECTED_ABOUT,
    replayTicks: REPLAY_TICKS,
    saves: ordered,
    ...(changedBy.length > 0 ? { changedBy: changedBy.map((c) => ({ decision: c.decision, saves: [...c.saves] })) } : {}),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Load a save through the import path, hash it, run REPLAY_TICKS ticks, hash and digest it. */
export async function measureSave(text: string): Promise<{ expected: G2Expected; world: World }> {
  const { world } = await loadSaveFile(text);
  const hashAtLoad = stateHash(world);
  run(world, REPLAY_TICKS);
  return { expected: { hashAtLoad, hashPlus1000: stateHash(world), digestPlus1000: trajectoryDigest(world, 'g2') }, world };
}
