/**
 * Stage 2 — environment and transport (SPEC §3.2, §4).
 *
 * Diffusion is an explicit conservative four-neighbor flux with per-edge coefficients (≤ 0.1, so a
 * cell never exports more than 40 % of its content and no pool can go negative). The kernel runs
 * row-major over the mask with per-cell "right" and "down" edge coefficients.
 *
 * Performance: fields are tracked as active/inactive. An inactive field is exactly zero everywhere
 * and costs nothing; any writer must call markField() (tests assert inactive fields stay zero).
 */
import {
  CELL_COUNT,
  CO2_ATMOSPHERE,
  DT,
  ENZYME_DECAY_PER_SECOND,
  BREAKER_DECAY_PER_SECOND,
  GAS_EXCHANGE_RATE,
  GAS_EXCHANGE_SEDIMENT_FACTOR,
  GRID_H,
  GRID_W,
  O2_ATMOSPHERE,
} from './constants';
import { FIELD_DEFS, FIELD_IDS, type FieldId } from './fields';
import { LIFE_ACTIVE } from './entities';
import { FILM_DECAY_PER_SECOND } from './film';
import { diffusionCoefficient, inMask, maskCells, SUB_SEDIMENT, SUB_WATER, transportOpen } from './grid';
import { climateStep, deriveClimateLight, deriveClimateMoisture, lightNeutral } from './climate';
import { EDGE_SHUTTER_OPEN, edgeCodeOf, edgeFactor, type EdgeBarrier } from './barriers';
import { channelStep } from './channel';
import { gateEdgesOf, gateTallyOn, tallyFieldFlux, type GateEdge } from './gateTally';
import { resinStep } from './resin';
import type { World } from './world';

export const FIELD_INDEX: Readonly<Record<FieldId, number>> = Object.fromEntries(FIELD_IDS.map((id, i) => [id, i])) as Record<FieldId, number>;

/** 1 where a field diffuses with the viral coefficient pair (FIELD_DEFS barrier 'viral'), by FIELD_IDS index. */
const VIRAL_FIELD = Uint8Array.from(FIELD_IDS.map((id) => (FIELD_DEFS[id].barrier === 'viral' ? 1 : 0)));

/** Per-world transport cache (derived; rebuilt when geometry changes). */
export interface TransportCache {
  version: number;
  /** Coefficient of the edge between cell i and i+1 (0 when not an open edge). */
  readonly kR: Float64Array;
  /** Coefficient of the edge between cell i and i+GRID_W. */
  readonly kD: Float64Array;
  /** Film-adjusted copies (rebuilt each tick while film exists). */
  readonly kRf: Float64Array;
  readonly kDf: Float64Array;
  /** Gas exchange rate per cell (0 for closed cells). */
  readonly gasRate: Float64Array;
  /** Mask span per row: [x0, x1] inclusive, or x0 > x1 when empty. */
  readonly rowX0: Int16Array;
  readonly rowX1: Int16Array;
  lightVersion: number;
  /**
   * Per-cell attachment surfaces (src/sim/attachment.ts SURF_* bits; SPEC §2.2, D-0006), built lazily
   * for this world only and rebuilt when its grid.geometryVersion moves past `attachVersion`, or when
   * world.devices is not the store (identity and length) the mask's S06 mesh bits were built from
   * (`attachMeshFrom`, null when it was built with no devices; Phase 5 wave 9).
   */
  readonly attach: Uint8Array;
  attachVersion: number;
  attachMeshFrom: readonly unknown[] | null;
  attachMeshLen: number;
  /**
   * Climate caches (src/sim/climate.ts; Phase 5, P5.1). All derived, never saved or hashed.
   * - lightRoofStamp: tc.roofStamp at the last keyed light recompute (with lightVersion, the key of a
   *   world whose light depends on S11 roofs only);
   * - moistureVersion: geometryVersion of the last substrate-default moisture write outside the fast path;
   * - roof / roofKey / roofStamp: cells under an S11 roof, the S11 cells (world.devices order) they were
   *   built from, and a counter bumped on every rebuild. Keyed on content, compared every call, so a
   *   device writer that skips the geometryVersion bump (or realizeRecipe's new array) cannot leave a
   *   stale roof;
   * - canopy / canopyLive: per-cell CANOPY biomass of the last light computation, and whether a living
   *   CANOPY organism existed then (lightFactors reads them, so it equals derived.light);
   * - warmthR / warmthD / warmthVersion / warmthShutters: warmth diffusion coefficients, keyed on
   *   geometryVersion and the closed S03 shutters' edge keys (content, compared every call).
   */
  lightRoofStamp: number;
  moistureVersion: number;
  roof: Uint8Array | null;
  readonly roofKey: number[];
  roofStamp: number;
  canopy: Float64Array | null;
  canopyLive: boolean;
  warmthR: Float64Array | null;
  warmthD: Float64Array | null;
  warmthVersion: number;
  readonly warmthShutters: number[];
  /**
   * Barrier transport (Phase 5 wave 10; SPEC §4.1, §4.9; CT §5.3; D-0117). All derived, never saved or
   * hashed, rebuilt with kR/kD (key: geometryVersion, plus the world.edges array's identity and length,
   * since realizeRecipe assigns a new store without a bump; every command writer bumps geometryVersion).
   * - kR/kD carry the dissolved/activity factor on barrier edges (the two classes' factors are equal for
   *   every CT §5.3 code; tests/sim/barrier-transport.test.ts pins it);
   * - kRv/kDv: the viral pair. The SAME arrays as kR/kD unless an S01 exists (the only code whose viral
   *   factor differs), then kRvOwn/kDvOwn = min(ki, kj) × the viral factor on barrier edges;
   * - kRvf/kDvf: the viral pair's film-adjusted copy, used only while the viral pair is separate;
   * - gateEdges: the S01–S03 edges whose diffusion flux is tallied (gateTally.ts).
   */
  edgesRef: readonly EdgeBarrier[] | null;
  edgesLen: number;
  kRv: Float64Array;
  kDv: Float64Array;
  kRvOwn: Float64Array | null;
  kDvOwn: Float64Array | null;
  kRvf: Float64Array | null;
  kDvf: Float64Array | null;
  readonly gateEdges: GateEdge[];
}

