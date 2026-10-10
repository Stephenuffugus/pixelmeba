/**
 * Field Guide "Seen in your dishes" on an ability (module) entry (P3.8; lead fix 4a). Relationships are
 * noted for species only (src/worker/relationships.ts), but E01 Starch release and E09 Protein release
 * are the mechanism behind noted "converts" relationships and E08 Debris feeder behind "eats detritus".
 * src/sim/moduleNotes.ts derives that from the profile rules the watcher reads (producer rules for
 * producersNear, the debris-feeder route for the intake record); the guide line names it, and says
 * nothing is noted only for an ability that drives no recorded relationship.
 */
import { describe, expect, it } from 'vitest';
import { moduleNotes } from '../../src/sim/moduleNotes';
import { GUIDE_TEXT } from '../../src/ui/strings/guide';
import { registry } from '../helpers/world';

describe('what an ability can make a dish note about its carriers', () => {
  const reg = registry();
  const enabled = reg.manifest.enabledSpecies.map((id) => reg.species[id]!);

  it('E01 and E09 drive converts (starch, protein), E08 drives eating debris; the other enabled abilities drive none', () => {
    const got = Object.fromEntries(
      reg.manifest.enabledModules.map((id) => [id, moduleNotes(reg.modules[id]!, enabled)]),
    );
    expect(got.E01).toEqual({ converts: ['starch'], eats: [] });
    expect(got.E09).toEqual({ converts: ['protein'], eats: [] });
    expect(got.E08).toEqual({ converts: [], eats: ['detritus'] });
    for (const id of reg.manifest.enabledModules.filter((m) => !['E01', 'E08', 'E09'].includes(m)))
      expect(got[id], id).toEqual({ converts: [], eats: [] });
  });

  it('an ability with no enabled eligible ancestor drives nothing it could be noted for', () => {
    expect(
      moduleNotes(
        reg.modules.E01!,
        enabled.filter((s) => !reg.modules.E01!.eligibleAncestors.includes(s.id)),
      ),
    ).toEqual({ converts: [], eats: [] });
  });

  it('the guide entry line names it, and says nothing is added only when nothing is', async () => {
    const { guideModel } = await import('../../src/ui/views/FieldGuideData');
    const model = guideModel(reg);
    const line = (id: string) => GUIDE_TEXT.seenModule(model.modules.find((m) => m.id === id)!.notes);
    expect(line('E01')).toBe(
      'Your dishes keep notes for species, not for abilities. A species carrying this ability can be noted for its enzyme turning starch into sugar: look for that note on the species that carry it.',
    );
    expect(line('E09')).toContain('its enzyme turning protein into broth');
    expect(line('E08')).toContain('can be noted for eating debris');
    expect(line('E03')).toBe(
      'Your dishes keep notes for species, not for abilities, and this ability adds nothing they note: whatever its carriers were seen doing is on their own species’ entries.',
    );
    // Structures, tools and habitats keep the fixed line (the e2e spec pins it on a tool).
    expect(GUIDE_TEXT.seenNotNoted).toContain('This entry is none of those, so nothing is noted for it.');
  });
});
