/**
 * The G3 "every catalog relationship" matrix (BUILD_DIRECTIVE "G3 gate — evidence"; SPEC §17; D01
 * Phase 3 "Every catalog relationship has a data-backed fixture").
 *
 *   npx tsx tools/relationship-matrix.ts [--registry shipped|phase5] [--out docs/reports/relationships-g3.md]
 *
 * Runs every row below and writes the generated table (row, expected, observed, pass, row counts) that
 * g3-evidence copies into EXPANSION_RESPONSE. tests/fixtures/relationship-matrix.test.ts runs the same
 * rows (runMatrix) and fails on any row whose observation disagrees with its expectation.
 *
 * Expectations come from the design documents, never from the content JSON (tests/helpers/tables.ts
 * parses CT §1.1, §3.1–§3.5, §5.1–§5.2, §7.1 and SPEC §5.3), so a content record that drifts from the
 * catalog fails here. Observations come from the simulation's own stages on one tiny deterministic
 * world per row (the shipped registry: every enabled species, material and module):
 *
 *  - diets: each species (and each E08 carrier) × every field food, film and photosynthesis, with only
 *    that food in its cell: stage 6 intake > 0 exactly for the foods CT §3.1 lists (film for the film
 *    digesters of CT §3.1 "(+film)" and §3.5, eaten as detritus, D-0038); zero for everything else;
 *  - prey: each enabled predator × every organism species, on the prey's home ground, on sediment
 *    (species that live there) and, for E04-eligible prey, really anchored beside a stone (an E04
 *    anchor keeps a carrier "free", D-0055): one stage 5 pass captures exactly when CT §3.2 allows;
 *  - hosts: X01 × every species (one stage 5 pass attaches iff CT §3.3) and V01 × every species (1000
 *    units in its cell, up to 10 stage 5 passes, infects iff CT §3.3);
 *  - inhibitors: each enabled inhibitor material × every species: one stage 7 pass deals inhibitor
 *    damage iff CT §3.4 targets it;
 *  - enzymes: each enzyme material × each substrate: one stage 3 pass converts only its own substrate
 *    into SPEC §5.3's product at exactly 0.10 × activity × dt with proportional N; the breaker divides
 *    it by (1 + breaker);
 *  - producers: SPEC §5.3's native producers and E01/E09 carriers × each substrate: one stage 8 pass
 *    sets exactly their own PRODUCER_BIT and raises only their own activity;
 *  - modules: each enabled module × each enabled species: a gain is legal (validateModuleSet and
 *    eligibleGains agree) iff CT §7.1 lists the species and it does not hold the ability natively;
 *  - materials: each enabled material through its tray command changes exactly the field (or grid
 *    layer, or object store) CT §5.1/§5.2 names; food objects then release at CT's rates.
 *
 * Phase 5 (wave 13, relmatrix; g5-briefs RELMATRIX, R14; g5-plan lead call 4). The same families reach the
 * Phase 5 species, modules and materials whenever a registry enables them, plus four families of their own:
 *
 *  - handling: P10 × each CT §3.2 prey held in contact (positions pinned between ticks): no capture before
 *    the k-th consecutive contact tick and a capture on it (k = seconds / dt from "P05 requires 4 s
 *    continuous contact; others 1 s", and 1 + 3c for an E11-jacketed prey, CT §12.5); a contact broken at
 *    k − 1 leaves no capture and no progress, and the next attempt again needs k ticks;
 *  - radius: P06 × each species at a centre distance of 0.9 in the next cell captures iff CT §3.2 lists it
 *    "within 1 cell", never at 1.0001; every other predator × its listed prey at 0.9 never captures;
 *  - traps: an armed F03 × each species in its own cell holds iff CT §3.3 ("traps P04 only"); a P04 in the
 *    next cell is not held; a held P04 is released after the CT §12.5 hold and the trap then waits the
 *    cooldown before it holds again;
 *  - growth: the CT §1.2 "+ silicate" shell builders gain nothing (SILICATE_LIMITED) without silicate and
 *    bind CT §12.3's 0.10 mineral per new biomass with it; every other organism grows the same with or
 *    without silicate and binds none; E11 carriers bind jacket mineral from silicate only, never from grit.
 *
 * Phase 5 rows inside the older families: A04 in each mode (CT §3.1 light bounds), A03's low-light curve
 * (CT §1.2 "light/0.30"), P09 holding a meal, F03 while draining, the A05 note of CT §3.2, X02's drain
 * and its refusal of a resting F04 daughter, V02's film gate (and V01/V02 disjoint), the RIVAL row (an M08
 * field) and B13's own secretion trigger, and the M02/M06/M07/M08/M12 materials. A species is set up on
 * its home ground: an attached species on a surface CT §1.3 lists (P06 in water beside a stone), in the
 * CT §2 tolerance group's pH and salinity when the default chemistry lies outside them, with silicate for
 * a shell builder. A row a v1.0 subject never had is emitted only when its Phase 5 subject is enabled, so
 * the shipped run's rows are exactly the v1.0 rows until the organism flip enables them.
 *
 *   npx tsx tools/relationship-matrix.ts --registry phase5   → docs/reports/relationships-g5-preflip.md
 *
 * runs every row under `phase5Registry()` (the shipped manifest plus every Phase 5 species, E02, E11, the
 * Phase 5 materials and the signals, rivalry and silicate systems; a TEST registry before the organism
 * flip, D-0104). After the flip the default (shipped) run covers the same rows.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchorSupported } from '../src/sim/anchor';
import { applyNow, introduceOrganism } from '../src/sim/commands';
import { DT, GRID_W } from '../src/sim/constants';
import type { ContentRegistry } from '../src/sim/content/registry';
import { stageContacts } from '../src/sim/contacts';
import { stageConversion } from '../src/sim/conversion';
import { FLAG, LIFE_ACTIVE, LIFE_RESTING } from '../src/sim/entities';
import { FIELD_DEFS, FIELD_IDS, type FieldId, type SystemFlag } from '../src/sim/fields';
import { cellIndex, maskCells, SUB_GEL, SUB_SEDIMENT, SUB_WATER, SUBSTRATE_CODES } from '../src/sim/grid';
import { stageBirths } from '../src/sim/births';
import { stageIntake } from '../src/sim/intake';
import { stageMaintenance } from '../src/sim/maintenance';
import { updateMode } from '../src/sim/mixotrophy';
import { eligibleGains, validateModuleSet } from '../src/sim/modules';
import { profileOf } from '../src/sim/profiles';
import { R } from '../src/sim/reasons';
import { PRODUCER_BIT } from '../src/sim/secretion';
import { rebuildIndex } from '../src/sim/spatial';
import { stageStructures } from '../src/sim/structures';
import { suitabilityAt } from '../src/sim/suitability';
import { step } from '../src/sim/tick';
import { updateDerived } from '../src/sim/transport';
import { speciesIndex, type World } from '../src/sim/world';
import { REPO_ROOT } from './lib/content-fs';
import {
  dietTable,
  enzymeRules,
  expandIds,
  filmDigesters,
  gritDissolvePerSecond,
  handlingRules,
  hostTable,
  identityTable,
  inhibitorTable,
  materialTable,
  metabolismTable,
  moduleTable,
  preyOnlyNotes,
  preyTable,
  rivalRules,
  silicatePerBiomass,
  toleranceTable,
  trapRules,
  type DietMode,
  type HostRow,
  type PreyOnlyNote,
  type PreyRequirement,
  type ToleranceRow,
} from '../tests/helpers/tables';
import { registryWith, type ManifestPatch } from '../tests/helpers/registry';
import { clearWater, rebaseLedger, registry, setField } from '../tests/helpers/world';

export type Family = 'diets' | 'prey' | 'hosts' | 'inhibitors' | 'enzymes' | 'producers' | 'modules' | 'materials' | 'handling' | 'radius' | 'traps' | 'growth';
/** The G3 (v1.0) families: the shipped run before the organism flip has rows in exactly these. */
export const V1_FAMILIES: readonly Family[] = ['diets', 'prey', 'hosts', 'inhibitors', 'enzymes', 'producers', 'modules', 'materials'];
/** The Phase 5 families (wave 13, relmatrix): rows only under a registry enabling their subjects. */
export const P5_FAMILIES: readonly Family[] = ['handling', 'radius', 'traps', 'growth'];
export const FAMILIES: readonly Family[] = [...V1_FAMILIES, ...P5_FAMILIES];

// ---- Registries ------------------------------------------------------------------------------------

const sortedUnion = <T extends string>(a: readonly T[], b: readonly T[]): T[] => [...a, ...b].filter((x, i, all) => all.indexOf(x) === i).sort();

/** The systems the Phase 5 organisms need beyond the shipped ones (CT §1.1 roles; registry speciesSystemNeeds). */
export const P5_SYSTEMS: readonly SystemFlag[] = ['rivalry', 'signals', 'silicate'];

/**
 * The manifest patch of the Phase 5 test registry: the shipped lists plus every CT §1.1 Phase 5 species, the
 * CT §7.1 Phase 5 modules (E02, E11), the CT §5.2 Phase 5 materials (M02, M06, M07, M08, M12) and the
 * signals, rivalry and silicate systems; deduped and sorted.
 */
export function p5Lists(shipped: ContentRegistry['manifest'] = registry().manifest): Required<Pick<ManifestPatch, 'enabledSpecies' | 'enabledModules' | 'enabledMaterials' | 'enabledSystems'>> {
  return {
    enabledSpecies: sortedUnion(shipped.enabledSpecies, identityTable().filter((r) => r.phase === 5).map((r) => r.id)),
    enabledModules: sortedUnion(shipped.enabledModules, moduleTable().filter((r) => r.phase === 5).map((r) => r.id)),
    enabledMaterials: sortedUnion(shipped.enabledMaterials, materialTable().filter((r) => r.phase === 5).map((r) => r.id)),
    enabledSystems: sortedUnion<SystemFlag>(shipped.enabledSystems, P5_SYSTEMS),
  };
}

/** p5Lists() of the shipped manifest. */
export const P5_LISTS = Object.freeze(p5Lists());

/**
 * The Phase 5 test registry (before the organism flip, D-0104): registryWith(P5_LISTS) with allowUnimplemented,
 * because TRAP (F03) joins IMPLEMENTED_NATIVE_ABILITIES at the wave 13 integration and E02/E11 join
 * IMPLEMENTED_MODULES at the organism flip (both appended by the lead). Cached by registryWith.
 */
export function phase5Registry(): ContentRegistry {
  return registryWith(P5_LISTS, { allowUnimplemented: true });
}

export interface MatrixRow {
  readonly family: Family;
  /** Stable row id, e.g. "B04 × film". */
  readonly row: string;
  readonly expected: string;
  readonly observed: string;
  readonly pass: boolean;
  /** Where the expectation comes from. */
  readonly source: string;
}

export interface MatrixResult {
  readonly rows: readonly MatrixRow[];
  /** Relationships the catalog names whose subject this build's manifest does not enable. */
  readonly skipped: readonly string[];
  readonly ms: number;
}

/** The world's cell for every row: (64, 64), well inside the dish. */
const X = 64;
const Y = 64;
const CELL = cellIndex(X, Y);

/** Every carbon pool a row can offer, plus the companions; zeroed before a row sets its own. */
const FOOD_FIELDS: readonly FieldId[] = ['sugar', 'starch', 'oil', 'protein', 'broth', 'detritus', 'metabolite', 'film'];
const ZEROED: readonly FieldId[] = [...FOOD_FIELDS, 'sugarN', 'starchN', 'oilN', 'proteinN', 'brothN', 'detritusN', 'filmN', 'co2', 'v01'];
/** Phase 5 pools a row sets itself (absent in a world without their system, so a no-op there). */
const ZEROED_P5: readonly FieldId[] = ['v02', 'silicate', 'grit', 'rival', 'sGlow', 'quencher'];

// ---- Worlds ----------------------------------------------------------------------------------------

/** Clear water with no food, CO2 or phage anywhere, 0.5 free nutrient, ledger re-based. */
function bare(reg: ContentRegistry): World {
  const w = clearWater({}, reg);
  for (const id of ZEROED) w.fields[id]?.fill(0);
  for (const id of ZEROED_P5) w.fields[id]?.fill(0);
  const nut = w.fields.nutrient!;
  for (const k of maskCells()) nut[k] = 0.5;
  updateDerived(w);
  rebaseLedger(w);
  return w;
}

