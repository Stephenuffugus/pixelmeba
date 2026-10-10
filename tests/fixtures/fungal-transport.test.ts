/**
 * E212 "Fungal supply line" (CT §10.3; W3-14) and the F02 transport pass (SPEC §7.7; CT §12.6;
 * D04 §9; src/sim/fungalTransport.ts).
 *
 * Dish: an all-gel dish built by hand (clear water, every in-dish cell's substrate set to gel; not
 * GEL_COLONY, whose water channel covers x 59–68), no food. Four Cordweaver (F02) segments at the
 * centres of (60,64)…(63,64), chained 0–1–2–3 with transport links (labelled test state), B = 4, 2, 2, 2,
 * N = 0.10 B, E = 50, H = 100, Fixed Traits (B0' = 2 for every segment).
 *
 * The oracle below is written from SPEC §7.7 alone (no simulation imports): one snapshot; donor = end
 * with more B; active iff donor B > B0', receiver B < 1.5 B0' and the difference ≥ 0.01 B0'; request
 * min(0.02 × dt, half the difference); donor cap, then receiver cap; commit together with proportional N.
 *
 * Non-vacuity (checked by hand, see the build report): removing the donor cap fails "a star donor…",
 * removing the receiver cap fails "a receiver with four donors…", and committing edge by edge from
 * live values (no single snapshot) fails "received carbon relays only on later ticks".
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { fungalFlowOf, fungalTransport } from '../../src/sim/fungalTransport';
import { LIFE_ACTIVE, LIFE_PREPARING, LIFE_RESTING } from '../../src/sim/entities';
import { maskCells, SUBSTRATE_CODES } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { addFungalLink, fungalDegree, LINK_TRANSPORT, linksValid } from '../../src/sim/links';
import { killEntity } from '../../src/sim/maintenance';
import { R } from '../../src/sim/reasons';
import { stateHash } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import { updateDerived } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { clearWater, linkAdhesion, linkFungal, place, rebaseLedger } from '../helpers/world';

// ---- Oracle (SPEC §7.7 only) --------------------------------------------------------------------

const DT_S = 0.1;
interface OEdge {
  readonly a: number;
  readonly b: number;
  donor: number;
  receiver: number;
  carbon: number;
  nutrient: number;
}

/** One transport pass over `edges` (index pairs into B, N, b0). Returns the edges and the new pools. */
function oracle(B: readonly number[], N: readonly number[], b0: readonly number[], edges: readonly (readonly [number, number])[]) {
  const out: OEdge[] = edges.map(([a, b]) => ({ a, b, donor: -1, receiver: -1, carbon: 0, nutrient: 0 }));
  const sumOut = new Map<number, number>();
  for (const e of out) {
    if (B[e.a] === B[e.b]) continue;
    const d = B[e.a]! > B[e.b]! ? e.a : e.b;
    const r = d === e.a ? e.b : e.a;
    if (B[d]! > b0[d]! && B[r]! < 1.5 * b0[r]! && B[d]! - B[r]! >= 0.01 * b0[r]!) {
      e.donor = d;
      e.receiver = r;
      e.carbon = Math.min(0.02 * DT_S, (B[d]! - B[r]!) / 2);
      sumOut.set(d, (sumOut.get(d) ?? 0) + e.carbon);
    }
  }
  const sumIn = new Map<number, number>();
  for (const e of out) {
    if (e.donor < 0) continue;
    e.carbon *= Math.min(1, (B[e.donor]! - b0[e.donor]!) / sumOut.get(e.donor)!);
    sumIn.set(e.receiver, (sumIn.get(e.receiver) ?? 0) + e.carbon);
  }
  for (const e of out) {
    if (e.donor < 0) continue;
    e.carbon *= Math.min(1, (1.5 * b0[e.receiver]! - B[e.receiver]!) / sumIn.get(e.receiver)!);
    e.nutrient = (N[e.donor]! * e.carbon) / B[e.donor]!;
  }
  const B2 = B.slice();
  const N2 = N.slice();
  for (const e of out) {
    if (e.donor < 0) continue;
    B2[e.donor]! -= e.carbon;
    B2[e.receiver]! += e.carbon;
    N2[e.donor]! -= e.nutrient;
    N2[e.receiver]! += e.nutrient;
  }
  return { edges: out, B: B2, N: N2 };
}

