# G2 wave C, fix round 1: module marks, DORMANCY_LOCKOUT, sim-tune

Date: 2026-09-28. This round fixes the problems in `art-marks-verify-rules.md`. The earlier work stays in the tree and was not redone. Nothing is committed; the lead commits.

## Per problem

### 1. MAJOR: DORMANCY_LOCKOUT never reaches the UI. FIXED (engine → payload → strings). One Inspector line is left for the lead.

- `src/sim/moduleView.ts` (additive; no other agent is editing it): `DormancySummary.reason = dormancyReason(world, i, prof)`. The worker's `buildInspector` already passes `dormancySummary` through, so the payload now carries the engine's code.
- `src/worker/protocol.ts` (one additive field, re-read just before the edit): `DormancyInspect.reason: { code; value; restHeld }`.
- `src/ui/strings/modules.ts` (strings):
  - `dormancyLines` shows the lockout line only when `d.reason.code === R.DORMANCY_LOCKOUT`. The text is `reasonText(R.DORMANCY_LOCKOUT, 'lab', { value, restHeld })`, so the "it would start resting now, but…" wording now appears when it applies.
  - New `dormancyChip(d)` returns `'just woke up'` only for that code.
- **Test** (`tests/sim/module-visuals.test.ts`, "the inspector carries DORMANCY_LOCKOUT from the engine…"). The carrier rests, wakes, goes through the lockout and rests again. On every tick of the rest and wake:
  - `payload.reason` equals `dormancyReason(world, i)`.
  - `payload.reason.code` equals the recorded `limitCode`.

  On every tick of the lockout:
  - chip ≠ null ⇔ code = DORMANCY_LOCKOUT ⇔ the chip condition the Inspector uses today (`state === Active && lockoutSeconds > 0`).
  - The Lab line equals `reasonText(…)`.
  - The count is exactly 299 lockout ticks and 100 `restHeld` ticks.
  - The last line reads "…but cannot rest again for 1 s."

  It fails on the old code: the payload had no `reason`, `dormancyChip` did not exist, and the old line never said "would start resting now".
- **Proof that no hash changes.** `tmp/art-marks-fix1/hashcmp.mts` ran on tree copies that differ only in `src/sim/dormancy.ts` and `src/sim/moduleView.ts`. The dishes were clear water with 8 E03 and E01+E03 carriers (starve, rest, sugar, wake, save and reload mid-lockout, starve again), plus FIRST_DISH_V1 seed 104729 with 30 carriers for 4,000 ticks.
  - Before (HEAD files), after, and after with the inspector's `dormancySummary` read for every carrier every tick all gave the same 157 hashes: digest `96e0ca91d00ab184`, last `f878f777b90c78ce`.
  - The reload was equal (`rt:true`). The runs covered 5,100 organism-ticks in lockout, and the reads saw 400 held rests.
- **For the lead** (`src/ui/panels/Inspector.tsx`; the assignment does not let me edit panels):
  ```diff
  -import { dormancyLines, energyCapText, LIFE_ACTIVE, lifeStateLabel, moduleText, originChip, upkeepText } from '../strings/modules';
  +import { dormancyChip, dormancyLines, energyCapText, LIFE_ACTIVE, lifeStateLabel, moduleText, originChip, upkeepText } from '../strings/modules';
  -            {e.dormancy && e.dormancy.state === LIFE_ACTIVE && e.dormancy.lockoutSeconds > 0 ? (
  -              <span class="chip">just woke up</span>
  -            ) : null}
  +            {dormancyChip(e.dormancy) ? <span class="chip">{dormancyChip(e.dormancy)}</span> : null}
  ```
  Until then, the test above proves that today's condition is true on exactly the ticks the code is set. `LIFE_ACTIVE` is still used at the Resting-stage section.

### 2. MINOR: the "no state change" test ran new code against new code. FIXED

- New test in `tests/sim/dormancy.test.ts`: "the lockout reason refactor changes no outcome: the transition timeline is the one HEAD dormancy.ts produced".
  - The dish has 6 carriers that rest, wake on sugar and lose their food. One of them is set below the 15 E entry energy.
  - The test pins every life-state transition (tick, state, recorded code and value, and lockout 30 on waking).
  - The values were computed with HEAD's `dormancy.ts` on a tree copy (`tmp/art-marks-fix1/timeline.mts`). The new code gives the identical list and the identical 16 state hashes (`c8e9b03a8f2becac`).
- Mutation check: moving the food trigger by one tick shifts the entries from 200→201 and 250→251, so the test would fail.
- The paired test is renamed to what it proves: "reading DORMANCY_LOCKOUT has no side effects…".

### 3. MINOR: "for 0 s" in the last 0.4 s. FIXED

