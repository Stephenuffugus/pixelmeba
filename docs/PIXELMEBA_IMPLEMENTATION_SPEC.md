# PIXELMEBA_IMPLEMENTATION_SPEC — the resolved rulebook

Version 1.0 · 2026‑09‑27 · Canonical. Supersedes the ten source documents wherever they differ.
Numbers live in `CONTENT_TABLES.md` (**CT**). Data layout, protocol and pipelines live in
`ARCHITECTURE.md` (**ARCH**). Screens and copy live in `UX_SPEC.md` (**UX**). Rulings are in
`CONFLICT_REGISTER.md`. Phase availability of each system is in `BUILD_DIRECTIVE.md`.

All quantities are **fictional game units**. Time means simulated seconds unless stated.
`dt = 0.10 s`. "Per second" rates are multiplied by `dt` each tick.

---

## 1. Product definition and scope

**Pixelmeba** is an offline, deterministic, ledgered pixel ecosystem sandbox. Players add
organisms, food, materials, structures and equipment to a circular dish, observe consequences,
inspect causes, follow lineages, and fork dishes to compare one change. Descendants inherit
quantitative traits, feeding policies and supplementary ability modules; variation arises only at
births; selection is emergent. There is **no** account, server, analytics, runtime AI, ad,
purchase, timer, streak, offline growth, hidden spawning, hidden rescue or scripted catastrophe.

Two presentation views over one world: **Explore** (Add Life, Feed, Look) and **Lab** (all
tools, numbers, charts). Switching views changes no state.

Release scope by tag is in the directive §0.2. Every world records a **manifest** (§14.1) naming
its enabled species, modules and systems; content outside the manifest is absent from that
world, never silently added.

---

## 2. World model

### 2.1 Grid and mask
- 128 × 128 cells. Playable mask: cells whose centers satisfy `(x−63.5)² + (y−63.5)² ≤ 60²`.
  Outside the mask is solid. No wraparound. Cell (x, y) center is (x + 0.5, y + 0.5) in world
  units; the world unit is one cell.
- Positions are continuous Float64 (x, y). An entity's cell is `(floor(x), floor(y))`.

### 2.2 Cells, substrates, attachment
Each cell has: `substrate ∈ {water, gel, sediment, stone, wall}`, `passable` (water/gel/sediment
true; stone/wall false), `shadeMask` (1.0 or painted 0.1), `moisture` (§4.8), `localWarmth`
(§4.7), optional furnishing/device slot (one per cell), optional finite food object, film carbon
and companion N, structures on edges (§2.4). Attachment surfaces: gel cells, sediment cells,
passable cells four‑adjacent to stone ("stone edge"), porous bead cells, attachment mesh cells.
Biofilm attaches on passable cells adjacent to stone, never inside stone.

Habitat paint replaces substrate properties without deleting life, deposits or fields; newly
unsuitable life responds through ordinary suitability rules.

### 2.3 Fields
Per‑cell nonnegative Float64 quantities (registry in CT §13): sugar, starch, oil, protein,
broth, detritus, metabolite, nutrient (free), oxygen, CO2, acid equivalent, base equivalent,
buffer, salt, three inhibitors (bacterial, fungal, photosynthetic), silicate (free), shell grit,
viral fields V01 and V02, activities E_STARCH, E_OIL, E_PROTEIN, S_GLOW, quencher, breaker,
RIVAL, and **companion bound‑nutrient fields** for sugar, starch, oil, protein, broth, detritus
and film. Light and warmth baselines are environmental settings, not inventories. Fields are
allocated only when their system is enabled in the manifest.

Dissolved: sugar, broth, metabolite, nutrient, oxygen, CO2, acid, base, buffer, salt,
inhibitors, silicate, viral fields, activities. Stationary deposits: starch, oil, protein,
detritus, grit, film. Deposits never diffuse; they are consumed, converted, sampled or decay as
specified.

### 2.4 Structures, devices, objects
- **Cell structures**: stone (paintable, blocks movement and transport), wall (impermeable,
  blocks all), porous bead (passes solutes, blocks swimmers, provides attachment).
- **Edge barriers** (Phase 5): S01 fine membrane, S02 small gate, S03 shutter, S04 one‑way
  channel. Occupy edges, not cells. Two barriers on one edge is invalid.
- **Furnishings/devices** (one per cell): S05 porous shelter, S06 attachment mesh, S07 nutrient
  basket, S08 adsorption resin, S09 heater, S10 cooler, S11 shade roof, S12 moisture wick,
  LAB01 dosing reservoir, LAB02 light lens.
- **Finite food objects**: M10 pellet, M11 wafer, E17 cache. Own explicit inventories.
- Removing a structure restores its previous substrate and never removes resources; removing a
  device exports its stored inventory as a logged export; removing a basket leaves its object.

### 2.5 Limits (CT §14)
6,000 live agents (fungal segments ≤ 2,000 within it), devices ≤ 256, finite food objects
≤ 128, edge barriers ≤ 512, regions ≤ 6, controllers ≤ 8, favorites ≤ 3, save slots 10 + autosave,
text bookmarks 50, snapshot bookmarks 20, gallery 100, import ≤ 25 MB. Reaching the agent cap
**blocks births and inoculations** (proposals retained, no cost), shows "Simulation capacity
reached", and marks population/evolution summaries for that interval as capacity‑limited. Never
kill organisms to free capacity.

---

## 3. Time and canonical update order

### 3.1 Tick
Fixed `dt = 0.10 s`; tick counter Uint32. Speeds: pause, single step, 1×, 2×, 4×. The renderer
never owns biological state. If real time falls behind, cap ticks per frame, keep the timestep,
and report effective speed. Paused edits execute as ordered transactions at the current tick
without advancing biology; derived fields and diagnostics recompute after each.

### 3.2 The ten stages (every tick, each fully resolved before the next)

| # | Stage | Work |
|---|-------|------|
| 1 | **Commands** | Apply due commands in (targetTick, seq) order: deposits, inoculations, samples, habitat/structure edits, device settings, schedule actions, controller firings, settings changes. Validate capacity and bounds. Record accepted/rejected amounts and external inputs/exports. Inoculations act this tick. |
| 2 | **Environment** | Advance light‑cycle phase; update local warmth and moisture; compute canopy from start‑of‑tick biomass; recompute lamp light; release pre‑existing cache inventory; transport dissolved/viral/activity fields and companions (barrier‑aware); directed‑channel transfers of pools and one Small organism; gas exchange; decays; resin adsorption; acid/base neutralization; derived pH, salinity, effective light. |
| 3 | **Conversion** | Release finite food (pellets, wafers, reservoirs); dissolve grit; catalyze enzyme reactions from pre‑reaction snapshots; commit products together. Products are available to feeding this tick. |
| 4 | **Sense and move** | Compute suitability; update saved metabolic mode (A04); mandatory state overrides (dead/held/resting/attached/linked/bonded/dispersing); decisions on the 0.5 s schedule; movement with edge tracing; jacket/size/stage speed factors; light seeking; rebuild spatial index. |
| 5 | **Contacts** | Predation claims and handling progress; trap capture; parasite attachment; host‑specific infection; then E12 link formation; then E16 bond formation. Deterministic priority `det(seed,'contact',tick,kind,birthId)`. No target claimed twice. |
| 6 | **Intake** | Reserve host/trap drains; compute ordinary requests (meal, photosynthesis, field feeding under ordered/weighted policy); allocate shared food proportionally; then limit by oxygen, free nutrient and silicate; commit once with all byproducts and bound pools; return unused. |
| 7 | **Maintenance** | Pay ordinary maintenance, movement, module surcharges/upkeep, link/bond/stage costs, decision overhead; advance age and timers; damage and healing; lysis before ordinary death; death recycles exact pools (body, meal, shell, jacket, trap reserve); release live dependents; remove links. |
| 8 | **State and structures** | Dormancy transitions; life‑stage transitions; signal/glow thresholds; release invalid links/anchors; reserve and pay optional actions in order (mandatory transitions → native optional actions by action ID → E01…E17 ascending); shared film/mineral construction with proportional headroom; traps; then F02 transport pass, E15 colony exchange, E16 partner transfer (disjoint edges, one pass each). |
| 9 | **Births** | Create or reuse immutable proposals; validate placements and costs; commit both daughters; split all owned pools; reconcile inherited stores; reset links/anchors; publish births. Newborns act next tick. |
| 10 | **Publish** | Events, ledgers, lineage and branch candidates, region histories, per‑second samples, capacity flags, render/inspector snapshots when due, state hash on demand, consistent‑tick save boundary. Controllers sample after this at 1 Hz and queue for the next tick. |

### 3.3 Cross‑stage invariants
- Every request reads a **snapshot** taken at the start of its stage; commits happen together at
  the end of the stage. No second allocation pass in one tick. Unused reservations are returned.
- Nothing produced in stage N is consumed by another actor in stage N except where stated
  (stage 3 products feed stage 6 the same tick; stage 9 releases appear next tick).
- Iteration order over entities is ascending storage index; over cells is row‑major; over
  content is sorted stable ID. No hash‑map iteration in the simulation.

### 3.4 Ledger
Track **carbon** in: living biomass, stored meals, film, sugar, starch, oil, protein, broth,
detritus, metabolite, CO2, viral units (0.01 C each), finite food objects, reservoirs, caches,
trap reserves, the sample slot; plus cumulative external inputs, cumulative exports, cumulative
net atmospheric exchange. Track **nutrient**: living N, free pool, bound in detritus/film/meals/
companions/objects/reservoirs/caches/traps/sample, inputs, exports. Track **mineral**: free
silicate, grit, shells, jackets, inputs, exports. Track **energy** flows for diagnostics only
(earned, spent by category, dissipated); energy is not conserved.

