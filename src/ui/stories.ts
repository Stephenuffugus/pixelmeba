/**
 * Story cards on the main thread (P4.2; SPEC §12.7, UX §5.9, D08 §07; D-0070). UI state only:
 * - the open dish's cards come from favorites.ts `notebook` (the worker's record, which every
 *   'notebookChanged' and 'notebook' answer replaces);
 * - a card the worker chose to announce (`notified`) asks for the one visible notice (notices.ts,
 *   kind 'story'): "Something happened: {title}" with Open and ✕. Cards the dish already had when it was
 *   opened never ask again, and no sound plays;
 * - Open marks the card seen ('storyMark', never a command); Dismiss marks it dismissed;
 * - Spotlight goes back to the dish and moves the camera to the surviving organism the card names (found
 *   by birth id in the latest snapshot) or to the recorded place. Camera only: no command, no selection,
 *   nothing in the world changes and nothing is re-enacted.
 * - Pause and restore (D08 §07 "use the existing pause-and-restore convention"; the Field Guide's, D-0061,
 *   FieldGuideNav.ts): leaving the dish screen pauses it (D-0028, state.ts). When the notice's Open takes
 *   a dish screen to the Notebook, the dish and its speed are recorded; going back to that dish through
 *   Spotlight (or `leaveNotebook`, the Notebook's Back) during that visit runs it again at that speed.
 *   Leaving the Notebook any other way drops the record, so every other way keeps today's behaviour.
 */
import { computed, effect, signal } from '@preact/signals';
import { ID_STRIDE, type SnapshotMsg, type Speed } from '@worker/protocol';
import type { StoryCard } from '@persist/notebookStories';
import { storyEventTick } from '@persist/notebookStories';
import { notebook } from './favorites';
import { requestNotice, withdrawNotice } from './notices';
import { autosave, dishInfo, getClient, getRenderer, meta, onDishSnapshot, route, setSpeed, showToast } from './state';
import { STORY_TEXT, storyNoticeText, type StoryNames } from './strings/stories';

/** The card the Notebook's "Something happened" tab shows open (null: the list). */
export const openStoryId = signal<string | null>(null);

/** The open dish's cards, newest first (null: no dish open, or its notebook not read yet). */
export const dishStories = computed<readonly StoryCard[] | null>(() => {
  const info = dishInfo.value;
  const nb = notebook.value;
  if (!info || !nb) return null;
  return [...(nb.stories ?? [])].reverse();
});

/** Cards of the open dish not opened yet (and not dismissed): the quiet dot (UX §5.9). */
export const unseenStories = computed(() => (dishStories.value ?? []).filter((c) => !c.seen && !c.dismissed).length);

/** The names captions read from the open dish. */
export function storyNames(): StoryNames {
  const info = dishInfo.value;
  return {
    speciesIds: info?.speciesIds ?? [],
    speciesNames: info?.speciesNames ?? [],
    materials: info?.materials ?? [],
  };
}

/** The notice id of a card (a dismissed notice never returns; ids are per world, card and event). */
export function storyNoticeId(worldId: string, c: StoryCard): string {
  return `story:${worldId}:${c.id}:${storyEventTick(c)}`;
}

/** Ask the worker to mark a card of the open dish; the record updates and the dish autosaves. */
export async function markStory(id: string, mark: 'seen' | 'dismissed'): Promise<void> {
  const info = dishInfo.value;
  if (!info) return;
  try {
    const r = await getClient().storyMark(info.dishId, id, mark);
    if (dishInfo.value?.dishId !== info.dishId) return;
    notebook.value = r.record;
    if (r.refused) showToast(r.refused, 4000);
    else void autosave();
  } catch (e) {
    showToast((e as Error).message, 4000);
  }
}

/**
 * The dish the notice's Open left, and the speed it was running at (null: the Notebook was not opened
 * from a dish screen by a story notice, or that visit ended).
 */
export const storyReturn: { current: { readonly dishId: string; readonly speed: number } | null } = { current: null };

/** The recorded dish, if it is still the open one; the record is used once. */
function takeReturn(): { readonly dishId: string; readonly speed: number } | null {
  const from = storyReturn.current;
  storyReturn.current = null;
  return from && dishInfo.value?.dishId === from.dishId ? from : null;
}

/** Back on the dish screen after a story visit: run again at the recorded speed if it was running. */
function restoreSpeed(from: { readonly speed: number } | null): void {
  if (from && from.speed > 0) setSpeed(from.speed as Speed);
}

/**
 * The Notebook's Back during a story visit: to the dish the notice was opened from, at its prior speed
 * (true); otherwise false, and the caller keeps its own Back (Home).
 */
export function leaveNotebook(): boolean {
  const from = takeReturn();
  if (!from) return false;
  route.value = { name: 'dish' };
  restoreSpeed(from);
  return true;
}

/** Open a card in Notebook → Something happened (marks it seen); from the dish screen, remember its speed. */
export function openStory(id: string): void {
  const info = dishInfo.value;
  // Read before the route changes: leaving the dish screen pauses it (state.ts).
  storyReturn.current = info && route.value.name === 'dish' ? { dishId: info.dishId, speed: meta.value?.speed ?? 0 } : null;
  openStoryId.value = id;
  route.value = { name: 'notebook', tab: 'stories' };
  const c = dishStories.value?.find((x) => x.id === id);
  if (c && !c.seen) void markStory(id, 'seen');
}

