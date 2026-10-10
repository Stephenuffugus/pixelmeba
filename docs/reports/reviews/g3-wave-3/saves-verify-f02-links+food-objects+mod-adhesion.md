# g3 wave 3: saves and determinism verify for f02-links, food-objects and mod-adhesion

Lens: saves and determinism only. Probes are under `tmp/verify-saves-1/` (git-ignored): `common.ts`, `f02.test.ts`, `objects.test.ts`, `adh.test.ts`, `sample.test.ts`, `params.test.ts`, `species.test.ts`. Run them with `npx vitest run --config tmp/verify-saves-1/vitest.config.ts <file> --silent=false`. No tracked file was edited, except this report.

**Verdict: ok = false.** There is one MAJOR, in food-objects. Determinism and save/reload hold for all three tasks at every awkward moment probed.

## Problems (most severe first)

1. **MAJOR [food-objects] src/sim/objects.ts:122-138 (`foodObjectProblem`) with :292 (`objectReleasePlan`) / :322 (`releaseOne`).**
   - What is wrong: the import accepts an object whose pools are not its kind's pools (a pellet holding starch, or a wafer holding sugar).
   - Why it matters: release iterates only the `FOOD_OBJECT_RULES[kind]` pools. It finds those empty, treats the object as emptied, and removes it with the other carbon still inside. That carbon is destroyed on the first tick: a silent conservation break and a ledger failure.
   - The builder's report says such an object "would keep it forever". That is wrong: the carbon vanishes.
   - Repro (`tmp/verify-saves-1/adh.test.ts`, "pellet holding starch / wafer holding sugar, carbon-equal"):
     1. In `clearWater()`, use the helper `placeObject` to place a wafer {starch 1} (or a pellet {sugar 1}) with n 0.1, then `buildSaveFile`.
     2. In the file, set the object's kind to `pellet` with pools `{starch: 1}` (or `wafer` with `{sugar: 1}`).
     3. Recompute the checksum (`sha256Hex(canonicalJson(state))`). `loadSaveFile` accepts the file.
     4. `checkLedger` is ok right after the load. After one `step` it fails (relErr c 1.77e-4), with objects 0 and objectEmptied 1.
   - Fix: refuse any pool outside `FOOD_OBJECT_RULES[kind].pools` in `foodObjectProblem`, which `foodObjectsProblem` uses for imports. The refusal then reads "The dish's food objects cannot be loaded (…). Nothing was loaded."
   - Related, older and not owned by this wave: the import never checks that the ledger closes. A file whose object carbon disagrees with `ledger.inputs` loads with `checkLedger` already failing.

2. **MINOR [mod-adhesion] src/persistence/saveFile.ts (column checks, ~:330), state used by src/sim/adhesion.ts.**
   - What is wrong: the E12 pairing columns are checked only for finiteness on import. The import accepts states the simulation can never produce:
     - `adhLockout` < 0, or far above `lockoutSeconds` (1e12 is accepted and locks that organism out for ever);
     - `adhSeconds` < 0, which delays a link, or above `linkSeconds`;
     - `adhPartner` set to a birthId that does not exist;
     - non-zero adhesion values on a dead slot, which are then hashed.
   - Repro: `adh.test.ts` "import probes: adhesion state". Each of the five edits, with a recomputed checksum, is accepted.
   - Effect: the world stays deterministic and the ledger is not touched, but the import is not canonical.
   - Suggested refusals: `adhLockout` outside [0, lockoutSeconds]; `adhSeconds` outside [0, linkSeconds]; any value other than 0 on a dead slot or on an organism that does not carry E12.

3. **MINOR [lead] src/persistence/saveFile.ts:284.**
   - What is wrong: imported module records go through `ModuleSchema` only. `missingModuleParams` (from moduleRules.ts, which registry.ts uses) is never applied.
   - Repro (`tmp/verify-saves-1/params.test.ts`):
     1. Save a world whose manifest enables E12.
     2. Delete `content.modules[E12].params.linkDistance` and recompute the checksum.
     3. `loadSaveFile` accepts it. The first `step` then throws "E12: recorded parameter linkDistance is missing" (adhesion.ts:78).
   - Effect: the import replaces the current world with one that cannot run.
   - This pattern is older than this wave: phenotype.ts `param()` throws the same way for E01 and others. E12 only inherits it.
   - Fix: refuse any module whose `missingModuleParams` result is not empty, with "… Nothing was loaded."

4. **NIT [f02-links] src/sim/publish.ts:51.**
   - What is wrong: the comment says "only in a dish whose species form them". The shipped manifest now enables F02, so every new dish has F02 in `world.species` and `worldHasTransport` is true for all of them.
   - Effect:
     - Every sample of every new dish carries `fungalTransfer: 0`. A clear-water FIRST_DISH sample has the key (`species.test.ts`).
     - The transport pass scans every slot on every tick.
   - This is observation only. It is not hashed and has no effect on determinism. The gate does not do what the comment says.

