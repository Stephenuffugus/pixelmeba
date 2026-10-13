/**
 * Focus utilities (UX §4.2, §9; P3.11 W6-04/W6-06). Focus is never left on the page body after a
 * keyboard action closes the panel that held it: it returns to the dish, so the next key acts there.
 */

/** True when nothing (or only the page body) holds focus, e.g. after the focused panel unmounted. */
export function focusLost(doc: Document = document): boolean {
  const a = doc.activeElement;
  return a === null || a === doc.body || a === doc.documentElement || !a.isConnected;
}

const keyboardInput = new WeakMap<Document, boolean>();

/**
 * Whether the latest input on `doc` was a key (true) or a pointer (false). Listens from the first call;
 * before any input it reads as a key, so a keyboard-only start is never left on the body.
 */
export function lastInputWasKeyboard(doc: Document = document): boolean {
  if (!keyboardInput.has(doc)) {
    keyboardInput.set(doc, true);
    doc.addEventListener('keydown', () => keyboardInput.set(doc, true), true);
    doc.addEventListener('pointerdown', () => keyboardInput.set(doc, false), true);
  }
  return keyboardInput.get(doc) === true;
}

/**
 * Focus `el` without scrolling anything, only when focus was lost by a keyboard action. Returns whether
 * it moved focus. After a pointer action focus stays where the browser left it: a programmatic focus
 * then would not show the dish's reticle (:focus-visible), and a later Enter would tap at a hidden
 * centre (wave-verify MINOR).
 */
export function restoreFocus(el: HTMLElement | null, doc: Document = document): boolean {
  if (!el || !el.isConnected || !focusLost(doc) || !lastInputWasKeyboard(doc)) return false;
  if (el.closest('[inert]')) return false;
  el.focus({ preventScroll: true });
  return doc.activeElement === el;
}

/**
 * D-0099: what happens to the inspector's reveal pan (UX §4.1) when the open sheet changes from `prev` to
 * `next`. Only a key that closes the inspector, with no other sheet taking its place, while the dish holds
 * focus undoes the pan ('undo'): the view eases back and the centre reticle is on the dish again. Every
 * other change away from the inspector keeps the view and forgets the pan ('forget'). That covers a pointer
 * close, a key that opens another sheet (Add Life, Feed) and a sheet that opens by itself (the Try horizon
 * card). null: the inspector was not closed.
 */
export function revealOnSheetChange(prev: string, next: string, keyboard: boolean, dishFocused: boolean): 'undo' | 'forget' | null {
  if (prev !== 'inspect' || next === 'inspect') return null;
  return next === 'none' && keyboard && dishFocused ? 'undo' : 'forget';
}
