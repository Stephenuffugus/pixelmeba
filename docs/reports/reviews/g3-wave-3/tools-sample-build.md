# g3 wave 3 — tools-sample build report (P3.5 Sample, Transfer, Clean water)

Builder: tools-sample. Date: 2026-10-01. No commits, no content or manifest edits, no world schema bump, no art.

## Checklist: Build

- DONE Begin is host-level: pauses, records the pre-begin stateHash, replies `sampleBegun {hash}` (src/worker/host.ts:824). Preview is read-only `samplePreview` (host.ts:840 → src/sim/sample.ts:139 `selectSample`). Modes: Life = organisms whose centres are in the footprint plus viral fields; Dissolved = kinds dissolved/gas/activity (companion N fields are kind dissolved); Deposits = kind deposit (starch, oil, protein, detritus, film + N; grit if silicate) plus food objects; All = all of these, never structures (sample.ts `modeTakes`). Radius 1/3/6 only. Held C/N/M come from `sampleTotals`. Proved by tests/sim/tools.test.ts:86 and the e2e.
- DONE Whole ownership units (sample.ts:121 `partnersOf`, closure in `selectSample`): host↔parasite, the whole fungal component (any link kind), the whole adhesion component, predator↔claimed prey (valid preySlot, both directions). If any member is outside the footprint the take is refused whole and each one is named (species, birthId, cell). The brush is never widened. Tests: tools.test.ts:178, :215, :246.
- DONE Take = command `sampleTake` (sample.ts:269; commands.ts:142). The host refuses it unless paused (host.ts, the 'command' case). Rows keep every column and their original slot; field values move by cell offset; objects keep id; genome copies travel. Slots are freed without releaseHostPair/removeAllLinks, because every partner is held too. tools.test.ts:178 checks that nothing dangles: linksValid holds and host pairs are mutual after transfer. The ledger closes: the sample is an accounted compartment.
- DONE While held, the host refuses Run (setSpeed > 0), Step, compareStart and every command except sampleTransfer/sampleDiscard **before applyNow**, with `A sample is held — transfer, cancel or discard it first` (host.ts:580, :589, :603, :1159; `refuseWhileHeld` :2091). The pump also refuses to run a held dish. No seq is taken. Undo while held acts as Cancel (host.ts:637).
- DONE Cancel is host-level and exact (`sampleCancel`, host.ts:852 → `cancelHeldSample` :2105 → sample.ts:314 `cancelSample`). It does an allocate-at-slot inverse move (new `EntityStore.allocateAt`, src/sim/entities.ts:286), puts field values back (keeping −0) and returns objects in id order. Then it removes every log entry with seq ≥ sample.seq and their 'command' events, sets nextSeq = sample.seq, and undoes the take's pendingIntervention. The host resets its rollback checkpoint, replay list and undo slot as Undo does. The hash equals the pre-begin hash, also across a reload (tools.test.ts:114, sample-transaction.test.ts:128).
- DONE Discard = command `sampleDiscard` (sample.ts:353). It exports exactly `sampleTotals` as 'sample:discard'. Each row is recorded as removed: death event cause REMOVED_SAMPLED, lineage deathCause, branch counts via onDeath, history pendingDeaths, and held energy goes to dissipated. The UI confirms first (SamplePanel). Test: tools.test.ts:312.
- DONE Transfer = command `sampleTransfer {dx, dy}` (sample.ts:403 `transferProblem`, :462). Every destination is checked first:
  - field cells: in the mask and transportOpen;
  - objects: no structure, no object already there, object cap;
  - organisms: in the mask and habitatCompatible (a rider attached to a held host follows its host);
  - soft capacity 8 by cellLoad, AGENT_CAP and FUNGAL_CAP;
  - linked members keep their relative cells.

  Any failure refuses the whole move. Otherwise the sample moves (it is not copied):
  - fields are added at their offsets;
  - objects keep id and contents;
  - organisms keep all state, x/y (and targetX/Y while moving) shift by (dx, dy);
  - organisms get new slots lowest-free-first in ascending original-slot order;
  - hostSlot, parasiteSlot, preySlot, fLink0..3 and aLink0..1 are remapped (a stale prey link is kept as it was);
  - birthIds are unchanged.

  Tests: tools.test.ts:178 (remap 3→1, 4→3), :261 (atomic), :279 (move, not copy).
