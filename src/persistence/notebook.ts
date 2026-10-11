/**
 * The per-dish notebook record (D-0070; g4-plan.md call 1; ARCH §11.2's "presentation" block): the
 * player's favorites (P4.1), and from stage 2 story cards and goal progress, kept next to the world save.
 *
 * - It is never in the world state, its checksum or its stateHash, and nothing in src/sim imports this
 *   file: a notebook can never alter how a dish runs (SPEC §12.6 "Favorites never alter behavior").
 * - It has its own format, version and checksum (sha256 over the canonical record without `checksum`).
 * - Every kind is validated through one table (KIND_PROBLEMS). A missing kind key reads as [] (an explicit
 *   default, SPEC §14.5); an unknown key is a problem. A record with any problem is dropped with a message
 *   by the loader (saveFile.ts loadSaveFile) and the world still loads.
 * - No organism data is copied in (D08 "Do not store a duplicate organism"): a favorite holds lineage
 *   references (birth ids and birth ticks) only.
 */
import { AGENT_CAP, CELL_COUNT } from '@sim/constants';
import { canonicalJson, sha256Hex } from '@sim/hash';
import { goalsProblem, goalsWorldProblem, type GoalRecord } from './notebookGoals';
import { storiesProblem, storiesRefsProblem, type StoryCard } from './notebookStories';

export const NOTEBOOK_FORMAT = 'pixelmeba-notebook';
export const NOTEBOOK_VERSION = 1;
/**
 * Largest record (canonical JSON) a file may carry. 1 MB, not 256 KB: a legal favorites record can pass
 * 256 KB (three nested active families of up to 6,000 living members at ≈ 17 bytes per [birthId,
 * birthTick] pair ≈ 306 KB, plus 20 unpinned records of up to 200 members), and an oversized record would
 * be dropped at the next load. PROPOSED DECISION in docs/reports/reviews/g4-wave-5a/favorites-build.md.
 */
export const NOTEBOOK_MAX_BYTES = 1024 * 1024;
/** CT §12.10 "favorites 3": active favorites per dish. */
export const FAVORITES_ACTIVE_MAX = 3;
/** Unpinned favorites kept per dish (the 21st removes the oldest unpinned extinct record, else the oldest unpinned). */
export const FAVORITES_UNPINNED_MAX = 20;
/** Members an unpinned favorite keeps (the first by birth tick, then birth id; "Pin again" also walks from the root). */
export const UNPINNED_MEMBERS_KEPT = 200;
/** CT §12.10 "name fields ≤ 60 chars". */
export const NICKNAME_MAX = 60;

export type FavoritePattern = 'circle' | 'triangle' | 'square';
export const FAVORITE_PATTERNS: readonly FavoritePattern[] = ['circle', 'triangle', 'square'];

export interface FavoriteExtinction {
  /** The tick at which no member remained. */
  readonly tick: number;
  /** The last member recorded (the youngest of those removed in that tick). */
  readonly lastBirthId: number;
  /** Its lineage deathCause (a reason code; 0 when the record was not kept). */
  readonly cause: number;
  /** Its last recorded cell (-1: not seen in the dish since the record was rebuilt, e.g. lifted into a sample before a reload). */
  readonly cell: number;
}

export interface FavoriteRecord {
  /** 'fav-<n>' from the record's nextFavorite; never reused. */
  readonly id: string;
  /** buildFamily(world, birthId).rootBirthId when it was followed. */
  readonly rootBirthId: number;
  readonly speciesId: string;
  readonly nickname: string | null;
  readonly pattern: FavoritePattern;
  /** The organism Find selects (the player's choice; "Follow next" offers the next one when it is gone). */
  readonly representative: number;
  readonly active: boolean;
  readonly createdTick: number;
  /** Living members as [birthId, birthTick] (-1: birth tick no longer recorded), ascending birthId. */
  readonly members: readonly (readonly [number, number])[];
  readonly historyIncomplete: boolean;
  readonly extinct: FavoriteExtinction | null;
}

