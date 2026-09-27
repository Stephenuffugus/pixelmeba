# 01  Expansion purpose and recommendation
# Pixelmeba Living Lab
Equipment Research Skills and Interactions
Document 7 • Version 1.0 • September 26 2026 • Developer and designer handoff
The strongest next expansion is a working laboratory around the living dish. Give players precise ways to change resource delivery, illumination, isolation and timing, then show how those interventions affect organisms and their descendants. This creates more meaningful play with the existing life catalog and gives later species more situations in which their abilities matter.
Build this after the core evolution milestone in Document 6. Start with finite-dose equipment and understandable controls, then add local light, simple sensor rules and guided research challenges. Existing membranes, gates, sampling and observation systems become one coherent equipment kit. Preserve autonomous evolution: equipment changes conditions; it does not grant a desired mutation.
## Three kinds of progression
Equipment expands what the player can manipulate. Research skills record what the player has demonstrated through experiments. Biological abilities remain inherited organism features governed by Documents 3–5. Keep these separate in data, language and visual treatment. A player badge cannot make bacteria eat faster, and an organism’s new module cannot unlock a laboratory button.
## The playable promise
A player can build a feeding station, notice a population depending on it, alter the schedule, watch a different outcome, and preserve the experiment. Later, they can close a passage, create a light refuge or attach a simple controller to an instrument. The interest comes from the living response, including unexpected or unsuccessful results.
## Status and boundaries
This is a design specification with proposed balance values, not a tested implementation. All quantities are fictional game units. It adds no real laboratory procedures, server, account requirement, consumable shop or runtime AI service. Sandbox equipment remains available without grinding. Research rewards are cosmetic records and optional guidance.
Read Document 6 first for the overall build order. Use this document for the Living Lab feature contract, and the earlier documents for the underlying organism, material and evolution rules. The full organism expansion remains in the plan.
# 02  Position in the existing build
Existing source
Retain and reuse
Living Lab contribution
D1 Tools and explanation
Sample, transfer, dilution, duplicate, inspector, local saves.
Unified equipment workflow and explicit sample transactions.
D2 Construction and transport
S01–S12 structures, class permissions, finite food and six regions.
Common controls and experiments using the existing structures.
D3 and D4 Evolution
Inherited traits, legal modules, selection, branch records and budgets.
Measured environmental pressures and interpretable tradeoffs.
D5 Living behaviors
Life states, native feature changes, body forms and relationships.
Compatibility requirements for sampling and new challenges.
D6 Production plan
G0–G5 gates, core roster, first experience and one team response.
An optional G3 workstream after G2, with its own small acceptance gates.

## Explicit additions and amendments
LABA01 adds LAB01 Dosing reservoir and LAB02 Light lens to the existing device registry and 256-device cap. LABA02 adds the lamp contribution to the existing light formula. LABA03 adds bounded controller records and their next-tick command timing. LABA04 defines paused sample transactions for Living Lab worlds. LABA05 adds research records and challenge recipes without restricting sandbox access. These are the only intended changes to earlier rules.
Keep S01–S12 IDs and mechanics. A renamed toolbar item or improved drawing must not create a second membrane, heater or resin implementation. Field probes reuse the existing six observation masks. The controller is a logical record, not an additional simulation grid or a new organism ability.
## Version and authority
Add a livingLab capability version and the relevant registry entries to the canonical implementation specification and content manifest. Retain the current evolution simulation version unless serialization or engine compatibility requires a recorded version change. A copy upgraded to this capability starts with no LAB01 or LAB02 devices, no controllers and zero lamp contribution; its existing world state stays intact.
D6 continues to control production priorities. D5’s explicit mechanics amendments and D4’s corrections still apply. Do not enable a Living Lab feature whose required underlying system is a placeholder. Old worlds retain their original sample semantics unless explicitly converted into a new Living Lab copy.
# 03  The equipment kit
Player item
Implementation
Purpose and important limit
Dosing reservoir
New LAB01 device
Release a finite, visible food inventory at a chosen rate; no refill without a logged action.
Light lens
New LAB02 device
Create a local light contribution; shade and canopy still attenuate it.
Culture divider
Existing S01, S02, S03
Choose membrane, size gate or shutter using exact transport permissions.
Current channel
Existing S04
Move eligible pools and Small free life one adjacent edge at a time; no remote pumping.
Climate tools
Existing S09, S10, S11, S12
Warm, cool, shade or maintain substrate moisture under existing rules.
Cleanup cartridge
Existing S08 resin
Remove only selected fictional inhibitors and RIVAL up to its finite capacity.
Sample pipette
Existing Sample and Transfer
Move selected contents with provenance; never duplicate a rare specimen.
Field probe
Existing observation region
Measure a field or population in one of six masks; do not change conditions.
Lab controller
New logical rule record
Turn one supported device on or off, or one shutter open or closed, from a measured threshold.
Experiment notebook
Existing recipes and comparison plus research records
Keep prediction, baseline, actions and outcomes; distinguish evidence from a conclusion.

