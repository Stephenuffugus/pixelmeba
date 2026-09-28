/**
 * P2.6 What if? (R1), simulation and content half (SPEC §13.3; CT §9.4; D09 §4–5; UX §3.4).
 *
 * Proves: each registered variant realizes the source recipe with exactly its declared change (the
 * complete saved state is compared cell by cell and record by record against the source's own
 * realization); realized hashes are stable and recorded with source/variant checksums in provenance
 * that survives save and export; R-G3 keeps its cell count and exposes old/new outlines; Again
 * reproduces the start; Another idea follows catalog order, wraps, and reads no world or random
 * stream; realization is pure; and invalid variants are refused by content validation and at
 * creation with precise, readable messages.
 */
import { describe, expect, it } from 'vitest';
import { buildRegistry, validateContent, type ContentRegistry, type RawPacks } from '../../src/sim/content/registry';
import type { RecipeDef, VariantDef } from '../../src/sim/content/schema';
import { diskCells, inMask, cellX, cellY } from '../../src/sim/grid';
import { canonicalJson } from '../../src/sim/hash';
import { habitatGrid, realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import {
  nextVariantId,
  realizeAgain,
  realizeVariant,
  variantCatalog,
  variantPatchOutlines,
  variantPreview,
  variantRecordOf,
  variantsForSource,
  whatIfChoices,
  VariantError,
  type VariantRecord,
} from '../../src/sim/variants';
import type { World } from '../../src/sim/world';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { loadRawPacksFs } from '../../tools/lib/content-fs';
import { addRaw, cellOf, diffWorlds, mutateRaw, type Difference } from './helpers';

const RAW = loadRawPacksFs();
const REG = buildRegistry(RAW);
const SOURCE = 'FIRST_DISH_V1';
const IDS = ['R-G0', 'R-G1', 'R-G2', 'R-G3'] as const;
/** Same world id on both sides so the comparison isolates content, not identity. */
const CMP = 'compare';

/** The source's sugar patch, derived from geometry alone (an independent check on the outlines). */
function disk(cx: number, cy: number, r: number): number[] {
  return diskCells(cx, cy, r).filter((i) => inMask(cellX(i), cellY(i)));
}
const OLD_PATCH = disk(48, 64, 6);
const NEW_PATCH = disk(48, 82, 6);

function source(): World {
  return realizeRecipe(REG, SOURCE, { worldId: CMP });
}

const isProvenance = (d: Difference) => d.path.startsWith('content.provenance.');
const record = (w: World): VariantRecord => variantRecordOf(w)!;
const errorsOf = (raw: RawPacks) => validateContent(raw).issues.filter((i) => i.severity === 'error');

/** A registry with extra or replaced records, bypassing validation (for creation-time refusals). */
function withContent(patch: { variants?: Record<string, VariantDef>; recipes?: Record<string, RecipeDef> }): ContentRegistry {
  const variants = { ...REG.variants, ...patch.variants };
  const recipes = { ...REG.recipes, ...patch.recipes };
  return { ...REG, variants, variantIds: Object.keys(variants).sort(), recipes, recipeIds: Object.keys(recipes).sort() };
}

async function refusal(p: Promise<unknown>): Promise<VariantError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(VariantError);
    return e as VariantError;
  }
  throw new Error('expected a VariantError');
}

