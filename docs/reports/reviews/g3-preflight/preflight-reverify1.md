# Phase 3 Preflight: re-verification after fix round 1

Lens: rules, determinism and test strength. Date: 2026-10-01, 06:04–07:20 UTC.

- **Worktree:** `/workspaces/pixelmeba/tmp/wt-p3`, branch `p3-preflight` (base `1067637`), the uncommitted tree as fix round 1 left it.
- **Read-only.** The only file I wrote is this report. Scratch is in `tmp/reverify1-preflight/` (git-ignored, outside the tsc, eslint and vitest globs). Mutants and probes ran in throwaway copies of the tree under that folder, deleted afterwards. Their diffs are kept as `mutants-mut.patch`, `mutants-mutcol.patch` and `probe-content.patch`.
- **After every run**, `git status` is the same as before, and the sha256 of all ten `tests/fixtures/saves/*` files, `tests/fixtures/fence.json` and `content/manifest.json` are unchanged (`before.sha`, 12/12 OK).
- **Load:** 2 CPUs, load average 5–9 the whole time (Playwright in the main checkout, plus my own jobs). Every timing below is inflated.

**Verdict: ok.** No BLOCKER or MAJOR remains.

- Every round-1 MAJOR is fixed, and I could not break any of the fixes.
- Two round-1 MINORs remain:
  - one only partly fixed: the `--g2` decision check;
  - one open for a lead decision: the EXP_106 save tick.
- I found two new MINORs, both about guidance and robustness for later waves.

## 1. Remaining and new problems

### MINOR 1: `--g2` accepts a decision that restates a bump that already landed

This is what remains of round-1's version-bump MINOR.

- **Where:** `tools/fence-update.ts:129–141` (`g2DecisionProblem`, the test at `:133`).
- **What the check does:** a bump "has landed" when `content/manifest.json` holds M and M is above the **g2** manifest's value.
- **Why that is too weak:** the Preflight's own bump, contentVersion 1 → 2 (D-0036), already meets that test. So any future decision that quotes it, and names `g2Digest`, passes condition (1) without bumping anything.
- **Effect:** P-23 says the decision "must say which rules or content version it bumps". The tool no longer enforces a *new* bump.
- **Repro 1:** `npx tsx tmp/reverify1-preflight/restated-bump.ts` prints `null` (accepted) for this decision:
  > ## D-0099 … Decision: as D-0036 already set contentVersion 1 → 2, this re-records every g2Digest (fence-update --g2).
- **Repro 2, end to end:** in a probe copy, `npx tsx tools/fence-update.ts --g2 --reason D-0099 --decisions DECISIONS-probe.md` exited 0 and re-recorded (`probe-g2.log`).
- **Suggested fix:**
  - Record the version stamps in force at each g2 record, e.g. a `versions` object in expected.json. Initialise it to this commit's shipped stamps (evolutionRulesVersion 1, moduleRegistryVersion 1, phenotypeMappingVersion 1, contentVersion 2).
  - Require `shipped[field] === M` and `M > recorded[field]`.
  - Write the new stamps with each `--g2`.

### MINOR 2: EXP_106 arm B is saved at t300, not P-20's t600

This round-1 MINOR is still open and needs a lead decision.

- **Where:** `tools/make-g2-saves.ts:195–211`.
- **Re-measured under `registryWith(G2_LISTS)`** with `tmp/reverify1-preflight/exp106.ts`:

  | Tick | P01 alive | Hunting | Holding a meal |
  |---|---|---|---|
  | t300 | 5 | 2 | 2 |
  | t600 | 5 | 2 | 0 |
  | t650 | 5 | 1 | 1 |

  The nearest ticks after 600 with at least one P01 hunting and one holding a meal are 634–670 (26 ticks).
- **The save does exercise predation:**
  - Over its +1,000 ticks there are 4 captures.
  - A capture-amount mutant (see §3) changes both its hash and its digest.
- **Action:** t300 is a reasoned choice. It needs a DECISIONS id; the paste-ready text is in `preflight-fix1.md` §4.

### MINOR 3 (new): builders are never told about the post-g2 registration tables

- **Where:** `tests/helpers/trajectory.ts:34–36` and `:197–203`.
- **The tables:**
  - `POST_G2_SETTINGS_DEFAULTS`
  - `POST_G2_COLUMN_KINDS`
  - `POST_G2_STORE_CANON`
  - `POST_G2_DERIVED_KEYS`