const scratch = new Float64Array(CELL_COUNT);

function createCache(): TransportCache {
  const rowX0 = new Int16Array(GRID_H).fill(1);
  const rowX1 = new Int16Array(GRID_H).fill(0);
  for (let y = 0; y < GRID_H; y++) {
    let x0 = -1;
    let x1 = -1;
    for (let x = 0; x < GRID_W; x++) {
      if (inMask(x, y)) {
        if (x0 < 0) x0 = x;
        x1 = x;
      }
    }
    if (x0 >= 0) {
      rowX0[y] = x0;
      rowX1[y] = x1;
    }
  }
  const kR = new Float64Array(CELL_COUNT);
  const kD = new Float64Array(CELL_COUNT);
  return {
    version: -1,
    kR,
    kD,
    kRf: new Float64Array(CELL_COUNT),
    kDf: new Float64Array(CELL_COUNT),
    gasRate: new Float64Array(CELL_COUNT),
    rowX0,
    rowX1,
    lightVersion: -1,
    attach: new Uint8Array(CELL_COUNT),
    attachVersion: -1,
    attachMeshFrom: null,
    attachMeshLen: 0,
    lightRoofStamp: -1,
    moistureVersion: -1,
    roof: null,
    roofKey: [],
    roofStamp: 0,
    canopy: null,
    canopyLive: false,
    warmthR: null,
    warmthD: null,
    warmthVersion: -1,
    warmthShutters: [],
    edgesRef: null,
    edgesLen: 0,
    kRv: kR,
    kDv: kD,
    kRvOwn: null,
    kDvOwn: null,
    kRvf: null,
    kDvf: null,
    gateEdges: [],
  };
}

/**
 * This world's transport cache object, created if missing, WITHOUT rebuilding its transport
 * coefficients (attachment.ts keeps its own version stamp on it). Derived state, never saved.
 */
export function transportCacheObject(world: World): TransportCache {
  const d = world.derived;
  let tc = d.transport;
  if (!tc) {
    tc = createCache();
    d.transport = tc;
  }
  return tc;
}

