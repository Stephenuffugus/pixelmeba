# Wave 7a integration: the verifiers' MINORs and what the lead did

Lead, 2026-10-12. Run `wf_77241b39-da5` (android P4.10, perf2-polish P4.13) returned two builds and three verdicts, all
**ok = true** with 0 BLOCKER/MAJOR: wave-verify.md (rules), saves-verify-android.md and saves-verify-perf2-polish.md
(saves and determinism lenses). There were no fix rounds. The lead took the 14 MINOR lines (13 distinct; the frozen-app
timer was found twice) and the two NOTEs. Decisions: D-0093 (Android as built), D-0094 (P4.13 as built), D-0095 (this
integration).

## The MINORs

| # | From | Finding | What the lead did | Proof |
|---|---|---|---|---|
| 1 | saves-0, wave | A full device after the commit point locked the whole store: every read failed for the session, and a relaunch while full fell back to memory. | `FilesystemBackend` keeps the committed journal pending in memory. Reads lay it over the slot files (`slotsWithJournal`, `journalSlot`, deleted records read as null). Writes are refused with the replay's error (StorageFullError). `open` succeeds with it pending, sweeps, and tries once more. `apply` now removes the dropped records before writing the pointers, so their space comes first. | capacitor-fs "out of space after the commit point …": reads B and C, save and remove refused as storage full with no file changed, relaunch while full opens with B, C and the predecessor, and after space is freed the next save applies the journal first. Mutants: reads refused while pending → 1 failed; open failing while pending → 1 failed (ENOSPC). |
| 2 | saves-0 | A damaged slot file made the next open sweep both of its records. | `recover` lists unreadable slot files (`readSlotFiles` → `unreadable`) and keeps records whose id starts with `<slotId>:`. True orphans are still removed. | capacitor-fs "a slot file that cannot be read keeps its saves …": 2 records kept, the stray orphan removed. Mutant (rule off): `expected +0 to be 2`. |
| 3 | wave | A commit refused before its commit point left its .tmp and new record files until the next open. | `commit` records the record files it creates and, on a failure before the journal rename starts, removes them, their tmp copies and `journal.tmp`, best effort. Once the rename has started nothing is removed, because the rename may have landed. | capacitor-fs "a commit refused before its commit point … retry after retry" (record write and journal write refused, three retries each: files identical to before) and "a journal rename that reports a failure but landed keeps the new records" (relaunch opens B intact). Mutants: discard off → `expected { …(3) } to deeply equal { …(2) }`; discard always → `expected 1 to be 2`. The torn-write test now also checks that no file is left behind before the reopen. |
| 4 | wave, saves-0 | The bridge's 30 s timer counts on while Android freezes a backgrounded app, so a save started by 'pause' could stop saving for the session on the thaw. | `PortFsOps` takes a clock (`performance.now` by default). A timer that fires more than `FS_SUSPENDED_MS` (5 s) after its deadline is re-armed for another full limit. An on-time expiry still stops the port. ANDROID_SETUP §10.8.12 adds the device step "Home during a save, wait 2 min, return, save". | fs-bridge "D-0095: a timer that fires long after its deadline …": pending after a 90 s-late fire, then the late answer is used; then an on-time expiry stops the port. Mutant (no re-arm): `expected Error: The device storage did not answer … to be 'pending'`. The existing 30 s test still passes. |
| 5 | wave | On the app only 'resume' cleared the absence; a missed resume (or a failed App-listener start) left every later background unpaused. | `Lifecycle.foreground(false)` now always ends the absence and keeps the line owed until 'resume' says it. `main.tsx` calls it on 'visible' on both platforms, and logs a failed `wireNativeLifecycle` instead of dropping it. | lifecycle "D-0095: … the resume after it still says the line once, and a missed resume never leaves the next background unpaused" (speeds [0,0,0], 3 autosaves). Mutant (old foreground) → `expected [] to deeply equal [ Array(1) ]`. |
| 6 | wave | The app's own share sheet and file picker fire App 'pause', which pauses the dish. Nobody had decided that. | Decided as intended (D-0095): nothing runs unseen, and the return says it was paused. ANDROID_SETUP §10.8.6 checks it on a device. | Doc only. |
| 7 | wave | The legacy icons draw a simpler colony than the adaptive icon. | Kept. At 24 cells the colony is one clump with three gold centres. The appIcon.ts comment no longer says "the same art". Owner review in D-0093 (ANDROID_SETUP §10.5). | Doc only. |
| 8 | wave | perf2-polish made small edits outside its owned files. | Accepted: each is disclosed, additive and needed (D-0095). | — |
| 9 | wave | UX §7.4: the camera-easing row's middle column said there was no easing in any mode, and the placement ring's As-built note was still 6b's. | The middle column now reads "instant (presets, Find and follow set the view at once)". The ring note now gives the motion-on timing (300 ms grow, faded by 700 ms) and "drawn only for an accepted placement" with both functions. | tests/render/reduced-motion.test.ts "UX §7.4 table: every As built cell names a real file and symbol" passes. |
| 10 | wave (from perf2-polish) | A specimen placement that placed nothing still drew a ring. | `LineageState.tsx` `reportSpecimenPlacement`: a toast, and the ring only when `accepted > 0`. | placement-ring "a specimen placement draws its ring only when something was placed". Mutant (ring on refusal) → `expected "vi.fn()" to not be called at all`. |
| 11 | wave (from android) | On the app, the memory fallback showed the browser's wording. | `src/ui/strings/saves.ts` `NOT_KEEPING_SAVES.page/sheet(native)`, used by Saves.tsx and MoreSheet.tsx with `isNativePlatform()`. The web's words are unchanged. | tests/ui/saves-wording.test.ts (2 tests). |
| 12 | saves-1 | `tools/perf-stress.ts --save-out` said recipeId 'FIRST_DISH_V1' for a dish built in memory. | It now passes `recipeId: null`. `measureSave`, which is never exported, is unchanged. | Read. |
| 13 | saves-1 | parseSaveFile accepted a header `tick` (outside the checksum) that disagreed with the state. | The checked state's tick replaces the header's. Refusing the file was rejected: builds before P2.8 (9708c29) read the header tick after an await, so a real file could disagree by a few ticks. | persistence "D-0095: the header tick … is replaced by the checked state tick" (a 61 header over a 60 state parses as 60 and loads to the same stateHash). Mutant → `expected 61 to be 60`. |

