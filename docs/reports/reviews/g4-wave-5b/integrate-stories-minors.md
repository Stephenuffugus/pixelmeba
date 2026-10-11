# g4 wave 5b integration: stories-minors

Key: stories-minors · 2026-10-11 · Items from wave-verify.md: 2 (MINOR), 3 (MINOR) and 6 (NIT, stories part). I edited only the files I own and ran no git write. My scratch files are in tmp/stories-minors/.

## Items

### 1. MINOR: after the notice's Open, Spotlight now restores the dish's prior speed. DONE, except one part (see "Not done")

- **What changed:**
  - `src/ui/stories.ts:75` `storyReturn` records `{dishId, speed}`. It is set at `:105` in `openStory`, which only the story notice's Open calls. The speed is read before the route changes, and only when the dish screen is showing.
  - `:78` `takeReturn` uses the record once, and only when the same dish is still open.
  - `:85` `restoreSpeed` calls the app's own `setSpeed`, and only when the recorded speed is above 0.
  - `spotlightStory` (`:161`, restore at `:165`) takes the record before it routes to the dish, then restores the speed.
  - `:93` `leaveNotebook()` is a new export: during a story visit it routes to the dish and restores the speed.
  - `:197` (in `wireStories`): leaving the Notebook by any other route ends the visit. The dish then stays paused, as D-0028 already leaves it.
  - This is the Field Guide's convention (`FieldGuideNav.ts` `guideReturn` / `guideBack`, D-0061). Nothing else changes speed. `state.ts` did not need any helper.
- **Unit tests** (`tests/ui/stories.test.ts:484-560`, "pause and restore"):
  - Open at 4×, then Spotlight, gives `setSpeed(4)` once, and a second visit leaves the speed alone.
  - `leaveNotebook` at 2× restores 2×, also after a tab change, and works only once.
  - A paused dish stays paused.
  - Open while not on the dish screen records nothing.
  - Notebook → Home → Notebook, then Spotlight, changes no speed.
  - With another dish open, there is no restore.
  - The existing Spotlight test now also asserts that no speed is sent.
- **Mutants:** each was applied to the source, then the file was restored from a copy and checked with `cmp` (each restored byte for byte). Each made exactly the named test fail:

  | Mutant | Change | Result |
  |---|---|---|
  | M1 | Spotlight does not restore | "Open on a running dish, then Spotlight" fails |
  | M2 | `leaveNotebook` does not restore | "the Notebook's Back (leaveNotebook)" fails |
  | M3 | the visit never ends | "a paused dish stays paused; …" fails |
  | M4 | the speed is recorded on any route | the same test fails |
  | M5 | no same-dish check | the same test fails |

- **e2e** (`tests/e2e/stories.spec.ts`): passes on desktop and phone-portrait. The journey:
  1. Open sends `setSpeed` 0, and the world stays still (same hash and tick).
  2. Spotlight sends `setSpeed` 4. The run toggle reads "Pause", the speed shows 4×, and the worker tick advances (`:118`).
  3. Home pauses the dish.
  4. The card is opened from the Notebook list. Spotlight leaves it paused ('Run', `:142`), sends no `setSpeed`, and the worker hash is unchanged.
  5. Dismiss leaves the hash unchanged.
- **e2e mutant:** I built M1 into `tmp/dist-stories-minors-mut` and ran phone-portrait against it. It failed at `:118` with "Expected: 4, Received: 0". The source was restored and checked with `cmp` (identical), and that build directory was then deleted.

### 2. MINOR: the family card's third panel now uses the Lineage sheet's wording. DONE

- **Where:** `src/ui/strings/stories.ts:182`.
- **The panel now:**
  - It is captioned "Game rules" (`STORY_TEXT.gameRules`, `:36`, the label `LineageSheet.tsx` uses).
  - Its details list every line `ruleLines` returns, unchanged and in the same order. Each line already pairs the branch value with the ancestor value. The last detail is `LINEAGE_TEXT.notVerdict`.
  - When the rules are null it says "Its ancestor's genome is not recorded, so no game rule numbers can be compared."
  - When no rule differs it shows ruleLines' own line, "Game rule: none of its rule numbers differ from its ancestor's."
  - No line is called "Tradeoff", because the lineage record marks no rule as a cost or a gain. The doubled label is gone.
- **Tests:** "words" › "a real family card" (`tests/ui/stories.test.ts:345` ff.) uses a real card: story-8 of the Garden, seed 104729, up to tick 6898, stored exactly as the worker recorded it. I re-captured it with `tmp/stories-minors/family.ts`, and it passes `storyCardProblem`. The test pins all three panels (time, caption and details), with "Ancestor: the Sprinter founder of this line." It also covers:
  - a motility variant whose first line is the gain side ("it moves up to 0.3 cells per second (ancestor: 0.25)"), still with no "tradeoff";
  - the rules-equal case;
  - the existing family test, which now pins "Game rules" and the null-rules line.
- **Mutant M6** (the old Tradeoff hunk put back, restored with `cmp`): 2 tests failed.

### 3. NIT: articles and plurals. DONE

