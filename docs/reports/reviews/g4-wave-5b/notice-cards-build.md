# g4 wave 5b — notice-cards build report (D-0076; wave 5a integrate-verify1 MINORs 1-3)

UI only. No worker, persistence, sim, content or manifest change. No git operations were run.

## Checklist

### Build items
1. **DONE — no preemption; a tie goes to the extinction card.**
   - `src/ui/notices.ts:64`: `CARD_ORDER = ['extinct', 'discovery']`.
   - `src/ui/notices.ts:72-74` (`recompute`): the card on screen stays while its source still asks for it.
   - `src/ui/notices.ts:157` (new): `setCardsOpen` takes both requests in one recompute, so a real tie exists. `setCardOpen` now calls it.
   - Proved by: notices.test.ts:155 "no preemption" and :171 "a tie"; notice-cards.test.ts:138, :157, :171.
2. **DONE — no new discovery card while the extinction card shows.**
   - `src/ui/panels/LineageState.tsx:260` (`showDiscovery`): `if (newCard && cardPlaceHeldByOther('discovery')) return [];`
     - It runs after the lineage answer and the dish check, and before anything is shown or paused.
     - The predicate is at `src/ui/notices.ts:173`. With only two cards it equals `shownCard === 'extinct'`.
   - The pacer then keeps the ids waiting, starts no gap and retries after DISCOVERY_RETRY_MS. This is existing `delivered()` behaviour.
   - Joining an open card is unchanged.
   - `src/ui/panels/DiscoveryCard.tsx:18`: the new `discoveryCardToShow()` returns the card only while `shownCard` is `'discovery'`. The component uses it, so the cue and the live line follow it too.
   - Proved by: notice-cards.test.ts:333 (through the real LineageState and pacer: no card, no `setSpeed(0)`, and the card shows within 5 s after the extinction card closes, not 60 s later); notice-cards.test.ts:287; notices.test.ts:181; discovery-pacer.test.ts:283.
3. **DONE — one new card notification per 60 s across both cards.**
   - `src/ui/panels/DiscoveryPacer.tsx:76`: `otherCardShown()` sets `lastShownAt = now`. A timer that is already set re-checks the gap in `fire()`.
   - `src/ui/panels/LineageState.tsx:327`: `discoveryOtherCardShown()` calls it.
   - `src/ui/noticeCards.ts`: an effect on the computed id of `extinctCardToShow()` calls it each time an extinction card becomes the one on screen. A new head of the queue counts too. A notebook change that keeps the same card does not.
   - The extinction card itself is never paced.
   - Proved by: notice-cards.test.ts:316 (end to end: extinction card at 0 s, branch at 1 s, card closed at 10 s, no discovery card at 59 s, card at 65 s); discovery-pacer.test.ts:260 and :272.
4. **DONE — no extinction card is lost (FIFO queue).**
   - `src/ui/favorites.ts:30`: `extinctQueue` signal. `:32` keeps `extinctCard` as a computed read-only head, so the exported name still works.
   - `:35`: `queueExtinctCard` adds an id with no duplicates. `:41`: `closeExtinctCard(id)`.
   - `:47`: `pruneExtinctQueue`. It is called on `'favoritesRestored'` (`:145`) for every queued id, not only the shown one.
   - `followOpenDish` clears the queue (`:168`).
   - `FavoriteExtinct.tsx:22`: all three buttons (Look back, Continue exploring, Start a new dish) call `closeExtinctCard(f.id)`. There is no separate Close button on this card.
   - Every use of the old writable `extinctCard` was updated: FavoriteExtinct, and favorites.test.ts:545.
   - Proved by: notice-cards.test.ts:187, :208, :221 and :234.
5. **DONE — the wiring and the render guard are testable in node.**
   - `src/ui/noticeCards.ts` (new): `wireNoticeCards()` holds the two card requests and the pacer call. `NoticeHost.tsx:119` calls it in place of the two effects.
   - `src/ui/favorites.ts:219`: `extinctCardToShow()`. `FavoriteExtinct.tsx:17` uses it.
   - Proved by: notice-cards.test.ts:245 (without wiring no card shows; with it the real sources ask for the place); :267 (`extinctCardToShow` cases); :287 (`discoveryCardToShow`).

### Done when
- **DONE** Each required unit test exists and fails on the old code. The mutant table is below.
- **DONE** E2E passes on desktop AND phone-portrait with `E2E_PORT=4271 E2E_OUTDIR=tmp/dist-notice-cards`:
  - `tests/e2e/lineage.spec.ts` (the only spec with `discovery-dismiss`);
  - `tests/e2e/favorites.spec.ts`.
  - Result: 10 passed (13.8 m).
- **DONE** PROPOSED DECISION paragraph (below).

## Where the code differs from the assignment
- The two effects moved into a new file, `src/ui/noticeCards.ts`, not into an export of NoticeHost.tsx.
  - Importing NoticeHost in node would pull in LabView, prompts and the full state.ts.
  - The other stage-2 builders are adding sources to NoticeHost at the same time.
  - NoticeHost's own edit is one line plus imports.
- The tie is real only through `setCardsOpen` (new). With two separate effects, the first effect's request always shows first. Both rules hold either way, because of CARD_ORDER.
- `extinctCardToShow` reads the guard the assignment asks for (`shownCard` is `'extinct'`, the head is extinct, a dish is open).
- One addition beyond the brief: `favoriteOp` also prunes the queue with the answered record (`favorites.ts:256`). Without it, a favorite removed from the notebook while its card waits would sit at the head for good and block every later card.

