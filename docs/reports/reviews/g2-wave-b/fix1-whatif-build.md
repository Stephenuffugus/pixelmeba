# Report: What if? sheet (P2.6 UI), wave B fix

All eight items are fixed. Items 4, 7 and 8 each still need one change in a file I do not own (see "Changes needed in files I don't own"). The 11 new behavioural tests (8 unit, 3 worker) fail on the old code and pass on the new. To prove that, I ran them against a `git archive HEAD` copy in my scratchpad. The new e2e test fails on the old build at each of its four checks. The full What if? e2e spec passes 12/12 on all three projects. I committed nothing.

## Per item

**1. Custom dishes (MAJOR): FIXED.**
- `host.build()` now records what it applied in the world's provenance as `overrides: {seed?, mutationPreset?, founderMode?, empty?}`. `{}` means the recipe as authored. The field is additive; it is not in `stateHash`, so no hash changes.
- `whatIfInfo` offers ideas only for a variant dish, or for a dish that is the authored recipe. That means the same recipe id and revision, the recipe's seed, no seed/mode/founder overrides, and not empty.
- Old saves without the field count as authored only when the seed, `mutationPreset` and `founderMode` all match the recipe. A malformed record never counts.
- Proof, `tests/worker/whatif.test.ts`:
  - "a custom New Dish … gets no ideas": the verifier's repro, then each override on its own, then a round trip through export and import.
  - "the authored recipe itself … gets the ideas": the positive case, including a New Dish with exactly the recipe's settings (same hash).
  - "an older save without recorded overrides …": the old-save test through `importDish`/`loadSaveFile`.
- e2e proof: Empty Water Garden → More shows no What if? item.

**2. The "unchanged" claim: FIXED.**
- `atRecordedStart` is replaced by the async `rebuildsExactly`. A dish counts as unchanged only when it is at tick 0 with its recorded start hash and the record matches this build: variant revision and source id/revision, contentHash/contentVersion, simulation and evolution-rules versions, and both sha256 checksums. The tick and hash check runs after the await, so a step taken meanwhile is seen.
- Tests:
  - The verifier's revised-R-G3 repro: the plan is Slot 1, `atStart` is false, and starting R-G1 writes the dish to slot1 and autosave with its exact hash.
  - A contentHash-only update: Again still starts (D-0021) and the dish is saved.
  - On this build, an untouched variant dish is still unchanged and nothing is written.

**3. Contrast: FIXED.**
- Amount changes are now opaque fills on a light-to-dark amber ramp, from `#A86C14` (3.41:1) to `#4E2E06` (9.56:1). Darker means more. The After caption also says it in words ("After: less sugar").
- An amount of 0 draws a dashed outline instead of a pale fill.
- The legend shows both ends of the ramp.
- Test, `tests/worker/whatif-ui.test.ts`: it renders `WhatIfPreview` for every choice, walks every fill and stroke with its opacity blended in, and requires ≥ 3:1 against `#D6E7E5`. On the old code it fails with exactly the verifier's 2.31.

**4. Registry row: FIXED, with a type caveat.**
- `choiceDetails` now has the same "Evolution: … · … founders" and "Registry" rows as `provenanceDetails`.
- The label comes from the worker as `answer.registryLabel`, computed by the same rule as `DishInfo.manifestLabel`. A worker test asserts the two are equal.
- Because I don't own `protocol.ts`, the field is typed only through the intersection `WhatIfAnswerView` in `WhatIfState.tsx`.
- Tests: a worker test (label equals `manifestLabel`) and a unit test (rows equal the provenance rows).

**5. Focus return: FIXED.**
- `openWhatIf` records the focused opener. On close, focus goes back to it; if it is gone, focus goes to the dish's More button.
- In the modal cleanup, the inert marks are removed before focus moves (an inert element cannot take focus).
- e2e: after Escape and after Close, `more` is focused.

**6. Blocking modal: FIXED.**
- Everything outside the modal (the siblings of each ancestor) is set `inert` while the sheet is open, and restored on close.
- A press on the backdrop is `preventDefault`ed, so focus stays in the sheet.
- A capture-phase window listener stops keys that start outside the sheet: Escape closes, Tab or Space return focus to the heading.
- `DishScreen`'s key handler now returns at once while `whatIfOpen` is set.
- e2e (200 % text, all projects): a paused dish, a backdrop click, then Space, '.' ×12, 'u' and '4'. The dish stays at "Run" and 0:00. The run toggle cannot take focus, and axe is clean with the modal open.

**7. Variant in SaveMeta: FIXED in the save file.**
- `buildSaveFile` always derives `meta.variant` `{variantId, variantRevision, title, sourceId, sourceRevision, seed}` from the world's record and ignores any value the caller passes. Stripped exports keep it.
- New `saveMetaVariant(meta)` reads it back and treats a malformed entry as absent.
- Test: exports (plain and stripped) and slot saves carry it; other dishes do not; a file with it removed still loads.
- Not done: showing it in the Saved dishes list needs changes elsewhere (see below).

