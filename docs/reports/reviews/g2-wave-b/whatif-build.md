## Report: P2.6 What if? (R1), worker and UI half

P2.6's worker and UI half is built and works. All 14 worker tests pass, and all 9 e2e runs pass (3 tests × phone-portrait, phone-landscape and desktop). The type check and lint are clean. I committed nothing. I ran no content change, so no content validation was needed.

### Files created (owned)
- `/workspaces/pixelmeba/src/ui/strings/whatif.ts` — all the sheet's text. Numbers appear only under Details, and the evolution mode names follow UX §3.3.
- `/workspaces/pixelmeba/src/ui/panels/WhatIfState.tsx` — open/close state and the actions: start, Again, Another idea, export-then-start, replace, cancel, copy. When opened over a dish, the sheet acts as a blocking panel: it pauses the dish and restores its prior speed on close.
- `/workspaces/pixelmeba/src/ui/panels/WhatIfSheet.tsx` — `WhatIfHost` plus the modal sheet (role=dialog, focus trap, Escape closes). It shows:
  - at most 3 choices as radios, each with icon, label and one sentence;
  - a separate Start button;
  - a "This dish" section on a variant dish with Again, Another idea (naming the next idea) and the dish's provenance under Details;
  - the all-slots-used step: export then start, replace a save with confirmation, or Cancel.
- `/workspaces/pixelmeba/src/ui/panels/WhatIfPreview.tsx` — the before/after pixel preview, drawn from the worker's exact old and new cells. For R-G3 the After panel shows a dashed outline at the old patch and a solid new patch; founder start rings and an HTML legend are included.
- `/workspaces/pixelmeba/src/ui/panels/WhatIfIcons.tsx` — the choice icons, plus Again and Another idea.
- `/workspaces/pixelmeba/tests/worker/whatif.test.ts` and `/workspaces/pixelmeba/tests/e2e/whatif.spec.ts`.

### Shared files (additive edits only)
- **`src/worker/protocol.ts`**:
  - new requests `whatIf` (sourceId, aboutDishId) and `whatIfStart` (newDishId, fromDishId, pick, keep);
  - new replies `whatIf`, `whatIfStarted` and `whatIfRefused` (code + readable message);
  - new types for the pick, keep choice, save plan, answer and refusal codes;
  - new optional `DishInfo.variant` and `DishInfo.whatIfSourceId`.
- **`src/worker/host.ts`**:
  - an `ownSlots` map (the "active slot"), set on `saveSlot` and on `loadSlot` of a named slot;
  - new async cases; `whatIfInfo` added to `info()`;
  - the order of a start is fixed: the variant world is built first (a refusal changes nothing), then the current dish is kept, then the new dish opens paused. Its world id is the new dish id and its name is the variant title.
- **`src/worker/client.ts`**: `whatIf()` and `whatIfStart()`. A refusal resolves as `{ok:false}`, so the global "Something went wrong and the dish was paused" toast never fires for an expected refusal.
- **`src/ui/state.ts`**: new `freshDishId()` and `enterStartedDish()`.
- **`Play.tsx`**: a secondary "What if?" link under Garden, plus the host.
- **`DishScreen.tsx`**: one `<WhatIfHost context="dish" />` line.
- **`MoreSheet.tsx`**: a "What if?…" item when `whatIfSourceId` is set.
- **`styles.css`**: `.whatif-*` rules appended. All text is ≥ 16 px and all targets are ≥ 48 px.

### What the tests prove
- **`tests/worker/whatif.test.ts`** — 14 tests, driven through the real `DishHost` with an in-memory store:
  - **Sheet data:** 3 choices in catalog order; identity line "R-G3 / rev 1 / seed 104729"; equal old/new cell counts centred on (48,64) and (48,82); `sha256:` checksums; the save plan.
  - **Start:** the new dish opens paused at tick 0 with its own world id. Its start hash equals the recorded `initialStateHash` and an independent `realizeVariant`. The current dish's hash is untouched and it is kept in slot 1 and the autosave. A dish opened from a slot is kept in its own slot. With no dish open, nothing is written.
  - **Again and Another idea:** Again gives an identical hash under a new world id; an untouched variant dish is not saved again, and a dish that has run is. Another idea gives R-G0 → R-G1 → R-G2 → R-G3 → R-G0 and leaves the dish it came from unchanged. Both are refused on a dish that is not a variant dish.
  - **All ten slots used:** the start is refused, nothing is written, the dish's hash is the same and it resumes its speed. Replace writes only the chosen slot and names the save it replaced. After an export, no named slot is written.
  - **Refusals:** Again on a revised R-G3 (a save imported into a newer build) returns the exact readable message; nothing is started or saved. An unknown idea and a failed write are refused the same way.
  - **Provenance:** a variant dish's export carries its variant record; an imported copy shows it and Again reproduces the start.