function setGround(w: World, cell: number, code: number): void {
  if (w.grid.substrate[cell] === code) return;
  w.grid.substrate[cell] = code;
  w.grid.geometryVersion++;
  updateDerived(w);
}

/**
 * A species' home ground: for an attached species (CT §1.1 "(attached)") gel when its surfaces include gel
 * (B02, B13, F01, F02, F04), else sediment (F03), else water (P06, which needs a stone edge: prepareHome);
 * sediment for a sediment-only species, water otherwise.
 */
function homeGround(reg: ContentRegistry, id: string, attached: ReadonlySet<string>): number {
  const habitats = reg.species[id]!.habitats;
  if (attached.has(id)) {
    const surfaces = reg.species[id]!.attachment?.surfaces ?? ['gel'];
    return surfaces.includes('gel') ? SUB_GEL : surfaces.includes('sediment') ? SUB_SEDIMENT : SUB_WATER;
  }
  if (!habitats.includes('water')) return habitats.includes('gel') ? SUB_GEL : SUB_SEDIMENT;
  return SUB_WATER;
}

/** A stone (the Lab command) whose footprint covers the cell west of `cell`, making `cell` a stone edge. */
function stoneWest(w: World, cell: number): void {
  const x = cell % GRID_W;
  const y = (cell - x) / GRID_W;
  applyNow(w, 'matrix-stone', { kind: 'placeStructure', structure: 'stone', points: [[x - 1.5, y + 0.5]], radius: 1 });
}

/**
 * The CT §2 tolerance group's chemistry in `cell` where the default lies outside it (B10 salt, B11 acid):
 * the middle of the group's salinity and pH ranges. A no-op for every species whose range holds the default.
 */
function homeChemistry(w: World, o: Oracle, id: string, cell: number): void {
  const t = o.tolerance.get(id);
  if (!t) return;
  let changed = false;
  const salt = w.fields.salt![cell]!;
  if (salt < t.salinity[0] || salt > t.salinity[1]) {
    setField(w, 'salt', cell, (t.salinity[0] + t.salinity[1]) / 2);
    changed = true;
  }
  const ph = w.derived.ph[cell]!;
  if (ph < t.ph[0] || ph > t.ph[1]) {
    // pH = 7 + (base − acid) / (1 + buffer) (CT §12.2): the base − acid that gives the middle of the range.
    const d = ((t.ph[0] + t.ph[1]) / 2 - 7) * (1 + w.fields.buffer![cell]!);
    if (d < 0) setField(w, 'acid', cell, w.fields.base![cell]! - d);
    else setField(w, 'base', cell, w.fields.acid![cell]! + d);
    changed = true;
  }
  if (changed) updateDerived(w);
}

/** A species' home in `cell`: its ground, a stone edge for one attached in water (P06), its tolerance group's chemistry. */
function prepareHome(w: World, reg: ContentRegistry, o: Oracle, id: string, cell: number): void {
  const ground = homeGround(reg, id, o.attached);
  setGround(w, cell, ground);
  if (ground === SUB_WATER && o.attached.has(id)) stoneWest(w, cell);
  homeChemistry(w, o, id, cell);
}

/** Set a world's light baseline in `cell` and recompute derived light (the low-light and mixotroph rows). */
function setLight(w: World, cell: number, light: number): void {
  w.grid.lightBase[cell] = light;
  w.grid.geometryVersion++;
  updateDerived(w);
}

/** Test state with its material logged as an input (tests/helpers/world.ts place does the same). */
function setState(w: World, slot: number, state: Partial<Record<'B' | 'N' | 'mealC' | 'mealN' | 'jacketMineral', number>>): void {
  const c = w.ents.cols;
  for (const key of ['B', 'N', 'mealC', 'mealN', 'jacketMineral'] as const) {
    const v = state[key];
    if (v === undefined) continue;
    const delta = v - c[key][slot]!;
    if (key === 'B' || key === 'mealC') w.ledger.inputs.c += delta;
    else if (key === 'jacketMineral') w.ledger.inputs.m += delta;
    else w.ledger.inputs.n += delta;
    c[key][slot] = v;
  }
}

/** Place one organism (optionally carrying modules) at an exact position; material overrides logged. */
function put(w: World, id: string, x: number, y: number, modules: readonly string[] = [], E?: number): number {
  const slot = introduceOrganism(w, speciesIndex(w, id), cellIndex(Math.floor(x), Math.floor(y)), 'matrix', { modules, exactCenter: true });
  if (slot < 0) throw new Error(`matrix: cannot place ${id}`);
  const c = w.ents.cols;
  c.x[slot] = x;
  c.y[slot] = y;
  if (E !== undefined) c.E[slot] = E; // test state: energy is not material
  rebuildIndex(w);
  return slot;
}

/** Stage 4's suitability for one organism in its cell, written to its column (what stage 6 reads). */
function settle(w: World, slot: number): number {
  const c = w.ents.cols;
  const sp = w.species[c.species[slot]!]!;
  const v = suitabilityAt(w, sp, profileOf(w, slot), cellIndex(Math.floor(c.x[slot]!), Math.floor(c.y[slot]!))).value;
  c.suitability[slot] = v;
  return v;
}

function companion(id: FieldId): FieldId | undefined {
  return FIELD_DEFS[id].companion;
}

// ---- Expectations from the documents ---------------------------------------------------------------

interface Oracle {
  readonly diets: ReadonlyMap<string, { foods: readonly string[]; film: boolean; photosynthesis: boolean; modes: readonly DietMode[]; whenNoMeal: boolean }>;
  readonly e08: readonly string[];
  readonly filmDigesters: readonly string[];
  readonly prey: ReadonlyMap<string, Readonly<Record<string, PreyRequirement>>>;
  readonly hosts: ReadonlyMap<string, readonly string[]>;
  readonly inhibitors: ReadonlyMap<string, readonly string[]>;
  readonly attached: ReadonlySet<string>;
  readonly modules: ReadonlyMap<string, { eligible: readonly string[]; notNative: readonly string[]; name: string }>;
  readonly enzymes: ReturnType<typeof enzymeRules>;
  // Phase 5 (wave 13, relmatrix).
  /** CT §1.1 phase 5 species. */
  readonly phase5: ReadonlySet<string>;
  /** CT §3.2 "requires N s continuous contact": predator → prey → seconds. */
  readonly contact: ReadonlyMap<string, Readonly<Record<string, number>>>;
  /** CT §3.2 "within N cell": predator → cells. */
  readonly within: ReadonlyMap<string, number>;
  readonly preyOnly: readonly PreyOnlyNote[];
  readonly hostRows: ReadonlyMap<string, HostRow>;
  readonly roles: ReadonlyMap<string, string>;
  readonly tolerance: ReadonlyMap<string, ToleranceRow>;
  /** CT §1.2 "+ silicate". */
  readonly shell: ReadonlySet<string>;
  /** CT §1.2 "(light/0.30)": species → saturating light. */
  readonly lowLight: ReadonlyMap<string, number>;
  readonly handlingRules: ReturnType<typeof handlingRules>;
  readonly trap: ReturnType<typeof trapRules>;
  readonly rival: ReturnType<typeof rivalRules>;
  readonly silicatePerBiomass: number;
  readonly gritPerSecond: number;
}

function oracle(): Oracle {
  const diets = new Map<string, { foods: readonly string[]; film: boolean; photosynthesis: boolean; modes: readonly DietMode[]; whenNoMeal: boolean }>();
  let e08: readonly string[] = [];
  for (const d of dietTable()) {
    if (d.id === 'E08') e08 = d.foods;
    else diets.set(d.id, { foods: d.foods, film: d.film, photosynthesis: d.photosynthesis, modes: d.modes, whenNoMeal: d.whenNoMeal });
  }
  const preyRows = preyTable();
  const tolerance = new Map<string, ToleranceRow>();
  for (const t of toleranceTable()) for (const id of t.members) tolerance.set(id, t);
  const metabolism = metabolismTable();
  return {
    diets,
    e08,
    filmDigesters: filmDigesters(),
    prey: new Map(preyTable().map((p) => [p.id, p.prey])),
    hosts: new Map(hostTable().map((h) => [h.id, h.targets])),
    inhibitors: new Map(inhibitorTable().map((r) => [r.field, r.targets])),
    attached: new Set(identityTable().filter((r) => r.attached).map((r) => r.id)),
    modules: new Map(moduleTable().map((m) => [m.id, { eligible: m.eligible, notNative: m.notNative, name: m.name }])),
    enzymes: enzymeRules(),
    phase5: new Set(identityTable().filter((r) => r.phase === 5).map((r) => r.id)),
    contact: new Map(preyRows.filter((p) => Object.keys(p.contactSeconds).length > 0).map((p) => [p.id, p.contactSeconds])),
    within: new Map(preyRows.filter((p) => p.withinCells !== null).map((p) => [p.id, p.withinCells!])),
    preyOnly: preyOnlyNotes(),
    hostRows: new Map(hostTable().map((h) => [h.id, h])),
    roles: new Map(identityTable().map((r) => [r.id, r.role])),
    tolerance,
    shell: new Set(metabolism.filter((m) => m.shell).map((m) => m.id)),
    lowLight: new Map(metabolism.filter((m) => m.lightSaturation !== null).map((m) => [m.id, m.lightSaturation!])),
    handlingRules: handlingRules(),
    trap: trapRules(),
    rival: rivalRules(),
    silicatePerBiomass: silicatePerBiomass(),
    gritPerSecond: gritDissolvePerSecond(),
  };
}

// ---- Families --------------------------------------------------------------------------------------

type Food = (typeof FOOD_FIELDS)[number] | 'photosynthesis';
const DIET_FOODS: readonly Food[] = [...FOOD_FIELDS, 'photosynthesis'];

/**
 * One diet row: only `food` in the organism's cell; the carbon stage 6 took from it in three passes. A shell
 * builder (CT §1.2 "+ silicate") also gets silicate; `light`, when given, is the cell's light, and a
 * mixotroph takes its mode from it through stage 4's own update (mixotrophy.ts updateMode).
 */
function dietObservation(reg: ContentRegistry, o: Oracle, id: string, food: Food, modules: readonly string[], light?: number): { took: number; suit: number } {
  const w = bare(reg);
  prepareHome(w, reg, o, id, CELL);
  if (light !== undefined) setLight(w, CELL, light);
  const s = put(w, id, X + 0.5, Y + 0.5, modules);
  if (o.shell.has(id)) setField(w, 'silicate', CELL, 0.5);
  if (w.species[speciesIndex(w, id)]!.mixotroph) updateMode(w, s, CELL);
  const pool: FieldId = food === 'photosynthesis' ? 'co2' : food;
  setField(w, pool, CELL, food === 'film' ? 0.3 : 0.5);
  const comp = food === 'photosynthesis' ? undefined : companion(food);
  if (comp) setField(w, comp, CELL, food === 'film' ? 0.03 : 0.05);
  // A species oxygen suppresses (B03) gets the anoxic cell it lives in; nothing else changes.
  if (w.species[speciesIndex(w, id)]!.abilities.includes('OXYGEN_SUPPRESSED')) w.fields.oxygen![CELL] = 0;
  const suit = settle(w, s);
  const before = w.fields[pool]![CELL]!;
  const acc0 = w.ents.cols.intakeAccum[s]!;
  for (let t = 0; t < 3; t++) stageIntake(w);
  const took = before - w.fields[pool]![CELL]!;
  const accounted = w.ents.cols.intakeAccum[s]! - acc0;
  // Intake the organism recorded but no pool lost (or the reverse) would be free biomass: report it.
  if ((took > 0) !== (accounted > 0)) return { took: Number.NaN, suit };
  return { took, suit };
}

