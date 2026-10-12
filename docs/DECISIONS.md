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
- Starting a card replaces the open dish the way Play and New Dish do, after an autosave to Continue, without writing a named slot. (Superseded by D-0033: the open dish is kept first.) A player command that changes the dish ends a single-arm card's observation (a refused command does not). An observation cannot resume after the dish is closed and reopened (observer history is not saved) and the dish says so. Stamps require the card's measured gate and its listed player steps.
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

## D-0033 · 2026-09-29 · P2.2/P2.5/P2.6 · Keep the open dish first, on every replacement
Context: D-0030's owner-review note. New Dish's Create, the Play shelf and an experiment card's Start closed the open dish without saving it, and Saved dishes → Open and Import replaced it the same way; only What if? kept it first (D-0026). CLAUDE.md "saves are sacred"; UX §1, §3.4.
Decision (lead ruling; built and adversarially verified through two fix rounds, docs/reports/reviews/g2-close/keep-dish-*.md):
- Every action that replaces the open dish keeps it first, as What if? does: Play shelf Start, New Dish Create, an experiment card's Start, Saved dishes → Open (a named slot, Continue, an automatic checkpoint), Import, Duplicate and What if?. The new dish is prepared first (built, read and checked, or its arms realized), then the open dish is kept, then the new dish opens. One worker keep step (`keepDish`) serves every entry point; a replacing request carries an optional `keepFrom`, and a request without it behaves as before.
- Keeping = the dish's own slot (the store keeps the previous copy), else the first empty slot, and Continue follows. The save being opened is never the keep target: a changed dish that opens its own slot is kept in the first empty slot, and the all-slots-used choice lists that slot "(the save you are opening)", disabled. With all ten used, one shared panel (`KeepChoice`, also used by What if?) offers export then continue, a confirmed replacement of a named slot (its moment named), or Cancel: nothing changes, run state included.
- Nothing is written when keeping is unnecessary:
  - (a) "unchanged, rebuilds exactly": a tick-0 dish whose whole serialized world (everything the save checksum covers, the journal included) equals what this build realizes from its recorded start under the same world id — a What if? idea while D-0026's identity checks hold, a recipe or New Dish start with its recorded seed and choices, an experiment card start without a timed change, or an older save without recorded choices compared with the recipe's authored start. This replaces D-0026's state-hash test, which missed the journal and pins.
  - (b) "saved": the dish's own slot already holds exactly the file a save would write now (same index checksum over the canonical serialized world, same name). A dirty flag was rejected: a mutation path that forgot to set it would skip a changed dish; the checksum cannot (tests: a tick, a command, a journal note invisible to the state hash, a slot overwritten or deleted; mutation checks).
- A keep that cannot be done answers `keepRefused` (slots-full / save-failed / save-unavailable / failed) with a readable message; nothing opens and nothing changes. It is not an error packet.
- Continue: every autosave records the named slot its dish is bound to and that slot's record id. Continue is bound to a named slot that holds exactly its file (checksum and name; the recorded slot preferred), else to the recorded slot while its record is unchanged; a Continue read from its predecessor binds nothing. When the dish Continue holds is kept to a named slot, Continue is rewritten with that same file, bound to it, so it is kept once and "saved" on every later launch. With no dish open, a replacing action keeps the dish Continue holds by the same rules. Continue is the last dish (UX §1): a dish an action opened is written to Continue at the next autosave even at an unchanged tick; a dish opened from Continue is not rewritten until it changes. Home → Continue opens the autosave only while no dish is open.
- Words: where a confirmation or sheet exists (New Dish, What if?, the checkpoint question, the experiment card) the plan says beforehand what will happen to the open dish; afterwards one line says what happened ("Saved “Little Living Garden” to Slot 2 first."), leading the new dish's start prompt when there is one, in the paired card's setup panel, else a toast; nothing when nothing was written. Saved dishes numbers its rows (Continue, Slot 1 … Slot 10). What if?'s own texts are unchanged (tests/e2e/whatif.spec.ts unchanged).
- Rulings for the follow-up round (docs/agent/g2-close-2.workflow.js.txt carry-overs): (J) one time format per save — Saved dishes' named rows and Home's Continue card use the dish clock ("at 0:05 dish time") like the checkpoint rows; the sheets keep "· 0:05". (K) curly quotes in every player-facing sentence that quotes a dish name. (E) toasts use body size (UX §4.1 ≥ 16 px). A change made while paused at an unchanged tick must reach Continue at the next autosave (today only at the next manual save, keep or tick).
- Supersedes D-0027's "after an autosave to Continue, without writing a named slot"; generalizes D-0026's rule (a); closes D-0030's owner-review note.
Reason: CLAUDE.md "saves are sacred", UX §1/§3.4, D-0026.
Affects: src/worker/{host,protocol,client}.ts, src/persistence/store.ts (additive index fields worldId, activeSlot, activeRecord; world schema unchanged), src/ui/state.ts, src/ui/panels/{KeepChoice,KeepSheet,KeepPlanLine,WhatIfSheet,WhatIfState}.tsx, src/ui/strings/{keep,whatif}.ts, src/ui/views/{NewDish,Saves,Home,ExperimentCard,ExperimentRun}.tsx, tests/worker/keep-*.test.ts, tests/e2e/keep-dish.spec.ts.
Owner review: no

## D-0034 · 2026-09-29 · P2.9 · Second tuning report: FIRST_DISH_V1 kept; a supplementary 1,200 s horizon
Decision:
- FIRST_DISH_V1 stays at revision 1 at G2 (no V2). The D06 targets are met on 6/6 seeds at Standard and Accelerated (first intake at tick 0, first division 29.3 s). Accelerated shows a module gain on 6/6 seeds (median 88.9 s) and a confirmed branch on 6/6 (median 312.1 s) within 10 minutes at 1×; Standard shows gains on 6/6 (median 255.9 s) and a confirmed branch on 1/6 by 600 s (4/6 by 1,200 s), which D06 §9 allows. Every draw count lies inside its preset's 95 % range, every committed daughter reproduces its recorded draw, and the ledger is exact (docs/reports/tune-g2.md).
- Phase 3 tuning measures recipe candidates at 600 s (D06 §18) and at a supplementary 1,200 s horizon (`npm run sim:tune -- --presets standard,accelerated --horizon 1200 --plain-check`): 3 of 12 G2 dishes swing into a Recycler bloom after 600 s that the 600 s batch cannot see.
- tools/sim-tune.ts reports per-daughter and per-module rates with numerator and denominator, censored medians, carrier-seconds by recorded outcome and branch confirmations, and proves per seed that the tuner only observes (plain-run hash check).
- A label change goes to the comprehension pass (not a recipe change): name the ability wherever a module gain or loss is reported ("A Sunbead offspring gained Reserve chamber.", "gained Reserve chamber (E05)") instead of the generic feed line and the raw ID.
- Bearing on owner questions: the numbers confirm D-0022's measured Crumbsmith energy trap without choosing a revision, and support D-0027's surplus source for RESERVE_COMPARE without choosing the dose.
Reason: BUILD_DIRECTIVE P2.9 and Appendix B, D06 §9/§18, D-0015.
Affects: tools/{sim-tune,sim-run}.ts, tests/tools/sim-tune.test.ts, docs/reports/tune-g2.md.
Owner review: no

