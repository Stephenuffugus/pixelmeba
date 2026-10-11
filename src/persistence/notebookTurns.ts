/**
 * Try my dish turns, the notebook kind 'turns' (P4.7; SPEC §13.6; D09 lines 135-139; D-0070 "Notebook state
 * is not world state"; D-0071; D-0081 "Try my dish clones, never mutates").
 *
 * A turn dish's notebook record holds exactly one TurnRecord: which try it belongs to, the baseline it was
 * cloned from (its shelf record, checksum, world id, tick and name), its turn number, its own world id,
 * its start tick (= the baseline's tick) and horizon, the goal chosen for the try (its attempt lives in
 * the 'goals' kind), the player's prediction note, its state and, once kept, the named slot it was kept in.
 * The record is never in the world, its checksum or its stateHash; nothing in src/sim reads it. A copy of
 * the dish (Duplicate, a checkpoint branch) is an ordinary dish: favoritesOnly never copies it.
 *
 * `turnsProblem` validates the kind (notebook.ts KIND_PROBLEMS); `turnsWorldProblem` checks it against the
 * dish the file carries. Any problem drops the whole notebook with a message and the world still loads.
 */
import type { NotebookWorldRefs } from './notebook';
import { goalsOf, type GoalRecord } from './notebookGoals';

/** CT §12.10 "turn horizons 60/180/600 s", in ticks. */
export const TURN_HORIZON_TICKS = [600, 1800, 6000] as const;
export type TurnHorizonTicks = (typeof TURN_HORIZON_TICKS)[number];
/** The turn lengths offered, in dish seconds (default 180, D09 line 135). */
export const TURN_HORIZON_SECONDS = [60, 180, 600] as const;
export const TURN_HORIZON_DEFAULT_SECONDS = 180;
/** A prediction note's longest length (characters). */
export const TURN_PREDICTION_MAX = 200;
/** A turn dish keeps one record. */
export const TURNS_MAX = 1;

export const TURN_STATES = ['running', 'atHorizon', 'finished'] as const;
export type TurnState = (typeof TURN_STATES)[number];

export interface TurnBaseline {
  /** The shelf record (src/persistence/shelf.ts) holding the baseline save. */
  readonly shelfId: string;
  /** The baseline save's checksum (sha256 over its canonical state). */
  readonly checksum: string;
  readonly worldId: string;
  readonly tick: number;
  readonly name: string;
}

export interface TurnRecord {
  /** 'try-<n>': the try every turn of one baseline shares. */
  readonly tryId: string;
  readonly baseline: TurnBaseline;
  /** 1, 2, … */
  readonly turn: number;
  /** This turn dish's world id (the notebook's own world id). */
  readonly turnWorldId: string;
  /** The dish tick the turn started at (= the baseline's tick). */
  readonly startTick: number;
  readonly horizonTicks: TurnHorizonTicks;
  /** The goal chosen for the try (null: free observation). Its attempt is in the 'goals' kind. */
  readonly objectiveId: string | null;
  /** The player's prediction note ('' when none; never graded). */
  readonly prediction: string;
  readonly state: TurnState;
  /** The named slot it was kept in (null: not kept). */
  readonly kept: { readonly slotId: string } | null;
}

const isInt = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const TURN_KEYS = ['tryId', 'baseline', 'turn', 'turnWorldId', 'startTick', 'horizonTicks', 'objectiveId', 'prediction', 'state', 'kept'];
const BASELINE_KEYS = ['shelfId', 'checksum', 'worldId', 'tick', 'name'];
const NAMED_SLOT = /^slot([1-9]|10)$/;

/** A prediction note as written into a record: control characters become spaces, trimmed, at most 200 characters. */
export function cleanPrediction(text: unknown): string {
  if (typeof text !== 'string') return '';
  const s = Array.from(text)
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
    .join('')
    .trim();
  return Array.from(s).slice(0, TURN_PREDICTION_MAX).join('').trim();
}

