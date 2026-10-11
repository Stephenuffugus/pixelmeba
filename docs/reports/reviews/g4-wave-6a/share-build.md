# P4.6 Share — build report (wave 6a, share)

Scope: BUILD_DIRECTIVE P4.6, under D-0080 (the picture comes from a snapshot) and D-0082 (the recipe card is the Starting recipe file). I added no sim rule, changed no version and did no world schema bump. Every number below comes from a run made in this session.

## Checklist

### Build
1. **Picture renderer (`src/render/picture.ts`)**: DONE.
   - `PictureInput` (`:65`) is a copy of one published snapshot (ents, ids, count, deposits, objects) plus its geometry (substrate, structure, shade) and the species tables. `PictureOptions` (`:83`) holds question, identity, title, timeLabel, legend, hideLabels, includeNicknames and crop.
   - `composePicture` (`:367`) is pure. It returns a draw list of fills, one pre-painted dish layer, atlas blits with integer source and destination rectangles, and text items.
     - The canvas is 1080 × 1080. The whole dish is drawn at 7 px per cell (896 × 896) at (92, 92).
     - Substrates and deposits use `DISH_COLORS` and `cosmetic()` from layers.ts.
     - Organisms use the renderer's reduced-motion frame: stress, else feeding while still, else move/idle, at `reducedMotionFrame`, with the heading row from `E_HEADING`. A parasite riding a host is drawn after the others.
     - Fungal segments, food objects and film are one-cell tiles.
     - Nothing reads the camera, the stage or any random stream.
   - Hide labels returns after the wordmark (`:484`).
   - `drawPicture` (`:636`) sets `imageSmoothingEnabled = false`. `exportPng` (`:680`) uses `canvas.toBlob('image/png')` and adds no chunks.
   - Proven by `tests/render/picture.test.ts`, and by the e2e test that reads the PNG.
2. **Starting recipe file (`src/persistence/recipeFile.ts`)**: DONE.
   - The `RecipeFile` envelope is `format`, `recipeFileVersion` 1, appVersion, name, question, versions, source (recipe | variant), recipe, habitat, enabledModules, expectedObservationsText, initialStateHash and checksum (`sha256:` over the canonical file without the checksum). It carries no command log, history, notebook or player name.
   - `recipeStartOf` (`:195`) and `buildRecipeFile` (`:322`) read only the recorded provenance (`recipeOverridesOf`, `variantRecordOf`; the host passes `isAuthoredRecipe` for older saves).
   - Refusals:
     - `NO_START_TEXT` (`:52`) for an experiment card, a comparison arm, or an old save without provenance that is not the authored start.
     - `OTHER_BUILD_START_TEXT` for a dish started under other content or rules.
   - `recipeFileProblem` (`:410`) checks:
     - the envelope and its exact key set, and the file version;
     - finite numbers (JSON `1e999` becomes Infinity);
     - the source's shape and a seed of 0…4294967295;
     - recorded choices this build knows, ids and revisions (any of these not in this build → compatible-build), and the four rule versions plus contentVersion.
   - `loadRecipeFile` (`:557`) checks the size first (`MAX_IMPORT_BYTES`), then the checksum. It realizes the start from **this build's own content**. It refuses unless the module list, the source, the resolved recipe and habitat all match, and stateHash equals `initialStateHash`. The refusal text is "This recipe needs a compatible build (simulation {s}, rules {r}, content {c})." Nothing in the file runs, and no URL is loaded.
   - Host `recipeExport` / `recipeImport` (host.ts `:550`, `:576`): the import builds first, then keeps the open dish (D-0033), then opens a new paused dish and answers **`loaded`**.
   - `importFile` (state.ts `:483`) uses `isRecipeFileText` (state.ts `:505`): a `pixelmeba-recipe` file goes to `recipeImport`, anything else to the save import.
   - Proven by `tests/persistence/share.test.ts`, and the e2e recipe import (hash equals `initialStateHash`).
3. **Living dish**: DONE.
   - It uses the existing `exportDish` and `buildSaveFile`; `saveFile.ts` is unchanged.
   - Opening the sheet pauses the dish (`openShare`, share.ts `:46`). Closing restores the prior speed (`closeShare` `:84`, plus `restoreShareSpeed` on unmount).
   - The sheet says "The file includes world names and notes." and offers "Strip names and notes" (stripNames) and "Include family nicknames" (off, and disabled while strip is on).
   - Proven by the share.test.ts Living dish tests, and by the e2e test that imports the file back with the same worker hash.
