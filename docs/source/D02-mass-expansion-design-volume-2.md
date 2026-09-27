# 01  Expansion direction and document authority
# Pixelmeba Expansion Design
Volume Two
September 26 2026 • Expansion specification 2.0 • Developer and designer handoff
Expand the existing microscopic sandbox into a world of specialized organisms, usable chemical gradients, constructed habitats, recurring environmental cycles and visible ecological succession. The player should be able to arrange a small living system, observe an unexpected chain of consequences, and find a clear explanation for it.
Pixelmeba is the preferred working title. Pixel Petri Dish remains an alternative. The owner already has a separate game named Pixel Petri; do not reuse that game’s package ID, store listing, save namespace or assets without explicit project authorization. No title availability check is asserted here.
## Relationship to the first document
Use this alongside Pixel-Petri-Design-and-Build-Specification.docx, version 1.0. That document remains the foundation. This volume adds 24 organisms to the original 14, eight habitat recipes, twelve material entries, twelve structures and eighteen experiment designs. It defines expansion behavior, presentation, dependencies and acceptance checks. It is a separate handoff, not an instruction to discard work already underway.
Section 2 contains explicit amendments. Elsewhere, unchanged foundation rules still apply. Expanded worlds use simulationVersion 2 and a versioned expansion manifest. Classic worlds retain their original rules. Do not change the outcome of an existing saved world just because a content pack was installed.
## Production intent
The team’s next 24 hours are a design preparation window, not a promise to implement this scope in one day. Finish the foundation’s playable slice first. Then integrate the expansion in the four waves on page 3. Every organism must have a distinct role, an observable response, a cost or limitation, and at least one interaction that can be demonstrated.
Pages
Use
2–10
Compatibility, system rules and habitat construction
11–18
Materials, habitats, new life and balance profiles
19–23
Art direction, tools, experiments and long-term play
24–26
Integration contract, validation and delivery requirements

# 02  Explicit amendments to the foundation
Apply the following only to Expanded worlds unless a clarification can be introduced without changing a Classic save. Retain stable IDs B01–V01 and their original profiles. A renamed product is not a reason to rename species IDs.
Amendment
Required rule
A1  Resource completeness
Track bound nutrient on detritus, film and meals independently of carbon. Do not assume every pool stays at N = 0.10C: phage lysis and other conversions can change the ratio. Consume and transfer each pool’s actual proportional nutrient.
A2  Feeding allocation
Credit food-bound nutrient before requesting free nutrient. Shared food is allocated proportionally first; then oxygen, free nutrient and required silicate limit each request. Commit once. Newly released surplus joins the next tick’s free pool; it cannot fund another consumer in the same allocation pass.
A3  Meal and corpse ownership
A captured prey’s biomass becomes one predator’s meal, with overflow becoming detritus. Any meal already held by that prey becomes detritus separately. Release its attached parasite alive at the death location. Account for each carbon pool once.
A4  Reproduction identity
Keep the parent ID for one daughter and assign one new ID to the other. Both retain the foundation’s budgeted split and age reset. Record lineage links separately so selecting or following a family does not lose continuity.
A5  Stimulus and tools
Define physical contact as centers within 0.5 grid cells unless a catalog entry overrides it. Biofilm attachment is on passable cells adjacent to stone, not inside stone. Multitouch cancels any uncommitted paint gesture.
A6  Expanded targets
Category-based fictional inhibitors include new members of that category. Bacterial inhibitor targets B01–B13; fungal inhibitor targets Y01–Y02 and F01–F04; photosynthetic inhibitor targets A01–A05. Parasites and animals are unaffected by these three category tools.
A7  New systems
Local climate, light cycles, enzymes, signals, dormancy, constructed gates, targeted rivalry, fungal transport and mineral shells are enabled only by an Expanded manifest. No hidden defaults alter Classic worlds.
A8  Honest labels
All doses, timing, tolerances, conversion rates and host lists remain fictional game rules. Use “modeled effect” and “game units.” Do not advertise the design as a real culture, chemical safety or disease prediction tool.

Precedence: this amendment table and section 24 govern Expanded update order; the foundation resource accounting remains binding except for the explicit additions here. If the team identifies a conflict not resolved by these rules, document it and isolate the affected feature rather than inventing a silent compromise.
# 03  Expansion waves and dependencies
Wave
Features and new organisms
Gate
E1  Living chemistry
Enzymes and finite food objects; B06 Crumbsmith, B07 Oilwick, B08 Brothmaker, Y02 Creambud and F02 Cordweaver. Inspector reaction ledger and food-access overlays.
Carbon and nutrient remain conserved through food conversion, digestion and fungal transport.
E2  Neighborhoods
Signals, rivalry and local climate; B09 Lantern, B10 Brinecoil, B11 Sourbud, B13 Rampart, A02 Glasswheel, A03 Shadeleaf, A04 Turnleaf and A05 Raftball. Gates and habitat recipes.
Signal costs, bounded climate, gate permissions and shell minerals have reproducible fixtures.
E3  Food web
B12 Sleeper, F03 Traplace, F04 Sporeveil, P05 Shellglider, P06 Bellstalk, P07 Dartfin, P08 Waterbear, P09 Wheelgrazer, P10 Needlejaw, X02 Threadrider and V02 Lacephage.
Dormancy, trapping, predation and host ownership conserve budgets and avoid softlocks.
E4  Discovery studio
Eighteen experiments, relationship map, event bookmarks, lineage following, specimen gallery, custom challenge export and finishing art.
A player can reproduce an observation, understand its modeled cause, and share the correct state offline.

## Essential experience
The expansion must make local choices matter. A food object should create a neighborhood. A gate should separate meaningful ecological conditions. A decomposer should change what grows next. A resting organism should survive a temporary shortage without becoming immortal. The inspector should expose each connection.
## Dependency discipline
Each content entry declares its required modules. A species whose module is missing is unavailable with an explanation; it never falls back to generic bacterial behavior. The manifest fixes active modules when a world is created. A Classic world can be copied into Expanded mode, but its original remains playable.
## Features kept out of this volume
No live multiplayer, accounts, full fluid simulation, real-world experimental recipes, autonomous genetic mutation, custom infectious traits or arbitrary downloaded scripts. Cross-dish pipes remain deferred; this volume’s gates connect regions within one dish. Finite local transfers and ordinary file sharing deliver the intended experimentation without a backend.
# 04  Extracellular digestion and finite food
Introduce three fictional enzyme activities that unlock deposited food. Their purpose is spatial: a colony can make a food source useful to itself and inadvertently to neighboring species. Activities are abstract catalytic strength, not edible molecules. They cost energy to produce; no biomass or nutrient is created by the activity field itself.
Activity
Conversion
Producer and cost
E_STARCH
Starch carbon becomes the same amount of sugar carbon. Transfer any bound nutrient to the sugar’s nutrient companion pool.
B06 and F02; emit 0.02 activity units/s while E > 35; pay 0.40 energy/s.
E_OIL
Lipid carbon becomes the same amount of metabolite carbon; preserve associated nutrient.
B07; same emission and energy cost.
E_PROTEIN
Protein carbon becomes the same amount of soluble broth carbon; preserve associated nutrient.
B08; same emission and energy cost.

