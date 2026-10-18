/**
 * The eight Phase 5 habitat records and the validator's habitat checks (P5.4; CT §8.2, §4, §5.2, §14;
 * g5-briefs H1, H4; D-0106, D-0116, D-0122, D-0128).
 * - The records validate with the eight enabled; since THE HABITAT ENABLE (D-0130) the shipped manifest
 *   enables them, so habitatRegistry() is the shipped registry.
 * - Each validator rule, through patched raw packs (patchedRawPacks + validateContent, issues filtered by file
 *   and path): a phase 5 habitat enabled at build phase 4; the one offer rule (habitatRules.ts) for a
 *   structure, a system and a material the manifest lacks; regions (seven, a repeated id, an anchor outside
 *   its shape); objects (on a stone, two on one cell); furnished areas (over an explicit device, the shared
 *   256 cap); a community group naming an unknown region; community: true without a Suggested Community;
 *   a founder chain across an S01 edge of its habitat (refused at validation and at realization) and the same
 *   chain on a habitat without the edge (accepted).
 * - habitatUses() of every record as a literal table, and the offer rule on the shipped manifest.
 * Mutants checked by hand: the phase check removed; the founder-chain check removed; habitatOfferProblem
 * ignoring field systems (H07 offered without silicate).
 */
import { describe, expect, it } from 'vitest';
import { validateContent, type ContentIssue, type RawFile, type RawPacks } from '../../src/sim/content/registry';
import { RecipeSchema, type HabitatDef } from '../../src/sim/content/schema';
import { communityOffered, communityOfferProblem, habitatOffered, habitatOfferProblem, habitatUses, regionCells } from '../../src/sim/content/habitatRules';
import { fungalNeighbors } from '../../src/sim/links';
import { furnishCells, realizeRecipe, RecipeError } from '../../src/sim/recipes';
import { contentHashOf, patchedRawPacks, type ManifestPatch } from '../helpers/registry';
import { HABITAT_IDS, habitatRegistry } from '../helpers/habitats';
import { registry } from '../helpers/world';

const shipped = registry().manifest;
const ENABLED: ManifestPatch = { enabledHabitats: [...new Set([...shipped.enabledHabitats, ...HABITAT_IDS])].sort() };
/** The v1.0 habitats: the shipped list before THE HABITAT ENABLE (D-0130). */
const V1_HABITATS = ['GEL_COLONY', 'SEDIMENT_EDGE', 'WATER_GARDEN'];

type Raw = Record<string, unknown>;
function validate(patch: ManifestPatch, edit?: (raw: RawPacks) => void): ContentIssue[] {
  const raw = patchedRawPacks(patch);
  edit?.(raw);
  (raw.manifest.data as Raw).contentHash = contentHashOf(raw);
  return validateContent(raw).issues.filter((i) => i.severity === 'error');
}
const habitatData = (raw: RawPacks, id: string): Raw => raw.habitats.find((f) => (f.data as Raw).id === id)!.data as Raw;
const errorsOn = (issues: readonly ContentIssue[], fileEnd: string, path?: string) =>
  issues.filter((i) => i.file.endsWith(fileEnd) && (path === undefined || i.path === path)).map((i) => i.message);
const without = <T,>(list: readonly T[], x: T): T[] => list.filter((y) => y !== x);