function diets(reg: ContentRegistry, o: Oracle, species: readonly string[], out: MatrixRow[]): void {
  const subjects: { id: string; modules: readonly string[] }[] = species.map((id) => ({ id, modules: [] }));
  // E08 carriers (CT §3.1 "E08 carriers detritus when no meal"): every enabled eligible ancestor.
  const e08 = o.modules.get('E08');
  if (e08 && reg.manifest.enabledModules.includes('E08')) for (const id of e08.eligible.filter((x) => species.includes(x))) subjects.push({ id, modules: ['E08'] });
  for (const { id, modules } of subjects) {
    const d = o.diets.get(id) ?? { foods: [], film: false, photosynthesis: false, modes: [], whenNoMeal: false };
    const foods = modules.includes('E08') ? [...d.foods, ...o.e08] : d.foods;
    if (d.modes.length > 0) {
      dietModes(reg, o, id, d.modes, out);
      continue;
    }
    for (const food of DIET_FOODS) {
      // Film: CT §3.1 "(+film)" or a CT §3.5 film digester (the parser test checks the two lists agree).
      const expected = food === 'photosynthesis' ? d.photosynthesis : food === 'film' ? d.film || o.filmDigesters.includes(id) : foods.includes(food);
      const { took, suit } = dietObservation(reg, o, id, food, modules);
      const label = modules.length ? `${id}+${modules.join('+')}` : id;
      const observed = Number.isNaN(took) ? 'intake and pool disagree' : suit <= 0 ? `unsuitable cell (${suit})` : took > 0 ? `took ${took.toPrecision(3)} C` : 'took nothing';
      out.push({
        family: 'diets',
        row: `${label} × ${food}`,
        expected: expected ? 'eats' : 'does not eat',
        observed,
        pass: suit > 0 && !Number.isNaN(took) && (took > 0) === expected,
        source: food === 'film' ? 'CT §3.1 (+film), §3.5' : 'CT §3.1',
      });
    }
  }
  dietsP5(reg, o, species, out);
}

/** Light 0.05 past a mode's CT §3.1 bound (A04: 0.40 for "light ≥ 0.35", 0.20 for "light ≤ 0.25"). */
function modeLight(m: DietMode): number {
  return Number((m.op === '≥' ? m.light + 0.05 : m.light - 0.05).toFixed(2));
}

/** A mixotroph (CT §3.1 light-qualified routes): in each mode's light, only that mode's route feeds. */
function dietModes(reg: ContentRegistry, o: Oracle, id: string, modes: readonly DietMode[], out: MatrixRow[]): void {
  for (const m of modes) {
    const light = modeLight(m);
    for (const food of DIET_FOODS) {
      const expected = food === m.food;
      const { took, suit } = dietObservation(reg, o, id, food, [], light);
      out.push({
        family: 'diets',
        row: `${id} (light ${light.toFixed(2)}) × ${food}`,
        expected: expected ? 'eats' : 'does not eat',
        observed: Number.isNaN(took) ? 'intake and pool disagree' : suit <= 0 ? `unsuitable cell (${suit})` : took > 0 ? `took ${took.toPrecision(3)} C` : 'took nothing',
        pass: suit > 0 && !Number.isNaN(took) && (took > 0) === expected,
        source: `CT §3.1 (${m.food} at light ${m.op} ${m.light})`,
      });
    }
  }
}

/** One stage 6 pass of a photosynthesizer at `light` with CO2 0.5 in its cell: the CO2 it took. */
function photoIntake(reg: ContentRegistry, o: Oracle, id: string, light: number): number {
  const w = bare(reg);
  prepareHome(w, reg, o, id, CELL);
  setLight(w, CELL, light);
  const s = put(w, id, X + 0.5, Y + 0.5);
  if (o.shell.has(id)) setField(w, 'silicate', CELL, 0.5);
  setField(w, 'co2', CELL, 0.5);
  settle(w, s);
  const before = w.fields.co2![CELL]!;
  stageIntake(w);
  return before - w.fields.co2![CELL]!;
}

/** Arm an F03 (one stage 8 with E 60 and B 1.5 B0', CT §12.5's arming conditions) in CELL; its slot, or −1. */
function armedTrap(w: World, trapper: string): number {
  const f = put(w, trapper, X + 0.3, Y + 0.5, [], 60);
  setState(w, f, { B: 1.5 * profileOf(w, f).b0 });
  stageStructures(w);
  return w.ents.cols.trapReserveC[f]! > 0 ? f : -1;
}

/** Phase 5 diet rows: A03's curve, P09 with a meal, F03 while draining (emitted only when their subjects are enabled). */
function dietsP5(reg: ContentRegistry, o: Oracle, species: readonly string[], out: MatrixRow[]): void {
  // A03 (CT §1.2 "photosynthesis (light/0.30)"): the CO2 request scales by min(1, light / 0.30); A01 by light.
  for (const [id, sat] of o.lowLight) {
    if (!species.includes(id)) continue;
    const ref = 0.9;
    const tookRef = photoIntake(reg, o, id, ref);
    for (const L of [sat / 2, sat, 2 * sat]) {
      const want = Math.min(1, L / sat) / Math.min(1, ref / sat);
      const ratio = photoIntake(reg, o, id, L) / tookRef;
      out.push({
        family: 'diets',
        row: `${id} × photosynthesis (light ${L.toFixed(2)})`,
        expected: `${want.toFixed(3)} of the light-${ref} intake (min(1, light/${sat}))`,
        observed: `${ratio.toFixed(6)} of the light-${ref} intake`,
        pass: tookRef > 0 && Math.abs(ratio - want) <= 1e-9,
        source: 'CT §1.2 (light/0.30)',
      });
    }
    // The linear response it differs from (SPEC §6.5): A01 at half the saturating light.
    if (species.includes('A01')) {
      const L = sat / 2;
      const ratio = photoIntake(reg, o, 'A01', L) / photoIntake(reg, o, 'A01', ref);
      out.push({
        family: 'diets',
        row: `A01 × photosynthesis (light ${L.toFixed(2)}; linear, beside ${id})`,
        expected: `${(L / ref).toFixed(3)} of the light-${ref} intake (light)`,
        observed: `${ratio.toFixed(6)} of the light-${ref} intake`,
        pass: Math.abs(ratio - L / ref) <= 1e-9,
        source: 'SPEC §6.5; CT §1.2',
      });
    }
  }
  // P09 (CT §3.1 "detritus when no meal"): holding a meal it digests the meal and takes no detritus.
  for (const [id, d] of o.diets) {
    if (!d.whenNoMeal || !species.includes(id)) continue;
    const w = bare(reg);
    prepareHome(w, reg, o, id, CELL);
    const s = put(w, id, X + 0.5, Y + 0.5);
    setState(w, s, { mealC: 0.5, mealN: 0.05 });
    setField(w, 'detritus', CELL, 0.5);
    setField(w, 'detritusN', CELL, 0.05);
    settle(w, s);
    const det0 = w.fields.detritus![CELL]!;
    stageIntake(w);
    const tookDet = det0 - w.fields.detritus![CELL]!;
    const tookMeal = 0.5 - w.ents.cols.mealC[s]!;
    out.push({
      family: 'diets',
      row: `${id} (holding a meal) × detritus`,
      expected: 'does not eat detritus; digests the meal',
      observed: `detritus ${tookDet > 0 ? `took ${tookDet.toPrecision(3)} C` : 'untouched'}; meal ${tookMeal > 0 ? `digested ${tookMeal.toPrecision(3)} C` : 'untouched'}`,
      pass: tookDet === 0 && tookMeal > 0,
      source: 'CT §3.1 (when no meal)',
    });
  }
  // F03 (SPEC §7.17 "While draining, F03 skips broth feeding"): holding a P04 it takes no broth.
  for (const [agent, h] of o.hostRows) {
    if (h.kind !== 'traps' || !species.includes(agent)) continue;
    const target = h.targets.find((t) => species.includes(t));
    if (!target) continue;
    const w = bare(reg);
    prepareHome(w, reg, o, agent, CELL);
    const f = armedTrap(w, agent);
    let observed = 'not armed';
    let pass = false;
    if (f >= 0) {
      const t = put(w, target, X + 0.7, Y + 0.5, [], 90);
      stageContacts(w);
      if (w.ents.cols.heldBySlot[t] !== f) observed = `${target} not held`;
      else {
        setField(w, 'broth', CELL, 0.5);
        setField(w, 'brothN', CELL, 0.05);
        settle(w, f);
        const acc0 = w.ents.cols.intakeAccum[f]!;
        stageIntake(w);
        const tookBroth = 0.5 - w.fields.broth![CELL]!;
        const drained = w.ents.cols.intakeAccum[f]! - acc0;
        observed = `broth ${tookBroth > 0 ? `took ${tookBroth.toPrecision(3)} C` : 'untouched'}; drained ${drained.toPrecision(3)} C from ${target}`;
        pass = tookBroth === 0 && drained > 0;
      }
    }
    out.push({ family: 'diets', row: `${agent} (holding a ${target}) × broth`, expected: `does not eat broth; drains the ${target}`, observed, pass, source: 'SPEC §7.17; CT §3.1, §12.5' });
  }
}

type PreyVariant = 'home' | 'sediment' | 'anchored' | 'attachedFlag';

/** One prey row: the predator hungry (E 50, no meal, cooldown 0) 0.3 cells from the prey; one stage 5 pass. */
function preyObservation(reg: ContentRegistry, o: Oracle, pred: string, prey: string, variant: PreyVariant): string {
  const w = bare(reg);
  let s: number;
  if (variant === 'anchored') {
    // A real E04 anchor beside a stone (the Lab command), fed its own CT §3.1 food so it stays put.
    applyNow(w, 'matrix-stone', { kind: 'placeStructure', structure: 'stone', points: [[40.5, 64.5]], radius: 1 });
    s = put(w, prey, 42.5, 64.5, ['E04'], 60);
    if (!anchorSupported(w, s)) return 'no support';
    const food = (o.diets.get(prey)?.foods[0] ?? 'sugar') as FieldId;
    for (let k = 0; k < 200 && w.ents.cols.anchorState[s] !== 1; k++) {
      setField(w, food, cellIndex(42, 64), 0.5);
      step(w);
    }
    if (w.ents.cols.anchorState[s] !== 1 || w.ents.cols.alive[s] !== 1) return 'never anchored';
  } else if (o.within.has(pred)) {
    // A radius predator (P06, CT §3.2 "within 1 cell") on its own home (water beside a stone); the prey in
    // the next cell east on its own ground, 0.6 cells away (beyond the 0.5 contact, within 1 cell).
    prepareHome(w, reg, o, pred, CELL);
    setGround(w, CELL + 1, variant === 'sediment' ? SUB_SEDIMENT : homeGround(reg, prey, o.attached));
    s = put(w, prey, X + 1.3, Y + 0.5);
    if (variant === 'attachedFlag') w.ents.cols.flags[s] = w.ents.cols.flags[s]! | FLAG.attached;
  } else {
    setGround(w, CELL, variant === 'sediment' ? SUB_SEDIMENT : homeGround(reg, prey, o.attached));
    s = put(w, prey, X + 0.8, Y + 0.5);
    // Labelled test state: the attached flag on a species that is never attached in a shipped dish, so
    // CT §3.2's "free" (which excludes attached) is exercised for the free-prey lists.
    if (variant === 'attachedFlag') w.ents.cols.flags[s] = w.ents.cols.flags[s]! | FLAG.attached;
  }
  const c = w.ents.cols;
  const gap = o.within.has(pred) && variant !== 'anchored' ? 0.6 : 0.3;
  const p = put(w, pred, c.x[s]! - gap, c.y[s]!, [], 50);
  c.attackCooldown[p] = 0;
  c.mealC[p] = 0;
  c.mealN[p] = 0;
  rebuildIndex(w);
  const birth = c.birthId[s]!;
  // A handler (P10, CT §3.2 "requires N s continuous contact") holds contact for its longest need and 0.5 s
  // more (positions do not move between stage 5 passes); every other predator gets one pass.
  const needs = Object.values(o.contact.get(pred) ?? {});
  const passes = needs.length > 0 ? Math.round(Math.max(...needs) / DT) + 5 : 1;
  for (let k = 0; k < passes && w.ents.refValid(s, birth); k++) {
    stageContacts(w);
    w.tick++;
  }
  return w.ents.refValid(s, birth) ? 'not captured' : c.mealC[p] > 0 ? 'captured' : 'removed without a meal';
}