export function transportCache(world: World): TransportCache {
  const tc = transportCacheObject(world);
  const edges = world.edges;
  if (tc.version === world.grid.geometryVersion && tc.edgesRef === edges && tc.edgesLen === edges.length) return tc;
  const g = world.grid;
  tc.kR.fill(0);
  tc.kD.fill(0);
  tc.gasRate.fill(0);
  for (let y = 0; y < GRID_H; y++) {
    for (let x = tc.rowX0[y]!; x <= tc.rowX1[y]!; x++) {
      const i = y * GRID_W + x;
      if (!transportOpen(g, i)) continue;
      const ki = diffusionCoefficient(g.substrate[i]!);
      tc.gasRate[i] = g.substrate[i] === SUB_SEDIMENT ? GAS_EXCHANGE_RATE * GAS_EXCHANGE_SEDIMENT_FACTOR : GAS_EXCHANGE_RATE;
      if (x + 1 < GRID_W && inMask(x + 1, y) && transportOpen(g, i + 1)) {
        tc.kR[i] = Math.min(ki, diffusionCoefficient(g.substrate[i + 1]!));
      }
      if (y + 1 < GRID_H && inMask(x, y + 1) && transportOpen(g, i + GRID_W)) {
        tc.kD[i] = Math.min(ki, diffusionCoefficient(g.substrate[i + GRID_W]!));
      }
    }
  }
  tc.kRv = tc.kR;
  tc.kDv = tc.kD;
  tc.gateEdges.length = 0;
  if (edges.length > 0) applyBarrierFactors(tc, edges);
  tc.version = world.grid.geometryVersion;
  tc.edgesRef = edges;
  tc.edgesLen = edges.length;
  return tc;
}

/**
 * Edge barriers in the coefficients (SPEC §4.1 "Edge barriers multiply flux by their class factor";
 * CT §5.3; Phase 5 wave 10). Runs only when the world holds an edge barrier, after the v1.0 loop above,
 * and touches only barrier edges: kR[i] = min(ki, kj) × factor, so every other coefficient keeps its
 * v1.0 bits. An open shutter is no barrier (factor 1: left untouched); the S04 channel and a closed
 * shutter give 0 (D-0106: only the channel's directed transfer crosses it).
 */
function applyBarrierFactors(tc: TransportCache, edges: readonly EdgeBarrier[]): void {
  let anyS01 = false;
  for (let k = 0; k < edges.length; k++) {
    if (edges[k]!.kind === 'S01') {
      anyS01 = true;
      break;
    }
  }
  if (anyS01) {
    const r = tc.kRvOwn ?? new Float64Array(CELL_COUNT);
    const d = tc.kDvOwn ?? new Float64Array(CELL_COUNT);
    r.set(tc.kR);
    d.set(tc.kD);
    tc.kRvOwn = r;
    tc.kDvOwn = d;
    tc.kRv = r;
    tc.kDv = d;
  }
  for (let k = 0; k < edges.length; k++) {
    const e = edges[k]!;
    const code = edgeCodeOf(e);
    if (code === EDGE_SHUTTER_OPEN) continue;
    const down = e.dir === 'D';
    const arr = down ? tc.kD : tc.kR;
    arr[e.cell] = arr[e.cell]! * edgeFactor(code, 'dissolved');
    if (anyS01) {
      const v = down ? tc.kDv : tc.kRv;
      v[e.cell] = v[e.cell]! * edgeFactor(code, 'viral');
    }
  }
  gateEdgesOf(edges, tc.gateEdges);
}

/** Mark a field as possibly non-zero. Every writer into a diffusing field must call this. */
export function markField(world: World, id: FieldId): void {
  world.derived.fieldActive[FIELD_INDEX[id]] = 1;
}

export function isFieldActive(world: World, id: FieldId): boolean {
  return world.derived.fieldActive[FIELD_INDEX[id]] === 1;
}

/**
 * One explicit conservative diffusion step. `half` scales every coefficient by 0.5.
 * Returns false when the field turned out to be entirely zero (so it can be marked inactive).
 */
export function diffuseField(field: Float64Array, tc: TransportCache, kR: Float64Array, kD: Float64Array, half: boolean): boolean {
  const s = half ? 0.5 : 1;
  scratch.set(field);
  let any = false;
  for (let y = 0; y < GRID_H; y++) {
    const x0 = tc.rowX0[y]!;
    const x1 = tc.rowX1[y]!;
    const base = y * GRID_W;
    for (let i = base + x0, end = base + x1; i <= end; i++) {
      const a = field[i]!;
      if (a !== 0) any = true;
      const kr = kR[i]!;
      if (kr !== 0) {
        const f = kr * s * (a - field[i + 1]!);
        if (f !== 0) {
          scratch[i]! -= f;
          scratch[i + 1]! += f;
        }
      }
      const kd = kD[i]!;
      if (kd !== 0) {
        const f = kd * s * (a - field[i + GRID_W]!);
        if (f !== 0) {
          scratch[i]! -= f;
          scratch[i + GRID_W]! += f;
        }
      }
    }
  }
  if (!any) return false;
  field.set(scratch);
  return true;
}

