# g4-wave-6a integration: adversarial verification, round 1

Verifier: integrate-verify-6a-1, 2026-10-11.

**Scope.** The changes between d5a0c32 (the wave 6a tree before integration) and the current working tree. That tree is 2aca93bd, built with a temporary index and `git add -A`. It is identical to the new `wip/g4-wave-6a` = a999807.

**Fixers.** code-minors-6a (items 1-5) and docs-a11y-6a (ARCH §7 and §11.2, plus the wave 6a axe sweep).

**Ground rules.**
- No repository file was edited except this report.
- I ran no git write command.
- Scratch work is in tmp/integrate-verify-6a-1/:
  - `mutant.config.ts`: unit mutants, load-time source replacement keyed by `MUT`.
  - `vite.mutant.config.ts`: the e2e mutant build.
  - `mutants.sh` and the logs.
- Playwright used port 4391 and the build folder tmp/dist-integrate-verify-6a (mutant build: tmp/dist-integrate-verify-6a-mut). I stopped the port before and after each run, and it is free now.

**Result: ok = true.** There are no BLOCKER or MAJOR problems. One MINOR and three NITs remain.

## Problems (most severe first)

MINOR [code-minors-6a] src/ui/strings/observe.ts:63 — The new map intro says "which species ate, caught, infected, attached to, burst or drained another". That claims the map can show one species eating another species. It cannot. An 'eats' edge only ever points at a food pool:
- relationships.ts:177-178 records `eats` as species → pool.
- relationshipMap.ts:43 says the eats target is "a pool id".
- Species → species predation is 'catches'.

The same sentence then says "which fed from a food pool", which is the true description of 'eats'. So "ate" in the first list is wrong and repeats the pool clause (an honest-labels problem, SPEC §12.9). — Repro: read `OBSERVE_TEXT.mapIntro` against `MapEdgeKind` and RelationshipWatcher line 177. No code path makes an `eats` edge whose target is a species. Fix: drop "ate" from the first list, e.g. "which species caught, infected, attached to, burst or drained another, which turned one food into another, and which fed from a food pool."

NIT [code-minors-6a] src/ui/state.ts:235 (tests/ui/share.test.ts:276) — No test proves that the global worker-error toast skips 'importDish' and 'recipeImport'. With the skip removed (my mutant `global_toast`), tests/ui/share.test.ts still passes 9/9. `errorToastText` now gives the same text as importFile's catch, so the signal does not change and no second toast appears. Today's behaviour is correct, and the e2e mutant (old texts as well) does fail `share.spec.ts:374`. But if the two texts ever diverge, a second toast would come back unnoticed. — Repro: `MUT=global_toast npx vitest run --config tmp/integrate-verify-6a-1/mutant.config.ts tests/ui/share.test.ts` → 9 passed.

NIT [docs-a11y-6a] docs/ARCHITECTURE.md:514 — "Any refusal is 'This recipe needs a compatible build (…)' or a damaged/checksum message" leaves out four other refusals:
- 'format': "This is not a Pixelmeba recipe file." (recipeFile.ts:412, 534)
- 'json': "This is not a Pixelmeba file (it is not valid JSON)." (:541)
- 'size': "The file is larger than 25 MB." (:536)
- "This recipe file needs a newer version of Pixelmeba." (:421, a newer file version with unreadable versions)

Also, ARCHITECTURE.md:277-278 says `recipeImport` errors "carry the RecipeFileError kind". That holds only for RecipeFileError. host.ts:583 throws a plain Error ("That new dish id is already in use."), and the generic catch (host.ts:690) adds `kind` only for SaveFileError. — Repro: read the cited lines.

NIT [lead] (no file) — The branch `wip/g4-wave-6a` now points at a999807, a new backup whose tree equals the current working tree. It no longer points at d5a0c32, which is now reachable only by its hash (git branch -v; `git diff --stat a999807 2aca93bd` is empty). If d5a0c32 is meant to stay the "before" reference, give it its own ref.

## Item by item

### code-minors-6a

