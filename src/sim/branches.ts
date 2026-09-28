/**
 * Branch discovery records (SPEC §8.5, D04 §3, CT §12.8). Observation only: thresholds never change
 * births, survival or anything else in the simulation, and nothing here consumes randomness.
 *
 * Each organism carries a reference genome (the genome of its nearest named branch, or of its
 * founder), a branch id (-1 = its species' ancestral line) and a candidate root (0 = none).
 * A descendant qualifies against its reference when any holds (loci compared only where active in
 * both genomes):
 *   • one locus differs by ≥ 10 points (0.10 normalized), or
 *   • the mean absolute difference over those loci is ≥ 0.03, or
 *   • its supplementary module set differs, or
 *   • its feeding policy differs, or both are weighted and one shared weight differs by ≥ 0.15.
 * A qualifying descendant of a qualifying parent joins its parent's candidate, so the candidate root
 * is always the oldest qualifying ancestor of an unbroken qualifying chain (deterministic; no
 * overlapping candidates). A descendant that no longer qualifies leaves the candidate and is not
 * counted. A candidate becomes an established branch when ≥ 5 of its qualifying members are alive
 * and at least one of them lives ≥ 3 parent-to-child generations beyond the root (under division the
 * root itself has split long before, so every counted member is a descendant). The root genome
 * becomes the branch reference for later branches.
 *
 * States: variation observed (a live candidate) → branch established → branch extinct (no living
 * member of the branch or of any branch descended from it). Extinct and renamed branches keep their
 * records; names, pins and specimens are notebook labels changed only through commands.
 */
import { emit } from './events';
import type { FeedingPolicy, Genome } from './genome';
import { shortGenomeId } from './genome';
import { activeLoci } from './phenotype';
import { entityCell } from './spatial';
import type { Specimen } from './specimens';
import type { World } from './world';

/** The qualifying difference recorded when a branch is established (drives the generated name). */
export type BranchTrait =
  | { readonly kind: 'module'; readonly module: string; readonly gained: boolean }
  | { readonly kind: 'locus'; readonly locus: number; readonly delta: number; readonly mean: boolean }
  | { readonly kind: 'policy'; readonly policy: FeedingPolicy }
  | { readonly kind: 'weight'; readonly food: number; readonly delta: number };

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
  /** Living organisms whose branch is this one (members of branches descended from it not included). */
  alive: number;
  /** Player-chosen name (≤ 60 characters), or null for the generated name. The ID always shows. */
  name: string | null;
  pinned: boolean;
  // Recorded from P2.3 (absent in records written before; readers fall back).
  /** The reference genome the root was compared with (the nearest named ancestor's, or its founder's). */
  readonly ancestorGenome?: number;
  /** The qualifying difference between the root genome and ancestorGenome. */
  readonly trait?: BranchTrait;
  /** Cell where the candidate founder was born. */
  readonly rootCell?: number;
  /** Qualifying members alive, and the deepest living generation beyond the root, when established. */
  readonly membersAtEstablish?: number;
  readonly depthAtEstablish?: number;
  /** Largest number of own members alive at once. */
  peak?: number;
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
  /** Cell where the root was born (P2.3). */
  readonly cell?: number;
  /**
   * Daughters still to be processed in the division under way (transient: always absent between
   * ticks). A member's division first releases the parent, then adds each daughter, so a candidate
   * whose only living member divides must not be discarded before its daughters can join.
   */
  pending?: number;
}

export interface BranchBook {
  branches: Branch[];
  /** Candidate records keyed by root birthId (plain object; looked up, never iterated for order). */
  candidates: Record<number, Candidate>;
  established: number;
  /**
   * Saved specimens (P2.3): genome + ancestry summary, spawnable as an external introduction.
   * Absent until the first specimen is saved, so worlds without specimens hash as before.
   */
  specimens?: Specimen[];
}

export function createBranchBook(): BranchBook {
  return { branches: [], candidates: {}, established: 0 };
}

export const SINGLE_LOCUS_THRESHOLD = 10;
export const MEAN_THRESHOLD = 0.03;
export const WEIGHT_THRESHOLD = 0.15;
export const MIN_DESCENDANTS = 5;
export const MIN_GENERATIONS = 3;
/** Name fields ≤ 60 characters (CT §12.10). */
export const BRANCH_NAME_MAX = 60;

/** Loci active in both genomes (SPEC §8.5 "compare only loci active in both"). */
export function sharedActiveLoci(world: World, species: number, a: Genome, b: Genome): boolean[] {
  const sp = world.species[species]!;
  const x = activeLoci(sp, a);
  const y = activeLoci(sp, b);
  return x.map((v, l) => v && y[l]!);
}

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

