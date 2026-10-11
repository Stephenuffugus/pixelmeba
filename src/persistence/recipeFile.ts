/**
 * The Starting recipe file (P4.6; SPEC §14.4 "Starting recipe", §12.8 "recipe card export", §13.1; ARCH
 * §11.2 "Recipe export uses format pixelmeba-recipe"; D09 lines 140-160; D-0082 "the recipe card is the
 * Starting recipe file").
 *
 * A recipe file says how a dish STARTED: the recipe (or What if? variant) by id and exact revision, the
 * seed, the recorded New Dish choices, the resolved recipe and habitat as this build realized them, the
 * enabled modules, the exact rule and content versions, the expected observations text and the
 * stateHash of the start. It carries no later command, no descendant, no notebook and no player name.
 *
 * Export is built from the dish's recorded provenance only (recipeOverridesOf, variantRecordOf); a dish
 * whose start was not recorded (an experiment arm, an imported or old save without provenance) or was
 * made by other content or rules refuses with readable text.
 *
 * Import never executes or loads anything from the file: it validates the envelope, size, version,
 * checksum, finite values, ids, revision and seed, then realizes the start FROM THIS BUILD'S OWN CONTENT
 * (realizeRecipe / realizeVariant) and refuses unless the file's recipe, habitat, modules and versions
 * equal this build's and the realized stateHash equals the file's initialStateHash. The file's embedded
 * recipe is a description that must match, never an instruction.
 */
import type { ContentRegistry } from '@sim/content/registry';
import type { HabitatDef, RecipeDef } from '@sim/content/schema';
import { canonicalJson, sha256Hex } from '@sim/hash';
import { isMutationPreset } from '@sim/mutation';
import {
  realizeRecipe,
  recipeOverridesOf,
  RecipeError,
  withHabitatOverride,
  type RecipeOverridesRecord,
  type RecipeWorldProvenance,
} from '@sim/recipes';
import { stateHash } from '@sim/serialize';
import {
  realizeVariant,
  resolveVariant,
  variantChecksums,
  variantRecordOf,
  VariantError,
} from '@sim/variants';
import type { World } from '@sim/world';
import { APP_VERSION } from './appVersion';
import { formatRecipeId, RECIPE_SEED_MAX } from './recipeId';
import { MAX_IMPORT_BYTES } from './saveFile';

export const RECIPE_FORMAT = 'pixelmeba-recipe';
export const RECIPE_FILE_VERSION = 1;
/** The recipe file's MIME type (the same family as a save, SPEC §14.3). */
export const RECIPE_MIME = 'application/vnd.pixelmeba+json';

/** Refusal: the dish did not record how it started. */
export const NO_START_TEXT = 'This dish has no recorded starting recipe. Share it as a Living dish instead.';
/** Refusal: the dish started under other content or rules than this build, so its start cannot be written exactly. */
export const OTHER_BUILD_START_TEXT =
  'This dish was started by another version of Pixelmeba, so its starting recipe cannot be written exactly. Share it as a Living dish instead.';

/** The exact rule and content versions a recipe file needs. */
export interface RecipeVersions {
  readonly simulationVersion: number;
  readonly evolutionRulesVersion: number;
  readonly moduleRegistryVersion: number;
  readonly phenotypeMappingVersion: number;
  readonly contentVersion: number;
  readonly contentHash: string;
}

/** SPEC §14.4 / UX §5.11: "This recipe needs a compatible build ({versions})." */
export function compatibleBuildText(
  v: Pick<RecipeVersions, 'simulationVersion' | 'evolutionRulesVersion' | 'contentVersion'>,
): string {
  return `This recipe needs a compatible build (simulation ${v.simulationVersion}, rules ${v.evolutionRulesVersion}, content ${v.contentVersion}).`;
}

/** How the dish started: a recipe with its recorded New Dish choices, or a What if? variant. */
export type RecipeFileSource =
  | {
      readonly kind: 'recipe';
      readonly recipeId: string;
      readonly revision: number;
      readonly seed: number;
      /** The New Dish choices the world recorded (`{}` = the recipe as authored). */
      readonly overrides: RecipeOverridesRecord;
    }
  | {
      readonly kind: 'variant';
      readonly variantId: string;
      readonly variantRevision: number;
      readonly sourceId: string;
      readonly sourceRevision: number;
      readonly seed: number;
      readonly sourceChecksum: string;
      readonly variantChecksum: string;
    };

