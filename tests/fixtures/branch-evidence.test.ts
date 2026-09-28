/**
 * P2.3 fixture — branch evidence (SPEC §8.5, D04 §3, CT §12.8).
 *
 * Proves that a branch is established only when all three hold — a qualifying difference (D4
 * thresholds), ≥ 5 living qualifying descendants, and a living descendant ≥ 3 generations beyond the
 * candidate founder — using lineages built with the exact hook sequence of a committed division
 * (parent released, then each daughter recorded). Also: the oldest qualifying ancestor is the branch
 * founder even when it was its candidate's only member when it divided; renamed and extinct branches
 * keep their history, also across save/reload; a specimen spawn is an external introduction that is
 * ledgered and deterministic.
 */
import { describe, expect, it } from 'vitest';
import { applyNow, type CommandPayload } from '../../src/sim/commands';
import {
  displayBranchName,
  generatedBranchName,
  MIN_DESCENDANTS,
  MIN_GENERATIONS,
  onDaughter,
  onParentEnds,
  qualifies,
  sharedActiveLoci,
  subtreeAlive,
} from '../../src/sim/branches';
import { INITIAL_NUTRIENT_RATIO } from '../../src/sim/constants';
import { neutralGenome, type GenomeInput } from '../../src/sim/genome';
import { checkLedger } from '../../src/sim/ledger';
import { field, recordBirth, recordDivisionEnd } from '../../src/sim/lineage';
import { killEntity } from '../../src/sim/maintenance';
import { realizeRecipe } from '../../src/sim/recipes';
import { R } from '../../src/sim/reasons';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import { speciesIndex, type World } from '../../src/sim/world';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { clearWater, place, registry } from '../helpers/world';

// ---------------------------------------------------------------------------------------------
// Controlled lineages

/**
 * Divide `slot` into two daughters with the given genomes, calling the branch and lineage hooks in
 * exactly the order births.ts commitDivision does. Pools are halved, so no material appears.
 */
function split(w: World, slot: number, gA: number, gB: number): [number, number] {
  const c = w.ents.cols;
  const parentInfo = { refGenome: c.refGenome[slot]!, branchId: c.branchId[slot]!, candRoot: c.candRoot[slot]!, generation: c.generation[slot]! };
  const parentBirth = c.birthId[slot]!;
  onParentEnds(w, slot);
  const other = w.ents.allocate();
  if (other < 0) throw new Error('capacity');
  c.species[other] = c.species[slot]!;
  c.entityId[other] = w.counters.nextEntityId++;
  for (const k of ['B', 'N', 'E'] as const) {
    c[k][slot] = c[k][slot]! / 2;
    c[k][other] = c[k][slot]!;
  }
  c.H[other] = c.H[slot]!;
  c.x[other] = c.x[slot]!;
  c.y[other] = c.y[slot]!;
  c.flags[other] = c.flags[slot]!;
  c.lastIntakeTick[other] = -1;
  c.genome[slot] = gA;
  c.genome[other] = gB;
  recordDivisionEnd(w.lineage, parentBirth, w.tick);
  const daughters = [slot, other] as const;
  for (const d of daughters) c.birthId[d] = w.counters.nextBirthId++;
  for (const d of daughters) {
    recordBirth(w.lineage, c.birthId[d]!, {
      parent: parentBirth,
      genome: c.genome[d]!,
      tick: w.tick,
      generation: parentInfo.generation + 1,
      species: c.species[d]!,
      entityId: c.entityId[d]!,
      origin: 0,
    });
    onDaughter(w, d, parentInfo);
  }
  w.tick += 10;
  return [slot, other];
}

interface Dish {
  w: World;
  founder: number;
  base: number;
  gen: (patch: Partial<GenomeInput>) => number;
}

function dish(): Dish {
  const w = clearWater();
  const founder = place(w, 'B01', 64.5, 64.5, { B: 64, N: 64 * INITIAL_NUTRIENT_RATIO, E: 100 });
  const base = w.ents.cols.genome[founder]!;
  const g0 = w.genomes.get(base);
  const gen = (patch: Partial<GenomeInput>) => w.genomes.intern({ ancestor: g0.ancestor, loci: g0.loci, policy: g0.policy, weights: g0.weights, modules: g0.modules, dev: g0.dev, ...patch });
  return { w, founder, base, gen };
}