describe('the eight records', () => {
  it('validate with the eight enabled, and the shipped manifest enables them (THE HABITAT ENABLE, D-0130)', () => {
    const reg = habitatRegistry();
    for (const id of HABITAT_IDS) expect(reg.habitats[id]?.phase, id).toBe(5);
    expect(shipped.enabledHabitats).toEqual([...V1_HABITATS, ...HABITAT_IDS].sort());
    expect(Object.keys(registry().habitats).sort()).toEqual([...shipped.enabledHabitats]);
    // So the habitat fixtures' test registry is the shipped one (their determinism and save cases run as shipped).
    expect(reg.manifest).toEqual(registry().manifest);
    expect(validate(ENABLED)).toEqual([]);
  });

  it('are offered by the shipped manifest (structures, systems and materials all shipped), and so are their Suggested Communities (wave 14 stage 2)', () => {
    for (const id of HABITAT_IDS) {
      const h = registry().habitats[id]!;
      expect(habitatOfferProblem(h, shipped), id).toBeNull();
      expect(habitatOffered(h, shipped)).toBe(true);
      expect(communityOfferProblem(h, shipped, registry().species)).toBeNull();
      expect(communityOffered(h, shipped, registry().species)).toBe(true);
    }
  });

  it('habitatUses of every record', () => {
    const uses = Object.fromEntries(HABITAT_IDS.map((id) => [id, habitatUses(registry().habitats[id]!)]));
    expect(uses).toEqual({
      H04_LEAF_POOL: { structures: ['S06', 'S07'], systems: ['core', 'devices', 'foodObjects'], materials: ['M11'] },
      H05_BRINE_MOSAIC: { structures: [], systems: ['core'], materials: [] },
      H06_DUSK_MARSH: { structures: [], systems: ['climate', 'core'], materials: [] },
      H07_GLASS_GARDEN: { structures: ['S06'], systems: ['core', 'devices', 'silicate'], materials: [] },
      H08_NIGHT_LANTERNS: { structures: [], systems: ['climate', 'core'], materials: [] },
      H09_DRYING_LACE: { structures: ['S11', 'S12'], systems: ['climate', 'core', 'devices'], materials: [] },
      H10_GATE_LAB: { structures: ['S01', 'WALL'], systems: ['barriers', 'core'], materials: [] },
      H11_GRAZING_MEADOW: { structures: ['S06'], systems: ['climate', 'core', 'devices'], materials: [] },
    });
    // The v1.0 habitats: their stones, and nothing else.
    expect(habitatUses(registry().habitats.WATER_GARDEN!)).toEqual({ structures: ['STONE'], systems: ['core'], materials: [] });
  });

  it('furnished areas and regions cover the D-table cells', () => {
    const h = (id: string) => registry().habitats[id]!;
    expect(furnishCells(h('H04_LEAF_POOL').furnish![0]!.area).length).toBe(197);
    expect(furnishCells(h('H07_GLASS_GARDEN').furnish![0]!.area).length).toBe(56);
    expect(furnishCells(h('H09_DRYING_LACE').furnish![0]!.area).length).toBe(197);
    expect(furnishCells(h('H11_GRAZING_MEADOW').furnish![0]!.area).length).toBe(88);
    // Region shapes are clipped to the dish.
    const left = h('H10_GATE_LAB').regions!.find((r) => r.id === 'LEFT_SIDE')!;
    expect(regionCells(left).length).toBeGreaterThan(0);
    expect(regionCells(left).length).toBeLessThan(64 * 128);
  });
});