Invariant per tick: `Σ compartments = initial + inputs − exports ± exchange` within 1e‑5
relative per resource. Roundoff below 1e‑8 may be zeroed and logged. Never hide a negative pool
with a clamp; a negative pool is a bug that pauses the dish in diagnostics builds.

### 3.5 Precision
Float64 for all authoritative quantities. Reject NaN, ±Infinity and negatives at content import
and command validation. Transport flux from a cell may not exceed its content; scale a cell's
outbound fluxes together when necessary.

---

## 4. Environment and transport

### 4.1 Diffusion
Conservative four‑neighbor flux each tick. Coefficient per tick by the *source* cell's habitat:
water 0.10, gel 0.025, sediment 0.01; across a habitat boundary use the lower of the two; zero
through stone, wall and the outside. Biofilm halves dissolved transport across every edge of its
cell. Enzymes and RIVAL diffuse at **half** the habitat coefficient; V02 at half V01's. Edge
barriers multiply flux by their class factor (CT §5.3). Companion nutrient moves in the same
fraction as its carbon. Flux out of a cell is scaled so the total never exceeds the cell's
amount.

### 4.2 Gas exchange
Open lid (default): every exposed non‑wall cell moves oxygen toward 0.8 and CO2 toward 0.5 by
0.02 of the difference per tick; sediment cells use 0.1 × that. Closed lid: zero exchange. All
exchanged gas is ledgered. Light enters either lid state.

### 4.3 Chemistry index
- `pH_display = clamp(7 + (base − acid) / (1 + buffer), 2, 12)`; stored acid/base/buffer are not
  clamped. Equal acid and base equivalents neutralize each tick (remove `min(acid, base)` from
  both).
- Salinity index = salt quantity (may exceed 1; tolerances evaluate the actual value). Salt has
  no decay; removal is by sampling or dilution.
- Inhibitors lose 0.2 % of their amount per **tick**. Each targets a category (CT §3.4). Effective
  exposure for an organism = Σ targeting inhibitor amounts (+ 0.25 × RIVAL for RIVAL targets),
  then × 0.5 once if the cell holds film. Growth factor `1 / (1 + exposure)`; health damage
  `8 × exposure` per second.
- Acid emitters: Y01 adds 0.20 acid equivalent per consumed carbon; B11 adds 0.40.

### 4.4 Light
`sourceLight = clamp(habitatBaseline × cycleFactor + Σ lampContributions, 0, 1)`;
`effectiveLight = clamp(sourceLight × paintedShade × roofShade × canopyFactor, 0, 1)`.
Painted shade is 0.1 (or 1.0). Roof shade (S11) is 0.25. Canopy §4.10. Lamps §11.2. With no
lamps and no cycle this reduces to D01's `baseline × shade`. Signal glow contributes **zero**
light. The inspector shows every factor.

### 4.5 Lid and warmth setting
Lid open/closed is a world setting. Warmth is a uniform baseline 0–1 per dish until local
warmth is enabled (§4.7).

### 4.6 Day and night (Phase 5)
World setting Fixed Light or Cycle. Cycle period 240 s: day 90 s (factor 1.0), dusk 30 s
(linear 1.0→0.05), night 90 s (0.05), dawn 30 s (0.05→1.0). Phase is saved; restoring a snapshot
restores phase. Manual light changes are commands.

### 4.7 Local warmth (Phase 5)
Per cell, 0–1 index. Each tick: relax 1 % toward ambient baseline (default 0.50); diffuse with
coefficient 0.05 across passable edges; add device input ±0.01 per second (S09/S10; one device
per cell, overlapping neighbors add). Clamp stored and displayed value to 0–1 (an index, not an
inventory). Heat creates no material.

### 4.8 Moisture (Phase 5)
Per cell suitability index. Water 1.0 fixed. Gel and sediment start 0.8. With Drying enabled,
uncovered gel/sediment cells lose 0.001/s down to 0.1. Wetting brush sets 0.9 without diluting
anything. S11 roof stops local drying. S12 wick relaxes adjacent gel/sediment toward 0.8 at
0.01/s while the wick touches water. Drying never concentrates chemicals (quantities are per
fixed cell; say so in the guide). Moisture response: 1 within the species range, linear shoulder
0.2 below the minimum.

### 4.9 Edge barriers, transport classes, channels, resin (Phase 5)
Transport classes: Dissolved, Activity, Viral, Small mobile, Medium, Large, Fixed (assignments
CT §1, permission matrix CT §5.3). Organism paths check **every crossed edge**. A host and
attached parasite move as one unit in the host's class. Free life cannot attach inside a barrier
edge. Directed channel S04: per second requests 2 % of every eligible dissolved/viral pool of
the source cell into the adjacent water destination (×dt), all from one snapshot, summed and
capped per pool, companions in the same fraction; plus one eligible free Small organism per
second if present (deterministic choice, exact state retained, no extra actions). No multi‑hop in
one tick. Deposits, attached organisms, film and food objects are never advected. Resin S08
removes selected inhibitor/RIVAL activity from its own cell at ≤ 0.05 units/s, proportionally,
until 5 total units are bound; saturated resin is inert until replaced; removal exports bound
activity. Gate preview tracers are cosmetic and run only while paused.

### 4.10 Canopy (Phase 5)
`canopyFactor = 1 / (1 + Σ local A05 biomass / 10)` over the cell and its four neighbors,
combining colonies by summed biomass. All photosynthesizers there, including A05, receive it.

---

## 5. Conversion stage

### 5.1 Finite food objects
Pellet (M10): 10 sugar C + 1 bound N; releases 0.02 C/s with proportional N into its own cell.
Wafer (M11): 6 starch C + 4 protein C + 1 N; releases 0.012 starch and 0.008 protein C/s, each
carrying 0.10 N per C. Reservoir (LAB01) §11.1. Cache (E17) §7.19. Release never exceeds
inventory; the last transfer moves the exact remainder. Empty objects become a fading
non‑blocking stain. Sampling moves remaining inventory; destruction releases it into deposits.
Creation is an external ledger input.

### 5.2 Grit dissolution
Shell grit (M12 or released shells/jackets) dissolves into free silicate at `0.01 × remaining`
per second. Grit is not food.

### 5.3 Enzymes
Three activities. Per enzyme type and cell per tick: `converted = min(substrate, 0.10 ×
effectiveActivity × dt)` where `effectiveActivity = activity / (1 + breaker)`. Remove exactly that
carbon and its proportional bound N from the substrate; add both to the product (starch→sugar,
oil→metabolite, protein→broth). All conversions read pre‑reaction pools; outputs cannot chain
through another enzyme this tick. Enzymes diffuse at half coefficient, lose 2 %/s; breaker
diffuses normally, loses 1 %/s.

**Producers** (native B06/F02 → E_STARCH, B07 → E_OIL, B08 → E_PROTEIN; modules E01, E09) emit
0.02 activity/s into their cell while E > 35, a compatible deposited substrate exists in their
cell or a four‑neighbor cell, local activity < 1.0, and the organism is not dormant. Cost
0.40 E/s, paid in stage 8 after maintenance (an organism cannot spend energy it no longer has).
Enzymes do not cross walls or convert living organisms.

---

## 6. Organisms

### 6.1 Entity state
`entityId` (stable while alive; the retained daughter keeps it), `birthId` (unique per birth
event; both daughters get new ones), `speciesId` (ancestor template), `genomeRef`, position,
heading (four authored headings for elongated sprites), `B` biomass (structural carbon), `N`
bound nutrient, `E` energy 0–cap, `H` health 0–100, `age`, `mealC`, `mealN`, `boundMineral`
(shell), `jacketMineral`, `lifeState` (Active/Preparing/Resting/Waking; Juvenile/Settling/Adult;
Dispersing/Settling/Stranded), state timers and lockouts, `metabolicMode` (A04), `infection`
(virusId, timer), `hostRef`/`parasiteRef`, `handlingTarget`/`handlingProgress`, `attackCooldown`,
`trapReserveC/N`, `trapTarget`, `trapCooldown`, fungal links (≤ 4), adhesion links (≤ 2),
`partnerRef`, `anchorState`, decision timer, last desired direction, last intake tick, movement
distance this tick, `divisionOrdinal`, pending proposal ref, capacity‑blocked flag, damage
contributions (last 10 s, by source).

New external inoculations start with `B = B0'`, `N = 0.10 B0'`, `E = 50`, `H = 100`, `age = 0`,
empty meal; A02/P05 also `boundMineral = 0.10 B0'`. Founder material is an external input.

### 6.2 Phenotype pipeline
`deriveProfile(template, genome, lifeState, temporaryState)` is one shared pure function used by
the simulation, inspector, previews and validator. Apply factors in this order:
**ancestor template → body size (Phase 7) → quantitative loci → modules → life stage → colony
role → temporary state**. Output: `B0', Q', M', speed', sensingRadius', minDivisionInterval',
divisionCost', energyCap', preferred ranges', dormancyTriggerSeconds', feeding list and policy,
ability set, transport class, contact radius factor`. Inherited maintenance multipliers apply
**once** to `(M_native + Σ module surcharges)`. Movement, construction and secretion costs are
separate. Cache profiles per (genomeId, lifeState key).

### 6.3 Suitability
`resp(x, [a,b], w)` = 1 inside; `1 − (a−x)/w` below; `1 − (x−b)/w` above; clamped ≥ 0. Shoulders:
pH 1.0, warmth 0.15, salinity 0.20, moisture 0.2 (below only).
`suitability = min(resp_pH, resp_warmth, resp_salinity) × habitatCompatible(0|1) × 1/(1 +
exposure) × resp_moisture × special`. Special: B03 Dusk × `clamp(1 − O2/0.40, 0, 1)`. Oxygen
otherwise limits aerobic intake directly (§6.5), never movement. "Stressed" is the explained
state `suitability < threshold` for ≥ 3 s, cleared after 3 s recovered.