describe('What if? catalog (CT §9.4; UX §3.4)', () => {
  it('registers R-G0…R-G3 for FIRST_DISH_V1 rev 1 in table order, with the CT titles and questions', () => {
    expect(variantsForSource(REG, SOURCE).map((v) => v.id)).toEqual([...IDS]);
    expect(variantCatalog(REG).map((v) => v.id)).toEqual([...IDS]);
    const rows = IDS.map((id) => REG.variants[id]!).map((v) => [v.id, v.revision, v.sourceId, v.sourceRevision, v.title, v.question, v.patch.kind]);
    expect(rows).toEqual([
      ['R-G0', 1, SOURCE, 1, 'Garden', 'Who finds something to eat?', 'none'],
      ['R-G1', 1, SOURCE, 1, 'A smaller meal', 'What changes with less food?', 'patchSet'],
      ['R-G2', 1, SOURCE, 1, 'A bigger meal', 'Does more food help every family?', 'patchSet'],
      ['R-G3', 1, SOURCE, 1, 'Dinner farther away', 'Who reaches the food now?', 'patchMove'],
    ]);
    // The sheet under Garden offers the three changed choices (≤ 3 per source).
    expect(whatIfChoices(REG, SOURCE).map((v) => v.id)).toEqual(['R-G1', 'R-G2', 'R-G3']);
    expect(REG.recipes[SOURCE]!.fieldPatches[0]).toMatchObject({ center: [48, 64], radius: 6, add: { sugar: 0.4 } });
  });

  it('previews carry what the sheet shows, without building a world', () => {
    const m = REG.manifest;
    const p = IDS.map((id) => variantPreview(REG, id));
    for (const v of p) {
      expect(v).toMatchObject({ sourceId: SOURCE, sourceRevision: 1, sourceName: 'Little Living Garden', seed: 104729, mutationPreset: 'standard', founderMode: 'identical' });
      expect(v.versions).toEqual({
        simulationVersion: m.simulationVersion,
        evolutionRulesVersion: m.evolutionRulesVersion,
        moduleRegistryVersion: m.moduleRegistryVersion,
        phenotypeMappingVersion: m.phenotypeMappingVersion,
        contentVersion: m.contentVersion,
        contentHash: m.contentHash,
      });
      expect(v.previewDifference.length).toBeGreaterThan(0);
    }
    expect(p.map((v) => v.identity)).toEqual(['R-G0 / rev 1 / seed 104729', 'R-G1 / rev 1 / seed 104729', 'R-G2 / rev 1 / seed 104729', 'R-G3 / rev 1 / seed 104729']);
    expect(p[0]!.change).toEqual({ kind: 'unchanged' });
    expect(p[1]!.change).toMatchObject({ kind: 'amount', direction: 'less', field: 'sugar', before: 0.4, after: 0.2, center: [48, 64], radius: 6, patchLabel: 'Sugar patch' });
    expect(p[2]!.change).toMatchObject({ kind: 'amount', direction: 'more', field: 'sugar', before: 0.4, after: 0.8 });
    expect(p[1]!.change.kind === 'amount' && p[1]!.change.cells).toEqual(OLD_PATCH);
    expect(p[3]!.change).toMatchObject({ kind: 'moved', from: [48, 64], to: [48, 82], radius: 6, amounts: { sugar: 0.4 } });
  });
});

