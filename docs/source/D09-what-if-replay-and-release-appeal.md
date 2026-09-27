# 01  The product people can explain
# Pixelmeba
What If?Replay and Release Appeal
Document 9 • Version 1.0 • September 27 2026 • Developer and designer handoff
Make the deepest part of Pixelmeba accessible through a simple invitation: change one thing and see what happens. A player should enjoy their first small experiment, recognize something they caused, and immediately imagine another experiment. A viewer should understand the appeal before understanding the science.
## The public promise
“Grow a tiny living world. Change one thing. See what happens.”
Pixelmeba is a playful pixel ecosystem sandbox. Add life and food, shape a habitat, follow changing families, and try different versions of the same dish. Its identity combines approachable touch controls, readable interactions and inherited variation. The numerical biology remains fictional; this is entertainment with opportunities for discovery.
## The strongest new feature
Add a What if? action that turns existing starter dishes into clear, repeatable variations. Pair this with an optional Try my dish handoff and exports that distinguish a picture, a starting recipe and a living save. These features make the existing simulation easier to revisit and easier to recommend.
## What makes it worth buying
The intended value is a beautiful, responsive sandbox that offers both quick curiosity and longer experiments, with reliable saves, understandable outcomes and a fair purchase. More species alone will not create this value. The game needs an attractive first minute and enough interaction between its systems to support ideas players invent themselves.
Commercial success is a hypothesis to test, not a feature guarantee. The release plan must bring the game to suitable audiences; word of mouth can then build on a product they understand and enjoy. This document specifies the replay and presentation layer, not a sales forecast.
# 02  Its place in the existing build
Document 6 remains the read-first production plan. Documents 7 and 8 remain the equipment and accessible-experience specifications. This addition reuses their systems and adds a small recipe-driven replay layer. It does not expand the organism catalog or change the evolution model.
Existing specification
Preserve
Addition here
D1–D2: core and expansion
Physics, commands, save limits, recipes and objective engine.
Recipe variants, explicit share choices and replay metadata.
D3–D5: evolution and behaviors
Inheritance, trade-offs, lineage evidence and birth rules.
Use actual outcomes as reasons to revisit; never promise a mutation.
D6: build priorities
G0–G5 gates, first roster, performance and production ownership.
An ordered delivery slice and product validation gate.
D7: Living Lab
Finite feeders, lamps, controls and exact comparison recipes.
Two equipment invitations only after their dependencies ship.
D8: accessible play
Explore/Lab views, favorites, story cards and Play entry.
What if? within Play; no additional permanent toolbar button.

## Explicit amendments
R01 adds versioned variants of bundled recipes. R02 adds an optional goal wrapper using D2’s objective engine. R03 adds local Try my dish turns using an immutable baseline. R04 clarifies exports and introduces short identifiers for bundled recipes only. R05 defines the demonstration, commercial presentation and release checks on pages 10–13.
D8’s recommendation to stop broad feature expansion still applies to biological systems. Complete a small replay slice alongside the playable, then test it before expanding its content. None of these additions makes a full online community, procedural campaign or new simulation engine a launch dependency.
## Authority when documents overlap
The six invitations on page 5 are recipe variants, not edits to their source recipes. Source recipes retain their IDs and values. D7 owns equipment behavior; D8 owns Explore controls and story evidence. Existing capacities and resource accounting remain binding. If a required capability is absent, omit that invitation from the shipped menu rather than displaying an unusable reward lock.
# 03  A loop with room to keep playing
The core loop is: choose a question, make a change, watch a real response, keep something interesting, and try another version. The player may stop at any step. Free play always remains available without a goal, timer or completion requirement.
Player intention
Entry and behavior
Natural next action
“I want to play now.”
Play opens the existing invitation shelf. One card opens a paused preview.
Start, then use Add Life, Feed and Look.
“What if I changed this?”
What if? opens a small sheet with recipe-specific choices.
Preview the single change, then start a separate dish.
“Give me a little challenge.”
Optional goal on an invitation; same world and rules.
Continue freely or retry the original baseline.
“Look what I made.”
Notebook or pause menu offers the share sheet.
Export a picture, recipe or living save.
“You try.”
Try my dish starts a local turn from a saved baseline.
Pass the device; each turn begins paused.