## Tests and how each was checked against the old code
Each mutant was applied to the source file in place, the three fast test files were run, and the file was restored and compared byte for byte (`filecmp`) every time. The script is in the scratchpad.

| Mutant (old behaviour put back) | Tests that fail |
|---|---|
| M13: old notices.ts (preemption and old CARD_ORDER together) | 6 failed: notice-cards "does not take its place", "a tie", "discoveryCardToShow"; notices "D-0076 no preemption", "D-0076 a tie", "cardPlaceHeldByOther" |
| M1: preemption only | 4 failed, incl. notices "D-0076 no preemption" and notice-cards "never delayed" |
| M2: old CARD_ORDER only | 2 failed: both tie tests |
| M3: a single id that is overwritten (old `extinctCard`) | 3 failed: notice-cards :187, :208, :221 |
| M4: restore prunes only the shown head (old) | 1 failed: :221 |
| M5: no refusal line in showDiscovery | 1 failed: :333 |
| M6: wiring does not call the pacer | 1 failed: :316 |
| M12: `otherCardShown` is a no-op | 3 failed: :316 and pacer :260, :272 |
| M7: the extinction request is not wired | 9 failed, incl. :245 |
| M8: `extinctCardToShow` ignores `shownCard` | 3 failed, incl. :267 |
| M9: `discoveryCardToShow` ignores `shownCard` | 3 failed, incl. :287 |
| M10: `followOpenDish` keeps the queue | 1 failed: :234 |

Two tests do not fail on the old code:
- discovery-pacer.test.ts:283 pins the pacer behaviour the refusal relies on: an empty delivery keeps the ids, starts no gap and retries. That behaviour already existed. The refusal mechanism itself is proved by notice-cards :333 (M5).
- Mutant M11 (two separate effects instead of `setCardsOpen`) passes, as expected: CARD_ORDER still settles the tie.

Existing tests changed:
- notices.test.ts "the extinction card waits while a discovery card is open…" lost its last block. That block asserted the preemption D-0076 removes.
- favorites.test.ts:545 now uses `queueExtinctCard`, because `extinctCard` is read-only.

## Commands and results
- `npx tsc -p tsconfig.json --noEmit` → exit 0.
- `npx eslint` on the 8 source files and 4 test files I touched → clean (after `--fix` on my own new test).
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/ui/notices.test.ts tests/ui/notice-cards.test.ts tests/ui/discovery-pacer.test.ts tests/ui/favorites.test.ts` → `Test Files 11 passed (11)`, `Tests 106 passed (106)`, exit 0.
- `E2E_PORT=4271 E2E_OUTDIR=tmp/dist-notice-cards npx playwright test tests/e2e/lineage.spec.ts tests/e2e/favorites.spec.ts --project=desktop --project=phone-portrait` → `10 passed (13.8m)`, exit 0. The port was stopped before and after.
  - Both specs include the a11y checks of their screens.
  - No markup or style changed, so touch targets and text sizes are unchanged.

## FENCE
None. No sim, worker or content change. The fence and replay tests pass.

## Bugs noticed elsewhere
None new. The working tree has other agents' edits (`MoreSheet.tsx`, the NoticeHost sources from the stories and goals builders). I left them alone.

## PROPOSED DECISION (D-0076 "The two cards in the notice place as built")
The discovery card and a followed family's extinction card share the notice's place under five rules:
1. **No preemption.** A card on screen keeps the place until its own source closes it (`notices.ts` `recompute`). When both are asked for together and none is on screen, the extinction card goes first (`CARD_ORDER ['extinct','discovery']`; D08 "Prefer a favorite-family event"). Both requests go through `setCardsOpen` in one call.
2. **No new discovery card under the extinction card.** `LineageState.showDiscovery` refuses a new card while another card holds the place (`cardPlaceHeldByOther('discovery')`). The refusal comes after the lineage answer and before any card or pause.
   - The pacer keeps those ids waiting, starts no 60 s gap, and retries after DISCOVERY_RETRY_MS.
   - Joining an open card is unchanged.
   - The pause-on-discoveries pause happens only when a card really shows.
   - DiscoveryCard renders only while `shownCard` is `'discovery'` (`discoveryCardToShow`).
3. **One new card notification per 60 s across both cards** (CT §12.10). Each time an extinction card becomes the card on screen, including a new head of the queue, `DiscoveryPacer.otherCardShown()` records it as the last card shown. The extinction card itself is never delayed, except while a discovery card is on screen.
4. **No extinction card is lost.**
   - Extinct favorites wait in a FIFO queue with no duplicates (`favorites.ts extinctQueue`). The card shows the head.
   - Each of its buttons removes the shown id.
   - `'favoritesRestored'` and every answered favorite op drop each queued id whose family is back or gone from the record.
   - Another dish clears the queue.
5. **The wiring is testable in node.** It lives in `src/ui/noticeCards.ts` `wireNoticeCards()`, which NoticeHost calls once. The render guards are the pure `extinctCardToShow()` and `discoveryCardToShow()`. tests/ui/notice-cards.test.ts drives all of it with the real modules and signals.