## Catalysis contract
For each enzyme type and cell, converted carbon this tick = min(substrateAmount, 0.10 × effectiveActivity × timestep). Timestep is 0.10 simulated seconds. Remove exactly that carbon and its proportional bound nutrient from the substrate and add them to the product. Products appear before ordinary feeding in the same tick.
Effective activity is activity/(1 + enzymeBreaker). Enzymes diffuse at half the habitat’s dissolved coefficient and lose 2% of activity per simulated second using the fixed timestep. Breaker diffuses normally and loses 1%/s. Resolve all conversions from pre-reaction pools; enzyme outputs cannot chain through another enzyme until the next tick.
## Producer limits
A producer emits only when a compatible deposited substrate exists in its cell or a four-neighbor cell. Emission stops at local activity 1.0, under dormancy, or below the energy threshold. Secretion is paid after maintenance; an organism cannot spend energy it no longer has. Enzymes do not bypass walls or convert live organisms into food.
## Finite food objects
Pellets and leaf wafers contain explicit remaining food and nutrient inventories. Release into their own cell only, with a visible shrinking outline. They are not inexhaustible generators. Sampling transfers remaining inventory; destruction releases the remainder into deposits. Tool-created inventory is an external ledger input. A food object that has emptied becomes a nonblocking visual stain that fades.
# 05  Signals and targeted competition
## Lantern neighborhoods
B09 emits one shared signal, S_GLOW, at 0.02 units/s while E > 35, paying 0.20 energy/s. Signal diffuses normally, decays 1%/s and is capped at 1.0 by stopping emission; do not discard existing excess. External Signal drops are permitted. Quencher reduces the sensed value to signal/(1 + quencher) and decays 1%/s.
A Lantern switches glow on after sensed signal ≥ 0.30 for five continuous seconds. It switches off after signal ≤ 0.15 for five seconds or E < 15. Glow costs another 0.30 energy/s. This two-threshold rule prevents flicker. Glow is cosmetic and supplies zero usable photosynthetic light. Display “Neighbors detected” with the measured signal value.
## Rampart rivalry
B13 secretes RIVAL activity at 0.02 units/s when an active B01, B10 or B11 lies within two cells, E > 50 and local RIVAL < 1.0. Secretion costs 0.60 energy/s. Activity diffuses at half the normal coefficient and decays 2%/s. It targets only those three fictional species. It is not a real antibiotic and does not mutate or become more effective over time.
For those targets, add 0.25 × RIVAL to effective bacterial-inhibitor exposure; use the existing growth and health response. Biofilm halves the combined exposure once, not once for each source. Rampart receives no competitive bonus directly: it must still find food and pay secretion costs. Non-targets can benefit indirectly by occupying space or using food left behind.
## What players can discover
A dense Lantern cluster may glow, become energy-limited, dim and recover. Separating a colony with a wall can split its signal field. Adding a quencher can stop the visible response without removing the organisms. Rampart can suppress one competitor while helping an untargeted grazer’s prey grow. These are possible simulated outcomes, not scripted animations.
## Presentation and evidence
Signals use a faint dotted overlay, enzyme activity uses branching hatch marks and RIVAL uses a sparse chevron pattern. Never permanently tint water with every field at once. The inspector shows producer, energy spent, local strength and target compatibility. Log a change only after the state threshold is crossed; avoid an event for each signal particle.
# 06  Dormancy and resting stages
Only B12 Sleeper, F04 Sporeveil and P08 Waterbear can enter a resting state in this pack. These are separate fictional life histories using a shared state machine. The Field Guide must not imply that all microbes form bacterial endospores or that all resting forms reproduce.
State
Entry and behavior
Exit
Active
Ordinary profile and resource rules. Dormancy begins only after a trigger persists and E ≥ 15.
No usable food intake for 20 s, or moisture suitability < 0.20 for 10 s.
Preparing
Lasts 5 s; no feeding, movement or reproduction. Spend 10 energy once, not every tick. Ordinary stress still applies.
Survive preparation to enter Resting; death cancels it. Improved conditions do not refund the cost.
Resting
No intake, photosynthesis, movement, secretion or division. Maintenance = 0.01 energy/s. Environmental stress and inhibitor damage are multiplied by 0.10. Zero-energy starvation still deals 4 health/s.
Suitable moisture, environment and usable food must persist 10 s; waking also requires E ≥ 5.
Waking
Lasts 5 s; spend 5 energy once. No feeding or reproduction. Restore ordinary damage rules during waking.
Enter Active; apply a 30 s lockout before the next dormancy attempt.

Age continues through every state, so maximum lifespan still applies. Resting organisms remain prey for compatible consumers. Their biomass is never duplicated into a separate spore icon. Death returns their exact resources. A resting organism that lacks waking energy eventually dies; no automatic energy gift revives it.
## Sporeveil reproduction
On F04 division, the retained parent stays Active and the new daughter starts Resting with its allocated half of the post-cost energy and biomass. This replaces ordinary active daughter placement. Place the daughter in a compatible neighboring cell; use no free dispersal jump. A gate that passes Small organisms can transfer a resting daughter. Once awake it attaches if the destination is suitable.
## Visual identity
Sleeper folds into an outlined oval, Sporeveil becomes a small speck with a double ring, and Waterbear curls its body inward. These remain visibly different from dead debris. Add a moon-shaped status badge only when selected. Explain “Resting because food stayed scarce” rather than “immune” or “invincible.”
# 07  Fungal transport and ecological partnerships
## Cordweaver transport
F02 creates explicit undirected links between parent and daughter segments when it branches onto a four-neighbor cell. Only living F02 links carry resources. Ordinary F01 threads remain local feeders with visual links only. Removing a segment breaks its incident links immediately; visually crossing threads do not automatically connect.
After feeding and before reproduction, compute one simultaneous transport pass. A donor with B > B0 may send surplus toward an adjacent linked receiver with B < 1.5 × B0 and at least 0.01 × B0 less biomass than the donor. Edge request is min(0.02 × timestep, half the biomass difference). Cap total outgoing requests to B minus B0, proportionally. Cap total incoming requests to receiver headroom below 1.5 × B0. Transfer actual proportional bound nutrient with carbon. Transport grants no energy.
Requests read the pre-transport snapshot. Apply donor and receiver caps together and return unused reservations; do not reallocate this tick. A segment can relay received surplus only on later ticks, allowing gradual movement through a chain. Cap degree at four and count all segments against the entity budget. Do not pool an entire network or cross broken links.
## Partnerships arise from shared resources
Combination
Mechanism
Limitation
Crumbsmith and Sprinter
Enzyme releases sugar from starch; both may eat the sugar.
Sprinter may outcompete the enzyme producer; cooperation is not guaranteed.
Sunbead and aerobic bacteria
Photosynthesis changes local oxygen and releases sugar; bacterial feeding returns CO2.
Nutrient shortages, night or excessive consumers can break the balance.
Cordweaver and Crossfeeder
Fungal feeding releases metabolite; Crossfeeder uses it near the network.
Neither gets a hidden bonus for being near the other.
Recycler and consumers
Deaths and leftover meals become decomposer food; bound nutrient can re-enter the free pool.
Recycling does not recover all energy or generate new carbon.
Raftball and Shadeleaf
Large colonies create local shade; Shadeleaf tolerates lower light.
Raftball also competes for resources; shade can be too strong.

