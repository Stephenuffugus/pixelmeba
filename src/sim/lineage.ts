/**
 * Birth records keyed by birthId (SPEC §6.9, §8.1). Every daughter of a division receives a new
 * birthId and records the pre-division individual as its parent; introduced founders have parent 0.
 *
 * History is bounded: records older than the most recent RETAIN births are compacted away (the
 * arrays keep a `base` offset). Nothing the simulation needs lives here — living organisms carry
 * their generation, branch and candidate data in entity columns — so compaction never changes
 * outcomes; the UI labels missing individual history as unavailable (SPEC §8.1, §12.4).
 */
import {
  branchState,
  branchTrait,
  displayBranchName,
  generatedBranchName,
  sharedActiveLoci,
  subtreeAlive,
  subtreeMask,
  traitDescriptor,
  type Branch,
  type BranchState,
  type BranchTrait,
} from './branches';
import type { Genome } from './genome';
import { activeLoci } from './phenotype';
import type { Specimen } from './specimens';
import type { World } from './world';
export const INTRODUCED_PARENT = 0;
export const LINEAGE_RETAIN = 10000;
const COMPACT_AT = 12000;

export interface Lineage {
  /** birthId of the first retained record; lower ids are compacted. */
  base: number;
  parent: number[];
  genome: number[];
  birthTick: number[];
  generation: number[];
  species: number[];
  entityId: number[];
  deathTick: number[];
  deathCause: number[];
  /** Origin: 0 = born, 1 = introduced by recipe/tool, 2 = present at creation (seeded genome). */
  origin: number[];
  /** Mutation descriptor flags (MUT_* in mutation.ts), locus, delta and module index. */
  mutFlags: number[];
  mutLocus: number[];
  mutDelta: number[];
  mutModule: number[];
  /** Records ever compacted (for "history incomplete" labels). */
  compacted: number;
}

export function createLineage(): Lineage {
  return {
    base: 1,
    parent: [],
    genome: [],
    birthTick: [],
    generation: [],
    species: [],
    entityId: [],
    deathTick: [],
    deathCause: [],
    origin: [],
    mutFlags: [],
    mutLocus: [],
    mutDelta: [],
    mutModule: [],
    compacted: 0,
  };
}

export interface BirthRecordInput {
  readonly parent: number;
  readonly genome: number;
  readonly tick: number;
  readonly generation: number;
  readonly species: number;
  readonly entityId: number;
  readonly origin: number;
  readonly mutFlags?: number;
  readonly mutLocus?: number;
  readonly mutDelta?: number;
  readonly mutModule?: number;
}

export function recordBirth(L: Lineage, birthId: number, rec: BirthRecordInput): void {
  const expected = L.base + L.parent.length;
  if (birthId !== expected) throw new Error(`lineage: birthId ${birthId} out of sequence (expected ${expected})`);
  if (rec.parent === birthId) throw new Error('lineage: self-parent link');
  L.parent.push(rec.parent);
  L.genome.push(rec.genome);
  L.birthTick.push(rec.tick);
  L.generation.push(rec.generation);
  L.species.push(rec.species);
  L.entityId.push(rec.entityId);
  L.deathTick.push(-1);
  L.deathCause.push(0);
  L.origin.push(rec.origin);
  L.mutFlags.push(rec.mutFlags ?? 0);
  L.mutLocus.push(rec.mutLocus ?? -1);
  L.mutDelta.push(rec.mutDelta ?? 0);
  L.mutModule.push(rec.mutModule ?? -1);
}

export function has(L: Lineage, birthId: number): boolean {
  return birthId >= L.base && birthId < L.base + L.parent.length;
}

export function field(L: Lineage, key: Exclude<keyof Lineage, 'base' | 'compacted'>, birthId: number): number | undefined {
  return has(L, birthId) ? L[key][birthId - L.base] : undefined;
}

