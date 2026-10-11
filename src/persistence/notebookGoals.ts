/**
 * Goal records, the notebook kind 'goals' (P4.4; SPEC §13.5; D-0070 "Notebook state is not world state";
 * D-0071 "Objectives are evaluated, never enforced in the sim").
 *
 * A dish keeps at most GOALS_MAX goal records in its notebook record (src/persistence/notebook.ts), next
 * to the world save and outside the state checksum and stateHash. Each record is one attempt: the
 * objective's id, its title and predicate copied at Start (so later content can never relabel an
 * attempt), its state, its start and end ticks, why it ended, the watch's serializable progress (a
 * running goal resumes from it after a load) and whether its one sentence was shown.
 *
 * `goalsProblem` validates the kind (notebook.ts KIND_PROBLEMS), including that each record is
 * internally consistent (its progress state, ticks, hold, value and shown flag agree with its state);
 * `goalsWorldProblem` checks it against the dish the file carries (notebook.ts worldRefsProblem): its
 * species, and for a running goal its times, that the dish can run it (objectiveRefsProblem: the recorded
 * manifest, species and fields) and that its saved event position is in the dish's past. A record with
 * any problem drops the whole notebook with a message and the world still loads (D-0073).
 */
import { holdsForDuration, objectiveRefsProblem, typedPredicate, usesEventRing } from '@sim/objectives';
import type { ObjectivePredicate, ObjectiveProgress } from '@sim/objectives';
import type { Manifest } from '@sim/content/schema';
import { allocatedFieldIds } from '@sim/fields';
import type { World } from '@sim/world';
import type { NotebookWorldRefs } from './notebook';

/** CT §10.5 / SPEC §13.5 goal states ('inactive' is an objective not started: never written by this build). */
export const GOAL_STATES = ['inactive', 'running', 'completed', 'ended', 'continuedFreely'] as const;
export type GoalState = (typeof GOAL_STATES)[number];

/**
 * Why an attempt stopped:
 * - 'zero': its species reached zero (keepSpeciesAlive);
 * - 'undone': Undo rewound the dish (the observer cannot rewind, D-0027);
 * - 'failed': something went wrong, the dish was paused and restored to its last valid state (the
 *   host's error rollback; the experiments' 'failed' for the same moment);
 * - 'cannotResume': a running goal the reopened dish could not resume (never expected: the file check
 *   refuses such a record; the runner never rewrites a record silently);
 * - 'left': the player left it (Leave goal / Continue freely).
 */
export const GOAL_END_REASONS = ['zero', 'undone', 'failed', 'cannotResume', 'left'] as const;
export type GoalEndReason = (typeof GOAL_END_REASONS)[number];
/** The reasons an attempt can be 'ended' with (the player's 'left' makes it 'continuedFreely'). */
const ENDED_REASONS: readonly GoalEndReason[] = ['zero', 'undone', 'failed', 'cannotResume'];
/** Reasons whose end tick may precede the start (the dish was restored to an earlier moment). */
const RESTORED_REASONS: readonly GoalEndReason[] = ['undone', 'failed', 'cannotResume'];

/** Goal records kept per dish (the 21st attempt removes the oldest record that is not running). */
export const GOALS_MAX = 20;
/** Longest title a record may carry (content titles are short; this bounds a hand-edited file). */
export const GOAL_TITLE_MAX = 120;

export interface GoalPredicateRecord {
  readonly type: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly durationSeconds?: number;
}

export interface GoalRecord {
  /** 'goal-<n>', one more than the highest id the dish recorded; never reused. */
  readonly id: string;
  readonly objectiveId: string;
  /** Copied from the objective at Start. */
  readonly title: string;
  /** Copied from the objective at Start (PredicateSchema shape, one of the five named types). */
  readonly predicate: GoalPredicateRecord;
  readonly state: GoalState;
  /** The dish tick Start armed the predicate at. */
  readonly startTick: number;
  /** The dish tick it completed, ended or was left (null while running). */
  readonly endTick: number | null;
  readonly endReason?: GoalEndReason;
  readonly progress: ObjectiveProgress;
  /** The measured value behind the result (e.g. converted carbon, births), when there is one. */
  readonly value?: number;
  /** The completion or end sentence was shown and dismissed (it is not offered again). */
  readonly shown: boolean;
}

