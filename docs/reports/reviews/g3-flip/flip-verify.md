# Module flip (D-0059): saves and determinism verification

Verifier: adversarial saves/determinism lens, 2026-10-10. Tree: HEAD 0a29004 plus the uncommitted flip.
Every probe is load-time only and lives under `tmp/verify-flip/` (not committed). No tracked file was edited except this report.

**Result: ok = false.** The flip itself has no BLOCKER or MAJOR. The one MAJOR is `[lead]`: it predates the flip and reproduces under the pre-flip registry.

## Problems

- MAJOR [lead] src/sim/contacts.ts:128 — **A whole-prey capture can leave a save that cannot be opened.**
  - When a predator takes the prey's whole body (`take === B`), `detN[cell] += N - takeN + mealN` can add about −1.39e-17, because `takeN = N*B/B` rounds up by one ulp.
  - On an empty detritus cell this leaves `detritusN` negative, and the value stays there.
  - `parseSaveFile` (src/persistence/saveFile.ts:316) refuses any negative field value. The game therefore writes a save (writes are not verified) that it then refuses to open with "Field detritusN has an invalid value at cell …".
  - Continue falls back to the predecessor, which can hold the same cell.
  - This predates the flip: it reproduces identically under `registryWith({ enabledModules: [E01,E03,E05], moduleRegistryVersion: 1 })`, whose content hash equals HEAD's.
  - Repro: `npx tsx tmp/verify-flip/negdet.ts shipped` (and `… pre`): FIRST_DISH_V1 seed 104729, run 20 ticks, a real `inoculate` of one P01 at (46.5, 64.5) radius 1. At tick 24, after stage 5, cell 8237 holds detritusN = −1.3877787807814457e-17. Saved at tick 620 → "REFUSED: Field detritusN has an invalid value at cell 8237."
  - It is rare: PREDATOR_BALANCE_V1 seeds 104729/101/11 at ticks 600/1200/2400 all load (`tmp/verify-flip/negrecipe.ts`).
  - Possible fixes: clamp the split, e.g. `takeN = take === B ? N : N*take/B`; and/or have the import clamp an |x| < 1e-12 roundoff negative instead of refusing it. Owner's call.
- MINOR [lead] src/persistence/saveFile.ts:392 and :298 — **Two refusal messages lack the "Nothing was loaded." ending.**
  - When a genome carries a module missing from the save's `content.modules`, the message is "A genome refers to unknown module E04." If only the list is cut, it is "The dish's list of extra abilities does not match its manifest." Neither ends with "Nothing was loaded.", unlike the D-0058 parameter refusals and the unknown-ability refusals.
  - Behaviour is correct, and the UI's toast prefixes "Nothing was paused or changed:" (src/ui/state.ts:195).
  - This predates the flip and is wording only.
  - Repro: `npx tsx tmp/verify-flip/imports.ts`, the "omit …" cases.
- NIT [lead] src/sim/variants.ts:532 — **"Again" on a pre-flip What-if dish silently starts under registry 2.**
  - `realizeAgain` accepts a differing `contentHash` (`sameRules` false ⇒ no refusal). An Again from a What-if dish made before the flip therefore starts a new dish under registry version 2 (ten modules), which can take a different course from the original.
  - The old dish itself is untouched, and the new dish records and shows v2. This follows D09 §4 as written.
  - Flagged only so the owner knows that a registry bump also changes what Again rebuilds. No UI problem is proven.
- NIT [lead] src/sim/matrixBuilder.ts:89 — **The E10 marker is blank for one tick after a load.**
  - The "accepted E10 request" marker is observation only and is not saved, so right after a load at a tick where an E10 request was accepted, `matrixBuiltNow` is false until the next tick.
  - The state hash and the continuation are unaffected (see item 2 below); this is documented as never saved.
  - Probe: seed 22 save@506 and seed 20 save@3127, where `reloaded-live-equal=false` comes only from `E10:accepted`.

## VERIFIED OK

- VERIFIED OK — **1. Old worlds keep the old rules** — `tmp/verify-flip/old.ts`.
  - The pre-flip registry has v1, E01 E03 E05 and content hash d26e5d2391a3a1d2, equal to HEAD's manifest hash.
  - Worlds were realized under it, saved with `buildSaveFile` and loaded with `loadSaveFile` by this build:
    - FIRST_DISH_V1 seed 101 Accelerated, save@400
    - seed 11 Accelerated, save@400
    - seed 104729 Standard, save@1200
  - Each loaded world records `moduleRegistryVersion` 1, the module list `[E01,E03,E05]`, and `world.modules` with the same three keys.
  - Eligibility after the load stays A01:E05, B01:E01/E03/E05, B04:E01/E03/E05, B06:E03/E05.
  - The hash at load is equal, and the hash after +3,000 ticks equals the run without the save/load:

    | seed | hash after +3,000 ticks |
    |---|---|
    | 101 | e2a776834e902597 |
    | 11 | e435b25909d79a7c |
    | 104729 | 58f5c0143a8e7242 |

  - Every genome ever interned carries only E01/E03/E05.
  - Contrast, the same seeds under the shipped registry: they diverge, and seed 101 carries E06/E07 and seed 11 carries E06/E07.
