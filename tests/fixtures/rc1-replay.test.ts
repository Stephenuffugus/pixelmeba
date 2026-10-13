/**
 * Phase 5 save fence (g5-plan lead call 1; mirrors g2-replay, D-0035, D-0042): saves written by the
 * v1.0.0-rc1 build (tests/fixtures/saves-rc1/, tools/make-rc1-saves.ts) load through the import path and
 * continue bit-identically. For each save: loadSaveFile → stateHash equals the rc1 build's hashAtLoad and
 * the notebook record comes back undropped, equal to the file's and with its recorded checksum; the
 * step the app requires before time runs (Cancel of a held Sample, RC1_RESUME) gives hashAfterResume;
 * 1,000 ticks later stateHash equals hashPlus1000 and trajectoryDigest(world, 'full') equals digestPlus1000.
 * Relational checks on top: a second, independent load hashes the same, the save still holds the Phase
 * 3–4 state it was made to exercise, and buildSaveFile → loadSaveFile round-trips the continued world
 * (hash and digest) with its notebook. Only tools/fence-update.ts --rc1 --reason D-00xx may re-record
 * expected.json.
 */
import { describe, expect, it } from 'vitest';
import { sealNotebook, type NotebookRecord } from '../../src/persistence/notebook';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { SCHEMA_VERSION, type World } from '../../src/sim/world';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { RC1_REPLAY_TICKS, RC1_RESUME, RC1_SAVE_FILES, RC1_STAMPS, rc1Manifest, readRc1Expected, readRc1SaveText, resumeRc1, type Rc1SaveFile } from '../helpers/rc1-saves';
import { trajectoryDigest } from '../helpers/trajectory';

const expected = readRc1Expected();
const meta = { name: 'rc1 replay round trip', savedAt: '2026-10-13T00:00:00.000Z', recipeId: null };

/** Living organisms of a species matching `f`. */
function living(w: World, speciesId: string, f: (i: number) => boolean = () => true): number {
  const sp = w.species.findIndex((s) => s.id === speciesId);
  let n = 0;
  for (let i = 0; i < w.ents.highWater; i++) if (w.ents.cols.alive[i] === 1 && w.ents.cols.species[i] === sp && f(i)) n++;
  return n;
}

/** The Phase 3–4 state each save was made to hold, as the loaded world and notebook show it. */
const HOLDS: Readonly<Record<Rc1SaveFile, (w: World, nb: NotebookRecord) => void>> = {
  'first-dish-diverse-notebook-t3000.pixelmeba.gz': (w, nb) => {
    expect(w.settings.mutationPreset).toBe('accelerated');
    expect(w.settings.founderMode).toBe('diverse');
    let phase3 = 0;
    for (let i = 0; i < w.ents.highWater; i++) if (w.ents.cols.alive[i] === 1 && w.genomes.get(w.ents.cols.genome[i]!).modules.some((m) => ['E06', 'E07', 'E10', 'E12'].includes(m))) phase3++;
    expect(phase3).toBeGreaterThan(0);
    expect(living(w, 'X01', (i) => w.ents.cols.hostSlot[i]! >= 0)).toBeGreaterThan(0);
    expect(nb.favorites.filter((f) => f.active && f.nickname !== null).length).toBeGreaterThan(0);
    expect(nb.stories?.some((s) => s.seen)).toBe(true);
    expect(nb.goals?.some((g) => g.state === 'running')).toBe(true);
    expect(nb.goals?.some((g) => g.state !== 'running')).toBe(true);
    expect(nb.bookmarks?.length).toBeGreaterThan(0);
    expect(nb.gallery?.length).toBeGreaterThan(0);
  },
  'first-dish-lab-food-sample-held-t1500.pixelmeba.gz': (w) => {
    expect(w.sample).not.toBeNull();
    expect(w.sample!.rows.length).toBeGreaterThan(0);
    expect(w.objects.map((o) => o.kind).sort()).toEqual(['pellet', 'wafer']);
    expect(w.commands.log.filter((c) => c.commandId.startsWith('rc1:lab-')).length).toBe(7);
  },
  'borrowed-shelter-velvet-t1500.pixelmeba.gz': (w) => {
    expect(living(w, 'B02')).toBeGreaterThan(0);
    expect(w.fields.film!.some((v) => v > 0)).toBe(true);
  },
  'fungal-supply-line-t900.pixelmeba.gz': (w) => {
    expect(living(w, 'F02', (i) => w.ents.cols.fLink0[i]! >= 0)).toBeGreaterThan(0);
  },
  'one-host-pinphage-t300.pixelmeba.gz': (w) => {
    expect(living(w, 'B01', (i) => w.ents.cols.infectedBy[i]! !== 0)).toBeGreaterThan(0);
  },
};

