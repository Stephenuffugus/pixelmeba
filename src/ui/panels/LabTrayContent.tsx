/**
 * What the Lab's Habitat and Tools trays offer, and what they say about each item, from content
 * (CLAUDE.md "content is data"; D-0024; P2.7):
 * - a paint tool exists only when the dish's recorded content has a `paint` material with that target
 *   (DishInfo.materials is the world's own record), and its name, summary and shade factor are that
 *   record's;
 * - a structure tool exists only when the dish's recorded manifest enables that Structure record: the
 *   worker sends the world's own list (DishInfo.structureIds, its manifest's enabledStructures), so a
 *   dish saved under other content keeps the tools its ruleset allows, and an older dish recorded
 *   before structures were content is offered none. A DishInfo without the list (not sent by this
 *   build's worker) is offered none too, which is what the simulation of such a dish would allow;
 * - the rules text and example ("Changes", "Watch for") are the content records' guide text, bundled
 *   from content/ (the simulation's own copies are validated by the same schemas).
 * The strings file keeps only UI chrome: what each kind of brush does to the cells it covers.
 */
import type { MaterialDef, StructureDef } from '@sim/content/schema';
import {
  habitatMaskOf,
  PLACEABLE_STRUCTURES,
  STRUCTURE_RECORD_IDS,
  SUBSTRATE_NAMES,
  type LifeBrush,
  type PlaceableStructure,
  type SubstrateName,
} from '@sim/grid';
import type { DishInfo, SpeciesDiet } from '@worker/protocol';
import { LIFE_COPY } from '../strings/lab';
import type { LabToolId } from '../views/LabView';

type Glob<T> = Record<string, T>;

function byId<T extends { readonly id: string }>(glob: Glob<T>): Readonly<Record<string, T>> {
  const out: Record<string, T> = {};
  for (const path of Object.keys(glob).sort()) {
    const rec = glob[path]!;
    out[rec.id] = rec;
  }
  return out;
}

const STRUCTURE_RECORDS = byId(
  import.meta.glob<StructureDef>('../../../content/structures/*.json', { eager: true, import: 'default' }),
);
const MATERIAL_RECORDS = byId(
  import.meta.glob<MaterialDef>('../../../content/materials/*.json', { eager: true, import: 'default' }),
);

/** Name and guide text of one tray item, from its content record. */
export interface LabRecord {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  /** Guide "rules" (what the game does), or '' when the record is not bundled. */
  readonly rules: string;
  /** Guide "example" (something to try and watch), or ''. */
  readonly example: string;
}

type DishMaterial = DishInfo['materials'][number];

/** The dish's recorded paint material for a target (water, gel, sediment, shade), with its index. */
function paintOf(info: DishInfo, target: SubstrateName | 'shade'): { mat: DishMaterial; index: number } | null {
  const index = info.materials.findIndex((m) => m.kind === 'paint' && m.target === target);
  return index < 0 ? null : { mat: info.materials[index]!, index };
}

/** The shade factor this dish's shade paint applies (its recorded dose, CT §5.1: 0.1), or null. */
export function shadeFactorOf(info: DishInfo): number | null {
  const p = paintOf(info, 'shade');
  const f = p ? (p.mat.doses[1] ?? p.mat.doses[0]) : undefined;
  return typeof f === 'number' && f > 0 && f <= 1 ? f : null;
}

/** The Structure record IDs this dish's recorded manifest enables (none when the worker sent no list). */
export function dishStructureIds(info: DishInfo): readonly string[] {
  return info.structureIds ?? [];
}

/** The paint tool for a substrate or shade, when the dish has that paint. */
export function paintRecord(info: DishInfo, target: SubstrateName | 'shade'): LabRecord | null {
  const p = paintOf(info, target);
  if (!p) return null;
  const rec = MATERIAL_RECORDS[p.mat.id];
  return {
    id: p.mat.id,
    name: p.mat.name,
    summary: info.materialSummaries?.[p.index] ?? rec?.guide.summary ?? '',
    rules: rec?.guide.rules ?? '',
    example: rec?.guide.example ?? '',
  };
}