const bump = (loci: readonly number[], deltas: Record<number, number>) => loci.map((v, l) => v + (deltas[l] ?? 0));

/**
 * The standard tree: F → R (variant `v`) + S (base). R → R1, R2; R1 → R11, R12; R2 → R21, R22;
 * R11 → R111, R112. With every R-daughter carrying `v` this gives five living descendants of R, the
 * deepest three generations beyond it. `revertR2` gives R2's daughters the base genome instead.
 */
function standardTree(d: Dish, v: number, opts: { revertR2?: boolean } = {}) {
  const { w, founder, base } = d;
  const c = w.ents.cols;
  const [R, S] = split(w, founder, v, base);
  const rootBirth = c.birthId[R]!;
  const [R1, R2] = split(w, R, v, v);
  const [R11, R12] = split(w, R1, v, v);
  const r2 = opts.revertR2 ? base : v;
  const [R21, R22] = split(w, R2, r2, r2);
  const beforeLast = { established: w.branches.established, candidates: Object.keys(w.branches.candidates).length };
  const [R111, R112] = split(w, R11, v, v);
  return { R, S, rootBirth, R1, R2, R11, R12, R21, R22, R111, R112, beforeLast };
}

describe('P2.3 branch establishment needs the threshold, the count and the depth', () => {
  it('all three hold: the branch is established at the fifth living descendant three generations deep', () => {
    const d = dish();
    const { w } = d;
    const v = d.gen({ loci: bump(w.genomes.get(d.base).loci, { 0: 10 }) });
    const t = standardTree(d, v);
    expect(t.beforeLast.established).toBe(0); // four living, two generations deep
    expect(w.branches.established).toBe(1);
    const br = w.branches.branches[0]!;
    // Oldest qualifying ancestor: R, although R was its candidate's only member when it divided.
    expect(br.rootBirthId).toBe(t.rootBirth);
    expect(br.refGenome).toBe(v);
    expect(br.ancestorGenome).toBe(d.base);
    expect(br.alive).toBe(MIN_DESCENDANTS);
    expect(br.membersAtEstablish).toBe(MIN_DESCENDANTS);
    expect(br.depthAtEstablish).toBe(MIN_GENERATIONS);
    expect(br.trait).toEqual({ kind: 'locus', locus: 0, delta: 10, mean: false });
    expect(br.rootCell).toBe(64 * 128 + 64);
    // Both daughters of the establishing division are members; the non-qualifying sibling S is not.
    const c = w.ents.cols;
    for (const s of [t.R12, t.R21, t.R22, t.R111, t.R112]) {
      expect(c.branchId[s]).toBe(0);
      expect(c.refGenome[s]).toBe(v);
      expect(c.candRoot[s]).toBe(0);
    }
    expect(c.branchId[t.S]).toBe(-1);
    expect(Object.keys(w.branches.candidates)).toHaveLength(0);
    expect(generatedBranchName(w, br)).toBe(`Sprinter · ${w.content.loci[0]!.descriptorHigh} · ${br.shortId}`);
    expect(w.events.ring.filter((e) => e.type === 'branchEstablished')).toHaveLength(1);
  });

  it('threshold missing: the same lineage with a +8 difference records no candidate and no branch', () => {
    const d = dish();
    const { w } = d;
    const v = d.gen({ loci: bump(w.genomes.get(d.base).loci, { 0: 8 }) });
    const g = w.genomes.get(v);
    expect(qualifies(w.genomes.get(d.base), g, sharedActiveLoci(w, speciesIndex(w, 'B01'), w.genomes.get(d.base), g))).toBe(false);
    standardTree(d, v);
    expect(w.branches.established).toBe(0);
    expect(Object.keys(w.branches.candidates)).toHaveLength(0);
    expect(w.events.ring.filter((e) => e.type === 'branchCandidate')).toHaveLength(0);
  });

  it('count missing: descendants that no longer qualify are not counted', () => {
    const d = dish();
    const { w } = d;
    const c = w.ents.cols;
    const v = d.gen({ loci: bump(w.genomes.get(d.base).loci, { 3: -10 }) });
    const t = standardTree(d, v, { revertR2: true });
    // Five living descendants of R, three generations deep — but R21 and R22 reverted to the
    // reference genome, so only R12, R111 and R112 qualify.
    expect(w.branches.established).toBe(0);
    const cand = w.branches.candidates[t.rootBirth]!;
    expect(cand.alive).toBe(3);
    expect(c.candRoot[t.R21]).toBe(0);
    expect(c.candRoot[t.R22]).toBe(0);
    split(w, t.R12, v, v); // four qualifying, depth 3
    expect(cand.alive).toBe(4);
    expect(cand.maxDepth).toBeGreaterThanOrEqual(MIN_GENERATIONS);
    expect(w.branches.established).toBe(0);
    split(w, t.R111, v, v); // the fifth qualifying descendant
    expect(w.branches.established).toBe(1);
    expect(w.branches.branches[0]!.rootBirthId).toBe(t.rootBirth);
    expect(c.branchId[t.R21]).toBe(-1);
  });

  it('depth missing: five living qualifying descendants within two generations do not establish', () => {
    // Under binary division five living descendants cannot all sit within two generations (2² = 4),
    // so the gate is exercised with a multi-daughter lineage (the hook takes any number of daughters,
    // as a later life cycle could produce) and must still hold on its own.
    const d = dish();
    const { w } = d;
    const c = w.ents.cols;
    const v = d.gen({ modules: ['E05'] });
    const [R] = split(w, d.founder, v, d.base);
    const rootBirth = c.birthId[R]!;
    const info = (s: number) => ({ refGenome: c.refGenome[s]!, branchId: c.branchId[s]!, candRoot: c.candRoot[s]!, generation: c.generation[s]! });
    const daughterOf = (parent: number) => {
      const s = place(w, 'B01', 60.5, 60.5);
      c.genome[s] = v;
      onDaughter(w, s, info(parent));
      return s;
    };
    const kids = [daughterOf(R), daughterOf(R), daughterOf(R)];
    const grandkids = [daughterOf(kids[0]!), daughterOf(kids[1]!), daughterOf(kids[2]!)];
    const cand = w.branches.candidates[rootBirth]!;
    expect(cand.alive).toBeGreaterThanOrEqual(MIN_DESCENDANTS + 1); // R, three children, three grandchildren
    expect(cand.maxDepth).toBe(2);
    expect(w.branches.established).toBe(0);
    daughterOf(grandkids[0]!); // three generations beyond R
    expect(w.branches.established).toBe(1);
    expect(w.branches.branches[0]!.trait).toEqual({ kind: 'module', module: 'E05', gained: true });
  });

  it('depth must be held by a living descendant: five alive after the deep one died is not enough', () => {
    // Multi-daughter hook (as in the depth test above): the parent stays alive, so a lineage can hold
    // five living members within two generations once its only deep member has died.
    const d = dish();
    const { w } = d;
    const c = w.ents.cols;
    const v = d.gen({ loci: bump(w.genomes.get(d.base).loci, { 2: 10 }) });
    const [root] = split(w, d.founder, v, d.base);
    const rootBirth = c.birthId[root]!;
    const info = (s: number) => ({ refGenome: c.refGenome[s]!, branchId: c.branchId[s]!, candRoot: c.candRoot[s]!, generation: c.generation[s]! });
    const daughterOf = (parent: number) => {
      const s = place(w, 'B01', 60.5, 60.5);
      c.genome[s] = v;
      onDaughter(w, s, info(parent));
      return s;
    };
    const k1 = daughterOf(root);
    const g1 = daughterOf(k1);
    const deep = daughterOf(g1); // three generations beyond the root, four living
    const cand = w.branches.candidates[rootBirth]!;
    expect(cand.alive).toBe(4);
    expect(cand.maxDepth).toBe(MIN_GENERATIONS);
    expect(w.branches.established).toBe(0);
    killEntity(w, deep, R.DEATH_STARVATION);
    daughterOf(root);
    daughterOf(root); // five living, the recorded maximum depth is 3, but nobody alive is that deep
    expect(cand.alive).toBe(5);
    expect(cand.maxDepth).toBe(MIN_GENERATIONS);
    expect(w.branches.established).toBe(0);
    daughterOf(g1); // a living member three generations deep again ⇒ established
    expect(w.branches.established).toBe(1);
    const br = w.branches.branches[0]!;
    expect(br.rootBirthId).toBe(rootBirth);
    expect(br.membersAtEstablish).toBe(6);
    expect(br.depthAtEstablish).toBe(MIN_GENERATIONS);
  });

  it('a living deep member alone is not enough either: four living three generations deep do not establish', () => {
    const d = dish();
    const { w } = d;
    const c = w.ents.cols;
    const v = d.gen({ policy: 'weighted', weights: [1] });
    const [root] = split(w, d.founder, v, d.base);
    const rootBirth = c.birthId[root]!;
    const [R1, R2] = split(w, root, v, v);
    const [R11] = split(w, R1, v, v);
    split(w, R11, v, v);
    killEntity(w, R2, R.DEATH_STARVATION);
    const cand = w.branches.candidates[rootBirth]!;
    expect(cand.alive).toBe(3);
    expect(cand.maxDepth).toBe(MIN_GENERATIONS);
    expect(w.branches.established).toBe(0);
  });

  it('weights: ≥ 0.15 on one shared weight qualifies only when both are weighted; loci inactive in either are ignored', () => {
    const w = clearWater();
    const b04 = speciesIndex(w, 'B04');
    const a01 = speciesIndex(w, 'A01');
    const mk = (anc: string, patch: Partial<GenomeInput>) => w.genomes.get(w.genomes.intern({ ...neutralGenome(anc), ...patch }));
    const refW = mk('B04', { policy: 'weighted', weights: [0.4, 0.2, 0.2, 0.2] });
    const q = (ref: ReturnType<typeof mk>, g: ReturnType<typeof mk>, sp: number) => qualifies(ref, g, sharedActiveLoci(w, sp, ref, g));
    expect(q(refW, mk('B04', { policy: 'weighted', weights: [0.55, 0.15, 0.15, 0.15] }), b04)).toBe(true);
    expect(q(refW, mk('B04', { policy: 'weighted', weights: [0.52, 0.16, 0.16, 0.16] }), b04)).toBe(false);
    // An ordered reference and a weighted descendant differ in policy (the weights are not compared).
    expect(q(mk('B04', {}), mk('B04', { policy: 'weighted', weights: [0.25, 0.25, 0.25, 0.25] }), b04)).toBe(true);
    // Sunbead motility and sensing are not active: a 30-point change there is not a difference.
    expect(q(mk('A01', {}), mk('A01', { loci: [80, 50, 80, 50, 50, 50, 50, 50] }), a01)).toBe(false);
    expect(q(mk('A01', {}), mk('A01', { loci: [50, 60, 50, 50, 50, 50, 50, 50] }), a01)).toBe(true);
  });

  it('each D4 criterion qualifies at its threshold and not below it', () => {
    const d = dish();
    const { w } = d;
    const ref = w.genomes.get(d.base);
    const q = (patch: Partial<GenomeInput>) => {
      const g = w.genomes.get(d.gen(patch));
      return qualifies(ref, g, sharedActiveLoci(w, speciesIndex(w, 'B01'), ref, g));
    };
    expect(q({ loci: bump(ref.loci, { 2: -10 }) })).toBe(true); // one active locus ≥ 0.10
    expect(q({ loci: bump(ref.loci, { 2: -9 }) })).toBe(false);
    expect(q({ loci: bump(ref.loci, { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3 }) })).toBe(true); // mean 0.03 over 7 active loci
    expect(q({ loci: bump(ref.loci, { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2 }) })).toBe(false);
    expect(q({ loci: bump(ref.loci, { 7: 30 }) })).toBe(false); // dormancy is inactive in both
    expect(q({ modules: ['E05'] })).toBe(true); // module set differs
    expect(q({ policy: 'weighted', weights: [1] })).toBe(true); // policy differs
  });
});