export function recordDeath(L: Lineage, birthId: number, tick: number, cause: number): void {
  if (!has(L, birthId)) return;
  L.deathTick[birthId - L.base] = tick;
  L.deathCause[birthId - L.base] = cause;
}

/** A division ends the parent's individual record (it continues as two new birth records). */
export function recordDivisionEnd(L: Lineage, birthId: number, tick: number): void {
  if (!has(L, birthId)) return;
  L.deathTick[birthId - L.base] = tick;
  L.deathCause[birthId - L.base] = -1; // -1 = ended by division, not death
}

/** Drop the oldest records beyond LINEAGE_RETAIN once the arrays reach COMPACT_AT (deterministic). */
export function compactLineage(L: Lineage): number {
  const n = L.parent.length;
  if (n < COMPACT_AT) return 0;
  const drop = n - LINEAGE_RETAIN;
  for (const key of ['parent', 'genome', 'birthTick', 'generation', 'species', 'entityId', 'deathTick', 'deathCause', 'origin', 'mutFlags', 'mutLocus', 'mutDelta', 'mutModule'] as const) {
    L[key].splice(0, drop);
  }
  L.base += drop;
  L.compacted += drop;
  return drop;
}

/** Children of a birth record still retained (at most two per division). */
export function childrenOf(L: Lineage, birthId: number): number[] {
  const out: number[] = [];
  const start = Math.max(0, birthId + 1 - L.base);
  for (let k = start; k < L.parent.length && out.length < 2; k++) if (L.parent[k] === birthId) out.push(L.base + k);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Lineage panel queries (SPEC §8.5, UX §5.5). Pure reads of recorded state for the worker: no
// randomness, no mutation, never called by the simulation itself.

/** Trait overlay bands over a locus value (0–100): far below / below / near 50 / above / far above. */
export const TRAIT_BANDS: readonly (readonly [number, number])[] = [
  [0, 39],
  [40, 46],
  [47, 53],
  [54, 60],
  [61, 100],
];
/** Mark value for "no band" (no trait overlay, or the locus is not active for that organism). */
export const BAND_NONE = 7;
/** Mark bit: a living member of the highlighted branch or of a branch descended from it. */
export const MARK_MEMBER = 8;
/** At most this many living members are listed or ringed at once (CT §12.10). */
export const LINEAGE_MEMBERS_MAX = 200;

export function bandOf(value: number): number {
  for (let b = 0; b < TRAIT_BANDS.length; b++) if (value <= TRAIT_BANDS[b]![1]) return b;
  return TRAIT_BANDS.length - 1;
}

export interface LineageLocus {
  readonly index: number;
  readonly name: string;
  readonly low: string;
  readonly high: string;
}

export interface LineageSpeciesRow {
  readonly idx: number;
  readonly id: string;
  readonly name: string;
  /** Living members of its ancestral line (not in any named branch). */
  readonly lineLiving: number;
  readonly living: number;
}

export interface LineageBranchRow {
  readonly id: number;
  readonly species: number;
  readonly name: string;
  readonly generatedName: string;
  readonly customName: string | null;
  readonly shortId: string;
  readonly state: BranchState;
  readonly pinned: boolean;
  readonly parentBranch: number;
  /** Own members alive, and members of it plus every branch descended from it. */
  readonly alive: number;
  readonly living: number;
  readonly peak: number;
  readonly candidateTick: number;
  readonly establishedTick: number;
  readonly extinctTick: number;
  readonly rootBirthId: number;
  readonly rootCell: number;
  readonly membersAtEstablish: number;
  readonly depthAtEstablish: number;
  readonly trait: BranchTrait | null;
  readonly descriptor: string;
}

/** Live candidates ("variation observed"), summarized per ancestral line or branch. */
export interface LineageVariationRow {
  readonly species: number;
  readonly parentBranch: number;
  readonly lines: number;
  readonly living: number;
  readonly deepest: number;
}

export interface LineageCompareRow {
  readonly locus: number;
  /** Active in both the ancestor's and the branch's reference genome. */
  readonly active: boolean;
  readonly ancestor: number;
  readonly branch: number;
  /** Living members of the branch (and its sub-branches) whose locus is active: range and median. */
  readonly living: { readonly n: number; readonly min: number; readonly median: number; readonly max: number } | null;
}

export interface LineageRecordRow {
  readonly birthId: number;
  readonly birthTick: number;
  readonly generation: number;
  /** 'alive' | 'divided' | 'died' */
  readonly status: 'alive' | 'divided' | 'died';
  readonly endTick: number;
  readonly deathCause: number;
  readonly origin: number;
  readonly mutFlags: number;
  readonly mutLocus: number;
  readonly mutDelta: number;
  readonly mutModule: string | null;
}

export interface LineageDetail {
  readonly branch: number;
  readonly ancestorLabel: string;
  readonly ancestorGenomeId: string | null;
  readonly branchGenomeId: string;
  readonly compare: readonly LineageCompareRow[];
  readonly modules: { readonly ancestor: readonly string[]; readonly branch: readonly string[] };
  readonly policy: { readonly ancestor: string; readonly branch: string };
  /** The branch founder's recorded family (null entries when history was compacted). */
  readonly family: {
    readonly root: LineageRecordRow | null;
    readonly parent: LineageRecordRow | null;
    readonly siblings: readonly LineageRecordRow[];
    readonly children: readonly LineageRecordRow[];
    readonly historyIncomplete: boolean;
  };
  /** Living members (subtree), lowest birthId first, at most LINEAGE_MEMBERS_MAX. */
  readonly members: readonly { readonly birthId: number; readonly entityId: number; readonly x: number; readonly y: number; readonly generation: number; readonly branch: number }[];
  readonly livingTotal: number;
  /** Generations beyond the branch founder spanned by living members (null when none live). */
  readonly depth: { readonly min: number; readonly max: number } | null;
  readonly subBranches: readonly number[];
}

export interface LineageSpecimenRow extends Specimen {
  readonly label: string;
}

export interface LineageAnswer {
  readonly tick: number;
  readonly loci: readonly LineageLocus[];
  readonly species: readonly LineageSpeciesRow[];
  readonly branches: readonly LineageBranchRow[];
  readonly variation: readonly LineageVariationRow[];
  readonly selected: LineageDetail | null;
  readonly specimens: readonly LineageSpecimenRow[];
  /** Branch of the organism asked about (-1 = its ancestral line; null when not asked or not alive). */
  readonly focusBranch: number | null;
}

function recordRow(world: World, birthId: number): LineageRecordRow | null {
  const L = world.lineage;
  if (!has(L, birthId)) return null;
  const k = birthId - L.base;
  const end = L.deathTick[k]!;
  const mod = L.mutModule[k]!;
  return {
    birthId,
    birthTick: L.birthTick[k]!,
    generation: L.generation[k]!,
    status: end < 0 ? 'alive' : L.deathCause[k] === -1 ? 'divided' : 'died',
    endTick: end,
    deathCause: L.deathCause[k]!,
    origin: L.origin[k]!,
    mutFlags: L.mutFlags[k]!,
    mutLocus: L.mutLocus[k]!,
    mutDelta: L.mutDelta[k]!,
    mutModule: mod >= 0 ? (world.content.modules[mod]?.id ?? null) : null,
  };
}

function branchRow(world: World, br: Branch): LineageBranchRow {
  const trait = branchTrait(world, br);
  return {
    id: br.id,
    species: br.species,
    name: displayBranchName(world, br),
    generatedName: generatedBranchName(world, br),
    customName: br.name,
    shortId: br.shortId,
    state: branchState(br),
    pinned: br.pinned,
    parentBranch: br.parentBranch,
    alive: br.alive,
    living: subtreeAlive(world.branches, br.id),
    peak: br.peak ?? br.alive,
    candidateTick: br.candidateTick,
    establishedTick: br.establishedTick,
    extinctTick: br.extinctTick,
    rootBirthId: br.rootBirthId,
    rootCell: br.rootCell ?? -1,
    membersAtEstablish: br.membersAtEstablish ?? 0,
    depthAtEstablish: br.depthAtEstablish ?? 0,
    trait,
    descriptor: traitDescriptor(world, br.species, trait),
  };
}

function median(sorted: readonly number[]): number {
  const n = sorted.length;
  return n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

function detailOf(world: World, br: Branch): LineageDetail {
  const book = world.branches;
  const c = world.ents.cols;
  const sp = world.species[br.species]!;
  const g = world.genomes.get(br.refGenome);
  const ancIdx = br.ancestorGenome ?? (br.parentBranch >= 0 ? book.branches[br.parentBranch]!.refGenome : -1);
  const anc = ancIdx >= 0 ? world.genomes.get(ancIdx) : null;
  const shared = anc ? sharedActiveLoci(world, br.species, anc, g) : activeLoci(sp, g);
  const mask = subtreeMask(book, br.id);
  const members: { birthId: number; entityId: number; x: number; y: number; generation: number; branch: number }[] = [];
  const values: number[][] = g.loci.map(() => []);
  let livingTotal = 0;
  let dMin = Infinity;
  let dMax = -Infinity;
  const rootGen = field(world.lineage, 'generation', br.rootBirthId);
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const b = c.branchId[i]!;
    if (b < 0 || !mask[b]) continue;
    livingTotal++;
    const mg = world.genomes.get(c.genome[i]!);
    const act = activeLoci(sp, mg);
    for (let l = 0; l < mg.loci.length; l++) if (act[l]) values[l]!.push(mg.loci[l]!);
    if (rootGen !== undefined) {
      const d = c.generation[i]! - rootGen;
      dMin = Math.min(dMin, d);
      dMax = Math.max(dMax, d);
    }
    if (members.length < LINEAGE_MEMBERS_MAX) members.push({ birthId: c.birthId[i]!, entityId: c.entityId[i]!, x: c.x[i]!, y: c.y[i]!, generation: c.generation[i]!, branch: b });
  }
  members.sort((a, b) => a.birthId - b.birthId);
  const compare: LineageCompareRow[] = g.loci.map((v, l) => {
    const vals = values[l]!.sort((a, b) => a - b);
    return {
      locus: l,
      active: shared[l]!,
      ancestor: anc ? anc.loci[l]! : 50,
      branch: v,
      living: vals.length > 0 ? { n: vals.length, min: vals[0]!, median: median(vals), max: vals[vals.length - 1]! } : null,
    };
  });
  const L = world.lineage;
  const parentId = field(L, 'parent', br.rootBirthId) ?? 0;
  const root = recordRow(world, br.rootBirthId);
  const parent = parentId > 0 ? recordRow(world, parentId) : null;
  const siblings = parentId > 0 ? childrenOf(L, parentId).filter((b) => b !== br.rootBirthId).map((b) => recordRow(world, b)!) : [];
  const children = root ? childrenOf(L, br.rootBirthId).map((b) => recordRow(world, b)!) : [];
  const subBranches: number[] = [];
  for (const other of book.branches) if (other.parentBranch === br.id) subBranches.push(other.id);
  const policyText = (x: Genome) => (x.policy === 'weighted' && x.weights ? `weighted ${x.weights.map((w) => w.toFixed(2)).join(' / ')}` : 'ordered');
  return {
    branch: br.id,
    ancestorLabel: br.parentBranch >= 0 ? displayBranchName(world, book.branches[br.parentBranch]!) : `${sp.def.name} founders`,
    ancestorGenomeId: anc ? anc.id : null,
    branchGenomeId: g.id,
    compare,
    modules: { ancestor: anc ? [...anc.modules] : [], branch: [...g.modules] },
    policy: { ancestor: anc ? policyText(anc) : 'ordered', branch: policyText(g) },
    family: { root, parent, siblings, children, historyIncomplete: root === null || (parentId > 0 && parent === null) },
    members,
    livingTotal,
    depth: livingTotal > 0 && rootGen !== undefined ? { min: dMin, max: dMax } : null,
    subBranches,
  };
}

/** Everything the lineage panel shows, plus detail for one branch (or the branch of one organism). */
export function buildLineage(world: World, opts: { readonly branch?: number | null; readonly birthId?: number | null } = {}): LineageAnswer {
  const book = world.branches;
  const c = world.ents.cols;
  const lineLiving = new Array<number>(world.species.length).fill(0);
  const living = new Array<number>(world.species.length).fill(0);
  let focusBranch: number | null = null;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const s = c.species[i]!;
    living[s]!++;
    if (c.branchId[i]! < 0) lineLiving[s]!++;
    if (opts.birthId !== undefined && opts.birthId !== null && c.birthId[i] === opts.birthId) focusBranch = c.branchId[i]!;
  }
  const variation: LineageVariationRow[] = [];
  const roots = Object.keys(book.candidates)
    .map(Number)
    .sort((a, b) => a - b);
  for (const r of roots) {
    const cand = book.candidates[r]!;
    if (cand.alive <= 0) continue;
    let row = variation.find((v) => v.species === cand.species && v.parentBranch === cand.parentBranch);
    if (!row) {
      row = { species: cand.species, parentBranch: cand.parentBranch, lines: 0, living: 0, deepest: 0 };
      variation.push(row);
    }
    const m = row as { lines: number; living: number; deepest: number };
    m.lines++;
    m.living += cand.alive;
    m.deepest = Math.max(m.deepest, cand.maxDepth);
  }
  const want = opts.branch ?? (focusBranch !== null && focusBranch >= 0 ? focusBranch : null);
  const sel = want !== null && want >= 0 ? book.branches[want] : undefined;
  return {
    tick: world.tick,
    loci: world.content.loci.map((l) => ({ index: l.index, name: l.name, low: l.descriptorLow, high: l.descriptorHigh })),
    species: world.species.map((s, idx) => ({ idx, id: s.id, name: s.def.name, lineLiving: lineLiving[idx]!, living: living[idx]! })),
    branches: book.branches.map((b) => branchRow(world, b)),
    variation,
    selected: sel ? detailOf(world, sel) : null,
    specimens: book.specimens.map((s) => ({ ...s, label: `Specimen ${s.id} · ${s.branchLabel}` })),
    focusBranch,
  };
}

