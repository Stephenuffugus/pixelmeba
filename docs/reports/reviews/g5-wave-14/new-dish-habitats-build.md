# Wave 14 · new-dish-habitats (P5.4 New Dish half) · build report

Builder: new-dish-habitats (port 4272). Nothing committed (the lead commits). No src/sim, content, protocol.ts or host.ts edits. No FENCE value moves.

## Checklist

### Build
1. **DONE** `src/ui/newDishStarts.ts` (new, pure; imports `@sim/content/habitatRules` and schema types only, plus its own strings):
   - `StartId` (line 20): `'garden' | 'empty' | 'gel' | 'sediment' | \`habitat:${string}\` | \`curated:${string}\``.
   - `HabitatStart` with `id, habitatId, label, note, communityOffered, communitySpecies`, plus one extra field, `furnished`. It holds the structure ids the habitat furnishes over areas, so the summary can say "(197 cells)".
   - `habitatStarts(habitats, manifest, species, demo)` (line 43): keeps habitats that are in `enabledHabitats` and pass `habitatOffered`. With `demo` it keeps only WATER_GARDEN. Sorted by phase, then id. The v1.0 presets keep their ids, labels and notes. Every other habitat gets `habitat:<id>`, its name and its guide summary. `communityOffered` comes from `communityOffered(h, manifest, species)`, and `species === null` makes it false.
   - Species choice: NewDish.tsx reads the species records with `import.meta.glob('content/species/*.json')`, the same way it reads the recipes. So the full rule applies, including the systems a species needs, and not only the enabledSpecies check.
   - `startOverrides(start, community)` (line 81) returns `{ empty: true, habitatId?, community?: true }`. There is no habitatId for the 'empty' (Water Garden) start. `community` is set only when chosen AND offered.
   - `lifeAfterStart(current, next, life)` (line 96) is new. It is the pure Empty-reset rule, split out so it can be unit-tested.
2. **DONE** `src/ui/views/NewDish.tsx`:
   - The start list is Garden, then `HABITAT_STARTS` (line 89: `habitatStarts` over a glob of `content/habitats/*.json` with BUILD_MANIFEST, SPECIES and DEMO_MODE), then the curated dishes (none in the demo).
   - Test ids are still `new-dish-start-with-<StartId>`.
   - START_HABITAT, isEmptyStart and the local countOf/listText are deleted.
   - When `communityOffered`, a "Life" ChoiceGroup appears (h3 plus `testId="new-dish-community"`, line 565) with the choices 'empty' and 'suggested'.
   - The choice resets with `setLife(lifeAfterStart(start, next, life))` (line 425).
   - The preview request and Create both send `startOverrides(...)` keys (lines 438 and 506). The "current" check also compares `preview.p.community` (line 459).
   - The Environment group is unchanged. Its defaults are still `current.environment`.
3. **DONE** Summary lines for a `habitat:<id>` start, in this order: habitat line, `new-dish-places` (line 245), `new-dish-regions`, environment line, `new-dish-life` (line 266, Empty or community), the founders and modules lines when there are founders, then the ledger.
   - 'gel' and 'sediment' keep today's single `new-dish-habitat` line ending "No life until you add it.".
   - 'empty' keeps today's "No life and no food until you add them." line. The e2e checks the Gel text against the record.
4. **DONE** `src/ui/state.ts`: `startCustom` (line 708) and `customDishSource` (line 724) accept `community?: true` and forward it only when it is `true` (line 740). Without it, the request is the same as today's (unit test, JSON-string equality).

### Done when
- **DONE** My test files pass:
  - `tests/ui/new-dish-starts.test.ts`: 13 tests.
  - Journey case 1 passes on desktop and phone-portrait. Cases 2 and 3 are skipped in the real tree.
  - In a scratchpad copy of the tree with H04–H11 enabled and `content-validate --write` run there, all 6 journey cases passed on both projects. The copy was then deleted, and no shared file was touched.
