# g3 wave 2 — parasites-phage build report (BUILD_DIRECTIVE P3.4 part 2: X01 Hitcher, V01 Pinphage, phage doses)

## Summary
X01 Hitcher and V01 Pinphage now work as SPEC §7.4/§7.5/§10.2 describe and are enabled in the shipped manifest. HOST_DRAIN and LYSIS are added to the implemented abilities. Every new rule is gated on the world's own content: on organisms with HOST_DRAIN or the hosts they hold, and on `worldHasSystem(world,'viruses')` plus the `v01` field. A g2 save runs none of it.

- Fence unchanged: the g2 replay, all four trajectory-fence files, closed-lid conservation and determinism all pass (45/45).
- My fixtures pass: 30/30 tests.
- The desktop e2e journey passes and is axe-clean.

## Checklist

### Build: X01 (SPEC §7.4)
- DONE. A free X01 cannot feed and pays 0.15 E/s. intakeRate 0 is content; maintenance is the existing stage 7 code. Proved by parasite.test.ts "a free Hitcher cannot feed and pays 0.15 E/s" (E drops by exactly 0.15 × 0.1 × 10).
- DONE. Seeking a host. The movement.ts:351 hook calls parasites.ts:128 `parasiteMove`: a free X01 pursues the nearest valid host within sensing 3 (start-of-stage positions, ties to the lower birthId) at speed' × dt and stops at contact/2. An attached X01 does not move. Then movement.ts:398 `followHosts` (parasites.ts:190) puts each attached parasite on its host's position with no movement recorded. Proved by test "seeks a Sunbead within sensing 3 at 0.4 cells/s; attached, it takes its host position at no movement cost".
- DONE. Stage 5 attachment, after predation. contacts.ts:40-43 runs predation, then `attachParasites` (parasites.ts:235), then `infectHosts`.
  - Contact means centres ≤ 0.5 cells.
  - The host must be unparasitized, Active and listed in hostIds.
  - Competing claims are decided by det(seed, 'contact', tick, KIND_PARASITE=2, birthId), highest wins, ties to the lower birthId.
  - Both reference pairs are set on attachment.
  - Proved by test "attaches on contact … competing claims go to the highest seeded priority" (0.55 cells out of range; the loser stays free).
- DONE. Stage 6 drain. `reserveHostDrains` runs before ordinary requests (intake.ts:111 → parasites.ts:309). `commitHostDrains` runs after the ordinary commit (intake.ts:373 → parasites.ts:352).
  - C = min(0.02·dt, host B); bound N = host N·C/B.
  - Split: 50 % to parasite B, 30 % to CO2, 20 % to metabolite. E += 30·C, capped, with the excess dissipated and ledgered. No O2 debit.
  - The parasite gains 0.05·C N, bound N first, then the cell's free nutrient. A shortage of free nutrient scales the whole drain. Unused bound N goes to free nutrient.
  - Products appear only after the ordinary commit (SPEC §3.3).
  - Proved by test "drains exactly 0.002 C per tick …": 25 ticks, every quantity to 1e-15, ledger checked every tick.
- DONE. Stage 7 drain death. maintenance.ts:95 `drainDeathDue` (parasites.ts:397) applies when a live parasite is attached and B < 0.25·B0'. It comes after the H ≤ 0 and age checks. Proved by test "a host below 0.25 × B0' dies of the drain (DEATH_PARASITE_DRAIN) …". Control test: the same small Sunbead with no parasite does not die.
- DONE. Release alive on every host removal. `releaseHostPair` (parasites.ts:103) is called:
  - in killEntity (maintenance.ts:163), which covers lysis, drain, age and H ≤ 0;
  - in the consumePrey capture (contacts.ts:151).
  - On host rest, `releaseStaleParasites` (parasites.ts:209) runs at the start of attachParasites. It releases the parasite when the host is not Active, and clears any dangling half-pair.
  - Proved by tests: drain death, "dies of age", "an Amoeba captures its host", "starts resting".
- DONE. Division. births.ts:300 `onParasiteDivision` (parasites.ts:410) runs right after rekeyLinks and re-points the partner's stored birthId; the new daughter's slot is fresh. Proved by tests "host division: the retained daughter keeps the Hitcher …" and "a dividing Hitcher keeps its host on the retained half; its offspring is free".
- DONE (W2-21). The rest path is tested with a TEST-ONLY registry where E03.eligibleAncestors includes A01. Shipped content cannot make an A01 rest.
  - The Sunbead, kept in darkness, enters Preparing through the real dormancy.ts path.
  - The parasite is released at the next stage 5 (`releasedAt === preparedAt + 1`) and is not re-attached while the Sunbead rests.

