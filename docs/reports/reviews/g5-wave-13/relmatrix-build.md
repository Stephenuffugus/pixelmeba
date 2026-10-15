# relmatrix build report (Phase 5 wave 13): the relationship matrix reaches Phase 5

No simulation file, content file, manifest, `implemented.ts` or shared test helper was edited. Phase 5 content is reached only through `phase5Registry()`, which is `registryWith(P5_LISTS, { allowUnimplemented: true })`. **All 2265 Phase 5 rows pass.** The shipped run is byte-identical to the snapshot taken before the change: 711 rows, the same skipped list and the same report. The FENCE passes unchanged. No row disagreed, so KNOWN_BUGS is empty in both test files.

## Checklist

### Build
- **1. Registries: DONE.**
  - `tools/relationship-matrix.ts:142` `p5Lists()`, `:152` `P5_LISTS` and `:159` `phase5Registry()` live in the tool, because tests/helpers/registry.ts is read-only.
  - P5_LISTS is the shipped lists plus:
    - every CT §1.1 phase-5 species;
    - the CT §7.1 phase-5 modules (E02, E11);
    - the CT §5.2 phase-5 materials (M02, M06, M07, M08, M12);
    - `P5_SYSTEMS` = rivalry, signals, silicate.
  - The lists are deduped and sorted.
  - `runMatrix(reg)` keeps its signature. It gains an optional second argument, `{ families }`, used for focused runs.
  - CLI (`main`, :1627): `--registry shipped|phase5` (default shipped). phase5 writes `docs/reports/relationships-g5-preflip.md`, whose header says it is a test registry before the organism flip. Both runs print a rows digest and the family counts.
  - Proved by relationship-matrix-p5.test "the Phase 5 test registry (P5_LISTS)".
- **2. tables.ts: DONE.**
  - `DietRow.modes`: A04's light-qualified routes.
  - `PreyRow.contactSeconds`: "P05 requires 4 s continuous contact; others 1 s".
  - `preyOnlyNotes()` (:230): "A05 is prey only for P08".
  - `metabolismTable()` (:422): CT §1.2 "+ silicate" shell builders and "(light/0.30)".
  - `toleranceTable()` (:444): CT §2.
  - `handlingRules()` (:472): §12.5 "jacket 1 + 3c", "P06 radius 1".
  - `trapRules()` (:490): §12.5.
  - `rivalRules()` (:510): §12.6.
  - `silicatePerBiomass()` (:519): §12.3.
  - `gritDissolvePerSecond()` (:524): §12.2.
  - Proved by six parser tests in relationship-matrix.test.ts "CT oracles parse the Phase 5 rows" (:108-180). They cover X02, V02, F03, RIVAL, E02, E11, M02–M12 and the contact and within qualifiers.
