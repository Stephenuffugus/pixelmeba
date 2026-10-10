/**
 * G3 gate fixture: every catalog relationship (BUILD_DIRECTIVE "G3 gate — evidence"; SPEC §17 "every
 * catalog relationship (generated matrix)"; D01 Phase 3 "Every catalog relationship has a data-backed
 * fixture").
 *
 * tools/relationship-matrix.ts runMatrix builds one tiny deterministic world per row under the shipped
 * registry and observes the simulation's own stages; the expectations are parsed from the design
 * documents by tests/helpers/tables.ts (CT §1.1, §3.1–§3.5, §5.1–§5.2, §7.1; SPEC §5.3), never from the
 * content JSON, so content that drifts from the catalog fails here. The same rows generate
 * docs/reports/relationships-g3.md (npx tsx tools/relationship-matrix.ts).
 *
 * Families: diets (incl. film as detritus, D-0038, and E08 debris feeding), prey (home ground,
 * sediment, a real E04 anchor that keeps a carrier "free", D-0055, and the attached flag), hosts (X01,
 * V01), inhibitors, enzymes (incl. the breaker), producers (PRODUCER_BIT), module eligibility, materials.
 *
 * A failing row is a bug: it would be listed in KNOWN_BUGS with its bug id and asserted with it.fails,
 * never by weakening the expectation. There are none.
 */
import { describe, expect, it } from 'vitest';
import { counts, FAMILIES, runMatrix, type Family, type MatrixRow } from '../../tools/relationship-matrix';
import {
  dietTable,
  enzymeRules,
  expandIds,
  filmDigesters,
  hostTable,
  identityTable,
  inhibitorTable,
  materialTable,
  moduleTable,
  preyTable,
} from '../helpers/tables';
import { registry } from '../helpers/world';

/** Row id → bug id for rows that disagree with the catalog because of a reported bug (none). */
const KNOWN_BUGS: Readonly<Record<string, string>> = {};

const FOODS = ['sugar', 'starch', 'oil', 'protein', 'broth', 'detritus', 'metabolite', 'film', 'photosynthesis'];

