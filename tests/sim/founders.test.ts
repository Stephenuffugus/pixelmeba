/**
 * P2.2 founder modes (SPEC §8.6, CT §6.1/§12.8, D04 §3): Identical, Varied and Diverse founders are
 * exactly as specified and deterministic per seed; a Diverse founder's module is "present at
 * creation" (lineage origin 2, never a candidate branch); and the inspector's founder-origin data says
 * honestly how an organism came to carry each module (at creation, inherited from such a founder,
 * gained by a recorded mutation, brought in with an added organism, or no longer recorded).
 */
import { describe, expect, it } from 'vitest';
import { applyNow, introduceOrganism } from '../../src/sim/commands';
import type { ContentRegistry } from '../../src/sim/content/registry';
import type { RecipeDef } from '../../src/sim/content/schema';
import {
  atCreation,
  creationFounders,
  DIVERSE_MODULE_CHANCE,
  founderOriginOf,
  founderSummary,
  VARIED_LOCUS_MAX,
  VARIED_LOCUS_MIN,
} from '../../src/sim/founders';
import { neutralGenome } from '../../src/sim/genome';
import { maskCells } from '../../src/sim/grid';
import { field, type Lineage } from '../../src/sim/lineage';
import { eligibleGains } from '../../src/sim/modules';
import { canOccupy } from '../../src/sim/movement';
import { MUT_MODULE_GAIN } from '../../src/sim/mutation';
import { activeLoci } from '../../src/sim/phenotype';
import { realizeRecipe } from '../../src/sim/recipes';
import { det, detFloat, detInt, STREAMS } from '../../src/sim/rng';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { speciesIndex, type World } from '../../src/sim/world';
import { buildInspector } from '../../src/worker/snapshot';
import { aliveOf, clearWater, registry } from '../helpers/world';

const reg = registry();

function garden(
  founderMode: RecipeDef['founderMode'],
  seed = 104729,
  mutationPreset: RecipeDef['mutationPreset'] = 'fixed',
): World {
  return realizeRecipe(reg, 'FIRST_DISH_V1', {
    seed,
    worldId: `founders-${founderMode}-${seed}`,
    transform: (r) => ({ ...r, founderMode, mutationPreset }),
  });
}

/** Living founders (no parent in this dish), in slot order. */
function founders(w: World): number[] {
  return aliveOf(w).filter((s) => (field(w.lineage, 'parent', w.ents.cols.birthId[s]!) ?? -1) === 0);
}

/** Introduce `n` founders of one species, one per open cell in row-major order (a large sample). */
function populate(w: World, speciesId: string, n: number): number[] {
  const spIdx = speciesIndex(w, speciesId);
  const sp = w.species[spIdx]!;
  const out: number[] = [];
  for (const cell of maskCells()) {
    if (out.length === n) break;
    if (!canOccupy(w, sp, cell)) continue;
    const slot = introduceOrganism(w, spIdx, cell, 'test', { exactCenter: true });
    if (slot < 0) throw new Error('capacity');
    out.push(slot);
  }
  if (out.length < n) throw new Error(`only ${out.length} cells`);
  return out;
}

/** The founder.module oracle written from SPEC §8.6 / D04 §3 (independent of founders.ts internals). */
function expectedDiverseModule(
  w: World,
  ancestor: string,
  birthId: number,
  declared: readonly string[] = [],
): string | null {
  const options = eligibleGains(w, { ancestor, modules: declared });
  if (options.length === 0) return null;
  if (detFloat(w.seed, STREAMS.founderModule, birthId, 0) >= 0.1) return null;
  return options[detInt(w.seed, STREAMS.founderModule, options.length, birthId, 1)]!;
}

function variedValue(w: World, birthId: number, locus: number): number {
  return 45 + (det(w.seed, STREAMS.founderInit, birthId, locus) % 11);
}