describe('variants change only their declared data (D09 §12 "Technical integrity")', () => {
  it('R-G0 Garden is the source recipe exactly: only provenance differs, and the state hash is equal', async () => {
    const a = source();
    const b = await realizeVariant(REG, 'R-G0', { worldId: CMP });
    expect(diffWorlds(a, b).map((d) => d.path)).toEqual(['content.provenance.createdFrom', 'content.provenance.variant']);
    expect(stateHash(b)).toBe(stateHash(a));
  });

  it.each([
    ['R-G1', 0.2],
    ['R-G2', 0.8],
  ] as const)('%s changes only the sugar in the 113 sugar-patch cells (0.40 → %s) and its logged input', async (id, value) => {
    const a = source();
    const b = await realizeVariant(REG, id, { worldId: CMP });
    const diffs = diffWorlds(a, b).filter((d) => !isProvenance(d));
    const sugar = diffs.filter((d) => d.path.startsWith('fields.sugar['));
    expect(sugar.map((d) => cellOf(d.path))).toEqual(OLD_PATCH);
    expect(OLD_PATCH).toHaveLength(113);
    for (const d of sugar) expect([d.a, d.b]).toEqual([0.4, value]);
    // The only other difference is the declared initial input of that patch (no free biomass).
    const rest = diffs.filter((d) => !d.path.startsWith('fields.sugar['));
    expect(rest.map((d) => d.path)).toEqual(['ledger.entries.0.c', 'ledger.inputs.c']);
    expect(a.ledger.entries[0]!.source).toBe('recipe:patch0:Sugar patch');
    expect((rest[0]!.b as number) - (rest[0]!.a as number)).toBeCloseTo((value - 0.4) * 113, 9);
    expect((rest[1]!.b as number) - (rest[1]!.a as number)).toBeCloseTo((value - 0.4) * 113, 9);
    expect(stateHash(b)).not.toBe(stateHash(a));
  });

  it('R-G3 moves the sugar patch to (48,82): old cells clear to background, new cells get 0.40, same count and mass', async () => {
    const a = source();
    const b = await realizeVariant(REG, 'R-G3', { worldId: CMP });
    const diffs = diffWorlds(a, b).filter((d) => !isProvenance(d));
    expect(diffs.every((d) => d.path.startsWith('fields.sugar['))).toBe(true);
    const cleared = diffs.filter((d) => d.a === 0.4 && d.b === 0).map((d) => cellOf(d.path));
    const filled = diffs.filter((d) => d.a === 0 && d.b === 0.4).map((d) => cellOf(d.path));
    expect(cleared).toEqual(OLD_PATCH);
    expect(filled).toEqual(NEW_PATCH);
    expect(cleared.length + filled.length).toBe(diffs.length);
    // Background sugar is the recipe's override (0), and the ledger is identical: the mass moved, unchanged.
    expect(REG.recipes[SOURCE]!.backgroundOverrides.sugar).toBe(0);
    expect(b.ledger).toEqual(a.ledger);
    const sum = (w: World) => w.fields.sugar!.reduce((s, v) => s + v, 0);
    expect(sum(b)).toBeCloseTo(sum(a), 12);
  });

  it('R-G3 outlines: the old and new cell lists are equal in size, disjoint, open water, and match what realization fills', async () => {
    const o = variantPatchOutlines(REG, 'R-G3');
    expect(o.oldCells).toEqual(OLD_PATCH);
    expect(o.newCells).toEqual(NEW_PATCH);
    expect(o.newCells).toHaveLength(o.oldCells.length);
    expect(o.oldCells.filter((i) => o.newCells.includes(i))).toEqual([]);
    const w = await realizeVariant(REG, 'R-G3');
    for (const i of o.newCells) {
      expect(w.grid.structure[i]).toBe(0);
      expect(w.grid.substrate[i]).toBe(0);
      expect(w.fields.sugar![i]).toBe(0.4);
    }
    for (const i of o.oldCells) expect(w.fields.sugar![i]).toBe(0);
    // Amount variants outline the same cells before and after; Garden changes no patch.
    expect(variantPatchOutlines(REG, 'R-G1')).toEqual({ oldCells: OLD_PATCH, newCells: OLD_PATCH });
    expect(variantPatchOutlines(REG, 'R-G0')).toEqual({ oldCells: [], newCells: [] });
  });
});

describe('patch geometry is the geometry realization uses', () => {
  it('habitatGrid() paints exactly the substrate and structure of a realized dish (with and without stones)', () => {
    const habitat = REG.habitats[REG.recipes[SOURCE]!.habitatId]!;
    for (const removeStones of [false, true]) {
      const w = realizeRecipe(REG, SOURCE, { transform: (r) => ({ ...r, removeStones }) });
      const g = habitatGrid(habitat, { removeStones });
      expect(Buffer.from(g.substrate).equals(Buffer.from(w.grid.substrate))).toBe(true);
      expect(Buffer.from(g.structure).equals(Buffer.from(w.grid.structure))).toBe(true);
    }
  });
});