/**
 * The difference a branch is named after (null when g does not qualify). Order: a module gained or
 * lost (first by id), then the largest single-locus change (lowest index on ties; also used when only
 * the mean qualifies), then a feeding-policy change, then the largest shared weight change.
 */
export function qualifyingTrait(ref: Genome, g: Genome, lociActive: readonly boolean[]): BranchTrait | null {
  if (!qualifies(ref, g, lociActive)) return null;
  for (const m of g.modules) if (!ref.modules.includes(m)) return { kind: 'module', module: m, gained: true };
  for (const m of ref.modules) if (!g.modules.includes(m)) return { kind: 'module', module: m, gained: false };
  let best = -1;
  let bestD = 0;
  let sum = 0;
  let n = 0;
  for (let l = 0; l < lociActive.length; l++) {
    if (!lociActive[l]) continue;
    const d = g.loci[l]! - ref.loci[l]!;
    sum += Math.abs(d) / 100;
    n++;
    if (Math.abs(d) > Math.abs(bestD)) {
      best = l;
      bestD = d;
    }
  }
  const single = Math.abs(bestD) >= SINGLE_LOCUS_THRESHOLD;
  const mean = n > 0 && sum / n >= MEAN_THRESHOLD - 1e-12;
  if (best >= 0 && (single || mean)) return { kind: 'locus', locus: best, delta: bestD, mean: !single };
  if (g.policy !== ref.policy) return { kind: 'policy', policy: g.policy };
  // Weights sum to 1, so a shared weight that moved by ≥ 0.15 means another one rose: name the food
  // whose weight rose the most (lowest index on ties).
  let food = 0;
  let fd = 0;
  if (g.weights && ref.weights) {
    for (let k = 0; k < g.weights.length; k++) {
      const d = g.weights[k]! - (ref.weights[k] ?? 0);
      if (d > fd) {
        food = k;
        fd = d;
      }
    }
  }
  return { kind: 'weight', food, delta: fd };
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
  if (parent.branchId >= 0) {
    const br = book.branches[parent.branchId]!;
    br.alive++;
    if (br.alive > (br.peak ?? 0)) br.peak = br.alive;
  }
  const parentCand = parent.candRoot !== 0 ? book.candidates[parent.candRoot] : undefined;
  if (parentCand && parentCand.pending) parentCand.pending--;
  const ref = world.genomes.get(parent.refGenome);
  const g = world.genomes.get(c.genome[daughter]!);
  const spIdx = c.species[daughter]!;
  if (qualifies(ref, g, sharedActiveLoci(world, spIdx, ref, g))) {
    const birthId = c.birthId[daughter]!;
    let cand = parentCand && parentCand.refGenome === parent.refGenome ? parentCand : undefined;
    if (!cand) {
      cand = {
        root: birthId,
        rootGenome: c.genome[daughter]!,
        rootGeneration: c.generation[daughter],
        refGenome: parent.refGenome,
        parentBranch: parent.branchId,
        species: spIdx,
        firstTick: world.tick,
        alive: 0,
        maxDepth: 0,
        cell: entityCell(c.x[daughter]!, c.y[daughter]!),
      };
      book.candidates[birthId] = cand;
      emit(world.events, world.counters, { tick: world.tick, type: 'branchCandidate', species: cand.species, birthId, detail: { genome: g.id } });
    }
    c.candRoot[daughter] = cand.root;
    cand.alive++;
    cand.maxDepth = Math.max(cand.maxDepth, c.generation[daughter] - cand.rootGeneration);
    if (cand !== parentCand) maybeEstablish(world, cand);
  } else {
    c.candRoot[daughter] = 0;
  }
  // The division is complete once both daughters are in: only then may the parent's candidate be
  // discarded (nobody joined) or confirmed (a sibling that joins second is always counted).
  if (parentCand && !parentCand.pending) {
    delete parentCand.pending;
    if (book.candidates[parentCand.root] !== parentCand) return;
    if (parentCand.alive <= 0) delete book.candidates[parentCand.root];
    else maybeEstablish(world, parentCand);
  }
}

/** The pre-division individual stops counting toward its candidate and branch; both daughters follow. */
export function onParentEnds(world: World, slot: number): void {
  const c = world.ents.cols;
  const book = world.branches;
  const root = c.candRoot[slot]!;
  if (root !== 0) {
    const cand = book.candidates[root];
    if (cand) {
      cand.alive--;
      cand.pending = (cand.pending ?? 0) + 2;
    }
  }
  // Both daughters inherit the parent's branch, so a division never empties a branch.
  const b = c.branchId[slot]!;
  if (b >= 0) book.branches[b]!.alive--;
}

