/**
 * Snapshot and inspector builders (ARCH §8, SPEC §12.1). Pure reads of authoritative state: no
 * simulation randomness, no mutation. The worker transfers the typed arrays to the main thread.
 */
import { hostInfo, parasiteInfo } from '@sim/parasites';
import { infectionInfo } from '@sim/viruses';
import { fungalNetwork } from '@sim/fungi';
import { fungalFlowOf, transferredThisSecond } from '@sim/fungalTransport';
import { CELL_COUNT, GRID_W } from '@sim/constants';
import { allDivisionBlockers, divisionBlocker, divisionNeeds } from '@sim/births';
import { FLAG } from '@sim/entities';
import type { SimEvent } from '@sim/events';
import { FIELD_DEFS, FIELD_IDS, type FieldId } from '@sim/fields';
import { STRUCTURE_NAMES, SUBSTRATE_NAMES } from '@sim/grid';
import { hungryPredator } from '@sim/movement';
import { childrenOf, field as lineageField, has as lineageHas } from '@sim/lineage';
import { profileOf } from '@sim/profiles';
import { R } from '@sim/reasons';
import { PREY_NONE } from '@sim/species';
import { worldHasSystem } from '@sim/gates';
import { accessibleCarbonLastSecond, reactionInCell, reactionInDish, type ReactionEnzyme } from '@sim/reactions';
import { exposureBreakdown, lightFactors, salinityIndex } from '@sim/chemistry';
import { dormancySummary, moduleSummaries, reserveBand, upkeepNow } from '@sim/moduleView';
import { founderOriginOf } from '@sim/founders';
import { PRODUCER_BIT } from '@sim/secretion';
import { entityCell, forEachInCell } from '@sim/spatial';
import { response, SHOULDER_PH, SHOULDER_SALINITY, SHOULDER_WARMTH } from '@sim/suitability';
import { entitySuitabilityAt } from '@sim/crossing';
import type { World } from '@sim/world';
import { edgeCodeArrays, edgeNeighbour, freeClassOfSpecies, type EdgeBarrier } from '@sim/barriers';
import { RESIN_CAPACITY, RESIN_TARGETS, type Device } from '@sim/devices';
import { localWarmthAt } from '@sim/climate';
// Wave 13 (org-ui): the Phase 5 organism readers (pure; nothing here is read back by the simulation).
import { handlingSpecies, jacketCoverage } from '@sim/handling';
import { heldView, trapView } from '@sim/traps';
import { jacketView } from '@sim/jacket';
import { sensedSignal } from '@sim/signals';
import { STAGE8_ACTIONS } from '@sim/actions';
import { INHIBITOR_DAMAGE, TRAP_HOLD_SECONDS } from '@sim/constants';
import { inhibitorExposure } from '@sim/suitability';
import type { Profile } from '@sim/phenotype';
import {
  CUE3_GLOWER,
  CUE3_GLOWING,
  CUE3_HANDLING,
  CUE3_HANDLING_QUARTER_SHIFT,
  CUE3_HELD,
  CUE3_HOLD_CLOSING,
  CUE3_JACKET_SHIFT,
  CUE3_JACKETED,
  CUE3_MOD_E02,
  CUE3_MOD_E11,
  CUE3_MODE_SHIFT,
  CUE3_SHELL,
  CUE3_TRAP_SHIFT,
  DEPOSIT_GRIT_BAND,
  E_CUE3,
  EDGE_FLOW_BACK,
  type CellClimate,
  type CellDeviceLine,
  type CellEdgeLine,
  type CellLightFactors,
  type BeingHandledInspect,
  type GeometryDevice,
  type GeometryEdge,
  type GeometryEdges,
  type GeometryMsg,
  type SnapshotEnvironment,
  type SnapshotResin,
} from './protocol';
import {
  CUE2_ANCHORED,
  CUE2_INFECTED,
  CUE2_LINKED,
  CUE2_MOD_E04,
  CUE2_MOD_E06,
  CUE2_MOD_E07,
  CUE2_MOD_E08,
  CUE2_DETRITUS_INTAKE,
  CUE2_MOD_E09,
  CUE2_MOD_E10,
  CUE2_MOD_E12,
  CUE2_PARASITIZED,
  CUE2_RELEASING_PROTEIN,
  CUE2_SEEKING_LIGHT,
  DEPOSIT_FILM_BAND,
  E_CUE2,
  E_LINKMASK,
  FILM_ERODING,
  FILM_LEVEL_MASK,
  LINK_KIND_ADHESION,
  LINKMASK_E,
  LINKMASK_N,
  LINKMASK_S,
  LINKMASK_TRANSFER,
  LINKMASK_W,
  type SnapshotObject,
  CUE_CAPACITY_BLOCKED,
  CUE_MOD_E01,
  CUE_MOD_E03,
  CUE_MOD_E05,
  CUE_RESERVE_BAND_SHIFT,
  CUE_FEEDING,
  CUE_HUNTING,
  CUE_JUST_BORN,
  CUE_SECRETING,
  CUE_STRESSED,
  E_CUE,
  E_ENERGY,
  E_FLAGS,
  E_GROWTH,
  E_HEADING,
  E_HEALTH,
  E_LIFE,
  E_SIZE,
  E_SLOT,
  E_SPECIES,
  E_X,
  E_Y,
  ENT_STRIDE,
  ID_STRIDE,
  FAMILY_MAX_MEMBERS,
  type CellInspect,
  type EntityInspect,
  type FamilyAnswer,
  type FamilyMember,
  type FamilyRelation,
  type InspectorPayload,
  type OverlayId,
  type ReactionRow,
  type Selection,
  type VisualEvent,
} from './protocol';

export function packEntities(world: World, ents: Float32Array | null, ids: Uint32Array | null): { ents: Float32Array; ids: Uint32Array; count: number; speciesCounts: number[] } {
  const e = world.ents;
  const c = e.cols;
  const n = e.count;
  const outE = ents && ents.length >= n * ENT_STRIDE ? ents : new Float32Array(Math.max(64, n) * ENT_STRIDE);
  const outI = ids && ids.length >= n * ID_STRIDE ? ids : new Uint32Array(Math.max(64, n) * ID_STRIDE);
  const speciesCounts = new Array<number>(world.species.length).fill(0);
  // P3.12: the fungal link columns resolved once per pack instead of by name for every organism.
  const fl = fungalLinkCols(world);
  // Protocol 3: which species build shells (SHELL), resolved once per pack.
  const shell = world.species.map((s) => s.abilities.includes('SHELL'));
  let k = 0;
  for (let i = 0; i < e.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const sp = world.species[c.species[i]!]!;
    const prof = profileOf(world, i);
    const o = k * ENT_STRIDE;
    const flags = c.flags[i]!;
    let cue = 0;
    if (flags & FLAG.feeding) cue |= CUE_FEEDING;
    if (flags & FLAG.stressed) cue |= CUE_STRESSED;
    if (flags & FLAG.hunting) cue |= CUE_HUNTING;
    if (c.secreting[i]) cue |= CUE_SECRETING;
    if (flags & FLAG.justBorn) cue |= CUE_JUST_BORN;
    if (flags & FLAG.capacityBlocked) cue |= CUE_CAPACITY_BLOCKED;
    // Module visual layers map only from the genome and measured state (P2.1).
    const mods = prof.modules;
    if (mods.length > 0) {
      if (mods.includes('E01')) cue |= CUE_MOD_E01;
      if (mods.includes('E03')) cue |= CUE_MOD_E03;
      if (mods.includes('E05')) cue |= CUE_MOD_E05 | (reserveBand(c.E[i]!, prof) << CUE_RESERVE_BAND_SHIFT);
    }
    outE[o + E_SLOT] = i;
    outE[o + E_SPECIES] = c.species[i]!;
    outE[o + E_X] = c.x[i]!;
    outE[o + E_Y] = c.y[i]!;
    outE[o + E_HEADING] = c.heading[i]!;
    outE[o + E_FLAGS] = flags;
    outE[o + E_GROWTH] = Math.min(1, c.B[i]! / (2 * sp.def.b0));
    outE[o + E_ENERGY] = c.E[i]! / prof.energyCap;
    outE[o + E_HEALTH] = c.H[i]! / 100;
    outE[o + E_LIFE] = c.lifeState[i]!;
    outE[o + E_SIZE] = 1;
    outE[o + E_CUE] = cue;
    // Protocol 2: every slot is written for every entity (pooled buffers), 0 when nothing applies.
    outE[o + E_CUE2] = cue2Of(world, i, mods, flags);
    outE[o + E_LINKMASK] = linkMaskOf(world, i, fl);
    outE[o + E_CUE3] = cue3Of(world, i, mods, shell[c.species[i]!] === true, prof.glow !== null);
    outI[k * ID_STRIDE] = c.birthId[i]!;
    outI[k * ID_STRIDE + 1] = c.entityId[i]!;
    speciesCounts[c.species[i]!]!++;
    k++;
  }
  return { ents: outE, ids: outI, count: k, speciesCounts };
}

