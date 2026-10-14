/**
 * Climate (Phase 5, P5.1; SPEC §3.2 stage 2, §4.4, §4.6–§4.8, §4.10, §6.3; CT §4, §12.2, §13; D-0106,
 * D-0113): the day/night cycle, effective light with the S11 roof and the CANOPY factor, local warmth
 * (relax, diffuse, heater/cooler, clamp) and the moisture index (drying, roof, wick, wetting, repaint).
 *
 * Gating (D-0103). Every rule runs only when the world records it: the cycle, warmth and moisture need
 * the 'climate' system; the roof's light rule needs a recorded S11 (worldHasStructure); canopy needs a
 * species with the CANOPY native ability in world.species (keyed on the ability, never a species id).
 * A world that records none of them takes transport.ts updateDerived's old fast path byte for byte, and
 * climateStep returns at its first check.
 *
 * Lazy arrays (world.climate; g5-plan "Risks to watch"). The warmth array is allocated in stage 2 when an
 * S09 or S10 is On; the moisture array in stage 2 when drying is on, or by ensureMoisture (the wet brush,
 * wave 10). Allocation is driven by recorded settings and devices only: no reader (lightFactors,
 * localWarmthAt, moistureAt, updateDerived, snapshot) allocates. Once allocated an array is never freed.
 * Every value stays in [0, 1] (the import refuses anything else): warmth is clamped each tick, and every
 * moisture write is bounded by construction (drying floors at 0.1, the wick never overshoots 0.8, wetting
 * writes 0.9, water is 1).
 *
 * Light convention (D-0113). Stage 2 of tick T computes light for t = T. Every other updateDerived caller
 * (realize, load, a paused command, sample commit, experiments) uses t = max(tick − 1, cycleStartTick),
 * "the last completed stage 2", so a reloaded or paused world shows what the uninterrupted world showed
 * after stage 2 of tick T − 1. Canopy reads the biomass when light is computed: at the end of stage 2 that
 * equals the biomass at the start of stage 2 (stage 2 moves no organism: wave 10's S04 channel moves only
 * Small organisms and A05 is Medium; it includes this tick's stage 1 inoculations, SPEC §3.2). Outside
 * stage 2 it reads the current biomass, so after a reload the displayed canopy may differ until the next
 * stage 2. The state hash cannot: no simulation reader of derived.light runs before stage 2 (intake is
 * stage 6, E07 light seeking and A04's mode update stage 4 (mixotrophy.ts updateMode), dormancy stage 7,
 * a newborn A04's mode stage 9 (births.ts commitDivision); stage 1 reads no light).
 *
 * Nothing here draws randomness, iterates a Map/Set/object key order, or moves material: heat and
 * moisture are indices, so no ledger line changes and no field is read or written (drying never
 * concentrates chemicals: SPEC §4.8).
 */
import {
  CANOPY_BIOMASS_SCALE,
  CELL_COUNT,
  CYCLE_DAWN_TICKS,
  CYCLE_DAY_TICKS,
  CYCLE_DUSK_TICKS,
  CYCLE_NIGHT_FACTOR,
  CYCLE_NIGHT_TICKS,
  CYCLE_PERIOD_TICKS,
  DRYING_PER_SECOND,
  DT,
  GRID_H,
  GRID_W,
  MOISTURE_FLOOR,
  MOISTURE_START,
  MOISTURE_WATER,
  ROOF_SHADE,
  TICKS_PER_SECOND,
  WARMTH_DEVICE_PER_SECOND,
  WARMTH_DIFFUSION,
  WARMTH_RELAX_PER_TICK,
  WETTING_MOISTURE,
  WICK_PER_SECOND,
  WICK_TARGET,
} from './constants';
import { cellInDish, EDGE_SHUTTER_CLOSED, edgeCodeArrays, edgeCodeOf, edgeKey } from './barriers';
import { worldHasStructure, worldHasSystem } from './gates';
import { inMask, maskCells, ST_STONE, ST_WALL, SUB_WATER, transportOpen, type Grid } from './grid';
import type { SpeciesRT } from './species';
import { entityCell } from './spatial';
import { diffuseField, transportCache, type TransportCache } from './transport';
import type { World } from './world';