interface CoefficientPairs {
  readonly kR: Float64Array;
  readonly kD: Float64Array;
  /** The viral pair (=== kR/kD unless the world holds an S01). */
  readonly kRv: Float64Array;
  readonly kDv: Float64Array;
}

function filmCoefficients(world: World, tc: TransportCache): CoefficientPairs {
  const film = world.fields.film;
  if (!film || !isFieldActive(world, 'film')) return { kR: tc.kR, kD: tc.kD, kRv: tc.kRv, kDv: tc.kDv };
  let anyFilm = false;
  let anyNonZero = false;
  for (let y = 0; y < GRID_H; y++) {
    const base = y * GRID_W;
    for (let i = base + tc.rowX0[y]!, end = base + tc.rowX1[y]!; i <= end; i++) {
      const v = film[i]!;
      const here = v > 0;
      if (here) anyFilm = true;
      if (v !== 0) anyNonZero = true;
      const r = tc.kR[i]!;
      tc.kRf[i] = r !== 0 && (here || film[i + 1]! > 0) ? r * 0.5 : r;
      const d = tc.kD[i]!;
      tc.kDf[i] = d !== 0 && (here || film[i + GRID_W]! > 0) ? d * 0.5 : d;
    }
  }
  // P3.12: film is a deposit (diffusion 'none'), so diffusion never clears its active flag and this scan
  // would run every tick for the rest of the dish once film had ever formed. When every dish cell holds
  // exactly 0 film the field is marked inactive (inactive fields are exactly zero; cells outside the dish
  // are never written); every film writer marks it again (construction.ts, sample.ts, tools.ts,
  // commands.ts). The coefficients are the same either way and filmStage still runs while filmN is
  // active: hash-neutral.
  if (!anyNonZero) world.derived.fieldActive[FIELD_INDEX.film] = 0;
  if (!anyFilm) return { kR: tc.kR, kD: tc.kD, kRv: tc.kRv, kDv: tc.kDv };
  if (tc.kRv === tc.kR) return { kR: tc.kRf, kD: tc.kDf, kRv: tc.kRf, kDv: tc.kDf };
  return { kR: tc.kRf, kD: tc.kDf, ...viralFilmCoefficients(film, tc) };
}

/**
 * The separate viral pair's film-adjusted copy (Phase 5 wave 10: only while the world holds an S01), by
 * the same rule as kRf/kDf above: film halves the barrier-adjusted coefficient (min × factor, then × 0.5).
 */
function viralFilmCoefficients(film: Float64Array, tc: TransportCache): { kRv: Float64Array; kDv: Float64Array } {
  const kRvf = tc.kRvf ?? new Float64Array(CELL_COUNT);
  const kDvf = tc.kDvf ?? new Float64Array(CELL_COUNT);
  tc.kRvf = kRvf;
  tc.kDvf = kDvf;
  for (let y = 0; y < GRID_H; y++) {
    const base = y * GRID_W;
    for (let i = base + tc.rowX0[y]!, end = base + tc.rowX1[y]!; i <= end; i++) {
      const here = film[i]! > 0;
      const r = tc.kRv[i]!;
      kRvf[i] = r !== 0 && (here || film[i + 1]! > 0) ? r * 0.5 : r;
      const d = tc.kDv[i]!;
      kDvf[i] = d !== 0 && (here || film[i + GRID_W]! > 0) ? d * 0.5 : d;
    }
  }
  return { kRv: kRvf, kDv: kDvf };
}

/** Multiply an activity field by (1 − fraction); values below 1e-9 are zeroed (not material). */
function decayActivity(world: World, id: FieldId, fraction: number): void {
  const arr = world.fields[id];
  if (!arr || !isFieldActive(world, id)) return;
  const keep = 1 - fraction;
  const cells = maskCells();
  let any = false;
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k]!;
    const v = arr[i]!;
    if (v === 0) continue;
    const nv = v * keep;
    if (nv < 1e-9) arr[i] = 0;
    else {
      arr[i] = nv;
      any = true;
    }
  }
  if (!any) world.derived.fieldActive[FIELD_INDEX[id]] = 0;
}

