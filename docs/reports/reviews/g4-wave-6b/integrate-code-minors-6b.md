# g4-wave-6b integration: code-minors-6b

Scope: the 14 items assigned to the key code-minors-6b. Nothing under src/sim/ or content/ changed (`git status --short src/sim content` is empty). DECISIONS.md and EXPANSION_RESPONSE.md were not edited. Scratch files are in tmp/code-minors-6b/.

**How the "fails without the fix" proofs were run:** `tmp/code-minors-6b/mutant.sh` and `e2e-mutants.sh` copy the file, apply a one-line mutation (a python script `m<N>.py`), run the test, copy the file back and check it with `cmp`. Every run printed "RESTORED byte-for-byte".

## Items

### 1. DONE: challenge starting points have their own group and their own confirmation

**Change**
- src/ui/storage.ts:47 `baselineWrittenFor` reads `createdFor`: 'ch-…' is a challenge baseline, anything else is a Try my dish one.
- Groups at :65-66: the "Try my dish starting points" group now lists only Try my dish rows. A new group, "Challenge starting points" (`challengeBaselines`), lists the challenge rows.
- The question at :82 depends on that split.
- src/ui/strings/notebookTools.ts:73 (heading) and :88 (`confirmChallengeBaseline`): "Remove this challenge starting point? Challenges stay in their dishes and turns already played stay; Another turn will be unavailable. To start or export one of these challenges again, import its challenge file, or open its dish while it is still at this moment."

**Why each part of that sentence is true** (checked against host.ts):
- challengeExport and challengeStart look for a shelf baseline with the same checksum. Without one, they build the open dish and accept it only while its state checksum equals the baseline's. An imported challenge file opens exactly that state, and challengeStart then writes the baseline again.
- openTurn reads `baseline.shelfId`, so Another turn from this record fails.
- StoragePanel.tsx: header comment only.

**Proof**
- tests/ui/storage.test.ts: a new test, "a challenge's starting point is listed under 'Challenge starting points', never under Try my dish". It also checks that every row is in exactly one group.
- The pinned question and the group sums are updated.
- Mutant m1 (`baselineWrittenFor` always returns 'tryDish'): 3 failed | 2 passed.
- The bookmarks-gallery e2e pins only the snapshot text, so it did not need a change. It still passes with the new group on both projects.

**Residual (not fixed; not in my files)**
- challengeSave reuses any baseline with the same checksum, including a Try my dish record ('try-n'). Removing such a row also takes the starting point from a challenge saved at that same moment. Neither the Try my dish question nor the panel can know about such challenges.
- store.ts SHELF_REMOVE_REFUSED still says "a Try my dish starting point or a snapshot bookmark".
- PROPOSED DECISION: challengeSave should write its own 'ch-' record instead of sharing a 'try-' one, or readStorage should report which challenges use a record. The lead or the owner chooses which.

PROPOSED DECISION: a challenge baseline is recognised by `createdFor` starting with 'ch-' (that is what challengeSave and challengeStart write). Any other baseline stays under Try my dish.

### 2. DONE: the shelf's refusal messages name both kinds of starting point and where to remove one

**Change**
- src/persistence/shelf.ts:49 `SHELF_TEXT.full`: "This device already keeps 10 starting points for Try my dish and challenges. Remove one you no longer need in Saved dishes → Storage, then try again. Nothing was changed."
- Snapshots: "… 20 snapshot bookmarks. Remove one you no longer need in Saved dishes → Storage, …".
- `storageFull` and `writeFailed` now take the kind and say "starting point" or "snapshot".
- The detail stays inside the one pair of parentheses, because bookmarkAdd's regex reads it back.
- "Saved dishes" is the Saves.tsx heading and Home button. "Storage" is the Saves.tsx button.

**Pins updated:** tests/persistence/shelf.test.ts:145, tests/worker/try-dish-host.test.ts:546 and tests/worker/bookmarks-host.test.ts:253. There is also a new test at shelf.test.ts:214, "the refusals are true for every caller…".

**Proof:** mutant m2 (the old words): 2 failed | 7 passed.

### 3. DONE: writes to one Shelf run one at a time

**Change**
- src/persistence/shelf.ts:118 adds `private writes`, one chain per instance. :173 adds `serial()`, which runs `this.writes.then(write, write)` and then catches, so a failure never blocks the next write.
- `put` (:183) and `remove` (:244) both go through the chain. Reads (`list`, `check`, `get`, `nextSequence`) do not.

**Test:** shelf.test.ts:222 uses a backend whose listSlots, getSlot and getRecord each yield two macrotasks and whose commit waits a further 25 ms. It checks:
- two puts started together get …00000001 and …00000002, and both read back with their text and checksum;
- the index lists both;
- a put whose commit fails (failNextCommit) answers write-failed, and the put queued behind it still succeeds;
- a remove and a put together, then a remove whose commit throws (rejected), and the put behind it still succeeds.

