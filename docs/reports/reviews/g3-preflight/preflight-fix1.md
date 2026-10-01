# Phase 3 Preflight: fix round 1

- **Worktree:** `/workspaces/pixelmeba/tmp/wt-p3`, branch `p3-preflight` (base `1067637`). All changes are uncommitted; nothing was committed, stashed or reset.
- **Report file:** `/workspaces/pixelmeba/tmp/wt-p3/docs/reports/reviews/g3-preflight/preflight-fix1.md`
- **Result:**
  - Every MAJOR is fixed.
  - Every cheap MINOR is fixed, except the EXP_106 save tick. That one needs a DECISIONS id from the lead; paste-ready text is in §4.
  - I found the same kind of planted failure in two places the verifier did not list: `trajectory.test.ts:21` `MORE_SPECIES` and `gates.test.ts:18` `LATER`. I reproduced both with an on-disk probe and fixed them.
- **Final checks:** `npx tsc -p tsconfig.json --noEmit` exit 0. `npx eslint .` exit 0. The whole unit suite passed: 85 files, 774 tests, 2625 s.
- **Fixtures:** no save or fixture byte changed. The sha256 of all ten `tests/fixtures/saves/*` files and of `tests/fixtures/fence.json` are unchanged (§6).

## 1. Per problem

### MAJOR (a): `tests/helpers/trajectory.test.ts:49` pinned the g2 content hash. FIXED

- **Problem:** `expect(G2.manifest.contentHash).toBe(g2Manifest().contentHash)` holds only while every content pack is byte-identical to g2. Wave 1 adds habitats.
- **Fix:** `trajectory.test.ts:55` now checks that the hash registryWith writes equals the validator's own `computeContentHash` of the patched packs:
  `expect(G2.manifest.contentHash).toBe(await computeContentHash(patchedRawPacks(G2_LISTS)))`
  - This holds whatever the packs contain.
  - The "packs unchanged since g2" check stays in `tools/make-g2-saves.ts` `g2Registry`.
- **Fails on the old code:**
  - Probe `h` adds a new habitat file, `content/habitats/ZZ_PROBE_HABITAT.json`, as wave 1 will.
  - The old test file then fails (`tmp/fix1/old-probe-h.log`): `expected '235d29538ced…' to be 'e88b629838a7…'`, `Tests 1 failed | 9 passed (10)`.
  - The new file passes under the same probe.

### MAJOR (b): `trajectory.test.ts:62–66` pinned that E04 is not implemented. FIXED

