# Phase 5 experiments (P5.6)

Task BUILD_DIRECTIVE P5.6 (CT §10.3; SPEC §13.1–13.2; D02 §21–22; g5-briefs E1, E2; D-0131). Each section
is written by the builder of that part. Every number comes from `runExperiment` / `realizeRecipe`
(src/sim) under the SHIPPED registry (`loadRegistryFs()`), headless Node through `npx tsx` and vitest, on
the shared 2-CPU machine. Run times are not performance numbers. Each result is **this run** on one seed,
not a general effect; "coincided with" wherever the record holds no mechanism.

## E205–E211

Wave 15, stage 1 builder `measures-overrides`. Content hash at the time of these runs:
`efeb7ad364d9…0e7a` (content version 3, simulation version 3, build phase 5, module registry version 3);
other wave 15 builders may edit content in the same tree, so the committed hash may differ.

Defaults (CT §10.3 header; D02 §21): seed = card number; Water Garden without stones, lid open, fixed
light 0.8, no drying, standard mutation, identical founders, unless a habitat is named; radius-6 patches;
founders 'scatter' within radius 6 at the patch centre. Every recipe is **revision 1** except GATE_MEAL_V1,
**revision 2** (fix round 1, below); E205 and E206 could not be revised to their gate by one number (see below).

| Card | Recipe | Arms | Stop | Gate | Reached | Clause values at the gate | Alive at the stop |
|---|---|---|---|---|---|---|---|
| EXP_205 Glow threshold | GLOW_THRESHOLD_V1 | 1 | 120 s | events.glowOn.B09 ≥ 1 | **no** | 0 | B09 60 |
| EXP_206 Quiet neighbors | QUIET_NEIGHBORS_V1 | 2 (commands at 120 s) | 150 s | glowingStart.B09 A ≥ 1; runSeconds A ≥ 30; interventionAccepted B ≥ 1 | **no** | 0; 30; 113 | A B09 60; B B09 60 |
| EXP_207 Brine crossing | BRINE_CROSSING_V1 (H05) | 1 | 180 s | gateTransfer.S03.salt > 0; limitSeconds.B01.SUIT_SALINITY > 0 | 46 s | 2.9956; 0.4 | B01 179 (0 in the fresh pool), B10 160 (all in the brine pool) |
| EXP_208 Glass budget | GLASS_BUDGET_V1 | 2 (commands at 0 s) | 180 s | runSeconds A ≥ 180; interventionAccepted B ≥ 1; limitSeconds.A02.SILICATE_LIMITED A > 0 | 180 s | 180; 113; 4497 | A A02 0; B A02 136 |
| EXP_209 Gate meal | GATE_MEAL_V1 (H10), revision 2 | 1 | 180 s | runSeconds A ≥ 180; gateTransfer.S01.sugar > 0; gateCrossings.S01 = 0 | 180 s | 180; 0.7647; 0 | B06 0 (starved, last at 173 s), B01 0 (starved, last at 127 s); 28.69 starch converted, B01 took in 0.7187 |
| EXP_210 Sleeping shortage | SLEEPING_SHORTAGE_V1 | 1 | 180 s | events.rest.B12 ≥ 1; events.wake.B12 ≥ 1 | 75 s | 20; 20 | B12 26 |
| EXP_211 Sheltered lace | SHELTERED_LACE_V1 (H09) | 1 | 600 s | runSeconds A ≥ 600 | 600 s | 600 | F04 10 under the roof, 10 on open gel (all resting); moisture 0.80 roof, 0.20 open gel |

Every arm kept its ledger at every check; each card run twice gives identical canonical results
(tests/experiments/e205-e211.test.ts).

### E205 and E206: not release-ready (the measured limiting factor)

The Lanterns never sense enough signal to start glowing. CT §12.6 turns glow on after the sensed signal
S_GLOW / (1 + quencher) stays ≥ 0.30 for 5 s; each Lantern emits 0.02/s into its cell. In open water
(diffusion 0.1 per tick per edge) the signal spreads faster than a crowd can build it up:

| Setup (seed 205, 120 s) | Highest sensed signal of any Lantern | glowOn records |
|---|---|---|
| Revision 1 (CT): 30 B09 within r 4 (nearest), sugar 1 | 0.073 (at 30–40 s; 60 Lanterns after the first divisions), falling to 0.033 by 120 s as energy runs low (SECRETION_ENERGY_LOW for 35 of 60) | 0 |
| Candidate: 49 B09 (every cell of r 4) | 0.100 | 0 |
| Candidate: 120 B09 within r 7 | 0.189 | 0 |
| Seed 206 (E206), revision 1 | (no Lantern glows at any tick of 0–120 s) | 0 |

No one-number recipe revision reaches 0.30: the founders' count is capped by distinct cells in the
radius, and a wider radius lowers the density as much as it raises the count. The recipes are therefore
kept at revision 1 and both cards are reported **not release-ready**; nothing is scripted. E206 has no
"first glowing second" on seed 206, so its timed change uses E205's 120 s horizon (PROPOSED DECISION) and
its first clause `glowingStart.B09 ≥ 1` fails honestly. The tests pin these measured values, so a rule or
content change that lets Lanterns glow fails them and the cards are revised to the new first glowing
second.

