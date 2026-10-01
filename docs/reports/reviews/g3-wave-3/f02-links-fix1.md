# f02-links: fix round 1

## Problems

1. MAJOR: enabling F02 turned `npm run check` red in tests/ui/diet-line.test.ts and tests/ui/comprehension-labels.test.ts M5. **FIXED**
   - tests/ui/diet-line.test.ts: added `F02: 'Eats sugar, then debris.'` to `EXPECTED`. It is one additive line after e1-producers' Y02 entry, and their B07/B08/Y02 lines are kept. The diet line is derived from `foodPriority ["sugar","detritus"]`. No predator line changed.
   - tests/ui/comprehension-labels.test.ts M5: the sugar-source sentence now names the Cordweavers' enzyme. That is truthful: the line lists the dish's recorded rules ("Where sugar can come from in this dish under its recorded rules … never a claim about which sugar a given cell holds", src/ui/strings/shortcuts.ts), and F02 records E_STARCH_SECRETION. I took the new expected texts from a run of the real payload, then put them in the test:
     - Sprinter: "Sugar here can come from sugar placed in the dish, Sunbeads (they release sugar as they make food) and Crumbsmiths’ and Cordweavers’ enzyme (it turns starch into sugar)."
     - Crumbsmith: "Sugar here can come from sugar placed in the dish, Sunbeads (they release sugar as they make food) and Cordweavers’ enzyme". This assertion would also have failed. The verifier only saw the first failure in the test.
   - Result: diet-line and comprehension-labels pass. A 4-file run (these two plus fungal-transport and fungal-links) gave 35/35, and they are also in the 89/89 run below.

2. MINOR: the "only Active segments take part" rule at src/sim/fungalTransport.ts:234 was untested. **FIXED**
   - New test in tests/fixtures/fungal-transport.test.ts: "only Active segments take part: a Resting or Preparing end, donor or receiver, carries nothing". The donor is in the lower slot and the receiver in the higher one, so each end's check is tested separately. A control pair moves carbon (1 edge). For both Resting and Preparing, at each end, the pass returns 0 edges and B and N do not change. Setting that end back to Active gives 1 edge again.
   - The canonical basis is SPEC §7.6: Resting is "No intake, photosynthesis, movement, secretion, division, links or anchors" and Preparing is "no feeding, movement, reproduction, secretion".
   - Non-vacuity, run this session: removing `c.lifeState[a] !== LIFE_ACTIVE` gave 1 failed / 13 passed (the new test). Removing `c.lifeState[p] !== LIFE_ACTIVE` gave 1 failed / 13 passed (the new test). The file was restored and checked identical with cmp.

## Files changed
- tests/fixtures/fungal-transport.test.ts (mine): new test, plus an import of LIFE_ACTIVE/LIFE_PREPARING/LIFE_RESTING
- tests/ui/diet-line.test.ts (not mine; small additive edit): F02 row
- tests/ui/comprehension-labels.test.ts (not mine; expectation update): two M5 strings
- No source code changed. The fence is unchanged.

## Commands + results
- `npx tsc -p tsconfig.json --noEmit`: exit 0
- `npx eslint` on fungal-transport.test.ts, diet-line.test.ts, comprehension-labels.test.ts, src/sim/{fungalTransport,fungi,births}.ts, tests/sim/fungal-links.test.ts, tests/e2e/cordweaver.spec.ts: exit 0
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/worker/host.test.ts tests/fixtures/fungal-transport.test.ts tests/sim/fungal-links.test.ts tests/ui/diet-line.test.ts tests/ui/comprehension-labels.test.ts`: 12 files, 89/89 passed
- `E2E_PORT=4232 E2E_OUTDIR=tmp/dist-f02 npx playwright test tests/e2e/cordweaver.spec.ts --project=desktop`: 1 passed (2.2 min). Port 4232 was stopped before and after.

## Notes for the lead
- The diet-line and comprehension-labels edits sit next to e1-producers' edits. If they also changed M5, merge both: the sentence lists every enabled E_STARCH_SECRETION species in species order.