describe('P2.3 sub-branches, extinction, names and pins keep history', () => {
  function establishedDish() {
    const d = dish();
    const { w } = d;
    const v = d.gen({ loci: bump(w.genomes.get(d.base).loci, { 5: 10 }) });
    const t = standardTree(d, v);
    return { ...d, v, t };
  }

  it('a branch whose members all moved into a sub-branch is not extinct until the sub-branch is', () => {
    const { w, t, gen, v } = establishedDish();
    const c = w.ents.cols;
    const x = w.branches.branches[0]!;
    // Grow a sub-branch inside X from R111: +10 motility relative to X's reference (R111's sibling
    // daughter keeps X's reference genome).
    const v2 = gen({ loci: bump(w.genomes.get(v).loci, { 0: 10 }) });
    const [A] = split(w, t.R111, v2, v);
    const [A1, A2] = split(w, A, v2, v2);
    const [A11] = split(w, A1, v2, v2);
    split(w, A2, v2, v2);
    expect(w.branches.established).toBe(1); // four living, two generations deep
    split(w, A11, v2, v2);
    expect(w.branches.established).toBe(2);
    const y = w.branches.branches[1]!;
    expect(y.parentBranch).toBe(0);
    expect(y.ancestorGenome).toBe(v);
    expect(y.alive).toBe(MIN_DESCENDANTS);
    expect(subtreeAlive(w.branches, 0)).toBe(x.alive + y.alive);
    // Every own member of X dies: X keeps living descendants in Y, so it is not extinct.
    for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && c.branchId[i] === 0) killEntity(w, i, R.DEATH_STARVATION);
    expect(x.alive).toBe(0);
    expect(x.extinctTick).toBe(-1);
    // Y dies out: both are extinct now, each with its own record.
    w.tick += 10;
    for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && c.branchId[i] === 1) killEntity(w, i, R.DEATH_STARVATION);
    expect(y.extinctTick).toBe(w.tick);
    expect(x.extinctTick).toBe(w.tick);
    expect(w.events.ring.filter((e) => e.type === 'branchExtinct').map((e) => e.detail?.branch)).toEqual([1, 0]);
  });

  it('renamed, pinned and extinct branches keep name, ID and history, also across save/reload', async () => {
    const { w, t } = establishedDish();
    const br = w.branches.branches[0]!;
    const generated = generatedBranchName(w, br);
    const before = { rootBirthId: br.rootBirthId, establishedTick: br.establishedTick, candidateTick: br.candidateTick, shortId: br.shortId, peak: br.peak };
    const cmd = (payload: CommandPayload, id: string) => applyNow(w, id, payload).result!;
    expect(cmd({ kind: 'lineage', op: 'rename', branch: 0, name: '  Salty\u0007 crew  ' }, 'r1').accepted).toBe(1);
    expect(cmd({ kind: 'lineage', op: 'pin', branch: 0, pinned: true }, 'p1').accepted).toBe(1);
    expect(cmd({ kind: 'lineage', op: 'rename', branch: 9, name: 'x' }, 'r2').accepted).toBe(0); // unknown branch refused
    expect(br.name).toBe('Salty crew');
    expect(displayBranchName(w, br)).toBe(`Salty crew · ${br.shortId}`); // the ID stays visible
    expect(generatedBranchName(w, br)).toBe(generated);
    // A 61-character name is cut to 60; an empty one restores the generated name.
    cmd({ kind: 'lineage', op: 'rename', branch: 0, name: 'x'.repeat(61) }, 'r3');
    expect(br.name).toHaveLength(60);
    cmd({ kind: 'lineage', op: 'rename', branch: 0, name: 'Salty crew' }, 'r4');
    // Every member dies: the branch is extinct and its record stays whole.
    const c = w.ents.cols;
    for (const s of [t.R12, t.R21, t.R22, t.R111, t.R112]) killEntity(w, s, R.DEATH_STARVATION);
    expect(br.extinctTick).toBe(w.tick);
    expect(br.alive).toBe(0);
    expect({ rootBirthId: br.rootBirthId, establishedTick: br.establishedTick, candidateTick: br.candidateTick, shortId: br.shortId, peak: br.peak }).toEqual(before);
    expect(br.name).toBe('Salty crew');
    expect(br.pinned).toBe(true);
    expect(field(w.lineage, 'genome', br.rootBirthId)).toBe(br.refGenome);
    void c;
    // Save → reload (plain state and the real .pixelmeba file path): identical records and hash.
    const hash = stateHash(w);
    const again = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(again.branches).toEqual(w.branches);
    expect(stateHash(again)).toBe(hash);
    const file = await buildSaveFile(w, { name: 'branch evidence', savedAt: '2026-09-28T00:00:00.000Z', recipeId: null });
    const loaded = (await loadSaveFile(file.text)).world;
    const lb = loaded.branches.branches[0]!;
    expect(displayBranchName(loaded, lb)).toBe(`Salty crew · ${br.shortId}`);
    expect(lb.extinctTick).toBe(br.extinctTick);
    expect(lb.pinned).toBe(true);
    expect(stateHash(loaded)).toBe(hash);
  });

  it('a record written before P2.3 (no ancestor or trait stored) keeps its generated name after reload', () => {
    const { w } = establishedDish();
    const name = generatedBranchName(w, w.branches.branches[0]!);
    const state = JSON.parse(JSON.stringify(serializeWorld(w))) as ReturnType<typeof serializeWorld>;
    for (const b of state.branches!.branches as unknown as Record<string, unknown>[]) {
      for (const k of ['ancestorGenome', 'trait', 'rootCell', 'membersAtEstablish', 'depthAtEstablish', 'peak']) delete b[k];
    }
    const old = deserializeWorld(state);
    // The ancestral line's reference is the introduced founder's genome, found through the birth records.
    expect(generatedBranchName(old, old.branches.branches[0]!)).toBe(name);
  });

  it('names, pins and saved specimens are not chart interventions; a specimen spawn is', () => {
    const { w } = establishedDish();
    const before = w.history.pendingInterventions;
    applyNow(w, 'n1', { kind: 'lineage', op: 'rename', branch: 0, name: 'A' });
    applyNow(w, 'n2', { kind: 'lineage', op: 'pin', branch: 0, pinned: true });
    applyNow(w, 'n3', { kind: 'lineage', op: 'saveSpecimen', from: 'branch', id: 0 });
    expect(w.history.pendingInterventions).toBe(before);
    applyNow(w, 'n4', { kind: 'lineage', op: 'spawnSpecimen', specimen: 1, x: 30.5, y: 64.5, radius: 1, count: 1 });
    expect(w.history.pendingInterventions).toBe(before + 1);
    // All four are in the command log, so a replay reproduces them.
    expect(w.commands.log.slice(-4).map((c) => c.commandId)).toEqual(['n1', 'n2', 'n3', 'n4']);
  });
});

