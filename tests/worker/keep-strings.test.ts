/**
 * D-0033 words: the one short line after a replacing action says what was written to keep the dish that
 * was open (and nothing when nothing was written); the plan line before it says truthfully what will
 * happen; What if?'s own words are unchanged, with one new sentence for a dish already saved exactly.
 * Fix round 1: the dish Continue holds (no dish open) is named as such and never "Continue could not be
 * updated"; an untouched recipe start names its seed; a replaced save names its moment; Duplicate says
 * where the original is.
 */
import { describe, expect, it } from 'vitest';
import type { SlotSummary, WhatIfKept, WhatIfPlan } from '../../src/worker/protocol';
import { duplicatedText, keepChoiceText, keepPlanText, keptLine, withKeptLine } from '../../src/ui/strings/keep';
import { planText, startedText, WHATIF_TEXT } from '../../src/ui/strings/whatif';

const slot = (slotId: string): SlotSummary => ({ slotId, name: 'Little Living Garden', tick: 120, savedAt: '2026-09-29T00:00:00.000Z', recipeId: 'FIRST_DISH_V1', bytes: 1 });
const kept = (k: Partial<WhatIfKept>): WhatIfKept => ({ kind: 'slot', slot: slot('slot2'), replaced: null, name: 'Little Living Garden', autosaved: true, ...k });

describe('the line after a replacing action (D-0033)', () => {
  it('names what was written, and says nothing when nothing was', () => {
    expect(keptLine(kept({}))).toBe('Saved “Little Living Garden” to Slot 2 first.');
    expect(keptLine(kept({ replaced: 'Old dish' }))).toBe('Saved “Little Living Garden” to Slot 2 first, in place of “Old dish”.');
    expect(keptLine(kept({ kind: 'exported', slot: null }))).toBe('“Little Living Garden” is in the file you exported.');
    expect(keptLine(kept({ autosaved: false }))).toBe('Saved “Little Living Garden” to Slot 2 first. Continue could not be updated.');
    // Opening Continue itself writes no Continue first: nothing to say about it.
    expect(keptLine(kept({ autosaved: false }), false)).toBe('Saved “Little Living Garden” to Slot 2 first.');
    for (const kind of ['none', 'unchanged', 'saved'] as const) expect(keptLine(kept({ kind }))).toBe('');
    expect(keptLine(null)).toBe('');
    expect(withKeptLine(kept({}), 'Opened “Mine” — paused where you left it.')).toBe('Saved “Little Living Garden” to Slot 2 first. Opened “Mine” — paused where you left it.');
    expect(withKeptLine(kept({ kind: 'saved' }), 'Opened “Mine” — paused where you left it.')).toBe('Opened “Mine” — paused where you left it.');
  });

  it('fix round 1: a replaced save of the same name is told apart by its moment; the dish Continue held is named as such', () => {
    expect(keptLine(kept({ replaced: 'Little Living Garden', replacedTick: 20 }))).toBe(
      'Saved “Little Living Garden” to Slot 2 first, in place of “Little Living Garden” (0:02).',
    );
    // Continue already holds the dish Continue holds: its line never says Continue failed, whether or not
    // Continue was then rebound to the slot written (fix round 2: autosaved true when it was).
    expect(keptLine(kept({ fromContinue: true, autosaved: false }))).toBe('Saved “Little Living Garden” from Continue to Slot 2 first.');
    expect(keptLine(kept({ fromContinue: true, autosaved: true }))).toBe('Saved “Little Living Garden” from Continue to Slot 2 first.');
    expect(keptLine(kept({ kind: 'exported', slot: null, fromContinue: true, autosaved: false }))).toBe('“Little Living Garden” from Continue is in the file you exported.');
    expect(startedText('A smaller meal', kept({ fromContinue: true, autosaved: false }), false)).toBe(
      '“Little Living Garden” from Continue was saved to Slot 2. Started “A smaller meal” — paused. Press Run when you are ready.',
    );
  });

  it('fix round 1: Duplicate says where the original is, for every way it was kept', () => {
    expect(duplicatedText(kept({}))).toBe('Duplicated. You are now in the copy; the original was saved to Slot 2.');
    expect(duplicatedText(kept({ replaced: 'Old dish', replacedTick: 600 }))).toBe('Duplicated. You are now in the copy; the original was saved to Slot 2, in place of “Old dish” (1:00).');
    expect(duplicatedText(kept({ autosaved: false }))).toBe('Duplicated. You are now in the copy; the original was saved to Slot 2. Continue could not be updated.');
    expect(duplicatedText(kept({ kind: 'saved' }))).toBe('Duplicated. You are now in the copy; the original is in Slot 2, exactly as it was.');
    expect(duplicatedText(kept({ kind: 'unchanged', slot: null }))).toBe('Duplicated. You are now in the copy; the original had not changed since it started, so it was not saved.');
    expect(duplicatedText(kept({ kind: 'exported', slot: null }))).toBe('Duplicated. You are now in the copy; the original is in the file you exported.');
  });
});

