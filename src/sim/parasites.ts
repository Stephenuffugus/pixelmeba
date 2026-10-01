/**
 * Host-draining parasites (SPEC §7.4, §6.5 host drains, §6.8; CT §1.2 / §1.3 / §3.3 / §12.5; P3.4).
 * X01 Hitcher attaches to A01 only (its species record's hostIds), one parasite per host.
 *
 * A host/parasite pair is the (slot, birthId) reference pair `parasite.hostSlot/hostBirthId` ↔
 * `host.parasiteSlot/parasiteBirthId` (entity columns since world schema 1; −1/0 when empty). Every
 * rule here acts only on organisms whose species carries the HOST_DRAIN native ability, or on the
 * hosts such an organism holds, so a world without parasites (every g2 save) never runs any of it.
 *
 * - Stage 4 (movement.ts hooks): an attached parasite does not move by itself (`parasiteMove` returns
 *   true); a free one pursues the nearest valid host within its sensing radius, like a predator its
 *   prey; after every move an attached parasite takes its host's position at no movement cost
 *   (`followHosts`).
 * - Stage 5 (contacts.ts, after predation): stale pairs are released first (`releaseStaleParasites`:
 *   a host that is gone, or that is no longer Active, i.e. Preparing, Resting or Waking, lets its
 *   parasite go alive in place); then free parasites attach on contact (`attachParasites`): centres
 *   ≤ 0.5 cells, to an unparasitized Active host of a listed species. Competing claims for one host go
 *   to the highest det(seed, 'contact', tick, KIND_PARASITE, parasite birthId).
 * - Stage 6 (intake.ts): drains are reserved before any ordinary request (`reserveHostDrains`) and
 *   committed after the ordinary commit (`commitHostDrains`). C = min(drainRate × dt, host B) with
 *   bound N = host N × C / host B; 50 % → parasite B, 30 % → cell CO2, 20 % → cell metabolite,
 *   E += energyPerCarbon × C, no oxygen debit; the parasite binds 0.05 N per C (bound first, then
 *   the cell's free nutrient; a shortage of free nutrient scales the drain); unused bound N returns
 *   to the cell's free nutrient. Every move is internal (conservation).
 * - Stage 7 (maintenance.ts): a host with a live attached parasite whose B < 0.25 × B0' dies with
 *   DEATH_PARASITE_DRAIN (`drainDeathDue`). Every removal of an organism (killEntity, the predation
 *   capture, lysis) calls `releaseHostPair` first, so a parasite is released alive and a host whose
 *   parasite died is free again.
 * - Stage 9 (births.ts hook `onDivision`): the retained daughter keeps the pair, re-keyed to its new
 *   birthId; the new daughter starts free (its slot is fresh). A dividing parasite keeps its host on
 *   the retained half and its offspring is free.
 */
import { CONTACT_DISTANCE, DT, GRID_H, GRID_W, METABOLITE_FRACTION, NUTRIENT_PER_CARBON, BIOMASS_FRACTION, CO2_FRACTION, USABLE_INTAKE_FRACTION, AGENT_CAP } from './constants';
import { FLAG, LIFE_ACTIVE } from './entities';
import { cellIndex } from './grid';
import { subtractPool } from './ledger';
import type { Profile } from './phenotype';
import { profileOf } from './profiles';
import { R } from './reasons';
import { det, STREAMS } from './rng';
import { entityCell, forEachInCell } from './spatial';
import type { SpeciesRT } from './species';
import { markField } from './transport';
import type { World } from './world';

/**
 * Stage 5 contact kind for parasite attachment on the shared 'contact' stream (contacts.ts uses 1 for
 * attacks; viruses.ts 3 for the infection unit order). Saved worlds depend on these values: never renumber.
 */
export const KIND_PARASITE = 2;

/** A host dies below this fraction of its B0' while a live parasite is attached (SPEC §7.4, CT §12.5). */
export const HOST_DEATH_FRACTION = 0.25;

/** Whether this species drains a host (native HOST_DRAIN). */
export function isParasiteSpecies(sp: SpeciesRT): boolean {
  return sp.abilities.includes('HOST_DRAIN');
}

/** Whether any species of this world drains a host (the parasite rules have nothing to do otherwise). */
export function worldHasParasites(world: World): boolean {
  for (let k = 0; k < world.species.length; k++) if (isParasiteSpecies(world.species[k]!)) return true;
  return false;
}