/** The structure record for a placeable structure, when the dish enables it. */
export function structureRecord(info: DishInfo, s: PlaceableStructure): LabRecord | null {
  const id = STRUCTURE_RECORD_IDS[s];
  const rec = STRUCTURE_RECORDS[id];
  if (!rec || !dishStructureIds(info).includes(id)) return null;
  return { id, name: rec.name, summary: rec.guide.summary, rules: rec.guide.rules, example: rec.guide.example };
}

/** Habitat tray tools this dish offers, in tray order. */
export function habitatTools(info: DishInfo): LabToolId[] {
  const out: LabToolId[] = [];
  for (const t of SUBSTRATE_NAMES) if (paintOf(info, t)) out.push(`paint:${t}`);
  if (shadeFactorOf(info) !== null) out.push('shade:paint', 'shade:erase');
  return out;
}

/** Tools tray structure tools this dish offers, in tray order (erase only when it has structures). */
export function structureTools(info: DishInfo): LabToolId[] {
  const out: LabToolId[] = PLACEABLE_STRUCTURES.filter((s) => structureRecord(info, s) !== null).map(
    (s) => `place:${s}` as const,
  );
  if (out.length > 0) out.push('erase');
  return out;
}

/** Whether this dish offers a Lab tool (a tool it lacks falls back to Inspect). */
export function toolAvailable(info: DishInfo, id: LabToolId): boolean {
  if (id === 'inspect') return true;
  if (id.startsWith('life:')) return info.speciesIds.includes(id.slice('life:'.length));
  if (id.startsWith('material:')) return info.materials.some((m) => m.id === id.slice('material:'.length));
  // P3.6: a food object tool needs that object material in this dish's recorded content.
  if (id.startsWith('object:')) return info.materials.some((m) => m.id === id.slice('object:'.length) && m.kind === 'object');
  if (id.startsWith('paint:') || id.startsWith('shade:')) return habitatTools(info).includes(id);
  return structureTools(info).includes(id);
}

/** Lower-case display label for the outcome line ("Painted gel …", "Placed impermeable wall …"). */
export function editLabel(info: DishInfo, kind: 'paint' | 'place', which: string): string {
  const rec =
    kind === 'paint'
      ? paintRecord(info, which as SubstrateName)
      : (PLACEABLE_STRUCTURES as readonly string[]).includes(which)
        ? structureRecord(info, which as PlaceableStructure)
        : null;
  const name = rec?.name ?? which;
  return name.length > 0 ? `${name[0]!.toLowerCase()}${name.slice(1)}` : name;
}

/**
 * What the Life brush preview needs about a species in this dish, from its recorded habitats and
 * attachment (the same record the simulation's species table is built from), or null when unknown.
 */
export function lifeBrushFor(info: DishInfo, speciesId: string): LifeBrush | null {
  const i = info.speciesIds.indexOf(speciesId);
  // A phage dose fills fields, not cells an organism occupies (W2-14).
  if (i >= 0 && info.speciesDiets?.[i]?.metabolism === 'viral') return { habitatMask: 0, attached: false, viral: true };
  const habitats = i < 0 ? undefined : info.speciesHabitats?.[i];
  const attachment = i < 0 ? undefined : info.speciesAttachment?.[i];
  if (!habitats || attachment === undefined) return null;
  // An attached species also needs one of its recorded surfaces in the cell (SPEC §2.2, D-0006).
  return attachment === null
    ? { habitatMask: habitatMaskOf(habitats), attached: false }
    : { habitatMask: habitatMaskOf(habitats), attached: true, surfaces: [...attachment] };
}

/** The diet symbol a species tile shows next to its diet line (UX §4.3). */
export type DietSymbol = 'light' | 'eats' | 'hunts' | 'drains' | 'infects' | 'none';

export interface DietLine {
  readonly symbol: DietSymbol;
  readonly text: string;
}

