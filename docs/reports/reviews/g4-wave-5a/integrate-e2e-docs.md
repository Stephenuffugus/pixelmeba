# g4 wave 5a integration — e2e-docs fixer report

Saved by the lead from the run journal of `wf_811f8395-c0f` (agent `fix:e2e-docs`, finished 02:37 UTC, 2026-10-11); the agent returned it as its final message and wrote no file.

All three items are done. Both changed Playwright tests pass on desktop and phone-portrait, and axe found no serious or critical issues on any of the new screens.

**1. DONE: keep-dish prompt checks** (`tests/e2e/keep-dish.spec.ts`, test at :553)
- **After the first Run (:562–566):** the start line "Press play and look closely." is gone and `.prompt` has count 1. `[data-testid=guide-prompt] p` reads exactly 'Tap a Sprinter.', which is `PROMPT_TEXT.tapSprinter` in `src/ui/strings/home.ts:22`.
- **After the second Run (:574–579):** the kept line "Saved “Little Living Garden” to Slot 1 first." is gone and `.prompt` has count 1 with exactly 'Tap a Sprinter.'. A new check confirms no toast containing 'first' appeared from the earlier toast mark onward.
- Every other claim in the test is unchanged: the kept line in the prompt, no toast for it, 16px text, the experiment card text, the axe check, the Slot 2 keep line and the slot contents.
- **Fails without the fix:** I did not run the old test. The edited test proves `.prompt` has count 1 at both points (passed on both projects), so the old `toHaveCount(0)` checks would fail there. That matches the failure you reported.

**2. DONE: axe sweep for the wave 5a screens** (`tests/e2e/a11y-screens.spec.ts`)
- I added one new test at :404 instead of extending the 900 s dish test. It imports `selectOrganism` from the helpers (:23) and has a 480 s timeout, raised from 360 s because the desktop run took 3.2 minutes.
- **Screens scanned:**
  - Follow sheet
  - Dish with a followed family's slot
  - Family sheet
  - Home with the Continue card thumbnail
  - Notebook → Favorites with one record
  - Play with the Garden card thumbnail
  - Session memory ("Saved for later")
- The test asserts the accessible names of each thumbnail and of the favorite slot. `a.done` checks that all seven screens were visited and that axe found nothing serious or critical.
- **Comment at :398–403** covers two things:
  - The extinction card can't be reached in a journey.
  - Saved dishes shows no thumbnail, so there is nothing to scan there. The only `DishThumb` uses are in `Play.tsx`, `Home.tsx` and `SessionMemory.tsx`.
- **Fails without the fix:** not applicable. This adds coverage; it doesn't fix a bug.

**3. DONE: `docs/ARCHITECTURE.md`**
- **§7 (:169):** an "As built" block covering:
  - `notebookGet` (with `inspect`) and its `notebook` answer, with `refused`, `removed` and `inspected`
  - `favorite` and the full `FavoriteOp` union and patterns
  - `notebookChanged` and its `NotebookChange` union
  - the read-only `sessionSummary` request and its answer
  - `includeNicknames` on `exportDish` and `exportSave` (default off)
  - `loaded.notebookDropped`
  - `SnapshotMsg.favorites`: `marks`, `member` and the `FavoriteSlotMark` fields
  - the thumbnail on `SlotSummary`, `NewDishPreview`, `SaveRequest` and `SlotInfo`
  - `PROTOCOL_VERSION` unchanged at 2
- **§11.2 (:314):** the `"notebook"` block as built:
  - a sibling of `"state"`, outside the state checksum and the stateHash
  - its own format, version and sha256 checksum, and nothing in `src/sim` imports it (checked with grep)
  - the load checks, including the cap of 1,048,576 characters of canonical JSON
  - a bad or oversized record is dropped with `notebookDropped` while the world loads; a pre-P4.1 file loads with an empty notebook and no message
  - an empty notebook is not written
  - device saves keep nicknames; an export keeps them only when the player opts in
  - the slot index's `notebookChecksum`

**Files changed:** `tests/e2e/keep-dish.spec.ts`, `tests/e2e/a11y-screens.spec.ts`, `docs/ARCHITECTURE.md`. Scratch logs are in `tmp/e2e-docs/`.

**Commands run:**
- `lsof -t -i :4281 | xargs -r kill`, run before and after the Playwright run; nothing is left on the port.
- `E2E_PORT=4281 E2E_OUTDIR=tmp/dist-e2e-docs npx playwright test tests/e2e/keep-dish.spec.ts tests/e2e/a11y-screens.spec.ts -g "kept line leads|wave 5a" --project=desktop --project=phone-portrait` → "4 passed (5.4m)". Phone-portrait: a11y 38.4s, keep-dish 25.6s. Desktop: a11y 3.2m, keep-dish 59.7s.
- `npx tsc -p tsconfig.json --noEmit` → exit 0, no output.
- `npx eslint tests/e2e/keep-dish.spec.ts tests/e2e/a11y-screens.spec.ts` → exit 0, also re-run after the timeout bump.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence` → "Test Files 5 passed (5), Tests 51 passed (51)", 436s.

I changed only e2e specs and docs, so these vitest fixtures are the only unit tests that apply.

No proposed decisions.