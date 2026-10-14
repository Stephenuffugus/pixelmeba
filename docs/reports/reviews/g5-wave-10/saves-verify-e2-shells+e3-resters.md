# Saves and determinism check: e2-shells and e3-resters (wave g5-wave-10, stage 2)

**Verdict: ok.** I found no BLOCKER or MAJOR problem.

There are two MINOR problems, both in import validation. In each, a hand-edited save file with a recomputed checksum is accepted and then crashes the simulation. The gaps predate this wave, but e2-shells' code is what now turns them into crashes. Neither can be reached by a real save while nothing is enabled (D-0104). Both should be closed before the systems flip.

I edited no tracked files. The probe scripts are in `tmp/verify-saves-g5-wave-10-2/`: `dishes.ts`, `probe-reload.ts`, `probe-interleave.ts`, `probe-import.ts`, `probe-h.ts`, `probe-h2.ts`, `probe-sample.ts`, `probe-mesh.ts` and `probe-queue.ts`. They run with `npx tsx`.

## Problems (most severe first)

### MINOR [lead] A save can list a shell builder without the silicate system
- **Where:** `src/persistence/saveFile.ts`, the import path.
- **What is wrong:** the import never checks the recorded species against the systems they need (`speciesSystemNeeds`, `src/sim/content/registry.ts:563`).
  - A save that records A02 but has `silicate` removed from the manifest, its silicate and grit fields deleted, and a recomputed checksum is **accepted**.
  - The first tick after loading then throws `stageIntake: shell builder A02 in a world without the silicate system` (`src/sim/intake.ts:358`).
- **Repro:** `npx tsx tmp/verify-saves-g5-wave-10-2/probe-h.ts` prints `ACCEPTED; systems false silicate field false species true` and then `CRASH stageIntake: …`.
  - Removing the system but keeping the fields is refused correctly ("Field silicate is not enabled by the dish's manifest.").
- **The gap is older than this wave:** `probe-h2.ts` loads X01 without `parasites` and F01 without `fungi`. Those dishes just run, because nothing in their code throws. The throw that e2-shells added on purpose is what turns the gap into a crash.
- **Fix:** apply `speciesSystemNeeds` and `MODULE_SYSTEM_NEEDS` to the save's recorded species, genomes and manifest during import. The refusal message should end "Nothing was loaded."

### MINOR [lead] Shell mineral is accepted on organisms that cannot build shells
- **Where:** `src/persistence/saveFile.ts:370`.
- **What is wrong:** `boundMineral` (and `jacketMineral`) are only checked to be non-negative. An organism without native SHELL (or without E11, for the jacket) can carry mineral.
  - In a dish without the silicate system, that organism crashes the worker when it dies: `killEntity: mineral present but the silicate system is not enabled` (`maintenance.ts:147`).
  - It also crashes when it is captured: `Cannot read properties of undefined` at `contacts.ts:138`, from `world.fields.grit!`.
  - In a silicate dish, a B01 carrying shell mineral loads without complaint.
- **Repro:** `probe-import.ts`, cases (a) and (a2):
  - (a) a shipped dish where a B01 has `boundMineral` 0.5: ACCEPTED, then CRASHED when it died of age.
  - (a2) the same B01s beside a P01: ACCEPTED, then CRASHED when one was captured.
  - (b) a silicate dish where a B01 has `boundMineral` 0.5: ACCEPTED.
- **History:** the columns date from P0/P1. e2-shells is what makes `boundMineral` carry meaning.
- **Fix:** add a rule to `organismProblem`, applied to living slots and held sample rows alike:
  - `boundMineral > 0` requires native SHELL;
  - `jacketMineral > 0` requires E11 (wave 13 can add that half).

### NIT [lead] The resting-newborn import rule allows states the simulation never produces
- **Where:** `src/persistence/phase5State.ts:68`.
- **What it allows:** `FLAG.restNewborn` is accepted on an F04 that is:
  - Preparing (c3);
  - also flagged `attached` (c4);
  - also flagged `restDry` (c5);
  - fungal-linked to another F04 (c6).
- **What the simulation produces:** under D-0106 and D-0108 the flag only ever appears while Resting or Waking, unattached, unlinked and not dry.
- **Impact:** all four loaded and kept running without error (`probe-import.ts`). Tightening the rule is optional.

