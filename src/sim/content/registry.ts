/**
 * Content registry: validated, indexed content packs (ARCH §4).
 * Pure: takes raw parsed JSON (from the Vite glob loader or the Node fs loader) and returns either
 * a registry or a list of precise issues naming the file and field.
 */
import type { z } from 'zod';
import { canonicalJson, sha256Hex } from '../hash';
import {
  ExperimentSchema,
  HabitatSchema,
  LociSchema,
  ManifestSchema,
  MaterialSchema,
  ModuleSchema,
  ObjectiveSchema,
  RecipeSchema,
  SpeciesSchema,
  VariantSchema,
  type ExperimentDef,
  type HabitatDef,
  type Manifest,
  type MaterialDef,
  type ModuleDef,
  type ObjectiveDef,
  type RecipeDef,
  type Species,
  type VariantDef,
} from './schema';
import { IMPLEMENTED_NATIVE_ABILITIES } from './implemented';

export interface RawFile {
  readonly file: string;
  readonly data: unknown;
}

export interface RawPacks {
  readonly manifest: RawFile;
  readonly loci: RawFile;
  readonly species: readonly RawFile[];
  readonly materials: readonly RawFile[];
  readonly modules: readonly RawFile[];
  readonly habitats: readonly RawFile[];
  readonly structures: readonly RawFile[];
  readonly recipes: readonly RawFile[];
  readonly experiments: readonly RawFile[];
  readonly variants: readonly RawFile[];
  readonly objectives: readonly RawFile[];
}

export interface ContentIssue {
  readonly severity: 'error' | 'warning';
  readonly file: string;
  readonly path: string;
  readonly message: string;
}

export interface LocusDef {
  readonly index: number;
  readonly id: string;
  readonly name: string;
  readonly descriptorLow: string;
  readonly descriptorHigh: string;
}

export interface ContentRegistry {
  readonly manifest: Manifest;
  readonly loci: readonly LocusDef[];
  readonly species: Readonly<Record<string, Species>>;
  readonly speciesIds: readonly string[];
  readonly materials: Readonly<Record<string, MaterialDef>>;
  readonly materialIds: readonly string[];
  readonly modules: Readonly<Record<string, ModuleDef>>;
  readonly moduleIds: readonly string[];
  readonly habitats: Readonly<Record<string, HabitatDef>>;
  readonly habitatIds: readonly string[];
  readonly recipes: Readonly<Record<string, RecipeDef>>;
  readonly recipeIds: readonly string[];
  readonly experiments: Readonly<Record<string, ExperimentDef>>;
  readonly experimentIds: readonly string[];
  readonly variants: Readonly<Record<string, VariantDef>>;
  readonly variantIds: readonly string[];
  readonly objectives: Readonly<Record<string, ObjectiveDef>>;
  readonly objectiveIds: readonly string[];
}

export class ContentError extends Error {
  constructor(readonly issues: readonly ContentIssue[]) {
    super(
      `Content failed validation with ${issues.filter((i) => i.severity === 'error').length} error(s):\n` +
        issues
          .filter((i) => i.severity === 'error')
          .map((i) => `  ${i.file}${i.path ? ` → ${i.path}` : ''}: ${i.message}`)
          .join('\n'),
    );
  }
}

function zodIssues(file: string, err: z.ZodError): ContentIssue[] {
  return err.issues.map((iss) => ({
    severity: 'error' as const,
    file,
    path: iss.path.map(String).join('.'),
    message: iss.message,
  }));
}

function baseName(file: string): string {
  const slash = file.lastIndexOf('/');
  const name = slash >= 0 ? file.slice(slash + 1) : file;
  return name.endsWith('.json') ? name.slice(0, -5) : name;
}

interface Parsed<T> {
  map: Record<string, T>;
  ids: string[];
  files: Record<string, string>;
}