## Concrete first-use flow
Continue and Play remain the primary home actions. Inside Play, show Garden first, followed by supported D8 invitations. Selecting Garden displays the dish preview, one question and Start. A secondary What if? link reveals “Less food,” “More food” and “Food farther away.” Keep numerical values under Details.
Each variation explains its one change in ordinary language. Starting it preserves the current dish through the existing save flow and creates a separate world ID. If no save slot is available, offer export or a deliberate replacement choice; cancel returns without losing the current world. Starting never silently replaces a named save.
## Depth remains optional
Explore keeps its three primary actions. Lab reveals precision controls in the same world. Replay controls belong to Play, the pause menu and the end of an optional turn. Never add a dashboard of currencies, streaks, objective counters and evolution statistics around the dish.
A quiet result is still valid. Explain “No new family branch was recorded” or “These runs stayed similar.” Offer a different food placement or longer observation window where supported. Never manufacture an event to make a card feel successful.
# 04  What if? behavior and data contract
The initial release remixes authored starting recipes. It does not automatically reinterpret an arbitrary evolved world. In a custom dish, offer Duplicate dish through the existing save system; precise before-and-after experiments remain available through D6 comparison.
## One clear variable
A remix selects one registered variant from an immutable source recipe. Keep its simulation version, content version, seed, founder settings and all other starting values unchanged. This makes the difference understandable; it does not guarantee the same later outcome after players intervene differently. Combining several changes remains possible in ordinary sandbox editing.
Record or rule
Required behavior
RecipeVariant
Stable ID and revision; source recipe ID/revision; required capabilities; localized title/question; one allowed parameter change; preview difference; optional objective ID.
Identity
Record source and variant checksums, seed, simulation/content versions and realized initial-state checksum. A changed value requires a new recipe revision.
Realization
Resolve the source, apply the validated patch, validate terrain/capacities/accounting, instantiate a fresh world and leave it paused. Do not simulate during preview.
Again
Rebuild this same starting recipe and seed. It does not resume the last outcome or copy descendants.
Another idea
Choose another supported variant in a stable catalog order, excluding the current one. Do not consume the simulation random stream.
Failure
Missing content, unknown revision, invalid placement or limit overflow stops creation with a readable explanation. Never silently substitute organisms or clamp a recipe.

## Determinism and resource honesty
Recipe initialization records its material and founder inputs using existing accounting. Changing starting food changes declared initial resources; it is not a free injection into a running dish. Variants never award biomass, refund energy or bypass birth placement rules. Run visual animation and suggestion selection outside simulation randomness.
At the same supported versions, identical realized state, seed and command sequence must reproduce the same result under the existing deterministic contract. A seed alone cannot recreate a player’s later edits, evolved descendants or current world state. Store enough provenance to describe the artifact honestly.
# 05  Six invitations from existing systems
Ship the first four with the Garden replay slice. Add the final two only after Living Lab dependencies pass. Every invitation uses the named source recipe exactly, except for the stated patch. No extra inhabitants, hidden food, adaptive difficulty or guaranteed evolutionary result is permitted.
ID and invitation
Exact recipe definition
Player-facing question
R-G0Garden
D6 FIRST_DISH_V1 unchanged. Seed 104729; Standard mutation; Identical founders.
Who finds something to eat?
R-G1A smaller meal
FIRST_DISH_V1; replace sugar concentration in its original radius-6 patch at (48,64) from 0.40 to 0.20 C per cell. All other pools unchanged.
What changes when there is less food?
R-G2A bigger meal
FIRST_DISH_V1; replace the same patch from 0.40 to 0.80 C per cell. Do not change nutrients or founders.
Does more food help every family?
R-G3Dinner farther away
FIRST_DISH_V1; move only the original sugar patch from (48,64) to (48,82), radius 6 and 0.40 C per cell. Clear that original patch to its source background sugar value.
Who reaches the food now?
R-L1Slow snack
D7 LABR01 steady arm, exactly: its finite feeder starts On. Fixed mutation; source seed and stock unchanged.
What happens when food arrives slowly?
R-L2Light in the dark
D7 LABR02 lamp-On arm, exactly. Fixed mutation; source environment and founders unchanged.
Where does light help life grow?

