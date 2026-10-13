# Wave 8a · adversarial verification (schema5, art-small)

Verifier: wave-verify-0, 2026-10-13. I edited no tracked file. Scratch work is in tmp/verify-g5-wave-8a-0/.

**Verdict: ok = false.** There is one MAJOR problem: the combined tree does not typecheck, and `tests/sim/module-visuals.test.ts` fails. Everything else the two assignments asked for holds, and the fence passes unchanged.

## Problems (most severe first)

- MAJOR [art-small] tests/sim/module-visuals.test.ts:139 and :149 — `npm run check` is red on the wave tree.
  - Cause: art-small added the `glow_center`, `jacket_rim` and `mode_half` layers to `art/src/layers/modules.ts`. That widened art's `FeatureLayerId`, but the renderer's `FeatureLayerId` (`src/render/features.ts`) was not changed.
  - tsc result: `tests/sim/module-visuals.test.ts(149,39): error TS2345 ... Type '"glow_center"' is not assignable to type 'FeatureLayerId'` (exit 2).
  - vitest result: 1 failed, at `the marks are atlas frames ...` (:139, "the renderer's vocabulary is exactly the authored layers").
  - Ownership: the test and `src/render/**` are outside art-small's ownership, and the builder disclosed the failure. The lead must still apply a fix before commit.
  - Proposed fix: the builder's test-only patch (`tmp/art-small/module-visuals.patch`, an `AWAITING_RENDER` filter that org-ui empties in wave 13). I checked it: applied to a scratch copy of the test (tmp/verify-g5-wave-8a-0, own vitest config), it gave Tests 8 passed (8).
  - Repro: `npx tsc -p tsconfig.json --noEmit`; `npx vitest run tests/sim/module-visuals.test.ts`.
- MINOR [schema5] src/persistence/phase5State.ts (trap pair block in phase5StateProblem) — the import accepts trap pairs the rules can never produce.
  - It does not check what the trap holds, so an F03 holding any organism is accepted. CT §3.3 says "F03 Traplace | traps P04 only".
  - A self-trap is also accepted (trapSlot = heldBySlot = own slot).
  - Repro: tmp/verify-g5-wave-8a-0/probe.test.ts. An F03 holding a B01, with mutual columns, prints "B01 held: loaded". The self-trap prints "self-trap: loaded".
  - Not in the assignment's list. Suggest that e3-traps, which replaces the trap rules, adds "held organism is P04 and is not the trap itself".
- MINOR [schema5] src/persistence/phase5State.ts organismProblem — `glowState` 1 is accepted on an organism that is not Active.
  - D-0106 says "Glow is off in any non-Active state", so a resting E02+E03 carrier marked glowing loads.
  - Repro: read the code. organismProblem never reads `lifeState` for the glow columns.
- NIT [schema5] src/sim/barriers.ts classOf — CT §5.3 lists "fungal disperser" under Medium, and no classOf rule covers it.
  - Rule (d) makes every fungus that is not a resting newborn Fixed.
  - No content has a fungal disperser today, and the assignment's rules (a)–(f) did not ask for one. Record it for the wave that adds dispersers.
- NIT [schema5] src/sim/barriers.ts / devices.ts refusal sentences — the player-facing sentences name raw ids with a wrong article ("An edge barrier is a S01, which this dish's rules do not include."). This matches the existing import style ("unknown species B09"), so it is cosmetic.
- NIT [art-small] art/src/sprites/phase5_small.ts V02 — the glyph reads as a spiked, filled capsid rather than UX §6.3's "lace glyph". The alpha rule against V01 holds (art-p5 test, alpha difference ≥ 0.12), so this is taste for the polish pass.
- NIT [art-small] tools/art-build.ts ATLAS_W comment — it says "Phase 5 grows the sheet to 1024×2048". After this wave the sheet is still 1024×1024 (art-large may grow it). The wording follows the assignment and is forward-looking.

## Verified OK