1. **Share sheet blocks dish keys — VERIFIED.**
   - The code:
     - share.ts:97 `shareSheetKey` takes every key while `sheet === 'share'`, and Esc calls closeShare.
     - DishScreen.tsx:181 calls it after the trySetup branch and before the input and SPACE_CONTROLS checks.
     - Nothing calls preventDefault, so the sheet's own field, radios and Tab still work.
     - ShareSheet has no Esc handler of its own, so Esc cannot close the sheet twice or fall through to handleViewKey.
   - Unit mutant `share_key` (returns false) fails "expected false to be true".
   - E2E mutant build (DishScreen line removed, MUTANT_LOADED confirmed) fails `share.spec.ts:339` on desktop (worker run state changed).
   - The real build passes on desktop.
   - Out of scope, not graded: the Share and Try setup sheets are not pointer-modal, so the run button stays clickable. That was the same before; the assignment covered keys only.

2. **One refused-import toast in the UX §5.11 form — VERIFIED.**
   - The code:
     - `importFailedText` (strings/share.ts:72) keeps the exact reason and drops a closing "Nothing was loaded/changed".
     - The global toast skips importDish and recipeImport (state.ts:235).
     - importFile's catch shows the one toast (:498).
     - The only senders of importDish and recipeImport are importFile (client.ts:492, 507), so skipping them hides no other error.
     - A keepRefused outcome keeps its own wording, which is right: it is not a file refusal.
   - I checked every closing "Nothing was loaded." in saveFile.ts:308-439 and the "Nothing was changed." texts. Each comes out as "Import failed: {reason}. Nothing changed." The version reasons keep their own words.
   - Unit mutant `importfile_old` fails 1 test.
   - The e2e mutant build (old two-toast code) fails `share.spec.ts:374` ("element(s) not found" for the new text).
   - On the real build, share.spec.ts:374, whatif.spec.ts:286, new-dish.spec.ts:58 and observe.spec.ts:384 pass on desktop, and share.spec.ts:374 passes on phone-portrait.

3. **Map intro — DONE, with the MINOR above.** No repository test pins the text, and tests/ui/observe.test.ts still passes.

4. **Version literals — VERIFIED.**
   - tests/persistence/share.test.ts reads `registry().manifest`.
   - share.spec.ts reads content/manifest.json.
   - Both pass. No literal is left in the changed asserts.

5. **A kept turn forgets its slot after notebook or journal changes — VERIFIED.**
   - The code:
     - `keptTurnMark` and `turnEdited` (host.ts:2463-2476) compare the notebook and journal before and after a change, so a no-op keeps the slot.
     - They are called after a stored journalPut, an applied storyMark, an accepted favorite op, an accepted goalStart or goalLeave, and a goalShown that changed something (`goals.shown` returns true only on a change, goals.ts:273-278).
     - When tryNext is refused 'unsaved' (:2592-2597), the record forgets the slot.
     - The UI drops the card's kept line (ui/tryDish.ts:287).
   - I looked for other ways to change the notebook or journal on a turn at its horizon:
     - 'command' and 'undo' were already covered by round 1.
     - A sample take is a 'command'.
     - goalShown and storyMark are sent only on player actions (notices.ts:107-120, stories.ts:57, 109).
   - Each of my seven host mutants fails the new test at its own step: journal, favorite, goal, goalshown, story, trynext, and noop_mark (a no-op counted as a change). The UI mutant `ui_unsaved` fails tests/ui/try-dish.test.ts.
   - The original repro (tmp/reverify1-g4-wave-6a/scratch2.test.ts) on the real tree:
     - After the journal note, `kept` is null (it was `{"slotId":"slot1"}` before).
     - tryNext without discard is still refused 'unsaved', which is correct: the slot does not hold the note.
   - tmp/reverify1-g4-wave-6a/scratch.test.ts: 1 of 3 tests fails ("autosave tick expected 50, got 0"). It fails the same way on the d5a0c32 tree (extracted with git archive into scratch, then deleted). The scratch test itself is stale (that baseline is at tick 0); this is not a regression.

### docs-a11y-6a

