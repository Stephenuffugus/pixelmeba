# 01  Purpose and production decision
# Pixelmeba
Core Experience Evolution Pacing and Build Priorities
Document 6 • Version 1.0 • September 26 2026 • Developer and designer handoff
Read this document first, then use the five companion specifications for detailed mechanics. Build a complete, understandable five-organism ecosystem before expanding the catalog. The first playable must let a player change a dish, observe a consequence, inspect its cause, and compare it with another outcome. Heritable variation and autonomous selection belong in that core experience.
This plan connects the larger design to production. It specifies the opening session, initial recipes, evolution pacing, visual feedback, interface behavior, implementation order, acceptance evidence, and the response the team should return. It does not replace the underlying resource accounting or silently revise biological rules.
## The experience we are making
A player should feel that a small living world is responding to their choices. Starting organisms, amounts, positions, nutrients, terrain, light, and later interventions create different opportunities. Organisms act through their inherited capabilities; descendants can vary; local conditions affect which descendants survive and reproduce. The player discovers the consequences rather than choosing an upgrade for every organism.
## The immediate deliverable
Produce an internal first playable with Sprinter, Recycler, Crumbsmith, Sunbead, and Amoeba. Include a readable dish, finite resources, inspection, pause and speed controls, saved experiments, lineage evidence, and a controlled comparison. Then add the first supplementary abilities and validate their costs before broadening the ecosystem.
All timing and balance targets in this document are proposed starting targets. They are not measured results. No game implementation or playtest is represented as complete. Pixelmeba remains a working title; the existing Pixel Petri game is a separate product.
## How to use this plan
Sections 2–4 resolve scope and authority. Sections 5–11 define the first experience and evolution. Sections 12–16 direct design and architecture. Sections 17–22 give verification, priorities, responsibilities, and the final handoff contract. Section numbers match the planned page sequence.
# 02  Place in the full document set
ID
Companion document
Controlling subject
D1
Pixel Petri Design and Build Specification
Base world, resource accounting, original organisms, UI, architecture, saves and performance.
D2
Pixelmeba Mass Expansion Design Volume 2
Expanded catalog, enzymes, dormancy, environments and additional interactions.
D3
Pixelmeba Evolution Core Design Addendum
Inherited quantitative traits, mutation, lineage, supplementary modules and evolution saves.
D4
Pixelmeba Living Worlds and Evolution Expansion
Corrections to evolution, feeding policy, E01–E12, shared budgets and world interactions.
D5
Pixelmeba Living Behaviors Life Cycles and Colony Evolution
Developmental mutations, body forms, behavior, E13–E17 and explicit amendments A01–A09.
D6
This production plan
First playable scope, teaching sequence, pacing targets, evidence gates and team delivery.

## Precedence without accidental rewrites
Use D5’s explicit amendments where applicable, then D4’s explicit corrections, then D3, D2, and D1. An added catalog entry changes its own template only. D6 controls the production decisions explicitly listed below; it does not supersede numerical mechanics merely by describing them in simpler language. Preserve all detailed constraints in the controlling source.
## Explicit production amendments in this document
PROD01 replaces earlier first-slice rosters with B01, B04, B06, A01, and P01. PROD02 replaces earlier milestone ordering with the G0–G5 gates in section 4. PROD03 allows the declared partial module registry in section 10 for internal prototypes only. PROD04 makes EXPANSION_RESPONSE.md the single team response, replacing earlier BUILD_RESPONSE.md requests. PROD05 makes this document’s First Dish recipe the default onboarding recipe; Water Garden remains available as its original habitat preset.
These changes do not reduce the larger organism catalog, remove viruses or fungi from the vision, or declare the five-organism milestone a finished public release. If two inherited rules still conflict, record the exact conflict, proposed resolution, affected saves, and acceptance check before implementing that behavior.
# 03  One implementation specification
Create PIXELMEBA_IMPLEMENTATION_SPEC.md in the development repository. It is the team’s consolidated implementation contract, with source references back to D1–D6. Begin with the resolved baseline in this document. Do not ask each developer to independently interpret six overlapping files.
## Required contents
Record the chosen simulation version, schema versions, exact content hash, enabled organism IDs, enabled module IDs, mutation mode, founder mode, unit definitions, update order, accounting rules, random stream ownership, save compatibility, command semantics, and acceptance gates. Include a conflict register and a change log. Keep the complete content tables in versioned data files; link them from this specification.
Decision class
Owner
How changes become effective
Product scope and milestone exit
Product owner
Accept the recorded scope or a proposed scope change; no silent catalog cuts.
Mechanics interpretation
Simulation lead
Resolve against controlling documents; flag a new rule for product review.
Balance value
Simulation lead with design lead
Change a versioned preset or parameter; publish before and after evidence.
Visual and interaction behavior
Design lead
Match simulation semantics and accessibility criteria; review in the playable.
Architecture and optimization
Engineering lead
Preserve determinism and observable rules; report device evidence.