- `src/ui/strings/reasons.ts` now exports `secondsLeft()`, which rounds up with a 1e-6 tolerance so float accumulation does not add a second. PREPARING, WAKING and DORMANCY_LOCKOUT use it.
- The "Getting ready to rest: … s left" and "Waking up: … s left" lines in `dormancyLines` use it too.
- Elapsed times still round to the nearest second.
- Tests in `tests/ui/reasons.test.ts` ("countdowns … round up"):
  - 0.1 → "1 s", 0.4 → "1 s", 29.900000000000002 → "30 s", 2.0000000000004 → "2 s".
  - PREPARING 0.4 → "1 s left", WAKING 0.1 → "1 s left".

  The old code printed "0 s". The existing 12.3 s case now reads 13 s. The module-visuals test above checks that the last lockout line reads "1 s".

### 4. MINOR: ESLint did not enforce src/render ↛ art/src. FIXED

- `eslint.config.js`, src/render block (additive; nobody else is editing the file):
  - `no-restricted-imports` now also bans `'@art/*', '**/art/src/*', '**/art/src/**'`.
  - A new `no-restricted-syntax` rule bans `ImportExpression[source.value=/^@art\/|art\/src\//]`, because `no-restricted-imports` does not see `import()`.
- Probed with `eslint --stdin --stdin-filename src/render/features.ts`. Named, side-effect, relative, re-export and dynamic `import()` from art/src all fail. `./features` and `@worker/protocol` pass. `npx eslint src/render` exits 0.
- The test regex now matches `from`, bare `import`, `import()` and `require()`. It checks itself against 6 import forms and asserts that the ESLint render block contains both rules.

### 5. MINOR: later marks had no frame counts. FIXED

- `FEATURE_FRAMES` now also has:
  - `jacket_rim` 4 (ARCH §10.1 "jacket 4 levels"; UX §6.2 "jacket rim (4)")
  - `cache_marker` 4 ("cache 4 fills" / "cache icon (4 fills)")
  - `glow_center` 2 ("Lantern dim/glow"; E02 is the module form of B09 Lantern, whose native glow it copies)
- New test in `tests/content/atlas.test.ts`:
  - Every listed layer is a real content `visualLayer`.
  - When E11, E17 or E02 is enabled with a one-frame mark, the check fails with the exact path and message. For example: `features.jacket_rim.frames: E11 (jacket_rim): mark has 1 frame(s), needs 4 (jacket levels 0–3)`.
  - E12 `adhesion_link` has no count in the docs, so it passes with 1 frame.
- Role marks ×5, the partner bracket and the link pixels have no per-module count in the docs. They still need at least 1 frame. The five role marks (D05) are colony roles, not one module's layer.

### 6. MINOR: D-0019 in DECISIONS.md is out of date. NOT FIXED (the lead owns the file; this report is the only doc I may create)

Proposed entry text:

> **D-00xx (2026-09-28) Module marks in the atlas; DORMANCY_LOCKOUT is derived; producers counted by profile.**
> - Module feature marks are frames in the organism atlas, keyed `feature/<layer>/<heading>/<frame>`. They are listed in the manifest `features` table and packed after the sprites (manifest `version` stays 1, because the section is only added).
> - The renderer resolves them from the manifest. It imports nothing from art/src (ESLint enforces this) and scales each mark by `features[layer].size`.
> - content:validate requires every enabled module's `visualLayer` with the ARCH §10.1 counts (seam 3, pocket 4, notch 1, jacket 4, cache 4, glow 2; any other layer at least 1).
> - DORMANCY_LOCKOUT is read from the saved clocks (`dormancyReason`) and never written to an entity column, because every column is hashed. It is the organism's dormancy state reason for the whole 30 s lockout, and `restHeld` marks a due rest that only the lockout is holding back. It does not replace the measured intake constraint.
> - Countdown copy rounds up.
> - sim-tune (and, as a follow-up, experiment observations) counts secretion from the profile's producer rules, so E01 carriers are included, and counts a producer that is not Active under its recorded state reason.
> - This supersedes the "built at runtime … follow-up" sentence in D-0019.

### 7. MINOR: the renderer ignored the manifest's mark size. FIXED

- `src/render/features.ts`: new `featureMarkScale(scale, bodyPx, markSize)`. If the size is missing or 0 it falls back to the authored 16.
- `src/render/renderer.ts` (mark loading only): `layerSize[layer] = manifest.features[layer].size`, and marks are drawn with `featureMarkScale(scale, d.size, layerSize[layer])`.
- Test (module-visuals, "a mark covers the body it sits on at the manifest mark size"): 16/16 → 4, 32/16 → 8, 32/32 → 4, missing → 16. It also checks the renderer source: it uses the manifest size and no fixed `/ 16` is left.

### 8. MINOR (evidence): no e2e run ever drew a mark. FIXED (real evidence now; the suite runs are only a regression check)

- **Harness with the real DishRenderer** (`tmp/art-marks-fix1/shot/marks-dish.png`, enlarged `marks-zoom.png`), rerun after this round's renderer change. It uses the real atlas and a world packed by the worker's `packEntities`, at sprite scale 4×. I looked at both images:
  - 6/6 E03 carriers are resting, and each seam turns with its body's heading (N/S bodies show a horizontal seam).
  - The 4 E01 carriers show three pale notches.
  - The 4 full E05 carriers show the amber band-3 pocket.
  - The selected E01+E03+E05 carrier shows the notch, the pale band-0 pocket and the idle seam.
  - Marks sit 1:1 on the 16 px bodies.
