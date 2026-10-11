/**
 * Favorite families (P4.1; SPEC §12.6, UX §5.8, D08 §06): who belongs to a followed family, the Follow
 * next order, extinction, and the snapshot marks. Worker state that reads the world and never writes it:
 * no randomness, no events, no commands. The persisted shape is the notebook record
 * (src/persistence/notebook.ts); the live member sets here are rebuilt from it after an undo, a rollback,
 * a reload or a change to the followed families.
 *
 * Membership (after each tick): a living organism is a member if it already was, or if its recorded
 * parent (lineage records always retain the newest births) was a living member at the previous tick.
 * A member that is no longer alive leaves, whatever removed it (a death, a division, a Sample take).
 * A rebuild walks each living organism's recorded ancestry up to a saved member or the family root.
 *
 * Follow next (SPEC §12.6, D08): the representative's living descendants, else every living member,
 * sorted by birth tick, then birth id. Never by energy, size or health.
 */
import { AGENT_CAP, TICKS_PER_SECOND } from '@sim/constants';
import { recordField } from '@sim/lineage';
import { entityCell } from '@sim/spatial';
import type { World } from '@sim/world';
import {
  cleanNickname,
  FAVORITE_PATTERNS,
  FAVORITES_ACTIVE_MAX,
  FAVORITES_UNPINNED_MAX,
  UNPINNED_MEMBERS_KEPT,
  type FavoriteExtinction,
  type FavoritePattern,
  type FavoriteRecord,
  type NotebookRecord,
} from '@persist/notebook';
import type { FavoriteMarks, FavoriteOp, FavoriteSlotMark } from './protocol';
import { buildFamily } from './snapshot';

/** CT §12.10 "descendants highlighted ≤ 200": members marked per slot; beyond it an aggregate marker. */
export const FAVORITE_HIGHLIGHT_MAX = 200;
/** Follow next candidates sent with a 'favoriteRepresentativeGone' change. */
export const CANDIDATES_MAX = 200;
/** Follow next candidates a snapshot slot carries (the Family sheet offers them in order). */
export const FAVORITE_CANDIDATES_SHOWN = 6;

/** Refusals, as the player reads them (the UI shows them as they are). */
export const FAVORITE_REFUSALS = {
  full: 'You are following three families. Unpin one to follow another.',
  gone: 'That organism is no longer in the dish.',
  already: 'You already follow this family.',
  missing: 'That favorite is no longer in this dish’s notebook.',
  notMember: 'That organism is not a living member of this family.',
  extinct: 'No members of this family remain, so it cannot be followed again.',
  empty: 'No members of this family are in the dish now, so it cannot be followed again.',
  badOp: 'That change to a favorite could not be read.',
} as const;

/** "{Species} #{root}": the default caption uses the ancestor and its id (D08 "Names and sharing"). */
export function defaultFavoriteName(speciesName: string, rootBirthId: number): string {
  return `${speciesName} #${rootBirthId}`;
}

function speciesNameOf(world: World, speciesId: string): string {
  return world.species.find((s) => s.id === speciesId)?.def.name ?? speciesId;
}

/** A favorite's display name: its nickname, else "{Species} #{root}". */
export function favoriteName(world: World, f: FavoriteRecord): string {
  return f.nickname ?? defaultFavoriteName(speciesNameOf(world, f.speciesId), f.rootBirthId);
}

function parentOf(world: World, b: number): number {
  return recordField(world.lineage, 'parent', b) ?? 0;
}

/** Birth tick of `b` from its lineage record, else `known`, else -1 (no longer recorded). */
function birthTickOf(world: World, b: number, known?: ReadonlyMap<number, number>): number {
  return recordField(world.lineage, 'birthTick', b) ?? known?.get(b) ?? -1;
}

/** Sort key order: birth tick, then birth id (SPEC §12.6). */
function byBirth(a: readonly [number, number], b: readonly [number, number]): number {
  return a[1] - b[1] || a[0] - b[0];
}

/**
 * For each birth id in `ids`, the bitmask of the seed sets its recorded ancestry (itself included)
 * reaches. `seeds[k]` is a set of birth ids; a walk stops at an introduced organism or a compacted record.
 */
