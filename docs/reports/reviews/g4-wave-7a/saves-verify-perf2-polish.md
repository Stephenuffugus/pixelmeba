# Wave 7a — saves/determinism verification of perf2-polish (P4.13)

Verifier: adversarial saves/determinism lens. Tree: main 6265d34 + the uncommitted wave 7a edits (2026-10-12, load 2.4–4.5).
Probes are in tmp/verify-saves-1/ (git-ignored). No tracked file except this report was edited.

**Result: ok = true.** There is no BLOCKER or MAJOR. Two MINOR items follow, then the VERIFIED OK list.

## Problems (most severe first)

- MINOR [perf2-polish] tools/perf-stress.ts saveOut (`buildSaveFile(w, { ..., recipeId: 'FIRST_DISH_V1' })`)
  - **What is wrong:** the 6,000-agent stress world is built in memory and is not FIRST_DISH_V1. Its exported .pixelmeba still records `meta.recipeId: 'FIRST_DISH_V1'`.
    - The checksummed state is authoritative, so the world loads and continues exactly (checked below).
    - But any feature keyed on `meta.recipeId` would treat the imported dish as the Garden recipe.
    - It only affects the perf-web measurement file, not the product.
  - **Fix:** `SaveMeta.recipeId` is `string | null`, so pass `null`.
  - **Repro:** `npx tsx tools/perf-stress.ts --save-out x.pixelmeba`, then read `meta.recipeId` in the file.
- MINOR [lead] src/persistence/saveFile.ts:269–446 parseSaveFile (pre-existing; not this task)
  - **What is wrong:** the top-level header `tick` is outside the checksum, and nothing compares it with `state.tick`.
    - A file whose header says `"tick":601` over a tick-600 state imports without complaint.
    - No import path reads the header tick: host.ts uses `built.file.tick` only on files it has just built. So nothing shows or simulates the wrong value today.
  - **Repro:** tmp/verify-saves-1/probe-stress-save.ts (header tamper accepted). By contrast, tmp/verify-saves-1/probe-tamper.ts shows that a `state.tick` tamper is refused: "The file is damaged or was edited (checksum mismatch)."

## VERIFIED OK

- **VERIFIED OK — profile eviction is pure cache work, never state** — src/sim/profiles.ts:40 `evictProfiles`, called from tick.ts:48.
  - `world.profiles` is created only in world.ts:199 (`[]`). serialize.ts never writes or hashes it: `genomes` comes from `world.genomes.list` (:129), and stateHash hashes `genomeKey` (:263–264).
  - No code iterates the cache. Profiles are `readonly` and never mutated or identity-compared. The WeakMaps (attachment.ts, matrixBuilder.ts, founders.ts) are keyed by species record or World, never by profile.
  - `world.species` and `world.modules` are readonly and built once, and the genome table never shrinks. So `deriveProfile(sp, g, mods)` rebuilds identical values.
  - Every cached reader goes through `profileOfGenome`. Its one cache-skipped check, the ancestor mismatch throw, is only reachable from lineage.ts:588 `rulesOf`, a read-only UI read inside try/catch.
- **VERIFIED OK — eviction is hash-neutral on all 18 registered recipes**, under a harsher regime than the builder's.
  - Command: `npx tsx tmp/verify-saves-1/probe-evict.ts 1800`
  - Four worlds per recipe, all equal on stateHash and `trajectoryDigest('full')`:
    - A: the shipped cadence.
    - B: `world.profiles` wiped after **every stage** (10× a tick).
    - C: four quarter chunks, with a real `buildSaveFile` → `loadSaveFile` round trip at ticks 599, 600, 601 and 900. 600 is the eviction tick: the probe saves right before it, right after it and one tick later.
    - D: `serializeWorld` → JSON → `deserializeWorld` at ticks 1199, 1200 and 1201.
  - Result: "ALL EQUAL" for 18/18 recipes.
  - The probe was not vacuous: eviction really dropped entries (L301 58/68 cached, L303 16/40, L304 49/73, FOOD_TRAIL 7/9).
  - At 6,000 ticks (`... 6000 <recipe>`), all equal:

    | Recipe | Live | Genomes | Cached at end | stateHash | Trajectory |
    | --- | --- | --- | --- | --- | --- |
    | FIRST_DISH_V1 | 716 | 114 | 89 | 76187642c83a889a | ede180651ed2072d |
    | L303_PUBLIC_KITCHEN | 0 | 40 | 0 | 15f31219a728e474 | 8ad26e6cb410c056 |
    | L304_EMPTY_AFTER_THE_FEAST | 0 | 73 | 0 | 6808df4afd44845a | 020830a2b7e6dead |
