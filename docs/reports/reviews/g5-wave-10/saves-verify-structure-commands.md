# Wave 10 · saves and determinism verify · structure-commands

Lens: saves and determinism only. The work under review is uncommitted in the tree, alongside the other wave 10 builders' work. I edited no tracked file. My probes are in `tmp/verify-saves-g5-wave-10-1/` (`probe.test.ts`, run with its own `vitest.config.ts`).

**Verdict: ok.** I found no BLOCKER or MAJOR problem. There are two MINOR items: a coverage gap in the task's own tests, and a stale test pin that belongs to barrier-transport.

## Problems (most severe first)

- **MINOR [structure-commands]** `tests/sim/structure-determinism.test.ts:153-185`: the per-kind cases never exercise three paths.
  - **The gap:**
    - The `base()` and `kindBase()` worlds hold no fungal or adhesion link, so no per-kind "reload equals, then +300 equal" case runs severing. Severing writes link columns, adhesion lockouts and `linkBroken` events.
    - No per-kind case moves a basket that carries its object (the `relocateObject` path).
    - No per-kind case removes a resin with bound > 0 (the `exported` path).
  - `structure-links.test.ts` round-trips only at the moment of the cut. It never continues afterwards, and it never compares the paused and queued paths.
  - **Repro:** my probe `probe.test.ts` "reload right after each case" covers all of this, and it passes. Its six cases are: S01 cuts a fungal link, S01 cuts an adhesion link, closing a shutter cuts, the basket carries its pellet, a resin with bound {inhBact 1.25, rival 0.5} is removed along with the basket, and a shutter is removed. Each case runs on both paths:
    - the reload equals the world, and so does a second-generation reload;
    - both stay equal for +300 ticks;
    - paused + 301 equals queued + 300;
    - the material totals are unchanged;
    - host-style Undo gives the pre-command hash.
  - **Fix:** add these cases to the tracked file. This is not a defect today, but nothing tracked pins it.
- **MINOR [barrier-transport]** `tests/sim/world-stores-5.test.ts:235`: the `a.gateTally` pin is stale.
  - Barrier-transport's gate tallies now also count co2, nutrient and oxygen flux.
  - The 4× = 1× hash checks at lines 229 and 232 still pass. Only the pinned TALLY value fails, so this is not a determinism failure.
  - **Repro:** `npx vitest run tests/sim/world-stores-5.test.ts` gives 1 failed: "expected [ …(3) ] to deeply equal [ …(2) ]", with id 1 fields `co2 0.000133…`, `nutrient 0.0000887…`, `oxygen 1.2502…`.
  - Nothing in structure-commands touches this path.

## Verified OK

- **The task's six test files** — `npx vitest run` on structure-commands, structure-lab-edits, climate-commands, structure-links, structure-determinism and structure-commands-host gives 6 files and 96 tests passed (371 s).
- **The fence and the saves corpus are unchanged** — `npx vitest run` on `tests/fixtures/g2-replay.test.ts`, `rc1-replay.test.ts`, `trajectory-fence*`, `conservation-closed-lid.test.ts`, `determinism.test.ts`, `tests/persistence/phase5-import.test.ts` and `migration-schema5.test.ts` gives 10 files and 109 tests passed.
  - The g2 saves and the rc1 corpus (D-0101) load and continue bit-identically.
  - The schema 5 import checks pass unchanged.
- **Regression tests in the saves area** — host, sample-transaction, whatif, challenge-host, links, food-objects and lab-commands all pass (130 of 131). The one failure is the world-stores-5 tally pin above.
- **1× vs 4×, and saves at awkward moments, with the cuts inside the window** — this probe queues commands at t0+37, +100, +150 and +151: placeEdges S01 cutting a fungal and an adhesion link, closing a shutter, moving a basket, removing a resin, reopening the shutter, removing the shutter.
  - `run(w, 400)` equals four `run(w, 100)`.
  - A save, load and continue chain at t0+37 matches the uninterrupted run. At that point the commands are still pending, and the pending payloads are hashed through canonicalJson.
  - So do saves at +38 (right after the cuts were applied), +100 (pending), +151 and +400.
- **The wetting brush and moisture across a reload** — with drying on and moisture already allocated by stage 2, a wetBrush on both paths reloads with an equal stateHash and an equal `derived.moisture` array, and stays equal for +300.
  - A wetBrush that allocates moisture (null before, drying off) has `derived.moisture` equal to its reload. `applyNow` calls updateDerived, which runs `deriveClimateMoisture`.
- **Held sample in a dish with structures:**
  - I took an E12 pair in a dish holding an S01, a shutter, a basket and a resin, saved while the sample was held, and loaded it. The load's hash equals the original's.
  - Transferring across an S01 in both worlds gives identical results (`severed: 1`) and an identical hash. The reload equals the original, and it stays equal for +200.
  - A Take in "all" mode over the basket cell takes the pellet whole and leaves the basket. Saved while held, the reload hash equals the original, and the Transfer result and hash are identical afterwards.
  - The host refuses every new kind while a sample is held: `WHILE_HELD` at `host.ts:411` is an allow-list. So no structure command can make `heldPlacementProblem` refuse with "the sample's command is not the dish's latest".