/**
 * Film in stage 2 (SPEC §7.1, CT §12.6 and §13; P3.3), only where this world has the film fields
 * (its recorded manifest enables the film system):
 * - decay: each cell moves film × 0.001 × dt carbon into detritus and filmN × 0.001 × dt into
 *   detritusN (an internal move; film keeps its N/C ratio);
 * - the film builders' attachment clocks (`filmSeconds`, film.ts) reset for every organism that is
 *   not Active, since stage 8 runs actions only for Active organisms ("continuous attached Active
 *   seconds").
 */
function filmStage(world: World): void {
  const film = world.fields.film;
  const filmN = world.fields.filmN;
  if (!film || !filmN) return;
  const c = world.ents.cols;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.filmSeconds[i] !== 0 && (c.alive[i] !== 1 || c.lifeState[i] !== LIFE_ACTIVE)) c.filmSeconds[i] = 0;
  }
  if (!isFieldActive(world, 'film') && !isFieldActive(world, 'filmN')) return;
  const det = world.fields.detritus!;
  const detN = world.fields.detritusN!;
  const frac = FILM_DECAY_PER_SECOND * DT;
  const cells = maskCells();
  let moved = false;
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k]!;
    const v = film[i]!;
    const n = filmN[i]!;
    if (v === 0 && n === 0) continue;
    const lostC = v * frac;
    const lostN = n * frac;
    film[i] = v - lostC;
    filmN[i] = n - lostN;
    det[i]! += lostC;
    detN[i]! += lostN;
    moved = true;
  }
  if (moved) {
    markField(world, 'detritus');
    markField(world, 'detritusN');
  }
}

/** Viral units decay into detritus carbon (no nutrient) — SPEC §7.5. */
function decayViral(world: World, id: 'v01' | 'v02'): void {
  const arr = world.fields[id];
  const det = world.fields.detritus;
  if (!arr || !det || !isFieldActive(world, id)) return;
  const cells = maskCells();
  const frac = 0.01 * DT;
  const per = FIELD_DEFS[id].carbonPerUnit ?? 0.01;
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k]!;
    const v = arr[i]!;
    if (v === 0) continue;
    const lost = v * frac;
    arr[i] = v - lost;
    det[i]! += lost * per;
  }
}

function gasExchange(world: World, tc: TransportCache): void {
  if (world.settings.lid === 'closed') return;
  const o2 = world.fields.oxygen!;
  const co2 = world.fields.co2!;
  const rate = tc.gasRate;
  let dC = 0;
  let dO = 0;
  for (let y = 0; y < GRID_H; y++) {
    const base = y * GRID_W;
    for (let i = base + tc.rowX0[y]!, end = base + tc.rowX1[y]!; i <= end; i++) {
      const r = rate[i]!;
      if (r === 0) continue;
      const dox = r * (O2_ATMOSPHERE - o2[i]!);
      const dcx = r * (CO2_ATMOSPHERE - co2[i]!);
      o2[i]! += dox;
      co2[i]! += dcx;
      dO += dox;
      dC += dcx;
    }
  }
  world.ledger.exchangeC += dC;
  world.ledger.exchangeO2 += dO;
  markField(world, 'oxygen');
  markField(world, 'co2');
}

function neutralize(world: World): void {
  if (!isFieldActive(world, 'acid') || !isFieldActive(world, 'base')) return;
  const acid = world.fields.acid!;
  const base = world.fields.base!;
  const cells = maskCells();
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k]!;
    const a = acid[i]!;
    const b = base[i]!;
    if (a > 0 && b > 0) {
      const n = Math.min(a, b);
      acid[i] = a - n;
      base[i] = b - n;
    }
  }
}

/**
 * Derived per-cell values used by suitability, photosynthesis and inspectors. `lightTick` is the tick
 * whose light cycle phase light is computed for: stage 2 passes world.tick; every other caller omits it
 * and gets the last completed stage 2, max(tick − 1, cycleStartTick) (climate.ts; D-0113). A world with
 * no active cycle, no CANOPY species and no recorded S11 roof keeps the v1.0 fast path below exactly.
 */
