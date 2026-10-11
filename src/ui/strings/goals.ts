/**
 * Goal texts the app adds around content (P4.4; SPEC §13.5; D09 §6). The goals' own titles, summaries and
 * sentences come from content/objectives (the worker's 'goalCatalog'); these are the frame: the choice on
 * the Play card, the More row and the record lines. Personal invitations, not ranked challenges: no score,
 * no "win", no "fail" (D09 "Initial goals … are personal invitations, not ranked challenges").
 */
import type { GoalRecord } from '@persist/notebookGoals';

export const GOAL_TEXT = {
  choiceLegend: 'Goal (optional)',
  noGoal: 'No goal',
  noGoalHint: 'Just watch and play.',
  continue: 'Continue',
  tryAgain: 'Try again',
  continueFreely: 'Continue freely',
  leave: 'Leave goal',
  tryGoal: 'Try a goal…',
  tryGoalHide: 'Hide goals',
  startGoal: 'Start this goal',
  noneOffered: 'This dish offers no goals.',
  dismiss: 'Dismiss this goal sentence',
  rowTitle: 'Goal',
  /** D09: "the record then says 'Continued freely.'" */
  continuedFreely: 'Continued freely.',
  /** Shown when a sentence's text is not in this build's content (a later build's goal). */
  completedFallback: (title: string, time: string) => `${title}: completed at ${time}.`,
  endedFallback: (title: string, time: string) => `${title}: this attempt ended at ${time}. The dish keeps going.`,
  /** Undo rewound the dish while the goal ran (its observer cannot rewind). */
  undone: (title: string) => `${title}: Undo rewound the dish, so this attempt ended. The dish keeps going.`,
  /**
   * The host's error rollback while the goal ran: in the error toast's own words (state.ts errorToastText
   * "Something went wrong and the dish was paused: …"). No "keeps going": a dish stopped by an error
   * stays paused.
   */
  failed: (title: string) => `${title}: Something went wrong and the dish was paused, so this attempt ended.`,
  /** A running goal the reopened dish could not resume (not expected: the file check refuses such a record). */
  cannotResume: (title: string) => `${title}: this dish could not resume this goal, so this attempt ended. The dish keeps going.`,
  running: (title: string, since: string) => `Goal: ${title} — running since ${since}`,
  lastCompleted: (title: string, at: string) => `Last goal: ${title} — completed at ${at}.`,
  lastEnded: (title: string, at: string) => `Last goal: ${title} — ended at ${at}.`,
  lastUndone: (title: string) => `Last goal: ${title} — ended when Undo rewound the dish.`,
  lastFailed: (title: string) => `Last goal: ${title} — ended when something went wrong and the dish was paused.`,
  lastCannotResume: (title: string) => `Last goal: ${title} — ended: this dish could not resume it.`,
  lastLeft: (title: string, at: string) => `Last goal: ${title} — left at ${at}. Continued freely.`,
  lastLeftAfterEnd: (title: string, at: string) => `Last goal: ${title} — ended at ${at}. Continued freely.`,
  startRefused: (why: string) => `The goal did not start: ${why}`,
} as const;

/** "{time}" in a content sentence → the dish time. */
export function fillTime(text: string, time: string): string {
  return text.split('{time}').join(time);
}

/** The More row's line about the latest record (null: no record). `clock` formats a dish tick (m:ss). */
export function lastGoalLine(g: GoalRecord | undefined, clock: (tick: number) => string): string | null {
  if (!g) return null;
  const at = g.endTick !== null ? clock(g.endTick) : '';
  switch (g.state) {
    case 'running':
      return GOAL_TEXT.running(g.title, clock(g.startTick));
    case 'completed':
      return GOAL_TEXT.lastCompleted(g.title, at);
    case 'ended':
      switch (g.endReason) {
        case 'undone':
          return GOAL_TEXT.lastUndone(g.title);
        case 'failed':
          return GOAL_TEXT.lastFailed(g.title);
        case 'cannotResume':
          return GOAL_TEXT.lastCannotResume(g.title);
        default:
          return GOAL_TEXT.lastEnded(g.title, at);
      }
    case 'continuedFreely':
      return g.endReason === 'left' ? GOAL_TEXT.lastLeft(g.title, at) : GOAL_TEXT.lastLeftAfterEnd(g.title, at);
    case 'inactive':
      return null;
  }
}