describe('rc1 saves continue bit-identically (Phase 5 save fence, g5-plan lead call 1)', () => {
  it('expected.json has exactly one entry per rc1 save, recorded over 1,000 ticks', () => {
    expect(Object.keys(expected.saves)).toEqual([...RC1_SAVE_FILES]);
    expect(expected.replayTicks).toBe(RC1_REPLAY_TICKS);
    expect(RC1_REPLAY_TICKS).toBe(1000);
    const m = rc1Manifest();
    expect({ buildPhase: m.buildPhase, contentVersion: m.contentVersion, contentHash: m.contentHash }).toEqual(RC1_STAMPS);
  });

  for (const file of RC1_SAVE_FILES) {
    it(`${file}: hash and notebook at load, then +1,000 ticks hash and full digest equal the rc1 build's`, { timeout: 600_000 }, async () => {
      const text = readRc1SaveText(file);
      const exp = expected.saves[file]!;
      // Written by the rc1 build: its manifest, at a world schema this build migrates by copy.
      const raw = JSON.parse(text) as { notebook?: unknown; state: { schemaVersion: number; content: { manifest: { contentHash: string; buildPhase: number } } } };
      expect(raw.state.content.manifest.contentHash).toBe(rc1Manifest().contentHash);
      expect(raw.state.content.manifest.buildPhase).toBe(RC1_STAMPS.buildPhase);
      expect(raw.state.schemaVersion).toBeLessThanOrEqual(SCHEMA_VERSION);

      const { world, notebook, notebookDropped } = await loadSaveFile(text);
      expect(stateHash(world)).toBe(exp.hashAtLoad);
      // The notebook beside the state survives the load unchanged (it is outside the world checksum).
      expect(notebookDropped).toBeNull();
      if (exp.notebookChecksum === null) expect(raw.notebook).toBeUndefined();
      else {
        expect(notebook.checksum).toBe(exp.notebookChecksum);
        expect(notebook).toEqual(raw.notebook);
        expect((await sealNotebook(notebook)).checksum).toBe(exp.notebookChecksum);
      }
      HOLDS[file](world, notebook);
      // A second, independent load of the same text agrees.
      const again = await loadSaveFile(text);
      expect(stateHash(again.world)).toBe(exp.hashAtLoad);
      expect(again.notebook).toEqual(notebook);

      expect(resumeRc1(file, world)).toBe(exp.hashAfterResume);
      if (RC1_RESUME[file] !== null) expect(world.sample).toBeNull();
      run(world, RC1_REPLAY_TICKS);
      expect(stateHash(world)).toBe(exp.hashPlus1000);
      expect(trajectoryDigest(world, 'full')).toBe(exp.digestPlus1000);

      // The continued world round-trips through a save, its notebook with it.
      const re = await loadSaveFile((await buildSaveFile(world, meta, { notebook, includeNicknames: true })).text);
      expect(stateHash(re.world)).toBe(exp.hashPlus1000);
      expect(trajectoryDigest(re.world, 'full')).toBe(exp.digestPlus1000);
      expect(re.notebookDropped).toBeNull();
      if (exp.notebookChecksum !== null) expect(re.notebook.checksum).toBe(exp.notebookChecksum);
    });
  }
});