describe('identity, stability and Again', () => {
  it('records source/variant checksums, seed, versions and the realized initial-state hash in provenance', async () => {
    const recs = await Promise.all(IDS.map(async (id) => record(await realizeVariant(REG, id))));
    const m = REG.manifest;
    for (const [k, r] of recs.entries()) {
      expect(r).toMatchObject({ variantId: IDS[k], variantRevision: 1, sourceId: SOURCE, sourceRevision: 1, seed: 104729 });
      expect(r).toMatchObject({ simulationVersion: m.simulationVersion, evolutionRulesVersion: m.evolutionRulesVersion, contentVersion: m.contentVersion, contentHash: m.contentHash });
      expect(r.sourceChecksum).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(r.variantChecksum).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(r.initialStateHash).toMatch(/^[0-9a-f]{16}$/);
      expect(r.patch).toEqual(REG.variants[IDS[k]!]!.patch);
    }
    expect(new Set(recs.map((r) => r.sourceChecksum)).size).toBe(1);
    expect(new Set(recs.map((r) => r.variantChecksum)).size).toBe(4);
    expect(new Set(recs.map((r) => r.initialStateHash)).size).toBe(4);
  });

  it('the realized hash is stable: repeated, interleaved with other dishes and after a world has run', async () => {
    const first: Record<string, string> = {};
    for (const id of IDS) {
      const w = await realizeVariant(REG, id);
      expect(stateHash(w)).toBe(record(w).initialStateHash);
      expect(w.tick).toBe(0);
      first[id] = record(w).initialStateHash;
    }
    const busy = await realizeVariant(REG, 'R-G2');
    run(busy, 30);
    for (const id of [...IDS].reverse()) {
      const w = await realizeVariant(REG, id, { worldId: `again-${id}` });
      expect(record(w).initialStateHash).toBe(first[id]);
      expect(stateHash(w)).toBe(first[id]);
    }
  });

  it('provenance survives serialization and the real save/export file path', async () => {
    const w = await realizeVariant(REG, 'R-G3', { worldId: 'saved' });
    const rec = record(w);
    const copy = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))) as ReturnType<typeof serializeWorld>);
    expect(record(copy)).toEqual(rec);
    expect(stateHash(copy)).toBe(rec.initialStateHash);
    const built = await buildSaveFile(w, { name: 'Dinner farther away', savedAt: '2026-09-27T00:00:00Z', recipeId: w.content.provenance.recipeId });
    expect(built.file.state.content.provenance).toMatchObject({ recipeId: SOURCE, recipeRevision: 1, createdFrom: 'variant', variant: rec });
    const loaded = await loadSaveFile(built.text);
    expect(record(loaded.world)).toEqual(rec);
    expect(stateHash(loaded.world)).toBe(rec.initialStateHash);
  });

  it('Again rebuilds the same start (identical hash and state, new world id), even after the first dish ran', async () => {
    for (const id of IDS) {
      const w = await realizeVariant(REG, id, { worldId: 'first' });
      const rec = record(w);
      run(w, 20);
      const again = await realizeAgain(REG, rec, { worldId: 'second' });
      expect(stateHash(again)).toBe(rec.initialStateHash);
      expect(record(again)).toEqual(rec);
      const fresh = await realizeVariant(REG, id, { worldId: 'first' });
      expect(diffWorlds(fresh, again).map((d) => d.path)).toEqual(['worldId']);
    }
  });

  it('Again refuses, with a readable reason, when it could not rebuild the recorded start', async () => {
    const rec = record(await realizeVariant(REG, 'R-G1'));
    const opts = { worldId: 'again' };
    const e1 = await refusal(realizeAgain(REG, { ...rec, variantRevision: 2 }, opts));
    expect(e1.code).toBe('changed');
    expect(e1.message).toMatch(/has been revised .* Your dish is unchanged\./);
    const e2 = await refusal(realizeAgain(REG, { ...rec, sourceChecksum: 'sha256:00' }, opts));
    expect(e2.code).toBe('changed');
    expect(e2.message).toContain('cannot be rebuilt exactly');
    const e3 = await refusal(realizeAgain(REG, { ...rec, initialStateHash: '0000000000000000' }, opts));
    expect(e3.code).toBe('changed');
    expect(e3.message).toContain('would not start');
    const e4 = await refusal(realizeAgain(REG, { ...rec, variantId: 'R-Z9' }, opts));
    expect(e4.code).toBe('unknown-variant');
    // No raw hashes or internal ids in anything the player reads.
    for (const e of [e1, e2, e3, e4]) expect(e.message).not.toMatch(/[0-9a-f]{12}|sha256|R-Z9/);
  });

  it('a content update elsewhere (new contentHash) does not block Again when the recipe and variant are unchanged', async () => {
    const rec = record(await realizeVariant(REG, 'R-G1'));
    const w = await realizeAgain(REG, { ...rec, contentHash: 'f'.repeat(64), initialStateHash: '0000000000000000' }, { worldId: 'after-update' });
    expect(w.worldId).toBe('after-update');
    expect(record(w).variantChecksum).toBe(rec.variantChecksum);
  });

  it('ignores a malformed variant record from a file', async () => {
    const w = await realizeVariant(REG, 'R-G1');
    (w.content.provenance as { variant?: unknown }).variant = { variantId: 42 };
    expect(variantRecordOf(w)).toBeNull();
  });
});

