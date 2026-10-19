/**
 * Validated content registries with a patched manifest (Phase 3 preflight; g3-plan-recheck P-19,
 * G4, G13; D-0036).
 *
 * registryWith(patch) loads the content packs from disk, deep-copies them, replaces the manifest
 * fields named in `patch` (every enabled list, developmentalEnabled, buildPhase and the version
 * fields; simulationVersion stays the literal 3), writes the content hash of the patched packs (as
 * `npm run content:validate -- --write` would) and validates the result like the shipped content.
 * It never touches the cached shipped registry (tools/lib/content-fs.ts loadRegistryFs).
 *
 * G2_LISTS is every patchable field of the manifest the g2 build shipped, read from
 * tests/fixtures/saves/g2-manifest.json (written by tools/make-g2-saves.ts before the Phase 3
 * manifest bump; contentVersion 1, buildPhase 2). `registryWith(G2_LISTS)` is the Phase 2 content
 * set: tests that pin Phase 2 values (wave A goldens, the fence's check (a)) realize their worlds
 * under it so later phases' content cannot move them.
 *
 * `allowUnimplemented` (validateContent's test-only option) accepts an enabled species whose native
 * ability, or an enabled module, the simulation does not implement yet. Use it only for content
 * another builder of the same wave is implementing, and say so.
 *
 * Never validate the g2 lists at a build phase above 2: from that phase on every recipe, card and
 * variant of that phase ships too and must use only the g2 lists, so the registry (and every test
 * built on it) breaks the day later content lands. A test whose subject is not validation, but that
 * needs a later id next to the g2 lists, uses `withEnabled(registryWith(G2_LISTS), …)`.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ContentError, contentHashInput, validateContent, type ContentRegistry, type RawFile, type RawPacks } from '../../src/sim/content/registry';
import { ManifestSchema, type Manifest } from '../../src/sim/content/schema';
import type { SystemFlag } from '../../src/sim/fields';
import { canonicalJson } from '../../src/sim/hash';
import { loadRawPacksFs } from '../../tools/lib/content-fs';
import { G2_MANIFEST_PATH } from './g2-saves';

/** The manifest fields a test may patch. */
export interface ManifestPatch {
  readonly enabledSpecies?: readonly string[];
  readonly enabledModules?: readonly string[];
  readonly enabledSystems?: readonly SystemFlag[];
  readonly enabledMaterials?: readonly string[];
  readonly enabledHabitats?: readonly string[];
  readonly enabledStructures?: readonly string[];
  readonly developmentalEnabled?: boolean;
  readonly buildPhase?: number;
  readonly contentVersion?: number;
  readonly moduleRegistryVersion?: number;
  readonly evolutionRulesVersion?: number;
  readonly phenotypeMappingVersion?: number;
}

export const PATCHABLE_MANIFEST_KEYS = [
  'enabledSpecies',
  'enabledModules',
  'enabledSystems',
  'enabledMaterials',
  'enabledHabitats',
  'enabledStructures',
  'developmentalEnabled',
  'buildPhase',
  'contentVersion',
  'moduleRegistryVersion',
  'evolutionRulesVersion',
  'phenotypeMappingVersion',
] as const satisfies readonly (keyof ManifestPatch)[];

export interface RegistryWithOptions {
  readonly allowUnimplemented?: boolean;
  /**
   * Ids of recipe, experiment, variant or objective records to leave out before validation: a reduced
   * test dish (e.g. without the film system) cannot carry shipped records that need what it removed.
   */
  readonly omit?: readonly string[];
}

