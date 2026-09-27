# 01  The final expansion before building
# Pixelmeba
Wonder Discovery and Accessible Play
Document 8 • Version 1.0 • September 27 2026 • Developer and designer handoff
Elevate Pixelmeba through a more readable, expressive and personal play experience. The simulation already has substantial planned depth. The next quality leap is making that depth easy to touch, understand and care about, especially for children. Build an inviting Explore view, delightful organism feedback, favorite families, and short discovery stories drawn from real events.
A child should be able to add life, feed it, watch a change and find out what happened without understanding chemistry or genetics. A curious player should then be able to reveal the deeper laboratory controls in the same dish. Both experiences use the same simulation and preserve the same consequences.
## Four defining improvements
First, make the dish feel alive through distinctive motion and clear feeding, division and resting cues. Second, give beginners three understandable actions and reveal precision controls when requested. Third, let players name and follow a family so emergent changes have personal meaning. Fourth, preserve actual discoveries as small illustrated event stories that explain what happened without inventing a result.
## What this expansion does not require
No new species, chemical pools, evolutionary modules, online accounts, runtime AI, daily chores or separate children’s simulation are required. This is an experience expansion built on the existing systems. It should improve the first playable before the team completes the larger catalog.
## Production decision
Keep Document 6 as the read-first production plan. Treat this document as the final experience brief before implementation. Begin its essential work during G1 and G2, then connect the Living Lab tools when those exist. After this handoff, pause broad feature expansion until the team returns a playable and evidence of what is understandable, interesting and reliable.
The stated timing and comprehension goals are proposed acceptance targets, not measured results. The design should be evaluated with children as well as adults before claiming a particular age range or independent reading level.
# 02  Integration and explicit amendments
Source
Continue using
This document adds
D1 and D2
Simulation, tools, art vocabulary, recipes, events and observation.
A simpler presentation and curated entry points using existing content.
D3 through D5
Inheritance, branch recognition, life states and abilities.
Family following and honest explanations of visible and inherited differences.
D6 Production plan
Core roster, G0–G5 priorities, technical gates and one team response.
Experience requirements during G1/G2 and a release quality check.
D7 Living Lab
Equipment, research records, recipes and bounded controls.
Progressive disclosure of supported equipment inside the Lab view.

## Amendments
W01 adds Explore and Lab presentation views; switching views never changes world rules. W02 makes Explore the default first-session interface and places D6’s longer guide under optional guided play. W03 adds up to three active family favorites using existing ancestry records. W04 adds bounded story cards from recorded events. W05 adds guided entry cards and optional local narration. No other mechanics change is intended.
D6’s First Dish remains the default starting recipe, with its disclosed preloaded life and resources. Explore is a view, not a new habitat or mutation mode. Label evolution separately as Standard, Accelerated or Fixed Traits, including any internal prototype qualification. The established internal feature registry and save version rules still apply.
## One world across both views
Switching views preserves world ID, seed, tick, organisms, genomes, resources, devices, command log and pending state. The toggle changes the interface only. Entering a blocking setup panel uses the existing pause behavior; returning restores the prior run state. Never rebuild the dish from a recipe to switch views.
## Scope guard
No organism receives simpler rules because Explore is active. Hunger, competition, predation, extinction and evolution retain their existing meanings. The interface may show fewer numbers, but detailed evidence is always reachable. Do not secretly rescue a favorite family, speed its reproduction or generate a beneficial trait.
The canonical implementation specification must identify these five amendments, their data additions and acceptance checks. Keep all previous mechanics precedence intact. Add the new work to the existing response document and backlog rather than starting a separate project.
# 03  Explore view and the first three minutes
The Explore screen leads with the dish and three labeled actions: Add Life, Feed and Look. Keep Pause/Run, Undo and More visible; keep the current simulation speed visible beside Pause. Lab controls, advanced materials, equipment and detailed charts live under More or the Lab view. No tool requires a badge to unlock.
Moment
Player experience
Required behavior
Arrival
A paused living garden and a short invitation: “Press play and look closely.”
Show that life and food are already present; no surprise auto-spawning.
First observation
Tap an organism to see its name, current action and one relevant need.
Selection works without precision tapping; crowded taps open a short candidate list.
First intervention
Choose Feed, preview one food patch, then place it.
Show an accepted dose and record the real addition; return to Look after one tap placement.
First consequence
A subtle cue highlights actual feeding or division nearby.
Explain a measured event; do not show success merely because food was placed.
First connection
Offer “Follow this family” after a real division or from the inspector.
Create a favorite without changing behavior or requiring a rare mutation.