### 6.4 Movement (stage 4)
Applies to self‑propelled, unattached, unheld, non‑resting, non‑linked, non‑bonded entities with
E ≥ 1 (below 1, ancestral controller with no overhead until E ≥ 2).

- **Decision** every 0.5 s (5 ticks; timer initialized fresh at birth from `det(seed,'decide',
  birthId)` offset 0–4 to avoid lockstep). Candidate cells: all passable, habitat‑compatible
  cells within Chebyshev distance `sensingRadius'` of the current cell that are reachable by a
  straight edge‑checked trace. Score `= 0.5·F + 0.4·S − 0.1·C` (strategy variants §7.12) where
  `F` = best compatible food or prey score `amount/(amount+0.10)` (producers B06–B08 use
  `max(usableFood, 0.5 × convertibleSubstrate)` while E > 35; E08 carriers use `max(prey,
  detritus)`; E07 uses effective light), `S` = suitability at the cell, `C = min(1, ΣB/B0 / 8)`.
  Highest score wins; ties broken by `det(seed,'tiebreak',tick,birthId)`. If all scores are
  equal (|Δ| < 1e‑9), wander in a direction `det(seed,'wander',floor(tick/10),birthId) × 2π`
  held for 1 s.
- **Predators** additionally acquire the nearest compatible prey within `sensingRadius'` as a
  target when hunting conditions hold (§7.3); pursuit moves toward the target's current position
  each tick; invalid targets cancel immediately.
- **Movement** each tick: advance `speed' × dt` toward the desired point; trace crossed cells
  and edges; stop before a blocked cell/edge (no tunneling). Accumulate distance for the
  movement cost. Cosmetic wobble never crosses cell boundaries and is not simulated.
- P04 Siltworm may cross up to two consecutive water cells from sediment; otherwise turns back.
- Microbes share cells. Soft capacity 8 biomass‑equivalents (`Σ B_i / B0_i` over residents). Over
  capacity: births blocked, intake requests halved; nothing is deleted.

### 6.5 Intake and shared allocation (stage 6)
For each eligible entity (Active; juveniles at 0.75 Q'; adults 1.15 Q' for E13; not Preparing/
Resting/Waking/Dispersing/Settling; F03 skips broth feeding while draining):
`budget = Q' × suitability × dt × (overCapacity ? 0.5 : 1)`.

**Route selection** (one route per tick):
1. Held meal > 0 ⇒ **meal route**: request `min(mealC, budget)` from the meal. E08 carriers with
   an empty meal may use the detritus route; a capture this tick cancels a detritus request.
2. Photosynthetic mode ⇒ **photosynthesis route**: request CO2 `= budget × lightResponse ×
   avail(CO2)` where `lightResponse` is linear in effective light (A03: `min(1, light/0.30)`;
   E06: `min(1, light/0.35)` with ceiling × 0.70). A04 uses exactly one mode per tick.
3. Otherwise **field route** over compatible locally present foods:
   - `ordered`: `rem = budget`; for each food in order: `r_f = min(rem × avail(P_f), P_f)`,
     `rem −= r_f`.
   - `weighted`: `W = Σ w_f` over compatible foods present; if `W = 0` ⇒ no request (reason
     `FOOD_EXCLUDED_BY_PREFERENCE`); else `r_f = budget × w_f × avail(P_f)`; redistribute the
     unrequested remainder **once** among present foods ∝ `w_f`, capped by `P_f`.
   `avail(a) = a / (a + 0.10)`.

**Allocation**: per cell and pool, if `Σ requests > pool` scale all requests by `pool / Σ`.
Then per entity compute `C = Σ allocated`, `boundN = Σ allocated_f × companionN_f / P_f`,
`needN = max(0, 0.05·C − boundN)`, `needO2 = aerobic ? 0.30·C : 0`, `needSi = shellBuilder ?
0.10 × 0.50·C : 0` (bound at 0.10 per new biomass). Per cell allocate free nutrient, oxygen and
silicate proportionally to needs; each entity's limiting fraction `L = min(1, gotN/needN,
gotO2/needO2, gotSi/needSi)` (1 where need is 0). Final consumption `= allocated × L`. Unused
food stays in the pool and is **not** re‑offered this tick. Commit once.

**Conversions per consumed carbon C** (CT §12):
- Ordinary aerobic: `B += 0.50C`, cell `CO2 += 0.30C`, `metabolite += 0.20C`, `O2 −= 0.30C`,
  `N += 0.05C` (bound first, then free; surplus bound N → free pool at commit), `E += 30C`.
- Anaerobic (B03, Y01): same carbon split, no O2, `E += 18C`. Acid emission per §4.3.
- Photosynthesis (C = CO2 consumed): `B += 0.50C`, cell `sugar += 0.50C`, `O2 += 0.50C`,
  `N += 0.05C` from free pool, `E += 30C`.
- Meal/detritus/prey: bound N transfers proportionally and credits the 0.05C need first.
- Host drains (X01, X02, F03): 50 % to parasite/fungus biomass, 30 % CO2, 20 % metabolite,
  `E += 30C`; no ambient O2 debit; unused bound N returns to the cell.
- Shell builders bind 0.10 mineral per biomass gained.
Energy is capped at `energyCap'`; excess dissipates with a ledger event.

### 6.6 Meals
A kill transfers the prey's entire B and N into the predator's meal, capped at `2 × B0'` carbon;
overflow becomes detritus at the kill location. Any meal the prey held becomes detritus
separately. Prey energy is discarded. Meals do not decay; on predator death they become
detritus. A predator with `meal ≥ 0.5 B0'` does not hunt.

### 6.7 Maintenance, damage, healing (stage 7)
`E −= (M' + Σ activeModuleSurcharge + Σ upkeep + linkCosts + bondCost + stageUpkeep +
decisionOverhead) × dt`; `E −= 0.20 × distanceMoved × motilityFactor` (E07 replaces with its
per‑second cost, never both). Then: `E ≤ 0 ⇒ E = 0, H −= 4·dt`; `suitability < 0.10 ⇒ H −= 2·dt`;
`H −= 8 × exposure × dt`; if `E > 20 ∧ suitability > 0.5 ∧ ¬infected ∧ Active ⇒ H += 1·dt` (≤ 100).
Resting: maintenance 0.01 E/s replaces ordinary; stress and inhibitor damage × 0.10; starvation
damage unchanged. Age advances in every state. Record damage by source for attribution.

### 6.8 Death and recycling
Death when `H ≤ 0` or `age ≥ maxAge`, or by predation, lysis, sampling. Once: convert remaining
`B, N` to detritus C and bound N in the cell; meal → detritus; shell and jacket → grit; trap
reserve → detritus and release held target alive; release attached parasites alive; remove
incident links/bonds; discard pending proposal; film already in the world remains. An entity
eaten this tick cannot also produce a corpse. Apply lysis before ordinary death when both are
due. Cause attribution §12.2.

### 6.9 Reproduction and immutable birth proposals (stage 9)
Eligibility: `B ≥ 2 B0'`, `E ≥ 60·s`, `H ≥ 50`, `age ≥ minDivisionInterval'`, Active (not
Resting/Preparing/Waking/Juvenile/Dispersing/Settling), not V‑infected, not held, global cap
not reached.

1. **Proposal**: if none pending, create `{parentBirthId, divisionOrdinal, daughterGenomes[2],
   intendedStages[2], rulesVersions}` drawing every mutation stream once (§8.3). Save it. Parent
   behavior is unchanged while it waits.
2. **Placement**: derive each daughter's body/transport requirements from the proposal. The
   retained daughter stays in the parent's cell; the new daughter needs a compatible, passable
   (attached species: attachable) neighboring cell (parent cell or 8‑neighborhood) under soft
   capacity; candidates ordered by (crowding asc, fixed neighbor index). F01/F02/F04 rank by
   usable food then suitability. F04's daughter starts Resting. If placement fails: keep the
   proposal, no cost, reason `DIV_BLOCK_PLACEMENT`/`DIV_BLOCK_CROWDING`/`DIV_BLOCK_CAPACITY`.
3. **Commit**: `E −= divisionCost'` (20 × (0.5 + g_div) × size/form/role factors); split `B`,
   `N`, meal, energy, shell mineral equally; both keep `H`; both ages reset; both get new
   `birthId`s and are recorded as children of the pre‑division individual (the retained entity's
   `entityId` persists but is not an identity). Apply daughter genomes and reconcile (§9.19).
   Publish together. No daughter acts until the next tick.
4. A settings change affects future proposals only. Parent death discards the proposal without
   events. Save/reload never rerolls a proposal.

Viruses reproduce by lysis (§7.5). Fungal branching and animal offspring use the same budget.

---

## 7. Special systems

### 7.1 Biofilm (B02 native; E10 module)
B02 attaches on gel, sediment, stone edge, bead or mesh. After 10 s attached with `E > 40` it
transfers 0.05 biomass/s (with proportional N) into the cell's film, stopping at 0.50 film C per
cell or when `B = B0'`. E10 builders (§9.10) share the same pool with proportional headroom.
Film: halves bacterial‑inhibitor exposure (once, not per producer) and halves dissolved
transport across the cell's edges; edible as detritus by B04, F01 (and any "digests film"
flag); loses 0.1 % of C and N per second into detritus. Film has no owner and is not an
organism. V02 infects B02 only where film ≥ 0.10.