describe('the plan before a replacing action (New Dish, the checkpoint confirmation, an experiment card)', () => {
  it('says truthfully what will happen to the open dish', () => {
    const plans: [WhatIfPlan, string][] = [
      [{ kind: 'none' }, ''],
      [{ kind: 'unchanged', name: 'A bigger meal' }, '“A bigger meal” has not changed since it started, so it is not saved first: What if? can start that idea again exactly.'],
      [{ kind: 'unchanged', name: 'Little Living Garden', seed: 104729 }, '“Little Living Garden” has not changed since it started (seed 104729), so it is not saved first: the same start rebuilds it exactly.'],
      [{ kind: 'saved', slotId: 'slot4', name: 'Mine' }, '“Mine” is already saved in Slot 4 exactly as it is now, so nothing is saved first.'],
      [{ kind: 'slot', slotId: 'slot4', own: true, name: 'Mine' }, '“Mine” will first be saved to Slot 4, where it was saved before, and to Continue.'],
      [{ kind: 'slot', slotId: 'slot1', own: false, name: 'Mine' }, '“Mine” will first be saved to Slot 1 (empty now) and to Continue.'],
      [{ kind: 'full', name: 'Mine' }, 'All ten save slots are used. Before the new dish opens you will choose how to keep “Mine”.'],
      [{ kind: 'unavailable', name: 'Mine' }, 'This device cannot keep saves. You will be asked to export “Mine” as a file first.'],
    ];
    for (const [plan, text] of plans) expect(keepPlanText(plan, 'start')).toBe(text);
    // Opening a checkpoint moves Continue to the new branch, so the plan does not promise Continue.
    expect(keepPlanText({ kind: 'slot', slotId: 'slot1', own: false, name: 'Mine' }, 'checkpoint', { continueNote: false })).toBe('“Mine” will first be saved to Slot 1 (empty now).');
    expect(keepPlanText({ kind: 'full', name: 'Mine' }, 'checkpoint', { continueNote: false })).toBe('All ten save slots are used. Before the checkpoint opens you will choose how to keep “Mine”.');
  });

  it('fix round 1: with no dish open it is about the dish Continue holds, which is never written to Continue again', () => {
    const c = { fromContinue: true } as const;
    const plans: [WhatIfPlan, string][] = [
      [{ kind: 'slot', slotId: 'slot1', own: false, name: 'Garden', ...c }, 'Continue holds “Garden”, which will first be saved to Slot 1 (empty now).'],
      [{ kind: 'slot', slotId: 'slot3', own: true, name: 'Garden', ...c }, 'Continue holds “Garden”, which will first be saved to Slot 3, where it was saved before.'],
      [{ kind: 'saved', slotId: 'slot3', name: 'Garden', ...c }, 'Continue holds “Garden”, which is already saved in Slot 3 exactly as it is now, so nothing is saved first.'],
      [{ kind: 'unchanged', name: 'Garden', seed: 7, ...c }, 'Continue holds “Garden”, which has not changed since it started (seed 7), so it is not saved first: the same start rebuilds it exactly.'],
      [{ kind: 'full', name: 'Garden', ...c }, 'All ten save slots are used. Before the experiment starts you will choose how to keep “Garden”, the dish Continue holds.'],
    ];
    for (const [plan, text] of plans) expect(keepPlanText(plan, plan.kind === 'full' ? 'experiment' : 'start')).toBe(text);
    // The checkpoint question already says what Continue holds.
    expect(keepPlanText({ kind: 'slot', slotId: 'slot1', own: false, name: 'Garden', ...c }, 'checkpoint', { continueNote: false, sayContinue: false })).toBe(
      '“Garden” will first be saved to Slot 1 (empty now).',
    );
    // What if?'s sheet says the same about the dish Continue holds.
    expect(planText({ kind: 'slot', slotId: 'slot1', own: false, name: 'Garden', ...c })).toBe('Continue holds “Garden”, which will first be saved to Slot 1 (empty now).');
    expect(planText({ kind: 'saved', slotId: 'slot3', name: 'Garden', ...c })).toBe('Continue holds “Garden”, which is already saved in Slot 3 exactly as it is, so nothing needs saving first.');
    expect(planText({ kind: 'full', name: 'Garden', ...c })).toBe('All ten save slots are used. Before the new dish opens you will choose how to keep “Garden”, the dish Continue holds.');
    expect(planText({ kind: 'unchanged', name: 'Garden', seed: 104729 })).toBe(
      '“Garden” has not changed since it started (seed 104729), so it is not saved again: the same start rebuilds it exactly.',
    );
  });

  it("the all-slots-used choice names the waiting action; What if?'s words are unchanged, with one new case", () => {
    const open = keepChoiceText('open', 'Mine');
    expect(open.pending).toBe('Waiting to open: “Mine”.');
    expect(open.continueAfterExport).toBe('Open the saved dish');
    expect(open.replaceContinue).toBe('Replace and open');
    expect(open.fullBody('Garden')).toBe('Keep “Garden” before the saved dish opens: export it as a file, or choose a saved dish to replace. Cancel changes nothing.');
    const start = keepChoiceText('start', 'Little Living Garden');
    expect(start.pending).toBe('Waiting to start: “Little Living Garden”.');
    expect([start.continueAfterExport, start.replaceContinue]).toEqual(['Start the new dish', 'Replace and start']);
    expect(keepChoiceText('experiment', 'Cleaning crew').continueAfterExport).toBe('Start the experiment');
    expect(keepChoiceText('import', 'friend.pixelmeba').continueAfterExport).toBe('Open the file');
    const dup = keepChoiceText('duplicate', 'Mine (copy)');
    expect([dup.pending, dup.continueAfterExport, dup.replaceContinue]).toEqual(['Waiting to open: “Mine (copy)”.', 'Open the copy', 'Replace and open']);
    expect(open.replaceExcluded(3, slot('slot3'))).toBe('Slot 3: Little Living Garden · 0:12 (the save you are opening)');
    // Fix round 1: the confirmation names the replaced save's moment (two saves of one name differ by it).
    expect(start.replaceConfirm('Little Living Garden', 3, 'Little Living Garden', 20)).toBe('“Little Living Garden” at 0:02 in Slot 3 will be replaced by “Little Living Garden”.');
    expect(keepChoiceText('start', 'Little Living Garden', true).fullBody('Garden')).toBe(
      'Keep “Garden”, the dish Continue holds, before the new dish opens: export it as a file, or choose a saved dish to replace. Cancel changes nothing.',
    );
    // What if?: the existing sentences stay as they were; a dish its slot already holds says so.
    expect(WHATIF_TEXT.replaceConfirm('Little Living Garden', 3, 'A smaller meal')).toBe('“Little Living Garden” in Slot 3 will be replaced by “A smaller meal”.');
    expect(planText({ kind: 'none' })).toBe('No dish is open, so there is nothing to save first.');
    expect(planText({ kind: 'unchanged', name: 'A bigger meal' })).toBe('“A bigger meal” has not changed since it started, so it is not saved again: starting that idea again rebuilds it exactly.');
    expect(planText({ kind: 'slot', slotId: 'slot1', own: false, name: 'Mine' })).toBe('Your current dish “Mine” will first be saved to Slot 1 (empty now) and to Continue.');
    expect(planText({ kind: 'saved', slotId: 'slot2', name: 'Mine' })).toBe('Your current dish “Mine” is already saved in Slot 2 exactly as it is now, so nothing needs saving first.');
    expect(startedText('A smaller meal', kept({ kind: 'saved' }), false)).toBe('Started “A smaller meal” — paused. Press Run when you are ready.');
    expect(startedText('A smaller meal', kept({}), false)).toBe('“Little Living Garden” was saved to Slot 2. Started “A smaller meal” — paused. Press Run when you are ready.');
    expect(startedText('A smaller meal', kept({ autosaved: false }), false)).toBe(
      '“Little Living Garden” was saved to Slot 2. Started “A smaller meal” — paused. Press Run when you are ready. Continue could not be updated.',
    );
  });
});
