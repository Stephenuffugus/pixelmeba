/**
 * F02 fungal transport (SPEC §3.2 row 8, §7.7; CT §12.6 "F02 transport"; D04 §9; P3.6).
 *
 * One simultaneous pass in stage 8, after shared construction and before births, reading ONE snapshot
 * of the post-construction body pools (B, N) of every segment that has a transport link:
 *
 * - Edges: every living LINK_TRANSPORT link (a, b) once, in canonical order (lower slot first, then
 *   the partner's slot ascending). Both ends must be living segments of a TRANSPORT_LINKS species
 *   ("only living F02 links carry resources") and Active (proposed decision: a Resting segment has no
 *   links in use, SPEC §7.6). Adhesion links are never fungal links (separate columns).
 * - Donor: the end with more B in the snapshot (equal: no flow). B0' is each segment's phenotype b0.
 *   The edge is active iff B_donor > B0'_donor, B_receiver < 1.5 B0'_receiver and
 *   B_donor − B_receiver ≥ 0.01 B0'_receiver (the "at least 0.01 B0' less" clause is the receiver's).
 * - Request r = min(0.02 × dt, (B_donor − B_receiver) / 2).
 * - Donor cap first: each donor's outgoing requests are scaled by min(1, (B_donor − B0') / Σout).
 *   Receiver cap second: each receiver's (donor-capped) incoming requests are scaled by
 *   min(1, (1.5 B0' − B_receiver) / Σin). No re-offer of what a cap removed (proposed decision).
 * - Commit all edges together: carbon r and nutrient N_donor × r / B_donor (snapshot values) move from
 *   donor to receiver. No energy moves. Nothing enters or leaves the dish, so the ledger is unchanged.
 * - A segment may send and receive in one pass; carbon received is passed on only on later ticks
 *   (every edge reads the snapshot, never a value committed this pass).
 *
 * Gate: the pass acts only on LINK_TRANSPORT links, which only a TRANSPORT_LINKS species (F02) forms,
 * so every world without one runs bit-identically (it returns before touching anything).
 *
 * Observation (never read by the simulation, never hashed or saved): `world.fungalFlow` records per
 * slot what it sent and received over the last ten dish seconds and to/from whom (the inspector's
 * "Sent … to 2 linked segments in the last 10 s" line and the snapshot's transfer bit), cleared when
 * the slot's segment changes (death, slot reuse, or division: a daughter is a new individual); and
 * `history.pendingFungalTransfer` sums the carbon moved during the current dish second for the
 * per-second history sample (publish.ts).
 */
import { AGENT_CAP, DT, TICKS_PER_SECOND } from './constants';
import { LIFE_ACTIVE } from './entities';
import { FUNGAL_BIRTH_COLUMNS, FUNGAL_KIND_COLUMNS, FUNGAL_SLOT_COLUMNS, LINK_TRANSPORT } from './links';
import { profileOf } from './profiles';
import type { World } from './world';

/** CT §12.6: carbon per second one edge may carry. */
export const TRANSPORT_RATE_PER_SECOND = 0.02;
/** CT §12.6: a donor needs B above 1 × B0'. */
export const TRANSPORT_DONOR_MIN = 1;
/** CT §12.6: a receiver needs B below 1.5 × B0'. */
export const TRANSPORT_RECEIVER_MAX = 1.5;
/** CT §12.6: the receiver holds at least 0.01 × B0' less than the donor. */
export const TRANSPORT_MIN_DIFF = 0.01;

/** Seconds of history the observation keeps (the inspector's "in the last 10 s"). */
export const FLOW_WINDOW_SECONDS = 10;
/** Recent partners remembered per slot (links form only at branching, so at most 4 + a few per 10 s). */
const FLOW_PARTNERS = 8;

/** Whether any species of this world forms transport links (the cheap gate). */
export function worldHasTransport(world: World): boolean {
  for (let k = 0; k < world.species.length; k++) if (world.species[k]!.abilities.includes('TRANSPORT_LINKS')) return true;
  return false;
}

// ---- Observation (world.fungalFlow) -------------------------------------------------------------

/**
 * Per-slot transfer observation, allocated when a world first moves carbon along a transport link.
 * Never read by the simulation, never hashed, never saved (a reload starts it empty).
 */
