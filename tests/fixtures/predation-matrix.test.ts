/**
 * P3.4 predation matrix (BUILD_DIRECTIVE P3.4 "predation matrix fixture for P02–P04"; SPEC §7.3;
 * CT §3.2; src/sim/movement.ts preyAllowed, src/sim/contacts.ts stageContacts).
 *
 * Every predator enabled after wave 2 (P01–P04) × every species of that content set except V01 (a
 * viral field, never an entity): a hand-built contact (prey centre 0.3 cells away, predator hungry
 * at E 50 with an empty meal, cooldown 0) captures exactly when CT §3.2 allows, in open water and in
 * sediment, with and without the prey's attached flag. The expected table below is CT §3.2 as
 * written, not the content records, so a record that drifts from the table fails here.
 *
 * Registry: the shipped manifest plus B02, F01 and X01 (and the film, fungi and parasites systems),
 * with allowUnimplemented for BIOFILM, BRANCHING and HOST_DRAIN, which the film-fungi and
 * parasites-phage builders of this wave implement.
 */
import { describe, expect, it } from 'vitest';
import type { ContentRegistry, RawPacks } from '../../src/sim/content/registry';
import { validateContent, ContentError } from '../../src/sim/content/registry';
import type { SystemFlag } from '../../src/sim/fields';
import { stageContacts } from '../../src/sim/contacts';
import { FLAG } from '../../src/sim/entities';
import { maskCells, SUB_SEDIMENT, SUB_WATER } from '../../src/sim/grid';
import { realizeRecipe } from '../../src/sim/recipes';
import { rebuildIndex } from '../../src/sim/spatial';
import { updateDerived } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { contentHashOf, patchedRawPacks, registryWith, type ManifestPatch } from '../helpers/registry';
import { place, registry } from '../helpers/world';

type Req = 'any' | 'free' | 'inSediment';

const range = (prefix: string, a: number, b: number): string[] =>
  Array.from({ length: b - a + 1 }, (_, k) => `${prefix}${String(a + k).padStart(2, '0')}`);
const all = (ids: readonly string[], req: Req): Record<string, Req> => Object.fromEntries(ids.map((id) => [id, req]));

/** CT §3.2 prey lists, transcribed ("free" excludes attached; "while in sediment"). */
const CT_3_2: Readonly<Record<string, Readonly<Record<string, Req>>>> = {
  P01: all([...range('B', 1, 13), 'Y01', 'Y02', ...range('A', 1, 4)], 'any'),
  P02: { ...all(['B01', 'B03', 'B04', 'B05', 'A01', 'A03', 'A04'], 'any'), ...all(range('B', 6, 12), 'free') },
  P03: all([...range('A', 1, 4), 'Y01', 'Y02'], 'any'),
  P04: { ...all(range('B', 1, 5), 'any'), ...all(range('B', 6, 13), 'inSediment') },
};
const PREDATORS = ['P01', 'P02', 'P03', 'P04'] as const;

function sortedUnion<T extends string>(a: readonly T[], b: readonly T[]): T[] {
  return [...new Set([...a, ...b])].sort();
}

function wavePatch(): ManifestPatch {
  const m = registry().manifest;
  return {
    enabledSpecies: sortedUnion(m.enabledSpecies, ['B02', 'F01', 'X01']),
    enabledSystems: sortedUnion<SystemFlag>(m.enabledSystems, ['film', 'fungi', 'parasites']),
  };
}

function waveRegistry(): ContentRegistry {
  return registryWith(wavePatch(), { allowUnimplemented: true });
}

/** The wave registry with one prey requirement of one predator record replaced. */
function flippedRegistry(pred: string, prey: string, requires: Req): ContentRegistry {
  const raw: RawPacks = patchedRawPacks(wavePatch());
  const file = raw.species.find((f) => (f.data as { id: string }).id === pred)!;
  const data = file.data as { prey: { id: string; requires: Req }[] };
  data.prey = data.prey.map((p) => (p.id === prey ? { ...p, requires } : p));
  (raw.manifest.data as Record<string, unknown>).contentHash = contentHashOf(raw);
  const res = validateContent(raw, { allowUnimplemented: true });
  if (!res.registry) throw new ContentError(res.issues);
  return res.registry;
}

function dish(reg: ContentRegistry, ground: number): World {
  const base = reg.recipes.FIRST_DISH_V1!;
  const w = realizeRecipe(
    reg,
    { ...base, id: 'TEST_MATRIX', removeStones: true, fieldPatches: [], founders: [], scheduledCommands: [], backgroundOverrides: { sugar: 0 }, mutationPreset: 'fixed' },
    { worldId: 'matrix' },
  );
  for (const c of maskCells()) w.grid.substrate[c] = ground;
  w.grid.geometryVersion++;
  updateDerived(w);
  return w;
}

interface Outcome {
  readonly pred: string;
  readonly prey: string;
  readonly ground: 'water' | 'sediment';
  readonly attachedFlag: boolean;
  readonly captured: boolean;
}