## D-0035 · 2026-10-01 · Phase 3 preflight · World schema 4 keeps old saves' hashes; a usable-intake seconds column
Context: lead choices 1 and 6 of docs/agent/g3-plan-recheck.md (G1, G2, G17 #1 and #6), made before the Preflight.
Decision:
- Phase 3 bumps the world schema once, 3 → 4, in wave 1 (foundation): `SCHEMA_VERSION` 4, `COLUMNS_ADDED_IN[4]`, a `v === 4` migration step after P2.8's `v === 3` history step, the stores `objects` (`[]`) and `sample` (`null`), and a −1 fill for the new link-slot columns through one exported `emptyValueOf(name)` (src/sim/entities.ts) that the migration and stateHash both use (a zero-filled link would point at slot 0 and make every migrated organism carry a dangling link).
- stateHash is hash-neutral for Phase 3 state (Option A): a post-g2 column is hashed, with its name, only when some slot in [0, highWater) differs from its empty value; a store or link table only when non-empty; a new counter or settings key only when it differs from its initial value. A loaded world holding no Phase 3 state hashes exactly as the g2 build hashed it, so g2 saves keep their recorded hashes (the g2-replay fixture's hashAtLoad and hashPlus1000; tests/sim/history-debris.test.ts's two literals stay unchanged). Newly realized recipes still change hash with every content edit (contentHash), as before.
- Schema 4 includes an f64 column `noUsableIntakeSeconds` (default 0): seconds since the organism's last usable intake under D-0019's 1 % rule (the `FLAG.usableIntake` test). E04's and E12's "10 s without intake" rules read it, not `lastIntakeTick`, which also counts diffusion traces and is −1 for introduced organisms and 0 for new daughters.
Reason: saves are sacred and old saves keep their recorded ruleset (CLAUDE.md); one bump instead of three; the digest-only alternative (Option B) would weaken the g2 replay guarantee from exact hashes to trajectory digests.
Affects (wave 1 foundation): src/sim/{world,entities,serialize}.ts, tests/sim/history-debris.test.ts, tests/persistence/migration.test.ts.
Owner review: no

## D-0036 · 2026-10-01 · Phase 3 preflight · The lead bumps buildPhase 3 and contentVersion 2 in the Preflight commit
Context: lead choice 2 (g3-plan-recheck.md G3, G4, G17 #2 and #11).
Decision:
- The Preflight commit (lead) writes `tests/fixtures/saves/*` with the g2 build first, then bumps `content/manifest.json` buildPhase 2 → 3 and contentVersion 1 → 2, together with the G4 pinned-test fixes (tests that read the shipped manifest read the g2 lists through `registryWith(G2_LISTS)`, which carries contentVersion 1 so the wave-A golden stamps stay valid). The wave 1 foundation does not bump them.
- simulationVersion stays 3 (pinned by `ManifestSchema` and `loadSaveFile`). A decided rules change bumps evolutionRulesVersion or moduleRegistryVersion with a DECISIONS entry; moduleRegistryVersion 1 → 2 at the wave 4 module flip (lead). PROTOCOL_VERSION 1 → 2 once, by wave 2's art-features builder (ARCH §7 updated in the same change).
- WORKLOG: P3.7 (modules and the stage 8 order) starts in wave 1 (the stage 8 framework) and ends at the wave 4 flip; it stays `[~]` meanwhile while waves 2 and 3 tick P3.3–P3.6 (an exception to the legend's "at most one").
Reason: every Phase 3 material is phase 3 and `validateContent` refuses it while buildPhase is 2, so the bump must land before any builder starts; one lead commit avoids a race inside wave 1.
Owner review: no

## D-0037 · 2026-10-01 · P3.5 · Sample: Begin and Cancel are host-level and exact; the tools are offered on every world
Context: lead choice 3 (g3-plan-recheck.md G10, G17 #3 and #19), made before wave 3.
Decision:
- Begin is host-level: it pauses and records the pre-begin stateHash. Take (`sampleTake`), Transfer and Discard are commands. While a sample is held the host refuses Run, Step and every other dish-changing command before `applyNow`, so no command sequence number is taken and the vacated slots and cells stay free.
- Cancel is host-level and exact: an exact inverse move into the original slots and cells (an allocate-at-slot helper), then the command state is restored as Undo restores it: the `sampleTake` entry leaves `commands.log`, `commands.nextSeq` returns to that command's seq (recorded in `world.sample`), and the host's rollback checkpoint, replay list and undo slot are reset. The stateHash equals the pre-begin hash, also after a save and reload in between. Undo while a sample is held acts as Cancel. `nextSeq` stays in stateHash.
- Sample, Transfer and Clean water are offered on every world, g2-recorded worlds included: R18 gives D07's transaction semantics to all worlds from the moment Sample exists, and these are player tools recorded as commands, not biology rules.
Reason: SPEC §10.5, D07 §09 and BUILD_DIRECTIVE P3.5 say Cancel restores exactly; a command-based Cancel would advance `nextSeq` by two and could never give back the pre-begin hash.
Owner review: no

## D-0038 · 2026-10-01 · P3.3 · Film is eaten as detritus and never joins a species' food list
Context: g3-plan-recheck.md G9, G17 #12, made before wave 2.
Decision: film is eaten "as detritus" (CT §3.5). It never joins `sp.foods` (`src/sim/species.ts` keeps filtering it); intake adds a film request after the listed foods (ordered policy) or with the detritus weight (weighted policy), within the K = 6 request limit. Film digestion and the film system land together in wave 2, and the build constant `FILM_DIGESTION_IMPLEMENTED` gives way to `worldHasSystem(world, 'film')`. Test: a B04 preference mutation draws exactly the same with and without the film system.
Reason: preference mutations draw over n = `sp.foods.length`; adding film would silently change every B04 preference mutation in FIRST_DISH_V1, CLEANING_CREW_V1, EXP_103 and EXP_B.
Owner review: yes — if film should be a separate food, that is a forced rules change (evolutionRulesVersion bump, fence update with a DECISIONS id).

## D-0039 · 2026-10-01 · P3.8 · Tool texts are content; relationship observations are device progress
Context: g3-plan-recheck.md G11, W5-02, G17 #4 and #22, decided before writing the wave 5 file.
Decision:
- Field Guide tool entries are data: `content/tools/*.json` validated by a new ToolSchema and included in contentHash (ARCH §2/§4 gain the pack). UNDO, SNAPSHOT and COMPARE have no lab analogue; their "biology" text says plainly that they are game tools.
- Relationship observations (what the Field Guide records as seen, and the G3 relationship-matrix evidence) live in a device-local store (`src/ui/badges.ts`, localStorage key `pixelmeba.relationships`, every read and write in try/catch), not in a dish's journal and not in saves. They come from recorded events (captures, lysis and parasite-drain deaths) and an observation-only watcher in the worker that never touches simulation state.
Reason: content is data (CLAUDE.md); discovery is per-device progress like badges and must not change what a save holds or how it hashes.
Owner review: no

## D-0040 · 2026-10-01 · P2.2/P2.6 · Keep-dish fix round 3 as built: Continue by exact record, one clock, curly quotes, readable toasts, named abilities
Context: the lead's carry-overs to D-0033 (J, K, E, the paused-change rule) and D-0034's label ruling; fixer report docs/reports/reviews/g2-close/keep-dish-fix3.md.
Decision:
- Continue (completes D-0033): every autosave event (30 s, going to the background, leaving the page, a manual save) reaches the worker, which builds the file and writes Continue unless Continue already holds exactly that record (`holdsSave`: checksum over the canonical serialized world — tick, world id and journal inside — plus name, binding `activeSlot`/`activeRecord` and the index copies; only write time and storage bookkeeping are ignored). Autosaves run one at a time; the reply says whether it wrote. A change made while paused (Add Life, a Lab stroke, a rename, a pin, a journal note, a preset change) therefore reaches Continue at the next autosave event; an unchanged dish is never written again (store byte-identical). No dirty flag. Cost measured at 10 dish-minutes (716 alive, 5.3 MB file, loaded machine): build + checksum 171–504 ms, the same order as a write before.
- One time format per save: Saved dishes rows (Continue, Slot 1–10, checkpoints) and Home's Continue card use the dish clock ("at 0:05 dish time"); the Keep and What if? sheets keep "· 0:05".
- Curly quotes around every quoted dish name in player-facing sentences (toasts, keep refusals, checkpoint lines), guarded by a test over src/ui. What if? idea titles built in src/sim/variants.ts still use straight quotes (follow-up with the P3.11 copy pass; their test is pinned).
- Toasts use body size (16 px), a px frame and line height 1.3, take no presses, stay inside their area and clear of the zoom column; in short windows at 200 % text they use the dish view's full width. Known limit: in 800×360 at 200 % a toast longer than about 115 characters is cut at the dish view's edge (the live region still reads it whole) — moved to P3.11.
- Module gains and losses are named from the recorded mutation descriptor and the world's own module list: "A Sunbead offspring gained Reserve chamber." (with "… and inherited a different trait." when the same birth also changed a trait) and "gained Reserve chamber (E05)" in the birth record; a module the world's content does not record shows its id.
Reason: saves are sacred (no change ever skipped, nothing rewritten needlessly), UX §4.1, honest labels, D-0033, D-0034.
Affects: src/worker/{host,protocol,client,snapshot}.ts, src/persistence/store.ts (`slotRecordFor`, `holdsSave`), src/sim/lineage.ts (read-only `mutModuleName` query field, not hashed or saved), src/ui/{state.ts,feed.ts,styles.css}, src/ui/strings/lineage.ts, src/ui/views/{Saves,Home}.tsx; tests/worker/keep-autosave.test.ts, tests/ui/{keep-words,feed-modules}.test.ts, tests/e2e/keep-dish.spec.ts journey 15.
Owner review: no

## D-0041 · 2026-10-01 · G2 · Comprehension self-review fixes as built (labels, hierarchy, event evidence)
Context: docs/reports/comprehension-g2.md (five tester tasks 5/5; B1, M1–M5, 25 minors) and docs/reports/reviews/g2-close/review-fix1.md. D06 §18: revise labels, hierarchy or event evidence, never mechanics.
Decision:
- A tap outside the dish maps to no cell (`src/ui/dishPoint.ts`): it closes any open panel and says "Outside the dish."; the cell panel never formats a missing value ("not measured"). Fixes the G2 review's blocker (an out-of-grid cell crashed the inspector and later every tap).
- Saved comparison result cards are listed in Notebook → Journal now, one line each from what the card recorded (dish, change, how long both ran, organisms alive in A and B, the player's conclusion), opening to the saved table; the save toast says where. This brings forward the listing D-0020 left for Phase 4. Done's text adds how to keep a changed version (More → Duplicate dish).
- Inherited differences are stated from recorded birth records only: the inspector's "Passed to offspring" lead compares with the parent and with the founder of its line; mutation event lines name the trait and both values ("A Sprinter offspring inherited a lower Division value (parent 50 → 48)."), using the inspector's short trait names. The values travel as display-only, unhashed fields of the inspect data and of mutation events (`src/worker/{protocol,snapshot}.ts`).
- Comparison results say that every difference traces back to the change directly or through knock-on effects, and that the table does not show which. The Sunbead's answer states that it releases half of the carbon it takes in as sugar (SPEC §6.5, with the measured amount of the last second); sugar eaters list where sugar here comes from (placed sugar, Sunbeads, Crumbsmiths' enzyme).
- "Out of energy — losing health." is shown first at measured energy ≤ 0 (the starvation rule), derived in the UI; no simulation reason is added (that would change recorded state). Sunbeads read "Making food" and "makes its own food"; split requirements are headed "Before it can split"; the body meter reads "Body 99 %"; cell panel labels are plain words; a kind never added reads "none added yet"; About shows the app version (`src/persistence/appVersion.ts`), content hash and rule versions.
- Deferred to P3.11 (accessibility) / P4 polish: review minors m1, m2, m3, m8, m9, m10, m13, m16–m23; M2's "Show it" links; M4's optional measure rows; inspector detail rows and question buttons at 14 px (UX §4.1 asks ≥ 16 px); straight quotes in What if? idea titles (src/sim/variants.ts) and in two Import refusals (src/persistence/saveFile.ts); long toasts at 800×360 and 200 % text (D-0040).
- No content file changed (content text edits would move the contentHash pinned by g2 saves and fixtures).
Reason: D06 §18, honest labels, UX §4.1/§5.2–§5.4.
Affects: src/ui/** (Inspector, HistorySheet, CompareResults, CompareText, MoreSheet, DishScreen, CompareViewport, Notebook, Saves, SimplePage, App, state, feed, strings), src/worker/{protocol,snapshot,host}.ts (display-only fields), src/persistence/{appVersion,saveFile}.ts; tests/ui/{dish-point,inherited-differences,comprehension-labels}.test.ts; tests/e2e/{inspector,compare,garden}.spec.ts.
Owner review: no

## D-0042 · 2026-10-01 · Phase 3 preflight · The determinism fence as built
Context: g3-plan.md §2 Preflight with the re-check corrections and D-0035/D-0036; reports in docs/reports/reviews/g3-preflight/ (build; verify 2 MAJOR fixed in round 1; re-verify ok with 4 MINOR).
Decision:
- `src/sim/gates.ts` (worldHasSystem / worldHasSpecies / worldHasModule) reads only the world's recorded manifest. `validateContent(raw, opts)` gains `allowUnimplemented` (off by default). `tests/helpers/registry.ts` `registryWith(patch)` re-validates patched packs; `G2_LISTS` comes from `tests/fixtures/saves/g2-manifest.json` (buildPhase 2, contentVersion 1).
- `tests/helpers/trajectory.ts` `trajectoryDigest(world, 'g2' | 'full')` hashes the g2 biology with index-valued columns mapped to IDs; 'g2' throws on any non-default post-g2 state, 'full' hashes it by name. New WorldSettings keys and derived properties must be registered in its POST_G2_* tables (the file is SHARED for that one purpose).
- Nine g2 saves (`tools/make-g2-saves.ts`, deterministic, refuses to change a file without `--force`) with `expected.json` {hashAtLoad, hashPlus1000, digestPlus1000}; EXP_106 arm B is saved at t300, where P01 are hunting and holding meals (at t600 none holds a meal; the save makes four captures in its next 1,000 ticks). Regenerated on top of `g2`: all ten files byte-identical.
- The fence is four files (`tests/fixtures/trajectory-fence{,-arms,-current,-current-arms}.test.ts`, 14 entries in `fence.json`), run together by the path prefix `tests/fixtures/trajectory-fence`. Check (a) runs under `registryWith(G2_LISTS)`; check (b) under the shipped manifest; after the bump every currentDigest equals its g2Digest.
- `tools/fence-update.ts`: `--add`; `--recipe|--all --reason D-xxxx`; `--g2 --reason D-xxxx` (lead only; the named decision must name a version bump — known limit: it also accepts a decision that only restates D-0036's bump).
- The Preflight bumped buildPhase 3 and contentVersion 2 (D-0036); the wave-A goldens and other pinned tests run on the g2 lists.
Evidence: on the rebased branch `npm run check` → 91 files, 827/827; `make-g2-saves` → "all 10 g2 fixtures are byte-identical".
Owner review: no

## D-0043 · 2026-10-01 · Phase 3 wave 1 · World schema 4 as built: links as entity columns
Context: wave 1 foundation (docs/reports/reviews/g3-wave-1/foundation-build.md; rules verifier ok with 4 MINOR).
Decision:
- Fungal links are entity columns fLink0..3 (i32 slot, −1 empty), fLinkB0..3 (u32 birthId) and fLinkKind0..3 (u8: 1 visual F01, 2 transport F02); adhesion links are aLink0..1 (i32, −1) and aLinkB0..1 (u32). This is ARCH §5's Int32Array(6000×4) and (6000×2) split by position, with the birthId every reference needs. Links are symmetric, filled lowest-free-first, saved, migrated (−1 fill via `emptyValueOf`, the single source of a column's empty value), cleared on free, hash-neutral while empty (D-0035) and digested by the existing column code. Because the degree limit is structural, an import with more than 4 fungal or 2 adhesion links per organism is refused.
- Food objects (`objects`, cap 128 per SPEC §2.5 / CT §14) and the held sample (`sample`) are world stores; computeTotals counts them (objectsC/N, sampleC/N/M).
- Carried to the wave that owns `sampleSlot.ts` (P3.5 Sample): the import must also refuse held rows with negative pools, an invalid life state, or a slot/birthId that collides with a living organism or another held row (SPEC §14.3); the trajectory digest's `canonSample` should hash each row's original slot (Cancel restores into it). Carried to Phases 5 and 7: `speciesSystemNeeds` and `MODULE_SYSTEM_NEEDS` must gain SHELL/E11 → silicate, SIGNAL_GLOW/E02 → signals, RIVALRY → rivalry and E17 → foodObjects when that content arrives.
Reason: ARCH §5, SPEC §6.8 (remove incident links at death), §14.3, D-0035.
Owner review: no

## D-0044 · 2026-10-01 · P3.1/P3.2 · Chemistry and habitats as built
Context: wave 1 environment (docs/reports/reviews/g3-wave-1/environment-build.md; rules and player verifiers ok, 5 MINOR).
Decision:
- Sediment Edge preloads 0.010 bound nutrient (detritusN) per sediment cell with its 0.10 detritus carbon: the DEBRIS ratio of 0.10 N per C (CT §5.1) and FIRST_DISH_V1's debris patch ratio. CT §8.1 names only "detritus 0.10"; carbon-only debris would be the one exception in the game.
- A habitat start on another preset drops the recipe's backgroundOverrides (`withHabitatOverride`), so the dish equals CT §8.1 exactly (Gel Colony keeps its sugar 0.10). The New Dish note quotes the habitat's own rules text and never says "no food" there; Empty Water Garden is unchanged. Every rebuild from recorded overrides (keep-dish `freshStart`, What if?, New Dish preview) re-applies the habitat.
- Attachment: a porous bead cell offers only the 'bead' surface, and the bead hides the ground under it. An attached species may sit on a bead only if 'bead' is in its own surface list, so B13 (gel, sediment, mesh, stone edge) is refused a bead placed on gel, on sediment or beside stone, and F03 a bead over sediment. SPEC §2.2 lists the surfaces without saying whether a bead keeps its substrate's; this ruling follows CT §1.3's per-species lists. Free-living species still cannot enter beads. The Life brush preview and the command agree cell by cell (tested for B02 and B13 in all three habitats).
- The Lab's lid buttons read the world's lid from snapshots (`SnapshotMsg.lid`, cached as `SimClient.lidOf`): an optional reply field, so PROTOCOL_VERSION stays 1.
Reason: CT §1.3, §5.1, §8.1; SPEC §2.2; honest labels (the summary states what is preloaded).
Owner review: yes — whether a bead should keep offering its substrate's surface (gel, sediment, stone edge) to attached species. Changing it later is a rules change for worlds that hold B13/F03.

## D-0045 · 2026-10-01 · P3.7 · The stage 8 reservation framework as built
Context: wave 1 stage8 (docs/reports/reviews/g3-wave-1/stage8-build.md; rules verifier ok, 4 MINOR).
Decision:
- Action order (SPEC §3.2 row 8, D04 §9): mandatory transitions, then native optional actions by action ID, then modules E01…E17 ascending. A native action's ID is its index in the `NativeAbility` enum (E_STARCH 0 < E_OIL 1 < E_PROTEIN 2 < BIOFILM 3 < …), so that enum is append-only; a module's ID is its number. Mandatory entries run only for Active organisms, after dormancy and link release; dormancy stays the hard-wired first step for every living organism (it must also run while Preparing, Resting or Waking).
- Shared construction resolves all requests from one snapshot: per cell, requests above the headroom max(0, 0.50 − film) are scaled together; a scaled cell is pinned to exactly FILM_CAP and the float dust (≤ 1e-12, else a defect) goes to `ledger.roundoff.c`. A cell already at or above the cap (an imported or patched value) accepts nothing, charges nothing and is left as it is (lead fix of verifier MINOR 1; tested).
- Two producers on one organism (e.g. a native starch producer that gains E09): `secreting` is the OR of the producers; `secretionCode` shows SECRETING if any producer secreted this tick, otherwise the last producer's refusal. Unproven until a two-producer organism exists: the wave that implements E09 adds the test, and the wave that enables B02 with E01 adds a test where a construction reservation precedes a producer.
- `tests/fixtures/module-accounting.test.ts` energy balance includes the `construction` category.
Reason: SPEC §3.2, §7.1, §9 E10; CT §12.6; D04 §2 C08 and §9; conservation.
Owner review: no

## D-0046 · 2026-10-01 · Phase 3 wave 1 · Organism art for the 14 Phase 3 species as built
Context: wave 1 art-organisms (docs/reports/reviews/g3-wave-1/art-organisms-{build,verify,fix1,reverify1}.md: 1 MAJOR fixed in round 1, re-verify ok).
Decision:
- The atlas is 1024 px wide (1024×1024 for Phase 1–3 content) instead of 512×256: a 512-wide sheet would need 512×2048. A square 1024 sheet stays inside every WebGL limit we target and leaves room for Phase 5. The five shipped sprites and three feature layers are byte-identical frame by frame (only packing positions moved).
- Fungi: `mask/e/<0..15>` tiles with bits N=1, E=2, S=4, W=8 (`MASK_*` in art/src/sprite.ts); `decaying/e/<mask>` is mask-indexed too (a dying segment keeps its visible connections while its links exist); `tip/e/0` and `bud/e/0` are centred overlays drawn over the mask tile; F02 has `pulse/e/0..1`, drawn only while a transfer happens. Fungus and virus thumbnails are a one-frame `idle` animation, so Add Life, the Lab tray and History find them without an explicit animation. checkAtlas's category rules require all of these, F02's pulse included.
- A colour belongs to the state it shows: F02's pulse colour #F6D7B0 appears only in its pulse frames (tested), its growing tips are light copper.
- Phase 3 small organisms have an 8–12 px visible body with a clear 1 px margin (UX §6.2; tested). Shipped B04 (16×6) keeps its art.
- The UX §6.1 grayscale rule is measured as: alpha differs on ≥ 12 % of the union, or, for a pair with the same outline (alpha difference below 12 %), luminance (Δ ≥ 32/255) differs on ≥ 12 % of shared body pixels. The same-outline pairs are B03/B07 (UX §6.3 curved rods) and the shipped pair B01/B06 (alpha 7.0 %, luminance 31 %), whose art must stay byte-identical. F01/F02 differ in alpha by 33 % and are held to the alpha rule.
Reason: UX §6.1–§6.3, ARCH §10.1, CT §1.3; every visible feature maps to real state.
Owner review: yes — B01/B06 pass the grayscale rule by luminance only; holding them to the alpha rule means redrawing B06, which changes shipped atlas frames (no simulation state).

## D-0047 · 2026-10-01 · P3.3 · Velvet biofilm and Threadlace branching as built
Context: wave 2 film-fungi (no build report: the builder ended before writing it; the wave verifier supplied the evidence in docs/reports/reviews/g3-wave-2/wave-verify.md — film, fungal-branching and relationships-film tests pass, mutants killed, desktop e2e 4.0 m).
Decision:
- Native film deposition costs no energy (energyPerC 0): SPEC §7.1 and CT §12.6 name no cost for B02; 2 E/C is E10's own. B02 requests min(0.05 × dt, body above B0') into its cell's film through the shared construction pass (D-0045) after 10 attached Active seconds with remaining energy > 40.
- Fungal daughters go only to the four side cells E, S, W, N that pass canOccupy and soft capacity and hold no fungal segment, ranked by usable food (film included when it digests film), then suitability, then E, S, W, N; never the parent cell, never a diagonal; no candidate → DIV_BLOCK_PLACEMENT. This supersedes D-0002 and SPEC §6.9 step 2 ("parent cell or 8-neighborhood") for fungi only: ARCH §10.1's 16 connection-mask tiles and SPEC §7.7 ("links … on four-neighbor cells") define a four-neighbour topology.
- The inspector reports a fungal network from the worker (W2-08): "Threadlace: {n} segments in {k} separate threads; this one has {m}." History samples are unchanged (no save change).
- At the fungal limit (FUNGAL_CAP 2,000 across all fungi) births get DIV_BLOCK_CAPACITY; the split-blocker detail names the fungal limit, not the 6,000 organism limit (lead fix of a verifier MINOR).
Reason: SPEC §7.1, §7.2, §7.7; CT §12.6; ARCH §10.1.
Owner review: yes — four-neighbour fungal growth (no diagonals) is a rules choice; the 8-neighbour version would need diagonal connection art.

## D-0048 · 2026-10-01 · P3.3/P3.4 · B03, B05, Y01, P02–P04, Add Life and the Life tray as built
Context: wave 2 organisms (docs/reports/reviews/g3-wave-2/organisms-build.md).
Decision:
- Siltworm (P04) water crossing (SPEC §6.4, src/sim/crossing.ts): up to two consecutive open-water cells from sediment; from its second water cell it may step back into the cell it came from ("otherwise turns back"), so a worm facing wide water is never stuck. `waterCrossed` holds the count (bits 0–1) and the direction of the last step into water (bits 2–4). A worm in water it did not enter by crossing (water painted under it, an imported state) is not crossing: SUIT_HABITAT and stress apply, and it may only step onto its habitat. Inoculation, births and the Life brush still refuse water for P04.
- Diet lines use content names as they are; prey the dish does not record are summed ("and N kinds not in this dish"); qualified prey follow in parentheses ("(Crumbsmith only free-swimming; …)"); anaerobic feeders read "… without oxygen"; film digesters read "…, and digests film" only when the dish's own manifest enables film; hosts read "Drains …" / "Infects …". Attached species are named per surface set ("Velvet lives in water only on stone edges or porous beads."); a bead or mesh surface is named only when the dish enables that structure.
- The closed-lid Dusk (B03) fixture uses an all-sediment dish at O2 0.10: in a Water Garden B01 runs out of sugar before oxygen and diffusion refills dips, so B01 is never oxygen-limited there, and B03 (suitability 0 at O2 ≥ 0.4) dies within 50 s.
Reason: SPEC §6.4, CT §1.3/§3.2, UX §4.3.
Owner review: yes — balance: Dusk cannot survive in a default oxygenated dish; it needs a low-oxygen habitat (sediment, a closed lid with heavy aerobic use). That follows CT's numbers; changing it is a content tuning question.

## D-0049 · 2026-10-01 · P3.4 · Hitcher, Pinphage and phage doses as built
Context: wave 2 parasites-phage (build, saves verifier 1 MAJOR fixed, re-verify ok; docs/reports/reviews/g3-wave-2/parasites-phage-*.md, wave-reverify1.md).
Decision:
- Contact kinds on the 'contact' stream are frozen: 1 attack, 2 parasite attachment, 3 infection order (E12/E16 use 4 and 5). When more hosts pass their infection draw than whole units remain in a cell, units go in descending det(seed, 'contact', tick, 3, birthId) order (ties to the lower birthId); the draw reads the units the cell held at the start of stage 5.
- An infection consumes exactly 1 unit; its 0.01 C joins the host's B with no N. Lysis releases floor(40 × B + 1e-9) units, the rest of B, all N and any meal to detritus.
- X01 pursues the nearest valid host (Active, unparasitized, listed) afresh every tick and stores no target. A parasite is released alive on every host removal and one tick after its host enters Preparing (no drain in between: stage 6 skips non-Active hosts). A drain limited by free nutrient scales C, bound N and the free-N take by the same fraction L; the drain reservation takes free nutrient before ordinary allocation. A host dying of the drain is checked after H ≤ 0 and age; lysis is checked before all three.
- The import refuses: an unknown virus code, infection of a species the virus cannot infect, a non-zero timer while not infected, non-mutual host/parasite pairs, a host not in the parasite's host list; messages end "Nothing was loaded.". Phage doses accept a whole count 1–20 and radius 0–6, else refused whole.
- The inspector's drain line shows the measured drain (intake last second), not the record's rate. INFECTED and PARASITIZED use UX §5.2's Explore copy in Explore and the Lab copy in the Lab.
- The Infection markers toggle appears in Observe only when the dish allocates a viral field; it is a view setting, never sent to the worker and never saved.
Reason: SPEC §3.2 row 5, §6.5, §7.4, §7.5, §10.2, §14.3; UX §5.2; honest labels.
Owner review: no

## D-0050 · 2026-10-01 · P3.3/P3.4 · Truthful Phase 3 rendering (protocol 2) and stale prey links in saves
Context: wave 2 art-features (docs/reports/reviews/g3-wave-2/art-features-build.md) and the wave verifier's lead MAJORs.
Decision:
- PROTOCOL_VERSION is 2 (D-0036), with ARCH §7/§8 updated in the same change: E_LINKMASK (fungal directions + transfer bit), film band 6 (low 7 bits film C on a linear scale, bit 7 "eroding": lower than at the last tick the packer saw; worker-side scratch in a WeakMap, never sim state), CUE2_INFECTED (the status glyph) and CUE2_PARASITIZED (the rider order: a parasite is drawn after, and over, its host).
- World tiles (film, objects, stain) and fungal segment tiles are drawn one cell per 16 px frame, centred on their cell (lead fix: tiles no longer follow a segment's jittered position, so threads meet); bodies keep ARCH §9's scale. The bud overlay shows when E_GROWTH ≥ 1 (B ≥ 2·B0). Feature marks show only with their state bit and module bit together.
- Saves: a predator's prey link may name a prey removed in this tick (taken by another predator, dead of age, starvation or lysis) until its next decision re-validates it. The game saves that state itself, so the import accepts a stale prey link and refuses only a slot outside the entity table; the inspector no longer names a removed prey as the target. This fixes a g2 defect that could make an autosave unloadable ("A prey link points at an organism that is not there."). Host/parasite links stay strictly checked (they are kept mutual). Test: tests/persistence/stale-prey.test.ts (age, lysis, contested capture; save → load → same hash, +50 ticks equal).
Reason: saves are sacred; every visible feature maps to real state; ARCH §7–§10.
Owner review: no

## D-0051 · 2026-10-10 · P3.6 · Crumbsmith, Oilwick, Brothmaker enzymes, the reaction ledger, food access and EXP_201–204 as built
Context: wave 3 e1-producers (docs/reports/reviews/g3-wave-3/e1-producers-{build,fix2}.md; wave verify 1 MINORs fixed in round 2).
Decision:
- Food-access overlay (SPEC §10.8): per cell, the carbon of the pools the selected organism's species can eat now (its profile foods, plus film when it digests film in a film world: the inspector's "Food here" list). With no organism selected, or a cell selected, it shows the carbon every enzyme made accessible in the last whole second. Legend low → high, 'food' colormap, offered in every dish (derived, like light), observation only (tested: state hash unchanged).
- EXP_203 "protein 0.50 with N 0.05": the 0.05 N is bound nutrient (proteinN 0.05 = 0.10 N per C); no free nutrient beyond the Water Garden's own 0.10 background.
- Reaction ledger: "last second" is the last complete simulated second (ticks 10s…10s+9), recorded per cell and enzyme in an observation-only store that is never saved or hashed and starts empty after a load or duplicate. "Made here by {species}" names a species only when a living organism of it holds that enzyme's producer rules, sits in the cell or a four-neighbour (SPEC §5.3's emit neighbourhood) and released that enzyme in the last tick (its PRODUCER_BIT in `secreting`); otherwise the row says "Enzyme present". It never claims which producer made which unit.
- omitFounders: a paired card may omit only the recipe's last founder group, so every earlier group keeps arm A's cells and birth ids (founders are placed group by group).
- EXP_201 and EXP_202 are single-arm with no player steps; EXP_204's gate is "both copies ran 120 s with converted.starch measured"; the comparison is reported, never forced. EXP_201's journal stamp says only what the gate measures: "Measured a Crumbsmith's starch turning to sugar, and what Sprinters ate".
Reason: SPEC §5.3, §10.8; CT §10.3, §12.6; honest labels ("coincided with" until a recorded mechanism supports "because").
Affects: src/worker/snapshot.ts, src/ui/panels/{Inspector,ReactionLedger}.tsx, content/recipes + experiments 201–204, tests/fixtures/producers.test.ts, tests/experiments/e201-e204.test.ts, fence (four entries added).
Owner review: yes — (1) balance: in EXP_202 and EXP_203 every Oilwick and Brothmaker starves (154 s / 149 s) under CT's numbers (0.02 activity/s, 2 %/s decay and 0.10 × activity conversion feed far less than 0.38–0.40 E/s upkeep plus 0.40 E/s enzyme cost); a fix is a content tuning question. (2) EXP_201's CT §10.3 gate (intake.B01 ≥ 0.5) is reached from the Water Garden's background sugar alone (8 s); a stricter attribution gate is the owner's call.

## D-0052 · 2026-10-10 · P3.6 · Cordweaver (F02) transport links as built
Context: wave 3 f02-links (docs/reports/reviews/g3-wave-3/f02-links-{build,fix1}.md, wave-reverify1.md).
Decision:
- A parent–daughter link forms only when both ends have fewer than 4 fungal links; otherwise the daughter is placed unlinked and the 'birth' event's detail says `{link: 'degree'}` (lineage unchanged). This applies to Threadlace (F01) links too; with today's rules it is reachable only through hand-made links.
- The transport pass applies the donor cap first and the receiver cap second, to the donor-capped requests, with no re-offer of what a cap removed. "At least 0.01 B0' less" and the 1.5 B0' headroom use the receiver's B0'; the donor threshold uses the donor's.
- Only Active F02 segments at both ends of a valid LINK_TRANSPORT link take part (a Resting segment has no links in use, SPEC §7.6); a transport-kind link on a species without TRANSPORT_LINKS carries nothing.
- Transfer observation is per slot and keyed to the segment's birthId (a division starts empty); the window is the current dish second plus the nine before it; it is never saved, so a reload starts it empty. The per-second history total accumulates in an optional saved `history.pendingFungalTransfer`, so samples stay exact across a mid-second save (history is not hashed; no world schema change).
- Every link change emits one event from the end named by birthId: 'linkFormed' carries the retained parent's birthId with partner = the daughter; 'linkBroken' carries the removed organism's birthId with partner = the survivor.
- F02 is in the shipped manifest, so every new dish can form transport links and each history sample carries `fungalTransfer` (0 without links). Observation only.
Reason: SPEC §7.6, §7.7; CT §12.6; ARCH §10.1 (four-neighbour mask tiles, D-0047).
Affects: src/sim/{births,fungi,fungalTransport,links,publish}.ts, tests/fixtures/fungal-transport.test.ts, tests/sim/fungal-links.test.ts.
Owner review: no

## D-0053 · 2026-10-10 · P3.6 · Sugar pellets and starch wafers (food objects) as built
Context: wave 3 food-objects (docs/reports/reviews/g3-wave-3/food-objects-{build,fix1}.md).
Decision:
- When a full-rate transfer would leave a pool with less than OBJECT_DUST_C = 1e-9 C, the whole pool moves now (otherwise repeated subtraction leaves 3.8e-13 C for one more tick). The transfer stays within inventory; nothing is zeroed or logged as roundoff.
- Nutrient release is proportional for both kinds: n × released C / remaining C, split across pools by carbon, the last releasing pool taking the remainder; the emptying transfer moves exactly the remaining n (SPEC §5.1's 0.10 N per C without a second hard-coded ratio).
- An object holds only its kind's pools (pellet: sugar; wafer: starch); creation, the save import and held-sample objects refuse any other pool (fix round 1: a pellet that also held starch counted as empty and left the store with its carbon).
- Release runs in stage 3 before the enzymes (tested: a wafer's first starch is catalysed in the tick it is released).
- A structure stroke skips object cells and reports them as `HabitatSkips.object` (present only when > 0, so older results keep their shape); the Lab toast says "N held a food object". The food-object tap has its own brush rule 'object': a structure or an existing object refuses it; organisms never do.
Reason: SPEC §5.1, §14.3; CT §5.2; conservation (no free biomass, no lost carbon).
Affects: src/sim/{objects,conversion,structures}.ts, src/persistence/saveFile.ts, tests/fixtures/food-objects.test.ts.
Owner review: no

## D-0054 · 2026-10-10 · P3.5 · Sample, Transfer, Discard and Clean water as built
Context: wave 3 tools-sample (docs/reports/reviews/g3-wave-3/tools-sample-{build,fix1}.md, saves-verify-tools-sample.md); D-0037 defines Cancel as exact.
Decision:
- Replacing a held sample (Begin while held, after the player confirms "Replace it?") is Discard, then Begin; the worker refuses a bare second Begin.
- The take is a non-undoable command (Undo while a sample is held acts as Cancel). Transfer, Discard and Clean water are ordinary undo points. Sample commands are refused on comparison copies, and compareStart is refused while the source holds a sample.
- Cancel also removes refused sample commands made while held: every log entry with seq ≥ sample.seq leaves the log with its trailing 'command' event, so reused seq numbers never duplicate a log entry.
- Cancel is exact in D-0037's sense: the stateHash equals the pre-Begin hash, also after a save and reload in between. The capped, unhashed event ring (500) and commands.log (10,000) are not part of that promise: when the take or a refused transfer pushes their oldest entry out, Cancel does not bring it back.
- Transfer destinations: held field cells need transport-open cells (open water or porous beads, as the source cells were); objects need no structure; organisms need habitatCompatible, except a parasite riding a held host, which follows its host. Soft capacity counts the dish's own cellLoad plus the incoming B/b0 ≤ 8. Sampling never widens the brush. Deposits mode takes every deposit-kind field (grit too, when the silicate system exists).
- txId = `sample-<tick>-<seq>` (no worldId), so comparison arms and branches hash alike.
- The import refuses a held sample that the game could not have saved: a negative pool or unknown life state; a slot or birthId shared with a living organism or another held row; held links or host pairs that are not mutual within the sample (a prey link may be stale, D-0050); cell offsets off the grid, an origin or rows outside the dish, a radius outside the Lab brush sizes; an object id that clashes with a world object, sits on a world object's cell or is at or above the object counter; a take that is not the latest command (seq), or a birthId at or above the birth counter. Messages end "Nothing was loaded.".
Reason: SPEC §10.5–§10.6, §14.3; D-0037; saves are sacred; determinism.
Affects: src/sim/{sample,sampleSlot,commands,tools}.ts, src/worker/{host,protocol,client}.ts, src/ui/panels/{SampleSession,SamplePanel,LabTray}.tsx, src/persistence/saveFile.ts, tests/sim/tools.test.ts, tests/worker/sample-transaction.test.ts.
Owner review: no

## D-0055 · 2026-10-10 · P3.7 · E04 Holdfast and E07 Light seeking as built
Context: wave 3 mod-anchor-light (docs/reports/reviews/g3-wave-3/mod-anchor-light-build.md, wave-verify-2.md).
Decision:
- The dish rim (ST_OUTSIDE, or a neighbour off the grid) counts as E04 support (SPEC §2.1: the rim is a solid edge). Gel and sediment are not support; mesh comes in Phase 5.
- An anchored carrier stays "free" for CT §3.2's prey rules: FLAG.attached is never set by E04, so P02/P05/P07 may take an anchored B06–B12.
- Every E04 detach starts the 10 s lockout, including the release on Resting. Release happens on Resting only, not Preparing: a Preparing carrier keeps its anchor (and pays its upkeep) until it rests. Attaching does not require recent usable intake.
- Division clears the retained daughter's anchorLockout as well as anchorState, anchorSeconds and noUsableIntakeSeconds, so both daughters start identical.
- One lockout convention for E04 and E12 (lead, wave verify 2 MINOR 3): a 10 s lockout blocks the next 100 ticks after the detach or link break, whatever the slot order; the attach or pairing clock may run again from the 101st tick.
- E07 candidates are the organism's own cell plus cells at least brighterBy (0.01, with 1e-12 float tolerance) brighter; among those, the ordinary 0.5·F + 0.4·S − 0.1·C score (F = effective light) picks the target, so a carrier moves only to brighter cells.
- An organism that is not self-propelled never keeps FLAG.moving or FLAG.hunting (lead fix: a daughter that lost E07 kept its parent's FLAG.moving, and the inspector said "Moving" for a Sunbead that could not move).
Reason: SPEC §2.1, §9 (E04, E07, E12); CT §3.2; every visible feature maps to real state.
Affects: src/sim/{anchor,lightSeeker,movement,phenotype,intakeClock,births}.ts, tests/fixtures/module-e04.test.ts, tests/fixtures/module-e07.test.ts.
Owner review: yes — the rim counts as E04 support; an anchored carrier is still prey for the free-prey hunters.

## D-0056 · 2026-10-10 · P3.7 · E06 Shade tolerance and E08 Debris feeding as built
Context: wave 3 mod-feeding (docs/reports/reviews/g3-wave-3/mod-feeding-build.md, wave-verify-2.md).
Decision:
- For an E06 carrier, food access on the photosynthetic route is the CO2 supplied against its light-shaped ceiling (budget × 0.70 × min(1, light/0.35)); its light response (raw light, without E06) then competes with that access and with N and O2 on equal terms, and LIGHT_LIMITED reports the measured light. Non-carriers keep the g2 access (C/budget), so the fence and every g2 world hold.
- An E08 carrier takes the detritus route only where its cell has detritus > 0 and it holds no meal (a held meal keeps exclusive priority); otherwise it keeps the predator's PRED_NO_PREY reason. It eats the detritus field only, never film (D-0038 keeps film for film digesters).
- On a recorded detritus tick the inspector's action chip says "Eating detritus" ("Finding only traces of detritus" below usable intake), not "Digesting".
- E06 "active now" means FLAG.feeding on the photosynthetic route; A04 mixotrophy must feed the same helper when it lands.
- FLAG 1 << 13 = detritusIntake; 1 << 12 stays unused.
Reason: SPEC §9 (E06, E08); honest labels.
Affects: src/sim/{intake,debrisFeeder}.ts, src/sim/entities.ts (flag), tests/fixtures/module-e06.test.ts, tests/fixtures/module-e08.test.ts.
Owner review: yes — a plain (non-E06) photosynthesizer is never labelled LIGHT_LIMITED while light is above 0, because its access C/budget = light × avail(CO2) is always below its light response: a dim Sunbead reads "not enough food here" instead of "too dark". This is g2 behaviour, and limitCode is a hashed column in every Sunbead world, so changing it rewrites old worlds' hashes. Proposed: apply the E06 decomposition to every photosynthesizer in new worlds only, keyed to a recorded ruleset bump, at the next fence-updating change the owner approves.

## D-0057 · 2026-10-10 · P3.7 · E09 Broth making, E10 Matrix building and the final stage 8 order as built
Context: wave 3 mod-builders (docs/reports/reviews/g3-wave-3/mod-builders-build.md; recheck W4-16 alternative).
Decision:
- `secreting` is a producer bit set: starch 1, oil 2, protein 4, each producer ORing its own bit, with FLAG.secreting as the OR. Starch stays 1, so B06, E01 and every g2 hash are unchanged. CUE2_RELEASING_PROTEIN is bit 4 (also set for native B08); the renderer draws the protein marks only together with CUE2_MOD_E09.
- E10's request is capped at remainingEnergy / energyPerCarbon as well, so it can never reserve energy that is not there (with minEnergy 35 this cap never binds). A refused E10 returns ENERGY_LOW for energy and NONE otherwise; builders keep no saved refusal column.
- E10 "active now" is an observation-only per-world map (slot → birthId), checked against birthId, rebuilt every stage 8, never saved or hashed; it is empty after a reload until the next tick (like fungalFlow).
- The E09 card for a species that already drinks broth (Y02) reads "Its kind already drinks broth; this ability does not change that." instead of "cannot consume broth".
- The final stage 8 table (structures.ts header): mandatory transitions → natives by action ID (E_STARCH 0, E_OIL 1, E_PROTEIN 2, BIOFILM 3) → E01, E09, E10; the D-0045 two-producer test now exists (B04 with E01 + E09).
Reason: SPEC §3.2 row 8, §9 (E09, E10); D-0045; determinism (g2 hashes unchanged).
Affects: src/sim/{secretion,actions,structures,construction,matrixBuilder,moduleView}.ts, src/ui/strings/modules.ts, tests/sim/stage8-order.test.ts, tests/fixtures/module-e09-e10.test.ts.
Owner review: no

## D-0058 · 2026-10-10 · P3.7 · E12 Adhesion as built, and stricter module checks on import
Context: wave 3 mod-adhesion (docs/reports/reviews/g3-wave-3/mod-adhesion-build.md) and the saves verifier's MINORs 2 and 3 (saves-verify-f02-links+food-objects+mod-adhesion.md).
Decision:
- "Free" for pairing means not FLAG.attached and not E04-anchored (anchorState 1): an anchored carrier may not pair. Links are not cut when an organism anchors later (a linked member does not move, so it cannot reach support on its own).
- The 2 E link cost is ledgered as energy 'other'.
- A member that already holds 2 links neither times nor is timed, so a third-link refusal happens only when two pairs sharing a member resolve on the same tick; the 8-member colony cap is checked at resolution, so a 9th member fails visibly (D04 §6).
- Proposals are one-sided and deduplicated; every proposal is re-checked at resolution (both alive, not linked to each other, both E ≥ 20, then the caps); after a link or a refusal both ends' clocks restart.
- The lockout counts down at the end of stage 5, after the pairing check, so a 10 s lockout blocks exactly 100 ticks for both ends (the convention D-0055 gives E04 too).
- The import refuses E12 pairing state the simulation cannot produce (lead fix, docs/reports/reviews/g3-wave-3/lead-fixes.md): a lockout outside [0, lockoutSeconds]; a clock below 0 or above linkSeconds + maxLinks × dt (a ready pair whose re-check fails at resolution, e.g. because an earlier link in the same pass spent one end's energy, keeps its clock for another tick, so 5.0 s can become 5.1 s); a partner birthId that was never issued (≥ nextBirthId; a partner that has since died is legitimate and loads); and non-zero pairing state on a dead slot, in a dish without E12 or on an organism whose genome lacks E12 (every removal clears the slot, and division clears the retained daughter).
- The import refuses a recorded module whose parameters are incomplete (moduleRules `missingModuleParams`), with "… Nothing was loaded.", instead of loading a world whose first tick would throw (lead fix; the pattern predates E12).
Reason: SPEC §9 (E12), §14.3; D04 §6; saves are sacred (a failed import never touches the current world).
Affects: src/sim/{adhesion,contacts,maintenance}.ts, src/persistence/saveFile.ts, tests/fixtures/module-e12.test.ts, tests/persistence/*.
Owner review: yes — E12's "free" excludes anchored carriers; the link cost is ledgered as 'other'.

## D-0059 · 2026-10-10 · P3.7 · Phase 3 modules enabled (moduleRegistryVersion 1 → 2); recipe trajectories change only through mutation module options
Context: the lead module flip (docs/agent/g3-wave-3.tasks.js.txt "LEAD MODULE FLIP"; recheck W4-20…W4-24; D-0036, D-0042); reports docs/reports/reviews/g3-flip/flip-{build,verify,fix1}.md.
Decision:
- `content/manifest.json` enables E04, E06, E07, E08, E09, E10 and E12 beside E01, E03 and E05 (all of IMPLEMENTED_MODULES), with moduleRegistryVersion 1 → 2; contentHash rewritten by content-validate --write. The atlas is unchanged (all ten marks present since wave 2; art:build --check up to date).
- A world changes only through what it records. New dishes record registry version 2 and the ten modules; module-gain draws (mutation and Diverse founders) pick uniformly among CT §7.1's larger legal lists. Old saves and Phase 2 dishes keep their recorded registry (version 1; E01, E03, E05) — verified: pre-flip worlds saved and loaded by this build keep v1 and continue to the same hash as without the save/load, 3,000 ticks on.
- Fence: no digest moved at its tick. In all 18 entries a single module draw fires by the fence tick (FOOD_TRAIL_V1 birth 45, tick 443) and it picks E01 under both lists; `registryWith({ enabledModules: shipped minus the seven, moduleRegistryVersion: 1 })` reproduces every recorded currentDigest; g2Digests and the g2 saves' expected values are unchanged; `fence-update --all --reason D-0059` re-records nothing. So the fence does not see the flip; the curated and P3.9 recipes that wave 4 adds with modules on founders (L306, EXP_212) give it Phase 3 module coverage.
- Longer horizons move: Accelerated FIRST_DISH_V1 seed 101 birth 71 gains Shade collector (E06) instead of Reserve chamber (E05) and its first branch is established at tick 1927 (1415 before); seed 11 birth 72 gains Light seeker (E07); EXP_102 arm A birth 426 gains E07 instead of E05 (reservePeak.A01 12.62 → 0). Tests that follow those trajectories were re-pinned with the new module names; tests whose subject is Phase 2 content pin `registryWith(G2_LISTS)`; measurement changes are in docs/reports/experiments-g2.md "After the Phase 3 module flip (D-0059)"; the wave-A goldens are unchanged.
- Test helpers built as `registryWith({ enabledModules: [...shipped, 'E0x'] })` now duplicate and fail validation; module tests use the shipped registry. A no-film registry must also drop E10 (it needs the film system); link-table tests with test-only adhesion links use a dish without E12.
Reason: SPEC §9; CT §7.1; D-0036 (the flip ends P3.7 under a registry version bump); old saves keep their recorded ruleset.
Affects: content/manifest.json; tests/helpers/world.ts (clearWater registry argument); the pinned tests listed in flip-build.md; docs/reports/experiments-g2.md.
Owner review: no

## D-0060 · 2026-10-10 · saves · A field cell may sit within float roundoff below zero in a save
Context: the flip verifier's MAJOR (predates the flip; g2 behaviour): a whole-body capture (`consumePrey`, takeN = N·B/B rounds one ulp above N) can leave an empty debris cell at about −1.4e-17. The game saved that world, then refused to load it ("Field detritusN has an invalid value at cell …"); a Deposits sample over that cell was refused too.
Decision: the import (world fields in `parseSaveFile`, held-sample cells in `savedSampleProblem`) accepts a finite field value ≥ −1e-12 (`src/sim/fieldValue.ts` FIELD_ROUNDOFF) and keeps it bit for bit, so the loaded world continues exactly; anything lower is refused as before. The simulation is unchanged: clamping the split moves recorded trajectories (the wave-A EXP_B golden moves by one ulp), which would rewrite old worlds. The inspector lists only fields above 1e-6, so the player never sees the value.
Reason: saves are sacred (the game must load what it saves); old saves keep their recorded ruleset.
Affects: src/sim/fieldValue.ts, src/persistence/saveFile.ts, src/sim/sampleSlot.ts, tests/sim/capture-roundoff.test.ts.
Owner review: yes — whether a future ruleset bump should also clamp the capture split in the simulation.

## D-0061 · 2026-10-10 · P3.8 · Field Guide, tools pack, relationships seen and badges as built
Context: wave 4 stage 1 field-guide (docs/reports/reviews/g3-wave-4/field-guide-{build,fix1}.md); D-0039.
Decision:
- Tool records (`content/tools/*.json`, ToolSchema) carry summary, biology, rules, example, changes / doesNotChange / watchFor and optional `where` and `dose` (the tray's lines, "{fraction}" filled with the chosen amount). A tool is enabled by `phase ≤ buildPhase` (no manifest list), is never recorded in a world or save, and contentHash includes the tools collection only when it is non-empty. Phases: SNAPSHOT, UNDO, OVERLAYS, INSPECT 1; ERASE_STRUCTURE, DUPLICATE, COMPARE 2; SAMPLE, TRANSFER, CLEAN_WATER 3. The Lab tray reads the same records, so guide and tray never disagree; Transfer has its own lines.
- Guide validation: every enabled species, material, module, habitat, structure and tool needs complete guide text (file → field errors). A material's rules say "No additional modeled reaction." unless guideRules lists its reaction. Naming a species that is not enabled is an error in summary, example or a tool line only when that species belongs to a later phase than the build; a test manifest that merely leaves a shipped species out gets a warning, and biology or rules text always gets a warning (47 such warnings in shipped content today).
- Modules appear in each species entry as "Abilities it can gain" (enabled eligible modules) and as their own entries in the Species tab; habitats appear in Structures & tools. The guide shows this build's enabled content (it is the game's reference), not the open dish's recorded manifest; the registry is built lazily when the guide opens.
- CT §3.2 "within N cell(s)" is the hunter's capture reach, carried in content as sensingRadius, not a requirement on the prey.
- Relationship ids are `<kind>:<actor>:<target>` with kinds eats, catches, infects, attaches, bursts, drains and converts. "eats" covers the pools sugar, starch, oil, protein, broth, detritus, metabolite, film and co2 (co2 reads "took up carbon dioxide in light"); digesting a held meal and a host drain are not "eats"; a lysis or drain death is credited only to the virus or parasite the watcher saw on that host; conversions are credited through D-0051's producer rule. The watcher reads only recorded state (an observation-only per-tick species × pool intake record, POST_G2_DERIVED_KEYS) and runs in DishHost.stepDish, never on comparison copies or rollback replays (stateHash and the full trajectory digest are identical with and without it). Each id keeps its first sighting per device, across dishes (D-0039 device store `pixelmeba.relationships`).
- Badges: seven cosmetic badges, one per relationship kind, no counts, timers or streaks, outside saves.
- Opening the guide from a dish pauses it; Back returns to that dish at its prior speed (or Home).
Reason: UX §2, §5.7; SPEC §12.3, §12.9, §18; D01 (cosmetic badges); content is data; honest labels.
Affects: content/tools/*, src/sim/content/{schema,registry,guideRules}.ts, src/ui/views/FieldGuide*.tsx, src/ui/{badges.ts,strings/guide.ts}, src/worker/{relationships,host,protocol,client}.ts, src/sim/intake.ts (observation record), tests/content/guide.test.ts, tests/ui/badges.test.ts, tests/worker/relationships.test.ts, tests/e2e/field-guide.spec.ts.
Owner review: yes — (1) the not-enabled-name rule (error only for later-phase species); (2) 47 guide warnings: biology/rules text names species not in v1.0 (e.g. P02's text names Lantern, Sleeper and Needlejaw) — reword for launch or keep as written per CT.

## D-0062 · 2026-10-10 · P3.9 · Experiments EXP_104, EXP_105, EXP_212 and curated dishes L301, L303, L304, L306 as built
Context: wave 4 stage 1 experiments-curated (docs/reports/reviews/g3-wave-4/experiments-curated-build.md; docs/reports/experiments-g3.md).
Decision:
- Recipes gain `ops` (habitat edits applied at realization; the New Dish preview draws the same grid) and founders gain `placement` ('nearest' default | 'scatter'), an explicit `cells` list, a labelled `initial` override (a per-member array aligned with `cells`, logged as 'recipe:<id>:initial'; energy differences go to the energy ledger) and `links: 'chain'`. Defaults keep every earlier recipe bit-identical (fence unchanged). Scatter draws use the new stream `founder.place` keyed by founder group index.
- Tracked measures `infections.SP`, `limitSeconds.SP.REASON` (organism-seconds; suitability reasons read as the inspector reads them), `transfer.fungal` and `wholeUnitCells.SP`, recorded only when an observer asks. Player steps `inspectOxygenLimits` and `observeInfection`; EXP_212 has none (its evidence is the exact transfer ledger).
- EXP_104 and EXP_105 stop at 180 s; EXP_105's phage is two labelled 5-unit patches.
- Curated dishes: Standard evolution, scatter placement, seed = recipe number; ids keep the plan's file names (L301_TWO_LUNCHES, L303_PUBLIC_KITCHEN, L304_EMPTY_AFTER_THE_FEAST, L306_BORROWED_SHELTER); L306 has Identical founders with E10 on alternate members (labelled "present at creation"); L303's "free nutrient 0.1" is nutrient set to 0.1 in the patch. New Dish lists curated dishes as Start-with choices from the bundled recipe records; choosing one takes its authored seed and settings, and any change is recorded as the player's.
- EXP_104 (A hidden neighborhood) does not reach its gate on CT's recipe: no Sprinter is ever OXYGEN_LIMITED (O2 stays above 0.7 in every Sprinter's cell; the Dusks die of high oxygen, D-0048). Per SPEC §13.2 it is not release-ready until a new recipe revision reaches the gate; its player texts were made conditional so they promise nothing the dish does not show. Before v1.0 the lead either ships a tuned HIDDEN_NEIGHBORHOOD revision whose fixture reaches the gate, or keeps EXP_104 out of the shipped card list.
Reason: SPEC §13.1–§13.2; CT §9.3, §10.1, §10.3; D04 §8; determinism (one new stream, defaults bit-identical).
Affects: src/sim/{recipes,experiments,pairedRun,variants,rng}.ts, src/sim/content/schema.ts, src/ui/views/NewDish.tsx, src/worker/host.ts, content/recipes/*, content/experiments/EXP_104/105/212, tests/experiments/{hidden-neighborhood,one-host,fungal-supply-line}.test.ts, tests/recipes/curated.test.ts, tests/fixtures/fence.json (entries added).
Owner review: yes — EXP_104 needs a recipe revision (e.g. a lower starting oxygen) or stays out of v1.0.

## D-0063 · 2026-10-10 · G3 · Gate fixtures: relationship matrix, conservation of all pools, transport and obstacles
Context: wave 4 stage 1 g3-fixtures (docs/reports/reviews/g3-wave-4/g3-fixtures-build.md, wave-verify-2.md).
Decision:
- The G3 relationship evidence is `tools/relationship-matrix.ts` run under the shipped manifest; its expectations come only from the docs (CT §1.1, §3.1–§3.5, §5, §7.1; SPEC §5.3) through `tests/helpers/tables.ts`, never from content JSON. A failing row is never weakened: it would go to KNOWN_BUGS with it.fails and a bug id (none today: 711/711 rows pass). docs/reports/relationships-g3.md is regenerated at the gate whenever contentHash changed.
- Fixtures that run whole-dish horizons report their wall time instead of asserting it (the shared 2-CPU machine varies threefold with load); the relationship matrix keeps its ≤ 90 s check. conservation-all-pools takes ≈ 80–120 s.
- Conservation fixtures keep SPEC §3.4's relative gate (< 1e-5) and add an absolute per-element residual bound measured against real roundoff (lead fix), because in CO2-dominated dishes the relative gate alone misses a one-off 0.01 C leak.
Reason: BUILD_DIRECTIVE G3 evidence; SPEC §3.4, §17; conservation.
Affects: tests/fixtures/{relationship-matrix,conservation-all-pools,transport-obstacles}.test.ts, tests/helpers/tables.ts, tools/relationship-matrix.ts, docs/reports/relationships-g3.md.
Owner review: no

## D-0064 · 2026-10-10 · P3.10 · Audio as built
Context: wave 4 stage 1 audio (docs/reports/reviews/g3-wave-4/audio-{build,fix1}.md).
Decision:
- Stable cue ids: drop, placement_error, select, save, discovery, compare_result, division, card_open, wake (ARCH's placement_ok is `drop`; gate_click waits for a gate control). World cues (division, wake, discovery) share a 4-per-second budget; UI cues are unlimited, one per player action. Coalescing per cue: division 5 s (CT §12.10), wake 1 s, discovery 250 ms; a request over budget joins its cue's latest play or is dropped and counted. Division sounds only for non-bacterial, non-viral births (by the world's recorded species category), so a bacteria-only dish makes no division sound; its visible equivalents remain. Every cue has a visible equivalent (listed in src/audio/cues.ts).
- Settings: quiet audio = effects −12 dB and the ambient loop off; defaults effects 0.7, music 0.4, voice 0.8, muted off, quiet off, haptics off (optional Settings fields, so older prefs load). The ambient loop plays at −24 dB on the music bus while audio is active, not muted or quiet, and music > 0. No sound before the first gesture; audio suspends with the page.
- Haptics: web only, feature-detected `navigator.vibrate`, only for accepted placements, off by default. The Android build has no haptics until P4.10 adds the VIBRATE permission (PLAY_STORE_CHECKLIST).
- Reduced motion has no audio effect: it governs visual motion; quiet audio is the separate audio comfort setting (UX §9 lists both).
- src/audio imports nothing from src/sim (tested); no cue consumes simulation randomness.
Reason: ARCH §10.3; UX §8.1–§8.2, §9; CT §12.10; R25.
Affects: src/audio/**, src/ui/panels/SoundSettings.tsx, src/ui/{state.ts,main.tsx,views/SimplePage.tsx}, cue call sites, tests/audio/**, tools/audio-preview.html.
Owner review: yes — (1) manual listen of every cue (`npm run dev`, open /tools/audio-preview.html); (2) whether reduced motion should also quiet audio.

## D-0065 · 2026-10-10 · P3.11 · Accessibility pass 1 as built
Context: wave 4 stage 2 a11y (docs/reports/reviews/g3-wave-4b/a11y-build.md, wave-verify.md).
Decision:
- The dish has one keyboard stop: a `role="application"` element over the canvas and under every panel. When it has focus it shows an amber-and-ink centre reticle. Arrows pan. Enter is one tap at the viewport centre, through the same gesture handlers as a pointer tap. It sits inside the existing window keydown handler, after the What if? guard (D-0026).
- One always-mounted polite live region (src/ui/a11y/LiveRegion.tsx, mounted in App) reads out `toast.value`. Visible toasts carry no live role, so nothing is announced twice, and a toast raised during a route change is still announced.
  - Because the sr-only region repeats the toast text, an e2e check for toast text must scope to the visible toast, e.g. `page.locator('.toast', { hasText })`. The lead scoped compare.spec.ts :99/:143/:151 and inspector.spec.ts :130; the gate's full e2e run catches any other such check.
- The dish summary's trend is the living count over the last 30 s of dish time, as the screen received it, not History biomass. A 'history' request is a recorded player step for EXP_103 and EXP_106 (host.ts `experimentHistoryOpened`), so polling it would complete card steps. The wording says "count".
- Contrast:
  - `--danger` is #AD4239. UX §6.1's #B3473F is 4.44:1 on --surface-2, and UX §4.1 requires 4.5:1.
  - The inspector's energy and health fills are #9A6A12 and #3F8146 (≥ 3:1 on their track).
  - The focus ring is the 3 px amber outline plus a 7 px ink (#172C35) ring, ≥ 3:1 on every audited surface.
  - docs/reports/contrast.md is generated by `npx tsx tools/contrast-audit.ts --write`.
- Settings "Simplified overlay colours" is off by default. When on, every overlay, pH included, uses one light-to-dark ramp (#F5F4EF → #7A929E → #0A1419), and the legend follows. Under reduced motion the newborn fade is off. Defaults are byte-identical.
Reason: UX §4.1, §6.1, §9; BUILD_DIRECTIVE P3.11; honest labels (a count trend is named a count).
Affects: src/ui/a11y/*, src/ui/styles.css, src/ui/state.ts, src/ui/app/App.tsx, src/ui/views/{DishScreen,CompareScreen,ExperimentRun,SimplePage}.tsx, src/ui/panels/OverlayLegend.tsx, src/render/{layers,renderer}.ts, tools/contrast-audit.ts, docs/reports/contrast.md, tests/ui/a11y-*.test.ts, tests/e2e/{keyboard,a11y-screens,compare,inspector}.spec.ts.
Owner review: yes — (1) the UX §6.1 danger colour moves from #B3473F to #AD4239; (2) the dish summary trend is a count, not biomass, unless a read-only 'history' request flag is added (a protocol change). Open MINORs carried to integration: DishSummary says "extinct" for a species held only in a Sample; keyboard.spec's second test does not prove panning or the cell description; restoreFocus after a pointer action can let Enter place at a hidden centre.

## D-0066 · 2026-10-10 · P3.12 · Performance pass 1 as built; the tick and memory criteria are not yet met
Context: wave 4 stage 2 perf (docs/reports/reviews/g3-wave-4b/perf-build.md, saves-verify-perf.md, wave-verify.md; docs/reports/perf-g3.md).
Decision:
- The hot-path edits are kept. They are hash-neutral, proven three ways:
  - stateHash and snapshot digests of the 6,000-agent stress world at ticks 0/600/1500/3000 equal HEAD's;
  - five recipes are identical to HEAD at 1×, 4× and across saves at awkward moments, including a held sample;
  - g2-replay and the four trajectory-fence files pass.
  The edits:
  - one-step `Object.fromEntries` column and field stores;
  - movement's food-score preparation and blocked-window prefix sums;
  - intake index tables;
  - film marked inactive when all-zero (a derived flag, never saved or hashed);
  - direct link-column reads;
  - the creationFounders memo;
  - snapshot link columns resolved once.
  They halve the 1× tick at 6,000 agents.
- The stress dish is tools/perf-stress.ts: 6,000 agents, 2,000 fungal segments, every Phase 3 system. tests/perf/stress-shape.test.ts pins its shape.
- The BUILD_DIRECTIVE P3.12 criteria are recorded as measured, not claimed:
  - 1× tick: CPU p50 18.8 / p95 23.9 / p99 42.6 ms at 6,000 agents on the shared 2-vCPU codespace with other agents running (load 1.7–7.4). The criterion is < 10 ms. The limiting stages are sense/move 7.3, intake 4.8, environment 2.7 and structures 2.7 ms. The lead re-measures on a quiet machine at the G3 gate.
    - If the quiet-machine p95 is still ≥ 10 ms, the remaining gap and its stages carry to P4.13 (performance pass 2).
    - Rule-changing options are NOT taken: a diffusion roundoff cutoff, or enzyme/inhibitor diffusion at half rate. Either needs an evolutionRulesVersion entry and owner approval.
  - Memory: the genome table and the derived `world.profiles` cache grow with every new genome, about 100 per minute in the dense dish. The compaction that src/sim/genome.ts:3 describes ("compaction (P1.2) rebuilds it…") was never implemented; that comment is wrong. Heap slope over minutes 5–15 is 1.73 %/min with a save inside the window and 0.97 %/min without one (41-minute run). Most of the 5–15 window is the 30-minute history filling up by design.
    - The hash-neutral first step, evicting derived profiles for genomes with no living carrier, is done in P4.13 with the tick work.
    - Genome-table compaction changes saved genome ids and the hash, so it needs a rules-version entry and owner approval.
- P3.12 is ticked with these two criteria marked open (WORKLOG note); it is NOT reported as meeting them.
Reason: CLAUDE.md "Measure, don't guess"; "never skip ticks or change the timestep"; determinism (no rule changes without a version); honest labels in our own reports.
Affects: src/sim/{entities,fields,founders,fungi,intake,movement,transport}.ts, src/worker/snapshot.ts, tools/{perf-stress,render-bench,render-bench-run}.ts, tests/perf/stress-shape.test.ts, docs/reports/perf-g3.md.
Owner review: yes — (1) the < 10 ms criterion on the codespace versus a phone-class target after the quiet re-measure; (2) genome-table compaction under a rules-version entry; (3) the two rule-changing tick options. MINORs for P4.13:
  - a live world and its reload differ in the derived film-active flag (outcome-neutral, verified);
  - movement.ts's module-level food arrays keep the last world's fields reachable;
  - DishHost.sendSnapshot could send `ids` and `deposits` only on change (−0.15 MB per snapshot, hash-neutral).

## D-0067 · 2026-10-10 · G3 · Gate evidence choices
Context: wave 4 stage 2 g3-evidence (docs/reports/reviews/g3-wave-4b/g3-evidence-build.md).
Decision:
- FIRST_DISH_V1 stays at revision 1 at G3 (D-0015 re-measured, docs/reports/tune-g3.md). The D06 targets are met on 6/6 seeds, and the G2 ecology is unchanged on 5/6. No candidate keeps Recyclers on most seeds without new seed-to-seed swings.
- G3's Appendix A determinism line comes from tests/fixtures/determinism-g3.test.ts, the Phase-3-heavy session: host 4× = host 1× = headless = reload with a held sample. Its comparisons are relational; no hash literal is pinned.
- The response document shows the relationship table compactly: the family summary with row counts, plus every positive relationship grouped by actor. The full 711-row table stays in docs/reports/relationships-g3.md (regenerated at the gate).
- Curated dishes that empty (L301, L306) are an owner item. The options: say in the dish text that the food is finite, or a new revision with one renewable source, re-measured on six seeds. L303 waits on the D-0051 producer ruling.
Reason: BUILD_DIRECTIVE G3 evidence; SPEC §13.2; determinism.
Affects: tests/fixtures/determinism-g3.test.ts, tests/e2e/launch-ecology.spec.ts, docs/reports/tune-g3.md, docs/EXPANSION_RESPONSE.md (G3 draft), docs/reports/img/g3/.
Owner review: yes — curated dishes that empty (L301, L306; L303 after D-0051).

## D-0068 · 2026-10-10 · P3.9 · EXP_104 ships on HIDDEN_NEIGHBORHOOD_V1 revision 2 (starting oxygen 0.03)
Context: D-0062 left EXP_104 not release-ready: revision 1 (closed Water Garden, oxygen 0.8) never lets a Sprinter run short of oxygen and kills every Dusk by about 50 s. The lead probe (docs/reports/exp104-revision-probe.md) measured starting oxygen 0.3 → 0.03 with CT's founders and patch unchanged.
Decision:
- HIDDEN_NEIGHBORHOOD_V1 revision 2: `backgroundOverrides.oxygen` 0.03; founders, patch, seed, lid and stopping time unchanged. Revision 1 is not kept as a separate record: no save or journal outside development holds it (the card was never released), and stamps record `recipeRevision`.
- Measured (seed 104, 180 s, tests/experiments/hidden-neighborhood.test.ts): gate reached at 1 s; B01 OXYGEN_LIMITED 131.1 org·s, from tick 8 to tick 126 only (the founders' feast empties the patch's oxygen, then FOOD_ACCESS_LOW leads and oxygen diffuses back); B03 SUIT_OXYGEN_HIGH 3496.7 org·s; oxygen mean 0.027; alive B01 28 / B03 20; ledger checks all ok.
- Because the oxygen-limited moment lasts only about the first ten seconds, the recipe text, the card's intervention and predicted trade-off, and the `inspectOxygenLimits` step line say the dish starts low in oxygen and to pause in the first seconds, while the patch is busiest. The step stays conditional ("if none is, note what holds them back instead").
- The fence entry HIDDEN_NEIGHBORHOOD_V1 is re-recorded with this decision as its reason (`fence-update --recipe`); no other entry moves.
Reason: SPEC §13.2 (a card ships only on a revision that reaches its gate); honest labels (the text says when the reading appears, nothing scripted makes it appear); the starting oxygen is a recorded recipe setting, not a hidden rescue.
Affects: content/recipes/HIDDEN_NEIGHBORHOOD_V1.json, content/experiments/EXP_104.json, content/manifest.json (contentHash), src/ui/strings/experiments.ts, tests/experiments/{hidden-neighborhood,hidden-neighborhood-host,journal-and-words}.test.ts, tests/fixtures/fence.json, docs/reports/experiments-g3.md.
Owner review: yes — EXP_104 now reaches its gate only in the first ~10 s of the run; the alternative is to keep it out of the v1.0 card list.

## D-0069 · 2026-10-10 · G3 · Fixes from the gate's full three-project e2e run
Context: the builders of waves 2–4 ran their own journeys on the desktop project only (fast-track). The gate's first full run (258 tests) failed seven phone-portrait journeys before any phone-landscape result.
Decision:
- Five product fixes (three CSS for phone-sized screens, one label, one input):
  - Field Guide at 200 % text on a 360 px phone: every card was 367 px wide in a 328 px column, because a long name ("Crossfeeder", "Photosynthetic inhibitor") beside the thumbnail could not shrink and the panel grid's auto column grew to it. `.guide-panel` now has a `minmax(0, 1fr)` column; the entry head wraps (the name drops under the thumbnail); names break only when a single word is wider than the card (`overflow-wrap: anywhere`). Measured in the browser: no element overflows on any of the four tabs.
  - Sample → Transfer on a phone (≤ 480 px): the held panel was 276 px tall over a 566 px dish view and covered the dish centre while asking the player to tap where the sample goes. While choosing the destination the panel drops its totals line (shown in the step before and in the "Sample taken" toast): 205 px, and the dish centre and lower half are free to tap.
  - Sample session on a phone on its side (landscape, ≥ 700 px wide, ≤ 480 px tall): the dish view is 460×299 and even the aim panel (388×104) covered the dish centre, so a tap there never aimed. The panel now takes the side column's place (fixed, bottom-right, 324 px wide), as the landscape Lab trays do ("it never covers the dish"). Measured: every tested cell and the dish centre reach the dish in all four states; the zoom buttons stay reachable. Desktop keeps the panel over its large dish.
  - The screen-reader dish summary said "None in the dish now: … Pinphage" right after a Pinphage dose (seen in a phone failure snapshot). A phage is measured in units per cell, not counted, so the organism summary now leaves viral species out (`organismInputs`, src/ui/a11y/describe.ts); its units show in the cell inspector and the Infection overlay.
  - A dish tap counted only if pointerup came within 400 ms of pointerdown, both read with `performance.now()` when the handlers ran. Under load (the gate machine at load 10) a busy main thread delayed a handler past 400 ms and the tap was silently dropped; a slow phone with a heavy dish would do the same. src/ui/gestures.ts now measures the press with the events' own `timeStamp` (when the browser received them). Cosmetic input timing only; no simulation state.
- Test fixes (each test kept its claim; none was loosened to pass):
  - add-life-w2: the P02/P03/P04 diet lines and the Lab Siltworm line name Oilwick, Brothmaker and Creambud since wave 3 put them in every dish's records (the app was right; the pins were stale; the expected lines were recomputed from content/species).
  - field-guide and launch-ecology: the speed is chosen and read through new helpers `chooseSpeed`/`expectSpeed` (tests/e2e/helpers.ts), because phones show one cycling speed button instead of the 1×/2×/4× group.
  - launch-ecology's cell read on the protein dose wheel-zooms about the dose first (the camera keeps the point under the cursor), so the pick radius is about one cell on any screen.
  - food-objects: the inspector tap re-aims at the cell after the tool change (the phone's dish viewport height follows the Lab bar).
  - phage: each organism in the candidate list is tried (on a phone one tap gathers several); each tap waits for the panel it opens instead of a fixed 150 ms; and each tap re-fits the dish first (on a phone the camera lifts a selected organism above the inspector sheet and stays there; EXPANSION_RESPONSE §8 item 28).
  - reactions: the cell taps zoom in about the patch until the pick radius (≥ 12 screen px) is at most one cell.
Reason: UX §4.1 and §9 (reflow at 200 %, the dish stays usable on phones); BUILD_DIRECTIVE G3 (e2e journeys on every project); honest tests (a stale pin is updated to the measured app, never widened to anything).
Affects: src/ui/styles.css, src/ui/gestures.ts, src/ui/a11y/{describe.ts,DishSummary.tsx}, tests/ui/a11y-describe.test.ts; tests/e2e/{add-life-w2,field-guide,food-objects,launch-ecology,phage,reactions}.spec.ts, tests/e2e/helpers.ts.
Owner review: no.

## D-0070 · 2026-10-10 · Phase 4 · Notebook state is not world state
Context: docs/agent/g4-plan.md "Lead calls made up front", call 1; recorded before wave 5 (P4.1–P4.4).
Decision:
- Favorites, nicknames, story cards, bookmarks, gallery entries, prediction notes and goal progress live in a per-dish notebook record next to the world save (ARCH §11.2's "presentation" block, outside the state checksum).
- The record is never in `stateHash`, and nothing in src/sim reads it. Each kind gets a hash test that it never alters behaviour (SPEC §12.6 "Favorites never alter behavior").
- The record has its own schema version, checksum and import validation. An unknown or malformed record is dropped with a message and the world still loads.
- Nicknames go into an export only when the player opts in (SPEC §12.6, §14.4).
Reason: SPEC §12.6, §14.1–§14.4; the simulation contract (the renderer and UI never own biological state); saves are sacred.
Affects: Phase 4 wave 5 (favorites owns src/persistence/notebook.ts; stories and objectives add kinds).
Owner review: no.

## D-0071 · 2026-10-10 · Phase 4 · Objectives are evaluated, never enforced in the sim
Context: docs/agent/g4-plan.md call 2; recorded before wave 5 (P4.4).
Decision:
- The objective engine reads the same observation surface as experiments: the measurement grammar and `ArmObserver` in src/sim/pairedRun.ts, and the experiments' `GateWatch` pattern. It runs in the worker after each published tick.
- It never changes a pause state or a speed, and never counts a blocked or cancelled proposal (SPEC §13.5).
- A goal's state is saved in the notebook record (D-0070). Try my dish turns also keep a baseline reference, start tick and horizon (SPEC §13.6).
Reason: SPEC §13.5–§13.6; no hidden rescue or scripted spectacle (a goal observes, it never steers).
Affects: Phase 4 wave 5 objectives (src/sim/objectives.ts, src/worker/goals.ts).
Owner review: no.

## D-0072 · 2026-10-10 · Phase 4 · No new sim rules in Phase 4; buildPhase 3 → 4
Context: docs/agent/g4-plan.md call 6; the three goals are phase 4 content (CT §10.5), and the registry refuses or filters content with phase > buildPhase.
Decision:
- `simulationVersion`, `evolutionRulesVersion`, `moduleRegistryVersion` and `phenotypeMappingVersion` do not move in Phase 4. If a task seems to need one, it stops and the lead decides.
- The fence (g2-replay plus the four trajectory-fence files) must pass unchanged in every wave.
- content/manifest.json `buildPhase` 3 → 4 (contentVersion stays 2), with `content-validate --write`; the fence digests are biology, so none may move with this bump.
Reason: BUILD_DIRECTIVE Phase 4 (wonder, replay, Android) adds presentation and tools, not biology; determinism and old saves keep their recorded ruleset.
Affects: content/manifest.json (buildPhase, contentHash); every Phase 4 wave.
Owner review: no.

## D-0073 · 2026-10-11 · P4.1 · Favorite families and the notebook record as built
Context: Phase 4 wave 5a favorites (docs/reports/reviews/g4-wave-5a/favorites-build.md, favorites-fix1.md, saves-verify-favorites.md, wave-verify.md, wave-reverify1.md); D-0070.
Decision:
- The notebook record (src/persistence/notebook.ts) is the save file's optional "notebook" sibling of "state", outside the state checksum, with its own version and sha256 checksum; favorites are its first kind. A malformed record, or one over `NOTEBOOK_MAX_BYTES` = 1 MB, is dropped whole with a message and the world loads (the dish-open toast and the Favorites tab say so). 1 MB, not the planned 256 KB: three nested families of up to 6,000 living members plus 20 unpinned records can legally exceed 256 KB, and an oversized record would be lost at the next load (the file limit stays 25 MB).
- An empty notebook is not written to a file or the slot index, so older files and indexes stay byte-identical.
- Limits: 3 followed families, 20 unpinned records kept (the removed record is named). Records hold birth ids and birth ticks only, never organism data. Default family name "{Species} #{root}"; nicknames ≤ 60 characters, cleaned like dish names; three outline glyph patterns (circle, triangle, square). Highlighting is capped at 200 members, then an aggregate "+n" marker (CT §12.10).
- Membership: living members are tracked from lineage parents after every tick and after each accepted command, and saved as a list, so lineage compaction never loses a family. Members lifted into a held Sample stay members (Cancel restores them exactly); Discard removes them. Undo and rollback restore the record that matches the restored world.
- Extinction unpins: a family with no members is no longer followed (its slot frees, the record stays with `extinct`, Pin again is refused). Look back opens History "What happened".
- Duplicate and an opened checkpoint branch copy the favorites only, under the new world id; story cards and goal attempts belong to the world they were recorded in.
- Nicknames: kept in local saves, named slots, checkpoints and the keep flow's file (a kept file is the player's own local copy, like a slot); left out of every shared export (More → Export) unless "Include family nicknames" is checked (SPEC §12.6 "local", §14.4).
- Known limit (re-verifier NIT, read only, not reproduced): after Undo, members are found again by walking lineage up to a recorded member or the root; a member alive at the restore point, dead by the Undo and older than the 10,000 newest births (LINEAGE_RETAIN) can be missed. Accepted for v1.0.
- Favorites never alter behaviour: equal stateHash and trajectory digest with three followed families at 4×, with commands, Undo and a mid-run save → load (tests/worker/favorites-host.test.ts).
Reason: SPEC §12.6, §14.1–§14.4; CT §12.10; D-0070; saves are sacred (a bad notebook never costs the world).
Affects: src/persistence/{notebook,saveFile,store}.ts, src/worker/{favorites,notebookWatch,host,protocol,client}.ts, src/render/renderer.ts, src/ui/{favorites,state}.ts, src/ui/panels/{FavoriteFollow,FavoriteSlots,FavoriteSheet,FavoriteMarkers,FavoriteExtinct,Inspector,MoreSheet}.tsx, src/ui/views/{NotebookFavorites,Notebook,DishScreen}.tsx, tests/ui/favorites.test.ts, tests/persistence/notebook.test.ts, tests/worker/favorites-host.test.ts, tests/e2e/favorites.spec.ts.
Owner review: no.

## D-0074 · 2026-10-11 · P4.3 · Garden card, session memory, prompts and the one-notice slot as built
Context: Phase 4 wave 5a garden-home (docs/reports/reviews/g4-wave-5a/garden-home-build.md, garden-home-fix1.md).
Decision:
- Dish thumbnails are the string `pt1:<species ids in the world's index order>:<base64 of 32×32 bytes>` (each byte 0 or 1 + the majority species index, lowest index on a tie), carried outside the checksum on SaveRequest/SlotInfo and validated by `parseThumb`; positions are rounded to float32 before choosing a block (as snapshots carry them); a slot's picture is computed from the save file's own state, so it is the saved moment. Drawn at 96×96 with nearest-neighbour blocks.
- Home shows Continue with the thumbnail, a Paused badge, name, dish time and mode labels; first launch shows Play only.
- Session memory ("Saved for later", Paused): counts start at the tick the dish was opened in this visit; a history record that began before the opening is left out and the line says "At least N births…"; lines: the first branch established, else "{n} births were recorded since you opened it.", else "Saved as it is now." The read-only 'sessionSummary' query is used (client.history has side effects).
- Prompts (UX §3.2): one optional prompt at a time, only with Show prompts on and in a Garden dish (FIRST_DISH_V1 or its What if? variants). The start line is step 0 and blocks the others until it clears; "A cell split." gives way after 15 dish seconds; step 5 copy "Try Feed: choose a food, see where it lands, then place it."; "Nothing has split yet" only from a machine that watched the dish from tick 0 with a Sprinter alive. Show me outlines a control for 3 s and never clicks, focuses or sends a command. Prompt progress is page-session UI state, not saved (if the owner wants it kept across loads it belongs in the notebook record).
- One visible notice: priority goal > experiment > story > prompt; each kind keeps its latest request; a dismissed id never returns. Nothing shows while the discovery card is open, nor while a favorite family's extinction card is open (one D8 notification at a time, D09 line 133; integration fix).
Reason: UX §2, §2.1, §2.2, §3.2; D08 56–58, 63–64, 140–155, 172–174; honest labels (session lines never claim births from before the visit).
Affects: src/worker/{thumbnail,host,protocol,client}.ts, src/persistence/store.ts, src/ui/{prompts,notices,state}.ts, src/ui/strings/home.ts, src/ui/views/{DishThumb,SessionMemory,NoticeHost,Home,Play,DishScreen}.tsx, src/ui/panels/MoreSheet.tsx, src/ui/styles.css, tests/ui/{prompts,notices}.test.ts, tests/worker/{thumbnail,session-summary}.test.ts, tests/e2e/garden-home.spec.ts.
Owner review: yes — prompt progress is not kept across loads (a loaded Garden dish starts the prompts over at step 1).

## D-0075 · 2026-10-11 · P3.8 fix (wave 5a integration) · A duplicated dish shares no worker state with its original
Context: wave-verify item 11 (docs/reports/reviews/g4-wave-5a/wave-verify.md); integration fix docs/reports/reviews/g4-wave-5a/integrate-code-minors.md. `DishHost.duplicateDish` built the copy with a spread of the original, so the copy and the original shared one P3.8 RelationshipWatcher (D-0039, D-0061): a relationship first seen in the copy was written into the original's "relationships seen" table, and the reverse.
Decision:
- The copy starts with `relationships: null`: a fresh watcher, created the first time the copy is played, exactly as after a reload (the table is never saved). It is not seeded from the original. The device-wide "first seen in your dishes" record lives in the UI store (src/ui/badges.ts), so the Field Guide loses nothing.
- The copy gets its own `undoLabels: []`. The shared array was never read or written through the copy (the copy starts without an undo point and its first undoable command assigns a new array), so this hardening changes no behaviour.
- Audit of every other Dish field in the copy: world, checkpoint, replay and ticksWindow are new; notebook is `favoritesOnly(…)` (D-0073); notebookWatch, experiment, arm, selection and undo are null; lineageView is only ever replaced, never changed in place. sampleBeginHash, the original's Sample Begin hash, is set to null in the copy, as after a reload (integration verifier NIT; the hash is diagnostic only). No other mutable object is shared.
Reason: SPEC §10.7 "Duplicate makes an independent named dish"; ARCH §7 `duplicate {dishId} → new dishId`; honest labels (a relationship is recorded only for the dish it showed in).
Affects: src/worker/host.ts (duplicateDish); tests/worker/duplicate-sharing.test.ts; review docs/reports/reviews/g4-wave-5a/integrate-verify1.md (ok, no BLOCKER/MAJOR).
Owner review: no.

## D-0076 · 2026-10-11 · P4.1/P4.3 follow-up (wave 5b notice-cards) · The two cards in the notice place
Context: the wave 5a integration verifier's three MINORs (docs/reports/reviews/g4-wave-5a/integrate-verify1.md items 1-3); built in wave 5b as the notice-cards task (docs/reports/reviews/g4-wave-5b/notice-cards-build.md, wave-verify.md). Rules: D08 lines 150-151 ("never more than one visible notice", "Prefer a favorite-family event"), D09 line 133, CT §12.10.
Decision: the discovery card and a followed family's extinction card share the notice's place under five rules.
1. **No preemption.**
   - A card on screen keeps the place until its own source closes it (notices.ts recompute).
   - When both cards are asked for together and none is on screen, the extinction card goes first (CARD_ORDER ['extinct', 'discovery']).
2. **No new discovery card under the extinction card.**
   - LineageState.showDiscovery refuses a new card while another card holds the place (`cardPlaceHeldByOther('discovery')`), after the lineage answer and before any card or pause.
   - The pacer keeps those branch ids waiting, starts no 60 s gap and retries after DISCOVERY_RETRY_MS.
   - The pause-on-discoveries pause happens only when a card really shows. Joining an open card is unchanged.
3. **One new card notification per 60 s across the two cards.** An extinction card becoming the shown card (each new queue head included) counts as the last card shown for the discovery pacer (`DiscoveryPacer.otherCardShown()`). The extinction card itself waits only while a discovery card is on screen.
4. **No extinction card is lost.**
   - Extinct favorites wait in a FIFO queue without duplicates (favorites.ts extinctQueue), and the card shows the head.
   - Each of its buttons removes the shown id.
   - 'favoritesRestored' and every answered favorite op drop each queued id whose family is back or gone.
   - Another dish clears the queue.
5. **The wiring is testable in node.**
   - The wiring is src/ui/noticeCards.ts wireNoticeCards(), called once by NoticeHost.
   - The render guards are the pure extinctCardToShow() and discoveryCardToShow().
   - tests/ui/notice-cards.test.ts drives them with the real modules and signals.
Reason: one D8 notification at a time; nothing the player should see is lost; no card is pulled from under the reader (focus would drop to the page).
Affects: src/ui/{notices,favorites,noticeCards}.ts, src/ui/panels/{FavoriteExtinct,DiscoveryCard,DiscoveryPacer,LineageState}.tsx, src/ui/views/NoticeHost.tsx, tests/ui/{notices,notice-cards,favorites}.test.ts and the pacer test.
Owner review: no.

## D-0077 · 2026-10-11 · P4.2 · Story cards as built
Context: wave 5b stories (docs/reports/reviews/g4-wave-5b/stories-build.md, wave-verify.md); the integration fixes (integrate-stories-minors.md, integrate-verify1.md); SPEC §12.7, §12.9; D08 lines 128-155; UX §2, §5.9; D-0070.
Decision:
- **The record.**
  - Story cards are the notebook kind 'stories' (src/persistence/notebookStories.ts), at most 50 per dish.
  - When full, a new card removes the oldest dismissed card, else the oldest opened, else the oldest, and the tab says one was removed.
  - A card holds template, key, world and ruleset identity, evidence ids, a summary with every value its captions need, a time range and `imageRefs` (always [] until P4.6).
  - A card with no evidence, an unknown template, a non-finite value, an unknown or missing summary field, or a species, birth id or time the dish never had drops the whole notebook with the message.
- **The detector** (src/worker/stories.ts StoryDetector, read-only, in the worker; never in src/sim, never for arms or rollback replays). Four templates:
  - A first split: the first committed birth per species in this dish, and the first in a followed family.
  - An enzyme at work: once per whole second with converted carbon. A producer is named only with recorded provenance (D-0051).
  - A family changed: from 'branchEstablished'.
  - A place changed: two regional trait samples, before the command and at least 60 s after it, for one quarter, with "Other recorded changes in between: {k}". It describes a sequence and claims no cause.
- **Pacing** (StoryPacer): at most one notification per 600 dish ticks.
  - A repeat key within the window joins the waiting card.
  - Priority: a followed family's card, then a template not yet opened or announced in this dish, then the earliest.
  - Cards not chosen enter the notebook quietly.
  - The pacer's clock is not saved: after Undo, rollback or a reload it waits one full window.
- **Undo and rollback** remove cards whose first evidence the restored dish does not have ('storiesRestored'). A card keeps only the evidence that is still true.
- **Copies and exports.** Duplicate and an opened checkpoint branch copy no cards (favoritesOnly, D-0073). Cards hold no player text, so "Export without names or notes" keeps them.
- **The UI.**
  - The notice "Something happened: {title}" has Open and ✕ and no sound.
  - The tab "Something happened" comes first, with a quiet dot for an unseen card (Home's Notebook button shows the same dot, D-0079).
  - The card view shows up to 3 panels with m:ss captions and the badge "Memory, not replay". Spotlight moves the camera only. Save picture waits for P4.6.
- **The family card** uses the Lineage sheet's own wording: "Inherited difference", then "Game rules", each rule beside its ancestor's value. No line is called a tradeoff, because the lineage record marks no rule as a cost or a gain (SPEC §12.9; integration fix).
- **Captions** choose "A"/"An" by the name's first letter and use the species plural for any count other than one (integration fix).
- **Pause and restore** (D08 line 153; the Field Guide's convention, D-0061).
  - A card opened from the notice on a running dish records the dish and its speed.
  - During that Notebook visit, Spotlight or the Notebook's Back ("Back to the dish") returns to that dish at that speed, once.
  - Leaving the Notebook any other way ends the visit, and the dish stays paused (D-0028).
  - A card opened from the list never changes speed.
- The detector never alters behaviour: equal stateHash and full trajectory digest with it on and off (Garden plus a sugar deposit, 4×, 3,000 ticks).
Reason: SPEC §12.7, §12.9; D08 lines 128-155; honest labels; one visible notice.
Affects: src/worker/{stories,notebookWatch,host,protocol,client}.ts, src/persistence/{notebookStories,notebook}.ts, src/ui/{stories,state}.ts, src/ui/strings/stories.ts, src/ui/views/{NotebookStories,Notebook,Home}.tsx, src/ui/panels/StoryCard.tsx, tests/ui/stories.test.ts, tests/worker/stories-host.test.ts, tests/e2e/stories.spec.ts.
Owner review: no.

## D-0078 · 2026-10-11 · P4.4 · The objective engine and goals as built
Context: wave 5b objectives (docs/reports/reviews/g4-wave-5b/objectives-build.md, saves-verify-objectives.md, wave-verify.md); the integration fixes (integrate-objectives-minors.md, integrate-verify1.md); SPEC §13.5; CT §10.5; D09 lines 117-134; D-0071.
Decision:
- **The engine.**
  - The evaluator is src/sim/objectives.ts (ObjectiveWatch). It is pure and read-only like GateWatch, and evaluated after every tick with its own ArmObserver. Nothing in the tick imports it (a test checks).
  - The runner and the goal state are src/worker/goals.ts (GoalRunner) and the notebook kind 'goals' (D-0070).
  - Objectives use only the five named predicate types; 'custom' is refused (it stays for experiment gates; PredicateSchema is unchanged).
  - transferAcrossGate reads through a GateReading, null while no gate exists, so it is never offered before Phase 5.
- **Content.** ObjectiveSchema gains summary, completedText, endedText? and offerOn. The three CT §10.5 goals ship, phase 4. An objective of a later phase is skipped, not an error.
- **Ticks.** A completion or end is recorded at the dish tick after the step that showed it (a birth committed during tick m completes at m + 1).
- **Start.**
  - Start checks state predicates at once: no Sprinters at Start ends the attempt, and a threshold already met completes it.
  - Off by default; at most one running goal; at most 20 records per dish.
  - Records copy the title and predicate at Start.
- **Settling.**
  - Completing or ending posts { kind: 'goal' }. The UI shows one dismissible sentence through the notice slot and never changes the speed.
  - The "shown" flag is saved, so a dismissed sentence never returns.
  - Leave turns a running goal into 'continuedFreely' ('left').
  - Continue freely on an ended attempt keeps its end tick and reason. Try again is a new attempt from the current tick.
- **End reasons** (integration fix: every end names what was recorded):
  - 'zero': the predicate ended it;
  - 'undone': Undo;
  - 'failed': an error rollback, worded like the error toast: "Something went wrong and the dish was paused";
  - 'cannotResume': a reopened dish could not run it, announced.

  A completed record stays completed even when Undo rewinds before its ticks.
- **Restores.** After Undo, rollback or Cancel, notebookAfterRestore reports every kind that changed (favoritesRestored, storiesRestored, then one goal change per ended goal), each posted with the final record, so goal changes always autosave.
- **Resuming after a load.**
  - A running goal resumes from its saved progress.
  - An event-ring goal saves `progress.lastEventId` and resumes after it, so a save → load at any moment completes at the same tick as an uninterrupted run (integration fix). A record without it resumes from the load moment.
  - A transfer goal counts from Start, or from the load tick for a resumed watch. Phase 5 revisits this with the gates.
- **Import.**
  - The notebook check refuses a running goal the loaded dish cannot run (its recorded manifest, fields and event ids; loadSaveFile passes goalWorldRefsOf). Such a notebook is dropped whole with the message, and the world loads unchanged.
  - Records are canonical (progress state matches the record). The validator refuses inconsistent ones and accepts the shapes the wave 5b build wrote.
  - Known limit (verifier NIT): Cancel of a held Sample lowers nextEventId. A goal never records an event position during a hold, because time is paused and the runner reads only new ticks.
- **Catalog.** A goal is offered when offerOn includes the dish's recipe or its variant's sourceId, and the recorded manifest has everything the predicate names (D-0079 for the starch goal on variants).
- Evaluation never alters behaviour: equal stateHash and full trajectory digest with and without a running goal over 3,000 ticks at 4×. Blocked or cancelled division proposals never count (a fixture).
Reason: SPEC §13.5; CT §10.5; D09 lines 117-134; D-0027 (observers cannot rewind); D-0071; honest labels; saves are sacred.
Affects: src/sim/objectives.ts, src/sim/content/{schema,registry}.ts, content/objectives/*.json, src/worker/{goals,notebookWatch,host,protocol,client}.ts, src/persistence/{notebookGoals,notebook,saveFile}.ts, src/ui/{goals,state}.ts, src/ui/panels/{GoalChoice,MoreSheet}.tsx, src/ui/views/Play.tsx, src/ui/strings/goals.ts, tests/sim/objectives.test.ts, tests/worker/goals-host.test.ts, tests/content/objectives.test.ts, tests/ui/goal-sentence.test.ts, tests/persistence/notebook.test.ts, tests/e2e/goals.spec.ts.
Owner review: no.

## D-0079 · 2026-10-11 · P4.2/P4.4 · Notification pacing is per source; one visible notice across all sources
Context: wave 5b verifier lead MINOR (docs/reports/reviews/g4-wave-5b/wave-verify.md): CT §12.10 "notifications ≤ 1 per 60 s" holds only per source. Also the verifier NITs on Home's Notebook button and the starch goal's offer.
Decision:
- **Each notification source keeps its own pace:**
  - story notices: at most one per 600 dish ticks. D08 line 151 says "per 60 simulated seconds", so at 4× one can come every 15 s of wall time.
  - the discovery and extinction cards: one wall-clock 60 s pacer between them (D-0076).
  - a goal sentence: answers the goal the player chose, at most one per attempt.
  - the Garden prompts: one at a time and player-paced (D-0074).
- **Across sources:**
  - one visible notice at a time;
  - a card hides every notice while it is up;
  - no card preempts another;
  - a notice that cannot show waits.

  A story notice may therefore follow a card the player just closed. The pacers are not merged into one cross-source clock, because the canonical texts give them different time bases: simulated seconds for stories, the P2.3 wall clock for discovery cards.
- **Home's Notebook button** opens "Something happened" while a story card is unseen, the same signal as its quiet dot (UX §5.9). Otherwise it opens the tab it opened before.
- **The starch goal on What if? variants.** D09 offers WATCH_STARCH_BECOME_FOOD "on Garden"; a What if? variant of the Garden is a Garden dish (its sourceId). The goal is also offered there, and every variant's recipe keeps the starch patch.
Reason: CT §12.10, D08 lines 150-153, D09 lines 117-134; the canonical time bases differ, and "never more than one visible notice" holds everywhere.
Affects: src/worker/stories.ts (StoryPacer), src/ui/panels/DiscoveryPacer.tsx, src/ui/notices.ts, src/ui/views/Home.tsx, content/objectives/WATCH_STARCH_BECOME_FOOD.json (unchanged).
- **Amendment (13:35, first-minute follow-up; docs/reports/reviews/g4-wave-5b/integrate-first-minute.md, first-minute-verify1.md).**
  - A dish's first story notification comes no sooner than 600 dish ticks after the story watch began on that world. The pacer's window starts closed at the tick the watch (re)bound:
    - a new dish at tick 0;
    - a dish opened, loaded, continued, duplicated or branched, at its tick T;
    - a world restored by Undo or a rollback, or replaced by a reload, at that moment. This now holds whether or not a card was already announced.
  - Cards found meanwhile are recorded quietly and wait. When the window opens, pickStory chooses one among them; the rest stay quiet.
  - Following or unfollowing a family does not restart the window.
  - Implementation: src/worker/stories.ts StoryDetector.bind, `new StoryPacer(world.tick)`.
  - Reason: UX §3.2 "Arrival: paused garden; one line … No auto-spawning surprises. One optional prompt at a time" and D08 lines 56-64: the first minute belongs to the arrival line and the optional prompts. The lead's desktop e2e showed "Something happened: An enzyme at work" taking the notice place from "Tap a Sprinter." right after Run.
Owner review: yes.
- Should one cross-source clock limit all unsolicited notices to one per wall-clock minute?
- Is the quiet first minute right?

## D-0080 · 2026-10-11 · Phase 4 wave 6 · The share picture is drawn from a snapshot, not from the live stage
Context: docs/agent/g4-plan.md "Lead calls made up front", call 3; SPEC §14.4; UX §5.10; CT §12.10 "picture 1080×1080"; docs/agent/g4-wave-6.tasks.js.txt (share).
Decision:
- The Picture is a 1080 × 1080 PNG rendered offscreen from the latest published snapshot (SnapshotMsg), with the shipped atlas at an integer scale and nearest-neighbour sampling (src/render/picture.ts).
  - No cosmetic path reads or consumes sim state, and drawing the picture never sends a command.
  - It has no text chunks and no device metadata, and carries nicknames only by opt-in.
- "Living dish" is a full save at a paused tick, written through the existing saveFile path (atomic, checksummed).
- A metadata-stripped export recomputes the hash.
Reason: CLAUDE.md "The renderer never owns biological state … Nothing cosmetic can consume simulation randomness or alter outcomes"; SPEC §14.4.
Affects: the wave 6 share task (src/render/picture.ts, src/persistence/recipeFile.ts, src/ui/share.ts, ShareSheet).
Owner review: no.

## D-0081 · 2026-10-11 · Phase 4 wave 6 · Try my dish clones, never mutates
Context: docs/agent/g4-plan.md call 4; SPEC §13.6; docs/source/D09 lines 132-139; the wave 6 try-my-dish task.
Decision:
- Each turn is a new world id (branchWorldId) made from the immutable baseline by the existing load path. A turn starts paused, and the baseline is never written again.
- At the horizon the dish pauses and offers Keep this result, Another turn and Finish.
- Only the prior unsaved turn is replaced, and only after the player confirms "Discard turn". It never goes through the D-0033 keep flow.
- A kept result uses a normal named slot.
- The saves keep the baseline reference, the goal state, the start tick and the horizon.
- A missing or changed baseline disables Another turn.
Reason: SPEC §13.6; saves are sacred (nothing the player kept is ever overwritten by a turn).
Affects: the wave 6 try-my-dish and challenge-editor tasks.
Owner review: no.

## D-0082 · 2026-10-11 · Phase 4 wave 6 · Scope calls for wave 6 (the writer's proposals, accepted)
Context: docs/reports/reviews/g4-wave-6/writer.md; docs/agent/g4-wave-6.tasks.js.txt header "LEAD PRE-LAUNCH 3".
Decision:
- **The shelf.**
  - Reading of SPEC §13.6 "capture an immutable baseline into a slot" and D09 "in an existing snapshot/save slot": the shelf is a write-once SaveStore record, `shelf-<kind>-<seq>-<writer>`.
    - It sits outside the ten named slots, so a baseline never takes a slot the player uses or can overwrite.
    - It is modelled on the checkpoint ring (D-0031): one atomic commit, a preflight, and a list that ignores shelf ids.
  - Kinds:
    - 'baseline': Try my dish starting points, at most 10 per device;
    - 'snapshot': snapshot bookmarks, at most 20 per device (CT §12.10 "bookmarks 50 text / 20 snapshot"; D02 "Snapshot bookmarks count against storage limits").
  - The Storage panel removes records with a confirmation that names what goes and what stays.
- **observation-notebook is a critical task.** It writes stored snapshots and two notebook kinds.
- **Transfer preview (SPEC §12.8, P4.8) is not built in v1.0.**
  - D02 §20 defines it over "a selected gate", and no gate structure exists before Phase 5 (enabledStructures BEAD, STONE, WALL).
  - It lands with the Phase 5 gates, and WORKLOG P4.8 says so.
- **The recipe card is the Starting recipe file** ('pixelmeba-recipe'). It carries the starting world, seed, modules, command schedule, versions and expected observations: everything §12.8 lists.
- **No separate prediction-note kind.**
  - Comparisons keep theirs (P2.4: CompareSetup, CompareResults, the journal stamp).
  - Try my dish turns keep theirs in the turn record.
- **Session state, not saved:** the region probes and the relationship map's 60/180/600 s windows. They reset on reload or Undo; nothing about them is saved or claimed after a reload.
Reason: SPEC §12.8, §13.6, §14.4; CT §12.10; D-0070 (notebook state is not world state); D-0072 (no new sim rules: gates are Phase 5).
Affects: every wave 6 task.
Owner review: yes. Two items:
- the shelf as the Try my dish "slot" (the alternative is one of the ten named slots, which the player can overwrite);
- the transfer-preview deferral to Phase 5.

## D-0083 · 2026-10-11 · P4.6 · Share as built
Context: wave 6a share (docs/reports/reviews/g4-wave-6a/share-build.md, saves-verify-share.md, wave-verify.md); D-0080; SPEC §14.4; UX §5.10, §5.11; D09 lines 140-160.
Decision:
- **The Picture** (src/render/picture.ts, from one published snapshot, D-0080):
  - a 1080 × 1080 PNG on a #14252D surround, with no text chunks;
  - the whole dish at 7 px per cell (896 px) at (92, 92); one sprite pixel per picture pixel; nearest-neighbour;
  - the question band at y 48–92;
  - the bottom band at y 996: the wordmark "Pixelmeba", "· title · Dish at m:ss" and the recipe identifier, right-aligned;
  - an optional species key in the four corners of the dish square, outside the round dish;
  - every item ≥ 48 px from the edge.
  - Hide labels leaves only the dish and the wordmark. Strip metadata drops the dish name and time but keeps the recipe identifier, which is not personal and is part of a picture (D09).
  - A picture saved from a story card always says "Dish at m:ss" and is never presented as the story's moment; `imageRefs` stay empty.
- **The Starting recipe file** ('pixelmeba-recipe', recipeFileVersion 1; src/persistence/recipeFile.ts) is also the P4.8 recipe card. It records:
  - the source, the resolved recipe and habitat;
  - the modules and the versions;
  - the expected observations text;
  - `initialStateHash`.
- **Strict build match** (owner item).
  - Export refuses a dish whose recorded content or rule versions differ from this build's.
  - Import requires equal versions, modules, recipe and habitat, and the realized start's stateHash equal to `initialStateHash`. stateHash covers contentHash, so a recipe file stops importing after any content update.
  - The alternative is the looser rule What if? "Again" uses (ignore contentHash when the recipe checksums match).
- **The Living dish** is the existing dish export, at a paused tick. Opening the Share sheet pauses the dish and blocks every dish key (integration fix). Close or Esc restores the prior speed.
- **Recipe IDs.**
  - The format is "R-G3 / revision 1 / seed 104729"; "rev" is also accepted.
  - Variants need their source's seed. Shipped recipes (phase ≤ buildPhase) take any canonical integer seed 0…4294967295.
  - Ids are case-sensitive; leading zeros are refused.
  - recipeIdStart realizes a variant through realizeVariant + keepFirst('start'). This is the same world as the What if? start (tested), on a second code path to keep in step.
- **Sharing.**
  - The Web Share API is used only when `canShare({files})` is true; otherwise the file downloads.
  - A cancelled or refused share is a quiet "Not shared. Nothing changed." in the sheet: never a toast, never a fallback download.
- **Import refusals.** Every refused import (save file or recipe file) shows exactly one toast, "Import failed: {exact reason}. Nothing changed." (UX §5.11; integration fix of a pre-existing double toast).
  - The reason's own closing "Nothing was loaded." or "Nothing was changed." is dropped from the toast only, so it is not said twice.
  - The global error toast skips 'importDish' and 'recipeImport'; importFile shows the one toast.
  - Refusals from keeping the open dish first (all slots full, a failed save) are not file refusals: they keep their own sheet and wording.
Reason: SPEC §14.4; UX §5.10-§5.11; D09 lines 140-160; D-0080; saves are sacred (a refused import never touches the open dish).
Affects: src/render/picture.ts, src/persistence/{recipeFile,recipeId}.ts, src/ui/{share,state}.ts, src/ui/panels/{ShareSheet,RecipeIdImport,StoryCard}.tsx, src/ui/views/{DishScreen,Play,Saves}.tsx, src/worker/{host,protocol,client}.ts, tests/persistence/share.test.ts, tests/render/picture.test.ts, tests/ui/share.test.ts, tests/e2e/share.spec.ts.
Owner review: yes. Should recipe files require an exact build match (strict, as built), or the looser What if? rule?

## D-0084 · 2026-10-11 · P4.7 · Try my dish as built
Context: wave 6a try-my-dish (docs/reports/reviews/g4-wave-6a/try-my-dish-build.md, try-my-dish-fix1.md, saves-verify-try-my-dish.md, wave-verify.md, wave-reverify1.md); D-0081, D-0082; SPEC §13.6; D09 lines 135-139.
Decision:
- **The shelf** (src/persistence/shelf.ts, D-0082).
  - Records: write-once 'shelf-<kind>-<seq>-<writer>' records, 10 baselines and 20 snapshots per device. They are hidden from the named slots and the slot list, and deleteSlot refuses them (fix round 1).
  - Order of writes: the preflight runs before the keep step, so a full shelf changes nothing. The baseline is written after the open dish is kept, so a refused keep leaves no orphan.
  - Opening: a shelf record opened through Saved dishes opens as a new branch, never as a bound slot.
  - Removal: until the 6b Storage panel exists, a full shelf cannot be emptied. P4.7 and the Storage panel ship in the same release (v1.0); a 6b gate check proves it.
- **Turns.**
  - Each turn is a new dish "{baseline name} (turn n)", at most 60 characters, with a branchWorldId. It starts paused at the baseline tick and holds exactly one TurnRecord in its notebook kind 'turns'.
  - The goal attempt (D-0078) starts at the turn's start tick, so each turn resets its progress.
  - The horizon is enforced in DishHost.pump and the 'step' case: the dish pauses there and offers Keep this result, Another turn and Finish. The card states the elapsed turn time and the starting point.
- **Kept.**
  - A turn is kept by any save to a named slot made at its horizon (Keep this result, or the Save sheet).
  - Another turn needs no Discard only while that slot still holds the turn exactly (D-0033 holdsExactly).
  - kept is cleared by Undo, a rollback, a changed command (fix round 1), and by any accepted change to what the slot file holds (integration fix): a stored journal note, a favorite op, a goal start or leave, a goal sentence dismissed, or a story card mark. A no-op (a card marked seen again, a refused op) keeps the slot.
  - As a safety net, a tryNext refused as unsaved clears kept in the worker's record, and the UI drops the card's "Kept in Slot n." line.
- **Another turn.** The player confirms "Discard this turn? It has not been saved." (D09 line 137). The new turn is autosaved at once, so Continue never reopens a discarded turn (fix round 1).
- **Finish.** It ends the turn's horizon; the turn runs on as an ordinary dish. Undo or a rollback during a turn ends its goal attempt ('undone' / 'failed'), and the turn's clock rewinds with the world.
- **Exports.** "Export without names or notes" also blanks a turn's prediction note and the baseline's name.
- **Keys.** The setup sheet blocks dish keys; Esc is its Cancel and restores the run state (UX §2).
Reason: SPEC §13.6; D09 lines 135-139; D-0081 (turns clone, never mutate; nothing kept is overwritten); saves are sacred.
Affects: src/persistence/{shelf,notebookTurns,store}.ts, src/worker/{tryDish,host,protocol,client,notebookWatch}.ts, src/ui/tryDish.ts, src/ui/panels/{TrySetup,TryHorizon,TryBadge}.tsx, tests/persistence/shelf.test.ts, tests/worker/try-dish-host.test.ts, tests/ui/try-dish.test.ts, tests/e2e/try-dish.spec.ts.
Owner review: no.

## D-0085 · 2026-10-11 · P4.8a · The relationship map and region probes as built
Context: wave 6a observation-map (docs/reports/reviews/g4-wave-6a/observation-map-build.md, wave-verify.md); D-0051, D-0061, D-0082; SPEC §12.8.
Decision:
- **The relationship map** is worker session state for a played dish, kept per whole dish second for 600 s. It is never saved, hashed or read by the sim, and it is empty after a reload.
  - Undo or a rollback to tick T drops every second at or after T. A record that restarts mid-second says "Recorded since m:ss".
  - What each arrow measures:
    - catches: count and the capture events' carbon;
    - infects, attaches, bursts, drains: counts, credited as P3.8 credits them;
    - converts: the carbon converted where producersNear names that species. Two named species each count, never split (D-0051);
    - eats: seconds seen, because IntakeSeen holds bits only.
  - Pool nodes carry the carbon that feeding removed (poolTotal before and after stage 6). It is never divided among eaters, and is labelled "net" for sugar, metabolite and CO2.
  - "resource exchange observed" needs arrows both ways in the window.
  - The intro text describes exactly these arrows (integration fix): which species caught, infected, attached to, burst or drained another, which turned one food into another, and which fed from a food pool. It never says one species "ate" another: an 'eats' arrow always ends at a food pool.
- **Region probes.**
  - Masks: at most 6, lettered A–F, integer cell centres clipped to the dish. A rectangle's corners are the drag's start and end cells; a circle has a whole-cell radius ≤ 64.
  - Population counts living organisms by the cell under them.
  - Boundary transfer is measured for sugar and broth, and for O2 and CO2 only in seconds whose every tick had the lid closed. Other fields show "not measured here".
  - Probes are session state: not saved, reset on reload, empty in a duplicate, never on a comparison copy.
  - **Lead ruling on D-0082's "reset on reload or Undo":** the measurements reset (seconds after the restored tick are dropped). The masks the player drew stay through Undo, and go on reload.
  - Drawing: one drag draws one region, and a tap draws nothing (a toast says to drag). There is no keyboard way to draw a region; the readings, Delete and the window choice are keyboard reachable. A keyboard draw can be added at the a11y pass.
- **Transfer preview** ships with the Phase 5 gate structures (D-0082); no button and no speculative code in v1.0.
- **Measured cost.**
  - The map's ledger pool totals run every tick on every played dish: about +0.3 ms per tick on the Garden (wave verifier: watcher ≈ 1.2 → 1.5 ms per tick).
  - This is recorded for P4.13 (perf pass 2) and EXPANSION_RESPONSE. The fix to try there is summing only after the map is first opened in a session (its windows then say "Recorded since m:ss"), or only active pools.
Reason: SPEC §12.8 ("observed transfers/attacks with type and measured total; unknown = absent"); D-0051; D-0072 (no new sim rules; gates are Phase 5); measure, don't guess.
Affects: src/worker/{relationshipMap,probes,relationships,host,protocol,client}.ts, src/ui/observe.ts, src/ui/panels/{RelationshipMap,ProbePanel,ProbeSession}.tsx, src/ui/strings/observe.ts, src/render/renderer.ts, tests/worker/{relationship-map,probes}.test.ts, tests/ui/observe.test.ts, tests/e2e/observe-tools.spec.ts.
Owner review: no.

## D-0086 · 2026-10-12 · P4.8b · Bookmarks, the specimen gallery and the Storage panel as built
Context: wave 6b observation-notebook (docs/reports/reviews/g4-wave-6b/observation-notebook-build.md, saves-verify-observation-notebook.md, wave-verify-1.md, integrate-*.md); SPEC §12.8 and the limits at SPEC line 79 (bookmarks 50, snapshot bookmarks 20, gallery 100); D-0070, D-0082, D-0084.
Decision:
- **Bookmarks** (notebook kind 'bookmarks'; src/persistence/notebookBookmarks.ts).
  - Limits: 50 per dish. A snapshot bookmark's snapshot is a shelf record of kind 'snapshot', 20 per device across all dishes (D02: "Snapshot bookmarks count against storage limits").
  - The snapshot is written to the shelf before the bookmark is added; a refused or failed write adds nothing.
  - Opening a snapshot bookmark keeps the open dish first (D-0033), then opens the snapshot as a new branch (branchWorldId, favorites only), as a checkpoint does. A missing or changed snapshot answers that it is gone, and the bookmark then reads "Text only — not replayable". A read never rewrites the notebook.
  - Deleting a bookmark keeps its snapshot, because other copies of the dish's save may still name it; the confirmation says so, and Storage removes snapshots.
  - The Bookmark sheet pauses the dish, blocks dish keys and restores the prior speed on Close or Esc.
  - A History row's Bookmark button makes a text-only bookmark; it records the event id only while the event ring still holds that event.
- **The specimen gallery** (kind 'gallery'; src/persistence/notebookGallery.ts).
  - 100 entries per dish. The picture is a 16 × 16-cell crop stored as sprite rows (≤ 200 sprites, one ground byte per cell), re-drawn at 14 px per cell through composePicture's additive crop option. Up to 4 summary lines come from the inspector answer on screen. The entry's time is the picture's; while the dish runs the summary can be a few ticks older.
  - It never spawns: the gallery code imports no command path, and its only action is Delete.
  - On load only the species are checked against the dish's recorded table, because Undo can legitimately rewind past an entry's tick or birth id. The worker checks birth id and tick when the entry is saved.
- **Both kinds are notebook state** (D-0070). They survive Undo and rollback; Duplicate and branches copy neither; every device save and export writes them. "Export without names or notes" replaces bookmark titles with "Bookmark at m:ss" and drops snapshot references; generated summaries stay. A bad record drops the notebook, never the world.
- **The Storage panel** (Saved dishes → Storage; src/worker/storage.ts).
  - Five groups with sizes; a named slot's size includes its previous copy.
  - Remove… exists only for checkpoints and shelf records and always asks once. The worker refuses named slots and Continue.
  - D-0084's release condition holds: full baseline and snapshot shelves are emptied through the panel's own Remove path, after which Try my dish and snapshot bookmarks work again (tests/worker/bookmarks-host.test.ts).
- **Integration** (docs/reports/reviews/g4-wave-6b/integrate-*.md):
  - challenge starting points have their own label and confirmation in Storage;
  - the shelf's "full" message is true for Try my dish and challenges and says where to remove one;
  - shelf writes are serialized per page, so two writes of one kind can never share a sequence number;
  - the dropped-notebook message names every kind a notebook holds;
  - one test fills every notebook kind to its limit and measures the record against the 1 MB cap;
  - g2, wave 5 and stage 1 saves load with every newer kind empty.
Reason: SPEC §12.8 ("bookmarks (timestamp + summary ± snapshot; text‑only labelled non‑replayable)", "specimen gallery (image + species + inspector summary; never spawns)"); SPEC limits; D-0070; D-0084; saves are sacred.
Affects: src/persistence/{notebookBookmarks,notebookGallery,notebook,store,shelf}.ts, src/worker/{storage,host,protocol,client}.ts, src/render/picture.ts, src/ui/{bookmarks,gallery,storage}.ts, src/ui/strings/notebookTools.ts, src/ui/views/{NotebookBookmarks,NotebookGallery,StoragePanel,Notebook,Saves}.tsx, src/ui/panels/{BookmarkSheet,Inspector,LabTray,MoreSheet,HistorySheet}.tsx, tests/persistence/bookmarks.test.ts, tests/worker/bookmarks-host.test.ts, tests/ui/{gallery,storage}.test.ts, tests/e2e/bookmarks-gallery.spec.ts.
Owner review: no (the per-device snapshot limit is listed in EXPANSION_RESPONSE §8 for visibility).

## D-0087 · 2026-10-12 · P4.8c · The custom challenge editor as built
Context: wave 6b challenge-editor (docs/reports/reviews/g4-wave-6b/challenge-editor-build.md, challenge-editor-fix1.md, challenge-editor-fix2.md, wave-verify-1.md, wave-reverify1.md, wave-reverify2.md); SPEC §13.5; D07 line 107; D09 line 134; D-0071, D-0078, D-0084.
Decision:
- **The record** (notebook kind 'challenges', ≤ 20 per dish; src/persistence/notebookChallenges.ts):
  - a name, the baseline {worldId, tick, checksum}, the allowed tool groups, an optional budget of 1–99 actions and a turn length of 60, 180 or 600 s (180 by default);
  - one objective of the five typed predicate types (never 'custom'), with finite numbers above 0;
  - a region is the dish or one quarter, and a quarter only for a field-range goal. There are no free masks until the engine measures them.
  - transferAcrossGate is unavailable without a gate ("This dish has no gate to measure.").
- **Tool groups:**
  - Add Life: inoculate, and lineage spawnSpecimen because it introduces organisms;
  - Feed: deposit, placeObject;
  - Habitat: paintSubstrate, paintShade, placeStructure, eraseStructure;
  - Sample, Clean water, Lid, Evolution.
  - Every other lineage op and every read-only request is free.
- **The budget.**
  - It counts accepted (accepted > 0) Add Life, Feed, Habitat, Sample Take and Clean water commands whose seq is at or after the turn's start sequence number, read from the world's own command log. So Undo gives an action back, and a placement that placed nothing is free.
  - Lid and Evolution settings are configuration: they never count, but a challenge can disallow them.
  - **Owner review.** D07 counts "successful placements and external loads … Configure and inspect are free". As built, Habitat edits are read as placements and Clean water as an external load (a logged material export). The narrowest reading, inoculate, deposit and placeObject only, is a one-line change in countsAgainstBudget plus the editor hint.
  - Known limit: the command log keeps 10,000 entries, so more than 10,000 free commands in one turn could let early counted entries fall off.
- **Baselines:** challenges saved at one paused moment share one shelf baseline (createdFor 'ch-n'), matched by state checksum.
- **Start.**
  - It keeps the open dish first (D-0033) and opens a Try my dish turn whose TurnRecord carries the challenge (startSeq, predicate).
  - The restrictions summary is shown before Start (D09 line 134).
  - The challenge's goal is its own ObjectiveDef (CHALLENGE_n, titled with the challenge name; "Shared challenge" in a stripped export), started with the turn.
  - Another turn keeps the limits with a fresh budget.
- **Restrictions are enforced by the host.**
  - A refused command is answered before applyNow (no seq, no state change), with "This challenge doesn't allow {tool}. The limit applies only inside this challenge." or "This challenge's {n} actions are used."
  - Comparison arms and the transient Continue copy are never restricted.
  - Leave challenge → "Open an unrestricted copy". Duplicate copies no turn and no challenges.
- **Finish leaves the challenge.**
  - A finished challenge turn is an ordinary dish with no limits (fix round 1).
  - Finish ends the running challenge goal as 'continuedFreely' / 'left' at the Finish tick, so nothing measured after the limits are lifted can be recorded as the challenge's completion. Try again on that goal is refused after Finish (fix round 2).
  - Undo during a challenge ends its goal attempt ('undone', D-0078), as it does for every goal (owner review: keeping a challenge goal through Undo needs a rewindable observer).
- **Export and import.**
  - The file is the dish at the baseline, with a notebook holding only that challenge; its checksum equals the baseline's.
  - Import offers "Start challenge: {name}". A dish that ran on is refused: "This dish has changed since the challenge was made. Import the challenge file again to start it."
Reason: SPEC §13.5 ("restrictions apply only inside that challenge"; "numeric targets"; "exported with stable IDs, region"); D07 line 107; D09 line 134; honest labels.
Affects: src/persistence/{notebookChallenges,notebookTurns,notebook}.ts, src/worker/{challenge,tryDish,host,protocol,client}.ts, src/ui/challenge.ts, src/ui/tryDish.ts, src/ui/strings/{challenge,tryDish}.ts, src/ui/panels/{ChallengeEditor,ChallengeStart,TryBadge,MoreSheet}.tsx, tests/worker/challenge-host.test.ts, tests/ui/challenge.test.ts, tests/persistence/challenge-export.test.ts, tests/e2e/challenge.spec.ts.
Owner review: yes (what the budget counts; whether a challenge goal should survive Undo).

## D-0088 · 2026-10-12 · P4.5 · Paired Garden variants as built
Context: wave 6b variants-paired (docs/reports/reviews/g4-wave-6b/variants-paired-build.md, wave-verify-2.md); SPEC §13.3–§13.4; CT §9.4; D09 line 115; D-0033, D-0078, D-0079.
Decision:
- **Starting a pair.** What if? offers "Compare with Garden (180 s)" for Garden ideas only, never R-G0.
  - It realizes both arms from content (R-G0 and the idea), keeps the open dish first (D-0033), and opens a new paused dish holding the idea's start, plus arm A (the Garden) and arm B (the idea).
  - Refusals use What if?'s own refusal (one toast), and a refusal keeps nothing.
- **The horizon is fixed at 1,800 ticks** (D09: "the existing 180-simulation-second paired comparison").
  - Any other horizon is refused. Stop ends both arms at the same tick, and the results say how long they ran.
  - No command reaches either arm, and the change cannot be cleared (D09: "no extra commands by default").
- **Sequential mode** runs when navigator.deviceMemory is a number ≤ 2; unknown memory runs paired.
  - A runs to the target and is let go (its world, observer and dish entry). Then B is realized from its stored start and runs to exactly A's tick.
  - Stop is refused while B runs.
  - The results are deep-equal to the paired run's (fixture-proven for R-G1, R-G2 and R-G3).
- **The results, in order:**
  - "{idea} vs Garden", the question and the change statement;
  - "this paired run", then "One paired run is an illustration, not a general rule.";
  - both counts (living organisms of each kind in A and B);
  - "Sugar left in the dish" (measured dissolved sugar, with the start totals);
  - then the existing measures, prediction note and conclusion picker.
- **Closing.**
  - Close opens the idea's dish at 0:00 (it never ran).
  - The comparison writes no named slot. Its completion autosave writes Continue with the dish the player is on, as an experiment's paired run does. Lead ruling at integration: the autosave is kept, and the close note no longer claims that saves are unchanged.
  - The two views read "A · Garden" and "B · {idea}" (integration).
- **Goals** on Garden variants come only through the goal catalog (sourceId); content/variants/* stays without objectiveId.
Reason: SPEC §13.3–§13.4 ("never unequal simulated time"; "sequentially if memory requires"; "this paired run"); D09 line 115; CT §9.4.
Affects: src/worker/{variantPair,host,protocol,client,comparison}.ts, src/ui/state.ts, src/ui/strings/variantPair.ts, src/ui/panels/{WhatIfSheet,WhatIfState,CompareSetup,CompareResults}.tsx, src/ui/views/{CompareScreen,CompareViewport}.tsx, tests/fixtures/variants-paired.test.ts, tests/worker/variants-paired-host.test.ts, tests/e2e/variants-paired.spec.ts.
Owner review: no.

## D-0089 · 2026-10-12 · P4.9 · Narration, sound polish and the reduced-motion audit as built
Context: wave 6b narration (docs/reports/reviews/g4-wave-6b/narration-build.md, wave-verify-2.md); UX §7.4, §8.3; D08; D-0064.
Decision:
- **Narration is a Settings toggle, off by default.** D08 allows a toggle or an on-request button; v1.0 has the toggle only.
- **What reaches SpeechSynthesis:**
  - only the 16 UX §8.3 phrase ids, never free text, numbers or names;
  - at the voice-bus volume, and nothing when muted or at 0;
  - never before the first gesture, and never while audio is held (hidden page, arcade pause);
  - one utterance at a time, with at most 2 waiting (more are dropped);
  - the same phrase not again within 10 s;
  - lang 'en' at rate 1, with a 5 s fallback when a device never reports the end of a phrase.
- **Each phrase has one evidence rule** over the UI's own state (src/ui/narration.ts). For example:
  - "Pause" only for the player's own Pause followed by a paused snapshot within 3 s; app pauses are never narrated.
  - "Eating sugar" only for a sugar-only eater with intake in the last second.
  - "A cell split" only for the inspected organism's own committed division or a followed family member's birth; each division is spoken at most once (integration).
  - "Add food" for an accepted deposit or food object, including the Lab's (integration).
  - The equipment phrases ("The feeder is empty", "The light is on", "The light is off") have no evidence until Phase 6 and are never spoken.
  - What a phrase says is always shown on screen too (UX §8.3).
- **Sound polish:** drop, division and discovery differ by source, start pitch and length. World cues are capped at 4 per second, and divisions coalesce for 5 s. Nothing was retuned.
- **Reduced motion** (the UX §7.4 table, filled with "As built" symbols):
  - the placement ring becomes a still ring for 1 s;
  - a committed birth draws a static split frame for 1 s;
  - the food-object stain is held still for its 6 s;
  - the CSS covers ::before and ::after, and the only keyframe animation is show-me-pulse.
Reason: UX §8.3 ("off by default"; "text always shown"); UX §7.4; D08; honest labels.
Affects: src/audio/{narration,cues,mix}.ts, src/ui/narration.ts, src/ui/strings/narration.ts, src/ui/panels/SoundSettings.tsx, src/ui/main.tsx, src/render/{features,renderer}.ts, src/ui/styles.css, docs/UX_SPEC.md §7.4, tests/audio/narration.test.ts, tests/ui/narration-evidence.test.ts, tests/render/reduced-motion.test.ts, tests/e2e/narration.spec.ts.
Owner review: no (listening to the phrases on a device is an owner item, EXPANSION_RESPONSE §8).

## D-0090 · 2026-10-12 · P4.8 · Wave 6b integration: the notebook cap, challenge starting points, two honest sentences
Context: wave 6b integration (docs/reports/reviews/g4-wave-6b/integrate-code-minors-6b.md items 5 and 7, and its notes for the lead); D-0070; D-0082; D-0087.
Decision:
- **Notebook cap 2 MiB (was 1 MiB).** `NOTEBOOK_MAX_BYTES` is our own pre-release number (wave 5a). With every kind at its limit in one real save file the notebook measured 1,021,268 UTF-16 units, 97.4 % of 1 MiB. With story texts at the validator's 200 units it measured 1,383,868 (the test) to 1,559,618 (a scratch measure widening more fields). Nothing checks the size at write time, and an over-cap notebook is dropped whole at the next load, so the cap must leave room above what the app can write. The tripwire test (tests/persistence/bookmarks.test.ts "every kind at its limit") keeps the wide case under 80 % of the cap. The story validator's free-form fields (`trait`, `module`, `rules`) bound depth, list length and text length, but not total bytes, so no finite cap covers every record the validator accepts. The guarantee is about what the app writes. A write-time size check stays a later option if a kind grows.
- **A challenge always has its own starting point.** challengeSave shares a shelf baseline only with records written for a challenge (`createdFor` 'ch-<n>'). It never reuses a Try my dish 'try-<n>' starting point with the same checksum, which the player can remove in Storage without seeing the challenge it backed. Challenges made at one paused moment still share their one 'ch-' record. Export and Start still read any baseline with the right checksum, because those are read-only uses.
- **Copy.** CompareSetup now says "Your own dish is never changed by it.", and ExperimentRun says "The experiment's dish is never changed by them." Both dropped "and your saves", which was false: completion autosaves Continue, and an experiment start may keep the open dish first (D-0033). SaveStore.remove's refusal now names challenge starting points as well.
Reason: saves are sacred (a notebook the app wrote must load again); honest labels; CLAUDE.md "Saves are sacred".
Affects: src/persistence/{notebook,store}.ts, src/worker/host.ts (challengeBaseline, challengeSave), src/ui/panels/CompareSetup.tsx, src/ui/views/ExperimentRun.tsx, docs/ARCHITECTURE.md §11.2, tests/persistence/{bookmarks,shelf}.test.ts, tests/worker/challenge-host.test.ts.
Owner review: no.
