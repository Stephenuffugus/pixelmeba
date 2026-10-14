/**
 * D-0121 (the lead's ceilings; the flip verifier's validator finding): the content validator refuses a
 * manifest that names a system outside IMPLEMENTED_SYSTEMS, a rules version newer than IMPLEMENTED_RULES or
 * developmental changes. The import refuses a dish recording any of them (tests/persistence/
 * import-implemented.test.ts), so a manifest that shipped one would make every new dish impossible to reopen.
 */
import { describe, expect, it } from 'vitest';
import { IMPLEMENTED_RULES, RULES_VERSIONS } from '../../src/sim/content/implemented';
import { validateContent } from '../../src/sim/content/registry';
import { patchedRawPacks, type ManifestPatch } from '../helpers/registry';
import { registry } from '../helpers/world';

const SHIPPED = registry().manifest;

function errorsOf(patch: ManifestPatch, allowUnimplemented = false): string[] {
  return validateContent(patchedRawPacks(patch), { allowUnimplemented })
    .issues.filter((i) => i.severity === 'error')
    .map((i) => `${i.path}: ${i.message}`);
}

describe('the validator keeps the shipped manifest within what the simulation implements (D-0121)', () => {
  it('the shipped manifest passes', () => {
    expect(errorsOf({})).toEqual([]);
  });

  it("an unimplemented system ('equipment', 'developmental') is refused at its index", () => {
    for (const sys of ['equipment', 'developmental'] as const) {
      const systems = [...SHIPPED.enabledSystems, sys].sort();
      expect(errorsOf({ enabledSystems: systems }), sys).toEqual([`enabledSystems.${systems.indexOf(sys)}: "${sys}" is not implemented by the simulation yet`]);
      expect(errorsOf({ enabledSystems: systems }, true), sys).toEqual([]);
    }
  });

  it('a rules version above the ceiling is refused; at the ceiling it passes', () => {
    for (const [key] of RULES_VERSIONS) {
      if (key === 'simulationVersion') continue; // the schema pins it to 3
      const v = IMPLEMENTED_RULES[key] + 1;
      expect(errorsOf({ [key]: v }), key).toEqual([`${key}: ${v} is newer than the simulation implements (${IMPLEMENTED_RULES[key]})`]);
      expect(errorsOf({ [key]: IMPLEMENTED_RULES[key] }), key).toEqual([]);
    }
  });

  it('developmental changes are refused until Phase 7', () => {
    expect(errorsOf({ developmentalEnabled: true })).toEqual(['developmentalEnabled: developmental changes are not implemented by the simulation yet']);
  });
});
