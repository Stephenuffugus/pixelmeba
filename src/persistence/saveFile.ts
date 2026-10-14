/**
 * The .pixelmeba file (SPEC §14.3, ARCH §11.2): UTF-8 JSON with schema and version stamps, metadata,
 * the full world state and a SHA-256 checksum of the canonical state payload.
 *
 * parseSaveFile() validates everything before a world is built: size, format, versions, embedded
 * content (the same Zod schemas as the packs), array dimensions and dtypes, finite and nonnegative
 * pools (a field cell may sit within float roundoff below zero, src/sim/fieldValue.ts), entity limits
 * and reference integrity, then the checksum. A failure never produces a world.
 */
import { AGENT_CAP, CELL_COUNT, DT } from '@sim/constants';
import { HabitatSchema, ManifestSchema, MaterialSchema, ModuleSchema, SpeciesSchema } from '@sim/content/schema';
import { ENTITY_COLUMNS } from '@sim/entities';
import { STRUCTURE_RECORD_IDS } from '@sim/grid';
import { FIELD_DEFS, isFieldId } from '@sim/fields';
import { isStorableFieldValue } from '@sim/fieldValue';
import { canonicalJson, sha256Hex, base64ToBytes } from '@sim/hash';
import { missingModuleParams, moduleSetProblem } from '@sim/content/moduleRules';
import { deserializeWorld, migrateWorldState, serializeWorld, type EncodedArray, type WorldState } from '@sim/serialize';
import { SCHEMA_VERSION, type World } from '@sim/world';
import { variantRecordOf } from '@sim/variants';
import { IMPLEMENTED_MODULES, IMPLEMENTED_NATIVE_ABILITIES, IMPLEMENTED_RULES, IMPLEMENTED_STRUCTURES, IMPLEMENTED_SYSTEMS, RULES_VERSIONS } from '@sim/content/implemented';
import { MODULE_SYSTEM_NEEDS, nativeAbilityPairingProblem, speciesSystemNeeds } from '@sim/content/registry';
import { isMutationPreset } from '@sim/mutation';
import { historyProblem, journalProblem } from '@sim/history';
import { generatedBranchName } from '@sim/branches';
import type { Command } from '@sim/commands';
import { ADHESION_LINK_MAX, ADHESION_SLOT_COLUMNS, FUNGAL_LINK_MAX, FUNGAL_SLOT_COLUMNS, linkProblem } from '@sim/links';
import { foodObjectsProblem } from '@sim/objects';
import { savedSampleProblem } from '@sim/sampleSlot';
import { virusIdOfCode } from '@sim/viruses';
import { notebookIsEmpty, notebookWithoutNicknames, readNotebook, sealNotebook, type NotebookRecord } from './notebook';
import { goalWorldRefsOf } from './notebookGoals';
import { phase5StateProblem } from './phase5State';

export const SAVE_FORMAT = 'pixelmeba-save';
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
import { APP_VERSION } from './appVersion';
export { APP_VERSION };

/**
 * A What if? dish's identity (D09 §4), copied from the world's variant record into the file's meta so
 * a list or export summary can name it without building the world. Additive: files without it load
 * as before. The world's provenance stays authoritative (meta is outside the checksum).
 */
export interface SaveMetaVariant {
  readonly variantId: string;
  readonly variantRevision: number;
  readonly title: string;
  readonly sourceId: string;
  readonly sourceRevision: number;
  readonly seed: number;
}

export interface SaveMeta {
  readonly name: string;
  readonly savedAt: string;
  readonly recipeId: string | null;
  readonly note?: string;
  /** Written by buildSaveFile for a What if? dish (from its variant record); absent otherwise. */
  readonly variant?: SaveMetaVariant;
  /** P2.2: the module registry the world recorded (always from the world; absent in older files). */
  readonly registry?: SaveMetaRegistry;
  /** P2.2: the world's evolution setting and founder mode when it was written (always from the world). */
  readonly evolution?: SaveMetaEvolution;
}

/**
 * The enabled module registry a dish recorded (P2.2 "export metadata shows the enabled registry"),
 * copied from the world's own manifest into the file's meta. A display copy: the embedded content in
 * the checksummed state stays authoritative, and a newer build never rewrites it.
 */
export interface SaveMetaRegistry {
  readonly moduleRegistryVersion: number;
  readonly evolutionRulesVersion: number;
  readonly enabledModules: readonly string[];
}

export interface SaveMetaEvolution {
  readonly mutationPreset: string;
  readonly founderMode: string;
}

function metaRegistryOf(world: World): SaveMetaRegistry {
  const m = world.content.manifest;
  return { moduleRegistryVersion: m.moduleRegistryVersion, evolutionRulesVersion: m.evolutionRulesVersion, enabledModules: [...m.enabledModules] };
}

/** The registry in a file's meta, or null when absent or malformed (meta is untrusted text). */
export function saveMetaRegistry(meta: unknown): SaveMetaRegistry | null {
  const r = (meta as { registry?: unknown } | null)?.registry;
  if (typeof r !== 'object' || r === null) return null;
  const o = r as Record<string, unknown>;
  const ints = Number.isInteger(o.moduleRegistryVersion) && Number.isInteger(o.evolutionRulesVersion);
  const mods = Array.isArray(o.enabledModules) && o.enabledModules.length <= 64 && o.enabledModules.every((x) => typeof x === 'string' && /^E[0-9]{2}$/.test(x));
  if (!ints || !mods) return null;
  return { moduleRegistryVersion: o.moduleRegistryVersion as number, evolutionRulesVersion: o.evolutionRulesVersion as number, enabledModules: [...(o.enabledModules as string[])] };
}

