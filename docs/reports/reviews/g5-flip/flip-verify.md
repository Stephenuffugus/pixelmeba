# Systems flip (D-0121): saves and determinism verification

- **Verifier:** adversarial saves/determinism lens, 2026-10-14.
- **Tree:** uncommitted flip on top of 9d22ec0.
- **Probes:** tmp/verify-flip/, run with `npx vitest run --config tmp/verify-flip/vitest.config.ts <file> --maxWorkers=1`. Probe output is in tmp/verify-flip/probe-out.txt.
- **Tracked files:** none edited, apart from this report.

**Verdict: ok.** Nothing is BLOCKER or MAJOR. There are three MINOR findings: one in the flip, two that predate it.

## Problems

- **MINOR [flip]** src/sim/content/registry.ts:378
  - **What:** The validator does not require the manifest's `enabledSystems` to be a subset of `IMPLEMENTED_SYSTEMS`. Since the flip, the import refuses any recorded system outside that list. So a build whose manifest enabled 'equipment' would pass `content:validate`, create new dishes normally, and then refuse to reopen every one of them, including its own autosave and Continue.
  - **Existing guard:** only one vitest assertion, in tests/persistence/import-implemented.test.ts ("The shipped manifest enables only implemented systems"). Structures and native abilities already get the matching validator refusal (registry.ts:384, :433).
  - **Repro:** tmp/verify-flip/validator.probe.test.ts. `validateContent(patchedRawPacks({ enabledSystems: [...shipped, 'equipment'] }))` gives `errors 0, registry built`.
  - **Fix:** add a refusal at registry.ts ~378: `enabledSystems.<i>: "<id>" is not implemented by the simulation yet`.

- **MINOR [lead]** src/worker/host.ts:524 with src/persistence/store.ts:240
  - **What:** the loadSlot path swallows the named refusal. A slot holding a dish that names an unimplemented system opens nothing, and the open dish stays untouched (both checked). But the player reads "That save could not be read, and no earlier copy was usable." (kind 'integrity'), not "This dish uses the "equipment" system, … Nothing was loaded.".
  - **Cause:** store.load's verify treats any parse error as a corrupt record. This predates the flip and applies to every parse refusal, for example a newer schema. It is only reachable after a downgrade that leaves a newer build's saves on the device.
  - **Repro:** tmp/verify-flip/import.probe.test.ts, item 1 (c). It saves the crafted text to slot1 of a MemoryBackend store, then sends `loadSlot`. Logged as `PROBE loadSlot message …`.

- **MINOR [lead]** src/sim/mutation.ts:95 with src/ui/strings/modes.ts:189
  - **What:** a crafted dish with `manifest.developmentalEnabled: true` loads. The probe printed `LOADED developmentalEnabled=true`.
  - **Effect:** the rate rows then show "developmental changes" with a percentage, but nothing in the simulation ever draws a developmental change. `rates.developmental` is read only by the UI string. The flip's "implemented" import line covers the 'developmental' system id but not this Phase 7 flag.
  - **Status:** predates the flip. It belongs with the Phase 7 flip.
  - **Repro:** tmp/verify-flip/devflag.probe.test.ts.

## Verified

### Item 1: refusals on the real path

Probe: tmp/verify-flip/import.probe.test.ts. All 13 tests passed. The crafted files were:

- (a) 'equipment' and 'developmental'
- (b) the unknown system 'aquifers'
- (c) the structure 'S13'
- (d) species recording an unimplemented native ability: P10 HANDLING, F03 TRAP and A04 MIXOTROPHY

Each file was refused on every path the app uses:

- **loadSaveFile:** kind 'content', with the exact sentence naming the id and ending "Nothing was loaded."
- **DishHost importDish:** the error reply has the same exact message, with and without `keepFrom: {dishId:'open', keep:{kind:'auto'}}`.
- **The open dish:** it was advanced to tick 250 first, not left at tick 0. After each refusal its tick, `stateHash` and full serialized state were unchanged. It stayed the active dish, no new dish exists, and the store holds no kept slot (the refusal happens before the keep).
- **loadSlot:** also refused, with the wording noted above.

Every load path in host.ts (importDish, loadSlot, exportSave, the shelf, tryDish) goes through `parseSaveFile`, and `unimplementedRulesProblem` runs before the schemas.

### Item 2: no over-refusal

Probe: tmp/verify-flip/import.probe.test.ts.

- **Corpora:** all rc1 saves and all g2 saves import through the host. None of them gains 'barriers', 'climate' or 'devices' in its manifest or in `DishInfo.systems`, and none gains an S-structure.
- **Fixtures:** the wave 10 membrane fixture and the wave 11 structure fixture import, with their edges intact.
- **B09 and B13:** a dish recording B09 (SIGNAL_GLOW) and B13 (RIVALRY) under 'signals' and 'rivalry', with two of each placed and run 200 ticks, imports with an equal `stateHash`.
- **Resting stages:** a wave 10 dish with B12 and F04 (DORMANCY, RESTING_DAUGHTER) round-trips by hash.
- **Dishes this build makes:** every shipped recipe (18), variant (4) and experiment arm (21) is realized, saved and loaded with an equal `stateHash`. None was refused and none skipped. A build that refused its own dishes would show up here.
- **Test suites:** `tests/fixtures/rc1-replay`, `g2-replay`, `trajectory-fence-current`, `trajectory-fence-files`: 4 files, 41 tests passed (546 s). `tests/fixtures/trajectory-fence-current-arms`, `tests/persistence/import-implemented`, `tests/persistence/phase5-import`: 3 files, 65 tests passed (157 s).

