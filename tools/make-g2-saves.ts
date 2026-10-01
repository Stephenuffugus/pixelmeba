/**
 * npx tsx tools/make-g2-saves.ts [--force]
 *
 * Writes the g2 saves of the Phase 3 determinism fence to tests/fixtures/saves/ (g3-plan-recheck P-20;
 * D-0035, D-0036): real .pixelmeba files built by this build's simulation through the real
 * buildSaveFile, gzipped, plus g2-manifest.json (the g2 manifest, every field) and expected.json
 * (per save: stateHash at load, stateHash and trajectoryDigest(world, 'g2') 1,000 ticks after loading
 * it through loadSaveFile; see tests/helpers/g2-saves.ts).
 *
 * Only the g2 build writes these files. The worlds are realized from the g2 manifest exactly: the one
 * in tests/fixtures/saves/g2-manifest.json when it exists, otherwise content/manifest.json, which must
 * then still be the g2 manifest (buildPhase 2, contentVersion 1). Every other content pack must hash
 * to that manifest's contentHash, or the tool refuses (content changed since g2).
 *
 * Fully deterministic, so a re-run on the same tree is byte-identical: fixed save names, order, world
 * ids and savedAt; JSON as buildSaveFile writes it; gzip level 9 with no file name and modification
 * time 0 in the header (checked).
 *
 * It writes only while content/manifest.json is still the g2 manifest (buildPhase 2, contentVersion
 * 1), i.e. on the g2 build. There it lists each file as written, unchanged (byte-identical) or
 * DIFFERS; with any DIFFERS it writes nothing and exits 1 unless --force is given. From the Phase 3
 * preflight's manifest bump on (D-0036) it only VERIFIES: it rebuilds every fixture from
 * tests/fixtures/saves/g2-manifest.json, prints unchanged / DIFFERS / MISSING, writes nothing (not
 * even a missing file), and exits 0 only when every file is byte-identical. --force is refused there
 * (exit 2): tools/fence-update.ts --g2 --reason D-00xx is the one path that re-records expected.json.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildSaveFile, loadSaveFile } from '../src/persistence/saveFile';
import { applyNow, introduceOrganism, type CommandPayload } from '../src/sim/commands';
import { computeContentHash, ContentError, validateContent, type ContentRegistry, type RawPacks } from '../src/sim/content/registry';
import { ManifestSchema, type Manifest, type RecipeDef } from '../src/sim/content/schema';
import { FLAG, LIFE_PREPARING, LIFE_RESTING, LIFE_WAKING } from '../src/sim/entities';
import { realizeExperimentArms } from '../src/sim/experiments';
import { cellIndex } from '../src/sim/grid';
import { realizeRecipe, type RecipeWorldProvenance } from '../src/sim/recipes';
import { stateHash } from '../src/sim/serialize';
import { rebuildIndex } from '../src/sim/spatial';
import { run, step } from '../src/sim/tick';
import { speciesIndex, type World } from '../src/sim/world';
import { CONTENT_DIR, loadRawPacksFs, REPO_ROOT } from './lib/content-fs';
import { FENCE_TRANSFORMS } from '../tests/helpers/fence';
import { EXPECTED_PATH, expectedText, G2_MANIFEST_PATH, G2_SAVE_FILES, measureSave, REPLAY_TICKS, SAVES_DIR, type G2Expected, type G2SaveFile } from '../tests/helpers/g2-saves';

/** Every save's meta.savedAt (fixed so the files are reproducible). */
export const SAVED_AT = '2026-10-01T00:00:00.000Z';
const GZIP_LEVEL = 9;

/** content/manifest.json's key order, used for g2-manifest.json. */
const MANIFEST_KEYS = [
  'simulationVersion',
  'evolutionRulesVersion',
  'moduleRegistryVersion',
  'phenotypeMappingVersion',
  'contentVersion',
  'contentHash',
  'buildPhase',
  'enabledSpecies',
  'enabledModules',
  'enabledSystems',
  'enabledMaterials',
  'enabledHabitats',
  'enabledStructures',
  'developmentalEnabled',
] as const;

interface SaveSpec {
  readonly file: G2SaveFile;
  readonly name: string;
  readonly recipeId: string | null;
  /** The dish tick at which the save is written. */
  readonly tick: number;
  readonly build: (reg: ContentRegistry) => World;
  /** Why this world is not what the save should exercise, or null. */
  readonly check: (w: World) => string | null;
}