- VERIFIED OK — the fence and conservation are unchanged. `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts` gave Test Files 7 passed (7), Tests 58 passed (58), EXIT 0, in 375 s. No fixture, corpus or fence file was touched (`git status`).
- VERIFIED OK — the builders' new and changed tests pass. barriers-table, world-stores-5, migration-schema5, phase5-import, migration, gates, system-requirements, trajectory.test, art-p5, atlas, silhouettes and history-debris (plus module-visuals) gave Test Files 12 passed, 1 failed (module-visuals only, see the MAJOR above), Tests 588 passed of 589.
- VERIFIED OK — related suites pass: tests/sim/world-stores, tests/render/*, tests/worker/sample-transaction and tests/fixtures/deterministic-state gave Test Files 10 passed (10), Tests 78 passed (78).
- VERIFIED OK — eslint is clean on all 25 created or changed source, test, art and tool files (exit 0).
- VERIFIED OK [schema5] — the column count. The assignment says "11" but lists 12 names. The builder implemented the 12 listed names (glowState … handlingNeed) in the stated order, appended after aLinkB1. migration.test pins the list as a literal and as `ENTITY_COLUMNS.slice(FIRST_SCHEMA5_COLUMN)`. NEG_ONE_DEFAULT gains trapSlot and heldBySlot. `FLAG.restNewborn` is `1 << 14`, and bit 12 carries a never-reuse comment.
- VERIFIED OK [schema5] — `COLUMNS_ADDED_IN[4]` is a frozen literal of 25 names. It is pinned both as a literal and as `ENTITY_COLUMNS.slice(FIRST_HASH_NEUTRAL_COLUMN, FIRST_SCHEMA5_COLUMN)`.
- VERIFIED OK [schema5] — the 4 → 5 migration works by copy. It adds the empty stores and nextDeviceId 1, and it adds the 12 columns to held-sample rows. migration-schema5 runs all five rc1 saves through loadSaveFile:
  - hashAtLoad, hashAfterResume, hashPlus1000 and digestPlus1000 equal the corpus;
  - `migratedFrom` is [4] and the input is untouched;
  - the v1.0 sample fails `decodeSample` without the step and decodes with it.
- VERIFIED OK [schema5] — stateHash neutrality. Each new store, counter, setting and column is hashed only while it is non-empty, and the held sample drops schema 5 columns that are empty in every row. world-stores-5 checks that each toggle moves the hash and that clearing it restores the hash. gateTally is never hashed, and it is registered as derived in the trajectory helper.
- VERIFIED OK [schema5] — every save is schema 5. The schema 6 refusal holds: kind 'version', "needs a newer version". The rc1 quote is correct: `git show v1.0.0-rc1:src/persistence/saveFile.ts` line 280 is ``fail('version', `This dish needs a newer version of Pixelmeba (save schema ${String(f.schemaVersion)}).`);``.
- VERIFIED OK [schema5] — the import hook. It is one call right after phase3StateProblem, and it reads the dish's own recorded `enabledSystems` and `enabledStructures`, never a build constant. Every Build 6 refusal has a parseSaveFile test (kind 'integrity', its own sentence, "Nothing was loaded.").
- VERIFIED OK [schema5] — the CT §5.3 matrix. edgeFactor and edgePermits match the table row for row (I checked against the CT §5.3 lines). The S04 channel is closed to ordinary crossing, per D-0106. Deposits cross nothing.
- VERIFIED OK [schema5] — barriers.ts and devices.ts are pure. They import only constants, entities, fields (types) and grid, draw no randomness, and sum resin amounts in RESIN_TARGETS order, never in key order. The caps (512 edge barriers, 256 devices shared) match CT §4 and §14.
- VERIFIED OK [schema5] — registry needs. speciesSystemNeeds adds SIGNAL_GLOW → signals, RIVALRY → rivalry and SHELL → silicate. MODULE_SYSTEM_NEEDS adds E02 and E11. The tests cover B09, B13, A02, P05, E02 and E11, each refused without its system and accepted with it.
- VERIFIED OK [schema5] — ownership. No edits to src/worker, constants.ts, transport.ts, content, art, tools or tests/fixtures. PROTOCOL_VERSION is unchanged.
- VERIFIED OK [art-small] — every old frame is unchanged. My own probe (tmp/verify-g5-wave-8a-0/atlas-probe.mjs) compared every frame of the v1.0.0-rc1 atlas (`git show v1.0.0-rc1:public/atlas/*`) with the rebuilt one:
  - all 856 frames match in pixels and in metadata other than x/y: 0 differ, 0 missing;
  - the old sprite, feature and tile tables are identical;
  - the sheet is 1024×1024 in both; the new sheet has 1342 frames, and organisms.png is 286,334 bytes.
- VERIFIED OK [art-small] — the atlas is current and content validates. `npm run art:build -- --check` reported "atlas up to date · 1342 frames (112 feature-mark frames, 13 world-tile frames) · 1024×1024", and the PNG and manifest were byte-unchanged afterwards. `npm run content:validate` passed with contentHash b8ddc0dd… unchanged, nothing enabled.
- VERIFIED OK [art-small] — the palette. Every UX §6.1 Phase 5 hex value (the 13 small species and 6 large) matches the assignment's table.
- VERIFIED OK [art-small] — each colour shows only its state. Lime appears only in `glow_center/1`, the trap loop only in F03 `trap` frames 0 and 1, and amber only in `mode_half/1`. Headings and loops follow each record's `speed` and `headings` (A03 has 4).
- VERIFIED OK [art-small] — validator and build checks. `dormant` and `trap` are exactly 3 frames, and NATIVE_MARKS is enforced by both art-build (every sprite) and content:validate (enabled species). The atlas height cap message matches the assignment. The tests construct a failing input for each check.
- VERIFIED OK [art-small] — I looked at the preview sheets for A04, F04, B13, V02 and B09. Grayscale silhouettes are distinct, F04's dormant frame is a lone ringed speck, and B12 Resting is folded. No pose implies an action the body is not doing.
