/**
 * Birth records keyed by birthId (SPEC §6.9, §8.1). Every daughter of a division receives a new
 * birthId and records the pre-division individual as its parent; introduced founders have parent 0.
 *
 * History is bounded: records older than the most recent RETAIN births are compacted away (the
 * arrays keep a `base` offset). Nothing the simulation needs lives here — living organisms carry
 * their generation, branch and candidate data in entity columns — so compaction never changes
 * outcomes; the UI labels missing individual history as unavailable (SPEC §8.1, §12.4). Pinned
 * branches keep their birth details (CT §12.10 "birth details 10,000 recent unpinned"): the founder
 * family of every pinned branch is listed in `keep`, and compaction moves those records to `kept`
 * instead of dropping them (both absent until something is pinned, so older worlds are unchanged).
 */
import {
  ancestorGenomeOf,
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
import { MOVE_COST_PER_CELL } from './constants';
import type { FeedingPolicy, Genome } from './genome';
import { activeLoci, type Profile } from './phenotype';
import { profileOfGenome } from './profiles';
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
  /** Birth ids retained past compaction (pinned branches' founder families), ascending. */
  keep?: number[];
  /** Records retained past compaction, ascending birthId. */
  kept?: KeptRecord[];
}

/** One birth record kept after compaction because a pinned branch needs it. */
export interface KeptRecord {
  readonly birthId: number;
  readonly parent: number;
  readonly genome: number;
  readonly birthTick: number;
  readonly generation: number;
  readonly species: number;
  readonly entityId: number;
  deathTick: number;
  deathCause: number;
  readonly origin: number;
  readonly mutFlags: number;
  readonly mutLocus: number;
  readonly mutDelta: number;
  readonly mutModule: number;
}

type RecordKey = Exclude<keyof Lineage, 'base' | 'compacted' | 'keep' | 'kept'>;
const RECORD_KEYS = ['parent', 'genome', 'birthTick', 'generation', 'species', 'entityId', 'deathTick', 'deathCause', 'origin', 'mutFlags', 'mutLocus', 'mutDelta', 'mutModule'] as const satisfies readonly RecordKey[];

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

export function field(L: Lineage, key: RecordKey, birthId: number): number | undefined {
  return has(L, birthId) ? L[key][birthId - L.base] : undefined;
}

/** A record kept for a pinned branch after compaction (undefined when none). */
export function keptRecord(L: Lineage, birthId: number): KeptRecord | undefined {
  const kept = L.kept;
  if (!kept || birthId >= L.base) return undefined;
  for (const r of kept) if (r.birthId === birthId) return r;
  return undefined;
}

/** A record value from the retained arrays or, once compacted, from a pinned branch's kept records. */
export function recordField(L: Lineage, key: RecordKey, birthId: number): number | undefined {
  return field(L, key, birthId) ?? keptRecord(L, birthId)?.[key];
}

export function recordDeath(L: Lineage, birthId: number, tick: number, cause: number): void {
  if (!has(L, birthId)) {
    const r = keptRecord(L, birthId);
    if (r) {
      r.deathTick = tick;
      r.deathCause = cause;
    }
    return;
  }
  L.deathTick[birthId - L.base] = tick;
  L.deathCause[birthId - L.base] = cause;
}

/** A division ends the parent's individual record (it continues as two new birth records). */
export function recordDivisionEnd(L: Lineage, birthId: number, tick: number): void {
  recordDeath(L, birthId, tick, -1); // -1 = ended by division, not death
}

/**
 * Drop the oldest records beyond LINEAGE_RETAIN once the arrays reach COMPACT_AT (deterministic).
 * Records listed in `keep` (pinned branches' founder families) move to `kept` instead.
 */
