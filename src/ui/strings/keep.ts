/**
 * D-0033 copy: every action that replaces the open dish (Play shelf Start, New Dish Create, an
 * experiment card's Start, Saved dishes → Open, Import, Duplicate) keeps the open dish first, exactly as
 * What if? does (UX §3.4, D-0026). With no dish open, the dish Continue holds is kept the same way (fix
 * round 1: after a relaunch Home offers it as the player's dish). Before the action a sheet or
 * confirmation says what will happen (from the worker's plan); afterwards one short line says what was
 * written, and nothing is said when nothing was written. Every sentence names only what the worker
 * reported.
 */
import type { SlotSummary, WhatIfKept, WhatIfPlan } from '@worker/protocol';
import { clock, slotNumber } from './whatif';

/** What the replacing action is about to do (the keep step's wording follows it). */
export type KeepVerb = 'start' | 'experiment' | 'open' | 'checkpoint' | 'import' | 'duplicate';

/** "before … opens" in the all-slots-used sheet. */
function opensPhrase(verb: KeepVerb): string {
  switch (verb) {
    case 'start':
      return 'the new dish opens';
    case 'experiment':
      return 'the experiment starts';
    case 'open':
      return 'the saved dish opens';
    case 'checkpoint':
      return 'the checkpoint opens';
    case 'import':
      return 'the file opens';
    case 'duplicate':
      return 'the copy opens';
  }
}

/**
 * The texts of the shared all-slots-used choice (KeepChoicePanel). What if? passes its own (WHATIF_TEXT,
 * unchanged); every other replacing action uses these.
 */
export interface KeepChoiceText {
  readonly fullTitle: string;
  readonly fullBody: (name: string) => string;
  readonly unavailableTitle: string;
  readonly unavailableBody: (name: string) => string;
  readonly pending: string;
  readonly exportIt: string;
  readonly exporting: string;
  readonly exported: (file: string) => string;
  readonly continueAfterExport: string;
  readonly replaceIt: string;
  readonly replaceLegend: string;
  readonly replaceSlot: (n: number, s: SlotSummary | undefined) => string;
  /** The save being opened, which cannot also hold the dish being kept. */
  readonly replaceExcluded: (n: number, s: SlotSummary | undefined) => string;
  /** `oldTick`: the moment of the save being replaced (two saves of one name are told apart by it). */
  readonly replaceConfirm: (old: string, n: number, name: string, oldTick: number) => string;
  readonly replaceContinue: string;
  readonly cancel: string;
}

export const KEEP_TEXT = {
  /** The sheet's heading (a modal over the page the action came from). */
  title: 'Keep your dish first',
  close: 'Close without changing anything',
  cancelled: 'Nothing was changed.',
  exportFailed: (why: string) => `Export failed, so nothing was changed: ${why}`,
} as const;

/**
 * The all-slots-used choice for a replacing action (the same steps and words as What if?'s).
 * `fromContinue`: the dish being kept is the one Continue holds (no dish is open).
 */
export function keepChoiceText(verb: KeepVerb, waiting: string, fromContinue = false): KeepChoiceText {
  const opening = verb === 'open' || verb === 'checkpoint' || verb === 'import' || verb === 'duplicate';
  const which = (name: string) => (fromContinue ? `“${name}”, the dish Continue holds,` : `“${name}”`);
  return {
    fullTitle: 'All ten save slots are used',
    fullBody: (name) =>
      `Keep ${which(name)} before ${opensPhrase(verb)}: export it as a file, or choose a saved dish to replace. Cancel changes nothing.`,
    unavailableTitle: 'Export it as a file',
    unavailableBody: (name) => `This device cannot keep saves. Export “${name}” as a file first, or cancel.`,
    pending: opening ? `Waiting to open: “${waiting}”.` : `Waiting to start: “${waiting}”.`,
    exportIt: 'Export it as a file',
    exporting: 'Exporting…',
    exported: (file) => `Exported ${file}. Keep that file to open this dish again.`,
    continueAfterExport:
      verb === 'experiment'
        ? 'Start the experiment'
        : verb === 'start'
          ? 'Start the new dish'
          : verb === 'import'
            ? 'Open the file'
            : verb === 'checkpoint'
              ? 'Open the checkpoint'
              : verb === 'duplicate'
                ? 'Open the copy'
                : 'Open the saved dish',
    replaceIt: 'Replace a saved dish…',
    replaceLegend: 'Choose the save to replace',
    replaceSlot: (n, s) => (s ? `Slot ${n}: ${s.name} · ${clock(s.tick)}` : `Slot ${n}: empty`),
    replaceExcluded: (n, s) => `Slot ${n}: ${s ? `${s.name} · ${clock(s.tick)}` : 'empty'} (the save you are opening)`,
    replaceConfirm: (old, n, name, oldTick) => `“${old}” at ${clock(oldTick)} in Slot ${n} will be replaced by “${name}”.`,
    replaceContinue: opening ? 'Replace and open' : 'Replace and start',
    cancel: 'Cancel',
  };
}

