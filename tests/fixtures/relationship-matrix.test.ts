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
 *
 * Phase 5 wave 13 (relmatrix): the tool also runs the Phase 5 families and rows whenever a registry enables
 * their subjects (tests/fixtures/relationship-matrix-p5.test.ts runs them under the Phase 5 test registry).
 * SHIPPED_V1 is the snapshot of the v1.0 rows (row count per family, the rows digest of every row's id,
 * expectation, observation, verdict and source, and the skipped list), taken from the shipped run before the
 * organism flip. Since the flip (D-0127) the shipped manifest enables every Phase 5 species, module, material
 * and system, so its run is the Phase 5 run (tests/fixtures/relationship-matrix-p5.test.ts pins the shipped
 * lists equal to P5_LISTS and the shipped digest); this file runs the v1.0 rows under preFlipRegistry() (a
 * v1.0 dish's registry), which reproduces SHIPPED_V1 exactly, so no Phase 5 change can move a v1.0 row.
 */
import { describe, expect, it } from 'vitest';
import { counts, FAMILIES, P5_FAMILIES, rowsDigest, runMatrix, V1_FAMILIES, type Family, type MatrixRow } from '../../tools/relationship-matrix';
import {
  dietTable,
  enzymeRules,
  expandIds,
  filmDigesters,
  gritDissolvePerSecond,
  handlingRules,
  hostTable,
  identityTable,
  inhibitorTable,
  materialTable,
  metabolismTable,
  moduleTable,
  preyOnlyNotes,
  preyTable,
  rivalRules,
  silicatePerBiomass,
  toleranceTable,
  trapRules,
} from '../helpers/tables';
import { preFlipRegistry } from '../helpers/world';

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

describe('CT oracles parse the Phase 5 rows (tests/helpers/tables.ts; wave 13 relmatrix)', () => {
  it('§3.1: A04 has two light-qualified routes; P09 eats detritus when no meal; no other entry has modes', () => {
    const d = new Map(dietTable().map((r) => [r.id, r]));
    expect(d.get('A04')!.modes).toEqual([
      { food: 'photosynthesis', op: '≥', light: 0.35 },
      { food: 'sugar', op: '≤', light: 0.25 },
    ]);
    expect(d.get('A04')!.photosynthesis).toBe(true);
    expect(d.get('P09')).toMatchObject({ foods: ['detritus'], whenNoMeal: true, modes: [] });
    expect(d.get('F03')!.foods).toEqual(['broth']);
    expect(d.get('F04')!.foods).toEqual(['detritus', 'starch']);
    expect(dietTable().filter((r) => r.modes.length > 0).map((r) => r.id)).toEqual(['A04']);
  });

  it('§3.2: P10 "P05 requires 4 s continuous contact; others 1 s", P06 within 1 cell, the A05 note, P05–P10 lists', () => {
    const p = new Map(preyTable().map((r) => [r.id, r]));
    expect(p.get('P10')!.contactSeconds).toEqual({ P01: 1, P02: 1, P05: 4, P07: 1 });
    expect(Object.keys(p.get('P10')!.prey)).toEqual(['P01', 'P02', 'P05', 'P07']);
    for (const id of ['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09']) expect(p.get(id)!.contactSeconds, id).toEqual({});
    expect(p.get('P06')).toMatchObject({ withinCells: 1 });
    expect(Object.keys(p.get('P06')!.prey)).toEqual(['B01', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09', 'B10', 'B11', 'B12']);
    const b01to12 = ['B01', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09', 'B10', 'B11', 'B12'];
    expect(Object.keys(p.get('P05')!.prey)).toEqual(b01to12);
    expect(Object.keys(p.get('P07')!.prey)).toEqual(b01to12);
    expect(Object.keys(p.get('P09')!.prey)).toEqual(['A02', 'A03', 'A04', 'Y02']);
    expect(preyOnlyNotes()).toEqual([{ prey: 'A05', predators: ['P08'] }]);
    // The note agrees with the lists: only P08 lists A05.
    expect(preyTable().filter((r) => r.prey.A05 !== undefined).map((r) => r.id)).toEqual(['P08']);
  });

  it('§3.3 X02, V02 and F03; §3.4 RIVAL', () => {
    const h = new Map(hostTable().map((r) => [r.id, r]));
    expect(h.get('X02')).toMatchObject({ kind: 'attaches', targets: ['F02', 'F04'], drainPerSecond: 0.015, minFilm: null });
    expect(h.get('X02')!.raw).toMatch(/never resting daughters/);
    expect(h.get('V02')).toMatchObject({ kind: 'infects', targets: ['B02'], minFilm: 0.1 });
    expect(h.get('F03')).toMatchObject({ kind: 'traps', targets: ['P04'] });
    const inh = new Map(inhibitorTable().map((r) => [r.field, r.targets]));
    expect(inh.get('RIVAL (B13 secretion / M08)')).toEqual(['B01', 'B10', 'B11']);
    expect(inh.get('Photosynthetic inhibitor')).toEqual(['A01', 'A02', 'A03', 'A04', 'A05']);
    expect(expandIds('RIVAL (B13 secretion / M08)')).toEqual(['B13', 'M08']);
  });

  it('§1.2 metabolism (shell builders, the low-light curve), §2 tolerance groups, §1.1 Phase 5 ids', () => {
    expect(metabolismTable().filter((m) => m.shell).map((m) => m.id)).toEqual(['A02', 'P05']);
    expect(metabolismTable().filter((m) => m.lightSaturation !== null).map((m) => [m.id, m.lightSaturation])).toEqual([['A03', 0.3]]);
    const t = new Map(toleranceTable().flatMap((g) => g.members.map((id) => [id, g] as const)));
    expect(t.get('B10')).toMatchObject({ group: 'Brine', ph: [6, 8], salinity: [0.4, 0.8] });
    expect(t.get('B11')).toMatchObject({ group: 'Sour', ph: [4.5, 6], salinity: [0, 0.2] });
    expect(t.get('F03')).toMatchObject({ group: 'Yeast/fungi', ph: [4.5, 7] });
    expect(identityTable().filter((r) => r.phase === 5).map((r) => r.id)).toEqual(['B09', 'B10', 'B11', 'B12', 'B13', 'F03', 'F04', 'A02', 'A03', 'A04', 'A05', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10', 'X02', 'V02']);
  });

  it('§7.1 E02 and E11; §5.2 M02, M06, M07, M08, M12', () => {
    const m = new Map(moduleTable().map((r) => [r.id, r]));
    expect(m.get('E02')).toMatchObject({ eligible: ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B10', 'B11', 'B12', 'B13'], notNative: ['B09'], phase: 5 });
    expect(m.get('E11')).toMatchObject({ eligible: ['P01', 'P02', 'P07'], notNative: [], phase: 5 });
    const mats = new Map(materialTable().map((r) => [r.id, r]));
    expect(materialTable().filter((r) => r.phase === 5).map((r) => r.id)).toEqual(['M02', 'M06', 'M07', 'M08', 'M12']);
    expect(mats.get('M02')!.adds).toBe('dissolved; A02/P05 bind 0.10 per new biomass');
    expect(mats.get('M06')!.adds).toBe('S_GLOW');
    expect(mats.get('M07')!.adds).toBe('sensed signal / (1 + quencher)');
    expect(mats.get('M08')!.adds).toBe('RIVAL (targets B01/B10/B11)');
    expect(mats.get('M12')).toMatchObject({ adds: 'dissolves to M02 at 0.01 × remaining/s', dose: '0.1/0.5/1.0 solid mineral' });
  });

  it('§12.2, §12.3, §12.5 and §12.6 constants', () => {
    expect(handlingRules()).toEqual({ jacketBase: 1, jacketPerCoverage: 3, radius: 1 });
    expect(trapRules()).toEqual({ minEnergy: 50, minBodyMultiple: 1.3, reserveC: 0.2, armEnergy: 8, holdSeconds: 8, drainPerSecond: 0.03, cooldownSeconds: 30 });
    expect(rivalRules()).toEqual({ rate: 0.02, energyPerSecond: 0.6, minEnergy: 50, radius: 2, localCap: 1 });
    expect(silicatePerBiomass()).toBe(0.1);
    expect(gritDissolvePerSecond()).toBe(0.01);
  });
});

/**
 * The shipped run before the organism flip (taken at 3daebb2 plus wave 13's stage 1 working tree, before the
 * relmatrix change): 711 rows, every one passing. At the organism flip (D-0127) the run under preFlipRegistry()
 * reproduced it exactly (711 rows, digest 4060fbf3…), so it stays the v1.0 snapshot; the shipped run's own
 * snapshot (2265 rows, 914a3bf6…) is pinned in relationship-matrix-p5.test.ts.
 */
const SHIPPED_V1 = {
  rows: 711,
  perFamily: { diets: 189, prey: 184, hosts: 36, inhibitors: 54, enzymes: 12, producers: 18, modules: 190, materials: 28 },
  digest: '4060fbf34a5908fe3ee61a4b4b5fc696c24f98f740fe6a33ab9bd5e8296eab03',
  skipped: [
    'prey: P05 (predator not enabled)',
    'prey: P06 (predator not enabled)',
    'prey: P07 (predator not enabled)',
    'prey: P08 (predator not enabled)',
    'prey: P09 (predator not enabled)',
    'prey: P10 (predator not enabled)',
    'hosts: X02 (not enabled)',
    'hosts: V02 (not enabled)',
    'hosts: F03 (not enabled)',
    'inhibitors: RIVAL (B13 secretion / M08) (no enabled material of that name)',
  ],
};

describe('G3 relationship matrix (every species, material and module a v1.0 dish enables)', () => {
  const reg = preFlipRegistry();
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

  it('a v1.0 dish: exactly the v1.0 rows (count, ids, expectations and observations equal to the snapshot)', () => {
    const c = counts(res.rows);
    expect(res.rows.length).toBe(SHIPPED_V1.rows);
    expect(Object.fromEntries(FAMILIES.filter((f) => c[f].rows > 0).map((f) => [f, c[f].rows]))).toEqual(SHIPPED_V1.perFamily);
    expect(rowsDigest(res.rows)).toBe(SHIPPED_V1.digest);
    expect(res.skipped).toEqual(SHIPPED_V1.skipped);
    for (const f of P5_FAMILIES) expect(c[f].rows, f).toBe(0);
  });

  it('every family has positive and negative rows (no family is vacuous)', () => {
    const c = counts(res.rows);
    for (const f of V1_FAMILIES) {
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