- **3. Families and rows: DONE.** Each row is one tiny world observed through the simulation's own stages.
  - **prey** (:599, :661):
    - Every predator P01–P10 × every organism, on home ground with the existing variants.
    - P06 sits on its home: water beside a stone placed by the Lab command. The prey is 0.6 cells away in the next cell, on its own ground.
    - P10 holds contact for its longest need plus 0.5 s.
    - Plus the row "A05 × every enabled predator", expected "captured only by P08".
  - **handling** (:1240): P10 × P01, P02, P05, P07 held in contact. A capture comes on contact tick k (10 / 40 / 10 / 10) and not before.
    - Contact broken at k − 1: no capture, need and progress are 0, and the next attempt again takes k ticks.
    - P10 × P01/P02/P07+E11 at c 0.5 → tick 25 and c 0.125 → tick 14.
  - **radius** (:1299), only with a radius predator enabled:
    - P06 × each organism at 0.9 in the next cell captures iff listed, and never at 1.0001.
    - Every other predator × each prey it lists, at 0.9: never.
  - **traps** (:1352):
    - An armed F03 (armed by one real stage 8) × each organism in its own cell: held iff P04.
    - A P04 in the next cell is not held.
    - Timeline (full ticks, the P04 pinned after stage 4): held 80 ticks, then 300 ticks not held, then held again.
  - **hosts** (`hostsP5` :750; `restingDaughter` :732, a real stage 9 F04 division):
    - V02 × every organism with film 0.10 in the cell: infects only B02.
    - V02 × B02 at film 0.05: not infected.
    - V01 × B02 at film 0.10: not infected (disjoint pools).
    - X02 × every organism: attaches only to F02 and F04.
    - X02's drain: host −0.0015 C per tick, half of it to X02.
    - X02 × a resting F04 daughter: not attached. X02 × her active parent: attached.
  - **inhibitors**:
    - RIVAL (the M08 field, found by the id the CT row's name cites) × every organism: harms exactly B01, B10 and B11.
    - The category inhibitors × every Phase 5 species.
    - `secretorRows` (:860): B13 × each organism 1 cell away secretes RIVAL 0.002 iff the organism is a target. B01 at 2 cells → secretes; at 3 cells → no secretion; a Resting B01 → no secretion.
  - **diets**:
    - `dietModes` (:456): A04 at light 0.40 eats CO2 only; at 0.20 sugar only; broth never. Its mode comes from stage 4's own `updateMode`.
    - `dietsP5` (:497): A03 at light 0.15 / 0.30 / 0.60 gives 0.5 / 1 / 1 of its light-0.9 intake. An A01 contrast at 0.15 gives 0.1667.
    - P09 holding a meal digests the meal and leaves detritus untouched.
    - F03 holding a P04 takes no broth and drains 0.003 C.
    - The generic rows cover F03 broth, F04 detritus and starch, and X02 (none). B10 and B11 get their CT §2 chemistry. A02 and P05 get silicate.
  - **growth** (:1454):
    - A02 and P05: with silicate 0, B +0 and SILICATE_LIMITED. With silicate 0.5, they grow and bind exactly 0.10 per new biomass, and silicate falls by the bound amount.
    - 32 other non-parasite organisms: Object.is-equal growth with and without silicate; nothing bound; silicate untouched.
    - P01, P02 and P07 + E11: the jacket is built from silicate (Δjacket = −Δsilicate), never from grit.
  - **modules**: E02 and E11 × all 38 species. B09 is refused E02 (native).
  - **materials** (`materialsP5` :1086):
    - M02, M06, M07, M08 and M12 each change only their own field, by exactly the dose.
    - M12 dissolving over two stage 3 passes: 0.0999000, then 0.0998001; silicate +0.0001999.
    - Cross-checks: M12's rate against CT §12.2, M02's binders against CT §1.2, M08's targets against CT §3.4.
- **4. Tests: DONE.**
  - tests/fixtures/relationship-matrix-p5.test.ts (18 tests) runs runMatrix(phase5Registry()) and checks:
    - every row passes (KNOWN_BUGS empty);
    - row counts per family, derived from the catalog (formulas in the test);
    - coverage of every listed row;
    - no family is vacuous;
    - the skipped list.
  - relationship-matrix.test.ts adds "before the organism flip: exactly the v1.0 rows". It checks the count, the per-family counts, a SHA-256 of every row's (family, row, expected, observed, pass, source) and the skipped list against `SHIPPED_V1`, a snapshot taken before any edit. The vacuity loop now runs over `V1_FAMILIES`.

### Done when
- **DONE: both matrix tests pass.** relationship-matrix.test.ts 26/26; relationship-matrix-p5.test.ts 18/18 (last run, after the final edit).
- **DONE: the shipped CLI passes every row and its report is unchanged.** `npx tsx tools/relationship-matrix.ts --out <scratch>/g3-after.md` gives 711/711, and `cmp` against the pre-change output (g3-before.md) is byte-identical. The rows JSON before and after is byte-identical too.
  - I did not overwrite the committed docs/reports/relationships-g3.md. Its manifest line already differs from HEAD's tool output ("buildPhase 3 … f276b113…" against today's "buildPhase 5 … 84c41636…"); that is pre-existing and not mine.
- **DONE: `--registry phase5` writes docs/reports/relationships-g5-preflip.md**, 2265 of 2265 rows passing.
- **DONE: tsc and eslint.**
  - `npx eslint` on my four .ts files is clean.
  - `npx tsc -p tsconfig.json --noEmit` reports one error, in tests/e2e/organismFixture.ts(47,15) ("'w' is declared but its value is never read"). That file belongs to org-ui (in flight), not to me. My files typecheck clean.
- **DONE: FENCE unchanged.** 10 files, 77/77 pass. I change no rule.

## Files
- Changed: tools/relationship-matrix.ts, tests/helpers/tables.ts, tests/fixtures/relationship-matrix.test.ts.
- Created:
  - tests/fixtures/relationship-matrix-p5.test.ts
  - docs/reports/relationships-g5-preflip.md (generated)
  - this report
- Scratch (gitignored): tmp/relmatrix/ (the mutation tests and logs).