const FOUNDER_MODES: readonly string[] = ['identical', 'varied', 'diverse'];

/**
 * The evolution setting and founder mode in a file's meta (or a slot index's copy of it), or null when
 * absent or malformed (meta is untrusted text; P2.2 mode labels on Saved dishes and Continue).
 */
export function saveMetaEvolution(meta: unknown): SaveMetaEvolution | null {
  const e = (meta as { evolution?: unknown } | null)?.evolution;
  if (typeof e !== 'object' || e === null) return null;
  const o = e as Record<string, unknown>;
  if (!isMutationPreset(o.mutationPreset)) return null;
  if (typeof o.founderMode !== 'string' || !FOUNDER_MODES.includes(o.founderMode)) return null;
  return { mutationPreset: o.mutationPreset, founderMode: o.founderMode };
}

/** The variant identity in a file's meta, or null when absent or malformed (meta is untrusted text). */
export function saveMetaVariant(meta: unknown): SaveMetaVariant | null {
  const v = (meta as { variant?: unknown } | null)?.variant;
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  const str = (k: string) => {
    const x = r[k];
    return typeof x === 'string' && x.length > 0 && x.length <= 200;
  };
  const int = (k: string) => Number.isInteger(r[k]) && (r[k] as number) >= 0;
  if (!(str('variantId') && str('title') && str('sourceId') && int('variantRevision') && int('sourceRevision') && int('seed'))) return null;
  return {
    variantId: r.variantId as string,
    variantRevision: r.variantRevision as number,
    title: r.title as string,
    sourceId: r.sourceId as string,
    sourceRevision: r.sourceRevision as number,
    seed: r.seed as number,
  };
}

function metaVariantOf(world: World): SaveMetaVariant | null {
  const r = variantRecordOf(world);
  return r ? { variantId: r.variantId, variantRevision: r.variantRevision, title: r.title, sourceId: r.sourceId, sourceRevision: r.sourceRevision, seed: r.seed } : null;
}

export interface SaveFile {
  readonly format: typeof SAVE_FORMAT;
  readonly schemaVersion: number;
  readonly appVersion: string;
  readonly simulationVersion: number;
  readonly contentVersion: number;
  readonly contentHash: string;
  readonly tick: number;
  readonly meta: SaveMeta;
  readonly state: WorldState;
  readonly checksum: string;
  /**
   * P4.1 (D-0070; ARCH §11.2 "presentation"): the dish's notebook record (favorites; story cards and goals
   * from stage 2), beside the state and outside its checksum, so neither the world checksum nor the
   * stateHash ever changes with it. Absent when the notebook is empty and in every file written before.
   */
  readonly notebook?: NotebookRecord;
}

export class SaveFileError extends Error {
  constructor(
    message: string,
    readonly kind: 'size' | 'json' | 'format' | 'version' | 'content' | 'integrity' | 'checksum',
  ) {
    super(message);
  }
}

/** Escape-safe display name: plain text, at most 60 characters (SPEC §14.3). */
export function cleanName(name: string): string {
  const s = Array.from(name)
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
    .join('')
    .trim();
  const clipped = Array.from(s).slice(0, 60).join('');
  return clipped.length > 0 ? clipped : 'Untitled dish';
}

/**
 * "Export without names or notes" (D-0029): the player's branch names leave the file too. Branch records
 * carry no player name, a specimen's label is its branch's generated name, and the command log keeps
 * each rename without its text. Names are notebook labels that nothing in the simulation reads, so the
 * dish runs on exactly as before; branch records are hashed, so the stripped dish has its own state
 * hash, and the checksum is computed over what is written (SPEC §14.4).
 */
function withoutPlayerNames(world: World, state: WorldState): WorldState {
  const unname = (c: Command): Command =>
    c.payload.kind === 'lineage' && c.payload.op === 'rename' && c.payload.name !== null ? { ...c, payload: { ...c.payload, name: null } } : c;
  const commands = { ...state.commands, pending: state.commands.pending.map(unname), log: state.commands.log.map(unname) };
  const book = state.branches;
  if (!book) return { ...state, commands };
  const label = (branch: number, shown: string): string => {
    const br = branch >= 0 ? world.branches.branches[branch] : undefined;
    return br ? generatedBranchName(world, br) : shown; // -1: the species' founders, never a player name
  };
  const branches = {
    ...book,
    branches: book.branches.map((b) => (b.name === null ? b : { ...b, name: null })),
    ...(book.specimens ? { specimens: book.specimens.map((s) => ({ ...s, branchLabel: label(s.branch, s.branchLabel) })) } : {}),
  };
  return { ...state, commands, branches };
}

/**
 * Options of buildSaveFile. `notebook` (P4.1): the dish's notebook record, written beside the state when
 * not empty (sealed here). `includeNicknames` (default false): keep the favorites' nicknames; the host
 * passes true for the device's own saves (named slots, the autosave, keep writes, automatic checkpoints)
 * and the player's choice for an export. `stripNames` always drops them.
 */