- DONE PROPOSED DECISION (replace = Discard then Begin): the host refuses a second Begin while held. The UI asks "Replace it?" and then sends Discard + Begin (src/ui/panels/SampleSession.tsx `replaceSample`). On reload the pending sample restores, the snapshot carries `sample` (SampleHeldSummary), and SamplePanel offers Transfer (Complete) / Cancel / Discard while time stays paused (sample-transaction.test.ts:128).
- DONE Import (src/sim/sampleSlot.ts:259 `heldRowsProblem`, wired at src/persistence/saveFile.ts:474). It refuses:
  - a negative pool or an unknown life state;
  - a slot or birthId shared with a living organism or with another held row;
  - a held link or host pair that does not lead, mutually, to another held row (a prey link may be stale, D-0050; only its range is checked).

  Messages end "Nothing was loaded." (tools.test.ts:422).
- DONE Clean water = command `cleanWater {points, radius, fraction}` (src/sim/tools.ts:59; commands.ts:151 uses the deposit stroke bounds). It removes the fraction from kinds dissolved, activity and viral as exports 'tool:cleanWater'; 100 % leaves an exact 0. It sets O2 and CO2 per cell to the habitat baseline: baseFields, then each covering op's fields (`habitatBaseline`, tools.ts:49). Added CO2 is an input and removed CO2 an export ('tool:cleanWater:co2'). O2 is not ledgered. Life, deposits and objects are untouched. Tests: tools.test.ts:331, :373, :393.
- DONE Erase structure already exists ('eraseStructure', tray item 'erase'): tests/sim/lab-commands.test.ts:489–574. Nothing was added.
- DONE Tools tray (src/ui/panels/LabTray.tsx trayItems 'tools'): Sample and Clean water appear on every world, older ones included, and Transfer appears while held. These are "sessions" (`labSession`, SampleSession.tsx) and are never stored as the persistent labTool. So LabTrayContent.toolAvailable, which I don't own, needs no change. Gestures are routed through `activeTool()` in LabView.tsx. CompareText describeChange covers sampleTake, sampleDiscard, sampleTransfer and cleanWater (CompareText.tsx:64–70). view-switch.test.ts pins the tools list (:358) and the older-dish case, which now offers Sample and Clean water.
- DONE trajectory canonSample hashes each held row's original slot (tests/helpers/trajectory.ts:226).

## Checklist: Done when

- DONE tools.test.ts (14 tests): ledger ok at begin/take/transfer/discard/cancel and totals constant; Take→Cancel exact (hash, rows, slots, fields, objects), also via a raw reload and a .pixelmeba file; A01+X01 pair; 2 of 4 chained F01 segments refused naming 2 (F01 via linkFungal on GEL_COLONY; F01 is shipped, no allowUnimplemented); atomic transfer; move not copy plus remap; exact discard export; clean water 25/50/100 %; each import refusal.
- DONE tests/worker/sample-transaction.test.ts (5 tests, FakeClockHost): Run/Step/inoculate refused while held with no seq taken; Undo while held = Cancel; reload restores the sample and offers it in the snapshot; Complete, Cancel and Discard each work after a reload; Cancel after a reload gives the pre-begin hash (beginHash null after reload).
- DONE tests/e2e/sample-transfer.spec.ts (desktop, 2 journeys): Lab → Tools → Sample (Life, r 3) → preview → Take → Run refused (toast) and time does not move → Transfer → the dish runs; Cancel path: worker 'hash' before Begin = after Cancel; Clean water 50 % on a salt patch: salt == before / 2, read from the worker's own 'save' reply. Axe has no serious or critical findings with the tray open, the preview open and a sample held. Buttons use `.btn` (48 px targets) and the panel text is var(--fs-body) = 1rem.
- DONE Non-vacuity: I mutated src/sim/sample.ts and ran tools + sample-transaction, then restored the file and re-ran (14/14):
  - nextSeq restore removed → 6 tests fail (the 3 Cancel tests in tools.test.ts plus 3 host tests);
  - ownership closure removed → 3 fail (A01/X01 pair, F01 chain, predator/prey);
  - slot remap removed → 1 fails (A01/X01 pair).