export interface FungalFlowObs {
  /** birthId of the segment each slot's record belongs to (0: none). */
  readonly owner: Uint32Array;
  /** Last tick the slot sent or received (−1 none). */
  readonly lastTick: Int32Array;
  /** Per slot × FLOW_WINDOW_SECONDS ring: the dish second each bucket holds (−1 none). */
  readonly stamp: Int32Array;
  readonly sent: Float64Array;
  readonly received: Float64Array;
  /** Per slot × FLOW_PARTNERS: partner birthId, last second sent to it, last second received from it (−1). */
  readonly partner: Uint32Array;
  readonly partnerSent: Int32Array;
  readonly partnerRecv: Int32Array;
}

function createFlow(): FungalFlowObs {
  return {
    owner: new Uint32Array(AGENT_CAP),
    lastTick: new Int32Array(AGENT_CAP).fill(-1),
    stamp: new Int32Array(AGENT_CAP * FLOW_WINDOW_SECONDS).fill(-1),
    sent: new Float64Array(AGENT_CAP * FLOW_WINDOW_SECONDS),
    received: new Float64Array(AGENT_CAP * FLOW_WINDOW_SECONDS),
    partner: new Uint32Array(AGENT_CAP * FLOW_PARTNERS),
    partnerSent: new Int32Array(AGENT_CAP * FLOW_PARTNERS).fill(-1),
    partnerRecv: new Int32Array(AGENT_CAP * FLOW_PARTNERS).fill(-1),
  };
}

function clearSlot(f: FungalFlowObs, s: number, owner: number): void {
  f.owner[s] = owner;
  f.lastTick[s] = -1;
  f.stamp.fill(-1, s * FLOW_WINDOW_SECONDS, (s + 1) * FLOW_WINDOW_SECONDS);
  f.sent.fill(0, s * FLOW_WINDOW_SECONDS, (s + 1) * FLOW_WINDOW_SECONDS);
  f.received.fill(0, s * FLOW_WINDOW_SECONDS, (s + 1) * FLOW_WINDOW_SECONDS);
  f.partner.fill(0, s * FLOW_PARTNERS, (s + 1) * FLOW_PARTNERS);
  f.partnerSent.fill(-1, s * FLOW_PARTNERS, (s + 1) * FLOW_PARTNERS);
  f.partnerRecv.fill(-1, s * FLOW_PARTNERS, (s + 1) * FLOW_PARTNERS);
}

/** Record `amount` carbon on slot `s` (owner birthId `owner`) with partner `partnerBirth`, sent or received. */
function note(world: World, f: FungalFlowObs, s: number, owner: number, partnerBirth: number, amount: number, sent: boolean): void {
  if (f.owner[s] !== owner) clearSlot(f, s, owner);
  const second = Math.floor(world.tick / TICKS_PER_SECOND);
  const b = s * FLOW_WINDOW_SECONDS + (second % FLOW_WINDOW_SECONDS);
  if (f.stamp[b] !== second) {
    f.stamp[b] = second;
    f.sent[b] = 0;
    f.received[b] = 0;
  }
  if (sent) f.sent[b]! += amount;
  else f.received[b]! += amount;
  f.lastTick[s] = world.tick;
  // Partner: the existing entry, else an empty one, else the least recently used.
  const p0 = s * FLOW_PARTNERS;
  let at = -1;
  let oldest = -1;
  let oldestSec = Infinity;
  for (let k = p0; k < p0 + FLOW_PARTNERS; k++) {
    if (f.partner[k] === partnerBirth) {
      at = k;
      break;
    }
    const last = Math.max(f.partnerSent[k]!, f.partnerRecv[k]!);
    if (last < oldestSec) {
      oldestSec = last;
      oldest = k;
    }
  }
  if (at < 0) {
    at = oldest;
    f.partner[at] = partnerBirth;
    f.partnerSent[at] = -1;
    f.partnerRecv[at] = -1;
  }
  if (sent) f.partnerSent[at] = second;
  else f.partnerRecv[at] = second;
}

/** What one segment sent and received over the last FLOW_WINDOW_SECONDS dish seconds (the current one included). */
export interface FungalFlowSummary {
  readonly sentC: number;
  /** Distinct linked segments it sent carbon to in the window. */
  readonly sentTo: number;
  readonly receivedC: number;
  readonly receivedFrom: number;
  readonly windowSeconds: number;
}

