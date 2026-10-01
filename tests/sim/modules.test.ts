/**
 * P2.1 supplementary module registry (SPEC §9; CT §7.1–7.2): versioned eligibility by ancestor ID
 * read from the world's recorded registry, three slots, native-duplicate rejection, combination
 * validation at proposal time, uniform gain/loss draws, and the manifest/implementation gate.
 */
import { describe, expect, it } from 'vitest';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { moduleSetProblem } from '../../src/sim/content/moduleRules';
import { IMPLEMENTED_MODULES } from '../../src/sim/content/implemented';
import { neutralGenome } from '../../src/sim/genome';
import { eligibleGains, lossOptions, validateModuleSet } from '../../src/sim/modules';
import { draftDaughter, MUT_MODULE_GAIN, MUT_MODULE_LOSS } from '../../src/sim/mutation';
import { activeLoci } from '../../src/sim/phenotype';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import type { World } from '../../src/sim/world';
import { clearWater, registry } from '../helpers/world';
import { G2_LISTS, registryWith } from '../helpers/registry';

function genome(w: World, ancestor: string, modules: string[] = []) {
  return w.genomes.get(w.genomes.intern({ ...neutralGenome(ancestor), modules }));
}

/** Count module events over many deterministic parent ids (both daughters). */
function tally(w: World, ancestor: string, modules: string[], n: number): { gain: Record<string, number>; loss: Record<string, number> } {
  const g = genome(w, ancestor, modules);
  const gain: Record<string, number> = {};
  const loss: Record<string, number> = {};
  for (let pb = 1; pb <= n; pb++) {
    for (const d of [0, 1]) {
      const draft = draftDaughter(w, g, pb, d);
      if (draft.flags & MUT_MODULE_GAIN) {
        const added = draft.input.modules.find((m) => !modules.includes(m))!;
        gain[added] = (gain[added] ?? 0) + 1;
      }
      if (draft.flags & MUT_MODULE_LOSS) {
        const gone = modules.find((m) => !draft.input.modules.includes(m))!;
        loss[gone] = (loss[gone] ?? 0) + 1;
      }
    }
  }
  return { gain, loss };
}