## Preview and comparison
For R-G3, show an outline at the old position and a solid patch at the new one before Start. Preserve the original sugar mass; validate that the full old and new masks are valid water cells with equal cell counts. Reject rather than crop if a future source revision breaks this assumption.
Garden variants may offer the existing 180-simulation-second paired comparison against R-G0, with equal horizons and no extra commands by default. Run sequentially on constrained devices. Show both counts and food remaining, with a plain statement of the changed input; a single pair is an illustration, not general proof.
Slow snack and Light in the dark link to D7’s prescribed paired experiments. Their Fixed mutation setting must remain visible in Details; they demonstrate equipment effects, not spontaneous new abilities. All six invitations start paused and have no wall-clock deadline.
# 06  Optional goals and local turns
Use goals to answer “What can I try?” without making every dish a test. Goals are off by default in free play. A player can leave a goal at any time and continue the exact current world; the record then says “Continued freely.” No loss screen destroys a dish.
Initial goal
D2 objective mapping
Completion rule
See a Sprinter split
Observe event: committed B01 birth. Offer on Garden variants.
Complete on the first matching birth after Start. Cancelled or blocked birth proposals do not count.
Keep Sprinters going
Keep named species B01 alive. Offer on Garden variants.
B01 count stays above zero for 180 simulation seconds. Reaching zero ends the attempt; the world remains usable.
Watch starch become food
Observe recorded starch-to-sugar conversion. Offer on Garden.
Complete on a positive actual conversion event, not merely enzyme presence. Do not invent a producer attribution.

## Start, pause and finish
Goal state is inactive, running, completed, ended or continued freely. Start arms the predicate at the current baseline tick. Pause stops simulation time and the goal clock. Completing a goal shows one dismissible sentence and Continue; the dish keeps its current pause/running state. Do not layer this message over another D8 notification.
Initial goals use ordinary sandbox tools with no action budget. They are personal invitations, not ranked challenges. Later constrained challenges may use D2’s existing allowed-tool and command-budget fields, but must display those restrictions before Start. Never change the simulation to force success.
## Try my dish: a shared-device feature
From a paused dish, capture a full immutable baseline in an existing snapshot/save slot and choose one supported goal and a 60, 180 or 600 simulation-second turn. Default: 180 seconds and free observation. Save availability and version checks happen before accepting the setup.
Each turn clones that same baseline into a new world ID, begins paused, and uses the existing tool policy. At the horizon, pause and offer Keep this result, Another turn or Finish. No usernames, accounts, rankings or network synchronization are needed. Temporary turns replace only the prior unsaved turn after an explicit discard choice; a kept result consumes a normal save slot.
Offer only goals compatible with the baseline and turn length. Reset progress each turn. Saves retain the baseline reference, goal state, start tick and horizon; reload never restarts the clock. If a baseline is missing, disable Another turn without losing the current result.
Goal completion may happen before the horizon; the turn can continue. Results show elapsed time and recorded events, never an invented universal score for a healthy ecosystem. Compare turns only when baselines, rules and versions match.
# 07  Share something someone can play
Sharing should preserve the curiosity of the moment. Offer three clearly different artifacts, each with a preview and a plain description. Export is always initiated by the player. No automatic upload, public profile, referral reward, contact access or in-game social feed is required.
Share choice
Contains
Recipient can do
Picture
One current image or an existing D8 story card; optional question; game name and supported recipe identifier.
View it. A picture does not contain the living dish.
Starting recipe
D2 recipe export in the existing .petri format: initial state/recipe, seed, permitted schedule and required versions.
Start the same setup. Later manual edits and descendants are not included unless explicitly recorded in a supported recipe.
Living dish
A normal full .petri save at a consistent paused tick, including required world and random state.
Continue that saved world on a compatible build. This is the choice for sharing evolved organisms in context.