- **DONE** `tests/ui/*.test.ts`: 44 files, 354 tests, all pass.
- **DONE** Existing journeys on desktop (new-dish, chemistry-habitats, curated-dishes, structures-environment): 8 passed (11.3 min).
  - The first attempt had 6 failures, all "Page crashed" / "Target crashed" in the browser after Create. Load was 15 on 2 CPUs with about 1 GB free.
  - The rerun after load fell passed all 8 with no change to any file.
- **DONE** `npx tsc -p tsconfig.json --noEmit` is clean. `npx eslint` on every changed file is clean.
- **DONE** FENCE unchanged: g2-replay, rc1-replay, trajectory-fence*, conservation-closed-lid, determinism and determinism-g3 → `Test Files 10 passed (10) · Tests 77 passed (77)`.
- **DONE** Axe, targets and text: every journey case runs `expectNoSeriousA11yViolations`. The start and community choices go through `expectReachable` (48 px). Summary text is ≥ 16 px. `expectNoHorizontalOverflow` runs on phone-portrait.

## Files
- **Created:**
  - src/ui/newDishStarts.ts
  - src/ui/strings/newDish.ts
  - tests/ui/new-dish-starts.test.ts
  - tests/e2e/habitats-p5.spec.ts
  - this report
- **Changed:**
  - src/ui/views/NewDish.tsx
  - src/ui/state.ts (startCustom and customDishSource, the community pass-through only)
- No styles.css change was needed.

## What each test proves, and the mutant checks (each applied by hand, run, then reverted)
- **"shipped manifest offers exactly the three v1.0 starts":** ids, labels, notes and order are exactly as the old hard-coded list, with no `habitat:` start.
- **"with H04-H11 enabled":**
  - Eleven starts, ordered by phase then id.
  - Each H start has its label (name), note (guide summary), `communityOffered` true and `communitySpecies` as in the D-table.
  - `furnished` is S06 for H04, S11 for H09 and empty for H10.
- **"phase / structure / system / material off":**
  - buildPhase 4 → only the v1.0 three.
  - S01 off → no H10.
  - climate off → no H06, H08, H09 or H11.
  - M11 off → no H04.
  - Not in enabledHabitats → absent.
  - Mutant "list ignores habitatOffered" → this test FAILS (1 failed / 10 passed).
- **"community whose species is not enabled":**
  - B10 off → H05 is still offered but its community is not.
  - `species` null → no community anywhere.
- **"demo"** → WATER_GARDEN only.
- **"the Life choice"** → Empty on any start change. Mutant "choice kept across a start change" (`lifeAfterStart` returns `life`) → FAILS.
- **"startOverrides"** → the v1.0 starts ask for exactly what they asked before. H05 gives Empty and Suggested, and never `community` when it is not offered. Mutant "community sent for a habitat without one" (drop the `communityOffered` check) → 2 tests FAIL.
- **"customDishSource"** → with and without community. The v1.0 request string is unchanged.
- **"summary words"** → places, regions, community and the choice note.
- **"H04 and H10 summaries against the worker preview"** (a FakeClockHost with `habitatRegistry()`): the exact lines below, 25 founders, a larger added ledger, and an equal habitat ledger.
- **e2e case 1:** one start per enabled habitat (phase-then-id), between Garden and curated. The Gel summary is today's text. No community, places, regions or life elements for gel.
- **e2e case 2 (H04):**
  - Empty: places, regions and "No life until you add it."
  - Suggested: the five-group line and a larger added ledger.
  - Gel and back resets to Empty.
  - Create opens the Lab paused with "0:00 · 25 alive", and the region legend shows 1–3.
- **e2e case 3 (H10):** the Suggested line names Starch and both sides, places "Fine membrane (6)", and Create shows "0:00 · 10 alive".

