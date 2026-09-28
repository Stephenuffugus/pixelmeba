/**
 * Words for experiment cards, their runs and journal stamps (SPEC §13.2; UX §1, §5.6). Every number
 * shown comes from the worker's measurements or the card's recorded content; nothing here computes
 * biology. Measurement ids follow the grammar in src/sim/pairedRun.ts.
 */
import type { CommandPayload } from '@sim/commands';
import type { CardScheduled, ClauseResult, ExperimentCardView, GateClause } from '@sim/experiments';
import { REASONS } from '@sim/reasons';
import { causeLabel } from '../panels/CompareText';

/** Plain names for the fields a card can measure (fallback: the field id). */
const FIELD_NAMES: Readonly<Record<string, string>> = {
  sugar: 'Sugar',
  starch: 'Starch',
  detritus: 'Debris',
  nutrient: 'Nutrient',
  oxygen: 'Oxygen',
  co2: 'Carbon dioxide',
  metabolite: 'Metabolite',
  oil: 'Oil',
  protein: 'Protein',
  broth: 'Broth',
  film: 'Film',
};

const fieldName = (id: string) => FIELD_NAMES[id] ?? id;
const sp = (card: ExperimentCardView, id: string) => card.speciesNames[id] ?? id;
/** Plural of a species name: "Sprinters", "Amoebae". */
export const plural = (name: string) => (name.endsWith('a') ? `${name}e` : `${name}s`);
const sps = (card: ExperimentCardView, id: string) => plural(sp(card, id));

/** "with a Reserve chamber", "with no extra ability" — a founder group in words. */
export function groupWords(card: ExperimentCardView, group: string): string {
  if (group === 'none') return 'with no extra ability';
  const names = group.split('+').map((m) => card.moduleNames[m] ?? m);
  return `with ${names.length === 1 ? `a ${names[0]}` : names.join(' + ')}`;
}

/** A measurement id in plain words (the card supplies species, module and patch names). */
export function measureLabel(card: ExperimentCardView, id: string): string {
  const [head, a = '', b = ''] = id.split('.');
  switch (head) {
    case 'seconds':
      return 'Dish time';
    case 'runSeconds':
      return card.paired ? 'Time both copies ran' : 'Time the dish ran';
    case 'aliveTotal':
      return 'Organisms alive';
    case 'biomassTotal':
      return 'Living biomass';
    case 'speciesAlive':
      return 'Kinds still alive';
    case 'oxygenMean':
      return 'Mean oxygen';
    case 'inputCarbon':
      return 'Carbon added during the run';
    case 'interventionAccepted':
      return 'Placed by the change';
    case 'interventionRejected':
      return 'Refused by the change';
    case 'alive':
      return `${sps(card, a)} alive`;
    case 'biomass':
      return `${sp(card, a)} biomass`;
    case 'biomassStart':
      return `${sp(card, a)} biomass at the start`;
    case 'biomassRatio':
      return `${sp(card, a)} biomass, times its start`;
    case 'births':
      return `${sp(card, a)} births`;
    case 'deaths': {
      if (!b) return `${sp(card, a)} deaths`;
      const code = REASONS.indexOf(b as (typeof REASONS)[number]);
      return `${sp(card, a)} deaths: ${code >= 0 ? causeLabel(code).toLowerCase() : b}`;
    }
    case 'intake':
      return `Food ${sps(card, a)} took in`;
    case 'captures':
      return `Captures by ${sps(card, a)}`;
    case 'capturedCarbon':
      return `Carbon ${sps(card, a)} captured`;
    case 'meanEnergy':
      return `${sp(card, a)} mean energy`;
    case 'extinctAt':
      return `When the last ${sp(card, a)} died`;
    case 'preyBiomass':
      return `Biomass ${sps(card, a)} can eat`;
    case 'reserveHeld':
      return `Energy ${sps(card, a)} hold above the normal cap`;
    case 'reservePeak':
      return `Most energy ${sps(card, a)} held above the normal cap`;
    case 'founders':
      return `${sp(card, a)} founders ${groupWords(card, b)}`;
    case 'descendants':
      return `Living family of the founders ${groupWords(card, b)}`;
    case 'groupEnergy':
      return `Mean energy, family of the founders ${groupWords(card, b)}`;
    case 'groupExtinctAt':
      return `When the family ${groupWords(card, b)} died out`;
    case 'field':
      return `${fieldName(a)} left in the dish`;
    case 'consumed':
      return `${fieldName(a)} eaten`;
    case 'converted':
      return `Sugar made from ${fieldName(a).toLowerCase()}`;
    case 'patchInput': {
      const p = card.patches[Number(a)];
      return `Carbon in the recipe's ${p?.label ? `“${p.label}”` : `patch ${a}`} patch`;
    }
  }
  return id;
}

const COUNT_HEADS = new Set(['aliveTotal', 'speciesAlive', 'interventionAccepted', 'interventionRejected', 'alive', 'births', 'deaths', 'captures', 'founders', 'descendants']);
const CARBON_HEADS = new Set(['inputCarbon', 'intake', 'capturedCarbon', 'field', 'consumed', 'converted', 'patchInput', 'biomass', 'biomassStart', 'biomassTotal', 'preyBiomass']);

