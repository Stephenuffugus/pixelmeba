/**
 * Try my dish on the main thread (P4.7; SPEC §13.6; D09 lines 135-139; D-0081; UX §2 "Blocking panels …
 * pause and restore the prior run state on close"). UI state only; the turn record and the baseline are
 * the worker's (src/worker/tryDish.ts, src/persistence/{notebookTurns,shelf}.ts):
 *
 * - `trySetup`: the setup sheet (More → Try my dish…). Opening it pauses the dish; Cancel restores its run
 *   state. Choices: a goal ("Free observation" by default, then each goal the dish offers that fits the turn
 *   length), the turn length (60 / 180 / 600 s, 180 by default) and an optional prediction note. Start
 *   keeps the open dish first (D-0033, the shared keep flow) and opens turn 1, paused;
 * - `currentTurn`: the open dish's turn record (the top strip's badge);
 * - `tryCard`: the horizon card. Its texts are the recorded facts only. Keep this result saves the turn to
 *   the first free named slot (all ten used: the Save sheet, to choose one to replace). Another turn asks
 *   "Discard this turn?" first unless the turn is kept, and the worker refuses an unconfirmed discard of a
 *   changed turn ('unsaved'), which asks again; a missing baseline disables Another turn with its line.
 *   Finish leaves the turn open as an ordinary paused dish.
 *
 * The functions that talk to the worker take a `TryPort` (tests pass a fake one).
 */
import { batch, effect, signal } from '@preact/signals';
import type { KeepRefused, SimClient, TryAnswer, TryNotice } from '@worker/client';
import type { DishInfo, SessionSummary, Speed, TryGoalOption } from '@worker/protocol';
import type { GoalRecord } from '@persist/notebookGoals';
import { TURN_HORIZON_DEFAULT_SECONDS, turnGoal, type TURN_HORIZON_SECONDS, type TurnRecord } from '@persist/notebookTurns';
import { autosave, dishInfo, enterStartedDish, freshDishId, getClient, meta, namedSlots, replaceForTry, route, saveToSlot, sheet, showToast } from './state';
import { keptLine } from './strings/keep';
import { TRY_TEXT } from './strings/tryDish';

export type TurnSeconds = (typeof TURN_HORIZON_SECONDS)[number];

export interface TrySetupState {
  readonly dishId: string;
  /** The goals the dish offers (null while loading). */
  readonly goals: readonly TryGoalOption[] | null;
  /** Why Try my dish cannot start here (null: it can). */
  readonly refusal: string | null;
  readonly horizonSeconds: TurnSeconds;
  /** null: Free observation. */
  readonly objectiveId: string | null;
  readonly prediction: string;
  readonly busy: boolean;
  /** A refusal of the last Start (nothing changed). */
  readonly message: string | null;
  /** The dish's run state when the panel opened (restored on Cancel). */
  readonly resumeSpeed: Speed;
}

export interface TryHorizonCard {
  readonly dishId: string;
  readonly turn: TurnRecord;
  readonly elapsedTicks: number;
  readonly goal: GoalRecord | null;
  /** Births and deaths since the turn started (null while being read). */
  readonly events: { readonly births: number; readonly deaths: number; readonly atLeast: boolean } | null;
  readonly step: 'card' | 'confirmDiscard' | 'working';
  readonly baselineMissing: boolean;
  readonly message: string | null;
}

export const trySetup = signal<TrySetupState | null>(null);
export const tryCard = signal<TryHorizonCard | null>(null);
export const currentTurn = signal<TurnRecord | null>(null);

/** What the Try my dish flow needs from the worker and the save flow. */
export interface TryPort {
  next(dishId: string, newDishId: string, discard: boolean): Promise<TryAnswer>;
  finish(dishId: string): Promise<TurnRecord | null>;
  summary(dishId: string, sinceTick: number): Promise<SessionSummary>;
  /** The first free named slot (null: all ten used). */
  freeSlot(): Promise<string | null>;
  save(slotId: string, name: string): Promise<boolean>;
  /** Open a started turn in place of `previousDishId`. */
  enter(info: DishInfo, previousDishId: string): void;
  newDishId(): string;
  /** Write Continue for the open dish (fix round 1: right after a new turn replaced a discarded one). */
  autosave(): Promise<unknown>;
}