## VERIFIED OK

- **f02-links: save/reload at awkward moments.**
  - Setup: a growing gel F02 network (a 4-chain with unequal B and two loose segments, sugar 0.4). First branch at tick 27; at least 770 ticks with transfer; 11 births and links. Ledger ok, relErr 4e-14.
  - A `.pixelmeba` save was built and loaded at ticks 0, 1, 5, 7, 13, 26, 27, 28, 29, 33, 37 and 38. These cover mid-second, the tick before and after the first branching link, and transfer in progress.
  - Every save continued to tick 328 with the stateHash equal to the uninterrupted run at every tick. `linksValid` held every tick.
  - Re-serializing the loaded world gave the file's state byte for byte (canonical).
  - History, including the saved `pendingFungalTransfer` and the `fungalTransfer` samples, was equal at the end.
  - Hand E212 chain: saves at ticks 0–11, 19, 20 and 21 (every tick of the first two seconds) also passed. `pendingFungalTransfer` of 0.01 survives a mid-second reload.
- **f02-links: 1× and 4×.** Over 800 ticks of the growing network, `run(w, 800)` = 800 single `step`s = four `run(w, 200)` quarters with serialize round-trips: `5040e4dce4843c75` for all three.
- **f02-links: slot order.** With the chain placed in reversed slot order, the pools are identical after 50 ticks.
- **f02-links: `fungalFlow` is observation only.** It is not saved or hashed and the simulation never reads it. The hashes above still match after reload, while `fungalFlow` starts empty.
- **food-objects: save at every tick 0–16, continued to 80.** The dish had B01 feeding, two nearly empty hand objects that empty inside the window, and queued `placeObject` commands at ticks 3, 6 and 8 (8 is refused as occupied), held in the save before they apply.
  - Every continuation matched the hash at every tick, was idempotent and had equal history. `checkLedger` was ok every tick, and objectEmptied fired twice.
- **food-objects: 5,000-tick pellet and wafer.**
  - Saves at 0, 1, 4997, 4998, 4999, 5000, 5001 and 5002 continued identically to tick 5010.
  - Both objects emptied, and the ledger closes (c relErr 0, n 2e-16).
- **food-objects: 1× and 4×.** Over 80 ticks, run = loop = quarters: `7812c7959b7089e0`.
- **food-objects: hashing.** `world.objects` (canonicalJson) and `nextObjectId` are hashed only when non-empty (serialize.ts:280-282), so an empty store is hash-neutral. Hashing is deliberate once the store has objects.
- **food-objects: other import refusals.** A negative pool, a non-numeric n, an id ≥ nextObjectId and a duplicate cell or id are each refused with a message ending "Nothing was loaded."
- **mod-adhesion: saves around linking and lockout.** The dish was a busy E12 dish (40 carriers and 4 Grazers). Links form at 49, breaks happen at 63 and 108, the clock is mid-pairing around tick 20 and in lockout around 94.
  - Saves at 3, 48, 49, 50, 51, 62, 63, 64, 113, 162, 163 and 164 continued to tick 700 with the hash equal every tick and `linksValid` every tick. They were idempotent with equal history.
- **mod-adhesion: 1× and 4×.** Over 600 ticks, run = loop = quarters: `a7fa53cf9ad92130`.
- **mod-adhesion: off when not enabled.** A FIRST_DISH world under the E12-enabled registry with no carriers matches the shipped registry over 300 ticks. The x, y, B, E, N and adh* column bytes are identical, so E12 has no effect when unused.
- **mod-adhesion: no randomness.** No RNG is drawn: adhesion.ts, fungalTransport.ts and objects.ts import nothing from rng.
- **Held sample (tools-sample × E12/F02).**
  - Cases: a 4-member linked E12 colony (with mid-clock state) and a 3-segment F02 transport chain, each taken as a sample.
  - Each was saved while held, loaded through both the `.pixelmeba` path and the serialize path, then transferred and run 120 ticks.
  - The three worlds had identical hashes and `linksValid` held throughout.
- **g2 saves and the fence.**
  - `g2-replay`, all four `trajectory-fence*`, `determinism`, `deterministic-state`, `tests/persistence/*`, `fungal-transport`, `fungal-links` and `fungal-branching`: 14 files and 110 tests passed.
  - `food-objects`, `module-e12`, `conservation-closed-lid`, `registry-imports` and `worker/host`: 5 files and 51 tests passed.
- **Randomness outside src/sim.** The only `Math.random` uses outside src/sim are the existing seed and id generation in NewDish.tsx, state.ts and checkpoints.ts. Nothing outside src/sim calls `detFloat` or uses `STREAMS`.
- **New events.** linkFormed, linkBroken, linkRefused and objectEmptied are not hashed, and `nextEventId` is not hashed, so the F01 branching events and the fence are unaffected.