### Build: V01 (SPEC §7.5)
- DONE (verified, not edited). transport.ts `decayViral` moves units × 0.001 per tick into detritus carbon (0.01 C/unit) with no N, and diffusion conserves units. Proved by host-specificity.test.ts "with no host, units only decay …": Σunits equals U0·0.999^300 to 9 digits, and the ledger closes.
  - Note: decayViral does not `markField('detritus')`. Detritus does not diffuse, so this is harmless today.
- DONE. Stage 5 infection, after parasite attachment: `infectHosts` (viruses.ts:135).
  - Snapshot draws: p = 1 − exp(−0.05·units·dt), u = detFloat(seed, 'infect', tick, birthId), infected iff u < p, and only when the cell holds ≥ 1 unit.
  - Consumption is then ordered by cell, then descending det(seed, 'contact', tick, KIND_INFECT=3, birthId), then birthId. A unit is consumed only while ≥ 1 whole unit remains.
  - Proved by phage.test.ts "for a fixed seed every draw and threshold matches the formula over 1,000 host-ticks" (10 unit levels from 1 to 400) and "when more hosts pass than whole units remain, units go in descending det(contact, KIND_INFECT) order".
- DONE. An infection consumes exactly 1 unit, and its 0.01 C joins B with no N (PROPOSED DECISION). Then infectedBy = 1 and infectionTimer = 0. No division/healing blocks were added; the existing W2-20 ones are kept. Proved in the 1,000 host-tick test (unit −1, B +0.01).
- DONE. Stage 7 lysis. maintenance.ts:65 `infectionDue` checks the timer before advancing it, so lysis comes exactly 200 ticks after the infecting tick. maintenance.ts:91 `lyse` (viruses.ts:202) releases floor(0.40·B/0.01 + 1e-9) units, then calls killEntity(DEATH_LYSIS). Lysis comes before the H/age checks, so remaining B, N and meal go to detritus, any parasite is released, and links are removed. Proved by "lysis comes exactly 200 ticks after infection": lysedAt − infectedAt = 200, 28 units from B 0.7, 28·0.01 + 0.42 = B, ΔdetritusN = N.
- DONE. Doses. commands.ts:258 calls `dosePhage` (viruses.ts:95). `phageCellAccepts` is exported (viruses.ts:72).
  - Each accepted cell gets count units. recordInput is called once with count·0.01 C per dosed cell and no N. No entities are created.
  - The result is {accepted: cells dosed, rejected: cells refused}.
  - Refused in worlds without the viruses system, and for counts that are not whole 1…20 or footprints that are not finite or have radius over 6.
  - introduceOrganism throws for a field virus (commands.ts:315).
  - Proved by phage.test.ts dose tests. These cover counts 1/5/20 next to a stone, and cell-by-cell parity with grid.ts `lifeCellOutcome({viral:true})`. Refused cases: 0, 21, 2.5 and −5, and a G2_LISTS world (inputs and entities unchanged, no v01 field).

### Done when
- DONE: host-specificity.
  - The dense dish includes every enabled species: registryWith(shipped ∪ wave-2 species and systems, allowUnimplemented for OXYGEN_SUPPRESSED, SEDIMENT_WATER_CROSSING, BIOFILM, BRANCHING, which other wave 2 builders implement). It has a sediment band, 6 organisms per species and 5 units in every cell, and runs 600 ticks. Infected species are exactly ['B01']; every species had > 100 exposed host-ticks.
  - X01 in contact (0.1 cells) with every other species never attaches, over 50 stage-5 calls plus 300 full ticks; the Sunbead control attaches.
  - With no host, units only decay and the ledger closes.
  - Fewer than 1 unit never infects: phage.test.ts, 600 ticks at 0.999 units in every cell.