4. **Offline recipe identifiers (`src/persistence/recipeId.ts`)**: DONE.
   - `formatRecipeId` (`:51`) gives "R-G3 / revision 1 / seed 104729".
   - `parseRecipeId` (`:73`) accepts "revision" or "rev" (keywords case-insensitive), any spacing, and "-" or U+2011 in the id. Nothing else is accepted.
   - `resolveRecipeId` (`:94`):
     - **Variants**: exact revision and the source's own seed. Another seed gives "R-G3 revision 1 starts from seed 104729."
     - **Shipped recipes** (phase ≤ buildPhase): exact revision and any canonical integer seed 0…4294967295.
     - Anything else gives "This recipe needs a compatible build ({identifier as typed})." Ids are case-sensitive, a seed or revision with leading zeros is refused, and `constructor` and other non-own keys are refused.
   - "Copy recipe details" in the sheet (Starting recipe, bundled starts only) copies the identifier line.
   - `RecipeIdImport.tsx` (one field, maxLength 80, Start) appears on Play under the Garden card (Play.tsx `:74`) and in Saved dishes after Import (Saves.tsx `:170`).
   - The host's `recipeIdStart` (host.ts `:595`) realizes a variant with `realizeVariant` (as whatIfStart does) and a recipe through `build({kind:'recipe', seed})`; the seed is passed only when it differs, so the Garden ID is exactly the Play shelf start. It answers **`ready`**, and both paths keep the open dish first.
5. **Share sheet (`ShareSheet.tsx`, sheet `'share'`, More → "Share…" `data-testid more-share`, MoreSheet `:101`)**: DONE.
   - Three native radio choices, each ≥ 48 px, with the exact UX §5.10 one-liners.
   - Previews:
     - Picture: a live 1080 canvas shown at 280 px, pixelated.
     - Starting recipe: identity and versions.
     - Living dish: "“name” at m:ss dish time · size".
   - Options:
     - Picture: a question prefilled with the recorded question (maxLength 120), Hide labels, Strip metadata (on), a species key (off) and Include family nicknames (off).
     - Living dish: as in item 3.
   - One Share button and a polite status line.
   - When there is no recorded start, the Starting recipe choice is disabled and shows the reason.
6. **OS share/save (`src/ui/share.ts`)**: DONE.
   - `deliverFile` (`:241`) shares only when `navigator.share` exists and `canShare({files})` is true. Otherwise it downloads: `pixelmeba-picture.png`, `{recipe-name}-recipe.pixelmeba`, or the save's own name, with type `application/vnd.pixelmeba+json`.
   - AbortError, or any other rejection, gives `'cancelled'`: no download, no toast, no state change. The sheet's status says "Not shared. Nothing changed."
   - Proven by `tests/ui/share.test.ts`.
7. **Story card "Save picture"**: DONE.
   - The button is at StoryCard.tsx `:56`. `openShareFromStory` (share.ts `:73`) returns to the dish and opens the sheet on Picture with the card title as the question.
   - The Notebook visit's recorded speed becomes the sheet's prior speed.
   - The picture always carries "Dish at m:ss", even with Strip metadata on, and the sheet says why. `imageRefs` stay empty.
   - Proven by the share.test.ts "Save picture from a story card" test. There is no e2e test for this, because a story notice needs 60 dish seconds.

### Done when
- **`tests/persistence/share.test.ts`** (10 tests): DONE.
  - Round trips: FIRST_DISH_V1 exported after 120 ticks, R-G3, and New Dish starts (seed 7 accelerated/varied; seed 4294967295 empty on GEL_COLONY). In each, the import's stateHash equals `initialStateHash` and a direct realization, and the whole serialized world equals a `create` with the same source, apart from the worldId.
  - Fifteen refusals, each leaving the open dish active and its stateHash unchanged, with nothing written to the store: bad checksum, unknown recipe, another revision, seed 4294967296, seed −1, `1e999`, oversized, simulation 4, content 3, another start hash, another recipe body, another module list, an unknown field, not JSON, a save file.
  - No recorded start: an experiment card and an old custom save give NO_START_TEXT; an old authored save is accepted; another contentHash gives OTHER_BUILD_START_TEXT.
  - Living dish at a paused tick: equal stateHash.
  - Stripped file: no branch name, journal note or dish name; the checksum equals sha256 of its own state and differs from the unstripped one; stripping commutes with 600 more ticks (equal stateHash, entities and fields).
  - Recipe ID parse, resolve and every refusal text, through the host as well (a refused ID keeps nothing).
