# Wave 11 · structure-render-worker · build report

Phase 5 wave 11, stage 1 (D-0119). This task is the worker and render half of P5.1/P5.2 on screen: the one protocol bump (2 → 3), structures in the geometry, resins and the environment in each snapshot, climate and structure lines in the cell inspector, New Dish environment overrides, edge glyphs, device tiles, warmth and moisture overlays, previews that match the commands, and the gate preview tracer (paused only). Nothing is enabled, there is no schema change, contentHash is unchanged (67075b0e…), and the fence is unchanged.

## Checklist

| # | Item | Status | Where / proving test |
|---|------|--------|----------------------|
| 0 | Golden written first, from the unmodified HEAD code | DONE | `tmp/structure-render-worker/write-golden.ts` (scratch, not committed) ran on a clean tree (`git status` empty apart from the new folder) → `tests/fixtures/protocol2-golden/first-dish-104729-t300.json` (93 KB) and `rc1-lab-food-sample-t1600.json` (118 KB). Each holds the 14 slots per entity, ids, deposit bands 0–6, substrate/structure/shade, 24 listed cells (centre, outside, rim, stone, gel, both food objects, residents, fixed cells) with their CellInspect, EntityInspect for the 5 lowest birthIds, the light and sugar overlays, and stateHash. Byte arrays are raw-deflate + base64. |
| 1 | Protocol 3: PROTOCOL_VERSION 3, ENT_STRIDE 15, E_CUE3 14, the 13 CUE3 bits, DEPOSIT_BANDS 8 / DEPOSIT_GRIT_BAND 7 | DONE | protocol.ts:37, :422, :437, :495–508, :539; snapshot.ts:217 `cue3Of`, :383, grit band in `packDeposits`. Tests: protocol3.test.ts (layout, bits, grit band, version refusal) |
| 2 | GeometryMsg edges `{r, d, list}` with null when there are none, EDGE_FLOW_BACK, devices without `bound`, r/d transferred | DONE | protocol.ts:562–615; snapshot.ts:821 `packGeometry`, :833 `packEdges`; host.ts:3541 and the transfer list. Test: structure-snapshot.test.ts |
| 3 | SnapshotMsg.resins and .environment; client `environmentOf` / `resinsOf` | DONE | protocol.ts:746–763; snapshot.ts:865, :872; host.ts:3545; client.ts:162, :167. Tests: structure-snapshot.test.ts, and the equivalence test (neither key on a v1.0 snapshot) |
| 4 | DishInfo.systems and .speciesFreeClass | DONE | protocol.ts:695, :701; host.ts:3320 (`info`). Test: structure-snapshot.test.ts "DishInfo" |
| 5 | Overlays 'warmth' and 'moisture' (read only, max 1) | DONE | protocol.ts:55; snapshot.ts:419. Test: structure-layers.test.ts "packOverlay … never allocates" |
| 6 | CellInspect climate, lightFactors, edges (with tally), device; exposure.rival typed; EntityInspect local warmth | DONE | protocol.ts:1168, :1190–1250; snapshot.ts:734 `climateLines`, :758 `cellEdgeLines`, :798 `cellDeviceLine`, :616 (suitFactors.warmth via `localWarmthAt`). Tests: structure-snapshot.test.ts (5 cases), equivalence test (no new keys on v1.0) |
| 7 | RecipeOverrides lid/lightMode/drying: build() validates, recipeProvenance records only the keys given, NewDishPreview environment + climate | DONE | protocol.ts:78–80, :1685–1687; host.ts:2164–2169 (validation), :2192–2194 (provenance), :3397. Test: new-dish-environment.test.ts |
| 8 | Edge glyphs (pure geometry), drawn in the structures layer, colours ≥ 3:1, redrawn on geometry change | DONE | structureLayer.ts `edgeGlyph` / `edgeGlyphs`; layers.ts colour table (edgeMembrane, edgeSieve, edgeShutter, edgeChannel, edgeHalo, preview colours) exported through DISH_COLORS; renderer.ts:611 `drawEdges` (structuresG sits between the dish sprite and the film/deposits). Test: structure-layers.test.ts |
| 9 | Device tiles: 'device' appended last, 1024×2048, earlier frames byte-identical | DONE | art/src/tiles/structures.ts, art/src/tiles/index.ts (DEVICE last), palette.ts (additive); renderer.ts:631 `drawDevices`. Atlas 1678 → 1691 frames, still 1024×2048. Scratch proof (`tmp/structure-render-worker/atlas-diff.ts`): all 1678 earlier frame records identical, and 0 pixels differ outside the 13 new frames. Tests: structure-layers.test.ts, plus the updated atlas pins |
| 10 | Warmth and moisture overlays through the existing path, each with its own ramp and legend stops | DONE | layers.ts RAMPS.warmth / .moisture, `colormapFor`, painted opaque (0 is a real reading). Test: structure-layers.test.ts |
| 11 | Previews equal the commands; wetCellOutcome | DONE | structurePreviewModel.ts; structurePreview.ts:181 `wetCellOutcome` (additive; wave 10 exported no per-cell form); renderer.ts:1588 `setBrushPreview` (+ 'device', 'wet', optional `substrate`), :1659 `setEdgePreview`, :1699 `setRemovePreview`. Test: structure-preview.test.ts (12 cases) |
| 12 | Gate preview tracer, paused only, pure, no simulation randomness, reduced-motion static frame | DONE | gateTracer.ts; renderer.ts:1734 `setGatePreview`, :1740 `drawGateTracer` (through `tracerDrawList(sel, s.speed, …)`). Test: gate-tracer.test.ts (7 cases) |
| 13 | Perf, measured | DONE | Numbers below (taken under heavy contention) |
| — | The seven test files pass | DONE | 45 tests; see Commands |
| — | worker / render / ui / content / phase5-import suites pass | DONE | 68 files, 1090 tests: 4 failed on old pins (stride 14 in thumbnail.test.ts, the render import boundary, two atlas digest filters). All 4 were updated with a reason comment and re-ran green (85/85) |
| — | tsc, eslint, art:build --check | DONE | tsc clean; eslint clean on every changed file; `atlas up to date · 1691 frames … 1024×2048 · 393e81b629bc` |
| — | FENCE unchanged | DONE | 15 files, 116 tests passed (fence plus my seven) |
| — | E2E inspector, lab-tools, new-dish, place-and-undo, on desktop and phone-portrait | DONE | see E2E below |