export interface BuildSaveOptions {
  readonly stripNames?: boolean;
  readonly notebook?: NotebookRecord | null;
  readonly includeNicknames?: boolean;
}

export async function buildSaveFile(world: World, meta: SaveMeta, options: BuildSaveOptions = {}): Promise<{ text: string; checksum: string; file: SaveFile }> {
  const serialized = serializeWorld(world);
  // P4.1: the notebook as it stands now, taken with the state (before the first await).
  const nb0 = options.notebook && !notebookIsEmpty(options.notebook) ? options.notebook : null;
  const nbShown = nb0 && (options.stripNames || options.includeNicknames !== true) ? notebookWithoutNicknames(nb0) : nb0;
  // P2.8: "Export without names or notes" carries none of the player's journal entries (their notes,
  // dish names and times; D-0027 put them in the save). The checksum is computed over what is written
  // (SPEC §14.4 "Metadata-stripped export recomputes the hash"); the state hash never reads history.
  const state = options.stripNames ? withoutPlayerNames(world, { ...serialized, history: { ...serialized.history, journal: [] } }) : serialized;
  // The variant identity and the mode labels always come from the world itself (never from the caller's
  // meta), read with the state, before the await: a running dish can change its setting meanwhile.
  const { variant: _callerVariant, ...given } = meta;
  const variant = metaVariantOf(world);
  const registry = metaRegistryOf(world);
  const evolution = { mutationPreset: world.settings.mutationPreset, founderMode: world.settings.founderMode };
  const checksum = `sha256:${await sha256Hex(canonicalJson(state))}`;
  const notebook = nbShown ? await sealNotebook(nbShown) : null;
  const file: SaveFile = {
    format: SAVE_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    simulationVersion: world.content.manifest.simulationVersion,
    contentVersion: world.content.manifest.contentVersion,
    contentHash: world.content.manifest.contentHash,
    // The serialized tick: a running dish (an automatic checkpoint, an autosave) keeps stepping during the await above.
    tick: state.tick,
    meta: { ...given, name: options.stripNames ? 'Shared dish' : cleanName(meta.name), ...(options.stripNames ? { note: '' } : {}), ...(variant ? { variant } : {}), registry, evolution },
    state,
    checksum,
    ...(notebook ? { notebook } : {}),
  };
  return { text: JSON.stringify(file), checksum, file };
}

function fail(kind: SaveFileError['kind'], message: string): never {
  throw new SaveFileError(message, kind);
}

const DTYPE_BYTES: Record<string, number> = { f64: 8, f32: 4, i32: 4, u32: 4, u16: 2, u8: 1 };

function checkArray(name: string, enc: unknown, dtype: string, length: number | null, maxLength?: number): EncodedArray {
  if (!enc || typeof enc !== 'object') fail('integrity', `${name} is missing`);
  const e = enc as EncodedArray;
  if (e.dtype !== dtype) fail('integrity', `${name} has dtype ${String(e.dtype)}, expected ${dtype}`);
  if (!Number.isInteger(e.length) || e.length < 0) fail('integrity', `${name} has an invalid length`);
  if (length !== null && e.length !== length) fail('integrity', `${name} has length ${e.length}, expected ${length}`);
  if (maxLength !== undefined && e.length > maxLength) fail('integrity', `${name} is longer than ${maxLength}`);
  if (typeof e.b64 !== 'string' || e.b64.length !== Math.ceil((e.length * DTYPE_BYTES[dtype]!) / 3) * 4) fail('integrity', `${name} has a malformed payload`);
  return e;
}

function decodeF64(e: EncodedArray): Float64Array {
  const bytes = base64ToBytes(e.b64);
  return new Float64Array(bytes.buffer, bytes.byteOffset, e.length);
}

const CELL_STRUCTURE_IDS: readonly string[] = Object.values(STRUCTURE_RECORD_IDS);

/** Raw id of a recorded list entry, for naming it in a refusal ('?' when it is not a string). */
function rawId(v: unknown): string {
  return typeof v === 'string' ? cleanName(v) : '?';
}

/**
 * D-0121: refuses (kind 'content') a dish whose recorded manifest names a system or structure, or whose
 * recorded species names a native ability, that this build does not implement (IMPLEMENTED_SYSTEMS,
 * IMPLEMENTED_STRUCTURES with the cell structures, IMPLEMENTED_NATIVE_ABILITIES). Reads the raw records:
 * the schemas run afterwards.
 */
