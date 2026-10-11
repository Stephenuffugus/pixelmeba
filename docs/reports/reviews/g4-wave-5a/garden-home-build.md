# P4.3 garden-home: build report (wave 5a, stage 1)

Task: BUILD_DIRECTIVE P4.3 "Garden card, session memory, prompts". It covers UX §2, §2.1, §2.2 and §3.2, and D08 lines 56–58, 63–64 and 172–174. I worked in the shared tree and committed nothing.

## Checklist

### Build

1. **Live thumbnails: DONE**
   - `dishThumb(world)` is at src/worker/thumbnail.ts:77. It is a pure read of the alive/species/x/y columns: a 32 × 32 grid, each byte 0 or 1 + the index of the majority species, with the lowest index winning a tie (`buildThumb`). Tests: tests/worker/thumbnail.test.ts "is deterministic and read-only" and "majority … lowest species index on a tie".
   - The thumbnail string carries its own species list (PROPOSED DECISION 1): `pt1:<species ids in index order>:<base64 of 1024 bytes>`. `parseThumb` validates it at src/worker/thumbnail.ts:142.
   - `thumbFromSnapshot(snap, speciesIds)` is at :128. `thumbFromState(state)` is at :98: it reads a save file's serialized state, so a slot's picture is exactly the saved moment even while the dish keeps stepping during the checksum await.
   - Positions are rounded with `Math.fround` before choosing a block, as `SnapshotMsg.ents` (Float32) carries them. Without this, the world and the snapshot can disagree on an organism a hair below a block edge. The test "a hair below a block edge" fails if the rounding is removed; I checked.
   - Slot index:
     - `SaveRequest.thumb` and `SlotInfo.thumb` are in src/persistence/store.ts, and `slotRecordFor` copies `thumb` (store.ts:159).
     - host `saveRequest` sets `thumb: thumbFromState(built.file.state)` (host.ts:2046). Named slots, the autosave and keep writes all go through `saveRequest`.
     - The thumbnail is outside the checksum. `summary()` (host.ts:162) passes it on only when `parseThumb` accepts it.
     - `holdsSave` still holds: the same world gives the same string. Test "named slots and Continue carry … an unchanged dish still writes nothing at the next autosave": the second autosave returns `wrote: false`, and a malformed index copy is dropped.
   - `NewDishPreview.thumb = dishThumb(w)` is at host.ts:2282. Test: "the Play shelf preview's thumbnail is the dish its Start makes, at tick 0".
   - `DishThumb.tsx` (src/ui/views/DishThumb.tsx) draws a 96 × 96 canvas: 3 × 3 px blocks in `speciesHex` colours, water `#D6E7E5`, rim `#2C3F49`, outside `#14252D`. It has `image-rendering: pixelated`, `role="img"` and the label "Picture of {dish name}". It renders nothing for a missing or invalid string.
   - Thumbnail sources:
     - the open dish: `openDishThumb()` (state.ts:1687, from the latest snapshot);
     - Continue without an open dish: `auto.thumb` (Home.tsx:59);
     - the Play Garden card: `newDishPreview('FIRST_DISH_V1', recipe seed, {})`, with the seed read from content/recipes/FIRST_DISH_V1.json as New Dish reads its curated dishes (Play.tsx).
   - The painted `GardenThumb` SVG is removed. e2e checks that the card is a canvas holding Sprinter coral pixels.
2. **Home (UX §2.1): DONE**
   - Both Continue cards (the open dish, and the autosave) show the thumbnail, a "Paused" badge, the name with dish time (`continueCardText`, `data-testid` `home-continue-text`) and the mode labels (Home.tsx:31–75).
   - First launch shows Play and hides Continue; e2e asserts this.
   - The secondary row is unchanged.
