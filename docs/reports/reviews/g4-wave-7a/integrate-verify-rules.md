# Wave 7a integration — verify (rules, UX truth, documentation)

Verifier, 2026-10-12. Lens: "Backgrounding pauses; there is no offline growth", "every visible feature maps to
real state", honest labels, UX copy, docs the next builder will trust. Scope: the lead's changes listed in
integrate-lead-7a.md and D-0093…D-0095. No tracked file edited except this one. Scratch: tmp/verify-7a-int-rules/.
No Playwright, no server.

**Verdict: ok = false** — 2 MAJOR, 3 MINOR, 5 NIT. Both MAJORs are about the share sheet on the app. One is a device step
that expects a line that never shows. The other is an export that says it worked after the player cancelled.
The lead's lifecycle fix itself holds in every order of events I tried.

## Problems

### MAJOR 1 — "Share … with the dish running: the return says so" is false (ANDROID_SETUP §10.8.6, §11; D-0095)
- **Where:** docs/ANDROID_SETUP.md §10.8 item 6 ("Do it once with the dish running: the sheet covering the app pauses
  the dish like Home does, and the return says so (intended, D-0095)"), §11 Background ("Pixelmeba's own share sheet
  and file picker count as the background too"), and DECISIONS D-0095 ("nothing runs unseen, and the return says it
  was paused").
- **Repro (file:line):** Share a picture and Share a living dish go through the in-app Share sheet. `openShare`
  (src/ui/share.ts:48–66) sets the dish to speed 0 when the sheet opens ("The dish is paused while this is open.").
  When the player then taps Share, `deliverFile` opens the system sheet, App 'pause' fires, and
  `pauseDishForBackground` (src/platform/lifecycle.ts:37–45) finds speed 0 and returns false. So `wasRunning` is
  false and 'resume' says nothing. Closing the Share sheet then runs the dish again at its old speed
  (`restoreShareSpeed`, share.ts:106–113: `now === 0` → `setSpeed(r.speed)`). The owner will follow item 6 on a
  device, see no line, and record a failure for behaviour that is correct.
- **Where it is true:** More → "Export living dish file" / "Export without names or notes" and "Import a dish
  file…". The More sheet does not pause the dish (MoreSheet.tsx:119–125; sheet toggle DishScreen.tsx:264), so the system sheet or picker pauses a
  running dish and the return says the line.
- **Fix:** item 6: "the Share sheet already pauses the dish ('The dish is paused while this is open.'); after the system
  sheet closes there is no return line, and Close runs the dish again". Add the running-dish check to item 7:
  "More → Export living dish file with the dish running: the system sheet pauses it, and on return the line
  shows". In D-0095 and §11, qualify the claim: "…the return says it was paused when the dish was running
  (More → Export or Import; the in-app Share sheet has already paused it)".

### MAJOR 2 — On the app, a cancelled or refused export is reported as exported, including the keep flow's "Exported …"
- **Where:** src/ui/state.ts:579–584 `saveTextFile`: `if (isNativePlatform()) { void deliverFile(…); return; }`.
  The 'cancelled' outcome is thrown away. (This is the android builder's code, not a lead change. wave-verify.md:32
  says "the caller's existing 'Not shared. Nothing changed.' is unchanged", but that is not true for the
  `saveTextFile` callers.)
- **Repro (file:line):**
  - More → Export, then cancel the system sheet: `exportCurrent` (state.ts:624–631) has already shown
    "Exported {file}.". `nativeShare.ts:72–80` deleted the cache file, so nothing was kept.
  - Challenge export: the same, with `CHALLENGE_TEXT.exported` (challenge.ts:357–358).
  - **Keep flow, with all ten slots full** (UX §5.11 "Slots full: choose export or replace"): `exportBeforeStart`
    (WhatIfState.tsx:192–193) moves to stage 'exported' with "Exported {file}. Keep that file to open this dish
    again." The player then starts the new dish and is told "…the original is in the file you exported"
    (strings/whatif.ts:127, keep.ts:165/194). No file exists. The old dish survives only as the autosave's
    predecessor, until the next autosave drops it.
  - The same happens when the share is refused rather than cancelled. For example, on a full phone the cache
    write in `shareNative` fails, `deliverFile` returns 'cancelled' (share.ts:276–281), and the flow still says
    "Exported".
- **Fix:** `saveTextFile` returns `Promise<ShareOutcome>` ('saved' on the web). `exportDishFile`,
  `exportContinueFile`, `exportCurrent` and `exportChallenge` await it. On 'cancelled' they show
  `SHARE_TEXT.cancelled` ("Not shared. Nothing changed."), and the keep flow stays at its choice step (Export /
  Replace / Cancel). Add a unit test with a fake ShareEnv that cancels: no 'exported' stage and no "Exported" toast.

### MINOR 3 — App 'pause' does not pause a running comparison or experiment
- **Where:** src/ui/views/CompareScreen.tsx:53–59 and ExperimentRun.tsx:89–95 pause only on `visibilitychange`
  hidden. `pauseDishForBackground` sets the comparison's `priorSpeed` to 0 (the dish's speed after the comparison
  closes), not the comparison's own speed.
