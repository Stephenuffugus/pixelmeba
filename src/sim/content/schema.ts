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

/**
 * A structure or device (ARCH §2 structures/*.json; CT §4). Its behaviour is implemented by the
 * simulation and keyed by its ID, like a module (STONE, WALL and BEAD are the cell structures in
 * src/sim/grid.ts STRUCTURE_RECORD_IDS); the record carries what the game shows about it and when it
 * ships. Unknown IDs, and enabled records the simulation does not implement, are errors.
 */
export const StructureSchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  name: z.string().min(1).max(40),
  kind: z.enum(['cell', 'edge', 'furnishing', 'device']),
  guide: GuideSchema,
  iconId: z.string().regex(/^[a-z0-9_]+$/),
  phase: PhaseSchema,
});
export type StructureDef = z.infer<typeof StructureSchema>;

/**
 * A player tool's Field Guide and Lab tray text (P3.8; D-0039; content/tools/*.json): a Structure-style
 * record plus what the tool changes, does not change and what to watch for. Tools are behaviour of the
 * game, not of a world: a tool record is enabled when its phase ≤ the build phase (no manifest list),
 * and no world records it, so saves never carry or re-validate it. `where` and `dose` are the Lab
 * tray's "Where" and "Dose" lines for tools the tray offers; in `dose`, "{fraction}" is replaced with
 * the chosen amount.
 */
export const ToolSchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  name: z.string().min(1).max(40),
  guide: GuideSchema,
  changes: z.string().min(1),
  doesNotChange: z.string().min(1),
  watchFor: z.string().min(1),
  where: z.string().min(1).optional(),
  dose: z.string().min(1).optional(),
  /**
   * Phase 5 (D-0107; PROPOSED DECISION in the wave 8b structure-content report): a tool that works only
   * in a dish whose rules include this system (the wetting brush needs 'climate'). enabledToolIds drops
   * it while the manifest lacks the system, so the Field Guide never lists a tool the dish cannot use.
   */
  requiresSystem: SystemFlagSchema.optional(),
  phase: PhaseSchema,
});
export type ToolDef = z.infer<typeof ToolSchema>;

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

const gridCoord = int.min(0).max(127);

/**
 * Phase 5 (P5.2, P5.4; CT §4; SPEC §2.4): edge barriers a habitat or recipe places, as an inclusive cell
 * rectangle: every cell (x, y) with x0 ≤ x ≤ x1 and y0 ≤ y ≤ y1 gets the barrier on its R edge (to x + 1)
 * or its D edge (to y + 1). `open` is the shutter's state (S03 only; absent = Closed); `flow` the
 * channel's direction (S04 only, required: +1 = from the cell to its neighbour). Placed by
 * src/sim/recipes.ts recipeStructures after all cell geometry; the store rules (src/sim/barriers.ts
 * edgeStoreProblem) refuse a rim edge, two barriers on one edge and more than 512.
 */
export const EdgePlacementSchema = z
  .object({
    structure: z.enum(['S01', 'S02', 'S03', 'S04']),
    dir: z.enum(['R', 'D']),
    x0: gridCoord,
    y0: gridCoord,
    x1: gridCoord,
    y1: gridCoord,
    open: z.boolean().optional(),
    flow: z.union([z.literal(1), z.literal(-1)]).optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.x0 > e.x1 || e.y0 > e.y1) ctx.addIssue({ code: 'custom', path: ['x1'], message: 'edge rectangle must have x0 ≤ x1 and y0 ≤ y1' });
    if (e.open !== undefined && e.structure !== 'S03') ctx.addIssue({ code: 'custom', path: ['open'], message: 'only a shutter gate (S03) is open or closed' });
    if (e.structure === 'S04' && e.flow === undefined) ctx.addIssue({ code: 'custom', path: ['flow'], message: 'a one-way channel (S04) needs its direction (1 or -1)' });
    if (e.flow !== undefined && e.structure !== 'S04') ctx.addIssue({ code: 'custom', path: ['flow'], message: 'only a one-way channel (S04) has a direction' });
  });