function ownedRecord(world: World, s: number): FungalFlowObs | null {
  const f = world.fungalFlow;
  if (!f || world.ents.cols.alive[s] !== 1) return null;
  const owner = world.ents.cols.birthId[s]!;
  return f.owner[s] === owner ? f : null;
}

/** The transfer summary of slot `s`, or null for a segment of a species without transport links. */
export function fungalFlowOf(world: World, s: number): FungalFlowSummary | null {
  const c = world.ents.cols;
  if (c.alive[s] !== 1 || !world.species[c.species[s]!]!.abilities.includes('TRANSPORT_LINKS')) return null;
  const f = ownedRecord(world, s);
  let sentC = 0;
  let receivedC = 0;
  let sentTo = 0;
  let receivedFrom = 0;
  if (f) {
    // The last stepped tick is world.tick − 1; its second and the nine before it.
    const now = Math.floor(Math.max(0, world.tick - 1) / TICKS_PER_SECOND);
    const from = Math.max(0, now - FLOW_WINDOW_SECONDS + 1); // −1 marks an empty entry
    for (let k = s * FLOW_WINDOW_SECONDS; k < (s + 1) * FLOW_WINDOW_SECONDS; k++) {
      const st = f.stamp[k]!;
      if (st < from || st > now) continue;
      sentC += f.sent[k]!;
      receivedC += f.received[k]!;
    }
    for (let k = s * FLOW_PARTNERS; k < (s + 1) * FLOW_PARTNERS; k++) {
      if (f.partnerSent[k]! >= from && f.partnerSent[k]! <= now) sentTo++;
      if (f.partnerRecv[k]! >= from && f.partnerRecv[k]! <= now) receivedFrom++;
    }
  }
  return { sentC, sentTo, receivedC, receivedFrom, windowSeconds: FLOW_WINDOW_SECONDS };
}

/** Whether slot `s` sent or received carbon during the last dish second (the last 10 stepped ticks). */
export function transferredThisSecond(world: World, s: number): boolean {
  const f = ownedRecord(world, s);
  if (!f) return false;
  const last = f.lastTick[s]!;
  return last >= 0 && world.tick - last <= TICKS_PER_SECOND;
}

// ---- The pass -----------------------------------------------------------------------------------

/** One transport edge of the pass, in canonical order. */
export interface TransportEdge {
  readonly a: number;
  readonly b: number;
  readonly donor: number;
  readonly receiver: number;
  /** Carbon moved donor → receiver after both caps. */
  readonly carbon: number;
  /** Nutrient moved with it. */
  readonly nutrient: number;
}

// Scratch per slot (only entries of segments with a transport edge are touched and reset).
const snapB = new Float64Array(AGENT_CAP);
const snapN = new Float64Array(AGENT_CAP);
const b0Of = new Float64Array(AGENT_CAP);
const sumOut = new Float64Array(AGENT_CAP);
const sumIn = new Float64Array(AGENT_CAP);

/**
 * Run the F02 transport pass (stage 8 after construction). Returns the edges that moved carbon, in
 * canonical order (tests compare them with an oracle; the simulation ignores the result).
 */
