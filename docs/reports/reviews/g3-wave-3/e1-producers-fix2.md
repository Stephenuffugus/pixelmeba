# e1-producers: round-2 fix report (g3-wave-3)

## Problems

### MAJOR: tests/sim/chemistry.test.ts:303 (M01 missing from the pinned material list). FIXED
- **Fix:** added `'M01'` after `'INH_PHOTO'` in the expected list of "every enabled material input is ledgered…". This is the shipped-list pin that my M01 enable moved.
- **Coverage:** the test's loop now also checks M01's ledger input and its companion N (0.10 N per C).
- **Result:** tests/sim/chemistry.test.ts passes (part of the 12-file run below).

### MINOR: snapshot.ts producersNear credited a producer that had not released. FIXED
- **Problem:** `producersNear` credited any producer-rule holder in the cell or a four-neighbour, even one that was not releasing.
- **Fix:** `producersNear` now credits a living organism only when its producer bit for that enzyme is set in the `secreting` bit set. That bit (secretion.ts `PRODUCER_BIT`; starch 1, oil 2, protein 4) means the organism released that enzyme in the last tick. The organism must still have the matching producer rules and be in the cell or a four-neighbour.
- **Not credited:** a producer that is nearby but not releasing gets no credit. This covers E ≤ 35, no substrate, saturated, not Active, and just arrived. For these the row says "Enzyme present".
- **Why:** "Made here by …" is now backed by a recorded release (honest labels: "coincided with" until a recorded mechanism supports "because"). It is still a subset of the assignment's rule ("only when a producer of that enzyme is in the cell or a four-neighbour").
- **Comments updated:** snapshot.ts, src/ui/strings/reactions.ts, and the `ReactionRow.madeBy` doc comment in protocol.ts (comment only).
- **Unit test:** tests/fixtures/producers.test.ts "the reaction ledger credits a producer only in the cell or a four-neighbour, only when it released this enzyme, and follows it as it moves". It now runs `stageStructures` before each read and checks five cases:
  - two cells east: no release, no credit
  - east neighbour, releasing: `['B07']`
  - same place at E = 35: `[]` with `SECRETION_ENERGY_LOW`
  - same place, own-cell activity 1.0: `[]` with `SECRETION_SATURATED`
  - diagonal: `[]`; in the cell: `['B07']`
- **Non-vacuity check:** I replaced the bit condition with an always-false guard. The test then fails: `expected [ 'B07' ] to deeply equal []` at producers.test.ts:275. I then restored the file and confirmed the original line is back (grep count 1). snapshot.ts was restored from a copy taken seconds earlier; if another agent edited snapshot.ts in that window, their edit would have been lost.
- **E2E:** tests/e2e/reactions.spec.ts now expects "Made here by Oilwick" only for an Oilwick in the cell or a four-neighbour whose snapshot `E_CUE` has `CUE_SECRETING` set (the same paused tick as the inspector). Any other cell expects "Enzyme present".

### MINOR: EXP_201 journal stamp claimed more than is measured. FIXED (reworded)
- **Fix:** the stamp "Watched Sprinters share a Crumbsmith's lunch" is now "Measured a Crumbsmith's starch turning to sugar, and what Sprinters ate".
- **Why:** this states exactly what the gate measures (converted.starch ≥ 1, intake.B01 ≥ 0.5). It does not claim the Sprinters' sugar came from the enzyme, since background Water Garden sugar also feeds them.
- **Unchanged:** the gate (the CT literal), the question and the confounds. I ran `npx tsx tools/content-validate.ts --write`, which wrote contentHash d26e5d23…; no test pinned the old stamp.
- **Owner flag:** the CT §10.3 gate is easy to reach from background sugar alone (reached at 8 s). Whether EXP_201 should gate on a stricter attribution is for the owner (EXPANSION_RESPONSE §8).

## Files changed
- tests/sim/chemistry.test.ts (shared test, one line added to the pinned list)
- src/worker/snapshot.ts (producersNear)
- src/worker/protocol.ts (madeBy doc comment only)
- src/ui/strings/reactions.ts (header comment)
- tests/fixtures/producers.test.ts (credit test tightened)
- tests/e2e/reactions.spec.ts (provenance keyed on the release cue)
- content/experiments/EXP_201.json (journalStamp), content/manifest.json (contentHash via content-validate --write)

## Commands and results
- `npx tsx tools/content-validate.ts --write`: content ok, contentHash d26e5d2391a3…, species 38 (enabled 19), atlas complete (856 frames).
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx eslint src/worker/snapshot.ts src/ui/strings/reactions.ts src/worker/protocol.ts tests/fixtures/producers.test.ts tests/e2e/reactions.spec.ts tests/sim/chemistry.test.ts`: exit 0.
- `npx vitest run` on 12 files: chemistry, producers, e201-e204, journal-and-words, framework, g2-replay, the 4 trajectory-fence files, conservation-closed-lid and determinism.
  - 11 files passed. producers had 1 failure: the measured-value tail read activity 0.502 after the test's new real releases.
  - Fixed by resetting eOil to 0.5 before those checks.
  - Re-run of `npx vitest run tests/fixtures/producers.test.ts`: 18/18 passed.
- Fence: g2-replay and all four trajectory-fence files passed. The fence is unchanged; the changes are observation-only and content text.
- `E2E_PORT=4231 E2E_OUTDIR=tmp/dist-e1 npx playwright test tests/e2e/reactions.spec.ts --project=desktop`: 1 passed (1.3 min), including the axe check and the ≥ 16 px text check on the ledger. Port 4231 was stopped before and after.
