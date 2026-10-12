# Wave 6b integration — docs-a11y-6b

Scope: docs/ARCHITECTURE.md §7, §10.3, §11.2 only, and tests/e2e/a11y-screens.spec.ts. No code under src/ or content/ was changed.

## Items

1. **DONE: §7 worker protocol, "As built, Phase 4 wave 6b" block** (docs/ARCHITECTURE.md:301–391). It uses the names src/worker/protocol.ts actually has:
   - bookmarkAdd/bookmarkDelete/bookmarkOpen, galleryAdd/galleryDelete, storageInfo/storageRemove.
   - challengeSave/challengeExport/challengeStart (`check` gives challengeChecked).
   - variantPairStart. Its answers are variantPairStarted, whatIfRefused or keepRefused.
   - The answers bookmarkGone, challengeSaved/Exported/Checked/Started/Refused, and challengeBlocked. challengeBlocked is unsolicited and is posted after the refused command's ack `{result null, error}`.
   - ComparisonState.variantPair (ComparisonVariantPair fields) and TurnRecord.challenge.
   - The answer to storageInfo/storageRemove is the message `storageInfo {requestId, storage: StorageInfo, removed?}`. The assignment's "storageInfo → storage" is the `storage` field, not a message type.
   - Prose covers: refusal paths, including which ones are the generic `error` (storageRemove of a named slot or the autosave, bookmarkOpen of an unknown id or a used newDishId, storageInfo without a store); the shelf writes; keepFirst actions; the challenge command refusal before applyNow; tryFinish leaving the challenge goal (tryTurn, then notebookChanged goal); the variant-pair checks, the sequential mode and the arms' refusals. PROTOCOL_VERSION stays 2.
   - Proving check: every statement was read from src/worker/protocol.ts, host.ts (handlers at 698–715, 872, 1283–1316, 1846–2000, 2881–3160), challenge.ts, variantPair.ts and storage.ts in this session. A doc change has no failing-test form.
2. **DONE: §11.2 save format, "As built, Phase 4 wave 6b"** (docs/ARCHITECTURE.md:646–736). It covers:
   - The kinds 'bookmarks', 'gallery' and 'challenges': their fields, limits (50/100/20), validation and world checks.
   - What Undo/rollback (unchanged), Duplicate and branches (favoritesOnly, so dropped) and challenge turns / Another turn do with each kind.
   - What "Export without names or notes" does to each:
     - bookmark titles become "Bookmark at m:ss" and snapshot becomes null;
     - challenge names, including a turn's challenge name, become "Shared challenge";
     - the gallery is written unchanged.
   - TurnRecord.challenge (fields, the objectiveId rule, the budget counted from startSeq).
   - The challenge file.
   - Shelf 'snapshot' records (createdFor bm-n) and 'baseline' records shared by challenges (createdFor 'ch-n', looked up by state checksum).
   - The Storage panel. Only checkpoints and shelf records can be removed (storageRemovable), never a named slot or the autosave/Continue. It also says what removing a snapshot or a challenge baseline leaves behind.
   - Proving check: read from notebookBookmarks.ts, notebookGallery.ts, notebookChallenges.ts, notebookTurns.ts (diff), notebook.ts (diff), host.ts:545 (strip export), notebookWatch.ts notebookAfterRestore, storage.ts, ui/strings/notebookTools.ts and ui/gallery.ts.
3. **DONE: §10.3 Audio, the narrator as built** (docs/ARCHITECTURE.md:466–500). It covers:
   - Phrase ids only (the 16 ids listed); utterances use lang 'en' and rate 1.
   - Off by default (AudioPrefs.narration; older settings read as off). Volume is the voice bus, and at 0 the narrator stops. No speech support means nothing is spoken and nothing fails.
   - Nothing is spoken before the first gesture (initAudio calls narrator.gesture). Holding audio cancels the current phrase and drops the queue.
   - One utterance at a time, with at most 2 waiting. A request beyond that is dropped, and a phrase already waiting is not queued again. The utterance timeout is 5 s.
   - The 10 s repeat rule.
   - The evidence rule for every phrase (src/ui/narration.ts RULES). feederEmpty, lightOn and lightOff are never spoken in v1.0.
   - Proving check: read from src/audio/narration.ts, src/ui/narration.ts, src/audio/cues.ts:38–80, src/audio/mix.ts (diff) and src/ui/panels/SoundSettings.tsx:113–127.
