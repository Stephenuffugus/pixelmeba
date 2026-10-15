/**
 * Phase 5 wave 14 (P5.7 region pins; UX §9 "a text equivalent"; D-0128): the words of the habitat region legend
 * (src/ui/panels/RegionLegend.tsx). Each region is named by its number (the digit on its pin) and the label its
 * habitat record gives it (DishInfo.regions, the dish's own recorded habitat). Nothing here measures anything.
 */

/** One region as the legend names it. */
export interface LegendRegion {
  readonly number: number;
  readonly label: string;
}

export const REGION_TEXT = {
  title: 'Habitat regions',
  /** The list's accessible name. */
  listLabel: 'Habitat regions, numbered as their pins on the dish',
  note: 'The numbered pins on the dish mark where each region of this habitat is. They are part of the habitat, not probe regions.',
} as const;

/** One list item: "1 Fresh pool". */
export function regionLegendItem(r: LegendRegion): string {
  return `${r.number} ${r.label}`;
}

/** The legend as one sentence ("Habitat regions: 1 Fresh pool · 2 Brine pool · 3 Channel."), or null for none. */
export function regionLegendText(regions: readonly LegendRegion[]): string | null {
  if (regions.length === 0) return null;
  return `${REGION_TEXT.title}: ${regions.map(regionLegendItem).join(' · ')}.`;
}
