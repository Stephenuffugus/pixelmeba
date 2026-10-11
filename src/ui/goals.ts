/**
 * Goals on the main thread (P4.4; SPEC §13.5; D09 §6; D-0070, D-0071). UI state only:
 *
 * - `goalOffers`: the goals the open dish offers (the worker's 'goalCatalog': content texts, compatible
 *   with the dish's recorded manifest); `playGoalOffers` / `playGoalChoice`: the Play card's choice before
 *   its dish exists ("No goal" = null, the default);
 * - the goal records themselves are the open dish's notebook record (favorites.ts `notebook`), kept by the
 *   worker; every change goes through 'goalStart' / 'goalLeave' / 'goalShown' (never a command);
 * - the one dismissible sentence: when the latest record completed or ended and was not shown, a notice
 *   of kind 'goal' is requested through notices.ts (one visible notice, never layered over a card). Its
 *   buttons never call setSpeed: the dish keeps its pause/run state (SPEC §13.5).
 */
import { effect, signal } from '@preact/signals';
import type { NotebookNotice, SimClient } from '@worker/client';
import type { GoalOffer } from '@worker/protocol';
import { goalsOf, type GoalRecord } from '@persist/notebookGoals';
import type { NotebookRecord } from '@persist/notebook';
import { autosave, dishClock, dishInfo, getClient, showToast } from './state';
import { notebook } from './favorites';
import { dismissNotice, requestNotice, withdrawKind } from './notices';
import { fillTime, GOAL_TEXT } from './strings/goals';

/** The goals the open dish offers (catalog order; [] while unknown or when it offers none). */
export const goalOffers = signal<readonly GoalOffer[]>([]);
/** The Play card's offers for the Garden (before a dish exists). */
export const playGoalOffers = signal<readonly GoalOffer[]>([]);
/** The Play card's choice: an objective id, or null for "No goal" (the default). */
export const playGoalChoice = signal<string | null>(null);

/** Every offer seen, by objective id: the sentences' texts (content; a record keeps its own title). */
const textsById: Record<string, GoalOffer> = {};
const textsVersion = signal(0);

function remember(offers: readonly GoalOffer[]): void {
  let added = false;
  for (const o of offers) {
    if (textsById[o.id] !== o) {
      textsById[o.id] = o;
      added = true;
    }
  }
  if (added) textsVersion.value = textsVersion.peek() + 1;
}

let wiredTo: SimClient | null = null;

/** Subscribe once per client (state.ts getClient): goal changes autosave; the open dish's offers and its sentence follow the notebook. */
export function wireGoals(client: SimClient): void {
  if (wiredTo === client) return;
  wiredTo = client;
  client.onNotebook(onGoalNotice);
  // Started here, not at module load (state.ts imports this module: no top-level reads of its signals).
  effect(() => void loadOffersFor(dishInfo.value?.dishId ?? null));
  effect(goalNoticeEffect);
}

function onGoalNotice(n: NotebookNotice): void {
  if (n.type !== 'notebookChanged' || n.change.kind !== 'goal') return;
  if (n.dishId !== dishInfo.peek()?.dishId) return;
  // favorites.ts already took the record into `notebook`; a settled goal is kept with the dish at once.
  void autosave();
}

let offersFor: string | null = null;
async function loadOffersFor(dishId: string | null): Promise<void> {
  if (dishId === offersFor) return;
  offersFor = dishId;
  goalOffers.value = [];
  if (dishId === null) return;
  try {
    const offers = await getClient().goalCatalog(dishId, null);
    remember(offers);
    if (offersFor === dishId) goalOffers.value = offers;
  } catch {
    // The dish is gone already.
  }
}

/** The Play card's offers for `recipeId` (the worker checks them against this build's manifest). */
export async function loadPlayOffers(recipeId: string): Promise<void> {
  try {
    const offers = await getClient().goalCatalog(null, recipeId);
    remember(offers);
    playGoalOffers.value = offers;
  } catch {
    playGoalOffers.value = [];
  }
}

