# 01  Game direction and scope
# Pixel Petri
Design and build specification
Version 1.0 • September 25 2026 • For the development and design team
Build an offline pixel ecosystem sandbox in which players introduce organisms, food, materials, and environmental changes, then observe and understand the resulting chain reactions. The defining feature is an ecosystem that changes its own habitat and explains those changes through inspection and comparison.
The creative direction is recognizable microscopic biology, fictional species with memorable names, expressive movement, and clean readable controls. Pixel Petri is a working title; no name or trademark clearance is implied.
## Product decisions
Android phones and tablets are the primary target; a desktop browser build supports development and wider access. Support portrait and landscape. The core experience has no account, server, external AI calls, required Internet connection, energy timers, or paid consumable drops. Pricing and distribution are separate owner decisions.
Launch includes 14 organism archetypes, three habitat presets, a functional materials tray, six guided experiments, local saves, snapshots, dish comparison, and exported experiment files. Build this in milestones. The first playable slice is deliberately smaller; it is not the complete launch scope.
## What this simulation represents
This is a designed ecosystem, not a laboratory predictor. Time, sizes, populations, concentrations, and life cycles are compressed. Quantities below are fictional game units. Use broad biological principles and never present the numerical defaults as real species measurements or real chemical guidance.
## Authority and navigation
Sections 5–12 define the simulation contract. Section 12 owns update order; section 7 owns resource accounting. Catalog entries override general defaults only where stated. Numerical defaults are implementable starting values, subject to recorded playtest tuning. Do not silently add random disasters, hidden spawning, or autonomous adaptation.
Pages
Contents
2–4
Player flow, visual direction, assets and sound
5–12
Habitats, materials, metabolism, organisms and simulation order
13–15
Tools, explanation, comparison and experiments
16–18
Architecture, saves, performance and accessibility
19–20
Build gates, acceptance checks and team handoff

# 02  Player journey and screen behavior
## First session
Home offers New Dish, Continue, Experiments, and Field Guide. New Dish opens a preview with habitat, seed, and dish name. The default is Water Garden. Enter paused with the Life tray open. A dismissible five-step tutorial introduces a food patch, Sprinter bacteria, a grazer, the inspector, and Duplicate Dish. Never lock sandbox tools behind the tutorial.
## Main screen
Top bar: dish name, simulation time, pause, speed, and overflow menu. The central viewport contains the dish. Bottom toolbar: Inspect, Life, Food, Chemistry, Habitat, and Tools. A selected category opens a shallow tray with labeled icons; selecting an item shows its purpose, suitable habitats, dose, and brush radius. Only one painting tool is active at a time.
Portrait: reserve approximately the top 12% for controls, the middle 63% for the viewport, and the bottom 25% for the tray. These are layout targets, not fixed pixel heights. Landscape and desktop move the tray to a 280–340 CSS pixel side panel. Honor safe areas and keep the dish visible when inspecting.
## Input contract
One-finger drag paints only when a paint tool is explicitly selected; Inspect mode uses drag to pan and tap to inspect. Two-finger gestures always pan or zoom and never deposit material. Mouse: left click or drag uses the tool, middle drag pans, wheel zooms, and Escape returns to Inspect. A tap near overlapping organisms opens a short candidate list.
Preview the brush footprint and intended dose before release. Painting is distance-sampled in world coordinates; dose depends on covered cells, not frame rate or finger speed. Show incompatible terrain with a crossed brush. Do not charge or inject for rejected placements.
## Time and navigation
Offer pause, one tick, 1×, 2×, and 4×. Opening Field Guide, settings, save/load, or comparison setup pauses the dish and restores its prior state on exit. The inspector and overlays do not pause unless the player chooses it. Going into the background saves and pauses; returning never advances unseen hours.
## Recovery and empty states
A lifeless dish stays usable: explain the leading recorded causes and offer Add Life, Load Snapshot, or New Dish. Reset and deleting a save require confirmation. Undo restores the state immediately before the most recent completed tool gesture, including elapsed ticks since that gesture; label this time rewind clearly. Retain one undo state per active dish.
# 03  Visual design specification
Aim for the fascination of a microscope combined with the clarity of a small pixel garden. The dish should be attractive before any panel is opened. Life supplies the brightest color; interface chrome stays quiet. Do not use cartoon faces, medical gore, realistic pathogens, noisy screen-wide effects, or a grungy laboratory background.
Element
Specification
World rendering
Top-down 2D; circular boundary; 512 × 512 logical art canvas at default framing. Environmental cells are independent of art pixels. Nearest-neighbor texture sampling; no blurred sprite edges.
Background
Deep blue charcoal #14252D outside the dish. Water #D6E7E5; gel #E9E1C8; sediment #8B7661. Keep water transparent enough for deposits and colonies.
Dish rim
Restrained double ring, soft shadow and one small highlight. Rim occupies at most 3% of dish diameter and never hides usable cells.
Organism palette
Sprinter coral #EF7B6C; Velvet teal #32A89A; Dusk violet #8B82C6; Recycler amber #D6A64D; Sunbead green #8CBA4B. Use additional shape and pattern cues for every species.
Interface
Warm white #F5F4EF surfaces, dark #172C35 text, blue #256E9E primary actions. Smooth system sans serif at 16 CSS px default; headings 20–24 px. Pixel text only for optional decorative labels.
Overlays
One environmental overlay at a time, 45% default opacity, labeled low-to-high legend, adjustable opacity. Show organisms above it with clear edges. Infection markers are a separate toggle.
Selection
Thin bracket or ring outside the body, optional tracking line and species label. Selected objects remain visible through overlays; do not change their species color.
Density and zoom
At wide zoom, draw aggregated colony color and texture without altering simulation. At close zoom, reveal individual motion. Viruses use inspection symbols and a density overlay, not true-scale bodies.

