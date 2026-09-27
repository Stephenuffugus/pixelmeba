# 01  Purpose and document authority
# Pixelmeba Living Behaviors Life Cycles and Colony Evolution
Fifth developer and designer handoff
September 26 2026 • Design specification 1.0
Make descendants differ in what they do, how they develop and how they live together. This packet defines inherited behavior, mobile and settled life stages, functional body variation, colony roles, resource exchange, partnerships, feature loss and persistent food caches. Each behavior acts through local information and paid resource transfers.
Build these additions on the existing evolution system. Outcomes remain open: a colony may specialize, disperse, become dependent on a partner, simplify or disappear. None of those stories is guaranteed or secretly spawned. Numerical values are fictional starting balance for implementation and playtesting; no game-build or performance validation is claimed here.
## The five document set
D1  Pixel-Petri-Design-and-Build-Specification.docxD2  Pixelmeba-Mass-Expansion-Design-Volume-2.docxD3  Pixelmeba-Evolution-Core-Design-Addendum.mdD4  Pixelmeba-Living-Worlds-and-Evolution-Expansion.mdD5  This document
D5 overrides earlier text only through its explicit amendments and new system rules. D4 corrections C01–C08 remain binding except where D5 names a replacement. Earlier documents still control unchanged systems. Read the authority index on page 2 and amendment register on page 3 before implementation.
## Version and scope
Keep simulationVersion 3 and record exact evolutionRulesVersion, moduleRegistryVersion, phenotypeMappingVersion and content hash. Freeze existing saves on their recorded versions; upgrade a copy explicitly. Pixelmeba remains the working title. Preserve the independent Pixel Petri game and its identifiers.
This packet adds E13–E17, bringing the supplementary registry to 17 modules. The per-genome limit stays three. Developmental traits use the genome fields on page 13; they do not grant extra module slots. No runtime language model, new account service, live multiplayer or game-code generation is required.
# 02  Specification index
Use this matrix to find the controlling rule. Page numbers refer to the numbered sections in the Word documents; section numbers refer to the Markdown headings. D5 page numbers match its section numbers.
System
Controlling source
Supporting source
Core product and inputs
D1 pages 1–4 and 13
D4 sections 10–11; D5 page 15
Resource accounting
D1 page 7, amended by D2 page 2
D4 section 9; D5 pages 8–14 and 17
Existing life and chemistry
D2 pages 4–18
D1 pages 5–11 for unchanged profiles
Evolution and genealogy
D3 sections 5–6 and 12
D4 sections 2–3; D5 pages 9 and 13
Food policy and discovery branches
D4 sections 2–3
D5 page 15 adds discovery categories
Supplementary modules E01–E04
D3 section 7, amended by D4
D5 page 3 precedence and page 17 order
Supplementary modules E05–E12
D4 sections 4–6 and 9
D5 adds resource sharing to eligible E12 links
Behavior and sensing
D5 pages 4–5
D1 page 8 and D4 E07 where retained
Life stages and body development
D5 pages 6–9
D2 dormancy and handling rules unless overridden
Colony roles and partnerships
D5 pages 10–12
D4 E12 physical link limits remain
Native feature loss and new mutation
D5 page 13
D3 mutation streams and D4 feeding policies
Persistent ecological structures
D5 page 14
D2 film, fungal networks and finite food objects
Inspector and history
D5 page 15
D3 section 11; D4 sections 11–12
Update order and persistence
D5 page 17
D2 page 24 and D4 section 9
Acceptance and delivery
D5 page 18
Prior acceptance gates remain for retained features

## Implementation traceability
For each shipped feature, record source document, section, content version and any approved deviation in the team’s single EXPANSION_RESPONSE.md. A later example cannot silently override a rule. If two clauses remain inconsistent after this index and the amendment register, report the conflict and isolate the affected feature rather than inventing an undocumented compromise.
# 03  Amendments and precedence
ID
Prior rule
D5 replacement
D5 A01
D3 assumes placement before mutation.
Use a saved, immutable birth proposal before checking daughter placement. Commit resources only when both daughters fit; page 9.
D5 A02
D3 native abilities cannot be lost.
Only the explicit whitelist on page 13 can switch off or back on at birth. Essential feeding and host lists remain fixed.
D5 A03
D3 body shape is cosmetic.
Size and body form become bounded inherited traits for the eligible set on page 8. No free biomass or enlarged prey list.
D5 A04
D4 E12 links share no resources.
Sharing occurs only along E12 edges whose two endpoints also carry E15. Ordinary E12 links remain nonsharing.
D5 A05
Default offspring inherit a common active stage.
E13 and E14 prescribe distinct daughter stages. Native F04 resting daughters remain unchanged and are ineligible for these modules.
D5 A06
D3 movement cost refers to a native per-second cost; D1 charges distance.
For native self-propulsion charge 0.20 × distance traveled × motility factor. E07 replaces that charge with its stated per-second cost; do not charge both.
D5 A07
D4 E07 always follows light.
E07 uses its native light-seeking controller under Ancestral strategy. An inherited D5 strategy can replace its direction choice; E07 speed and cost still apply.
D5 A08
D4 attempts include no developmental fields.
Add the independent developmental-mutation draw on page 13. Existing quantitative, preference and module draws retain their rates.
D5 A09
Branch discovery covers quantitative loci and modules.
Life-cycle, strategy, role, body-form and native-feature changes also qualify after the existing persistence gate; page 15.

