/**
 * Phase 5 wave 8b (structure-content): habitat and recipe `edges` and `devices` placed by realizeRecipe
 * (P5.2 for P5.4's H04–H11; CT §4, §14; SPEC §2.4; D-0104, D-0106). Since the systems flip (D-0121) the
 * shipped manifest enables the systems and S01–S12 and lists them as implemented; WITH_ALL equals it, and
 * PRE_FLIP (the v1.0 systems and the cell structures) is the manifest that records none of them.
 */
import { describe, expect, it } from 'vitest';
import { validateContent, type ContentRegistry } from '../../src/sim/content/registry';
import type { DevicePlacement, EdgePlacement, HabitatDef, RecipeDef } from '../../src/sim/content/schema';
import { edgeKey, type EdgeBarrier } from '../../src/sim/barriers';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex, inMask } from '../../src/sim/grid';
import { realizeRecipe, recipeStructures, RecipeError } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { contentHashOf, patchedRawPacks, registryWith, type ManifestPatch } from '../helpers/registry';
import { trajectoryDigest } from '../helpers/trajectory';
import { registry } from '../helpers/world';

const IDS = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'];
const ALL_ON = [...new Set([...registry().manifest.enabledSystems, 'barriers', 'climate', 'devices'])].sort() as SystemFlag[];
const WITH_ALL: ManifestPatch = { enabledSystems: ALL_ON, enabledStructures: ['BEAD', ...IDS, 'STONE', 'WALL'] };
/**
 * The manifest before the systems flip: the v1.0 systems, the cell structures only and the v1.0 habitats (the
 * Phase 5 habitats need the flip's systems and structures; the shipped list has them since D-0130).
 */
const PRE_FLIP: ManifestPatch = {
  enabledSystems: ALL_ON.filter((s) => s !== 'barriers' && s !== 'climate' && s !== 'devices'),
  enabledStructures: ['BEAD', 'STONE', 'WALL'],
  enabledHabitats: ['GEL_COLONY', 'SEDIMENT_EDGE', 'WATER_GARDEN'],
};
const reg = (): ContentRegistry => registryWith(WITH_ALL, { allowUnimplemented: true });

const EDGES: EdgePlacement[] = [
  { structure: 'S01', dir: 'R', x0: 60, y0: 50, x1: 60, y1: 52 },
  { structure: 'S02', dir: 'D', x0: 62, y0: 50, x1: 62, y1: 50 },
  { structure: 'S03', dir: 'R', x0: 63, y0: 50, x1: 63, y1: 50, open: true },
  { structure: 'S03', dir: 'R', x0: 63, y0: 51, x1: 63, y1: 51 },
  { structure: 'S04', dir: 'R', x0: 64, y0: 50, x1: 64, y1: 50, flow: -1 },
];
const DEVICES: DevicePlacement[] = [
  { structure: 'S12', at: [77, 70] },
  { structure: 'S05', at: [70, 70] },
  { structure: 'S06', at: [71, 70] },
  { structure: 'S07', at: [72, 70] },
  { structure: 'S08', at: [73, 70], resinSelect: ['inhBact', 'rival'] },
  { structure: 'S09', at: [74, 70], on: true },
  { structure: 'S10', at: [75, 70] },
  { structure: 'S11', at: [76, 70] },
];

function first(r: ContentRegistry, patch: Partial<RecipeDef>): RecipeDef {
  return { ...r.recipes.FIRST_DISH_V1!, ...patch };
}

/** The RecipeError message realizeRecipe throws, or '' when it does not throw. */
function refusal(r: ContentRegistry, recipe: RecipeDef): string {
  try {
    realizeRecipe(r, recipe);
    return '';
  } catch (e) {
    expect(e).toBeInstanceOf(RecipeError);
    return (e as Error).message;
  }
}

const c = (x: number, y: number) => cellIndex(x, y);

