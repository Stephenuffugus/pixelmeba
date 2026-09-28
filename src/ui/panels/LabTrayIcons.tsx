/**
 * Lab tray icons (UX §6.4): 24 px line glyphs in the same style as src/ui/icons.tsx, decorative
 * (every button carries a visible text label). Shapes differ per item so meaning never rests on
 * colour alone.
 */
import type { JSX } from 'preact';

function svg(children: JSX.Element | JSX.Element[]) {
  return (
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconInspect = () => svg([<circle cx="11" cy="11" r="6" />, <path d="m20 20-4.5-4.5" />, <path d="M11 8v3l2 1" />]);
export const IconChemistry = () => svg([<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z" />, <path d="M9 15h6" />]);
export const IconHabitat = () => svg([<path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />, <path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />]);
export const IconTools = () => svg([<path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2 2 0 0 1-3-3z" />, <path d="M6 4 4 6l3 3 2-2z" />]);
export const IconObserve = () => svg([<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />, <circle cx="12" cy="12" r="3" />]);
export const IconWater = () => svg([<path d="M3 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />, <path d="M3 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />]);
export const IconGel = () => svg([<rect x="4" y="6" width="16" height="12" rx="5" />, <circle cx="9" cy="12" r="1" fill="currentColor" />, <circle cx="15" cy="11" r="1" fill="currentColor" />]);
export const IconSediment = () => svg([<path d="M3 17h18" />, <circle cx="7" cy="13" r="1.5" />, <circle cx="12" cy="14" r="1.5" />, <circle cx="17" cy="13" r="1.5" />, <circle cx="9.5" cy="9.5" r="1.2" />, <circle cx="14.5" cy="9.5" r="1.2" />]);
export const IconShade = () => svg([<circle cx="12" cy="12" r="4" />, <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />, <path d="M5 19 19 5" />]);
export const IconSun = () => svg([<circle cx="12" cy="12" r="4" />, <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />]);
export const IconStone = () => svg([<path d="M5 16 7 8l6-3 5 4 1 7-7 3z" />, <path d="M9 11l3 1" />]);
export const IconWall = () => svg([<rect x="4" y="5" width="16" height="14" />, <path d="M4 10h16M4 14h16M10 5v5M14 10v4M10 14v5" />]);
export const IconBead = () => svg([<circle cx="12" cy="12" r="7" />, <circle cx="10" cy="10" r="1" fill="currentColor" />, <circle cx="14" cy="13" r="1" fill="currentColor" />, <circle cx="10" cy="15" r="1" fill="currentColor" />]);
export const IconErase = () => svg([<path d="m7 18-3-3 9-9 6 6-6 6z" />, <path d="M9 18h11" />, <path d="m9 10 5 5" />]);
export const IconCharts = () => svg([<path d="M4 20V4" />, <path d="M4 20h16" />, <path d="m7 15 4-4 3 3 5-6" />]);
export const IconLineage = () => svg([<circle cx="12" cy="5" r="2" />, <circle cx="6" cy="19" r="2" />, <circle cx="18" cy="19" r="2" />, <path d="M12 7v5M12 12l-6 5M12 12l6 5" />]);
export const IconOverlay = () => svg([<rect x="4" y="4" width="12" height="12" rx="2" />, <rect x="8" y="8" width="12" height="12" rx="2" />]);
export const IconSnapshot = () => svg([<rect x="3" y="7" width="18" height="13" rx="2" />, <circle cx="12" cy="13" r="3.5" />, <path d="M8 7l2-3h4l2 3" />]);