## Motion language
Bacteria twitch or glide; amoebas deform slowly; ciliates dart with pauses; rotifers pulse while feeding; worms travel in a restrained wave. Colony boundaries grow unevenly according to nearby resources. Fungal branches follow usable substrate. Visual motion must follow simulated state; idle animation may move internal pixels but cannot imply locomotion through walls.
# 04  Asset production and audio
Create original reusable pixel sprites and modular growth tiles. Use a pixel editor capable of layered sources and atlas export; the exact editor is the artist’s choice. Deliver editable source files, transparent PNG atlases, and a manifest. No image-generation service is required by the build.
Asset group
Required production output
Small organisms
Bacteria, yeast and algae: 16 × 16 source frames, with an 8–12 px visible body. Four movement or idle frames, four reproduction frames, two stress frames and three death frames per species.
Large organisms
Amoeba, ciliate, rotifer, worm and parasite: 32 × 32 frames; worm may use a segmented renderer. Six movement frames, four feeding frames, four reproduction frames, two stress frames and four death frames.
Directions
Four hand-authored headings for elongated organisms; select nearest heading. Symmetric organisms reuse frames. Do not rotate pixel sprites continuously and blur their silhouettes.
Growth structures
Fungus uses 16 connection-mask tiles plus tip, bud and decaying states. Biofilm uses isolated, edge, center and eroding variants with transparent texture. Branches and film match actual occupied cells.
Effects
Deposit ring, short diffusion reveal, eating pulse, division, phage burst and resource particles. Particle effects carry no simulation resources.
Interface assets
24 px icons with 48 px touch containers; selected, disabled and focused states. Category labels remain visible. Organism silhouettes match their Field Guide entries.
Export manifest
Stable asset ID, species ID, frame rectangle, anchor, frame duration and animation name. Two transparent padding pixels around atlas frames. Use lowercase snake_case filenames.

## Animation rules
Locomotion animation follows actual velocity. Feeding and reproduction play only after successful simulation events. Stress displays after three continuous simulated seconds below the suitability threshold, then clears after three seconds recovered. Death is a brief dissolve into organic particles, not an explosion. Cosmetic randomness uses its own seed and cannot affect the simulation.
## Audio rules
Use a quiet ambient loop and restrained interaction sounds: drop, selection, save, discovery and comparison result. No sound per bacterial division. Limit world event cues to four per second and coalesce repeated events. Separate music and effects controls; respect mute and reduced-motion settings. Optional haptics occur only on intentional tool actions, never on background biological events.
## Designer delivery gate
Provide layouts at 360 × 800, 800 × 360 and 1440 × 900 CSS pixels, plus 200% text examples. Include ordinary, dense, empty and stressed dishes. Review species recognition in grayscale and each major color-vision deficiency mode before final atlas production.
# 05  Habitats and environmental fields
Use a 128 × 128 simulation grid with a circular playable mask centered at (63.5,63.5), radius 60 cells. Each cell has a habitat type, passability, attachment capacity and local scalar fields. Outside the mask is solid. The world has no wraparound. Water, gel and sediment are abstract shallow habitats; this is not a fluid-depth simulation.
Preset
Starting state and behavior
Water Garden
All water; stone circles centered at (42,45) and (83,82), radius 9 cells, occupying about 5% of area. Light 0.8, warmth 0.5, oxygen 0.8 and CO2 0.5 per cell; nutrient 0.10; sugar 0.02. Suitable for swimmers, algae and surface colonies.
Gel Colony
Gel with a vertical water channel at x = 59–68 (about 10% of area); no stones initially. Light 0.5, warmth 0.5, oxygen 0.8, CO2 0.5; nutrient 0.10 and sugar 0.10. Swimmers are confined to channels; fungus and colonies spread on gel.
Sediment Edge
Water where y < 64, sediment below; stone circle at (45,43), radius 13 cells. Light 0.8 above and 0.15 in sediment; warmth 0.5; oxygen 0.8 above and 0.2 below; CO2 0.5, nutrient 0.10, detritus 0.10 in sediment.

All unspecified resource quantities, inhibitors, salinity and acid/base amounts start at zero. Initial pH display is 7. Habitat quantities are per playable cell, not a total dish dose. Initial populations are zero unless a tutorial or experiment explicitly seeds them.
## Fields and boundaries
Track sugar, polymer food, lipid food, protein food, detritus, metabolite, nutrient, oxygen, CO2, acid equivalent, base equivalent, buffer amount, salt and three inhibitors. Light and warmth are 0–1 environmental settings; local shade modifies light. Resource fields are nonnegative quantities, not colors or spawn probabilities.
Dissolved fields diffuse by a conservative four-neighbor flux. Default coefficient per tick: 0.10 in water, 0.025 in gel, 0.01 in sediment. Use the lower coefficient across habitat boundaries; no flux through stone or walls. Polymer, lipid, protein and detritus deposits remain stationary until consumed or sampled. Biofilm halves dissolved transport across its occupied cell edges.
Open lid is default. Every tick, exposed non-wall cells exchange oxygen and CO2 toward 0.8 and 0.5 at 0.02 of the difference. Sediment exchange is multiplied by 0.1. Closed lid sets external exchange to zero. Log all exchanged gas in the resource ledger. Light enters either lid state.
## Environmental controls
Warmth is uniform per dish; local heaters, liquid currents, evaporation and changing water depth are deferred. Shade is a paintable local mask. Habitat paint replaces substrate properties without deleting life or resources; newly unsuitable life responds through the normal stress rules.
# 06  Material catalog and chemistry
Materials are fictional game substances with explicit effects. Do not implement a general chemistry engine or imply that any named real disinfectant follows these rules. A material card states its target, limitations, and whether it moves through the dish.
Tray item
Defined effect
Sugar / starch / oil / protein
Add the corresponding carbon-food field. Sugar diffuses; the other three are stationary deposits. Diet compatibility determines which organism can use each.
Organic debris
Adds detritus carbon plus 0.10 bound nutrient per carbon unit. This is reusable dead material, not a spontaneous source of organisms.
Mineral nutrients
Adds free nutrient. Supports biomass synthesis but supplies no energy or carbon; excess alone cannot create growth.
Metabolite
A fictional dissolved organic byproduct used by Crossfeeder. Other species ignore it. Never label it as one specific real chemical.
Oxygen / CO2
Adds the selected dissolved gas. Oxygen helps oxygen-dependent metabolism; CO2 supports photosynthesis. Neither acts as a universal food.
Acidifier / alkalizer / buffer
Adds acid equivalent, base equivalent or buffer capacity. Equal acid and base equivalents neutralize each tick. Buffer softens the pH response without generating food.
Salt
Raises local salinity and diffuses; no automatic decay. Its effect depends on species tolerance. Removal requires sampling or dilution through replacement.
Bacterial inhibitor
Targets B01–B05 metabolism and health. Biofilm reduces effective exposure to half. Does not affect viruses, algae, fungi or animals.
Fungal inhibitor
Targets Y01 and F01. Photosynthetic inhibitor targets A01 only. These are abstract mechanics, not real-product efficacy claims.
Stone / wall / porous bead
Stone and wall block movement and transport. Stone edges and porous beads provide attachment. Porous beads pass solutes but block swimmers; no guaranteed refuge from all threats.
Water / gel / sediment / shade
Paints habitat type or local shade. Does not erase contents. Erase Structure removes a structure only; Sample removes selected contents.

