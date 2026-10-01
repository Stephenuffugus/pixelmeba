/**
 * World gates (src/sim/gates.ts; Phase 3 preflight, g3-plan-recheck P-25): a rule added after g2 asks
 * the world's own recorded manifest, never the build, so an old world never gains a later rule even
 * while the shipped manifest enables it.
 */
import { describe, expect, it } from 'vitest';
import { loadSaveFile } from '../../src/persistence/saveFile';
import { worldHasModule, worldHasSpecies, worldHasSystem } from '../../src/sim/gates';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { readG2SaveText } from '../helpers/g2-saves';
import { G2_LISTS, registryWith, withEnabled } from '../helpers/registry';

/**
 * A later build's manifest: the g2 lists plus Phase 3's B05, the film system and module E04. Built
 * with the unvalidated withEnabled, never by validating the g2 lists at build phase 3, which would
 * break as soon as a Phase 3 recipe, card or variant ships (preflight fix round 1). E04 is not
 * implemented yet: nothing here steps a world.
 */
const LATER = withEnabled(registryWith(G2_LISTS), { species: ['B05'], systems: ['film'], modules: ['E04'] });

describe('world gates read the world’s recorded manifest (P-25)', () => {
  it('a world realized under a manifest answers exactly what that manifest enables', () => {
    const w = realizeRecipe(LATER, 'FIRST_DISH_V1', { worldId: 'gates-later' });
    expect([worldHasSpecies(w, 'B05'), worldHasSystem(w, 'film'), worldHasModule(w, 'E04')]).toEqual([true, true, true]);
    expect([worldHasSpecies(w, 'B01'), worldHasSystem(w, 'core'), worldHasSystem(w, 'enzymes'), worldHasModule(w, 'E05')]).toEqual([true, true, true, true]);
    expect([worldHasSpecies(w, 'B02'), worldHasSystem(w, 'viruses'), worldHasModule(w, 'E12')]).toEqual([false, false, false]);
  });

  it('an old-manifest world answers false for a Phase 3 id even while the build’s manifest enables it', async () => {
    // The build enables B05, film and E04 ...
    expect(LATER.manifest.enabledSpecies).toContain('B05');
    expect(LATER.manifest.enabledSystems).toContain('film');
    expect(LATER.manifest.enabledModules).toContain('E04');
    // ... but a world recorded under the g2 lists keeps its own manifest through save and reload,
    const old = realizeRecipe(registryWith(G2_LISTS), 'FIRST_DISH_V1', { worldId: 'gates-old' });
    const reloaded = deserializeWorld(serializeWorld(old));
    // and so does a real g2 save loaded through the import path.
    const { world: g2save } = await loadSaveFile(readG2SaveText('first-dish-t3000.pixelmeba.gz'));
    for (const w of [old, reloaded, g2save]) {
      expect([worldHasSpecies(w, 'B05'), worldHasSystem(w, 'film'), worldHasModule(w, 'E04')], w.worldId).toEqual([false, false, false]);
      expect([worldHasSpecies(w, 'B01'), worldHasSystem(w, 'enzymes'), worldHasModule(w, 'E03')], w.worldId).toEqual([true, true, true]);
    }
  });

  it('pure: only world.content.manifest is read (not the allocated fields, the species table or the build)', () => {
    const old = realizeRecipe(registryWith(G2_LISTS), 'FIRST_DISH_V1', { worldId: 'gates-pure' });
    const manifest = { ...old.content.manifest, enabledSystems: [...old.content.manifest.enabledSystems, 'film' as const], enabledSpecies: ['B02'], enabledModules: [] };
    const recorded = { content: { ...old.content, manifest } };
    expect(old.fields.film).toBeUndefined();
    expect([worldHasSystem(recorded, 'film'), worldHasSpecies(recorded, 'B02'), worldHasSpecies(recorded, 'B01'), worldHasModule(recorded, 'E01')]).toEqual([true, true, false, false]);
  });
});
