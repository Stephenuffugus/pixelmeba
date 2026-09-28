/**
 * The Notebook journal (UX §1 Notebook → Journal; SPEC §13.2 completion behavior; D02 §22): a small
 * store on this device that the Notebook reads. Today it holds experiment stamps — recorded when a
 * card's observation gate is reached, with the card, the moment (dish time and wall-clock time) and
 * the measured values; P2.8 adds observed relationships as further entry kinds.
 *
 * Journal entries are UI state, never simulation state: nothing here is read back by a world. Storage
 * can be unavailable (private windows); the journal then lasts for this session only.
 */
import { signal } from '@preact/signals';

export const JOURNAL_KEY = 'pixelmeba.journal';
export const JOURNAL_MAX = 200;

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
}

/** Every journal entry kind (P2.8 adds observed relationships). */
export type JournalEntry = JournalStampEntry;

function isEntry(v: unknown): v is JournalEntry {
  return typeof v === 'object' && v !== null && (v as { kind?: unknown }).kind === 'experimentStamp' && typeof (v as { id?: unknown }).id === 'string';
}

export function loadJournal(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter(isEntry) : [];
  } catch {
    return [];
  }
}

/** Newest first. */
export const journal = signal<readonly JournalEntry[]>(loadJournal());

let counter = 0;

/** Record an entry (newest first, at most JOURNAL_MAX kept). Returns false when it could not be stored on this device. */
export function addJournalEntry(entry: Omit<JournalEntry, 'id' | 'version'>): { readonly entry: JournalEntry; readonly stored: boolean } {
  const full: JournalEntry = { ...entry, version: 1, id: `${entry.experimentId}:${entry.recordedAt}:${++counter}` };
  const next = [full, ...journal.value].slice(0, JOURNAL_MAX);
  journal.value = next;
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(next));
    return { entry: full, stored: true };
  } catch {
    return { entry: full, stored: false };
  }
}

/** Change one entry (e.g. the conclusion picked after the results); returns false if it is gone or could not be stored. */
export function updateJournalEntry(id: string, patch: Partial<Pick<JournalStampEntry, 'conclusion'>>): boolean {
  if (!journal.value.some((e) => e.id === id)) return false;
  const next = journal.value.map((e) => (e.id === id ? { ...e, ...patch } : e));
  journal.value = next;
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** Unseen stamps since the Notebook was last opened (a quiet dot on the Notebook button). */
export const journalUnseen = signal<number>(0);