- **Repro:** on the app, an App 'pause' with the page still visible pauses the dish but lets the comparison keep
  advancing. This happens with Android 7–9 split-screen (the unfocused activity is paused but visible) and with a
  system dialog over the activity. No in-app path from the comparison screens reaches the share sheet or file
  picker, so the effect is small. ARCH §12 and ANDROID §11 ("App 'pause' → the same handler … a comparison comes
  back paused") read as if the comparison pauses too.
- **Fix:** in `pauseDishForBackground`, also call `setCompareSpeed(0)` when `compareState.status === 'running'`.
  Or say in ARCH §12 that a running comparison pauses on the page hidden only.

### MINOR 4 — The main.tsx half of fix #5 has no test
- **Where:** src/ui/main.tsx:56–65. `lifecycle.foreground(false)` on 'visible' on both platforms is what ends a
  native absence when 'resume' is missed.
- **Repro:** tests/platform/lifecycle.test.ts calls `t.lc.foreground(false)` by hand, and no e2e run is native
  (`isNativePlatform()` is false). Reverting main.tsx to `else if (!native) lifecycle.foreground(false)` brings
  back the "missed resume leaves the next background unpaused" bug, and every unit and e2e test still passes. The
  `Lifecycle` mutant itself is caught: tmp/verify-7a-int-rules/lifecycle-mut.test.ts with the old
  `foreground` → `expected [] to deeply equal [ Array(1) ]`, exactly as the lead reported.
- **Fix:** move the visibility handler into src/platform/lifecycle.ts, e.g.
  `onVisibility(lc, state: 'hidden'|'visible')` or `wireVisibility(lc, doc)`, and test it with the native fake.
  At minimum, add a source assertion like saves-wording's.

### MINOR 5 — "The worker calls performance.now() only while it is on" is false (D-0094, ARCH §7, perfCounters.ts:7)
- **Where:** D-0094 Diagnostics bullet. ARCH §7: "while off it never calls `performance.now()`".
  src/worker/perfCounters.ts:7: "the host does not call performance.now() at all then".
- **Repro:** src/worker/sim.worker.ts:72 gives DishHost `{ now: () => performance.now() }`. host.ts:435, 1843,
  1857, 2027, 2043, 3417, 3428, 3449 and 3467 call `this.clock.now()` on every pump and snapshot, with diagnostics on
  or off. Only the diagnostics timers (host.ts:1552–1577, 3433–3437, 3465, 3530) are gated.
- **Correct text:** "While off, none of the diagnostics timers run (the tick, snapshot and relationship-watcher
  timings); the host's pacing clock reads `performance.now()` either way." This matters for the next builder:
  the clock exists, and nothing about it is diagnostics-only.

### NIT 6 — ANDROID_SETUP §11: "an operation unanswered for 30 s of running time stops saving"
- The code counts wall-clock time from the call (fsPort.ts:89–104). Suppose a freeze ends 0–5 s after the
  deadline. The timer fires ≤ 5 s late, is not re-armed, and the port stops, even though under 30 s of running
  time passed. Correct text (as ARCH §11.1 already says): "an operation unanswered 30 s after it started stops
  saving until the app restarts; a timer that fires more than 5 s late (the app was frozen) gets a fresh 30 s".

