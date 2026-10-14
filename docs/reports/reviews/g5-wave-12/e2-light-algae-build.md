# Wave 12, e2-light-algae: build report

The task was the light-and-algae half of P5.3: A03's low-light curve, A04's saved metabolic mode, A05's canopy (tests only), the item 0 constants and event types, and hooks H1–H3 for e3-predation. Nothing is enabled (D-0104). There is no schema bump, no protocol bump and no content edit. Nothing was committed: the lead commits.

## Checklist

**Item 0. Shared names.** Done first, before any other edit. They are unchanged since; the exact text is below.
- `src/sim/constants.ts:213-228`:
  - `LOW_LIGHT_SATURATION = 0.3`
  - `MODE_PHOTO_LIGHT = 0.35`
  - `MODE_SUGAR_LIGHT = 0.25`
  - `RADIUS_CAPTURE_DISTANCE = 1`
  - `HANDLING_JACKET_BASE_SECONDS = 1`
  - `HANDLING_JACKET_SECONDS_PER_COVERAGE = 3`
  - `JACKET_COVERAGE_FRACTION = 0.1`
  - Each constant has a comment citing CT/SPEC.
- Wave 11 exported no jacket constant: snapshot.ts:241 uses an inline `0.1`. So `JACKET_COVERAGE_FRACTION` is new. **Note for e3-predation's verifier:** cue3Of still uses the inline 0.1. Equal value, no shared name.
- `src/sim/events.ts:45-63`: three new EventType members after `'glowOff'`, each with a doc comment.
  - `'modeSwitch'`: cause `R.MODE_PHOTO` or `R.MODE_SUGAR` (the new mode); species, birthId, cell; `detail { light }`.
  - `'handlingStart'`: cause `R.PRED_HANDLING_IN_PROGRESS`; species, birthId, cell; `detail { prey (birthId), preySpecies (index), need (seconds) }`.
  - `'handlingBreak'`: species, birthId, cell; `detail { prey, why: 'contact' | 'target' | 'hunger' | 'taken' | 'rest' | 'division', progress }`.
  - All three are event-ring only. `visualEvents` drops them, asserted in mixotrophy.test.ts "the feed".

**Items 1–9.**