describe('P2.3 specimens: saved genome + ancestry; spawn is a ledgered external introduction', () => {
  function withSpecimen() {
    const d = dish();
    const { w } = d;
    const v = d.gen({ loci: bump(w.genomes.get(d.base).loci, { 1: -10 }), modules: ['E05'] });
    const t = standardTree(d, v);
    applyNow(w, 's1', { kind: 'lineage', op: 'saveSpecimen', from: 'branch', id: 0 });
    return { ...d, v, t };
  }

  it('stores the genome and an ancestry summary', () => {
    const { w, v, t } = withSpecimen();
    const s = w.branches.specimens![0]!;
    expect(s).toMatchObject({ id: 1, genome: v, genomeId: w.genomes.get(v).id, speciesId: 'B01', from: 'branch', sourceBirthId: t.rootBirth, branch: 0, spawned: 0 });
    expect(s.ancestry).toEqual([{ branch: 0, shortId: w.branches.branches[0]!.shortId }]);
    expect(s.branchLabel).toBe(displayBranchName(w, w.branches.branches[0]!));
    // From one living organism too.
    applyNow(w, 's2', { kind: 'lineage', op: 'saveSpecimen', from: 'organism', id: w.ents.cols.birthId[t.S]! });
    expect(w.branches.specimens![1]).toMatchObject({ id: 2, genome: d0(w, t.S), from: 'organism', branch: -1, ancestry: [] });
    // A dead organism cannot be saved.
    expect(applyNow(w, 's3', { kind: 'lineage', op: 'saveSpecimen', from: 'organism', id: t.rootBirth }).result!.accepted).toBe(0);
  });

  it('spawning is an external introduction: ledgered input, founder state, a new ancestral line', () => {
    const { w, v, t } = withSpecimen();
    const c = w.ents.cols;
    // Let the branch die out first: spawning must not revive it.
    for (const s of [t.R12, t.R21, t.R22, t.R111, t.R112]) killEntity(w, s, R.DEATH_STARVATION);
    const br = w.branches.branches[0]!;
    expect(br.extinctTick).toBeGreaterThanOrEqual(0);
    const inputs = { ...w.ledger.inputs };
    const nextBirth = w.counters.nextBirthId;
    const res = applyNow(w, 'sp1', { kind: 'lineage', op: 'spawnSpecimen', specimen: 1, x: 40.5, y: 64.5, radius: 3, count: 5 }).result!;
    expect(res).toMatchObject({ accepted: 5, rejected: 0 });
    const b0 = w.species[speciesIndex(w, 'B01')]!.def.b0;
    expect(w.ledger.inputs.c - inputs.c).toBeCloseTo(5 * b0, 12);
    expect(w.ledger.inputs.n - inputs.n).toBeCloseTo(5 * INITIAL_NUTRIENT_RATIO * b0, 12);
    expect(w.ledger.entries.filter((e) => e.source === 'introduce:specimen').reduce((a, e) => a + e.c, 0)).toBeCloseTo(5 * b0, 12);
    expect(checkLedger(w).ok).toBe(true);
    for (let b = nextBirth; b < nextBirth + 5; b++) {
      let slot = -1;
      for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && c.birthId[i] === b) slot = i;
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(c.genome[slot]).toBe(v);
      expect(c.branchId[slot]).toBe(-1); // not a member of the branch it came from
      expect(c.refGenome[slot]).toBe(v);
      expect(c.generation[slot]).toBe(0);
      expect(field(w.lineage, 'parent', b)).toBe(0);
      expect(field(w.lineage, 'origin', b)).toBe(1); // introduced
    }
    expect(br.alive).toBe(0);
    expect(br.extinctTick).toBeGreaterThanOrEqual(0);
    expect(w.branches.specimens![0]!.spawned).toBe(5);
    expect(w.events.ring.filter((e) => e.type === 'introduce' && e.detail?.source === 'specimen')).toHaveLength(5);
    // Nearest-first placement: the first organism lands in the tapped cell.
    let first = -1;
    for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && c.birthId[i] === nextBirth) first = i;
    expect([Math.floor(c.x[first]!), Math.floor(c.y[first]!)]).toEqual([40, 64]);
    // Refusals place and log nothing.
    const after = { ...w.ledger.inputs };
    expect(applyNow(w, 'sp2', { kind: 'lineage', op: 'spawnSpecimen', specimen: 7, x: 40.5, y: 64.5, radius: 3, count: 1 }).result!.accepted).toBe(0);
    expect(applyNow(w, 'sp3', { kind: 'lineage', op: 'spawnSpecimen', specimen: 1, x: 1.5, y: 1.5, radius: 1, count: 1 }).result!.accepted).toBe(0); // outside the dish
    expect(w.ledger.inputs).toEqual(after);
  });

  it('spawning is deterministic: same commands ⇒ same hash, also after save/reload and on replay', () => {
    const script = (w: World) => {
      applyNow(w, 'k1', { kind: 'lineage', op: 'spawnSpecimen', specimen: 1, x: 44.5, y: 60.5, radius: 3, count: 5 });
      run(w, 40);
      applyNow(w, 'k2', { kind: 'lineage', op: 'spawnSpecimen', specimen: 1, x: 80.5, y: 70.5, radius: 6, count: 20 });
      run(w, 60);
    };
    const a = withSpecimen().w;
    const b = withSpecimen().w;
    const start = serializeWorld(a);
    script(a);
    script(b);
    expect(stateHash(a)).toBe(stateHash(b));
    expect(checkLedger(a).ok).toBe(true);
    // Save/reload between the two spawns.
    const c = deserializeWorld(JSON.parse(JSON.stringify(start)));
    applyNow(c, 'k1', { kind: 'lineage', op: 'spawnSpecimen', specimen: 1, x: 44.5, y: 60.5, radius: 3, count: 5 });
    run(c, 40);
    const c2 = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(c))));
    applyNow(c2, 'k2', { kind: 'lineage', op: 'spawnSpecimen', specimen: 1, x: 80.5, y: 70.5, radius: 6, count: 20 });
    run(c2, 60);
    expect(stateHash(c2)).toBe(stateHash(a));
    // Replay the recorded command log from the starting state.
    const r = deserializeWorld(JSON.parse(JSON.stringify(start)));
    const log = a.commands.log.filter((cmd) => cmd.commandId.startsWith('k'));
    let k = 0;
    while (r.tick < a.tick) {
      for (; k < log.length && log[k]!.targetTick === r.tick; k++) applyNow(r, log[k]!.commandId, log[k]!.payload);
      step(r);
    }
    expect(stateHash(r)).toBe(stateHash(a));
  });
});