- **`tests/e2e/whatif.spec.ts`**:
  1. Garden → What if? → R-G3. The preview shows the Before patch, the dashed outline at the same spot and the solid patch lower down. Details shows the identity line; Copy says "Copied." or "Copying is not available here…". Selecting does not start anything. Start opens a paused dish that stays at 0:00. After running, Again saves to Slot 1 and restarts. Another idea opens "Garden". Saved dishes shows Slot 1 at the time it was left. Axe is clean on both sheets.
  2. With ten slots filled: Cancel leaves the dish unchanged ("Nothing was changed."); export downloads `little-living-garden.pixelmeba`, then Start; Another idea → replace Slot 3 with confirmation, then start. Saved dishes then shows 9 old saves and 1 replaced.
  3. At 200 % text: choices, Details, Copy, Start and Close are reachable; nothing scrolls sideways; axe is clean; Escape closes and returns focus to the link. Opened over a running dish, the sheet pauses it and resumes on close.

### Commands and results
- `npx vitest run tests/worker/whatif.test.ts` → 14 passed.
- `npx vitest run tests/worker tests/sim/comparison.test.ts tests/persistence tests/ui tests/recipes/variants.test.ts` → 12 files, 100 passed.
- `E2E_PORT=4183 E2E_OUTDIR=tmp/dist-whatif npx playwright test tests/e2e/whatif.spec.ts --project=phone-portrait --project=desktop --project=phone-landscape` → 9 passed (16.0 min). The desktop all-slots-used test took 6.6 min, so I then raised that test's timeout from 7 to 10 min; that one-value change was not re-run. The server on 4183 is stopped.
- `npx tsc -p tsconfig.json --noEmit` → clean. Mid-session another agent's `src/ui/views/Notebook.tsx` had a type error; it was gone by the final run.
- `npx eslint <all touched files>` → clean. I ran prettier on my new files only, not on the shared files.

### Not done, and why
- The variant provenance is not copied into the save file's `meta` block. It sits in `state.content.provenance.variant`, which the export test checks. Adding it to `SaveMeta` would mean editing `src/persistence/saveFile.ts`, which I don't own.
- There is no e2e test for the Again refusal: a browser build cannot load a revised registry. The worker test covers it.

### Problems found in files I don't own
- `state.ts` `client.onError` shows "Something went wrong and the dish was paused: …" for every failed request, including load and import refusals where nothing was paused.
- `Play.tsx` sets the Garden preload sentence at 0.85rem, and `.sheet .sub` uses `--fs-small` (14 px). Both are below the 16 px text rule.
- `startRecipe` and `startCustom` (Play → Garden Start, New Dish) throw the current dish away with no named save. That conflicts with D09's rule that the current dish is always kept before a new one starts.
- `SaveSheet` doesn't default to the dish's own slot.

### Proposed decisions
- PROPOSED DECISION: The "active slot" is the named slot a dish was opened from or last saved to, tracked per dish by the worker. On Start the dish is saved there (the store keeps the previous copy), otherwise to the first empty slot. Another dish's save is only overwritten after the player picks it and confirms.
- PROPOSED DECISION: A variant dish still exactly at its recorded start (tick 0 and the recorded start hash) is not written to a slot or the autosave when another dish starts, because the same idea rebuilds it exactly. The sheet says so beforehand.
- PROPOSED DECISION: What if? is a modal blocking panel. Opened from a dish, it pauses the dish and restores its prior speed on close; the worker also pauses the dish while it is being saved, so every write holds one moment.
- PROPOSED DECISION: A What if? refusal comes back as a `whatIfRefused` reply, not an `error` packet.
- PROPOSED DECISION: The export path is two steps: a real download first, then an explicit "Start the new dish". A device that cannot save gets export only.
- PROPOSED DECISION: More shows What if? for dishes created from a recipe that has ideas, and for variant dishes. Ideas always start from the authored recipe, never from the current dish (D09 §4). The Play shelf uses `FIRST_DISH_V1` until the shelf is driven by content data.
- PROPOSED DECISION: A variant dish's world id is the new dish id (as `create` does) and its name is the variant title.