- **VERIFIED OK — releaseFoodRefs (movement.ts:515) is hash-neutral.**
  - `FOOD_ARRS`, `foodN` and `foodStarch`/`foodOil`/`foodProtein` are read only by `foodScoreAt` (:204). `foodScoreAt` is called only from `decide` (:304), after `prepareFoodScore` (:274) has set them for that organism.
  - `decide` is called only inside `stageSenseAndMove`, and the release runs after the stage's last reader. Covered by the 18-recipe probe above.
- **VERIFIED OK — real worker host: 1× = 4× with diagnostics and map = 4× with host save/reload at the eviction tick.**
  - Command: `npx vitest run --config tmp/verify-saves-1/vitest.config.ts --root . tmp/verify-saves-1/host-probe.test.ts` → 1 passed.
  - Three DishHost runs of FIRST_DISH_V1 to tick 1300:
    - A: 1×, nothing opened.
    - B: 4×, diagnostics on, and the relationship map opened before the first play (the host.ts:1545 arm path) and again mid-run.
    - C: 4×, saved through the host at 599, 600 and 601 and recreated from `{kind:'state'}` each time.
  - All three received an accepted Feed (`accepted 29`) and a refused Feed (`accepted 0, rejected 3`) at tick 300.
  - Result: all three equal, hash 2e66f2a4b454072e and trajectory b74cba33e0326fc9, with 0 errors.
- **VERIFIED OK — the diagnostics toggle and the D-0085 pool arming are read-only.**
  - `performance.now()` appears only in host.ts, under the `this.diagnostics` guards.
  - The watcher's stage-5 `beforeIntake` (relationships.ts) only reads `poolTotal`.
  - `RelationshipMapData` and `poolsRecordedSinceSecond` never reach src/persistence. The only modules that reference them are protocol, client, relationshipMap, ui/observe.ts and RelationshipMap.tsx.
  - Command: `npx vitest run tests/worker/perf-counters.test.ts tests/worker/relationship-map-cost.test.ts` → 2 files, 8 passed.
- **VERIFIED OK — the stress world's save round trip (perf-stress `--save-out` path).**
  - Command: `npx tsx tmp/verify-saves-1/probe-stress-save.ts`
  - `buildSaveFile` at tick 600 gives 10,146,751 bytes (under the 25 MB limit).
  - `loadSaveFile`, then 600 more ticks on both the live and the loaded world:
    - Tick 600: 1e150b021dd1d232 on both, the same value as the builder's `--hashes` 600 entry.
    - Tick 1200: 70a3bf30fff88bd8 on both.
    - Trajectory: a055844e16914ad4 on both.
- **VERIFIED OK — the before/after `--hashes --stress-only` outputs are identical.**
  - tmp/perf2/before-hashes.json and tmp/perf2/after-hashes.json share md5 2edd7bbbfddd345c6d90ccafaa6a0f98.
  - The after file is dated 10:10, after the src/sim edits at 08:25.
  - stress 9000 = 8564b87b9251fd32; snapshot 9000 = 9eff90221b401348.
- **VERIFIED OK — g2 saves and determinism fences.**
  - Command: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/determinism.test.ts tests/fixtures/determinism-g3.test.ts`
  - Result: 3 files, 22 tests passed (215 s).
- **VERIFIED OK — no new saved state.**
  - The perf2 edits add nothing to WorldState, serializeWorld, stateHash or the save file.
  - Settings `showPerformance?` is a UI setting read with `=== true`, so garbage reads as off. It is not part of the world save.
  - The builder's finding that a refused command changes stateHash (it takes `commands.nextSeq` and is logged with its result; commands.ts:71) is pre-existing and consistent with replay. The probe above shows that refused commands replay identically.
- **VERIFIED OK — no simulation randomness or world writes outside src/sim.**
  - The perf2 diffs in src/render, src/ui, src/worker and tools contain no `rng`, `Math.random` or seed-derivation calls.
  - The new files (budgets.ts, speedBadge.ts, Diagnostics.tsx, perfCounters.ts, perf-web.ts) contain none either.
  - No added line writes to `world.*` or to entity columns.