## Mandatory priority
Dead, captured, held, resting, preparing, waking and physically attached states override voluntary behavior. A strategy never bypasses infection, hunger, habitat, resource or reproduction gates. Colony roles apply only while linked; partner bonds do not make an organism a colony member. Growth and shared pools are always accounted before presentation.
D4 C01 feeding policy is retained as the intentional Evolution-world replacement for D1’s one-food selection. Fixed Traits on old rules retains the old behavior. New rules must not be inserted into an old replay simply because a display name changed.
# 04  Inherited behavior strategies
A strategy chooses among already legal movement candidates. It cannot see beyond the inherited sensing radius, through a blocked path or into another organism’s hidden future. All cellular templates store a strategy; it becomes active only when they can self-propel. Founders begin Ancestral.
F is the existing normalized compatible-food or prey score, S is suitability and C is crowding. U is 1 beside usable substrate or mesh, otherwise 0. T is the local normalized metabolite field, amount divided by amount plus 0.1. Each score samples the same candidate location. Candidate selection and seeded ties retain the existing solver.
Strategy
Direction or action rule
Limitation
Ancestral
Use the template or E07 controller.
No additional decision cost.
Resource follower
Score 0.70F + 0.25S − 0.05C.
Can enter crowded or marginal habitat for food.
Space finder
Score 0.35F + 0.35S − 0.30C.
May leave a productive crowded patch.
Shelter keeper
Score 0.35F + 0.35S + 0.25U − 0.05C.
Surface proximity alone gives no armor or attachment.
Night forager
Use ancestral directions while active. Suppress voluntary movement and ordinary feeding in the bright resting phase.
Eligible only to nonphotosynthetic motile B01/B04/B05/B06/B09/P02/P07. This is not protective dormancy.
Trail follower
Score 0.35F + 0.30S + 0.30T − 0.05C.
Tracking metabolite does not grant the ability to eat it.

## Thresholds and costs
Night forager enters activity below light 0.25 and quiet above 0.35, each sustained for five seconds. Between thresholds hold state. Energy below 20 forces emergency activity until it rises above 35. Maintenance, stress, aging and contact vulnerability continue while quiet; photosynthesis is never disabled by this strategy because those templates are ineligible.
Each active non-Ancestral strategy pays 0.02 energy/s for decision overhead, including Night forager’s quiet phase. Held or dormant overrides stop that overhead. If E is below 1, use the ancestral controller without extra overhead until E reaches 2. Store the fallback state to avoid flicker.
# 05  Behavior memory and state control
Behavior has a small, explicit memory. Store the last successful intake time, current strategy state, last desired direction and threshold timers. Do not add general intelligence, a private map of the dish or an undocumented learned policy. Genetic changes occur at births; an individual’s temporary memory is not inherited.
State or event
Required handling
Decision interval
Choose a desired direction every 0.5 simulated seconds; carry it between decisions. Recheck passability on every 0.10 s movement tick.
Invalid target
A dead prey, blocked route or incompatible cell cancels the target immediately. A new direction waits until the next scheduled decision unless remaining still is required.
Newborn
Initialize a fresh decision timer and empty memory. Never copy a parent’s target ID or recent-intake timestamp.
Environmental change
Local inputs are sampled from the current environment. A changed strategy state takes effect at the next decision boundary, except immediate physical overrides.
Loss of motility
Retain the inherited strategy as inactive. It still appears in the inspector but pays no decision cost.
Attachment or colony membership
Suppress self-propulsion. Food intake and attachment-release rules continue; a strategy cannot order a linked cluster to teleport.
Player inspection
Showing candidate scores and explanation traces consumes no simulation randomness and cannot trigger a new decision.

