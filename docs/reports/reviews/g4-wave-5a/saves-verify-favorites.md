# g4 wave 5a: saves and determinism check of favorites (P4.1 and the D-0070 notebook record)

Checked by an adversarial saves/determinism reviewer on 2026-10-11, against the uncommitted tree. Probes are in `tmp/verify-saves-0/` (`probe.test.ts` and `probe-e.test.ts`, run with `npx vitest run --config tmp/verify-saves-0/vitest.config.ts --root /workspaces/pixelmeba`). No tracked file was edited except this report.

Result: **ok = false** (1 MAJOR).

## Problems (most severe first)

1. MAJOR [favorites] src/worker/host.ts:743 (also :2329 rollback; src/worker/notebookWatch.ts:62; src/worker/favorites.ts:590)
   - **What is wrong:**
     - Undo and rollback keep the notebook "like the journal". That includes an extinction record written by the change being undone.
     - Undoing a Discard brings the family back, but the favorite stays `active: false` with `extinct: {…}`.
     - "Pin again" is refused with "No members of this family remain, so it cannot be followed again." while the member is alive in the dish.
     - The false record is saved and survives a reload.
     - This breaks the Honest-labels rule. The extinction card and the Favorites tab ("No members remain since 0:00") state something the world contradicts, and the player cannot fix it.
     - Undo of a Discard is the obvious recovery after the extinction card appears, and the UI sends Discard as undoable (SampleSession.tsx:134).
   - **Repro:** `tmp/verify-saves-0/probe.test.ts` "probe A".
     1. Create FIRST_DISH_V1 with seed 104729. Follow a lone founder at tick 0.
     2. sampleBegin. sampleTake (radius 1, life) on it. sampleDiscard (undoable). This posts `notebookChanged {favoriteExtinct}`.
     3. Undo. The sample is held again (birth ids 1–5).
     4. sampleCancel. The member is alive, but the record is `{"active":false,"extinct":{"tick":0,"lastBirthId":1,"cause":73,"cell":8240},"members":[]}`. Pin is refused.
     5. saveSlot then loadSlot. The member is still alive and the record still says extinct.
   - **Suggested direction:** extinction records made after the restored tick should be undone with the world. One way: snapshot `d.notebook` alongside `d.undo` and the rollback checkpoint and restore only `extinct` and `active` for records whose `extinct.tick` is greater than the restored tick. Another: on rebind, clear `extinct` when a member is alive and the extinction tick is later than `world.tick`. Add a test.

2. MINOR [favorites] src/persistence/notebook.ts:178
   - **What is wrong:**
     - The unknown-section check uses `k in KIND_PROBLEMS`, which also looks at `Object.prototype`.
     - So a stored record with top-level `constructor`, `toString`, `hasOwnProperty` (and any other Object.prototype name) passes, contrary to "an unknown key is a problem".
     - `readNotebook` then copies the key into the record, and the next `sealNotebook` writes it again.
     - Also, `raw[k] ?? []` (:180) accepts `favorites: null`.
     - The world hash is not affected, but the import check has a gap.
   - **Repro:** probe B. Seal `{format, notebookVersion: 1, worldId, nextFavorite: 1, favorites: [], constructor: 7}` with its correct checksum. `notebookProblem` returns null, `readNotebook` drops nothing, and the record keeps `constructor`. The same record with key `stories2` is correctly refused.
   - **Fix:** `Object.prototype.hasOwnProperty.call(KIND_PROBLEMS, k)`, or a `Set` of kind names. Treat only `undefined` as a missing kind.

3. MINOR [favorites] src/persistence/notebook.ts:117
   - **What is wrong:** a favorite's references are never checked against the world it loads with. `notebookProblem` gets only `worldId`, so:
     - a `speciesId` that is not in the dish (any id matching `/^[A-Z][A-Z0-9_]{0,31}$/`) loads;
     - `rootBirthId`, `representative` and member ids at or above `counters.nextBirthId` load;
     - `createdTick`, member birth ticks and `extinct.tick` later than `world.tick` load.
     - The UI then shows the raw id as the species name ("ZZ9 #n"). CLAUDE.md says "Unknown IDs are errors".
     - The world hash is not affected.
   - **Repro:** by reading the code (`favoriteProblem` :111–140 takes no world). Edit a saved notebook's `speciesId` to "ZZ9", seal it again and import: no `notebookDropped`.
   - **Fix:** pass the world to `notebookProblem`/`readNotebook` (loadSaveFile already has it) and check `speciesId ∈ world.species`, `birthId < counters.nextBirthId` and `tick <= world.tick`.

