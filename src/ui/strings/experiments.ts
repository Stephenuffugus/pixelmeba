/**
 * Words for experiment cards, their runs and journal stamps (SPEC §13.2; UX §1, §5.6). Every number
 * shown comes from the worker's measurements or the card's recorded content; nothing here computes
 * biology. Measurement ids follow the grammar in src/sim/pairedRun.ts.
 */
import type { CommandPayload } from '@sim/commands';
import { livingCountFor, type CardScheduled, type ClauseResult, type ExperimentCardView, type GateClause, type PlayerStep, type TestOverrideView } from '@sim/experiments';
import { REASONS } from '@sim/reasons';
import type { JournalMeasure } from '../journal';
import { causeLabel } from '../panels/CompareText';
import { FIELD_NAMES as ACTIVITY_FIELD_NAMES } from './fields';
import { evolutionLabel } from './whatif';

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
  // P3.9 (EXP_105): Pinphage units, measured as their carbon (0.01 C each).
  v01: 'Pinphage',
  // P5.6 (wave 15): the Phase 5 fields a card measures (the activity fields by their one name, strings/fields.ts).
  v02: 'Lacephage',
  salt: 'Salt',
  silicate: 'Silicate',
  sGlow: ACTIVITY_FIELD_NAMES.sGlow,
  quencher: ACTIVITY_FIELD_NAMES.quencher,
  rival: ACTIVITY_FIELD_NAMES.rival,
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

/** P5.6: an edge structure kind in a measure label, as a plural in a sentence (content names, lower case). */
const GATE_WORDS: Readonly<Record<string, string>> = {
  S01: 'fine membranes',
  S02: 'small gates',
  S03: 'shutter gates',
  S04: 'one-way channels',
};

/**
 * P5.6: a region of the card's habitat in a sentence, from ExperimentCardView.regionNames ("in the Fresh pool");
 * a label that starts with its own preposition reads as written ("under the roof"). The id when unnamed.
 */
export function regionWords(card: ExperimentCardView, region: string): string {
  const label = card.regionNames?.[region] ?? region;
  if (/^(Under|Over|Inside|Outside|Behind|Beside|Near|Along|Between|Above|Below)\b/.test(label)) return `${label[0]!.toLowerCase()}${label.slice(1)}`;
  return `in the ${label}`;
}

/**
 * P5.6: the event types events.TYPE.SP counts, in words (a count of event records naming the species since the
 * run started; one 'modeSwitch' record stands for every switch of that species to that mode in one tick, D-0126).
 */
function eventWords(card: ExperimentCardView, type: string, a: string): string {
  switch (type) {
    case 'glowOn':
      return `Glow switch-ons by ${sps(card, a)}`;
    case 'glowOff':
      return `Glow switch-offs by ${sps(card, a)}`;
    case 'modeSwitch':
      return `Mode-switch records of ${sps(card, a)} (one per tick and new mode)`;
    case 'rest':
      return `Times ${sps(card, a)} began resting`;
    case 'wake':
      return `Times ${sps(card, a)} woke up`;
    case 'trapArmed':
      return `Traps set by ${sps(card, a)}`;
    case 'trapHold':
      return `Holds begun in ${sp(card, a)} traps`;
    case 'trapRelease':
      return `Holds ended in ${sp(card, a)} traps`;
    case 'handlingStart':
      return `Handling attempts begun by ${sps(card, a)}`;
    case 'handlingBreak':
      return `Handling attempts by ${sps(card, a)} that ended without a catch`;
    case 'capture':
      return `Capture records of ${sps(card, a)}`;
    case 'linkFormed':
      return `Links formed by ${sps(card, a)}`;
    case 'linkBroken':
      return `Links ended by ${sps(card, a)}`;
    default:
      return `“${type}” records of ${sps(card, a)}`;
  }
}

/** P5.6: an id with an @REGION suffix in words (alive / resting / biomass .SP, mean.F, moisture). */
function regionMeasureLabel(card: ExperimentCardView, base: string, region: string): string {
  const [head, a = ''] = base.split('.');
  const where = regionWords(card, region);
  switch (head) {
    case 'alive':
      return `${sps(card, a)} ${where}`;
    case 'resting':
      return `${sps(card, a)} resting ${where}`;
    case 'biomass':
      return `${sp(card, a)} biomass ${where}`;
    case 'mean':
      return `Mean ${fieldName(a).toLowerCase()} ${where}`;
    case 'moisture':
      return `Mean moisture ${where}`;
  }
  return `${base} ${where}`;
}

