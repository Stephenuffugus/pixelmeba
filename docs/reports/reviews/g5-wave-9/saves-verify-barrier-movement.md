# Wave 9: saves and determinism check of barrier-movement

- **Scope:** the saves/determinism lens, applied to the uncommitted barrier-movement work in the shared tree. That tree also holds climate-stage2's in-flight work.
- **Result:** ok = true. I found no BLOCKER or MAJOR problems. There are two MINOR problems, listed most severe first, then the parts I verified.
- **Constraints:** I edited no tracked file except this report. My scratch files are in `tmp/verify-saves-g5-wave-9-1/`: `probe.test.ts`, `attr.test.ts`, `vitest.config.ts`, `probe.log`, `probe.out` and `fence.log`.

## Problems

1. MINOR [barrier-movement] src/sim/attachment.ts:91 — When the device store becomes empty, `attachmentMask` can keep stale mesh bits.
   - **Cause:** while `tc.attachVersion === geometryVersion`, an empty device store returns the cached mask straight away, without checking `meshBuiltFrom`. If the last device is removed without a geometryVersion bump (`world.devices = []` or `world.devices.length = 0`), the running world keeps its SURF_MESH cells. A reloaded copy rebuilds the mask without them, so the two diverge.
   - **Asymmetry:** `edgeCodesOf` and `deviceKindsOf` handle an emptied store correctly, because they return null on length 0.
   - **Repro:** `tmp/verify-saves-g5-wave-9-1/attr.test.ts`.
     - Setup: 4 S06 cells with B02 on them, run 50 ticks, then set `w.devices = []` with no bump.
     - Result: "mask cells differing 4, running world mesh cells 4".
     - In probe P2 (`probe.test.ts`), both "all devices removed (devices = []) no bump" and "(length = 0) no bump" lead to a stateHash that DIVERGES after 300 ticks. The same change with a bump stays equal.
   - **Reach today:** no writer does this yet. realizeRecipe only assigns non-empty arrays, and the tests bump. Wave 10's device-removal command is the first writer that could hit it.
   - **Fix (one line):** when `devices.length === 0`, return the cached mask only if `meshBuiltFrom.get(world) === undefined`. Otherwise fall through and rebuild.

2. MINOR [lead] src/sim/barriers.ts:32 (`EdgeBarrier.open`, mutable), src/sim/devices.ts:35 (`Device.cell`, mutable), src/sim/edgePassage.ts:87/:102 — The per-world caches key on geometryVersion, array identity and array length. An in-place write that does not bump geometryVersion therefore leaves the running dish on stale edge codes or device kinds, while a reload rebuilds them, so the two diverge.
   - **Repro (probe P2):**
     - "S03 toggled closed->open in place, no bump: DIVERGES"
     - "S03 toggled ... WITH bump: equal"
   - "A shelter moved in place, no bump" happened to stay equal in this dish only because no Medium organism reached either cell. It is the same latent hazard.
   - **Reach today:** no in-tree writer exists. `git grep` finds no `.open =` or `.cell =` writes in src.
   - climate-stage2's report shows the same class of problem for its caches.
   - **Action for wave 10 (structure-commands, barrier-transport):** every edge or device write (shutter toggle, device move, place, remove) must bump `grid.geometryVersion`. Each command test should also check that the world still equals its reload after the command. Writing that contract into the EdgeBarrier and Device doc comments would help.

## VERIFIED OK