function parseCollection<T extends { id: string }>(
  files: readonly RawFile[],
  schema: z.ZodType<T>,
  issues: ContentIssue[],
): Parsed<T> {
  const map: Record<string, T> = {};
  const fileOf: Record<string, string> = {};
  for (const f of files) {
    const res = schema.safeParse(f.data);
    if (!res.success) {
      issues.push(...zodIssues(f.file, res.error));
      continue;
    }
    const rec = res.data;
    if (baseName(f.file) !== rec.id) {
      issues.push({ severity: 'error', file: f.file, path: 'id', message: `file name must match id "${rec.id}"` });
    }
    if (map[rec.id] !== undefined) {
      issues.push({ severity: 'error', file: f.file, path: 'id', message: `duplicate id "${rec.id}" (also in ${fileOf[rec.id]})` });
      continue;
    }
    map[rec.id] = rec;
    fileOf[rec.id] = f.file;
  }
  const ids = Object.keys(map).sort();
  return { map, ids, files: fileOf };
}

/** Everything that feeds the content hash, in canonical form (manifest hash excluded). */
export function contentHashInput(raw: RawPacks): string {
  const manifest = { ...(raw.manifest.data as Record<string, unknown>) };
  delete manifest.contentHash;
  const col = (files: readonly RawFile[]) =>
    [...files].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)).map((f) => [baseName(f.file), f.data]);
  return canonicalJson({
    manifest,
    loci: raw.loci.data,
    species: col(raw.species),
    materials: col(raw.materials),
    modules: col(raw.modules),
    habitats: col(raw.habitats),
    structures: col(raw.structures),
    recipes: col(raw.recipes),
    experiments: col(raw.experiments),
    variants: col(raw.variants),
    objectives: col(raw.objectives),
  });
}

export async function computeContentHash(raw: RawPacks): Promise<string> {
  return sha256Hex(contentHashInput(raw));
}

export interface ValidationResult {
  readonly registry: ContentRegistry | null;
  readonly issues: readonly ContentIssue[];
}

