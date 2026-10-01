# g3 wave 3 — saves/determinism verify: tools-sample (P3.5)

Lens: saves and determinism only. The tree was not edited; the probes are under tmp/verify-saves-0/.

MAJOR [tools-sample] src/sim/sampleSlot.ts:303-371 (savedSampleProblem / heldRowsProblem), wired at src/persistence/saveFile.ts:474 — The import does not check where the held sample sits or whether it clashes with the world's own stores. Each case below loads without complaint, and Cancel then either loses carbon or leaves a world that this build's own import refuses, so the next autosave cannot be loaded:
  - (a) An origin or cell offset that points off the grid (origin [5000,5000]). The file loads, but Cancel writes the field values to out-of-range indices and they vanish: checkLedger ok=false. An offset of dx −60 wraps into the previous grid row, outside the mask.
  - (b) A held food object whose id equals a world object's id. The file loads and Cancel gives objects [2,2]. Saving that world and loading it again is refused with "food object ids are out of order. Nothing was loaded."
  - (c) A held object on the cell of a world object. Cancel succeeds, and the re-import is refused with "two food objects share cell 10320".
  - (d) sample.seq is never compared with commands.nextSeq. With seq 999999, Cancel sets nextSeq to 999999.
  - (e) radius 0 is accepted, though only 1/3/6 are valid. A held row's birthId ≥ counters.nextBirthId is accepted, and so is a held row x,y outside the dish (the world rows are not position-checked either).
  - Repro: tmp/verify-saves-0/import.probe.ts (`npx vitest run -c tmp/verify-saves-0/vitest.config.ts tmp/verify-saves-0/import.probe.ts`, output in tmp/verify-saves-0/import-out.txt). Each case edits the saved sample of a busy clear-water dish, recomputes the checksum, then loads it, cancels and saves again.
  - Fix: check held cells and objects the way foodObjectsProblem checks world objects (in the dish, on no structure, no id or cell shared with world objects, id < nextObjectId), and add seq < nextSeq, radius ∈ {1,3,6} and birthId < nextBirthId.

MINOR [tools-sample] src/sim/sample.ts:337-345 (cancelSample, event ring) — Cancel is not byte-exact once the 500-event ring is full. The take's 'command' event, and each refused transfer's event, push out the oldest event. Cancel pops the new events but cannot bring back the ones that were pushed out.
  - The stateHash is unaffected, because events are not hashed. The saved `events` record does differ from the pre-begin save: ring 500 → 498, and the first id goes from 2 to 4.
  - The same applies to commands.log once it reaches its cap of 10,000 entries.
  - Observation records only, but "Cancel restores the pre-begin state exactly" holds only for the hash, not for the save bytes. Either keep the evicted entries in the held slot, or document the gap.
  - Repro: tmp/verify-saves-0/ring.probe.ts (output in ring-out.txt).

VERIFIED OK — Determinism of Take/Transfer/Discard/Cancel/Clean water on real recipe dishes — tmp/verify-saves-0/sample.probe.ts
  - Dishes: FIRST_DISH_V1 at tick 1500 (161 organisms, with P01/X01/V01 inoculated) and PREDATOR_BALANCE_V1 at tick 1500. The sample spot was an organism with a valid claimed prey, in modes life and all.
  - Paths: in memory, reload in the middle of the transaction (raw state and the .pixelmeba file), and reload right after the transfer or discard.
  - Each path then ran 400 more ticks, once as run(400) and once as 4 × run(100).
  - Every op gave one identical final hash across all 8 path/speed combinations. checkLedger was ok and inactiveFieldsNonZero was empty.
  - Result: "Tests 2 passed", 363 s; log in tmp/verify-saves-0/probe-out.txt.

VERIFIED OK — Cancel is exact for the future, not only the hash.
  - Take, then a refused transfer, then Cancel, done in memory, after a reload, and after a file round trip. Each gave the pre-begin hash and the same hash as the never-sampled world 400 ticks later, on both recipes.
  - The saved bytes were equal to the pre-begin save while the ring was below 500.

VERIFIED OK — Whole units across reload — tmp/verify-saves-0/links.probe.ts. Two dishes, each taken in all mode at radius 3, then transferred and run 300 ticks:
  - a 4-segment F01 chain on GEL_COLONY;
  - an A01/X01 host pair.

  Results:
  - Cancel futures equal the reference.
  - The transfer gives one final hash across mem/reload/file × 1×/4× (6 of 6 equal).
  - linksValid holds and host pairs are mutual after the transfer.
  - The hash right after the transfer equals the hash after a reload.

VERIFIED OK — Empty slot is hash-neutral. stateHash adds 'sample' only when world.sample !== null (serialize.ts:280), and Transfer and Discard set it back to null. The g2-replay and trajectory fence tests pass unchanged: `npx vitest run tests/sim/tools.test.ts tests/worker/sample-transaction.test.ts tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence-arms.test.ts tests/fixtures/trajectory-fence-current-arms.test.ts` → "Test Files 5 passed (5) · Tests 41 passed (41)".

VERIFIED OK — The saved form is canonical.
  - Rows are typed per column (−0 survives), in ascending slot order.
  - Cell ids are sorted in encodeSample, and sampleTotals sorts keys, so Discard exports the same float sum before and after a reload. The probe's discard futures are equal.
  - Objects are kept in id order, and Cancel and Transfer re-insert them with insertObject.
  - The hash reads canonicalJson(encodeSample(...)).
  - txId contains no worldId.

VERIFIED OK — EntityStore.allocateAt plus free keeps lowest-free-first allocation. freeHint stays ≤ the first free slot, and highWater is restored. The probe's discard path uses allocateAt, then free, then runs, and matches across reload.

VERIFIED OK — Accounting.
  - The sample is part of computeTotals, so Take and Transfer are internal moves.
  - Discard exports exactly sampleTotals.
  - Clean water ledgers the CO2 difference.
  - checkLedger was ok after every op and 400 ticks later in all probe paths.

VERIFIED OK — No randomness or wall-clock is used in the new code. sample.ts, tools.ts, sampleSlot.ts and the Sample UI files contain no Math.random, Date or detFloat. The one unsorted Object.keys (sample.ts:281) only writes zeros, so its order does not matter.

VERIFIED OK — The D-0043 import refusals are present: negative pool, unknown life state, slot or birthId shared with a living organism or another held row, and asymmetric held links. Each ends "Nothing was loaded." (tools.test.ts import case passes).
