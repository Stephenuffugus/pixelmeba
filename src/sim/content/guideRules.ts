/**
 * Field Guide rules (P3.8; UX §5.7; SPEC §14 "Discovery and knowledge"; D-0039).
 *
 * 1. `guideProblems` runs inside validateContent for whichever manifest is validated (the shipped one,
 *    a recorded g2 one, or a test's patched one). For everything that manifest enables (species,
 *    materials, modules, habitats, structures, and tools whose phase ≤ the build phase):
 *    - every guide field is non-empty (tools also changes / doesNotChange / watchFor): an error naming
 *      file → field;
 *    - a material's rules say "No additional modeled reaction." unless MATERIAL_REACTIONS lists the
 *      modeled reaction it takes part in instead;
 *    - summary and example (and a tool's changes / does not change / watch for) never name a species
 *      that is not enabled; in biology and rules text it is only a warning. A name counts as not
 *      enabled when the species is not in enabledSpecies; it is an error when the species also belongs
 *      to a later phase than the build (so the build could never show it), and a warning when a test
 *      manifest simply left a shipped species out (PROPOSED DECISION in the P3.8 build report).
 * 2. Pure helpers the guide and its tests share: predators, prey, hosts and parasites of a species,
 *    limited to an enabled set (CT §3.2–§3.3).
 *
 * Content only: nothing here is read by the simulation of a world.
 */
import type { ContentIssue } from './registry';
import type { HabitatDef, Manifest, MaterialDef, ModuleDef, Species, StructureDef, ToolDef } from './schema';

/** The sentence a material's rules end with when it takes part in no further modeled reaction (UX §5.7). */
export const NO_REACTION_SENTENCE = 'No additional modeled reaction.';

/**
 * Materials whose rules text does not carry NO_REACTION_SENTENCE, each with the modeled reaction it
 * takes part in (the guide then lists that reaction instead). Empty in this build: every material
 * record states the sentence after naming its reactions (STARCH, OIL, PROTEIN, the enzymes).
 * tests/content/material-guide-text.test.ts reads this list (one list).
 */
export const MATERIAL_REACTIONS: Readonly<Record<string, string>> = Object.freeze({});

/** The guide fields every enabled record carries. */
export const GUIDE_FIELDS = ['summary', 'biology', 'rules', 'example'] as const;
/** The extra fields every enabled tool carries. */
export const TOOL_FIELDS = ['changes', 'doesNotChange', 'watchFor'] as const;

interface Collection<T> {
  readonly map: Readonly<Record<string, T>>;
  readonly ids: readonly string[];
  readonly files: Readonly<Record<string, string>>;
}

