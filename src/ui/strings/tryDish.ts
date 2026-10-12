/**
 * Try my dish texts (P4.7; SPEC §13.6; D09 lines 135-139; UX §2 "Blocking panels … pause"). Every number
 * is dish time (m:ss from ticks). Results are recorded facts only — the turn's time, the goal's recorded
 * state, births and deaths from the dish's history, and the player's own prediction (never graded). No
 * score, no "win", no ranking (D09 "never an invented universal score").
 */
import type { GoalRecord } from '@persist/notebookGoals';

/** Dish time m:ss (h:mm:ss past an hour) from ticks. */
export function turnClock(tick: number): string {
  const s = Math.max(0, Math.floor(tick / 10));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const TRY_TEXT = {
  moreItem: 'Try my dish…',
  moreResult: (turn: number) => `Turn ${turn} result…`,
  setupTitle: 'Try my dish',
  setupIntro:
    'This moment is kept as a starting point. Each turn starts from it, paused, and runs for the time you choose. You can keep a result, try again from the same start, or finish.',
  goalLegend: 'Goal',
  freeObservation: 'Free observation',
  freeObservationHint: 'Watch what happens. No goal.',
  longerGoals: 'Some goals need a longer turn.',
  lengthLegend: 'Turn length',
  lengthOption: (seconds: number) => `${turnClock(seconds * 10)} of dish time`,
  predictionLabel: 'What do you think will happen? (optional)',
  start: 'Start turn 1',
  starting: 'Starting…',
  cancel: 'Cancel',
  loading: 'Checking this dish…',
  started: (turn: number, tick: number) => `Turn ${turn} is ready, paused at ${turnClock(tick)}. Press Run to play it.`,
  failed: (why: string) => `Try my dish did not start: ${why}`,

  horizonTitle: (turn: number) => `Turn ${turn}`,
  reached: (turn: number, tick: number) => `Turn ${turn} reached ${turnClock(tick)} of dish time.`,
  ran: (elapsedTicks: number, startTick: number) => `It ran for ${turnClock(elapsedTicks)} from the starting point at ${turnClock(startTick)}.`,
  births: (births: number, deaths: number, atLeast: boolean) =>
    `${atLeast ? 'At least ' : ''}${count(births, 'birth', 'births')} and ${count(deaths, 'death', 'deaths')} were recorded in this turn.`,
  eventsLoading: 'Reading what this turn recorded…',
  predictionHeading: 'Your prediction',
  keep: 'Keep this result',
  keeping: 'Keeping…',
  kept: (slotNumber: number) => `Kept in Slot ${slotNumber}.`,
  slotsFull: 'All ten save slots are used: choose one to replace.',
  another: 'Another turn',
  finish: 'Finish',
  discardQuestion: 'Discard this turn? It has not been saved.',
  discard: 'Discard turn',
  baselineMissing: "The saved starting point for these turns is gone, so another turn can't start. This turn is unchanged.",
  finished: (turn: number) => `Turn ${turn} finished. The dish stays open, paused, as an ordinary dish.`,
  /**
   * P4.8c fix round 1: Finish leaves a challenge, so its limits end with the turn (src/worker/challenge.ts challengeOf).
   * Fix round 2: a goal still running is left with it (challengeGoalEndsOnFinish), so nothing after Finish counts for the challenge.
   */
  finishedChallenge: (turn: number) => `Turn ${turn} finished. The dish stays open, paused, as an ordinary dish: the challenge’s limits no longer apply, and nothing after this counts for the challenge.`,

  badgeRunning: (turn: number, leftTicks: number) => `Turn ${turn} · ${turnClock(leftTicks)} left`,
  badgeDone: (turn: number) => `Turn ${turn} finished`,
  badgeOpen: 'Show this turn’s result',
} as const;

/** The horizon card's goal line, from the turn's goal record only (null: free observation). */
export function turnGoalLine(g: GoalRecord | null): string {
  if (!g) return TRY_TEXT.freeObservation;
  const at = g.endTick !== null ? turnClock(g.endTick) : '';
  switch (g.state) {
    case 'completed':
      return `Goal: ${g.title} — completed at ${at}.`;
    case 'ended':
      switch (g.endReason) {
        case 'undone':
          return `Goal: ${g.title} — ended when Undo rewound the dish.`;
        case 'failed':
          return `Goal: ${g.title} — ended when something went wrong and the dish was paused.`;
        case 'cannotResume':
          return `Goal: ${g.title} — ended: this dish could not resume it.`;
        default:
          return `Goal: ${g.title} — ended at ${at}.`;
      }
    case 'continuedFreely':
      return `Goal: ${g.title} — left at ${at}.`;
    case 'running':
    case 'inactive':
      return `Goal: ${g.title} — not reached in this turn.`;
  }
}
