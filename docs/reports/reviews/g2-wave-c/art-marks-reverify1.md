# G2 wave C, re-verify round 1: module marks, DORMANCY_LOCKOUT, sim-tune

Date: 2026-09-28. Adversarial re-verification of `art-marks-fix1.md` against the working tree (nothing committed; no repository file edited except this report). Scratch: the session scratchpad under `/tmp/claude-1000/…/scratchpad` (tree copies `old/` and `new/`, `hash.mts`, `e2e/make-fixture.mts`, `e2e/marks-real.spec.ts`, `shots/`). Playwright ran on port 4223 with `E2E_OUTDIR=tmp/dist-reverify-art-marks`.

**Verdict: ok = true.** No BLOCKER or MAJOR remains. The original MAJOR is fixed: in the real app, an imported simulated dish shows the engine's DORMANCY_LOCKOUT line. Five MINOR items are left for the lead: the Inspector chip line, DECISIONS.md, a small ESLint gap, ownership, and two pre-existing issues outside this assignment.

## Remaining / new problems

- **MINOR: the Inspector chip still uses the old condition** (`src/ui/panels/Inspector.tsx:225-227`). It still reads `e.dormancy.state === LIFE_ACTIVE && e.dormancy.lockoutSeconds > 0`. `dormancyChip()` (`src/ui/strings/modules.ts:35`) is exported, but nothing in `src/` calls it (`grep -rn dormancyChip src` finds only its definition).
  - What players see is already correct. `readReason`'s default branch is exactly "Active and lockoutTimer > 0", and `tests/sim/module-visuals.test.ts` checks that the two agree on all 299 lockout ticks.
  - The lead still needs to apply the one-line diff in `art-marks-fix1.md` §1 so the chip traces to the reason code (the original MAJOR asked for all 4 additions). Inspector.tsx belongs to the lead or the UI agents.

- **MINOR: DECISIONS.md is still out of date** (`docs/DECISIONS.md:174`, D-0019, not fixed; the lead owns the file). It still says "Module marks are built at runtime from art/src/layers for now; packing them into the atlas (ARCH §10.1) is a follow-up." A dated entry is needed that covers:
  - marks as atlas frames `feature/<layer>/<heading>/<frame>`;
  - E02 `glow_center` = 2 frames (a judgment call: ARCH §10.1 lists "Lantern dim/glow" under species);
  - DORMANCY_LOCKOUT derived from the clocks and never stored;
  - `restHeld`;
  - countdowns round up;
  - sim-tune counts producers by profile;
  - the chip keeps its wording.

  The fixer's proposed text in `art-marks-fix1.md` §6 is accurate against the tree.

