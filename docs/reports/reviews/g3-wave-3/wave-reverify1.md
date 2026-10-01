# g3-wave-3: re-verify, round 1

Scope: the round-1 fixes from f02-links, food-objects and tools-sample. For each, I reproduced the original finding against the current tree, ran load-time mutants under tmp/reverify1-g3-wave-3/, and re-ran the fence fixtures and the full `npm run check`. No tracked file was edited; this report is the only exception.

**Result: ok = false.** All seven round-1 problems are fixed or documented. However, the full `npm run check` is still red, with 4 failures in 3 test files that the round-1 fixers did not run. All 4 come from the wave's manifest edits.

## Problems (most severe first)

MAJOR [f02-links] tests/fixtures/film.test.ts:385 and :402. The round-1 fix ("npm run check red") is incomplete: enabling F02 still fails 2 film tests.
- **Cause:** both tests build a "no film, no fungi" registry by removing only B02 and F01 from the shipped species. F02 stays in, and content validation refuses it: `enabled species "F02" uses BRANCHING, which needs the "fungi" system (not in enabledSystems)`.
- **Repro:** `npx vitest run tests/fixtures/film.test.ts -t "film as detritus food"` gives 2 failed (log: tmp/reverify1-g3-wave-3/film.log).
- **Fix (checked):** add `&& s !== 'F02'` to both filters. With that change, film.test.ts passes (tmp/reverify1-g3-wave-3/fix_tests.json, fixtests.log).

MAJOR [f02-links] tests/fixtures/host-specificity.test.ts:94. Enabling F02 fails "a dense dish of every enabled species … infects only Sprinters": `expected [] to deeply equal ['B01']`.
- **Cause:** this is a layout problem in the test, not in the sim. `populate` places each species at x = 32.5 + ((k·6+n) % 64), all in the same rows. With 18 species the x positions wrap round, and F02 moves every later species up one index. P02, which hunts Sprinters, now lands on the Sprinters' cells, and every B01 is eaten before tick 100, before any infection.
- **Attribution probe** (tmp/reverify1-g3-wave-3/hosts.probe.ts, hosts-out.txt):
  - All species enabled: infectedBy {}, B01 alive at ticks 0, 100, 200…: 6, 0, 0, 0, 0, 0.
  - F02 removed: infectedBy {"B01": 420}, B01 alive: 6, 4, 1, 0, 0, 0.
- **Fix (checked):** move wrapped species to a separate band, e.g. `y = … 50.5 + (n % 6) + 8 * Math.floor((k * perSpecies + n) / 64)`. With that change the test passes, and the ledger closes.

MAJOR [e1-producers] tests/sim/chemistry.test.ts:303. Enabling M01 (Soluble broth, kind 'field') fails "every enabled material input is ledgered …": the received list has an extra `M01` after `INH_PHOTO`.
- **Fix (checked):** add `'M01'` to the expected list after `'INH_PHOTO'`. The test then passes, and its loop also checks M01's ledger entry and companion N.

All three fixes above were checked together as load-time transforms: film, chemistry and host-specificity pass 32/32 (tmp/reverify1-g3-wave-3/fixtests.log). The full `npm run check` log is tmp/reverify1-g3-wave-3/check.log: typecheck and lint pass; tests show 3 files failed, 125 passed, and 4 tests failed, 1341 passed.

MINOR [tools-sample] src/sim/sample.ts:308-317 (cancelSample). This is the round-1 event-ring / commands.log cap finding. It is not fixed, but it is documented.
- **Why it holds:** D-0037 defines "exact" as "The stateHash equals the pre-begin hash, also after a save and reload in between." The event ring and log cap are not hashed, and the doc comment now says so.
- **Action:** the lead should log the fixer's PROPOSED DECISION in DECISIONS.md. This does not block.

## VERIFIED OK

- **VERIFIED OK: [food-objects] pools outside an object's kind are refused** (both MAJOR reports).
  - **Code:** `foodObjectProblem` (objects.ts:136-142) refuses any pool not in `FOOD_OBJECT_RULES[kind].pools`. createObject, the save import and held-sample objects all use this check.
  - **Original repro:** the verifier's obj-leak repro now stops at `placeObject: refused (invalid)` (tmp/reverify1-g3-wave-3/obj-leak.log).
  - **Held sample:** my import probe's held "pellet with starch" is refused with "a pellet cannot hold starch … Nothing was loaded."
  - **Mutant:** removing the check fails 4 named tests in food-objects.test.ts ("an object holds only its kind's pools …").
- **VERIFIED OK: [food-objects] release runs in stage 3, before enzymes.** Moving `releaseFoodObjects` after the enzyme loop fails "release runs in stage 3 before enzymes: a wafer's first starch is catalysed in the tick it is released" (m_order.log).
- **VERIFIED OK: [f02-links] diet-line and comprehension-labels M5.**
  - Both pass.
  - "Eats sugar, then debris." matches F02 foodPriority ["sugar", "detritus"].
  - The M5 sentence now names the Cordweavers' enzyme, which matches F02 nativeAbilities E_STARCH_SECRETION.
- **VERIFIED OK: [f02-links] only Active segments take part in transport.**
  - Removing the lifeState check on the donor end (m_active) fails the named test.
  - Removing it on the partner end (m_active_p) fails the same test.
- **VERIFIED OK: [tools-sample] import placement checks** (MAJOR (a)-(e)). I re-ran the verifier's tamper probe, adapted to sugar pellets (tmp/reverify1-g3-wave-3/import.probe.ts, import-out.txt).
  - **Refused**, each ending "Nothing was loaded.":
    - a cell offset off the grid
    - an origin at [5000,5000]
    - a held object id equal to a world object's id
    - a held object on a world object's cell
    - an object id at or above the object counter
    - a row outside the dish
    - seq 999999
    - radius 0
    - birthId 99999
  - **Untouched file:** still loads; Cancel closes the ledger and gives the original hash.
  - **Mutants:** switching off any of these fails the named test "where Cancel would put it back …":
    - the whole placement check (m_placement)
    - the seq check (m_seq)
    - the object clash check (m_objclash)
  - **No false refusals of real saves:** while a sample is held, the host accepts only sampleTransfer and sampleDiscard (host.ts:276, :603). So a real save always passes the "take is the latest command" rule.
- **VERIFIED OK: [tools-sample] Transfer's habitat and soft-capacity-8 checks are now tested.**
  - Disabling the habitat check (m_habitat) fails "habitatCompatible: a water-only A01 is refused onto sediment …".
  - Disabling the capacity check (m_softcap) fails "soft capacity 8 …".
- **VERIFIED OK: fence and trajectory.**
  - g2-replay, the four trajectory-fence files and conservation-closed-lid: 6 files, 45/45 passed (fence.log).
  - fence.json diff: 36 insertions, 0 deletions, so it only adds.
- **VERIFIED OK: builders' tests.** food-objects, fungal-transport, fungal-links, tools, sample-transaction, diet-line, comprehension-labels and world-stores: 8 files, 93/93 passed (builders.log).
- **VERIFIED OK: typecheck and lint.** Within `npm run check`, `tsc --noEmit` and `eslint .` both pass.
- **VERIFIED OK: edits outside each task's own files are declared and minimal.**
  - f02-links edited tests/ui/diet-line.test.ts and comprehension-labels.test.ts, as the verifier told it to.
  - food-objects changed one token in the tools.test.ts busyDish fixture (starch to sugar), which the new rule requires.
