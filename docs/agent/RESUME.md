# Resume point — read this first after a restart

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