The relationship map shows these as observed transfers, with actual amounts and times. It may label “resource exchange observed.” It must not declare a stable mutualism merely because two species are present in the same dish.
# 08  Light cycles warmth and moisture
## Day and night
At creation, choose Fixed Light or a 240-second cycle: 90 s day, 30 s dusk, 90 s night, 30 s dawn. Day factor is 1.0; night factor is 0.05; transitions interpolate linearly. Effective light equals habitat baseline × cycle factor × painted shade × canopy factor, clamped to 0–1. All factors and current phase appear in the inspector.
Raftball canopy factor is 1/(1 + total local A05 biomass/10), affecting its cell and four neighbors. Combine multiple colonies by summed biomass, not repeated multiplication. All photosynthetic agents there, including Raftball, receive the same attenuation. Bioluminescence does not contribute to this field.
## Local warmth
Expanded cells store warmth. Ambient baseline defaults to 0.50. Each tick warmth relaxes 1% toward ambient, diffuses at coefficient 0.05 over passable edges, and receives heater/cooler input. Clamp the displayed and stored warmth to 0–1 because it is an environmental index, not a material inventory. No chemical reaction or biomass is created from heat.
A heater or cooler changes its cell by ±0.01 per simulated second. Adjacent diffusive transport creates a gradient; blocked edges stop local transport. Warmth sources are player-controlled environmental energy inputs, never food sources. Multiple overlapping devices add, with at most one device per cell.
## Moisture without a fluid engine
Moisture is a substrate suitability index. Water is fixed at 1.0. Gel and sediment start at 0.8; with Drying enabled, uncovered cells lose 0.001/s down to 0.1. A wetting brush restores the index to 0.9 without diluting solutes or changing carbon pools. A roof tile stops local drying. It does not shelter against chemistry.
Bacteria, yeast and fungi prefer moisture 0.4–1; ordinary water consumers require water habitat and moisture 1. Dormancy species tolerate 0.2–1 while active. Use a 0.2 shoulder below the minimum and multiply the foundation suitability by moisture response. Drying does not concentrate chemicals: quantities remain per fixed grid cell. Say this explicitly in the guide.
## Controls
Default Expanded sandbox enables day/night but disables drying until chosen. Habitat recipes override these settings explicitly. A manual light or climate change is timestamped as a command. Restoring a snapshot restores cycle phase and device settings, not the current wall-clock time.
# 09  Twelve construction pieces
Construction is grid-based, previewed before placement and free in sandbox. Habitat compatibility still matters. Each structure has a stable ID, rotation, occupied cells, editable settings and an inspectable effect. Structures never conceal a free food source.
ID and structure
Behavior and visual cue
S01 Fine membrane
One-cell edge barrier. Solutes and abstract activities pass at 25% normal flux; organisms, viral units and deposits do not pass. Pale dotted line with a molecular icon.
S02 Small gate
Edge barrier that passes free Small organisms, viruses and solutes at 50% normal transport. Blocks Medium/Large bodies, attached life and deposits. Short slotted outline.
S03 Shutter gate
Edge barrier with Open/Closed toggle. Open behaves as no edge barrier; Closed blocks everything. A visible tab changes position.
S04 One way channel
Directed edge between adjacent water cells. Adds budgeted directed transport described on page 10; no long-distance teleport. Arrow points toward the receiving cell.
S05 Porous shelter
Passable surface cell for Small free organisms; blocks Medium/Large movement. Solutes and viruses pass normally. Four-hole stone silhouette.
S06 Attachment mesh
Passable cell furnishing attachment for Velvet, fungi and Bellstalk. No inhibitor protection or extra nutrient. Fine crosshatch.
S07 Nutrient basket
Holds one finite food object and prevents direct sampling of only part of it; release still occurs normally. Inspect remaining inventory. Small lattice ring.
S08 Adsorption resin
Finite removal of selected fictional inhibitors and RIVAL only; 5 total activity capacity. No effect on life, food, oxygen or enzymes. Dark bead lightens as saturated.
S09 Heater
Local +0.01 warmth/s device. Pause/toggle individually. Small amber ring and heat icon; no animated flames.
S10 Cooler
Local −0.01 warmth/s device. Small blue ring; otherwise same rules as heater.
S11 Shade roof
Local shade multiplier 0.25 and prevents moisture loss on one cell. Outline-only canopy so organisms remain visible.
S12 Moisture wick
Adjacent gel/sediment cells relax toward moisture 0.8 at 0.01/s if the wick touches water. Does not transport food or solutes. Narrow woven strip.

Edge barriers occupy edges, not cells. Cells may hold one furnishing/device plus their substrate and food. Invalid overlap is rejected. Removing a device removes only the device; resin takes its stored activity with it as a logged tool export. Removing a basket leaves its food object in place.
# 10  Chambers transport and gate permissions
## One dish with multiple neighborhoods
Use walls and edge barriers to create connected chambers inside the existing circular mask. There is no second simulation grid and no additional dish boundary. Label up to six player-defined regions for charts and saved camera views; regions are observation masks and do not alter physics.
Transport class
Examples
Fine membrane
Small gate
Dissolved
Sugar, broth, gases, nutrient, salt, acid/base, silicate
25%
50%
Activity
Enzymes, signal, quencher, breaker, rivalry
25%
50%
Viral
V01 and V02 fields
Blocked
50%
Small mobile
Free bacteria, Dartfin, free parasites, resting F04 daughter
Blocked
Pass
Medium and Large
Yeast/algae agents, amoebas, rotifers, worms, Waterbear, Needlejaw
Blocked
Blocked
Fixed
Attached colonies, active fungi, Bellstalk, deposits, food objects
Blocked
Blocked

