/**
 * Lab view copy (UX §4.4, P2.7). Every tray item states its purpose, suitable habitats, dose, radius,
 * and what it changes / does not change / what to watch for. Numbers come from CT §4–§5 and §12.2 and
 * SPEC §2.4, §4.1, §10.4, and describe the rules as implemented (src/sim/structures.ts
 * applyHabitatEdit). All amounts are fictional game units. "Watch for" names what may be seen, never
 * a promised outcome.
 */
import type { CommandPayload, CommandResult } from '@sim/commands';
import { NOT_IN_DISH } from '@sim/grid';
import { inSentence, paintName, structureName, structureNames } from '../panels/LabTrayNames';

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
    hint: 'Change the water: minerals, gases, pH, salt and inhibitors. Each item says what it changes and what it leaves alone.',
  },
  { id: 'habitat', label: 'Habitat', hint: 'Paint water, gel or sediment, shade the light, or close the lid.' },
  { id: 'tools', label: 'Tools', hint: 'Place and erase structures, keep a snapshot, compare, undo.' },
  { id: 'observe', label: 'Observe', hint: 'Overlays and charts. Looking never changes the dish.' },
];

/**
 * Which materials each tray offers, in tray order (CT §5.1; P3.1). A dish shows only those its
 * recorded content enables; each needs a MATERIAL_COPY entry. Enzymes and the enzyme breaker join the
 * Chemistry tray with their system (P3.6).
 */
export const FOOD_MATERIALS: readonly string[] = ['SUGAR', 'STARCH', 'OIL', 'PROTEIN', 'DEBRIS', 'METABOLITE', 'M01'];
export const CHEMISTRY_MATERIALS: readonly string[] = [
  'NUTRIENT',
  'OXYGEN',
  'CO2',
  'ACID',
  'BASE',
  'BUFFER',
  'SALT',
  'INH_BACT',
  'INH_FUNG',
  'INH_PHOTO',
  // P3.6: enzymes and the enzyme breaker (CT §5.2).
  'M03',
  'M04',
  'M05',
  'M09',
];

/**
 * Finite food objects in the Food tray (CT §5.2 M10, M11; P3.6): one object per tap, never a brush.
 * Their tools are `object:<id>`; the Explore Feed keeps its own foods (UX §4.3).
 */
export const FOOD_OBJECTS: readonly string[] = ['M10', 'M11'];

/** Food object copy beyond the content summary (CT §5.2; objects.ts FOOD_OBJECT_RULES). */
export const OBJECT_COPY: Readonly<Record<string, Omit<ItemCopy, 'name' | 'purpose'>>> = {
  M10: {
    habitats: 'Any open cell inside the rim: water, gel or sediment. Not on a stone, wall or bead, and not on another food object.',
    dose: 'One pellet per tap: 10 sugar carbon and 1 bound nutrient, logged as an input.',
    changes:
      'Each second it lets 0.02 sugar carbon, with its share of the nutrient, into its own cell, for about 500 seconds. Then it is gone and a stain fades where it was.',
    unchanged: 'It never moves, spreads or refills, and nothing eats it directly; organisms eat the sugar it lets out. Organisms in the cell do not stop it being placed.',
    watch: 'Its outline shrinking as it empties, and sugar eaters gathering in the haze around it.',
  },
  M11: {
    habitats: 'Any open cell inside the rim: water, gel or sediment. Not on a stone, wall or bead, and not on another food object.',
    dose: 'One wafer per tap: 6 starch carbon, 4 protein carbon and 1 bound nutrient, logged as an input.',
    changes:
      'Each second it leaves 0.012 starch carbon and 0.008 protein carbon in its own cell as deposits, each with 0.10 nutrient per carbon, for about 500 seconds. Then it is gone and a stain fades where it was.',
    unchanged: 'It never moves, spreads or refills, and nothing eats it directly. Starch and protein stay deposits until something eats or converts them.',
    watch: 'Its outline shrinking, and the starch and protein in its cell (the cell inspector lists what the wafer still holds).',
  },
};