/** Per-tick amounts (rate × DT, computed once). */
const DRYING_PER_TICK = DRYING_PER_SECOND * DT;
const WICK_PER_TICK = WICK_PER_SECOND * DT;
const WARMTH_DEVICE_PER_TICK = WARMTH_DEVICE_PER_SECOND * DT;

// ---- Day/night cycle (SPEC §4.6; CT §12.2) --------------------------------------------------------------

const DUSK_START = CYCLE_DAY_TICKS;
const NIGHT_START = DUSK_START + CYCLE_DUSK_TICKS;
const DAWN_START = NIGHT_START + CYCLE_NIGHT_TICKS;
if (DAWN_START + CYCLE_DAWN_TICKS !== CYCLE_PERIOD_TICKS) throw new Error('climate: the cycle phases do not add up to the period');

export type CyclePhaseName = 'day' | 'dusk' | 'night' | 'dawn';

/** Whether the light cycles in this world: it records 'climate' and its light mode is 'cycle'. */
export function cycleActive(world: Pick<World, 'content' | 'settings'>): boolean {
  return world.settings.lightMode === 'cycle' && worldHasSystem(world, 'climate');
}

/** The cycle phase in ticks [0, 2400) at tick t: (t − cycleStartTick) mod 2400. */
export function cyclePhaseTick(world: Pick<World, 'settings'>, t: number): number {
  const start = world.settings.cycleStartTick ?? 0;
  return (((t - start) % CYCLE_PERIOD_TICKS) + CYCLE_PERIOD_TICKS) % CYCLE_PERIOD_TICKS;
}

/** The light factor at phase p (ticks): day 1, dusk linear 1 → 0.05, night 0.05, dawn linear 0.05 → 1. */
export function cycleFactor(p: number): number {
  return p < DUSK_START
    ? 1
    : p < NIGHT_START
      ? 1 - ((1 - CYCLE_NIGHT_FACTOR) * (p - DUSK_START)) / CYCLE_DUSK_TICKS
      : p < DAWN_START
        ? CYCLE_NIGHT_FACTOR
        : CYCLE_NIGHT_FACTOR + ((1 - CYCLE_NIGHT_FACTOR) * (p - DAWN_START)) / CYCLE_DAWN_TICKS;
}

/** The name of phase p. */
export function cyclePhaseName(p: number): CyclePhaseName {
  return p < DUSK_START ? 'day' : p < NIGHT_START ? 'dusk' : p < DAWN_START ? 'night' : 'dawn';
}

function phaseStart(p: number): number {
  return p < DUSK_START ? 0 : p < NIGHT_START ? DUSK_START : p < DAWN_START ? NIGHT_START : DAWN_START;
}

/**
 * The light tick of every updateDerived caller other than stage 2 (D-0113): the last completed stage 2,
 * max(tick − 1, cycleStartTick).
 */
export function lastStageLightTick(world: Pick<World, 'tick' | 'settings'>): number {
  return Math.max(world.tick - 1, world.settings.cycleStartTick ?? 0);
}

// ---- Effective light (SPEC §4.4, §4.10) -------------------------------------------------------------------

/**
 * Effective light of one cell (SPEC §4.4): source = clamp(baseline × cycle, 0, 1);
 * effective = clamp(source × shade × roof × canopy, 0, 1). The one function updateDerived and lightFactors use.
 */
export function effectiveLight(baseline: number, cycle: number, shade: number, roof: number, canopy: number): number {
  const s = baseline * cycle;
  const source = s < 0 ? 0 : s > 1 ? 1 : s;
  const e = source * shade * roof * canopy;
  return e < 0 ? 0 : e > 1 ? 1 : e;
}