- **Production build, real app** (`tmp/art-marks-fix1/e2e/marks-app.spec.ts`, throwaway, desktop, port 4193, build `tmp/dist-art-marks`). Steps: New Dish → seed 104729 → Diverse founders → run 27 s → pause → zoom to the maximum at the Sprinters.
  - The Diverse founders were 4 Sprinters (1 Starch release, 1 Resting stage, 2 Reserve chamber), 2 Recyclers and 2 Sunbeads.
  - `app-crop-a.png` shows, on real founders: an E05 pocket, the three E01 notches, and the E03 idle seam on a north-facing body.
  - 0 console errors. The only atlas requests were `manifest.json` and `organisms.png`. The manifest has 3 mark layers and 32 frames. The spec passed.
- **Suite e2e.** The grep for module carriers finds only `experiments.spec.ts` (EXP_C, E05) and `new-dish.spec.ts`. I also ran `inspector.spec.ts`, because the inspector strings changed. This run is a regression check: the suite views never zoom in on a carrier.

## Other notes for the lead (not my files)

- `src/sim/experiments.ts:397` still counts secretion only for native producers (`sp.secretesStarch`), and it reads a stale `secretionCode` for producers that are not Active. The fix mirrors `tools/sim-tune.ts`.
- **PROPOSED DECISION:** E02 `glow_center` needs 2 frames (dim, glow). This follows ARCH §10.1 "Lantern dim/glow": E02's native equivalent is B09 Lantern, and the SPEC §12.2 reasons GLOW_ON/GLOW_OFF need a truthful off/on mark.
- **PROPOSED DECISION:** the Inspector chip keeps its short wording ("just woke up"), and only its condition changes to the reason code (the diff under problem 1). The one-sentence Summary constraint stays the measured intake reason while a rest is held. The organism really is going without food, and that measured fact is the stronger constraint.

## Files changed this round

- Owned: `src/ui/strings/reasons.ts`, `src/render/features.ts`, `src/render/renderer.ts` (mark scale only), `tools/content-validate.ts`, `tests/sim/module-visuals.test.ts`, `tests/sim/dormancy.test.ts`, `tests/content/atlas.test.ts`, `tests/ui/reasons.test.ts` (prettier run on this file only, because it was prettier-clean at HEAD).
- Outside my ownership, small and additive: `src/sim/moduleView.ts` (reason field), `src/worker/protocol.ts` (one field), `src/ui/strings/modules.ts` (lockout line from the code, `dormancyChip`, countdowns round up), `eslint.config.js` (render boundary).
- Unchanged this round: `src/sim/dormancy.ts`, `src/sim/reasons.ts` (no renumbering: DORMANCY_LOCKOUT = 48), `tools/art-build.ts`, `tools/sim-tune.ts`, `art/src/**`, `public/atlas/**` (rebuilt, byte-identical).
- Scratch (gitignored, mine): `tmp/art-marks-fix1/`.

## Commands and results

- `npm run art:build` ×2: `wrote atlas · 221 frames (32 feature-mark frames) · 512×256 · 5c232dad4319` both times. png sha256 `5c232dad4319dc39…` and manifest sha256 `fcff92c28de17b5f…` are unchanged. `npx tsx tools/art-build.ts --check`: `atlas up to date …`, exit 0.
- `npx tsx tools/content-validate.ts`: `content ok … complete for 5 enabled species and 3 enabled module marks (starch_notch, resting_seam, reserve_pocket; 221 frames)`. No content/ file changed.
- `npx vitest run tests/sim/module-visuals.test.ts tests/sim/dormancy.test.ts tests/content/atlas.test.ts tests/tools/sim-tune.test.ts tests/ui/reasons.test.ts tests/render`: 6 files, 50 tests passed.
- Neighbouring tests (`tests/experiments/journal-and-words`, `tests/fixtures/{branch-evidence,module-accounting,determinism}`, `tests/sim/{modules,founders-words}`, `tests/content/validator`): 7 files, 77 tests passed.
- `npx tsc -p tsconfig.json --noEmit`: exit 0. `npx eslint` on every file above plus `src/render`, `art/src` and the tools: exit 0.
- `grep -rnE "(from\s*|import\s*\(?\s*)['\"](@art/|(\.\./)+art/)" src/render`: no match (exit 1).
- `E2E_PORT=4193 E2E_OUTDIR=tmp/dist-art-marks npx playwright test tests/e2e/experiments.spec.ts tests/e2e/new-dish.spec.ts tests/e2e/inspector.spec.ts`: **27 passed (22.9 min)** across phone-portrait, phone-landscape and desktop. These specs include the 200 % text, 48 px target and axe checks. Port 4193 was stopped afterwards.
- Throwaway real-app marks spec (`-c tmp/art-marks-fix1/pw.config.ts`): 1 passed, 0 console errors. Port 4193 was stopped.
- Hash comparisons: see problems 1 and 2.
- UI checks: the only visible change is the wording of one existing `<p>` in the Resting-stage section. There are no new controls, and the text size and wrapping are unchanged. The inspector specs above passed at all three sizes.