### 7.2 Fungal branching (F01–F04)
Attached; reproduction places the daughter segment on a free compatible neighboring cell chosen
by usable food then suitability; parent–daughter visual link. F01 threads are local feeders
(visual links only). F02 creates **explicit undirected transport links** (§7.7). F03 builds traps
(§7.17). F04's daughter starts Resting (§7.6) and is Small class while resting. Segments count
against the 6,000 cap and the 2,000 fungal subcap. Population reports connected components and
segment count separately. P08 eats individual segments only.

### 7.3 Predation and handling
Hunting conditions: compatible prey list (ancestor‑ID based, CT §3), contact (centers within
0.5 cells; Phase 7: `0.25 × (s_pred + s_prey)`), `attackCooldown` ready, `E < 80`, `meal <
0.5 B0'`, valid prey. One successful attack kills one prey; competing attackers resolve by
`det(seed,'contact',tick,'attack',birthId)`; only the winner gets the meal and starts its
cooldown. **Handling** (P10): capture requires continuous contact for 1 s (P05 target: 4 s;
E11 jacket: `1 + 3c` s with `c` sampled at attempt start); progress resets when contact breaks;
target is not immobilized; cooldown starts only after a successful capture. **Radius capture**
(P06): captures compatible prey within 1 cell without pursuit. Predators at meal capacity stop
hunting.

### 7.4 Parasites (X01, X02)
Free parasite cannot feed; pays maintenance; seeks a host within sensing radius; attaches on
contact, one parasite per host, only to listed host ancestors (X01 → A01; X02 → active F02/F04
segments, never resting daughters). Drain (X01 0.02 C/s; X02 0.015 C/s) with proportional N,
capped by host contents; conversion per §6.5. Host below `0.25 × B0'` dies normally. Attached
movement follows the host at no cost. Host division leaves the parasite on the retained daughter
(deterministic). Host death or rest releases the parasite alive locally. A dividing parasite
releases its offspring free. X02 never crosses a network link.

### 7.5 Viruses (V01, V02)
Viral fields in units (0.01 C each). Each susceptible host per tick: `p = 1 − exp(−0.05 × units ×
dt)`, draw `det(seed,'infect',tick,birthId)`; infection consumes one whole unit (transfers 0.01 C
to the host); fewer than one unit cannot infect; one infection per host; infected hosts feed but
cannot divide or heal. After 20 s, lysis converts up to 40 % of host biomass into whole units
(0.01 C each); remainder and all bound N become detritus; host disappears. Unattached units
decay 1 %/s into detritus carbon (no N). No hosts ⇒ no replication. V01 host B01 only; V02 host
B02 only and only where film ≥ 0.10; V02 diffuses at half V01's coefficient. Disjoint pools.
Infection glyphs show on inspected hosts or with the infection overlay.

### 7.6 Dormancy state machine (native B12, F04, P08; module E03)
| State | Entry / behavior | Exit |
|---|---|---|
| Active | Ordinary rules. Dormancy begins only after a trigger persists and `E ≥ 15`. | Trigger: no usable intake for `20 s × (1.5 − g_dorm)`, or moisture suitability < 0.20 for 10 s. |
| Preparing | 5 s; no feeding, movement, reproduction, secretion; spend 10 E once; ordinary stress. | Enter Resting; death cancels; no refund. |
| Resting | No intake, photosynthesis, movement, secretion, division, links or anchors. Maintenance 0.01 E/s; environmental and inhibitor damage × 0.10; `E = 0` starvation still 4 H/s. Remains prey. | Suitable moisture, environment and usable food persist 10 s **and** `E ≥ 5`. |
| Waking | 5 s; spend 5 E once; no feeding or reproduction; ordinary damage. | Active; 30 s lockout before the next dormancy attempt. |
Age continues in every state; no energy gift; a resting organism without waking energy
eventually dies. Sporeveil's daughter begins Resting with its allocated post‑cost half.

### 7.7 Fungal transport links (F02)
Links form between parent and daughter F02 segments on four‑neighbor cells at branching (and on
E14 settlement when adjacent). Only living F02 links carry resources; removing a segment breaks
its links; visually crossing threads do not connect. One simultaneous pass in stage 8 after
optional construction and before births, reading one snapshot: donor `B > B0'` may send toward
an adjacent linked receiver with `B < 1.5 B0'` and at least `0.01 B0'` less biomass; edge request
`min(0.02 × dt, half the difference)`; cap total outgoing to `B − B0'` proportionally; cap total
incoming to receiver headroom below `1.5 B0'`; transfer proportional N; no energy. Received
surplus relays only on later ticks. Degree ≤ 4. Adhesion links are not fungal links.

### 7.8 Signals and glow (B09 native; E02 module)
S_GLOW emitted at 0.02/s while `E > 35`, cost 0.20 E/s; diffuses normally; decays 1 %/s; emission
stops at local 1.0 (existing excess is kept). Quencher: sensed `= signal / (1 + quencher)`,
decays 1 %/s. Glow turns **on** after sensed ≥ 0.30 for 5 continuous seconds; **off** after
sensed ≤ 0.15 for 5 s or `E < 15`; glow costs 0.30 E/s; cosmetic; zero light. Inspector shows
"Neighbors detected" with the value.

### 7.9 Rivalry (B13)
RIVAL secreted at 0.02/s when an active B01, B10 or B11 lies within two cells, `E > 50`, local
RIVAL < 1.0; cost 0.60 E/s; diffuses at half; decays 2 %/s. Targets add `0.25 × RIVAL` to
inhibitor exposure (§4.3). No direct bonus to B13. M08 extract is the same field.

### 7.10 Mixotrophy (A04)
Saved `metabolicMode ∈ {Photo, Sugar}`, initialized from `light ≥ 0.35`; switch to Photo at
`light ≥ 0.35`, to Sugar at `light ≤ 0.25`, hold between; exactly one route per tick; Photo uses
photosynthesis conversion, Sugar ordinary aerobic. No broth compatibility. E06 applies in Photo
mode only.

### 7.11 Shells, jackets, grit
A02 and P05 bind 0.10 silicate per unit of new biomass (limits growth when silicate is short);
inoculations include `0.10 B0'` bound mineral as an input; division splits it; death/predation
releases all bound mineral as grit (no defensive bonus). E11 jacket §9.11. Shell mineral stays
with the organism across modes, samples and division.

### 7.12 Behavior strategies (Phase 7)
Every cellular genome stores a `strategy`; it acts only when self‑propelling. Scores (F food/prey,
S suitability, C crowding, U = 1 beside usable substrate/mesh, T = local metabolite score):
Ancestral (template controller); Resource follower `0.70F + 0.25S − 0.05C`; Space finder
`0.35F + 0.35S − 0.30C`; Shelter keeper `0.35F + 0.35S + 0.25U − 0.05C`; Night forager
(ancestral directions while active; quiet phase suppresses voluntary movement and ordinary
feeding above the light threshold; eligible only to B01, B04, B05, B06, B09, P02, P07); Trail
follower `0.35F + 0.30S + 0.30T − 0.05C`. Night thresholds: active below `nightLightThreshold/100`
(locus 10–40, default 25), quiet above that + 0.10, each sustained 5 s; `E < 20` forces activity
until `E > 35`. Each active non‑Ancestral strategy pays 0.02 E/s. Memory: last intake time,
strategy state, desired direction, timers; never inherited; newborns start fresh. Strategy
mutation chooses uniformly among legal alternatives.

### 7.13 Life stages (E13 Settler, E14 Dispersing offspring; Phase 7) — see §9.13–9.14.

### 7.14 Body size and form (Phase 7)
Eligible: B01, B04, B05, B06, B09, B10, B11, P01, P02, P07. `s = 0.75 + 0.005 × sizeLocus`
(0.75–1.25). `B0' = B0·s`; `Q' ×= s^0.75`; `M' ×= s`; `speed' /= √s`; `energyCap = 100·s (+40
with E05)`; min division energy `60·s`; division cost `20·s × (0.5+g_div) × form × role`; meal
cap `2 B0'`; division threshold `2 B0'`; contact `0.25 (s₁ + s₂)`. Crowding uses **ancestral**
B0. Transport class changes at birth: Small → Medium at `s ≥ 1.20`; Medium → Small at `s ≤
0.80`, → Large at `≥ 1.20`; Large → Medium at `≤ 0.80`; fixed/special stages keep their class.
Body form: Baseline or Streamlined (speed × 1.10, division energy cost × 1.10, heading held
≥ 1.0 s before voluntary turns; blocked routes stop immediately). Size mutation changes the
target, never present carbon; a larger daughter must grow into its `B0'`.

### 7.15 Adhesion, colonies, exchange, roles — see §9.12, §9.15 and CT §7.
### 7.16 Partner bonds — see §9.16.

### 7.17 Traps (F03)
An active F03 with `E ≥ 50` and `B ≥ 1.3 B0'` builds one trap by moving 0.20 C (with proportional
N) into a trap reserve and spending 8 E; cannot arm if it would fall below `B0'`. One P04 entering
its cell is held 8 s (may feed, cannot move); drain 0.03 C/s with the host‑drain conversion; at 8 s
release and set a 30 s cooldown; target below `0.25 B0'` dies normally. Reserve persists between
captures; removing/killing the fungus releases reserve to detritus and the target alive. While
draining, F03 skips broth feeding. On division the retained parent keeps reserve and target.

### 7.18 Native feature switches (Phase 7)
Whitelist: B06 starch secretion; B07 oil secretion; B08 protein secretion; B09 signal+glow (one
coupled feature); B13 rivalry secretion; self‑propulsion in B01, B04, B05, P02, P07. Founders
have all enabled. Disabling stops the action and its explicit cost; no rebate; fields already
in the world remain; loss of self‑propulsion keeps habitat compatibility and feeding. Disabled
features remain in the genome and may be re‑enabled by a later toggle. Feeding pathways,
photosynthesis, infection susceptibility, host lists, essential attachment and division cannot
be lost.

