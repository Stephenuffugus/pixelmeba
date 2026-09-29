# G2 wave C, re-verify round 1: P2.2 founder modes and mutation presets

Date: 2026-09-28. This is an adversarial re-check of `founders-fix1.md` against the working tree. Nothing is committed. I edited no repository file except this report.

**Scratch files:**
- `tmp/reverify-founders/` (gitignored): `probe.test.ts`, `hash.test.ts`, `makefile.test.ts`, `e2e/reverify.spec.ts`, `e2e/inspector-sizes.spec.ts`, and `shots/`.
- `/tmp/reverify-founders/`: logs, a HEAD copy (`head/`) and an old-behaviour mutant copy (`mut/`).

**Playwright:**
- Port 4221, `E2E_OUTDIR=tmp/dist-reverify-founders`, one production build made at the start of this session. That port is now stopped.
- No file under `src/`, `tests/` or `content/` changed after `founders-fix1.md` was written. So what I tested is the fixer's final tree.

**Verdict: ok = true.** No BLOCKER or MAJOR remains.
- **The three MAJOR findings are fixed.**
  - The B7 mode labels now appear on every surface the verifiers named.
  - Add Life after 0:00 in a Diverse dish is no longer labelled "present at creation".
  - Experiment C's founders are no longer described with "no extra abilities".
- **Every MINOR the fixer claimed as fixed holds** in the real app on all three projects.
- **MINOR items remain:**
  - one new behaviour change, from the fixer's global Space rule;
  - one B7 leftover, on a surface added in the same wave (automatic checkpoint rows);
  - two code items the fixer left to the lead, as expected;
  - DECISIONS.md, the owner decision on Create, ownership, and nits.

## Remaining / new problems

- **MINOR (new in fix round 1): Space no longer pauses or runs after the mouse has clicked any dish button** (`src/ui/views/DishScreen.tsx:127`).
  - **The change.** The added line returns early for Space whenever the event target is inside a `button`, `[role=radio|tab|button|checkbox|switch]`, `a[href]` or `summary`. Before this round, HEAD handled Space with `e.preventDefault(); togglePause();` on any non-input target.
  - **Repro** (my `e2e/reverify.spec.ts`; the same on phone-portrait, phone-landscape and desktop):
    1. Create a dish and press Run.
    2. Click the speed control with the mouse (desktop: "2×" in the Speed group; phones: the "Speed N×, tap to change" cycle button).
    3. Press Space.
  - **Result.** The run button still reads "Pause", so the dish keeps running. Space pressed the focused speed button again; on phones that also cycles the speed. Chrome leaves focus on a button after a mouse click, so once any dish button has been clicked, Space no longer pauses or runs.
  - **Why the tests missed it.** `garden.spec` "Space runs and pauses" still passes only because focus is on `<body>` there.
  - **The line is not needed for the original finding.** `ChoiceGroup`'s own `onKeyDown` (`src/ui/panels/AdvancedEvolution.tsx:46-48`) already stops Space, Enter and the arrow keys before they reach the window listener.
  - **Suggested fix:**
    - Apply the exception only to keyboard focus (`(e.target as Element).matches(':focus-visible')`), or only to controls inside an open sheet.
    - Record the ruling in DECISIONS: UX §4.2 lists both "Space pause/run" and "Enter/Space activate".

- **MINOR (B7 leftover on a P2.8 surface): the automatic checkpoint rows in Saved dishes carry no mode labels.** The ring is off unless the player turns it on in Settings. Where the labels are missing:
  - `src/ui/views/Saves.tsx:168-175`: `CheckpointList` rows show only the name and "at m:ss dish time · date".
  - `src/worker/host.ts:74-76`: `checkpointSummary` adds no `modes`.
  - `src/persistence/checkpoints.ts:47`, `:174-186`: the ring's `CheckpointRequest` and `SlotInfo` hold no `evolution` or `registry` copies.
  - `src/worker/host.ts:893`: `ring.write` is not given `slotMetaCopies(b.file)`.

  UX §3.3 says "must appear wherever a world is described". It needs the P2.8 owner or the lead:
  - add the two optional fields to `CheckpointRequest` and to the ring's slot;
  - pass `...slotMetaCopies(b.file)` in the `ring.write` call;
  - give `checkpointSummary` the catalog size and return `slotModes(s, catalogSize)`;
  - render `slotModesLine(s.modes)` in `CheckpointList`.

  The fixer listed this in its §3.

