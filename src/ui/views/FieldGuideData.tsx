/**
 * The Field Guide's entries (UX §5.7; P3.8), built from this build's validated content: every enabled
 * species, module, material, structure, habitat and tool (tools: phase ≤ the build phase). Loaded
 * lazily by FieldGuide.tsx so the content packs reach the main thread only when the guide opens.
 *
 * Every line comes from a content record or a rule the records state (diet, habitats, preferred
 * ranges, prey lists, host lists, native abilities); predators, prey and hosts are limited to enabled
 * species (src/sim/content/guideRules.ts). Structures use the Lab tray's mapping: Changes = rules,
 * Does not change = the brush's sealed/bead line, Watch for = example.
 */
import { buildRegistry, type ContentRegistry } from '@sim/content/registry';
import { loadRawPacksVite } from '@sim/content/raw-vite';
import { enabledToolIds, hostsOf, parasitesOf, predatorsOf, preyOf } from '@sim/content/guideRules';
import { moduleNotes, type ModuleNotes } from '@sim/moduleNotes';
import { BRUSH_COPY } from '../strings/lab';
import { categoryWord, dietWords, habitatWords, preyQualifier, productWords, rangeWords } from '../strings/guide';

export type EntryKind = 'species' | 'module' | 'material' | 'structure' | 'habitat' | 'tool';

export interface GuideEntry {
  readonly kind: EntryKind;
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly biology: string;
  readonly rules: string;
  readonly example: string;
  /** Lower-case name and id, for search. */
  readonly search: string;
}

export interface NamedLink {
  readonly id: string;
  readonly text: string;
}

export interface SpeciesEntry extends GuideEntry {
  readonly kind: 'species';
  readonly assetId: string;
  readonly category: string;
  readonly diet: string;
  readonly habitat: string;
  readonly ranges: readonly string[];
  readonly predators: readonly NamedLink[];
  readonly prey: readonly NamedLink[];
  readonly hosts: readonly NamedLink[];
  readonly parasites: readonly NamedLink[];
  readonly products: readonly string[];
  readonly abilities: readonly NamedLink[];
  /** Whether it targets hosts (parasite or virus): the guide shows "Hosts" for it. */
  readonly targetsHosts: boolean;
  /** Whether it hunts: the guide shows "Hunts" for it. */
  readonly hunts: boolean;
}

export interface ModuleEntry extends GuideEntry {
  readonly kind: 'module';
  readonly eligible: readonly NamedLink[];
  /** What a carrier can be noted for because of this ability (src/sim/moduleNotes.ts); notes stay on species. */
  readonly notes: ModuleNotes;
}

export interface MaterialEntry extends GuideEntry {
  readonly kind: 'material';
  /** Pools and enzymes whose relationships this entry shows under "Seen in your dishes". */
  readonly pools: readonly string[];
  readonly enzymes: readonly string[];
}

/** A structure, a tool or a habitat (Structures & tools tab). */
export interface EquipmentEntry extends GuideEntry {
  readonly kind: 'structure' | 'tool' | 'habitat';
  readonly changes?: string;
  readonly doesNotChange?: string;
  readonly watchFor?: string;
}

export interface GuideModel {
  readonly species: readonly SpeciesEntry[];
  readonly modules: readonly ModuleEntry[];
  readonly materials: readonly MaterialEntry[];
  readonly equipment: readonly EquipmentEntry[];
  /** Every species name by id (also species not enabled), for relationship sentences. */
  readonly names: Readonly<Record<string, string>>;
}

const ENZYME_OF: Readonly<Record<string, string>> = { eStarch: 'starch', eOil: 'oil', eProtein: 'protein' };
const SUBSTRATE_ENZYME: Readonly<Record<string, string>> = { starch: 'starch', oil: 'oil', protein: 'protein' };

function search(name: string, id: string): string {
  return `${name} ${id}`.toLowerCase();
}

