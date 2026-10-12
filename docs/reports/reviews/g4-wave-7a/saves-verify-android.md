# Wave 7a — P4.10 Android: saves and determinism check (2026-10-12)

**Result: ok.** I found no BLOCKER or MAJOR problem and three MINOR ones. In every case below, nothing saved is lost; the saves are only out of reach until something changes.

Scope: I checked task `android` with the saves and determinism lens. I edited only this file. Scratch files are in `tmp/verify-saves-0/`: `fs.probe.ts`, `size.probe.ts`, `vitest.config.ts`, `vitest1.log` and `fs-probe.log`.

## Problems (most severe first)

### MINOR [android] Out of space after the commit point locks the whole store

**Where:** `src/persistence/capacitorFs.ts:225-231, 243-259`.

**What goes wrong:** A lasting write error while the journal is being applied (after the commit point) locks the whole store, not just new saves.
- `commit` resolves and sets `dirty`.
- Every later operation replays the journal first, so every read also rejects for the rest of the session. That includes Saved dishes `list`, `load` and Continue.
- If the device is still full at relaunch, `FilesystemBackend.open` rejects. `sim.worker.ts` then falls back to `MemoryBackend` with persistent=false. Every save is hidden, the Saves panel shows web wording, and any save made in that session lives only in memory.

**Nothing is lost:** once space is freed, the next open replays the journal and both saves load.

**Repro (`tmp/verify-saves-0/fs.probe.ts`, case B):** I used MemoryFsOps that refuses only `slots/*` writes with Android's text `'writeFile' failed with: write failed: ENOSPC (No space left on device)`. The steps were: save slot1 A, save slot2 C, turn "full" on, then save slot1 B.

| Step | Result |
|---|---|
| Save B | resolves; `journal.json` is present |
| `list()` | rejects with ENOSPC |
| `load('slot2')` | rejects with ENOSPC |
| Relaunch, still full | `open` rejects |
| Relaunch after space is freed | slot1 = "SAVE B", slot2 = "SAVE C" |

**Suggested fix:**
- When replay fails, keep serving reads (the slot files overlaid with the pending journal) and refuse only writes.
- Or, during replay, apply `deleteRecords` before `putSlots` so it frees space first.

### MINOR [android] A damaged slot file makes the next launch delete both of its saves