- **Where it should be said, but is not:**
  - PRE (`docs/agent/g3-plan.md:146/148`, `docs/agent/g3-runner.workflow.js.txt:22/24`) never mentions them.
  - Nothing names `tests/helpers/trajectory.ts` as SHARED for them.
  - The `'g2'` error (`trajectory.ts:354`) does not point to them.
- **What happens in practice:**
  - New counters, stores, grid layers and columns are compared with fresh-world or empty values automatically. Those cases are fine.
  - A new **WorldSettings key** that a fresh world carries with a defined value makes every check (a) entry throw `PostG2StateError` until its default is registered. D-0035 anticipates "a new counter or settings key".
  - The same holds for a derived cache added as a world property.
  - Index-valued post-g2 columns and store records need registering, or the `'full'` digest becomes species-order dependent.
  - The builder who hits this does not own the file. They can only report "FENCE".
- **Repro:** the `zzTestSetting` case at `tests/helpers/trajectory.test.ts:175` throws `… holds post-g2 state: settings key zzTestSetting = 0.5`.
- **Suggested fix:**
  - One PRE sentence: post-g2 state that a fresh world carries, or that holds species, module or slot references, is registered additively in those tables.
  - A hint in the error message naming `POST_G2_SETTINGS_DEFAULTS` / `POST_G2_DERIVED_KEYS`.

### MINOR 4 (new): `withEnabled`'s own rule is broken by `MORE_SPECIES`

- **The rule** (`tests/helpers/registry.ts:149–150`): "Never step a world through an enabled species or module the simulation does not implement."
- **The test that breaks it:** `tests/helpers/trajectory.test.ts:26` and `:105–116` run FIRST_DISH_V1 for 600 ticks under `MORE_SPECIES`. That registry enables A02, whose native ability SHELL is Phase 5 and unimplemented.
- **Today:** harmless. No A02 organism exists and the digests match.
- **Later:** it would break if a later stage built per-enabled-species ability handlers and refused unimplemented ones.
- **Why A02:** only an A-species can shift B01's index, and all of them have abilities.
- **Suggested fix:** reword the rule to "never place organisms of …", or note the exception in the test.

## 2. Round-1 problems

- **VERIFIED OK — MAJOR (a), content-hash pin in `trajectory.test.ts`.**
  - `:55` now compares `G2.manifest.contentHash` with `computeContentHash(patchedRawPacks(G2_LISTS))`.
  - I built a later-content probe: a new habitat, a phase-3 recipe founding Y02, a phase-3 card and variant, and B05, Y02 and film enabled in the shipped manifest. The shipped registry and `registryWith(G2_LISTS)` both validate.
  - On that probe, these all pass: `trajectory.test.ts`, `registry.test.ts`, `gates.test.ts`, `make-g2-saves.test.ts`, check (a) recipes, check (b) recipe entries, `tests/worker/host.test.ts`, `tests/sim/modules.test.ts` and the `food-trail` golden. That is 8 of 9 files and 52 tests (`probe-run.log`).
  - The one failure is the intended "every recipe in content/recipes has a plain entry" check for the new recipe. After `fence-update --add ZZ_PROBE_V1` it passes.
- **VERIFIED OK — MAJOR (b), E04 pin.**
  - `tests/helpers/registry.test.ts` mocks `implemented.ts` and asserts both directions:
    - default off: exactly the B06 ability error and the `enabledModules.2` (E05) error;
    - the waiver: none.
  - If the option were ignored, `:43` would fail. If it were on by default, `:33` would fail.
  - It still passes on the later-content probe.
- **VERIFIED OK — the same class, `MORE_SPECIES` (`trajectory.test.ts:26`) and `LATER` (`gates.test.ts:20`).** Both are now built with `withEnabled`. Both files pass on the probe, which ships a phase-3 recipe, card and variant.
- **VERIFIED OK — `npx eslint .` exited 1.** It now exits 0 (2 min 4 s).
- **VERIFIED OK — flaky timeouts.**
  - `exp-b-grazer.test.ts:41–44`, `comparison.test.ts:170` and `:425` have 600 s timeouts. No assertion changed.
  - In my whole-suite run they took 105.4 s and 143.1 s for the file.
  - The slowest single test, `determinism.test.ts` "two fresh runs" at 172.8 s, has a 600 s timeout.
  - `exp-c-reserve` "replays identically" at 116.4 s has 900 s.
