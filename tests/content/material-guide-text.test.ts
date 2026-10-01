/**
 * UX §5.7, BUILD_DIRECTIVE P3.1: materials say "No additional modeled reaction." where true. Every
 * material this build enables states it in its guide rules, except the records listed below with the
 * reason they do not. Every Phase 2–3 material record states it today (foods and enzymes included).
 */
import { describe, expect, it } from 'vitest';
import { registry } from '../helpers/world';

const SENTENCE = 'No additional modeled reaction.';

/**
 * Enabled materials whose rules text does not carry the sentence, and why. The three Phase 1 records
 * predate the convention (their files belong to the Phase 1 content; P3.1 did not edit them).
 */
const EXCEPTIONS: Readonly<Record<string, string>> = {
  NUTRIENT:
    'Phase 1 record; its rules explain that nutrient alone is not food (tests/sim/lab-commands.test.ts pins that text)',
  SUGAR: 'Phase 1 record, written before the convention',
  DEBRIS: 'Phase 1 record, written before the convention',
};

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
    const missing = enabled.filter((id) => !reg.materials[id]!.guide.rules.includes(SENTENCE));
    expect(missing.sort()).toEqual(Object.keys(EXCEPTIONS).sort());
    for (const id of Object.keys(EXCEPTIONS))
      expect(enabled, `${id} is no longer enabled: drop it from the list`).toContain(id);
  });

  it('every Phase 2–3 material record says it, enabled or not', () => {
    const later = Object.values(reg.materials).filter((m) => m.phase >= 2 && m.phase <= 3);
    expect(later.length).toBeGreaterThan(15);
    for (const m of later) expect(m.guide.rules, m.id).toContain(SENTENCE);
  });
});