function prey(reg: ContentRegistry, o: Oracle, species: readonly string[], out: MatrixRow[], skipped: string[]): void {
  const predators = [...o.prey.keys()].filter((p) => species.includes(p));
  for (const p of o.prey.keys()) if (!species.includes(p)) skipped.push(`prey: ${p} (predator not enabled)`);
  const e04 = o.modules.get('E04');
  const anchorable = reg.manifest.enabledModules.includes('E04') && e04 ? e04.eligible : [];
  for (const pred of predators) {
    const list = o.prey.get(pred)!;
    for (const preyId of species) {
      const variants: PreyVariant[] = ['home'];
      if (reg.species[preyId]!.habitats.includes('sediment') && homeGround(reg, preyId, o.attached) !== SUB_SEDIMENT) variants.push('sediment');
      if (anchorable.includes(preyId)) variants.push('anchored', 'attachedFlag');
      for (const variant of variants) {
        const req = list[preyId];
        const ground = variant === 'sediment' ? SUB_SEDIMENT : variant === 'anchored' ? SUB_WATER : homeGround(reg, preyId, o.attached);
        const attachedNow = o.attached.has(preyId) || variant === 'attachedFlag';
        const expected = req === undefined ? false : req === 'any' ? true : req === 'free' ? !attachedNow : ground === SUB_SEDIMENT;
        const observed = preyObservation(reg, o, pred, preyId, variant);
        const groundName = ground === SUB_SEDIMENT ? 'sediment' : ground === SUB_GEL ? 'gel' : 'water';
        out.push({
          family: 'prey',
          row: `${pred} × ${preyId} (${variant === 'anchored' ? 'E04-anchored, water' : variant === 'attachedFlag' ? 'attached flag, water' : groundName})`,
          expected: expected ? `captures (${req})` : 'does not capture',
          observed,
          pass: (observed === 'captured') === expected && observed !== 'removed without a meal' && observed !== 'never anchored' && observed !== 'no support',
          source: variant === 'anchored' ? 'CT §3.2; D-0055' : o.contact.has(pred) ? 'CT §3.2 (continuous contact)' : o.within.has(pred) ? 'CT §3.2 (within 1 cell)' : 'CT §3.2',
        });
      }
    }
  }
  // CT §3.2's notes ("A05 is prey only for P08"): the predators whose home-ground rows captured it.
  for (const note of o.preyOnly) {
    if (!species.includes(note.prey)) continue;
    const by = out.filter((r) => r.family === 'prey' && new RegExp(`^P[0-9]{2} × ${note.prey} \\(`).test(r.row) && r.observed === 'captured').map((r) => r.row.slice(0, 3));
    const want = note.predators.filter((p) => predators.includes(p));
    out.push({
      family: 'prey',
      row: `${note.prey} × every enabled predator`,
      expected: `captured only by ${want.join(', ')}`,
      observed: `captured by ${[...new Set(by)].join(', ') || 'none'}`,
      pass: [...new Set(by)].join(',') === want.join(','),
      source: 'CT §3.2 note',
    });
  }
}

function hosts(reg: ContentRegistry, o: Oracle, enabled: readonly string[], species: readonly string[], out: MatrixRow[], skipped: string[]): void {
  for (const [agent, targets] of o.hosts) {
    if (!enabled.includes(agent)) {
      skipped.push(`hosts: ${agent} (not enabled)`);
      continue;
    }
    const isVirus = reg.species[agent]!.category === 'virus';
    if (!isVirus && reg.species[agent]!.category !== 'parasite') {
      skipped.push(`hosts: ${agent} (trap; ${o.hostRows.get(agent)?.kind === 'traps' ? 'the traps family' : 'Phase 5'})`);
      continue;
    }
    // CT §3.3 "where film ≥ 0.10" (V02): every row of that agent has exactly that film in the target's cell.
    const minFilm = o.hostRows.get(agent)?.minFilm ?? null;
    for (const target of species) {
      if (target === agent && isVirus) continue;
      const observed = hostObservation(reg, o, agent, target, isVirus, minFilm);
      const expected = targets.includes(target);
      const verb = isVirus ? 'infected' : 'attached';
      out.push({
        family: 'hosts',
        row: `${agent} × ${target}`,
        expected: (expected ? verb : `not ${verb}`) + (minFilm !== null ? ` (film ${minFilm})` : ''),
        observed,
        pass: (observed === verb) === expected,
        source: minFilm !== null ? 'CT §3.3 (film ≥ 0.10)' : 'CT §3.3',
      });
    }
  }
  hostsP5(reg, o, enabled, out);
}

/** One host row: 1000 units (up to 10 stage 5 passes) for a virus, `film` in the cell when given; one stage 5 for a parasite. */
function hostObservation(reg: ContentRegistry, o: Oracle, agent: string, target: string, isVirus: boolean, film: number | null): string {
  const w = bare(reg);
  setGround(w, CELL, homeGround(reg, target, o.attached));
  const h = put(w, target, X + 0.5, Y + 0.5);
  const birth = w.ents.cols.birthId[h]!;
  if (isVirus) {
    if (film !== null) setField(w, 'film', CELL, film);
    setField(w, agent.toLowerCase() as FieldId, CELL, 1000);
    for (let k = 0; k < 10 && w.ents.cols.infectedBy[h] === 0; k++) {
      stageContacts(w);
      w.tick++;
    }
    return !w.ents.refValid(h, birth) ? 'host removed' : w.ents.cols.infectedBy[h] !== 0 ? 'infected' : 'not infected';
  }
  const x = put(w, agent, X + 0.6, Y + 0.5);
  stageContacts(w);
  return w.ents.cols.hostSlot[x] === h ? 'attached' : 'not attached';
}

/**
 * A real division of a CT §1.1 "resting daughters" species (F04): the parent at B 2.05 B0', E 80 and its
 * minimum division age on a 5 × 5 patch of its ground, one stage 9. Returns the world and both slots, or why not.
 */
function restingDaughter(reg: ContentRegistry, o: Oracle, id: string): { w: World; parent: number; daughter: number } | string {
  const w = bare(reg);
  const ground = homeGround(reg, id, o.attached);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setGround(w, cellIndex(X + dx, Y + dy), ground);
  const parent = put(w, id, X + 0.5, Y + 0.5, [], 80);
  setState(w, parent, { B: 2.05 * profileOf(w, parent).b0, N: 0.205 * profileOf(w, parent).b0 });
  w.ents.cols.age[parent] = reg.species[id]!.minDivisionAge + 1;
  stageBirths(w);
  const c = w.ents.cols;
  let daughter = -1;
  for (let i = 0; i < w.ents.highWater; i++) if (i !== parent && c.alive[i] === 1 && w.species[c.species[i]!]!.id === id) daughter = i;
  if (daughter < 0) return 'no division';
  if (c.lifeState[daughter] !== LIFE_RESTING) return `daughter not resting (life state ${c.lifeState[daughter]})`;
  if (c.lifeState[parent] !== LIFE_ACTIVE) return 'parent not active';
  return { w, parent, daughter };
}

/** Phase 5 host rows (emitted only when their subjects are enabled). */
function hostsP5(reg: ContentRegistry, o: Oracle, enabled: readonly string[], out: MatrixRow[]): void {
  const host = (row: string, expected: string, observed: string, pass: boolean, source: string) => out.push({ family: 'hosts', row, expected, observed, pass, source });
  for (const [agent, h] of o.hostRows) {
    if (!enabled.includes(agent) || !o.phase5.has(agent)) continue;
    // V02's film gate (CT §3.3 "where film ≥ 0.10"): half that film never infects its host; V01 never takes V02's host.
    if (h.kind === 'infects' && h.minFilm !== null) {
      for (const target of h.targets.filter((t) => enabled.includes(t))) {
        const low = h.minFilm / 2;
        const obs = hostObservation(reg, o, agent, target, true, low);
        host(`${agent} × ${target} (film ${low})`, 'not infected', obs, obs === 'not infected', 'CT §3.3 (film ≥ 0.10)');
        for (const [other, oh] of o.hostRows) {
          if (other === agent || oh.kind !== 'infects' || !enabled.includes(other) || oh.targets.includes(target)) continue;
          const o2 = hostObservation(reg, o, other, target, true, h.minFilm);
          host(`${other} × ${target} (film ${h.minFilm})`, 'not infected (disjoint pools)', o2, o2 === 'not infected', 'CT §3.3; SPEC §7.5 "Disjoint pools"');
        }
      }
    }
    if (h.kind !== 'attaches') continue;
    // The drain (CT §3.3 "drain 0.015 C/s"): one stage 6 takes drain × dt from the host, half becomes parasite body.
    const target = h.targets.find((t) => enabled.includes(t));
    if (target && h.drainPerSecond !== null) {
      const w = bare(reg);
      setGround(w, CELL, homeGround(reg, target, o.attached));
      const t = put(w, target, X + 0.5, Y + 0.5);
      const x = put(w, agent, X + 0.6, Y + 0.5);
      stageContacts(w);
      let observed = 'not attached';
      let pass = false;
      const want = h.drainPerSecond * DT;
      if (w.ents.cols.hostSlot[x] === t) {
        const hB = w.ents.cols.B[t]!;
        const xB = w.ents.cols.B[x]!;
        stageIntake(w);
        const lost = hB - w.ents.cols.B[t]!;
        const gained = w.ents.cols.B[x]! - xB;
        observed = `host −${lost.toPrecision(4)} C; ${agent} +${gained.toPrecision(4)} C`;
        pass = Math.abs(lost - want) <= 1e-15 && Math.abs(gained - 0.5 * lost) <= 1e-15;
      }
      host(`${agent} drain on ${target}`, `host −${want.toPrecision(4)} C per tick; half to ${agent}`, observed, pass, 'CT §3.3, §12.3 (host drain 50/30/20)');
    }
    // "never resting daughters" (CT §3.3): a real F04 division; the daughter rests, the parent stays active.
    if (/never resting daughters/.test(h.raw)) {
      for (const rester of h.targets.filter((t) => enabled.includes(t) && /resting daughter/.test(o.roles.get(t) ?? ''))) {
        const r = restingDaughter(reg, o, rester);
        if (typeof r === 'string') {
          host(`${agent} × ${rester} (resting daughter)`, 'not attached', r, false, 'CT §3.3; SPEC §7.4');
          continue;
        }
        const c = r.w.ents.cols;
        const dx = c.x[r.daughter]! - c.x[r.parent]!;
        const dy = c.y[r.daughter]! - c.y[r.parent]!;
        // The parasite on the daughter's centre: the active parent is out of contact (≥ 0.5 cells away).
        const x = put(r.w, agent, c.x[r.daughter]!, c.y[r.daughter]!);
        const far = Math.hypot(dx, dy) > 0.5;
        stageContacts(r.w);
        const obs = !far ? 'setup: parent within contact' : c.hostSlot[x] === r.daughter ? 'attached' : c.hostSlot[x] === r.parent ? 'attached to the parent' : 'not attached';
        host(`${agent} × ${rester} (resting daughter)`, 'not attached', obs, obs === 'not attached', 'CT §3.3; SPEC §7.4');
        // The same parasite beside the active parent attaches (the control).
        const r2 = restingDaughter(reg, o, rester);
        if (typeof r2 === 'string') continue;
        const c2 = r2.w.ents.cols;
        const x2 = put(r2.w, agent, c2.x[r2.parent]! + (c2.x[r2.parent]! - c2.x[r2.daughter]!) * 0.1, c2.y[r2.parent]! + (c2.y[r2.parent]! - c2.y[r2.daughter]!) * 0.1);
        stageContacts(r2.w);
        const obs2 = c2.hostSlot[x2] === r2.parent ? 'attached' : c2.hostSlot[x2] === r2.daughter ? 'attached to the daughter' : 'not attached';
        host(`${agent} × ${rester} (its active parent)`, 'attached', obs2, obs2 === 'attached', 'CT §3.3; SPEC §7.4');
      }
    }
  }
}

function inhibitors(reg: ContentRegistry, o: Oracle, species: readonly string[], out: MatrixRow[], skipped: string[]): void {
  const enabled = reg.manifest.enabledMaterials.map((id) => reg.materials[id]!);
  for (const [fieldName, targets] of o.inhibitors) {
    // By name ("Bacterial inhibitor"), or by the material the field's name cites ("RIVAL (B13 secretion / M08)").
    const mat = enabled.find((m) => m.name === fieldName || expandIds(fieldName).includes(m.id));
    if (!mat) {
      skipped.push(`inhibitors: ${fieldName} (no enabled material of that name)`);
      continue;
    }
    const fieldId = mat.target as FieldId;
    for (const id of species) {
      if (reg.species[id]!.category === 'virus') continue;
      const w = bare(reg);
      setGround(w, CELL, homeGround(reg, id, o.attached));
      const s = put(w, id, X + 0.5, Y + 0.5, [], 60);
      if (w.species[speciesIndex(w, id)]!.abilities.includes('OXYGEN_SUPPRESSED')) w.fields.oxygen![CELL] = 0;
      setField(w, fieldId, CELL, 0.5);
      settle(w, s);
      stageMaintenance(w);
      const dmg = w.ents.cols.dmgInhib[s]!;
      const expected = targets.includes(id);
      out.push({
        family: 'inhibitors',
        row: `${mat.id} × ${id}`,
        expected: expected ? 'harms' : 'no effect',
        observed: dmg > 0 ? `inhibitor damage ${dmg.toPrecision(3)}` : 'no inhibitor damage',
        pass: dmg > 0 === expected,
        source: 'CT §3.4',
      });
    }
  }
  secretorRows(reg, o, species, out);
}