## Separate rule changes from tuning
Changing a food patch’s quantity is recipe tuning. Changing mutation probability is a ruleset change. Making all hungry cells move faster changes mechanics. Changing how hunger is drawn changes presentation. Label each change accordingly, because the replay, comparison, and save consequences differ.
Do not overwrite an existing saved world’s rules with the newest defaults. A saved dish retains its recorded ruleset and registry. Conversion creates a new copy with explicit provenance. If the prototype cannot run a newer or unsupported save, explain the missing version or feature and leave the source file intact.
## Definition of resolved
A resolved rule has a stable identifier, source, units, allowed inputs, state transition, resource costs, failure behavior, and a verification example. A statement such as “make evolution feel alive” is a goal; it is not sufficient implementation detail. A remaining product decision must have an owner and an explicit blocking gate.
# 04  Milestones and scope boundaries
Gate
Build and demonstrate
Exit evidence
G0 Foundation
Consolidated rules, content validation, fixed tick, accounting, seeded randomness and save skeleton.
Neutral profiles match sources; invalid content fails clearly; accounting fixture passes.
G1 First playable
Five organisms; First Dish; commands; inspector; quantitative evolution; branch records; snapshot comparison.
Opening loop works; save and reload agree; causes and inheritance are inspectable.
G2 Core abilities
E01, E03 and E05; founder modes; full mutation mode UI; lineage discovery and experiment cards.
Module costs and state transitions pass; pacing and comprehension reports are returned.
G3 Ecological breadth
Expand D2 catalog in tested waves; complete remaining D4 abilities and associated world systems.
Each wave has a working interaction, readable assets and compatibility evidence.
G4 Advanced living worlds
Enable D5 development, body forms, behavior strategies, roles and E13–E17 by dependency.
Tradeoffs, transitions, relationships and save behavior are demonstrated.
G5 Release readiness
Agreed release catalog, accessibility, minimum devices, migrations, recovery and distribution package.
Owner accepts explicit release scope; blocking defects closed; device results documented.

G1 and G2 are internal milestones. Their deliberately restricted mutation registry must be visible in build metadata and exports. Do not silently upgrade these experiments to the full registry later. A production release includes evolution; Fixed Traits remains an experimental option.
## Parallel work and sequencing
Design can develop the screen system, five organism silhouettes, event cues, and inspector alongside G0. Engineering can prepare input, rendering, and local file handling against stable interfaces. Resource accounting, phenotype mapping, and state definitions must settle before dependent art behavior or balancing can be accepted.
Do not promise a 24-hour completion date. The team should estimate each gate after G0, based on available people and existing code. The first delivery is evidence from G1, followed by an estimate to G2 and a dependency-aware backlog for the rest.
## Scope retained for later
Viruses, fungi, parasites, additional consumers, colony links, complex life cycles, and richer habitat interactions remain part of the larger design. Introduce them when their prerequisites and explanation tools exist. Keep accounts, servers, online AI, marketplaces, and multiplayer outside this baseline.
# 05  Resolved first playable baseline
Use the inherited 128 by 128 grid, circular dish centered at 63.5,63.5 with radius 60, and fixed 0.10 simulated-second ticks. Do not wrap the boundary. Retain the established resource units, suitability curves, diffusion, transport, metabolism, death accounting, and interaction order, including later explicit corrections.
ID and role
B0
Q per second
M per second
Division age
Speed
B01 Sprinter • sugar feeder
1
0.18
0.50
12 s
0.25
B04 Recycler • deposited food
1
0.14
0.40
18 s
0.25
B06 Crumbsmith • sugar and enzyme
1
0.13
0.40
20 s
0.25
A01 Sunbead • photosynthesis
1.5
0.16
0.40
25 s
0
P01 Amoeba • compatible prey
4
0.60
0.80
50 s
0.60

B0 is ancestral structural carbon; Q is the template intake ceiling; M is ordinary energy maintenance. These are neutral-profile values before inherited modifiers, suitability, availability, and competition. Speed is cells per simulated second. Preserve source lifespans, sensing ranges, contact distance, cooldowns, and compatible prey lists in content data.
## Resource and birth invariants
Founders begin with B0 structural carbon, 0.1B0 bound nutrient, 50 energy, 100 health, age zero, and empty meal stores. Log founder material as an external addition. Ordinary division requires the established biomass, energy, health, and age thresholds. Divide existing resources after charging the actual cost; never create a second full founder inventory.
Apply D5 A01 from G1: draw one immutable candidate birth proposal before placement, retain it while blocked, and commit costs and the split only when legal placement succeeds. Save the pending proposal. Waiting for space must not reroll the genome. Disabled developmental features do not remove this correction.
## Limits and fair allocation
Retain the 6,000-agent cap and local crowding rule. Block births at capacity; do not kill organisms to clear space. Ordered feeding requests share a finite intake budget from one snapshot, as corrected by D4. Competition losses are not re-requested later in the same tick. Show crowding as a cause when it blocks growth.
# 06  Exact First Dish recipe
Recipe ID FIRST_DISH_V1 is an onboarding override of Water Garden. Start paused at tick zero, open lid, Standard Evolution, Identical founders, and seed 104729. Hide no resources or scheduled interventions. The player can inspect the initial ledger before starting.
## Environment and deposits
Use Water Garden’s two stone circles centered at (42,45) and (83,82), radius 9. All other valid dish cells are water. Initialize water cells with light 0.8, warmth 0.5, moisture 1, pH 7, salinity 0, oxygen 0.8, carbon dioxide 0.5, and nutrient 0.10. Override its background sugar to zero. All other material pools, enzyme activities, signals, films, and stored remains begin at zero. Stone cells contain no initial mobile resource inventory. Disable climate cycling, drying and directed flow for this recipe.
Patch center
Radius
Addition per valid water cell
Purpose
(48,64)
6 cells
0.40 sugar carbon
Immediate feeding and first reproduction.
(66,64)
5 cells
0.60 starch carbon
Crumbsmith conversion and Recycler use.
(66,48)
4 cells
0.25 detritus carbon with 0.025 bound nutrient
Recycler niche and resource cycling.

