/**
 * The only writer of the Phase 3 trajectory fence (tests/fixtures/fence.json) and of the g2 saves'
 * expected.json (g3-plan lines 132–134; g3-plan-recheck P-23; D-0035, D-0036).
 *
 *   npx tsx tools/fence-update.ts --add <recipeId> [--ticks N]
 *       Adds a fence entry for a recipe created after g2 and records its currentDigest
 *       (trajectoryDigest 'full' under the shipped manifest; default tick 1200). Its g2Digest stays
 *       null. Refuses an existing entry or an unknown recipe. Builders may run it for recipes they create.
 *   npx tsx tools/fence-update.ts --recipe <entryId> --reason D-00xx
 *   npx tsx tools/fence-update.ts --all --reason D-00xx
 *       Re-records currentDigest (one entry, or every entry) under the shipped manifest. Never touches
 *       g2Digest. A changed digest appends {decision, field: 'currentDigest'} to the entry's changedBy.
 *   npx tsx tools/fence-update.ts --g2 --reason D-00xx
 *       The one path that re-records g2Digest (every entry that has one; registryWith(G2_LISTS), 'g2'
 *       mode) and tests/fixtures/saves/expected.json (each g2 save loaded through loadSaveFile).
 *       The decision must (1) state the rules or content version it bumps as "<field> N → M"
 *       (simulationVersion is pinned to 3), a bump that has landed: content/manifest.json holds M,
 *       above the g2 manifest's value; and (2) say that it re-records the g2 fence (name g2Digest or
 *       "fence-update --g2"). A changed value appends {decision, field: 'g2Digest'} to the entry's
 *       changedBy, and {decision, saves} to expected.json's changedBy.
 *
 * Every mode but --add refuses to run without --reason naming an entry that exists in
 * docs/DECISIONS.md ("## D-00xx · …"); a refusal writes nothing and exits 2.
 * Paths (for tests): --fence <file> --expected <file> --saves <dir> --decisions <file>.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ManifestSchema } from '../src/sim/content/schema';
import { CONTENT_DIR, loadRegistryFs, REPO_ROOT } from './lib/content-fs';
import { describeEntry, fenceDigest, FENCE_PATH, readFence, writeFence, type FenceEntry, type FenceFile } from '../tests/helpers/fence';
import { EXPECTED_PATH, expectedText, G2_MANIFEST_PATH, G2_SAVE_FILES, measureSave, readG2SaveText, SAVES_DIR, type ExpectedChange, type G2Expected } from '../tests/helpers/g2-saves';

export const DEFAULT_FENCE_TICKS = 1200;
/** The rules and content versions a decision may bump (simulationVersion is pinned to 3). */
export const VERSION_FIELDS = ['evolutionRulesVersion', 'moduleRegistryVersion', 'phenotypeMappingVersion', 'contentVersion'] as const;
export type VersionField = (typeof VERSION_FIELDS)[number];
export type VersionStamps = Readonly<Record<VersionField, number>>;

export class Refusal extends Error {}

export type Mode = { kind: 'add'; recipe: string; ticks: number } | { kind: 'recipe'; id: string; reason: string } | { kind: 'all'; reason: string } | { kind: 'g2'; reason: string };

export interface Paths {
  readonly fence: string;
  readonly expected: string;
  readonly saves: string;
  readonly decisions: string;
}

function value(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Refusal(`${name} needs a value`);
  return v;
}

const USAGE =
  'usage: npx tsx tools/fence-update.ts --add <recipeId> [--ticks N] | --recipe <entryId> --reason D-00xx | --all --reason D-00xx | --g2 --reason D-00xx';

/** Parse the command line; throws Refusal for anything malformed (never guesses). */
export function parseArgs(argv: readonly string[]): { mode: Mode; paths: Paths } {
  const modes = ['--add', '--recipe', '--all', '--g2'].filter((m) => argv.includes(m));
  if (modes.length !== 1) throw new Refusal(`${modes.length === 0 ? 'no mode given' : `one mode at a time (${modes.join(', ')})`}. ${USAGE}`);
  const reason = value(argv, '--reason');
  const paths: Paths = {
    fence: resolve(value(argv, '--fence') ?? FENCE_PATH),
    expected: resolve(value(argv, '--expected') ?? EXPECTED_PATH),
    saves: resolve(value(argv, '--saves') ?? SAVES_DIR),
    decisions: resolve(value(argv, '--decisions') ?? join(REPO_ROOT, 'docs', 'DECISIONS.md')),
  };
  const mode = modes[0]!;
  if (mode === '--add') {
    if (reason !== undefined) throw new Refusal('--add records a new recipe and takes no --reason');
    const recipe = value(argv, '--add')!;
    const t = value(argv, '--ticks');
    const ticks = t === undefined ? DEFAULT_FENCE_TICKS : Number(t);
    if (!Number.isInteger(ticks) || ticks < 1) throw new Refusal(`--ticks must be a positive integer, not "${t}"`);
    return { mode: { kind: 'add', recipe, ticks }, paths };
  }
  if (argv.includes('--ticks')) throw new Refusal('--ticks only goes with --add (an entry keeps its tick)');
  if (reason === undefined) throw new Refusal(`${mode} refuses to run without --reason D-00xx: a fence digest changes only under a recorded decision (docs/DECISIONS.md)`);
  if (!/^D-\d{4}$/.test(reason)) throw new Refusal(`--reason must be a decision id like D-0040, not "${reason}"`);
  if (mode === '--recipe') return { mode: { kind: 'recipe', id: value(argv, '--recipe')!, reason }, paths };
  if (mode === '--all') return { mode: { kind: 'all', reason }, paths };
  return { mode: { kind: 'g2', reason }, paths };
}

