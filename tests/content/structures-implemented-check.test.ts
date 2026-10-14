/**
 * The validator's "not implemented" refusal for a Phase 5 structure (registry.ts, enabledStructures). Since
 * the systems flip (D-0121) every shipped structure is implemented, so this file mocks IMPLEMENTED_STRUCTURES
 * without S12 to keep the refusal (and allowUnimplemented's exemption) covered.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/sim/content/implemented', async (importOriginal) => {
  const orig = await importOriginal<{ readonly IMPLEMENTED_STRUCTURES: readonly string[] }>();
  return { ...orig, IMPLEMENTED_STRUCTURES: orig.IMPLEMENTED_STRUCTURES.filter((id) => id !== 'S12') };
});

import { validateContent } from '../../src/sim/content/registry';
import { patchedRawPacks } from '../helpers/registry';

const errorsOf = (allowUnimplemented: boolean) =>
  validateContent(patchedRawPacks({}), { allowUnimplemented })
    .issues.filter((i) => i.severity === 'error')
    .map((i) => `${i.file} → ${i.path}: ${i.message}`);

describe('a structure the simulation does not implement is refused by the validator', () => {
  it('names the structure; allowUnimplemented exempts it', () => {
    expect(errorsOf(false)).toEqual(['content/manifest.json → enabledStructures.12: "S12" is not implemented by the simulation yet']);
    expect(errorsOf(true)).toEqual([]);
  });
});
