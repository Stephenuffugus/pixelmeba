/**
 * What if? variants (SPEC §13.3; CT §9.4; D09 §4–5; UX §3.4).
 *
 * A RecipeVariant is one registered change to an immutable source recipe. Realization keeps the
 * source's seed, versions, founders and every other starting value, applies exactly one validated
 * patch, and builds a fresh world at tick 0 (the host keeps it paused). It records the source and
 * variant checksums and the realized initial-state hash in the world's provenance, so saves and
 * exports describe the dish honestly.
 *
 * Nothing here simulates or reads simulation randomness: previews, outlines, the catalog order behind
 * "Another idea" and "Again" are pure functions of content. A patch that would crop, substitute or
 * change nothing is refused with a readable message (never clamped).
 */
import type { ContentRegistry } from './content/registry';
import type { FieldPatch, HabitatDef, RecipeDef, VariantDef } from './content/schema';
import type { FieldId } from './fields';
import { inDisk, type Grid } from './grid';
import { canonicalJson, sha256Hex } from './hash';
import { checkLedger } from './ledger';
import { habitatGrid, realizeRecipe, RecipeError, SUB_CODE, validPatchCells } from './recipes';
import { stateHash } from './serialize';
import type { World, WorldContent } from './world';

/** UX §3.4: the What if? sheet offers at most three changed choices per source recipe. */
export const MAX_WHAT_IF_CHOICES = 3;

export type VariantPatch = VariantDef['patch'];

export type VariantErrorCode =
  | 'unknown-variant'
  | 'unknown-source'
  | 'source-revision'
  | 'unsupported'
  | 'invalid-patch'
  | 'placement'
  | 'accounting'
  | 'changed';

/** Creation stopped; `message` is readable as-is and nothing was built or changed. */
export class VariantError extends Error {
  constructor(
    readonly code: VariantErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'VariantError';
  }
}

/** One problem with a variant, addressed like a content-validation issue (field path + message). */
export interface VariantProblem {
  readonly path: string;
  readonly message: string;
}

/** Identity of a variant world, saved with it (D09 §4 "Identity"). */
export interface VariantRecord {
  readonly variantId: string;
  readonly variantRevision: number;
  readonly title: string;
  readonly sourceId: string;
  readonly sourceRevision: number;
  /** "sha256:<hex>" of the source recipe's canonical JSON. */
  readonly sourceChecksum: string;
  /** "sha256:<hex>" of the variant record's canonical JSON. */
  readonly variantChecksum: string;
  /** stateHash() of the realized world at tick 0, before any command. */
  readonly initialStateHash: string;
  readonly seed: number;
  readonly simulationVersion: number;
  readonly evolutionRulesVersion: number;
  readonly contentVersion: number;
  readonly contentHash: string;
  /** The one declared change, copied so a save describes itself even if the build later drops the variant. */
  readonly patch: VariantPatch;
}

type RecipeProvenance = WorldContent['provenance'];