describe('validator: shipped habitats (g5-briefs H4)', () => {
  it('a phase 5 habitat enabled at build phase 4 is an error on the manifest', () => {
    const issues = validate({ buildPhase: 4, enabledHabitats: [...V1_HABITATS, 'H04_LEAF_POOL'].sort() });
    const i = [...V1_HABITATS, 'H04_LEAF_POOL'].sort().indexOf('H04_LEAF_POOL');
    expect(errorsOn(issues, 'manifest.json', `enabledHabitats.${i}`)).toEqual(['"H04_LEAF_POOL" belongs to phase 5 (build phase 4)']);
  });

  it('H10 enabled without S01: its edges need the structure', () => {
    const issues = validate({ ...ENABLED, enabledStructures: without(shipped.enabledStructures!, 'S01') });
    expect(errorsOn(issues, 'H10_GATE_LAB.json')).toEqual(['It places structure S01, which these rules do not include.']);
    expect(errorsOn(issues, 'H10_GATE_LAB.json', 'edges')).toHaveLength(1);
  });

  it('H07 enabled without silicate: the offer rule names the field system', () => {
    const issues = validate({ ...ENABLED, enabledSystems: without(shipped.enabledSystems, 'silicate') });
    expect(errorsOn(issues, 'H07_GLASS_GARDEN.json', 'baseFields')).toEqual(['It needs the "silicate" system (not enabled).']);
  });

  it('H04 enabled without M11: the offer rule names the material', () => {
    const issues = validate({ ...ENABLED, enabledMaterials: without(shipped.enabledMaterials, 'M11') });
    expect(errorsOn(issues, 'H04_LEAF_POOL.json', 'objects')).toEqual(['It uses material M11 (not enabled).']);
  });

  it('H06 enabled without climate: its light cycle', () => {
    const issues = validate({ ...ENABLED, enabledSystems: without(shipped.enabledSystems, 'climate') });
    expect(errorsOn(issues, 'H06_DUSK_MARSH.json')).toEqual(['Its light cycle needs the "climate" system (not in these rules).']);
  });

  it('the offer rule is the same sentence the validator reports', () => {
    const h = registry().habitats.H07_GLASS_GARDEN!;
    expect(habitatOfferProblem(h, { ...shipped, enabledSystems: without(shipped.enabledSystems, 'silicate') })).toBe('It needs the "silicate" system (not enabled).');
    expect(habitatOfferProblem(h, { ...shipped, buildPhase: 4 })).toBe('It belongs to phase 5 (build phase 4).');
    expect(habitatOfferProblem(registry().habitats.H10_GATE_LAB!, { ...shipped, enabledStructures: without(shipped.enabledStructures!, 'S01') })).toBe('It uses structure S01 (not enabled).');
  });
});