export interface NotebookRecord {
  readonly format: typeof NOTEBOOK_FORMAT;
  readonly notebookVersion: number;
  readonly worldId: string;
  readonly favorites: readonly FavoriteRecord[];
  readonly nextFavorite: number;
  /** P4.4: goal attempts (src/persistence/notebookGoals.ts); absent in records written before them (reads as []). */
  readonly goals?: readonly GoalRecord[];
  /** P4.2: story cards (src/persistence/notebookStories.ts); absent in records written before them (reads as []). */
  readonly stories?: readonly StoryCard[];
  readonly checksum: string;
}

/** The message a dropped notebook shows (the dish itself loaded). */
export const NOTEBOOK_DROPPED_TEXT =
  "This dish's notebook (favorites, story cards and goals) could not be read, so it was left out. The dish itself loaded.";

export function emptyNotebook(worldId: string): NotebookRecord {
  return {
    format: NOTEBOOK_FORMAT,
    notebookVersion: NOTEBOOK_VERSION,
    worldId,
    favorites: [],
    nextFavorite: 1,
    checksum: '',
  };
}

/** The record without its checksum, the payload the checksum covers. */
function payloadOf(record: NotebookRecord): Omit<NotebookRecord, 'checksum'> {
  const { checksum: _checksum, ...rest } = record;
  return rest;
}

/** The record with its checksum computed (sha256 over the canonical record without `checksum`). */
export async function sealNotebook(record: NotebookRecord): Promise<NotebookRecord> {
  const payload = payloadOf(record);
  return { ...payload, checksum: `sha256:${await sha256Hex(canonicalJson(payload))}` };
}

/** A nickname as saveFile.ts cleanName cleans a dish name: control characters become spaces, trimmed, at most 60 characters; empty is null. */
export function cleanNickname(name: string | null | undefined): string | null {
  if (typeof name !== 'string') return null;
  const s = Array.from(name)
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
    .join('')
    .trim();
  const clipped = Array.from(s).slice(0, NICKNAME_MAX).join('').trim();
  return clipped.length > 0 ? clipped : null;
}