/** The first problem with one turn record, or null. */
function turnProblem(raw: unknown, worldId: unknown): string | null {
  if (!isObj(raw)) return 'a turn is not an object';
  for (const k of Object.keys(raw)) if (!TURN_KEYS.includes(k)) return `a turn has an unknown field "${k.slice(0, 40)}"`;
  if (typeof raw.tryId !== 'string' || !/^try-[1-9][0-9]{0,8}$/.test(raw.tryId)) return 'a turn has an invalid try id';
  const b = raw.baseline;
  if (!isObj(b) || Object.keys(b).some((k) => !BASELINE_KEYS.includes(k))) return 'a turn has an invalid baseline';
  if (typeof b.shelfId !== 'string' || !/^shelf-baseline-[0-9]{1,12}-[a-z0-9]{1,16}$/i.test(b.shelfId)) return 'a turn has an invalid baseline';
  if (typeof b.checksum !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(b.checksum)) return 'a turn has an invalid baseline checksum';
  if (typeof b.worldId !== 'string' || b.worldId.length === 0 || b.worldId.length > 200) return 'a turn has an invalid baseline';
  if (!isInt(b.tick, 0)) return 'a turn has an invalid baseline tick';
  if (typeof b.name !== 'string' || Array.from(b.name).length > 60) return 'a turn has an invalid baseline name';
  if (!isInt(raw.turn, 1) || raw.turn > 1_000_000) return 'a turn has an invalid number';
  if (typeof raw.turnWorldId !== 'string' || raw.turnWorldId !== worldId) return 'a turn belongs to another dish';
  if (!isInt(raw.startTick, 0)) return 'a turn has an invalid start tick';
  if (raw.startTick !== b.tick) return 'a turn does not start at its baseline';
  if (!(TURN_HORIZON_TICKS as readonly unknown[]).includes(raw.horizonTicks)) return 'a turn has an invalid horizon';
  if (raw.objectiveId !== null && (typeof raw.objectiveId !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(raw.objectiveId))) return 'a turn has an invalid goal';
  if (typeof raw.prediction !== 'string' || cleanPrediction(raw.prediction) !== raw.prediction) return 'a turn has an invalid prediction note';
  if (!(TURN_STATES as readonly unknown[]).includes(raw.state)) return 'a turn has an unknown state';
  const kept = raw.kept;
  if (kept !== null && (!isObj(kept) || Object.keys(kept).some((k) => k !== 'slotId') || typeof kept.slotId !== 'string' || !NAMED_SLOT.test(kept.slotId))) return 'a turn has an invalid kept slot';
  return null;
}

/** The first problem with the turns kind, or null (notebook.ts KIND_PROBLEMS.turns; a missing key reads as []). */
export function turnsProblem(raw: unknown, record: Record<string, unknown>): string | null {
  if (!Array.isArray(raw)) return 'turns is not a list';
  if (raw.length > TURNS_MAX) return 'a dish holds more than one turn';
  for (const t of raw as unknown[]) {
    const p = turnProblem(t, record.worldId);
    if (p) return p;
  }
  return null;
}

/**
 * The first turn whose times the dish the file carries cannot have, or null: a turn starts at or before
 * the dish's tick, and while it runs (or waits at its horizon) the dish is never past its horizon.
 */
export function turnsWorldProblem(raw: Record<string, unknown>, refs: NotebookWorldRefs): string | null {
  for (const t of (raw.turns ?? []) as readonly TurnRecord[]) {
    if (t.startTick > refs.tick) return 'a turn starts after the dish’s time';
    if (t.state !== 'finished' && refs.tick > t.startTick + t.horizonTicks) return 'a turn runs past its horizon';
  }
  return null;
}

/** The dish's turn record (null: not a turn dish). */
export function turnOf(record: { readonly turns?: readonly TurnRecord[] }): TurnRecord | null {
  return record.turns?.[0] ?? null;
}

/** The turn's horizon tick (the dish never runs past it while the turn is not finished). */
export function turnEndTick(t: TurnRecord): number {
  return t.startTick + t.horizonTicks;
}

/** The horizon in ticks for a turn length in seconds, or null when it is not one of 60/180/600. */
export function horizonTicksOf(seconds: unknown): TurnHorizonTicks | null {
  const i = (TURN_HORIZON_SECONDS as readonly unknown[]).indexOf(seconds);
  return i >= 0 ? TURN_HORIZON_TICKS[i]! : null;
}

/**
 * The record as "Export without names or notes" carries it (D-0029): the turn's prediction note (the
 * player's note) and the baseline's dish name leave out. Unsealed; a record without a turn is returned as is.
 */
export function withoutTurnNotes<T extends { readonly turns?: readonly TurnRecord[] }>(record: T): T {
  const t = turnOf(record);
  if (!t) return record;
  return { ...record, turns: [{ ...t, prediction: '', baseline: { ...t.baseline, name: 'Shared dish' } }] };
}

/** The goal attempt of the dish's turn (started at the turn's start tick for its objective), or null. */
export function turnGoal(record: { readonly turns?: readonly TurnRecord[]; readonly goals?: readonly GoalRecord[] }): GoalRecord | null {
  const t = turnOf(record);
  if (!t || t.objectiveId === null) return null;
  return goalsOf(record).find((g) => g.objectiveId === t.objectiveId && g.startTick === t.startTick) ?? null;
}