### NIT [e2-shells] Grit writers do not mark the grit field
- **Where:** `maintenance.ts:148` and `contacts.ts:138` (not e2-shells' files).
- **What is wrong:** neither marks the grit field after writing it, as the builder already noted.
- **Impact:** `fieldActive` is derived and never saved or hashed, and the grit scan does not check it (D-0117). Reloading before every tick (below) shows the gap has no effect.

## VERIFIED OK

### Reloading the save before every tick
In these runs the world was rebuilt from its own save file before every tick and kept equal to the uninterrupted world each tick (stateHash), then by trajectoryDigest 'full' at the end.

- **Shell dish (`probe-reload.ts shell 500 file`):** 500 ticks; `same: true`.
  - The dish contains A02, P05, B01 and P01, scarce silicate and a grit patch.
  - The window included 6,581 SILICATE_LIMITED entity-ticks, 26 deaths, 22 captures and 67 births.
  - An in-memory serialize → deserialize run over 1,500 ticks was also `same: true`. It covered 11 ticks where shell mineral reached grit, 59 deaths, 55 captures and 530 births.
- **Resters dish (`probe-reload.ts rest 700 file`):** 700 ticks; `same: true`.
  - The window covered 8 resting daughters, each from birth through 800 resting ticks and 400 waking ticks to waking; all 8 woke.
  - It also included 1,200 entity-ticks of V02 infection, 9 wakes, 20 rests and 7 deaths.
  - So the reload landed on each daughter's birth tick, every Resting and Waking tick, and the tick where the flag clears.
- **Newborn on an S06 mesh (`probe-mesh.ts`):** the daughter sits on a water cell, so her surface depends on the device. She was born at tick 1, began Waking at 101 and became Active at 151; the mesh was removed at tick 400. Over 700 ticks, every reload stayed equal and the final digest matched.
  - The device cache is keyed per world on `geometryVersion` and the device array, so a loaded world rebuilds it.

### Run order and batching
- **Several worlds in one process (`probe-interleave.ts`):** a shell dish, a closed-lid shell dish and a resters dish were stepped alternately for 600 ticks. Each equals the same dish run alone (`shellSame: true, restSame: true`).
  - This shows that intake.ts' module-level scratch (`shellSpecies`, `demandSi`/`touchedSi`, `fracSiCell`) and viruses.ts' `candidates` do not leak between worlds.
- **1× against 4× and odd batch sizes:** `run(w, 600)` equals 600 × `run(w, 1)` and equals runs in chunks of 7 (`shellChunk1: true, shellChunk7: true`).
  - Both builders' 400 = 4 × 100 tests pass.

### Saves in the middle of an action
- **A sample held but not yet transferred (`probe-sample.ts`):** in each case below, the stateHash was equal after loading, after the transfer, and 400 ticks later, and the 'full' digest matched.
  - Life mode, 9 shell builders carrying 2.011 mineral.
  - Deposits mode, 29 grit cells carrying 6.775 mineral.
  - 'all' mode.
  - Life mode holding a resting newborn: after the transfer she is still a newborn, and none of the 4 newborns is Active while still flagged.
- **Commands queued for later ticks (`probe-queue.ts`):** an A02 inoculation (a mineral input) and M12 and M02 doses were queued 3 to 4 ticks ahead, saved and loaded, then both copies ran 300 ticks. Result: equal stateHash and digest, all three commands accepted, and mineral inputs of 3 in both copies.
- **The tick a newborn becomes Active (`probe-import.ts` case (i)):** an F04 newborn saved while Waking at 4.95 s, then loaded, becomes Active with the flag cleared in the same tick in both copies (equal hash). The save taken on that Active tick loads.

### Import checks for the new saved state
Each refusal below ends "Nothing was loaded.".

- **Flag on an Active F04:** refused, "An active organism is marked as a resting newborn."
- **Flag on a B12:** refused, "…its kind has no resting daughters."
- **`infectedBy` 2 on a B01 while V02 is present:** refused, "An organism is infected by Lacephage, which cannot infect it."
- **`infectedBy` 2 on a B02 in a shipped dish:** refused, "An organism is infected by a virus this dish does not have."
- **Valid cases load:** an infected B02 in a V02 dish loads and lyses into v02 units after loading. A resting or waking newborn loads and keeps running.

### Old saves and the fence
- **Fence:** `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts` gives `Test Files 8 passed (8) / Tests 62 passed (62)`. g2 saves and the rc1 corpus (D-0101) load and continue bit-identically, and each v1.0 save keeps its recorded ruleset.
- **RESTING_NEWBORN is appended:** it is the last entry of REASONS (`reasons.ts:95`), so no saved `limitCode` or death cause moves.
- **No old save can hold the new state:** no v1.0 or earlier save can contain grit, silicate, V02 or F04, because they need the silicate system or species that are not enabled.

### New state is hash-neutral where it should be
- **No new saved field, column or store:** neither task adds one.
  - `boundMineral` is an old column that is always hashed, and its value stays 0 without shell builders.
  - The silicate and grit fields exist only in silicate worlds, where they are deliberately hashed through `allocatedFieldIds`.
- **intake.ts:** in a world without a SHELL species, the new code only rebuilds the species table. It writes nothing and never reads silicate.
- **viruses.ts:** without V02 in the dish, `virusIn` skips V02's pass.
- **Grit dissolution:** it needs both the grit and silicate fields.
- **The builders' neutral checks pass:** shells-determinism :93 and :124, and the e3 by-hand byte comparison. The fence above holds them too.

### Mineral accounting
Silicate, grit and `boundMineral` are all counted in `computeTotals`.

- **Closed lid, 10,000 ticks:** conservation-mineral passes in the run below.
- **Dissolution:** moving grit into silicate is an internal move with no ledger line.
- **Binding:** taking silicate into a shell goes through `subtractPool(…, 'm')`, so rounding dust lands in `roundoff.m`, which is hashed.

### No randomness outside src/sim
Neither task adds a draw. The V02 film gate skips a host before the pure hash draw `detFloat(seed, STREAMS.infect, tick, birthId)`, so no stream moves. Neither diff uses `Math.random`, `Date`, or iteration over a Map, Set or object keys.

### Test runs in this session
| Run | Result |
| --- | --- |
| Both builders' 9 test files, plus `phase5-import` and `migration-schema5` | 11 files, 116 tests passed |
| `tests/persistence` (all), `tests/ui/reasons.test.ts`, `tests/sim/dormancy.test.ts` | 16 files, 212 tests passed |