/**
 * Phase 3 cue bits (protocol 2, CUE2_*) of one living organism, read from authoritative state only: an
 * infection, a live parasite pair, an E04 anchor, a valid adhesion link, the Phase 3 modules in its
 * genome (like CUE_MOD_E0x), and E07 seeking light (an E07 carrier that is moving). RELEASING_PROTEIN is
 * the protein bit of the secreting bit set (secretion.ts PRODUCER_BIT); DETRITUS_INTAKE is FLAG.detritusIntake.
 */
function cue2Of(world: World, i: number, mods: readonly string[], flags: number): number {
  const c = world.ents.cols;
  const e = world.ents;
  let cue2 = 0;
  if (c.infectedBy[i] !== 0) cue2 |= CUE2_INFECTED;
  const p = c.parasiteSlot[i]!;
  if (p >= 0 && e.refValid(p, c.parasiteBirthId[i]!)) cue2 |= CUE2_PARASITIZED;
  if (c.anchorState[i] === 1) cue2 |= CUE2_ANCHORED;
  // Released protein enzyme this tick (the protein bit of the secreting bit set: E09 or native B08).
  if ((c.secreting[i]! & PRODUCER_BIT.protein) !== 0) cue2 |= CUE2_RELEASING_PROTEIN;
  if ((c.aLink0[i]! >= 0 && e.refValid(c.aLink0[i]!, c.aLinkB0[i]!)) || (c.aLink1[i]! >= 0 && e.refValid(c.aLink1[i]!, c.aLinkB1[i]!))) cue2 |= CUE2_LINKED;
  if (mods.length > 0) {
    if (mods.includes('E04')) cue2 |= CUE2_MOD_E04;
    if (mods.includes('E06')) cue2 |= CUE2_MOD_E06;
    if (mods.includes('E07')) {
      cue2 |= CUE2_MOD_E07;
      if (flags & FLAG.moving) cue2 |= CUE2_SEEKING_LIGHT;
    }
    if (mods.includes('E08')) {
      cue2 |= CUE2_MOD_E08;
      if (flags & FLAG.detritusIntake) cue2 |= CUE2_DETRITUS_INTAKE; // recorded detritus intake this tick (stage 6)
    }
    if (mods.includes('E09')) cue2 |= CUE2_MOD_E09;
    if (mods.includes('E10')) cue2 |= CUE2_MOD_E10;
    if (mods.includes('E12')) cue2 |= CUE2_MOD_E12;
  }
  return cue2;
}

/**
 * Phase 5 cue bits (protocol 3, CUE3_*; D-0119) of one living organism, read from authoritative entity
 * columns only (protocol.ts documents each rule). 0 for every organism of a world holding no Phase 5 state.
 */
export function cue3Of(world: World, i: number, mods: readonly string[], shellSpecies: boolean, glower = false): number {
  const c = world.ents.cols;
  const e = world.ents;
  let cue3 = 0;
  if (c.glowState[i] === 1) cue3 |= CUE3_GLOWING;
  // Wave 13: an organism with glow rules (Profile.glow: native SIGNAL_GLOW or a recorded E02).
  if (glower) cue3 |= CUE3_GLOWER;
  if (mods.length > 0) {
    if (mods.includes('E02')) cue3 |= CUE3_MOD_E02;
    if (mods.includes('E11')) cue3 |= CUE3_MOD_E11;
  }
  const mode = c.metabolicMode[i]!;
  if (mode === 1 || mode === 2) cue3 |= mode << CUE3_MODE_SHIFT;
  const held = c.heldBySlot[i]!;
  if (held >= 0 && e.refValid(held, c.heldByBirthId[i]!)) {
    cue3 |= CUE3_HELD;
    // Wave 13: the trap_loop 'closing' frame for the first second of the hold (the holder's trapTimer).
    if (c.trapTimer[held]! <= HOLD_CLOSING_SECONDS + 1e-9) cue3 |= CUE3_HOLD_CLOSING;
  }
  const need = c.handlingNeed[i]!;
  if (need > 0) {
    const prey = c.preySlot[i]!;
    if (prey >= 0 && e.refValid(prey, c.preyBirthId[i]!)) cue3 |= CUE3_HANDLING | (handlingQuarter(c.handlingProgress[i]!, need) << CUE3_HANDLING_QUARTER_SHIFT);
  }
  const ts = c.trapSlot[i]!;
  const holding = ts >= 0 && e.refValid(ts, c.trapBirthId[i]!);
  const trap = holding ? 2 : c.trapCooldown[i]! > 0 ? 3 : c.trapReserveC[i]! > 0 && ts < 0 ? 1 : 0;
  if (trap !== 0) cue3 |= trap << CUE3_TRAP_SHIFT;
  const jacket = c.jacketMineral[i]!;
  if (jacket > 0) {
    // Wave 13 (D-0124): the one coverage the simulation uses for speed and handling (0 at B ≤ 0, where the
    // wave 11 inline expression gave 1: unreachable for a living organism).
    const cov = jacketCoverage(jacket, c.B[i]!);
    cue3 |= CUE3_JACKETED | (Math.min(3, Math.max(0, Math.ceil(4 * cov) - 1)) << CUE3_JACKET_SHIFT);
  }
  if (shellSpecies && c.boundMineral[i]! > 0) cue3 |= CUE3_SHELL;
  return cue3;
}

/** How long a new hold shows the trap_loop 'closing' frame (D-0124: the first second after the committed capture). */
export const HOLD_CLOSING_SECONDS = 1;

/** The handling_arc frame (D-0112): min(3, max(0, ⌈4 × progress / need⌉ − 1)); 0 when need is not positive. */
export function handlingQuarter(progress: number, need: number): number {
  if (!(need > 0)) return 0;
  return Math.min(3, Math.max(0, Math.ceil((4 * progress) / need) - 1));
}

const FUNGAL_LINK_COLUMNS = [
  ['fLink0', 'fLinkB0'],
  ['fLink1', 'fLinkB1'],
  ['fLink2', 'fLinkB2'],
  ['fLink3', 'fLinkB3'],
] as const;

/**
 * E_LINKMASK of one organism: the direction of each live fungal link (partner reference valid), from
 * the partner's cell relative to its own (four-neighbour cells; y grows south): N 1, E 2, S 4, W 8.
 * A partner that is not a four-neighbour (never made by the rules) counts on its dominant axis.
 * Bit 4 (LINKMASK_TRANSFER): the segment sent or received carbon along a transport link during the
 * last dish second (P3.6, src/sim/fungalTransport.ts; observation only).
 */