function ancestryMasks(
  world: World,
  seeds: readonly ReadonlySet<number>[],
  ids: readonly number[],
): number[] {
  if (seeds.length === 0) return ids.map(() => 0);
  const memo = new Map<number, number>();
  const seedMask = (b: number): number => {
    let m = 0;
    for (let k = 0; k < seeds.length; k++) if (seeds[k]!.has(b)) m |= 1 << k;
    return m;
  };
  return ids.map((start) => {
    const path: number[] = [];
    let b = start;
    for (;;) {
      if (memo.has(b)) break;
      path.push(b);
      // Walked to the end of the recorded ancestry (no early stop: every node's memo must be complete).
      const p = parentOf(world, b);
      if (p === 0) break;
      b = p;
    }
    // Every organism on the path reaches what its ancestors reach, plus its own seeds: assign top-down.
    let acc = memo.get(b) ?? 0;
    for (let q = path.length - 1; q >= 0; q--) {
      acc |= seedMask(path[q]!);
      memo.set(path[q]!, acc);
    }
    return memo.get(start)!;
  });
}

/** Birth ids of the living organisms (ascending slot) and of the organisms the held sample carries. */
function presentIds(world: World): {
  readonly slots: number[];
  readonly living: number[];
  readonly held: number[];
} {
  const c = world.ents.cols;
  const slots: number[] = [];
  const living: number[] = [];
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    slots.push(i);
    living.push(c.birthId[i]!);
  }
  return { slots, living, held: (world.sample?.rows ?? []).map((r) => r.cols.birthId) };
}

/** Living descendants of `root` (inclusive) as [birthId, birthTick], ascending birth id. */
export function livingDescendants(world: World, root: number): [number, number][] {
  const { living } = presentIds(world);
  const masks = ancestryMasks(world, [new Set([root])], living);
  const out: [number, number][] = [];
  living.forEach((b, j) => (masks[j] ? out.push([b, birthTickOf(world, b)]) : 0));
  return out.sort((a, b) => a[0] - b[0]);
}

interface Tracked {
  readonly id: string;
  readonly root: number;
  readonly representative: number;
  /** The representative left the family since the last rebuild (the change was posted). */
  repGone: boolean;
}

/** A tick's notebook change, with the record values the host writes. */
export type FavoriteTickChange =
  | { readonly kind: 'favoriteExtinct'; readonly id: string; readonly extinct: FavoriteExtinction }
  | {
      readonly kind: 'favoriteRepresentativeGone';
      readonly id: string;
      readonly candidates: readonly number[];
    };

/**
 * The live members of a dish's active favorites. Bound to one world; `bind` rebuilds from a record.
 * A member lifted into the held sample (P3.5 Take) is not dead: it stays a member while held, without a
 * place in the dish, and is back in place after Transfer or Cancel (same birth id); Discard records it
 * as removed (REMOVED_SAMPLED), and it leaves.
 */
export class FavoriteTracker {
  private world: World;
  private tracked: Tracked[] = [];
  /** Member birth id → its slot now (living members). */
  private cur = new Map<number, number>();
  /** Member birth id → its favorite bits (members in the held sample). */
  private held = new Map<number, number>();
  /** Per slot: the tracked-favorite bits of the member there (0 elsewhere). */
  private mask = new Uint8Array(AGENT_CAP);
  private spare = new Uint8Array(AGENT_CAP);
  /** Per slot: the last cell a member was seen in there. */
  private cell = new Int32Array(AGENT_CAP).fill(-1);
  /** Held members' last cells (before they were lifted). */
  private heldCell = new Map<number, number>();
  private counts: number[] = [];
  private signature = '';
  /** Birth ticks the record carried for members whose lineage record is compacted. */
  private known = new Map<number, number>();
  /** Per tracked favorite: members sorted by birth tick then id (null = stale). */
  private ordered: ([number, number][] | null)[] = [];

  constructor(world: World, record: NotebookRecord) {
    this.world = world;
    this.bind(world, record);
  }

  watches(world: World): boolean {
    return this.world === world;
  }

