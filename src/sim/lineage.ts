/**
 * Genealogy records keyed by birthId (SPEC §6.9, §8.5). Every daughter of a division receives a
 * new birthId and records the pre-division individual as its parent; introduced founders have
 * parent 0. The retained entityId is not an identity, so no self-parent link can occur.
 */
export const INTRODUCED_PARENT = 0;

export interface Lineage {
  /** Parallel arrays indexed by birthId (index 0 unused). */
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
}

export function createLineage(): Lineage {
  return {
    parent: [0],
    genome: [-1],
    birthTick: [0],
    generation: [0],
    species: [-1],
    entityId: [0],
    deathTick: [-1],
    deathCause: [0],
    origin: [0],
  };
}

export function recordBirth(
  L: Lineage,
  birthId: number,
  rec: { parent: number; genome: number; tick: number; generation: number; species: number; entityId: number; origin: number },
): void {
  if (L.parent.length !== birthId) throw new Error(`lineage: birthId ${birthId} out of sequence (expected ${L.parent.length})`);
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
}

export function recordDeath(L: Lineage, birthId: number, tick: number, cause: number): void {
  L.deathTick[birthId] = tick;
  L.deathCause[birthId] = cause;
}

/** A division ends the parent's individual record (it continues as two new birth records). */
export function recordDivisionEnd(L: Lineage, birthId: number, tick: number): void {
  L.deathTick[birthId] = tick;
  L.deathCause[birthId] = -1; // -1 = ended by division, not death
}
