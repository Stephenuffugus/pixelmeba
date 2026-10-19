# Wave g5-wave-15 · adversarial verify 2 · p5-polish and prompts-succession

Verifier: wave-verify-2 (lens: rules, determinism, conservation, tests, player-facing truth). Base db1c943 plus the
uncommitted tree of the four wave 15 builders. No repository file was edited apart from this report. Scratch files
are in tmp/verify-g5-wave-15-1/.

Verdict: **ok = false**. There are two MAJOR findings in prompts-succession. Both were reproduced against the
code in the tree, and both are honest-label or notebook-loss defects. p5-polish has no BLOCKER or MAJOR finding.

## Problems (most severe first)

1. **MAJOR [prompts-succession]** `src/persistence/notebookGoals.ts:209` with `src/sim/objectives.ts:735` — **the whole notebook is dropped on reload.**
   - Trigger: a cycle-window prompt (NIGHT_GARDEN) is running when the player switches the dish to fixed light, then the dish is saved and loaded.
   - Cause: `setLightMode` is an ordinary player command (`structureEdits.ts:240`, `climate.ts:517`). After it, `goalWorldRefsOf` reports `cycle: false`, and `goalsWorldProblem` refuses the running goal with "this dish has no light cycle". Under D-0073 that drops the entire notebook: favorites, story cards, goals, bookmarks, gallery, challenges and succession.
   - Repro: `tmp/verify-g5-wave-15-1/lightgoal/light.test.ts` (DishHost).
     - Create an H08 dish (`{ empty: true, habitatId: 'H08_NIGHT_LANTERNS' }`); its catalog offers NIGHT_GARDEN. Start the goal and run to 100.
     - Send `{ kind: 'setLightMode', mode: 'fixed' }`; it is accepted. Run to 200.
     - saveSlot then loadSlot. The 'loaded' message carries "This dish's notebook (…) could not be read, so it was left out", and the goals go from 1 to 0.
   - Second symptom: within the session, `evaluateClauses` (`objectives.ts:1194`) returns false forever while the light is fixed. The attempt silently runs for ever instead of ending.
   - Fix direction: end the attempt (endReason 'zero', or a new reason) when the cycle disappears; or validate a running cycle-window goal without refusing the record.

2. **MAJOR [prompts-succession]** `src/worker/succession.ts:145` and `:327`, with `src/persistence/notebookSuccession.ts:44` — **"first seen" lines are not true after a reload.**
   - "First seen" is computed only from the entries the record still holds (`feedingKeysOf`).
   - SUCCESSION_MAX = 40 removes the oldest entry from minute 41 on. The 12-line cap (`lines.slice`) can also drop links that were added to the in-session `seen` set but never stored.
   - After a reload, either case re-announces links as "first seen" ("Crumbsmiths were first seen consuming sugar", "… were first seen catching …"), which is false. This breaks the honest-labels non-negotiable and the assignment's own rule (item 4b: "so a reload never repeats one").
   - Repro: `tmp/verify-g5-wave-15-1/succ/repeat.test.ts`, on an H04 Suggested Community dish.
     - Minute 1 records `pool:B06:sugar`, `pool:F02:sugar`, `prey:P01:B08`.
     - The test first checks with the real `addSuccessionEntry` that minute 1 is gone at the 41st entry.
     - It then drops minute 1 from the record, as SUCCESSION_MAX does, and rebinds a new detector, as a load does.
     - Minute 3 writes `pool:B06:sugar` and `pool:F02:sugar` again as newFeeding.
   - The builder disclosed this as "Known limits" (PD 10), but it is a visible false claim in ordinary play (any dish reloaded after 40 minutes of dish time).
   - Fix direction: keep the seen-link keys in the record, outside the capped entries (small and bounded: species × pools plus predator × prey), and count a line cut by the 12-line cap as not seen.

3. **MINOR [prompts-succession]** `src/ui/views/NotebookSuccession.tsx:17` — **Look back does not open the minute.**
   - Build item 5 asks for Look back to open History "What happened" at that minute. It sets `sheet = 'history'`, which opens the Charts tab, with no time focus.
   - The builder reported it as NEEDS (`HistorySheet.tsx` is not theirs), so it is honest, but the item is not complete.

4. **MINOR [prompts-succession]** `src/ui/panels/ChallengeStart.tsx` (NEEDS, as reported) — the start sheet shows a habitat region's id (e.g. CHANNEL) instead of its label. That is a raw id on a player screen.

