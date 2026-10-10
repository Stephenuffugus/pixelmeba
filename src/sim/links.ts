/**
 * Fungal and adhesion links (SPEC §6.1, §6.8, §7.2, §7.7, §9.12; ARCH §5; Phase 3 foundation, world
 * schema 4).
 *
 * Layout (proposed decision, docs/reports/reviews/g3-wave-1/foundation-build.md): links are ENTITY
 * COLUMNS, not separate world tables. Each organism has
 * four fungal link positions (`fLink0..3` partner slot, −1 = none; `fLinkB0..3` partner birthId;
 * `fLinkKind0..3` 1 = visual (F01 threads), 2 = transport (F02)) and two adhesion positions
 * (`aLink0..1` slot, −1; `aLinkB0..1` birthId). This is ARCH §5's `links: Int32Array(6000×4)` and
 * `adhesion: Int32Array(6000×2)` split by position, plus the birthId each reference needs. As columns
 * they are saved, migrated (filled with −1 by emptyValueOf), cleared when a slot is freed and hashed
 * (hash-neutral while empty) by the same code as every other column.
 *
 * Rules:
 * - Links are undirected and stored on both endpoints; a reference is valid only while
 *   alive[slot] && birthId[slot] === stored birthId (a reused slot is never linked).
 * - At most 4 fungal and 2 adhesion links per organism; a fifth (third) is refused. Adhesion links
 *   are not fungal links (SPEC §7.7).
 * - Death removes every incident link from both endpoints (SPEC §6.8): every removal path calls
 *   removeAllLinks(world, i) before world.ents.free(i).
 * - A division gives the retained daughter (same slot) a new birthId; rekeyLinks rewrites the birthId
 *   its partners hold so the links stay valid (F02 links follow branching rules, SPEC §9.19).
 * - Iteration is by ascending position and ascending slot; nothing here draws randomness.
 */
import type { ColumnName } from './entities';
import { emit } from './events';
import type { World } from './world';

export const LINK_VISUAL = 1;
export const LINK_TRANSPORT = 2;
export type FungalLinkKind = typeof LINK_VISUAL | typeof LINK_TRANSPORT;

export const FUNGAL_LINK_MAX = 4;
export const ADHESION_LINK_MAX = 2;

export const FUNGAL_SLOT_COLUMNS = [
  'fLink0',
  'fLink1',
  'fLink2',
  'fLink3',
] as const satisfies readonly ColumnName[];
export const FUNGAL_BIRTH_COLUMNS = [
  'fLinkB0',
  'fLinkB1',
  'fLinkB2',
  'fLinkB3',
] as const satisfies readonly ColumnName[];
export const FUNGAL_KIND_COLUMNS = [
  'fLinkKind0',
  'fLinkKind1',
  'fLinkKind2',
  'fLinkKind3',
] as const satisfies readonly ColumnName[];
export const ADHESION_SLOT_COLUMNS = ['aLink0', 'aLink1'] as const satisfies readonly ColumnName[];
export const ADHESION_BIRTH_COLUMNS = ['aLinkB0', 'aLinkB1'] as const satisfies readonly ColumnName[];

/** Every link column (for import checks and tests). */
export const LINK_COLUMNS: readonly ColumnName[] = [
  ...FUNGAL_SLOT_COLUMNS,
  ...FUNGAL_BIRTH_COLUMNS,
  ...FUNGAL_KIND_COLUMNS,
  ...ADHESION_SLOT_COLUMNS,
  ...ADHESION_BIRTH_COLUMNS,
];

interface Table {
  readonly slot: readonly Int32Array[];
  readonly birth: readonly Uint32Array[];
  readonly kind: readonly Uint8Array[] | null;
}

function fungal(world: World): Table {
  const c = world.ents.cols;
  return {
    slot: FUNGAL_SLOT_COLUMNS.map((n) => c[n]),
    birth: FUNGAL_BIRTH_COLUMNS.map((n) => c[n]),
    kind: FUNGAL_KIND_COLUMNS.map((n) => c[n]),
  };
}

