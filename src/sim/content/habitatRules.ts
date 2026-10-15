/**
 * Phase 5 habitat rules (P5.4; CT §8.2, §14; SPEC §2.4, §13.1; D-0106, D-0128). PURE and light: the
 * geometry of a habitat's regions and furnished areas, what a habitat uses (structures, systems,
 * materials), and the ONE offer rule the validator, the worker and the New Dish list share
 * (habitatOfferProblem, communityOfferProblem).
 *
 * The New Dish screen imports this file on the main thread and registry.ts imports it, so it imports only
 * schema types, fields.ts, grid.ts and structureRules.ts: never registry.ts or recipes.ts (registry.ts
 * imports recipes.ts; importing either here would cycle and pull the validator into the UI bundle).
 */
import { FIELD_DEFS, isFieldId, type SystemFlag } from '../fields';
import { cellIndex, diskCells, inDisk, inMask, STRUCTURE_RECORD_IDS } from '../grid';
import type { FurnishArea, HabitatDef, HabitatRegionDef, Manifest, Species } from './schema';
import { speciesSystemNeeds, STRUCTURE_SYSTEM_NEEDS } from './structureRules';

/** A named region of a habitat (schema.ts HabitatRegionSchema). */
export type HabitatRegion = HabitatRegionDef;

/** The cell a region's pin and its community groups are centred on. */
export function regionAnchorCell(r: HabitatRegion): number {
  return cellIndex(r.anchor[0], r.anchor[1]);
}

type Shape = HabitatRegion['shape'] | FurnishArea['area'];

function inShape(s: Shape, x: number, y: number): boolean {
  if (s.kind === 'rect') return x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1;
  return inDisk(x, y, s.center[0], s.center[1], s.radius);
}

/** Whether cell (x, y) is in the region: inside its shape (disk: grid.ts inDisk; rect: inclusive bounds) and the dish. */
export function regionContains(r: HabitatRegion, x: number, y: number): boolean {
  return inMask(x, y) && inShape(r.shape, x, y);
}

/** The cells of a shape's bounding rows, row-major, clipped to the grid (not yet to the dish). */
function shapeCells(s: Shape): number[] {
  if (s.kind !== 'rect') return diskCells(s.center[0], s.center[1], s.radius);
  const out: number[] = [];
  for (let y = s.y0; y <= s.y1; y++) for (let x = s.x0; x <= s.x1; x++) out.push(cellIndex(x, y));
  return out;
}

const inDishCell = (i: number): boolean => inMask(i % 128, Math.floor(i / 128));

/** The region's cells, row-major, in the dish. */
export function regionCells(r: HabitatRegion): number[] {
  return shapeCells(r.shape).filter(inDishCell);
}

/**
 * The cells a furnished area covers, row-major, in the dish (src/sim/recipes.ts furnishCells re-exports
 * it). 'perimeter': the disk's in-dish cells with at least one 4-neighbour outside the disk or outside
 * the dish (pure geometry).
 */
export function furnishAreaCells(area: FurnishArea['area']): number[] {
  const cells = shapeCells(area).filter(inDishCell);
  if (area.kind !== 'perimeter') return cells;
  const [cx, cy] = area.center;
  const inside = (x: number, y: number) => inMask(x, y) && inDisk(x, y, cx, cy, area.radius);
  return cells.filter((i) => {
    const x = i % 128;
    const y = Math.floor(i / 128);
    return !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
  });
}

/**
 * The first cell of an area's whole shape (unclipped) that lies outside the dish, as [x, y], or null:
 * a furnished area must lie wholly inside the dish (the validator never crops one; D-0128).
 */
export function furnishAreaOutsideCell(area: FurnishArea['area']): [number, number] | null {
  if (area.kind === 'rect') {
    for (let y = area.y0; y <= area.y1; y++) for (let x = area.x0; x <= area.x1; x++) if (!inMask(x, y)) return [x, y];
    return null;
  }
  const [cx, cy] = area.center;
  const r = area.radius;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (inDisk(x, y, cx, cy, r) && !inMask(x, y)) return [x, y];
  return null;
}

/** What a habitat uses, each list sorted and unique. */
export interface HabitatUses {
  readonly structures: string[];
  readonly systems: SystemFlag[];
  readonly materials: string[];
}

const sortedUnique = <T extends string>(xs: readonly T[]): T[] => xs.filter((x, i) => xs.indexOf(x) === i).sort();

function fieldSystems(values: Readonly<Record<string, unknown>> | undefined, out: SystemFlag[]): void {
  for (const k of Object.keys(values ?? {}).sort()) if (isFieldId(k)) out.push(FIELD_DEFS[k].system);
}

/**
 * The structures (cell structures its ops paint, edge kinds, device kinds explicit and furnished), the
 * systems ('core'; each structure's STRUCTURE_SYSTEM_NEEDS; 'climate' for a light cycle or drying; the
 * system of every field its base fields and ops set; 'foodObjects' with objects) and the materials (its
 * objects') of a habitat. Its Suggested Community is not counted (communityOfferProblem).
 */
export function habitatUses(h: HabitatDef): HabitatUses {
  const structures: string[] = [];
  for (const op of h.ops) if (op.substrate === 'stone' || op.substrate === 'wall' || op.substrate === 'bead') structures.push(STRUCTURE_RECORD_IDS[op.substrate]);
  for (const e of h.edges ?? []) structures.push(e.structure);
  for (const d of h.devices ?? []) structures.push(d.structure);
  for (const f of h.furnish ?? []) structures.push(f.structure);
  const systems: SystemFlag[] = ['core'];
  for (const id of structures) systems.push(...(STRUCTURE_SYSTEM_NEEDS[id] ?? []));
  if (h.lightMode === 'cycle' || h.drying) systems.push('climate');
  fieldSystems(h.baseFields, systems);
  for (const op of h.ops) fieldSystems(op.fields, systems);
  const objects = h.objects ?? [];
  if (objects.length > 0) systems.push('foodObjects');
  return { structures: sortedUnique(structures), systems: sortedUnique(systems), materials: sortedUnique(objects.map((o) => o.material)) };
}