export interface RecipeFile {
  readonly format: typeof RECIPE_FORMAT;
  readonly recipeFileVersion: number;
  readonly appVersion: string;
  /** The recipe's own name (a variant's title): no player name ever goes in a recipe file (D09 line 150). */
  readonly name: string;
  /** The recipe's own question (a variant's), or null. */
  readonly question: string | null;
  readonly versions: RecipeVersions;
  readonly source: RecipeFileSource;
  /** The resolved recipe exactly as realized (choices and the variant's change applied). */
  readonly recipe: RecipeDef;
  /** Its habitat preset as realized. */
  readonly habitat: HabitatDef;
  readonly enabledModules: readonly string[];
  readonly expectedObservationsText: string;
  /** stateHash() of the realized start at tick 0. */
  readonly initialStateHash: string;
  /** "sha256:<hex of the canonical file without this field>". */
  readonly checksum: string;
}

const FILE_KEYS = [
  'appVersion',
  'checksum',
  'enabledModules',
  'expectedObservationsText',
  'format',
  'habitat',
  'initialStateHash',
  'name',
  'question',
  'recipe',
  'recipeFileVersion',
  'source',
  'versions',
] as const;

export class RecipeFileError extends Error {
  constructor(
    message: string,
    readonly kind: 'size' | 'json' | 'format' | 'version' | 'content' | 'integrity' | 'checksum' | 'no-start',
  ) {
    super(message);
    this.name = 'RecipeFileError';
  }
}

function fail(kind: RecipeFileError['kind'], message: string): never {
  throw new RecipeFileError(message, kind);
}

function versionsOf(registry: ContentRegistry): RecipeVersions {
  const m = registry.manifest;
  return {
    simulationVersion: m.simulationVersion,
    evolutionRulesVersion: m.evolutionRulesVersion,
    moduleRegistryVersion: m.moduleRegistryVersion,
    phenotypeMappingVersion: m.phenotypeMappingVersion,
    contentVersion: m.contentVersion,
    contentHash: m.contentHash,
  };
}

/** The recipe with recorded New Dish choices applied, exactly as the worker's build() applies them. */
export function recipeWithOverrides(r: RecipeDef, o: RecipeOverridesRecord): RecipeDef {
  return {
    ...withHabitatOverride(r, o.habitatId),
    ...(o.mutationPreset ? { mutationPreset: o.mutationPreset } : {}),
    ...(o.founderMode ? { founderMode: o.founderMode } : {}),
    ...(o.empty ? { founders: [], fieldPatches: [], scheduledCommands: [] } : {}),
  };
}

/** Whether recorded choices change nothing but (possibly) the seed: the start is a bundled recipe id. */
function onlySeed(r: RecipeDef, o: RecipeOverridesRecord): boolean {
  return (
    o.empty !== true &&
    (o.habitatId ?? r.habitatId) === r.habitatId &&
    (o.mutationPreset ?? r.mutationPreset) === r.mutationPreset &&
    (o.founderMode ?? r.founderMode) === r.founderMode
  );
}

/** What the share sheet and the file say about a dish's recorded start. */
export interface RecipeStart {
  readonly source: RecipeFileSource;
  readonly recipe: RecipeDef;
  readonly habitat: HabitatDef;
  readonly name: string;
  readonly question: string | null;
  /** The offline identifier ("R-G3 / revision 1 / seed 104729") when the start is a bundled one, else null. */
  readonly identity: string | null;
}

/**
 * The dish's recorded start as this build names it, or a RecipeFileError('no-start'). `legacyAuthored`:
 * the caller's judgement that a save made before New Dish choices were recorded IS the authored recipe
 * (the worker's isAuthoredRecipe); without it such a save has no recorded start.
 */