describe('Another idea', () => {
  it('picks the next supported variant of the same source in catalog order, wrapping, never the current one', () => {
    expect(IDS.map((id) => nextVariantId(REG, id))).toEqual(['R-G1', 'R-G2', 'R-G3', 'R-G0']);
    expect(nextVariantId(REG, 'R-Z9')).toBeNull();
    // Unsupported variants (a later phase) are skipped, not shown locked.
    const later = withContent({ variants: { 'R-G2': { ...REG.variants['R-G2']!, phase: 6 } } });
    expect(['R-G0', 'R-G1', 'R-G3'].map((id) => nextVariantId(later, id))).toEqual(['R-G1', 'R-G3', 'R-G0']);
    expect(whatIfChoices(later, SOURCE).map((v) => v.id)).toEqual(['R-G1', 'R-G3']);
    // A source with a single supported variant has no other idea.
    const alone = withContent({ variants: Object.fromEntries(['R-G1', 'R-G2', 'R-G3'].map((id) => [id, { ...REG.variants[id]!, phase: 7 }])) });
    expect(nextVariantId(alone, 'R-G0')).toBeNull();
  });

  it('reads no world and no simulation random stream: choosing ideas never changes a dish or a realization', async () => {
    const w = await realizeVariant(REG, 'R-G1');
    run(w, 10);
    const before = stateHash(w);
    let id = 'R-G1';
    for (let k = 0; k < 40; k++) id = nextVariantId(REG, id)!;
    expect(id).toBe('R-G1');
    expect(stateHash(w)).toBe(before);
    const again = await realizeVariant(REG, 'R-G1');
    expect(stateHash(again)).toBe(record(w).initialStateHash);
  });
});

describe('realization is pure and leaves existing dishes alone', () => {
  it('does not change the registry, the source recipe or a running dish', async () => {
    const snapshot = canonicalJson({ recipes: REG.recipes, variants: REG.variants, manifest: REG.manifest });
    const dish = source();
    run(dish, 25);
    const dishHash = stateHash(dish);
    for (const id of IDS) {
      variantPreview(REG, id);
      variantPatchOutlines(REG, id);
      await realizeVariant(REG, id);
    }
    expect(canonicalJson({ recipes: REG.recipes, variants: REG.variants, manifest: REG.manifest })).toBe(snapshot);
    expect(stateHash(dish)).toBe(dishHash);
    expect(dish.tick).toBe(25);
  });
});

