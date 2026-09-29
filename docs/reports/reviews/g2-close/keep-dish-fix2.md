# D-0033 "keep the open dish first": fix round 2

Fixer report for the lead, 2026-09-29. It answers `keep-dish-reverify1.md` (one MAJOR, five MINORs).
Nothing is committed; the lead commits. Scratch files are in `tmp/fix2-keep/` (git-ignored): logs, the
mutation config and script.

## Per problem

### 1. MAJOR — after every relaunch the dish Continue holds was kept again, into a new slot each time — FIXED

**Cause, confirmed.** Both halves the re-verifier named:
- the keep of the dish Continue holds neither rewrote nor rebound Continue (`!d.transient`), so on the
  next launch Continue was still unbound, or bound to the slot being opened;
- the UI never autosaved a dish that an action opened and the player left unrun: `enterDish` marked it
  "already autosaved at this tick", so the 30 s, background and page-close autosaves skipped it and
  Continue kept the dish before it.

**Fix, in three parts.** Each part alone prevents the duplicates in the re-verifier's flows: without
(a), without (b) and without (c) (mutants M6, M7, M9 below), Q2, Q2b and R2 still pass. Together they
also cover a failed write, saves from older builds, and an app closed before any autosave.

- **(a) Continue is rebound when its dish is kept** (`src/worker/host.ts` `keepDish`, `const follow`):
  - When the keep of the dish Continue holds writes a named slot, Continue is written again: the very
    file just written to that slot, bound to it (`activeSlot` and `activeRecord` of the new record).
    The Continue it replaces becomes its predecessor.
  - The next launch's quick check then answers 'saved'.
  - When it is exported instead (all ten used), no slot is written and Continue is left exactly as it
    was.
  - `WhatIfKept.autosaved` is now true for the dish Continue holds when this rebinding landed (doc in
    `protocol.ts`). The player's line is unchanged: "Saved “X” from Continue to Slot N first."
