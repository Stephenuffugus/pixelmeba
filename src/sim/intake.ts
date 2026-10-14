/**
 * Stage 6 — intake and shared allocation (SPEC §6.5, D02 A2, D04 C01/C02).
 *
 * 1. Every eligible organism builds its requests from one snapshot (one route per tick: held meal,
 *    photosynthesis, or field foods under its ordered/weighted policy).
 * 2. Each (pool, cell) is allocated proportionally when over-requested.
 * 3. Nutrient and oxygen are then allocated proportionally to need; each organism's limiting
 *    fraction L scales everything it consumes.
 * 4. Commit once. Unused food stays in the pool and is not re-offered this tick. Surplus bound
 *    nutrient and byproducts appear in the pools for the next tick's allocation.
 *
 * Shell builders (native SHELL: A02, P05; Phase 5 E2-SHELLS, SPEC §6.5, §7.11, CT §12.3) also need
 * free silicate: needSi = 0.10 × 0.50·C on every ordinary route, allocated per cell with nutrient and
 * oxygen, and L = min(fracN, fracO, fracSi) for a shell builder only. Every other organism keeps
 * exactly L = min(fracN, fracO) and never reads silicate, so a world without shell builders takes the
 * v1.0 path unchanged. The bound silicate (0.10 per unit of biomass gained) moves into boundMineral.
 */
import {
  AVAIL_K,
  BIOMASS_FRACTION,
  CELL_COUNT,
  CELL_SOFT_CAPACITY,
  CO2_FRACTION,
  DT,
  METABOLITE_FRACTION,
  NUTRIENT_PER_CARBON,
  O2_PER_CARBON_AEROBIC,
  PHOTO_O2_PER_CARBON,
  PHOTO_SUGAR_FRACTION,
  SHELL_MINERAL_PER_BIOMASS,
  USABLE_INTAKE_FRACTION,
} from './constants';
import { FLAG } from './entities';
import { FIELD_DEFS, FIELD_IDS, type FieldId } from './fields';
import { profileOf } from './profiles';
import { R } from './reasons';
import { entityCell } from './spatial';
import type { World } from './world';
import { AGENT_CAP } from './constants';
import { milestone } from './events';
import { markField } from './transport';
import { subtractPool } from './ledger';
import { edibleFilmAt, filmWeight, orderedFilmRequest, weightedFilmRequest } from './film';
import { commitHostDrains, reserveHostDrains } from './parasites';
import { debrisRequest } from './debrisFeeder';
import type { Profile } from './phenotype';
import { lowLightResponse, MODE_PHOTO } from './mixotrophy';

const K = 6; // max requests per organism
const ROUTE_NONE = 0;
const ROUTE_FIELD = 1;
const ROUTE_MEAL = 2;
const ROUTE_PHOTO = 3;
/** E08 carriers with no held meal eating local detritus (debrisFeeder.ts); converted like the field route. */
const ROUTE_DETRITUS = 4;

/**
 * Photosynthetic light response (SPEC §6.5): linear in effective light, or for an E06 carrier
 * min(1, light / lightHalf) (SPEC §9 E06), or for an A03 (`lowLight`: LOW_LIGHT_CURVE, which never carries
 * E06) min(1, light / 0.30) (Phase 5 wave 12; mixotrophy.ts lowLightResponse).
 */
export function photoLightResponse(prof: Profile, light: number, lowLight = false): number {
  const shade = prof.shade;
  return shade === null ? (lowLight ? lowLightResponse(light) : light) : Math.min(1, light / shade.lightHalf);
}

/**
 * Share of the ancestral ceiling (budget) the photosynthetic CO2 request may reach before avail(CO2):
 * the light response, times E06's ceiling factor (0.70) for a carrier. The feeding locus is already in
 * Profile.q, so the reduced ceiling gets the inherited feeding investment.
 */
export function photoCeilingShare(prof: Profile, light: number): number {
  const shade = prof.shade;
  return shade === null ? light : shade.ceilingFactor * Math.min(1, light / shade.lightHalf);
}

/**
 * Whether this organism's stage 6 route this tick was photosynthesis and it fixed carbon (E06 "active now").
 * An A04 (mixotroph) photosynthesizes only in Photo mode (SPEC §7.10; Phase 5 wave 12).
 */