  /** Whether any family is followed. */
  get active(): boolean {
    return this.tracked.length > 0;
  }

  /** What, when unchanged since the last tick, means no organism joined or left (births, removals, the sample). */
  private signatureOf(world: World): string {
    const s = world.sample;
    return `${world.counters.nextBirthId}:${world.ents.count}:${s ? `${s.seq}/${s.rows.length}` : '-'}`;
  }

  /**
   * Rebuild from `record` against `world` (a new, restored or reloaded world, or a changed record): each
   * active favorite's members are the organisms (living or held) whose recorded ancestry reaches one of
   * its saved members or its root.
   */
  bind(world: World, record: NotebookRecord): void {
    this.world = world;
    for (const slot of this.cur.values()) this.mask[slot] = 0;
    this.cur = new Map();
    this.held = new Map();
    this.heldCell = new Map();
    this.known = new Map();
    this.tracked = [];
    const seeds: Set<number>[] = [];
    for (const f of record.favorites) {
      if (!f.active) continue;
      this.tracked.push({ id: f.id, root: f.rootBirthId, representative: f.representative, repGone: false });
      const s = new Set<number>([f.rootBirthId]);
      for (const [b, t] of f.members) {
        s.add(b);
        if (t >= 0) this.known.set(b, t);
      }
      seeds.push(s);
    }
    const { slots, living, held } = presentIds(world);
    const masks = ancestryMasks(world, seeds, [...living, ...held]);
    const c = world.ents.cols;
    this.counts = this.tracked.map(() => 0);
    const count = (m: number) => {
      for (let k = 0; k < this.tracked.length; k++) if (m & (1 << k)) this.counts[k]!++;
    };
    living.forEach((b, j) => {
      const m = masks[j]!;
      if (!m) return;
      const i = slots[j]!;
      this.mask[i] = m;
      this.cur.set(b, i);
      this.cell[i] = entityCell(c.x[i]!, c.y[i]!);
      count(m);
    });
    held.forEach((b, j) => {
      const m = masks[living.length + j]!;
      if (!m) return;
      this.held.set(b, m);
      count(m);
    });
    for (let k = 0; k < this.tracked.length; k++) {
      const t = this.tracked[k]!;
      t.repGone = !this.isMember(k, t.representative);
    }
    this.ordered = this.tracked.map(() => null);
    this.signature = this.signatureOf(world);
  }

  private maskOf(b: number): number {
    const slot = this.cur.get(b);
    return slot !== undefined ? this.mask[slot]! : (this.held.get(b) ?? 0);
  }

  private isMember(k: number, b: number): boolean {
    return (this.maskOf(b) & (1 << k)) !== 0;
  }

  /** Member count of the active favorite `id` now, held members included (0 when not followed). */
  memberCount(id: string): number {
    const k = this.tracked.findIndex((t) => t.id === id);
    return k < 0 ? 0 : this.counts[k]!;
  }

  /** Whether `birthId` is a living member of the active favorite `id` (in the dish, not held). */
  hasMember(id: string, birthId: number): boolean {
    const k = this.tracked.findIndex((t) => t.id === id);
    return k >= 0 && this.cur.has(birthId) && this.isMember(k, birthId);
  }

