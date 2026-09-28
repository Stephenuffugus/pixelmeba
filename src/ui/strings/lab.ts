/**
 * Lab view copy (UX §4.4, P2.7). Every tray item states its purpose, suitable habitats, dose, radius,
 * and what it changes / does not change / what to watch for. Numbers come from CT §4–§5 and §12.2 and
 * SPEC §2.4, §4.1, §10.4, and describe the rules as implemented (src/sim/structures.ts
 * applyHabitatEdit). All amounts are fictional game units. "Watch for" names what may be seen, never
 * a promised outcome.
 */
import type { CommandPayload, CommandResult } from '@sim/commands';

export type LabCategory = 'inspect' | 'life' | 'food' | 'chemistry' | 'habitat' | 'tools' | 'observe';

export const LAB_CATEGORIES: readonly {
  readonly id: LabCategory;
  readonly label: string;
  readonly hint: string;
}[] = [
  { id: 'inspect', label: 'Inspect', hint: 'Tap an organism or a cell to see what is happening there.' },
  { id: 'life', label: 'Life', hint: 'Add organisms. Nothing appears on its own.' },
  { id: 'food', label: 'Food', hint: 'Add food. Nothing refills it for you.' },
  {
    id: 'chemistry',
    label: 'Chemistry',
    hint: 'Add dissolved minerals. More chemistry arrives in a later update.',
  },
  { id: 'habitat', label: 'Habitat', hint: 'Paint water, gel or sediment, or shade the light.' },
  { id: 'tools', label: 'Tools', hint: 'Place and erase structures, keep a snapshot, compare, undo.' },
  { id: 'observe', label: 'Observe', hint: 'Overlays and charts. Looking never changes the dish.' },
];

/** Which enabled materials each tray offers (Chemistry is mineral nutrient only until Phase 3). */
export const FOOD_MATERIALS: readonly string[] = ['SUGAR', 'STARCH', 'DEBRIS'];
export const CHEMISTRY_MATERIALS: readonly string[] = ['NUTRIENT'];

export const RADII = [1, 3, 6] as const;
export type LabRadius = (typeof RADII)[number];
export const COUNTS = [1, 5, 20] as const;
export type LabCount = (typeof COUNTS)[number];

/** The seven "item details" lines (UX §4.4); the radius line is added by the tray. */
export interface ItemCopy {
  readonly name: string;
  readonly purpose: string;
  readonly habitats: string;
  readonly dose: string;
  readonly changes: string;
  readonly unchanged: string;
  readonly watch: string;
}

export type HabitatToolId = 'paint:water' | 'paint:gel' | 'paint:sediment' | 'shade:paint' | 'shade:erase';
export type StructureToolId = 'place:stone' | 'place:wall' | 'place:bead' | 'erase';

const OPEN_CELLS =
  'Any cell inside the rim without a stone, wall or porous bead. Covered cells that have one are crossed out in the preview and skipped.';
const EMPTY_CELLS =
  'Empty cells inside the rim: no organism in the cell and no other structure. Covered cells that are not empty are crossed out in the preview and skipped.';
const MOVED_ASIDE =
  'Anything dissolved or lying in a covered cell is moved, whole, into the nearest open cells on the same side, so no material is lost or made.';
const SAME_PLACE =
  'Organisms, deposits and dissolved amounts stay exactly where they are. Cells under a structure keep their own substrate.';