function adhesion(world: World): Table {
  const c = world.ents.cols;
  return {
    slot: ADHESION_SLOT_COLUMNS.map((n) => c[n]),
    birth: ADHESION_BIRTH_COLUMNS.map((n) => c[n]),
    kind: null,
  };
}

/** Position on `a` whose stored reference is exactly (slot b, birthId bBirth), or −1. */
function positionOf(t: Table, a: number, b: number, bBirth: number): number {
  for (let k = 0; k < t.slot.length; k++) if (t.slot[k]![a] === b && t.birth[k]![a] === bBirth) return k;
  return -1;
}

function freePosition(t: Table, a: number): number {
  for (let k = 0; k < t.slot.length; k++) if (t.slot[k]![a] === -1) return k;
  return -1;
}

function clearPosition(t: Table, a: number, k: number): void {
  t.slot[k]![a] = -1;
  t.birth[k]![a] = 0;
  if (t.kind) t.kind[k]![a] = 0;
}

function add(world: World, t: Table, a: number, b: number, kind: number): boolean {
  const e = world.ents;
  if (a === b || !e.isAlive(a) || !e.isAlive(b)) return false;
  const birth = e.cols.birthId;
  if (positionOf(t, a, b, birth[b]!) >= 0) return false; // already linked
  const ka = freePosition(t, a);
  const kb = freePosition(t, b);
  if (ka < 0 || kb < 0) return false; // degree limit
  t.slot[ka]![a] = b;
  t.birth[ka]![a] = birth[b]!;
  t.slot[kb]![b] = a;
  t.birth[kb]![b] = birth[a]!;
  if (t.kind) {
    t.kind[ka]![a] = kind;
    t.kind[kb]![b] = kind;
  }
  return true;
}

function remove(world: World, t: Table, a: number, b: number): boolean {
  const e = world.ents;
  if (!e.isAlive(a) || !e.isAlive(b)) return false;
  const birth = e.cols.birthId;
  const ka = positionOf(t, a, b, birth[b]!);
  const kb = positionOf(t, b, a, birth[a]!);
  if (ka < 0 && kb < 0) return false;
  if (ka >= 0) clearPosition(t, a, ka);
  if (kb >= 0) clearPosition(t, b, kb);
  return true;
}

/** Valid partners of `i` in position order. */
function neighbors(world: World, t: Table, i: number, kind?: number): number[] {
  const out: number[] = [];
  if (!world.ents.isAlive(i)) return out;
  for (let k = 0; k < t.slot.length; k++) {
    const p = t.slot[k]![i]!;
    if (p < 0 || !world.ents.refValid(p, t.birth[k]![i]!)) continue;
    if (kind !== undefined && t.kind && t.kind[k]![i] !== kind) continue;
    out.push(p);
  }
  return out;
}

/** Breadth-first walk from `i`, visiting each node's partners in ascending slot order; members sorted ascending. */
function component(world: World, t: Table, i: number, kind?: number): number[] {
  if (!world.ents.isAlive(i)) return [];
  const seen = new Uint8Array(world.ents.highWater);
  const queue = [i];
  seen[i] = 1;
  for (let q = 0; q < queue.length; q++) {
    const next = neighbors(world, t, queue[q]!, kind).sort((x, y) => x - y);
    for (const p of next) {
      if (seen[p] === 1) continue;
      seen[p] = 1;
      queue.push(p);
    }
  }
  return queue.sort((x, y) => x - y);
}

function removeAllIn(world: World, t: Table, i: number): void {
  const birth = world.ents.cols.birthId;
  for (let k = 0; k < t.slot.length; k++) {
    const p = t.slot[k]![i]!;
    if (p < 0) continue;
    if (world.ents.refValid(p, t.birth[k]![i]!)) {
      const kp = positionOf(t, p, i, birth[i]!);
      if (kp >= 0) clearPosition(t, p, kp);
    }
    clearPosition(t, i, k);
  }
}

