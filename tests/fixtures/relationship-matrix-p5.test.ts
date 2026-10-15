/**
 * Phase 5 wave 13 (relmatrix): every catalog relationship under the Phase 5 test registry (g5-briefs RELMATRIX,
 * R14; g5-plan lead call 4; SPEC §17 "every catalog relationship (generated matrix)"; D01 Phase 3 "Every catalog
 * relationship has a data-backed fixture").
 *
 * tools/relationship-matrix.ts runMatrix(phase5Registry()) runs the v1.0 families over every Phase 5 species,
 * module and material, plus the Phase 5 families (handling, radius, traps, growth) and the Phase 5 rows inside
 * the older families (A04's modes, A03's curve, P09 with a meal, F03 while draining, the A05 note, X02's drain
 * and a resting F04 daughter, V02's film gate and the disjoint V01/V02 pools, RIVAL and B13's trigger, M02–M12).
 * Expectations are parsed from the design documents (tests/helpers/tables.ts), never from the content JSON.
 * The same rows generate docs/reports/relationships-g5-preflip.md (npx tsx tools/relationship-matrix.ts
 * --registry phase5).
 *
 * phase5Registry() is registryWith(P5_LISTS, { allowUnimplemented: true }) (defined in the tool, since
 * tests/helpers/registry.ts is read-only to this task): F03's TRAP joins IMPLEMENTED_NATIVE_ABILITIES at the
 * wave 13 integration and E02/E11 join IMPLEMENTED_MODULES at the organism flip (D-0104); nothing here is
 * enabled in the shipped build. After the flip the shipped run (relationship-matrix.test.ts) covers these rows.
 *
 * A failing row is a bug: it would be listed in KNOWN_BUGS with its bug id and asserted with it.fails, never
 * by weakening the expectation. There are none.
 */
import { describe, expect, it } from 'vitest';
import { counts, FAMILIES, P5_FAMILIES, P5_LISTS, P5_SYSTEMS, phase5Registry, runMatrix, type Family, type MatrixRow } from '../../tools/relationship-matrix';
import { identityTable, moduleTable, preyTable } from '../helpers/tables';
import { registry } from '../helpers/world';

/** Row id → bug id for rows that disagree with the catalog because of a reported bug (none). */
const KNOWN_BUGS: Readonly<Record<string, string>> = {};

const FOODS = ['sugar', 'starch', 'oil', 'protein', 'broth', 'detritus', 'metabolite', 'film', 'photosynthesis'];
const P5_SPECIES = ['A02', 'A03', 'A04', 'A05', 'B09', 'B10', 'B11', 'B12', 'B13', 'F03', 'F04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10', 'V02', 'X02'];

describe('the Phase 5 test registry (P5_LISTS)', () => {
  it('is the shipped lists plus every Phase 5 species, E02, E11, M02, M06, M07, M08, M12 and signals, rivalry, silicate; deduped and sorted', () => {
    const shipped = registry().manifest;
    const union = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])].sort();
    expect(P5_LISTS.enabledSpecies).toEqual(union(shipped.enabledSpecies, P5_SPECIES));
    expect(P5_LISTS.enabledSpecies.length).toBe(38);
    expect(P5_LISTS.enabledModules).toEqual(union(shipped.enabledModules, ['E02', 'E11']));
    expect(P5_LISTS.enabledMaterials).toEqual(union(shipped.enabledMaterials, ['M02', 'M06', 'M07', 'M08', 'M12']));
    expect(P5_LISTS.enabledSystems).toEqual(union(shipped.enabledSystems, ['rivalry', 'signals', 'silicate']));
    expect(P5_SYSTEMS).toEqual(['rivalry', 'signals', 'silicate']);
    const reg = phase5Registry();
    expect(reg.manifest.enabledSpecies).toEqual(P5_LISTS.enabledSpecies);
    expect(reg.manifest.enabledModules).toEqual(P5_LISTS.enabledModules);
    expect(reg.manifest.enabledMaterials).toEqual(P5_LISTS.enabledMaterials);
    expect(reg.manifest.enabledSystems).toEqual(P5_LISTS.enabledSystems);
  });
});

