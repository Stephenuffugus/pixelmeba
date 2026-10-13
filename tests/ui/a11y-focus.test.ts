/**
 * restoreFocus (P3.11 W6-04/W6-06; wave-verify MINOR): focus returns to the dish only after a keyboard
 * action. After a pointer action a programmatic focus would hide the reticle (:focus-visible) and a
 * later Enter would tap at a hidden centre. Node environment: a minimal document stand-in.
 */
import { describe, expect, it } from 'vitest';
import { lastInputWasKeyboard, restoreFocus, revealOnSheetChange } from '../../src/ui/a11y/focus';

function fakeDoc() {
  const listeners: Record<string, (() => void)[]> = {};
  const body = { isConnected: true };
  const doc = {
    body,
    documentElement: {},
    activeElement: body as unknown,
    addEventListener: (type: string, fn: () => void) => (listeners[type] ??= []).push(fn),
  };
  const el = {
    isConnected: true,
    closest: () => null,
    focus: () => {
      doc.activeElement = el;
    },
  };
  const fire = (type: string) => listeners[type]?.forEach((f) => f());
  return { doc: doc as unknown as Document, el: el as unknown as HTMLElement, fire, raw: doc };
}

describe('restoreFocus follows the input modality', () => {
  it('a keyboard action that lost focus returns it to the dish', () => {
    const { doc, el, fire } = fakeDoc();
    lastInputWasKeyboard(doc);
    fire('keydown');
    expect(restoreFocus(el, doc)).toBe(true);
  });
  it('a pointer action leaves focus where the browser put it, until the next key', () => {
    const { doc, el, fire, raw } = fakeDoc();
    lastInputWasKeyboard(doc);
    fire('pointerdown');
    expect(restoreFocus(el, doc)).toBe(false);
    expect(raw.activeElement).toBe(raw.body);
    fire('keydown');
    expect(restoreFocus(el, doc)).toBe(true);
  });
  it('never moves focus that is still held by a control', () => {
    const { doc, el, raw } = fakeDoc();
    raw.activeElement = { isConnected: true };
    expect(restoreFocus(el, doc)).toBe(false);
  });
});

/**
 * D-0099 (v1.0 gate): the inspector's reveal pan is undone only when a key closes the inspector, with no other
 * sheet in its place, while the dish holds focus. A pointer close, a key that opens another sheet and a sheet
 * that opens by itself keep the view (UX §7.1 "Camera never jumps on its own").
 */
describe('revealOnSheetChange (D-0099)', () => {
  it('a key that closes the inspector with the dish focused undoes the reveal pan', () => {
    expect(revealOnSheetChange('inspect', 'none', true, true)).toBe('undo');
  });
  it('every other way out of the inspector keeps the view and forgets the pan', () => {
    expect(revealOnSheetChange('inspect', 'none', false, true)).toBe('forget'); // a pointer close
    expect(revealOnSheetChange('inspect', 'none', false, false)).toBe('forget');
    expect(revealOnSheetChange('inspect', 'none', true, false)).toBe('forget'); // focus went elsewhere
    expect(revealOnSheetChange('inspect', 'addLife', true, true)).toBe('forget'); // L in Explore
    expect(revealOnSheetChange('inspect', 'feed', true, true)).toBe('forget'); // F in Explore
    expect(revealOnSheetChange('inspect', 'more', true, true)).toBe('forget');
    expect(revealOnSheetChange('inspect', 'tryHorizon', true, true)).toBe('forget'); // opens by itself
  });
  it('nothing happens while the inspector stays open or was not open', () => {
    expect(revealOnSheetChange('inspect', 'inspect', true, true)).toBeNull();
    expect(revealOnSheetChange('none', 'none', true, true)).toBeNull();
    expect(revealOnSheetChange('more', 'none', true, true)).toBeNull();
    expect(revealOnSheetChange('none', 'inspect', true, true)).toBeNull();
  });
});