describe('P5.2 realizeRecipe places habitat and recipe structures', () => {
  it('places every edge and device kind with ids in listed order, canonical store order and nextDeviceId', () => {
    const w = realizeRecipe(reg(), first(reg(), { edges: EDGES, devices: DEVICES }));
    // Ids: recipe edges (a rectangle's cells row-major), then recipe devices in listed order; stores sorted.
    expect(w.edges).toEqual([
      { id: 1, kind: 'S01', cell: c(60, 50), dir: 'R' },
      { id: 4, kind: 'S02', cell: c(62, 50), dir: 'D' },
      { id: 5, kind: 'S03', cell: c(63, 50), dir: 'R', open: true },
      { id: 7, kind: 'S04', cell: c(64, 50), dir: 'R', flow: -1 },
      { id: 2, kind: 'S01', cell: c(60, 51), dir: 'R' },
      { id: 6, kind: 'S03', cell: c(63, 51), dir: 'R', open: false },
      { id: 3, kind: 'S01', cell: c(60, 52), dir: 'R' },
    ]);
    const keys = w.edges.map((e: EdgeBarrier) => edgeKey(e.cell, e.dir));
    expect([...keys].sort((a, b) => a - b)).toEqual(keys);
    expect(w.devices).toEqual([
      { id: 9, kind: 'S05', cell: c(70, 70) },
      { id: 10, kind: 'S06', cell: c(71, 70) },
      { id: 11, kind: 'S07', cell: c(72, 70) },
      { id: 12, kind: 'S08', cell: c(73, 70), resinSelect: ['inhBact', 'rival'] },
      { id: 13, kind: 'S09', cell: c(74, 70), on: true },
      { id: 14, kind: 'S10', cell: c(75, 70), on: false }, // devices start Off (SPEC §10.4)
      { id: 15, kind: 'S11', cell: c(76, 70) },
      { id: 8, kind: 'S12', cell: c(77, 70) },
    ]);
    expect(w.counters.nextDeviceId).toBe(16);
    // recipeStructures is the pure form of what was realized.
    const habitat = reg().habitats.WATER_GARDEN!;
    expect(recipeStructures(habitat, first(reg(), { edges: EDGES, devices: DEVICES }))).toEqual({ edges: w.edges, devices: w.devices });
  });

  it("the habitat's edges and devices come first (ids), then the recipe's", () => {
    const base = reg();
    const habitat: HabitatDef = {
      ...base.habitats.WATER_GARDEN!,
      edges: [{ structure: 'S02', dir: 'D', x0: 50, y0: 60, x1: 51, y1: 60 }],
      devices: [{ structure: 'S11', at: [55, 60] }],
    };
    const r2: ContentRegistry = { ...base, habitats: { ...base.habitats, WATER_GARDEN: habitat } };
    const recipe = first(base, { edges: [EDGES[0]!], devices: [DEVICES[1]!] });
    const placed = recipeStructures(habitat, recipe);
    expect(placed.edges.map((e) => [e.id, e.kind, e.cell])).toEqual([
      [4, 'S01', c(60, 50)],
      [5, 'S01', c(60, 51)],
      [6, 'S01', c(60, 52)],
      [1, 'S02', c(50, 60)],
      [2, 'S02', c(51, 60)],
    ]);
    expect(placed.devices.map((d) => [d.id, d.kind, d.cell])).toEqual([
      [3, 'S11', c(55, 60)],
      [7, 'S05', c(70, 70)],
    ]);
    const w = realizeRecipe(r2, recipe);
    expect({ edges: w.edges, devices: w.devices }).toEqual(placed);
    expect(w.counters.nextDeviceId).toBe(8);
  });

  it('refuses invalid placements with the store rules’ exact sentence', () => {
    const r = reg();
    const gel = { ...first(r, { habitatId: 'GEL_COLONY', founders: [], fieldPatches: [], scheduledCommands: [] }) };
    // GEL_COLONY: gel with a water channel x 59–68. (40, 64)–(41, 64) is gel on both sides.
    expect(refusal(r, { ...gel, edges: [{ structure: 'S04', dir: 'R', x0: 40, y0: 64, x1: 40, y1: 64, flow: 1 }] })).toBe(
      'recipe FIRST_DISH_V1: A one-way channel does not join two open water cells.',
    );
    // The bank of the channel: water on one side only.
    expect(refusal(r, { ...gel, edges: [{ structure: 'S04', dir: 'R', x0: 58, y0: 64, x1: 58, y1: 64, flow: 1 }] })).toBe(
      'recipe FIRST_DISH_V1: A one-way channel does not join two open water cells.',
    );
    // Inside the channel it is accepted.
    expect(refusal(r, { ...gel, edges: [{ structure: 'S04', dir: 'R', x0: 60, y0: 64, x1: 60, y1: 64, flow: 1 }] })).toBe('');
    expect(
      refusal(r, first(r, { edges: [EDGES[0]!, { structure: 'S02', dir: 'R', x0: 60, y0: 51, x1: 60, y1: 51 }] })),
    ).toBe('recipe FIRST_DISH_V1: Two edge barriers share one edge.');
    let rimX = 64;
    while (inMask(rimX + 1, 64)) rimX++;
    expect(refusal(r, first(r, { edges: [{ structure: 'S01', dir: 'R', x0: rimX, y0: 64, x1: rimX, y1: 64 }] }))).toBe(
      'recipe FIRST_DISH_V1: An edge barrier lies on the rim of the dish.',
    );
    expect(refusal(r, first(r, { edges: [{ structure: 'S01', dir: 'R', x0: 0, y0: 0, x1: 0, y1: 0 }] }))).toBe(
      'recipe FIRST_DISH_V1: An edge barrier lies outside the dish.',
    );
    // WATER_GARDEN has a stone disk at (42, 45).
    expect(refusal(r, first(r, { devices: [{ structure: 'S06', at: [42, 45] }] }))).toBe('recipe FIRST_DISH_V1: A device sits on a stone, wall or bead.');
    expect(refusal(r, first(r, { devices: [DEVICES[1]!, { structure: 'S06', at: [70, 70] }] }))).toBe('recipe FIRST_DISH_V1: Two devices share one cell.');
    const many: DevicePlacement[] = [];
    for (let y = 50; y < 80 && many.length < 257; y++) for (let x = 50; x < 80 && many.length < 257; x++) many.push({ structure: 'S05', at: [x, y] });
    expect(refusal(r, first(r, { devices: many.slice(0, 256) }))).toBe('');
    expect(refusal(r, first(r, { devices: many }))).toBe('recipe FIRST_DISH_V1: The dish has more than 256 furnishings and devices.');
    // 512 edges are allowed; 513 are not (CT §14).
    expect(refusal(r, first(r, { edges: [{ structure: 'S01', dir: 'R', x0: 30, y0: 60, x1: 93, y1: 67 }] }))).toBe('');
    expect(
      refusal(r, first(r, { edges: [{ structure: 'S01', dir: 'R', x0: 30, y0: 60, x1: 93, y1: 67 }, { structure: 'S01', dir: 'D', x0: 64, y0: 70, x1: 64, y1: 70 }] })),
    ).toBe('recipe FIRST_DISH_V1: The dish has more than 512 edge barriers.');
  });

  it("refuses a structure or system the world's recorded manifest does not include (gated on the recorded manifest)", () => {
    const r = reg();
    const noBarriers: ContentRegistry = { ...r, manifest: { ...r.manifest, enabledSystems: r.manifest.enabledSystems.filter((s) => s !== 'barriers') } };
    expect(refusal(noBarriers, first(r, { edges: [EDGES[0]!] }))).toBe('recipe FIRST_DISH_V1: It places structure S01, which needs the "barriers" system (not in these rules).');
    const noClimate: ContentRegistry = { ...r, manifest: { ...r.manifest, enabledSystems: r.manifest.enabledSystems.filter((s) => s !== 'climate') } };
    expect(refusal(noClimate, first(r, { devices: [{ structure: 'S12', at: [70, 70] }] }))).toBe('recipe FIRST_DISH_V1: It places structure S12, which needs the "climate" system (not in these rules).');
    const noShelter = registryWith({ ...WITH_ALL, enabledStructures: WITH_ALL.enabledStructures!.filter((s) => s !== 'S05') }, { allowUnimplemented: true });
    expect(refusal(noShelter, first(noShelter, { devices: [DEVICES[1]!] }))).toBe('recipe FIRST_DISH_V1: It places structure S05, which these rules do not include.');
    // A pre-flip build records none of them; the shipped build records them all since the systems flip (D-0121).
    const preFlip = registryWith(PRE_FLIP);
    expect(refusal(preFlip, first(preFlip, { edges: [EDGES[0]!] }))).toBe('recipe FIRST_DISH_V1: It places structure S01, which these rules do not include.');
    expect(refusal(registry(), first(registry(), { edges: [EDGES[0]!] }))).toBe('');
  });
});