## The protocol 3 layout (for stage 2)

**Version and stride**
- `PROTOCOL_VERSION = 3`.
- `ENT_STRIDE = 15`. Slots 0–13 are unchanged: `E_SLOT 0`, `E_SPECIES 1`, `E_X 2`, `E_Y 3`, `E_HEADING 4`, `E_FLAGS 5`, `E_GROWTH 6`, `E_ENERGY 7`, `E_HEALTH 8`, `E_LIFE 9`, `E_SIZE 10`, `E_CUE 11`, `E_CUE2 12`, `E_LINKMASK 13`. The new slot is `E_CUE3 = 14`.
- `ID_STRIDE` stays 2.

**CUE3 bits.** All are below 2^24, so exact in Float32. Each is read from authoritative columns in snapshot.ts `cue3Of`:

| Constant | Value | Rule |
|---|---|---|
| `CUE3_GLOWING` | 1 | glowState 1 |
| `CUE3_MOD_E02` | 2 | E02 in the genome |
| `CUE3_MODE_SHIFT` / `CUE3_MODE_MASK` | 2 / 12 | metabolicMode: 0 none, 1 Photo, 2 Sugar |
| `CUE3_HELD` | 16 | heldBySlot ≥ 0, valid reference |
| `CUE3_HANDLING` | 32 | handlingNeed > 0, valid prey reference |
| `CUE3_TRAP_SHIFT` / `CUE3_TRAP_MASK` | 6 / 192 | 0 idle, 1 armed (trapReserveC > 0, no target), 2 holding (valid trapSlot), 3 cooldown (trapCooldown > 0). Precedence: holding, then cooldown, then armed |
| `CUE3_JACKET_SHIFT` / `CUE3_JACKET_MASK` | 8 / 768 | min(3, max(0, ⌈4c⌉ − 1)), c = min(1, jacketMineral / (0.10 × B)) |
| `CUE3_JACKETED` | 1024 | jacketMineral > 0 |
| `CUE3_MOD_E11` | 2048 | E11 in the genome |
| `CUE3_SHELL` | 4096 | the species has SHELL and boundMineral > 0 |

