# Saves/determinism verification — P4.6 Share (wave g4-wave-6a)

Verifier: saves-verify-share (the saves and determinism lens only). Probes are in `tmp/verify-saves-0/share-probe.test.ts`, run with `npx vitest run --config tmp/verify-saves-0/vitest.config.ts` (8/8 passed, about 210 s). No tracked file was edited.

Verdict: **ok**. There are no BLOCKER or MAJOR findings.

## Problems (most severe first)

- **MINOR [share]** `src/ui/state.ts:497` (importFile catch), with `src/ui/state.ts:219-220`.
  - **What is wrong:** a refused recipe-file import shows two toasts in a row. The first is the global worker-error toast, "Import failed; nothing changed: …". It is then replaced by "Nothing was changed: This recipe needs a compatible build (…)." The wording differs from the save import's own refusals, which end "Nothing was loaded.", and from UX §5.11 ("Import failed: exact reason; nothing changed"). The player sees two different phrasings for one refusal.
  - **Repro:** choose a recipe file with `versions.contentVersion` edited and the checksum resealed in Saved dishes → Choose a file…; watch the toast.
  - **Note:** the double toast is pre-existing for save imports (the builder noted it). Only the recipe wording is new.
- **NIT [share]** `src/worker/host.ts:554-578` (recipeExport).
  - **What is wrong:** only a RecipeFileError is turned into a quiet refusal. Any other throw while building the file reaches handleAsync's generic catch (`host.ts:735-744`). Because the message carries `dishId`, that catch sets `failed = true` and `speed = 0` on the open dish, even though the export is read-only.
  - **Current reach:** realizeRecipe/realizeVariant throw only RecipeError or VariantError, and both are caught, so this cannot happen today. It is the same pattern `exportDish` already has.
  - **Repro:** none with shipped content.
- **NIT [share]** `src/persistence/recipeFile.ts:535`.
  - **What is wrong:** the size check uses `text.length` (UTF-16 code units), not bytes. This matches `saveFile.ts:270`, so it is consistent, but a multi-byte file of up to about 2× 25 MB can pass.
  - **Repro:** a recipe file padded with 13 M two-byte characters.
- **NIT [share]** `src/ui/state.ts:506` and `src/persistence/recipeFile.ts:591`.
  - **What is wrong:** there are two copies of `isRecipeFileText`, and the UI uses the state.ts copy. If one copy drifts, `importFile` could send a recipe file down the save path or the other way round. Either path still refuses safely.
  - **Repro:** none.

## Verified OK

- **VERIFIED OK — the recipe file reproduces the start.**
  - Test: `tests/persistence/share.test.ts` round trips.
  - Starts covered: FIRST_DISH_V1; R-G3; a New Dish with seed 7, accelerated, varied; and a New Dish with seed 4294967295, Empty, GEL_COLONY.
  - Result: the imported world's stateHash equals `initialStateHash`, and its whole serialized world (worldId aside) equals a direct 'create' or realizeVariant.
  - Run in this session: 5 files, 31 tests passed, exit 0.
- **VERIFIED OK — Import recipe ID starts the same dish as the existing start paths.**
  - Probe P1: `recipeIdStart "R-G3 / rev 1 / seed 104729"` gives a world identical to `whatIfStart` on R-G3.
  - Probe P2: `"FIRST_DISH_V1 / revision 1 / seed 104729"` gives a world identical to 'create'. With seed 7 it is identical to `create {seed: 7}`, still equal after 400 ticks, and the identifier round-trips through recipeExport.
- **VERIFIED OK — scheduled commands survive a recipe round trip; 1× equals 4×.**
  - Probe P3 uses RESERVE_COMPARE_V1 at seed 99, which has 5 scheduled deposits pending at tick 0.
  - The imported world has the same 5 pending commands.
  - After 1300 ticks, four quarter runs of 325 on the import give the same stateHash as `run(original, 1300)`.
- **VERIFIED OK — Living dish export at awkward moments.**
  - Probe P4 exports through the host `exportDish` at ticks 599, 600 and 601, either side of the 60 s scheduled deposit (targetTick 600).
  - Each full file loads with stateHash equal to the live world, then reaches the uninterrupted reference hash at tick 1300.
  - Each stripped file continues to equal the stripped reference at tick 1300.
  - Unit evidence: `share.test.ts` "strip names and notes", which includes 600 more ticks.
  - E2E evidence (the builder's run): a Living dish exported mid-run while the sheet holds the dish paused imports back with the same worker hash.
- **VERIFIED OK — old saves without a recorded start.**
  - Probe P5: an older save of the authored Garden that has no `overrides` record exports a recipe file (`legacyAuthored`). Its import equals the old save after 600 ticks.
  - Provenance is not part of stateHash (`src/sim/serialize.ts:244-283`), so the file's `overrides: {}` against the save's missing record is neutral.
- **VERIFIED OK — recorded starts survive save and load.**
  - Probe P6: a recipe-imported dish, saved as a Living dish and imported again, re-exports a recipe file with an identical checksum.
  - A stripped Living dish keeps its recorded start, and recipeExport still answers.
- **VERIFIED OK — canonical, order-independent checksum.**
  - Probe P7: a recipe file with its keys reversed and pretty-printed still imports, because the checksum is `canonicalJson`.
  - Two exports of the same dish give byte-identical text.
- **VERIFIED OK — refusals change nothing.**
  - Probe P8: recipeExport, a refused recipeImport, a recipeIdStart at another revision and one with another seed leave the open dish's whole serialized world unchanged, and create no dish.
  - `share.test.ts` covers 15 refusal cases. Each leaves the same active dish and stateHash, and the store list stays empty.
- **VERIFIED OK — the content hash is enforced.**
  - `recipeFileProblem` does not compare `versions.contentHash` directly.
  - stateHash hashes `manifest.contentHash` (`serialize.ts:248`), so the `initialStateHash` comparison (`recipeFile.ts:586`) refuses any build with other content. That is PROPOSED DECISION 3 as the builder states it.
- **VERIFIED OK — the file cannot steer what is built.**
  - Import realizes from this build's own registry (`realizeRecipeSource`).
  - The file's recipe, habitat, modules and source are compared with the realization, never used as input.
  - Unknown fields, non-finite values and out-of-range seeds are refused before realization.
- **VERIFIED OK — no new saved state.**
  - P4.6 adds nothing to the world, the save file or storage: `saveFile.ts` is unchanged, and no new localStorage or IndexedDB key appears in share.ts, ShareSheet.tsx or RecipeIdImport.tsx.
  - World schema, versions and hash coverage are unchanged.
- **VERIFIED OK — nothing outside src/sim draws simulation randomness.**
  - `src/render/picture.ts` imports only `@sim/constants` and the renderer's pure `cosmetic` hash and colour tables.
  - share.ts, ShareSheet.tsx and recipeId.ts draw no randomness and do not use Date or Math.random.
  - Picture input is a slice-copy of the last published snapshot (`share.ts:143-161`).
- **VERIFIED OK — pausing for the sheet does not change the world.**
  - `setSpeed` (`host.ts:785-797`) changes only `d.speed` and `d.acc`, so pausing for the sheet and restoring the speed leaves the world untouched.
  - The e2e "open and cancel" check compares worker hashes.
- **VERIFIED OK — g2 saves and determinism.**
  - `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/determinism.test.ts tests/persistence/share.test.ts tests/persistence/strip-names.test.ts tests/render/picture.test.ts` → Test Files 5 passed (5), Tests 31 passed (31), exit 0.
