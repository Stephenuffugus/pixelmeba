# g5-wave-13 verifier 2: org-ui and relmatrix

Verifier: adversarial wave verifier 2, 2026-10-15. I read the working-tree diff against 3daebb2 and the untracked files. I edited no tracked file. Scratch work is in tmp/verify-g5-wave-13-1/.

**Overall: ok = false.** There is one MAJOR, in org-ui.

## Problems, most severe first

### MAJOR [org-ui] `src/ui/strings/shortcuts.ts:231`: the "What's holding it back" answer shows an unmeasured "?" line for every handler mid-attempt

**What is wrong**
- `stopAnswer` still ends with `if (e.predation && e.predation.code !== R.NONE) items.push({ ..., detail: reasonText(e.predation.code, 'lab') })`. That call passes no context.
- Wave 13 now sets `predation.code` to `PRED_HANDLING_IN_PROGRESS` (`snapshot.ts:603`). The new Lab wording for that code needs `value` and `need`. Without them, the item's detail reads **"Holding on: ? of ? s of contact (resets if contact breaks)."**
- The same code is already in the list from `limitCode` (H3), with the correct detail "Holding on: 0.4 of 1.0 s …". The answer therefore lists the item twice, both under code 42. `Inspector.tsx:574` uses `key={it.code}`, so the two list items share a duplicate key.
- `Inspector.tsx:575` renders every item's detail in both views. A player sees a claim with no measured value, which breaks SPEC §12.1–§12.2 and the "Honest labels" rule.

**Repro**
- Script: `npx tsx tmp/verify-g5-wave-13-1/stop.ts`.
- Setup: a P10 pinned in contact with a P01 for 4 ticks (REG with P10, allowUnimplemented).
- `stopAnswer(e).items`:
  - `[{42, "Holding on to its prey.", "Holding on: 0.4 of 1.0 s …"}, DIV_BLOCK_SIZE, DIV_BLOCK_ENERGY, DIV_BLOCK_AGE, {42, "Holding on to its prey.", "Holding on: ? of ? s of contact (resets if contact breaks)."}]`
- No test covers this:
  - `tests/ui/inspector-p5.test.ts` checks `constraintWords` and `organismLines`, never `stopAnswer` for a handler.
  - The e2e Needlejaw journey never reads `why-stop`.

**Fix (one line)**
- Skip the predation item when `items` already holds its code, or pass `phase5Context` to it.
- Add a `stopAnswer` assertion that no detail contains "?".

### MINOR [org-ui] `tests/worker/inspect-p5.test.ts:259-281`: the v1.0 payload check is weaker than the assignment asked for

- The assignment asked that a v1.0 dish's inspector payload deep-equal the HEAD payload.
- The test checks only that no new key appears, plus the predation code set and the sugar-source keys.
- The builder's byte comparison against a `git archive` of HEAD (2,071 payloads) was a one-off in tmp. It is not in the suite.
- Reading the diff, I found no v1.0 path that changes: handlingNeed is 0, there is no mixotroph, Profile.glow and rivalry are null, and there is no rival field. So this is a regression-guard gap, not a defect.

### MINOR [org-ui] `src/ui/strings/organisms.ts:105` and `reasons.ts:109`: "It senses neighbors." does not say where the signal comes from

- The line is shown whenever sensed ≥ the on threshold. That signal may come from an M06 "Lantern signal" dose, or from the organism's own emission, with no neighbour present.
- The e2e fixture itself reaches the line with a forced 0.5 signal and no neighbour.
- This is the same honesty concern D-0120 raised for RIVAL. That case was fixed by naming the source; this one was not.
- The wording is UX §5.2's canonical text (line 165), so this is an owner-review item, not a builder error.

### MINOR [org-ui] `src/render/picture.ts:256-276`: the dish picture does not draw grit

- The picture renderer copies `paintDeposits`' glyph rules but has no grit (band 7) branch. A picture of a dish holding grit therefore omits the glyph that the live view shows.
- `picture.ts` was not in org-ui's file list. This is a NEEDS for the lead or P5.8. It is an omission, not a false claim.

### MINOR [relmatrix] The mutation checks were not reproduced independently

