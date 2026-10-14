# Wave g5-wave-12: adversarial verify 1 (e2-light-algae, e3-predation)

Verifier scratch: tmp/verify-g5-wave-12-0/ (git-ignored). No repository file was edited apart from this report. No git state was changed.

**Verdict: ok = true.** There is no BLOCKER and no MAJOR. Two latent MINORs belong to the lead (wave 13 carry-overs). The rest are NITs.

## Problems (most severe first)

- MINOR [lead] src/sim/mixotrophy.ts:70-88 (updateMode emit) with src/sim/events.ts:91 (ring of EVENT_RING_SIZE = 500, constants.ts:121): one 'modeSwitch' is emitted per A04. Under the cycle with uniform baseline light, every A04 crosses 0.25 or 0.35 on the same tick, so dusk and dawn overflow the 500-event ring in one stage 4.
  - What gets evicted:
    - every event of earlier ticks that no reader has consumed yet; host.ts sendSnapshot is time-driven, so births, deaths and captures from earlier ticks in the same snapshot interval are lost to the feed;
    - this tick's stage 1–3 events (introduce, conversion), which pairedRun.ts:513 and objectives.ts:558 read per tick.
  - g5-plan names "missing events" under "Risks to watch". The builder followed the assignment and D-0122 ("stay in the event ring"), so this is a design point for the lead and not a builder defect.
  - It is latent: A04 is not enabled until the organism flip.
  - Repro: tmp/verify-g5-wave-12-0/t/ring-burst.test.ts places 600 A04 at light 0.8, inoculates a B01 by command, steps, then sets light 0.2 and steps once. Output: `modeSwitch in ring 500 totals 600 ... lastId 602 ring oldest id 703`. The previous tick's 'introduce' event and the first 100 switches are gone.
  - Suggested fix before the flip: aggregate per tick (a count plus a sample) or keep modeSwitch out of the ring and in totals only.
- MINOR [lead] src/ui/strings/modules.ts:61 (actionLabel, not owned by either task): an A04 feeding in Photo mode is labelled "Eating" or "Finding only traces of food". The m6 rule there ("an organism that makes its food from light is never said to be eating") checks `diet.metabolism === 'photosynthesis'`, and A04's metabolism is 'mixotroph'.
  - This is player-facing wording that does not match the route actually taken (the mode is in cue3 and limitCode).
  - It is latent until A04 is enabled. It belongs with wave 13 org-ui's "inspector mode line", which e2's report and D-0122 already carry.
  - Repro: read actionLabel against an A04 in MODE_PHOTO with FLAG.feeding set.
- NIT [e2-light-algae] docs/reports/reviews/g5-wave-12/e2-light-algae-build.md, mutant table: the row "A03 curve applied to every photosynthesizer → the exact A01 tests (and NEUTRAL)" claims more than the evidence shows.
  - The builder's own log (tmp/e2-light-algae/mutants.txt, M5) lists only the three exact-request tests as failing.
  - By construction NEUTRAL cannot fail on that mutant: it compares two registries under the same mutated code.
  - The mechanism is still covered by the exact A01 closed-form tests and by the fence. Only the parenthetical is wrong.
- NIT [e3-predation] src/persistence/phase5State.ts:72-76: the import accepts `handlingNeed > 0` with `handlingProgress === 0`. The simulation never produces this (startAttempt writes DT, and the stated tick-boundary invariant is 0 < progress < need).
  - This was not required by the assignment and is harmless: the next tick adds DT.
  - Noted only because the invariant comment in handling.ts says the import refuses "otherwise".