## How to organize the tray
Use Equipment categories Observe, Feed, Shape, Climate and Transfer. Observe contains probes, the notebook and lineage tools. Feed contains the reservoir and existing finite-food tools. Shape contains gates, membranes, channels and attachment furnishings. Climate contains light, warmth and moisture controls. Transfer contains sample and dilution tools. Keep a compact Favorites row for three pinned items.
Explain each item with “changes,” “does not change,” and “watch for” in its expanded help. A reservoir changes food availability; it does not add organisms; watch remaining inventory and who actually eats. Use this structure to prevent the equipment list from becoming an unexplained icon collection.
Equipment is reusable in sandbox. Finite inventory belongs to the simulated world and must be accounted for. Challenge restrictions can limit placement or loading, but no general currency or crafting grind is added by this expansion.
# 04  Placement and equipment interaction
## Common placement contract
Reuse the grid preview, stable command IDs, tick-boundary transactions and one furnishing or device per cell. LAB01 and LAB02 occupy one valid water, gel or sediment cell; reject stone, outside-mask cells and occupied device slots. These instruments do not displace organisms, change substrate or create a collision wall. Edge equipment still occupies edges under the existing rules.
Show the footprint, receiving cell or light field, starting settings and conflicts before release. Begin every newly placed device Off. An empty reservoir cannot release food. Selecting an installed device opens its local panel without pausing unless the player chooses Pause. Moving a device requires Pause and an atomic validated relocation; keep its ID, contents and controller reference.
Interaction
Required result
Failure behavior
Place
Create one device with a unique ID and explicit settings.
Reject invalid cells; do not load inventory or spend a challenge allowance.
Configure
Preview rate, intensity or supported target before commit.
Reject out-of-range values; retain the previous valid setting.
Toggle
Show actual requested state and effective output separately.
An On but empty feeder reads Empty, not Feeding.
Move
Relocate the same device and its stored contents while paused.
Invalid destination leaves everything at the original cell.
Remove
Confirm export of any stored inventory, then remove and log it.
Cancel leaves the device intact; dependent controllers become disabled on removal.
Undo
Use the inherited one-level world rewind.
Restore device, inventory, rules and elapsed simulation state together.