function rekeyIn(world: World, t: Table, i: number, oldBirthId: number): void {
  const newBirth = world.ents.cols.birthId[i]!;
  for (let k = 0; k < t.slot.length; k++) {
    const p = t.slot[k]![i]!;
    if (p < 0 || !world.ents.refValid(p, t.birth[k]![i]!)) continue;
    const kp = positionOf(t, p, i, oldBirthId);
    if (kp >= 0) t.birth[kp]![p] = newBirth;
  }
}

// ---- Fungal links -------------------------------------------------------------------------------

/** Link two living organisms with a fungal link of `kind`. False when either is dead, already linked or already has 4 links. */
export function addFungalLink(world: World, a: number, b: number, kind: FungalLinkKind): boolean {
  if (kind !== LINK_VISUAL && kind !== LINK_TRANSPORT) return false;
  return add(world, fungal(world), a, b, kind);
}

export function removeFungalLink(world: World, a: number, b: number): boolean {
  return remove(world, fungal(world), a, b);
}

/** The kind of the fungal link a–b (0 when there is none). */
export function fungalLinkKind(world: World, a: number, b: number): number {
  if (!world.ents.isAlive(a) || !world.ents.isAlive(b)) return 0;
  const t = fungal(world);
  const k = positionOf(t, a, b, world.ents.cols.birthId[b]!);
  return k < 0 ? 0 : t.kind![k]![a]!;
}

/** Valid fungal partners of `i` in link-index (position) order, optionally of one kind. */
export function fungalNeighbors(world: World, i: number, kind?: FungalLinkKind): number[] {
  return neighbors(world, fungal(world), i, kind);
}

export function fungalDegree(world: World, i: number): number {
  return fungalNeighbors(world, i).length;
}

/** The fungal component of `i` (BFS by ascending slot), member slots sorted; optionally over links of one kind. */
export function fungalComponent(world: World, i: number, kind?: FungalLinkKind): number[] {
  return component(world, fungal(world), i, kind);
}

// ---- Adhesion links -----------------------------------------------------------------------------

/** Link two living organisms with an adhesion link. False when either is dead, already linked or already has 2 links. */
export function addAdhesionLink(world: World, a: number, b: number): boolean {
  return add(world, adhesion(world), a, b, 0);
}

export function removeAdhesionLink(world: World, a: number, b: number): boolean {
  return remove(world, adhesion(world), a, b);
}

export function adhesionNeighbors(world: World, i: number): number[] {
  return neighbors(world, adhesion(world), i);
}

export function adhesionDegree(world: World, i: number): number {
  return adhesionNeighbors(world, i).length;
}

/** The adhesion component (colony) of `i` (BFS by ascending slot), member slots sorted. */
export function adhesionComponent(world: World, i: number): number[] {
  return component(world, adhesion(world), i);
}

/** Whether any link position of `i` is set (the common case at death and division is no). */
function hasAnyLink(world: World, i: number): boolean {
  const c = world.ents.cols;
  return (
    c.fLink0[i] !== -1 ||
    c.fLink1[i] !== -1 ||
    c.fLink2[i] !== -1 ||
    c.fLink3[i] !== -1 ||
    c.aLink0[i] !== -1 ||
    c.aLink1[i] !== -1
  );
}

// ---- Lifecycle hooks ----------------------------------------------------------------------------

/**
 * Remove every fungal and adhesion link of `i`, from both endpoints (SPEC §6.8). Every path that frees
 * a living organism calls this first: killEntity (maintenance.ts), the predation capture
 * (contacts.ts), and later lysis and sampling.
 */