interface FungalLinkCols {
  readonly slot: readonly Int32Array[];
  readonly birth: readonly Uint32Array[];
}

function fungalLinkCols(world: World): FungalLinkCols {
  const c = world.ents.cols;
  return { slot: FUNGAL_LINK_COLUMNS.map(([s]) => c[s]), birth: FUNGAL_LINK_COLUMNS.map(([, b]) => c[b]) };
}

function linkMaskOf(world: World, i: number, fl: FungalLinkCols): number {
  const c = world.ents.cols;
  // P3.12: most organisms hold no fungal link at all (every position −1): nothing to read.
  if (fl.slot[0]![i]! < 0 && fl.slot[1]![i]! < 0 && fl.slot[2]![i]! < 0 && fl.slot[3]![i]! < 0) return 0;
  let mask = 0;
  for (let p = 0; p < 4; p++) {
    const j = fl.slot[p]![i]!;
    if (j < 0 || !world.ents.refValid(j, fl.birth[p]![i]!)) continue;
    const dx = Math.floor(c.x[j]!) - Math.floor(c.x[i]!);
    const dy = Math.floor(c.y[j]!) - Math.floor(c.y[i]!);
    if (dx === 0 && dy === 0) continue;
    if (Math.abs(dx) >= Math.abs(dy)) mask |= dx > 0 ? LINKMASK_E : LINKMASK_W;
    else mask |= dy > 0 ? LINKMASK_S : LINKMASK_N;
  }
  if (mask !== 0 && transferredThisSecond(world, i)) mask |= LINKMASK_TRANSFER;
  return mask;
}

/**
 * Adhesion links (protocol 2, SnapshotMsg.links): [x1, y1, x2, y2, LINK_KIND_ADHESION] per valid link,
 * each pair once (written from its lower slot), in slot order.
 */
export function packLinks(world: World): Float32Array {
  const c = world.ents.cols;
  const e = world.ents;
  const out: number[] = [];
  // P3.12: the two adhesion positions' columns, resolved once (no per-organism array literals).
  const a0 = c.aLink0;
  const a1 = c.aLink1;
  const b0 = c.aLinkB0;
  const b1 = c.aLinkB1;
  for (let i = 0; i < e.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    for (let p = 0; p < 2; p++) {
      const j = p === 0 ? a0[i]! : a1[i]!;
      if (j <= i || !e.refValid(j, p === 0 ? b0[i]! : b1[i]!)) continue;
      out.push(c.x[i]!, c.y[i]!, c.x[j]!, c.y[j]!, LINK_KIND_ADHESION);
    }
  }
  const buf = new Float32Array(out.length);
  buf.set(out);
  return buf;
}

/** Full carbon inventory of a new food object by kind (CT §5.2: M10 pellet 10 sugar C, M11 wafer 6 starch + 4 protein C). */
export const OBJECT_FULL_C: Readonly<Record<string, number>> = { pellet: 10, wafer: 10 };

/** The dish's food objects (protocol 2, SnapshotMsg.objects): cell centre, kind, and remaining C / full inventory. */
export function packObjects(world: World): SnapshotObject[] {
  return world.objects.map((o) => {
    const left = (o.pools.sugar ?? 0) + (o.pools.starch ?? 0) + (o.pools.protein ?? 0);
    const full = OBJECT_FULL_C[o.kind] ?? 0;
    return {
      id: o.id,
      x: (o.cell % GRID_W) + 0.5,
      y: Math.floor(o.cell / GRID_W) + 0.5,
      kind: o.kind,
      fill: full > 0 ? Math.min(1, Math.max(0, left / full)) : 0,
    };
  });
}

/** Film carbon at the band's top (127): the film cap (SPEC §7.1, 0.50 C per cell). */
const FILM_BAND_FULL = 0.5;

/**
 * Worker-side scratch for the film band's eroding bit: per world, the film at the last tick this packer
 * saw and the eroding bits it computed then. Never simulation state (a WeakMap, so a disposed world
 * takes its scratch with it).
 */
interface FilmScratch {
  tick: number;
  film: Float64Array;
  eroding: Uint8Array;
}
const filmScratch = new WeakMap<World, FilmScratch>();

/**
 * The film band (band 6): low seven bits = film C (FILM_BAND_FULL = 127, any film ≥ 1), bit 7 = eroding:
 * the cell's film is lower than at the previous tick this packer saw (decay, grazing) — a cell where
 * builders deposited at least as much as it lost is not eroding. Packing twice at one tick (paused)
 * keeps the bits; a world that went back (undo) starts over with none.
 */
function packFilmBand(world: World, buf: Uint8Array, base: number): void {
  const film = world.fields.film;
  if (!film) {
    buf.fill(0, base, base + CELL_COUNT);
    return;
  }
  let sc = filmScratch.get(world);
  if (!sc) {
    sc = { tick: world.tick, film: Float64Array.from(film), eroding: new Uint8Array(CELL_COUNT) };
    filmScratch.set(world, sc);
  } else if (world.tick > sc.tick) {
    for (let i = 0; i < CELL_COUNT; i++) sc.eroding[i] = film[i]! < sc.film[i]! - 1e-12 ? 1 : 0;
    sc.film.set(film);
    sc.tick = world.tick;
  } else if (world.tick < sc.tick) {
    sc.eroding.fill(0);
    sc.film.set(film);
    sc.tick = world.tick;
  }
  for (let i = 0; i < CELL_COUNT; i++) {
    const v = film[i]!;
    const level = v <= 1e-9 ? 0 : Math.min(FILM_LEVEL_MASK, Math.max(1, Math.round((v / FILM_BAND_FULL) * FILM_LEVEL_MASK)));
    buf[base + i] = level === 0 ? 0 : level | (sc.eroding[i] ? FILM_ERODING : 0);
  }
}

/** Deposit glyph bands: starch, detritus, oil, protein, sugar haze → 0–255 on a soft log scale. */
/** Bands: starch, detritus, oil, protein, sugar haze, catalysis (carbon converted last tick), film (protocol 2), grit (protocol 3). */
export const DEPOSIT_BANDS = 8;
export function packDeposits(world: World, out: Uint8Array | null): Uint8Array {
  const buf = out && out.length === CELL_COUNT * DEPOSIT_BANDS ? out : new Uint8Array(CELL_COUNT * DEPOSIT_BANDS);
  packFilmBand(world, buf, DEPOSIT_FILM_BAND * CELL_COUNT);
  // Catalysis: the renderer draws dust only where stage 3 really converted something (UX §7 "activity
  // particles only during conversion"). 1e-5 C per tick ≈ an enzyme activity of 0.001.
  const cat = world.catalysisCells;
  const cbase = 5 * CELL_COUNT;
  for (let i = 0; i < CELL_COUNT; i++) {
    const v = cat[i]!;
    buf[cbase + i] = v <= 1e-7 ? 0 : Math.min(255, Math.max(1, Math.round((Math.log10(1 + v * 1e5) / 3) * 255)));
  }
  const kinds: FieldId[] = ['starch', 'detritus', 'oil', 'protein', 'sugar'];
  // Protocol 3: band DEPOSIT_GRIT_BAND is grit on the same scale (0 where the world has no grit field).
  const bands: [FieldId, number][] = kinds.map((id, k) => [id, k]);
  bands.push(['grit', DEPOSIT_GRIT_BAND]);
  bands.forEach(([id, k]) => {
    const f = world.fields[id];
    const base = k * CELL_COUNT;
    if (!f) {
      buf.fill(0, base, base + CELL_COUNT);
      return;
    }
    for (let i = 0; i < CELL_COUNT; i++) {
      const v = f[i]!;
      buf[base + i] = v <= 1e-6 ? 0 : Math.min(255, Math.max(1, Math.round((Math.log10(1 + v * 100) / Math.log10(201)) * 255)));
    }
  });
  return buf;
}