/** Dismiss a card (it stays in the notebook, listed under Dismissed cards, and is removed first when full). */
export function dismissStory(id: string): void {
  if (openStoryId.value === id) openStoryId.value = null;
  void markStory(id, 'dismissed');
}

let latest: SnapshotMsg | null = null;

/** The birth ids a card names that may still be alive, most specific first. */
export function storyTargets(c: StoryCard): number[] {
  switch (c.template) {
    case 'firstSplit':
      return [c.summary.daughterA, c.summary.daughterB];
    case 'familyChanged':
      return [c.summary.rootBirthId];
    default:
      return [];
  }
}

/** The recorded place of a card, in dish cell coordinates (the centre of a cell). */
export function storyPlace(c: StoryCard): [number, number] {
  const cellXY = (cell: number): [number, number] => [(cell % 128) + 0.5, Math.floor(cell / 128) + 0.5];
  switch (c.template) {
    case 'firstSplit':
      return cellXY(c.summary.cell);
    case 'enzymeAtWork':
      return cellXY(c.summary.cell);
    case 'familyChanged':
      return c.summary.rootCell >= 0 ? cellXY(c.summary.rootCell) : [64, 64];
    case 'placeChanged':
      return [c.summary.x, c.summary.y];
  }
}

/** The entity id of the first surviving target in a snapshot (null: none alive). */
export function survivingEntity(s: SnapshotMsg | null, birthIds: readonly number[]): number | null {
  if (!s) return null;
  for (const b of birthIds) {
    for (let k = 0; k * ID_STRIDE < s.ids.length; k++) if (s.ids[k * ID_STRIDE] === b) return s.ids[k * ID_STRIDE + 1]!;
  }
  return null;
}

/**
 * Spotlight (SPEC §12.7 "focuses a location without moving organisms"): back to the dish (at the speed
 * it had before the notice's Open, during that visit; otherwise as it is); the camera goes to the
 * surviving target or the recorded place once the dish view is up.
 */
export function spotlightStory(c: StoryCard): void {
  openStoryId.value = null; // the Notebook tab opens on its list next time
  const from = takeReturn();
  route.value = { name: 'dish' };
  restoreSpeed(from);
  const entity = survivingEntity(latest, storyTargets(c));
  const place = storyPlace(c);
  let tries = 0;
  const go = () => {
    const r = getRenderer();
    if (!r) {
      if (++tries < 60) setTimeout(go, 50);
      return;
    }
    const p = (entity !== null ? r.positionOf(entity) : null) ?? place;
    r.zoomPreset('neighborhood', [p[0], p[1]]);
  };
  // After the dish screen has mounted and laid out its viewport.
  setTimeout(go, 50);
}

/** Card ids each world already had when this page first read its notebook: they never ask for a notice. */
const known = new Map<string, Set<string>>();
let wired = false;
let shown: string | null = null;

/** Start the notice wiring (once per page; Notebook.tsx calls it when its module loads). */
export function wireStories(): void {
  if (wired) return;
  wired = true;
  onDishSnapshot((s) => {
    latest = s;
  });
  // A story visit ends when the Notebook is left any way but Spotlight or leaveNotebook (both take the
  // record before routing): the dish stays paused, as leaving the dish screen always leaves it.
  effect(() => {
    if (route.value.name !== 'notebook') storyReturn.current = null;
  });
  effect(() => {
    const info = dishInfo.value;
    const nb = notebook.value;
    if (!info || !nb) {
      if (shown !== null) withdrawNotice(shown);
      shown = null;
      return;
    }
    const cards = nb.stories ?? [];
    let seenBefore = known.get(nb.worldId);
    if (!seenBefore) {
      // The first read of this dish's notebook in this page: what it already holds is not new.
      known.set(nb.worldId, new Set(cards.map((c) => storyNoticeId(nb.worldId, c))));
      seenBefore = known.get(nb.worldId)!;
    }
    let want: StoryCard | null = null;
    for (const c of cards) {
      const id = storyNoticeId(nb.worldId, c);
      if (seenBefore.has(id)) continue;
      if (!c.notified) continue;
      seenBefore.add(id);
      want = c;
    }
    // A shown notice whose card was opened, dismissed or undone goes (not a dismissal).
    if (shown !== null) {
      const still = cards.find((c) => storyNoticeId(nb.worldId, c) === shown);
      if (!still || still.seen || still.dismissed) {
        withdrawNotice(shown);
        shown = null;
      }
    }
    if (want) {
      const card = want;
      const id = storyNoticeId(nb.worldId, card);
      shown = id;
      requestNotice({
        kind: 'story',
        id,
        text: storyNoticeText(card),
        testId: 'story-notice',
        dismissLabel: STORY_TEXT.noticeDismiss,
        actions: [{ label: STORY_TEXT.open, testId: 'story-notice-open', run: () => openStory(card.id) }],
        onDismiss: () => {
          if (shown === id) shown = null;
        },
      });
    }
  });
}