describe('invalid variants are refused by content validation, with the file and field', () => {
  const G1 = 'content/variants/R-G1.json';
  const G3 = 'content/variants/R-G3.json';

  it('the shipped variants validate', () => {
    expect(errorsOf(RAW)).toEqual([]);
  });

  it('bad patch index (reported once)', () => {
    const errs = errorsOf(mutateRaw(RAW, 'variants', 'R-G1.json', (d) => ((d.patch as { patchIndex: number }).patchIndex = 7)));
    expect(errs).toEqual([{ severity: 'error', file: G1, path: 'patch.patchIndex', message: 'source recipe has no field patch 7' }]);
  });

  it('unknown source recipe', () => {
    const errs = errorsOf(mutateRaw(RAW, 'variants', 'R-G1.json', (d) => (d.sourceId = 'NOPE')));
    expect(errs).toEqual([{ severity: 'error', file: G1, path: 'sourceId', message: 'unknown recipe "NOPE"' }]);
  });

  it('wrong source revision', () => {
    const errs = errorsOf(mutateRaw(RAW, 'variants', 'R-G3.json', (d) => (d.sourceRevision = 2)));
    expect(errs).toEqual([{ severity: 'error', file: G3, path: 'sourceRevision', message: 'source FIRST_DISH_V1 is revision 1' }]);
  });

  it('missing capability (only for variants this build ships)', () => {
    const errs = errorsOf(mutateRaw(RAW, 'variants', 'R-G1.json', (d) => (d.requiredCapabilities = ['core', 'enzymes', 'devices'])));
    expect(errs).toEqual([{ severity: 'error', file: G1, path: 'requiredCapabilities.2', message: '"devices" is not enabled in this build' }]);
    const later = mutateRaw(RAW, 'variants', 'R-G1.json', (d) => {
      d.requiredCapabilities = ['devices'];
      d.phase = 6;
    });
    expect(errorsOf(later)).toEqual([]);
  });

  it('an amount change must name a quantity the patch has, and actually change it', () => {
    const noField = errorsOf(mutateRaw(RAW, 'variants', 'R-G1.json', (d) => ((d.patch as { field: string }).field = 'starch')));
    expect(noField).toEqual([{ severity: 'error', file: G1, path: 'patch.field', message: 'source field patch 0 ("Sugar patch") has no "starch" quantity to change' }]);
    const noOp = errorsOf(mutateRaw(RAW, 'variants', 'R-G1.json', (d) => ((d.patch as { value: number }).value = 0.4)));
    expect(noOp).toEqual([
      { severity: 'error', file: G1, path: 'patch.value', message: '0.4 is already the source value, so nothing would change (use kind "none" for the unchanged recipe)' },
    ]);
  });

  it('a moved patch is rejected, never cropped, when its new place is not whole open water', () => {
    // Onto the stone island at (42,45) r 9.
    const stone = errorsOf(mutateRaw(RAW, 'variants', 'R-G3.json', (d) => ((d.patch as { center: number[] }).center = [42, 52])));
    expect(stone).toHaveLength(1);
    expect(stone[0]).toMatchObject({ file: G3, path: 'patch.center' });
    expect(stone[0]!.message).toMatch(/^moving field patch 0 \("Sugar patch"\) to \(42,52\) would crop it: only \d+ of its 113 cells within r 6 are open water inside the dish$/);
    // Across the dish rim.
    const rim = errorsOf(mutateRaw(RAW, 'variants', 'R-G3.json', (d) => ((d.patch as { center: number[] }).center = [3, 64])));
    expect(rim).toHaveLength(1);
    expect(rim[0]!.message).toContain('would crop it');
    // Not moved at all.
    const still = errorsOf(mutateRaw(RAW, 'variants', 'R-G3.json', (d) => ((d.patch as { center: number[] }).center = [48, 64])));
    expect(still).toEqual([
      { severity: 'error', file: G3, path: 'patch.center', message: '(48,64) is where source field patch 0 ("Sugar patch") already is, so nothing would change' },
    ]);
  });

  it('device changes need recipe devices, which do not exist yet', () => {
    const errs = errorsOf(mutateRaw(RAW, 'variants', 'R-G1.json', (d) => (d.patch = { kind: 'deviceState', deviceIndex: 0, enabled: true })));
    expect(errs).toEqual([{ severity: 'error', file: G1, path: 'patch.deviceIndex', message: 'recipes do not declare devices yet, so source recipe FIRST_DISH_V1 has no device 0' }]);
  });

  it('at most three What if? choices per source', () => {
    const fourth = { ...(RAW.variants.find((f) => f.file.endsWith('R-G1.json'))!.data as object), id: 'R-G4', patch: { kind: 'patchSet', patchIndex: 0, field: 'sugar', value: 0.6 } };
    const errs = errorsOf(addRaw(RAW, 'variants', 'content/variants/R-G4.json', fourth));
    expect(errs).toEqual([
      { severity: 'error', file: 'content/variants/R-G4.json', path: 'sourceId', message: 'FIRST_DISH_V1 already has 3 What if? choices (R-G1, R-G2, R-G3)' },
    ]);
  });

  it('a shipped variant cannot start from a later-phase recipe', () => {
    const errs = errorsOf(mutateRaw(RAW, 'recipes', 'FIRST_DISH_V1.json', (d) => (d.phase = 5)));
    expect(errs.filter((e) => e.file.startsWith('content/variants/'))).toHaveLength(4);
    expect(errs).toContainEqual({ severity: 'error', file: G1, path: 'sourceId', message: 'source recipe "FIRST_DISH_V1" belongs to phase 5 (build phase 2)' });
  });
});