- NIT [e3-predation] contacts.ts:89 (PROPOSED DECISION 6): a handler that leaves Active keeps its attempt until its next stage 5. For one snapshot, CUE3_HANDLING (and wave 13's handling_arc) would show on a Preparing handler.
  - It is unreachable today: P10 has no dormancy (CT §1.3 gives dormancy to P08 only).
  - Disclosed by the builder.
- NIT [e3-predation] tests/sim/predation-determinism.test.ts: the save and host parts give P09 the prey A02 and Y02, not A03 and A04 as the assignment's dish lists. The in-memory run(400) check includes A03 and A04.
  - Disclosed, with a sound reason: the file's mock may append only this task's abilities.

## VERIFIED OK

### e2-light-algae

- VERIFIED OK — item 0 as committed. Evidence: constants.ts:213-228 hold LOW_LIGHT_SATURATION 0.3, MODE_PHOTO_LIGHT 0.35, MODE_SUGAR_LIGHT 0.25, RADIUS_CAPTURE_DISTANCE 1, HANDLING_JACKET_BASE_SECONDS 1, HANDLING_JACKET_SECONDS_PER_COVERAGE 3 and JACKET_COVERAGE_FRACTION 0.1, each with its CT/SPEC citation.
  - Wave 11 exported no jacket constant: snapshot.ts:241 uses an inline 0.1, which the builder disclosed.
  - events.ts:45-63 adds 'modeSwitch', 'handlingStart' and 'handlingBreak' after 'glowOff', with doc comments.
  - The shapes match the assignment and e3's use of them in handling.ts:87-125 and births.ts:307-317.
- VERIFIED OK — values against the canonical docs:
  - CT §12.3 photosynthesis is 0.50 B, 0.50 sugar, +0.50 O2, +30 E; aerobic is −0.30 O2.
  - CT §1.2 A03 is "photosynthesis (light/0.30)".
  - CT §3.1 says "A04 photosynthesis (light ≥ 0.35) / sugar (light ≤ 0.25)".
  - CT §7.1 says E06 is "not native A03".
  - CT §3.2 says "A05 is prey only for P08".
  - The code (intake.ts:463-474) and the tests match all of these.
- VERIFIED OK — the pure rules in mixotrophy.ts:
  - nextMode compares exactly and inclusively, holds the mode in the band, and initializes from MODE_NONE.
  - hasMixotroph is a WeakMap keyed on world.species, which createEmptyWorld builds from the enabled species only (world.ts:212, 228). It is never a build constant.
  - The new sim code has no Math.random, Date, or Map/Set/object-key iteration (grep).
- VERIFIED OK — stage 4 order (SPEC §3.2 row 4). movement.ts:446-450 runs suitability, then `if (mixo && sp.mixotroph) updateMode(...)`, then stress, then the life-state override (471).
  - The mode reads derived.light from stage 2 of the same tick (tick.ts:24-40). No updateDerived call sits between stage 2 and stage 9.
- VERIFIED OK — first mode set in stage 4 rather than stage 1. Evidence:
  - commands.ts is untouched (git status).
  - My own load-time mutant reproduces the builder's result without editing any tracked file. tmp/verify-g5-wave-12-0/t/init-mutant.test.ts sets the mode in a stage-1 step hook from derived.light. The two light views were u = 0.350039 and r = 0.349961, and stage 2's light was 0.34865, inside the band. The modes diverged: "expected 2 to be 1".
  - So the stage-4 rule is what keeps the reload identical.
- VERIFIED OK — one route per tick. intake.ts:256 is `sp.photosynthetic && (!sp.mixotroph || mode === MODE_PHOTO)`.
  - A Sugar-mode A04 falls through to the field route with its content foods. A04.json lists foodPriority ["sugar"], so broth is never requested.
  - needO2 is route-gated (362); the O2 sign is per route (466 / 472).
  - The request expression for every non-mixotroph, non-A03 species is the same as HEAD (diff).
  - photosynthesizedThisTick (84) is route-gated.
- VERIFIED OK — A03. species.ts:107 sets `lowLight`. intake.ts uses it in the request (262), the access base (498-499) and the LIGHT_LIMITED comparison (523-525).
  - photoLightResponse's new argument defaults to false, and its only caller is intake.ts (grep).
  - validateModuleSet refuses E06 for A03 (low-light.test.ts:194).
- VERIFIED OK — the mode reasons (intake.ts:535-538). They apply only when code === R.NONE; any binding limit keeps priority. The copy exists in strings/reasons.ts:39-40.
- VERIFIED OK — movement scoring (movement.ts:304-306, 338).
  - Exactly one term is used: light or food.
  - prepareFoodScore is skipped only for Photo mode, and no later foodScoreAt call reads the stale scratch arrays.
  - There is no brightEnough filter or never-wander rule.
- VERIFIED OK — the newborn mode (births.ts:320, 333). The parent's mode is read before either daughter's mode is written, each daughter's uses her own cell's light, and no event is emitted.
- VERIFIED OK — H1 (movement.ts:514-515), H2 (births.ts:303-317, before the birthIds are rewritten, using parentBirth and parentCell) and H3 (intake.ts:273-274) are exactly as specified. predation-hooks.test.ts sets the columns by hand.
- VERIFIED OK — ownership. Only the owned files changed (constants, events, intake, movement, births, species) plus the new files. Neither commands.ts nor implemented.ts nor content/** is modified. There is no schema or protocol bump.

### e3-predation

- VERIFIED OK — handling.ts:
  - jacketCoverage and handlingNeedOf follow CT §12.5 ("jacket 1 + 3c") and D04 155.
  - The WeakMap tables are null when no recorded species has the ability.
  - startAttempt sets progress = DT and emits one 'handlingStart'.
  - endAttempt zeroes need and progress together, and emits no event on 'capture'.
- VERIFIED OK — the v1.0 path. When both tables are null, contacts.ts reads the same columns in the same order as HEAD (diff):
  - reach2 is contact2;
  - claim() is HEAD's priority code moved into a function;
  - consumePrey with handled = 0 builds the same detail object.
- VERIFIED OK — radius capture uses a fixed 1.0 (inclusive, Euclidean), not prof.sensing. pairPermitted still applies.
  - The ±1-cell scan covers every prey within 1.0, because |dx| ≤ 1 implies a floor difference of at most 1.
- VERIFIED OK — the attempt state machine (contacts.ts:89-108, 140-147, 194-229):
  - a continuing attempt checks only its own target and does not re-read cooldown;
  - completions and instant claims share one claim pool;
  - endTakenAttempts leaves the loser with no progress and no cooldown;
  - the cooldown is set only in consumePrey (SPEC §7.3 "cooldown starts only after a successful capture");
  - slots freed by death are zeroed (entities.ts:7), so a dead handler's columns never reach a hash.
- VERIFIED OK — P09. Only phenotype.ts:563 changes behaviour.
  - debrisRequest computes `min(P, budget·avail(P))`, the same value as the HEAD field route's `min(budget·avail(P), P)`.
  - P09.json has digestsFilm false, so no film request is lost.
  - withDebrisScore takes max(F, F) for P09's only food, so movement is unchanged.
  - detritus-fallback.test.ts proves fields, B, N, E, x and y byte-equal against the ability-stripped dish.
- VERIFIED OK — the import (phase5State.ts:69-76): four refusals with their sentences, on living slots and on held rows (handling-import.test.ts, including through DishHost). A stale prey reference still loads.
- VERIFIED OK — ownership. Only contacts, phenotype (one line plus its doc comment), debrisFeeder (comments only) and phase5State changed, plus the new files. No new RNG stream or contact KIND.

### Commands run (this session)

- The builders' 11 faster files: `npx vitest run tests/fixtures/low-light.test.ts tests/fixtures/mixotrophy.test.ts tests/fixtures/canopy-a05.test.ts tests/sim/mode-saves.test.ts tests/sim/predation-hooks.test.ts tests/worker/cue3-mode.test.ts tests/fixtures/radius-capture.test.ts tests/fixtures/handling.test.ts tests/fixtures/detritus-fallback.test.ts tests/fixtures/predators-p5.test.ts tests/persistence/handling-import.test.ts`
  - Result: **Test Files 11 passed (11); Tests 93 passed (93)** in 376 s.
- The long files: `npx vitest run tests/sim/algae-determinism.test.ts tests/sim/handling-saves.test.ts tests/sim/predation-determinism.test.ts`
  - Result: **Test Files 3 passed (3); Tests 18 passed (18)** in 489 s.
- The fence (lens set): `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts`, in the background with an until-loop.
  - Result: **Test Files 8 passed (8); Tests 64 passed (64)** in 884 s.
  - No fence value moved.
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx eslint` on all 12 changed or new src files and the 14 new test files: exit 0.
- Load-time mutants under tmp/verify-g5-wave-12-0/t/, run with their own vitest config and no tracked edit:
  - init-mutant (stage-1 initialization) fails, as expected;
  - ring-burst gives the MINOR evidence above.
- `grep` of the new test files found no hard-coded stateHash literal.
