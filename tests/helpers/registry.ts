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
import { ContentError, contentHashInput, validateContent, type ContentRegistry, type RawPacks } from '../../src/sim/content/registry';
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

/** A deep copy of the content packs on disk with the manifest fields in `patch` replaced and the content hash rewritten. */
export function patchedRawPacks(patch: ManifestPatch): RawPacks {
  const keys = Object.keys(patch);
  for (const k of keys) {
    if (!(PATCHABLE_MANIFEST_KEYS as readonly string[]).includes(k)) throw new Error(`registryWith: "${k}" is not a patchable manifest field (${PATCHABLE_MANIFEST_KEYS.join(', ')})`);
  }
  rawCache ??= loadRawPacksFs();
  const raw = JSON.parse(JSON.stringify(rawCache)) as RawPacks;
  const data = raw.manifest.data as Record<string, unknown>;
  for (const k of PATCHABLE_MANIFEST_KEYS) {
    const v = patch[k];
    if (v !== undefined) data[k] = JSON.parse(JSON.stringify(v)) as unknown;
  }
  data.contentHash = contentHashOf(raw);
  return raw;
}

/**
 * A validated registry whose manifest is the shipped one with `patch` applied. Cached per patch for
 * the process: treat it as read-only. Throws a ContentError naming every problem.
 */
export function registryWith(patch: ManifestPatch, opts: RegistryWithOptions = {}): ContentRegistry {
  const key = canonicalJson({ patch, allowUnimplemented: opts.allowUnimplemented === true });
  const hit = built[key];
  if (hit) return hit;
  const res = validateContent(patchedRawPacks(patch), { allowUnimplemented: opts.allowUnimplemented === true });
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
