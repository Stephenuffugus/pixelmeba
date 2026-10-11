# g4 wave 5a: adversarial wave verification (favorites, garden-home)

Verifier: wave-verify (rules, determinism, conservation, tests, player-facing truth). Uncommitted working tree at eb0bf67 + the wave's diff. No repository file was edited except this report. Probes live under tmp/verify-g4-wave-5a-0/ (git-ignored).

Result: **ok = false** (3 MAJOR on favorites/garden-home, 1 MAJOR on lead).

## Problems (most severe first)

1. MAJOR [favorites] src/worker/host.ts:743 (Undo) and :2329 (rollback); src/worker/favorites.ts:590 — The notebook is kept across Undo and rewind, but its favorites are never checked against the restored world. The records then make false claims and adopt unrelated organisms.
   - (a) Repro (probe tmp/verify-g4-wave-5a-0/undo-extinct.probe.test.ts):
     - Follow Crumbsmith #37 ("Mango"), make an undoable deposit, run until the family dies out at tick 366, then Undo to tick 0.
     - #37 is alive again, but the record still says `active:false, extinct:{tick:366, …}`.
     - The Favorites tab says "No members remain since 0:36", a time after the current dish time.
     - Pin again is refused with "No members of this family remain, so it cannot be followed again."
     - D08 §06 says "If no descendants survive, keep the record and mark the family extinct". Here they do survive.
   - (b) Repro (probe tmp/verify-g4-wave-5a-0/undo-intro.probe.test.ts):
     - Add Life puts in B06 #57 (an undoable command). Follow #57, then Undo.
     - The favorite stays `active:true` with 0 members, is never marked extinct, posts no change, and still takes up one of the three followed places. The tab says "Following".
     - Then Add Life a Sprinter. It gets birth id 57 again (the counter was rewound). After the next favorite op (a rename), the B06 family's slot shows "1 member", and `representativeEntity` is that unrelated Sprinter, so Find selects it.
     - This breaks D08 §06 ("never pretends they are the extinct family") and SPEC §12.6 ("lineage root ID … representative ID").
   - No test covers Undo or rewind after an extinction, or of a followed organism's introduction. tests/ui/favorites.test.ts only rewinds a family that is still alive.

2. MAJOR [favorites] src/ui/favorites.ts:58 — The "notebook dropped" message never reaches the player.
   - client.ts calls the notebook listeners for `loaded.notebookDropped` before the load request resolves.
   - At that moment `dishInfo` is still the previous dish (or null). state.ts `loadSlot` calls `enterDish(info)` only after `await c.loadSlotKeeping(...)`, at state.ts:432/438.
   - So `onNotebookNotice` returns at `if (n.dishId !== openDishId()) return;` and the toast is dropped. Even if it were shown, the "Opened …" toast posted right after would replace it.
   - Result: a damaged or foreign notebook silently erases the player's favorites (and later story cards and goals) with no word. The assignment and D-0070 require the message: "An unknown or malformed record is dropped with a message".
   - The worker side is tested (notebook.test.ts). The UI path is not.

3. MAJOR [garden-home] src/ui/prompts.ts:200 (nextStep noSplit) and src/ui/views/NoticeHost.tsx:52 (machineFor startTick = info.tick) — "Nothing has split yet — tap one to see what's stopping it." can be false.
   - The 120 s fallback counts from the tick the prompts began in this page session. It counts only the Sprinter births seen in snapshots since then.
   - The machine is created for every Garden dish, including a loaded save or Continue at any dish time. `isGardenDish` checks only the recipe, and `showPrompts` defaults to true (state.ts:145).
   - Repro: load a Garden save from late in a run where Sprinters split long ago (or are now extinct). Select any organism and Run. After 120 dish seconds with no new Sprinter birth, the line claims nothing has split, which the dish's own history refutes.
   - The assignment says "when 120 dish seconds pass since the dish started with no B01 birth". UX §3.2 and D08 say "never fabricate".
   - Related (MINOR): the whole first-minutes sequence ("Tap a Sprinter.", "Press Run.", …) starts again on every load, because progress is kept per dish id and every load makes a new dish id.

4. MAJOR [lead] tests/e2e/keep-dish.spec.ts:563 and :572 — These checks now fail.
   - With `showPrompts: true` they expect `.prompt` to have count 0 after Run. Now the arrival line clears and the Garden prompt "Tap a Sprinter." shows in the same `.prompt` element (NoticeHost, `promptView` not covered, Garden dish).
   - Neither builder owns this spec. The garden-home builder flagged it and did not run it. The behaviour change is intended, so the expectation needs a one-line update by the lead before the commit or gate.