/** Whether `hostSlot`'s species is listed in the parasite species' hostIds (ancestor-ID based). */
export function hostListed(world: World, parasite: SpeciesRT, hostSlot: number): boolean {
  const c = world.ents.cols;
  return parasite.def.hostIds.includes(world.species[c.species[hostSlot]!]!.id);
}

/** The live parasite attached to `host`, or −1. */
export function parasiteOf(world: World, host: number): number {
  const c = world.ents.cols;
  const p = c.parasiteSlot[host]!;
  return p >= 0 && world.ents.refValid(p, c.parasiteBirthId[host]!) ? p : -1;
}

/** The live host `parasite` is attached to, or −1. */
export function hostOf(world: World, parasite: number): number {
  const c = world.ents.cols;
  const h = c.hostSlot[parasite]!;
  return h >= 0 && world.ents.refValid(h, c.hostBirthId[parasite]!) ? h : -1;
}

function clearHostRef(world: World, parasite: number): void {
  const c = world.ents.cols;
  c.hostSlot[parasite] = -1;
  c.hostBirthId[parasite] = 0;
}

function clearParasiteRef(world: World, host: number): void {
  const c = world.ents.cols;
  c.parasiteSlot[host] = -1;
  c.parasiteBirthId[host] = 0;
}

/**
 * Break every host/parasite pair `i` belongs to, before `i` is removed (killEntity, the predation
 * capture, lysis) or when its host rests. A released parasite stays alive where it is (it already sits
 * on its host's position). Both references are cleared on both sides.
 */
export function releaseHostPair(world: World, i: number): void {
  const c = world.ents.cols;
  if (c.parasiteSlot[i]! >= 0) {
    const p = parasiteOf(world, i);
    if (p >= 0 && c.hostSlot[p] === i) clearHostRef(world, p);
    clearParasiteRef(world, i);
  }
  if (c.hostSlot[i]! >= 0) {
    const h = hostOf(world, i);
    if (h >= 0 && c.parasiteSlot[h] === i) clearParasiteRef(world, h);
    clearHostRef(world, i);
  }
}

// ------------------------------------------------------------------------------------- stage 4

/**
 * Stage 4 hook for a parasite species (movement.ts, before the ordinary decision): returns true when
 * this function decided the organism's movement this tick. An attached parasite never moves by itself
 * (followHosts places it). A free one pursues the nearest valid host within its sensing radius (start-
 * of-stage positions, ties to the lower birthId), moving `speed' × dt` toward it and stopping at half
 * the contact distance, like a predator its prey. The host is found afresh every tick and never stored,
 * so no saved reference can point at an organism that has gone. With no host in range it falls back to
 * the ordinary decision (returns false).
 */
export function parasiteMove(
  world: World,
  i: number,
  sp: SpeciesRT,
  prof: Profile,
  startX: Float64Array,
  startY: Float64Array,
  moveToward: (tx: number, ty: number, stopWithin: number) => void,
  decisionInterval: number,
): boolean {
  if (!isParasiteSpecies(sp)) return false;
  const c = world.ents.cols;
  if (c.hostSlot[i]! >= 0) {
    c.flags[i] = c.flags[i]! & ~FLAG.moving;
    return true;
  }
  const target = nearestHost(world, i, sp, Math.max(1, prof.sensing), startX, startY);
  if (target < 0) return false;
  moveToward(startX[target]!, startY[target]!, CONTACT_DISTANCE * 0.5);
  c.decisionTimer[i] = c.decisionTimer[i] === 0 ? decisionInterval - 1 : c.decisionTimer[i]! - 1;
  return true;
}

/** A host `parasite` may take: alive, Active, unparasitized and of a listed species. */
function validHost(world: World, sp: SpeciesRT, parasite: number, host: number): boolean {
  const c = world.ents.cols;
  if (host === parasite || c.alive[host] !== 1) return false;
  if (c.lifeState[host] !== LIFE_ACTIVE) return false;
  if (parasiteOf(world, host) >= 0) return false;
  return hostListed(world, sp, host);
}