## Bundled recipe identifiers
Use an offline identifier such as “R-G3 / revision 1 / seed 104729” for a bundled invitation. It names an installed recipe; it is not a hosted link and cannot encode a custom world. Provide a Copy recipe details action and an Import recipe ID entry under Play. Resolve only exact supported IDs/revisions and valid seed values.
Show simulation and content versions in Details and export metadata. An unavailable revision produces “This recipe needs a compatible build” with its identifiers. Do not silently reinterpret it. Custom starting recipes and living worlds require their actual .petri file; never imply a short code alone stores them.
## Import and privacy behavior
Validate the existing 25 MB file limit, schema, finite numeric ranges, object limits and known content IDs before loading. Treat metadata as text; allow no scripts or executable expressions. Stage imports in a new slot and leave the current dish intact on any failure. Open valid imports paused, with a summary of what was loaded.
Default pictures omit player nicknames and private notes. Reuse D8’s opt-in name export. Full save exports explain that the file includes world names and notes, and offer a metadata-stripped copy that retains simulation state and recomputes the file integrity hash. Use the operating system’s share/save flow; cancellation leaves the game unchanged.
# 08  Art direction that communicates the fun
Keep the established calm microscope garden: a dark blue-charcoal surround, pale water, bright species colors and crisp pixel bodies. Expressiveness comes from real movement and interaction. The new layer should look like a set of invitations to play, not a control room or a store inside the game.
Surface
Design requirement
Play invitation
Square live-state thumbnail or verified captured state; one short title, one question and Start. At most three cards visible at once on a phone; scroll for more.
What if? sheet
Three choices maximum per source. A small before/after preview highlights the changed patch or device. One sentence names the difference; Details holds values.
Turn result
Show the dish prominently, elapsed simulation time and up to three supported observations. Primary Continue or Keep; secondary Try again. No star shower or guilt message.
Share picture
Square 1080 × 1080 output. Preserve the full circular dish, a short question and a quiet Pixelmeba wordmark. Leave a safe margin; use crisp nearest-neighbor world rendering.
Story export
Reuse D8’s evidence-based panels. Label sequence times and any accelerated footage. Never manufacture before/after images or imply a recipe will always create that outcome.

## Interaction polish
The preview responds immediately to a selection; Start remains distinct from choosing a variant. A tap on a card does not secretly paint into the dish. Disable double activation while a world is being created. Preserve input focus and announce success or validation failure through the platform accessibility layer.
Maintain D8’s 48-pixel touch targets, readable text and 200% scaling, with no essential information carried only by color, sound or motion. Every variant uses a distinct icon plus a label. In reduced motion, replace animated comparisons with a static pair. Decorative previews never consume simulation randomness.
## Asset and localization brief
Design six invitation thumbnails, four action icons (change, retry, pass, export), one before/after template and one export frame. Reuse organism sprites and UI components. Keep labels and questions as localization keys; layouts must tolerate at least 40% longer text. Reserve pixel lettering for decoration, not instructions.
The first glance should reveal a living dish and something the player can do to it. Avoid covering the world with marketing text, technical genetics panels or a giant logo in the opening shot.
# 09  Depth over time without a content treadmill
Replay comes from the relationships between starting conditions, placement, resources, descendants and intervention. The authored catalog is finite. Its combinations can create many different situations, but do not promise infinite species, unbounded intelligence or endless original abilities beyond the implemented trait system.
## Three timescales of enjoyment
Session
Satisfying experience
What supports it
A few minutes
Add food, notice feeding or division, change a placement.
Explore, Garden invitations, clear feedback and pause/undo.
A longer experiment
Compare two starts, test a feeder or follow a family.
What if?, existing paired runs, favorites and event evidence.
A returning project
Revisit a saved ecosystem and pursue a self-chosen question.
Reliable saves, notes, living-dish exports and version compatibility.