/** Provenance the app records for a recipe dish (host recipeProvenance): `{}` = the recipe as authored. */
function recipeProvenance(reg: ContentRegistry, recipeId: string, overrides: RecipeWorldProvenance['overrides'] = {}): RecipeWorldProvenance {
  return { recipeId, recipeRevision: reg.recipes[recipeId]!.revision, createdFrom: 'recipe', ...(overrides ? { overrides } : {}) };
}

/** A recipe dish as the app makes it, run to `tick`. */
function recipeAt(reg: ContentRegistry, recipeId: string, worldId: string, tick: number, transform?: (r: RecipeDef) => RecipeDef, overrides: RecipeWorldProvenance['overrides'] = {}): World {
  const w = realizeRecipe(reg, recipeId, { worldId, provenance: recipeProvenance(reg, recipeId, overrides), ...(transform ? { transform } : {}) });
  run(w, tick - w.tick);
  return w;
}

function living(w: World, speciesId: string): number[] {
  const sp = speciesIndex(w, speciesId);
  const c = w.ents.cols;
  const out: number[] = [];
  for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && c.species[i] === sp) out.push(i);
  return out;
}

/** The Lab strokes applied at tick 300 (each must change something; the last erases part of a habitat stone). */
const LAB_EDITS: readonly CommandPayload[] = [
  { kind: 'paintSubstrate', substrate: 'gel', points: [[52.5, 30.5], [76.5, 30.5]], radius: 3 },
  { kind: 'paintShade', erase: false, points: [[44.5, 48.5], [52.5, 48.5]], radius: 6 },
  { kind: 'paintShade', erase: true, points: [[44.5, 48.5]], radius: 3 },
  { kind: 'placeStructure', structure: 'stone', points: [[100.5, 50.5]], radius: 1 },
  { kind: 'placeStructure', structure: 'wall', points: [[30.5, 90.5], [40.5, 90.5]], radius: 1 },
  { kind: 'placeStructure', structure: 'bead', points: [[90.5, 40.5]], radius: 1 },
  { kind: 'eraseStructure', points: [[35.5, 90.5]], radius: 1 },
  { kind: 'eraseStructure', points: [[42.5, 36.5]], radius: 1 },
];

/**
 * Hand-built: three Sprinters (B01) carrying the resting stage (E03) in food-free clear water, caught
 * mid-Resting (placed at 0 s), mid-Waking (placed at 0 s, rested, then fed by a sugar deposit at
 * 37.5 s) and mid-Preparing (placed at 27.5 s) at 50.0 s.
 */
function e03World(reg: ContentRegistry): World {
  const w = realizeRecipe(reg, 'FIRST_DISH_V1', {
    worldId: 'g2-e03-dormancy',
    transform: (r) => ({ ...r, id: 'E03_DORMANCY_G2', removeStones: true, fieldPatches: [], founders: [], scheduledCommands: [], backgroundOverrides: { sugar: 0 }, mutationPreset: 'fixed' }),
    provenance: { recipeId: null, recipeRevision: null, createdFrom: 'test' },
  });
  const carrier = (x: number, y: number) => {
    const slot = introduceOrganism(w, speciesIndex(w, 'B01'), cellIndex(Math.floor(x), Math.floor(y)), 'test:e03-carrier', { modules: ['E03'], exactCenter: true });
    if (slot < 0) throw new Error('no slot');
    rebuildIndex(w);
  };
  carrier(30.5, 64.5); // resting
  carrier(96.5, 64.5); // waking
  while (w.tick < 500) {
    if (w.tick === 275) carrier(64.5, 30.5); // preparing
    if (w.tick === 375) applyNow(w, 'test:feed-waking-carrier', { kind: 'deposit', materialId: 'SUGAR', points: [[96.5, 64.5]], radius: 3, dose: 0.5 });
    step(w);
  }
  return w;
}