3. **One optional prompt at a time: DONE**
   - src/ui/prompts.ts is a pure machine: `initialPrompts`, `promptReduce` (:138), `promptView` (:210) and `highlightControl` (:248).
   - Its inputs are snapshots (tick, speed, ents, events), the inspector's selection, the start line clearing, command results, the Follow press and ✕. It keeps time in dish ticks.
   - It is active only when `settings.showPrompts` is on and `isGardenDish` is true (recipeId or whatIfSourceId is `FIRST_DISH_V1`).
   - Steps 0–6 follow the assignment:
     - "It's eating sugar" appears only when a snapshot shows B01 with `CUE_FEEDING`, and only when the recorded diet is exactly `['sugar']`. Otherwise the step is skipped.
     - The 120 s line appears only when there has been no B01 birth.
     - Its Show me points at `shortcut-why` once a Sprinter is in the inspector.
     - Follow's Show me points at `follow-family`. The button is offered only while that element exists (checked after each render in NoticeHost).
   - Show me adds `.show-me` (an outline plus a pulse that the global reduced-motion rule stops) for 3 s. It never calls click or focus, and never sends a command.
   - Nothing shows while a sheet other than the inspector, What if?, the keep choice or a Lab tray covers the dish.
   - The driver is in src/ui/views/NoticeHost.tsx. It keeps one machine per dish id at module scope and subscribes through the new `onDishSnapshot` and `onDishCommand` (state.ts:1677).
4. **One visible notice: DONE**
   - src/ui/notices.ts provides `requestNotice` (:67), `dismissNotice` (:82), `withdrawNotice`, `withdrawKind`, `setNoticesBlocked` (:120) and `currentNotice` (:44).
   - Priority is goal > experiment > story > prompt. Each kind keeps only its latest request, and a dismissed id never comes back.
   - While the discovery card is open (it sits in the same place, z 7) nothing shows; the waiting notices return when it closes.
   - `NoticeHost` replaces DishScreen's old experimentWaiting/prompt block in the same place (DishScreen.tsx:276). It keeps `role="status"`, `data-testid="experiment-waiting"` with "Dismiss this notice" for the experiment kind, and "Dismiss" for prompts.
   - The LiveRegion is untouched.
5. **Session memory on Save and leave: DONE**
   - SaveSheet's "Save and leave" (`data-testid` `save-leave`, MoreSheet.tsx:258) runs through the same Replace confirmation when the slot is used. It calls `saveAndLeave` (state.ts:1715): `saveToSlot` (which also autosaves), then the read-only `sessionSummary` query from the tick at which the dish was opened (recorded in `enterDish`), then Home.
   - Home shows `SessionMemory` in place of the Continue card for that dish: name, thumbnail, dish time, Paused, one line or "Saved as it is now.", and Continue.
   - The query:
     - protocol `ToWorker`/`FromWorker` `'sessionSummary'` and `SessionSummary` type;
     - host case at host.ts:801;
     - `sessionSummaryOf` at host.ts:171 (per-second births and deaths, whole minute summaries, branch records with `displayBranchName`);
     - `client.sessionSummary()`.
   - A minute summary that began before the opening cannot be split, so it is left out and flagged `compacted`; the line then reads "At least N births…" (PROPOSED DECISION 3).
   - The line comes from `sessionMemoryLine` (src/ui/strings/home.ts): the first branch, else births, else nothing.
   - It never uses `client.history`. Returning to the dish route clears the memory.

### Done when

- **tests/ui/prompts.test.ts: DONE (12 tests)**
  - Each step fires only with its evidence: feeding fixtures with and without `CUE_FEEDING`, and with an alga's cue; birth fixtures with and without a B01 'birth', and with another kind's birth or death.
  - The 120 s line appears only with zero B01 births.
  - One prompt at a time; dismiss and Show me send no command (`highlightControl` with spies).
  - showPrompts off gives no prompt, a covering sheet gives none, and a non-Garden dish gives none.
- **tests/ui/notices.test.ts: DONE (5 tests).** One visible notice; priority and waiting with the latest per kind; a dismissed notice never comes back; the discovery block; an unchanged request keeps the same object.
- **tests/worker/thumbnail.test.ts: DONE (8 tests)**
  - deterministic and read-only (stateHash equal);
  - the same world gives the same bytes (round trip, `thumbFromState`);
  - the tie rule;
  - `thumbFromSnapshot` equals `dishThumb` on the same tick through the real DishHost;
  - the float32 edge;
  - the preview equals the started dish;
  - the slot index, `holdsSave` and the malformed copy.