**Proof:** mutant (put calls `putNow` directly, no chain) fails with "expected 'shelf-baseline-00000001-tab1' to be 'shelf-baseline-00000002-tab1'". Both puts chose sequence 1, and the second record replaced the first in the index, leaving the first record orphaned.

### 4. DONE: the dropped-notebook message names everything a dropped notebook loses

**Change**
- src/persistence/notebook.ts:98: "This dish's notebook (favorites, story cards, goals, bookmarks, gallery, challenges and its Try my dish turn) could not be read, so it was left out. The dish itself loaded."
- The UI copy now imports the constant: src/ui/strings/favorites.ts:7 and :39 (`dropped: NOTEBOOK_DROPPED_TEXT`). The UI already imports values from @persist/notebook (FavoriteFollow.tsx), so this pulls in no new persistence code.

**Pins updated:** tests/persistence/notebook.test.ts:288 and tests/ui/favorites.test.ts:512. notebook.test.ts also gains a check that the text contains one word per kind.

**Proof:** mutant m4 (the old text): 15 tests in notebook.test.ts fail.

### 5. DONE: one record with every kind at its limit, in a real save file. The margin is thin.

**Test:** tests/persistence/bookmarks.test.ts:263, "size: every kind at its limit in one record". All counts come from the code's constants, not literals:
- bookmarks: BOOKMARKS_MAX, titles and summaries at their limits in astral-plane characters, SHELF_LIMITS.snapshot snapshot references;
- gallery: GALLERY_MAX entries × GALLERY_SPRITES_MAX sprites × GALLERY_SUMMARY_LINES lines of GALLERY_LINE_MAX astral characters;
- favorites: FAVORITES_ACTIVE_MAX followed families sharing AGENT_CAP members, plus FAVORITES_UNPINNED_MAX × UNPINNED_MEMBERS_KEPT;
- STORIES_MAX familyChanged cards, GOALS_MAX goals, CHALLENGES_MAX challenges, and TURNS_MAX turns with a challenge.

The test builds the save with `buildSaveFile`. It asserts that the written notebook's canonical length (UTF-16 units, the measure `notebookProblem` compares) is under NOTEBOOK_MAX_BYTES, and that `notebookProblem` returns null.

**Assumptions, stated in the test's comment:**
- Followed families together hold at most AGENT_CAP members.
- A story card holds what src/worker/stories.ts onBranch writes:
  - texts as long as this build's content can make them;
  - the generator's key and its two evidence ids;
  - module changes between two genomes of at most 3 modules each, with the cost keys a registry module actually defines (at most 3);
  - foods taken from foodPriority.
- The test defines GENOME_MODULES_MAX = 3 itself, because src/sim/genome.ts exports no constant for it.

**Measured:** 1,021,268 of 1,048,576 (97.4 %); 1,151,468 bytes as UTF-8.

| Kind | Size |
|---|---|
| favorites | 228,269 |
| stories | 218,351 |
| goals | 11,641 |
| turns | 1,645 |
| bookmarks | 35,291 |
| gallery | 510,001 |
| challenges | 15,821 |

**Finding for the lead, not fixed (outside my files):**
- With story cards bounded only by the validator (every text at 200 units, 16 evidence ids, every cost key), the same record measured 1,559,618 (148.7 %).
- So the cap holds only because the generator writes less than the validator allows, and by a margin of about 27 KB.
- Nothing checks the size at write time. A notebook over the cap would be written, then dropped whole at the next load.
- PROPOSED DECISION (owner of saveFile/host): check the notebook's size at write time and refuse the notebook edit that would cross the cap, or lower one limit (the gallery is half the budget). Keep this test as the tripwire.

**Proof:** mutant m5 (NOTEBOOK_MAX_BYTES = 1000 × 1000): the test fails.

### 6. DONE: old saves load with every newer kind empty, in one named test

**Change:** bookmarks.test.ts:189 is renamed "old saves load with every new kind empty: …". A helper, `expectNewerKindsEmpty`, checks favorites, goals, stories, turns, bookmarks, gallery and challenges, apart from the kinds that save itself carries:

| Save | Kinds it carries |
|---|---|
| g2 | none |
| wave 5 | favorites |
| stage 1 | turns |

**Proof:** a scratch mutation that passes [] for the stage 1 save, which does carry a turn, makes the test fail. The helper is not vacuous.

### 7. DONE: the false "Your saves are not changed." is gone

**Change:** src/ui/strings/variantPair.ts:44 now reads "Closing discards the two copies and opens “{title}” paused at 0:00, as it starts." A comment cites the ruling: Continue is autosaved on completion, and the start may keep the open dish in a slot. No other variant-pair line claims saves are untouched. The refusal comment in worker/variantPair.ts is about refusals and is true.