- DONE g2-replay and the fence are unchanged: an empty slot is hash-neutral and nothing changes until a player command.

## Files

Created:
- src/sim/sample.ts
- src/sim/tools.ts
- src/ui/panels/SampleSession.tsx (state)
- src/ui/panels/SamplePanel.tsx
- src/ui/strings/tools.ts
- tests/sim/tools.test.ts
- tests/worker/sample-transaction.test.ts
- tests/e2e/sample-transfer.spec.ts
- this report

Changed (owned):
- src/sim/commands.ts
- src/sim/sampleSlot.ts
- src/worker/{protocol,host,client}.ts
- src/ui/views/LabView.tsx
- src/ui/panels/LabTray.tsx
- src/ui/panels/CompareText.tsx

src/ui/strings/lab.ts was not needed.

Shared (additive):
- src/sim/entities.ts (allocateAt)
- src/persistence/saveFile.ts (one line: entity columns passed to the sample check)
- tests/helpers/trajectory.ts (row slot)
- src/ui/views/DishScreen.tsx (`<SamplePanel />` and its import)
- src/ui/styles.css (.sample-panel, .sample-actions)
- tests/sim/view-switch.test.ts (tray pins and header comment)

Not touched: snapshot.ts (the held summary is added in host.sendSnapshot), state.ts, MoreSheet.tsx, content/, art/.

Protocol: new requests sampleBegin / samplePreview / sampleCancel; replies sampleBegun / samplePreview / sampleCancelled; optional `SnapshotMsg.sample`. PROTOCOL_VERSION is unchanged at 2: the changes are additive and optional.

## Commands and results

- `npx tsc -p tsconfig.json --noEmit` → clean. During the run another agent's in-flight src/ui/strings/lineage.ts had a TS6133 for a while; it is not mine and later cleared.
- `npx eslint <all my files>` → clean.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/sim/tools.test.ts tests/worker/sample-transaction.test.ts tests/sim/view-switch.test.ts` → `Test Files 10 passed (10) · Tests 82 passed (82)`. This was the final run, after all edits.
- `npx vitest run tests/sim/view-switch.test.ts tests/sim/tools.test.ts tests/worker/sample-transaction.test.ts tests/worker/protocol.test.ts tests/worker/host.test.ts tests/sim/world-stores.test.ts` → `6 passed · 71 passed`.
- `npx vitest run tests/sim/lab-commands.test.ts tests/persistence` → `6 passed · 76 passed`.
- `E2E_PORT=4234 E2E_OUTDIR=tmp/dist-tools-sample npx playwright test tests/e2e/sample-transfer.spec.ts --project=desktop` → `2 passed (4.1m)`. This was the final rerun on a clean build; the earlier run also passed. Port 4234 was stopped before and after.

## FENCE

None. No fence value moved, and no recipe was added.

## Notes and bugs noticed

- LabToolbar.tsx (not mine) still names the persistent tool ("Tool: Inspect") while a Tools-tray session runs. The sample panel says what is happening. A follow-up could show `activeTool()` in `toolName`.
- The scratchpad directory is shared by the wave's agents (generic names like final.log and e2e2.log collide). Use unique file names.

## PROPOSED DECISIONS

- PROPOSED DECISION: replacing a held sample (Begin while held, after confirmation) = Discard, then Begin. The worker refuses a bare second Begin.
- PROPOSED DECISION: Cancel also removes refused sample commands made while held. Every log entry with seq ≥ sample.seq leaves the log, along with its trailing 'command' event, so the reused seq numbers never duplicate a log entry.
- PROPOSED DECISION: Transfer destinations for held field cells must be transportOpen (open cells or porous beads, as the source cells were). Objects need no structure. Organisms need habitatCompatible, except a parasite riding a held host, which follows its host. Soft capacity counts the dish's own cellLoad plus the incoming B/b0 ≤ 8. Sampling never widens the brush. Deposits mode takes every deposit-kind field (grit too, when the silicate system exists).
- PROPOSED DECISION: the take is sent as a non-undoable command (Undo while held = Cancel). Transfer, Discard and Clean water are ordinary undo points. Sample commands are refused on comparison copies, and compareStart is refused while the source holds a sample.
- PROPOSED DECISION: txId = `sample-<tick>-<seq>`, which is worldId-free, so comparison arms and branches hash alike.
