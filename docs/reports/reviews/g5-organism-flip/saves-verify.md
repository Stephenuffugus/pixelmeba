# Phase 5 organism flip — saves verifier

Adversarial verification of the uncommitted organism flip (working tree on HEAD 417625d; builder report
flip-build.md; D-0126, D-0127). Nothing under src/, tests/, content/ or docs/ was edited except this report.
Scratch: tmp/verify-flip/ (HEAD copy from `git archive HEAD` in tmp/verify-flip/head with node_modules
symlinked; probes p2.ts, p3.ts, p4.ts, p5.ts, p6.ts, resave.ts, pf.ts, br.ts and their .json/.log outputs).
No `npm run check`, no Playwright.

## Verdict

| Point | Verdict |
|---|---|
| 1. g2 and rc1 corpora, every Phase 5 round trip | VERIFIED OK |
| 2. A pre-flip (registry 2) save loads and continues on its recorded registry | VERIFIED OK |
| 3. A new dish records registry 3 and 2640a5f4…, round-trips | VERIFIED OK |
| 4. The tightened import refuses nothing the sim writes at a tick boundary | VERIFIED OK |
| 5. D-0126 coalescing: hashed state unchanged, deterministic (1×/4×, reload mid-burst) | VERIFIED OK |
| 6. Fence: only L303 and L304 re-recorded; D-0127's explanation reproduces | VERIFIED OK |

No BLOCKER and no MAJOR. Two MINOR test-coverage gaps and one NIT (below); none blocks the flip.

## 1. Save corpora and Phase 5 round trips — VERIFIED OK

`npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/sim/glow-saves.test.ts
tests/sim/handling-saves.test.ts tests/sim/jacket-saves.test.ts tests/sim/mode-saves.test.ts tests/sim/trap-saves.test.ts
tests/persistence/phase5-import.test.ts tests/persistence/trap-import.test.ts tests/persistence/handling-import.test.ts
tests/persistence/adhesion-import.test.ts tests/persistence/import-implemented.test.ts tests/persistence/migration.test.ts
tests/persistence/migration-schema5.test.ts tests/sim/world-stores-5.test.ts tests/sim/stage8-order.test.ts
tests/persistence/persistence.test.ts tests/worker/protocol3-v1-equivalence.test.ts --maxWorkers=1`
→ **18 files, 207 tests passed** (798 s; log tmp/verify-flip/point1.log). `git diff HEAD --stat -- tests/fixtures/saves
tests/fixtures/saves-rc1 content/recipes` → empty: neither corpus nor its expected.json moved.

## 2. A save made before the flip — VERIFIED OK

HEAD code (tmp/verify-flip/head, its own content/manifest.json: registry 2, 84c41636…) realized and saved five dishes
(`MODE=make`): FIRST_DISH_V1 seed 104729 at tick 600; FIRST_DISH_V1 seed 7 accelerated at 900; L304 (Diverse B01, the
founder list E02 joins) accelerated at 600; PREDATOR_BALANCE_V1 (P01, an E11 candidate) accelerated at 600; L303
accelerated at 600. Each file was then loaded by the HEAD code and by the flipped tree (`MODE=load`), and the loaded world
got three Phase 5 commands a player of the new build could send (inoculate A04, inoculate P07, deposit M02) and 1,000 ticks.

`diff p2-load-head.json p2-load-flip.json` → **identical**: per dish the same hash at load (= the hash at save) and the
same hash 1,000 ticks later (e.g. FIRST_DISH 104729: f14e2663004352c8 at 600, 583370e518e9a660 at 1,600). In the flipped
tree every loaded world reports moduleRegistryVersion 2, contentHash 84c41636…, enabledModules without E02/E11, no Phase 5
id in its species table or enabled list, and no E02/E11 in any genome although module draws happened after load (16, 34
and 6 new genomes in three of the dishes). The commands are refused from the recorded manifest: "species A04 is not
enabled", "species P07 is not enabled", "unknown material M02" (accepted 0). Re-saving three of the loaded files with the
flipped build (resave.ts) gives the **same state checksum**, contentHash 84c41636… and meta registry 2 with 10 modules.

Helpers: HEAD's and the flip's barrierRegistry() (84c41636…), resterRegistry() (cc1b7821…) and preFlipRegistry()
(67075b0e…) have equal content hashes; PRE_FLIP_LISTS recomputes to exactly the pinned PRE_FLIP_CONTENT_HASH (pf.ts).

