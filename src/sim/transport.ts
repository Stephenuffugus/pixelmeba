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
import { diffusionCoefficient, inMask, maskCells, SUB_SEDIMENT, SUB_WATER, transportOpen } from './grid';
import type { World } from './world';

export const FIELD_INDEX: Readonly<Record<FieldId, number>> = Object.fromEntries(FIELD_IDS.map((id, i) => [id, i])) as Record<FieldId, number>;

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
  return {
    version: -1,
    kR: new Float64Array(CELL_COUNT),
    kD: new Float64Array(CELL_COUNT),
    kRf: new Float64Array(CELL_COUNT),
    kDf: new Float64Array(CELL_COUNT),
    gasRate: new Float64Array(CELL_COUNT),
    rowX0,
    rowX1,
    lightVersion: -1,
  };
}

export function transportCache(world: World): TransportCache {
  const d = world.derived;
  let tc = d.transport;
  if (!tc) {
    tc = createCache();
    d.transport = tc;
  }
  if (tc.version === world.grid.geometryVersion) return tc;
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
  tc.version = world.grid.geometryVersion;
  return tc;
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

function filmCoefficients(world: World, tc: TransportCache): { kR: Float64Array; kD: Float64Array } {
  const film = world.fields.film;
  if (!film || !isFieldActive(world, 'film')) return { kR: tc.kR, kD: tc.kD };
  let anyFilm = false;
  for (let y = 0; y < GRID_H; y++) {
    const base = y * GRID_W;
    for (let i = base + tc.rowX0[y]!, end = base + tc.rowX1[y]!; i <= end; i++) {
      const here = film[i]! > 0;
      if (here) anyFilm = true;
      const r = tc.kR[i]!;
      tc.kRf[i] = r !== 0 && (here || film[i + 1]! > 0) ? r * 0.5 : r;
      const d = tc.kD[i]!;
      tc.kDf[i] = d !== 0 && (here || film[i + GRID_W]! > 0) ? d * 0.5 : d;
    }
  }
  return anyFilm ? { kR: tc.kRf, kD: tc.kDf } : { kR: tc.kR, kD: tc.kD };
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

/** Derived per-cell values used by suitability, photosynthesis and inspectors. */
export function updateDerived(world: World): void {
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
  if (tc.lightVersion !== g.geometryVersion) {
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k]!;
      const light = g.lightBase[i]! * g.shade[i]!;
      d.light[i] = light < 0 ? 0 : light > 1 ? 1 : light;
      d.moisture[i] = g.substrate[i] === SUB_WATER ? 1 : 0.8;
    }
    tc.lightVersion = g.geometryVersion;
  }
}

export function stageEnvironment(world: World): void {
  const tc = transportCache(world);
  const { kR, kD } = filmCoefficients(world, tc);
  const active = world.derived.fieldActive;
  for (let fi = 0; fi < FIELD_IDS.length; fi++) {
    const id = FIELD_IDS[fi]!;
    const arr = world.fields[id];
    if (!arr || active[fi] === 0) continue;
    const cls = FIELD_DEFS[id].diffusion;
    if (cls === 'none') continue;
    if (!diffuseField(arr, tc, kR, kD, cls !== 'normal')) active[fi] = 0;
  }
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
  neutralize(world);
  updateDerived(world);
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
