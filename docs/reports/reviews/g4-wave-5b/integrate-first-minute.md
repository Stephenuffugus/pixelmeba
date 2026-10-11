# Wave 5b integration: the first minute (story pacer start window, D-0079 amendment)

Date: 2026-10-11. Scope: the lead's decision that a dish's first story notification comes no sooner than STORY_WINDOW_TICKS (600 dish ticks) after its story watch began. No change under src/sim/** or content/**; docs/DECISIONS.md not edited; no git operations.

## Items

1. **Implementation: DONE.** `src/worker/stories.ts:326-331` (StoryDetector.bind): `this.pacer = new StoryPacer(world.tick)` replaces `new StoryPacer(cards.some((c) => c.notified) ? world.tick : null)`. bind runs for every path that starts or replaces the watch: a new dish (watch created at its first step, tick 0), opened/loaded/Continue (loadSlot, importDish), duplicated or branched (a new dish at tick T), and Undo, rollback or reload (rebind to a replaced world). A favorite op's `nw.rebind(d.world)` on the same world does not rebind the detector (StoryDetector.rebind checks `world !== this.world`), so following a family never resets the window. Cards found meanwhile are recorded quietly as now (unchanged `record` → `pacer.offer`) and wait; when the window opens, `StoryPacer.next` picks among them with pickStory as now. The doc comment on StoryPacer (`:103-104`) says so. The sim is not touched. Stories stay notebook state (D-0070). The never-alters-behaviour test passes (below).
   - Behaviour change to note: before, an Undo or rollback on a dish that had **not yet** notified rebuilt the pacer open (null). Now every rebind waits a full window from that moment, which is the lead's wording ("a full window from that moment") and keeps the first-minute rule from being skipped by an early Undo.
2. **Unit tests: DONE.**
   - `tests/ui/stories.test.ts:485` "D-0079 first minute: a fresh dish announces nothing before its start tick + 600, then the pickStory choice among the cards that waited". The StoryDetector runs on the Garden from tick 0. At least two cards are recorded unnotified in the first minute. The first notification comes exactly at tick 600 and is `pickStory(cardsBefore, cardsBefore)`. Only that card is marked notified.
   - `tests/ui/stories.test.ts:499` "… a watch that starts at tick T > 0 (Continue, a load, a copy) waits until T + 600". The world is stepped to 700 without a detector, then watched. The first notification comes at tick 1300 or later.
   - `tests/worker/stories-host.test.ts:256` describe "D-0079 first minute …", through DishHost, stepping one tick at a time with the protocol's `step` message (new Driver.notifications helper, `:91`):
     - a fresh dish: the first notification comes at tick 600 and is the pickStory choice among the cards that waited;
     - a loaded dish: saveSlot and autosave at tick 500, then loadSlot of `slot1` (Load) and of `autosave` (Continue). Each waits until load tick + 600;
     - a duplicate made at T = 700 waits until 1300.
   - **Fails without the change:** I swapped `src/worker/stories.ts` for two scratch copies, then restored it byte for byte (`cmp` printed RESTORED-IDENTICAL both times):
     - (a) the original file (`tmp/first-minute/stories.ts.orig`): all 5 new tests fail. Fresh dish: "expected 0 to be greater than 1" (the earliest card was already announced, so no unnotified cards waited). T>0: "expected 710 to be greater than or equal to 1300". Load: precondition "expected true to be false" (a card was already announced by tick 500).
     - (b) a load-time mutant (`tmp/first-minute/stories.ts.loadmutant`: closed window only when `world.tick === 0`, the old rule otherwise): the fresh-dish tests pass. The 3 load/copy tests fail: "expected 568 to be greater than or equal to 1100" (load at 500) and "expected 710 to be greater than or equal to 1300" twice (copy and detector at 700).
   - **Existing tests updated:**
     - `tests/ui/stories.test.ts:439` "in a running Garden …": 1300 → 2300 ticks. It asserts at least 2 notifications 600 or more ticks apart. With the first notification now at tick 600, the untouched Garden's next new card is B06's first split at tick 2195 (probe: cards at ticks 10, 250, 294, 310, 351, 568, then 2196). The old run of 1300 ticks saw only one notification.
     - `:408`: the comment on the `new StoryPacer(1000)` case now says it is the pacer every bind starts with. The assertions are unchanged.
     - No other test pinned the immediate first notification.
3. **E2E: DONE** (port 4283, desktop and phone-portrait, all 6 passed).
   - `tests/e2e/stories.spec.ts`:
     - no story notice once the worker tick has reached 300, still inside the first minute;
     - the one notice shows `Something happened: <title>`, read from the notice and not assumed, at worker tick 600 or later;
     - Open: the card with that heading, "Memory, not replay", panel times. The dish is paused while it is read (same hash and tick);
     - Spotlight restores 4× (setSpeed 4, running, tick advances). No serious axe violations;
     - Home dot, then the Notebook list, then "A first split" (always recorded in the first minute) with its three captions and an axe check;
     - list Spotlight is view only (hash unchanged, no setSpeed sent), then Dismiss and the Dismissed cards (1) group.
     - It is deterministic against the pacer's choice: whichever card is announced is the one opened and checked. In the Garden seed it is "An enzyme at work" (the earliest event, all templates unseen).
   - `tests/e2e/garden-home.spec.ts:54`: "Tap a Sprinter." right after Run is unchanged, and it now holds because no story can come in the first minute. In the 4× poll toward the Feed prompt, a story notice is dismissed with its own ✕ (`dismissStoryNotice`, `tests/e2e/helpers.ts:127`). It is never counted as a prompt line (`:119`, `:127`). It is dismissed once more after the pause, before Show me (`:151`). The dismissed lines go in a test annotation. The prompt assertions (only the documented lines, a split line seen, Feed prompt, Show me, unchanged hash) are untouched.
   - `tests/e2e/keep-dish.spec.ts:553`: no change. It passes because "Tap a Sprinter." now shows after Run.

## PROPOSED DECISION (D-0079 amendment)

PROPOSED DECISION: A dish's first story notification comes no sooner than STORY_WINDOW_TICKS (600 dish ticks, 60 simulated seconds) after the story watch began on that world. The pacer's window starts closed at the tick the watch (re)bound: a new dish at tick 0; a dish opened, loaded, continued, duplicated or branched at its tick T; and, as before, a world restored by Undo or a rollback or replaced by a reload, at that moment. This now holds whether or not a card was already announced; previously a dish that had announced nothing restarted with the window open. Cards found meanwhile are recorded quietly in the notebook as now and wait. When the window opens, pickStory chooses one among the waiting cards (favorite family, then first unseen template, then earliest event) and the rest stay quiet. Following or unfollowing a family does not restart the window (same world). The window is dish ticks, so it paces the same way at any speed. Nothing else changes: notice priorities (goal > experiment > story > prompt, D-0074), dedupe, the quiet entries, Open's pause and restore, the notice texts. Reason: UX §3.2 "Arrival: paused garden; one line … No auto-spawning surprises. One optional prompt at a time", D08 lines 56–64 (guidance without a tutorial) and line 151 ("at most one new card notification per 60 simulated seconds"): the first minute belongs to the arrival line and the optional prompts. Implemented in src/worker/stories.ts StoryDetector.bind (`new StoryPacer(world.tick)`); stories remain notebook state (D-0070) and never alter the simulation (the never-alters-behaviour test holds).

## Files changed

- `src/worker/stories.ts` (bind: the pacer's start window; StoryPacer doc comment)
- `tests/ui/stories.test.ts` (2 new tests and a `watchFrom` helper; the running-Garden test 1300 → 2300 ticks; one comment; `storyEventTick` import)
- `tests/worker/stories-host.test.ts` (header line; Driver.notifications; a new describe with 3 tests; imports `pickStory`, `STORY_WINDOW_TICKS`)
- `tests/e2e/helpers.ts` (dismissStoryNotice)
- `tests/e2e/stories.spec.ts` (header, the quiet first minute, the announced card read from the notice, "A first split" from the list)
- `tests/e2e/garden-home.spec.ts` (story notices dismissed in the 4× poll and after the pause)
- `docs/reports/reviews/g4-wave-5b/integrate-first-minute.md` (this report)

Scratch only, git-ignored: `tmp/first-minute/` (original and mutant copies, logs) and `tmp/dist-first-minute/`.

## Commands (summary lines)

- `npx vitest run tests/ui/stories.test.ts -t pacing` (after the fix, before raising 1300 ticks): 1 failed ("expected 1 to be greater than or equal to 2"), 4 passed. Raised to 1900: still 1. Probe of card ticks, then 2300: Tests 5 passed | 15 skipped.
- `npx vitest run tests/worker/stories-host.test.ts -t "first minute"`: the first two runs (helper built on runTo) passed 2 tests, then the worker was SIGTERMed at about 100 s during the duplicate test. Likely cause, not verified: the duplicate is not the active dish, so `pump` never advanced it and the loop never ended. The helper was switched to the `step` message: Tests 3 passed | 7 skipped (29.2 s).
- Mutant (a), original stories.ts: `npx vitest run tests/worker/stories-host.test.ts tests/ui/stories.test.ts -t "first minute"`: Tests 5 failed | 25 skipped (exit 1). Restored, `cmp` identical.
- Mutant (b), load-time: same command: Tests 3 failed | 2 passed | 25 skipped (exit 1). Restored, `cmp` identical.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/ui/stories.test.ts tests/worker/stories-host.test.ts tests/ui/notices.test.ts tests/ui/prompts.test.ts tests/worker/favorites-host.test.ts tests/worker/goals-host.test.ts`: Test Files 11 passed (11), Tests 130 passed (130), 466.5 s, exit 0. This includes the 4 trajectory-fence files and the never-alters-behaviour test.
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx eslint src/worker/stories.ts tests/ui/stories.test.ts tests/worker/stories-host.test.ts tests/e2e/helpers.ts tests/e2e/stories.spec.ts tests/e2e/garden-home.spec.ts`: exit 0.
- `lsof -t -i :4283 | xargs -r kill` before; `E2E_PORT=4283 E2E_OUTDIR=tmp/dist-first-minute npx playwright test tests/e2e/stories.spec.ts tests/e2e/garden-home.spec.ts:54 tests/e2e/keep-dish.spec.ts:553 --project=desktop --project=phone-portrait`: 6 passed (5.9 m). phone-portrait: garden-home 49.5 s, keep-dish 17.4 s, stories 36.3 s. desktop: garden-home 2.3 m, keep-dish 38.3 s, stories 59.7 s. Port stopped after (0 listeners).
- Not run: the full `npm run check` (two CPUs; targeted files only, as instructed). The e2e specs were not re-run against the old code here; the lead's 13:27 desktop run is the failing evidence for garden-home :54 and keep-dish :553.