/** One stage 5 pass per predator and ground: every prey species twice (attached flag off/on), 3 cells apart. */
function matrix(reg: ContentRegistry): Outcome[] {
  const out: Outcome[] = [];
  for (const pred of PREDATORS) {
    for (const [ground, code] of [['water', SUB_WATER], ['sediment', SUB_SEDIMENT]] as const) {
      const w = dish(reg, code);
      const preyIds = w.species.filter((s) => s.def.category !== 'virus').map((s) => s.id);
      const pairs: { prey: string; attachedFlag: boolean; slot: number }[] = [];
      let k = 0;
      for (const prey of preyIds) {
        for (const attachedFlag of [false, true]) {
          const x = 34 + (k % 20) * 3;
          const y = 40 + Math.floor(k / 20) * 3;
          k++;
          const p = place(w, pred, x + 0.5, y + 0.5, { E: 50 });
          w.ents.cols.attackCooldown[p] = 0;
          w.ents.cols.mealC[p] = 0;
          const s = place(w, prey, x + 0.8, y + 0.5); // centres 0.3 cells apart
          if (attachedFlag) w.ents.cols.flags[s] = w.ents.cols.flags[s]! | FLAG.attached;
          pairs.push({ prey, attachedFlag, slot: s });
        }
      }
      rebuildIndex(w);
      stageContacts(w);
      for (const p of pairs) out.push({ pred, prey: p.prey, ground, attachedFlag: p.attachedFlag, captured: !w.ents.isAlive(p.slot) });
    }
  }
  return out;
}

function expected(reg: ContentRegistry, o: Omit<Outcome, 'captured'>): boolean {
  const req = CT_3_2[o.pred]![o.prey];
  if (req === undefined) return false;
  if (req === 'any') return true;
  if (req === 'free') return !o.attachedFlag && reg.species[o.prey]!.attachment === null;
  return o.ground === 'sediment';
}

function mismatches(reg: ContentRegistry, outcomes: readonly Outcome[]): string[] {
  return outcomes
    .filter((o) => o.captured !== expected(reg, o))
    .map((o) => `${o.pred}×${o.prey} ${o.ground}${o.attachedFlag ? ' attached' : ''}: captured ${o.captured}`);
}

describe('Predation matrix P01–P04 (P3.4; CT §3.2)', () => {
  const reg = waveRegistry();
  const outcomes = matrix(reg);

  it('covers every predator × every non-viral species of the wave content set, in water and sediment', () => {
    const species = Object.keys(reg.species).filter((id) => reg.manifest.enabledSpecies.includes(id) && reg.species[id]!.category !== 'virus');
    for (const id of ['B02', 'B03', 'B05', 'F01', 'X01', 'Y01', 'P02', 'P03', 'P04']) expect(species).toContain(id);
    expect(outcomes.length).toBe(PREDATORS.length * species.length * 2 * 2);
    expect(outcomes.some((o) => o.captured)).toBe(true);
  });

  it('captures exactly when CT §3.2 allows', () => {
    expect(mismatches(reg, outcomes)).toEqual([]);
  });

  it('the named cases: P02 never takes Velvet, takes free Crumbsmith; Siltworm takes Crumbsmith only in sediment; Rotifer never takes Sprinter', () => {
    const find = (pred: string, prey: string, ground: 'water' | 'sediment', attachedFlag = false) =>
      outcomes.find((o) => o.pred === pred && o.prey === prey && o.ground === ground && o.attachedFlag === attachedFlag)!.captured;
    expect(reg.species.B02!.attachment).not.toBeNull();
    for (const g of ['water', 'sediment'] as const) {
      expect(find('P02', 'B02', g)).toBe(false);
      expect(find('P02', 'B02', g, true)).toBe(false);
      expect(find('P03', 'B01', g)).toBe(false);
    }
    expect(find('P02', 'B06', 'water')).toBe(true);
    expect(find('P02', 'B06', 'water', true)).toBe(false); // attached at the moment: not free
    expect(find('P04', 'B06', 'water')).toBe(false);
    expect(find('P04', 'B06', 'sediment')).toBe(true);
    expect(find('P04', 'B05', 'water')).toBe(true);
    expect(find('P03', 'Y01', 'water')).toBe(true);
    expect(find('P01', 'B02', 'water')).toBe(true);
    expect(find('P04', 'B02', 'sediment')).toBe(true);
    for (const pred of PREDATORS) for (const prey of ['F01', 'X01', ...PREDATORS]) expect(find(pred, prey, 'water'), `${pred}×${prey}`).toBe(false);
  });

  it('two runs give equal outcomes', () => {
    expect(matrix(reg)).toEqual(outcomes);
  });

  it('flipping one requirement in a patched record makes the matrix disagree with CT §3.2', () => {
    const flipped = flippedRegistry('P02', 'B06', 'any');
    const bad = mismatches(flipped, matrix(flipped));
    expect(bad).toEqual(['P02×B06 water attached: captured true', 'P02×B06 sediment attached: captured true']);
    const flipped2 = flippedRegistry('P04', 'B06', 'any');
    expect(mismatches(flipped2, matrix(flipped2))).toEqual([
      'P04×B06 water: captured true',
      'P04×B06 water attached: captured true',
    ]);
  });
});
