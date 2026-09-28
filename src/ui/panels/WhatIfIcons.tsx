/**
 * What if? choice icons (UX §3.4 "icon + label + one sentence"): 24 px line glyphs in currentColor,
 * decorative (the label and sentence carry the meaning). Chosen from the kind of change, never from
 * an outcome: less of a food, more of a food, food moved, or nothing changed.
 */
import type { ComponentChildren } from 'preact';
import type { VariantChange } from '@sim/variants';

function glyph(children: ComponentChildren) {
  return (
    <svg
      class="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** A small food blob with a minus sign. */
const Less = () =>
  glyph(
    <>
      <circle cx="9" cy="14" r="3" />
      <path d="M15 6h6" />
    </>,
  );

/** A large food blob with a plus sign. */
const More = () =>
  glyph(
    <>
      <circle cx="9" cy="14" r="6" />
      <path d="M15 6h6M18 3v6" />
    </>,
  );

/** A dashed old place, an arrow, and the food in its new place. */
const Moved = () =>
  glyph(
    <>
      <circle cx="6" cy="6" r="3" stroke-dasharray="2 2" />
      <path d="M8.5 8.5 14 14" />
      <path d="M14 10v4h-4" />
      <circle cx="18" cy="18" r="3" fill="currentColor" />
    </>,
  );

/** The dish, unchanged. */
const Dish = () =>
  glyph(
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="10" cy="11" r="2" />
      <circle cx="15" cy="14" r="1.5" />
    </>,
  );

export function WhatIfIcon(props: { readonly change: VariantChange }) {
  const c = props.change;
  if (c.kind === 'amount') return c.direction === 'less' ? <Less /> : <More />;
  if (c.kind === 'moved') return <Moved />;
  return <Dish />;
}

/** "Again": a circular arrow back to the start. */
export const IconAgain = () =>
  glyph(
    <>
      <path d="M4 12a8 8 0 1 0 3-6.2" />
      <path d="M4 4v4h4" />
    </>,
  );

/** "Another idea": a forward arrow to the next card. */
export const IconAnother = () =>
  glyph(
    <>
      <rect x="3" y="6" width="10" height="12" rx="2" />
      <path d="M16 12h6M19 9l3 3-3 3" />
    </>,
  );
