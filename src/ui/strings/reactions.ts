/**
 * Reaction ledger copy (P3.6; SPEC §12.1 cell inspector, §5.3 enzymes; UX §5.1). Every sentence is
 * built from measured values in the worker's ReactionRow. Provenance is honest: "Made here by …" only
 * when a producer of that enzyme in the cell or a four-neighbour (where SPEC §5.3 producers emit)
 * released it in the last tick, otherwise "Enzyme present" — the activity may have spread here, been
 * added from the tray, or come from a producer that is not releasing now.
 */
import type { ReactionRow } from '@worker/protocol';

export const REACTION_TEXT = {
  heading: 'Reactions here',
  none: 'No enzyme here.',
  enzymePresent: 'Enzyme present',
  lastSecondNone: 'Nothing was converted here in the last second.',
} as const;

/** Content names of the enzyme materials (M03–M05). */
export const ENZYME_NAMES: Readonly<Record<ReactionRow['enzyme'], string>> = {
  starch: 'Starch enzyme',
  oil: 'Lipid enzyme',
  protein: 'Protein enzyme',
};

const PRODUCT_NAMES: Readonly<Record<ReactionRow['product'], string>> = {
  sugar: 'sugar',
  metabolite: 'metabolite',
  broth: 'broth',
};

/** Fixed decimals for small game-unit amounts: 3 below 10, else 1. */
export function reactionAmount(v: number): string {
  if (!Number.isFinite(v)) return 'not measured';
  if (v === 0) return '0';
  if (Math.abs(v) < 0.001) return v.toExponential(1);
  return Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3);
}

function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Made here by Oilwick" or "Enzyme present" (names in the order given). */
export function provenanceText(madeByNames: readonly string[]): string {
  return madeByNames.length > 0 ? `Made here by ${listNames(madeByNames)}` : REACTION_TEXT.enzymePresent;
}

/** "Activity 0.420, effective 0.210 (enzyme breaker 1.000 here)." */
export function activityText(r: ReactionRow): string {
  if (r.breaker > 0) return `Activity ${reactionAmount(r.activity)}, effective ${reactionAmount(r.effectiveActivity)} (enzyme breaker ${reactionAmount(r.breaker)} here).`;
  return `Activity ${reactionAmount(r.activity)}, all of it effective (no enzyme breaker here).`;
}

/** "Oil here: 0.380 carbon." */
export function substrateText(r: ReactionRow): string {
  const sub = r.enzyme;
  return `${sub.charAt(0).toUpperCase()}${sub.slice(1)} here: ${reactionAmount(r.substrate)} carbon.`;
}

/** Where the bound nutrient goes: into the product, or (oil → metabolite) released as free nutrient. */
function nutrientDestination(r: ReactionRow): string {
  return r.product === 'metabolite' ? 'released as free mineral nutrient' : `moved into the ${PRODUCT_NAMES[r.product]}`;
}

/** "Last second here: 0.040 oil carbon became 0.040 metabolite; 0 bound nutrient released as free mineral nutrient." */
export function lastSecondText(r: ReactionRow): string {
  if (!(r.converted > 0)) return REACTION_TEXT.lastSecondNone;
  return `Last second here: ${reactionAmount(r.converted)} ${r.enzyme} carbon became ${reactionAmount(r.converted)} ${PRODUCT_NAMES[r.product]}; ${reactionAmount(r.nMoved)} bound nutrient ${nutrientDestination(r)}.`;
}

/** "Whole dish: 1.200 carbon converted in the last second (0.120 bound nutrient moved); 54.3 since the dish began." */
export function dishText(r: ReactionRow): string {
  return `Whole dish: ${reactionAmount(r.dishConverted)} ${r.enzyme} carbon converted in the last second (${reactionAmount(r.dishNMoved)} bound nutrient moved); ${reactionAmount(r.cumulative)} since the dish began.`;
}
