/**
 * Phase 5 wave 8b (structure-content): the twelve structure records S01–S12 and the wetting brush as
 * validated content (CT §4, §5.3, §12.2, §14; SPEC §2.4, §4.8; D-0104, D-0106). Since the systems flip
 * (D-0121) the shipped manifest enables all twelve with 'barriers', 'climate' and 'devices', and they are
 * listed as implemented; a manifest without those systems (V1_SYSTEMS, the v1.0 systems) is built through
 * patched manifests (tests/helpers/registry.ts). The validator's "not implemented" refusal is
 * tests/content/structures-implemented-check.test.ts (it mocks the list).
 */
import { describe, expect, it } from 'vitest';
import { validateContent, type RawPacks } from '../../src/sim/content/registry';
import { DevicePlacementSchema, EdgePlacementSchema, StructureSchema } from '../../src/sim/content/schema';
import { enabledToolIds } from '../../src/sim/content/guideRules';
import { IMPLEMENTED_STRUCTURES } from '../../src/sim/content/implemented';
import { STRUCTURE_KINDS, STRUCTURE_SYSTEM_NEEDS } from '../../src/sim/content/structureRules';
import { EDGE_KINDS } from '../../src/sim/barriers';
import { DEVICE_KINDS, FURNISHING_KINDS, MACHINE_KINDS, RESIN_TARGETS } from '../../src/sim/devices';
import type { SystemFlag } from '../../src/sim/fields';
import { contentHashOf, patchedRawPacks, registryWith, type ManifestPatch } from '../helpers/registry';
import { HABITAT_IDS } from '../helpers/habitats';
import { PRE_FLIP_LISTS, registry } from '../helpers/world';

const DRY = 'Drying never concentrates chemicals: amounts are kept per cell, so a drying cell holds exactly what it held.';
const IDS = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'];
/** CT §4 names and kinds. */
const CT4: Record<string, [string, 'edge' | 'furnishing' | 'device']> = {
  S01: ['Fine membrane', 'edge'],
  S02: ['Small gate', 'edge'],
  S03: ['Shutter gate', 'edge'],
  S04: ['One-way channel', 'edge'],
  S05: ['Porous shelter', 'furnishing'],
  S06: ['Attachment mesh', 'furnishing'],
  S07: ['Nutrient basket', 'furnishing'],
  S08: ['Adsorption resin', 'device'],
  S09: ['Heater', 'device'],
  S10: ['Cooler', 'device'],
  S11: ['Shade roof', 'furnishing'],
  S12: ['Moisture wick', 'furnishing'],
};
/** The CT §4 / §5.3 / §12.2 / §14 numbers each rules text states. */
const NUMBERS: Record<string, string[]> = {
  S01: ['25 %', '512'],
  S02: ['50 %', '512'],
  S03: ['512'],
  S04: ['2 %', 'one Small free organism', '512'],
  S05: ['256'],
  S06: ['256'],
  S07: ['256'],
  S08: ['0.05', ' 5 units', '256'],
  S09: ['0.01', '256'],
  S10: ['0.01', '256'],
  S11: ['0.25', '256'],
  S12: ['0.8', '0.01', '256'],
};

const ALL_ON: SystemFlag[] = [...new Set([...registry().manifest.enabledSystems, 'barriers', 'climate', 'devices'])].sort() as SystemFlag[];
const WITH_ALL: ManifestPatch = { enabledSystems: ALL_ON, enabledStructures: ['BEAD', ...IDS, 'STONE', 'WALL'] };
/** A v1.0 dish's systems (tests/helpers/world.ts PRE_FLIP_LISTS; the shipped list has gained the flips' since). */
const V1_SYSTEMS: SystemFlag[] = [...PRE_FLIP_LISTS.enabledSystems];
/** A manifest as before the systems flip: a v1.0 dish's lists (the v1.0 systems and the cell structures only). */
const PRE_FLIP: ManifestPatch = {
  enabledSpecies: PRE_FLIP_LISTS.enabledSpecies,
  enabledModules: PRE_FLIP_LISTS.enabledModules,
  enabledSystems: V1_SYSTEMS,
  enabledMaterials: PRE_FLIP_LISTS.enabledMaterials,
  enabledStructures: ['BEAD', 'STONE', 'WALL'],
  enabledHabitats: PRE_FLIP_LISTS.enabledHabitats,
  moduleRegistryVersion: PRE_FLIP_LISTS.moduleRegistryVersion,
};