**Pin:** tests/e2e/variants-paired.spec.ts asserts the new sentence and that "saves are not changed" is absent.

**Proof:** e2e mutant m7 (the old sentence), desktop: fails with `not "saves are not changed"`.

**Outside my files (CompareSetup.tsx:101):** the ordinary comparison's "Your dish and your saves are never changed by it." is not literally true either, because the completion autosave rewrites Continue (with the unchanged source dish). Lead: reword it.

### 8. DONE: the views of a variant pair use the toggle's words

**Change**
- src/ui/views/CompareViewport.tsx:56-67: when `compareState.variantPair` is set, the titles are "A · Garden" and "B · {idea title}".
- The aria labels are "Dish A: the unchanged Garden" and "Dish B: {title}, the Garden with this idea’s one change". The strings are in src/ui/strings/variantPair.ts:30-31.
- Ordinary comparisons are unchanged.

**Pin:** variants-paired.spec.ts checks both labels, both aria labels, and that neither view contains "your change" or "baseline". It passes on desktop and phone-portrait.

**Proof:** e2e mutant m8 (`pair` forced to null), desktop: fails with Expected "A · Garden", Received "A · baseline".

**Note:** CompareViewport's tap toast, "A is the baseline…", is unreachable in a pair (PairSetup offers no placement tool, and the arms refuse commands), so it was left alone.

### 9. DONE: Lab commands reach the listeners through one helper

**Change**
- src/ui/state.ts:1083 adds `reportDishCommand(dishId, payload, res)`, the one place that runs the onDishCommand listeners. `sendCommand` uses it.
- src/ui/views/LabView.tsx:285 `sendLabCommand` calls it as soon as a result arrives.

**New test file:** tests/ui/narration-wiring.test.ts. It runs the real `wireNarration` and `sendLabCommand`, with stand-ins for document/window, Worker and the speech call, plus a stand-in client. It shows:
- an accepted placeObject speaks `addFood` once;
- a refused one (accepted 0) speaks nothing;
- the prompt machine's inputs are exactly the two placeObject commands, and `promptReduce` leaves its state equal to the start state. The control: a deposit does change that state.

**Proof:** mutant m9 (the LabView call commented out): 1 failed | 2 passed.

### 10. DONE: the narration note no longer claims the same words are shown

**Change:** src/ui/strings/narration.ts:10 now reads "… It never reads numbers or names. What it says is always shown on screen too. Uses the voice volume."

**Pin:** tests/e2e/narration.spec.ts asserts the whole note. It passes on desktop and phone-portrait.

**Proof:** e2e mutant m10 (the old sentence), desktop: fails.

### 11. DONE: Space typed into a text field is not a Pause

**Change:** src/ui/narration.ts:142 adds `spaceRequestsPause(e, route, speed)`. It ignores any target inside input, textarea, select or `[contenteditable]` (not "false"), and any target with `isContentEditable`. The keydown listener at :293 uses it.

**Tests**
- Unit, tests/ui/narration-evidence.test.ts:228: "Space typed into a text field is not a Pause request".
- Wiring, narration-wiring.test.ts: Space in a textarea, then a pause, speaks nothing; Space on the canvas, then a pause, speaks `pause`.

**Proof:** mutant m11 (the editable checks removed): both tests fail.

### 12. DONE: one division is spoken at most once

**Change**
- `splitRecordOf` now returns the division's identity as a key: '<birthId>@<deathTick>'.
- `SplitMemory` (narration.ts:126) remembers the divisions already shown, per dish.
- wireNarration's view (:249) offers only a division not yet heard.
- `step` (:261) remembers a division once it is shown as new, whether or not narration spoke it.

**Tests**
- Unit, narration-evidence.test.ts:207: open, close and reopen the inspector three times, and `cellSplit` fires once. Another dish, or another death tick, counts as a new division. The old pins are updated to the key form.
- Wiring, narration-wiring.test.ts: the real wiring with the sheet toggled shows `['cellSplit']` once; another organism's division adds a second.

**Proof:** mutant m12 (the view without memory): the wiring test fails.

### 13. DONE: Finish clears a kept turn's kept flag

**Change:** src/worker/host.ts:1313 and :1316. The 'tryFinish' case takes `keptTurnMark` after `turnHorizon`, before the goal leave and the state change. It calls `turnEdited` before posting its answer, so the answer already carries `kept: null`.