**8. Error toast: FIXED for the reported case.**
- New `errorToastText` in `state.ts`: an error not tied to a dish (`dishId === ''`: load, import, list or delete) reads "Nothing was paused or changed: …". An error tied to a dish keeps "… the dish was paused".
- Tests: unit tests, plus an e2e check that records every toast during a refused import. The old build showed "Something went wrong and the dish was paused: …".
- Remaining: a failed async save, autosave or export on a dish still briefly shows the "paused" wording before the caller's own toast replaces it.

## Changes needed in files I don't own
- `src/worker/protocol.ts`: add `readonly registryLabel: string` to `WhatIfAnswer`, then drop `WhatIfAnswerView`.
- `src/persistence/store.ts`, `SlotSummary` in `protocol.ts`, and `Saves.tsx`: carry `meta.variant` into the slot index and show it in the Saved dishes list.
- `src/worker/client.ts` and the host's `handleAsync` error packet: pass whether the dish was really paused (or the request kind) to `onError`, so a failed async save or export never says "paused".

## Proposed decisions
- PROPOSED DECISION: A New Dish whose seed and settings equal the authored recipe (Standard, Identical, not Empty) is the authored recipe and gets What if? ideas; its start hash is identical. The recorded overrides describe the start, so a later mutation-preset command does not remove the ideas. Older saves without the record are judged by their current seed and settings.
- PROPOSED DECISION: In the What if? preview, an amount is shown as an opaque amber ramp (darker = more) plus a caption naming the direction; an amount of zero is a dashed outline. Opacity is never used for amounts.
- PROPOSED DECISION: `meta.variant` always comes from the world's own variant record, stays in stripped exports (it is recipe identity, not player data), and is a display copy only: the world's provenance is authoritative.
- PROPOSED DECISION: Clicking the What if? backdrop does not close the sheet; only Close or Escape do.

## Files changed
- Owned: `/workspaces/pixelmeba/src/ui/panels/WhatIfSheet.tsx`, `/workspaces/pixelmeba/src/ui/panels/WhatIfState.tsx`, `/workspaces/pixelmeba/src/ui/panels/WhatIfPreview.tsx`, `/workspaces/pixelmeba/src/ui/strings/whatif.ts`, `/workspaces/pixelmeba/tests/worker/whatif.test.ts` (8 tests added, none changed), `/workspaces/pixelmeba/tests/worker/whatif-ui.test.ts` (new), `/workspaces/pixelmeba/tests/e2e/whatif.spec.ts` (1 test added, none changed).
- Shared, minimal edits:
  - `/workspaces/pixelmeba/src/worker/host.ts`: an import line; in `build()`, the provenance entry plus a new `recipeProvenance` helper; `whatIfInfo` and `isAuthoredRecipe`; `rebuildsExactly` and `recordMatchesBuild` replacing `atRecordedStart`; `registryLabel` in `whatIfAnswer`.
  - `/workspaces/pixelmeba/src/sim/recipes.ts`: the `RecipeOverridesRecord` and `RecipeWorldProvenance` types and the `recipeOverridesOf` reader.
  - `/workspaces/pixelmeba/src/persistence/saveFile.ts`: `SaveMetaVariant`, `saveMetaVariant`, and the meta in `buildSaveFile`.
  - `/workspaces/pixelmeba/src/ui/views/DishScreen.tsx`: the key guard and one import.
  - `/workspaces/pixelmeba/src/ui/state.ts`: `errorToastText` and the `onError` line.
- Not touched: `MoreSheet.tsx`, `Play.tsx`, content. There were no content changes, so no content validation was needed.

## Commands and results
- `npx vitest run tests/worker/whatif.test.ts tests/worker/whatif-ui.test.ts` → 2 files, 28 passed.
- `npx vitest run tests/worker tests/persistence tests/recipes/variants.test.ts tests/sim/view-switch.test.ts` → 10 files, 106 passed.
- Old-code check (HEAD snapshot in my scratchpad, new tests copied in):
  - Unit and worker tests: 13 failed. Two of them (the toast wording pair) fail only because `errorToastText` does not exist on HEAD.
  - e2e on the old build: the backdrop + Space run started the dish ("Pause"), More was not focused, the toast said "dish was paused", and More showed What if? on the Empty dish.
- `E2E_PORT=4183 E2E_OUTDIR=tmp/dist-whatif npx playwright test tests/e2e/whatif.spec.ts --project=phone-portrait --project=desktop --project=phone-landscape` → 12 passed (16.2 min), axe clean, including at 200 % text. After that build I only made `WATER` non-exported again; I re-ran the unit tests, tsc and eslint after that change.
- `npx tsc -p tsconfig.json --noEmit` → clean.
- `npx eslint` on every touched file → clean.
- Prettier was run on owned files only.
- Port 4183 is stopped (`lsof -t -i :4183` shows nothing).