/** A measurement id in plain words (the card supplies species, module and patch names). */
export function measureLabel(card: ExperimentCardView, id: string): string {
  const at = id.indexOf('@');
  if (at >= 0) return regionMeasureLabel(card, id.slice(0, at), id.slice(at + 1));
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
      return `Energy held above the normal cap, all ${sps(card, a)} together`;
    case 'reservePeak':
      return `Most energy held above the normal cap at one moment, all ${sps(card, a)} together`;
    case 'founders':
      return `${sp(card, a)} founders ${groupWords(card, b)}`;
    case 'descendants':
      return `Living family of the founders ${groupWords(card, b)}`;
    case 'groupEnergy':
      return `Mean energy, family of the founders ${groupWords(card, b)}`;
    case 'groupEnergyMedian':
      return `Median energy, family of the founders ${groupWords(card, b)}`;
    case 'groupEnergyMin':
      return `Lowest energy, family of the founders ${groupWords(card, b)}`;
    case 'groupEnergyMax':
      return `Highest energy, family of the founders ${groupWords(card, b)}`;
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
    // P3.9 tracked measures (src/sim/pairedRun.ts).
    case 'infections':
      // P5.6: infections.SP.VIRUS restricts the count to one virus.
      return b ? `${sps(card, a)} newly infected by ${sp(card, b)}` : `${sps(card, a)} newly infected`;
    case 'limitSeconds': {
      const code = REASONS.indexOf(b as (typeof REASONS)[number]);
      return `Time ${sps(card, a)} spent ${code >= 0 ? limitWords(b) : b} (organism-seconds)`;
    }
    case 'transfer':
      return `Carbon passed along ${sp(card, 'F02')} links`;
    case 'wholeUnitCells':
      return `Most cells at once holding a whole ${b ? sp(card, b) : 'Pinphage'} unit and a living ${sp(card, a)}`;
    // ---- P5.6 (wave 15; pairedRun.ts P5_MEASURE_HEADS): states now, event records, mode intake, gates.
    case 'resting':
      return `${sps(card, a)} resting`;
    case 'glowing':
      return `${sps(card, a)} glowing`;
    case 'glowingStart':
      return `${sps(card, a)} glowing when the run began`;
    case 'attached':
      return `${sps(card, a)} riding a host`;
    case 'events':
      return eventWords(card, a, b);
    case 'firstCaptureAt':
      return `When ${sps(card, a)} first caught prey`;
    case 'intakePhoto':
      return `Carbon ${sps(card, a)} took in while in Photo mode`;
    case 'intakeSugar':
      return `Carbon ${sps(card, a)} took in while in Sugar mode`;
    case 'secretingSeconds':
      return `Time ${sps(card, a)} spent releasing something (organism-seconds)`;
    case 'gateTransfer':
      return `${fieldName(b)} moved across ${GATE_WORDS[a] ?? a}`;
    case 'gateCrossings':
      return `Organism crossings of ${GATE_WORDS[a] ?? a}`;
    case 'mean':
      return `Mean ${fieldName(a).toLowerCase()}`;
    case 'moisture':
      return 'Mean moisture';
  }
  return id;
}

/** A limit reason as a limitSeconds label reads it ("held back by too little oxygen"). */
function limitWords(reason: string): string {
  switch (reason) {
    case 'OXYGEN_LIMITED':
      return 'held back by too little oxygen';
    case 'SUIT_OXYGEN_HIGH':
      return 'held back by too much oxygen';
    default:
      return `with the reading ${reason}`;
  }
}

const COUNT_HEADS = new Set(['aliveTotal', 'speciesAlive', 'interventionAccepted', 'interventionRejected', 'alive', 'births', 'deaths', 'captures', 'founders', 'descendants', 'infections', 'wholeUnitCells', 'resting', 'glowing', 'glowingStart', 'attached', 'events', 'gateCrossings']);
const CARBON_HEADS = new Set(['inputCarbon', 'intake', 'capturedCarbon', 'field', 'consumed', 'converted', 'patchInput', 'biomass', 'biomassStart', 'biomassTotal', 'preyBiomass', 'transfer', 'intakePhoto', 'intakeSugar']);