describe('P5.2 content-time validation of habitat and recipe structures', () => {
  const recipeFile = (data: Record<string, unknown>) => {
    const base = registry().recipes.FIRST_DISH_V1!;
    return { file: `content/recipes/${data.id as string}.json`, data: { ...JSON.parse(JSON.stringify(base)), phase: 5, ...data } as unknown };
  };
  const errorsWith = (patch: ManifestPatch, files: { file: string; data: unknown }[], habitats: { file: string; data: unknown }[] = []) => {
    const raw = patchedRawPacks(patch);
    const packs = { ...raw, recipes: [...raw.recipes, ...files], habitats: [...raw.habitats.filter((h) => !habitats.some((x) => x.file === h.file)), ...habitats] };
    (packs.manifest.data as { contentHash: string }).contentHash = contentHashOf(packs);
    return validateContent(packs, { allowUnimplemented: true })
      .issues.filter((i) => i.severity === 'error')
      .map((i) => `${i.file} → ${i.path}: ${i.message}`);
  };

  it('a shipped recipe with a valid placement validates; an invalid one is refused with the sentence', () => {
    const ok = recipeFile({ id: 'TEST_STRUCTURES', edges: EDGES, devices: DEVICES });
    expect(errorsWith(WITH_ALL, [ok])).toEqual([]);
    const channel = recipeFile({
      id: 'TEST_CHANNEL',
      habitatId: 'GEL_COLONY',
      founders: [],
      fieldPatches: [],
      edges: [{ structure: 'S04', dir: 'R', x0: 40, y0: 64, x1: 40, y1: 64, flow: 1 }],
    });
    expect(errorsWith(WITH_ALL, [channel])).toEqual([
      'content/recipes/TEST_CHANNEL.json → edges: A one-way channel does not join two open water cells.',
    ]);
    // Placement geometry is checked even for a recipe above the build phase; its needs are not.
    expect(errorsWith(WITH_ALL, [{ ...channel, data: { ...(channel.data as object), phase: 6 } }])).toEqual([
      'content/recipes/TEST_CHANNEL.json → edges: A one-way channel does not join two open water cells.',
    ]);
    const stone = recipeFile({ id: 'TEST_STONE', devices: [{ structure: 'S06', at: [42, 45] }] });
    expect(errorsWith(WITH_ALL, [stone])).toEqual(['content/recipes/TEST_STONE.json → devices: A device sits on a stone, wall or bead.']);
    // Schema: a channel needs its direction; only a shutter is open.
    const noFlow = recipeFile({ id: 'TEST_NOFLOW', edges: [{ structure: 'S04', dir: 'R', x0: 64, y0: 64, x1: 64, y1: 64 }] });
    expect(errorsWith(WITH_ALL, [noFlow]).join('\n')).toContain('content/recipes/TEST_NOFLOW.json → edges.0.flow');
  });

  it('a shipped recipe needs the structures and systems it places, and climate for a cycle or drying', () => {
    const ok = recipeFile({ id: 'TEST_STRUCTURES', edges: [EDGES[0]!] });
    expect(errorsWith(PRE_FLIP, [ok])).toEqual(['content/recipes/TEST_STRUCTURES.json → edges: It places structure S01, which these rules do not include.']);
    const cycle = recipeFile({ id: 'TEST_CYCLE', lightMode: 'cycle' });
    expect(errorsWith(PRE_FLIP, [cycle])).toEqual(['content/recipes/TEST_CYCLE.json → lightMode: Its light cycle needs the "climate" system (not in these rules).']);
    const drying = recipeFile({ id: 'TEST_DRYING', drying: true });
    expect(errorsWith(PRE_FLIP, [drying])).toEqual(['content/recipes/TEST_DRYING.json → drying: Its drying needs the "climate" system (not in these rules).']);
    expect(errorsWith({ enabledSystems: ALL_ON }, [cycle, drying])).toEqual([]);
    // Above the build phase it is not shipped: skipped.
    expect(errorsWith(PRE_FLIP, [{ ...cycle, data: { ...(cycle.data as object), phase: 6 } }])).toEqual([]);
  });

  it('a shipped habitat is checked the same way (its file, its own grid)', () => {
    const wg = patchedRawPacks({}).habitats.find((h) => h.file.endsWith('WATER_GARDEN.json'))!;
    const cycling = { file: wg.file, data: { ...(wg.data as object), lightMode: 'cycle' } };
    expect(errorsWith(PRE_FLIP, [], [cycling])).toContain('content/habitats/WATER_GARDEN.json → lightMode: Its light cycle needs the "climate" system (not in these rules).');
    const roofOnStone = { file: wg.file, data: { ...(wg.data as object), devices: [{ structure: 'S11', at: [83, 82] }] } };
    const errs = errorsWith(WITH_ALL, [], [roofOnStone]);
    // Once on the habitat (geometry and shipped checks agree); a recipe that repaints its grid (ops) is checked too.
    expect(errs.filter((e) => e.startsWith('content/habitats/'))).toEqual(['content/habitats/WATER_GARDEN.json → devices: A device sits on a stone, wall or bead.']);
    expect(errs).not.toContain('content/recipes/FIRST_DISH_V1.json → devices: A device sits on a stone, wall or bead.');
  });
});

