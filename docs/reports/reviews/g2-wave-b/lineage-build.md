P2.3 (branch discovery, lineage panel, trait overlay, specimens, discovery card) is built end to end. Every test I touched passes, the lineage e2e passes 9/9 on all three projects, and the typecheck and lint are clean. Nothing is committed. `npm run check` was not run as a whole: I ran targeted vitest files, as the task asked.

## Files
**New (mine):**
- `src/sim/specimens.ts`
- `src/ui/panels/LineageSheet.tsx`, `LineageLegend.tsx`, `LineageState.tsx` (state and actions; named `.tsx` so it matches the `Lineage*.tsx` ownership)
- `src/ui/panels/DiscoveryCard.tsx`, `DiscoverySetting.tsx`
- `src/ui/strings/lineage.ts`
- `tests/fixtures/branch-evidence.test.ts`
- `tests/sim/lineage-panel.test.ts`, `tests/sim/lineage-host.test.ts`
- `tests/e2e/lineage.spec.ts`

**Rewritten or extended (mine):** `src/sim/branches.ts`, `src/sim/lineage.ts` (lineage.ts gains `buildLineage` and `packLineageMarks`).

**Shared files, additive edits only:**
- `src/sim/commands.ts`: new `'lineage'` command kind (rename, pin, save specimen, spawn specimen); `introduceOrganism` takes an optional existing genome.
- `src/worker/protocol.ts`: `lineage` and `lineageView` messages, `VisualEvent.branch`, and on snapshots `branchCount` plus optional `lineage` marks.
- `src/worker/host.ts`, `client.ts`, `snapshot.ts`: wiring for the above; `visualEvents` passes the branch id through.
- `src/render/renderer.ts`: band tints, band aggregation at wide zoom, rings on the followed branch's members, `followLineage`.
- `src/ui/state.ts`: `'lineage'` sheet and `pauseOnDiscoveries?` setting.
- `src/ui/views/DishScreen.tsx`: mounts the legend, card and sheet; a waiting specimen takes the next tap.
- `src/ui/panels/Inspector.tsx`: "Family tree" button under "Where is its family?".
- `src/ui/styles.css`: appended block.

**Outside my ownership (one edit):** `src/ui/panels/CompareText.tsx` got one `case 'lineage'`. Without it the exhaustive switch no longer typechecks once the new command kind exists.

## What the tests prove
- **`branch-evidence.test.ts` (16 tests):** the branch is established exactly at the fifth living descendant three generations deep. Remove any one of the three requirements (qualifying difference, count, depth) and nothing is established; a lineage that had a deep member which then died does not establish. Each D4 threshold qualifies at its value and not below, loci are compared only where active in both genomes, and a weight change counts only when both genomes are weighted. The founder stays the root even when it was the candidate's only living member when it divided. A branch is extinct only once its sub-branches are too. Renamed, pinned and extinct branches keep name, ID and history across plain reload and the real `.pixelmeba` file. Names from pre-P2.3 records survive reload. Label edits are not chart interventions. Specimen spawn goes to the ledger as `introduce:specimen`, the ledger check passes, spawned organisms start their own line and never revive their branch, and the same commands give the same hash across reload and replay. A real Accelerated seed-101 run keeps its bookkeeping consistent and reloads to the same hash.
- **`lineage-panel.test.ts` (6):** panel queries never change the state hash; ancestor comparison values and module costs come from the genome and content; overlay marks follow snapshot order; inactive loci are counted; refused commands change nothing.
- **`lineage-host.test.ts` (2):** through the real worker host, queries and views leave the hash untouched; rename, pin and save go through the command path; a specimen spawn is undone exactly.
- **`lineage.spec.ts` (3 journeys):** the dish is a real headless-simulated seed-101 state saved 15 ticks before its first branch and loaded through Import, so the discovery really happens in the browser. Journeys cover:
  - discovery card and pause on discoveries, compare ancestor, rename (ID stays), pin, save specimen;
  - trait overlay with a counted legend, follow lineage with rings;
  - inspector → "Family tree", specimen placement adds exactly +1;
  - card with pause off plus Dismiss;
  - 200 % text: 48 px targets reachable, no sideways scroll, no serious axe violations.