function nearestHost(world: World, i: number, sp: SpeciesRT, radius: number, startX: Float64Array, startY: Float64Array): number {
  const c = world.ents.cols;
  const px = c.x[i]!;
  const py = c.y[i]!;
  const cx = Math.floor(px);
  const cy = Math.floor(py);
  let best = -1;
  let bestD = Infinity;
  let bestBirth = Infinity;
  for (let y = Math.max(0, cy - radius); y <= Math.min(GRID_H - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(GRID_W - 1, cx + radius); x++) {
      forEachInCell(world, cellIndex(x, y), (s) => {
        if (!validHost(world, sp, i, s)) return;
        const d = (startX[s]! - px) ** 2 + (startY[s]! - py) ** 2;
        const b = c.birthId[s]!;
        if (d < bestD || (d === bestD && b < bestBirth)) {
          best = s;
          bestD = d;
          bestBirth = b;
        }
      });
    }
  }
  return best;
}

/**
 * Stage 4, after every organism has moved (movement.ts hook): each attached parasite takes its host's
 * position. No distance is recorded, so it pays no movement cost (SPEC §7.4).
 */
export function followHosts(world: World): void {
  if (!worldHasParasites(world)) return;
  const c = world.ents.cols;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1 || c.hostSlot[i]! < 0) continue;
    const h = hostOf(world, i);
    if (h < 0) continue;
    c.x[i] = c.x[h]!;
    c.y[i] = c.y[h]!;
  }
}

// ------------------------------------------------------------------------------------- stage 5

/**
 * Stage 5, before attachment: release every parasite whose host is gone (removed without passing
 * through releaseHostPair) or not Active (Preparing, Resting or Waking: "host rest releases the
 * parasite alive locally"), and clear a host reference whose parasite is gone.
 */
export function releaseStaleParasites(world: World): void {
  const c = world.ents.cols;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    if (c.hostSlot[i]! >= 0) {
      const h = hostOf(world, i);
      if (h < 0 || c.parasiteSlot[h] !== i || c.parasiteBirthId[h] !== c.birthId[i]) clearHostRef(world, i);
      else if (c.lifeState[h] !== LIFE_ACTIVE) releaseHostPair(world, i);
    }
    if (c.parasiteSlot[i]! >= 0) {
      const p = parasiteOf(world, i);
      if (p < 0 || c.hostSlot[p] !== i || c.hostBirthId[p] !== c.birthId[i]) clearParasiteRef(world, i);
    }
  }
}

const claimOf = new Int32Array(AGENT_CAP);
const bestClaimant = new Int32Array(AGENT_CAP);
const bestPriority = new Float64Array(AGENT_CAP);

/**
 * Stage 5 parasite attachment (after predation). Each free, Active parasite claims the nearest valid
 * host whose centre is within the contact distance (0.5 cells) of its own (ties to the lower birthId);
 * a host claimed by several parasites goes to the highest det(seed, 'contact', tick, KIND_PARASITE,
 * birthId), ties to the lower birthId; losers stay free this tick. Commits in ascending parasite slot.
 */
export function attachParasites(world: World): void {
  if (!worldHasParasites(world)) return;
  releaseStaleParasites(world);
  const e = world.ents;
  const c = e.cols;
  const hw = e.highWater;
  const contact2 = CONTACT_DISTANCE * CONTACT_DISTANCE;
  let any = false;
  for (let i = 0; i < hw; i++) {
    claimOf[i] = -1;
    bestClaimant[i] = -1;
  }
  for (let i = 0; i < hw; i++) {
    if (c.alive[i] !== 1 || c.lifeState[i] !== LIFE_ACTIVE || c.hostSlot[i]! >= 0) continue;
    const sp = world.species[c.species[i]!]!;
    if (!isParasiteSpecies(sp)) continue;
    const px = c.x[i]!;
    const py = c.y[i]!;
    const cx = Math.floor(px);
    const cy = Math.floor(py);
    let best = -1;
    let bestD = Infinity;
    let bestBirth = Infinity;
    for (let y = Math.max(0, cy - 1); y <= Math.min(GRID_H - 1, cy + 1); y++) {
      for (let x = Math.max(0, cx - 1); x <= Math.min(GRID_W - 1, cx + 1); x++) {
        forEachInCell(world, cellIndex(x, y), (s) => {
          if (!validHost(world, sp, i, s)) return;
          const d = (c.x[s]! - px) ** 2 + (c.y[s]! - py) ** 2;
          if (d > contact2) return;
          const b = c.birthId[s]!;
          if (d < bestD || (d === bestD && b < bestBirth)) {
            best = s;
            bestD = d;
            bestBirth = b;
          }
        });
      }
    }
    if (best < 0) continue;
    claimOf[i] = best;
    any = true;
    const pri = det(world.seed, STREAMS.contact, world.tick, KIND_PARASITE, c.birthId[i]!);
    const cur = bestClaimant[best]!;
    if (cur < 0 || pri > bestPriority[best]! || (pri === bestPriority[best]! && c.birthId[i]! < c.birthId[cur]!)) {
      bestClaimant[best] = i;
      bestPriority[best] = pri;
    }
  }
  if (!any) return;
  for (let i = 0; i < hw; i++) {
    const h = claimOf[i]!;
    if (h < 0 || bestClaimant[h] !== i) continue;
    c.hostSlot[i] = h;
    c.hostBirthId[i] = c.birthId[h]!;
    c.parasiteSlot[h] = i;
    c.parasiteBirthId[h] = c.birthId[i]!;
    c.flags[i] = c.flags[i]! & ~FLAG.moving;
  }
}