- DONE: parasite. Every item is proved by tests/fixtures/parasite.test.ts. The file also has a 1,500-tick ledger run.
- DONE: phage. 1,000 host-ticks, lysis at exactly 200 ticks, 28 units, N to detritus. Closed lid over 10,000 ticks: worst relative error C 5.134e-15, N 6.440e-14, 39 lyses.
- DONE: saves.
  - stateHash is equal at 1× and 4× (400 ticks vs 100 chunks of 4 with hashing in between). This is checked with X01 attached (parasite.test.ts) and mid-infection (phage.test.ts).
  - buildSaveFile → loadSaveFile → +400 ticks gives equal hashes with X01 attached, and also mid-infection through lysis.
  - Import refusals (saveFile.ts:394 → `hostParasiteProblem` at saveFile.ts:412). Each message ends "Nothing was loaded.":
    - "A parasite and its host do not refer to each other."
    - "A host and its parasite do not refer to each other."
    - "A Hitcher is attached to an organism it cannot live on."
    - "An organism is infected, but this dish's rules have no viruses."
    - "An infection timer is invalid." (negative timer)
  - A non-finite timer is refused earlier by the existing generic column check, whose message does not end "Nothing was loaded."
- DONE: non-vacuity. Each mechanism was removed temporarily, the named test failed, and the file was restored byte-identically (checked with diff).
  - V01 hostIds check → `isHost = map(() => true)`: "a dense dish … infects only Sprinters" fails ("expected ['B03','Y01','P01',…] to deeply equal ['B01']").
  - X01 `hostListed` → `true`: "a Hitcher in contact with every other species never attaches" fails ("expected +0 to be -1").
  - 1-unit floor (both checks → `> 0`): "fewer than one unit never infects" fails ("negative pool after subtracting 1").
  - Release in killEntity: 2 parasite tests fail.
- DONE: tests/e2e/phage.spec.ts on desktop. The journey is:
  1. Garden → Lab → Life → Pinphage, count 20, radius 3, dose over the Sprinters while paused.
  2. Check "56 alive": the dose adds no organisms.
  3. 30 single steps with "Step one tick", reaching 0:03.
  4. Inspect taps until a Sprinter shows `Infected by Pinphage; lysis in \d+s.` with 0 < t ≤ 20; that text is ≥ 16 px.
  5. Axe finds no serious or critical violations.
  - No new touch targets were added.
- DONE: fence unchanged. No FENCE notes.

## Files
New:
- src/sim/parasites.ts
- src/sim/viruses.ts
- tests/fixtures/parasite.test.ts
- tests/fixtures/phage.test.ts
- tests/fixtures/host-specificity.test.ts
- tests/e2e/phage.spec.ts
- this report

Changed, owned:
- src/sim/contacts.ts: stage 5 split into predation, then parasites, then infection; release on capture.
- src/sim/intake.ts: drain reserve and commit hooks. The film-fungi film request is kept.
- src/sim/maintenance.ts: infection timer, lysis, drain death, release in killEntity.
- src/sim/commands.ts: phage dose routing, and introduceOrganism refuses a virus. The film-fungi fungal-subcap hook is kept.

Shared, additive:
- content/manifest.json: enabledSpecies += V01, X01; enabledSystems += parasites, viruses; contentHash rewritten by the validator.
- src/sim/content/implemented.ts: += HOST_DRAIN, LYSIS.
- src/sim/movement.ts: 1 import, the parasiteMove hook line, the followHosts call.
- src/sim/births.ts: 1 import, 1 hook line.
- src/persistence/saveFile.ts: a new function and its call.
- src/worker/protocol.ts: optional EntityInspect fields infection, parasite and host.
- src/worker/snapshot.ts: 2 imports and a `parasiteAndInfection` spread. packEntities is untouched.
- src/ui/strings/reasons.ts: Lab cases INFECTED and PARASITIZED, plus a `rate` formatter.
- src/ui/panels/Inspector.tsx: R import and an "Infection and parasites" section of body-text paragraphs (infection, parasite, parasite-host). It is not inside the `.kv` grid because that grid is 14 px and UX §4.1 requires body text ≥ 16 px.