Ordinary dissolved diffusion uses the lowest applicable barrier coefficient. Two barriers on the same edge are invalid. Organism paths check every crossed edge, not just their destination. A host and attached parasite move as one unit using the host’s class. Free life cannot attach while inside a barrier edge.
## Directed channel contract
S04 requests transfer of 2% of every eligible dissolved or viral source pool per simulated second into its adjacent water destination. Multiply by timestep; do not replace or recreate liquid. It also allows one eligible free Small organism to cross per second if one is at the source cell. Select deterministically, retain its exact state, and do not grant extra biological actions.
All directed transfers read one snapshot. Sum outgoing requests per pool; cap to available amount and scale proportionally. Commit sources and destinations together. Transport any companion bound nutrient in the same fraction. Deposit particles, attached organisms, film and food objects are never advected. Channels cannot form instantaneous multi-hop transfers in one tick.
## Resin adsorption
S08 removes selected inhibitor/RIVAL activity from its own cell at up to 0.05 activity units/s, allocated proportionally among selected fields and capped by remaining capacity. Store the removed amount as bound activity on the device. No carbon or nutrient is involved. Saturated resin does nothing until removed and replaced; it never regenerates silently.
## UI feedback
Selecting a gate previews what can pass using the exact class table. A paused tracer animation can visualize permitted routes without advancing or moving real material. Region charts show measured exchange totals so a player can distinguish isolation from actual ecological resistance.
# 11  Twelve additional materials
Retain all foundation materials. New entries below are game abstractions with stable IDs. Dissolved carbon foods now carry optional bound-nutrient companion fields; diffusion and sampling move both in the same fraction. External doses are logged at their exact composition.
ID and material
Dose and effect
M01 Soluble broth
Add 0.02/0.10/0.50 carbon per cell, with 0.10 nutrient per carbon. Dissolves normally. Food for B08, Y02 and F03 only unless a future data pack explicitly adds a diet.
M02 Silicate
Add 0.02/0.10/0.50 mineral units per cell. Dissolved; not carbon or nutrient food. A02 and P05 require 0.10 silicate per unit of new biomass.
M03 Starch enzyme
Add E_STARCH activity 0.1/0.5/1.0 per cell. Converts deposited starch into sugar according to page 4.
M04 Lipid enzyme
Same dose for E_OIL; converts oil into metabolite. No direct effect on living membranes.
M05 Protein enzyme
Same dose for E_PROTEIN; converts deposited protein into broth. Does not attack live organisms.
M06 Lantern signal
Add S_GLOW 0.1/0.5/1.0. Activates eligible Lantern behavior only after its normal threshold timing. No energy or food benefit.
M07 Signal quencher
Add 0.1/0.5/1.0; reduces sensed signal by 1/(1 + quencher). Does not erase the signal pool or kill Lanterns.
M08 Rivalry extract
Add RIVAL 0.1/0.5/1.0. Targets B01/B10/B11 only. Same effect as Rampart activity; clearly label the fictional target list.
M09 Enzyme breaker
Add 0.1/0.5/1.0; reduces all three effective enzyme activities by 1/(1 + breaker). No direct growth or health effect.
M10 Slow feeder pellet
One object contains 10 sugar carbon and 1 bound nutrient. Releases 0.02 carbon/s with proportional nutrient; visible remaining amount and about 500 s duration.
M11 Leaf wafer
One object contains 6 starch carbon, 4 protein carbon and 1 bound nutrient. Releases 0.012 starch and 0.008 protein carbon/s into deposits, each with 0.10 nutrient per carbon.
M12 Shell grit
Add 0.1/0.5/1.0 solid mineral units. Dissolves into M02 at 0.01 × remaining units/s. Cannot be eaten for carbon or energy.

Shell accounting: growing A02/P05 bind 0.10 mineral per new biomass. Inoculations include matching bound mineral as a logged input. Division splits it. Death or predation releases all bound mineral as shell grit, never as a hidden defensive bonus. Food release, catalysis and consumption preserve associated carbon and nutrient.
# 12  Eight expanded habitat recipes
All recipes use the original 128 × 128 circle. Coordinates refer to cell centers. Unspecified conditions use Water Garden fields, zero new activities and no initial life. Geometry below replaces the two default stone islands. Suggested communities are optional templates, not automatic hidden spawns.
Habitat
Exact geometry and conditions
Suggested community
H04 Leaf Pool
Water; leaf wafer at (45,64) and (80,64), each in a basket. Attachment mesh in radius-8 patch at (64,64). Fixed light 0.6.
Crumbsmith, Brothmaker, Creambud, Cordweaver and Amoeba.
H05 Brine Mosaic
All gel; water disks radius 18 at (40,64) and (88,64), joined by water cells x = 40–88, y = 62–65. Right disk starts salinity 0.6. Fixed light 0.8.
Brinecoil on the right; Sprinter on the left; controlled mixing at the channel.
H06 Dusk Marsh
Water for y < 60; sediment below. Closed lid; oxygen 0.15 in sediment and 0.8 above. Detritus 0.20 and nutrient 0.10 throughout sediment. Cycle on.
Dusk, Recycler, Shadeleaf and Siltworm.
H07 Glass Garden
Water with mesh strips at x = 40 and 88, y = 35–90. Silicate 0.30 everywhere, fixed light 0.8.
Glasswheel, Shellglider, Wheelgrazer and Crossfeeder.
H08 Night Lanterns
Water, closed lid, cycle on. Metabolite 0.20 and nutrient 0.10 in radius-14 patch at (64,64). No painted shade.
Lantern, Sunbead and Recycler.
H09 Drying Lace
Gel; vertical water channel x = 24–31. Moisture 0.8 elsewhere, drying on; roof covers radius-8 patch at (88,64). Fixed light 0.5.
Sleeper and Sporeveil, with a wick connecting one protected edge.
H10 Gate Lab
Water divided by impermeable edge wall along x = 64. Replace edges at y = 61–66 with six Fine membranes. Oxygen/CO2 at defaults, cycle off.
Crumbsmith plus starch on left; Sprinter on right. Swap membranes for gates.
H11 Grazing Meadow
Water with sediment disk radius 16 at (64,64); mesh on passable perimeter cells. Detritus 0.10 in disk, nutrient 0.15 everywhere. Cycle on.
Fungal patches, Waterbear, Wheelgrazer and Needlejaw in separate starting regions.

The recipe preview lists enabling modules, lid, light cycle and drying. Every recipe can open as Empty or Suggested Community. Suggested Community adds five of each named species to valid cells in a radius-10 patch near its recommended region; preview and record every accepted inoculation. Never inoculate incompatible life silently.
# 13  Eight new bacterial specialists
All are fictional bacteria; normal aerobic feeding and foundation reproduction apply unless explicitly overridden. Add these IDs without changing B01–B05. Their numerical profiles are on page 17.
ID and name
Diet and distinctive behavior
Appearance and limitation
B06 Crumbsmith
Eats sugar; water/gel/sediment. Emits E_STARCH near starch. Its own released sugar may be consumed by competitors.
Ochre short rod with three notches; pale dust halo only during actual catalysis. Cannot eat starch directly.
B07 Oilwick
Eats metabolite; water/gel/sediment. Emits E_OIL near oil. Moves toward lipid deposits when energy permits secretion.
Navy curved rod with amber tip. An oil patch is not usable until converted.
B08 Brothmaker
Eats broth; water/gel/sediment. Emits E_PROTEIN near protein. Follows protein while capable of secretion; otherwise follows broth.
Rose capsule with two white bands. Cannot eat deposited protein directly.
B09 Lantern
Eats metabolite then sugar. Water only. Shared signal controls costly glow after threshold dwell times.
Blue-green double bead; tiny lime center lights up. Glow is visible at night but never powers algae.
B10 Brinecoil
Eats sugar. Water/gel; preferred salinity 0.4–0.8. No enzyme or attack. Establishes a contrasting niche across salt gradients.
Rust spiral with a cream edge. Freshwater is stressful, not a universal upgrade.
B11 Sourbud
Eats sugar; water/gel. Preferred pH 4.5–6.0. Emits 0.40 acid equivalent per consumed carbon.
Red wedge with a dark bud. Acid can harm its neighbors and eventually itself.
B12 Sleeper
Eats sugar; water/gel/sediment. Can enter the resting state on page 6. Uses low growth and maintenance rates.
Olive oval, folded central seam while resting. Resting does not multiply it or reset age.
B13 Rampart
Eats sugar then metabolite; attached on gel, sediment, mesh or stone edge. Secretes RIVAL only in the specified circumstances.
Brick-red chain forming angular patches. Pays for rivalry, is still edible and receives no free biofilm.