describe('P2.3 a real Accelerated dish', () => {
  it('establishes branches only with the evidence, and save/reload changes nothing', () => {
    const reg = registry();
    const make = () => realizeRecipe(reg, 'FIRST_DISH_V1', { seed: 101, worldId: 'branch-run', transform: (r) => ({ ...r, mutationPreset: 'accelerated' }) });
    const w = make();
    run(w, 1000);
    const mid = serializeWorld(w);
    run(w, 800);
    expect(w.branches.established).toBeGreaterThanOrEqual(1);
    const c = w.ents.cols;
    for (const br of w.branches.branches) {
      expect(br.membersAtEstablish).toBeGreaterThanOrEqual(MIN_DESCENDANTS);
      expect(br.depthAtEstablish).toBeGreaterThanOrEqual(MIN_GENERATIONS);
      const ref = w.genomes.get(br.ancestorGenome!);
      const g = w.genomes.get(br.refGenome);
      expect(qualifies(ref, g, sharedActiveLoci(w, br.species, ref, g))).toBe(true);
      expect(field(w.lineage, 'genome', br.rootBirthId)).toBe(br.refGenome);
      expect(displayBranchName(w, br)).toMatch(/^\S+ · .+ · [0-9A-F]{3}(-\d+)?$/);
      expect(displayBranchName(w, br)).not.toMatch(/superior|advanced|perfect|adapted|immune/i);
    }
    // Bookkeeping matches the living organisms exactly.
    const alive = new Array<number>(w.branches.branches.length).fill(0);
    const cand: Record<number, number> = {};
    for (let i = 0; i < w.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      if (c.branchId[i]! >= 0) {
        alive[c.branchId[i]!]!++;
        expect(c.refGenome[i]).toBe(w.branches.branches[c.branchId[i]!]!.refGenome);
      }
      if (c.candRoot[i]) cand[c.candRoot[i]!] = (cand[c.candRoot[i]!] ?? 0) + 1;
    }
    expect(w.branches.branches.map((b) => b.alive)).toEqual(alive);
    for (const [root, n] of Object.entries(cand)) expect(w.branches.candidates[Number(root)]?.alive).toBe(n);
    for (const cd of Object.values(w.branches.candidates)) expect(cd.pending).toBeUndefined();
    // Reloading mid-run gives the same branches and the same endpoint.
    const r = deserializeWorld(JSON.parse(JSON.stringify(mid)));
    run(r, 800);
    expect(r.branches).toEqual(w.branches);
    expect(stateHash(r)).toBe(stateHash(w));
    // A fresh run takes the same course.
    const f = make();
    run(f, 1800);
    expect(stateHash(f)).toBe(stateHash(w));
  });
});

function d0(w: World, slot: number): number {
  return w.ents.cols.genome[slot]!;
}