## Information the player can inspect
Show the selected strategy, sensed radius, chosen target or direction, and the dominant measured input. Example: “Moving toward a less crowded reachable cell.” For Night forager show “Quiet in bright light” or “Emergency feeding because energy is low.” These explanations refer to the actual controller decision, not a claim about intention or intelligence.
## Inherited response variation
The developmental genome stores nightLightThreshold as an integer from 10 to 40, default 25. Divide by 100 for activation; the quiet threshold is 0.10 higher. A threshold mutation changes it by ±2, clamped to its bounds. Five-second dwell times and emergency energy thresholds remain fixed. Only active Night foragers can mutate this field.
Do not give every organism every strategy immediately. A strategy mutation chooses uniformly from the legal alternatives for that template and current capabilities. The environment never chooses the favorable option. The original trait costs and mutation record remain visible.
# 06  Settler life cycle
E13 Settler is eligible for B01, B04, B05, B06, B09, B10, B11, P02 and P07. It occupies one supplementary slot and pays the standard 0.02 energy/s surcharge. Its mobile juvenile and attached adult use the same resource pools, genome and entity; stage changes never create an extra organism.
Stage
Behavior
Transition
Juvenile
Ordinary compatible feeding at 0.75 of derived Q; speed at 1.20 of derived speed. No reproduction. Ordinary costs, vulnerability and age apply.
After at least 10 s, E ≥ 35 and B ≥ 0.80 of derived B0, begin settling beside valid solid substrate or mesh.
Settling
Five continuous seconds beside the same usable support; movement stopped, ordinary juvenile intake allowed. Spend 5 energy on entry.
Complete into Adult. Losing support cancels into Juvenile without refund; a 10 s retry lockout prevents repeated spending.
Adult
Attached with zero self-propulsion; ordinary intake at 1.15 of derived Q. Pay 0.10 energy/s attachment upkeep. Normal reproduction gates apply.
Division retains an Adult daughter and produces one Juvenile daughter. Destroyed support returns the survivor to Juvenile with the 10 s retry lockout.

## Birth and mutation handling
The daughter retaining the entity ID stays Adult only if the parent was an E13 Adult and it retains E13 with valid support. Every other E13 daughter begins Juvenile, including first-time module gains. Any daughter without E13 uses its ordinary ancestral active stage. Both receive new birth identities. Split biomass, nutrients, meals and energy normally; there is no free adult or traveling offspring.
Adult attachment takes precedence over E04 and colony adhesion. E13 excludes acquisition of E04, E12 and E14; those modules likewise exclude E13. E16 partner bonds are also unavailable during E13 stages. Eligibility is validated when proposing module changes, not by deleting conflicting modules afterward.
## Presentation and ecological cost
Juveniles have a small trailing fringe; settling shows a restrained five-step attachment indicator; adults have a stable foot or stalk beside the actual support. Keep their ancestry recognizable. A dish without usable supports may prevent this lineage from reproducing. That is a possible cost of the life cycle, not a reason to invent a surface or rescue the lineage.
Dormancy can interrupt the stages only when the organism also has a supported resting capability. It releases attachment and resumes Juvenile after waking, with no age reset or energy grant. Preparing and waking cannot progress a settling timer.
# 07  Dispersing offspring life cycle
E14 Dispersing offspring is eligible for native attached B02, F01 and F02. It occupies one supplementary slot and pays the standard surcharge. It changes the newly assigned daughter’s stage; the retained parent remains its native attached adult. F04’s native resting daughter is unchanged and cannot acquire E14.
Stage
Movement and feeding
Settlement rule
Dispersing
Speed 0.15 cells/s through the ancestral compatible habitat; no feeding, photosynthesis, secretion, transfer or reproduction. Pay ordinary maintenance and the native distance movement cost.
For the first 10 s, move using the local ancestral food and suitability score. After that, seek valid support with usable local food availability at least 0.10.
Settling
Stop for five continuous seconds at valid support. E must be at least 10 at entry; spend 5 energy. No feeding during the transition.
Complete to native Adult. Lost support cancels settlement without refund. Use a 10 s retry lockout.
Stranded
After 40 s cumulative dispersal time, stop self-propulsion. No feeding or division; aging and maintenance continue.
Can begin settling later if support and food become valid. There is no automatic revival, food grant or reset of the dispersal budget.
Adult
Resume native feeding, attachment and branching rules.
Each successful later division can release one new dispersing daughter.