/** Every patchable field of a manifest (the lists a world records, its build phase and rule versions). */
export function manifestPatchOf(m: Manifest): Required<ManifestPatch> {
  return {
    enabledSpecies: [...m.enabledSpecies],
    enabledModules: [...m.enabledModules],
    enabledSystems: [...m.enabledSystems],
    enabledMaterials: [...m.enabledMaterials],
    enabledHabitats: [...m.enabledHabitats],
    enabledStructures: [...(m.enabledStructures ?? [])],
    developmentalEnabled: m.developmentalEnabled,
    buildPhase: m.buildPhase,
    contentVersion: m.contentVersion,
    moduleRegistryVersion: m.moduleRegistryVersion,
    evolutionRulesVersion: m.evolutionRulesVersion,
    phenotypeMappingVersion: m.phenotypeMappingVersion,
  };
}

/** The g2 build's manifest exactly as recorded (contentHash included). */
export function g2Manifest(): Manifest {
  return ManifestSchema.parse(JSON.parse(readFileSync(G2_MANIFEST_PATH, 'utf8')));
}

/** The Phase 2 content set: every patchable field of the g2 manifest (contentVersion 1, buildPhase 2). */
export const G2_LISTS: Readonly<Required<ManifestPatch>> = Object.freeze(manifestPatchOf(g2Manifest()));

let rawCache: RawPacks | null = null;
const built: Record<string, ContentRegistry> = {};

/** SHA-256 of the canonical content (as computeContentHash, synchronously). */
export function contentHashOf(raw: RawPacks): string {
  return createHash('sha256').update(contentHashInput(raw), 'utf8').digest('hex');
}

/**
 * A list without repeated ids, first occurrence kept (order kept, so a sorted list stays sorted). Since
 * the systems flip (D-0121) the shipped manifest already holds barriers, climate, devices and S01–S12,
 * so a patch built as `[...shipped.enabledSystems, 'barriers', …]` repeats them.
 */
export function withoutRepeats<T>(list: readonly T[]): T[] {
  return list.filter((x, i, a) => a.indexOf(x) === i);
}

/**
 * Wave 15 (P5.6, D-0131): the shipped Phase 5 recipe and card records (experiment recipes and cards, and the
 * Phase 5 curated dishes L302 and L305). They ship with build phase 5 and need what the shipped manifest enables
 * (B09, A02, B10, B12, F04, the H05/H09/H10 habitats, S01/S03, signals, silicate …), so a patch that models
 * another, narrower build leaves them out (patchedRawPacks, below). cards-curated appends its records here.
 * Guard (fix round 1): every id must name a phase 5 record on disk (phase5RecordsChecked), so the list can never
 * drop an earlier phase's record, a record that no longer exists, or hide a validator regression on one.
 */
export const PHASE5_EXPERIMENT_RECORDS: readonly string[] = Object.freeze([
  'BRINE_CROSSING_V1',
  'DIFFERENT_HOST_V1',
  'EXP_205',
  'EXP_206',
  'EXP_207',
  'EXP_208',
  'EXP_209',
  'EXP_210',
  'EXP_211',
  'EXP_213',
  'EXP_214',
  'EXP_215',
  'EXP_216',
  'EXP_217',
  'EXP_218',
  'FUNGAL_HITCHHIKER_V1',
  'GATE_MEAL_V1',
  'GLASS_BUDGET_V1',
  'GLOW_THRESHOLD_V1',
  'L302_UNDER_THE_CANOPY',
  'L305_THE_JACKET_GARDEN',
  'NIGHT_SHIFT_V1',
  'QUIET_NEIGHBORS_V1',
  'RIVAL_NO_WINNER_V1',
  'SHELL_HANDLING_V1',
  'SHELTERED_LACE_V1',
  'SLEEPING_SHORTAGE_V1',
  'TEMPORARY_TRAP_V1',
]);

/**
 * Wave 15 (P5.6 part 3, prompts-succession): the shipped Phase 5 play prompts (content/objectives). They name
 * Phase 5 species and habitats (B10, B09, P08, H04–H11 …), so a patch that models a narrower build leaves them
 * out with the experiment records (patchedRawPacks, below).
 */