describe('P2.2 founder modes', () => {
  it('the recorded constants are the CT §12.8 numbers', () => {
    expect([VARIED_LOCUS_MIN, VARIED_LOCUS_MAX, DIVERSE_MODULE_CHANCE]).toEqual([45, 55, 0.1]);
  });

  it('Identical: every founder has loci 50, no modules, origin "added"', () => {
    const w = garden('identical');
    const fs = founders(w);
    expect(fs.length).toBe(56);
    for (const s of fs) {
      const g = w.genomes.get(w.ents.cols.genome[s]!);
      expect(g.loci).toEqual([50, 50, 50, 50, 50, 50, 50, 50]);
      expect(g.modules).toEqual([]);
      expect(field(w.lineage, 'origin', w.ents.cols.birthId[s]!)).toBe(1);
    }
  });

  it('Varied: each active locus is 45–55 from founder.init keyed by birthId; inactive loci stay 50; no modules', () => {
    const w = garden('varied');
    let differs = 0;
    for (const s of founders(w)) {
      const b = w.ents.cols.birthId[s]!;
      const sp = w.species[w.ents.cols.species[s]!]!;
      const g = w.genomes.get(w.ents.cols.genome[s]!);
      const active = activeLoci(sp, g);
      expect(g.modules).toEqual([]);
      g.loci.forEach((v, l) => {
        if (active[l]) {
          expect(v).toBe(variedValue(w, b, l));
          expect(v).toBeGreaterThanOrEqual(45);
          expect(v).toBeLessThanOrEqual(55);
          if (v !== 50) differs++;
        } else expect(v).toBe(50);
      });
    }
    expect(differs).toBeGreaterThan(100);
  });

  it('Varied: the 45–55 draw covers every value evenly (7 active loci × 2,000 Sprinters)', () => {
    const w = clearWater({ founderMode: 'varied', seed: 7 });
    const slots = populate(w, 'B01', 2000);
    const counts = new Array<number>(11).fill(0);
    for (const s of slots) {
      const g = w.genomes.get(w.ents.cols.genome[s]!);
      for (let l = 0; l < 7; l++) counts[g.loci[l]! - 45]!++;
      expect(g.loci[7]).toBe(50); // dormancy is inactive without E03
    }
    const n = 2000 * 7;
    const mean = n / 11;
    const sd = Math.sqrt(n * (1 / 11) * (10 / 11));
    for (const c of counts) expect(Math.abs(c - mean)).toBeLessThan(5 * sd);
    expect(counts.every((c) => c > 0)).toBe(true);
  });

  it('Diverse: each eligible founder has a module exactly when its founder.module roll is under 10 %, chosen uniformly among legal gains', () => {
    for (const seed of [104729, 101, 102]) {
      const w = garden('diverse', seed);
      for (const s of founders(w)) {
        const b = w.ents.cols.birthId[s]!;
        const sp = w.species[w.ents.cols.species[s]!]!;
        const g = w.genomes.get(w.ents.cols.genome[s]!);
        const want = expectedDiverseModule(w, sp.id, b);
        expect(g.modules).toEqual(want ? [want] : []);
        // Varied loci, computed with the final module set (a seeded E03 varies the dormancy locus too).
        const active = activeLoci(sp, g);
        g.loci.forEach((v, l) => expect(v).toBe(active[l] ? variedValue(w, b, l) : 50));
        // Present at creation: lineage origin 2 exactly for founders with a seeded module.
        expect(field(w.lineage, 'origin', b)).toBe(want ? 2 : 1);
        // Its reference genome is its own: a seeded ability is never evolved variation.
        expect(w.ents.cols.refGenome[s]).toBe(w.ents.cols.genome[s]);
        expect(w.ents.cols.candRoot[s]).toBe(0);
      }
    }
  });

  it('Diverse: about 10 % of 3,000 eligible founders get one module, uniform over the legal choices', () => {
    const w = clearWater({ founderMode: 'diverse', seed: 11 });
    const slots = [...populate(w, 'B01', 1500), ...populate(w, 'B04', 1500)];
    const byModule: Record<string, number> = {};
    let withModule = 0;
    let e03Dormancy = 0;
    for (const s of slots) {
      const g = w.genomes.get(w.ents.cols.genome[s]!);
      expect(g.modules.length).toBeLessThanOrEqual(1);
      if (g.modules.length === 0) {
        expect(g.loci[7]).toBe(50);
        continue;
      }
      withModule++;
      const m = g.modules[0]!;
      byModule[m] = (byModule[m] ?? 0) + 1;
      if (m === 'E03') {
        expect(g.loci[7]).toBeGreaterThanOrEqual(45);
        expect(g.loci[7]).toBeLessThanOrEqual(55);
        if (g.loci[7] !== 50) e03Dormancy++;
      }
    }
    const n = slots.length;
    const sd = Math.sqrt(n * 0.1 * 0.9);
    expect(Math.abs(withModule - 0.1 * n)).toBeLessThan(5 * sd);
    // B01 and B04 may gain E01, E03 or E05 (CT §7.1); each is equally likely.
    expect(Object.keys(byModule).sort()).toEqual(['E01', 'E03', 'E05']);
    const each = withModule / 3;
    const sdEach = Math.sqrt(withModule * (1 / 3) * (2 / 3));
    for (const c of Object.values(byModule)) expect(Math.abs(c - each)).toBeLessThan(5 * sdEach);
    expect(e03Dormancy).toBeGreaterThan(0);
  });

  it('Diverse: founders with no legal gain never receive one (full slots; a registry without modules)', () => {
    const w = clearWater({ founderMode: 'diverse', seed: 11 });
    const spIdx = speciesIndex(w, 'B01');
    const cells = maskCells()
      .filter((c) => canOccupy(w, w.species[spIdx]!, c))
      .slice(0, 400);
    for (const cell of cells) {
      const s = introduceOrganism(w, spIdx, cell, 'test', {
        modules: ['E01', 'E03', 'E05'],
        exactCenter: true,
      });
      expect(w.genomes.get(w.ents.cols.genome[s]!).modules).toEqual(['E01', 'E03', 'E05']);
    }
    const bare: ContentRegistry = { ...reg, manifest: { ...reg.manifest, enabledModules: [] } };
    const none = realizeRecipe(bare, 'FIRST_DISH_V1', {
      worldId: 'no-modules',
      transform: (r) => ({ ...r, founderMode: 'diverse' }),
    });
    expect(none.content.modules).toEqual([]);
    for (const s of founders(none)) expect(none.genomes.get(none.ents.cols.genome[s]!).modules).toEqual([]);
    expect(founderSummary(none).every((r) => r.eligible === 0 && r.withModule === 0)).toBe(true);
  });

  it('Diverse applies to life added at 0:00 too (same stateless rule, keyed by birthId)', () => {
    const w = clearWater({ founderMode: 'diverse', seed: 5 });
    expect(atCreation(w)).toBe(true);
    const slots = populate(w, 'B06', 600);
    let seeded = 0;
    for (const s of slots) {
      const b = w.ents.cols.birthId[s]!;
      const want = expectedDiverseModule(w, 'B06', b);
      expect(w.genomes.get(w.ents.cols.genome[s]!).modules).toEqual(want ? [want] : []);
      expect(field(w.lineage, 'origin', b)).toBe(want ? 2 : 1);
      if (want) seeded++;
    }
    expect(seeded).toBeGreaterThan(20);
  });

  it('life added after 0:00 in a Diverse dish gets varied traits only: no ability, labelled added, never "present at creation"', () => {
    const w = clearWater({ founderMode: 'diverse', seed: 5 });
    run(w, 1);
    expect(atCreation(w)).toBe(false);
    const slots = populate(w, 'B06', 600);
    let wouldHave = 0;
    for (const s of slots) {
      const b = w.ents.cols.birthId[s]!;
      const g = w.genomes.get(w.ents.cols.genome[s]!);
      // The 0:00 rule would have given some of these birth ids an ability (so this checks the tick rule).
      if (expectedDiverseModule(w, 'B06', b)) wouldHave++;
      expect(g.modules).toEqual([]);
      expect(field(w.lineage, 'origin', b)).toBe(1);
      const active = activeLoci(w.species[w.ents.cols.species[s]!]!, g);
      g.loci.forEach((v, l) => expect(v).toBe(active[l] ? variedValue(w, b, l) : 50));
      const o = founderOriginOf(w, b);
      expect(o.founderOrigin).toBe(1);
      expect(o.founderStart).toBe('varied');
    }
    expect(wouldHave).toBeGreaterThan(20);

    // The Add Life command mid-run in a Diverse garden (the verifier's case: 5 s in, several species).
    const g = garden('diverse', 104729);
    run(g, 50);
    const firstNew = g.counters.nextBirthId;
    for (const [k, speciesId] of ['A01', 'B01', 'B04', 'B06'].entries()) {
      for (let j = 0; j < 5; j++)
        applyNow(g, `add-${k}-${j}`, {
          kind: 'inoculate',
          speciesId,
          x: 30 + 17 * k,
          y: 30 + 15 * j,
          radius: 3,
          count: 5,
        });
    }
    expect(g.counters.nextBirthId - firstNew).toBeGreaterThan(40);
    for (let b = firstNew; b < g.counters.nextBirthId; b++) {
      if (field(g.lineage, 'parent', b) !== 0) continue; // births during the run
      expect(field(g.lineage, 'origin', b)).toBe(1);
      expect(g.genomes.get(field(g.lineage, 'genome', b)!).modules).toEqual([]);
    }
  });

  it('every mode is deterministic per seed, and different seeds give different founders', () => {
    for (const mode of ['identical', 'varied', 'diverse'] as const) {
      const a = garden(mode, 104729);
      const b = garden(mode, 104729);
      expect(stateHash(b)).toBe(stateHash(a));
      const genomesOf = (w: World) => founders(w).map((s) => w.genomes.get(w.ents.cols.genome[s]!).id);
      expect(genomesOf(b)).toEqual(genomesOf(a));
      if (mode !== 'identical') expect(genomesOf(garden(mode, 104730))).not.toEqual(genomesOf(a));
    }
    // Diverse on the six development seeds: the module assignments differ between seeds.
    const assign = (seed: number) => {
      const w = garden('diverse', seed);
      return founders(w)
        .map((s) => w.genomes.get(w.ents.cols.genome[s]!).modules.join('+'))
        .join(',');
    };
    expect(assign(101)).not.toBe(assign(102));
  });

  it('founderSummary counts founders, eligible founders and seeded modules per species', () => {
    const w = garden('diverse', 104729);
    const rows = founderSummary(w);
    expect(rows.map((r) => w.species[r.species]!.id)).toEqual(['A01', 'B01', 'B04', 'B06']);
    expect(rows.map((r) => r.count)).toEqual([12, 24, 8, 12]);
    let total = 0;
    for (const s of founders(w)) if (w.genomes.get(w.ents.cols.genome[s]!).modules.length > 0) total++;
    expect(rows.reduce((a, r) => a + r.withModule, 0)).toBe(total);
    // Every enabled Phase 2 species can carry at least E05, so every founder is eligible.
    expect(rows.every((r) => r.eligible === r.count)).toBe(true);
  });

  it('creationFounders lists what the founders placed at 0:00 carried, recipe-given abilities included, and nothing added later', () => {
    // Experiment C's dish: Identical founders, and the recipe gives the odd-numbered Sprinters a reserve chamber.
    const x = realizeRecipe(reg, 'RESERVE_COMPARE_V1', { worldId: 'creation-exp-c' });
    expect(x.settings.founderMode).toBe('identical');
    const atStart = creationFounders(x);
    expect(atStart).toEqual({
      complete: true,
      rows: [
        { species: speciesIndex(x, 'B01'), count: 24, withModule: 12, modules: [{ id: 'E05', count: 12 }] },
      ],
    });
    run(x, 200);
    applyNow(x, 'later', { kind: 'inoculate', speciesId: 'B01', x: 64, y: 64, radius: 4, count: 5 });
    expect(creationFounders(x)).toEqual(atStart); // recorded history: the dead are still counted, later additions never

    // A Diverse garden: the same founders and abilities New Dish summarized at creation.
    const w = garden('diverse', 104729);
    const summary = founderSummary(w);
    const c = creationFounders(w);
    expect(c.rows.map((r) => [r.species, r.count, r.withModule, r.modules])).toEqual(
      summary.map((r) => [r.species, r.count, r.withModule, r.modules]),
    );
    expect(c.rows.reduce((a, r) => a + r.withModule, 0)).toBeGreaterThan(0);
  });
});

