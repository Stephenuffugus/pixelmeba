/**
 * Succession notebook copy (P5.6 part 3; SPEC §12.8, §12.9; D02 §23 "Use templated sentences tied to event IDs
 * … Use the second sentence only when provenance is available. Without source attribution, say 'Creambud
 * consumed broth while protein conversion was active.'"; D-0051; D-0131).
 *
 * Every sentence is built from a stored line's kind and values (src/persistence/notebookSuccession.ts) plus the
 * dish's names; nothing here is stored. A producer is named only when the line carries one (credited by
 * producersNear); otherwise the conversion is stated as something that was active at the same time, never as
 * a cause. Death causes are the recorded ones. All numbers are game units; a minute is dish time (m:ss).
 */
import { extinctionSecond, type SuccessionEntry, type SuccessionLine, type SuccessionPool } from '@persist/notebookSuccession';
import { plural } from './experiments';
import { formatSimTime } from './lineage';
import { speciesCount, speciesName, type StoryNames } from './stories';

export const SUCCESSION_TEXT = {
  tab: 'Succession',
  intro:
    'Every simulated minute this dish notes the largest changes in living biomass, feeding first seen here, kinds that ran out and organisms that woke from rest. Each line comes from records and measurements of this run; lines say what happened together, not why.',
  noDish: 'The succession notebook is kept with each dish. Open a dish to read its minutes.',
  reading: 'Reading this dish’s minutes…',
  empty: 'No whole minute has passed in this dish yet. A minute entry appears here at each full minute of dish time.',
  emptyMinute: 'Nothing changed enough to note this minute.',
  lookBack: 'Look back',
  listLabel: (dish: string) => `Minutes of “${dish}”, newest first`,
} as const;

/** Pools in words. */
export const POOL_WORDS: Readonly<Record<SuccessionPool, string>> = {
  sugar: 'sugar',
  starch: 'starch',
  oil: 'oil',
  protein: 'protein',
  broth: 'broth',
  detritus: 'debris',
  metabolite: 'metabolite',
  film: 'film',
  co2: 'carbon dioxide',
};

/** Recorded death causes in words ("12 deaths were recorded as caught by a predator"). */
export const DEATH_CAUSE_WORDS: Readonly<Record<string, string>> = {
  DEATH_STARVATION: 'starvation',
  DEATH_STRESS: 'stress',
  DEATH_INHIBITOR: 'an inhibitor',
  DEATH_AGE: 'old age',
  DEATH_PREDATION: 'caught by a predator',
  DEATH_LYSIS: 'burst by a virus',
  DEATH_PARASITE_DRAIN: 'drained by a parasite',
  DEATH_TRAP_DRAIN: 'drained in a trap',
};

const carbon = (v: number): string => v.toFixed(2);
/** A species' plural name in this dish ("Sprinters"; a species the dish no longer names keeps its id). */
const many = (names: StoryNames, id: string): string => {
  const n = speciesName(names, id);
  return n === id ? id : plural(n);
};
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "Minute 3 (2:00–3:00)". */
export function minuteHeading(e: Pick<SuccessionEntry, 'minute' | 'fromTick' | 'toTick'>): string {
  return `Minute ${e.minute} (${formatSimTime(e.fromTick)}–${formatSimTime(e.toTick)})`;
}

/** "Watched from 2:41 …" when the watch started inside the minute (null otherwise). */
export function watchedLine(e: Pick<SuccessionEntry, 'watchedFromTick'>): string | null {
  if (e.watchedFromTick === undefined) return null;
  return `Watched from ${formatSimTime(e.watchedFromTick)}: feeding, deaths and wakes before then were not watched.`;
}

/** "; 12 deaths were recorded as caught by a predator; 1 death was recorded as starvation" (recorded causes only). */
function deathsClause(d: SuccessionLine['deaths']): string {
  if (!d) return '';
  const parts = Object.entries(d)
    .filter(([cause]) => DEATH_CAUSE_WORDS[cause] !== undefined)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([cause, n]) => `${n} ${n === 1 ? 'death was' : 'deaths were'} recorded as ${DEATH_CAUSE_WORDS[cause]!}`);
  return parts.length > 0 ? `; ${parts.join('; ')}` : '';
}

/** The sentence of one line, from its kind and values only. */
export function successionSentence(l: SuccessionLine, names: StoryNames): string {
  const who = many(names, l.species);
  switch (l.kind) {
    case 'gain':
      return `${who} gained ${carbon(l.value ?? 0)} carbon of living biomass this minute.`;
    case 'loss':
      return `${who} lost ${carbon(l.value ?? 0)} carbon of living biomass this minute${deathsClause(l.deaths)}.`;
    case 'extinction': {
      const s = extinctionSecond(l);
      return `No ${who} remained at ${formatSimTime((s ?? 0) * 10)}.`;
    }
    case 'recovery':
      return `${speciesCount(names, l.species, l.value ?? 0)} woke from rest.`;
    case 'newFeeding': {
      if (l.prey !== undefined) return `${who} were first seen catching ${many(names, l.prey)}.`;
      const pool = POOL_WORDS[l.pool!];
      if (l.producer !== undefined && l.enzyme !== undefined) {
        const made = `${many(names, l.producer)} released ${pool} from ${l.enzyme}.`;
        return l.value !== undefined ? `${made} ${who} consumed ${carbon(l.value)} carbon of that pool this minute.` : `${made} ${who} were first seen consuming that pool this minute.`;
      }
      // D02 §23's fallback: no source attribution, only what was active at the same time.
      if (l.enzyme !== undefined) return `${who} consumed ${pool} while ${l.enzyme} conversion was active.`;
      return l.value !== undefined ? `${who} were first seen consuming ${pool}: ${carbon(l.value)} carbon this minute.` : `${who} were first seen consuming ${pool}.`;
    }
  }
}

/** Every sentence of an entry in line order, or the empty minute's one line. */
export function entrySentences(e: Pick<SuccessionEntry, 'lines'>, names: StoryNames): string[] {
  return e.lines.length === 0 ? [SUCCESSION_TEXT.emptyMinute] : e.lines.map((l) => cap(successionSentence(l, names)));
}