export interface KeepPlanOptions {
  /** Say that Continue is written too (false when the action itself then moves Continue, as a checkpoint does). */
  readonly continueNote?: boolean;
  /**
   * For the dish Continue holds: name it as such (false where the sentence before already says what
   * Continue holds, as the checkpoint question does).
   */
  readonly sayContinue?: boolean;
}

/**
 * What will happen to the open dish (or, with none open, the dish Continue holds) if the action goes
 * ahead (New Dish, the checkpoint confirmation, an experiment card), from the worker's plan. Empty when
 * there is nothing to keep.
 */
export function keepPlanText(plan: WhatIfPlan, verb: KeepVerb, options: KeepPlanOptions = {}): string {
  if (plan.kind === 'none') return '';
  if (plan.kind === 'unavailable') return `This device cannot keep saves. You will be asked to export “${plan.name}” as a file first.`;
  const fromContinue = plan.fromContinue === true;
  const named = fromContinue && options.sayContinue !== false;
  // The subject: the dish by name, or "Continue holds “X”, which" for the dish Continue holds.
  const subject = named ? `Continue holds “${plan.name}”, which` : `“${plan.name}”`;
  // Continue is written too, except for the dish Continue already holds.
  const andContinue = options.continueNote !== false && !fromContinue;
  switch (plan.kind) {
    case 'unchanged':
      return plan.seed === undefined
        ? `${subject} has not changed since it started, so it is not saved first: What if? can start that idea again exactly.`
        : `${subject} has not changed since it started (seed ${plan.seed}), so it is not saved first: the same start rebuilds it exactly.`;
    case 'saved':
      return `${subject} is already saved in Slot ${slotNumber(plan.slotId)} exactly as it is now, so nothing is saved first.`;
    case 'slot':
      return plan.own
        ? `${subject} will first be saved to Slot ${slotNumber(plan.slotId)}, where it was saved before${andContinue ? ', and to Continue' : ''}.`
        : `${subject} will first be saved to Slot ${slotNumber(plan.slotId)} (empty now)${andContinue ? ' and to Continue' : ''}.`;
    case 'full':
      return `All ten save slots are used. Before ${opensPhrase(verb)} you will choose how to keep “${plan.name}”${named ? ', the dish Continue holds' : ''}.`;
  }
}

/** “X” at m:ss — the save a keep replaced (its moment tells two saves of one name apart). */
function replacedText(kept: WhatIfKept): string {
  return kept.replacedTick !== undefined ? `“${kept.replaced ?? ''}” (${clock(kept.replacedTick)})` : `“${kept.replaced ?? ''}”`;
}

/**
 * The one short line after a replacing action: what was written to keep the dish that was open (or the
 * dish Continue held), or '' when nothing was (nothing to keep, unchanged, or already saved exactly).
 * `continueNote`: say so when Continue could not be updated (false when the action did not write
 * Continue, e.g. opening it; never for the dish Continue holds).
 */
export function keptLine(kept: WhatIfKept | null, continueNote = true): string {
  if (!kept) return '';
  const name = kept.name ?? 'Your dish';
  const from = kept.fromContinue ? ' from Continue' : '';
  let line: string;
  if (kept.kind === 'slot' && kept.slot) {
    const n = slotNumber(kept.slot.slotId);
    line = kept.replaced ? `Saved “${name}”${from} to Slot ${n} first, in place of ${replacedText(kept)}.` : `Saved “${name}”${from} to Slot ${n} first.`;
  } else if (kept.kind === 'exported') line = `“${name}”${from} is in the file you exported.`;
  else return '';
  return continueNote && !kept.autosaved && !kept.fromContinue ? `${line} Continue could not be updated.` : line;
}

/** A keep line and the action's own line, as one toast. */
export function withKeptLine(kept: WhatIfKept | null, text: string, continueNote = true): string {
  const line = keptLine(kept, continueNote);
  return line ? `${line} ${text}`.trim() : text;
}

/**
 * Duplicate dish (D-0033): the copy opens in place of the dish, which was kept first; the line says
 * where the original is, truthfully for every way it was kept.
 */
export function duplicatedText(kept: WhatIfKept | null): string {
  const head = 'Duplicated. You are now in the copy;';
  if (!kept) return `${head} the original is unchanged.`;
  switch (kept.kind) {
    case 'slot': {
      const n = kept.slot ? slotNumber(kept.slot.slotId) : 0;
      const where = kept.replaced ? `Slot ${n}, in place of ${replacedText(kept)}` : `Slot ${n}`;
      return `${head} the original was saved to ${where}.${kept.autosaved ? '' : ' Continue could not be updated.'}`;
    }
    case 'saved':
      return `${head} the original is in Slot ${kept.slot ? slotNumber(kept.slot.slotId) : 0}, exactly as it was.`;
    case 'unchanged':
      return `${head} the original had not changed since it started, so it was not saved.`;
    case 'exported':
      return `${head} the original is in the file you exported.`;
    case 'none':
      return `${head} the original is unchanged.`;
  }
}