### 7.19 Food caches (E17; Phase 7)
One cache object per cell, capacity 4 C, shared by all eligible depositors, counts against the
128 object budget. Deposit when active, `E > 40`, meal > `1.50 B0'`: up to `0.02 × B0' × dt` C
from the meal leaving ≥ `1.00 B0'`, with proportional N; lowest‑birthId depositor pays 2 E
creation once; each pays 0.10 E per C deposited; simultaneous deposits share headroom
proportionally. From the next tick, release ≤ 0.02 C/s as local detritus with proportional N.
Empty caches disappear. Sampling moves inventory; destruction releases once.

---

## 8. Genome and evolution

### 8.1 Genome contract
```
Genome {
  genomeId            // immutable, content-addressed from the canonical fields below
  ancestorTemplateId  // species ID; never changes in a lineage
  loci: Uint8[8]      // 0..100 (CT §6), founders 50
  feedingPolicy: 'ordered' | 'weighted'
  foodWeights?: number[]     // over supported pathways in template order; Σ = 1
  modules: ModuleId[]        // ≤ 3, sorted ascending
  dev: { sizeLocus: 50, bodyForm: 'baseline', strategy: 'ancestral',
         nightLightThreshold: 25, colonyRole: 'generalist', nativeFeatureBits }
  versions: { evolutionRules, moduleRegistry, phenotypeMapping }
}
```
Genomes are deduplicated in a table with derived‑profile cache. Retain every living genome and
any referenced by a specimen, pinned branch or retained event. Never modify a shared template
when an offspring varies. If a template lacks a native value for a locus, the locus is
**inactive** (excluded from mutation) until a module makes it meaningful.

### 8.2 Loci and phenotype mapping (CT §6)
`g = locus / 100`. Motility `speed × (0.5+g)` (native nonzero only) and movement cost factor
`(0.5+g)`; Feeding `Q × (0.75+0.5g)`, maintenance `× (0.75+0.5g)`; Sensing `round(r × (0.5+g))`
clamped 1–6, maintenance `× (0.75+0.5g)`, active only if native `r ∈ [1,6]`; Division interval
`× (1.5−g)`, cost `× (0.5+g)`; pH shift `2(g−0.5)` (center clamped so the interval stays in
2–12); salinity shift `0.4(g−0.5)` within 0–1; warmth shift `0.4(g−0.5)` within 0–1; dormancy
trigger `× (1.5−g)` (active only with dormancy). Interval widths are preserved. Multiplicative
maintenance modifiers combine once. Secretion, trap and shell construction costs are never
scaled as maintenance.

### 8.3 Inheritance and mutation
Asexual only. Per daughter, at proposal creation, from separate stateless streams keyed by
`(worldSeed, streamId, birthEventId, daughterIndex)`:
1. **Quantitative** (rate by mode): choose one active locus uniformly; Δ = 2 with p 0.80 else 5;
   sign ±; clamp 0–100. A clamped no‑change is a neutral draw.
2. **Preference** (rate): requires ≥ 2 supported foods. If `ordered`, first establish `weighted`
   with first food `2/(n+1)` and others `1/(n+1)`, log the policy change; then transfer up to
   0.05 weight from one chosen food to another (direction independent of abundance).
3. **Module** (rate): gain or loss with equal probability. Gain: uniform among modules eligible
   for the ancestor, absent, not a native duplicate, combination‑valid, slot free. Loss: uniform
   among removable supplementary modules. Nothing eligible ⇒ no change. Never reroll.
4. **Developmental** (rate; Phase 7): uniform among eligible field operations (CT §6.3).
Rates are per daughter and never scale with speed, frame rate or environment. The stream keys
exist from Phase 0 so later phases do not shift earlier draws.

Module gain: new food capability appends to an ordered list; in `weighted` it receives 0.10
and others × 0.90. Loss removes the entry and renormalizes; if the remaining sum is zero,
restore `ordered` over the ancestral order restricted to supported foods. Removing a module never
removes a native pathway. Loss reconciliation of structures §9.19.

### 8.4 Feeding policy (C01, C02) — see §6.5. Fixed Traits keeps its recorded policy.

### 8.5 Branch discovery and naming
Genome identity ≠ named branch. Every mutation is recorded immediately. A descendant becomes a
**candidate** relative to its nearest named ancestral branch's reference genome when any holds:
≥ 0.10 normalized change in one locus active in both; mean absolute active‑locus difference
≥ 0.03; a different supplementary module set; a different feeding policy or ≥ 0.15 absolute change
in one shared weight (both weighted); Phase 7: a changed strategy, body form, life‑cycle module,
expressed role or native‑feature switch. Compare only loci active in both. A branch is
**established** when ≥ 5 qualifying descendants exist across ≥ 3 parent‑to‑child generations
beyond the candidate founder (descendants that no longer qualify are not counted); use the
deterministic oldest‑qualifying‑ancestor rule. The candidate founder becomes the branch
reference. States: *variation observed* → *branch established* → *branch extinct*. Generated
name `Ancestor · Descriptor · ShortID` (e.g. "Sprinter · Saltward · 7C2"); renaming keeps the
ID visible; never "Superior/Advanced/Perfect". Thresholds affect the notebook only.

