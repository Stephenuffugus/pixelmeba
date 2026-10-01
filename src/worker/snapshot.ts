/**
 * Snapshot and inspector builders (ARCH §8, SPEC §12.1). Pure reads of authoritative state: no
 * simulation randomness, no mutation. The worker transfers the typed arrays to the main thread.
 */
import { hostInfo, parasiteInfo } from '@sim/parasites';
import { infectionInfo } from '@sim/viruses';
import { fungalNetwork } from '@sim/fungi';
import { CELL_COUNT, GRID_W } from '@sim/constants';
import { allDivisionBlockers, divisionBlocker, divisionNeeds } from '@sim/births';
import { FLAG } from '@sim/entities';
import type { SimEvent } from '@sim/events';
import { FIELD_IDS, type FieldId } from '@sim/fields';
import { STRUCTURE_NAMES, SUBSTRATE_NAMES } from '@sim/grid';
import { hungryPredator } from '@sim/movement';
import { childrenOf, field as lineageField, has as lineageHas } from '@sim/lineage';
import { profileOf } from '@sim/profiles';
import { R } from '@sim/reasons';
import { PREY_NONE } from '@sim/species';
import { worldHasSystem } from '@sim/gates';
import { exposureBreakdown, lightFactors, salinityIndex } from '@sim/chemistry';
import { dormancySummary, moduleSummaries, reserveBand, upkeepNow } from '@sim/moduleView';
import { founderOriginOf } from '@sim/founders';
import { entityCell, forEachInCell } from '@sim/spatial';
import { response, SHOULDER_PH, SHOULDER_SALINITY, SHOULDER_WARMTH } from '@sim/suitability';
import { entitySuitabilityAt } from '@sim/crossing';
import type { World } from '@sim/world';
import {
  CUE2_ANCHORED,
  CUE2_INFECTED,
  CUE2_LINKED,
  CUE2_MOD_E04,
  CUE2_MOD_E06,
  CUE2_MOD_E07,
  CUE2_MOD_E08,
  CUE2_MOD_E09,
  CUE2_MOD_E10,
  CUE2_MOD_E12,
  CUE2_PARASITIZED,
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
    outE[o + E_LINKMASK] = linkMaskOf(world, i);
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
 * genome (like CUE_MOD_E0x), and E07 seeking light (an E07 carrier that is moving). DETRITUS_INTAKE and
 * RELEASING_PROTEIN stay 0 until wave 4 adds their FLAG bits.
 */
function cue2Of(world: World, i: number, mods: readonly string[], flags: number): number {
  const c = world.ents.cols;
  const e = world.ents;
  let cue2 = 0;
  if (c.infectedBy[i] !== 0) cue2 |= CUE2_INFECTED;
  const p = c.parasiteSlot[i]!;
  if (p >= 0 && e.refValid(p, c.parasiteBirthId[i]!)) cue2 |= CUE2_PARASITIZED;
  if (c.anchorState[i] === 1) cue2 |= CUE2_ANCHORED;
  if ((c.aLink0[i]! >= 0 && e.refValid(c.aLink0[i]!, c.aLinkB0[i]!)) || (c.aLink1[i]! >= 0 && e.refValid(c.aLink1[i]!, c.aLinkB1[i]!))) cue2 |= CUE2_LINKED;
  if (mods.length > 0) {
    if (mods.includes('E04')) cue2 |= CUE2_MOD_E04;
    if (mods.includes('E06')) cue2 |= CUE2_MOD_E06;
    if (mods.includes('E07')) {
      cue2 |= CUE2_MOD_E07;
      if (flags & FLAG.moving) cue2 |= CUE2_SEEKING_LIGHT;
    }
    if (mods.includes('E08')) cue2 |= CUE2_MOD_E08;
    if (mods.includes('E09')) cue2 |= CUE2_MOD_E09;
    if (mods.includes('E10')) cue2 |= CUE2_MOD_E10;
    if (mods.includes('E12')) cue2 |= CUE2_MOD_E12;
  }
  return cue2;
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
 * Bit 4 (a transport transfer this second) stays 0 until wave 3's F02 transport.
 */
function linkMaskOf(world: World, i: number): number {
  const c = world.ents.cols;
  let mask = 0;
  for (const [slotCol, birthCol] of FUNGAL_LINK_COLUMNS) {
    const j = c[slotCol][i]!;
    if (j < 0 || !world.ents.refValid(j, c[birthCol][i]!)) continue;
    const dx = Math.floor(c.x[j]!) - Math.floor(c.x[i]!);
    const dy = Math.floor(c.y[j]!) - Math.floor(c.y[i]!);
    if (dx === 0 && dy === 0) continue;
    if (Math.abs(dx) >= Math.abs(dy)) mask |= dx > 0 ? LINKMASK_E : LINKMASK_W;
    else mask |= dy > 0 ? LINKMASK_S : LINKMASK_N;
  }
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
  for (let i = 0; i < e.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    for (const [slotCol, birthCol] of [['aLink0', 'aLinkB0'], ['aLink1', 'aLinkB1']] as const) {
      const j = c[slotCol][i]!;
      if (j <= i || !e.refValid(j, c[birthCol][i]!)) continue;
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
/** Bands: starch, detritus, oil, protein, sugar haze, catalysis (carbon converted last tick), film (protocol 2). */
export const DEPOSIT_BANDS = 7;
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
  kinds.forEach((id, k) => {
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

export function packOverlay(world: World, id: OverlayId, out: Float32Array | null): { data: Float32Array; max: number } | null {
  const buf = out && out.length === CELL_COUNT ? out : new Float32Array(CELL_COUNT);
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
      ev.type !== 'branchExtinct'
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
    if (code === R.PRED_NO_PREY && target) code = R.PRED_OUT_OF_CONTACT;
    predation = { code, targetBirthId: target ? c.preyBirthId[slot]! : 0, cooldown: c.attackCooldown[slot]! };
  }
  const foodHere = prof.foods.map((f) => ({ food: f, amount: world.fields[f]?.[cell] ?? 0 }));
  // P3.3: a film digester in a film world also eats the film here, as detritus (D-0038).
  if (sp.def.digestsFilm && world.fields.film !== undefined && worldHasSystem(world, 'film')) foodHere.push({ food: 'film', amount: world.fields.film[cell]! });
  const network = fungalNetwork(world, slot);
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
      warmth: response(world.settings.warmth, prof.warmth[0], prof.warmth[1], SHOULDER_WARMTH),
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
    ...(world.fields.film !== undefined && worldHasSystem(world, 'film') ? { filmHere: world.fields.film[cell]! } : {}),
    ...parasiteAndInfection(world, slot),
  };
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
function sugarSourcesOf(world: World): { makers: number[]; enzyme: number[] } {
  const makers: number[] = [];
  const enzyme: number[] = [];
  world.species.forEach((s, i) => {
    if (s.photosynthetic && !s.mixotroph) makers.push(i);
    if (s.abilities.includes('E_STARCH_SECRETION')) enzyme.push(i);
  });
  return { makers, enzyme };
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
  };
}

function chemistryLines(world: World, cell: number): Pick<CellInspect, 'salinity' | 'oxygen' | 'lightBase' | 'shade' | 'exposure'> {
  const light = lightFactors(world, cell);
  const bd = exposureBreakdown(world, cell);
  return {
    salinity: salinityIndex(world, cell),
    oxygen: world.fields.oxygen?.[cell] ?? 0,
    lightBase: light.baseline,
    shade: light.shade,
    ...(bd.lines.length > 0 ? { exposure: bd } : {}),
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