function unimplementedRulesProblem(manifest: unknown, species: unknown): void {
  const m = (manifest !== null && typeof manifest === 'object' ? manifest : {}) as { enabledSystems?: unknown; enabledStructures?: unknown };
  if (Array.isArray(m.enabledSystems)) {
    for (const id of m.enabledSystems as unknown[]) {
      if (typeof id === 'string' && (IMPLEMENTED_SYSTEMS as readonly string[]).includes(id)) continue;
      fail('content', `This dish uses the "${rawId(id)}" system, which this version of Pixelmeba cannot simulate. Nothing was loaded.`);
    }
  }
  if (Array.isArray(m.enabledStructures)) {
    for (const id of m.enabledStructures as unknown[]) {
      if (typeof id === 'string' && (CELL_STRUCTURE_IDS.includes(id) || IMPLEMENTED_STRUCTURES.includes(id))) continue;
      fail('content', `This dish uses the structure "${rawId(id)}", which this version of Pixelmeba cannot simulate. Nothing was loaded.`);
    }
  }
  if (Array.isArray(species)) {
    for (const sp of species as unknown[]) {
      const abilities = (sp as { nativeAbilities?: unknown } | null)?.nativeAbilities;
      if (!Array.isArray(abilities)) continue;
      for (const a of abilities as unknown[]) {
        if (typeof a === 'string' && (IMPLEMENTED_NATIVE_ABILITIES as readonly string[]).includes(a)) continue;
        const spId = (sp as { id?: unknown }).id;
        fail('content', `This dish's ${rawId(spId)} uses the native ability "${rawId(a)}", which this version of Pixelmeba cannot simulate. Nothing was loaded.`);
      }
    }
  }
}

/**
 * D-0121 (the lead's ceilings): refuses (kind 'version') a dish whose recorded manifest names a newer rules
 * version than this build implements (IMPLEMENTED_RULES: simulation rules, evolution rules, ability registry,
 * trait mapping) or records developmental changes, which no build before Phase 7 simulates. Without it a
 * dish recorded under newer rules would load and run under this build's older ones. Reads the raw record
 * before the manifest schema, so the version is named; a dish at or below every version keeps its rules.
 */
function newerRulesProblem(manifest: unknown): void {
  const m = (manifest !== null && typeof manifest === 'object' ? manifest : {}) as Record<string, unknown>;
  for (const [key, words] of RULES_VERSIONS) {
    const v = m[key];
    if (typeof v === 'number' && v > IMPLEMENTED_RULES[key]) fail('version', `This dish needs a newer version of Pixelmeba (${words} ${v}).`);
  }
  if (m.developmentalEnabled === true && !IMPLEMENTED_RULES.developmental) fail('version', 'This dish needs a newer version of Pixelmeba (developmental changes).');
}

