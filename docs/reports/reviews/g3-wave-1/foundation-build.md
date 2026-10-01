# Phase 3 wave 1 — foundation build report (world schema 3 → 4)

Builder: foundation. Base: main 6ac8429 (Preflight on g2). Nothing committed (the lead commits). Nothing a player sees changes.

## Checklist — Build

- (1) Schema 4 — DONE
  - `SCHEMA_VERSION = 4`, with the header line "4 = P3 foundation: …" — src/sim/world.ts:28–33.
  - Columns appended after `dryTimer` with explicit defaults — src/sim/entities.ts:93–132:
    - filmSeconds, anchorState, anchorSeconds, anchorLockout, adhPartner (u32 birthId, 0 = none), adhSeconds, adhLockout, waterCrossed;
    - noUsableIntakeSeconds, whose comment says wave 4 advances it and nothing in wave 1 writes it;
    - fLink0..3 (i32), fLinkB0..3 (u32), fLinkKind0..3 (u8: 1 visual, 2 transport), aLink0..1 (i32), aLinkB0..1 (u32).
  - fLink*/aLink* slot columns are added to NEG_ONE_DEFAULT. `emptyValueOf(name)` is exported at entities.ts:181, and `FIRST_HASH_NEUTRAL_COLUMN` (the index of `filmSeconds`) at :189.
  - No FLAG bits are used. A comment reserves 1 << 12 and 1 << 13 for wave 4.
  - tests/sim/history-debris.test.ts: :97 is now `toBe(4)`; :110, :142 and :183 are now `toBe(SCHEMA_VERSION)`. The literals 'baa42a29186c6c46' (:168) and '5ce059e49121f688' (:176) are unchanged and still pass.
  - src/sim/links.ts provides the full API: addFungalLink :193 (refuses a 5th link), removeFungalLink, fungalLinkKind, fungalNeighbors :211 (position order, optional kind), fungalDegree, fungalComponent :220 (BFS by ascending slot, members sorted, optional kind), addAdhesionLink/removeAdhesionLink (≤ 2), adhesionNeighbors/Degree, adhesionComponent :244, removeAllLinks :268, rekeyLinks :278, linkProblem :295 (shared with the import) and linksValid :336. The layout is documented in the file header.
- (2) World stores, hash-neutral — DONE
  - stateHash (src/sim/serialize.ts) hashes:
    - a column from `filmSeconds` on only when some slot in [0, hw) differs from emptyValueOf (Object.is, so −0 counts as state) — serialize.ts:259;
    - `objects` only when non-empty;
    - `sample` only when non-null, through its saved typed form;
    - `counters.nextObjectId` only when ≠ 1 — :280–282.
  - `world.objects` (FOOD_OBJECT_CAP 128, kinds validated union 'pellet' | 'wafer'): src/sim/objects.ts provides createObject :53 (refuses cap, occupied, outside, structure, invalid; no ledger side effect: the caller records the input or the matching subtraction), removeObject :76, objectAt, objectTotals :87, foodObjectProblem and foodObjectsProblem :134. World field at world.ts:130; ids come from `counters.nextObjectId` (world.ts:89).
  - `world.sample` (world.ts:132) uses src/sim/sampleSlot.ts:
    - SampleSlot :42 = {txId, seq, mode, origin, radius, rows [{slot, cols}], cells [{dx, dy, fields}], objects, genomes [{index, genome}]}. I added `seq` because D-0037 records the sampleTake seq in world.sample.
    - In a save, rows are typed payloads: one array per entity column in its own dtype, slots as i32, cell values as f64 (encodeSample :121, decodeSample :160).
    - sampleTotals :199 and savedSampleProblem :242.
  - Ledger (src/sim/ledger.ts):
    - computeTotals counts objects C/N and sample C/N/M, with breakdown keys objectsC, objectsN, sampleC, sampleN and sampleM (:144–156).
    - Energy category `construction` added to createLedger (:52, :69). deserializeWorld already merges missing categories.