NOTEs: (a) the APK and AAB were built before perf2-polish's last edits. The final build is recorded at P4.14 (LEAD AFTER WAVE 7 step 4). (b) A refused Feed changes stateHash (command sequence and its 'command' event). This predates the wave, and first-minute.spec.ts checks the world minus its command record instead. Accepted.

## Other integration changes

- tests/sim/profile-eviction.test.ts: the stress-world case now runs 3,000 ticks (five evictions; marks 600/1,800/3,000) instead of 6,000, to keep `npm run check` in bounds. Two other checks cover the long run: `tools/perf-stress.ts --hashes --stress-only` runs the stress world to 9,000 ticks, and the fence runs with eviction active.
- tests/render/phase3.test.ts "fungi and viruses are told from the manifest …" failed in the lead's `npm run check`. Its
  source pin on renderer.ts still expected `(d.move ?? d.idle)`, which perf2-polish's `bodyAnimFor` replaced, and no
  builder or verifier had run that file. The pin now matches the P4.13 body path: in the non-fungus branch, `bodyAnimFor`
  and then `const a = … : d.idle;`, picked in one place. The test keeps its purpose: fungi go to mask tiles, viruses are
  skipped, and the body animation is chosen only for bodies.
- tests/e2e/a11y-screens.spec.ts: new test "wave 7a" scans Settings with "Show performance numbers" on, and the dish with the performance bar, running and paused. The header lists the wave 7a coverage.
- ARCHITECTURE §7 (the 'platform' and 'diagnostics' messages, `SnapshotMsg.perf`, boot on the first message, the pool arming), §11.1 (as built: StorageBackend, IdbBackend, the FilesystemBackend journal, the bridge, the estimate, settings), §12 (as built), §13 (as built).
- ANDROID_SETUP §10.8 items 6, 12 and 13, and §11 (saves and background).