export async function recipeStartOf(
  registry: ContentRegistry,
  world: World,
  opts: { readonly legacyAuthored?: boolean } = {},
): Promise<RecipeStart> {
  const p = world.content.provenance;
  const record = variantRecordOf(world);
  if (p.createdFrom === 'variant') {
    if (record === null) fail('no-start', NO_START_TEXT);
    let resolved;
    try {
      resolved = resolveVariant(registry, record.variantId);
    } catch (e) {
      if (e instanceof VariantError) fail('no-start', OTHER_BUILD_START_TEXT);
      throw e;
    }
    const sums = await variantChecksums(registry, record.variantId);
    if (
      resolved.variant.revision !== record.variantRevision ||
      sums.sourceChecksum !== record.sourceChecksum ||
      sums.variantChecksum !== record.variantChecksum ||
      record.seed !== world.seed
    )
      fail('no-start', OTHER_BUILD_START_TEXT);
    return {
      source: {
        kind: 'variant',
        variantId: record.variantId,
        variantRevision: record.variantRevision,
        sourceId: record.sourceId,
        sourceRevision: record.sourceRevision,
        seed: record.seed,
        sourceChecksum: record.sourceChecksum,
        variantChecksum: record.variantChecksum,
      },
      recipe: resolved.recipe,
      habitat: resolved.habitat,
      name: resolved.variant.title,
      question: resolved.variant.question,
      identity: formatRecipeId(record.variantId, record.variantRevision, record.seed),
    };
  }
  if (p.createdFrom !== 'recipe' || p.recipeId === null) fail('no-start', NO_START_TEXT);
  const recorded = recipeOverridesOf(world);
  if (recorded === null) fail('no-start', NO_START_TEXT);
  if (recorded === undefined && opts.legacyAuthored !== true) fail('no-start', NO_START_TEXT);
  const overrides: RecipeOverridesRecord = recorded ?? {};
  const base = Object.prototype.hasOwnProperty.call(registry.recipes, p.recipeId)
    ? registry.recipes[p.recipeId]
    : undefined;
  if (base === undefined || p.recipeRevision !== base.revision || base.phase > registry.manifest.buildPhase)
    fail('no-start', OTHER_BUILD_START_TEXT);
  if ((overrides.seed ?? base.seed) !== world.seed) fail('no-start', NO_START_TEXT);
  const recipe = recipeWithOverrides(base, overrides);
  const habitat = registry.habitats[recipe.habitatId];
  if (habitat === undefined) fail('no-start', OTHER_BUILD_START_TEXT);
  return {
    source: {
      kind: 'recipe',
      recipeId: base.id,
      revision: base.revision,
      seed: world.seed,
      overrides: JSON.parse(JSON.stringify(overrides)) as RecipeOverridesRecord,
    },
    recipe,
    habitat,
    name: base.name,
    question: base.question ?? null,
    identity: onlySeed(base, overrides) ? formatRecipeId(base.id, base.revision, world.seed) : null,
  };
}

/** Realize a recorded start from this build's own content as a new world at tick 0 (paused by the caller). */
export async function realizeRecipeSource(
  registry: ContentRegistry,
  source: RecipeFileSource,
  worldId: string,
): Promise<World> {
  if (source.kind === 'variant') return realizeVariant(registry, source.variantId, { worldId });
  const o = source.overrides;
  const provenance: RecipeWorldProvenance = {
    recipeId: source.recipeId,
    recipeRevision: source.revision,
    createdFrom: 'recipe',
    overrides: JSON.parse(JSON.stringify(o)) as RecipeOverridesRecord,
  };
  return realizeRecipe(registry, source.recipeId, {
    worldId,
    ...(o.seed !== undefined ? { seed: o.seed } : {}),
    transform: (r) => recipeWithOverrides(r, o),
    provenance,
  });
}

/** Whether `world` was started under exactly this build's content and rules (its start can be written). */
function startedUnderThisBuild(world: World, registry: ContentRegistry): boolean {
  const w = world.content.manifest;
  const m = registry.manifest;
  return (
    w.contentHash === m.contentHash &&
    w.contentVersion === m.contentVersion &&
    w.simulationVersion === m.simulationVersion &&
    w.evolutionRulesVersion === m.evolutionRulesVersion &&
    w.moduleRegistryVersion === m.moduleRegistryVersion &&
    w.phenotypeMappingVersion === m.phenotypeMappingVersion
  );
}

async function checksumOf(payload: Omit<RecipeFile, 'checksum'>): Promise<string> {
  return `sha256:${await sha256Hex(canonicalJson(payload))}`;
}

