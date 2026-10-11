/**
 * Goals on a played dish (P4.4; SPEC §13.5; CT §10.5; D09 §6; D-0070, D-0071). Worker state saved in the
 * dish's notebook record (kind 'goals', src/persistence/notebookGoals.ts), never in the world:
 *
 * - off by default: nothing runs until the player starts a goal ('goalStart'); at most one runs;
 * - Start arms the objective (src/sim/objectives.ts ObjectiveWatch) at the dish's current tick and copies
 *   its title and predicate into the record; pausing stops its clock (it counts dish ticks only);
 * - after every step of the dish (NotebookWatch.afterTick) the watch is evaluated; a completion or an end
 *   updates the record and is announced as a NotebookChange { kind: 'goal' }. Nothing here touches a
 *   speed, a pause state, a command or the world (D09 "Never change the simulation to force success");
 * - Leave goal → 'continuedFreely' (the record says "Continued freely."); an ended attempt can be left the
 *   same way; Try again is a new Start;
 * - Undo while a goal runs ends the attempt with endReason 'undone'; an error rollback (something went
 *   wrong, the dish was paused and restored to its last valid state) ends it with 'failed' (the observer
 *   cannot rewind, as an experiment card's cannot, D-0027); a finished record stays as it was;
 * - a reload resumes a running goal from its saved progress (durations from holdSinceTick; event-ring
 *   goals from the saved lastEventId; births and conversion from a fresh observer at the load tick, exact
 *   because evaluation is per tick). The file check refuses a running goal the dish cannot run; should a
 *   resume fail anyway, the attempt ends with 'cannotResume' and the change is announced (never a silent
 *   rewrite);
 * - every record is written canonically: progress.state is 'running' only while the attempt runs,
 *   'completed' when it completed and 'ended' otherwise (notebookGoals.ts progressStateFits).
 *
 * Never used for a comparison arm, an experiment arm or the transient Continue copy (DishHost.watchOf),
 * and never during a rollback replay.
 */
import type { ContentRegistry } from '@sim/content/registry';
import type { Manifest, ObjectiveDef } from '@sim/content/schema';
import { variantRecordOf } from '@sim/variants';
import { objectiveCatalog, objectiveManifestProblem, objectiveSupportProblem, ObjectiveError, ObjectiveWatch } from '@sim/objectives';
import type { World } from '@sim/world';
import type { NotebookRecord } from '@persist/notebook';
import { goalNumber, GOALS_MAX, goalsOf, type GoalEndReason, type GoalRecord } from '@persist/notebookGoals';
import type { GoalOffer, NotebookChange } from './protocol';

/** Where the dish keeps its notebook record (structurally notebookWatch.ts NotebookRef). */
export interface GoalRef {
  get(): NotebookRecord;
  set(record: NotebookRecord): void;
}

/** Readable refusals of goal requests. */
export const GOAL_REFUSALS = {
  unknown: 'That goal is not available for this dish.',
  running: 'A goal is already running. Leave it first.',
  nothingToLeave: 'No goal is running.',
  arm: 'Comparison copies take no goals.',
} as const;

/** The recipe a dish's goals are offered for: a What if? variant dish counts through its source recipe. */
export function goalRecipeOf(world: World): string | null {
  const v = variantRecordOf(world);
  if (v) return v.sourceId;
  const p = world.content.provenance;
  return p.createdFrom === 'recipe' ? p.recipeId : null;
}

function offerOf(def: ObjectiveDef): GoalOffer {
  return { id: def.id, title: def.title, summary: def.summary, completedText: def.completedText, endedText: def.endedText ?? null };
}

/**
 * The goals offered for a dish (`world`) or, before a dish exists, for recipe `recipeId` under the build's
 * `manifest` (the Play card): shipped objectives whose offerOn names the recipe and whose predicate the
 * world's own recorded manifest supports. Catalog order (objective id).
 */
export function goalCatalog(registry: ContentRegistry, at: { readonly world: World } | { readonly recipeId: string | null; readonly manifest: Manifest }): GoalOffer[] {
  const recipe = 'world' in at ? goalRecipeOf(at.world) : at.recipeId;
  if (recipe === null) return [];
  return objectiveCatalog(registry)
    .filter((o) => o.offerOn.includes(recipe))
    .filter((o) => ('world' in at ? objectiveSupportProblem(at.world, o.predicate) : objectiveManifestProblem(at.manifest, o.predicate)) === null)
    .map(offerOf);
}