export function compactLineage(L: Lineage): number {
  const n = L.parent.length;
  if (n < COMPACT_AT) return 0;
  const drop = n - LINEAGE_RETAIN;
  if (L.keep) {
    for (const b of L.keep) {
      if (b < L.base || b >= L.base + drop) continue;
      const k = b - L.base;
      const rec: KeptRecord = {
        birthId: b,
        parent: L.parent[k]!,
        genome: L.genome[k]!,
        birthTick: L.birthTick[k]!,
        generation: L.generation[k]!,
        species: L.species[k]!,
        entityId: L.entityId[k]!,
        deathTick: L.deathTick[k]!,
        deathCause: L.deathCause[k]!,
        origin: L.origin[k]!,
        mutFlags: L.mutFlags[k]!,
        mutLocus: L.mutLocus[k]!,
        mutDelta: L.mutDelta[k]!,
        mutModule: L.mutModule[k]!,
      };
      (L.kept ??= []).push(rec);
    }
  }
  for (const key of RECORD_KEYS) L[key].splice(0, drop);
  L.base += drop;
  L.compacted += drop;
  return drop;
}

/** Children of a record, from the retained arrays and the kept records (at most two per division). */
function recordChildren(L: Lineage, birthId: number): number[] {
  const out: number[] = [];
  for (const r of L.kept ?? []) if (r.parent === birthId && out.length < 2) out.push(r.birthId);
  for (const b of childrenOf(L, birthId)) if (out.length < 2 && !out.includes(b)) out.push(b);
  return out;
}

/** The founder family a pinned branch keeps: its founder, the founder's parent, siblings and children. */
function familyIds(L: Lineage, root: number): number[] {
  const ids = [root];
  const parent = recordField(L, 'parent', root) ?? 0;
  if (parent > 0) ids.push(parent, ...recordChildren(L, parent));
  ids.push(...recordChildren(L, root));
  return ids;
}

/**
 * Recompute which birth records outlive compaction: the founder families of every pinned branch
 * (called after each pin/unpin command). Kept records no pinned branch needs any more are released.
 */
