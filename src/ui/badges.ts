/**
 * Relationships seen and badges (P3.8; D-0039; SPEC §14 "Discovery badges are cosmetic").
 *
 * A device-local store (localStorage 'pixelmeba.relationships'): the first time each relationship
 * showed in one of the player's dishes, as the worker's watcher recorded it (src/worker/relationships.ts).
 * It is per-device progress like badges: never written through the dish journal, never into a save,
 * never read by any world. Every read and write is in try/catch; a device that refuses storage simply
 * shows nothing as seen.
 *
 * Badges are derived only from these records: one per kind of relationship seen. No counts, streaks or
 * timers, and no effect on any dish.
 */
import { signal } from '@preact/signals';
import type { RelationshipSeen } from '@worker/protocol';

export const RELATIONSHIPS_KEY = 'pixelmeba.relationships';

/** One relationship as first seen on this device. */
export interface RelationshipRecord {
  readonly relationshipId: string;
  readonly dishName: string;
  readonly worldId: string;
  /** Simulated second it was first seen in that dish. */
  readonly second: number;
  readonly eventId?: number;
}

/** The part of Storage this store uses (tests pass their own). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The browser's localStorage, or null where reading it throws (private modes, blocked storage). */
export function deviceStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const KIND_RE = /^(eats|catches|infects|attaches|bursts|drains|converts):[A-Z][0-9]{2}:[A-Za-z0-9]+$/;

function isRecord(x: unknown): x is RelationshipRecord {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.relationshipId === 'string' &&
    KIND_RE.test(r.relationshipId) &&
    typeof r.dishName === 'string' &&
    typeof r.worldId === 'string' &&
    typeof r.second === 'number' &&
    Number.isFinite(r.second) &&
    (r.eventId === undefined || typeof r.eventId === 'number')
  );
}

/** Every stored record (malformed ones are skipped); [] when storage is missing, empty, unreadable or throws. */
export function readRelationships(storage: StorageLike | null = deviceStorage()): RelationshipRecord[] {
  if (!storage) return [];
  try {
    const text = storage.getItem(RELATIONSHIPS_KEY);
    if (text === null) return [];
    const data: unknown = JSON.parse(text);
    return Array.isArray(data) ? data.filter(isRecord) : [];
  } catch {
    return [];
  }
}

/** Store the records; false when storage refused (nothing else changes). */
export function writeRelationships(records: readonly RelationshipRecord[], storage: StorageLike | null = deviceStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(RELATIONSHIPS_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

/** The worker's answer for one dish (protocol 'relationships' reply). */
export interface DishRelationships {
  readonly worldId: string;
  readonly dishName: string;
  readonly entries: readonly RelationshipSeen[];
}

/**
 * Merge a dish's first-seen entries into the device records: a relationship already on record keeps its
 * first sighting; a new one is added. Pure. Returns the merged list and how many were new.
 */
export function mergeRelationships(existing: readonly RelationshipRecord[], dish: DishRelationships): { records: RelationshipRecord[]; added: number } {
  const records = existing.slice();
  const known = new Set(records.map((r) => r.relationshipId));
  let added = 0;
  for (const e of dish.entries) {
    if (!KIND_RE.test(e.relationshipId) || known.has(e.relationshipId)) continue;
    known.add(e.relationshipId);
    records.push({
      relationshipId: e.relationshipId,
      dishName: dish.dishName,
      worldId: dish.worldId,
      second: e.second,
      ...(e.eventId !== undefined ? { eventId: e.eventId } : {}),
    });
    added++;
  }
  return { records, added };
}

/** Bumped whenever this session stores new records, so the guide re-reads the store. */
export const relationshipsVersion = signal(0);

/** Merge a worker answer into the device store (read, merge, write; each step guarded). */
export function recordRelationships(dish: DishRelationships, storage: StorageLike | null = deviceStorage()): number {
  const { records, added } = mergeRelationships(readRelationships(storage), dish);
  if (added > 0 && writeRelationships(records, storage)) relationshipsVersion.value++;
  return added;
}

/** Parts of a relationship id. */
export function relationshipParts(id: string): { kind: string; actor: string; target: string } {
  const [kind = '', actor = '', target = ''] = id.split(':');
  return { kind, actor, target };
}

/**
 * The records a guide entry shows under "Seen in your dishes": for a species, those it acted in or was
 * the target of; for a material, those about its pool (`pools`) or its enzyme (`enzymes`).
 */
export function seenFor(
  records: readonly RelationshipRecord[],
  entry: { readonly speciesId?: string; readonly pools?: readonly string[]; readonly enzymes?: readonly string[] },
): RelationshipRecord[] {
  return records.filter((r) => {
    const p = relationshipParts(r.relationshipId);
    if (entry.speciesId !== undefined) return p.actor === entry.speciesId || p.target === entry.speciesId;
    if (p.kind === 'eats') return entry.pools?.includes(p.target) === true;
    if (p.kind === 'converts') return entry.enzymes?.includes(p.target) === true;
    return false;
  });
}

/** One cosmetic badge: a kind of relationship seen, with the record that earned it (the first one). */
export interface Badge {
  readonly kind: string;
  readonly first: RelationshipRecord;
}

/** Badges derived only from the records, in a fixed order of kinds. */
export const BADGE_KINDS = ['eats', 'catches', 'infects', 'bursts', 'attaches', 'drains', 'converts'] as const;

export function badgesFrom(records: readonly RelationshipRecord[]): Badge[] {
  const out: Badge[] = [];
  for (const kind of BADGE_KINDS) {
    const first = records.find((r) => relationshipParts(r.relationshipId).kind === kind);
    if (first) out.push({ kind, first });
  }
  return out;
}

/** Badges an entry's own records earned (shown on that entry). */
export function entryBadges(records: readonly RelationshipRecord[]): Badge[] {
  return badgesFrom(records);
}