export function defaultTryPort(): TryPort {
  return {
    next: (dishId, newDishId, discard) => getClient().tryNext(dishId, newDishId, discard),
    finish: (dishId) => getClient().tryFinish(dishId),
    summary: (dishId, sinceTick) => getClient().sessionSummary(dishId, sinceTick),
    freeSlot: async () => {
      const used = new Set((await namedSlots()).map((s) => s.slotId));
      return Array.from({ length: 10 }, (_, i) => `slot${i + 1}`).find((id) => !used.has(id)) ?? null;
    },
    save: (slotId, name) => saveToSlot(slotId, name),
    enter: (info, previousDishId) => enterStartedDish(info, previousDishId),
    newDishId: () => freshDishId(),
    autosave: () => autosave(),
  };
}

// ------------------------------------------------------------------------------------------------
// The setup (pure parts first: tested in node).

/** The setup's defaults (D09 line 135: 180 seconds and free observation). */
export function newSetup(dishId: string, resumeSpeed: Speed): TrySetupState {
  return { dishId, goals: null, refusal: null, horizonSeconds: TURN_HORIZON_DEFAULT_SECONDS, objectiveId: null, prediction: '', busy: false, message: null, resumeSpeed };
}

/** The goals offered for a turn of `seconds`: a goal that needs longer than the turn is not offered. */
export function offeredGoals(goals: readonly TryGoalOption[] | null, seconds: number): TryGoalOption[] {
  return (goals ?? []).filter((g) => g.durationSeconds === null || g.durationSeconds <= seconds);
}

/** A new turn length; a chosen goal that no longer fits goes back to Free observation. */
export function withHorizon(s: TrySetupState, seconds: TurnSeconds): TrySetupState {
  const fits = s.objectiveId === null || offeredGoals(s.goals, seconds).some((g) => g.id === s.objectiveId);
  return { ...s, horizonSeconds: seconds, objectiveId: fits ? s.objectiveId : null };
}

/** More → Try my dish…: a blocking panel (the dish pauses; Cancel restores its run state). */
export function openTrySetup(): void {
  const info = dishInfo.value;
  if (!info) return;
  const speed = meta.value?.speed ?? 0;
  if (speed > 0) getClient().setSpeed(info.dishId, 0);
  trySetup.value = newSetup(info.dishId, speed);
  sheet.value = 'trySetup';
  void getClient()
    .trySetup(info.dishId)
    .then((r) => {
      const s = trySetup.peek();
      if (s && s.dishId === info.dishId) trySetup.value = { ...s, goals: r.goals, refusal: r.refusal };
    })
    .catch((e: unknown) => {
      const s = trySetup.peek();
      if (s && s.dishId === info.dishId) trySetup.value = { ...s, goals: [], refusal: e instanceof Error ? e.message : String(e) };
    });
}

export function updateSetup(patch: Partial<Pick<TrySetupState, 'objectiveId' | 'prediction'>>): void {
  const s = trySetup.value;
  if (s) trySetup.value = { ...s, ...patch, message: null };
}

export function chooseTurnLength(seconds: TurnSeconds): void {
  const s = trySetup.value;
  if (s) trySetup.value = { ...withHorizon(s, seconds), message: null };
}

/** Cancel: nothing changes, and the dish carries on as it was running. */
export function closeTrySetup(): void {
  const s = trySetup.value;
  trySetup.value = null;
  if (sheet.value === 'trySetup') sheet.value = 'none';
  if (s && s.resumeSpeed > 0 && dishInfo.value?.dishId === s.dishId && route.value.name === 'dish') getClient().setSpeed(s.dishId, s.resumeSpeed);
}

class TryStartRefusal extends Error {}