- **MINOR (unchanged; left to the lead as reported): raw preset ids** at `src/ui/panels/CompareText.tsx:41` ("Evolution setting: accelerated") and `src/ui/strings/experiments.ts:193`.
  - Neither can be reached today.
  - The fixer's exact fix (`evolutionLabel(...)` from `strings/whatif`) is correct.

- **MINOR (unchanged; left to the lead as reported): two sources of truth for a "partial" registry.** `src/worker/host.ts:117-119` `registryLabel` hard-codes `< 17`, and for a full registry it returns the preset label "Standard Evolution".
  - `registryInfo().partial` (`host.ts:1435-1443`) uses the catalog size instead.
  - The catalog has 17 modules today, so the two agree.

- **MINOR (process): DECISIONS.md has no P2.2 entry** (`git diff HEAD -- docs/DECISIONS.md` is empty).
  - The fixer's PROPOSED DECISIONS (`founders-fix1.md` §2) match the tree. I checked the Diverse draw at 0:00 only, the unchanged-preset rule, the slot-index copies, the named refusal, the three-part Founders section and the toasts.
  - The keyboard ruling needs the caveat in the first item above.
  - The lead must log them, plus the owner decision below.

- **MINOR (owner decision; partly fixed): Create in New Dish still closes the open dish unsaved** (`src/ui/state.ts:447-450`, `startCustom`; this predates P2.2).
  - Now fixed: the warning "Creating a new dish closes “…”", Back returning to the dish in its run state, and the stale toast being cleared. `new-dish.spec` (200 % journey) passes on all three projects.
  - Still open: the owner must choose Option A or B from `founders-fix1.md` §2.

- **MINOR (ownership): the fixer edited files outside its list.** They are `src/persistence/store.ts`, `src/ui/views/Home.tsx`, `src/ui/views/Saves.tsx`, `src/ui/panels/CompareSetup.tsx` and `src/ui/views/ExperimentRun.tsx`.
  - The fixer disclosed these edits, and they are small and additive.
  - `Saves.tsx` also carries P2.8's `CheckpointList`. The lead should commit these hunks knowingly, together with the owning agents' work.

- **Nits (no user impact):**
  - `tests/sim/founders.test.ts:255`: the comment says "5:00 in", but `run(g, 50)` is 5 s.
  - Phone landscape at 200 %:
    - The toast "Now Accelerated Evolution (game setting, not realism). Undo rewinds it." takes 4 lines (414 × 189 px).
    - It covers the Evolution sheet's options for 3.5 s (`tmp/reverify-founders/shots/phone-landscape-toast.png`). It is fully on screen now.
    - The fixer's "2 lines" was measured with the shorter Standard message.
  - No committed test measures the inspector's 16 px chips and module-source text, or checks the generation-0 line. My scratch spec checks all three on every project. It could be folded into `inspector.spec`.

## Verified fixed

- **VERIFIED OK — MAJOR B7, mode labels where saved and continuing dishes are described (both verifiers).**
  - Code: `describeSlot` and `slotModes` re-validate the index copies with `saveMetaEvolution` and `saveMetaRegistry` (`host.ts:88-99`, `:1426-1429`). The copies are written on both save paths (`host.ts:270`, `:1338`), and the store keeps them (`store.ts:116-117`). IndexedDB puts the slot object as it is (`idb.ts:59`).
  - `new-dish.spec`, all three projects, checks the exact line (text ≥ 16 px) in:
    - the Save sheet slot;
    - Home Continue for the open dish, and again for the autosave after a reload;
    - both Saved dishes rows.
  - Compare and Experiment setup: Experiment C read "Both copies: Fixed Traits · Identical founders · Core prototype — quantitative evolution" on all three projects (walk-through).
  - An old index shows no line; nothing is guessed.
  - Mutant check: removing `slotMetaCopies` makes `founders-newdish` "saved dishes keep their mode labels…" fail.
  - Only the checkpoint rows are left (see above).