/** Parse and validate a save file's text. Returns the file; building the world is a separate step. */
export async function parseSaveFile(text: string): Promise<SaveFile> {
  if (text.length > MAX_IMPORT_BYTES) fail('size', `The file is larger than ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    fail('json', 'This is not a Pixelmeba file (it is not valid JSON).');
  }
  const f = raw as Partial<SaveFile>;
  if (!f || typeof f !== 'object' || f.format !== SAVE_FORMAT) fail('format', 'This is not a Pixelmeba save file.');
  if (typeof f.schemaVersion !== 'number' || f.schemaVersion > SCHEMA_VERSION) {
    fail('version', `This dish needs a newer version of Pixelmeba (save schema ${String(f.schemaVersion)}).`);
  }
  if (!Number.isInteger(f.schemaVersion) || f.schemaVersion < 1) fail('version', `Save schema ${f.schemaVersion} is not supported by this build.`);
  const original = f.state;
  if (!original || original.format !== 'pixelmeba-world') fail('format', 'The file has no world in it.');
  // Older schemas are migrated by copy; the checksum below is always checked against the original.
  let s: WorldState;
  try {
    s = migrateWorldState(original);
  } catch (e) {
    fail('version', `This dish could not be upgraded: ${(e as Error).message}.`);
  }

  // Embedded content must parse with the same schemas as the shipped packs.
  const c = s.content;
  if (!c) fail('content', 'The dish is missing its content definitions.');
  // D-0121 (the systems flip): a dish can only run with rules this build implements. A system, structure
  // or native ability this build cannot simulate is refused by name before the manifest and species
  // schemas run, so a newer build's unknown id is named rather than reported as an invalid manifest.
  // The line is "implemented", not "enabled": a dish keeps its recorded ruleset. Newer rules versions are
  // named first ("needs a newer version"), since a newer build's dish usually also names newer systems.
  newerRulesProblem(c.manifest);
  unimplementedRulesProblem(c.manifest, c.species);
  const man = ManifestSchema.safeParse(c.manifest);
  if (!man.success) fail('content', `Manifest: ${man.error.issues[0]?.message ?? 'invalid'}`);
  if (man.data.simulationVersion !== 3) fail('version', 'Unsupported simulation version.');
  for (const sp of c.species) if (!SpeciesSchema.safeParse(sp).success) fail('content', `Species definition ${String((sp as { id?: string }).id)} is invalid.`);
  // P2.2: an ability this build cannot simulate is refused by name before its definition is checked, so
  // a newer build's module whose definition this build's schema does not know is still named.
  if (Array.isArray(c.modules)) {
    for (const m of c.modules as unknown[]) {
      const id = (m as { id?: unknown } | null)?.id;
      if (typeof id !== 'string' || IMPLEMENTED_MODULES.includes(id)) continue;
      const name = (m as { name?: unknown }).name;
      const named = typeof name === 'string' && name.length > 0 ? `"${cleanName(name)}" (${cleanName(id)})` : `"${cleanName(id)}"`;
      fail('content', `This dish uses the extra ability ${named}, which this version of Pixelmeba cannot simulate. Nothing was loaded.`);
    }
  }
  for (const m of c.modules) if (!ModuleSchema.safeParse(m).success) fail('content', 'A module definition is invalid.');
  // D-0058: a recorded module must carry every parameter the simulation reads (as the content
  // registry requires of the shipped packs); otherwise the world's first tick would throw.
  for (const m of c.modules) {
    const missing = missingModuleParams(m);
    if (missing.length > 0) fail('content', `${m.id}: recorded parameter ${missing[0]} is missing. Nothing was loaded.`);
  }
  for (const m of c.materials) if (!MaterialSchema.safeParse(m).success) fail('content', 'A material definition is invalid.');
  if (!HabitatSchema.safeParse(c.habitat).success) fail('content', 'The habitat definition is invalid.');
  const speciesIds = c.species.map((x) => x.id);
  if (speciesIds.join() !== man.data.enabledSpecies.join()) fail('content', 'Species list does not match the manifest.');
  const moduleIds = c.modules.map((m) => m.id);
  // P2.2: a dish can only run with abilities this build simulates. A module from a newer build (or a
  // made-up one) is refused before anything is built, by name, so the player knows why.
  if (moduleIds.join() !== man.data.enabledModules.join()) fail('content', "The dish's list of extra abilities does not match its manifest.");
  for (const m of c.modules) {
    if (!IMPLEMENTED_MODULES.includes(m.id)) {
      fail('content', `This dish uses the extra ability "${cleanName(m.name)}" (${m.id}), which this version of Pixelmeba cannot simulate. Nothing was loaded.`);
    }
  }
  // Wave 10 lead fixes: the dish's own rules must be consistent the way the content validator requires of
  // every manifest a build ships (registry.ts: a species or module needs the systems it uses; RESTING_DAUGHTER
  // needs DORMANCY). No build writes a manifest that fails these, and the simulation throws on the first
  // tick that meets such a species (e.g. a shell builder without the silicate system, stageIntake).
  const systems = man.data.enabledSystems;
  for (const sp of c.species) {
    for (const [sys, why] of speciesSystemNeeds(sp)) {
      if (!systems.includes(sys)) fail('content', `This dish's rules are inconsistent: ${cleanName(sp.id)} uses ${why}, which needs the ${sys} system, and the dish's rules do not include it. Nothing was loaded.`);
    }
    const pairing = nativeAbilityPairingProblem(sp);
    if (pairing !== null) fail('content', `This dish's rules are inconsistent: ${cleanName(sp.id)} ${pairing}. Nothing was loaded.`);
  }
  for (const m of c.modules) {
    const sys = MODULE_SYSTEM_NEEDS[m.id];
    if (sys !== undefined && !systems.includes(sys)) fail('content', `This dish's rules are inconsistent: the extra ability "${cleanName(m.name)}" (${m.id}) needs the ${sys} system, and the dish's rules do not include it. Nothing was loaded.`);
  }

  // Grid and fields.
  checkArray('grid.substrate', s.grid?.substrate, 'u8', CELL_COUNT);
  checkArray('grid.structure', s.grid?.structure, 'u8', CELL_COUNT);
  checkArray('grid.lightBase', s.grid?.lightBase, 'f64', CELL_COUNT);
  checkArray('grid.shade', s.grid?.shade, 'f64', CELL_COUNT);
  for (const key of Object.keys(s.fields ?? {})) {
    if (!isFieldId(key)) fail('integrity', `Unknown field "${key}".`);
    if (FIELD_DEFS[key].system !== 'core' && !man.data.enabledSystems.includes(FIELD_DEFS[key].system)) fail('integrity', `Field ${key} is not enabled by the dish's manifest.`);
    const arr = decodeF64(checkArray(`fields.${key}`, s.fields[key], 'f64', CELL_COUNT));
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i]!;
      // A cell may sit a few ulps below zero by float roundoff; the game saves that itself (fieldValue.ts).
      if (!isStorableFieldValue(v)) fail('integrity', `Field ${key} has an invalid value at cell ${i}.`);
    }
  }

  // Entities.
  const hw = s.entities?.highWater;
  if (!Number.isInteger(hw) || hw < 0 || hw > AGENT_CAP) fail('integrity', 'Entity count is out of range.');
  const cols: Record<string, ArrayLike<number>> = {};
  for (const [name, dtype] of ENTITY_COLUMNS) {
    const enc = checkArray(`entities.${name}`, s.entities.columns[name], dtype, hw);
    const bytes = base64ToBytes(enc.b64);
    const view =
      dtype === 'f64'
        ? new Float64Array(bytes.buffer, 0, hw)
        : dtype === 'i32'
          ? new Int32Array(bytes.buffer, 0, hw)
          : dtype === 'u32'
            ? new Uint32Array(bytes.buffer, 0, hw)
            : dtype === 'u16'
              ? new Uint16Array(bytes.buffer, 0, hw)
              : new Uint8Array(bytes.buffer, 0, hw);
    cols[name] = view;
    for (let i = 0; i < hw; i++) if (!Number.isFinite(view[i]!)) fail('integrity', `Entity column ${name} has a non-finite value. Nothing was loaded.`);
  }
  const genomes = s.genomes ?? [];
  const nonneg = ['B', 'N', 'E', 'H', 'age', 'mealC', 'mealN', 'boundMineral', 'jacketMineral'];
  const birthIds = new Set<number>();
  for (let i = 0; i < hw; i++) {
    const alive = cols.alive![i]!;
    if (alive !== 0 && alive !== 1) fail('integrity', 'Entity alive flag is invalid.');
    if (alive !== 1) continue;
    if (cols.species![i]! >= speciesIds.length) fail('integrity', 'An organism refers to an unknown species.');
    const g = cols.genome![i]!;
    if (g < 0 || g >= genomes.length) fail('integrity', 'An organism refers to a missing genome.');
    if (genomes[g]!.ancestor !== speciesIds[cols.species![i]!]) fail('integrity', "An organism's genome belongs to another species.");
    for (const k of nonneg) if (cols[k]![i]! < 0) fail('integrity', `An organism has a negative ${k}.`);
    // Life state (SPEC §7.6): 0 Active, 1 Preparing, 2 Resting, 3 Waking; only organisms that can
    // rest (native DORMANCY or module E03) may be anything but Active.
    const life = cols.lifeState![i]!;
    if (!Number.isInteger(life) || life < 0 || life > 3) fail('integrity', 'An organism has an unknown life state.');
    if (life !== 0) {
      const spDef = c.species[cols.species![i]!]!;
      const canRest = spDef.nativeAbilities.includes('DORMANCY') || genomes[g]!.modules.includes('E03');
      if (!canRest) fail('integrity', 'An organism is resting although it has no resting ability.');
    }
    for (const k of ['propG0', 'propG1']) {
      const p = cols[k]![i]!;
      if (p < -1 || p >= genomes.length) fail('integrity', 'A pending birth refers to a missing genome.');
    }
    const b = cols.birthId![i]!;
    if (birthIds.has(b)) fail('integrity', 'Two organisms share a birth identity.');
    birthIds.add(b);
  }
  // Cross-entity references. Host and parasite links are kept mutual and current by the simulation
  // (src/sim/parasites.ts releases them on every removal), so each must point at a living organism with
  // the recorded birthId. A predator's prey link may be stale: a prey removed in this tick (taken by
  // another predator, dead of age, starvation or lysis) stays named until the predator's next decision,
  // which re-validates it (movement.ts refValid). The game saves such a link itself, so the import
  // accepts it and refuses only a slot outside the entity table.
  const refPairs: [string, string][] = [
    ['hostSlot', 'hostBirthId'],
    ['parasiteSlot', 'parasiteBirthId'],
  ];
  for (let i = 0; i < hw; i++) {
    if (cols.alive![i] !== 1) continue;
    const prey = cols.preySlot![i]!;
    if (prey < -1 || prey >= AGENT_CAP) fail('integrity', 'A prey link points outside the dish. Nothing was loaded.');
    for (const [slotCol, birthCol] of refPairs) {
      const t = cols[slotCol]![i]!;
      if (t < 0) continue;
      if (t >= hw || cols.alive![t] !== 1 || cols.birthId![t] !== cols[birthCol]![i]) fail('integrity', `A ${slotCol.replace('Slot', '')} link points at an organism that is not there. Nothing was loaded.`);
    }
  }
  for (const g of genomes) {
    if (!speciesIds.includes(g.ancestor)) fail('integrity', `A genome refers to unknown species ${g.ancestor}.`);
    if (!Array.isArray(g.loci) || g.loci.length !== 8 || g.loci.some((l) => !Number.isInteger(l) || l < 0 || l > 100)) fail('integrity', 'A genome has invalid loci.');
    for (const m of g.modules) if (!moduleIds.includes(m)) fail('integrity', `A genome refers to unknown module ${m}.`);
    const spDef = c.species.find((x) => x.id === g.ancestor)!;
    const problem = moduleSetProblem(c.modules, spDef, g.modules);
    if (problem) fail('integrity', `A genome has an impossible set of abilities (${problem}).`);
  }
  // P2.8: the recorded history and the dish's journal are shown on screen, so every value they hold is
  // checked like the rest of the state (SPEC §14.3 "finite values … malformed ⇒ clear message and no change").
  const historyError = historyProblem(s.history, speciesIds.length);
  if (historyError) fail('integrity', `The dish's recorded history cannot be read (${historyError}). Nothing was loaded.`);
  const journalError = journalProblem((s.history as { journal?: unknown } | undefined)?.journal);
  if (journalError) fail('integrity', `The dish's journal has an entry this version of Pixelmeba cannot read (${journalError}). Nothing was loaded.`);
  // Schema 4 (Phase 3 foundation): links, finite food objects and the held sample.
  const phase3Error = phase3StateProblem(s, cols, hw, speciesIds);
  if (phase3Error) fail('integrity', `${phase3Error} Nothing was loaded.`);
  // Schema 5 (Phase 5 foundation; D-0102): stores, climate and organism columns the dish's rules could hold.
  const phase5Error = phase5StateProblem(s, cols, hw, { species: c.species, genomes, modules: c.modules, systems: man.data.enabledSystems, enabledStructures: man.data.enabledStructures ?? [] });
  if (phase5Error) fail('integrity', `${phase5Error} Nothing was loaded.`);
  // P3.4 (parasites and viruses): host/parasite pairs and infections must be ones the dish could hold.
  const pairError = hostParasiteProblem(cols, hw, c.species, man.data.enabledSystems);
  if (pairError) fail('integrity', `${pairError} Nothing was loaded.`);
  // P3.7 E12: colony pairing state must be one the simulation could have left (D-0058).
  const adhesionError = adhesionStateProblem(cols, hw, genomes, c.modules, s.counters.nextBirthId);
  if (adhesionError) fail('integrity', `${adhesionError} Nothing was loaded.`);
  if (!Number.isInteger(s.tick) || s.tick < 0) fail('integrity', 'The tick is invalid.');
  if (!Number.isInteger(s.seed) || s.seed < 0) fail('integrity', 'The seed is invalid.');

  const expected = `sha256:${await sha256Hex(canonicalJson(original))}`;
  if (f.checksum !== expected) fail('checksum', 'The file is damaged or was edited (checksum mismatch).');
  // D-0095: the header's tick sits outside the checksum, so the checked state's tick replaces it (a file
  // whose header was edited loads exactly as checked; builds before P2.8 read the header's tick after an await,
  // so it could be later than the state's).
  return { ...(f as SaveFile), schemaVersion: SCHEMA_VERSION, tick: s.tick, state: s };
}

