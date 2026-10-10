/**
 * EXP_212 "Fungal supply line" (CT §10.3 E212; SPEC §7.7; D-0052; P3.9). The card's own recipe,
 * FUNGAL_SUPPLY_LINE_V1 (seed 212): Water Garden without stones, background sugar 0 (CT: "no food"),
 * a gel rect x 56–67, y 60–68 painted by the recipe's own ops, and one F02 group listed at
 * (60…63, 64), chained 0–1–2–3 by transport links, the first with B 4 and N 0.4 (a labelled setup),
 * the others b0 2 and 0.10 × b0 = 0.2 N, E 50.
 *
 * The oracle is written only from SPEC §7.7 and D-0052 (no simulation import): one snapshot per tick;
 * per link the donor is the end with more B; the link is active iff donor B > B0', receiver B < 1.5 B0'
 * (the receiver's B0') and the difference ≥ 0.01 B0' (the receiver's); request min(0.02 × dt, half the
 * difference); donor cap (B − B0') first, then receiver cap (1.5 B0' − B) on the donor-capped
 * requests, no re-offer; nutrient moves in proportion (snapshot N/B); no energy.
 *
 * Non-vacuity (checked by hand, see docs/reports/reviews/g3-wave-4/experiments-curated-build.md):
 * without the recipe's `links: 'chain'` the world moves nothing and "the donor/receiver ledger" fails;
 * with the recipe's `initial` ignored all four segments start equal and nothing moves either.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { realizeExperimentArms, runExperiment, type ExperimentResult } from '../../src/sim/experiments';
import { checkLedger } from '../../src/sim/ledger';
import { measureArm, stepObserved } from '../../src/sim/pairedRun';
import { recipeGrid } from '../../src/sim/recipes';
import { SUB_GEL } from '../../src/sim/grid';
import { run } from '../../src/sim/tick';
import { registry } from './helpers';

const CELLS: readonly (readonly [number, number])[] = [
  [60, 64],
  [61, 64],
  [62, 64],
  [63, 64],
];

// ---- Oracle: SPEC §7.7 and D-0052 only ----------------------------------------------------------

const B0 = 2; // Cordweaver's starting body (CT §1; neutral traits, Identical founders)
const DT = 0.1;

interface Pools {
  B: number[];
  N: number[];
}

/** One tick of the transport pass on a chain 0–1–2–…; returns the carbon each link moved (donor → receiver). */
function oracleTick(p: Pools): { moved: number; perLink: { donor: number; receiver: number; carbon: number; nutrient: number }[] } {
  const B = p.B.slice();
  const N = p.N.slice();
  const links: { donor: number; receiver: number; req: number }[] = [];
  const out = new Array<number>(B.length).fill(0);
  for (let a = 0; a + 1 < B.length; a++) {
    const b = a + 1;
    if (B[a] === B[b]) continue;
    const donor = B[a]! > B[b]! ? a : b;
    const receiver = donor === a ? b : a;
    const Bd = B[donor]!;
    const Br = B[receiver]!;
    if (!(Bd > 1 * B0) || !(Br < 1.5 * B0) || !(Bd - Br >= 0.01 * B0)) continue;
    const req = Math.min(0.02 * DT, (Bd - Br) / 2);
    links.push({ donor, receiver, req });
    out[donor]! += req;
  }
  // Donor cap first.
  const inn = new Array<number>(B.length).fill(0);
  for (const l of links) {
    const avail = B[l.donor]! - 1 * B0;
    if (out[l.donor]! > avail) l.req *= avail / out[l.donor]!;
    inn[l.receiver]! += l.req;
  }
  // Receiver cap second (on the donor-capped requests; no re-offer).
  for (const l of links) {
    const room = 1.5 * B0 - B[l.receiver]!;
    if (inn[l.receiver]! > room) l.req *= room / inn[l.receiver]!;
  }
  let moved = 0;
  const perLink = links.map((l) => {
    const nutrient = (N[l.donor]! * l.req) / B[l.donor]!;
    p.B[l.donor]! -= l.req;
    p.N[l.donor]! -= nutrient;
    p.B[l.receiver]! += l.req;
    p.N[l.receiver]! += nutrient;
    moved += l.req;
    return { donor: l.donor, receiver: l.receiver, carbon: l.req, nutrient };
  });
  return { moved, perLink };
}

// ---- The card -----------------------------------------------------------------------------------

let result: ExperimentResult;
beforeAll(() => {
  result = runExperiment(registry(), 'EXP_212');
}, 120_000);

function segments(w: ReturnType<typeof realizeExperimentArms>['A']): { B: number; N: number; E: number }[] {
  const c = w.ents.cols;
  return CELLS.map(([x, y]) => {
    for (let i = 0; i < w.ents.highWater; i++) {
      if (c.alive[i] === 1 && Math.floor(c.x[i]!) === x && Math.floor(c.y[i]!) === y) return { B: c.B[i]!, N: c.N[i]!, E: c.E[i]! };
    }
    throw new Error(`no segment at (${x},${y})`);
  });
}