const SPECS: readonly SaveSpec[] = [
  {
    file: 'first-dish-t3000.pixelmeba.gz',
    name: 'g2 Little Living Garden t3000',
    recipeId: 'FIRST_DISH_V1',
    tick: 3000,
    build: (reg) => recipeAt(reg, 'FIRST_DISH_V1', 'g2-first-dish', 3000),
    check: () => null,
  },
  {
    file: 'starch-unlock-t900.pixelmeba.gz',
    name: 'g2 What unlocks starch t900',
    recipeId: 'STARCH_UNLOCK_V1',
    tick: 900,
    build: (reg) => recipeAt(reg, 'STARCH_UNLOCK_V1', 'g2-starch-unlock', 900),
    check: (w) => (living(w, 'B06').length > 0 ? null : 'no Crumbsmith alive'),
  },
  {
    file: 'starch-unlock-e01-carriers-t900.pixelmeba.gz',
    name: 'g2 Starch release carriers t900',
    recipeId: null,
    tick: 900,
    build: (reg) => {
      const w = realizeRecipe(reg, 'STARCH_UNLOCK_V1', { worldId: 'g2-starch-unlock-e01', transform: FENCE_TRANSFORMS.e01Carriers, provenance: { recipeId: null, recipeRevision: null, createdFrom: 'test' } });
      run(w, 900);
      return w;
    },
    check: (w) => {
      const carriers = living(w, 'B01').filter((i) => w.genomes.get(w.ents.cols.genome[i]!).modules.includes('E01'));
      if (carriers.length === 0) return 'no E01 carrier alive';
      const enzyme = w.fields.eStarch!;
      let total = 0;
      for (let k = 0; k < enzyme.length; k++) total += enzyme[k]!;
      return total > 0 ? null : 'no starch enzyme in the dish (E01 never secreted)';
    },
  },
  {
    file: 'reserve-compare-t600.pixelmeba.gz',
    name: 'g2 Seeded traits demonstration t600',
    recipeId: 'RESERVE_COMPARE_V1',
    tick: 600,
    build: (reg) => recipeAt(reg, 'RESERVE_COMPARE_V1', 'g2-reserve-compare', 600),
    check: (w) => (w.commands.pending.length === 5 ? null : `${w.commands.pending.length} scheduled meals pending, expected 5`),
  },
  {
    file: 'first-dish-accelerated-varied-t6000.pixelmeba.gz',
    name: 'g2 Little Living Garden accelerated varied t6000',
    recipeId: 'FIRST_DISH_V1',
    tick: 6000,
    build: (reg) =>
      recipeAt(reg, 'FIRST_DISH_V1', 'g2-first-dish-accelerated-varied', 6000, (r) => ({ ...r, mutationPreset: 'accelerated', founderMode: 'varied' }), {
        mutationPreset: 'accelerated',
        founderMode: 'varied',
      }),
    check: (w) => (w.settings.mutationPreset === 'accelerated' && w.settings.founderMode === 'varied' ? null : 'settings not accelerated + varied'),
  },
  {
    file: 'exp106-arm-b-t300.pixelmeba.gz',
    name: 'g2 Predator balance copy B t300',
    recipeId: 'PREDATOR_BALANCE_V1',
    tick: 300,
    build: (reg) => {
      const w = realizeExperimentArms(reg, 'EXP_106', { worldIds: { B: 'g2-exp106-B' } }).B!;
      run(w, 300 - w.tick);
      return w;
    },
    check: (w) => {
      const c = w.ents.cols;
      const p01 = living(w, 'P01');
      const hunting = p01.filter((i) => (c.flags[i]! & FLAG.hunting) !== 0).length;
      const meals = p01.filter((i) => c.mealC[i]! > 0).length;
      return hunting > 0 && meals > 0 ? null : `P01 hunting ${hunting}, holding a meal ${meals}`;
    },
  },
  {
    file: 'first-dish-lab-edits-t1200.pixelmeba.gz',
    name: 'g2 Little Living Garden Lab edits t1200',
    recipeId: 'FIRST_DISH_V1',
    tick: 1200,
    build: (reg) => {
      const w = recipeAt(reg, 'FIRST_DISH_V1', 'g2-first-dish-lab', 300);
      LAB_EDITS.forEach((p, k) => {
        const cmd = applyNow(w, `lab:g2-${k + 1}`, p);
        if (!cmd.result || cmd.result.accepted === 0) throw new Error(`Lab edit ${k + 1} (${p.kind}) changed nothing: ${JSON.stringify(cmd.result)}`);
      });
      run(w, 1200 - w.tick);
      return w;
    },
    check: (w) => (w.commands.log.filter((c) => c.commandId.startsWith('lab:g2-')).length === LAB_EDITS.length ? null : 'Lab edits missing from the log'),
  },
  {
    file: 'e03-dormancy-t500.pixelmeba.gz',
    name: 'g2 Resting stage carriers t500',
    recipeId: null,
    tick: 500,
    build: e03World,
    check: (w) => {
      const states = living(w, 'B01').map((i) => w.ents.cols.lifeState[i]!);
      const want = [LIFE_RESTING, LIFE_WAKING, LIFE_PREPARING];
      return JSON.stringify(states) === JSON.stringify(want) ? null : `life states ${JSON.stringify(states)}, expected ${JSON.stringify(want)}`;
    },
  },
];