### Fix round 1: E209 revision 2 and the E207 texts

- **E209, revision 1** gated on `gateTransfer.S01.sugar > 0` and two position counts. The verifier showed the
  gate held with the Crumbsmiths removed: the H10 background sugar (0.02 in every open cell) moved across the
  membranes either way (1.57e-6 at 1 s; 1.983 by 180 s without B06, 1.339 with them), and the position clauses
  were read at 1 s, true by construction. **Revision 2 changes one number: `backgroundOverrides.sugar` 0.02 →
  0**, so the only sugar in the dish is what the Crumbsmiths' enzyme makes from the starch (no photosynthesizer
  is present; `gateTransfer.S01.starch` stays 0). The card's gate becomes `runSeconds A ≥ 180`,
  `gateTransfer.S01.sugar A > 0`, `gateCrossings.S01 A = 0` (the direct "no organism crossed" measure over the
  whole run; the two position counts stay measurements). Measured on seed 209: reached at 180 s with 180;
  0.7647; 0; converted starch 28.69; B01 intake 0.7187. With B06 removed: no sugar anywhere, transfer 0, gate
  not reached (tests/experiments/e205-e211.test.ts). Both founding groups starve within the run (B01 by 127 s,
  B06 by 173 s, with starch left); the texts promise no survival.
- **E207** (no recipe number changed; texts only). H05 is gel outside its pools and gel carries salt (CT §13
  "Diffusion/tick: water 0.10, gel 0.025"). With the shutter closed from tick 0 for 180 s the shutter tally
  reads 0, yet `mean.salt@FRESH_POOL` is 0.00591 (0.00915 open) and `limitSeconds.B01.SUIT_SALINITY` 497.1
  (315.8 open). The prediction, confounds and the recipe's description now say a closed shutter stops the
  flow across its four edges while salt seeps through the gel around it and Sprinters meet salt in the gel
  around the brine pool; the tally counts only the shutter's share. A test pins the closed-shutter numbers.

### What each card's texts claim

Card texts state what the dish records. E209 may say "a fine membrane passes dissolved food but no organism":
S01 passes no organism by its rule (a recorded mechanism), and the gate reads the run's 0 organism crossings. E207's Sprinters also live on gel and left the fresh pool by 180 s (0 in the pool, 179 on the
gel); its confounds say so. E208's prediction ("a larger population can add more limited seconds in
total") matches the run: copy B recorded 10 290 limited organism-seconds against copy A's 4 497, with 136
Glasswheels alive against none.

## E213–E218, L302, L305

Wave 15, stage 2 builder `cards-curated`. Same method as above (`runExperiment` / `realizeRecipe` under the
SHIPPED registry, headless). Content hash at the time of these runs: `b574100fa444…212f` (later rewritten
by the last `content:validate --write`; the other stage 2 builder adds content in the same tree).

Defaults as above; E213 and E214 needed a **revision 2** (one placement change each, below); the others
are revision 1.

| Card | Recipe (revision) | Arms | Stop | Gate | Reached | Clause values at the gate | At the stop |
|---|---|---|---|---|---|---|---|
| EXP_213 A temporary trap | TEMPORARY_TRAP_V1 (2) | 1 | 12 s | events.trapArmed.F03 ≥ 1; events.trapHold.F03 ≥ 1; events.trapRelease.F03 ≥ 1; intake.F03 > 0 | 9 s | 1; 1; 1; 0.24 | P04 1 alive (biomass 7.76 of 8) |
| EXP_214 Shell handling | SHELL_HANDLING_V1 (2; test-only override speed 0) | 1 | 10 s | events.handlingStart.P10 ≥ 1; firstCaptureAt.P10 ≥ 4; captures.P10 = 1 | 4 s | 1; 4.0; 1 | handlingBreak 0; P05 0 alive |
| EXP_215 Fungal hitchhiker | FUNGAL_HITCHHIKER_V1 (1) | 2 (omitFounders 0) | 120 s | runSeconds A ≥ 120; attached.X02 A ≥ 1; intake.X02 A > 0; births.X02 B = 0 (runSeconds added in fix round 1) | 120 s | 120; 9; 13.506; 0 | A: 9 riding, X02 births 5, X02 10, F02 10; B: X02 5, no intake |
| EXP_216 A different host | DIFFERENT_HOST_V1 (1) | 1 | 180 s | runSeconds A ≥ 180; infections.B02.V02 ≥ 1; infections.B01.V02 = 0; wholeUnitCells.B01.V02 > 0 (runSeconds added in fix round 1) | 180 s | 180; 20; 0; 20 | B02 infections 20, B01 0; B02 0 alive, B01 38 |
| EXP_217 Rival without a winner | RIVAL_NO_WINNER_V1 (1) | 2 (omitFounders 2) | 180 s | runSeconds A ≥ 180; limitSeconds.B01.RIVAL_EXPOSURE A > 0; secretingSeconds.B13 A > 0 | 180 s | 180; 5564.8; 602.5 | A: B01 34, B04 32, B13 15; B: B01 34, B04 26 |
| EXP_218 Night shift | NIGHT_SHIFT_V1 (1) | 1 | 240 s | events.modeSwitch.A04 ≥ 1; intakePhoto.A04 > 0; intakeSugar.A04 > 0 | 112 s | 1; 372.40; 1.79 | 2 mode records; photo 666.8 C, sugar 611.0 C; A04 314, A01 234 |

