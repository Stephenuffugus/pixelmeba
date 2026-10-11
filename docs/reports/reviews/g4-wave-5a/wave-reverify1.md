# g4 wave 5a: adversarial re-verification after fix round 1 (favorites, garden-home)

Re-verifier: wave-reverify1 (rules, determinism, conservation, tests, player-facing truth). Uncommitted working tree at eb0bf67 + the wave's diff + both fix rounds. No repository file was edited except this report. Probes and mutants live under tmp/reverify1-g4-wave-5a/ (git-ignored).

Result: **ok = true**. Each of the 13 problems is fixed. Every original repro I re-ran now gives the right answer, and every new test I put through a load-time mutant fails on the old behaviour. Nothing above NIT is left in the fixers' scope.

## Problems (most severe first)

1. NIT [favorites] src/worker/favorites.ts:710-753 (reconcileFavorites) — After Undo, the members are found again by walking each living organism's lineage up to a member saved in the record or to the root. That walk stops at a compacted record (LINEAGE_RETAIN = 10,000 births).
   - Edge case: a member alive at the restore point but dead by the time of the Undo is not in the record. If it is also older than the 10,000 newest births, it and its descendants are missed. A family that is back could then stay "extinct" or be unpinned.
   - Found by reading the code only, not reproduced. It needs more than 10,000 births between that member's birth and the restore point, and an Undo that spans its death. The live tracker has the same documented limit, and `historyIncomplete` exists for this kind of gap.
   - Not a blocker. Worth a line in DECISIONS when the lead logs the fix round.

2. NIT [favorites] src/ui/state.ts:507, :517 — garden-home owns this file. The favorites fixer changed two default parameters there (`includeNicknames = true` for `exportDishFile` and `exportContinueFile`), which goes beyond an additive edit.
   - The change is small and is what problem 9 needed. It also changes the What if? "export before Start" path (WhatIfState.tsx:155).
   - No automated test covers it (the fixer says so).
   - The fixer logged it as a PROPOSED DECISION: a kept file is the player's own copy, like a named slot. This is consistent with SPEC §12.6 "nickname (≤ 60 chars, local)" and the Follow panel line "Nicknames stay on this device unless you choose to share them": More → Export, the sharing path, still defaults to off (UX §5.10 "include nickname (off)"). The lead should record it.

