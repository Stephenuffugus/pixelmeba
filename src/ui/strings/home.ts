/**
 * Home, Play shelf, gentle prompts and session memory texts (P4.3; UX §2.1, §2.2, §3.2; D08 "Guidance
 * without a compulsory tutorial", "A satisfying stopping point"). Every sentence states recorded state:
 * a prompt appears only with its evidence (src/ui/prompts.ts), and the session memory line only from
 * the worker's recorded history (src/worker/host.ts sessionSummaryOf); a quiet dish gets no line.
 */
import type { SessionSummary } from '@worker/protocol';

export const HOME_TEXT = {
  paused: 'Paused',
  thumbLabel: (name: string) => `Picture of ${name}`,
  sessionTitle: 'Saved for later',
  /** The saved state is shown as it is: nothing is invented when the dish was quiet (D08). */
  sessionQuiet: 'Saved as it is now.',
  saveAndLeave: 'Save and leave',
} as const;

/** The one optional prompt's steps (UX §3.2), in order. */
export type PromptStep = 'arrival' | 'tapSprinter' | 'pressRun' | 'eating' | 'split' | 'noSplit' | 'feed' | 'follow';

export const PROMPT_TEXT: Readonly<Record<Exclude<PromptStep, 'arrival'>, string>> = {
  tapSprinter: 'Tap a Sprinter.',
  pressRun: 'Press Run.',
  eating: 'It’s eating sugar — tap to see how much.',
  split: 'A cell split.',
  noSplit: 'Nothing has split yet — tap one to see what’s stopping it.',
  // PROPOSED copy for UX §3.2 step 5 ("Feed: preview a patch, place it, return to Look").
  feed: 'Try Feed: choose a food, see where it lands, then place it.',
  follow: 'Follow this family?',
};

export const PROMPT_UI = {
  showMe: 'Show me',
  dismiss: 'Dismiss',
} as const;

/**
 * The one recorded change a session memory names (D08: "one recorded change if available"): the first
 * branch established since the dish was opened, else the births recorded, else nothing.
 */
export function sessionMemoryLine(s: SessionSummary): string | null {
  const first = s.branches.slice().sort((a, b) => a.tick - b.tick || a.id - b.id)[0];
  if (first) return `A new branch was established: ${first.name}.`;
  const births = s.births.reduce((a, b) => a + b, 0);
  // `compacted`: a recorded second or summarized minute that straddles the opening is left out, so the count is a lower bound.
  if (births > 0 && s.compacted) return `At least ${births} ${births === 1 ? 'birth was' : 'births were'} recorded since you opened it.`;
  if (births > 0) return births === 1 ? '1 birth was recorded since you opened it.' : `${births} births were recorded since you opened it.`;
  return null;
}