export type EdgePlacement = z.infer<typeof EdgePlacementSchema>;

/**
 * Phase 5: one furnishing or device a habitat or recipe places on cell `at` (CT §4). `on` only for the
 * heater and cooler (S09, S10; absent = Off: SPEC §10.4 "devices start Off"); `resinSelect` only for the
 * adsorption resin (S08; absent = [] = Off), sorted and unique. The store rules (src/sim/devices.ts
 * deviceStoreProblem) refuse a stone, wall or bead cell, two on one cell and more than 256.
 */
export const DevicePlacementSchema = z
  .object({
    structure: z.enum(['S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12']),
    at: z.tuple([gridCoord, gridCoord]),
    on: z.boolean().optional(),
    resinSelect: z.array(z.enum(['inhBact', 'inhFung', 'inhPhoto', 'rival'])).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.on !== undefined && d.structure !== 'S09' && d.structure !== 'S10') ctx.addIssue({ code: 'custom', path: ['on'], message: 'only a heater (S09) or a cooler (S10) is switched on or off' });
    if (d.resinSelect !== undefined && d.structure !== 'S08') ctx.addIssue({ code: 'custom', path: ['resinSelect'], message: 'only an adsorption resin (S08) has a selection' });
  });
export type DevicePlacement = z.infer<typeof DevicePlacementSchema>;

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
  /** Phase 5: edge barriers placed after all cell geometry (optional, no default: older records parse unchanged). */
  edges: z.array(EdgePlacementSchema).optional(),
  /** Phase 5: furnishings and devices placed after all cell geometry (optional, no default). */
  devices: z.array(DevicePlacementSchema).optional(),
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
  /**
   * P3.9 (W5-12): how the group's cells are chosen among the eligible cells of its disk (inside the
   * dish, occupiable, not taken by an earlier group). 'nearest' (absent = nearest; D-0005, D-0022): distance,
   * then y, then x. 'scatter' (D04 §8 "scatter uniformly among valid patch cells using the recipe
   * seed"): the first `count` of detPermutation(eligible, seed, 'founder.place', group index), eligible
   * cells taken row-major. Never a repeated cell.
   */
  placement: z.enum(['nearest', 'scatter']).optional(),
  /**
   * P3.9: explicit cells, one per member in member order (length = count); each inside the dish and the
   * group's disk, distinct, and occupiable by the species, else the recipe is refused. Overrides `placement`.
   */
  cells: z.array(z.tuple([int.min(0).max(127), int.min(0).max(127)])).optional(),
  /**
   * P3.9 (W5-13): a labelled setup ("labelled setup", never a test-only override): per member in member
   * order (length = count), the founder's starting biomass B, bound nutrient N and energy E instead of
   * the ordinary b0, 0.10 × b0 and 50. The B and N difference is logged as an external input
   * ('recipe:<id>:initial'); energy is not a material and goes to the energy ledger.
   */
  initial: z
    .array(z.object({ B: pos.optional(), N: nonneg.optional(), E: nonneg.optional() }).strict())
    .optional(),
  /**
   * P3.9: 'chain' links each member to the next in member order with a transport link (SPEC §7.7), for a
   * group of a TRANSPORT_LINKS species whose listed `cells` are four-neighbours in order.
   */
  links: z.literal('chain').optional(),
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
  /**
   * P3.9 (W5-11): geometry ops the recipe paints after its habitat's own ops, under the same rules
   * (structure cells hold no inventory; one geometryVersion bump), before background overrides,
   * patches and founders. recipeGrid() includes them, so previews and What if? see the same grid.
   */
  ops: z.array(GeometryOpSchema).default([]),
  /**
   * Phase 5: edge barriers and furnishings or devices the recipe places after its habitat's own, on the
   * final grid (habitat and recipe ops), before background overrides, patches and founders. Optional
   * with no default, so every earlier recipe parses and exports byte-identically.
   */
  edges: z.array(EdgePlacementSchema).optional(),
  devices: z.array(DevicePlacementSchema).optional(),
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

/**
 * A command an experiment or recipe applies through the ordinary command path (SPEC §3.2, §13.2):
 * the same payload a player's completed gesture produces (src/sim/commands.ts CommandPayload).
 */
