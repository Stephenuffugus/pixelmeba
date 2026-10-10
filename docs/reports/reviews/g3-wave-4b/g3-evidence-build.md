# G3 evidence build report (wave 4 stage 2, g3-evidence; resumed run)

Date: 2026-10-10, 13:29–14:30 UTC.

This run resumed the work of the previous g3-evidence builder, which the lead stopped at 13:20 for the codespace refresh. That builder wrote
determinism-g3, launch-ecology, the finished tune tables, and the D-0015 candidate runs in tmp/evidence/. I audited that work, re-ran it, and
completed what was missing. I made no git operations and no edits under src/ or content/.

## Audit of the inherited work

| Item | State found | Action |
|---|---|---|
| tests/fixtures/determinism-g3.test.ts | Complete, 9 tests, unverified after the stop | Re-ran: pass. tsc found one type error in it (`buildSaveFile` meta lacked `recipeId`); **fixed** (line 421) and re-ran: pass |
| tests/e2e/launch-ecology.spec.ts | Complete; its desktop run was killed at the stop | Re-ran on port 4263: **1 passed (12.2m)** |
| docs/reports/tune-g3.md | Tables complete (sim:tune finished 13:18); analysis "Not written yet" | **Wrote** Observations, the D-0015 re-measurement and Proposed recipe revisions from the tables. The tune was not re-run |
| D-0015 re-measurement | Done in memory by the previous builder (tmp/evidence/d0015-remeasure.ts, d0015.json, d0015-v1.err, d0015-table.md); not reported | Verified that the control equals the tune's six FIRST_DISH_V1 hashes; written up in tune-g3.md |
| EXPANSION_RESPONSE G3 draft | Missing | **Written** |
| Gate checklist runs | Missing | **Ran** in six batches plus a re-run (all pass) |
| Opening-loop screenshots (optional) | Missing | **Taken** (desktop) |
| This report | Missing | This file |

## Checklist

### Build
- **DONE: tests/fixtures/determinism-g3.test.ts.**
  - The world is a hand-built Phase-3-heavy Water Garden (`build()`, lines 63–112). It has:
    - film: Velvet on gel, and E10 Sprinters;
    - fungi: F01, and an F02 chain with transport links (labelled test state);
    - V01 phage on a Sprinter colony, and X01 beside A01;
    - enzymes: B06, B07 and B08 on their deposits, plus M09;
    - an M11 wafer, and an M10 pellet placed in play;
    - E04, E07, E10 and E12 carriers.
  - The player session (`PLAYER`, line 122) includes a Sample taken at MID and transferred (`sampleGestures`, line 153).
  - Proofs:
    - 4× through the worker host with the FakeClockHost pattern (`playerSessionAt4x`, line 192) equals a 1× host replay (test at :363) and headless 1-tick and 4-tick replays (:380).
    - Save with the sample **held** → `loadSaveFile` → Transfer → continue (:412).
    - The host's own save opened as a new dish (:434).
    - Negative controls (:467, :475, :483).
  - All comparisons are relational; no literal is pinned.
  - Proof runs: standalone 9/9 (102 s); b6 9/9 (52.6 s); b7 after the type fix 9/9 (52.8 s).
- **DONE: tests/e2e/launch-ecology.spec.ts (W6-17)**, test at line 183. The journey:
  1. New Dish → 'Empty Gel Colony' → Create. The dish opens paused, in the Lab, with the Life tray open; the view toggle is never pressed.
  2. Add Velvet on gel, Threadlace, Cordweaver, Brothmaker.
  3. A protein dose, an M10 pellet, a salt stroke.
  4. Sample → Take → Transfer.
  5. Clean water 50 %.
  6. More → Field Guide → "cordweaver" → Back (the same paused view, sim time and worker hash).
  7. Run at 4×.
  8. The inspector shows film (`film-here` > 0), links (`fungal-network`, `fungal-transfer`) and the reaction ledger (`reaction-protein`, 16 px).

  Axe is checked at 8 points. The worker is reached only through the Worker wrapper (watchWorker, workerHash).
  Proof: `E2E_PORT=4263 E2E_OUTDIR=tmp/dist-evidence npx playwright test tests/e2e/launch-ecology.spec.ts --project=desktop` gave `1 passed (12.2m)`.
