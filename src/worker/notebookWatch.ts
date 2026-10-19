/**
 * The notebook's watch on a played dish (P4.1; D-0070, D-0071): the single place where notebook kinds
 * observe the world as it runs. Stage 2 adds the story detector and the goal runner here, one line each
 * (a stage hook in `hook`, an after-tick call in `afterTick`).
 *
 * Observation only: it reads the world and never writes it, draws no randomness and adds no events or
 * commands. It is created per played dish (DishHost.stepDish and the favorite requests), never for a
 * comparison or experiment arm and never in a rollback replay. After an undo, a rollback or a reload the
 * host sees `watches(world)` false and calls `rebind(world)`, which rebuilds from the saved record.
 */
import type { World } from '@sim/world';
import type { NotebookRecord } from '@persist/notebook';
import type { NotebookChange } from './protocol';
import { FavoriteTracker, reconcileFavorites, recordExtinction } from './favorites';
import { StoryDetector, storyDetection, storiesAfterRestore } from './stories';
import { GoalRunner, goalsAfterRestore, type GoalRestoreCause } from './goals';
import { SuccessionDetector, successionAfterRestore, successionDetection } from './succession';

/** Where the dish keeps its notebook record (the host's Dish.notebook). */
export interface NotebookRef {
  get(): NotebookRecord;
  set(record: NotebookRecord): void;
}

export class NotebookWatch {
  /**
   * Read-only stage hook for step(): P5.6, the running goal's measured clauses (GoalRunner.hook) and the
   * succession detector's intake record (SuccessionDetector.hook).
   */
  readonly hook: (stage: number, world: World) => void;
  readonly favorites: FavoriteTracker;
  /** P4.2: the story-card detector (src/worker/stories.ts; null only when a test turns detection off). */
  readonly stories: StoryDetector | null;
  /** P4.4: the dish's goal runner (src/worker/goals.ts; idle until the player starts a goal). */
  readonly goals: GoalRunner;
  /** P5.6: the succession notebook's minute detector (src/worker/succession.ts; null only when a test turns it off). */
  readonly succession: SuccessionDetector | null;
  private world: World;

  constructor(
    world: World,
    private readonly ref: NotebookRef,
  ) {
    this.world = world;
    this.favorites = new FavoriteTracker(world, ref.get());
    this.stories = storyDetection.enabled ? new StoryDetector(world, ref) : null; // P4.2
    this.goals = new GoalRunner(world, ref); // P4.4
    this.succession = successionDetection.enabled ? new SuccessionDetector(world, ref) : null; // P5.6
    const goals = this.goals;
    const succession = this.succession;
    this.hook = (stage, w) => {
      goals.hook(stage, w);
      succession?.hook(stage, w);
    };
  }

  watches(world: World): boolean {
    return this.world === world && this.favorites.watches(world);
  }

  /** Bind to `world` (restored, reloaded or replaced) and rebuild from the record as it stands. */
  rebind(world: World): void {
    this.world = world;
    this.favorites.bind(world, this.ref.get());
    this.stories?.rebind(world); // P4.2: rebuilt only when the world was replaced
    this.goals.bind(world); // P4.4: resumes the record's running goal (kept as is when nothing changed)
    this.succession?.rebind(world); // P5.6: rebuilt only when the world was replaced (watchedFromTick = its tick)
  }

  /** The record with every kind's live state written in (members of the followed families). */
  materialize(): NotebookRecord {
    const next = this.favorites.materialize(this.ref.get());
    if (next !== this.ref.get()) this.ref.set(next);
    return next;
  }

  /** Call once after every step of the watched world. Returns the changes to announce (the record is already updated). */
  afterTick(world: World): NotebookChange[] {
    if (world !== this.world) this.rebind(world);
    const changes: NotebookChange[] = [];
    const fav = this.favorites.afterTick(world);
    if (fav.length > 0) {
      let rebuild = false;
      for (const c of fav) {
        if (c.kind === 'favoriteExtinct') {
          const r = recordExtinction(world, this.materialize(), c.id, c.extinct);
          this.ref.set(r.record);
          rebuild = true;
          changes.push({
            kind: 'favoriteExtinct',
            id: c.id,
            ...(r.removed !== null ? { removed: r.removed } : {}),
          });
        } else changes.push({ kind: 'favoriteRepresentativeGone', id: c.id, candidates: c.candidates });
      }
      // A family with no members left is no longer followed: the others are rebuilt from their members.
      if (rebuild) this.favorites.bind(world, this.materialize());
    }
    if (this.stories) changes.push(...this.stories.afterTick(world)); // P4.2
    changes.push(...this.goals.afterTick(world)); // P4.4
    if (this.succession) changes.push(...this.succession.afterTick(world)); // P5.6
    return changes;
  }
}

/**
 * P4.1 fix round 1: the notebook after Undo or a rollback restored `world` to an earlier moment. The
 * record is kept (like the journal, D-0031), but each kind is checked against the restored dish so that
 * nothing it says is false there (favorites.ts reconcileFavorites). Stage 2 adds its kinds here, one
 * line each. `cause` says what restored it (a running goal's end reason names it).
 *
 * `changes` lists one change per kind that changed, in this order: favoritesRestored, storiesRestored,
 * then one { kind: 'goal' } per goal that ended, then (P5.6) one { kind: 'successionRestored' } per minute
 * entry dropped (empty when nothing changed). The host posts each as its
 * own notebookChanged carrying the final `record`, so every kind's listener sees its own change.
 */
export function notebookAfterRestore(
  world: World,
  record: NotebookRecord,
  cause: GoalRestoreCause,
): { record: NotebookRecord; changes: NotebookChange[] } {
  const gl = goalsAfterRestore(world, record, cause); // P4.4: a running goal ends 'undone' or 'failed' (its observer cannot rewind)
  const fav = reconcileFavorites(world, gl.record);
  const st = storiesAfterRestore(world, fav.record); // P4.2: cards found in the undone time go
  const sc = successionAfterRestore(world, st.record); // P5.6: minute entries after the restored tick go
  const changes: NotebookChange[] = [];
  if (fav.changed)
    changes.push({
      kind: 'favoritesRestored',
      removed: fav.removed,
      ...(fav.dropped.length > 0 ? { unpinnedRemoved: fav.dropped } : {}),
    });
  if (st.changed) changes.push({ kind: 'storiesRestored', removed: st.removed });
  for (const g of gl.changed) changes.push({ kind: 'goal', id: g.id, state: g.state }); // P4.4
  for (const id of sc.removed) changes.push({ kind: 'successionRestored', id }); // P5.6: one change per entry dropped
  // Fix round 1: seen feeding links of the undone minutes also go (no change of their own: the Notebook shows none).
  return { record: changes.length > 0 || sc.changed ? sc.record : record, changes };
}