## Transport and network integrity
For these stages, B02 dispersers use Small and fungal dispersers use Medium transport class before any future explicitly authorized size rule. Their full actual biomass travels with them. Native habitat restrictions still apply, but temporary absence of attachment is permitted during Dispersing, Settling and Stranded. There is no jump over walls or across unsupported habitats.
An F02 disperser is not connected to its parent during travel. On settlement it may form the ordinary parent link only if the living parent occupies a four-neighbor cell, both are valid F02 adults and neither exceeds its link degree limit. Otherwise it starts a separate network. No remote sharing or automatic connection to a visually crossing thread.
## Stage ownership
A daughter losing E14 during birth must fit a native supported placement before the birth commits. E14 changes a new daughter to Dispersing only when its parent already carried E14 and the daughter retains it. First-time gains stay native Adult and affect later offspring. E14 travel uses its fixed controller and motility factor 1; inherited strategy is inactive. Dormancy suspends the stage clock and resumes the saved stage after waking; age continues. Sampling preserves clocks and pools.
# 08  Functional body development
Enable body size and body form only for B01, B04, B05, B06, B09, B10, B11, P01, P02 and P07 initially. Other organisms retain neutral size and form. Founder size locus is 50. Size factor s is 0.75 plus 0.005 times that locus, giving a range of 0.75–1.25. This is a bounded body plan, not unlimited growth into unrelated creatures.
Property
Inherited size rule
Mature reference biomass
Derived B0 equals ancestral B0 multiplied by s. Mutation changes the target, never the body carbon already present.
Intake ceiling
Multiply ancestral Q by s raised to the power 0.75, then apply the existing feeding locus and eligible module, stage and role factors.
Ordinary maintenance
Multiply ancestral M by s. Add module surcharges and explicit upkeep according to their own rules; inherited maintenance multipliers apply once.
Self propelled speed
Divide ancestral or E07 baseline speed by the square root of s, then apply motility, body form, stage and jacket factors.
Energy and division
Native energy capacity is 100 × s, plus any E05 addition. Minimum division energy is 60 × s; division cost is 20 × s times the division-investment factor and role/form factors. Keep E above both the threshold and actual cost.
Resource storage
Meal capacity is 2 times derived B0. Division biomass threshold is 2 times derived B0. Age and health are not increased by size.
Physical contact
Ordinary contact occurs when centers are within 0.25 times the sum of the two size factors. Unsized organisms use s = 1. Explicit radius-capture and same-cell trap rules retain their overrides.

## Body form
Baseline form retains the native silhouette and turning. Streamlined form multiplies speed by 1.10 and division energy cost by 1.10. Hold a selected heading for at least 1.00 s before a voluntary turn, spanning two decision intervals. A blocked route stops movement immediately; the heading lock never causes wall penetration. Use four authored headings and crisp pixel art rather than blurred continuous rotation.
A narrow outline does not itself change gate class, prey eligibility or hit detection. Shape is functional through speed and turning only. Growth animation reflects actual biomass; body plan is a separate inherited property fixed for that individual’s lifetime.
# 09  Birth transactions and size boundaries
## An immutable birth proposal
When a parent satisfies division resources and global capacity, create a pending birth proposal keyed by parent birth identity and division ordinal. Draw daughter genomes once, including all mutation streams. Store the proposal, setting versions and intended daughter stages. Resource amounts are not transferred yet; parent behavior remains unchanged.
Derive each daughter’s body and transport requirements from the proposal, then search valid nearby placements. If placement fails or later resources are insufficient, retain the same proposal and try again without rerolling. Recheck every cost and placement at commit. Parent death discards the proposal; no birth or mutation discovery is published. A settings change affects future proposals, not one already saved.
At commit, charge the parent’s current derived division cost and split actual carbon, nutrient, meals, energy and minerals under the ownership rules. Apply daughter caps; excess meals become detritus and excess energy dissipates. A larger daughter can start below its mature reference B0 and must grow using food. Never top it up. Publish both daughters together with new birth identities.
Native class
Size rule for eligible organisms
Small
Remain Small below s = 1.20; become Medium at or above 1.20.
Medium
Become Small at or below s = 0.80; remain Medium below 1.20; become Large at or above 1.20.
Large
Become Medium at or below s = 0.80; otherwise remain Large. No currently eligible body template starts Large.
Fixed or special stage
Keep the stage’s explicit class. Size never makes an attached organism pass a gate.