5. MINOR [favorites] src/ui/panels/FavoriteSheet.tsx:75 — After Unpin, the Family sheet stays open and says "Living members: 0 members" (`membersText(f.active ? members : 0)`), even when the family has living members. A visible number that matches no measured value.

6. MINOR [favorites] src/ui/panels/FavoriteSheet.tsx:82 — "Follow next" then Find runs before the new snapshot arrives.
   - `favoriteOp` resolves on the 'notebook' reply. The worker posts the snapshot after that reply, so `.then(() => findFavorite(f.id))` reads the old `favoriteSlots` (`representativeEntity === null`) and only re-opens the sheet.
   - The representative changes, but it is not selected or centred. (PLAUSIBLE: from message order, not run in a browser.)

7. MINOR [favorites] src/ui/favorites.ts:57-68 and FavoriteSheet.tsx — SPEC §12.6 and D08 say "offer surviving descendants sorted by birth tick then ID". The UI offers only the first candidate (`slot.next`). The `favoriteRepresentativeGone.candidates` list is never shown, and `onNotebookNotice` ignores that change.

8. MINOR [favorites] src/ui/favorites.ts:116-127 (favoriteOf) — The marks carry slot bits only for the first 200 members by birth order (plus the representative). For later-born members, `favoriteOf` falls back to the record's member list from the last 'notebook' packet, which is stale. The inspector then offers "Follow this family" for a member of a followed family, and pressing it is refused with "You already follow this family."

9. MINOR [garden-home] src/worker/host.ts:174/192 (sessionSummaryOf) — `fromSecond = fromTick / 10` can be fractional, and the per-second sample S covers ticks (S−1)·10…S·10.
   - A dish opened at a tick that is not a multiple of 10 counts births from up to 0.9 s before it was opened. This is common: an autosave or Continue lands at any tick, and so does a step while paused.
   - The line then says "N births were recorded since you opened it."
   - Branches use `establishedTick >= fromTick`, so a branch established at the opening tick also counts. The test only uses opened = 100.

10. MINOR [lead] src/ui/panels/FavoriteExtinct.tsx and src/ui/views/NoticeHost.tsx — The favorite extinction card (bottom) and the one notice (top: a prompt, an experiment stamp, and in stage 2 goals and stories) can show at the same time. notices.ts blocks only for the DiscoveryCard. D09 line 133: "Do not layer this message over another D8 notification". The two tasks were built at the same time, so the lead should decide whether the extinction card goes through notices.ts or blocks it.

11. MINOR [lead] src/worker/host.ts:1523 (duplicateDish `...d`) — Existing bug, reported by the favorites builder and confirmed by reading: the copy shares the original's `relationships` watcher, so each dish's `rebind` resets or feeds the other's first-seen table. Favorites set `notebookWatch: null` correctly.

12. NIT [favorites] src/persistence/notebook.ts:185 — `NOTEBOOK_MAX_BYTES` is compared with `canonicalJson(...).length` (UTF-16 code units), not bytes. Nicknames outside ASCII make the "1 MB" approximate.

13. NIT [garden-home] src/worker/client.ts:452 — `sessionSummary()` was inserted between `family()`'s doc comment ("Living relatives of an organism …") and `family()`. The comments now sit on the wrong methods.

## Verified OK

