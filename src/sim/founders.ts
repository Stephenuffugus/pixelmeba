/**
 * Founder genomes (SPEC §8.6, CT §6.1/§12.8, D04 §3; P2.2).
 *
 *   • Identical — neutral loci (50), no modules beyond any explicitly declared ones.
 *   • Varied — each locus active for the founder's genome drawn from 45–55 inclusive with the
 *     founder.init stream keyed by the founder's birthId (its inoculation sequence number).
 *   • Diverse — Varied, plus: each ELIGIBLE founder the dish is made with independently (D04 §3
 *     "independently give 10 % of eligible founders one legal supplementary module, selected
 *     uniformly") has a 10 % chance of one legal module, chosen uniformly from the world's recorded
 *     registry with the founder.module stream. A founder is eligible when at least one legal gain
 *     exists for its ancestor and declared set (eligibleGains: slot free, eligible ancestor, no native
 *     duplicate, combination valid). The module is chosen before the loci are drawn, so a seeded E03
 *     also varies the dormancy locus. Such a founder is recorded with lineage origin 2 and labelled
 *     "present at creation"; it starts with no structure inventory, and its reference genome is its
 *     own, so a seeded ability never counts as evolved variation (branches.ts initFounder).
 *
 * "Present at creation" must stay true (UX §3.3; honest labels), so the Diverse module draw applies
 * only while the dish is at 0:00 (tick 0, before its first tick runs): the recipe's founders and any
 * life the player (or a tick-0 schedule) adds before the dish first runs. Life added later in a Diverse
 * dish gets the Varied traits only and is labelled as added, never as present at creation.
 *
 * Every founder the world creates goes through here (recipe founders and Add Life inoculations);
 * specimen spawns reuse their saved genome instead. Draws are stateless, so the order in which
 * founders are placed can never change what another founder receives.
 *
 * Explicit founder modules (recipes, specimens) must form a legal set for the ancestor under the
 * world's recorded registry (SPEC §9; P2.1): an illegal set is refused, never trimmed.
 */
import { neutralGenome, type GenomeInput } from './genome';
import { recordField } from './lineage';
import { eligibleGains, validateModuleSet } from './modules';
import { MUT_MODULE_GAIN } from './mutation';
import { activeLoci } from './phenotype';
import { det, detFloat, detInt, STREAMS } from './rng';
import type { World } from './world';

export class ModuleSetError extends Error {}

/** CT §6.1 / §12.8: Varied and Diverse founders draw each active locus from 45–55 inclusive. */
export const VARIED_LOCUS_MIN = 45;
export const VARIED_LOCUS_MAX = 55;
/** CT §12.8 "Diverse 10 % of eligible founders one module" (an independent chance per eligible founder, D04 §3). */
export const DIVERSE_MODULE_CHANCE = 0.1;

/** Key positions within the founder.module stream (never reorder: saved worlds replay these draws). */
const MODULE_ROLL = 0;
const MODULE_PICK = 1;

/** One founder's genome and, for a Diverse founder that received one, its seeded module. */
export interface FounderDraw {
  readonly genome: number;
  /** The module Diverse gave this founder at creation, or null. */
  readonly seededModule: string | null;
}

/**
 * The module a Diverse founder receives, or null: null when the founder is not eligible (no legal gain
 * for its ancestor and declared set) or its 10 % roll fails. Pure (stateless draws keyed by birthId).
 */
export function diverseModuleFor(
  world: World,
  ancestor: string,
  birthId: number,
  declared: readonly string[],
): string | null {
  const options = eligibleGains(world, { ancestor, modules: declared });
  if (options.length === 0) return null;
  if (detFloat(world.seed, STREAMS.founderModule, birthId, MODULE_ROLL) >= DIVERSE_MODULE_CHANCE) return null;
  return options[detInt(world.seed, STREAMS.founderModule, options.length, birthId, MODULE_PICK)]!;
}

/** A Varied locus value for one founder (45–55 inclusive; the wave A draw, kept bit-identical). */
export function variedLocus(world: World, birthId: number, locus: number): number {
  return (
    VARIED_LOCUS_MIN +
    (det(world.seed, STREAMS.founderInit, birthId, locus) % (VARIED_LOCUS_MAX - VARIED_LOCUS_MIN + 1))
  );
}

