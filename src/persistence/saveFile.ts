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
import { deserializeWorld, serializeWorld, type EncodedArray, type WorldState } from '@sim/serialize';
import { SCHEMA_VERSION, type World } from '@sim/world';

export const SAVE_FORMAT = 'pixelmeba-save';
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
export const APP_VERSION = '0.1.0';

export interface SaveMeta {
  readonly name: string;
  readonly savedAt: string;
  readonly recipeId: string | null;
  readonly note?: string;
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

export async function buildSaveFile(world: World, meta: SaveMeta, options: { stripNames?: boolean } = {}): Promise<{ text: string; checksum: string; file: SaveFile }> {
  const state = serializeWorld(world);
  const checksum = `sha256:${await sha256Hex(canonicalJson(state))}`;
  const file: SaveFile = {
    format: SAVE_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    simulationVersion: world.content.manifest.simulationVersion,
    contentVersion: world.content.manifest.contentVersion,
    contentHash: world.content.manifest.contentHash,
    tick: world.tick,
    meta: { ...meta, name: options.stripNames ? 'Shared dish' : cleanName(meta.name), ...(options.stripNames ? { note: '' } : {}) },
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
  if (f.schemaVersion !== SCHEMA_VERSION) fail('version', `Save schema ${f.schemaVersion} is not supported by this build.`);
  const s = f.state;
  if (!s || s.format !== 'pixelmeba-world') fail('format', 'The file has no world in it.');

  // Embedded content must parse with the same schemas as the shipped packs.
  const c = s.content;
  if (!c) fail('content', 'The dish is missing its content definitions.');
  const man = ManifestSchema.safeParse(c.manifest);
  if (!man.success) fail('content', `Manifest: ${man.error.issues[0]?.message ?? 'invalid'}`);
  if (man.data.simulationVersion !== 3) fail('version', 'Unsupported simulation version.');
  for (const sp of c.species) if (!SpeciesSchema.safeParse(sp).success) fail('content', `Species definition ${String((sp as { id?: string }).id)} is invalid.`);
  for (const m of c.modules) if (!ModuleSchema.safeParse(m).success) fail('content', 'A module definition is invalid.');
  for (const m of c.materials) if (!MaterialSchema.safeParse(m).success) fail('content', 'A material definition is invalid.');
  if (!HabitatSchema.safeParse(c.habitat).success) fail('content', 'The habitat definition is invalid.');
  const speciesIds = c.species.map((x) => x.id);
  if (speciesIds.join() !== man.data.enabledSpecies.join()) fail('content', 'Species list does not match the manifest.');
  const moduleIds = c.modules.map((m) => m.id);

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
  }
  if (!Number.isInteger(s.tick) || s.tick < 0) fail('integrity', 'The tick is invalid.');
  if (!Number.isInteger(s.seed) || s.seed < 0) fail('integrity', 'The seed is invalid.');

  const expected = `sha256:${await sha256Hex(canonicalJson(s))}`;
  if (f.checksum !== expected) fail('checksum', 'The file is damaged or was edited (checksum mismatch).');
  return f as SaveFile;
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