// ---- Dish ---------------------------------------------------------------------------------------

/** Clear water with every in-dish cell turned to gel (no food, Fixed Traits). */
function gelDish(): World {
  const w = clearWater();
  const sub = w.grid.substrate;
  for (const k of maskCells()) sub[k] = SUBSTRATE_CODES.gel;
  w.grid.geometryVersion++;
  updateDerived(w);
  return w;
}

/** One F02 at the centre of (x, y) with B, N = 0.10 B, E 50, H 100. */
function seg(w: World, x: number, y: number, B: number, N = 0.1 * B): number {
  return place(w, 'F02', x + 0.5, y + 0.5, { B, N, E: 50, H: 100 });
}

/** E212: four F02 at (60..63, 64), B 4, 2, 2, 2, chained 0–1–2–3 unless `links` is false. */
function e212(links = true): { w: World; s: number[] } {
  const w = gelDish();
  const s = [seg(w, 60, 64, 4), seg(w, 61, 64, 2), seg(w, 62, 64, 2), seg(w, 63, 64, 2)];
  if (links) for (let k = 0; k < 3; k++) linkFungal(w, s[k]!, s[k + 1]!);
  rebaseLedger(w);
  return { w, s };
}

const B0 = 2;
const CHAIN: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 3],
];

function pools(w: World, s: readonly number[]): { B: number[]; N: number[] } {
  const c = w.ents.cols;
  return { B: s.map((i) => c.B[i]!), N: s.map((i) => c.N[i]!) };
}

/** Step once, returning the chain's pools at the end of stage 7 (the pass's snapshot) and after stage 8. */
function stepObserved(w: World, s: readonly number[], at7?: () => void): { pre: ReturnType<typeof pools>; post: ReturnType<typeof pools> } {
  let pre = pools(w, s);
  let post = pre;
  step(w, {
    afterStage: (stage) => {
      if (stage === 7) {
        at7?.();
        pre = pools(w, s);
      }
      if (stage === 8) post = pools(w, s);
    },
  });
  return { pre, post };
}

/** Per-edge flow along a chain from its members' changes (positive: toward the higher index). */
function chainFlows(pre: readonly number[], post: readonly number[]): number[] {
  const flows: number[] = [];
  let carried = 0;
  for (let k = 0; k < pre.length - 1; k++) {
    carried += pre[k]! - post[k]!;
    flows.push(carried);
  }
  return flows;
}

function signedOracleFlows(o: ReturnType<typeof oracle>): number[] {
  return o.edges.map((e) => (e.donor < 0 ? 0 : e.donor === e.a ? e.carbon : -e.carbon));
}

const sum = (v: readonly number[]) => v.reduce((a, x) => a + x, 0);