## H04 summary as rendered against habitatRegistry() (unit test output)
H04 Empty:
- Leaf Pool: A dimly lit pool with two leaf wafers in baskets and a patch of mesh between them. All water; no stones. Light 0.6, … Lid open; fixed light.
- It places: Attachment mesh (197 cells), Nutrient basket (2), Leaf wafer (2).
- Regions: 1 West wafer, 2 Mesh patch, 3 East wafer.
- Lid open, fixed light, drying off.
- No life until you add it.
- At the start the dish holds 5898.08 carbon, 1132.40 nutrient and 0.00 mineral (game units, to 0.01): the habitat’s own 5878.08 carbon plus 20.00 added with the food and founders.

H04 Suggested (the same lines, except):
- Suggested Community: 5 Crumbsmiths near West wafer, 5 Brothmakers near East wafer, 5 Creambuds near East wafer, 5 Cordweavers near Mesh patch and 5 Amoebae near Mesh patch.
- At the start the dish holds 5948.08 carbon, 1137.40 nutrient and 0.00 mineral (…): the habitat’s own 5878.08 carbon plus 70.00 added with the food and founders.

Choice note: "Five each of Crumbsmiths, Brothmakers, Creambuds, Cordweavers and Amoebae, placed in its regions and shown below."

H10 Suggested: "It places: Fine membrane (6)." · "Regions: 1 Left side, 2 Right side, 3 Membranes." · "Suggested Community: 5 Crumbsmiths near Left side and 5 Sprinters near Right side. It also adds: Starch."

## Strings added (src/ui/strings/newDish.ts), verbatim
- GARDEN_START: "Little Living Garden" / "Food patches and four kinds of life, ready to watch." (moved unchanged).
- V1_PRESET_STARTS (moved unchanged):
  - "Empty Water Garden" / "The same water and stones, with nothing living and no food."
  - "Empty Gel Colony" / "Gel with one water channel and a little sugar everywhere, with nothing living."
  - "Empty Sediment Edge" / "Water above, sediment with debris below and one stone, with nothing living."
- LIFE_CHOICE: "Life", "Empty", "The habitat with nothing living.", "Suggested Community".
- suggestedNote: "Five each of <plural names, a, b and c>, placed in its regions and shown below."
- NO_LIFE_YET: "No life until you add it."
- placesLine: "It places: <name> (<n> cells|cell) for a furnished structure, <name> (<n>) otherwise, comma-joined."
- regionsLine: "Regions: <n> <label>, …."
- communityLine: "Suggested Community: <n> <plural name> near <region label>, … and …." followed by " It also adds: <patch labels>." when the preview lists patches.

## Proposed decisions
- **PROPOSED DECISION:** Life is never added unless the player picks it. Empty is the default, and the choice returns to Empty whenever the start changes (`lifeAfterStart`). Reason: D-0128 "never added silently", and a choice carried into another start would add life the player did not pick there.
- **PROPOSED DECISION:** The summary counts a furnished structure in cells ("Attachment mesh (197 cells)") and a device, edge or object as a plain count. The UI decides this from the habitat record's `furnish` list (`HabitatStart.furnished`). Reason: the preview's `uses` entries do not say which placements were furnished areas, and each furnished device is exactly one cell.
- **PROPOSED DECISION:** The community's patches (H10's "Starch", from `p.patches`, which host.ts fills with the community patch labels) are stated as a separate sentence, "It also adds: Starch.". Reason: "with Starch" after the last group would read as if the starch belonged only to that group's region.
- **PROPOSED DECISION:** For a Phase 5 habitat start, the founders and modules lines are shown when the preview has founders (the community), not only when `!p.empty`. Reason: such a start is `empty: true` but may still hold its Suggested Community.

## NEEDS
None. Every protocol name (RecipeOverrides.community, NewDishPreview.habitat.uses/regions, community, communityGroups) was already in protocol.ts and host.ts as specified.

## Notes and bugs noticed elsewhere
- Under heavy machine load (load 15, about 1 GB free), Chromium renderer pages crash after Create ("Page crashed"). It is not reproducible at lower load. This is worth knowing for the gate's three-project run.
- `tests/tools/listing.test.ts` still pins enabledHabitats length 3. That is the lead's HABITAT ENABLE item. My journey's case 1 adapts to the manifest by itself.
