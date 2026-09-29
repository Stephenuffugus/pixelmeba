/**
 * The Notebook journal (UX §1 Notebook → Journal; SPEC §13.2 completion behavior; D02 §22): a small
 * store on this device that the Notebook reads. It holds experiment stamps — recorded when a card's
 * observation gate is reached, with the card, the moment (dish time and wall-clock time) and the
 * measured values — and, from P2.8, observed relationships: the player's own "I saw X coincide with Y"
 * notes, with the dish and its time, optionally linked to a stamp or a saved comparison result card.
 * The wording is always "coincided with": a note records what happened together, never a cause
 * (CLAUDE.md honest labels; SPEC §12.5).
 *
 * Journal entries are UI state, never simulation state: nothing here is read back by a world. The
 * device list is the Notebook's index. Entries that belong to a dish are also kept with that dish
 * (SPEC §14.1; D-0027): the sink set by the app sends them to the worker, which stores them in the
 * dish's history record, so they are saved, checksummed, exported and imported with the dish; opening
 * a dish merges its entries back into this list. Storage can be unavailable (private windows); the
 * device list then lasts for this session only.
 *
 * The list holds at most JOURNAL_MAX entries (D-0027). Merging a dish's entries never removes one: they
 * only fill free room. When the list is full, a new entry first takes the place of the oldest entry that
 * was listed from a dish's save or a shared file (a copy: that save or file keeps its own); only when the
 * list holds none of those is the oldest entry removed. Either way the caller is told which one, so an
 * import can never lead to the silent loss of an entry that exists only on this device (fix round 2).
 * An entry the validator would refuse is never stored or shown: it is refused with its reason.
 */
import { signal } from '@preact/signals';
import { JOURNAL_OBSERVATION_MAX, journalRecordProblem } from '@sim/history';

export const JOURNAL_KEY = 'pixelmeba.journal';
/**
 * Ids of listed entries that came with a dish's save or a shared file (merged, not recorded on this
 * device): copies whose dish keeps its own, so they are the first to make room (fix round 2).
 */
export const JOURNAL_FROM_DISHES_KEY = 'pixelmeba.journal.fromDishes';
export const JOURNAL_MAX = 200;
/** Characters per "I saw …" / "… coincide with …" part of an observation. */
export const OBSERVATION_MAX = JOURNAL_OBSERVATION_MAX;

/** One measured value of a stamp, labelled when it was recorded (so later content changes cannot relabel it). */
export interface JournalMeasure {
  readonly id: string;
  readonly label: string;
  /** Formatted with its unit when recorded. */
  readonly a: string;
  readonly b: string | null;
  readonly diff: string | null;
  /** The raw numbers, for export and checks. */
  readonly rawA: number;
  readonly rawB: number | null;
}

/** An experiment card's journal stamp. */
export interface JournalStampEntry {
  readonly version: 1;
  readonly kind: 'experimentStamp';
  readonly id: string;
  readonly experimentId: string;
  readonly title: string;
  /** The card's stamp text, e.g. "Measured sugar made from starch". */
  readonly journalStamp: string;
  /** "this paired run" or "this run": results are never generalised. */
  readonly label: string;
  /** Recipe labels, e.g. "Seeded traits demonstration". */
  readonly labels: readonly string[];
  /** Wall-clock time the stamp was recorded (ISO). */
  readonly recordedAt: string;
  /** Dish time at which every gate clause first held together. */
  readonly reachedAtSecond: number;
  readonly seed: number;
  readonly recipeId: string;
  readonly recipeRevision: number;
  readonly contentVersion: number;
  readonly contentHash: string;
  readonly dishName: string;
  /** The gate clauses as they held, in words with their measured values. */
  readonly gate: readonly { readonly text: string; readonly value: string }[];
  /** The card's measurements at that moment. */
  readonly measures: readonly JournalMeasure[];
  /** The player's prediction note, if one was written before the run. */
  readonly prediction: string;
  /** The player's conclusion label, picked after the results (supports / contradicts / can't tell). */
  readonly conclusion?: string;
  /** P2.8: the world id of the dish the stamp belongs to (kept with that dish's saves); absent on older stamps. */
  readonly worldId?: string;
}