Display pH = clamp(7 + (base − acid)/(1 + buffer), 2, 12). This is an explicitly simplified acidity index, not a chemical pH calculation. Salinity index = salt quantity; evaluate tolerances on that index. Do not clamp stored resource amounts to display ranges.
Each inhibitor loses 0.2% of its amount per tick. It is an abstract non-carbon field. Default dose choices add 0.02, 0.10 or 0.50 units per painted cell; chemistry defaults to 0.10. No mixing action creates an unspecified reaction. Field Guide must say “No additional modeled reaction” when relevant.
# 07  Resource and life cycle contract
All quantities are game units. Every living agent stores biomass B, bound nutrient N, energy E, health H and age. Default food drops contain carbon only; detritus and stored meals carry their own bound nutrient. New external inoculations start at species B0, N = 0.10 × B0, E = 50 and H = 100. Energy and health range from 0 to 100. Biomass represents modeled organic carbon; energy is an abstract activity budget, not another conserved material.
## Feeding and growth
Requested intake per simulated second is Q × suitability × EatableAvailabilityFactor. EatableAvailabilityFactor is amount/(amount + 0.10). Multiply by the fixed timestep. Select one compatible resource using the priority list; do not eat every field at full rate. Reserve the nutrient deficit after crediting nutrient bound in the selected food; release any surplus to the local free pool at commit. Allocation cannot exceed food, nutrient or oxygen available.
Bubble additionally emits 0.20 acid equivalent per consumed carbon unit. Ordinary feeding converts each consumed carbon unit into 0.50 biomass, 0.30 CO2 and 0.20 metabolite; it requires 0.05 total nutrient and grants 30 energy. Aerobic feeding consumes 0.30 oxygen per carbon. Dusk and Bubble use the same carbon split, require no oxygen, and gain only 18 energy. Photosynthesis consumes CO2 instead of food, converts 0.50 to biomass and 0.50 to sugar, requires 0.05 nutrient, produces 0.50 oxygen, and gains 30 energy. Scale photosynthetic intake by local light.
Detritus and prey supply proportional bound nutrient as they are consumed; use it for growth before taking free nutrient. A prey kill transfers its complete B and N into the predator’s stored meal, capped at 2 × predator B0 carbon; overflow becomes local detritus. Consume the stored meal over later intake steps at Q. Held meals do not decay, but return to detritus on predator death. Prey energy is discarded.
## Maintenance and mortality
Drain energy by species maintenance M per second, plus 0.20 per world-cell distance moved. At E = 0, health falls 4 per second. Suitability below 0.10 causes another 2 health damage per second. Effective inhibitor exposure adds 8 × exposure health damage per second. At E above 20 and suitability above 0.5, regain 1 health per second unless infected. Death at H ≤ 0 or maximum age converts all remaining B and N into local detritus and releases attached parasites.
## Reproduction and budgets
At B ≥ 2 × B0, E ≥ 60, H ≥ 50 and age ≥ minimum division age, split B and N equally, spend 20 total energy, and divide the remaining energy equally. Both offspring retain health; both ages reset. Place daughters within one compatible neighboring cell; blocked placement defers division without cost. Split stored meals proportionally. Apply the same biomass budget to fungal branching and animal offspring. No free biomass appears on birth. Viruses use section 10 instead.
Track carbon in life, stored meals, biofilm, foods, metabolites, detritus, CO2, viruses, exports and atmospheric exchanges. Track free and bound nutrients similarly. External drops and inoculations are explicit ledger inputs. Internal conversions must reconcile within numeric tolerance. This ledger is mandatory debugging infrastructure, not a player-facing accounting screen.
# 08  Suitability movement and interaction
## Environmental suitability
For each tolerance range [a,b], response is 1 within the range and falls linearly to 0 outside it over a shoulder width. Shoulder widths: pH 1.0; warmth 0.15; salinity 0.20. Combined suitability is the minimum of the three responses, multiplied by habitat compatibility and inhibitor growth factor 1/(1 + effective exposure). Use actual stored salinity even above 1. Oxygen availability limits aerobic intake directly, not movement by an invisible global rule.
Dusk additionally multiplies suitability by clamp(1 − oxygen/0.40, 0, 1). Sunbead photosynthesis additionally scales intake by local light. No movement or predation bonus comes from a species name. “Stressed” is an explained state, not a random debuff.
## Locomotion
Each motile agent samples its current cell and eight surrounding cells up to its sensing radius. Score candidates by compatible food or prey abundance, environmental suitability and occupancy penalty. Normalize each input to 0–1; score = 0.5 food + 0.4 suitability − 0.1 crowding. Choose the highest score; break ties with deterministic per-agent randomness. If all scores are equal, wander using a seeded direction held for one simulated second.
Move at profile speed through compatible passable habitat. Prevent tunneling through walls by tracing crossed cells. Microbes can share a cell; soft capacity is eight biomass equivalents per cell, measured as the sum of each resident’s B/B0. Over capacity, block births and halve intake requests until density falls; do not delete agents. Attached species occupy surfaces and do not swim.
## Feeding and predation
Field feeders draw from their occupied cell. Predators search within one cell and pursue compatible prey within their sensing radius. Attack requires contact, a ready cooldown, E below 80, a stored meal below 0.5 × B0 and a valid prey ID. One successful attack kills one prey. Multiple attackers resolve by deterministic tick-based priority; only the winner receives the meal and starts its cooldown. A predator retains its meal within the storage limit in section 7 and stops hunting while sufficiently fed.
Velvet agents attach on gel, sediment, stone edges or beads. After ten seconds with E above 40, deposit biofilm by transferring 0.05 biomass and its bound nutrient per second into film, stopping at 0.50 film carbon per cell or B = B0. Film reduces bacterial-inhibitor exposure and local dissolved transport by half. Recycler and Threadlace can eat film as detritus. Film loses 0.1% of its carbon and bound nutrient per second into detritus.
## Cross feeding and fungus
Crossfeeder consumes the metabolite that ordinary feeding produces. Threadlace remains attached and creates a daughter on a free neighboring compatible cell through the normal reproduction budget. Rank locations by usable food and suitability. Connect parent and daughter visually; there is no hidden network-wide resource sharing in version 1.
# 09  Bacteria fungi and algae catalog
Stable IDs below are saved in files and used by the inspector, assets and data definitions. Every species is fictional. Food priority is listed left to right. Launch includes every row; the first slice includes only the six organisms listed in section 19.
ID and name
Role and compatibility
Visible behavior
B01 Sprinter
Aerobic bacterium. Eats sugar. Water, gel or sediment. Fast growth; prey for Amoeba, Ciliate and Siltworm. Host for Pinphage.
Coral rod with a pale middle band. Short glides, quick binary division and irregular spreading patches.
B02 Velvet
Aerobic attached bacterium. Eats sugar, then protein. Requires a surface. Produces budgeted biofilm. Prey for Amoeba and Siltworm.
Teal paired dots in dense textured colonies. Visible film follows occupied cells.
B03 Dusk
Low-oxygen bacterium. Eats sugar. Water, gel or sediment; growth suppressed by oxygen. Prey for Amoeba, Ciliate and Siltworm.
Violet curved rod. Slow drift; colonies cluster in low-oxygen regions.
B04 Recycler
Aerobic decomposer. Eats detritus, protein, starch, then oil. Water, gel or sediment. Can digest film. Same grazer compatibility as Sprinter.
Amber bead chain. Settles near debris; nearby particles shrink as they are consumed.
B05 Crossfeeder
Aerobic bacterium. Eats metabolite only. Water, gel or sediment. Same grazer compatibility as Sprinter.
Blue comma with a contrasting tip. Trails metabolite gradients behind other colonies.
Y01 Bubble
Yeast-like organism. Eats sugar; oxygen-independent low-yield feeding. Water or gel. Prey for Amoeba and Rotifer.
Cream oval with a burgundy bud. Daughter bud grows only as biomass accumulates.
F01 Threadlace
Attached fungus. Eats detritus, starch, then protein; can digest film. Gel, sediment or bead. Aerobic; branching follows section 8.
Warm ivory branching network, dark outline and orange growing tips. No background decorative branches.
A01 Sunbead
Photosynthetic alga. Uses CO2, nutrient and light. Water only. Prey for Amoeba, Ciliate and Rotifer. Host for Hitcher.
Green disk with a gold center. Internal pixels pulse gently; division pinches into two beads.

