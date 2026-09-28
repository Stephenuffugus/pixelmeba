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