export const PHASE5_OBJECTIVE_RECORDS: readonly string[] = Object.freeze([
  'FOOD_RELAY',
  'LEAVE_A_REFUGE',
  'LIVING_BRIDGE',
  'NIGHT_GARDEN',
  'RECOVER_A_NEIGHBORHOOD',
  'SUSTAIN_THREE_SPECIES',
  'TWO_NEIGHBORHOODS',
]);

const REDUCIBLE_LISTS = ['enabledSpecies', 'enabledModules', 'enabledSystems', 'enabledMaterials', 'enabledHabitats', 'enabledStructures'] as const;

/**
 * Whether `patch` models a narrower build than the shipped manifest: a list that lacks a shipped id, or a lower
 * build phase. A patch that only adds ids (or changes nothing) is not narrower.
 */
export function narrowsShipped(patch: ManifestPatch, shipped: Record<string, unknown>): boolean {
  if (patch.buildPhase !== undefined && patch.buildPhase < (shipped.buildPhase as number)) return true;
  return REDUCIBLE_LISTS.some((k) => {
    const list = patch[k];
    return list !== undefined && ((shipped[k] as readonly string[] | undefined) ?? []).some((id) => !(list as readonly string[]).includes(id));
  });
}

/**
 * Throws unless every PHASE5_EXPERIMENT_RECORDS id names a recipe or experiment of `raw` with phase 5, and every
 * PHASE5_OBJECTIVE_RECORDS id an objective with phase 5 (fix round 1: the narrowing filter drops only these).
 */
export function phase5RecordsChecked(raw: RawPacks): void {
  const phaseOf = (files: readonly RawFile[], id: string) => (files.find((f) => (f.data as { id?: string }).id === id)?.data as { phase?: unknown } | undefined)?.phase;
  const bad = [
    ...PHASE5_EXPERIMENT_RECORDS.filter((id) => (phaseOf(raw.recipes, id) ?? phaseOf(raw.experiments, id)) !== 5),
    ...PHASE5_OBJECTIVE_RECORDS.filter((id) => phaseOf(raw.objectives, id) !== 5),
  ];
  if (bad.length > 0) throw new Error(`patchedRawPacks: the Phase 5 drop list names a record that is missing or not phase 5: ${bad.join(', ')}`);
}

/**
 * A deep copy of the content packs on disk with the manifest fields in `patch` replaced and the content hash rewritten.
 * Wave 15 (P5.6): a patch that narrows the shipped manifest (narrowsShipped) also leaves out PHASE5_EXPERIMENT_RECORDS
 * (they ship only where everything they use is enabled; a test modelling an older build never carries them).
 */
export function patchedRawPacks(patch: ManifestPatch): RawPacks {
  const keys = Object.keys(patch);
  for (const k of keys) {
    if (!(PATCHABLE_MANIFEST_KEYS as readonly string[]).includes(k)) throw new Error(`registryWith: "${k}" is not a patchable manifest field (${PATCHABLE_MANIFEST_KEYS.join(', ')})`);
  }
  rawCache ??= loadRawPacksFs();
  const raw = JSON.parse(JSON.stringify(rawCache)) as RawPacks;
  const data = raw.manifest.data as Record<string, unknown>;
  const narrow = narrowsShipped(patch, rawCache.manifest.data as Record<string, unknown>);
  for (const k of PATCHABLE_MANIFEST_KEYS) {
    const v = patch[k];
    if (v !== undefined) data[k] = JSON.parse(JSON.stringify(Array.isArray(v) ? withoutRepeats(v as readonly string[]) : v)) as unknown;
  }
  if (narrow) phase5RecordsChecked(raw);
  const out: RawPacks = narrow
    ? (() => {
        const keep = (files: readonly RawFile[]) => files.filter((f) => !PHASE5_EXPERIMENT_RECORDS.includes((f.data as { id?: string }).id ?? ''));
        const keepObjectives = (files: readonly RawFile[]) => files.filter((f) => !PHASE5_OBJECTIVE_RECORDS.includes((f.data as { id?: string }).id ?? '')); // P5.6 part 3
        return { ...raw, recipes: keep(raw.recipes), experiments: keep(raw.experiments), objectives: keepObjectives(raw.objectives) };
      })()
    : raw;
  data.contentHash = contentHashOf(out);
  return out;
}

