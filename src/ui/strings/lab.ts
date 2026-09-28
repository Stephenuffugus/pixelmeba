/**
 * Lab view copy (UX §4.4, P2.7). Every tray item states its purpose, suitable habitats, dose, radius,
 * and what it changes / does not change / what to watch for. Numbers come from CT §4–§5 and SPEC
 * §4, §10.4 and describe the rules as implemented (src/sim/structures.ts applyHabitatEdit); all
 * amounts are fictional game units.
 */
import type { CommandPayload, CommandResult } from '@sim/commands';

export type LabCategory = 'inspect' | 'life' | 'food' | 'chemistry' | 'habitat' | 'tools' | 'observe';

export const LAB_CATEGORIES: readonly { readonly id: LabCategory; readonly label: string; readonly hint: string }[] = [
  { id: 'inspect', label: 'Inspect', hint: 'Tap an organism or a cell to see what is happening there.' },
  { id: 'life', label: 'Life', hint: 'Add organisms. Nothing appears on its own.' },
  { id: 'food', label: 'Food', hint: 'Add food. Nothing refills it for you.' },
  { id: 'chemistry', label: 'Chemistry', hint: 'Add dissolved minerals. More chemistry arrives in a later update.' },
  { id: 'habitat', label: 'Habitat', hint: 'Paint water, gel or sediment, or shade the light.' },
  { id: 'tools', label: 'Tools', hint: 'Place and erase structures, keep a snapshot, compare, undo.' },
  { id: 'observe', label: 'Observe', hint: 'Overlays, charts and family history. Looking never changes the dish.' },
];

/** Which enabled materials each tray offers (Chemistry is nutrient only until Phase 3). */
export const FOOD_MATERIALS = ['SUGAR', 'STARCH', 'DEBRIS'] as const;
export const CHEMISTRY_MATERIALS = ['NUTRIENT'] as const;

export const RADII = [1, 3, 6] as const;
export type LabRadius = (typeof RADII)[number];
export const COUNTS = [1, 5, 20] as const;
export type LabCount = (typeof COUNTS)[number];

/** The seven "item details" lines (UX §4.4). */
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

const OPEN_CELLS = 'Any cell inside the rim without a stone, wall or porous bead.';
const EMPTY_CELLS = 'Empty cells inside the rim: no organism there and no other structure. Covered cells that are not empty are crossed out in the preview and skipped.';
const MOVED_ASIDE =
  'Anything dissolved or lying in a covered cell is moved, whole, into the nearest open cells on the same side, so no material is lost.';

export const HABITAT_TOOLS: Readonly<Record<HabitatToolId, ItemCopy>> = {
  'paint:water': {
    name: 'Water',
    purpose: 'Paint cells as open water.',
    habitats: OPEN_CELLS,
    dose: 'Replaces the substrate of each covered cell; adds nothing.',
    changes: 'The substrate becomes water: dissolved things spread fastest here (0.10 per tick) and gas exchange with the air runs at full rate.',
    unchanged: 'Life, deposits and dissolved amounts stay exactly where they are. Cells under a structure keep their substrate.',
    watch: 'Food and gases spread faster through the painted cells; swimmers can cross them.',
  },
  'paint:gel': {
    name: 'Gel',
    purpose: 'Paint cells as soft gel where things spread slowly.',
    habitats: OPEN_CELLS,
    dose: 'Replaces the substrate of each covered cell; adds nothing.',
    changes: 'The substrate becomes gel: dissolved things spread a quarter as fast as in water (0.025 per tick instead of 0.10).',
    unchanged: 'Life, deposits and dissolved amounts stay exactly where they are. Cells under a structure keep their substrate.',
    watch: 'Food released on gel stays close. Species that cannot live in gel lose suitability there.',
  },
  'paint:sediment': {
    name: 'Sediment',
    purpose: 'Paint cells as muddy sediment.',
    habitats: OPEN_CELLS,
    dose: 'Replaces the substrate of each covered cell; adds nothing.',
    changes: 'The substrate becomes sediment: dissolved things spread a tenth as fast as in water (0.01 per tick) and gas exchange with the air is ten times slower.',
    unchanged: 'Life, deposits and dissolved amounts stay exactly where they are. Cells under a structure keep their substrate.',
    watch: 'Oxygen refills slowly in sediment. Species that cannot live in sediment lose suitability there.',
  },
  'shade:paint': {
    name: 'Shade',
    purpose: 'Dim the light in the cells you paint.',
    habitats: 'Any cell inside the rim.',
    dose: 'Light × 0.1 on each covered cell. Painting again does not darken it further.',
    changes: 'Only the light reaching the covered cells.',
    unchanged: 'No substance is added or moved; nothing else in the cells changes.',
    watch: 'Organisms that make food from light grow more slowly in the shade.',
  },
  'shade:erase': {
    name: 'Remove shade',
    purpose: 'Give painted-over cells their full light back.',
    habitats: 'Any cell inside the rim.',
    dose: 'Sets the shade factor of each covered cell back to 1.0.',
    changes: 'Only the light reaching the covered cells, back to the habitat’s own level.',
    unchanged: 'No substance is added or moved; unshaded cells stay as they are.',
    watch: 'Light-feeding organisms can make food there again.',
  },
};