## Simple defaults and deliberate repetition
Add Life begins with the five core organisms when supported; selecting one shows its shape and diet symbol. Use the inherited default dose of five agents. Feed begins with Sugar at the inherited 0.10 per cell and radius 3. A visible Dose button reveals the numerical settings. Every placement has a footprint preview; one gesture is one action. Repeated additions remain possible, but food is not automatically replenished.
In Explore, tap placement returns to Look to avoid accidental repeated painting. A clearly labeled Paint option enables repeated strokes under the existing deterministic brush rules. Two-finger gestures always pan or zoom. Lab retains its persistent selected-tool workflow. Both views issue the same authoritative commands.
## Guidance without a compulsory tutorial
Show at most one optional prompt at a time. Dismissal keeps all tools available. “Show me” highlights the control without using it. If no interesting event occurs, suggest inspecting a constraint or adding life; do not advance a fake tutorial outcome. The three-minute goal is one understood interaction, not a completed ecosystem or a new ability.
# 04  Expressive life and useful zoom
The signature visual experience is a dish that rewards looking closely. Keep the established crisp pixel art, dark quiet background, recognizable ancestry and absence of cartoon faces. Give organisms character through motion, silhouette, timing and response. A grazer should feel different from a stationary producer before the player reads a label.
Viewing scale
Show
Avoid
Whole dish
Population patches, food deposits, major environmental differences and three favorite markers.
Hundreds of labels or individual particle effects.
Neighborhood
Actual feeding, movement, predation and conversion cues; selected resource overlay.
Decorative activity that implies an interaction did not occur.
Close inspection
Crisp organism sprite, supported state layers and a readable trait inset.
Invented organelles, extra biology, new collision sizes or altered simulation speed.

## Motion with meaning
Use a brief internal brightness change for successful intake, a clean split at committed division, and a distinct still resting pose when the state machine says Resting. Death leaves the correct remains through a short, nongraphic transition. Amoeba deformation is cosmetic around its authoritative position; it cannot extend attack range. Tiny cosmetic idle motion must stay inside the existing movement constraints.
Inherited differences appear only through approved phenotype-to-art mappings. A reserve pocket reflects actual stored energy; body form follows the inherited form; an ability marking appears only if the organism has that ability. At ordinary zoom keep the two most useful cues and expose the rest in inspection. Avoid a new color for every mutation.
## Camera control
Pinch or wheel zooms the same world. Three optional zoom buttons jump to whole dish, neighborhood and selected organism scales. No new simulation layer or invisible organism population is created by zooming. A player-initiated Spotlight button focuses a selected real event; automatic notifications never seize the camera.
Follow mode keeps the selected organism within the middle half of the viewport and moves only when it leaves that area. Touching the viewport cancels follow immediately. Reduced motion uses a stationary marker and manual “Find” action. Keep camera changes out of authoritative simulation state.
# 05  Plain explanations with depth underneath
The first inspector panel contains a name, an action and one useful explanation. Use familiar words, icons with labels, and one short sentence. Reveal exact numbers and all competing constraints under Why and Details. Do not hide a contradictory measurement to make the explanation simpler.
Recorded condition
Explore wording
What the detail must show
Sugar intake above zero
“Eating sugar.”
Actual food type and amount over the recorded time window.
Food access limits intake
“There is not enough food here.”
Compatible food, allocation and other simultaneous limits.
Birth is blocked by space
“Needs room to split.”
Placement and crowding blockers alongside biomass, energy and age.
Actual inherited change
“This offspring inherited a different trait.”
Parent comparison, changed locus or module, and its costs.
Temporary resting state
“Resting until conditions change.”
State, entry reason, waking requirements and continuing age.
Lamp on but low effective light
“Shade is blocking some light.”
Lamp contribution and actual attenuation; use only when that is the cause.