## New families and row counts (phase5 registry, 2265 rows)
| Family | Rows | Pass |
|---|---:|---:|
| diets | 384 | 384 |
| prey | 771 | 771 |
| hosts | 149 | 149 |
| inhibitors | 183 | 183 |
| enzymes | 12 | 12 |
| producers | 18 | 18 |
| modules | 456 | 456 |
| materials | 37 | 37 |
| handling (new) | 14 | 14 |
| radius (new) | 162 | 162 |
| traps (new) | 37 | 37 |
| growth (new) | 42 | 42 |

Shipped registry: 711 rows (diets 189, prey 184, hosts 36, inhibitors 54, enzymes 12, producers 18, modules 190, materials 28). There are none in the four new families.

## Expectation sources (all parsed by tests/helpers/tables.ts, none from content JSON)
- **Diets and modes.** Diets: CT §3.1. A04 modes: §3.1 "(light ≥ 0.35) / (light ≤ 0.25)". A03 curve: §1.2 "(light/0.30)", with an A01 linear contrast from SPEC §6.5. P09 with a meal: §3.1 "when no meal". F03 while draining: SPEC §7.17.
- **Prey and capture.** Prey: CT §3.2 lists. The A05 row: §3.2 note. Handling: §3.2 "requires 4 s continuous contact; others 1 s", plus §12.5 "jacket 1 + 3c". Radius: §3.2 "within 1 cell" and §12.5 "P06 radius 1".
- **Traps.** CT §3.3 "traps P04 only", §12.5 "hold 8 s … cooldown 30 s", and SPEC §7.17 "entering its cell" for the next-cell row.
- **Hosts.** CT §3.3 for X02 (targets, "never resting daughters", drain 0.015 C/s) and V02 ("where film ≥ 0.10"). SPEC §7.5 for disjoint pools.
- **Inhibitors.** RIVAL: CT §3.4. B13's trigger: §12.6 "targets within 2 cells" and SPEC §7.9 "active".
- **Growth.** Shell builders: CT §1.2 "+ silicate". The ratio 0.10: §12.3. E11: CT §7.1 and SPEC §9 E11.
- **Modules and materials.** Modules: CT §7.1. Materials: CT §5.2, with §12.2 for the grit rate.
- **Home-ground setup (setup only, never an expectation).** CT §2 tolerance groups set B10's salt and B11's acid.

## What each test proves, and the mutants that break it
Each mutant was a `vi.mock` with `importOriginal` in tmp/relmatrix/m*.test.ts. Nothing under src/ was edited. All 8 runs passed, so every mutant made its target rows fail:

| Mutant | Rows that failed |
|---|---|
| m1 `handlingSpecies` → null | All 14 handling rows: capture on contact tick 1 |
| m2 `radiusCaptureSpecies` → null | 30 P06 prey rows and 11 P06 0.9-cell radius rows |
| m3 `trapCaptures` → no-op | F03 × P04 own cell; the timeline; F03 holding × broth |
| m4 `trapHoldsTarget` → false | F03 holding × broth (took 0.0125 C) |
| m5 `updateMode` → no-op | A04 at light 0.40: sugar eaten, photosynthesis not |
| m6 `lowLightResponse` → linear | All 3 A03 curve rows (0.167 / 0.333 / 0.667) |
| m7 constants (one run) | See the list below |
| m8 `RIVAL_TARGETS` + B02 | M08 × B02 and B13 secretion × B02 |

m7 changed six constants in one run, and each change failed its own rows:
- radius 1.1 → the 11 rows at 1.0001 captured;
- hold 7.9 s and cooldown 29 s → the timeline reads "79 ticks, 290 ticks";
- jacket 1 + 2c → ticks 20 and 13;
- shell 0.2 per biomass → both silicate-0.5 rows;
- grit 0.02/s → the dissolving row.

I could not mutate these, because the code reads them inside its own module, where `vi.mock` does not reach:
- V02's film constant, X02's resting-host check, P09's meal-first order, E11's silicate-only source.
- Their rows are still contrasted: film 0.10 against 0.05, the resting daughter against her active parent, P09 with and without a meal, silicate against grit.

## Commands
- `npx vitest run tests/fixtures/relationship-matrix.test.ts tests/fixtures/relationship-matrix-p5.test.ts` → Test Files 2 passed (2), Tests 44 passed (44).
  - The p5 file alone after its last edit: Test Files 1 passed (1), Tests 18 passed (18).
