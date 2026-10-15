/**
 * Phase 5 E2-SHELLS determinism (D-0103, D-0117): silicate binding and grit dissolution are identical
 * at 1× and 4× and across save/reload, and a world that records the silicate system but holds no
 * shell builder and no grit plays exactly as the same dish without it.
 *
 * NOTHING is enabled (D-0104): REG enables A02, P05, M02, M12 and 'silicate' for tests only
 * (allowUnimplemented: SHELL is appended to the implemented list by the lead at integration).
 * The NEUTRAL dishes are built from the pre-organism-flip lists (tests/helpers/world.ts preOrganismFlipRegistry,
 * D-0127): one with only the silicate system and its two materials added (no new species), so species indices
 * match and entity columns compare byte for byte, and one with A02 and P05 too.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { applyNow } from '../../src/sim/commands';
import { ENTITY_COLUMNS } from '../../src/sim/entities';
import { FIELD_IDS, type SystemFlag } from '../../src/sim/fields';
import { cellIndex } from '../../src/sim/grid';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { registryWith } from '../helpers/registry';
import { trajectoryDigest } from '../helpers/trajectory';
import { clearWater, preOrganismFlipRegistry, rebaseLedger, registry } from '../helpers/world';

const SHIPPED = registry().manifest;
const SYSTEMS_SI = [...SHIPPED.enabledSystems, 'silicate'].sort() as SystemFlag[];
const MATERIALS_SI = [...SHIPPED.enabledMaterials, 'M02', 'M12'].sort();
const REG = registryWith(
  { enabledSpecies: [...SHIPPED.enabledSpecies, 'A02', 'P05'].sort(), enabledSystems: SYSTEMS_SI, enabledMaterials: MATERIALS_SI },
  { allowUnimplemented: true },
);
const meta = { name: 'shells determinism', savedAt: '2026-10-14T00:00:00Z', recipeId: null };

/** The conservation dish (tests/fixtures/conservation-mineral.test.ts) with the lid open. */
function mineralDish(): World {
  const w = clearWater({ lid: 'open', backgroundOverrides: { sugar: 0.2 } }, REG);
  const si = w.fields.silicate!;
  const grit = w.fields.grit!;
  for (let y = 54; y < 74; y++) {
    for (let x = 44; x < 60; x++) si[cellIndex(x, y)] = 0.05;
    for (let x = 68; x < 84; x++) grit[cellIndex(x, y)] = 0.3;
  }
  rebaseLedger(w);
  let n = 0;
  const inoc = (speciesId: string, x: number, y: number, count: number) =>
    applyNow(w, `det-${++n}`, { kind: 'inoculate', speciesId, x, y, radius: 4, count });
  inoc('A02', 52.5, 64.5, 12);
  inoc('A02', 76.5, 64.5, 12);
  inoc('B01', 64.5, 58.5, 20);
  inoc('B01', 64.5, 70.5, 20);
  inoc('P05', 60.5, 64.5, 3);
  inoc('P05', 70.5, 64.5, 3);
  inoc('P01', 64.5, 64.5, 2);
  return w;
}

const clone = (w: World): World => deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))) as ReturnType<typeof serializeWorld>);

function shellMineral(w: World): number {
  const c = w.ents.cols;
  let m = 0;
  for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1) m += c.boundMineral[i]!;
  return m;
}

describe('E2-SHELLS determinism', () => {
  it('run(w, 400) equals four run(w, 100) (1× vs 4× batching)', () => {
    const a = mineralDish();
    const b = clone(a);
    expect(stateHash(b)).toBe(stateHash(a));
    const m0 = shellMineral(a);
    run(a, 400);
    for (let k = 0; k < 4; k++) run(b, 100);
    expect(stateHash(b)).toBe(stateHash(a));
    expect(shellMineral(a)).toBeGreaterThan(m0); // binding happened
  });

  it('save at tick 1,234 → load → run to 3,000 equals the uninterrupted run', async () => {
    const a = mineralDish();
    run(a, 1234);
    const { text } = await buildSaveFile(a, meta);
    const b = (await loadSaveFile(text)).world;
    expect(stateHash(b)).toBe(stateHash(a));
    run(a, 3000 - 1234);
    run(b, 3000 - 1234);
    expect(a.tick).toBe(3000);
    expect(stateHash(b)).toBe(stateHash(a));
    expect(trajectoryDigest(b, 'full')).toBe(trajectoryDigest(a, 'full'));
  }, 300_000);

  it('NEUTRAL: the silicate system with no shell builder and no grit leaves columns and fields byte-identical', () => {
    const build = (reg: ContentRegistry) => realizeRecipe(reg, 'FIRST_DISH_V1', { worldId: 'neutral' });
    // Both sides from the pre-organism-flip lists (D-0127): the shipped manifest records the subject itself since the flip.
    const shipped = build(preOrganismFlipRegistry());
    const si = build(preOrganismFlipRegistry({ systems: ['silicate'], materials: ['M02', 'M12'] }));
    expect(shipped.fields.silicate).toBeUndefined();
    expect(si.fields.silicate).toBeDefined();
    run(shipped, 2000);
    run(si, 2000);
    expect(si.ents.highWater).toBe(shipped.ents.highWater);
    expect(shipped.events.totals.birth ?? 0).toBeGreaterThan(0);
    for (const [name] of ENTITY_COLUMNS) {
      const a = shipped.ents.cols[name];
      const b = si.ents.cols[name];
      for (let i = 0; i < shipped.ents.highWater; i++) if (!Object.is(a[i], b[i])) throw new Error(`column ${name}[${i}]: ${a[i]} vs ${b[i]}`);
    }
    for (const id of FIELD_IDS) {
      const a = shipped.fields[id];
      const b = si.fields[id];
      if (id === 'silicate' || id === 'grit') {
        expect(a).toBeUndefined();
        for (let k = 0; k < b!.length; k++) if (b![k] !== 0) throw new Error(`${id}[${k}] = ${b![k]}`);
        continue;
      }
      expect(b === undefined).toBe(a === undefined);
      if (!a) continue;
      for (let k = 0; k < a.length; k++) if (!Object.is(a[k], b![k])) throw new Error(`field ${id}[${k}]: ${a[k]} vs ${b![k]}`);
    }
    // Biology digest (species mapped to ids; all-zero later fields do not count) is the same too.
    expect(trajectoryDigest(si, 'full')).toBe(trajectoryDigest(shipped, 'full'));
  }, 300_000);

  it('NEUTRAL with A02 and P05 enabled but absent: the biology digest equals the shipped dish', () => {
    // Both sides from the pre-organism-flip lists (D-0127): the shipped manifest records the subject itself since the flip.
    const shipped = realizeRecipe(preOrganismFlipRegistry(), 'FIRST_DISH_V1', { worldId: 'neutral' });
    const withShells = realizeRecipe(preOrganismFlipRegistry({ species: ['A02', 'P05'], systems: ['silicate'], materials: ['M02', 'M12'] }), 'FIRST_DISH_V1', { worldId: 'neutral' });
    run(shipped, 1000);
    run(withShells, 1000);
    expect(trajectoryDigest(withShells, 'full')).toBe(trajectoryDigest(shipped, 'full'));
  }, 300_000);
});
