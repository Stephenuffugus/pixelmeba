# Phase 3 preflight (determinism fence): build report

All ten items are built in the worktree `/workspaces/pixelmeba/tmp/wt-p3` (branch `p3-preflight`, base `1067637`). Nothing is committed.

Two "done when" checks are not fully green, and neither is caused by this work:
- **Whole unit suite: 761 of 762 passed.** The one failure is a 60 s timeout in a comparison test I did not change. It passes when run alone (details under "Commands and results").
- **`npx eslint .` exits 1.** The only errors are in `tools/deploy-arcade.mjs`, which is unchanged since the base commit. With that file excluded, lint is clean.

Every new rule is covered: the fence passes before and after the manifest bump, the g2 saves replay exactly, and every `currentDigest` equals its `g2Digest`.

I did not write this report to `docs/reports/reviews/g3-preflight/preflight-build.md`, because the harness forbids sub-agents from writing report files. You can save this text there verbatim.

## Checklist

1. **DONE: world gates.**
   - `/workspaces/pixelmeba/tmp/wt-p3/src/sim/gates.ts:18,23,28` adds `worldHasSystem`, `worldHasSpecies` and `worldHasModule`. They read only `world.content.manifest`.
   - Proof: `/workspaces/pixelmeba/tmp/wt-p3/tests/sim/gates.test.ts` (3 tests). A later registry enables B05, film and E04. Three old worlds still answer false for all three: a fresh world under the g2 lists, the same world serialized and reloaded, and a real g2 save loaded through `loadSaveFile`. One test proves the gates read the manifest only.