/**
 * The RIVAL secretor of CT §3.4 ("RIVAL (B13 secretion / M08)"): one stage 8 with the secretor (E 60) on its
 * ground and one Active organism of each species in the next cell east secretes RIVAL (CT §12.6 rate × dt)
 * iff that species is a CT §3.4 RIVAL target; a target at the CT §12.6 radius still triggers it, one cell
 * beyond does not, and a Resting target (labelled test state: an E03 carrier set Resting) does not.
 */
function secretorRows(reg: ContentRegistry, o: Oracle, species: readonly string[], out: MatrixRow[]): void {
  const rivalField = [...o.inhibitors.keys()].find((f) => /^RIVAL/.test(f));
  if (!rivalField) return;
  const targets = o.inhibitors.get(rivalField)!;
  const secretors = expandIds(rivalField).filter((id) => species.includes(id));
  const want = o.rival.rate * DT;
  for (const b of secretors) {
    const observe = (target: string, cells: number, resting: boolean): { rival: number; text: string } => {
      const w = bare(reg);
      prepareHome(w, reg, o, b, CELL);
      const sec = put(w, b, X + 0.5, Y + 0.5, [], 60);
      const tc = cellIndex(X + cells, Y);
      prepareHome(w, reg, o, target, tc);
      // A Resting target carries E03 (CT §7.1 Resting stage) so the state is one it can hold.
      const t = put(w, target, X + cells + 0.5, Y + 0.5, resting ? ['E03'] : [], 60);
      if (resting) w.ents.cols.lifeState[t] = LIFE_RESTING;
      stageStructures(w);
      const r = w.fields.rival![CELL]!;
      const bit = (w.ents.cols.flags[sec]! & FLAG.secreting) !== 0;
      return { rival: r, text: r > 0 ? `RIVAL +${r.toPrecision(3)}${bit ? ' (secreting)' : ''}` : 'no RIVAL' };
    };
    for (const id of species) {
      if (reg.species[id]!.category === 'virus') continue;
      const ob = observe(id, 1, false);
      const expected = targets.includes(id);
      out.push({
        family: 'inhibitors',
        row: `${b} secretion × ${id} (Active, 1 cell)`,
        expected: expected ? `secretes RIVAL ${want.toPrecision(3)}` : 'no secretion',
        observed: ob.text,
        pass: expected ? Math.abs(ob.rival - want) <= 1e-15 : ob.rival === 0,
        source: 'CT §3.4, §12.6',
      });
    }
    const t0 = targets.find((t) => species.includes(t));
    if (!t0) continue;
    for (const [cells, resting, expected] of [
      [o.rival.radius, false, true],
      [o.rival.radius + 1, false, false],
      [1, true, false],
    ] as const) {
      const ob = observe(t0, cells, resting);
      out.push({
        family: 'inhibitors',
        row: `${b} secretion × ${t0} (${resting ? 'Resting' : 'Active'}, ${cells} cell${cells === 1 ? '' : 's'})`,
        expected: expected ? `secretes RIVAL ${want.toPrecision(3)}` : 'no secretion',
        observed: ob.text,
        pass: expected ? Math.abs(ob.rival - want) <= 1e-15 : ob.rival === 0,
        source: resting ? 'CT §12.6; SPEC §7.9 (an active target)' : 'CT §12.6 (targets within 2 cells)',
      });
    }
  }
}

/** CT §5.2 "E_STARCH"/"E_OIL"/"E_PROTEIN" → the substrate the activity converts (SPEC §5.3). */
function enzymeSubstrate(adds: string): string | null {
  const m = /^E_(STARCH|OIL|PROTEIN)$/.exec(adds.trim());
  return m ? m[1]!.toLowerCase() : null;
}

function enzymes(reg: ContentRegistry, o: Oracle, out: MatrixRow[]): void {
  const mats = materialTable().filter((m) => reg.manifest.enabledMaterials.includes(m.id) && enzymeSubstrate(m.adds) !== null);
  const substrates = Object.keys(o.enzymes.products);
  const breaker = reg.manifest.enabledMaterials.find((id) => /breaker/i.test(reg.materials[id]!.name)) ?? null;
  for (const mat of mats) {
    const own = enzymeSubstrate(mat.adds)!;
    const activity = reg.materials[mat.id]!.target as FieldId;
    for (const sub of [...substrates, ...(breaker ? ['breaker'] : [])]) {
      const subId = (sub === 'breaker' ? own : sub) as FieldId;
      const product = o.enzymes.products[subId]! as FieldId;
      const w = bare(reg);
      applyNow(w, 'matrix-enzyme', { kind: 'deposit', materialId: mat.id, points: [[X + 0.5, Y + 0.5]], radius: 1, dose: 0.5 });
      if (sub === 'breaker') applyNow(w, 'matrix-breaker', { kind: 'deposit', materialId: breaker!, points: [[X + 0.5, Y + 0.5]], radius: 1, dose: 1 });
      setField(w, subId, CELL, 0.5);
      setField(w, companion(subId)!, CELL, 0.05);
      const a = w.fields[activity]![CELL]!;
      const b = w.fields.breaker?.[CELL] ?? 0;
      const before = { s: w.fields[subId]![CELL]!, sN: w.fields[companion(subId)!]![CELL]!, p: w.fields[product]![CELL]! };
      const productN = companion(product) ?? 'nutrient';
      const pN0 = w.fields[productN]![CELL]!;
      stageConversion(w);
      const converted = before.s - w.fields[subId]![CELL]!;
      const made = w.fields[product]![CELL]! - before.p;
      const movedN = before.sN - w.fields[companion(subId)!]![CELL]!;
      const gotN = w.fields[productN]![CELL]! - pN0;
      const expectOwn = subId === own;
      const rate = (o.enzymes.rate * a) / (1 + b);
      const want = expectOwn ? Math.min(before.s, rate * DT) : 0;
      const exact = Math.abs(converted - want) <= 1e-15 && Math.abs(made - converted) <= 1e-15 && Math.abs(gotN - movedN) <= 1e-15 && Math.abs(movedN - (before.sN * converted) / before.s) <= 1e-15;
      out.push({
        family: 'enzymes',
        row: sub === 'breaker' ? `${mat.id} + ${breaker} (breaker ${b}) × ${subId}` : `${mat.id} × ${subId}`,
        expected: expectOwn ? `${subId}→${product} ${want.toPrecision(4)} C` : 'no conversion',
        observed: converted > 0 ? `${subId}→${product} ${converted.toPrecision(4)} C (N ${movedN.toPrecision(3)})` : 'no conversion',
        pass: exact && converted > 0 === expectOwn,
        source: sub === 'breaker' ? 'SPEC §5.3; CT §5.2 M09' : 'SPEC §5.3; CT §5.2',
      });
    }
  }
}

const SLOT_OF: Readonly<Record<string, 'starch' | 'oil' | 'protein'>> = { E_STARCH: 'starch', E_OIL: 'oil', E_PROTEIN: 'protein' };
const ACTIVITY_OF: Readonly<Record<'starch' | 'oil' | 'protein', FieldId>> = { starch: 'eStarch', oil: 'eOil', protein: 'eProtein' };

function producers(reg: ContentRegistry, o: Oracle, species: readonly string[], out: MatrixRow[], skipped: string[]): void {
  const subjects: { label: string; id: string; modules: readonly string[]; slot: 'starch' | 'oil' | 'protein' }[] = [];
  for (const [id, act] of Object.entries(o.enzymes.nativeProducers)) {
    if (!species.includes(id)) {
      skipped.push(`producers: ${id} (not enabled)`);
      continue;
    }
    subjects.push({ label: id, id, modules: [], slot: SLOT_OF[act]! });
  }
  for (const m of o.enzymes.producerModules) {
    const def = o.modules.get(m);
    const name = /^(Starch|Oil|Protein) release$/.exec(def?.name ?? '');
    if (!def || !name || !reg.manifest.enabledModules.includes(m)) {
      skipped.push(`producers: ${m} (not enabled or unnamed)`);
      continue;
    }
    // The first enabled eligible ancestor that produces nothing natively.
    const carrier = def.eligible.find((id) => species.includes(id) && o.enzymes.nativeProducers[id] === undefined);
    if (!carrier) continue;
    subjects.push({ label: `${carrier}+${m}`, id: carrier, modules: [m], slot: name[1]!.toLowerCase() as 'starch' | 'oil' | 'protein' });
  }
  for (const subj of subjects) {
    for (const sub of ['starch', 'oil', 'protein'] as const) {
      const w = bare(reg);
      setGround(w, CELL, homeGround(reg, subj.id, o.attached));
      const s = put(w, subj.id, X + 0.5, Y + 0.5, subj.modules, 60);
      setField(w, sub, CELL, 0.5);
      setField(w, companion(sub)!, CELL, 0.05);
      const before = (['starch', 'oil', 'protein'] as const).map((k) => w.fields[ACTIVITY_OF[k]]![CELL]!);
      stageStructures(w);
      const bits = w.ents.cols.secreting[s]!;
      const raised = (['starch', 'oil', 'protein'] as const).filter((k, j) => w.fields[ACTIVITY_OF[k]]![CELL]! > before[j]!);
      const expected = subj.slot === sub;
      const ok = expected ? bits === PRODUCER_BIT[sub] && raised.length === 1 && raised[0] === sub : bits === 0 && raised.length === 0;
      out.push({
        family: 'producers',
        row: `${subj.label} × ${sub} deposit`,
        expected: expected ? `releases ${ACTIVITY_OF[sub]} (bit ${PRODUCER_BIT[sub]})` : 'releases nothing',
        observed: bits === 0 && raised.length === 0 ? 'releases nothing' : `bits ${bits}; raised ${raised.map((k) => ACTIVITY_OF[k]).join(', ') || 'none'}`,
        pass: ok,
        source: subj.modules.length ? 'SPEC §5.3; CT §7.1' : 'SPEC §5.3',
      });
    }
  }
}

function modules(reg: ContentRegistry, o: Oracle, species: readonly string[], out: MatrixRow[]): void {
  const w = bare(reg);
  for (const m of reg.manifest.enabledModules) {
    const row = o.modules.get(m);
    for (const id of species) {
      const problem = validateModuleSet(w, id, [m]);
      const gains = eligibleGains(w, { ancestor: id, modules: [] }).includes(m);
      const expected = row !== undefined && row.eligible.includes(id) && !row.notNative.includes(id);
      const legal = problem === null;
      out.push({
        family: 'modules',
        row: `${m} × ${id}`,
        expected: expected ? 'gain possible' : 'gain refused',
        observed: legal === gains ? (legal ? 'gain possible' : `refused: ${problem}`) : `validate ${legal} but eligibleGains ${gains}`,
        pass: legal === gains && legal === expected,
        source: row?.notNative.includes(id) ? 'CT §7.1 (not native)' : 'CT §7.1',
      });
    }
  }
}

/**
 * CT §5.1 "Adds" / §5.2 "Effect" text → the field it names (a translation of the catalog's words, so a
 * content record whose target drifts from the words fails). Companion ratios come from the dose text.
 */
const ADDS_FIELD: Readonly<Record<string, FieldId>> = {
  'sugar C': 'sugar',
  'starch C': 'starch',
  'oil C': 'oil',
  'protein C': 'protein',
  'detritus C + 0.10 N per C': 'detritus',
  'free nutrient': 'nutrient',
  'metabolite C': 'metabolite',
  O2: 'oxygen',
  CO2: 'co2',
  'acid equivalent': 'acid',
  'base equivalent': 'base',
  'buffer capacity': 'buffer',
  salt: 'salt',
  'inhibitor (B01–B13)': 'inhBact',
  'inhibitor (Y, F)': 'inhFung',
  'inhibitor (A)': 'inhPhoto',
  E_STARCH: 'eStarch',
  E_OIL: 'eOil',
  E_PROTEIN: 'eProtein',
  'all enzyme effective activity / (1 + breaker)': 'breaker',
  'dissolved food for B08, Y02, F03': 'broth',
  // Phase 5 (CT §5.2).
  'dissolved; A02/P05 bind 0.10 per new biomass': 'silicate',
  S_GLOW: 'sGlow',
  'sensed signal / (1 + quencher)': 'quencher',
  'RIVAL (targets B01/B10/B11)': 'rival',
  'dissolves to M02 at 0.01 × remaining/s': 'grit',
};

