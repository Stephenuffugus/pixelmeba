# Wave 7a integration verify: saves and determinism lens

Verifier (saves lens), 2026-10-12. This review covers the lead's changes listed in integrate-lead-7a.md (#1–#4, #12, #13) and D-0095,
and checks them against "Saves are sacred". Probes are in `tmp/verify-7a-int-saves/` (gitignored). No tracked file was edited except this report.

**Verdict: ok = true. There are no BLOCKER or MAJOR findings.** I found 2 MINORs and 4 NITs. Every crash, overlay and discard probe passed.

## What I tried to break, and what happened

1. **The overlay** (`overlay.ts`). I made crafted commits under a full device, so the journal stayed pending, and compared three views: the overlay in the session, the overlay after a relaunch while still full, and the files after the journal applied on a relaunch with space. The cases were:
   - put then delete the same slot
   - the same slot put twice (the last one wins)
   - deleting a record that another slot still names
   - deleting a slot and putting it again
   - putting a record and dropping it in the same commit

   I ran each case with both rename modes and compared every value as canonical JSON. Every `listSlots`, every `getSlot` and every record that a slot names were identical across the three views. The only difference: a record that the commit puts, but that only a slot the same commit deletes would name, can still be read in the session. The next open sweeps it. Nothing names it, so nothing reaches it, and a commit that applies normally behaves the same way. This is not a defect.
2. **Crash safety under a full device** (`crash-full.ts`). I ran four scenarios: a slot save, a checkpoint commit with an eviction, a shelf commit, and a remove. Each ran with both rename modes and with two kinds of full device: one that refuses only slot writes (after the commit point) and one that refuses all writes (before it).
   - I cut the commit, plus the session's later reads (each read retries the journal), after every operation k.
   - I relaunched (a) still full, then cut that open after every operation j and relaunched with space, and (b) with space.
   - The view each time compared the slot, current text and predecessor text against the clean old or clean new view.
   - **Result: 16 configurations and 15,780 relaunches, ALL OK.** Each relaunch held exactly the old state (cut before the commit point) or exactly the new state (cut after it). The predecessor was kept, the store was clean (no `*.tmp`, journal or orphan), the open while full never threw, and a save worked afterwards.
3. **discard** (`unreadable-discard.ts` §5). These cases left the files exactly as before:
   - the same id put twice with different text (5a)
   - re-putting a record already on disk followed by a failure: the held record is kept, because `held === text` never enters `created` (5b)
   - a failing read of the record path, which throws before `created.push` (5c)
   - a record rename that reported failure but landed: it is removed, which is safe because nothing names it yet (5d)

   `renaming` is set after `journal.tmp` is verified and before the rename, which is the earliest moment the commit point can land. A PortFsOps timeout marks the port dead, so discard's removes are refused and the leftovers are swept at the next open. With the D-0095 re-arm, the operation simply waits. A record id that a pending or landed journal names cannot be in `created`, because `held !== null`.
4. **recover with unreadable slot files.**
   - A damaged `slot10` keeps the `slot10:` records, and the `slot1:` orphan is removed.
   - A damaged `slot1` keeps the `slot1:` records, and the `slot10:` orphan is removed. Slot ids never contain ':', so `<slotId>:` prefixes cannot collide.
   - Saving over the damaged slot, and the next open, are covered under MINOR-1. Damaged checkpoint and shelf files are covered under NIT-1.
5. **The fsPort re-arm** (`fsport.ts`, which uses a controlled clock and timer queue). Three late fires in a row stay pending, then the answer is used, the port is not failed and no timer is left. A late answer after a real timeout is ignored, and later operations are refused without posting. `p.timer` is changed on the same object that `answer` clears, so there is no double settle. An operation is held only while every expiry is more than 5 s late, which means the app is frozen. The first on-time expiry fails it, so it always settles once the app runs. A stall in the worker (gzip, a pump) that delays a timer by more than 5 s re-arms the timer. That is the safe direction. NIT-3 covers the window below 5 s.
6. **parseSaveFile `tick: s.tick`.** The checksum is over `original` (the state), so it is unchanged. The `host.ts` baseline checks at :2814 and :2949, and the snapshot check at :3166, compare `.checksum`, which is not changed. No caller reads a loaded file's `tick`: every `file.tick` in host.ts comes from `buildSaveFile`, which already writes `state.tick`. Exports are rebuilt from the world. `migrateWorldState` keeps `tick`; schema 3 only reads it. No effect on hashes.
7. **The perf-stress `recipeId: null`.** `SaveMeta.recipeId` is `string | null`. This is a tool only and is never shipped.

## Problems

### MINOR-1: a damaged slot file is offered as a free slot, and saving into it loses the kept saves at the next open

Where: `src/persistence/store.ts:265` `freeSlot` (built on `listSlots`) and `src/persistence/capacitorFs.ts:335`.

D-0095 keeps the records of an unreadable slot file and hides the slot "until it is saved over". `freeSlot()` returns that slot as free, so the next save to the first free slot quietly reuses it. The new save has `previous: null`, and the next open sweeps both kept saves. The player never learns they existed.

Repro (`unreadable-discard.ts` §2):

```
2. empty slot file at open: records kept 2 | freeSlot() slot1 | getSlot null
   saved over: previous = null | records now 3 | load {"text":"SAVE C",...}
   next open: records 1 (A and B swept)
```

This is still strictly better than before D-0095, which swept the records at the first open, and it matches the decision's wording, so it is not a false statement. But the kept saves can be recovered (their records are intact) and they are deleted without any player action on them.

Possible fixes, either one:
- (a) `recover` rebuilds the pointer of an unreadable slot from its newest kept records. The record ids carry the save time, and each record holds the whole checksummed save file.
- (b) The backend reports unreadable slot ids, and `freeSlot` skips them. The slot stays hidden but is never chosen automatically.