- **tests/worker/session-summary.test.ts: DONE (5 tests)**
  - Read-only and no player step: on EXP_103 after the gate, two `sessionSummary` calls leave the hash equal and post no stamp. The control `history` request does post it, so the detector is proven live.
  - A quiet paused dish gives no line; a dish with births gives the births line with the exact per-second count.
  - The compacted lower bound; the branch line before births.
- **tests/e2e/garden-home.spec.ts: DONE.** It passes on desktop and phone-portrait and covers:
  - the Play canvas thumbnail;
  - arrival → Run → "Tap a Sprinter.", then pause → select → "Press Run." → Run;
  - the evidence-gated steps up to the Feed prompt;
  - Show me highlights Feed: class present then gone after 3 s, `aria-pressed` false, no Feed heading, worker hash unchanged;
  - the notice buttons are reachable 48 px targets and topmost (elementFromPoint);
  - Save and leave → session memory with the name, a canvas thumbnail and the births line → Continue opens paused at the same time and the same alive count;
  - axe (`expectNoSeriousA11yViolations`) on Home, Play, the dish with a prompt, the Feed prompt and the session memory card;
  - no page errors.

## Files

New:
- src/worker/thumbnail.ts
- src/ui/prompts.ts
- src/ui/notices.ts
- src/ui/strings/home.ts
- src/ui/views/{DishThumb,SessionMemory,NoticeHost}.tsx
- tests/ui/{prompts,notices}.test.ts
- tests/worker/{thumbnail,session-summary}.test.ts
- tests/e2e/garden-home.spec.ts
- this report

Changed (owner):
- src/ui/views/{Home,Play,DishScreen}.tsx
- src/ui/state.ts: `PLAY_PROMPT` exported, snapshot and command listeners, `sessionOpened`, `sessionMemory`, `saveAndLeave`, `openDishThumb`
- src/ui/panels/MoreSheet.tsx: Save and leave
- src/ui/styles.css:
  - `.prompt` right edge clear of the zoom column; wraps on narrow screens; stays left of a landscape side sheet;
  - `.dish-thumb`, `.paused-badge`, `.show-me`

Changed (shared, additive):
- src/worker/protocol.ts: `SlotSummary.thumb`, `NewDishPreview.thumb`, the `'sessionSummary'` messages, `SessionSummary`
- src/worker/host.ts: imports, `summary()` thumb, `sessionSummaryOf`, the case, the `saveRequest` thumb, the `newDishPreview` thumb
- src/worker/client.ts: `sessionSummary()`
- src/persistence/store.ts: `thumb` on `SlotInfo` and `SaveRequest`, copied by `slotRecordFor`

## Commands