/**
 * The canopy factor of a cell from per-cell CANOPY biomass sums: 1/(1 + S/10), S summed over the cell and
 * its four neighbours in the fixed order own, E, S, W, N; exactly 1 where S = 0. Neighbours outside the
 * dish hold 0 (no organism lives there; the dish keeps at least 4 cells from the grid border, so no index
 * wraps), so adding them is adding exact zeros: "in-dish neighbours only".
 */
export function canopyAt(sums: Float64Array, cell: number): number {
  const s = sums[cell]! + sums[cell + 1]! + sums[cell + GRID_W]! + sums[cell - 1]! + sums[cell - GRID_W]!;
  return s === 0 ? 1 : 1 / (1 + s / CANOPY_BIOMASS_SCALE);
}

// eslint-disable-next-line no-restricted-syntax -- lookup only, never iterated
const canopyFlags = new WeakMap<readonly SpeciesRT[], Uint8Array | null>();

/** Per species index: 1 when it has the CANOPY native ability; null when none does (cached per species table). */
function canopySpecies(world: Pick<World, 'species'>): Uint8Array | null {
  let f = canopyFlags.get(world.species);
  if (f === undefined) {
    const flags = Uint8Array.from(world.species, (sp) => (sp.abilities.includes('CANOPY') ? 1 : 0));
    f = flags.includes(1) ? flags : null;
    canopyFlags.set(world.species, f);
  }
  return f;
}

/** Whether this world records a species with the CANOPY ability. */
export function hasCanopySpecies(world: Pick<World, 'species'>): boolean {
  return canopySpecies(world) !== null;
}

/**
 * Per-cell CANOPY biomass (living organisms, accumulated in slot order) into `sums`. Returns whether a
 * living CANOPY organism exists.
 */
function accumulateCanopy(world: World, flags: Uint8Array, sums: Float64Array): boolean {
  sums.fill(0);
  const c = world.ents.cols;
  let live = false;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1 || flags[c.species[i]!] !== 1) continue;
    sums[entityCell(c.x[i]!, c.y[i]!)]! += c.B[i]!;
    live = true;
  }
  return live;
}

/**
 * Cells under an S11 shade roof (1); null when the world records no S11. Cached on the transport cache and
 * keyed on CONTENT, not on geometryVersion or the devices array's identity: every call compares the S11
 * cells in world.devices order with the key of the last build (devices are few), so a writer that pushes
 * a roof or moves a Device.cell in place without bumping geometryVersion still gets the right roof, and a
 * running dish never diverges from its reload (verifier fix, g5 wave 9). tc.roofStamp counts rebuilds;
 * the keyed light path compares it.
 */
function roofCells(world: World, tc: TransportCache): Uint8Array | null {
  if (!worldHasStructure(world, 'S11')) return null;
  const key = tc.roofKey;
  let same = tc.roof !== null;
  let n = 0;
  for (const d of world.devices) {
    if (d.kind !== 'S11') continue;
    if (same && (n >= key.length || key[n] !== d.cell)) same = false;
    n++;
  }
  if (same && n === key.length) return tc.roof;
  const r = tc.roof ?? new Uint8Array(CELL_COUNT);
  r.fill(0);
  key.length = 0;
  for (const d of world.devices) {
    if (d.kind !== 'S11') continue;
    r[d.cell] = 1;
    key.push(d.cell);
  }
  tc.roof = r;
  tc.roofStamp++;
  return r;
}

/**
 * Whether derived light takes the old fast path: no active cycle, no CANOPY species and no recorded S11.
 * Then light is clamp(lightBase × shade, 0, 1) exactly as in v1.0.
 */
export function lightNeutral(world: World): boolean {
  return !cycleActive(world) && canopySpecies(world) === null && !worldHasStructure(world, 'S11');
}