## Avoid capacity and predation exploits
Crowding remains the sum of actual B divided by ancestral B0, not derived B0. A size mutation cannot erase occupancy. Gate class changes on birth, not when a body merely eats or loses biomass. Existing prey and host lists remain ancestral-ID based; becoming larger does not unlock a new prey species or immunity.
Example: a neutral B01 at B = 2 divides into two daughters with B = 1 each. A +5 size-locus mutation gives one daughter s = 1.025 and target B0 = 1.025; it must acquire the missing 0.025 carbon through actual growth. The other daughter does not lose additional carbon to fund this target. This example isolates size; ordinary energy, nutrient and health gates still apply.
# 10  Resource sharing inside colonies
E15 Exchange junction is eligible only for the six E12-compatible bacterial ancestors and only when the proposed genome carries E12. It occupies a second supplementary slot and pays 0.02 energy/s. If E12 is later lost, E15 remains inherited but inactive until an eligible link can exist again; its surcharge remains. No free replacement module is granted.
A resource-sharing edge requires living, active E12-linked members that both carry E15. Preserve the maximum degree of two and eight members per component. Read a single post-construction snapshot and apply one simultaneous pass. A receiver cannot relay a newly received resource in that pass.
## Carbon and nutrient transfer
A donor may send body carbon above 1.25 of its derived B0 toward a linked receiver below 1.25 of that receiver’s derived B0. Request at most 0.01 times donor B0 times dt per edge, capped by donor surplus and receiver deficit. Transfer proportional bound nutrient with that carbon. Pay 1 donor energy per carbon actually sent, limiting the request to the affordable amount. Transfer grants the recipient no energy.
## Energy transfer
After reserving carbon-transfer costs, an ordinary donor may send energy above 70 to a receiver below 40. Per-edge request is at most 0.5 energy times dt, capped by donor surplus and receiver headroom divided by 0.90. Deliver 90% of actual energy sent; record the remaining 10% as dissipated. Keeper-role thresholds on page 11 can replace these values.
For either resource, sum outgoing requests and scale them proportionally to donor availability. Then sum incoming requests and scale to receiver headroom. Apply both scales to each edge without a retry pass. For energy, any node acting as a donor receives no energy this pass. This prevents a cyclic component from circulating the same budget repeatedly.
## What a colony can and cannot do
Members retain their own health, energy, food, age, genome and reproduction gates. A starving member can die beside a well-fed member if there is no qualified edge or enough transfer time. Links do not merge health or grant common consciousness. Physical separation, division or death breaks the appropriate edges under E12 rules.
The inspector displays sent, received, dissipated and blocked amounts over a chosen interval. Name a group a colony only as a gameplay description. It is not a scientifically verified multicellular organism, and no decorative cell counts become extra simulation agents.
# 11  Inherited colony roles
Store one colonyRole value per cellular genome. It expresses only while linked through E12 and while its prerequisites are present. Otherwise the organism behaves as Generalist and the inspector marks the role inactive. Roles are inherited predispositions; the game never assigns a perfect worker distribution after counting the colony’s needs.
Role
Effect while expressed
Cost or prerequisite
Generalist
Use the ordinary profile.
Default founder role; no extra factor.
Forager
Multiply ordinary Q by 1.15.
Multiply ordinary maintenance by 1.20 and minimum division interval by 1.50.
Builder
Multiply E10 deposition rate ceiling by 1.50.
Requires E10; multiply ordinary Q by 0.85. Actual carbon and energy construction costs stay unchanged.
Keeper
Receive shared energy toward 70 rather than 40. Donate only above 90, except the emergency rule below.
Requires E05 and E15, filling all three slots with E12. Multiply ordinary Q by 0.90 and maintenance by 1.10.
Breeder
Multiply minimum division interval by 0.80.
Multiply ordinary Q by 0.85 and division energy cost by 1.10. Biomass and health gates remain unchanged.

## Keeper emergency release
If a directly linked qualified receiver begins the sharing pass below 20 energy, a Keeper may donate energy above 30 for that pass. The standard rate, 90% delivery and shared allocation still apply. A Keeper acting as donor receives no energy in the same pass. No energy is created when the emergency threshold changes.
## Role and module interactions
E12 + E15 + E05 is a reserve-sharing colony member; it cannot also carry a fourth construction module. E12 + E15 + E10 is a builder that can receive support but lacks E05’s extra energy capacity. These slot limits create different possible jobs without introducing free specialist powers.
Role changes occur only through developmental mutation at birth. Foragers do not automatically turn into breeders because another member died. A clone group can begin with one role and later branch into different role tendencies. Its structure can be poorly balanced and collapse.
## Visual identification
Use subtle internal markings: a feeding notch, storage pocket, matrix stipple or bud stripe. Apply the marker only while the role is expressed; the inherited inactive role remains available in the inspector. A selected-colony panel reports member count, actual roles, qualified sharing edges and limiting resources. Keep individual selection available.
# 12  Persistent partnerships
E16 Partner bond is eligible for B01, B05, B06, B09, A01 and A03. It occupies one supplementary slot and pays 0.02 energy/s. Both participants must carry E16. Allowed pairs contain one listed bacterium and one listed alga; same-template pairing uses colony systems instead. A bond is not infection or a new host species.
## Formation and behavior
Free active candidates within 0.5 cells for five seconds, each with E ≥ 20, may form one bond per individual. Each pays 3 energy. Resolve competing pairs by stable birth-ID priority. E12-linked, E13-staged, held, dormant or already bonded organisms cannot form a bond. They may retain an inactive E16 genome entry.
Bonded partners stop self-propelling and pay 0.05 energy/s each. They retain normal local feeding and the environment’s actual gas and food exchange. There is no secret photosynthesis or growth bonus. The bond adds one budgeted body-carbon transfer: a partner above 1.20 of its derived B0 can send at most 0.005 times its B0 times dt toward its partner below 1.20 of that partner’s B0. Transfer proportional nutrient and charge 1 donor energy per carbon sent. Grant no recipient energy.
Compute this transfer from one snapshot, cap by surplus, deficit and available donor energy, and commit once. A partner is not simultaneously in an E15 colony-sharing pass. Photosynthesis, feeding and transfer ledgers remain separate, so players can distinguish environmental cross-feeding from direct support.
## Failure and separation
Break the bond immediately on death, capture, division, dormancy, forced separation beyond 0.75 cells or a new barrier between partners. Also break when either partner remains below 15 energy for ten seconds. Surviving individuals receive a ten-second rebonding lockout. Newborns start unbonded and cannot inherit a partner ID.
## Interpreting the relationship
Record bond duration and each partner’s actual contributions. Label “resource exchange observed” when a transfer occurs. Reciprocal transfer alone does not prove both partners benefit overall. The player can fork a snapshot, sever the bond in one copy and compare outcomes; differences still depend on that setup and seed.
Draw a small paired bracket and one short connector between actual bodies. Do not draw one organism inside the other, combine their health bars, or turn the pair into a hybrid. This preserves both lineages and allows a partnership to be costly, unstable or one-sided.
# 13  Developmental mutation and feature loss
Add an independent 1% developmental-mutation chance per daughter in Standard, 2% in Accelerated and zero in Fixed Traits. This is separate from quantitative, preference and supplementary-module draws. On success choose uniformly among eligible field operations below; no operation is chosen because the environment needs it.
Field operation
Allowed change
Behavior strategy
Choose a different legal strategy for the template and capabilities. Use the complete eligibility rules on pages 4–5.
Night threshold
Change the integer light threshold by +2 or −2 with equal probability, clamped to 10–40; only when Night forager is active.
Body size
For the page 8 set, change size locus by ±2 with 80% probability, otherwise ±5; clamp to 0–100.
Body form
For the page 8 set, switch Baseline and Streamlined with no environment-dependent bias.
Colony role
For E12 carriers, choose a different role whose prerequisites are present. Inherited roles may later become inactive after module loss.
Native feature switch
Toggle one of the template’s whitelisted native features, chosen uniformly. This can disable or restore it.