- **DONE: Tuning (W6-18).**
  - docs/reports/tune-g3.md holds the full `--recipes <all 18> --seconds 600 --extend 1200 --presets standard` run (2,326 s, under 45 min, so `--extend` was not reduced).
  - The analysis is at :3687, the D-0015 re-measurement at :3794 and the proposals at :3845.
  - D-0015's three proposals plus 1 + 3 were measured in memory through `tuneSeed` on deep-copied packs (patchedRawPacks plus validateContent); content/ was never edited.
  - The control run reproduces the tune's six FIRST_DISH_V1 hashes at 600 s.
  - Timings are inflated (load 1.8–7.4) and are left to the lead.
- **DONE: EXPANSION_RESPONSE G3 draft** (docs/EXPANSION_RESPONSE.md):
  - §1 build identity (:13): manifest versions, contentHash, SCHEMA_VERSION 4, PROTOCOL_VERSION 2, atlas, commit `<lead>`.
  - §2 scope table (:33): 19 species, E01 and E03–E10 and E12, systems, materials, habitats, structures, tools, recipes, cards.
  - §3: G3 decisions D-0035…D-0064.
  - §4 G3 (:126): one row per gate item with command, pass line and runtime; the Appendix A draft (:141); the batch commands; the relationship table at :237 (summary plus all 232 positive relationships, from a regeneration under the current contentHash).
  - §4b/§4c/§4d keep the G2, G1 and G0 evidence.
  - §5: the journey, the seed report and the opening loop.
  - §7 (:411): performance from perf-g3.md, marked "provisional: the lead re-measures on a quiet machine".
  - §8 (:458) owner decisions:
    - D-0051, D-0055, D-0056 and D-0058 owner-review items;
    - D-0060, D-0061 and D-0062;
    - audio manual listen (tools/audio-preview.html) and reduced motion;
    - no Android haptics until P4.10;
    - perf-g3 device and rules items;
    - curated dishes that end empty;
    - open PROPOSED DECISIONs from docs/reports/reviews/g3-wave-4/;
    - the sugar-sources copy finding.

  Every gap is marked `<lead>`.
- **DONE: Gate checklist (plan §5 with W6-19).** Each named file was run in targeted batches, and every one passed (EXPANSION_RESPONSE §4 table):

  | Batch | Content | Files | Tests passed | Wall |
  |---|---|---:|---:|---:|
  | b1 | determinism, fence, saves | 13 | 98 | 959 s |
  | b2 | gate fixtures | 4 | 28 | 207 s |
  | b3 | module fixtures | 9 | 113 | 141 s |
  | b4 | experiments and curated | 18 | 124 | 772 s |
  | b5 | P3.1–P3.12 task tests | 28 | 275 | 599 s |
  | b6 | determinism-g3 + closed lid + G0 determinism | 3 | 14 | 295 s |
  | b7 | determinism-g3 after the fix | 1 | 9 | 55 s |

- **DONE (optional): opening-loop screenshots (W6-15).** tools/review-opening-loop.mjs was copied to tmp/review-opening-loop-g3.mjs, pointed at port 4263
  and docs/reports/img/g3/. That gave 11 desktop images and docs/reports/opening-loop-g3.md. The committed G1 images are untouched.

### Done when
- **DONE**: determinism-g3 passes (9/9, three runs) and launch-ecology passes on desktop (1 passed).
- **DONE**: tune-g3.md is written, including the D-0015 re-measurement.
- **DONE**: the EXPANSION_RESPONSE draft has §1, §2, §4 (G3), §7 and §8 with real commands and numbers. Every gap is marked `<lead>`.
- **DONE**: bugs are reported below, not fixed. The only fix is the type error in my own test file.
- **DONE**: `npx tsc -p tsconfig.json --noEmit` exits 0, and `npx eslint tests/fixtures/determinism-g3.test.ts tests/e2e/launch-ecology.spec.ts` exits 0.
- **DONE**: g2-replay, the trajectory-fence files, conservation-closed-lid and determinism pass (b1, b6), as do my tests. The journey is axe clean, with targets ≥ 48 px (`expectReachable`) and ledger text ≥ 16 px.

## Files created or changed (all mine)
- `tests/fixtures/determinism-g3.test.ts`: inherited; one-line fix at :421 (`recipeId: null`).
- `tests/e2e/launch-ecology.spec.ts`: inherited, unchanged.
- `docs/reports/tune-g3.md`: analysis section written. The tables are the tool's output, unchanged.
- `docs/EXPANSION_RESPONSE.md`: the G3 draft. The G2 edition is preserved inside it as §4b–§4d and in git history.
- `docs/reports/opening-loop-g3.md` and `docs/reports/img/g3/desktop-01…11.png`: new.
- `docs/reports/reviews/g3-wave-4b/g3-evidence-build.md`: this report.
- Scratch, not for commit: tmp/ev/ (batch logs and JSON, the regenerated tmp/ev/relationships-g3.md, the draft parts), tmp/review-opening-loop-g3.mjs, and the previous builder's tmp/evidence/.