- **VERIFIED OK — `make-g2-saves --force` was a second writer.**
  - `writeRefusal` at `:247`; the refusal comes before anything is built (`:305`); the verify-only path writes nothing (`:340–348`).
  - `make-g2-saves.test.ts` passes: exit 2, no `built` line, fixtures unchanged.
  - Two plain runs printed 10 × `unchanged` with identical sha256.
- **PARTLY FIXED — `fence-update --g2` accepted any decision that mentioned a version field.**
  - Fixed: mention-only decisions (the D-0038 shape) are refused, and so is D-0036 as written, which does not name the re-record. Both are tested.
  - Still open: a decision that restates an already-landed bump passes. That is MINOR 1.
- **OPEN (lead) — EXP_106 tick.** That is MINOR 2.
- **VERIFIED OK — `docs/reports/experiments-g2.md`.** The new §7 says the wave-A goldens run under one `registryWith(G2_LISTS)` registry with contentVersion 1, and that stamps made under the shipped manifest record contentVersion 2.
- **VERIFIED OK — the fence is four files.**
  - `npx vitest list --filesOnly tests/fixtures/trajectory-fence` lists all four. The old `…/trajectory-fence.test.ts` filter lists one.
  - The branch's `g3-plan.md` and `g3-runner.workflow.js.txt` use the new filter. The runner still parses: wrapped in an async function, `node --check` passes, before and after the edit.
  - Lead action on main: `docs/agent/g3-wave-tasks.workflow.js.txt:25` still says the Preflight created "tests/fixtures/{g2-replay,trajectory-fence}.test.ts". The wave files it generates must use the filter `tests/fixtures/trajectory-fence`.

## 3. Preflight items under this lens

### 1. `src/sim/gates.ts` — DONE

- Three pure functions read `world.content.manifest` only, via `Array.includes`; no build constant.
- `tests/sim/gates.test.ts` would fail for two wrong implementations:
  - one that read the shipped manifest (`:23`: a `LATER` world must answer true);
  - one that read allocated fields (`:46`: a recorded film system with no film field must answer true).
- A real g2 save loaded through `loadSaveFile` answers false for B05, film and E04.

### 2. `tests/helpers/trajectory.ts` — DONE

- **Frozen lists match this commit** (`schema-check.ts`):
  - `ENTITY_COLUMNS` has 67 entries, equal to `G2_ENTITY_COLUMNS`;
  - `allocatedFieldIds(allocateFields(['core','enzymes']))` equals `G2_FIELD_IDS` (18 core + 6 enzymes);
  - the world, settings, counter and grid key lists equal both a realized world and all eight loaded saves.
- **Sensitivity** (`coverage.ts`, on the loaded accelerated + varied t6000 save):
  - 136 single-value perturbations all move the `'g2'` digest. They cover all 67 columns on one organism (index columns moved to another valid index), the 24 fields, the 13 lineage arrays and `base`, both counters, the 12 ledger values and `exchangeC`, `nextSeq`, one pending command, the branch count and a root birthId, seed, tick, the 6 settings and the 4 grid arrays.
  - `nextEventId` does not move it.
- **Species-index independence** (`species-order.ts`):
  - All 14 g2 fence entries, realized under `withEnabled(G2, 14 Phase 3 species)`, digest exactly to their `g2Digest`, with P01's index moving 4 → 11.
  - The same holds with the film, viruses and chemistry systems also enabled.
- **Post-g2 columns:** no such column exists yet, so I tested the path with a mutant that appends `zzLinkSlot` (−1 default) and `zzTimer` (0) after `dryTimer`.
  - At their empty values both digests equal the fence's `g2Digest` (CLEANING_CREW_V1, EXP_106:B).
  - A non-empty value makes `'g2'` throw `entity column zzLinkSlot (slot 0 holds 7, empty is -1)` and moves `'full'`.
- **Not hashed:** contentHash, contentVersion, history and events.

### 3. `tests/helpers/registry.ts` and `validateContent(raw, opts)` — DONE

- All 12 manifest fields are patched; `simulationVersion` is not patchable (it throws).
- The packs are deep-copied from a raw cache that is separate from `loadRegistryFs`.
- The default of `validateContent` is unchanged. No production caller passes options.
- `G2_LISTS` comes from `g2-manifest.json`, which is byte-identical to `content/manifest.json` at `1067637`.

### 4. `tools/make-g2-saves.ts` — DONE (MINOR 2 open)