export function retainPinnedRecords(world: World): void {
  const L = world.lineage;
  const ids: number[] = [];
  for (const br of world.branches.branches) {
    if (!br.pinned) continue;
    for (const b of familyIds(L, br.rootBirthId)) if (!ids.includes(b)) ids.push(b);
  }
  ids.sort((a, b) => a - b);
  if (ids.length > 0) L.keep = ids;
  else delete L.keep;
  if (L.kept) {
    const kept = L.kept.filter((r) => ids.includes(r.birthId));
    if (kept.length > 0) L.kept = kept;
    else delete L.kept;
  }
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
/** At most this many living members are listed or ringed at once (CT §12.10 "descendants highlighted ≤ 200"). */
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

/** A module named by a branch's difference, with its recorded costs (world's versioned registry). */
export interface LineageModuleCost {
  readonly id: string;
  readonly name: string;
  readonly surchargePerSecond: number;
  readonly params: Readonly<Record<string, number>>;
}

/**
 * The game-rule numbers of one genome, taken from the shared phenotype function (profileOfGenome), so
 * what the family tree says a branch does can never diverge from what the simulation does (D06).
 */
export interface LineageProfile {
  /** Cells per second at full motility (0 for non-swimmers). */
  readonly speed: number;
  /** Energy per cell moved (MOVE_COST_PER_CELL × motility factor). */
  readonly moveCostPerCell: number;
  /** Intake ceiling, carbon per second. */
  readonly intake: number;
  /** Maintenance per second, module surcharges included. */
  readonly maintenance: number;
  /** Extra upkeep per second paid besides maintenance (e.g. a reserve chamber). */
  readonly upkeep: number;
  /** Food sensing radius in cells. */
  readonly sensing: number;
  /** Minimum age before it can split, seconds. */
  readonly minDivisionAge: number;
  /** Energy one split costs. */
  readonly divisionCost: number;
  readonly energyCap: number;
  readonly ph: readonly [number, number];
  readonly salinity: readonly [number, number];
  readonly warmth: readonly [number, number];
  /** Seconds without usable food before it starts resting (null when it cannot rest). */
  readonly restAfter: number | null;
  readonly policy: FeedingPolicy;
  readonly foods: readonly string[];
  readonly weights: readonly number[] | null;
  readonly modules: readonly string[];
}

/**
 * Module cost parameters, in the order they are quoted (CT §7.1 "costs beyond 0.02 E/s surcharge").
 * A test checks that every cost-like parameter in the module content is listed here.
 */
export const MODULE_COST_KEYS = [
  'upkeepPerSecond',
  'emitCost',
  'glowCost',
  'prepareCost',
  'restMaintenance',
  'wakeCost',
  'attachedUpkeep',
  'moveCostFactor',
  'energyPerCarbon',
  'energyPerMineral',
  'linkCost',
  'perLinkUpkeep',
  'settleCost',
  'adultUpkeep',
  'bondCost',
  'bondUpkeep',
  'creationCost',
] as const;
export type ModuleCostKey = (typeof MODULE_COST_KEYS)[number];

/** A module one genome carries and the other does not, with every cost the world's registry records. */
export interface LineageModuleChange {
  readonly id: string;
  readonly name: string;
  /** true: the branch carries it and its ancestor did not; false: the reverse. */
  readonly gained: boolean;
  /**
   * The surcharge the carrier's profile actually charges for it, energy per second: the registry rate
   * times the carrier's inherited feeding × sensing multiplier (deriveProfile), so a branch with
   * feeding 60 pays 0.021 for a 0.02 module. The carrier is the branch when gained, else the ancestor.
   */
  readonly surchargePerSecond: number;
  readonly costs: readonly { readonly key: ModuleCostKey; readonly value: number }[];
}

/** Both profiles and the module differences behind a branch's "Game rule:" lines. */
export interface LineageRules {
  readonly ancestor: LineageProfile;
  readonly branch: LineageProfile;
  readonly modules: readonly LineageModuleChange[];
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
  /** Recorded costs of the module the difference names (null for other differences). */
  readonly module: LineageModuleCost | null;
  /** Reference values of the named locus: the ancestor's and the branch founder's (null otherwise). */
  readonly locusValues: { readonly ancestor: number; readonly branch: number } | null;
  /** The two genomes' game-rule numbers (null when the ancestor genome is not recorded). */
  readonly rules: LineageRules | null;
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
  readonly status: 'alive' | 'divided' | 'died';
  readonly endTick: number;
  readonly deathCause: number;
  readonly origin: number;
  readonly mutFlags: number;
  readonly mutLocus: number;
  readonly mutDelta: number;
  readonly mutModule: string | null;
}

export interface LineageMember {
  readonly birthId: number;
  readonly entityId: number;
  readonly x: number;
  readonly y: number;
  readonly generation: number;
  readonly branch: number;
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
  readonly members: readonly LineageMember[];
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
  // Retained records first, then those kept for a pinned branch after compaction.
  const get = (key: (typeof RECORD_KEYS)[number]) => recordField(L, key, birthId);
  const end = get('deathTick');
  if (end === undefined) return null;
  const mod = get('mutModule')!;
  const cause = get('deathCause')!;
  return {
    birthId,
    birthTick: get('birthTick')!,
    generation: get('generation')!,
    status: end < 0 ? 'alive' : cause === -1 ? 'divided' : 'died',
    endTick: end,
    deathCause: cause,
    origin: get('origin')!,
    mutFlags: get('mutFlags')!,
    mutLocus: get('mutLocus')!,
    mutDelta: get('mutDelta')!,
    mutModule: mod >= 0 ? (world.content.modules[mod]?.id ?? null) : null,
  };
}

function ancestorIndex(world: World, br: Branch): number {
  return ancestorGenomeOf(world, br) ?? -1;
}

function profileSummary(p: Profile): LineageProfile {
  return {
    speed: p.speed,
    moveCostPerCell: p.speed > 0 ? MOVE_COST_PER_CELL * p.motilityFactor : 0,
    intake: p.q,
    maintenance: p.m,
    upkeep: p.upkeep,
    sensing: p.sensing,
    minDivisionAge: p.minDivisionAge,
    divisionCost: p.divisionCost,
    energyCap: p.energyCap,
    ph: [p.ph[0], p.ph[1]],
    salinity: [p.salinity[0], p.salinity[1]],
    warmth: [p.warmth[0], p.warmth[1]],
    restAfter: p.dormancy ? p.dormancyTriggerSeconds : null,
    policy: p.policy,
    foods: [...p.foods],
    weights: p.weights ? [...p.weights] : null,
    modules: [...p.modules],
  };
}

/**
 * What one carried module's surcharge costs under a profile: deriveProfile charges the sum of the
 * carried modules' registry rates times the profile's multiplier (Profile.surcharge), so each module's
 * share is its rate times that same multiplier.
 */
function chargedSurcharge(world: World, carrier: Profile, id: string): number {
  const rate = world.modules[id]?.surcharge ?? 0;
  let raw = 0;
  for (const m of carrier.modules) raw += world.modules[m]?.surcharge ?? 0;
  return raw > 0 ? rate * (carrier.surcharge / raw) : rate;
}

function moduleChange(world: World, id: string, gained: boolean, carrier: Profile): LineageModuleChange {
  // Numbers from the world's recorded module registry, the surcharge as the carrier's profile charges
  // it; the name from its recorded content.
  const rt = world.modules[id];
  const name = world.content.modules.find((m) => m.id === id)?.name ?? id;
  const costs: { key: ModuleCostKey; value: number }[] = [];
  for (const key of MODULE_COST_KEYS) {
    const v = rt?.params[key];
    if (v !== undefined && Number.isFinite(v)) costs.push({ key, value: v });
  }
  return { id, name, gained, surchargePerSecond: chargedSurcharge(world, carrier, id), costs };
}

/** Game-rule numbers of the ancestor's and the branch's reference genomes (read-only; profiles are a derived cache). */
function rulesOf(world: World, br: Branch, anc: number): LineageRules | null {
  if (anc < 0) return null;
  try {
    const a = profileOfGenome(world, anc, br.species);
    const b = profileOfGenome(world, br.refGenome, br.species);
    const modules: LineageModuleChange[] = [];
    for (const m of b.modules) if (!a.modules.includes(m)) modules.push(moduleChange(world, m, true, b));
    for (const m of a.modules) if (!b.modules.includes(m)) modules.push(moduleChange(world, m, false, a));
    return { ancestor: profileSummary(a), branch: profileSummary(b), modules };
  } catch {
    return null;
  }
}

function branchRow(world: World, br: Branch): LineageBranchRow {
  const trait = branchTrait(world, br);
  let module: LineageModuleCost | null = null;
  if (trait?.kind === 'module') {
    const def = world.content.modules.find((m) => m.id === trait.module);
    if (def) module = { id: def.id, name: def.name, surchargePerSecond: def.surchargePerSecond, params: { ...def.params } };
  }
  let locusValues: LineageBranchRow['locusValues'] = null;
  const anc = ancestorIndex(world, br);
  if (trait?.kind === 'locus' && anc >= 0) {
    locusValues = { ancestor: world.genomes.get(anc).loci[trait.locus]!, branch: world.genomes.get(br.refGenome).loci[trait.locus]! };
  }
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
    module,
    locusValues,
    rules: rulesOf(world, br, anc),
  };
}

