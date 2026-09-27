/**
 * Branch discovery records (SPEC §8.5, D04 §3). Observation only: thresholds never change births,
 * survival or anything else in the simulation.
 *
 * Each organism carries a reference genome (the genome of its nearest named branch, or of its
 * founder), a branch id (-1 = its species' ancestral line) and a candidate root (0 = none).
 * A descendant qualifies against its reference when any holds (loci compared only where active):
 *   • one locus differs by ≥ 10 points (0.10 normalized), or
 *   • the mean absolute difference over active loci is ≥ 0.03, or
 *   • its supplementary module set differs, or
 *   • its feeding policy differs, or both are weighted and one shared weight differs by ≥ 0.15.
 * The oldest qualifying ancestor in an unbroken qualifying chain is the candidate root. A candidate
 * becomes an established branch when it has ≥ 5 living qualifying descendants and they reach ≥ 3
 * generations beyond the root; its root genome becomes the reference for later branches.
 */
import { emit } from './events';
import type { Genome } from './genome';
import { shortGenomeId } from './genome';
import type { World } from './world';

export interface Branch {
  readonly id: number;
  readonly species: number;
  readonly rootBirthId: number;
  readonly refGenome: number;
  readonly parentBranch: number;
  readonly shortId: string;
  readonly candidateTick: number;
  readonly establishedTick: number;
  extinctTick: number;
  alive: number;
  name: string | null;
  pinned: boolean;
}

export interface Candidate {
  readonly root: number;
  readonly rootGenome: number;
  readonly rootGeneration: number;
  readonly refGenome: number;
  readonly parentBranch: number;
  readonly species: number;
  readonly firstTick: number;
  alive: number;
  maxDepth: number;
}

export interface BranchBook {
  branches: Branch[];
  /** Candidate records keyed by root birthId (plain object; looked up, never iterated for order). */
  candidates: Record<number, Candidate>;
  established: number;
}

export function createBranchBook(): BranchBook {
  return { branches: [], candidates: {}, established: 0 };
}

export const SINGLE_LOCUS_THRESHOLD = 10;
export const MEAN_THRESHOLD = 0.03;
export const WEIGHT_THRESHOLD = 0.15;
export const MIN_DESCENDANTS = 5;
export const MIN_GENERATIONS = 3;

export function qualifies(ref: Genome, g: Genome, lociActive: readonly boolean[]): boolean {
  let sum = 0;
  let n = 0;
  for (let l = 0; l < lociActive.length; l++) {
    if (!lociActive[l]) continue;
    const d = Math.abs(g.loci[l]! - ref.loci[l]!);
    if (d >= SINGLE_LOCUS_THRESHOLD) return true;
    sum += d / 100;
    n++;
  }
  if (n > 0 && sum / n >= MEAN_THRESHOLD - 1e-12) return true;
  if (g.modules.join('+') !== ref.modules.join('+')) return true;
  if (g.policy !== ref.policy) return true;
  if (g.policy === 'weighted' && ref.weights && g.weights) {
    for (let k = 0; k < g.weights.length; k++) if (Math.abs(g.weights[k]! - (ref.weights[k] ?? 0)) >= WEIGHT_THRESHOLD - 1e-12) return true;
  }
  return false;
}

/** Founders and introduced organisms start their own ancestral line with their own genome as reference. */
export function initFounder(world: World, slot: number): void {
  const c = world.ents.cols;
  c.refGenome[slot] = c.genome[slot]!;
  c.branchId[slot] = -1;
  c.candRoot[slot] = 0;
  c.generation[slot] = 0;
}

/** Called for each daughter right after a committed division (parent values passed in). */
export function onDaughter(world: World, daughter: number, parent: { refGenome: number; branchId: number; candRoot: number; generation: number }): void {
  const c = world.ents.cols;
  const book = world.branches;
  c.refGenome[daughter] = parent.refGenome;
  c.branchId[daughter] = parent.branchId;
  c.generation[daughter] = parent.generation + 1;
  if (parent.branchId >= 0) book.branches[parent.branchId]!.alive++;
  const ref = world.genomes.get(parent.refGenome);
  const g = world.genomes.get(c.genome[daughter]!);
  const sp = world.species[c.species[daughter]!]!;
  if (!qualifies(ref, g, sp.def.lociActive)) {
    c.candRoot[daughter] = 0;
    return;
  }
  const birthId = c.birthId[daughter]!;
  let cand = parent.candRoot !== 0 ? book.candidates[parent.candRoot] : undefined;
  if (!cand || cand.refGenome !== parent.refGenome) {
    cand = {
      root: birthId,
      rootGenome: c.genome[daughter]!,
      rootGeneration: c.generation[daughter],
      refGenome: parent.refGenome,
      parentBranch: parent.branchId,
      species: c.species[daughter]!,
      firstTick: world.tick,
      alive: 0,
      maxDepth: 0,
    };
    book.candidates[birthId] = cand;
    emit(world.events, world.counters, { tick: world.tick, type: 'branchCandidate', species: cand.species, birthId, detail: { genome: g.id } });
  }
  c.candRoot[daughter] = cand.root;
  cand.alive++;
  cand.maxDepth = Math.max(cand.maxDepth, c.generation[daughter] - cand.rootGeneration);
  if (cand.alive >= MIN_DESCENDANTS && cand.maxDepth >= MIN_GENERATIONS) establish(world, cand);
}

/** The pre-division individual stops counting toward its candidate and branch. */
export function onParentEnds(world: World, slot: number): void {
  release(world, slot);
}

export function onDeath(world: World, slot: number): void {
  release(world, slot);
}

function release(world: World, slot: number): void {
  const c = world.ents.cols;
  const book = world.branches;
  const root = c.candRoot[slot]!;
  if (root !== 0) {
    const cand = book.candidates[root];
    if (cand) {
      cand.alive--;
      if (cand.alive <= 0) delete book.candidates[root];
    }
  }
  const b = c.branchId[slot]!;
  if (b >= 0) {
    const br = book.branches[b]!;
    br.alive--;
    if (br.alive <= 0 && br.extinctTick < 0) {
      br.extinctTick = world.tick;
      emit(world.events, world.counters, { tick: world.tick, type: 'branchExtinct', species: br.species, birthId: br.rootBirthId, detail: { branch: br.id } });
    }
  }
}

function establish(world: World, cand: Candidate): void {
  const book = world.branches;
  const c = world.ents.cols;
  const id = book.branches.length;
  const g = world.genomes.get(cand.rootGenome);
  const branch: Branch = {
    id,
    species: cand.species,
    rootBirthId: cand.root,
    refGenome: cand.rootGenome,
    parentBranch: cand.parentBranch,
    shortId: shortGenomeId(g.id),
    candidateTick: cand.firstTick,
    establishedTick: world.tick,
    extinctTick: -1,
    alive: 0,
    name: null,
    pinned: false,
  };
  book.branches.push(branch);
  book.established++;
  // Move every living qualifying descendant into the new branch (ascending slot order).
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1 || c.candRoot[i] !== cand.root) continue;
    if (c.branchId[i]! >= 0) book.branches[c.branchId[i]!]!.alive--;
    c.branchId[i] = id;
    c.refGenome[i] = cand.rootGenome;
    c.candRoot[i] = 0;
    branch.alive++;
  }
  delete book.candidates[cand.root];
  emit(world.events, world.counters, {
    tick: world.tick,
    type: 'branchEstablished',
    species: cand.species,
    birthId: cand.root,
    detail: { branch: id, shortId: branch.shortId, members: branch.alive },
  });
}