- The saves are the P-20 list.
- Every embedded manifest is buildPhase 2 and contentVersion 1, at schema 3, so the saves were written before the bump.
- Each gzip header is `1f 8b 08 00 00 00 00 00 02 03`: no name, MTIME 0, level 9.
- Every save's `savedAt` is 2026-10-01T00:00:00.000Z.
- **Determinism:**
  - Verify mode twice: identical sha256 for all 10 outputs, equal to the committed files.
  - Write path twice, in a copy whose `content/manifest.json` is `1067637`'s and whose saves folder was removed: `out1 == out2 ==` the committed files, all 10 (`gen-out1.sha`, `gen-out2.sha`).

### 5. `tests/fixtures/g2-replay.test.ts` — DONE

- The g2-replay file passes: 9 tests, 155.7 s in the targeted run, 146.4 s in the suite.
- **Load-time mutant** (E += 1e-9 inside `loadSaveFile`): 8 failed, 1 passed. Example: `expected '6570178c76292ce3' to be '2a4e5da67da9f3c5'` (exp106, hashAtLoad).
- **Throwaway perturbation** (E += 1e-9 right after loading, +1,000 ticks, digest comparison), 2 of 2 failed:
  - first-dish-t3000: `expected '43d5bf7888f46592' to be '5730917ce3ec53f6'`
  - e03-dormancy-t500: `expected 'a63a2eddf2f8be92' to be '0b06eeb388afcb79'`

  The throwaway test was then deleted.

### 6. The fence — DONE