function listAnd(items: readonly string[]): string {
  if (items.length === 0) return '';
  return items.length === 1 ? items[0]! : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]!}`;
}

/** This dish's diet record for a species, or null when the worker sent none. */
export function dietOf(info: DishInfo, speciesId: string): SpeciesDiet | null {
  const i = info.speciesIds.indexOf(speciesId);
  return i < 0 ? null : (info.speciesDiets?.[i] ?? null);
}

/** Whether a species is a phage (its Life brush adds units per cell, not organisms; W2-14). */
export function isPhage(info: DishInfo, speciesId: string): boolean {
  return dietOf(info, speciesId)?.metabolism === 'viral';
}

/**
 * The short diet line of a species tile (UX §4.3; W2-13), from the dish's own species records
 * (DishInfo.speciesDiets) and names: "Eats sugar, then protein.", "Makes food from light.",
 * "Hunts Sprinter and Dusk (Crumbsmith only free-swimming), and 9 kinds not in this dish.",
 * "Drains Sunbead.", "Infects Sprinter." Prey and hosts this dish does not record are counted, never
 * named; a prey requirement is always stated ('free' → "only free-swimming", 'inSediment' → "only in
 * sediment"). Null when the dish sent no diet for the species.
 */
export function dietLine(info: DishInfo, speciesId: string): DietLine | null {
  const d = dietOf(info, speciesId);
  if (!d) return null;
  const copy = LIFE_COPY.diet;
  const nameOf = (id: string): string | null => {
    const j = info.speciesIds.indexOf(id);
    return j < 0 ? null : (info.speciesNames[j] ?? id);
  };
  const foods = d.foods.map((f) => copy.foods[f] ?? f);
  const targets = (verb: string, ids: readonly string[]): string => {
    const present = ids.map(nameOf).filter((n): n is string => n !== null);
    const absent = ids.length - present.length;
    if (present.length === 0) return copy.noneHere(verb, absent);
    return `${verb} ${listAnd(absent > 0 ? [...present, copy.absent(absent)] : present)}.`;
  };
  if (d.metabolism === 'viral') return { symbol: 'infects', text: targets('Infects', d.hosts) };
  if (d.metabolism === 'hostDrain') return { symbol: 'drains', text: targets('Drains', d.hosts) };
  if (d.metabolism === 'photosynthesis') return { symbol: 'light', text: copy.light };
  if (d.metabolism === 'mixotroph') return { symbol: 'light', text: copy.mixotroph(listAnd(foods)) };
  if (d.prey.length > 0) {
    const plain: string[] = [];
    const free: string[] = [];
    const sediment: string[] = [];
    let absent = 0;
    for (const p of d.prey) {
      const n = nameOf(p.id);
      if (n === null) absent++;
      else if (p.requires === 'free') free.push(n);
      else if (p.requires === 'inSediment') sediment.push(n);
      else plain.push(n);
    }
    if (plain.length + free.length + sediment.length === 0) return { symbol: 'hunts', text: copy.noneHere('Hunts', absent) };
    const qualified = [
      ...(free.length > 0 ? [`${listAnd(free)} ${copy.free}`] : []),
      ...(sediment.length > 0 ? [`${listAnd(sediment)} ${copy.inSediment}`] : []),
    ];
    let text = plain.length > 0 ? listAnd(plain) : qualified.join('; ');
    if (plain.length > 0 && qualified.length > 0) text += ` (${qualified.join('; ')})`;
    if (absent > 0) text += `, and ${copy.absent(absent)}`;
    return { symbol: 'hunts', text: `Hunts ${text}.` };
  }
  if (foods.length > 0 || d.digestsFilm) {
    const list = foods.length > 0 ? foods.join(', then ') : copy.foods.film!;
    return { symbol: 'eats', text: copy.eats(list, d.metabolism === 'anaerobic', d.digestsFilm && foods.length > 0) };
  }
  return { symbol: 'none', text: copy.nothing };
}