## Native feature whitelist
B06 starch secretion; B07 oil secretion; B08 protein secretion; B09 signal plus glow as one coupled feature; B13 rivalry secretion; and self-propulsion in B01/B04/B05/P02/P07. Founders have all their whitelisted native features enabled. Native feeding pathways, photosynthesis, infection susceptibility, host lists, essential attachment and basic division cannot be lost through this first whitelist.
Disabling a native feature stops its action and its explicit action cost. Do not invent a maintenance rebate when no such cost existed. Existing fields remain in the world after their producer loses secretion. Loss of self-propulsion does not remove habitat compatibility or local feeding. Disabled native traits remain in the genome and may be restored by a later toggle.
## Order and duplicate prevention
Evaluate ordinary quantitative mutation, food-preference mutation, supplementary-module change, then developmental mutation. Use separate deterministic streams. Reject duplicate native equivalents even when the native switch is off: losing native glow cannot acquire a second E02 copy. Invalid or empty choices produce no change; never reroll until useful. Persist the complete proposal before placement checks.
Optional action dependencies follow the final proposed genome. A motility loss may leave a life cycle less effective without making it illegal. An essential habitat or attachment dependency must remain valid. No native-feature toggle can remove carbon, nutrient, a stored meal or the already-paid material of a physical structure.
# 14  Food caches and environmental inheritance
E17 Food cache is eligible for P01, P02, P05, P07 when the genome also carries E08, and for native detritus-feeding P09. It occupies one supplementary slot and pays 0.02 energy/s. It stores actual surplus prey-meal material in a finite world object. Descendants can encounter that cache later, but receive no ownership privilege.
## Construction and deposits
When active, E > 40 and stored meal exceeds 1.50 times derived B0, deposit up to 0.02 times derived B0 times dt carbon from the meal while leaving at least 1.00 times derived B0 in it. Transfer proportional bound nutrient. The lowest birth-ID depositor pays the 2 energy cache-creation cost once; each depositor also pays 0.10 energy per carbon actually deposited. Create only if the first deposit can succeed.
Allow one cache per cell, shared by all eligible depositors. Its fixed capacity is 4 carbon, independent of who created it. Simultaneous deposits share remaining headroom proportionally. Use the existing finite-food-object budget of 128; failure to allocate an object prevents the deposit without cost or inventory loss.
## Release and use
Beginning on the next tick after deposition, release at most 0.02 carbon/s as local detritus, transferring the cache’s proportional nutrient. Release never exceeds remaining inventory. No organism consumes the object directly; consumers use the released detritus through their existing diet. Empty caches disappear. Sampling moves actual remaining inventory; destroying the object releases it once into detritus.
A cache can feed descendants, strangers or competitors. A producer that later loses E08 may be unable to use its own earlier deposit. E17 then becomes inactive unless native detritus feeding remains; the existing cache persists. This is environmental inheritance, not genetic transfer or free resource generation.
Earlier generation leaves
Later generation encounters
Food cache
Finite delayed detritus supply, shared with any compatible feeder.
Film
Changed exposure and diffusion under the original film rules; no hereditary ownership.
Mineral grit
Mineral available through the existing dissolution process.
Fungal network
Only surviving valid links carry resources; descendants cannot use dead or merely decorative connections.
Depleted resource patch
A changed opportunity that may favor movement, dormancy or a different feeding route.