export type HabitatOfferManifest = Pick<Manifest, 'buildPhase' | 'enabledSystems' | 'enabledStructures' | 'enabledMaterials'>;
export type CommunityOfferManifest = Pick<Manifest, 'enabledSpecies' | 'enabledSystems'>;

/** An offer problem with the habitat field it concerns (the validator's path). */
export interface HabitatOfferIssue {
  readonly path: string;
  readonly message: string;
}

function structurePath(h: HabitatDef, id: string): string {
  if ((h.edges ?? []).some((e) => e.structure === id)) return 'edges';
  if ((h.devices ?? []).some((d) => d.structure === id)) return 'devices';
  if ((h.furnish ?? []).some((f) => f.structure === id)) return 'furnish';
  return 'ops';
}

function systemPath(h: HabitatDef, sys: SystemFlag): string {
  const placed = [...(h.edges ?? []), ...(h.devices ?? []), ...(h.furnish ?? [])].find((p) => (STRUCTURE_SYSTEM_NEEDS[p.structure] ?? []).includes(sys));
  if (placed) return structurePath(h, placed.structure);
  if (sys === 'climate' && h.lightMode === 'cycle') return 'lightMode';
  if (sys === 'climate' && h.drying) return 'drying';
  if (sys === 'foodObjects' && (h.objects ?? []).length > 0) return 'objects';
  const usesField = (v: Readonly<Record<string, unknown>> | undefined) => Object.keys(v ?? {}).some((k) => isFieldId(k) && FIELD_DEFS[k].system === sys);
  if (usesField(h.baseFields)) return 'baseFields';
  const op = h.ops.findIndex((o) => usesField(o.fields));
  return op >= 0 ? `ops.${op}.fields` : 'id';
}

/**
 * habitatOfferProblem with the habitat field it concerns ('phase', 'edges', 'devices', 'furnish', 'ops',
 * 'lightMode', 'drying', 'baseFields', 'ops.<i>.fields', 'objects'). The one rule; the validator reports
 * it on that path.
 */
export function habitatOfferIssue(h: HabitatDef, m: HabitatOfferManifest): HabitatOfferIssue | null {
  if (h.phase > m.buildPhase) return { path: 'phase', message: `It belongs to phase ${h.phase} (build phase ${m.buildPhase}).` };
  const uses = habitatUses(h);
  const structures = m.enabledStructures ?? [];
  for (const id of uses.structures) if (!structures.includes(id)) return { path: structurePath(h, id), message: `It uses structure ${id} (not enabled).` };
  for (const sys of uses.systems) if (!m.enabledSystems.includes(sys)) return { path: systemPath(h, sys), message: `It needs the "${sys}" system (not enabled).` };
  for (const id of uses.materials) if (!m.enabledMaterials.includes(id)) return { path: 'objects', message: `It uses material ${id} (not enabled).` };
  return null;
}

/**
 * Why manifest `m` cannot offer habitat `h`, as a sentence, or null. The first of: its phase is later
 * than the build phase; a structure it uses is not enabled; a system; a material.
 */
export function habitatOfferProblem(h: HabitatDef, m: HabitatOfferManifest): string | null {
  return habitatOfferIssue(h, m)?.message ?? null;
}

export function habitatOffered(h: HabitatDef, m: HabitatOfferManifest): boolean {
  return habitatOfferProblem(h, m) === null;
}

/**
 * Why manifest `m` cannot offer habitat `h`'s Suggested Community, as a sentence, or null (also null
 * when it has none). The first of: a group's species not enabled; a system a group's species needs
 * (structureRules.ts speciesSystemNeeds), group by group; a system a patch's field needs, patch by patch.
 */
export function communityOfferProblem(h: HabitatDef, m: CommunityOfferManifest, species: Readonly<Record<string, Species>>): string | null {
  const c = h.suggestedCommunity;
  if (c === undefined) return null;
  for (const g of c.groups) if (!m.enabledSpecies.includes(g.species)) return `Its Suggested Community needs ${g.species} (not enabled).`;
  for (const g of c.groups) {
    const sp = species[g.species];
    if (!sp) return `Its Suggested Community needs ${g.species} (not enabled).`;
    for (const [sys, why] of speciesSystemNeeds(sp)) if (!m.enabledSystems.includes(sys)) return `Its Suggested Community's ${g.species} needs the "${sys}" system for ${why} (not enabled).`;
  }
  for (const [k, p] of (c.patches ?? []).entries()) {
    const systems: SystemFlag[] = [];
    fieldSystems(p.add, systems);
    fieldSystems(p.set, systems);
    for (const sys of systems) if (!m.enabledSystems.includes(sys)) return `Its Suggested Community's patch ${k} needs the "${sys}" system (not enabled).`;
  }
  return null;
}

/** Whether `m` offers the habitat's Suggested Community: false when it has none. */
export function communityOffered(h: HabitatDef, m: CommunityOfferManifest, species: Readonly<Record<string, Species>>): boolean {
  return h.suggestedCommunity !== undefined && communityOfferProblem(h, m, species) === null;
}
