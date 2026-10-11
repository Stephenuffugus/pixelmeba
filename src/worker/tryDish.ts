/**
 * Try my dish in the worker (P4.7; SPEC §13.6; D09 lines 135-139; D-0081 "Try my dish clones, never
 * mutates"; D-0082 the shelf; D-0071 goals are evaluated, never enforced). Pure helpers the host calls:
 *
 * - the setup's goal options: the goals the dish offers (goals.ts goalCatalog) with each predicate's
 *   duration, so a goal whose duration exceeds the turn is not offered for that turn length;
 * - the turn record (src/persistence/notebookTurns.ts) for turn n, and the clone: every turn is built from
 *   the baseline SAVE TEXT by the load path (loadSaveFile, then deserializeWorld under a new world id from
 *   branchWorldId), never from the open dish's world object, so a turn can never share or change what
 *   another turn or the baseline holds;
 * - the horizon: a turn dish never runs past startTick + horizonTicks while its turn is not finished. The
 *   clock is the world's tick, so Undo or a rollback rewinds it with the world (the record goes back to
 *   'running'), and a reload resumes from the saved record (the clock never restarts).
 *
 * Nothing here touches a speed, a command or the world's state: the host pauses the dish at the horizon.
 */
import type { ContentRegistry } from '@sim/content/registry';
import { deserializeWorld } from '@sim/serialize';
import type { World } from '@sim/world';
import { loadSaveFile } from '@persist/saveFile';
import { branchWorldId } from '@persist/checkpoints';
import { favoritesOnly, type NotebookRecord } from '@persist/notebook';
import { turnEndTick, turnOf, type TurnHorizonTicks, type TurnRecord } from '@persist/notebookTurns';
export { turnGoal } from '@persist/notebookTurns';
import { goalCatalog } from './goals';
import type { TryGoalOption } from './protocol';

/** Readable refusals of Try my dish requests (nothing was changed when one is given). */
export const TRY_REFUSALS = {
  arm: 'A comparison copy cannot start Try my dish. Close the comparison first.',
  sample: 'Transfer, cancel or discard the held sample first; Try my dish starts from a dish with nothing held.',
  failed: 'Something went wrong with this dish, so Try my dish cannot start from it.',
  noStore: 'This device cannot keep a starting point, so Try my dish cannot start.',
  horizon: 'Choose a turn length of 60, 180 or 600 seconds.',
  goal: 'That goal is not available for this dish and turn length.',
  noTurn: 'This dish is not a Try my dish turn.',
  notAtHorizon: 'Another turn can start once this turn reaches its end.',
  unsaved: 'This turn has not been saved. Discard it, or keep it first.',
  baselineMissing: "The saved starting point for these turns is gone, so another turn can't start. This turn is unchanged.",
  inUse: 'That new dish id is already in use.',
} as const;

/** The goals a dish offers for a try, each with its predicate's duration (catalog order). */
export function tryGoalOptions(registry: ContentRegistry, world: World): TryGoalOption[] {
  return goalCatalog(registry, { world }).map((o) => {
    const d = registry.objectives[o.id]?.predicate.durationSeconds;
    return { ...o, durationSeconds: typeof d === 'number' && Number.isFinite(d) ? d : null };
  });
}

/** Whether a goal fits a turn of `horizonSeconds`: a duration longer than the turn cannot be met within it. */
export function goalFitsTurn(option: Pick<TryGoalOption, 'durationSeconds'>, horizonSeconds: number): boolean {
  return option.durationSeconds === null || option.durationSeconds <= horizonSeconds;
}

/** A turn dish's name: the baseline's name and the turn ("Little Living Garden (turn 2)"), at most 60 characters. */
export function turnName(name: string, turn: number): string {
  const suffix = ` (turn ${turn})`;
  const base = name.replace(/ \(turn \d+\)$/u, '').trim() || 'Untitled dish';
  const room = 60 - Array.from(suffix).length;
  const chars = Array.from(base);
  return `${chars.length > room ? `${chars.slice(0, room - 1).join('').trimEnd()}…` : base}${suffix}`;
}

/** The turn record of turn `turn` of a try (state 'running', not kept). */
export function turnRecordFor(args: {
  readonly tryId: string;
  readonly baseline: TurnRecord['baseline'];
  readonly turn: number;
  readonly turnWorldId: string;
  readonly horizonTicks: TurnHorizonTicks;
  readonly objectiveId: string | null;
  readonly prediction: string;
}): TurnRecord {
  return {
    tryId: args.tryId,
    baseline: args.baseline,
    turn: args.turn,
    turnWorldId: args.turnWorldId,
    startTick: args.baseline.tick,
    horizonTicks: args.horizonTicks,
    objectiveId: args.objectiveId,
    prediction: args.prediction,
    state: 'running',
    kept: null,
  };
}

/**
 * Clone a turn from the baseline save text: the load path (loadSaveFile validates the file and builds a
 * world), then the state again under the turn's own world id. The notebook carries the baseline's favorites
 * only (as Duplicate does) plus `turn`. The world, its tick and its stateHash are the baseline's.
 */
export async function cloneTurn(text: string, newDishId: string, turn: (turnWorldId: string) => TurnRecord): Promise<{ readonly world: World; readonly notebook: NotebookRecord; readonly name: string }> {
  const loaded = await loadSaveFile(text);
  const worldId = branchWorldId(loaded.world.worldId, newDishId);
  const world = deserializeWorld({ ...loaded.file.state, worldId });
  const record = turn(worldId);
  return { world, notebook: { ...favoritesOnly(loaded.notebook, worldId), turns: [record] }, name: turnName(record.baseline.name, record.turn) };
}

/** The record with its turn replaced (unsealed). */
export function withTurn(record: NotebookRecord, turn: TurnRecord): NotebookRecord {
  return { ...record, turns: [turn] };
}

/** True when the dish's turn holds time: a turn not finished, at or past its horizon. */
export function turnHoldsTime(record: NotebookRecord, world: World): boolean {
  const t = turnOf(record);
  return t !== null && t.state !== 'finished' && world.tick >= turnEndTick(t);
}

/**
 * The turn after time moved: a running turn at its horizon becomes 'atHorizon'; an 'atHorizon' turn whose
 * world is below its horizon again (Undo, a rollback) becomes 'running'. Null when nothing changed.
 * Fix round 1: a turn that leaves its horizon is no longer the dish its slot holds, so it forgets `kept`
 * (the card never says "Kept in Slot n." for a world the slot does not hold).
 */
export function turnAfterTime(record: NotebookRecord, world: World): TurnRecord | null {
  const t = turnOf(record);
  if (!t || t.state === 'finished') return null;
  const at = world.tick >= turnEndTick(t);
  if (t.state === 'running' && at) return { ...t, state: 'atHorizon' };
  if (t.state === 'atHorizon' && !at) return { ...t, state: 'running', kept: null };
  return null;
}

/** Fix round 1: the turn after its world changed (a command or Undo at the horizon): a kept turn forgets its slot. Null when nothing changed. */
export function turnAfterChange(record: NotebookRecord): TurnRecord | null {
  const t = turnOf(record);
  return t && t.kept !== null ? { ...t, kept: null } : null;
}