If neither is done, add a line to D-0095 saying that saving into the hidden slot lets the next open remove its old records.

### MINOR-2: removing a save cannot free space on a full phone

Where: `src/persistence/capacitorFs.ts:400–433`, the commit path.

A remove has to write `journal.tmp`, and while a journal is pending every write, including a remove, is refused. So on a full phone the player cannot free space from inside Pixelmeba (`crash-full.ts`: `remove … fullAll act=rej QuotaExceededError`; the lead's own D-0095 test asserts that remove is refused while pending). This existed before D-0095 for the first case, and the pending case is deliberate. Nothing is lost. But the copy for the full-device state, ANDROID_SETUP §11 ("refuses new saves as storage full until space is freed"), does not say that deleting a dish in Pixelmeba will not help.

Fix: say in ANDROID_SETUP §11 and D-0095 that space must be freed outside Pixelmeba. Alternatively, let a remove go through while a journal is pending, by applying the pending journal's record drops and the remove's drops without writing a pointer. That is a design change, so it belongs with the owner.

### NIT-1: a damaged checkpoint or shelf slot file keeps its records forever

The checkpoint ring evicts only the slots it can list, and `Shelf.remove` refuses an id it cannot read. So the records of a damaged checkpoint or shelf slot file, and the file itself, stay for good. They are counted in `usage()` and cannot be removed from the app.

Repro: `unreadable-discard.ts` §3 shows the damaged checkpoint's record still on disk after 20 more ring writes and a reopen. §4 shows a damaged shelf baseline: listed 0, `remove()` returns false, 1 record on disk.

The leak is bounded (one damaged file and its records). This could be accepted in D-0095, or the sweep could drop the records of an unreadable `checkpoint-` file once the ring holds `CHECKPOINT_RING_SIZE` newer readable ones.

### NIT-2: the docs say "StorageFullError" where the code refuses with the error that stopped the journal

Where: ARCH §11.1 ("writes are refused with `StorageFullError`") and D-0095 ("writes are refused with StorageFullError").

`serial(write)` throws `toStorageError(e)`, so it gives StorageFullError only when the journal failed for lack of space. A torn slot read-back or an I/O error refuses with that error instead. The code comment at `capacitorFs.ts:24` says this correctly. Suggested wording: "refused with the error that stopped it (StorageFullError when the device is full)".

### NIT-3: an on-time-ish timer can still beat an answer that is already waiting

Where: `src/persistence/fsPort.ts:97`.

If the worker stalls for less than 5 s just as the 30 s limit ends, and the answer arrived during the stall, the timer can run before the message and fail the port. In `fsport.ts` (b), a fire 4.9 s late with the answer queued behind it gives "did not answer" and `failed: true`. This needs an operation that took 25 s or more, so it is very unlikely, and it existed before D-0095.

Optional fix: on expiry, wait one macrotask (`setTimeout(…, 0)`) before failing, so that a queued answer wins.

### NIT-4: dropping records first relies on the journal being written to disk before the removes

Where: `src/persistence/capacitorFs.ts:289–294`.

The crash enumeration models operations that persist in order. Capacitor's `writeFile` does not fsync, and the read-back compare reads the page cache. After a power cut (not an app crash), the record removes can therefore be on disk while `journal.json`'s data is not. The journal then fails to parse and is discarded as "never committed". The old pointer then names a dropped record:
- for a save, the predecessor's predecessor goes, and current plus predecessor still load;
- for a checkpoint eviction, the evicted checkpoint is listed but cannot be read.

The old order (pointers first) had a matching power-cut exposure on the new record's data, so this is not a regression worth reversing. A sentence in the ANDROID_SETUP device notes would be enough: "a power cut, unlike an app kill, is not covered by the enumeration".

## Not in this lens

The lead's `npm run check` log (`tmp/lead/check-7a.log`) ended with `EXIT 1`: 2,022 passed and 1 failed. The failing test is `tests/render/phase3.test.ts > fungal segments (D-0046; never the body path) > fungi and viruses are told from the manifest; …`. That is render code. I did not investigate it, and the lead needs to look at it before the commit.

## Verified OK (commands and results)

- `npx vitest run tests/persistence tests/platform tests/worker/boot.test.ts` → 16 files, 169 tests passed (626.7 s, started 13:20:06 after the lead's check finished).
- `npx tsx tmp/verify-7a-int-saves/crash-full.ts` → ALL OK. That is 16 configurations (4 scenarios × atomic or split rename × slot-writes-full or all-writes-full) and 15,780 crash and relaunch cuts. Each relaunch held exactly the old or the new view, kept the predecessor, was clean, opened while full, and could save afterwards. The overlay view while pending equalled the applied view for all 8 configurations that pass the commit point.
- `npx tsx tmp/verify-7a-int-saves/overlay.ts` → in all 5 crafted journals × 2 rename modes, the pending overlay, the overlay at relaunch while full and the applied view are equal for every slot and every record a slot names. The only difference is an unnamed orphan, which is the same as in a normal commit.
- `npx tsx tmp/verify-7a-int-saves/unreadable-discard.ts` → 'slot1' and 'slot10' prefixes are kept apart; discard edges 5a–5d leave the files as before and keep the held record. It also confirms MINOR-1 and NIT-1.
- `npx tsx tmp/verify-7a-int-saves/fsport.ts` → three late fires re-arm and the late answer is used. The fire 4.9 s late fails the port (NIT-3). After failure, operations are refused without posting.
- I read parseSaveFile, its callers and the migration: the checksum, the stateHash and the baseline and snapshot checksum comparisons are unchanged by `tick: s.tick`.