## Movement priorities
For B06–B08, the food score includes 0.5 × convertible substrate score while E > 35, using amount/(amount + 0.1). Use the larger of usable-food and convertible-substrate scores. This lets producers find a deposit without falsely granting food before catalysis. All other movement weights and collision rules remain unchanged.
# 14  Eight new photosynthetic and fungal types
ID and name
Ecological role
Appearance and constraint
A02 Glasswheel
Water photosynthesizer using CO2, nutrient and silicate. Binds 0.10 mineral per biomass gained. Normal light response.
Gold geometric disk with a clear faceted rim. Shells become grit on death; silica shortage limits growth.
A03 Shadeleaf
Water photosynthesizer; effective light response min(1, light/0.30), replacing the ordinary linear response. Lower maximum intake.
Dark green crescent with mint vein. Strong at dim light; no extra growth above its intake ceiling.
A04 Turnleaf
Water mixotroph. Photosynthesis when light ≥ 0.35; sugar feeding when light ≤ 0.25. Hold the current mode between thresholds.
Split green and amber spindle; active half brightens. Never runs both metabolic modes in one tick.
A05 Raftball
Water colony represented by one agent. Normal photosynthesis, large B0 and local canopy effect. No individual-cell simulation inside it.
Clustered emerald rosette with a hollow center. Shades its own neighborhood and competes for minerals.
Y02 Creambud
Water/gel yeast-like consumer; eats broth. Aerobic standard feeding, no acid secretion. Supports a second use for protein digestion products.
Ivory pear with orange bud. Cannot use sugar; visible budding obeys the same biomass budget.
F02 Cordweaver
Attached on gel/sediment/mesh/bead. Eats sugar then detritus; emits E_STARCH. Budgeted branches transport biomass over explicit links.
Copper branching threads with pale pulse along a link only during measured transfer.
F03 Traplace
Attached on sediment or mesh. Eats broth; creates a costed trap that can hold and drain P04 only. No general attack on other life.
Amber looped threads; a loop closes when occupied. Trap costs and escape rules are on page 16.
F04 Sporeveil
Attached on gel/sediment/mesh/bead. Eats detritus then starch directly. Divides into one active segment and one resting daughter.
Silver-gray web with black-ringed resting specks. Daughter consumes its own allocated energy; no free spore shower.

## Light and mineral ownership
Turnleaf’s mode is saved with the entity. Initialize it from light ≥ 0.35, otherwise Sugar mode. In photosynthetic mode it uses the foundation conversion; in Sugar mode it uses ordinary aerobic conversion. Its broth compatibility is empty. Shell mineral stays attached to Glasswheel across modes, samples and division; its sprite cannot be treated as an independent resource.
Raftball is a fictional colony abstraction, not a claim that all green algae form these structures. The inspector reports one simulated colony plus biomass, rather than pretending to count every visible decorative cell.
# 15  Six new microscopic consumers
Predator meals, hunger thresholds and energy accounting follow the foundation. Fixed capture and handling overrides are explicit below. Add one hunting-state field and one target ID per consumer; a lost or invalid target cancels the attempt.
ID and name
Prey and habitat
Behavior and appearance
P05 Shellglider
Water. Eats B01/B03/B04/B05/B06/B07/B08/B09/B10/B11/B12. Requires silicate for growth.
Slow shelled amoeba; cream scalloped disk with moving front lobe. Needlejaw must maintain contact for 4 s to capture it. No damage immunity.
P06 Bellstalk
Attached on mesh, bead or passable stone-edge cell in water. Eats B01/B03–B12, excluding B02 and B13.
Bell-shaped ciliate on a slender stalk. Captures compatible prey within 1 cell without pursuit. Radius capture is the only contact override; meals remain budgeted.
P07 Dartfin
Water. Eats B01/B03/B04/B05/B06/B07/B08/B09/B10/B11/B12. Small gate-compatible body.
Fast flagellate with two tail pixels. High movement maintenance makes empty-water wandering costly. Needlejaw can catch it.
P08 Waterbear
Water/gel/sediment at compatible moisture. Eats A01–A05 and individual F01/F02/F04 segments. Never eats an entire connected network at once.
Eight-leg silhouette with four visible pairs; slow turning and curling dormancy. Brief shortages can be survived, not ignored indefinitely.
P09 Wheelgrazer
Water. Eats A02/A03/A04 and Y02. If no stored meal, may consume detritus instead using the same Q cap.
Rose rotifer with a round ciliary wheel. Meal has priority over debris; both never grant separate full-rate intakes.
P10 Needlejaw
Water. Eats P01/P02/P05/P07 only. Ordinary prey needs 1 s continuous contact; P05 requires 4 s.
Long blue predator with a forked front. Top consumer with high maintenance; cannot live on algae or secretly generate prey.

## Handling rules
Continuous contact means within the relevant capture radius at every tick while the target remains compatible and alive. Reset progress when contact breaks. Target is not immobilized by handling. Start the ordinary attack cooldown only after a successful capture. If multiple predators complete together, the deterministic contact priority chooses one winner.
## Movement class
P07 is Small; P05/P06/P09 are Medium; P08/P10 are Large. Size classes control gates and presentation, not automatic predation. P08 and P10 use 48 × 48 source frames; the visible body remains readable at default zoom through optional selection magnification.
# 16  Parasites viruses traps and food web rules
## X02 Threadrider
Fictional fungus-associated parasite. Free habitat is gel or sediment; free speed 0.3 cells/s, sensing radius 3, Small class. Hosts are F02 and F04 active segments only. One parasite per segment; no attachment to resting daughters. Drain 0.015 host carbon/s with proportional bound nutrient, using X01’s 50% biomass, 30% CO2, 20% metabolite conversion and 30 energy per consumed carbon. No ambient oxygen is required for this abstract transfer.
When the host dies or rests, release Threadrider alive locally; it must find another active host before starving. Host division keeps it on the retained parent. It never jumps through a network link. Inspector shows the affected segment and measured drain.
## V02 Lacephage
Fictional virus with B02 as its only host. It can infect only where film carbon ≥ 0.10. Use V01’s unit carbon, infection probability, 20 s timer, 40% lysis allocation and decay; its viral field diffuses at half V01’s coefficient. A lace-shaped inspection glyph distinguishes it. No shared pool or host broadening between V01 and V02. Classic B02 remains unaffected because V02 is absent there.
## Traplace cost and escape
An active F03 with E ≥ 50 and B ≥ 1.3 × B0 can build one trap by moving 0.20 carbon and proportional nutrient from its biomass into a trap reserve and spending 8 energy. Reserve is a real carbon pool. One P04 entering its cell is held for 8 s; target can still feed but cannot move. Drain 0.03 carbon/s using the same resource split as X02. At 8 s release the target and set a 30 s trap cooldown. A target below 0.25 × its B0 dies and recycles normally.
Removing or killing the fungus releases the reserve into detritus and releases any live target. No double capture, remote draining or instant-kill animation. A trap cannot arm when its owner would fall below B0. Existing reserve persists between captures. While draining a target, F03 skips broth feeding. On owner division, its retained parent keeps the entire trap reserve and target; the daughter gets no free trap.
## Explicit extensions to the original food web
P01 additionally eats B06–B13, Y02 and A02–A04. P02 additionally eats free B06–B12 and A03/A04. P03 additionally eats Y02 and A02–A04. P04 additionally eats B06–B13 in sediment. No other original predator gains new prey. A05 is prey only for P08 in this expansion. X01 remains A01-only; V01 remains B01-only. Never infer compatibility from size, color or category alone.
# 17  Balance profiles for producers
B0, Q and M retain their foundation meanings. Q is carbon intake per simulated second before limiting factors; M is baseline energy drain/s, excluding movement and secretion. All quantities below are initial game balance values. Preferred ranges and special modules override only the listed properties.
ID
B0
Q
M
Min age
Max age
B06
1
0.13
0.4
20
800
B07
1
0.12
0.38
22
800
B08
1
0.13
0.4
20
800
B09
1
0.14
0.35
22
800
B10
1
0.14
0.4
20
800
B11
1
0.13
0.4
22
800
B12
1
0.08
0.2
35
1800
B13
1
0.12
0.4
25
900
A02
2
0.16
0.4
30
1000
A03
1.5
0.1
0.3
35
1100
A04
1.5
0.13
0.45
30
1000
A05
5
0.36
0.8
60
1400
Y02
2
0.2
0.4
30
1000
F02
2
0.18
0.4
35
1400
F03
2
0.15
0.4
40
1400
F04
2
0.14
0.3
40
1800