/** What an observation points at (optional): a journal stamp, or a saved comparison result card. */
export type JournalLink =
  | { readonly kind: 'stamp'; readonly id: string; readonly title: string; readonly journalStamp: string }
  | {
      readonly kind: 'compare';
      readonly savedAt: string;
      readonly change: string;
      readonly dishName: string;
      readonly label: string;
    };

/** P2.8: an observed relationship, in the player's words: "I saw {saw} coincide with {coincidedWith}". */
export interface JournalObservationEntry {
  readonly version: 1;
  readonly kind: 'observation';
  readonly id: string;
  readonly saw: string;
  readonly coincidedWith: string;
  /** Wall-clock time it was written (ISO). */
  readonly recordedAt: string;
  /** The dish and dish time it is about, or null when it is not tied to a dish. */
  readonly dish: {
    readonly name: string;
    readonly second: number;
    readonly recipeId: string | null;
    readonly seed: number;
  } | null;
  readonly link: JournalLink | null;
  /** The world id of the dish it belongs to (kept with that dish's saves); absent when not tied to a dish. */
  readonly worldId?: string;
  /** Never set: an observation is not an experiment stamp (so any entry's experimentId / reachedAtSecond can be read). */
  readonly experimentId?: undefined;
  readonly reachedAtSecond?: undefined;
}

/** Every journal entry kind. */
export type JournalEntry = JournalStampEntry | JournalObservationEntry;

/**
 * Whether a stored or imported value is a journal entry this build can show. Every field the Notebook
 * reads is checked, with the same rules the worker applies to a dish's journal (src/sim/history.ts
 * journalRecordProblem): an entry from device storage or from a shared file that fails them is ignored,
 * so one malformed entry can never break the Notebook or hide the others.
 */
export function isJournalEntry(v: unknown): v is JournalEntry {
  return journalRecordProblem(v) === null;
}

export function loadJournal(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter(isJournalEntry) : [];
  } catch {
    return [];
  }
}

/** Newest first. */
export const journal = signal<readonly JournalEntry[]>(loadJournal());

/** The listed entries that are copies from a dish's save or a shared file (ids; only ids still listed). */
function loadFromDishes(list: readonly JournalEntry[]): Set<string> {
  try {
    const raw = localStorage.getItem(JOURNAL_FROM_DISHES_KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    const listed = new Set(list.map((e) => e.id));
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && listed.has(id)) : []);
  } catch {
    return new Set();
  }
}
let fromDishes = loadFromDishes(journal.value);

/** Whether a listed entry came with a dish's save or a shared file rather than being recorded on this device. */
export function isFromDish(id: string): boolean {
  return fromDishes.has(id);
}

/**
 * Where entries that belong to a dish are sent to be kept with it (set by the app: the worker's
 * journalPut for the open dish). Called with every new or changed entry.
 */
let sink: ((entry: JournalEntry) => void) | null = null;

export function setJournalSink(fn: ((entry: JournalEntry) => void) | null): void {
  sink = fn;
}

