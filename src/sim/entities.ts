/**
 * Struct-of-arrays entity store (SPEC §6.1, ARCH §5). Capacity 6,000.
 *
 * - Iteration is always ascending slot index over [0, highWater).
 * - Slots are allocated lowest-free-first, so allocation depends only on the alive[] pattern and is
 *   identical after save/reload.
 * - Freed slots are zeroed completely so dead slots never carry stale data into hashes or saves.
 * - Cross-entity references store (slot, birthId); a reference is valid only while
 *   alive[slot] && birthId[slot] === storedBirthId.
 */
import { AGENT_CAP } from './constants';

type ColType = 'f64' | 'f32' | 'i32' | 'u32' | 'u16' | 'u8';

/** Column registry. Order is canonical (hashing, saving). Append only; defaults are 0 unless noted. */
export const ENTITY_COLUMNS = [
  ['alive', 'u8'],
  ['species', 'u16'],
  ['genome', 'i32'],
  ['entityId', 'u32'],
  ['birthId', 'u32'],
  ['x', 'f64'],
  ['y', 'f64'],
  ['heading', 'u8'],
  ['B', 'f64'],
  ['N', 'f64'],
  ['E', 'f64'],
  ['H', 'f64'],
  ['age', 'f64'],
  ['mealC', 'f64'],
  ['mealN', 'f64'],
  ['boundMineral', 'f64'],
  ['jacketMineral', 'f64'],
  ['lifeState', 'u8'],
  ['stateTimer', 'f64'],
  ['lockoutTimer', 'f64'],
  ['flags', 'u32'],
  // Movement memory
  ['decisionTimer', 'u8'],
  ['targetX', 'f64'],
  ['targetY', 'f64'],
  ['moveMode', 'u8'],
  ['movedThisTick', 'f64'],
  // Predation
  ['attackCooldown', 'f64'],
  ['preySlot', 'i32'],
  ['preyBirthId', 'u32'],
  ['handlingProgress', 'f64'],
  // Host / parasite / infection
  ['hostSlot', 'i32'],
  ['hostBirthId', 'u32'],
  ['parasiteSlot', 'i32'],
  ['parasiteBirthId', 'u32'],
  ['infectionTimer', 'f64'],
  ['infectedBy', 'u8'],
  // Observation (authoritative because causes are part of the record)
  ['suitability', 'f64'],
  ['lastIntakeTick', 'f64'],
  ['intakeLastSecond', 'f64'],
  ['intakeAccum', 'f64'],
  ['stressSeconds', 'f64'],
  ['recoverSeconds', 'f64'],
  ['limitCode', 'u16'],
  ['limitValue', 'f64'],
  ['dmgStarve', 'f64'],
  ['dmgStress', 'f64'],
  ['dmgInhib', 'f64'],
  ['dmgParasite', 'f64'],
  ['divBlockCode', 'u16'],
  ['secreting', 'u8'],
  // Birth proposal (D5 A01): genome indices, -1 when none
  ['propG0', 'i32'],
  ['propG1', 'i32'],
  ['propTick', 'f64'],
  ['secretionCode', 'u16'],
  // Genealogy essentials for living organisms (history in lineage.ts may be compacted)
  ['generation', 'u32'],
  ['branchId', 'i32'],
  ['candRoot', 'u32'],
  ['refGenome', 'i32'],
  // Mutation descriptors saved with the birth proposal (see mutation.ts MUT_*)
  ['propFlags0', 'u8'],
  ['propFlags1', 'u8'],
  ['propLocus0', 'i32'],
  ['propLocus1', 'i32'],
  ['propDelta0', 'i32'],
  ['propDelta1', 'i32'],
  ['propModule0', 'i32'],
  ['propModule1', 'i32'],
  // Dormancy (SPEC §7.6; P2.1): seconds of moisture suitability < 0.20 while Active. The other
  // dormancy clocks reuse stateTimer (no-intake seconds while Active; elapsed seconds while Preparing
  // or Waking; wake-condition seconds while Resting) and lockoutTimer (lockout after waking).
  ['dryTimer', 'f64'],
] as const satisfies ReadonlyArray<readonly [string, ColType]>;

export type ColumnName = (typeof ENTITY_COLUMNS)[number][0];
type ColumnTypeOf<N extends ColumnName> = Extract<(typeof ENTITY_COLUMNS)[number], readonly [N, ColType]>[1];
type ArrayFor<T extends ColType> = T extends 'f64'
  ? Float64Array
  : T extends 'f32'
    ? Float32Array
    : T extends 'i32'
      ? Int32Array
      : T extends 'u32'
        ? Uint32Array
        : T extends 'u16'
          ? Uint16Array
          : Uint8Array;

export type EntityColumns = { [N in ColumnName]: ArrayFor<ColumnTypeOf<N>> };