export function fungalTransport(world: World): TransportEdge[] {
  const out: TransportEdge[] = [];
  if (!worldHasTransport(world)) return out;
  const e = world.ents;
  const c = e.cols;
  const S = FUNGAL_SLOT_COLUMNS.map((n) => c[n]);
  const Bc = FUNGAL_BIRTH_COLUMNS.map((n) => c[n]);
  const K = FUNGAL_KIND_COLUMNS.map((n) => c[n]);
  // 1. Edges in canonical order, and one snapshot of B, N and B0' of every segment on one.
  const ea: number[] = [];
  const eb: number[] = [];
  const partners: number[] = [];
  const carrier = world.species.map((sp) => sp.abilities.includes('TRANSPORT_LINKS'));
  for (let a = 0; a < e.highWater; a++) {
    if (c.alive[a] !== 1 || c.lifeState[a] !== LIFE_ACTIVE || !carrier[c.species[a]!]) continue;
    partners.length = 0;
    for (let k = 0; k < S.length; k++) {
      const p = S[k]![a]!;
      if (p <= a || K[k]![a] !== LINK_TRANSPORT) continue;
      if (!e.refValid(p, Bc[k]![a]!) || c.lifeState[p] !== LIFE_ACTIVE || !carrier[c.species[p]!]) continue;
      partners.push(p);
    }
    if (partners.length === 0) continue;
    partners.sort((x, y) => x - y);
    for (const p of partners) {
      ea.push(a);
      eb.push(p);
    }
  }
  if (ea.length === 0) return out;
  const touched: number[] = [];
  const snap = (i: number): void => {
    if (b0Of[i] !== 0) return;
    snapB[i] = c.B[i]!;
    snapN[i] = c.N[i]!;
    b0Of[i] = profileOf(world, i).b0;
    touched.push(i);
  };
  for (let k = 0; k < ea.length; k++) {
    snap(ea[k]!);
    snap(eb[k]!);
  }
  // 2. Requests from the snapshot; each donor's outgoing sum.
  const donor = new Int32Array(ea.length).fill(-1);
  const recv = new Int32Array(ea.length).fill(-1);
  const req = new Float64Array(ea.length);
  for (let k = 0; k < ea.length; k++) {
    const a = ea[k]!;
    const b = eb[k]!;
    if (snapB[a] === snapB[b]) continue;
    const d = snapB[a]! > snapB[b]! ? a : b;
    const r = d === a ? b : a;
    const Bd = snapB[d]!;
    const Br = snapB[r]!;
    if (!(Bd > TRANSPORT_DONOR_MIN * b0Of[d]!)) continue;
    if (!(Br < TRANSPORT_RECEIVER_MAX * b0Of[r]!)) continue;
    if (!(Bd - Br >= TRANSPORT_MIN_DIFF * b0Of[r]!)) continue;
    donor[k] = d;
    recv[k] = r;
    req[k] = Math.min(TRANSPORT_RATE_PER_SECOND * DT, (Bd - Br) / 2);
    sumOut[d]! += req[k]!;
  }
  // 3. Donor cap, then receiver cap (on the donor-capped requests); no re-offer.
  for (let k = 0; k < ea.length; k++) {
    const d = donor[k]!;
    if (d < 0) continue;
    const avail = snapB[d]! - TRANSPORT_DONOR_MIN * b0Of[d]!;
    if (sumOut[d]! > avail) req[k] = req[k]! * (avail / sumOut[d]!);
    sumIn[recv[k]!]! += req[k]!;
  }
  for (let k = 0; k < ea.length; k++) {
    const r = recv[k]!;
    if (r < 0) continue;
    const room = TRANSPORT_RECEIVER_MAX * b0Of[r]! - snapB[r]!;
    if (sumIn[r]! > room) req[k] = req[k]! * (room / sumIn[r]!);
  }
  // 4. Commit together: carbon and proportional nutrient (snapshot ratios); no energy.
  let moved = 0;
  for (let k = 0; k < ea.length; k++) {
    const d = donor[k]!;
    const r = recv[k]!;
    const amount = req[k]!;
    if (d < 0 || !(amount > 0)) continue;
    const n = (snapN[d]! * amount) / snapB[d]!;
    c.B[d]! -= amount;
    c.N[d]! -= n;
    c.B[r]! += amount;
    c.N[r]! += n;
    moved += amount;
    out.push({ a: ea[k]!, b: eb[k]!, donor: d, receiver: r, carbon: amount, nutrient: n });
  }
  for (const i of touched) {
    snapB[i] = 0;
    snapN[i] = 0;
    b0Of[i] = 0;
    sumOut[i] = 0;
    sumIn[i] = 0;
  }
  if (out.length === 0) return out;
  // 5. Observation only.
  const f = (world.fungalFlow ??= createFlow());
  for (const t of out) {
    const db = c.birthId[t.donor]!;
    const rb = c.birthId[t.receiver]!;
    note(world, f, t.donor, db, rb, t.carbon, true);
    note(world, f, t.receiver, rb, db, t.carbon, false);
  }
  world.history.pendingFungalTransfer = (world.history.pendingFungalTransfer ?? 0) + moved;
  return out;
}