- **MINOR: ESLint misses a template-literal dynamic import** (`eslint.config.js:107`, `tests/sim/module-visuals.test.ts:197`). ``export const m = import(`@art/src/sprite`);`` passes both the ESLint render block (`eslint --stdin --stdin-filename src/render/features.ts` reports no problem) and the test's `ART` regex, which accepts only `'` and `"`. The test comment says "Any import form".
  - Fix, checked with a scratch config that spreads the repo config: add `{ selector: 'ImportExpression[source.type="TemplateLiteral"]', message: … }` to the render block's `no-restricted-syntax`, and add a backtick to the regex's quote class (``['"`]``). Quoted literals still report the art/src message, and `import('./camera')` stays clean.

- **MINOR (ownership / process): the fixer edited files outside its ownership.**
  - The assignment listed `src/worker/*` and `src/ui/**` as other agents' files ("do not touch those"). The fixer edited `src/worker/protocol.ts:456-461` (the `DormancyInspect.reason` field) and `src/ui/strings/modules.ts:9,31-37,134,151,154-155`.
  - It also edited `src/sim/moduleView.ts:7,94-95,129` and `eslint.config.js:94-109`, which were in nobody's list.
  - The edits are small and additive. The other agents' P2.2/P2.8 additions in `protocol.ts` are intact (checked in `git diff HEAD`).
  - The lead should commit these hunks knowingly, together with the owning agents' work.

- **MINOR (pre-existing, outside this assignment; honest labels): the action chip says "Eating" when no usable food was found.**
  - In the real app, lockout carrier #1 shows the chip "Eating" alongside "No usable food for 20 s", "Food access: 0 % of its intake budget found" and "Ate last second: trace (< 0.0001) carbon".
  - Cause: `actionOf` (`Inspector.tsx:89`, unchanged from HEAD) reads `FLAG.feeding`, and `src/sim/intake.ts:321` sets that flag for any intake `Cs > 0`. `FLAG.usableIntake` needs `Cs ≥ USABLE_INTAKE_FRACTION·q·DT`.
  - This is not caused by this work. It is listed for the lead: the chip and the Resting-stage line contradict each other, so the chip should probably use the usable-intake flag.
  - Repro: import `scratchpad/e2e/marks.pixelmeba`, then tap (33.3, 65.3).

- **MINOR (pre-existing, outside this assignment): experiment observations leave out E01 secretion** (`src/sim/experiments.ts:397`). Confirmed: it still tallies secretion only when `sp.secretesStarch` (native producers), and it reads `secretionCode` even for non-Active producers.
  - Nothing reads the tally today (`grep -rn "\.secretion" src` finds no reader outside `experiments.ts`), so it is latent. The fix mirrors `tools/sim-tune.ts:282-287`.

## Verified fixed

- **VERIFIED OK: MAJOR, DORMANCY_LOCKOUT now reaches the UI.**
  - Code path:
    - `src/sim/moduleView.ts:129` puts `reason: dormancyReason(world, i, prof)` in the summary.
    - `src/worker/snapshot.ts:278` passes the summary to the inspector payload.
    - `src/worker/protocol.ts:461` declares the field.
    - `src/ui/strings/modules.ts:155` builds the Resting-stage line from the code with `reasonText(R.DORMANCY_LOCKOUT, 'lab', {value, restHeld})`.
  - **Real app, production build on port 4223, my own spec.**
    - The dish was simulated headless and imported through Saved dishes → Import. It was not built through the UI:
      - E03 carriers #1–#3 woke, ate and then lost their food, and now wait out the lockout with a rest due;
      - #4–#9 and #18 are resting.
    - Selecting #1 shows the chips `Eating · age 66 s · generation 0 · added by you or the recipe · just woke up`.
    - The Resting stage reads "Just woke up: it would start resting now, but cannot rest again for 5 s." and "No usable food for 20 s; it starts to rest after 20 s without food if it has at least 15 energy."
    - Same result on desktop and phone-portrait (`shots/desktop-inspector-lockout.png` and `shots/phone-portrait-inspector-lockout.png`, both looked at).
    - Resting carrier #7 shows no chip and no lockout line.
  - The new module-visuals test would fail on the old code: the payload had no `reason`.
  - **Hash neutrality, my own comparison.**
    - Setup: tree copies that differ only in `src/sim/dormancy.ts` and `src/sim/moduleView.ts` (HEAD versions against working-tree versions), each run from its own root.
    - Scenario (a): clear water with 12 carriers (E03, E01+E03, E03+E05). They rest, wake on sugar, and 12 of them are in lockout at a save/reload. The run then continues **on the reloaded world** with the food removed.
    - Scenario (b): FIRST_DISH_V1 with **Diverse** founders, seed 104729, plus 20 E03 carriers, for 6,000 ticks (21 dormancy-capable organisms at the start, 722 alive at the end).
    - Results: 197 hashes with digest `6131cedd81f764b3`, last hash `5015838b1f4700c2`, identical for:
      - old code;
      - new code;
      - new code that also calls `dormancySummary` for every living organism every tick and `buildInspector` for the 20 carriers every 5 ticks (27,112 inspector builds, 660 `restHeld` reads, 6,173 lockout organism-ticks).
    - The reload comparison was `rt:true`.

- **VERIFIED OK: MINOR, the no-state-change test compared new code with new code** (`tests/sim/dormancy.test.ts:169`).
  - The pinned timeline passes against HEAD's `dormancy.ts` (copy `old/`, with two inert stub exports appended only so the test file's imports resolve).
  - It fails under two mutations: the food trigger moved one tick later, and WAKING's recorded value shifted by one tick. The working copy was restored and diffed equal afterwards.

- **VERIFIED OK: MINOR, the lockout countdown showed "0 s"** (`src/ui/strings/reasons.ts:22`).
  - The earlier verifier's `tmp/verify-art-marks-rules/copy.ts` now prints "1 s" for 0.1, 0.4 and 0.5, and "30 s" for 29.9 and 30.
  - I also checked all 300 values the lockout clock takes (30 − k·0.1, with float drift): each reads the ceiling of the tick value, never 0, and never goes up.
  - Preparing/Waking countdowns (5 − k·0.1): no zeros.
  - In the app, 4.999999999999842 reads "5 s".

- **VERIFIED OK: MINOR, ESLint did not block src/render from importing art/src**, except the template-literal gap above. Probed with `eslint --stdin --stdin-filename src/render/features.ts`:
  - these all fail: named, side-effect, relative re-export, `export *`, namespace, `import type`, and quoted dynamic `import()` of `@art/…` or `../../art/src/…`;
  - a type-position `import()` is also caught, by `consistent-type-imports`;
  - `grep` finds no art/src import in `src/render`.

- **VERIFIED OK: MINOR, later-module marks had no frame counts** (`tools/content-validate.ts:84-91`).
  - The counts are `jacket_rim` 4, `cache_marker` 4 and `glow_center` 2. Every key is a real content `visualLayer` (E02, E11 and E17 exist in `content/modules`).
  - Tests: a one-frame mark fails, with its exact path, when E11, E17 or E02 is enabled.
  - The other ARCH §10.1 items have no module-layer count: trap, Lantern and Turnleaf are species, role marks are colony roles, and the partner bracket and link pixels have no number. For those, "≥ 1" is the right reading.

- **VERIFIED OK: MINOR, the renderer ignored the manifest's mark size.** `src/render/renderer.ts:304` stores `features[layer].size`, and `:657` uses `featureMarkScale`. No fixed `/ 16` is left. The test checks the scales and the source.

- **VERIFIED OK: MINOR (evidence), no browser test drew a mark.** I looked at the fixer's harness shot (`tmp/art-marks-fix1/shot/marks-zoom.png`) and its app crop (`app-crop-a.png`). My own run adds more:
  - My real-app import spec zooms in on the centre group (`shots/desktop-marks-close.png` and the enlarged `crop-rest.png` / `crop-e01.png`, all looked at).
  - Resting E03 bodies are tinted and carry the olive seam, which turns with heading: vertical on E/W bodies, horizontal on the N body.
  - E01 bodies show three notches, and an E05 body shows its pocket.
  - Atlas requests were only `atlas/manifest.json` and `atlas/organisms.png`. The manifest lists the 3 mark layers and 32 mark frames. There were 0 console errors.
  - At maximum wheel zoom the camera draws bodies at about 2× in a 1440×900 viewport; the fixer's harness covers 4×.

## Commands and results

- `npx vitest run tests/sim/module-visuals.test.ts tests/sim/dormancy.test.ts tests/content/atlas.test.ts tests/tools/sim-tune.test.ts tests/ui/reasons.test.ts tests/render`: 6 files, 50 tests passed.
- `npx tsx tools/art-build.ts --check`: `atlas up to date · 221 frames (32 feature-mark frames) · 512×256 · 5c232dad4319`, exit 0. The committed sha256 values (png `5c232dad…`, manifest `fcff92c2…`) match the fixer's report. The determinism test (`buildAtlas()` twice, byte-equal to the committed files) passes.
- `npx tsx tools/content-validate.ts`: `content ok … complete for 5 enabled species and 3 enabled module marks (starch_notch, resting_seam, reserve_pocket; 221 frames)`, exit 0.
- Hash comparison `npx tsx scratchpad/hash.mts <tree> plain|reads`: see the MAJOR entry above.
- Timeline test on the HEAD copy, and the two mutations: see the matching entry above.
- Throwaway real-app spec (`npx playwright test -c scratchpad/e2e/pw.config.ts`, port 4223, projects desktop and phone-portrait): **2 passed (1.8 min)**, 0 console errors.
- The task's e2e specs (`E2E_PORT=4223 E2E_OUTDIR=tmp/dist-reverify-art-marks npx playwright test tests/e2e/inspector.spec.ts tests/e2e/experiments.spec.ts --project=phone-portrait --project=desktop`): **14 passed (15.6 min)**. These specs include the 200 % text, 48 px target and axe checks. Port 4223 was free afterwards. I skipped phone-landscape because no layout changed: only the wording of one existing `<p>` did.
- `npx tsc -p tsconfig.json --noEmit` and `npx eslint` on every file this round touched, plus `src/render` and `eslint.config.js`: both exit 0.