/** A file name from the recipe's own name ("little-living-garden-recipe.pixelmeba"). */
export function recipeFileName(name: string): string {
  const base =
    name
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'dish';
  return `${base}-recipe.pixelmeba`;
}

/**
 * The Starting recipe file of `world` (any tick: only its recorded start is read). Throws
 * RecipeFileError('no-start') with readable text when the start was not recorded or was made by other
 * content or rules; nothing is changed either way (the world is only read).
 */
export async function buildRecipeFile(
  registry: ContentRegistry,
  world: World,
  opts: { readonly legacyAuthored?: boolean } = {},
): Promise<{
  readonly file: RecipeFile;
  readonly text: string;
  readonly filename: string;
  readonly start: RecipeStart;
}> {
  if (!startedUnderThisBuild(world, registry)) fail('no-start', OTHER_BUILD_START_TEXT);
  const start = await recipeStartOf(registry, world, opts);
  let fresh: World;
  try {
    fresh = await realizeRecipeSource(registry, start.source, `recipe-export:${world.worldId}`);
  } catch (e) {
    if (e instanceof RecipeError || e instanceof VariantError) fail('no-start', OTHER_BUILD_START_TEXT);
    throw e;
  }
  const initialStateHash = stateHash(fresh);
  // A variant dish recorded its own start hash: under the same content and rules it must be this one.
  const record = variantRecordOf(world);
  if (record !== null && record.initialStateHash !== initialStateHash)
    fail('no-start', OTHER_BUILD_START_TEXT);
  const payload: Omit<RecipeFile, 'checksum'> = {
    format: RECIPE_FORMAT,
    recipeFileVersion: RECIPE_FILE_VERSION,
    appVersion: APP_VERSION,
    name: start.name,
    question: start.question,
    versions: versionsOf(registry),
    source: start.source,
    recipe: start.recipe,
    habitat: start.habitat,
    enabledModules: [...registry.manifest.enabledModules],
    expectedObservationsText: start.recipe.expectedObservationsText,
    initialStateHash,
  };
  const file: RecipeFile = { ...payload, checksum: await checksumOf(payload) };
  return { file, text: JSON.stringify(file), filename: recipeFileName(start.name), start };
}

// ------------------------------------------------------------------------------------- import

/** The first non-finite number in `v` (a path), or null. JSON.parse turns 1e999 into Infinity. */
function nonFinitePath(v: unknown, path: string, depth = 0): string | null {
  if (depth > 64) return path;
  if (typeof v === 'number') return Number.isFinite(v) ? null : path;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const p = nonFinitePath(v[i], `${path}[${i}]`, depth + 1);
      if (p !== null) return p;
    }
    return null;
  }
  if (v !== null && typeof v === 'object') {
    for (const k of Object.keys(v).sort()) {
      const p = nonFinitePath((v as Record<string, unknown>)[k], `${path}.${k}`, depth + 1);
      if (p !== null) return p;
    }
  }
  return null;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isUint = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
const isStr = (v: unknown, max = 4000): v is string => typeof v === 'string' && v.length <= max;
const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** A problem found in a recipe file, worded for the player ("Import failed: exact reason; nothing changed"). */
export interface RecipeFileProblem {
  readonly kind: RecipeFileError['kind'];
  readonly message: string;
}

const damaged = (what: string): RecipeFileProblem => ({
  kind: 'integrity',
  message: `This recipe file is damaged or incomplete (${what}).`,
});

/**
 * Synchronous checks of a parsed recipe file against this build (everything but the checksum and the
 * realization): the envelope and its exact keys, the file version, finite values, the source's shape, a
 * seed 0…4294967295, recorded choices this build knows, and every id and revision. An id, revision or
 * version this build does not have is "needs a compatible build"; a malformed value is "damaged".
 */