function replaceGoal(record: NotebookRecord, id: string, next: GoalRecord): NotebookRecord {
  return { ...record, goals: goalsOf(record).map((g) => (g.id === id ? next : g)) };
}

/** The record with the watch's outcome written into goal `g` (completed, or ended because its species reached zero). */
function settled(g: GoalRecord, w: ObjectiveWatch): GoalRecord {
  const { value: _v, endReason: _r, ...rest } = g;
  const value = w.value;
  return {
    ...rest,
    state: w.state,
    endTick: w.state === 'running' ? null : w.endTick,
    ...(w.state === 'ended' ? { endReason: 'zero' as const } : {}),
    progress: w.progress(),
    ...(value !== null && Number.isFinite(value) ? { value } : {}),
  };
}

/** What restored a dish to an earlier moment: the player's Undo, or the host's error rollback. */
export type GoalRestoreCause = 'undo' | 'rollback';

/** A running record `g` ended at `world.tick` for `reason` (canonical: progress state 'ended', no value, not shown). */
function endedRecord(g: GoalRecord, world: World, reason: GoalEndReason): GoalRecord {
  const { value: _v, ...rest } = g;
  return { ...rest, state: 'ended', endTick: world.tick, endReason: reason, progress: { ...g.progress, state: 'ended' }, shown: false };
}

/**
 * The notebook after Undo or an error rollback restored `world` (notebookWatch.ts notebookAfterRestore):
 * a running goal ends at the restored tick (its observer cannot rewind) with endReason 'undone' after
 * Undo and 'failed' after an error rollback, so its sentence names what really happened. Finished
 * records are kept as they were. `changed` lists the goals that ended.
 */
export function goalsAfterRestore(world: World, record: NotebookRecord, cause: GoalRestoreCause): { record: NotebookRecord; changed: GoalRecord[] } {
  const changed: GoalRecord[] = [];
  const goals = goalsOf(record).map((g) => {
    if (g.state !== 'running') return g;
    const ended = endedRecord(g, world, cause === 'undo' ? 'undone' : 'failed');
    changed.push(ended);
    return ended;
  });
  return changed.length > 0 ? { record: { ...record, goals }, changed } : { record, changed };
}

export class GoalRunner {
  private world: World;
  private watch: ObjectiveWatch | null = null;
  private goalId: string | null = null;
  /** Changes made while binding (a goal that could not resume), announced by the next afterTick. */
  private pending: NotebookChange[] = [];

  constructor(
    world: World,
    private readonly ref: GoalRef,
  ) {
    this.world = world;
    this.bind(world);
  }

  /** The running goal's id (null: none). */
  get running(): string | null {
    return this.watch ? this.goalId : null;
  }

  /**
   * Bind to `world` and resume the record's running goal, if any. Kept as is when nothing changed (same
   * world, same running goal), so a favorite change never resets a watch.
   */
  bind(world: World): void {
    const running = goalsOf(this.ref.get()).find((g) => g.state === 'running') ?? null;
    if (world === this.world && running !== null && this.watch !== null && running.id === this.goalId) return;
    this.world = world;
    this.watch = null;
    this.goalId = null;
    if (!running) return;
    try {
      this.watch = new ObjectiveWatch(running.predicate as ObjectiveDef['predicate'], world, running.progress);
      this.goalId = running.id;
    } catch (e) {
      if (!(e instanceof ObjectiveError)) throw e;
      // A running goal this dish cannot resume. The file check refuses such a record, so this is not
      // expected; if it happens, the attempt ends for that reason (never relabelled as an Undo) and the
      // change is announced with the next afterTick (the record already says so to any reader).
      const record = this.ref.get();
      this.ref.set(replaceGoal(record, running.id, endedRecord(running, world, 'cannotResume')));
      this.pending.push({ kind: 'goal', id: running.id, state: 'ended' });
    }
  }

  /** The changes binding made (taken once). */
  private takePending(): NotebookChange[] {
    const p = this.pending;
    this.pending = [];
    return p;
  }