## Defaults and overrides
New bacteria move 0.25 cells/s and sense radius 2, except attached B13 and stationary B12 while resting. A02/A03/A05/Y02 do not self-propel. A04 moves 0.35 cells/s and senses radius 2; algae are Medium even when visually small. Fungi and B13 are Fixed while attached. F04 resting daughters are Small.
New bacteria use pH 6–8, warmth 0.35–0.65 and salinity 0–0.20 unless listed otherwise. B10 salinity is 0.4–0.8; B11 pH 4.5–6; B12 warmth 0.25–0.65. New algae use pH 6.5–8.5, warmth 0.30–0.65 and salinity 0–0.15. Y02/F02/F03/F04 use pH 4.5–7, warmth 0.30–0.65 and salinity 0–0.25.
Initialize all new agents at H = 100, E = 50, B = B0, N = 0.10B0 and age zero, with the additional shell mineral for A02. Body, food, mineral and activity fields use stable IDs; do not store translated display names as simulation keys.
# 18  Balance profiles for consumers
ID
B0
Q or drain
M
Min age
Max age
P05
4
0.5
0.65
55
1400
P06
3
0.45
0.55
50
1400
P07
2
0.55
1.0
40
900
P08
10
0.9
0.7
90
2400
P09
8
0.85
0.85
75
1500
P10
12
1.2
1.4
100
1400
X02
0.2
0.015
0.12
35
360
V02
.01/unit
Host rule
Decay rule
No division
Field decay

ID
Speed cells per s
Sense radius
Capture cooldown
P05
0.45
3
3 s
P06
0
1
3 s
P07
3.0
5
2 s
P08
0.35
3
5 s
P09
0.8
4
4 s
P10
1.2
6
6 s
X02
0.3
3
One host attachment

## Tolerance and defense
Consumers use pH 6–8, warmth 0.35–0.65 and salinity 0–0.20. P08 instead prefers warmth 0.25–0.65 and moisture 0.2–1. X02 uses fungal preferred ranges. P05 binds 0.10 silicate per new biomass and starts with 0.10 × B0 bound mineral. Shell handling delays do not reduce modeled inhibitor exposure.
## Reference conversions
Ordinary new consumers use the foundation’s aerobic 50% biomass, 30% CO2 and 20% metabolite split. New B11 still uses aerobic metabolism despite acid output. Y02 is aerobic. X02 and F03 host-drain transfers use the explicit special conversion without an ambient oxygen debit. V02 follows its host-specific rule, not ordinary feeding.
## Balance guardrails
Test sensing, habitat compatibility and stored meals before tuning growth. Dormancy retains its energy cost and finite lifespan. Change contentVersion whenever a numerical profile changes.
# 19  Visual expansion and memorable moments
Keep the original clean dish, crisp pixels and quiet controls. New richness should come from recognizable behavior and spatial structure. Do not increase the density of permanently visible labels or fill the dish with flashing chemical clouds.
Moment
What the player sees
What causes it
A food island wakes
A wafer shrinks; tiny feeding patches appear around it, then a grazer arrives.
Finite release, extracellular conversion, ordinary growth and prey sensing.
A neighborhood lights up
Lantern centers begin glowing after a dense patch has formed; a divided patch may stay dark.
Measured signal crossing a timed threshold.
A lace bridge feeds a tip
A short pulse travels one fungal edge; a hungry tip gains biomass.
Actual budgeted F02 link transfer, not an invented energy beam.
A hidden sleeper returns
A ringed resting form unfolds after the player restores conditions.
Saved dormancy timers and sufficient waking energy.
The membrane changes everything
Sugar crosses a dotted barrier while the source colony remains behind it.
Per-class transport permissions, not visual clipping.
A glass graveyard
Faceted shells linger after organisms die, gradually fading into the mineral overlay.
Bound mineral becomes grit and dissolves.
A slow capture
Needlejaw follows Shellglider; the handling arc fills only while contact persists.
Continuous-contact capture and one valid target owner.
A trap lets go
A fungal loop closes around one worm, then opens as the timer expires.
Costed reserve, timed drain and mandatory release.

## Asset additions
Produce the 24 organism sets using the foundation frame standards, plus dormancy Prepare/Rest/Wake states for B12/F04/P08; trap Open/Holding/Cooldown states; Lantern Dim/Glow overlays; Turnleaf two mode overlays; mineral shell/grit; twelve structure icons and placed tiles; twelve material icons; region pins and gate-class badges. Use palette shifts with unique silhouettes, not a new hue for every molecule.
Fungal transfer effects may flash a link once per second at most. Glow uses a localized two-pixel halo, no full-screen bloom. Reduced motion replaces transfer pulses, handling arcs and unfolding with static state changes. Audio adds soft gate clicks, a single wake cue and a restrained discovery chime; retain global event-rate limits.
# 20  Observation tools and experiment creation
Tool
Defined player behavior
Relationship map
Shows only observed directed transfers or attacks, labeled with type and measured total. Toggle the last 60/180/600 simulated seconds. Unknown relationships remain absent, not marked impossible.
Region probe
Draw up to six rectangle or circle masks. Track population, biomass, food and gas means plus boundary transfer totals. Overlap is allowed, with an overlap warning to prevent summing regions as independent totals.
Follow family
Select an organism and follow descendants through stored lineage links. Highlight at most 200 descendants, using an aggregate marker above that. Do not change their behavior.
Event bookmark
Stores a timestamp, event summary and optional full snapshot. A text-only bookmark is not replayable; clearly label it. Snapshot bookmarks count against storage limits.
Recipe card
Exports the starting world, seed, enabled modules and a command schedule as one experiment file. Includes exact build/content versions and expected observations as text.
Prediction note
Before comparison, let the player write a short hypothesis. Afterward show it next to measured results. Never auto-grade a subjective hypothesis as scientifically proven.
Specimen gallery
Save a screenshot crop, species ID and inspector summary to a local collection. Gallery images do not spawn organisms or alter inventory.
Transfer preview
While paused, outline eligible material classes crossing a selected gate using illustrative arrows. It is a diagnostic preview, never an extra simulation step.