export function photosynthesizedThisTick(world: World, i: number): boolean {
  const c = world.ents.cols;
  const sp = world.species[c.species[i]!]!;
  return sp.photosynthetic && (!sp.mixotroph || c.metabolicMode[i] === MODE_PHOTO) && (c.flags[i]! & FLAG.feeding) !== 0;
}

const route = new Uint8Array(AGENT_CAP);
const reqCount = new Uint8Array(AGENT_CAP);
const reqField = new Int16Array(AGENT_CAP * K);
const reqAmt = new Float64Array(AGENT_CAP * K);
const reqAlloc = new Float64Array(AGENT_CAP * K);
const reqRatio = new Float64Array(AGENT_CAP * K);
const entCell = new Int32Array(AGENT_CAP);
const budgetArr = new Float64Array(AGENT_CAP);
const mealReq = new Float64Array(AGENT_CAP);
const carbonIn = new Float64Array(AGENT_CAP);
const boundN = new Float64Array(AGENT_CAP);
const needN = new Float64Array(AGENT_CAP);
const needO2 = new Float64Array(AGENT_CAP);
/** Silicate need of a shell builder this tick (written and read only while the world has shell builders). */
const needSi = new Float64Array(AGENT_CAP);
/** 1 where the routed organism in this slot is a shell builder (written and read only with shell builders). */
const shellEnt = new Uint8Array(AGENT_CAP);
const scaleFrac = new Float64Array(AGENT_CAP);

const FIELD_INDEX: Readonly<Record<FieldId, number>> = Object.fromEntries(FIELD_IDS.map((id, i) => [id, i])) as Record<FieldId, number>;
/**
 * P3.12: per-field facts by FIELD_IDS index, and this stage's field arrays by index (filled at the start
 * of every stage 6), so the allocation and commit loops index arrays instead of looking fields and
 * definitions up by name for every request. Same arrays, same arithmetic: hash-neutral.
 */
const COMPANION_INDEX = Int16Array.from(FIELD_IDS, (id) => {
  const comp = FIELD_DEFS[id].companion;
  return comp ? FIELD_INDEX[comp] : -1;
});
const IS_CARBON = Uint8Array.from(FIELD_IDS, (id) => (FIELD_DEFS[id].material === 'carbon' ? 1 : 0));
const fieldAt: (Float64Array | undefined)[] = new Array<Float64Array | undefined>(FIELD_IDS.length).fill(undefined);
const demand: (Float64Array | undefined)[] = [];
const demandN = new Float64Array(CELL_COUNT);
const demandO2 = new Float64Array(CELL_COUNT);
const demandSi = new Float64Array(CELL_COUNT);
/** Cells whose demandSi was written this stage (cleared in clearScratch; empty without shell builders). */
const touchedSi: number[] = [];
/** Shell builders by species index, rebuilt every stage 6 from sp.abilities (never a species id). */
let shellSpecies = new Uint8Array(0);
const touched: number[] = [];

function demandFor(fieldIdx: number): Float64Array {
  let d = demand[fieldIdx];
  if (!d) {
    d = new Float64Array(CELL_COUNT);
    demand[fieldIdx] = d;
  }
  return d;
}

function availability(a: number): number {
  return a <= 0 ? 0 : a / (a + AVAIL_K);
}

function addRequest(i: number, fieldIdx: number, amount: number, cell: number): void {
  if (amount <= 0) return;
  const n = reqCount[i]!;
  if (n >= K) return;
  const o = i * K + n;
  reqField[o] = fieldIdx;
  reqAmt[o] = amount;
  reqCount[i] = n + 1;
  demandFor(fieldIdx)[cell]! += amount;
  touched.push(fieldIdx * CELL_COUNT + cell);
}

/**
 * P3.8 observation (the Field Guide's "seen in your dishes", D-0039): which pools each species took
 * food from in the last stage 6. One byte per (species, field): 1 where at least one organism of that
 * species took more than 0 from that pool (sugar, starch, oil, protein, broth, detritus, metabolite,
 * film, carbon dioxide …) this tick. Cleared at the start of every stage 6. Observation only, like
 * `world.reactionCells`: the simulation never reads it, it is not hashed and not saved; the bytes are
 * allocated on the first intake, so a world in which nothing eats never pays for them.
 */