function store(next: readonly JournalEntry[], copies: ReadonlySet<string> = fromDishes): boolean {
  const listed = new Set(next.map((e) => e.id));
  fromDishes = new Set([...copies].filter((id) => listed.has(id)));
  journal.value = next;
  try {
    // The copy marks first: if the list write then fails, a mark without its entry is dropped at load.
    localStorage.setItem(JOURNAL_FROM_DISHES_KEY, JSON.stringify([...fromDishes]));
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** An entry a new one took the place of in a full Notebook, and whether it was a copy from a dish. */
export interface JournalRemoval {
  readonly entry: JournalEntry;
  /** True: it came with a dish's save or a shared file, which keeps its own copy. False: it was this device's. */
  readonly fromDish: boolean;
}

/**
 * Put a new entry first, making room if the list is full: exactly one entry goes, the oldest copy from a
 * dish if there is one, else the oldest entry. Returns what was removed (null when there was room).
 */
function addFirst(entry: JournalEntry): { readonly stored: boolean; readonly removed: JournalRemoval | null } {
  const list = journal.value;
  if (list.length < JOURNAL_MAX) return { stored: store([entry, ...list]), removed: null };
  let k = -1;
  for (let i = list.length - 1; i >= 0 && k < 0; i--) if (fromDishes.has(list[i]!.id)) k = i;
  const fromDish = k >= 0;
  if (!fromDish) k = list.length - 1;
  const removed: JournalRemoval = { entry: list[k]!, fromDish };
  return { stored: store([entry, ...list.slice(0, k), ...list.slice(k + 1)]), removed };
}

/** Plain text of at most `max` characters (code points); a longer text ends with "…". */
function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

/** A link's texts shortened to what a journal entry keeps (a long comparison change would make it unreadable at load). */
function boundedLink(l: JournalLink | null): JournalLink | null {
  if (!l) return null;
  return l.kind === 'stamp'
    ? { kind: 'stamp', id: l.id, title: clip(l.title, 400), journalStamp: clip(l.journalStamp, 400) }
    : { kind: 'compare', savedAt: l.savedAt, change: clip(l.change, 400), dishName: clip(l.dishName, 400), label: clip(l.label, 400) };
}

let counter = 0;

/**
 * Record an experiment stamp (newest first, at most JOURNAL_MAX listed). `stored` is false when it could
 * not be stored on this device; `removed` names the entry it took the place of in a full Notebook (see
 * the header); `problem` is set, and nothing is listed, stored or kept with the dish, when the stamp is
 * not one the Journal can keep (the validator's reason).
 */
export function addJournalEntry(entry: Omit<JournalStampEntry, 'id' | 'version'>): {
  readonly entry: JournalStampEntry;
  readonly stored: boolean;
  readonly removed?: JournalRemoval | null;
  readonly problem?: string;
} {
  // Kept exactly as it will read back after a reload and in the dish's save (JSON: a measured NaN is null).
  const full = JSON.parse(
    JSON.stringify({ ...entry, version: 1, id: `${entry.experimentId}:${entry.recordedAt}:${++counter}` }),
  ) as JournalStampEntry;
  const problem = journalRecordProblem(full);
  if (problem) return { entry: full, stored: false, removed: null, problem };
  const { stored, removed } = addFirst(full);
  sink?.(full);
  return { entry: full, stored, removed };
}

/** Change one entry (e.g. the conclusion picked after the results); returns false if it is gone or could not be stored. */
export function updateJournalEntry(
  id: string,
  patch: Partial<Pick<JournalStampEntry, 'conclusion'>>,
): boolean {
  const old = journal.value.find((e) => e.id === id);
  if (!old || old.kind !== 'experimentStamp') return false;
  const changed: JournalStampEntry = { ...old, ...patch };
  const ok = store(journal.value.map((e) => (e.id === id ? changed : e)));
  sink?.(changed);
  return ok;
}

/** Plain text of at most `max` characters (control characters become spaces; outer spaces trimmed). */
export function cleanNote(text: string, max = OBSERVATION_MAX): string {
  const s = Array.from(text)
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(s).slice(0, max).join('').trim();
}

/** A part of an observation as the sentence shows it: no trailing punctuation, no repeated lead words. */
function sentencePart(text: string, lead: RegExp): string {
  return text
    .replace(lead, '')
    .replace(/[\s.!?…,;:]+$/u, '')
    .trim();
}
const SAW_LEAD = /^\s*i\s+saw\b[\s:,-]*/iu;
const WITH_LEAD = /^\s*(?:coincid(?:e|es|ed|ing)\s+with|with)\b[\s:,-]*/iu;

export interface ObservationInput {
  readonly saw: string;
  readonly coincidedWith: string;
  /** The dish it is about (with its world id), or null. */
  readonly dish: (JournalObservationEntry['dish'] & { readonly worldId: string }) | null;
  readonly link: JournalLink | null;
  /** Wall-clock time (ISO); defaults to now. */
  readonly recordedAt?: string;
}

/**
 * Record an observed relationship. Both parts are the player's own words (cleaned to plain text of at
 * most OBSERVATION_MAX characters) and both are required. Returns the entry, whether this device stored
 * it and the entry it took the place of in a full Notebook, or the reason it was refused (a note the
 * validator would refuse at the next load is refused now, never shown and then lost).
 */
export function addObservation(
  input: ObservationInput,
):
  | { readonly entry: JournalObservationEntry; readonly stored: boolean; readonly removed: JournalRemoval | null }
  | { readonly error: string } {
  // The sentence adds "I saw", "coincide with" and the full stop itself.
  const saw = sentencePart(cleanNote(input.saw), SAW_LEAD);
  const coincidedWith = sentencePart(cleanNote(input.coincidedWith), WITH_LEAD);
  if (!saw) return { error: 'Write what you saw.' };
  if (!coincidedWith) return { error: 'Write what it coincided with.' };
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const d = input.dish;
  const entry: JournalObservationEntry = {
    version: 1,
    kind: 'observation',
    id: `observation:${recordedAt}:${++counter}`,
    saw,
    coincidedWith,
    recordedAt,
    dish: d ? { name: clip(d.name, 200), second: d.second, recipeId: d.recipeId, seed: d.seed } : null,
    link: boundedLink(input.link),
    ...(d ? { worldId: d.worldId } : {}),
  };
  const problem = journalRecordProblem(entry);
  if (problem === 'its dish id is malformed')
    return { error: 'This note cannot be kept with this dish (its dish id is too long). Untick “About …” to add it to your Notebook only.' };
  if (problem) return { error: `This note could not be added: ${problem}. Nothing was changed.` };
  const { stored, removed } = addFirst(entry);
  sink?.(entry);
  return { entry, stored, removed };
}

/** What merging a dish's entries into this device's Notebook did. */
export interface MergeResult {
  /** Entries now listed on this device. */
  readonly added: number;
  /** Well-formed entries not listed because the Notebook is full (they stay with the dish's save). */
  readonly notListed: number;
}

/**
 * Add entries kept with a dish that this device does not list yet (opening a save or an imported
 * file). Entries already listed are left as they are, and an entry on this device is never removed to
 * make room: merged entries only fill the free room below JOURNAL_MAX (newest first by recorded time);
 * the rest stay with the dish's save and are counted in `notListed`. Malformed entries are ignored.
 * Listed entries are marked as copies from a dish, so a later entry of this device takes their place
 * first when the Notebook is full (fix round 2).
 */
export function mergeJournal(entries: readonly unknown[]): MergeResult {
  const have = new Set(journal.value.map((e) => e.id));
  const fresh = entries.filter(isJournalEntry).filter((e) => !have.has(e.id) && (have.add(e.id), true));
  if (fresh.length === 0) return { added: 0, notListed: 0 };
  const byTime = (a: JournalEntry, b: JournalEntry) =>
    a.recordedAt < b.recordedAt ? 1 : a.recordedAt > b.recordedAt ? -1 : 0;
  const room = Math.max(0, JOURNAL_MAX - journal.value.length);
  const listed = [...fresh].sort(byTime).slice(0, room);
  if (listed.length > 0)
    store([...journal.value, ...listed].sort(byTime), new Set([...fromDishes, ...listed.map((e) => e.id)]));
  return { added: listed.length, notListed: fresh.length - listed.length };
}

/**
 * What the player is told when a new entry took the place of another in a full Notebook: a copy from a
 * dish (that dish's save or file keeps its own), or, only when there was no copy, their oldest entry.
 */
export function journalRemovedText(r: JournalRemoval): string {
  const e = r.entry;
  if (r.fromDish) {
    const dish = e.kind === 'observation' ? (e.dish?.name ?? null) : e.dishName;
    return `Your Notebook lists up to ${JOURNAL_MAX} entries, so it no longer lists the oldest entry that came with ${dish ? `“${dish}”` : 'a saved or shared dish'} (a copy from that dish's save or file).`;
  }
  const what = e.kind === 'observation' ? `“${observationSentence(e)}”` : `the stamp “${e.journalStamp}”`;
  const d = new Date(e.recordedAt);
  const when = Number.isNaN(d.getTime()) ? '' : `, recorded ${d.toLocaleString()}`;
  return `Your Notebook lists up to ${JOURNAL_MAX} entries, so its oldest entry was removed: ${what}${when}.`;
}

/**
 * The honest wording of an observation: the player's two parts joined by "coincide with". Trailing
 * punctuation and a repeated "I saw" / "coincide with" at the start of a part are left out, so the
 * sentence reads as one sentence (also for notes written before parts were cleaned this way).
 */
export function observationSentence(e: Pick<JournalObservationEntry, 'saw' | 'coincidedWith'>): string {
  const saw = sentencePart(e.saw, SAW_LEAD) || e.saw.trim();
  const withWhat = sentencePart(e.coincidedWith, WITH_LEAD) || e.coincidedWith.trim();
  return `I saw ${saw} coincide with ${withWhat}.`;
}

/** Unseen stamps since the Notebook was last opened (a quiet dot on the Notebook button). */
export const journalUnseen = signal<number>(0);