describe('EXP_212 Fungal supply line (FUNGAL_SUPPLY_LINE_V1, seed 212, 10 s)', () => {
  it('the recipe builds the setup: gel bed from its own ops, four linked segments, B 4/2/2/2, N 0.4/0.2/0.2/0.2, E 50, no food', () => {
    const reg = registry();
    const recipe = reg.recipes.FUNGAL_SUPPLY_LINE_V1!;
    const { A } = realizeExperimentArms(reg, 'EXP_212');
    expect(A.seed).toBe(212);
    expect(recipeGrid(reg.habitats.WATER_GARDEN!, recipe).substrate).toEqual(A.grid.substrate);
    for (let y = 60; y <= 68; y++) for (let x = 56; x <= 67; x++) expect(A.grid.substrate[y * 128 + x]).toBe(SUB_GEL);
    const s = segments(A);
    expect(s.map((x) => x.B)).toEqual([4, 2, 2, 2]);
    expect(s.map((x) => x.N)).toEqual([0.4, 0.2, 0.2, 0.2]);
    expect(s.map((x) => x.E)).toEqual([50, 50, 50, 50]);
    // No food: no sugar or debris anywhere in the dish.
    let food = 0;
    for (let i = 0; i < 128 * 128; i++) food += A.fields.sugar![i]! + A.fields.detritus![i]!;
    expect(food).toBe(0);
    // The labelled setup is logged: ordinary founders (4 × 2 C, 4 × 0.2 N), then the first segment's extra 2 C and 0.2 N.
    const initial = A.ledger.entries.filter((e) => e.source === 'recipe:FUNGAL_SUPPLY_LINE_V1:initial');
    expect(initial).toHaveLength(1);
    expect(initial[0]!.c).toBeCloseTo(2, 12);
    expect(initial[0]!.n).toBeCloseTo(0.2, 12);
    const intro = A.ledger.entries.filter((e) => e.source === 'introduce:recipe:FUNGAL_SUPPLY_LINE_V1');
    expect(intro.reduce((a, e) => a + e.c, 0)).toBeCloseTo(8, 12);
    expect(A.ledger.inputs.c).toBeCloseTo(10, 12);
    expect(A.ledger.inputs.n).toBeCloseTo(1, 12);
    expect(A.ledger.energy.earned).toBe(0);
  });

  it('every tick, each segment holds exactly what the SPEC §7.7 oracle says (1e-12), and transfer.fungal is its total', () => {
    const reg = registry();
    const arms = realizeExperimentArms(reg, 'EXP_212');
    const w = arms.A;
    const pools: Pools = { B: [4, 2, 2, 2], N: [0.4, 0.2, 0.2, 0.2] };
    let total = 0;
    let linksThatMoved = 0;
    const firstTickOf: number[] = [-1, -1, -1];
    for (let t = 1; t <= 100; t++) {
      stepObserved(w, arms.obsA);
      const { moved, perLink } = oracleTick(pools);
      total += moved;
      for (const l of perLink) {
        const link = Math.min(l.donor, l.receiver);
        if (firstTickOf[link]! < 0) firstTickOf[link] = t;
        linksThatMoved++;
      }
      const s = segments(w);
      for (let k = 0; k < 4; k++) {
        expect(Math.abs(s[k]!.B - pools.B[k]!), `tick ${t} segment ${k} B`).toBeLessThanOrEqual(1e-12);
        expect(Math.abs(s[k]!.N - pools.N[k]!), `tick ${t} segment ${k} N`).toBeLessThanOrEqual(1e-12);
      }
      // C and N stay in the line: nothing enters or leaves the four bodies.
      expect(Math.abs(s.reduce((a, x) => a + x.B, 0) - 10)).toBeLessThanOrEqual(1e-12);
      expect(Math.abs(s.reduce((a, x) => a + x.N, 0) - 1)).toBeLessThanOrEqual(1e-12);
      const m = measureArm(w, arms.obsA, ['transfer.fungal']);
      expect(Math.abs(m['transfer.fungal']! - total), `tick ${t} transfer`).toBeLessThanOrEqual(1e-12);
    }
    // Non-vacuity: food moved over each link, link 0–1 first; received carbon relays only on later ticks.
    expect(linksThatMoved).toBeGreaterThan(100);
    expect(firstTickOf[0]).toBe(1);
    expect(firstTickOf[1]!).toBeGreaterThan(firstTickOf[0]!);
    expect(firstTickOf[2]!).toBeGreaterThan(firstTickOf[1]!);
    expect(total).toBeGreaterThan(0.3);
    // Every nutrient move is in proportion to the donor's N/B (0.10 here, so N stays 0.10 B everywhere).
    for (let k = 0; k < 4; k++) expect(pools.N[k]! / pools.B[k]!).toBeCloseTo(0.1, 12);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('reaches its gate, keeps running to 10 s, and conserves carbon and nutrient', () => {
    const r = result;
    expect(r.gate.reached, JSON.stringify(r.gate.clauses)).toBe(true);
    expect(r.gate.reachedAtSecond).toBe(1);
    expect(r.stamp?.journalStamp).toBe('Measured carbon passing along a Cordweaver line');
    expect(r.stoppedAtGate).toBe(false);
    expect(r.endTick).toBe(100);
    expect(r.A.reported['biomass.F02']).toBeCloseTo(r.A.reported['biomassStart.F02']!, 12);
    expect(r.A.reported['alive.F02']).toBe(4);
    expect(r.A.ledger.everyCheckOk).toBe(true);
    expect(r.A.ledger.relErr.c).toBeLessThan(1e-12);
    expect(r.A.ledger.relErr.n).toBeLessThan(1e-12);
    // Energy is never shared: each segment only paid its own upkeep (all four equal).
    const { A } = realizeExperimentArms(registry(), 'EXP_212');
    run(A, 100);
    const e = segments(A).map((s) => s.E);
    expect(new Set(e).size).toBe(1);
  });
});
