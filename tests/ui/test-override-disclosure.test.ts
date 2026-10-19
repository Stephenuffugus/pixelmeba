/**
 * P5.6 test-only override disclosure, UI words (wave 15 p5-polish; BUILD_DIRECTIVE P5.6 "test‑only overrides
 * disclosed"; SPEC §13.1 "disclosed in the setup panel and export"; UX §3.3 "Test overrides: 'test‑only override'"
 * wherever a world is described; D02 706). The data is measures-overrides' (ExperimentCardView.testOverrides,
 * DishInfo.testOverrides, SlotModes.testOnly); this file pins the words:
 *   - the setup panel's block for one and for two overrides (ExperimentCard.tsx; strings/experiments.ts);
 *   - worldModesLine with and without testOnly, exact strings (UX's non-breaking hyphen U+2011), and modesFlags;
 *   - slotModesLine reading SlotModes.testOnly (Home, MoreSheet, Saves).
 * Mutant check (by hand, reverted): worldModesLine ignoring testOnly fails the exact-string cases.
 */
import { describe, expect, it } from 'vitest';
import type { TestOverrideView } from '../../src/sim/experiments';
import { TEST_OVERRIDE_STAMP_NOTE, TEST_OVERRIDE_TITLE, testOverrideEntry, testOverrideLines } from '../../src/ui/strings/experiments';
import { CORE_PROTOTYPE_LABEL, modesFlags, slotModesLine, TEST_ONLY_LABEL, worldModesLine } from '../../src/ui/strings/modes';

const NEEDLEJAW: TestOverrideView = {
  description: 'Needlejaw is held still so its contact with the Shellglider can be measured.',
  speciesId: 'P10',
  speciesName: 'Needlejaw',
  field: 'speed',
  value: 0,
  normal: 0.6,
};
const SHELLGLIDER: TestOverrideView = { ...NEEDLEJAW, description: 'Shellglider is held still too.', speciesId: 'P05', speciesName: 'Shellglider', normal: 0.35 };

describe('the setup panel block (ExperimentCard.tsx)', () => {
  it('UX §3.3 words: the label is "test‑only override" with U+2011; the block title and the stamp note', () => {
    expect(TEST_ONLY_LABEL).toBe('test‑only override');
    expect(TEST_ONLY_LABEL.codePointAt(4)).toBe(0x2011);
    expect(TEST_OVERRIDE_TITLE).toBe('Test-only override');
    expect(TEST_OVERRIDE_STAMP_NOTE).toBe('Recorded with a test-only override.');
  });

  it('one override: one sentence from speciesName, field, value and normal; the description verbatim under it', () => {
    expect(testOverrideEntry(NEEDLEJAW)).toBe('Needlejaw speed 0 (normally 0.6)');
    expect(testOverrideLines([NEEDLEJAW])).toEqual({
      lines: ['This card’s fixture changes the rules for this test only: Needlejaw speed 0 (normally 0.6). It is never offered in an ordinary dish.'],
      notes: ['Needlejaw is held still so its contact with the Shellglider can be measured.'],
    });
  });

  it('two overrides: a lead line, one line per entry, the closing line; each description once', () => {
    expect(testOverrideLines([NEEDLEJAW, SHELLGLIDER])).toEqual({
      lines: [
        'This card’s fixture changes the rules for this test only:',
        'Needlejaw speed 0 (normally 0.6).',
        'Shellglider speed 0 (normally 0.35).',
        'It is never offered in an ordinary dish.',
      ],
      notes: ['Needlejaw is held still so its contact with the Shellglider can be measured.', 'Shellglider is held still too.'],
    });
    expect(testOverrideLines([NEEDLEJAW, { ...SHELLGLIDER, description: NEEDLEJAW.description }]).notes).toHaveLength(1);
  });

  it('a card without overrides shows nothing', () => {
    expect(testOverrideLines(undefined)).toEqual({ lines: [], notes: [] });
    expect(testOverrideLines([])).toEqual({ lines: [], notes: [] });
  });
});

describe('mode labels (worldModesLine, slotModesLine; UX §3.3)', () => {
  it('worldModesLine appends "test‑only override" only with testOnly, after Core prototype', () => {
    expect(worldModesLine('standard', 'identical', { testOnly: true })).toBe('Standard Evolution · Identical founders · test‑only override');
    expect(worldModesLine('standard', 'identical', { testOnly: false })).toBe('Standard Evolution · Identical founders');
    expect(worldModesLine('standard', 'identical', {})).toBe('Standard Evolution · Identical founders');
    expect(worldModesLine('accelerated', 'varied', { partial: true, testOnly: true })).toBe(
      `Accelerated Evolution (game setting, not realism) · Varied founders · ${CORE_PROTOTYPE_LABEL} · test‑only override`,
    );
    // RegistryInfo stays a valid third argument (its `partial`), as every v1.0 call site passed it.
    expect(worldModesLine('fixed', 'identical', { partial: false })).toBe('Fixed Traits · Identical founders');
    expect(worldModesLine('standard', 'diverse', null)).toBe('Standard Evolution · Diverse founders');
  });

  it('modesFlags: testOnly from a non-empty override list; partial from the registry', () => {
    expect(modesFlags({ partial: true }, [NEEDLEJAW])).toEqual({ partial: true, testOnly: true });
    expect(modesFlags(null, [])).toEqual({ partial: false, testOnly: false });
    expect(modesFlags(undefined, undefined)).toEqual({ partial: false, testOnly: false });
    expect(worldModesLine('standard', 'identical', modesFlags({ partial: false }, [NEEDLEJAW]))).toBe('Standard Evolution · Identical founders · test‑only override');
  });

  it('slotModesLine reads SlotModes.testOnly (Home, More, Saved dishes)', () => {
    expect(slotModesLine({ mutationPreset: 'standard', founderMode: 'identical', testOnly: true })).toBe('Standard Evolution · Identical founders · test‑only override');
    expect(slotModesLine({ mutationPreset: 'standard', founderMode: 'identical' })).toBe('Standard Evolution · Identical founders');
    expect(slotModesLine({ mutationPreset: 'fixed', founderMode: 'varied', partial: true, testOnly: true })).toBe(`Fixed Traits · Varied founders · ${CORE_PROTOTYPE_LABEL} · test‑only override`);
  });
});