- VERIFIED OK — **1. Fence digests under the pre-flip registry** — `tmp/verify-flip/prefence.ts`: `fenceDigest(preFlip, e, 'full')` equals the recorded currentDigest for all 18 entries. "ALL EQUAL", the same values as the builder's table.
- VERIFIED OK — **1/4. g2 saves and the trajectory fence** — `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence.test.ts tests/fixtures/trajectory-fence-arms.test.ts tests/fixtures/trajectory-fence-current.test.ts tests/fixtures/trajectory-fence-current-arms.test.ts` → "Test Files 5 passed (5) · Tests 44 passed (44)". All 9 g2 saves load and continue bit-identically.
- VERIFIED OK — **2. New worlds record the new registry** — `tmp/verify-flip/new.ts search`.
  - Every new FIRST_DISH_V1 world tested records moduleRegistryVersion 2 and the ten modules in its manifest and `content.modules`. That is 30 Accelerated seeds, 6 Standard seeds and 4 more Accelerated seeds.
  - Save meta.registry is `v2 [E01,E03,E04,E05,E06,E07,E08,E09,E10,E12]`.
- VERIFIED OK — **2. Gains of the new modules fire.**
  - Accelerated, seeds 1–30:

    | module | seed | first tick |
    |---|---|---|
    | E04 | 27 | 334 (anchored at 855) |
    | E06 | 101 | 306 |
    | E07 | 11 | 306 |
    | E09 | 30 | 2708 |
    | E10 | 22 | 401 (accepted request at 506) |
    | E12 | 20 | 478 (pairing at 1591, link at 1640) |
    | E12 | 7 | 756 (link at 2543) |

  - Standard: seed 1 gains E07 at tick 1569, and seed 4 gains E06 at tick 4732.
  - E08 cannot fire in FIRST_DISH_V1, which has no P01 founders. PREDATOR_BALANCE_V1 seeds 1–10 had no gains in 4,000 ticks, so E08 was checked in a built dish instead (next item).
- VERIFIED OK — **2. 1×, 4× and save/load with live module state** — `tmp/verify-flip/new.ts check`, `tmp/verify-flip/e08live.ts`.
  - "4×" means four quarter runs and also 4-tick chunks.

    | dish | 1× hash | 4× (both forms) | save tick | live state at the save | hash at load | continued to |
    |---|---|---|---|---|---|---|
    | seed 20 Accelerated | f5b82ccce3f1e9b4 | equal | 1591 | E12 pairing clocks | equal | 3200, equal |
    | | | | 1640 | E12 link | equal | 3200, equal |
    | | | | 3127 | E12 link + E10 accepted | equal | 3200, equal |
    | seed 27 Accelerated | c58429c5e86fd83b | equal | 855 | E04 anchored carrier | equal | 1200, equal |
    | seed 22 Accelerated | 2d15d053c9dbb0bf | equal | 506 | E10 accepted | equal | 800, equal |
    | seed 1 Standard | 886f67517a84f67b | equal | 1569 and 1600 | E07 carrier | equal | 2000, equal |
    | E08 dish (clear water, detritus, P01+E08) | 78d9724a683eae90 | equal (quarters) | 1 | detritusIntake set | equal | 400, equal |

  - The E08 dish's detritusIntake flag survives the reload.
- VERIFIED OK — **3. Import refusals** — `tmp/verify-flip/imports.ts`.
  - The base was a v2 save carrying E04, E07, E08, E10 and E12. Through `DishHost` `importDish`, with an open dish present, 42 tampered saves were tried, re-stamped so only the edit can refuse them:
    - each module omitted from content.modules and the manifest (genomes still carry it);
    - each omitted from content.modules only;
    - every recorded parameter of E04, E06, E07, E09, E10 and E12 dropped, one at a time.
  - All 42 were refused with an error reply. No dish was created, and the open dish's stateHash and the active dish were unchanged ("ALL 42 REFUSED, OPEN DISH UNTOUCHED").
  - All 32 parameter refusals end "… is missing. Nothing was loaded." The 10 omission refusals do not (see MINOR above).
- VERIFIED OK — **4. The fence update is explained** — `git diff --quiet HEAD -- tests/fixtures/fence.json tests/fixtures/saves` returns 0. fence.json and the g2 saves/expected.json are byte-identical to HEAD.
  - No recipe moved, as the builder reported, so every g2Digest and every Fixed Traits entry is unchanged.
  - The pre-flip registry reproduces every currentDigest (above).
- VERIFIED OK — **5. No pinned test was weakened** — read every hunk of `git diff tests/` (24 files). Each change does one of three things, and there is no `toBeGreaterThan`/`toContain` substitution for an exact value:
  - re-pins an exact value to the new trajectory (seed 11 birth 72 → E07; seed 101 birth 71 → E06; first branch at tick 1927);
  - moves a Phase 2 subject to `registryWith(G2_LISTS)` with the assertion unchanged;
  - swaps a registry built for the builder for the shipped one.
  - Tests that got stronger:
    - lineage-panel now asserts motility exactly when E07 is carried, with ≥1 Sunbead seeker and ≥1 still Sunbead;
    - founders and modules gained shipped-registry uniformity tests;
    - module eligibility is pinned for all 19 species;
    - atlas checks a FEATURE_FRAMES row per mark.
  - atlas `toHaveLength(3)` → `toHaveLength(marks.length)` is paired with `expect(marks).toHaveLength(10)` and an exact `toEqual` on the list, so it is equivalent.
  - registry-imports "changed build" now opens a v2 save in a v3 build: the same property, shifted by one version. The v1-save-in-the-shipped-build case is covered by g2-replay and by probe 1 above.
  - Targeted rerun: `npx vitest run --maxWorkers=1 tests/fixtures/registry-imports.test.ts tests/persistence/adhesion-import.test.ts tests/sim/modules.test.ts tests/persistence/strip-names.test.ts tests/worker/keep-autosave.test.ts tests/sim/founders.test.ts` → "Test Files 6 passed (6) · Tests 54 passed (54)".
- VERIFIED OK — **The simulation reads only recorded content.** `world.modules` is built from `opts.content.modules` (src/sim/world.ts:177), and the only build-registry reads in `src/sim` are in content validation. `git status` shows no `src/` change, so the flip changes worlds only through the content they record.