function sumField(w: World, id: FieldId): number {
  const a = w.fields[id];
  if (!a) return 0;
  let s = 0;
  for (const k of maskCells()) s += a[k]!;
  return s;
}

function changedFields(w: World, before: ReadonlyMap<FieldId, number>): FieldId[] {
  return FIELD_IDS.filter((id) => w.fields[id] !== undefined && sumField(w, id) !== before.get(id));
}

function snapshotSums(w: World): Map<FieldId, number> {
  return new Map(FIELD_IDS.filter((id) => w.fields[id] !== undefined).map((id) => [id, sumField(w, id)]));
}

/**
 * Phase 5 material rows after the deposit in `w`: M12's grit dissolving into silicate at its CT rate over two
 * stage 3 passes (and CT §5.2 against §12.2), M02's binders against CT §1.2's shell builders, M08's targets
 * against CT §3.4's RIVAL row.
 */
function materialsP5(w: World, o: Oracle, id: string, adds: string, field: FieldId, table: ReadonlyMap<string, ReturnType<typeof materialTable>[number]>, out: MatrixRow[]): void {
  const mat = (row: string, expected: string, observed: string, pass: boolean, source: string) => out.push({ family: 'materials', row, expected, observed, pass, source });
  const dissolve = /^dissolves to (M[0-9]{2}) at ([0-9.]+) × remaining\/s$/.exec(adds);
  if (dissolve) {
    const into = ADDS_FIELD[table.get(dissolve[1]!)?.adds ?? ''];
    const rate = Number(dissolve[2]);
    const g0 = w.fields[field]![CELL]!;
    const s0 = into ? w.fields[into]![CELL]! : 0;
    stageConversion(w);
    const g1 = w.fields[field]![CELL]!;
    stageConversion(w);
    const g2 = w.fields[field]![CELL]!;
    const s2 = into ? w.fields[into]![CELL]! : Number.NaN;
    const want1 = g0 - g0 * rate * DT;
    const want2 = want1 - want1 * rate * DT;
    mat(
      `${id} dissolving (two stage 3 passes)`,
      `${field} ${want1.toPrecision(6)} then ${want2.toPrecision(6)}; ${into ?? '?'} +${(g0 - want2).toPrecision(4)}`,
      `${field} ${g1.toPrecision(6)} then ${g2.toPrecision(6)}; ${into ?? '?'} +${(s2 - s0).toPrecision(4)}`,
      into !== undefined && Math.abs(g1 - want1) <= 1e-15 && Math.abs(g2 - want2) <= 1e-15 && Math.abs(s2 - s0 - (g0 - g2)) <= 1e-15,
      `CT §5.2 ${id}; SPEC §5.2`,
    );
    mat(`${id} rate × CT §12.2`, `${o.gritPerSecond} × remaining/s (CT §12.2)`, `${rate} × remaining/s (CT §5.2)`, rate === o.gritPerSecond, 'CT §5.2, §12.2');
  }
  const binders = /^dissolved; ([A-Z0-9/]+) bind ([0-9.]+) per new biomass$/.exec(adds);
  if (binders) {
    const ids = expandIds(binders[1]!.replace(/\//g, ', '));
    const shell = [...o.shell].sort();
    mat(`${id} binders × CT §1.2`, `${shell.join(', ')} (CT §1.2 "+ silicate") bind ${o.silicatePerBiomass} (CT §12.3)`, `${ids.join(', ')} bind ${binders[2]}`, ids.join(',') === shell.join(',') && Number(binders[2]) === o.silicatePerBiomass, 'CT §5.2, §1.2, §12.3');
  }
  const targets = /^RIVAL \(targets ([A-Z0-9/]+)\)$/.exec(adds);
  if (targets) {
    const ids = expandIds(targets[1]!.replace(/\//g, ', '));
    const rival = [...o.inhibitors].find(([f]) => /^RIVAL/.test(f))?.[1] ?? [];
    mat(`${id} targets × CT §3.4`, `${rival.join(', ')} (CT §3.4 RIVAL)`, ids.join(', '), ids.join(',') === rival.join(','), 'CT §5.2, §3.4');
  }
}

function materials(reg: ContentRegistry, o: Oracle, out: MatrixRow[], skipped: string[]): void {
  const table = new Map(materialTable().map((m) => [m.id, m]));
  for (const id of reg.manifest.enabledMaterials) {
    const ct = table.get(id);
    if (!ct) {
      out.push({ family: 'materials', row: `${id}`, expected: 'a CT §5 row', observed: 'no CT §5.1/§5.2 row', pass: false, source: 'CT §5' });
      continue;
    }
    const w = bare(reg);
    const before = snapshotSums(w);
    let expected: string;
    let observed: string;
    let pass: boolean;
    if (ct.adds === 'substrate') {
      const want = SUBSTRATE_CODES[id.toLowerCase() as keyof typeof SUBSTRATE_CODES];
      const from = want === SUB_WATER ? SUB_GEL : SUB_WATER;
      setGround(w, CELL, from);
      applyNow(w, 'matrix-paint', { kind: 'paintSubstrate', substrate: id.toLowerCase() as 'water', points: [[X + 0.5, Y + 0.5]], radius: 1 });
      expected = `substrate ${id.toLowerCase()}`;
      const got = w.grid.substrate[CELL]!;
      observed = `substrate ${Object.keys(SUBSTRATE_CODES).find((k) => SUBSTRATE_CODES[k as keyof typeof SUBSTRATE_CODES] === got)}; fields changed: ${changedFields(w, before).join(', ') || 'none'}`;
      pass = got === want && changedFields(w, before).length === 0;
    } else if (/^light × /.test(ct.adds)) {
      const factor = Number(/light × ([0-9.]+)/.exec(ct.adds)![1]);
      applyNow(w, 'matrix-shade', { kind: 'paintShade', erase: false, points: [[X + 0.5, Y + 0.5]], radius: 1 });
      const got = w.grid.shade[CELL]!;
      expected = `shade ${factor}`;
      observed = `shade ${got}; light ${w.derived.light[CELL]!.toPrecision(3)}`;
      pass = got === factor && w.derived.light[CELL]! <= factor * w.grid.lightBase[CELL]! + 1e-12;
    } else if (ct.dose === 'one object') {
      // "10 sugar C + 1 N; 0.02 C/s" / "6 starch + 4 protein + 1 N; 0.012 starch + 0.008 protein C/s, 0.10 N/C".
      const [inv, rates] = ct.adds.split(';').map((t) => t.trim());
      const pools: Record<string, number> = {};
      for (const m of inv!.matchAll(/([0-9.]+) (sugar|starch|protein)/g)) pools[m[2]!] = Number(m[1]);
      const n = Number(/([0-9.]+) N/.exec(inv!)![1]);
      const rate: Record<string, number> = {};
      const one = /^([0-9.]+) C\/s/.exec(rates!);
      if (one) rate[Object.keys(pools)[0]!] = Number(one[1]);
      for (const m of rates!.matchAll(/([0-9.]+) (sugar|starch|protein)/g)) rate[m[2]!] = Number(m[1]);
      applyNow(w, 'matrix-object', { kind: 'placeObject', materialId: id, x: X + 0.5, y: Y + 0.5 });
      const obj = w.objects.find((ob) => ob.cell === CELL);
      const placed = obj ? { ...obj.pools, n: obj.n } : null;
      // The bare world holds none of these pools: whatever the cell holds after one stage 3 was released.
      stageConversion(w);
      const released = Object.fromEntries(Object.keys(pools).map((p) => [p, w.fields[p as FieldId]![CELL]!]));
      const releasedN = Object.keys(pools).reduce((a, p) => a + w.fields[companion(p as FieldId)!]![CELL]!, 0);
      const totalC = Object.values(pools).reduce((a, b) => a + b, 0);
      expected = `object ${JSON.stringify({ ...pools, n })}; releases ${JSON.stringify(Object.fromEntries(Object.entries(rate).map(([k, v]) => [k, Number((v * DT).toPrecision(6))])))} per tick with ${(n / totalC).toFixed(2)} N/C`;
      observed = `object ${JSON.stringify(placed)}; released ${JSON.stringify(Object.fromEntries(Object.entries(released).map(([k, v]) => [k, Number(v.toPrecision(6))])))} with N ${releasedN.toPrecision(4)}`;
      const relC = Object.values(released).reduce((a, b) => a + b, 0);
      pass =
        placed !== null &&
        Object.keys(pools).every((p) => placed[p as 'sugar'] === pools[p]) &&
        placed.n === n &&
        Object.keys(pools).every((p) => Math.abs(released[p]! - rate[p]! * DT) <= 1e-12) &&
        Math.abs(releasedN - (n / totalC) * relC) <= 1e-12;
    } else {
      const field = ADDS_FIELD[ct.adds];
      const dose = 0.1;
      if (!field) {
        out.push({ family: 'materials', row: id, expected: `CT text "${ct.adds}"`, observed: 'no translation in ADDS_FIELD', pass: false, source: 'CT §5' });
        continue;
      }
      const nPerC = /\+ ?0\.10 N/.test(`${ct.adds} ${ct.dose}`) ? 0.1 : 0;
      const at0 = w.fields[field]?.[CELL] ?? Number.NaN;
      applyNow(w, 'matrix-deposit', { kind: 'deposit', materialId: id, points: [[X + 0.5, Y + 0.5]], radius: 1, dose });
      const changed = changedFields(w, before);
      const comp = nPerC > 0 ? companion(field) : undefined;
      const want = comp ? [field, comp] : [field];
      const ratio = comp ? w.fields[comp]![CELL]! / w.fields[field]![CELL]! : 0;
      expected = `${want.join(' + ')}${comp ? ` (${nPerC} N/C)` : ''}`;
      observed = `${changed.join(' + ') || 'nothing'}${comp ? ` (${ratio.toPrecision(3)} N/C)` : ''}`;
      pass = changed.length === want.length && want.every((f) => changed.includes(f)) && (comp ? Math.abs(ratio - nPerC) <= 1e-12 : true) && Math.abs(w.fields[field]![CELL]! - at0 - dose) <= 1e-15;
      // M01: "dissolved food for B08, Y02, F03" must agree with the diets of CT §3.1.
      if (id === 'M01') {
        const eaters = /for (.*)$/.exec(ct.adds)![1]!.split(',').map((t) => t.trim());
        const wrong = eaters.filter((e) => !(o.diets.get(e)?.foods ?? []).includes('broth'));
        out.push({ family: 'materials', row: 'M01 eaters × CT §3.1', expected: `${eaters.join(', ')} eat broth`, observed: wrong.length ? `not in §3.1: ${wrong.join(', ')}` : 'all eat broth in §3.1', pass: wrong.length === 0, source: 'CT §5.2, §3.1' });
      }
      materialsP5(w, o, id, ct.adds, field, table, out);
    }
    out.push({ family: 'materials', row: `${id} (${ct.name})`, expected, observed, pass, source: `CT §${ct.section}` });
  }
  for (const id of reg.manifest.enabledMaterials) if (!table.has(id)) skipped.push(`materials: ${id} has no CT row`);
}

// ---- Phase 5 families (wave 13, relmatrix) ---------------------------------------------------------

/** Stage 5 passes (tick advanced after each) until `prey` is gone; the 1-based pass that removed it, or −1 within `max`. */
function passesToCapture(w: World, prey: number, birth: number, max: number): number {
  for (let k = 1; k <= max; k++) {
    stageContacts(w);
    w.tick++;
    if (!w.ents.refValid(prey, birth)) return k;
  }
  return -1;
}

/** A hungry predator (E 50, no meal, cooldown 0) 0.3 cells west of `prey` (with `modules`), both on the prey's ground. */
function contactPair(reg: ContentRegistry, o: Oracle, pred: string, prey: string, modules: readonly string[] = []): { w: World; p: number; s: number; birth: number } {
  const w = bare(reg);
  setGround(w, CELL, homeGround(reg, prey, o.attached));
  const s = put(w, prey, X + 0.8, Y + 0.5, modules, 60);
  const p = put(w, pred, X + 0.5, Y + 0.5, [], 50);
  const c = w.ents.cols;
  c.attackCooldown[p] = 0;
  c.mealC[p] = 0;
  c.mealN[p] = 0;
  return { w, p, s, birth: c.birthId[s]! };
}

/**
 * handling: each CT §3.2 handler × each listed prey held in contact: the capture comes on contact tick
 * k = seconds / dt and not before; a contact broken at k − 1 leaves no capture, no progress and no attempt,
 * and the next attempt again needs k; an E11-jacketed prey needs 1 + 3c seconds (CT §12.5).
 */
function handling(reg: ContentRegistry, o: Oracle, species: readonly string[], out: MatrixRow[]): void {
  const row = (r: string, expected: string, observed: string, pass: boolean, source: string) => out.push({ family: 'handling', row: r, expected, observed, pass, source });
  for (const [pred, list] of o.contact) {
    if (!species.includes(pred)) continue;
    for (const [prey, sec] of Object.entries(list)) {
      if (!species.includes(prey)) continue;
      const k = Math.round(sec / DT);
      // Held in contact for k + 5 passes at most.
      {
        const { w, s, birth } = contactPair(reg, o, pred, prey);
        const n = passesToCapture(w, s, birth, k + 5);
        row(`${pred} × ${prey} (held in contact)`, `captured on contact tick ${k} (${sec} s), not before`, n > 0 ? `captured on contact tick ${n}` : `not captured in ${k + 5} ticks`, n === k, 'CT §3.2 (continuous contact), §12.5');
      }
      // Broken at k − 1: the prey steps to 0.6 cells (beyond the 0.5 contact) for one pass, then back.
      {
        const { w, p, s, birth } = contactPair(reg, o, pred, prey);
        const c = w.ents.cols;
        const early = passesToCapture(w, s, birth, k - 1);
        const progress = c.handlingProgress[p]!;
        c.x[s] = c.x[p]! + 0.6;
        rebuildIndex(w);
        stageContacts(w);
        w.tick++;
        const after = { need: c.handlingNeed[p]!, progress: c.handlingProgress[p]!, alive: w.ents.refValid(s, birth) };
        c.x[s] = c.x[p]! + 0.3;
        rebuildIndex(w);
        const n = passesToCapture(w, s, birth, k + 5);
        row(
          `${pred} × ${prey} (contact broken at tick ${k - 1})`,
          `no capture; progress and need 0 after the break; then captured on contact tick ${k} again`,
          `${early > 0 ? `captured at ${early}` : `no capture (progress ${progress.toFixed(1)} s)`}; after the break need ${after.need}, progress ${after.progress}${after.alive ? '' : ', prey gone'}; then ${n > 0 ? `captured on contact tick ${n}` : 'not captured'}`,
          early < 0 && after.alive && after.need === 0 && after.progress === 0 && n === k,
          'CT §3.2 (continuous contact); SPEC §7.3 "progress resets when contact breaks"',
        );
      }
    }
    // E11 jacket: 1 + 3c seconds (CT §12.5), c sampled at the attempt's start; every E11-eligible listed prey.
    const e11 = o.modules.get('E11');
    if (!e11 || !reg.manifest.enabledModules.includes('E11')) continue;
    for (const prey of e11.eligible.filter((id) => species.includes(id) && list[id] !== undefined)) {
      for (const cov of [0.5, 0.125]) {
        const need = o.handlingRules.jacketBase + o.handlingRules.jacketPerCoverage * cov;
        const k = Math.ceil(need / DT - 1e-9);
        const { w, s, birth } = contactPair(reg, o, pred, prey, ['E11']);
        // Labelled test state: a jacket of coverage c (c = jacket / (0.10 B), SPEC §9 E11), logged as a mineral input.
        setState(w, s, { jacketMineral: cov * 0.1 * w.ents.cols.B[s]! });
        const n = passesToCapture(w, s, birth, k + 5);
        row(`${pred} × ${prey}+E11 (jacket c ${cov})`, `captured on contact tick ${k} (${o.handlingRules.jacketBase} + ${o.handlingRules.jacketPerCoverage} × ${cov} = ${need} s)`, n > 0 ? `captured on contact tick ${n}` : `not captured in ${k + 5} ticks`, n === k, 'CT §12.5 (jacket 1 + 3c); SPEC §7.3');
      }
    }
  }
}

/**
 * radius (only with an enabled radius predator): a CT §3.2 "within 1 cell" predator (P06, on its home: water
 * beside a stone) × each organism in the next cell east on its own ground, at a centre distance of 0.9
 * (captures iff listed) and 1.0001 (never); every other predator × each prey it lists, at 0.9 in the next
 * cell: never (contact is 0.5 cells).
 */
function radius(reg: ContentRegistry, o: Oracle, species: readonly string[], out: MatrixRow[]): void {
  const observe = (pred: string, prey: string, d: number): string => {
    const w = bare(reg);
    prepareHome(w, reg, o, pred, CELL);
    setGround(w, CELL + 1, homeGround(reg, prey, o.attached));
    const s = put(w, prey, X + 0.5 + d, Y + 0.5);
    const p = put(w, pred, X + 0.5, Y + 0.5, [], 50);
    const c = w.ents.cols;
    c.attackCooldown[p] = 0;
    c.mealC[p] = 0;
    c.mealN[p] = 0;
    const birth = c.birthId[s]!;
    stageContacts(w);
    if (!w.ents.refValid(s, birth)) return c.mealC[p] > 0 ? 'captured' : 'removed without a meal';
    return c.handlingNeed[p]! > 0 ? 'attempt started' : 'not captured';
  };
  const predators = [...o.prey.keys()].filter((p) => species.includes(p));
  // The family is the radius rule's: without an enabled radius predator it has no rows (the shipped run before
  // the organism flip), and the other predators' 0.9-cell rows are its contrast.
  if (!predators.some((p) => o.within.has(p))) return;
  for (const pred of predators) {
    const cells = o.within.get(pred);
    const list = o.prey.get(pred)!;
    if (cells !== undefined) {
      for (const prey of species) {
        for (const d of [0.9 * cells, cells + 0.0001]) {
          const expected = d <= cells && list[prey] !== undefined;
          const obs = observe(pred, prey, d);
          out.push({
            family: 'radius',
            row: `${pred} × ${prey} (${d} cells, next cell)`,
            expected: expected ? 'captures (within 1 cell)' : d > cells ? 'does not capture (beyond 1 cell)' : 'does not capture (not listed)',
            observed: obs,
            pass: (obs === 'captured') === expected && obs !== 'removed without a meal',
            source: 'CT §3.2 (within 1 cell), §12.5 (P06 radius 1)',
          });
        }
      }
      continue;
    }
    for (const prey of Object.keys(list).filter((id) => species.includes(id))) {
      const obs = observe(pred, prey, 0.9);
      out.push({ family: 'radius', row: `${pred} × ${prey} (0.9 cells, next cell)`, expected: 'does not capture (contact 0.5 cells)', observed: obs, pass: obs === 'not captured', source: 'CT §3.2 (no radius); SPEC §7.3 (contact 0.5 cells)' });
    }
  }
}

/**
 * traps: an armed CT §3.3 trapper (F03 on its ground, armed by one stage 8) × each organism with its centre in
 * the trapper's cell: one stage 5 holds iff CT §3.3 lists it ("traps P04 only"); a target in the next cell is
 * not held; a held target is released after the CT §12.5 hold and the trap then waits the cooldown before it
 * holds again (full ticks, the target pinned in the trap's cell after stage 4).
 */
function traps(reg: ContentRegistry, o: Oracle, species: readonly string[], out: MatrixRow[]): void {
  const row = (r: string, expected: string, observed: string, pass: boolean, source: string) => out.push({ family: 'traps', row: r, expected, observed, pass, source });
  for (const [agent, h] of o.hostRows) {
    if (h.kind !== 'traps' || !species.includes(agent)) continue;
    const observe = (id: string, x: number): string => {
      const w = bare(reg);
      prepareHome(w, reg, o, agent, CELL);
      setGround(w, cellIndex(Math.floor(x), Y), homeGround(reg, agent, o.attached));
      const f = armedTrap(w, agent);
      if (f < 0) return 'not armed';
      const t = put(w, id, x, Y + 0.5, [], 90);
      stageContacts(w);
      const c = w.ents.cols;
      return c.heldBySlot[t] === f && c.trapSlot[f] === t ? 'held' : 'not held';
    };
    for (const id of species) {
      if (id === agent) continue;
      const obs = observe(id, X + 0.7);
      const expected = h.targets.includes(id);
      row(`${agent} (armed) × ${id} (own cell)`, expected ? 'held' : 'not held', obs, (obs === 'held') === expected && obs !== 'not armed', 'CT §3.3');
    }
    const target = h.targets.find((t) => species.includes(t));
    if (!target) continue;
    const next = observe(target, X + 1.2);
    row(`${agent} (armed) × ${target} (next cell, 0.9 cells)`, 'not held', next, next === 'not held', 'SPEC §7.17 ("entering its cell")');
    // The timeline: hold, release, cooldown, hold again.
    const w = bare(reg);
    prepareHome(w, reg, o, agent, CELL);
    const f = armedTrap(w, agent);
    const t = f < 0 ? -1 : put(w, target, X + 0.7, Y + 0.5, [], 90);
    const c = w.ents.cols;
    const holds: number[] = [];
    const releases: number[] = [];
    let held = false;
    const hold = Math.round(o.trap.holdSeconds / DT);
    const cool = Math.round(o.trap.cooldownSeconds / DT);
    for (let k = 0; t >= 0 && k < hold + cool + 40 && holds.length < 2; k++) {
      step(w, {
        afterStage: (st) => {
          if (st === 4) {
            c.x[t] = X + 0.7;
            c.y[t] = Y + 0.5;
            rebuildIndex(w);
          }
          if (st === 5 && !held && c.heldBySlot[t] === f) {
            held = true;
            holds.push(w.tick);
          }
          if (st === 8 && held && c.heldBySlot[t] !== f) {
            held = false;
            releases.push(w.tick);
          }
        },
      });
    }
    const heldTicks = releases.length > 0 ? releases[0]! - holds[0]! + 1 : -1;
    const waitTicks = holds.length > 1 ? holds[1]! - releases[0]! - 1 : -1;
    row(
      `${agent} × ${target} (hold, release, cooldown)`,
      `held ${hold} ticks (${o.trap.holdSeconds} s), then not held for ${cool} ticks (${o.trap.cooldownSeconds} s), held again on the next`,
      t < 0 ? 'not armed' : `held ${heldTicks} ticks, then not held for ${waitTicks} ticks${holds.length > 1 ? ', held again' : ', not held again'}`,
      heldTicks === hold && waitTicks === cool && w.ents.cols.alive[t] === 1,
      'CT §12.5 (hold 8 s; cooldown 30 s); SPEC §7.17',
    );
  }
}

/** One stage 6 of `id` on its own route in its home cell with `silicate` there: B, bound mineral and silicate before and after. */
function growthObservation(reg: ContentRegistry, o: Oracle, id: string, silicate: number): { dB: number; dBound: number; dSi: number; code: number } | null {
  const d = o.diets.get(id);
  const sp = reg.species[id]!;
  const w = bare(reg);
  prepareHome(w, reg, o, id, CELL);
  const photo = d?.photosynthesis === true;
  if (photo && (d?.modes.length ?? 0) > 0) setLight(w, CELL, 0.4); // a mixotroph in Photo mode (CT §3.1)
  const s = put(w, id, X + 0.5, Y + 0.5, [], 50);
  if (sp.nativeAbilities.includes('MIXOTROPHY')) updateMode(w, s, CELL);
  if (sp.nativeAbilities.includes('OXYGEN_SUPPRESSED')) w.fields.oxygen![CELL] = 0;
  if (photo) setField(w, 'co2', CELL, 0.5);
  else if (d !== undefined && d.foods.length > 0) {
    const food = d.foods[0]! as FieldId;
    setField(w, food, CELL, 0.5);
    const comp = companion(food);
    if (comp) setField(w, comp, CELL, 0.05);
  } else if (sp.category === 'consumer') setState(w, s, { mealC: 0.5, mealN: 0.05 });
  else return null;
  setField(w, 'silicate', CELL, silicate);
  settle(w, s);
  const c = w.ents.cols;
  const B0 = c.B[s]!;
  const m0 = c.boundMineral[s]!;
  const si0 = w.fields.silicate![CELL]!;
  stageIntake(w);
  return { dB: c.B[s]! - B0, dBound: c.boundMineral[s]! - m0, dSi: w.fields.silicate![CELL]! - si0, code: c.limitCode[s]! };
}

/**
 * growth (needs the silicate system): the CT §1.2 "+ silicate" shell builders gain nothing and report
 * SILICATE_LIMITED without silicate, and bind CT §12.3's 0.10 per new biomass with it; every other organism
 * (parasites excepted: a host drain is not an ordinary route) grows the same with or without silicate and
 * binds none; E11 carriers (CT §7.1) bind jacket mineral from silicate in one stage 8, never from grit.
 */
function growth(reg: ContentRegistry, o: Oracle, species: readonly string[], out: MatrixRow[]): void {
  if (!reg.manifest.enabledSystems.includes('silicate')) return;
  const row = (r: string, expected: string, observed: string, pass: boolean, source: string) => out.push({ family: 'growth', row: r, expected, observed, pass, source });
  const per = o.silicatePerBiomass;
  for (const id of species) {
    if (reg.species[id]!.category === 'parasite') continue;
    if (o.shell.has(id)) {
      const none = growthObservation(reg, o, id, 0);
      const some = growthObservation(reg, o, id, 0.5);
      if (!none || !some) continue;
      row(`${id} × silicate 0`, 'no growth; SILICATE_LIMITED', `B +${none.dB}; ${none.code === R.SILICATE_LIMITED ? 'SILICATE_LIMITED' : `reason ${none.code}`}`, none.dB === 0 && none.dBound === 0 && none.code === R.SILICATE_LIMITED, 'CT §1.2 (+ silicate), §12.3');
      const ratio = some.dB > 0 ? some.dBound / some.dB : Number.NaN;
      row(
        `${id} × silicate 0.5`,
        `grows, binding ${per} silicate per new biomass`,
        `B +${some.dB.toPrecision(4)}; bound +${some.dBound.toPrecision(4)} (${ratio.toPrecision(6)} per biomass); silicate ${some.dSi.toPrecision(4)}`,
        some.dB > 0 && Math.abs(ratio - per) <= 1e-12 && Math.abs(some.dSi + some.dBound) <= 1e-15,
        'CT §12.3 (shell silicate 0.10 per new biomass), §5.2 M02',
      );
      continue;
    }
    const none = growthObservation(reg, o, id, 0);
    const some = growthObservation(reg, o, id, 0.5);
    if (!none || !some) continue;
    row(
      `${id} × silicate (not a shell builder)`,
      'grows the same with or without silicate; binds none',
      `B +${none.dB.toPrecision(4)} without, +${some.dB.toPrecision(4)} with; bound ${some.dBound}; silicate ${some.dSi}`,
      none.dB > 0 && Object.is(none.dB, some.dB) && some.dBound === 0 && some.dSi === 0,
      'CT §1.2 (no "+ silicate"), §12.3',
    );
  }
  // E11 (CT §7.1 eligible ancestors): the jacket is built from free silicate only (SPEC §9 E11), never from grit.
  const e11 = o.modules.get('E11');
  if (!e11 || !reg.manifest.enabledModules.includes('E11')) return;
  for (const id of e11.eligible.filter((x) => species.includes(x))) {
    for (const pool of ['silicate', 'grit'] as const) {
      const w = bare(reg);
      prepareHome(w, reg, o, id, CELL);
      const s = put(w, id, X + 0.5, Y + 0.5, ['E11'], 60);
      setField(w, pool, CELL, 0.5);
      const si0 = w.fields.silicate![CELL]!;
      const g0 = w.fields.grit![CELL]!;
      stageStructures(w);
      const j = w.ents.cols.jacketMineral[s]!;
      const dSi = w.fields.silicate![CELL]! - si0;
      const dG = w.fields.grit![CELL]! - g0;
      const expected = pool === 'silicate';
      row(
        `${id}+E11 × ${pool} 0.5${pool === 'grit' ? ', silicate 0' : ''}`,
        expected ? 'binds jacket mineral from the silicate' : 'binds no jacket mineral (grit is not silicate)',
        `jacket +${j.toPrecision(4)}; silicate ${dSi.toPrecision(4)}; grit ${dG.toPrecision(4)}`,
        expected ? j > 0 && Math.abs(dSi + j) <= 1e-15 && dG === 0 : j === 0 && dSi === 0 && dG === 0,
        'CT §7.1 E11, §5.2 M02; SPEC §9 E11',
      );
    }
  }
}

// ---- Run and report ---------------------------------------------------------------------------------

export interface MatrixOptions {
  /** Run only these families (default: all). For focused checks; the gate evidence runs all. */
  readonly families?: readonly Family[];
}

export function runMatrix(reg: ContentRegistry = registry(), opts: MatrixOptions = {}): MatrixResult {
  const t0 = performance.now();
  const o = oracle();
  const species = [...reg.manifest.enabledSpecies].sort();
  const organisms = species.filter((id) => reg.species[id]!.category !== 'virus');
  const out: MatrixRow[] = [];
  const skipped: string[] = [];
  const on = (f: Family): boolean => opts.families === undefined || opts.families.includes(f);
  if (on('diets')) diets(reg, o, organisms, out);
  if (on('prey')) prey(reg, o, organisms, out, skipped);
  if (on('hosts')) hosts(reg, o, species, organisms, out, skipped);
  if (on('inhibitors')) inhibitors(reg, o, organisms, out, skipped);
  if (on('enzymes')) enzymes(reg, o, out);
  if (on('producers')) producers(reg, o, species, out, skipped);
  if (on('modules')) modules(reg, o, species, out);
  if (on('materials')) materials(reg, o, out, skipped);
  // Phase 5 families: rows only when the registry enables their subjects.
  if (on('handling')) handling(reg, o, organisms, out);
  if (on('radius')) radius(reg, o, organisms, out);
  if (on('traps')) traps(reg, o, organisms, out);
  if (on('growth')) growth(reg, o, organisms, out);
  return { rows: out, skipped, ms: performance.now() - t0 };
}

export function counts(rows: readonly MatrixRow[]): Record<Family, { rows: number; pass: number; positive: number }> {
  const out = Object.fromEntries(FAMILIES.map((f) => [f, { rows: 0, pass: 0, positive: 0 }])) as Record<Family, { rows: number; pass: number; positive: number }>;
  for (const r of rows) {
    const c = out[r.family];
    c.rows++;
    if (r.pass) c.pass++;
    if (!/^(does not|not |no |gain refused|releases nothing)/.test(r.expected)) c.positive++;
  }
  return out;
}

/**
 * SHA-256 of every row (family, row, expected, observed, pass, source, in run order): the shipped-run snapshot
 * relationship-matrix.test.ts compares, and what the CLI prints for re-recording it after the organism flip.
 */
export function rowsDigest(rows: readonly MatrixRow[]): string {
  return createHash('sha256')
    .update(JSON.stringify(rows.map((r) => [r.family, r.row, r.expected, r.observed, r.pass, r.source])), 'utf8')
    .digest('hex');
}

function cellText(s: string): string {
  return s.replace(/\|/g, '\\|');
}

export type RegistryKind = 'shipped' | 'phase5';

export function renderReport(res: MatrixResult, manifest: ContentRegistry['manifest'], kind: RegistryKind = 'shipped'): string {
  const c = counts(res.rows);
  const total = res.rows.length;
  const passed = res.rows.filter((r) => r.pass).length;
  // Families with rows (the shipped run before the organism flip: exactly the eight v1.0 families).
  const families = FAMILIES.filter((f) => c[f].rows > 0);
  const lines: string[] = [];
  if (kind === 'phase5') {
    lines.push('# Relationship matrix — Phase 5 test registry (before the organism flip)');
    lines.push('');
    lines.push('Generated by `npx tsx tools/relationship-matrix.ts --registry phase5` (the same rows as `tests/fixtures/relationship-matrix-p5.test.ts`). Do not edit by hand.');
    lines.push('');
    lines.push(
      '**This is a test registry, not the shipped content.** `phase5Registry()` is `registryWith(P5_LISTS, { allowUnimplemented: true })`: the shipped manifest plus every CT §1.1 Phase 5 species, the Phase 5 modules E02 and E11, the Phase 5 materials M02, M06, M07, M08 and M12 and the signals, rivalry and silicate systems. Nothing here is enabled in the shipped build until the organism flip (D-0104); after the flip `npx tsx tools/relationship-matrix.ts` (the shipped registry) runs these rows.',
    );
    lines.push('');
  } else {
    lines.push('# Relationship matrix — G3 evidence');
    lines.push('');
    lines.push('Generated by `npx tsx tools/relationship-matrix.ts` (the same rows as `tests/fixtures/relationship-matrix.test.ts`). Do not edit by hand.');
    lines.push('');
  }
  lines.push(
    `Manifest: buildPhase ${manifest.buildPhase}, contentVersion ${manifest.contentVersion}, moduleRegistryVersion ${manifest.moduleRegistryVersion}, contentHash \`${manifest.contentHash.slice(0, 16)}…\`; ${manifest.enabledSpecies.length} species, ${manifest.enabledMaterials.length} materials, ${manifest.enabledModules.length} modules.`,
  );
  lines.push('');
  lines.push(
    kind === 'phase5'
      ? 'Expected values are read from the design documents (CT §1.1–§1.2, §2, §3.1–§3.5, §5.1–§5.2, §7.1, §12.2–§12.6; SPEC §5.3) by `tests/helpers/tables.ts`, never from the content JSON. Observed values come from the simulation stages on one tiny deterministic world per row (multi-tick rows keep positions pinned between ticks).'
      : 'Expected values are read from the design documents (CT §1.1, §3.1–§3.5, §5.1–§5.2, §7.1; SPEC §5.3) by `tests/helpers/tables.ts`, never from the content JSON. Observed values come from the simulation stages on one tiny deterministic world per row.',
  );
  lines.push('');
  lines.push(`**${passed} of ${total} rows pass.**`);
  lines.push('');
  lines.push('| Family | Rows | Pass | Positive relationships |');
  lines.push('|--------|-----:|-----:|-----------------------:|');
  for (const f of families) lines.push(`| ${f} | ${c[f].rows} | ${c[f].pass} | ${c[f].positive} |`);
  lines.push(`| **all** | **${total}** | **${passed}** | **${families.reduce((a, f) => a + c[f].positive, 0)}** |`);
  lines.push('');
  if (res.skipped.length) {
    lines.push(kind === 'phase5' ? 'Relationships a v1.0 family skips (each names where it is covered or why):' : 'Catalog relationships outside this manifest (later phases), not run:');
    lines.push('');
    for (const s of res.skipped) lines.push(`- ${s}`);
    lines.push('');
  }
  for (const f of families) {
    lines.push(`## ${f}`);
    lines.push('');
    lines.push('| Row | Expected | Observed | Pass | Source |');
    lines.push('|-----|----------|----------|------|--------|');
    for (const r of res.rows.filter((x) => x.family === f)) lines.push(`| ${cellText(r.row)} | ${cellText(r.expected)} | ${cellText(r.observed)} | ${r.pass ? 'yes' : '**NO**'} | ${r.source} |`);
    lines.push('');
  }
  return lines.join('\n');
}

function main(argv: readonly string[]): number {
  const r = argv.indexOf('--registry');
  const kind = (r >= 0 ? argv[r + 1] : 'shipped') as RegistryKind;
  if (kind !== 'shipped' && kind !== 'phase5') {
    console.error(`relationship-matrix: --registry must be shipped or phase5, not "${String(kind)}"`);
    return 2;
  }
  const k = argv.indexOf('--out');
  const outPath = k >= 0 ? argv[k + 1]! : join(REPO_ROOT, 'docs', 'reports', kind === 'phase5' ? 'relationships-g5-preflip.md' : 'relationships-g3.md');
  const reg = kind === 'phase5' ? phase5Registry() : registry();
  const res = runMatrix(reg);
  writeFileSync(outPath, `${renderReport(res, reg.manifest, kind)}\n`);
  const failed = res.rows.filter((r) => !r.pass);
  console.log(`relationship-matrix: ${res.rows.length} rows, ${res.rows.length - failed.length} pass, ${failed.length} fail (${(res.ms / 1000).toFixed(1)} s) → ${outPath}`);
  console.log(`  registry ${kind}; rows digest ${rowsDigest(res.rows)}; ${JSON.stringify(Object.fromEntries(FAMILIES.map((f) => [f, counts(res.rows)[f].rows]).filter(([, n]) => n !== 0)))}`);
  for (const r of failed) console.log(`  FAIL ${r.family}: ${r.row} — expected ${r.expected}; observed ${r.observed}`);
  return failed.length === 0 ? 0 : 1;
}

const invoked = process.argv[1] ?? '';
const self = fileURLToPath(import.meta.url);
if (invoked === self || `${invoked}.ts` === self) process.exitCode = main(process.argv.slice(2));
