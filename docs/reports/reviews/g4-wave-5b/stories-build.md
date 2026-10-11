# P4.2 Story cards — build report (wave 5b, stage 2)

## Checklist

### Build
1. StoryCard record (notebook kind 'stories') — DONE
   - Type, templates, limits, validation: src/persistence/notebookStories.ts (StoryCard :~170, storyCardProblem :324, storiesProblem :370, storiesRefsProblem :386, storyToRemove/addStory :452/:463, markStory, storiesWereRemoved). STORIES_MAX 50 (:27); STORY_EVIDENCE_MAX 16; STORY_WINDOW_TICKS 600.
   - Shape as assigned: { id 'story-<n>', template, key, worldId, ruleset {simulationVersion, evolutionRulesVersion, moduleRegistryVersion, contentHash}, evidence, summary, timeRange, imageRefs [], favoriteId, notified, seen, dismissed }. Key = template + ':' + species / 'root-<birthId>' / enzyme:region / region.
   - Evidence ids: 'event:<id>', 'reaction:<enzyme>:<second>:<cell>', 'branch:<id>', 'traits:<region>:<second>' (region by TRAIT_REGIONS name), 'command:<seq>'. Each template must carry its own kinds (firstSplit event; enzymeAtWork reaction; familyChanged event+branch; placeChanged command+traits).
   - Refused: no evidence, missing required evidence kind, malformed/repeated id, unknown template, non-finite value, > 50 cards, a summary missing (or with an unknown/invalid) field, any imageRefs, another world's card. World refs (species, birth ids < nextBirthId, timeRange ≤ world.tick) via storiesRefsProblem.
   - Full list: oldest dismissed, else oldest seen, else oldest (lowest id). The tab says so (STORY_TEXT.removed) when the list is full and ids show removals.
   - Shared notebook.ts edits (additive, beside objectives' goals lines): import, optional `stories?: StoryCard[]`, `KIND_PROBLEMS.stories`, a storiesRefsProblem call in worldRefsProblem, and notebookIsEmpty counts stories (otherwise a stories-only notebook would never be written).
2. Detector (StoryDetector, read-only) — DONE, src/worker/stories.ts :293
   - firstSplit (onBirth :391): committed 'birth', first per species in this dish (species that had births before — history, lineage origin 0, live generation > 0 — never get one, so an old save gains no false "first"), or the first split of an active favorite's root (key 'firstSplit:root-<root>'). Summary keeps parent/daughters, changedA/B, parent birth tick, and per changed daughter the recorded change (locus from→to from lineage genome records, gained/lost module, policy, preference); `recorded:false` when the records are gone.
   - enzymeAtWork (enzymes :470): once per whole second, reactionInDish > 0; key enzyme + quarterOf(cell that converted most); evidence the reaction id; summary amount in that cell, dish amount, region, producers = producersNear (D-0051) or [].
   - familyChanged (onBranch :435): 'branchEstablished' → buildLineage row (read-only); evidence event + branch; summary keeps the generated name (never a player's name), trait, descriptor, module, locusValues, locus name and the two genomes' rule numbers (LineageRules) for the tradeoff.
   - placeChanged (places :509): accepted inoculate / deposit (mean of stroke points) / placeObject; once a trait sample ≥ 600 ticks later exists, compares that quarter's per-species counts with the last sample at or before the command; card only if a count changed (largest change shown; count of other changed kinds and of other accepted changes in between kept). A later placement in a region already waiting joins it. Placements made before the watch existed (e.g. Feed before the first Play) are picked up from world.commands.log on bind.
   - Every new card is checked with storyCardProblem before it is written (record :587): no card without its evidence.
   - Hooked into NotebookWatch (src/worker/notebookWatch.ts): constructor line :40, afterTick line :85, plus a rebind line :52 (no-op unless the world object changed) and the restore line in notebookAfterRestore :104–106 (new change kind 'storiesRestored').
3. Pacing (StoryPacer :105, pickStory :89) — DONE
   - ≤ 1 notification per 600 dish ticks; cards found while the window is closed wait; when it opens one is chosen and the rest stay quiet (notified false, never announced later).
   - Dedupe: a detection whose key has a card whose first evidence is < 600 ticks old joins it (evidence appended up to 16, timeRange end extended, change {kind:'story', notify:false}); outside the window a key never makes a second card, except placeChanged (each later intervention is its own sequence).
   - Priority: favorite card → template not yet seen → earliest event (storyEventTick, then id).
   - Posts notebookChanged { kind: 'story', id, notify } (protocol.ts :574).
4. UI — DONE
   - Notice: src/ui/stories.ts wireStories :147 — a card the worker notified (and not already in the dish's notebook when this page first read it) calls requestNotice({ kind: 'story' }) with "Something happened: {title}", Open and ✕; withdrawn when the card is opened, dismissed or undone. No sound. Wired once at Notebook.tsx module load.
   - Notebook tab "Something happened" first in TABS (src/ui/views/Notebook.tsx), quiet dot (StoryDot) when a card is unseen; Home's Notebook button shows the same dot and opens the stories tab while one is unseen (Home.tsx).
   - Card view src/ui/panels/StoryCard.tsx: ≤ 3 panels with m:ss, badge "Memory, not replay", memory note, Spotlight and Dismiss; Save picture not shown. List + Dismissed group in src/ui/views/NotebookStories.tsx; captions in src/ui/strings/stories.ts.
   - Opening a card marks it seen (storyMark; host.ts case 'storyMark' :862, client.storyMark :209).
   - Spotlight (stories.ts spotlightStory :122): route to the dish (speed untouched), then renderer.zoomPreset('neighborhood') on the surviving target (birthId found in the latest snapshot ids → positionOf) else the recorded cell/place. No command, no selection, no request.
   - No dish open: "Story cards are kept with each dish. Open a dish to see what happened in it."
   - state.ts Route notebook tab union gains 'stories'; styles.css own block "story cards (P4.2)".

### Done when
- tests/ui/stories.test.ts — DONE (13 tests): no card without evidence (each template refused without any and without its required kind; malformed/repeated ids); unknown template, Infinity/NaN, missing summary field, pictures, other world, 51 cards refused; eviction order; captions for all four templates from the stored summary (exact SPEC strings, m:ss, species fallback to id, ≤ 3 panels, no benefit/cause words, "Other recorded changes in between: 2"); pacing (1 per 600 ticks, quiet rest, rebuilt pacer waits a window; priority favorite → unseen template → earliest); a running Garden through StoryDetector (keys unique, an enzyme card joined by later evidence, notifications ≥ 600 ticks apart, quiet cards recorded, every card passes the load check); Spotlight makes no client request and only calls zoomPreset with the recorded cell.
- Never alters behavior — DONE (tests/worker/stories-host.test.ts "never alters behaviour"): Garden + one sugar deposit, 4×, 3,000 ticks, detector on (> 3 cards) vs off (0 cards): equal stateHash and trajectoryDigest(world,'full'). Spotlight sends no command: unit test above + e2e worker hash unchanged.
- tests/worker/stories-host.test.ts — DONE (7 tests): save → load (slot) and export → import round-trip equal cards and stateHash; a malformed card (empty evidence, resealed with a valid checksum), an unknown template and a future timeRange each drop the notebook with notebookDropped while the world loads with the same stateHash; a stage 1 notebook (no stories key) loads with favorites and no cards; the g2 save first-dish-t3000 imports with no cards and, played on 400 ticks, never gets "firstSplit:B01"; 50 filler cards + four new detections remove story-21, story-31 (dismissed), story-4 (seen), story-1 (oldest) in that order; storyMark seen/dismissed is notebook state (no command seq, same stateHash, unknown id refused); Undo removes the cards found in the undone time (storiesRestored posted) and keeps earlier ones.
- tests/e2e/stories.spec.ts (desktop AND phone-portrait) — DONE: Garden → Run → 4× → "Something happened: A first split" shows, exactly one notice element → Open → tab "Something happened" first and selected, card "A first split" with 3 panels, the SPEC sentence, m:ss, "Memory, not replay", no Save picture, no horizontal overflow, axe clean → Spotlight → dish, still paused, worker hash unchanged, axe clean → Home Notebook dot → list, axe clean → Dismiss → "Dismissed cards (1)", hash unchanged, no page errors.

## How the tests were checked to fail without the mechanism
- Behaviour test: the "off" run asserts 0 cards and the "on" run > 3, so the comparison is between a run that really detected and one that did not.
- The "never a first split for a species that split before" test fails if speciesWithBirths is skipped (the first B01 birth after import would be a "first").
- Eviction test failed during development with the wrong capture order (the first removal happened before the snapshot), proving it reads real removals; the order differs if storyToRemove's dismissed/seen preference is dropped.
- tests/ui/favorites.test.ts "a rewind and a reload…" (stage 1's test) failed after my first version: it rewinds the world through NotebookWatch.rebind without notebookAfterRestore, leaving cards from the undone time, which the load-time check then refused. Fixed in the detector (bind drops cards whose first evidence the rebound world does not have), not in the test.
- Pacing assertion on ticks failed once on my wrong expectation (earliest = enzyme 0:24, not the split 0:35), so it reads the real ordering.

## Commands and results
- npx tsc -p tsconfig.json --noEmit: clean.
- npx eslint (my files + Notebook.tsx, Home.tsx, notebookWatch.ts, notebook.ts): clean.
- npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/ui/stories.test.ts tests/worker/stories-host.test.ts tests/persistence/notebook.test.ts tests/ui/favorites.test.ts tests/ui/notices.test.ts tests/worker/favorites-host.test.ts tests/worker/protocol.test.ts → "Test Files 14 passed (14) / Tests 148 passed (148)".
- E2E_PORT=4272 E2E_OUTDIR=tmp/dist-stories npx playwright test tests/e2e/stories.spec.ts --project=desktop --project=phone-portrait → "2 passed (2.5m)" (final run after the last code change; port stopped before and after).

## FENCE
No fence change; g2-replay and the four trajectory-fence files pass. No src/sim edit, no content edit, no version or schema change.

## Files
Created: src/persistence/notebookStories.ts, src/worker/stories.ts, src/ui/stories.ts, src/ui/strings/stories.ts, src/ui/views/NotebookStories.tsx, src/ui/panels/StoryCard.tsx, tests/ui/stories.test.ts, tests/worker/stories-host.test.ts, tests/e2e/stories.spec.ts, this report.
Changed (owned): src/ui/views/Notebook.tsx (tab first, dot, StoryDot export, wireStories call).
Changed (shared, additive): src/persistence/notebook.ts; src/worker/notebookWatch.ts (construct, rebind, afterTick, restore); src/worker/protocol.ts (storyMark; 'story' and 'storiesRestored' changes); src/worker/host.ts (case 'storyMark', import); src/worker/client.ts (storyMark); src/ui/state.ts (Route union); src/ui/views/Home.tsx (dot; Notebook opens the stories tab while a card is unseen); src/ui/styles.css (own block at the end).

## Differences from the assignment (the code wins)
- NotebookWatch needed two lines more than "construct + call": a rebind line (favorite ops call rebind with the same world; the detector keeps its state then and rebuilds only for a new world) and the restore line in notebookAfterRestore (stage 1's own hook, "Stage 2 adds its kinds here").
- A protocol change kind 'storiesRestored' { removed } was added (notebookAfterRestore returns one change; without it a stories-only restore could not reach the UI).
- The UI does not subscribe to client.onNotebook: favorites.ts already copies every notebookChanged record into `notebook`, and a card's `notified` flag is the same fact as `notify:true`; stories.ts derives the notice from the record, baselining the cards a dish already had when the page first read it (a reloaded dish never re-announces).
- The e2e first notice in the Garden is "An enzyme at work" at 0:01 (Crumbsmiths convert starch from the start); "A first split" (Sunbead, 0:29) is announced at 1:00 when the window reopens. The spec waits for that notice.

## Bugs or notes elsewhere
- None blocking. Concurrent edits by objectives / notice-cards in notebook.ts, protocol.ts, host.ts, notices.ts, NoticeHost.tsx were present; tsc was clean at my last run.

## Proposed decisions
- PROPOSED DECISION: story pacing uses dish ticks (600 = 60 simulated seconds, D08 line 151, CT §12.10), while the P2.3 DiscoveryPacer keeps its wall-clock 60 s. The pacer's clock is not saved: after Undo, rollback or a reload, a dish that already announced a card waits a full window before the next.
- PROPOSED DECISION: "first unseen template" counts a template as seen when a card of it was opened OR already announced in this dish (with "opened" only, the Garden's enzyme cards would keep winning on "earliest" and a first split would rarely be announced).
- PROPOSED DECISION: Save picture is not shown until P4.6 share; imageRefs must be [] (a card with pictures is refused by this version).
- PROPOSED DECISION: firstSplit/enzymeAtWork/familyChanged make one card per key per dish (later evidence joins only within 600 ticks); placeChanged may make a new card for the same region after the window.
- PROPOSED DECISION: a deposit's place is the mean of its stroke points; a placement before the first trait sample (dish second < 10) can make no card (no "before" summary exists), and the card shows the species whose count changed most, with the number of other kinds that changed.
- PROPOSED DECISION: after Undo or a rollback, a card whose first evidence is not in the restored dish is removed (storiesRestored); a card that later evidence joined keeps only the evidence the restored dish has. Card ids are "one past the highest kept", so an id can be reused after Undo; notice ids include world, card id and event tick so a dismissed notice never hides a different card.
- PROPOSED DECISION: story cards hold no player text (generated branch names only), so "Export without names or notes" keeps them; Duplicate and an opened checkpoint branch copy none (favoritesOnly, D-0073).