const isInt = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const GOAL_KEYS = ['id', 'objectiveId', 'title', 'predicate', 'state', 'startTick', 'endTick', 'endReason', 'progress', 'value', 'shown'];
const PREDICATE_KEYS = ['type', 'params', 'durationSeconds'];
const PROGRESS_KEYS = ['startTick', 'holdSinceTick', 'state', 'lastEventId'];

/** The goal id's number, or null when it is not 'goal-<n>'. */
export function goalNumber(id: string): number | null {
  const m = /^goal-([1-9][0-9]{0,8})$/.exec(id);
  return m ? Number(m[1]) : null;
}

/** The first problem with one goal record, or null. */
function goalProblem(raw: unknown): string | null {
  if (!isObj(raw)) return 'a goal is not an object';
  for (const k of Object.keys(raw)) if (!GOAL_KEYS.includes(k)) return `a goal has an unknown field "${k.slice(0, 40)}"`;
  if (typeof raw.id !== 'string' || goalNumber(raw.id) === null) return 'a goal has an invalid id';
  if (typeof raw.objectiveId !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(raw.objectiveId)) return 'a goal has an invalid objective';
  if (typeof raw.title !== 'string' || raw.title.trim().length === 0 || raw.title.length > GOAL_TITLE_MAX) return 'a goal has an invalid title';
  const p = raw.predicate;
  if (!isObj(p) || Object.keys(p).some((k) => !PREDICATE_KEYS.includes(k)) || typeof p.type !== 'string' || !isObj(p.params)) return 'a goal has an invalid predicate';
  if (p.durationSeconds !== undefined && typeof p.durationSeconds !== 'number') return 'a goal has an invalid predicate';
  const typed = typedPredicate({ type: p.type, params: p.params, durationSeconds: p.durationSeconds });
  if ('path' in typed) return `a goal has an invalid predicate (${typed.message})`;
  const ring = usesEventRing(typed);
  if (!(GOAL_STATES as readonly unknown[]).includes(raw.state)) return 'a goal has an unknown state';
  if (!isInt(raw.startTick, 0)) return 'a goal has an invalid start tick';
  if (raw.endTick !== null && !isInt(raw.endTick, 0)) return 'a goal has an invalid end tick';
  const state = raw.state as GoalState;
  const open = state === 'running' || state === 'inactive';
  if (open !== (raw.endTick === null)) return 'a goal’s end tick does not match its state';
  const reason = raw.endReason;
  if (reason !== undefined && !(GOAL_END_REASONS as readonly unknown[]).includes(reason)) return 'a goal has an unknown end reason';
  if (state === 'ended' && !(ENDED_REASONS as readonly unknown[]).includes(reason)) return 'an ended goal needs its reason';
  if (state === 'continuedFreely' && reason === undefined) return 'a goal left to continue freely needs its reason';
  if ((open || state === 'completed') && reason !== undefined) return 'a goal that did not end has an end reason';
  // Only a dish restored to an earlier moment (Undo, an error rollback) can end an attempt before its start.
  if (raw.endTick !== null && raw.endTick < raw.startTick && !(RESTORED_REASONS as readonly unknown[]).includes(reason))
    return 'a goal ends before it started';
  const g = raw.progress;
  if (!isObj(g) || Object.keys(g).some((k) => !PROGRESS_KEYS.includes(k))) return 'a goal has invalid progress';
  if (g.startTick !== raw.startTick) return 'a goal’s progress does not match its start';
  if (g.holdSinceTick !== null && !(isInt(g.holdSinceTick, 0) && g.holdSinceTick >= raw.startTick)) return 'a goal has invalid progress';
  if (g.holdSinceTick !== null && !holdsForDuration(typed.type)) return 'a goal holds a duration its predicate does not have';
  if (g.lastEventId !== undefined && !(ring && isInt(g.lastEventId, 0))) return 'a goal has an invalid event position';
  if (!['running', 'completed', 'ended'].includes(g.state as string)) return 'a goal has invalid progress';
  if (!progressStateFits(state, reason as GoalEndReason | undefined, g.state as ObjectiveProgress['state'])) return 'a goal’s progress does not match its state';
  if (raw.value !== undefined && (typeof raw.value !== 'number' || !Number.isFinite(raw.value))) return 'a goal has an invalid value';
  // A value is the measure behind a result: a completion, or the zero that ended a keep goal.
  if (raw.value !== undefined && state !== 'completed' && reason !== 'zero') return 'a goal has a value without a result';
  if (typeof raw.shown !== 'boolean') return 'a goal has an invalid flag';
  if (open && raw.shown) return 'a goal that has not finished was marked shown';
  return null;
}

