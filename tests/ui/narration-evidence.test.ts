/**
 * P4.9 narration evidence (UX §8.3 "Played only when the evidence condition is true; text always shown;
 * never reads dynamic numbers or custom names"; D08 §09).
 *
 * One test per phrase (16): the transition with its evidence speaks it once, the same transition without
 * the evidence does not, and with narration off nothing is ever spoken. The three equipment phrases have
 * no evidence in a v1.0 dish (feeders and lamps are Phase 6) and are never spoken. The phrase texts hold
 * no digit and no dish or family name, whatever the views around them hold.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIO_DEFAULTS } from '@audio/mix';
import { Narrator, PHRASE_IDS, PHRASES, type PhraseId, type SpeechHost } from '@audio/narration';
import { R } from '@sim/reasons';
import type { EntityInspect, InspectorPayload, SnapshotMsg } from '@worker/protocol';
import {
  EMPTY_VIEW,
  familyBirthIn,
  inspectedViewOf,
  isSavedToast,
  isUndoToast,
  narrateTransition,
  phrasesFor,
  RULES,
  splitRecordOf,
  UNDO_TOAST,
  type NarrationView,
} from '../../src/ui/narration';
import { PLAY_PROMPT, savedToastText } from '../../src/ui/state';
import { NARRATION_EVIDENCE } from '../../src/ui/strings/narration';

const ROOT = join(__dirname, '..', '..');

/** A view of the open dish screen, paused, nothing inspected. */
const base: NarrationView = { ...EMPTY_VIEW, dishId: 'd1', onDish: true, speed: 0 };
const v = (patch: Partial<NarrationView>): NarrationView => ({ ...base, ...patch });

/** An organism as the inspector reports it (only the fields the rules read). */
function entity(patch: Partial<Record<string, unknown>> = {}): EntityInspect {
  return {
    birthId: 7,
    E: 10,
    B: 1,
    B0: 1,
    limitCode: R.NONE,
    limitValue: 0,
    divisionBlockers: [],
    predation: null,
    intakeLastSecond: 0,
    diet: { metabolism: 'heterotroph', prey: [], abilities: [], digestsFilm: false },
    profile: { foods: ['sugar'] },
    ...patch,
  } as unknown as EntityInspect;
}
const sel = { kind: 'entity', birthId: 7 } as const;
const payload = (e: EntityInspect): InspectorPayload => ({ kind: 'entity', entity: e });
const inspected = (e: EntityInspect) => inspectedViewOf(sel, true, payload(e));

/** Speak through a real narrator over a fake device; returns what reached SpeechSynthesis. */
function speakWith(prev: NarrationView, next: NarrationView, on = true): string[] {
  const spoken: string[] = [];
  const host: SpeechHost = {
    speechSynthesis: { speak: (u) => void spoken.push(u.text), cancel: () => undefined },
    SpeechSynthesisUtterance: class {
      volume = 1;
      onend = null;
      onerror = null;
      constructor(public text: string) {}
    },
  };
  const n = new Narrator({ host: () => host, now: () => 0, later: () => 0, clearLater: () => undefined });
  n.setPrefs({ ...AUDIO_DEFAULTS, narration: on });
  n.gesture();
  narrateTransition(prev, next, (id) => {
    const ok = n.speak(id);
    if (ok) n.stop(); // let the next one start at once (one at a time is the narrator's own test)
    return ok;
  });
  return spoken;
}

/** A transition must speak exactly `id` once with narration on, and nothing with it off. */
function expectSpoken(prev: NarrationView, next: NarrationView, id: PhraseId): void {
  expect(phrasesFor(prev, next)).toEqual([id]);
  expect(speakWith(prev, next)).toEqual([PHRASES[id]]);
  expect(speakWith(prev, next, false)).toEqual([]);
}
function expectSilent(prev: NarrationView, next: NarrationView, id: PhraseId): void {
  expect(RULES[id](prev, next)).toBe(false);
  expect(phrasesFor(prev, next)).not.toContain(id);
}