- VERIFIED OK — **FENCE unchanged, and the builder's suites rerun by me.**
  - Command: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/sim/barrier-{movement,contacts,placement,determinism}.test.ts tests/sim/barriers-table.test.ts`
  - Result: "Test Files 13 passed (13), Tests 120 passed (120)", exit 0.
  - So the g2 saves and the rc1 corpus (tests/fixtures/saves-rc1/, D-0101) load and continue bit-identically, and v1.0 saves keep their recorded ruleset.
  - barrier-determinism also passes. It covers: run(400) equals four run(100); a save at tick 777 continued to 3,000 equals the uninterrupted run (stateHash and the 'full' digest); round trips at 0, 777 and 3,000; 10,000-tick closed-lid conservation; and the NEUTRAL dish, byte-identical to the shipped registry.
- VERIFIED OK — **Dense reload sweep in a barrier-heavy dish** (probe P1).
  - **The dish:** an S01/S02/closed-S03/open-S03/S04 line at x = 63, a horizontal S02 line that makes corners with it, a closed S01 box around one B01, 16 S05 shelters, 12 S06 meshes, B01, B02, F01, F02, P01 predators along the line, P04 on sediment beside S01, A01 with E07 carrying X01, free X01 and E12 carriers across S02, and sugar 0.8 on the far side.
  - **The checkpoints:** over 1,500 ticks the dish produced 129 birth ticks, 3 attachment changes, 2 link changes, and 7 ticks on which a predator held a target behind a refusing edge (saved just before the cancel).
  - I reloaded through both paths at 32 awkward ticks: 0–3, 9–11, 19–21, 500, 777, 1000, and event-driven ticks right after births, attachments, link formation and refused-target moments. Both paths are serializeWorld → deserializeWorld and buildSaveFile → loadSaveFile.
  - **Result:** all 64 copies equal the original's stateHash at load and 61 ticks later.
  - A fresh rerun equals the first run's per-tick hash on every tick.
  - Stepping 1 tick at a time, one `run(1500)` and four `run(375)` give equal stateHash and an equal trajectoryDigest 'full'.
  - The structures matter: the same dish without them gives a different hash.
- VERIFIED OK — **The cache keys hold for the stores' real writers** (probe P2):
  - a new device array with one S06 removed, without a bump, stays equal (the identity key catches it);
  - `edges = []` without a bump stays equal (null on an empty store);
  - every write followed by a bump stays equal;
  - realizeRecipe's assigned arrays are caught by identity.
  - The caches are WeakMaps keyed by the world object, so the several worlds in one worker (comparison, variantPair, tryDish) never share derived state.
  - The module-level scratch (WIN_MARK, startX/startY, traceCount) is fully rewritten before every read: markRefusedEdges clears all W×W cells first.
- VERIFIED OK — **No new saved state.**
  - The task adds no saved field and no column. classOf reads only saved columns: hostSlot, flags (attached, restNewborn), lifeState and species. Every entity column is serialized by slot.
  - So nothing new needs to be canonical, validated, counted or made hash-neutral.
  - edges and devices (8b) are hashed only when non-empty (serialize.ts:390-391).
- VERIFIED OK — **The D-0103 gate the builder relies on holds at the import** (probe P3). A shipped-registry dish carrying an S01 edge or an S05 device is refused:
  - "The dish has edge barriers, but its rules have no edge barriers. Nothing was loaded."
  - "The dish has furnishings or devices, but its rules have none. Nothing was loaded."
  - So no v1.0 world reaches the new paths: every new branch is gated on `world.edges.length > 0` or `world.devices.length > 0`.
- VERIFIED OK — **Float identity with no edges.** I read the diff:
  - traceFraction's new arithmetic runs only when `edges !== null`;
  - decide's prefix sum adds `blocked` unchanged when there are no edges;
  - `cls` stays null, so classOf is never called.
  - This is confirmed by the FENCE and by barrier-determinism's NEUTRAL byte-identity test.
- VERIFIED OK — **No randomness and no unordered iteration.**
  - The new code (edgePassage.ts and the diff in movement, births, fungi, contacts, parasites, adhesion, attachment, crossing and barriers) draws no RNG stream.
  - It uses no Math.random, no Date and no Map/Set/object-key iteration. The two WeakMaps are lookup only.
  - The contact and placement skips run before the distance and tie comparisons, so the order among permitted candidates is unchanged.
  - Nothing outside src/sim was touched, apart from test helpers.
- VERIFIED OK — **No new runtime throw reachable from imported state.** `pairPermitted` throws only for cells that are not neighbours. Every caller passes the parent's or hunter's own cell and a cell from a ±1 loop or a 4-neighbour.
