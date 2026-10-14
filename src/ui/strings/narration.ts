/**
 * Narration copy (P4.9; UX §8.3; D08 §09). The spoken phrases themselves live in src/audio/narration.ts
 * PHRASES (fixed, never built from dish data); this file holds the Settings words and, for each phrase,
 * the evidence that lets it be spoken and the visible text that always shows (src/ui/narration.ts RULES).
 */
import type { PhraseId } from '@audio/narration';

export const NARRATION_TEXT = {
  setting: 'Narration (speak short phrases)',
  note: 'Speaks one of 16 short fixed phrases, such as “Pause” or “A cell split”, only when it is true on screen. It never reads numbers or names. What it says is always shown on screen too. Uses the voice volume.',
  noVoice: 'This device offers no voice for narration, so nothing is spoken; everything is still shown on screen.',
  voiceNote: 'For narration, when it is on.',
} as const;

/** For each phrase: the evidence that must be true, and the visible text equivalent (always shown). */
export const NARRATION_EVIDENCE: Readonly<Record<PhraseId, { readonly evidence: string; readonly visible: string }>> = {
  pressPlay: {
    evidence: 'A dish just opened paused at its start and its start line ("Press play and look closely.") shows.',
    visible: 'The start line in the notice place.',
  },
  pause: {
    evidence: 'The player pressed Pause (or Space) on a running dish and the dish is now paused.',
    visible: 'The Run button (play icon) in place of Pause.',
  },
  addLife: {
    evidence: 'An Add Life placement the dish accepted (accepted > 0).',
    visible: 'The "Added …" toast.',
  },
  addFood: {
    evidence: 'A food placement the dish accepted (a deposit with accepted > 0).',
    visible: 'The "Added … to … cells" toast.',
  },
  lookClosely: {
    evidence: 'The player chose Look (Explore) or Inspect (Lab) while another tool was chosen.',
    visible: 'The Look / Inspect button shown pressed.',
  },
  eatingSugar: {
    evidence: 'The inspector is open on an organism whose only recorded food is sugar and that took in carbon in the last second.',
    visible: 'The inspector\'s "Ate last second" line.',
  },
  needsMoreFood: {
    evidence: 'The inspector\'s leading reason is FOOD_ACCESS_LOW or FOOD_NONE_COMPATIBLE (for an organism that does not make its own food).',
    visible: 'The inspector\'s reason line ("There is not enough food here." / "Nothing here it can eat.").',
  },
  needsRoom: {
    evidence: 'The inspector\'s leading reason is DIV_BLOCK_PLACEMENT or DIV_BLOCK_CROWDING.',
    visible: 'The inspector\'s reason line ("Needs room to split.").',
  },
  resting: {
    evidence: 'The inspector\'s leading reason is RESTING_FOOD_SCARCE, RESTING_DRY or RESTING_NEWBORN.',
    visible: 'The inspector\'s reason line ("Resting …").',
  },
  cellSplit: {
    evidence: 'A committed division of the inspected organism (the inspector\'s record says it split) or of a followed family member (a snapshot birth event).',
    visible: 'The inspector\'s "split" record, the split mark on the dish and the feed line.',
  },
  followFamily: {
    evidence: 'The "Follow this family?" prompt shows (it needs a real Sprinter division).',
    visible: 'The "Follow this family?" prompt.',
  },
  feederEmpty: {
    evidence: 'None in v1.0: feeders are Phase 6 equipment, so this phrase is never spoken.',
    visible: '—',
  },
  lightOn: {
    evidence: 'None in v1.0: lamps and light cycles are Phase 6 equipment, so this phrase is never spoken.',
    visible: '—',
  },
  lightOff: {
    evidence: 'None in v1.0: lamps and light cycles are Phase 6 equipment, so this phrase is never spoken.',
    visible: '—',
  },
  saved: {
    evidence: 'A manual save succeeded.',
    visible: 'The "Saved “name”." toast.',
  },
  undoRewinds: {
    evidence: 'An Undo the dish accepted.',
    visible: 'The "Undone — time rewound to before that change." toast.',
  },
};