/** The decision's text (its "## D-00xx · …" heading up to the next decision), or a Refusal. */
export function decisionText(decisionsPath: string, id: string): string {
  const text = readFileSync(decisionsPath, 'utf8');
  const start = text.search(new RegExp(`^## ${id} ·`, 'm'));
  if (start < 0) throw new Refusal(`${id} is not in ${decisionsPath}: record the decision first, then update the fence under it`);
  const rest = text.slice(start + 3);
  const next = rest.search(/^## D-\d{4} ·/m);
  return next < 0 ? text.slice(start) : text.slice(start, start + 3 + next);
}

export interface StatedBump {
  readonly field: VersionField;
  readonly from: number;
  readonly to: number;
}

/** Every version bump a decision text states as "<field> N → M" (or "->"; the field may be in backticks or followed by a colon) with M above N. */
export function statedBumps(text: string): StatedBump[] {
  const re = new RegExp(`\\b(${VERSION_FIELDS.join('|')})\`?\\s*:?\\s*(\\d+)\\s*(?:→|->)\\s*(\\d+)`, 'g');
  const out: StatedBump[] = [];
  for (const m of text.matchAll(re)) {
    const bump = { field: m[1] as VersionField, from: Number(m[2]), to: Number(m[3]) };
    if (bump.to > bump.from) out.push(bump);
  }
  return out;
}

/** The version stamps of a manifest. */
export function versionStamps(m: VersionStamps): VersionStamps {
  return { evolutionRulesVersion: m.evolutionRulesVersion, moduleRegistryVersion: m.moduleRegistryVersion, phenotypeMappingVersion: m.phenotypeMappingVersion, contentVersion: m.contentVersion };
}

/**
 * Why decision `id` cannot carry a g2 re-record, or null. A g2 digest changes only under a decided
 * version bump, so the decision must (1) state a bump "<field> N → M" of a rules or content version
 * that has landed: the shipped manifest (`shipped`, content/manifest.json) holds M and M is above the
 * g2 manifest's value (`g2`); and (2) say that it re-records the g2 fence, by naming g2Digest or
 * "fence-update --g2". Mentioning a version field (a hypothetical bump, a later plan) is not enough.
 */
export function g2DecisionProblem(id: string, text: string, shipped: VersionStamps, g2: VersionStamps): string | null {
  const bumps = statedBumps(text);
  if (bumps.length === 0)
    return `${id} does not state which rules or content version it bumps (write "<field> N → M" for one of ${VERSION_FIELDS.join(', ')}); g2 digests change only with a version bump (simulationVersion is pinned to 3)`;
  if (!bumps.some((b) => shipped[b.field] === b.to && b.to > g2[b.field])) {
    const said = bumps.map((b) => `${b.field} ${b.from} → ${b.to}`).join(', ');
    const now = [...new Set(bumps.map((b) => b.field))].map((f) => `${f} ${shipped[f]} (g2: ${g2[f]})`).join(', ');
    return `${id} states ${said}, but no such bump has landed: content/manifest.json holds ${now}. Bump the manifest under ${id} first`;
  }
  if (!/\bg2Digest\b|fence-update(?:\.ts)?\s+--g2\b/.test(text))
    return `${id} does not say that it re-records the g2 fence: name g2Digest or "fence-update --g2" in the decision`;
  return null;
}

/**
 * expected.json's next text after a --g2 re-record: the new values, and the old file's changedBy plus
 * {decision, saves} when any save's values changed (the file is byte-identical when none did).
 */
export function recordG2Expected(oldText: string | null, saves: Readonly<Record<string, G2Expected>>, decision: string): string {
  const old = oldText === null ? null : (JSON.parse(oldText) as { saves?: Record<string, G2Expected>; changedBy?: ExpectedChange[] });
  const changedBy = [...(old?.changedBy ?? [])];
  const same = (a: G2Expected | undefined, b: G2Expected) => a !== undefined && a.hashAtLoad === b.hashAtLoad && a.hashPlus1000 === b.hashPlus1000 && a.digestPlus1000 === b.digestPlus1000;
  const changed = old === null ? [] : G2_SAVE_FILES.filter((f) => !same(old.saves?.[f], saves[f]!));
  if (changed.length > 0) changedBy.push({ decision, saves: changed });
  return expectedText(saves, changedBy);
}

function entryRow(e: FenceEntry): string {
  const same =
    e.g2Digest === null ? 'no g2 digest' : e.currentDigest === null ? 'no current digest' : e.currentDigest === e.g2Digest ? 'currentDigest = g2Digest' : 'currentDigest ≠ g2Digest';
  return `${e.id.padEnd(22)} ${String(e.ticks).padStart(5)}  g2 ${String(e.g2Digest).padEnd(16)}  current ${String(e.currentDigest).padEnd(16)}  ${same}`;
}

export async function main(argv: readonly string[]): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(argv);
  } catch (e) {
    if (e instanceof Refusal) {
      console.error(`fence-update refused: ${e.message}`);
      return 2;
    }
    throw e;
  }
  const { mode, paths } = parsed;
  try {
    if (mode.kind !== 'add') {
      const text = decisionText(paths.decisions, mode.reason);
      if (mode.kind === 'g2') {
        const manifestAt = (path: string) => versionStamps(ManifestSchema.parse(JSON.parse(readFileSync(path, 'utf8'))));
        if (!existsSync(G2_MANIFEST_PATH)) throw new Refusal(`the g2 manifest ${G2_MANIFEST_PATH} is missing`);
        const problem = g2DecisionProblem(mode.reason, text, manifestAt(join(CONTENT_DIR, 'manifest.json')), manifestAt(G2_MANIFEST_PATH));
        if (problem) throw new Refusal(problem);
      }
    }
    const fence: FenceFile = readFence(paths.fence);
    if (mode.kind === 'add') {
      const reg = loadRegistryFs();
      if (!reg.recipes[mode.recipe]) throw new Refusal(`unknown recipe "${mode.recipe}" (not in content/recipes)`);
      if (fence.entries.some((e) => e.id === mode.recipe)) throw new Refusal(`the fence already has an entry "${mode.recipe}"; re-record it with --recipe ${mode.recipe} --reason D-00xx`);
      const entry: FenceEntry = { id: mode.recipe, kind: 'recipe', recipe: mode.recipe, ticks: mode.ticks, g2Digest: null, currentDigest: null, changedBy: [] };
      entry.currentDigest = await fenceDigest(reg, entry, 'full');
      fence.entries.push(entry);
      writeFence(fence, paths.fence);
      console.log(`added ${describeEntry(entry)}: currentDigest ${entry.currentDigest}`);
      return 0;
    }
    if (mode.kind === 'recipe' || mode.kind === 'all') {
      const targets = mode.kind === 'all' ? fence.entries : fence.entries.filter((e) => e.id === mode.id);
      if (targets.length === 0) throw new Refusal(`no fence entry "${mode.kind === 'recipe' ? mode.id : ''}" (entries: ${fence.entries.map((e) => e.id).join(', ')})`);
      const reg = loadRegistryFs();
      for (const e of targets) {
        const digest = await fenceDigest(reg, e, 'full');
        const before = e.currentDigest;
        if (before !== null && before !== digest) e.changedBy.push({ decision: mode.reason, field: 'currentDigest' });
        e.currentDigest = digest;
        console.log(`${before === digest ? 'unchanged' : before === null ? 'recorded ' : 'CHANGED  '} ${entryRow(e)}`);
      }
      writeFence(fence, paths.fence);
      return 0;
    }
    // --g2: the Phase 2 content set, every entry recorded at g2, and the saves' expected values.
    const { G2_LISTS, registryWith } = await import('../tests/helpers/registry');
    const g2 = registryWith(G2_LISTS);
    const targets = fence.entries.filter((e) => e.g2Digest !== null || fence.entries.every((x) => x.g2Digest === null));
    for (const e of targets) {
      const digest = await fenceDigest(g2, e, 'g2');
      const before = e.g2Digest;
      if (before !== null && before !== digest) e.changedBy.push({ decision: mode.reason, field: 'g2Digest' });
      e.g2Digest = digest;
      console.log(`${before === digest ? 'unchanged' : before === null ? 'recorded ' : 'CHANGED  '} ${entryRow(e)}`);
    }
    const saves: Record<string, G2Expected> = {};
    for (const f of G2_SAVE_FILES) {
      if (!existsSync(join(paths.saves, f))) throw new Refusal(`g2 save ${f} is missing from ${paths.saves}`);
      saves[f] = (await measureSave(readG2SaveText(f, paths.saves))).expected;
    }
    const old = existsSync(paths.expected) ? readFileSync(paths.expected, 'utf8') : null;
    const next = recordG2Expected(old, saves, mode.reason); // throws on a malformed file before anything is written
    writeFence(fence, paths.fence);
    writeFileSync(paths.expected, next);
    console.log(`${old === next ? 'unchanged' : 'rewrote'} ${paths.expected}`);
    return 0;
  } catch (e) {
    if (e instanceof Refusal) {
      console.error(`fence-update refused: ${e.message}`);
      return 2;
    }
    throw e;
  }
}

const invoked = process.argv[1] ?? '';
const self = fileURLToPath(import.meta.url);
if (invoked === self || `${invoked}.ts` === self) process.exitCode = await main(process.argv.slice(2));