- `npx tsc -p tsconfig.json --noEmit`: clean. An earlier error from favorites' in-flight `notebookChanged` packet in client.ts:201 has since cleared.
- `npx eslint <the 21 files above>`: clean.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/ui/prompts.test.ts tests/ui/notices.test.ts tests/worker/thumbnail.test.ts tests/worker/session-summary.test.ts tests/worker/host.test.ts`: `Test Files 12 passed (12)`, `Tests 91 passed (91)`.
- Related slot and keep tests: `npx vitest run tests/worker/{keep-autosave,keep-continue-ui,keep-dish,protocol,whatif,new-dish-preview-grid,host-requests}.test.ts tests/sim/founders-newdish.test.ts tests/persistence/{persistence,checkpoints}.test.ts`: `Test Files 10 passed (10)`, `Tests 157 passed (157)`.
- `E2E_PORT=4273 E2E_OUTDIR=tmp/dist-garden-home npx playwright test tests/e2e/garden-home.spec.ts --project=desktop --project=phone-portrait`: `2 passed (4.5m)`.
- Mutation checks:
  - Removing `Math.fround` fails "a hair below a block edge".
  - Counting any species' feeding cue fails 2 prompt tests.
  - Two other prompt mutants survive, and both are equivalent: (a) `!s.sprinterBirth` in the 120 s rule is redundant, because a birth always makes "A cell split." eligible first; (b) the garden guard is checked twice.

## FENCE

None. No sim rule and no version change. The fence and determinism fixtures pass unchanged.

## Bugs and notes for the lead

1. **One-line test changes needed elsewhere (not my files):**
   - **tests/e2e/keep-dish.spec.ts:563 and :572.** With `showPrompts: true` they expect `.prompt` count 0 after Run. P4.3 step 1 ("Tap a Sprinter.") now follows the arrival line on the Garden, so `.prompt` exists. Suggested: `await expect(page.locator('.prompt p')).not.toHaveText(/Press play and look closely\./)` or `toHaveText('Tap a Sprinter.')`.
   - I did not run those specs (fast-track rule). No other spec seeds `showPrompts: true`, but specs that start the Garden with default settings, without `startGarden`, now see the optional prompts after Run.
2. **Layout:** The old prompt's ✕ sat over the zoom buttons (z 4 over z 3) and under the landscape side sheet. reactions.spec and experiments.spec already dismissed it for that reason.
   - The notice now ends left of the zoom column.
   - With a sheet open on landscape ≥ 700 px it ends left of the sheet (`.viewport:has(> .sheet)`; Chromium/WebView support `:has`).
   - The e2e proves both buttons are topmost.
3. **Desktop e2e timing:** under SwiftShader at 4× with several hundred organisms, Playwright's "stable" check on the notice's ✕ timed out. The dismiss loop uses `dispatchEvent('click')`; reachability and topmost are asserted separately on the paused dish.
4. **Pre-existing:** `selectOrganism` near the Sprinter founders (48, 64) is flaky once the dish has run (Sprinters dart off). My journey selects a Sunbead at (48.5, 48.5).

## Proposed decisions

1. **PROPOSED DECISION:** a thumbnail is the string `pt1:<species ids in the world's index order>:<base64 of 32×32 bytes>`, not bare base64.
   - A species index only means something within one world (old saves record fewer species), and Saved dishes, Continue and the Play shelf have no species list of their own to colour it with.
   - Positions are rounded to float32 before choosing a block, so the snapshot and the world agree on every organism.
   - The slot copy is computed from the save file's own state (`thumbFromState`), so it is always the saved moment.
2. **PROPOSED DECISION:** the copy for UX §3.2 step 5 is "Try Feed: choose a food, see where it lands, then place it."
   - The session lines are:
     - "A new branch was established: {name}."
     - "{n} births were recorded since you opened it." ("1 birth was …")
     - nothing when the dish was quiet; the card then says "Saved as it is now."
   - The card title is "Saved for later", with a "Paused" badge.
3. **PROPOSED DECISION:** the session counts start at the tick the dish was opened in this visit.
   - A one-minute history summary that began before that tick cannot be split, so it is left out and flagged `compacted`, and the line says "At least N births…". It never claims births from before the visit.
   - A branch counts when `establishedTick ≥` the opening tick.
4. **PROPOSED DECISION: prompt pacing, as built.**
   - The dish's own start line (the `prompt` signal, e.g. the arrival line with the kept-dish prefix) is step 0 and blocks the optional prompts until it clears.
   - "A cell split." gives way after 15 dish seconds (an announcement of an event already shown).
   - The Feed prompt follows step 4, and Follow follows Feed and a real division.
   - Step 1's Show me points at Look, the tapping tool.
   - Step 3's Show me points at "What does it eat?" once a Sprinter is in the inspector.
   - Machines live per dish id for the page session, so reopening the open dish does not repeat its prompts. A dish loaded fresh starts over at step 1, because a loaded dish has no arrival line.
5. **PROPOSED DECISION: nothing shows while the discovery card is open.** The card occupies the notice's place above it, so hiding the notice is the only way to layer nothing. The waiting notices return when the card closes.