/** P5.6: a measure's head, without an @REGION suffix ("moisture@ROOF" → "moisture", "alive.B01@X" → "alive"). */
const headOf = (id: string): string => id.split('@')[0]!.split('.')[0]!;

const ENERGY_HEADS = new Set(['meanEnergy', 'groupEnergy', 'groupEnergyMedian', 'groupEnergyMin', 'groupEnergyMax', 'reserveHeld', 'reservePeak']);

/** Shown instead of an energy of nobody (a mean, median, lowest or highest over no living member). */
export const NONE_ALIVE = 'none alive';

/**
 * True when `id` is an energy over living members and `rec` (the same arm's record) says none are
 * alive: the recorded 0 is not a real value (pairedRun.ts; the card also reports the count).
 */
export function noneAlive(id: string, rec: Readonly<Record<string, number>> | null | undefined): boolean {
  const count = livingCountFor(id);
  return count !== null && rec !== null && rec !== undefined && rec[count] === 0;
}

/**
 * A measured value with its unit: counts whole, times in seconds, carbon in C, energy in E. With the
 * arm's record, an energy over nobody reads "none alive", never "0.00 E".
 */
export function formatMeasure(id: string, value: number, rec?: Readonly<Record<string, number>> | null): string {
  if (noneAlive(id, rec)) return NONE_ALIVE;
  const head = headOf(id);
  if (head === 'extinctAt' || head === 'groupExtinctAt') return value < 0 ? 'not died out' : `${value} s`;
  // P5.6: −1 is "no capture in the run" (pairedRun.ts firstCaptureAt).
  if (head === 'firstCaptureAt') return value < 0 ? 'no capture yet' : `${num(value, 1)} s`;
  if (head === 'seconds' || head === 'runSeconds') return `${value} s`;
  if (head === 'limitSeconds' || head === 'secretingSeconds') return `${num(value, 1)} s`;
  if (head === 'mean' || head === 'moisture') return value.toFixed(3);
  if (COUNT_HEADS.has(head)) return String(Math.round(value));
  if (head === 'biomassRatio') return `× ${value.toFixed(2)}`;
  if (head === 'oxygenMean') return value.toFixed(3);
  const unit = CARBON_HEADS.has(head) ? ' C' : ENERGY_HEADS.has(head) ? ' E' : '';
  return `${num(value, 2)}${unit}`;
}

/**
 * B − A for a measured value, signed, in the value's own units ("—" where a difference means nothing,
 * including an energy over nobody in either copy when the records are given).
 */