/** The announcement after a food object tap, from the simulation's own result. `name` is the content name. */
export function objectOutcome(r: CommandResult, name: string): string {
  if (r.accepted > 0) return `Placed one ${inSentence(name)}.`;
  const note = r.note ?? '';
  if (note.endsWith(NOT_IN_DISH)) return `Not placed: food objects are not in this dish’s recorded content.`;
  if (note.startsWith('The dish holds')) return `Not placed: ${note}.`;
  if (note.startsWith('a food object')) return 'Not placed: this cell already holds a food object.';
  if (note.startsWith('a structure')) return 'Not placed: a stone, wall or bead is in this cell.';
  if (note === 'outside the dish') return 'Not placed: that is outside the rim.';
  return note ? `Not placed: ${note}.` : 'Not placed.';
}

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
  /**
   * Habitat paints only: which of this dish's organisms can live in the painted substrate, computed
   * from the world's recorded species habitats (livesHereText), so the content rules text never has to
   * name organisms.
   */
  readonly lives?: string;
}

export type HabitatToolId = 'paint:water' | 'paint:gel' | 'paint:sediment' | 'shade:paint' | 'shade:erase';
export type StructureToolId = 'place:stone' | 'place:wall' | 'place:bead' | 'erase';

const OPEN_CELLS =
  'Any cell inside the rim without a stone, wall or porous bead. Covered cells that have one are crossed out in the preview and skipped.';
const EMPTY_CELLS =
  'Empty cells inside the rim: no organism in the cell and no other structure. Covered cells that are not empty are crossed out in the preview and skipped.';
const ANY_CELL = 'Any cell inside the rim.';

/**
 * UI chrome for the habitat and structure brushes: what each kind of edit does to the cells it covers
 * (the rules in src/sim/structures.ts applyHabitatEdit). Each item's own name, purpose, rules text and
 * example come from its content record (src/ui/panels/LabTrayContent.tsx), never from here.
 */
export const BRUSH_COPY = {
  substrate: {
    habitats: OPEN_CELLS,
    dose: 'Replaces the substrate of each covered cell. Adds nothing.',
    unchanged:
      'Organisms, deposits and dissolved amounts stay exactly where they are. Cells under a structure keep their own substrate.',
  },
  shade: {
    habitats: ANY_CELL,
    dose: (factor: number) =>
      `Light × ${factor} on each covered cell. Painting again does not darken it further.`,
    unchanged: 'No substance is added or moved; nothing else in the cells changes.',
  },
  place: {
    habitats: EMPTY_CELLS,
    wallHabitats: `${EMPTY_CELLS} A wall never crosses the rim.`,
    dose: 'Fills each covered empty cell.',
    sealedUnchanged:
      'The total of every material: anything dissolved or lying in a covered cell is moved, whole, into the nearest open cells on the same side. Organisms, other structures and the substrate underneath (erasing brings it back).',
    beadUnchanged:
      'Nothing is moved: what the cell held stays and keeps spreading. Organisms, other structures and the substrate underneath.',
  },
} as const;

/** The shade paint's erase mode (a mode of the tool, not a content item). */
export const SHADE_ERASE: ItemCopy = {
  name: 'Remove shade',
  purpose: 'Give shaded cells their full light back.',
  habitats: ANY_CELL,
  dose: 'Sets the shade factor of each covered cell back to 1.0.',
  changes: 'Only the light reaching the covered cells, back to the habitat’s own level.',
  unchanged: 'No substance is added or moved; unshaded cells stay as they are.',
  watch: 'Light-feeding organisms making food there again.',
};