/**
 * P3.4: the first problem with the dish's parasites and infections, as a player-facing sentence, or
 * null. A host/parasite pair must be mutual (parasite.hostSlot/hostBirthId ↔ host.parasiteSlot/
 * parasiteBirthId; the generic reference check above has already proved both point at living
 * organisms), the host must be of a species the parasite's record lists in hostIds, an infection
 * (infectedBy ≠ 0) needs the viruses system, and an infection timer must be a finite, non-negative
 * number of seconds.
 */
function hostParasiteProblem(
  cols: Record<string, ArrayLike<number>>,
  hw: number,
  species: readonly { readonly id: string; readonly name: string; readonly hostIds: readonly string[] }[],
  systems: readonly string[],
): string | null {
  const viruses = systems.includes('viruses');
  for (let i = 0; i < hw; i++) {
    if (cols.alive![i] !== 1) continue;
    const h = cols.hostSlot![i]!;
    if (h >= 0) {
      if (cols.parasiteSlot![h] !== i || cols.parasiteBirthId![h] !== cols.birthId![i]) return 'A parasite and its host do not refer to each other.';
      const sp = species[cols.species![i]!]!;
      if (!sp.hostIds.includes(species[cols.species![h]!]!.id)) return `A ${cleanName(sp.name)} is attached to an organism it cannot live on.`;
    }
    const p = cols.parasiteSlot![i]!;
    if (p >= 0 && (cols.hostSlot![p] !== i || cols.hostBirthId![p] !== cols.birthId![i])) return 'A host and its parasite do not refer to each other.';
    const code = cols.infectedBy![i]!;
    if (code !== 0 && !viruses) return "An organism is infected, but this dish's rules have no viruses.";
    if (code !== 0) {
      // Only a virus this build simulates, present in this dish, infecting a species it lists in hostIds
      // (lysis would otherwise fail 20 s after a load that reported success).
      const virusId = virusIdOfCode(code);
      const virus = virusId === null ? undefined : species.find((x) => x.id === virusId);
      if (!virus) return 'An organism is infected by a virus this dish does not have.';
      if (!virus.hostIds.includes(species[cols.species![i]!]!.id)) return `An organism is infected by ${cleanName(virus.name)}, which cannot infect it.`;
    }
    const t = cols.infectionTimer![i]!;
    if (!Number.isFinite(t) || t < 0) return 'An infection timer is invalid.';
    // The timer counts only during an infection; an uninfected organism holds exactly 0.
    if (code === 0 && t !== 0) return 'An infection timer is set on an organism that is not infected.';
  }
  return null;
}