/**
 * Whether the dish is still being made (SPEC §8.6 "present at creation"): tick 0, before its first tick
 * has run. Only then does a Diverse founder draw an extra ability.
 */
export function atCreation(world: World): boolean {
  return world.tick === 0;
}

/** The founder's genome under the world's recorded founder mode (interned), and any seeded module. */
export function founderDraw(
  world: World,
  spIdx: number,
  birthId: number,
  explicitModules: readonly string[],
): FounderDraw {
  const sp = world.species[spIdx]!;
  const base = neutralGenome(sp.id);
  const declared = [...explicitModules].sort();
  const problem = validateModuleSet(world, sp.id, declared);
  if (problem) throw new ModuleSetError(`founder ${sp.id}: ${problem}`);
  const mode = world.settings.founderMode;
  const seededModule =
    mode === 'diverse' && atCreation(world) ? diverseModuleFor(world, sp.id, birthId, declared) : null;
  const modules = seededModule ? [...declared, seededModule].sort() : declared;
  let loci = base.loci;
  if (mode === 'varied' || mode === 'diverse') {
    // Loci that act for this founder's genome (an E03 founder also varies its dormancy threshold).
    const active = activeLoci(sp, { ...base, modules, id: '' });
    loci = base.loci.map((v, l) => (active[l] ? variedLocus(world, birthId, l) : v));
  }
  const input: GenomeInput = { ...base, loci, modules };
  return { genome: world.genomes.intern(input), seededModule };
}

export function founderGenome(
  world: World,
  spIdx: number,
  birthId: number,
  explicitModules: readonly string[],
): number {
  return founderDraw(world, spIdx, birthId, explicitModules).genome;
}

/** Living founders (generation 0, added at or before this tick) of one species, as New Dish summarizes them. */
export interface FounderSummaryRow {
  readonly species: number;
  readonly count: number;
  /** Founders that could carry an extra ability under the world's recorded registry (a legal gain from no modules, or one carried). */
  readonly eligible: number;
  /** Founders carrying at least one module from creation ("present at creation"). */
  readonly withModule: number;
  /** How many founders carry each module, ascending id. */
  readonly modules: readonly { readonly id: string; readonly count: number }[];
}

/** Summary of the organisms present now that have no parent in this dish, by species (species order). */
export function founderSummary(world: World): FounderSummaryRow[] {
  const c = world.ents.cols;
  const rows = world.species.map(
    (): { count: number; eligible: number; withModule: number; modules: Record<string, number> } => ({
      count: 0,
      eligible: 0,
      withModule: 0,
      modules: {},
    }),
  );
  const canCarry = world.species.map(
    (sp) => eligibleGains(world, { ancestor: sp.id, modules: [] }).length > 0,
  );
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1 || c.generation[i] !== 0) continue;
    if ((recordField(world.lineage, 'parent', c.birthId[i]!) ?? 0) !== 0) continue;
    const r = rows[c.species[i]!]!;
    const g = world.genomes.get(c.genome[i]!);
    r.count++;
    if (canCarry[c.species[i]!] || g.modules.length > 0) r.eligible++;
    if (g.modules.length > 0) r.withModule++;
    for (const id of g.modules) r.modules[id] = (r.modules[id] ?? 0) + 1;
  }
  const out: FounderSummaryRow[] = [];
  rows.forEach((r, species) => {
    if (r.count === 0) return;
    const ids = Object.keys(r.modules).sort();
    out.push({
      species,
      count: r.count,
      eligible: r.eligible,
      withModule: r.withModule,
      modules: ids.map((id) => ({ id, count: r.modules[id]! })),
    });
  });
  return out;
}

/** One species' founders the dish was made with (tick 0), as the Evolution sheet describes them. */
export interface CreationFounderRow {
  readonly species: number;
  /** Founders introduced at 0:00 (alive or not). */
  readonly count: number;
  /** Of those, founders whose modules were present at creation (lineage origin 2: seeded by Diverse or given by the recipe). */
  readonly withModule: number;
  /** How many of those carried each module, ascending id. */
  readonly modules: readonly { readonly id: string; readonly count: number }[];
}

