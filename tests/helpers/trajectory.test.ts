/**
 * The trajectory digest and registryWith (Phase 3 preflight; g3-plan-recheck P-17, P-18, P-19): the
 * digest moves exactly when the biology moves. It does not depend on which species a build enables
 * (species-index order) or on content version stamps; it changes when any g2 biology value changes;
 * 'g2' mode refuses post-g2 state and 'full' mode hashes it.
 *
 * Nothing here may fail because a later wave adds content or implements a rule (preflight fix round 1):
 * no test pins today's content hash, a later id is enabled only through the unvalidated withEnabled
 * (never by validating the g2 lists at a later build phase), post-g2 state is planted by hand under
 * names no wave uses, and allowUnimplemented is tested against fixed lists in registry.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { computeContentHash } from '../../src/sim/content/registry';
import { ENTITY_COLUMNS } from '../../src/sim/entities';
import { allocateFields, allocatedFieldIds, FIELD_DEFS, FIELD_IDS } from '../../src/sim/fields';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { speciesIndex, type World } from '../../src/sim/world';
import { loadRegistryFs } from '../../tools/lib/content-fs';
import { G2_LISTS, g2Manifest, manifestPatchOf, patchedRawPacks, registryWith, withEnabled } from './registry';
import { G2_ENTITY_COLUMNS, G2_FIELD_IDS, PostG2StateError, postG2State, trajectoryDigest } from './trajectory';

const G2 = registryWith(G2_LISTS);
/** Three more species enabled: A02 sorts between A01 and B01, B05 between B04 and B06, Y01 last. */
const MORE_SPECIES = withEnabled(G2, { species: ['A02', 'B05', 'Y01'] });

function garden(reg = G2, ticks = 0, worldId = 'digest'): World {
  const w = realizeRecipe(reg, 'FIRST_DISH_V1', { worldId });
  run(w, ticks);
  return w;
}

function firstAlive(w: World): number {
  for (let i = 0; i < w.ents.highWater; i++) if (w.ents.cols.alive[i] === 1) return i;
  throw new Error('no organism');
}

describe('registryWith (P-19, G13)', () => {
  it('G2_LISTS is every patchable field of tests/fixtures/saves/g2-manifest.json: contentVersion 1, buildPhase 2', () => {
    expect(G2_LISTS).toEqual(manifestPatchOf(g2Manifest()));
    expect([G2_LISTS.contentVersion, G2_LISTS.buildPhase]).toEqual([1, 2]);
    expect(G2_LISTS.enabledSpecies).toEqual(['A01', 'B01', 'B04', 'B06', 'P01']);
    expect(G2_LISTS.enabledModules).toEqual(['E01', 'E03', 'E05']);
    expect(G2_LISTS.enabledSystems).toEqual(['core', 'enzymes']);
  });

  it('patches the manifest of a deep copy, writes the patched content hash and re-validates', async () => {
    const shipped = loadRegistryFs();
    expect(G2.manifest.contentVersion).toBe(1);
    expect(G2.manifest.buildPhase).toBe(2);
    expect(G2.manifest.simulationVersion).toBe(3);
    // The hash written is the one `content:validate -- --write` would write for the patched packs
    // (the validator's own computeContentHash), whatever the packs hold today.
    expect(G2.manifest.contentHash).toBe(await computeContentHash(patchedRawPacks(G2_LISTS)));
    expect(registryWith(G2_LISTS)).toBe(G2); // cached per patch
    const bumped = registryWith({ ...G2_LISTS, contentVersion: 9 });
    expect(bumped.manifest.contentVersion).toBe(9);
    expect(bumped.manifest.contentHash).not.toBe(G2.manifest.contentHash);
    expect(loadRegistryFs()).toBe(shipped); // the cached shipped registry is untouched
    expect(() => registryWith({ simulationVersion: 4 } as never)).toThrow(/not a patchable manifest field/);
    // Validation still applies: a phase 3 species at build phase 2, an unsorted list.
    expect(() => registryWith({ ...G2_LISTS, enabledSpecies: ['A01', 'B01', 'B04', 'B05', 'B06', 'P01'] })).toThrow(/"B05" belongs to phase 3 \(build phase 2\)/);
    expect(() => registryWith({ ...G2_LISTS, enabledModules: ['E05', 'E01'] })).toThrow(/must be sorted ascending/);
  });

  it('withEnabled adds ids to a copy of the manifest and nothing else; unknown ids throw', () => {
    expect(MORE_SPECIES.manifest.enabledSpecies).toEqual(['A01', 'A02', 'B01', 'B04', 'B05', 'B06', 'P01', 'Y01']);
    expect({ ...MORE_SPECIES.manifest, enabledSpecies: G2.manifest.enabledSpecies }).toEqual(G2.manifest);
    expect(MORE_SPECIES.species).toBe(G2.species);
    expect(G2.manifest.enabledSpecies).toEqual(G2_LISTS.enabledSpecies); // the base is untouched
    const later = withEnabled(G2, { modules: ['E04'], systems: ['film'] });
    expect([later.manifest.enabledModules, later.manifest.enabledSystems]).toEqual([
      ['E01', 'E03', 'E04', 'E05'],
      ['core', 'enzymes', 'film'],
    ]);
    expect(() => withEnabled(G2, { species: ['Q01'] })).toThrow(/unknown species "Q01"/);
    expect(() => withEnabled(G2, { modules: ['E99'] })).toThrow(/unknown module "E99"/);
  });
  // allowUnimplemented: tests/helpers/registry.test.ts (fixed implemented lists).
});

