# g4 wave 5b integration — the lead's own fixes (2026-10-11)

After `integrate-verify1.md` (ok, no BLOCKER/MAJOR), the lead fixed the three items marked [lead] or left open.

1. **Import drop for a running goal the dish cannot run** (verifier MINOR 1).
   - `src/persistence/saveFile.ts` `loadSaveFile` now passes `goalWorldRefsOf(world)` to `readNotebook`. This is the
     objectives fixer's plumbing hunk, `tmp/objectives-minors/saveFile-plumbing.diff`, applied as written.
   - New host-level test: `tests/worker/goals-host.test.ts`, "import: a running goal the dish cannot run drops the
     notebook; the world loads unchanged". It replays the verifier's repro: the g2 first-dish-t3000 save with a
     running fieldInRange on v01, plus an event position the dish never reached.
     - Through `loadSaveFile` and through the host's `importDish`, the notebook is dropped with
       NOTEBOOK_DROPPED_TEXT, the stateHash is unchanged, and no goal runs or is announced.
     - An event position in the past still loads and keeps running.
2. **The Notebook's Back during a story visit** (verifier MINOR 2).
   - `src/ui/views/Notebook.tsx`: Back calls `leaveNotebook()` first. During a visit that began at a story notice's
     Open, it returns to that dish at its prior speed and is labelled "Back to the dish". Otherwise it goes Home, as
     before.
   - The header comment no longer says that opening the Notebook never pauses a dish. It now describes D-0028 and
     the pause-and-restore convention.
   - `leaveNotebook` itself is unit-tested by the stories fixer (mutant M2).
3. **Goal sentence branches** (verifier MINOR 3).
   - New `tests/ui/goal-sentence.test.ts`: 'failed', 'cannotResume' and 'undone' each give their own sentence, and
     none falls through to the content's ended text.
   - With the 'failed' branch deleted (a mutant, restored and checked with `cmp`), both tests fail.
4. **Lint**: one unnecessary type assertion in the new host test, fixed with `eslint --fix`.
5. **ARCH**: §7 gains the "As built, Phase 4 wave 5b" protocol block, and §11.2 gains the 'stories' and 'goals'
   kinds.

## Evidence

- `npm run check`: Test Files 169 passed (169), Tests 1709 passed (1709), exit 0. Started 12:32:18, ran 2208 s.
- `npx eslint` on the four changed files: clean. `npx tsc -p tsconfig.json --noEmit`: clean.
- The desktop e2e of the touched journeys is in the commit message.