/**
 * Per-organism marks for the renderer, in snapshot order (ascending slot, living only): the trait
 * band of `locus` (BAND_NONE when off or inactive for that organism) plus MARK_MEMBER for living
 * members of `branch` and its sub-branches. Also the count of organisms in each band.
 */
export function packLineageMarks(world: World, locus: number | null, branch: number | null): { marks: Uint8Array; bandCounts: number[]; inactive: number; members: number } {
  const c = world.ents.cols;
  const marks = new Uint8Array(Math.max(1, world.ents.count));
  const bandCounts = new Array<number>(TRAIT_BANDS.length).fill(0);
  const mask = branch !== null && branch >= 0 ? subtreeMask(world.branches, branch) : null;
  let inactive = 0;
  let members = 0;
  let k = 0;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    let m = BAND_NONE;
    if (locus !== null) {
      const g = world.genomes.get(c.genome[i]!);
      if (activeLoci(world.species[c.species[i]!]!, g)[locus]) {
        m = bandOf(g.loci[locus]!);
        bandCounts[m]!++;
      } else inactive++;
    }
    const b = c.branchId[i]!;
    if (mask && b >= 0 && mask[b]) {
      m |= MARK_MEMBER;
      members++;
    }
    marks[k++] = m;
  }
  return { marks, bandCounts, inactive, members };
}
