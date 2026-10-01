/**
 * registryWith's `allowUnimplemented` (Phase 3 preflight; g3-plan-recheck P-19, G13), tested against
 * FIXED implemented lists, so the test never depends on what a later wave implements (preflight fix
 * round 1: naming a Phase 3 module as "not implemented" would fail the day wave 4 implements it).
 *
 * This file replaces src/sim/content/implemented.ts with the g2 build's lists minus one native
 * ability (E_STARCH_SECRETION, B06's) and one module (E05). The g2 content set at build phase 2,
 * which stays valid for good, then holds exactly one unimplemented ability and one unimplemented
 * module, whatever later phases implement or ship.
 */
import { describe, expect, it, vi } from 'vitest';
import type * as Implemented from '../../src/sim/content/implemented';
import { IMPLEMENTED_MODULES, IMPLEMENTED_NATIVE_ABILITIES } from '../../src/sim/content/implemented';
import { validateContent, type ValidateOptions } from '../../src/sim/content/registry';
import { G2_LISTS, patchedRawPacks, registryWith } from './registry';

vi.mock('../../src/sim/content/implemented', async (importOriginal) => {
  const real = await importOriginal<typeof Implemented>();
  return { ...real, IMPLEMENTED_NATIVE_ABILITIES: ['PREDATION'], IMPLEMENTED_MODULES: ['E01', 'E03'] };
});

const errors = (opts?: ValidateOptions) =>
  validateContent(patchedRawPacks(G2_LISTS), opts)
    .issues.filter((i) => i.severity === 'error')
    .map((i) => ({ file: i.file, path: i.path, message: i.message }));

describe('registryWith allowUnimplemented (P-19, G13), against fixed implemented lists', () => {
  it('this file runs the validator with the g2 lists minus E_STARCH_SECRETION and E05', () => {
    expect(IMPLEMENTED_NATIVE_ABILITIES).toEqual(['PREDATION']);
    expect(IMPLEMENTED_MODULES).toEqual(['E01', 'E03']);
  });

  it('is off by default: the g2 content set then fails on exactly the unimplemented ability and module', () => {
    const errs = errors();
    expect(errs).toHaveLength(2);
    expect(errs[0]).toMatchObject({ file: 'content/species/B06.json', path: 'nativeAbilities', message: expect.stringContaining('"E_STARCH_SECRETION"') });
    expect(errs[1]).toMatchObject({ file: 'content/manifest.json', path: 'enabledModules.2', message: expect.stringContaining('"E05"') });
    expect(errors({})).toEqual(errs);
    expect(errors({ allowUnimplemented: false })).toEqual(errs);
    expect(() => registryWith(G2_LISTS)).toThrow(/E_STARCH_SECRETION[\s\S]*"E05"/);
  });

  it('waives exactly those two checks', () => {
    expect(errors({ allowUnimplemented: true })).toEqual([]);
    const reg = registryWith(G2_LISTS, { allowUnimplemented: true });
    expect(reg.manifest.enabledSpecies).toContain('B06');
    expect(reg.manifest.enabledModules).toEqual(['E01', 'E03', 'E05']);
  });

  it('never waives the phase rule or the list rules', () => {
    const allow = { allowUnimplemented: true };
    expect(() => registryWith({ ...G2_LISTS, enabledSpecies: [...G2_LISTS.enabledSpecies, 'B05'].sort() }, allow)).toThrow(/"B05" belongs to phase 3 \(build phase 2\)/);
    expect(() => registryWith({ ...G2_LISTS, enabledModules: [...G2_LISTS.enabledModules, 'E04'].sort() }, allow)).toThrow(/"E04" belongs to phase 3/);
    expect(() => registryWith({ ...G2_LISTS, enabledModules: ['E05', 'E01', 'E03'] }, allow)).toThrow(/must be sorted ascending/);
  });
});