- **VERIFIED OK — MAJOR / MINOR, Add Life after 0:00 in a Diverse dish was labelled "present at creation" (both verifiers).**
  - Code: `founders.ts` `atCreation` is `world.tick === 0`, and the Diverse draw is gated on it.
  - **The verifier's exact repro** (probe A): Diverse, seed 5, 300 ticks, then 200 × `introduceOrganism(B06, 'tool:addLife')`. Result: 0 of 200 have origin 2, and 0 have a module. The original finding was 25 of 200.
  - **Probe B:** FIRST_DISH_V1, seed 104729, Diverse, 300 ticks, then 50 founders through the real `inoculate` command across five species.
    - Every one has origin 1, the chip reads "added by you or the recipe", and none carries a module.
    - `creationFounders` is unchanged.
    - The 8 founders seeded at tick 0 are intact.
  - At 0:00, the Diverse draw still applies to life you add (6 of 60 in probe C, by design). The Diverse note says so.
  - Mutant check: `atCreation` forced to `true` makes the new test fail.
  - **Other modes are untouched.** I compared an entity + genome digest (independent of the content hash) between the HEAD copy and this tree for Identical and Varied, on FIRST_DISH_V1 and RESERVE_COMPARE_V1: 150 ticks, an Add Life, then 150 more ticks. The digests are identical at creation and at the end.

- **VERIFIED OK — MAJOR, the Evolution sheet told Experiment C "no extra abilities" (player verifier).**
  - Real app, Experiment C → close to its dish → More → Evolution settings, on all three projects:
    - the Founders note: "Identical founders: Founders start with the same neutral traits (50). This mode gives them no extra abilities.";
    - the creation line: "Present at creation: 12 of 24 Sprinters carried Reserve chamber." (`shots/desktop-expc-evolution.png`).
  - In a Diverse dish, the creation line lists the same 8 founders that New Dish's "8 of the 56 founders…" counted.

- **VERIFIED OK — MINOR, an unchanged preset still marked History (rules verifier).**
  - Through the host (probe D), the ack is `accepted 0, note 'unchanged'`. After that:
    - `undoAvailable` is false;
    - `pendingInterventions` is 0;
    - `interventionSeconds` is empty after 30 ticks;
    - `changes` is empty.
  - Real app: the chosen option tapped twice more still shows one change.
  - The command-level decrement and P2.8's generic accepted-0 decrement never both apply, so they cannot double-count. I traced `commands.ts:97-136`.
  - Mutant check: with both decrements removed, the new test and "a change is a timestamped command" fail.

- **VERIFIED OK — MINOR, a newer module with an unreadable definition got an unnamed refusal (rules verifier).**
  - Probe E results:
    - E18 with `phase: 8` gets the named refusal.
    - With a non-string name, only the id is named.
    - A 500-character id is shortened by `cleanName`.
    - A `null` or `7` entry still gets "A module definition is invalid.".
  - Mutant check: without the early loop, the new test fails.

- **VERIFIED OK — MINOR, an import refused from Saved dishes showed no message (player verifier).**
  - Real app, on all three projects, importing my re-checksummed E07 and E18 files from Home → Saved dishes shows `page-toast` at 16 px. For E07 it reads "Nothing was changed: This dish uses the extra ability "Light seeker" (E07), which this version of Pixelmeba cannot simulate. Nothing was loaded."
  - The page stays on Saved dishes, and the toast hides afterwards.

- **VERIFIED OK — MINOR, the `aria-controls` claim.** `#nd-rates` and `#nd-content-body` are always rendered, with `hidden` while collapsed (`NewDish.tsx:282`, `:314`).

- **VERIFIED OK — MINOR, Space on a focused Evolution option ran the dish (player verifier).**
  - The `new-dish.spec` 200 % journey passes on all three projects: ArrowDown moves focus without choosing, then Space chooses, and the dish stays at "Run".
  - My spec: Space chooses Fixed Traits, Enter chooses Standard, and the dish stays paused.
  - See the new MINOR above for the wider global rule.

- **VERIFIED OK — MINOR, focus went to `<body>` (player verifier).**
  - After Create, focus is on the first Life item ("Sunbead" `.lab-item`) on all three projects.
  - Opening More → Evolution settings with Enter puts focus on `#evolution-title` on all three projects.

- **VERIFIED OK — MINOR, inspector P2.2 text below 16 px (player verifier).** On Experiment C founder #1, on all three projects:
  - all four chips, including "present at creation", measure 16 px;
  - `.module-source` ("Present at creation.") measures 16 px.

  `.chips > .chip` matches only the inspector header: FeedSheet's `.chips` holds `.btn` elements.

- **VERIFIED OK — MINOR, the Life tray off-screen after Create (player verifier).**
  - `new-dish.spec` asserts that the first Life item is at least 50 % in the viewport and focused, at 100 % and 200 %, on all three projects.
  - Screenshot: `shots/phone-landscape-created.png` at 200 %.