### 8.6 Founder modes and mutation presets
Founder modes: **Identical** (loci 50, no modules); **Varied** (each active locus from 45–55
inclusive via `det(seed,'founder.init',inoculationSeq,locus)`); **Diverse** (Varied, plus 10 % of
eligible founders each receive one legal module chosen uniformly, labelled "present at
creation", with any structure inventory empty unless separately declared and debited). Presets
(quantitative / preference / module / developmental): **Standard** 8 % / 2 % / 0.2 % / 1 %;
**Accelerated** 16 % / 4 % / 1 % / 2 %; **Fixed Traits** 0 / 0 / 0 / 0. Developmental is 0 and
absent before Phase 7. Rate changes are timestamped interventions. Accelerated is a game setting,
not realism. Changing modes starts a new dish or an explicit converted copy.

### 8.7 Standard pacing statement (for UI copy)
The chance of at least one module‑gain attempt in 1,000 eligible daughter births at Standard is
`1 − 0.999^1000 ≈ 63 %`; an attempt is not a surviving branch. Never promise an ability in a
fixed time.

---

## 9. Supplementary modules (registry versioned; CT §7 for eligibility and numbers)

General: ≤ 3 supplementary slots; native abilities do not occupy slots; a native equivalent
cannot be gained; eligibility by ancestor ID; every active module adds **0.02 E/s** surcharge
(replaced by the resting rule while Resting); action costs are additional; selection is uniform
within the versioned eligible list; combinations validated at proposal time (never by deleting
conflicting modules afterward). Not available to viruses or parasites. Infection/host/toxin
target lists stay ancestor‑based.

- **E01 Starch release** — gain E_STARCH producer behavior (§5.3) with all its costs; grants no
  starch intake. Visual: notched producer marking; activity particles only during conversion.
- **E02 Signal glow** — gain B09's S_GLOW secretion and glow with both costs (§7.8). Visual:
  bright center + local halo only while glowing.
- **E03 Resting stage** — gain the complete dormancy machine (§7.6); no reproductive spore
  behavior. Visual: small folded seam; folded pose only while resting.
- **E04 Surface anchor** — when four‑adjacent to solid substrate or mesh with `E > 35`, attach
  after 5 continuous seconds; attached: speed 0, +0.10 E/s; detach after 10 s without intake,
  when support disappears, or `E < 15`; 10 s reattach lockout; feeding/predation ordinary.
  Active anchored organisms cannot enter directed channels; Resting releases the anchor; free
  organisms keep their transport class. Visual: substrate‑facing foot/stalk only while attached.
- **E05 Reserve chamber** — `energyCap += 40`; upkeep 0.03 E/s; capacity, not energy. Division
  splits current energy before applying each daughter's cap; overflow dissipates (ledger). Loss
  shrinks capacity; excess dissipates. Visual: interior amber pocket, four fill bands.
- **E06 Shade collector** — photosynthetic route only: `lightResponse = min(1, light/0.35)`,
  ceiling × 0.70 (then feeding locus). Not for native A03. Visual: broader dark interior patch.
- **E07 Light seeker** — base speed 0.15 cells/s and light‑sensing radius 2 become the mapped
  baselines for motility and sensing loci (activated at stored values); movement cost `0.10 ×
  (0.5 + g_mot)²` E/s only while self‑propelling (replaces distance cost); when active, unheld
  and unattached, score candidates by effective light; stay unless a candidate is brighter by
  ≥ 0.01; barriers and habitat apply. Loss leaves it in its current valid cell. Visual: two
  trailing motility pixels while moving.
- **E08 Debris feeder** — with no held meal, may request local detritus under the ordinary
  ceiling and aerobic conversion; a held meal has exclusive priority; a capture this tick
  cancels the detritus request; movement uses `max(prey, detritus)`. Grants digestion, not new
  prey. Visual: small granular interior mark; pulses only on recorded detritus intake.
- **E09 Protein release** — E_PROTEIN producer (§5.3). Does not grant broth feeding ("Produces
  broth; cannot consume broth" when true). Visual: paired notches; brief pale release marks.
- **E10 Matrix builder** — while active, `E > 35`, `B > 1.2 B0'`, local film < 0.50: request
  conversion of `min(0.02·dt, B − 1.2 B0', 0.50 − film)` body C into film with proportional N;
  cost 2 E per C actually transferred (reserved first). All builders read one snapshot; requests
  above headroom scale proportionally; commit together. No extra protection. Visual: edge film
  texture with opacity by film carbon.
- **E11 Mineral jacket** — separate `jacketMineral`; target 0.10 per current B; build ≤ 0.005·B0'
  mineral/s from local free silicate (shared, capped by deficit); 10 E per mineral bound; skip
  while resting, held, `E < 15` or dead. Coverage `c = clamp(jacket / (0.10·B), 0, 1)`; speed ×
  `(1 − 0.20c)`; Needlejaw handling `1 + 3c` s (c sampled at attempt start). No other protection.
  Division splits jacket; a daughter without E11 releases hers to grit. Visual: four rim levels
  with a soft‑body gap.
- **E12 Colony adhesion** — two free active carriers of the same ancestor within 0.5 cells for
  5 s, both `E ≥ 20`, may link (2 E each; pairs resolved by sorted birthIds; rejected pairs pay
  nothing; not across prohibited edges). ≤ 2 links per organism, ≤ 8 per component. Linked
  members stop self‑propelling; +0.01 E/s per link. All state individual; links convey nothing
  unless E15 on both ends. Sever after 10 s without intake, `E < 15`, dormancy, capture/hold,
  module loss, death, division, sampling; gate placement between members; forced separation
  > 0.75 cells. 10 s relink lockout. Newborns unlinked. Linked members cannot use directed
  channels. Cluster outline; members counted individually. Visual: thin pixel connections.
- **E13 Settler** (Phase 7) — stages Juvenile (Q × 0.75, speed × 1.20, no reproduction) →
  Settling (5 s beside the same usable support, ≥ 10 s juvenile age, `E ≥ 35`, `B ≥ 0.80 B0'`;
  5 E on entry; lost support cancels without refund; 10 s retry lockout) → Adult (attached,
  speed 0, Q × 1.15, +0.10 E/s upkeep; normal reproduction). Division: retained daughter stays
  Adult only if parent was Adult with valid support and keeps E13; every other E13 daughter is
  Juvenile. Excludes E04, E12, E14 (mutual). No E16 bonds during E13 stages. Dormancy releases
  attachment and resumes Juvenile after waking.
- **E14 Dispersing offspring** (Phase 7) — for native attached B02, F01, F02: the new daughter
  is Dispersing (0.15 cells/s through ancestral habitat; no feeding/secretion/transfer/
  reproduction; ordinary maintenance + distance cost; first 10 s ancestral scoring, then seek
  support with local food ≥ 0.10) → Settling (5 s; `E ≥ 10`; 5 E) → Adult, or **Stranded** after
  40 s cumulative dispersal (stops; no feeding; may settle later; no revival). Applies only when
  the parent carried E14 and the daughter retains it; first‑time gains stay Adult. Classes: B02
  disperser Small, fungal Medium. F02 links form on settlement only when adjacent to the living
  parent and degree allows. Native F04 daughters are ineligible.
- **E15 Exchange junction** (Phase 7) — eligible only with E12 present; edges share only when both
  ends carry E15. Carbon: donor above `1.25 B0'` → receiver below `1.25 B0'`; request ≤ `0.01 ×
  B0_donor × dt` per edge, capped by surplus/deficit; proportional N; 1 donor E per C sent; no
  recipient energy. Energy (after carbon reservations): donor above 70 → receiver below 40;
  request ≤ `0.5 × dt` per edge, capped; deliver 90 %, 10 % dissipated; a donor receives none in
  the same pass. Sum and scale outgoing to availability and incoming to headroom; one pass; no
  relay. Colony roles (CT §7.3) express only while linked.
- **E16 Partner bond** (Phase 7) — one listed bacterium (B01, B05, B06, B09) + one listed alga
  (A01, A03), both carrying E16, free, active, within 0.5 cells for 5 s, `E ≥ 20`; 3 E each; one
  bond per individual; birth‑ID priority. Bonded: no self‑propulsion; 0.05 E/s each; ordinary
  feeding; one budgeted carbon transfer from a partner above `1.20 B0'` to one below `1.20 B0'`
  at ≤ `0.005 × B0 × dt`, proportional N, 1 donor E per C. Breaks on death, capture, division,
  dormancy, separation > 0.75, new barrier, or either below 15 E for 10 s; 10 s rebond lockout;
  newborns unbonded. Not simultaneously in an E15 pass.
- **E17 Food cache** (Phase 7) — see §7.19; eligible for P01, P02, P05, P07 only with E08, and
  for native detritus‑feeding P09.

### 9.19 Birth reconciliation (after split, per daughter)
Excess energy above the new cap dissipates (ledger). Jacket without E11 → grit; no jacket is
created by gaining E11. Colony links removed; both unlinked. E04 attachment resets. E03 loss ⇒
Active without an energy gift. F03 trap stays with the retained parent; F02 links follow
branching rules; modules duplicate neither. Released material appears at the end of birth
processing and is usable next tick. A daughter losing E14 must fit a native placement before
commit.

---

## 10. Commands and tools

### 10.1 Command model
`{commandId, worldId, targetTick, seq, kind, payload, rulesetIdentity}`. One completed gesture
or tap = one command. Applied atomically at stage 1 of `targetTick` (paused: at the current tick
without advancing). Accepted and rejected amounts are recorded. Rejected placements charge and
inject nothing. Undo snapshot is captured immediately before committing a gesture.

### 10.2 Inoculate
Counts 1 / 5 / 20 (default 5) across eligible cells in the footprint (radius 1/3/6, default 3),
deterministic eligible‑cell order; require habitat compatibility and attachment where relevant;
report accepted count when space or cap limits. Phage doses add 1/5/20 viral units per cell.
Founder inventories per §6.1; external input ledgered.

### 10.3 Material brush
Radius 1/3/6 (default 3); dose 0.02/0.10/0.50 per covered cell (chemistry default 0.10;
activities 0.1/0.5/1.0). Distance‑sampled in world coordinates with at most one cell between
samples; one stroke applies once per covered cell; dose independent of frame rate or finger
speed. Preview footprint and total before release. Crossed brush on incompatible terrain.

### 10.4 Habitat brush and structures
Water/gel/sediment replace substrate; shade paints 0.1 or erases to 1.0. Stone/wall/bead
placement previews and skips occupied cells; wall cannot cross the rim or overlap a live agent.
Erase Structure removes only the structure and restores the previous substrate. Edge barriers
and devices (Phase 5–6) follow §2.4; devices start Off; moving a device is a paused atomic
relocation keeping ID, contents and controller reference.

### 10.5 Sample and transfer (paused transaction)
Begin ⇒ pause + transaction checkpoint. Modes Life / Dissolved / Deposits / All (All excludes
structures); radius 1/3/6. Preview the full selection and held inventory. Whole ownership units
only: host + parasite, cluster/link/bond members, trap + held prey, claimed targets; otherwise
reject with a highlight naming the missing members (no silent brush expansion). Confirm moves
contents into the single **sample slot** (an accounted compartment of the source world, which
stays paused until Transfer, Cancel or Discard). Cancel restores the checkpoint exactly. Discard
confirms and logs exports. **Transfer** validates every destination cell first; rejects the whole
move if it cannot fit; it is a move, not a copy; fields keep cell offsets; organisms keep
relative positions and attachment requirements; all life state, genomes, energy, age, infection
and ownership transfer. Cross‑dish (Phase 6) requires both paused, compatible rulesets, atomic
prepare/commit with a transaction ID, both‑old or both‑new recovery, and undo only while neither
world has changed. Replacing a held sample requires confirmation; on reload a pending
transaction offers Complete / Cancel / Discard without restarting time.

### 10.6 Clean water replacement
Removes 25/50/100 % of dissolved non‑gas fields in the footprint and restores O2/CO2 to the
preset baseline there; leaves life and deposits; logs removals and additions. This is the
explicit dilution tool.

### 10.7 Snapshot, duplicate, undo, checkpoints
Snapshot stores the complete state; Duplicate makes an independent named dish. Undo (one level
per dish) restores the state immediately before the most recent completed gesture including
elapsed ticks, labelled "Undo rewinds time". Optional automatic checkpoint ring: 10 snapshots at
60 s intervals, labelled automatic, rotating; pinned saves are never removed silently.
Rewinding opens a new branch from a stored state.

### 10.8 Inspect and overlays
Tap a cell, organism or colony; switch individual/cell; candidate list on ambiguity. One
environmental overlay at a time (45 % default opacity, adjustable, legend low→high), plus
separate toggles for infection markers and trait/ancestry overlays. Overlays never modify the
simulation or consume randomness.

### 10.9 Manifest edits
Enabling content in an existing world is never silent: it creates a converted copy with
provenance (§14.5).

---

## 11. Equipment (Phase 6)

### 11.1 LAB01 Dosing reservoir
One valid water/gel/sediment cell, one device slot; starts Off. Stores one recipe: Sugar (0–0.10
N per C, default 0.10) or Broth (0.10). Capacity 20 C. Load while paused with preview; loading
is an external input into the reservoir; partial fills allowed; a different recipe/ratio is
rejected while inventory remains; emptying exports the remainder. Rates 0.01/0.02/0.05 C/s
(default 0.02). Stage 3: if Running, request `min(rate × dt, remaining)`; transfer C and the same
inventory fraction of N into its cell; commit together; reduce inventory once. Invalid receiving
cell ⇒ output 0, state Blocked, stock retained. States Off / Running / Empty / Blocked /
Controller paused. Panel shows stored C and N, rate, output last second, cumulative output, time
to empty ("active dispensing time"). No burst is owed for blocked ticks.

### 11.2 LAB02 Light lens
One device cell; Off by default; intensities 0.10/0.25/0.50 (default 0.25). Illuminates passable
cells within four‑neighbor path distance `d ≤ 3` through valid habitat (walls and closed shutters
block; membranes and small gates transmit unchanged) with contribution `intensity × (1 − d/4)`.
Lamps add into `sourceLight` before shading (§4.4). Recompute affected cells in stage 2 when
device/barrier/terrain/shade changes; cache neighborhoods. Source contribution and effective
light are shown separately. No warming, no attraction by fiat.

### 11.3 Controllers
≤ 8 per dish, one per target device. Record: rule ID, region ID (an observation mask; empty is
invalid), metric (mean O2, mean effective light, mean warmth, total sugar C, total living
biomass, count of one ancestor template), optional template, direction High/Low, enter and reset
thresholds (High: reset < enter; Low: reset > enter; domain‑checked), hold 1/5/10 s (default 5),
cooldown 10/30/60 s (default 30), target device, action (reservoir On/Off, lamp On/Off, heater
On/Off, cooler On/Off, shutter Open/Closed), enabled, last sample tick, condition start tick,
armed, last fire tick. Initially enabled but unarmed until a reset sample unless "Arm now".
Sample once per simulated second after stage 10; hold timer starts at the first qualifying
sample and clears on any nonqualifying sample; fire when hold elapsed; queue the action for the
**next** tick (never affecting the snapshot that caused it); disarm; rearm after cooldown **and** a
reset sample. Missing/invalid measurement disables the rule with a reason. One rule, one action;
no chaining, no inventory, no spawning, no code.

### 11.4 Manual override and ordering
Commands carry a monotonic sequence; due commands apply by (targetTick, seq); controller rules
sampled in the same second queue in ascending rule ID. A manual actuator change cancels queued
automatic actions for that actuator and pauses its controller and future scheduled actuator
actions ("Manual control — automation paused"); resume is explicit; missed actions are marked
skipped, never replayed. A second controller on a controlled device is rejected. Schedule +
controller on one device requires an explicit conflict acknowledgement. Every firing records
metric, region, value, thresholds, hold, target, queued tick and result; non‑firing shows its
waiting state.

---

## 12. Observation and explanation

### 12.1 Inspector depths
**Summary**: name (nickname if favorite), ancestor type, life state, age, generation, energy,
health, strongest current constraint as one sentence with a measured value. **Why**: all
constraints; two headings *Happening now* (environment, compatible food, intake received,
movement, resting/attack status, division blockers) and *Passed to offspring* (loci values and
deltas from ancestor, feeding policy, modules with upkeep and activity state, native feature
switches, strategy, size/form, role). **Details/Evidence**: measurements, costs, birth record
(exact mutation event, "benefit unknown" until observed), field values, time windows, lineage
links, capacity flags. Cell inspector: substrate, pools, pH, salinity, O2, light factors,
residents, recent deposits, structures/devices. Colony view aggregates one species in a
contiguous region. Selected‑colony panel (E12): member count, roles, sharing edges, limits.

### 12.2 Reason codes (engine → UI; copy in UX §5.2)
Intake: `FOOD_ACCESS_LOW`, `FOOD_NONE_COMPATIBLE`, `FOOD_EXCLUDED_BY_PREFERENCE`,
`NUTRIENT_LIMITED`, `OXYGEN_LIMITED`, `LIGHT_LIMITED`, `CO2_LIMITED`, `SILICATE_LIMITED`,
`CROWDING_INTAKE_HALVED`, `MEAL_DIGESTING`, `MODE_SUGAR`, `MODE_PHOTO`.
Suitability: `SUIT_PH`, `SUIT_WARMTH`, `SUIT_SALINITY`, `SUIT_MOISTURE`, `SUIT_HABITAT`,
`SUIT_OXYGEN_HIGH` (Dusk), `INHIBITOR_EXPOSURE`, `RIVAL_EXPOSURE`.
Energy/health: `ENERGY_ZERO`, `ENERGY_LOW`, `HEALING`, `INFECTED`, `PARASITIZED`, `HELD_IN_TRAP`,
`CAPTURED_HANDLING`.
Division: `DIV_BLOCK_BIOMASS`, `DIV_BLOCK_ENERGY`, `DIV_BLOCK_HEALTH`, `DIV_BLOCK_AGE`,
`DIV_BLOCK_PLACEMENT`, `DIV_BLOCK_CROWDING`, `DIV_BLOCK_CAPACITY`, `DIV_BLOCK_STATE`
(resting/juvenile/dispersing), `DIV_BLOCK_INFECTED`, `DIV_PENDING_PROPOSAL`.
Predation: `PRED_NO_PREY`, `PRED_OUT_OF_CONTACT`, `PRED_COOLDOWN`, `PRED_MEAL_FULL`,
`PRED_HANDLING_IN_PROGRESS`, `PRED_ENERGY_HIGH`.
States: `RESTING_FOOD_SCARCE`, `RESTING_DRY`, `PREPARING`, `WAKING`, `DORMANCY_LOCKOUT`,
`ANCHORED`, `LINKED`, `BONDED`, `JUVENILE`, `SETTLING`, `DISPERSING`, `STRANDED`,
`NIGHT_QUIET`, `EMERGENCY_FEEDING`.
Secretion: `SECRETING`, `SECRETION_NO_SUBSTRATE`, `SECRETION_ENERGY_LOW`, `SECRETION_SATURATED`,
`GLOW_ON`, `GLOW_OFF`, `NEIGHBORS_DETECTED`.
Death: `DEATH_STARVATION`, `DEATH_STRESS`, `DEATH_INHIBITOR`, `DEATH_AGE`, `DEATH_PREDATION`,
`DEATH_LYSIS`, `DEATH_PARASITE_DRAIN`, `DEATH_TRAP_DRAIN`, `REMOVED_SAMPLED`.
World: `CAPACITY_REACHED`, `HISTORY_COMPACTED`, `EVIDENCE_EXPIRED`, `MIXED_CAUSES`.
Attribution: a constraint is reported with the measured value and, where relevant, the share of
request supplied ("18 % of requested growth supplied"). Ties within 5 % show both. Death primary
cause = largest health‑loss contributor over the final 10 s; concurrent contributors are those
≥ 25 % of the primary; predation/lysis/age/sampling are definitive. Never derive causes from art
or a later snapshot.

### 12.3 Events
Record births (with trait deltas), deaths by mechanism, consumption, conversion, infection,
lysis, attachment, capture/release, link/bond formation and separation, stage transitions,
dormancy transitions, glow on/off, environmental stress onset, tool commands, controller
firings, branch state changes, capacity reached, cache creation/depletion. Feed coalesces
repeats per species and cause over 5 s. Keep the last 500 detailed events.

### 12.4 History
Per‑second samples for 30 simulated minutes; one‑minute summaries to 6 hours; species biomass
and counts, O2, nutrient, deaths, births, blocked births, intake by food type, energy earned/
spent, material flows, external additions, per‑region means and boundary transfer totals,
selected trait median/range per region, module frequencies, capacity‑limited intervals.
Interventions marked on the timeline. Compacted history is labelled incomplete; never
reconstruct.

### 12.5 Charts
Living biomass by species, individual count, O2, nutrient, deaths; regional trait graphs;
module frequency; controller thresholds and firings. Units, patterns and color. A chart shows an
association unless an event record supports causation.

### 12.6 Favorite families (Phase 4)
≤ 3 active per dish: lineage root ID, nickname (≤ 60 chars, local), accessible marker pattern,
representative ID. Find highlights the representative; on its division or death offer surviving
descendants sorted by birth tick then ID, "Follow next" picks the first; never the healthiest.
Show descendants, generation depth, confirmed inherited differences; keep founder traits,
individual mutations and established branches distinct. Extinction: "No members of this family
remain" + last conditions + Look back / Continue exploring / Start a new dish. Favorites never
alter behavior. Unpinned favorites stay in the notebook. Highlight ≤ 200 descendants then an
aggregate marker.

### 12.7 Story cards (Phase 4)
Templates: **A first split** (committed birth; "A cell split. Its offspring inherited these
traits."), **An enzyme at work** (recorded conversion; "Starch became sugar here."; no producer
credit without provenance), **A family changed** (established branch; difference + tradeoff; no
benefit claim), **A place changed** (two retained regional summaries around an intervention).
≤ 3 panels captioned with sim time. Store template ID, world/ruleset identity, evidence IDs,
measurement summary, time range, image refs. ≤ 1 new notification per 60 s, one visible notice;
dedupe by template + lineage/region; priority favorite → unseen template → earliest. Spotlight
focuses a location without moving organisms. A card without a snapshot is a memory, not a replay.

### 12.8 Observation tools (Phase 4)
Relationship map (observed transfers/attacks with type and measured total; windows 60/180/600 s;
unknown = absent), region probes (≤ 6 rectangle/circle masks; population, biomass, food and gas
means, boundary transfer totals; overlap warning), follow family (≤ 200 highlighted), event
bookmarks (timestamp + summary ± snapshot; text‑only labelled non‑replayable), recipe card
export (starting world, seed, modules, command schedule, versions, expected observations),
prediction note, specimen gallery (image + species + inspector summary; never spawns), transfer
preview (paused illustrative arrows), custom challenge editor (§13.5), succession notebook
(Phase 5: one‑minute templated summaries tied to event IDs, provenance‑aware wording).

### 12.9 Copy rules
Plain statements ("Needs more energy to divide", "Inherited a larger reserve"). Never "adapted to
survive" after a random mutation; never "immune" for a reduced penalty; distinguish measurement
from prediction, seeded from natural, one run from a general conclusion. Text from reason codes
and values only; no runtime language model.

---

## 13. Recipes, experiments, variants, goals, turns

### 13.1 Recipe model
`{id, revision, habitatId, seed, lid, lightMode, drying, mutationPreset, founderMode,
manifestOverrides, fieldPatches[], founders[], scheduledCommands[], testOnlyOverrides[],
expectedObservationsText}`. Realization: resolve habitat, apply patches (per cell inside the
patch mask: cells whose center squared distance ≤ r²; quantities per included cell; clipped to
valid cells of the required substrate), place founders (distinct cells; sort eligible by
distance, then y, then x; IDs in listed species order), record every external input in the
ledger, validate limits, instantiate paused at tick 0. Test‑only overrides are disclosed in the
setup panel and export and never available in ordinary sandbox.

### 13.2 Experiments (CT §10)
An experiment card has question, recipe, suggested intervention, predicted tradeoff,
measurements, stopping point, confounds, observation gate and completion behavior (journal
stamp; world keeps running). Fixtures run to the gate headlessly; a fixture that cannot reach
its gate on the nominated content reports the measured limiting factor and is not release‑ready
until tuned by a **new recipe revision**. Failure never deletes a save.

### 13.3 What if? variants (CT §9.4)
`RecipeVariant {id, revision, sourceId, sourceRevision, requiredCapabilities, title, question,
patch (one parameter), previewDifference, objectiveId?}`. Realization keeps the source's seed,
versions, founders and all other values; records source/variant checksums and the realized
initial‑state checksum; never simulates during preview. **Again** rebuilds the same recipe and
seed. **Another idea** selects the next supported variant in catalog order. Missing content or
invalid patch stops creation with a readable message; never crop or substitute. Starting a
variant preserves the current dish through the save flow and creates a separate world ID.

### 13.4 Comparison
Duplicate freezes baseline A, creates B. Queue an intervention on B. Advance both by equal tick
counts (60/180/600 s or Stop), sequentially if memory requires; never unequal simulated time.
Results: final biomass, diversity (surviving species), O2, deaths, absolute differences, trait
distributions, module frequencies, deaths by cause, capacity‑limited intervals; "this paired run".
Prediction note before, conclusion label after. Baseline stored once; branches separately;
deleting a comparison never deletes a named dish.

### 13.5 Objectives and goals
Objective engine predicates: keep named species alive (count > 0 for duration); reach biomass
threshold; transfer quantity across a named gate; observe named event; keep a field within a
range in a region for a continuous duration. Goal states inactive / running / completed / ended /
continued freely. Off by default in free play. Completing shows one dismissible sentence and
Continue without changing pause state. Blocked or cancelled proposals never count as births.
Custom challenge editor: saved baseline, allowed tools, optional command budget, one objective,
numeric targets; restrictions apply only inside that challenge; exported with stable IDs, region
masks and baseline checksum; no scripts.

### 13.6 Try my dish
From a paused dish: capture an immutable baseline into a slot; choose a compatible goal and a
60/180/600 s turn (default 180, free observation). Each turn clones the baseline into a new world
ID, starts paused, uses ordinary tools; at the horizon pause and offer Keep this result / Another
turn / Finish. Temporary turns replace only the prior unsaved turn after explicit discard; a kept
result uses a normal slot. Saves retain baseline reference, goal state, start tick, horizon.
Missing baseline disables Another turn. No accounts or rankings.

---

## 14. Persistence

### 14.1 Save contract
Save the entire authoritative world: manifest (`simulationVersion 3`, `evolutionRulesVersion`,
`moduleRegistryVersion`, `phenotypeMappingVersion`, `contentVersion`, `contentHash`,
`enabledSpecies`, `enabledModules`, `enabledSystems`, `mutationPreset`, `founderMode`,
`livingLabVersion`), `schemaVersion`, `worldId`, `worldSeed`, tick, `commandSeq`,
`birthEventCounter`, grid mask/substrates/shade, all allocated fields and companions, structures,
edge barriers, devices (with inventories and settings), food objects, caches, entities (all
§6.1 fields), genome table, pending proposals, lineage records and branch records (with
compaction summaries), sample slot and pending transaction, camera, histories, event ring,
journal, favorites, bookmarks, story cards, goal state, controller records and queued actions,
schedule state, settings, light‑cycle phase, ledgers. A seed alone cannot restore a modified
dish. Cosmetic RNG state is not saved.

### 14.2 Slots and autosave
10 named local slots, one rolling autosave, and the most recent valid predecessor per slot.
Autosave every 30 real seconds while active and on background, comparison completion and manual
save. Transaction: serialize at a consistent tick → validate → checksum → write new record →
swap active pointer. A failed write never deletes the previous version. Continue restores the
exact saved moment, paused, with Resume. A save during 4× returns paused at the stored tick.

### 14.3 Export and import
File `.pixelmeba` (MIME `application/vnd.pixelmeba+json`): UTF‑8 JSON with `schemaVersion`,
`simulationVersion`, content/rules versions, metadata, full state (typed arrays as documented
base64), and SHA‑256 of the canonical state payload. ≤ 25 MB; preflight dimensions and
allocation before decoding. Import checks dimensions, entity/object limits, known IDs, finite
values, nonnegative pools, reference integrity (mutual links, hosts, targets) and checksum;
malformed ⇒ clear message and no change; newer unsupported ⇒ explanatory error; older supported
⇒ migrate into a new slot keeping the original. Imported content cannot execute code or load
URLs. Staged into a new slot; overwriting requires confirmation. Name fields ≤ 60 chars, escaped.

### 14.4 Share artifacts (Phase 4)
**Picture**: 1080 × 1080 PNG (full dish, optional question, quiet wordmark, safe margin,
nearest‑neighbor; optional title/time/legend; Hide labels), no nicknames unless opted in, no
device metadata. **Starting recipe**: `.pixelmeba` recipe export (initial state/recipe, seed,
schedule, versions). **Living dish**: full save at a consistent paused tick. Offline recipe
identifiers "R‑G3 / revision 1 / seed 104729" for bundled recipes only; Copy and Import ID resolve
only exact supported IDs/revisions and valid seeds. Metadata‑stripped export recomputes the hash.
OS share/save flow; cancellation changes nothing.

### 14.5 Migration
Version bumps ship with old‑save fixtures. Migration writes a new validated record, keeps the
original, tags provenance, assigns explicit defaults for new fields (never random), and never
changes a saved genome's meaning. Enabling new content in a saved world is a converted copy.

---

## 15. Determinism and randomness
- All simulation randomness: `det(worldSeed, streamId, ...keys) → uint32` via a strong 32‑bit
  mixer over the canonical encoding of its arguments; `detFloat` maps to [0,1). Streams:
  `decide`, `tiebreak`, `wander`, `contact`, `infect`, `founder.init`, `founder.module`,
  `mut.quant`, `mut.pref`, `mut.module`, `mut.dev`, `placement`. Stateless; only `worldSeed` is
  saved. Cosmetic randomness uses a separate unsaved generator and never touches simulation
  values.
- Iteration is by stable index; contacts by seeded hash priority; no `Map`/`Set`/object‑key
  iteration in the sim; no `Date`, no `performance.now` in the sim.
- Same build, saved state and commands ⇒ identical `stateHash` at 1× and 4× and through
  save/reload. Cross‑version bit‑identical replay is not promised; exported snapshots are
  authoritative. Replays require identical rules/content/registry versions.
- Snapshots, inspector reads, previews, portraits and camera changes consume no simulation
  randomness and trigger no decisions.

---

## 16. Limits and performance
Targets: 30 fps on the nominated midrange Android device and 60 fps on desktop with 6,000 agents
(2,000 fungal) on the 128² grid; 1× tick < 10 ms at target population; touch feedback p95
< 100 ms; 15‑minute dense session without memory growth or thermal collapse. Under load reduce
particles, label frequency, overlay refresh, snapshot frequency and aggregation detail **first**;
never skip ticks, change the timestep, alter mutation odds or delete life. Comparison may halve
render frequency, never simulated time. Capacity messages are simulation limits, not ecology.

---

## 17. Acceptance fixtures index (see directive gates for phase mapping)
neutral‑founders · conservation‑closed‑lid · determinism (1×/4×/reload) · no‑free‑growth ·
fair‑shared‑food · content‑validation · blocked‑division‑proposal · finite‑feeding ·
enzyme‑source · inherited‑variation · predation · photosynthesis · module‑accounting ·
registry‑imports · branch‑evidence · comparison · variants · host‑specificity ·
transport‑obstacles · conservation‑all‑pools · film · fungal‑branching · fungal‑transport (E212)
· parasite · phage · dormancy · sampling/transfer/dilution · every catalog relationship (generated
matrix) · shared‑budget (C08) · favorites · stories · objectives · share · view‑switch ·
one‑gesture · demo‑scope · (Phase 5) isolation, state machines, ownership, disjoint hosts,
handling · (Phase 6) reservoir conservation, rate/empty, light formula, controller timing, manual
precedence, sample transaction, persistence · (Phase 7) D501–D506, conservation, state integrity.

---

## 18. Glossary
**Agent/entity**: one simulated representative organism (not a real cell count). **B0**:
ancestral structural carbon of a mature individual. **Q**: intake ceiling per second. **M**:
ordinary maintenance energy per second. **Suitability**: 0–1 environmental fit. **Meal**: stored
prey carbon and nutrient. **Film**: biofilm carbon in a cell. **Activity**: abstract catalytic or
signal strength field. **Proposal**: an immutable pending birth with drawn genomes. **Branch**:
a named, established lineage difference. **Manifest**: a world's recorded enabled content and
versions. **Variant**: one‑parameter remix of a bundled recipe. **Ledger**: conservation
accounting. **Explore/Lab**: the two presentation views over one world.
