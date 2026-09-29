# DECISIONS — running log of judgment calls made during implementation

Append‑only. One entry per decision the canonical docs did not settle (or a concern about a
canonical rule you implemented anyway). Rulings made *before* implementation are in
`CONFLICT_REGISTER.md`; do not duplicate them here.

Format:
```
## D-#### · YYYY-MM-DD · <task id> · <short title>
Context: what the docs say / don't say.
Decision: what was done.
Reason: why, tied to the non‑negotiables (truthful, deterministic, conserved, understandable, emergent).
Affects: files / fixtures / versions bumped.
Owner review: yes|no (if yes, also listed in EXPANSION_RESPONSE.md §8)
```

---

## D-0001 · 2026-09-27 · baseline · Decision cadence adopted from Phase 0
Context: D01 implies per‑tick movement decisions; D05 §5 specifies a 0.5 s decision interval for
strategies (Ancestral = template controller). With one ruleset (R03), two cadences would mean two
code paths.
Decision: every self‑propelled organism decides direction every 0.5 s from Phase 0; passability is
rechecked every tick; predators re‑target on the same schedule and pursue every tick.
Reason: one controller path, fewer sensing evaluations, identical behavior once D05 lands.
Affects: SPEC §6.4; movement fixtures.
Owner review: no

## D-0002 · 2026-09-27 · baseline · Birth placement candidate order
Context: D01 says "select birth positions by deterministic priority" without naming it.
Decision: candidates = parent cell + 8 neighbors filtered by compatibility/passability/capacity;
ordered by crowding ascending, then a fixed neighbor index (E, S, W, N, NE, SE, SW, NW, center);
fungi rank by usable food then suitability per D01 §8.
Reason: deterministic, favors space, no randomness needed.
Affects: SPEC §6.9; blocked‑division fixture.
Owner review: no

## D-0003 · 2026-09-27 · baseline · Sensing locus rounding
Context: D03 multiplies an integer radius by a continuous factor and clamps 1–6.
Decision: `round(r × (0.5 + g))` then clamp 1–6; at g = 0.5 this equals the native radius for
all templates, satisfying C07.
Reason: cells are discrete; neutral founder equivalence preserved.
Affects: SPEC §8.2; neutral‑founders fixture.
Owner review: no

## D-0004 · 2026-09-27 · P0.6 · Death-cause attribution window
Context: SPEC §12.2 attributes the primary cause to "the largest health-loss contributor over the final 10 s". A literal 10-second window needs a per-entity ring of damage samples.
Decision: per-source damage accumulators decay by e^(−dt/10) each tick (a 10 s time constant); the largest accumulator at death is the primary cause, and sources ≥ 25 % of it are concurrent contributors. Age, predation, lysis and sampling remain definitive causes.
Reason: equivalent intent with 4 floats per organism instead of a ring buffer; deterministic.
Affects: src/sim/maintenance.ts.
Owner review: no

## D-0005 · 2026-09-27 · P0.8 · FIRST_DISH_V1 Sunbead radius 4 → 5
Context: D06 §6 places 12 A01 "within radius 4 of (48,48)", but (48,48) lies inside the Water Garden stone disk at (42,45) r 9. Only 10 water cells exist within radius 4, so the recipe as written cannot be realized.
Decision: FIRST_DISH_V1 uses radius 5 for the A01 founders. Because founders take the nearest valid cells (distance, then y, then x), the 12 chosen cells are identical for every radius ≥ 4.5; radius 5 is the smallest integer that fits. The recipe keeps its ID because the original was never realizable, so no prior behavior exists to preserve. The realizer never silently widens a radius: an unrealizable recipe is an error.
Reason: smallest change that realizes the documented intent; placement stays exact and reviewable.
Affects: content/recipes/FIRST_DISH_V1.json, docs/CONTENT_TABLES.md §9.1.
Owner review: no (disclosed in EXPANSION_RESPONSE §3)