export const ExperimentCommandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inoculate'), speciesId: SpeciesIdSchema, x: finite, y: finite, radius: nonneg, count: int.min(1) }).strict(),
  z
    .object({ kind: z.literal('deposit'), materialId: z.string().min(1), points: z.array(cell).min(1), radius: nonneg, dose: nonneg })
    .strict(),
  z.object({ kind: z.literal('setLid'), lid: z.enum(['open', 'closed']) }).strict(),
  z.object({ kind: z.literal('setMutationPreset'), preset: MutationPreset }).strict(),
]);
export type ExperimentCommand = z.infer<typeof ExperimentCommandSchema>;

/**
 * The one declared difference between the two arms of a paired experiment (SPEC §13.2, §13.4). Arm A
 * is the recipe as written; arm B receives the change. 'omitPatch' and 'shade' are part of B's setup
 * before tick 0 (shade paint multiplies light by 0.1 over the whole dish, CT §6 SHADE); 'commands' are
 * applied to B through the command path at `atSecond`, after both arms were duplicated from one state.
 */
export const ExperimentChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('omitPatch'), patchIndex: int.min(0) }).strict(),
  /** B is realized without these recipe scheduled commands (indexes into recipe.scheduledCommands; P2.5 Experiment C). */
  z.object({ kind: z.literal('omitScheduled'), indexes: z.array(int.min(0)).min(1) }).strict(),
  z.object({ kind: z.literal('shade'), factor: z.literal(0.1) }).strict(),
  z.object({ kind: z.literal('commands'), atSecond: nonneg, commands: z.array(ExperimentCommandSchema).min(1) }).strict(),
  /**
   * P3.6 (E203): B is realized without this recipe founder group. Only the LAST group is accepted, so
   * every earlier group keeps arm A's cells and birthIds (founders are placed group by group).
   */
  z.object({ kind: z.literal('omitFounders'), founderIndex: int.min(0) }).strict(),
]);
export type ExperimentChange = z.infer<typeof ExperimentChangeSchema>;

/** Completion behavior (SPEC §13.2): a journal stamp is recorded and the world keeps running. */
export const ExperimentCompletionSchema = z.object({
  journalStamp: z.string().min(1),
  /** The in-app half of the completion evidence (CT §10.1), checked by the card UI, not by fixtures. */
  playerSteps: z
    .array(
      z.enum([
        'inspectFoodUse',
        'openResourceHistory',
        'viewComparison',
        'viewPreyHistory',
        // P3.9 (W5-14; CT §10.1): "both species inspected with different O2 limitations", "B01 infection observed".
        'inspectOxygenLimits',
        'observeInfection',
      ]),
    )
    .default([]),
  worldKeepsRunning: z.literal(true).default(true),
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
  /** Applied, structured form of the suggested intervention (the `intervention` text describes it). */
  change: ExperimentChangeSchema.default({ kind: 'none' }),
  completion: ExperimentCompletionSchema,
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
  /**
   * P4.4 (SPEC §13.5; CT §10.5; D09 §6): the goal's player texts. `summary` is the choice line; the
   * one dismissible sentence is `completedText` on completion and `endedText` when the attempt ends
   * (required for a predicate that can end, src/sim/objectives.ts). "{time}" is replaced by the dish
   * time (m:ss) of that moment.
   */
  summary: z.string().min(1),
  completedText: z.string().min(1),
  endedText: z.string().min(1).optional(),
  /** Recipe ids whose dishes offer this goal; a What if? variant dish counts through its sourceId. */
  offerOn: z.array(z.string().min(1)).default([]),
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
  /**
   * Structure records the Lab may place (P2.7; content/structures). Optional: a world recorded before
   * structures were content has none, so its Lab offers no structure tools and the simulation refuses
   * structure edits there (its recorded ruleset is kept).
   */
  enabledStructures: z.array(z.string()).optional(),
  developmentalEnabled: z.boolean().default(false),
});
export type Manifest = z.infer<typeof ManifestSchema>;