export const HABITAT_TOOLS: Readonly<Record<HabitatToolId, ItemCopy>> = {
  'paint:water': {
    name: 'Water',
    purpose: 'Paint cells as open water.',
    habitats: OPEN_CELLS,
    dose: 'Replaces the substrate of each covered cell. Adds nothing.',
    changes:
      'The substrate becomes water: dissolved things spread fastest here (0.10 per tick, against 0.025 in gel and 0.01 in sediment) and gas exchange with the air runs at full rate.',
    unchanged: SAME_PLACE,
    watch: 'Food and gases spreading faster through the painted cells; swimmers crossing them.',
  },
  'paint:gel': {
    name: 'Gel',
    purpose: 'Paint cells as soft gel where things spread slowly.',
    habitats: OPEN_CELLS,
    dose: 'Replaces the substrate of each covered cell. Adds nothing.',
    changes:
      'The substrate becomes gel: dissolved things spread a quarter as fast as in water (0.025 per tick instead of 0.10). Gel is an attachment surface.',
    unchanged: SAME_PLACE,
    watch: 'Food released on gel staying close. Organisms that cannot live in gel lose suitability there.',
  },
  'paint:sediment': {
    name: 'Sediment',
    purpose: 'Paint cells as muddy sediment.',
    habitats: OPEN_CELLS,
    dose: 'Replaces the substrate of each covered cell. Adds nothing.',
    changes:
      'The substrate becomes sediment: dissolved things spread a tenth as fast as in water (0.01 per tick) and gas exchange with the air is ten times slower. Sediment is an attachment surface.',
    unchanged: SAME_PLACE,
    watch:
      'Oxygen refilling slowly in sediment. Organisms that cannot live in sediment lose suitability there.',
  },
  'shade:paint': {
    name: 'Shade',
    purpose: 'Dim the light in the cells you paint.',
    habitats: 'Any cell inside the rim.',
    dose: 'Light × 0.1 on each covered cell. Painting again does not darken it further.',
    changes: 'Only the light reaching the covered cells.',
    unchanged: 'No substance is added or moved; nothing else in the cells changes.',
    watch: 'Organisms that make food from light growing more slowly in the shade.',
  },
  'shade:erase': {
    name: 'Remove shade',
    purpose: 'Give shaded cells their full light back.',
    habitats: 'Any cell inside the rim.',
    dose: 'Sets the shade factor of each covered cell back to 1.0.',
    changes: 'Only the light reaching the covered cells, back to the habitat’s own level.',
    unchanged: 'No substance is added or moved; unshaded cells stay as they are.',
    watch: 'Light-feeding organisms making food there again.',
  },
};

export const STRUCTURE_TOOLS: Readonly<Record<StructureToolId, ItemCopy>> = {
  'place:stone': {
    name: 'Stone',
    purpose: 'Place a solid stone.',
    habitats: EMPTY_CELLS,
    dose: 'Fills each covered empty cell.',
    changes: `Covered cells become stone: nothing moves through them, dissolved or alive. Open cells beside a stone become a “stone edge” attachment surface. ${MOVED_ASIDE}`,
    unchanged:
      'Organisms, other structures, the substrate underneath (erasing the stone brings it back) and the total of every material.',
    watch: 'Swimmers going around it, and food spreading around it.',
  },
  'place:wall': {
    name: 'Wall',
    purpose: 'Place an impermeable wall that blocks everything.',
    habitats: `${EMPTY_CELLS} A wall never crosses the rim.`,
    dose: 'Fills each covered empty cell.',
    changes: `Covered cells become wall: food, gases and organisms cannot cross it. ${MOVED_ASIDE}`,
    unchanged:
      'Organisms, other structures, the substrate underneath (erasing the wall brings it back) and the total of every material.',
    watch:
      'Two sides of a closed wall becoming separate little worlds. A pocket with no open neighbour cannot be sealed.',
  },
  'place:bead': {
    name: 'Porous bead',
    purpose: 'Place a porous bead: dissolved things pass, swimmers do not.',
    habitats: EMPTY_CELLS,
    dose: 'Fills each covered empty cell.',
    changes:
      'Covered cells become porous bead. Dissolved things keep spreading through them; free swimmers cannot enter. Beads are an attachment surface.',
    unchanged:
      'Nothing is moved: what the cell held stays and keeps spreading. Organisms and the substrate underneath.',
    watch: 'Food reaching organisms behind a bead line that swimmers cannot cross.',
  },
  erase: {
    name: 'Erase structure',
    purpose: 'Remove stones, walls and porous beads.',
    habitats:
      'Cells with a stone, wall or porous bead (other cells are left alone; the rim is never erased).',
    dose: 'Removes the structure from each covered cell.',
    changes: 'Only the structures: the water, gel or sediment underneath is exactly as it was before.',
    unchanged: 'Nothing is added. A freed stone or wall cell starts empty and fills by ordinary spreading.',
    watch: 'Organisms and food moving through the opening.',
  },
};

export interface MaterialCopy {
  readonly habitats: string;
  readonly changes: string;
  readonly unchanged: string;
  readonly watch: string;
  /** What the dose measures: carbon (C) or nutrient (N). */
  readonly unit: string;
}