export interface IntakeSeen {
  /** species × FIELD_IDS.length, or null before the first intake. */
  bits: Uint8Array | null;
  /** The tick these bits describe (−1 before any stage 6). */
  tick: number;
}

export function createIntakeSeen(): IntakeSeen {
  return { bits: null, tick: -1 };
}

/** Whether an organism of species index `species` took food from `field` in the last stage 6. Pure read. */
export function tookFromPool(world: World, species: number, field: FieldId): boolean {
  const b = world.intakeSeen.bits;
  return b !== null && b[species * FIELD_IDS.length + FIELD_INDEX[field]]! === 1;
}

function markIntake(world: World, species: number, fieldIdx: number): void {
  const seen = world.intakeSeen;
  seen.bits ??= new Uint8Array(world.species.length * FIELD_IDS.length);
  seen.bits[species * FIELD_IDS.length + fieldIdx] = 1;
}

export function isIntakeEligible(world: World, slot: number): boolean {
  const c = world.ents.cols;
  return c.lifeState[slot] === 0; // Active (other life states arrive with dormancy/life stages)
}

export function stageIntake(world: World): void {
  try {
    intakeBody(world);
  } finally {
    clearScratch();
  }
}

function intakeBody(world: World): void {
  const e = world.ents;
  const c = e.cols;
  const load = world.derived.cellLoad;
  const light = world.derived.light;
  touched.length = 0;
  for (let fi = 0; fi < FIELD_IDS.length; fi++) fieldAt[fi] = world.fields[FIELD_IDS[fi]!];
  // P3.8 observation: this tick's record starts empty (never read by the simulation).
  const seen = world.intakeSeen;
  if (seen.bits !== null) seen.bits.fill(0);
  seen.tick = world.tick;
  // Host drains are reserved before any ordinary request (SPEC §3.2 row 6, §6.5; parasites.ts).
  reserveHostDrains(world);
  // Shell builders by species index (E2-SHELLS). A world without one never reads silicate below.
  const anyShell = buildShellTable(world);
  const silicate = world.fields.silicate;

  // ---------------------------------------------------------------- 1. requests
  for (let i = 0; i < e.highWater; i++) {
    route[i] = ROUTE_NONE;
    reqCount[i] = 0;
    mealReq[i] = 0;
    carbonIn[i] = 0;
    if (c.alive[i] !== 1) continue;
    c.flags[i] = c.flags[i]! & ~(FLAG.feeding | FLAG.usableIntake | FLAG.detritusIntake);
    c.limitCode[i] = R.NONE;
    c.limitValue[i] = 0;
    if (!isIntakeEligible(world, i)) continue;
    const sp = world.species[c.species[i]!]!;
    const prof = profileOf(world, i);
    const cell = entityCell(c.x[i]!, c.y[i]!);
    entCell[i] = cell;
    const over = load[cell]! > CELL_SOFT_CAPACITY;
    if (over) c.flags[i] = c.flags[i]! | FLAG.overCapacity;
    else c.flags[i] = c.flags[i]! & ~FLAG.overCapacity;
    const budget = prof.q * c.suitability[i]! * DT * (over ? 0.5 : 1);
    budgetArr[i] = budget;
    if (budget <= 0) {
      c.limitCode[i] = c.suitability[i]! <= 0 ? R.SUIT_HABITAT : R.NONE;
      continue;
    }

    if (sp.isPredator && c.mealC[i]! > 0) {
      route[i] = ROUTE_MEAL;
      mealReq[i] = Math.min(c.mealC[i]!, budget);
      continue;
    }
    // E08 (debrisFeeder.ts): with no held meal, local detritus (and its bound N) under the ordinary budget.
    if (prof.debrisFeeder) {
      const dr = debrisRequest(world, prof, c.mealC[i]!, cell, budget);
      if (dr > 0) {
        route[i] = ROUTE_DETRITUS;
        addRequest(i, FIELD_INDEX.detritus, dr, cell);
        continue;
      }
    }
    // A04 (mixotroph, SPEC §7.10; Phase 5 wave 12): exactly one route per tick, by its saved mode: Photo
    // takes this photosynthetic route, Sugar the field route below (its content foods, never broth). Stage 4
    // (mixotrophy.ts updateMode) gave every Active A04 a mode before this stage.
    if (sp.photosynthetic && (!sp.mixotroph || c.metabolicMode[i] === MODE_PHOTO)) {
      const co2 = world.fields.co2![cell]!;
      // E06 (SPEC §9): light response min(1, light / 0.35) and the ceiling × 0.70; other limits unchanged.
      // A03 (LOW_LIGHT_CURVE, never an E06 carrier): light response min(1, light / 0.30) (SPEC §6.5 route 2).
      const req =
        prof.shade === null
          ? sp.lowLight
            ? Math.min(co2, budget * lowLightResponse(light[cell]!) * availability(co2))
            : Math.min(co2, budget * light[cell]! * availability(co2))
          : Math.min(co2, budget * photoCeilingShare(prof, light[cell]!) * availability(co2));
      route[i] = ROUTE_PHOTO;
      addRequest(i, FIELD_INDEX.co2, req, cell);
      if (req <= 0) c.limitCode[i] = light[cell]! <= 0 ? R.LIGHT_LIMITED : R.CO2_LIMITED;
      continue;
    }
    const foods = prof.foods;
    if (foods.length === 0) {
      // H3 (Phase 5 wave 12): a meal-less predator in an open handling attempt shows it is holding on.
      if (sp.isPredator) c.limitCode[i] = c.handlingNeed[i]! > 0 ? R.PRED_HANDLING_IN_PROGRESS : R.PRED_NO_PREY;
      continue;
    }
    route[i] = ROUTE_FIELD;
    if (prof.policy === 'ordered' || prof.weights === null) {
      let rem = budget;
      for (let k = 0; k < foods.length && rem > 0; k++) {
        const f = world.fields[foods[k]!];
        if (!f) continue;
        const P = f[cell]!;
        if (P <= 0) continue;
        const r = Math.min(rem * availability(P), P);
        addRequest(i, FIELD_INDEX[foods[k]!], r, cell);
        rem -= r;
      }
      // Film, eaten as detritus after the listed foods (D-0038; film.ts): no film here, no request.
      addRequest(i, FIELD_INDEX.film, orderedFilmRequest(world, sp, cell, rem), cell);
    } else {
      const w = prof.weights;
      let W = 0;
      let anyPresent = false;
      for (let k = 0; k < foods.length; k++) {
        const f = world.fields[foods[k]!];
        if (!f || f[cell]! <= 0) continue;
        anyPresent = true;
        W += w[k] ?? 0;
      }
      // Film with the detritus weight (D-0038; film.ts); counted only where edible film is present.
      const filmP = edibleFilmAt(world, sp, cell);
      const filmW = filmP > 0 ? filmWeight(prof) : 0;
      if (filmP > 0) {
        anyPresent = true;
        W += filmW;
      }
      if (W <= 0) {
        c.limitCode[i] = anyPresent ? R.FOOD_EXCLUDED_BY_PREFERENCE : R.FOOD_NONE_COMPATIBLE;
        continue;
      }
      // Weights are renormalized over the foods present here: the share of absent foods is
      // redistributed once, proportionally (D03 §5). Availability still scales each request.
      for (let k = 0; k < foods.length; k++) {
        const f = world.fields[foods[k]!];
        if (!f) continue;
        const P = f[cell]!;
        const wk = w[k] ?? 0;
        if (P <= 0 || wk <= 0) continue;
        addRequest(i, FIELD_INDEX[foods[k]!], Math.min(P, budget * (wk / W) * availability(P)), cell);
      }
      addRequest(i, FIELD_INDEX.film, weightedFilmRequest(filmP, budget, filmW, W), cell);
    }
  }

  // ------------------------------------------------ 2. proportional pool allocation
  for (let i = 0; i < e.highWater; i++) {
    if (route[i] === ROUTE_NONE) continue;
    const cell = entCell[i]!;
    let C = 0;
    let bn = 0;
    let requested = 0;
    let supplied = 0;
    if (route[i] === ROUTE_MEAL) {
      C = mealReq[i]!;
      bn = c.mealC[i]! > 0 ? (C * c.mealN[i]!) / c.mealC[i]! : 0;
      requested = C;
      supplied = C;
    }
    const n = reqCount[i]!;
    for (let k = 0; k < n; k++) {
      const o = i * K + k;
      const fi = reqField[o]!;
      const pool = fieldAt[fi]![cell]!;
      const dem = demand[fi]![cell]!;
      const scale = dem > pool ? pool / dem : 1;
      const alloc = reqAmt[o]! * scale;
      reqAlloc[o] = alloc;
      const comp = COMPANION_INDEX[fi]!;
      const ratio = comp >= 0 && pool > 0 ? fieldAt[comp]![cell]! / pool : 0;
      reqRatio[o] = ratio;
      C += alloc;
      bn += alloc * ratio;
      requested += reqAmt[o]!;
      supplied += alloc;
    }
    carbonIn[i] = C;
    boundN[i] = bn;
    scaleFrac[i] = requested > 0 ? supplied / requested : 1;
    const nNeed = Math.max(0, NUTRIENT_PER_CARBON * C - bn);
    const sp = world.species[c.species[i]!]!;
    const oNeed = route[i] !== ROUTE_PHOTO && sp.aerobic ? O2_PER_CARBON_AEROBIC * C : 0;
    needN[i] = nNeed;
    needO2[i] = oNeed;
    demandN[cell]! += nNeed;
    demandO2[cell]! += oNeed;
    if (anyShell) {
      // SPEC §6.5: needSi = shellBuilder ? 0.10 × 0.50·C : 0, on every ordinary route (host drains are
      // parasites.ts and never shell builders).
      const isShell = shellSpecies[c.species[i]!]!;
      shellEnt[i] = isShell;
      if (isShell === 1) {
        if (!silicate) throw new Error(`stageIntake: shell builder ${sp.id} in a world without the silicate system`);
        const siNeed = SHELL_MINERAL_PER_BIOMASS * BIOMASS_FRACTION * C;
        needSi[i] = siNeed;
        if (siNeed > 0) {
          if (demandSi[cell] === 0) touchedSi.push(cell);
          demandSi[cell]! += siNeed;
        }
      }
    }
  }

  // ------------------------------------------- 3. limiting fractions from the stage snapshot
  const nutrient = world.fields.nutrient!;
  const oxygen = world.fields.oxygen!;
  stamp++;
  for (let i = 0; i < e.highWater; i++) {
    if (route[i] === ROUTE_NONE) continue;
    const cell = entCell[i]!;
    if (fracStamp[cell] === stamp) continue;
    fracStamp[cell] = stamp;
    fracNCell[cell] = demandN[cell]! > 0 ? Math.min(1, nutrient[cell]! / demandN[cell]!) : 1;
    fracOCell[cell] = demandO2[cell]! > 0 ? Math.min(1, oxygen[cell]! / demandO2[cell]!) : 1;
    // Silicate from the same snapshot, only where a shell builder asked for it this stage.
    if (anyShell) fracSiCell[cell] = demandSi[cell]! > 0 ? Math.min(1, silicate![cell]! / demandSi[cell]!) : 1;
  }

  // ----------------------------------------------------------------------------- 4. commit
  const co2 = world.fields.co2!;
  const metabolite = world.fields.metabolite!;
  const sugar = world.fields.sugar!;
  const acid = world.fields.acid!;
  const energyLedger = world.ledger.energy;
  let anyConsumed = false;
  for (let i = 0; i < e.highWater; i++) {
    if (route[i] === ROUTE_NONE) continue;
    const C = carbonIn[i]!;
    const sp = world.species[c.species[i]!]!;
    const prof = profileOf(world, i);
    const cell = entCell[i]!;
    if (C <= 0) {
      if (c.limitCode[i] === R.NONE) c.limitCode[i] = route[i] === ROUTE_PHOTO ? R.CO2_LIMITED : R.FOOD_NONE_COMPATIBLE;
      continue;
    }
    const nN = needN[i]!;
    const nO = needO2[i]!;
    const fracN = nN > 0 ? fracNCell[cell]! : 1;
    const fracO = nO > 0 ? fracOCell[cell]! : 1;
    // A shell builder is also limited by the silicate it got (SPEC §6.5); every other organism keeps
    // exactly min(fracN, fracO) and reads no silicate.
    const shell = anyShell && shellEnt[i] === 1;
    const fracSi = shell && needSi[i]! > 0 ? fracSiCell[cell]! : 1;
    const L = shell ? Math.min(fracN, fracO, fracSi) : Math.min(fracN, fracO);
    const Cs = C * L;
    if (Cs > 0) anyConsumed = true;

    // Remove consumed food with its proportional bound nutrient.
    if (route[i] === ROUTE_MEAL) {
      const mealBefore = c.mealC[i]!;
      const nUsed = mealBefore > 0 ? (Cs * c.mealN[i]!) / mealBefore : 0;
      subtractPool(world, c.mealC, i, Cs, 'c');
      subtractPool(world, c.mealN, i, nUsed, 'n');
    }
    const n = reqCount[i]!;
    for (let k = 0; k < n; k++) {
      const o = i * K + k;
      const fi = reqField[o]!;
      const take = reqAlloc[o]! * L;
      if (take > 0) markIntake(world, c.species[i]!, fi);
      subtractPool(world, fieldAt[fi]!, cell, take, IS_CARBON[fi] === 1 ? 'c' : 'n');
      const comp = COMPANION_INDEX[fi]!;
      if (comp >= 0) subtractPool(world, fieldAt[comp]!, cell, take * reqRatio[o]!, 'n');
    }
    const boundUsed = boundN[i]! * L;
    const freeUsed = nN * L;
    const gainN = NUTRIENT_PER_CARBON * Cs;
    const surplusN = Math.max(0, boundUsed - gainN);
    subtractPool(world, nutrient, cell, freeUsed, 'n');
    nutrient[cell]! += surplusN;
    c.N[i]! += gainN;

    if (shell) {
      // CT §12.3: 0.10 silicate bound into the shell per unit of biomass gained (an internal move).
      const bind = SHELL_MINERAL_PER_BIOMASS * (BIOMASS_FRACTION * Cs);
      if (bind > 0) {
        subtractPool(world, silicate!, cell, bind, 'm');
        c.boundMineral[i]! += bind;
      }
    }

    let energyGain: number;
    if (route[i] === ROUTE_PHOTO) {
      c.B[i]! += BIOMASS_FRACTION * Cs;
      sugar[cell]! += PHOTO_SUGAR_FRACTION * Cs;
      oxygen[cell]! += PHOTO_O2_PER_CARBON * Cs;
      energyGain = sp.def.energyPerCarbon * Cs;
    } else {
      c.B[i]! += BIOMASS_FRACTION * Cs;
      co2[cell]! += CO2_FRACTION * Cs;
      metabolite[cell]! += METABOLITE_FRACTION * Cs;
      if (sp.aerobic) oxygen[cell] = Math.max(0, oxygen[cell]! - O2_PER_CARBON_AEROBIC * Cs);
      if (sp.def.acidPerCarbon > 0) acid[cell]! += sp.def.acidPerCarbon * Cs;
      energyGain = sp.def.energyPerCarbon * Cs;
    }
    energyLedger.earned += energyGain;
    const E = c.E[i]! + energyGain;
    if (E > prof.energyCap) {
      energyLedger.dissipated += E - prof.energyCap;
      c.E[i] = prof.energyCap;
    } else c.E[i] = E;

    if (Cs > 0) {
      c.lastIntakeTick[i] = world.tick;
      c.intakeAccum[i]! += Cs;
      c.flags[i] = c.flags[i]! | FLAG.feeding;
      if (route[i] === ROUTE_DETRITUS) c.flags[i] = c.flags[i]! | FLAG.detritusIntake;
      if (Cs >= USABLE_INTAKE_FRACTION * prof.q * DT) c.flags[i] = c.flags[i]! | FLAG.usableIntake;
      milestone(world.events, 'firstIntake', world.tick);
    }

    // Leading constraint for the inspector: smallest supplied fraction wins.
    const budget = budgetArr[i]!;
    // An E06 carrier's food access is the CO2 it got against its light-shaped photosynthetic ceiling, so
    // its light response below is compared with the other supplied fractions on equal terms.
    const shaded = route[i] === ROUTE_PHOTO && prof.shade !== null;
    // A03's food access is likewise the CO2 it got against its low-light-shaped ceiling (Phase 5 wave 12).
    const lowLit = route[i] === ROUTE_PHOTO && sp.lowLight;
    const accessBase = shaded ? budget * photoCeilingShare(prof, light[cell]!) : lowLit ? budget * lowLightResponse(light[cell]!) : budget;
    const access = accessBase > 0 ? C / accessBase : 1;
    let code: number = R.NONE;
    let value = 1;
    if (route[i] === ROUTE_MEAL) {
      code = R.MEAL_DIGESTING;
      value = access;
    } else if (access < 0.95) {
      code = R.FOOD_ACCESS_LOW;
      value = access;
    }
    if (fracN < value && fracN < 1) {
      code = R.NUTRIENT_LIMITED;
      value = fracN;
    }
    if (fracO < value && fracO < 1) {
      code = R.OXYGEN_LIMITED;
      value = fracO;
    }
    if (fracSi < value && fracSi < 1) {
      code = R.SILICATE_LIMITED;
      value = fracSi;
    }
    // The carrier's light response (raw light without E06) competes; the measured light is what the Lab prints.
    if (route[i] === ROUTE_PHOTO && photoLightResponse(prof, light[cell]!, sp.lowLight) < value) {
      code = R.LIGHT_LIMITED;
      value = photoLightResponse(prof, light[cell]!, sp.lowLight);
    }
    if ((c.flags[i]! & FLAG.overCapacity) !== 0 && 0.5 <= value) {
      code = R.CROWDING_INTAKE_HALVED;
      value = 0.5;
    }
    c.limitCode[i] = code;
    c.limitValue[i] = code === R.LIGHT_LIMITED ? light[cell]! : value;
    // A04 (Phase 5 wave 12; SPEC §12.2): with no binding limit the reason is the mode it fed in this tick,
    // with the light it read; any binding limit (light, oxygen, nutrient, food access, crowding) keeps priority.
    if (code === R.NONE && sp.mixotroph) {
      c.limitCode[i] = route[i] === ROUTE_PHOTO ? R.MODE_PHOTO : R.MODE_SUGAR;
      c.limitValue[i] = light[cell]!;
    }
  }

  // Reserved host drains commit after the ordinary commit (their products are not consumed this stage).
  commitHostDrains(world);

  if (anyConsumed) {
    markField(world, 'co2');
    markField(world, 'metabolite');
    markField(world, 'oxygen');
    markField(world, 'sugar');
    markField(world, 'nutrient');
    markField(world, 'acid');
  }

}

