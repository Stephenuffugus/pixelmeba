# G2 wave C — P2.2 Founder modes and mutation presets (builder report, resumed)

Resumed from the interrupted builder's uncommitted work in the tree. Nothing was discarded. I did not run
any git write command. `tests/e2e/whatif.spec.ts` was not edited: its New Dish steps still pass on all
three projects with the new "enter paused in the Lab with the Life tray open" behaviour.

## 1. Audit checklist (state found → state now, with evidence re-run this session)

| # | Item | Found | Now | Evidence |
|---|------|-------|-----|----------|
| B1 | Identical founders: loci 50, no modules | DONE | DONE | `src/sim/founders.ts:76` founderDraw. Test: founders.test "Identical: every founder has loci 50, no modules, origin added" |
| B2 | Varied: each active locus 45–55 from a seeded init stream | DONE | DONE | `founders.ts:68` variedLocus (`det(seed,'founder.init',birthId,locus)`, bit-identical to wave A). Tests: "Varied: each active locus is 45–55 …" and "covers every value evenly (7 loci × 2,000)" |
| B3 | Diverse: 10 % of eligible founders get one legal module, labelled "present at creation" in the inspector and lineage | DONE | DONE | `founders.ts:55` diverseModuleFor (reserved `founder.module` stream); `commands.ts:308,344` sets lineage origin 2. Inspector chip is the existing `originChip` → "present at creation"; lineage family rows use `deltaText` → "present at creation". Tests: founders.test "Diverse: … exactly when its roll is under 10 %", "about 10 % of 3,000 … uniform", "no legal gain never receive one", "Add Life too"; founders-words "a Diverse dish end to end" |
| B4 | Presets Standard / Accelerated / Fixed with an Advanced panel that shows the per-birth rates | DONE | DONE (copy fixed) | `mutation.ts:33` ratesFor; `AdvancedEvolution.tsx` EvolutionSheet (More → "Evolution settings (Advanced)") and New Dish "Show the chances per offspring (Advanced)". e2e new-dish checks 16 % / 4 % / 1 %, then 8 % / 0.2 % |
| B5 | Preset change during play = timestamped intervention in the command log; undoable; on the History timeline | DONE | DONE (History line made persistent) | `commands.ts:143` setMutationPreset (records `presetFrom`, tick = `targetTick`); `mutation.ts:204` presetChanges; host snapshot `evolution` (`host.ts:1569`); `state.ts:260` syncEvolutionFeed. Tests: founders-presets "a change is a timestamped command", "Undo removes the change …; the History timeline marks it; save/reload keeps it"; e2e: History → What happened shows it, Undo removes it |
| B6 | Faster playback never changes per-birth rates (prove it) | DONE | DONE | founders-presets "1× and 4× record the change at the same tick and draw every birth with the same per-birth rate" (4× really ran > 1 tick per frame; identical lineage mutFlags, genomes, birth ticks and hash; every birth checked against the 8 % / 16 % draw oracle) |
| B7 | "Core prototype — quantitative evolution" wherever the world is described while the registry is partial | PARTIAL | PARTIAL (owned surfaces DONE) | New Dish "What you get" and Content, More sheet, Evolution sheet (`worldModesLine`, partial = world's enabledModules < this build's 17-module catalog, `host.ts:1404`); What if? Details already had it. Not shown on Home's Continue card or the Saved dishes list, because the slot index does not keep the evolution meta and I do not own those files (see §6) |
| B8 | "Accelerated Evolution (game setting, not realism)" and "Fixed Traits" labels per UX §3.3 | DONE | DONE | `strings/modes.ts` PRESET_CHOICES / `evolutionLabel`; founders-words "exact UX §3.3 strings" |
| B9 | Export metadata shows the enabled registry (module ids and registry version) | DONE | DONE | `saveFile.ts:155` meta.registry + meta.evolution, always taken from the world; registry-imports "export metadata shows the enabled registry and evolution setting, always from the world" |
| D1 | registry-imports: a save referencing a module this build lacks fails import clearly, nothing built | DONE | DONE | `saveFile.ts:226` (SaveFileError 'content', names the ability). Test 1 checks the message, and through the host: error reply, no dish, open dish hash unchanged |
| D2 | Changing the active registry never mutates an existing save's candidates, genomes or recorded registry | DONE | DONE | registry-imports test 3: an evolved dish with candidates, loaded by a host whose content changed, keeps the same content, manifest, genomes and branches, the same hash, and the same next 150 ticks; re-export states the recorded registry |
| D3 | Founder-mode fixtures: distributions exactly as specified, deterministic per seed | DONE | DONE | founders.test (16 tests), including "every mode is deterministic per seed, and different seeds give different founders" |
| D4 | Preset change recorded with its tick; per-birth rates identical at 1× and 4× | DONE | DONE | see B5/B6 |
| D5 | e2e new-dish: Varied + Accelerated → labels → Advanced rates → change during play → History | DONE | DONE (hardened) | `tests/e2e/new-dish.spec.ts`, 6/6 on three projects. Added: 16 px text checks, the Lab-tray check at 200 %, and a pause before History (desktop had timed out under load) |
| D6 | New Dish enters paused with the Life tray open (Lab) via `openLabWith('life')` | DONE | DONE | `NewDish.tsx:154-155`; `DishScreen.tsx` closes the tray when a sheet opens. e2e asserts data-view lab, `lab-cat-life` aria-expanded, Run label, at 100 % and 200 % |
| D7 | Reuse the Inspector's "present at creation" label for Diverse founders | DONE | DONE | `Inspector.tsx:224` originChip (unchanged) + per-module source line. founders-words end-to-end test |
| D8 | Honest label for descendants carrying a creation module; founder-origin field in the inspect data, tested | DONE | DONE (honesty bug fixed) | `founders.ts:232` founderOriginOf → `EntityInspect.founderOrigin` (`snapshot.ts:280`, `protocol.ts:386`); "Inherited from its founder #N, which had it at creation." Tests: founders.test origin block, founders-words |
| X1 | whatif.spec New Dish steps under the new behaviour | UNKNOWN | DONE, no edit needed | whatif.spec 12/12 on three projects |
| X2 | Text ≥ 16 px on the screens touched | WRONG | DONE | Found: `.choice-note`, `.rates` and `.change-list` were 14 px. Now 16 px (`--fs-body`), and the e2e asserts it |
| X3 | 200 % text in phone portrait | WRONG (after the size fix) | DONE | The rates table pushed `.home-grid` 8 px sideways at 360 px. Fixed with `.rates th { overflow-wrap: anywhere }`; a probe confirmed 328/328; e2e passes |