const errorsOf = (raw: RawPacks, allowUnimplemented = false) =>
  validateContent(raw, { allowUnimplemented })
    .issues.filter((i) => i.severity === 'error')
    .map((i) => `${i.file} → ${i.path}: ${i.message}`);

describe('P5.2 structure records S01–S12 (CT §4)', () => {
  const reg = registry();

  it('the twelve records parse with their CT §4 names, kinds and phase 5; icon ids are unique', () => {
    for (const id of IDS) {
      const st = reg.structures[id]!;
      expect(StructureSchema.parse(st)).toEqual(st);
      expect([st.name, st.kind], id).toEqual(CT4[id]);
      expect(st.phase, id).toBe(5);
      expect(st.iconId).toBe(`structure_${id.toLowerCase()}`);
      expect(STRUCTURE_KINDS[id]).toBe(st.kind);
    }
    const icons = reg.structureIds.map((id) => reg.structures[id]!.iconId);
    expect(new Set(icons).size).toBe(icons.length);
    // One table: the sim's edge and device kinds agree with structureRules.ts and the placement schemas.
    expect(IDS.filter((id) => STRUCTURE_KINDS[id] === 'edge')).toEqual([...EDGE_KINDS]);
    expect(IDS.filter((id) => STRUCTURE_KINDS[id] === 'furnishing')).toEqual([...FURNISHING_KINDS]);
    expect(IDS.filter((id) => STRUCTURE_KINDS[id] === 'device')).toEqual([...MACHINE_KINDS]);
    expect(EdgePlacementSchema.safeParse({ structure: 'S05', dir: 'R', x0: 1, y0: 1, x1: 1, y1: 1 }).success).toBe(false);
    for (const k of DEVICE_KINDS) expect(DevicePlacementSchema.safeParse({ structure: k, at: [64, 64] }).success, k).toBe(true);
    expect(DevicePlacementSchema.safeParse({ structure: 'S08', at: [64, 64], resinSelect: [...RESIN_TARGETS] }).success).toBe(true);
    expect(DevicePlacementSchema.safeParse({ structure: 'S08', at: [64, 64], resinSelect: ['oxygen'] }).success).toBe(false);
    expect(IMPLEMENTED_STRUCTURES).toEqual(IDS); // since the systems flip (D-0121)
  });

  it('each rules text states its numbers and limits; the roof, the wick and the wetting brush say drying never concentrates', () => {
    for (const id of IDS) {
      const rules = reg.structures[id]!.guide.rules;
      for (const n of NUMBERS[id]!) expect(rules, `${id} ${n}`).toContain(n);
      if (STRUCTURE_KINDS[id] === 'edge') expect(rules, id).toContain('two barriers on one edge are refused');
      else expect(rules, id).toContain('One furnishing or device per cell');
      expect(rules.includes(DRY), id).toBe(id === 'S11' || id === 'S12');
    }
    expect(reg.structures.S04!.guide.rules).toContain('Nothing else crosses that edge');
    expect(reg.structures.S07!.guide.rules).toContain('Removing the basket leaves the object');
    expect(reg.structures.S08!.guide.rules).toContain('logged export');
    expect(reg.structures.S09!.guide.rules).toContain('starts Off');
    expect(reg.structures.S12!.guide.rules).toContain('Wicks do not chain');
    const brush = reg.tools.WET_BRUSH!;
    expect(brush.name).toBe('Wetting brush');
    expect(brush.phase).toBe(5);
    expect(brush.requiresSystem).toBe('climate');
    expect(brush.dose).toBe('Sets moisture to 0.9.');
    expect(brush.guide.rules).toContain(DRY);
    expect(brush.doesNotChange).toContain('Adds no water and dilutes nothing: every amount in the cell stays the same.');
    expect(brush.doesNotChange).toContain(DRY);
    // No ranking words (SPEC §12.9).
    const text = JSON.stringify([...IDS.map((id) => reg.structures[id]), brush]);
    expect(text).not.toMatch(/superior|advanced|perfect|adapted|immune/i);
  });

  it('since the systems flip (D-0121) the shipped manifest enables all twelve with barriers, climate and devices (signals, rivalry and silicate since the organism flip, D-0127; never equipment or developmental), and validates', () => {
    expect(reg.manifest.enabledStructures).toEqual(['BEAD', ...IDS, 'STONE', 'WALL']);
    for (const s of ['barriers', 'climate', 'devices', 'signals', 'rivalry', 'silicate'] as const) expect(reg.manifest.enabledSystems).toContain(s);
    for (const s of ['equipment', 'developmental'] as const) expect(reg.manifest.enabledSystems).not.toContain(s);
    expect(reg.manifest.enabledSystems).toEqual(ALL_ON);
    expect(errorsOf(patchedRawPacks({}))).toEqual([]);
    // The pre-flip manifest (v1.0 systems, cell structures only) still validates.
    expect(errorsOf(patchedRawPacks(PRE_FLIP))).toEqual([]);
  });

  it('enabling one needs its systems (no allowUnimplemented since the flip); the error names both sides', () => {
    // On a v1.0 dish's lists (PRE_FLIP): the shipped species need signals, rivalry and silicate since the organism flip (D-0127).
    expect(errorsOf(patchedRawPacks({ ...PRE_FLIP, enabledSystems: V1_SYSTEMS, enabledStructures: ['BEAD', 'S01', 'STONE', 'WALL'] }))).toEqual([
      'content/manifest.json → enabledStructures.1: enabled structure "S01" (Fine membrane) needs the "barriers" system (not in enabledSystems)',
    ]);
    const withDevices = [...V1_SYSTEMS, 'devices'].sort() as SystemFlag[];
    expect(errorsOf(patchedRawPacks({ ...PRE_FLIP, enabledSystems: withDevices, enabledStructures: ['BEAD', 'S09', 'STONE', 'WALL'] }))).toEqual([
      'content/manifest.json → enabledStructures.1: enabled structure "S09" (Heater) needs the "climate" system (not in enabledSystems)',
    ]);
    // One structure cannot furnish the Phase 5 habitats (enabled since D-0130): the v1.0 habitats only.
    for (const id of IDS) {
      const list = ['BEAD', id, 'STONE', 'WALL'];
      expect(errorsOf(patchedRawPacks({ enabledSystems: ALL_ON, enabledStructures: list, enabledHabitats: PRE_FLIP_LISTS.enabledHabitats })), id).toEqual([]);
    }
    expect(errorsOf(patchedRawPacks(WITH_ALL))).toEqual([]);
    expect(() => registryWith(WITH_ALL)).not.toThrow();
    // Each structure's systems (PROPOSED DECISION): edges 'barriers'; furnishings and devices 'devices'; S09, S10, S12 also 'climate'.
    expect(STRUCTURE_SYSTEM_NEEDS).toEqual({
      S01: ['barriers'], S02: ['barriers'], S03: ['barriers'], S04: ['barriers'],
      S05: ['devices'], S06: ['devices'], S07: ['devices'], S08: ['devices'],
      S09: ['devices', 'climate'], S10: ['devices', 'climate'], S11: ['devices'], S12: ['devices', 'climate'],
    });
  });

  it('a record whose kind differs from CT §4 is refused, enabled or not', () => {
    const raw = patchedRawPacks({});
    const f = raw.structures.find((x) => x.file.endsWith('S05.json'))!;
    (f.data as { kind: string }).kind = 'edge';
    (raw.manifest.data as { contentHash: string }).contentHash = contentHashOf(raw);
    expect(errorsOf(raw)).toEqual(['content/structures/S05.json → kind: S05 is a furnishing in the simulation (CT §4), not an edge barrier']);
    const raw2 = patchedRawPacks({});
    const wall = raw2.structures.find((x) => x.file.endsWith('WALL.json'))!;
    (wall.data as { kind: string }).kind = 'device';
    expect(errorsOf(raw2)).toEqual(['content/structures/WALL.json → kind: WALL is a cell structure in the simulation (CT §4), not a device']);
  });
});