## Commands (lead)

- `npx vitest run tests/persistence/capacitor-fs.test.ts tests/platform tests/ui/saves-wording.test.ts tests/ui/placement-ring.test.ts tests/persistence/persistence.test.ts tests/render/reduced-motion.test.ts tests/worker/boot.test.ts` → all passed after one test fix (the landed-rename test had armed its failure before the first save). capacitor-fs alone: 46 passed.
- Nine mutants, each restored after its run (scratchpad mutate.py): every one failed its test as listed above.
- `npx tsc -p tsconfig.json --noEmit` and `npx eslint` on every changed file: clean.
- `npm run check`, the fence, and the desktop journeys: results in the wave 7a commit message.

## The integration verifier (run wf_f37f471b-538) and what the lead did (D-0096)

The saves lens (integrate-verify-saves.md) was **ok**: 15,780 crash and relaunch cuts over the full-device and
pending-journal paths, both rename modes, and the pending overlay equal to the applied view in every crafted journal.
Its 2 MINOR and 4 NIT are accepted and stated in the docs (D-0096). The rules lens (integrate-verify-rules.md) found
2 MAJOR and 3 MINOR; all fixed:

| Finding | Fix | Proof |
|---|---|---|
| MAJOR: on the app a cancelled share was reported as exported, and the keep flow moved on with no file | `saveTextFile` resolves the outcome; `exportDishFile`/`exportContinueFile` resolve null on a cancel; More → Export, Export challenge, the keep flow and What if? say "not exported" and stay at their choice | native-share "D-0096 …"; mutant (outcome forced to 'shared') → `expected 'shared' to be 'cancelled'` |
| MAJOR: the docs promised a return line after the in-app Share sheet, which pauses the dish itself | D-0095 (corrected), ARCH §12, ANDROID_SETUP §10.8.6/§11: the line follows More → Export's system sheet and the file picker | doc |
| MINOR: a running comparison kept running on App 'pause' without the page going hidden | `pauseDishForBackground` calls `setCompareSpeed(0)` for a running comparison | lifecycle "D-0096 …"; mutant → `expected [] to deeply equal [ +0 ]` |
| MINOR: main.tsx's half of the visibility fix had no test | `visibilityChanged` in src/platform/lifecycle.ts, tested; main.tsx calls it with no platform condition (source assertion) | lifecycle "visibilityChanged …" |
| MINOR: "the worker calls performance.now() only while diagnostics are on" was false | D-0094, ARCH §7, perfCounters.ts comment | doc |
| NITs: "30 s of running time", item 12 as a smoke check, the no-quota estimate, the web wording in ARCH §7, a source assertion for placeSpecimenTap | all corrected | placement-ring "placeSpecimenTap reports through …" |

E2E batch 1 (desktop, the 06a25e9 tree, 36.9 min): 18 passed, 1 failed. android-storage's cut loop passed (13
operations, commit point at 7: old ×8, new ×5), and the damaged record opened the previous moment. The 3.5 s
"damaged" toast had gone before the assertion, under the verifiers' load. Fix: the line stays 6 s, and the spec watches
for it from the Open click (D-0096). Rerun pending.

Commands: `npx tsc --noEmit` clean; `npx eslint` on the 13 changed files clean;
`npx vitest run tests/platform tests/ui tests/render/phase3.test.ts` → 38 files, 283 passed; two mutants caught (above).
