/**
 * One name per field across screens (wave 13 org-ui; D-0120 carry-over, D-0124): the cell inspector, the region
 * reading (strings/observe.ts MEAN_NAMES) and the inspector's organism lines name a Phase 5 activity field by the
 * field itself, never by a material that adds it (the dish may hold no such material: "Rivalry extract" is M08's
 * product name, used only where the material is meant). The gate sheet's in-sentence words
 * (panels/GateSheet.tsx tallyFieldName, strings/structures.ts RESIN_TARGET_WORDS) are these names in lower case.
 */

/** Sentence-start names (a table row, a list label). */
export const FIELD_NAMES: Readonly<Record<'rival' | 'sGlow' | 'quencher', string>> = {
  rival: 'Rivalry chemical',
  sGlow: 'Glow signal',
  quencher: 'Quencher',
};

/** The same names inside a sentence ("rivalry chemical"). */
export function fieldWord(id: keyof typeof FIELD_NAMES): string {
  return FIELD_NAMES[id].toLowerCase();
}