## 2. What I changed this session (on top of the interrupted work)

- **Honesty bug, `src/sim/founders.ts`**: `founderStartVaried` was true for any founder whose loci were not 50, so an evolved saved specimen was labelled "(varied founders)". It is now `founderStart: 'neutral' | 'varied' | 'carried' | 'unknown'`. `'varied'` means the loci re-derive exactly from this dish's Varied/Diverse draw (`isVariedDraw`). `'carried'` means the founder was added with a genome it already had. The words are in `strings/modes.ts` `founderStartText`.
- **`src/ui/strings/modes.ts`**: new wording for 'carried' ("added already carrying these traits (for example as a saved specimen) … did not evolve in this dish").
- **`src/ui/panels/AdvancedEvolution.tsx`**:
  - The empty-changes line was "this dish still has the setting it started with", which can be false once the command log is trimmed. It now reads "No changes recorded while this dish ran."
  - The Undo line now says Undo rewinds "your latest change", because Undo is one level.
- **`src/ui/views/NewDish.tsx`**:
  - Founder counts are pluralized ("24 Sprinters"; the Diverse line reads "2 Sprinters (1 with Reserve chamber …)").
  - The Content disclosure always renders its controlled region, with a reading line while it loads, so aria-controls never points to a missing id.
  - The registry line no longer blinks away while a new preview is computed.
