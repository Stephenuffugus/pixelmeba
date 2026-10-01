# D-0033 keep-dish: re-verification of fix rounds 2 and 3 (saves and state lens)

Re-verifier report, 2026-10-01. Commit under review: `f088948` (fix round 3). Fix round 2 (`7962785`) is
covered as well, since it was committed without a re-verification. This was a read-only review: the only
repository file written is this report.

All builds and tests ran in a snapshot of the commit, never in the working tree:
`git archive f088948` into `tmp/reverify3-saves/snap`. A second snapshot of the parent `c26cc76` (round-2
code) is in `tmp/reverify3-saves/parent`, used to compare old and new behaviour. Probes and logs are in
`tmp/reverify3-saves/` (git-ignored). E2E used `E2E_PORT=4231 E2E_OUTDIR=tmp/dist`, and port 4231 was
stopped afterwards.

**Verdict: ok = true.** There is no BLOCKER or MAJOR.
- Every round-1 re-verification problem and every carry-over holds under the saves lens.
- There are three MINORs:
  - one regression from round 3's autosave queue;
  - one place the one-time-format carry-over missed;
  - one typography remainder that is outside the ruling.

## Problems (most severe first)

### 1. MINOR (new, regression in round 3): an autosave that waits in the queue fails with "no dish …" if the dish is let go before its turn

**Where**
- `src/worker/host.ts:333`: the `autosave` case now queues `this.autosave(msg)` behind `autosaveTail`.
- `src/worker/host.ts:1798`: `this.autosave` calls `this.need(msg.dishId)` only when its turn comes.
- Before round 3, the handler took the dish synchronously (`const d = this.need(msg.dishId)`), before
  its first `await`. A `dispose` that followed could no longer affect it.
- Now a `dispose` handled before the autosave's turn makes it fail with `no dish x`. This also applies to
  the first autosave, which waits one microtask.

**Repro.** Worker probe N5, `tmp/reverify3-saves/snap/tmp/rv3/n3.probe.test.ts`. The steps are
`handle(autosave 9001)`, `handle(autosave 9002)`, then `handle(dispose x)`.

| Code | Reply to 9001 | Reply to 9002 |
|---|---|---|
| `f088948` | `error`, `"no dish x"` | `error`, `"no dish x"` |
| parent `c26cc76` | `slotSaved` (Continue at tick 20) | `slotSaved` (Continue at tick 20) |

Logs: `probes3.log` (f088948) and `parent-n5.log` (parent).

**Reach in the app: narrow.**
- The UI posts `dispose(old)` only after a replacing action's reply.
- So an autosave fails only when it is still waiting behind another slow autosave at that moment.
  Examples:
  - the 30 s interval together with a comparison's completion or a manual save;
  - a large dish, where each autosave builds a 5 MB file in about 0.2–0.5 s.

**What the player sees**
- `autosave()` shows "Autosave failed; your previous save is intact. (no dish dish-…)". The message
  includes an internal id, and it appears over the new dish.
- If the failed autosave was a manual save's own autosave, the toast is instead "Saved “X”, but Continue
  could not be updated …".

**What is lost: nothing.**
- The keep has already written Continue, or the new dish's next autosave will write it.
- Store contents are unaffected. The only defect is the misleading message.

**Fix (either)**
- Resolve the dish (`need`) synchronously, before queuing, and pass it to `autosave`.
- Or answer a disposed dish's queued autosave with `wrote: false`, which writes nothing.

Add N5 as a unit test.

### 2. MINOR (carry-over 2 incomplete): the Save sheet still names a save's moment in seconds

**Where.** `src/ui/panels/MoreSheet.tsx:188`, the More → Save slot buttons:
`` `${s.name} · ${Math.floor(s.tick / 10)} s` ``.

**Repro.** Run the Garden to 0:05, then Save to Slot 1. Open More → Save again. The Slot 1 button reads
"Slot 1 · Little Living Garden · 5 s".