export function packOverlay(world: World, id: OverlayId, out: Float32Array | null, selection: Selection | null = null): { data: Float32Array; max: number } | null {
  const buf = out && out.length === CELL_COUNT ? out : new Float32Array(CELL_COUNT);
  if (id === 'foodAccess') return { data: buf, max: packFoodAccess(world, buf, selection) };
  // Protocol 3: local warmth (the array, else the ambient setting everywhere) and moisture, a 0–1 index
  // with max 1. Read only: packing never allocates a climate array (g5-plan "Lazy climate arrays").
  if (id === 'warmth' || id === 'moisture') {
    const arr = id === 'warmth' ? world.climate.warmth : world.derived.moisture;
    if (arr === null) buf.fill(world.settings.warmth);
    else for (let i = 0; i < CELL_COUNT; i++) buf[i] = arr[i]!;
    return { data: buf, max: 1 };
  }
  let src: Float64Array | undefined;
  if (id === 'light') src = world.derived.light;
  else if (id === 'ph') src = world.derived.ph;
  else src = world.fields[id];
  if (!src) return null;
  let max = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    const v = src[i]!;
    buf[i] = v;
    if (v > max) max = v;
  }
  return { data: buf, max };
}

/**
 * P3.6 food-access overlay (SPEC §10.8; observation only). With an organism selected: per cell, the
 * carbon of the pools its species can eat (its foods, plus film when it digests film in a film world:
 * the same list as the inspector's "Food here"). Otherwise: the carbon enzymes made accessible in each
 * cell during the last whole second (src/sim/reactions.ts). Returns the maximum.
 */
export function packFoodAccess(world: World, out: Float32Array, selection: Selection | null): number {
  const slot = selection?.kind === 'entity' ? findSlotByBirth(world, selection.birthId) : -1;
  if (slot < 0) return accessibleCarbonLastSecond(world, out);
  out.fill(0);
  const pools: Float64Array[] = [];
  const scale: number[] = [];
  for (const f of foodPoolsOf(world, slot)) {
    const arr = world.fields[f];
    if (!arr) continue;
    pools.push(arr);
    scale.push(FIELD_DEFS[f].carbonPerUnit ?? 1);
  }
  let max = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    let v = 0;
    for (let k = 0; k < pools.length; k++) v += pools[k]![i]! * scale[k]!;
    out[i] = v;
    if (v > max) max = v;
  }
  return max;
}

/** The pools an organism can eat now: its foods, plus film for a film digester in a film world (D-0038). */
function foodPoolsOf(world: World, slot: number): FieldId[] {
  const sp = world.species[world.ents.cols.species[slot]!]!;
  const out: FieldId[] = [...profileOf(world, slot).foods];
  if (sp.def.digestsFilm && world.fields.film !== undefined && worldHasSystem(world, 'film')) out.push('film');
  return out;
}

/**
 * Events for the snapshot. `modules`: the world's recorded module list (D-0034 label ruling), so a
 * 'mutation' event carries its recorded descriptor with the module's id, and the feed names the ability.
 */
export function visualEvents(
  events: readonly SimEvent[],
  sinceId: number,
  modules: readonly { readonly id: string }[] = [],
  lociOf: (birthId: number) => readonly number[] | undefined = () => undefined,
): VisualEvent[] {
  const out: VisualEvent[] = [];
  for (const ev of events) {
    if (ev.id <= sinceId) continue;
    if (
      ev.type !== 'birth' &&
      ev.type !== 'death' &&
      ev.type !== 'introduce' &&
      ev.type !== 'capture' &&
      ev.type !== 'conversion' &&
      ev.type !== 'mutation' &&
      ev.type !== 'branchEstablished' &&
      ev.type !== 'branchExtinct' &&
      ev.type !== 'objectEmptied' &&
      ev.type !== 'wake'
    )
      continue;
    out.push({
      type: ev.type,
      tick: ev.tick,
      species: ev.species ?? -1,
      cell: ev.cell ?? -1,
      birthId: ev.birthId ?? 0,
      ...(ev.cause !== undefined ? { cause: ev.cause } : {}),
      ...(typeof ev.detail?.branch === 'number' ? { branch: ev.detail.branch } : {}),
      ...(ev.type === 'mutation' && typeof ev.detail?.flags === 'number'
        ? {
            mutation: {
              flags: ev.detail.flags,
              delta: typeof ev.detail.delta === 'number' ? ev.detail.delta : 0,
              module: typeof ev.detail.module === 'number' && ev.detail.module >= 0 ? (modules[ev.detail.module]?.id ?? null) : null,
              ...quantValues(ev, lociOf),
            },
          }
        : {}),
    });
  }
  return out;
}

/**
 * A quantitative change's locus and its value in the parent's and the offspring's recorded genomes
 * (fix round G2 comprehension M2: the feed names the trait and both values). Omitted when either birth
 * record is no longer kept or the recorded values do not match the recorded delta.
 */
function quantValues(ev: SimEvent, lociOf: (birthId: number) => readonly number[] | undefined): { locus?: number; from?: number; to?: number } {
  const d = ev.detail;
  if (!d || typeof d.locus !== 'number' || d.locus < 0 || typeof d.delta !== 'number' || d.delta === 0) return {};
  if (typeof d.parent !== 'number' || ev.birthId === undefined) return {};
  const from = lociOf(d.parent)?.[d.locus];
  const to = lociOf(ev.birthId)?.[d.locus];
  if (from === undefined || to === undefined || to - from !== d.delta) return {};
  return { locus: d.locus, from, to };
}

/** Recorded genome loci of a birth, from the lineage record (undefined when the record is not kept). */
export function lociOfBirth(world: World): (birthId: number) => readonly number[] | undefined {
  return (birthId) => {
    const g = lineageField(world.lineage, 'genome', birthId);
    return g === undefined ? undefined : world.genomes.get(g).loci;
  };
}

function findSlotByBirth(world: World, birthId: number): number {
  const c = world.ents.cols;
  for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1 && c.birthId[i] === birthId) return i;
  return -1;
}

