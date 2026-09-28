/**
 * What the Lab's Habitat and Tools trays offer, and what they say about each item, from content
 * (CLAUDE.md "content is data"; D-0024; P2.7):
 * - a paint tool exists only when the dish's recorded content has a `paint` material with that target
 *   (DishInfo.materials is the world's own record), and its name, summary and shade factor are that
 *   record's;
 * - a structure tool exists only when the dish's recorded manifest enables that Structure record. The
 *   world's own list is read from DishInfo when the worker sends it (`structureIds`, the manifest's
 *   enabledStructures); until then it is known exactly when the dish's contentHash is this build's
 *   (the hash covers the whole manifest), and a dish from other content is offered none, which the
 *   simulation would refuse anyway;
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
import type { DishInfo } from '@worker/protocol';
import type { LabToolId } from '../views/LabView';

type Glob<T> = Record<string, T>;

const buildManifest = Object.values(
  import.meta.glob<{ readonly contentHash: string; readonly enabledStructures?: readonly string[] }>(
    '../../../content/manifest.json',
    { eager: true, import: 'default' },
  ),
)[0];

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

/** DishInfo as the worker may extend it: the world manifest's enabledStructures (see the file header). */
type DishInfoWithStructures = DishInfo & { readonly structureIds?: readonly string[] };

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

/** The Structure record IDs this dish's recorded manifest enables. */
export function dishStructureIds(info: DishInfo): readonly string[] {
  const own = (info as DishInfoWithStructures).structureIds;
  if (own) return own;
  if (buildManifest && info.contentHash === buildManifest.contentHash) return buildManifest.enabledStructures ?? [];
  return [];
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
  const habitats = i < 0 ? undefined : info.speciesHabitats?.[i];
  const attachment = i < 0 ? undefined : info.speciesAttachment?.[i];
  if (!habitats || attachment === undefined) return null;
  return { habitatMask: habitatMaskOf(habitats), attached: attachment !== null };
}