- (3) Migration — DONE
  - `COLUMNS_ADDED_IN[4]` = every column from filmSeconds on (serialize.ts:152–156).
  - The added-column loop fills each column with `emptyValueOf` (:175–179), so link-slot columns get −1.
  - A `v === 4` step after the `v === 3` history step sets objects [] and sample null (:185).
  - Migration stays in migrateWorldState (D-0019 precedent).
  - The import refuses each of the following with a readable message (`… Nothing was loaded.`) and builds no world. The checks are in `phase3StateProblem`, saveFile.ts:391/407:
    - more than 128 objects;
    - an object outside the mask (checked against the fixed mask, not only the saved structure array) or on a structure;
    - asymmetric or dangling links, an unknown kind, or a duplicate partner;
    - fungal degree > 4 or adhesion degree > 2;
    - a sample row with an unknown species or genome, or one whose genome copy is missing.
  - In the column layout a degree above the limit cannot be expressed inside the known columns. The import therefore refuses link columns beyond fLink*3 or aLink*1 with "An organism has more than 4 fungal links." or "… more than 2 adhesion links.".
- (4) World gates — DONE
  - FILM_DIGESTION_IMPLEMENTED is removed from src/sim/content/implemented.ts. `grep -rn FILM_DIGESTION src tests tools` finds nothing (only docs/agent mentions remain).
  - snapshot.ts:16 imports worldHasSystem, and :321 now reads `sp.def.digestsFilm && world.fields.film !== undefined && worldHasSystem(world, 'film')`.
  - No other build-level behaviour switch exists in src. The remaining `buildPhase` reads are content-shipping gates. IMPLEMENTED_* are unchanged validation lists.
  - species.ts film filtering is untouched (D-0038).
- (5) Registry — DONE (src/sim/content/registry.ts, additive)
  - The manifest block's system checks are at :425–443. Each message names both sides, e.g. `enabled species "B02" uses BIOFILM, which needs the "film" system (not in enabledSystems)`.
  - Exported tables: `MODULE_SYSTEM_NEEDS` (E01 and E09 → enzymes, E10 → film), `speciesSystemNeeds` (BIOFILM, BRANCHING/TRANSPORT_LINKS, HOST_DRAIN, LYSIS or the virus category, E_* secretion, a broth diet; never digestsFilm) and `materialSystemNeed` (FIELD_DEFS[target].system for field, deposit, activity and viral materials; object → foodObjects).
  - The validateContent(raw, opts) signature is kept.
- (6) Trajectory registration — DONE
  - tests/helpers/trajectory.ts: `POST_G2_STORE_CANON.sample` maps held rows to {birthId, cols} with species, genome and module indices as IDs and genome keys; slot columns are dropped (their birthId partners keep the identity) and genomes become keys.
  - No new column holds an index, so POST_G2_COLUMN_KINDS is unchanged. I added no derived World key.
  - postG2State stays [] for every g2 save: g2-replay's 'g2' digest passes at +1,000.
- SHARED hooks — DONE
  - `removeAllLinks(world, i)` runs right before `world.ents.free` in killEntity (maintenance.ts:154) and in the predation capture (contacts.ts:140).
  - `rekeyLinks(world, i, parentBirth)` runs right after `c.birthId[i] = b0` (births.ts:280).
  - tests/helpers/world.ts gains linkFungal, linkAdhesion and placeObject (placeObject logs an external input).

## Checklist — Done when

- g2-replay and trajectory-fence pass unchanged — DONE. g2 saves migrate 3 → 4 and hash exactly hashAtLoad, hashPlus1000 and digestPlus1000. The schema-2 fixture still gives 'baa42a29186c6c46' and '5ce059e49121f688' (history-debris).
- Fence is live — DONE. A throwaway test (deleted) loaded first-dish-t3000, added 1e-9 to E of slot 1 (an organism the unperturbed replay keeps alive) and ran 1,000 ticks. The fence comparison failed:
  ```
  AssertionError: expected { slot: 1, …(3) } to deeply equal { slot: 1, …(3) }
  -   "atLoad": "c7435142acec100f",
  -   "digest": "5730917ce3ec53f6",
  -   "plus1000": "69102ffe9ccaa0c3",
  +   "atLoad": "b06671068ec74638",
  +   "digest": "5f45f96f8dcd81db",
  +   "plus1000": "b9d4ff53ce246471",
  ```
  Observation: on starch-unlock-t900 the same perturbation on slots 0–5 changed only atLoad. Those six organisms die within the 1,000 ticks, and their energy is dissipated, which is not hashed. The digest then matched (13510998deeba33e). The fence is live, but a perturbation of a doomed organism is invisible at +1,000.