function takeRecord(dishId: string, record: NotebookRecord): void {
  if (dishInfo.peek()?.dishId === dishId) notebook.value = record;
}

/** Start goal `objectiveId` on dish `dishId` at its current tick (never a command; the speed is untouched). */
export async function startGoal(dishId: string, objectiveId: string): Promise<boolean> {
  try {
    const r = await getClient().goalStart(dishId, objectiveId);
    takeRecord(dishId, r.record);
    if (r.refused) {
      showToast(GOAL_TEXT.startRefused(r.refused), 6000);
      return false;
    }
    void autosave();
    return true;
  } catch {
    return false;
  }
}

/** Leave goal: the running goal (or the latest ended one) continues freely. */
export async function leaveGoal(dishId: string): Promise<void> {
  try {
    const r = await getClient().goalLeave(dishId);
    takeRecord(dishId, r.record);
    if (!r.refused) void autosave();
  } catch {
    // The dish is gone already.
  }
}

/** The player dismissed goal `id`'s sentence: it is not offered again (also after a reload). */
function markShown(dishId: string, id: string): void {
  getClient().goalShown(dishId, id);
  const nb = notebook.peek();
  if (nb && dishInfo.peek()?.dishId === dishId) notebook.value = { ...nb, goals: goalsOf(nb).map((g) => (g.id === id ? { ...g, shown: true } : g)) };
}

/** The sentence for a settled record (content text with its dish time; a fallback when this build lacks the goal). */
export function goalSentence(g: GoalRecord): string | null {
  const time = dishClock(g.endTick ?? g.startTick);
  const texts = textsById[g.objectiveId];
  if (g.state === 'completed') return fillTime(texts?.completedText ?? GOAL_TEXT.completedFallback(g.title, '{time}'), time);
  if (g.state === 'ended') {
    if (g.endReason === 'undone') return GOAL_TEXT.undone(g.title);
    if (g.endReason === 'failed') return GOAL_TEXT.failed(g.title);
    if (g.endReason === 'cannotResume') return GOAL_TEXT.cannotResume(g.title);
    return fillTime(texts?.endedText ?? GOAL_TEXT.endedFallback(g.title, '{time}'), time);
  }
  return null;
}

/** The latest record waiting for its sentence (completed or ended, not yet shown), or null. */
export function pendingSentence(goals: readonly GoalRecord[]): GoalRecord | null {
  const last = goals.at(-1);
  return last && !last.shown && (last.state === 'completed' || last.state === 'ended') ? last : null;
}

function goalNoticeEffect(): void {
  void textsVersion.value;
  const info = dishInfo.value;
  const nb = notebook.value;
  const g = info && nb && nb.worldId !== '' ? pendingSentence(goalsOf(nb)) : null;
  const text = g ? goalSentence(g) : null;
  if (!info || !g || text === null) {
    withdrawKind('goal');
    return;
  }
  const dishId = info.dishId;
  const id = `goal:${dishId}:${g.id}:${g.state}`;
  const actions =
    g.state === 'completed'
      ? [{ label: GOAL_TEXT.continue, testId: 'goal-continue', run: () => dismissNotice(id) }]
      : [
          {
            label: GOAL_TEXT.tryAgain,
            testId: 'goal-try-again',
            run: () => {
              dismissNotice(id);
              void startGoal(dishId, g.objectiveId);
            },
          },
          {
            label: GOAL_TEXT.continueFreely,
            testId: 'goal-continue-freely',
            run: () => {
              dismissNotice(id);
              void leaveGoal(dishId);
            },
          },
        ];
  requestNotice({ kind: 'goal', id, text, testId: 'goal-sentence', dismissLabel: GOAL_TEXT.dismiss, actions, onDismiss: () => markShown(dishId, g.id) });
}