export function updateDerived(world: World, lightTick?: number): void {
  const d = world.derived;
  const g = world.grid;
  const cells = maskCells();
  const chem = isFieldActive(world, 'acid') || isFieldActive(world, 'base') || isFieldActive(world, 'buffer');
  if (chem || d.phUniform === false) {
    const acid = world.fields.acid!;
    const base = world.fields.base!;
    const buffer = world.fields.buffer!;
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k]!;
      const ph = 7 + (base[i]! - acid[i]!) / (1 + buffer[i]!);
      d.ph[i] = ph < 2 ? 2 : ph > 12 ? 12 : ph;
    }
    d.phUniform = !chem;
  }
  const tc = transportCache(world);
  if (!lightNeutral(world)) deriveClimateLight(world, tc, lightTick);
  else if (tc.lightVersion !== g.geometryVersion) {
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k]!;
      const light = g.lightBase[i]! * g.shade[i]!;
      d.light[i] = light < 0 ? 0 : light > 1 ? 1 : light;
      d.moisture[i] = g.substrate[i] === SUB_WATER ? 1 : 0.8;
    }
    tc.lightVersion = g.geometryVersion;
  }
  if (world.climate.moisture !== null) deriveClimateMoisture(world);
}

/**
 * Stage 2 (SPEC §3.2): climate (cycle phase is read by updateDerived; local warmth, then moisture;
 * climate.ts, inert without 'climate'), transport of every diffusing field (barrier-aware, with the gate
 * tallies' pre-step flux), the S04 channel's directed transfers, gas exchange, decays, film, S08 resin
 * adsorption, neutralization, then derived pH, light (with canopy) and moisture for this tick.
 */
export function stageEnvironment(world: World): void {
  const tc = transportCache(world);
  climateStep(world, tc);
  const { kR, kD, kRv, kDv } = filmCoefficients(world, tc);
  const active = world.derived.fieldActive;
  // Gate tallies (observation only; gateTally.ts): only where the world records 'barriers' and holds edges.
  const tally = gateTallyOn(world);
  for (let fi = 0; fi < FIELD_IDS.length; fi++) {
    const id = FIELD_IDS[fi]!;
    const arr = world.fields[id];
    if (!arr || active[fi] === 0) continue;
    const cls = FIELD_DEFS[id].diffusion;
    if (cls === 'none') continue;
    const viral = VIRAL_FIELD[fi] === 1;
    const r = viral ? kRv : kR;
    const d = viral ? kDv : kD;
    const half = cls !== 'normal';
    if (tally) tallyFieldFlux(world, tc.gateEdges, id, arr, r, d, half);
    if (!diffuseField(arr, tc, r, d, half)) active[fi] = 0;
  }
  // The S04 channel's directed transfers (channel.ts; inert without edges or 'barriers').
  channelStep(world);
  gasExchange(world, tc);
  // Decays (SPEC §4.3, §5.3, §7.5). Per-second rates × dt; inhibitors decay per tick.
  decayActivity(world, 'inhBact', 0.002);
  decayActivity(world, 'inhFung', 0.002);
  decayActivity(world, 'inhPhoto', 0.002);
  decayActivity(world, 'eStarch', ENZYME_DECAY_PER_SECOND * DT);
  decayActivity(world, 'eOil', ENZYME_DECAY_PER_SECOND * DT);
  decayActivity(world, 'eProtein', ENZYME_DECAY_PER_SECOND * DT);
  decayActivity(world, 'breaker', BREAKER_DECAY_PER_SECOND * DT);
  decayActivity(world, 'sGlow', 0.01 * DT);
  decayActivity(world, 'quencher', 0.01 * DT);
  decayActivity(world, 'rival', 0.02 * DT);
  decayViral(world, 'v01');
  decayViral(world, 'v02');
  filmStage(world);
  // S08 adsorption resin (resin.ts; inert without devices or 'devices').
  resinStep(world);
  neutralize(world);
  updateDerived(world, world.tick);
}

/** Test support: every inactive allocated field must be exactly zero. Returns offending field ids. */
export function inactiveFieldsNonZero(world: World): FieldId[] {
  const out: FieldId[] = [];
  const cells = maskCells();
  for (let fi = 0; fi < FIELD_IDS.length; fi++) {
    const id = FIELD_IDS[fi]!;
    const arr = world.fields[id];
    if (!arr || world.derived.fieldActive[fi] === 1) continue;
    for (let k = 0; k < cells.length; k++) {
      if (arr[cells[k]!] !== 0) {
        out.push(id);
        break;
      }
    }
  }
  return out;
}