A patch contains cells whose centers satisfy squared distance ≤ radius squared. Quantities are per included cell, not a total divided by the circle area. Clip to valid water cells. Starch contains no bound nutrient in this recipe. Show the computed total added in the initial ledger.
## Founder placement
Place 24 B01 within radius 3 of (48,64), 12 B06 within radius 2 of (66,64), 8 B04 within radius 2 of (66,48), and 12 A01 within radius 4 of (48,48). Each founder occupies a distinct cell center: sort eligible cells by distance from the requested center, then y, then x, and take the first required cells. Assign IDs in the species order above. All loci start at 50; supplementary slots are empty.
The opening recipe contains no P01. The guide invites the player to add two Amoeba later; the player can skip or change that action. Ordinary user additions use the same material accounting as founders. Existing organisms never spawn because an onboarding timer expired.
This is a testable starting recipe, not a promise of stability. Keep version 1 intact when tuning; record revised amounts or positions under a new recipe version and compare the outcomes.
# 07  The first ten minutes
The following windows refer to real user time at an intended 1× start. Biological deadlines use simulated time. The guide advances on observed events or explicit user actions, never by inventing a successful outcome. Every step is dismissible; the sandbox stays available.
Real time target
Player action and presentation
Completion or recovery
0–1 minute
Show the paused dish and three short controls: Run, Inspect, Add. Ask the player to select a Sprinter, then run.
Selection plus Run. Skip opens the same dish without guide cards.
1–3 minutes
Follow a selected feeder. Show food intake, energy and division readiness. Highlight the first actual division.
Actual division or 120 simulated seconds. If absent, show the strongest recorded constraint.
3–5 minutes
Inspect the starch patch and Crumbsmith. Offer the enzyme overlay and explain that Recycler can also consume starch directly.
Player opens a cause detail. Offer the isolated enzyme experiment for proof.
5–7 minutes
Offer two Amoeba near the sugar patch, previewing their dose. Pause and take the before snapshot on confirmation.
A real encounter, or 90 simulated seconds without one. Explain prey distance or eligibility if needed.
7–10 minutes
Invite Duplicate Dish and one food addition in the copy. Compare births, deaths and resource changes after equal simulated time.
Player identifies one measured difference and can return to either saved dish.

## What the opening must establish
The player should understand that food is finite, feeding differs by organism, changing placement changes access, predators require encounters, and offspring inherit traits. A brief “Watch descendants over generations” prompt opens lineage inspection. Do not make a rare new ability a condition for finishing the tutorial.
## Slow outcomes and failures
When a target event does not happen, keep the actual world intact. Offer Inspect Cause, Change Something, Try the Isolated Experiment, or Skip. If life dies out, show recorded causes and offer a saved earlier state or Add Life. A recovery action must say that it changes or rewinds the dish.
Speed controls remain available. A learner can pause indefinitely. Record active observation time separately from time spent reading panels so pacing reports do not confuse a long explanation with a slow ecosystem.
# 08  Experiments with useful controls
An experiment card contains a question, starting recipe, one suggested intervention, predicted tradeoff, measurements, stopping point, and an explanation of confounds. Predictions are hypotheses. The result panel reports what happened, including no difference or extinction.
## Experiment A  What unlocks starch
Use a separate clear-water dish with the same environmental values as section 6, no stones, no background sugar, and no organisms except 12 B06 at the starch patch (64,64), radius 3. Deposit 0.60 starch per patch cell. Add a 0.10 sugar bootstrap per cell in that same patch. This finite bootstrap keeps early enzyme activity possible; display it explicitly. Use Fixed Traits and seed 104729.
Compare a duplicate where the initial starch deposit is omitted; all other starting values match. Run for 180 simulated seconds. Report sugar gained from enzyme conversion separately from bootstrap sugar, starch remaining, food consumed, births, and survival. With no Recycler or Sunbead present, direct starch eating and photosynthetic sugar cannot masquerade as enzyme production. Do not claim the enzyme is beneficial merely because conversion occurred; its energy cost may outweigh the gain.
## Experiment B  What changes when a grazer arrives
Snapshot First Dish at exactly 120 simulated seconds and duplicate it. In the intervention copy, add two P01 at the nearest valid cells to (48,64), using the placement ordering in section 6. Leave the control unchanged. Run each for another 180 simulated seconds. Compare prey deaths by cause, births, total prey biomass and remaining sugar. Record the predator addition as an external input.
## Experiment C  Why variation can matter
Use the trait comparison fixture in section 11. Make a control with stable food and an intervention with a finite initial food pulse. Seeded trait differences must be labeled as starting variation. Observe survival and descendants without promising the reserve carrier will win. Quantitative evidence explains selection more honestly than a guaranteed mutation animation.
## Comparison limitations
A copied state controls the starting conditions. An intervention can change later encounters and random draw opportunities, so one pair is not proof of a general effect. Label it “this paired run.” Use several seeds during tuning. The player may export the recipe, snapshot and action log to reproduce the question.
# 09  Evolution pacing and truthful discovery
Evolution must run through inherited variation, reproduction, and differential success. An individual’s temporary hunger, growth or resting state is not a mutation. A trait already present in founders is not a new discovery caused by the player. Explain these distinctions through the inspector and event labels.
Layer
Evidence required
How it appears
Immediate response
Recorded intake, movement, stress, resting or attack.
A subtle local cue and current-state detail.
Inherited difference
Committed daughter genome differs from its parent proposal source.
Trait change in a birth record; no claim that it is useful.
Selection
Different inherited groups leave different surviving descendants under recorded conditions.
Comparable counts and trait distributions over time.
Persistent branch
D4 and D5 branch threshold plus at least five descendants across three generations.
A branch entry with ancestor, first appearance and confirmation times.
New ability
A legal module or supported native-feature change is committed at birth.
Ability explanation, cost, compatibility and lineage provenance.