// ------------------------------------------------------------------------------------- stage 6

const drainC = new Float64Array(AGENT_CAP);
const drainSurplusN = new Float64Array(AGENT_CAP);
const drainCell = new Int32Array(AGENT_CAP);
const drained: number[] = [];

/**
 * Stage 6, before ordinary requests: reserve every attached parasite's drain from its host (one
 * snapshot: host B and N at the start of the stage). The host's B and N and the cell's free nutrient
 * needed by the parasite are taken now, so ordinary allocation sees what is left; the products are
 * added by commitHostDrains after the ordinary commit, so nothing produced here is consumed by another
 * organism in this stage (SPEC §3.3).
 */
export function reserveHostDrains(world: World): void {
  drained.length = 0;
  if (!worldHasParasites(world)) return;
  const c = world.ents.cols;
  const nutrient = world.fields.nutrient!;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1 || c.hostSlot[i]! < 0) continue;
    const h = hostOf(world, i);
    if (h < 0 || c.lifeState[h] !== LIFE_ACTIVE || c.lifeState[i] !== LIFE_ACTIVE) continue;
    const sp = world.species[c.species[i]!]!;
    const hostB = c.B[h]!;
    if (!(hostB > 0)) continue;
    let C = Math.min(sp.def.drainRate * DT, hostB);
    let bound = (c.N[h]! * C) / hostB;
    const cell = entityCell(c.x[h]!, c.y[h]!);
    // The parasite binds 0.05 N per C: bound N first, then the cell's free nutrient (SPEC §6.5); a
    // shortage of free nutrient limits the whole drain by the same fraction.
    const need = Math.max(0, NUTRIENT_PER_CARBON * C - bound);
    let free = 0;
    if (need > 0) {
      const got = Math.min(need, nutrient[cell]!);
      const L = got / need;
      C *= L;
      bound *= L;
      free = got;
    }
    if (C <= 0) continue;
    subtractPool(world, c.B, h, C, 'c');
    subtractPool(world, c.N, h, bound, 'n');
    if (free > 0) subtractPool(world, nutrient, cell, free, 'n');
    drainC[i] = C;
    drainSurplusN[i] = bound + free - NUTRIENT_PER_CARBON * C;
    drainCell[i] = cell;
    drained.push(i);
  }
}

/**
 * Stage 6, after the ordinary commit: commit the reserved drains. 50 % of C → parasite B, 30 % → cell
 * CO2, 20 % → cell metabolite; the parasite gains 0.05 N per C and energyPerCarbon × C energy (capped,
 * the excess dissipated with a ledger record); no oxygen is used; unused bound N goes to the cell's
 * free nutrient.
 */