/** A measured value with its unit: counts whole, times in seconds, carbon in C, energy in E. */
export function formatMeasure(id: string, value: number): string {
  const head = id.split('.')[0]!;
  if (head === 'extinctAt' || head === 'groupExtinctAt') return value < 0 ? 'not died out' : `${value} s`;
  if (head === 'seconds' || head === 'runSeconds') return `${value} s`;
  if (COUNT_HEADS.has(head)) return String(Math.round(value));
  if (head === 'biomassRatio') return `× ${value.toFixed(2)}`;
  if (head === 'oxygenMean') return value.toFixed(3);
  const unit = CARBON_HEADS.has(head) ? ' C' : head === 'meanEnergy' || head === 'groupEnergy' || head === 'reserveHeld' || head === 'reservePeak' ? ' E' : '';
  return `${num(value, 2)}${unit}`;
}

/** B − A for a measured value, signed, in the value's own units ("—" where a difference means nothing). */
export function formatDiff(id: string, a: number, b: number): string {
  const head = id.split('.')[0]!;
  if (head === 'extinctAt' || head === 'groupExtinctAt') return a < 0 || b < 0 ? '—' : signed(b - a, 0) + ' s';
  if (head === 'seconds' || head === 'runSeconds') return signed(b - a, 1) + ' s';
  return signed(b - a, COUNT_HEADS.has(head) ? 0 : head === 'oxygenMean' ? 3 : 2);
}

function num(v: number, d: number): string {
  const x = Math.abs(v) < 0.5 * 10 ** -d ? 0 : v;
  return x.toFixed(d).replace('-', '−');
}

function signed(v: number, d: number): string {
  if (v === 0) return '0';
  const s = num(v, d);
  if (/^0(\.0+)?$/.test(s)) return '≈0';
  return v > 0 ? `+${s}` : s;
}

function seconds(list: readonly number[]): string {
  if (list.length === 1) return `${list[0]} s`;
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]} s`;
}

/** One command in plain words (the card's own numbers). */
export function describeCommand(card: ExperimentCardView, p: CommandPayload): string {
  switch (p.kind) {
    case 'inoculate':
      return `${p.count} ${p.count === 1 ? sp(card, p.speciesId) : sps(card, p.speciesId)} near (${Math.floor(p.x)}, ${Math.floor(p.y)})`;
    case 'deposit':
      return `${card.materialNames[p.materialId] ?? p.materialId}, ${p.dose} per cell${p.radius > 0 ? ` within r ${p.radius} of (${Math.floor(p.points[0]![0])}, ${Math.floor(p.points[0]![1])})` : ' along a stroke'}`;
    case 'setLid':
      return `lid ${p.lid}`;
    case 'setMutationPreset':
      return `evolution setting ${p.preset}`;
    default:
      return p.kind;
  }
}

/** The scheduled additions a card leaves out of B, grouped when they repeat the same command. */
export function describeSchedule(card: ExperimentCardView, list: readonly CardScheduled[]): string {
  const groups: { text: string; at: number[] }[] = [];
  for (const s of list) {
    const text = describeCommand(card, s.payload);
    const g = groups.find((x) => x.text === text);
    if (g) g.at.push(s.atSecond);
    else groups.push({ text, at: [s.atSecond] });
  }
  return groups.map((g) => `${g.text}, at ${seconds(g.at)}`).join('; ');
}

/** Copy A and copy B in words: what each receives (the card's one declared difference). */
export function describeArms(card: ExperimentCardView): { readonly a: string; readonly b: string } {
  const ch = card.change;
  switch (ch.kind) {
    case 'none':
      return { a: 'The recipe as written.', b: '' };
    case 'omitPatch': {
      const p = card.patches[ch.patchIndex];
      const adds = p ? Object.keys(p.add).map((k) => `${p.add[k]} ${fieldName(k).toLowerCase()}`).join(' + ') : '';
      return {
        a: 'The recipe as written.',
        b: p ? `The same, without the “${p.label ?? `patch ${ch.patchIndex}`}” deposit (${adds} per cell within r ${p.radius} of (${p.center[0]}, ${p.center[1]})).` : 'The same, without one recipe patch.',
      };
    }
    case 'omitScheduled': {
      const left = card.scheduled.filter((s) => ch.indexes.includes(s.index));
      return {
        a: `The recipe as written, including its scheduled additions: ${describeSchedule(card, left)}.`,
        b: 'The same start, without those later additions.',
      };
    }
    case 'shade':
      return { a: 'The recipe as written.', b: `The same, with shade over the whole dish (light × ${ch.factor}).` };
    case 'commands':
      return {
        a: `The recipe as written, copied at ${ch.atSecond} s.`,
        b: `The same copy at ${ch.atSecond} s, then: ${ch.commands.map((c) => describeCommand(card, c as CommandPayload)).join('; ')}.`,
      };
  }
}

const OPS: Readonly<Record<GateClause['op'], string>> = { gt: 'more than', gte: 'at least', lt: 'less than', lte: 'at most', eq: 'exactly', ne: 'not' };
const ARMS: Readonly<Record<GateClause['arm'], string>> = { A: 'in A', B: 'in B', diff: 'B − A', absDiff: 'difference between A and B' };

/** One gate clause in words: its recorded label, or the measurement, arm and threshold. */
export function clauseText(card: ExperimentCardView, c: GateClause | ClauseResult): string {
  if (c.label) return c.label;
  const where = card.paired ? ` (${ARMS[c.arm]})` : '';
  return `${measureLabel(card, c.measure)}${where}: ${OPS[c.op]} ${formatMeasure(c.measure, c.value)}`;
}

/** Stopping point in words ("3 min", "90 s"). */
export function durationText(seconds: number): string {
  if (seconds >= 120 && seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

/** Wall-clock time of a journal entry, in the device's locale. */
export function recordedText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