**Test:** tests/worker/try-dish-host.test.ts:519, "wave 6b integration: Finish on a kept turn clears kept (D-0084)…":
- **Kept turn at its horizon:** the keep plan before Finish is `{kind:'saved', slotId:'slot1'}`. After Finish the answer and the record are `{state:'finished', kept:null}`, and the store is byte-for-byte unchanged.
- **Unkept turn:** the only message after Finish is the 'tryTurn' answer, equal to the turn with `state:'finished'`. The notebook equals the one before except for that state, and the store is unchanged.

**Proof:** mutant m13 (the `turnEdited` call commented out): the test fails.

**What the player sees**
- Finish closes the horizon card (src/ui/tryDish.ts finishTurn → closeCard), and that card was the only place showing "Kept in Slot n." So no kept line is shown before or after this change, and a reload of this dish no longer carries a stale `kept`.
- Leaving the dish now gets keep plan `{kind:'slot', slotId:'slot1', own:true}`: the leave prompt offers to keep it in its own slot. slot1 holds the turn at its horizon (still "atHorizon"), and the dish now differs ("finished", and for a challenge a left goal).
- This is right under D-0033 and D-0084: the slot no longer holds the dish exactly. The plan is decided by holdsExactly on the notebook, so it was the same before this change. What changed is that the record no longer contradicts it.

PROPOSED DECISION: Finish counts as a notebook edit for D-0084, like every other accepted notebook change.

### 14. DONE: a comment explains why sharing one World is safe

**Change:** src/worker/host.ts:1919-1921 says the B arm and the idea dish hold the same World object until B is realized, and why that is safe:
- the arms refuse every command (armCommand);
- the idea dish is never stepped or commanded while the comparison is open;
- B gets its own world when it is realized (variantPairBindB).

No behaviour changed.

## Files changed
- src/ui/storage.ts, src/ui/strings/notebookTools.ts, src/ui/views/StoragePanel.tsx (comment)
- src/persistence/shelf.ts
- src/persistence/notebook.ts (NOTEBOOK_DROPPED_TEXT and its comment only), src/ui/strings/favorites.ts (the `dropped` line and its import)
- src/ui/strings/variantPair.ts, src/ui/views/CompareViewport.tsx
- src/ui/state.ts (`reportDishCommand`; `sendCommand` uses it), src/ui/views/LabView.tsx (`sendLabCommand` and its import)
- src/ui/strings/narration.ts, src/ui/narration.ts
- src/worker/host.ts (the 'tryFinish' case and one comment in variantPairStart)
- Tests:
  - tests/ui/storage.test.ts
  - tests/persistence/shelf.test.ts
  - tests/persistence/notebook.test.ts
  - tests/ui/favorites.test.ts
  - tests/persistence/bookmarks.test.ts
  - tests/ui/narration-evidence.test.ts
  - tests/ui/narration-wiring.test.ts (new)
  - tests/worker/try-dish-host.test.ts
  - tests/worker/bookmarks-host.test.ts (one pin of the shelf text)
  - tests/e2e/variants-paired.spec.ts
  - tests/e2e/narration.spec.ts

## Commands
| Command | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npx eslint` on the 24 changed source, test and spec files | exit 0 |
| `npx vitest run` on these 17 paths (20 files): tests/fixtures/g2-replay.test.ts, tests/fixtures/trajectory-fence (4 files), tests/ui/storage.test.ts, tests/persistence/shelf.test.ts, tests/persistence/notebook.test.ts, tests/ui/favorites.test.ts, tests/persistence/bookmarks.test.ts, tests/ui/narration-evidence.test.ts, tests/ui/narration-wiring.test.ts, tests/worker/try-dish-host.test.ts, tests/worker/challenge-host.test.ts, tests/worker/bookmarks-host.test.ts, tests/worker/variants-paired-host.test.ts, tests/sim/view-switch.test.ts, tests/ui/prompts.test.ts, tests/audio/narration.test.ts, tests/ui/try-dish.test.ts | Test Files 20 passed (20), Tests 223 passed (223), exit 0 |
| `npx vitest run tests/ui/narration-evidence.test.ts tests/ui/narration-wiring.test.ts`, after the lint fixes | 2 passed, 22 tests |
| `E2E_PORT=4285 E2E_OUTDIR=tmp/dist-code-minors-6b npx playwright test` with bookmarks-gallery, variants-paired, narration and try-dish specs, `--project=desktop --project=phone-portrait` | 12 passed, 2 failed (in my new assertion: strict mode on a 2-element locator) |
| Same command, variants-paired.spec.ts only, after fixing that assertion | 4 passed (3.5m), exit 0 |
| Mutants m1, m2, shelf-chain, m4, m5, m6, m9, m11, m12, m13 (vitest); m7, m8, m10 (playwright, desktop) | each fails as described above; each file restored byte-for-byte (cmp) |

Port 4285 was stopped before and after every Playwright run (`lsof -t -i :4285 | xargs -r kill`). No command is still running.