/**
 * Derived light (and the substrate moisture default) for a world that is not lightNeutral; called by
 * transport.ts updateDerived. Recomputed every call while the cycle is active or a living CANOPY organism
 * exists (then tc.lightVersion = −1, so leaving the cycle or losing the last canopy organism recomputes
 * once on whichever path runs next); otherwise only when geometryVersion or the roof cells (roofCells'
 * content key, tc.roofStamp) moved.
 */
export function deriveClimateLight(world: World, tc: TransportCache, lightTick: number | undefined): void {
  const g = world.grid;
  const d = world.derived;
  const gv = g.geometryVersion;
  const cyc = cycleActive(world);
  const roof = roofCells(world, tc);
  const flags = canopySpecies(world);
  let canopy: Float64Array | null = null;
  if (flags !== null) {
    const sums = (tc.canopy ??= new Float64Array(CELL_COUNT));
    tc.canopyLive = accumulateCanopy(world, flags, sums);
    if (tc.canopyLive) canopy = sums;
  } else tc.canopyLive = false;
  const perTick = cyc || canopy !== null;
  if (perTick || tc.lightVersion !== gv || tc.lightRoofStamp !== tc.roofStamp) {
    const f = cyc ? cycleFactor(cyclePhaseTick(world, lightTick ?? lastStageLightTick(world))) : 1;
    const cells = maskCells();
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k]!;
      const r = roof !== null && roof[i] === 1 ? ROOF_SHADE : 1;
      d.light[i] = effectiveLight(g.lightBase[i]!, f, g.shade[i]!, r, canopy !== null ? canopyAt(canopy, i) : 1);
    }
    if (perTick) tc.lightVersion = -1;
    else {
      tc.lightVersion = gv;
      tc.lightRoofStamp = tc.roofStamp;
    }
  }
  if (world.climate.moisture === null && tc.moistureVersion !== gv) {
    const cells = maskCells();
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k]!;
      d.moisture[i] = g.substrate[i] === SUB_WATER ? MOISTURE_WATER : MOISTURE_START;
    }
    tc.moistureVersion = gv;
  }
}

/** derived.moisture from the local moisture array (water cells 1); called every updateDerived while the array exists. */
export function deriveClimateMoisture(world: World): void {
  const m = world.climate.moisture;
  if (m === null) return;
  const g = world.grid;
  const out = world.derived.moisture;
  const cells = maskCells();
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k]!;
    out[i] = g.substrate[i] === SUB_WATER ? MOISTURE_WATER : m[i]!;
  }
}

export interface ClimateLightFactors {
  /** Cycle mode only: the phase of the last completed stage 2, its light factor and seconds into the phase. */
  readonly cycle?: { readonly phase: CyclePhaseName; readonly factor: number; readonly secondsIntoPhase: number };
  /** 0.25 under an S11 roof, else 1. */
  readonly roof: number;
  /** The canopy factor used for this cell's light. */
  readonly canopy: number;
  /** The light organisms receive (equals world.derived.light[cell] between steps). */
  readonly effective: number;
}

/**
 * The climate light factors of a cell (SPEC §4.4 "the inspector shows every factor"), at the light tick
 * convention of updateDerived outside stage 2, with the canopy sums of the last light computation (so
 * `effective` is bit-identical to world.derived.light[cell]). Read-only: allocates no climate array.
 */
