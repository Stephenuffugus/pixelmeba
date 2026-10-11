/**
 * The goal sentence names only the recorded reason an attempt ended (wave 5b integration; honest labels):
 * Undo, an error rollback ('failed') and a goal the reopened dish could not resume ('cannotResume') each
 * have their own sentence, and none of them falls through to the content's ended text ("No Sprinters
 * remain…"), which claims a cause that was not recorded.
 */
import { describe, expect, it } from 'vitest';
import type { GoalRecord } from '../../src/persistence/notebookGoals';
import { goalSentence } from '../../src/ui/goals';
import { GOAL_TEXT } from '../../src/ui/strings/goals';

const ended = (endReason: GoalRecord['endReason']): GoalRecord => ({
  id: 'goal-1',
  objectiveId: 'KEEP_SPRINTERS_GOING',
  title: 'Keep Sprinters going',
  predicate: { type: 'keepSpeciesAlive', params: { species: 'B01' }, durationSeconds: 180 },
  state: 'ended',
  startTick: 0,
  endTick: 1200,
  ...(endReason !== undefined ? { endReason } : {}),
  progress: { startTick: 0, holdSinceTick: null, state: 'ended' },
  shown: false,
});

describe('goalSentence names the recorded end reason only', () => {
  it("an error rollback ('failed') and a goal that could not resume each have their own sentence", () => {
    expect(goalSentence(ended('failed'))).toBe(GOAL_TEXT.failed('Keep Sprinters going'));
    expect(goalSentence(ended('cannotResume'))).toBe(GOAL_TEXT.cannotResume('Keep Sprinters going'));
    expect(goalSentence(ended('undone'))).toBe(GOAL_TEXT.undone('Keep Sprinters going'));
  });

  it('only an attempt that ended on its own predicate gets the ended text (with its dish time)', () => {
    const own = goalSentence(ended('zero'));
    expect(own).not.toBeNull();
    for (const r of ['failed', 'cannotResume', 'undone'] as const) expect(goalSentence(ended(r))).not.toBe(own);
    expect(own).toContain('2:00');
  });
});
