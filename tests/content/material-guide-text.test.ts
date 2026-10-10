/**
 * UX §5.7, BUILD_DIRECTIVE P3.1: materials say "No additional modeled reaction." where true. Every
 * material this build enables states it in its guide rules, except the records listed below with the
 * reaction they take part in. Every Phase 1–3 material record states it today (foods and enzymes
 * included); the content validator enforces the same rule (P3.8, tests/content/guide.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { MATERIAL_REACTIONS, NO_REACTION_SENTENCE } from '../../src/sim/content/guideRules';
import { registry } from '../helpers/world';

const SENTENCE = NO_REACTION_SENTENCE;

/**
 * Enabled materials whose rules text does not carry the sentence, each with the modeled reaction it
 * takes part in: the validator's own list (src/sim/content/guideRules.ts, P3.8), so there is one list.
 * Empty since P3.8 appended the sentence to the three Phase 1 records (SUGAR, NUTRIENT, DEBRIS).
 */
const EXCEPTIONS: Readonly<Record<string, string>> = MATERIAL_REACTIONS;

describe('material guide text (UX §5.7; P3.1)', () => {
  const reg = registry();

  it('every enabled material says "No additional modeled reaction." unless it is listed with a reason', () => {
    const enabled = reg.manifest.enabledMaterials;
    // This build's chemistry and food materials are all there.
    for (const id of [
      'ACID',
      'BASE',
      'BUFFER',
      'CO2',
      'INH_BACT',
      'INH_FUNG',
      'INH_PHOTO',
      'METABOLITE',
      'OIL',
      'OXYGEN',
      'PROTEIN',
      'SALT',
    ])
      expect(enabled).toContain(id);
    expect(SENTENCE).toBe('No additional modeled reaction.');
    const missing = enabled.filter((id) => !reg.materials[id]!.guide.rules.includes(SENTENCE));
    expect(missing.sort()).toEqual(Object.keys(EXCEPTIONS).sort());
    for (const id of Object.keys(EXCEPTIONS))
      expect(enabled, `${id} is no longer enabled: drop it from the list`).toContain(id);
  });

  it('every Phase 1–3 material record says it, enabled or not', () => {
    const later = Object.values(reg.materials).filter((m) => m.phase >= 1 && m.phase <= 3);
    expect(later.length).toBeGreaterThan(15);
    for (const m of later) expect(m.guide.rules, m.id).toContain(SENTENCE);
  });
});