export function recipeFileProblem(raw: unknown, registry: ContentRegistry): RecipeFileProblem | null {
  if (!isObj(raw) || raw.format !== RECIPE_FORMAT)
    return { kind: 'format', message: 'This is not a Pixelmeba recipe file.' };
  if (!isUint(raw.recipeFileVersion) || raw.recipeFileVersion < 1) return damaged('file version');
  const v = raw.versions;
  if (!isObj(v)) return damaged('versions');
  if (raw.recipeFileVersion > RECIPE_FILE_VERSION) {
    const known = isUint(v.simulationVersion) && isUint(v.evolutionRulesVersion) && isUint(v.contentVersion);
    return {
      kind: 'version',
      message: known
        ? compatibleBuildText(v as unknown as RecipeVersions)
        : 'This recipe file needs a newer version of Pixelmeba.',
    };
  }
  for (const k of Object.keys(raw))
    if (!(FILE_KEYS as readonly string[]).includes(k)) return damaged(`unknown field "${k.slice(0, 40)}"`);
  for (const k of FILE_KEYS) if (!own(raw, k)) return damaged(`missing "${k}"`);
  const bad = nonFinitePath(raw, 'file');
  if (bad !== null) return damaged(`a number that is not finite at ${bad.slice(0, 80)}`);
  if (
    !isStr(raw.appVersion, 40) ||
    !isStr(raw.name, 200) ||
    !(raw.question === null || isStr(raw.question, 400))
  )
    return damaged('names');
  if (!isStr(raw.expectedObservationsText) || !isStr(raw.initialStateHash, 200) || !isStr(raw.checksum, 200))
    return damaged('texts');
  const ints = [
    'simulationVersion',
    'evolutionRulesVersion',
    'moduleRegistryVersion',
    'phenotypeMappingVersion',
    'contentVersion',
  ] as const;
  for (const k of ints) if (!isUint(v[k])) return damaged(`versions.${k}`);
  if (!isStr(v.contentHash, 200)) return damaged('versions.contentHash');
  if (
    !Array.isArray(raw.enabledModules) ||
    raw.enabledModules.length > 64 ||
    !raw.enabledModules.every((m) => isStr(m, 16))
  )
    return damaged('enabledModules');
  if (!isObj(raw.recipe) || !isObj(raw.habitat)) return damaged('recipe');
  const versions = v as unknown as RecipeVersions;
  const compatible = { kind: 'version' as const, message: compatibleBuildText(versions) };
  const m = registry.manifest;
  if (
    versions.simulationVersion !== m.simulationVersion ||
    versions.evolutionRulesVersion !== m.evolutionRulesVersion ||
    versions.moduleRegistryVersion !== m.moduleRegistryVersion ||
    versions.phenotypeMappingVersion !== m.phenotypeMappingVersion ||
    versions.contentVersion !== m.contentVersion
  )
    return compatible;
  const s = raw.source;
  if (!isObj(s)) return damaged('source');
  if (s.kind === 'variant') {
    const keys = [
      'kind',
      'seed',
      'sourceChecksum',
      'sourceId',
      'sourceRevision',
      'variantChecksum',
      'variantId',
      'variantRevision',
    ];
    if (Object.keys(s).some((k) => !keys.includes(k)) || keys.some((k) => !own(s, k)))
      return damaged('source');
    if (
      !isStr(s.variantId, 64) ||
      !isStr(s.sourceId, 64) ||
      !isStr(s.sourceChecksum, 200) ||
      !isStr(s.variantChecksum, 200)
    )
      return damaged('source');
    if (!isUint(s.variantRevision) || !isUint(s.sourceRevision)) return damaged('source revision');
    if (!isUint(s.seed, RECIPE_SEED_MAX)) return damaged('seed');
    const variant = own(registry.variants, s.variantId) ? registry.variants[s.variantId] : undefined;
    if (
      variant === undefined ||
      variant.revision !== s.variantRevision ||
      variant.sourceId !== s.sourceId ||
      variant.sourceRevision !== s.sourceRevision
    )
      return compatible;
    return null;
  }
  if (s.kind === 'recipe') {
    const keys = ['kind', 'overrides', 'recipeId', 'revision', 'seed'];
    if (Object.keys(s).some((k) => !keys.includes(k)) || keys.some((k) => !own(s, k)))
      return damaged('source');
    if (!isStr(s.recipeId, 64) || !isUint(s.revision)) return damaged('source');
    if (!isUint(s.seed, RECIPE_SEED_MAX)) return damaged('seed');
    const o = s.overrides;
    if (!isObj(o)) return damaged('overrides');
    const okeys = ['empty', 'founderMode', 'habitatId', 'mutationPreset', 'seed'];
    if (Object.keys(o).some((k) => !okeys.includes(k))) return damaged('overrides');
    if (o.seed !== undefined && (!isUint(o.seed, RECIPE_SEED_MAX) || o.seed !== s.seed))
      return damaged('seed');
    if (o.empty !== undefined && typeof o.empty !== 'boolean') return damaged('overrides.empty');
    if (o.mutationPreset !== undefined && !isMutationPreset(o.mutationPreset))
      return damaged('overrides.mutationPreset');
    if (o.founderMode !== undefined && !['identical', 'varied', 'diverse'].includes(o.founderMode as string))
      return damaged('overrides.founderMode');
    if (
      o.habitatId !== undefined &&
      (!isStr(o.habitatId, 64) ||
        !m.enabledHabitats.includes(o.habitatId) ||
        !own(registry.habitats, o.habitatId))
    )
      return compatible;
    const recipe = own(registry.recipes, s.recipeId) ? registry.recipes[s.recipeId] : undefined;
    if (recipe === undefined || recipe.phase > m.buildPhase || recipe.revision !== s.revision)
      return compatible;
    if (o.seed === undefined && s.seed !== recipe.seed) return damaged('seed');
    return null;
  }
  return damaged('source');
}