## D-0006 · 2026-09-27 · P0.2 · Attached species list water as a habitat
Context: CT §1.3 gives attached species (B02, B13, F01–F04, P06) only attachment surfaces. Mesh, beads and stone edges also occur in water cells.
Decision: their `habitats` include every substrate a valid surface can sit on (B02, B13, F01, F02, F04: water/gel/sediment; F03: water/sediment; P06: water), while `attachment.surfaces` restricts where they may actually live. From Phase 3, `canOccupy` must require a listed attachment surface in the cell for attached species (gel/sediment substrate, stone edge, bead, or mesh), so plain open water stays off-limits.
Reason: mesh (S06) and beads are useless to fungi otherwise; the surface list remains the real constraint.
Affects: content/species/*.json; Phase 3 task P3.3 must implement the surface check.
Owner review: no

## D-0007 · 2026-09-27 · P0.2 · Siltworm habitat and water crossing
Context: CT §1.3 says P04 lives in "sediment (+ ≤ 2 water cells)".
Decision: P04 `habitats` is ["sediment"]; the SEDIMENT_WATER_CROSSING ability (Phase 3) makes up to two consecutive water cells passable and treats them as habitat-compatible while crossing, so the worm is not damaged mid-crossing. P04 moisture tolerance is [0.4, 1] (a sediment consumer, not a water consumer).
Reason: keeps habitat semantics simple and puts the special rule where it belongs.
Affects: content/species/P04.json; P3.4.
Owner review: no

## D-0008 · 2026-09-27 · P0.2 · Film halves total inhibitor exposure once
Context: SPEC §7.1 mentions film halving the bacterial inhibitor; CT §3.4 and SPEC §4.3 say film halves total exposure once.
Decision: film halves the organism's combined effective exposure (all targeting inhibitors + RIVAL term) once. Material guide texts say so.
Reason: CT §3.4 and SPEC §4.3 are the more specific statements; D02 §5 confirms "Biofilm halves the combined exposure once".
Affects: src/sim/suitability.ts; content/materials/INH_*.json, M08.json.
Owner review: no

## D-0009 · 2026-09-27 · G0 · Adversarial review of the Phase 0 core
Context: six subsystem reviewers compared src/sim with the SPEC before tagging g0; skeptics tried to refute each finding.
Decision: fixed every confirmed defect, each pinned by tests/sim/review-regressions.test.ts:
- cell load was read stale by stage 1 (inoculation) and stage 9 (crowding/placement): it counted organisms killed in stage 7 and differed after save/reload → rebuilt from live state at the start of stage 1 (when commands are due) and stage 9;
- nutrient/oxygen limiting fractions were read from pools already changed by earlier commits in the same loop (slot-order dependence; photosynthetic O2 and surplus N funded others in the same pass) → fractions are computed per cell from the stage snapshot before any commit;
- weighted feeding redistributed the availability shortfall, cancelling avail(P) → weights renormalize over present foods and availability still applies;
- feeding cue, intake timestamp and first-intake milestone fired when nothing was consumed → guarded by Cs > 0;
- conserved pools were clamped with Math.max(0, …) → subtractPool() zeroes only roundoff dust, logs it in ledger.roundoff (included in the expected total) and throws on anything larger;
- the parent's own cell double-counted its biomass in placement → own-cell load is unchanged by a split;
- capacity bookkeeping counted per event and missed inoculations → one per-tick flag folded in at stage 10;
- FLAG.capacityBlocked stayed set when a later gate blocked → cleared each birth pass;
- predator targeting read positions already moved this stage → start-of-stage position snapshot;
- equal-score wander tolerance was 1e-12 → 1e-9 per SPEC §6.4;
- stress onset accumulated across interrupted episodes → requires 3 continuous seconds;
- unpaid energy was subtracted from maintenance only → ledger records what was actually paid, maintenance first.
Reason: conservation, determinism and truthful cues are non-negotiable.
Affects: src/sim/{intake,births,commands,movement,maintenance,publish,ledger,world,serialize}.ts; tests.
Owner review: no

## D-0010 · 2026-09-27 · G0 · Companion nutrient diffusion (review finding rejected)
Context: a reviewer proposed moving companion nutrient only with the net carbon flux at the donor's N/C ratio.
Decision: keep diffusing companion fields with the same per-edge coefficients as their carbon. Gross flow a→b carries k·C_a·(N_a/C_a) = k·N_a and b→a carries k·N_b, so the net nutrient flux k(N_a − N_b) is exactly "moving in the same fraction as its carbon" at each cell's own ratio. The net-flux variant would stop nutrient mixing between cells of equal carbon, which is not how dissolved material spreads.
Reason: both conserve exactly; this one matches D02 A1 and physical intuition. Pinned by the conservation fixtures.
Affects: none (documentation).
Owner review: no

## D-0011 · 2026-09-27 · P1.5 · Dissolved sugar is shown as a faint haze by default
Context: UX §6.5 shows dissolved sugar only through the overlay. In playtesting screenshots the Garden's sugar patch was invisible, so a player could not see the food they placed with Feed.
Decision: the deposit layer draws a faint warm haze where sugar exceeds a small band, scaled by the real amount (sent in the snapshot's fifth deposit band). It adds no information that is not in the simulation.
Reason: "understandable before deep"; Explore must show where food is.
Affects: src/worker/snapshot.ts, src/render/layers.ts.
Owner review: no

## D-0012 · 2026-09-27 · G0 follow-up · Determinism-review findings
Context: the determinism/persistence reviewer (sixth dimension of the G0 review) reported three minor issues after g0 was tagged.
Decision: (1) stage 6 scratch is cleared in a finally block, so an exception can never leak demand totals into a later tick or another dish in the same worker; (2) a paused edit (applyNow) folds the capacity-hit flag into its bookkeeping immediately, so no transient flag is ever live at a save boundary; (3) the spatial index is rebuilt at the end of stage 9 and after every paused edit, so derived state at a tick boundary equals what deserialization rebuilds.
Reason: SPEC §15 — derived caches must never differ between a continuous run and a reload.
Affects: src/sim/intake.ts, commands.ts, births.ts; regression test in tests/sim/review-regressions.test.ts.
Owner review: no

## D-0013 · 2026-09-27 · P1.9 · IndexedDB for saves on web and Android
Context: R27 chose Capacitor Filesystem with temp-write-verify-rename on Android. IndexedDB is available inside the Web Worker and the Capacitor Android WebView, stores data in the app's private directory, and commits a multi-store transaction atomically.
Decision: saves are written from the worker to IndexedDB on both platforms: one readwrite transaction puts the new gzip-compressed record, updates the slot pointer, keeps the predecessor and deletes the older record, all or nothing. Capacitor Filesystem/Share are used for export and sharing only (P4.6/P4.10). If IndexedDB is unavailable (private browsing), saves fall back to memory and the UI says so.
Reason: true atomicity instead of emulated rename semantics; one code path; no main-thread copies of multi-megabyte saves.
Affects: src/persistence/{store,idb,compress,saveFile}.ts, src/worker/{host,sim.worker}.ts. Android persistence across process death is to be verified on a device (EXPANSION_RESPONSE §7).
Owner review: no

## D-0014 · 2026-09-27 · P1.10 · Charts use small multiples, not species colors
Context: the dataviz validator fails the organisms' identity hues as a categorical chart palette (ochre vs amber normal-vision ΔE 4.8; coral vs green deutan ΔE 2.5; all below 3:1 on the panel surface). No re-stepped hue-matched set passed.
Decision: species charts are small multiples — one sparkline per species, labelled with its sprite and name — drawn in a single validated ink (#256E9E, 5.3:1). Environment series are separate single-series charts. Every chart has a crosshair tooltip, a text summary and a table view.
Reason: identity never depends on color; charts stay honest for color-vision deficiencies; matches the "readable without color" principle.
Affects: src/ui/panels/HistorySheet.tsx.
Owner review: no

## D-0015 · 2026-09-27 · P1.12 · Keep FIRST_DISH_V1; no V2 at G1
Context: the G1 seed report meets the D06 pacing targets on 6/6 seeds. It shows Crumbsmiths stalling after about 60 s and Recyclers emptying their patch by about 120 s. Three one-setting recipe revisions were proposed.
Decision: keep FIRST_DISH_V1. All candidates were measured in memory on the six seeds (table in docs/reports/tune-g1.md). The starch-sugar bootstrap doubles conversion but does not help Crumbsmiths persist. Moving the debris patch makes Recycler outcomes swing from extinction to a bloom. Neither is a clear improvement to the opening.
Reason: BUILD_DIRECTIVE P1.12 tunes the recipe only when targets are missed; "targets to check, not to force". Extinction and quiet corners are valid outcomes, and the guide text already says "None of this is guaranteed."
Affects: content/recipes (unchanged). Re-measure the proposals at P3 tuning when the launch ecology is enabled.
Owner review: no

## D-0016 · 2026-09-27 · P1.5 · Aggregation exactly when the snapped sprite scale is below 1
Context: ARCH §9 snaps sprite scale (pxPerCell / 8) to {0.5, 1, 2, 3, 4} and hides sprites "below 1 (whole dish)"; BUILD_DIRECTIVE P1.5 says "aggregation below neighborhood zoom". The first renderer used zoom < 5 with a fade band and drew fractional scales below 6 px/cell. The G1 verifier found desktop could never reach aggregation.
Decision: follow ARCH §9 literally. Snap to the nearest of {0.5, 1, 2, 3, 4}; at 0.5 (below 6 px/cell) sprites are hidden and the aggregation layer is drawn; otherwise sprites draw at whole-number scales. On large desktop viewports the whole-dish preset is at least 6 px/cell and shows scale-1 sprites, not aggregation.
Reason: crisp integer scales everywhere; phone whole-dish (the constrained case) aggregates; legible sprites are kept where the screen can show them.
Affects: src/render/camera.ts, renderer.ts; tools/render-bench gates.
Owner review: no

## D-0017 · 2026-09-27 · P1.7 · Sheets scroll inside, and the inspector keeps its organism in view
Context: UX §4.1 forbids panels covering the selected organism without a reposition route. On phone portrait the inspector covered the selection. Separately, headless Chromium (SwiftShader) dropped the WebGL canvas above any scrolling sheet laid directly over it.
Decision: (1) opening the inspector, switching organism, or collapsing/expanding pans the camera (never zooms) so the organism sits in the uncovered part of the viewport; (2) a collapse button shrinks the inspector to its header and constraint sentence; (3) every sheet is a non-scrolling frame with an inner `.sheet-scroll` element, which renders correctly in the same environment.
Reason: UX §4.1; the compositor artifact could not be ruled out on Android WebView, and the structure costs nothing.
Affects: src/ui/panels/*, src/ui/styles.css, src/render/camera.ts (revealAt). Verify on a device at P3.12.
Owner review: no

## D-0018 · 2026-09-27 · P1.3 · Protocol stamping and stale-packet rule as built
Context: ARCH §7 has the main thread's command carry seq and targetTick, and every packet carry stateGeneration. The worker as built stamps seq/targetTick itself when a command arrives (the worker owns the tick clock, so the stamp is exact), and only snapshots carry a generation (other responses are routed by requestId and cannot be stale). History compaction also changed: the per-second window keeps 1,800–1,859 samples and compacts a whole minute at a time.
Decision: keep the worker-side stamping and requestId routing; document them here. Every message now carries protocolVersion, and the client rejects a mismatch.
Reason: determinism is anchored in the worker's clock; request/response pairs are matched by id.
Affects: src/worker/{protocol,host,client}.ts, src/sim/history.ts.
Owner review: no

## D-0019 · 2026-09-28 · P2.1 · Module framework and the resting stage as built
Context: SPEC §9, §7.6 and CT §7/§12.7 leave several thresholds and orderings open.
Decision:
- A tick counts as feeding for dormancy only if intake reaches 1 % of the intake ceiling, and food counts as present from 0.001 C per cell; otherwise diffusion traces would keep every organism "fed".
- "Suitable environment" to wake means suitability ≥ 0.10; "suitable moisture" means moisture suitability ≥ 0.20. Rest triggers keep counting during the 30 s post-wake lockout; only entry waits. If both triggers fire together the recorded cause is "too dry".
- E05 upkeep (0.03 E/s) and module surcharges are replaced by the resting rule while Resting. Waking blocks feeding, movement and secretion (D05 supports this; SPEC §7.6 names feeding and reproduction).
- Reserve fill band 0 = energy at or below the base cap; bands 1–3 = thirds of the extra room in use.
- An E01 carrier uses the producer rule of moving toward starch while above 35 E.
- Module numbers come from the world's recorded module registry; native starch release and native dormancy use CT constants.
- Both daughters start Active with dormancy clocks and lockout reset. For E03 carriers the dormancy locus is active in phenotype, mutation, Varied founders, branch qualification and comparison trait distributions.
- The idle chip reads "Staying in place", so "resting" only ever means the resting stage.
- Visuals: every E03 carrier shows a small seam; the prepare/rest/wake frames show during the cycle (SPEC §9 "small folded seam; folded pose only while resting"). Module marks are built at runtime from art/src/layers for now; packing them into the atlas (ARCH §10.1) is a follow-up.
- World schema 2 adds the dryTimer column; schema 1 saves migrate by copy (dryTimer 0) through the normal import path, with an old-save test. Imports with an impossible life state or module set are refused before a world is built.
- Content validation requires E03 wakeMinEnergy ≥ wakeCost and entryMinEnergy ≥ prepareCost.
Reason: SPEC §9/§7.6, §14.5; honest labels; saves are sacred.
Affects: src/sim/{modules,dormancy,moduleView,phenotype,maintenance,movement,births,mutation,serialize,world}.ts, src/persistence/saveFile.ts, src/render/features.ts, UI strings.
Owner review: no

## D-0020 · 2026-09-28 · P2.4 · Comparison engine as built
Decision: the worker stores the baseline once and makes A and B as copies of it; the player's dish never advances during a comparison and resumes its prior speed on close (paused if the app was backgrounded meanwhile). One change per comparison in the UI ("change one thing"); the engine accepts a list for experiments, and a change that places nothing is discarded so A and B stay identical. Each tick steps A then B; pace (Pause, 1×, 4×, Fast) never changes tick counts; default horizon 60 s at 4×. Diversity index: Shannon over living counts (documented in comparison.ts). Compare is entered from More (UX §2.4). Result cards are kept in localStorage (max 50) until the Notebook lands in Phase 4.
Affects: src/worker/comparison.ts, host.ts, client.ts, src/ui/views/Compare*, src/ui/panels/Compare*, MoreSheet.
Owner review: no

## D-0021 · 2026-09-28 · P2.6 · What if? variants as built
Decision: catalog order is ascending variant id (the CT §9.4 table order); Another idea cycles through all supported variants of the source, including R-G0, never returning the current one, while the sheet lists only variants with a patch. A variant world records the source recipe id/revision, createdFrom "variant" and a variant record with `sha256:` checksums of the canonical source and variant JSON and the tick-0 stateHash. A patchSet replaces a quantity the source patch already sets; a patchMove needs the whole old and new disks open with equal counts (refused, never cropped). Again's identity is the variant revision plus both checksums (D09 §4); the tick-0 hash is compared only when content and rule versions are unchanged, so a content update elsewhere never blocks Again. Refusal messages name the idea, never hashes. Again always takes an explicit new world id.
Affects: src/sim/variants.ts, recipes.ts, content/variants, registry validation.
Owner review: no

## D-0022 · 2026-09-28 · P2.5 · Experiments framework as built
Decision: arm A is the recipe as written; arm B gets the one declared change (setup `omitPatch`/`shade` before tick 0, or commands applied to B after both arms are copied from one state). Gates are "all clauses hold" predicates checked each simulated second; reaching one stamps the journal and never stops the world. EXP_B realizes both arms from FIRST_DISH_V1 run to 120 s inside the runner instead of a scheduled snapshot command in the recipe (R36): same states, same hashes. Light and life shades the whole of copy B (light × 0.1) as a setup change until the Lab shade tool exists. Food trail uses two deposit strokes covering exactly the 315 trail cells. Cleaning crew: 10/113 C and 1/113 N per cell over the r 6 disk. Foundation cards use Water Garden defaults and nearest-first founders. Patch inputs are always reported by the source recipe's patch index, also in an arm that omitted a patch.
Gates chosen where the docs are open (flagged for the owner): EXP_A gates on positive starch conversion (CT §10.5), not survival; EXP_B on the grazers arriving; EXP_106 on at least one capture; EXP_102 accepts a difference in either direction.
Measured limiting factor, EXP_A: all 12 Crumbsmiths starve in both copies by about 153 s (food access at their own cells; secretion doubles spending, energy falls under the 35 E emit threshold at about 35–40 s). Recorded in docs/reports/experiments-g2.md; no revision applied.
Affects: src/sim/experiments.ts, content/experiments, content/recipes (five new recipes).
Owner review: yes (EXP_A revision to bootstrap 0.50 — keeps them alive but no longer separates the copies; rectangle patch shape).

## D-0023 · 2026-09-28 · P2.1 follow-up · Energy held at death is ledgered
Context: CLAUDE.md requires every energy gain and loss to be recorded; an organism's remaining energy vanished at death without an entry (a captured prey's was already recorded).
Decision: killEntity adds the organism's remaining E to ledger.energy.dissipated.
Affects: src/sim/maintenance.ts (all endpoint hashes change at this commit; the tuning baseline is re-measured at P2.9).
Owner review: no

## D-0024 · 2026-09-28 · P2.7 · Lab view as built
Decision:
- Sealing a cell with stone or wall moves everything in it (dissolved fields and deposits) to the nearest open cells on the same side, in equal shares, never across an existing structure; if a sealed region has no open neighbour the whole stroke is refused. Sealing is displacement, not diffusion, so SPEC §2.2 "deposits never diffuse" is not violated. Moves are internal and exact; the amount moved is recorded in the command result (kept in the command log) and shown to the player, not written as a ledger input or export. Beads move nothing, hold dissolved material and let solutes through; they block free swimmers.
- Stone, wall and bead skip cells holding a live organism (any life state) or a structure; "wall cannot cross the rim" clips the stroke to the dish and reports the cut cells. Painting never changes the substrate under a structure, so erasing restores it. Shade can be painted on any cell inside the dish.
- The Lab tool persists across view switches; Explore returns to Look; a stroke in progress at a switch is dropped; the Lab overlay is hidden in Explore and restored in Lab. On phones the brush cell count is a chip over the dish so the toolbar never changes height.
- Brush radius is exactly 1, 3 or 6 (CT §5.1); malformed commands (other radii, non-finite points, more than 20,000 points, points far outside the grid) are refused whole.
- Content is data: the WATER, GEL, SEDIMENT and SHADE paint materials are enabled in the manifest and STONE, WALL and BEAD are Structure records (ARCH §2 structures/*.json); the Lab offers a tool only when the world's own manifest enables it, so an older world without them keeps its recorded content.
Reason: UX §4.4, SPEC §10, CT §5.1, CLAUDE.md "content is data" and "saves are sacred"; wave B verification (docs/reports/reviews/g2-wave-b/lab-verify.md).
Affects: src/sim/{grid,structures,commands}.ts, src/ui/views/Lab*, src/ui/panels/{LabTray,Overlay}*, content/materials, content/structures.
Owner review: no

## D-0025 · 2026-09-28 · P2.3 · Branches, lineage panel and specimens as built
Decision:
- A branch is established when at least 5 qualifying members are alive and at least one living member is 3 or more generations past the root (D4 thresholds unchanged). A candidate stays open through its member's division until both daughters are recorded, so the root is the oldest qualifying ancestor of an unbroken chain. After a branch is named, members that already qualify against the new reference genome become candidate roots at once (oldest first), so sub-branches are found by the same rule (SPEC §8.5).
- A branch is extinct only when neither it nor any branch descended from it has a living member; a division never makes a branch extinct. These bookkeeping fixes also apply to worlds loaded from older saves; they touch only the notebook, never births or survival.
- Names: "Species · Descriptor · ShortID"; the descriptor comes from the qualifying difference (module gained → module name; lost → "Without …"; largest locus change → that locus's high/low word; policy → "Mixed/Ordered feeder"; weight → "{Food}-leaning"); colliding short IDs get "-2"; player names are cleaned to ≤ 60 characters and the ID always shows.
- Cost lines on the discovery card and panel are computed from the two phenotype profiles (never fixed copy) and are prefixed "Game rule:".
- Specimens live inside the world (optional branches.specimens, ≤ 50 per dish); spawning is a `lineage` command with nearest-cell placement, no randomness, ledgered as `introduce:specimen`, undoable like Add Life, and starts a new line. Rename, pin and save are logged commands, not chart interventions, and survive Undo of an earlier command. A cross-dish specimen shelf waits for the Phase 4 gallery.
- Pinned branches keep their birth details through lineage compaction (CT §12.10).
- Trait overlay: five bands (0–39, 40–46, 47–53, 54–60, 61–100), inactive loci grey; the legend names and counts every band and matches the dish colours; at wide zoom each cell shows its most common band.
- Discoveries are detected from the snapshot's branchCount (the first snapshot of a dish is the baseline); one card per 1.5 s burst and at most one new card per 60 s (CT §12.10); Undo past a discovery closes its card; "Pause on discoveries" lives in Settings.
Reason: SPEC §8.5, UX §5.5, CT §12.8/§12.10, honest labels; wave B verification (lineage-verify.md).
Affects: src/sim/{branches,lineage,specimens,commands}.ts, src/worker/*, src/render/renderer.ts, src/ui/panels/{Lineage,Discovery}*.
Owner review: no

## D-0026 · 2026-09-28 · P2.6 · What if? sheet as built
Decision:
- The "active slot" is the named slot a dish was opened from or last saved to, tracked per dish by the worker. Starting an idea saves the current dish there (the store keeps the previous copy), otherwise to the first empty slot; with all ten slots used the player chooses export-then-start, a confirmed replacement, or Cancel (nothing changes).
- A variant dish is treated as "unchanged, rebuilds exactly" (and not saved again) only when it is at tick 0 with its recorded start hash and the variant revision, both checksums, the contentHash and the rule versions all match this build; otherwise it goes through the normal save flow.
- What if? is a modal blocking panel: opened over a dish it pauses the dish (restoring its speed on close), the dish behind is inert and ignores keys, and the worker pauses the dish while saving so every write holds one moment. Refusals come back as a `whatIfRefused` reply with a readable message, not an error packet. Export is two steps: a real download, then an explicit "Start the new dish".
- Ideas are offered only for a dish that is the authored recipe itself (same id, revision and seed, no overrides, not empty) or a variant dish; a custom dish gets none (D09 §4: "offer Duplicate dish"). Ideas always start from the authored recipe, never from the current dish. A variant dish's world id is the new dish id and its name is the variant title; its provenance is also in the save file's meta.
Reason: D09 §4–§5, UX §3.4, SPEC §13.3; wave B verification (whatif-verify.md).
Affects: src/worker/host.ts, src/ui/panels/WhatIf*, src/persistence/saveFile.ts, MoreSheet, Play.
Owner review: no

## D-0027 · 2026-09-28 · P2.5 · One paired-run model, Experiment C and the cards in the app
Decision:
- One paired-run model (src/sim/pairedRun.ts: ArmObserver, PairedRun, measureArm, measureSummary) serves the comparison engine and the experiment cards; every wave A number is unchanged (golden file tests/experiments/golden/wave-a-measurements.json, 2,771 values).
- Experiment C: arm A is RESERVE_COMPARE_V1 with its stable-food schedule; arm B omits the scheduled meals (`omitScheduled`, D06 §8). The gate requires stored surplus in copy B (reservePeak.B01 > 0), the precondition of the card's question (D06 §11). On V1 it is not reached on seed 104729: energy peaks at 80–87 E because food access limits intake from 30 s, so the chamber's extra room is never used; everything starves (B by 230 s, A by 488 s). A meal dose of 2.0 reaches the gate on all six dev seeds (26.6–29.6 E stored in total). No mechanic, constant or recipe number was changed; EXP_C is not release-ready until the owner picks a recipe revision.
- A founder group is the organisms alive when the run starts, grouped by species and module set; births join their parent's group; organisms introduced mid-run join none. Seeded founders' modules are labelled "present at creation".
- Starting a card replaces the open dish the way Play and New Dish do, after an autosave to Continue, without writing a named slot. A player command that changes the dish ends a single-arm card's observation (a refused command does not). An observation cannot resume after the dish is closed and reopened (observer history is not saved) and the dish says so. Stamps require the card's measured gate and its listed player steps.
- The journal is a device store (localStorage `pixelmeba.journal`, newest first, ≤ 200 stamps). SPEC §14.1 lists the journal as save content: from P2.8 on, journal entries that belong to a dish are also written with that dish's save (outside the state hash) and exported with it; the device list remains the Notebook index.
Reason: SPEC §13.2/§13.4/§14.1, CT §9.2/§10, D06 §8/§11; wave B verification (experiments-verify.md).
Affects: src/sim/{pairedRun,experiments}.ts, src/worker/{comparison,host}.ts, src/ui/views/{Notebook,Experiment*}.tsx, src/ui/journal.ts, content/experiments/EXP_C.json, content/recipes/RESERVE_COMPARE_V1.json.
Owner review: yes (RESERVE_COMPARE_V2 with a 2.0 meal dose so the gate can be reached; like D-0022's EXP_A question)

## D-0028 · 2026-09-28 · P2.3/P2.5/P2.6/P2.7 · Wave B fix rounds (verifier findings)
Context: two fix rounds and a lead pass closed every wave B verifier finding (docs/reports/reviews/g2-wave-b/). Rulings made on the way:
- Lab: sealing is planned by one outward search from the open cells (bit-identical to the per-cell rule of D-0024, which a test keeps as the reference; the whole-dish scribble went from 8.3 s to 21 ms). A habitat edit may sample at most 100,000 brush disks (`LAB_MAX_STROKE_SAMPLES`), and food deposits are bounded the same way (radius 0–6, finite points near the dish, ≤ 20,000 points); longer or malformed strokes are refused whole. Structure records are keyed by ID to simulation behaviour, like modules; `Manifest.enabledStructures` is optional (absent = none), so no world schema bump; the world's own manifest drives which structure tools the Lab offers (DishInfo.structureIds). A world paints only with its recorded paint materials; the shade factor is its SHADE record's dose (one factor in (0, 1] at every dose). Habitat rules text states only rules that hold in every phase and names no organism; which organisms live in a substrate is a computed line from the world's species. Refusals, change lines and the inspector's Ground row use content names. While a specimen waits for placement the Lab gives taps to the dish screen. Shade is drawn on every shaded cell; overlays draw on porous beads.
- Lineage: a member that already qualifies against a newly named reference starts a candidate rooted at its oldest qualifying ancestor (retained birth records). "Game rule:" lines list every profile number that differs, branch value first; module surcharges are quoted as charged after inherited multipliers (the module card uses the same number). Band rings under the bodies replace sprite tints (palette 0x2f6bc0 / 0x8fbde8 / 0xf2efe6 / 0xf5b56a / 0xd4552a; inactive 0x7a7a7a). Pinned branches keep their founder, parent, sibling and child records beyond the 10,000 recent (`lineage.keep`/`kept`, saved, not hashed); hashed state never reads them (Branch.rootGeneration, optional, recorded at naming). Undo re-applies later renames, pins and saved specimens; a label referring to something the undo removed is refused and logged. A discovery waits until a card shows it; a delivery that shows nothing retries after 5 s and starts no gap.
- What if?: one amount ramp per field across a source's choices, opaque (≥ 3:1), never opacity. A New Dish equal to the authored recipe (Standard, Identical, not Empty, same seed) is the authored recipe and gets ideas; an older save without recorded overrides counts as authored only if its initial ledger and tick-0 recipe inputs equal the recipe's. The slot index keeps a validated display copy of meta.variant (Saved dishes shows "What if? · …"); the world's provenance stays authoritative. The backdrop does not close the sheet (Close or Escape do). Error packets carry `paused` and `request`; toasts say "paused" only when the worker paused the dish.
- Experiments: a command that placed nothing (accepted 0) is not an undo point. Undo ends a single-arm card's observation ("undone"), except that a stamp whose gate moment is still in the dish's past stays. Once the measured gate has held, a change does not discard the stamp; it keeps the gate-moment values and waits for the card's player steps, and the dish shows one small notice naming the missing step. The worker is told about a selection only while the inspector sheet shows it on the dish screen. When an observation ends, the reason replaces the card's start prompt on that dish (a command toast cannot hide it). A dish reopened from a save says neutrally that cards observe only dishes started from the Notebook in this session. Debris texts point to the Debris overlay (charting debris in History would need a new history field; see owner review).
- Leaving the dish screen (Home, Notebook, Settings) pauses the open dish, so Home's "paused where you left it" is true and nothing grows unseen.
Affects: src/sim/{grid,structures,commands,branches,lineage,specimens,moduleView}.ts, src/worker/{protocol,host,client}.ts, src/persistence/store.ts, src/ui/**, content/{materials,structures,manifest}.
Owner review: no (History gains a recorded debris-total series in P2.8, wave C, and the texts point there again)

## D-0029 · 2026-09-29 · P2.2/P2.8 · Wave C lead pass: keys, stripped export, migration provenance, action chip
Context: the wave C verifiers and fixers left MINOR items and rulings for the lead (docs/reports/reviews/g2-wave-c/*-reverify*.md, *-fix*.md §“for the lead”).
Decision:
- Keyboard (UX §4.2 lists both "Space pause/run" and "Enter/Space activate"): the dish screen tracks the last input type, as :focus-visible does. While the player navigates with the keyboard (Tab), Space activates the focused control; after a pointer press, Space is pause/run wherever focus was left, so it never presses a clicked button a second time, cycles the speed, or steps the dish when the paused bar shows Step where the speed control was. Choice groups handle their own keys (arrows/Home/End move without choosing; Space/Enter choose). Journey: garden.spec "Space after a mouse click is pause/run…".
- "Export without names or notes" also removes the player's branch names: branch records carry name null, a saved specimen's label becomes its branch's generated name, and the command log keeps each rename without its text. Names are labels the simulation never reads, so the stripped dish runs on identically (test: entities, fields and genomes equal after 300 more ticks); branch records are hashed, so the stripped dish has its own state hash, and the checksum is computed over what is written (SPEC §14.4).
- Migration tags provenance (SPEC §14.5): `content.provenance.migratedFrom` lists the schema versions a world was migrated from, oldest first. Provenance is outside the state hash, so the tag changes no hash; a world saved today records nothing.
- The inspector's action chip says "Eating" only when this tick's intake reached the usable share of the intake ceiling (FLAG.usableIntake, the same 1 % rule E03 uses); a smaller intake reads "Finding only traces of food", so the chip never contradicts "No usable food" or "Food access: 0 %". The "just woke up" chip shows from the DORMANCY_LOCKOUT reason code.
- World-description labels use the build's catalog size in one place (host `catalogSize()`), not a literal; automatic checkpoints keep the file's mode-label copies like named slots and list them. Save meta (variant, registry, evolution setting) is read with the state, before the checksum await. Raw preset ids never reach the player (CompareText, experiment step lines use the UX §3.3 labels).
- Duplicate uses the same bounded world id as a checkpoint branch (first part + new dish id). Comparison copies keep their nested ids (bounded by use; a journal note is refused with a message past 4,000 characters, never lost).
- Experiment timeline samples tally secretion by the organism's producer rules (native or E01), and a producer that is not Active under its state reason, as tools/sim-tune.ts does. The one wave A golden value this moves is EXP_101 arm A's timeline hash (a Sprinter that gained E01 by mutation is now tallied); with that tally removed it reproduces wave A's hash exactly.
- The renderer's lint boundary also refuses a template-literal dynamic import.
- Saved dishes: focus follows the delete confirmation (Keep, Delete…, then the page heading) for named slots as for checkpoints.
Reason: honest labels, saves are sacred, SPEC §14.4/§14.5, UX §3.3/§4.2.
Affects: src/ui/views/{DishScreen,Saves}.tsx, src/ui/panels/{Inspector,CompareText}.tsx, src/ui/strings/{modules,experiments}.ts, src/persistence/{saveFile,checkpoints}.ts, src/sim/{serialize,world,experiments}.ts, src/worker/host.ts, eslint.config.js.
Owner review: no

## D-0030 · 2026-09-29 · P2.2 · Founder modes and mutation presets as built
Decision:
- Varied and Diverse founders draw each active locus from 45–55 with `det(seed,'founder.init',birthId,locus)` (bit-identical to wave A, so existing hashes are unchanged). Diverse uses the reserved `founder.module` stream: key (birthId, 0) for an independent 10 % chance per eligible founder (D04 §3; not an exact count) and (birthId, 1) for a uniform pick among the legal gains under the world's recorded registry; the module is chosen before the loci so a seeded E03 also varies the dormancy locus.
- The Diverse ability draw happens only at creation (tick 0: the recipe's founders and life added before the first tick). Life added later in a Diverse dish gets Varied traits and lineage origin 1, so "present at creation" stays true (SPEC §8.6). Specimens keep their saved genome.
- The inspector separates how a founder was set: traits 'neutral' / 'varied' (exactly this dish's draw) / 'carried' (an added genome) / 'unknown'; modules 'creation' / 'inherited-creation' ("inherited from a founder that had it at creation") / 'mutation' / 'introduced' / 'unknown' after compaction. It never guesses.
- `setMutationPreset` is a logged command recording `presetFrom` and the tick it took effect. Choosing the preset already in effect, or an unknown one, is logged with accepted 0: no History mark, no undo point, no experiment end. Proposals already drawn keep their draws. Faster playback never changes per-birth rates (fixture: same change tick, lineage and hash at 1× and 4×).
- A world is "Core prototype — quantitative evolution" while its recorded `enabledModules` has fewer entries than this build's module catalog. The slot index keeps validated display copies of `meta.evolution` and `meta.registry`, so Saved dishes, Continue and checkpoints show the mode labels without loading the world; slots written earlier show none.
- Imports: a recorded module this build cannot simulate is refused by id (and name when readable) before definitions are schema-checked (SaveFileError 'content'); a genome module outside the recorded registry is 'integrity'; a registry/manifest mismatch is 'content'. A changed build registry never changes an old save's registry, genomes, candidates or branches.
- No evolution-rules or schema bump: Diverse was not selectable before P2.2, and save-meta fields are outside the checksummed state.
- The Advanced panel: More → "Evolution settings (Advanced)" (setting in effect, rates, recorded changes, founder mode, registry); New Dish shows the same rates behind "Show the chances per offspring (Advanced)". New Dish enters paused in the Lab with the Life tray open (UX §2.3).
- Toasts size to their text up to 90 % of their area; pages without a dish pin toasts to the bottom; inspector chips use body size (16 px).
Reason: SPEC §8.6, UX §3.3, D04 §3, CT §6–§7; wave C verification (founders-verify-*.md, founders-reverify1.md).
Affects: src/sim/{founders,mutation,commands}.ts, src/worker/*, src/persistence/{saveFile,store}.ts, src/ui/views/NewDish.tsx, src/ui/panels/{AdvancedEvolution,Inspector,MoreSheet}.tsx, src/ui/strings/modes.ts.
Owner review: yes — what New Dish's Create and the Play shelf do to the open dish (see D-0033: they keep it first, as What if? does).

## D-0031 · 2026-09-29 · P2.8 · Regional trait graphs, checkpoint ring and journal as built
Decision:
- Regional trait samples are recorded in stage 10 every 10 simulated seconds: rows [region, species, count, locusMask, (n, median, min, max) per active locus]; a locus is active per `phenotype.activeLoci` (template loci, plus dormancy for E03 carriers). Regions are the whole dish plus quarters split at cell 64 until P4.8. Compaction keeps 10 s samples for the last 30 minutes, then one sample per minute (the whole-minute sample, never a mean of medians) up to 6 hours. Trait axes are fixed at 0–100; quarter population panels share one scale. Trait records carry `since` (the dish second recording began; the migration moment for older worlds) so charts claim "no samples before" only from it.
- World schema 3 adds `history.traits`, `history.journal` and an optional `debrisTotal` on samples (History charts debris carbon); older saves migrate by copy with empty records and show no debris line for older samples. A loaded file's recorded history is validated like the rest of the state; a malformed value refuses the file.
- Checkpoint ring: one ring per device, 10 checkpoints across dishes, written at every whole minute of dish time (tick % 600 = 0; SPEC §10.7 "10 snapshots at 60 s intervals") of the dish being played, never for comparison copies. Slot ids `checkpoint-NNNNNNNN-<writer>`; checkpoints are never among the ten named slots. A write needs room for itself and one more save of the same size; a refused write or failed commit keeps everything and the player is told once per reason. A write still in flight at the next minute skips that minute. Each write removes every checkpoint beyond the newest nine. Opening one starts a new branch (world id first part + new dish id; named "<dish> (from m:ss)"; bound to no slot; Continue follows it after a confirmation when Continue holds a dish).
- Journal with the dish (completes D-0027): entries whose world id is the open dish's are also stored in `history.journal` (≤ 200 entries, ≤ 16 KB each), checksummed with the file, outside the state hash; Undo and error rollback keep them; recording one autosaves; opening or importing a dish merges its entries into the device Notebook by id. One validator (`journalRecordProblem`) serves worker, import and Notebook; a file with a malformed entry is refused with a message. The device Notebook lists at most 200 entries; entries that came from a save or file are marked as copies, and a new entry in a full Notebook removes exactly one entry (the oldest copy, else the oldest entry) and says which. "Export without names or notes" writes no journal entries.
- A command with accepted 0 is not an intervention in history (no chart mark), in line with D-0028's undo rule.
- All History, Journal, ring and checkpoint text is at least 16 px.
Reason: SPEC §10.7/§12.4–§12.5/§14.1, D4 §12, UX §1/§5.4, D-0014, D-0027, D-0028; wave C verification (observe-verify-*.md, observe-reverify1/2.md).
Affects: src/sim/{history,serialize,world,publish}.ts, src/persistence/{checkpoints,store,saveFile}.ts, src/worker/*, src/ui/panels/{HistorySheet,TraitGraphs,TraitData}.tsx, src/ui/views/{NotebookJournal,Saves,SimplePage}.tsx, src/ui/journal.ts, content/{experiments/EXP_103,recipes/CLEANING_CREW_V1,materials/DEBRIS}.json.
Owner review: yes — one checkpoint ring per device (chosen; bounded storage) versus one per dish (D4 §12 "checkpoint history" allows either).

## D-0032 · 2026-09-29 · P2.1 follow-ups · Module marks in the atlas, DORMANCY_LOCKOUT, sim-tune producers
Decision:
- Module marks are atlas frames in the organism atlas, keyed `feature/<layer>/<heading>/<frame>` in a `features` table (size 16, 4 headings, anchor 8,8) packed after the sprites so no sprite frame moves; one sheet, one texture, one draw batch; the manifest stays version 1 (additive section). content:validate requires the marks of each enabled module's `visualLayer` with frame counts from ARCH §10.1 (seam 3, pocket 4, notch 1; an unlisted layer at least 1); E02's `glow_center` needs 2 frames (dim, glow) for GLOW_ON/GLOW_OFF. src/render imports nothing from art/src (lint rule and test). Supersedes D-0019's "built at runtime … follow-up".
- DORMANCY_LOCKOUT is an observation derived from the saved clocks by `dormancyReason()`, never written to `limitCode` (every entity column is hashed; hashes unchanged, compared over 157 checkpoints). It is the organism's state reason for the whole 30 s post-wake lockout (SPEC §12.2 States); `restHeld` marks the narrower case "rest would otherwise have started" and the Lab line then says so. The one-sentence Summary constraint stays the measured intake reason; the chip keeps "just woke up". Countdowns round up.
- tools/sim-tune.ts counts secretion by the organism's profile producer rules (native producers and E01 carriers); a producer that is not Active is counted under its state reason.
Reason: ARCH §3/§10.1, SPEC §7.6/§12.2, "everything the inspector says traces to a reason code"; wave C verification (art-marks-verify-rules.md, art-marks-reverify1.md).
Affects: art/src/**, public/atlas/**, tools/{art-build,content-validate,sim-tune,asset-preview}.ts, src/render/{features,renderer}.ts, src/sim/{dormancy,moduleView}.ts, src/ui/strings/{reasons,modules}.ts.
Owner review: no