/** Validate raw packs. Returns a registry only when there are no errors. */
export function validateContent(raw: RawPacks): ValidationResult {
  const issues: ContentIssue[] = [];
  const err = (file: string, path: string, message: string) => issues.push({ severity: 'error', file, path, message });
  const warn = (file: string, path: string, message: string) =>
    issues.push({ severity: 'warning', file, path, message });

  const manifestRes = ManifestSchema.safeParse(raw.manifest.data);
  if (!manifestRes.success) issues.push(...zodIssues(raw.manifest.file, manifestRes.error));
  const lociRes = LociSchema.safeParse(raw.loci.data);
  if (!lociRes.success) issues.push(...zodIssues(raw.loci.file, lociRes.error));

  const species = parseCollection(raw.species, SpeciesSchema, issues);
  const materials = parseCollection(raw.materials, MaterialSchema, issues);
  const modules = parseCollection(raw.modules, ModuleSchema, issues);
  const habitats = parseCollection(raw.habitats, HabitatSchema, issues);
  const recipes = parseCollection(raw.recipes, RecipeSchema, issues);
  const experiments = parseCollection(raw.experiments, ExperimentSchema, issues);
  const variants = parseCollection(raw.variants, VariantSchema, issues);
  const objectives = parseCollection(raw.objectives, ObjectiveSchema, issues);

  if (lociRes.success) {
    lociRes.data.loci.forEach((l, i) => {
      if (l.index !== i) err(raw.loci.file, `loci.${i}.index`, `locus at position ${i} must have index ${i}`);
    });
  }

  // Cross references ---------------------------------------------------------------------------
  const hasSpecies = (id: string) => species.map[id] !== undefined;
  const hasModule = (id: string) => modules.map[id] !== undefined;

  for (const id of species.ids) {
    const s = species.map[id]!;
    const file = species.files[id]!;
    s.prey.forEach((p, i) => {
      if (!hasSpecies(p.id)) err(file, `prey.${i}.id`, `unknown species "${p.id}"`);
    });
    s.hostIds.forEach((h, i) => {
      if (!hasSpecies(h)) err(file, `hostIds.${i}`, `unknown species "${h}"`);
    });
    if (s.category !== 'virus' && s.habitats.length === 0) err(file, 'habitats', 'cellular species need at least one habitat');
    if (s.metabolism === 'photosynthesis' && s.foodPriority.length > 0)
      err(file, 'foodPriority', 'pure photosynthesizers have no field foods (use mixotroph)');
    if (s.speed === 0 && s.lociActive[0]) err(file, 'lociActive.0', 'motility locus cannot be active without native speed');
    if (s.sensingRadius === 0 && s.lociActive[2]) err(file, 'lociActive.2', 'sensing locus cannot be active without a sensing radius');
    if (s.minDivisionAge >= s.maxAge) err(file, 'minDivisionAge', 'must be below maxAge');
  }
  for (const id of modules.ids) {
    const m = modules.map[id]!;
    const file = modules.files[id]!;
    m.eligibleAncestors.forEach((a, i) => {
      if (!hasSpecies(a)) err(file, `eligibleAncestors.${i}`, `unknown species "${a}"`);
    });
    m.nativeEquivalents.forEach((a, i) => {
      if (!hasSpecies(a)) err(file, `nativeEquivalents.${i}`, `unknown species "${a}"`);
      if (m.eligibleAncestors.includes(a)) err(file, `nativeEquivalents.${i}`, `"${a}" has this ability natively and cannot be eligible`);
    });
    [...m.excludes, ...m.requires].forEach((x) => {
      if (!hasModule(x)) err(file, 'excludes/requires', `unknown module "${x}"`);
    });
  }
  for (const id of habitats.ids) {
    const h = habitats.map[id]!;
    h.ops.forEach((op, i) => {
      if (op.op === 'rect' && (op.x0 > op.x1 || op.y0 > op.y1)) err(habitats.files[id]!, `ops.${i}`, 'rect must have x0 ≤ x1 and y0 ≤ y1');
    });
  }
  for (const id of recipes.ids) {
    const r = recipes.map[id]!;
    const file = recipes.files[id]!;
    if (habitats.map[r.habitatId] === undefined) err(file, 'habitatId', `unknown habitat "${r.habitatId}"`);
    r.founders.forEach((f, i) => {
      if (!hasSpecies(f.species)) err(file, `founders.${i}.species`, `unknown species "${f.species}"`);
      f.modules.forEach((m, j) => {
        if (!hasModule(m)) err(file, `founders.${i}.modules.${j}`, `unknown module "${m}"`);
      });
    });
  }
  for (const id of experiments.ids) {
    const e = experiments.map[id]!;
    if (recipes.map[e.recipeId] === undefined) err(experiments.files[id]!, 'recipeId', `unknown recipe "${e.recipeId}"`);
  }
  for (const id of variants.ids) {
    const v = variants.map[id]!;
    const file = variants.files[id]!;
    const src = recipes.map[v.sourceId];
    if (src === undefined) err(file, 'sourceId', `unknown recipe "${v.sourceId}"`);
    else {
      if (src.revision !== v.sourceRevision) err(file, 'sourceRevision', `source ${v.sourceId} is revision ${src.revision}`);
      if ((v.patch.kind === 'patchSet' || v.patch.kind === 'patchMove') && src.fieldPatches[v.patch.patchIndex] === undefined)
        err(file, 'patch.patchIndex', `source recipe has no field patch ${v.patch.patchIndex}`);
    }
    if (v.objectiveId !== undefined && objectives.map[v.objectiveId] === undefined)
      err(file, 'objectiveId', `unknown objective "${v.objectiveId}"`);
  }

  // Manifest ------------------------------------------------------------------------------------
  if (manifestRes.success) {
    const m = manifestRes.data;
    const mf = raw.manifest.file;
    const sortedUnique = (list: readonly string[], path: string) => {
      const sorted = [...list].sort();
      if (list.some((x, i) => x !== sorted[i])) err(mf, path, 'must be sorted ascending');
      if (list.some((x, i) => list.indexOf(x) !== i)) err(mf, path, 'must not contain duplicates');
    };
    sortedUnique(m.enabledSpecies, 'enabledSpecies');
    sortedUnique(m.enabledModules, 'enabledModules');
    sortedUnique(m.enabledMaterials, 'enabledMaterials');
    sortedUnique(m.enabledHabitats, 'enabledHabitats');
    if (!m.enabledSystems.includes('core')) err(mf, 'enabledSystems', 'must include "core"');
    m.enabledSpecies.forEach((id, i) => {
      const s = species.map[id];
      if (s === undefined) return err(mf, `enabledSpecies.${i}`, `unknown species "${id}"`);
      if (s.phase > m.buildPhase) err(mf, `enabledSpecies.${i}`, `"${id}" belongs to phase ${s.phase} (build phase ${m.buildPhase})`);
      s.nativeAbilities.forEach((a) => {
        if (!IMPLEMENTED_NATIVE_ABILITIES.includes(a))
          err(species.files[id]!, 'nativeAbilities', `enabled species uses "${a}", which the simulation does not implement yet`);
      });
      s.prey.forEach((p) => {
        if (!m.enabledSpecies.includes(p.id)) return; // prey outside the manifest is simply absent
      });
    });
    m.enabledModules.forEach((id, i) => {
      const mod = modules.map[id];
      if (mod === undefined) return err(mf, `enabledModules.${i}`, `unknown module "${id}"`);
      if (mod.phase > m.buildPhase) err(mf, `enabledModules.${i}`, `"${id}" belongs to phase ${mod.phase}`);
    });
    m.enabledMaterials.forEach((id, i) => {
      if (materials.map[id] === undefined) err(mf, `enabledMaterials.${i}`, `unknown material "${id}"`);
    });
    m.enabledHabitats.forEach((id, i) => {
      if (habitats.map[id] === undefined) err(mf, `enabledHabitats.${i}`, `unknown habitat "${id}"`);
    });
    // Recipes shipped in this build must only use enabled content.
    for (const id of recipes.ids) {
      const r = recipes.map[id]!;
      if (r.phase > m.buildPhase) continue;
      const file = recipes.files[id]!;
      if (!m.enabledHabitats.includes(r.habitatId)) err(file, 'habitatId', `habitat "${r.habitatId}" is not enabled in this build`);
      r.founders.forEach((f, i) => {
        if (!m.enabledSpecies.includes(f.species)) err(file, `founders.${i}.species`, `"${f.species}" is not enabled in this build`);
        f.modules.forEach((mod) => {
          if (!m.enabledModules.includes(mod)) err(file, `founders.${i}.modules`, `"${mod}" is not enabled in this build`);
        });
      });
    }
    if (m.contentHash === '') warn(mf, 'contentHash', 'content hash not written yet (run npm run content:validate -- --write)');
  }

  const hasErrors = issues.some((i) => i.severity === 'error');
  if (hasErrors || !manifestRes.success || !lociRes.success) return { registry: null, issues };

  const registry: ContentRegistry = {
    manifest: manifestRes.data,
    loci: lociRes.data.loci,
    species: species.map,
    speciesIds: species.ids,
    materials: materials.map,
    materialIds: materials.ids,
    modules: modules.map,
    moduleIds: modules.ids,
    habitats: habitats.map,
    habitatIds: habitats.ids,
    recipes: recipes.map,
    recipeIds: recipes.ids,
    experiments: experiments.map,
    experimentIds: experiments.ids,
    variants: variants.map,
    variantIds: variants.ids,
    objectives: objectives.map,
    objectiveIds: objectives.ids,
  };
  return { registry, issues };
}

/** Validate and throw a ContentError on any error. */
export function buildRegistry(raw: RawPacks): ContentRegistry {
  const res = validateContent(raw);
  if (res.registry === null) throw new ContentError(res.issues);
  return res.registry;
}