export function removeAllLinks(world: World, i: number): void {
  if (!hasAnyLink(world, i)) return;
  // P3.6: one 'linkBroken' event per valid fungal link, named by the removed organism (fungalTransport.ts).
  const t = fungal(world);
  const c = world.ents.cols;
  for (let k = 0; k < t.slot.length; k++) {
    const p = t.slot[k]![i]!;
    if (p < 0 || !world.ents.refValid(p, t.birth[k]![i]!)) continue;
    emit(world.events, world.counters, {
      tick: world.tick,
      type: 'linkBroken',
      species: c.species[i]!,
      birthId: c.birthId[i]!,
      detail: { kind: 'fungal', link: t.kind![k]![i] === LINK_TRANSPORT ? 'transport' : 'visual', partner: c.birthId[p]! },
    });
  }
  removeAllIn(world, t, i);
  removeAllIn(world, adhesion(world), i);
}

/**
 * After a division gave the retained daughter in slot `i` a new birthId (births.ts commitDivision),
 * rewrite the birthId each partner stored for it (`oldBirthId`, the parent's), so the links stay valid.
 */
export function rekeyLinks(world: World, i: number, oldBirthId: number): void {
  if (!hasAnyLink(world, i)) return;
  rekeyIn(world, fungal(world), i, oldBirthId);
  rekeyIn(world, adhesion(world), i, oldBirthId);
}

// ---- Integrity ----------------------------------------------------------------------------------

/** Column access for linkProblem: a live World's columns or a save's decoded columns. */
export type LinkColumnView = Readonly<Record<string, ArrayLike<number>>>;

/**
 * The first link inconsistency in these columns, or null. Checks over [0, highWater): a dead slot holds
 * no link; an empty position holds birthId 0 and kind 0; a set position points at another living
 * organism with that birthId, holds a known kind (fungal), names no partner twice, and the partner
 * holds the reverse reference with the same kind. Used by linksValid and the save import.
 */
export function linkProblem(cols: LinkColumnView, highWater: number): string | null {
  const alive = cols.alive!;
  const birth = cols.birthId!;
  const tables: [string, readonly string[], readonly string[], readonly string[] | null][] = [
    ['fungal', FUNGAL_SLOT_COLUMNS, FUNGAL_BIRTH_COLUMNS, FUNGAL_KIND_COLUMNS],
    ['adhesion', ADHESION_SLOT_COLUMNS, ADHESION_BIRTH_COLUMNS, null],
  ];
  for (const [label, slotCols, birthCols, kindCols] of tables) {
    const S = slotCols.map((n) => cols[n]!);
    const B = birthCols.map((n) => cols[n]!);
    const K = kindCols ? kindCols.map((n) => cols[n]!) : null;
    for (let i = 0; i < highWater; i++) {
      for (let k = 0; k < S.length; k++) {
        const p = S[k]![i]!;
        const pb = B[k]![i]!;
        const kind = K ? K[k]![i]! : 0;
        if (p === -1) {
          if (pb !== 0 || kind !== 0)
            return `${label} link position ${k} of slot ${i} is empty but holds a birth identity or kind`;
          continue;
        }
        if (alive[i] !== 1) return `slot ${i} is not alive but holds a ${label} link`;
        if (!Number.isInteger(p) || p < 0 || p >= highWater || p === i)
          return `slot ${i} has a dangling ${label} link`;
        if (alive[p] !== 1 || birth[p] !== pb) return `slot ${i} has a dangling ${label} link`;
        if (K && kind !== LINK_VISUAL && kind !== LINK_TRANSPORT)
          return `slot ${i} has a fungal link of unknown kind ${kind}`;
        for (let j = 0; j < k; j++)
          if (S[j]![i] === p) return `slot ${i} names the same ${label} partner twice`;
        let back = -1;
        for (let j = 0; j < S.length; j++) if (S[j]![p] === i && B[j]![p] === birth[i]) back = j;
        if (back < 0) return `the ${label} link between slots ${i} and ${p} is not symmetric`;
        if (K && K[back]![p] !== kind)
          return `the ${label} link between slots ${i} and ${p} has different kinds at its two ends`;
      }
    }
  }
  return null;
}

/** Symmetry, liveness and birthId match of every link in the world. */
export function linksValid(world: World): boolean {
  return linkProblem(world.ents.cols, world.ents.highWater) === null;
}