/** Zero every demand entry written this pass (also runs when the stage throws). */
function clearScratch(): void {
  for (let t = 0; t < touched.length; t++) {
    const key = touched[t]!;
    const fi = Math.floor(key / CELL_COUNT);
    demand[fi]![key - fi * CELL_COUNT] = 0;
  }
  touched.length = 0;
  fieldAt.fill(undefined); // never keep another world's arrays alive between stages
  demandN.fill(0);
  demandO2.fill(0);
  for (let t = 0; t < touchedSi.length; t++) demandSi[touchedSi[t]!] = 0;
  touchedSi.length = 0;
}

/**
 * Fill shellSpecies (1 per species index whose native abilities include SHELL) for this stage and
 * return whether any species of this world is a shell builder. Only worlds recording a SHELL species
 * (A02, P05; the registry requires the silicate system for them) return true.
 */
function buildShellTable(world: World): boolean {
  const n = world.species.length;
  if (shellSpecies.length < n) shellSpecies = new Uint8Array(n);
  let any = false;
  for (let s = 0; s < n; s++) {
    const isShell = world.species[s]!.abilities.includes('SHELL') ? 1 : 0;
    shellSpecies[s] = isShell;
    if (isShell === 1) any = true;
  }
  return any;
}

const fracNCell = new Float64Array(CELL_COUNT);
const fracOCell = new Float64Array(CELL_COUNT);
const fracSiCell = new Float64Array(CELL_COUNT);
const fracStamp = new Uint32Array(CELL_COUNT);
let stamp = 0;