/**
 * One Diverse garden at Fixed Traits (descendants carry the founder genome exactly, so every module
 * they carry came from creation): its seeded founders and their origin at tick 0, then 1,000 ticks
 * run. Built once, because running a garden is the slow part of these tests.
 */
interface SeededAtStart {
  readonly birthId: number;
  readonly varied: boolean;
  readonly origin: ReturnType<typeof founderOriginOf>;
}
let shared: { readonly world: World; readonly seeded: readonly SeededAtStart[] } | null = null;
function fixedDiverseRun(): { readonly world: World; readonly seeded: readonly SeededAtStart[] } {
  if (shared) return shared;
  const world = garden('diverse', 104729, 'fixed');
  const seeded = founders(world)
    .filter((s) => world.genomes.get(world.ents.cols.genome[s]!).modules.length > 0)
    .map((s) => {
      const birthId = world.ents.cols.birthId[s]!;
      return {
        birthId,
        varied: world.genomes.get(world.ents.cols.genome[s]!).loci.some((v) => v !== 50),
        origin: founderOriginOf(world, birthId),
      };
    });
  run(world, 1000);
  shared = { world, seeded };
  return shared;
}

describe('P2.2 founder origin (inspector "present at creation" and after)', () => {
  it('a seeded founder says "creation"; its descendants say "inherited-creation" from that founder', () => {
    const { world, seeded } = fixedDiverseRun();
    expect(seeded.length).toBeGreaterThan(0);
    for (const { birthId: b, varied, origin: o } of seeded) {
      expect(o.founderBirthId).toBe(b);
      expect(o.founderOrigin).toBe(2);
      expect(o.generationsFromFounder).toBe(0);
      expect(o.modules.length).toBeGreaterThan(0);
      expect(o.modules.map((m) => m.source)).toEqual(o.modules.map(() => 'creation'));
      expect(o.founderStart).toBe(varied ? 'varied' : 'neutral');
    }
    const seededIds = new Set(seeded.map((x) => x.birthId));
    let checked = 0;
    for (const s of aliveOf(world)) {
      const b = world.ents.cols.birthId[s]!;
      const o = founderOriginOf(world, b);
      if (!seededIds.has(o.founderBirthId) || o.generationsFromFounder === 0) continue;
      checked++;
      expect(o.founderOrigin).toBe(2);
      expect(o.generationsFromFounder).toBe(world.ents.cols.generation[s]);
      expect(o.modules.length).toBeGreaterThan(0);
      for (const m of o.modules) expect(m.source).toBe('inherited-creation');
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('a module gained by a recorded mutation is attributed to that birth, for it and its descendants', () => {
    const w = realizeRecipe(reg, 'FIRST_DISH_V1', {
      seed: 101,
      worldId: 'origin-mutation',
      transform: (r) => ({ ...r, mutationPreset: 'accelerated' }),
    });
    let found: { holder: number; gain: number; id: string } | null = null;
    for (let t = 0; t < 12 && !found; t++) {
      run(w, 500);
      for (const s of aliveOf(w)) {
        const b = w.ents.cols.birthId[s]!;
        const o = founderOriginOf(w, b);
        const m = o.modules.find((x) => x.source === 'mutation');
        if (m) {
          found = { holder: b, gain: m.gainedAtBirth!, id: m.id };
          break;
        }
      }
    }
    expect(found).not.toBeNull();
    const { holder, gain, id } = found!;
    expect((field(w.lineage, 'mutFlags', gain)! & MUT_MODULE_GAIN) !== 0).toBe(true);
    expect(w.content.modules[field(w.lineage, 'mutModule', gain)!]!.id).toBe(id);
    // The gaining birth is the holder itself or one of its recorded ancestors.
    let b = holder;
    while (b !== gain && b > 0) b = field(w.lineage, 'parent', b)!;
    expect(b).toBe(gain);
    // An identical-founder dish never labels an evolved module as present at creation.
    expect(founderOriginOf(w, holder).founderOrigin).toBe(1);
  });

  it('an organism added carrying a genome with a module (a saved specimen) says "introduced"', () => {
    const w = clearWater({ seed: 3 });
    const spIdx = speciesIndex(w, 'B01');
    const genome = w.genomes.intern({ ...neutralGenome('B01'), modules: ['E05'] });
    const cell = maskCells().find((c) => canOccupy(w, w.species[spIdx]!, c))!;
    const s = introduceOrganism(w, spIdx, cell, 'specimen', { genome });
    const o = founderOriginOf(w, w.ents.cols.birthId[s]!);
    expect(o.founderOrigin).toBe(1);
    expect(o.modules).toEqual([{ id: 'E05', source: 'introduced' }]);
    expect(o.founderStart).toBe('neutral');
  });

  it('a founder added with a genome it already had is never labelled as a varied founder, in any founder mode', () => {
    for (const founderMode of ['identical', 'varied', 'diverse'] as const) {
      const w = clearWater({ seed: 3, founderMode });
      const spIdx = speciesIndex(w, 'B01');
      // An evolved genome (as a saved specimen carries): loci away from 50, as no founder draw sets them.
      const genome = w.genomes.intern({ ...neutralGenome('B01'), loci: [60, 44, 50, 57, 50, 50, 50, 50] });
      const cells = maskCells().filter((c) => canOccupy(w, w.species[spIdx]!, c));
      const s = introduceOrganism(w, spIdx, cells[0]!, 'specimen', { genome });
      const o = founderOriginOf(w, w.ents.cols.birthId[s]!);
      expect(o.founderStart).toBe('carried');
      expect(o.generationsFromFounder).toBe(0);
      // A founder the mode drew in the same dish is 'varied' in Varied/Diverse and 'neutral' in Identical.
      const drawn = introduceOrganism(w, spIdx, cells[1]!, 'test', {});
      expect(founderOriginOf(w, w.ents.cols.birthId[drawn]!).founderStart).toBe(
        founderMode === 'identical' ? 'neutral' : 'varied',
      );
    }
  });

  it('when older records were compacted away the source is "unknown", never guessed', () => {
    const w = fixedDiverseRun().world; // the last test to use the shared run: it edits its lineage
    const descendant = aliveOf(w).find(
      (s) => w.ents.cols.generation[s]! >= 2 && w.genomes.get(w.ents.cols.genome[s]!).modules.length > 0,
    );
    expect(descendant).toBeDefined();
    const b = w.ents.cols.birthId[descendant!]!;
    expect(founderOriginOf(w, b).modules.every((m) => m.source === 'inherited-creation')).toBe(true);
    expect(founderOriginOf(w, b).founderStart).not.toBe('unknown');
    // Drop every record older than the descendant's parent, as compaction does (test-only surgery).
    const L = w.lineage;
    const parent = field(L, 'parent', b)!;
    const drop = parent - L.base;
    const keys: (keyof Lineage)[] = [
      'parent',
      'genome',
      'birthTick',
      'generation',
      'species',
      'entityId',
      'deathTick',
      'deathCause',
      'origin',
      'mutFlags',
      'mutLocus',
      'mutDelta',
      'mutModule',
    ];
    for (const k of keys) (L[k] as number[]).splice(0, drop);
    L.base += drop;
    const o = founderOriginOf(w, b);
    expect(o.founderBirthId).toBe(0);
    expect(o.founderOrigin).toBe(-1);
    expect(o.modules.length).toBeGreaterThan(0);
    for (const m of o.modules) expect(m.source).toBe('unknown');
    expect(o.founderStart).toBe('unknown');
  });

  it('the inspector payload carries the founder origin', () => {
    const w = garden('diverse', 104729, 'fixed');
    const s = founders(w).find((x) => w.genomes.get(w.ents.cols.genome[x]!).modules.length > 0)!;
    const b = w.ents.cols.birthId[s]!;
    const p = buildInspector(w, { kind: 'entity', birthId: b });
    expect(p.entity?.origin).toBe(2);
    expect(p.entity?.founderOrigin).toEqual(founderOriginOf(w, b));
    expect(p.entity?.founderOrigin?.modules.every((m) => m.source === 'creation')).toBe(true);
  });
});