/** The guide model of a validated registry (pure). */
export function guideModel(reg: ContentRegistry): GuideModel {
  const m = reg.manifest;
  const enabled = m.enabledSpecies;
  const names: Record<string, string> = {};
  for (const id of reg.speciesIds) names[id] = reg.species[id]!.name;
  const link = (id: string, extra = ''): NamedLink => ({ id, text: `${names[id] ?? id}${extra}` });

  const enabledDefs = enabled.map((id) => reg.species[id]!);
  const modules: ModuleEntry[] = m.enabledModules.map((id) => {
    const mod = reg.modules[id]!;
    return {
      kind: 'module',
      id,
      name: mod.name,
      ...mod.guide,
      search: search(mod.name, id),
      eligible: mod.eligibleAncestors.filter((s) => enabled.includes(s)).map((s) => link(s)),
      notes: moduleNotes(mod, enabledDefs),
    };
  });

  const species: SpeciesEntry[] = enabled.map((id) => {
    const s = reg.species[id]!;
    return {
      kind: 'species',
      id,
      name: s.name,
      ...s.guide,
      search: search(s.name, id),
      assetId: s.assetId,
      category: categoryWord(s.category),
      diet: dietWords(s),
      habitat: habitatWords(s),
      ranges: rangeWords(s.tolerances),
      predators: predatorsOf(reg.species, id, enabled).map((p) => link(p.id, preyQualifier(p.requires))),
      prey: preyOf(reg.species, id, enabled).map((p) => link(p.id, preyQualifier(p.requires))),
      hosts: hostsOf(reg.species, id, enabled).map((h) => link(h)),
      parasites: parasitesOf(reg.species, id, enabled).map((p) => link(p)),
      products: productWords(s),
      abilities: modules.filter((mod) => mod.eligible.some((e) => e.id === id)).map((mod) => ({ id: mod.id, text: mod.name })),
      targetsHosts: s.hostIds.length > 0,
      hunts: s.prey.length > 0,
    };
  });

  const materials: MaterialEntry[] = m.enabledMaterials.map((id) => {
    const mat = reg.materials[id]!;
    const enzyme = ENZYME_OF[mat.target] ?? SUBSTRATE_ENZYME[mat.target];
    return {
      kind: 'material',
      id,
      name: mat.name,
      ...mat.guide,
      search: search(mat.name, id),
      pools: [mat.target],
      enzymes: enzyme ? [enzyme] : [],
    };
  });

  const equipment: EquipmentEntry[] = [
    ...(m.enabledStructures ?? []).map((id): EquipmentEntry => {
      const st = reg.structures[id]!;
      return {
        kind: 'structure',
        id,
        name: st.name,
        ...st.guide,
        search: search(st.name, id),
        changes: st.guide.rules,
        doesNotChange: id === 'BEAD' ? BRUSH_COPY.place.beadUnchanged : BRUSH_COPY.place.sealedUnchanged,
        watchFor: st.guide.example,
      };
    }),
    ...enabledToolIds(reg.tools, reg.toolIds, m.buildPhase).map((id): EquipmentEntry => {
      const t = reg.tools[id]!;
      return {
        kind: 'tool',
        id,
        name: t.name,
        ...t.guide,
        search: search(t.name, id),
        changes: t.changes,
        doesNotChange: t.doesNotChange,
        watchFor: t.watchFor,
      };
    }),
    ...m.enabledHabitats.map((id): EquipmentEntry => {
      const h = reg.habitats[id]!;
      return { kind: 'habitat', id, name: h.name, ...h.guide, search: search(h.name, id) };
    }),
  ];

  return { species, modules, materials, equipment, names };
}

let cached: GuideModel | null = null;

/** The model of this build's content (validated once per session). */
export function loadGuideModel(): GuideModel {
  cached ??= guideModel(buildRegistry(loadRawPacksVite()));
  return cached;
}