## Questions a child can act on
Offer “What does it eat?”, “Why did it stop?”, “Where is its family?” and “What changed?” as inspector shortcuts. Each opens existing data or history. Do not add a free-text AI chat box. A fixed set of reliable questions is easier to translate, validate and use independently.
## State versus inheritance
Use two plain headings: Happening now and Passed to offspring. Hunger, energy and location belong under the first. Heritable loci, modules and documented inherited behavior belong under the second. A bigger well-fed body is not automatically a new inherited body form. A single mutation is not automatically an established branch.
## Mixed causes and missing evidence
When constraints tie under the existing attribution rules, say “A few things are slowing it down” and list them in Why. If detailed evidence has expired, retain a clearly labeled saved summary and do not reconstruct missing numbers. Explanations are generated from reason codes and measured events, not from an organism’s artwork or an imagined intention.
# 06  Favorite families and meaningful attachment
Let the player name a family and follow its descendants. This turns anonymous movement into an evolving story while preserving the sandbox. Favorites are bookmarks, not protected pets. Use an optional nickname such as “Mango family” alongside the ancestral species name and stable lineage reference.
## Favorite contract
Allow three active favorites per dish; older names and records remain in the existing notebook when a favorite is unpinned. A favorite stores a lineage root ID, nickname, accessible marker pattern and chosen representative ID. Apply the existing descendant highlighting limit of 200, using an aggregate marker beyond that. Do not store a duplicate organism inside the favorite record.
Find highlights the current representative. If it divides or dies, offer surviving descendants sorted by birth tick then ID; “Follow next” selects the first eligible descendant. Do not secretly choose the healthiest or most successful organism. If no descendants survive, keep the record and mark the family extinct.
## Growth that players can understand
Show current descendants, generation depth and confirmed inherited differences. Keep pre-existing founder traits, individual mutations and confirmed persistent branches distinct. A family can remain interesting without gaining a new module: spreading to another region, surviving a shortage or disappearing are actual outcomes worth understanding.
## Gentle and honest failure
If a favorite disappears, show “No members of this family remain” with its last recorded conditions and three choices: Look back, Continue exploring, or Start a new dish. A look-back card is a record, not resurrection. Restoring a snapshot explicitly rewinds the whole saved world. Adding the ancestor template creates new founders and never pretends they are the extinct family.
Avoid scolding language, a loss screen or repeated alarms. Death and recycling remain visible in a calm, nongraphic form. A quiet-audio setting can suppress death cues without removing the facts. No family needs daily care while the app is closed; the existing save-and-pause behavior remains.
## Names and sharing
Nicknames stay local. Include them in a screenshot or export only when the player chooses to share them. Default exported caption uses the ancestor and branch ID instead. Do not infer a child’s name, age or identity from a nickname.
# 07  Discovery stories from real events
Add a small “Something happened” tab that opens an illustrated story card. A card is a chronological record from this dish, using existing event and lineage data. It never invents dialogue, motivations, winners or adaptation. No runtime generative service is needed.
## Four initial card templates
Card
Required evidence
Allowed explanation
A first split
Committed birth event with parent and daughter references.
“A cell split. Its offspring inherited these traits.”
An enzyme at work
Recorded substrate conversion and the responsible activity field.
“Starch became sugar here.” Do not credit a particular producer unless attribution exists.
A family changed
Confirmed branch record and its ancestor comparison.
Name the inherited difference and tradeoff, without claiming it will help.
A place changed
Two retained regional summaries separated by an intervention.
Show measured before and after values; label the intervention and other recorded changes.

## Card structure and evidence
Use up to three panels: earlier state or action, recorded event, and later observation. Caption each with simulated time. For example: “You added sugar,” “Sprinters ate sugar,” and “Three births were recorded.” This describes a sequence; it does not prove the added sugar caused every birth or trace specific molecules. Only draw a causal connection when the engine has the corresponding transfer or lineage evidence.
Store template ID, world and ruleset identity, evidence IDs, captured measurement summary, time range and optional image references. Reuse existing bookmark, gallery and snapshot limits. Retain the compact evidence summary with the card when raw events expire. A card without a full snapshot is explicitly a memory, not a replay.
## Attention limits
Offer at most one new card notification per 60 simulated seconds and never more than one visible notice. Deduplicate repeated events by template and lineage or region within that window. Prefer a favorite-family event, then the first unseen template, then the earliest event. Quiet events can enter the notebook without interrupting play. No alert sounds are necessary.
Open the notebook without changing the world’s history. If it blocks the play surface, use the existing pause-and-restore convention. A Spotlight action focuses a surviving target or the recorded location; it cannot move organisms or re-enact an event as if it were happening again.
# 08  Playgrounds that invite curiosity
Home offers Continue and Play, with Lab and Notebook as secondary entries. Play opens three illustrated question cards using existing recipes. They are entry points, not a new campaign or content gate. Each card shows preloaded contents, the question, a simple first action and a route to More details.
Playground
Source and availability
Question and first action
Little Living Garden
D6 FIRST_DISH_V1; available with G1 core.
“Who will use this food?” Run, select a feeder and place one visible sugar patch.
Slow Snack
D7 LABR01 steady arm; requires LL1.
“What happens as the feeder empties?” Inspect stock and watch actual output.
A Light in the Dark
D7 LABR02 lamp arm; requires LL2.
“Who can use this light?” Toggle the lamp and inspect Sunbead.