## State language
Separate Off, Running, Empty, Blocked and Controller paused. Running means the instrument is enabled and eligible to act; an output counter reports what it actually transferred during the most recent second. A blocked device cannot accumulate a burst owed from earlier ticks. No device repairs, refills or re-enables itself after a save reload.
Challenge allowances count successful placements and external loads as specified by that challenge. Configure and inspect are free. Undo rewinds allowance accounting with the rest of the world. The player can always abandon a challenge and open an explicitly unrestricted copy.
# 05  Finite dosing reservoir
LAB01 stores one homogeneous dissolved-food recipe: Sugar, or Soluble broth after M01 is supported. Maximum inventory is 20 carbon units. Sugar loading can include 0 to 0.10 bound nutrient per carbon; default 0.10. Broth uses M01’s fixed 0.10 ratio. Carbon and its companion nutrient move together. No gases, live specimens, viral units, enzymes, inhibitors or arbitrary chemical mixtures can be stored in this first version.
## Loading and delivery
Load while paused using an explicit amount and composition preview. Creation from the materials tray is an external input recorded once, into the reservoir rather than the dish field. Permit partial fills up to capacity. Reject a different recipe or nutrient ratio while any inventory remains. Emptying exports the exact remaining contents as a logged player action. Direct collection from the dish is deferred; the existing sample tool handles material movement.
Rates are 0.01, 0.02 or 0.05 carbon per simulated second, default 0.02. At conversion stage 3, after environmental transport and before ordinary feeding, an enabled reservoir requests min(rate × dt, remaining carbon). Transfer that carbon and the same inventory fraction of companion nutrient into its own cell. Commit both pools together and reduce the stored inventory once. The product is available for feeding this tick and normal diffusion thereafter.
Retain an internal remaining-inventory fraction with adequate precision; the last output transfers the exact remainder. If the receiving cell is invalid after a habitat edit, output is zero and the device reads Blocked. Do not remove or export its stock automatically. Pause and move it or restore a valid substrate.
## Readable quantities
The panel shows stored carbon, bound nutrient, selected rate, actual output during the last second, cumulative output and time to empty at the selected rate. A full 20-carbon reservoir lasts 1,000 simulated seconds at 0.02/s, ignoring pauses and blocked time. Label that estimate as active dispensing time. A partial fill updates the estimate immediately.
## Tradeoff and ecology
A steady food source can support a feeding hotspot, draw grazers and intensify competition. A larger rate can grow a population faster while exhausting the same stock sooner. Empty inventory can produce a crash, but the game never schedules that outcome. Inspect which lineages consumed the released food and whether oxygen or nutrient became limiting.
Keep the existing slow feeder pellet unchanged: it is a finite food object, not a configurable reservoir. The new device adds control and explanation, not a cheaper infinite version of that object.
# 06  Local light lens
LAB02 adds visible, local environmental light. It occupies one device cell and illuminates passable habitat cells within radius 3. Intensity choices are 0.10, 0.25 and 0.50, default 0.25. It requires an explicit On action. It has no material inventory, no organism-energy drain and no hidden warming effect. Its input is labeled external illumination.
## Exact field rule
For each target cell, use the shortest four-neighbor path through valid habitat cells from the lamp cell, ignoring furnishings but respecting impermeable walls and fully closed shutters. At path distance d ≤ 3, contribution is intensity × (1 − d/4). Beyond that distance, contribution is zero. Fine membranes and Small gates transmit this game light without changing its strength. Use this disclosed grid-light rule consistently; do not infer optical properties from transport class.
Compute source light as clamp(habitat baseline × day/night factor + sum of enabled lamp contributions, 0, 1). Then multiply by painted shade, roof shade and canopy factors under the existing shading rules, and clamp to 0–1. This explicitly extends D2’s light formula. Multiple lamps add before shading; they cannot bypass shade by applying their contribution afterward.
At environment stage 2, recompute affected light cells after device commands and climate phase updates, using the same start-of-tick canopy snapshot as D2. Cache lamp neighborhoods until their position, relevant barrier state or terrain changes. Device intensity and shade changes invalidate affected fields. Effective light shown by the inspector must match the value used by photosynthesis.
## Controls and limits
Show source contribution separately from effective light. A lamp under heavy shade can be On while delivering little useful illumination. The light overlay can preview a change while paused but cannot run photosynthesis. The lamp neither attracts ordinary organisms by fiat nor teaches a lineage light-seeking behavior; only existing sensing and compatible inherited controllers can respond.
This intentionally simplified illumination makes night refuges and light gradients possible without a full optical renderer. Day/night remains an environmental setting. Signal glow remains a cosmetic biological signal and never contributes to photosynthetic light.
## Ecological opportunity
Sunbead may sustain production near a lamp while neighboring cells experience darkness. That can support consumers and concentrate grazing pressure. Light only enables the existing photosynthetic pathway: carbon dioxide and nutrient are still required, and carbon accounting remains intact.
# 07  Probes and bounded sensor controls
Reuse a saved observation region as the sensor mask; no additional physical probe is required. Retain the six-region limit. A controller watches one measurement: mean oxygen, mean effective light, mean warmth, total sugar carbon, total living biomass, or count of one selected ancestor template. Means include valid habitat cells in the mask; totals use those cells without averaging. An empty mask is invalid.
## Controller record
Store rule ID, region ID, metric and optional template ID, direction High or Low, enter threshold, reset threshold, hold duration, cooldown, target device ID, action, enabled state, last sample tick, condition start tick, armed state and last-fire tick. Maximum eight controllers per dish, one controller per target device. Initial state is enabled but unarmed until a valid reset sample, unless the player explicitly chooses Arm now in the paused setup preview.
Supported actions are reservoir On/Off, lamp On/Off, S09 heater On/Off, S10 cooler On/Off and S03 shutter Open/Closed. One rule performs one action. It cannot load inventory, spawn organisms, change genes, run arbitrary code or trigger another rule directly. Use the existing recipe schedule for planned time-based changes.
## Threshold semantics
High enters at value ≥ enter threshold and resets at value ≤ reset threshold, with reset strictly lower than enter. Low enters at value ≤ enter and resets at value ≥ reset, with reset strictly higher. Reject thresholds outside the metric’s domain or with invalid ordering. Default continuous hold is 5 simulated seconds; choices 1, 5 or 10. Cooldown choices are 10, 30 or 60 seconds, default 30.
Sample once per simulated second after stage 10 publishes the current measurements. Begin the hold timer at the first qualifying sample; fire only once elapsed qualifying time reaches the hold duration. Any nonqualifying sample clears that timer. After firing, disarm. Rearm only after cooldown has elapsed and a reset sample is observed. Missing or invalid measurements disable the rule and show a reason.
## No instant feedback loop
Queue the action for the next biological tick. It cannot affect the snapshot that caused it. A firing does not guarantee a successful output: turning an empty reservoir On still leaves it empty. Save the queued action and all rule timers.
# 08  Manual control scheduling and trust
## Command ordering
Keep a monotonically increasing command sequence within each world. Manual edits, accepted scheduled actions and controller firings receive a sequence when queued. At stage 1, apply due commands by target tick, then sequence. Controller rules sampled at the same second queue in ascending rule ID order. This makes ordering independent of rendering speed and worker message timing.
An explicit manual change to an actuator cancels queued automatic actions for that actuator and pauses its controller and future scheduled actuator actions. Show “Manual control — automation paused.” Resume requires an explicit action and preserves future schedule times; missed actions are marked skipped and are never replayed in a burst. Inspecting or changing a label does not take manual control.
## Staging conflicts and removals
Reject a second controller on an already controlled device. A schedule and controller may target the same device only after the setup preview displays their potential conflict and the player enables both. The recorded command sequence resolves simultaneous due commands. Prefer simple single-purpose recipes for learning. Removing or moving a device is a paused transaction; removal cancels its queued actions and disables references, while relocation preserves the same device ID.
## Useful built in example
Attach a Low-oxygen rule to a feeding reservoir: enter at mean oxygen ≤ 0.30, reset at ≥ 0.45, hold 5 seconds, cooldown 30 seconds, action Off. Explain the limited claim: stopping food delivery can reduce a source of demand over time; it does not generate oxygen or guarantee recovery. The player manually resumes when ready, which is recorded as an intervention.
A later recipe can use a High-light rule to switch a lamp Off above a threshold. Do not add a general-purpose logic language in this expansion. If two-way control becomes necessary, design and validate an explicit two-state controller in a later revision instead of stacking contradictory rules.
## Visible audit trail
Every firing records metric, region, observed value, thresholds, hold time, target, queued tick and eventual action result. Selecting the event highlights the relevant region and device. Display threshold and firing markers on the chart. A rule that never fires is a valid outcome; show whether it is waiting for reset, waiting for hold, cooling down, disabled or paused by the player.
# 09  Sampling and specimen handling
Keep one sample slot and the existing Life, Dissolved, Deposits and All modes, with radius 1/3/6. Sampling is a move. It must preserve fields, companion nutrients, exact genomes, energy, age, infection, host ownership and all applicable life states. A specimen gallery remains an image and record, never a spawn source.
## Living Lab transaction amendment
Beginning a sample pauses its source dish and captures a transaction checkpoint. Preview the full selection and the inventory that will be held. Confirm moves it into the sample slot, which is an accounted holding compartment of the source world. Keep the source paused until the player completes a valid transfer, cancels the transaction or explicitly discards the sample. Thus a held specimen receives no extra safe time while its source ecosystem continues.
Cancel restores the transaction checkpoint exactly. Discard requires confirmation and logs exported material and removed life. Same-dish transfer validates every destination before committing. Cross-dish transfer requires both dishes paused and a compatible ruleset; validate the complete destination, then commit source export and destination input atomically. Preserve a transaction ID for crash recovery so retry cannot duplicate the sample. No partial transfer is permitted. Cross-dish undo must restore both worlds atomically and is available only while neither world has changed since the transfer; never permit one-sided undo.
## Relationships and topology
A host and attached parasite transfer together under the existing rule. Any selected colony or connected relationship must either be moved as its complete required ownership unit or rejected with a highlight showing the missing members. In this expansion, do not auto-expand a brush silently. Reject selections that would leave a fungal link, adhesion link, sharing bond, trapped prey or claimed target dangling. Explain the specific dependency.
Fields keep their cell offsets. Organisms keep relative positions and legal attachment requirements. Reject a target that cannot support the sampled state or capacity. A failed transfer leaves the sample intact and the transaction paused. On reload, restore the pending transaction and offer Complete, Cancel or Discard; do not restart biological time automatically.
## Why this matters to play
Players can move a real lineage to a new habitat and see whether its success persists. A favorable result in one dish does not establish universal superiority. Keep source lineage and intervention history visible after transfer, and record any ruleset conversion as a separate copy operation before moving the sample.
# 10  Interactions that create new decisions
Combination
Player decision
Mechanism and possible consequence
Reservoir and Sprinter
Pulse food or release it slowly.
Finite delivery changes access and competition; equal total food may produce different timing.
Reservoir and Amoeba
Place a feeder near or away from grazers.
Feeding hotspots can concentrate prey and encounters; no automatic predator attraction.
Lamp and Sunbead
Provide a refuge through darkness.
Photosynthesis can continue only where light and material requirements are met.
Lamp and canopy
Place illumination near growing cover.
Canopy attenuates the added light; a population can change its own light access.
Membrane and Crumbsmith
Separate producer and beneficiary.
Enzyme activity and sugar can cross at the existing flux; organisms stay separated.
Shutter and descendants
Open a passage after isolation.
Existing lineages meet; competition and mixing depend on their actual capabilities.
Small gate and mixed life
Choose the passage size.
Use the established transport-class rules; do not infer passage from sprite dimensions.
Heater and inherited preference
Create a persistent gradient.
Preference tradeoffs may change survival and reproduction; mutations remain unguided.
Resin and rivalry
Place finite cleanup near an exposed population.
Selected activity is removed until saturation; it is not general immunity.
Sampling and reserve ability
Move descendants into a different food schedule.
A reserve may help only after surplus can be earned; upkeep can be a disadvantage.

