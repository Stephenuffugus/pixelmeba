/**
 * P3.8 badges and the "seen in your dishes" device store (D-0039; src/ui/badges.ts). Pure functions:
 * - badges derive only from store records (one per kind seen; nothing else feeds them);
 * - merging keeps the first sighting and ignores malformed ids;
 * - a throwing or missing localStorage leaves everything working (reads give [], writes report false);
 * - nothing here writes a world: the only thing written is the one localStorage key.
 */
import { describe, expect, it } from 'vitest';
import {
  BADGE_KINDS,
  badgesFrom,
  mergeRelationships,
  readRelationships,
  recordRelationships,
  RELATIONSHIPS_KEY,
  seenFor,
  writeRelationships,
  type RelationshipRecord,
  type StorageLike,
} from '../../src/ui/badges';
import { BADGE_COPY, relationshipSentence } from '../../src/ui/strings/guide';

class MemStorage implements StorageLike {
  readonly data = new Map<string, string>();
  readonly writes: string[] = [];
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.writes.push(k);
    this.data.set(k, v);
  }
}

const throwing: StorageLike = {
  getItem() {
    throw new Error('SecurityError: storage is blocked');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
};

const rec = (relationshipId: string, second = 5, dishName = 'My dish'): RelationshipRecord => ({ relationshipId, dishName, worldId: 'w-1', second });

describe('badges (cosmetic; derived only from the device record)', () => {
  it('no records, no badges; one badge per kind seen, earned by its first record', () => {
    expect(badgesFrom([])).toEqual([]);
    const records = [rec('eats:B04:detritus', 3), rec('eats:B01:sugar', 1), rec('catches:P02:B01', 9)];
    const badges = badgesFrom(records);
    expect(badges.map((b) => b.kind)).toEqual(['eats', 'catches']);
    expect(badges[0]!.first.relationshipId).toBe('eats:B04:detritus');
    // The same records always give the same badges (no clock, streak or count is involved).
    expect(badgesFrom(records)).toEqual(badges);
    for (const k of BADGE_KINDS) expect(BADGE_COPY[k], k).toBeDefined();
    expect(JSON.stringify(BADGE_COPY)).not.toMatch(/superior|advanced|perfect|adapted|immune|streak|\d+ of \d+/i);
  });

  it('merge keeps the first sighting and skips malformed ids', () => {
    const first = mergeRelationships([], { worldId: 'w-1', dishName: 'A', entries: [{ relationshipId: 'eats:B04:detritus', second: 4 }] });
    expect(first.added).toBe(1);
    const again = mergeRelationships(first.records, {
      worldId: 'w-2',
      dishName: 'B',
      entries: [
        { relationshipId: 'eats:B04:detritus', second: 1 },
        { relationshipId: 'bursts:V01:B01', second: 30, eventId: 77 },
        { relationshipId: 'nonsense', second: 2 },
      ],
    });
    expect(again.added).toBe(1);
    expect(again.records).toEqual([
      { relationshipId: 'eats:B04:detritus', dishName: 'A', worldId: 'w-1', second: 4 },
      { relationshipId: 'bursts:V01:B01', dishName: 'B', worldId: 'w-2', second: 30, eventId: 77 },
    ]);
  });

  it('round-trips through storage; malformed stored rows are dropped', () => {
    const s = new MemStorage();
    expect(writeRelationships([rec('catches:P01:B01')], s)).toBe(true);
    expect(readRelationships(s)).toEqual([rec('catches:P01:B01')]);
    s.data.set(RELATIONSHIPS_KEY, JSON.stringify([rec('catches:P01:B01'), { relationshipId: 7 }, 'x', null]));
    expect(readRelationships(s)).toEqual([rec('catches:P01:B01')]);
    s.data.set(RELATIONSHIPS_KEY, '{not json');
    expect(readRelationships(s)).toEqual([]);
  });

  it('a throwing or missing localStorage leaves the guide working: reads give nothing, writes report false', () => {
    expect(readRelationships(throwing)).toEqual([]);
    expect(writeRelationships([rec('eats:B01:sugar')], throwing)).toBe(false);
    expect(recordRelationships({ worldId: 'w', dishName: 'd', entries: [{ relationshipId: 'eats:B01:sugar', second: 1 }] }, throwing)).toBe(1);
    expect(readRelationships(null)).toEqual([]);
    expect(writeRelationships([], null)).toBe(false);
    expect(badgesFrom(readRelationships(throwing))).toEqual([]);
    expect(seenFor(readRelationships(throwing), { speciesId: 'B04' })).toEqual([]);
  });

  it('nothing writes a world: recording only writes the one device key', () => {
    const s = new MemStorage();
    recordRelationships({ worldId: 'w', dishName: 'd', entries: [{ relationshipId: 'eats:B04:detritus', second: 2 }] }, s);
    recordRelationships({ worldId: 'w', dishName: 'd', entries: [{ relationshipId: 'eats:B04:detritus', second: 2 }] }, s); // nothing new: no write
    expect(s.writes).toEqual([RELATIONSHIPS_KEY]);
    expect([...s.data.keys()]).toEqual([RELATIONSHIPS_KEY]);
  });

  it('entries see their own records; sentences name only what was measured', () => {
    const records = [rec('eats:B04:detritus'), rec('catches:P02:B01'), rec('bursts:V01:B01'), rec('converts:B06:starch'), rec('eats:A01:co2')];
    expect(seenFor(records, { speciesId: 'B04' }).map((r) => r.relationshipId)).toEqual(['eats:B04:detritus']);
    expect(seenFor(records, { speciesId: 'B01' }).map((r) => r.relationshipId)).toEqual(['catches:P02:B01', 'bursts:V01:B01']);
    expect(seenFor(records, { pools: ['detritus'], enzymes: [] }).map((r) => r.relationshipId)).toEqual(['eats:B04:detritus']);
    expect(seenFor(records, { pools: ['starch'], enzymes: ['starch'] }).map((r) => r.relationshipId)).toEqual(['converts:B06:starch']);
    const names: Record<string, string> = { B04: 'Recycler', P02: 'Ciliate', B01: 'Sprinter', V01: 'Pinphage', B06: 'Crumbsmith', A01: 'Sunbead', P01: 'Amoeba' };
    const say = (id: string) => relationshipSentence(id, (x) => names[x] ?? x);
    expect(say('eats:B04:detritus')).toBe('Recycler ate debris');
    expect(say('catches:P02:B01')).toBe('Ciliate caught a Sprinter');
    expect(say('bursts:V01:B01')).toBe('Pinphage burst a Sprinter');
    expect(say('catches:P02:P01')).toBe('Ciliate caught an Amoeba');
    expect(say('converts:B06:starch')).toBe('Crumbsmith’s enzyme turned starch into sugar');
    expect(say('eats:B04:film')).toBe('Recycler ate biofilm');
    expect(say('eats:B04:plutonium')).toBeNull();
  });
});
