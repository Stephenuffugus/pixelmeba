/**
 * The .pixelmeba file (SPEC §14.3, ARCH §11.2): UTF-8 JSON with schema and version stamps, metadata,
 * the full world state and a SHA-256 checksum of the canonical state payload.
 *
 * parseSaveFile() validates everything before a world is built: size, format, versions, embedded
 * content (the same Zod schemas as the packs), array dimensions and dtypes, finite and nonnegative
 * pools, entity limits and reference integrity, then the checksum. A failure never produces a world.
 */
import { AGENT_CAP, CELL_COUNT } from '@sim/constants';
import { HabitatSchema, ManifestSchema, MaterialSchema, ModuleSchema, SpeciesSchema } from '@sim/content/schema';
import { ENTITY_COLUMNS } from '@sim/entities';
import { FIELD_DEFS, isFieldId } from '@sim/fields';
import { canonicalJson, sha256Hex, base64ToBytes } from '@sim/hash';
import { moduleSetProblem } from '@sim/content/moduleRules';
import { deserializeWorld, migrateWorldState, serializeWorld, type EncodedArray, type WorldState } from '@sim/serialize';
import { SCHEMA_VERSION, type World } from '@sim/world';
import { variantRecordOf } from '@sim/variants';
import { IMPLEMENTED_MODULES } from '@sim/content/implemented';
import { isMutationPreset } from '@sim/mutation';
import { historyProblem, journalProblem } from '@sim/history';
import { generatedBranchName } from '@sim/branches';
import type { Command } from '@sim/commands';

export const SAVE_FORMAT = 'pixelmeba-save';
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
export const APP_VERSION = '0.1.0';

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

export async function buildSaveFile(world: World, meta: SaveMeta, options: { stripNames?: boolean } = {}): Promise<{ text: string; checksum: string; file: SaveFile }> {
  const serialized = serializeWorld(world);
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
      if (!Number.isFinite(v) || v < 0) fail('integrity', `Field ${key} has an invalid value at cell ${i}.`);
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
    for (let i = 0; i < hw; i++) if (!Number.isFinite(view[i]!)) fail('integrity', `Entity column ${name} has a non-finite value.`);
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
  // Cross-entity references must point at a living organism with the recorded birthId.
  const refPairs: [string, string][] = [
    ['preySlot', 'preyBirthId'],
    ['hostSlot', 'hostBirthId'],
    ['parasiteSlot', 'parasiteBirthId'],
  ];
  for (let i = 0; i < hw; i++) {
    if (cols.alive![i] !== 1) continue;
    for (const [slotCol, birthCol] of refPairs) {
      const t = cols[slotCol]![i]!;
      if (t < 0) continue;
      if (t >= hw || cols.alive![t] !== 1 || cols.birthId![t] !== cols[birthCol]![i]) fail('integrity', `A ${slotCol.replace('Slot', '')} link points at an organism that is not there.`);
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
  if (!Number.isInteger(s.tick) || s.tick < 0) fail('integrity', 'The tick is invalid.');
  if (!Number.isInteger(s.seed) || s.seed < 0) fail('integrity', 'The seed is invalid.');

  const expected = `sha256:${await sha256Hex(canonicalJson(original))}`;
  if (f.checksum !== expected) fail('checksum', 'The file is damaged or was edited (checksum mismatch).');
  return { ...(f as SaveFile), schemaVersion: SCHEMA_VERSION, state: s };
}

/** Validate and build a world. Any failure throws a SaveFileError and builds nothing. */
export async function loadSaveFile(text: string): Promise<{ file: SaveFile; world: World }> {
  const file = await parseSaveFile(text);
  let world: World;
  try {
    world = deserializeWorld(file.state);
  } catch (e) {
    throw new SaveFileError(`The dish could not be rebuilt: ${(e as Error).message}`, 'integrity');
  }
  return { file, world };
}