## 3. A new dish — VERIFIED OK

p3.ts under the flipped content: FIRST_DISH_V1 (saved at 0 and at 600), L304 seed 3 accelerated (400), PREDATOR_BALANCE
seed 11 accelerated (300). Every world and file records moduleRegistryVersion 3 and contentHash 2640a5f4ea57ac78…
(`npm run content:validate` → "content ok · contentHash 2640a5f4ea57ac78f865a397030ebf703d40cf5fcb9371263cea5f40230c3c62 ·
species 38 (enabled 38)…"); meta.registry lists the 12 modules E01–E12. save → load: equal stateHash at load, after
1,000 more ticks of both, and equal canonical serialized state. L304's founders now carry E02 (genome modules
E01,E02,E03,E04,E10,E12), which round-trips.

## 4. The tightened import against everything the sim writes — VERIFIED OK

p4.ts (flipped shipped registry, registry 3; accelerated mutation, Diverse founders): a sediment disk with 10 F03 (B 2.8)
and 18 P04, and in silicate 1.5 everywhere 10 P01, 8 P07 and 6 P02 founded with E11 plus 4 P10, 12 A04, 8 B10, 8 A02,
8 B09, B01/B06/B07/A01 prey; sugar 0.6, then SUGAR and M02 deposits every 400 ticks and 3 P07 inoculated (Diverse) every
1,200 ticks, all through real commands. **Every tick**, on every living row: trapReserveC is 0 or `Object.is(…, TRAP_RESERVE_C)`;
a holding trap has trapTimer > 0; jacketMineral > 0 only on a genome with E11. **Save + full import** (buildSaveFile →
loadSaveFile, i.e. parseSaveFile and phase5StateProblem) every 40 ticks and at every edge tick (a trap holding for exactly
one step, a release, any grit rise), with the loaded stateHash compared. Seeds 3 and 4 also take a sample the way the host
does (paused, applyNow at a tick boundary, host.ts:935/3496) around a holding trap every ≥ 40 ticks, import the dish with
the sample held (held trap rows checked the same way), then transfer it back.

| Seed | Ticks | Imports | Refused | Hash ≠ | Trap-holding row-ticks | Captures / releases | Peak jacketed | E11 genomes | Held trap rows | Reserve ≠ 0.20 | Hold with timer 0 | Jacket without E11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 3,000 | 160 | 0 | 0 | 869 | 11 / 11 | 648 | 202 | – | 0 | 0 | 0 |
| 2 | 3,000 | 126 | 0 | 0 | 790 | 10 / 10 | 665 | 228 | – | 0 | 0 | 0 |
| 3 | 3,000 | 231 | 0 | 0 | 1,164 | 15 / 14 | 601 | 195 | 24 (24 takes) | 0 | 0 | 0 |
| 4 | 3,000 | 156 | 0 | 0 | 790 | 10 / 10 | 631 | 176 | 16 (16 takes) | 0 | 0 | 0 |

(tmp/verify-flip/p4.log.) All 10 traps were armed at once in every seed (armedMax 10). A 1,500-tick rerun of seed 1 that
also walks the lineage (p4b.ts) found a birth whose parent carried E11 and whose genome does not: the SPEC §9.19 reconcile
path ran, and no jacket without E11 remained at any boundary. Coverage limit: in all four seeds the F03 had died out by
tick 3,000, so the trap numbers come from roughly the first half of each run.

Code reading agrees. The only writer of trapReserveC other than zeroing is traps.ts:264 (`= TRAP_RESERVE_C`, an f64
column, saved exactly); ledger.ts and sampleSlot.ts only read it. trapTimer is set to 0 only at capture (stage 5, :351)
and at the end of a hold (pair cleared at the same time). Stage 8's trapStep (structures.ts:109, unconditional at the
end of stageStructures) adds DT to every living holder before the tick ends, and saves happen only between ticks. The
jacket profile is non-null exactly when the genome lists E11 (phenotype.ts:550), and births.ts:346 turns any daughter's
jacket without it into grit. One thing to know: stepping a world that holds a sample is not a valid state; the host
keeps time paused (host.ts:3496). My first probe stepped with a sample held and got "a sample row's slot is taken",
which has nothing to do with the flip.

## 5. D-0126 modeSwitch coalescing — VERIFIED OK