5. **MINOR [prompts-succession / lead]** `content/objectives/NIGHT_GARDEN.json` — **a prompt that cannot complete is offered.**
   - It is offered on H08, but the builder measured that it cannot complete on any shipped dish (no Lantern ever glows).
   - Offering an unreachable prompt is valid under "evaluated, never enforced", but it needs the lead's call (builder PD 7).
   - The text itself is honest: "See a Lantern start to glow and Sunbeads take in food by light within one light cycle of 240 seconds"; CYCLE_PERIOD_TICKS is 2400.

6. **MINOR [prompts-succession]** `src/worker/succession.ts` `readConversions` — **no performance measurement for the second producer scan.**
   - Each whole second it calls `creditedConversions`: a full 16,384-cell scan for each of 3 enzymes, plus producersNear in every converting cell.
   - The relationship watcher already does the same scan, so a played dish now pays for it twice. No tick cost was measured or reported (CLAUDE.md: "Measure, don't guess").

7. **MINOR [p5-polish]** `tools/contrast-audit.ts:635-645` (identity rows) and `src/ui/views/DishThumb.tsx:39` — **the audit claims more than the build delivers.**
   - The removed justifications covered identity tones in "aggregation at whole-dish zoom on phones; legends; markers". The new "AS BUILT" note says every identity row passes "by its ring or its tone".
   - Only the aggregation layer draws the ring. DishThumb fills `speciesHex` with no ring, and so does the picture legend swatch (`picture.ts:635`).
   - The pale tones (Y01, F01, P01 …) on water are therefore still below 3:1 there, and the audit no longer says so.
   - Fix direction: restore a scoped justification for the thumbnail and the legend swatch, or ring those too.

8. **MINOR [p5-polish]** `src/ui/panels/Inspector.tsx:351` — the Lab INHIBITOR line is "Something here is hurting it: conditions 42 % suitable here.", not UX §5.2's Lab words ("Inhibitor exposure {x}: growth ×{g}, −{d} health/s."). The builder disclosed it as PD 6, with a NEEDS for an EntityInspect field. The Explore line matches UX.

9. **MINOR [p5-polish]** — **the stamp toast lacks the disclosure.** The single-arm stamp toast (`src/ui/state.ts` `stampToastText`, NEEDS as reported) does not end with "Recorded with a test-only override." Item 8c is therefore covered only on the running card and the results screen.

10. **MINOR [lead]** `tests/fixtures/habitats-p5-equivalence.test.ts:37/:44` — **the fence test hides its own value checks.**
    - The FENCE fails 2 of 102 only on this file's key-list assertion: 15 Phase 5 recipes from measures-overrides and cards-curated are new keys.
    - That assertion runs first, so the file no longer checks the 25 golden values at all.
    - I checked them separately (`tmp/verify-g5-wave-15-1/equiv/equiv.test.ts`, restricted to the golden keys):
      - all 25 golden entries are byte-identical with the recorded habitat list;
      - the stateHash300 values are equal as shipped.
    - The lead's fence update should compare only the golden keys, or add the new ones by DECISIONS id.

11. **MINOR [lead]** `tests/helpers/registry.ts` — two builders edited this shared test helper. `PHASE5_EXPERIMENT_RECORDS` (cards-curated and measures-overrides) and `PHASE5_OBJECTIVE_RECORDS` (prompts-succession), plus `narrowsShipped`: any narrowing patch now silently drops the Phase 5 records. The trajectory fence still passes, but this is a non-owned shared edit the lead should accept explicitly.

12. **NIT [p5-polish]** `art/src/sprites/phase5_small.ts:15` — the file header still describes V02 as "round lattice head with short fibres". The sprite is now an open net (rim plus two crossing threads).

13. **NIT [p5-polish]** — layers.ts `paintAggregation` is now dead code (reported by the builder).

## VERIFIED OK

### p5-polish

- **Item 1, grit in the share picture:**
  - Ran `tests/render/picture-grit.test.ts` against HEAD's unmodified picture.ts in scratch (`tmp/verify-g5-wave-15-1/headpic`).
  - The HEAD goldens hold (9b58c25a…, e47198f8…): the 7-band byte-identity test passes against HEAD code.
  - The 3-speck test fails against HEAD, so the test is not vacuous.
  - The cosmetic keys are 29 / 31, distinct from 13 / 17 / 19 / 23, and no simulation randomness is used.
- **Item 2, contrast audit grit rows:**
  - `npx tsx tools/contrast-audit.ts` exits 0: "392 pairs; 323 required, 287 pass, 36 justified failures, 0 unexplained".
  - Grit rows: corner 6.28 / 6.14 required; face on sediment 3.69 required; the others informative.
  - A scratch copy regenerated contrast.md byte-identical to `docs/reports/contrast.md`.