function inspectEntity(world: World, slot: number): EntityInspect {
  const c = world.ents.cols;
  const sp = world.species[c.species[slot]!]!;
  const prof = profileOf(world, slot);
  const g = world.genomes.get(c.genome[slot]!);
  const cell = entityCell(c.x[slot]!, c.y[slot]!);
  const birthId = c.birthId[slot]!;
  const parent = lineageField(world.lineage, 'parent', birthId) ?? 0;
  const parentGenome = parent > 0 ? lineageField(world.lineage, 'genome', parent) : undefined;
  // Stage 4's own value (P04 crossing open water counts as its habitat; src/sim/crossing.ts).
  const suit = entitySuitabilityAt(world, slot, sp, prof, cell);
  let predation: EntityInspect['predation'] = null;
  if (sp.isPredator) {
    let code: number = R.PRED_NO_PREY;
    if (c.mealC[slot]! >= 0.5 * prof.b0) code = R.PRED_MEAL_FULL;
    else if (!hungryPredator(world, slot, prof)) code = R.PRED_ENERGY_HIGH;
    else if (c.attackCooldown[slot]! > 0) code = R.PRED_COOLDOWN;
    // A prey removed in this tick stays named until the next decision: it is no longer a target.
    const target = c.preySlot[slot]! >= 0 && world.ents.refValid(c.preySlot[slot]!, c.preyBirthId[slot]!);
    // Wave 13: a handler in an attempt holds on to its prey (handlingNeed > 0 only with HANDLING; 0 in every v1.0 world).
    if (code === R.PRED_NO_PREY && target) code = c.handlingNeed[slot]! > 0 ? R.PRED_HANDLING_IN_PROGRESS : R.PRED_OUT_OF_CONTACT;
    predation = { code, targetBirthId: target ? c.preyBirthId[slot]! : 0, cooldown: c.attackCooldown[slot]! };
  }
  const foodHere = prof.foods.map((f) => ({ food: f, amount: world.fields[f]?.[cell] ?? 0 }));
  // P3.3: a film digester in a film world also eats the film here, as detritus (D-0038).
  if (sp.def.digestsFilm && world.fields.film !== undefined && worldHasSystem(world, 'film')) foodHere.push({ food: 'film', amount: world.fields.film[cell]! });
  const network = fungalNetwork(world, slot);
  const transfer = fungalFlowOf(world, slot);
  const blockers = divisionBlocker(world, slot) === R.NONE ? allDivisionBlockers(world, slot) : allDivisionBlockers(world, slot);
  // P2.2: from recorded lineage only (a module seeded at creation vs inherited vs gained here).
  const origin = founderOriginOf(world, birthId);
  return {
    birthId,
    entityId: c.entityId[slot]!,
    speciesIdx: c.species[slot]!,
    speciesId: sp.id,
    x: c.x[slot]!,
    y: c.y[slot]!,
    cell,
    age: c.age[slot]!,
    generation: c.generation[slot]!,
    parentBirthId: parent,
    origin: lineageField(world.lineage, 'origin', birthId) ?? 0,
    B: c.B[slot]!,
    B0: prof.b0,
    N: c.N[slot]!,
    E: c.E[slot]!,
    energyCap: prof.energyCap,
    H: c.H[slot]!,
    mealC: c.mealC[slot]!,
    suitability: c.suitability[slot]!,
    lifeState: c.lifeState[slot]!,
    flags: c.flags[slot]!,
    limitCode: c.limitCode[slot]!,
    limitValue: c.limitValue[slot]!,
    intakeLastSecond: c.intakeLastSecond[slot]!,
    lastIntakeTick: c.lastIntakeTick[slot]!,
    divisionBlockers: blockers,
    divisionNeeds: divisionNeeds(world, slot),
    proposalPending: c.propG0[slot]! >= 0,
    predation,
    suitFactors: {
      ph: response(world.derived.ph[cell]!, prof.ph[0], prof.ph[1], SHOULDER_PH),
      // Wave 9 carry-over: the local warmth suitability reads (identical to settings.warmth without the array).
      warmth: response(localWarmthAt(world, cell), prof.warmth[0], prof.warmth[1], SHOULDER_WARMTH),
      salinity: response(world.fields.salt![cell]!, prof.salinity[0], prof.salinity[1], SHOULDER_SALINITY),
      reason: suit.reason,
    },
    profile: {
      q: prof.q,
      m: prof.m,
      speed: prof.speed,
      sensing: prof.sensing,
      minDivisionAge: prof.minDivisionAge,
      divisionCost: prof.divisionCost,
      ph: prof.ph,
      warmth: prof.warmth,
      salinity: prof.salinity,
      policy: prof.policy,
      foods: prof.foods,
      weights: prof.weights,
    },
    genome: {
      id: g.id,
      loci: g.loci,
      lociActive: sp.def.lociActive,
      ancestorLoci: [50, 50, 50, 50, 50, 50, 50, 50],
      modules: g.modules,
      changedFromParent: parentGenome !== undefined && parentGenome !== c.genome[slot],
      // Recorded birth records only (G2 comprehension M2): the parent's and the line founder's loci.
      parentLoci: parentGenome !== undefined ? world.genomes.get(parentGenome).loci : null,
      founderLoci: founderLociOf(world, origin),
    },
    foodHere,
    diet: {
      metabolism: sp.def.metabolism,
      prey: Array.from(sp.prey.keys()).filter((j) => sp.prey[j] !== PREY_NONE),
      abilities: sp.abilities,
      // Film digestion is a P3.3 mechanic: claim it only when this world's recorded manifest enables
      // the film system (and so has a film field). No shipped world has film before wave 2 lands film
      // digestion (D-0038), so the inspector never describes it before the simulation consumes it.
      digestsFilm: sp.def.digestsFilm && world.fields.film !== undefined && worldHasSystem(world, 'film'),
      sugarSources: sugarSourcesOf(world),
    },
    lociActiveEffective: prof.lociActive,
    energyCapBase: prof.baseEnergyCap,
    modules: moduleSummaries(world, slot),
    upkeep: upkeepNow(world, slot),
    dormancy: dormancySummary(world, slot),
    founderOrigin: origin,
    ...(network ? { network } : {}),
    ...(transfer ? { transfer } : {}),
    ...(world.fields.film !== undefined && worldHasSystem(world, 'film') ? { filmHere: world.fields.film[cell]! } : {}),
    ...parasiteAndInfection(world, slot),
    ...phase5Lines(world, slot, prof, cell),
  };
}

/**
 * Wave 13 (org-ui; D-0124): the Phase 5 organism lines, each read from the columns or the simulation's own
 * readers and present only when it applies, so a v1.0 organism gains no key (tests/worker/inspect-p5.test.ts).
 */
export function phase5Lines(
  world: World,
  slot: number,
  prof: Profile,
  cell: number,
): Pick<EntityInspect, 'trap' | 'heldBy' | 'handling' | 'beingHandled' | 'mode' | 'jacket' | 'signal' | 'secretion' | 'rival'> {
  const c = world.ents.cols;
  const e = world.ents;
  const sp = world.species[c.species[slot]!]!;
  const out: {
    -readonly [K in 'trap' | 'heldBy' | 'handling' | 'beingHandled' | 'mode' | 'jacket' | 'signal' | 'secretion' | 'rival']?: EntityInspect[K];
  } = {};
  const trap = trapView(world, slot);
  if (trap) out.trap = { ...trap, holdSeconds: TRAP_HOLD_SECONDS };
  const held = heldView(world, slot);
  if (held) out.heldBy = { ...held, holdSeconds: TRAP_HOLD_SECONDS };
  const need = c.handlingNeed[slot]!;
  if (need > 0) {
    const prey = c.preySlot[slot]!;
    if (prey >= 0 && e.refValid(prey, c.preyBirthId[slot]!)) {
      out.handling = { preyBirthId: c.preyBirthId[slot]!, preySpeciesIdx: c.species[prey]!, progress: c.handlingProgress[slot]!, need };
    }
  }
  // CAPTURED_HANDLING is derived here: every living handler whose VALID prey reference is this organism.
  if (handlingSpecies(world) !== null) {
    const by: BeingHandledInspect[] = [];
    const myBirth = c.birthId[slot]!;
    for (let j = 0; j < e.highWater; j++) {
      if (j === slot || c.alive[j] !== 1 || !(c.handlingNeed[j]! > 0)) continue;
      if (c.preySlot[j] !== slot || c.preyBirthId[j] !== myBirth || !e.refValid(slot, c.preyBirthId[j]!)) continue;
      by.push({ predatorBirthId: c.birthId[j]!, predatorSpeciesIdx: c.species[j]!, progress: c.handlingProgress[j]!, need: c.handlingNeed[j]! });
    }
    if (by.length > 0) out.beingHandled = by;
  }
  if (sp.mixotroph) out.mode = { mode: c.metabolicMode[slot]!, light: world.derived.light[cell]! };
  const jacket = jacketView(world, slot);
  if (jacket) out.jacket = { mineral: jacket.mineral, target: jacket.target, coverage: jacket.coverage, speedFactor: jacket.speedFactor };
  const glow = prof.glow;
  if (glow !== null) {
    out.signal = {
      sensed: sensedSignal(world, cell),
      onThreshold: glow.onThreshold,
      offThreshold: glow.offThreshold,
      dwellSeconds: glow.dwellSeconds,
      glowing: c.glowState[slot] === 1,
    };
  }
  if (glow !== null || prof.rivalry !== null) {
    out.secretion = { code: c.secretionCode[slot]!, bits: c.secreting[slot]!, refusalOf: lastEmitterKind(world, slot, prof) };
  }
  if (sp.rivalTarget) {
    const r = world.fields.rival;
    const amount = r === undefined ? 0 : r[cell]!;
    if (amount > 0) {
      const rival = exposureBreakdown(world, cell).rival!;
      const total = inhibitorExposure(world, sp, cell);
      out.rival = { amount, exposure: rival.exposure, totalExposure: total, growthFactor: 1 / (1 + total), damagePerSecond: INHIBITOR_DAMAGE * total };
    }
  }
  return out;
}