/** Start: the open dish is kept first (D-0033), then turn 1 opens paused in its place. */
export async function startTry(): Promise<void> {
  const s = trySetup.value;
  const info = dishInfo.value;
  if (!s || !info || s.busy || s.refusal !== null || info.dishId !== s.dishId) return;
  trySetup.value = { ...s, busy: true, message: null };
  const c = getClient();
  try {
    const outcome = await replaceForTry(`${TRY_TEXT.horizonTitle(1)} of “${info.name}”`, async (keepFrom): Promise<{ readonly ok: true } | KeepRefused> => {
      const r = await c.tryStartKeeping({ dishId: s.dishId, newDishId: freshDishId(), objectiveId: s.objectiveId, horizonSeconds: s.horizonSeconds, prediction: s.prediction }, keepFrom);
      if ('exclude' in r) return r; // the open dish could not be kept (the Keep sheet asks)
      if (!r.ok) throw new TryStartRefusal(r.message);
      batch(() => {
        trySetup.value = null;
        tryCard.value = null;
      });
      enterStartedDish(r.info, s.dishId);
      currentTurn.value = r.turn;
      const line = keptLine(r.kept);
      showToast(`${line ? `${line} ` : ''}${TRY_TEXT.started(r.turn.turn, r.turn.startTick)}`, 5000);
      return { ok: true };
    });
    if (outcome.kind === 'refused') {
      const now = trySetup.peek();
      if (now) trySetup.value = { ...now, busy: false, message: outcome.message };
    } else if (outcome.kind === 'choosing') {
      // The Keep sheet asks how to keep the open dish; its Continue runs the same start.
      const now = trySetup.peek();
      if (now) trySetup.value = { ...now, busy: false };
      if (sheet.value === 'trySetup') sheet.value = 'none';
    }
  } catch (e) {
    const now = trySetup.peek();
    if (now) trySetup.value = { ...now, busy: false, message: TRY_TEXT.failed(e instanceof Error ? e.message : String(e)) };
  }
}

// ------------------------------------------------------------------------------------------------
// The horizon card.

/** The card for a turn at its horizon (its births and deaths are read next). */
export function horizonCard(dishId: string, turn: TurnRecord, elapsedTicks: number, goal: GoalRecord | null): TryHorizonCard {
  return { dishId, turn, elapsedTicks, goal, events: null, step: 'card', baselineMissing: false, message: null };
}

/** Births and deaths in a session summary (the read-only 'sessionSummary' query; never 'history'). */
export function eventsOf(s: SessionSummary): { births: number; deaths: number; atLeast: boolean } {
  return { births: s.births.reduce((a, b) => a + b, 0), deaths: s.deaths.reduce((a, b) => a + b, 0), atLeast: s.compacted };
}

/** Show the horizon card and read its counts. */
export async function showHorizon(card: TryHorizonCard, port: TryPort = defaultTryPort()): Promise<void> {
  tryCard.value = card;
  sheet.value = 'tryHorizon';
  try {
    const s = await port.summary(card.dishId, card.turn.startTick);
    const now = tryCard.peek();
    if (now && now.dishId === card.dishId && now.turn.turn === card.turn.turn) tryCard.value = { ...now, events: eventsOf(s) };
  } catch {
    // The dish is gone already.
  }
}

/** The badge at the horizon reopens the card (after a reload, or once it was closed). */
export async function reopenHorizon(): Promise<void> {
  const info = dishInfo.value;
  const t = currentTurn.value;
  if (!info || !t) return;
  try {
    const r = await getClient().notebookGet(info.dishId);
    await showHorizon(horizonCard(info.dishId, t, t.horizonTicks, turnGoal(r.record)));
  } catch {
    // The dish is gone already.
  }
}

function closeCard(): void {
  tryCard.value = null;
  if (sheet.value === 'tryHorizon') sheet.value = 'none';
}

/** Keep this result: the first free named slot, else the Save sheet to choose one to replace. */
export async function keepTurn(port: TryPort = defaultTryPort()): Promise<void> {
  const card = tryCard.value;
  const info = dishInfo.value;
  if (!card || !info || card.step !== 'card' || info.dishId !== card.dishId) return;
  tryCard.value = { ...card, step: 'working', message: null };
  const slot = await port.freeSlot().catch(() => null);
  if (slot === null) {
    tryCard.value = { ...card, message: TRY_TEXT.slotsFull };
    sheet.value = 'save';
    return;
  }
  const ok = await port.save(slot, info.name);
  const now = tryCard.peek();
  if (now && now.dishId === card.dishId) tryCard.value = { ...now, step: 'card', turn: ok ? { ...now.turn, kept: { slotId: slot } } : now.turn };
}

/** Another turn: an unkept turn asks "Discard this turn?" first; nothing is sent until Discard. */
export async function anotherTurn(port: TryPort = defaultTryPort()): Promise<void> {
  const card = tryCard.value;
  if (!card || card.step !== 'card' || card.baselineMissing) return;
  if (card.turn.kept === null) {
    tryCard.value = { ...card, step: 'confirmDiscard', message: null };
    return;
  }
  await nextTurn(card, false, port);
}

