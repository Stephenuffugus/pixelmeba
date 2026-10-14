# g5 wave 12: verify 2 (structures-art-audio)

Verifier: adversarial wave verifier 2, on the uncommitted working tree after 0316ffc. I read only, and wrote nothing except this file. Scratch files are in `tmp/verify-g5-wave-12-1/`.

**Verdict: ok = true.** I found no BLOCKER and no MAJOR: three MINOR and two NIT.

## Problems, most severe first

- **MINOR [structures-art-audio] `src/render/structureLayer.ts:124` (the S02 case), `:68` (MIN_MARK_PX), and the module header.** Item 2 says the glyphs must be "readable at every zoom preset: S01 short dots, S02 longer slots". This fails at the whole-dish preset on a phone, where S01 and S02 can no longer be told apart. The header claim "no straight mark is shorter than MIN_MARK_PX (1.5) screen pixels" is also false below 2.75 px per cell. The two glyphs share one colour (edgeMembrane and edgeSieve are both #172C35), so the pattern is the only thing that tells them apart.
  - On the phone-portrait project (360 px wide), fitZoom is at most 360/124 = 2.90 px per cell, and the zoom can go down to 0.9 × fit ≈ 2.6. Measured with `tmp/verify-g5-wave-12-1/mut/coarse.ts`:

    | px per cell | S01 dot | S01 gap | S02 slot | S02 gap |
    |---|---|---|---|---|
    | 3 | 1.50 px | 1.50 px | 1.75 px | 1.25 px |
    | 2.5 | 1.50 px | – | 1.25 px | – |

  - At 3 px per cell the two patterns are practically identical. At 2.5 px per cell the S02 slot is shorter than the S01 dot, which inverts the pattern, and it is under MIN_MARK_PX.
  - `tests/render/structure-layers.test.ts:114` sweeps zooms only from 3 up, and `one(S02) > one(S01)` passes with a 0.25 px margin.
  - Fix: in the coarse band, keep the S02 slot at least max(MIN_MARK_PX, 2 × the S01 dot) and let S01 drop to a 1 px pitch dot, or draw S02 as a bar with a single notch. Extend the test sweep to fitZoom × 0.9 on a 360 px viewport.
- **MINOR [lead] `src/ui/views/LabView.tsx:386` with `src/ui/panels/GateSheet.tsx:65` (shutterCue).** An accepted shutter Open / Close plays two cues at once. `sendLabCommand` calls `placementCue(1)`, which plays **drop** at −10 dB, and then `shutterCue` plays **gate_click** at −20 dB. The louder placement sound masks the soft click, so in practice item 7(b) cannot be heard. The shutter is not a placement, and the haptic also fires.
  - `tests/audio/gate-click.test.ts:45` mocks `placementCue` and asserts only `h.played`, so the double cue is hidden. In the accepted case `h.placements` would be `[1]`.
  - The builder disclosed this. LabView.tsx is outside the task's ownership.
  - Fix (LabView owner): skip `placementCue` for an accepted `setDevice` on an S03, and keep placement_error on refusal.
- **MINOR [lead] `tools/contrast-audit.ts:651-665`.** The task gave JUSTIFIED entries to 44 failures that were already unexplained in HEAD, and the audit now exits 0.
  - I confirmed the baseline: HEAD's own copy of the audit, run against this tree, gives "364 pairs … 44 unexplained" and exit 1 (`tmp/verify-g5-wave-12-1/head-audit.log`).
  - The justifications follow the Phase 3 precedents: identity tones as Y01, V02 as V01, and warmth as diverging like pH.
  - Two caveats:
    - The F04 Sporeveil silhouette on sediment (2.30:1) is a real legibility gap. It is now parked as JUSTIFIED, with a proposal to the organism-art owner (outline sporeveilRing #23272B).
    - The blanket `${id}/` prefixes are matched with `includes`, so they will also silently justify any future regression for those 18 species on any substrate.
  - The lead should log the F04 gap as an owner-visible follow-up and not treat it as closed.
- **NIT [structures-art-audio] `src/render/gateBadges.ts:54`.** On an open S03, the Fixed pip is 'pass' (filled), because `edgePermits` is true. The tracer (`tracerCrosses('fixed')` returns false) and the table ("Stays put") both say fixed things never move. The world badge has no words, so it reads as "Fixed passes".
  - Possible fix: mark Fixed 'blocked' or 'pass' consistently with the tracer and record the choice, or note it in the PROPOSED DECISIONS.
- **NIT [structures-art-audio] `src/render/renderer.ts:437`.** badgesG sits right above deviceParticles, as the assignment specified. It is therefore under filmParticles, depositSprite, objectParticles, overlaySprite and aggSprite. With an overlay on, or under film, the selected gate's badge ("at every zoom while its sheet is open") can be covered. This follows the spec, so it is noted only. The lead may want the selected badge in the selection band (UX §7.3 "selection").

## Verified OK

- **Atlas frame proof (my own script, `tmp/verify-g5-wave-12-1/cmp.cjs`, comparing HEAD's `public/atlas` pixel by pixel and the metadata): 1678 same / 0 differing / 0 missing.**
  - Of the device frames, 6 of 13 differ (s05, s07, s08_0 to s08_3).
  - The sprites table, the features table and every `tiles.*` entry are equal.
  - The atlas is 1024×2048 with 1691 frames.
  - exportHash: 393e81b629bc… → 08fb56e6b439….
  - `npm run art:build -- --check` reports "atlas up to date · 1691 frames … 1024×2048 · 08fb56e6b439".
- **The seven unit test files** (gate-badges, structure-silhouettes, structure-icons, material-swatches, gate-click, wake-native, structure-layers): 7 files, 46 tests passed.
- **The named suites** (`tests/content tests/render tests/audio tests/ui/{a11y-contrast,a11y-describe,a11y-focus,gate-table,structure-words,structure-icons,material-swatches}`): Test Files 43 passed (43), Tests 819 passed (819).
- **Typecheck and lint.** `npx tsc -p tsconfig.json --noEmit` exits 0. `npx eslint` on all 18 changed or new files of this task exits 0.
- **FENCE** (g2-replay, rc1-replay, trajectory-fence\*, conservation-closed-lid), run in the background with an until-loop against the full working tree, e2 and e3 sim edits included: Test Files 8 passed (8), Tests 64 passed (64), 887 s, exit 0. This task changes no simulation code.
- **The tests are not vacuous.** Three load-time mutants, run under `tmp/verify-g5-wave-12-1/mut/` with no tracked file edited:
  - badgeFor with S02 passing Medium → 3 failures ("2 medium: expected 'pass' to be 'blocked'");
  - wake coalescing set to 0 → "expected 4 to be 1";
  - s09_on replaced by s09_off (colour only) → 2 failures ("s09_off/s09_on: expected 0 to be ≥ 6").
- **The contrast audit exits 0:** 386 pairs, 320 required, 195 pass, 125 justified, 0 unexplained. A scratch regeneration is byte-identical to `docs/reports/contrast.md`.
  - The new rows read DISH_COLORS, P and the CSS tokens, and restate no colour.
  - Results: edges 11.33 / 11.09 / 3.35 (channel 11.42 / 11.18 / 3.38); badge pip the same as the edges; device outline 12.12 / 11.86 / 3.59; halo on sediment 3.92 opaque; pip on plate 13.16; gate-sheet pip on `--surface` 13.16.
- **badgeFor has no table of its own.** It reads `edgeFactor` and `edgePermits` from barriers.ts, and `tracerCrosses` for S04.
  - It matches CT §5.3: S01 is Dissolved and Activity 25 % (partial) and Viral blocked; S02 is the fields at 50 % (partial) with Small passing; a closed shutter blocks all; an open one passes all.
  - S04 has dissolved, viral and Small one-way and the rest blocked (D-0106).
  - The class order equals GATE_FIELD_ROWS + GATE_ORGANISM_ROWS, so GateSheet's index mapping of pips to rows is safe.
- **runsOf** handles gaps, L shapes, alternating codes, a flow change and row wrap. The midpoints are on the line.
- **worldBadges** shows run badges only at ≥ 12 px per cell, plus the selected gate's badge at every zoom, never drawn twice.
  - It is static: the renderer redraws it on a geometry or selection change, a band change, or a zoom move above 25 %, and never per tick.
  - The source imports no rng, audio or Pixi, and uses no Math.random or Date.
- **Tracer and selection.** `setSelectedGate` runs from a GateSheet effect, running or paused, and is cleared in `back()` and on unmount. The tracer is still paused-only: `tracerDrawList` is unchanged. gateTracer.ts, renderer.ts and gateBadges.ts reference no audio.
- **gate_click.** It is appended last to `CueId` and `CUE_IDS`. It is a UI cue (not in WORLD_CUES, no coalescing).
  - Patch: band-passed noise at 3200 Hz, Q 4; attack 2 ms, 45 ms in all; −20 dB, which is select's −16 minus 4.
  - The patches.ts header and the cues.ts visible-equivalent list are updated.
  - The open cue is keyed per open event through `playCueFor`, so a remount does not replay it. Nothing else plays select or another cue on "Show gate".
  - SoundKit supports a noise source through a band-pass.
- **Wake coalescing for native resters.** Six B12, F04 and P08 wakes in one tick give 6 events, `visualEvents` passes them, and the cue counts are `{division 0, wake 6}`. The limiter plays one cue in the 1000 ms window and plays again at 1.5 s. A B12 wake is not silenced.
- **Device art.**
  - The 13 names and their order are unchanged.
  - s05 is an arch with dark pores and an open doorway; s07 is an open cup.
  - The S08 quartiles darken and their fill line rises (rows none, 10, 8, 6).
  - s11 is at least 80 % transparent inside. The on frames differ from the off frames in alpha.
  - Every frame has a deviceInk outline.
- **Icons.** All 12 are 24 px, use `currentColor` only and are distinct (unit test), and the e2e checks the accessible name with `toHaveAccessibleName`.
- **Swatches.** The five new swatches are colour plus pattern, taken from palette.ts lantern\*, rampart\* and glasswheel\* (B09, B13 and A02 tones).
- **Ownership and scope.** The task changed only files it owns. It made no edit to src/sim, src/worker, content, the manifest, the protocol or the schema, and LabTray.tsx and strings/lab.ts are untouched. The drawEdges hunk in renderer.ts is the zoom pass that item 2 requires; the builder disclosed it.
  - No stateHash literal and no RNG use was added.
- **Region pins.** Deferring them to wave 14 is consistent with "Every visible feature maps to real state", because no habitat region exists before p5.4a.
- **The e2e spec** (`tests/e2e/structures-art.spec.ts`) asserts:
  - the 12 Build items with an svg each and their accessible names;
  - S02 and closed S03 pips beside the table words, and the shutter toggling;
  - reduced motion;
  - axe, horizontal overflow and 48 px targets.

  I did not re-run the browser, because I suspected no DOM problem. The builder reports 10 passed on desktop and phone-portrait.