## No hidden synergies
Equipment combinations use existing equations. Do not add a bonus because a player placed a clever-looking arrangement. Any observed advantage must come from measured access, transport, environmental response, timing or inherited ability. The relationship map can show actual transfer and consumption without declaring that one species “intended” to help another.
Attach a short question to each equipment combination in the Field Guide. Favor “Who consumed the released sugar?” over “Make a perfect ecosystem.” The first question can be answered from records; the second has no defined success condition and encourages arbitrary balancing.
# 11  Research skills and rewards
Research skills are local notebook records showing practical understanding. They do not change physics, mutation rates or species eligibility. All sandbox tools and their help are available immediately. Guided research may suggest a sequence, but players can inspect or attempt any lesson.
Skill record
Demonstration required
Visible reward
Observer
Select life, inspect a measured limiting factor and pin a related event.
Observer notebook stamp and a saved annotated observation.
Dose planner
Load a finite reservoir and compare planned inventory with cumulative output and remainder.
Dose planner stamp and a reusable equipment preset.
Habitat architect
Use a barrier and inspect both an allowed and a blocked transport class.
Architect stamp and a saved layout thumbnail.
Experiment designer
Duplicate a baseline, record one planned difference and complete an equal-duration comparison.
Experiment stamp and a completed comparison card.
Lineage tracker
Pin a branch and inspect its inherited difference, ancestry and descendant evidence.
Lineage stamp and an optional cosmetic branch-frame style.
Control operator
Configure a valid threshold rule and inspect its actual firing or documented non-firing outcome.
Control stamp and a saved rule preset.