**Deposits.** `DEPOSIT_BANDS = 8` (snapshot.ts). `DEPOSIT_GRIT_BAND = 7` is grit on the starch/detritus log scale, 0 without a grit field. It is packed but not drawn.

**Geometry**
- `GeometryMsg.edges?: GeometryEdges | null`, with `GeometryEdges = { r: Uint8Array; d: Uint8Array; list: readonly GeometryEdge[] }`.
- `EDGE_FLOW_BACK = 8` is ORed onto an S04 with flow −1.
- `GeometryEdge = { id, kind: 'S01'..'S04', cell, dir: 'R'|'D', open?, flow? }`.
- `GeometryMsg.devices?: readonly GeometryDevice[]`, with `GeometryDevice = { id, kind: 'S05'..'S12', cell, on?, resinSelect? }`.
- The worker always sends both keys. They are optional in the type only so that tools/render-bench.ts, which builds a protocol 2 shaped geometry, still type-checks. An absent key reads as none.

**Snapshot**
- `SnapshotMsg.resins?: readonly SnapshotResin[]` (`{ id, cell, saturation }`), present only when the dish has an S08.
- `SnapshotMsg.environment?: SnapshotEnvironment` (`{ lightMode, drying }`), present only when the world records 'climate'.

**Overlays.** `OverlayId` adds `'warmth' | 'moisture'`.

## APIs stage 2 builds on

**Client** (src/worker/client.ts)
- `environmentOf(dishId): SnapshotEnvironment | null` and `resinsOf(dishId): readonly SnapshotResin[] | null`, kept from the latest snapshot as `lidOf` is.

**DishInfo**
- `systems?: readonly string[]`: the world's recorded enabledSystems.
- `speciesFreeClass?: readonly ('small'|'medium'|'large'|'fixed'|'viral')[]`, in speciesIds order. 'viral' is included because V01 and V02 record `transportClass: "viral"`. Set `LifeBrush.shelterBlocked = cls === 'medium' || cls === 'large'`.

**CellInspect** (every new key is optional and absent on a v1.0 dish)
- `climate?: { warmth, ambientWarmth, warmthLocal, moisture, moistureLocal }`, only when the world records 'climate'.
- `lightFactors?: { cycle?: { phase, factor, secondsIntoPhase }, roof?, canopy? }`: exactly what chemistry.ts `lightFactors` returns beyond baseline and shade. In a climate world, roof and canopy are always present (1 when there is no roof or canopy).
- `edges?: readonly CellEdgeLine[]`, in N, E, S, W order. Each line is `{ id, kind, side, neighbour, code, open?, flow?: 'out'|'in', tally: { fields, organisms } | null }`.
- `device?: CellDeviceLine`, `{ id, kind, on?, resinSelect?, bound?, saturation? }`.
- `exposure.rival?: { amount, exposure, targets }` is typed only. e2-signals' chemistry.ts fills it.

**NewDishPreview**
- `environment: { lid, lightMode, drying }`.
- `climate: boolean`.

**RecipeOverrides**
- `lid?`, `lightMode?`, `drying?`.
- An unknown value gives `Unknown lid setting "x".`, `Unknown light setting "x".` or `Unknown drying setting "x".`.
- Without climate, a cycle gives "Day and night light needs the climate system, which this dish's content does not include." and drying gives "Drying needs the climate system, which this dish's content does not include."

**Renderer** (DishRenderer). Every method is cosmetic; the command's own result stays authoritative.
- `setBrushPreview(p)`: `p` is one of
  - `{ cells, rule: LabBrushRule, substrate?: SubstrateName }` (pass `substrate` for paint previews; without it an S04 side counts as refused for paint),
  - `{ cells, rule: 'life', life }`,
  - `{ cells, rule: 'device', structure: DeviceKind }`,
  - `{ cells, rule: 'wet' }`,
  - or `null`.

  It returns `{ ok, refused }`. Wet water cells are no-ops and are drawn neither tinted nor crossed.
