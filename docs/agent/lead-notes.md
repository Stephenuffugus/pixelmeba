# Lead notes — how the owner wants this build run

Working rules the lead session learned from the owner (kept in the lead's local memory until 2026-10-15; copied here so
a session on another machine, such as a cloud session, starts with them). CLAUDE.md and docs/agent/RESUME.md still come
first; this file adds the owner's preferences and the lessons that cost real time.

## The owner

- Stephen ("Stephenuffugus") owns Lucid Winds Arcade. Pixelmeba ships on Google Play ($0.99) and as a web build in the
  arcade. He writes design documents with ChatGPT and has Claude build; he does not want decisions handed back to him.
- Act as the decision-making lead: decide, log in docs/DECISIONS.md, continue. List true owner decisions in
  EXPANSION_RESPONSE §8 at a gate.
- "lets get started" (or "keep going") means: resume the build from docs/agent/RESUME.md's top banner.
- He runs several projects in separate codespaces (Pi Network games, an "SWS app"). A message about another project may be
  misrouted here: answer it briefly if harmless, keep building, and never treat it as a change of task.

## Usage is weekly and shared — spend it carefully

- Run only the work needed next; never pre-generate later phases "while waiting".
- Workflows: few agents; builders, fixers and verifiers at effort high (verifiers may be medium), never max for routine
  agents. One verifier lens per task; a second lens (saves/determinism) only for real risk (`critical`).
- Re-runs a script can do (tests, review tools) are run by the lead from the shell, not by an agent.
- Agent prompts are small and self-contained; never make every agent read the big plan documents.
- Every workflow agent prompt starts with an OWNER_CONTEXT preface (the run files' `ag()` wrapper does this), so a
  misrouted owner message cannot redirect the agents.

## When the owner warns that the machine will close or restart

1. Back up at once: `tools/lead/backup-tree.sh <wip branch>` (pushes a wip commit of the whole tree).
2. Write the RESUME.md top banner (what is running, what to rerun, where the backups are).
3. Start nothing that cannot finish before the stated time (no check, no e2e batch, no workflow).
4. Tell the owner in one line that it is safe to close and what "let's get started" resumes.
When resuming after a death, lead with the facts that nothing was lost (the tree equals the backup).

## Practical lessons

- Fast track (docs/agent/fast-track.md): builders test their own journeys on desktop + phone-portrait; one rules
  verifier per stage group; the full e2e suite only at gates. A full e2e sweep is owed after THE HABITAT ENABLE
  (g5-plan "Full e2e sweep owed").
- Do not edit source while `npm run check` is running: vitest mixes module versions and reports false failures. If it
  happens, rerun `npx vitest related <changed files> --run` plus the tests that read those sources from disk.
- Journeys go stale silently outside a wave's touched features (a D-0121 pin sat in chemistry-habitats until D-0127).
- A dish tap offers only organisms within 0.35 cells of the nearest one; journeys tap recorded positions (the
  watchPositions init script in tests/e2e/fresh-dish-p5.spec.ts and a11y-screens.spec.ts).
- Parallel Playwright runs need their own `E2E_PORT` and `E2E_OUTDIR`; the config reuses a running server, so kill
  stale servers by port first: `lsof -t -i :<port> | xargs -r kill`.
- Never `pkill -f` / `pgrep -f` with a pattern the calling command contains (it kills the calling shell). Start loops
  with `nohup … & echo $! > tmp/lead/<name>.pid` and stop them by that pid.
- Headless Chromium renders WebGL with SwiftShader: frame rates are lower bounds only; real 60 fps needs a device.
- Android (codespace only): the default JDK 25 cannot run Gradle 8.14.3; use JDK 21
  (`/usr/local/sdkman/candidates/java/21.0.12+1-ms` there). The command-line SDK lived at `~/android-sdk` (platform 36,
  build-tools 35/36). No emulator: install/launch cannot be verified headless. Steps: docs/ANDROID_SETUP.md.
- Timing on the 2-vCPU codespace: `npm run check` ≈ 90 min alone (3,467 tests, 315 files) and over 3 h beside e2e runs;
  a four-builder wave ≈ 3–6 h. More cores shorten everything.
- Lead scratch lives in `tmp/lead/` (git-ignored, lost with the machine): anything a later session needs must be
  committed (drafts of D-entries go in docs/agent/ before a move).