describe('CT oracles parse the catalog (tests/helpers/tables.ts)', () => {
  it('expands ID ranges and lists', () => {
    expect(expandIds('B01, B03–B05; free B06–B07')).toEqual(['B01', 'B03', 'B04', 'B05', 'B06', 'B07']);
    expect(expandIds('individual F01/F02/F04 segments')).toEqual(['F01', 'F02', 'F04']);
  });

  it('§3.1 diets and §3.5 film digesters agree; E08 carriers eat detritus when no meal', () => {
    const d = new Map(dietTable().map((r) => [r.id, r]));
    expect(d.get('B04')!.foods).toEqual(['detritus', 'protein', 'starch', 'oil']);
    expect(d.get('B02')!.foods).toEqual(['sugar', 'protein']);
    expect(d.get('A01')!.photosynthesis).toBe(true);
    expect(d.get('A04')!.foods).toEqual(['sugar']);
    expect(d.get('E08')).toMatchObject({ foods: ['detritus'], whenNoMeal: true });
    expect([...d.values()].filter((r) => r.film).map((r) => r.id)).toEqual(filmDigesters());
    expect(filmDigesters()).toEqual(['B04', 'F01']);
  });

  it('§3.2 keeps "free", "while in sediment" and "within 1 cell", and ignores notes', () => {
    const p = new Map(preyTable().map((r) => [r.id, r]));
    expect(p.get('P02')!.prey).toMatchObject({ B01: 'any', B06: 'free', B12: 'free', A04: 'any' });
    expect(p.get('P02')!.prey.B02).toBeUndefined(); // "(never attached B02)" is a note
    expect(p.get('P04')!.prey).toMatchObject({ B05: 'any', B06: 'inSediment', B13: 'inSediment' });
    expect(p.get('P06')!.withinCells).toBe(1);
    expect(p.get('P06')!.prey.B02).toBeUndefined();
    expect(Object.keys(p.get('P08')!.prey)).toEqual(['A01', 'A02', 'A03', 'A04', 'A05', 'F01', 'F02', 'F04']);
  });

  it('§3.3, §3.4, §1.1, §5, §7.1 and SPEC §5.3 rows', () => {
    const h = new Map(hostTable().map((r) => [r.id, r]));
    expect(h.get('X01')).toMatchObject({ kind: 'attaches', targets: ['A01'], drainPerSecond: 0.02 });
    expect(h.get('V01')).toMatchObject({ kind: 'infects', targets: ['B01'] });
    expect(h.get('V02')!.minFilm).toBe(0.1);
    const inh = new Map(inhibitorTable().map((r) => [r.field, r.targets]));
    expect(inh.get('Fungal inhibitor')).toEqual(['Y01', 'Y02', 'F01', 'F02', 'F03', 'F04']);
    expect(inh.get('Bacterial inhibitor')!.length).toBe(13);
    expect(identityTable().filter((r) => r.attached).map((r) => r.id)).toEqual(['B02', 'B13', 'F01', 'F02', 'F03', 'F04', 'P06']);
    const m = new Map(moduleTable().map((r) => [r.id, r]));
    expect(m.get('E01')).toMatchObject({ eligible: ['B01', 'B02', 'B04', 'B05', 'Y01', 'Y02'], notNative: ['B06', 'F02'] });
    expect(m.get('E04')!.eligible).toEqual(['B01', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09', 'B10', 'B11', 'B12', 'Y01', 'Y02']);
    expect(m.get('E15')!.eligible).toEqual([]); // "E12‑eligible bacteria, only with E12 present"
    const mats = new Map(materialTable().map((r) => [r.id, r]));
    expect(mats.get('DEBRIS')!.adds).toBe('detritus C + 0.10 N per C');
    expect(mats.get('M10')!.dose).toBe('one object');
    expect(enzymeRules()).toEqual({
      products: { starch: 'sugar', oil: 'metabolite', protein: 'broth' },
      nativeProducers: { B06: 'E_STARCH', F02: 'E_STARCH', B07: 'E_OIL', B08: 'E_PROTEIN' },
      producerModules: ['E01', 'E09'],
      rate: 0.1,
    });
  });
});

describe('G3 relationship matrix (every enabled species, material and module)', () => {
  const reg = registry();
  const res = runMatrix(reg);
  const of = (f: Family): MatrixRow[] => res.rows.filter((r) => r.family === f);
  const ids = (f: Family): Set<string> => new Set(of(f).map((r) => r.row));
  const species = reg.manifest.enabledSpecies;
  const organisms = species.filter((id) => reg.species[id]!.category !== 'virus');
  const mismatches = (f: Family): string[] =>
    of(f)
      .filter((r) => !r.pass && KNOWN_BUGS[r.row] === undefined)
      .map((r) => `${r.row}: expected ${r.expected}; observed ${r.observed}`);

  it('runs in at most 90 s', () => {
    console.info(`relationship-matrix: ${res.rows.length} rows in ${(res.ms / 1000).toFixed(1)} s; ${JSON.stringify(counts(res.rows))}`);
    expect(res.ms).toBeLessThan(90_000);
  });

  it('covers every species × food, predator × prey, host, inhibitor, enzyme, producer, module and material', () => {
    const diets = ids('diets');
    for (const id of organisms) for (const f of FOODS) expect(diets.has(`${id} × ${f}`), `${id} × ${f}`).toBe(true);
    for (const id of ['P01', 'P02', 'P03']) for (const f of FOODS) expect(diets.has(`${id}+E08 × ${f}`)).toBe(true);
    const prey = [...ids('prey')];
    for (const pred of ['P01', 'P02', 'P03', 'P04']) for (const id of organisms) expect(prey.some((r) => r.startsWith(`${pred} × ${id} (`)), `${pred} × ${id}`).toBe(true);
    expect(prey.filter((r) => r.includes('E04-anchored')).length).toBe(4 * 9);
    expect(prey.filter((r) => r.includes('(sediment)')).length).toBeGreaterThan(0);
    const hosts = ids('hosts');
    for (const id of organisms) {
      expect(hosts.has(`X01 × ${id}`)).toBe(true);
      expect(hosts.has(`V01 × ${id}`)).toBe(true);
    }
    const inh = ids('inhibitors');
    for (const m of ['INH_BACT', 'INH_FUNG', 'INH_PHOTO']) for (const id of organisms) expect(inh.has(`${m} × ${id}`)).toBe(true);
    expect(of('enzymes').length).toBe(3 * 4);
    expect(ids('producers')).toEqual(new Set(['B06', 'F02', 'B07', 'B08', 'B01+E01', 'B04+E09'].flatMap((p) => ['starch', 'oil', 'protein'].map((s) => `${p} × ${s} deposit`))));
    const mods = ids('modules');
    for (const m of reg.manifest.enabledModules) for (const id of species) expect(mods.has(`${m} × ${id}`)).toBe(true);
    const mats = [...ids('materials')];
    for (const id of reg.manifest.enabledMaterials) expect(mats.some((r) => r.startsWith(`${id} (`)), id).toBe(true);
    expect(res.rows.length).toBe(FAMILIES.reduce((a, f) => a + of(f).length, 0));
  });

  it('every family has positive and negative rows (no family is vacuous)', () => {
    const c = counts(res.rows);
    for (const f of FAMILIES) {
      expect(c[f].positive, f).toBeGreaterThan(0);
      if (f !== 'materials') expect(c[f].rows - c[f].positive, f).toBeGreaterThan(0);
    }
  });

  for (const f of FAMILIES) {
    it(`${f}: every row agrees with the catalog`, () => {
      expect(mismatches(f)).toEqual([]);
    });
  }
});
