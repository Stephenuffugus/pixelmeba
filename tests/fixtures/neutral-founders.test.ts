/**
 * G0 fixture: neutral founders (loci at 50) reproduce the canonical profiles exactly, and inactive
 * loci never create movement or sensing (CT §1.2–1.3, §6; SPEC §8.2; D04 C07).
 */
import { describe, expect, it } from 'vitest';
import { neutralGenome, type Genome, genomeIdFromKey, genomeKey } from '../../src/sim/genome';
import { deriveProfile } from '../../src/sim/phenotype';
import { buildSpeciesTable } from '../../src/sim/species';
import { registry } from '../helpers/world';
import { movementTable, profileTable } from '../helpers/tables';

function genome(ancestor: string, loci?: number[]): Genome {
  const input = { ...neutralGenome(ancestor), ...(loci ? { loci } : {}) };
  return { ...input, id: genomeIdFromKey(genomeKey(input)) };
}

describe('G0 neutral founders', () => {
  const reg = registry();
  const defs = reg.speciesIds.map((id) => reg.species[id]!);
  const table = buildSpeciesTable(defs);
  const profiles = profileTable();
  const movement = movementTable();

  it('the canonical tables cover all 38 species', () => {
    expect(profiles.map((r) => r.id).sort()).toEqual([...reg.speciesIds]);
    // Field viruses have no movement row: they are not organisms that move.
    expect(movement.map((r) => r.id).sort()).toEqual(reg.speciesIds.filter((id) => !id.startsWith('V')));
  });

  for (const row of profileTable()) {
    it(`${row.id}: neutral profile equals CT §1.2/§1.3`, () => {
      const sp = table.find((s) => s.id === row.id)!;
      const def = sp.def;
      if (def.category === 'virus') {
        expect(def.b0).toBeCloseTo(0.01, 12);
        return;
      }
      const p = deriveProfile(sp, genome(row.id));
      expect(p.b0).toBe(row.b0);
      if (def.metabolism !== 'hostDrain') expect(p.q).toBeCloseTo(row.q!, 12);
      else expect(def.drainRate).toBeCloseTo(row.q!, 12);
      expect(p.m).toBeCloseTo(row.m!, 12);
      expect(p.minDivisionAge).toBeCloseTo(row.minAge!, 12);
      expect(def.maxAge).toBe(row.maxAge);
      expect(def.energyPerCarbon).toBe(row.energyPerCarbon);
      const mv = movement.find((m) => m.id === row.id)!;
      expect(p.speed).toBeCloseTo(mv.speed!, 12);
      expect(p.sensing).toBe(mv.sense);
      expect(def.attackCooldown).toBe(mv.cooldown);
      expect(p.divisionCost).toBeCloseTo(20, 12);
      expect(p.energyCap).toBe(100);
      expect(p.ph).toEqual(def.tolerances.ph);
      expect(p.warmth).toEqual(def.tolerances.warmth);
      expect(p.salinity).toEqual(def.tolerances.salinity);
    });
  }

  it('inactive loci create no movement or sensing even at extreme values', () => {
    for (const sp of table) {
      if (sp.def.category === 'virus') continue;
      const extreme = genome(sp.id, [100, 50, 100, 50, 50, 50, 50, 50]);
      const p = deriveProfile(sp, extreme);
      if (!sp.def.lociActive[0]) expect(p.speed).toBe(sp.def.speed);
      if (sp.def.speed === 0) expect(p.speed).toBe(0);
      if (!sp.def.lociActive[2]) expect(p.sensing).toBe(sp.def.sensingRadius);
      if (sp.def.sensingRadius === 0) expect(p.sensing).toBe(0);
    }
  });

  it('active loci move the phenotype in the documented direction with their costs', () => {
    const b01 = table.find((s) => s.id === 'B01')!;
    const fast = deriveProfile(b01, genome('B01', [100, 50, 50, 50, 50, 50, 50, 50]));
    expect(fast.speed).toBeCloseTo(0.25 * 1.5, 12);
    expect(fast.motilityFactor).toBeCloseTo(1.5, 12);
    const feeder = deriveProfile(b01, genome('B01', [50, 100, 50, 50, 50, 50, 50, 50]));
    expect(feeder.q).toBeCloseTo(0.18 * 1.25, 12);
    expect(feeder.m).toBeCloseTo(0.5 * 1.25, 12);
    const keen = deriveProfile(b01, genome('B01', [50, 50, 100, 50, 50, 50, 50, 50]));
    expect(keen.sensing).toBe(3);
    expect(keen.m).toBeCloseTo(0.5 * 1.25, 12);
    const hasty = deriveProfile(b01, genome('B01', [50, 50, 50, 100, 50, 50, 50, 50]));
    expect(hasty.minDivisionAge).toBeCloseTo(12 * 0.5, 12);
    expect(hasty.divisionCost).toBeCloseTo(20 * 1.5, 12);
    const salty = deriveProfile(b01, genome('B01', [50, 50, 50, 50, 50, 100, 50, 50]));
    expect(salty.salinity[0]).toBeCloseTo(0.2, 12);
    expect(salty.salinity[1]).toBeCloseTo(0.4, 12);
    const sour = deriveProfile(b01, genome('B01', [50, 50, 50, 50, 0, 50, 50, 50]));
    expect(sour.ph).toEqual([5, 7]);
  });
});