## Commands and results
- `npx tsx tools/content-validate.ts --write`: content ok, contentHash fc3a8762…, enabled 15 species, atlas complete (795 frames).
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts`: Test Files 7 passed (7), Tests 45 passed (45).
- `npx vitest run tests/fixtures/parasite.test.ts tests/fixtures/phage.test.ts tests/fixtures/host-specificity.test.ts`: Test Files 3 passed (3), Tests 30 passed (30). The closed-lid line was "worst relative error C 5.134e-15, N 6.440e-14; lyses 39".
- `E2E_PORT=4223 E2E_OUTDIR=tmp/dist-pp npx playwright test tests/e2e/phage.spec.ts --project=desktop`: 1 passed (3.0m). Two earlier runs failed:
  - The first ran at 4× and overshot past lysis, then stalled on repeated "Whole dish" clicks. Fixed by stepping exactly 30 ticks.
  - The second found the text at 14 px. Fixed by the body-text section.
- `npx eslint <all my files>`: clean.
- `npx tsc -p tsconfig.json --noEmit`: clean for my files. The only error was in another agent's in-flight files (tests/sim/module-visuals.test.ts:135, FeatureLayerId 'anchor_foot').
- Neighbouring tests (tests/content, tests/ui, tests/worker/host + protocol, tests/sim/gates, lab-commands, world-stores, module-visuals, tests/helpers, predation-matrix): 345/347. The 2 failures are caused by film-fungi enabling the film system, not by my edit:
  - tests/content/system-requirements.test.ts "the shipped manifest validates (B04 … ships without the film system)"
  - tests/ui/shortcuts.test.ts "'What does it eat?' … not to contain 'biofilm'"

## Bugs noticed elsewhere
1. **Pre-existing (saves are sacred), reproduced.** A predator's `preySlot` can point at a prey that died that tick (age or starvation in stage 7, or capture by another predator in stage 5). The save then holds a stale reference, and the import refuses it: "A prey link points at an organism that is not there."
   - Repro: a B01 at age 599.95 targeted by a P01 with decisionTimer 0 → one step → buildSaveFile → loadSaveFile throws.
   - Autosaves can therefore be unloadable.
   - Clearing preySlot at death would change g2 hashes (FENCE). A hash-neutral fix is to have the import accept a stale *prey target* only. It is a transient pursuit target: stage 4 cancels it whenever refValid fails, and a reused slot carries a different birthId.
   - This needs the lead's ruling. X01 avoids the problem because its target is never stored.
2. events.ts `EventType` has no 'infection', 'lysis', 'attach' or 'release' types (SPEC §12.3). I did not edit it because it is not in my file list. Lysis and drain deaths are recorded as 'death' events with DEATH_LYSIS and DEATH_PARASITE_DRAIN causes; infections and attach/release are not yet in the feed. This is a proposed additive change for the lead.
3. When wave 3 (P3.5) implements Sample Take, it must call `releaseHostPair(world, slot)` (parasites.ts:103) before removing a held organism. Until then, `releaseStaleParasites` cleans any dangling pair at the next stage 5.

## Proposed decisions
- PROPOSED DECISION: when more infected hosts pass their draw than whole units remain in a cell, units go in descending det(seed, 'contact', tick, KIND_INFECT=3, birthId) order (ties to the lower birthId). The draw itself reads the units the cell held at the start of stage 5. (SPEC §3.2 row 5.)
- PROPOSED DECISION: the infecting unit's 0.01 C joins the host's B and carries no N.
- PROPOSED DECISION: contact kinds on the 'contact' stream are 1 attack, 2 parasite attachment and 3 infection order. They are frozen; E12/E16 should use 4 and 5.
- PROPOSED DECISION: X01 pursues the nearest valid host (Active, unparasitized, listed) afresh every tick instead of storing a target. This means no saved reference can go stale (see bug 1). An X01 does not attach to, or pursue, a host that is not Active.
- PROPOSED DECISION: host rest is detected at the next stage 5. Dormancy (stage 8) is not in my files, so a parasite is released one tick after its host enters Preparing. No drain happens in between, because stage 6 skips hosts that are not Active.
- PROPOSED DECISION: a drain limited by the cell's free nutrient scales C, its bound N and the free-N take by the same fraction L (as §6.5's L for ordinary intake). The drain reservation takes free nutrient before ordinary allocation.
- PROPOSED DECISION: a host that dies of the drain is checked after H ≤ 0 and age, so those causes win when they fall in the same tick. Lysis is checked before all three.
- PROPOSED DECISION: phage doses accept a whole count from 1 to 20 (the tools send 1, 5 or 20) and radius 0–6. Anything else is refused whole, with accepted 0.
- PROPOSED DECISION: the inspector shows the infection, parasite and host lines as body-size paragraphs above the 14 px key/value grid, in Lab wording, in both views.