describe('narration evidence, one rule per phrase', () => {
  it('every phrase has a rule, an evidence line and a visible text equivalent', () => {
    expect(Object.keys(RULES).sort()).toEqual([...PHRASE_IDS].sort());
    for (const id of PHRASE_IDS) {
      expect(NARRATION_EVIDENCE[id].evidence.length).toBeGreaterThan(10);
      expect(NARRATION_EVIDENCE[id].visible.length).toBeGreaterThan(0);
    }
  });

  it('Press play: a dish just opened paused at its start, its start line showing', () => {
    const line = { id: 'dish-prompt:d1:' + PLAY_PROMPT, text: PLAY_PROMPT };
    expectSpoken(v({ dishId: null, onDish: false, speed: null }), v({ notice: line }), 'pressPlay');
    // With the kept-dish line before it, still the start line.
    expectSpoken(base, v({ notice: { id: 'dish-prompt:d1:Saved x. ' + PLAY_PROMPT, text: `Saved x. ${PLAY_PROMPT}` } }), 'pressPlay');
    expectSilent(base, v({ notice: { id: 'guide:d1:tapSprinter', text: 'Tap a Sprinter.' } }), 'pressPlay'); // another notice
    expectSilent(v({ notice: line }), v({ notice: line }), 'pressPlay'); // already showing
    expectSilent(base, v({ notice: line, speed: 1 }), 'pressPlay'); // the dish runs
  });

  it('Pause: the player paused a running dish', () => {
    expectSpoken(v({ speed: 2 }), v({ speed: 0, pauseRequested: true }), 'pause');
    expectSilent(v({ speed: 2 }), v({ speed: 0, pauseRequested: false }), 'pause'); // paused by the app (Home, background, a horizon)
    expectSilent(v({ speed: 0 }), v({ speed: 0, pauseRequested: true }), 'pause'); // already paused
    expectSilent(v({ dishId: 'd0', speed: 2 }), v({ speed: 0, pauseRequested: true }), 'pause'); // another dish opened
  });

  it('Add life: an accepted inoculate', () => {
    expectSpoken(base, v({ command: { seq: 1, kind: 'inoculate', accepted: 12 } }), 'addLife');
    expectSilent(base, v({ command: { seq: 1, kind: 'inoculate', accepted: 0 } }), 'addLife'); // refused: nothing placed
    const c = { seq: 1, kind: 'inoculate', accepted: 12 };
    expectSilent(v({ command: c }), v({ command: c }), 'addLife'); // the same answer again
  });

  it('Add food: an accepted deposit or food object', () => {
    expectSpoken(base, v({ command: { seq: 3, kind: 'deposit', accepted: 37 } }), 'addFood');
    expectSpoken(base, v({ command: { seq: 3, kind: 'placeObject', accepted: 1 } }), 'addFood');
    expectSilent(base, v({ command: { seq: 3, kind: 'deposit', accepted: 0 } }), 'addFood');
    expectSilent(base, v({ command: { seq: 3, kind: 'placeStructure', accepted: 5 } }), 'addFood');
  });

  it('Look closely: the player chose Look / Inspect over another tool', () => {
    expectSpoken(v({ lookSeq: 0 }), v({ lookSeq: 1 }), 'lookClosely');
    expectSilent(v({ lookSeq: 1 }), v({ lookSeq: 1 }), 'lookClosely');
    expectSilent(v({ lookSeq: 0, onDish: false }), v({ lookSeq: 1, onDish: false }), 'lookClosely');
  });

  it('Eating sugar: the inspected organism eats only sugar and took some in this second', () => {
    expectSpoken(base, v({ inspected: inspected(entity({ intakeLastSecond: 0.004 })) }), 'eatingSugar');
    expectSilent(base, v({ inspected: inspected(entity({ intakeLastSecond: 0 })) }), 'eatingSugar'); // nothing taken in
    expectSilent(base, v({ inspected: inspected(entity({ intakeLastSecond: 0.004, profile: { foods: ['sugar', 'starch'] } })) }), 'eatingSugar'); // could be starch
    expectSilent(
      base,
      v({ inspected: inspected(entity({ intakeLastSecond: 0.004, diet: { metabolism: 'photosynthesis', prey: [], abilities: [], digestsFilm: false }, profile: { foods: [] } })) }),
      'eatingSugar',
    );
    const on = v({ inspected: inspected(entity({ intakeLastSecond: 0.004 })) });
    expectSilent(on, on, 'eatingSugar'); // still eating: said once
    expect(inspectedViewOf(sel, false, payload(entity({ intakeLastSecond: 0.004 })))).toBeNull(); // the inspector is closed
  });

  it('Needs more food: the reason line is FOOD_ACCESS_LOW or FOOD_NONE_COMPATIBLE', () => {
    expectSpoken(base, v({ inspected: inspected(entity({ limitCode: R.FOOD_ACCESS_LOW, limitValue: 0.2 })) }), 'needsMoreFood');
    expectSpoken(base, v({ inspected: inspected(entity({ limitCode: R.FOOD_NONE_COMPATIBLE })) }), 'needsMoreFood');
    expectSilent(base, v({ inspected: inspected(entity({ limitCode: R.NUTRIENT_LIMITED })) }), 'needsMoreFood');
    // An organism that makes its own food is never said to lack food (its line is "making less food").
    expectSilent(
      base,
      v({ inspected: inspected(entity({ limitCode: R.FOOD_ACCESS_LOW, diet: { metabolism: 'photosynthesis', prey: [], abilities: [], digestsFilm: false }, profile: { foods: [] } })) }),
      'needsMoreFood',
    );
  });

  it('Needs room: DIV_BLOCK_PLACEMENT or DIV_BLOCK_CROWDING leads', () => {
    expectSpoken(base, v({ inspected: inspected(entity({ limitCode: R.DIV_BLOCK_PLACEMENT })) }), 'needsRoom');
    expectSpoken(base, v({ inspected: inspected(entity({ B: 2, divisionBlockers: [R.DIV_BLOCK_CROWDING] })) }), 'needsRoom');
    expectSilent(base, v({ inspected: inspected(entity({ B: 1, divisionBlockers: [R.DIV_BLOCK_CROWDING] })) }), 'needsRoom'); // too small: not its reason line
    expectSilent(base, v({ inspected: inspected(entity({ limitCode: R.DIV_BLOCK_ENERGY })) }), 'needsRoom');
  });

  it('Resting: a RESTING_* reason leads', () => {
    expectSpoken(base, v({ inspected: inspected(entity({ limitCode: R.RESTING_FOOD_SCARCE })) }), 'resting');
    expectSpoken(base, v({ inspected: inspected(entity({ limitCode: R.RESTING_DRY })) }), 'resting');
    expectSilent(base, v({ inspected: inspected(entity({ limitCode: R.PREPARING })) }), 'resting');
    // Out of energy leads over everything (src/ui/strings/shortcuts.ts leadConstraint).
    expectSilent(base, v({ inspected: inspected(entity({ limitCode: R.RESTING_DRY, E: 0 })) }), 'resting');
  });

  it('A cell split: the inspected organism divided, or a followed family member was born', () => {
    const gone = (divided: boolean): InspectorPayload => ({ kind: 'gone', gone: { birthId: 7, deathTick: 90, cause: 0, divided, children: divided ? [8, 9] : [] } });
    expect(splitRecordOf(sel, true, gone(true))).toBe(7);
    expect(splitRecordOf(sel, true, gone(false))).toBeNull(); // it died: not a split
    expect(splitRecordOf({ kind: 'entity', birthId: 5 }, true, gone(true))).toBeNull(); // another organism's record
    expectSpoken(base, v({ splitRecord: 7 }), 'cellSplit');
    expectSilent(v({ splitRecord: 7 }), v({ splitRecord: 7 }), 'cellSplit');
    expectSpoken(v({ familySplitSeq: 2 }), v({ familySplitSeq: 3 }), 'cellSplit');
    expectSilent(v({ familySplitSeq: 3 }), v({ familySplitSeq: 3 }), 'cellSplit');
    // The snapshot rule: a 'birth' event whose newborn carries a followed family's member bit.
    const snap = (member: number): Pick<SnapshotMsg, 'events' | 'ids' | 'count' | 'favorites'> => ({
      count: 2,
      ids: new Uint32Array([3, 30, 11, 31]),
      events: [{ type: 'birth', tick: 10, species: 0, cell: 5, birthId: 11 }],
      favorites: { marks: new Uint8Array(2), member: new Uint8Array([0, member]), slots: [] },
    });
    expect(familyBirthIn(snap(1))).toBe(true);
    expect(familyBirthIn(snap(0))).toBe(false); // not a followed family's birth
    expect(familyBirthIn({ ...snap(1), events: [{ type: 'death', tick: 10, species: 0, cell: 5, birthId: 11 }] })).toBe(false);
    const { favorites: _f, ...noMarks } = snap(1);
    void _f;
    expect(familyBirthIn(noMarks)).toBe(false);
  });

  it('Follow this family: the "Follow this family?" prompt shows', () => {
    expectSpoken(base, v({ notice: { id: 'guide:d1:follow', text: 'Follow this family?' } }), 'followFamily');
    expectSilent(base, v({ notice: { id: 'guide:d1:feed', text: 'Try Feed' } }), 'followFamily');
    const n = { id: 'guide:d1:follow', text: 'Follow this family?' };
    expectSilent(v({ notice: n }), v({ notice: n }), 'followFamily');
  });

  it('The feeder is empty / The light is on / The light is off: no evidence in a v1.0 dish, never spoken', () => {
    // Every transition the views below can make, in both directions: none of the three is ever chosen.
    const views: NarrationView[] = [
      EMPTY_VIEW,
      base,
      v({ speed: 4 }),
      v({ speed: 0, pauseRequested: true }),
      v({ command: { seq: 1, kind: 'deposit', accepted: 5 } }),
      v({ inspected: inspected(entity({ intakeLastSecond: 1, limitCode: R.LIGHT_LIMITED })) }),
      v({ inspected: inspected(entity({ limitCode: R.NIGHT_QUIET })) }),
      v({ toast: 'The light is on' }),
      v({ notice: { id: 'guide:d1:x', text: 'The feeder is empty' } }),
      v({ splitRecord: 7, familySplitSeq: 4, lookSeq: 3 }),
    ];
    for (const a of views) {
      for (const b of views) {
        for (const id of ['feederEmpty', 'lightOn', 'lightOff'] as const) expect(RULES[id](a, b)).toBe(false);
        expect(speakWith(a, b).filter((t) => /feeder|light/i.test(t))).toEqual([]);
      }
    }
  });

  it('Saved: a manual save succeeded (its toast)', () => {
    expectSpoken(base, v({ toast: savedToastText('Sprinter Garden', true) }), 'saved');
    expectSpoken(base, v({ toast: savedToastText('Garden', false) }), 'saved'); // the slot was saved
    expectSilent(base, v({ toast: "Couldn't save; your previous save is intact. (quota)" }), 'saved');
    expectSilent(base, v({ toast: 'Saved to the gallery. Notebook → Gallery lists it.' }), 'saved');
    const t = savedToastText('Garden', true);
    expectSilent(v({ toast: t }), v({ toast: t }), 'saved');
    expect(isSavedToast(null)).toBe(false);
  });

  it('Undo rewinds time: an accepted Undo (its toast)', () => {
    expectSpoken(base, v({ toast: UNDO_TOAST }), 'undoRewinds');
    expectSilent(base, v({ toast: 'Nothing to undo.' }), 'undoRewinds');
    expect(isUndoToast('Nothing to undo.')).toBe(false);
    // The rule keys on the toast src/ui/state.ts undo() really shows.
    expect(readFileSync(join(ROOT, 'src', 'ui', 'state.ts'), 'utf8')).toContain(`'${UNDO_TOAST}'`);
  });

  it('narration off: no transition ever reaches SpeechSynthesis', () => {
    const pairs: [NarrationView, NarrationView][] = [
      [v({ speed: 2 }), v({ speed: 0, pauseRequested: true })],
      [base, v({ command: { seq: 1, kind: 'deposit', accepted: 3 } })],
      [base, v({ toast: savedToastText('x', true) })],
      [base, v({ toast: UNDO_TOAST })],
      [base, v({ splitRecord: 7 })],
    ];
    for (const [a, b] of pairs) {
      expect(phrasesFor(a, b).length).toBeGreaterThan(0);
      expect(speakWith(a, b, false)).toEqual([]);
    }
  });

  it('no phrase holds a digit or a dish/family name, whatever the views hold', () => {
    for (const id of PHRASE_IDS) expect(PHRASES[id]).not.toMatch(/\d/);
    const named = v({
      toast: savedToastText('Bob 42 the Sprinter', true),
      command: { seq: 9, kind: 'inoculate', accepted: 42 },
      notice: { id: 'guide:d1:follow', text: 'Follow this family?' },
      splitRecord: 7,
    });
    const spoken = speakWith(base, named);
    expect(spoken.length).toBeGreaterThan(0);
    for (const t of spoken) {
      expect(Object.values(PHRASES)).toContain(t);
      expect(t).not.toMatch(/\d|Bob|Sprinter/);
    }
  });
});
