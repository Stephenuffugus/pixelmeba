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