- **Why the suggested fix was not enough:** the verifier suggested a Phase 5 module at `buildPhase 5`. Any `G2_LISTS` patch validated above build phase 2 still breaks.
  - At that build phase, every recipe, card and variant of that phase must use only the patched lists (`validateContent`'s shipped-recipe and variant checks, `experimentProblems`).
  - So wave 3's `SHARED_LUNCH_V1` or `EXP_201…` would break it, and a Phase 5 subject breaks again in Phase 5.
- **Fix:** the test moved to a new file, `tests/helpers/registry.test.ts`.
  - The file mocks `src/sim/content/implemented.ts` (`:17`) with fixed lists: the g2 lists minus `E_STARCH_SECRETION` and `E05`.
  - The g2 content set at build phase 2 stays valid for good. Under these lists it has exactly one unimplemented ability (B06's) and one unimplemented module (E05).
- **The four tests:**
  - `:28` the mock is in force.
  - `:33` the option is off by default: exactly 2 errors (B06.json `nativeAbilities`, manifest `enabledModules.2`), and `registryWith(G2_LISTS)` throws.
  - `:43` `allowUnimplemented` waives exactly those two.
  - `:50` it never waives the phase rule or the sorted-list rule.
- **Fails on the old code:**
  - Probe `i` marks `E04` and `SHELL` implemented.
  - The old file then fails (`tmp/fix1/old-probe-i.log`): `expected [] to include 'enabled species uses "SHELL"…'`.

### NEW MAJOR, same class (not in the verification): `trajectory.test.ts:21` `MORE_SPECIES` and `tests/sim/gates.test.ts:18` `LATER`. FIXED

- **Problem:** both are module-level registries that validated the g2 lists at build phase 5 and 3.
  - They throw at import time as soon as any phase-3 recipe, card or variant ships. That fails the whole file.
  - Wave 3 adds `SHARED_LUNCH_V1` (g3-plan.md:410).
- **Repro:**
  - Probe `r` adds a phase-3 recipe `content/recipes/ZZ_PROBE_V1.json` founding Y02 and enables Y02. The shipped registry stays valid.
  - Both old files then fail at import (`tmp/fix1/old-probe-all.log`): `Test Files 2 failed (2)`, `Tests no tests`.
  - The error: `content/recipes/ZZ_PROBE_V1.json → founders.0.species: "Y02" is not enabled in this build`, at `trajectory.test.ts:21:22` and `gates.test.ts:18:15`.
- **Fix:** `tests/helpers/registry.ts:152` adds `withEnabled(base, {species, modules, systems})`.
  - It returns an unvalidated copy whose manifest also enables the given ids, sorted and without duplicates. Unknown ids throw.
  - It is meant for tests whose subject is not validation.
  - Used at `trajectory.test.ts:26` and `gates.test.ts:20`.
  - New test `trajectory.test.ts:67` covers it.
  - The rule is written down in `registry.ts:21` and in the wave PRE text.
- **Related hardening in the same file:**
  - The post-g2 field test (`:151`) now plants a zero-filled field of a later system on a g2 world, instead of realizing the dish under `G2_LISTS` plus the chemistry system.
  - The store/counter/settings test (`:173`) now uses names no wave will add (`zzTestStore`, `zzTestCounter`, `zzTestSetting`).

### MAJOR (inherited): `npx eslint .` exited 1 on `tools/deploy-arcade.mjs:29`. FIXED

- **Fix:** one JSDoc line above the `git` helper: `/** @param {string} cwd @param {...string} a */`. The code is unchanged.
- **Result:** `npx eslint .` exits 0.

### MINOR: flaky timeouts under load. FIXED

- **Fix:** explicit 600 s timeouts. No test changed its work or its assertions.
  - `tests/experiments/exp-b-grazer.test.ts:41–44`
  - `tests/sim/comparison.test.ts:170` (was 60 s)
  - `tests/sim/comparison.test.ts:425` (was 60 s; same cost class)

### MINOR: `make-g2-saves --force` was a second writer of `expected.json`. FIXED (stricter than suggested)

- **Change in `tools/make-g2-saves.ts`:**
  - `writeRefusal` (`:247`) allows writing only when `content/manifest.json` is the g2 manifest (buildPhase 2, contentVersion 1).
  - Past g2, `--force` exits 2 before anything is built (`:305`).
  - A plain run only verifies (`:336`, `:340`). It prints `unchanged`, `DIFFERS` or `MISSING`, writes nothing (not even a missing file), and exits 0 only when every file is byte-identical.
- **Test:** `tests/tools/make-g2-saves.test.ts`.
  - `:21` the refusal rule.
  - `:34` spawns the tool with `--force`: exit 2, the reason on stderr, nothing built, all fixture sha256 unchanged.
- **Old behaviour:** the old tool run with `--force` in this tree started building the saves (`tmp/fix1/old-force.log`). It was killed after 40 s.

### MINOR: `fence-update --g2` accepted any decision that mentioned a version field. FIXED

- **New rule in `tools/fence-update.ts`:** a `--g2` re-record needs a decision that does two things.
  1. States a bump in the form "<field> N → M" (`statedBumps`, `:107`). The bump must have landed: `content/manifest.json` holds M, and M is above the g2 value.
  2. Names `g2Digest` or `fence-update --g2` (`g2DecisionProblem`, `:129`).
- **Why both are needed:** rule 1 alone would still accept D-0036.
- **Trail:** a `--g2` re-record that changes values appends `{decision, saves}` to a `changedBy` list in `expected.json` (`recordG2Expected`, `:147`).
  - The key is written only when the list is not empty (`tests/helpers/g2-saves.ts:80–91`), so the committed file keeps its bytes.
- **Tests:** `tests/tools/fence-update.test.ts`.
  - `:54–:93` bump parsing, acceptance, and the refusals for the D-0038 and D-0036 shapes.
  - `:101–:111` the trail.
  - `:148` end-to-end: `--g2 --reason D-0038` and `--g2 --reason D-0036` now exit 2 with nothing written. The old check accepted both.

### MINOR: EXP_106 arm B saved at t300 instead of P-20's t600. NOT FIXED (lead decision)

- **Why no code change:**
  - The deviation is reasoned and verified under `registryWith(G2_LISTS)`:
    - t300: P01 5 alive, hunting 2, holding a meal 2.
    - t600: hunting 2, meal 0.
    - t650: hunting 1, meal 1.
  - This tree can no longer write g2 saves.
  - The DECISIONS id is the lead's to allocate; main is at D-0040.
- **Paste-ready entry:** §4.

### MINOR: `docs/reports/experiments-g2.md` did not mention the move to the g2 lists. FIXED

New §7 at the end of the file says:
- the wave-A goldens run under one `registryWith(G2_LISTS)` registry (contentVersion 1);
- the golden file and its stamps are unchanged;
- stamps made under the shipped manifest record contentVersion 2.

### MINOR: the fence is four files, but the commands ran one. FIXED in this branch; one lead action

- **Checked:** `npx vitest list --filesOnly tests/fixtures/trajectory-fence` lists all four files. The old filter `…/trajectory-fence.test.ts` selects only one.
- **Fix:** both files below now use the filter `tests/fixtures/trajectory-fence` (or name `trajectory-fence*.test.ts`):
  - `docs/agent/g3-runner.workflow.js.txt`: PRE, BEFORE FINISHING, the rules lens. It still parses.
  - `docs/agent/g3-plan.md`: lines 146, 154, 166, 246, 808.
- **Also added to both:** the `G2_LISTS`/`withEnabled` rule in the CONTENT AND MANIFEST paragraph.
- **Lead action:** main-only files (`docs/agent/g3-wave-tasks.workflow.js.txt` and any generated `g3-wave-N.tasks.js.txt`) need the same filter.

## 2. Files

- **Changed (the builder's new files):**
  - `tests/helpers/trajectory.test.ts`
  - `tests/helpers/registry.ts`
  - `tests/helpers/g2-saves.ts`
  - `tests/sim/gates.test.ts`
  - `tools/make-g2-saves.ts`
  - `tools/fence-update.ts`
  - `tests/tools/fence-update.test.ts`
- **Created:**
  - `tests/helpers/registry.test.ts`
  - `tests/tools/make-g2-saves.test.ts`
  - the report
- **Changed (tracked):**
  - `tools/deploy-arcade.mjs`
  - `tests/experiments/exp-b-grazer.test.ts`
  - `tests/sim/comparison.test.ts`
  - `docs/reports/experiments-g2.md`
  - `docs/agent/g3-plan.md`
  - `docs/agent/g3-runner.workflow.js.txt`
- **Not touched:** `src/`, `content/`, the saves, `fence.json`, `docs/DECISIONS.md`.
- **Scratch:** `tmp/fix1/` (git-ignored).

## 3. Rebase notes

- **Main changes since `1067637` that matter here:**
  - `src/sim/lineage.ts`: a display-only `mutModuleName` field (D-0040). Not biology.
  - New `tools/review-g2.mjs`, which falls inside the `eslint .` scope after the rebase.
- **No expected conflicts:** none of the tracked files I edited has changed on main.
- **Rebase check:** run `npx tsx tools/make-g2-saves.ts` with no flag.

## 4. Proposed decisions

- **PROPOSED DECISION (EXP_106 save tick), paste-ready:**
  > `## D-00xx · 2026-10-01 · Phase 3 preflight · The EXP_106 g2 save is taken at 30 s, not 60 s`
  > Context: P-20 asks for EXP_106 arm B "at t 600, with P01 hunting and holding meals". Under registryWith(G2_LISTS): at t600 two hunt and none holds a meal; at t300 five are alive, two hunt and two hold a meal (t650: one and one).
  > Decision: `exp106-arm-b-t300.pixelmeba.gz` is written at t300. make-g2-saves refuses the save unless at least one P01 hunts and at least one holds a meal.
  > Reason: the save must carry P01 hunting and holding meals through load and 1,000 more ticks, and t300 has the most of both.
  > Owner review: no
- **PROPOSED DECISION (g2 fixtures have one writer):**
  - make-g2-saves only verifies once the manifest is past g2, and `--force` is refused.
  - `fence-update --g2` needs a decision that states a landed "<field> N → M" bump and names the g2 re-record.
  - Each re-record leaves a `changedBy` entry in `expected.json`.
- **PROPOSED DECISION (tests on the g2 content set):**
  - Never validate `G2_LISTS` above build phase 2.
  - Tests that are not about validation use `withEnabled`.
  - The `allowUnimplemented` test runs against mocked implemented lists.

## 5. Commands and results (in `/workspaces/pixelmeba/tmp/wt-p3`)

| Command | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | exit 0 (21.0 s) |
| `npx eslint .` | exit 0 (48.6 s) |
| `npx vitest run --reporter=verbose` registry, trajectory, gates, fence-update, make-g2-saves tests | 5 files, 32 tests passed, 40.27 s |
| Old files + probe `h` | `Tests 1 failed \| 9 passed (10)` |
| Old files + probe `i` | `Tests 1 failed \| 9 passed (10)` |
| Old files + probes `h i r` | `Test Files 2 failed (2)`, `Tests no tests` |
| New files + probes `h i r`, plus `tests/fixtures/trajectory-fence.test.ts` | 4 files, 26 tests passed, 123.1 s; probes removed afterwards, sha256 checked |
| `tsx tools/make-g2-saves.ts` (verify) | 10 × `unchanged`, `verified: all 10 g2 fixtures are byte-identical. Nothing was written.`, exit 0, 61.4 s |
| The same with `expected.json` moved away | `MISSING`, `Verify failed … Nothing was written.`, exit 1; file moved back, sha256 OK |
| Old tool with `--force` (`timeout 40`) | no refusal; built 4 saves before the kill (exit 124) |
| Whole unit suite (background, 05:18–06:02 UTC, load 4.5–7.8) | `Test Files 85 passed (85)`, `Tests 774 passed (774)`, Duration 2625.09 s, exit 0 |

Per-file times in that suite run:

| File | Time |
|---|---|
| `g2-replay` | 118.0 s |
| `trajectory-fence` | 83.3 s |
| `trajectory-fence-arms` | 80.1 s |
| `trajectory-fence-current` | 79.8 s |
| `trajectory-fence-current-arms` | 80.4 s |
| `exp-b-grazer` | 79.6 s |
| `comparison` | 42.9 s |

## 6. Saves (unchanged; sha256)

These are identical to the verifier's `committed.sha`.

```
a1adea16d08bb35117c87c0a4e62b1d3e17d180004ab7d9e6c263ff980bf2e24  e03-dormancy-t500.pixelmeba.gz
b7f70c54d5c2665dcd188ae44093e9e21f81643ba41522a60b7a7cb509b59ad4  exp106-arm-b-t300.pixelmeba.gz
9c44b52ba754629650123cc3a668ed4400100e6f8931b216e8faa0f991aac676  expected.json
a660c35d28f3dbc1bda587ae63574973d2235bdea89a4adbd87c01d269833eb3  first-dish-accelerated-varied-t6000.pixelmeba.gz
22660dda226427615fa7049fa72eb6b261202a8d11c4d5d87ea1fa0a5da051e8  first-dish-lab-edits-t1200.pixelmeba.gz
035b280f923f413502e1715b8b0cd7211fba4cb63b785e1a2cf869ae1df2b7fa  first-dish-t3000.pixelmeba.gz
c282f7a8d1bf4758ad54a0fd7ac086611d338fb72f388255bba34086f70838a3  g2-manifest.json
da5124f3da3a16ba1987bc843b266fbc639d0fb5c4ba0508f89945da5e06fdfe  reserve-compare-t600.pixelmeba.gz
a9c4131d49925d2805ccf90241e4138da11c169c03b185138a57c2277451780c  starch-unlock-e01-carriers-t900.pixelmeba.gz
d7ff58d27ca8ad3364ecb61d578c60df7e20d4293926f7a2b2a59f37f178caf5  starch-unlock-t900.pixelmeba.gz
f0c25d51e5547b3099a057c9e6a9763ab5b61cd1138d6ed2bcb8dc372afcd564  tests/fixtures/fence.json
```