## Content expansion rule
A new invitation must introduce a distinct decision or reveal a relationship that the existing set does not make easy to see. Specify its source recipe, exact patch, required capabilities, question, supported observations and failure behavior. Reject variants whose only difference is a cosmetic title or a larger number without an interesting consequence.
Use release-bundled content packs through the existing versioned catalog. A pack is data and local assets, not remotely executed code. No rotating daily shelf, expiry, daily reward or forced return schedule is needed. Ship at a pace justified by tested content and support capacity; make no public cadence promise before the team proves it.
## A path to community creativity
At launch, people can exchange files through channels they already use. Later, if repeated demand justifies it, consider a curated collection of player-submitted recipes. That is a separately approved service project with moderation, hosting, privacy and ongoing costs. Do not make online sharing a prerequisite for local play.
Let creators build attractive dishes using existing habitat and placement tools. Broaden player expression through good selection, undo, previews and exports before adding a powerful editor. Avoid a second object-placement system that behaves differently from ordinary play.
## Evolution remains believable
Present inherited changes only when supported by lineage evidence. Resource abundance may support growth without creating a new ability. A favorite family may disappear. Preserve the meaning of these outcomes; retries and saved branches provide exploration without secretly protecting organisms.
# 10  A demo and purchase worth trusting
Recommended business-model hypothesis: a paid complete core game with offline play and a free, replayable demonstration. Keep the sandbox free of purchased food, paid survival, advertisements interrupting experiments and recurring subscription requirements. Price and storefront selection remain owner decisions after the playable demonstrates its value.
## The demonstration is a real sample
Use the same simulation and save format as the paid build. Initial demo scope: the first five implemented organism templates, Garden and its three variants, Explore controls, essential inspection, pause, undo, local saves and recipe/picture export. Retain ordinary organism and world limits; do not quietly make outcomes more generous. Do not include an expiring play timer.
The paid edition adds the release-approved catalog, habitats, equipment, experiments and deeper tools that actually exist. Publish a precise included-features table before charging. A five-organism prototype is not automatically a commercially complete release; D6’s release gate still applies.
Demo saves must import into the compatible paid build. A paid save requiring absent demo content is rejected with a clear capability message, never partially loaded. Show the purchase link on the home or information screen, separate from tool use. Do not prompt a child to purchase because an organism is dying.
## Position and audience
Audience
Reason to care
What to show first
Curious sandbox players
Consequences that are fun to discover.
Food placement changes followed by real behavior.
Families and casual players
Simple controls, gentle presentation and shared experiments.
A short Explore session and Try my dish.
Simulation enthusiasts
Persistent ecosystems, inheritance and explainable comparisons.
One verified lineage change and a supported paired experiment.

Android remains the primary product target. A public browser demo is optional only if the existing development build passes the same save, input and performance checks; do not add desktop storefront support solely for promotion. Do not promise cross-platform purchases or cloud saves without a separately specified implementation.
Review price against the actual delivered scope, support cost and audience feedback. Avoid claiming that a low price, a wishlist count or a particular feature guarantees profitable sales. The sales proposition must be understandable without reading the design documents.
# 11  Make the release easy to understand
## Store description draft
“Grow a tiny living world. Add organisms, feed them, and shape their habitat in a colorful pixel dish. Follow changing families, try a different starting setup, and discover what happens when your choices meet a living ecosystem. Start with a few simple tools, then explore deeper experiments at your own pace.”
Use this wording only where every claimed capability exists in the release build. Put a concise feature list, supported devices, save/export behavior and the fictional-simulation explanation below it. Keep viruses, fungi, parasites and advanced development out of promotional promises until their release scope is confirmed.
## First trailer: 30 seconds of actual play
Time
Footage and message
0–5 s
Open on the dish. A player adds food; show a real response. Caption: “Grow a tiny living world.” No opening logo sequence.
5–12 s
Show food intake and a recorded split. A brief label makes the response readable without an inspector wall.
12–20 s
Show What if? moving dinner farther away, then the resulting play. Label any accelerated or edited elapsed time.
20–26 s
Show one supported favorite-family or comparison moment. Never substitute concept footage for an unfinished feature.
26–30 s
Show the name and one destination: play the demo or visit the released product. Use the actual supported platform.