export const STRUCTURE_TOOLS: Readonly<Record<StructureToolId, ItemCopy>> = {
  'place:stone': {
    name: 'Stone',
    purpose: 'Place a solid stone.',
    habitats: EMPTY_CELLS,
    dose: 'Fills each covered empty cell.',
    changes: `Covered cells become stone: nothing moves through them, dissolved or alive. ${MOVED_ASIDE}`,
    unchanged: 'Organisms, other structures and the substrate underneath (erasing the stone brings it back). Totals of every material.',
    watch: 'Swimmers go around it and food spreads around it.',
  },
  'place:wall': {
    name: 'Wall',
    purpose: 'Place an impermeable wall that blocks everything.',
    habitats: `${EMPTY_CELLS} A wall never crosses the rim.`,
    dose: 'Fills each covered empty cell.',
    changes: `Covered cells become wall: food, gases and organisms cannot cross it. ${MOVED_ASIDE}`,
    unchanged: 'Organisms, other structures and the substrate underneath (erasing the wall brings it back). Totals of every material.',
    watch: 'Two sides of a closed wall become separate little worlds. A pocket with no open neighbour cannot be sealed.',
  },
  'place:bead': {
    name: 'Porous bead',
    purpose: 'Place a porous bead: solutes pass, swimmers do not.',
    habitats: EMPTY_CELLS,
    dose: 'Fills each covered empty cell.',
    changes: 'Covered cells become porous bead. Dissolved things keep spreading through them; free swimmers cannot enter.',
    unchanged: 'Nothing is moved: what the cell held stays and keeps spreading. Organisms and the substrate underneath.',
    watch: 'Food can reach organisms behind a bead line while swimmers cannot follow it.',
  },
  erase: {
    name: 'Erase structure',
    purpose: 'Remove stones, walls and porous beads.',
    habitats: 'Cells with a stone, wall or porous bead (others are left alone).',
    dose: 'Removes the structure from each covered cell.',
    changes: 'Only the structures: the water, gel or sediment underneath is exactly as it was before.',
    unchanged: 'Nothing is added. A freed cell starts empty and fills by ordinary spreading.',
    watch: 'Organisms and food can move through the opening.',
  },
};

/** Material tray copy beyond the content summary (per enabled material id). */
export const MATERIAL_COPY: Readonly<Record<string, { readonly habitats: string; readonly changes: string; readonly unchanged: string; readonly watch: string; readonly unit: string }>> = {
  SUGAR: {
    habitats: 'Open water, gel or sediment, and porous beads. It spreads fastest in water.',
    changes: 'Adds sugar carbon to each covered open cell, logged as an input.',
    unchanged: 'Nothing refills it. Cells under stone or wall are skipped.',
    watch: 'Sugar eaters find it and grow; the patch spreads out and thins as it is eaten.',
    unit: 'C',
  },
  STARCH: {
    habitats: 'Open water, gel or sediment, and porous beads. It stays where you put it.',
    changes: 'Adds a stationary starch deposit to each covered open cell, logged as an input.',
    unchanged: 'Nothing refills it. It does not dissolve or spread by itself.',
    watch: 'Recyclers eat it directly; starch enzyme turns it into sugar that anyone nearby can eat.',
    unit: 'C',
  },
  DEBRIS: {
    habitats: 'Open water, gel or sediment, and porous beads. It stays where you put it.',
    changes: 'Adds dead material with 0.10 bound nutrient per carbon to each covered open cell, logged as an input.',
    unchanged: 'It never turns into living organisms by itself.',
    watch: 'Decomposers such as Recyclers gather on it.',
    unit: 'C',
  },
  NUTRIENT: {
    habitats: 'Open water, gel or sediment, and porous beads. It spreads like sugar.',
    changes: 'Adds free mineral nutrient to each covered open cell, logged as an input.',
    unchanged: 'It is not food: adding nutrient alone creates no growth.',
    watch: 'Growth that was limited by minerals can resume nearby.',
    unit: 'N',
  },
};

export const FALLBACK_MATERIAL_COPY = {
  habitats: 'Open cells inside the rim.',
  changes: 'Adds the material to each covered open cell, logged as an input.',
  unchanged: 'Nothing refills it.',
  watch: 'Look for organisms that use it.',
  unit: '',
};