export function climateLightAt(world: World, cell: number): ClimateLightFactors {
  const g = world.grid;
  const baseline = g.lightBase[cell]!;
  const shade = g.shade[cell]!;
  let roof = 1;
  if (worldHasStructure(world, 'S11')) for (const d of world.devices) if (d.kind === 'S11' && d.cell === cell) roof = ROOF_SHADE;
  let canopy = 1;
  const flags = canopySpecies(world);
  if (flags !== null) {
    const tc = world.derived.transport;
    if (tc !== null && tc.canopy !== null) canopy = tc.canopyLive ? canopyAt(tc.canopy, cell) : 1;
    else {
      const sums = new Float64Array(CELL_COUNT);
      if (accumulateCanopy(world, flags, sums)) canopy = canopyAt(sums, cell);
    }
  }
  if (lightNeutral(world)) {
    const l = baseline * shade;
    return { roof, canopy, effective: l < 0 ? 0 : l > 1 ? 1 : l };
  }
  if (!cycleActive(world)) return { roof, canopy, effective: effectiveLight(baseline, 1, shade, roof, canopy) };
  const p = cyclePhaseTick(world, lastStageLightTick(world));
  const factor = cycleFactor(p);
  return {
    cycle: { phase: cyclePhaseName(p), factor, secondsIntoPhase: (p - phaseStart(p)) / TICKS_PER_SECOND },
    roof,
    canopy,
    effective: effectiveLight(baseline, factor, shade, roof, canopy),
  };
}

// ---- Stage 2: local warmth and moisture (SPEC §4.7, §4.8) ------------------------------------------------

/** Stage 2's climate step (first in stage 2, SPEC §3.2): warmth, then moisture. Inert without 'climate'. */
export function climateStep(world: World, tc: TransportCache = transportCache(world)): void {
  if (!worldHasSystem(world, 'climate')) return;
  warmthStep(world, tc);
  moistureStep(world, tc);
}

function anyWarmthDeviceOn(world: World): boolean {
  for (const d of world.devices) if ((d.kind === 'S09' || d.kind === 'S10') && d.on === true) return true;
  return false;
}

/**
 * Warmth diffusion coefficients: WARMTH_DIFFUSION on an edge whose two cells are in the dish and pass
 * solutes (water, gel, sediment or bead: stone and wall stop warmth) and that is not a closed S03 shutter
 * (D-0106: S01, S02, an open S03 and the S04 channel pass warmth), else 0. Cached by geometryVersion (the
 * cell geometry) and the CONTENT of the closed shutters (their edge keys in world.edges order, compared
 * every call; edges are few), so a shutter toggled in place (EdgeBarrier.open) without a geometryVersion
 * bump still stops or passes warmth at once (verifier fix, g5 wave 9).
 */
function sameClosedShutters(world: World, key: number[]): boolean {
  let n = 0;
  for (const e of world.edges) {
    if (edgeCodeOf(e) !== EDGE_SHUTTER_CLOSED) continue;
    if (n >= key.length || key[n] !== edgeKey(e.cell, e.dir)) return false;
    n++;
  }
  return n === key.length;
}

function warmthCoefficients(world: World, tc: TransportCache): { r: Float64Array; d: Float64Array } {
  const g = world.grid;
  const gv = g.geometryVersion;
  const shutters = tc.warmthShutters;
  if (tc.warmthR !== null && tc.warmthD !== null && tc.warmthVersion === gv && sameClosedShutters(world, shutters)) return { r: tc.warmthR, d: tc.warmthD };
  shutters.length = 0;
  for (const e of world.edges) if (edgeCodeOf(e) === EDGE_SHUTTER_CLOSED) shutters.push(edgeKey(e.cell, e.dir));
  const r = tc.warmthR ?? new Float64Array(CELL_COUNT);
  const d = tc.warmthD ?? new Float64Array(CELL_COUNT);
  r.fill(0);
  d.fill(0);
  const codes = world.edges.length > 0 ? edgeCodeArrays(world.edges) : null;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = tc.rowX0[y]!; x <= tc.rowX1[y]!; x++) {
      const i = y * GRID_W + x;
      if (!transportOpen(g, i)) continue;
      if (x + 1 < GRID_W && inMask(x + 1, y) && transportOpen(g, i + 1) && (codes === null || codes.r[i] !== EDGE_SHUTTER_CLOSED)) r[i] = WARMTH_DIFFUSION;
      if (y + 1 < GRID_H && inMask(x, y + 1) && transportOpen(g, i + GRID_W) && (codes === null || codes.d[i] !== EDGE_SHUTTER_CLOSED)) d[i] = WARMTH_DIFFUSION;
    }
  }
  tc.warmthR = r;
  tc.warmthD = d;
  tc.warmthVersion = gv;
  return { r, d };
}

