# g4-wave-6b wave verify 1: observation-notebook and challenge-editor

Verifier: adversarial wave verifier, 2026-10-12. Read-only except this file. Scratch: tmp/verify-g4-wave-6b-0/.

**Verdict: ok = false.** One MAJOR finding: a finished challenge turn is described to the player as "an ordinary dish", but it still refuses commands.

## Commands run in this session

| Command | Result |
|---|---|
| `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/persistence/bookmarks.test.ts tests/worker/bookmarks-host.test.ts tests/ui/gallery.test.ts tests/ui/storage.test.ts tests/worker/challenge-host.test.ts tests/ui/challenge.test.ts tests/persistence/challenge-export.test.ts tests/persistence/notebook.test.ts` | Test Files 14 passed (14), Tests 121 passed (121), exit 0 |
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npx eslint` on the 15 new files plus src/worker/host.ts | exit 0 |
| Scratch probe `tmp/verify-g4-wave-6b-0/finish.test.ts` (scratch config, real DishHost) | passed; output quoted under the MAJOR finding |

No e2e run: the problems found are proven at host level, and the copy problems are proven by reading the code.

## Problems (most severe first)

### MAJOR [challenge-editor] src/worker/challenge.ts:118-121, src/ui/panels/TryBadge.tsx:13, src/ui/strings/tryDish.ts:56: a finished challenge turn still refuses commands

**What is wrong**
- After Finish, the player sees "Turn N finished. The dish stays open, paused, as an ordinary dish."
- The Challenge badge disappears, because TryBadge returns null when the state is 'finished'.
- `challengeOf` still returns the turn's challenge whatever the turn's state, so the host keeps refusing tools and the action budget.
- The player gets refusals that say "only inside this challenge" on a dish the UI has just called ordinary, with no badge to explain them.
- This breaks two rules:
  - SPEC §13.5: "restrictions apply only inside that challenge".
  - CLAUDE.md "Honest labels": the visible claim does not match the state.
- The builder listed "A challenge turn stays restricted after Finish" as a proposed decision. That decision does not cover the false toast or the vanished badge.

**Repro** (scratch test, real DishHost)
1. Save the Feed-only challenge (budget 2) and start it.
2. Send `tryFinish`. The turn state becomes `finished`, and the challenge is still on the record.
3. Add Life is refused: "This challenge doesn't allow Add Life. The limit applies only inside this challenge."
4. The third feed is refused: "This challenge's 2 actions are used."

**Fix:** either make Finish end the limits (`challengeOf` returns null when `state === 'finished'`), or keep the limits and change both the Finish copy and the badge to say so. This needs an owner ruling.

### MINOR [lead] src/ui/storage.ts:76-86, src/ui/strings/notebookTools.ts (confirmBaseline), src/worker/host.ts challengeSave: challenge starting points are mislabelled in Storage

**What is wrong**
- challenge-editor stores challenge baselines on the shelf as kind 'baseline', with `createdFor: 'ch-n'`.
- The Storage panel lists them under "Try my dish starting points".
- Remove asks "Remove this starting point? Turns already played stay; Another turn will be unavailable."
- The question does not say that the challenge can then no longer be started or exported from this device. The challenge-editor and observation-notebook reports both say this confirmation must name what goes and what stays (D-0082).

**Repro:** the scratch probe printed `shelf row baseline ch-1 -> Remove this starting point? Turns already played stay; Another turn will be unavailable.`

**Fix:** use a separate confirmation when `createdFor` starts with `ch-`.

### MINOR [challenge-editor] src/worker/challenge.ts:96-103: the budget counts more than D07 says

**What is wrong**
- D07 line 107 says: "Challenge allowances count successful placements and external loads … Configure and inspect are free."
- The budget also counts Lid, Evolution settings, Clean water and habitat edits.
- `setLid` always returns accepted 1 (src/sim/commands.ts:119), so setting the lid to the state it is already in uses up an action.

**Owner decision:** this is listed as a PROPOSED DECISION. At least a lid command that changes nothing should probably be free.

### MINOR [observation-notebook] tests/persistence/bookmarks.test.ts:196-222: the worst-case size test leaves out the other notebook kinds

**What is wrong**
- The test measures 50 bookmarks + 100 full gallery entries + 3 followed favorites: 581,944 bytes (builder's figure).
- It leaves out the other kinds that share the same 1 MB `NOTEBOOK_MAX_BYTES` cap:
  - 20 unpinned favorites × 200 members (FAVORITES_UNPINNED_MAX / UNPINNED_MEMBERS_KEPT);
  - 50 story cards;
  - 20 goals;
  - 20 challenges;
  - a turn.
- Nothing checks the size when the notebook is written (saveFile.ts buildSaveFile). A record over the cap is dropped whole at the next load: favorites, bookmarks, gallery and challenges together.
- My estimate for every kind at its limit is about 0.78 MB, so it probably holds, but nothing measures it. The 100-entry gallery is the largest single part.

**Fix:** measure every kind at its limit in one record.

### MINOR [challenge-editor] src/worker/host.ts: host edits go beyond the "one refusal line" SHARED allowance

**What is wrong**
- The assignment allowed one refusal line in the host. The builder also changed:
  - `openTurn` (now takes an optional challenge and its definition);
  - `tryNext` (passes the challenge on);
  - the `goalStart` case (accepts `CHALLENGE_n`);
  - and added the `challengeBlocked` message.
- The assignment did invite "its own small additive host entry point (say which)". The edits are additive, labelled P4.8c, and disclosed in the report, and the fence tests pass.
- This is recorded for the lead's ownership audit, not as a defect.

### NOTE [observation-notebook] src/ui/panels/Inspector.tsx saveToGallery: picture and summary lines can come from different ticks

- The gallery entry's `tick` and picture come from the latest snapshot.
- Its summary lines come from the inspector answer on screen, which can be a few ticks older if the dish is running.
- This is harmless, but the entry's time line refers only to the picture.

## VERIFIED OK

### Fence and determinism
- **Fence:** g2-replay, the four trajectory-fence files and conservation-closed-lid pass (run above).
- **No sim changes:** nothing under src/sim/ or content/ changed (`git status`). No manifest or version field was edited.
- **No new randomness or state hashing:** no Math.random, Date or new hashing anywhere in the sim.

### observation-notebook (P4.8 part b)
- **Bookmark record and limits:**
  - Ids are 'bm-n'. Titles are ≤ 60 characters and cleaned; summaries are ≤ 200.
  - The 51st bookmark is refused with the exact copy (notebookBookmarks.ts; bookmarks-host test).
  - Snapshot references need the shelf id pattern and a sha256 checksum.
- **Snapshot written before the bookmark:** host.ts bookmarkAdd writes `shelf.put` before the notebook entry.
  - A refused or failed write returns before anything is added.
  - A record written for a dish that closed, or whose bookmarks filled meanwhile, is taken back.
  - Tests compare the whole store and notebook before and after (21st snapshot; `failNextCommit`).
- **Opening a snapshot bookmark:**
  - It opens as `branchWorldId` / `branchName` / `favoritesOnly` after `keepFirst`.
  - stateHash equals the hash at bookmarking, under a new world id.
  - A gone or failed snapshot answers 'bookmarkGone' with the SPEC copy, and the bookmark is then shown as "Text only — not replayable" (NotebookBookmarks.tsx).
- **Gallery record:**
  - At most 100 entries per dish, 200 sprites per crop, and 4 summary lines of ≤ 120 characters.
  - An unknown field such as `genome` is refused.
  - The host checks the entry's species, birth id and tick against the dish.
  - The picture is redrawn from the crop through an additive `composePicture` option (picture.ts diff is additive).
- **Gallery never spawns:**
  - gallery.ts imports no state or command path.
  - The view has only Delete…, its confirmation and Keep.
  - The behaviour test shows an unchanged stateHash, command log, birth counter and no 'introduce' event.
  - The worker galleryAdd / galleryDelete / bookmarkDelete case is notebook-only.
- **Notebook tabs:** they follow UX §2 order (… Journal · Bookmarks · Gallery · Experiments), with the two no-dish messages word for word.
- **Storage panel:**
  - The five groups have sums, and each named slot includes its previous copy.
  - Remove appears only on checkpoints and shelf records, and always asks once.
  - The worker's `storageRemovable` refuses named slots and Continue, and the test shows the store is unchanged.
  - D-0084's release condition is exercised through the panel's own Remove path.
- **Notebook state, not world state:**
  - Both kinds survive Undo and rollback, and Duplicate and branches copy neither.
  - Both are written with `localSave`, and "without names" strips bookmark titles and snapshot references.
  - "Never alters behaviour" holds: 50 bookmarks + 100 gallery entries vs none, 3,200 ticks at 4×, with a save → load: equal stateHash and full trajectory digest.
- **Malformed records and old saves:**
  - All six malformed cases drop the notebook and the world loads with an equal stateHash.
  - g2, wave 5 and stage 1 saves load with both kinds empty.

### challenge-editor (P4.8 part c)
- **Refusals never reach the world:** `challengeRefusal` runs before `applyNow` in the 'command' case.
  - A refused command leaves the hash and `nextSeq` unchanged, and the UI's placement ring and toast only follow a non-null result (state.ts reportCommand).
  - Outside a challenge it returns null; comparison arms and the transient Continue copy are never restricted.
  - Every counted command kind sets `cmd.result` (commands.ts), so the accepted > 0 filter cannot leave a counted kind free by accident.
- **Budget:**
  - It is read from `world.commands.log` with `seq >= startSeq` and accepted > 0, so Undo gives one action back.
  - A deposit that placed nothing is free.
  - The builder's three mutants of challenge.ts each fail tests.
- **Free actions and the copy:** names, pins and read-only queries are free. Duplicate copies neither the turn nor the challenges, so the unrestricted copy accepts everything while the turn stays restricted.
- **Objective evaluated, not enforced:** the challenge goal completes at the same tick and value as SEE_SPRINTER_SPLIT from content (D-0071).
- **Typed values only:**
  - Editor drafts become typed values only (ui/challenge.ts draftToInput; 16 bad drafts refused).
  - The record validator refuses 'custom', non-finite numbers, budgets of 0 or 100, unknown tools, free-form masks, script fields and 21 records.
  - transferAcrossGate is disabled with "This dish has no gate to measure."
- **Export and import:**
  - The export keeps id, region and numbers.
  - The file's checksum equals `baseline.checksum`.
  - The imported dish starts on another device; a dish that ran on is refused with the exact "changed" copy.
- **Restrictions before Start:** the summary is shown before Start (ChallengeStart; D09 line 134), with the summary text word for word.
- **Never alters behaviour:** three saved challenges vs none, and a challenge turn vs a plain copy, over 3,000 ticks at 4× with save → load: equal stateHash and full trajectory digest.