## What each test proves, and how it fails without the mechanism
- **determinism-g3**: one Phase-3-heavy session reaches the same stateHash through every path:
  - host 4× with irregular frames (up to 10 ticks per frame);
  - host 1× (1 tick per frame);
  - headless stage-1 queue replays in 1-tick and 4-tick chunks, with stateHash and serialize interleaved;
  - a save file taken with the sample held, then load, Transfer and continue;
  - the host's own save as a new dish.

  How it would fail without the mechanism:
  - The non-vacuity block asserts that every mechanism acted in the replay. In b6: film max 5.43 C, fungal transfer 0.04 C/s, 4,461 infected organism-ticks,
    3,805 drain ticks, all three conversions > 0, 2.47 C released from objects, an anchored E04 carrier, 5 adhesion links,
    320 moving E07 ticks and 22 lyses. Removing any of those systems from the dish fails that block.
  - Three negative controls prove that the hash comparison is sensitive to the gestures under test:
    - the Transfer moved by one cell;
    - Clean water one tick later;
    - a save with the held sample dropped, which refuses the Transfer and ends elsewhere.

    A broken held-sample save path would end like the third control.
  - No src mutant was run (no src edits allowed in this assignment); the controls play that role.
- **launch-ecology**: each gesture must change the worker's hash (an `expect.poll(...).not.toBe(previous)` after each one), so a gesture that never reached the worker fails.
  Opening the Field Guide and pressing Back must leave sim time and the worker hash unchanged, so a guide that ran or edited the dish fails.
  The inspector assertions read measured values: film > 0, the network sentence, transfer rows, and a protein ledger row "since the dish began".

## Commands and results (pass/fail lines)
```
npx vitest run tests/fixtures/determinism-g3.test.ts                       → Test Files 1 passed (1) · Tests 9 passed (9) · 102.31s
E2E_PORT=4263 E2E_OUTDIR=tmp/dist-evidence npx playwright test tests/e2e/launch-ecology.spec.ts --project=desktop → 1 passed (12.2m)
b1 npx vitest run tests/fixtures/{determinism,deterministic-state,g2-replay}.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/persistence/migration.test.ts tests/sim/history-debris.test.ts tests/sim/world-stores.test.ts tests/persistence/{adhesion-import,stale-prey}.test.ts
   → Test Files 13 passed (13) · Tests 98 passed (98) · 958.99s
b2 host-specificity, transport-obstacles, conservation-all-pools, relationship-matrix → 4 files, 28 passed, 0 failed (207 s)
   conservation-all-pools: 10000 ticks; worst rel. error C 6.13e-15, N 7.05e-14, |M| 0; abs residual C 3.638e-11, N 8.117e-11
   relationship-matrix: 711 rows in 33.1 s, all pass
b3 module-accounting, shared-budget, module-e04/e06/e07/e08/e09-e10/e12, stage8-order → 9 files, 113 passed, 0 failed (141 s)
b4 tests/experiments tests/recipes/curated.test.ts → 18 files, 124 passed, 0 failed (772 s)
b5 chemistry, habitat-presets, attachment, film, fungal-branching, dusk-suitability, relationships-film, relationships-w2, host-specificity, predation-matrix, parasite, phage, siltworm-crossing, tools, sample-transaction, fungal-transport, food-objects, producers, guide, badges, relationships (worker), tests/audio, tests/perf/stress-shape
   → 28 files, 275 passed, 0 failed (599 s)
b6 determinism-g3, conservation-closed-lid, determinism → 3 files, 14 passed (295 s)
   determinism-g3: 4× d76ceab90c3cf733 == 1× d76ceab90c3cf733 == headless d76ceab90c3cf733 == reload (held sample, tick 402) d76ceab90c3cf733
   conservation-closed-lid: worst rel. error C 5.220e-15, N 1.080e-13; 731 births, 320 deaths
   determinism: endpoint 9ad8c74f0e0f828a at tick 6000; alive 659
b7 determinism-g3 (after the recipeId fix) → 1 file, 9 passed (55 s)
npx tsx tools/relationship-matrix.ts --out tmp/ev/relationships-g3.md → 711 rows, 711 pass, 0 fail (21.8 s)
npx tsc -p tsconfig.json --noEmit → exit 0 (first run: 1 error in determinism-g3.test.ts:421, fixed)
npx eslint tests/fixtures/determinism-g3.test.ts tests/e2e/launch-ecology.spec.ts → exit 0
node tmp/review-opening-loop-g3.mjs 1440 900 desktop (preview of tmp/dist-evidence on 4263) → EXIT 0, 11 images
```
Port 4263 was stopped before and after each browser run (`lsof -t -i :4263 | xargs -r kill`).