/**
 * A validated registry whose manifest is the shipped one with `patch` applied. Cached per patch for
 * the process: treat it as read-only. Throws a ContentError naming every problem.
 */
export function registryWith(patch: ManifestPatch, opts: RegistryWithOptions = {}): ContentRegistry {
  const omit = [...(opts.omit ?? [])].sort();
  const deduped = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, Array.isArray(v) ? withoutRepeats(v as readonly string[]) : v])) as ManifestPatch;
  const key = canonicalJson({ patch: deduped, allowUnimplemented: opts.allowUnimplemented === true, omit });
  const hit = built[key];
  if (hit) return hit;
  const raw = patchedRawPacks(patch);
  const packs: RawPacks =
    omit.length === 0
      ? raw
      : (() => {
          const keep = (files: readonly RawFile[]) => files.filter((f) => !omit.includes((f.data as { id?: string }).id ?? ''));
          const left = { ...raw, recipes: keep(raw.recipes), experiments: keep(raw.experiments), variants: keep(raw.variants), objectives: keep(raw.objectives) };
          // Wave 15: a narrowing patch already left PHASE5_EXPERIMENT_RECORDS out (patchedRawPacks), so naming one is fine.
          const missing = omit.filter((id) => !PHASE5_EXPERIMENT_RECORDS.includes(id) && ![raw.recipes, raw.experiments, raw.variants, raw.objectives].some((fs) => fs.some((f) => (f.data as { id?: string }).id === id)));
          if (missing.length > 0) throw new Error(`registryWith: omit names no record: ${missing.join(', ')}`);
          (left.manifest.data as Record<string, unknown>).contentHash = contentHashOf(left);
          return left;
        })();
  const res = validateContent(packs, { allowUnimplemented: opts.allowUnimplemented === true });
  if (res.registry === null) throw new ContentError(res.issues);
  built[key] = res.registry;
  return res.registry;
}

/** Ids withEnabled adds to a manifest's lists. */
export interface EnabledExtras {
  readonly species?: readonly string[];
  readonly modules?: readonly string[];
  readonly systems?: readonly SystemFlag[];
}

/**
 * An UNVALIDATED copy of `base` whose manifest also enables `extra` (each list sorted, without
 * duplicates); every record, the content hash and the version stamps stay the base's. For tests
 * whose subject is not content validation (what a world records, how the trajectory digest maps
 * species indices) and that need later ids next to the g2 lists: validating a later id needs a later
 * build phase, at which every later recipe, card and variant also ships and must use only these
 * lists, so a validated registry like this would fail as soon as later content lands (Phase 3
 * preflight fix round 1). Unknown ids throw. Never step a world through an enabled species or module
 * the simulation does not implement.
 */
export function withEnabled(base: ContentRegistry, extra: EnabledExtras): ContentRegistry {
  for (const id of extra.species ?? []) if (base.species[id] === undefined) throw new Error(`withEnabled: unknown species "${id}"`);
  for (const id of extra.modules ?? []) if (base.modules[id] === undefined) throw new Error(`withEnabled: unknown module "${id}"`);
  const union = <T extends string>(list: readonly T[], add: readonly T[] = []): T[] => [...list, ...add].filter((x, i, all) => all.indexOf(x) === i).sort();
  const m = base.manifest;
  return {
    ...base,
    manifest: {
      ...m,
      enabledSpecies: union(m.enabledSpecies, extra.species),
      enabledModules: union(m.enabledModules, extra.modules),
      enabledSystems: union(m.enabledSystems, extra.systems),
    },
  };
}