- **Where:**
  - `src/ui/strings/stories.ts:89` `withArticle` gives "An" before a vowel letter and "A" otherwise. It is used at `:150`.
  - `:97` `speciesCount` gives the plural unless the count is 1. It uses the app's species plural, `plural` from `strings/experiments.ts` ("Amoebae", "Sprinters"). It is used at `:190` (inoculate) and `:205-206` (before/after).
  - A species the dish no longer names keeps its bare id ("13 Q09"). Content has no recorded plural field.
- **Tests:** "words" › "'A' or 'An' before a species name; …" covers:
  - "An Oilwick", "An Amoeba", "A Sprinter";
  - "Before: 13 Sprinters", "Before: 1 Sprinter", "After: 0 Sprinters", "2 Amoebae", "1 Amoeba";
  - "You added 5 Sprinters", "5 Amoebae", "1 Oilwick";
  - the id fallback.

  The place test now expects "13 Sprinters" and "59 Sprinters".
- **Mutants** (each restored with `cmp`):

  | Mutant | Change | Result |
  |---|---|---|
  | M7 | no article | 1 test fails |
  | M8 | no plural | 2 tests fail |
  | M9 | inoculate singular | 1 test fails |

## Not done

- **Back from the Notebook does not restore the speed yet.** It needs a one-line change in `src/ui/views/Notebook.tsx`, which is not one of my files. That Back button routes to Home ("Back to Home"). Restoring the speed while Home is showing would make the dish run off screen, against D-0028. So the restore lives in `leaveNotebook()`, which is unit-tested. The lead can wire it in with this patch at `Notebook.tsx:65`:

  ```tsx
  onClick={() => { if (!leaveNotebook()) route.value = { name: 'home' }; }}
  ```

  The aria-label then also needs to change: "Back to the dish" while `storyReturn.current` is set, otherwise "Back to Home". Also import `leaveNotebook` from '../stories'.
- **The comment at `Notebook.tsx:5` is still inaccurate.** It says "Opening the Notebook never pauses or changes a dish", but leaving the dish screen does pause it (D-0028). That file is not mine either.

## Proposed decisions

- PROPOSED DECISION: a story card opened from its notice, on a running dish, uses the Field Guide's pause-and-restore convention (D-0061). The dish and its speed are recorded at Open. During that Notebook visit, Spotlight (or the Notebook's Back, once wired) returns to that dish at that speed, and the record is used once. Leaving the Notebook any other way ends the visit, and the dish stays paused (D-0028). A card opened from the Notebook list, or a notice opened off the dish screen, never changes the speed.
- PROPOSED DECISION: the family card names no line "tradeoff". The lineage record marks no rule as a cost or a gain, and SPEC §12.9 allows no benefit claims. D08's "name the inherited difference and tradeoff" is met by the Lineage sheet's structure: "Inherited difference" plus "Game rules", where every differing rule is shown with its ancestor's value. Nothing is sorted into a gain side or a cost side.
- PROPOSED DECISION: story captions use "A"/"An" by the first letter of the name, and the app's species plural (`strings/experiments.ts` `plural`) for any count other than one. A species shown by its bare id (the dish no longer names it) is never pluralized.

## Files changed

- src/ui/stories.ts
- src/ui/strings/stories.ts
- tests/ui/stories.test.ts
- tests/e2e/stories.spec.ts
- docs/reports/reviews/g4-wave-5b/integrate-stories-minors.md (this report)

No file was changed in src/worker, src/persistence, src/sim or content, and none in src/ui/state.ts. The stored card shape is unchanged, so wave 5b cards still load. The fence did not move.

## Commands run

- `npx tsx tmp/stories-minors/family.ts`: the Garden at seed 104729 up to tick 6898 recorded story-8 (familyChanged). Its old third caption was "Tradeoff: game rule: it can split once it is 13.2 s old (ancestor: 12 s)."
- `npx tsc -p tsconfig.json --noEmit`: exit 0, run 3 times, the last after all edits.
- `npx eslint src/ui/stories.ts src/ui/strings/stories.ts tests/ui/stories.test.ts tests/e2e/stories.spec.ts`: exit 0.
- `npx vitest run tests/ui/stories.test.ts`:
  - The first run gave 1 failed / 17 passed: I had guessed the number format wrong in my own expectation.
  - The second run gave 1 failed / 17 passed: ruleLines has its own no-difference line, so I used it.
  - Then: Tests 18 passed (18).
- `tmp/stories-minors/mutant.sh` M1–M9 (each runs `npx vitest run tests/ui/stories.test.ts`): each mutant failed 1 or 2 tests, and each file was restored and checked with `cmp`.
- `E2E_PORT=4281 E2E_OUTDIR=tmp/dist-stories-minors npx playwright test tests/e2e/stories.spec.ts --project=desktop --project=phone-portrait`: 2 passed (2.6m).
- `E2E_PORT=4281 E2E_OUTDIR=tmp/dist-stories-minors-mut npx playwright test tests/e2e/stories.spec.ts --project=phone-portrait` (M1 built in): 1 failed, "Expected: 4, Received: 0". The source was restored and checked with `cmp`.
- Port 4281 was stopped before and after each run (`lsof -t -i :4281 | xargs -r kill`), and `lsof` showed it free afterwards.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/ui/stories.test.ts tests/worker/stories-host.test.ts`: Test Files 7 passed (7), Tests 76 passed (76), exit 0.