## Targets the team can actually measure
For First Dish, aim for observable intake within 15 simulated seconds and a first division within 120 simulated seconds on at least five of the six development seeds. These are proposed recipe targets, not engine exceptions. Aim for players to find one inherited quantitative difference within a 20-minute simulated observation session, using inspection when the visual difference is subtle. Report the fraction of sessions with no such event.
Do not promise a persistent branch, advantageous mutation, stable ecosystem, or new module within ten real minutes. At Standard rates, a supplementary gain attempt has probability 0.001 per daughter: 0.2% module-change probability multiplied by a 50% gain choice. Across 1,000 independent daughter trials, the chance of at least one gain attempt is approximately 63.2%. Eligibility, establishment, and survival can make a visible useful branch much less likely.
## No hidden rescue or escalation
Do not increase mutation rates after an uneventful wait, grant a useful trait because food is scarce, reroll failed mutations, or spawn new organisms to rescue a tutorial. If pacing is weak, tune a versioned recipe, improve explanation, or offer the clearly labeled Accelerated mode.
# 10  Evolution modes and staged capabilities
Setting
Quantitative draw
Preference draw
Module change
Developmental draw
Standard
8% per daughter
2%
0.2%
1% when G4 enabled
Accelerated
16% per daughter
4%
1%
2% when G4 enabled
Fixed Traits
0
0
0
0

Draws are independent as specified in D3–D5. A successful quantitative draw changes one eligible locus; use the prescribed ±2 or ±5 distribution and bounds. Preference mutation cannot grant an unsupported food pathway. Module change chooses gain or loss, then a legal eligible candidate; no eligible choice means no change. Retain the three supplementary-slot limit.
## Internal registry by gate
G1 enables quantitative loci and feeding-policy mutations for supported pathways. It has no supplementary gains or developmental changes: store a declared empty supplementary registry and disabled developmental capability in the ruleset. All founders retain neutral body, strategy and role defaults. G1 worlds are labeled “Core prototype — quantitative evolution.” Do not advertise full Standard Evolution without that qualification.
G2 enables exactly E01 Starch release, E03 Resting stage and E05 Reserve chamber as the supplementary registry. E01 is eligible for B01 and B04 among the core roster; B06 already has native starch secretion and cannot gain it twice. E03 is eligible for B01, B04 and B06. E05 is eligible for all five core organisms. Apply full source costs, compatibility, state machines and loss behavior. Do not substitute cosmetic placeholders.
This partial registry is an explicit production override of the broader initial registry. G3 expands it to the remaining D4 modules only as their dependencies are implemented. G4 enables D5 developmental draws and its complete eligible behaviors. Each registry change creates a new recorded ruleset; old saves do not gain new mutation candidates silently.
## Founder choices and mode changes
Identical uses neutral loci and empty supplementary slots. Varied uses the D4 45–55 locus initialization with no supplementary modules. Diverse also gives the prescribed 10% eligible founders one legal module; label these as pre-existing abilities. Preserve source compatibility checks. Changing evolution or founder rules starts a new dish or an explicitly converted copy; it never rewrites ancestry in place.
# 11  Demonstrating abilities without fake evolution
Use a separate G2 learning recipe RESERVE_COMPARE_V1 to show the difference between having a capability and benefiting from it. Label it “Seeded traits demonstration.” It is an experiment with assigned starting genotypes, not a naturally discovered branch.
## Initial state and controlled difference
Use a clear-water dish, no stones, the section 6 environmental baseline, open lid, Fixed Traits, and seed 104729. Place 24 neutral B01 in distinct cells nearest (64,64), within radius 3. Give exactly 12 alternating founder IDs E05 and give the other 12 no supplementary modules. All begin with energy 50; E05 increases capacity, not current energy. Mark founder groups in an optional outline overlay, not by replacing organism identity colors.
Deposit sugar 0.50 carbon per water cell within radius 6 of (64,64), with no other food. Duplicate this initial state. The pulse arm receives no later additions. The stable-food arm receives another 0.50 per patch cell at simulated seconds 60, 120, 180, 240 and 300. These are visible scheduled experimental inputs with exact totals in the ledger; the player must accept the schedule before running.
## Measurements and interpretation
Run both for 600 simulated seconds. Record energy distributions, food actually consumed, births, deaths by cause, live descendants by founder group, and the times each group disappears, if applicable. E05 adds 40 energy capacity, the 0.02 energy/s active module surcharge, and 0.03 energy/s active upkeep. It provides no extra biomass or guaranteed survival advantage.
The intended question is whether storing surplus changes outcomes when food stops. The initial recipe may fail to charge reserves enough to show a difference; that is a tuning finding. Do not make the chamber fill for display purposes. Report the result and adjust a new version’s food pulse or duration before changing the module’s mechanics.
## How this connects to autonomous evolution
After the player understands the tradeoff, offer a separate copy with Standard or Accelerated Evolution and disclosed founder settings. That copy can develop new variation naturally. Keep seeded founder traits, later mutations, and persistent branches distinct in lineage history. A generated branch name or visual ornament must never imply a capability absent from the actual genome.
# 12  Pixel art and visual storytelling
Keep the established microscope garden aesthetic: a quiet dark field, a clean dish boundary, crisp pixel life, and restrained laboratory controls. Organisms are the brightest focus. Avoid realistic medical imagery, gore, faces, and screen-wide effects. The image should remain inviting during both a rich bloom and a sparse recovery.
## Identity and scale
Use the D1 palette and sprite scale as the base. Preserve each ancestor’s silhouette across descendants: Sprinter is a compact moving bacterium; Recycler is visually distinct from Sprinter; Crumbsmith has a recognizable producer marking; Sunbead reads as a light-dependent cell; Amoeba is the larger deforming grazer. Shape and pattern must distinguish them without color. Do not enlarge collision bodies to improve tap targets; use a separate selection radius.
Actual event or state
Normal view
Detail or overlay
Successful feeding
Brief interior brightness change on the feeder.
Food type and amount; remaining energy and biomass.
Division commits
Short split animation at real daughter positions.
Parent, daughter IDs and inherited differences.
Enzyme conversion
Sparse substrate-edge speckles where conversion occurred.
Activity and carbon conversion field; actual sugar gain.
Hunger or stress
Restrained desaturation or pattern change.
Current limiting conditions and measured rates.
E05 reserve
Interior amber pocket in four fill bands.
Exact energy versus capacity; upkeep cost.
Resting or death
Source-defined resting cue; death resolves to remains.
Resting state or recorded death cause, not a mutation cue.

