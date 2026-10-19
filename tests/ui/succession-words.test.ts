/**
 * P5.6 part 3: the succession notebook's words (src/ui/strings/succession.ts; SPEC §12.8, §12.9; D02 §23; D-0051).
 *
 * Every line kind's sentence (a feeding line with and without a credited producer — D02 §23's fallback whenever no
 * producer is credited — with recorded death causes, an extinction's dish time, a recovery count), the minute
 * heading, the watched-from line and the empty minute. No sentence says "because" (no line kind carries a
 * mechanism that would support it), and none says "superior", "advanced", "perfect", "adapted" or "immune".
 */
import { describe, expect, it } from 'vitest';
import type { SuccessionEntry, SuccessionLine } from '../../src/persistence/notebookSuccession';
import { entrySentences, minuteHeading, SUCCESSION_TEXT, successionSentence, watchedLine } from '../../src/ui/strings/succession';
import type { StoryNames } from '../../src/ui/strings/stories';

const NAMES: StoryNames = {
  speciesIds: ['B01', 'B06', 'B04', 'P01', 'B12', 'B07', 'Y01'],
  speciesNames: ['Sprinter', 'Crumbsmith', 'Recycler', 'Amoeba', 'Dropseed', 'Brothmaker', 'Creambud'],
  materials: [],
};
const L = (l: Partial<SuccessionLine> & Pick<SuccessionLine, 'kind' | 'species'>): SuccessionLine => ({ evidence: ['history:60'], ...l });

describe('succession sentences', () => {
  it('each line kind, from its stored values only', () => {
    const cases: [SuccessionLine, string][] = [
      [L({ kind: 'gain', species: 'B01', value: 2.4 }), 'Sprinters gained 2.40 carbon of living biomass this minute.'],
      [L({ kind: 'loss', species: 'B01', value: 2.4 }), 'Sprinters lost 2.40 carbon of living biomass this minute.'],
      [L({ kind: 'loss', species: 'B01', value: 2.4, deaths: { DEATH_PREDATION: 12 } }), 'Sprinters lost 2.40 carbon of living biomass this minute; 12 deaths were recorded as caught by a predator.'],
      [
        L({ kind: 'loss', species: 'B01', value: 0.5, deaths: { DEATH_STARVATION: 1, DEATH_PREDATION: 3 } }),
        'Sprinters lost 0.50 carbon of living biomass this minute; 3 deaths were recorded as caught by a predator; 1 death was recorded as starvation.',
      ],
      [L({ kind: 'newFeeding', species: 'Y01', pool: 'broth', enzyme: 'protein', producer: 'B07', value: 2.4 }), 'Brothmakers released broth from protein. Creambuds consumed 2.40 carbon of that pool this minute.'],
      [L({ kind: 'newFeeding', species: 'Y01', pool: 'broth', enzyme: 'protein', producer: 'B07' }), 'Brothmakers released broth from protein. Creambuds were first seen consuming that pool this minute.'],
      // D02 §23's fallback: no producer credited (the second form whenever none is), with or without a value.
      [L({ kind: 'newFeeding', species: 'Y01', pool: 'broth', enzyme: 'protein' }), 'Creambuds consumed broth while protein conversion was active.'],
      [L({ kind: 'newFeeding', species: 'Y01', pool: 'broth', enzyme: 'protein', value: 1.5 }), 'Creambuds consumed broth while protein conversion was active.'],
      [L({ kind: 'newFeeding', species: 'B04', pool: 'detritus', value: 0.37 }), 'Recyclers were first seen consuming debris: 0.37 carbon this minute.'],
      [L({ kind: 'newFeeding', species: 'B04', pool: 'detritus' }), 'Recyclers were first seen consuming debris.'],
      [L({ kind: 'newFeeding', species: 'P01', prey: 'B01' }), 'Amoebae were first seen catching Sprinters.'],
      [L({ kind: 'extinction', species: 'B01', evidence: ['history:192', 'event:4'] }), 'No Sprinters remained at 3:12.'],
      [L({ kind: 'recovery', species: 'B12', value: 4 }), '4 Dropseeds woke from rest.'],
      [L({ kind: 'recovery', species: 'B12', value: 1 }), '1 Dropseed woke from rest.'],
      // A species the dish no longer names keeps its id.
      [L({ kind: 'gain', species: 'Z09', value: 1 }), 'Z09 gained 1.00 carbon of living biomass this minute.'],
    ];
    for (const [line, text] of cases) expect(successionSentence(line, NAMES)).toBe(text);
  });

  it('the minute heading, the watched-from line and the empty minute', () => {
    const e: SuccessionEntry = { id: 'succ-3', minute: 3, fromTick: 1200, toTick: 1800, lines: [] };
    expect(minuteHeading(e)).toBe('Minute 3 (2:00–3:00)');
    expect(watchedLine(e)).toBeNull();
    expect(watchedLine({ watchedFromTick: 1610 })).toBe('Watched from 2:41: feeding, deaths and wakes before then were not watched.');
    expect(entrySentences(e, NAMES)).toEqual(['Nothing changed enough to note this minute.']);
    expect(SUCCESSION_TEXT.emptyMinute).toBe('Nothing changed enough to note this minute.');
    expect(entrySentences({ lines: [L({ kind: 'gain', species: 'B01', value: 1 })] }, NAMES)).toEqual(['Sprinters gained 1.00 carbon of living biomass this minute.']);
  });

  it('no sentence claims a cause or a ranking', () => {
    const lines: SuccessionLine[] = [
      L({ kind: 'gain', species: 'B01', value: 1 }),
      L({ kind: 'loss', species: 'B01', value: 1, deaths: { DEATH_STARVATION: 2, DEATH_STRESS: 1, DEATH_INHIBITOR: 1, DEATH_AGE: 1, DEATH_PREDATION: 1, DEATH_LYSIS: 1, DEATH_PARASITE_DRAIN: 1, DEATH_TRAP_DRAIN: 1 } }),
      L({ kind: 'newFeeding', species: 'B01', pool: 'sugar', enzyme: 'starch', producer: 'B06', value: 1 }),
      L({ kind: 'newFeeding', species: 'B01', pool: 'sugar', enzyme: 'starch' }),
      L({ kind: 'newFeeding', species: 'B01', pool: 'co2' }),
      L({ kind: 'newFeeding', species: 'P01', prey: 'B01' }),
      L({ kind: 'extinction', species: 'B01' }),
      L({ kind: 'recovery', species: 'B12', value: 2 }),
    ];
    const all = [...lines.map((l) => successionSentence(l, NAMES)), SUCCESSION_TEXT.intro, SUCCESSION_TEXT.empty, SUCCESSION_TEXT.emptyMinute, SUCCESSION_TEXT.noDish].join(' ');
    expect(all).not.toMatch(/because/i);
    expect(all).not.toMatch(/superior|advanced|perfect|adapted|immune/i);
    // Every recorded death cause has its words (a cause without words would be dropped from the sentence).
    for (const cause of ['starvation', 'stress', 'an inhibitor', 'old age', 'caught by a predator', 'burst by a virus', 'drained by a parasite', 'drained in a trap']) expect(successionSentence(lines[1]!, NAMES)).toContain(cause);
  });
});