## Preserve the recipe contract
Keep the source recipes’ exact organisms, fields, seed, founder and mutation settings. A single-arm playground is exploratory; opening Compare creates the prescribed paired experiment with its baseline and intervention disclosed. Fixed Traits in the equipment lessons remains visible; it must not be presented as an evolution demonstration.
Unsupported playgrounds do not appear as broken buttons or locked rewards. During development, list them only on a clearly labeled build-status screen. The initial release can lead with the Garden alone if equipment is not yet within the accepted release scope.
## Questions instead of chores
After a player interaction, offer one optional question relevant to available evidence: “Did both kinds eat?”, “What stopped the split?”, or “Where did the family spread?” Answering opens an observation rather than awarding food or forcing a result. Never require a useful mutation, stable equilibrium or survival of a favorite to finish a session.
## A satisfying stopping point
Save and leave offers a small session memory: the dish name, a current image and one recorded change if available. If nothing notable occurred, show the saved state without inventing a highlight. Returning resumes paused at the same moment. No missed rewards, offline hunger, streak penalties or obligation to check back.
A player who wants more can open Lab from any playground. The same dish then exposes advanced materials, equipment, quantitative inspector details and charts. No new start is required.
# 09  Sound reading and interaction access
## Readable without relying on text alone
Use labeled icons for life, food, inspect, pause, undo and a family marker. A food icon must match the resource shown in the tray and inspector. Pair stress and resting patterns with words; do not rely on hue alone. Keep normal body text at least 16 CSS pixels, touch targets at least 48 pixels and the inherited contrast and 200% text requirements.
At the smallest supported viewport, the core action labels and selected organism summary must remain readable without covering the whole dish. Hide secondary statistics before shrinking text. Preserve keyboard navigation and a semantic selection list for screen readers. Testing Explore on a phone is part of acceptance, not a final desktop mockup review.
## Optional local voice prompts
Use a small prerecorded phrase set for core actions and explanations, played only on request or when the player enables narration. Start with 16 phrases: Press play; Pause; Add life; Add food; Look closely; Eating sugar; Needs more food; Needs room; Resting; A cell split; Follow this family; The feeder is empty; The light is on; The light is off; Saved; Undo rewinds time.
Include text equivalents and independent voice, effects and music volume controls. Narration must not read invented dynamic values or mispronounce custom family names. Use the available phrase only when its evidence condition is true; otherwise provide the text explanation. Keep localization assets versioned and offline. Voice availability does not gate play.
## Audio and motion polish
Use restrained, distinct cues for a successful placement, an actual division and an opened discovery card. Rate-limit clustered sounds so population growth cannot become a harsh repeating effect. An optional low-key ambient loop should leave speech clear. Nothing essential depends on hearing.
Reduced motion removes camera easing, repeating pulses and trails while retaining state patterns and text. Large interaction targets stay separate from collision geometry. A one-tap Find button provides a route to the selected organism when pinch zoom or dragging is difficult.
## Local and pressure free
This expansion needs no age entry, profile photo, microphone or public chat. Sharing remains an explicit export action under existing rules. Keep progress records local and let the player clear them without deleting a dish. No purchases, timers or social ranking are introduced into Explore.
# 10  Technical scope and quality criteria
## Use the simulation we already have
Explore is a presentation layer over existing commands and state. It must not add per-organism AI, duplicate the world or maintain separate mechanics. Family favorites use lineage references. Story templates consume authoritative events and saved summaries. Their rendering and optional audio are cosmetic and cannot consume biological random draws.
Save view preference, favorites and notebook records as presentation data. Save explanatory evidence summaries with stable IDs and a schema version. Include no unbounded event scans in the render loop. Use existing event coalescing, history limits, branch compaction and export limits. Preserve a favorite’s name and historical summary even if its representative has died.
Check
Pass condition
View switch
Explore to Lab and back changes no authoritative world state or pending action.
One gesture
A completed placement adds the accepted dose once; two-finger zoom never paints.
Truthful feedback
No feed cue without intake, no split cue for a blocked birth and no inherited label for temporary state.
Story evidence
Every caption resolves to a retained event or measurement summary; absent evidence produces no invented card.
Family integrity
Favorite selection never changes behavior; extinction and snapshot restoration remain distinct.
Accessible layout
Core flow works on target portrait and landscape sizes, at 200% text and with reduced motion.
Performance
Existing target device and simulation budgets still hold; cosmetic effects degrade before biology.

