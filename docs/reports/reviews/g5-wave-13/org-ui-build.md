# org-ui build report (Phase 5 wave 13, P5.7 organism half + the Phase 5 organism inspector)

Nothing is enabled (D-0104). No schema bump, no protocol version/stride/band change, no content edit (contentHash unchanged), no simulation rule changed (the only `src/sim` edits are the observation-only `experiments.ts` secretion share and `moduleView.ts` E11 "active now"). The FENCE passes unchanged. `implemented.ts` untouched.

## Checklist: Build

| # | Item | Status | Where | Proving test |
|---|---|---|---|---|
| 1 | Feature-layer move: FEATURE_LAYERS appends GLOW_CENTER, JACKET_RIM, MODE_HALF, HANDLING_ARC, TRAP_LOOP; FeatureLayerId gains them; PHASE5_FEATURE_LAYERS and Phase5FeatureLayerId removed (only tests imported them; re-pointed); ATLAS_FEATURE_LAYERS = FEATURE_LAYERS and AtlasFeatureLayerId kept (tools/art-build.ts imports both); renderer FeatureLayerId / FEATURE_LAYER_IDS gain the five in the same order | DONE | art/src/layers/modules.ts:54-73, 384-401; src/render/features.ts:57-90 | module-visuals.test.ts:139 unchanged and passing; art-p5.test.ts / art-p5-large.test.ts re-pinned (comments "wave 13, D-0109/D-0112"); `npm run art:build -- --check` up to date, no rebuild |
| 2 | Protocol 3 refinement (additive inside E_CUE3): HANDLING_QUARTER (2 bits at 13), plus HOLD_CLOSING (1<<15) and GLOWER (1<<16) (PROPOSED DECISIONS 2, 3); jacket band from handling.ts jacketCoverage; EntityInspect optional trap / heldBy / handling / beingHandled / mode / jacket / signal (+ secretion, rival: PROPOSED DECISION 6); exposure.rival kept with no inhibitor lines; sugarSourcesOf counts A04 with `inLight`; a handler's predation code is PRED_HANDLING_IN_PROGRESS | DONE | src/worker/protocol.ts:507-524 (bits), 1018-1112 (types), 974 (inLight); src/worker/snapshot.ts:230-276 (cue3Of, HOLD_CLOSING_SECONDS, handlingQuarter), 603, 705-795 (phase5Lines, lastEmitterKind), 812 (sugarSourcesOf), 1107 (exposure) | tests/worker/cue3-org.test.ts, tests/worker/inspect-p5.test.ts, protocol3-v1-equivalence (unchanged, passes) |
| 3 | Marks: featureLayers reads `ctx.cue3`; renderer passes E_CUE3; trap_loop / handling_arc / glow_center / mode_half / jacket_rim each only from their bits; F03's trap pose from the CUE3 trap state; native resters' dormant poses (B12, P08 body `dormant`, F04 resting-spore tile) wired; shells are body art (nothing to wire) | DONE | src/render/features.ts:153-229; src/render/renderer.ts:1163, 1200-1203, 1233-1236, 1241; rebuildDraws (trap/dormant textures) | tests/render/features-p5.test.ts; module-visuals.test.ts (reachability sweep now includes every E_CUE3 state) |
| 4 | Grit glyph (procedural, band 7): pale angular specks with a dark slate corner, 1-3 by band; repaintDepositCells follows band 7; a v1.0 band set paints the HEAD pixels | DONE | src/render/layers.ts:33-37 (colours), 150-162 (repaint), 192-236 (paintDepositCell, paintGrit) | features-p5.test.ts "grit" (HEAD sha256 pin, glyph, incremental = full, contrast) |
| 5 | Inspector lines (trap, held, division blocker, handler, prey, mode, jacket, E11 card "active now", NEIGHBORS_DETECTED, RIVAL) | DONE | src/ui/inspector/OrganismLines.tsx; src/ui/strings/organisms.ts; src/ui/strings/reasons.ts (lab cases); src/ui/strings/shortcuts.ts (leadConstraint, constraintWords, blockerDetail, stopAnswer, sugar sources); src/ui/strings/modules.ts (actionLabel, lifeStateWhile, E02/E11 cards); src/sim/moduleView.ts (E11 → jacketBuiltNow); src/ui/panels/Inspector.tsx (OrganismLines in "Happening now", the cell rival line) | tests/ui/inspector-p5.test.ts; tests/e2e/organisms-p5.spec.ts |
| 6 | D-0120 carried copy: secretion words by emitter; experiments secretion share by the starch producer bit; RIVAL_EXPOSURE by source; one field name per field | DONE | strings/organisms.ts secretionLines; src/sim/experiments.ts starchSecretionCode; strings/reasons.ts RIVAL_EXPOSURE; strings/fields.ts, strings/observe.ts MEAN_NAMES, Inspector.tsx CELL_FIELD_NAMES | inspector-p5 (ui and worker); tests/experiments/* 17 files / 115 tests unchanged |
| 7 | V02 glyph polish | NOT DONE by design (PROPOSED DECISION 10: P5.8) | - | - |

## Checklist: Done when

- DONE: the four new unit files pass with module-visuals, art*, tests/render/*, protocol3, protocol3-v1-equivalence, relationships, relationship-map, tests/ui/*, tests/experiments/* (results under Commands).
- DONE: `npm run art:build -- --check`: "atlas up to date · 1691 frames (136 feature-mark frames, 26 world-tile frames) · 1024×2048 · 08fb56e6b439".
- DONE: `npx tsx tools/contrast-audit.ts`: exit 0, "386 pairs; 320 required, 195 pass, 125 justified failures, 0 unexplained". The tool lists deposit glyphs but not grit; it is not mine (NEEDS 1). The grit colours are measured in features-p5.test.ts.
- DONE: `npx tsc -p tsconfig.json --noEmit`: clean on the final tree (an earlier run showed relmatrix's in-flight tools/relationship-matrix.ts:78 error, since gone).
- DONE: `npx eslint` on every changed file: clean.
- DONE: the FENCE unchanged: 10 files / 77 tests passed.
- DONE: e2e journeys on desktop AND phone-portrait: 8 passed, 4 skipped (the trap and jacket cases, skipped as assigned).
- DONE (one load timeout, re-run): tests/e2e/inspector.spec.ts on both projects (see Commands).

## Protocol additions (all inside E_CUE3; PROTOCOL_VERSION 3, ENT_STRIDE 15, bands unchanged)

| Name | Value | Set when (snapshot.ts cue3Of) |
|---|---|---|
| CUE3_HANDLING_QUARTER_SHIFT / _MASK | 13 / 3<<13 | with CUE3_HANDLING only: min(3, max(0, ⌈4 × handlingProgress / handlingNeed⌉ − 1)) (D-0112) |
| CUE3_HOLD_CLOSING | 1<<15 | with CUE3_HELD only: the holding trap's trapTimer ≤ 1 s (HOLD_CLOSING_SECONDS) |
| CUE3_GLOWER | 1<<16 | Profile.glow !== null (native SIGNAL_GLOW or a recorded E02) |
| jacket band | unchanged bits | now from handling.ts jacketCoverage (0 at B ≤ 0; the wave 11 literal gave 1 there; unreachable for a living organism) |

Every value is below 2^24 (exact in Float32; cue3-org.test.ts). EntityInspect gains optional `trap`, `heldBy`, `handling`, `beingHandled`, `mode`, `jacket`, `signal`, `secretion`, `rival`; `diet.sugarSources.inLight` is present only when non-empty.

Proof that a v1.0 dish packs and inspects as before:
- tests/worker/protocol3-v1-equivalence.test.ts (the protocol 2 golden) passes unchanged.
- cue3-org.test.ts: FIRST_DISH_V1 packs E_CUE3 0 for every organism over 300 ticks.
- inspect-p5.test.ts: no v1.0 organism gains any new key; sugarSources keys are `makers, enzyme`; phase5Lines is `{}`.
- A one-off byte comparison against HEAD: a `git archive HEAD src content tsconfig.json` copy (tmp/org-ui/head) and the current code each loaded the same saves and built every organism's inspector payload and 198 cell payloads (tmp/org-ui/cmp/dump.ts). All 6 saves were byte-identical: FIRST_DISH_V1 at t600 (281 payloads) and the five rc1 corpus saves (202 + 277 + 683 + 389 + 239 payloads).
- The grit painter: the same v1.0 band set hashes to HEAD's sha256 cabc7fad… (pinned in features-p5.test.ts).

## Mark priority (featureLayers; MAX_UNSELECTED_MARKS 2, a selected organism shows all)

1. trap_loop (CUE3_HELD; frame 0 closing with HOLD_CLOSING, else 1)
2. handling_arc (CUE3_HANDLING; frame = quarter)
3. glow_center (CUE3_GLOWER or CUE3_MOD_E02; frame 1 while CUE3_GLOWING, else 0)
4. mode_half (mode 1 → frame 0 Photo, mode 2 → frame 1 Sugar, none at 0)
5. jacket_rim (CUE3_JACKETED; frame = band)
6. then the v1.0 order unchanged: resting-cycle seam, anchor foot, link pixels, light trail, granule pulse, protein release, reserve pocket, matrix edge, starch notch, shade patch, idle granule, idle notches, idle seam.

Not marks:
- F03's trap is its own `trap` overlay over its mask tile: CUE3 trap 1/2/3 → Open/Holding/Cooldown (features.ts trapPoseFrame).
- The native resters' poses: lifeState 1..3 → `dormant` frame 0..2 (dormantPoseFrame).
- A02/P05 shells are drawn in every body frame (D-0112 note); CUE3_SHELL needs no draw.

## Every new line, its wording and its source field

| Line | Explore | Lab | Source |
|---|---|---|---|
| trap (none) | "No trap built yet." | "No trap built yet: it builds one with at least 50 energy and a body of 1.3 times its starting size." | EntityInspect.trap (traps.ts trapView), constants TRAP_ARM_* |
| trap (armed) | "Trap set." | "Trap set." + "Trap store 0.20 C, 0.02 N." | trap.state, reserveC/N |
| trap (holding) | "Holding a Siltworm." | "Holding a Siltworm: 3.2 of 8 s." (+ store) | trap.target, heldSeconds, holdSeconds |
| trap (cooldown) | "Trap resetting." | "Trap resetting: 12 s left." (+ store) | trap.cooldownLeft |
| HELD_IN_TRAP (proposed Lab) | "Caught in a trap." | "Held by Traplace #12: 3.2 of 8 s; drained 0.030 C in the last second." | heldBy (heldView; drained = the owner's intakeLastSecond, the measured drain) |
| division blocker | "Can't split right now." (item) | "Can't split while caught in a trap." | divisionBlockers DIV_BLOCK_STATE + heldBy |
| PRED_HANDLING_IN_PROGRESS (proposed Lab) | "Holding on to its prey." | "Holding on: 0.6 of 1.0 s of contact (resets if contact breaks)." | handling (handlingProgress / handlingNeed) |
| CAPTURED_HANDLING (proposed Lab) | "Being caught." | "Being caught by Needlejaw #7: 0.6 of 1.0 s of contact (resets if contact breaks)." | beingHandled (derived from each handler's valid preySlot/preyBirthId) |
| MODE_PHOTO | "Making food from light." | "Making food from light (light 0.42). It turns to sugar at light 0.25 or less." | mode.mode, mode.light; MODE_SUGAR_LIGHT |
| MODE_SUGAR | "Eating sugar in the dark." | "Eating sugar while the light is low (light 0.18). It makes food from light again at light 0.35 or more." | mode; MODE_PHOTO_LIGHT |
| mode 0 | "Chooses its feeding mode at its first step." | "… (light 0.42 here)." | mode.mode 0 |
| jacket | "Mineral jacket 50 % built." / "No mineral jacket built yet." | "Mineral jacket 50 % (0.20 of 0.40); moves at 0.90 speed." | jacket (jacketView) |
| E11 card | "Building its jacket right now." when active | (same card) | moduleView.ts moduleActiveNow E11 → jacketBuiltNow |
| E02 card (was the generic default) | "Signalling or glowing right now." | numbers from the recorded params | moduleActiveNow E02 |
| NEIGHBORS_DETECTED | "It senses neighbors." (sensed ≥ threshold) / "Little signal from neighbors here." | "Signal 0.34 (threshold 0.30)." | signal.sensed (sensedSignal), signal.onThreshold |
| glow | "Glowing." / "Not glowing." | "Glowing: it stops after 5 s at 0.15 or less." / "Not glowing: it starts after 5 s at 0.30 or more." | signal.glowing, dwellSeconds, thresholds |
| secretion | "Making enzyme." / "Making glow signal." / "Releasing rivalry chemical."; refusals "Too tired to make glow signal.", "Enough glow signal here already.", "Too tired to release rivalry chemical.", "Enough rivalry chemical here already.", "No rival nearby." | same | secretion {code, bits, refusalOf} |
| RIVAL_EXPOSURE | "Rivalry chemical here is hurting it." | "Rivalry chemical 0.40 here adds 0.10 to its exposure. In all: growth × 0.91, −0.80 health/s." | rival (exposureBreakdown + suitability inhibitorExposure) |
| cell rival line | "Rivalry chemical: 0.40 here: exposure 0.10 for Sprinters and Brinecoils. Other organisms are not affected." | same | CellInspect.exposure.rival |
| action chip | "Caught in a trap", "Holding on to its prey"; a Photo-mode A04 is "Making food", never "Eating" | | heldBy, handling, mode |
| lead constraint order | ENERGY_ZERO, then HELD_IN_TRAP, then CAPTURED_HANDLING, then the recorded limit | | leadConstraint |

## UX §7.4 "As built" cells (for the lead; docs/UX_SPEC.md is not mine)

- **handling arc**: "static ring with progress ticks": the recorded quarter still in both modes. `src/render/features.ts: featureLayers`; `src/worker/snapshot.ts: cue3Of, handlingQuarter`
- **trap loop**: the holding frame only; with motion on, the closing frame shows only in a committed hold's first second, from the recorded trap timer. `src/render/features.ts: trapLoopFrame, featureLayers`; `src/worker/snapshot.ts: cue3Of, HOLD_CLOSING_SECONDS`
- **glow halo**: static bright center: the glow frame while glowing, the dim frame otherwise, no pulse in either mode. `src/render/features.ts: featureLayers`
- Suggested addition to **unfolding (wake)**: `src/render/features.ts: dormantPoseFrame, trapPoseFrame`.

tests/render/reduced-motion.test.ts has the three rows with motion on and off.

## Field names chosen

- rival: "Rivalry chemical"
- sGlow: "Glow signal"
- quencher: "Quencher"

These live in src/ui/strings/fields.ts FIELD_NAMES and are used by the cell inspector (CELL_FIELD_NAMES), the region reading (MEAN_NAMES / poolLabel) and the entity lines. The gate sheet already used the same words in lower case. M08 keeps its product name "Rivalry extract" only where the material is meant.

The overlay picker offers none of the three; inspector-p5 asserts that any future entry uses the same name.

## PROPOSED DECISIONS

1. **The handling quarter** is two bits at shift 13 inside E_CUE3, packed only while CUE3_HANDLING is set. There is no stride or version change, so the arc shows on every handler on screen. (As assigned.)
2. **The trap loop's closing frame comes from the recorded hold, not a wall-clock visual event.** CUE3_HOLD_CLOSING (1<<15) is set while the holding trap's trapTimer ≤ 1 s, which is the first second after the committed capture (D-0124). The assignment proposed a 'trapHold' visual event plus a 1 s renderer timer instead. Reasons for the change:
   - A mark is then a state still: it never changes while the dish is paused, and the wall-clock version would flip to "holding" 1 s after the event even while paused.
   - A reload mid-second shows the same frame.
   - D-0112 calls trap_loop a mark "keyed to recorded columns".
   - Adding 'trapHold' to the VisualEvent union would have forced an edit to src/ui/feed.ts, whose `describe` switch is exhaustive and which I do not own.

   Only a committed capture sets the timer, and the mutant that sets the bit for every held organism fails cue3-org. Reduced motion shows "holding" only.
3. **CUE3_GLOWER (1<<16)** marks an organism with glow rules. The renderer has no per-species ability data: DishInfo carries no abilities, and the atlas manifest has no NATIVE_MARKS table. So glow_center's dim frame on a native B09 is keyed to this worker bit, taken from Profile.glow. mode_half needs no species data, because mode bits are non-zero only for mixotrophs.
4. **Proposed Lab wording** for HELD_IN_TRAP, CAPTURED_HANDLING and PRED_HANDLING_IN_PROGRESS is in the table above (owner review at the gate, D-0124).
5. **Field names** (above): the field's own name everywhere. The material keeps its product name only where the material is meant.
6. **Two optional EntityInspect fields beyond the assignment's list:**
   - `rival`: RIVAL_EXPOSURE is only a suitability reason (suitFactors.reason) and is never displayed, so the entity needs the amount and exposure to state it.
   - `secretion` {code, bits, refusalOf}: EntityInspect carried no secretionCode. `refusalOf` names the last emitter in STAGE8_ACTIONS order, whose refusal secretionCode holds.

   Both are present only for Phase 5 emitters and RIVAL targets, so they are absent in v1.0 dishes.
7. **The experiments' secretion share.** An Active starch producer counts SECRETING only with PRODUCER_BIT.starch. When another emitter's success hid the starch refusal, it counts under NONE. All tests/experiments goldens are unchanged.
8. **exposure.rival** is kept when a dish records rivalry but no inhibitor field (the D-0120 carry-over). The cell inspector shows the rival line separately and keeps the generic field list free of a duplicate "Rivalry chemical".
9. **A handler mid-attempt** reports predation code PRED_HANDLING_IN_PROGRESS. It used to read PRED_OUT_OF_CONTACT, "Chasing food.", while holding its prey; handlingNeed is always 0 in v1.0.
10. **V02's glyph polish** moves to P5.8, because sprites are not this task's.
11. **The overlay picker** gains no rival/sGlow/quencher overlay now. Offering them at the organism flip, with the FIELD_NAMES, is the lead's call.

## Files

Created:
- src/ui/inspector/OrganismLines.tsx
- src/ui/strings/organisms.ts
- src/ui/strings/fields.ts
- tests/worker/cue3-org.test.ts
- tests/worker/inspect-p5.test.ts
- tests/render/features-p5.test.ts
- tests/ui/inspector-p5.test.ts
- tests/e2e/organismFixture.ts
- tests/e2e/organisms-p5.spec.ts
- this report

Changed:
- art/src/layers/modules.ts (the FEATURE_LAYERS move only; no pixel, palette or frame change)
- src/worker/protocol.ts and src/worker/snapshot.ts
- src/render/features.ts, src/render/layers.ts, src/render/renderer.ts
- src/ui/panels/Inspector.tsx (CELL_FIELD_NAMES is now exported for the test)
- src/ui/strings/reasons.ts, modules.ts, shortcuts.ts, observe.ts
- src/sim/experiments.ts and src/sim/moduleView.ts
- tests/sim/module-visuals.test.ts, tests/content/art-p5.test.ts, tests/content/art-p5-large.test.ts, tests/render/reduced-motion.test.ts and tests/worker/protocol3.test.ts (re-pins with reasons)

Outside my list: **tests/ui/probe-charts.test.ts:136**, a one-line re-pin of "Lantern signal" to "Glow signal". This is the field name the assignment changes, and the line carries a comment.

moduleNotes.ts needed no change: moduleNotes(E11) returns {converts: [], eats: []} with a parsed registry.

## What each test proves (each mutant applied by hand, then reverted; tmp/org-ui/mut/mutate.py)

| Mutant | Failing test |
|---|---|
| arc frame from progress alone (no need) | cue3-org "set by hand: the exact ratios…" |
| HOLD_CLOSING on every held organism (no committed hold timing) | cue3-org "a real hold packs HELD \| HOLD_CLOSING for exactly its first second" |
| trap_loop closing frame regardless of HOLD_CLOSING | features-p5 "trap_loop on HELD…", "reduced motion" |
| heldBy written for a non-held organism (the trap owner) | inspect-p5 "a real hold…" |
| beingHandled from a stale preySlot | inspect-p5 "…a stale preySlot (set by hand) lists nothing" |
| jacket band from the target body (B0) instead of current B | cue3-org "on a jacket built in stage 8…" |
| grit glyph painted on a v1.0 band set | features-p5 "a v1.0 band set paints the HEAD pixels" |
| secretion share from secretionCode alone | inspect-p5 "an E02 B06 with no starch…" |
| RIVAL_EXPOSURE back to "A rival colony" | inspector-p5 (ui) RIVAL |
| Photo-mode A04 said "Eating" | inspector-p5 (ui) action chip |
| exposure.rival dropped with no inhibitor lines (the old rule) | inspect-p5 "a B01 in rivalry chemical…" |

What else is covered:
- **features-p5** covers:
  - every mark only from its bits, with its frame;
  - the priority and the cap;
  - the poses;
  - that a v1.0 cue gives identical picks over 4,000 sampled cue words;
  - the incremental grit repaint equal to a full paint;
  - grit contrast ≥ 3:1: the edge on water 6.28 and on gel 6.15, the pale face on sediment 3.70.
- **inspect-p5** checks each field against the columns and readers for:
  - a real trap hold, with T1's DIV_BLOCK_STATE;
  - a real handling attempt, both ends;
  - an A04 in each mode and at mode 0;
  - a stage 8 jacket;
  - a glowing B09, a B13 and an E02 B06;
  - a B01 in rivalry chemical.
- **cue3-org** checks:
  - the quarter on a real attempt (0,0,1,1,1,2,2,3,3);
  - HOLD_CLOSING for exactly 10 ticks;
  - GLOWER;
  - a v1.0 dish packing 0.
- **inspector-p5 (ui)** checks each line's Explore and Lab text, the blocker, the field names across screens, and the forbidden words.

## Commands and results

- `npm run art:build -- --check` → atlas up to date · 1691 frames (136 feature-mark frames) · 1024×2048 · 08fb56e6b439.
- `npx tsx tools/contrast-audit.ts` → exit 0, 0 unexplained.
- `npx vitest run tests/experiments/` → Test Files 17 passed (17), Tests 115 passed (115).
- FENCE `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/determinism-g3.test.ts` → Test Files 10 passed (10), Tests 77 passed (77), 1269 s.
- Unit set `npx vitest run tests/sim/module-visuals.test.ts tests/content/art tests/render/ tests/worker/protocol3.test.ts tests/worker/protocol3-v1-equivalence.test.ts tests/worker/relationships.test.ts tests/worker/relationship-map.test.ts tests/ui/ tests/worker/cue3-org.test.ts tests/worker/inspect-p5.test.ts` → SUITE: Test Files 63 passed (63), Tests 564 passed (564) (final tree).
- `E2E_PORT=4273 E2E_OUTDIR=tmp/dist-org-ui npx playwright test tests/e2e/organisms-p5.spec.ts --project=desktop --project=phone-portrait` → 8 passed, 4 skipped (6.3 m); re-run on the final fixture file (an unused parameter removed): 8 passed, 4 skipped (2.9 m).
- `… tests/e2e/inspector.spec.ts --project=desktop --project=phone-portrait` → 7 passed, 1 failed. The failure was a desktop timeout (180 s) in "taps around the dish edge", while the fence was running (load 6-7 on 2 CPUs). The test taps outside the dish, touches no Phase 5 code, and passed on phone. It was re-run alone on desktop: E2E3: 1 passed (2.6 m).
- `npx eslint <28 changed files>` → clean. `npx tsc --noEmit` → clean (final tree).

## FENCE notes

Unchanged (10 files / 77 tests). This task changes no simulation rule. Its `src/sim` edits are reads used only by the inspector and experiment samples: experiments.ts (the share, which no measure consumes; the goldens are unchanged) and moduleView.ts (an inspector read).

## NEEDS

1. **tools/contrast-audit.ts** (not mine): add the grit rows.
   - Required: `grit speck corner` (DISH_COLORS.gritEdge) on water 6.28 and gel 6.15; `grit speck face` (gritPale) on sediment 3.70.
   - Informative: gritPale on water 1.09 and gel 1.12; gritEdge on sediment 1.86.
   - Each speck is two-tone, so every substrate has a ≥ 3:1 part.
2. **docs/UX_SPEC.md §7.4**: the three "As built" cells above (lead).
3. None other. tools/relationship-matrix.ts:78 (relmatrix) briefly failed tsc during this wave; it was clean on the final run.

## Bugs noticed elsewhere

- RIVAL_EXPOSURE and INHIBITOR_EXPOSURE, when they are only the suitability reason (EntityInspect.suitFactors.reason), are shown nowhere in the inspector. The new `rival` line covers RIVAL. The inhibitor case is pre-existing and was left alone.
- strings/modules.ts had no E02 card: it fell to "A supplementary ability.". Fixed here.
