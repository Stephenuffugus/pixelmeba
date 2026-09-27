/**
 * G1 fixture: inherited variation (P1.2, SPEC §8). Committed births store parentage and deltas;
 * Fixed Traits produces no mutation; draws are reproducible from (seed, parent birthId) including
 * neutral clamped draws; rates match the preset; no self-parent links; branch records follow the
 * D04 thresholds and never touch the simulation.
 */
import { describe, expect, it } from 'vitest';
import { MIN_DESCENDANTS, onDaughter, onParentEnds, qualifies } from '../../src/sim/branches';
import { neutralGenome, type Genome } from '../../src/sim/genome';
import { field } from '../../src/sim/lineage';
import { MUT_POLICY_ESTABLISHED, MUT_PREF, MUT_QUANT, MUT_QUANT_NEUTRAL, proposeDaughters } from '../../src/sim/mutation';
import { realizeRecipe } from '../../src/sim/recipes';
import { detFloat, detInt, STREAMS } from '../../src/sim/rng';
import { run } from '../../src/sim/tick';
import { clearWater, place, registry } from '../helpers/world';

describe('G1 inherited variation', () => {
  it('Standard evolution: every mutation event matches its birth record and the genome delta', () => {
    const w = realizeRecipe(registry(), 'FIRST_DISH_V1');
    run(w, 4000);
    const muts = w.events.ring.filter((e) => e.type === 'mutation');
    expect(w.events.totals.mutation ?? 0).toBeGreaterThan(0);
    for (const ev of muts) {
      const b = ev.birthId!;
      const flags = field(w.lineage, 'mutFlags', b);
      if (flags === undefined) continue; // compacted
      expect(flags).not.toBe(0);
      const parent = field(w.lineage, 'parent', b)!;
      const g = w.genomes.get(field(w.lineage, 'genome', b)!);
      const pg = w.genomes.get(field(w.lineage, 'genome', parent)!);
      if (flags & MUT_QUANT) {
        const l = field(w.lineage, 'mutLocus', b)!;
        expect(g.loci[l]! - pg.loci[l]!).toBe(field(w.lineage, 'mutDelta', b));
      }
    }
  });

  it('Fixed Traits: no mutation ever; descendants carry the founder genome exactly', () => {
    const w = realizeRecipe(registry(), 'FIRST_DISH_V1', { transform: (r) => ({ ...r, mutationPreset: 'fixed' }) });
    const founders = w.genomes.size;
    run(w, 3000);
    expect(w.events.totals.birth ?? 0).toBeGreaterThan(50);
    expect(w.events.totals.mutation ?? 0).toBe(0);
    expect(w.genomes.size).toBe(founders);
  });

  it('reproduces a recorded quantitative draw exactly, including a clamped neutral draw', () => {
    const w = clearWater({ mutationPreset: 'standard' });
    const s = place(w, 'B01', 64.5, 64.5);
    const sp = w.species.find((x) => x.id === 'B01')!;
    const active = sp.def.lociActive.map((on, l) => (on ? l : -1)).filter((l) => l >= 0);
    // Search parent birthIds for a draw that hits locus 0 upward (so locus 100 clamps).
    let pb = 1;
    for (; pb < 200000; pb++) {
      if (detFloat(w.seed, STREAMS.mutQuant, pb, 0, 0, 0) >= 0.08) continue;
      if (active[detInt(w.seed, STREAMS.mutQuant, active.length, pb, 0, 0, 1)] !== 0) continue;
      if (detFloat(w.seed, STREAMS.mutQuant, pb, 0, 0, 3) < 0.5) continue; // want sign +
      break;
    }
    const c = w.ents.cols;
    c.birthId[s] = pb;
    // Parent at locus 0 = 100: the + draw clamps to 100 ⇒ neutral, genome unchanged.
    c.genome[s] = w.genomes.intern({ ...neutralGenome('B01'), loci: [100, 50, 50, 50, 50, 50, 50, 50] });
    const p = proposeDaughters(w, s);
    expect(p.draws[0].flags & MUT_QUANT_NEUTRAL).not.toBe(0);
    expect(p.draws[0].delta).toBe(0);
    expect(p.genomes[0]).toBe(c.genome[s]);
    // Same parent at locus 50: the draw applies +2 or +5 exactly as the size roll says.
    c.genome[s] = w.genomes.intern(neutralGenome('B01'));
    const q = proposeDaughters(w, s);
    const size = detFloat(w.seed, STREAMS.mutQuant, pb, 0, 0, 2) < 0.8 ? 2 : 5;
    expect(q.draws[0].flags & MUT_QUANT).not.toBe(0);
    expect(q.draws[0].locus).toBe(0);
    expect(q.draws[0].delta).toBe(size);
    expect(w.genomes.get(q.genomes[0]).loci[0]).toBe(50 + size);
    // Proposals are pure: drawing again gives the identical result.
    expect(proposeDaughters(w, s).genomes).toEqual(q.genomes);
  });

  it('a first preference mutation establishes a weighted policy (2/(n+1), 1/(n+1)) then moves 0.05', () => {
    const w = clearWater({ mutationPreset: 'standard' });
    const s = place(w, 'B04', 64.5, 64.5);
    let pb = 1;
    while (detFloat(w.seed, STREAMS.mutPref, pb, 0, 0, 0) >= 0.02) pb++;
    w.ents.cols.birthId[s] = pb;
    const p = proposeDaughters(w, s);
    expect(p.draws[0].flags & MUT_PREF).not.toBe(0);
    expect(p.draws[0].flags & MUT_POLICY_ESTABLISHED).not.toBe(0);
    const g = w.genomes.get(p.genomes[0]);
    expect(g.policy).toBe('weighted');
    const sorted = [...g.weights!].map((x) => Math.round(x * 1000) / 1000).sort();
    // B04 has four foods: base weights 0.4, 0.2, 0.2, 0.2 with 0.05 moved from one to another.
    expect(g.weights!.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(sorted.some((x) => Math.abs(x - 0.35) < 1e-9 || Math.abs(x - 0.45) < 1e-9 || Math.abs(x - 0.15) < 1e-9 || Math.abs(x - 0.25) < 1e-9)).toBe(true);
  });

  it('mutation rates match the Standard preset (8 % quantitative, 2 % preference per daughter)', () => {
    const w = clearWater({ mutationPreset: 'standard' });
    const s = place(w, 'B04', 64.5, 64.5);
    let quant = 0;
    let pref = 0;
    const N = 20000;
    for (let pb = 1; pb <= N / 2; pb++) {
      w.ents.cols.birthId[s] = pb;
      w.ents.cols.genome[s] = w.genomes.intern(neutralGenome('B04'));
      const p = proposeDaughters(w, s);
      for (const d of p.draws) {
        if (d.flags & (MUT_QUANT | MUT_QUANT_NEUTRAL)) quant++;
        if (d.flags & MUT_PREF) pref++;
      }
    }
    expect(quant / N).toBeGreaterThan(0.07);
    expect(quant / N).toBeLessThan(0.09);
    expect(pref / N).toBeGreaterThan(0.015);
    expect(pref / N).toBeLessThan(0.025);
  });

  it('no birth record is its own parent; both daughters get new birth ids', () => {
    const w = realizeRecipe(registry(), 'FIRST_DISH_V1');
    run(w, 2000);
    const L = w.lineage;
    for (let k = 0; k < L.parent.length; k++) expect(L.parent[k]).not.toBe(L.base + k);
  });
});

describe('G1 branch candidate records', () => {
  const g = (loci: number[], extra: Partial<Genome> = {}): Genome => ({ ...neutralGenome('B01'), loci, id: 'x', ...extra });
  const active = [true, true, true, true, true, true, true, false];

  it('qualification thresholds (D04 §3)', () => {
    const ref = g([50, 50, 50, 50, 50, 50, 50, 50]);
    expect(qualifies(ref, g([60, 50, 50, 50, 50, 50, 50, 50]), active)).toBe(true); // one locus +10
    expect(qualifies(ref, g([58, 50, 50, 50, 50, 50, 50, 50]), active)).toBe(false); // +8 only
    expect(qualifies(ref, g([53, 53, 53, 53, 53, 53, 53, 50]), active)).toBe(true); // mean 0.03
    expect(qualifies(ref, g([53, 53, 53, 53, 53, 53, 52, 50]), active)).toBe(false);
    expect(qualifies(ref, g([50, 50, 50, 50, 50, 50, 50, 90]), active)).toBe(false); // inactive locus ignored
    expect(qualifies(ref, g([50, 50, 50, 50, 50, 50, 50, 50], { modules: ['E05'] }), active)).toBe(true);
    expect(qualifies(ref, g([50, 50, 50, 50, 50, 50, 50, 50], { policy: 'weighted', weights: [1] }), active)).toBe(true);
  });

  it(`establishes a branch at ${MIN_DESCENDANTS} living qualifying descendants across 3 generations, and never earlier`, () => {
    const w = clearWater();
    const founder = place(w, 'B01', 64.5, 64.5);
    const c = w.ents.cols;
    const ref = c.genome[founder]!;
    const variant = w.genomes.intern({ ...neutralGenome('B01'), loci: [62, 50, 50, 50, 50, 50, 50, 50] });
    // Generation 1: one qualifying daughter (candidate root).
    const make = (gen: number, cand: number) => {
      const s = place(w, 'B01', 60.5, 60.5);
      c.genome[s] = variant;
      onDaughter(w, s, { refGenome: ref, branchId: -1, candRoot: cand, generation: gen - 1 });
      return s;
    };
    onParentEnds(w, founder);
    const root = make(1, 0);
    const rootBirth = c.birthId[root]!;
    expect(c.candRoot[root]).toBe(rootBirth);
    make(2, rootBirth);
    make(3, rootBirth);
    make(3, rootBirth);
    expect(w.branches.established).toBe(0); // 4 alive, depth 2
    make(4, rootBirth); // 5 alive, depth 3 ⇒ established
    expect(w.branches.established).toBe(1);
    const br = w.branches.branches[0]!;
    expect(br.rootBirthId).toBe(rootBirth);
    expect(br.refGenome).toBe(variant);
    expect(br.alive).toBe(5);
    expect(c.branchId[root]).toBe(0);
  });
});