/**
 * Local warmth for one tick (SPEC §4.7), in this order: relax every dish cell 1 % toward ambient
 * (settings.warmth), diffuse (the transport kernel, coefficient 0.05 across passable edges), add each On
 * S09 (+0.01/s × dt) or S10 (−) to its own cell (world.devices order; neighbouring devices' gradients add
 * through diffusion), clamp every dish cell to [0, 1]. Allocates the array (every cell = settings.warmth)
 * the first time an S09 or S10 is On.
 */
export function warmthStep(world: World, tc: TransportCache): void {
  let w = world.climate.warmth;
  if (w === null) {
    if (!anyWarmthDeviceOn(world)) return;
    w = new Float64Array(CELL_COUNT).fill(world.settings.warmth);
    world.climate.warmth = w;
  }
  const ambient = world.settings.warmth;
  const cells = maskCells();
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k]!;
    const v = w[i]!;
    w[i] = v + WARMTH_RELAX_PER_TICK * (ambient - v);
  }
  const { r, d } = warmthCoefficients(world, tc);
  diffuseField(w, tc, r, d, false);
  for (const dev of world.devices) {
    if (dev.on !== true) continue;
    if (dev.kind === 'S09') w[dev.cell]! += WARMTH_DEVICE_PER_TICK;
    else if (dev.kind === 'S10') w[dev.cell]! -= WARMTH_DEVICE_PER_TICK;
  }
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k]!;
    const v = w[i]!;
    if (v < 0) w[i] = 0;
    else if (v > 1) w[i] = 1;
  }
}

function allocateMoisture(world: World): Float64Array {
  const sub = world.grid.substrate;
  const m = new Float64Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i++) m[i] = sub[i] === SUB_WATER ? MOISTURE_WATER : MOISTURE_START;
  world.climate.moisture = m;
  return m;
}

/** Water that a wick touches: in the dish, water substrate, not stone or wall. */
function wickWater(g: Grid, i: number): boolean {
  return cellInDish(i) && g.substrate[i] === SUB_WATER && g.structure[i] !== ST_STONE && g.structure[i] !== ST_WALL;
}

const wickMark = new Uint8Array(CELL_COUNT);

/**
 * Moisture for one tick (SPEC §4.8; CT §4, §12.2). Allocates the array when drying is on. Then:
 * (a) drying: every dish gel or sediment cell without an S11 roof loses 0.001/s × dt down to 0.1;
 * (b) wicks: an S12 whose own cell or a dish 4-neighbour is water (substrate only, so wicks never chain)
 *     moves each of its dish gel/sediment 4-neighbours toward 0.8 by at most 0.01/s × dt, never
 *     overshooting; a cell touched by several wicks moves once.
 * Water cells stay exactly 1. No field is read or written.
 */
