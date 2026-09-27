/**
 * Conservation ledger (SPEC §3.4). Carbon, nutrient and mineral are conserved within tolerance:
 * total(now) = initial + inputs − exports + net atmospheric exchange. Energy is not conserved but
 * every gain and loss is tallied for diagnostics.
 */
import { CARBON_WITH_COMPANION, FIELD_DEFS, FIELD_IDS } from './fields';
import { LEDGER_RELATIVE_TOLERANCE } from './constants';
import type { World } from './world';
import { maskCells } from './grid';

export interface MaterialTotals {
  c: number;
  n: number;
  m: number;
}

export interface LedgerEntry {
  readonly tick: number;
  readonly source: string;
  readonly c: number;
  readonly n: number;
  readonly m: number;
}

export interface Ledger {
  initial: MaterialTotals;
  initialized: boolean;
  inputs: MaterialTotals;
  exports: MaterialTotals;
  /** Net carbon gained from the atmosphere (CO2 exchange); negative when outgassing. */
  exchangeC: number;
  /** Net oxygen gained from the atmosphere (not a conserved material; logged for display). */
  exchangeO2: number;
  roundoff: MaterialTotals;
  energy: {
    earned: number;
    maintenance: number;
    movement: number;
    division: number;
    secretion: number;
    dissipated: number;
    other: number;
  };
  /** Most recent external inputs/exports (bounded) for the ledger panel. */
  entries: LedgerEntry[];
}

const MAX_ENTRIES = 200;

export function createLedger(): Ledger {
  return {
    initial: { c: 0, n: 0, m: 0 },
    initialized: false,
    inputs: { c: 0, n: 0, m: 0 },
    exports: { c: 0, n: 0, m: 0 },
    exchangeC: 0,
    exchangeO2: 0,
    roundoff: { c: 0, n: 0, m: 0 },
    energy: { earned: 0, maintenance: 0, movement: 0, division: 0, secretion: 0, dissipated: 0, other: 0 },
    entries: [],
  };
}

export function recordInput(world: World, source: string, c: number, n: number, m = 0): void {
  const L = world.ledger;
  L.inputs.c += c;
  L.inputs.n += n;
  L.inputs.m += m;
  pushEntry(L, { tick: world.tick, source, c, n, m });
}

export function recordExport(world: World, source: string, c: number, n: number, m = 0): void {
  const L = world.ledger;
  L.exports.c += c;
  L.exports.n += n;
  L.exports.m += m;
  pushEntry(L, { tick: world.tick, source, c: -c, n: -n, m: -m });
}

function pushEntry(L: Ledger, e: LedgerEntry): void {
  // Merge consecutive entries from the same source and tick to stay bounded.
  const last = L.entries[L.entries.length - 1];
  if (last && last.tick === e.tick && last.source === e.source) {
    L.entries[L.entries.length - 1] = { ...last, c: last.c + e.c, n: last.n + e.n, m: last.m + e.m };
    return;
  }
  L.entries.push(e);
  if (L.entries.length > MAX_ENTRIES) L.entries.splice(0, L.entries.length - MAX_ENTRIES);
}

/** Sum every tracked compartment of the world. */
export function computeTotals(world: World): MaterialTotals & { breakdown: Record<string, number> } {
  const cells = maskCells();
  const breakdown: Record<string, number> = {};
  let c = 0;
  let n = 0;
  let m = 0;
  for (const id of FIELD_IDS) {
    const arr = world.fields[id];
    if (!arr) continue;
    const def = FIELD_DEFS[id];
    if (def.material === 'none') continue;
    let s = 0;
    for (let k = 0; k < cells.length; k++) s += arr[cells[k]!]!;
    const per = def.carbonPerUnit ?? 1;
    const amount = s * per;
    breakdown[id] = amount;
    if (def.material === 'carbon') c += amount;
    else if (def.material === 'nutrient') n += amount;
    else m += amount;
  }
  const e = world.ents;
  const cols = e.cols;
  let bodyC = 0;
  let bodyN = 0;
  let mealC = 0;
  let mealN = 0;
  let mineral = 0;
  for (let i = 0; i < e.highWater; i++) {
    if (cols.alive[i] !== 1) continue;
    bodyC += cols.B[i]!;
    bodyN += cols.N[i]!;
    mealC += cols.mealC[i]!;
    mealN += cols.mealN[i]!;
    mineral += cols.boundMineral[i]! + cols.jacketMineral[i]!;
  }
  breakdown.bodyC = bodyC;
  breakdown.bodyN = bodyN;
  breakdown.mealC = mealC;
  breakdown.mealN = mealN;
  breakdown.bodyMineral = mineral;
  c += bodyC + mealC;
  n += bodyN + mealN;
  m += mineral;
  return { c, n, m, breakdown };
}

/** Pair carbon pools with their companion nutrient fields (for inspectors and fixtures). */
export const COMPANIONS = CARBON_WITH_COMPANION;

export function initializeLedger(world: World): void {
  const t = computeTotals(world);
  world.ledger.initial = { c: t.c, n: t.n, m: t.m };
  world.ledger.initialized = true;
}

export interface LedgerCheck {
  readonly ok: boolean;
  readonly expected: MaterialTotals;
  readonly actual: MaterialTotals;
  readonly relErr: MaterialTotals;
}

export function expectedTotals(world: World): MaterialTotals {
  const L = world.ledger;
  // Logged roundoff (negative dust zeroed at subtraction) is part of the explained total.
  return {
    c: L.initial.c + L.inputs.c - L.exports.c + L.exchangeC + L.roundoff.c,
    n: L.initial.n + L.inputs.n - L.exports.n + L.roundoff.n,
    m: L.initial.m + L.inputs.m - L.exports.m + L.roundoff.m,
  };
}

function rel(actual: number, expected: number): number {
  const d = Math.abs(actual - expected);
  if (expected === 0) return d === 0 ? 0 : Infinity;
  return d / Math.abs(expected);
}

export function checkLedger(world: World, tolerance = LEDGER_RELATIVE_TOLERANCE): LedgerCheck {
  const actual = computeTotals(world);
  const expected = expectedTotals(world);
  const relErr = { c: rel(actual.c, expected.c), n: rel(actual.n, expected.n), m: rel(actual.m, expected.m) };
  const within = (r: number, exp: number, act: number) => (exp === 0 ? Math.abs(act) < 1e-9 : r <= tolerance);
  return {
    ok: within(relErr.c, expected.c, actual.c) && within(relErr.n, expected.n, actual.n) && within(relErr.m, expected.m, actual.m),
    expected,
    actual: { c: actual.c, n: actual.n, m: actual.m },
    relErr,
  };
}