The same save is shown three ways:

| Screen | Text |
|---|---|
| Keep and What if? sheets | "Slot 1: Little Living Garden · 0:05" |
| Saved dishes and Home | "at 0:05 dish time" |
| Save sheet | "· 5 s" |

D-0040 asks for "one time format per save". The guard test (`tests/ui/keep-words.test.ts:29`) only
checks `Saves.tsx` and `Home.tsx`, and only for "s simulated", so it cannot catch this.

**Fix.** Use `clock(s.tick)` or `dishClock(s.tick)`, as the Keep sheet does (`src/ui/strings/keep.ts:98`).
Widen the guard to every slot listing.

### 3. MINOR (outside D-0040's "dish name" scope, for the P3.11 copy pass): two import refusals still straight-quote a name

**Where**
- `src/persistence/saveFile.ts:275`: an unknown species, `"${cleanName(name)}" (${id})`.
- `src/persistence/saveFile.ts:290`: an extra ability that cannot be simulated, `the extra ability "${…}"`.
- Both are player-facing Import toasts. They quote a species or ability name, not a dish name.
- The round-3 guard scans only `src/ui`, plus `d.name` in `host.ts`.
- What if? idea titles (`host.ts:1736`; `src/sim/variants.ts:537/542/547`) are the disclosed K2 follow-up
  and are not repeated here.

**Repro.** Import a file whose manifest names an ability this build lacks. The toast reads `the extra
ability "…" (E99)`.

## (A) Re-verification round 1's problems, against fix round 2 (as it stands in f088948)

- **VERIFIED OK — reverify1 problem 1 (MAJOR): the dish Continue holds was kept again on every relaunch.**
  - **Round-1 probes, unchanged.** The round-1 re-verifier's probes
    (`tmp/reverify-keep-dish/keep.reverify.probe.test.ts`, copied to `snap/tmp/rv3/r1.probe.test.ts`) give
    9/9 passed.
    - Q2 uses only Slot 1 over three launches.
    - Q2b uses only Slot 5.
    - Q1, Q1b (stale Continue), Q2c, Q3, Q4, Q5 and Q8 still hold.
  - **Load-time mutant M67** (`snap/tmp/rv3/vitest.m2.config.ts`). It removes round 2 (a), the rebinding
    (`follow` → `!d.transient`), and (b), the exact-copy binding (`exact = []`). This is round-1 behaviour.
    13 tests fail:
    - the five per-action "Continue is rebound" tests;
    - the round-2 tests named after probes Q2, Q2b and R2;
    - the older-build test, the failed-rebinding test and the exact-copy test;
    - my copies of Q2 and Q2b.

    Log: `mut-m67.log`.
  - **Worker probe N2**, 7 launches on one backend:
    1. Slot 1 is opened, and one food command is accepted while paused. The autosave writes it (bound
       Slot 1/R1).
    2. On the next launch Play → Start keeps it into Slot 1, and `slot1.previous === R1` (the predecessor
       is kept).
    3. Launches 3–5 plan `saved`, and the store is byte-identical.
    4. The UI's autosave of an unrun Garden makes it Continue.
    5. The next launch plans `unchanged` and writes nothing.

    Only Slot 1 is ever used.
  - **E2E** (desktop): journey 12 (`keep-dish.spec.ts:594`, R1) and journey 13 (`:629`, R2) pass.
- **VERIFIED OK — problem 2 (toast 14 px).**
  - `.toast { font-size: var(--fs-body) }` (`src/ui/styles.css`).
  - Journey 15 (`keep-dish.spec.ts:778`) passes on desktop.
- **VERIFIED OK, apart from MINOR 2 above — problem 3 (two time formats).**
  - Saved dishes rows, checkpoint rows and the Home card use `atDishTime` / `continueCardText`
    (`state.ts:1515-1522`).
  - My e2e probe reads "Little Living Garden — at 0:06 dish time. Opens paused." on Home and "at 0:06 dish
    time · …" on Saved dishes.