## Population meaning
One simulation agent is a representative organism, not a counted real cell. The UI reports “simulated individuals” and biomass, not laboratory cell concentration. Fungal population reports connected components and segment count separately. Count a phage field in “viral units,” not as animated particles.
# 10  Consumers parasites and viruses
ID and name
Behavior and restrictions
P01 Amoeba
Water grazer; compatible prey B01–B05, Y01 and A01. Sense radius 3 cells; speed 0.6 cells/s; contact feeding cooldown 3 s. Soft irregular silhouette with two visible lobes.
P02 Ciliate
Water swimmer; prey B01, B03, B04, B05 and A01. Radius 5; speed 2.0; cooldown 2 s. Slender cyan body with short white cilia. Does not eat attached Velvet.
P03 Rotifer
Water filter-feeder abstraction; prey A01 and Y01. Radius 3; speed 0.7; cooldown 4 s. Peach body with a visible feeding crown. No real microscopic fluid simulation.
P04 Siltworm
Sediment grazer; prey B01–B05. Radius 4; speed 0.8; cooldown 3 s. Brown segmented body with a pale head. Can cross water gaps up to two cells; otherwise turns back.
X01 Hitcher
Fictional water-dwelling single-celled parasite; attaches only to A01 at contact. Free speed 0.4, sense radius 3; one parasite per host. Gold diamond outline distinguishes attachment from infection.
V01 Pinphage
Host-specific bacteriophage abstraction; susceptible host B01 only. Stored as a nonnegative viral-unit field, diffusing with water/gel/sediment coefficients. Inspection icon is a blue head-and-tail symbol.

