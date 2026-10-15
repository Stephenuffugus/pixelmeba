/**
 * P5.4 New Dish habitat starts (src/ui/newDishStarts.ts; src/ui/strings/newDish.ts; src/ui/state.ts
 * customDishSource; D-0128 "New Dish"). The 'Start with' list is the habitat records this build offers
 * (habitatOffered: phase, structures, systems, materials), ordered by phase then id; the three v1.0 presets keep
 * their ids, labels and notes; a Suggested Community is offered only when communityOffered accepts it; the
 * overrides carry `community` only when chosen and offered, and a v1.0 request is exactly today's.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { HabitatDef, Manifest } from '../../src/sim/content/schema';
import { habitatStarts, lifeAfterStart, startOverrides, type HabitatStart } from '../../src/ui/newDishStarts';
import { communityLine, placesLine, regionsLine, suggestedNote, V1_PRESET_STARTS } from '../../src/ui/strings/newDish';
import { customDishSource } from '../../src/ui/state';
import { loadRegistryFs } from '../../tools/lib/content-fs';
import type { NewDishPreview, RecipeOverrides } from '../../src/worker/protocol';
import { environmentSummary } from '../../src/ui/environment';
import { startLedgerText } from '../../src/ui/strings/modes';
import { NO_LIFE_YET } from '../../src/ui/strings/newDish';
import { HABITAT_IDS, habitatRegistry } from '../helpers/habitats';
import { FakeClockHost } from '../helpers/host';

const shipped = JSON.parse(readFileSync(join(__dirname, '../../content/manifest.json'), 'utf8')) as Manifest;
const reg = loadRegistryFs();
const records: HabitatDef[] = Object.keys(reg.habitats)
  .sort()
  .map((id) => reg.habitats[id]!);
const species = reg.species;
const enabledAll: Manifest = { ...shipped, enabledHabitats: [...shipped.enabledHabitats, ...HABITAT_IDS].sort() };

/** The v1.0 start list exactly as NewDish.tsx hard-coded it before P5.4 (ids, labels, notes, order). */
const V1_STARTS = [
  { id: 'empty', habitatId: 'WATER_GARDEN', label: 'Empty Water Garden', note: 'The same water and stones, with nothing living and no food.' },
  { id: 'gel', habitatId: 'GEL_COLONY', label: 'Empty Gel Colony', note: 'Gel with one water channel and a little sugar everywhere, with nothing living.' },
  { id: 'sediment', habitatId: 'SEDIMENT_EDGE', label: 'Empty Sediment Edge', note: 'Water above, sediment with debris below and one stone, with nothing living.' },
];

/** The D-table's communities (D-0128 STATE): species in group order. */
const COMMUNITY: Readonly<Record<string, readonly string[]>> = {
  H04_LEAF_POOL: ['B06', 'B08', 'Y02', 'F02', 'P01'],
  H05_BRINE_MOSAIC: ['B01', 'B10'],
  H06_DUSK_MARSH: ['A03', 'B03', 'B04', 'P04'],
  H07_GLASS_GARDEN: ['A02', 'B05', 'P05', 'P09'],
  H08_NIGHT_LANTERNS: ['B09', 'A01', 'B04'],
  H09_DRYING_LACE: ['F04', 'B12'],
  H10_GATE_LAB: ['B06', 'B01'],
  H11_GRAZING_MEADOW: ['F02', 'P08', 'P09', 'P10'],
};

const pick = (s: HabitatStart) => ({ id: s.id, habitatId: s.habitatId, label: s.label, note: s.note });
const ids = (xs: readonly HabitatStart[]) => xs.map((s) => s.habitatId);
const startOf = (xs: readonly HabitatStart[], habitatId: string) => xs.find((s) => s.habitatId === habitatId)!;

