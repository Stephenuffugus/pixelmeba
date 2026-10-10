/**
 * The Notebook's side of experiment cards (P2.5; UX §1): the journal store keeps stamps on this device
 * (newest first, bounded, readable after a reload, harmless when storage is unavailable), and every
 * card's measurements, gate and change are worded from recorded content — no raw ids leak to players.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { experimentCardView, experimentCatalog } from '../../src/sim/experiments';
import { realizeRecipe } from '../../src/sim/recipes';
import { buildInspector } from '../../src/worker/snapshot';
import type { JournalMeasure } from '../../src/ui/journal';
import {
  clauseText,
  completionText,
  describeArms,
  formatDiff,
  formatMeasure,
  journalMeasureCells,
  measureLabel,
  playerStepText,
} from '../../src/ui/strings/experiments';
import { originChip } from '../../src/ui/strings/modules';
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
    // A population total, summed over living Sprinters at one moment (not one organism's amount).
    expect(measureLabel(card, 'reservePeak.B01')).toBe('Most energy held above the normal cap at one moment, all Sprinters together');
    expect(measureLabel(card, 'reserveHeld.B01')).toBe('Energy held above the normal cap, all Sprinters together');
    expect(measureLabel(card, 'groupEnergyMedian.B01.E05')).toBe('Median energy, family of the founders with a Reserve chamber');
    expect(measureLabel(card, 'groupEnergyMin.B01.none')).toBe('Lowest energy, family of the founders with no extra ability');
    expect(measureLabel(card, 'groupEnergyMax.B01.E05')).toBe('Highest energy, family of the founders with a Reserve chamber');
    expect(formatMeasure('groupEnergyMax.B01.E05', 81.234)).toBe('81.23 E');
    expect(formatMeasure('groupExtinctAt.B01.E05', -1)).toBe('not died out');
    expect(formatMeasure('groupExtinctAt.B01.E05', 473)).toBe('473 s');
    expect(describeArms(card).a).toContain('Sugar, 0.5 per cell within r 6 of (64, 64), at 60, 120, 180, 240 and 300 s');
    expect(describeArms(card).b).toBe('The same start, without those later additions.');
  });
});

describe('completion copy says what completing each kind of card does (SPEC §13.2)', () => {
  it('paired cards: the copies run to their stopping point and the dish is unchanged; one dish: the world keeps running', () => {
    const reg = registry();
    const cards = experimentCatalog(reg).map((d) => experimentCardView(reg, d));
    expect(cards.filter((c) => c.paired).map((c) => c.id)).toEqual(['EXP_102', 'EXP_106', 'EXP_203', 'EXP_204', 'EXP_A', 'EXP_B', 'EXP_C']);
    for (const card of cards) {
      const text = completionText(card);
      expect(text, card.id).toContain(`your Journal gets a stamp: “${card.journalStamp}”.`);
      if (card.paired) {
        expect(text, card.id).toContain('Both copies run to their stopping point');
        expect(text, card.id).toContain('your dish is unchanged');
        expect(text, card.id).not.toMatch(/keeps running/);
      } else {
        expect(text, card.id).toMatch(/The world keeps running\.$/);
        expect(text, card.id).not.toMatch(/cop(y|ies)/);
      }
    }
    expect(completionText(cards.find((c) => c.id === 'EXP_C')!)).toContain('(10 min of dish time)');
  });

  it('every listed player step is worded as an instruction the player can follow (CT §10.1)', () => {
    const reg = registry();
    const card = (id: string) => experimentCardView(reg, reg.experiments[id]!);
    expect(card('EXP_101').playerSteps).toEqual(['inspectFoodUse']);
    expect(card('EXP_101').stepSpecies).toEqual(['B01']);
    expect(playerStepText(card('EXP_101'), 'inspectFoodUse')).toBe('Tap a Sprinter while it is eating: the inspector shows the food it took in.');
    expect(playerStepText(card('EXP_103'), 'openResourceHistory')).toMatch(/More → History/);
    expect(playerStepText(card('EXP_106'), 'viewPreyHistory')).toMatch(/population history/);
    expect(completionText(card('EXP_103'))).toContain('and you have taken the steps above');
  });
});

describe('an energy over nobody reads "none alive", never as a real zero', () => {
  const rec = { 'descendants.B01.E05': 0, 'descendants.B01.none': 5, 'alive.B01': 0 };
  it('group energies and the species mean, with the same arm’s record', () => {
    for (const h of ['groupEnergy', 'groupEnergyMedian', 'groupEnergyMin', 'groupEnergyMax']) {
      expect(formatMeasure(`${h}.B01.E05`, 0, rec)).toBe('none alive');
      expect(formatMeasure(`${h}.B01.none`, 42.5, rec)).toBe('42.50 E');
      expect(formatDiff(`${h}.B01.E05`, 0, 42.5, rec, { 'descendants.B01.E05': 5 })).toBe('—');
    }
    expect(formatMeasure('meanEnergy.B01', 0, rec)).toBe('none alive');
    expect(formatMeasure('meanEnergy.B01', 0, { 'alive.B01': 3 })).toBe('0.00 E');
    // Totals are real zeros: nothing held above the cap is 0 E.
    expect(formatMeasure('reserveHeld.B01', 0, rec)).toBe('0.00 E');
  });

  it('the Journal re-reads a stamp’s energies from its raw numbers (also stamps recorded as "0.00 E")', () => {
    const m = (id: string, rawA: number, rawB: number, a: string, b: string, diff: string): JournalMeasure => ({ id, label: id, a, b, diff, rawA, rawB });
    const cells = journalMeasureCells([
      m('descendants.B01.E05', 0, 3, '0', '3', '+3'),
      m('groupEnergy.B01.E05', 0, 40, '0.00 E', '40.00 E', '+40.00'),
      m('meanEnergy.B01', 12, 0, '12.00 E', '0.00 E', '−12.00'),
      m('alive.B01', 4, 0, '4', '0', '−4'),
    ]);
    expect(cells.map((c) => [c.a, c.b, c.diff])).toEqual([
      ['0', '3', '+3'],
      ['none alive', '40.00 E', '—'],
      ['12.00 E', 'none alive', '—'],
      ['4', '0', '−4'],
    ]);
  });
});

describe('seeded founders are labelled "present at creation" in the inspector (UX §3.3)', () => {
  it('Experiment C: odd founders (a reserve chamber given when the dish was made) vs even founders (added by the recipe)', () => {
    const w = realizeRecipe(registry(), 'RESERVE_COMPARE_V1');
    const c = w.ents.cols;
    const chips: Record<string, string | null> = {};
    for (let i = 0; i < w.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      const e = buildInspector(w, { kind: 'entity', birthId: c.birthId[i]! }).entity!;
      chips[e.modules.map((x) => x.id).join('+') || 'none'] = originChip(e.origin);
    }
    expect(chips).toEqual({ E05: 'present at creation', none: 'added by you or the recipe' });
    expect(originChip(0)).toBeNull();
  });
});