/** Which emitter kind each stage 8 action is (D-0120: the words name what the organism really emits). */
const EMITTER_KIND: Readonly<Record<string, 'enzyme' | 'signal' | 'rival'>> = {
  E_STARCH_SECRETION: 'enzyme',
  E_OIL_SECRETION: 'enzyme',
  E_PROTEIN_SECRETION: 'enzyme',
  E01: 'enzyme',
  E09: 'enzyme',
  SIGNAL_GLOW: 'signal',
  E02: 'signal',
  RIVALRY: 'rival',
};

/**
 * The kind of the last emitter action this organism runs in stage 8 (STAGE8_ACTIONS order): when nothing was
 * released this tick, secretionCode holds that emitter's refusal (secretion.ts recordEmission / producerRun).
 */
function lastEmitterKind(world: World, slot: number, prof: Profile): 'enzyme' | 'signal' | 'rival' {
  let kind: 'enzyme' | 'signal' | 'rival' = prof.glow !== null ? 'signal' : 'rival';
  for (const a of STAGE8_ACTIONS) {
    const k = EMITTER_KIND[a.key];
    if (k !== undefined && a.applies(prof, world, slot)) kind = k;
  }
  return kind;
}

/** P3.4: an infection, an attached parasite, or the host a parasite rides (sim/viruses.ts, sim/parasites.ts). */
function parasiteAndInfection(world: World, slot: number): Pick<EntityInspect, 'infection' | 'parasite' | 'host'> {
  const infection = infectionInfo(world, slot);
  const parasite = parasiteInfo(world, slot);
  const host = hostInfo(world, slot);
  return { ...(infection ? { infection } : {}), ...(parasite ? { parasite } : {}), ...(host ? { host } : {}) };
}

/** The recorded loci of the founder at the root of an organism's recorded ancestry, or null when not recorded. */
function founderLociOf(world: World, origin: ReturnType<typeof founderOriginOf>): readonly number[] | null {
  if (!origin || origin.founderBirthId <= 0) return null;
  const g = lineageField(world.lineage, 'genome', origin.founderBirthId);
  return g === undefined ? null : world.genomes.get(g).loci;
}

/**
 * Where sugar can come from in this world under its recorded rules (M5): species that make food from
 * light (each releases PHOTO_SUGAR_FRACTION of the carbon it fixes as sugar, SPEC §6.5) and species
 * whose native enzyme turns starch into sugar. Species indices of this world, ascending.
 */
export function sugarSourcesOf(world: World): { makers: number[]; enzyme: number[]; inLight?: number[] } {
  const makers: number[] = [];
  const enzyme: number[] = [];
  const inLight: number[] = [];
  world.species.forEach((s, i) => {
    // Wave 13: a mixotroph (A04) in its Photo mode releases sugar as a photosynthesizer does (0.50 per C fixed;
    // intake.ts route 2), so it is a maker, flagged `inLight` for the words.
    if (s.photosynthetic) makers.push(i);
    if (s.mixotroph) inLight.push(i);
    if (s.abilities.includes('E_STARCH_SECRETION')) enzyme.push(i);
  });
  return inLight.length > 0 ? { makers, enzyme, inLight } : { makers, enzyme };
}

function inspectCell(world: World, cell: number): CellInspect {
  const fields: Record<string, number> = {};
  for (const id of FIELD_IDS) {
    const f = world.fields[id];
    if (!f) continue;
    const v = f[cell]!;
    if (v !== 0) fields[id] = v;
  }
  const residents: { birthId: number; speciesId: string }[] = [];
  forEachInCell(world, cell, (s) => {
    if (world.ents.cols.alive[s] === 1) residents.push({ birthId: world.ents.cols.birthId[s]!, speciesId: world.species[world.ents.cols.species[s]!]!.id });
  });
  return {
    cell,
    x: cell % GRID_W,
    y: Math.floor(cell / GRID_W),
    substrate: SUBSTRATE_NAMES[world.grid.substrate[cell]!] ?? 'water',
    structure: STRUCTURE_NAMES[world.grid.structure[cell]!] ?? 'none',
    fields,
    ph: world.derived.ph[cell]!,
    light: world.derived.light[cell]!,
    residents,
    load: world.derived.cellLoad[cell]!,
    // P3.1 (SPEC §12.1): the chemistry and light readings, by the simulation's own rules (@sim/chemistry).
    ...chemistryLines(world, cell),
    ...reactionLines(world, cell),
    ...objectLine(world, cell),
    // Protocol 3: climate, the light factors beyond baseline and shade, edge barriers and the device.
    ...climateLines(world, cell),
    ...cellEdgeLines(world, cell),
    ...cellDeviceLine(world, cell),
  };
}

/** Protocol 3 (SPEC §4.4, §4.7, §4.8): local warmth and moisture, only in a world recording 'climate'; lightFactors beyond baseline and shade. */
export function climateLines(world: World, cell: number): Pick<CellInspect, 'climate' | 'lightFactors'> {
  const out: { climate?: CellClimate; lightFactors?: CellLightFactors } = {};
  if (worldHasSystem(world, 'climate')) {
    const w = world.climate.warmth;
    out.climate = {
      warmth: w === null ? world.settings.warmth : w[cell]!,
      ambientWarmth: world.settings.warmth,
      warmthLocal: w !== null,
      moisture: world.derived.moisture[cell]!,
      moistureLocal: world.climate.moisture !== null,
    };
  }
  const lf = lightFactors(world, cell);
  if (lf.cycle !== undefined || lf.roof !== undefined || lf.canopy !== undefined) {
    out.lightFactors = {
      ...(lf.cycle !== undefined ? { cycle: { phase: lf.cycle.phase, factor: lf.cycle.factor, secondsIntoPhase: lf.cycle.secondsIntoPhase } } : {}),
      ...(lf.roof !== undefined ? { roof: lf.roof } : {}),
      ...(lf.canopy !== undefined ? { canopy: lf.canopy } : {}),
    };
  }
  return out;
}

