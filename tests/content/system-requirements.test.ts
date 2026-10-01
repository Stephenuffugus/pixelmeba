/**
 * System requirements (Phase 3 foundation; src/sim/content/registry.ts): an enabled species, material
 * or module needs the manifest systems it uses, and the validator's error names both sides. The
 * patched packs are validated with { allowUnimplemented: true } so a "not implemented yet" error for
 * Phase 3 abilities other builders are implementing cannot mask the system error.
 */
import { describe, expect, it } from 'vitest';
import {
  materialSystemNeed,
  MODULE_SYSTEM_NEEDS,
  speciesSystemNeeds,
  validateContent,
  type ContentIssue,
} from '../../src/sim/content/registry';
import type { SystemFlag } from '../../src/sim/fields';
import { loadRawPacksFs } from '../../tools/lib/content-fs';
import { G2_LISTS, patchedRawPacks, type ManifestPatch } from '../helpers/registry';

const shipped = () => validateContent(loadRawPacksFs());

/**
 * Errors of the packs on disk with the g2 enabled lists (at build phase 3, so Phase 3 records may be
 * enabled) and `patch` applied. Every list is patched, so another builder's in-flight manifest edit
 * cannot change what these tests enable. Phase 3 recipes, cards and variants then report content the
 * g2 lists do not enable; the tests look only at the system errors (SYSTEM_ERROR).
 */
function issuesWith(patch: ManifestPatch): readonly ContentIssue[] {
  const base: ManifestPatch = {
    enabledSpecies: G2_LISTS.enabledSpecies,
    enabledModules: G2_LISTS.enabledModules,
    enabledSystems: G2_LISTS.enabledSystems,
    enabledMaterials: G2_LISTS.enabledMaterials,
    buildPhase: 3,
  };
  return validateContent(patchedRawPacks({ ...base, ...patch }), { allowUnimplemented: true }).issues.filter(
    (i) => i.severity === 'error',
  );
}

const SYSTEM_ERROR = /system \(not in enabledSystems\)$/;
const systemErrors = (errs: readonly ContentIssue[]) => errs.filter((e) => SYSTEM_ERROR.test(e.message));

const sorted = (list: readonly string[], add: string) => [...list, add].sort();
const systemsWith = (add: SystemFlag): SystemFlag[] => [...G2_LISTS.enabledSystems, add];

describe('enabled content needs the systems it uses', () => {
  it('B02 without the film system fails, naming BIOFILM and film; with film it does not', () => {
    const errs = issuesWith({ enabledSpecies: sorted(G2_LISTS.enabledSpecies, 'B02') });
    expect(systemErrors(issuesWith({}))).toEqual([]); // the g2 lists alone need no missing system
    const hit = errs.find(
      (e) =>
        e.message.includes('"B02"') && e.message.includes('BIOFILM') && e.message.includes('"film" system'),
    );
    expect(hit, errs.map((e) => e.message).join('\n')).toBeDefined();
    expect(hit!.path).toMatch(/^enabledSpecies\.\d+$/);
    const ok = issuesWith({
      enabledSpecies: sorted(G2_LISTS.enabledSpecies, 'B02'),
      enabledSystems: systemsWith('film'),
    });
    expect(systemErrors(ok)).toEqual([]);
  });

  it('INH_BACT without chemistry fails, naming chemistry', () => {
    const errs = issuesWith({ enabledMaterials: sorted(G2_LISTS.enabledMaterials, 'INH_BACT') });
    expect(
      errs.some((e) => e.message.includes('"INH_BACT"') && e.message.includes('"chemistry" system')),
    ).toBe(true);
    const ok = issuesWith({
      enabledMaterials: sorted(G2_LISTS.enabledMaterials, 'INH_BACT'),
      enabledSystems: systemsWith('chemistry'),
    });
    expect(systemErrors(ok)).toEqual([]);
  });

  it('module E10 without film fails, naming film', () => {
    const errs = issuesWith({ enabledModules: sorted(G2_LISTS.enabledModules, 'E10') });
    expect(errs.some((e) => e.message.includes('"E10"') && e.message.includes('"film" system'))).toBe(true);
  });

  it('M10 without foodObjects fails, naming foodObjects', () => {
    const errs = issuesWith({ enabledMaterials: sorted(G2_LISTS.enabledMaterials, 'M10') });
    expect(errs.some((e) => e.message.includes('"M10"') && e.message.includes('"foodObjects" system'))).toBe(
      true,
    );
  });

  it('the shipped manifest validates (B04 digests film; the film system ships with B02 and F01 since wave 2)', () => {
    const res = shipped();
    expect(res.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(res.registry).not.toBeNull();
    const m = res.registry!.manifest;
    expect(res.registry!.species.B04!.digestsFilm).toBe(true);
    expect(m.enabledSpecies).toContain('B04');
    expect(m.enabledSystems).toContain('film');
    expect(m.enabledSpecies).toEqual(expect.arrayContaining(['B02', 'F01']));
  });

  it('the requirement tables (species, materials, modules)', () => {
    const reg = shipped().registry!;
    const needs = (id: string) => speciesSystemNeeds(reg.species[id]!).map(([sys]) => sys);
    expect(needs('B04')).toEqual([]); // digestsFilm never requires film
    expect(needs('B01')).toEqual([]);
    expect(needs('B02')).toEqual(['film']);
    expect(needs('B06')).toEqual(['enzymes']);
    expect(needs('B08')).toEqual(['enzymes', 'enzymes']); // E_PROTEIN_SECRETION and a broth diet
    expect(needs('Y02')).toEqual(['enzymes']);
    expect(needs('F01')).toEqual(['fungi']);
    expect(needs('F02')).toEqual(['fungi', 'fungi', 'enzymes']);
    expect(needs('F03')).toEqual(['fungi', 'enzymes']);
    expect(needs('X01')).toEqual(['parasites']);
    expect(needs('V01')).toEqual(['viruses']);
    const mat = (id: string) => materialSystemNeed(reg.materials[id]!);
    expect(['INH_BACT', 'INH_FUNG', 'INH_PHOTO'].map(mat)).toEqual(['chemistry', 'chemistry', 'chemistry']);
    expect(['M01', 'M03', 'M04', 'M05', 'M09'].map(mat)).toEqual([
      'enzymes',
      'enzymes',
      'enzymes',
      'enzymes',
      'enzymes',
    ]);
    expect(['M02', 'M06', 'M07', 'M08', 'M12'].map(mat)).toEqual([
      'silicate',
      'signals',
      'signals',
      'rivalry',
      'silicate',
    ]);
    expect(['M10', 'M11'].map(mat)).toEqual(['foodObjects', 'foodObjects']);
    expect(['SUGAR', 'STARCH', 'DEBRIS', 'NUTRIENT', 'ACID', 'GEL', 'SHADE'].map(mat)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(MODULE_SYSTEM_NEEDS).toEqual({ E01: 'enzymes', E09: 'enzymes', E10: 'film' });
  });
});
