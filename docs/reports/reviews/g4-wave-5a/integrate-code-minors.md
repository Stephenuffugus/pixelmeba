# g4 wave 5a integration — code-minors fixer (report reconstructed by the lead)

The fixer (integration run `wf_811f8395-c0f`, agent `fix:code-minors`) finished both items and its final checks, but
the codespace stopped before it wrote its report. The lead rebuilt this report on 2026-10-11 from the fixer's
transcript and its scratch outputs under `tmp/code-minors/`. Every command and result below is quoted from those.

## 1. DONE — one D8 notification at a time, including the extinction card (wave-verify 10, lead)

- `src/ui/notices.ts`: the single `blocked` boolean is now a set of open cards, `cardsOpen: Set<NoticeCard>`, where
  `NoticeCard = 'discovery' | 'extinct'`. Sources call `setCardOpen(card, open)`, and each card is its own entry.
  - `recompute()` picks `shownCard`, the first requested card in `CARD_ORDER` (discovery first). While any card is
    open, `currentNotice` is null. The waiting notices come back when the last card closes.
  - One card closing never uncovers the notices while the other is still open.
  - `resetNoticesForTest` clears the cards and `shownCard`.
- `src/ui/favorites.ts`: `extinctCardFavorite()` returns the favorite the extinction card is about only when it is
  extinct and a dish is open, else null.
- `src/ui/views/NoticeHost.tsx`: the two effects are
  `setCardOpen('discovery', discovery.value !== null)` and `setCardOpen('extinct', extinctCardFavorite() !== null)`.
- `src/ui/panels/FavoriteExtinct.tsx`: the card renders only while `shownCard.value === 'extinct'`. While a discovery
  card is open, the extinction card waits, then shows when the discovery card closes.
- Tests in `tests/ui/notices.test.ts`: `npx vitest run tests/ui/notices.test.ts` → 9 passed. The new cases:
  - a notice is hidden while the extinction card is open and comes back after it closes;
  - overlapping discovery and extinction cards keep the notices hidden until both close, in either order;
  - a repeated open or close from one source changes nothing (a set, not a toggle or a count);
  - the extinction card waits while a discovery card is open and shows when it closes.
- Mutant A put back one boolean, last writer wins (`cardsOpen.clear()` before the add). With it, three new tests fail:
  "overlapping discovery and extinction cards…", "a repeated open or close…" and "the extinction card waits…". The
  good file was restored afterwards (`tmp/code-minors/notices.ts.good`).

## 2. DONE — Duplicate shared the relationship watcher (wave-verify 11, lead; existing P3.8 bug)

- `src/worker/host.ts` `duplicateDish` now sets `relationships: null`, so the copy gets a watcher of its own.
  - The watcher is created lazily the next time the copy is played, exactly as after a reload; the table is never
    saved.
  - Before, the `...d` spread shared the original's watcher, so relationships first seen in the copy were written
    into the original's record.
- PROPOSED DECISION (fixer's choice, kept by the lead): a fresh watcher, not one seeded from the original.
  - A fresh watcher behaves like a reload.
  - The device-wide record of "first seen in your dishes" lives in the UI store (`src/ui/badges.ts`, localStorage), so
    the Field Guide loses nothing.
  - The copy's own table starts at the duplicate moment.
- Test: `tests/worker/duplicate-sharing.test.ts`, "a relationship first seen in the copy is not written into the
  original, nor the reverse". It uses ONE_HOST_V1, which a probe showed records `eats:B05:metabolite` and others in the
  first ticks.
  - With the fix: 1 passed.
  - With the `relationships: null` line deleted: fails, `expected [ { …(2) }, { …(2) } ] to deeply equal []`.
- Audit of the rest of the spread. The fixer read the code; the lead finished the audit and wrote these conclusions:
  - `undoLabels` was shared by reference.
    - It was never read or written through the copy while shared: the copy starts with `undo: null`, the label push is
      guarded by `d.undo`, and the copy's first undoable command assigns a fresh array.
    - So it was not a live bug. The lead hardened it anyway: `undoLabels: []` in the copy literal.
  - `lineageView` is replaced by assignment (host.ts `case 'lineageView'`) and never changed in place.
  - `sampleBeginHash` is a string.
  - The journal lives in `world.history`, which `deserializeWorld` builds fresh.
  - `notebook` is `favoritesOnly(…)`, a fresh record; `notebookWatch`, `experiment` and `arm` are null.
  - `checkpoint`, `replay` and `ticksWindow` are fresh.
  - The checkpoint ring is host-level and skips arms.
  - A transient Continue dish is never registered, so it cannot be duplicated.
  - No other mutable object is shared.

## Commands the fixer ran (from its transcript and tmp/code-minors/)

- `npx tsc -p tsconfig.json --noEmit` → exit 0 (`tmp/code-minors/tsc.out`).
- `npx eslint src/ui/notices.ts src/ui/views/NoticeHost.tsx src/ui/panels/FavoriteExtinct.tsx src/ui/favorites.ts src/worker/host.ts tests/ui/notices.test.ts tests/worker/duplicate-sharing.test.ts` → exit 0.
- Final targeted run, `tmp/code-minors/vitest.out`, finished 02:40:50 UTC → `Test Files 13 passed (13)`,
  `Tests 174 passed (174)`, 461.6 s, exit 0. The command:
  `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/ui/notices.test.ts tests/ui/favorites.test.ts tests/worker/duplicate-sharing.test.ts tests/worker/relationships.test.ts tests/worker/favorites-host.test.ts tests/worker/host.test.ts tests/worker/keep-dish.test.ts tests/sim/view-switch.test.ts`
