/**
 * Content schemas (ARCH §4). The same schemas validate packs at build time, at world creation,
 * and inside imported saves. Every ID is stable and saved in files: never rename.
 */
import { z } from 'zod';
import { FIELD_IDS, SYSTEM_FLAGS } from '../fields';

const finite = z.number().refine(Number.isFinite, 'must be finite');
const nonneg = finite.refine((n) => n >= 0, 'must be ≥ 0');
const pos = finite.refine((n) => n > 0, 'must be > 0');
const unit = finite.refine((n) => n >= 0 && n <= 1, 'must be within 0–1');
const int = z.number().int();
const range = z
  .tuple([finite, finite])
  .refine(([a, b]) => a <= b, 'range must be [min, max] with min ≤ max');
const cell = z.tuple([finite, finite]);

export const SpeciesIdSchema = z.string().regex(/^[BYFAPXV][0-9]{2}$/, 'species id like B01');
export const ModuleIdSchema = z.string().regex(/^E[0-9]{2}$/, 'module id like E05');
export const FieldIdSchema = z.enum(FIELD_IDS);
export const SystemFlagSchema = z.enum(SYSTEM_FLAGS);
export const PhaseSchema = int.min(0).max(7);

export const HabitatKind = z.enum(['water', 'gel', 'sediment']);
export const SurfaceKind = z.enum(['gel', 'sediment', 'stoneEdge', 'bead', 'mesh']);
export const FoodKind = z.enum(['sugar', 'starch', 'oil', 'protein', 'broth', 'detritus', 'metabolite', 'film']);
export type Food = z.infer<typeof FoodKind>;
export const TransportClass = z.enum(['small', 'medium', 'large', 'fixed', 'viral']);
export const Category = z.enum(['bacterium', 'yeast', 'fungus', 'alga', 'consumer', 'parasite', 'virus']);
export const Metabolism = z.enum(['aerobic', 'anaerobic', 'photosynthesis', 'mixotroph', 'hostDrain', 'viral']);

/** Native abilities implemented by named sim modules (never executable content). */
export const NativeAbility = z.enum([
  'E_STARCH_SECRETION',
  'E_OIL_SECRETION',
  'E_PROTEIN_SECRETION',
  'BIOFILM',
  'DORMANCY',
  'SIGNAL_GLOW',
  'RIVALRY',
  'TRAP',
  'TRANSPORT_LINKS',
  'BRANCHING',
  'RESTING_DAUGHTER',
  'SHELL',
  'CANOPY',
  'MIXOTROPHY',
  'HOST_DRAIN',
  'LYSIS',
  'RADIUS_CAPTURE',
  'HANDLING',
  'OXYGEN_SUPPRESSED',
  'LOW_LIGHT_CURVE',
  'DETRITUS_FALLBACK',
  'SEDIMENT_WATER_CROSSING',
  'PREDATION',
]);
export type NativeAbilityId = z.infer<typeof NativeAbility>;

export const GuideSchema = z.object({
  summary: z.string().min(1),
  biology: z.string().min(1),
  rules: z.string().min(1),
  example: z.string().min(1),
});

export const PreySchema = z.object({
  id: SpeciesIdSchema,
  requires: z.enum(['any', 'free', 'inSediment']).default('any'),
  contactSeconds: nonneg.optional(),
});

export const SpeciesSchema = z.object({
  id: SpeciesIdSchema,
  name: z.string().min(1).max(40),
  category: Category,
  transportClass: TransportClass,
  b0: pos,
  intakeRate: nonneg,
  maintenanceRate: nonneg,
  minDivisionAge: nonneg,
  maxAge: pos,
  speed: nonneg,
  sensingRadius: int.min(0).max(6),
  attackCooldown: nonneg,
  habitats: z.array(HabitatKind),
  attachment: z.object({ surfaces: z.array(SurfaceKind).min(1) }).nullable(),
  metabolism: Metabolism,
  energyPerCarbon: nonneg,
  acidPerCarbon: nonneg.default(0),
  foodPriority: z.array(FoodKind),
  digestsFilm: z.boolean().default(false),
  prey: z.array(PreySchema).default([]),
  hostIds: z.array(SpeciesIdSchema).default([]),
  drainRate: nonneg.default(0),
  tolerances: z.object({ ph: range, warmth: range, salinity: range, moisture: range }),
  nativeAbilities: z.array(NativeAbility).default([]),
  lociActive: z.array(z.boolean()).length(8),
  frameSize: z.union([z.literal(16), z.literal(32), z.literal(48)]),
  headings: z.union([z.literal(1), z.literal(4)]),
  assetId: z.string().regex(/^[a-z0-9_]+$/),
  guide: GuideSchema,
  phase: PhaseSchema,
});
export type Species = z.infer<typeof SpeciesSchema>;