  /**
   * After one tick of the bound world (or a command that changed it): who joined (daughters of members;
   * members back from the held sample) and who left (anything that removed them), then the
   * representative and extinction checks. Returns what changed.
   */
  afterTick(world: World): FavoriteTickChange[] {
    if (world !== this.world) return [];
    if (this.tracked.length === 0) return [];
    const c = world.ents.cols;
    const sig = this.signatureOf(world);
    if (sig === this.signature) {
      for (const slot of this.cur.values()) this.cell[slot] = entityCell(c.x[slot]!, c.y[slot]!);
      return [];
    }
    this.signature = sig;
    const next = this.spare;
    const nextCur = new Map<number, number>();
    const nextHeld = new Map<number, number>();
    const counts = this.tracked.map(() => 0);
    const count = (m: number) => {
      for (let k = 0; k < this.tracked.length; k++) if (m & (1 << k)) counts[k]!++;
    };
    for (let i = 0; i < world.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      const b = c.birthId[i]!;
      let m = this.maskOf(b);
      if (!m && !this.cur.has(b) && !this.held.has(b)) {
        const p = parentOf(world, b);
        if (p > 0 && this.cur.has(p)) m = this.mask[this.cur.get(p)!]!;
      }
      if (!m) continue;
      next[i] = m;
      nextCur.set(b, i);
      count(m);
    }
    for (const r of world.sample?.rows ?? []) {
      const b = r.cols.birthId;
      const m = this.maskOf(b);
      if (!m) continue;
      nextHeld.set(b, m);
      count(m);
      const was = this.cur.get(b);
      if (was !== undefined) this.heldCell.set(b, this.cell[was]!);
    }
    // Who left, with the cell each was last seen in (read before this tick's cells are written).
    const left: { b: number; m: number; cell: number }[] = [];
    for (const [b, slot] of this.cur)
      if (!nextCur.has(b) && !nextHeld.has(b)) left.push({ b, m: this.mask[slot]!, cell: this.cell[slot]! });
    for (const [b, m] of this.held)
      if (!nextCur.has(b) && !nextHeld.has(b)) left.push({ b, m, cell: this.heldCell.get(b) ?? -1 });
    const out: FavoriteTickChange[] = [];
    for (let k = 0; k < this.tracked.length; k++) {
      const t = this.tracked[k]!;
      if (this.counts[k]! > 0 && counts[k] === 0) {
        // The last member recorded: the youngest of those that left in this tick (birth tick, then id).
        let last: { b: number; cell: number; t: number } | null = null;
        for (const x of left) {
          if (!(x.m & (1 << k))) continue;
          const bt = birthTickOf(world, x.b, this.known);
          if (!last || bt > last.t || (bt === last.t && x.b > last.b)) last = { b: x.b, cell: x.cell, t: bt };
        }
        const lastB = last?.b ?? t.representative;
        out.push({
          kind: 'favoriteExtinct',
          id: t.id,
          extinct: {
            tick: world.tick,
            lastBirthId: lastB,
            cause: recordField(world.lineage, 'deathCause', lastB) ?? 0,
            cell: last?.cell ?? -1,
          },
        });
      }
    }
    // Swap in the new membership.
    for (const slot of this.cur.values()) this.mask[slot] = 0;
    this.spare = this.mask;
    this.mask = next;
    this.cur = nextCur;
    this.held = nextHeld;
    for (const b of [...this.heldCell.keys()]) if (!nextHeld.has(b)) this.heldCell.delete(b);
    this.counts = counts;
    for (const slot of nextCur.values()) this.cell[slot] = entityCell(c.x[slot]!, c.y[slot]!);
    this.ordered = this.tracked.map(() => null);
    for (let k = 0; k < this.tracked.length; k++) {
      const t = this.tracked[k]!;
      if (counts[k] === 0) continue;
      const member = this.isMember(k, t.representative);
      if (member) t.repGone = false;
      else if (!t.repGone) {
        t.repGone = true;
        out.push({ kind: 'favoriteRepresentativeGone', id: t.id, candidates: this.candidates(t.id) });
      }
    }
    return out;
  }

  /** Members of tracked favorite k (held ones included), sorted by birth tick then birth id. */
  private order(k: number): [number, number][] {
    const have = this.ordered[k];
    if (have) return have;
    const list: [number, number][] = [];
    for (const [b, slot] of this.cur)
      if (this.mask[slot]! & (1 << k)) list.push([b, birthTickOf(this.world, b, this.known)]);
    for (const [b, m] of this.held) if (m & (1 << k)) list.push([b, birthTickOf(this.world, b, this.known)]);
    list.sort(byBirth);
    this.ordered[k] = list;
    return list;
  }