- `setEdgePreview(p: { edges: ReadonlyArray<readonly [number, 'R'|'D']>; structure: 'S01'|'S02'|'S03'|'S04' } | null): { ok, refused, reasons }`. It works in edgeKey order with a running cap, and a repeated edge is previewed once. **The UI must send each edge once**: the command refuses a stroke that repeats an edge.
- `setRemovePreview(p: { ids } | null): { edges, devices, missing }`.
- `setGatePreview(sel: { cell, dir } | null): void`. It draws nothing while the current snapshot's speed ≠ 0.

**Pure helpers** for node-side logic:
- src/render/structurePreviewModel.ts: `previewModel`, `labCellPreview`, `lifeCellPreview`, `edgeStrokePreview`, `devicePreview`, `wetPreview`, `removePreview`.
- src/render/structureLayer.ts: `edgeGlyph`, `edgeSegment`, `deviceFrame`, `resinQuartile`, `deviceSprites`.
- src/render/gateTracer.ts: `tracerFrame`, `tracerToken`, `tracerCrosses`, `tracerPoint`, `tracerDrawList`.
- `wetCellOutcome(substrate, structure)` in @sim/structurePreview.

## What each test proves, and the mutant that fails it

Every mutant was applied by hand, run, and reverted; the files were checked after reverting.

**protocol3.test.ts** (6 tests): the full layout, every protocol 2 offset, the CUE3 bits (distinct, non-overlapping masks, < 2^24), E_CUE3 0 on a v1.0 dish, each bit set from and cleared with its column, the grit band, and the client's refusal text ("protocol version mismatch: worker 2, app 3") plus the worker entry's check.
- Mutant: ENT_STRIDE 14 with E_CUE3 13. Fails 3 tests here and both golden cases in the equivalence test.

**protocol3-v1-equivalence.test.ts** (4 tests): both golden dishes pack exactly as protocol 2 did. Slots 0–13 match by Object.is, slot 14 is 0, bands 0–6 are byte-equal and band 7 is 0, the geometry matches, edges are null and devices `[]`, there are no resins or environment keys, and CellInspect ×24 and EntityInspect ×5 deep-equal with no new keys. The overlays and stateHash match. A host snapshot of a shipped dish has no new keys. 300 packs between ticks change neither stateHash nor the full digest, and allocate no climate array.

**structure-snapshot.test.ts** (10 tests): the geometry arrays and lists; resend on placeEdges and on Undo, and none between ticks; resin saturation per snapshot without a geometry resend; environment following setLightMode and setDrying; the climate lines with a heater on after 200 ticks; lightFactors for the cycle and the roof (0.25), and absent without climate; edge lines (sides, codes, out/in, the tally, null before any); device lines; local warmth in EntityInspect; DishInfo.
- Mutant: EDGE_FLOW_BACK not set. Fails "GeometryMsg carries …".
- Mutant: resins only when geometry is resent. Fails "resins: … no geometry resend".
- Mutant: suitFactors reads settings.warmth. Fails "EntityInspect suitFactors.warmth …".

**new-dish-environment.test.ts** (6 tests): exact recording and settings; readable refusals with no dish created; byte identity with the HEAD-equivalent build for none, `{}` and mutationPreset; save round trips at ticks 0 and 120; a lid override yields no What if? ideas; the preview's environment and climate.
- Mutant: `lid: o?.lid` (writes `lid: undefined`). Fails the byte-identity test on its "no environment key" assertion. canonicalJson drops undefined, so the bytes alone would not have caught this mutant; the key check does.

**structure-preview.test.ts** (12 tests): the Lab place (stone/wall/bead) and paint (gel/sediment/water) previews equal applyHabitatEdit over a dish band, per reason and cell by cell, with device and barrier refusals present. A dish without structures gives the protocol 2 result. Edge strokes cover rim, stone, wall, barrier, channel ×2, the bead, ok edges, and the cap with 2 accepted and 3 refused. placeDevice covers rim, structure ×3, device, ok and cap. Wet counts are checked for three strokes. Life previews equal canOccupy for all 38 species, attached and free, on every cell (2 × 38 × 16384 checks).
- Mutant: the Life preview without the shelter extra. Fails the Life test.