/** Material tray copy beyond the content summary (per enabled material id). */
export const MATERIAL_COPY: Readonly<Record<string, MaterialCopy>> = {
  SUGAR: {
    habitats: 'Open water, gel or sediment, and porous beads. It spreads fastest in water.',
    changes: 'Adds dissolved sugar carbon to each covered open cell, logged as an input.',
    unchanged: 'Nothing refills it. Cells under stone or wall are skipped.',
    watch: 'Sugar eaters gathering on it; the patch spreading out and thinning as it is eaten.',
    unit: 'C',
  },
  STARCH: {
    habitats: 'Open water, gel or sediment, and porous beads. It stays where you put it.',
    changes: 'Adds a starch deposit to each covered open cell, logged as an input.',
    unchanged: 'Nothing refills it. It does not dissolve or spread by itself.',
    watch:
      'Organisms that eat starch gathering on it; starch enzyme turning it into sugar that others can eat.',
    unit: 'C',
  },
  DEBRIS: {
    habitats: 'Open water, gel or sediment, and porous beads. It stays where you put it.',
    changes:
      'Adds dead organic material, with 0.10 bound nutrient per carbon, to each covered open cell, logged as an input.',
    unchanged: 'It never turns into living organisms by itself.',
    watch: 'Decomposers gathering on it.',
    unit: 'C',
  },
  NUTRIENT: {
    habitats: 'Open water, gel or sediment, and porous beads. It spreads like sugar.',
    changes: 'Adds free mineral nutrient to each covered open cell, logged as an input.',
    unchanged: 'It is not food: adding nutrient alone creates no growth.',
    watch: 'Growth that was limited by minerals resuming nearby.',
    unit: 'N',
  },
};

export const FALLBACK_MATERIAL_COPY: MaterialCopy = {
  habitats: 'Open cells inside the rim, and porous beads.',
  changes: 'Adds the material to each covered open cell, logged as an input.',
  unchanged: 'Nothing refills it.',
  watch: 'Organisms that use it.',
  unit: '',
};

export const LIFE_COPY = {
  dose: (count: number) => `Up to ${count} organism${count === 1 ? '' : 's'} per tap, spread over the brush.`,
  changes: 'Adds organisms with ordinary starting bodies; their carbon and nutrient are logged as an input.',
  unchanged: 'No food or nutrient comes with them. The rest of the dish is untouched.',
  watch: 'Only cells they can live in are used, and the number actually added is shown.',
};

const SURFACE_NAMES: Readonly<Record<string, string>> = {
  water: 'water',
  gel: 'gel',
  sediment: 'sediment',
  stoneEdge: 'stone edges',
  bead: 'porous beads',
  mesh: 'attachment mesh',
};