/**
 * The progress state each record state is written with: running → 'running', completed → 'completed',
 * anything that stopped otherwise → 'ended'. The wave 5b build left 'running' in an attempt that Undo
 * ended or the player left while it ran (and kept it when such an attempt was continued freely): those
 * records are accepted as they were written.
 */
function progressStateFits(state: GoalState, reason: GoalEndReason | undefined, progress: ObjectiveProgress['state']): boolean {
  switch (state) {
    case 'running':
    case 'inactive':
      return progress === 'running';
    case 'completed':
      return progress === 'completed';
    case 'ended':
      return progress === 'ended' || (progress === 'running' && reason === 'undone');
    case 'continuedFreely':
      return progress === 'ended' || (progress === 'running' && (reason === 'left' || reason === 'undone'));
  }
}

/** The first problem with the goals kind, or null (notebook.ts KIND_PROBLEMS.goals; a missing key reads as []). */
export function goalsProblem(raw: unknown): string | null {
  if (!Array.isArray(raw)) return 'goals is not a list';
  if (raw.length > GOALS_MAX) return 'too many goals';
  const ids: string[] = [];
  let running = 0;
  for (const g of raw as unknown[]) {
    const p = goalProblem(g);
    if (p) return p;
    const r = g as GoalRecord;
    if (ids.includes(r.id)) return 'two goals share an id';
    ids.push(r.id);
    if (r.state === 'running') running++;
  }
  if (running > 1) return 'more than one goal is running';
  return null;
}

/**
 * What a running goal is checked against besides NotebookWorldRefs (goalWorldRefsOf): the dish's recorded
 * manifest and allocated fields (can it run the predicate) and its next event id (the saved event
 * position must be in its past). Optional, so a caller that passes only NotebookWorldRefs still works.
 */
export interface GoalWorldExtras {
  readonly manifest: Manifest;
  readonly fieldIds: readonly string[];
  /** world.counters.nextEventId. */
  readonly nextEventId: number;
}
export type GoalWorldRefs = NotebookWorldRefs & Partial<GoalWorldExtras>;

/** The extras `goalsWorldProblem` checks a running goal against, read from the dish the file carries. */
export function goalWorldRefsOf(world: World): GoalWorldExtras {
  return { manifest: world.content.manifest, fieldIds: allocatedFieldIds(world.fields), nextEventId: world.counters.nextEventId };
}

/**
 * The first goal that names a species the dish does not have, or a running goal that started after the
 * dish's time, that the dish cannot run (objectiveRefsProblem against its recorded manifest, species and
 * fields) or whose saved event position is not in the dish's past, or null. A finished record keeps its
 * ticks even when Undo rewound the dish before them (it records what was seen, like a journal entry,
 * D-0031), and is never run again, so only a running goal is checked against what the dish can run.
 */
export function goalsWorldProblem(raw: Record<string, unknown>, refs: GoalWorldRefs): string | null {
  const goals = (raw.goals ?? []) as readonly GoalRecord[];
  for (const g of goals) {
    const sp = g.predicate.params.species;
    if (typeof sp === 'string' && !refs.speciesIds.includes(sp)) return 'a goal names a species this dish does not have';
    if (g.state !== 'running') continue;
    if (g.startTick > refs.tick || (g.progress.holdSinceTick ?? 0) > refs.tick) return 'a running goal starts after the dish’s time';
    if (refs.manifest !== undefined && refs.fieldIds !== undefined) {
      const why = objectiveRefsProblem({ manifest: refs.manifest, speciesIds: refs.speciesIds, fieldIds: refs.fieldIds }, g.predicate as ObjectivePredicate);
      if (why !== null) return `a running goal cannot run in this dish (${why})`;
    }
    const seen = g.progress.lastEventId;
    if (refs.nextEventId !== undefined && seen !== undefined && seen >= refs.nextEventId) return 'a running goal saw an event this dish never had';
  }
  return null;
}

/** The dish's goal records (an absent kind reads as []). */
export function goalsOf(record: { readonly goals?: readonly GoalRecord[] }): readonly GoalRecord[] {
  return record.goals ?? [];
}