function median(sorted: readonly number[]): number {
  const n = sorted.length;
  return n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

function policyText(x: Genome): string {
  return x.policy === 'weighted' && x.weights ? `weighted ${x.weights.map((w) => w.toFixed(2)).join(' / ')}` : 'ordered';
}

function detailOf(world: World, br: Branch): LineageDetail {
  const book = world.branches;
  const c = world.ents.cols;
  const sp = world.species[br.species]!;
  const g = world.genomes.get(br.refGenome);
  const ancIdx = ancestorIndex(world, br);
  const anc = ancIdx >= 0 ? world.genomes.get(ancIdx) : null;
  const shared = anc ? sharedActiveLoci(world, br.species, anc, g) : activeLoci(sp, g);
  const mask = subtreeMask(book, br.id);
  const all: LineageMember[] = [];
  const values: number[][] = g.loci.map(() => []);
  let dMin = Infinity;
  let dMax = -Infinity;
  const rootGen = br.rootGeneration ?? recordField(world.lineage, 'generation', br.rootBirthId);
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const b = c.branchId[i]!;
    if (b < 0 || !mask[b]) continue;
    const mg = world.genomes.get(c.genome[i]!);
    const act = activeLoci(sp, mg);
    for (let l = 0; l < mg.loci.length; l++) if (act[l]) values[l]!.push(mg.loci[l]!);
    if (rootGen !== undefined) {
      const d = c.generation[i]! - rootGen;
      dMin = Math.min(dMin, d);
      dMax = Math.max(dMax, d);
    }
    all.push({ birthId: c.birthId[i]!, entityId: c.entityId[i]!, x: c.x[i]!, y: c.y[i]!, generation: c.generation[i]!, branch: b });
  }
  all.sort((a, b) => a.birthId - b.birthId);
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
  const parentId = recordField(L, 'parent', br.rootBirthId) ?? 0;
  const root = recordRow(world, br.rootBirthId);
  const parent = parentId > 0 ? recordRow(world, parentId) : null;
  const siblings = parentId > 0 && parent ? recordChildren(L, parentId).filter((b) => b !== br.rootBirthId).map((b) => recordRow(world, b)!) : [];
  const children = root ? recordChildren(L, br.rootBirthId).map((b) => recordRow(world, b)!) : [];
  const subBranches: number[] = [];
  for (const other of book.branches) if (other.parentBranch === br.id) subBranches.push(other.id);
  return {
    branch: br.id,
    // On an ancestral line the reference is the one introduced founder genome of that line.
    ancestorLabel: br.parentBranch >= 0 ? displayBranchName(world, book.branches[br.parentBranch]!) : `The ${sp.def.name} founder of this line`,
    ancestorGenomeId: anc ? anc.id : null,
    branchGenomeId: g.id,
    compare,
    modules: { ancestor: anc ? [...anc.modules] : [], branch: [...g.modules] },
    policy: { ancestor: anc ? policyText(anc) : 'ordered', branch: policyText(g) },
    family: { root, parent, siblings, children, historyIncomplete: root === null || (parentId > 0 && parent === null) },
    members: all.slice(0, LINEAGE_MEMBERS_MAX),
    livingTotal: all.length,
    depth: all.length > 0 && rootGen !== undefined ? { min: dMin, max: dMax } : null,
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
  const variation: { species: number; parentBranch: number; lines: number; living: number; deepest: number }[] = [];
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
    row.lines++;
    row.living += cand.alive;
    row.deepest = Math.max(row.deepest, cand.maxDepth);
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
    specimens: (book.specimens ?? []).map((s) => ({ ...s, label: `Specimen ${s.id} · ${s.branchLabel}` })),
    focusBranch,
  };
}

