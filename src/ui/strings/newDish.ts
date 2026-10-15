/**
 * New Dish words for the habitat starts (UX §2.3 "Basics (habitat/recipe picker with preview …)",
 * "Summary states exactly what is preloaded and the total initial ledger"; P5.4; D-0128). The three v1.0
 * preset starts keep their labels and notes verbatim (moved here from NewDish.tsx unchanged). Every line
 * below restates a value the worker's preview measured from the realized dish (NewDishPreview); nothing
 * here estimates anything.
 */
import { plural } from './experiments';

/** The Garden start (FIRST_DISH_V1 as authored). */
export const GARDEN_START = {
  label: 'Little Living Garden',
  note: 'Food patches and four kinds of life, ready to watch.',
} as const;

/** The v1.0 empty preset starts (CT §8.1; P3.2), keyed by their habitat id: labels and notes verbatim. */
export const V1_PRESET_STARTS: Readonly<Record<'WATER_GARDEN' | 'GEL_COLONY' | 'SEDIMENT_EDGE', { readonly id: 'empty' | 'gel' | 'sediment'; readonly label: string; readonly note: string }>> = {
  WATER_GARDEN: {
    id: 'empty',
    label: 'Empty Water Garden',
    note: 'The same water and stones, with nothing living and no food.',
  },
  GEL_COLONY: {
    id: 'gel',
    label: 'Empty Gel Colony',
    note: 'Gel with one water channel and a little sugar everywhere, with nothing living.',
  },
  SEDIMENT_EDGE: {
    id: 'sediment',
    label: 'Empty Sediment Edge',
    note: 'Water above, sediment with debris below and one stone, with nothing living.',
  },
};

/** The Empty / Suggested Community choice (CT §8.2 footnote "Every habitat opens as Empty or as Suggested Community"). */
export const LIFE_CHOICE = {
  label: 'Life',
  empty: 'Empty',
  emptyNote: 'The habitat with nothing living.',
  suggested: 'Suggested Community',
} as const;

/** "Crumbsmith" / "Crumbsmiths" (the species' own name, pluralized as elsewhere in the app). */
export function countOf(n: number, name: string): string {
  return `${n} ${n === 1 ? name : plural(name)}`;
}

/** "a", "a and b", "a, b and c". */
export function listText(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The Suggested Community choice's note: "Five each of Crumbsmiths, Brothmakers … and Amoebae, placed in its regions and shown below." */
export function suggestedNote(names: readonly string[]): string {
  return `Five each of ${listText(names.map(plural))}, placed in its regions and shown below.`;
}

/** The summary's Empty line for a Phase 5 habitat start. */
export const NO_LIFE_YET = 'No life until you add it.';

/**
 * "It places: Attachment mesh (197 cells), Nutrient basket (2), Leaf wafer (2)." from NewDishPreview.habitat.uses;
 * a structure the habitat furnishes over an area is counted in cells. Null when it places nothing.
 */
export function placesLine(
  uses: readonly { readonly id: string; readonly name: string; readonly count: number }[] | undefined,
  furnished: readonly string[],
): string | null {
  if (!uses || uses.length === 0) return null;
  const items = uses.map((u) => (furnished.includes(u.id) ? `${u.name} (${u.count} ${u.count === 1 ? 'cell' : 'cells'})` : `${u.name} (${u.count})`));
  return `It places: ${items.join(', ')}.`;
}

/** "Regions: 1 West wafer, 2 Mesh patch, 3 East wafer." (the numbers on the dish's pins). Null when none. */
export function regionsLine(regions: readonly { readonly label: string; readonly number: number }[] | undefined): string | null {
  if (!regions || regions.length === 0) return null;
  return `Regions: ${regions.map((r) => `${r.number} ${r.label}`).join(', ')}.`;
}

/**
 * "Suggested Community: 5 Crumbsmiths near West wafer, … and 5 Amoebae near Mesh patch." from
 * NewDishPreview.communityGroups (the number actually placed), then the patches it adds ("It also adds: Starch.").
 */
export function communityLine(
  groups: readonly { readonly name: string; readonly count: number; readonly regionLabel: string }[],
  patches: readonly string[],
): string {
  const placed = listText(groups.map((g) => `${countOf(g.count, g.name)} near ${g.regionLabel}`));
  return `${LIFE_CHOICE.suggested}: ${placed}.${patches.length > 0 ? ` It also adds: ${listText(patches)}.` : ''}`;
}