- I tried a load-time `vi.mock` mutant: RADIUS_CAPTURE_DISTANCE 1.2 and TRAP_COOLDOWN_SECONDS 20.
- It did not finish in 900 s, because my merged vitest config probably pulled in the whole suite.
- So I rely on the builder's table of 8 `vi.mock` mutants for vacuity. Every row I read pins its observation tightly:
  - exact tick counts k / k−1;
  - `Object.is` growth;
  - the exact drain to 1e-15;
  - contrast rows for the non-mockable rules: film 0.05 against 0.10, the resting daughter against her parent, P09 with and without a meal, grit against silicate.

## Verified OK

- **FENCE: OK.** I ran it myself: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/determinism-g3.test.ts` gave 10 files and 77 tests passed, exit 0.
- **org-ui unit tests: OK.**
  - `cue3-org`, `inspect-p5`, `features-p5`, `inspector-p5`, `protocol3`, `protocol3-v1-equivalence`, `module-visuals` and `reduced-motion`: 8 files, 93 tests passed.
  - `tests/ui`, `tests/experiments`, `tests/content/art*`, `tests/render`, `tests/worker/relationships` and `relationship-map`: 75 files, 643 tests passed.
- **relmatrix tests: OK.** `relationship-matrix.test.ts`, `relationship-matrix-p5.test.ts` and `neutral-founders.test.ts` (the other importer of `tables.ts`): 3 files, 85 tests passed.
- **The shipped matrix is unchanged: OK.** I ran HEAD's `tools/relationship-matrix.ts` and `tests/helpers/tables.ts`, extracted with `git show` into tmp/verify-g5-wave-13-1/headtool, against the current tool on the shipped registry.
  - Both give 711 rows.
  - The rows JSON sha256 is identical: `e5191d79…7f72`.
  - The skipped lists are identical.
- **Art check: OK.** `npm run art:build -- --check` reports "atlas up to date · 1691 frames (136 feature-mark frames, 26 world-tile frames) · 1024×2048 · 08fb56e6b439". The atlas did not move: ATLAS_FEATURE_LAYERS keeps the same order, and FEATURE_LAYERS appends glow_center, jacket_rim, mode_half, handling_arc and trap_loop in that order (D-0109, D-0112).
- **Contrast audit: OK.** `npx tsx tools/contrast-audit.ts` exits 0 ("386 pairs … 0 unexplained"). It has no grit row; that is the builder's NEEDS 1 for the lead. `features-p5.test.ts` measures grit ≥ 3:1 for the dark corner on water and gel, and for the pale face on sediment.
- **tsc: OK.** `npx tsc -p tsconfig.json --noEmit` exits 0. relmatrix's TS6133 note about `organismFixture.ts` is stale.
- **eslint: OK.** Exit 0 on all 32 changed or new files of both tasks.
- **Protocol: OK.** The change is additive.
  - New bits: HANDLING_QUARTER (3<<13), HOLD_CLOSING (1<<15) and GLOWER (1<<16).
  - They are disjoint from the wave 11 bits, below 2^24 and exact in Float32.
  - PROTOCOL_VERSION is still 3 and ENT_STRIDE is still 15.
  - `cue3Of`'s only caller passes the glower flag (`snapshot.ts:182`).
  - A v1.0 dish packs E_CUE3 = 0: tested on FIRST_DISH_V1 over 300 ticks, and the protocol3-v1-equivalence golden passes.
- **The handling quarter follows D-0112 exactly: OK.** It is computed as min(3, max(0, ⌈4p/n⌉−1)) and packed only with CUE3_HANDLING. The jacket band now uses `handling.ts jacketCoverage`.
- **Trap closing frame: OK as a PROPOSED decision.**
  - The closing frame comes from the holder's trapTimer ≤ 1 s, which counts up (`traps.ts:495`). It is a state still keyed to a recorded column, which matches D-0112's "keyed to recorded columns".
  - Reduced motion shows the holding frame only.
  - This replaces the assignment's 'trapHold' visual event. The lead should rule on it in D-0124.
- **GLOWER instead of DishInfo or NATIVE_MARKS: OK as a PROPOSED decision.**
  - DishInfo carries no abilities (`SpeciesDiet` has metabolism, foods, prey, hosts and digestsFilm only).
  - The atlas manifest has no per-species marks, and NATIVE_MARKS lives in `tools/`.
  - So a worker bit taken from Profile.glow is the only truthful source.
- **The renderer's Phase 5 marks and poses: OK.**
  - The marks are stills taken from E_CUE3, in the priority trap_loop, handling_arc, glow_center, mode_half, jacket_rim, then the v1.0 order, capped at 2 when unselected.
  - The 'dormant' anim exists only for b12, f04 and p08, and 'trap' only for f03 (atlas manifest), so no v1.0 species draws differently.
- **Grit glyph: OK.**
  - A v1.0 band set paints pixels identical to HEAD (the sha256 is pinned).
  - The incremental repaint follows band 7 and stays byte-equal to a full paint.
- **Inspector fields: OK.** Each comes from a sim reader or a column:
  - `trapView`, `heldView` (drained = the owner's intakeLastSecond, which `commitTrapDrains` adds the full drained C to);
  - `handling` and `beingHandled`, from valid preySlot and preyBirthId with handlingNeed > 0, and never written by the sim;
  - `mode`, as metabolicMode with derived.light;
  - `jacket`, from `jacketView`;
  - `signal`, from `sensedSignal` and Profile.glow;
  - `rival`, from `exposureBreakdown` and `inhibitorExposure`, using the same 1/(1+x) and INHIBITOR_DAMAGE·x as suitability and chemistry.
- **D-0120 carried items: OK.**
  - D-0120 lists "snapshot.ts dropping exposure.rival when the breakdown has no lines" as a bug, so keeping the rival line (`snapshot.ts:1107`) is the right reading of the assignment's wording.
  - RIVAL_EXPOSURE is worded by its source.
  - FIELD_NAMES gives one name per field in the cell panel, MEAN_NAMES and the gate sheet. The gate sheet gets rival through RESIN_TARGET_WORDS, which says 'rivalry chemical'.
  - The secretion share reads the starch producer bit (`experiments.ts starchSecretionCode`), and every `tests/experiments` file passes.
  - A Photo-mode A04 is never "Eating" (`modules.ts:66`).
- **Honest wording: OK.** No "protected", "immune", "armored" or "forever" appears in any Phase 5 line (tested).
- **The relmatrix families match the catalog: OK.**
  - Every expectation is parsed from the CT text by `tables.ts`.
  - The parser tests pin each new row: A04 modes, P10 4 s / 1 s, "within 1 cell", the A05 note, X02, V02 and F03, RIVAL, E02 and E11, M02–M12, and the §12 constants.
  - The handling rows require capture on exactly tick k, and that a break at k−1 resets need and progress.
  - The radius rows fail on 'attempt started', so a handler cannot pass them vacuously.
  - The trap timeline requires exactly 80 held ticks and a 300-tick wait.
- **Ownership: OK.**
  - org-ui edited only its listed files, plus a documented one-line re-pin in `tests/ui/probe-charts.test.ts:136` that the field rename forces.
  - relmatrix edited only its four files and the generated report.
  - Neither edited content, the manifest, `implemented.ts`, the schema, or the sim rules beyond `experiments.ts` and `moduleView.ts`, which org-ui owns.
  - There is no Math.random, Date or Map iteration in the new sim-side code.

## For the lead

- **The MAJOR blocks org-ui.** It is a one-line fix in `shortcuts.ts` plus a test.
- **PROPOSED decisions to rule on in D-0124:**
  - org-ui 2: the closing frame from trapTimer;
  - org-ui 3: the GLOWER bit;
  - org-ui 4: the Lab wording for HELD_IN_TRAP, CAPTURED_HANDLING and PRED_HANDLING_IN_PROGRESS;
  - org-ui 6: the extra fields `rival` and `secretion`;
  - the relmatrix digest snapshot, and the radius rows gated on an enabled radius predator.
- **Owner-review items:**
  - "It senses neighbors." with no source named;
  - RIVAL_EXPOSURE's Explore text now differs from UX §5.2 line 148 ("Something here is hurting it."), as the assignment asked; UX_SPEC should follow.
- **NEEDS:**
  - grit rows in `tools/contrast-audit.ts`;
  - grit in `src/render/picture.ts`;
  - the UX §7.4 "As built" cells.