## Custom challenge editor
Choose a saved baseline, allowed tools, optional command budget and one of five measured objectives: keep a named species alive; reach a biomass threshold; transfer a quantity across a named gate; observe a named event; or keep a chosen field inside a range for a continuous duration. Targets and durations are numeric fields. No arbitrary code or downloaded objective scripts.
Sandbox content remains unlocked. A challenge’s restrictions apply only within that challenge. Exported objectives store stable IDs, region masks and baseline checksum. To share, use the existing file export; no hosted level service is needed.
## Practical storage
Keep up to 50 text bookmarks, 20 snapshot bookmarks and 100 gallery entries. Show approximate storage used and offer explicit cleanup. Never silently evict named dish saves. Screenshots carry no location or device-identifying metadata generated by the game.
# 21  Nine chemistry and habitat experiments
Experiments E201–E218 extend the original six. Each uses its numeric ID as seed, begins at tick zero, and includes an exact setup definition. All amounts below are game units. Use Water Garden without stones unless another recipe is named; Fixed Light 0.8, open lid and no drying unless stated. Radius-6 patches scatter named agents uniformly among valid cells.
ID and experiment
Setup and observation gate
E201 Shared lunch
Patch (45,64): 20 B06, 20 B01, starch 0.50 and nutrient 0.20 per cell. Observe E_STARCH conversion ≥ 1 carbon and B01 sugar consumption ≥ 0.5; distinguish producers from beneficiaries.
E202 Oil neighborhood
Patch (64,64): 20 B07, 20 B05, oil 0.50 and nutrient 0.20/cell. Complete after converted oil carbon ≥ 1 and recorded metabolite intake by both species.
E203 Protein chain
Patch (64,64): 20 B08, 10 Y02, protein 0.50 with nutrient 0.05/cell. Observe broth production and Creambud intake; compare with a branch lacking B08.
E204 Broken catalyst
Duplicate E201 before running. Add M09 = 4 activity/cell to B patch through fixture setup. Compare 120 s; report converted starch difference. Completion is the measured comparison, not a prescribed ratio.
E205 Glow threshold
Place 30 B09 in radius-3 patch (64,64), sugar 1 and nutrient 0.20/cell; light fixed 0.05. Observe at least one glow-on event and inspect its signal/energy values.
E206 Quiet neighbors
Duplicate a glowing E205 snapshot; add quencher 4/cell to B patch. Run 30 s. Inspect sensed signal and any glow-off events; population loss is not required.
E207 Brine crossing
Use H05; 20 B01 in left pool and 20 B10 in right, sugar 0.50 and nutrient 0.20 per pool cell. Open/close a shutter across the connecting channel and observe salt transport and suitability.
E208 Glass budget
30 A02 at (64,64), nutrient 0.20/cell; set silicate zero. Duplicate; add silicate 0.50/cell only to B. Compare 180 s and inspect the recorded mineral-limitation difference.
E209 Gate meal
Use H10. Put 30 B06 and starch 0.50/cell at (55,64); put 20 B01 at (72,64). Add nutrient 0.20 to both patches. Observe sugar crossing a Fine membrane while no organisms cross.

For observations that require population survival, provide a reset and show the measured limiting factor if the current balance prevents the intended event. A fixture is not release-ready until its stated observation is reproducible on the nominated content version. Do not script the event merely to pass the lesson.
# 22  Nine food web and survival experiments
ID and experiment
Setup and observation gate
E210 Sleeping shortage
Gel disk radius 15 at (64,64), moisture 0.8, fixed light; 20 B12, no sugar. Observe a resting transition. At 60 s add sugar 0.50 and nutrient 0.20/cell; observe at least one wake cycle.
E211 Sheltered lace
Use H09; 10 F04 in protected patch and 10 at (64,64); detritus 0.50 and nutrient 0.20 in both patches. Run 600 s. Compare moisture and life states; do not promise either patch survives forever.
E212 Fungal supply line
Gel; create four linked F02 segments at (60–63,64). First has B = 4, others B = 2; use matching bound N and E = 50. No food. Observe exact donor/receiver ledger changes over 10 s without added energy.
E213 A temporary trap
Sediment radius-15 patch at (64,64). One F03 at center with B = 2.8, N = 0.28, E = 80; one P04 at center. Run 12 s. Verify reserve cost, hold, drain and release; no requirement to kill prey.
E214 Shell handling
Water; P10 and P05 at (64,64), no other prey; set both speed zero in a test-only fixture override, visibly labeled. Verify no capture before 4 s continuous contact, then exactly one meal transfer.
E215 Fungal hitchhiker
Gel patch with 10 F02, sugar 0.50, nutrient 0.20/cell; place 5 X02 at host positions. Observe attachment and resource drain. A branch without hosts must show zero parasite reproduction from feeding.
E216 A different host
Water with mesh at (64,64); 20 B02, 20 B01, film 0.20/cell and V02 5 units/cell in radius-6 patch. Add sugar/nutrient. Observe B02 infection and zero B01 infection by V02.
E217 Rival without a winner
Gel patch: 20 B13, 20 B01, 20 B04; sugar 0.50 and detritus 0.50/cell, nutrient 0.20. Compare to a copy lacking B13 over 180 s. Inspect target exposure and secretion cost rather than forcing victory.
E218 Night shift
Water; 20 A04 and 20 A01 at (64,64); sugar 0.50, nutrient 0.20/cell. Cycle on. Run one 240 s cycle. Observe Turnleaf mode changes and compare photosynthetic versus sugar intake totals.

## Experiment completion behavior
Completion records an observed event or comparison, awards an optional journal stamp, and leaves the simulation running unless the player paused it. Failed predictions are valuable observations. Never describe a single paired run as a statistically established effect. Advanced players can rerun a recipe with a different seed and retain a separate result card.
Test-only initial states and profile overrides in E212–E214 are disclosed in the setup panel and export. They are not hidden cheats in ordinary sandbox worlds. Baseline tests still use production profiles without overrides.
# 23  Long term play and ecological stories
## Succession notebook
At one-minute simulated intervals, summarize changes in measured biomass and resource flows. Identify the three largest biomass gains/losses, new observed feeding links, and any species extinction or recovery from rest. Use templated sentences tied to event IDs. The game does not need a language model to describe what its own simulation recorded.
Example: “Brothmaker released broth from protein. Creambud consumed 2.4 carbon units of that pool during this interval.” Use the second sentence only when provenance is available. Without source attribution, say “Creambud consumed broth while protein conversion was active.” Avoid inventing individual molecule histories.
## Optional play prompts
Prompt
Measurable goal and counterplay
Two neighborhoods
Keep B01 and B10 above 5 individuals for 180 s in two marked regions. Salt mixing, food demand and gates make separation meaningful.
Night garden
Observe Lantern glow and an algal photosynthesis event in the same cycle. Glow supplies no photosynthetic energy.
Food relay
Observe starch → sugar → biomass → detritus → decomposer intake in one run. Each arrow must have an actual conversion/consumption record.
A living bridge
Transport 0.5 carbon through F02 links without a broken link or free resource insertion after the challenge starts.
Leave a refuge
Maintain one grazer and one compatible prey species for 180 s; use shelter or gates to prevent complete prey depletion.
Recover a neighborhood
Bring a chosen region from fewer than 5 active individuals to at least 20 using at most three tool gestures. The starting snapshot and allowed tools define the challenge.

