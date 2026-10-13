# Resume point — read this first after a restart

> **FIRST READ `docs/agent/fast-track.md` — the owner wants v1.0 in about three sessions; it overrides the old
> per-builder verification, three-project e2e runs and six-wave layout below.**
>
> **Update 2026‑10‑13 10:55 UTC — v1.0 GATE PASSED. Tag `v1.0.0-rc1` = the gate commit "gate(v1.0): Phase 4 — …"
> (on top of `1eb42c6` D‑0100 and `c001a94` D‑0099; pushed with the tag). Phases 0–4 are complete. START HERE.**
> - Evidence: docs/EXPANSION_RESPONSE.md §4 (check 216/2088 at 1eb42c6; e2e 359/360 at 17ad62f + keyboard 6/6 after
>   D‑0099; determinism 450c846c6503adf2 ×4; conservation as G3; quiet perf; tune-rc1 == tune-g3 masked; Android §9.3).
>   Verified by wf_9f98a855-39a (evidence + completeness lenses: ok; their MINORs/NITs fixed before the commit).
> - Owner: 41 decisions in EXPANSION_RESPONSE §8, store/device tasks in PLAY_STORE_CHECKLIST §B.
> - NEXT: Phase 5 (Expanded Ecology → v1.1.0), flag-gated. Lead draft docs/agent/g5-plan.md (like g4-plan.md:
>   lead calls, waves with disjoint file ownership, two builders at a time, one rules verifier per wave + a
>   determinism/saves lens for sim-rule changes), then the wave task-file writer, then waves per fast-track.md.

> **Update 2026‑10‑13 10:40 UTC — THE v1.0 GATE IS COMPLETE IN THE TREE; ONLY THE GATE COMMIT + TAG REMAIN. START HERE.**
> - Committed and pushed this session: `c001a94` D‑0099 (keyboard reticle after the inspector's reveal pan; the gate's
>   one e2e failure) and `1eb42c6` D‑0100 (a release AAB carries no source maps; 6.26 MB → 3.81 MB). Checks: 215/2086
>   at c001a94, 216/2088 at 1eb42c6; keyboard.spec 6/6 on all three projects.
> - Uncommitted gate edition: EXPANSION_RESPONSE (every `<gate:` filled), README, WORKLOG (P4.14 + v1.0 evidence ticked),
>   ANDROID_SETUP §9.3, perf-rc1.md "Gate re-measure, quiet", docs/reports/tune-rc1.md (tables == tune-g3.md with hashes
>   and wall-clock masked), store/ images from 17ad62f, checklist wording. Message: tmp/gate4b/commit-B.txt.
> - Running: read-only verification wf_9f98a855-39a (evidence auditor + completeness critic). Then: fix findings →
>   `git add -A` (store/ too) → commit with tmp/gate4b/commit-B.txt → `git tag -a v1.0.0-rc1` → push main + tag →
>   memory → Phase 5 plan (docs/agent/g5-plan.md, like g4-plan.md).
> - If the session died: the tree is on wip/g4-gate4; if verification has no journal result, rerun it (script under
>   ~/.claude/projects/-workspaces-pixelmeba/94ea1166-…/workflows/scripts/) or commit after your own read.

> **Update 2026‑10‑13 04:40 UTC — RESUMED AFTER THE CODESPACE CLOSED (≈ 03:04). THE GATE RUN FINISHED: store-assets,
> content, fixtures, perf (stress, heap, web, web-gc) all rc=0; full e2e 359/360 at 17ad62f (4.2 h). The 1 failure
> (keyboard.spec.ts:174, phone-portrait) was a real keyboard defect → FIXED (D‑0099: a key closing the inspector, no
> sheet after, dish focused, undoes its reveal pan; Camera.undoReveal + revealOnSheetChange in src/ui/a11y/focus.ts;
> reviewed by wf_d7cf7aeb-5d1 = ok, its MINOR fixed; docs/reports/reviews/v1-gate/d0099-review.md). START HERE.**
> - Running: `npm run check` (started 04:31; tmp/gate4b/check.log + tmp/gate4b/vitest-report.json; pid tmp/gate4b/check.pid).
> - Then, in order: keyboard.spec on all three projects (final code) → commit A from tmp/gate4b/commit-A.txt (fill
>   CHECK_LINE/E2E_LINE) → `nohup tmp/gate4b/post.sh` (art check, build, build:demo, android debug + release) and
>   `nohup tmp/gate4b/tune.sh` (→ docs/reports/tune-rc1.md; diff against tune-g3.md) → fill the remaining `<gate: …>`
>   placeholders of docs/EXPANSION_RESPONSE.md (per-row evidence: scratchpad rows.py over vitest-report.json + the e2e
>   log) + ANDROID_SETUP §9.3 → read-only verification of the filled report → gate commit B (store/, docs, WORKLOG
>   P4.14) → tag v1.0.0-rc1 → push. perf-rc1.md already has the quiet "Gate re-measure" section.
> - If the session died: restore from wip/g4-gate4 if `git status` is clean; rerun whichever step has no END line.

