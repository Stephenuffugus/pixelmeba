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
  // ---- Phase 3 foundation (world schema 4; D-0035). From `filmSeconds` on, every column is
  // hash-neutral: stateHash includes it only while some slot in [0, highWater) differs from its empty
  // value (emptyValueOf), so a world holding no Phase 3 state hashes exactly as the g2 build hashed it.
  // B02 biofilm: continuous attached seconds (P3.3).
  ['filmSeconds', 'f64'],
  // E04 surface anchor (P3.7): 0 free, 1 anchored; continuous qualifying seconds; reattach lockout.
  ['anchorState', 'u8'],
  ['anchorSeconds', 'f64'],
  ['anchorLockout', 'f64'],
  // E12 colony adhesion (P3.7): birthId of the pairing candidate (0 = none), pairing seconds, relink lockout.
  ['adhPartner', 'u32'],
  ['adhSeconds', 'f64'],
  ['adhLockout', 'f64'],
  // P04 sediment/water crossing (P3.4): 1 once it has crossed (per organism).
  ['waterCrossed', 'u8'],
  // D-0035: seconds since the organism's last usable intake under D-0019's 1 % rule (the
  // FLAG.usableIntake test); 0 at allocation, so newborns and migrated organisms start fresh. Wave 4
  // advances it, once per tick and only for organisms carrying E04 or E12 (whose "10 s without intake"
  // rules read it); nothing in the wave 1 foundation writes it, so Phase 2 worlds keep it empty.
  ['noUsableIntakeSeconds', 'f64'],
  // Fungal links (SPEC §7.2, §7.7; ARCH §5 links 6000×4), at most 4 per segment: partner slot (−1 =
  // none), partner birthId, kind (1 visual F01, 2 transport F02). Symmetric; see src/sim/links.ts.
  ['fLink0', 'i32'],
  ['fLink1', 'i32'],
  ['fLink2', 'i32'],
  ['fLink3', 'i32'],
  ['fLinkB0', 'u32'],
  ['fLinkB1', 'u32'],
  ['fLinkB2', 'u32'],
  ['fLinkB3', 'u32'],
  ['fLinkKind0', 'u8'],
  ['fLinkKind1', 'u8'],
  ['fLinkKind2', 'u8'],
  ['fLinkKind3', 'u8'],
  // E12 adhesion links (SPEC §9.12; ARCH §5 adhesion 6000×2), at most 2: partner slot (−1) and birthId.
  ['aLink0', 'i32'],
  ['aLink1', 'i32'],
  ['aLinkB0', 'u32'],
  ['aLinkB1', 'u32'],
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
  return new Set<ColumnName>([
    'genome',
    'preySlot',
    'hostSlot',
    'parasiteSlot',
    'propG0',
    'propG1',
    'branchId',
    'refGenome',
    'propLocus0',
    'propLocus1',
    'propModule0',
    'propModule1',
    'fLink0',
    'fLink1',
    'fLink2',
    'fLink3',
    'aLink0',
    'aLink1',
  ]);
})();

/**
 * The value a column holds in a free or never-used slot: −1 for slot/index references
 * (NEG_ONE_DEFAULT), 0 otherwise. One source for the entity store, the schema migration (which
 * fills added columns with it) and the hash-neutral rule of stateHash (D-0035).
 */
export function emptyValueOf(name: ColumnName): number {
  return NEG_ONE_DEFAULT.has(name) ? -1 : 0;
}

/**
 * Index in ENTITY_COLUMNS of the first hash-neutral column (`filmSeconds`, world schema 4): this
 * column and every later one are hashed only while some slot in [0, highWater) is not empty.
 */
export const FIRST_HASH_NEUTRAL_COLUMN: number = ENTITY_COLUMNS.findIndex(([n]) => n === 'filmSeconds');

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
  // 1 << 12 and 1 << 13 are reserved for Phase 3 wave 4 (E04/E12); the foundation adds no flag.
  /** This tick's intake came from local detritus through E08 (debris feeder; set in stage 6, cleared with feeding). */
  detritusIntake: 1 << 13,
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
      if (emptyValueOf(name) !== 0) (arr as Int32Array).fill(-1);
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

  /**
   * Allocate exactly `slot` (P3.5 Sample Cancel and Discard put held organisms back into the slots
   * they came from; D-0037). Throws when the slot is out of range or alive. Caller fills columns.
   * Every slot below freeHint stays alive, so lowest-free-first allocation is unchanged.
   */
  allocateAt(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.capacity) throw new Error(`allocateAt(): slot ${slot} is out of range`);
    if (this.cols.alive[slot] === 1) throw new Error(`allocateAt(): slot ${slot} is alive`);
    this.clearSlot(slot);
    this.cols.alive[slot] = 1;
    this.count++;
    if (slot + 1 > this.highWater) this.highWater = slot + 1;
    if (slot === this.freeHint) this.freeHint = slot + 1;
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
      arr[slot] = emptyValueOf(name);
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