- **(b) Continue is bound to a named save that holds exactly its file** (`bindingOf` → `exactCopies`):
  - The match is the same index checksum (over the whole serialized state, world id and moment
    included) and the same name. It is read from the index; nothing is loaded.
  - This match comes first. It prefers the recorded slot when that slot is one of the matches, else
    the lowest-numbered one.
  - If none matches, the round-1 recorded binding applies, unchanged (`activeRecord` must still be
    that slot's record).
  - A changed dish never matches, so no save of a changed dish is skipped.
  - It covers a failed rebinding in (a), and a Continue written before this fix.
- **(c) Continue follows the dish an action opened** (`src/ui/state.ts` `enterDish(…, continueHolds)`):
  - A dish that Play, New Dish, a card, a named save, Import, Duplicate or What if? opened is written
    to Continue at the next autosave (30 s, background, leaving the page), even at an unchanged tick.
  - This is UX §2: "Home ─ Continue (last dish …)". Home now offers the dish opened last, not one left
    launches ago.
  - A dish opened from Continue itself is not written again until it changes.
  - `autosave()` now records the tick the worker actually wrote (from its reply), and only for the dish
    it wrote. The meta it read may still be the previous dish's, and another dish may have opened
    meanwhile.
  - An automatic checkpoint's branch, already written when it opens, is marked the same way.
- **Related hardening in the same path** (`loadSlot`, `const olderContinue`): a Continue read from its
  predecessor, because the latest record was damaged, is bound to nothing. The index describes the
  damaged record, and the slot it names may hold a save newer than this copy. `continueToKeep` already
  had this rule; opening Continue did not.

**Tests.**
- `tests/worker/keep-dish.test.ts`, new block "Fix round 2: the dish Continue holds is kept once, never
  again on later launches". Each launch is a new `DishHost` on the same backend, and the new dish is
  never autosaved between launches (the worst case for the worker alone):
  - probe Q2: only Continue held it. For every action it is kept to Slot 1 once, then three more
    launches plan 'saved' and write nothing (byte-identical store); only Slot 1 and Slot 9 are used;
  - probe Q2b: bound to Slot 5 and changed since. It is kept there once, predecessor kept; the next
    launch writes nothing;
  - probe R2: opening its own slot on two launches. The later Continue goes to Slot 2 once; Slot 1
    opens as saved both times, and its record is untouched;
  - written by an older build (schema 1, migrated when read): kept once, then 'saved' on two launches;
  - the rebinding write fails (every autosave commit refused). The keep stands (`autosaved: false`),
    Continue is as it was, the next launch plans 'saved', and Continue opened then is bound to Slot 1
    by content;
  - never skipped: the same state saved under another name is not 'saved'; one tick later than its own
    slot is not 'saved';
  - a Continue read from its predecessor binds nothing; the newer save in Slot 3 keeps its record and
    hash.
- `tests/worker/keep-continue-ui.test.ts` (new, 4 tests). It drives the app's state module against
  the real host in process, as `tests/sim/view-switch.test.ts` does. After Play Start, a named save,
  Duplicate and What if?, the next `autosave()` writes the opened dish:
  - the new Garden at 0:00;
  - exactly Slot 1's file (checksum) bound to Slot 1, which proves the round trip (b) relies on;
  - the copy's world id;
  - the idea at 0:00.

  A dish opened from Continue is not written again until it changes.
- **Round-1 tests updated** (their assertions encoded "Continue is never rewritten"):
  - The five per-action tests "Continue's changed dish goes to the first empty slot first" now assert
    that Continue is rebound. It holds Slot 1's checksum and record, and its predecessor is the old
    Continue. It used to assert that Continue was unchanged, the `continueBefore` check the
    re-verifier cited.
  - The What if? test now asserts `autosaved: true`.
  - The all-ten-used test now asserts that 'exported' leaves Continue exactly as it was.
  - "an autosave from an older build (no recorded record) binds nothing" now uses a Continue that is a
    later moment than Slot 3. Its intent is kept: an unconfirmed recorded slot is not trusted. Its old
    setup had Continue exactly equal to Slot 3, which (b) now binds by content.
  - A new test covers that case: bound by content, 'saved' untouched, and changed it goes to Slot 3
    with its predecessor kept.
- `tests/worker/keep-strings.test.ts`: the Continue line reads the same with `autosaved: true`.
- **e2e** (`tests/e2e/keep-dish.spec.ts`):
  - journey 12 is R1: background autosave, reload, Play → Start ("… from Continue to Slot 1 first."),
    background. Continue is then the new Garden at 0 s. After a reload, Home offers "Little Living
    Garden — 0 s simulated. Opens paused."; Play → Start writes and says nothing; Saved dishes has Slot
    1 only.
  - journey 13 is R2: Save to Slot 1, run on, background, reload, Open Slot 1 ("… from Continue to Slot
    2 first. Opened …"), background, reload, Open Slot 1 again. Only "Opened …" is shown, and Slot 1
    and Slot 2 are the only slots.
- **The re-verifier's own probes, on the fixed tree:**
  - worker probes: `9 passed`. Q2 uses only Slot 1 over three launches; Q2b uses only Slot 5.
  - e2e `relaunch-dup.spec.ts` (desktop): `2 passed`. R1: Home offers the 0 s Garden and Play Start
    shows no line. R2: the second open shows only "Opened “Little Living Garden” — paused where you
    left it."

**Mutation check.** Each part was removed in turn, at load time
(`tmp/fix2-keep/vitest.mutant.config.ts`; the tree was not touched). The final runs used
`-t "Fix round 2|fix round 2|with no dish open|Continue follows"`, which selects 25 tests.

| Mutant | What is removed | Tests that fail |
|---|---|---|
| M6 | (a) the rebinding | 7: the five per-action tests, the What if? test, and the older-build test. The older-build test fails on the behaviour: launch 3 plans Slot 2, a second copy. |
| M7 | (b) the exact-copy binding | 2: the failed-rebinding test (the plan is Slot 2, a second copy) and the exact-copy test. |
| M67 | both, i.e. the round-1 code | 12, including Q2, Q2b and R2 with the re-verifier's duplicate plans. |
| M8 | the predecessor guard | 1: the damaged-Continue test. |
| M9 | (c), i.e. `enterDish` marks every opened dish as autosaved | 3: all three UI tests that open a dish Continue does not hold. |

### 2. MINOR (remaining, player 4) — dish-screen toasts are 14 px — NOT FIXED (outside my files)

- `src/ui/styles.css` is not in my assignment, and the fix is still the one-line CSS change:
  `src/ui/styles.css:489` `.toast { font-size: var(--fs-small) }` → `var(--fs-body)` (UX §4.1).
- The re-verifier's probe measured the kept-line toast again on the fixed build: 14 px (R1 log line
  "R1 dish-screen kept-line toast font-size: 14px").
- The lead or the review fixer must land it.

### 3. MINOR (remaining, player 6) — one save shows two time formats — NOT FIXED (lead's call)

- The Keep sheet and What if?'s sheet say "Slot 3: … · 0:05". What if?'s texts must stay byte-for-byte,
  and the Keep sheet shares its words.
- Saved dishes says "5 s simulated" for named slots and Continue. Its own checkpoint rows already say
  "at 1:00 dish time", and the dish clock is `mm:ss` (UX §2.4 top strip).
- Changing Saved dishes and Home would break assertions in specs I do not own: `whatif.spec.ts:158`
  and `observe.spec.ts:209`.
- See PROPOSED DECISION J.

### 4. MINOR (remaining, player 8) — one toast mixes quote styles — NOT FIXED (needs a ruling)

- `checkpointOpenedText` (`src/ui/state.ts`) and `Saved "X".` use straight quotes. The kept line uses
  curly quotes.
- The straight-quote texts are asserted by `tests/persistence/checkpoints.test.ts:437/440` and
  `tests/e2e/observe.spec.ts:202`, which I do not own, and by `keep-dish.spec.ts:77`.
- Neither text is D-0033 behaviour. See PROPOSED DECISION K.

### 5. MINOR (new, test coverage) — the paired card's kept line had no test — FIXED

- Journey 14 in `keep-dish.spec.ts` is the re-verifier's R3 with assertions, on all three projects:
  - EXP_102's card plan line is exact;
  - after Start the run is in setup, and `experiment-kept` reads "Saved “Little Living Garden” to Slot
    1 first." at ≥ 16 px;
  - the close control is reachable (≥ 48 px) and axe has no serious or critical violations;
  - no toast carries the line;
  - Saved dishes lists Slot 1, and only Slot 1.

### 6. MINOR (new, docs) — "an older save without recorded choices is always kept" is not what the code does — FIXED

- **The `rebuildsExactly` comment** (`host.ts`) now states the rule the code applies:
  - A start this build cannot realize is never 'unchanged': a card with a timed change, another recipe
    revision, malformed recorded choices, or an idea not exactly as recorded here.
  - An older save that did not record its choices is compared with the recipe's authored start. Only
    an exact match of the whole world, content manifest and provenance included, is 'unchanged'.
- **Test:** "an older save that did not record its choices is compared with the authored start, never
  assumed". The authored Garden without `overrides` plans `unchanged` with seed 104729. Seed 7 without
  `overrides` plans Slot 1 and is kept there.
- **PROPOSED DECISION B** below is corrected the same way.

## Files changed in this round

**Mine**
- `src/worker/host.ts`:
  - `keepDish`: the rebinding (a);
  - `bindingOf` and the new `exactCopies`: (b);
  - `loadSlot`: the predecessor guard;
  - doc comments: `rebuildsExactly`, `Dish.transient`, `continueToKeep`, `keepDish`.
- `src/worker/protocol.ts`: the doc of `WhatIfKept.autosaved`.
- `src/ui/state.ts`: `enterDish(…, continueHolds)` and `NOT_AUTOSAVED`; `autosave()` records the tick
  it wrote, per dish; `loadSlot` passes `continueHolds`; the checkpoint branch marks its own autosave.
- `tests/worker/keep-dish.test.ts`: the round-1 updates above, 7 new tests in the round-2 block, the
  exact-copy test and the older-save test.
- `tests/worker/keep-continue-ui.test.ts` (new, 4 tests).
- `tests/worker/keep-strings.test.ts`: one assertion.
- `tests/e2e/keep-dish.spec.ts`:
  - `backgroundAutosave` matches whole seconds, so "0 s simulated" is not "10 s simulated";
  - journey 4's last check counts named slots only (Continue may now follow the opened save);
  - journeys 12–14 are new.

**Outside my list:** none this round. No other e2e spec was edited; `whatif.spec.ts` is unchanged.

## Commands and results (this session)

- `npx tsc -p tsconfig.json --noEmit` → exit 0.
- `npx eslint src/worker/host.ts src/worker/protocol.ts src/ui/state.ts tests/worker/keep-dish.test.ts
  tests/worker/keep-strings.test.ts tests/worker/keep-continue-ui.test.ts tests/e2e/keep-dish.spec.ts`
  → exit 0.
- **Unit tests:**
  - `npx vitest run tests/worker/keep-dish.test.ts tests/worker/keep-strings.test.ts
    tests/worker/keep-continue-ui.test.ts tests/worker/whatif.test.ts tests/sim/view-switch.test.ts` →
    `Test Files 5 passed (5) · Tests 111 passed (111)`. Log: `tmp/fix2-keep/unit-keep.log`.
  - The related suite is every unit test that imports the host, the UI state or the store (21 files:
    app-flow, inspector-step, registry-imports, checkpoints, persistence, comparison, founders-newdish,
    history-journal, lab-commands, lineage-host, view-switch, family, compare-client, host-requests,
    host, keep-continue-ui, keep-dish, keep-strings, protocol, whatif-ui, whatif). Result: `Test Files
    21 passed (21) · Tests 252 passed (252)` (300 s). Log: `tmp/fix2-keep/unit-related.log`.
  - After that run, one test was added: the older-save test. Run alone (`-t "older save that did not
    record"`) → 1 passed.
  - Final run with every test in place: `npx vitest run tests/worker/keep-dish.test.ts
    tests/worker/keep-strings.test.ts tests/worker/keep-continue-ui.test.ts tests/worker/whatif.test.ts`
    → `Test Files 4 passed (4) · Tests 98 passed (98)`. Log: `tmp/fix2-keep/unit-final.log`. No code
    changed after the related-suite run. After this final run only two comments changed (the UX section
    number in `src/ui/state.ts` and in the header of `keep-continue-ui.test.ts`).
- **Mutants:** `tmp/fix2-keep/run-mutants.sh` (config `tmp/fix2-keep/vitest.mutant.config.ts`). Logs
  are `tmp/fix2-keep/mutant-*.log`; the table is above. Every mutant exits 1
  (`tmp/fix2-keep/mutants.log`).
- **The re-verifier's probes:**
  - `npx vitest run --config tmp/reverify-keep-dish/vitest.config.ts` → `Tests 9 passed (9)`. Log:
    `tmp/fix2-keep/reverify-probes-verbose.log`.
  - `E2E_PORT=4191 E2E_OUTDIR=tmp/dist-keep-fix2 npx playwright test --config
    tmp/reverify-keep-dish/playwright.config.ts --project=desktop relaunch-dup` → `2 passed (1.9m)`. Log:
    `tmp/fix2-keep/e2e-reverify-probes.log`.
- **e2e, new journeys first:** `E2E_PORT=4191 E2E_OUTDIR=tmp/dist-keep-fix2 npx playwright test
  tests/e2e/keep-dish.spec.ts --project=desktop -g "…"` → `3 passed (1.9m)`.
- **Whole e2e suite:** `E2E_PORT=4191 E2E_OUTDIR=tmp/dist-keep-fix2 npx playwright test
  --project=phone-portrait --project=desktop --project=phone-landscape` → **`159 passed (1.4h)`, exit 0**.
  - That is the 150 tests of round 1 plus journeys 12–14 on each of the three projects.
  - It includes `keep-dish.spec.ts` 42/42 (14 journeys × 3 projects) and `whatif.spec.ts` (unchanged),
    green on all three.
  - The build (11:57:50) is later than every code change to `src/` (last 11:39) and to `tests/e2e/`
    (last 11:41). Afterwards only one comment in `src/ui/state.ts` changed (a UX section number:
    §1 → §2); tsc and eslint were rerun on it.
  - Log: `tmp/fix2-keep/e2e-full.log`.
- Port 4191 was stopped after each run (`lsof -t -i :4191` is empty).

## PROPOSED DECISIONS (for D-0033; replaces the round-1 list where it differs)

- **PROPOSED DECISION A — Continue binding.**
  - Every autosave records the bound slot's current record id (`activeRecord`).
  - Continue is bound to a named slot in one of two ways:
    - (fix round 2) a named slot holds exactly its file: the same index checksum and name. This comes
      first, and the recorded slot is preferred when it is one of them;
    - else the recorded slot, while that slot's current record is still `activeRecord` and the world id
      matches.
  - A Continue read from its predecessor is bound to nothing.
  - A manual save always writes Continue.
- **PROPOSED DECISION B — rule (a) generalized, corrected.** "Unchanged, rebuilds exactly" means a
  tick-0 dish whose whole serialized world equals what this build realizes from its recorded start under
  the same world id:
  - a What if? idea, only while D-0026's identity checks hold;
  - a recipe or New Dish start with its recorded seed and choices;
  - an experiment card start without a timed change;
  - an older save that did not record its choices, compared with the recipe's authored start (not
    "always kept").

  Nothing is written. What if? over an untouched Garden no longer writes a slot.
