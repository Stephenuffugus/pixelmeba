/**
 * restoreFocus (P3.11 W6-04/W6-06; wave-verify MINOR): focus returns to the dish only after a keyboard
 * action. After a pointer action a programmatic focus would hide the reticle (:focus-visible) and a
 * later Enter would tap at a hidden centre. Node environment: a minimal document stand-in.
 */
import { describe, expect, it } from 'vitest';
import { lastInputWasKeyboard, restoreFocus } from '../../src/ui/a11y/focus';

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
