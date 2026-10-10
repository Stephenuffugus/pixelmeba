/**
 * The G3 "every catalog relationship" matrix (BUILD_DIRECTIVE "G3 gate — evidence"; SPEC §17; D01
 * Phase 3 "Every catalog relationship has a data-backed fixture").
 *
 *   npx tsx tools/relationship-matrix.ts [--out docs/reports/relationships-g3.md]
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
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchorSupported } from '../src/sim/anchor';
import { applyNow, introduceOrganism } from '../src/sim/commands';
import { DT } from '../src/sim/constants';
import type { ContentRegistry } from '../src/sim/content/registry';
import { stageContacts } from '../src/sim/contacts';
import { stageConversion } from '../src/sim/conversion';
import { FLAG } from '../src/sim/entities';
import { FIELD_DEFS, FIELD_IDS, type FieldId } from '../src/sim/fields';
import { cellIndex, maskCells, SUB_GEL, SUB_SEDIMENT, SUB_WATER, SUBSTRATE_CODES } from '../src/sim/grid';
import { stageIntake } from '../src/sim/intake';
import { stageMaintenance } from '../src/sim/maintenance';
import { eligibleGains, validateModuleSet } from '../src/sim/modules';
import { profileOf } from '../src/sim/profiles';
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
  filmDigesters,
  hostTable,
  identityTable,
  inhibitorTable,
  materialTable,
  moduleTable,
  preyTable,
  type PreyRequirement,
} from '../tests/helpers/tables';
import { clearWater, rebaseLedger, registry, setField } from '../tests/helpers/world';

export type Family = 'diets' | 'prey' | 'hosts' | 'inhibitors' | 'enzymes' | 'producers' | 'modules' | 'materials';
export const FAMILIES: readonly Family[] = ['diets', 'prey', 'hosts', 'inhibitors', 'enzymes', 'producers', 'modules', 'materials'];

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

// ---- Worlds ----------------------------------------------------------------------------------------

/** Clear water with no food, CO2 or phage anywhere, 0.5 free nutrient, ledger re-based. */
function bare(reg: ContentRegistry): World {
  const w = clearWater({}, reg);
  for (const id of ZEROED) w.fields[id]?.fill(0);
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
 * A species' home ground: gel for an attached species (CT §1.1 "(attached)": its surfaces include gel),
 * sediment for a sediment-only species, water otherwise.
 */
function homeGround(reg: ContentRegistry, id: string, attached: ReadonlySet<string>): number {
  const habitats = reg.species[id]!.habitats;
  if (attached.has(id)) return SUB_GEL;
  if (!habitats.includes('water')) return habitats.includes('gel') ? SUB_GEL : SUB_SEDIMENT;
  return SUB_WATER;
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
  readonly diets: ReadonlyMap<string, { foods: readonly string[]; film: boolean; photosynthesis: boolean }>;
  readonly e08: readonly string[];
  readonly filmDigesters: readonly string[];
  readonly prey: ReadonlyMap<string, Readonly<Record<string, PreyRequirement>>>;
  readonly hosts: ReadonlyMap<string, readonly string[]>;
  readonly inhibitors: ReadonlyMap<string, readonly string[]>;
  readonly attached: ReadonlySet<string>;
  readonly modules: ReadonlyMap<string, { eligible: readonly string[]; notNative: readonly string[]; name: string }>;
  readonly enzymes: ReturnType<typeof enzymeRules>;
}

function oracle(): Oracle {
  const diets = new Map<string, { foods: readonly string[]; film: boolean; photosynthesis: boolean }>();
  let e08: readonly string[] = [];
  for (const d of dietTable()) {
    if (d.id === 'E08') e08 = d.foods;
    else diets.set(d.id, { foods: d.foods, film: d.film, photosynthesis: d.photosynthesis });
  }
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
  };
}

// ---- Families --------------------------------------------------------------------------------------

type Food = (typeof FOOD_FIELDS)[number] | 'photosynthesis';
const DIET_FOODS: readonly Food[] = [...FOOD_FIELDS, 'photosynthesis'];

/** One diet row: only `food` in the organism's cell; the carbon stage 6 took from it in three passes. */
function dietObservation(reg: ContentRegistry, o: Oracle, id: string, food: Food, modules: readonly string[]): { took: number; suit: number } {
  const w = bare(reg);
  setGround(w, CELL, homeGround(reg, id, o.attached));
  const s = put(w, id, X + 0.5, Y + 0.5, modules);
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
    const d = o.diets.get(id) ?? { foods: [], film: false, photosynthesis: false };
    const foods = modules.includes('E08') ? [...d.foods, ...o.e08] : d.foods;
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
  } else {
    setGround(w, CELL, variant === 'sediment' ? SUB_SEDIMENT : homeGround(reg, prey, o.attached));
    s = put(w, prey, X + 0.8, Y + 0.5);
    // Labelled test state: the attached flag on a species that is never attached in a shipped dish, so
    // CT §3.2's "free" (which excludes attached) is exercised for the free-prey lists.
    if (variant === 'attachedFlag') w.ents.cols.flags[s] = w.ents.cols.flags[s]! | FLAG.attached;
  }
  const c = w.ents.cols;
  const p = put(w, pred, c.x[s]! - 0.3, c.y[s]!, [], 50);
  c.attackCooldown[p] = 0;
  c.mealC[p] = 0;
  c.mealN[p] = 0;
  rebuildIndex(w);
  const birth = c.birthId[s]!;
  stageContacts(w);
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
          source: variant === 'anchored' ? 'CT §3.2; D-0055' : 'CT §3.2',
        });
      }
    }
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
      skipped.push(`hosts: ${agent} (trap; Phase 5)`);
      continue;
    }
    for (const target of species) {
      if (target === agent && isVirus) continue;
      const w = bare(reg);
      setGround(w, CELL, homeGround(reg, target, o.attached));
      const h = put(w, target, X + 0.5, Y + 0.5);
      const birth = w.ents.cols.birthId[h]!;
      let observed: string;
      if (isVirus) {
        setField(w, agent.toLowerCase() as FieldId, CELL, 1000);
        for (let k = 0; k < 10 && w.ents.cols.infectedBy[h] === 0; k++) {
          stageContacts(w);
          w.tick++;
        }
        observed = !w.ents.refValid(h, birth) ? 'host removed' : w.ents.cols.infectedBy[h] !== 0 ? 'infected' : 'not infected';
      } else {
        const x = put(w, agent, X + 0.6, Y + 0.5);
        stageContacts(w);
        observed = w.ents.cols.hostSlot[x] === h ? 'attached' : 'not attached';
      }
      const expected = targets.includes(target);
      const verb = isVirus ? 'infected' : 'attached';
      out.push({
        family: 'hosts',
        row: `${agent} × ${target}`,
        expected: expected ? verb : `not ${verb}`,
        observed,
        pass: (observed === verb) === expected,
        source: 'CT §3.3',
      });
    }
  }
}