## Hitcher contract
Free Hitcher cannot feed and spends maintenance energy. On attachment, drain host biomass at 0.02 carbon/s, capped to avoid taking more than the host has. Transfer its proportional bound nutrient. Half becomes parasite biomass, 0.30 becomes CO2 and 0.20 metabolite; return unused bound nutrient to the cell. Gain 30 energy per drained carbon. A host below 0.25 × its B0 dies through normal recycling. Attached parasite movement follows the host; no additional movement cost. A dividing parasite releases its offspring to seek another host. Host division leaves it on one deterministically chosen daughter.
## Pinphage contract
Each susceptible host has infection probability 1 − exp(−0.05 × local viral units × timestep). Use a deterministic random draw per host and tick. Infection consumes one viral unit and transfers its 0.01 carbon to the host; fewer than one unit cannot infect. One infection per host. Infected hosts feed but cannot divide or heal. After 20 simulated seconds, lysis converts up to 40% of host biomass into whole viral units at 0.01 carbon each; remaining biomass and all bound nutrient become detritus. Host disappears.
Unattached viral units decay at 1% per simulated second into detritus carbon, with no nutrient release. No compatible hosts means no replication. Infection symbols appear only on inspected hosts or with the infection overlay enabled. Phage units share the same ledger as other modeled carbon.
# 11  Starting balance values
These values form one versioned content pack. Time means simulated seconds, not biological time. Developers may tune them after the acceptance checks pass, recording changes and updating fixture expectations. Do not silently change rules to make one showcase scenario work.
Profile
B0
Q per s
M per s
Min age
Max age
B01 Sprinter
1
0.18
0.50
12
600
B02 Velvet
1
0.12
0.35
20
900
B03 Dusk
1
0.12
0.35
20
800
B04 Recycler
1
0.14
0.40
18
800
B05 Crossfeeder
1
0.14
0.40
18
800
Y01 Bubble
2
0.22
0.40
25
900
F01 Threadlace
2
0.20
0.40
30
1200
A01 Sunbead
1.5
0.16
0.40
25
900
P01 Amoeba
4
0.60
0.80
50
1200
P02 Ciliate
3
0.65
1.00
40
1000
P03 Rotifer
8
1.00
1.10
70
1400
P04 Siltworm
8
0.90
1.00
70
1400
X01 Hitcher
0.2
0.02 drain
0.15
30
300

Q is maximum intake before availability and suitability factors. Predator Q caps assimilation from the stored meal per second; storage prevents repeated wasteful kills. Hitcher uses its special transfer rule and does not need ambient nutrient for that transfer. Viral timing is in section 10.
Group
pH preferred
Warmth preferred
Salinity preferred
Default organisms
6–8
0.35–0.65
0–0.20
B03 Dusk
5.5–7.5
0.35–0.70
0–0.25
Y01 Bubble and F01 Threadlace
4.5–7
0.30–0.65
0–0.25
A01 Sunbead
6.5–8.5
0.30–0.65
0–0.15

B01, B03, B04 and B05 move at 0.25 cells/s with sensing radius 2. Y01 and A01 do not self-propel; B02 and F01 are attached. Movement for consumers and Hitcher is specified on page 10. Static cells do not need simulated Brownian motion; cosmetic wobble must not cross cell boundaries.
# 12  Canonical simulation update order
Use a fixed 0.10 s tick. The renderer never owns biological state. Resolve each step completely before the next. Use double-buffered fields for transport and shared-resource allocation. Every input is stamped with a target tick and stable command sequence number.
Step
Required operation
1  Commands
Apply queued deposits, samples, habitat changes and settings in command order. Validate capacity and bounds; record external resource inputs and outputs. Inoculations take effect this tick.
2  Transport
Diffuse dissolved fields and viruses conservatively; apply gas exchange, inhibitor decay, viral decay and acid/base neutralization. Update derived pH, shade and warmth values.
3  Sense and move
Read the new environment, compute suitability and move existing agents. Rebuild the spatial index. Movement cannot depend on rendering order.
4  Contact events
Resolve predation, parasite attachment and phage infection using pre-event candidates. Priority comes from a seeded hash of tick, action kind and agent ID. Reject invalidated targets; never award one prey twice.
5  Intake and transfer
Reserve parasite drains first. Gather ordinary feeding requests and limiting nutrient/oxygen demands. Allocate shared pools proportionally, compute the common limiting fraction, and commit conversions together. Unused reservations are returned; no second allocation pass this tick.
6  Maintenance
Pay energy costs, advance ages and infection timers, apply stress/inhibitor damage and eligible healing. Apply infection lysis before ordinary death when both are due.
7  Death and recycling
Remove dead agents once; return their exact remaining carbon and nutrient. Release parasites. An agent eaten earlier cannot also produce a second corpse.
8  Growth structures and births
Budget film deposition and film decay. Queue valid divisions/branches; select birth positions by deterministic priority. Apply entity caps and space constraints. Newborns first act next tick.
9  Record and publish
Update ledgers, diagnostics, causal events and summaries. Sample history each simulated second; publish a render snapshot when due. Persist counters and random state on save.