/**
 * Per-organism marks for the renderer, in snapshot order (ascending slot, living only — the order of
 * packEntities): the trait band of `locus` (BAND_NONE when off or inactive for that organism) plus
 * MARK_MEMBER for living members of `branch` and its sub-branches. Also the count in each band.
 */
export function packLineageMarks(world: World, locus: number | null, branch: number | null): { marks: Uint8Array; bandCounts: number[]; inactive: number; members: number } {
  const c = world.ents.cols;
  const marks = new Uint8Array(Math.max(1, world.ents.count));
  const bandCounts = new Array<number>(TRAIT_BANDS.length).fill(0);
  const mask = branch !== null && branch >= 0 ? subtreeMask(world.branches, branch) : null;
  const useLocus = locus !== null && Number.isInteger(locus) && locus >= 0 && locus < world.content.loci.length ? locus : null;
  // Whether the locus acts depends only on species and genome: cache per genome index (0 unknown, 1 no, 2 yes).
  const actCache = useLocus !== null ? new Uint8Array(world.genomes.size) : null;
  let inactive = 0;
  let members = 0;
  let k = 0;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    let m = BAND_NONE;
    if (useLocus !== null && actCache) {
      const gi = c.genome[i]!;
      const g = world.genomes.get(gi);
      if (actCache[gi] === 0) actCache[gi] = activeLoci(world.species[c.species[i]!]!, g)[useLocus] ? 2 : 1;
      if (actCache[gi] === 2) {
        m = bandOf(g.loci[useLocus]!);
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