/** The founders the dish was made with, from the recorded lineage (read-only; never hashed). */
export interface CreationFounders {
  /** False when older records were summarized away, so the counts may be incomplete (never guessed). */
  readonly complete: boolean;
  /** Species with at least one founder at 0:00, in species order. */
  readonly rows: readonly CreationFounderRow[];
}

/**
 * Every founder introduced while the dish was at 0:00 (UX §3.3 "present at creation"): how many per
 * species, and which of them carried modules present at creation. Birth ids only increase with time, so
 * those founders are the first birth records: the scan stops at the first record born after tick 0.
 */
export function creationFounders(world: World): CreationFounders {
  const L = world.lineage;
  const rows = world.species.map(
    (): { count: number; withModule: number; modules: Record<string, number> } => ({
      count: 0,
      withModule: 0,
      modules: {},
    }),
  );
  const end = L.base + L.parent.length;
  for (let b = L.base; b < end; b++) {
    if (recordField(L, 'birthTick', b) !== 0) break;
    if (recordField(L, 'parent', b) !== 0) continue;
    const r = rows[recordField(L, 'species', b) ?? -1];
    if (!r) continue;
    r.count++;
    if (recordField(L, 'origin', b) !== 2) continue;
    const g = world.genomes.get(recordField(L, 'genome', b)!);
    if (g.modules.length === 0) continue;
    r.withModule++;
    for (const id of g.modules) r.modules[id] = (r.modules[id] ?? 0) + 1;
  }
  // Module ids in the recorded registry's order (ascending), never by iterating object keys.
  const registryIds = world.content.modules.map((d) => d.id).sort();
  const out: CreationFounderRow[] = [];
  rows.forEach((r, species) => {
    if (r.count === 0) return;
    const ids = registryIds.filter((id) => r.modules[id] !== undefined);
    out.push({
      species,
      count: r.count,
      withModule: r.withModule,
      modules: ids.map((id) => ({ id, count: r.modules[id]! })),
    });
  });
  return { complete: L.base === 1, rows: out };
}

// ------------------------------------------------------------------------------ founder origin

/**
 * How an organism came to carry one of its modules (honest labels, UX §3.3 / §5):
 *   'creation'           — it is itself a founder whose genome had the module when it was created (origin 2);
 *   'inherited-creation' — inherited unchanged from its founder, which had it at creation (origin 2);
 *   'mutation'           — gained by a recorded mutation in this dish (a birth in its line);
 *   'introduced'         — its founder was added to the dish already carrying it (e.g. a saved specimen);
 *   'unknown'            — the records that would say were summarized away (lineage compaction).
 */
export type ModuleSource = 'creation' | 'inherited-creation' | 'mutation' | 'introduced' | 'unknown';

export interface ModuleOrigin {
  readonly id: string;
  readonly source: ModuleSource;
  /** For 'mutation': the birth that gained it (this organism or an ancestor). */
  readonly gainedAtBirth?: number;
}

/**
 * How the founder's starting traits (loci) were set:
 *   'neutral' — all 50 (Identical founders, or a founder whose loci happen to be neutral);
 *   'varied'  — exactly this dish's Varied/Diverse draw for that founder (45–55 from founder.init);
 *   'carried' — different from 50 but not this dish's draw: it was added with a genome it already had
 *               (a saved specimen), so those differences were not set by the founder mode either;
 *   'unknown' — the records that would say were summarized away.
 */
export type FounderStart = 'neutral' | 'varied' | 'carried' | 'unknown';

