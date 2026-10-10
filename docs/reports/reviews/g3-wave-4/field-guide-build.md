# g3 wave 4 — field-guide build report (BUILD_DIRECTIVE P3.8 "Field Guide, journal, badges")

Builder: field-guide (stage 1). Nothing committed (the lead commits). E2E port 4251, build folder tmp/dist-guide.

## Checklist

### Build
1. **Tools pack (D-0039): DONE.** `content/tools/{SAMPLE,TRANSFER,CLEAN_WATER,ERASE_STRUCTURE,SNAPSHOT,DUPLICATE,COMPARE,UNDO,OVERLAYS,INSPECT}.json`, each `{id, name, guide{summary,biology,rules,example}, changes, doesNotChange, watchFor, phase}` plus optional `where`/`dose` (the tray's lines). The Sample, Clean water and Erase structure copy was **moved** word for word: `TOOLS_COPY.sample` / `TOOLS_COPY.cleanWater` are gone from `src/ui/strings/tools.ts`, and so is `ERASE_STRUCTURE` from `src/ui/strings/lab.ts`. Clean water's dose function became the template `"Removes {fraction} of every …"`. The tray reads the records through `src/ui/panels/LabTrayContent.tsx:51` (`TOOL_RECORDS`, import.meta.glob of content/tools), `toolRecord`, `toolItemCopy` and `src/ui/panels/LabTray.tsx:325-329`. The tray names come from `src/ui/strings/tools.ts:35` (`toolRecord('SAMPLE').name` …). UNDO, SNAPSHOT, COMPARE and DUPLICATE say "A game tool with no lab analogue" in `biology`. Proved by `tests/content/guide.test.ts` ("the Lab tray and the Field Guide read the same tool records"). The tests that pin tray copy still pass: `tests/sim/view-switch.test.ts`, and grep shows that `tests/e2e/sample-transfer.spec.ts`'s "Partners are never split" and "Removes 50 %" still hold.
2. **Schema and registry (W5-03): DONE.**
   - `ToolSchema` is at `src/sim/content/schema.ts:145`.
   - In `src/sim/content/registry.ts`: the optional `RawPacks.tools` (:62), `contentHashInput` (:186; tools are hashed only when present, so tool-less packs hash as before), parsing (:231), the `guideProblems` hook inside `validateContent` (:460), and `ContentRegistry.tools/toolIds` (:498).
   - Loaders: `tools/lib/content-fs.ts:39` and `src/sim/content/raw-vite.ts:36`.
   - No required field was added to Guide, Species, Material, Module, Habitat or Manifest schemas. Tools are not recorded in worlds or saves.
   - `npx tsx tools/content-validate.ts --write` wrote contentHash `e5bf702e827b350843062a17ec9b3c870d163f727e4eee2eb003c8134b72d347`. A re-check later printed "content ok" with the same hash.
3. **Validator: DONE.** `src/sim/content/guideRules.ts` (`guideProblems` :75) runs for whichever manifest is validated. Tools are enabled when their phase ≤ buildPhase.
   - Missing or blank guide text, and blank tool `changes/doesNotChange/watchFor`, is an error naming file → field. Zod reports a missing field; the rule reports a whitespace-only one.
   - "No additional modeled reaction." is required unless `MATERIAL_REACTIONS` (:33, one list, now empty) lists the material. I appended the sentence to SUGAR, NUTRIENT and DEBRIS. NUTRIENT keeps its pinned sentence and DEBRIS its example. `tests/content/material-guide-text.test.ts` now imports the list; its second test now covers Phase 1–3 records.
   - A not-enabled species name in summary/example (or a tool's three lines) is an error, plurals included (`speciesNamePattern` :61). In biology/rules it is a warning (PROPOSED DECISION 1).
   - Both the shipped manifest and `registryWith(G2_LISTS)` validate.
4. **Guide UI (UX §5.7): DONE.**
   - `src/ui/views/FieldGuide.tsx` replaces App's placeholder (`src/ui/app/App.tsx:53`).
   - Tabs: Species · Materials · Structures & tools · Rules glossary. Every enabled entry is listed at once and nothing is locked. Modules are listed in each species as "Abilities it can gain" and also as their own Species-tab entries; habitats are in Structures & tools (PROPOSED DECISION 2).
   - A species entry shows:
     - an atlas thumbnail (`drawFrame`);
     - food (`dietWords`, using `foodWord`/`listWords`);
     - where it lives, including attachment;
     - its preferred pH, warmth, salt and moisture ranges, with the fictional-units notice;
     - Hunts / Hunted by, with "(only free-swimming)" and "(only in sediment)";
     - Hosts / Infected or ridden by;
     - what it makes (from native abilities and metabolism);
     - the example;
     - "General biology" and "Rules of this game" sections.
   - Materials show their guide text. Structures and tools show Changes / Does not change / Watch for. Structures use the tray mapping (rules / `BRUSH_COPY.place.sealedUnchanged|beadUnchanged` / example), in `src/ui/views/FieldGuideData.tsx`.
   - The glossary covers SPEC §18 plus "All numbers are fictional game units." (`src/ui/strings/guide.ts` `GLOSSARY`).
   - '/' focuses search through the guide's own document listener, which is mounted only while the guide shows; the dish screen is unmounted then. Search matches names and ids ("vel" → Velvet, "b04" → Recycler).
   - All text is 1rem; the CSS block is appended at `src/ui/styles.css:2761`.
   - The registry is built lazily on the main thread (`import('./FieldGuideData')`), so the content packs load only when the guide opens.
5. **Pause and restore (W5-04): DONE.** `src/ui/views/FieldGuideNav.tsx`: `openGuideFromDish` records `{dishId, speed}` (wired at MoreSheet `:116`, `data-testid="more-guide"`). `guideBack` returns to that dish at that speed, or Home when it was opened from Home. Leaving the dish still pauses it through the existing route effect. I did not edit `src/ui/state.ts`: the guide-return record lives in my own file.
6. **Relationships seen (W5-05, W5-07): DONE.**
   - `src/worker/relationships.ts` `RelationshipWatcher`:
     - predation from 'capture' events;
     - lysis and drain from 'death' DEATH_LYSIS / DEATH_PARASITE_DRAIN, credited only to the virus or parasite the watcher saw (or found at start) on that host;
     - infection and attachment from an after-tick column scan (0 → non-zero);
     - feeding by pool from the new observation-only intake record, read by a stage-6 hook;
     - conversions from `reactionCells`' last complete second, credited only where `producersNear` names a producer (D-0051). `producersNear` was already exported.
   - Intake record: `IntakeSeen` (`src/sim/intake.ts:129`), cleared at the start of stage 6 (:173) and set where take > 0 (:374). It is `world.intakeSeen` (`src/sim/world.ts:149`, :214) and is registered in `POST_G2_DERIVED_KEYS` (`tests/helpers/trajectory.ts:207`). It is never read by the simulation, never saved and never hashed.
   - Host: `DishHost.stepDish` (`src/worker/host.ts:1086`) runs the watcher with `step(world, {afterStage})` plus `afterTick`. When an experiment observer is active, both hooks run. It never runs on comparison arms (`d.arm`), and rollback uses plain `step()`. It rebinds when undo or rollback replaces the world.
   - Protocol: request and reply `'relationships'` (`src/worker/protocol.ts:106`, :871), `RelationshipSeen` type, client `relationships()` (`src/worker/client.ts:411`).
   - The UI polls every 2 s while the dish screen shows, once when leaving it, and once when the guide opens (`RelationshipSync` in App). It merges into the device store only. No new sim events.
7. **Badges: DONE.** `src/ui/badges.ts`: the localStorage key `pixelmeba.relationships`, with every read and write in try/catch. Badges are derived only from the records: one per relationship kind, with no counts, streaks or timers. Each guide entry shows "Seen in your dishes", with sentences such as "Recycler ate debris", "Ciliate caught a Sprinter" or "Pinphage burst a Sprinter" (`relationshipSentence`), plus the badges those records earned.

### Done when
- **tests/content/guide.test.ts: DONE (40 tests).**
  - Removing and blanking each guide field of an enabled species (B04), material (SALT), module (E05), habitat (WATER_GARDEN), structure (BEAD) and tool (SAMPLE), plus the tool's three extra fields, fails with file → field.
  - Non-enabled records are not held to the rule.
  - The "No additional modeled reaction." rule has a failing case (SALT without the sentence) and a passing case.
  - The not-enabled-name rule has failing cases (B01 summary "Lanterns", SUGAR example "Brinecoil", UNDO watchFor "Needlejaw") and passing cases (enabled names; rules text only warns; a test manifest that leaves P03 out only warns).
  - Shipped content and G2_LISTS both validate.
  - Prey, predator, host and parasite lists equal CT §3.2–§3.3 parsed from docs/CONTENT_TABLES.md, filtered to enabled species. Ranges are expanded, 'free' and 'while in sediment' are kept, 'within 1 cell' is recognised and parenthetical notes are dropped. `tests/helpers/tables.ts` was not touched.
  - The guide model shows the lists with their qualifiers and contains no ranking words.
- **A test shows tray and guide read the same tool record: DONE.** `tests/content/guide.test.ts`, "Sample, Transfer, Clean water and Erase structure …", uses an in-process worker and `LabTray.itemCopy` versus `guideModel` versus `registry().tools`.
- **tests/worker/relationships.test.ts: DONE (8 tests).** Each case below is recorded exactly once, at a second measured independently of the watcher:
  - a capture: the event's second and id;
  - an infection: the first tick of an infected column;
  - a parasite attachment: the first tick `hostSlot` = host;
  - a lysis: the lysis death event;
  - a Recycler eating debris and a Recycler eating film: the first tick the pool total dropped across stage 6;
  - a provenance-backed conversion (STARCH_UNLOCK_V1, B06): cumulative conversion totals rose in that second.

  Untaken pools are never recorded (`eats:B04:sugar`, `eats:A01:sugar`, `eats:B01:detritus`, …), and enzyme activity with no producer converts but records nothing. `stateHash` and `trajectoryDigest(world,'full')` are identical with and without the watcher, and with the intake record overwritten or dropped every tick. The host answers 'relationships', and the watched host dish hashes like an unwatched copy of the same state.
- **tests/ui/badges.test.ts: DONE (6 tests).** Badges derive only from store records; merging keeps the first sighting; a throwing or missing localStorage gives [] or false and the guide keeps working; recording writes only the one device key. The test in guide.test.ts also shows that `syncRelationships` sends one read-only 'relationships' message and the world hash is unchanged.
- **tests/e2e/field-guide.spec.ts (desktop): DONE (3 passed).**
  - Home → Field Guide.
  - '/' then "vel" → Velvet with General biology, Rules of this game and predators (Amoeba and Siltworm, not Ciliate).
  - Materials → Salt shows "No additional modeled reaction."
  - Structures & tools → Sample shows Changes / Does not change / Watch for.
  - The glossary; axe clean twice; text ≥ 16 px; tabs, Back and search are 48 px targets.
  - At 200 % text there is no sideways overflow and the text is 32 px.
  - Garden in Lab: Recyclers and a debris dose, Run, 4×. More → Field Guide sends setSpeed 0, and the worker tick stays the same over 1.5 s. The Recycler entry shows "Seen in your dishes", "Recycler ate debris" and the Mealtime badge; the guide's Badges card shows it too; axe clean. Back sends setSpeed 4, the 4× button is pressed and ticks advance. After a reload the record is still there.

## Files
**Created:**
- content/tools/*.json (10)
- src/sim/content/guideRules.ts
- src/worker/relationships.ts
- src/ui/badges.ts
- src/ui/strings/guide.ts
- src/ui/views/FieldGuide.tsx, FieldGuideData.tsx, FieldGuideNav.tsx
- tests/content/guide.test.ts, tests/worker/relationships.test.ts, tests/ui/badges.test.ts, tests/e2e/field-guide.spec.ts
- this report

**Changed:**
- content/materials/{SUGAR,NUTRIENT,DEBRIS}.json (rules += "No additional modeled reaction.")
- content/manifest.json (contentHash only)
- src/sim/content/{schema,registry,raw-vite}.ts, tools/lib/content-fs.ts
- src/sim/intake.ts, src/sim/world.ts
- src/worker/{protocol,host,client}.ts
- src/ui/app/App.tsx, src/ui/panels/{MoreSheet,LabTray,LabTrayContent}.tsx, src/ui/strings/{tools,lab}.ts, src/ui/styles.css (appended)
- tests/helpers/trajectory.ts (one key)
- tests/content/material-guide-text.test.ts

Content edits found by my validator: only SUGAR, NUTRIENT and DEBRIS (the sentence). No summary or example had to be reworded: neither the shipped manifest nor G2_LISTS has a summary/example error.

## How the tests fail without the mechanism
- relationships.test.ts, by temporary mutation (since reverted; the sources are confirmed restored):
  - with `markIntake` disabled, the Recycler/film, hash (entries ≤ 3) and host tests fail;
  - with conversions credited to every species instead of `producersNear`, the conversion test fails.
- guide.test.ts:
  - the blank-text cases pass zod (`min(1)` accepts '   '), so they fail without `guideProblems`;
  - the name and sentence cases fail without the rule, because the shipped content otherwise validates;
  - the tray test fails if the tray keeps its own strings, because the strings-file assertions check the moved copy is gone.
- badges.test.ts uses a throwing storage stub, so it fails if any read or write is outside try/catch.

## Commands and results
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/content tests/ui/badges.test.ts tests/worker/relationships.test.ts tests/worker/protocol.test.ts tests/helpers/trajectory.test.ts tests/sim/view-switch.test.ts tests/sim/lab-commands.test.ts` → `Test Files 20 passed (20) · Tests 352 passed (352)`
- `npx vitest run tests/content/guide.test.ts` → `Tests 40 passed (40)` (after the last edit to the file)
- `npx vitest run tests/ui/badges.test.ts` → `Tests 6 passed (6)`; `npx vitest run tests/worker/relationships.test.ts` → `Tests 8 passed (8)`
- `npx tsc -p tsconfig.json --noEmit` → clean. One transient error in another agent's tests/fixtures/transport-obstacles.test.ts went away on its own.
- `npx eslint <all my files>` → clean.
- `E2E_PORT=4251 E2E_OUTDIR=tmp/dist-guide npx playwright test tests/e2e/field-guide.spec.ts --project=desktop` → `3 passed (1.2m)`. The port was stopped before and after.
- `npx tsx tools/content-validate.ts` → `content ok · contentHash e5bf702e… · species 38 (enabled 19) …` with 47 warnings: rules or biology text naming species that are not enabled (PROPOSED DECISION 1).

## FENCE
None. No fence digest moved: g2-replay and the four trajectory-fence files pass, and the intake record is a derived key.

## Bugs or notes elsewhere
- ARCH §2/§4 should list `content/tools/*.json` and `Tool {…}` (D-0039 says the pack is added there). That is a docs edit for the lead.
- 47 rules-text warnings: for example, the P02, P04, INH_BACT, INH_PHOTO and E03 rules name Phase 5 species (Lantern, Sleeper, Shadeleaf …). This is honest per CT, but players cannot meet those species yet. Owner wording call.
- The dish's speed buttons render only while it runs (DishScreen), so a journey must press Run before choosing 4×. This is not a bug; noted for spec authors.

## PROPOSED DECISIONS
1. **PROPOSED DECISION:** the not-enabled-name check is an error when summary, example or a tool line names a species that is not enabled **and** belongs to a later phase than the build. It is a warning when a (test) manifest only leaves a shipped species out, and always a warning in biology or rules text. For the shipped and g2 manifests "not enabled" and "later phase" coincide. The narrower rule keeps every `registryWith({enabledSpecies: subset})` test registry valid.
2. **PROPOSED DECISION (G17 22):** modules appear in each Species entry as "Abilities it can gain" (enabled eligible ancestors) and as their own entries in the Species tab. Habitats appear in Structures & tools (summary, General biology, Rules of this game, Example).
3. **PROPOSED DECISION:** tool records carry optional `where` and `dose` (the tray's lines; "{fraction}" is filled with the chosen amount). They are enabled by `phase ≤ buildPhase` and have no manifest list. They are never recorded in a world or save. contentHash includes the tools collection only when it is non-empty. Phases: SNAPSHOT, UNDO, OVERLAYS and INSPECT 1; ERASE_STRUCTURE, DUPLICATE and COMPARE 2; SAMPLE, TRANSFER and CLEAN_WATER 3.
4. **PROPOSED DECISION:** Transfer's tray lines are now its own record: "Put a held sample down somewhere else in the dish." with its own changes, does-not-change and watch-for lines. Before, it repeated Sample's lines; its dose line is unchanged.
5. **PROPOSED DECISION:** relationship ids are `<kind>:<actor>:<target>` with kinds eats, catches, infects, attaches, bursts, drains and converts.
   - "eats" covers the pools sugar, starch, oil, protein, broth, detritus, metabolite, film and co2. co2 reads "took up carbon dioxide in light".
   - Digesting a held meal and host drain are not "eats".
   - A lysis or drain death is credited only to the virus or parasite the watcher saw on that host.
   - Each id keeps its first sighting per device, across all dishes.
   - Seven cosmetic badges, one per kind, with no counts.
6. **PROPOSED DECISION:** the guide shows this build's enabled content, not the open dish's recorded manifest, because it is a reference for the game. It builds that registry lazily on the main thread from the bundled packs.