const isInt = (v: unknown, min: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min;
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const FAVORITE_KEYS = [
  'id',
  'rootBirthId',
  'speciesId',
  'nickname',
  'pattern',
  'representative',
  'active',
  'createdTick',
  'members',
  'historyIncomplete',
  'extinct',
];

/** The first problem with one favorite record, or null. `next`: the record's nextFavorite. */
function favoriteProblem(raw: unknown, next: number): string | null {
  if (!isObj(raw)) return 'a favorite is not an object';
  for (const k of Object.keys(raw))
    if (!FAVORITE_KEYS.includes(k)) return `a favorite has an unknown field "${k.slice(0, 40)}"`;
  const m = typeof raw.id === 'string' ? /^fav-([1-9][0-9]{0,8})$/.exec(raw.id) : null;
  if (!m || Number(m[1]) >= next) return 'a favorite has an invalid id';
  if (!isInt(raw.rootBirthId, 1)) return 'a favorite has an invalid family root';
  if (typeof raw.speciesId !== 'string' || !/^[A-Z][A-Z0-9_]{0,31}$/.test(raw.speciesId))
    return 'a favorite has an invalid species';
  if (
    raw.nickname !== null &&
    (typeof raw.nickname !== 'string' || cleanNickname(raw.nickname) !== raw.nickname)
  )
    return 'a favorite has an invalid nickname';
  if (!FAVORITE_PATTERNS.includes(raw.pattern as FavoritePattern))
    return 'a favorite has an unknown marker pattern';
  if (!isInt(raw.representative, 1)) return 'a favorite has an invalid representative';
  if (typeof raw.active !== 'boolean' || typeof raw.historyIncomplete !== 'boolean')
    return 'a favorite has an invalid flag';
  if (!isInt(raw.createdTick, 0)) return 'a favorite has an invalid start tick';
  if (!Array.isArray(raw.members) || raw.members.length > AGENT_CAP)
    return 'a favorite has an invalid member list';
  let last = 0;
  for (const p of raw.members as unknown[]) {
    if (!Array.isArray(p) || p.length !== 2 || !isInt(p[0], 1) || !isInt(p[1], -1) || p[0] <= last)
      return 'a favorite has an invalid member';
    last = p[0];
  }
  const x = raw.extinct;
  if (x !== null) {
    if (!isObj(x) || Object.keys(x).some((k) => !['tick', 'lastBirthId', 'cause', 'cell'].includes(k)))
      return 'a favorite has an invalid extinction record';
    if (
      !isInt(x.tick, 0) ||
      !isInt(x.lastBirthId, 1) ||
      !isInt(x.cause, -1) ||
      !isInt(x.cell, -1) ||
      x.cell >= CELL_COUNT
    )
      return 'a favorite has an invalid extinction record';
    if (raw.active) return 'a favorite with no members left is still followed';
  }
  return null;
}

/** The first problem with the favorites kind, or null. */
function favoritesProblem(raw: unknown, record: Record<string, unknown>): string | null {
  if (!Array.isArray(raw)) return 'favorites is not a list';
  if (raw.length > FAVORITES_ACTIVE_MAX + FAVORITES_UNPINNED_MAX) return 'too many favorites';
  const next = record.nextFavorite as number;
  const ids: string[] = [];
  let active = 0;
  for (const f of raw as unknown[]) {
    const p = favoriteProblem(f, next);
    if (p) return p;
    const r = f as FavoriteRecord;
    if (ids.includes(r.id)) return 'two favorites share an id';
    ids.push(r.id);
    if (r.active) active++;
  }
  if (active > FAVORITES_ACTIVE_MAX) return `more than ${FAVORITES_ACTIVE_MAX} families are followed`;
  if (raw.length - active > FAVORITES_UNPINNED_MAX) return 'too many unpinned favorites';
  return null;
}

/**
 * What a record's references are checked against (fix round 1; CLAUDE.md "Unknown IDs are errors"): the
 * dish the file carries. Plain values, so this file still imports nothing from the world model.
 */
export interface NotebookWorldRefs {
  /** The species the dish recorded (world.species ids). */
  readonly speciesIds: readonly string[];
  /** world.counters.nextBirthId: every birth id the record names is below it. */
  readonly nextBirthId: number;
  /** world.tick: no extinction is recorded after it. */
  readonly tick: number;
}

/** The first favorite that names a species, an organism or a time the dish never had, or null. */
function worldRefsProblem(raw: Record<string, unknown>, refs: NotebookWorldRefs): string | null {
  const favorites = (raw.favorites ?? []) as readonly FavoriteRecord[];
  for (const f of favorites) {
    if (!refs.speciesIds.includes(f.speciesId)) return 'a favorite names a species this dish does not have';
    const ids = [
      f.rootBirthId,
      f.representative,
      ...f.members.map(([b]) => b),
      ...(f.extinct ? [f.extinct.lastBirthId] : []),
    ];
    if (ids.some((b) => b >= refs.nextBirthId)) return 'a favorite names an organism this dish never had';
    if (f.extinct && f.extinct.tick > refs.tick)
      return 'a favorite records an extinction after the dish’s time';
  }
  const goals = goalsWorldProblem(raw, refs); // P4.4
  if (goals) return goals;
  const stories = storiesRefsProblem(raw.stories, refs); // P4.2
  if (stories) return stories;
  return null;
}

/** One validator per kind (stage 2 adds 'stories' and 'goals': one entry each, and one optional key each on NotebookRecord). */
const KIND_PROBLEMS: Readonly<
  Record<string, (raw: unknown, record: Record<string, unknown>) => string | null>
> = {
  favorites: favoritesProblem,
  goals: goalsProblem, // P4.4 (notebookGoals.ts)
  stories: storiesProblem, // P4.2 (notebookStories.ts)
};
const ENVELOPE_KEYS = ['format', 'notebookVersion', 'worldId', 'nextFavorite', 'checksum'];

/**
 * The first problem with a stored notebook record for the world `worldId`, or null: the envelope, the
 * version (≤ NOTEBOOK_VERSION), the world id, every kind, the size and the checksum. A missing kind key
 * reads as [] (it is checked as such); an unknown key is a problem. Never throws.
 */
export async function notebookProblem(
  raw: unknown,
  worldId: string,
  refs?: NotebookWorldRefs,
): Promise<string | null> {
  try {
    if (!isObj(raw)) return 'the notebook is not an object';
    if (raw.format !== NOTEBOOK_FORMAT) return 'the notebook has an unknown format';
    if (!isInt(raw.notebookVersion, 1)) return 'the notebook version is invalid';
    if (raw.notebookVersion > NOTEBOOK_VERSION)
      return `the notebook needs a newer version of Pixelmeba (notebook version ${raw.notebookVersion})`;
    if (raw.worldId !== worldId) return 'the notebook belongs to another dish';
    if (!isInt(raw.nextFavorite, 1)) return 'the notebook counter is invalid';
    if (typeof raw.checksum !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(raw.checksum))
      return 'the notebook checksum is missing';
    // Own keys only (fix round 1): `in` would also accept Object.prototype names such as "constructor".
    for (const k of Object.keys(raw))
      if (!ENVELOPE_KEYS.includes(k) && !Object.prototype.hasOwnProperty.call(KIND_PROBLEMS, k))
        return `the notebook has an unknown section "${k.slice(0, 40)}"`;
    for (const k of Object.keys(KIND_PROBLEMS)) {
      // Only an absent kind reads as [] (SPEC §14.5); an explicit null is a problem like any other non-list.
      const p = KIND_PROBLEMS[k]!(raw[k] === undefined ? [] : raw[k], raw);
      if (p) return p;
    }
    if (refs) {
      const p = worldRefsProblem(raw, refs);
      if (p) return p;
    }
    const { checksum, ...payload } = raw;
    const text = canonicalJson(payload);
    if (text.length > NOTEBOOK_MAX_BYTES) return 'the notebook is too large';
    if (checksum !== `sha256:${await sha256Hex(text)}`)
      return 'the notebook is damaged or was edited (checksum mismatch)';
    return null;
  } catch (e) {
    return `the notebook cannot be read (${e instanceof Error ? e.message : String(e)})`;
  }
}

/**
 * Read a stored notebook for `worldId`. Absent (every file written before P4.1): an empty notebook, no
 * message (migration by copy with explicit defaults, SPEC §14.5). Any problem: an empty notebook and the
 * message `dropped` (the world itself is unaffected). Never throws.
 */
export async function readNotebook(
  raw: unknown,
  worldId: string,
  refs?: NotebookWorldRefs,
): Promise<{ record: NotebookRecord; dropped: string | null }> {
  if (raw === undefined || raw === null) return { record: emptyNotebook(worldId), dropped: null };
  const problem = await notebookProblem(raw, worldId, refs);
  if (problem !== null) return { record: emptyNotebook(worldId), dropped: NOTEBOOK_DROPPED_TEXT };
  const r = raw as Record<string, unknown>;
  // Explicit defaults for a missing kind (SPEC §14.5).
  return {
    record: {
      ...(r as unknown as NotebookRecord),
      favorites: (r.favorites as FavoriteRecord[] | undefined) ?? [],
    },
    dropped: null,
  };
}

/** The record as an export without names carries it: every nickname null (SPEC §12.6, §14.4). Unsealed. */
export function notebookWithoutNicknames(record: NotebookRecord): NotebookRecord {
  return {
    ...record,
    favorites: record.favorites.map((f) => (f.nickname === null ? f : { ...f, nickname: null })),
  };
}

/** True when the record holds nothing (no favorite, followed or not). Such a record is not written to a file. */
export function notebookIsEmpty(record: NotebookRecord): boolean {
  return record.favorites.length === 0 && (record.goals ?? []).length === 0 && (record.stories ?? []).length === 0;
}

/** Whether any favorite carries a nickname. */
export function notebookHasNicknames(record: NotebookRecord): boolean {
  return record.favorites.some((f) => f.nickname !== null);
}

/**
 * The record a copy of the dish starts with (Duplicate, an opened checkpoint branch): the favorites
 * only, under the copy's world id. PROPOSED DECISION: story cards and goal attempts belong to the world
 * they were recorded in, so stage 2's kinds are not copied. Unsealed.
 */
export function favoritesOnly(record: NotebookRecord, worldId: string): NotebookRecord {
  return { ...emptyNotebook(worldId), favorites: record.favorites, nextFavorite: record.nextFavorite };
}