export interface GuideInput {
  readonly manifest: Manifest;
  readonly species: Collection<Species>;
  readonly materials: Collection<MaterialDef>;
  readonly modules: Collection<ModuleDef>;
  readonly habitats: Collection<HabitatDef>;
  readonly structures: Collection<StructureDef>;
  readonly tools: Collection<ToolDef>;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A matcher for a species name in running text: the name or its plural ("Crumbsmiths", "Amoebas"). */
export function speciesNamePattern(name: string): RegExp {
  return new RegExp(`(^|[^A-Za-z])${escapeRe(name)}(e?s)?(?![A-Za-z])`);
}

/** The species (by id) whose names appear in `text`. */
export function speciesNamedIn(text: string, species: Readonly<Record<string, Species>>, ids: readonly string[]): string[] {
  return ids.filter((id) => speciesNamePattern(species[id]!.name).test(text));
}

/** The tools a manifest enables: every tool record whose phase ≤ the build phase (no manifest list). */
export function enabledToolIds(tools: Readonly<Record<string, ToolDef>>, ids: readonly string[], buildPhase: number): string[] {
  return ids.filter((id) => tools[id]!.phase <= buildPhase);
}

export function guideProblems(input: GuideInput): ContentIssue[] {
  const out: ContentIssue[] = [];
  const m = input.manifest;
  const err = (file: string, path: string, message: string) => out.push({ severity: 'error', file, path, message });
  const warn = (file: string, path: string, message: string) => out.push({ severity: 'warning', file, path, message });
  const enabledSpecies = m.enabledSpecies;
  const allSpecies = input.species.ids;

  /** Text fields to check for names: [path, text, error?]. */
  const nameCheck = (file: string, fields: readonly (readonly [string, string, boolean])[]) => {
    for (const [path, text, strict] of fields) {
      for (const id of speciesNamedIn(text, input.species.map, allSpecies)) {
        if (enabledSpecies.includes(id)) continue;
        const sp = input.species.map[id]!;
        const msg = `names ${sp.name} (${id}), which is not enabled`;
        if (strict && sp.phase > m.buildPhase) err(file, path, `${msg} (phase ${sp.phase}, build phase ${m.buildPhase}): reword the text`);
        else warn(file, path, msg);
      }
    }
  };

  const guided = <T extends { readonly guide: { readonly [K in (typeof GUIDE_FIELDS)[number]]: string } }>(
    col: Collection<T>,
    ids: readonly string[],
    extra?: (rec: T, file: string) => void,
  ) => {
    for (const id of ids) {
      const rec = col.map[id];
      const file = col.files[id];
      if (rec === undefined || file === undefined) continue; // unknown ids are reported by the manifest checks
      for (const f of GUIDE_FIELDS) {
        if (rec.guide[f].trim() === '') err(file, `guide.${f}`, 'enabled record needs Field Guide text here');
      }
      nameCheck(file, [
        ['guide.summary', rec.guide.summary, true],
        ['guide.example', rec.guide.example, true],
        ['guide.biology', rec.guide.biology, false],
        ['guide.rules', rec.guide.rules, false],
      ]);
      extra?.(rec, file);
    }
  };

  guided(input.species, m.enabledSpecies);
  guided(input.materials, m.enabledMaterials, (mat, file) => {
    if (MATERIAL_REACTIONS[mat.id] === undefined && !mat.guide.rules.includes(NO_REACTION_SENTENCE))
      err(file, 'guide.rules', `must say "${NO_REACTION_SENTENCE}" (or list its modeled reaction in src/sim/content/guideRules.ts MATERIAL_REACTIONS)`);
  });
  guided(input.modules, m.enabledModules);
  guided(input.habitats, m.enabledHabitats);
  guided(input.structures, m.enabledStructures ?? []);
  guided(input.tools, enabledToolIds(input.tools.map, input.tools.ids, m.buildPhase), (tool, file) => {
    for (const f of TOOL_FIELDS) if (tool[f].trim() === '') err(file, f, 'enabled tool needs Field Guide text here');
    nameCheck(
      file,
      TOOL_FIELDS.map((f) => [f, tool[f], true] as const),
    );
  });
  return out;
}

// ------------------------------------------------------------------------------ relationships (CT §3)

/** A predator–prey pair as the content records it (CT §3.2): 'free' excludes attached prey; 'inSediment' only while in sediment. */
export interface PreyLink {
  readonly id: string;
  readonly requires: 'any' | 'free' | 'inSediment';
}

/** What `id` hunts, limited to `enabled` (content prey list order). */
export function preyOf(species: Readonly<Record<string, Species>>, id: string, enabled: readonly string[]): PreyLink[] {
  const sp = species[id];
  if (!sp) return [];
  return sp.prey.filter((p) => enabled.includes(p.id)).map((p) => ({ id: p.id, requires: p.requires }));
}

/** Who hunts `id`, limited to `enabled` (sorted by predator id), with the predator's requirement. */
export function predatorsOf(species: Readonly<Record<string, Species>>, id: string, enabled: readonly string[]): PreyLink[] {
  const out: PreyLink[] = [];
  for (const pid of [...enabled].sort()) {
    const p = species[pid]?.prey.find((x) => x.id === id);
    if (p) out.push({ id: pid, requires: p.requires });
  }
  return out;
}

/** The hosts a parasite or virus targets, limited to `enabled` (CT §3.3). */
export function hostsOf(species: Readonly<Record<string, Species>>, id: string, enabled: readonly string[]): string[] {
  return (species[id]?.hostIds ?? []).filter((h) => enabled.includes(h));
}

/** The parasites and viruses that target `id`, limited to `enabled` (sorted by id). */
export function parasitesOf(species: Readonly<Record<string, Species>>, id: string, enabled: readonly string[]): string[] {
  return [...enabled].sort().filter((pid) => species[pid]?.hostIds.includes(id) === true);
}