## Truthful effects
Animate measured events, not predicted success. No feeding flash when a request receives zero food; no daughter animation for a blocked birth; no glowing enzyme halo that suggests extra light. Aggregate frequent effects at low zoom without altering the simulation. Show at most two supplementary feature cues in the base view; selection reveals the rest.
Keep nearest-neighbor scaling for pixel assets. Smooth camera gestures and interpolated positions may coexist with crisp sprites. Reduced motion suppresses pulses, trails and camera nudges while preserving shapes, labels and event records. Sound is optional and sparse; silence must preserve every important meaning.
# 13  Interface and intervention contract
Retain Home, New Dish, Continue, Experiments and Field Guide. New Dish exposes habitat, recipe, seed, evolution mode and founder mode in progressive disclosure. The summary states what is preloaded. Enter paused. The main screen always exposes simulation time, pause, speed and Inspect.
## Placement and dose
Life uses a count control; Food and Chemistry use resource doses; Habitat uses terrain operations. Show the selected organism or material, intended footprint, accepted amount, rejected cells, and total external addition before confirmation. In the internal core build, provide Life, Food, Inspect and Tools; show broader categories only when their associated rules work.
Use the inherited distance-sampled brush so finger speed and frame rate do not multiply dose. A discrete tap or completed gesture creates one command with a stable ID. Apply it atomically at the next tick boundary; while paused, apply at a boundary without advancing biology. Do not send one inventory addition per rendered frame. Rejected placements add nothing.
## Touch and desktop behavior
One finger pans in Inspect and paints only with an explicitly selected tool. Two fingers always pan or zoom; cancel an uncommitted paint preview when the gesture becomes two-finger. On desktop, retain mouse and Escape behavior from D1. When multiple organisms overlap, open a candidate list sorted by proximity, then ID. The inspector follows the selected entity until death or explicit deselection.
## Recovery and comparison
Take the one-level undo snapshot immediately before committing a gesture. Undo rewinds both the action and all elapsed simulation ticks since that gesture; label the rewind. Duplicate Dish creates an independent state and save identity. Comparison pauses both dishes when opening setup and states their respective start and end simulated times. A control arm never advances invisibly while the user edits the other.
## Layout acceptance
Design at 360 by 800 portrait, 800 by 360 landscape, and 1440 by 900 desktop, including 200% text. Keep touch targets at least 48 CSS pixels, default body text at least 16 pixels, normal text contrast at least 4.5:1 and essential graphics at least 3:1. Panels must not cover the selected organism without offering a visible repositioning route.
# 14  Inspection that explains causes
Use three information depths: a short selection summary, an expandable explanation, and detailed measurements. A casual player should understand the current constraint without reading a genome table; an experimenter should be able to verify the explanation.
## Selection summary
Show name, ancestor type, life state, age, generation, current energy and health, plus the strongest current constraint. Example structure: “Low food access — 0.006 sugar consumed in the last 5 simulated seconds.” Values come from recorded state. Show “No single dominant constraint” when the evidence is mixed rather than inventing a simple story.
## Explanation and inherited traits
Separate “Now” from “Inherited.” Now includes local environment, available compatible food, intake received, movement, resting or attack status, and division blockers. Inherited includes phenotype values, active loci, feeding policy, supplementary modules, native feature changes and their costs. A growth-related size change is not labeled a body-form mutation.
For division, show all blocking conditions together: biomass, energy, health, minimum age, legal placement, local crowding and global cap. The short summary can name the most immediate blocker, but detail must expose the full set. For predation, distinguish no compatible prey, prey out of contact, cooldown, and a full meal store.
## Cause records and uncertainty
The engine supplies reason codes and relevant quantities; the interface converts them to text. Record actual cause-of-death attribution using the established resolution order, with concurrent stressors as contributing conditions. Do not derive causes from color, animation, or a later snapshot. Use “coincided with” for population trends unless an explicit mechanism or controlled comparison supports a stronger explanation.
## Branch discovery
At confirmation, show the ancestor, inherited difference, costs, location of first appearance, first birth time, confirmation time, current descendants and generation depth. Let the player name and pin a branch. Losing a pinned branch keeps its history and shows extinction; it does not delete the discovery or imply that another organism replaced it.
Aggregate event notices: one brief message for a burst of divisions, one for a newly confirmed branch, and one for an extinction of a pinned branch. Detailed records remain inspectable. Avoid notifications for every small mutation in a crowded dish.
# 15  Simulation and presentation architecture
Retain D1’s proposed TypeScript, PixiJS, HTML/CSS, Vite and Capacitor architecture. The team should pin compatible dependency versions when creating the project. This plan adds no server, paid generation API, or runtime language model. Evolution and explanations come from local rules and recorded state.
## Authoritative simulation
Run fixed ticks in an isolated simulation worker. Rendering receives snapshots and events; it cannot mutate organisms directly. A shared phenotype function resolves genotype plus template plus life state into effective values. Use that same result for simulation, inspector and previews so displayed abilities cannot diverge from actual behavior.
Keep module eligibility, gene activity, food pathways, environmental preferences, costs and visuals in versioned content data with stable IDs. Validate unknown IDs, unsupported combinations, non-finite values, and missing dependencies before creating a world. A missing module implementation must be rejected, not loaded as a harmless-looking no-op.
## Command and event contracts
A command contains command ID, world ID, target tick, tool or action ID, world-coordinate footprint, quantity or count, and ruleset identity. Record accepted and rejected amounts. Simulation events contain tick, event type, relevant entity or lineage IDs, reason code, and actual transferred amounts where applicable. Cosmetic timing and particles use a separate random stream.
Commit births, deaths, conversions and transfers once. A renderer reconnect or duplicate event delivery must not apply another biological action. Keep detailed mutation and pending-birth records in authoritative state; visual effects can be dropped under load without losing history or altering outcomes.
## Minimal observation data
Maintain births, deaths by cause, intake by food type, energy earned and spent, material flows, external additions, blocked-birth counts, live descendants and generation depth. Sample population and resource summaries once per simulated second for the first playable; retain bounded recent samples and compact older summaries. Keep the existing ancestry compaction rules and preserve named branches and active-genome references.
These are local development and player-facing records. Do not upload analytics by default. A team diagnostic export is user-initiated and excludes unrelated device or account data.
# 16  Persistence performance and expansion
## Save the experiment rather than a screenshot
Retain D1’s .petri format, canonical checksum, 25 MB size limit, atomic tick-boundary saves, ten named local slots, rolling autosave and valid predecessor. Include exact ruleset and content identities, all resource pools, organisms, genomes, life states, lineage references, pending births, random state, and active scheduled experimental inputs. A picture cannot restore a simulation.
Autosave every 30 real seconds and on the established background, manual and comparison transitions. Backgrounding saves and pauses; resume at that saved moment. There is no offline growth. Import validates finite bounds, checksums, stable IDs and references before replacing anything. Failed import leaves the current dish untouched.
## Performance contract
Retain the targets of 30 frames per second on the nominated representative midrange Android device and 60 on a capable desktop, with 1× simulation ticks below 10 milliseconds at the target population and touch response at the 95th percentile below 100 milliseconds. These remain targets until measured. Name the actual minimum device before final art acceptance.
At load, reduce particles, label frequency, optional overlays and snapshot frequency before changing biology. Never skip authoritative ticks, alter mutation probability or delete life to maintain a display frame rate. If real-time performance falls behind, show effective simulation speed. Compare experiment arms by simulated duration, not by wall-clock duration.
## Extension contract
A new organism or ability requires a stable ID, compatible ancestry, resource inputs and outputs, energy costs, target rules, life-state behavior, mutation eligibility, save representation, inspector explanation, visual cues and a verification fixture. Shared mechanisms should be reusable; do not implement every species as a separate exception to the update loop.
Add future systems in dependency order. Host eligibility precedes viruses and parasites; substrate and network rules precede fungal expansion; relationship accounting precedes shared colonies; state transitions precede dispersal life cycles. Raise limits only after measuring mixed dense scenes, not because an empty dish runs quickly.
## Natural novelty has a defined boundary
The simulation can produce new combinations and ecological outcomes within its implemented trait and interaction vocabulary. It does not invent arbitrary executable abilities or new physical laws. The team expands that vocabulary through authored, validated modules; the ecosystem explores it autonomously.
# 17  Acceptance fixtures for mechanics
Run focused developer fixtures before broad playtesting. These are planned checks for the implementation team, not results already obtained. Keep fixture state, exact seed, command log, build identity and expected invariant together so a failure is reproducible.
Fixture
Required evidence
Gate
Neutral founders
Loci at 50 reproduce all five native profiles; inactive loci do not create movement or sensing.
G0
Resource ledger
Closed-lid 10,000-tick fixture meets D1 relative carbon and nutrient error below 0.001%; record totals and roundoff.
G0
Deterministic state
Same initial state and commands produce identical authoritative state at 1×, 4× and after save and reload.
G1
Blocked division
One saved birth proposal remains identical across blocked ticks; resources split and cost commit once after space opens.
G1
Finite feeding
Competing organisms never receive more than the available food or their intake budget; no negative pools.
G1
Enzyme source
Conversion preserves material; no substrate means no conversion; B06 pays secretion cost; bootstrap stays separately attributable.
G1
Inherited variation
Committed births store parentage and trait deltas; Fixed Traits produces no mutation; speed affects no mutation odds.
G1
Module accounting
E05 grants capacity only; E01 cannot duplicate native secretion; E03 uses complete entry and waking rules.
G2
Registry and imports
Unsupported feature saves fail clearly; changing the active registry cannot silently alter a saved world.
G2
Branch evidence
Threshold, descendant count and generation depth are all required; renamed and extinct branches retain history.
G2