function listText(items: readonly string[]): string {
  if (items.length === 0) return '';
  return items.length === 1 ? items[0]! : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]!}`;
}

function capital(text: string): string {
  return text.length > 0 ? `${text[0]!.toUpperCase()}${text.slice(1)}` : text;
}

/** "Water, gel and sediment." from recorded habitats, plus attachment surfaces when attached. */
export function habitatList(
  habitats: readonly string[] | undefined,
  attachment?: readonly string[] | null,
): string {
  if (!habitats || habitats.length === 0) return 'Not recorded for this dish.';
  const text = `${capital(listText(habitats.map((h) => SURFACE_NAMES[h] ?? h)))}.`;
  if (!attachment || attachment.length === 0) return text;
  return `${text} Attached: needs ${listText(attachment.map((a) => SURFACE_NAMES[a] ?? a))}.`;
}

/** Species in this dish that cannot live in `substrate` (from their recorded habitats). */
export function cannotLiveIn(
  substrate: string,
  names: readonly string[],
  habitats: readonly (readonly string[])[] | undefined,
): string[] {
  if (!habitats) return [];
  return names.filter((_, i) => !(habitats[i] ?? []).includes(substrate));
}

// ------------------------------------------------------------------------------------ overlays
export interface OverlayCopy {
  readonly name: string;
  readonly unit: string;
}

/** Overlays offered in Phase 2, in tray order (only those this dish has are listed). */
export const OVERLAYS: readonly { readonly id: string; readonly copy: OverlayCopy }[] = [
  { id: 'sugar', copy: { name: 'Sugar', unit: 'C per cell' } },
  { id: 'nutrient', copy: { name: 'Mineral nutrients', unit: 'N per cell' } },
  { id: 'oxygen', copy: { name: 'Oxygen', unit: 'units per cell' } },
  { id: 'co2', copy: { name: 'Carbon dioxide', unit: 'C per cell' } },
  { id: 'light', copy: { name: 'Light', unit: 'light level (0–1)' } },
  { id: 'starch', copy: { name: 'Starch', unit: 'C per cell' } },
  { id: 'detritus', copy: { name: 'Debris', unit: 'C per cell' } },
  { id: 'eStarch', copy: { name: 'Starch enzyme', unit: 'activity per cell' } },
];

export function overlayCopy(id: string): OverlayCopy {
  return OVERLAYS.find((o) => o.id === id)?.copy ?? { name: id, unit: 'per cell' };
}

// ------------------------------------------------------------------------------------ outcomes
const s = (n: number) => (n === 1 ? '' : 's');

function skippedText(r: CommandResult): string {
  const k = r.skipped;
  if (!k) return '';
  const parts: string[] = [];
  if (k.organism > 0) parts.push(`${k.organism} had an organism in ${k.organism === 1 ? 'it' : 'them'}`);
  if (k.structure > 0) parts.push(`${k.structure} already had a structure`);
  if (k.enclosed > 0)
    parts.push(`${k.enclosed} had no open neighbour to take ${k.enclosed === 1 ? 'its' : 'their'} contents`);
  if (k.rim > 0) parts.push(`${k.rim} ${k.rim === 1 ? 'was' : 'were'} outside the rim`);
  return parts.length > 0 ? ` Skipped: ${parts.join('; ')}.` : '';
}

function movedText(r: CommandResult): string {
  const m = r.moved;
  if (!m) return '';
  const parts: string[] = [];
  if (m.c > 0) parts.push(`${m.c.toFixed(2)} C`);
  if (m.n > 0) parts.push(`${m.n.toFixed(3)} N`);
  if (m.m > 0) parts.push(`${m.m.toFixed(3)} mineral`);
  return parts.length > 0 ? ` ${parts.join(' and ')} moved to the nearest open cells.` : '';
}

/** The announcement after a habitat edit, from the counts the simulation returned. */
export function habitatEditOutcome(p: CommandPayload, r: CommandResult): string {
  switch (p.kind) {
    case 'paintSubstrate':
      return r.accepted === 0
        ? `Nothing painted.${skippedText(r)}`
        : `Painted ${p.substrate} on ${r.accepted} cell${s(r.accepted)}.${skippedText(r)}`;
    case 'paintShade':
      if (r.accepted === 0) return `Nothing shaded.${skippedText(r)}`;
      return p.erase
        ? `Full light back on ${r.accepted} cell${s(r.accepted)}.${skippedText(r)}`
        : `Shaded ${r.accepted} cell${s(r.accepted)} (light × 0.1).${skippedText(r)}`;
    case 'placeStructure': {
      const name = p.structure === 'bead' ? 'porous bead' : p.structure;
      if (r.accepted === 0) return `Nothing placed.${skippedText(r)}`;
      return `Placed ${name} on ${r.accepted} cell${s(r.accepted)}.${movedText(r)}${skippedText(r)}`;
    }
    case 'eraseStructure':
      return r.accepted === 0
        ? 'Nothing to erase here.'
        : `Removed structures from ${r.accepted} cell${s(r.accepted)}; what was underneath is back.`;
    default:
      return '';
  }
}

export const LAB_TEXT = {
  toggle: 'Lab',
  toggleName: 'Lab view',
  toggleHint: 'Switch between Explore and Lab. The dish does not change.',
  enteredLab: 'Lab view: the same dish, with every tool.',
  enteredExplore: 'Explore view: the same dish.',
  toolLabel: 'Tool',
  radius: 'Brush radius',
  dose: 'Dose per cell',
  count: 'How many',
  showTray: 'Details',
  hideTray: 'Hide',
  use: 'Use on the dish',
  pickItem: 'Pick an item to see what it does before you use it.',
  inspectHint: 'Tap an organism or a cell. Drag to move around.',
  lifeHint: 'Tap the dish to place. The tool stays selected.',
  brushHint: 'Drag on the dish to paint; two fingers pan. One stroke is one change.',
  overlayNone: 'None',
  opacity: 'Overlay opacity',
  legendLow: 'low',
  legendHigh: 'high',
  noOverlay: 'No overlay. Pick one to colour the dish by a measured value.',
  charts: 'Charts and history',
  lineage: 'Family tree',
  snapshot: 'Snapshot (save)…',
  duplicate: 'Duplicate dish',
  compare: 'Compare: copy and change one thing',
  undo: 'Undo (rewinds time)',
  details: {
    purpose: 'Purpose',
    habitats: 'Suitable habitats',
    dose: 'Dose',
    radius: 'Radius',
    changes: 'Changes',
    unchanged: 'Does not change',
    watch: 'Watch for',
  },
} as const;
