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
  StructureSchema,
  ToolSchema,
  VariantSchema,
  type ExperimentDef,
  type HabitatDef,
  type Manifest,
  type MaterialDef,
  type ModuleDef,
  type ObjectiveDef,
  type RecipeDef,
  type Species,
  type StructureDef,
  type ToolDef,
  type VariantDef,
} from './schema';
import { IMPLEMENTED_MODULES, IMPLEMENTED_NATIVE_ABILITIES, IMPLEMENTED_RULES, IMPLEMENTED_STRUCTURES, IMPLEMENTED_SYSTEMS, RULES_VERSIONS } from './implemented';
import { expectedStructureKind, rulesOfManifest, speciesSystemNeeds, STRUCTURE_SYSTEM_NEEDS } from './structureRules';
import { MODULE_NATIVE_ABILITY, missingModuleParams, moduleSetProblem } from './moduleRules';
import { MAX_WHAT_IF_CHOICES, variantPatchProblems } from '../variants';
import { habitatShapeProblems, recipeShapeProblems, recipeTouchesStructures, structurePlacementProblems } from '../recipes';
import { communityOfferProblem, habitatOfferIssue } from './habitatRules';
import { experimentProblems } from '../experiments';
import { objectivePredicateProblem } from '../objectives';
import { PAINT_TARGETS, STRUCTURE_RECORD_IDS } from '../grid';
import { FIELD_DEFS, isFieldId, type SystemFlag } from '../fields';
import { guideProblems } from './guideRules';

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
  /**
   * P3.8 (D-0039): player tool texts (content/tools). Optional so that packs assembled before tools
   * were content (and every test that builds a RawPacks by hand) still type-check; absent means none.
   */
  readonly tools?: readonly RawFile[];
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
  readonly structures: Readonly<Record<string, StructureDef>>;
  readonly structureIds: readonly string[];
  readonly recipes: Readonly<Record<string, RecipeDef>>;
  readonly recipeIds: readonly string[];
  readonly experiments: Readonly<Record<string, ExperimentDef>>;
  readonly experimentIds: readonly string[];
  readonly variants: Readonly<Record<string, VariantDef>>;
  readonly variantIds: readonly string[];
  readonly objectives: Readonly<Record<string, ObjectiveDef>>;
  readonly objectiveIds: readonly string[];
  /** P3.8: player tool texts (content/tools); a tool is enabled when its phase ≤ the build phase. */
  readonly tools: Readonly<Record<string, ToolDef>>;
  readonly toolIds: readonly string[];
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
    // P3.8: only when tools exist, so packs without them hash exactly as before.
    ...(raw.tools !== undefined && raw.tools.length > 0 ? { tools: col(raw.tools) } : {}),
  });
}

export async function computeContentHash(raw: RawPacks): Promise<string> {
  return sha256Hex(contentHashInput(raw));
}

export interface ValidationResult {
  readonly registry: ContentRegistry | null;
  readonly issues: readonly ContentIssue[];
}

export interface ValidateOptions {
  /**
   * Tests only (tests/helpers/registry.ts registryWith): accept an enabled species whose native
   * ability, or an enabled module, the simulation does not implement yet, so a builder can test
   * content another builder of the same wave is implementing. Off by default; never set by the app,
   * the content validator or a save import.
   */
  readonly allowUnimplemented?: boolean;
}