- tests/persistence/migration.test.ts — DONE. It tests 3 → 4 (g2 save, stateHash === expected.json hashAtLoad), 2 → 4 (the real schema 2 fixture) and 1 → 4 (asSchema1 now also drops `objects`/`sample`; equal hash at load and at +500). Each test checks migratedFrom, that the input is untouched, that every link-slot column is −1 (decoded from the migrated payload and in the loaded world), linksValid, and that a re-save → re-load gives the same stateHash. `expect(SCHEMA_VERSION).toBe(4)`.
- tests/sim/links.test.ts (9 tests) — DONE:
  - symmetric add/remove, plus the duplicate, self and unknown-kind refusals;
  - the 5th fungal and 3rd adhesion link are refused and change nothing; freed positions are reused in position order;
  - killEntity and consumePrey each remove the links from both endpoints;
  - a forgotten removal is reported as dangling;
  - a division re-keys partner rows (`fLinkB0[p] === birthId[s]`), the links survive and linksValid holds;
  - a reused slot with a new birthId is never linked;
  - component walks are deterministic and kind-filtered.
- tests/sim/world-stores.test.ts (14 tests) — DONE:
  - Ledger: moving 1 C + 0.1 N into an object or into the sample keeps checkLedger ok, and deleting it without an export breaks it. A held organism and a held object are also counted.
  - createObject refusals.
  - Round trips: serialize → deserialize and save → load give equal stateHash with stores, links and columns set; a −0 in a held row survives; the payload dtypes are checked.
  - 11 variants each change stateHash to distinct values: fungal link, adhesion link, filmSeconds, anchorState, adhPartner, waterCrossed, noUsableIntakeSeconds, −0 in a Phase 3 column, object, object counter, sample.
  - Every import refusal of (3) is checked by message with parseSaveFile, and loadSaveFile rejects with "Nothing was loaded".
- tests/content/system-requirements.test.ts (6 tests) — DONE:
  - B02 without film names BIOFILM and film; INH_BACT names chemistry; E10 names film; M10 names foodObjects. These use patchedRawPacks with every enabled list patched from G2_LISTS at buildPhase 3, plus `allowUnimplemented: true`, so another builder's in-flight manifest edits cannot change the case.
  - The shipped manifest validates, including B04 digestsFilm without film.
  - The requirement tables are checked.
- FILM_DIGESTION_IMPLEMENTED gone; digestsFilm reads worldHasSystem — DONE.
- Unit regression — DONE (one run, below).
- e2e save-reload on phone-portrait, desktop and phone-landscape — DONE (below). No screens were touched, so no axe, touch-target or text-size work applies.

## How each test was shown to fail without its mechanism

For each check I mutated the source in place, ran the test, and restored the file. All restorations were verified with git diff.

| Mechanism removed | Result |
|---|---|
| −1 fill in the migration | migration 3→4, 2→4 and 1→4 fail (3 failed) |
| hash-neutral rule (every column always hashed) | migration 3→4 (hashAtLoad) and history-debris 'baa42a29186c6c46' fail |
| removeAllLinks in killEntity | links "killEntity removes …" fails |
| removeAllLinks in the capture | links "predation capture …" fails |
| rekeyLinks in commitDivision | links "division re-keys …" fails |
| objects/sample in computeTotals | world-stores: 4 tests fail |
| hashing of stores | world-stores "… each change stateHash" fails |
| BIOFILM → film requirement | system-requirements: 2 tests fail |

## Commands and results