describe('validator: every habitat record (shipped or not)', () => {
  const edit = (id: string, f: (h: Raw) => void) => (raw: RawPacks) => f(habitatData(raw, id));

  it('a record present but not enabled is still checked: a build listing only the v1.0 habitats (D-0130)', () => {
    // Since THE HABITAT ENABLE the shipped manifest enables H04, so the cases below no longer reach a disabled record.
    const v1 = { enabledHabitats: V1_HABITATS };
    expect(validate(v1)).toEqual([]);
    const repeated = validate(v1, edit('H04_LEAF_POOL', (h) => {
      (h.regions as Raw[])[1]!.id = 'WEST_WAFER';
    }));
    expect(errorsOn(repeated, 'H04_LEAF_POOL.json', 'regions.1.id')).toEqual(['region id "WEST_WAFER" is used twice']);
    const anchor = validate(v1, edit('H04_LEAF_POOL', (h) => {
      (h.regions as Raw[])[0]!.anchor = [64, 64];
    }));
    expect(errorsOn(anchor, 'H04_LEAF_POOL.json', 'regions.0.anchor')).toEqual(["(64,64) is outside the region's shape"]);
    const stone = validate(v1, edit('H04_LEAF_POOL', (h) => {
      h.ops = [{ op: 'disk', center: [30, 64], radius: 3, substrate: 'stone' }];
      (h.objects as Raw[]).push({ material: 'M11', at: [30, 64] });
    }));
    expect(errorsOn(stone, 'H04_LEAF_POOL.json', 'objects.2.at')).toEqual(['(30,64) holds a structure']);
  });

  it('seven regions', () => {
    const issues = validate({}, edit('H04_LEAF_POOL', (h) => {
      const r = (h.regions as Raw[])[0]!;
      h.regions = [0, 1, 2, 3, 4, 5, 6].map((k) => ({ ...r, id: `R${k}` }));
    }));
    expect(errorsOn(issues, 'H04_LEAF_POOL.json', 'regions')).toHaveLength(1);
  });

  it('a repeated region id', () => {
    const issues = validate({}, edit('H04_LEAF_POOL', (h) => {
      (h.regions as Raw[])[1]!.id = 'WEST_WAFER';
    }));
    expect(errorsOn(issues, 'H04_LEAF_POOL.json', 'regions.1.id')).toEqual(['region id "WEST_WAFER" is used twice']);
  });

  it('an anchor outside its shape', () => {
    const issues = validate({}, edit('H04_LEAF_POOL', (h) => {
      (h.regions as Raw[])[0]!.anchor = [64, 64];
    }));
    expect(errorsOn(issues, 'H04_LEAF_POOL.json', 'regions.0.anchor')).toEqual(["(64,64) is outside the region's shape"]);
  });

  it('an object on a stone cell, and two objects on one cell', () => {
    const stone = validate({}, edit('H04_LEAF_POOL', (h) => {
      h.ops = [{ op: 'disk', center: [30, 64], radius: 3, substrate: 'stone' }];
      (h.objects as Raw[]).push({ material: 'M11', at: [30, 64] });
    }));
    expect(errorsOn(stone, 'H04_LEAF_POOL.json', 'objects.2.at')).toEqual(['(30,64) holds a structure']);
    const twice = validate({}, edit('H04_LEAF_POOL', (h) => {
      (h.objects as Raw[]).push({ material: 'M11', at: [45, 64] });
    }));
    expect(errorsOn(twice, 'H04_LEAF_POOL.json', 'objects.2.at')).toEqual(['(45,64) already holds a food object']);
  });

  it('a furnished area over an explicit device: two on one cell, reported on furnish', () => {
    const issues = validate({}, edit('H04_LEAF_POOL', (h) => {
      (h.devices as Raw[]).push({ structure: 'S07', at: [64, 64] });
    }));
    expect(errorsOn(issues, 'H04_LEAF_POOL.json', 'furnish')).toEqual(['Two devices share one cell.']);
  });

  it('257 furnishings and devices: the shared cap of 256', () => {
    const issues = validate({}, edit('H04_LEAF_POOL', (h) => {
      // 2 baskets + 197 mesh + 58 = 257.
      (h.furnish as Raw[]).push({ structure: 'S05', area: { kind: 'rect', x0: 30, x1: 30, y0: 35, y1: 92 } });
    }));
    expect(errorsOn(issues, 'H04_LEAF_POOL.json', 'furnish')).toEqual(['The dish has more than 256 furnishings and devices.']);
    // 256 is accepted.
    const ok = validate({}, edit('H04_LEAF_POOL', (h) => {
      (h.furnish as Raw[]).push({ structure: 'S05', area: { kind: 'rect', x0: 30, x1: 30, y0: 35, y1: 91 } });
    }));
    expect(errorsOn(ok, 'H04_LEAF_POOL.json')).toEqual([]);
  });

  it('a furnished area reaching outside the dish', () => {
    const issues = validate({}, edit('H07_GLASS_GARDEN', (h) => {
      (h.furnish as Raw[])[0]!.area = { kind: 'rect', x0: 40, x1: 40, y0: 0, y1: 90 };
    }));
    expect(errorsOn(issues, 'H07_GLASS_GARDEN.json', 'furnish.0.area')).toHaveLength(1);
  });

  it('a community group naming an unknown region', () => {
    const issues = validate({}, edit('H04_LEAF_POOL', (h) => {
      h.suggestedCommunity = { groups: [{ species: 'B06', region: 'NOWHERE', count: 5, radius: 10 }] };
    }));
    expect(errorsOn(issues, 'H04_LEAF_POOL.json', 'suggestedCommunity.groups.0.region')).toEqual(['unknown region "NOWHERE"']);
  });

  it("an enabled habitat's community needs its species enabled", () => {
    const issues = validate({ ...ENABLED, enabledSpecies: without(shipped.enabledSpecies, 'Y02') }, edit('H04_LEAF_POOL', (h) => {
      h.suggestedCommunity = { groups: [{ species: 'Y02', region: 'EAST_WAFER', count: 5, radius: 10 }] };
    }));
    expect(errorsOn(issues, 'H04_LEAF_POOL.json', 'suggestedCommunity')).toEqual(['Its Suggested Community needs Y02 (not enabled).']);
  });
});