- **Entries:** every one P-22 names, at the ticks it names: FIRST_DISH_V1 1200; EXP_106:B 1200 (P01 at 0 s); EXP_B:B 1800 (P01 at 120 s). Check (a) asserts the list and the ticks.
- **Checks:** check (a) uses `registryWith(G2_LISTS)` in `'g2'` mode. Check (b) uses the shipped registry in `'full'` mode. Every recipe has an entry.
- **Mutants:**
  - **World-gated rule** (applies only when the world's own manifest has buildPhase ≥ 3): check (a) passes 9/9, g2-replay passes 9/9, check (b) fails 8/8 recipe entries (e.g. CLEANING_CREW_V1 `e490305b1b0fbc52` instead of `fe6811d8b1d15c1e`). This is exactly the intended split.
  - **Capture-amount mutant** (`take × (1 − 1e-12)`): EXP_106:B, EXP_B:B and the EXP_106 save all change.
  - **P01 cooldown +1e-9 s or +0.1 s** (one more tick of cooldown): only EXP_106:B changes (`fd1c1b3aa70b918c`). A meal keeps P01 sated longer than its cooldown, so that mutant rarely changes behaviour. This is information, not a defect.

### 7. `tools/fence-update.ts` — DONE (MINOR 1)

- What holds:
  - `--add` records a current digest only;
  - `--recipe` and `--all` never touch `g2Digest`;
  - every refusal exits 2 and writes nothing;
  - a `--g2` re-record leaves a changedBy trail.
- On the later-content probe, a `--g2` run left `fence.json` and `expected.json` byte-identical, so it reproduces the committed values.

### 8. The pinned tests — DONE, none weakened

I diffed each test against `1067637`:

- **Goldens:** all four helpers use the one cached `registryWith(G2_LISTS)`. `golden.ts` and `wave-a-measurements.json` are untouched.
- **`comparison.test.ts`:** its three worlds are realized under G2.
- **`host.test.ts`:** now `registry().manifest.enabledSpecies`, per W2-02 (a).
- **`validator.test.ts`:** B09/SIGNAL_GLOW at buildPhase 7, and B10.
- **`framework.test.ts`:** P05.
- **`variants.test.ts`:** the message is built from the build phase, and the capability is `'developmental'`.
- **`modules.test.ts`:** buildPhase 2 and the g2 modules, read from G2.
- **`lab-commands.test.ts`:** the message is built from the build phase, and `gardenInfo` is built on G2.

### 9. The manifest bump — DONE

- The only fields that changed are buildPhase 2 → 3, contentVersion 1 → 2 and contentHash. A JSON diff of everything else is empty.
- `npx tsx tools/content-validate.ts` exits 0: `content ok · contentHash adc910dc…`.
- `fence.json`'s `currentDigest` equals `g2Digest` for all 14 entries.

### 10. `docs/reports/perf-g3.md` — DONE

It quotes `docs/reports/tune-g2.md:997–1009` exactly. Commit `9c087bc` exists.

## 4. Commands and results (in `/workspaces/pixelmeba/tmp/wt-p3`)

| Command | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | exit 0 (42.9 s) |
| `npx eslint .` | exit 0 (2 min 3.9 s) |
| `npx vitest run --reporter=verbose tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/sim/gates.test.ts tests/tools/fence-update.test.ts tests/tools/make-g2-saves.test.ts tests/helpers/registry.test.ts tests/helpers/trajectory.test.ts` | `Test Files 10 passed (10)`, `Tests 72 passed (72)`, Duration 675.06 s |
| `npx tsx tools/make-g2-saves.ts`, twice | each `verified: all 10 g2 fixtures are byte-identical. Nothing was written.`, exit 0 (2 min 1 s, 2 min 7 s) |
| `npx tsx tools/content-validate.ts` | `content ok`, exit 0 |
| `npx vitest run` (whole suite, 06:05–07:08) | `Test Files 85 passed (85)`, `Tests 774 passed (774)`, Duration 3767.69 s, wall 62 min 51 s, user CPU 27 min 56 s, exit 0 |

Per-file times from the targeted run (whole-suite run in brackets):

| File | Tests | Time |
|---|---|---|
| `g2-replay` | 9 | 155.7 s (146.4 s) |
| `trajectory-fence` | 9 | 110.7 s (108.3 s) |
| `trajectory-fence-arms` | 7 | 103.7 s (103.1 s) |
| `trajectory-fence-current` | 9 | 111.1 s (174.4 s) |
| `trajectory-fence-current-arms` | 6 | 105.1 s (113.3 s) |
| `trajectory.test` | 10 | 44.5 s |
| `fence-update.test` | 13 | 27.0 s |
| `registry.test` | 4 | 0.6 s |
| `gates.test` | 3 | 1.1 s |
| `make-g2-saves.test` | 2 | 1.7 s |

The plan asks for about 60 s per file on an idle machine. At this load I cannot measure that. In tsx, all 14 entries together took about 80 s.

Fence entries: tick, then per-entry time in check (a) / check (b), from the targeted run.

| Entry | Tick | Check (a) | Check (b) |
|---|---|---|---|
| CLEANING_CREW_V1 | 1200 | 12.2 s | 10.8 s |
| FIRST_DISH_V1 | 1200 | 17.7 s | 16.1 s |
| FOOD_TRAIL_V1 | 1200 | 12.9 s | 12.0 s |
| LIGHT_AND_LIFE_V1 | 1200 | 11.5 s | 11.5 s |
| PREDATOR_BALANCE_V1 | 1200 | 14.5 s | 16.9 s |
| RESERVE_COMPARE_V1 | 1200 | 14.2 s | 13.9 s |
| STARCH_UNLOCK_V1 | 1200 | 13.3 s | 14.2 s |
| STARCH_UNLOCK_V1+E01 | 1200 | 14.3 s | 15.7 s |
| R-G1 | 1200 | 17.0 s | 17.7 s |
| R-G2 | 1200 | 18.9 s | 18.8 s |
| R-G3 | 1200 | 14.9 s | 17.0 s |
| EXP_102:B | 1200 | 10.2 s | 10.5 s |
| EXP_106:B | 1200 | 14.9 s | 14.7 s |
| EXP_B:B | 1800 | 27.8 s | 26.4 s |

Saves: unchanged, and equal to the fix-round-1 list.

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

## 5. Notes for the lead (not counted as problems)

- **Rebase.** On main, `src/sim/lineage.ts` (the display-only `mutModuleName`) and `src/persistence/saveFile.ts` (`APP_VERSION` moved to `appVersion.ts`, still '0.1.0') change no save byte. If the post-rebase verify reports DIFFERS anyway, regenerate on the g2 tag itself, because `--force` is refused past g2. Use a worktree at `g2` plus `tools/make-g2-saves.ts` and `tests/helpers/{g2-saves,trajectory,fence}.ts`.
- **A forward guard.** `registryWith` patches only the 12 manifest fields that exist at g2. A manifest field added in Phase 3 (for example a list for the D-0039 tools pack) would flow from the shipped manifest into `registryWith(G2_LISTS)` unpatched. Suggestion: have `patchedRawPacks` refuse a shipped manifest key outside `PATCHABLE_MANIFEST_KEYS`, `simulationVersion` and `contentHash`.
- **Tests that pin decision texts.** The end-to-end refusal cases in `tests/tools/fence-update.test.ts` pin the texts of live decisions D-0036 and D-0038 (D-0038 is "Owner review: yes"). An amendment adding "N → M" wording would change which refusal fires. The unit cases already cover both shapes with synthetic texts.