export function formatDiff(id: string, a: number, b: number, recA?: Readonly<Record<string, number>> | null, recB?: Readonly<Record<string, number>> | null): string {
  if (noneAlive(id, recA) || noneAlive(id, recB)) return '—';
  const head = headOf(id);
  if (head === 'extinctAt' || head === 'groupExtinctAt' || head === 'firstCaptureAt') return a < 0 || b < 0 ? '—' : signed(b - a, head === 'firstCaptureAt' ? 1 : 0) + ' s';
  if (head === 'seconds' || head === 'runSeconds') return signed(b - a, 1) + ' s';
  return signed(b - a, COUNT_HEADS.has(head) ? 0 : head === 'oxygenMean' || head === 'mean' || head === 'moisture' ? 3 : 2);
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
      return `evolution setting ${evolutionLabel(p.preset)}`;
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
    case 'omitFounders': {
      // P3.6 (E203): "The same, without the 20 Brothmaker founders."
      const f = card.founders[ch.founderIndex];
      const name = f ? (card.speciesNames[f.speciesId] ?? f.speciesId) : '';
      return { a: 'The recipe as written.', b: f ? `The same, without the ${f.count} ${name} founders.` : 'The same, without one founder group.' };
    }
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

/**
 * What completing the card does (SPEC §13.2 completion behavior), worded for the card's kind: one
 * dish keeps running; a paired card's two copies run to their stopping point and are copies, so the
 * player's dish is unchanged.
 */
export function completionText(card: ExperimentCardView): string {
  const steps = card.playerSteps.length > 0 ? ' and you have taken the steps above' : '';
  const stamp = `When every part holds${steps}, your Journal gets a stamp: “${card.journalStamp}”.`;
  return card.paired
    ? `${stamp} Both copies run to their stopping point (${durationText(card.stoppingSeconds)} of dish time) and then stop. They are copies: your dish is unchanged, and closing the run discards them.`
    : `${stamp} The world keeps running.`;
}

/**
 * Why a card's observation stopped without a stamp, for the dish's toast: the player changed the dish
 * or rewound it with Undo before its gate, the dish stopped with an error, or the dish was closed and
 * opened again — the card's observer history is worker state that is not saved (and does not rewind),
 * so the card cannot resume watching exactly.
 */
export function experimentEndedText(reason: 'changed' | 'failed' | 'undone' | 'closed', title: string): string {
  switch (reason) {
    case 'changed':
      return `You changed the dish, so “${title}” stopped observing before its gate. The dish goes on as it is.`;
    case 'failed':
      return `The dish stopped with an error, so “${title}” stopped observing. Nothing was stamped.`;
    case 'undone':
      return `Undo rewound the dish, so “${title}” stopped observing: what it had watched cannot be rewound with it. Nothing was stamped. The dish goes on from where you went back to; start the card again from the Notebook to observe it.`;
    case 'closed':
      return `This dish was made from the card “${title}”. A card observes only a dish started from the Notebook in this session: what it watched is not saved, so it is not watching now. If the card already stamped, the stamp is in your Journal. The dish goes on as a dish; start the card again from the Notebook to observe it.`;
  }
}

/** The toast when a stamp is recorded: one dish keeps running; a paired run's copies are copies. */
export function stampToastText(journalStamp: string, paired: boolean, stored: boolean): string {
  const where = paired ? 'Your dish is unchanged; the copies run to their stopping point.' : 'The dish keeps running.';
  return `Journal stamp: ${journalStamp}. ${where}${stored ? '' : ' (Kept for this session only: this device did not store it.)'}`;
}

/**
 * The dish's notice while a single-arm card's measured gate has held and its Journal stamp waits for
 * the player steps still missing (CT §10.1). The second is the gate's own; the stamp keeps the values
 * of that moment.
 */
export function waitingStepsText(card: ExperimentCardView, reachedAtSecond: number, missing: readonly PlayerStep[]): string {
  const steps = missing.map((st) => playerStepText(card, st)).join(' ');
  const which = missing.length === 1 ? 'one more step' : `${missing.length} more steps`;
  return `“${card.title}”: every part held at ${reachedAtSecond} s. The Journal stamp needs ${which}: ${steps}`;
}

/** One player step the stamp also needs (CT §10.1), as an instruction. */
export function playerStepText(card: ExperimentCardView, step: PlayerStep): string {
  const who = card.stepSpecies.length === 1 ? sp(card, card.stepSpecies[0]!) : 'organism';
  switch (step) {
    case 'inspectFoodUse':
      return `Tap ${/^[aeiou]/i.test(who) ? 'an' : 'a'} ${who} while it is eating: the inspector shows the food it took in.`;
    case 'openResourceHistory':
      return 'Open the dish’s history (More → History) to read the totals over time.';
    case 'viewComparison':
      return 'Read the results of both copies when the run ends.';
    case 'viewPreyHistory':
      return 'Open the population history of both copies on the results.';
    case 'inspectOxygenLimits': {
      // P3.9 (EXP_104): each followed species tapped while the inspector shows an oxygen reading. Revision 2
      // (D-0068): Sprinters run short only while the patch is busiest (~first 10–20 s), so the line says when to look.
      const names = card.stepSpecies.map((id) => sp(card, id));
      const list = names.length <= 1 ? names.join('') : `${names.slice(0, -1).map((n) => `a ${n}`).join(', ')} and a ${names[names.length - 1]}`;
      return `Tap ${names.length <= 1 ? `a ${list}` : list} and read what holds each back; pause in the first seconds, while the patch is busiest. Look for one held back by too little oxygen and the other by too much; if none is, note what holds them back instead.`;
    }
    case 'observeInfection':
      return `Tap an infected ${card.stepSpecies.length >= 1 ? sp(card, card.stepSpecies[0]!) : 'organism'}: the inspector shows its infection and when it bursts.`;
    // P5.6 (CT §10.3 E205, E207, E211): the three Phase 5 steps.
    case 'inspectGlow':
      return `Inspect ${/^[aeiou]/i.test(who) ? 'an' : 'a'} ${who}’s glow: tap one and read whether it is glowing.`;
    case 'toggleShutter':
      return 'Open or close the shutter: tap the shutter gate and switch it.';
    case 'inspectMoisture':
      return 'Inspect moisture in a marked region: tap a cell inside a numbered region and read its moisture.';
  }
}

/** P5.6: the short label of each player step (the card's checklist, tests/ui/measure-words-p5.test.ts). */
export function playerStepLabel(card: ExperimentCardView, step: PlayerStep): string {
  return playerStepText(card, step).split(':')[0]!;
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

/**
 * A journal stamp's measured values as the Notebook shows them. Energies are re-read from the recorded
 * raw numbers with the stamp's own living counts, so an energy over nobody reads "none alive" (also in
 * stamps recorded before that rule); every other cell is shown as recorded.
 */
export function journalMeasureCells(measures: readonly JournalMeasure[]): { readonly id: string; readonly label: string; readonly a: string; readonly b: string | null; readonly diff: string | null }[] {
  const recA: Record<string, number> = {};
  const recB: Record<string, number> = {};
  for (const m of measures) {
    recA[m.id] = m.rawA;
    if (m.rawB !== null) recB[m.id] = m.rawB;
  }
  return measures.map((m) => {
    const emptyA = noneAlive(m.id, recA);
    const emptyB = m.rawB !== null && noneAlive(m.id, recB);
    return {
      id: m.id,
      label: m.label,
      a: emptyA ? NONE_ALIVE : m.a,
      b: emptyB ? NONE_ALIVE : m.b,
      diff: m.diff !== null && (emptyA || emptyB) ? '—' : m.diff,
    };
  });
}

// ---- P5.6 test-only override disclosure (SPEC §13.1 "disclosed in the setup panel and export"; UX §3.3; D02 706) ----

/** The setup panel block's heading (ExperimentCard.tsx). */
export const TEST_OVERRIDE_TITLE = 'Test-only override';

/** The stamp's note on a card whose fixture records a test-only override (ExperimentRun.tsx). */
export const TEST_OVERRIDE_STAMP_NOTE = 'Recorded with a test-only override.';

/** One overridden field in words: "Needlejaw speed 0 (normally 0.6)". Numbers are game units, as recorded. */
export function testOverrideEntry(t: Pick<TestOverrideView, 'speciesName' | 'field' | 'value' | 'normal'>): string {
  const n = (v: number) => String(Number(v.toFixed(3)));
  return `${t.speciesName} ${t.field} ${n(t.value)} (normally ${n(t.normal)})`;
}

/**
 * The setup panel's disclosure lines (UI only; the data is ExperimentCardView.testOverrides): one entry reads as one
 * sentence ("This card's fixture changes the rules for this test only: Needlejaw speed 0 (normally 0.6). It is never
 * offered in an ordinary dish."); several read as a lead line, one line per entry and the closing line. `notes` are
 * the entries' descriptions, verbatim, each once (shown under the lines). Empty for a card without overrides.
 */
export function testOverrideLines(list: readonly TestOverrideView[] | undefined): { readonly lines: readonly string[]; readonly notes: readonly string[] } {
  if (!list || list.length === 0) return { lines: [], notes: [] };
  const lead = 'This card’s fixture changes the rules for this test only';
  const never = 'It is never offered in an ordinary dish.';
  const lines = list.length === 1 ? [`${lead}: ${testOverrideEntry(list[0]!)}. ${never}`] : [`${lead}:`, ...list.map((t) => `${testOverrideEntry(t)}.`), never];
  const notes: string[] = [];
  for (const t of list) if (t.description.trim() && !notes.includes(t.description)) notes.push(t.description);
  return { lines, notes };
}
