/**
 * W2-13 (UX §4.3): Add Life tiles and the Lab Life tray show a diet symbol and a short diet line
 * derived from the dish's own species records (DishInfo.speciesDiets, filled by the worker from
 * w.species[].def), never a hard-coded map. Names are the dish's own species names; prey or hosts the
 * dish does not record are counted ("and 6 kinds not in this dish"); a prey requirement is always
 * stated ('free' → "only free-swimming", 'inSediment' → "only in sediment"); film digestion is
 * mentioned only when the world enables the film system. Also: V01's Life brush is the phage dose
 * rule (W2-14).
 */
import { describe, expect, it } from 'vitest';
import type { ContentRegistry } from '../../src/sim/content/registry';
import type { SystemFlag } from '../../src/sim/fields';
import { brushCellOutcome, lifeCellOutcome, ST_BEAD, ST_NONE, ST_OUTSIDE, ST_STONE, ST_WALL, SUB_GEL, SUB_SEDIMENT, SUB_WATER } from '../../src/sim/grid';
import type { DishInfo, SpeciesDiet } from '../../src/worker/protocol';
import { dietLine, isPhage, lifeBrushFor } from '../../src/ui/panels/LabTrayContent';
import { LIFE_COPY } from '../../src/ui/strings/lab';
import { FakeClockHost } from '../helpers/host';
import { G2_LISTS, registryWith } from '../helpers/registry';
import { registry } from '../helpers/world';

function sortedUnion<T extends string>(a: readonly T[], b: readonly T[]): T[] {
  return [...new Set([...a, ...b])].sort();
}

/** The shipped content plus every species the other wave 2 builders enable (abilities they implement now). */
function waveRegistry(): ContentRegistry {
  const m = registry().manifest;
  return registryWith(
    {
      enabledSpecies: sortedUnion(m.enabledSpecies, ['B02', 'F01', 'V01', 'X01']),
      enabledSystems: sortedUnion<SystemFlag>(m.enabledSystems, ['film', 'fungi', 'parasites', 'viruses']),
    },
    { allowUnimplemented: true },
  );
}