## Commands run
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx eslint <all touched files>`: clean.
- `npx vitest run` on my three test files, `inherited-variation`, `tests/worker/` and `tests/ui/`: 67/67 passed.
- `npx vitest run` on the determinism, deterministic-state, persistence, comparison and sim-tune tests: 38/38 passed.
- `E2E_PORT=4181 E2E_OUTDIR=tmp/dist-lineage npx playwright test tests/e2e/lineage.spec.ts --project=phone-portrait --project=desktop --project=phone-landscape`: 9 passed. After that I added only fixture cleanup (`afterAll`) and re-ran one test, which passed. Server on 4181 stopped.

## Bugs fixed in code that was already on main
- Dividing a branch's only living member marked the branch extinct.
- A candidate whose only member divided was dropped, so the root moved to the daughter; this broke the oldest-qualifying-ancestor rule.
- Establishment used the recorded maximum depth, even when the deep member had died.
- Loci were compared where active for the daughter only, not where active in both genomes.

## Not done / for the lead
- **Settings page:** `src/ui/views/SimplePage.tsx` is not mine. To put the option there, render `<PauseOnDiscoveriesToggle />` from `src/ui/panels/DiscoverySetting.tsx`. The toggle is already in the family tree panel.
- **Lab Observe tray (P2.7):** the lineage and trait-overlay items can call `openLineage()` / `setTraitLocus()` from `LineageState.tsx`, or render `TraitControl` from `LineageSheet.tsx`.
- **Future removal tools** (sample, transfer, erase) must release branch and candidate counts, as `branches.onDeath` does.
- **State hashes change** for worlds with branches, E03 carriers or specimens. P2.9 tune hashes will differ; this is expected.
- **Leftover file:** `tmp/e2e-lineage/lineage-fixture.pixelmeba` predates this session and I left it.

## PROPOSED DECISIONS
1. A branch is established when at least 5 qualifying members are alive and at least one living member is 3 or more generations past the root. Under binary division the root has always split by then, so every counted member is a descendant.
2. A candidate stays open during its member's division until both daughters are recorded, so the root is always the oldest qualifying ancestor of an unbroken chain.
3. A branch is extinct only when neither it nor any branch descended from it has a living member; a division never makes a branch extinct.
4. Name format is "Species · Descriptor · ShortID":
   - The descriptor comes from the branch's qualifying difference:

     | Difference | Descriptor |
     |---|---|
     | Module gained | the module name |
     | Module lost | "Without …" |
     | Largest locus change | that locus's high/low descriptor word |
     | Feeding policy | "Mixed feeder" / "Ordered feeder" |
     | Food weight | "{Food}-leaning" |

   - When two branches share the first three hex digits (the same genome can arise twice), the second becomes e.g. "7C2-2".
   - Player names are cleaned to at most 60 characters, and the ID always shows.
5. Specimens:
   - They live inside the world, in an optional `branches.specimens` list, up to 50 per dish. Worlds without specimens keep their old hash.
   - Spawning uses the `lineage` command with nearest-cell placement and no randomness, and starts a new line. It is undoable like Add Life.
   - Rename, pin and save are logged commands but not chart interventions and not undoable on their own.
   - A cross-dish specimen shelf is left to the Phase 4 gallery.
6. The trait overlay has five bands (0–39, 40–46, 47–53, 54–60, 61–100) on a blue–orange scale, with inactive loci shown grey. The legend names and counts every band, and at wide zoom each cell shows its most common band.
7. New discoveries are detected from the snapshot's `branchCount`, with the first snapshot of a dish as the baseline. There is one card per 1.5 s burst and at most one new card per 60 s (CT §12.10). If Undo rewinds past a discovery, its card closes.
8. The discovery card and panel show costs as "Game rule:" lines taken from the CT §6.1 tradeoffs and module surcharges, never as benefits.
9. The discovery fixes (living depth, the pending root, shared active loci) also apply to worlds loaded from older saves. They affect only the notebook: births and survival are unchanged.