describe('E212 fungal supply line: one simultaneous transport pass (SPEC §7.7)', () => {
  it('for 100 ticks every per-tick, per-edge transfer equals the SPEC §7.7 oracle to 1e-12', () => {
    const { w, s } = e212();
    const b0 = [B0, B0, B0, B0];
    let moved = 0;
    for (let t = 0; t < 100; t++) {
      const { pre, post } = stepObserved(w, s);
      const o = oracle(pre.B, pre.N, b0, CHAIN);
      const flows = chainFlows(pre.B, post.B);
      const want = signedOracleFlows(o);
      for (let k = 0; k < 3; k++) expect(Math.abs(flows[k]! - want[k]!)).toBeLessThan(1e-12);
      const nFlows = chainFlows(pre.N, post.N);
      const nWant = o.edges.map((e) => (e.donor < 0 ? 0 : e.donor === e.a ? e.nutrient : -e.nutrient));
      for (let k = 0; k < 3; k++) expect(Math.abs(nFlows[k]! - nWant[k]!)).toBeLessThan(1e-12);
      for (let k = 0; k < 4; k++) {
        expect(Math.abs(post.B[k]! - o.B[k]!)).toBeLessThan(1e-12);
        expect(Math.abs(post.N[k]! - o.N[k]!)).toBeLessThan(1e-12);
      }
      moved += sum(o.edges.map((e) => e.carbon));
    }
    // Not vacuous: the line carried carbon, and it reached segment 2 (relay over later ticks).
    expect(moved).toBeGreaterThan(0.15);
    expect(w.ents.cols.B[s[2]!]!).toBeGreaterThan(2);
  });

  it('Σ B and Σ N of the chain are constant every tick to 1e-12 and the ledger closes', () => {
    const { w, s } = e212();
    const start = pools(w, s);
    for (let t = 0; t < 100; t++) {
      step(w);
      const p = pools(w, s);
      expect(Math.abs(sum(p.B) - sum(start.B))).toBeLessThan(1e-12);
      expect(Math.abs(sum(p.N) - sum(start.N))).toBeLessThan(1e-12);
      expect(checkLedger(w).ok).toBe(true);
    }
    // The ledger records nothing for an internal move.
    expect(w.ledger.inputs).toEqual({ c: 0, n: 0, m: 0 });
    expect(w.ledger.exports).toEqual({ c: 0, n: 0, m: 0 });
  });

  it('no energy moves: each segment’s energy equals that of an unlinked copy, every tick', () => {
    const linked = e212(true);
    const copy = e212(false);
    for (let t = 0; t < 100; t++) {
      step(linked.w);
      step(copy.w);
      for (let k = 0; k < 4; k++) expect(linked.w.ents.cols.E[linked.s[k]!]).toBe(copy.w.ents.cols.E[copy.s[k]!]);
    }
    // …while their bodies differ (the links did carry carbon).
    expect(linked.w.ents.cols.B[linked.s[0]!]).toBeLessThan(copy.w.ents.cols.B[copy.s[0]!]!);
  });

  it('segment 3 receives nothing on tick 1 (received surplus relays only on later ticks)', () => {
    const { w, s } = e212();
    const { pre, post } = stepObserved(w, s);
    expect(post.B[3]).toBe(pre.B[3]);
    expect(post.B[2]).toBe(pre.B[2]);
    expect(post.B[1]! - pre.B[1]!).toBeCloseTo(0.002, 15);
  });

  it('received carbon relays only on later ticks (one snapshot, not edge-by-edge commits)', () => {
    // 0 → 1 is active; 1 sits exactly at B0' (not a donor in the snapshot), 2 is below B0'. Had the pass
    // read 1's pool after the 0 → 1 commit, 1 would already send to 2 this tick.
    const w = gelDish();
    const s = [seg(w, 60, 64, 4), seg(w, 61, 64, 2), seg(w, 62, 64, 1.9)];
    linkFungal(w, s[0]!, s[1]!);
    linkFungal(w, s[1]!, s[2]!);
    rebaseLedger(w);
    const { pre, post } = stepObserved(w, s);
    expect(post.B[2]).toBe(pre.B[2]);
    expect(post.B[1]! - pre.B[1]!).toBeCloseTo(0.002, 15);
    // Next tick 1 holds more than B0' and passes some on.
    const next = stepObserved(w, s);
    expect(next.post.B[2]!).toBeGreaterThan(next.pre.B[2]!);
  });

  it('a star donor with four receivers never sends more than B − B0′ (donor cap)', () => {
    const w = gelDish();
    const hub = seg(w, 60, 64, 2.005);
    const arms = [seg(w, 61, 64, 1), seg(w, 60, 65, 1), seg(w, 59, 64, 1), seg(w, 60, 63, 1)];
    for (const a of arms) linkFungal(w, hub, a);
    rebaseLedger(w);
    const c = w.ents.cols;
    const B = [hub, ...arms].map((i) => c.B[i]!);
    const N = [hub, ...arms].map((i) => c.N[i]!);
    const edges = fungalTransport(w);
    // Four requests of 0.002 (Σ 0.008) scaled to the 0.005 the hub holds above B0'.
    expect(edges).toHaveLength(4);
    const sent = sum(edges.map((e) => e.carbon));
    expect(sent).toBeLessThanOrEqual(0.005 + 1e-12);
    expect(c.B[hub]!).toBeGreaterThanOrEqual(B0 - 1e-12);
    const o = oracle(B, N, [B0, B0, B0, B0, B0], [[0, 1], [0, 2], [0, 3], [0, 4]]);
    for (let k = 0; k < 4; k++) expect(Math.abs(edges[k]!.carbon - o.edges[k]!.carbon)).toBeLessThan(1e-12);
    // Over many ticks the hub never drops below B0'.
    for (let t = 0; t < 50; t++) {
      step(w);
      expect(c.B[hub]!).toBeGreaterThanOrEqual(B0 - 1e-12);
    }
  });

  it('a receiver with four donors never exceeds 1.5 B0′ (receiver cap)', () => {
    const w = gelDish();
    const hub = seg(w, 60, 64, 2.995);
    const arms = [seg(w, 61, 64, 4), seg(w, 60, 65, 4), seg(w, 59, 64, 4), seg(w, 60, 63, 4)];
    for (const a of arms) linkFungal(w, hub, a);
    rebaseLedger(w);
    const c = w.ents.cols;
    const B = [hub, ...arms].map((i) => c.B[i]!);
    const N = [hub, ...arms].map((i) => c.N[i]!);
    const edges = fungalTransport(w);
    expect(edges).toHaveLength(4);
    expect(c.B[hub]!).toBeLessThanOrEqual(1.5 * B0 + 1e-12);
    expect(c.B[hub]!).toBeCloseTo(3, 12);
    const o = oracle(B, N, [B0, B0, B0, B0, B0], [[0, 1], [0, 2], [0, 3], [0, 4]]);
    for (let k = 0; k < 4; k++) expect(Math.abs(edges[k]!.carbon - o.edges[k]!.carbon)).toBeLessThan(1e-12);
    for (let t = 0; t < 50; t++) {
      step(w);
      expect(c.B[hub]!).toBeLessThanOrEqual(1.5 * B0 + 1e-12);
    }
  });

  it('killing segment 2 mid-run stops flow across both its links in the same tick; a 5th link is impossible', () => {
    const { w, s } = e212();
    run(w, 49);
    // Labelled test state: segment 2 dies in stage 7 of tick 50, as a starved segment would.
    const before = w.events.totals.linkBroken ?? 0;
    const { pre, post } = stepObserved(w, s, () => killEntity(w, s[2]!, R.DEATH_STARVATION));
    expect(w.ents.cols.alive[s[2]!]).toBe(0);
    expect((w.events.totals.linkBroken ?? 0) - before).toBe(2);
    expect(post.B[3]).toBe(pre.B[3]); // nothing reaches 3
    // 1 receives from 0 only (2 is gone), exactly as the oracle for the 0–1 edge alone says.
    const o = oracle(pre.B.slice(0, 2), pre.N.slice(0, 2), [B0, B0], [[0, 1]]);
    expect(Math.abs(post.B[1]! - o.B[1]!)).toBeLessThan(1e-12);
    expect(fungalDegree(w, s[1]!)).toBe(1);
    expect(fungalDegree(w, s[3]!)).toBe(0);
    expect(linksValid(w)).toBe(true);

    // Degree ≤ 4: a fifth link is refused by the store.
    const hub = seg(w, 70, 70, 2);
    const arms = [seg(w, 71, 70, 2), seg(w, 70, 71, 2), seg(w, 69, 70, 2), seg(w, 70, 69, 2)];
    for (const a of arms) linkFungal(w, hub, a);
    const fifth = seg(w, 72, 70, 2);
    expect(addFungalLink(w, hub, fifth, LINK_TRANSPORT)).toBe(false);
    expect(fungalDegree(w, hub)).toBe(4);
  });

  it('save/reload at tick 50 gives the identical hash at tick 100; 1× equals four quarter runs', async () => {
    const a = e212();
    run(a.w, 50);
    const { text } = await buildSaveFile(a.w, { name: 'E212', savedAt: '2026-10-01T00:00:00Z', recipeId: null });
    const loaded = (await loadSaveFile(text)).world;
    expect(stateHash(loaded)).toBe(stateHash(a.w));
    run(a.w, 50);
    run(loaded, 50);
    expect(stateHash(loaded)).toBe(stateHash(a.w));

    const b = e212();
    for (let q = 0; q < 4; q++) run(b.w, 25);
    expect(stateHash(b.w)).toBe(stateHash(a.w));
  });

  it('crossing threads never connect, and adhesion links are not fungal links', () => {
    const w = gelDish();
    // Two threads side by side (adjacent cells, no link between them), one rich, one poor.
    const rich = [seg(w, 60, 64, 4), seg(w, 60, 65, 4)];
    const poor = [seg(w, 61, 64, 1), seg(w, 61, 65, 1)];
    linkFungal(w, rich[0]!, rich[1]!);
    linkFungal(w, poor[0]!, poor[1]!);
    // An adhesion link (labelled test state) across the threads carries nothing either.
    linkAdhesion(w, rich[0]!, poor[0]!);
    rebaseLedger(w);
    const c = w.ents.cols;
    for (let t = 0; t < 20; t++) {
      expect(fungalTransport(w)).toHaveLength(0);
      step(w);
    }
    expect(c.B[poor[0]!]).toBe(1);
    expect(c.B[rich[0]!]).toBe(4);
  });

  it('the inspector observation records what each segment sent and received, and to how many', () => {
    const { w, s } = e212();
    let sent0 = 0;
    for (let t = 0; t < 30; t++) {
      const { pre, post } = stepObserved(w, s);
      sent0 += pre.B[0]! - post.B[0]!;
    }
    const f0 = fungalFlowOf(w, s[0]!)!;
    // 30 ticks: the window (the current second and the nine before it) holds all of them.
    expect(f0.sentC).toBeCloseTo(sent0, 12);
    expect(f0.sentTo).toBe(1);
    expect(f0.receivedC).toBe(0);
    const f1 = fungalFlowOf(w, s[1]!)!;
    expect(f1.receivedFrom).toBe(1);
    expect(f1.sentTo).toBe(1); // it relays toward 2 from tick 11 on
    expect(fungalFlowOf(w, s[3]!)!.receivedC).toBe(0);
    // The per-second history total matches the carbon moved in each second.
    const samples = w.history.seconds.slice(-3);
    expect(samples).toHaveLength(3);
    for (const smp of samples) expect(smp.fungalTransfer).toBeGreaterThan(0);
  });
});