For conservation fixtures, begin with positive totals, close the lid, disable external additions, and include every stored material compartment. Light can supply activity energy; carbon and nutrient still require an accounted source. Report each pool and every intentional external flow. A relative-error calculation with a zero denominator is not a passing result.
Test later features when introduced: host restrictions with host-dependent organisms, shared transfers with links, developmental placement with changed bodies, and migration with each new schema. Avoid forcing unimplemented G4 behavior into G1 acceptance.
# 18  Balance and comprehension review
## Small reproducible tuning batch
Use development seeds 104729, 130363, 155921, 196613, 262147 and 314159. Run FIRST_DISH_V1 for 600 simulated seconds at each seed in Standard mode with no interventions. At G2, repeat the six seeds in Accelerated mode. Record effective speed, births, deaths, biomass, food remaining, mutation counts, module attempts, successful gains and branch confirmations. Do not change the recipe between seeds. If no inherited difference appears by 600 seconds, continue to 1,200 to evaluate section 9, retaining the 600-second checkpoint.
Report median and range for first intake and first division; report the fraction with no event by the stopping time. Never drop an extinct dish or treat “no event within 600 seconds” as an event at second 600. For rare modules, report events per daughter trial as well as per minute. A small batch characterizes the prototype; it does not establish population-wide probabilities.
## Tune the cause of a pacing problem
First inspect placement and travel distance, accessible food, nutrient limits, oxygen, suitability, crowding and action costs. Adjust one recipe parameter at a time and rerun the affected small batch. Only propose a mechanics change after recording why recipe or presentation changes cannot meet the goal. Keep mutation rates explicit; do not use a higher rate to conceal starvation or broken reproduction.
## Comprehension session
Have the team recruit five willing testers unfamiliar with the design when a playable exists. Give the task: “Make a dish change, show why it changed, and preserve another version to compare.” Observe a ten-minute session without directing their taps. Ask them to identify one food source, one cause of population change, one inherited trait, and one difference between their two dishes.
Directional target: at least four of five complete a meaningful intervention and explain one observed cause; at least three of five distinguish a temporary state from an inherited trait. Record each failure and the screen where it arose. This small sample is formative, not statistical proof. If comprehension fails, revise labels, hierarchy or event evidence before adding another system.
## Return evidence rather than a verdict
Provide the recipe and ruleset versions, exact builds, seed results, short annotated captures, failed or censored outcomes, tester task outcomes, and proposed next change. Separate “mechanically correct,” “understood,” “interesting,” and “fast enough”; passing one does not imply the others.
# 19  Prioritized engineering backlog
Priority and ID
Work item and dependency
Done when
Now ENG01
Resolve specification and content manifest; no dependency.
Source conflicts and first playable feature flags are explicit.
Now ENG02
Fixed tick, resources, allocation and ledgers; ENG01.
Neutral and conservation fixtures pass.
Now ENG03
Five organism behaviors and exact recipes; ENG02.
Each consumes or converts through its intended pathway; no unexplained inventory.
Now ENG04
Genomes, mutation, pending births and lineage; ENG02–ENG03.
Inherited change and blocked division fixtures pass.
Now ENG05
Input commands, selection and cause inspector; ENG01–ENG03.
Touch placement has finite doses and every main blocker is inspectable.
Now ENG06
Save, undo, duplicate and comparison; ENG04–ENG05.
Reload agrees; comparison preserves source states and action provenance.
Next ENG07
E01, E03 and E05 registry plus mode UI; ENG04–ENG06.
G2 module costs, eligibility, founder labels and imports pass.
Next ENG08
Guide cards, experiment cards and review export; ENG05–ENG07.
First ten minutes and controlled experiments are reviewable.
Next ENG09
Targeted tuning and device profiling; playable G1, repeat at G2.
Section 18 report and real device measurements exist.
Later ENG10
Catalog and environment waves; G2 exit.
One complete ecological interaction per wave, then mixed-scene regression.
Later ENG11
Developmental features and advanced relationships; dependencies from D5.
Native feature loss, body and life-state changes preserve material and history.
Release ENG12
Agreed catalog, accessibility and packaging; G3–G4 as scoped.
G5 release contract and blocking acceptance items are complete.