- `npx tsc -p tsconfig.json --noEmit` — clean (after formatting, final).
- `npx eslint <all 21 files I created or touched>` — exit 0.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/sim/links.test.ts tests/sim/world-stores.test.ts tests/content/system-requirements.test.ts tests/persistence tests/sim/history-debris.test.ts tests/fixtures/registry-imports.test.ts tests/fixtures/predation.test.ts tests/fixtures/deterministic-state.test.ts tests/sim/movement-births-tick.test.ts tests/sim/rng-hash.test.ts tests/helpers/trajectory.test.ts tests/helpers/registry.test.ts tests/tools/make-g2-saves.test.ts tests/content/validator.test.ts tests/worker/host.test.ts`
  → `Test Files 25 passed (25) · Tests 177 passed (177) · Duration 1000.47s` (the machine was shared).
- After prettier on my new files only: `npx vitest run tests/sim/links.test.ts tests/sim/world-stores.test.ts tests/content/system-requirements.test.ts tests/persistence/migration.test.ts` → `Test Files 4 passed (4) · Tests 35 passed (35)`.
- `E2E_PORT=4211 E2E_OUTDIR=tmp/dist-foundation npx playwright test tests/e2e/save-reload.spec.ts --project=phone-portrait --project=desktop` → `6 passed (3.6m)`. With `--project=phone-landscape` → `3 passed (58.3s)`. Port 4211 was stopped before and after each run.
- `npx tsx tools/content-validate.ts` → `content ok · contentHash 59d708d2… · … atlas complete`. I changed nothing under content/, so I did not run `--write`. That hash comes from the environment builder's manifest edit.

## Files

- Created: src/sim/links.ts, src/sim/objects.ts, src/sim/sampleSlot.ts, tests/sim/links.test.ts, tests/sim/world-stores.test.ts, tests/content/system-requirements.test.ts, docs/reports/reviews/g3-wave-1/foundation-build.md.
- Changed (owned): src/sim/entities.ts, src/sim/world.ts, src/sim/serialize.ts, src/sim/ledger.ts, tests/persistence/migration.test.ts, tests/sim/history-debris.test.ts.
- Changed (SHARED, additive):
  - src/sim/content/registry.ts: the system checks plus 3 exports;
  - src/sim/content/implemented.ts: the constant removed;
  - src/worker/snapshot.ts: the import and the digestsFilm line;
  - src/sim/maintenance.ts, src/sim/contacts.ts and src/sim/births.ts: one import and one call each;
  - src/persistence/saveFile.ts: the imports, one call and phase3StateProblem;
  - tests/helpers/world.ts: 3 helpers;
  - tests/helpers/trajectory.ts: the sample canon.

## FENCE notes

None. No fence value changed. g2-replay and trajectory-fence pass unchanged, and I did not run fence-update.

## Notes for the lead and other builders

- Wave 2/3 removal paths (lysis, sampling) must call `removeAllLinks(world, i)` before `world.ents.free(i)`, or linksValid fails and the save import refuses the dish as dangling.
- `createObject` and the sample store never touch the ledger: the tool that creates an object from nothing records the external input (SPEC §5.1), and a move does the matching subtraction.
- The sample's in-memory rows are `{slot, cols}` with full columns. `genomes` holds `{index, genome}` copies of the world's genome-table entries the rows refer to (genome, refGenome, propG0, propG1). The import requires each copy to equal the dish's entry.
- prettier --check also flags src/sim/serialize.ts, src/sim/ledger.ts, tests/sim/history-debris.test.ts and tests/persistence/migration.test.ts. HEAD already failed it for all four (prettier is not part of `npm run check`). I formatted only the files I created.
- Bugs noticed elsewhere: none. During the session, tests/sim/lab-commands.test.ts briefly failed tsc (lifeCellOutcome arity) because of another builder's in-flight grid.ts edit. It was resolved by that builder.

## PROPOSED DECISION

- **Link layout: entity columns.** Fungal links use fLink0..3 (i32 slot, −1), fLinkB0..3 (u32 birthId) and fLinkKind0..3 (u8: 1 visual F01, 2 transport F02). Adhesion links use aLink0..1 (i32, −1) and aLinkB0..1 (u32).
  - This is ARCH §5's Int32Array(6000×4) and (6000×2) split by position, with the birthId each reference needs.
  - Columns are saved, migrated, cleared on free, hash-neutral and digested by the existing column code, and they need no extra world tables or canon.
  - Links are stored symmetrically, and positions are filled lowest-free-first.
  - Because the degree limit is structural, the import refuses extra link columns as "more than 4 fungal / 2 adhesion links".
- **`emptyValueOf(name)`** (src/sim/entities.ts) is the single source of a column's empty value: −1 for NEG_ONE_DEFAULT columns (slot and index references, now including the link slots), 0 otherwise. It is used by the store's allocation and free, by the migration's added-column fill and by stateHash's hash-neutral test.
  - **Hash-neutral from `FIRST_HASH_NEUTRAL_COLUMN` (`filmSeconds`) on.** Every later column appended in Phases 5–7 inherits the rule automatically.
- The sample store carries `seq` (D-0037's sampleTake sequence) next to `txId`.
- `counters.nextObjectId` (starting at 1) is hashed only once it has moved.