/** "Discard turn": the player's explicit choice; the next turn replaces this one. */
export async function confirmDiscard(port: TryPort = defaultTryPort()): Promise<void> {
  const card = tryCard.value;
  if (!card || card.step !== 'confirmDiscard') return;
  await nextTurn(card, true, port);
}

export function cancelDiscard(): void {
  const card = tryCard.value;
  if (card && card.step === 'confirmDiscard') tryCard.value = { ...card, step: 'card' };
}

async function nextTurn(card: TryHorizonCard, discard: boolean, port: TryPort): Promise<void> {
  tryCard.value = { ...card, step: 'working', message: null };
  let r: TryAnswer;
  try {
    r = await port.next(card.dishId, port.newDishId(), discard);
  } catch (e) {
    tryCard.value = { ...card, step: 'card', message: e instanceof Error ? e.message : String(e) };
    return;
  }
  if (!r.ok) {
    // 'unsaved': the slot no longer holds this turn exactly, so the card stops saying "Kept in Slot n."
    // (Keep this result is offered again) while it asks "Discard this turn?" (safety net; the worker's
    // record forgets the slot too).
    if (r.code === 'unsaved') tryCard.value = { ...card, step: 'confirmDiscard', turn: { ...card.turn, kept: null } };
    else tryCard.value = { ...card, step: 'card', baselineMissing: r.code === 'baseline-missing', message: r.message };
    return;
  }
  batch(() => {
    tryCard.value = null;
    if (sheet.value === 'tryHorizon') sheet.value = 'none';
  });
  port.enter(r.info, card.dishId);
  currentTurn.value = r.turn;
  showToast(TRY_TEXT.started(r.turn.turn, r.turn.startTick), 5000);
  // Fix round 1: Continue may still hold the turn just discarded (the horizon notice autosaved it); write
  // the new turn there at once, so a closed app never reopens the discarded turn.
  void port.autosave();
}

/** Finish: the turn stays open as an ordinary paused dish; nothing is deleted. */
export async function finishTurn(port: TryPort = defaultTryPort()): Promise<void> {
  const card = tryCard.value;
  if (!card || card.step === 'working') return;
  tryCard.value = { ...card, step: 'working' };
  try {
    const t = await port.finish(card.dishId);
    if (dishInfo.peek()?.dishId === card.dishId) currentTurn.value = t;
    closeCard();
    showToast(TRY_TEXT.finished(card.turn.turn), 5000);
    void autosave();
  } catch (e) {
    tryCard.value = { ...card, step: 'card', message: e instanceof Error ? e.message : String(e) };
  }
}

// ------------------------------------------------------------------------------------------------
// Worker notices.

let wiredTo: SimClient | null = null;
let turnFor: string | null = null;

/** Subscribe once per client (state.ts getClient). */
export function wireTry(client: SimClient): void {
  if (wiredTo === client) return;
  wiredTo = client;
  client.onTry(onTryNotice);
  // The open dish's turn follows the dish (a started turn, a loaded or imported turn dish).
  effect(() => {
    const info = dishInfo.value;
    const id = info?.dishId ?? null;
    if (id === turnFor) return;
    turnFor = id;
    batch(() => {
      currentTurn.value = info?.turn ?? null;
      if (tryCard.peek()?.dishId !== id) tryCard.value = null;
      const s = trySetup.peek();
      if (s && s.dishId !== id) trySetup.value = null;
    });
  });
}

function onTryNotice(n: TryNotice): void {
  if (n.dishId !== dishInfo.peek()?.dishId) return;
  if (n.type === 'tryHorizon') {
    currentTurn.value = n.turn;
    void autosave(); // the turn's state is kept with the dish at once
    const card = tryCard.peek();
    if (card && card.dishId === n.dishId && card.turn.turn === n.turn.turn) {
      // Already showing: bring it back to the front.
      sheet.value = 'tryHorizon';
      return;
    }
    if (sheet.peek() === 'trySetup') return;
    void showHorizon(horizonCard(n.dishId, n.turn, n.elapsedTicks, n.goal));
    return;
  }
  currentTurn.value = n.turn;
  if (n.turn && n.turn.state === 'running' && tryCard.peek()?.dishId === n.dishId) closeCard(); // Undo took it below its horizon
  const card = tryCard.peek();
  if (n.turn && card && card.dishId === n.dishId && card.step !== 'working') tryCard.value = { ...card, turn: n.turn };
  if (n.requestId === undefined) void autosave();
}
