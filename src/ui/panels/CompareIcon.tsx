/** Compare glyph (ARCH §10.2 style): two dishes side by side, the right one marked with a change. */
export function IconCompare() {
  return (
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="7" cy="12" r="4.5" />
      <circle cx="17" cy="12" r="4.5" stroke-dasharray="2.2 1.8" />
      <path d="M17 10v4M15 12h4" />
    </svg>
  );
}