/** Where an organism's line began, as far as the recorded lineage says (read-only; never hashed). */
export interface FounderOrigin {
  /** The founder at the root of its recorded ancestry (itself when it is a founder), or 0 when not recorded. */
  readonly founderBirthId: number;
  /** The founder's lineage origin (1 added by the player or the recipe, 2 present at creation), or -1 when not recorded. */
  readonly founderOrigin: number;
  /** Parent-to-child steps from the founder to this organism (0 for the founder itself), or -1 when not recorded. */
  readonly generationsFromFounder: number;
  /** The modules the founder carried when it was created. */
  readonly founderModules: readonly string[];
  /** How the founder's starting loci were set (see FounderStart). */
  readonly founderStart: FounderStart;
  /** Each carried module (genome order) and how this organism came to carry it. */
  readonly modules: readonly ModuleOrigin[];
}

/**
 * Whether a founder's loci are exactly what this dish's founder mode drew for it: every locus active for
 * its genome equals the Varied draw for its birthId and every other locus is 50 (pure re-derivation of
 * founderDraw; the founder mode is fixed for the life of a dish).
 */
function isVariedDraw(
  world: World,
  spIdx: number,
  birthId: number,
  loci: readonly number[],
  modules: readonly string[],
): boolean {
  const mode = world.settings.founderMode;
  if (mode !== 'varied' && mode !== 'diverse') return false;
  const sp = world.species[spIdx];
  if (!sp) return false;
  const base = neutralGenome(sp.id);
  const active = activeLoci(sp, { ...base, modules, id: '' });
  return loci.every((v, l) => v === (active[l] ? variedLocus(world, birthId, l) : 50));
}

/**
 * Walk an organism's recorded ancestry from its own birth record to its founder. A module gained by a
 * recorded mutation is attributed to the nearest birth that gained it; anything else it carries came
 * from its founder. Reads retained records and records kept for pinned branches only; if the chain
 * breaks at a compacted record, whatever is still unresolved is 'unknown' (never guessed).
 */
export function founderOriginOf(world: World, birthId: number): FounderOrigin {
  const L = world.lineage;
  const unknown: FounderOrigin = {
    founderBirthId: 0,
    founderOrigin: -1,
    generationsFromFounder: -1,
    founderModules: [],
    founderStart: 'unknown',
    modules: [],
  };
  const ownGenome = recordField(L, 'genome', birthId);
  if (ownGenome === undefined) return unknown;
  const carried = world.genomes.get(ownGenome).modules;
  const resolved: Record<string, ModuleOrigin> = {};
  const finish = (
    founder: number,
    origin: number,
    steps: number,
    founderModules: readonly string[],
    start: FounderStart,
  ): FounderOrigin => ({
    founderBirthId: founder,
    founderOrigin: origin,
    generationsFromFounder: steps,
    founderModules,
    founderStart: start,
    modules: carried.map((id) => resolved[id] ?? { id, source: 'unknown' as const }),
  });
  let b = birthId;
  let steps = 0;
  for (;;) {
    const parent = recordField(L, 'parent', b);
    if (parent === undefined) return finish(0, -1, -1, [], 'unknown');
    const flags = recordField(L, 'mutFlags', b) ?? 0;
    if (flags & MUT_MODULE_GAIN) {
      const id = world.content.modules[recordField(L, 'mutModule', b) ?? -1]?.id;
      if (id !== undefined && carried.includes(id) && resolved[id] === undefined)
        resolved[id] = { id, source: 'mutation', gainedAtBirth: b };
    }
    if (parent === 0) {
      const origin = recordField(L, 'origin', b) ?? -1;
      const fg = world.genomes.get(recordField(L, 'genome', b)!);
      for (const id of carried) {
        if (resolved[id] !== undefined || !fg.modules.includes(id)) continue;
        resolved[id] = {
          id,
          source: origin === 2 ? (b === birthId ? 'creation' : 'inherited-creation') : 'introduced',
        };
      }
      const start: FounderStart = fg.loci.every((v) => v === 50)
        ? 'neutral'
        : isVariedDraw(world, recordField(L, 'species', b) ?? -1, b, fg.loci, fg.modules)
          ? 'varied'
          : 'carried';
      return finish(b, origin, steps, fg.modules, start);
    }
    // Birth ids only ever increase from parent to child; anything else is a damaged record.
    if (parent >= b) return finish(0, -1, -1, [], 'unknown');
    b = parent;
    steps++;
  }
}