export function onDeath(world: World, slot: number): void {
  const c = world.ents.cols;
  const book = world.branches;
  const root = c.candRoot[slot]!;
  if (root !== 0) {
    const cand = book.candidates[root];
    if (cand) {
      cand.alive--;
      if (cand.alive <= 0 && !cand.pending) delete book.candidates[root];
    }
  }
  const b = c.branchId[slot]!;
  if (b >= 0) {
    book.branches[b]!.alive--;
    markExtinctUpward(world, b);
  }
}

/** Branches in the subtree rooted at `id` (itself included), as a membership mask by branch id. */
export function subtreeMask(book: BranchBook, id: number): Uint8Array {
  const mask = new Uint8Array(book.branches.length);
  if (id < 0 || id >= book.branches.length) return mask;
  mask[id] = 1;
  // Children always have larger ids than their parents, so one ascending pass suffices.
  for (let k = id + 1; k < book.branches.length; k++) {
    const p = book.branches[k]!.parentBranch;
    if (p >= 0 && mask[p]) mask[k] = 1;
  }
  return mask;
}

/** Living members of a branch and of every branch descended from it. */
export function subtreeAlive(book: BranchBook, id: number): number {
  const mask = subtreeMask(book, id);
  let total = 0;
  for (let k = 0; k < mask.length; k++) if (mask[k]) total += book.branches[k]!.alive;
  return total;
}

/**
 * A branch is extinct when neither it nor any branch descended from it has a living member. A
 * sub-branch dying out can therefore make its ancestors extinct too; each gets its own record.
 */
function markExtinctUpward(world: World, from: number): void {
  const book = world.branches;
  for (let id = from; id >= 0; id = book.branches[id]!.parentBranch) {
    const br = book.branches[id]!;
    if (br.extinctTick >= 0) continue;
    if (br.alive > 0 || subtreeAlive(book, id) > 0) return;
    br.extinctTick = world.tick;
    emit(world.events, world.counters, { tick: world.tick, type: 'branchExtinct', species: br.species, birthId: br.rootBirthId, detail: { branch: br.id } });
  }
}

/** Living qualifying members of a candidate and the deepest living generation beyond its root. */
function livingEvidence(world: World, cand: Candidate): { members: number; depth: number } {
  const c = world.ents.cols;
  let members = 0;
  let depth = -1;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1 || c.candRoot[i] !== cand.root) continue;
    members++;
    depth = Math.max(depth, c.generation[i]! - cand.rootGeneration);
  }
  return { members, depth };
}

function maybeEstablish(world: World, cand: Candidate): void {
  // Cheap necessary conditions first; the scan confirms a living member three generations deep.
  if (cand.alive < MIN_DESCENDANTS || cand.maxDepth < MIN_GENERATIONS) return;
  const ev = livingEvidence(world, cand);
  if (ev.members < MIN_DESCENDANTS || ev.depth < MIN_GENERATIONS) return;
  establish(world, cand, ev);
}

/** Short display ID: the first three hex digits of the reference genome, made unique in this dish. */
function uniqueShortId(book: BranchBook, genomeId: string): string {
  const base = shortGenomeId(genomeId);
  let same = 0;
  for (const b of book.branches) if (b.shortId === base || b.shortId.startsWith(`${base}-`)) same++;
  return same === 0 ? base : `${base}-${same + 1}`;
}

