/**
 * Display names of Lab habitat edits, from content (CLAUDE.md "content is data"; wave B fix 2): the
 * words a player reads for a paint or a structure are its content record's name ("Impermeable wall",
 * "Porous bead", "Gel"), never the simulation's internal codes ("wall", "bead", "gel").
 * - A paint's name is the dish's own recorded material with that target (DishInfo.materials) when the
 *   dish has it, else this build's bundled record for that target.
 * - A structure's name is this build's bundled Structure record for it (worlds record which structure
 *   IDs they enable, not the records; the ID → behaviour mapping is src/sim/grid.ts
 *   STRUCTURE_RECORD_IDS).
 * Used by the comparison change lines (CompareText) and the Lab outcome and refusal notes (lab.ts).
 */
import type { MaterialDef, StructureDef } from '@sim/content/schema';
import { PLACEABLE_STRUCTURES, STRUCTURE_RECORD_IDS, type PaintTarget, type PlaceableStructure } from '@sim/grid';
import type { DishInfo } from '@worker/protocol';

type Glob<T> = Record<string, T>;

function records<T>(glob: Glob<T>): T[] {
  return Object.keys(glob)
    .sort()
    .map((k) => glob[k]!);
}

const STRUCTURES = records(
  import.meta.glob<StructureDef>('../../../content/structures/*.json', { eager: true, import: 'default' }),
);
const PAINTS = records(
  import.meta.glob<MaterialDef>('../../../content/materials/*.json', { eager: true, import: 'default' }),
).filter((m) => m.kind === 'paint');

/** Generic words when a record is missing from this build (never an internal code). */
const FALLBACK_STRUCTURE = 'Structure';
const FALLBACK_PAINT = 'Habitat paint';

/** The content name of a placeable structure ("Impermeable wall"). */
export function structureName(s: PlaceableStructure): string {
  const id = STRUCTURE_RECORD_IDS[s];
  return STRUCTURES.find((r) => r.id === id)?.name ?? FALLBACK_STRUCTURE;
}

/** The content name of a habitat paint by target ("Gel", "Shade paint"), the dish's own record first. */
export function paintName(info: DishInfo | null, target: PaintTarget): string {
  const own = info?.materials.find((m) => m.kind === 'paint' && m.target === target);
  if (own) return own.name;
  return PAINTS.find((m) => m.target === target)?.name ?? FALLBACK_PAINT;
}

/** Every placeable structure's content name, in tray order. */
export function structureNames(): string[] {
  return PLACEABLE_STRUCTURES.map(structureName);
}

/** A name as it reads inside a sentence ("impermeable wall"). */
export function inSentence(name: string): string {
  return name.length > 0 ? `${name[0]!.toLowerCase()}${name.slice(1)}` : name;
}
