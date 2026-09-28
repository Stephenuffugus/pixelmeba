/**
 * Specimens and the notebook side of branches (SPEC §8.1, §8.5; D03 "Saving a specimen stores its
 * genome and ancestry summary. Spawning it later uses the normal tool inventory ledger and is
 * recorded as an external introduction").
 *
 * Everything here runs as a command (kind 'lineage') at stage 1, so it is in the command log, is
 * replayed exactly and is saved with the world:
 *   • rename / pin a branch — notebook labels only (a pin also keeps its founder family's birth records);
 *   • save a specimen — records a genome that already exists in this dish (the genome table keeps
 *     every genome it ever held) plus a short ancestry summary;
 *   • spawn a specimen — an external introduction exactly like Add Life: founder inventories, logged
 *     as an input (`introduce:specimen`), a new ancestral line (branch -1, generation 0, origin
 *     "introduced"). A spawned organism is never counted as a member of the branch it came from, so
 *     an extinct branch stays extinct and nothing claims uninterrupted descent.
 * Specimens live inside the world (saved, exported and duplicated with it), so a spawn is replayable
 * from the command log alone. Placement uses no randomness: eligible cells in the footprint nearest
 * the tapped point first (then lower cell index), round-robin, skipping cells at soft capacity.
 * Organism jitter comes from introduceOrganism's existing per-birthId stream.
 */
import { displayBranchName, pinBranch, renameBranch } from './branches';
import type { CommandResult, introduceOrganism } from './commands';
import { CELL_SOFT_CAPACITY, GRID_W } from './constants';
import { brushCells } from './grid';
import { field, retainPinnedRecords } from './lineage';
import { validateModuleSet } from './modules';
import { canOccupy } from './movement';
import type { World } from './world';

export interface SpecimenAncestor {
  readonly branch: number;
  readonly shortId: string;
}

export interface Specimen {
  /** 1, 2, 3… in save order within this dish. */
  readonly id: number;
  /** Genome table index (retained: the table never drops a genome) and its content address. */
  readonly genome: number;
  readonly genomeId: string;
  readonly species: number;
  readonly speciesId: string;
  readonly savedTick: number;
  /** Saved from a branch (its reference genome) or from one living organism. */
  readonly from: 'branch' | 'organism';
  /** The branch root's birthId, or the organism's birthId. */
  readonly sourceBirthId: number;
  /** Generation of the source (-1 when its record was compacted). */
  readonly generation: number;
  /** Branch at save time (-1 = its species' ancestral line) and the name shown then. */
  readonly branch: number;
  readonly branchLabel: string;
  /** Named branches from the oldest ancestor down to `branch`. */
  readonly ancestry: readonly SpecimenAncestor[];
  readonly worldId: string;
  /** Organisms introduced from this specimen so far. */
  spawned: number;
}

/** Specimens kept per dish (the Phase 4 gallery holds 100 pictures; these are spawnable records). */
export const SPECIMEN_LIMIT = 50;
/** Counts offered when adding a specimen (the Add Life counts, UX §4.3). */
export const SPECIMEN_COUNTS = [1, 5, 20] as const;
/** Footprint radius a spawn uses when the UI gives none (Add Life default, UX §4.3). */
export const SPECIMEN_RADIUS = 3;

export type LineageOp =
  | { readonly op: 'rename'; readonly branch: number; readonly name: string | null }
  | { readonly op: 'pin'; readonly branch: number; readonly pinned: boolean }
  | { readonly op: 'saveSpecimen'; readonly from: 'branch' | 'organism'; readonly id: number }
  | { readonly op: 'spawnSpecimen'; readonly specimen: number; readonly x: number; readonly y: number; readonly radius: number; readonly count: number };

/** Whether an op changes the dish (spawn) rather than notebook labels. */
export function isIntervention(op: LineageOp): boolean {
  return op.op === 'spawnSpecimen';
}

export function specimensOf(world: World): readonly Specimen[] {
  return world.branches.specimens ?? [];
}

function ancestryOf(world: World, branch: number): SpecimenAncestor[] {
  const out: SpecimenAncestor[] = [];
  for (let b = branch; b >= 0; b = world.branches.branches[b]!.parentBranch) out.unshift({ branch: b, shortId: world.branches.branches[b]!.shortId });
  return out;
}

function speciesLabel(world: World, species: number): string {
  return `${world.species[species]?.def.name ?? 'Unknown'} founders`;
}