  /** Call once after every step of the watched world (and after an accepted command; only a new tick is evaluated). */
  afterTick(world: World): NotebookChange[] {
    if (world !== this.world) this.bind(world);
    const out = this.takePending();
    const w = this.watch;
    const id = this.goalId;
    if (!w || id === null) return out;
    const record = this.ref.get();
    const g = goalsOf(record).find((x) => x.id === id);
    if (!g || g.state !== 'running') {
      this.watch = null; // left or ended elsewhere
      this.goalId = null;
      return out;
    }
    const changed = w.afterTick(world);
    if (!changed) {
      // A duration's hold began or reset, or an event-ring goal saw later records: the saved progress
      // follows, so a reload resumes exactly here.
      const p = w.progress();
      if (p.holdSinceTick !== g.progress.holdSinceTick || p.lastEventId !== g.progress.lastEventId) this.ref.set(replaceGoal(record, id, { ...g, progress: p }));
      return out;
    }
    const next = settled(g, w);
    this.ref.set(replaceGoal(record, id, next));
    this.watch = null;
    this.goalId = null;
    return [...out, { kind: 'goal', id, state: next.state }];
  }

  /**
   * Start `def` on `world` now (the player's choice). Refused while another goal runs or when this dish
   * does not offer it. The 21st record removes the oldest one that is not running. Returns the changes to
   * announce: an attempt can settle at once (e.g. no Sprinters left at Start).
   */
  start(world: World, def: ObjectiveDef, offered: boolean): { refused: string | null; changes: NotebookChange[] } {
    if (world !== this.world) this.bind(world);
    const record = this.ref.get();
    const goals = goalsOf(record);
    if (goals.some((g) => g.state === 'running')) return { refused: GOAL_REFUSALS.running, changes: [] };
    if (!offered) return { refused: GOAL_REFUSALS.unknown, changes: [] };
    let watch: ObjectiveWatch;
    try {
      watch = new ObjectiveWatch(def.predicate, world);
    } catch (e) {
      if (e instanceof ObjectiveError) return { refused: GOAL_REFUSALS.unknown, changes: [] };
      throw e;
    }
    const n = goals.reduce((m, g) => Math.max(m, goalNumber(g.id) ?? 0), 0) + 1;
    const id = `goal-${n}`;
    const base: GoalRecord = {
      id,
      objectiveId: def.id,
      title: def.title,
      // Copied, so later content can never relabel this attempt.
      predicate: JSON.parse(JSON.stringify(def.predicate)) as GoalRecord['predicate'],
      state: 'running',
      startTick: world.tick,
      endTick: null,
      progress: watch.progress(),
      shown: false,
    };
    const fresh = watch.state === 'running' ? base : settled(base, watch);
    let kept = [...goals, fresh];
    while (kept.length > GOALS_MAX) {
      const oldest = kept.findIndex((g) => g.state !== 'running');
      kept = kept.filter((_, i) => i !== oldest);
    }
    this.ref.set({ ...record, goals: kept });
    if (watch.state === 'running') {
      this.world = world;
      this.watch = watch;
      this.goalId = id;
      return { refused: null, changes: [] };
    }
    return { refused: null, changes: [{ kind: 'goal', id, state: fresh.state }] };
  }

  /**
   * Leave goal: the running goal, or the latest record when it ended, becomes 'continuedFreely' (an
   * ended attempt keeps its end tick and reason). The dish goes on exactly as it is.
   */
  leave(world: World): { refused: string | null; changes: NotebookChange[] } {
    const record = this.ref.get();
    const goals = goalsOf(record);
    const running = goals.find((g) => g.state === 'running');
    const last = goals.at(-1);
    const g = running ?? (last && last.state === 'ended' ? last : undefined);
    if (!g) return { refused: GOAL_REFUSALS.nothingToLeave, changes: [] };
    const next: GoalRecord =
      g.state === 'running'
        ? { ...g, state: 'continuedFreely', endTick: world.tick, endReason: 'left', progress: { ...g.progress, state: 'ended' }, shown: true }
        : { ...g, state: 'continuedFreely', progress: { ...g.progress, state: 'ended' }, shown: true }; // canonical also for a wave 5b record
    this.ref.set(replaceGoal(record, g.id, next));
    if (g.id === this.goalId) {
      this.watch = null;
      this.goalId = null;
    }
    return { refused: null, changes: [{ kind: 'goal', id: g.id, state: 'continuedFreely' }] };
  }

  /** The player saw (and dismissed) goal `id`'s sentence: it is not offered again, also after a reload. */
  shown(id: string): boolean {
    const record = this.ref.get();
    const g = goalsOf(record).find((x) => x.id === id);
    if (!g || g.shown || g.state === 'running') return false;
    this.ref.set(replaceGoal(record, id, { ...g, shown: true }));
    return true;
  }
}