  /**
   * Follow next candidates of the active favorite `id` once its representative is gone: its living
   * descendants in the dish, else every living member in the dish, by birth tick then birth id (never by
   * energy, size or health). At most CANDIDATES_MAX. Empty while the representative is a member.
   */
  candidates(id: string): number[] {
    const k = this.tracked.findIndex((t) => t.id === id);
    if (k < 0) return [];
    const rep = this.tracked[k]!.representative;
    if (this.isMember(k, rep)) return [];
    const all = this.order(k).filter(([b]) => this.cur.has(b));
    const memo = new Map<number, boolean>([[rep, true]]);
    const descends = (b0: number): boolean => {
      const path: number[] = [];
      let b = b0;
      let found = false;
      for (;;) {
        const known = memo.get(b);
        if (known !== undefined) {
          found = known;
          break;
        }
        path.push(b);
        const p = parentOf(this.world, b);
        if (p === 0) break;
        b = p;
      }
      for (const x of path) memo.set(x, found);
      return found;
    };
    const desc = all.filter(([b]) => b !== rep && descends(b));
    return (desc.length > 0 ? desc : all).slice(0, CANDIDATES_MAX).map(([b]) => b);
  }

  /** The record with the tracked favorites' members as they are now (no organism data: ids and birth ticks only). */
  materialize(record: NotebookRecord): NotebookRecord {
    if (this.tracked.length === 0) return record;
    let changed = false;
    const favorites = record.favorites.map((f) => {
      const k = this.tracked.findIndex((t) => t.id === f.id);
      if (k < 0 || !f.active) return f;
      const members = this.order(k)
        .map(([b, t]) => [b, t] as [number, number])
        .sort((a, b) => a[0] - b[0]);
      if (
        members.length === f.members.length &&
        members.every((m, i) => m[0] === f.members[i]![0] && m[1] === f.members[i]![1])
      )
        return f;
      changed = true;
      return { ...f, members };
    });
    return changed ? { ...record, favorites } : record;
  }

  /** Snapshot marks in `ents` order and one summary per active slot (null when nothing is followed). */
  marks(world: World): FavoriteMarks | null {
    if (this.tracked.length === 0 || world !== this.world) return null;
    const c = world.ents.cols;
    const highlighted = this.tracked.map((_, k) =>
      this.counts[k]! > FAVORITE_HIGHLIGHT_MAX
        ? new Set(
            this.order(k)
              .slice(0, FAVORITE_HIGHLIGHT_MAX)
              .map(([b]) => b),
          )
        : null,
    );
    const repSlots = this.tracked
      .map((t) => this.cur.get(t.representative) ?? -1)
      .map((s, k) => (s >= 0 && this.isMember(k, this.tracked[k]!.representative) ? s : -1));
    const marks = new Uint8Array(Math.max(1, world.ents.count));
    const member = new Uint8Array(Math.max(1, world.ents.count));
    const sum = this.tracked.map(() => [0, 0, 0]);
    const maxGen = this.tracked.map(() => -1);
    let n = 0;
    for (let i = 0; i < world.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      const m = this.cur.get(c.birthId[i]!) === i ? this.mask[i]! : 0;
      let out = 0;
      for (let k = 0; k < this.tracked.length; k++) {
        if (!(m & (1 << k))) continue;
        const h = highlighted[k];
        if (!h || h.has(c.birthId[i]!)) out |= 1 << k;
        if (repSlots[k] === i) out |= 1 << (3 + k);
        const s = sum[k]!;
        s[0]! += c.x[i]!;
        s[1]! += c.y[i]!;
        s[2]!++;
        if (c.generation[i]! > maxGen[k]!) maxGen[k] = c.generation[i]!;
      }
      member[n] = m & 7;
      marks[n++] = out;
    }
    const slots: FavoriteSlotMark[] = this.tracked.map((t, k) => {
      const count = this.counts[k]!;
      let candidates: (readonly [number, number, number])[] = [];
      if (repSlots[k]! < 0 && count > 0) {
        candidates = this.candidates(t.id)
          .slice(0, FAVORITE_CANDIDATES_SHOWN)
          .map((b) => [b, birthTickOf(world, b, this.known), c.species[this.cur.get(b)!]!] as const);
      }
      const next = candidates[0] ?? null;
      const s = sum[k]!;
      const rootGen = recordField(world.lineage, 'generation', t.root);
      return {
        id: t.id,
        pattern: 'circle',
        members: count,
        highlighted: Math.min(count, FAVORITE_HIGHLIGHT_MAX),
        aggregate:
          count > FAVORITE_HIGHLIGHT_MAX && s[2]! > 0 ? { x: s[0]! / s[2]!, y: s[1]! / s[2]!, count } : null,
        representativeEntity: repSlots[k]! >= 0 ? c.entityId[repSlots[k]!]! : null,
        representativeHeld: this.held.has(t.representative) && this.isMember(k, t.representative),
        next,
        candidates,
        depth: rootGen !== undefined && maxGen[k]! >= 0 ? maxGen[k]! - rootGen : null,
      };
    });
    return { marks, member, slots };
  }
}