/** World provenance of a variant dish: the source recipe plus the variant record. */
export interface VariantWorldProvenance extends RecipeProvenance {
  readonly createdFrom: 'variant';
  readonly variant: VariantRecord;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// ---------------------------------------------------------------------------------------------
// Patch validation and application (shared by content validation, preview and realization)

function patchName(source: RecipeDef, index: number): string {
  const p = source.fieldPatches[index];
  return p?.label ? `field patch ${index} ("${p.label}")` : `field patch ${index}`;
}

function fmtCell(c: readonly [number, number]): string {
  return `(${c[0]},${c[1]})`;
}

type AmountSlot = { readonly slot: 'add' | 'set'; readonly problem?: undefined } | { readonly slot?: undefined; readonly problem: string };

/** Which map of the patch holds `field` ('add' or 'set', exactly one), else a problem message. */
function amountSlot(source: RecipeDef, index: number, field: FieldId): AmountSlot {
  const p = source.fieldPatches[index]!;
  const inAdd = p.add[field] !== undefined;
  const inSet = p.set[field] !== undefined;
  if (inAdd && inSet) return { problem: `source ${patchName(source, index)} both adds and sets "${field}", so the change is ambiguous` };
  if (!inAdd && !inSet) return { problem: `source ${patchName(source, index)} has no "${field}" quantity to change` };
  return { slot: inAdd ? 'add' : 'set' };
}

/** Every integer cell of a disk, with no clipping to the grid or dish (the "full mask" of D09 §5). */
function fullDiskCellCount(cx: number, cy: number, r: number): number {
  let n = 0;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (inDisk(x, y, cx, cy, r)) n++;
  return n;
}

/** The recipe's substrate/structure layout (no world is built). */
function recipeGrid(habitat: HabitatDef, recipe: RecipeDef): Grid {
  return habitatGrid(habitat, { removeStones: recipe.removeStones });
}

/** The cells a patch fills when centered at `center` (the same clipping realization uses). */
function patchCellsIn(g: Grid, patch: FieldPatch, center: readonly [number, number]): number[] {
  return validPatchCells(g, center, patch.radius, SUB_CODE[patch.substrate]);
}

/**
 * Problems with a variant's one change against its source recipe and habitat. Empty means the patch
 * can be applied exactly: the index exists, the change is real (not a no-op), and a moved patch keeps
 * its whole mask on open cells of its substrate with the same cell count as the original (D09 §5).
 */
export function variantPatchProblems(variant: VariantDef, source: RecipeDef, habitat: HabitatDef | undefined): VariantProblem[] {
  const patch = variant.patch;
  if (patch.kind === 'none') return [];
  if (patch.kind === 'deviceState') {
    return [{ path: 'patch.deviceIndex', message: `recipes do not declare devices yet, so source recipe ${source.id} has no device ${patch.deviceIndex}` }];
  }
  const fp = source.fieldPatches[patch.patchIndex];
  if (fp === undefined) return [{ path: 'patch.patchIndex', message: `source recipe has no field patch ${patch.patchIndex}` }];
  if (patch.kind === 'patchSet') {
    const { slot, problem } = amountSlot(source, patch.patchIndex, patch.field);
    if (slot === undefined) return [{ path: 'patch.field', message: problem }];
    const before = fp[slot][patch.field]!;
    if (before === patch.value) {
      return [{ path: 'patch.value', message: `${patch.value} is already the source value, so nothing would change (use kind "none" for the unchanged recipe)` }];
    }
    return [];
  }
  // patchMove
  if (patch.center[0] === fp.center[0] && patch.center[1] === fp.center[1]) {
    return [{ path: 'patch.center', message: `${fmtCell(patch.center)} is where source ${patchName(source, patch.patchIndex)} already is, so nothing would change` }];
  }
  if (habitat === undefined) return [{ path: 'sourceId', message: `source habitat "${source.habitatId}" is unknown` }];
  const out: VariantProblem[] = [];
  const g = recipeGrid(habitat, source);
  const oldFull = fullDiskCellCount(fp.center[0], fp.center[1], fp.radius);
  const oldCells = patchCellsIn(g, fp, fp.center);
  if (oldCells.length !== oldFull) {
    out.push({
      path: 'patch.patchIndex',
      message: `source ${patchName(source, patch.patchIndex)} fills only ${oldCells.length} of its ${oldFull} cells, so it cannot be moved without changing its size`,
    });
  }
  const newFull = fullDiskCellCount(patch.center[0], patch.center[1], fp.radius);
  const newCells = patchCellsIn(g, fp, patch.center);
  if (newCells.length !== newFull) {
    out.push({
      path: 'patch.center',
      message: `moving ${patchName(source, patch.patchIndex)} to ${fmtCell(patch.center)} would crop it: only ${newCells.length} of its ${newFull} cells within r ${fp.radius} are open ${fp.substrate} inside the dish`,
    });
  } else if (newCells.length !== oldCells.length) {
    out.push({
      path: 'patch.center',
      message: `the moved patch at ${fmtCell(patch.center)} covers ${newCells.length} cells but the original covers ${oldCells.length}; cell counts must be equal`,
    });
  }
  return out;
}

/** The source recipe with the variant's one change applied (a new object; the source is untouched). */
export function applyVariantPatch(source: RecipeDef, variant: VariantDef): RecipeDef {
  const patch = variant.patch;
  if (patch.kind === 'none') return { ...source };
  if (patch.kind === 'deviceState') throw new VariantError('invalid-patch', `${variant.id}: recipes do not declare devices yet`);
  const idx = patch.patchIndex;
  const fp = source.fieldPatches[idx];
  if (fp === undefined) throw new VariantError('invalid-patch', `${variant.id}: source recipe has no field patch ${idx}`);
  let changed: FieldPatch;
  if (patch.kind === 'patchSet') {
    const { slot, problem } = amountSlot(source, idx, patch.field);
    if (slot === undefined) throw new VariantError('invalid-patch', `${variant.id}: ${problem}`);
    changed = { ...fp, [slot]: { ...fp[slot], [patch.field]: patch.value } };
  } else {
    changed = { ...fp, center: [patch.center[0], patch.center[1]] };
  }
  return { ...source, fieldPatches: source.fieldPatches.map((p, i) => (i === idx ? changed : p)) };
}

// ---------------------------------------------------------------------------------------------
// Catalog: support, order, "Another idea"

/** Why this build cannot offer the variant, or null when it can. */
export function variantSupportProblem(registry: ContentRegistry, variant: VariantDef): string | null {
  const m = registry.manifest;
  if (variant.phase > m.buildPhase) return `${variant.id} belongs to phase ${variant.phase}; this build is phase ${m.buildPhase}`;
  const missing = variant.requiredCapabilities.filter((c) => !m.enabledSystems.includes(c));
  if (missing.length > 0) return `${variant.id} needs ${missing.map((c) => `"${c}"`).join(', ')}, which this build does not enable`;
  const source = registry.recipes[variant.sourceId];
  if (source === undefined) return `${variant.id} starts from recipe ${variant.sourceId}, which this build does not include`;
  if (source.revision !== variant.sourceRevision) {
    return `${variant.id} was written for ${variant.sourceId} revision ${variant.sourceRevision}, but this build has revision ${source.revision}`;
  }
  if (source.phase > m.buildPhase) return `${variant.id} starts from ${variant.sourceId}, which belongs to phase ${source.phase}`;
  return null;
}

/**
 * Every variant this build supports, in catalog order. Catalog order is ascending variant id, which
 * is the CT §9.4 table order (R-G0 … R-G3, then R-L1, R-L2). Unsupported variants are hidden, never
 * shown locked.
 */
export function variantCatalog(registry: ContentRegistry): VariantDef[] {
  return registry.variantIds.map((id) => registry.variants[id]!).filter((v) => variantSupportProblem(registry, v) === null);
}

/** Supported variants of one source recipe, in catalog order (including its unchanged "none" entry). */
export function variantsForSource(registry: ContentRegistry, sourceId: string): VariantDef[] {
  return variantCatalog(registry).filter((v) => v.sourceId === sourceId);
}

/** The What if? sheet's choices for a source: supported variants that change something (≤ 3; UX §3.4). */
export function whatIfChoices(registry: ContentRegistry, sourceId: string): VariantDef[] {
  return variantsForSource(registry, sourceId).filter((v) => v.patch.kind !== 'none');
}

/**
 * "Another idea": the next supported variant of the same source after `currentId` in catalog order,
 * wrapping, never the current one. Null when there is no other. A pure function of content: it reads
 * no world and no simulation random stream.
 */
export function nextVariantId(registry: ContentRegistry, currentId: string): string | null {
  const current = registry.variants[currentId];
  if (current === undefined) return null;
  const list = variantsForSource(registry, current.sourceId);
  const at = list.findIndex((v) => v.id === currentId);
  for (let k = 1; k <= list.length; k++) {
    const cand = list[(at + k + list.length) % list.length]!;
    if (cand.id !== currentId) return cand.id;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Resolution, preview and outlines (pure; never simulate)

export interface ResolvedVariant {
  readonly variant: VariantDef;
  readonly source: RecipeDef;
  readonly habitat: HabitatDef;
  /** The source with the one change applied. */
  readonly recipe: RecipeDef;
}

/** Look up and validate a variant against its source; throws a readable VariantError. */
export function resolveVariant(registry: ContentRegistry, variantId: string): ResolvedVariant {
  const variant = registry.variants[variantId];
  if (variant === undefined) throw new VariantError('unknown-variant', `What if? "${variantId}" is not in this build.`);
  const source = registry.recipes[variant.sourceId];
  if (source === undefined) throw new VariantError('unknown-source', `${variant.id} starts from recipe ${variant.sourceId}, which this build does not include.`);
  if (source.revision !== variant.sourceRevision) {
    throw new VariantError(
      'source-revision',
      `${variant.id} was written for ${variant.sourceId} revision ${variant.sourceRevision}, but this build has revision ${source.revision}.`,
    );
  }
  const unsupported = variantSupportProblem(registry, variant);
  if (unsupported !== null) throw new VariantError('unsupported', `${unsupported}.`);
  const habitat = registry.habitats[source.habitatId];
  const problems = variantPatchProblems(variant, source, habitat);
  if (problems.length > 0) throw new VariantError('invalid-patch', `${variant.id} cannot be created: ${problems.map((p) => p.message).join('; ')}.`);
  if (habitat === undefined) throw new VariantError('unknown-source', `${variant.sourceId} uses habitat ${source.habitatId}, which this build does not include.`);
  return { variant, source, habitat, recipe: applyVariantPatch(source, variant) };
}

/** Cells of the changed patch before and after the variant (R-G3: outline old, solid new). */
export interface VariantOutlines {
  readonly oldCells: readonly number[];
  readonly newCells: readonly number[];
}

/**
 * The changed patch's cells in the source and in the variant, row-major, exactly as realization fills
 * them. Both empty for an unchanged variant; equal for an amount change. Pure: builds no world.
 */
export function variantPatchOutlines(registry: ContentRegistry, variantId: string): VariantOutlines {
  return outlinesOf(resolveVariant(registry, variantId));
}

function outlinesOf({ variant, source, habitat, recipe }: ResolvedVariant): VariantOutlines {
  const patch = variant.patch;
  if (patch.kind !== 'patchSet' && patch.kind !== 'patchMove') return { oldCells: [], newCells: [] };
  const before = source.fieldPatches[patch.patchIndex]!;
  const after = recipe.fieldPatches[patch.patchIndex]!;
  return { oldCells: patchCellsIn(recipeGrid(habitat, source), before, before.center), newCells: patchCellsIn(recipeGrid(habitat, recipe), after, after.center) };
}

export type VariantChange =
  | { readonly kind: 'unchanged' }
  | {
      readonly kind: 'amount';
      readonly direction: 'less' | 'more';
      readonly patchIndex: number;
      readonly patchLabel: string | null;
      readonly field: FieldId;
      /** Per included cell. */
      readonly before: number;
      readonly after: number;
      readonly center: readonly [number, number];
      readonly radius: number;
      readonly cells: readonly number[];
    }
  | {
      readonly kind: 'moved';
      readonly patchIndex: number;
      readonly patchLabel: string | null;
      /** What each cell receives, unchanged by the move. */
      readonly amounts: Readonly<Partial<Record<FieldId, number>>>;
      readonly from: readonly [number, number];
      readonly to: readonly [number, number];
      readonly radius: number;
      readonly oldCells: readonly number[];
      readonly newCells: readonly number[];
    };

/** Everything the What if? sheet shows for one choice (UX §3.4), computed without a world. */
export interface VariantPreview {
  readonly id: string;
  readonly revision: number;
  readonly title: string;
  readonly question: string;
  readonly previewDifference: string;
  readonly objectiveId: string | null;
  readonly sourceId: string;
  readonly sourceRevision: number;
  readonly sourceName: string;
  readonly seed: number;
  readonly mutationPreset: RecipeDef['mutationPreset'];
  readonly founderMode: RecipeDef['founderMode'];
  readonly versions: {
    readonly simulationVersion: number;
    readonly evolutionRulesVersion: number;
    readonly moduleRegistryVersion: number;
    readonly phenotypeMappingVersion: number;
    readonly contentVersion: number;
    readonly contentHash: string;
  };
  /** Details line, e.g. "R-G3 / rev 1 / seed 104729". */
  readonly identity: string;
  readonly change: VariantChange;
}

export function variantIdentity(variant: VariantDef, seed: number): string {
  return `${variant.id} / rev ${variant.revision} / seed ${seed}`;
}

export function variantPreview(registry: ContentRegistry, variantId: string): VariantPreview {
  const resolved = resolveVariant(registry, variantId);
  const { variant, source, recipe } = resolved;
  const m = registry.manifest;
  const patch = variant.patch;
  let change: VariantChange;
  if (patch.kind === 'patchSet') {
    const fp = source.fieldPatches[patch.patchIndex]!;
    const slot = amountSlot(source, patch.patchIndex, patch.field).slot!;
    const before = fp[slot][patch.field]!;
    const { oldCells } = outlinesOf(resolved);
    change = {
      kind: 'amount',
      direction: patch.value < before ? 'less' : 'more',
      patchIndex: patch.patchIndex,
      patchLabel: fp.label ?? null,
      field: patch.field,
      before,
      after: patch.value,
      center: fp.center,
      radius: fp.radius,
      cells: oldCells,
    };
  } else if (patch.kind === 'patchMove') {
    const fp = source.fieldPatches[patch.patchIndex]!;
    const moved = recipe.fieldPatches[patch.patchIndex]!;
    const { oldCells, newCells } = outlinesOf(resolved);
    change = {
      kind: 'moved',
      patchIndex: patch.patchIndex,
      patchLabel: fp.label ?? null,
      amounts: { ...fp.add, ...fp.set },
      from: fp.center,
      to: moved.center,
      radius: fp.radius,
      oldCells,
      newCells,
    };
  } else {
    change = { kind: 'unchanged' };
  }
  return {
    id: variant.id,
    revision: variant.revision,
    title: variant.title,
    question: variant.question,
    previewDifference: variant.previewDifference,
    objectiveId: variant.objectiveId ?? null,
    sourceId: source.id,
    sourceRevision: source.revision,
    sourceName: source.name,
    seed: source.seed,
    mutationPreset: source.mutationPreset,
    founderMode: source.founderMode,
    versions: {
      simulationVersion: m.simulationVersion,
      evolutionRulesVersion: m.evolutionRulesVersion,
      moduleRegistryVersion: m.moduleRegistryVersion,
      phenotypeMappingVersion: m.phenotypeMappingVersion,
      contentVersion: m.contentVersion,
      contentHash: m.contentHash,
    },
    identity: variantIdentity(variant, source.seed),
    change,
  };
}

// ---------------------------------------------------------------------------------------------
// Identity and realization

async function checksumOf(value: unknown): Promise<string> {
  return `sha256:${await sha256Hex(canonicalJson(value))}`;
}

export interface VariantChecksums {
  readonly sourceChecksum: string;
  readonly variantChecksum: string;
}

/** SHA-256 over the canonical JSON of the validated source recipe and variant records. */
export async function variantChecksums(registry: ContentRegistry, variantId: string): Promise<VariantChecksums> {
  return checksumsOf(resolveVariant(registry, variantId));
}

async function checksumsOf(r: ResolvedVariant): Promise<VariantChecksums> {
  const [sourceChecksum, variantChecksum] = await Promise.all([checksumOf(r.source), checksumOf(r.variant)]);
  return { sourceChecksum, variantChecksum };
}

export interface RealizeVariantOptions {
  /** A fresh world id for the new dish (default `<variant>-r<rev>-s<seed>`). */
  readonly worldId?: string;
}

/** The variant record of a world made from a variant, or null for any other world. */
export function variantRecordOf(world: World): VariantRecord | null {
  const p = world.content.provenance as Partial<VariantWorldProvenance>;
  if (p.createdFrom !== 'variant' || p.variant === undefined) return null;
  // Provenance arrives from save files too: accept only a well-formed record.
  return isVariantRecord(p.variant) ? p.variant : null;
}

function isVariantRecord(v: unknown): v is VariantRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  const str = (k: string) => typeof r[k] === 'string' && String(r[k]).length > 0;
  const int = (k: string) => Number.isInteger(r[k]) && (r[k] as number) >= 0;
  return (
    str('variantId') && str('title') && str('sourceId') && str('sourceChecksum') && str('variantChecksum') && str('initialStateHash') && str('contentHash') &&
    int('variantRevision') && int('sourceRevision') && int('seed') && int('simulationVersion') && int('evolutionRulesVersion') && int('contentVersion') &&
    typeof r.patch === 'object' && r.patch !== null && typeof (r.patch as { kind?: unknown }).kind === 'string'
  );
}

/**
 * Build a variant as a fresh world at tick 0 (the caller keeps it paused). The source's seed, versions,
 * founders and all other values are kept; exactly the declared patch differs. Records the source and
 * variant checksums and the realized initial-state hash in the world's provenance. Touches nothing
 * else: the registry, the source recipe and any existing world are left as they were.
 */
export async function realizeVariant(registry: ContentRegistry, variantId: string, opts: RealizeVariantOptions = {}): Promise<World> {
  const resolved = resolveVariant(registry, variantId);
  return buildVariantWorld(registry, resolved, await checksumsOf(resolved), opts);
}

function buildVariantWorld(registry: ContentRegistry, r: ResolvedVariant, checksums: VariantChecksums, opts: RealizeVariantOptions): World {
  const { variant, source, recipe } = r;
  const m = registry.manifest;
  const record: Mutable<VariantRecord> = {
    variantId: variant.id,
    variantRevision: variant.revision,
    title: variant.title,
    sourceId: source.id,
    sourceRevision: source.revision,
    sourceChecksum: checksums.sourceChecksum,
    variantChecksum: checksums.variantChecksum,
    initialStateHash: '',
    seed: source.seed,
    simulationVersion: m.simulationVersion,
    evolutionRulesVersion: m.evolutionRulesVersion,
    contentVersion: m.contentVersion,
    contentHash: m.contentHash,
    patch: JSON.parse(JSON.stringify(variant.patch)) as VariantPatch,
  };
  const provenance: VariantWorldProvenance = { recipeId: source.id, recipeRevision: source.revision, createdFrom: 'variant', variant: record };
  let world: World;
  try {
    world = realizeRecipe(registry, recipe, { worldId: opts.worldId ?? `${variant.id}-r${variant.revision}-s${source.seed}`, provenance });
  } catch (e) {
    if (e instanceof RecipeError) throw new VariantError('placement', `${variant.id} could not be created: ${e.message}.`);
    throw e;
  }
  const ledger = checkLedger(world);
  if (!ledger.ok) throw new VariantError('accounting', `${variant.id} could not be created: its starting materials do not balance.`);
  // stateHash covers neither the world id nor provenance, so recording it here does not change it.
  record.initialStateHash = stateHash(world);
  return world;
}

/**
 * "Again": rebuild the same variant, source and seed from a dish's record. Refuses (never substitutes)
 * when this build would not start the dish exactly as recorded.
 */
export async function realizeAgain(registry: ContentRegistry, record: VariantRecord, opts: RealizeVariantOptions & { readonly worldId: string }): Promise<World> {
  // Identity (D09 §4): the variant revision and the source and variant checksums. A content update
  // elsewhere in the build changes contentHash but not this recipe, so it does not block Again.
  const variant = registry.variants[record.variantId];
  if (variant === undefined) throw new VariantError('unknown-variant', `This dish came from a What if? idea (${record.title}) that this version of Pixelmeba does not include.`);
  if (variant.revision !== record.variantRevision) {
    throw new VariantError('changed', `"${record.title}" has been revised since this dish was made, so it cannot be rebuilt exactly. Your dish is unchanged.`);
  }
  const world = await realizeVariant(registry, record.variantId, opts);
  const again = variantRecordOf(world)!;
  if (again.sourceChecksum !== record.sourceChecksum || again.variantChecksum !== record.variantChecksum) {
    throw new VariantError('changed', `"${record.title}" or the dish it starts from has changed since this dish was made, so it cannot be rebuilt exactly. Your dish is unchanged.`);
  }
  // Under the same content and rules the start must be bit-identical; anything else is a bug.
  const sameRules = again.contentHash === record.contentHash && again.simulationVersion === record.simulationVersion && again.evolutionRulesVersion === record.evolutionRulesVersion;
  if (sameRules && again.initialStateHash !== record.initialStateHash) {
    throw new VariantError('changed', `This version of Pixelmeba would not start "${record.title}" exactly as before, so it was not started. Your dish is unchanged.`);
  }
  return world;
}
