/**
 * Focus utilities (UX §4.2, §9; P3.11 W6-04/W6-06). Focus is never left on the page body after a
 * keyboard action closes the panel that held it: it returns to the dish, so the next key acts there.
 */

/** True when nothing (or only the page body) holds focus, e.g. after the focused panel unmounted. */
export function focusLost(doc: Document = document): boolean {
  const a = doc.activeElement;
  return a === null || a === doc.body || a === doc.documentElement || !a.isConnected;
}

/** Focus `el` without scrolling anything, only when focus was lost. Returns whether it moved focus. */
export function restoreFocus(el: HTMLElement | null, doc: Document = document): boolean {
  if (!el || !el.isConnected || !focusLost(doc)) return false;
  if (el.closest('[inert]')) return false;
  el.focus({ preventScroll: true });
  return doc.activeElement === el;
}