export function commitHostDrains(world: World): void {
  if (drained.length === 0) return;
  const c = world.ents.cols;
  const co2 = world.fields.co2!;
  const metabolite = world.fields.metabolite!;
  const nutrient = world.fields.nutrient!;
  const EL = world.ledger.energy;
  for (let k = 0; k < drained.length; k++) {
    const i = drained[k]!;
    const C = drainC[i]!;
    const cell = drainCell[i]!;
    const sp = world.species[c.species[i]!]!;
    const prof = profileOf(world, i);
    c.B[i]! += BIOMASS_FRACTION * C;
    co2[cell]! += CO2_FRACTION * C;
    metabolite[cell]! += METABOLITE_FRACTION * C;
    c.N[i]! += NUTRIENT_PER_CARBON * C;
    const surplus = drainSurplusN[i]!;
    if (surplus > 0) nutrient[cell]! += surplus;
    const gain = sp.def.energyPerCarbon * C;
    EL.earned += gain;
    const E = c.E[i]! + gain;
    if (E > prof.energyCap) {
      EL.dissipated += E - prof.energyCap;
      c.E[i] = prof.energyCap;
    } else c.E[i] = E;
    c.lastIntakeTick[i] = world.tick;
    c.intakeAccum[i]! += C;
    c.flags[i] = c.flags[i]! | FLAG.feeding;
    if (C >= USABLE_INTAKE_FRACTION * sp.def.drainRate * DT) c.flags[i] = c.flags[i] | FLAG.usableIntake;
    c.limitCode[i] = R.NONE;
    c.limitValue[i] = 1;
  }
  drained.length = 0;
  markField(world, 'co2');
  markField(world, 'metabolite');
  markField(world, 'nutrient');
}

// ------------------------------------------------------------------------------------- stage 7

/**
 * Stage 7: whether host `i` dies of the drain now — a live parasite is attached and B < 0.25 × B0'
 * (SPEC §7.4; §6.8 has no biomass floor, so this is the explicit trigger).
 */
export function drainDeathDue(world: World, i: number): boolean {
  const c = world.ents.cols;
  if (c.parasiteSlot[i]! < 0 || parasiteOf(world, i) < 0) return false;
  return c.B[i]! < HOST_DEATH_FRACTION * profileOf(world, i).b0;
}

// ------------------------------------------------------------------------------------- stage 9

/**
 * Stage 9 hook (births.ts commitDivision, right after rekeyLinks): `i` is the retained daughter, now
 * carrying its new birthId; `newSlot` the new daughter (a fresh slot: no host, no parasite). The
 * retained daughter keeps its pair; the partner's stored birthId is re-pointed to the new one.
 */
export function onDivision(world: World, i: number, newSlot: number, parentBirthId: number): void {
  const c = world.ents.cols;
  const p = c.parasiteSlot[i]!;
  if (p >= 0 && world.ents.refValid(p, c.parasiteBirthId[i]!) && c.hostSlot[p] === i && c.hostBirthId[p] === parentBirthId) {
    c.hostBirthId[p] = c.birthId[i]!;
  }
  const h = c.hostSlot[i]!;
  if (h >= 0 && world.ents.refValid(h, c.hostBirthId[i]!) && c.parasiteSlot[h] === i && c.parasiteBirthId[h] === parentBirthId) {
    c.parasiteBirthId[h] = c.birthId[i]!;
  }
  // The offspring starts free and unparasitized (SPEC §7.4; G8): its slot was cleared at allocation.
  if (c.hostSlot[newSlot] !== -1 || c.parasiteSlot[newSlot] !== -1) {
    clearHostRef(world, newSlot);
    clearParasiteRef(world, newSlot);
  }
}

// ------------------------------------------------------------------------------------- inspector

/**
 * Inspector facts for an attached pair (worker snapshot): the parasite's species, birthId and the
 * measured drain — the carbon it took in the last whole second (intakeLastSecond; a parasite's only
 * intake is its drain, commitHostDrains). This is the drain actually committed, after the free-nutrient
 * limit L and the host-B cap, never the record's drainRate (honest labels).
 */
export function parasiteInfo(world: World, host: number): { readonly speciesIdx: number; readonly birthId: number; readonly rate: number } | null {
  const p = parasiteOf(world, host);
  if (p < 0) return null;
  const c = world.ents.cols;
  return { speciesIdx: c.species[p]!, birthId: c.birthId[p]!, rate: c.intakeLastSecond[p]! };
}

/** Inspector facts for an attached parasite: its host's species and birthId. */
export function hostInfo(world: World, parasite: number): { readonly speciesIdx: number; readonly birthId: number } | null {
  const h = hostOf(world, parasite);
  if (h < 0) return null;
  const c = world.ents.cols;
  return { speciesIdx: c.species[h]!, birthId: c.birthId[h]! };
}