**Where:** `src/persistence/capacitorFs.ts:261-275` (recovery's orphan sweep).

**What goes wrong:**
- `readSlots` skips a slot file that does not parse.
- The sweep then removes that slot's current record and its previous record at the next open, so damage that could be recovered becomes permanent.
- A slot file can be torn by a power loss after the rename (Capacitor Filesystem has no fsync) or by bit rot.

**Repro (probe A):** save slot1 A and then B, which leaves 2 record files. Cut the slot1 pointer file to its first 20 characters and reopen. The result is 0 record files.

**Suggested fix:** don't sweep records whose id starts with `<slotId>:` when that slot's file exists but cannot be read (or move them aside instead of deleting them). Record ids are `${slotId}:${savedAt}:${n}` (`store.ts:218`, `checkpoints.ts:186`, `shelf.ts:196`).

### MINOR [android]/[lead] The 30 s per-operation timer keeps counting while Android freezes the app

**Where:** `src/persistence/fsPort.ts:83-88`.

**What goes wrong:**
- The timer keeps running while Android freezes a backgrounded app (the cached-app freezer, on by default from Android 14). The monotonic clock advances during a freeze.
- The background autosave from App 'pause' (`lifecycle.ts:37-44`) is the moment this risk is highest.
- If the freeze lands mid-commit for more than 30 s, the timer can fire on thaw before the answer already queued on the main thread arrives.
- The port is then dead for the session: "Saving is stopped until Pixelmeba is restarted".
- A dead port also refuses reads, so Saved dishes and Continue fail too. The report says only that saving stops.

**Nothing is lost:** a commit cut before its commit point changed no slot, and one cut after it is applied at the next open.

**Repro (probe C):** PortFsOps with a 50 ms limit; the host answers after 80 ms. The operation rejects with the timeout text and `failed === true`. The late answer is ignored (`fsPort.ts:72`).

**Suggested fix:**
- Treat a timer that fires far later than it was scheduled (by checking `performance.now()` against the deadline) as a suspension, and re-arm it instead of failing the port.
- Add the device test "Home during a save, wait 2 min, return, save again" to ANDROID_SETUP §10.

## What holds

**Same seed + content + command log ⇒ identical stateHash through the Filesystem store.**
- I built saves of FIRST_DISH_V1 at ticks 0, 1, 299 and 777 and wrote each through `SaveStore(FilesystemBackend.open(new PortFsOps(<real MessageChannel>)))`, served by `MemoryFsOps({splitRename:true})`, which renames the way Android does.
- After a relaunch on the same files, `load` returned exactly the original text, with `usedPredecessor=false`.
- `stateHash(loadSaveFile(text).world)` equals the original's.
- A `serializeWorld` → JSON → `deserializeWorld` copy at the same moment also matches.
- I then ran the original world `run(w,400)`, the loaded one as four `run(world,100)`, and the deserialized copy `run(w3,400)`. All three hashes were identical, for example tick 777 → `0e7abd106815…`.

**The record bytes survive base64 exactly.** `toBase64`/`fromBase64` round-trip every length from 0 to 2000 and a random 3 MB buffer, and match Node's `Buffer` base64 byte for byte.

**g2 saves load and continue unchanged; no fence moved.** `npx vitest run` on the following passed: `Test Files 22 passed (22)`, `Tests 198 passed (198)` (`tmp/verify-saves-0/vitest1.log`).
- tests/persistence (the existing files unchanged, plus the new ones)
- tests/platform and tests/worker/boot.test.ts
- tests/fixtures/g2-replay, trajectory-fence-current-arms, determinism and determinism-g3
- tests/tools/android-icons and android-keystore

The tree was run with perf2-polish's uncommitted `src/sim/{movement,profiles,tick}.ts` changes in place.

**No new saved world state; no change to the save format or import checks.**
- `git diff --stat` shows no change to `src/persistence/{saveFile,store,checkpoints,shelf,idb}.ts` or `content/`.
- The store's own files (record, slot and journal) are written with `canonicalJson`, which sorts keys.
- An unreadable record → `getRecord` null → `SaveStore.load` falls back to the predecessor; covered by the e2e and by `capacitor-fs.test.ts:346`.

**Nothing outside src/sim draws simulation randomness.** A grep of the new files finds no `Math.random`, `Date` or `@sim/` import except `canonicalJson` from `@sim/hash`.

**The crash model is sound.**
- I read the crash-point enumeration (`capacitor-fs.test.ts:239-286`). It covers both rename modes, every cut k from 0 to N and every cut during recovery.
- It checks after open that no `*.tmp` file, journal or unreferenced record is left.
- The web `_copy` (`node_modules/@capacitor/filesystem/dist/esm/web.js:444-538`) reads the source, deletes it, then writes the target. That is safe here because a slot file is replaced only after the commit point. A torn `journal.json` from Android's copy fallback fails to parse, so it is treated as never committed.

**Boundary rule.** `npx eslint src/persistence src/worker src/platform` exited 0. The rule is at `eslint.config.js:113-121`. `sim.worker.ts` reaches only `@persist/*` through `boot.ts`.

**The harness never ships.** A grep for `__fsHarness` finds nothing in `tmp/dist-android`. In `tmp/dist-android-harness` it is only in `fsHarness-*.js`.

**Record size against the bridge.** At tick 3000, across all 18 recipes, a record is 34 KB to 585 KB gzipped, which is 45 KB to 779 KB as base64 text (`size.probe.ts`). Each save writes it once and reads it back once. This was not measured on a device.

## Notes (no grade)

- If the file host never starts (its dynamic import fails, `src/platform/capacitor.ts:43-46`), the worker waits the full 30 s on the first journal read before it falls back to memory. Messages from the UI queue up until then.
- `FilesystemBackend.open`'s sweep assumes one writer. The manifest's `configChanges` stops most recreations of the Android activity (fontScale is not listed), so a second worker is unlikely.