4. **DONE: tests/e2e/a11y-screens.spec.ts**
   - **Header comment** (lines 8–17) lists which spec scans each wave 6b screen:
     - bookmarks-gallery.spec: the Bookmarks and Gallery tabs, and the Storage panel listing and after-removal states (lines 173, 184, 205, 213);
     - challenge.spec: the editor and the Start sheet (lines 101, 116);
     - variants-paired.spec: the pair setup and results (lines 58, 93);
     - narration.spec: Sound settings with Narration (line 106);
     - this file: the rest.
   - I read each of those specs and did not duplicate their scans.
   - **New test** "wave 6b: …" (line 628) scans five screens no spec scanned:
     - "What if?: an idea with Compare with Garden" (Play → What if? → R-G1; variants-paired.spec clicks this button but never scans the sheet);
     - "Bookmark sheet" (More → Bookmark);
     - "Notebook: gallery, Delete confirmation";
     - "Storage: Remove… confirmation" (snapshot row; bookmarks-gallery scans before and after, never while the confirmation shows);
     - "Leave challenge" (in a challenge turn, More → Leave challenge…).
   - Each confirmation is answered with Keep or Cancel, and the test asserts that nothing was removed.
   - **Proving test:** the new test passes on phone-portrait (35.9 s) and desktop (1.6 m), with zero serious or critical axe findings.
   - **Fails without it (load-time mutant):** I wrote a temporary copy, tests/e2e/zz-docs-a11y-6b-mutant.spec.ts, and deleted it afterwards. Its init script adds an unnamed `<button class="mutant-btn">` beside each of the five screens' markers while they show. The run failed (1 failed, EXIT 1) with exactly one finding per new scan, each naming its screen:
     - "What if?: an idea with Compare with Garden — button-name … .mutant-btn"
     - "Bookmark sheet — …"
     - "Notebook: gallery, Delete confirmation — …"
     - "Storage: Remove… confirmation — …"
     - "Leave challenge — …"
   - So each scan is taken while its screen is displayed and would catch a violation there.

## Files changed
- docs/ARCHITECTURE.md (+217 lines; hunks only in §7, §10.3, §11.2)
- tests/e2e/a11y-screens.spec.ts (+116 lines: header comment and one new test)
- docs/reports/reviews/g4-wave-6b/integrate-docs-a11y-6b.md (this report)
- Scratch only: tmp/docs-a11y-6b/ (backups of the two originals, logs).

## Commands
- `npx eslint tests/e2e/a11y-screens.spec.ts`: clean (ESLINT_EXIT 0), run before and after the e2e runs.
- `E2E_PORT=4286 E2E_OUTDIR=tmp/dist-docs-a11y-6b npx playwright test tests/e2e/a11y-screens.spec.ts -g "wave 6b" --project=desktop --project=phone-portrait`: 2 passed (2.4m); port 4286 cleared before and after.
- The same command on the mutant copy with `--project=phone-portrait`: 1 failed (EXIT 1), with the 5 expected findings. The copy was then removed and the port cleared.
- `npx tsc -p tsconfig.json --noEmit`: clean (TSC_EXIT 0).
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence`: Test Files 5 passed (5), Tests 51 passed (51).

## Notes for the lead
- Not run: the other tests in a11y-screens.spec.ts. Their code is unchanged; only a header comment and a new test were added.
- No PROPOSED DECISION needed.
