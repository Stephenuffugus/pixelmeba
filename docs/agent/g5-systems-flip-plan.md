# The Phase 5 systems flip: the lead's working plan

Written 2026-10-14 during the wave 11 integration. The task is in docs/agent/g5-wave-11.tasks.js.txt, "THE SYSTEMS FLIP"
(lines 223–263). This file adds the code-level details found while reading the code. Order: wave 11 committed, then
this flip (D-0121), then the wave 12 fill and launch (D-0122).

## Code

1. **content/manifest.json.**
   - enabledSystems gains 'barriers', 'climate' and 'devices' (sorted as the file keeps them).
   - enabledStructures gains S01–S12 (with BEAD, STONE and WALL; sorted).
   - Nothing else changes: no species, module, material, signals, rivalry or silicate.
2. **src/sim/content/implemented.ts.**
   - IMPLEMENTED_STRUCTURES = ['S01', …, 'S12'] (comment: since the systems flip, D-0121). Re-pin
     tests/content/structures-p5.test.ts:82, which pins `[]`.
   - New `IMPLEMENTED_SYSTEMS: readonly SystemFlag[]`, sorted:
     - the v1.0 systems: chemistry, core, enzymes, film, foodObjects, fungi, parasites, viruses;
     - barriers, climate and devices;
     - silicate (wave 10), signals and rivalry (wave 11, both integrated and verified, D-0120).
     - Not equipment or developmental (Phases 6 and 7). SYSTEM_FLAGS is in src/sim/fields.ts.
3. **src/persistence/saveFile.ts, the import gap (D-0119).** It follows the P2.2 module refusal: kind 'content',
   "… which this version of Pixelmeba cannot simulate. Nothing was loaded." The module checks are at about lines
   302–330, by name and before the definition schema, so a newer build's unknown id is still named. Add, in the
   same style:
   - every raw `c.manifest.enabledSystems` entry not in IMPLEMENTED_SYSTEMS, checked before ManifestSchema, so an
     unknown future flag is named rather than reported as "Manifest: invalid";
   - every raw `enabledStructures` entry in neither STRUCTURE_RECORD_IDS (grid.ts) nor IMPLEMENTED_STRUCTURES;
   - every raw species `nativeAbilities` entry not in IMPLEMENTED_NATIVE_ABILITIES, naming the species and the
     ability, checked before SpeciesSchema.
   - The line is "implemented", not "enabled": a dish keeps its recorded ruleset.
4. **Registries in the test helpers.** After the flip the shipped manifest already holds barriers, climate,
   devices and S01–S12, so `[...shipped.enabledSystems, 'barriers', …]` repeats entries. Dedupe once in
   tests/helpers/registry.ts `registryWith` (each list in the patch: `filter((x, i, a) => a.indexOf(x) === i)`;
   order kept, sorted inputs stay sorted). Then check barrierRegistry and resterRegistry in tests/helpers/world.ts
   and `git grep -n "enabledSystems, '" tests` for other hand-built lists.
5. **Tests that save and load dishes recording a still-unimplemented ability**: A03 LOW_LIGHT_CURVE, A04
   MIXOTROPHY, F03 TRAP, P06 RADIUS_CAPTURE, P09 DETRITUS_FALLBACK and P10 HANDLING.
   - Find them with `git grep -ln "loadSaveFile\|buildSaveFile\|'save'" tests`, then look for registries naming
     those species.
   - Known: tests/persistence/phase5-import.test.ts (B09, A04, P10, F03, F04; `enabledSpecies: SPECIES`).
     Possibly also structure-determinism (`enabledSpecies: species`).
   - Fix by narrowing the species list where the test does not need them. Otherwise use
     `vi.mock('…/implemented', importOriginal)` appending the abilities, with the comment "until wave 12/13
     implements it" (D-0122's round-trip ruling uses the same mock).
   - DishHost `create` from `{kind: 'state'}`: check whether it runs the import checks. If it does not, it needs
     none.