> **Update 2026‑10‑12 21:40 UTC — WAVE 7b COMMITTED `487a152` (worklog `17ad62f`, pushed; D‑0097, D‑0098; check 215 files /
> 2079 tests; desktop e2e 29/29). P4.1–P4.13 all ticked. THE v1.0 GATE (P4.14) IS RUNNING. START HERE.**
> - tmp/lead/gate4.sh (pid tmp/lead/gate4.pid; progress tmp/gate4/steps.log, logs tmp/gate4/*.log): store:assets on the
>   clean commit → content:validate → fixtures → quiet perf (tmp/perf-gate4/*.json) → full three-project e2e.
> - A read-only agent is drafting EXPANSION_RESPONSE v1.0 + README with "<gate: …>" placeholders.
> - Then: fill the placeholders from the gate logs, update perf-rc1.md with the quiet numbers, commit store/ (new buildCommit)
>   + docs as "gate(v1.0): …" with the evidence, tag v1.0.0-rc1, push. Any e2e failure: fix, rerun that spec on all three projects.
> - If the session died: check tmp/gate4/steps.log; rerun only the steps without an END line (the script's lines).

> **Update 2026‑10‑12 17:20 UTC — WAVE 7a DONE: fixes committed `ed374ba` (D‑0096; check 208 files / 2027 tests;
> desktop e2e batch 2 52/53 + whatif:237 rerun green after expectReachable re-scrolls; android-storage phone 2/2).
> P4.10 + P4.13 ticked; WAVE 7a AS BUILT in docs/agent/g4-wave-7.tasks.js.txt STATE. 7b run file
> docs/agent/g4-wave-7b.run.workflow.js.txt built (keys web-arcade, store). START HERE.**
> - Next: backup loop → wip/g4-wave-7b (tools/lead/backup-loop.sh), launch 7b with the Workflow tool (copy the run file
>   to the scratchpad as .js; scriptPath). Then integrate (MINORs, decisions, check, touched journeys desktop), commit,
>   tick P4.11 + P4.12 → P4.14 v1.0 gate (full three-project e2e, EXPANSION_RESPONSE, tag v1.0.0-rc1).
> - If the session died mid-7b: restore the tree from wip/g4-wave-7b if `git status` is clean, read
>   docs/reports/reviews/g4-wave-7b/, rerun only unfinished tasks (A.only + finish notes).

> **Update 2026‑10‑12 14:05 UTC — THE VERIFIER FIXES ARE MADE BUT NOT COMMITTED (D‑0096; both MAJORs, the MINORs,
> the docs, the damaged-save line 6 s + the android-storage wait). Targeted evidence: tsc clean, eslint clean on the 13
> changed files, `npx vitest run tests/platform tests/ui tests/render/phase3.test.ts` 38 files / 283 passed, two
> mutants caught. The tree is pushed to wip/g4-wave-7a. START HERE.**
> - E2E batch 1 on the 06a25e9 tree: 18 passed, 1 failed (android-storage: the damaged toast's timing; fixed).
> - Next, in order: (1) full `npm run check` (~58 min; tmp/lead/check-7a.log pattern); (2) desktop e2e: android-storage
>   (desktop AND phone-portrait), keep-dish, share, whatif, garden, compare, try-dish, observe-tools, keyboard,
>   experiments, a11y-screens :422 :505 :634 :761 :798 :862 (batch 2); (3) commit "fix(p4): wave 7a integration verifier
>   — …; D-0096" with the evidence; (4) `python3 tmp/lead/tick-7a.py <sha>`; (5) `python3 tmp/lead/insert-asbuilt-7a.py
>   <sha> "<evidence>"` (add to tmp/lead/asbuilt-7a.txt first: saveTextFile returns Promise<ShareOutcome>,
>   exportDishFile/exportContinueFile resolve string | null; D-0096); (6) build the 7b run file (keys web-arcade,store);
>   (7) commit + push; backup loop → wip/g4-wave-7b; launch 7b.
> - If the tree is somehow clean on restart: `git fetch origin wip/g4-wave-7a` and restore that tree (tmp/lead/backup
>   scripts); the fixes are there.

> **Update 2026‑10‑12 13:40 UTC — WAVE 7a CODE COMMITTED AND PUSHED: `06a25e9` (check 2022/2023 + the phase3 source-pin
> fix rerun 11/11). P4.10 and P4.13 NOT TICKED YET: the integration verifier (run `wf_f37f471b-538`;
> docs/reports/reviews/g4-wave-7a/integrate-verify-{saves,rules}.md) found 2 MAJOR to fix first. START HERE.**
> - MAJOR 1 (docs): the in-app Share sheet already pauses the dish ("The dish is paused while this is open."), so the
>   return line does NOT show after Share a picture / living dish; only More → Export (and the keep flow's Export) and
>   the Import picker pause through App 'pause' and show it. Fix ANDROID_SETUP §10.8.6 and §11, D-0095, ARCH §12.
> - MAJOR 2 (code): src/ui/state.ts saveTextFile's native branch drops deliverFile's 'cancelled' → "Exported X." and the
>   keep flow moves on with no file. Make saveTextFile return the ShareOutcome; exportDishFile / exportContinueFile /
>   exportCurrent / exportChallenge (src/ui/challenge.ts) / exportBeforeStart (WhatIfState.tsx) await it; on 'cancelled'
>   show SHARE_TEXT.cancelled and keep the keep flow at its choice step; a unit test with a cancelling ShareEnv.
> - MINORs: pauseDishForBackground also pauses a RUNNING comparison (CompareScreen/ExperimentRun pause only on hidden);
>   move main.tsx's visibility handler into src/platform/lifecycle.ts (visibilityChanged) + test; "the worker calls
>   performance.now() only while diagnostics are on" is false (pacing clock) → fix D-0094, ARCH §7, perfCounters.ts:7;
>   docs: space must be freed outside Pixelmeba on a full phone (removes are refused while a journal is pending);
>   saving over a hidden damaged slot lets the next open remove its old records (say so in D-0095); damaged checkpoint/
>   shelf records are kept (accept); writes are refused with the replay's error (StorageFullError when full);
>   ANDROID_SETUP §11 "30 s of running time" → "30 s after it started; a timer > 5 s late gets a fresh 30 s"; §10.8.12
>   is a smoke check (the proof is the fs-bridge unit test); no-quota estimate = own files only (ARCH §11.1, D-0093);
>   ARCH §7 boot bullet's web wording; the Share sheet's stored speed survives backgrounding (P4.6; note it); a source
>   assertion that placeSpecimenTap calls reportSpecimenPlacement; one sentence: a power cut is outside the enumeration.
> - Then: targeted tests → full `npm run check` → commit the fixes → `python3 tmp/lead/tick-7a.py <fix sha>` (ticks P4.10
>   + P4.13; use the FIX commit's sha or 06a25e9 + fix) → `python3 tmp/lead/insert-asbuilt-7a.py <sha> "<evidence>"`
>   (draft tmp/lead/asbuilt-7a.txt; mention saveTextFile's new return) → build the 7b run file with
>   tools/lead/build-run-file.py (keys web-arcade,store; OWNER CONTEXT says "lets get started" = resume) → commit + push
>   → backup loop on wip/g4-wave-7b → launch 7b.
> - Exact fix plan with file:line: tmp/lead/fix-plan-7a.md (gitignored, on disk). Also in it: e2e batch 1's one failure
>   so far: android-storage desktop, the damaged-save line (a 3.5 s toast) expired under the verifiers' load before the
>   assertion; the restore itself worked (fix: show it 6 s + wait for it alongside the Open click; rerun both projects).
> - E2E: batch 1 (tmp/lead/e2e-7a-batch1.sh → tmp/lead/e2e-7a-desktop-1.log, started 13:17) ran on the 06a25e9 tree;
>   batch 2 still to run on desktop: garden, keep-dish, whatif, compare, share, try-dish, observe-tools, keyboard,
>   experiments and a11y-screens :422 :505 :634 :761 :798 :862 (after the MAJOR 2 fix: keep-dish and share cover it).

> **Update 2026‑10‑12 12:25 UTC — WAVE 7a DONE (run `wf_77241b39-da5`: android + perf2-polish built, 3 verdicts ok,
> 0 BLOCKER/MAJOR, 13 MINOR). LEAD INTEGRATION DONE IN THE TREE (uncommitted): all 13 MINORs fixed or decided
> (docs/reports/reviews/g4-wave-7a/integrate-lead-7a.md; D‑0093/D‑0094/D‑0095 appended; ARCH §7/§11.1/§12/§13;
> ANDROID_SETUP §10.8/§11; UX §7.4; a11y-screens "wave 7a"; profile-eviction stress case trimmed to 3,000 ticks).
> `npm run check` RUNNING (tmp/lead/check-7a.log). START HERE.**
> - Next: desktop e2e of android-storage, first-minute, garden, place-and-undo, save-reload, keep-dish, whatif, compare,
>   share, try-dish, observe-tools, sound-settings, keyboard, a11y-screens, garden-home, lineage, experiments (port 4290,
>   tmp/lead/e2e-7a-desktop.log) → commit 7a (evidence in the message) → tick P4.10 + P4.13 → put the commit and evidence
>   into the WAVE 7a AS BUILT draft (scratchpad asbuilt-7a.txt; if lost, rewrite from integrate-lead-7a.md + D‑0093..95)
>   and append it to STATE in docs/agent/g4-wave-7.tasks.js.txt → build the 7b run file (keys web-arcade,store) → move the
>   backup loop to wip/g4-wave-7b → launch 7b.
> - If this session dies: the tree is on wip/g4-wave-7a (backup loop, pid tmp/lead/backup-7a.pid); restore if `git status`
>   is clean; rerun the check, then continue as above.
> - 12:40: owner asked for a session REFRESH before the codespace's forced stop (~14:30 UTC). Refresh point = after the
>   7a commit + push + the 7b run file, BEFORE launching 7b (never mid-workflow). Running now: an integration verifier
>   (run `wf_f37f471b-538`, 2 lenses → docs/reports/reviews/g4-wave-7a/integrate-verify-{saves,rules}.md). Desktop e2e
>   order: android-storage, first-minute, a11y-screens, save-reload, lineage, place-and-undo, garden-home, sound-settings
>   first (before the commit); garden, keep-dish, whatif, compare, share, try-dish, observe-tools, keyboard, experiments
>   after (if cut by the refresh, the new session runs them before launching 7b).

> **Update 2026‑10‑12 08:35 UTC — WAVE 6b COMMITTED (`52e6a27`, worklog `2d21c82`; check 191 files / 1910 tests, desktop
> e2e 109/109). P4.1–P4.9 done. WAVE 7a LAUNCHING (android 4281 + perf2-polish 4282, both critical 'own' → saves lenses
> 4396/4397; rules verifier 4390) from `docs/agent/g4-wave-7a.run.workflow.js.txt` (built with tools/lead/build-run-file.py).
> START HERE.**
> - Pre-launch done: every `<lead: …>` placeholder of docs/agent/g4-wave-7.tasks.js.txt filled with the 6b facts; D‑0091
>   (Android = debug build + documented steps) and D‑0092 (Filesystem adapter on the native app, IndexedDB on the web;
>   owner review) recorded; ports freed; JDK 21 and android-36 present. Nothing else may run on the machine during 7a
>   (perf2-polish measures under the android build's load).
> - Backups: `nohup tools/lead/backup-loop.sh wip/g4-wave-7a "wip: wave 7a in flight"`, pid in tmp/lead/backup-7a.pid.
> - If this session dies mid-wave: restore from wip/g4-wave-7a if `git status` is clean; read the run's journal
>   (~/.claude/projects/-workspaces-pixelmeba/<session>/subagents/workflows/<run>/journal.jsonl) and
>   docs/reports/reviews/g4-wave-7a/; rerun only unfinished builders with `A.only` + `finish` notes.
> - After 7a: LEAD AFTER (7a) in the tasks file → integrate → `npm run check` → commit → tick P4.10 (and P4.13 if its
>   criteria are met) → build 7b (web-arcade 4283 + store 4284, rules verifier 4391) → P4.14 (full suite, three-project
>   e2e, EXPANSION_RESPONSE, README) → tag v1.0.0-rc1.

> **Update 2026‑10‑12 06:20 UTC — INTEGRATION VERIFIED (integrate-verify1 ok: 3 MINOR + 3 NIT, all fixed by the lead,
> integrate-lead-6b.md); `npm run check` GREEN (191 files / 1910 tests, 2719 s, tmp/lead/check-6b.log). DESKTOP E2E RUNNING
> (all 38 specs, port 4290, tmp/lead/e2e-6b-desktop.log). START HERE.**
> - Commit message draft: tmp/lead/commit-6b.txt (fill EVIDENCE_PLACEHOLDER with the check + e2e lines). D‑0091/D‑0092
>   drafts for 7a: tmp/lead/d0091-92.md (append to DECISIONS after the 6b commit).
> - If this session dies: tree is on wip/g4-wave-6b (backup loop); re-run only the e2e (check is done on this tree unless
>   the tree changed: compare with the backup), then commit 6b, tick P4.5/P4.8/P4.9, then 7a pre-launch: replace
>   `<lead: 6b commit sha>` / `<lead: npm run check …>` and D-<n>/D-<n+1> (→ D-0091/D-0092) in g4-wave-7.tasks.js.txt,
>   build the 7a run file with tools/lead/build-run-file.py (keys android,perf2-polish), free ports, backup loop on
>   wip/g4-wave-7a, launch.

> **Update 2026‑10‑12 05:05 UTC — RESUMED ("lets get started"). Lead items a–d DONE (D‑0090); integration VERIFIER
> RUNNING: run `wf_f5f03585-9db` (session 79887b47), script `docs/agent/g4-wave-6b-integrate-verify.workflow.js.txt`
> (its SOURCES now list the lead items). START HERE.**
> - Tree = wip/g4-wave-6b (backup loop running, pid in tmp/lead/backup-6b.pid). The 04:05 tree matched the backup exactly.
> - Lead items (uncommitted code, D‑0090 committed): NOTEBOOK_MAX_BYTES 2 MiB + wide tripwire case (1,383,868 = 66.0 %);
>   challengeSave shares only 'ch-' baselines (test "D-0090" fails without it); CompareSetup/ExperimentRun sentences;
>   SHELF_REMOVE_REFUSED names challenges. tsc + eslint clean on the changed files; bookmarks/shelf/challenge tests pass.
> - If this session dies: restore from wip/g4-wave-6b if `git status` is clean; read the run's journal
>   (~/.claude/projects/-workspaces-pixelmeba/79887b47-4ab1-419b-b4a6-21e592733ed1/subagents/workflows/wf_f5f03585-9db/)
>   and docs/reports/reviews/g4-wave-6b/integrate-verify1.md; re-run the verifier only if it wrote no verdict.
> - Then steps 6 of the 04:05 block: `npm run check`, desktop e2e (all specs, alone), commit 6b, tick P4.5/P4.8/P4.9, 7a.

> **Update 2026‑10‑12 04:05 UTC — SAFE STOP FOR THE OVERNIGHT CODESPACE STOP (owner: "the codespace will need to close
> before i will wake up so we should find a good place to save it all and refresh the codespace"). START HERE.**
> - **State.** main = this commit (docs only; pushed). The wave 6b code plus BOTH integration fixers' edits are uncommitted
>   in the working tree and saved as branch **`wip/g4-wave-6b`** (tip made right after this commit; its tree = this
>   commit's tree + the uncommitted code). The pre-integration 6b tree is **`wip/g4-wave-6b-built` = `5b3e1e7`**.
> - **What ran.** Integration run `wf_67897fae-84f` was stopped by the lead at 03:53 after both fixers returned:
>   docs-a11y-6b (ARCH §7/§10.3/§11.2 "As built 6b", a11y-screens additions) and code-minors-6b (all 14 items DONE with
>   mutants; reports `docs/reports/reviews/g4-wave-6b/integrate-{code-minors,docs-a11y}-6b.md`). The verifier was killed
>   at its start: it wrote no report and edited nothing (only scratch `tmp/integrate-verify-6b-1/`, ignore it).
>   Nothing is verified yet; `npm run check` has NOT run on this tree. D‑0086…D‑0089 and §8 items 29–35 are committed.
> - **Resume steps:**
>   1. `git status`: the 6b files (src/ui/views/StoragePanel.tsx, src/worker/challenge.ts, …) must be present. Compare
>      trees: `IDX=$(mktemp); GIT_INDEX_FILE=$IDX git read-tree HEAD; GIT_INDEX_FILE=$IDX git add -A;
>      GIT_INDEX_FILE=$IDX git write-tree; rm $IDX` must equal `git rev-parse 'wip/g4-wave-6b^{tree}'`. If the files are
>      missing and `git status` is clean: `git checkout wip/g4-wave-6b -- . && git reset -q`.
>   2. If the codespace was REBUILT (not just restarted): `npm ci`; `npx playwright install chromium`; Android SDK per
>      docs/ANDROID_SETUP.md (it lived in ~/android-sdk; JDK 21 at /usr/local/sdkman/candidates/java/21.0.12+1-ms).
>   3. Backups: `nohup tools/lead/backup-loop.sh wip/g4-wave-6b "wip: wave 6b integration" >/dev/null 2>&1 & echo $! > tmp/lead/backup-6b.pid`.
>   4. Lead items before the verifier (small; then add them to SOURCES in the verify script as a 'lead' list):
>      a. **Notebook cap (saves).** code-minors-6b item 5 measured every kind at its limit: 1,021,268 of 1,048,576
>         (97.4 %); with story cards at the validator's bounds 1,559,618 (148.7 %); nothing checks size at write time, so an
>         over-cap notebook would be written and then dropped whole at the next load. Lead ruling planned: raise
>         `NOTEBOOK_MAX_BYTES` (src/persistence/notebook.ts:31, our own D‑0070 number, pre-release) to 2 MiB so every record
>         the validators accept fits; add the validator-bounds case to the all-kinds test (bookmarks.test.ts:263) as the
>         tripwire; ARCH §11.2 line ~548; a new D‑entry.
>      b. CompareSetup.tsx:101 "Your dish and your saves are never changed by it." is false (completion autosaves Continue):
>         reword; fix pins.
>      c. challengeSave reuses a Try my dish 'try-n' baseline with the same checksum, so removing that Storage row silently
>         removes a challenge's starting point. Planned: challengeSave always writes its own 'ch-' record (shared only
>         among challenges); test.
>      d. store.ts SHELF_REMOVE_REFUSED names only "a Try my dish starting point or a snapshot bookmark": add challenge
>         starting points; pins.
>   5. Launch `Workflow({scriptPath: 'docs/agent/g4-wave-6b-integrate-verify.workflow.js.txt', args: {ownerMessage:
>      '<owner's latest message, verbatim>'}})` (verifier on 4392 + one repair round only for BLOCKER/MAJOR).
>   6. Then: `npm run check`; the desktop e2e project (all specs; one run, not beside the check); commit 6b with the
>      evidence; tick P4.5, P4.8 (transfer preview → Phase 5), P4.9; push; stop the backup loop; 7a pre-launch (LEAD
>      PRE-LAUNCH in docs/agent/g4-wave-7.tasks.js.txt: patch the `<lead: …>` placeholders, record D-<n>/D-<n+1>, free
>      ports, backup loop on wip/g4-wave-7a, launch 7a = android + perf2-polish).

> **Update 2026‑10‑12 03:10 UTC — WAVE 6b BUILT AND VERIFIED (run `wf_0527b70e-8ef` done; 11 agents, no BLOCKER/MAJOR
> left after two challenge-editor fix rounds). INTEGRATION RUNNING (run `wf_67897fae-84f`, launched 03:08 from session
> 78f75dc7: `docs/agent/g4-wave-6b-integrate.workflow.js.txt`). START HERE.**
> - The 6b tree before integration is backup commit `5b3e1e7` (the backup loop keeps moving wip/g4-wave-6b; use the hash).
> - Integration = code-minors-6b (4285: 14 MINOR/NIT items from the four verifier reports, incl. the Storage label for
>   challenge baselines, Shelf.put serialization, the all-kinds notebook size test, the variant-pair close note and
>   viewport labels, Lab commands reaching the narration listeners, Finish clearing kept) + docs-a11y-6b (4286: ARCH §7,
>   §10.3, §11.2, a11y sweep additions) + one verifier (4392), one repair round only for BLOCKER/MAJOR.
> - The lead meanwhile writes D‑0086…D‑0089 (6b as built; the challenge budget rule is an owner item, EXPANSION_RESPONSE §8).
> - If this session dies during integration: restore from `wip/g4-wave-6b` only if `git status` is clean; read the run's
>   journal; reports go to docs/reports/reviews/g4-wave-6b/integrate-*.md; resume the run with
>   `Workflow({scriptPath: 'docs/agent/g4-wave-6b-integrate.workflow.js.txt', resumeFromRunId: 'wf_67897fae-84f'})`
>   only in the same session, else re-run the unfinished fixer by hand.
> - After integration: npm run check; the desktop e2e project; commit; tick P4.5, P4.8 (transfer preview → Phase 5),
>   P4.9; stop the backup loop (`kill "$(cat tmp/lead/backup-6b.pid)"`); then 7a pre-launch (LEAD PRE-LAUNCH in
>   docs/agent/g4-wave-7.tasks.js.txt).

> **Update 2026‑10‑11 22:25 UTC — WAVE 6a COMMITTED (`ca8c184`), P4.6 and P4.7 ticked. WAVE 6b RUNNING (run `wf_0527b70e-8ef`, launched 22:24 from session 78f75dc7). START HERE.**
> - Evidence (commit message): check 1785/1786 with the one failure a timeout under load (goals-host, 121 s vs 120 s;
>   15/15 alone; its limit is now 600 s, re-run 26/26 with try-dish-host); all 74 desktop journeys of the touched specs
>   pass, stories on phone-portrait too.
> - The 6a as-built note is appended to the STATE of `docs/agent/g4-wave-6.tasks.js.txt`.
> - Wave 6b = `docs/agent/g4-wave-6b.run.workflow.js.txt`, built with tools/lead/build-run-file.py:
>   - stage 2: observation-notebook (4274, critical 'own': bookmarks, gallery, Storage panel) and challenge-editor (4275);
>   - stage 3: variants-paired (4276) and narration (4277);
>   - two rules verifiers (verifyGroups: [observation-notebook, challenge-editor] on 4390, [variants-paired, narration]
>     on 4391), one saves lens for observation-notebook (4396), re-verifier 4394;
>   - reports go to `docs/reports/reviews/g4-wave-6b/`.
> - Backups: `nohup tools/lead/backup-loop.sh wip/g4-wave-6b "wip: wave 6b in flight"` (pid in tmp/lead/backup-6b.pid;
>   log tmp/lead/backup-g4-wave-6b.log).
> - Wave 7 task file WRITTEN and REVIEWED (`docs/agent/g4-wave-7.tasks.js.txt`, commit 0c75dd3; writer report
>   docs/reports/reviews/g4-wave-7/writer.md): 7a = android (4281, critical) + perf2-polish (4282, critical: it edits src/sim
>   hash-neutrally); 7b = web-arcade (4283) + store (4284). Lead review at 22:45: every PROPOSED DECISION accepted, including
>   Filesystem saves on the native app (canonical; IndexedDB stays the web store; flipping back is one line; owner device
>   test). Before 7a: patch its `<lead: …>` placeholders with the 6b facts (LEAD PRE-LAUNCH 1a–1f), record D-<n>/D-<n+1>.
> - If this session dies mid-wave:
>   1. If `git status` is clean, restore with `git checkout wip/g4-wave-6b -- . && git reset -q`.
>   2. Read the run's journal (~/.claude/projects/-workspaces-pixelmeba/<session>/subagents/workflows/<run>/journal.jsonl)
>      and the reports in docs/reports/reviews/g4-wave-6b/.
>   3. Rerun only the unfinished builders: set `A.only` and give each a `finish` note (as wave 4b's resume did).
> - After 6b: integrate (MINORs, D‑0086+, ARCH §7/§11.2, a11y screens, check, desktop e2e of the touched journeys), commit,
>   tick P4.5, P4.8, P4.9. The LEAD AFTER WAVE 6 list in the tasks file has the rest (old saves load with every new kind
>   empty; tests/e2e/full-journey.spec.ts for P4.14; owner items for EXPANSION_RESPONSE §8).

> **Update 2026‑10‑11 21:15 UTC — RESUMED AFTER A CODESPACE RESTART (≈ 21:04; the session died ≈ 20:40). 6a STILL UNCOMMITTED.**
> - The tree matched backup `27ba3f6` exactly; new backup `wip/g4-wave-6a` = `10d6bad` (with the two test fixes below).
> - What the 19:03 runs showed:
>   - check: one failure only, a TIMEOUT. try-dish-host "the turns kind never alters behaviour" took 123.7 s under the
>     e2e's load against the 120 s default. Run alone, the file gave 11/11 in 122 s. Fix: an explicit `600_000` timeout
>     with the comparison tests' comment.
>   - e2e: 49 of the 51 that ran passed; [51/53] whatif:168 was cut off by the restart. stories.spec.ts:114 failed
>     because it still expected NO "Save picture" on the story card ("arrives with P4.6"). Fix: it now expects the
>     button, and a new final step proves Save picture opens the Share sheet on Picture with the card's title as the
>     question and that Close leaves the dish paused and unchanged.
> - Running (logs in `tmp/lead/`):
>   - `e2e-6a-rest.log`: port 4290, desktop stories + whatif :168 :237 :286 + garden, compare, experiments,
>     sound-settings, keyboard (25), then stories on phone-portrait;
>   - `check-6a2.log`: `npm run check` at nice 10.
> - The commit message draft is `tmp/lead/commit-6a.txt` (the EVIDENCE_PLACEHOLDER line is filled once both finish).
> - Then follow steps 1–5 of the 19:10 block below.

> **Update 2026‑10‑11 19:10 UTC — WAVE 6a INTEGRATED (verify ok); FINAL CHECK + DESKTOP E2E RUNNING; NOT YET COMMITTED.**
> - Integration run `wf_08608709-2c8` done: `integrate-code-minors-6a.md`, `integrate-docs-a11y-6a.md`,
>   `integrate-verify1.md` (ok: 1 MINOR + 3 NITs). The lead fixed them (`integrate-lead.md`); D‑0083…D‑0085 updated.
> - Running (logs in `tmp/lead/`): `npm run check` (check-6a.log) and 53 desktop journeys on port 4290 (e2e-6a.log):
>   share, try-dish, observe-tools, a11y-screens, whatif, new-dish, observe, keep-dish, save-reload, favorites,
>   stories, lab-tools, garden-home, goals. Still to run on desktop after them: garden, compare, experiments,
>   sound-settings, keyboard.
> - Commit message draft: the scratchpad's commit-6a.txt is lost on a restart. Rebuild it from the 15:00 commit style
>   and the 6a reports.
> - Then:
>   1. commit 6a;
>   2. tick P4.6 and P4.7;
>   3. `python3 tools/lead/append-as-built.py docs/agent/g4-wave-6.tasks.js.txt docs/agent/g4-wave-6a-as-built.draft.txt
>      6A_COMMIT=<sha> "6A_EVIDENCE=<check + e2e>"`;
>   4. build `docs/agent/g4-wave-6b.run.workflow.js.txt` with tools/lead/build-run-file.py (keys
>      `observation-notebook,challenge-editor,variants-paired,narration`);
>   5. free ports 4271‑4277 and 4390‑4397, move the backup loop to `wip/g4-wave-6b`, launch.
> - If this session dies: the tree is backed up on `wip/g4-wave-6a` every 30 min. Re-run the check and the e2e, then
>   continue from step 1.

> **Update 2026‑10‑11 17:45 UTC — WAVE 6a BUILT AND VERIFIED (0 BLOCKER/MAJOR after fix round 1); LEAD INTEGRATION RUNNING.**
> - Wave 6a run `wf_84c01253-c83` (2.7 h): share, try-my-dish and observation-map. Reports:
>   `docs/reports/reviews/g4-wave-6a/`.
> - Tree backup before integration: `wip/g4-wave-6a` = `d5a0c32`.
> - Running: `docs/agent/g4-wave-6a-integrate.workflow.js.txt`, run `wf_08608709-2c8`.
>   - code-minors-6a: Share sheet blocks dish keys; one import-refusal toast in UX §5.11 form; map intro copy; share
>     tests read versions; Try my dish clears `kept` after journal, favorite and goal ops.
>   - docs-a11y-6a: ARCH §7/§11.2 for 6a; a11y sweep of the 6a screens.
>   - Then one verifier.
> - Lead rulings for D‑0083…D‑0085 (being written):
>   - probe masks survive Undo; their records reset;
>   - the relationship map's +0.3 ms/tick goes to P4.13 and EXPANSION_RESPONSE;
>   - the shelf's 10-baseline cap ships with 6b's Storage panel in the same release;
>   - recipe files need an exact build match (owner item).
> - If this session dies:
>   1. If the tree is clean, restore `wip/g4-wave-6a`.
>   2. Read `integrate-*.md` and rerun only unfinished parts.
> - Then: check, desktop e2e, commit, tick P4.6 and P4.7, build 6b
>   (`observation-notebook,challenge-editor,variants-paired,narration`) with a STAGE-1-as-built note, launch.

> **Update 2026‑10‑11 15:00 UTC — WAVE 5b COMMITTED (`c3f214e`), P4.1–P4.4 ticked. WAVE 6a LAUNCHING. START HERE.**
> - Evidence for 5b:
>   - check 169 files / 1714 tests;
>   - the three re-run journeys 6/6 on desktop and phone-portrait;
>   - verifiers ok.
>   - D‑0076…D‑0079, including the D‑0079 first-minute amendment.
> - Wave 6 pre-launch done in this commit:
>   - the 28 placeholders patched (tools/lead/patch-wave6-placeholders.py);
>   - D‑0080 (share picture from a snapshot), D‑0081 (Try my dish clones), D‑0082 (scope calls: shelf, transfer preview
>     → Phase 5, recipe card = Starting recipe file, …);
>   - `docs/agent/g4-wave-6a.run.workflow.js.txt` (share 4271, try-my-dish 4272, observation-map 4273).
> - Reports go to `docs/reports/reviews/g4-wave-6a/`. Backups: `wip/g4-wave-6a` every 30 min.
> - If this session dies mid-wave:
>   1. If the tree is clean, restore from `wip/g4-wave-6a`.
>   2. Read the reports.
>   3. Rerun only unfinished builders: set `A.only` and give each a `finish` note.
> - After 6a:
>   1. integrate (MINORs, D‑0083+, check, desktop e2e, ARCH §7/§11.2);
>   2. commit;
>   3. tick P4.6 and P4.7;
>   4. build 6b with the same tool: keys `observation-notebook,challenge-editor,variants-paired,narration`, stages 2
>      then 3.

> **Update 2026‑10‑11 13:35 UTC — 5b INTEGRATED except ONE follow-up (running). START HERE.**
> - Integration fixers and verifier done (`integrate-*.md`, verify ok). The lead's own fixes:
>   - the saveFile import refs plus a host test;
>   - Notebook Back during a story visit;
>   - goal-sentence tests;
>   - ARCH §7/§11.2 for 5b.
>   - Decisions D‑0076…D‑0079 written (uncommitted).
> - check: 169 files / 1709 tests green at 12:32.
> - Desktop e2e at 13:27: 11/13 passed. garden-home :54 and keep-dish :553 failed because the story notice "An
>   enzyme at work" outranks "Tap a Sprinter." right after Run.
> - Lead decision (amends D‑0079): the story pacer's window starts when a dish opens, so the first story notice comes
>   at least 60 dish‑seconds later.
> - Running: `docs/agent/g4-wave-5b-first-minute.workflow.js.txt`, run `wf_5932c567-024` (one fixer and one verifier).
> - Then:
>   1. check plus the desktop e2e again;
>   2. commit 5b, then tick P4.2 and P4.4;
>   3. run `python3 tools/lead/patch-wave6-placeholders.py <5b commit> "<evidence>"`;
>   4. append D‑0080…D‑0082 (from `docs/agent/g4-wave-6-prelaunch-decisions.draft.md`);
>   5. run `python3 tools/lead/build-run-file.py docs/agent/g4-wave-6.tasks.js.txt g4-wave-6a "<desc>" "<owner ctx>"
>      share,try-my-dish,observation-map docs/agent/g4-wave-6a.run.workflow.js.txt`;
>   6. free ports 4271‑4277;
>   7. launch.

> **Update 2026‑10‑11 ≈ 11:40 UTC — WAVE 5b BUILT AND VERIFIED (0 BLOCKER/MAJOR); LEAD INTEGRATION RUNNING. START HERE.**
> - Wave 5b run `wf_12469c4e-45d`: stories, objectives and notice-cards built.
>   - Verdicts: the rules verifier and the objectives saves verifier both ok, 7 MINORs for the lead.
>   - Reports: `docs/reports/reviews/g4-wave-5b/`.
> - Tree backup before integration: `wip/g4-wave-5b` = `d0c3c69`. Decisions written (uncommitted): D‑0076 (notice cards)
>   and D‑0079 (pacing per source). D‑0077 (stories) and D‑0078 (objectives) are written after the integration
>   reports.
> - Running: `docs/agent/g4-wave-5b-integrate.workflow.js.txt`, run `wf_56005330-618`.
>   - objectives-minors fixer: rollback reason, restore change list, resumed event id, import support check, canonical
>     progress.
>   - stories-minors fixer: pause-and-restore on Open → Spotlight, the family caption wording, articles and plurals.
>   - Then one verifier, and a repair round only for a BLOCKER/MAJOR.
> - If this session dies:
>   1. If `git status` is clean, restore with `git checkout wip/g4-wave-5b -- . && git reset -q`.
>   2. Read `docs/reports/reviews/g4-wave-5b/integrate-*.md`.
>   3. Rerun only the unfinished parts of that workflow file.
> - Then:
>   1. check, desktop e2e (stories, goals, favorites, garden-home, keep-dish, a11y-screens);
>   2. commit;
>   3. tick P4.2 and P4.4;
>   4. wave 6a pre-launch: patch the 22 `<lead: …>` placeholders, number the decisions in
>      `docs/agent/g4-wave-6-prelaunch-decisions.draft.md` (D‑0080…);
>   5. build the 6a run file and launch.

> **Update 2026‑10‑11 09:45 UTC — WAVE 5a COMMITTED (`9b40210`), P4.1 and P4.3 ticked. Wave 5b RUNNING (run `wf_12469c4e-45d`, launched 09:48). START HERE.**
> - Evidence:
>   - check 162 files / 1623 tests;
>   - desktop e2e 9/9 (favorites, garden-home, keep-dish ×4, a11y pages and wave 5a);
>   - integration verify ok: `docs/reports/reviews/g4-wave-5a/integrate-verify1.md`. Its three MINORs are wave 5b's
>     `notice-cards` task.
> - Wave 5b = `docs/agent/g4-wave-5b.run.workflow.js.txt`:
>   - stories (P4.2, port 4272); objectives (P4.4, port 4274, critical); notice-cards (port 4271);
>   - reports go to `docs/reports/reviews/g4-wave-5b/`.
>   - Backups: `tools/lead/backup-tree.sh wip/g4-wave-5b` every 30 min.
> - If this session dies mid-wave:
>   1. If `git status` is clean, restore with `git checkout wip/g4-wave-5b -- . && git reset -q`.
>   2. Read the 5b reports.
>   3. Rerun only the unfinished builders: set `A.only` and give each a `finish` note, as wave 4b's resume did.
> - Wave 6 task file WRITTEN (`docs/agent/g4-wave-6.tasks.js.txt`, writer report `docs/reports/reviews/g4-wave-6/writer.md`).
>   - Stage 1: share 4271, try-my-dish 4272, observation-map 4273.
>   - Stage 2: observation-notebook 4274, challenge-editor 4275.
>   - Stage 3: variants-paired 4276, narration 4277.
>   - Lead review (10:00): accept every PROPOSED DECISION. The "shelf" (write-once slot records outside the ten named
>     slots) is the reading of SPEC §13.6 "an immutable baseline into a slot"; owner review: yes.
>   - Before launch: patch its `<lead: …>` placeholders with the wave 5b facts; record g4-plan calls 3 and 4 and the
>     writer's decisions as D-numbers after wave 5b's; run 6a, then 6b (its LEAD PRE-LAUNCH header).
> - After 5b:
>   1. Lead integration: MINORs, D‑0076 (the notice-card rules), D‑0077+, check, desktop e2e of the touched
>      journeys, commit, tick P4.2 and P4.4.
>   2. Then wave 6 (P4.5–P4.9): one task-file writer, then the run file.

> **Update 2026‑10‑11 08:55 UTC — RESUMED AFTER THE OVERNIGHT STOP (owner: "lets get started"). START HERE.**
> - What survived: wave 5a (favorites P4.1, garden-home P4.3) finished at 02:22 (re-verify ok). The lead's
>   integration run `wf_811f8395-c0f` died at about 02:41. Its e2e-docs fixer had finished. Its code-minors fixer had
>   also finished its fixes and final tests, 13 files / 174 passed, but wrote no report. The tree matched backup
>   `wip/g4-wave-5a` = `a1efb6b` exactly.
> - Done since the resume:
>   - both fixer reports saved, in `docs/reports/reviews/g4-wave-5a/integrate-{code-minors,e2e-docs}.md`;
>   - the lead's hardening `undoLabels: []` in duplicateDish;
>   - D‑0075 (a duplicated dish shares no worker state); D‑0073 and D‑0074 had already been written at 02:25.
> - Running:
>   - the integration verifier `docs/agent/g4-wave-5a-integrate-verify.workflow.js.txt`, run `wf_38e11b55-360`
>     (verify, then repair and re-verify only for a BLOCKER/MAJOR);
>   - the lead's `npm run check`, at nice 10, log in tmp/lead/check-5a.log;
>   - backups every 30 min to `wip/g4-wave-5a`.
> - Next:
>   1. commit wave 5a;
>   2. tick P4.1 and P4.3;
>   3. fill `STAGE1_AS_BUILT` in `docs/agent/g4-wave-5b.run.workflow.js.txt` (already made from the 5a file:
>      only stories + objectives, WAVE_ID g4-wave-5b);
>   4. launch wave 5b.
> - If this session dies before the 5a commit:
>   1. the tree is on `wip/g4-wave-5a`;
>   2. read `docs/reports/reviews/g4-wave-5a/integrate-verify*.md`;
>   3. rerun only what is unfinished, from the verify workflow file.

> **Update 2026‑10‑10 23:00 UTC — PHASE 4 PRE-LAUNCH COMMITTED; OWNER WILL REFRESH THE CODESPACE SOON. START HERE.**
> - Committed with this note: D‑0070…D‑0072 (Phase 4 calls 1, 2, 6), content/manifest.json buildPhase 3 → 4 (contentHash
>   14d6ce67…; check green, fence unmoved), the wave 5 STATE filled, the runner's phone-portrait rule, the wave 5a run file
>   `docs/agent/g4-wave-5a.run.workflow.js.txt` (favorites + garden-home, A.only) and `tools/lead/backup-tree.sh`.
> - BEST REFRESH POINT: right after this commit, before wave 5a launches (nothing running). Next clean point: after wave 5a
>   is integrated and committed.
> - If wave 5a is running when the codespace restarts: its uncommitted work is in the tree (and in `wip/g4-wave-5a` on
>   origin, refreshed every 30 min by `tools/lead/backup-tree.sh wip/g4-wave-5a`). If `git status` is clean after the
>   restart, restore with `git checkout wip/g4-wave-5a -- . && git reset -q`. Read docs/reports/reviews/g4-wave-5a/ for any
>   finished reports, then rerun only the unfinished builders from the run file with a `finish` note each (as wave 4b's
>   resume did: docs/agent/g3-wave-4b-resume.run.workflow.js.txt).

> **Update 2026‑10‑10 22:15 UTC — G3 GATE PASSED, TAG `g3`. START HERE.**
> - `main` = the gate commit (tag `g3`) on top of `1eb3025`; clean and pushed. WORKLOG: P3.1–P3.12 and the G3 gate ticked.
>   Decisions through D‑0069. Evidence: check 154 files / 1542 tests; e2e 258/258 (3.0 h, all three projects) at 1eb3025;
>   determinism 6148ff0d080999c4; conservation all pools C 6.1e-13 %, N 7.1e-12 %; quiet perf CPU p50 12.0 / p95 20.8 ms.
> - `wip/g3-gate` and `wip/g3-wave-4b` are obsolete (content committed).
> - Next: **Phase 4 wave 5** — follow the "LEAD PRE-LAUNCH" header of `docs/agent/g4-wave-5.tasks.js.txt`:
>   1. replace every `<lead: …>` in its STATE (wave 4 stage 2 = D‑0065…D‑0067, EXP_104 = D‑0068 revision 2 shipped, gate
>      fixes = D‑0069);
>   2. record g4-plan.md calls 1, 2 and 6 as D‑0070, D‑0071, D‑0072 and bump content/manifest.json buildPhase 3 → 4 in the
>      same commit (`content-validate --write`, `npm run check`, the fence must not move);
>   3. free ports 4271–4274; build run files 5a (favorites, garden-home) and 5b (stories, objectives) with
>      `docs/agent/g4-runner-ft.workflow.js.txt`; every agent prompt starts with OWNER_CONTEXT;
>   4. **new rule from the G3 gate:** builders who add or change e2e journeys run them on phone-portrait as well as desktop
>      (the waves 2–4 desktop-only runs hid nine phone failures until the gate).

> **Update 2026‑10‑10 15:35 UTC — WAVE 4 STAGE 2 COMMITTED (`d3a3027`); PAUSED FOR THE OWNER'S CODESPACE RESTART. START HERE.**
> - `main` is clean and pushed. P3.1–P3.12 are ticked; P3.12 has two criteria open (D-0066). Decisions run through
>   D-0067. No workflow is running. `wip/g3-wave-4b` is obsolete (its content is committed).
> - Evidence: check 153/153 files, 1536/1536 tests; desktop e2e compare + inspector + keyboard 8/8; a11y-screens and
>   launch-ecology from the builders' runs. Reviews: `docs/reports/reviews/g3-wave-4b/`.
> - Next, in order:
>   1. **EXP_104 revision 2** (`docs/reports/exp104-revision-probe.md`):
>      - HIDDEN_NEIGHBORHOOD_V1 revision 2 with `backgroundOverrides.oxygen` 0.03;
>      - texts that say the dish starts low in oxygen and when to look (the first ~10–20 s);
>      - re-pin tests/experiments/hidden-neighborhood.test.ts to the measured revision-2 outcome;
>      - `npx tsx tools/content-validate.ts --write`, then `npx tsx tools/fence-update.ts` for its entries with
>        reason D-0068;
>      - the experiments-g3.md section; D-0068 (owner review).
>   2. **Cheap open MINORs before the gate** (lists in wave-verify.md, saves-verify-perf.md, D-0065, D-0066):
>      - DishSummary says "extinct" for a species held only in a Sample: count held organisms;
>      - keyboard.spec's second test: assert the pan and the cell description;
>      - restoreFocus can let Enter place at a hidden centre;
>      - commit the D-0015 re-measure script (tmp/evidence/d0015-remeasure.ts) under tools/, or paste its patch list
>        into tune-g3.md.
>   3. **G3 gate ritual** (header "LEAD AFTER WAVE 4" of `docs/agent/g3-wave-4.tasks.js.txt`):
>      - a quiet-machine perf table: `node --expose-gc --import tsx tools/perf-stress.ts` with NO agents running,
>        plus render:bench;
>      - the full three-project `npm run test:e2e` (≈ 1.5 h). Scope any toast-text check the live region collides
>        with to `.toast` (D-0065);
>      - content:validate;
>      - sim:tune for changed recipes only (EXP_104's);
>      - regenerate relationships-g3.md (stale contentHash header);
>      - determinism and conservation numbers into EXPANSION_RESPONSE; fill every `<lead>` gap in §1–§8;
>      - commit "gate: g3", tag `g3`, `git push --tags`.
>   4. **Phase 4 wave 5** (`docs/agent/g4-wave-5.tasks.js.txt`):
>      - read its LEAD PRE-LAUNCH header and its 13 PROPOSED DECISIONs;
>      - record g4-plan calls 1, 2 and 6 plus the accepted proposals as D-numbers;
>      - bump buildPhase to 4;
>      - build run files 5a/5b with `docs/agent/g4-runner-ft.workflow.js.txt`.
>      If the owner's latest message holds anything besides the build, prefix every agent prompt with an
>      OWNER_CONTEXT note (memory: feedback-cross-project-messages).

> **Update 2026‑10‑10 13:26 UTC — RESUMED (owner: "lets get started"; the machine was not restarted, the tree ==
> `wip/g3-wave-4b` + RESUME.md).** Stage 2 RESUME RUNNING from `docs/agent/g3-wave-4b-resume.run.workflow.js.txt`
> (run `wf_be769e01-75e`; the first try `wf_225c5a01-0c8` did nothing: every agent saw the owner's Reddit request and wrote a
> post instead, so every prompt now starts with OWNER_CONTEXT): a11y PREBUILT (verify only), perf + g3-evidence finish from the tree; rules verifier over all
> three + perf's own saves verifier; reports `docs/reports/reviews/g3-wave-4b/`. If this session dies mid-run: back up
> the tree onto `wip/g3-wave-4b` again (temp-index commit, parent = the branch), read the new reports, and rerun only
> what is unfinished (edit RESUME_TASKS in that file: a finished builder becomes `prebuilt` with a pointer to its report).
> 13:57 backup of the in-flight tree: `wip/g3-wave-4b` = `76b85e0` (local + origin; restore the same way as 930bb9a).
> Also running (planning only): the wave 5 task writer `docs/agent/g4-wave-5-tasks.workflow.js.txt` (run `wf_8b5d09bc-b0f`; first try `wf_4df67f51-cf1` derailed the same way)
> → `docs/agent/g4-wave-5.tasks.js.txt`; patch its STATE's D-numbers and g3 facts after the gate; wave 5 launches after tag g3.
> 13:50: the writer FINISHED (committed): favorites 4271 s1 critical, garden-home 4273 s1, stories 4272 s2, objectives 4274 s2
> critical. Before launch read its header "LEAD PRE-LAUNCH" and its 13 PROPOSED DECISIONs (journal of run `wf_8b5d09bc-b0f`;
> key ones: buildPhase 3→4 bump by the lead, run as 5a then 5b, notebook = top-level `notebook` sibling of `state` outside
> the checksum with its own sha256, malformed notebook dropped whole with a message).

> **Update 2026‑10‑10 13:20 UTC — PAUSED BY THE OWNER FOR A CODESPACE REFRESH. START HERE.**
> - `main` = `072478e` + this note, pushed. P3.1–P3.10 are ticked; decisions run through D-0064; stage 1 is committed
>   (`8c8a65f`).
> - Wave 4 STAGE 2 was STOPPED by the lead at 13:20 (workflow stopped, orphaned e2e killed). Its uncommitted work is
>   in the tree and on `wip/g3-wave-4b` = `930bb9a` (local + origin). If `git status` is clean after the restart,
>   restore it with `git merge --squash wip/g3-wave-4b && git reset -q`.
> - State of each task at the stop:
>   - **a11y: BUILT, not verified.** Report: `docs/reports/reviews/g3-wave-4b/a11y-build.md` (52 screens axe-clean,
>     keyboard journey, contrast.md). Files:
>     - src/ui/a11y/*, tools/contrast-audit.ts, docs/reports/contrast.md;
>     - tests/ui/a11y-{describe,contrast}.test.ts, tests/e2e/{keyboard,a11y-screens}.spec.ts;
>     - src/ui/styles.css, src/ui/state.ts, src/ui/panels/OverlayLegend.tsx;
>     - src/ui/app/App.tsx and src/ui/views/{DishScreen,CompareScreen,ExperimentRun,SimplePage}.tsx;
>     - src/render/{layers,renderer}.ts.
>   - **perf: MID-BUILD, no report.** Files:
>     - src/sim/{entities,fields,founders,fungi,intake,movement,transport}.ts and src/worker/snapshot.ts;
>     - tools/render-bench{,-run}.ts, tools/perf-stress.ts, tests/perf/stress-shape.test.ts.
>     
>     Hash neutrality is NOT proven. Never commit these src/sim edits until the fence (g2-replay + the four
>     trajectory-fence files) and determinism pass and perf's own saves/determinism verifier has looked.
>   - **g3-evidence: MID-BUILD, no report.**
>     - Files: tests/fixtures/determinism-g3.test.ts, docs/reports/tune-g3.md (sim:tune wrote it at 13:18; check its
>       tail is complete), tests/e2e/launch-ecology.spec.ts (its desktop run was interrupted).
>     - The EXPANSION_RESPONSE G3 draft is NOT started.
> - Next:
>   1. Rerun stage 2 from `docs/agent/g3-wave-4b.run.workflow.js.txt`.
>      - Give perf and g3-evidence a `finish` note each: "your partial work is in the tree (files above); re-read it
>        with git diff, continue, do not restart".
>      - With `A.only`, the verifier sees only the listed tasks. Either keep a11y in with a finish note ("built:
>        rerun your BEFORE FINISHING checks only, keep your report"), or verify a11y yourself (review its diff, run its
>        unit tests + keyboard and a11y-screens on desktop).
>   2. Integrate as in the 12:52 entry.
>   3. Apply the EXP_104 revision 2 (13:00 entry).
>   4. Run the G3 gate.
>   5. Start Phase 4 (`docs/agent/g4-plan.md`).

> **Update 2026‑10‑10 ≈ 04:40 UTC — RESUMED (owner: "pick back up … the next ten or so hours"). START HERE if this session died.**
> - Wave 3 is still UNCOMMITTED in the tree (backup `wip/g3-wave-3` = `fd88c91`; tree == backup + RESUME.md). Open items (a)/(b)
>   were already applied by the interrupted fixer; lead run: film, host-specificity, chemistry + g2-replay + four fence files +
>   conservation-closed-lid → 9 files, 77/77 passed (341 s). Round-2 re-verify SKIPPED (test-only + observation-only fixes, lead runs green).
> - Decisions D-0051…D-0058 written (uncommitted) in docs/DECISIONS.md.
> - Running: `docs/agent/g3-wave-3-lead-fix.workflow.js.txt` (one fixer: stale FLAG.moving, E07 light test, E04/E12 lockout
>   convention, E12 + module-param import refusals, NITs; report `docs/reports/reviews/g3-wave-3/lead-fixes.md`) and
>   `docs/agent/g3-wave-4-tasks.workflow.js.txt` (writer → `docs/agent/g3-wave-4.tasks.js.txt`, stages 1/2).
> - **13:00 UTC: lead prep done while stage 2 runs (all committed + pushed).**
>   - `docs/reports/exp104-revision-probe.md`: a starting O2 of 0.03–0.05 reaches EXP_104's gate. The candidate is
>     revision 2 with `backgroundOverrides.oxygen` 0.03 and texts that say when to look (the first ~10–20 s). Apply it
>     after stage 2: content edit, re-pin hidden-neighborhood.test.ts, content-validate --write, fence-update, D-number.
>     The other option is to keep the card out of v1.0; either way it is an owner item.
>   - Phase 4 is ready to launch after tag `g3`:
>     - `docs/agent/g4-plan.md` (three waves, six lead calls; record calls 1, 2 and 6 as D-numbers);
>     - `docs/agent/g4-runner-ft.workflow.js.txt` (the Phase 4 preamble);
>     - `docs/agent/g4-wave-5-tasks.workflow.js.txt` (one writer → `docs/agent/g4-wave-5.tasks.js.txt`). Run it
>       during the G3 gate's long runs, then build the wave 5 run file the same way as stage 2's.
> - **12:52 UTC: SAFE POINT — stage 2 still RUNNING** (launched 11:12 from `docs/agent/g3-wave-4b.run.workflow.js.txt`).
>   At 12:52: a11y built (`docs/reports/reviews/g3-wave-4b/a11y-build.md`); perf and g3-evidence still building; no
>   verify yet. Tree snapshot: `wip/g3-wave-4b` = `42dd462` (local + origin; backup only, NOT verified, do not merge
>   as is). IF THIS SESSION DIED: `git status` — if the stage 2 files are still in the tree, keep them (re-snapshot onto
>   `wip/g3-wave-4b` with a temp-index commit); if the tree is clean, restore with
>   `git merge --squash wip/g3-wave-4b && git reset -q`. Read every report in `docs/reports/reviews/g3-wave-4b/`
>   (the run journal dies with the session). Rerun ONLY what is unfinished: in the run file set `A.only` (line ~344)
>   to the unfinished keys and give each a `finish` note (what is already in the tree, "continue, do not restart").
>   A task whose build report exists but has no verify: run the verify only (or, lean, lead-review its diff + run its
>   tests). Then integrate as below (MINORs, D-0065+, check, desktop e2e of keyboard + a11y-screens + any journey the
>   diff touches, commit, tick P3.11/P3.12, push).
> - **11:12 UTC: WAVE 4 STAGE 1 COMMITTED `8c8a65f`** (D-0061…D-0064; P3.8-P3.10 ticked; check 148/149 files + film fixed 15/15;
>   desktop e2e 17/17). STAGE 2 RUNNING from `docs/agent/g3-wave-4b.run.workflow.js.txt` (a11y 4261, perf 4262 [own saves
>   verifier], g3-evidence 4263; reports `docs/reports/reviews/g3-wave-4b/`; no content edits). After it: integrate (MINORs,
>   D-0065+, check, new journeys), commit, tick P3.11/P3.12; EXP_104 recipe revision (or keep it out of the shipped cards,
>   D-0062); then the G3 gate ritual (wave 4 tasks header "LEAD AFTER WAVE 4"): quiet-machine perf table, full three-project
>   e2e, content:validate, sim:tune, relationships-g3.md regenerated, EXPANSION_RESPONSE §1-§8, tag g3.
> - **08:10 UTC: MODULE FLIP COMMITTED `50c7c32` (+ docs `3d545dd`; D-0059, D-0060), P3.7 ticked; WAVE 4 STAGE 1 RUNNING** from
>   `docs/agent/g3-wave-4a.run.workflow.js.txt` (field-guide 4251, g3-fixtures 4253, experiments-curated 4252, audio 4254; verifiers
>   [field-guide+audio], [experiments-curated+g3-fixtures]; reports `docs/reports/reviews/g3-wave-4/`). Builders edit the tree and
>   never commit. If this session dies mid-run: `git status`; back up the tree on a LOCAL `wip/g3-wave-4a` branch with a temp-index
>   commit; read the reports; rerun only unfinished tasks (`only` + `finish` notes). After stage 1: integrate (MINORs, decisions
>   D-0061+, check, the new journeys on desktop), commit, tick P3.8-P3.10; then build the stage 2 run file the same way
>   (A.only = ['a11y','perf','g3-evidence'], perf critical 'own') and run it; then the G3 gate (wave 4 tasks header "LEAD AFTER").
> - **05:40 UTC: WAVE 3 COMMITTED `a792e07`** (check 1352/1352; fence 77/77; desktop e2e 10/10); P3.5, P3.6 ticked. Next: the
>   module flip (`docs/agent/g3-module-flip.workflow.js.txt`, D-0059) → commit → wave 4 stage 1
>   (`docs/agent/g3-wave-4a.run.workflow.js.txt`) → integrate + commit → stage 2 (a11y, perf, g3-evidence) → G3 gate.
> - (older) Next: review the fixer diff → `npm run check` → desktop e2e (reactions, food-objects, sample-transfer, experiments, cordweaver
>   journeys) → commit wave 3 + push → module flip (one agent + a saves lens; D-0059) → commit → wave 4 (stage 1: field-guide,
>   experiments-curated, g3-fixtures, audio; stage 2: a11y, perf, g3-evidence) → G3 gate.

> **Update 2026‑10‑01 ≈ 23:15 UTC — PAUSED for a codespace restart near the end of wave 3. START HERE.**
> - `main` = wave 2 + docs (`552d60e`), pushed. Tags g0 g1 g2. P3.1–P3.4 ticked, P3.7 `[~]`; decisions through D‑0050.
> - Wave 3 (eight builders) is UNCOMMITTED in the working tree (107 paths) and backed up on branch `wip/g3-wave-3` =
>   `fd88c91` (local and on origin). The disk normally survives a restart; only if `git status` is clean, restore with
>   `git merge --squash wip/g3-wave-3 && git reset -q` (applies the snapshot without committing).
> - Done: all eight builds; two rules verifiers + two saves verifiers; fix round 1 (f02-links, food-objects, tools-sample)
>   and its re-verify; fix round 2 for e1-producers (report `e1-producers-fix2.md`: chemistry.test M01 pin fixed,
>   producersNear credits only a producer whose bit is set). Reports: `docs/reports/reviews/g3-wave-3/`; the run journal
>   is gone with the session, so read the .md reports (wave-verify-1/2, saves-verify-*, *-fix1, wave-reverify1).
> - Interrupted: fix round 2 for f02-links (its partial edits are in the tree) and the round-2 re-verify. Open items
>   (all test-only, from `wave-reverify1.md`): (a) tests/fixtures/film.test.ts ≈ :385 and :402 build a no-film/no-fungi
>   registry by removing only B02/F01 — remove F02 too now that it is enabled; (b) tests/fixtures/host-specificity.test.ts
>   ≈ :94 "dense dish of every enabled species" packs 18 species into the same rows, so B01 never meets the phage —
>   fix the layout, not the sim; (c) record the tools-sample PROPOSED DECISION (event-ring / commands.log caps vs an exact
>   Cancel: exact means stateHash-exact, D‑0037).
> - Next, in order (lean): (1) the lead finishes (a) and (b) directly (test-only; check what the interrupted fixer already
>   changed with `git diff tests/fixtures/film.test.ts tests/fixtures/host-specificity.test.ts`), runs those files plus the
>   fence; (2) one re-verifier (effort high) over the round-2 fixes (e1-producers + f02-links) — or skip it if (a)/(b) stay
>   test-only and the lead's runs are green; (3) lead integration: read the MINORs in all wave 3 reports, record
>   D‑0051+ from every PROPOSED DECISION (owner calls listed in the wave 3 tasks writer summary: E04 rim support,
>   anchored carriers as "free" prey, E12 "free", E12 link-cost category), `npm run check`, desktop e2e of the new
>   journeys (cordweaver, food-objects, reactions, sample-transfer, plus experiments), commit, push; (4) the LEAD MODULE
>   FLIP (checklist in the header of `docs/agent/g3-wave-3.tasks.js.txt`), tick P3.5–P3.7; (5) wave 4 (plan W5 + W6)
>   task file with one writer (same prompt shape as wave 3's), then wave 4 and the G3 gate.
> - Environment: stop servers by port (`for p in $(seq 4173 4399); do lsof -t -i :$p | xargs -r kill; done`).

> **Update 2026‑10‑01 ≈ 18:15 UTC — WAVE 2 COMMITTED (`1cfe848`), WAVE 3 RUNNING. START HERE if this session died.**
> - P3.3, P3.4 ticked. Decisions D‑0047…D‑0050 (owner flags: D‑0047 four-neighbour fungi, D‑0048 Dusk needs low oxygen).
> - Wave 3 (eight builders: e1-producers 4231, f02-links 4232, food-objects 4233, tools-sample 4234, mod-anchor-light 4235,
>   mod-feeding 4236, mod-builders 4237, mod-adhesion 4238) runs from `docs/agent/g3-wave-3.run.workflow.js.txt`
>   (copy to the scratchpad as .js, pass as `scriptPath`). Two rules verifiers, two saves verifiers (tools-sample alone;
>   f02-links + food-objects + mod-adhesion). Reports in `docs/reports/reviews/g3-wave-3/`.
> - If the session died mid-wave: `git status`; keep uncommitted work on a LOCAL `wip/g3-wave-3` branch; read the reports;
>   rerun only unfinished tasks (`A.only = [...]` and a `finish` note per task).
> - After wave 3: lead integration → the LEAD MODULE FLIP checklist in the header of `docs/agent/g3-wave-3.tasks.js.txt`
>   (moduleRegistryVersion 2, fence-update with a decision, pinned tests, full Playwright once) → tick P3.5–P3.7 → wave 4
>   (plan W5 + W6) task file → wave 4 → G3 gate.

> **Update 2026‑10‑01 ≈ 14:30 UTC — WAVE 1 COMMITTED (`08768df`), WAVE 2 RUNNING. START HERE if this session died.**
> - P3.1, P3.2 ticked; P3.7 `[~]`. Decisions D‑0043…D‑0046 (owner flags: D‑0044 bead surfaces, D‑0046 B01/B06).
> - Wave 2 runs from `docs/agent/g3-wave-2.run.workflow.js.txt` (copy to the scratchpad as .js, pass as `scriptPath`):
>   film-fungi 4221, organisms 4222, parasites-phage 4223 (critical → saves lens), art-features 4224; builders edit
>   the main tree and never commit; reports in `docs/reports/reviews/g3-wave-2/`.
> - If the session died mid-wave: `git status`; keep uncommitted work on a LOCAL `wip/g3-wave-2` branch; read the
>   reports; rerun only unfinished tasks (`A.only = [...]` and a `finish` note per task in the run file).
> - After wave 2: lead integration (MINORs, D‑0047+, `npm run check`, desktop e2e of the touched journeys, commit,
>   tick P3.3/P3.4) → wave 3 task file (one writer, same prompt shape as `g3-wave-2-tasks`) → wave 3.

> **Update 2026‑10‑01 ≈ 13:40 UTC — RESUMED (owner: "lets get started"). START HERE if this session died.**
> - Wave 1 work is still uncommitted in the tree (backup `wip/g3-wave-1`). The lead fixed the cheap wave 1 MINORs
>   (construction above the cap, B13 bead preview test, Gel Colony keep-dish case, 1 → 4 migration fixture,
>   module-accounting `construction`, chemistry journey budget) and recorded D‑0043…D‑0045 — also uncommitted.
> - Running: the art-organisms verification (one combined rules + player verifier; report
>   `docs/reports/reviews/g3-wave-1/art-organisms-verify.md`) and the wave 2 task writer
>   (→ `docs/agent/g3-wave-2.tasks.js.txt`). New fast-track runner template: `docs/agent/g3-runner-ft.workflow.js.txt`
>   (builders unit + own e2e on desktop; one wave verifier; a saves lens only for `critical` tasks).
> - Next: art findings → D‑0046 → `npm run check` + desktop e2e of the touched journeys → commit wave 1 → tick P3.1,
>   P3.2, mark P3.7 `[~]` → assemble `docs/agent/g3-wave-2.run.workflow.js.txt` (meta + tasks + runner, `WAVE_ID`)
>   → run wave 2.

> **Update 2026‑10‑01 ≈ 11:45 UTC — PAUSED for a codespace restart, mid Phase 3 wave 1. START HERE.**
> - `main` = `g2` + Preflight (`4c5c0b8`, D‑0042) + docs; pushed. Tags g0 g1 g2.
> - Wave 1's four builders FINISHED (foundation = world schema 4, environment = P3.1/P3.2, stage8 = P3.7
>   framework, art-organisms = 14 species' art). Their work is UNCOMMITTED in the working tree (75 paths) and
>   backed up on branch `wip/g3-wave-1` = `d015a98` (local and on origin). The disk normally survives a
>   restart, so `git status` should still show them; only if the tree is clean, restore them with
>   `git merge --squash wip/g3-wave-1 && git reset -q` (applies the snapshot without committing).
> - Verified ok (MINORs only): foundation, stage8, environment (rules and player). Reports:
>   `docs/reports/reviews/g3-wave-1/*.md`. NOT yet verified: art-organisms (rules lens was stopped mid-run; the
>   player lens never started).
> - **Next, in order (lean, owner's usage note):** (1) one workflow for the art-organisms verification only
>   (rules + player, effort high: run `docs/agent/g3-wave-1.run.workflow.js.txt` with `A.only = ['art-organisms']`
>   and the build step replaced by its existing report `docs/reports/reviews/g3-wave-1/art-organisms-build.md`, or
>   a two-agent verify script); (2) lead integration: read the MINORs in the verify reports and fix the cheap ones,
>   record decisions D‑0043+ from the builders' PROPOSED DECISIONs, `npm run check`, targeted e2e (the specs the
>   builders touched: lab-tools, new-dish, garden, inspector, chemistry/habitat journeys), commit, push, tick P3.1
>   and P3.2, mark P3.7 `[~]`; (3) write wave 2's task file with ONE writer (as wave 1's), then run wave 2.
> - Environment: stop servers by port (`for p in $(seq 4173 4399); do lsof -t -i :$p | xargs -r kill; done`).

> **Update 2026‑10‑01 ≈ 09:05 UTC — PHASE 3 WAVE 1 RUNNING. START HERE if this session died.** `g2` tagged
> (`f6a7dc2`); the Preflight is on `main` (`4c5c0b8`, D‑0042: saves byte-identical on top of g2, check 827/827).
> Wave 1 (foundation 4211, environment 4212, stage8 4213, art-organisms 4214; builders effort high, one rules
> verifier each, player lens for environment and art; fix rounds only for BLOCKER/MAJOR) runs from
> `docs/agent/g3-wave-1.run.workflow.js.txt` (runner + `docs/agent/g3-wave-1.tasks.js.txt` in one file; copy it to
> a .js path and pass it as `scriptPath`). Builders edit the main tree and never commit; reports go to
> `docs/reports/reviews/g3-wave-1/`. If the session died mid-wave: `git status`, keep uncommitted work on a LOCAL
> `wip/` branch, read the reports, rerun only the unfinished tasks (`only: [...]` in the runner's `A`).
> Then: lead integration (MINORs, decisions D‑0043+, check, targeted e2e) → commit → tick P3.1/P3.2 (P3.7 `[~]`)
> → write wave 2's task file (one writer) → wave 2.

> **Update 2026‑10‑01 ≈ 08:30 UTC — G2 TAGGED. START HERE if this session died.** `g2` is on the gate commit
> (check 755/755, e2e 174/174, EXPANSION_RESPONSE G2). Next: rebase the local branch `p3-preflight` (worktree
> `tmp/wt-p3`, commit `02c7774`: determinism fence, verified) onto `main`; resolve `tools/deploy-arcade.mjs` in
> favour of main; `npx tsx tools/make-g2-saves.ts` must report every file unchanged; run the fence + replay +
> the whole unit suite; fast-forward `main`; record D‑0042 (EXP_106 arm B saved at t300; four fence files).
> Then Phase 3 wave 1, lean (owner's usage note): write `docs/agent/g3-wave-1.tasks.js.txt` with ONE writer
> (effort high, no checker), run `docs/agent/g3-runner.workflow.js.txt` with builders at effort 'high' and one
> rules verifier each (player lens only for UI/art tasks).

> **Update 2026‑10‑01 ≈ 00:55 UTC — RESUMED (owner: "code all night", back ≈ 12:00 UTC). START HERE if this session died.**
> g2-close-2 was restructured to save a stage (the separate re-verify of fix round 2 is folded into the round‑3
> re-verify): two workflows run at once —
> `docs/agent/g2-keep-fix3.workflow.js.txt` (fixer in the main tree, port 4191: carry-overs 1–5 — paused changes
> reach Continue by checksum, one time format, curly quotes, 16 px toasts, ability names in gain lines; report
> `docs/reports/reviews/g2-close/keep-dish-fix3.md`) and `docs/agent/g2-comprehension-review.workflow.js.txt`
> (read-only reviewer on a `git archive HEAD` snapshot in tmp/review-src, port 4195; writes tools/review-g2.mjs,
> docs/reports/comprehension-g2.md, docs/reports/img/g2/).
> **Next:** lead commits fix3 → re-verify rounds 2+3 (saves + player lenses, read-only) → comprehension fixes
> (labels/hierarchy only) → re-run review → lead integration (check + full e2e) → G2 ritual + tag `g2` →
> Phase 3 (four lead choices of g3-plan-recheck.md, preflight with world schema 4, waves).
> If the session died mid-run: `git status`; keep uncommitted fixer work on a LOCAL `wip/` branch (never push
> it); read the reports; rerun only what is missing.
> **Also running since ≈ 01:00 UTC (Phase 3 preparation, off `main`):** `docs/agent/g3-preflight.workflow.js.txt`
> builds the Preflight (determinism fence, D‑0035/D‑0036) in the git worktree `tmp/wt-p3` on LOCAL branch
> `p3-preflight` (never push it before g2); after the `g2` tag the lead rebases it onto `g2`, re-runs
> `tools/make-g2-saves.ts` there (saves must be byte-identical), runs check, merges. `docs/agent/g3-wave-tasks.workflow.js.txt`
> writes `docs/agent/g3-wave-{1..6}.tasks.js.txt` (TASKS for the one runner `docs/agent/g3-runner.workflow.js.txt`;
> run a wave by importing the tasks file with node and passing `{wave, state, tasks}` as the Workflow `args`).
> **01:15 UTC — owner: usage is limited; work lean.** The wave-task workflow was STOPPED (no files written;
> do not rerun it). Write a wave's task file only right before that wave runs (one writer, effort 'high', no
> checker). Next stages use one agent each where possible: one saves-lens re-verifier for fix3 (effort 'high'),
> one comprehension fixer only if the review finds BLOCKER/MAJOR, the review re-run by the lead with
> `node tools/review-g2.mjs`. Lead choices recorded: D‑0035…D‑0039 (`3902fd9`). If the worktree is gone after a restart: `git worktree prune`,
> check whether branch `p3-preflight` has commits/changes, else rerun the preflight script.

> **Update 2026‑09‑29 ≈ 13:50 UTC — PAUSED FOR A BREAK (owner's request). START HERE.**
> State: `main` clean and pushed. g2-close part 1 is committed: "keep the open dish first" (D‑0033:
> build, two verifier lenses, two fix rounds) in `7962785`, the P2.9 tuning report (D‑0034) in `9c087bc`,
> decisions + review reports + the P2.9 tick in the docs commit right after them. Evidence: `npm run check` 702/702 (75 files; typecheck and lint clean); the round‑2
> fixer's whole e2e suite 159/159 (1.4 h) on its own port (tmp/fix2-keep/e2e-full.log). Fix round 2 was committed
> WITHOUT its re‑verification (the workflow was stopped there for the break). The Phase 3 plan re-check is
> committed (`docs/agent/g3-plan-recheck.md`: 185 verified corrections, 16 blockers, four lead choices).
> **Next, in order:**
> 1. Sanity: `git status` clean; stop stray servers (`for p in $(seq 4173 4299); do lsof -t -i :$p | xargs -r kill; done`).
> 2. Copy `docs/agent/g2-close-2.workflow.js.txt` to the session scratchpad as `.js` and run it with the
>    Workflow tool (`scriptPath`). It re-verifies fix round 2 (saves + player lenses), runs fix round 3 with
>    the D‑0033 carry-overs (a change made while paused reaches Continue at the next autosave; J one time
>    format per save; K curly quotes; E toasts at 16 px; D‑0034 ability names in gain lines), re-verifies,
>    then runs the D6 §18 comprehension self-review with label fixes and a re-review. Reports:
>    `docs/reports/reviews/g2-close/`.
> 3. Lead integration: read every report (journal.jsonl), fix leftovers, record decisions, `npm run check` and
>    the full `npx playwright test` (≈ 159 journeys, ≈ 1 h), commit, push.
> 4. G2 gate ritual (BUILD_DIRECTIVE "G2 gate — evidence" + Appendix A): module-accounting,
>    registry-imports, branch-evidence (tests/fixtures), tests/sim/comparison, tests/recipes/variants,
>    tests/experiments/*, e2e whatif + lab-tools, tests/sim/view-switch; determinism 1× == 4× == reload
>    (deterministic-state fixture), conservation (closed-lid fixture), perf (cite tune-g2.md's sim:run lines);
>    EXPANSION_RESPONSE §1–§8 (world schema 3, contentHash from content:validate, owner items incl. the
>    five-tester comprehension session); tag `g2`; `git push --tags`.
> 5. Phase 3: make and record the four lead choices of `docs/agent/g3-plan-recheck.md` (G2, G3, G10, G11)
>    plus its decision 6, apply its corrections while writing `docs/agent/g3-wave-{1..6}.workflow.js.txt`,
>    then the lead preflight (g3-plan §2, world schema 4). Lead leanings, not yet recorded: G2 Option A
>    (hash-neutral stateHash, so g2 saves keep their exact hashes); G3 Option P (the lead bumps buildPhase 3
>    and contentVersion 2 in the preflight commit with the pinned-test fixes); G10 Option W3 (host-level
>    Cancel restores the command state like Undo; Undo while a sample is held acts as Cancel); G11 at W5;
>    decision 6: a usable-intake seconds column in schema 4.
> Owner questions (none block): D‑0022 (EXP_A bootstrap), D‑0027 (RESERVE_COMPARE_V2 meal dose), D‑0031
> (one checkpoint ring per device), EXPANSION_RESPONSE §8 list.

> **(Superseded by the banner above.) Update 2026‑09‑29 ≈ 03:25 UTC — resumed after the restart; `g2-close` RUNNING.** The owner said
> "let's get started"; the lead relaunched `docs/agent/g2-close.workflow.js.txt` (now with a third
> verifier lens, `coverage`, for the tuning report). Builders edit the working tree and never commit;
> reports land in `docs/reports/reviews/g2-close/`. If this session dies before the lead commits: look at
> `git status` (uncommitted builder work may be there — keep it on a local `wip/` branch, do not push it),
> read the reports, then either finish the missing parts by hand or rerun the script, and continue with
> steps 3–5 of the 03:05 banner below.

> **(Superseded by the banner above.) Update 2026‑09‑29 ≈ 03:05 UTC — paused for a codespace restart.**
> State: `main` clean and pushed. Wave C committed (`9708c29`, docs `f0a45de`); P2.1–P2.8 ticked;
> decisions through D‑0032. Last full evidence: `npm run check` 611/611 (after one documented golden
> update); full Playwright 111/117 with the 6 failures in two new journeys' own test code, then after
> the fixes garden 21/21, observe 12/12 and save-reload/new-dish/whatif green; content and atlas checks ok.
> The `g2-close` workflow was stopped two minutes after launch, before any agent changed a file:
> nothing to recover. The local branch `wip/g2-wave-c-found` is superseded by `9708c29`; ignore it.
> **Next, in order:**
> 1. Sanity: `git status` clean; stop stray servers by port
>    (`for p in 4173 4191 4195 4196 4197 4201 4211 4221; do lsof -t -i :$p | xargs -r kill; done`).
> 2. Copy `docs/agent/g2-close.workflow.js.txt` to the session scratchpad as a `.js` file and run it with
>    the Workflow tool (`scriptPath`). It does: D‑0033 "keep the open dish first" on every replacement
>    (Play, New Dish, experiment Start, Saved dishes → Open, Import, Continue) with two verifiers and fix
>    rounds; the P2.9 tuning report (`docs/reports/tune-g2.md`, no recipe/mechanic changes); then the
>    D6 §18 comprehension self-review (`docs/reports/comprehension-g2.md`, `tools/review-g2.mjs`) with
>    label/hierarchy fixes and a re-review. Reports go to `docs/reports/reviews/g2-close/`.
> 3. Lead integration: record D‑0033 (the ruling text is in the workflow's KEEP prompt) and the proposed
>    decisions; run `npm run check` and the full `npx playwright test`; commit; tick P2.9.
> 4. G2 gate ritual (BUILD_DIRECTIVE "G2 gate — evidence" + Appendix A): named fixtures, e2e whatif and
>    lab-tools, view-switch hash, determinism 1× == 4× == reload, conservation, perf; EXPANSION_RESPONSE
>    §1–§8 (versions: world schema 3, contentHash from content:validate); tag `g2`; push with tags.
> 5. Phase 3 from `docs/agent/g3-plan.md`, lead preflight first. Correction to that plan: world schema 3 is
>    already used by P2.8 (history traits/journal), so Phase 3's foundation bump is schema **4**; re-check
>    its file paths against the current tree before writing the wave files.
> Owner questions (none block): D‑0022 (EXP_A bootstrap), D‑0027 (RESERVE_COMPARE_V2 meal dose), D‑0030
> (New Dish/Play keep the open dish — being implemented as D‑0033), D‑0031 (one checkpoint ring per device),
> EXPANSION_RESPONSE §8 list.

> **Update 2026‑09‑28 afternoon (after the codespace closed at ≈ 14:35 UTC):** wave C builders
> (founders, observe) were cut off during their final regression runs; art‑marks never started. Their
> uncommitted work is kept locally at branch `wip/g2-wave-c-found` (`ecb52d9`, not pushed). The lead
> launched `docs/agent/g2-wave-c-resume.workflow.js.txt` (finish founders + observe from the tree, build
> art‑marks, two‑lens verify, ≤ 2 fix rounds). Reports land in `docs/reports/reviews/g2-wave-c/`. If this
> session dies again: read those reports, rerun the resume script (the Workflow tool can resume a run by
> id only within the same session), then integrate → P2.9 → G2 (steps 5–7).

> **Update 2026‑09‑28 (night session):** wave B and both fix rounds are committed (`d085a65`, `b17aa5b`,
> `4804a91`, `87204e7`; check 501/501; Playwright 93/93 after the landscape sheet fix), decisions
> D‑0024…D‑0028. Wave C (`docs/agent/g2-wave-c.workflow.js.txt`) was launched after `87204e7`. If this
> session died: look at `git status` (wave C builders' uncommitted work may be in the tree), rerun
> wave C with its script if nothing useful is there, then integrate (verifier findings → fixes →
> check + full Playwright → commit), then P2.9 → G2 (steps 5–7 below). Phase 3 plan: `docs/agent/g3-plan.md`.

## Where things stand
- `main` = `bf3ba9b` (plus this note), pushed. Tags `g0`, `g1` pushed. `npm run check` 311/311 and
  Playwright 45/45 passed at `2761cbd` (the last code commit).
- Phase 2 progress (docs/WORKLOG.md): P2.1 ✔, P2.4 ✔; P2.5 and P2.6 half done (simulation /
  framework halves committed in `2761cbd`); P2.2, P2.3, P2.7, P2.8, P2.9 and the G2 gate open.
- Decisions through D‑0023 in docs/DECISIONS.md (D‑0019…D‑0023 describe wave A).
- An interrupted, **unverified** partial attempt at wave B (lineage P2.3 + Lab view P2.7 only) is
  backed up on branch `wip/g2-wave-b-partial` (pushed). It is not on main. Treat it as reference
  material only; the plan below reruns wave B cleanly.

## Next steps, in order
1. Sanity: `git status` clean on main; `git log --oneline -3`; kill stray servers by port
   (`for p in 4173 4181 4182 4183 4184; do lsof -t -i :$p | xargs -r kill; done`).
2. **Wave B** (ultracode workflow): copy `docs/agent/g2-wave-b.workflow.js.txt` to the session
   scratchpad as a `.js` file and run it with the Workflow tool (`scriptPath`). Four builders, each
   with its own Playwright port/outdir, plus one adversarial verifier each:
   lineage (P2.3), lab (P2.7), whatif (P2.6 UI + e2e whatif), experiments-ui (P2.5: EXP_C, one
   shared paired‑run measurement model, Notebook → Experiments/Journal, e2e experiments).
   Optionally tell the lineage and lab builders that `wip/g2-wave-b-partial` holds an earlier
   unverified attempt they may inspect with `git show wip/g2-wave-b-partial:<path>`.
3. Lead integration after wave B: read every verifier finding (journal.jsonl of the run), fix all
   BLOCKER/MAJOR (and cheap MINOR), record proposed decisions as D‑0024+, run `npm run check`
   and full `npx playwright test`, commit in logical groups, tick WORKLOG, push.
4. **Wave C**: same procedure with `docs/agent/g2-wave-c.workflow.js.txt` — founders/presets
   (P2.2, registry‑imports fixture), observe (P2.8 regional graphs, checkpoint ring, journal),
   art‑marks (module marks packed into the atlas per ARCH §10.1, DORMANCY_LOCKOUT reason,
   sim‑tune counts E01 secretion).
5. **P2.9**: `npm run sim:tune` for Standard and Accelerated on the six seeds (600/1,200 s) →
   `docs/reports/tune-g2.md` with module attempts, gains, branch confirmations, per‑daughter
   rates (all hashes changed at D‑0023 and with modules enabled; that is expected).
6. **G2 gate** (BUILD_DIRECTIVE "G2 gate — evidence"): module‑accounting, registry‑imports,
   branch‑evidence, comparison, variants, all experiment fixtures, e2e whatif + lab‑tools,
   view‑switch hash; comprehension self‑review (write the five D6 §18 tester tasks and confirm
   each is doable in ≤ 10 min from a cold start, with screenshots like
   docs/reports/opening-loop-g1.md via tools/review-opening-loop.mjs). Update
   EXPANSION_RESPONSE §1–§8, tag `g2`, push.
7. Then Phase 3 (BUILD_DIRECTIVE "Phase 3 — Launch Ecology") with the same wave pattern.

## Open owner questions (none block work)
- D‑0022: Experiment A — all 12 Crumbsmiths starve by ~150 s in both copies; gate passes on
  conversion. Revise to bootstrap 0.50 (keeps them alive but no longer separates the copies)?
  Rectangle patch shape for recipes?
- EXPANSION_RESPONSE §8 list (price, privacy URL, keystore, minimum device, arcade embed format,
  web build full or demo).

## Environment reminders
See memory `reference-pixelmeba-environment`: JDK 21 path for Android, SwiftShader limits,
stop servers by port (never `pkill -f`), `npm run check` ≈ 7 min and full Playwright ≈ 14 min on
2 CPUs, parallel Playwright runs need `E2E_PORT` + `E2E_OUTDIR`.
