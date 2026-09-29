/**
 * P2.8 Notebook → Journal, observed relationships: the player's "I saw X coincide with Y" entries
 * persist on this device and list newest first together with experiment stamps (the existing stamp
 * API is unchanged); both parts are required, cleaned to plain text and bounded; the wording is always
 * "coincide(d) with", never a cause; entries that belong to a dish go to the dish sink (kept with its
 * saves); entries brought back from a dish's save merge into the list without duplicates.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  };
}

const STAMP = {
  kind: 'experimentStamp' as const,
  experimentId: 'EXP_A',
  title: 'Starch helpers',
  journalStamp: 'Measured sugar made from starch',
  label: 'this paired run',
  labels: [],
  recordedAt: '2026-09-28T09:00:00.000Z',
  reachedAtSecond: 60,
  seed: 104729,
  recipeId: 'EXP_A_V1',
  recipeRevision: 1,
  contentVersion: 1,
  contentHash: 'h',
  dishName: 'Starch helpers',
  gate: [],
  measures: [],
  prediction: '',
};

const DISH = { worldId: 'world-1', name: 'Garden', second: 95, recipeId: 'FIRST_DISH_V1', seed: 104729 };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('journal observations (P2.8)', () => {
  it('records "I saw X coincide with Y" with the dish and time, lists it with stamps newest first, and keeps it after a reload', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const j = await import('../../src/ui/journal');
    j.addJournalEntry(STAMP);
    const r = j.addObservation({
      saw: '  the Sprinters crowding\nthe top left ',
      coincidedWith: 'the sugar patch getting smaller',
      dish: DISH,
      link: {
        kind: 'stamp',
        id: j.journal.value[0]!.id,
        title: STAMP.title,
        journalStamp: STAMP.journalStamp,
      },
      recordedAt: '2026-09-28T09:05:00.000Z',
    });
    if ('error' in r) throw new Error(r.error);
    expect(r.stored).toBe(true);
    expect(r.entry).toMatchObject({
      kind: 'observation',
      version: 1,
      saw: 'the Sprinters crowding the top left',
      coincidedWith: 'the sugar patch getting smaller',
      dish: { name: 'Garden', second: 95, recipeId: 'FIRST_DISH_V1', seed: 104729 },
      worldId: 'world-1',
      link: { kind: 'stamp', title: 'Starch helpers' },
    });
    expect(j.journal.value.map((e) => e.kind)).toEqual(['observation', 'experimentStamp']);
    expect(j.observationSentence(r.entry)).toBe(
      'I saw the Sprinters crowding the top left coincide with the sugar patch getting smaller.',
    );
    vi.resetModules(); // a reload reads storage again
    const again = await import('../../src/ui/journal');
    expect(again.journal.value).toHaveLength(2);
    expect(again.journal.value[0]).toEqual(r.entry);
    // Stamps keep their API: experimentId / reachedAtSecond read on any entry (undefined for notes).
    expect(again.journal.value.map((e) => e.experimentId)).toEqual([undefined, 'EXP_A']);
  });

  it('requires both parts, cleans them to plain text of at most 120 characters, and a note may stand without a dish', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const j = await import('../../src/ui/journal');
    expect(j.addObservation({ saw: '   ', coincidedWith: 'x', dish: null, link: null })).toEqual({
      error: 'Write what you saw.',
    });
    expect(j.addObservation({ saw: 'x', coincidedWith: '\n\t', dish: null, link: null })).toEqual({
      error: 'Write what it coincided with.',
    });
    expect(j.journal.value).toEqual([]);
    const r = j.addObservation({
      saw: 'a'.repeat(300),
      coincidedWith: '<b>bloom</b>\u0007',
      dish: null,
      link: null,
    });
    if ('error' in r) throw new Error(r.error);
    expect(r.entry.saw).toHaveLength(j.OBSERVATION_MAX);
    expect(r.entry.coincidedWith).toBe('<b>bloom</b>'); // plain text: shown escaped, never as markup
    expect(r.entry.dish).toBeNull();
    expect('worldId' in r.entry).toBe(false);
  });

  it('sends entries that belong to a dish (and stamp changes) to the dish sink', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const j = await import('../../src/ui/journal');
    const sent: unknown[] = [];
    j.setJournalSink((e) => sent.push(e));
    const note = j.addObservation({
      saw: 'films on the stones',
      coincidedWith: 'the light going down',
      dish: DISH,
      link: null,
    });
    const { entry } = j.addJournalEntry({ ...STAMP, worldId: 'world-1' });
    j.updateJournalEntry(entry.id, { conclusion: 'cantTell' });
    expect(sent).toHaveLength(3);
    expect(sent[0]).toEqual('entry' in note ? note.entry : null);
    expect(sent[2]).toMatchObject({ id: entry.id, conclusion: 'cantTell', worldId: 'world-1' });
  });

  it('merges entries from a dish save once (by id), newest first, dropping anything malformed', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const j = await import('../../src/ui/journal');
    const mine = j.addObservation({
      saw: 'a',
      coincidedWith: 'b',
      dish: DISH,
      link: null,
      recordedAt: '2026-09-28T09:10:00.000Z',
    });
    if ('error' in mine) throw new Error(mine.error);
    const fromSave = [
      mine.entry,
      { ...mine.entry, id: 'observation:older', recordedAt: '2026-09-27T09:00:00.000Z', saw: 'older' },
      { ...mine.entry, id: 'observation:newer', recordedAt: '2026-09-28T11:00:00.000Z', saw: 'newer' },
      { kind: 'observation', id: 'bad' },
      { ...mine.entry, id: 'observation:script', link: { kind: 'url', href: 'x' } },
    ];
    expect(j.mergeJournal(fromSave)).toEqual({ added: 2, notListed: 0 });
    expect(j.journal.value.map((e) => e.id)).toEqual([
      'observation:newer',
      mine.entry.id,
      'observation:older',
    ]);
    expect(j.mergeJournal(fromSave)).toEqual({ added: 0, notListed: 0 });
  });

  it("merging a dish's entries never removes an entry of this device: they only fill free room (fix round 1)", async () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    const j = await import('../../src/ui/journal');
    for (let k = 0; k < 5; k++) {
      const r = j.addObservation({ saw: `my own note ${k}`, coincidedWith: 'something', dish: null, link: null, recordedAt: `2026-09-28T09:0${k}:00.000Z` });
      if ('error' in r) throw new Error(r.error);
    }
    // A friend's shared dish keeps 200 later notes (the verifier's case: they used to push out all 5 of mine for good).
    const imported = Array.from({ length: j.JOURNAL_MAX }, (_, k) => ({
      version: 1,
      kind: 'observation',
      id: `observation:friend:${k}`,
      saw: `friend note ${k}`,
      coincidedWith: 'x',
      recordedAt: `2026-09-29T10:${String(Math.floor(k / 60)).padStart(2, '0')}:${String(k % 60).padStart(2, '0')}.000Z`,
      dish: null,
      link: null,
      worldId: 'friend-world',
    }));
    expect(j.mergeJournal(imported)).toEqual({ added: j.JOURNAL_MAX - 5, notListed: 5 });
    const own = (list: readonly { kind: string; saw?: string }[]) => list.filter((e) => e.kind === 'observation' && e.saw?.startsWith('my own')).length;
    expect(own(j.journal.value)).toBe(5);
    expect(j.journal.value).toHaveLength(j.JOURNAL_MAX);
    expect(own(JSON.parse(storage.getItem(j.JOURNAL_KEY)!) as { kind: string; saw?: string }[])).toBe(5);
    // The newest imported ones were listed; a full Notebook takes none (and removes none).
    expect(j.journal.value.some((e) => e.id === 'observation:friend:199')).toBe(true);
    expect(j.journal.value.some((e) => e.id === 'observation:friend:0')).toBe(false);
    expect(j.mergeJournal([{ ...imported[0], id: 'observation:friend:late', recordedAt: '2030-01-01T00:00:00.000Z' }])).toEqual({ added: 0, notListed: 1 });
    expect(own(j.journal.value)).toBe(5);
  });

  it('after an import fills the Notebook, new entries take the place of copies from that dish, never of an entry of this device, and say so (fix round 2)', async () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    let j = await import('../../src/ui/journal');
    for (let k = 0; k < 5; k++) {
      const r = j.addObservation({ saw: `my own note ${k}`, coincidedWith: 'something', dish: null, link: null, recordedAt: `2026-09-28T09:0${k}:00.000Z` });
      if ('error' in r) throw new Error(r.error);
    }
    // The re-verifier's case: a friend's dish with 195 entries, recorded later than mine (a crafted file could say any time).
    const imported = Array.from({ length: 195 }, (_, k) => ({
      version: 1,
      kind: 'observation',
      id: `observation:friend:${k}`,
      saw: `friend note ${k}`,
      coincidedWith: 'x',
      recordedAt: `2026-09-29T10:${String(Math.floor(k / 60)).padStart(2, '0')}:${String(k % 60).padStart(2, '0')}.000Z`,
      dish: { name: 'Friend dish', second: 10, recipeId: 'FIRST_DISH_V1', seed: 1 },
      link: null,
      worldId: 'friend-world',
    }));
    expect(j.mergeJournal(imported)).toEqual({ added: 195, notListed: 0 });
    expect(j.journal.value).toHaveLength(j.JOURNAL_MAX);
    type Stored = readonly { kind: string; id: string; saw?: string }[];
    const own = (list: Stored) => list.filter((e) => e.kind === 'observation' && !e.id.startsWith('observation:friend:')).length;
    const friends = (list: Stored) => list.filter((e) => e.id.startsWith('observation:friend:')).length;

    // The next own note (the old code removed "my own note 0", which exists in no save, and said only "Added").
    const r = j.addObservation({ saw: 'a new note', coincidedWith: 'the next thing', dish: null, link: null });
    if ('error' in r) throw new Error(r.error);
    expect(r.removed).not.toBeNull();
    expect(r.removed!.fromDish).toBe(true);
    expect(r.removed!.entry.id).toBe('observation:friend:0'); // the oldest copy
    expect(j.journalRemovedText(r.removed!)).toBe(
      'Your Notebook lists up to 200 entries, so it no longer lists the oldest entry that came with “Friend dish” (a copy from that dish\'s save or file).',
    );
    expect(own(j.journal.value as Stored)).toBe(6);
    expect(j.journal.value).toHaveLength(j.JOURNAL_MAX);
    expect(own(JSON.parse(storage.getItem(j.JOURNAL_KEY)!) as Stored)).toBe(6);

    // After a reload the copies are still known as copies: an experiment stamp also takes a copy's place.
    vi.resetModules();
    j = await import('../../src/ui/journal');
    expect(j.isFromDish('observation:friend:1')).toBe(true);
    expect(j.isFromDish(r.entry.id)).toBe(false);
    const st = j.addJournalEntry({ ...STAMP, recordedAt: '2026-09-30T09:00:00.000Z' });
    expect(st.problem).toBeUndefined();
    expect(st.removed).toMatchObject({ fromDish: true, entry: { id: 'observation:friend:1' } });
    expect(own(j.journal.value as Stored)).toBe(6);

    // Only once no copy is left does the oldest entry of this device go, and the player is told which.
    for (let k = 0; k < 193; k++) {
      const x = j.addObservation({ saw: `later note ${k}`, coincidedWith: 'y', dish: null, link: null });
      if ('error' in x) throw new Error(x.error);
      expect(x.removed?.fromDish).toBe(true);
    }
    expect(friends(j.journal.value as Stored)).toBe(0);
    const last = j.addObservation({ saw: 'one more', coincidedWith: 'z', dish: null, link: null });
    if ('error' in last) throw new Error(last.error);
    expect(last.removed).toMatchObject({ fromDish: false, entry: { id: expect.stringMatching(/^observation:2026-09-28T09:00:00.000Z:/) } });
    expect(j.journalRemovedText(last.removed!)).toMatch(
      /^Your Notebook lists up to 200 entries, so its oldest entry was removed: “I saw my own note 0 coincide with something\.”, recorded .+\.$/,
    );
    expect(j.journal.value).toHaveLength(j.JOURNAL_MAX);
  });

  it('an entry the Journal could not read back is refused when it is added, never shown and then lost at the next load (fix round 2)', async () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    const { journalRecordProblem, putJournalEntry, createHistory, JOURNAL_WORLD_ID_MAX } = await import('../../src/sim/history');
    const j = await import('../../src/ui/journal');
    const sent: unknown[] = [];
    j.setJournalSink((e) => sent.push(e));
    // The re-verifier's nested checkpoint branches: a 415-character dish id is now within the bound and kept by the dish.
    const nested = ['dish-mf3a1b2c-1a2b', ...Array.from({ length: 21 }, (_, k) => `dish-mf3a1b${String(k).padStart(2, '0')}-1a2b`)].join('+');
    expect(nested.length).toBeGreaterThan(400);
    const ok = j.addObservation({ saw: 'films on the stones', coincidedWith: 'the lid closing', link: null, dish: { ...DISH, worldId: nested } });
    if ('error' in ok) throw new Error(ok.error);
    expect(journalRecordProblem(ok.entry)).toBeNull();
    expect(putJournalEntry(createHistory(1), ok.entry)).toBe(true);
    // A dish id beyond any real nesting (a crafted file): refused now, with a way out; nothing listed, stored or sent.
    const before = { list: j.journal.value.length, stored: storage.getItem(j.JOURNAL_KEY), sent: sent.length };
    expect(j.addObservation({ saw: 'a', coincidedWith: 'b', link: null, dish: { ...DISH, worldId: 'w'.repeat(JOURNAL_WORLD_ID_MAX + 1) } })).toEqual({
      error: 'This note cannot be kept with this dish (its dish id is too long). Untick “About …” to add it to your Notebook only.',
    });
    // A stamp the validator refuses (a prediction far beyond the bound) is not listed either; the caller is told why.
    const bad = j.addJournalEntry({ ...STAMP, prediction: 'p'.repeat(5000) });
    expect(bad).toMatchObject({ stored: false, problem: 'its prediction is not text' });
    expect({ list: j.journal.value.length, stored: storage.getItem(j.JOURNAL_KEY), sent: sent.length }).toEqual(before);
    // The re-verifier's part B: a link to a comparison card whose change text is long is kept, shortened.
    const change = Array.from({ length: 14 }, (_, k) => `Sugar, 0.1 per cell on ${30 + k} cells`).join('; ');
    expect(change.length).toBeGreaterThan(400);
    const linked = j.addObservation({
      saw: 'the sprinters crowd the sugar',
      coincidedWith: 'the second sugar stroke',
      dish: null,
      link: { kind: 'compare', savedAt: '2026-09-28T10:00:00.000Z', change, dishName: 'Little Living Garden', label: 'this paired run' },
    });
    if ('error' in linked) throw new Error(linked.error);
    expect(linked.entry.link).toMatchObject({ kind: 'compare', change: `${change.slice(0, 399)}…` });
    expect(journalRecordProblem(linked.entry)).toBeNull();
    // A measured NaN is kept as it reads back (JSON null), so the dish keeps the stamp too.
    const nan = j.addJournalEntry({ ...STAMP, measures: [{ id: 'alive.A', label: 'Alive', a: '—', b: null, diff: null, rawA: Number.NaN, rawB: null }] });
    expect(nan.problem).toBeUndefined();
    expect(nan.entry.measures[0]!.rawA).toBeNull();
    expect(putJournalEntry(createHistory(1), sent.at(-1))).toBe(true);
    // Everything listed this session is still listed after a reload.
    const listed = j.journal.value.map((e) => e.id);
    expect(j.loadJournal().map((e) => e.id)).toEqual(listed);
    expect(listed).toHaveLength(3);
  });

  it('entries a Notebook cannot show are ignored from device storage and from a dish: the list still loads (fix round 1)', async () => {
    const storage = fakeStorage();
    const good = { ...STAMP, version: 1, id: 'EXP_A:ok', measures: [{ id: 'alive.A', label: 'Alive', a: '3', b: null, diff: null, rawA: 3, rawB: null }] };
    // A poisoned entry in device storage (merged by an older build from a crafted file): a stamp without measures.
    storage.setItem(
      'pixelmeba.journal',
      JSON.stringify([
        { version: 1, id: 'evil-1', kind: 'experimentStamp', experimentId: 'EXP_A', recordedAt: '2026-09-28T00:00:00Z' },
        good,
        { ...good, id: 'EXP_A:nan', measures: [{ ...good.measures[0], rawA: null }] }, // a measured NaN is stored as null
      ]),
    );
    vi.stubGlobal('localStorage', storage);
    const j = await import('../../src/ui/journal');
    expect(j.journal.value.map((e) => e.id)).toEqual(['EXP_A:ok', 'EXP_A:nan']);
    expect(j.isJournalEntry({ ...good, recordedAt: 'tomorrow' })).toBe(false);
    expect(j.isJournalEntry({ ...good, labels: [1] })).toBe(false);
    expect(j.isJournalEntry({ ...good, gate: [{ text: 'x' }] })).toBe(false);
    // A note of 120 characters written with emoji (240 UTF-16 units) is still the player's note.
    const r = j.addObservation({ saw: '🦠'.repeat(130), coincidedWith: 'light', dish: null, link: null });
    if ('error' in r) throw new Error(r.error);
    expect(Array.from(r.entry.saw)).toHaveLength(j.OBSERVATION_MAX);
    expect(j.isJournalEntry(r.entry)).toBe(true);
    expect(j.mergeJournal([{ kind: 'experimentStamp', id: 'evil-2', experimentId: 'X', recordedAt: '2026-09-28T00:00:00Z' }])).toEqual({ added: 0, notListed: 0 });
  });

  it('a note reads as one sentence whatever punctuation the player typed (fix round 1)', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const j = await import('../../src/ui/journal');
    const sentence = (saw: string, coincidedWith: string) => {
      const r = j.addObservation({ saw, coincidedWith, dish: null, link: null });
      if ('error' in r) throw new Error(r.error);
      return j.observationSentence(r.entry);
    };
    expect(sentence('Sprinters gathering in the top left.', 'the sugar patch getting smaller.')).toBe(
      'I saw Sprinters gathering in the top left coincide with the sugar patch getting smaller.',
    );
    expect(sentence('Sprinters gathering.', 'the sugar running out!')).toBe('I saw Sprinters gathering coincide with the sugar running out.');
    expect(sentence('I saw sprinters gather', 'coincided with: sugar vanishing...')).toBe('I saw sprinters gather coincide with sugar vanishing.');
    expect(sentence('Dr. Film on the stones', 'without light')).toBe('I saw Dr. Film on the stones coincide with without light.');
    expect(j.addObservation({ saw: 'I saw', coincidedWith: 'x', dish: null, link: null })).toEqual({ error: 'Write what you saw.' });
    expect(j.addObservation({ saw: 'x', coincidedWith: '...', dish: null, link: null })).toEqual({ error: 'Write what it coincided with.' });
    // Notes written before this cleanup read the same way.
    expect(j.observationSentence({ saw: 'I saw films.', coincidedWith: 'the light!' })).toBe('I saw films coincide with the light.');
  });
});
