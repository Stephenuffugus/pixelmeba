/**
 * D-0095 (wave 7a integration): Saved dishes and the Save sheet name the right place when saves are not
 * being kept (the in-memory fallback, `persistent` false): the browser on the web, the app's save folder on
 * the Android app (src/ui/strings/saves.ts; Saves.tsx and MoreSheet.tsx pass isNativePlatform()).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NOT_KEEPING_SAVES } from '../../src/ui/strings/saves';

describe('the not-keeping-saves line (D-0095)', () => {
  it('names the browser on the web and the save folder on the app; both say to export', () => {
    for (const line of [NOT_KEEPING_SAVES.page, NOT_KEEPING_SAVES.sheet]) {
      expect(line(false)).toMatch(/browser/u);
      expect(line(true)).not.toMatch(/browser|private mode/u);
      expect(line(true)).toMatch(/save folder/u);
      for (const native of [false, true]) expect(line(native)).toMatch(/[Ee]xport/u);
    }
    // The web's words are the ones it had.
    expect(NOT_KEEPING_SAVES.page(false)).toBe('This browser is not keeping saves between visits. Export files to keep your dishes.');
  });

  it('both screens ask the platform', () => {
    expect(readFileSync('src/ui/views/Saves.tsx', 'utf8')).toContain('NOT_KEEPING_SAVES.page(isNativePlatform())');
    expect(readFileSync('src/ui/panels/MoreSheet.tsx', 'utf8')).toContain('NOT_KEEPING_SAVES.sheet(isNativePlatform())');
  });
});