export const MaterialSchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  name: z.string().min(1),
  kind: z.enum(['field', 'deposit', 'activity', 'viral', 'object', 'paint', 'structure']),
  target: z.string().min(1),
  doses: z.array(nonneg).length(3),
  defaultDoseIndex: int.min(0).max(2).default(1),
  companionNutrientPerCarbon: nonneg.default(0),
  guide: GuideSchema,
  iconId: z.string().regex(/^[a-z0-9_]+$/),
  phase: PhaseSchema,
});
export type MaterialDef = z.infer<typeof MaterialSchema>;

export const ModuleSchema = z.object({
  id: ModuleIdSchema,
  name: z.string().min(1),
  eligibleAncestors: z.array(SpeciesIdSchema).min(1),
  nativeEquivalents: z.array(SpeciesIdSchema).default([]),
  excludes: z.array(ModuleIdSchema).default([]),
  requires: z.array(ModuleIdSchema).default([]),
  surchargePerSecond: nonneg,
  params: z.record(z.string(), finite).default({}),
  visualLayer: z.string().regex(/^[a-z0-9_]+$/),
  guide: GuideSchema,
  phase: PhaseSchema,
});
export type ModuleDef = z.infer<typeof ModuleSchema>;

const FieldValues = z.partialRecord(FieldIdSchema, nonneg);

export const GeometryOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('disk'),
    center: cell,
    radius: nonneg,
    substrate: z.enum(['water', 'gel', 'sediment', 'stone', 'wall', 'bead']).optional(),
    fields: FieldValues.optional(),
    light: unit.optional(),
  }),
  z.object({
    op: z.literal('rect'),
    x0: int,
    x1: int,
    y0: int,
    y1: int,
    substrate: z.enum(['water', 'gel', 'sediment', 'stone', 'wall', 'bead']).optional(),
    fields: FieldValues.optional(),
    light: unit.optional(),
  }),
]);
export type GeometryOp = z.infer<typeof GeometryOpSchema>;

export const HabitatSchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  name: z.string().min(1),
  baseSubstrate: HabitatKind,
  baseLight: unit,
  warmth: unit,
  baseFields: FieldValues,
  ops: z.array(GeometryOpSchema).default([]),
  lid: z.enum(['open', 'closed']).default('open'),
  lightMode: z.enum(['fixed', 'cycle']).default('fixed'),
  drying: z.boolean().default(false),
  guide: GuideSchema,
  phase: PhaseSchema,
});
export type HabitatDef = z.infer<typeof HabitatSchema>;

export const MutationPreset = z.enum(['standard', 'accelerated', 'fixed']);
export const FounderMode = z.enum(['identical', 'varied', 'diverse']);

export const FieldPatchSchema = z.object({
  center: cell,
  radius: nonneg,
  substrate: HabitatKind.default('water'),
  add: FieldValues.default({}),
  set: FieldValues.default({}),
  label: z.string().optional(),
});
export type FieldPatch = z.infer<typeof FieldPatchSchema>;

export const FounderSchema = z.object({
  species: SpeciesIdSchema,
  count: int.min(1),
  center: cell,
  radius: nonneg,
  modules: z.array(ModuleIdSchema).default([]),
  /** Explicit per-founder module assignment: 'all' | 'alternate-odd' | 'alternate-even'. */
  moduleAssignment: z.enum(['all', 'alternate-odd', 'alternate-even']).default('all'),
  label: z.string().optional(),
});

export const TestOverrideSchema = z.object({
  description: z.string().min(1),
  target: z.string(),
  values: z.record(z.string(), finite),
});