/** Erasing structures (a tool, not a content item). */
export const ERASE_STRUCTURE: ItemCopy = {
  name: 'Erase structure',
  purpose: 'Remove stones, walls and porous beads.',
  habitats: 'Cells with a stone, wall or porous bead (other cells are left alone; the rim is never erased).',
  dose: 'Removes the structure from each covered cell.',
  changes: 'Only the structures: the water, gel or sediment underneath is exactly as it was before.',
  unchanged: 'Nothing is added. A freed stone or wall cell starts empty and fills by ordinary spreading.',
  watch: 'Organisms and food moving through the opening.',
};

export interface MaterialCopy {
  readonly habitats: string;
  readonly changes: string;
  readonly unchanged: string;
  readonly watch: string;
  /** What the dose measures: carbon (C) or nutrient (N). */
  readonly unit: string;
}

const STAYS_PUT = 'Open water, gel or sediment, and porous beads. It stays where you put it.';
const SPREADS = 'Open water, gel or sediment, and porous beads. It spreads like sugar: fast in water, slowly in gel and sediment.';
const PH_RULE = 'Shown pH = 7 + (base − acid) / (1 + buffer), kept between 2 and 12; each tick equal amounts of acid and base cancel out.';

/** The three abstract inhibitors (CT §3.4; SPEC §4.3): one category each, the same rules. */
function inhibitorCopy(who: string, unaffected: string, watch: string): MaterialCopy {
  return {
    habitats: SPREADS,
    changes: `Adds an abstract inhibitor to each covered open cell; it loses 0.2 % of its amount each tick. ${who} there grow × 1 / (1 + exposure) and lose 8 × exposure health each second; biofilm in a cell halves the exposure once.`,
    unchanged: `${unaffected} No food, carbon or nutrient.`,
    watch,
    unit: 'units',
  };
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
    changes:
      'Adds free mineral nutrient to each covered open cell, logged as an input. New body needs nutrient as well as food, so where minerals are what limits growth it can let that growth go on.',
    unchanged:
      'It is not food: it adds no carbon and no energy, so organisms still need food to grow. Where minerals are not the limit, it changes nothing else.',
    watch: 'Where the inspector says growth is limited by minerals, whether growth goes on nearby.',
    unit: 'N',
  },
  OIL: {
    habitats: STAYS_PUT,
    changes: 'Adds an oil deposit (carbon, no minerals) to each covered open cell, logged as an input.',
    unchanged: 'Nothing refills it. It does not dissolve or spread by itself.',
    watch: 'Organisms that eat oil gathering on it.',
    unit: 'C',
  },
  PROTEIN: {
    habitats: STAYS_PUT,
    changes: 'Adds a protein deposit (carbon, no minerals) to each covered open cell, logged as an input.',
    unchanged: 'Nothing refills it. It does not dissolve or spread by itself.',
    watch: 'Organisms that eat protein gathering on it.',
    unit: 'C',
  },
  METABOLITE: {
    habitats: SPREADS,
    changes: 'Adds dissolved metabolite carbon (no minerals) to each covered open cell, logged as an input.',
    unchanged: 'Nothing refills it. Only organisms that list metabolite as food can eat it.',
    watch: 'Metabolite eaters gathering on it; the patch spreading out and thinning.',
    unit: 'C',
  },
  OXYGEN: {
    habitats: SPREADS,
    changes:
      'Adds dissolved oxygen to each covered open cell. Oxygen is not one of the counted materials (carbon, nutrient, mineral), so it is not logged as an input.',
    unchanged:
      'No food, carbon or nutrient. With the lid open every cell drifts back toward 0.8 oxygen by 0.02 of the difference each tick (sediment ten times slower).',
    watch: 'Eaters that were short of oxygen feeding faster nearby, until the extra spreads away.',
    unit: 'O2',
  },
  CO2: {
    habitats: SPREADS,
    changes: 'Adds dissolved carbon dioxide to each covered open cell; it is carbon, logged as an input.',
    unchanged:
      'It is not food for eaters. With the lid open every cell drifts back toward 0.5 by 0.02 of the difference each tick (sediment ten times slower).',
    watch: 'Algae growing faster where light, nutrient and carbon dioxide meet.',
    unit: 'C',
  },
  ACID: {
    habitats: SPREADS,
    changes: `Adds acid equivalents to each covered open cell, lowering pH. ${PH_RULE}`,
    unchanged: 'No food, carbon or nutrient. Nothing refills it.',
    watch: 'The pH line in the cell inspector; organisms outside their preferred pH becoming stressed.',
    unit: 'acid',
  },
  BASE: {
    habitats: SPREADS,
    changes: `Adds base equivalents to each covered open cell, raising pH. ${PH_RULE}`,
    unchanged: 'No food, carbon or nutrient. Nothing refills it.',
    watch: 'The pH line in the cell inspector moving back toward 7 where there was acid.',
    unit: 'base',
  },
  BUFFER: {
    habitats: SPREADS,
    changes: `Adds buffer to each covered open cell. It does not move pH by itself: it divides how far base and acid move it. ${PH_RULE}`,
    unchanged: 'No food, carbon or nutrient, and no acid or base. Nothing refills it.',
    watch: 'The same acid moving the pH line less where there is buffer.',
    unit: 'buffer',
  },
  SALT: {
    habitats: SPREADS,
    changes:
      'Adds salt to each covered open cell. Salinity is the salt amount (it can go above 1); it spreads and never decays.',
    unchanged: 'No food, carbon or nutrient. Nothing removes it by itself.',
    watch: 'Organisms outside their preferred salinity becoming stressed while salt-tolerant ones carry on.',
    unit: 'salt',
  },
  INH_BACT: inhibitorCopy('Bacteria', 'Yeasts, fungi, algae, consumers, parasites and viruses are not affected.', 'Bacteria nearby slowing or dying while other organisms carry on.'),
  INH_FUNG: inhibitorCopy('Yeasts and fungi', 'Bacteria, algae, consumers, parasites and viruses are not affected.', 'Yeasts and fungi nearby slowing or dying while other organisms carry on.'),
  INH_PHOTO: inhibitorCopy('Algae', 'Bacteria, yeasts, fungi, consumers, parasites and viruses are not affected.', 'Algae nearby slowing or dying while other organisms carry on.'),
  // P3.6 (CT §5.2; SPEC §5.3): soluble broth, the three enzymes and the enzyme breaker.
  M01: {
    habitats: SPREADS,
    changes: 'Adds dissolved broth carbon with 0.10 bound nutrient per carbon to each covered open cell, logged as an input.',
    unchanged: 'Nothing refills it. Only organisms that list broth as food can eat it.',
    watch: 'Broth eaters such as Brothmakers and Creambuds feeding on it; the patch spreading out and thinning.',
    unit: 'C',
  },
  M03: enzymeCopy('starch', 'sugar'),
  M04: enzymeCopy('oil', 'metabolite'),
  M05: enzymeCopy('protein', 'broth'),
  M09: {
    habitats: SPREADS,
    changes:
      'Adds enzyme breaker to each covered open cell. It spreads like sugar and loses 1 % of its amount each second. In its cell every enzyme works at activity / (1 + breaker), so breaker 1.0 halves starch, oil and protein conversion there.',
    unchanged: 'It removes no enzyme and no food, and adds no carbon or nutrient. Organisms still release enzyme as before.',
    watch: 'The reaction ledger in the cell inspector: effective activity and carbon converted falling where breaker is.',
    unit: 'activity',
  },
};