describe('validator: recipes', () => {
  const recipe = (raw: RawPacks, id: string): Raw => raw.recipes.find((f) => (f.data as Raw).id === id)!.data as Raw;

  it('community: true on a recipe whose habitat has no Suggested Community', () => {
    const issues = validate({}, (raw) => {
      recipe(raw, 'FIRST_DISH_V1').community = true;
    });
    expect(errorsOn(issues, 'FIRST_DISH_V1.json', 'community')).toEqual(['habitat "WATER_GARDEN" has no Suggested Community']);
  });

  const CHAIN = { species: 'F02', count: 2, center: [63, 62], radius: 2, cells: [[63, 62], [64, 62]], links: 'chain' };
  const chainRecipe = (habitatId: string): Raw => ({
    ...(JSON.parse(JSON.stringify(registry().recipes.FIRST_DISH_V1)) as Raw),
    id: 'TEST_CHAIN',
    habitatId,
    fieldPatches: [],
    founders: [CHAIN],
    scheduledCommands: [],
    phase: 6,
  });
  const addRecipe = (habitatId: string) => (raw: RawPacks) => {
    (raw.recipes as RawFile[]).push({ file: 'content/recipes/TEST_CHAIN.json', data: chainRecipe(habitatId) });
  };

  it('a founder chain across an S01 edge of its habitat is refused, naming both cells; on a habitat without it, accepted', () => {
    const across = validate({}, addRecipe('H10_GATE_LAB'));
    expect(errorsOn(across, 'TEST_CHAIN.json')).toEqual(['(64,62) and (63,62) are on two sides of a Fine membrane edge, which a link cannot cross']);
    expect(errorsOn(across, 'TEST_CHAIN.json', 'founders.0.cells.1')).toHaveLength(1);
    expect(errorsOn(validate({}, addRecipe('WATER_GARDEN')), 'TEST_CHAIN.json')).toEqual([]);
  });

  it('realizeRecipe refuses the same chain, and a recipe asking for a Suggested Community', () => {
    // Fungi need a surface in open water, so the realized chain sits on gel: Gate Lab's geometry on a gel base,
    // with and without its six membranes.
    const base = habitatRegistry();
    const h10 = base.habitats.H10_GATE_LAB!;
    const gel: HabitatDef = { ...h10, id: 'TEST_GATE_GEL', baseSubstrate: 'gel' };
    const { edges: _edges, ...open } = { ...gel, id: 'TEST_GEL_OPEN' };
    const reg = { ...base, habitats: { ...base.habitats, TEST_GATE_GEL: gel, TEST_GEL_OPEN: open } };
    const across = RecipeSchema.parse(chainRecipe('TEST_GATE_GEL'));
    expect(() => realizeRecipe(reg, across, { seed: 1 })).toThrow(RecipeError);
    expect(() => realizeRecipe(reg, across, { seed: 1 })).toThrow('recipe TEST_CHAIN: founder group 0 members 1 and 2 are on two sides of an edge a link cannot cross');
    const fine = realizeRecipe(reg, RecipeSchema.parse(chainRecipe('TEST_GEL_OPEN')), { seed: 1 });
    expect(fine.ents.count).toBe(2);
    expect(fungalNeighbors(fine, 0)).toEqual([1]);
    const community = RecipeSchema.parse({ ...chainRecipe('WATER_GARDEN'), founders: [], community: true });
    // Stage 2 (habitat-communities) realizes a Suggested Community; WATER_GARDEN has none, so it is refused.
    expect(() => realizeRecipe(reg, community)).toThrow('recipe TEST_CHAIN: habitat WATER_GARDEN has no Suggested Community');
  });
});

describe('schema: the new fields are optional with no default', () => {
  it('a v1.0 habitat and recipe parse without them', () => {
    const h: HabitatDef = registry().habitats.WATER_GARDEN!;
    for (const k of ['furnish', 'objects', 'regions', 'suggestedCommunity'] as const) expect(k in h, k).toBe(false);
    expect('community' in registry().recipes.FIRST_DISH_V1!).toBe(false);
  });
});