- **A v1.0 dish keeps its recorded rules** — availability reads `world.content.manifest` (`gates.ts:18,33`), never the live registry.
  - On the shipped clearWater dish, all 8 kinds are refused with a note ending "not in this dish".
  - `serializeWorld` differs only in `commands.nextSeq` and `commands.log`, `counters.nextEventId`, and `events.ring` and `events.totals`. This is the same bookkeeping as any refused v1.0 command, and the host test checks it honestly against a twin.
  - The reload hash equals the original. The stores stay empty, moisture stays null, and the light stays fixed.
- **No new saved state, and new keys appear only when used:**
  - There is no new World key and no schema change.
  - `ids`, `refused`, `exported`, `severed` and the `device` and `barrier` skip keys appear only when used. They live only in command-log results, which stateHash does not hash (`serialize.ts:380` hashes pending payloads and nextSeq only).
  - Edges are sorted by edgeKey and devices by cell. Ids are ascending from `nextDeviceId` and never reused.
  - `relocateObject` replaces the record in place, so id order holds and every FoodObject field is kept (`objects.ts:34-43`).
  - `bound` keys are summed in `RESIN_TARGETS` order.
  - canonicalJson drops undefined keys and sorts keys (`hash.ts:88-108`). So a payload with `open: undefined` hashes the same live and after a reload.
- **Import invariants hold for everything the commands can produce:**
  - **Edge and device caps:** the 512 edge cap and the shared 256 device cap match `edgeStoreProblem` and `deviceStoreProblem`.
  - **Device cells and S04 channels:** devices sit only on ST_NONE cells, and an S04 joins only open water. The Lab edit refusals (D-0111) keep both rules true.
  - **New devices:** an S08 is placed with `resinSelect: []` and no bound, and an S09/S10 with `on: false`. Both forms are accepted.
  - **Gate tallies:** tallies of removed structures are kept, and their ids stay below `nextDeviceId`, which `gateTallyProblem` (`phase5State.ts:105`) accepts.
  - **Light cycle:** `cycleStartTick` is at most the current tick on both paths, and it is deleted when the light goes back to fixed.
- **Conservation:**
  - computeTotals c, n and m are exactly equal before and after every probe case.
  - The resin targets inhBact, inhFung, inhPhoto and rival are all `material: 'none'` (`fields.ts:111-124`), so exporting bound activity without a ledger line is correct.
  - The task's closed-lid run with all 12 kinds over 10,000 ticks passes.
- **Caches and geometryVersion:**
  - The edge, device, attachment and transport caches are keyed per world object (WeakMap or the transport cache) on geometryVersion plus the store's identity and length. Every accepted store write in `structureEdits.ts` replaces the array and bumps the version once.
  - My power probe imitated a bad writer that closes a shutter in place without a bump. The reload-and-continue check detects it.
  - Moving a heater in place without a bump is not detected, and that is by design: the warmth and roof caches compare content (`climate.ts:180-187, 341-356`), so they cannot go stale.
- **Undo** — host-style `serializeWorld` before the command, then `deserializeWorld`, gives the pre-command stateHash. The task's tests show this for all 22 cases, and my probe shows it for the cut, basket and resin cases.
- **Simulation randomness** — `structureEdits.ts`, `structurePreview.ts` and the `challenge.ts` and `CompareText.tsx` additions draw no randomness. They contain no `Math.random`, no `Date`, and no iteration over Maps, Sets or object keys. Cuts run in ascending slot order, so their event order is deterministic.

## Evidence (commands run in this session)

- Six task files: `npx vitest run tests/sim/structure-commands.test.ts tests/sim/structure-lab-edits.test.ts tests/sim/climate-commands.test.ts tests/sim/structure-links.test.ts tests/sim/structure-determinism.test.ts tests/worker/structure-commands-host.test.ts` gave 96 passed.
- Fence, corpus and import: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/persistence/phase5-import.test.ts tests/persistence/migration-schema5.test.ts` gave 109 passed.
- Regression: `npx vitest run tests/worker/host.test.ts tests/worker/sample-transaction.test.ts tests/worker/whatif.test.ts tests/worker/challenge-host.test.ts tests/sim/world-stores-5.test.ts tests/sim/links.test.ts tests/fixtures/food-objects.test.ts tests/sim/lab-commands.test.ts` gave 130 passed and 1 failed (the world-stores-5 tally pin).
- Probes: `npx vitest run --config tmp/verify-saves-g5-wave-10-1/vitest.config.ts` gave 13 passed. The output includes "BUMPSKIP shutter detected" and "BUMPSKIP heater-move NOT DETECTED"; the second is the content-keyed warmth cache, which is correct.