- **`src/ui/styles.css`** (P2.2 block only): 16 px for choice notes, the rates table and the change list; `overflow-wrap: anywhere` on rate labels.
- **`src/ui/state.ts`** (shared, additive; this rewrites the P2.2 builder's own function):
  - History's evolution lines are re-inserted at their tick when the 60-line rolling event feed drops them, so a recorded change stays listed while the log holds it.
  - `dishInfo.mutationPreset` now follows the snapshot's setting, so What if? Details and More never show the preset the dish opened with.
- **Tests**:
  - `tests/sim/founders.test.ts`: founderStart assertions, plus a new test showing that a carried genome is never called varied in any mode.
  - New `tests/sim/founders-words.test.ts`, with 9 tests covering the labels, rates rows, pacing, registry line, module-source words, founder-start words, a Diverse dish end to end through `buildInspector`, and a specimen in an Identical dish.
  - `tests/e2e/new-dish.spec.ts`: 16 px checks, the Lab tray at 200 %, a pause before History, and longer timeouts.
- I formatted only files I own with prettier.

## 3. Files of this assignment (all uncommitted)

Owned:
- `src/sim/founders.ts`
- `src/sim/mutation.ts`
- `src/ui/views/NewDish.tsx`
- `src/ui/panels/AdvancedEvolution.tsx` (new)
- `src/ui/strings/modes.ts` (new)
- `tests/fixtures/registry-imports.test.ts` (new)
- `tests/sim/founders.test.ts`, `founders-presets.test.ts`, `founders-newdish.test.ts`, `founders-words.test.ts` (new)
- `tests/e2e/new-dish.spec.ts` (new)

Shared, additive:
- `src/sim/commands.ts` (setMutationPreset, founderDraw/origin 2)
- `src/worker/protocol.ts` (newDishPreview, RegistryInfo, NewDishPreview, DishInfo.registry, SnapshotMsg.evolution, EntityInspect.founderOrigin)
- `src/worker/host.ts` (preview, registryInfo, snapshot evolution, override validation)
- `src/worker/client.ts` (newDishPreview)
- `src/worker/snapshot.ts` (founderOrigin)
- `src/persistence/saveFile.ts` (meta.registry/evolution, unsupported-module refusal)
- `src/ui/state.ts` (evolution signal, feed, setEvolutionPreset, newDishPreview)
- `src/ui/views/DishScreen.tsx` (EvolutionSheet, tray closes under sheets)
- `src/ui/panels/MoreSheet.tsx` (world line, Evolution button)
- `src/ui/panels/Inspector.tsx` (founder-start and module-source lines)
- `src/ui/styles.css` (P2.2 block)

The other modifications in those shared files, and the files not listed here, belong to the observe (P2.8) builder.

## 4. What each test proves

- **registry-imports (4)**:
  - An unsupported module is refused by name, with nothing built and the open dish untouched.
  - A genome with a module missing from its registry is refused, and so is a registry that disagrees with its manifest.
  - A changed build registry never touches an old save's registry, genomes, candidates or branches, its hash, or its future.
  - Export meta carries the world's registry and evolution setting (forged values are ignored), and older files without it still load.
- **founders (16)**:
  - CT numbers.
  - Identical, Varied and Diverse exactly as specified, checked against a draw oracle written from SPEC §8.6.
  - The distributions: Varied values are even over 45–55; about 10 % of 3,000 eligible founders get a module, uniform over E01/E03/E05; a seeded E03 varies the dormancy locus.
  - No gain is given when none is legal.
  - Add Life follows the same rule.
  - Determinism per seed.
  - founderSummary counts.
  - Origin sources (creation, inherited-creation, mutation, introduced, unknown after compaction).
  - Founder start (neutral, varied, carried, unknown).
  - The inspector payload carries the origin.
- **founders-presets (5)**:
  - CT §12.8 rates and SPEC §8.7 63 %.
  - A timestamped command with presetFrom; unchanged and unknown are rejected.
  - 16 % draws after a change.
  - 1× vs 4× give an identical change tick, lineage and hash, with a per-birth rate oracle before (8 %) and after (16 %).
  - Undo, the History intervention mark, and save/reload.
- **founders-newdish (3)**:
  - The preview equals the dish Create builds (founders, ledger, patches, rates, registry) and creates no dish.
  - Unknown settings build nothing.
  - DishInfo.registry, and the snapshot evolution before and after a change and after Undo.
- **founders-words (9)**:
  - Every label and number the panels show.
  - The honest origin words end to end from a real inspector payload.
- **e2e new-dish (2 × 3 projects)**: the Done-when journey, plus axe, 48 px targets, 16 px text, no sideways overflow, and 200 % text in phone portrait and landscape.

## 5. Commands and results (this session)

- `npx vitest run` (my 5 files + inherited-variation + neutral-founders): **6 files, 76 tests passed**. This was the first check of the interrupted work.
- `npx vitest run` (my 5 + inherited-variation, neutral-founders, tests/worker, tests/persistence, tests/sim/view-switch, experiments/journal-and-words, experiments/exp-c-reserve, sim/lineage-panel), after all edits: **Test Files 20 passed (20), Tests 206 passed (206)**.
- `npx tsc -p tsconfig.json --noEmit`: exit 0, after the last edit.
- `npx eslint` on the 21 owned or touched files: exit 0, after the last edit.
- `E2E_PORT=4191 E2E_OUTDIR=tmp/dist-founders npx playwright test tests/e2e/new-dish.spec.ts tests/e2e/whatif.spec.ts`, first run: 16 passed, 2 failed.
  - Phone-portrait 200 %: `.home-grid` overflowed sideways by 8 px because of the rates table. Fixed.
  - Desktop journey: hit the 90 s timeout under load average ≈ 10. Hardened.
- `E2E_PORT=4191 E2E_OUTDIR=tmp/dist-founders npx playwright test tests/e2e/{new-dish,inspector,save-reload,lab-tools,whatif}.spec.ts`: **42 passed (58.1m)**, all three projects.
- `E2E_PORT=4191 … npx playwright test tests/e2e/new-dish.spec.ts`, after the last UI edits: **6 passed (6.1m)**.
- Port 4191 was stopped after each run, and I removed the build folder `tmp/dist-founders` at the end.

## 6. Not done, and why

- **Mode labels on Home's Continue card and the Saved dishes list.** These need the slot index to keep `meta.evolution` and `meta.registry`, the way it already keeps `meta.variant`. That is `src/persistence/store.ts`, `Home.tsx` and `Saves.tsx`, which are not mine. Suggested follow-up: copy both meta fields into SlotInfo and show `worldModesLine` under each slot.
- **No e2e selects a Diverse founder in the canvas to read "Present at creation" in the Inspector.** Finding a seeded founder's screen position is brittle. founders-words proves the payload → words path end to end, and the chip itself is covered by `tests/experiments/journal-and-words.test.ts`.

## 7. Bugs noticed elsewhere (not fixed; not my files)

- `src/ui/panels/CompareText.tsx:41` ("Evolution setting: accelerated") and `src/ui/strings/experiments.ts:193` ("evolution setting accelerated") show raw preset ids instead of the UX §3.3 labels. Fix: use `evolutionLabel` from `strings/modes`.
- `src/worker/host.ts:99` `registryLabel` hard-codes 17 modules and returns "Standard Evolution" for a full registry. A registry is not an evolution setting. Unify on `registryInfo().partial` (catalog size from content).
- `src/sim/commands.ts` `applyCommand` increments `pendingInterventions` even for a command with accepted 0, for example a refused Add Life. The chart then marks a change that changed nothing. The Evolution sheet never sends an unchanged preset.
- `.topbar .time` in the top strip uses 14 px (`--fs-small`), below the 16 px rule. This predates this wave.

## 8. Proposed decisions

- PROPOSED DECISION: How Varied and Diverse founders are drawn.
  - Draws are keyed by the founder's birthId, its introduction sequence: `det(seed,'founder.init',birthId,locus)`.
  - Diverse uses the reserved `founder.module` stream: key (birthId, 0) for the 10 % roll and (birthId, 1) for the uniform pick among `eligibleGains` under the world's recorded registry.
  - The 10 % is an independent chance per eligible founder (D04 §3), not an exact count.
  - The module is chosen before the loci, so a seeded E03 also varies the dormancy locus.
  - This applies to recipe founders and Add Life alike. Specimens keep their saved genome.
- PROPOSED DECISION: No evolution-rules or schema bump for P2.2.
  - Diverse was not selectable anywhere before P2.2, so seeding modules changes no existing save.
  - Identical and Varied draws are bit-identical to wave A, so existing hashes are unchanged.
  - Save-meta fields are outside the checksummed state.
- PROPOSED DECISION: What a preset-change command records and accepts.
  - `setMutationPreset` records `presetFrom` in its result, and the log's `targetTick` is the time it took effect.
  - Choosing the preset already in effect is accepted 0 ('unchanged'): no undo point and no experiment end.
  - An unknown preset is rejected.
  - Proposals already drawn keep their draws.
- PROPOSED DECISION: When a registry counts as partial. A world is "Core prototype — quantitative evolution" while its recorded `enabledModules` has fewer entries than this build's module catalog (17 content records).
- PROPOSED DECISION: How imports with unsupported modules are refused.
  - A recorded module outside `IMPLEMENTED_MODULES` → SaveFileError 'content' that names the ability.
  - A genome module missing from the recorded registry → 'integrity'.
  - A registry/manifest mismatch → 'content'.
- PROPOSED DECISION: The inspector separates how a founder's traits and modules were set.
  - Founder traits: set by this dish's founder mode ('varied'), or already carried by an added genome ('carried').
  - Modules: 'creation', 'inherited-creation', 'mutation' (nearest recorded gain), 'introduced', or 'unknown' after compaction. It never guesses.
- PROPOSED DECISION: Evolution-setting changes are listed in History → What happened at their tick for as long as the command log holds them, and they mark the charts like any intervention.
- PROPOSED DECISION: Where the Advanced panel lives.
  - During play: More → "Evolution settings (Advanced)", a sheet with the setting in effect, its rates, the recorded changes, the founder mode (fixed; "New dish…" to try another) and the registry.
  - In New Dish: the same rates behind "Show the chances per offspring (Advanced)".
