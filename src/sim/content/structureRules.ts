/**
 * Phase 5 structure rules for content (P5.2; CT §4, §5.3, §14; SPEC §2.4, §4.6, §4.8; D-0104, D-0106).
 * PURE content checks: which kind each structure id is, which systems it needs, and the requirements a
 * habitat's or recipe's placed structures and climate settings put on a manifest. The registry runs
 * them on every shipped habitat and recipe; src/sim/recipes.ts realizeRecipe runs the same checks
 * against the world's recorded manifest, so content validation and realization cannot disagree.
 *
 * Nothing here reads a world or draws randomness; the simulation's behaviour for these structures lives
 * in later waves' modules (barriers, devices, climate, transport, movement).
 */
import { EDGE_KINDS, type EdgeBarrier } from '../barriers';
import { DEVICE_KINDS, type Device } from '../devices';
import type { SystemFlag } from '../fields';
import type { Manifest, StructureDef } from './schema';

/** The cell structures the simulation implements (src/sim/grid.ts STRUCTURE_RECORD_IDS): kind 'cell'. */
export const CELL_STRUCTURE_IDS: readonly string[] = ['BEAD', 'STONE', 'WALL'];

/** CT §4's kind of every Phase 5 structure. The registry refuses a record whose kind differs. */
export const STRUCTURE_KINDS: Readonly<Record<string, StructureDef['kind']>> = Object.freeze({
  S01: 'edge',
  S02: 'edge',
  S03: 'edge',
  S04: 'edge',
  S05: 'furnishing',
  S06: 'furnishing',
  S07: 'furnishing',
  S08: 'device',
  S09: 'device',
  S10: 'device',
  S11: 'furnishing',
  S12: 'furnishing',
});

/**
 * The systems each Phase 5 structure needs in a dish's manifest (PROPOSED DECISION, wave 8b
 * structure-content): edge barriers need 'barriers'; furnishings and devices need 'devices'; the heater,
 * cooler and wick also act on the local climate ('climate'). The shade roof needs only 'devices': its
 * stop on drying matters only where Drying (which needs 'climate') is on.
 */
export const STRUCTURE_SYSTEM_NEEDS: Readonly<Record<string, readonly SystemFlag[]>> = Object.freeze({
  S01: ['barriers'],
  S02: ['barriers'],
  S03: ['barriers'],
  S04: ['barriers'],
  S05: ['devices'],
  S06: ['devices'],
  S07: ['devices'],
  S08: ['devices'],
  S09: ['devices', 'climate'],
  S10: ['devices', 'climate'],
  S11: ['devices'],
  S12: ['devices', 'climate'],
});

/** The kind the simulation gives structure `id`, or undefined for an id it does not know. */
export function expectedStructureKind(id: string): StructureDef['kind'] | undefined {
  if (CELL_STRUCTURE_IDS.includes(id)) return 'cell';
  return Object.prototype.hasOwnProperty.call(STRUCTURE_KINDS, id) ? STRUCTURE_KINDS[id] : undefined;
}

/** What a manifest offers the structure checks: its systems and its structures. */
export type StructureManifest = Pick<Manifest, 'enabledSystems' | 'enabledStructures'>;

/** The placed structure stores of a habitat or recipe (src/sim/recipes.ts recipeStructures). */
export interface PlacedStructures {
  readonly edges: readonly EdgeBarrier[];
  readonly devices: readonly Device[];
}

/** Every Phase 5 structure id a store may hold (used to check geometry alone, apart from a manifest). */
export const PLACEABLE_PHASE5_IDS: readonly string[] = [...EDGE_KINDS, ...DEVICE_KINDS];

/**
 * What a set of rules includes: a manifest (rulesOfManifest) for content validation, or a world's
 * recorded manifest through src/sim/gates.ts (worldHasStructure, worldHasSystem) at realization.
 */
export interface StructureRulesView {
  hasStructure(id: string): boolean;
  hasSystem(sys: SystemFlag): boolean;
}

export function rulesOfManifest(m: StructureManifest): StructureRulesView {
  return { hasStructure: (id) => (m.enabledStructures ?? []).includes(id), hasSystem: (sys) => m.enabledSystems.includes(sys) };
}

/**
 * The first requirement that `placed` puts on the rules and they do not meet, as a sentence, or null:
 * each placed structure must be included, and each of its systems. Kinds are checked in a fixed order
 * (edges, then devices, each in id order), never in store order.
 */
export function placedStructureNeedProblem(placed: PlacedStructures, rules: StructureRulesView): string | null {
  for (const id of PLACEABLE_PHASE5_IDS) {
    if (!placed.edges.some((e) => e.kind === id) && !placed.devices.some((d) => d.kind === id)) continue;
    if (!rules.hasStructure(id)) return `It places structure ${id}, which these rules do not include.`;
    for (const sys of STRUCTURE_SYSTEM_NEEDS[id] ?? []) {
      if (!rules.hasSystem(sys)) return `It places structure ${id}, which needs the "${sys}" system (not in these rules).`;
    }
  }
  return null;
}

/**
 * The climate requirement of a dish's settings (SPEC §4.6, §4.8; D-0106): a light cycle or drying needs
 * the 'climate' system. A sentence, or null.
 */
export function climateNeedProblem(settings: { readonly lightMode: 'fixed' | 'cycle'; readonly drying: boolean }, rules: Pick<StructureRulesView, 'hasSystem'>): string | null {
  if (rules.hasSystem('climate')) return null;
  if (settings.lightMode === 'cycle') return 'Its light cycle needs the "climate" system (not in these rules).';
  if (settings.drying) return 'Its drying needs the "climate" system (not in these rules).';
  return null;
}