| Item | Status | Where | Proving test |
|---|---|---|---|
| 1. Pure rules | DONE | `src/sim/mixotrophy.ts` (new): `MODE_NONE/PHOTO/SUGAR` (31-33), `initialMode` (36), `nextMode` (44), `lowLightResponse` (49), `hasMixotroph` (57, WeakMap on `world.species`), `updateMode` (70) | mixotrophy "pure rules" |
| 2. Stage 4 mode update | DONE | movement.ts: gate at 435 (`const mixo = hasMixotroph(world)`, once per stage); call at 450 (`if (mixo && sp.mixotroph) updateMode(world, i, cell)`). It runs right after `c.suitability[i]` is written, before the stress display and the life-state override. | mixotrophy "hysteresis and the modeSwitch event" |
| 3. Initialization at the first stage 4 | DONE | commands.ts is untouched. Mode stays 0 until stage 4 of the same tick. | mixotrophy "initialization…" (incl. recipe founder at tick 0, and 2,400 ticks of command inoculations with no Active A04 at stage 6 holding mode 0); mode-saves "THE initialization proof" |
| 4. One route per tick | DONE | intake.ts:256 (route condition), 84 (`photosynthesizedThisTick`) | mixotrophy "one route per tick" (5 tests) |
| 5. A03 curve | DONE | species.ts:58/107 (`lowLight`); intake.ts:62-64 (`photoLightResponse(prof, light, lowLight = false)`), 260-265 (request), 498-499 (access base), 523-525 (LIGHT_LIMITED) | low-light.test.ts |
| 6. Mode reasons | DONE | intake.ts:532-537 | mixotrophy "the mode reasons" |
| 7. Movement scoring | DONE | movement.ts:304, 306, 338 | mixotrophy "movement scoring" |
| 8. Newborn mode | DONE | births.ts:320 (parent's mode read before any write), 333 (per daughter, in the reconciliation loop beside the glow reset); no event | mixotrophy "newborn mode"; mode-saves "the tick after an A04 divides" |
| 9. Canopy with A05 | DONE (tests only) | — | canopy-a05.test.ts |

**Hooks.**
- **H1 DONE.** movement.ts:514-515: `if (c.decisionTimer[i] === 0 && hungry && !(c.handlingNeed[i]! > 0))`. The cancel of an invalid target is unchanged. Proved by predation-hooks H1 (3 tests).
- **H2 DONE.** births.ts:303-317. It runs before the birthIds are rewritten: one `'handlingBreak'` under `parentBirth` and `parentCell`, with `detail { prey: c.preyBirthId[i], why: 'division', progress: c.handlingProgress[i] }`. Then `handlingNeed = handlingProgress = 0` on the retained slot. `preySlot`/`preyBirthId` are kept. Nothing happens when need is 0. Proved by predation-hooks H2 (2 tests).
- **H3 DONE.** intake.ts:273-274: `if (sp.isPredator) c.limitCode[i] = c.handlingNeed[i]! > 0 ? R.PRED_HANDLING_IN_PROGRESS : R.PRED_NO_PREY;`. Proved by predation-hooks H3.

**Item 10.** Report only; see "Bugs and notes for other tasks" below.

## Done when

All DONE:
- The seven test files pass, and so do all listed regression files: 36 files, 331 tests.
- `npx tsc -p tsconfig.json --noEmit` is clean. eslint is clean on every changed or created file.
- The fence passes unchanged, twice: before the tests were written, and again at the end with e3-predation's in-flight edits in the tree.

## Stage 4 order as built

For each living organism in stage 4:
1. suitability, written to `c.suitability[i]`;
2. **updateMode**, when the world has a mixotroph and this species is one;
3. the stress display;
4. the life-state override;
5. the movement and decision branches.

`updateMode` reads `world.derived.light[cell]` for the organism's current cell at the start of stage 4. That is the light stage 2 of the same tick computed (D-0113). It also reads and writes `c.metabolicMode[i]`. It emits `'modeSwitch'` only for a Photo ↔ Sugar change, never on the way out of mode 0.

## Intake route by species kind

Shared terms: `L` is `light[cell]` and `av` is `availability(co2)`. Everything below is the photosynthetic CO2 request except the A04 Sugar mode row.

| Species | Route and request |
|---|---|
| Non-mixotroph photosynthesizer, no E06, not lowLight (A01, A05, A02) | `Math.min(co2, budget * L * av)`. Byte-identical to HEAD. |
| E06 carrier | `Math.min(co2, budget * photoCeilingShare(prof, L) * av)`. Unchanged. |
| A03 (lowLight) | `Math.min(co2, budget * lowLightResponse(L) * av)` |
| A04 in Photo mode | The photosynthetic route above (the plain form, or E06's). |
| A04 in Sugar mode (or mode 0, which no Active A04 reaches) | The field route with its content foods (`['sugar']`), never broth. |

What changed for other species:
- The route condition gained only `(!sp.mixotroph || …)`, which is true for every non-mixotroph.
- The access base and the LIGHT_LIMITED comparison read one extra boolean, `sp.lowLight`, which gives identical values when false.
- The mode reason is a separate `if` after the unchanged `limitCode`/`limitValue` lines.

Proof that the old paths are unchanged:
- low-light NEUTRAL: FIRST_DISH_V1 under the shipped registry and under REG (A03–A05 recorded, none placed) keeps every entity column, every field and `derived.light` Object.is-identical over 2,000 ticks.
- The fence, unchanged.
- Bit-exact closed forms for A01 next to A03 at 0.15, 0.30 and 0.60.

Products and O2, measured right after stage 6:
- Photo: ΔCO2 = −C. Δsugar = +0.50 C (no sugar eaten). ΔO2 = +0.50 C.
- Sugar: Δsugar = −C. ΔO2 = −0.30 C. CO2 rises.

## What each test proves (every mechanism checked with a mutant)

**tests/fixtures/low-light.test.ts** (8 tests):
- A03's request is exact against the closed form at 0.15, 0.30 and 0.60, and an A01 beside it is exact too.
- The request is the same at 0.30, 0.60 and 1.0 (no gain above 0.30).
- LIGHT_LIMITED with `limitValue = L` below 0.30, not at or above it.
- Products are 0.5/0.5/0.5 per fixed C.
- E06 is refused for A03 and accepted for A01 and A04.
- NEUTRAL, over 2,000 ticks.

**tests/fixtures/mixotrophy.test.ts** (19 tests):
- Pure rules.
- Initialization at 0.40, 0.30 and 0.20; the mode is already set before the first intake.
- A recipe founder has mode 0 at tick 0 and a mode after tick 1.
- 2,400 ticks with 40 command inoculations and the cycle: 0 Active A04 at stage 6 with mode 0.
- Hysteresis, including exact 0.25 and 0.35, with one event each (cause, light, cell).
- Photo/Sugar route exclusivity, including a 600-tick dusk run where `tookFromPool` is never both co2 and sugar and the route always matches the saved mode.
- No broth, even when broth is the only food.
- E06 in Photo mode only: in Sugar mode the carrier's intake equals the non-carrier's (Object.is). In Photo mode the ratio is 0.70/0.50.
- `photosynthesizedThisTick` follows the route.
- MODE_PHOTO and MODE_SUGAR reasons carry the light; FOOD_ACCESS_LOW and OXYGEN_LIMITED win when they bind.
- Movement: Photo goes to the bright side and ignores shaded sugar; Sugar goes to sugar; after a switch the same organism's target flips.
- Newborns at 0.30 keep the parent's mode; a daughter in a 0.40 cell is Photo and in a 0.20 cell Sugar, whatever the parent.
- visualEvents drops the three new types.

**tests/fixtures/canopy-a05.test.ts** (6 tests):
- One A05 shades its cell and four neighbours by 1/(1+5/10); diagonals are unshaded.
- Two in one cell give 1/2. Neighbouring colonies sum.
- The A05, an A01 and an A03 nearby each request exactly on the shaded light (the A03 through its curve).
- The light recovers at the next stage 2 after the A05's death.
- Only P08 lists A05 as prey.
- Conservation over 10,000 ticks.

**tests/sim/mode-saves.test.ts** (6 tests):
- Round trips at: tick 0 with mode-0 founders; right after initialization; the dusk Photo→Sugar switch tick; a mid-band hold; the dawn Sugar→Photo switch tick; the tick after a division; a held Sample (its rows carry metabolicMode); every rc1 save re-saved with an equal hash.
- **THE initialization proof.** The A05 grows during tick T−1, so the reload's `derived.light` at TARGET (< 0.35, asserted) differs from the uninterrupted one (≥ 0.35, asserted). The baseline is tuned per run so the two views straddle 0.35. An A04 inoculated by command in the first step after the reload ends with equal stateHash and equal `trajectoryDigest('full')` at T+300.

**tests/sim/algae-determinism.test.ts** (4 tests):
- run(400) equals 4×run(100).
- Save at 777 → load → run to 3,000 equals the uninterrupted run.
- DishHost at 1× and 4× gives the same hash, and it equals a headless run.
- Closed-lid conservation over 10,000 ticks: relErr < 1e-5, absolute residual < 1e-8, with mode switches present.

**tests/sim/predation-hooks.test.ts** (6 tests): H1, H2 and H3 as described above, plus zero-column P01 checks. Columns are set right before the stage under test through step hooks, so each check isolates that stage from contacts.

**tests/worker/cue3-mode.test.ts** (1 test): the packed E_CUE3 mode field equals metabolicMode in both modes (plain and E06 A04), follows a switch, and is 0 before the first stage 4 and for A01, A03, A05, B01 and P01.

## Mutants

Each mutant was applied by hand or by script, its test was run, and the change was reverted. `tmp/e2-light-algae/mutants.py` and `mutants.txt` hold the record. commands.ts was restored and `git diff` on it is empty.

| Mutant | Failing tests |
|---|---|
| Initialization in introduceOrganism from `derived.light` | mode-saves "THE initialization proof" (`expected 2 to be 1`: the modes differ after the reload) |
| No hysteresis (switch at 0.30) | mixotrophy hysteresis |
| Both routes in one tick | mixotrophy "bright light… CO2 only", "never both… dusk", "E06 acts in Photo mode only" |
| E06 applied in Sugar mode | mixotrophy "E06 acts in Photo mode only" |
| A03 curve on every photosynthesizer | low-light exact A01 closed form at 0.15, 0.3 and 0.6 (and NEUTRAL) |
| Newborn copies the parent's mode only | mixotrophy "a daughter placed in a 0.40 cell…" |
| Photo mode scores sugar | mixotrophy both movement tests |
| H1 removed | predation-hooks H1 (2 tests) |
| H2 without the event | predation-hooks H2 |
| H3 removed (extra) | predation-hooks H3 |
| No stage 4 update (extra) | all initialization tests |

## Commands and results

- `npx tsc -p tsconfig.json --noEmit`: clean (exit 0).
- `npx eslint <the 7 new tests + 7 sim files>`: exit 0, no problems.
- The 36-file run (the regression list from "Done when" plus my 7 files): `Test Files 36 passed (36); Tests 331 passed (331)`.
- Fence run 1, early: `Test Files 10 passed (10); Tests 77 passed (77)`. Fence run 2, at the end: `Test Files 10 passed (10); Tests 77 passed (77)`. Both used `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/determinism-g3.test.ts`.
- **FENCE: no value moved.** fence-update was never run.

## Timings

Indicative only (`tmp/e2-light-algae/timing.ts`): 300 placed, mean and p95 over 300 ticks, on a shared 2-CPU machine. Half the dish is lit 0.2 and half 0.6, with sugar 0.5. The A04s multiplied to 423 during the run.

| Run | Stage 4 mean | Stage 4 p95 | Stage 6 mean | Stage 6 p95 |
|---|---|---|---|---|
| A01 ×300, run 1 | 0.097 ms | 0.096 ms | 0.237 ms | 1.048 ms |
| A01 ×300, run 2 | 0.093 ms | 0.097 ms | 0.134 ms | 0.165 ms |
| A04 ×300 (423 alive), run 1 | 0.712 ms | 2.494 ms | 0.323 ms | 1.356 ms |
| A04 ×300 (423 alive), run 2 | 0.539 ms | 0.712 ms | 0.176 ms | 0.197 ms |

A04's stage 4 cost is mostly ordinary movement decisions: A04 swims, A01 is stationary. The mode update itself is one comparison per organism.

## Proposed decisions

- **PROPOSED DECISION (thresholds):** the A04 thresholds are inclusive and compared exactly on the stored effective light, with no tolerance. Photo at ≥ 0.35, Sugar at ≤ 0.25, as SPEC §7.10 words it.
- **PROPOSED DECISION (stage 4 initialization; argued against the draft's commands.ts inoculation):** an introduced A04 gets its first mode at its first stage 4, in the same tick it was introduced, not in stage 1. climate.ts's header records the invariant "no simulation reader of derived.light runs before stage 2", and a reload recomputes light with the current canopy biomass. A stage 1 read would therefore diverge after a reload. Proven: the commands.ts mutant fails the initialization proof. The import already accepts mode 0, which a tick-0 save holds, and no refusal of mode 0 was added.
- **PROPOSED DECISION (no event for a first mode):** a newborn's or an introduced organism's first mode is a state, not a transition, so it emits no `'modeSwitch'`.
- **PROPOSED DECISION (mode reasons):** a mixotroph whose final leading constraint is NONE reports MODE_PHOTO or MODE_SUGAR, by the route it fed on, with `limitValue` = the cell's light. Any binding limit keeps priority (SPEC §12.2).

## For the lead

- Append `LOW_LIGHT_CURVE` and `MIXOTROPHY` to `IMPLEMENTED_NATIVE_ABILITIES` at integration. mode-saves and algae-determinism mock them in; the registries use allowUnimplemented.
- I edited no file outside my list. commands.ts was edited temporarily for the mutant and restored byte-identical.

## Bugs and notes for other tasks (not changed)

- `dormancy.ts usableFoodHere` treats a mixotroph as photosynthetic and sugar-eating at once. This does not matter in practice, because A04 cannot rest.
- `snapshot.ts sugarSourcesOf` leaves out mixotrophs, although a Photo-mode A04 releases 0.50 sugar per C. This is for wave 13's org-ui, as is the inspector's mode line.
- `snapshot.ts cue3Of` jacket coverage still uses an inline `0.1`; `JACKET_COVERAGE_FRACTION` (constants.ts:228) is now available to replace it.
- tsc briefly flagged `tests/sim/predation-determinism.test.ts:207` (e3-predation's file, in flight). It cleared on the next run.

## Files

**Created:**
- /workspaces/pixelmeba/src/sim/mixotrophy.ts
- /workspaces/pixelmeba/tests/fixtures/low-light.test.ts
- /workspaces/pixelmeba/tests/fixtures/mixotrophy.test.ts
- /workspaces/pixelmeba/tests/fixtures/canopy-a05.test.ts
- /workspaces/pixelmeba/tests/sim/mode-saves.test.ts
- /workspaces/pixelmeba/tests/sim/algae-determinism.test.ts
- /workspaces/pixelmeba/tests/sim/predation-hooks.test.ts
- /workspaces/pixelmeba/tests/worker/cue3-mode.test.ts
- /workspaces/pixelmeba/docs/reports/reviews/g5-wave-12/e2-light-algae-build.md
- Scratch, not product files: /workspaces/pixelmeba/tmp/e2-light-algae/{timing.ts, mutants.py, *.txt}

**Changed:**
- /workspaces/pixelmeba/src/sim/constants.ts
- /workspaces/pixelmeba/src/sim/events.ts
- /workspaces/pixelmeba/src/sim/intake.ts
- /workspaces/pixelmeba/src/sim/movement.ts
- /workspaces/pixelmeba/src/sim/births.ts
- /workspaces/pixelmeba/src/sim/species.ts