NOTE, not graded (owned by the lead, and not in this round's list): wave-verify item 4 is still open. tests/e2e/keep-dish.spec.ts:563 and :572 still expect `.prompt` to have count 0 after Run, but the Garden prompt "Tap a Sprinter." now shows there. The file is unchanged, so those checks will fail at the gate e2e run until the lead updates them. Items 10 and 11 (lead) were not re-checked.

## Per problem: refutation attempts

- VERIFIED OK — MAJOR [favorites] Undo/rewind kept favorites that were false for the restored dish (wave-verify 1a, 1b).
  - Re-ran the original probes unchanged against the current tree (`npx vitest run -c tmp/reverify1-g4-wave-5a/vitest.probe.config.ts --reporter=verbose`, 4 files passed).
  - undo-extinct: Undo from tick 366 to 0 gives `{"tickAfterUndo":0,"followedOrganismAlive":true,"fav":{…"active":true,…"members":[[37,0]],…"extinct":null}}`. Before the fix it was active:false with extinct.tick 366.
  - undo-intro: after Undo the B06 favorite is removed (`PROBE3 {"sp57":"B01"}`, no favorite and no slots). The reused birth id 57 is no longer adopted by that family.
  - My own harder probe (tmp/reverify1-g4-wave-5a/multi.probe.test.ts P1):
    - A Sprinter family with 3 members [322, 971, 972] at the undo point, tick 3165. It is starved to extinction at tick 6984, and its last member #2074 was born after the undo point.
    - After Undo: `{active:true, extinct:null, members:[[322,1260],[971,3164],[972,3164]]}`, the slot shows 3 members, and Pin is not refused.
    - save → load gives `notebookDropped` null, so the new world-reference check does not drop a reconciled record.
  - rollback() calls the same `restoreNotebook` (host.ts:2370). Read, not run.
  - Mutant: mocking `notebookAfterRestore` as a no-op (tmp/reverify1-g4-wave-5a/mut/m1.mut.test.ts) makes all 3 new fix-round tests in favorites-host.test.ts fail.
- VERIFIED OK — MAJOR [favorites] (saves verifier) Undo of a Discard left a false extinction.
  - Re-ran probe A: after the Discard, `favoriteExtinct`. After Undo, the sample is held with birth id 1. After Cancel: `member alive = true favorite = {"active":true,"extinct":null,"members":[[1,0]]}`, `Pin again -> undefined`, and after reload `extinct = null active true`.
  - `cancelHeldSample` now runs the read-only `afterTick` (host.ts:2335).
- VERIFIED OK — MAJOR [favorites] the "notebook dropped" message never reached the player.
  - src/ui/favorites.ts:118-123 keeps the message in `pendingDropped` until `followOpenDish` sees that dish open, then calls `showDropped`.
  - `keepDroppedInToast` adds the message to any toast posted in the next 9 s, such as "Opened …". The effect does not loop, because a toast that already contains the message returns early. The Favorites tab also shows it (`notebookDroppedFor`).
  - Covered by the unit test "a dropped notebook's message waits for its dish to open…". It asserts no toast before the dish opens, the message after, and the combined "Opened … {M}" text.
  - The fixer reports a desktop e2e journey for a damaged import. I did not re-run it: I had no UI problem left to prove.
- VERIFIED OK — MAJOR [garden-home] "Nothing has split yet" could be false.
  - prompts.ts:228-236: `noSplitSayable` needs `ctx.startTick === 0` and a Sprinter alive in the latest snapshot. On a loaded or continued dish the step is skipped silently after 120 watched seconds, so Feed still follows.
  - A dish at tick 0 has no earlier births, so the claim covers its whole life. A Sprinter birth that is later undone sets `sprinterBirth`, which only makes the line less likely, never false.
  - Mutants: dropping the startTick gate (mut/prompts.m2.ts) fails "a loaded or continued Garden dish never says…". Dropping the Sprinter-alive gate (mut/prompts.m2b.ts) fails "\"tap one\" needs a Sprinter to tap".
  - The remark that the first-minutes sequence restarts on every load stays as the fixer's PROPOSED DECISION. Every step still needs live evidence, so nothing false is shown.
- VERIFIED OK — MINOR [favorites] "Living members: 0" after Unpin.
  - FavoriteSheet.tsx: an active family shows the slot count. An extinct one shows 0. An unpinned one shows "Living members are counted while the family is followed. Pin again to count them.", which claims no number.
- VERIFIED OK — MINOR [favorites] Find after Follow next ran before the new snapshot.
  - host.ts 'favorite' posts the reply, then `sendSnapshot`. The promise chain runs as microtasks before the next message event, so `findFavoriteAfterChange` sets `pendingFind` before the snapshot is handled, and `onFavoriteSnapshot` runs the Find once.
  - Covered by the unit test "Find after Follow next runs on the snapshot sent after the change".
- VERIFIED OK — MINOR [favorites] only the first candidate was offered.
  - Slots carry up to 6 candidates in birth tick, then id order (FAVORITE_CANDIDATES_SHOWN). The sheet lists the rest after the first as buttons ("Or choose another surviving member, by birth time, then ID:"). The host test pins `candidates: []` while the representative is alive.
- VERIFIED OK — MINOR [favorites] `favoriteOf` missed members beyond the 200 highlighted.
  - `FavoriteMarks.member` carries a bit for every member. It is a separate buffer and transferred separately (host.ts:2476), so it is not a duplicate in the transfer list.
  - The unit test covers a member that is not highlighted. The cap test checks that all 250 members carry the bit.
- VERIFIED OK — MINOR [favorites] prototype keys and `favorites: null`.
  - Re-ran probe B: `constructor`, `toString`, `hasOwnProperty` and `stories2` each give "unknown section …" and are dropped, and the key is not kept.
  - The code uses `Object.prototype.hasOwnProperty.call(KIND_PROBLEMS, k)`. Four new malformed cases are in notebook.test.ts.
- VERIFIED OK — MINOR [favorites] favorite references were not checked against the world.
  - `worldRefsProblem` (notebook.ts) rejects an unknown species, any birth id ≥ `nextBirthId` (root, representative, members, last member), and an extinction later than world.tick. `loadSaveFile` passes the refs.
  - My P1 probe shows a record that went through Undo and reconcile still loads. Every reconcile output keeps ids below `next` and extinction ticks no later than world.tick, so these checks do not drop it.
- VERIFIED OK — MINOR [favorites] the keep flow's file export lost nicknames. `exportDishFile` and `exportContinueFile` now default to true (see NIT 2 above for ownership and the missing test).
- VERIFIED OK — MINOR [garden-home] `sessionSummaryOf` counted births from before the opening.
  - host.ts:190-196: a record counts only if `(second − span)·10 ≥ fromTick`. A record that straddles the opening is left out and flagged `compacted`, and the line then says "At least …".
  - The branch half is correctly not a problem: a branch stamped `world.tick` during the step that starts at T happened after a dish opened at T.
  - I checked that minute summaries take `second` from their last sample (history.ts summarize) and never overlap the per-second window, so span 60 is right.
  - Mutant: the old fractional rule (mut/m3.mut.test.ts) fails "opened at tick 105…" and "a summarized minute that began before the opening…".

## Evidence I ran

- VERIFIED OK — `npx tsc -p tsconfig.json --noEmit` → exit 0. `npx eslint src tests` → exit 0.
- VERIFIED OK — fence, conservation and the wave's tests: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/ui/favorites.test.ts tests/persistence/notebook.test.ts tests/worker/favorites-host.test.ts tests/ui/prompts.test.ts tests/ui/notices.test.ts tests/worker/thumbnail.test.ts tests/worker/session-summary.test.ts tests/persistence/persistence.test.ts tests/persistence/strip-names.test.ts tests/persistence/migration.test.ts` → `Test Files 16 passed (16)`, `Tests 145 passed (145)` (339 s). This includes "favorites never alter behaviour": equal stateHash and full trajectory digest over 3,200 ticks at 4× with a save → load.
- VERIFIED OK — regression: `npx vitest run tests/worker tests/persistence tests/ui` → `Test Files 42 passed (42)`, `Tests 388 passed (388)`.
- VERIFIED OK — mutants: `npx vitest run -c tmp/reverify1-g4-wave-5a/mut/vitest.mut.config.ts` → 7 failed / 37 passed. The 7 failures are exactly the fix-round tests aimed at each mutated mechanism: 3 host Undo tests, 2 prompt tests, 2 session-summary tests.
- VERIFIED OK — the fix rounds changed nothing under src/sim, content/ or the manifest. There is no SCHEMA_VERSION or PROTOCOL_VERSION bump: the protocol additions (`FavoriteMarks.member`, `FavoriteSlotMark.candidates`, `NotebookChange` 'favoritesRestored') are additive. reconcileFavorites and notebookAfterRestore only read the world (they build throwaway FavoriteTrackers). No Math.random, Date or hard-coded stateHash in the fixed worker, persistence or prompt code. `Date.now` appears only in src/ui/favorites.ts, for the toast timing.
- E2E was not re-run: I found no UI problem I needed a browser to prove.