export function saveSpecimen(world: World, from: 'branch' | 'organism', id: number): CommandResult {
  const book = world.branches;
  if (specimensOf(world).length >= SPECIMEN_LIMIT) return { accepted: 0, rejected: 1, note: 'specimen shelf full' };
  if (!Number.isInteger(id)) return { accepted: 0, rejected: 1, note: 'invalid id' };
  const c = world.ents.cols;
  let genome: number;
  let species: number;
  let sourceBirthId: number;
  let generation: number;
  let branch: number;
  if (from === 'branch') {
    const br = book.branches[id];
    if (!br) return { accepted: 0, rejected: 1, note: `no branch ${id}` };
    genome = br.refGenome;
    species = br.species;
    sourceBirthId = br.rootBirthId;
    // The founder's generation from hashed state only: the branch record (named from wave B fix 2 on)
    // or, for an older record, the retained birth arrays. Never from lineage.kept, which is a display
    // record outside the state hash (equal hashes must mean equal futures, SPEC §15).
    generation = br.rootGeneration ?? field(world.lineage, 'generation', br.rootBirthId) ?? -1;
    branch = br.id;
  } else if (from === 'organism') {
    let slot = -1;
    for (let i = 0; i < world.ents.highWater; i++) {
      if (c.alive[i] === 1 && c.birthId[i] === id) {
        slot = i;
        break;
      }
    }
    if (slot < 0) return { accepted: 0, rejected: 1, note: `organism #${id} is not alive` };
    genome = c.genome[slot]!;
    species = c.species[slot]!;
    sourceBirthId = id;
    generation = c.generation[slot]!;
    branch = c.branchId[slot]!;
  } else {
    return { accepted: 0, rejected: 1, note: 'invalid source' };
  }
  const br = branch >= 0 ? book.branches[branch]! : null;
  const list = (book.specimens ??= []);
  list.push({
    id: list.length + 1,
    genome,
    genomeId: world.genomes.get(genome).id,
    species,
    speciesId: world.species[species]!.id,
    savedTick: world.tick,
    from,
    sourceBirthId,
    generation,
    branch,
    branchLabel: br ? displayBranchName(world, br) : speciesLabel(world, species),
    ancestry: ancestryOf(world, branch),
    worldId: world.worldId,
    spawned: 0,
  });
  return { accepted: 1, rejected: 0 };
}

export function spawnSpecimen(world: World, p: Extract<LineageOp, { op: 'spawnSpecimen' }>, introduce: typeof introduceOrganism): CommandResult {
  const s = specimensOf(world).find((x) => x.id === p.specimen);
  const count = Number.isInteger(p.count) && p.count > 0 ? Math.min(20, p.count) : 0;
  if (!s) return { accepted: 0, rejected: count, note: `no specimen ${p.specimen}` };
  if (count === 0) return { accepted: 0, rejected: 0, note: 'invalid count' };
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !(p.radius >= 0 && p.radius <= 6)) return { accepted: 0, rejected: count, note: 'invalid footprint' };
  const sp = world.species[s.species];
  if (!sp || sp.id !== s.speciesId) return { accepted: 0, rejected: count, note: `species ${s.speciesId} is not enabled` };
  if (s.genome < 0 || s.genome >= world.genomes.size || world.genomes.get(s.genome).id !== s.genomeId) return { accepted: 0, rejected: count, note: 'specimen genome missing' };
  const genome = world.genomes.get(s.genome);
  const problem = validateModuleSet(world, sp.id, genome.modules);
  if (problem) return { accepted: 0, rejected: count, note: problem };
  const cells = brushCells(p.x, p.y, p.radius).filter((cell) => canOccupy(world, sp, cell));
  if (cells.length === 0) return { accepted: 0, rejected: count, note: 'no compatible cells' };
  const dist = (cell: number) => Math.hypot((cell % GRID_W) + 0.5 - p.x, Math.floor(cell / GRID_W) + 0.5 - p.y);
  cells.sort((a, b) => dist(a) - dist(b) || a - b);
  const load = world.derived.cellLoad;
  let accepted = 0;
  let k = 0;
  let capacityHit = false;
  for (let n = 0; n < count; n++) {
    let placed = false;
    for (let tries = 0; tries < cells.length; tries++) {
      const cell = cells[(k + tries) % cells.length]!;
      if (load[cell]! + 1 > CELL_SOFT_CAPACITY) continue;
      const slot = introduce(world, s.species, cell, 'specimen', { genome: s.genome });
      if (slot < 0) {
        capacityHit = true;
        break;
      }
      load[cell]! += 1;
      k = (k + tries + 1) % cells.length;
      placed = true;
      accepted++;
      break;
    }
    if (!placed) break;
  }
  s.spawned += accepted;
  if (capacityHit) world.capacityHitThisTick = true;
  return { accepted, rejected: count - accepted, ...(capacityHit ? { note: 'capacity' } : {}) };
}

/** Stage-1 handler for the 'lineage' command kind (`introduce` is commands.ts introduceOrganism). */
export function applyLineage(world: World, p: LineageOp, introduce: typeof introduceOrganism): CommandResult {
  switch (p.op) {
    case 'rename': {
      const note = renameBranch(world, p.branch, typeof p.name === 'string' ? p.name : null);
      return note ? { accepted: 0, rejected: 1, note } : { accepted: 1, rejected: 0 };
    }
    case 'pin': {
      const note = pinBranch(world, p.branch, p.pinned === true);
      if (note) return { accepted: 0, rejected: 1, note };
      // Pinned branches keep their founder family's birth details through compaction (CT §12.10).
      retainPinnedRecords(world);
      return { accepted: 1, rejected: 0 };
    }
    case 'saveSpecimen':
      return saveSpecimen(world, p.from, p.id);
    case 'spawnSpecimen':
      return spawnSpecimen(world, p, introduce);
    default:
      return { accepted: 0, rejected: 1, note: 'unknown lineage op' };
  }
}