- **`tests/render/picture.test.ts`** (7 tests): DONE.
  - 1080², 7 px per cell, every rectangle an integer.
  - Nothing inside the 48 px margin, and the key never covers the round dish.
  - Hide labels leaves only the wordmark.
  - A nickname appears only when opted in.
  - Reduced-motion frames sit at their snapshot positions.
  - Crop: 24 cells give 37 px per cell and sprite scale 5.
  - Composing twice gives the same result and leaves the input unchanged.
- **`tests/ui/share.test.ts`** (6 tests): DONE. canShare false, missing, or no File → download; share works → no download; AbortError, NotAllowedError or an Error → 'cancelled' with no download, toast or UI state change; the exact choice texts; the picture options; the story opener.
- **`tests/e2e/share.spec.ts`** (4 journeys, desktop **and** phone-portrait): DONE.
  - The sheet opens with three labelled choices and their exact accessible names; it pauses a running dish and resumes it on close.
  - Opening and cancelling (and switching choices) leaves the worker hash unchanged.
  - Picture saves `pixelmeba-picture.png`: the IHDR is 1080 × 1080, with no tEXt, iTXt, zTXt, eXIf or tIME chunk.
  - Starting recipe shows "FIRST_DISH_V1 / revision 1 / seed 104729".
  - The Living dish file re-imports with an equal worker hash under a new dish id. The recipe file imports at 0:00 with a hash equal to `initialStateHash`.
  - On Play, a bad ID shows the refusal and changes nothing (same worker hash, no dish opened); a wrong seed gives "starts from seed 104729."; "R‑G3 / rev 1 / seed 104729" starts "Dinner farther away", paused at 0:00.
  - Saved dishes: an unparseable ID is refused, and the Garden ID starts the Garden.
  - axe finds no serious or critical violation on the share sheet (Picture, Starting recipe and Living dish), the Play panel or the Saved dishes panel. No horizontal overflow. Targets are ≥ 48 px.

## Files
- **Created:**
  - src/render/picture.ts
  - src/persistence/recipeFile.ts, src/persistence/recipeId.ts
  - src/ui/share.ts, src/ui/strings/share.ts
  - src/ui/panels/ShareSheet.tsx (also exports `IconShare`), src/ui/panels/RecipeIdImport.tsx
  - tests/persistence/share.test.ts, tests/render/picture.test.ts, tests/ui/share.test.ts, tests/e2e/share.spec.ts
  - this report
- **Changed (stage owner):**
  - src/ui/state.ts:
    - sheet id `'share'`;
    - `onError` skips `recipeExport` and `recipeIdStart` (they are shown in their own panel);
    - `errorToastText` case `recipeImport`;
    - `importFile` format detection;
    - new `isRecipeFileText`, `startRecipeId`, `latestDishSnapshots`.
  - src/ui/views/DishScreen.tsx (mount), Play.tsx and Saves.tsx (RecipeIdImport; the Saves import line now says "a saved dish or a starting recipe").
  - src/ui/panels/MoreSheet.tsx (Share… row).
  - src/ui/styles.css (an appended `.share-*` / `.recipe-id*` block).
  - src/persistence/saveFile.ts is unchanged.
- **Shared, additive:**
  - src/worker/protocol.ts: ToWorker `recipeExport`, `recipeImport`, `recipeIdStart`; FromWorker `recipeExported`.
  - src/worker/host.ts: two imports, three `handleAsync` cases, three dispatch case labels.
  - src/worker/client.ts: `recipeExport`, `recipeImportKeeping`, `recipeIdStartKeeping`.
  - src/ui/panels/StoryCard.tsx: one button, one import, one comment line.

## How I checked that the tests fail without the mechanism
I applied each of these mutations, ran the tests, and restored the files byte-identically (checked with cmp). Each targeted test failed:
- removing the `initialStateHash` comparison in `loadRecipeFile` → the refusals test fails;
- `deliverFile` downloading on a rejection → the AbortError test fails;
- removing the Hide labels early return → the Hide labels test fails;
- accepting any seed for a variant → the recipe ID resolve test fails.