“Now” means necessary for the first internal experience, not a request to complete all items in a day. Estimate tasks after the rules and existing code are reviewed. Separate engineering effort from asset effort. The owner may sequence later waves, but changes to release scope must be recorded explicitly.
For G3, group work by interactions: producers and recyclers; consumers and defenses; host-dependent life; fungi and substrate networks; then richer environmental coupling. Do not enable a catalog item until its food, victims or hosts, death products, explanation and save dependencies work.
# 20  Designer deliverables and acceptance
Package
Required contents
Acceptance evidence
Screen system
Home, setup, dish, tray, inspector, comparison, lineage and empty states.
Portrait, landscape, desktop and 200% text layouts; keyboard focus path.
Core organism kit
Five ancestral silhouettes; active, feeding, dividing, stressed and dead states as applicable.
Species remain distinguishable in grayscale and a crowded dish.
Ability kit
Starch cue, complete resting-state cues, four E05 reserve bands and three module icons.
Every cue maps to real state; native and supplementary origins remain clear.
World kit
Water, stone, deposits, remains, boundary and selection graphics.
Resources and life remain separable at normal zoom; no misleading hitboxes.
Explanation kit
Short summaries, expanded causes, traits, branch notices and experiment results.
Prototype strings use dynamic values and handle zero, unknown and mixed causes.
Motion and sound
Durations, triggers, aggregation and reduced-motion variants.
Effects never conceal failure, demand audio, or advance biology.
Implementation files
Editable sources, exports, naming map, state mapping and scale rules.
Assets connect to stable template, event and module IDs; no missing variants.