function establish(world: World, cand: Candidate, ev: { members: number; depth: number }): void {
  const book = world.branches;
  const c = world.ents.cols;
  const id = book.branches.length;
  const g = world.genomes.get(cand.rootGenome);
  const ref = world.genomes.get(cand.refGenome);
  const trait = qualifyingTrait(ref, g, sharedActiveLoci(world, cand.species, ref, g));
  const branch: Branch = {
    id,
    species: cand.species,
    rootBirthId: cand.root,
    refGenome: cand.rootGenome,
    parentBranch: cand.parentBranch,
    shortId: uniqueShortId(book, g.id),
    candidateTick: cand.firstTick,
    establishedTick: world.tick,
    extinctTick: -1,
    alive: 0,
    name: null,
    pinned: false,
    ancestorGenome: cand.refGenome,
    ...(trait ? { trait } : {}),
    ...(cand.cell !== undefined ? { rootCell: cand.cell } : {}),
    membersAtEstablish: ev.members,
    depthAtEstablish: ev.depth,
    peak: 0,
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
  branch.peak = branch.alive;
  delete book.candidates[cand.root];
  emit(world.events, world.counters, {
    tick: world.tick,
    type: 'branchEstablished',
    species: cand.species,
    birthId: cand.root,
    ...(cand.cell !== undefined ? { cell: cand.cell } : {}),
    detail: { branch: id, shortId: branch.shortId, members: branch.alive },
  });
}

// ---------------------------------------------------------------------------------------------
// Names (SPEC §8.5): "Ancestor · Descriptor · ShortID"; a player name keeps the ID visible.

/** Plain-text name: control characters become spaces, trimmed, at most 60 characters; '' → null. */
export function cleanBranchName(name: string | null): string | null {
  if (name === null) return null;
  const s = Array.from(name)
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  const clipped = Array.from(s).slice(0, BRANCH_NAME_MAX).join('').trim();
  return clipped.length > 0 ? clipped : null;
}

/** Descriptor word(s) for a recorded difference, from the world's recorded content. */
export function traitDescriptor(world: World, species: number, trait: BranchTrait | undefined | null): string {
  if (!trait) return 'Variant';
  switch (trait.kind) {
    case 'module': {
      const name = world.content.modules.find((m) => m.id === trait.module)?.name ?? trait.module;
      return trait.gained ? name : `Without ${name.charAt(0).toLowerCase()}${name.slice(1)}`;
    }
    case 'locus': {
      const def = world.content.loci[trait.locus];
      if (!def) return 'Variant';
      return trait.delta > 0 ? def.descriptorHigh : def.descriptorLow;
    }
    case 'policy':
      return trait.policy === 'weighted' ? 'Mixed feeder' : 'Ordered feeder';
    case 'weight': {
      const food = world.species[species]?.foods[trait.food] ?? 'food';
      return `${food.charAt(0).toUpperCase()}${food.slice(1)}-leaning`;
    }
  }
}

/**
 * The reference genome a branch's founder was compared with: recorded since P2.3; for older records,
 * the parent branch's reference, or on an ancestral line the introduced founder's genome (found by
 * walking retained birth records; undefined when that history was compacted).
 */
export function ancestorGenomeOf(world: World, br: Branch): number | undefined {
  if (br.ancestorGenome !== undefined) return br.ancestorGenome;
  if (br.parentBranch >= 0) return world.branches.branches[br.parentBranch]?.refGenome;
  const L = world.lineage;
  let b = br.rootBirthId;
  for (let guard = 0; guard <= L.parent.length; guard++) {
    if (b < L.base || b >= L.base + L.parent.length) return undefined;
    const parent = L.parent[b - L.base]!;
    if (parent === 0) return L.genome[b - L.base];
    b = parent;
  }
  return undefined;
}

/** Trait recorded at establishment, or recomputed for records written before P2.3. */
export function branchTrait(world: World, br: Branch): BranchTrait | null {
  if (br.trait) return br.trait;
  const anc = ancestorGenomeOf(world, br);
  if (anc === undefined) return null;
  const ref = world.genomes.get(anc);
  const g = world.genomes.get(br.refGenome);
  return qualifyingTrait(ref, g, sharedActiveLoci(world, br.species, ref, g));
}

export function generatedBranchName(world: World, br: Branch): string {
  const ancestor = world.species[br.species]?.def.name ?? 'Unknown';
  return `${ancestor} · ${traitDescriptor(world, br.species, branchTrait(world, br))} · ${br.shortId}`;
}

/** What the player sees: the generated name, or their name with the ID kept visible. */
export function displayBranchName(world: World, br: Branch): string {
  return br.name ? `${br.name} · ${br.shortId}` : generatedBranchName(world, br);
}

export type BranchState = 'established' | 'extinct';

export function branchState(br: Branch): BranchState {
  return br.extinctTick >= 0 ? 'extinct' : 'established';
}

/** Notebook edits (commands; see specimens.ts applyLineage). Return a refusal note or null. */
export function renameBranch(world: World, id: number, name: string | null): string | null {
  const br = Number.isInteger(id) ? world.branches.branches[id] : undefined;
  if (!br) return `no branch ${id}`;
  br.name = cleanBranchName(name);
  return null;
}

export function pinBranch(world: World, id: number, pinned: boolean): string | null {
  const br = Number.isInteger(id) ? world.branches.branches[id] : undefined;
  if (!br) return `no branch ${id}`;
  br.pinned = pinned;
  return null;
}
