/**
 * P4.7 Try my dish in the UI (src/ui/tryDish.ts, src/ui/strings/tryDish.ts; SPEC §13.6; D09 lines 135-139):
 *
 * - the setup's defaults: Free observation and a 180 s turn (D09 line 135), no prediction;
 * - goal filtering by turn length: a goal whose duration exceeds the turn is not offered, and a chosen goal
 *   that no longer fits goes back to Free observation;
 * - the horizon card's texts from fixtures: "Free observation", each goal state from its record only,
 *   births and deaths, the dish time, and the missing-baseline line (the worker's own words);
 * - the state machine: Another turn on an unkept turn asks "Discard this turn?" and sends nothing; only
 *   Discard sends the next-turn request (discard: true); Cancel sends nothing; a kept turn asks the worker
 *   without discard and a worker 'unsaved' answer asks the question; a missing baseline disables Another turn.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoalRecord } from '../../src/persistence/notebookGoals';
import { TURN_HORIZON_DEFAULT_SECONDS, type TurnRecord } from '../../src/persistence/notebookTurns';
import type { TryAnswer } from '../../src/worker/client';
import type { DishInfo, SessionSummary, TryGoalOption } from '../../src/worker/protocol';
import { TRY_REFUSALS } from '../../src/worker/tryDish';
import { dishInfo } from '../../src/ui/state';

// state.ts is replaced by a small stand-in (the real one starts a Worker and audio), as tests/ui/favorites.test.ts does.
vi.mock('../../src/ui/state', async () => {
  const { signal } = await import('@preact/signals');
  const toast = signal<string | null>(null);
  const fail = () => {
    throw new Error('no client in this test');
  };
  return {
    dishInfo: signal<unknown>(null),
    sheet: signal<string>('none'),
    meta: signal<unknown>(null),
    route: signal<unknown>({ name: 'dish' }),
    toast,
    showToast: (text: string) => (toast.value = text),
    autosave: () => Promise.resolve(true),
    getClient: fail,
    enterStartedDish: fail,
    freshDishId: () => 'fresh',
    namedSlots: fail,
    replaceForTry: fail,
    saveToSlot: fail,
  };
});
import { anotherTurn, cancelDiscard, confirmDiscard, currentTurn, eventsOf, horizonCard, newSetup, offeredGoals, tryCard, withHorizon, type TryPort } from '../../src/ui/tryDish';
import { TRY_TEXT, turnGoalLine } from '../../src/ui/strings/tryDish';

const GOALS: TryGoalOption[] = [
  { id: 'KEEP_SPRINTERS_GOING', title: 'Keep Sprinters going', summary: 'Keep…', completedText: '', endedText: null, durationSeconds: 180 },
  { id: 'SEE_SPRINTER_SPLIT', title: 'See a Sprinter split', summary: 'Watch…', completedText: '', endedText: null, durationSeconds: null },
  { id: 'WATCH_STARCH_BECOME_FOOD', title: 'Watch starch become food', summary: 'Watch…', completedText: '', endedText: null, durationSeconds: null },
];

const TURN: TurnRecord = {
  tryId: 'try-1',
  baseline: { shelfId: 'shelf-baseline-00000001-ab12', checksum: `sha256:${'a'.repeat(64)}`, worldId: 'w', tick: 50, name: 'Little Living Garden' },
  turn: 1,
  turnWorldId: 'w+t1',
  startTick: 50,
  horizonTicks: 600,
  objectiveId: null,
  prediction: '',
  state: 'atHorizon',
  kept: null,
};

const goal = (patch: Partial<GoalRecord>): GoalRecord => ({
  id: 'goal-1',
  objectiveId: 'SEE_SPRINTER_SPLIT',
  title: 'See a Sprinter split',
  predicate: { type: 'observeEvent', params: { event: 'birth', species: 'B01' } },
  state: 'completed',
  startTick: 50,
  endTick: 380,
  progress: { startTick: 50, holdSinceTick: null, state: 'completed' },
  shown: false,
  ...patch,
});

class FakePort implements TryPort {
  calls: { dishId: string; newDishId: string; discard: boolean }[] = [];
  entered: string[] = [];
  answer: TryAnswer = { ok: true, info: { dishId: 't2' } as DishInfo, turn: { ...TURN, turn: 2, state: 'running' }, kept: null };
  next(dishId: string, newDishId: string, discard: boolean): Promise<TryAnswer> {
    this.calls.push({ dishId, newDishId, discard });
    return Promise.resolve(this.answer);
  }
  finish(): Promise<TurnRecord | null> {
    return Promise.resolve(null);
  }
  summary(): Promise<SessionSummary> {
    return Promise.resolve({ births: [3, 1], deaths: [0, 2], branches: [], fromTick: 50, toTick: 650, compacted: false });
  }
  freeSlot(): Promise<string | null> {
    return Promise.resolve('slot1');
  }
  save(): Promise<boolean> {
    return Promise.resolve(true);
  }
  enter(info: DishInfo): void {
    this.entered.push(info.dishId);
  }
  newDishId(): string {
    return `n${this.calls.length + 1}`;
  }
  autosaves = 0;
  autosave(): Promise<boolean> {
    this.autosaves++;
    return Promise.resolve(true);
  }
}

describe('Try my dish setup', () => {
  it('defaults: Free observation and 180 s, no prediction', () => {
    const s = newSetup('d1', 4);
    expect(TURN_HORIZON_DEFAULT_SECONDS).toBe(180);
    expect(s).toMatchObject({ dishId: 'd1', horizonSeconds: 180, objectiveId: null, prediction: '', goals: null, refusal: null, busy: false, resumeSpeed: 4 });
    expect(TRY_TEXT.freeObservation).toBe('Free observation');
    expect(TRY_TEXT.predictionLabel).toBe('What do you think will happen? (optional)');
  });

  it('goal filtering by turn length; a chosen goal that no longer fits goes back to Free observation', () => {
    expect(offeredGoals(GOALS, 60).map((g) => g.id)).toEqual(['SEE_SPRINTER_SPLIT', 'WATCH_STARCH_BECOME_FOOD']);
    expect(offeredGoals(GOALS, 180).map((g) => g.id)).toEqual(GOALS.map((g) => g.id));
    expect(offeredGoals(GOALS, 600).map((g) => g.id)).toEqual(GOALS.map((g) => g.id));
    expect(offeredGoals(null, 180)).toEqual([]);
    const s = { ...newSetup('d1', 0), goals: GOALS, objectiveId: 'KEEP_SPRINTERS_GOING' };
    expect(withHorizon(s, 600).objectiveId).toBe('KEEP_SPRINTERS_GOING');
    expect(withHorizon(s, 60)).toMatchObject({ horizonSeconds: 60, objectiveId: null });
    const split = { ...s, objectiveId: 'SEE_SPRINTER_SPLIT' };
    expect(withHorizon(split, 60).objectiveId).toBe('SEE_SPRINTER_SPLIT');
    expect(TRY_TEXT.lengthOption(60)).toBe('1:00 of dish time');
    expect(TRY_TEXT.lengthOption(600)).toBe('10:00 of dish time');
  });
});

describe('the horizon card texts (recorded facts only)', () => {
  it('the goal line from the record, "Free observation" when none', () => {
    expect(turnGoalLine(null)).toBe('Free observation');
    expect(turnGoalLine(goal({}))).toBe('Goal: See a Sprinter split — completed at 0:38.');
    expect(turnGoalLine(goal({ state: 'running', endTick: null, progress: { startTick: 50, holdSinceTick: null, state: 'running' } }))).toBe('Goal: See a Sprinter split — not reached in this turn.');
    expect(turnGoalLine(goal({ state: 'ended', endReason: 'zero', endTick: 400 }))).toBe('Goal: See a Sprinter split — ended at 0:40.');
    expect(turnGoalLine(goal({ state: 'ended', endReason: 'undone', endTick: 100 }))).toBe('Goal: See a Sprinter split — ended when Undo rewound the dish.');
    expect(turnGoalLine(goal({ state: 'continuedFreely', endReason: 'left', endTick: 200 }))).toBe('Goal: See a Sprinter split — left at 0:20.');
  });

  it('time, births and deaths, the prediction label and the missing-baseline line', () => {
    expect(TRY_TEXT.reached(1, 650)).toBe('Turn 1 reached 1:05 of dish time.');
    expect(TRY_TEXT.ran(600, 50)).toBe('It ran for 1:00 from the starting point at 0:05.');
    expect(eventsOf({ births: [3, 1], deaths: [0, 2], branches: [], fromTick: 50, toTick: 650, compacted: false })).toEqual({ births: 4, deaths: 2, atLeast: false });
    expect(TRY_TEXT.births(4, 2, false)).toBe('4 births and 2 deaths were recorded in this turn.');
    expect(TRY_TEXT.births(1, 1, true)).toBe('At least 1 birth and 1 death were recorded in this turn.');
    expect(TRY_TEXT.predictionHeading).toBe('Your prediction');
    expect(TRY_TEXT.baselineMissing).toBe("The saved starting point for these turns is gone, so another turn can't start. This turn is unchanged.");
    expect(TRY_REFUSALS.baselineMissing).toBe(TRY_TEXT.baselineMissing);
    expect(TRY_TEXT.badgeRunning(2, 455)).toBe('Turn 2 · 0:45 left');
    expect(TRY_TEXT.badgeDone(2)).toBe('Turn 2 finished');
    // Never a score.
    for (const t of [TRY_TEXT.reached(1, 650), TRY_TEXT.births(4, 2, false), turnGoalLine(goal({}))]) expect(t).not.toMatch(/score|points|win|lose|best|rank/i);
  });
});

describe('Another turn needs Discard (the UI state machine)', () => {
  beforeEach(() => {
    dishInfo.value = { dishId: 't1' } as DishInfo;
    tryCard.value = null;
    currentTurn.value = TURN;
  });

  it('an unkept turn asks first and sends nothing; Cancel sends nothing; Discard sends discard: true', async () => {
    const port = new FakePort();
    tryCard.value = horizonCard('t1', TURN, 600, null);
    await anotherTurn(port);
    expect(port.calls).toEqual([]);
    expect(tryCard.value?.step).toBe('confirmDiscard');
    cancelDiscard();
    expect(tryCard.value?.step).toBe('card');
    expect(port.calls).toEqual([]);
    // Confirm without the question first does nothing.
    await confirmDiscard(port);
    expect(port.calls).toEqual([]);
    await anotherTurn(port);
    await confirmDiscard(port);
    expect(port.calls).toEqual([{ dishId: 't1', newDishId: 'n1', discard: true }]);
    expect(port.entered).toEqual(['t2']);
    // Fix round 1: Continue is written for the new turn at once (never left holding the discarded one).
    expect(port.autosaves).toBe(1);
    expect(tryCard.value).toBeNull();
    expect(currentTurn.value).toMatchObject({ turn: 2, state: 'running' });
  });

  it('a kept turn asks the worker without discard; an "unsaved" answer asks the question instead', async () => {
    const port = new FakePort();
    const kept = { ...TURN, kept: { slotId: 'slot1' } };
    tryCard.value = horizonCard('t1', kept, 600, null);
    port.answer = { ok: false, code: 'unsaved', message: TRY_REFUSALS.unsaved };
    await anotherTurn(port);
    expect(port.calls).toEqual([{ dishId: 't1', newDishId: 'n1', discard: false }]);
    expect(tryCard.value?.step).toBe('confirmDiscard');
    expect(port.entered).toEqual([]);
    // Wave 6a integration (safety net): the slot no longer holds the turn, so the card drops "Kept in
    // Slot 1." (never beside "Discard this turn?") and Cancel offers Keep this result again.
    expect(tryCard.value?.turn.kept).toBeNull();
    cancelDiscard();
    expect(tryCard.value).toMatchObject({ step: 'card', turn: { kept: null } });
  });

  it('a missing baseline disables Another turn with its line; the current turn stays', async () => {
    const port = new FakePort();
    tryCard.value = horizonCard('t1', TURN, 600, null);
    port.answer = { ok: false, code: 'baseline-missing', message: TRY_REFUSALS.baselineMissing };
    await anotherTurn(port);
    await confirmDiscard(port);
    expect(tryCard.value).toMatchObject({ step: 'card', baselineMissing: true, message: TRY_TEXT.baselineMissing });
    expect(port.entered).toEqual([]);
    expect(port.autosaves).toBe(0);
    await anotherTurn(port);
    expect(port.calls).toHaveLength(1); // disabled: nothing more is sent
    expect(tryCard.value?.step).toBe('card');
  });
});