/** Copy for an enzyme material (M03–M05): it converts `substrate` deposits into dissolved `product`. */
function enzymeCopy(substrate: string, product: string): MaterialCopy {
  return {
    habitats: 'Open water, gel or sediment, and porous beads. It spreads at half the rate of sugar.',
    changes: `Adds ${substrate} enzyme activity to each covered open cell; it loses 2 % of its activity each second. Each second it turns up to 0.10 × its effective activity of ${substrate} carbon in its cell, with any bound nutrient, into ${product}.`,
    unchanged: `It adds no carbon or nutrient and never converts living organisms. Without ${substrate} in the cell it does nothing.`,
    watch: `The reaction ledger in the cell inspector (${substrate} converted, ${product} made), and ${product} eaters gathering nearby.`,
    unit: 'activity',
  };
}

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
  /** The diet line's label in the Life tray details (W2-13). */
  dietLabel: 'Diet',
  /**
   * Diet lines (UX §4.3, W2-13), derived from the dish's own species records by
   * src/ui/panels/LabTrayContent.tsx dietLine. Food names are the trays' words for each food field.
   */
  diet: {
    foods: { sugar: 'sugar', starch: 'starch', oil: 'oil', protein: 'protein', broth: 'broth', detritus: 'debris', metabolite: 'metabolite', film: 'film' } as Readonly<Record<string, string>>,
    light: 'Makes food from light.',
    mixotroph: (foods: string) => `Makes food from light; eats ${foods} when it is dim.`,
    eats: (foods: string, anaerobic: boolean, film: boolean) =>
      `Eats ${foods}${anaerobic ? ' without oxygen' : ''}${film ? ', and digests film' : ''}.`,
    nothing: 'Eats nothing it can find in this dish.',
    free: 'only free-swimming',
    inSediment: 'only in sediment',
    absent: (n: number) => `${n} kind${n === 1 ? '' : 's'} not in this dish`,
    noneHere: (verb: string, n: number) => `${verb} ${n} kind${n === 1 ? '' : 's'}, none of them in this dish.`,
  },
  /** Phage doses (SPEC §10.2, W2-14): the count is viral units added to every covered cell. */
  phageCountLabel: 'Units per cell',
  phageDose: (count: number, name: string) => `Adds ${count} ${name} unit${count === 1 ? '' : 's'} to every covered cell.`,
  phageTile: (count: number) => `${count} unit${count === 1 ? '' : 's'} per cell`,
  phageCountNote: (name: string) => `For ${name}, this is the number of units added to every covered cell.`,
  phageHabitats: 'Open cells inside the rim, and porous beads.',
  phageChanges: 'Adds viral units to each covered cell, no organisms; their carbon (0.01 C per unit) is logged as an input.',
  phageUnchanged: 'Units infect only their listed hosts. Nothing else in the dish is touched.',
  phageWatch: 'Hosts nearby becoming infected. Without a host, units only decay.',
  phageAdded: (count: number, name: string, cells: number) =>
    `Added ${count} ${name} unit${count === 1 ? '' : 's'} ${cells === 1 ? 'to 1 cell' : `to each of ${cells} cells`}.`,
  phageNone: (name: string) => `No open cells here for ${name}.`,
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