export const ScheduledCommandSchema = z.object({
  atSecond: nonneg,
  kind: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  label: z.string().min(1),
});

export const RecipeSchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  revision: int.min(1),
  name: z.string().min(1),
  habitatId: z.string().min(1),
  seed: int.min(0),
  lid: z.enum(['open', 'closed']).optional(),
  lightMode: z.enum(['fixed', 'cycle']).optional(),
  drying: z.boolean().optional(),
  removeStones: z.boolean().default(false),
  baseLight: unit.optional(),
  mutationPreset: MutationPreset,
  founderMode: FounderMode,
  backgroundOverrides: FieldValues.default({}),
  fieldPatches: z.array(FieldPatchSchema).default([]),
  founders: z.array(FounderSchema).default([]),
  scheduledCommands: z.array(ScheduledCommandSchema).default([]),
  testOnlyOverrides: z.array(TestOverrideSchema).default([]),
  labels: z.array(z.string()).default([]),
  question: z.string().optional(),
  expectedObservationsText: z.string().default(''),
  phase: PhaseSchema,
});
export type RecipeDef = z.infer<typeof RecipeSchema>;

export const PredicateSchema = z.object({
  type: z.enum(['keepSpeciesAlive', 'biomassThreshold', 'transferAcrossGate', 'observeEvent', 'fieldInRange', 'custom']),
  params: z.record(z.string(), z.unknown()).default({}),
  durationSeconds: nonneg.optional(),
});

export const ExperimentSchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  seed: int.min(0),
  title: z.string().min(1),
  question: z.string().min(1),
  recipeId: z.string().min(1),
  intervention: z.string().optional(),
  predictedTradeoff: z.string().default(''),
  measurements: z.array(z.string()).default([]),
  stoppingSeconds: nonneg,
  confounds: z.string().default(''),
  gate: PredicateSchema,
  paired: z.boolean().default(false),
  phase: PhaseSchema,
});
export type ExperimentDef = z.infer<typeof ExperimentSchema>;

export const VariantSchema = z.object({
  id: z.string().regex(/^R-[A-Z][0-9]$/),
  revision: int.min(1),
  sourceId: z.string().min(1),
  sourceRevision: int.min(1),
  requiredCapabilities: z.array(SystemFlagSchema).default([]),
  title: z.string().min(1),
  question: z.string().min(1),
  patch: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }),
    z.object({ kind: z.literal('patchSet'), patchIndex: int.min(0), field: FieldIdSchema, value: nonneg }),
    z.object({ kind: z.literal('patchMove'), patchIndex: int.min(0), center: cell }),
    z.object({ kind: z.literal('deviceState'), deviceIndex: int.min(0), enabled: z.boolean() }),
  ]),
  previewDifference: z.string().min(1),
  objectiveId: z.string().optional(),
  phase: PhaseSchema,
});
export type VariantDef = z.infer<typeof VariantSchema>;

export const ObjectiveSchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  title: z.string().min(1),
  predicate: PredicateSchema,
  phase: PhaseSchema,
});
export type ObjectiveDef = z.infer<typeof ObjectiveSchema>;

export const LocusSchema = z.object({
  index: int.min(0).max(7),
  id: z.enum(['motility', 'feeding', 'sensing', 'division', 'phShift', 'salinityShift', 'warmthShift', 'dormancy']),
  name: z.string().min(1),
  descriptorLow: z.string().min(1),
  descriptorHigh: z.string().min(1),
});
export const LociSchema = z.object({ loci: z.array(LocusSchema).length(8) });

export const ManifestSchema = z.object({
  simulationVersion: z.literal(3),
  evolutionRulesVersion: int.min(1),
  moduleRegistryVersion: int.min(1),
  phenotypeMappingVersion: int.min(1),
  contentVersion: int.min(1),
  contentHash: z.string(),
  buildPhase: PhaseSchema,
  enabledSpecies: z.array(SpeciesIdSchema),
  enabledModules: z.array(ModuleIdSchema),
  enabledSystems: z.array(SystemFlagSchema),
  enabledMaterials: z.array(z.string()),
  enabledHabitats: z.array(z.string()),
  developmentalEnabled: z.boolean().default(false),
});
export type Manifest = z.infer<typeof ManifestSchema>;