/** The patterns from the record for each slot of `marks` (the tracker does not hold them). */
export function withPatterns(marks: FavoriteMarks, record: NotebookRecord): FavoriteMarks {
  return {
    marks: marks.marks,
    member: marks.member,
    slots: marks.slots.map((s) => ({
      ...s,
      pattern: record.favorites.find((f) => f.id === s.id)?.pattern ?? s.pattern,
    })),
  };
}

/**
 * The record after a favorite went extinct: the extinction recorded, no members, no longer followed (its
 * slot is freed; it stays in the notebook), and the unpinned limit applied. `removed`: the display name of
 * an older unpinned favorite removed to make room.
 */
export function recordExtinction(
  world: World,
  record: NotebookRecord,
  id: string,
  extinct: FavoriteExtinction,
): { record: NotebookRecord; removed: string | null } {
  const favorites = record.favorites.map((f) =>
    f.id === id ? { ...f, active: false, members: [], extinct } : f,
  );
  return limitUnpinned(world, { ...record, favorites });
}

/** Keep at most FAVORITES_UNPINNED_MAX unpinned favorites: remove the oldest unpinned extinct record, else the oldest unpinned. */
function limitUnpinned(
  world: World,
  record: NotebookRecord,
): { record: NotebookRecord; removed: string | null } {
  const unpinned = record.favorites.filter((f) => !f.active);
  if (unpinned.length <= FAVORITES_UNPINNED_MAX) return { record, removed: null };
  const num = (f: FavoriteRecord) => Number(f.id.slice(4));
  const oldest = (list: FavoriteRecord[]) => list.reduce((a, b) => (num(b) < num(a) ? b : a));
  const extinct = unpinned.filter((f) => f.extinct !== null);
  const drop = oldest(extinct.length > 0 ? extinct : unpinned);
  return {
    record: { ...record, favorites: record.favorites.filter((f) => f.id !== drop.id) },
    removed: favoriteName(world, drop),
  };
}

/** The first members of `members` by birth tick then id, re-sorted by birth id (an unpinned favorite's kept list). */
function keptMembers(members: readonly (readonly [number, number])[]): [number, number][] {
  return members
    .map(([b, t]) => [b, t] as [number, number])
    .sort(byBirth)
    .slice(0, UNPINNED_MEMBERS_KEPT)
    .sort((a, b) => a[0] - b[0]);
}

function isPattern(v: unknown): v is FavoritePattern {
  return FAVORITE_PATTERNS.includes(v as FavoritePattern);
}

/** An op from the UI, checked (untrusted input), or null. */
export function readFavoriteOp(raw: unknown): FavoriteOp | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id.length <= 16 ? o.id : null;
  const nick = o.nickname === null || typeof o.nickname === 'string' ? o.nickname : undefined;
  const birth =
    typeof o.birthId === 'number' && Number.isInteger(o.birthId) && o.birthId > 0 ? o.birthId : null;
  switch (o.kind) {
    case 'follow':
      return birth !== null && nick !== undefined && isPattern(o.pattern)
        ? { kind: 'follow', birthId: birth, nickname: nick, pattern: o.pattern }
        : null;
    case 'rename':
      return id !== null && nick !== undefined ? { kind: 'rename', id, nickname: nick } : null;
    case 'pattern':
      return id !== null && isPattern(o.pattern) ? { kind: 'pattern', id, pattern: o.pattern } : null;
    case 'representative':
      return id !== null && birth !== null ? { kind: 'representative', id, birthId: birth } : null;
    case 'unpin':
    case 'pin':
      return id !== null ? { kind: o.kind, id } : null;
    default:
      return null;
  }
}