/** Protocol 3: the edge barriers on a cell's four sides (N, E, S, W), each with its gate tally; absent when none. */
export function cellEdgeLines(world: World, cell: number): Pick<CellInspect, 'edges'> {
  if (world.edges.length === 0) return {};
  const x = cell % GRID_W;
  const sides: { side: CellEdgeLine['side']; lower: number; dir: 'R' | 'D'; mine: boolean }[] = [];
  if (cell >= GRID_W) sides.push({ side: 'N', lower: cell - GRID_W, dir: 'D', mine: false });
  if (x + 1 < GRID_W) sides.push({ side: 'E', lower: cell, dir: 'R', mine: true });
  if (cell + GRID_W < CELL_COUNT) sides.push({ side: 'S', lower: cell, dir: 'D', mine: true });
  if (x > 0) sides.push({ side: 'W', lower: cell - 1, dir: 'R', mine: false });
  const lines: CellEdgeLine[] = [];
  for (const sd of sides) {
    const e = world.edges.find((b) => b.cell === sd.lower && b.dir === sd.dir);
    if (!e) continue;
    const code = edgeCodeArrays([e])[sd.dir === 'R' ? 'r' : 'd'][e.cell]!;
    const t = world.gateTally.find((g) => g.id === e.id);
    const fields: Record<string, number> = {};
    if (t) for (const id of FIELD_IDS) if (t.fields[id] !== undefined) fields[id] = t.fields[id]!;
    lines.push({
      id: e.id,
      kind: e.kind,
      side: sd.side,
      neighbour: sd.mine ? edgeNeighbour(e.cell, e.dir) : e.cell,
      code,
      ...(e.kind === 'S03' ? { open: e.open === true } : {}),
      // flow +1 carries from e.cell to its neighbour: 'out' for the edge's own (lower) cell.
      ...(e.kind === 'S04' ? { flow: ((e.flow ?? 1) === 1) === sd.mine ? ('out' as const) : ('in' as const) } : {}),
      tally: t ? { fields, organisms: t.organisms } : null,
    });
  }
  return lines.length > 0 ? { edges: lines } : {};
}

/** A resin's saturation: min(1, Σ bound / RESIN_CAPACITY), summed in RESIN_TARGETS order; 0 with nothing bound. */
export function resinSaturation(d: Pick<Device, 'bound'>): number {
  if (!d.bound) return 0;
  let sum = 0;
  for (const t of RESIN_TARGETS) sum += d.bound[t] ?? 0;
  return Math.min(1, sum / RESIN_CAPACITY);
}

/** Protocol 3: the furnishing or device on a cell (its settings; a resin's bound amounts and saturation). */
export function cellDeviceLine(world: World, cell: number): Pick<CellInspect, 'device'> {
  if (world.devices.length === 0) return {};
  const d = world.devices.find((v) => v.cell === cell);
  if (!d) return {};
  const line: CellDeviceLine = {
    id: d.id,
    kind: d.kind,
    ...(d.on !== undefined ? { on: d.on } : {}),
    ...(d.kind === 'S08'
      ? {
          resinSelect: [...(d.resinSelect ?? [])],
          bound: Object.fromEntries(RESIN_TARGETS.filter((t) => d.bound?.[t] !== undefined).map((t) => [t, d.bound![t]!])),
          saturation: resinSaturation(d),
        }
      : {}),
  };
  return { device: line };
}

/**
 * The dish geometry (GeometryMsg; protocol 3 adds edges and devices). Built only when geometryVersion
 * moved; fresh copies, so the arrays can be transferred.
 */
export function packGeometry(world: World): GeometryMsg {
  return {
    version: world.grid.geometryVersion,
    substrate: new Uint8Array(world.grid.substrate),
    structure: new Uint8Array(world.grid.structure),
    shade: new Float32Array(world.grid.shade),
    edges: packEdges(world.edges),
    devices: world.devices.map(geometryDevice),
  };
}

/** GeometryMsg.edges: per-cell codes (EDGE_FLOW_BACK on a backward S04) and the list; null for none. */
export function packEdges(edges: readonly EdgeBarrier[]): GeometryEdges | null {
  if (edges.length === 0) return null;
  const { r, d } = edgeCodeArrays(edges);
  const list: GeometryEdge[] = [];
  for (const e of edges) {
    if (e.kind === 'S04' && e.flow === -1) {
      const arr = e.dir === 'R' ? r : d;
      arr[e.cell] = arr[e.cell]! | EDGE_FLOW_BACK;
    }
    list.push({
      id: e.id,
      kind: e.kind,
      cell: e.cell,
      dir: e.dir,
      ...(e.open !== undefined ? { open: e.open } : {}),
      ...(e.flow !== undefined ? { flow: e.flow } : {}),
    });
  }
  return { r, d, list };
}

function geometryDevice(d: Device): GeometryDevice {
  return {
    id: d.id,
    kind: d.kind,
    cell: d.cell,
    ...(d.on !== undefined ? { on: d.on } : {}),
    ...(d.resinSelect !== undefined ? { resinSelect: [...d.resinSelect] } : {}),
  };
}

/** SnapshotMsg.resins: every S08's saturation, in world.devices order; undefined when the dish has none. */
export function packResins(world: World): SnapshotResin[] | undefined {
  let out: SnapshotResin[] | undefined;
  for (const d of world.devices) if (d.kind === 'S08') (out ??= []).push({ id: d.id, cell: d.cell, saturation: resinSaturation(d) });
  return out;
}

/** SnapshotMsg.environment: the light mode and drying, only when the world records 'climate'. */
export function packEnvironment(world: World): SnapshotEnvironment | undefined {
  if (!worldHasSystem(world, 'climate')) return undefined;
  return { lightMode: world.settings.lightMode, drying: world.settings.drying };
}

/** DishInfo.speciesFreeClass: each species' free transport class (barriers.ts freeClassOfSpecies). */
export function speciesFreeClasses(world: World): ReturnType<typeof freeClassOfSpecies>[] {
  return world.species.map((s) => freeClassOfSpecies(s.def));
}

/** P3.6: the cell's finite food object, if any: its kind and remaining inventory (C per pool, bound N). */
export function objectLine(world: World, cell: number): Pick<CellInspect, 'object'> {
  const o = world.objects.find((ob) => ob.cell === cell);
  if (!o) return {};
  const pools: { sugar?: number; starch?: number; protein?: number } = {};
  if (o.pools.sugar !== undefined) pools.sugar = o.pools.sugar;
  if (o.pools.starch !== undefined) pools.starch = o.pools.starch;
  if (o.pools.protein !== undefined) pools.protein = o.pools.protein;
  return { object: { id: o.id, kind: o.kind, pools, n: o.n } };
}

/** Enzyme → its fields (SPEC §5.3; the rules in @sim/conversion and the producer slots in @sim/secretion). */
const REACTION_FIELDS: readonly { readonly enzyme: ReactionEnzyme; readonly activity: FieldId; readonly substrate: FieldId; readonly product: ReactionRow['product'] }[] = [
  { enzyme: 'starch', activity: 'eStarch', substrate: 'starch', product: 'sugar' },
  { enzyme: 'oil', activity: 'eOil', substrate: 'oil', product: 'metabolite' },
  { enzyme: 'protein', activity: 'eProtein', substrate: 'protein', product: 'broth' },
];

/** The four-neighbour cells of `cell` inside the grid, the cell itself first. */
function cellAndNeighbours(cell: number): number[] {
  const x = cell % GRID_W;
  const out = [cell];
  if (x + 1 < GRID_W) out.push(cell + 1);
  if (x > 0) out.push(cell - 1);
  if (cell + GRID_W < CELL_COUNT) out.push(cell + GRID_W);
  if (cell - GRID_W >= 0) out.push(cell - GRID_W);
  return out;
}

/**
 * Species ids (ascending species index) of living organisms that released `enzyme` in the last tick
 * (their producer bit in the `secreting` bit set, secretion.ts PRODUCER_BIT; native or module rules),
 * in `cell` or a four-neighbour: SPEC §5.3's emit neighbourhood. A producer that is only nearby (E ≤ 35,
 * no substrate, saturated, just arrived, not Active) is not credited: "Made here by …" needs a recorded
 * release, otherwise the row says "Enzyme present" (honest labels).
 */