- **Item 3, S01 / S02 at low zoom:**
  - The rule: paired rails below 3.5 px per cell; from 3.5 px, slot ≥ 1.5 × dot and both ≥ MIN_MARK_PX. The header is corrected.
  - A load-time mutant (EDGE_PAIRED_BELOW = 2) fails the sweep: "S02 slot … at 2: expected 0.75 ≥ 1.5".
  - The renderer redraws on a band change via `edgeDetail` (renderer.ts:1113).
- **Item 4, F04 outline:** the outline index is P.sporeveilRing #23272B; F04 on sediment is 3.48:1; the `f04_sporeveil/silhouette/sediment` justification is gone and the audit stays at 0 unexplained.
- **Item 5, V02:**
  - The glyph renders, from my ASCII dump, as an open ring with an X: no spikes, 16 px, glyph 1 and idle 1. It is distinct from V01's head and tail.
  - `npm run art:build -- --check`: "atlas up to date · 1691 frames … 7e9928b96e10".
  - sha256 of organisms.png is 7e9928b96e10fb9fe3a4810e4fa1e216e0300d457865eeb5f703703d1d9050c8, matching the report.
- **Item 6, open S03 Fixed pip:** `worldPipsFor` gives 'notApplicable' only for EDGE_SHUTTER_OPEN; the gate sheet keeps badgeFor 'pass' (PD 4); there are tests.
- **Item 7, INHIBITOR line:** never twice — guarded when limitCode or divisionBlockers also hold INHIBITOR_EXPOSURE — and the Explore words come from reasons.ts.
- **Item 8, test-only disclosure:**
  - `TEST_ONLY_LABEL` is "test‑only override".
  - `worldModesLine` stays RegistryInfo-compatible; `slotModesLine` reads SlotModes.testOnly.
  - Every call site listed uses `modesFlags`; NewDish is untouched.
  - The card block is a `<section>` named by its heading.
- **Item 9, words:** labels for every P5_MEASURE_HEADS head and the region forms (regionNames, "under the roof"); the three steps are worded; none says "because", "superior" and the like.
- **Tests:**
  - p5-polish's unit files, plus gate-badges and structure-layers: 8 files, 55/55.
  - The full tests/render and tests/ui suites with the atlas, art-p5 and art-p5-large files ran inside the 84-file, 767/767 run listed under prompts-succession.
- **Ownership:** no simulation, worker, persistence or content file was touched by p5-polish. The `drawPip` branch in renderer.ts (outside the aggregation-only slice) was disclosed.

### prompts-succession

- **Determinism:**
  - In the src/sim/objectives.ts diff, Map/Set/object-key iteration appears only in validation; there is no `Math.random` or `Date`.
  - The new stage hooks are read-only (measureStage reads intakeAccum and pool totals; SuccessionDetector reads intakeSeen and pools).
  - succession-host's on/off hash and digest test passes.
- **relationships.ts:** `creditedConversions` is a pure extraction; the watcher's behaviour is unchanged (same loop, same note and ledger calls).
- **Offers:** `goalCatalog` uses `world.content.habitat.id` (the recorded habitat), and template objectives are excluded. My H08 repro catalog was KEEP_SPRINTERS_GOING, NIGHT_GARDEN, SEE_SPRINTER_SPLIT, SUSTAIN_THREE_SPECIES and WATCH_STARCH_BECOME_FOOD. The Garden goals on a habitat start were already there before this wave, as the builder noted.
- **Content:** the seven objectives match CT 10.6 and D02 §23.
  - TWO_NEIGHBORHOODS: minCount 6 = "> 5".
  - LEAVE_A_REFUGE: P08's prey list includes F02.
  - RECOVER: budget 3, all seven tool groups, 180 s.
  - Every text says "this attempt" and promises nothing.
  - `content:validate` reports content ok, contentHash eb2fe49e…, 33 recipes, 27 experiments, 1691 frames, and `tests/content/validator.test.ts` passes, so the hash is current.
- **NOTEBOOK_VERSION:** stays 1, as D-0131 rules; the kind is an optional key; `favoritesOnly` does not copy it; NOTEBOOK_DROPPED_TEXT names "succession".
- **Tests (84 files, 767/767):**
  - all of the builder's new files;
  - tests/sim/objectives, tests/content/objectives;
  - goals-host, challenge-host, stories-host, favorites-host, host;
  - notebook, bookmarks (tripwire), validator;
  - all of tests/render and tests/ui.
- **Checks:** `npx tsc -p tsconfig.json --noEmit` exit 0; `npx eslint` on every file both tasks changed or created: exit 0.

### FENCE (the STATE command, run in the background)

- 11 files, 100 passed and 2 failed, both in habitats-p5-equivalence's key list (finding 10).
- g2-replay, rc1-replay, the trajectory-fence files, conservation-closed-lid, determinism and determinism-g3 all pass.
- Golden values unchanged (checked separately).