/**
 * Apply one favorite op to `record` (materialized: active members current). The world is only read.
 * `tracker` answers membership questions. Returns the new record, or a refusal (record unchanged).
 */
export function applyFavoriteOp(
  world: World,
  record: NotebookRecord,
  tracker: FavoriteTracker,
  op: FavoriteOp,
): { readonly record: NotebookRecord; readonly refused: string | null; readonly removed: string | null } {
  const refuse = (text: string) => ({ record, refused: text, removed: null });
  const activeCount = record.favorites.filter((f) => f.active).length;
  if (op.kind === 'follow') {
    if (activeCount >= FAVORITES_ACTIVE_MAX) return refuse(FAVORITE_REFUSALS.full);
    const c = world.ents.cols;
    let slot = -1;
    for (let i = 0; i < world.ents.highWater; i++)
      if (c.alive[i] === 1 && c.birthId[i] === op.birthId) slot = i;
    if (slot < 0) return refuse(FAVORITE_REFUSALS.gone);
    const fam = buildFamily(world, op.birthId);
    if (record.favorites.some((f) => f.active && f.rootBirthId === fam.rootBirthId))
      return refuse(FAVORITE_REFUSALS.already);
    const fav: FavoriteRecord = {
      id: `fav-${record.nextFavorite}`,
      rootBirthId: fam.rootBirthId,
      speciesId: world.species[c.species[slot]!]!.id,
      nickname: cleanNickname(op.nickname),
      pattern: op.pattern,
      representative: op.birthId,
      active: true,
      createdTick: world.tick,
      members: livingDescendants(world, fam.rootBirthId),
      historyIncomplete: fam.historyIncomplete,
      extinct: null,
    };
    return {
      record: { ...record, favorites: [...record.favorites, fav], nextFavorite: record.nextFavorite + 1 },
      refused: null,
      removed: null,
    };
  }
  const f = record.favorites.find((x) => x.id === op.id);
  if (!f) return refuse(FAVORITE_REFUSALS.missing);
  const put = (next: FavoriteRecord) => ({
    ...record,
    favorites: record.favorites.map((x) => (x.id === f.id ? next : x)),
  });
  switch (op.kind) {
    case 'rename':
      return { record: put({ ...f, nickname: cleanNickname(op.nickname) }), refused: null, removed: null };
    case 'pattern':
      return { record: put({ ...f, pattern: op.pattern }), refused: null, removed: null };
    case 'representative':
      if (!f.active || !tracker.hasMember(f.id, op.birthId)) return refuse(FAVORITE_REFUSALS.notMember);
      return { record: put({ ...f, representative: op.birthId }), refused: null, removed: null };
    case 'unpin': {
      if (!f.active) return { record, refused: null, removed: null };
      const r = limitUnpinned(world, put({ ...f, active: false, members: keptMembers(f.members) }));
      return { record: r.record, refused: null, removed: r.removed };
    }
    case 'pin': {
      if (f.active) return { record, refused: null, removed: null };
      if (f.extinct !== null) return refuse(FAVORITE_REFUSALS.extinct);
      if (activeCount >= FAVORITES_ACTIVE_MAX) return refuse(FAVORITE_REFUSALS.full);
      if (record.favorites.some((x) => x.active && x.rootBirthId === f.rootBirthId))
        return refuse(FAVORITE_REFUSALS.already);
      const probe = new FavoriteTracker(world, { ...record, favorites: [{ ...f, active: true }] });
      const members = probe.materialize({ ...record, favorites: [{ ...f, active: true }] }).favorites[0]!
        .members;
      if (members.length === 0) return refuse(FAVORITE_REFUSALS.empty);
      return { record: put({ ...f, active: true, members }), refused: null, removed: null };
    }
  }
}

