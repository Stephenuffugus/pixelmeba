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

/** Where the dish keeps its notebook record (the host's Dish.notebook). */
export interface NotebookRef {
  get(): NotebookRecord;
  set(record: NotebookRecord): void;
}

export class NotebookWatch {
  /** Read-only stage hook for step() (none yet; stage 2's story detector may add one). */
  readonly hook: ((stage: number, world: World) => void) | undefined = undefined;
  readonly favorites: FavoriteTracker;
  private world: World;

  constructor(
    world: World,
    private readonly ref: NotebookRef,
  ) {
    this.world = world;
    this.favorites = new FavoriteTracker(world, ref.get());
  }

  watches(world: World): boolean {
    return this.world === world && this.favorites.watches(world);
  }

  /** Bind to `world` (restored, reloaded or replaced) and rebuild from the record as it stands. */
  rebind(world: World): void {
    this.world = world;
    this.favorites.bind(world, this.ref.get());
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
    return changes;
  }
}

/**
 * P4.1 fix round 1: the notebook after Undo or a rollback restored `world` to an earlier moment. The
 * record is kept (like the journal, D-0031), but each kind is checked against the restored dish so that
 * nothing it says is false there (favorites.ts reconcileFavorites). Stage 2 adds its kinds here, one
 * line each. `change` is null when nothing changed.
 */
export function notebookAfterRestore(
  world: World,
  record: NotebookRecord,
): { record: NotebookRecord; change: NotebookChange | null } {
  const fav = reconcileFavorites(world, record);
  return fav.changed
    ? {
        record: fav.record,
        change: {
          kind: 'favoritesRestored',
          removed: fav.removed,
          ...(fav.dropped.length > 0 ? { unpinnedRemoved: fav.dropped } : {}),
        },
      }
    : { record, change: null };
}