4. MINOR [favorites] src/ui/state.ts:504
   - **What is wrong:**
     - The D-0033 keep flow's "Export it as a file" (all ten slots used) is how the player keeps their own dish. It calls `exportDish(dishId, false)` with `includeNicknames` defaulting to false, and offers no checkbox.
     - The kept file silently loses every family nickname.
     - The `exportContinueFile` path (`exportSave('autosave')`) also drops nicknames.
     - The assignment says local keeps hold nicknames. This export is a keep, but it follows the share-export default.
   - **Repro:** fill slots 1–10. Follow a family named "Mango". Start a new dish, then choose Keep → Export it as a file. The file's `notebook.favorites[0].nickname` is null (exportedSaveText at host.ts:123 and buildSaveFile at :215 drop it without the opt-in).
   - **Fix:** either pass `true` on the keep-flow export, or offer the same "Include family nicknames" choice there. Log the ruling either way.

## Verified OK

- **Never alters behaviour across 1×/4×, a save/load in the middle of a sample transaction, and a save right after a notebook change.**
  - Probe C ran three scenarios:
    - favorites at 1× then 4×;
    - no favorites at 4× then 1×;
    - favorites at 4× then 4×.
  - Each scenario:
    1. runs to tick 400, then sampleBegin and sampleTake (held);
    2. saveSlot, then loadSlot into a new dish while the sample is held;
    3. sampleCancel, then runs to tick 1600;
    4. renames a favorite, saveSlot, then loadSlot;
    5. runs to tick 2400.
  - All three end with stateHash `b7d37ea61ea76728` and equal full trajectory digests.
  - The notebook read back after the mid-transaction load equals the one materialized before the save (held members included).
  - The members are identical at 1× and at 4×.
- **The builder's tests:** `npx vitest run tests/persistence/notebook.test.ts tests/ui/favorites.test.ts tests/worker/favorites-host.test.ts` gave `Test Files 3 passed (3), Tests 26 passed (26)`, re-run by me. This includes the never-alters host scenario: three families, 4×, 3,200 ticks, Undo, and a save → load.
- **Regression on the shared tree:** I ran these together: `tests/fixtures/g2-replay`, `trajectory-fence`, `determinism`, `tests/persistence/{persistence,migration,strip-names,checkpoints}`, `tests/worker/sample-transaction`. Result: `Test Files 8 passed (8), Tests 57 passed (57)`. The g2 saves load and continue identically, and the fence did not move.
- **The world checksum and stateHash do not depend on the notebook:** probe D built the same world three ways: no notebook, a notebook with nicknames, and a notebook without them. All three checksums are equal. Loading gives the same stateHash as the source world. Nicknames come back only with the opt-in (`X` vs `null`).
- **stepDish is equivalent to before:** the old `stepObserved(world, obs)` is `step(world, {afterStage: obs.hook}); obs.afterTick(world)` (pairedRun.ts:622). The new single hook list keeps the observer first, then the relationship watcher, and calls `obs.afterTick` the same way. `NotebookWatch.hook` is undefined, so no hook is added.
- **The watch only reads:** favorites.ts/notebookWatch.ts use `recordField`, `field` and `keptRecord` (lineage.ts:138–157, pure), `entityCell` and `buildFamily`. No `Math.random`, `Date` or rng appears in any new file (grep). The watch is not created for arms (`d.arm`), the transient Continue copy, or rollback replays (rollback steps a fresh world with plain `step`).
- **Canonical and order-independent:** the checksum is sha256 over `canonicalJson` (key order does not matter; probe B: a permuted payload gives the same canonical text). Members are written sorted by birthId and validated as strictly ascending. The favorites list is in append order. Map iteration in the tracker always ends in a total-order sort (birth tick, then id).
- **Atomic with the world:** the notebook travels inside the same save text, so there is one commit. `notebookChecksum` goes through `slotRecordFor`, so `holdsSave`, `holdsExactly`, `exactCopies` and Continue's fast path all see a notebook-only change (covered by the builder's tests, re-run).
- **A notebook problem never throws, and SaveStore.load never falls back to the predecessor because of one:** `readNotebook` returns an empty notebook plus the exact message. The seven malformed cases each keep the world hash (builder's tests, re-run).
- **Validated on import:** `exportSave` replaces only the notebook (JSON round trip of the stored `JSON.stringify` text). The state and its checksum stay byte-for-byte. A notebook that could not be read is left out.
- **Ledger:** the notebook carries no carbon, nutrient or mineral (ids and birth ticks only), so it has nothing to count. It is outside the state and outside `checkLedger`.
- **Members never exceed AGENT_CAP:** I checked whether living plus held members could pass AGENT_CAP. Time stays paused while a sample is held (host.ts pump), and inoculation is refused while held. So no births happen while held, and `members.length <= AGENT_CAP` holds.
- **The 1 MB NOTEBOOK_MAX_BYTES deviation is sound for saves:** a legal record (3 × 6,000 nested members plus 20 × 200 unpinned) is about 375 KB. That fits 1 MB and would not fit 256 KB, so a 256 KB cap would drop legal records on load. This is the owner's ruling to confirm.
- **Follow made after the undo point, then Undo (probe E):** the favorite keeps its founder root. The vanished representative is reported as gone and a "Follow next" candidate is offered. After the same ticks are re-run and the dish is saved and reloaded, the reused birth id is not adopted into the family.