### Item 3: old worlds keep their ruleset

Probe: tmp/verify-flip/determinism.probe.test.ts.

For each of the 5 rc1 saves:

- The save was loaded, its resume step applied, and the world run 3,000 ticks straight.
- A second copy was run at the 4× analogue to t0+1500, saved, imported through the DishHost (the stateHash after the import equaled the hash at the save), and continued at 4×.
- The two final `stateHash` values are equal for every save:

| Save | Hash after 3,000 ticks | Alive |
|---|---|---|
| diverse-notebook | fa5ac7cd8462459d | 786 |
| lab-food-sample | 4b2d2b8e42c5432f | 562 |
| borrowed-shelter | 54244512e89497ac | 9 |
| fungal-supply-line | 4744d8a6819bd284 | 0 |
| one-host-pinphage | daa31166990e1130 | 0 |

At the end of both runs:

- edges and devices are empty, and the climate warmth and moisture arrays are null.
- No manifest gained barriers, climate, devices or an S-structure, and the recorded contentHash is not the new one.
- `lightMode` is fixed and `drying` is false.

Two of the five dishes die out during the run, so the hash comparison carries less weight for them.

### Item 4: a new dish records the systems and allocates nothing

Probe: tmp/verify-flip/determinism.probe.test.ts.

- **Pre-flip lists:** the enabled lists read from `git show 9d22ec0:content/manifest.json` and passed through `registryWith` give contentHash 67075b0e…. The shipped contentHash is 84c41636…, as the builder reported.
- **Comparison:** FIRST_DISH_V1 (Standard, seed 104729) was built under both manifests, both via `realizeRecipe` and via DishHost `create` with `overrides {}`. At tick 0 and at tick 1,200:
  - the allocated field sets are identical;
  - the serialized states are byte-identical apart from the manifest and the worldId;
  - `trajectoryDigest('full')` is equal: d239a74834432569, 172 alive;
  - `stateHash` is equal once the contentHash stamp is made equal.
- **Allocation:** the post-flip world records barriers, climate and devices, but its climate arrays stay null and its edges and devices stay empty.
- **Every shipped recipe:** `trajectory-fence-current` and `-current-arms` pass with all 25 old currentDigests, under the post-flip shipped registry.

### Item 5: the two new fence entries

- **fence.json against 9d22ec0:** the `about` text is the same. All 25 old entries are byte-identical, and only FENCE_CYCLE_HEATER and FENCE_BARRIER_LINE were added. `tests/fixtures/saves*/expected.json` and protocol2-golden are unmodified (git status).
- **Probe** (tmp/verify-flip/determinism.probe.test.ts):
  - A 1× run reproduces each currentDigest: 11e6eeb6695ec849 and 56e40d203f44e18f.
  - A 4× run with a save → host import at tick ⌊T/3⌋+1 (not the builder's midpoint) keeps the stateHash. At that tick the cycle dish had the cycle on, its heater device placed and warmth non-null; the barrier dish had 49 edges and the resin.
  - A second save → load at T−7, then running on to T, gives the recorded currentDigest and the same `stateHash` as the 1× run.
- **Coverage gap:** the cycle entry has no edges, and the barrier entry has no cycle or warmth. So neither entry fences edges and climate together. This is noted only; it is not a defect.

### Item 6: no pinned test weakened

I read every hunk of `git diff tests/`: 35 files, 1,258 diff lines. Every changed assertion is one of:

- a shipped-list re-pin that adds the flip's ids;
- a subject moved to `preFlipRegistry()` where the test's subject is "a v1.0 dish";
- a negative case moved to the pre-flip manifest, with a new positive assertion for the shipped build. Examples: recipe-structures `refusal(registry(), …) === ''`; new-dish-environment, where the shipped build accepts cycle and drying; structure-snapshot, where the shipped build has roof and canopy factors.

Coverage that was removed reappears elsewhere:

- The validator's "not implemented" structure refusal moved to tests/content/structures-implemented-check.test.ts. It mocks the list without S12 and keeps the exact message.
- variants.test now uses 'equipment' for the unenabled capability.
- The structures-environment no-climate branch could no longer run, because the build manifest now has climate. The spec asserts `buildManifestHasClimate === true`.
- phase5-import mocks `IMPLEMENTED_NATIVE_ABILITIES`, adding HANDLING, MIXOTROPHY and TRAP, until waves 12 and 13. It is file-scoped, and the real refusal of those abilities is proven in import-implemented and in my probe.

`preFlipRegistry` reproduces the 9d22ec0 contentHash (item 4), so the moved goldens still compare against the same build.

Smaller notes:

- The builder's `refusedByHost` helper checks only an open dish at tick 0. My probe repeated its checks with the open dish at tick 250 and with keepFrom.
- structure-snapshot's new shipped-dish case no longer asserts anything about a `climate` key. That is acceptable, because the v1.0 case keeps the old assertions.
