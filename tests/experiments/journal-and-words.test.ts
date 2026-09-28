/**
 * The Notebook's side of experiment cards (P2.5; UX §1): the journal store keeps stamps on this device
 * (newest first, bounded, readable after a reload, harmless when storage is unavailable), and every
 * card's measurements, gate and change are worded from recorded content — no raw ids leak to players.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { experimentCardView, experimentCatalog } from '../../src/sim/experiments';
import { clauseText, describeArms, formatDiff, formatMeasure, measureLabel } from '../../src/ui/strings/experiments';
import { registry } from './helpers';

function fakeStorage(): Storage {
  const data: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(data).length;
    },
    clear: () => Object.keys(data).forEach((k) => delete data[k]),
    getItem: (k: string) => data[k] ?? null,
    key: (i: number) => Object.keys(data)[i] ?? null,
    removeItem: (k: string) => void delete data[k],
    setItem: (k: string, v: string) => void (data[k] = String(v)),
  };
}

const ENTRY = {
  kind: 'experimentStamp' as const,
  experimentId: 'EXP_A',
  title: 'What unlocks starch',
  journalStamp: 'Measured sugar made from starch',
  label: 'this paired run',
  labels: ['Experiment A'],
  recordedAt: '2026-09-28T00:00:00.000Z',
  reachedAtSecond: 180,
  seed: 104729,
  recipeId: 'STARCH_UNLOCK_V1',
  recipeRevision: 1,
  contentVersion: 1,
  contentHash: 'x',
  dishName: 'What unlocks starch',
  gate: [{ text: 'Both copies ran 180 s', value: '180 s' }],
  measures: [],
  prediction: '',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('journal store', () => {
  it('keeps stamps newest first, at most 200, and reads them back after a reload', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const j = await import('../../src/ui/journal');
    expect(j.journal.value).toEqual([]);
    for (let k = 0; k < 205; k++) expect(j.addJournalEntry({ ...ENTRY, reachedAtSecond: k }).stored).toBe(true);
    expect(j.journal.value).toHaveLength(j.JOURNAL_MAX);
    expect(j.journal.value[0]!.reachedAtSecond).toBe(204);
    const id = j.journal.value[0]!.id;
    expect(j.updateJournalEntry(id, { conclusion: 'supports' })).toBe(true);
    vi.resetModules(); // a reload: the module reads storage again
    const again = await import('../../src/ui/journal');
    expect(again.journal.value).toHaveLength(200);
    expect(again.journal.value[0]).toMatchObject({ id, conclusion: 'supports', version: 1, kind: 'experimentStamp' });
  });

  it('without storage the stamp lasts for the session; unreadable storage is ignored, never thrown', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const j = await import('../../src/ui/journal');
    expect(j.journal.value).toEqual([]);
    const r = j.addJournalEntry(ENTRY);
    expect(r.stored).toBe(false);
    expect(j.journal.value).toEqual([r.entry]);
    vi.resetModules();
    vi.stubGlobal('localStorage', { getItem: () => '{"not":"a list"}', setItem: () => undefined });
    expect((await import('../../src/ui/journal')).journal.value).toEqual([]);
  });
});

describe('cards in words', () => {
  it('every measurement, gate clause and change of every shipped card is worded from recorded content', () => {
    const reg = registry();
    for (const def of experimentCatalog(reg)) {
      const card = experimentCardView(reg, def);
      for (const id of card.measurements) {
        const label = measureLabel(card, id);
        expect(label, id).not.toBe(id);
        expect(label, id).not.toMatch(/\b[BAPYFXV][0-9]{2}\b|\bE[0-9]{2}\b|undefined/);
        expect(formatMeasure(id, 1)).not.toMatch(/NaN|undefined/);
        expect(formatDiff(id, 1, 2)).not.toMatch(/NaN|undefined/);
      }
      for (const g of card.gate) expect(clauseText(card, g).length).toBeGreaterThan(0);
      const arms = describeArms(card);
      expect(arms.a.length).toBeGreaterThan(0);
      if (card.paired) expect(arms.b, card.id).not.toMatch(/undefined|NaN/);
    }
  });

  it('Experiment C reads as a Seeded traits demonstration with founder families by their ability', () => {
    const reg = registry();
    const card = experimentCardView(reg, reg.experiments.EXP_C!);
    expect(measureLabel(card, 'descendants.B01.E05')).toBe('Living family of the founders with a Reserve chamber');
    expect(measureLabel(card, 'descendants.B01.none')).toBe('Living family of the founders with no extra ability');
    expect(measureLabel(card, 'reservePeak.B01')).toBe('Most energy Sprinters held above the normal cap');
    expect(formatMeasure('groupExtinctAt.B01.E05', -1)).toBe('not died out');
    expect(formatMeasure('groupExtinctAt.B01.E05', 473)).toBe('473 s');
    expect(describeArms(card).a).toContain('Sugar, 0.5 per cell within r 6 of (64, 64), at 60, 120, 180, 240 and 300 s');
    expect(describeArms(card).b).toBe('The same start, without those later additions.');
  });
});