**gate-tracer.test.ts** (7 tests): purity; for every code (none, S01, S02, closed and open S03, S04 in both directions) blocked tokens never leave their side and the expected set crosses; trail densities; the reduced-motion static frame; nothing drawn at speed ≠ 0; renderer.ts reaching the tracer only through `tracerDrawList(sel, s.speed, …)`; 4,000 frames between 400 ticks leave stateHash and the full digest unchanged; and source checks (no rng, det, Math.random, Date or performance.now; imports allow-listed).
- Mutant: drawing while running. Fails "draws nothing unless paused".
- Mutant: importing det from @sim/rng. Fails the source check.

**structure-layers.test.ts** (9 tests): glyphs on the shared edge at the grid bounds; chevron direction by flow; contrast ≥ 3:1 on water, gel and sediment for every glyph colour; edgeGlyphs from the GeometryMsg; device frame picks (0, 0.24, 0.25, 0.99, 1.0 → 0, 0, 1, 3, 3; S09/S10 on and off); the device tile appended last with 13 frames; the overlays.

## Commands and results

- Fence and my tests: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts <my 7 files>` → `Test Files 15 passed (15) · Tests 116 passed (116)` (675 s).
- Done-when suites: `npx vitest run tests/worker/{protocol,host,host-requests,whatif,whatif-ui,new-dish-preview-grid,thumbnail,probes,sample-transaction,challenge-host}.test.ts tests/render tests/ui tests/content tests/persistence/phase5-import.test.ts` → `68 files · 4 failed | 1086 passed (1090)`. The 4 failures were old pins, now updated. The re-run of those 4 files gives `Test Files 4 passed (4) · Tests 85 passed (85)`.
- `npx tsc -p tsconfig.json --noEmit` is clean. `npx eslint <every changed file>` exits 0.
- `npm run art:build -- --check` → `atlas up to date · 1691 frames (136 feature-mark frames, 26 world-tile frames) · 1024×2048 · 393e81b629bc`.
- `npx tsx tools/content-validate.ts` → `content ok · contentHash 67075b0e…` (unchanged). Its atlas line still lists 4 world tiles, because 'device' is not required by any enabled content (see the proposed decisions).

**E2E.** Port 4271 was stopped before and after. `E2E_PORT=4271 E2E_OUTDIR=tmp/dist-structure-render-worker npx playwright test tests/e2e/inspector.spec.ts tests/e2e/lab-tools.spec.ts tests/e2e/new-dish.spec.ts tests/e2e/place-and-undo.spec.ts --project=desktop --project=phone-portrait` → `26 passed (22.3m)` (13 per project, inspector, lab-tools, new-dish and place-and-undo; axe checks inside those journeys pass; no screenshot assertions; port stopped after).

**Perf** (`tmp/structure-render-worker/perf.ts`). Each figure is one pack of packEntities + packDeposits + GeometryMsg (packGeometry) + packResins + packEnvironment + one cell inspector, over 300 packs after 30 warm-up packs. These were measured while the e2e build and tests and the other agents were running, so they are inflated; the lead should re-measure.

| Dish | Mean | p95 |
|---|---|---|
| v1.0 FIRST_DISH_V1 t200 (56 organisms) | 2.58 ms | 7.76 ms |
| Same dish, second run | 1.98 ms | 5.05 ms |
| 400 organisms, 512 edges, 256 devices, 8 resins | 2.84 ms | 9.28 ms |

An earlier, less contended run gave 1.69 / 1.44 ms mean for v1.0 and 1.38 ms for the Phase 5 dish, which then had 266 organisms. GeometryMsg is built every pack here; the host builds it only when geometryVersion moves.

## FENCE notes

Unchanged. Nothing in this task touches the simulation. The only src/sim edit is the additive `wetCellOutcome` in structurePreview.ts. No fence value moved and no fence-update was run.

## Notes for the lead and stage 2

- **13 device frames, not 14.** The task's explicit frame list has 13 frames (s05, s06, s07, s08_0–3, s09_off/on, s10_off/on, s11, s12), but D-0119 says "14 frames". I built the 13 listed.
- **UX §7.4 "As built" row** (for the lead to add):

  | gate preview tracer | a static frame: every token at its end position (crossed tokens on the far side, blocked ones back at their start); drawn only while paused, in both modes | `src/render/gateTracer.ts: tracerToken (reduced), tracerDrawList`; `src/render/renderer.ts: setGatePreview, drawGateTracer` |

  Also: "edge glyphs, device and furnishing tiles, structure, edge and remove previews: unchanged, static in both modes: `src/render/structureLayer.ts`, `src/render/renderer.ts: drawEdges, drawDevices, setEdgePreview, setRemovePreview`".
- **Changes I would make in files outside this task:**
  - `tools/content-validate.ts`: add `device: { frames: 13, states: 's05 … s12' }` to TILE_FRAMES and an `{ owner: 'devices system', tile: 'device' }` entry to ALL_TILES and to `enabledTiles` (when enabledSystems has 'devices'), so content:validate requires the frames at the systems flip. Today phase3.test.ts compares 'device' separately (an edited pin) and structure-layers.test.ts pins it.
  - `tools/contrast-audit.ts`: add the four edge-glyph rows (DISH_COLORS.edgeMembrane, edgeSieve, edgeShutter, edgeChannel on water, gel and sediment). My test already holds them at ≥ 3:1: 11.34 on water, 11.10 on gel and 3.36 on sediment for the ink; 11.43, 11.18 and 3.38 for the channel colour.
- **Tests I edited because they pinned what this task moves** (a reason comment is in each file):
  - tests/worker/protocol.test.ts: the version 2, stride 14 and band 7 pin, now 3 / 15 / 8.
  - tests/worker/thumbnail.test.ts: a 14-slot hand-built record is now sized by ENT_STRIDE.
  - tests/render/phase3.test.ts: the render import boundary now also allows @sim/structurePreview, @sim/barriers and @sim/devices (pure modules; the task says src/render may import structurePreview, which needs the other two). Its tiles table comparison sets 'device' apart.
  - tests/content/art-p5.test.ts and art-p5-large.test.ts: the old-frame digest filters exclude `tile/device/*` (13 new frames). The pinned digests are unchanged, which proves no earlier frame moved.
- **Bugs or risks noticed elsewhere:**
  - barriers.ts imports runtime `./entities` (FLAG, LIFE_ACTIVE), so the main-thread bundle now pulls entities.ts through the renderer's @sim/barriers import. It is small, but if the lead wants src/render lighter, the CT §5.3 table (edgeFactor / edgePermits) could move to a module without entity imports.
  - barriers.ts `edgePermits(EDGE_SHUTTER_OPEN, 'fixed')` returns true, while its doc says "Fixed never crosses a barrier". An open shutter counts as no barrier, which is consistent with "open S03 everything", but the doc line reads oddly.

## Proposed decisions

- **PROPOSED DECISION:** GeometryMsg.edges and .devices are optional in the TypeScript type, but the worker always sends both. Absent reads as none. Reason: a tool outside this task (tools/render-bench.ts) builds a protocol 2 shaped GeometryMsg, and the shape stays honest.
- **PROPOSED DECISION:** DishInfo.speciesFreeClass includes 'viral' for V01/V02. Reason: freeClassOfSpecies returns the record's transportClass, so a 4-value type would misstate phage records. A viral brush is a material brush and never reads shelterBlocked.
- **PROPOSED DECISION:** CUE3 trap precedence is holding > cooldown > armed. Reason: a trap holding a target is the most specific state, and "armed" requires no target. Wave 12–13 may refine it without a protocol bump, as long as the 2-bit range holds.
- **PROPOSED DECISION:** setBrushPreview's paint rule takes an optional `substrate`. Without it, an S04 side is shown refused for paint, which is conservative and never promises what the command refuses. Stage 2 passes the painted substrate.
- **PROPOSED DECISION:** the device preview (`rule: 'device'`) uses a running count over the cells given (store size + cells accepted before), the same way the edge stroke works. placeDevice places one device per command, so for a single cell this is exactly the command's rule.
- **PROPOSED DECISION:** the warmth and moisture overlays are painted opaque at 0. Reason: 0 is a real reading (cold, or dried out), as pH's whole range is painted. Their ramps differ in lightness end to end; the simplified palette still applies.
- **PROPOSED DECISION:** edge glyph widths are at least about 1.5 screen px and are redrawn when the zoom moves by more than 25 %. That is a redraw on a zoom change, never per tick, and it keeps the glyphs readable at every preset.
- **PROPOSED DECISION:** the gate tracer accepts EDGE_NONE (everything crosses) as well as barrier codes. The token lanes are fixed per class along the edge, so a class is told apart by position as well as colour.