### NIT 7 — ANDROID_SETUP §10.8.12 cannot tell the fix from its absence
- The re-arm runs only if a file operation is still pending when Android freezes the app. The Home autosave
  normally finishes in well under a second, long before the freezer acts. So "Home, wait 2 min, return, save"
  passes with or without D-0095's re-arm. Say it is a smoke check: the fs-bridge unit test is what proves the
  re-arm.

### NIT 8 — A quick second leave drops the owed line
- Probe (tmp/verify-7a-int-rules/lifecycle-orders.test.ts): pause, hidden, visible, hidden, resume, visible →
  "autosaves 2 lines 0". The second `background()` (the first absence was ended by 'visible') overwrites
  `wasRunning` with false, because the dish is already paused. Nothing wrong happens to state; the line is just
  missing. No change needed.

### NIT 9 — Smaller documentation slips
- ARCH §11.1 and D-0093, the storage estimate: when the WebView reports no quota, usage is the store's own files only
  (boot.ts:44 `{ usage: own.bytes }`), not "+ the WebView's usage".
- ARCH §7: "Saved dishes then says saves last only until the app closes". On the web, Saved dishes says "This
  browser is not keeping saves between visits."; the "until you close the app" words are the Save sheet's.
- The in-app Share sheet's stored speed survives going to the background (share.ts:106–113). Close after a
  return runs the dish again, whereas a comparison "comes back paused". The player sees the run, so no time passes
  unseen. This predates the wave (P4.6). Note it with MAJOR 1.

### NIT 10 — placement-ring tests `reportSpecimenPlacement`, not its call
- Inlining the old ring call back into `placeSpecimenTap` (LineageState.tsx:181–184) passes the test. A source
  assertion that `placeSpecimenTap` calls `reportSpecimenPlacement` closes the gap.

## Verified OK
- **Lifecycle, every order.** tmp/verify-7a-int-rules/lifecycle-orders.test.ts (real `Lifecycle` +
  `pauseDishForBackground`) tried 14 native orders per absence. Each is a subset of hidden/pause/visible/resume,
  with the leaving events before the returning ones; a missing 'resume', a missing 'pause', share-sheet
  pause→resume only and the web's hidden→visible are all included. Each was followed by a second absence:
  196 combinations, **0 failures**. In every one: exactly one autosave per absence, the line exactly once iff
  'resume' came and the dish was running, the next absence always paused and saved again, and the web never says
  the line (3 absences: 3 autosaves, 0 lines).
- **Lifecycle mutant.** The old `foreground` (scratch copy) → the D-0095 test fails with `expected [] to deeply
  equal [ Array(1) ]`, matching integrate-lead-7a.md #5.
- **Arcade host and audio on the web.** `foreground(false)` touches only `away`. Audio still follows
  visibilitychange with `hostPaused` (main.tsx:58–59), and 'pixelmeba:pause' is unchanged (main.tsx:67–75).
  CompareScreen and ExperimentRun keep their own hidden pause. A comparison's `priorSpeed` is zeroed by the
  shared handler.
- **The four test files:** `npx vitest run tests/platform/lifecycle.test.ts tests/ui/saves-wording.test.ts
  tests/ui/placement-ring.test.ts tests/render/reduced-motion.test.ts` → 4 files, **27 passed**.
- **Profile eviction stress case:** `npx vitest run tests/sim/profile-eviction.test.ts -t "stress world"` → **1 passed** (2 skipped), 938.9 s on the loaded machine (15.6 min:
  the case is still long for `npm run check`). Not vacuous: at tick 3,000 eviction has just run (3,000 % 600 = 0; five evictions
  at 600…3,000, tick.ts:45–48), and the test asserts that keepAll holds more profiles than the shipped run.