## Validation and honest limits
Grant stamps from explicit recorded actions and required data availability, never from time spent in the app. A stamp confirms completion of an activity, not scientific expertise or proof of a hypothesis. A failed population can still produce a complete experiment. For a non-firing controller, require reaching the recipe stopping time and inspecting the recorded reason; simply placing a rule is insufficient.
Presets store settings only, never inventory, specimens or completion evidence; saving presets is available before earning stamps. Keep completion evidence IDs and the originating build and ruleset. Importing another person’s notebook does not award local completion stamps. Cosmetic frames and stamp styles can be selected freely in sandbox accessibility settings; rewards must not become a barrier to readable information.
## Progress without grind
Show the six records as a notebook spread with Done, In progress and Try next. Do not add levels, energy timers, daily streaks or repeated feeding chores. Returning to the game should invite a new question, a different arrangement or a saved lineage. The player’s growing skill is their ability to design and interpret experiments.
# 12  Challenge recipes for the first release
These are proposed fictional scenarios for the equipment release. Use the D6 clear-water environmental baseline, no stones, no background sugar, open lid, seed 104729 and Fixed Traits unless a recipe says otherwise. Start paused. Use D6’s nearest-cell ordering for founder placement and its neutral founder inventories. Disable unrelated schedules and controllers.
## LABR01  A pulse or a steady meal
Place 12 B01 in distinct cells nearest (64,64), radius 2. Place a reservoir at (64,64) holding 6 sugar carbon with 0.6 companion nutrient, rate 0.02/s. Duplicate the paused world. In the steady arm turn the reservoir On. In the pulse arm use an explicit experimental inventory-transfer command to release the entire same reservoir inventory into its cell at tick zero. This command is available only in recipe setup and is logged; it creates no extra stock.
Run both for 300 simulated seconds. Compare births, deaths, remaining dissolved sugar, final biomass and cumulative intake. Success is completion of the comparison and accounting of all six carbon units from each starting reservoir, including stored or transformed pools. No particular winner is required. Allow Inspect, Pause, Speed and Compare during the run; modifying an arm marks the run exploratory.
## LABR02  A refuge in the dark
Set the fixed habitat light baseline to 0.05. Place 12 A01 within radius 2 of (64,64). Place a lamp at the center, intensity 0.50. Duplicate; turn it On only in the intervention arm. Run for 300 simulated seconds. Compare effective light, photosynthetic carbon fixation, biomass and deaths. Display carbon dioxide and nutrient limits alongside the result. Success is observing and inspecting measured light and intake differences, or documenting why intake remained zero.
## LABR03  Stop when oxygen falls
Use the steady arm of LABR01, but initialize oxygen at 0.25 and set the lid closed. Add a circular probe of radius 3 at (64,64). Use it for the Low-oxygen controller in section 8 with Arm now selected. Run for 60 simulated seconds. The task is to inspect the queued Off action and account for stock released before it took effect. The tutorial verifies control behavior, not ecosystem recovery. Compare against the identical controller-disabled copy if the player wants to explore ecological consequences.
# 13  Open research and long term play
## Question cards rather than forced victories
After the first three recipes, present optional open questions: Can a lineage persist after a feeder stops? Does a membrane change who benefits from enzyme release? Will a night refuge concentrate grazers? Can a thermal preference that helps in one region become costly in another? Each card names the needed equipment and offers a baseline snapshot, then leaves the player free to choose an intervention.
Record the hypothesis before the run if the player wants to write one. At the end, display the original wording alongside measured changes and confounds. Do not automatically grade free text as proven. A result may support, contradict or fail to distinguish a prediction. The player selects a conclusion label and can add a note.
## A living experiment portfolio
Reuse the existing recipe card, region charts, branch pins, gallery and bookmark limits. An experiment entry references a baseline checksum, ruleset, seed, equipment settings, action log, controller events, end snapshot reference and conclusion note. Text-only records remain explicitly non-replayable. Full snapshots count against existing limits; do not silently store unlimited worlds inside the notebook.
Add a comparison summary with four questions: What changed? What was held the same? What did the records show? What remains uncertain? Show unplanned additions, manual overrides and different stopping times so the player can understand limitations without losing the value of an exploratory run.
## Natural stories to preserve
An empty feeder can reveal a reserve-bearing descendant; closing a shutter can isolate a small population; changing illumination can alter a food web. Bookmark actual events when they happen. Do not manufacture a “resilient survivor” by changing the outcome. If the pinned lineage disappears, retain its story and the recorded causes.
## Advanced research after later catalog waves
Introduce colony transport questions only after those structures work, dormancy comparisons after the complete resting state is available, and host-dependent interactions after explicit host eligibility is verified. Keep advanced experiment cards hidden behind “Requires content not in this build” in internal builds; a public release should display only supported recipes.
Long-term novelty comes from new combinations of organisms, equipment and starting conditions. Future authored instruments must satisfy the same inventory, causality, explanation and persistence requirements before entering the sandbox.
# 14  Aesthetics and interaction details
Continue the pixel microscope garden style. Equipment should look like small, readable scientific props around living color, with no industrial clutter or realistic medical imagery. Use the same pixel scale and palette as D1. Thin neutral outlines keep organisms visible beneath nonblocking devices. Selection highlights use shape and pattern as well as color.
Element
Required visual states
Meaning
Reservoir
Off, Running, Empty, Blocked; four stock-fill bands.
Fill shows stored inventory; a small pulse appears only on actual transfer.
Lamp
Off, On; three intensity marks; selected footprint.
Lens brightness is distinct from the measured light overlay; no fake biological glow.
Controller
Waiting, Holding, Queued, Cooldown, Paused, Invalid.
A small linked badge conveys logical state; details explain the threshold.
Sampling
Footprint preview, held sample, valid target, rejected target.
Preview includes whole ownership units and explicitly shows the paused transaction.
Research record
Available, In progress, Completed.
Notebook stamps reflect evidence records; no level meter or biological power increase.