function inhibitors(reg: ContentRegistry, o: Oracle, species: readonly string[], out: MatrixRow[], skipped: string[]): void {
  const enabled = reg.manifest.enabledMaterials.map((id) => reg.materials[id]!);
  for (const [fieldName, targets] of o.inhibitors) {
    const mat = enabled.find((m) => m.name === fieldName);
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
    }
    out.push({ family: 'materials', row: `${id} (${ct.name})`, expected, observed, pass, source: `CT §${ct.section}` });
  }
  for (const id of reg.manifest.enabledMaterials) if (!table.has(id)) skipped.push(`materials: ${id} has no CT row`);
}

// ---- Run and report ---------------------------------------------------------------------------------

export function runMatrix(reg: ContentRegistry = registry()): MatrixResult {
  const t0 = performance.now();
  const o = oracle();
  const species = [...reg.manifest.enabledSpecies].sort();
  const organisms = species.filter((id) => reg.species[id]!.category !== 'virus');
  const out: MatrixRow[] = [];
  const skipped: string[] = [];
  diets(reg, o, organisms, out);
  prey(reg, o, organisms, out, skipped);
  hosts(reg, o, species, organisms, out, skipped);
  inhibitors(reg, o, organisms, out, skipped);
  enzymes(reg, o, out);
  producers(reg, o, species, out, skipped);
  modules(reg, o, species, out);
  materials(reg, o, out, skipped);
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

function cellText(s: string): string {
  return s.replace(/\|/g, '\\|');
}

export function renderReport(res: MatrixResult, manifest: ContentRegistry['manifest']): string {
  const c = counts(res.rows);
  const total = res.rows.length;
  const passed = res.rows.filter((r) => r.pass).length;
  const lines: string[] = [];
  lines.push('# Relationship matrix — G3 evidence');
  lines.push('');
  lines.push('Generated by `npx tsx tools/relationship-matrix.ts` (the same rows as `tests/fixtures/relationship-matrix.test.ts`). Do not edit by hand.');
  lines.push('');
  lines.push(
    `Manifest: buildPhase ${manifest.buildPhase}, contentVersion ${manifest.contentVersion}, moduleRegistryVersion ${manifest.moduleRegistryVersion}, contentHash \`${manifest.contentHash.slice(0, 16)}…\`; ${manifest.enabledSpecies.length} species, ${manifest.enabledMaterials.length} materials, ${manifest.enabledModules.length} modules.`,
  );
  lines.push('');
  lines.push('Expected values are read from the design documents (CT §1.1, §3.1–§3.5, §5.1–§5.2, §7.1; SPEC §5.3) by `tests/helpers/tables.ts`, never from the content JSON. Observed values come from the simulation stages on one tiny deterministic world per row.');
  lines.push('');
  lines.push(`**${passed} of ${total} rows pass.**`);
  lines.push('');
  lines.push('| Family | Rows | Pass | Positive relationships |');
  lines.push('|--------|-----:|-----:|-----------------------:|');
  for (const f of FAMILIES) lines.push(`| ${f} | ${c[f].rows} | ${c[f].pass} | ${c[f].positive} |`);
  lines.push(`| **all** | **${total}** | **${passed}** | **${FAMILIES.reduce((a, f) => a + c[f].positive, 0)}** |`);
  lines.push('');
  if (res.skipped.length) {
    lines.push('Catalog relationships outside this manifest (later phases), not run:');
    lines.push('');
    for (const s of res.skipped) lines.push(`- ${s}`);
    lines.push('');
  }
  for (const f of FAMILIES) {
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
  const k = argv.indexOf('--out');
  const outPath = k >= 0 ? argv[k + 1]! : join(REPO_ROOT, 'docs', 'reports', 'relationships-g3.md');
  const reg = registry();
  const res = runMatrix(reg);
  writeFileSync(outPath, `${renderReport(res, reg.manifest)}\n`);
  const failed = res.rows.filter((r) => !r.pass);
  console.log(`relationship-matrix: ${res.rows.length} rows, ${res.rows.length - failed.length} pass, ${failed.length} fail (${(res.ms / 1000).toFixed(1)} s) → ${outPath}`);
  for (const r of failed) console.log(`  FAIL ${r.family}: ${r.row} — expected ${r.expected}; observed ${r.observed}`);
  return failed.length === 0 ? 0 : 1;
}

const invoked = process.argv[1] ?? '';
const self = fileURLToPath(import.meta.url);
if (invoked === self || `${invoked}.ts` === self) process.exitCode = main(process.argv.slice(2));