## Precision and determinism
Use Float64 for authoritative quantities and stable traversal order. Keep per-agent random streams or deterministic hashes separate from cosmetic randomness. Same build, same saved state and same commands must produce matching state hashes. Cross-version and cross-engine bit-identical replay is not promised; exported snapshots are authoritative.
Transport flux from a cell may not exceed its available amount; scale outbound fluxes together when necessary. Reject NaN, infinity and negative values at content import. Numerical roundoff below 0.00000001 may be zeroed and logged. Never hide a large negative pool with a clamp.
# 13  Tools doses and editing rules
Tool
Functional contract
Inoculate
Small/medium/large adds 1/5/20 agents across eligible cells. Default 5. Require habitat compatibility and attachment where relevant. Report accepted count if space or cap limits the dose. Phage doses add 1/5/20 viral units per cell instead.
Material brush
Radius 1/3/6 grid cells; default 3. Dose 0.02/0.10/0.50 per affected cell. One stroke applies once to each covered cell; a new stroke may add more. Deterministic footprint and interpolation at no more than one cell between samples.
Habitat brush
Same radius controls. Water, gel or sediment changes the substrate. Shade paints a light multiplier of 0.1 or erases to 1.0. Avoid placing new solid structures over live agents; preview and skip occupied cells.
Structures
Place stone, impermeable wall or porous bead. Wall cannot cross the outer rim or overlap a live agent. Removing a structure restores its previous substrate; it never silently removes resources.
Sample
Choose Life, Dissolved, Deposits or All. Radius 1/3/6. Removes the selected contents of covered cells into one sample slot. Complete agents are transferred, including infection/attachment state. Life includes viral units and whole host–parasite pairs. Deposits include film and bound nutrient; All excludes structures. Replacing a held sample requires confirmation.
Transfer sample
Deposit sampled fields by cell offset at a valid destination. Validate all occupied target cells first; reject the whole transfer if it cannot fit. It is a move, not a copy. Moving between dishes logs source export and destination input.
Clean water replacement
Removes the chosen fraction, 25/50/100%, of dissolved non-gas fields in the footprint and restores oxygen/CO2 to preset baseline there. Leaves life and deposits. Log all removed and added quantities; this is the explicit dilution tool.
Snapshot / duplicate
Snapshot stores the current complete state; Duplicate makes a new named dish from it. No automatic cloud upload. Preserve original and duplicate independently.
Inspect / overlays
Tap a cell, organism or colony. Switch between individual and cell details. Overlays never modify simulation or consume resources.

## Paused editing
Allow composition while paused: execute tool commands as ordered edit transactions at the current tick without advancing biological time. Recompute derived fields and diagnostics after each transaction. Save both tick and command sequence so edits do not disappear from history. Single Step advances one biological tick after pending edits commit.
# 14  Explanation comparison and field guide
## Inspector contents
Individual: name, biological category, current action, health, energy, biomass, age, habitat suitability, food, infection/parasite status, and up to three measured limiting factors. Cell: substrate, resource quantities, pH index, salinity, oxygen, light, residents and recent deposits. Colony view aggregates one species within a contiguous occupied region.
Compute explanations from actual intake reductions and recorded events. Example: “Growth limited by mineral nutrients: 18% of requested growth supplied.” If two constraints tie within 5%, show both. Death records keep the final health changes and mark concurrent contributors; never assign certainty to one cause when several acted together.
## Events and history
Record births, deaths by mechanism, consumption, infection, lysis, attachment, environmental stress and tool commands. Show a concise event feed, coalescing repeated events by species and cause over five simulated seconds. Keep the last 500 detailed events and a rolling 30-minute history sampled each simulated second; older history becomes one-minute summaries up to six simulated hours.
Charts include living biomass by species, individual count, oxygen, nutrient and deaths. Use units and species patterns as well as color. Mark player interventions on the timeline. A chart shows an association unless a direct event record supports a causal statement.
## Compare dishes
Duplicate freezes an exact baseline and creates branch B. On phones, toggle A/B with a synchronized camera; on large screens show both viewports. Compare uses two paused baselines and a queued intervention on B, then advances both by the same tick count. Run 60/180/600 simulated seconds or until Stop. The comparison scheduler may run sequentially to control memory, but it must not give one branch more simulated time.
Results report final biomass, diversity as number of surviving species, oxygen and deaths, plus absolute differences. Preserve the seed and baseline. Once branches diverge, random events can diverge too; label this “one paired simulation,” not proof of a biological effect. Replay with other seeds is an optional player action.
## Discovery and knowledge
The Field Guide lists all tools and species immediately. Entries contain shape, diet, habitat, preferred conditions, predators, hosts, products and one example interaction. A local journal records observed relationships such as “Recycler consumed debris.” Discovery badges are cosmetic; they unlock no food or survival advantage. Entries distinguish general biology from invented game rules.
# 15  Experiments and replay value
Sandbox is fully unlocked from the start. Guided experiments are short optional setups with an objective, hint and observed outcome. They teach reading the ecosystem; failure never deletes a save. Fixtures use seeds 101–106 in listed order. Coordinates below are grid cells. Seed organisms in the named radius-6 patch using deterministic eligible-cell placement; scatter uniformly, never on solid terrain. Run each from tick zero and commit its setup data.
Experiment
Setup and success evidence
Food trail
Water Garden. Place 30 B01 at (36,64); trail spans x = 36–80, y = 61–67, adding 0.50 sugar and 0.20 nutrient per trail cell. Follow one group. Complete when its total biomass grows by 25% and the inspector identifies food use.
Light and life
Two identical Water Garden branches with 30 A01 at (50,70); add nutrient 0.20 in their patch. Shade B to 0.1 light. Compare 180 s. Complete after viewing the different photosynthetic intake totals; do not require a predetermined population ratio.
Cleaning crew
At (50,70), place 10 B04 and distribute 10 detritus carbon with 1 bound nutrient across the patch. Complete after at least 2 detritus carbon is consumed and the player opens the resource history.
A hidden neighborhood
At (50,70), seed 20 B01 and 20 B03 in closed Water Garden; add sugar 0.50 and nutrient 0.20 per patch cell. Show oxygen overlay. Complete when the player inspects both species and sees their different oxygen-related limitations. Fixture must be tuned to create local contrast.
One compatible host
At (35,64) seed 30 B01; at (90,64) seed 30 B05. Add sugar/metabolite 0.50 respectively, nutrient 0.20 and V01 5 units per patch cell. Complete after observing B01 infection and confirming zero B05 infections. Explain host specificity.
Predator balance
At (50,70), seed 100 B01 with sugar 0.50 and nutrient 0.20 per cell. Duplicate; add 5 P01 there only to B. Compare 180 s. Complete after reading consumption and prey history, whether grazing stabilizes the population or overconsumes it.