Excavating channels or building blocking nests is outside this packet because terrain-volume displacement and collision ownership need a separate contract. The implemented inheritance mechanisms above work through existing resource inventories and do not require a fluid simulation.
# 15  Lineage portraits camera and timeline
## Lineage portrait
Place the founder and selected descendant side by side with their actual trait values, strategy, stage program, body plan, module set and enabled native features. Render both at the same labeled world scale, with an optional normalized comparison. Separate inherited structure from current growth and temporary state; never imply an adult is larger solely because its genotype changed.
Show both the advantage and recorded cost: “Larger target body; higher maintenance,” “Can settle; juvenile cannot reproduce,” or “Native movement disabled.” A changed strategy, body form, life-cycle module, expressed role or native-feature switch qualifies as a branch candidate after D4’s existing five-descendant and three-generation persistence gate. Size also uses the current quantitative discovery thresholds.
## Follow this story
The player chooses one individual, branch or colony. Follow its actual position smoothly; manual pan suspends following until resumed. On division, default to the daughter retaining the entity ID and provide a selector for the other daughter. Following a branch uses its visible-member centroid; geographically separated groups produce markers rather than a rapidly jumping camera.
On colony separation offer “follow original member,” “choose group” or “stop following.” Default to original member. On extinction stop and show the last known location and recorded losses. Do not jump to an unrelated survivor. Pause-on-discovery is optional; opening the portrait follows the existing panel pause policy.
## Ecosystem timeline
Record births with trait changes, established branches, first life-stage transitions, bond formation and separation, colony splits, cache creation/depletion, resource thresholds and extinctions. Aggregate repetitive events; do not animate every division. Each card stores a time window, measured values, relevant IDs and whether a replayable snapshot exists.
A direct rule can support “Settling stopped because support disappeared.” Nearby simultaneous events support only an association. Preserve earlier provenance limits for mixed food pools. Old compacted history remains labeled incomplete; no generated narrative fills the gaps.
## Art deliverables
Add juvenile and settling overlays, fungal dispersal stages, Streamlined silhouettes for the eligible templates, size bands, five role marks, partner brackets and finite cache icons. Use source frame standards from D1 and retain crisp sampling. A cache has four fill bands; physical fill uses its actual carbon inventory. Reduced motion keeps static stage, role and link indicators. No color-only distinctions.
# 16  Six focused development scenarios
These are declared fixtures for validating rules and explaining behavior. Each uses its numeric ID as seed, 128 × 128 grid, no stones unless stated, open lid and fixed light 0.8 unless overridden. Organisms begin at ordinary inoculation values unless the row explicitly declares a test state. Export every override with the fixture.
ID and setup
Required observation
D501 Night behaviorOne B01 at (64,64), Night forager, sugar 0.5 and nutrient 0.2 in radius 5. At 10 s set light 0.10; at 25 s set 0.80.
Activity changes only after the five-second dwell. Repeating with E = 10 at start demonstrates emergency activity; this is a labeled test override.
D502 SettlementB01 with E13 at (64,64), stone at (65,64), sugar 0.5 and nutrient 0.2 in radius 5.
At least ten juvenile seconds precede settlement; transition costs are paid. No division before adulthood. Removing support returns the organism to Juvenile.
D503 Dispersing daughterGel patch radius 12 at (64,64); F02 with E14, B = 4, N = 0.4, E = 80, H = 100, age = 40. Sugar 0.5 and nutrient 0.2 in patch.
A valid division produces one full-budget disperser; there is no remote fungal resource link while it travels. Birth is not forced if a normal gate prevents it.
D504 Pending body changeUse a fixed genome-proposal fixture with one oversized daughter and blocked adjacent placements.
No cost or birth commits while blocked. Unblock one valid position; the saved proposal commits unchanged. Save/reload does not reroll it.
D505 Qualified sharingTwo linked B01 at (64,64), both E12 and E15, B = 1 each, E = 80 and 10. Use a labeled transfer-only one-tick fixture.
For dt = 0.10, donor sends 0.05 energy, receiver gets 0.045 and 0.005 dissipates. Removing E15 from either end gives zero transfer.
D506 Finite inheritanceCreate a cache at (64,64) containing 1 carbon and 0.10 nutrient; no organisms initially.
After a transfer-only ten seconds, cache holds 0.80 carbon and 0.08 nutrient; released detritus holds 0.20 and 0.02. Later consumer introduction is a logged intervention.