- `npx tsx tools/relationship-matrix.ts --out …/g3-after.md` → 711 rows, 711 pass, 0 fail; rows digest 4060fbf3…eab03; the report `cmp`-identical to the pre-change output.
- `npx tsx tools/relationship-matrix.ts --registry phase5` → 2265 rows, 2265 pass, 0 fail; rows digest 914a3bf6…a81d.
- FENCE (`npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/determinism-g3.test.ts`) → Test Files 10 passed (10), Tests 77 passed (77), 1105 s.
- Regression: `npx vitest run tests/fixtures/neutral-founders.test.ts` (the only other tables.ts importer) → 41/41.
- Mutants: `npx vitest run --config tmp/relmatrix/vitest.config.ts` → 8 passed (8).

## Run times
The machine had 2 CPUs shared with other agents. Load averages were 3.6 to 6.8, including Playwright runs.
- Shipped CLI: 6.8–12.1 s.
- Phase5 CLI: 30.4–38.4 s.
- Inside vitest at load ≈ 7: shipped 51 s, phase5 179–184 s.

The p5 time assertion is set at 300 s, to catch a runaway without failing under load. The lead should re-measure on a quiet machine.

## Rows that disagreed
None. During development these rows failed before I fixed the setup, never the expectation:
- B10 and B11 needed their CT §2 salt and pH.
- F03 needed sediment, and P06 a stone edge.
- A02 and P05 needed silicate.
- A04 needed a mode.
- P10 needed multi-tick contact.
- V02 needed film.

No simulation bug was found.

## Setup choices
- P06's prey rows use a 0.6-cell gap in the next cell, so both organisms stay on their own home ground.
- The trap rows put each species on F03's sediment, since the catch depends only on species and cell.
- The jacket coverage in the handling rows and the Resting E03 B01 are labelled test state, with mineral logged as an input.
- Growth leaves out the parasites, because a host drain is not an ordinary route.

## FENCE notes
Unchanged: 10 files, 77/77. The tool and tests only build test worlds, so I did not run fence-update.

## Bugs noticed elsewhere
tests/e2e/organismFixture.ts:47 has an unused `w` that fails `tsc --noEmit` (TS6133). It is org-ui's in-flight file.

## Proposed decisions
- **PROPOSED DECISION: the shipped matrix snapshot is a digest re-recorded at the organism flip.**
  - `SHIPPED_V1` in relationship-matrix.test.ts holds the rows digest, the counts and the skipped list. The flip changes the shipped rows by design.
  - The lead runs `npx tsx tools/relationship-matrix.ts`, reads the regenerated report, and copies the printed digest and counts.
  - Reason: the assignment asks for exact equality with a pre-change snapshot, and a 711-row literal would bloat the test.
- **PROPOSED DECISION: the radius family's "every other predator at 0.9" rows cover each predator's CT-listed prey only.** These rows are emitted only when a radius predator is enabled.
  - Reason: an unlisted prey is never captured at any distance, and the prey family already proves that.
  - Gating them keeps the shipped v1.0 rows identical. Without the gate they added 30 rows to the shipped run.
- **PROPOSED DECISION: new rows for v1.0 subjects are added only when a Phase 5 subject is enabled.** For example, there is no X01 drain row and no "E08 carrier holding a meal" row.
  - Reason: the shipped run must yield exactly the v1.0 rows until the flip.
  - The lead may add those two rows at the flip, when the shipped rows are re-recorded anyway.

## What the lead runs at the organism flip
1. After the manifest, `implemented.ts` (TRAP, E02, E11) and the moduleRegistryVersion 3 change, run `npx tsx tools/relationship-matrix.ts`. With the shipped manifest equal to P5_LISTS it should print about 2265 rows, all passing, matching the phase5 run.
   - It writes docs/reports/relationships-g3.md. Use `--out docs/reports/relationships-g5.md` if the G3 evidence should stay as committed.
2. Update `SHIPPED_V1` in tests/fixtures/relationship-matrix.test.ts from the printed digest and counts. The test then expects rows in the four new families too, so change `for (const f of P5_FAMILIES) expect(c[f].rows).toBe(0)`.
3. Update the shipped coverage test's v1.0-specific pins:
   - `prey.filter(r => r.includes('E04-anchored')).length` becomes 10 predators × the enabled E04-eligible prey (B01, B03–B12, Y01, Y02).
   - The `['P01','P02','P03']` E08 loop still passes after the flip; adding P05 and P07 would cover the new E08 carriers too.
   - The vacuity loop can go back to `FAMILIES`.
4. `phase5Registry()`'s allowUnimplemented becomes moot. tests/fixtures/relationship-matrix-p5.test.ts keeps working unchanged.