- VERIFIED OK — fence, conservation and the new tests, re-run by me: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/ui/favorites.test.ts tests/ui/prompts.test.ts tests/ui/notices.test.ts tests/persistence/notebook.test.ts tests/worker/favorites-host.test.ts tests/worker/thumbnail.test.ts tests/worker/session-summary.test.ts` → `Test Files 13 passed (13)`, `Tests 108 passed (108)` (486 s).
- VERIFIED OK — `npx tsc -p tsconfig.json --noEmit` exit 0; `npx eslint .` exit 0.
- VERIFIED OK — regression run, by me: `npx vitest run tests/worker tests/persistence tests/ui` → `Test Files 42 passed (42)`, `Tests 368 passed (368)`.
- VERIFIED OK — nothing changed under src/sim, content/ or the manifest. No world SCHEMA_VERSION or PROTOCOL_VERSION bump; protocol additions are optional fields and new message types only. No hard-coded stateHash literals in the new tests. No Math.random or Date in the new worker, persistence or prompt code.
- VERIFIED OK [favorites] — the notebook record (notebook.ts):
  - It imports only @sim/constants and @sim/hash.
  - The checksum is sha256 over the canonical record without `checksum`.
  - Kinds go through one table, KIND_PROBLEMS. A missing kind reads as []. An unknown key is a problem.
  - Limits: 3 active and 20 unpinned. Nicknames follow cleanName's rules (≤ 60).
  - Only birth ids and birth ticks are stored (D08 "no duplicate organism").
  - NOTEBOOK_MAX_BYTES is 1 MB, not 256 KB. This is a reasoned proposed decision for the lead; 256 KB is not a canonical number.
- VERIFIED OK [favorites] — the save file:
  - The notebook sits outside the state checksum. The world checksum and stateHash are equal with and without it (notebook.test round trip).
  - An empty notebook is not written, so old files stay byte-identical.
  - `loadSaveFile` never throws over a notebook. All seven malformed cases load the world unchanged with the exact message.
  - The store does not fall back to the predecessor because of a notebook problem.
  - The g2 save and the schema 2 fixture load with an empty notebook, keep their hashes, and the original stays as the predecessor byte for byte.
- VERIFIED OK [favorites] — atomic with the world. With `failNextCommit` the slot keeps the previous pair; a damaged current record opens the predecessor pair. `notebookChecksum` is in SaveRequest and SlotInfo and copied by `slotRecordFor`, so `holdsSave` sees a notebook-only change. The host's holdsExactly, exactCopies and the Continue quick path also compare it.
- VERIFIED OK [favorites] — nicknames:
  - `exportDish` keeps nicknames only with `includeNicknames`; `stripNames` always drops them.
  - `exportSave` replaces only the file's notebook; state text and checksum are as stored (test).
  - Local saves keep nicknames (`localSave`).
  - The MoreSheet checkbox starts unchecked and both export buttons read it.
- VERIFIED OK [favorites] — every `buildSaveFile` in host.ts passes the notebook: saveSlot :402, exportDish :478, checkpoint :1298, buildFor :1886, autosave :2079. Duplicate and checkpoint branches copy the favorites only, under the new world id. Arms get no watch (test). `rebuildsExactly` is false while the notebook is not empty (test).
- VERIFIED OK [favorites] — never alters behaviour: three followed families, 4×, 3,200 ticks, a command plus Undo, and a save → load give equal stateHash and full trajectory digest. The tracker really ran (marks > 0). Favorite ops never become commands (`commands.nextSeq` and the hash unchanged).
- VERIFIED OK [favorites] — tracker tests are not vacuous:
  - Membership is compared every 50 ticks against an independent ancestry walk (`livingDescendants`).
  - A Sample Take removes organisms without a death event.
  - Follow next stays in birth order after energy, body and health are changed.
  - The extinction cause equals the lineage deathCause (DEATH_STARVATION), and the copy is exact.
  - The 200 cap and the aggregate are checked against computed means.
- VERIFIED OK [garden-home] — thumbnails:
  - The thumbnail is a pure read with no Map or Set iteration. The tie goes to the lowest species index. Positions are rounded to float32, so the snapshot and the world agree (edge test).
  - `thumbFromState` equals `dishThumb`. The Play preview equals the started dish at tick 0.
  - The slot index carries the thumbnail, and a second autosave of an unchanged dish writes nothing.
  - The painted GardenThumb SVG is removed.
- VERIFIED OK [garden-home] — prompts:
  - The machine is pure and steps only on evidence: the feeding cue from a B01 entity only; a B01 'birth' (src/sim/births.ts:355, a committed division) only.
  - The eating step is skipped unless the recorded diet is sugar only.
  - Show me only toggles a class, and reduced motion removes the pulse (`.reduced-motion *` and the media query use `animation: none !important`).
  - Nothing shows while a covering sheet is open. The prompts end when `showPrompts` is off or the dish is not the Garden.
- VERIFIED OK [garden-home] — notices: one visible notice; priority goal > experiment > story > prompt; latest request per kind; a dismissed id never returns; blocked while the DiscoveryCard is open. The `experiment-waiting` test id and the "Dismiss this notice" label are kept.
- VERIFIED OK [garden-home] — session summary:
  - It is read-only (hash equal) and posts no experiment stamp, where 'history' does (live control).
  - A quiet dish gives no line (shown as "Saved as it is now."). A compacted minute is flagged with an "At least" line.
  - Home pauses the dish when you leave the dish screen (state.ts effect), so the "Paused" badge is true.
- VERIFIED OK [both] — SHARED edits are additive:
  - state.ts: tab, sheet, wireFavorites, exportCurrent.
  - DishScreen.tsx: four mounts plus the NoticeHost replacement, which garden-home owns.
  - Notebook.tsx: the Favorites tab before Journal (UX §2 order).
  - MoreSheet.tsx: the checkbox, plus Save and leave (owner).
  - styles.css: appended blocks.