/** Parse and check a recipe file's text (everything but the realization). Throws RecipeFileError. */
export async function parseRecipeFile(text: string, registry: ContentRegistry): Promise<RecipeFile> {
  if (typeof text !== 'string') fail('format', 'This is not a Pixelmeba recipe file.');
  if (text.length > MAX_IMPORT_BYTES)
    fail('size', `The file is larger than ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    fail('json', 'This is not a Pixelmeba file (it is not valid JSON).');
  }
  const problem = recipeFileProblem(raw, registry);
  if (problem !== null) fail(problem.kind, problem.message);
  const { checksum, ...payload } = raw as RecipeFile;
  if (checksum !== (await checksumOf(payload)))
    fail('checksum', 'This recipe file does not match its checksum, so it may be damaged.');
  return raw as RecipeFile;
}

/**
 * Import: check the file, realize its start from this build's own content as a new world with id
 * `worldId` at tick 0, and refuse unless this build starts it exactly as the file records (resolved
 * recipe, habitat, modules, variant checksums and the start's stateHash). Nothing outside the returned
 * world is created or changed; a refusal throws RecipeFileError with readable text.
 */
export async function loadRecipeFile(
  text: string,
  registry: ContentRegistry,
  worldId: string,
): Promise<{ readonly file: RecipeFile; readonly world: World; readonly name: string }> {
  const file = await parseRecipeFile(text, registry);
  const compatible = (): never => fail('version', compatibleBuildText(file.versions));
  if (canonicalJson(file.enabledModules) !== canonicalJson(registry.manifest.enabledModules)) compatible();
  let world: World;
  try {
    world = await realizeRecipeSource(registry, file.source, worldId);
  } catch (e) {
    if (e instanceof RecipeError || e instanceof VariantError) compatible();
    throw e;
  }
  // What this build realized must be what the file describes.
  let start: RecipeStart;
  try {
    start = await recipeStartOf(registry, world);
  } catch (e) {
    if (e instanceof RecipeFileError) compatible();
    throw e;
  }
  if (canonicalJson(start.source) !== canonicalJson(file.source)) compatible();
  if (
    canonicalJson(start.recipe) !== canonicalJson(file.recipe) ||
    canonicalJson(start.habitat) !== canonicalJson(file.habitat)
  )
    compatible();
  if (stateHash(world) !== file.initialStateHash) compatible();
  return { file, world, name: start.name };
}

/** Whether a file's text is a recipe file (format sniff before choosing the import path; never throws). */
export function isRecipeFileText(text: string): boolean {
  if (typeof text !== 'string' || text.length > MAX_IMPORT_BYTES) return false;
  // A recipe file is small; a save is parsed by its own path.
  if (!/"format"\s*:\s*"pixelmeba-recipe"/.test(text.slice(0, 4096)) && text.length > 1024 * 1024)
    return false;
  try {
    const raw = JSON.parse(text) as unknown;
    return isObj(raw) && raw.format === RECIPE_FORMAT;
  } catch {
    return false;
  }
}