/** Seconds of dish time as m:ss (the captions' sim time). */
export function dishSeconds(tick: number): string {
  const s = Math.max(0, Math.floor(tick / TICKS_PER_SECOND));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** What reconcileFavorites changed (the host announces it as a 'favoritesRestored' change). */
export interface FavoritesReconciled {
  readonly record: NotebookRecord;
  readonly changed: boolean;
  /** Display names of favorites removed: the organisms they began with are not in the restored dish. */
  readonly removed: readonly string[];
  /** Display names of older unpinned favorites removed to keep FAVORITES_UNPINNED_MAX (as removedText says). */
  readonly dropped: readonly string[];
}

/**
 * The favorites checked against a world restored to an earlier moment (Undo, a rollback). The notebook is
 * kept across them like the journal (D-0031), but what it says about the dish must stay true of the dish
 * now (Honest labels; D08 §06 "If no descendants survive", "never pretends they are the extinct family"):
 *
 * - a favorite whose family root was born or introduced after that moment is removed (its birth id will
 *   be given to another organism; it never existed in this dish's past);
 * - member, representative and last-member birth ids from after that moment are dropped (the
 *   representative becomes the first living member by birth tick, then id, or the root);
 * - a family recorded as extinct whose members are back (living or held in the sample) is no longer
 *   extinct: followed again if a place is free, else unpinned (Pin again works);
 * - an extinction recorded after that moment whose family is not present is withdrawn (unpinned, no
 *   extinction record: nothing was observed in this dish's time);
 * - a followed family with no member present is unpinned.
 *
 * Reads the world only. The order of the favorites and their ids are kept.
 */
export function reconcileFavorites(world: World, record: NotebookRecord): FavoritesReconciled {
  const next = world.counters.nextBirthId;
  const removed: string[] = [];
  let changed = false;
  const kept: FavoriteRecord[] = [];
  for (const f of record.favorites) {
    if (f.rootBirthId >= next) {
      removed.push(favoriteName(world, f));
      changed = true;
      continue;
    }
    kept.push(f);
  }
  let active = kept.filter((f) => f.active).length;
  const out = kept.map((f0) => {
    let f = f0;
    const members = f.members.filter(([b]) => b < next);
    if (members.length !== f.members.length) f = { ...f, members };
    const ext = f.extinct;
    if (f.active || ext !== null) {
      const seeds: [number, number][] = f.members.map(([b, t]) => [b, t]);
      if (ext !== null && ext.lastBirthId < next && !seeds.some(([b]) => b === ext.lastBirthId))
        seeds.push([ext.lastBirthId, -1]);
      const probeRecord: NotebookRecord = {
        ...record,
        favorites: [{ ...f, active: true, extinct: null, members: seeds.sort((a, b) => a[0] - b[0]) }],
      };
      const probe = new FavoriteTracker(world, probeRecord);
      const present = probe.memberCount(f.id);
      if (present > 0) {
        const now = probe.materialize(probeRecord).favorites[0]!.members;
        if (ext !== null) {
          // Its members are back: the extinction was recorded by a change that is no longer in the dish.
          const follow = active < FAVORITES_ACTIVE_MAX;
          if (follow) active++;
          f = { ...f, active: follow, extinct: null, members: follow ? now : keptMembers(now) };
        }
      } else if (f.active) {
        active--;
        f = { ...f, active: false, members: [] };
      } else if (ext !== null && (ext.tick > world.tick || ext.lastBirthId >= next)) {
        f = { ...f, extinct: null };
      }
    }
    if (f.representative >= next) {
      const probe = new FavoriteTracker(world, {
        ...record,
        favorites: [{ ...f, active: true, extinct: null }],
      });
      const order = probe.materialize({ ...record, favorites: [{ ...f, active: true, extinct: null }] })
        .favorites[0]!.members;
      const first = [...order].sort(byBirth)[0];
      f = { ...f, representative: first ? first[0] : f.rootBirthId };
    }
    if (f !== f0) changed = true;
    return f;
  });
  const dropped: string[] = [];
  if (!changed) return { record, changed: false, removed, dropped };
  // A followed family unpinned above can take the unpinned list past its limit: the usual rule applies.
  let limited: NotebookRecord = { ...record, favorites: out };
  for (;;) {
    const r = limitUnpinned(world, limited);
    if (r.removed === null) break;
    dropped.push(r.removed);
    limited = r.record;
  }
  return { record: limited, changed, removed, dropped };
}