export const LIFE_COPY = {
  dose: (count: number) => `Up to ${count} organism${count === 1 ? '' : 's'} per tap, spread over the brush.`,
  changes: 'Adds organisms with ordinary starting bodies; their carbon and nutrient are logged as an input.',
  unchanged: 'No food or nutrient comes with them. The rest of the dish is untouched.',
  watch: 'Only cells they can live in are used, and the number actually added is shown.',
};

export const HABITAT_NAMES: Readonly<Record<string, string>> = { water: 'water', gel: 'gel', sediment: 'sediment' };

/** "Water, gel and sediment" from a recorded habitat list. */
export function habitatList(habitats: readonly string[] | undefined): string {
  if (!habitats || habitats.length === 0) return 'Not recorded for this dish.';
  const names = habitats.map((h) => HABITAT_NAMES[h] ?? h);
  const text = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;
  return `${text[0]!.toUpperCase()}${text.slice(1)}.`;
}

/** Species in this dish that cannot live in `substrate` (from their recorded habitats). */
export function cannotLiveIn(substrate: string, names: readonly string[], habitats: readonly (readonly string[])[] | undefined): string[] {
  if (!habitats) return [];
  return names.filter((_, i) => !(habitats[i] ?? []).includes(substrate));
}

// ------------------------------------------------------------------------------------ overlays
export interface OverlayCopy {
  readonly name: string;
  readonly unit: string;
}

/** Overlays offered in Phase 2, in tray order (only those whose field exists in this dish). */
export const OVERLAYS: readonly { readonly id: string; readonly copy: OverlayCopy }[] = [
  { id: 'sugar', copy: { name: 'Sugar', unit: 'C per cell' } },
  { id: 'nutrient', copy: { name: 'Mineral nutrients', unit: 'N per cell' } },
  { id: 'oxygen', copy: { name: 'Oxygen', unit: 'per cell' } },
  { id: 'co2', copy: { name: 'Carbon dioxide', unit: 'C per cell' } },
  { id: 'light', copy: { name: 'Light', unit: 'light level' } },
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
  if (k.enclosed > 0) parts.push(`${k.enclosed} had no open neighbour to take ${k.enclosed === 1 ? 'its' : 'their'} contents`);
  if (k.rim > 0) parts.push(`${k.rim} ${k.rim === 1 ? 'was' : 'were'} outside the rim`);
  return parts.length > 0 ? ` Skipped: ${parts.join('; ')}.` : '';
}

/** The toast after a habitat edit, from the counts the simulation returned. */
export function habitatEditOutcome(p: CommandPayload, r: CommandResult): string {
  switch (p.kind) {
    case 'paintSubstrate':
      return r.accepted === 0 ? `Nothing painted.${skippedText(r)}` : `Painted ${p.substrate} on ${r.accepted} cell${s(r.accepted)}.${skippedText(r)}`;
    case 'paintShade':
      if (r.accepted === 0) return `Nothing shaded.${skippedText(r)}`;
      return p.erase ? `Full light back on ${r.accepted} cell${s(r.accepted)}.` : `Shaded ${r.accepted} cell${s(r.accepted)} (light × 0.1).${skippedText(r)}`;
    case 'placeStructure': {
      const name = p.structure === 'bead' ? 'porous bead' : p.structure;
      if (r.accepted === 0) return `Nothing placed.${skippedText(r)}`;
      const moved = r.moved && r.moved.c > 0 ? ` ${r.moved.c.toFixed(2)} C of material moved to the nearest open cells.` : '';
      return `Placed ${name} on ${r.accepted} cell${s(r.accepted)}.${moved}${skippedText(r)}`;
    }
    case 'eraseStructure':
      return r.accepted === 0 ? 'Nothing to erase here.' : `Removed structures from ${r.accepted} cell${s(r.accepted)}; what was underneath is back.`;
    default:
      return '';
  }
}

export const LAB_TEXT = {
  toggle: 'Lab',
  toggleHint: 'Switch between Explore and Lab. The dish does not change.',
  enteredLab: 'Lab view — the same dish, with every tool.',
  enteredExplore: 'Explore view — the same dish.',
  toolLabel: 'Tool',
  radius: 'Brush radius',
  dose: 'Dose per cell',
  count: 'How many',
  showTray: 'Show details',
  hideTray: 'Hide tray',
  inspectHint: 'Tap an organism or a cell. Drag to move around.',
  lifeHint: 'Tap the dish to place. The tool stays selected.',
  brushHint: 'Drag on the dish to paint; two fingers pan. One stroke is one change.',
  droppedStroke: 'That stroke was not applied: the view changed before you let go.',
  overlayNone: 'None',
  opacity: 'Overlay opacity',
  legendLow: 'low',
  legendHigh: 'high',
  noOverlay: 'No overlay. Pick one to colour the dish by a measured value.',
  charts: 'Charts',
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