describe('the pass leaves every other world alone', () => {
  it('a world whose fungi carry only visual links (F01) moves nothing', () => {
    const w = gelDish();
    const a = place(w, 'F01', 60.5, 64.5, { B: 4 });
    const b = place(w, 'F01', 61.5, 64.5, { B: 1 });
    linkFungal(w, a, b, 1);
    expect(fungalTransport(w)).toHaveLength(0);
    expect(w.fungalFlow).toBeNull();
  });

  it('a transport-kind link between organisms of a species without transport links carries nothing', () => {
    // Labelled test state: no rule links Sprinters; SPEC §7.7 "only living F02 links carry resources".
    const w = clearWater();
    const a = place(w, 'B01', 60.5, 64.5, { B: 2 });
    const b = place(w, 'B01', 61.5, 64.5, { B: 0.5 });
    linkFungal(w, a, b, LINK_TRANSPORT);
    expect(fungalTransport(w)).toHaveLength(0);
  });

  it('only Active segments take part: a Resting or Preparing end, donor or receiver, carries nothing', () => {
    // SPEC §7.6 table: Resting has "No intake, photosynthesis, movement, secretion, division, links or
    // anchors"; Preparing has "no feeding, movement, reproduction, secretion". The donor sits in the lower
    // slot and the receiver in the higher one, so each end's check is exercised on its own.
    const pair = (): { w: World; d: number; r: number } => {
      const w = gelDish();
      const d = seg(w, 60, 64, 4);
      const r = seg(w, 61, 64, 2);
      expect(d).toBeLessThan(r);
      linkFungal(w, d, r);
      rebaseLedger(w);
      return { w, d, r };
    };
    const control = pair();
    expect(fungalTransport(control.w)).toHaveLength(1);
    for (const state of [LIFE_RESTING, LIFE_PREPARING]) {
      for (const end of ['donor', 'receiver'] as const) {
        const { w, d, r } = pair();
        const c = w.ents.cols;
        c.lifeState[end === 'donor' ? d : r] = state;
        const before = [c.B[d], c.B[r], c.N[d], c.N[r]];
        expect(fungalTransport(w), `${end} in state ${state}`).toHaveLength(0);
        expect([c.B[d], c.B[r], c.N[d], c.N[r]], `${end} in state ${state}`).toEqual(before);
        c.lifeState[end === 'donor' ? d : r] = LIFE_ACTIVE;
        expect(fungalTransport(w), `${end} back to Active`).toHaveLength(1);
      }
    }
  });
});