1. **ARCH §7 and §11.2 — VERIFIED apart from the NIT above.**
   - I checked these against src/worker/protocol.ts:28, 103-187, 527, 992-1001, 1064-1106 and 1383:
     - PROTOCOL_VERSION 2
     - the request and answer shapes
     - the six TryRefusalCodes
     - `tryStarted.kept` (tryStart only, host.ts:2575 vs 2604)
     - DishInfo.turn
     - the probes `refused`
   - In host.ts I checked:
     - an unknown window reads as 60 (:971, 980)
     - recipeIdStart builds first, then keepFirst 'start' (:599-616)
     - exportDish with strip uses withoutTurnNotes (:520)
     - the tryStart refusal and write order (:2536-2577)
     - the horizon behaviour in setSpeed and step (:785-811)
   - shelf.ts matches the doc: the id form and the eight-digit sequence, the writer token, SHELF_LIMITS 10/20, the 2× preflight, one commit, the write-once id check, and get's three checks. So do store.ts:212-265 (list, slot and freeSlot hide shelf ids; remove throws SHELF_REMOVE_REFUSED) and the host's loadSlot branch (:480).
   - notebookTurns.ts matches the doc: TURN_KEYS, horizons 600/1800/6000, prediction ≤ 200, baseline name ≤ 60, TURNS_MAX 1, kept slot1…10, turnsWorldProblem, and withoutTurnNotes ("Shared dish").
   - recipeFile.ts matches the doc: RECIPE_FILE_VERSION 1, the MIME type, the file name, FILE_KEYS, the five versions plus enabledModules equality, and the realization and initialStateHash comparison.
2. **a11y-screens.spec.ts wave 6a test — VERIFIED.**
   - `Audit.done` checks that the 10 scans ran in order and that axe found no serious or critical issue.
   - Desktop: 1 passed (3.3 m).
   - The fixer's image-alt mutant evidence is in their report. I did not repeat it.

### Saves and determinism

- `git diff --stat d5a0c32 2aca93bd -- src/persistence src/sim content src/worker/protocol.ts src/worker/tryDish.ts` is empty. The save, notebook, turn, shelf and recipe formats and every loader are byte-identical to the wave 6a build. Turn dishes, kept turns and shelf baselines written by that build therefore load the same way.
- The new host code only changes `kept` in the notebook record of a turn dish. It uses no randomness and no Date, and it never touches the world.
- The fence fixtures pass.

## Commands

| Command | Result |
|---|---|
| tree diff (temporary index, `git add -A`, write-tree) → `git diff --stat d5a0c32 2aca93bd` | 23 files, +1073/-29; nothing under src/persistence, src/sim or content |
| `npx vitest run tests/persistence/share.test.ts tests/ui/share.test.ts tests/ui/try-dish.test.ts tests/worker/try-dish-host.test.ts tests/ui/observe.test.ts tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence` | Test Files 10 passed (10), Tests 94 passed (94) |
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npx eslint` on the 16 changed .ts/.tsx files | exit 0 |
| `tmp/integrate-verify-6a-1/mutants.sh` (unit mutants, each MUTANT_LOADED) | share_key 1 failed; global_toast 9 passed (survives, NIT); importfile_old 1 failed; journal, favorite, goal, goalshown, story, trynext and noop_mark each 1 failed (try-dish-host "wave 6a integration"); ui_unsaved 1 failed (try-dish.test.ts) |
| `E2E_PORT=4391 E2E_OUTDIR=tmp/dist-integrate-verify-6a npx playwright test tests/e2e/share.spec.ts tests/e2e/whatif.spec.ts:286 tests/e2e/new-dish.spec.ts:58 tests/e2e/observe.spec.ts:384 tests/e2e/try-dish.spec.ts --project desktop` | 10 passed (10.4 m) |
| `… npx playwright test tests/e2e/a11y-screens.spec.ts -g "wave 6a" --project desktop` | 1 passed (3.3 m) |
| `npx vite build --config tmp/integrate-verify-6a-1/vite.mutant.config.ts --outDir tmp/dist-integrate-verify-6a-mut`, served on 4391, then `playwright test tests/e2e/share.spec.ts:339 tests/e2e/share.spec.ts:374 --project desktop` | MUTANT_LOADED in state.ts (3) and DishScreen.tsx (1); 2 failed (:339 run state changed; :374 new toast text not found) |
| `… npx playwright test tests/e2e/share.spec.ts:374 --project phone-portrait` | 1 passed |
| `npx vitest run --config tmp/reverify1-g4-wave-6a/vitest.mut.config.ts tmp/reverify1-g4-wave-6a/scratch2.test.ts` | passed; prints "KEPT AFTER JOURNAL null", "TRYNEXT AFTER JOURNAL tryRefused unsaved" |
| the same with scratch.test.ts | 1 failed, 2 passed (stale tick-50 expectation); on d5a0c32 (git archive into scratch): the same test fails the same way |
| `lsof -t -i :4391` after the runs | port free |