function infoOf(reg: ContentRegistry): DishInfo {
  const h = new FakeClockHost(reg);
  h.create('diet-words', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
  const ready = h.out.find((m) => m.type === 'ready');
  if (!ready || ready.type !== 'ready') throw new Error('no ready');
  return ready.info;
}

const EXPECTED: Readonly<Record<string, string>> = {
  A01: 'Makes food from light.',
  B01: 'Eats sugar.',
  B02: 'Eats sugar, then protein.',
  B03: 'Eats sugar without oxygen.',
  B04: 'Eats debris, then protein, then starch, then oil, and digests film.',
  B05: 'Eats metabolite.',
  B06: 'Eats sugar.',
  F01: 'Eats debris, then starch, then protein, and digests film.',
  P01: 'Hunts Sprinter, Velvet, Dusk, Recycler, Crossfeeder, Crumbsmith, Bubble and Sunbead, and 11 kinds not in this dish.',
  P02: 'Hunts Sprinter, Dusk, Recycler, Crossfeeder and Sunbead (Crumbsmith only free-swimming), and 8 kinds not in this dish.',
  P03: 'Hunts Sunbead and Bubble, and 4 kinds not in this dish.',
  P04: 'Hunts Sprinter, Velvet, Dusk, Recycler and Crossfeeder (Crumbsmith only in sediment), and 7 kinds not in this dish.',
  V01: 'Infects Sprinter.',
  X01: 'Drains Sunbead.',
  Y01: 'Eats sugar without oxygen.',
};
const SYMBOL: Readonly<Record<string, string>> = { A01: 'light', P01: 'hunts', P02: 'hunts', P03: 'hunts', P04: 'hunts', V01: 'infects', X01: 'drains' };

describe('Diet lines from the dish’s own records (W2-13)', () => {
  it('the worker sends each species’ recorded diet in speciesIds order', () => {
    const reg = waveRegistry();
    const info = infoOf(reg);
    expect(info.speciesDiets).toHaveLength(info.speciesIds.length);
    info.speciesIds.forEach((id, i) => {
      const def = reg.species[id]!;
      const d = info.speciesDiets![i]!;
      expect(d.metabolism).toBe(def.metabolism);
      expect(d.foods).toEqual(def.foodPriority.filter((f) => f !== 'film'));
      expect(d.prey).toEqual(def.prey.map((p) => ({ id: p.id, requires: p.requires })));
      expect(d.hosts).toEqual(def.hostIds);
      expect(d.digestsFilm).toBe(def.digestsFilm);
    });
  });

  it('every species enabled after wave 2 reads its diet line, qualifiers kept and absent prey counted', () => {
    const info = infoOf(waveRegistry());
    expect([...info.speciesIds].sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const id of info.speciesIds) {
      const line = dietLine(info, id);
      expect(line?.text, id).toBe(EXPECTED[id]);
      expect(line?.symbol, id).toBe(SYMBOL[id] ?? 'eats');
      expect(line!.text, id).not.toMatch(/\b(superior|advanced|perfect|adapted|immune)\b/i);
    }
  });

  it('film digestion is said only when the world enables film; a g2 dish keeps its five species’ lines', () => {
    const info = infoOf(registryWith(G2_LISTS));
    expect(info.speciesIds).toEqual(['A01', 'B01', 'B04', 'B06', 'P01']);
    expect(dietLine(info, 'B04')!.text).toBe('Eats debris, then protein, then starch, then oil.');
    expect(dietLine(info, 'P01')!.text).toBe('Hunts Sprinter, Recycler, Crumbsmith and Sunbead, and 15 kinds not in this dish.');
  });

  it('a dropped qualifier or an absent prey shows: the derivation states each requirement', () => {
    const base = infoOf(waveRegistry());
    const i = base.speciesIds.indexOf('P02');
    const diets = [...base.speciesDiets!];
    const patch = (prey: SpeciesDiet['prey']): DishInfo => {
      const d = [...diets];
      d[i] = { ...d[i]!, prey };
      return { ...base, speciesDiets: d };
    };
    expect(dietLine(patch([{ id: 'B06', requires: 'free' }]), 'P02')!.text).toBe('Hunts Crumbsmith only free-swimming.');
    expect(dietLine(patch([{ id: 'B06', requires: 'inSediment' }]), 'P02')!.text).toBe('Hunts Crumbsmith only in sediment.');
    expect(dietLine(patch([{ id: 'B06', requires: 'any' }]), 'P02')!.text).toBe('Hunts Crumbsmith.');
    expect(dietLine(patch([{ id: 'B99', requires: 'any' }]), 'P02')!.text).toBe('Hunts 1 kind, none of them in this dish.');
    expect(dietLine(patch([{ id: 'B01', requires: 'any' }, { id: 'B06', requires: 'free' }, { id: 'B05', requires: 'inSediment' }, { id: 'B98', requires: 'any' }, { id: 'B99', requires: 'free' }]), 'P02')!.text).toBe(
      'Hunts Sprinter (Crumbsmith only free-swimming; Crossfeeder only in sediment), and 2 kinds not in this dish.',
    );
    const { speciesDiets: _omitted, ...withoutDiets } = base;
    expect(dietLine(withoutDiets, 'P02')).toBeNull();
    expect(dietLine(base, 'Z99')).toBeNull();
  });

  it('V01 is a phage: its Life brush is the dose rule (open cells and porous beads), and its copy reads units per cell', () => {
    const info = infoOf(waveRegistry());
    expect(isPhage(info, 'V01')).toBe(true);
    expect(isPhage(info, 'B01')).toBe(false);
    const brush = lifeBrushFor(info, 'V01')!;
    expect(brush.viral).toBe(true);
    for (const st of [ST_NONE, ST_BEAD, ST_STONE, ST_WALL, ST_OUTSIDE])
      for (const sub of [SUB_WATER, SUB_GEL, SUB_SEDIMENT])
        for (const edge of [false, true]) expect(lifeCellOutcome(st, sub, brush, edge)).toBe(brushCellOutcome('material', st, false));
    expect(lifeBrushFor(info, 'B01')!.viral).toBeUndefined();
    expect(LIFE_COPY.phageDose(5, 'Pinphage')).toBe('Adds 5 Pinphage units to every covered cell.');
    expect(LIFE_COPY.phageDose(1, 'Pinphage')).toBe('Adds 1 Pinphage unit to every covered cell.');
    expect(LIFE_COPY.phageAdded(20, 'Pinphage', 29)).toBe('Added 20 Pinphage units to each of 29 cells.');
    expect(LIFE_COPY.phageAdded(5, 'Pinphage', 1)).toBe('Added 5 Pinphage units to 1 cell.');
    expect(LIFE_COPY.phageTile(20)).toBe('20 units per cell');
  });
});