/** Validate raw packs. Returns a registry only when there are no errors. */
export function validateContent(raw: RawPacks, opts: ValidateOptions = {}): ValidationResult {
  const allowUnimplemented = opts.allowUnimplemented === true;
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
  const structures = parseCollection(raw.structures, StructureSchema, issues);
  const recipes = parseCollection(raw.recipes, RecipeSchema, issues);
  const experiments = parseCollection(raw.experiments, ExperimentSchema, issues);
  const variants = parseCollection(raw.variants, VariantSchema, issues);
  const objectives = parseCollection(raw.objectives, ObjectiveSchema, issues);
  const tools = parseCollection(raw.tools ?? [], ToolSchema, issues);

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
    const pairing = nativeAbilityPairingProblem(s);
    if (pairing !== null) err(file, 'nativeAbilities', pairing);
    // D-0123 MINOR 6: the simulation keys the A04 mode on the metabolism (species.ts mixotroph), the import
    // keys its mode refusal on the native ability, so the two must name the same species.
    const mixoAbility = s.nativeAbilities.includes('MIXOTROPHY');
    if ((s.metabolism === 'mixotroph') !== mixoAbility)
      err(
        file,
        mixoAbility ? 'metabolism' : 'nativeAbilities',
        mixoAbility
          ? `lists MIXOTROPHY but its metabolism is "${s.metabolism}": a species with MIXOTROPHY must have metabolism "mixotroph"`
          : 'has metabolism "mixotroph" without MIXOTROPHY: a mixotroph must also list the native ability MIXOTROPHY',
      );
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
    // A species with the native ability this module duplicates can never be eligible (CT §7.2).
    const native = MODULE_NATIVE_ABILITY[m.id];
    if (native !== undefined) {
      m.eligibleAncestors.forEach((a, i) => {
        if (species.map[a]?.nativeAbilities.includes(native)) err(file, `eligibleAncestors.${i}`, `"${a}" has ${native} natively and cannot be eligible`);
      });
    }
  }
  for (const id of habitats.ids) {
    const h = habitats.map[id]!;
    h.ops.forEach((op, i) => {
      if (op.op === 'rect' && (op.x0 > op.x1 || op.y0 > op.y1)) err(habitats.files[id]!, `ops.${i}`, 'rect must have x0 ≤ x1 and y0 ≤ y1');
    });
    // Phase 5 (P5.2): the habitat's placed edges and devices on its own grid (geometry alone; what they
    // need from the manifest is checked below for shipped habitats).
    for (const p of structurePlacementProblems(h, null, null)) err(habitats.files[id]!, p.path, p.message);
    // P5.4 (D-0128): regions, furnished areas, objects and the Suggested Community's shape.
    for (const p of habitatShapeProblems(h, species.map)) err(habitats.files[id]!, p.path, p.message);
  }
  // Phase 5 (CT §4): every structure record has the kind the simulation gives its id.
  for (const id of structures.ids) {
    const want = expectedStructureKind(id);
    const st = structures.map[id]!;
    const kindWords = { cell: 'a cell structure', edge: 'an edge barrier', furnishing: 'a furnishing', device: 'a device' } as const;
    if (want !== undefined && st.kind !== want) err(structures.files[id]!, 'kind', `${id} is ${kindWords[want]} in the simulation (CT §4), not ${kindWords[st.kind]}`);
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
      // Founder module sets obey the same combination rules as mutation (SPEC §9; P2.1).
      const sp = species.map[f.species];
      if (sp && f.modules.every(hasModule)) {
        const set = [...f.modules].sort();
        const problem = moduleSetProblem(modules.ids.map((id) => modules.map[id]!), sp, set);
        if (problem) err(file, `founders.${i}.modules`, problem);
      }
    });
    // P3.9: the recipe's own ops and founder placement, cells, initial values and links.
    for (const p of recipeShapeProblems(r, habitats.map[r.habitatId], species.map, structures.map)) err(file, p.path, p.message);
    // P5.4: a recipe that asks for its habitat's Suggested Community needs a habitat that has one.
    if (r.community === true && habitats.map[r.habitatId] !== undefined && habitats.map[r.habitatId]!.suggestedCommunity === undefined)
      err(file, 'community', `habitat "${r.habitatId}" has no Suggested Community`);
    // Phase 5 (P5.2): the recipe's placed edges and devices (with its habitat's) on its final grid.
    const rh = habitats.map[r.habitatId];
    if (rh && recipeTouchesStructures(rh, r)) for (const p of structurePlacementProblems(rh, r, null)) err(file, p.path, p.message);
  }
  for (const id of experiments.ids) {
    const e = experiments.map[id]!;
    if (recipes.map[e.recipeId] === undefined) err(experiments.files[id]!, 'recipeId', `unknown recipe "${e.recipeId}"`);
    // Experiment cards (SPEC §13.2; P2.5): gate clauses, measurements, the declared change and the
    // recipe's scheduled commands must all be valid; shipped cards may only use enabled content.
    const expRecipe = recipes.map[e.recipeId];
    const ctx = { species: species.map, materials: materials.map, manifest: manifestRes.success ? manifestRes.data : null };
    for (const p of experimentProblems(e, expRecipe, ctx)) {
      err(p.target === 'recipe' && expRecipe ? recipes.files[expRecipe.id]! : experiments.files[id]!, p.path, `${p.target === 'recipe' ? `(experiment ${id}) ` : ''}${p.message}`);
    }
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
    // What if? (SPEC §13.3; D09 §5): the one change must be real and apply exactly, never cropped.
    if (src !== undefined && src.revision === v.sourceRevision) {
      for (const p of variantPatchProblems(v, src, habitats.map[src.habitatId])) {
        if (!issues.some((x) => x.file === file && x.path === p.path)) err(file, p.path, p.message);
      }
    }
  }

  // Objectives (P4.4; SPEC §13.5): typed params, texts and offerOn always; what a shipped objective
  // (phase ≤ buildPhase) names must be enabled. A later phase's objective is skipped, not an error.
  for (const id of objectives.ids) {
    const o = objectives.map[id]!;
    const ctx = { species: species.map, structures: structures.map, recipes: recipes.map, manifest: manifestRes.success ? manifestRes.data : null };
    const p = objectivePredicateProblem(o, ctx);
    if (p) err(objectives.files[id]!, p.path, p.message);
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
    sortedUnique(m.enabledStructures ?? [], 'enabledStructures');
    if (!m.enabledSystems.includes('core')) err(mf, 'enabledSystems', 'must include "core"');
    // D-0121 (lead): the import refuses a dish that records a system outside IMPLEMENTED_SYSTEMS, a rules
    // version newer than IMPLEMENTED_RULES or developmental changes, so a manifest naming one would make every
    // new dish (its autosave, Continue) impossible to reopen. Tests may skip this with allowUnimplemented.
    if (!allowUnimplemented) {
      m.enabledSystems.forEach((id, i) => {
        if (!IMPLEMENTED_SYSTEMS.includes(id)) err(mf, `enabledSystems.${i}`, `"${id}" is not implemented by the simulation yet`);
      });
      for (const [key] of RULES_VERSIONS) {
        if (m[key] > IMPLEMENTED_RULES[key]) err(mf, key, `${m[key]} is newer than the simulation implements (${IMPLEMENTED_RULES[key]})`);
      }
      if (m.developmentalEnabled && !IMPLEMENTED_RULES.developmental) err(mf, 'developmentalEnabled', 'developmental changes are not implemented by the simulation yet');
    }
    m.enabledSpecies.forEach((id, i) => {
      const s = species.map[id];
      if (s === undefined) return err(mf, `enabledSpecies.${i}`, `unknown species "${id}"`);
      if (s.phase > m.buildPhase) err(mf, `enabledSpecies.${i}`, `"${id}" belongs to phase ${s.phase} (build phase ${m.buildPhase})`);
      s.nativeAbilities.forEach((a) => {
        if (!allowUnimplemented && !IMPLEMENTED_NATIVE_ABILITIES.includes(a))
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
      if (!allowUnimplemented && !IMPLEMENTED_MODULES.includes(id)) err(mf, `enabledModules.${i}`, `"${id}" is not implemented by the simulation yet`);
      const missing = missingModuleParams(mod);
      if (missing.length > 0) err(modules.files[id]!, 'params', `enabled module ${id} is missing ${missing.join(', ')}`);
      // The dormancy machine subtracts these costs unconditionally once its energy gates pass, so the
      // gates must cover them or an organism could be driven below zero energy.
      const p = mod.params as Record<string, number | undefined>;
      if (id === 'E03' && p.wakeMinEnergy !== undefined && p.wakeCost !== undefined && p.wakeMinEnergy < p.wakeCost) {
        err(modules.files[id]!, 'params.wakeMinEnergy', `wakeMinEnergy ${p.wakeMinEnergy} must be at least wakeCost ${p.wakeCost}`);
      }
      if (id === 'E03' && p.entryMinEnergy !== undefined && p.prepareCost !== undefined && p.entryMinEnergy < p.prepareCost) {
        err(modules.files[id]!, 'params.entryMinEnergy', `entryMinEnergy ${p.entryMinEnergy} must be at least prepareCost ${p.prepareCost}`);
      }
    });
    m.enabledMaterials.forEach((id, i) => {
      const mat = materials.map[id];
      if (mat === undefined) return err(mf, `enabledMaterials.${i}`, `unknown material "${id}"`);
      if (mat.phase > m.buildPhase) err(mf, `enabledMaterials.${i}`, `"${id}" belongs to phase ${mat.phase} (build phase ${m.buildPhase})`);
      // Habitat paint (CT §5.1; P2.7): the simulation implements these targets; shade paint's dose is
      // the one light factor it applies, so its three doses must agree and lie in (0, 1].
      if (mat.kind === 'paint') {
        const file = materials.files[id]!;
        if (!(PAINT_TARGETS as readonly string[]).includes(mat.target))
          err(file, 'target', `enabled paint "${id}" targets "${mat.target}", which the simulation does not implement (${PAINT_TARGETS.join(', ')})`);
        if (mat.target === 'shade' && (mat.doses.some((d) => d !== mat.doses[0]) || !(mat.doses[0]! > 0 && mat.doses[0]! <= 1)))
          err(file, 'doses', 'shade paint needs one light factor in (0, 1], the same at every dose');
        if (mat.target !== 'shade' && mat.doses.some((d) => d !== 0)) err(file, 'doses', 'substrate paint adds nothing: doses must be 0');
      }
    });
    // Structures (ARCH §2; CT §4; P2.7): known, shipped by this phase, and implemented by the simulation.
    // Phase 5: S01–S12 count as implemented once listed in IMPLEMENTED_STRUCTURES (the systems flip,
    // D-0104; tests may skip this one check with allowUnimplemented, as for abilities), have their CT §4
    // kind (checked for every record above) and need their systems.
    const cellStructures: readonly string[] = Object.values(STRUCTURE_RECORD_IDS);
    (m.enabledStructures ?? []).forEach((id, i) => {
      const st = structures.map[id];
      if (st === undefined) return err(mf, `enabledStructures.${i}`, `unknown structure "${id}"`);
      if (st.phase > m.buildPhase) err(mf, `enabledStructures.${i}`, `"${id}" belongs to phase ${st.phase} (build phase ${m.buildPhase})`);
      if (expectedStructureKind(id) === undefined) return err(mf, `enabledStructures.${i}`, `"${id}" is not a structure the simulation knows`);
      if (!allowUnimplemented && !cellStructures.includes(id) && !IMPLEMENTED_STRUCTURES.includes(id))
        err(mf, `enabledStructures.${i}`, `"${id}" is not implemented by the simulation yet`);
      for (const sys of STRUCTURE_SYSTEM_NEEDS[id] ?? []) {
        if (!m.enabledSystems.includes(sys)) err(mf, `enabledStructures.${i}`, `enabled structure "${id}" (${st.name}) needs the "${sys}" system (not in enabledSystems)`);
      }
    });
    // Phase 5 (P5.2, P5.4): a shipped habitat's placed structures and climate settings need what they use.
    const rules = rulesOfManifest(m);
    for (const id of m.enabledHabitats) {
      const h = habitats.map[id];
      if (h === undefined || h.phase > m.buildPhase) continue;
      const file = habitats.files[id]!;
      const before = issues.length;
      for (const p of structurePlacementProblems(h, null, rules)) if (!issues.some((x) => x.file === file && x.path === p.path && x.message === p.message)) err(file, p.path, p.message);
      // P5.4 (g5-briefs H4; D-0128): the one offer rule (habitatRules.ts), unless the checks above already
      // reported what it would (no duplicate messages).
      if (issues.length === before) {
        const offer = habitatOfferIssue(h, m);
        if (offer !== null) err(file, offer.path, offer.message);
      }
      const community = communityOfferProblem(h, m, species.map);
      if (community !== null) err(file, 'suggestedCommunity', community);
    }
    m.enabledHabitats.forEach((id, i) => {
      const h = habitats.map[id];
      if (h === undefined) err(mf, `enabledHabitats.${i}`, `unknown habitat "${id}"`);
      else if (h.phase > m.buildPhase) err(mf, `enabledHabitats.${i}`, `"${id}" belongs to phase ${h.phase} (build phase ${m.buildPhase})`);
    });
    // Recipes shipped in this build must only use enabled content.
    for (const id of recipes.ids) {
      const r = recipes.map[id]!;
      if (r.phase > m.buildPhase) continue;
      const file = recipes.files[id]!;
      if (!m.enabledHabitats.includes(r.habitatId)) err(file, 'habitatId', `habitat "${r.habitatId}" is not enabled in this build`);
      const rhc = habitats.map[r.habitatId];
      if (r.community === true && rhc?.suggestedCommunity !== undefined) {
        const problem = communityOfferProblem(rhc, m, species.map);
        if (problem !== null) err(file, 'community', problem);
      }
      // Phase 5: its placed structures (with its habitat's) and its own light cycle or drying need what
      // they use (a habitat's own are reported on the habitat; a geometry problem only once).
      const h = habitats.map[r.habitatId];
      if (h) {
        const found = [
          ...(recipeTouchesStructures(h, r) ? structurePlacementProblems(h, r, rules, 'placement') : []),
          ...(r.lightMode !== undefined || r.drying !== undefined ? structurePlacementProblems(h, r, rules, 'climate') : []),
        ];
        for (const p of found) if (!issues.some((x) => x.file === file && x.path === p.path && x.message === p.message)) err(file, p.path, p.message);
      }
      r.founders.forEach((f, i) => {
        if (!m.enabledSpecies.includes(f.species)) err(file, `founders.${i}.species`, `"${f.species}" is not enabled in this build`);
        f.modules.forEach((mod) => {
          if (!m.enabledModules.includes(mod)) err(file, `founders.${i}.modules`, `"${mod}" is not enabled in this build`);
        });
      });
    }
    // What if? variants shipped in this build need their capabilities and a shipped source (SPEC §13.3),
    // and the sheet offers at most three changed choices per source (UX §3.4).
    const whatIf: Record<string, string[]> = {};
    for (const id of variants.ids) {
      const v = variants.map[id]!;
      if (v.phase > m.buildPhase) continue;
      const file = variants.files[id]!;
      v.requiredCapabilities.forEach((c, i) => {
        if (!m.enabledSystems.includes(c)) err(file, `requiredCapabilities.${i}`, `"${c}" is not enabled in this build`);
      });
      const src = recipes.map[v.sourceId];
      if (src !== undefined && src.phase > m.buildPhase) err(file, 'sourceId', `source recipe "${v.sourceId}" belongs to phase ${src.phase} (build phase ${m.buildPhase})`);
      if (v.patch.kind !== 'none') (whatIf[v.sourceId] ??= []).push(id);
    }
    for (const sourceId of Object.keys(whatIf).sort()) {
      const list = whatIf[sourceId]!;
      list.slice(MAX_WHAT_IF_CHOICES).forEach((id) =>
        err(variants.files[id]!, 'sourceId', `${sourceId} already has ${MAX_WHAT_IF_CHOICES} What if? choices (${list.slice(0, MAX_WHAT_IF_CHOICES).join(', ')})`),
      );
    }
    // Systems (Phase 3 foundation): an enabled species, material or module needs the systems it uses.
    const hasSystem = (sys: SystemFlag) => m.enabledSystems.includes(sys);
    m.enabledSpecies.forEach((id, i) => {
      const s = species.map[id];
      if (s === undefined) return;
      for (const [sys, why] of speciesSystemNeeds(s)) {
        if (!hasSystem(sys)) err(mf, `enabledSpecies.${i}`, `enabled species "${id}" uses ${why}, which needs the "${sys}" system (not in enabledSystems)`);
      }
    });
    m.enabledMaterials.forEach((id, i) => {
      const mat = materials.map[id];
      if (mat === undefined) return;
      const sys = materialSystemNeed(mat);
      if (sys !== null && !hasSystem(sys)) err(mf, `enabledMaterials.${i}`, `enabled material "${id}" (${mat.kind} ${mat.target}) needs the "${sys}" system (not in enabledSystems)`);
    });
    m.enabledModules.forEach((id, i) => {
      const sys = MODULE_SYSTEM_NEEDS[id];
      if (sys !== undefined && !hasSystem(sys)) err(mf, `enabledModules.${i}`, `enabled module "${id}" needs the "${sys}" system (not in enabledSystems)`);
    });
    // P3.8 (UX §5.7; src/sim/content/guideRules.ts): the Field Guide text of everything this manifest enables.
    issues.push(
      ...guideProblems({
        manifest: m,
        species,
        materials,
        modules,
        habitats,
        structures,
        tools,
      }),
    );
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
    structures: structures.map,
    structureIds: structures.ids,
    recipes: recipes.map,
    recipeIds: recipes.ids,
    experiments: experiments.map,
    experimentIds: experiments.ids,
    variants: variants.map,
    variantIds: variants.ids,
    objectives: objectives.map,
    objectiveIds: objectives.ids,
    tools: tools.map,
    toolIds: tools.ids,
  };
  return { registry, issues };
}

/**
 * Modules that use a system (CT §7): E01 and E09 secrete enzymes, E10 builds film; Phase 5 (D-0043's
 * carry-over): E02 emits and reads the glow signal, E11 binds silicate into its jacket.
 */
export const MODULE_SYSTEM_NEEDS: Readonly<Record<string, SystemFlag>> = { E01: 'enzymes', E09: 'enzymes', E10: 'film', E02: 'signals', E11: 'silicate' };

/** Moved to structureRules.ts (wave 14: habitatRules.ts shares it without importing the registry); re-exported here unchanged. */
export { speciesSystemNeeds };

/**
 * A native ability that works only through another one the species must also list, or null (wave 10
 * lead ruling): RESTING_DAUGHTER places the newborn Resting under the species' own DORMANCY rules
 * (births.ts startRestingNewborn throws without them). The validator and the save import both use it.
 */
export function nativeAbilityPairingProblem(s: Pick<Species, 'nativeAbilities'>): string | null {
  if (s.nativeAbilities.includes('RESTING_DAUGHTER') && !s.nativeAbilities.includes('DORMANCY')) {
    return 'lists RESTING_DAUGHTER without DORMANCY: a resting daughter rests by the dormancy rules, so a species with RESTING_DAUGHTER must also list DORMANCY';
  }
  return null;
}

/**
 * The system a material uses: its target field's system for field, deposit, activity and viral
 * materials (null for 'core'), 'foodObjects' for objects (M10, M11); paint and structures use none.
 */
export function materialSystemNeed(mat: MaterialDef): SystemFlag | null {
  if (mat.kind === 'object') return 'foodObjects';
  if (mat.kind === 'field' || mat.kind === 'deposit' || mat.kind === 'activity' || mat.kind === 'viral') {
    if (!isFieldId(mat.target)) return null;
    const sys = FIELD_DEFS[mat.target].system;
    return sys === 'core' ? null : sys;
  }
  return null;
}

/** Validate and throw a ContentError on any error. */
export function buildRegistry(raw: RawPacks): ContentRegistry {
  const res = validateContent(raw);
  if (res.registry === null) throw new ContentError(res.issues);
  return res.registry;
}