Every arm kept its ledger at every check; every card run twice gives identical canonical results
(tests/experiments/e213-e218.test.ts).

### The two revisions (measured limiting factor, then one placement change)

- **E213, revision 1** placed the Siltworm by 'nearest' at (64,63), the closest cell founders may take
  (founders never share a cell, SPEC 13.1). The Traplace built its trap on the first tick, but a capture needs
  the target's centre in the owner's own cell (D-0124), and in 12 s the Siltworm wandered in y 62.2–63.8
  without entering row 64: trapHold 0, so the gate's hold, release and intake clauses were 0. **Revision 2**
  adds the Siltworm as a scheduled inoculation at 0 s in the Traplace's own cell (CT 10.3 "one P04 at
  center"; the inoculation jitters it within the cell). Captured on its first tick there, held 8 s, released.
- **E214, revision 1** placed the Shellglider in the neighbouring cell (65,64). Founders sit at exact cell
  centres, so the centre distance was 1.0 at every tick, above the 0.5 contact reach (CONTACT_DISTANCE; D-0123
  "a continuing attempt checks contact at the predator's own reach (0.5 for P10)"): no attempt ever started.
  No distinct-cell placement gives contact (a diagonal is 1.41). **Revision 2** adds the Shellglider as a
  scheduled inoculation at 0 s in the Needlejaw's cell (CT 10.3 "P10 and P05 at (64,64)"): the jitter keeps it
  within 0.30 of the cell centre on each axis, at most 0.42 from the Needlejaw. The attempt starts on the first
  tick and completes on the 40th contact tick.
- **firstCaptureAt fix.** Stage 1's `firstCaptureAt.SP` read the capture record's tick / 10 (3.9 here). A
  record's tick is the tick that ran; the dish clock reads (tick + 1) / 10 once it has run, as `seconds`,
  `extinctAt` and a gate's second do. It now reads (tick + 1) / 10 = 4.0 s for a capture on the 40th contact
  tick (D-0123: the start tick counts as the first contact tick).
- **E214 without its overrides** (a hand mutant, reverted): on seed 214 the gate is still reached (4.0 s, one
  capture). The Needlejaw pursued the Shellglider, which moved slowly enough to stay within 0.5 for 40 ticks.
  So this seed does not show that the override is necessary. The override only guarantees what this run
  happened to show: with it, both positions stay fixed until the meal (tested). Without it, both moved.

### What each card's texts claim

E215's attachment is read from the entity columns (`attached.X02`, D-0131: no 'attach' event exists).
Its hostless copy cannot feed at all (X02's metabolism is host drain only), so "zero reproduction from
feeding" holds by rule as well as by count. E216's zero for Sprinters is set against 20 cells where
Sprinters sat with whole Lacephage units (V02 lists only B02 as host). E217's Recycler exposure reads 0 in
both copies because the rivalry chemical targets only B01, B10 and B11 (M08's rules text; rivalry.ts); its
confounds say so. No card claims a winner. E218's mode records are coalesced per tick, species and mode
(D-0126), so 2 records stand for every Turnleaf's switch at dusk and at dawn.

### Curated dishes, 600 s on their own seeds (this run)

- **L302 Under the Canopy** (seed 302, Diverse). Alive by minute: 60 s A05 20 / A01 79; 120 s 39 / 233;
  240 s 53 / 783; 300 s 39 / 952; 420 s 6 / 966; 480 s 0 / 947; 600 s 0 / 969. The canopy was recorded:
  up to 166 shaded cells (canopy factor < 1) at 240 s, effective light down to 0.197 under it at 300 s; by
  480 s no Raftball was left and no cell was shaded. In this run the Raftballs died out by 480 s while the
  Sunbeads grew; nothing here says why without the per-death causes (the dish keeps them in its history).
- **L305 The Jacket Garden** (seed 305, Identical). Jackets were recorded: E11 carriers held mineral from
  tick 1 (11 carriers with a jacket at 60 s, largest 0.41; 23 at 120 s). Both Needlejaws started 52 handling
  attempts on Dartfins; every one broke on lost contact; neither caught anything, and both died of
  starvation at 55.5 s and 55.6 s. Dartfins made 191 captures, all of Sprinters. Alive: 60 s B01 82 / P07 23;
  120 s 12 / 51; 180 s 0 / 7; 300 s none. So in this run no Dartfin was ever caught, jacketed or not, and the
  question "is delayed capture worth the cost?" gets no capture to compare.