p5.ts: 400 A04 (every fifth with E06) on uniform water, light cycle on, sugar 0.3, on the same registry in both trees
(pre-organism-flip lists + A03/A04/A05; contentHash fe305230… in both), 3,000 ticks.
- HEAD vs flip: **every stateHash at each 100 ticks equal** (digest db13a0db…; final 0c66e9851c76a102) and
  totals.modeSwitch equal (4,324). The bursts are tick 1118 (1,260 to Sugar) and tick 2223 (3,064 to Photo). HEAD writes 1,260
  and 3,064 events and keeps only the last 500 in the ring (it evicts everything else); the flip writes 2 events with
  detail.count 1,260 and 3,064. The event ring is not in stateHash (serialize.ts stateHash), so the change is to the
  saved ring only, by design.
- Reload mid-burst (flip): saves at ticks 1117, 1118, 2222, 2223 → loaded hash equal **and saved event ring equal**
  (canonical JSON of serializeWorld().events), and both still equal after 300 more ticks.
- DishHost 1× vs 4× from tick 968 across the 1118 burst to tick 1368: equal hash (b82bc2071cc2b315), equal ring digest,
  and both equal the headless run. Note: algae-determinism and mode-saves compare stateHash and the trajectory digest,
  neither of which covers the ring; this probe adds the ring.
- The scratch is a WeakMap keyed by the World object and reset when world.tick moves; no code rewinds world.tick on a
  live World (deserializeWorld always builds a new one; `grep -nE "\.tick = " src/` → only scratch and deserialize).

## 6. Fence — VERIFIED OK

`git diff HEAD -- tests/fixtures/fence.json` → 2 hunks: L303_PUBLIC_KITCHEN acd60b6d2fb0790a → 4acbc084dbf004c2 and
L304_EMPTY_AFTER_THE_FEAST 5d57285882e64af0 → 1f3573a7477f933b, each changedBy [{D-0127, currentDigest}]; nothing else.
Spot check of L303 (p6.ts, trajectoryDigest 'full' at 1,200): HEAD code → acd60b6d2fb0790a with founder birth 23 B08
carrying E03; flipped shipped registry → 4acbc084dbf004c2 with birth 23 B08 carrying **E02**; flipped tree's
preOrganismFlipRegistry() → acd60b6d2fb0790a with E03. Only the founder draw differs (Y02 birth 16 keeps E04), as D-0127 says.

## Findings

- **MINOR (test gap, D-0126): the saved event ring is in no reload, 4× or uninterrupted-run equality test.**
  algae-determinism ("save at tick 777 …", "1× and 4× through DishHost …") and mode-saves compare stateHash and
  trajectoryDigest. Neither reads `events`, and coalescing changes only the ring. If the scratch broke across a reload,
  for example a later change that kept it across a tick, no test would notice. Repro of the missing coverage:
  `ROOT=$PWD MODE=reload npx tsx tmp/verify-flip/p5.ts` compares `canonicalJson(serializeWorld(w).events)` at ticks 1117,
  1118, 2222 and 2223 and 1× against 4× (all equal today). Suggest adding that ring comparison to the algae-determinism
  reload and DishHost cases.
- **MINOR (test gap, point 2 itself): no committed test loads a save written by the pre-organism-flip build into the
  flipped build.** The rc1/g2 corpora are v1.0 dishes, and phase5-import/registry-imports build their "old save" with the
  current code. Repro: `MODE=make` in a `git archive HEAD` copy, then `MODE=load` in both trees (p2.ts). The outputs are
  identical today, but nothing pins this. Suggest committing one small registry-2 save (e.g. L304 accelerated at tick 600,
  hash a6d84eb10b26b0f4 → 782b6091f26310b0 after 1,000 ticks, Phase 5 commands refused) as a third corpus entry before
  wave 14 changes content again.
- **NIT: preFlipRegistry() overwrites contentHash when the recomputed hash differs** (tests/helpers/world.ts,
  `preFlipCache = … ? reg : { …, contentHash: PRE_FLIP_CONTENT_HASH }`). Today the branch never runs: PRE_FLIP_LISTS
  recomputes to exactly 67075b0e… (pf.ts). If a v1.0 species or material file changes later, the helper would silently put
  the v1.0 hash on content that v1.0 never had. Throwing, or a test asserting the equality, would show that drift.