## Equipment panel
Show item name and status first, then the primary setting, actual effect and remaining stock where relevant. Put controller linkage and history in expandable sections. The primary action is one clear On/Off or Open/Closed control. A manual override explains the automation pause before commit. Empty feeders show Load; blocked instruments show the exact terrain or reference problem.
## Connecting a rule
Choose a probe region, metric, threshold direction, enter/reset values, hold/cooldown and one device action. Preview the sentence “When [metric] stays [condition] for [duration], [action].” Show which threshold rearms it. Offer a chart with threshold lines and current value. No wire-drawing gesture is required on a phone; an optional dashed selection link is purely illustrative.
## Accessibility and sound
Preserve D6 touch targets, contrast, text scaling and supported layouts. Every threshold and state has a text label. Reduced motion replaces dosing pulses with a static output indicator. Optional soft clicks mark successful equipment actions; no continuous pump drone or repeating alarm is required. Equipment placement must remain usable without audio, precise dragging or distinguishing red from green.
# 15  Engineering state and conservation
## Data additions
LAB01 state includes stable device ID, cell, enabled flag, recipe ID, stored carbon, companion nutrient, selected rate and cumulative actual output. LAB02 includes ID, cell, enabled flag and intensity. Derived lamp fields can be rebuilt from authoritative inputs. Controllers save every field in section 7, including pending action identity. Research records save completion evidence and recipe provenance outside biological state.
Sample transactions save the source checkpoint reference, inventory, world IDs, transaction phase and intended destination when applicable. A cross-dish transaction needs durable prepare and commit records for both saves. On interrupted import or commit, recover to either both old states or both completed states; never one old and one new. If the platform cannot guarantee that, keep cross-dish transfer disabled and report it as a limitation while same-dish transfer remains available.
## Update integration
Stage 1 applies validated manual, schedule and controller commands. Stage 2 updates lamp contributions with environment and existing field transport. Stage 3 releases reservoir inventory alongside existing finite-food release, before feeding. Stages 4–9 retain the established behavior and birth order. After stage 10 summaries, sample controller metrics at the one-second cadence and queue eligible actions for the next tick. Commit rule timers and queued actions before the consistent-tick save boundary. Paused edits recompute diagnostics but do not advance timers or fire rules.
## Material ownership
World totals include all reservoir contents and held samples, plus existing fields, organisms, meals, deposits, food objects and structures that own tracked material. Loading is an external input; release is an internal transfer; removal is an external export. A lamp supplies environmental energy, not carbon or nutrient. Controller records own no material.
Use stable IDs to resolve references. Unknown devices, missing masks, impossible nutrient ratios and duplicate ownership must fail validation. Cosmetic assets never determine device behavior. Snapshot, undo and comparison restore the complete equipment and automation state; replay requires the same capability version and command log.
## Bounded work
Retain the 256-device, 512-edge, six-region and existing organism limits. Controllers are capped at eight and sample at 1 Hz simulated time. Update cached lamp neighborhoods only when invalidated. Aggregate optional effects under load. Do not drop controller evaluations, biological ticks or material transfers to preserve animation frame rate.
# 16  Verification and balance evidence
Check
Required result
Reservoir conservation
Starting stock equals cumulative released stock plus remainder and logged exports; carbon and companion nutrient never duplicate.
Rate and empty state
At 0.02/s, 6 carbon empties after 300 active simulated seconds; pauses and blocked ticks release zero; final remainder transfers exactly.
Light formula
Two lamps add before shading; closed shutters block the declared paths; signal glow supplies no light; inspector agrees with photosynthesis.
Controller timing
Hold, hysteresis and cooldown match section 7; a trigger action affects the next tick, never its own measurement snapshot.
Manual precedence
Manual actuator edits cancel queued automation and pause future automatic control; resume does not replay missed actions.
Sample transaction
Failed placement moves nothing; cancel restores exactly; relationships remain valid; recovery cannot duplicate inventory or organisms.
Persistence
1×, 4× and save/reload agree on authoritative state for the same rules and commands, including pending triggers and samples.
Access and rewards
No research stamp alters biology or blocks sandbox tools; imports cannot forge completion evidence.
Understanding
A fresh reviewer can explain remaining stock, effective light, one rule state and the difference between a badge and an inherited trait.