export function moistureStep(world: World, tc: TransportCache): void {
  let m = world.climate.moisture;
  if (m === null) {
    if (!world.settings.drying) return;
    m = allocateMoisture(world);
  }
  const g = world.grid;
  if (world.settings.drying) {
    const roof = roofCells(world, tc);
    const cells = maskCells();
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k]!;
      if (g.substrate[i] === SUB_WATER || (roof !== null && roof[i] === 1)) continue;
      const v = m[i]!;
      if (v > MOISTURE_FLOOR) m[i] = Math.max(MOISTURE_FLOOR, v - DRYING_PER_TICK);
    }
  }
  if (!worldHasStructure(world, 'S12')) return;
  const marked: number[] = [];
  for (const dev of world.devices) {
    if (dev.kind !== 'S12') continue;
    const c = dev.cell;
    if (!(wickWater(g, c) || wickWater(g, c + 1) || wickWater(g, c + GRID_W) || wickWater(g, c - 1) || wickWater(g, c - GRID_W))) continue;
    for (const n of [c + 1, c + GRID_W, c - 1, c - GRID_W]) {
      if (wickMark[n] === 1 || !cellInDish(n) || g.substrate[n] === SUB_WATER) continue;
      wickMark[n] = 1;
      marked.push(n);
    }
  }
  for (const n of marked) {
    wickMark[n] = 0;
    const v = m[n]!;
    if (v < WICK_TARGET) m[n] = Math.min(WICK_TARGET, v + WICK_PER_TICK);
    else if (v > WICK_TARGET) m[n] = Math.max(WICK_TARGET, v - WICK_PER_TICK);
  }
}

// ---- State transitions for wave 10's commands (never called from stage code) ------------------------------

/** The moisture array, allocated (water 1, other cells 0.8) when null; null when the world records no climate. */
export function ensureMoisture(world: World): Float64Array | null {
  if (!worldHasSystem(world, 'climate')) return null;
  return world.climate.moisture ?? allocateMoisture(world);
}

/**
 * The wetting brush (SPEC §4.8): every listed dish gel or sediment cell becomes 0.9 (water stays 1).
 * Dilutes nothing: no field or ledger line changes. False (and nothing changes) without 'climate'.
 */
export function wetCells(world: World, cells: readonly number[]): boolean {
  const m = ensureMoisture(world);
  if (m === null) return false;
  const sub = world.grid.substrate;
  for (const c of cells) if (cellInDish(c) && sub[c] !== SUB_WATER) m[c] = WETTING_MOISTURE;
  return true;
}

/**
 * Called by structures.ts paintSubstrate for each painted cell BEFORE it writes the new substrate code: a
 * cell whose substrate changes restarts at the new substrate's value (water 1, gel/sediment 0.8). Painting
 * a cell with the substrate it already has changes nothing (no free re-wetting), and nothing happens while
 * the array is null.
 */
export function moistureOnRepaint(world: World, cell: number, newSubstrate: number): void {
  const m = world.climate.moisture;
  if (m === null || world.grid.substrate[cell] === newSubstrate) return;
  m[cell] = newSubstrate === SUB_WATER ? MOISTURE_WATER : MOISTURE_START;
}

/**
 * Switch the light mode (a command's state transition; SPEC §4.6 "manual light changes are commands").
 * 'cycle' starts the cycle at this tick (day) unless it already cycles (then nothing changes); 'fixed'
 * deletes settings.cycleStartTick (D-0108). False, and nothing changes, without 'climate'.
 */
export function setLightMode(world: World, mode: 'fixed' | 'cycle'): boolean {
  if (!worldHasSystem(world, 'climate')) return false;
  if (mode === 'cycle') {
    if (world.settings.lightMode === 'cycle') return true;
    world.settings.lightMode = 'cycle';
    world.settings.cycleStartTick = world.tick;
  } else {
    world.settings.lightMode = 'fixed';
    delete world.settings.cycleStartTick;
  }
  return true;
}

// ---- Read-only views for the inspector (wave 11) -----------------------------------------------------------

/** Local warmth of a cell: the warmth array's value, or the ambient settings.warmth while it is null. */
export function localWarmthAt(world: World, cell: number): number {
  const w = world.climate.warmth;
  return w === null ? world.settings.warmth : w[cell]!;
}

/** Moisture index of a cell: water 1; else the moisture array's value, or 0.8 while it is null. */
export function moistureAt(world: World, cell: number): number {
  if (world.grid.substrate[cell] === SUB_WATER) return MOISTURE_WATER;
  const m = world.climate.moisture;
  return m === null ? MOISTURE_START : m[cell]!;
}