describe('the start list follows the build manifest', () => {
  it('the shipped manifest offers exactly the three v1.0 starts, as before', () => {
    const list = habitatStarts(records, shipped, species, false);
    expect(list.map(pick)).toEqual(V1_STARTS);
    expect(list.every((s) => !s.communityOffered && s.communitySpecies.length === 0)).toBe(true);
    expect(list.some((s) => s.id.startsWith('habitat:'))).toBe(false);
    // The strings moved into src/ui/strings/newDish.ts unchanged.
    expect(Object.values(V1_PRESET_STARTS).map((v) => [v.id, v.label, v.note])).toEqual(V1_STARTS.map((v) => [v.id, v.label, v.note]));
  });

  it('with H04-H11 enabled: eleven starts by phase then id, each new one labelled with its name and guide summary', () => {
    const list = habitatStarts(records, enabledAll, species, false);
    expect(ids(list)).toEqual(['WATER_GARDEN', 'GEL_COLONY', 'SEDIMENT_EDGE', ...HABITAT_IDS]);
    expect(list.slice(0, 3).map(pick)).toEqual(V1_STARTS);
    for (const id of HABITAT_IDS) {
      const s = startOf(list, id);
      const h = reg.habitats[id]!;
      expect(s.id).toBe(`habitat:${id}`);
      expect(s.label).toBe(h.name);
      expect(s.note).toBe(h.guide.summary);
      expect(s.communityOffered, id).toBe(true);
      expect(s.communitySpecies, id).toEqual(COMMUNITY[id]);
    }
    expect(startOf(list, 'H04_LEAF_POOL').furnished).toEqual(['S06']);
    expect(startOf(list, 'H09_DRYING_LACE').furnished).toEqual(['S11']);
    expect(startOf(list, 'H10_GATE_LAB').furnished).toEqual([]);
  });

  it('a habitat whose phase is later than the build, or whose structure, system or material is off, is absent', () => {
    const later = habitatStarts(records, { ...enabledAll, buildPhase: 4 }, species, false);
    expect(ids(later)).toEqual(['WATER_GARDEN', 'GEL_COLONY', 'SEDIMENT_EDGE']);
    const noS01 = habitatStarts(records, { ...enabledAll, enabledStructures: (enabledAll.enabledStructures ?? []).filter((x) => x !== 'S01') }, species, false);
    expect(ids(noS01)).not.toContain('H10_GATE_LAB');
    expect(ids(noS01)).toHaveLength(10);
    const noClimate = habitatStarts(records, { ...enabledAll, enabledSystems: enabledAll.enabledSystems.filter((x) => x !== 'climate') }, species, false);
    // H06, H08, H09 and H11 use the light cycle or drying (climate); the others stay.
    expect(ids(noClimate)).toEqual(['WATER_GARDEN', 'GEL_COLONY', 'SEDIMENT_EDGE', 'H04_LEAF_POOL', 'H05_BRINE_MOSAIC', 'H07_GLASS_GARDEN', 'H10_GATE_LAB']);
    const noWafer = habitatStarts(records, { ...enabledAll, enabledMaterials: enabledAll.enabledMaterials.filter((x) => x !== 'M11') }, species, false);
    expect(ids(noWafer)).not.toContain('H04_LEAF_POOL');
    // Not in enabledHabitats: absent whatever else is enabled.
    expect(ids(habitatStarts(records, { ...enabledAll, enabledHabitats: enabledAll.enabledHabitats.filter((x) => x !== 'H07_GLASS_GARDEN') }, species, false))).not.toContain('H07_GLASS_GARDEN');
  });

  it('a community whose species is not enabled is not offered (the habitat still is)', () => {
    const noB10 = habitatStarts(records, { ...enabledAll, enabledSpecies: enabledAll.enabledSpecies.filter((x) => x !== 'B10') }, species, false);
    expect(startOf(noB10, 'H05_BRINE_MOSAIC').communityOffered).toBe(false);
    expect(startOf(noB10, 'H04_LEAF_POOL').communityOffered).toBe(true);
    // No species records: no community anywhere.
    expect(habitatStarts(records, enabledAll, null, false).some((s) => s.communityOffered)).toBe(false);
  });

  it('the demo offers only the Water Garden', () => {
    expect(ids(habitatStarts(records, enabledAll, species, true))).toEqual(['WATER_GARDEN']);
    expect(habitatStarts(records, shipped, species, true).map(pick)).toEqual([V1_STARTS[0]]);
  });
});