## Review in difficult conditions
Approve assets in a sparse dish, a crowded patch, overlapping organisms, a resource overlay, resting states, and a selected organism beneath an open panel. Test the actual smallest target viewport. A clean enlarged sprite sheet alone does not prove that the game is readable.
## Asset production sequence
Start with silhouette and palette studies for the five organisms, then build the main screen and inspector with those assets. Produce functional state cues only after simulation names and transitions are agreed. Finish advanced colony and developmental art alongside its corresponding implementation wave. Reuse a visual cue only when it means the same thing.
## Copy principles
Use plain statements such as “Needs more energy to divide” or “Inherited a larger reserve.” Do not say “adapted to survive” immediately after a random mutation, or “immune” when a trait only reduces a penalty. Distinguish actual measurements from predictions, seeded examples from natural discoveries, and an experiment’s outcome from a universal conclusion.
# 21  Risks decisions and release boundaries
Risk
Early signal
Required response
Too little happening
Few births despite available food.
Inspect nutrient, oxygen, placement and costs; fix causes before mutation rates.
Everything looks alike
Players cannot locate a selected lineage or resource.
Improve silhouette, overlays and selection; preserve ancestry identity.
One organism dominates
Same template takes over every development seed.
Identify the enabling flow and missing tradeoff; compare changed recipes.
Rare events drive waiting
Guide depends on a module that does not appear.
Remove that dependency; use labeled seeded demonstrations and honest wait data.
Complexity outruns explanation
New systems require undocumented exceptions.
Stop the next wave; consolidate rules, cause codes and dependencies.
Randomness masks regressions
Only a favorite seed is demonstrated.
Return the fixed development batch and saved failing cases.
Performance changes outcomes
High speed produces different results or births disappear.
Treat as correctness failure; reduce presentation workload first.
Document drift
Two developers implement different inherited rules.
Resolve in the canonical specification and version the change.

## Decisions the team must return
Name the actual minimum Android device and desktop test configuration; confirm whether any existing Pixel Petri code or assets are reusable and under what project permission; identify the owner of the canonical specification; estimate G1 and G2; and list any unresolved mechanism conflicts. Do not assume code reuse merely because the products share a pixel style.
## Release scope contract
Before G5, the product owner accepts a named catalog and feature list drawn from the full design. Record which D2 organisms, D4 modules, D5 developmental systems, experiment cards, and platforms are included. If advanced systems are deferred, state that clearly in the product description and backlog. Five core organisms demonstrate the concept; they do not automatically satisfy the broader intended game.
No release date, commercial price, title clearance, platform approval or device compatibility is established by this design document. Those decisions require the appropriate project work after the playable exists. They should not block reversible implementation of the agreed internal core.
# 22  Required team response and next action
Return one EXPANSION_RESPONSE.md with the build and source package. This is the shared developer and designer response for the full document set. Use the following sections in this order so the owner can review progress without reconstructing the implementation from screenshots.
Response section
Required information
1 Build identity
Build location, commit, pinned dependencies, simulation and schema versions, exact content hash, device configurations.
2 Implemented scope
G0–G5 status; organism and module IDs; enabled mutations; missing features and known limitations.
3 Resolved specification
Link to PIXELMEBA_IMPLEMENTATION_SPEC.md; source amendments applied; remaining conflicts with proposals and owners.
4 Correctness evidence
Section 17 fixture outcomes; failing case files; actual material errors and deterministic comparison results.
5 Experience evidence
Development-seed results, censored events, comprehension outcomes, screenshots and short annotated captures.
6 Design handoff
Editable assets, export map, supported layouts, reduced-motion states and accessibility findings.
7 Performance and saves
Measured device results, effective speed under load, background behavior, import errors and migration limitations.
8 Changes and next gate
Tuning revisions with reasons; proposed scope changes; estimate and dependencies for the next gate; decisions needed.

## Acceptance of the first delivery
The first delivery is reviewable when the owner can open a First Dish, see a real food-to-growth or food-to-conversion chain, make one deliberate intervention, inspect the consequence, find an inherited difference or its recorded absence, save and reload, and compare a copy. The response must disclose which G1 or G2 capabilities are actually enabled. A video alone is not the playable deliverable.
## Start here
Engineering begins with the source reconciliation, content manifest and accounting foundation. Design begins with the five silhouettes, main screen and cause inspector. Both teams agree on stable IDs and event meanings before producing dependent work. Complete G1, return the evidence, and use the result to tune the core and estimate G2.
The long-term aim remains a dish that develops surprising, understandable life through its own rules. This production plan makes that ambition testable in a small world first, then gives the team a controlled way to enlarge the vocabulary of life without losing causality, readability or the player’s experiments.