describe('the wetting brush appears only where the dish has climate (PROPOSED DECISION: requiresSystem)', () => {
  it('enabledToolIds drops WET_BRUSH without the climate system and keeps it with it', () => {
    const reg = registry();
    const m = reg.manifest;
    // Since the systems flip (D-0121) the shipped manifest has climate, so the build lists the brush.
    expect(enabledToolIds(reg.tools, reg.toolIds, m.buildPhase, m.enabledSystems)).toContain('WET_BRUSH');
    expect(enabledToolIds(reg.tools, reg.toolIds, m.buildPhase, V1_SYSTEMS)).not.toContain('WET_BRUSH');
    expect(enabledToolIds(reg.tools, reg.toolIds, m.buildPhase, [...V1_SYSTEMS, 'climate'])).toContain('WET_BRUSH');
    expect(enabledToolIds(reg.tools, reg.toolIds, 4, m.enabledSystems)).not.toContain('WET_BRUSH');
    // Every other tool is unaffected by the systems.
    expect(enabledToolIds(reg.tools, reg.toolIds, m.buildPhase, V1_SYSTEMS)).toEqual(reg.toolIds.filter((id) => id !== 'WET_BRUSH'));
  });

  it('the Field Guide model lists it only with climate (the shipped build, since the systems flip)', async () => {
    const { guideModel } = await import('../../src/ui/views/FieldGuideData');
    const shipped = guideModel(registry());
    const entry = shipped.equipment.find((e) => e.id === 'WET_BRUSH');
    expect(entry).toMatchObject({ kind: 'tool', name: 'Wetting brush' });
    const preFlip = guideModel(registryWith(PRE_FLIP));
    expect(preFlip.equipment.map((e) => e.id)).not.toContain('WET_BRUSH');
    // The shipped guide also lists S01–S12 (enabled structures) and the eight Phase 5 habitats (D-0130); apart
    // from those and the brush, the same entries.
    const later = new Set<string>([...IDS, ...HABITAT_IDS]);
    expect(shipped.equipment.map((e) => e.id).filter((id) => id !== 'WET_BRUSH' && !later.has(id))).toEqual(preFlip.equipment.map((e) => e.id));
    for (const id of IDS) expect(shipped.equipment.map((e) => e.id), id).toContain(id);
  });

  it('an enabled tool with blank text is refused only once the dish has climate', () => {
    const raw = patchedRawPacks({ enabledSystems: ALL_ON });
    const t = raw.tools!.find((x) => x.file.endsWith('WET_BRUSH.json'))!;
    (t.data as { watchFor: string }).watchFor = ' ';
    expect(errorsOf(raw)).toContain('content/tools/WET_BRUSH.json → watchFor: enabled tool needs Field Guide text here');
    const raw2 = patchedRawPacks(PRE_FLIP);
    const t2 = raw2.tools!.find((x) => x.file.endsWith('WET_BRUSH.json'))!;
    (t2.data as { watchFor: string }).watchFor = ' ';
    expect(errorsOf(raw2)).toEqual([]);
  });
});