describe('startOverrides', () => {
  const list = habitatStarts(records, enabledAll, species, false);
  it('the v1.0 starts ask for exactly what they asked before', () => {
    expect(startOverrides(startOf(list, 'WATER_GARDEN'), false)).toEqual({ empty: true });
    expect(startOverrides(startOf(list, 'GEL_COLONY'), false)).toEqual({ empty: true, habitatId: 'GEL_COLONY' });
    expect(startOverrides(startOf(list, 'SEDIMENT_EDGE'), false)).toEqual({ empty: true, habitatId: 'SEDIMENT_EDGE' });
    // No community to offer: a Suggested choice sends nothing more.
    expect(startOverrides(startOf(list, 'GEL_COLONY'), true)).toEqual({ empty: true, habitatId: 'GEL_COLONY' });
  });
  it('a Phase 5 habitat: Empty and Suggested Community', () => {
    const h05 = startOf(list, 'H05_BRINE_MOSAIC');
    expect(startOverrides(h05, false)).toEqual({ empty: true, habitatId: 'H05_BRINE_MOSAIC' });
    expect(startOverrides(h05, true)).toEqual({ empty: true, habitatId: 'H05_BRINE_MOSAIC', community: true });
    expect(startOverrides({ ...h05, communityOffered: false }, true)).toEqual({ empty: true, habitatId: 'H05_BRINE_MOSAIC' });
  });
});

describe('the Life choice', () => {
  it('returns to Empty whenever the start changes, and stays on the same start', () => {
    expect(lifeAfterStart('habitat:H04_LEAF_POOL', 'habitat:H05_BRINE_MOSAIC', 'suggested')).toBe('empty');
    expect(lifeAfterStart('habitat:H04_LEAF_POOL', 'gel', 'suggested')).toBe('empty');
    expect(lifeAfterStart('habitat:H04_LEAF_POOL', 'habitat:H04_LEAF_POOL', 'suggested')).toBe('suggested');
    expect(lifeAfterStart('garden', 'habitat:H04_LEAF_POOL', 'empty')).toBe('empty');
  });
});

describe('customDishSource carries the community only when chosen', () => {
  const base = { recipeId: 'FIRST_DISH_V1', seed: 104729, mutationPreset: 'standard', founderMode: 'identical', empty: true } as const;
  it('a request without it is exactly today’s', () => {
    const today = customDishSource({ ...base, habitatId: 'GEL_COLONY' });
    expect(JSON.stringify(today)).toBe(
      JSON.stringify({ kind: 'recipe', recipeId: 'FIRST_DISH_V1', seed: 104729, overrides: { mutationPreset: 'standard', founderMode: 'identical', empty: true, habitatId: 'GEL_COLONY' } }),
    );
    expect(customDishSource({ ...base })).toEqual({ kind: 'recipe', recipeId: 'FIRST_DISH_V1', seed: 104729, overrides: { mutationPreset: 'standard', founderMode: 'identical', empty: true } });
  });
  it('with it: community true, after the habitat and the environment keys', () => {
    const src = customDishSource({ ...base, habitatId: 'H04_LEAF_POOL', environment: { lid: 'closed' }, community: true });
    expect(src).toEqual({
      kind: 'recipe',
      recipeId: 'FIRST_DISH_V1',
      seed: 104729,
      overrides: { mutationPreset: 'standard', founderMode: 'identical', empty: true, habitatId: 'H04_LEAF_POOL', lid: 'closed', community: true },
    });
  });
});

describe('the summary words', () => {
  it('places, regions, community and the choice note', () => {
    expect(
      placesLine(
        [
          { id: 'S06', name: 'Attachment mesh', count: 197 },
          { id: 'S07', name: 'Nutrient basket', count: 2 },
          { id: 'M11', name: 'Leaf wafer', count: 2 },
        ],
        ['S06'],
      ),
    ).toBe('It places: Attachment mesh (197 cells), Nutrient basket (2), Leaf wafer (2).');
    expect(placesLine(undefined, [])).toBeNull();
    expect(placesLine([], [])).toBeNull();
    expect(regionsLine([{ label: 'West wafer', number: 1 }, { label: 'Mesh patch', number: 2 }, { label: 'East wafer', number: 3 }])).toBe('Regions: 1 West wafer, 2 Mesh patch, 3 East wafer.');
    expect(regionsLine(undefined)).toBeNull();
    expect(
      communityLine(
        [
          { name: 'Crumbsmith', count: 5, regionLabel: 'Left side' },
          { name: 'Sprinter', count: 5, regionLabel: 'Right side' },
        ],
        ['Starch'],
      ),
    ).toBe('Suggested Community: 5 Crumbsmiths near Left side and 5 Sprinters near Right side. It also adds: Starch.');
    expect(communityLine([{ name: 'Amoeba', count: 1, regionLabel: 'Mesh patch' }], [])).toBe('Suggested Community: 1 Amoeba near Mesh patch.');
    expect(suggestedNote(['Crumbsmith', 'Brothmaker', 'Amoeba'])).toBe('Five each of Crumbsmiths, Brothmakers and Amoebae, placed in its regions and shown below.');
  });
});

