# Phase 3 wave 2: wave verify (lens: rules, determinism, conservation, tests, player-facing truth)

**Verdict: ok = false.** No BLOCKER. There are 2 MAJOR findings, and both are for the lead:
- `npm run check` is red. Tests outside the builders' files still pin pre-wave behaviour.
- A pre-existing save bug, which I reproduced, is now easier to hit because three more predators ship.

Every builder's own Build and "Done when" items hold against the code, the canonical docs and the runs I made in this session. The MINOR findings below are honest-label and robustness gaps.

Ground rules for this verify:
- I edited nothing in the repository except this report.
- Scratch work is in `tmp/verify-g3-wave-2/`, which git ignores:
  - `mut/` is a full copy of the tree, used for load-time mutants and repro tests.
  - Logs are `*.log`.

## Runs made in this session
| Command | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npx eslint` on all 64 changed and new .ts/.tsx files | clean |
| `npx tsx tools/content-validate.ts` | content ok, contentHash fc3a8762…, 15 enabled species, atlas complete (856 frames) |
| `npx tsx tools/art-build.ts --check` | "atlas up to date · 856 frames (80 feature-mark, 13 world-tile) · 99ab54adef36" |
| `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts` | **Test Files 6 passed (6), Tests 41 passed (41)**. The fence is unchanged. |
| `npx vitest run` on the builders' 17 new or changed test files (film, fungal-branching, relationships-film, dusk-suitability, host-specificity, parasite, phage, predation-matrix, relationships-w2, tests/render, siltworm-crossing, diet-line, protocol, atlas, module-visuals, lab-commands) | **Test Files 17 passed (17), Tests 191 passed (191)** (503 s) |
| `npx vitest run tests/sim/view-switch.test.ts tests/content/system-requirements.test.ts tests/ui/shortcuts.test.ts` | **3 failed**, 22 passed (see MAJOR 1) |
| The rest of the unit suite (every other test file; `tmp/verify-g3-wave-2/rest.log`) | **Test Files 5 failed, 86 passed (91); Tests 5 failed, 911 passed (916)** (1,063 s; see MAJOR 1) |
| `E2E_PORT=4395 E2E_OUTDIR=tmp/dist-verify-g3-wave-2 npx playwright test tests/e2e/film-fungi.spec.ts --project=desktop` | **1 passed (4.0 m)**. The builder left no evidence of this run, so I ran it. |
| 16 load-time mutants on `tmp/verify-g3-wave-2/mut` (`tmp/verify-g3-wave-2/mutants.sh`) | 13 killed. 3 survived, and all 3 are equivalent (see the non-vacuity entry) |

## Problems (most severe first)

MAJOR [lead] tests/sim/view-switch.test.ts:384, tests/content/system-requirements.test.ts, tests/ui/shortcuts.test.ts:51, tests/sim/stage8-order.test.ts:128, tests/sim/construction.test.ts:189–194 — `npm run check` fails. Five tests outside every builder's files still pin pre-wave behaviour, and the manifest enables of this wave break them. The organisms, parasites-phage and art-features builders reported the first three, as their assignments told them to, and none edited them. Nobody reported the last two: film-fungi wrote no report.
- stage8-order freezes SHIPPED as `[E_STARCH, E_OIL, E_PROTEIN, E01]`. It now also holds `native:BIOFILM`, as the assignment asked.
- construction expects a shipped `clearWater()` world without the film system ("plain … film toBeUndefined"). The shipped manifest now enables film.
- These two need a G2_LISTS registry or the new table.
- view-switch expects `lifeBrushFor` to return only `{habitatMask, attached}`. B02 is attached and V01 is viral now, so attached species also return `surfaces` and a phage returns `viral: true`. The organisms report gives the replacement expectation.
- system-requirements still asserts "B04 … ships without the film system".
- shortcuts asserts the B04 diet answer never says "biofilm". In a new Garden the world now records the film system, so `dietAnswer` correctly says "It can also digest biofilm as debris." (gated in snapshot.ts:500).
- Repro: the rest-of-suite run (`tmp/verify-g3-wave-2/rest.log`) shows exactly these 5 failing tests in 5 files.
- Fix: update the five expectations to the new truth before committing.

MAJOR [lead] src/sim/contacts.ts:98–103 and :129, with src/persistence/saveFile.ts:373 — pre-existing (g2 code); parasites-phage reported it as bug 1. A predator can keep a `preySlot`/`preyBirthId` that points at a prey removed in the same tick, and the import then refuses the save with "A prey link points at an organism that is not there."
- How the stale reference arises:
  - `consumePrey` clears only the winner's target. The losers of a contested capture keep theirs.
  - Stage 7 age or starvation deaths leave every pursuer's target in place.
  - In every case the reference is cleared only at the next stage 4.
- Repro: `tmp/verify-g3-wave-2/mut/tests/verify/stale-prey.test.ts`.
  - Setup: a B01 at age 599.95 is targeted by a P01 with decisionTimer 0.
  - After 1 step: prey alive 0, the predator's preySlot 0.
  - Then `buildSaveFile` → `loadSaveFile` rejects with `{kind:'integrity'}`.
- How often: a seed-104729 FIRST_DISH_V1 probe had 0 of 120 saves refused over 6,000 ticks, so it is rare in the onboarding dish. P02, P03 and P04 now ship, which makes contested hunts more common.
- The autosave written at such a tick cannot be loaded ("saves are sacred").
- Needs a ruling. Either:
  - accept a stale prey target on import (it is transient, and stage 4 cancels it whenever refValid fails); or
  - clear pursuers' targets when their prey is removed (this changes g2 hashes, so it is a FENCE change).

MINOR [film-fungi] docs/reports/reviews/g3-wave-2/ — the builder wrote no build report. Its returned text says "The final run is still in progress."
- Missing from the evidence: commands and results, the non-vacuity check ("say how you checked"), the e2e run, and the three PROPOSED DECISIONs:
  - native film energyPerC 0;
  - four-neighbour placement superseding D-0002 / SPEC §6.9 step 2 for fungi;
  - W2-08 network wording.
- This report now supplies the evidence:
  - all film, fungal and relationships-film tests pass;
  - the 10,000-tick Gel Colony run passes;
  - mutants with film decay off, the B0' floor off, diagonal neighbours added, the ordered film request removed, and the 2,000 cap check off are each killed by a named test (table below);
  - the desktop e2e passes in 4.0 m.
- The lead must still log the three decisions in DECISIONS.md and list the D-0002 override for the owner.

MINOR [parasites-phage] src/persistence/saveFile.ts:429 — the import refuses `infectedBy ≠ 0` only in a world without the viruses system. Any other code (2…255) is accepted in a viruses world.
- At lysis, `lyse` throws "lyse: slot 0 is infected by unknown virus code 7" (src/sim/viruses.ts, lyse), so the worker dies after an import that reported success.
- Repro: `tmp/verify-g3-wave-2/mut/tests/verify/bad-virus-code.test.ts`. It loads a save whose B01 has infectedBy 7 and timer 19.95; the load succeeds and the next steps throw.
- Fix: refuse any `infectedBy` that `virusIdOfCode` does not know, or that names a virus this dish does not enable, and end the message with "Nothing was loaded."

MINOR [parasites-phage] src/ui/panels/Inspector.tsx:489 with src/sim/parasites.ts:439 (`parasiteInfo`) — "Hitcher draining 0.02 C/s." prints the record's `drainRate`, not the measured drain.
- `reserveHostDrains` scales the drain by the cell's free-nutrient fraction L and caps it at host B (parasites.ts:309–345).
- So a nutrient-limited or nearly empty host still reads 0.02 C/s.
- CLAUDE.md "Everything the inspector says traces to … a measured value."
- Fix: report the C actually drained in the last tick or second (for example from `intakeAccum`), or word the line as the maximum rate.

MINOR [parasites-phage] src/ui/panels/Inspector.tsx:484/489 — INFECTED and PARASITIZED always use the Lab column of UX §5.2, including in Explore.
- UX_SPEC.md:148–149 gives Explore its own wording: "It's infected and can't split." and "Something is attached to it."
- This is logged as a proposed decision. The owner should confirm it, or the line should follow the view.

MINOR [lead] src/ui/strings/reasons.ts:120–122 with src/sim/births.ts:146–151 — at the 2,000 fungal subcap, births get DIV_BLOCK_CAPACITY and set the same capacity flag as the 6,000 agent cap. The assignment specified this.
- The Lab text then says "Simulation capacity reached (6,000)", which is the wrong number for the cap that was actually hit. Explore says "The dish is full."
- Fix: a fungal-cap reason, or a ctx value naming the cap that applied.

MINOR [art-features] src/render/renderer.ts:868–884 — fungal mask tiles are one cell wide but are drawn at the segment's entity position.
- Segments are jittered inside their cell:
  - inoculation, commands.ts:327: 0.2–0.8;
  - division placement, births.ts:251–252.
- So each tile's arms are offset by up to ±0.3 cell from its linked neighbour's tile, and threads do not meet.
- The builder notes that nothing was checked by eye in a live dish.
- Fix: snap fungal tiles to `floor(x) + 0.5`, `floor(y) + 0.5`. Look at a live Threadlace network before ticking P3.4.

MINOR [organisms] tests/fixtures/dusk-suitability.test.ts:58–89 — the closed-lid Dusk fixture runs on an all-sediment dish preset to O2 0.10, not the assignment's colony setup.
- It is logged as a PROPOSED DECISION with measurements: a Water Garden runs out of sugar before oxygen, and Dusk at O2 ≥ 0.4 dies within 50 s.
- The assertions are not vacuous. The mutant that changes 0.40 to 0.50 fails both tests.
- The owner should hear the balance consequence: Dusk cannot survive in a default oxygenated dish.

MINOR [lead] src/ui/panels/Inspector.tsx:515–526 — the new "Biofilm here" and "Network" lines sit in the 14 px `.kv` grid.
- parasites-phage moved its own lines out of that grid to meet UX §4.1's 16 px body text.
- This is a pre-existing pattern of the grid, now with two more player-facing sentences in it.

## Non-vacuity (load-time mutants on the tmp copy; each file restored after its run)
| Mutant | Named test that failed |
|---|---|
| film decay off (transport.ts filmStage frac = 0) | film.test "decay moves 0.1 %/s … closed form over 1,000 ticks" |
| B0' floor off (film.ts amount = remainingBody) | film.test "nothing for the first 100 ticks … stopping exactly at B = B0′" |
| diagonal neighbours added (fungi.ts FUNGAL_NEIGHBORS) | fungal-branching "never on a diagonal or in the parent cell …" |
| ordered film request removed (intake.ts) | film.test "B04 and F01 eat film …"; relationships-film "F01 eats … film" |
| 2,000 cap check off (births.ts) | fungal-branching "at 2,000 segments …" |
| PREY_FREE → true / PREY_IN_SEDIMENT → true (movement.ts) | predation-matrix: 3 tests each |
| V01 hostIds → every species (viruses.ts) | host-specificity: 2 tests |
| lysis fraction 0.40 → 0.50 | phage "lysis comes exactly 200 ticks … 28 units" |
| drain split 20 % metabolite → 10/10 metabolite/CO2 | parasite "drains exactly 0.002 C per tick …" |
| MAX_WATER_CELLS 2 → 3 | siltworm-crossing: 5 of 6 tests |
| Dusk O2 divisor 0.4 → 0.5 | dusk-suitability: 2 of 2 tests |
| CUE2_INFECTED never packed | protocol "a hand-built world decodes …" |

The three surviving mutants are equivalent:
- **Parent cell added as a fungal candidate.** The parent's cell is always marked occupied by the parent segment.
- **The draw-side `units >= 1` relaxed to `> 0`.** The consumption-side `field[cell] >= 1` still blocks the infection. The builder's mutant, which relaxed both checks, failed "fewer than one unit never infects".
- **`releaseHostPair` removed from `consumePrey`.** `attachParasites` → `releaseStaleParasites` clears the dangling pair later in the same stage 5. The call is redundant but harmless, and no test can tell the difference.

## VERIFIED OK
- VERIFIED OK — fence: g2-replay plus the four trajectory-fence files plus closed-lid conservation give 41/41. Hash-neutral columns (`filmSeconds`, `waterCrossed`) are hashed only when non-empty (entities.ts:94–98, serialize.ts:259).
- VERIFIED OK — determinism hygiene: no `Math.random`, `Date`, Map/Set or object-key iteration in any new or changed src/sim line. New contact kinds 2 (parasite) and 3 (infection order) sit on the `contact` stream, and infection draws use `STREAMS.infect`. Every gate reads the world (`worldHasSystem`, allocated fields, species abilities), never a build constant.
- VERIFIED OK [film-fungi] — B02: native builder `{minEnergy 40, 0.05/s, floor 1.0 B0', energyPerC 0}` (phenotype.ts:183). BIOFILM sits in SHIPPED between E_PROTEIN_SECRETION and E01 (actions.ts:103). The clock is read before it is added, so the first deposit comes on tick 101. Construction applies the 0.50 headroom proportionally. The D-0045 ordering test passes.
- VERIFIED OK [film-fungi] — film decay in stage 2, C and N, internal (transport.ts:224–254), only where film fields exist. Film is eaten as detritus only with the system and only where film > 0, so film-free worlds make no extra request (intake.ts:168, 180–201). The weighted request uses the detritus weight; K stays at most 6.
- VERIFIED OK [film-fungi] — F01 placement:
  - four neighbours E, S, W, N; canOccupy; soft capacity; no fungal segment, including daughters placed earlier in the same stage;
  - ranked by food, then suitability, then order;
  - blocked placement keeps the proposal at no cost;
  - LINK_VISUAL after commit;
  - the 2,000 subcap applies to births and introductions, counted from living slots;
  - `fungalNetwork` counts segments and threads apart; the inspector line matches W2-08.
- VERIFIED OK [film-fungi] — the 10,000-tick closed-lid Gel Colony (B02, F01, B04): ledger < 1e-5, `trajectoryDigest` equal at 1× and 4× and across save/reload. The desktop e2e passes.
- VERIFIED OK [organisms] — P04 crossing (crossing.ts):
  - enterCell allows at most 2 consecutive water cells, refusing the third in both the trace and the decision candidates;
  - stage 4 and the inspector share `entitySuitabilityAt`;
  - canOccupy and habitatCompatible are unchanged.
- VERIFIED OK [organisms] — predation:
  - preyAllowed 'free' and 'inSediment' are unchanged and proved by the CT §3.2 literal matrix;
  - B03/Y01 run anaerobic at 18 E/C; Y01 adds 0.20 acid per C; B05 eats only metabolite.
- VERIFIED OK [organisms] — Add Life and the Lab tray:
  - the diet line is derived from `speciesDiets`, with film only under the film system (host.ts:1932–1938);
  - the V01 brush rule equals `phageCellAccepts` and never imports viruses.ts;
  - toast and dose copy are per cell;
  - livesHereText never claims open water for attached species.
- VERIFIED OK [parasites-phage] — X01:
  - attachment after predation; contact ≤ 0.5 cells; hostIds; highest det wins;
  - drain reserved before ordinary requests and committed after, split 50/30/20, +30 E per C with a ledger record, N bound first;
  - drain death below 0.25 B0';
  - release on killEntity, capture and rest;
  - birthIds re-pointed on division;
  - import refusals for non-mutual pairs and unlisted hosts.
- VERIFIED OK [parasites-phage] — V01:
  - snapshot draws at ≥ 1 unit; 1 unit consumed, carrying 0.01 C into B;
  - lysis at exactly 200 ticks, floor(0.40 B / 0.01 + 1e-9) units, the rest to detritus through killEntity;
  - doses record count × 0.01 C per dosed cell as an input and create no entities;
  - refused in worlds without the viruses system.
- VERIFIED OK [art-features] — protocol 2:
  - stride 14; every slot written; CUE2 bits only from state; link mask from valid fungal links;
  - adhesion links each once; object fill = C/10;
  - film band 6 with an eroding bit in a worker-side WeakMap.
- VERIFIED OK [art-features] — render: src/render imports only `@sim/constants` and `@sim/grid`. Fungi never take the body path. The infection glyph needs CUE2_INFECTED plus selection or the toggle. Art build `--check` passes. The ARCHITECTURE.md edit is limited to §7 and §8.
- VERIFIED OK — shared-file edits are additive and within their assignments. The only out-of-list edit is `src/ui/feed.ts`'s `objectEmptied` case, which `tsc` required. The contentHash was rewritten by the validator.