describe('P2.1 module registry', () => {
  it('the Phase 2 manifest enables exactly E01, E03 and E05, all implemented', () => {
    const reg = registry();
    expect(reg.manifest.enabledModules).toEqual(['E01', 'E03', 'E05']);
    // The Phase 2 manifest is the g2 build's (tests/fixtures/saves/g2-manifest.json); the shipped one
    // moved to build phase 3 in the Phase 3 preflight (D-0036).
    const g2 = registryWith(G2_LISTS);
    expect(g2.manifest.buildPhase).toBe(2);
    expect(g2.manifest.enabledModules).toEqual(['E01', 'E03', 'E05']);
    for (const id of g2.manifest.enabledModules) expect(IMPLEMENTED_MODULES).toContain(id);
    for (const id of reg.manifest.enabledModules) expect(IMPLEMENTED_MODULES).toContain(id);
    const w = clearWater();
    expect(w.content.modules.map((m) => m.id)).toEqual(['E01', 'E03', 'E05']);
  });

  it('eligibility by ancestor for the core roster (D06: E01 B01/B04; E03 B01/B04/B06; E05 all five)', () => {
    const w = clearWater();
    const expected: Record<string, string[]> = { A01: ['E05'], B01: ['E01', 'E03', 'E05'], B04: ['E01', 'E03', 'E05'], B06: ['E03', 'E05'], P01: ['E05'] };
    for (const id of Object.keys(expected).sort()) expect(eligibleGains(w, { ancestor: id, modules: [] }), id).toEqual(expected[id]);
  });

  it('three slots at most; a full genome has no gain options', () => {
    const w = clearWater();
    expect(eligibleGains(w, { ancestor: 'B01', modules: ['E01', 'E03'] })).toEqual(['E05']);
    expect(eligibleGains(w, { ancestor: 'B01', modules: ['E01', 'E03', 'E05'] })).toEqual([]);
    const reg = registry();
    const all = reg.moduleIds.map((id) => reg.modules[id]!);
    expect(moduleSetProblem(all, reg.species.B01!, ['E01', 'E02', 'E03', 'E05'])).toMatch(/at most 3/);
    expect(moduleSetProblem(all, reg.species.B01!, ['E05', 'E03'])).toMatch(/sorted/);
    expect(validateModuleSet(w, 'B01', ['E01', 'E03', 'E05'])).toBeNull();
    expect(validateModuleSet(w, 'A01', ['E03'])).toMatch(/not eligible/);
  });

  it('combinations are validated at proposal time: exclusions, prerequisites, no parasites/viruses', () => {
    const reg = registry();
    const all = reg.moduleIds.map((id) => reg.modules[id]!);
    const b01 = reg.species.B01!;
    expect(moduleSetProblem(all, b01, ['E04', 'E13'])).toMatch(/cannot be combined/);
    expect(moduleSetProblem(all, b01, ['E15'])).toMatch(/requires E12/);
    expect(moduleSetProblem(all, b01, ['E12', 'E15'])).toBeNull();
    expect(moduleSetProblem(all, reg.species.X01!, ['E05'])).toMatch(/parasite/);
    expect(moduleSetProblem(all, reg.species.V01!, ['E05'])).toMatch(/virus/);
    // Loss options never break a prerequisite: E12 cannot be lost while E15 needs it.
    const full = allModulesWorld(reg);
    expect(lossOptions(full, { ancestor: 'B01', modules: ['E12', 'E15'] })).toEqual(['E15']);
    // Gains never propose a conflicting set.
    for (const id of eligibleGains(full, { ancestor: 'B01', modules: ['E04'] })) {
      expect(moduleSetProblem(all, b01, [...['E04'], id].sort()), id).toBeNull();
    }
    expect(eligibleGains(full, { ancestor: 'B01', modules: ['E04'] })).not.toContain('E13');
  });

  it('gain and loss draws are uniform among the legal options, and only when the rate fires', () => {
    const w = clearWater({ mutationPreset: 'accelerated' });
    const { gain } = tally(w, 'B01', [], 60000);
    const total = Object.values(gain).reduce((a, b) => a + b, 0);
    // Accelerated: module event 1 % × gain half ⇒ ≈ 0.5 % of daughters.
    expect(total / 120000).toBeGreaterThan(0.004);
    expect(total / 120000).toBeLessThan(0.006);
    for (const id of ['E01', 'E03', 'E05']) expect(gain[id]! / total, id).toBeGreaterThan(0.27);
    for (const id of ['E01', 'E03', 'E05']) expect(gain[id]! / total, id).toBeLessThan(0.4);
    const { loss } = tally(w, 'B01', ['E01', 'E03', 'E05'], 60000);
    const lt = Object.values(loss).reduce((a, b) => a + b, 0);
    for (const id of ['E01', 'E03', 'E05']) expect(loss[id]! / lt, id).toBeGreaterThan(0.27);
    // Fixed Traits never changes modules.
    const fixed = clearWater({ mutationPreset: 'fixed' });
    const f = tally(fixed, 'B01', ['E05'], 5000);
    expect(f.gain).toEqual({});
    expect(f.loss).toEqual({});
  });

  it("eligibility is read from the world's recorded registry, never the build's current one", () => {
    const reg = registry();
    const edited: ContentRegistry = {
      ...reg,
      modules: { ...reg.modules, E01: { ...reg.modules.E01!, eligibleAncestors: ['B04'] } },
    };
    const w = realizeRecipe(edited, { ...reg.recipes.FIRST_DISH_V1!, founders: [] }, { worldId: 'edited' });
    expect(eligibleGains(w, { ancestor: 'B01', modules: [] })).toEqual(['E03', 'E05']);
    const current = clearWater();
    expect(eligibleGains(current, { ancestor: 'B01', modules: [] })).toEqual(['E01', 'E03', 'E05']);
    // Saved and reloaded, the dish keeps its own registry.
    const back = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))) as ReturnType<typeof serializeWorld>);
    expect(eligibleGains(back, { ancestor: 'B01', modules: [] })).toEqual(['E03', 'E05']);
  });

  it('an E03 carrier also carries an active dormancy locus, which mutation may then vary', () => {
    const w = clearWater({ mutationPreset: 'accelerated' });
    const sp = w.species.find((s) => s.id === 'B01')!;
    expect(activeLoci(sp, genome(w, 'B01'))[7]).toBe(false);
    expect(activeLoci(sp, genome(w, 'B01', ['E03']))[7]).toBe(true);
    const plain = genome(w, 'B01');
    const e03 = genome(w, 'B01', ['E03']);
    let plainHits = 0;
    let e03Hits = 0;
    for (let pb = 1; pb <= 20000; pb++) {
      if (draftDaughter(w, plain, pb, 0).locus === 7) plainHits++;
      if (draftDaughter(w, e03, pb, 0).locus === 7) e03Hits++;
    }
    expect(plainHits).toBe(0);
    expect(e03Hits).toBeGreaterThan(50);
  });
});

/** A world whose recorded registry holds every module (for combination rules only; never run). */
function allModulesWorld(reg: ContentRegistry): World {
  const w = clearWater();
  return { ...w, content: { ...w.content, modules: reg.moduleIds.map((id) => reg.modules[id]!) } };
}