## Collection without grind
Journal stamps unlock visual frames, optional palette themes and display titles only. All organisms and tools stay available in sandbox. Do not add daily streak penalties, random paid organisms, energy refills or real-time waiting. Long-term engagement should come from learning, building and sharing unusual outcomes.
## Future evolution boundary
Automatic mutation remains out of scope. A later separate design may add inherited tradeoffs for noninfectious fictional organisms, but this expansion does not silently change diets, host compatibility, toxin effects or resistance. A saved species profile stays stable for the entire experiment so comparisons remain interpretable.
# 24  Expanded update order and data contract
Keep the 0.10 s fixed timestep and separate simulation worker. This is the authoritative Expanded order. Classic order remains available under its recorded simulation version.
Step
Expanded operation
1  Commands
Apply validated tools, gate changes and schedule commands in sequence. Log exact inputs/exports and establish new object inventories.
2  Environment
Advance cycle phase; update warmth/moisture. Compute canopy from start-of-tick biomass. Transport fields, companion nutrients and permitted organisms; apply gas exchange, decay, resin adsorption and acid/base neutralization.
3  Conversion
Release finite food, dissolve grit and catalyze enzyme reactions from snapshots. Commit products together. New products become available for feeding this tick.
4  Sense and move
Evaluate suitability, update saved metabolic mode and active movement. Resting/held/attached states override locomotion. Rebuild neighborhood index.
5  Contacts
Resolve target claims, handling completions, trap capture, parasite attachment and host-specific infection with deterministic priority. No target can be claimed twice.
6  Intake
Reserve host/trap drains first; compute ordinary requests. Allocate shared food then limiting oxygen/nutrient/silicate; commit once, including all byproducts and bound pools.
7  Maintenance
Pay ordinary and movement costs; advance timers/age; apply damage/healing and phage lysis. Death recycles exact pools, shells, trap reserves and meals; releases live dependents.
8  State and structures
Update dormancy and signal threshold states. Pay secretion/glow costs; emit activity for next tick. Budget film, traps and one simultaneous F02 transport pass.
9  Births
Evaluate eligible divisions; split all owned pools and assign new IDs. Place ordinary daughters or F04 resting daughters; honor caps and compatibility. No newborn acts until the next tick.
10  Publish
Record events, ledgers, lineage and region histories; publish visual/inspector snapshots; honor consistent-tick saves.

## New saved fields
World: enabledModules, manifestVersion, climatePhase, localWarmth, moisture, activities, broth/companionN, freeSilicate, shellGrit, edgeRules, devices, foodObjects and regionMasks. Entity: metabolicMode, dormancyState/timer/lockout, boundSilicate, lineageParentID, handlingTarget/progress, fungalLinks and trap reserve/target/cooldown. Include state-specific timers and activity emitters; never reconstruct them from artwork.
# 25  Performance saves and acceptance
## Performance boundaries
Keep the 6,000-agent cap and 2,000 fungal-segment subcap until measurement supports changing them. All new species share the cap. Limit devices to 256, finite food objects to 128, edge barriers to 512 and observation regions to six. Viral quantities remain fields, not individual scene objects. Display capacity limits as simulation limits, not ecological deaths.
Allocate only enabled activity fields. Use the existing spatial index for sensing/contact and adjacency lists for fungal links. Check active field tiles for reactions; avoid scanning every organism against every device. Keep visual glow, spores and enzymes as aggregated overlays. Measure the same 15-minute Android stress session with the most expensive enabled modules.
## Save compatibility
Copy-on-upgrade from Classic to Expanded assigns zero to new fields, moisture 1 in water/0.8 elsewhere, and fixed light unless the player selects a cycle. Preserve original populations, ledger pools and positions. Tag the converted copy simulationVersion 2. Do not overwrite the Classic file. New shaders or display names cannot change simulation hashes.
Retain the .petri extension for compatibility; Pixelmeba is display branding. Expanded exports include module and content manifests and reject unsupported content explicitly. Increase the 25 MB import limit only after a measured need; preflight dimensions and allocation costs before decoding large arrays.
Acceptance area
Required evidence
Conservation
Food objects, enzymes, F02 transfers, traps, shells, predation and sample moves preserve carbon/nutrient/mineral ledgers to the foundation tolerance.
Isolation
Fine membrane passes no organism or viral units; Small gate rejects larger classes. Directed loops cannot duplicate pools or move them more than one edge per tick.
State machines
No feeding while resting; wake requires energy; no immortal dormancy. Turnleaf never double-feeds. Glow hysteresis prevents one-tick flickering.
Ownership
One host slot per parasite; one held prey per trap; one predator owns a capture. Host death/reproduction and sampling leave no dangling references.
Compatibility
V01/B01 and V02/B02 host lists remain disjoint. Rivalry affects only declared targets. New food compatibility follows explicit lists.
Replay and recovery
Identical build, seed and commands produce identical hashes at 1×/4× and across save/reload. Backgrounding preserves cycle and state timers.
Understanding
A fresh reviewer explains one enzyme chain, a gate barrier, a resting transition and one misleading-looking correlation using the inspector.

# 26  Delivery requirements and references
## What the team should return
Deliver one EXPANSION_RESPONSE.md alongside the build. Include: implemented wave; module and content versions; specification-to-implementation checklist; changed balance values; source/asset locations; fixture outcomes; conservation and ownership results; measured Android performance; save migration behavior; known defects; and decisions that still need the owner. Separate implemented, tested and proposed features.
Designers should provide a 24-organism silhouette sheet, module-specific state animations, material/structure icons, responsive layouts for expanded trays and probes, and a labeled dense-scene mockup. Every effect must map to a real event or state. Developers should supply data files for all entries and eighteen exact experiment fixtures rather than hardcoding demonstration outcomes.
## First review packet
Show three short recordings: Crumbsmith feeding a neighbor through a membrane, a fungal network moving a limited resource, and a resting organism waking after conditions improve. Include the inspector in each recording. These demonstrate the expansion’s purpose more clearly than a tray full of unfinished species icons.
## Biology reference notes
Sources support broad inspiration only. All named organisms, target lists, activities, numerical rates, simplified mineral rules and game chemistry in this volume are fictional design specifications. Dormancy is not universal; bacterial survival structures and reproductive fungal spores are different. Diatom-inspired shells motivate a separate mineral budget. Signaling and resource exchange motivate the neighborhood systems without making the game a research model.
OpenStax How Microbes Grow — Biofilm structure and coordinated communities.https://openstax.org/books/microbiology/pages/9-1-how-microbes-grow
OpenStax Signaling in Single Celled Organisms — Cell signaling and quorum-related behavior.https://openstax.org/books/biology-2e/pages/9-4-signaling-in-single-celled-organisms
OpenStax Prokaryotic Cell Characteristics — Distinction between bacterial endospores and reproductive spores.https://openstax.org/books/microbiology/pages/3-3-unique-characteristics-of-prokaryotic-cells
MBARI Silicon and the Ocean — Silicon use in diatom shells and mineral cycling.https://www.mbari.org/wp-content/static/chemsensor/si/silicon.html
HHMI Symbiotic Bioluminescence — Bioluminescent signaling and symbiosis inspiration.https://www.biointeractive.org/classroom-resources/symbiotic-bioluminescence
Reference pages retrieved September 26 2026. Title clearance and store publishing are separate tasks; this handoff authorizes neither a store submission nor changes to the owner’s existing Pixel Petri game.