## Commands (this session)
- `npx tsc -p tsconfig.json --noEmit`: clean. At one point mid-wave it reported a try-my-dish in-flight error at client.ts(265); that was not mine and was gone at the end.
- `npx eslint` on every file I created or touched (including host/protocol/client/state): clean.
- `npx prettier --write` on my new files only.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/persistence/share.test.ts tests/render/picture.test.ts tests/ui/share.test.ts` → `Test Files 10 passed (10) · Tests 79 passed (79)`.
- After formatting: `npx vitest run tests/persistence/share.test.ts tests/render/picture.test.ts tests/ui/share.test.ts` → `Test Files 3 passed (3) · Tests 23 passed (23)`.
- Neighbouring tests: `npx vitest run tests/ui/stories.test.ts tests/ui/favorites.test.ts tests/ui/notice-cards.test.ts tests/ui/keep-words.test.ts tests/persistence/strip-names.test.ts` → `Test Files 5 passed (5) · Tests 51 passed (51)`.
- `E2E_PORT=4271 E2E_OUTDIR=tmp/dist-share npx playwright test tests/e2e/share.spec.ts --project=desktop --project=phone-portrait` → `8 passed (4.9m)`.
  - The first desktop run failed in two ways. One test hit its timeout: under load average 7 every action took 1.5–7 s; the logic itself passed. The other had a regex too strict for the size line ("5.7 MB"). I fixed both in the test.
  - Timings were taken under heavy machine load, so I leave performance numbers to the lead.

## FENCE
No fence value moved. g2-replay and the four trajectory-fence files pass unchanged. Nothing in src/sim changed.

## Bugs noticed elsewhere
- Every worker `error` packet that has a requestId raises the global toast, and `importFile` then raises its own "Nothing was changed: …" toast. A refused import therefore shows two toasts in a row, and the second replaces the first. This is pre-existing; for `recipeImport` I made the first one read "Import failed; nothing changed: …".
- `tests/ui/*` tests that import the real state.ts fail as soon as `dishInfo` is set, because `getClient()` constructs a Worker. My test stubs `Worker`; a shared helper would help.

## PROPOSED DECISIONS
1. **Picture layout.**
   - The canvas is 1080 × 1080 on a `#14252D` surround.
   - The whole dish is drawn at 7 px per cell (896 px) at (92, 92).
   - The question band is y 48–92: one line at 28 px, or two at 20 px with "…".
   - The bottom band starts at y 996 and holds:
     - the quiet wordmark "Pixelmeba" on the left;
     - "· title · Dish at m:ss" next to it;
     - the recipe identifier right-aligned.
   - The optional species key fills the four corners of the dish square, which lie outside the round dish: four lines each, then "+n more".
   - Every item keeps a ≥ 48 px safe margin. Organism sprites are 1 sprite px per picture px; one-cell tiles are 7 px.
   - The canvas executor squeezes text to `maxWidth`, so fonts never overflow.
2. **The recipe card (P4.8) is the Starting recipe file** (`pixelmeba-recipe`, recipeFileVersion 1). It records the source, the resolved recipe and habitat, the modules, the versions, the expected observations text and `initialStateHash`. The P4.8 task can tick "recipe card export" against it, as D-0082 says.
3. **Strict build match for recipe files.**
   - Export refuses a dish whose recorded contentHash, contentVersion or rule versions differ from this build's, because its start cannot be written exactly.
   - Import requires equal rule versions and contentVersion, equal modules, an equal resolved recipe and habitat, and stateHash equal to `initialStateHash`. stateHash covers contentHash, so in practice the same content is required.
   - A recipe file therefore stops importing after any content update. The alternative would be realizeAgain's looser rule (ignore contentHash when the recipe checksums match). Owner call.
4. **Recipe IDs.** Variants need their source's seed; shipped recipes (phase ≤ buildPhase, any of the 18, experiment recipes included) accept any canonical integer seed 0…4294967295. Ids are case-sensitive; seeds and revisions with leading zeros are refused. A recipe ID with the recipe's own seed opens exactly the Play shelf start, so it is "unchanged" for D-0033.
5. **Story picture time.** A picture saved from a story card always carries "Dish at m:ss", even with Strip metadata on. Dish time is not personal, and leaving it out would let the picture read as the moment of the story. The sheet says so.
6. **Strip metadata** removes the dish name and dish time from the picture. The recipe identifier stays: it is not personal, and D09 lists it as part of a picture.
7. **A cancelled or refused OS share** (any rejection of `navigator.share`) is "Not shared. Nothing changed." as a quiet status line in the sheet, never a toast and never a fallback download. Without Web Share Level 2 file support (desktop Linux Chromium, for example) the file is always downloaded.
8. **Protocol answers.** `recipeImport` answers `loaded` and `recipeIdStart` answers `ready` (so the existing e2e worker watchers follow the new dish). `recipeExport` refuses with `error` kind `'no-start'`, and the UI does not toast it.