The transfer-only fixtures isolate one operation and explicitly disable ordinary metabolism and transport. They test accounting, not long-term viability. Production recipes and spontaneous evolutionary outcomes require separate runs with all rules active; no hidden overrides can be used in promotional footage.
# 17  Update order and saved state
Keep the D2 ten-stage update order with D4 additions. D5 changes only the listed work within each stage. Profiles are derived from immutable genomes and saved state, never from animation frames. All new time values are simulated seconds.
Stage
D5 work
1 Commands
Apply explicit body fixtures, imported genomes, interventions and cache samples through the existing validated command queue.
2 Environment
Release cache contents that existed before this tick; apply existing environmental transport. Newly deposited inventory cannot release until a later tick.
4 Sense and move
Resolve mandatory movement overrides; use the 0.5 s decision schedule, behavior state, derived speed and functional contact geometry.
5 Contacts
Resolve attacks and infection first, then E12 links, then E16 bonds from remaining legal candidates. Reserve formation costs once.
6 Intake
Use the derived profile, life-stage restrictions and D4 feeding policy. Sharing later in the tick never retroactively funds these requests.
7 Maintenance
Charge ordinary costs, stage upkeep and behavior overhead; apply mortality. Remove dead entities and links once.
8 State and structures
Resolve dormancy and life-stage transitions, optional actions and caches; then fungal transport, E15 colony exchange and E16 partner transfer, in that order. Sharing systems operate on disjoint eligible edges.
9 Births
Create or reuse saved proposals, validate final daughter placements and costs, then commit both daughters and reconcile owned pools.
10 Publish
Record stage, role, body, relationship and ancestry events. Update notebook candidates without changing the simulation outcome.

## State required for save and replay
Add behavior strategy and state, decision countdown, threshold timers, size locus, body form, native-feature bits, colony role, life stage and stage timers, proposal genomes and version stamps, division ordinal, settling support ID, partner ID and lockouts, cache inventories and release eligibility tick. Existing E12 and fungal link arrays remain separate. Role expression and profile factors must be reproducibly derived or saved with their version.
Persist relationships by stable entity plus birth identity where needed. Validate mutual edges after import and reject dangling or incompatible references. Apply derived multipliers in one documented order: ancestor, size, quantitative loci, modules, life stage, colony role, temporary state. Material capacities and energy caps are resolved before the next tick; no draw from cosmetic RNG enters these calculations.
# 18  Implementation gates and team response
Milestone
Scope and evidence
A Behavior and identity
Implement strategies, decision memory and immutable birth proposals. Confirm neutral founders preserve prior profiles and save/reload does not reroll births.
B Life stages and body
Implement E13/E14 and eligible body variation. Confirm juvenile feeding/reproduction gates, actual size costs, daughter placement and transport classes.
C Colony roles and partners
Implement E15/E16, role expression and native-feature loss. Demonstrate paid transfers, disconnected failures, role inactivity and separation without duplicated resources.
D Environmental history
Implement E17, lineage portraits, story following and timeline. Demonstrate exact cache inventory, history limits and camera recovery on splits/extinction.

## Acceptance conditions
Conservation: births, caches, jacket release and transfers reconcile carbon, nutrient and mineral inventories. Energy transfers account for their deliberate loss. No body mutation grants material. Native-feature loss stops its action without deleting previously secreted world inventory.
State integrity: no juvenile divides, disperser secretly feeds, dormant carrier travels, bonded individual belongs to a sharing colony, or newborn inherits a live partner target. Every stage transition, separation and failed birth has a defined valid state afterward.
Reproducibility: identical rules, seed, saved proposal and commands yield identical state at 1× and 4× and after save/reload. Viewing portraits, scrolling history and changing camera targets cannot alter outcomes. Preserve the existing agent cap and Android performance targets; measure dense mixed scenes before raising any cap.
Player understanding: a reviewer can distinguish inherited behavior from temporary state, identify the cost of a specialized role, explain a failed settlement and trace one cache’s finite resources. Verify default, dense and reduced-motion views with touch and keyboard access.
## One response document from the team
Append a Living Behaviors section to EXPANSION_RESPONSE.md. Include milestone status; D5 A01–A09 disposition; source-to-code and asset mappings; exact field/module versions; changed balance; fixture outcomes; observed performance; save compatibility; remaining conflicts; and decisions needing the owner. Keep implemented, tested and proposed items separate.
Return four short recordings with inspector evidence: juvenile to adult to dispersing descendants where applicable; two colony roles exchanging a finite resource; a partnership breaking under stress; and a functional trait disappearing in an inherited lineage. Label pre-seeded genomes and test-only overrides. Do not manufacture a successful evolutionary story to satisfy the review.
Continue using the previous four documents. This packet provides the missing behavior and development rules and a clear route through the full specification set; it does not replace the original product, resource or visual foundations.