describe('trajectoryDigest (P-17, P-18)', () => {
  it('freezes the g2 schema: 67 entity columns, a prefix of ENTITY_COLUMNS; 24 core + enzymes fields', () => {
    expect(G2_ENTITY_COLUMNS).toHaveLength(67);
    expect(ENTITY_COLUMNS.slice(0, 67).map(([n]) => n)).toEqual(G2_ENTITY_COLUMNS);
    expect(G2_FIELD_IDS).toHaveLength(24);
    const g2Alloc = allocatedFieldIds(allocateFields(['core', 'enzymes']));
    for (const id of G2_FIELD_IDS) {
      expect(g2Alloc).toContain(id);
      expect(['core', 'enzymes']).toContain(FIELD_DEFS[id].system);
    }
  });

  it('two independent realizations agree; with no post-g2 state, full equals g2', () => {
    const a = garden(G2, 300, 'a');
    const b = garden(G2, 300, 'b');
    expect(postG2State(a)).toEqual([]);
    expect(trajectoryDigest(a, 'g2')).toMatch(/^[0-9a-f]{16}$/);
    expect(trajectoryDigest(b, 'g2')).toBe(trajectoryDigest(a, 'g2'));
    expect(trajectoryDigest(a, 'full')).toBe(trajectoryDigest(a, 'g2'));
    expect(trajectoryDigest(a, 'g2')).not.toBe(trajectoryDigest(garden(G2, 299), 'g2'));
  });

  it('does not depend on species-index order: a registry enabling more species gives the same digest for the same biology', () => {
    const a = garden(G2, 600);
    const b = garden(MORE_SPECIES, 600);
    // The species indices differ (A02 shifts B01, B04 and B06; B05 shifts B06 and P01) ...
    expect(['A01', 'B01', 'B04', 'B06', 'P01'].map((id) => speciesIndex(a, id))).toEqual([0, 1, 2, 3, 4]);
    expect(['A01', 'B01', 'B04', 'B06', 'P01'].map((id) => speciesIndex(b, id))).toEqual([0, 2, 3, 5, 6]);
    expect(stateHash(b)).not.toBe(stateHash(a));
    // ... and births happened in that time, so genomes, lineage and division state are covered.
    expect(a.lineage.parent.filter((p) => p !== 0).length).toBeGreaterThan(0);
    expect(trajectoryDigest(b, 'g2')).toBe(trajectoryDigest(a, 'g2'));
    expect(trajectoryDigest(b, 'full')).toBe(trajectoryDigest(a, 'full'));
  });

  it('ignores what is not biology: content hash and version stamps, the world id', () => {
    const a = garden(G2, 200, 'stamp-a');
    const b = garden(registryWith({ ...G2_LISTS, contentVersion: 7, evolutionRulesVersion: 4 }), 200, 'stamp-b');
    expect(b.content.manifest.contentHash).not.toBe(a.content.manifest.contentHash);
    expect(stateHash(b)).not.toBe(stateHash(a));
    expect(trajectoryDigest(b, 'g2')).toBe(trajectoryDigest(a, 'g2'));
  });

  it('changes when any g2 biology value changes: one organism’s energy by 1e-9, one field cell, one lineage record', () => {
    const w = garden(G2, 300);
    const before = trajectoryDigest(w, 'g2');
    const i = firstAlive(w);
    const E = w.ents.cols.E[i]!;
    w.ents.cols.E[i] = E + 1e-9;
    expect(trajectoryDigest(w, 'g2')).not.toBe(before);
    expect(trajectoryDigest(w, 'full')).not.toBe(before);
    w.ents.cols.E[i] = E;
    expect(trajectoryDigest(w, 'g2')).toBe(before);
    const s = w.fields.sugar!;
    const cell = s.findIndex((v) => v > 0);
    const sugar = s[cell]!;
    s[cell] = sugar + 1e-12;
    expect(trajectoryDigest(w, 'g2')).not.toBe(before);
    s[cell] = sugar;
    expect(trajectoryDigest(w, 'g2')).toBe(before);
    w.lineage.deathCause[0] = w.lineage.deathCause[0]! + 1;
    expect(trajectoryDigest(w, 'g2')).not.toBe(before);
  });

  it("'g2' throws on a non-zero post-g2 field; an all-zero one changes nothing; 'full' hashes it by id", () => {
    const w = garden(G2, 300);
    const g2Digest = trajectoryDigest(w, 'g2');
    // A field of a later system, allocated the way a world enabling that system allocates it (zero).
    const later = FIELD_IDS.find((id) => !G2_FIELD_IDS.includes(id))!;
    const field = allocateFields([FIELD_DEFS[later].system])[later]!;
    w.fields[later] = field;
    expect(postG2State(w)).toEqual([]);
    // Allocated but zero: the same biology, the same digest in both modes.
    expect(trajectoryDigest(w, 'g2')).toBe(g2Digest);
    expect(trajectoryDigest(w, 'full')).toBe(g2Digest);
    field[8256] = 0.25;
    expect(postG2State(w)).toEqual([`field ${later} (non-zero at cell 8256)`]);
    expect(() => trajectoryDigest(w, 'g2')).toThrow(PostG2StateError);
    expect(() => trajectoryDigest(w, 'g2')).toThrow(`post-g2 state: field ${later}`);
    const full = trajectoryDigest(w, 'full');
    expect(full).not.toBe(g2Digest);
    field[8256] = 0.5;
    expect(trajectoryDigest(w, 'full')).not.toBe(full);
  });

  it("'g2' throws on a post-g2 store, counter or settings key holding a value; 'full' hashes each", () => {
    const w = garden(G2, 50);
    const base = trajectoryDigest(w, 'full');
    // Names no wave will add, so a real later store, counter or settings key never meets these values.
    const cases: [string, () => void, () => void][] = [
      ['world store zzTestStore', () => Object.assign(w, { zzTestStore: [{ cell: 8256, c: 1 }] }), () => delete (w as unknown as Record<string, unknown>).zzTestStore],
      ['counter zzTestCounter = 3', () => Object.assign(w.counters, { zzTestCounter: 3 }), () => delete (w.counters as unknown as Record<string, unknown>).zzTestCounter],
      ['settings key zzTestSetting = 0.5', () => Object.assign(w.settings, { zzTestSetting: 0.5 }), () => delete (w.settings as unknown as Record<string, unknown>).zzTestSetting],
    ];
    for (const [label, set, unset] of cases) {
      set();
      expect(postG2State(w)).toEqual([label]);
      expect(() => trajectoryDigest(w, 'g2'), label).toThrow(PostG2StateError);
      expect(trajectoryDigest(w, 'full'), label).not.toBe(base);
      unset();
      expect(trajectoryDigest(w, 'full'), label).toBe(base);
    }
  });
});
