import { describe, expect, it } from 'vitest';
import { computeContentHash, validateContent, type RawPacks } from '../../src/sim/content/registry';
import { loadRawPacksFs } from '../../tools/lib/content-fs';

function clone(raw: RawPacks): RawPacks {
  return JSON.parse(JSON.stringify(raw)) as RawPacks;
}

function mutate(raw: RawPacks, collection: keyof RawPacks, file: string, fn: (d: Record<string, unknown>) => void): RawPacks {
  const r = clone(raw);
  const target = r[collection];
  const list = Array.isArray(target) ? (target as { file: string; data: unknown }[]) : [target as { file: string; data: unknown }];
  const f = list.find((x) => x.file.endsWith(file));
  if (!f) throw new Error(`no ${file}`);
  fn(f.data as Record<string, unknown>);
  return r;
}

const errorsOf = (raw: RawPacks) => validateContent(raw).issues.filter((i) => i.severity === 'error');

describe('content validation (P0.2)', () => {
  const raw = loadRawPacksFs();

  it('the shipped content validates with no errors', () => {
    const res = validateContent(raw);
    expect(res.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(res.registry).not.toBeNull();
    expect(res.registry!.speciesIds).toHaveLength(38);
    expect(res.registry!.moduleIds).toHaveLength(17);
  });

  it('the manifest content hash matches the packs', async () => {
    const m = raw.manifest.data as { contentHash: string };
    expect(m.contentHash).toBe(await computeContentHash(raw));
  });

  it('names the file and field of a non-finite or negative value', () => {
    const errs = errorsOf(mutate(raw, 'species', 'B01.json', (d) => (d.intakeRate = -0.1)));
    expect(errs).toContainEqual(expect.objectContaining({ file: 'content/species/B01.json', path: 'intakeRate' }));
    const errs2 = errorsOf(mutate(raw, 'species', 'B04.json', (d) => ((d.tolerances as { ph: number[] }).ph = [8, 6])));
    expect(errs2.some((e) => e.file === 'content/species/B04.json' && e.path.startsWith('tolerances.ph'))).toBe(true);
  });

  it('rejects unknown ids in references', () => {
    const errs = errorsOf(
      mutate(raw, 'species', 'P01.json', (d) => {
        (d.prey as { id: string; requires: string }[]).push({ id: 'B99', requires: 'any' });
      }),
    );
    expect(errs).toContainEqual(expect.objectContaining({ file: 'content/species/P01.json', message: 'unknown species "B99"' }));
    const errs2 = errorsOf(mutate(raw, 'recipes', 'FIRST_DISH_V1.json', (d) => (d.habitatId = 'NOPE')));
    expect(errs2).toContainEqual(expect.objectContaining({ file: 'content/recipes/FIRST_DISH_V1.json', path: 'habitatId' }));
  });

  it('rejects duplicate ids and file/id mismatches', () => {
    const r = clone(raw);
    const b01 = r.species.find((f) => f.file.endsWith('B01.json'))!;
    (r.species as { file: string; data: unknown }[]).push({ file: 'content/species/B01copy.json', data: b01.data });
    const errs = errorsOf(r);
    expect(errs.some((e) => e.message.startsWith('duplicate id "B01"'))).toBe(true);
    expect(errs.some((e) => e.file === 'content/species/B01copy.json' && e.message.includes('file name must match id'))).toBe(true);
  });

  it('refuses to enable a species whose native ability is not implemented', () => {
    const errs = errorsOf(
      mutate(raw, 'manifest', 'manifest.json', (d) => {
        d.enabledSpecies = [...(d.enabledSpecies as string[]), 'B02'].sort();
        d.buildPhase = 7;
      }),
    );
    expect(errs.some((e) => e.file === 'content/species/B02.json' && e.message.includes('BIOFILM'))).toBe(true);
  });

  it('refuses a shipped recipe that uses content outside the manifest', () => {
    const errs = errorsOf(
      mutate(raw, 'recipes', 'FIRST_DISH_V1.json', (d) => {
        (d.founders as { species: string }[])[0]!.species = 'B03';
      }),
    );
    expect(errs).toContainEqual(expect.objectContaining({ path: 'founders.0.species', message: '"B03" is not enabled in this build' }));
  });

  it('module eligibility never includes a native equivalent', () => {
    const errs = errorsOf(
      mutate(raw, 'modules', 'E01.json', (d) => {
        (d.eligibleAncestors as string[]).push('B06');
      }),
    );
    expect(errs.some((e) => e.file === 'content/modules/E01.json' && e.message.includes('natively'))).toBe(true);
  });
});
