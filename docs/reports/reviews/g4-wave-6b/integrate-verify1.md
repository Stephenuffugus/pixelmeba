# Wave 6b integration: adversarial verify 1

Verifier: integrate-verify-6b-1, 2026-10-12. Scope: the difference between 5b3e1e7 and the working tree (tree 2c77383, computed with the temporary-index recipe), for src, tests and docs/ARCHITECTURE.md. That covers both fixers (code-minors-6b, docs-a11y-6b) and the lead's items (a)–(d) of D-0090.

I edited no repository file except this report. My scratch files are in tmp/integrate-verify-6b-1/. Between the start and the end of this run the tree changed only in docs/DECISIONS.md, docs/agent/RESUME.md and docs/agent/g4-wave-7.tasks.js.txt (the lead's files); no src or tests file changed.

**Result: ok = true.** There is no BLOCKER or MAJOR. I found 3 MINOR and 3 NIT problems.

## Problems (most severe first)

MINOR [lead] src/worker/host.ts:2988-3030 (challengeStart) and src/ui/storage.ts:52-55 — D-0090 covers new saves only. A challenge that shares a Try my dish record is never moved to a record of its own.
- **Saves from the wave 6b build before this fix:**
  - The old challengeSave shared the 'try-1' record.
  - The current build lists that record under "Try my dish starting points", with the question "Remove this starting point? Turns already played stay; Another turn will be unavailable." The question does not name the challenge.
  - challengeStart finds the 'try-' record (the lookup without ownOnly) and starts from it. It never writes a 'ch-' record, so the challenge keeps depending on a row whose question says nothing about it.
  - After the player removes that row, Start and Export work again only from a dish that is still at that moment, or from the challenge file.
- **The same path in a new save:**
  - Suppose the 'ch-' record is removed while a 'try-' record with the same checksum exists.
  - Start then uses the 'try-' record silently, and no 'ch-' record is written.
  - The challenge question ("To start or export one of these challenges again, import its challenge file, or open its dish while it is still at this moment") is then more cautious than the code, which is harmless.
- **Why MINOR:** the wave 6b build never shipped, so only development saves are affected, and nothing is lost that the file or origin dish cannot restore.
- **Fix:** when Start finds only a non-'ch-' record, also write a 'ch-' copy (subject to the limit), or keep ownOnly for Start's choice of shelfId.
- **Repro:** tmp/integrate-verify-6b-1/old/tests/gen-old.test.ts (the pre-integration tree, from `git archive 5b3e1e7`) writes the saves. tmp/integrate-verify-6b-1/load-old.test.ts loads them in the current tree. Output:
  - "OLD-SAVE storage: [Try my dish starting points] try-1 -> Remove this starting point? Turns already played stay; Another turn will be unavailable."
  - "start with only try- record -> challengeStarted shelf-baseline-00000001-…"
  - "shelf after that start: baseline:try-1, snapshot:bm-1"
  - after the removal: "export from the challenge turn dish after removal -> challengeRefused The saved starting point for this challenge is not on this device…"

MINOR [lead] docs/ARCHITECTURE.md:367-369 (§7) and :725-728 (§11.2) — after D-0090, two statements about sharing are false.
- Both still say challengeSave shares "a baseline with the same state checksum [that] is already on the shelf / held". The code (host.ts:2945, `challengeBaseline(…, true)`) shares only a 'ch-' record. A 'try-' record with the same checksum is never shared; a second record is written instead.
- §11.2:734-736, "Start and Export then work only from an open dish still at that moment (or the imported challenge file)", is also not literally true: a 'try-' record with the same checksum still serves both.
- **Repro:** compare those lines with host.ts:2914-2945. tests/worker/challenge-host.test.ts "D-0090" shows two records (`['ch-1','try-1']`) for one moment.

MINOR [lead] tests/persistence/bookmarks.test.ts:262-266 and :337-342 (the comment on NOTEBOOK_MAX_BYTES at src/persistence/notebook.ts:26-31) — the worst-case test's stated assumption is false. The 2 MiB cap still holds.
- **The assumption:** "followed families together hold at most AGENT_CAP living members".
- **Why it is false:**
  - A family's root is its oldest *retained* ancestor (src/worker/snapshot.ts buildFamily).
  - Once lineage compaction drops the first root, following a descendant gives a different root.
  - The `already` check (src/worker/favorites.ts:621, same rootBirthId) then allows it. So three nested followed families can each hold up to AGENT_CAP members. The wave 5a comment this one replaced said "three nested active families of up to 6,000".
- **Measured** with each followed family at AGENT_CAP (tmp/integrate-verify-6b-1/nested.test.ts, a copy of the test with only that change):
  - generator texts: 1,285,268 of 2,097,152 (61.3 %);
  - story texts at the validator's bounds: 1,647,868 (78.6 %).
  - Both are under the cap. The wide case is under the 80 % tripwire by only 1.4 points, while the test reports 1,383,868 (66 %).
- **Answer to lead item (a):** I found no write path that can exceed 2 MiB. Every kind's count and text are bounded by its validator or limit, and the nested-favorites worst case is 1.65 M.
- **Fix:** model nested families (FAVORITES_ACTIVE_MAX × AGENT_CAP) in the test and correct the comment in the test and in notebook.ts.

NIT [lead] src/ui/panels/CompareSetup.tsx:101 and src/ui/views/ExperimentRun.tsx:281 — no test pins the corrected sentences, so the false "and your saves" could return unnoticed. Both new sentences are true:
- compareStart only pauses the source dish. Its speed is restored when the comparison closes, and compareDelete removes only the arms.
- The experiment's copies never write to the experiment's dish; experimentStamp is a UI record.
- **Repro:** `grep -rn "never changed by" tests` finds nothing.

NIT [docs-a11y-6b] docs/ARCHITECTURE.md:723 — "(`src/persistence/shelf.ts` unchanged)" is false for the integrated tree.
- Writes are now serialized (`serial`), and SHELF_TEXT names the kind and points to Saved dishes → Storage.
- The two fixers ran in parallel, so this was true when it was written.

NIT [docs-a11y-6b] docs/ARCHITECTURE.md:349-350 — "`bookmarkDelete`, `galleryAdd` and `galleryDelete` on a comparison copy answer `notebook.refused`" leaves out the transient Continue copy, which host.ts:1298 also refuses (`d.arm || d.transient`).

## Lead items (a)–(d)

**(a) NOTEBOOK_MAX_BYTES 2 MiB: correct.**
- notebook.ts:33 = 2 × 1024 × 1024. ARCH §11.2:548 says 2,097,152.
- The bookmarks test checks the wide case is under 80 %. A load-time mutant back to 1 MiB fails it: "expected 1383868 to be less than 838860.8".
- No test, text or document still assumes 1 MiB. The grep found only unrelated 1024 × 1024 uses (sizeText, the recipe sniff, share.ts).
- The only gap is the nested-favorites assumption (MINOR above).

**(b) Copy: correct.** Both sentences are true (see the NIT above).

**(c) challengeBaseline(c, ownOnly) and challengeSave: correct for new saves.**
- A mutant that drops `true` at host.ts:2945 fails "D-0090" (1 failed).
- Walk, removing either record:
  - **Removing 'try-1'** leaves the challenge startable from 'ch-1' (the test).
  - **Removing 'ch-1'** while 'try-1' exists: Start and Export still work through 'try-1'.
  - **Removing both:**
    - From the origin still at that moment, Start works and writes a new 'ch-1'.
    - From a dish not at that moment (the challenge turn dish), Export answers noBaseline and Start answers changed.
- Old saves: see the first MINOR.

**(d) SHELF_REMOVE_REFUSED: correct.**
- store.ts:115 names Try my dish, challenge starting points and snapshot bookmarks.
- A mutant restoring the old text fails shelf.test.ts "fix round 1: SaveStore.remove refuses a shelf id" (1 failed | 8 passed).

## code-minors-6b items (all 14 confirmed)

- **1. VERIFIED.**
  - The groups split on `createdFor` 'ch-'. Mutant: `baselineWrittenFor` always 'tryDish' → storage.test.ts 3 failed | 2 passed.
  - Walking the sentence against challengeStart and challengeExport shows it is true:
    - "Challenges stay in their dishes": true.
    - "turns already played stay": true.
    - "Another turn will be unavailable": true. openTurn reads turn.baseline.shelfId.
    - "import its challenge file, or open its dish while it is still at this moment": true. My walk shows Export and Start refused from a dish not at that moment, and Start accepted from the origin at that moment.
  - It is over-cautious only when a 'try-' record shares the checksum (first MINOR).
- **2. VERIFIED.** The text is true for both callers and names Saved dishes → Storage. The bookmarkAdd regex still reads the detail in the one pair of parentheses.
- **3. VERIFIED.**
  - Mutant: put without `serial` → "two puts" fails (1 failed).
  - Deadlock check:
    - No serialized write calls another serialized write. putNow calls only check/nextSequence/backend; removeNow calls only backend.
    - bookmarkAdd's take-back `shelf.remove` runs after its put resolves.
    - The host has one Shelf (host.ts:429).
  - Swallowing check:
    - putNow returns every error as a ShelfResult.
    - removeNow's rejection reaches the caller (`return run`). The test shows it rejects and the next put goes through.
    - `this.writes = run.catch(…)` only prevents an unhandled rejection: a mutant without it still passes, because `then(write, write)` already runs the next write after a failure. That is not a defect.
- **4. VERIFIED.** The UI imports the persistence constant. Mutant with the old text → notebook.test.ts 15 failed.
- **5. VERIFIED, with the assumption problem above.**
- **6. VERIFIED.** The helper checks every newer kind. The old-save load in my walk also passes.
- **7. VERIFIED.** variants-paired.spec, desktop: pass. It asserts the new sentence and that the old one is absent.
- **8. VERIFIED.**
  - e2e mutant (`pair` forced to null), desktop: fails, Expected "A · Garden", Received "A · baseline". Restored and checked with cmp.
  - The unmutated spec passes.
- **9. VERIFIED.**
  - Mutant (the LabView call commented out) → narration-wiring 1 failed.
  - The other onDishCommand listener, NoticeHost's prompt machine, resolves 'feed' only on 'deposit' (prompts.ts:186), so Lab commands cannot advance it.
  - Both 'object:' materials (M10 Slow feeder pellet, M11 Leaf wafer) are food, so "Add food" is true.
- **10. VERIFIED.** narration.spec, desktop: pass.
- **11. VERIFIED.** Mutant (the closest() check removed) → 2 failed.
- **12. VERIFIED.**
  - Mutant (the view without SplitMemory) → the wiring test fails.
  - A division is remembered when shown, even with narration off, so turning narration on later does not speak an old division.
- **13. VERIFIED.**
  - Mutant (turnEdited commented out) → try-dish-host "Finish on a kept turn" fails.
  - keptTurnMark compares content, so a repeated Finish clears nothing.
- **14. VERIFIED.** The change is a comment only.

## docs-a11y-6b items

- **1 (§7). VERIFIED** against src/worker/protocol.ts. Every message name, field and answer matches:
  - bookmarkAdd {title, snapshot, event}; BookmarkEventRef {tick, type, species, cause, text}; bookmarkOpen keepFrom;
  - storageInfo {storage, removed?}; challengeStart check → challengeChecked;
  - challengeBlocked {dishId, message} after an ack with an error;
  - variantPairStart {variantId, newDishId, compare{compareId, aDishId, bDishId}, sequential, keepFrom?};
  - the ComparisonVariantPair fields (variantPair.ts:39-62); PROTOCOL_VERSION 2.
  - Exceptions: the sharing sentence (lead MINOR) and the transient NIT.
- **2 (§11.2). VERIFIED.** The exceptions are the sharing sentence, "shelf.ts unchanged", and the removed-baseline sentence.
- **3 (§10.3). VERIFIED** against src/audio/narration.ts:
  - NARRATION_REPEAT_MS 10,000, NARRATION_QUEUE_MAX 2, UTTERANCE_TIMEOUT_MS 5000;
  - lang 'en', rate 1;
  - the refusal order: off, silent, noGesture, held, noVoice, repeat, queued, full;
  - narrationVolume = busGains(p).voice;
  - PAUSE_GESTURE_MS 3000;
  - RULES addLife/addFood/followFamily/saved/undoRewinds.
- **4 (a11y-screens "wave 6b"). VERIFIED.** It passes on desktop with axe serious/critical clean. The header comment matches what the other specs scan.

## Saves written by the wave 6b build before this integration

The pre-integration tree (`git archive 5b3e1e7` → tmp/integrate-verify-6b-1/old) wrote saves to a MemoryBackend. The current tree loaded them:

| Slot | What it holds | Result |
|---|---|---|
| slot1 | a challenge turn (challenge record, turn.challenge) | loaded |
| slot2 | origin: 1 bookmark with a snapshot, 1 gallery entry, 1 challenge | loaded |
| slot3 | a plain Try my dish turn | loaded |

- No `notebookDropped`.
- bookmarks, gallery, challenges and favorites are equal to the old ones, and the turns are equal apart from `kept`.
- The old snapshot bookmark opens ('loaded').

The integration changed no notebook or shelf format: in src/persistence only the cap, the dropped text, SHELF_TEXT, the write chain and SHELF_REMOVE_REFUSED changed.

## Original repros re-run

- **wave-verify-2:**
  - closeNote: fixed (e2e).
  - CompareViewport labels: fixed (e2e and mutant).
  - Lab placeObject reaches narration: fixed (unit and mutant).
  - narration note: fixed (e2e).
  - split once: fixed.
  - Space in a text field: fixed.
  - shared World: commented.
  - ARCH §7: added.
- **saves-verify-observation-notebook:**
  - dropped text: fixed.
  - size test covers every kind: fixed (assumption MINOR above).
  - shelf collision: fixed (concurrency test and mutant).
- **wave-reverify2:** a challenge baseline shown as a Try my dish starting point. Fixed for new saves (Storage now shows "[Challenge starting points] ch-1"). Old shared records: first MINOR.
- **wave-verify-1** MINOR "challenge starting points mislabelled": the same as above.

## Commands run (summary lines)

- Tree diff with the temporary-index recipe: 37 files changed, 1863 insertions(+), 79 deletions(-).
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/ui/storage.test.ts tests/persistence/shelf.test.ts tests/persistence/notebook.test.ts tests/ui/favorites.test.ts tests/persistence/bookmarks.test.ts tests/ui/narration-evidence.test.ts tests/ui/narration-wiring.test.ts tests/worker/try-dish-host.test.ts tests/worker/challenge-host.test.ts tests/worker/bookmarks-host.test.ts tests/worker/variants-paired-host.test.ts tests/ui/prompts.test.ts tests/audio/narration.test.ts tests/audio/settings.test.ts`: Test Files 19 passed (19), Tests 209 passed (209), EXIT 0.
- `npx vitest run --config tmp/integrate-verify-6b-1/vitest.verify.config.ts -t "every kind at its limit"` (nested favorites): 1,285,268 of 2,097,152 (61.3 %); wide 1,647,868 (78.6 %); 1 passed.
- Mutants via tmp/integrate-verify-6b-1/mutant.sh. Every one was "RESTORED byte-for-byte" (cmp).

  | Mutant | Test run | Result |
  |---|---|---|
  | c-ownOnly | challenge-host -t D-0090 | 1 failed |
  | d-refused | shelf.test.ts | 1 failed, 8 passed |
  | a-cap | bookmarks.test.ts | 1 failed, 12 passed |
  | f3-chain | shelf -t "two puts" | 1 failed |
  | f3-catch | shelf -t "two puts" | passed (not a defect; see item 3) |
  | f13-finish | try-dish-host | 1 failed |
  | f1-group | storage.test.ts | 3 failed, 2 passed |
  | f9-lab | narration-wiring | 1 failed, 2 passed |
  | f11-space | narration-evidence + narration-wiring | 2 failed, 20 passed |
  | f12-split | narration-wiring | 1 failed, 2 passed |
  | f4-dropped | notebook + favorites | 15 failed, 21 passed |

- `npx vitest run --root tmp/integrate-verify-6b-1/old tests/gen-old.test.ts` (the pre-integration build writes saves): 1 passed.
- `npx vitest run --config tmp/integrate-verify-6b-1/vitest.verify.config.ts tmp/integrate-verify-6b-1/load-old.test.ts`: 1 passed; output quoted above.
- `E2E_PORT=4392 E2E_OUTDIR=tmp/dist-integrate-verify-6b npx playwright test tests/e2e/variants-paired.spec.ts tests/e2e/narration.spec.ts tests/e2e/bookmarks-gallery.spec.ts tests/e2e/challenge.spec.ts --project=desktop`: 7 passed (8.6m), EXIT 0.
- Same port: `npx playwright test tests/e2e/a11y-screens.spec.ts -g "wave 6b" --project=desktop`: 1 passed (1.5m), EXIT 0.
- e2e mutant m8 (tmp/integrate-verify-6b-1/e2e-mut8.sh, variants-paired -g "A smaller meal vs Garden", desktop): 1 failed (Expected "A · Garden", Received "A · baseline"), RESTORED byte-for-byte.
  - tmp/dist-integrate-verify-6b still holds that mutant build. Playwright rebuilds it on the next run.
- `npx tsc -p tsconfig.json --noEmit`: TSC_EXIT 0.
- `npx eslint` on the 29 added or changed src/tests files: ESLINT_EXIT 0.
- Port 4392 was stopped (`lsof -t -i :4392 | xargs -r kill`) before and after every Playwright run. I did not run phone-portrait: no changed selector depends on layout. No command is still running.