Every run above happened with perf's in-flight hash-neutral src/sim edits in the tree: entities, fields, intake, movement, transport, founders, fungi and snapshot. Nothing failed, so no re-run was needed for that reason.

## FENCE
No fence value moved, and none of my work could move one: tests and docs only, no src or content edits. b1 ran all four trajectory-fence
files and g2-replay: all pass. I created no recipe, so `fence-update` was not run.

## Bugs and risks noticed elsewhere (reported, not fixed)
1. **MINOR: stale committed header in docs/reports/relationships-g3.md.** It says contentHash `e5bf702e…`; the current hash is `8a004f51…`. This is the open item 7 of
   docs/reports/reviews/g3-wave-4/wave-verify-2.md. A regeneration in this session (tmp/ev/relationships-g3.md) differs only in that
   header line: 711 of 711 rows, identical. The lead copies it over or re-runs `--out docs/reports/relationships-g3.md` (D-0063).
2. **MINOR copy: the "Sugar here can come from …" line** (src/ui/strings/shortcuts.ts:54, data from src/worker/snapshot.ts:611
   `sugarSourcesOf`) lists every species in the world's recorded list.
   - So the Garden says "Cordweavers’ enzyme" with no Cordweaver present.
   - An E01 Sprinter is never named.
   - See docs/reports/opening-loop-g3.md and EXPANSION_RESPONSE §8 item 27.
3. **Ecology (an owner question, not a code bug).**
   - Every enzyme dish starves its producers within 120–180 s: EXP_A, EXP_202, EXP_203, SHARED_LUNCH by 540 s, and the curated L303 Public Kitchen (new).
   - The curated L301, L303 and L306 are empty by 540–600 s on 6/6 seeds; L304 is empty by theme.
   - In the producer dishes the last organism dies with 259–285 C of food left.
   - See tune-g3.md and EXPANSION_RESPONSE §8 items 12 and 24.
4. **Not a bug.** BROKEN_CATALYST_V1 and SHARED_LUNCH_V1 give identical tune hashes. Their recipe bodies are identical, the tuner uses the development seeds, and the
   recipe id is not hashed. EXP_204 adds its breaker to copy B only.
5. **Tooling note.** Under this harness, vitest's default reporter prints only totals and drops every test's console output. To capture
   evidence values, batches need `--reporter=verbose` (plus `--reporter=json --outputFile.json=…` for per-file counts). The lead's gate
   run should use the same flags if it wants the printed numbers.
6. **D-0053 wording vs. data.** D-0053 says "an object holds only its kind's pools (pellet: sugar; wafer: starch)". The relationship matrix's
   CT-derived row and the food-objects tests show the M11 wafer holding starch 6 **and protein 4**. The code and tests agree with CT, so
   only the decision text is narrower. The lead may want to amend D-0053's wording.

## Proposed decisions
- **PROPOSED DECISION: keep FIRST_DISH_V1 revision 1 at G3 (D-0015 re-measured).**
  - The D06 targets are met on 6/6, and the G2 ecology is unchanged on 5/6 seeds.
  - No candidate keeps Recyclers on most seeds without new seed-to-seed swings (candidate 3: 0–72; 1 + 3: 0–252).
  - Candidate 2 (debris 0.50 C, N 0.05; measured for the first time) is the most even (peak 14–16, extinct 2/6), but it only delays extinction.
  - If the owner wants persistent Recyclers, take candidate 2 further with a 1,200 s re-measure.
- **PROPOSED DECISION: G3's Appendix A determinism line comes from determinism-g3.** That is the Phase-3-heavy session: host 4× == host 1× == headless ==
  reload with a held sample. Its hash covers contentHash, so the lead re-reads it at the gate. No test pins it.
- **PROPOSED DECISION: the response doc shows the relationship table compactly.** That means the family summary with row counts, plus every positive relationship grouped by actor.
  The full 711-row table with expected and observed values stays in docs/reports/relationships-g3.md.
- **PROPOSED DECISION (owner): curated dishes that empty.** For L301 and L306, either say in the dish text that the food is finite, or a new
  revision with one renewable source, re-measured on six seeds. L303 waits on the D-0051 producer ruling; meanwhile, make its expected text
  conditional, as D-0062 did for EXP_104.
