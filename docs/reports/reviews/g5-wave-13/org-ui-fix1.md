# org-ui round-1 fix report (wave 13)

## Per problem

1. MAJOR: stopAnswer printed "Holding on: ? of ? s ..." twice under key 42. FIXED.
   - `src/ui/strings/shortcuts.ts` stopAnswer: the hunting item (e.predation.code) is skipped when the list already holds that code. Item keys are codes, so this also removes the duplicate key 42 in Inspector.tsx:574. A PRED_HANDLING_IN_PROGRESS item now takes its detail from constraintWords, which reads the handler's own `handling` field: "Holding on: 0.6 of 1.0 s of contact (resets if contact breaks)." The v1.0 hunting codes keep their old record-free Lab wording.
   - `src/ui/strings/reasons.ts`: PRED_HANDLING_IN_PROGRESS and CAPTURED_HANDLING Lab words without a measured value or need now read "Holding on to its prey (resets if contact breaks)." / "Being caught (resets if contact breaks).", never "?".
   - Note: the dedupe also removes a duplicate that existed in v1.0 (limitCode PRED_NO_PREY with predation PRED_NO_PREY listed twice under one key). This touches UI only; the payload is unchanged.
   - Tests in tests/ui/inspector-p5.test.ts:
     - '"What's holding it back" names a handler's attempt once, with its measured progress' (payload with limitCode, predation and handling).
     - 'a real P10 mid-attempt (stepped in contact with a P01)' (the verifier's repro, stepped through the sim): codes unique, no "?" in any detail, measured handling detail.
   - Mutant: restoring the old push (no dedupe, plain reasonText) fails both tests.
   - e2e: organisms-p5.spec.ts Needlejaw journey (Lab) now checks that why-stop contains the measured line once and no "?".
2. MINOR: no HEAD-payload golden. FIXED.
   - New `tests/worker/inspect-p5-v1-golden.json` (47 KB, raw-deflate base64), written by the UNMODIFIED HEAD 3daebb2 code. HEAD's src/tests/helpers/content/tools/fixtures were extracted with `git archive 3daebb2` into the scratchpad and the generator below was run there.
   - It holds every living organism's EntityInspect and 5 CellInspects (JSON form) for:
     - FIRST_DISH_V1, seed 104729, tick 400 (71 organisms);
     - PREDATOR_BALANCE_V1 + 5 P01 at (48.5..52.5, 70.5), tick 300 (95 organisms, hunting codes 38 and 39);
     - the rc1 saves borrowed-shelter-velvet, fungal-supply-line and one-host-pinphage, 100 ticks after load and resume.
   - tests/worker/inspect-p5.test.ts 'a v1.0 dish inspects exactly as the HEAD code did (golden)' (2 tests): the birthId lists and every payload deep-equal.
   - Mutant: mapping PRED_OUT_OF_CONTACT to PRED_NO_PREY in snapshot.ts fails it.
3. MINOR: "It senses neighbors." shows for any sensed signal (an M06 dose or the organism's own emission). NOT FIXED: this is canonical wording, so it is an owner item. UX_SPEC §5.2 row: `| NEIGHBORS_DETECTED | "It senses neighbors." | "Signal {v} (threshold 0.30)." |`. SPEC §7.8 defines the trigger only by the sensed value: "Glow turns **on** after sensed ≥ 0.30 for 5 continuous seconds". CLAUDE.md: "implement the canonical rule, and flag it for the owner".
   - PROPOSED DECISION (owner review, EXPANSION_RESPONSE §8): Explore wording "It senses glow signal." (the field's own name, as D-0120 did for RIVAL); Lab keeps "Signal {v} (threshold 0.30).".
   - The e2e fixture (one Lantern held at sGlow 0.5) matches the canonical text as written.
4. MINOR: src/render/picture.ts has no grit (band 7) branch. NOT FIXED: the file is outside org-ui's ownership and has its own picture rules.
   - NEEDS (lead or P5.8): in picture.ts's deposit loop, read `grit = deposits.length >= 8 * CELL_COUNT ? deposits[7 * CELL_COUNT + i]! : 0`, add it to the early `=== 0` skip, and paint layers.ts paintGrit's specks scaled to px. Use the colours gritPale #e9eef2 and gritEdge #45525c (layers.ts C), 1/2/3 specks at bands >=1/85/170, from a cosmetic key distinct from 13/17/19/23.
   - The picture test needs one case: a v1.0 band set paints byte-identical pixels.
   - No shipped dish holds grit before the organism flip.

## Files changed (this round)
- src/ui/strings/shortcuts.ts (stopAnswer hunting item)
- src/ui/strings/reasons.ts (unmeasured handling fallbacks)
- tests/ui/inspector-p5.test.ts (2 tests)
- tests/worker/inspect-p5.test.ts (golden describe, 2 tests)
- tests/worker/inspect-p5-v1-golden.json (new)
- tests/e2e/organisms-p5.spec.ts (why-stop assertions)
- docs/reports/reviews/g5-wave-13/org-ui-fix1.md (this report)

## Commands and results
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx eslint` on the 5 changed ts files: clean.
- `npx vitest run tests/ui tests/worker/inspect-p5.test.ts tests/worker/cue3-org.test.ts tests/worker/protocol3.test.ts tests/worker/protocol3-v1-equivalence.test.ts tests/render/features-p5.test.ts tests/sim/module-visuals.test.ts tests/experiments`: 65 files, 503 tests passed.
- Fence (`npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/determinism-g3.test.ts`): 10 files, 77 tests passed, exit 0. Unchanged; no sim file touched.
- `E2E_PORT=4273 E2E_OUTDIR=tmp/dist-org-ui npx playwright test tests/e2e/organisms-p5.spec.ts tests/e2e/inspector.spec.ts --project=desktop --project=phone-portrait`: 16 passed, 4 skipped (trap and jacket journeys, test.skip until TRAP / E11 are implemented), exit 0. Port 4273 stopped before and after.

## Golden generator (run in the scratchpad copy of HEAD 3daebb2: `npx tsx gen/golden.ts golden.json`)
```ts
import { writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { loadSaveFile } from '../src/persistence/saveFile';
import { realizeRecipe } from '../src/sim/recipes';
import { step } from '../src/sim/tick';
import type { World } from '../src/sim/world';
import { buildInspector } from '../src/worker/snapshot';
import { RC1_SAVE_FILES, readRc1SaveText, resumeRc1 } from '../tests/helpers/rc1-saves';
import { place, registry } from '../tests/helpers/world';
const out: Record<string, unknown> = {};
function take(name: string, w: World, ticks: number): void {
  for (let t = 0; t < ticks; t++) step(w);
  const ids: number[] = [];
  const ents: unknown[] = [];
  const c = w.ents.cols;
  for (let i = 0; i < w.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    ids.push(c.birthId[i]!);
    ents.push(JSON.parse(JSON.stringify(buildInspector(w, { kind: 'entity', birthId: c.birthId[i]! }))));
  }
  const cells = [0, 64 * 128 + 64, 40 * 128 + 40, 90 * 128 + 30, 20 * 128 + 100];
  const cellInspect = cells.map((cell) => JSON.parse(JSON.stringify(buildInspector(w, { kind: 'cell', cell }))));
  out[name] = { ticks, ids, ents, cells, cellInspect };
}
async function main(): Promise<void> {
  take('FIRST_DISH_V1', realizeRecipe(registry(), 'FIRST_DISH_V1', { seed: 104729 }), 400);
  const pb = realizeRecipe(registry(), 'PREDATOR_BALANCE_V1', { seed: 104729 });
  for (let k = 0; k < 5; k++) place(pb, 'P01', 48.5 + k, 70.5);
  take('PREDATOR_BALANCE_V1+5xP01', pb, 300);
  for (const file of RC1_SAVE_FILES.filter((f) => !f.startsWith('first-dish'))) {
    const { world } = await loadSaveFile(readRc1SaveText(file));
    resumeRc1(file, world);
    take(file, world, 100);
  }
  const json = JSON.stringify(out);
  writeFileSync(process.argv[2]!, JSON.stringify({ written: 'by the HEAD 3daebb2 code (before wave 13); generator in docs/reports/reviews/g5-wave-13/org-ui-fix1.md', deflated: deflateRawSync(Buffer.from(json)).toString('base64') }) + '\n');
  console.log('raw', json.length);
}
void main();
```