- **Copy:** the web's two not-keeping-saves lines are byte-identical to before (git diff Saves.tsx:76,
  MoreSheet.tsx:194). The native lines use plain words, blame no one and say what still works ("Export files to
  keep your dishes"). The specimen toasts are byte-identical to before (git diff LineageState.tsx).
  `LIFECYCLE_TEXT.resumed` is unchanged.
- **UX §7.4 rows:** `CAMERA_EASE_MS` 220 (camera.ts:21), `eased`/`easePose`/`reducedMotion` exist (camera.ts:37,
  56, 93); `PLACEMENT_EXPAND_MS` 300, `PLACEMENT_RING_MS` 700, `PLACEMENT_STATIC_MS` 1000 (features.ts:216–220);
  the guard `res.accepted > 0` (state.ts:1129/1134/1141 and LineageState `reportSpecimenPlacement`). The
  reduced-motion "real file and symbol" test passes.
- **ARCH §7 messages:** `platform {storage, port?}` (protocol.ts:74), `diagnostics {on}` (protocol.ts:107),
  `SnapshotMsg.perf?: PerfSample` (protocol.ts:633) with exactly {tickMsP50, tickMsP95, ticksMeasured, snapshotMs,
  relationshipMs} (protocol.ts:637–646), ring 300 (perfCounters.ts:14). The first message boots and a later
  'platform' is ignored (sim.worker.ts:37–42). `sendPlatform` comes first in `SimClient.create` (client.ts:143).
  Pools are armed on the request and at the first tick (host.ts:1037, 1545).
- **ARCH §11.1 and D-0095 store text vs capacitorFs.ts:** steps (a)–(d), records dropped first (apply,
  :265–270), discard before the rename only (:401–404), unreadable slot files keep `<slotId>:` records
  (:326–327), open with a journal pending (:304–308), reads lay the journal over the files (`slotsWithJournal`,
  `journalSlot`). fsPort: `FS_OP_TIMEOUT_MS` 30 000, `FS_SUSPENDED_MS` 5 000, re-arm (:97–101).
- **ARCH §12 and §13 facts:** minSdk 24 and compile/target 36 (android/variables.gradle); INTERNET, VIBRATE and
  allowBackup="true" (manifest); `windowSplashScreenBackground` (styles.xml:22); 15 + 11 + 3 = 29 icons. The
  ladder matches budgets.ts: 64→16, stains 128→none, 1,024 dissolves, markers 2 Hz at level 2, textures 2 Hz at
  level 3, 33.3 ms, 2 s / 5 s / 0.8. The badge matches: 0.8 / 0.9 / 2 s (speedBadge.ts:19–21) and its texts
  (:59, :64). `PROFILE_EVICT_TICKS` 600 (profiles.ts:33). `releaseFoodRefs` (movement.ts:506/515).
- **The decisions' numbers vs the reports:** APK 8,568,278 and AAB 6,233,377 bytes (android-build.md:254/260,
  ANDROID §9.1). Watcher 0.23–0.30 → 0.06–0.07 ms (perf-rc1.md:23, :174–175). Heap 1.74 %/min with a save
  (perf-rc1.md:19/144). Worker 2.2 %/min at 4× (perf-rc1.md:20/209). Tick p50 11.95–18.24 ms
  (perf-rc1.md:79/87). All agree.
- **appIcon comment:** the legacy icon (tmp/verify-7a-int-rules/icon-probe.ts) has 4 gold cells, (11,11),
  (13,11), (14,12) and (12,13), which make 3 groups when diagonal neighbours count as touching, so "three gold
  centres" holds. The adaptive foreground has 5 gold cells ("five Sunbead cells").
- **The a11y "wave 7a" e2e (read, not run):** the test ids exist (`setting-show-performance` SimplePage.tsx:97,
  `diag-bar`/`diag-tick` Diagnostics.tsx:76–77). The tick regex matches Diagnostics' `Tick {p50} ms (p95 {p95})`.
- **The lead's `npm run check`** (tmp/lead/check-7a.log) ended EXIT 1 with 1 failure,
  tests/render/phase3.test.ts: a source regex still expected `(d.move ?? d.idle)` from before P4.13. The lead has
  since updated that test in the working tree (13:17), and `npx vitest run tests/render/phase3.test.ts` → 11
  passed. The integration report does not list this test change yet.
