# g4 wave 5a integration — adversarial verify 1

Verifier: `integrate-verify1`, 2026-10-11. Scope: the integration changes, meaning the difference between `e96976b`
(the wave 5a backup) and the current working tree. I built a temporary index (`read-tree HEAD` + `add -A` +
`write-tree`, tree `2a0f3dc`) and ran `git diff e96976b <tree>`, leaving out DECISIONS, docs/agent and docs/reports.
The diff touches 13 files.

I changed no repository file except this report. Each mutant was applied to the real file and then restored from a
`cp -p` copy, checked with `cmp` ("RESTORED"). At the end the tree hash differed from `2a0f3dc` only in the lead's own
files (DECISIONS.md and docs/agent/**). Scratch files are in `tmp/integrate-verify1/`.

## Verdict

**No BLOCKER and no MAJOR.** Both code fixes do what was asked, and their tests catch the old bugs. Both e2e tests
pass on desktop. The ARCH §7 and §11.2 text matches the code. I found three MINORs and two NITs, listed below.

## Findings (most severe first)

1. **MINOR [code-minors] `src/ui/notices.ts:56` (`CARD_ORDER = ['discovery', 'extinct']`)**
   - **What is wrong:** a discovery card that arrives while the extinction card is on screen takes its place. The
     extinction card disappears while the player is reading it and comes back only after the discovery card is closed.
   - **Why it matters:**
     - Nothing is layered, so the item's three required behaviours hold.
     - It goes against D08 "Attention limits" (D08 §Attention limits, line ≈151): "Prefer a favorite-family event, then
       the first unseen template…". The extinction card is the favorite-family event.
     - Keyboard focus inside the card is lost to `<body>` when the card unmounts.
     - The discovery pacer (`DiscoveryPacer.cardOpen`) still ignores the extinction card. So two new card notifications
       can follow each other with no gap, against D08 "at most one new card notification per 60 simulated seconds".
   - **Repro:** probe `tmp/integrate-verify1/probe/extinct-probe.test.ts`. It uses the real `FavoriteExtinct`,
     `favorites.ts` and `notices.ts`, plus NoticeHost's two effects copied verbatim. The output is
     `PROBE extinction card while discovery opened over it: HIDDEN (preempted)`.
   - **Suggested fix:** let an open extinction card keep its place, so a new discovery card waits for it (the pacer's
     `cardOpen` would need to see it). Or record the chosen order in DECISIONS as a ruling against D08's preference.

2. **MINOR [code-minors] `src/ui/favorites.ts:113` (`extinctCard.value = n.change.id`)**
   - **What is wrong:** an extinction card can be lost for good, not just delayed. `extinctCard` holds one id.
     - Family A's card is waiting behind an open discovery card. That waiting state is new with this integration.
     - Followed family B then dies.
     - B's id overwrites A's, and A's card is never shown.
   - **Why it is MINOR:** A's notebook entry still says "No members remain since m:ss". The same overwrite already
     happened before this integration when two families died in the same tick. The waiting makes the window much
     longer, because a discovery card stays open until the player closes it.
   - **Repro:** the same probe. A dies, a discovery card opens, B dies, the discovery card closes. Output:
     `PROBE after discovery closes, the card is about: b (a was never closed by the player)`. After the player closes
     it, no card is left.
   - **Suggested fix:** a small queue of extinct ids, each shown in turn. Or one card that names every family that died
     while it waited.

3. **MINOR [code-minors] `src/ui/views/NoticeHost.tsx:121`, `src/ui/panels/FavoriteExtinct.tsx:18`**
   - **What is wrong:** no test covers the wiring that makes the extinction card appear at all:
     - the effect `setCardOpen('extinct', extinctCardFavorite() !== null)`;
     - the `shownCard.value !== 'extinct'` guard;
     - `extinctCardFavorite()`.
   - **Evidence:**
     - `grep -rln "NoticeHost|FavoriteExtinct|extinctCardFavorite|setCardOpen|shownCard" tests/` finds only
       `tests/ui/notices.test.ts`, which tests notices.ts on its own.
     - The e2e journeys cannot reach the card (the a11y spec's comment says so).
     - So if line 121 were deleted, `shownCard` would never be `'extinct'` and the card would never render, and every
       test would still pass.
   - **Suggested fix:** call the hook-free `FavoriteExtinct()` directly in a node test with the state mock from
     `tests/ui/favorites.test.ts` (my probe shows this works). Moving the two effects into an exported
     `wireNoticeCards()` would let a test run the real wiring.

4. **NIT [lead] `src/worker/host.ts:1545` (`...d` in `duplicateDish`)**
   - My own audit of every `Dish` field agrees that no mutable worker object is still shared:
     - The plain values (`acc`, `gen`, `lastEventId`, `effectiveSpeed`, `overlay`, `sampleBeginHash`) are copied, not
       shared.
     - `lineageView` is replaced by assignment only (host.ts:893). The UI's `resetFor` also clears it for the new dish.
     - `notebook` comes from `favoritesOnly`, a new object. Its `favorites` array is shared, but no code changes those
       records or the array in place (I grepped `favorites.ts` and `notebookWatch.ts` for push, splice and sort).
     - `undoLabels` was harmless, as the lead said: the push is guarded by `d.undo` (host.ts:720), and the copy has
       `undo: null`.
     - A `transient` dish is never registered, so it cannot be duplicated.
   - **The nit:** `sampleBeginHash` carries the original's Begin hash into a copy that has a different world id. A Cancel
     in the copy would then report the original's `beginHash`. That value is diagnostic only: `client.ts:134` returns
     it and no UI reads it. Setting `sampleBeginHash: null` would match "as after a reload".

5. **NIT [e2e-docs] `docs/ARCHITECTURE.md` §11.2 and §7**
   - I checked every statement against `protocol.ts`, `notebook.ts`, `saveFile.ts` and the host's export, save,
     notebookGet and sessionSummary code. I found no mismatch.
   - Two behaviours are not mentioned:
     - `readNotebook` treats `"notebook": null` like an absent block: an empty notebook and no message.
     - For `exportSave` without opt-in, a stored notebook that could not be read is replaced by the empty read record,
       so it is removed from the export. ARCH says only "re-sealed without nicknames" (host.ts:123–131
       `exportedSaveText`).

## Item-by-item

- **code-minors 1 (one D8 notification at a time):** DONE.
  - While either card is open, nothing shows in the notice slot, and the waiting notices come back after the last card
    closes.
  - The cards are a set, so closing one never uncovers the notices while the other is open.
  - The extinction card is never layered over a discovery card: it waits and then shows.
  - The discovery card behaves as before. It does not read `shownCard`, it is first in `CARD_ORDER`, and its pacer
    still uses `discovery.value`.
  - Findings 1–3 remain.
- **code-minors 2 (duplicate shared the relationship watcher):** DONE.
  - The fix matches how relationships reach the UI. The `relationships` reply (host.ts:845) carries the requested
    dish's `worldId` and `dishName`, and `badges.ts mergeRelationships` credits each first sighting to them. Before the
    fix, the copy's sightings were credited to the original's world, name and event ids.
  - The audit holds (finding 4).
- **e2e-docs 1 (keep-dish "kept line leads"):** DONE. The new claims match `PROMPT_TEXT.tapSprinter`, and every other
  claim is kept. It passes on desktop.
- **e2e-docs 2 (a11y "wave 5a"):** DONE. All seven screens are scanned. The comment explains why the extinction card is
  unreachable. It passes on desktop. `selectOrganism` works out positions from the viewport box, and the fixer reports
  a phone-portrait pass, so I did not re-run phone.
- **e2e-docs 3 (ARCH §7 and §11.2):** DONE. Every wave 5a protocol addition (from `git diff eb0bf67 --
  src/worker/protocol.ts`) is described. There are two small omissions (finding 5).

## Commands run (with summary lines)

- Tree diff:
  - `IDX=$(mktemp) && GIT_INDEX_FILE=$IDX git read-tree HEAD && GIT_INDEX_FILE=$IDX git add -A && T=$(… write-tree) && git diff --stat e96976b $T`
  - → "13 files changed, 534 insertions(+), 25 deletions(-)"
- Baseline unit tests:
  - `npx vitest run tests/ui/notices.test.ts tests/worker/duplicate-sharing.test.ts`
  - → "Test Files 2 passed (2) / Tests 10 passed (10)", EXIT 0
- Mutant H1, the `relationships: null` line in duplicateDish removed:
  - `npx vitest run tests/worker/duplicate-sharing.test.ts`
  - → "× a relationship first seen in the copy is not written into the original, nor the reverse", with
    `AssertionError: expected [ { …(2) }, { …(2) } ] to deeply equal []`; "Tests 1 failed (1)", EXIT 1
  - RESTORED (cmp)
- Mutant N1, `CARD_ORDER` reversed to `['extinct', 'discovery']`:
  - `npx vitest run tests/ui/notices.test.ts`
  - → "× the extinction card waits while a discovery card is open and shows when it closes"; "1 failed | 8 passed (9)",
    EXIT 1
  - RESTORED
- Mutant N2, `cardsOpen.clear()` before the add, with the early return kept:
  - → the same one test fails; "1 failed | 8 passed (9)", EXIT 1
  - RESTORED
- Mutant N3, last writer wins (the old single boolean: early return removed, `clear()` then add):
  - → 3 tests fail ("overlapping …", "a repeated open or close …", "the extinction card waits …"); "3 failed | 6 passed
    (9)", EXIT 1
  - This matches the fixer's mutant A. RESTORED
- Probe (scratch config in `tmp/integrate-verify1/probe/`):
  - `npx vitest run --config tmp/integrate-verify1/probe/vitest.config.ts --reporter=verbose`
  - → "Tests 1 passed (1)" with the three PROBE lines quoted in findings 1–2
- Coverage grep: `grep -rln "NoticeHost|FavoriteExtinct|extinctCardFavorite|setCardOpen|shownCard" tests/` →
  `tests/ui/notices.test.ts` only
- `npx tsc -p tsconfig.json --noEmit` → TSC EXIT 0, no output
- `npx eslint` on the changed files → ESLINT EXIT 0. The files: `src/ui/notices.ts`, `src/ui/views/NoticeHost.tsx`,
  `src/ui/panels/FavoriteExtinct.tsx`, `src/ui/favorites.ts`, `src/worker/host.ts`, `tests/ui/notices.test.ts`,
  `tests/worker/duplicate-sharing.test.ts`, `tests/e2e/keep-dish.spec.ts`, `tests/e2e/a11y-screens.spec.ts`.
- Fixtures:
  - `nice -n 5 npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence`
  - → "Test Files 5 passed (5) / Tests 51 passed (51)", 338.4 s, EXIT 0
- e2e on desktop:
  - `lsof -t -i :4391 | xargs -r kill` was run before and after; 0 processes were left on the port.
  - `E2E_PORT=4391 E2E_OUTDIR=tmp/dist-integrate-verify npx playwright test tests/e2e/keep-dish.spec.ts tests/e2e/a11y-screens.spec.ts -g "kept line leads|wave 5a" --project=desktop`
  - → "2 passed (3.0m)", EXIT 0
- Final tree check: the recomputed tree differs from `2a0f3dc` only in `docs/DECISIONS.md` and `docs/agent/**` (the
  lead's files written during this run).