- **VERIFIED OK — problem 4 (mixed quotes).**
  - `checkpointOpenedText` and `savedToastText` use curly quotes (`state.ts:363-365`, `:1574-1577`).
  - A grep of `src/ui` for straight quotes around interpolations in templates and JSX is clean.
  - `checkpoints.test.ts` passes.
- **VERIFIED OK — problem 5 (paired-card line untested).** Journey 14 (`keep-dish.spec.ts:666`) exists
  and asserts the setup-panel line at ≥ 16 px and no toast. I did not rerun it; the fixer's logs show it
  passing.
- **VERIFIED OK — problem 6 (rebuildsExactly comment).**
  - The comment now states the authored-start comparison (`host.ts:1453-1455`).
  - The test at `keep-dish.test.ts:788` passes.

## (B) The round-3 carry-overs

- **VERIFIED OK — carry-over 1: a paused change reaches Continue by checksum.**
  - **The code.**
    - The UI's tick skip is gone (`state.ts:350-358`).
    - The worker builds the file at every event and skips only when `holdsSave` holds
      (`host.ts:1797-1817`, `store.ts:122-165`).
    - `save()` builds its record through the same `slotRecordFor`, so the comparison cannot miss a field.
    - `canonicalJson` drops `undefined` and sorts keys, so a structured-clone index compares equal.
  - **Load-time mutants** (`snap/tmp/rv3/vitest.mutant.config.ts`, over keep-autosave and
    keep-continue-ui; tracked files untouched):

    | Mutant | What it changes | Failed | Log |
    |---|---|---|---|
    | `MUT=tick` | the worker skips when Continue has the same tick and name (round-2 behaviour moved into the worker) | 7 of 18 | `mut-tick.log` |
    | `MUT=always` | always writes | 10 | `mut-always.log` |
    | `MUT=nobind` | the binding is ignored in "exactly" | 2 | `mut-nobind.log` |

    - `MUT=tick` fails all four paused-change tests at the "Continue holds the change" assertions (paused
      Add Life, evolution setting, rename and pin, journal note), plus three binding tests.
    - `MUT=always` fails every byte-identity and "write once" test in both files.
    - `MUT=nobind` fails the manual-save rebinding test and the binding-is-part-of-exactly test.
  - **The built app.** New e2e probe `snap/tmp/rv3/e2e/paused-change.spec.ts`, desktop:
    1. Run to 0:06 and send a background autosave.
    2. Paused Add Life: "0:06 · 56 alive" becomes "0:06 · 61 alive".
    3. Send a background event, reload, and open Continue on Home. It shows "0:06 · 61 alive".
    4. Reload again and open. It still shows 61, and Saved dishes lists Continue only.

    | Build | Result | Log |
    |---|---|---|
    | `f088948` | passed | `e2e-probe.log` |
    | parent `c26cc76` | **failed**: "Expected: "0:05 · 61 alive" Received: "0:05 · 56 alive"" | `e2e-parent.log` |

    On the parent build the paused change was lost across the relaunch.
- **VERIFIED OK, apart from MINOR 2 — carry-over 2: one time format.**
- **VERIFIED OK — carry-over 3: curly quotes around dish names.**
  - Player-facing dish-name quotes in `src/ui` and the two keep refusals in `host.ts:1861/1867` are curly.
  - The What if? refusals change with them, as D-0040 rules. `whatif.test.ts:458` still passes.
  - The species and ability names outside this scope are MINOR 3.
- **VERIFIED OK — carry-over 4: toasts at 16 px.** Journey 15 passes on desktop. `pointer-events: none`
  and the zoom-column clearance are as described. The disclosed 800×360 at 200 % cut-off is D-0040's
  known limit.