/**
 * Why this tree may not write the g2 fixtures (null: it is the g2 build and may). Only the g2 build
 * writes them: content/manifest.json must still be the g2 manifest, buildPhase 2 and contentVersion 1.
 */
export function writeRefusal(contentManifest: Pick<Manifest, 'buildPhase' | 'contentVersion'>): string | null {
  if (contentManifest.buildPhase === 2 && contentManifest.contentVersion === 1) return null;
  return `content/manifest.json is past g2 (buildPhase ${contentManifest.buildPhase}, contentVersion ${contentManifest.contentVersion}): only the g2 build writes the g2 saves, so this run only verifies them. A decided change re-records expected.json with tools/fence-update.ts --g2 --reason D-00xx.`;
}

/** content/manifest.json as it is on disk. */
function contentManifest(): Manifest {
  return ManifestSchema.parse(JSON.parse(readFileSync(join(CONTENT_DIR, 'manifest.json'), 'utf8')));
}

/** The g2 manifest: the committed g2-manifest.json, or content/manifest.json while it is still the g2 one. */
function g2ManifestSource(): { manifest: Manifest; raw: Record<string, unknown>; from: string } {
  const from = existsSync(G2_MANIFEST_PATH) ? G2_MANIFEST_PATH : join(CONTENT_DIR, 'manifest.json');
  const raw = JSON.parse(readFileSync(from, 'utf8')) as Record<string, unknown>;
  const manifest = ManifestSchema.parse(raw);
  if (from !== G2_MANIFEST_PATH && (manifest.buildPhase !== 2 || manifest.contentVersion !== 1)) {
    throw new Error(
      `content/manifest.json is not the g2 manifest (buildPhase ${manifest.buildPhase}, contentVersion ${manifest.contentVersion}) and ${relative(REPO_ROOT, G2_MANIFEST_PATH)} is missing: only the g2 build writes the g2 saves.`,
    );
  }
  return { manifest, raw, from };
}