/**
 * P3.7 E12 (D-0058): the first problem with the dish's colony pairing columns (adhLockout, adhSeconds,
 * adhPartner), as a player-facing sentence, or null. adhesion.ts writes them only for living E12
 * carriers in a world that records E12, and a freed slot is cleared (entities.ts clearSlot), so:
 *  - with no E12 recorded, every one is 0; on a dead slot, every one is 0;
 *  - on a living organism whose genome lacks E12, every one is 0 (a genome changes only at division,
 *    and birth reconciliation clears the retained daughter's pairing state, onAdhesionDivision);
 *  - the lockout lies in [0, lockoutSeconds] (set to lockoutSeconds on a break, then counts down);
 *  - the clock is not negative and at most linkSeconds + maxLinks × dt: a proposed pair skipped at
 *    resolution because an earlier link in the same pass spent one end's energy leaves the other end's
 *    clock at linkSeconds, and it can add one more dt per link the spent end can still gain before it
 *    is full (adhesion.ts step 3), so the clock may pass linkSeconds by a few ticks;
 *  - the partner is a birthId already issued (below nextBirthId). It may name an organism that has
 *    since died: the clock is re-checked at the next pairing check (like D-0050's prey links).
 * u32 columns cannot hold a negative or fractional partner; non-finite values were refused earlier.
 */