/** The worker's preview of a New Dish start under habitatRegistry() (the eight habitats enabled). */
function preview(overrides: RecipeOverrides): NewDishPreview {
  const h = new FakeClockHost(habitatRegistry());
  h.host.handle({ type: 'newDishPreview', requestId: 91, recipeId: 'FIRST_DISH_V1', seed: 104729, overrides });
  const msg = h.out.find((m) => m.type === 'newDishPreview' && m.requestId === 91);
  if (!msg || msg.type !== 'newDishPreview') throw new Error(`no preview: ${JSON.stringify(h.out.filter((m) => m.type === 'error'))}`);
  return msg.preview;
}

/** The Phase 5 lines NewDish.tsx Summary renders for a 'habitat:<id>' start, in its order (map and seed lines left out). */
function summaryLines(p: NewDishPreview, start: HabitatStart): string[] {
  return [
    `${p.habitat.name}: ${p.habitat.summary} ${p.habitat.rules ?? ''}`,
    placesLine(p.habitat.uses, start.furnished),
    regionsLine(p.habitat.regions),
    environmentSummary(p.environment),
    p.community === true && p.communityGroups ? communityLine(p.communityGroups, p.patches) : NO_LIFE_YET,
    startLedgerText(p.ledger),
  ].filter((x): x is string => x !== null);
}

describe('the H04 and H10 summaries against the worker preview (habitatRegistry)', () => {
  const list = habitatStarts(records, enabledAll, species, false);
  const h04 = startOf(list, 'H04_LEAF_POOL');
  const h10 = startOf(list, 'H10_GATE_LAB');

  it('Leaf Pool Empty: what it places, its regions, no life; Suggested: the five groups and a larger added ledger', () => {
    const empty = preview({ ...startOverrides(h04, false) });
    const lines = summaryLines(empty, h04);
    expect(lines[1]).toBe('It places: Attachment mesh (197 cells), Nutrient basket (2), Leaf wafer (2).');
    expect(lines[2]).toBe('Regions: 1 West wafer, 2 Mesh patch, 3 East wafer.');
    expect(lines[3]).toBe('Lid open, fixed light, drying off.');
    expect(lines[4]).toBe(NO_LIFE_YET);
    expect(empty.founders).toEqual([]);
    const sug = preview({ ...startOverrides(h04, true) });
    const s = summaryLines(sug, h04);
    expect(s[4]).toBe(
      'Suggested Community: 5 Crumbsmiths near West wafer, 5 Brothmakers near East wafer, 5 Creambuds near East wafer, 5 Cordweavers near Mesh patch and 5 Amoebae near Mesh patch.',
    );
    expect(sug.founders.reduce((a, f) => a + f.count, 0)).toBe(25);
    expect(sug.ledger.added.c).toBeGreaterThan(empty.ledger.added.c);
    expect(sug.ledger.habitat).toEqual(empty.ledger.habitat);
    // The note on the Suggested Community choice.
    expect(suggestedNote(h04.communitySpecies.map((id) => species[id]!.name))).toBe(
      'Five each of Crumbsmiths, Brothmakers, Creambuds, Cordweavers and Amoebae, placed in its regions and shown below.',
    );
    console.log(['H04 Empty:', ...lines, '', 'H04 Suggested:', ...s].join('\n'));
  });

  it('Gate Lab Suggested names the starch and both sides', () => {
    const p = preview({ ...startOverrides(h10, true) });
    const s = summaryLines(p, h10);
    expect(s).toContain('It places: Fine membrane (6).');
    expect(s.find((l) => l.startsWith('Suggested Community'))).toBe('Suggested Community: 5 Crumbsmiths near Left side and 5 Sprinters near Right side. It also adds: Starch.');
    console.log(['H10 Suggested:', ...s].join('\n'));
  });
});