function orText(items: readonly string[]): string {
  if (items.length === 0) return '';
  return items.length === 1 ? items[0]! : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]!}`;
}

/** Structure record IDs that provide an attachment surface (CT §4: porous bead; attachment mesh S06). */
const SURFACE_STRUCTURES: Readonly<Record<string, string>> = { bead: 'BEAD', mesh: 'S06' };

/** What livesHereText may also know about the dish (W2-03). */
export interface LivesHereOptions {
  /** Each species' recorded attachment surfaces (null = free-living), in `names` order. */
  readonly attachment?: readonly (readonly string[] | null)[] | undefined;
  /** Structure record IDs the dish enables: a bead or mesh surface is named only when it can be there. */
  readonly structureIds?: readonly string[] | undefined;
}

/**
 * The "Lives here in this dish" line of a habitat paint: the dish's organisms whose recorded habitats
 * include `substrate` (the simulation's habitat rule for an open cell, src/sim/suitability.ts
 * habitatCompatible), then those that cannot live there. Specifics come from the world's species
 * records, never from the paint's rules text; `label` is the paint's content name in a sentence.
 * With `opts.attachment` (W2-03, D-0006): an attached species whose surfaces do not include this
 * substrate is named with the surfaces it needs there ("Velvet lives in water only on stone edges or
 * porous beads."), never as living in the open substrate; one with no such surface in this dish
 * cannot live there.
 */
export function livesHereText(
  substrate: string,
  names: readonly string[],
  habitats: readonly (readonly string[])[] | undefined,
  label = substrate,
  opts: LivesHereOptions = {},
): string {
  if (!habitats || names.length === 0) return 'Not recorded for this dish.';
  const cannot = cannotLiveIn(substrate, names, habitats);
  const plain: string[] = [];
  const onSurface = new Map<string, string[]>();
  names.forEach((n, i) => {
    if (!(habitats[i] ?? []).includes(substrate)) return;
    const surfaces = opts.attachment?.[i];
    if (!surfaces || surfaces.includes(substrate)) {
      plain.push(n);
      return;
    }
    const spots = surfaces.filter((s) => {
      if (s === 'water' || s === 'gel' || s === 'sediment') return false;
      const st = SURFACE_STRUCTURES[s];
      return st === undefined || (opts.structureIds ?? []).includes(st);
    });
    if (spots.length === 0) {
      cannot.push(n);
      return;
    }
    const where = orText(spots.map((s) => SURFACE_NAMES[s] ?? s));
    onSurface.set(where, [...(onSurface.get(where) ?? []), n]);
  });
  const ordered = names.filter((n) => cannot.includes(n));
  if (plain.length === 0 && onSurface.size === 0) return `None of this dish’s organisms can live in ${label}.`;
  const parts: string[] = [];
  if (plain.length > 0) parts.push(`${listText(plain)}.`);
  for (const [where, who] of onSurface) parts.push(`${listText(who)} ${who.length === 1 ? 'lives' : 'live'} in ${label} only on ${where}.`);
  if (ordered.length > 0) parts.push(`${listText(ordered)} cannot live in ${label}.`);
  return parts.join(' ');
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
  // P3.1: food and chemistry fields the Phase 3 trays add (each listed only when the dish allocates it).
  { id: 'oil', copy: { name: 'Oil', unit: 'C per cell' } },
  { id: 'protein', copy: { name: 'Protein', unit: 'C per cell' } },
  { id: 'metabolite', copy: { name: 'Metabolite', unit: 'C per cell' } },
  { id: 'salt', copy: { name: 'Salt', unit: 'salinity (salt per cell)' } },
  { id: 'inhBact', copy: { name: 'Bacterial inhibitor', unit: 'units per cell' } },
  { id: 'inhFung', copy: { name: 'Fungal inhibitor', unit: 'units per cell' } },
  { id: 'inhPhoto', copy: { name: 'Photosynthetic inhibitor', unit: 'units per cell' } },
  // P3.3/P3.4 (wave 2 art-features): density overlays of the film and Pinphage fields.
  { id: 'film', copy: { name: 'Biofilm', unit: 'C per cell' } },
  { id: 'v01', copy: { name: 'Pinphage', unit: 'units per cell' } },
  // P3.6 (SPEC §10.8): food the selected organism can eat here, or with none selected, food enzymes made last second.
  { id: 'foodAccess', copy: { name: 'Food access', unit: 'C per cell: food the selected organism can eat, or with none selected, food enzymes made in the last second' } },
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
  if (k.object !== undefined && k.object > 0) parts.push(`${k.object} held a food object`);
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

/** What an edit refused as "not in this dish" names, in content words ("Impermeable wall is"). */
function missingText(p: CommandPayload): string {
  switch (p.kind) {
    case 'paintSubstrate':
      return `${paintName(null, p.substrate)} is`;
    case 'paintShade':
      return `${paintName(null, 'shade')} is`;
    case 'placeStructure':
      return `${structureName(p.structure)} is`;
    default:
      return `${listText(structureNames())} are`;
  }
}

/**
 * The announcement after a habitat edit, from the counts the simulation returned. `label` is the
 * item's content name in lower case ("gel", "impermeable wall"); `factor` the dish's shade factor.
 * Names are content names (LabTrayNames), never the simulation's codes or its log notes.
 */
export function habitatEditOutcome(p: CommandPayload, r: CommandResult, label = '', factor: number | null = null): string {
  // Refused whole (malformed, or not in this dish's recorded content): say why.
  if (r.accepted === 0 && r.rejected === 0 && r.note && !r.note.startsWith('nothing')) {
    if (r.note.endsWith(NOT_IN_DISH)) return `Not changed: ${missingText(p)} not in this dish’s recorded content.`;
    return `Not changed: ${r.note}.`;
  }
  switch (p.kind) {
    case 'paintSubstrate':
      return r.accepted === 0
        ? `Nothing painted.${skippedText(r)}`
        : `Painted ${label || inSentence(paintName(null, p.substrate))} on ${r.accepted} cell${s(r.accepted)}.${skippedText(r)}`;
    case 'paintShade':
      if (r.accepted === 0) return `Nothing shaded.${skippedText(r)}`;
      return p.erase
        ? `Full light back on ${r.accepted} cell${s(r.accepted)}.${skippedText(r)}`
        : `Shaded ${r.accepted} cell${s(r.accepted)}${factor !== null ? ` (light × ${factor})` : ''}.${skippedText(r)}`;
    case 'placeStructure': {
      if (r.accepted === 0) return `Nothing placed.${skippedText(r)}`;
      return `Placed ${label || inSentence(structureName(p.structure))} on ${r.accepted} cell${s(r.accepted)}.${movedText(r)}${skippedText(r)}`;
    }
    case 'eraseStructure':
      return r.accepted === 0
        ? 'Nothing to erase here.'
        : `Removed structures from ${r.accepted} cell${s(r.accepted)}; what was underneath is back.`;
    default:
      return '';
  }
}

/** The Habitat tray's lid toggle (SPEC §4.2, §4.5; CT §12.2; P3.1): a world setting, one recorded change. */
export const LID_COPY = {
  label: 'Lid',
  open: 'Open',
  closed: 'Closed',
  rule: 'Open: every cell trades oxygen and carbon dioxide with the air, 0.02 of the difference each tick toward 0.8 oxygen and 0.5 carbon dioxide (sediment ten times slower). Closed: no gas exchange at all. Light enters either way. Each change is recorded and can be undone.',
  outcome: (lid: 'open' | 'closed') =>
    lid === 'closed'
      ? 'Lid closed: no gas exchange with the air. Light still enters.'
      : 'Lid open: oxygen and carbon dioxide drift toward the air’s levels again.',
  failed: 'The lid did not change.',
} as const;

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
  noPaint: 'This dish’s recorded content has no habitat paint, so there is none to use here.',
  noStructures: 'This dish’s recorded content has no stones, walls or beads to place.',
  inspectHint: 'Tap an organism or a cell. Drag to move around.',
  lifeHint: 'Tap the dish to place. The tool stays selected.',
  brushHint: 'Drag on the dish to paint; two fingers pan. One stroke is one change.',
  overlayNone: 'None',
  opacity: 'Overlay opacity',
  legendLow: 'low',
  legendHigh: 'high',
  noOverlay: 'No overlay. Pick one to colour the dish by a measured value.',
  infectionMarkers: 'Infection markers',
  infectionMarkersHint: 'Marks every infected organism. Looking never changes the dish.',
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
    lives: 'Lives here in this dish',
    unchanged: 'Does not change',
    watch: 'Watch for',
  },
} as const;
