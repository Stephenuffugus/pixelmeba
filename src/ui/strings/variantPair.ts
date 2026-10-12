/**
 * P4.5 Paired Garden variants: the words of the What if? sheet's "Compare with Garden" action, the
 * comparison's setup, progress and results when a What if? idea runs against the unchanged Garden
 * (UX §3.4, §5.6; D09 line 115 "Show both counts and food remaining, with a plain statement of the
 * changed input; a single pair is an illustration, not general proof"). Every number shown comes from
 * the worker's measured results; nothing here calls a result better or worse.
 */

// Kept in step with src/worker/variantPair.ts (tests/worker/variants-paired-host.test.ts checks), and not
// imported from it so the app's main bundle does not pull simulation code.
/** The unchanged Garden every idea is compared with (CT §9.4). */
export const VARIANT_PAIR_BASE = 'R-G0';
/** D09 line 115: "the existing 180-simulation-second paired comparison". */
export const VARIANT_PAIR_SECONDS = 180;

/** Ideas of the Garden can be compared with it; the Garden itself (R-G0) cannot. */
export function pairOffered(preview: { readonly id: string; readonly sourceId: string }, gardenSourceId: string): boolean {
  return preview.id !== VARIANT_PAIR_BASE && preview.sourceId === gardenSourceId;
}

export const VARIANT_PAIR_UI = {
  button: `Compare with Garden (${VARIANT_PAIR_SECONDS} s)`,
  buttonNote: `Runs this idea and the unchanged Garden side by side for ${VARIANT_PAIR_SECONDS} seconds of dish time.`,
  starting: 'Opening the comparison…',
  /** The comparison's title (setup and results). */
  title: (title: string) => `${title} vs Garden`,
  armA: 'A · Garden',
  armB: (title: string) => `B · ${title}`,
  /** Each view's name for a screen reader (the player queued no change: B differs only by the idea). */
  armAAria: 'Dish A: the unchanged Garden',
  armBAria: (title: string) => `Dish B: ${title}, the Garden with this idea’s one change`,
  setupIntro: (title: string) =>
    `A is the Garden as designed. B is “${title}”: the same dish, seed and starting life with one change. Neither gets any other change.`,
  horizon: `Both run for exactly ${VARIANT_PAIR_SECONDS} seconds of dish time.`,
  sequential: `This device runs the two dishes one after the other. Both get exactly ${VARIANT_PAIR_SECONDS} seconds.`,
  identities: (a: string, b: string) => `A: ${a} · B: ${b}`,
  prediction: '1 · Your prediction (optional)',
  run: `Run A and B for ${VARIANT_PAIR_SECONDS} s`,
  /**
   * No claim about saves (lead ruling, wave 6b integration): the pair's completion autosaves Continue as an
   * experiment's paired run does (src/ui/state.ts onCompareState, SPEC §14.2, D-0033), and the start may have
   * kept the open dish in a slot (its own kept line says so).
   */
  closeNote: (title: string) => `Closing discards the two copies and opens “${title}” paused at 0:00, as it starts.`,
  /** Running, sequential mode. */
  runningSeq: (arm: 'A' | 'B') => (arm === 'A' ? 'Running A (the Garden) first; B runs next for exactly the same time.' : 'A is done. Running B for exactly the same time.'),
  stopSeqB: 'Stopping is only possible while A runs: B must get exactly the same time as A.',
  /** Results. */
  caveat: 'One paired run is an illustration, not a general rule.',
  summary: (ticksText: string, stoppedEarly: boolean) =>
    `A (the Garden) and B (the idea) each ran ${ticksText} from the first moment${stoppedEarly ? ' (stopped early)' : ''}, with no other change.`,
  countsCaption: 'Living organisms of each kind and sugar left at the end of this paired run',
  countsHeading: 'Both counts and the food left',
  alive: (name: string) => `${name} alive`,
  sugarLeft: 'Sugar left in the dish',
  sugarNote: 'Sugar left is the dissolved sugar in the whole dish (carbon, in the game’s fictional units). It started at A {a} and B {b}.',
  noneAlive: 'No organisms were alive in either dish at the end.',
  done: (title: string) => `Done — open “${title}”`,
  doneNote: (title: string) =>
    `Done discards the two copies and opens “${title}” paused at 0:00. It has not run yet: press play to watch the idea for yourself. A saved result card is listed in Notebook → Journal.`,
  closed: (title: string) => `Comparison closed. “${title}” is open, paused at 0:00.`,
} as const;

/** Sugar in carbon units with two decimals (game units). */
export function sugarText(v: number): string {
  const s = (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);
  return s.replace('-', '−');
}

export function sugarNote(start: { readonly a: number; readonly b: number }): string {
  return VARIANT_PAIR_UI.sugarNote.replace('{a}', sugarText(start.a)).replace('{b}', sugarText(start.b));
}

/** The result card's "change on B" for a variant pair ("“A smaller meal”: sugar patch held …"). */
export function pairCardChange(title: string, changeShort: string): string {
  return `“${title}” — ${changeShort} (vs the unchanged Garden)`;
}