- **PROPOSED DECISION C — the dish Continue holds is kept when no dish is open** (fix round 2
  correction).
  - Every replacing action keeps it first by the same rules.
  - Once kept to a named slot, Continue is rewritten with that same file, bound to the new record. So
    it is kept once and is 'saved' on every later launch; the Continue it replaces is its predecessor.
  - When it is exported, Continue is left as it was.
  - Nothing is written when Continue is empty, unreadable, being opened, already exactly in a named
    slot, or an untouched start.
- **PROPOSED DECISION D — Duplicate is a replacing action.** Unchanged from round 1.
- **PROPOSED DECISION E — the kept line never covers a prompt.** Unchanged, plus the CSS still
  proposed: `.toast { font-size: var(--fs-body) }`.
- **PROPOSED DECISION F — Saved dishes numbers its rows.** Unchanged.
- **PROPOSED DECISION G — the replaced save's moment is named.** Unchanged.
- **PROPOSED DECISION H (new) — Continue is the last dish** (UX §2).
  - A dish that an action opened or started is written to Continue at the next autosave event, even
    at an unchanged tick.
  - A dish opened from Continue itself is not written until it changes.
  - A checkpoint branch is written at once, as D-0031 says.
  - Remaining pre-existing limitation, as round 1 disclosed: a change made while paused (Add Life, a
    Lab stroke, a rename) at an unchanged tick still reaches Continue only at the next manual save,
    keep or tick. Fixing that needs a changed-since-autosave flag set by every accepted command, and
    those are sent from several places (state, LabView, LineageState). I left it for the lead.
- **PROPOSED DECISION J — one time format per save.**
  - Saved dishes' named rows and Home's Continue card would use the dish clock, as the checkpoint rows
    already do: "at 0:05 dish time" in place of "5 s simulated".
  - The Keep and What if? sheets keep "· 0:05".
  - This needs edits to `whatif.spec.ts:158`, `observe.spec.ts:209` and `keep-dish.spec.ts`.
- **PROPOSED DECISION K — curly quotes in every player-facing sentence.**
  - `checkpointOpenedText` and `Saved "X".` would switch to curly quotes.
  - This needs edits to `tests/persistence/checkpoints.test.ts:437/440`, `tests/e2e/observe.spec.ts:202`
    and `keep-dish.spec.ts:77`.
- **For the lead's DECISIONS entry:**
  - D-0027's "autosave to Continue without writing a named slot" is superseded.
  - D-0026's rule (a) is generalized (B).
  - D-0031's "Continue follows it" now holds for every opened dish (H).