export function producersNear(world: World, enzyme: ReactionEnzyme, cell: number): string[] {
  const c = world.ents.cols;
  const bit = PRODUCER_BIT[enzyme];
  const found = new Uint8Array(world.species.length);
  for (const k of cellAndNeighbours(cell)) {
    forEachInCell(world, k, (s) => {
      if (c.alive[s] !== 1 || (c.secreting[s]! & bit) === 0) return;
      const prof = profileOf(world, s);
      const rules = enzyme === 'starch' ? prof.starch : enzyme === 'oil' ? prof.oil : prof.protein;
      if (rules !== null) found[c.species[s]!] = 1;
    });
  }
  const out: string[] = [];
  for (let k = 0; k < found.length; k++) if (found[k] === 1) out.push(world.species[k]!.id);
  return out;
}

/**
 * P3.6 reaction ledger rows (SPEC §12.1): every enzyme with activity in this cell or conversion here
 * in the last whole second. Absent when the world allocates no enzyme field.
 */
export function reactionLines(world: World, cell: number): Pick<CellInspect, 'reactions'> {
  const rows: ReactionRow[] = [];
  let any = false;
  const breaker = world.fields.breaker?.[cell] ?? 0;
  for (const r of REACTION_FIELDS) {
    const act = world.fields[r.activity];
    const sub = world.fields[r.substrate];
    if (!act || !sub) continue;
    any = true;
    const here = reactionInCell(world, r.enzyme, cell);
    const a = act[cell]!;
    if (!(a > 0) && !(here.c > 0)) continue;
    const dish = reactionInDish(world, r.enzyme);
    rows.push({
      enzyme: r.enzyme,
      product: r.product,
      activity: a,
      effectiveActivity: a / (1 + breaker),
      breaker,
      substrate: sub[cell]!,
      converted: here.c,
      nMoved: here.n,
      dishConverted: dish.c,
      dishNMoved: dish.n,
      cumulative: world.conversionTotals[r.enzyme],
      madeBy: producersNear(world, r.enzyme, cell),
    });
  }
  return any ? { reactions: rows } : {};
}

function chemistryLines(world: World, cell: number): Pick<CellInspect, 'salinity' | 'oxygen' | 'lightBase' | 'shade' | 'exposure'> {
  const light = lightFactors(world, cell);
  const bd = exposureBreakdown(world, cell);
  return {
    salinity: salinityIndex(world, cell),
    oxygen: world.fields.oxygen?.[cell] ?? 0,
    lightBase: light.baseline,
    shade: light.shade,
    // D-0120 carry-over (wave 13): the rival line is kept in a dish that records rivalry but no inhibitor
    // (it was dropped with the empty inhibitor lines); a v1.0 dish has no rival field, so it reads as before.
    ...(bd.lines.length > 0 || bd.rival !== undefined ? { exposure: bd } : {}),
  };
}

export function buildInspector(world: World, sel: Selection): InspectorPayload {
  if (sel.kind === 'cell') return { kind: 'cell', cell: inspectCell(world, sel.cell) };
  const slot = findSlotByBirth(world, sel.birthId);
  if (slot >= 0) return { kind: 'entity', entity: inspectEntity(world, slot) };
  const L = world.lineage;
  const children = childrenOf(L, sel.birthId);
  return {
    kind: 'gone',
    gone: {
      birthId: sel.birthId,
      deathTick: lineageField(L, 'deathTick', sel.birthId) ?? -1,
      cause: lineageField(L, 'deathCause', sel.birthId) ?? 0,
      divided: (lineageField(L, 'deathCause', sel.birthId) ?? 0) === -1,
      children,
    },
  };
}

function relationOf(stepsUp: number, stepsDown: number): FamilyRelation {
  if (stepsDown === 0) return stepsUp === 1 ? 'parent' : 'ancestor';
  if (stepsUp === 0) return stepsDown === 1 ? 'child' : 'descendant';
  if (stepsUp === 1 && stepsDown === 1) return 'sibling';
  return 'relative';
}

/**
 * "Where is its family?" (SPEC §12.1, UX §5.3): living organisms that share a recorded ancestor
 * with `birthId`, back to its introduced founder. A pure read of lineage records and entity
 * columns, visited in slot order; parent links always point to lower birthIds, so every walk ends.
 */
export function buildFamily(world: World, birthId: number): FamilyAnswer {
  const L = world.lineage;
  const c = world.ents.cols;
  const n = L.parent.length;
  // Steps from the asked-about organism up to each of its retained ancestors (-1 = not on the chain).
  const up = new Int32Array(n).fill(-1);
  let root = birthId;
  let historyIncomplete = !lineageHas(L, birthId);
  if (!historyIncomplete) {
    let b = birthId;
    let d = 0;
    up[b - L.base] = 0;
    for (;;) {
      const p = L.parent[b - L.base]!;
      if (p === 0) break;
      if (!lineageHas(L, p)) {
        historyIncomplete = true;
        break;
      }
      d++;
      up[p - L.base] = d;
      b = p;
    }
    root = b;
  }
  // For every retained record: the shared ancestor it reaches going up, and how many steps.
  const meet = new Int32Array(n).fill(-2); // -2 unknown, -1 not family, else index of shared ancestor
  const down = new Int32Array(n);
  const resolve = (start: number): number => {
    const path: number[] = [];
    let k = start;
    let found: number;
    for (;;) {
      if (meet[k] !== -2) {
        found = meet[k]!;
        break;
      }
      if (up[k]! >= 0) {
        meet[k] = k;
        down[k] = 0;
        found = k;
        break;
      }
      path.push(k);
      const p = L.parent[k]!;
      if (p === 0 || !lineageHas(L, p)) {
        found = -1;
        break;
      }
      k = p - L.base;
    }
    // Unwind: each record on the path is one step further below the shared ancestor than its parent.
    for (let q = path.length - 1; q >= 0; q--) {
      const r = path[q]!;
      meet[r] = found;
      if (found >= 0) {
        const p = L.parent[r]! - L.base;
        down[r] = down[p]! + 1;
      }
    }
    return found;
  };
  const members: FamilyMember[] = [];
  let livingTotal = 0;
  let alive = false;
  if (lineageHas(L, birthId)) {
    for (let i = 0; i < world.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      const b = c.birthId[i]!;
      if (b === birthId) {
        alive = true;
        continue;
      }
      if (!lineageHas(L, b)) continue;
      const k = b - L.base;
      const m = resolve(k);
      if (m < 0) continue;
      livingTotal++;
      const stepsUp = up[m]!;
      const stepsDown = down[k]!;
      members.push({
        birthId: b,
        entityId: c.entityId[i]!,
        speciesIdx: c.species[i]!,
        x: c.x[i]!,
        y: c.y[i]!,
        generation: c.generation[i]!,
        relation: relationOf(stepsUp, stepsDown),
        stepsUp,
        stepsDown,
      });
    }
  } else {
    for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1 && c.birthId[i] === birthId) alive = true;
  }
  members.sort((a, b) => a.stepsUp + a.stepsDown - (b.stepsUp + b.stepsDown) || a.birthId - b.birthId);
  const parentId = lineageField(L, 'parent', birthId) ?? 0;
  let parent: FamilyAnswer['parent'] = null;
  if (parentId > 0) {
    let parentAlive = false;
    for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1 && c.birthId[i] === parentId) parentAlive = true;
    parent = { birthId: parentId, alive: parentAlive, divided: lineageField(L, 'deathCause', parentId) === -1 };
  }
  return {
    birthId,
    tick: world.tick,
    alive,
    parent,
    rootBirthId: root,
    rootIntroduced: !historyIncomplete && (lineageField(L, 'parent', root) ?? -1) === 0,
    historyIncomplete,
    members: members.slice(0, FAMILY_MAX_MEMBERS),
    livingTotal,
  };
}