## Child comprehension review
Arrange a supervised, consented review with five children across the intended audience, including early readers, plus two adults unfamiliar with the design. Ask each to add food, find who ate, pause, and show one change. Use a short eight-minute session and observe without directing taps. Do not collect unnecessary personal data or publish recordings.
Directional target: four of five children complete a deliberate placement, pause independently and identify one observed interaction. Adults should locate deeper controls without restarting the dish. Record where help was needed; a small sample guides iteration and does not establish a scientifically validated age rating.
# 11  Build sequence and designer handoff
Priority
Deliverable
Dependency and acceptance
W1 Essential
Explore shell, one-tap placement and plain inspector.
During D6 G1; same commands, readable core flow, one understood interaction.
W2 Essential
Five organism state cues, zoom and optional follow.
During G1/G2; every effect matches actual state; camera remains under player control.
W3 Core polish
Three family favorites and four story templates.
After reliable lineage and event records; no duplicate organisms or unsupported causal claims.
W4 Guided entry
Garden card, session memory and optional prompts.
Reuses D6 recipe; optional guidance does not lock tools or force outcomes.
W5 Equipment connection
Slow Snack and Light playgrounds with Explore controls.
Only after D7 LL1/LL2; preserve recipe settings and advanced Lab access.
W6 Release polish
Narration, accessibility, sound and mixed-scene tuning.
Core interface tested first; final quality review on actual target devices.

## First build to return
Return the Garden with W1 and W2 before producing the full notebook or all narration. Show one actual food interaction, one actual division, the simplified explanation and the route to Lab details. This gives the team a small, concrete quality target while the larger ecosystem remains in development.
## Designer package
Provide Explore and Lab-switch layouts at 360 by 800, 800 by 360 and 1440 by 900, including 200% text. Deliver six core action icons, three accessible favorite marker patterns, four story-card layouts, the supported playground thumbnails, and state layers for the five core organisms. Include normal, pressed, selected, disabled and focus states for controls.
For motion, deliver trigger, duration and reduced-motion alternative for each effect. Reuse the established sprite scale and palette. Show the kit in sparse, crowded, low-light and extinction states. A polished empty mockup is insufficient to accept readability.
## Engineering package
Provide view-state mapping, command reuse, favorite reference handling, story-template evidence conditions, bounded storage behavior and import/export treatment. The owner should be able to tell which features are implemented and which are present only in art or design files.
# 12  Final quality bar and team response
Add a Wonder and Accessible Play section to EXPANSION_RESPONSE.md. Keep Document 6’s consolidated response format. Link this expansion’s results to the actual build, commit and content version so the owner can review the same experience the team tested.
Return item
Required evidence
Playable scope
W1–W6 status and a working route from Explore to Lab in the same dish.
Experience capture
A short annotated sequence showing placement, an actual response, inspection and a saved discovery.
Integrity results
View-switch state check, one-gesture accounting, valid event captions and family extinction handling.
Design assets
Editable layouts, organism cue mapping, icons, favorite patterns and reduced-motion alternatives.
Comprehension findings
Task outcomes, help required, confusing labels and the changes made after review.
Performance and access
Real target-device measurements, large-text layouts, keyboard/semantic UI and sound-off findings.
Next decision
The smallest remaining change needed to meet the quality bar; no automatic request for another content expansion.

## The quality bar
The game should be inviting before a panel is opened, understandable after one deliberate action, and interesting when the player asks a second question. An organism’s motion should communicate its role. A consequence should have an inspectable cause. A surprising inherited change should be memorable without being guaranteed. A child should be able to stop, recover and return without pressure.
## Build before expanding further
There is now enough planned content to support a substantial game. The immediate risk is spending the next development period implementing many systems before discovering whether the first few minutes are enjoyable. Use this document to raise the first playable’s quality, then decide further expansion from observed play and performance.
The next useful handoff back to the design process is a playable, a few representative screenshots or short captures, the consolidated response and specific unresolved questions. That evidence will reveal whether Pixelmeba needs more depth, clearer feedback, better pacing or fewer controls on screen.
The final recommendation is to protect the depth underneath while making the surface welcoming: touch the dish, notice life respond, follow a family, and discover a story that could only have happened in that particular little world.