## A small tuning review
Run LABR01–LABR03 first at their stated seed. Fix correctness failures before varying balance. Then run LABR01 and LABR02 at D6’s six development seeds with the same recorded parameters. Report all outcomes, including extinction and no measured difference. Do not change mutation settings to make an equipment recipe look more successful.
Use the existing minimum-device performance target and 15-minute stress scene, adding the maximum enabled device count and eight controllers. Record real devices, effective speed, peak memory and interaction responsiveness. Equipment introduces no permission to increase organism limits or weaken deterministic checks.
## Design review target
In a short observed session, at least four of five unfamiliar reviewers should place and configure a feeder, identify its finite stock, and explain why an empty On feeder releases nothing. Treat this as a formative target. Report actual findings and correct misleading controls before adding more instruments.
# 17  Implementation order and ownership
Stage
Engineering work
Design work and exit
LL1 Finite feeding
LAB01, loading ledger, stage 3 release, saved inventory and LABR01. Requires D6 G2 plus finite-food support.
Reservoir art and panel; player can distinguish stock, rate and actual output; accounting checks pass.
LL2 Local light
LAB02, field formula, barrier invalidation and LABR02. Requires D2 light and shade systems.
Lamp states and overlay; effective illumination and remaining resource limits are understandable.
LL3 Simple control
Probe metrics, eight-rule cap, timers, command ordering, manual override and LABR03.
Rule editor and history; trigger timing and waiting states are inspectable.
LL4 Safe transfer
Paused sample transactions, ownership validation and recovery; cross-dish only when atomic persistence works.
Selection and rejection previews; no ambiguous copied specimens or hidden relationship loss.
LL5 Research layer
Evidence records, six stamps, recipe cards and experiment summaries.
Notebook and challenge flow; no sandbox lockout or biological buff.
LL6 Mixed validation
Save migration, dense scene, accessibility and interactions with enabled catalog.
Final layouts, clear failures and complete handoff evidence.