- **VERIFIED OK — carry-over 5: ability names in gain and loss lines.**
  - The names come from the dish's recorded module list (`DishInfo.registry`, `w.content.modules`).
  - `tests/ui/feed-modules.test.ts` passes 7/7 in the snapshot.
  - There is no other caller of `visualEvents` (grep).

## (C) The saves-and-state lens: what holds

- **VERIFIED OK — no simulation state is touched.** Probe N1:
  - the open dish's `stateHash` and tick are identical across an autosave that writes, one that does not,
    and a keep (Play Start with keepFrom);
  - a paused command changes the hash, and only that.
- **VERIFIED OK — a changed dish is never skipped, and an unchanged one is never rewritten.**
  - A tick, a paused command, a rename, a pin, a journal note (including after its own failed autosave)
    and an evolution setting are each written at the next event.
  - Repeated, concurrent and run-then-pause autosaves keep the store byte-identical after the first write.
    Covered by keep-autosave (14), keep-continue-ui and my N2.
- **VERIFIED OK — the predecessor is kept.** N2: `slot1.previous === R1` after the keep. The keep-autosave
  paused Add Life test has `after.previous === before.current`.
- **VERIFIED OK — slots full: Cancel changes nothing, run state included.** On desktop, journey 3
  (`keep-dish.spec.ts:263`, 200 % text) and journey 10 (`:521`, "Cancel lets it run on") pass.
- **VERIFIED OK — a failed write refuses and changes nothing.**
  - The store-state assertions in keep-dish.test.ts (`:200`, `:222`, `:942`, `:1017`) pass with the new
    wording.
  - A failed autosave keeps the previous Continue (keep-autosave journal test).
- **VERIFIED OK — the Continue rebinding never writes a stale Continue over a newer save.**
  - Probe N6 puts an autosave in flight while the dish keeps stepping, then a replacing keep, over 13
    interleavings.
  - In every one, Continue ends at the kept moment (tick 45), bound to Slot 1 and equal to it. It never
    ends at the older in-flight moment.
  - Q1/Q1b (stale Continue over a newer Slot 1) still pass.
- **VERIFIED OK — What if?.** `whatif.test.ts` passes within the targeted run. The only message change is
  D-0040's curly quotes.

## Commands and results (this session, all in the snapshot)

- **Targeted unit tests** pass: 8 files, 145/145, 305 s (`unit-targeted.log`). The command:
  `npx vitest run tests/worker/keep-autosave.test.ts tests/worker/keep-continue-ui.test.ts
  tests/worker/keep-dish.test.ts tests/worker/keep-strings.test.ts tests/worker/whatif.test.ts
  tests/sim/view-switch.test.ts tests/persistence/checkpoints.test.ts tests/ui/keep-words.test.ts`
- `npx vitest run tests/ui/feed-modules.test.ts`: 7/7.
- **Probes and mutants:**

  | Command | Result |
  |---|---|
  | `npx vitest run --config tmp/rv3/vitest.config.ts tmp/rv3/` | r1 probes 9/9; N1, N2, N5, N6 ran (N5 output above) |
  | `MUT=tick` / `always` / `nobind` with `--config tmp/rv3/vitest.mutant.config.ts` | 7 / 10 / 2 failed of 18 |
  | `--config tmp/rv3/vitest.m2.config.ts -t "Fix round 2\|fix round 2\|Q2"` | 13 failed |

- **E2E** (desktop):
  - My probe: 1 passed on f088948 and 1 failed on the parent build.
  - `npx playwright test tests/e2e/keep-dish.spec.ts --project=desktop -g "Cancel lets it run on|relaunch
    the dish Continue holds|two launches|all ten slots used: starting|toasts are body size"`: 5 passed
    (7.8 min).
  - Port 4231 is stopped.
- **Not rerun:**
  - `tsc`, `eslint` and the whole unit suite (the lead's commit message records tsc and eslint as clean);
  - the other e2e projects and specs.