describe('P5.2 structure worlds are deterministic; a recipe without structures is unchanged', () => {
  it('two realizations are equal; save → load keeps the hash; one run of 400 ticks equals four of 100', () => {
    const r = reg();
    const recipe = first(r, { edges: EDGES, devices: DEVICES });
    const a = realizeRecipe(r, recipe);
    const b = realizeRecipe(r, recipe);
    expect(stateHash(a)).toBe(stateHash(b));
    expect(JSON.stringify(serializeWorld(a))).toBe(JSON.stringify(serializeWorld(b)));
    const loaded = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(a))));
    expect(stateHash(loaded)).toBe(stateHash(a));
    expect(loaded.edges).toEqual(a.edges);
    expect(loaded.devices).toEqual(a.devices);
    expect(loaded.counters.nextDeviceId).toBe(16);
    run(a, 400);
    for (let k = 0; k < 4; k++) run(b, 100);
    expect(stateHash(a)).toBe(stateHash(b));
    // The structures are state: a world without them hashes differently.
    expect(stateHash(realizeRecipe(r, first(r, {})))).not.toBe(stateHash(realizeRecipe(r, recipe)));
  });

  it('a recipe without edges or devices realizes byte-identically to one that lists none (empty stores, nextDeviceId 1, no cycle tick)', () => {
    for (const r of [registry(), reg()]) {
      // Wave 15 (P5.6, D-0131): every shipped recipe that places no structure (it lists none, and neither does its
      // habitat); since wave 15 BRINE_CROSSING_V1 lists a shutter and the H09 / H10 recipes inherit their habitats'.
      const placesNone = (x: string) => {
        const rec = r.recipes[x]!;
        const h = r.habitats[rec.habitatId]!;
        return rec.edges === undefined && rec.devices === undefined && rec.furnish === undefined && (h.edges?.length ?? 0) + (h.devices?.length ?? 0) + (h.furnish?.length ?? 0) === 0;
      };
      expect(r.recipeIds.filter((x) => r.recipes[x]!.phase <= r.manifest.buildPhase && placesNone(x)).length).toBeGreaterThan(15);
      for (const id of r.recipeIds.filter((x) => r.recipes[x]!.phase <= r.manifest.buildPhase && placesNone(x))) {
        const base = r.recipes[id]!;
        expect(base.edges, id).toBeUndefined();
        expect(base.devices, id).toBeUndefined();
        const w = realizeRecipe(r, id);
        expect(w.edges, id).toEqual([]);
        expect(w.devices, id).toEqual([]);
        expect(w.counters.nextDeviceId, id).toBe(1);
        // Schema 5 (D-0106): a cycle-light recipe (wave 15's NIGHT_SHIFT_V1) records the cycle start at tick 0;
        // every fixed-light recipe records none.
        const cycle = (base.lightMode ?? r.habitats[base.habitatId]!.lightMode) === 'cycle';
        if (cycle) expect(w.settings.cycleStartTick, id).toBe(0);
        else expect('cycleStartTick' in w.settings, id).toBe(false);
        const listed = realizeRecipe(r, { ...base, edges: [], devices: [] });
        expect(JSON.stringify(serializeWorld(listed)), id).toBe(JSON.stringify(serializeWorld(w)));
        expect(trajectoryDigest(listed, 'full'), id).toBe(trajectoryDigest(w, 'full'));
      }
    }
  });
});