function adhesionStateProblem(
  cols: Record<string, ArrayLike<number>>,
  hw: number,
  genomes: readonly { readonly modules: readonly string[] }[],
  modules: readonly { readonly id: string; readonly params: Readonly<Record<string, number | undefined>> }[],
  nextBirthId: number,
): string | null {
  const e12 = modules.find((m) => m.id === 'E12');
  const lockoutMax = (e12?.params.lockoutSeconds ?? 0) + 1e-9;
  const clockMax = (e12?.params.linkSeconds ?? 0) + (e12?.params.maxLinks ?? 0) * DT + 1e-9;
  for (let i = 0; i < hw; i++) {
    const lockout = cols.adhLockout![i]!;
    const clock = cols.adhSeconds![i]!;
    const partner = cols.adhPartner![i]!;
    if (lockout === 0 && clock === 0 && partner === 0) continue;
    if (cols.alive![i] !== 1) return 'An empty place in the dish holds colony pairing state.';
    if (e12 === undefined) return "An organism has colony pairing state, but this dish's rules have no colony adhesion.";
    if (!genomes[cols.genome![i]!]!.modules.includes('E12')) return 'An organism has colony pairing state but cannot link into colonies.';
    if (lockout < 0 || lockout > lockoutMax) return "An organism's colony relink wait is out of range.";
    if (clock < 0 || clock > clockMax) return "An organism's colony pairing time is out of range.";
    if (!Number.isInteger(partner) || partner < 0 || partner >= nextBirthId) return 'An organism is pairing with an organism that never existed.';
  }
  return null;
}

/**
 * The first problem with a (migrated) state's schema 4 records, as a player-facing sentence, or null:
 * link columns beyond the 4 fungal / 2 adhesion positions (more links than an organism may have),
 * asymmetric or dangling links, more than 128 food objects or one outside the dish or on a structure,
 * and a held sample that cannot be read or refers to an unknown species or genome.
 */
function phase3StateProblem(s: WorldState, cols: Record<string, ArrayLike<number>>, hw: number, speciesIds: readonly string[]): string | null {
  const saved = Object.keys(s.entities.columns);
  const extra = (prefix: RegExp, known: readonly string[]) => saved.some((k) => prefix.test(k) && !known.includes(k));
  if (extra(/^fLink(B|Kind)?[0-9]+$/, [...FUNGAL_SLOT_COLUMNS, 'fLinkB0', 'fLinkB1', 'fLinkB2', 'fLinkB3', 'fLinkKind0', 'fLinkKind1', 'fLinkKind2', 'fLinkKind3'])) {
    return `An organism has more than ${FUNGAL_LINK_MAX} fungal links.`;
  }
  if (extra(/^aLinkB?[0-9]+$/, [...ADHESION_SLOT_COLUMNS, 'aLinkB0', 'aLinkB1'])) return `An organism has more than ${ADHESION_LINK_MAX} adhesion links.`;
  const links = linkProblem(cols, hw);
  if (links) return `The dish's links are inconsistent (${links}).`;
  // Only an absent counter means 1: a null one would load and be copied into the world (D-0108).
  const savedNext = (s.counters as { nextObjectId?: unknown }).nextObjectId;
  const next = savedNext === undefined ? 1 : savedNext;
  if (!Number.isInteger(next) || (next as number) < 1) return 'The food object counter is invalid.';
  const structure = base64ToBytes(s.grid.structure.b64);
  const objects = foodObjectsProblem(s.objects ?? [], structure, next as number);
  if (objects) return `The dish's food objects cannot be loaded (${objects}).`;
  const sample = savedSampleProblem(s.sample ?? null, {
    speciesIds,
    genomes: s.genomes ?? [],
    entities: { alive: cols.alive!, birthId: cols.birthId!, highWater: hw },
    // P3.5: where Cancel would put the sample back (cells, objects, the command and birth counters).
    world: { structure, objects: s.objects ?? [], nextObjectId: next as number, nextSeq: s.commands.nextSeq, nextBirthId: s.counters.nextBirthId, log: s.commands.log },
  });
  if (sample) return `The held sample cannot be loaded (${sample}).`;
  return null;
}

/**
 * Validate and build a world. Any failure of the world throws a SaveFileError and builds nothing. P4.1
 * (D-0070): the notebook beside the state never throws: a file without one (every save written before)
 * loads with an empty notebook; one with any problem (another dish's id included) loads with an empty
 * notebook and `notebookDropped` says so. The world, its checksum and its stateHash are the same either way.
 */
export async function loadSaveFile(text: string): Promise<{ file: SaveFile; world: World; notebook: NotebookRecord; notebookDropped: string | null }> {
  const file = await parseSaveFile(text);
  let world: World;
  try {
    world = deserializeWorld(file.state);
  } catch (e) {
    throw new SaveFileError(`The dish could not be rebuilt: ${(e as Error).message}`, 'integrity');
  }
  const { notebook: raw, ...rest } = file as SaveFile & { notebook?: unknown };
  // Fix round 1: the record's species, birth ids and extinction ticks are checked against this dish too;
  // P4.4 (wave 5b integration): and a running goal against what this dish can run (manifest, fields, event ids).
  const { record, dropped } = await readNotebook(raw, world.worldId, { speciesIds: world.species.map((s) => s.id), nextBirthId: world.counters.nextBirthId, tick: world.tick, ...goalWorldRefsOf(world) });
  // The file as returned carries only a notebook that was read (never the unchecked one).
  return { file: notebookIsEmpty(record) ? rest : { ...rest, notebook: record }, world, notebook: record, notebookDropped: dropped };
}