## Release asset package
Prepare a short captioned trailer; six screenshots covering the living dish, simple actions, a remix, inspection, a real inherited change and an available equipment experiment; a readable icon; a one-paragraph description; and a one-page creator brief. Replace any unsupported screenshot topic with another shipped interaction. Every screenshot should communicate one idea at phone size.
The creator brief contains the build version, demo access, three experiment prompts, controls, capture guidance and known limits. Offer genuine freedom to experiment; do not require a favorable opinion. Organize outreach around sandbox, simulation and family-play audiences. Public messaging and sending review copies require a separate owner-approved launch action.
## Product quality and discovery work together
Steam’s official documentation describes visibility as responding to player interest and purchases, and recommends reaching potential customers through external channels [S3]. This is useful context, not an Android forecast. The team still needs a deliberate announcement, accessible demo, clear store page and support path; “it sells itself” should mean easy to understand and recommend, not invisible marketing work.
# 12  Acceptance and build order
Treat these as proposed gates, not measured results or universal industry benchmarks. Reuse D8’s supervised usability sessions where possible. Have a researcher record observations without creating child accounts or installing marketing trackers in the game.
Gate
Evidence needed
If it fails
Appeal in ten seconds
Of 8 unfamiliar adult viewers, at least 6 describe both changing a dish and watching living consequences after a short clip.
Revise the opening footage and promise before adding content.
Accessible first experiment
At least 4 of 5 supervised child testers can start, feed, find a response and pause with no more than one verbal prompt; include two adult novices separately.
Fix the controls or feedback; do not hide the problem with a longer tutorial.
Replay invitation
At least 5 of 8 novice players voluntarily choose a second setup when told they may stop after the first. Record why they continue or stop.
Revise questions and meaningful differences; avoid rewards for clicking Again.
Share clarity
At least 4 of 5 testers distinguish picture, recipe and living save and choose the right artifact for a stated task.
Rename or explain export choices before release.
Technical integrity
Identical inputs reproduce; variants change only declared starting data; cancellation loses nothing; import failures preserve the active world.
Block release of the affected feature.

## Ordered delivery
R1 after the G1 core is stable: Garden’s four invitations, static previews, Again and source/version metadata. R2 after G2 comparison is stable: paired Garden variants and optional goals. R3 after D8 story/export integration: the three share choices and recipe identifiers. R4: local Try my dish. R5 after LL1/LL2: equipment invitations. Demo packaging and trailer capture follow the relevant playable gates.
R1 is the first implementation slice. R4 and equipment invitations may follow release if capacity is limited. Never postpone core save reliability, readable behavior or accessible input to ship more invitation cards. Keep all public claims aligned with the exact delivered scope.
## A bounded verification pass
For each realized recipe, validate inputs and run the six D6 seeds: 104729, 130363, 155921, 196613, 262147 and 314159. Check determinism, conservation and actual observable activity without asserting a particular mutation. Reuse existing engine tests and reference-device performance gates; add focused checks for patching, slot exhaustion, cancelled handoffs and unsupported imports.
# 13  Team handoff and evidence
## Required work products
Owner
Deliverable
Product/design lead
Approve the first four invitations, one-sentence promise, demo boundary and release claim list. Decide which optional replay features ship.
UX and art
Flow from Play to variant preview to paused dish; export choices; turn result; six invitation assets and promotional capture compositions.
Simulation/tools engineer
Validated recipe registry and patches; provenance; objective wiring; immutable turn baselines; imports using existing limits and accounting.
QA and accessibility
Focused acceptance evidence, representative-device checks, version compatibility matrix and observed usability issues.
Release owner
Actual feature table, price/platform decision, demo distribution, capture approval, support contact and launch communication plan.

Append a Replay and Release section to the existing EXPANSION_RESPONSE handoff. List implemented IDs/revisions, dependencies, tests and device evidence, deferred items and any conflict requiring an owner decision. Keep one consolidated team response rather than a separate competing roadmap.
## Commercial reference points
[S1] The Bibites’ official Steam page presents evolution, inspection, saved favorites and challenges. These concepts already exist in the category; Pixelmeba’s proposed distinction is their approachable pixel-dish presentation and clear touch-driven experimentation, not a claim to have invented digital life.
[S2] Sandspiel’s creator describes painting materials and discovering complexity through their interactions. The design lesson for this plan is to make simple actions combine meaningfully. This is an inference for Pixelmeba, not evidence of its future retention or revenue.
[S3] Steamworks documents visibility and external audience-building. Its guidance applies to Steam; use it as context for the distinction between a compelling product and guaranteed discovery. No sales estimates or competitor revenue assumptions support this plan.
## Sources checked September 27 2026
S1. Official product listing, The Bibites: Digital Lifehttps://store.steampowered.com/app/2736860/The_Bibites_Digital_Life/
S2. Max Bittker, Making Sandspielhttps://maxbittker.com/making-sandspiel/
S3. Valve, Visibility on Steamhttps://partner.steamgames.com/doc/marketing/visibility
Build decision: start with R1. Prove that one understandable change makes a player want another experiment; use that evidence to choose the next addition.