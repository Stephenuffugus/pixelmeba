#!/usr/bin/env python3
"""Fill the wave 6 task file's <lead: …> placeholders with the wave 5b facts as built (lead, 2026-10-11).

Usage: python3 tools/lead/patch-wave6-placeholders.py <5b feat commit> "<5b evidence line>"
Every replacement must match exactly once (or the stated count); the script refuses otherwise and writes nothing.
"""
import re
import sys

COMMIT, EVIDENCE = sys.argv[1], sys.argv[2]
P = 'docs/agent/g4-wave-6.tasks.js.txt'
s = open(P).read()

R = [
    ('Wave 5b symbols are named only as "<lead: ...>" placeholders.',
     f'Wave 5b symbols: filled in by the lead as built at {COMMIT} (2026-10-11).', 1),
    ('<lead: wave 5b StoryCard component path>', 'src/ui/panels/StoryCard.tsx', 2),
    ("<lead: wave 5b's src/sim/objectives.ts as built>",
     "(P4.4's read-only goal evaluator, D-0078: call it, never change it)", 1),
    ('Replace every "<lead: ...>" in STATE and in the prompts below with the facts as built',
     f'[DONE at {COMMIT}] Replace every lead placeholder in STATE and in the prompts below with the facts as built', 1),
    ('Put the two numbers into STATE (it names them as <lead: D-number>).',
     'Put the two numbers into STATE ([DONE] D-0080 and D-0081; the scope calls are D-0082).', 1),
    ('wave 5b <lead: commit; WORKLOG P4.2 and P4.4 ticked; D-0076 "notice cards" and D-<lead> stories / objectives as built; reports docs/reports/reviews/g4-wave-5b/>',
     f'wave 5b committed as {COMMIT} (P4.2 story cards, P4.4 the objective engine with three goals, and the notice-card rules; WORKLOG P4.2 and P4.4 ticked; decisions D-0076 "The two cards in the notice place", D-0077 "Story cards as built", D-0078 "The objective engine and goals as built", D-0079 "Notification pacing is per source; one visible notice across all sources"; reports docs/reports/reviews/g4-wave-5b/)', 1),
    ('call 3 "The share picture is drawn from a snapshot, not from the live stage" = <lead: D-number>;',
     'call 3 "The share picture is drawn from a snapshot, not from the live stage" = D-0080;', 1),
    ('call 4 "Try my dish clones, never mutates" = <lead: D-number>. Read D-0070...D-0075 and <lead: wave 5b D-numbers> in full before you start.',
     'call 4 "Try my dish clones, never mutates" = D-0081; the wave 6 scope calls (the shelf as the Try my dish baseline "slot", observation-notebook critical, transfer preview deferred to the Phase 5 gates, the recipe card = the Starting recipe file, no separate prediction-note kind, probes and map windows are session state) = D-0082. Read D-0070...D-0082 in full before you start.', 1),
    ('WATCH_STARCH_BECOME_FOOD <lead: as built in content/objectives/>.',
     'WATCH_STARCH_BECOME_FOOD (content/objectives/*.json, phase 4; ObjectiveSchema { id, title, predicate, phase, summary, completedText, endedText?, offerOn }; D-0078).', 1),
    ('goals?, stories? <lead: as built>, checksum }',
     'goals? (P4.4, src/persistence/notebookGoals.ts: GoalRecord, at most 20, at most one running), stories? (P4.2, src/persistence/notebookStories.ts: StoryCard, at most 50), checksum } (ARCH §11.2 documents both kinds)', 1),
    ("P4.4: <lead: goalCatalog / goalStart / goalLeave / goalShown messages and the 'goal' NotebookChange as built; the GoalRunner rides in NotebookWatch>.",
     "P4.2/P4.4 (ARCH §7 \"As built, Phase 4 wave 5b\"): goalStart { requestId, dishId, objectiveId } and goalLeave { requestId, dishId } are answered by 'notebook' (refused? when another goal runs or the dish does not offer it); goalShown { dishId, id } has no answer; goalCatalog { requestId, targetDishId | null, recipeId | null } -> goalCatalog { requestId, goals: GoalOffer[] }; storyMark { requestId, dishId, id, mark } -> notebook; NotebookChange gains 'goal' { id, state }, 'story' { id, notify } and 'storiesRestored' { removed }. NotebookWatch carries 'goals: GoalRunner' (src/worker/goals.ts) and the StoryDetector (src/worker/stories.ts). After Undo or an error rollback, notebookAfterRestore returns every change in order (favoritesRestored, storiesRestored, one 'goal' per ended attempt).", 1),
    ('Objective engine (P4.4): <lead: src/sim/objectives.ts and src/worker/goals.ts exports as built: the watch class, the predicate check (objectivePredicateProblem?), the GateReading interface for transferAcrossGate, ObjectiveProgress, GoalRecord, goal catalog compatibility>.',
     "Objective engine (P4.4, D-0078): src/sim/objectives.ts — ObjectiveWatch (evaluated after every tick, read-only, its own ArmObserver; resumes from ObjectiveProgress { startTick, holdSinceTick, state, lastEventId? }), objectivePredicateProblem(def, ctx) (the content validator's check), objectiveSupportProblem(world, pred, gates?) / objectiveManifestProblem / objectiveRefsProblem (can this dish run it), GateReading (transferAcrossGate; null while no gate exists, so such a goal is never offered), regionMean(world, field, region) over TRAIT_REGIONS (dish and the four quarters only), objectiveCatalog(registry) (phase <= buildPhase); src/worker/goals.ts — GoalRunner (start(world, def: ObjectiveDef, offered) takes a definition object; leave, shown, bind, afterTick), goalCatalog(registry, { world } | { recipeId, manifest }) (offers by offerOn and a variant's sourceId), goalsAfterRestore; src/persistence/notebookGoals.ts — GoalRecord, goalsProblem, goalsWorldProblem, goalWorldRefsOf, GOALS_MAX 20. The host's 'goalStart' case resolves objectiveId through registry.objectives and checks it is offered (goalCatalog).", 1),
    ("the What if? link) <lead: and GoalChoice as built>.",
     "the What if? link) and GoalChoice under Start (src/ui/panels/GoalChoice.tsx: \"Goal (optional)\", \"No goal\" checked by default; playGoalOffers / playGoalChoice in src/ui/goals.ts; startRecipe(..., goal) starts the goal at tick 0).", 1),
    ("'favorite' <lead: + wave 5b additions>)", "'favorite'; wave 5b added none)", 1),
    ("'favorites' <lead: + 'stories'>)", "'favorites' | 'stories')", 1),
    ('Goal row <lead: as built>.',
     'Goal row (GoalRow from src/ui/panels/GoalChoice.tsx: "Goal: {title} — running since {m:ss}" with Leave goal, otherwise the last record\'s line and "Try a goal…").', 1),
    ('Notebook.tsx tabs <lead: Something happened, Favorites, Journal, Experiments as built>',
     'Notebook.tsx tabs Something happened, Favorites, Journal, Experiments', 1),
    ("Integration evidence for wave 5a: npm run check 162 files / 1623 tests; <lead: wave 5b's>.",
     f'Integration evidence: wave 5a npm run check 162 files / 1623 tests; wave 5b {EVIDENCE}.', 1),
    ('under g4-plan call 3 (<lead: D-number> "The share', 'under g4-plan call 3 (D-0080 "The share', 1),
    ('on <lead: StoryCard component> a "Save picture"', 'on src/ui/panels/StoryCard.tsx a "Save picture"', 1),
    ('under g4-plan call 4 (<lead: D-number> "Try my dish', 'under g4-plan call 4 (D-0081 "Try my dish', 1),
    ('read them first: <lead: the GoalRunner / goalStart / goalCatalog names as built>)',
     "read them first: GoalRunner.start(world, def, offered) / leave / afterTick, goalCatalog(registry, at), the host's 'goalStart' case, D-0078)", 1),
    ('through <lead: GoalRunner start as built>,',
     "through GoalRunner.start(world, def, offered) (src/worker/goals.ts; the host's 'goalStart' case shows the call),", 1),
    ('from <lead: the goal catalog as built> for this dish', 'from goalCatalog(registry, { world }) (src/worker/goals.ts) for this dish', 1),
    ('<lead: the predicate check, the watch class, regions supported by fieldInRange, and whether the runner accepts an objective definition that is not in the content registry — if it does not, add the smallest additive entry point in src/worker/goals.ts and say so>',
     "the predicate check is objectivePredicateProblem(def, ctx) with objectiveSupportProblem(world, pred, gates?); the watch class is ObjectiveWatch; fieldInRange regions are TRAIT_REGIONS only (dish, topLeft, topRight, bottomLeft, bottomRight); GoalRunner.start(world, def, offered) takes an ObjectiveDef object, but the host's 'goalStart' case resolves only registry ids (registry.objectives), so a challenge needs its own small additive host entry point that passes its definition (say which)", 1),
    ('D-0071 and <lead: the objectives decision as built>;', 'D-0071 and D-0078;', 1),
    ('src/ui/strings/goals.ts <lead: as built>.', 'src/ui/strings/goals.ts (GOAL_TEXT; end reasons zero, undone, failed, cannotResume, left).', 1),
    ('(<lead: confirm the catalog offers goals on variants through their sourceId as built>)',
     "(confirmed as built: goalCatalog takes the recipe from a variant's sourceId; D-0078, D-0079)", 1),
]
for old, new, n in R:
    c = s.count(old)
    if c != n:
        sys.exit(f'refused: {c} matches (want {n}) for: {old[:90]}')
    s = s.replace(old, new)
left = re.findall(r'<lead:[^>]*>', s)
if left:
    sys.exit(f'refused: placeholders left: {left}')
open(P, 'w').write(s)
print(f'patched {len(R)} replacements; no <lead: …> left')