describe('creation refuses invalid variants with a readable message (never crops or substitutes)', () => {
  it('unknown variant, unknown source, wrong revision, missing capability, cropped move, failed placement', async () => {
    const e1 = await refusal(realizeVariant(REG, 'R-Q1'));
    expect([e1.code, e1.message]).toEqual(['unknown-variant', 'What if? "R-Q1" is not in this build.']);

    const g1 = REG.variants['R-G1']!;
    const e2 = await refusal(realizeVariant(withContent({ variants: { 'R-G1': { ...g1, sourceId: 'GONE' } } }), 'R-G1'));
    expect([e2.code, e2.message]).toEqual(['unknown-source', 'R-G1 starts from recipe GONE, which this build does not include.']);

    const e3 = await refusal(realizeVariant(withContent({ variants: { 'R-G1': { ...g1, sourceRevision: 3 } } }), 'R-G1'));
    expect([e3.code, e3.message]).toEqual(['source-revision', 'R-G1 was written for FIRST_DISH_V1 revision 3, but this build has revision 1.']);

    const e4 = await refusal(realizeVariant(withContent({ variants: { 'R-G1': { ...g1, requiredCapabilities: ['core', 'viruses'] } } }), 'R-G1'));
    expect([e4.code, e4.message]).toEqual(['unsupported', 'R-G1 needs "viruses", which this build does not enable.']);

    const g3 = REG.variants['R-G3']!;
    const e5 = await refusal(realizeVariant(withContent({ variants: { 'R-G3': { ...g3, patch: { kind: 'patchMove', patchIndex: 0, center: [80, 80] } } } }), 'R-G3'));
    expect(e5.code).toBe('invalid-patch');
    expect(e5.message).toMatch(/^R-G3 cannot be created: moving field patch 0 \("Sugar patch"\) to \(80,80\) would crop it/);

    // A source whose founders no longer fit fails placement rather than dropping organisms.
    const src = REG.recipes[SOURCE]!;
    const crowded = { ...src, founders: src.founders.map((f, i) => (i === 0 ? { ...f, count: 500 } : f)) };
    const e6 = await refusal(realizeVariant(withContent({ recipes: { [SOURCE]: crowded } }), 'R-G1'));
    expect(e6.code).toBe('placement');
    expect(e6.message).toContain('R-G1 could not be created: recipe FIRST_DISH_V1: only');
  });
});