## Longer play
Replay comes from spatial design, different communities, resource limits, host relationships and comparison. Provide three optional prompts after the tutorial: sustain three species, grow a branching colony around a barrier, and rescue a stressed dish. These are invitations, not claims that every random setup can become stable.
## Scope boundary
Version 1 excludes multiplayer, procedural species mutation, gene editing, real disease scenarios, bloodstream simulations, an entire periodic table, realistic fluid dynamics, cross-dish automatic pipes and an online community gallery. Preserve extensible data structures, but do not build these systems in advance. Additions require their own design and performance case.
# 16  Engineering architecture and data
Default stack: TypeScript simulation, PixiJS 8 rendering, HTML/CSS interface, Vite build tooling, and Capacitor for Android packaging. Pin compatible dependency versions at project creation. If the team has an existing engine that already meets these requirements, propose the substitution before implementing; do not port an unrelated game blindly. Sources 1–3 describe the chosen platform capabilities.
Module
Responsibility and boundary
sim/core
Fixed tick, resource allocation, entities, contact resolution, field transport and seeded randomness. No DOM, renderer or network access.
sim/content
Versioned species, materials, habitats and scenario definitions; validated schemas and stable IDs. Unknown IDs are errors, never silently replaced.
sim/worker
Owns active simulation state. Accepts commands; returns snapshots, inspector data, histories and saves. Main thread never mutates authoritative arrays.
render
PixiJS scene, sprite atlas, colony aggregation, overlay textures and camera. Cosmetic state cannot alter simulation.
ui
Tool state, accessible panels, input gestures, settings, guide, comparison and charts. Uses commands and read-only views.
persistence
IndexedDB for browser; tested durable adapter for Android. Version migration, checksums, atomic saves, exports and recovery.
diagnostics
Headless fixtures, state hashing, ledger assertions, population pressure and performance counters. Shipped diagnostic display is opt-in.

## Required data fields
Species: id, contentVersion, name, category, B0, intakeRate, maintenanceRate, preferredRanges, habitats, attachmentRule, foodPriority, metabolism, preyIDs, hostIDs, movement, sensingRadius, attackCooldown, reproduction, maximumAge, inhibitorTarget, assetID and guideText. Special behaviors reference named modules, not arbitrary executable code in imported files.
Material: id, field or structure target, units, defaultDose, transportClass, decay, effectModule, iconID and guideText. Entity: stable id, speciesID, position, B, N, storedMealCarbon, storedMealNutrient, E, H, age, nextActionTick, host/parasite references, infection timer and RNG state. World: grid mask, substrates, fields, structures, film, entities, nextEntityID, tick, commandSequence, settings, seed and ledgers.
## Worker protocol
Messages carry requestID, dishID and protocolVersion. Commands carry sequence and target tick. Snapshot packets carry tick and state generation; discard stale packets. Publish visual snapshots up to 10 times/s; renderer interpolates movement only. Use transferable buffers with a pool; never detach authoritative arrays. Errors pause the dish and preserve the last valid save.
# 17  Saving exporting and connectivity
## Save contract
Save the entire authoritative world, current command sequence, random state, sample slot, camera, histories, discovery journal, simulation version and content version. A seed alone cannot restore a modified dish. Save snapshot schema separately from the application version.
Maintain ten named local slots, one rolling autosave and the most recent valid predecessor for each slot. Autosave every 30 real seconds while a dish is active and after backgrounding, comparison completion or a manual save. Save through a transaction: serialize a consistent tick, validate and checksum, write the new record, then replace the active pointer. A failed write cannot delete the previous version.
## Export and import
Export one .petri file containing UTF-8 JSON with schemaVersion, simulationVersion, contentVersion, metadata, full state and SHA-256 checksum of the canonical state payload. JSON is intentionally inspectable. Arrays may use lossless encoded binary strings if documented. Maximum accepted file size is 25 MB; validate before allocating the full simulation.
Import checks dimensions, entity limits, known IDs, finite values, nonnegative pools, reference integrity and checksum. Reject malformed files with a clear message. Newer unsupported versions offer an explanatory error; older supported versions migrate into a new save while keeping the original. Imported content cannot execute code, load arbitrary external URLs or overwrite a slot without confirmation.
## Sharing and Internet use
Version 1 sharing means exporting the .petri file or a screenshot through the device share sheet. Importing that file recreates the snapshot on a compatible build. It is asynchronous sharing, not live multiplayer. Do not implement cloud accounts, social feeds, leaderboards, automated uploads or analytics by default.
A screenshot can include an optional unobtrusive title, simulation time and species legend. Offer Hide Labels for clean artwork. Export is user-initiated and includes no device identity. Name fields are plain text, length-limited to 60 characters and escaped wherever displayed.
## Pause and time integrity
No offline growth occurs while closed or suspended. Continue restores the exact saved moment, paused, with a Resume button. A save created during 4× returns paused at the stored tick, not at inferred wall-clock time. Device clock changes cannot alter biological age.
## Comparison persistence
Store the baseline once and branch snapshots separately. Deleting a comparison does not delete a named original dish. Export either branch as an ordinary standalone file; include optional comparison metadata without requiring the other branch to load it.
# 18  Performance accessibility and quality
## Performance budgets
Initial target: 128 × 128 field grid, 6,000 live agents, up to 2,000 fungal segments within that count, 30 rendered frames/s on a representative midrange Android phone, and 60 frames/s on a capable desktop. These are engineering targets, not measured results. Nominate and record the actual minimum test device before final content production.
Keep the 1× tick budget below 10 ms at the target population on that device and touch feedback below 100 ms at the 95th percentile. Profile a 15-minute dense session for heat, memory growth and input responsiveness. Comparison may halve render frequency but must preserve simulation rules.
At the global entity cap, reject inoculations and defer births without spending reproductive resources. Show “Simulation capacity reached” separately from ecological crowding. Do not kill organisms to improve frame rate. Reduce cosmetic particles, render aggregation detail and overlay refresh first. If tick processing falls behind, slow displayed effective speed and report it; do not skip biological ticks or silently change timestep.
## Accessibility
Minimum touch target 48 × 48 CSS pixels. Text defaults to 16 px, scales to 200%, and reflows without hiding primary controls. Text contrast target is at least 4.5:1; essential graphical controls at least 3:1. Verify final palette pairs, especially overlays. Species use silhouettes/patterns in addition to color.
Provide keyboard navigation, visible focus, semantic HTML controls and screen-reader labels for panels, inspector values and charts. Canvas life is summarized through an accessible species list and selected-cell description; do not claim the entire moving canvas is intrinsically accessible. Include reduced motion, sound controls, optional haptics and a simplified overlay palette.
## Meaningful verification
Automate accounting, deterministic replay, host compatibility, resource competition, save recovery and import validation. Use integration fixtures for ecological chains. Do not spend time testing cosmetic implementation details with brittle screenshot assertions. Manually inspect the three target layouts, pinch/paint conflicts, dense selection, empty states and Android suspension.
## Content quality
All inspector reasons must be traceable to a calculation or event. No unseeded random catastrophe, universal killer chemical, spontaneous organism appearance or invisible food refill. In low-resource dishes, decline is acceptable and explainable. There is no requirement that every population survive forever.
# 19  Build milestones and acceptance gates
Milestone
Required result before proceeding
1  Simulation foundation
Headless grid, resource ledger, fixed tick, deterministic commands, B01/B03/B04/A01/P01/V01 and Water Garden. One fixture demonstrates growth, grazing, death, recycling and host-specific infection.
2  Playable slice
Dish renderer, basic sprites, inoculate/food tools, inspector, oxygen overlay, pause/speed, save/load and duplicate. Owner can explain a population change after using the inspector.
3  Launch ecology
All 14 archetypes, three habitats, complete materials, film, branching, parasite, sampling, chemistry and structures. Every catalog relationship has a data-backed fixture.
4  Experiments and polish
Six experiments, comparison results, guide/journal, final assets, audio, accessibility, exports/imports and responsive layouts.
5  Android readiness
Measured budgets, suspend/recovery checks, offline launch, release packaging and platform requirements verified against current official guidance. Owner reviews the build before any store submission.

