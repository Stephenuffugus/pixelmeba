import { describe, expect, it, vi } from 'vitest';
import { validateContent, type RawPacks } from '../../src/sim/content/registry';
import { loadRawPacksFs } from '../../tools/lib/content-fs';

// Since wave 13 every NativeAbility is implemented, so the rule has no real subject left (an unknown id fails the
// z.enum first). The list is mocked without 'TRAP' so the rule stays tested.
vi.mock('../../src/sim/content/implemented', async (importOriginal) => {
  const orig = await importOriginal<{ readonly IMPLEMENTED_NATIVE_ABILITIES: readonly string[] }>();
  return { ...orig, IMPLEMENTED_NATIVE_ABILITIES: orig.IMPLEMENTED_NATIVE_ABILITIES.filter((a) => a !== 'TRAP') };
});

describe('content validation: unimplemented native abilities', () => {
  it('refuses to enable a species whose native ability is not implemented', () => {
    const raw = JSON.parse(JSON.stringify(loadRawPacksFs())) as RawPacks;
    const m = raw.manifest.data as { enabledSpecies: string[]; buildPhase: number };
    m.enabledSpecies = [...m.enabledSpecies, 'F03'].sort();
    m.buildPhase = 7;
    const errs = validateContent(raw).issues.filter((i) => i.severity === 'error');
    expect(errs.some((e) => e.file === 'content/species/F03.json' && e.message.includes('TRAP'))).toBe(true);
  });
});