## The first sprint deliverable
Make LL1 the first small delivery: one working reservoir, the complete stock ledger, its device panel and one pulse-versus-steady comparison. Return a playable plus evidence before expanding to controllers. This is a scoped milestone, not a promise that it fits a particular number of hours. Estimate it against the actual codebase and team availability.
## Parallel responsibilities
The simulation lead owns inventory and tick integration. The application lead owns commands, persistence and transactions. The design lead owns equipment states, panels and explanation. The product owner accepts scope and reviews the comparison evidence. Shared state and event names must settle before final motion assets are produced.
## Deferred additions
Defer arbitrary chemistry cartridges, unlimited tanks, remote teleport pumps, a logic-programming language, genetic editing, equipment crafting currencies and online laboratories. They add substantial rules or production work before the proposed core tools have demonstrated value. Revisit them through the extension contract after this kit is understandable and useful.
# 18  Deliverables and required team response
Add a Living Lab section to the existing EXPANSION_RESPONSE.md. Keep one consolidated response for the full project. Do not create a separate status document for every instrument. Mark each feature Implemented, Partial, Deferred or Blocked and identify the exact build that contains it.
Deliverable
Required contents
Playable and source
LL stage reached, commit, capability and content versions, dependencies and actual device configurations.
Equipment data
LAB01/LAB02 definitions, reused S01–S12 mapping, legal loading recipes, field formulas, controller schema and validation.
Interaction evidence
One annotated reservoir comparison, one light comparison when available, and a recorded controller decision with input values and action tick.
Correctness report
Section 16 results, exact stock accounting, failed fixtures and saved reproduction files; no claim of a pass without execution.
Design package
Reservoir and lamp state assets, controller badges, sample previews, six research stamps, panels and responsive layouts.
Recovery report
Undo, pending triggers, invalid references, interrupted sample transfers, save migration and unsupported capability behavior.
Next work
Estimate to the next LL stage, unresolved rule questions, balance changes with reasons and any proposed scope amendments.

## Acceptance for this expansion
The kit is complete when a player can load a finite feeder, observe its ecological effects, create a local light change, attach and understand a bounded sensor rule, move a valid specimen without duplication, and preserve an interpretable experiment. The simulation must explain actual transfers and conditions. Research stamps remain optional records of activity.
## Its place in the larger game
The previous documents define what life can do and how descendants change. This expansion gives the player a richer way to ask questions of that life. The same instrument can have different consequences with different organisms, quantities, placements and inherited traits, which directly supports Pixelmeba’s central promise.
Begin with the reservoir and its comparison. Use the result to validate the equipment interaction pattern, then reuse that pattern for light, control and research. Add later organisms and abilities to this working laboratory through explicit compatibility and evidence, so expansion deepens the game without making it harder to understand.