Acceptance check
Pass condition
Resource accounting
Closed-lid, no-input fixture over 10,000 ticks has carbon and nutrient error below 0.001% of initial totals; any roundoff is logged. Include feeding, predation, parasites, film and phage lysis.
No free growth
Zero compatible food/CO2 or zero required nutrient prevents new biomass; energy and health follow specified decline. Birth splits existing budgets.
Fair shared food
Identical agents sharing a cell receive equal proportional allocation within numeric tolerance; insertion order does not decide the winner.
Host specificity
V01 never infects B02–B05, algae or animals. X01 attaches only to A01. No host means no viral multiplication.
Deterministic state
Same saved baseline and commands produce matching hashes at 1× and 4× in the same build; reload at a midpoint reproduces the uninterrupted endpoint.
Transport and obstacles
A pulse spreads without creating quantity; walls block transport and motion; sampling and replacement correctly reconcile exports and inputs.
Recovery and usability
Interrupted save restores the preceding valid state; malformed import changes nothing. Multi-touch never paints. All controls remain usable at supported sizes and text scaling.

# 20  Team deliverables and reference notes
## Development handoff
Return a runnable browser build and Android test package, source repository, pinned dependencies, setup instructions, content schema and data files, asset manifest, save-format documentation, and a concise acceptance report with device measurements. Include the six experiment fixtures and the commands needed to run meaningful checks.
## Design handoff
Return responsive screens and component states, species silhouette sheet, final palette with contrast results, editable pixel sources, exported atlases, animation timing, icon set, audio source/license record and a brief guide for adding a new organism. Asset IDs must match the content pack.
## Required review checkpoints
Show the owner the playable slice before producing the complete asset catalog. Review the inspector with someone who did not implement it: they should be able to identify what changed, why it changed and one plausible next experiment. At launch-content review, show a quiet dish, a dense dish, a collapse and a recovery. Record rule changes in the specification and content version together.
## One document back from the team
Provide BUILD_RESPONSE.md with: architecture chosen and any substitutions; completed milestone; implementation map to this specification; screenshots; test results and device budgets; balance changes; known defects; save compatibility; and specific owner decisions required. Identify omissions directly. Do not label an unimplemented catalog entry as complete because its icon exists.
## References and use limits
The resources below support platform capabilities and broad biological concepts. All named species, rates, chemistry indices, resource conversions and scenario objectives in this document are original game design choices, not values supplied by these references. Retrieved September 25–26 2026.
1  PixiJS sprite documentation — Sprite rendering and texture-based visual objects.https://pixijs.com/8.x/guides/components/scene-objects/sprite
2  Capacitor documentation — Web-first application packaging and native platform access.https://capacitorjs.com/docs
3  MDN Using Web Workers — Background execution and message-based worker communication.https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
4  OpenStax How Microbes Grow — Growth limits and biofilm context.https://openstax.org/books/microbiology/pages/9-1-how-microbes-grow
5  OpenStax Oxygen Requirements — Different oxygen requirements among microorganisms.https://openstax.org/books/microbiology/pages/9-2-oxygen-requirements-for-microbial-growth
6  HHMI BioInteractive Virus Explorer — Viral diversity, host range and replication concepts.https://www.biointeractive.org/classroom-resources/virus-explorer