/** Columns whose empty value is -1 rather than 0. */
const NEG_ONE_DEFAULT: ReadonlySet<ColumnName> = (() => {
  // eslint-disable-next-line no-restricted-syntax -- lookup only, never iterated
  return new Set<ColumnName>(['genome', 'preySlot', 'hostSlot', 'parasiteSlot', 'propG0', 'propG1', 'branchId', 'refGenome', 'propLocus0', 'propLocus1', 'propModule0', 'propModule1']);
})();

function makeArray(t: ColType, n: number): ArrayFor<ColType> {
  switch (t) {
    case 'f64':
      return new Float64Array(n);
    case 'f32':
      return new Float32Array(n);
    case 'i32':
      return new Int32Array(n);
    case 'u32':
      return new Uint32Array(n);
    case 'u16':
      return new Uint16Array(n);
    case 'u8':
      return new Uint8Array(n);
  }
}

/** Entity flags (bit positions are saved: append only). */
export const FLAG = {
  attached: 1 << 0,
  stressed: 1 << 1,
  feeding: 1 << 2,
  hunting: 1 << 3,
  capacityBlocked: 1 << 4,
  overCapacity: 1 << 5,
  moving: 1 << 6,
  secreting: 1 << 7,
  justBorn: 1 << 8,
  introduced: 1 << 9,
  /** Its current dormancy was entered because it was too dry (else because food stayed scarce). */
  restDry: 1 << 10,
  /** This tick's intake reached 1 % of its intake ceiling (USABLE_INTAKE_FRACTION; set in stage 6). */
  usableIntake: 1 << 11,
} as const;

/** Life states (SPEC §6.1, §7.6). Saved in the lifeState column: append only. */
export const LIFE_ACTIVE = 0;
export const LIFE_PREPARING = 1;
export const LIFE_RESTING = 2;
export const LIFE_WAKING = 3;

/**
 * Entity columns appended after the first saved format. A save written before a column existed
 * loads it with the column's empty value, which is exactly the state those organisms had (the
 * behavior the column serves did not exist in that world's ruleset).
 */
export const MOVE_NONE = 0;
export const MOVE_TARGET = 1;
export const MOVE_WANDER = 2;
export const MOVE_PURSUE = 3;

export class EntityStore {
  readonly capacity: number;
  readonly cols: EntityColumns;
  /** One past the highest slot ever used and still relevant. */
  highWater = 0;
  count = 0;
  private freeHint = 0;

  constructor(capacity: number = AGENT_CAP) {
    this.capacity = capacity;
    const cols: Record<string, ArrayFor<ColType>> = {};
    for (const [name, t] of ENTITY_COLUMNS) {
      const arr = makeArray(t, capacity);
      if (NEG_ONE_DEFAULT.has(name)) (arr as Int32Array).fill(-1);
      cols[name] = arr;
    }
    this.cols = cols as unknown as EntityColumns;
  }

  isAlive(slot: number): boolean {
    return slot >= 0 && slot < this.capacity && this.cols.alive[slot] === 1;
  }

  /** Allocate the lowest free slot, or -1 at capacity. Caller fills columns. */
  allocate(): number {
    if (this.count >= this.capacity) return -1;
    const alive = this.cols.alive;
    let i = this.freeHint;
    while (i < this.capacity && alive[i] === 1) i++;
    if (i >= this.capacity) return -1;
    this.clearSlot(i);
    alive[i] = 1;
    this.count++;
    if (i + 1 > this.highWater) this.highWater = i + 1;
    this.freeHint = i + 1;
    return i;
  }

  free(slot: number): void {
    if (this.cols.alive[slot] !== 1) throw new Error(`free(): slot ${slot} is not alive`);
    this.clearSlot(slot);
    this.count--;
    if (slot < this.freeHint) this.freeHint = slot;
    // Shrink highWater past trailing dead slots so iteration stays tight and canonical.
    while (this.highWater > 0 && this.cols.alive[this.highWater - 1] !== 1) this.highWater--;
  }

  private clearSlot(slot: number): void {
    for (const [name] of ENTITY_COLUMNS) {
      const arr = this.cols[name] as ArrayFor<ColType>;
      arr[slot] = NEG_ONE_DEFAULT.has(name) ? -1 : 0;
    }
  }

  /** Recompute bookkeeping from alive[] (after deserialization). */
  recount(): void {
    let count = 0;
    let hw = 0;
    let firstFree = -1;
    for (let i = 0; i < this.capacity; i++) {
      if (this.cols.alive[i] === 1) {
        count++;
        hw = i + 1;
      } else if (firstFree < 0) firstFree = i;
    }
    this.count = count;
    this.highWater = hw;
    this.freeHint = firstFree < 0 ? this.capacity : firstFree;
  }

  refValid(slot: number, birthId: number): boolean {
    return slot >= 0 && this.cols.alive[slot] === 1 && this.cols.birthId[slot] === birthId;
  }
}