2. **DONE: trajectory digest.**
   - In `/workspaces/pixelmeba/tmp/wt-p3/tests/helpers/trajectory.ts`:
     - `trajectoryDigest(world, 'g2'|'full')` is at `:350`.
     - The frozen lists `G2_FIELD_IDS` (24) and `G2_ENTITY_COLUMNS` (67) are at `:49` and `:77`.
     - Columns that hold indices are hashed as IDs (`:186`). Lineage and counters are hashed as P-18 specifies.
     - The digest leaves out contentHash, contentVersion, history and events.
     - Post-g2 state is detected at `:276`: fields, columns (against a fresh store's empty value), world stores, grid layers, counters and settings keys.
   - Proof: `/workspaces/pixelmeba/tmp/wt-p3/tests/helpers/trajectory.test.ts` (10 tests):
     - Enabling A02, B05 and Y01 shifts the species indices and changes `stateHash`, but gives the same digest after 600 ticks.
     - The digest changes when one organism's E moves by 1e-9, when one field cell moves by 1e-12, and when one lineage record changes.
     - `'g2'` mode throws on a non-zero `inhBact`. An all-zero chemistry allocation leaves both modes unchanged.
     - A post-g2 store, counter or settings key makes `'g2'` throw, and `'full'` hashes it.

3. **DONE: registryWith and validateContent options.**
   - `/workspaces/pixelmeba/tmp/wt-p3/tests/helpers/registry.ts`:
     - `registryWith` is at `:120`.
     - `G2_LISTS` (`:89`) is read from `g2-manifest.json`, with contentVersion 1 and buildPhase 2.
     - It patches every list, `developmentalEnabled`, `buildPhase` and the four version fields. `simulationVersion` is not patchable.
     - It deep-copies the packs, rewrites the content hash and re-validates.
   - `/workspaces/pixelmeba/tmp/wt-p3/src/sim/content/registry.ts:185-197,340,351` adds `validateContent(raw, opts = {})`. The new `allowUnimplemented` option is off by default.
   - Proof: 3 registry tests in the trajectory test file. `registryWith(G2_LISTS)` reproduces the g2 contentHash exactly. The cached shipped registry is untouched. Phase checks still apply when `allowUnimplemented` is set.

4. **DONE: g2 saves.**
   - `/workspaces/pixelmeba/tmp/wt-p3/tools/make-g2-saves.ts` writes eight saves, `g2-manifest.json` and `expected.json`. Saves go through the real `buildSaveFile`, with a fixed `savedAt` and gzip level 9. The tool checks the gzip header has no file name and a zero timestamp.
   - It writes nothing if any existing file would change, unless `--force`. It builds the worlds from the committed g2 manifest and refuses if the content packs no longer hash to it.
   - The tool was run four times:
     - Run 1 and run 2 (from scratch, before the bump) produced identical sha256 for every file.
     - Run 3 (after the bump) reported all 10 files "unchanged".
     - Run 4 (after a refactor of the tool) also reported all 10 "unchanged".

5. **DONE: g2 replay.** `/workspaces/pixelmeba/tmp/wt-p3/tests/fixtures/g2-replay.test.ts` (9 tests):
   - The state hash at load and the hash and `'g2'` digest after 1,000 ticks must equal `expected.json`.
   - A second independent load must give the same hash.
   - The continued world must round-trip through `buildSaveFile` and `loadSaveFile`.

6. **DONE: trajectory fence.**
   - `/workspaces/pixelmeba/tmp/wt-p3/tests/fixtures/fence.json` has 14 entries.
   - Check (a) is in `/workspaces/pixelmeba/tmp/wt-p3/tests/fixtures/trajectory-fence.test.ts` (recipes, plus a check of which entries exist and their ticks) and `.../trajectory-fence-arms.test.ts` (variants and experiment arms).
   - Check (b) is in `.../trajectory-fence-current.test.ts` (recipes, plus "every file in content/recipes has an entry") and `.../trajectory-fence-current-arms.test.ts`.
   - I split it into four files because the simulation runs about 2.8× slower under vitest than under tsx (see findings).

7. **DONE: fence-update tool.**
   - `/workspaces/pixelmeba/tmp/wt-p3/tools/fence-update.ts` supports `--add`, `--recipe <id>` or `--all` with `--reason D-00xx`, and `--g2 --reason D-00xx`.
   - A reason must be a decision present in DECISIONS.md. `--g2` also requires that decision to name the version it bumps.
   - A refusal exits 2 and writes nothing.
   - Proof: `/workspaces/pixelmeba/tmp/wt-p3/tests/tools/fence-update.test.ts` (7 tests). It checks 12 argument refusals and 10 refusals inside `main`, each leaving `fence.json` and `expected.json` byte-identical. It also checks that `--recipe` never touches `g2Digest`, that `--add` records a current digest only, and that the command-line process exits 2.

8. **DONE: tests made independent of the shipped manifest** (each still checks the same g2 values):

| File | Change |
|---|---|
| `tests/worker/host.test.ts:31` | Compares with the shipped manifest's species list |
| `tests/content/validator.test.ts:64-82` | B02 case becomes B09 / SIGNAL_GLOW; B03 case becomes B10 |
| `tests/experiments/framework.test.ts:112` | P02 becomes P05 |
| `tests/recipes/variants.test.ts:404,421-422` | Build phase read from the registry; `'viruses'` becomes `'developmental'` |
| `tests/sim/modules.test.ts:49-54` | buildPhase 2 read from `registryWith(G2_LISTS)` |
| `tests/sim/lab-commands.test.ts:904` | Build phase read from the packs |
| `tests/sim/lab-commands.test.ts:1009` | `gardenInfo` uses `new FakeClockHost(registryWith(G2_LISTS))`; the optional registry parameter is in `tests/helpers/host.ts:24` |
| `tests/experiments/helpers.ts:27,51-58,69,102,111,125` | One shared `g2Registry()` for every card run |
| `tests/sim/comparison.test.ts:410-420` | The three wave A comparison worlds are realized under the g2 lists |

   `wave-a-measurements.json` was not touched.

9. **DONE: manifest bump.**
   - `/workspaces/pixelmeba/tmp/wt-p3/content/manifest.json` now has buildPhase 3, contentVersion 2 and contentHash `adc910dcd970d3f4393f3c5e4d8e87afa4203e820d72614dfe448b6dab88650c`. Nothing else changed.
   - `tsx tools/content-validate.ts` reports "content ok", atlas complete.
   - After the bump, check (a) still passes and `fence-update --all --reason D-0036` reported all 14 entries "unchanged · currentDigest = g2Digest".

10. **DONE: perf baseline.** `/workspaces/pixelmeba/tmp/wt-p3/docs/reports/perf-g3.md` has a "Baseline at g2" section quoting `tune-g2.md` lines 997–1009, which g2-close measured. It also notes that endpoint stateHashes change with the contentVersion bump.

## Files

- **Created:**
  - `src/sim/gates.ts`
  - `tests/helpers/registry.ts`, `tests/helpers/trajectory.ts`, `tests/helpers/trajectory.test.ts`, `tests/helpers/g2-saves.ts`, `tests/helpers/fence.ts`
  - `tools/make-g2-saves.ts`, `tools/fence-update.ts`
  - `tests/sim/gates.test.ts`, `tests/fixtures/g2-replay.test.ts`, the four `tests/fixtures/trajectory-fence*.test.ts`, `tests/tools/fence-update.test.ts`
  - `tests/fixtures/fence.json`, `tests/fixtures/saves/*` (10 files)
  - `docs/reports/perf-g3.md`
- **Changed:** `content/manifest.json`, `src/sim/content/registry.ts`, `tests/helpers/host.ts`, and the eight test files in item 8. That is 11 tracked files, +82 / −33 lines.

All paths are under `/workspaces/pixelmeba/tmp/wt-p3/`.

## Commands and results

`npx` and the shell's `grep` stopped working at 01:37 when the global claude-code package was reinstalled. From then on I ran the same local binaries directly from `./node_modules/.bin/`.

- **Typecheck:** `tsc -p tsconfig.json --noEmit` → exit 0, after the final edits.
- **Lint:**
  - `eslint .` → exit 1. The only errors are `tools/deploy-arcade.mjs:29:58` and `:29:67` (no-unsafe-assignment), in a file unchanged since `5de12ff`, before this branch.
  - `eslint . --ignore-pattern tools/deploy-arcade.mjs` → exit 0.
- **Targeted tests, one file at a time, after the bump (load average 5–7.7 on 2 CPUs):** 8 files, 60 tests, all passed.

| File | Tests | Wall | CPU (user) |
|---|---:|---:|---:|
| `trajectory-fence` | 9 | 65.5 s | 50.0 s |
| `trajectory-fence-arms` | 7 | 67.6 s | 49.1 s |
| `trajectory-fence-current` | 9 | 107.3 s | 50.2 s |
| `trajectory-fence-current-arms` | 6 | 85.9 s | 48.6 s |
| `g2-replay` | 9 | 144.6 s | 67.0 s |
| `gates` | 3 | 5.1 s | 2.6 s |
| `trajectory` (helper tests) | 10 | 57.7 s | 22.7 s |
| `fence-update` | 7 | 33.3 s | 13.5 s |

  CPU time is the best stand-in for wall time on an idle machine here, so each fence file should take under about 50 s idle. The same four tests also passed before the bump: 45 tests, 11 minutes wall with all files in parallel.
- **Planted error:** a throwaway test added 1e-9 to E on the first organism of `first-dish-t3000` and then ran 1,000 ticks. It failed as it should, and I deleted it:
  ```
  AssertionError: expected '43d5bf7888f46592' to be '5730917ce3ec53f6' // Object.is equality
   ❯ tests/fixtures/zz-throwaway-perturb.test.ts:17:43
  ```
- **Whole unit suite** (`vitest run`, load 7–11): 83 files, 762 tests. **761 passed, 1 failed.** Duration 4,780 s; CPU 28 min 20 s.
  - The failure is `tests/sim/comparison.test.ts > advances A and B by exactly equal tick counts whatever the wall clock does`: "Test timed out in 60000ms" (it took 72.6 s while running in parallel).
  - I did not change that test. Re-run alone, it passed in 42.6 s (25.8 s CPU).
  - The other 8 tests in that file passed, including the wave A comparison test that now uses the g2 lists.

## Saves (sha256, identical in all four tool runs)

| File | Bytes | sha256 |
|---|---:|---|
| `g2-manifest.json` | 725 | c282f7a8d1bf4758ad54a0fd7ac086611d338fb72f388255bba34086f70838a3 |
| `first-dish-t3000` | 550,548 | 035b280f923f413502e1715b8b0cd7211fba4cb63b785e1a2cf869ae1df2b7fa |
| `starch-unlock-t900` | 424,137 | d7ff58d27ca8ad3364ecb61d578c60df7e20d4293926f7a2b2a59f37f178caf5 |
| `starch-unlock-e01-carriers-t900` | 423,346 | a9c4131d49925d2805ccf90241e4138da11c169c03b185138a57c2277451780c |
| `reserve-compare-t600` | 392,694 | da5124f3da3a16ba1987bc843b266fbc639d0fb5c4ba0508f89945da5e06fdfe |
| `first-dish-accelerated-varied-t6000` | 636,037 | a660c35d28f3dbc1bda587ae63574973d2235bdea89a4adbd87c01d269833eb3 |
| `exp106-arm-b-t300` | 332,484 | b7f70c54d5c2665dcd188ae44093e9e21f81643ba41522a60b7a7cb509b59ad4 |
| `first-dish-lab-edits-t1200` | 459,348 | 22660dda226427615fa7049fa72eb6b261202a8d11c4d5d87ea1fa0a5da051e8 |
| `e03-dormancy-t500` | 140,149 | a1adea16d08bb35117c87c0a4e62b1d3e17d180004ab7d9e6c263ff980bf2e24 |
| `expected.json` | 1,722 | 9c44b52ba754629650123cc3a668ed4400100e6f8931b216e8faa0f991aac676 |

The `.pixelmeba.gz` suffix is omitted from the save names in this table. The eight saves total 3.3 MB of gzipped fixtures.

## Fence entries

`g2Digest` equals `currentDigest` for every entry, and `changedBy` is empty everywhere. Times are from the final run (check a / check b).

| Entry | Ticks | Digest | Time (a / b) |
|---|---:|---|---|
| CLEANING_CREW_V1 | 1200 | fe6811d8b1d15c1e | 6.3 / 6.3 s |
| FIRST_DISH_V1 | 1200 | d239a74834432569 | 9.2 / 10.2 s |
| FOOD_TRAIL_V1 | 1200 | cdee38c8f99c59fb | 6.6 / 13.6 s |
| LIGHT_AND_LIFE_V1 | 1200 | 1baf2031c7ef9446 | 5.9 / 12.1 s |
| PREDATOR_BALANCE_V1 | 1200 | 2e948c7d70aff634 | 8.2 / 15.2 s |
| RESERVE_COMPARE_V1 | 1200 | 158effd1d6af2d0e | 6.7 / 14.2 s |
| STARCH_UNLOCK_V1 | 1200 | aea5ac258a76932b | 8.7 / 15.9 s |
| STARCH_UNLOCK_V1+E01 | 1200 | da6b2cdd897f3f35 | 11.3 / 16.9 s |
| R-G1 | 1200 | c81e848f7f7e473b | 12.5 / 17.9 s |
| R-G2 | 1200 | 6c848a77d1b2291a | 9.9 / 10.1 s |
| R-G3 | 1200 | dc005e7482cbe7ae | 9.2 / 9.8 s |
| EXP_102:B | 1200 | 71243b58a813fc60 | 6.3 / 5.8 s |
| EXP_106:B | 1200 | ff6ad77181041eea | 9.1 / 9.1 s |
| EXP_B:B | 1800 | 38baac85155444f5 | 16.0 / 26.7 s |

There are no FENCE notes: nothing in this work changed a fence value.

## Findings elsewhere

- `npx eslint .`, and so `npm run check`, is red at the base commit because of `tools/deploy-arcade.mjs:29`.
- Simulation code runs about 2.8× slower under vitest than under tsx. FIRST_DISH_V1 for 1,200 ticks took 8.1–8.2 s of CPU under vitest against 2.9–3.1 s under tsx, measured twice. This likely comes from how vitest rewrites imports. Changing vitest's configuration could cut the whole suite's time substantially; that belongs in a separate change.
- The comparison test with an explicit 60 s timeout (`tests/sim/comparison.test.ts:170`) times out under parallel load.
- `tests/worker/host.test.ts` is also in g2-close's area, so a small rebase conflict on line 31 is possible.

## Proposed decisions

PROPOSED DECISION: The EXP_106 arm B save is at tick 300, not the plan's 600. At tick 600 no Amoeba holds a meal (2 hunting, 0 with a meal). At tick 300, two hold meals and two are hunting, and its 1,000-tick replay also covers the hunting episode around ticks 640–680.

PROPOSED DECISION: The fence is four files, split by check (a or b) and by group (recipes, or variants and arms). The wave instructions should name `tests/fixtures/trajectory-fence*.test.ts` rather than `trajectory-fence.test.ts`.

PROPOSED DECISION: `registryWith` writes the content hash of the patched packs, so `registryWith(G2_LISTS)` reproduces the g2 contentHash while Phase 2 packs are unchanged. `allowUnimplemented` waives both the native-ability and the module "implemented" checks (wave 4 needs the second before its flip), never the phase checks.

PROPOSED DECISION: Saves record the provenance the app would record. Recipe dishes use `createdFrom 'recipe'` with `overrides` (empty, or Accelerated + Varied), and the EXP_106 arm keeps its experiment provenance. The two hand-built worlds (E01 carriers, and the E03 Resting/Waking/Preparing world) use `createdFrom 'test'` with recipeId null.

PROPOSED DECISION: Rerun `make-g2-saves` after rebasing onto the g2 tag. It reads the committed g2 manifest, so a byte-identical tree reports 10 × "unchanged"; any difference is refused unless `--force`. The first fence recording used `fence-update --g2 --reason D-0036` and then `--all --reason D-0036`.

PROPOSED DECISION: The wave 1 foundation must register its schema-4 additions in `tests/helpers/trajectory.ts`:
- columns that hold a species, genome or module index in `POST_G2_COLUMN_KINDS`;
- stores with species or slot references (for example the sample store) in `POST_G2_STORE_CANON`;
- derived caches in `POST_G2_DERIVED_KEYS`;
- new settings defaults in `POST_G2_SETTINGS_DEFAULTS`.

The post-g2 column check cannot be unit-tested until a schema-4 column exists. g2-replay pins the exact hashes, so it relies on the hash-neutral stateHash that D-0035 chose.

PROPOSED DECISION: Raise that comparison test's explicit 60 s timeout to the global 120 s, or fix `deploy-arcade.mjs`, so `npm run check` is green under load. Both are your call; I did not touch either.