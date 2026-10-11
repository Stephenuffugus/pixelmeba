# g4 wave 5b: wave verification (stories, objectives, notice-cards)

**Result: ok.** No BLOCKER and no MAJOR problems. There are 5 MINOR problems and 3 NITs.

**Lens:** rules, determinism, conservation, tests and player-facing truth. I checked the uncommitted working tree (`git status` / `git diff` plus the untracked files) on 2026-10-11, edited no tracked file, and ran no git write.

## Commands run in this session

- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx eslint` on every new and changed source and test file of the three tasks (plus `src/ui/panels/*.tsx`, `src/ui/views/*.tsx`, `src/worker/*.ts`, `src/sim/content/*.ts`): exit 0.
- Fixtures and new tests: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/ui/stories.test.ts tests/worker/stories-host.test.ts tests/sim/objectives.test.ts tests/worker/goals-host.test.ts tests/content/objectives.test.ts tests/ui/notice-cards.test.ts tests/ui/notices.test.ts tests/ui/discovery-pacer.test.ts tests/ui/favorites.test.ts tests/persistence/notebook.test.ts tests/content/validator.test.ts tests/worker/favorites-host.test.ts tests/worker/protocol.test.ts`
  → **Test Files 20 passed (20), Tests 212 passed (212)**, exit 0. The fence (g2-replay and the four trajectory-fence files) is unchanged and passes.
- Wider suites: `npx vitest run tests/content tests/persistence tests/ui tests/tools tests/worker`
  → **Test Files 59 passed (59), Tests 693 passed (693)**, exit 0.
- `npx tsx tools/content-validate.ts` → `content ok · contentHash d3fbd36c…`. This equals `content/manifest.json`, and that is the only line the manifest diff changes.
- Scratch probes (in `tmp/verify-g4-wave-5b-0/`):
  - `evict.ts`: the story id is not reused when the newest card is the one removed (`story-51` is created, `story-50` is removed, and `storiesWereRemoved` is true).
  - `family.ts`: the Garden (seed 104729) with the real StoryDetector up to tick 6898 recorded 8 cards. The captions are quoted below. The run took 11.1 s, so the detector's cost is small.
- I ran no e2e. Nothing I found needed a browser to prove, and port 4390 was never used.

## Problems (most severe first)

1. **MINOR [objectives] `src/worker/goals.ts:91-100` (`goalsAfterRestore`) with `src/ui/strings/goals.ts:31,36`: after an error rollback, the text says Undo happened.**
   - **What is wrong:** an error rollback also ends a running goal with `endReason: 'undone'`. The path is `host.ts` pump → `rollback` → `restoreNotebook` → `notebookAfterRestore`.
   - **What the player sees:** the goal sentence says "{title}: Undo rewound the dish, so this attempt ended." The More row says "… ended when Undo rewound the dish."
   - **Why it matters:** no Undo took place in this case. This breaks the rule that every visible claim traces to a recorded reason.
   - **Repro:** a step throws while a goal runs (`d.failed = true`; host.ts around lines 2440-2446). The record reads `ended`/`undone`, and the UI prints the Undo sentence.
   - **Fix:** use a separate reason (for example `'rewound'`) or neutral wording such as "The dish was rewound…".

2. **MINOR [stories] `src/ui/stories.ts:76-80` (`openStory`) and `:121-139` (`spotlightStory`) with `src/ui/state.ts:922-931`: opening a story pauses the dish, and Spotlight does not restore the speed.**
   - **What happens:** the notice's Open routes to the Notebook. The existing rule that leaving the dish screen pauses it (D-0028) then pauses a running dish. Spotlight returns to the dish still paused. The e2e asserts this: `tests/e2e/stories.spec.ts`, where after Spotlight the run toggle reads 'Run'.
   - **What the docs say:**
     - D08 line 153: "Open the notebook without changing the world's history. If it blocks the play surface, use the existing pause-and-restore convention." The field guide restores the prior speed on Back (D-0028 follow-up, DECISIONS line 631).
     - UX §2: "notebook tabs … do not pause unless the player chooses".
     - `Notebook.tsx:5` itself says "Opening the Notebook never pauses or changes a dish."
   - **Severity:** the pause comes from older code, but story cards add a new path from a running dish into the Notebook. The world is never changed (the hash is equal), so this is MINOR.
   - **Fix:** Spotlight should restore the speed the dish had when Open was pressed, or the lead should rule that the Notebook pauses without restore and fix the Notebook.tsx comment.

3. **MINOR [stories] `src/ui/strings/stories.ts:174-190` (`familyPanels`): the "Tradeoff" caption is not in the Lineage sheet's wording.**
   - **The caption as recorded:** the Garden, seed 104729, story-8 at 11:29 reads "Tradeoff: game rule: it can split once it is 13.2 s old (ancestor: 12 s)." The detail line is "Game rule: each split costs 18 energy (ancestor: 20)."
   - **Doubled label:** the caption stacks two labels ("Tradeoff: game rule:").
   - **Arbitrary choice of line:** whichever line `ruleLines` lists first becomes "the tradeoff". For a motility branch that is "it moves up to … cells per second", which is the gain side. The assignment asks for "the Lineage sheet's wording (strings/lineage.ts)", and the sheet lists these lines under "Game rules" (`LineageSheet.tsx:257`).
   - **What does hold:** there is no benefit claim, and `LINEAGE_TEXT.notVerdict` is shown.
   - **Fix:** caption "Game rules that differ:" and list both lines. Or, if a "tradeoff" is shown, show each changed rule with its ancestor value.

4. **MINOR [lead] CT §12.10 "notifications ≤ 1 per 60 s" holds per source, not across the dish's notices.**
   - **The three paces:**
     - Story notices pace on 600 dish ticks (`src/worker/stories.ts:105-129`).
     - The discovery card and the extinction card share one wall-clock 60 s (D-0076 rule 3, `src/ui/noticeCards.ts`).
     - Goal sentences have no pacing.
   - **Effect:** a story notice can follow a discovery card or an extinction card within seconds. At 4× a story notice can come every 15 s of wall time.
   - **What the docs say:** D08 line 151 does say "60 simulated seconds" for story cards, so each pacer follows its own source document.
   - **Needed:** the stories PROPOSED DECISION (sim time) should say explicitly that the cap is per source, or the lead should unify the pacers. Neither D-0074 nor D-0076 covers story notices.

5. **MINOR [lead] `src/worker/notebookWatch.ts:100-104` (`notebookAfterRestore`): a goal end is not announced when favorites or stories also changed.**
   - **What happens:** the function returns one change. When an Undo ends a running goal and favorites or stories changed too, no `{ kind: 'goal' }` change is posted. `src/ui/goals.ts:58-63` `onGoalNotice` therefore does not call `autosave()`.
   - **What still works:** the record carries the ended goal, and the goal sentence still shows from it.
   - **Effect:** the end reaches the file at the next autosave.
   - **Status:** the objectives builder flagged this. Returning a list of changes would remove the gap.

6. **NIT [stories] `src/ui/strings/stories.ts:112`, `:198-199` and `:205-206`: grammar.**
   - "A {Species} was growing." gives "A Oilwick was growing." and "A Amoeba was growing." for B07 and P01, both enabled.
   - "Before: 13 Sprinter in the top left" and "You added 5 Sprinter" are singular for a count. The panel format was given by the assignment; only the articles and plurals are wrong.

7. **NIT [objectives] `content/objectives/WATCH_STARCH_BECOME_FOOD.json`: the starch goal is offered on the variants too.**
   - **What the docs say:** D09 lines 125-127 say "Offer on Garden" for the starch goal, and "Offer on Garden variants" for the two Sprinter goals.
   - **What happens:** `offerOn` together with the variant's `sourceId` (`src/worker/goals.ts:45-50`) also offers the starch goal on the R-G1, R-G2 and R-G3 dishes.
   - **Severity:** harmless today, because the variants change only sugar.

8. **NIT [stories] `src/ui/views/Home.tsx:90`: the Notebook button's destination changed, beyond the assignment.**
   - The assignment asked only for the quiet dot. The button now also opens the stories tab while any card is unseen.
   - Quiet cards count as unseen, and the Garden records them from 0:01. In practice Home → Notebook now nearly always opens "Something happened" instead of Experiments.
   - The builder flagged this for the lead.

## VERIFIED OK

### stories

- **Record and validator:**
  - `storyCardProblem` refuses each of these: no evidence; the template's evidence kind missing; a malformed or repeated evidence id; an unknown template; a non-finite value; a missing or unknown summary field; pictures; another world. `storiesProblem` refuses more than 50 cards.
  - Evidence: `tests/ui/stories.test.ts` "no card without evidence" (3 tests), plus reading `src/persistence/notebookStories.ts:324-384`.
- **50 cards plus one:** the order is oldest dismissed, then oldest opened, then oldest. The ids do not repeat when the newest card is the one removed (my `evict.ts`: `story-51` created, `story-50` removed, `storiesWereRemoved` true). The host test reads real removals in the order story-21, story-31, story-4, story-1.
- **Where the detector runs:**
  - It runs only in the worker, through `NotebookWatch.afterTick` from `stepDish` and accepted commands.
  - `watchOf` returns null for an arm or the transient copy (`host.ts:1307-1313`).
  - The rollback replay calls `step(w)` directly, with no watch (`host.ts:2403-2415`).
  - It is never in src/sim; `grep` shows no src/sim import of `@worker`.
- **Never alters behaviour:** the detector on (more than 3 cards) and off (0 cards) over the Garden with one sugar deposit at 4× for 3,000 ticks give equal `stateHash` and `trajectoryDigest(world,'full')`. Passed this session.
  - The detector draws no randomness and writes no world field. Its only world-side effect is the derived profile cache, through `producersNear` → `profileOf`, which the snapshot code already uses.
- **The four templates:**
  - firstSplit: a committed birth event with parent and daughters, first per species or the root of a followed family.
  - enzymeAtWork: from `reactionInDish` / `reactionInCell` of the last complete second, keyed by enzyme and `quarterOf`. A producer is named only from `producersNear`; with none there is no producer panel (unit test).
  - familyChanged: from `branchEstablished` with the branch id. The trait sentence comes from `traitSentence` (lineage.ts), with `notVerdict`. Copy test: no "better", "adapted" or "helps".
  - placeChanged:
    - The before sample is the last at or before the command; the after sample is at least 600 ticks later.
    - Sample timing is correct: `recordTraitSample` runs in the step that ends at `nextTick`, which is before a command at that `targetTick`.
    - The card shows the region words from `REGION_LABELS`, "Other recorded changes in between: k", and a note that no cause is claimed.
  - Real Garden captions (my `family.ts` run) match the SPEC sentences exactly: "A cell split. Its offspring inherited these traits." and "Starch became sugar here."
- **Pacing:**
  - One notification per 600 ticks.
  - Dedupe: later evidence joins the card within the window.
  - Priority is favorite, then unseen template, then earliest (`rank` at `stories.ts:89-99`).
  - The cards not chosen stay quiet.
  - Unit tests pass, and in a real 1,300-tick Garden notifications are at least 600 ticks apart. My 6,898-tick run notified story-1, then story-3 (window), story-7 and story-8.
- **Restore:** Undo removes the cards whose first evidence is in the undone time (`storiesRestored`, host test). A g2 save never gets a "first split" for species that already split. A stage 1 notebook (no stories key) loads with no cards. A malformed card or a future card drops the notebook with `notebookDropped`, and the world hash is equal.
- **UI:**
  - The "Something happened" tab is first in TABS (UX §2 order), with the quiet dot; Home shows the same dot.
  - The card has at most 3 panels with m:ss, the "Memory, not replay" badge, Spotlight and Dismiss. Save picture is hidden.
  - Opening a card sends `storyMark` (notebook state; host test: no command, equal stateHash).
  - Spotlight sends no client request and only calls `zoomPreset` (unit test with a throwing client).
  - The no-dish sentence is exact.
- **Shared edits:** `notebook.ts` adds an optional key, `KIND_PROBLEMS.stories`, the refs line and `notebookIsEmpty`. The protocol additions (`storyMark`, `story`, `storiesRestored`) are additive. The non-additive edit in `notebookAfterRestore` (`record: st.record`) is needed and correct.

### objectives

- **Engine location (D-0071):**
  - `src/sim/objectives.ts` is pure: no `Math.random`, `Date`, `Map` or `Set`. Its module cache comes from the static `maskCells()`.
  - The test confirms that only src/sim/content imports it.
  - The runner is `src/worker/goals.ts`, reached through `NotebookWatch`; there is none for arms.
- **Read-only:**
  - 3,000 ticks with seven watches covering all five types: equal stateHash and full digest. Passed.
  - Host: goals started, completed, left and resumed across save → load at 4× for 3,200 ticks: equal hash and digest. Passed.
- **Blocked proposals never count:** the crowding fixture asserts `propG0 ≥ 0` and `DIV_BLOCK_CROWDING` on all five parents with the goal still running. Removing a parent that holds a proposal gives no birth. The first commit completes the goal at milestone + 1. The agent-cap fixture checks `capacityBlocked` / `DIV_BLOCK_CAPACITY`. These are not vacuous: a predicate that counted drawn proposals would complete on those ticks.
- **Starch:** the goal needs converted carbon; with the enzyme present and no starch it never completes in 300 ticks.
- **keepAlive:** the end is latched, and a later inoculate does not revive it.
- **Save → load:** at awkward ticks (349 and 347 mid-second, 351 right after the commit, and 1) the goal completes at the uninterrupted ticks. Host: completes at 1820 = 1820.
- **Content:**
  - The three files carry the CT §10.5 titles, phase 4 and `offerOn` FIRST_DISH_V1.
  - `ObjectiveSchema` changes are additive, and `PredicateSchema` is untouched.
  - 'custom', a gate with no enabled edge structure, and an unknown species are refused.
  - A phase 5 objective is skipped, not an error.
  - `registryWith(G2_LISTS)` validates.
  - The `contentHash` was rewritten by the tool and matches.
- **Support:** offers use the world's own recorded manifest (`objectiveSupportProblem(world, …)`). Only the Play card, before any dish exists, uses the build's manifest; that is correct, because that manifest is what the new dish will record.
- **UI:**
  - "No goal" is checked by default.
  - The goal starts at tick 0 while the dish is paused.
  - The sentence goes through `requestNotice({kind:'goal'})`, never over a card (`recompute` hides notices while a card is shown).
  - Nothing in `goals.ts`, `GoalChoice.tsx` or `strings/goals.ts` calls `setSpeed` (grep).
  - Host tests: running stays at 4× and keeps advancing; a paused dish stays paused.
  - Leave gives continuedFreely; Undo gives ended/'undone'; a completed goal stays completed.

### notice-cards

- **Rule 1 (no preemption, tie to extinct):** `recompute` keeps `shownCard` while its source still asks. `CARD_ORDER` is `['extinct','discovery']`. `setCardsOpen` makes one recompute.
- **Rule 2 (no discovery card under the extinction card):** `showDiscovery` returns `[]` for a new card while `cardPlaceHeldByOther('discovery')`. The check comes after the lineage answer and before the pause (`LineageState.tsx:260`, before `setSpeed(0)` at :269). `DiscoveryCard` renders only through `discoveryCardToShow()`.
- **Rule 3 (one 60 s gap across both cards):** `otherCardShown()` is driven by a computed of the shown extinction card's id (`noticeCards.ts`), so a notebook update that keeps the same card does not reset the gap.
- **Rule 4 (no extinction card lost):** `extinctQueue` is FIFO with no duplicates. `extinctCard` is now a read-only computed, and every use was updated (tsc clean). `favoritesRestored` and favorite ops prune the queue; `followOpenDish` clears it. All three buttons call `closeExtinctCard`.
- **Rule 5 (testable in node):** `wireNoticeCards`, `extinctCardToShow` and `discoveryCardToShow` are tested in node.
- **Tests:** 12 tests in notice-cards, plus 3 in notices and 3 in discovery-pacer, all passed this session. The removed preemption block in `notices.test.ts` tested the behaviour D-0076 removes, so its removal is justified.
- **Mutants:** the builder's mutant table (M1–M13) is consistent with the assertions I read. I did not re-run those mutants.
- **Scope:** the change is UI only, with no worker, sim or content edit.

### Determinism, conservation, saves and versions

- The fence passes unchanged.
- The conservation closed-lid fixture passes.
- No `simulationVersion`, `evolutionRulesVersion`, `moduleRegistryVersion`, `phenotypeMappingVersion` or `contentVersion` edit; only `contentHash` changed.
- No hard-coded stateHash literal was added.
- No src/sim tick-stage file changed.
- Save shape: both new notebook kinds are optional keys that read as `[]` when absent (the D-0073 notebook record). A g2 save and a stage 1 notebook load with no cards and no goals; tested by both host tests.