- **VERIFIED OK (partly; owner decision above) — MINOR, "New dish…" discarded the dish with no warning.** The warning shows, Back returns to the dish running (e2e), and Create clears the stale toast (`NewDish.tsx:167`).

- **VERIFIED OK — MINOR, "Same inherited traits as its parent." shown for a founder.** On all three projects the real app reads "A founder: it has no parent in this dish. Genome d886ee."

- **VERIFIED OK — MINOR, the New Dish ledger did not add up.** The real app reads "5567.05 carbon, 1087.23 nutrient and 0.00 mineral (game units, to 0.01): the habitat’s own 5399.00 carbon plus 168.05 added…".

- **VERIFIED OK — MINOR, the Fixed Traits overclaim.** The note is now "Offspring inherit their parent’s traits unchanged. Good for controlled experiments." (seen in the Experiment C sheet).

- **VERIFIED OK — MINOR, "Its founder already carried it" shown for the founder itself.** `modes.ts:242-245` uses the self wording at `generationsFromFounder === 0`, and `founders-words` passes.

- **VERIFIED OK — MINOR, the toast clipped at 200 % in phone landscape.**
  - The toast is short now, and `.toast` is `max-content` up to 90 %.
  - The Accelerated message fits on screen in 4 lines (nit above).

- **VERIFIED OK — the determinism, conservation and honest-label contract.**
  - The fix round adds no `Math.random`, `Date`, or Map/Set/object-key iteration in `src/sim`. `creationFounders` orders module ids from the recorded registry, never from object keys.
  - No ledger code was touched: the Diverse gate changes only which genome a founder receives.
  - The per-seed determinism tests pass.
  - axe finds no serious violation on New Dish or the Evolution sheet, at 100 % and 200 % (`new-dish.spec`).

## Commands and results (this session)

- **Owned tests:** `npx vitest run tests/sim/founders.test.ts tests/sim/founders-presets.test.ts tests/sim/founders-newdish.test.ts tests/sim/founders-words.test.ts tests/fixtures/registry-imports.test.ts` → 5 files, **46 passed** (70.8 s).
- **Old-behaviour mutant** (`/tmp/reverify-founders/mut`):
  - The four mutations: `atCreation` → `true`, the early named-refusal loop removed, both accepted-0 decrements removed, `slotMetaCopies` removed.
  - Result: the 5 new or extended fix-round tests **fail**, and "Diverse applies to life added at 0:00 too" passes (as expected).
- **Probes:** `npx vitest run --config tmp/reverify-founders/vitest.probe.config.ts` → probes A–F, **6 passed**.
- **HEAD comparison:** the entity + genome digests in `hash.test.ts` and in the HEAD copy are **identical** for Identical and Varied.
- **Regression units:** `npx vitest run --maxWorkers=1 tests/worker tests/persistence tests/sim/view-switch.test.ts tests/fixtures/{inherited-variation,neutral-founders,determinism}.test.ts tests/experiments/{exp-c-reserve,app-flow}.test.ts tests/sim/{lineage-panel,history-journal}.test.ts` → **17 files, 191 passed** (1467 s, on a machine with a load average of about 9). No `tests/sim/mutation*.test.ts` exists.
- **Typecheck:** `npx tsc -p tsconfig.json --noEmit` → exit 0.
- **Lint:** `npx eslint` on the 25 P2.2-touched source, test and spec files → exit 0.
- **The task's e2e:** `E2E_PORT=4221 E2E_OUTDIR=tmp/dist-reverify-founders npx playwright test tests/e2e/new-dish.spec.ts` → **6 passed** (7.8 m), all three projects.
- **Regression e2e:** `… npx playwright test tests/e2e/{inspector,save-reload,garden,lab-tools,whatif}.spec.ts` → **54 passed** (51.7 m), all three projects.
- **Walk-through:** `npx playwright test --config tmp/reverify-founders/pw.config.ts`, all three projects.
  - `reverify.spec.ts`: 11 of 12 passed. The desktop failure was my own spec reading a toast that had already gone; after I fixed the spec, the re-run passed (1.6 m).
  - `inspector-sizes.spec.ts`: 3 passed.
- **Not re-run by me:** `compare.spec` and `experiments.spec` (the fixer ran them). Instead, the walk-through checked Experiment C's setup line on all three projects.
