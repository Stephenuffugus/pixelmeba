/**
 * Lab tray icons (UX §6.4): 24 px line glyphs in the same style as src/ui/icons.tsx, decorative
 * (every button carries a visible text label). Shapes differ per item so meaning never rests on
 * colour alone.
 */
import type { JSX } from 'preact';

function svg(children: JSX.Element | JSX.Element[]) {
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

export const IconInspect = () =>
  svg([<circle cx="11" cy="11" r="6" />, <path d="m20 20-4.5-4.5" />, <path d="M11 8v3l2 1" />]);
export const IconChemistry = () =>
  svg([<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z" />, <path d="M9 15h6" />]);
export const IconHabitat = () =>
  svg([<path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />, <path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />]);
export const IconTools = () =>
  svg([<path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2 2 0 0 1-3-3z" />, <path d="M6 4 4 6l3 3 2-2z" />]);
export const IconObserve = () =>
  svg([<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />, <circle cx="12" cy="12" r="3" />]);
export const IconWater = () =>
  svg([<path d="M3 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />, <path d="M3 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />]);
export const IconGel = () =>
  svg([
    <rect x="4" y="6" width="16" height="12" rx="5" />,
    <circle cx="9" cy="12" r="1" fill="currentColor" />,
    <circle cx="15" cy="11" r="1" fill="currentColor" />,
  ]);
export const IconSediment = () =>
  svg([
    <path d="M3 17h18" />,
    <circle cx="7" cy="13" r="1.5" />,
    <circle cx="12" cy="14" r="1.5" />,
    <circle cx="17" cy="13" r="1.5" />,
    <circle cx="9.5" cy="9.5" r="1.2" />,
    <circle cx="14.5" cy="9.5" r="1.2" />,
  ]);
export const IconShade = () =>
  svg([
    <circle cx="12" cy="12" r="4" />,
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />,
    <path d="M5 19 19 5" />,
  ]);
export const IconSun = () =>
  svg([
    <circle cx="12" cy="12" r="4" />,
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />,
  ]);
export const IconStone = () => svg([<path d="M5 16 7 8l6-3 5 4 1 7-7 3z" />, <path d="M9 11l3 1" />]);
export const IconWall = () =>
  svg([<rect x="4" y="5" width="16" height="14" />, <path d="M4 10h16M4 14h16M10 5v5M14 10v4M10 14v5" />]);
export const IconBead = () =>
  svg([
    <circle cx="12" cy="12" r="7" />,
    <circle cx="10" cy="10" r="1" fill="currentColor" />,
    <circle cx="14" cy="13" r="1" fill="currentColor" />,
    <circle cx="10" cy="15" r="1" fill="currentColor" />,
  ]);
export const IconErase = () =>
  svg([<path d="m7 18-3-3 9-9 6 6-6 6z" />, <path d="M9 18h11" />, <path d="m9 10 5 5" />]);
export const IconCharts = () =>
  svg([<path d="M4 20V4" />, <path d="M4 20h16" />, <path d="m7 15 4-4 3 3 5-6" />]);
export const IconLineage = () =>
  svg([
    <circle cx="12" cy="5" r="2" />,
    <circle cx="6" cy="19" r="2" />,
    <circle cx="18" cy="19" r="2" />,
    <path d="M12 7v5M12 12l-6 5M12 12l6 5" />,
  ]);
export const IconOverlay = () =>
  svg([
    <rect x="4" y="4" width="12" height="12" rx="2" />,
    <rect x="8" y="8" width="12" height="12" rx="2" />,
  ]);
export const IconSnapshot = () =>
  svg([
    <rect x="3" y="7" width="18" height="13" rx="2" />,
    <circle cx="12" cy="13" r="3.5" />,
    <path d="M8 7l2-3h4l2 3" />,
  ]);

// ---- P5.1/P5.2 (wave 11): the Build group and the wetting brush (UX §6.4: 24 px, currentColor; each
// reads as its CT §4 object, and every button also carries its content name). Wave 12 (structures-art-audio)
// polished the membrane (a line of dots), the small gate (a slotted bar) and the cooler (fins on a base) so
// each of the twelve is a distinct stroke drawing (tests/ui/structure-icons.test.ts).

/** S01 fine membrane: a line of dots on the edge between two cell outlines. */
export const IconMembrane = () =>
  svg([
    <path d="M9 6H4v12h5M15 6h5v12h-5" />,
    <path d="M12 4v.01M12 8v.01M12 12v.01M12 16v.01M12 20v.01" stroke-width="2.5" />,
  ]);
/** S02 small gate: a bar on the edge with three slots through it. */
export const IconSmallGate = () =>
  svg([<rect x="9" y="3" width="6" height="18" rx="1.5" />, <path d="M12 6.5v2.5M12 11v2.5M12 15.5v2.5" />]);
/** S03 shutter gate: a hinged tab across an edge. */
export const IconShutter = () =>
  svg([<path d="M12 3v18" />, <path d="M12 7l6 3v6l-6 2" />, <circle cx="12" cy="7" r="1.2" fill="currentColor" />]);
/** S04 one-way channel: an arrow through an edge. */
export const IconChannel = () =>
  svg([<path d="M12 3v5M12 16v5" />, <path d="M4 12h15" />, <path d="m15 8 4 4-4 4" />]);
/** S05 porous shelter: an arch with holes. */
export const IconShelter = () =>
  svg([
    <path d="M4 19v-7a8 8 0 0 1 16 0v7" />,
    <path d="M3 19h18" />,
    <circle cx="9" cy="12" r="1" fill="currentColor" />,
    <circle cx="15" cy="12" r="1" fill="currentColor" />,
  ]);
/** S06 attachment mesh: a grid. */
export const IconMesh = () =>
  svg([<rect x="4" y="4" width="16" height="16" rx="1" />, <path d="M4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16" />]);
/** S07 nutrient basket: a cup holding a pellet. */
export const IconBasket = () =>
  svg([<path d="M4 10h16l-2 9H6z" />, <path d="M8 10 10 5M16 10l-2-5" />, <circle cx="12" cy="14.5" r="2" />]);
/** S08 adsorption resin: a block with a fill line. */
export const IconResin = () =>
  svg([<rect x="5" y="5" width="14" height="14" rx="2" />, <path d="M5 13h14" />, <path d="M8 16h2M12 16h4" />]);
/** S09 heater: a coil. */
export const IconHeater = () =>
  svg([<path d="M5 20V9M19 20V9" />, <path d="M5 9c2-3 4 3 7 0s5 3 7 0" />, <path d="M5 14c2-3 4 3 7 0s5 3 7 0" />]);
/** S10 cooler: cooling fins standing on a base. */
export const IconCooler = () =>
  svg([<path d="M3 20h18" />, <path d="M6 20V9M10 20V5M14 20V5M18 20V9" />, <path d="M4 16h16" />]);
/** S11 shade roof: a roof outline over a cell. */
export const IconRoof = () => svg([<path d="M3 11 12 4l9 7" />, <rect x="6" y="11" width="12" height="9" stroke-dasharray="2 2" />]);
/** S12 moisture wick: a strip with a drop. */
export const IconWick = () =>
  svg([<path d="M3 18c4-2 7 2 11 0s5-2 7-1" />, <path d="M12 3c2 3 4 5 4 7.5a4 4 0 0 1-8 0C8 8 10 6 12 3z" />]);
/** Build → Remove: a cross over an edge and a cell. */
export const IconRemoveStructure = () =>
  svg([<rect x="3" y="7" width="10" height="10" rx="1" />, <path d="M17 4v16" />, <path d="m6 10 4 4M10 10l-4 4" />]);
/** The wetting brush: a drop over a gel cell. */
export const IconWet = () =>
  svg([
    <path d="M12 3c2.5 3.5 5 6 5 9a5 5 0 0 1-10 0c0-3 2.5-5.5 5-9z" />,
    <path d="M4 20h16" />,
    <path d="M9.5 13a2.5 2.5 0 0 0 2.5 2.5" />,
  ]);
