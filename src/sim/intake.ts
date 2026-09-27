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

const K = 6; // max requests per organism
const ROUTE_NONE = 0;
const ROUTE_FIELD = 1;
const ROUTE_MEAL = 2;
const ROUTE_PHOTO = 3;

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
const scaleFrac = new Float64Array(AGENT_CAP);

const FIELD_INDEX: Readonly<Record<FieldId, number>> = Object.fromEntries(FIELD_IDS.map((id, i) => [id, i])) as Record<FieldId, number>;
const demand: (Float64Array | undefined)[] = [];
const demandN = new Float64Array(CELL_COUNT);
const demandO2 = new Float64Array(CELL_COUNT);
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

export function isIntakeEligible(world: World, slot: number): boolean {
  const c = world.ents.cols;
  return c.lifeState[slot] === 0; // Active (other life states arrive with dormancy/life stages)
}

export function stageIntake(world: World): void {
  const e = world.ents;
  const c = e.cols;
  const load = world.derived.cellLoad;
  const light = world.derived.light;
  touched.length = 0;

  // ---------------------------------------------------------------- 1. requests
  for (let i = 0; i < e.highWater; i++) {
    route[i] = ROUTE_NONE;
    reqCount[i] = 0;
    mealReq[i] = 0;
    carbonIn[i] = 0;
    if (c.alive[i] !== 1) continue;
    c.flags[i] = c.flags[i]! & ~FLAG.feeding;
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
    if (sp.photosynthetic && !sp.mixotroph) {
      const co2 = world.fields.co2![cell]!;
      const req = Math.min(co2, budget * light[cell]! * availability(co2));
      route[i] = ROUTE_PHOTO;
      addRequest(i, FIELD_INDEX.co2, req, cell);
      if (req <= 0) c.limitCode[i] = light[cell]! <= 0 ? R.LIGHT_LIMITED : R.CO2_LIMITED;
      continue;
    }
    const foods = prof.foods;
    if (foods.length === 0) {
      if (sp.isPredator) c.limitCode[i] = R.PRED_NO_PREY;
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
      const id = FIELD_IDS[fi]!;
      const pool = world.fields[id]![cell]!;
      const dem = demand[fi]![cell]!;
      const scale = dem > pool ? pool / dem : 1;
      const alloc = reqAmt[o]! * scale;
      reqAlloc[o] = alloc;
      const comp = FIELD_DEFS[id].companion;
      const ratio = comp && pool > 0 ? world.fields[comp]![cell]! / pool : 0;
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
    const L = Math.min(fracN, fracO);
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
      const id = FIELD_IDS[reqField[o]!]!;
      const take = reqAlloc[o]! * L;
      subtractPool(world, world.fields[id]!, cell, take, FIELD_DEFS[id].material === 'carbon' ? 'c' : 'n');
      const comp = FIELD_DEFS[id].companion;
      if (comp) subtractPool(world, world.fields[comp]!, cell, take * reqRatio[o]!, 'n');
    }
    const boundUsed = boundN[i]! * L;
    const freeUsed = nN * L;
    const gainN = NUTRIENT_PER_CARBON * Cs;
    const surplusN = Math.max(0, boundUsed - gainN);
    subtractPool(world, nutrient, cell, freeUsed, 'n');
    nutrient[cell]! += surplusN;
    c.N[i]! += gainN;

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
      milestone(world.events, 'firstIntake', world.tick);
    }

    // Leading constraint for the inspector: smallest supplied fraction wins.
    const budget = budgetArr[i]!;
    const access = budget > 0 ? C / budget : 1;
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
    if (route[i] === ROUTE_PHOTO && light[cell]! < value) {
      code = R.LIGHT_LIMITED;
      value = light[cell]!;
    }
    if ((c.flags[i]! & FLAG.overCapacity) !== 0 && 0.5 <= value) {
      code = R.CROWDING_INTAKE_HALVED;
      value = 0.5;
    }
    c.limitCode[i] = code;
    c.limitValue[i] = value;
  }

  if (anyConsumed) {
    markField(world, 'co2');
    markField(world, 'metabolite');
    markField(world, 'oxygen');
    markField(world, 'sugar');
    markField(world, 'nutrient');
    markField(world, 'acid');
  }

  // Clear demand scratch.
  for (let t = 0; t < touched.length; t++) {
    const key = touched[t]!;
    const fi = Math.floor(key / CELL_COUNT);
    demand[fi]![key - fi * CELL_COUNT] = 0;
  }
  for (let i = 0; i < e.highWater; i++) {
    if (route[i] === ROUTE_NONE) continue;
    const cell = entCell[i]!;
    demandN[cell] = 0;
    demandO2[cell] = 0;
  }
}

const fracNCell = new Float64Array(CELL_COUNT);
const fracOCell = new Float64Array(CELL_COUNT);
const fracStamp = new Uint32Array(CELL_COUNT);
let stamp = 0;