describe('Phase 5 relationship matrix (every Phase 5 species, module and material; test registry)', () => {
  const reg = phase5Registry();
  const res = runMatrix(reg);
  const of = (f: Family): MatrixRow[] => res.rows.filter((r) => r.family === f);
  const ids = (f: Family): Set<string> => new Set(of(f).map((r) => r.row));
  const species = reg.manifest.enabledSpecies;
  const organisms = species.filter((id) => reg.species[id]!.category !== 'virus');
  const prey = new Map(preyTable().map((p) => [p.id, p]));
  const mismatches = (f: Family): string[] =>
    of(f)
      .filter((r) => !r.pass && KNOWN_BUGS[r.row] === undefined)
      .map((r) => `${r.row}: expected ${r.expected}; observed ${r.observed}`);

  // The CLI run takes 30–38 s on the shared 2-CPU codespace (wave 13, other agents running; the shipped run
  // 7–12 s); under heavy load (load average ≈ 7) vitest measured 183 s, so the bound only catches a runaway.
  it('runs in at most 300 s (about half a minute on two quiet cores)', () => {
    console.info(`relationship-matrix (phase5): ${res.rows.length} rows in ${(res.ms / 1000).toFixed(1)} s; ${JSON.stringify(counts(res.rows))}`);
    expect(res.ms).toBeLessThan(300_000);
  });

  it('row counts per family follow from the catalog', () => {
    const c = counts(res.rows);
    const n = organisms.length; // 36
    expect(n).toBe(36);
    // diets: 36 organisms × 9 foods, A04's generic 9 replaced by 2 modes × 9, 5 E08 carriers × 9, A03's curve 3,
    // the A01 contrast, P09 with a meal, F03 while draining.
    expect(c.diets.rows).toBe(n * 9 + 9 + 5 * 9 + 3 + 1 + 1 + 1);
    // hosts: X01, X02, V01, V02 × 36; V02 at half film; V01 × B02 at V02's film; X02's drain; a resting F04 daughter and its parent.
    expect(c.hosts.rows).toBe(4 * n + 5);
    // inhibitors: three category inhibitors and RIVAL × 36; B13's trigger × 36 and at 2 cells, 3 cells and Resting.
    expect(c.inhibitors.rows).toBe(4 * n + n + 3);
    // modules: 12 enabled modules × 38 species.
    expect(c.modules.rows).toBe(12 * 38);
    // materials: 32 materials; M01 eaters; M02 binders; M08 targets; M12 dissolving and its CT §12.2 rate.
    expect(c.materials.rows).toBe(32 + 5);
    // handling: P10 × 4 listed prey × (held, broken); P10 × the 3 E11-eligible listed prey × 2 coverages.
    expect(c.handling.rows).toBe(4 * 2 + 3 * 2);
    // radius: P06 × 36 × (0.9, 1.0001); every other predator × each prey it lists at 0.9.
    const listed = [...prey.values()].filter((p) => p.id !== 'P06').reduce((a, p) => a + Object.keys(p.prey).filter((id) => organisms.includes(id)).length, 0);
    expect(c.radius.rows).toBe(2 * n + listed);
    // traps: F03 × each other organism in its cell; a P04 in the next cell; the hold/cooldown timeline.
    expect(c.traps.rows).toBe(n - 1 + 1 + 1);
    // growth: 34 non-parasite organisms (2 shell builders × 2 rows), E11's 3 carriers × (silicate, grit).
    expect(c.growth.rows).toBe(34 + 2 + 3 * 2);
    // prey and the unchanged families (pinned: the prey variants follow each species' ground and modules).
    expect({ prey: c.prey.rows, enzymes: c.enzymes.rows, producers: c.producers.rows }).toEqual({ prey: 771, enzymes: 12, producers: 18 });
    expect(res.rows.length).toBe(FAMILIES.reduce((a, f) => a + c[f].rows, 0));
    expect(res.skipped).toEqual(['hosts: F03 (trap; the traps family)']);
  });

  it('covers every Phase 5 predator × prey, handling, radius, trap, host, RIVAL, diet, growth, module and material row', () => {
    const preyRows = [...ids('prey')];
    for (const pred of ['P05', 'P06', 'P07', 'P08', 'P09', 'P10']) for (const id of organisms) expect(preyRows.some((r) => r.startsWith(`${pred} × ${id} (`)), `${pred} × ${id}`).toBe(true);
    expect(ids('prey').has('A05 × every enabled predator')).toBe(true);
    const handling = ids('handling');
    for (const p of ['P01', 'P02', 'P05', 'P07']) {
      expect(handling.has(`P10 × ${p} (held in contact)`), p).toBe(true);
      expect([...handling].some((r) => r.startsWith(`P10 × ${p} (contact broken at tick `)), p).toBe(true);
    }
    for (const p of ['P01', 'P02', 'P07']) for (const cov of [0.5, 0.125]) expect(handling.has(`P10 × ${p}+E11 (jacket c ${cov})`)).toBe(true);
    const radius = ids('radius');
    for (const id of organisms) for (const d of [0.9, 1.0001]) expect(radius.has(`P06 × ${id} (${d} cells, next cell)`), `P06 × ${id} ${d}`).toBe(true);
    const traps = ids('traps');
    for (const id of organisms.filter((x) => x !== 'F03')) expect(traps.has(`F03 (armed) × ${id} (own cell)`), id).toBe(true);
    expect(traps.has('F03 × P04 (hold, release, cooldown)')).toBe(true);
    const hosts = ids('hosts');
    for (const id of organisms) for (const a of ['X01', 'X02', 'V01', 'V02']) expect(hosts.has(`${a} × ${id}`), `${a} × ${id}`).toBe(true);
    for (const r of ['X02 drain on F02', 'X02 × F04 (resting daughter)', 'X02 × F04 (its active parent)', 'V02 × B02 (film 0.05)', 'V01 × B02 (film 0.1)']) expect(hosts.has(r), r).toBe(true);
    const inh = ids('inhibitors');
    for (const id of organisms) {
      for (const m of ['INH_BACT', 'INH_FUNG', 'INH_PHOTO', 'M08']) expect(inh.has(`${m} × ${id}`), `${m} × ${id}`).toBe(true);
      expect(inh.has(`B13 secretion × ${id} (Active, 1 cell)`), id).toBe(true);
    }
    const diets = ids('diets');
    for (const id of organisms.filter((x) => x !== 'A04')) for (const f of FOODS) expect(diets.has(`${id} × ${f}`), `${id} × ${f}`).toBe(true);
    for (const light of ['0.40', '0.20']) for (const f of FOODS) expect(diets.has(`A04 (light ${light}) × ${f}`)).toBe(true);
    for (const r of ['A03 × photosynthesis (light 0.15)', 'P09 (holding a meal) × detritus', 'F03 (holding a P04) × broth']) expect(diets.has(r), r).toBe(true);
    const growth = ids('growth');
    for (const r of ['A02 × silicate 0', 'A02 × silicate 0.5', 'P05 × silicate 0', 'P05 × silicate 0.5', 'P01+E11 × silicate 0.5', 'P01+E11 × grit 0.5, silicate 0']) expect(growth.has(r), r).toBe(true);
    const mods = ids('modules');
    for (const m of ['E02', 'E11']) for (const id of species) expect(mods.has(`${m} × ${id}`), `${m} × ${id}`).toBe(true);
    const mats = [...ids('materials')];
    for (const id of ['M02', 'M06', 'M07', 'M08', 'M12']) expect(mats.some((r) => r.startsWith(`${id} (`)), id).toBe(true);
    for (const r of ['M02 binders × CT §1.2', 'M08 targets × CT §3.4', 'M12 dissolving (two stage 3 passes)', 'M12 rate × CT §12.2']) expect(mats.includes(r), r).toBe(true);
  });

  it('the Phase 5 subjects the catalog names all have rows (CT §1.1 phase 5, §7.1 phase 5)', () => {
    // Each as a row's subject ("B09 × sugar", "P10 × P05 (…)", "E11 × P01", "V02 × B02").
    const subjects = new Set(res.rows.map((r) => r.row.split(/[ +]/)[0]!));
    for (const id of identityTable().filter((r) => r.phase === 5).map((r) => r.id)) expect(subjects.has(id), id).toBe(true);
    for (const m of moduleTable().filter((r) => r.phase === 5).map((r) => r.id)) expect(subjects.has(m), m).toBe(true);
  });

  it('every family has positive and negative rows (no family is vacuous)', () => {
    const c = counts(res.rows);
    for (const f of FAMILIES) {
      expect(c[f].rows, f).toBeGreaterThan(0);
      expect(c[f].positive, f).toBeGreaterThan(0);
      if (f !== 'materials') expect(c[f].rows - c[f].positive, f).toBeGreaterThan(0);
    }
    // handling's negatives are its broken-contact rows ("no capture; … then captured on contact tick k again").
    expect(of('handling').filter((r) => /^no capture/.test(r.expected)).length).toBe(4);
    for (const f of P5_FAMILIES) expect(of(f).length, f).toBeGreaterThan(0);
  });

  for (const f of FAMILIES) {
    it(`${f}: every row agrees with the catalog`, () => {
      expect(mismatches(f)).toEqual([]);
    });
  }
});