/** g2-manifest.json's text: content/manifest.json's key order, two-space indent, trailing newline. */
function manifestText(raw: Record<string, unknown>): string {
  const out: Record<string, unknown> = {};
  for (const k of MANIFEST_KEYS) if (raw[k] !== undefined) out[k] = raw[k];
  for (const k of Object.keys(raw).sort()) if (!(k in out)) out[k] = raw[k];
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** The registry the g2 build shipped: today's packs with the g2 manifest, whose content hash they must still match. */
async function g2Registry(manifestRaw: Record<string, unknown>, manifest: Manifest): Promise<ContentRegistry> {
  const disk = loadRawPacksFs();
  const raw: RawPacks = { ...disk, manifest: { file: disk.manifest.file, data: JSON.parse(JSON.stringify(manifestRaw)) as unknown } };
  const hash = await computeContentHash(raw);
  if (hash !== manifest.contentHash) {
    throw new Error(`content/ no longer hashes to the g2 manifest's contentHash (${manifest.contentHash}; now ${hash}): the g2 saves can only be written by the g2 build.`);
  }
  const res = validateContent(raw);
  if (!res.registry) throw new ContentError(res.issues);
  return res.registry;
}

function gzip(text: string): Uint8Array {
  const bytes = gzipSync(Buffer.from(text, 'utf8'), { level: GZIP_LEVEL });
  // RFC 1952 header: ID1 ID2 CM FLG MTIME(4) XFL OS. No FNAME/FCOMMENT/FEXTRA (FLG 0), MTIME 0.
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 8 || bytes[3] !== 0 || bytes.readUInt32LE(4) !== 0) {
    throw new Error('gzip header carries a name or a timestamp');
  }
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const refusal = writeRefusal(contentManifest());
  if (force && refusal) {
    console.error(`make-g2-saves refused --force: ${refusal}`);
    process.exit(2);
  }
  const verifyOnly = refusal !== null;
  if (verifyOnly) console.log(`verify only: ${refusal}`);
  const { manifest, raw: manifestRaw, from } = g2ManifestSource();
  const reg = await g2Registry(manifestRaw, manifest);
  console.log(`g2 manifest from ${relative(REPO_ROOT, from)} · contentHash ${manifest.contentHash} · buildPhase ${manifest.buildPhase} · contentVersion ${manifest.contentVersion}`);

  const outputs: { path: string; bytes: Uint8Array }[] = [{ path: G2_MANIFEST_PATH, bytes: new TextEncoder().encode(manifestText(manifestRaw)) }];
  const expected: Record<string, G2Expected> = {};
  for (const spec of SPECS) {
    const t0 = process.hrtime.bigint();
    const world = spec.build(reg);
    const problem = world.tick === spec.tick ? spec.check(world) : `tick ${world.tick}, expected ${spec.tick}`;
    if (problem) throw new Error(`${spec.file}: ${problem}`);
    const hash = stateHash(world);
    const { text } = await buildSaveFile(world, { name: spec.name, savedAt: SAVED_AT, recipeId: spec.recipeId });
    const loaded = await loadSaveFile(text);
    if (stateHash(loaded.world) !== hash) throw new Error(`${spec.file}: the save does not load to the same state (${stateHash(loaded.world)} vs ${hash})`);
    const m = await measureSave(text);
    expected[spec.file] = m.expected;
    outputs.push({ path: join(SAVES_DIR, spec.file), bytes: gzip(text) });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`built ${spec.file}: tick ${world.tick}, ${world.ents.count} alive, stateHash ${hash}, +${REPLAY_TICKS} ticks ${m.expected.hashPlus1000} / digest ${m.expected.digestPlus1000} (${(ms / 1000).toFixed(1)} s)`);
  }
  if (SPECS.map((s) => s.file).join() !== G2_SAVE_FILES.join()) throw new Error('SPECS and G2_SAVE_FILES disagree');
  outputs.push({ path: EXPECTED_PATH, bytes: new TextEncoder().encode(expectedText(expected)) });

  const status = outputs.map((o) => {
    if (!existsSync(o.path)) return verifyOnly ? 'MISSING' : 'written';
    const old = new Uint8Array(readFileSync(o.path));
    return sha256(old) === sha256(o.bytes) ? 'unchanged' : 'DIFFERS';
  });
  if (verifyOnly) {
    outputs.forEach((o, k) => console.log(`${status[k]!.padEnd(11)} ${sha256(o.bytes)}  ${o.bytes.byteLength.toString().padStart(8)} B  ${relative(REPO_ROOT, o.path)}`));
    const bad = status.filter((s) => s !== 'unchanged').length;
    if (bad > 0) {
      console.error(`Verify failed: ${bad} g2 fixture(s) differ from what this build makes of the g2 saves, or are missing. Nothing was written.`);
      process.exit(1);
    }
    console.log(`verified: all ${outputs.length} g2 fixtures are byte-identical. Nothing was written.`);
    return;
  }
  const differs = status.some((s) => s === 'DIFFERS');
  if (differs && !force) {
    outputs.forEach((o, k) => console.log(`${status[k]!.padEnd(9)} ${relative(REPO_ROOT, o.path)}`));
    console.error('Refused: existing g2 fixtures differ from what this build writes. Nothing was written. (Only the g2 build writes them; --force overwrites.)');
    process.exit(1);
  }
  mkdirSync(SAVES_DIR, { recursive: true });
  outputs.forEach((o, k) => {
    if (status[k] !== 'unchanged') writeFileSync(o.path, o.bytes);
    console.log(`${(status[k] === 'DIFFERS' ? 'overwritten' : status[k]!).padEnd(11)} ${sha256(o.bytes)}  ${o.bytes.byteLength.toString().padStart(8)} B  ${relative(REPO_ROOT, o.path)}`);
  });
}

const invoked = process.argv[1] ?? '';
const self = fileURLToPath(import.meta.url);
if (invoked === self || `${invoked}.ts` === self) await main();
