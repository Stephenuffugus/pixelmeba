/**
 * Birth records keyed by birthId (SPEC §6.9, §8.1). Every daughter of a division receives a new
 * birthId and records the pre-division individual as its parent; introduced founders have parent 0.
 *
 * History is bounded: records older than the most recent RETAIN births are compacted away (the
 * arrays keep a `base` offset). Nothing the simulation needs lives here — living organisms carry
 * their generation, branch and candidate data in entity columns — so compaction never changes
 * outcomes; the UI labels missing individual history as unavailable (SPEC §8.1, §12.4).
 */
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
