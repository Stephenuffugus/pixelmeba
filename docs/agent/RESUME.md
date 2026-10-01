# Resume point — read this first after a restart

> **FIRST READ `docs/agent/fast-track.md` — the owner wants v1.0 in about three sessions; it overrides the old
> per-builder verification, three-project e2e runs and six-wave layout below.**
>
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