6. **tools/content-validate.ts** (structure-render-worker's note):
   - TILE_FRAMES gains `device: { frames: 13, states: 's05, s06, s07, s08_0–3, s09_off/on, s10_off/on, s11, s12' }`;
   - ALL_TILES gains `{ owner: 'devices system', tile: 'device' }`;
   - enabledTiles adds it when enabledSystems has 'devices'.
   - Then content:validate requires the 13 frames. tests/render/phase3.test.ts and structure-layers.test.ts pin
     'device' apart; re-check them.
7. **New tests**, tests/persistence/import-implemented.test.ts. Use the host-level pattern of phase5-import (the
   current world is untouched after a refused import). Crafted dishes:
   - one naming 'equipment' (a known unimplemented system), refused with its sentence;
   - one naming an unknown future system id, refused by name;
   - one naming a made-up structure id;
   - one recording P10 (HANDLING).
   - Both corpora still load, and a wave 10 and a wave 11 fixture dish (tests/e2e/structureFixture.ts and
     regionFixture.ts build them) load.
8. **One saves verifier (effort high, Agent tool)** reads the flip diff before the commit and reports to
   docs/reports/reviews/g5-flip/saves-verify.md. Put the OWNER_CONTEXT preface on its prompt.

## Checks

- `npm run content:validate -- --write`. The contentHash moves (the manifest lists only); record old → new in
  D-0121. The WET_BRUSH record is now listed by the Field Guide.
- **The fence must not move**: g2-replay, rc1-replay, trajectory-fence ×4, conservation-closed-lid, determinism and
  determinism-g3. A moved digest is a leak, not a re-record.
- **Fence additions** for one cycle dish and one barrier dish. `tools/fence-update.ts --add <recipeId>` takes only
  a shipped recipe id, with no command schedule and no --reason. Recipes can carry structures, devices and
  environment overrides (D-0111). Options:
  - (a) two test-only recipe files plus a documented path in the tool (`--recipe-file`?);
  - (b) fence entries realized from a test recipe under tests/fixtures/.
  - Do not ship new content recipes for this (they would appear in the game). Say which option was used, in
    D-0121.
- `npm run check` (about 72 min) and `npm run art:build -- --check`.
- **Journeys on desktop and phone-portrait** (`E2E_PORT=4300 E2E_OUTDIR=tmp/lead/e2e-dist npx playwright test
  <files> --project=desktop --project=phone-portrait`):
  - structures-environment (remove its test.skip), structures, region-charts, new-dish, lab-tools, field-guide,
    a11y-screens.
- **D-0104 checks.**
  - An rc1 save loads and shows no Build group, no wetting brush and no light or drying controls.
  - A new dish shows them.
  - The Field Guide lists S01–S12.
  - Perf: tick p95 with 512 edges and 256 devices into docs/reports/perf-g5.md (the wave 10 probe
    tmp/barrier-transport-perf/perf.ts, or a new scratch script).
- **WORKLOG.** Tick P5.1 and P5.2 only if every item of their BUILD_DIRECTIVE Build lists (683–695) is met, with the
  D-0104 checks (D-0119; the canopy item counts as built because the factor is keyed on CANOPY). Otherwise write
  dated notes.
- **D-0121**: the contentHash old → new, the fence result, the two added entries and how, IMPLEMENTED_SYSTEMS, and
  the import rule.

## Then the wave 12 pre-launch (docs/agent/g5-wave-12.tasks.js.txt, lead-reviewed in f51e912)

1. Fill the 12 `<lead: …>` placeholders: wave 11 as built (D-0120), the flip as built (D-0121), the post-flip
   manifest and contentHash, the D-number (D-0122), and the resterRegistry form after the dedupe.
   - Check: `grep -n "<lead: " docs/agent/g5-wave-12.tasks.js.txt | grep -v "as built — …>"` prints nothing.
   - Fix structures-art-audio item 1 "the same 14 frames": it is 13 frames (D-0120).
   - Carry D-0120's "to wave 12's structures-art-audio" item (the contrast-audit edge-glyph rows) into that task.
2. **D-0122**, the lead's rulings on the writer's PROPOSED DECISIONs (all accepted):
   - one stage of three;
   - file ownership as the header table: e2-light-algae owns movement, intake, births, species, events and
     constants (item 0 first) and writes hooks H1, H2 and H3 for e3-predation; e3-predation owns contacts,
     phenotype (debrisFeeder only), debrisFeeder, phase5State (handling refusals) and the new handling.ts;
     commands.ts has no owner;
   - A04's mode is set at its first stage 4, not at inoculation (climate.ts header: "stage 1 reads no light"; the
     reload canopy recompute). MODE_NONE 0, PHOTO 1, SUGAR 2; ≥ 0.35 Photo and ≤ 0.25 Sugar, both inclusive; a
     newborn's mode is nextMode(the daughter's light, the parent's mode); no modeSwitch event at birth or init;
   - handling: the start tick counts as contact; a break zeroes need and progress, with no new attempt that tick;
     completions enter the claim pool with KIND_ATTACK priority; EPS 1e-9;
   - P06 radius: a fixed Euclidean 1.0, inclusive. P09 DETRITUS_FALLBACK goes through E08's route. Three
     handling-progress import refusals;
   - round trips: tests vi.mock @sim/content/implemented with importOriginal and append their own abilities;
   - region pins move to p5.4b and the founder-chain validator to p5.4a (wave 14);
   - gate_click is a UI cue, played once per "Show gate" and per accepted shutter toggle, never by the tracer.
   - Carried to wave 13: snapshot.ts sugarSourcesOf excludes A04; the inspector mode and handling lines go to
     org-ui; STATE overrides the runner PRE line about implemented.ts, as in wave 10.
3. **Free the ports** 4271 4272 4273 4274 4390 4391 4394 4396 4397 4398 (`lsof -t -i :PORT | xargs -r kill`).
4. **Backup loop.** `kill "$(cat tmp/lead/backup-11.pid)"`, then start the wip/g5-wave-12 loop
   (`nohup tools/lead/backup-loop.sh wip/g5-wave-12 "wip: wave 12 in flight"`) and check that the pid file holds
   the loop's own pid.
5. **Run file.**
   - Build it with tools/lead/build-run-file.py: keys e2-light-algae, e3-predation, structures-art-audio; runner
     docs/agent/g5-runner-ft.workflow.js.txt; the owner context from line 355 of
     docs/agent/g5-wave-10.run.workflow.js.txt (between the backticks).
   - Add `verifyGroups: [["e2-light-algae","e3-predation"],["structures-art-audio"]]`.
   - Commit, then launch through the Workflow scriptPath (a scratchpad .js copy).
6. Update RESUME.md and memory.
