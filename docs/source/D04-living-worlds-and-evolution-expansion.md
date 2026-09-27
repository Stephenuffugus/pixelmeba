# Pixelmeba: living worlds and deeper evolution

Design continuation and corrections · September 26, 2026

**Purpose:** make the dish more capable of producing its own history. Add abilities that change where descendants can live, what they can consume, how they survive shortages, and how they reshape their neighborhood. Give players enough evidence to understand those changes without prescribing a winning ecosystem.

This is a design handoff, not a claim that these systems have been implemented or balanced. All quantities are fictional game units and proposed starting values.

## 1. Reading order and authority

Use these documents together:

1. `Pixel-Petri-Design-and-Build-Specification.docx`: foundation.
2. `Pixelmeba-Mass-Expansion-Design-Volume-2.docx`: expanded ecology and content.
3. `Pixelmeba-Evolution-Core-Design-Addendum.md`: evolution becomes a core requirement.
4. This document: explicit corrections below, eight additional inheritable modules, living structures and experience design.

This document wins only where it explicitly amends a previous rule or adds a new system. Other rules remain binding. Keep `simulationVersion 3` for this design family, but record `evolutionRulesVersion`, `moduleRegistryVersion` and the complete content hash. Replays require those exact versions. If the earlier evolution design has already been implemented, retain its rules for existing saves and upgrade only a copied world. Do not silently change a saved genome's meaning.

Pixelmeba remains the working title. These additions deepen the current roster rather than adding another long list of unrelated starter organisms. An evolved Sprinter should become interesting because it does something different.

## 2. Corrections the team must apply first

| ID | Existing rule and issue | Replacement or clarification |
|---|---|---|
| C01 | Evolution addendum §5 says a weighted food vector preserves the earlier priority order. Ordinary weights cannot reproduce strict first-choice feeding in every resource distribution. | Store feeding policy explicitly. Founders retain `ordered`; new preference variation can establish `weighted` as described in §3. Fixed Traits keeps its recorded policy. |
| C02 | Preference redistribution is undefined when available foods all have zero weight. | Zero total eligible weight means zero request; do not divide by zero or invent a fallback diet. The inspector says “Available food excluded by inherited preference.” |
| C03 | The branch threshold averages changes across loci. With eight loci, one +5 change produces only 0.00625 average distance, far below 0.08. A visible specialist may remain unnamed for a long time. | Use the revised observational thresholds in §3. No branch threshold affects survival or births. |
| C04 | A 0.2% module-change rate splits equally into gain/loss. A founder with no supplementary modules therefore has only a 0.1% acquisition attempt rate per daughter, before eligibility. | Keep this as the Standard rate; describe its pacing honestly and provide disclosed alternative starting conditions. Never promise a new ability in a fixed number of minutes. |
| C05 | A mutation can remove an ability while a daughter inherits its persistent structure. Generic “no refund” language does not specify ownership. | Reconcile actual stores and structures after resource splitting using §9. Loss must not erase material or leave live links to an absent capability. |
| C06 | Surface anchor wording leaves directed transport dependent on unspecified base handling. | Active substrate-attached organisms cannot enter directed channels. Resting overrides attachment and releases it; waking must attach again. Free organisms retain their original transport class. |
| C07 | Native template sensing could be outside the evolution clamp of 1–6 cells. That would violate neutral-founder equivalence. | A sensing locus is enabled only after an explicit mapping preserves the native value at 50. Do not clamp a founder into a different profile. Publish any exception in the content data. |
| C08 | Several simultaneous abilities can spend the same energy or biomass. | Use the shared budget and action priority in §9. Every successful action reserves its cost before another action can use the remainder. |

These are specification defects or ambiguities, not observed bugs in the team's code. No build has been reviewed here.

## 3. Corrected inheritance and discovery rules

### Feeding policy

For `ordered`, allocate the organism's own intake budget to compatible locally available foods in the stored order, from a pre-allocation snapshot. Submit those requests to the shared-resource allocator. Do not reallocate losses from competition again in that tick.

On the first successful preference-mutation draw for an `ordered` feeder with two or more compatible foods, establish `weighted`: with n foods, give the first-ranked food weight `2/(n+1)` and each remaining food `1/(n+1)`, then perform the addendum's 0.05 weight transfer. Log the policy change as well as the weight change. Later preference mutations adjust weights normally. The mapping changes actual behavior and must be shown in the inspector.

New food capability modules add a food at the end of an ordered list. In a weighted policy, allocate the new food 0.10 weight and multiply existing weights by 0.90. Loss removes its entry and renormalizes positive remaining weights; if their sum is zero, restore `ordered` using the ancestral order restricted to supported foods. Removing a module never removes a native food pathway.

### Branch discovery

Keep immediate mutation records and the existing persistence requirement: at least five qualifying descendants, with three generations elapsed beyond the candidate founder. A candidate now qualifies through any of:

- At least 0.10 normalized change in one active quantitative locus relative to its branch reference.
- Mean absolute active-locus difference of at least 0.03.
- A different supplementary module set.
- A different feeding policy, or at least 0.15 absolute change in one shared food weight when both policies are weighted.

Compare only loci active in both genomes. No shared active loci means no quantitative qualification. Module and feeding criteria still work. Use stable ancestry and the oldest qualifying ancestor rule. A new module does not earn a branch name merely by appearing once.

The UI distinguishes **variation observed**, **branch established** and **branch extinct**. Do not repeatedly congratulate the player for every tiny mutation.

### Pacing and starting diversity

The Standard probability of at least one module acquisition attempt in 1,000 daughter births is `1 - 0.999^1000`, about 63.2%, assuming each birth is eligible and has a free slot. This is an attempt, not a surviving branch or a particular ability. A specific module is rarer when multiple modules are eligible. Stochastic failure remains possible.

Offer three clearly labeled starting options:

| Option | Setup | Intended use |
|---|---|---|
| Identical founders | Neutral ancestral genomes, no supplementary modules | Watch divergence from a common start |
| Varied traits | Existing 45–55 active-locus initialization, no supplementary modules | Immediate small differences to inspect |
| Diverse founders | Varied traits; independently give 10% of eligible founders one legal supplementary module, selected uniformly | Explore combinations sooner without falsely claiming they evolved during this run |

Diverse founders are labeled “present at creation” and have no invented ancestral events. Their externally supplied biomass and energy follow normal tool initialization. Any extra structure starts empty unless its inventory is separately declared and debited as an external input.

Advanced mutation presets: Standard uses the existing 8% quantitative / 2% preference / 0.2% module-change rates. Accelerated uses 16% / 4% / 1%. Accelerated is explicitly a game setting, not a more realistic simulation. Fixed Traits disables all three. Rate changes are timestamped interventions; faster playback does not change rates per birth.

## 4. The expanded ability registry

Assign the four existing supplementary modules IDs E01 Starch release, E02 Signal glow, E03 Resting stage and E04 Surface anchor. This document adds E05–E12, for twelve supplementary module types total. Keep the limit of three supplementary slots per genome. Native abilities remain separate.

Every supplementary module adds the existing 0.02 energy/s active maintenance surcharge. Listed action costs are additional. The ordinary inherited maintenance multipliers apply once to the sum of native maintenance and module surcharges. Movement, construction and secretion costs remain separate. Resting uses the established dormancy override and disables new actions.

Eligibility follows ancestor IDs, not appearance. A native equivalent cannot be acquired again. Module selection is uniform within the exact versioned eligible list, with no environment-directed reroll.

| ID | Module | Eligible ancestors | What becomes possible |
|---|---|---|---|
| E05 | Reserve chamber | B01–B13, Y01–Y02, F01–F04, A01–A05, P01–P10 | Store more already-earned energy for future shortages |
| E06 | Shade collector | A01, A02, A04, A05 | Trade peak photosynthetic throughput for better low-light capture |
| E07 | Light seeker | A01, A02, A03, A05 | Gain slow self-propelled movement toward brighter reachable water |
| E08 | Debris feeder | P01, P02, P03, P05, P07 | Use local detritus when no prey meal is held |
| E09 | Protein release | B04, B05, F01, F02, Y01, Y02 | Release broth from deposited protein for compatible neighbors or self |
| E10 | Matrix builder | B01, B04, B06, B10, B11, Y01, F02 | Turn paid body material into shared extracellular film |
| E11 | Mineral jacket | P01, P02, P07 | Build a mineral covering that slows Needlejaw's capture |
| E12 | Colony adhesion | B01, B04, B06, B09, B10, B11 | Form small, temporary linked clusters without becoming one resource pool |

No new infection, host, toxin or parasite-target rules are introduced. Existing compatibility resolves through the ancestor template. These boundaries keep a descendant's relationships understandable while allowing its other traits to vary.

## 5. E05–E08: survival, light and new food

### E05 Reserve chamber

Increase the individual's native maximum energy storage by 40. This is capacity, not an energy grant. Feeding and photosynthesis earn energy through existing conversions, subject to the new cap. Add 0.03 energy/s chamber upkeep while active, in addition to the module surcharge. No new carbon compartment or invisible extra food is created.

Show reserve fill as an interior amber pocket in four bands. It shrinks when stored energy is used. The exterior size and transport class do not change. On division split current energy before applying each daughter's resulting capacity; overflow becomes recorded dissipated energy, never food or biomass. On module loss use the same rule. Death follows the existing energy disposal rule.

Tradeoff: extra storage helps only if the organism can first earn a surplus. Constant shortages make the upkeep a burden.

### E06 Shade collector

For the photosynthetic route only, replace the light response with `min(1, effectiveLight / 0.35)` and multiply its maximum intake ceiling by 0.70. Apply inherited feeding investment to that reduced ceiling. Environmental and resource limits still apply. A04 uses this only in its photosynthetic mode; its sugar route and mode thresholds remain unchanged.

Against a native linear light response, at light 0.10 this permits `0.70 × (0.10/0.35) = 0.20` of the ancestral ceiling instead of 0.10. At light 1.0 it permits 0.70 instead of 1.0. These are ceilings before nutrients, CO2 and other limits, not guaranteed intake.

Appearance: broaden the interior dark pigment patch inside the original silhouette. Do not recolor the water. Exclude native A03 because it already has a specialized low-light curve.

### E07 Light seeker

Grant a base speed of 0.15 cells/s and light sensing radius 2; these become the mapped baselines for the existing motility and sensing loci. Activate previously inactive loci at their stored inherited values, defaulting to 50 for founders. Apply movement energy cost of `0.10 × (0.5 + g_motility)^2` energy/s only while self-propelling.

When active, unheld and unattached, follow the existing candidate-movement solver but score reachable candidates by effective light. Choose the highest score, using seeded tie-breaking. If no candidate is brighter than the current cell by at least 0.01, stay. Physical barriers and habitat checks still apply. Do not teleport or follow invisible light through a wall.

Appearance: two small trailing motility pixels during actual movement. The organism remains its original transport class. Loss cancels self-propulsion and leaves it in its current valid cell. A bright crowded patch can attract these descendants into competition; the module has no hidden crowd avoidance.

### E08 Debris feeder

When no stored prey meal exists, the organism may request local detritus under its ordinary total intake ceiling, oxygen and nutrient requirements, and aerobic conversion. A held meal takes exclusive priority; do not simultaneously eat a full meal and a full detritus ration. A successful capture in the contact stage cancels the current tick's detritus request before allocation.

Movement retains the normal prey score and additionally considers reachable detritus using `amount/(amount + 0.1)`; take the larger score rather than summing them. Eligibility grants digestion, not an expanded prey list. Shellglider still requires its native mineral growth budget.

Appearance: a small granular interior mark; short feeding pulses only during recorded detritus intake. This creates a path from dead colonies to surviving consumers without forcing every predator to starve immediately after live prey declines.

## 6. E09–E12: shared chemistry and physical features

### E09 Protein release

Use Volume Two's E_PROTEIN secretion exactly: 0.02 activity/s, 0.40 energy/s, energy above 35, a compatible deposited substrate in the same or four-neighbor cell, and the existing activity limit. Preserve carbon and bound nutrient when protein becomes broth. Multiple enzymes share the remaining substrate budget; no molecule is converted twice.

Gaining this module does not grant broth feeding. Creambud already supports broth; some other eligible producers may chiefly benefit neighbors. Display “Produces broth; cannot consume broth” when true. This is a deliberate possible cost, not a defective mutation that must be rerolled.

Appearance: paired producer notches and brief pale release marks. No permanent particle cloud.

### E10 Matrix builder

While active, E > 35, structural biomass B > 1.2 × B0 and local film carbon < 0.50, request conversion of `min(0.02 × dt, B - 1.2B0, 0.50 - localFilm)` body carbon into the existing film pool. Transfer the body's proportional bound nutrient. Spend 2 energy per carbon actually transferred; reserve the cost first and limit transfer to available energy.

All builders read the same film snapshot. If their requests exceed the cell's headroom, reduce them proportionally. Commit together. Film has no individual owner, is not a new organism, and follows the existing film decay, consumption and protection rules. This module grants no additional defense multiplier or inhibitor immunity. Never stack protection once per producer.

Appearance: an edge-connected film texture, whose opacity reflects stored film carbon. Because body material is diverted, building can delay division. Competitors may benefit from the public structure without paying for it.

### E11 Mineral jacket

This is an added covering for P01/P02/P07, not a second native Shellglider shell. It creates a separate `jacketMineral` inventory. Target coverage is 0.10 mineral per current body carbon. During the structure stage, build at up to 0.005 × B0 mineral/s from local free silicate, capped by target deficit and shared availability. Spend 10 energy per mineral actually bound. Skip construction while resting, held, below E = 15, or after death.

Coverage `c = clamp(jacketMineral / (0.10 × B), 0, 1)`. While present, multiply self-propelled speed by `1 - 0.20c`. Needlejaw's required continuous contact becomes `1 + 3c` seconds for these targets. Other capture relationships remain unchanged. This does not reduce inhibitor, starvation, trap or parasite damage.

Sample c when Needlejaw first begins a handling attempt and retain that threshold until contact breaks. This avoids a moving capture deadline as the target builds or grows. A new attempt samples again. Target movement can still break contact; a jacket is a delay, not invulnerability.

Appearance: four authored rim coverage levels, with a small gap showing the soft body. Bound mineral splits at division. A daughter lacking the module releases its allocated jacket into local grit. Native P05/A02 mineral pools remain distinct and unchanged.

### E12 Colony adhesion

Two free, active carriers with the same ancestor template can form a link after remaining within 0.5 cells for five seconds. Both must have E ≥ 20. Each pays 2 energy on linking. An organism may have at most two adhesion links and a connected component at most eight members. Eligible pairs are resolved by sorted stable birth IDs; rejected pairs pay nothing. Do not link across a prohibited transport edge.

Linked members stop self-propelling. Each member pays an additional 0.01 energy/s per incident link. All feeding, energy, reproduction, predation and genotype state remain individual. Links convey neither nutrient transfer nor invulnerability. They can keep a group near a productive patch, but each member still competes for the same food.

A member severs its own links after ten seconds without intake, E < 15, entering dormancy, being captured or held, or losing the module. Death, division and player sampling also remove its incident links. Severed survivors have a ten-second relinking lockout. Both newborns begin unlinked. Forced relocation breaks a link whose endpoints exceed 0.75 cells; links never pull organisms through walls.

Linked members cannot use directed channels until released. Gate placement between linked members severs that link. The UI may outline a cluster, but must count its members separately against the agent budget. Do not claim this is a new multicellular organism.

Appearance: thin pixel connections and a shared selection outline. Natural arrangement comes from actual positions; no decorative extra cells or compressed collision radius. At eight members further links fail visibly without changing the organisms' genomes.

## 7. Environments that remember earlier life

This pack creates persistent consequences through existing inventories rather than an expensive full-fluid simulation.

| Persistent change | Cause | Later consequence |
|---|---|---|
| Film patch | Matrix builders diverted body carbon | Other organisms encounter an altered shared surface; original film rules apply |
| Detritus bed | Recorded deaths and discarded meals | Recyclers and debris-feeding descendants find food |
| Mineral grit | Shell or jacket material released on death/loss | Existing dissolution returns mineral for later growth or construction |
| Food-access zone | Enzyme secretion converts deposited substrates | Nearby compatible feeders gain access to the finite products |
| Dark neighborhood | Actual Raftball canopy biomass | Low-light descendants may do relatively better beneath it |
| Spent patch | Total consumption exceeds replenishment | Motile or resting branches may persist differently from stationary feeders |
| Vacant refuge | A predator cannot cross a particular gate | Compatible prey may survive there; food and habitat constraints still matter |

These consequences can outlast the individual that caused them. The notebook may say “This film remains from earlier growth,” but only attribute it to a particular branch when the ledger retains that provenance. Mixed pools must not be assigned to the most recent nearby organism.

No automatic terraforming into land animals, plants or unrelated species is added. The depth comes from connected mechanisms operating over many generations, with future content packs widening the space of possible forms.

## 8. Six curated starting dishes

These are authored layouts, not guaranteed evolutionary stories. Designers should build them on the existing 128 × 128 grid and expose every initial placement. Use a fixed seed per recipe; do not overwrite results to match a description. Resource concentrations below apply per cell in the named patch. All omitted initial fields use the foundation's Water Garden defaults; no additional hidden food.

| ID and name | Exact additional setup | Question for the player |
|---|---|---|
| L301 Two Lunches | Two radius-8 patches centered at (40,64) and (88,64). Each gets 30 B01, sugar 0.5 and nutrient 0.2. Start Varied Traits, open water, fixed light 0.8. | Do separate starting neighborhoods stay different after their descendants spread? |
| L302 Under the Canopy | Radius-10 patch at (64,64): 20 A05 and 30 A01; nutrient 0.2, fixed light 0.8. Diverse Founders. | Which descendants persist in the shade they and their neighbors create? |
| L303 Public Kitchen | Radius-8 patch at (64,64): 20 Y02, 20 B08, protein carbon 0.5 with bound nutrient 0.05, free nutrient 0.1. Diverse Founders. | Does making food accessible benefit its producer, its neighbors, or both? |
| L304 Empty After the Feast | Radius-10 patch at (64,64): 60 B01, sugar 0.8 and nutrient 0.2. Diverse Founders; no scheduled replenishment. | What happens when a successful population consumes its own opportunity? |
| L305 The Jacket Garden | Radius-12 patch at (64,64): 100 B01, 12 P07, 2 P10; sugar 0.8, nutrient 0.2, silicate 0.3. Explicitly seed 6 P07 with E11, 6 without; jackets start empty. | Is delayed capture worth slower movement and construction costs here? |
| L306 Borrowed Shelter | Radius-8 gel patch at (64,64): 40 B06 with sugar 0.6 and nutrient 0.2. Explicitly seed E10 on 20, no supplementary module on the other 20. | Who pays for the film, and who benefits from it? |

Initial organisms scatter uniformly among valid patch cells using the recipe seed; counts and imported genomes are recorded external inputs. L305/L306 are explicitly pre-seeded comparison scenarios, not demonstrations that spontaneous evolution has already occurred. Their seeded genomes inherit normally afterward. Do not silently replenish prey or rescue a failing dish.

Recipe validation requires correct loading and functioning rules. Interesting long-term outcomes need exploratory runs across multiple seeds before becoming marketing claims.

## 9. Canonical resource and state resolution

Retain the ten update stages. New behavior fits them as follows:

| Stage | Addition |
|---|---|
| 2 Environment | Existing film, grit, shade and field transport act from the world snapshot |
| 4 Sense and move | Apply light seeking, debris scores, jacket speed and linked/attached movement overrides |
| 5 Contacts | Resolve attacks first, then adhesion link opportunities using surviving valid participants |
| 6 Intake | Resolve meal-versus-detritus feeding and explicit feeding policy; existing shared resource allocation stays authoritative |
| 7 Maintenance | Pay ordinary maintenance, movement, reserve-chamber upkeep and adhesion-link costs; resolve starvation and death |
| 8 State and structures | Resolve dormancy transitions first; release invalid links/anchors; then budget optional actions and shared construction |
| 9 Births | Split inventories, mutate daughters, reconcile inherited stores and reset physical links before publishing |
| 10 Publish | Store observations, trait distributions, state changes and replayable checkpoint metadata |

Within stage 8, reserve energy and body material in this order: mandatory transition costs; native optional actions in stable action-ID order; supplementary E01–E12 actions in ascending ID order. Shared film/mineral requests reserve a maximum budget, undergo proportional allocation, then charge only actual accepted work. Return unused reservations before births, without another action retry. No negative pools or resource loans against future intake.

Existing F02 fungal transfer remains its own budgeted simultaneous pass after optional construction and before births. It reads post-construction body pools. Do not treat adhesion links as fungal transport links.

On birth, first apply the parent's division costs and split actual body, energy, meal and applicable mineral pools under the existing rules. Then apply mutation and reconcile each daughter's profile:

- Excess energy above its resulting capacity dissipates with a ledger event.
- Jacket inventory without E11 becomes local grit; no jacket is created merely by gaining E11.
- Colony links are removed for the dividing individual; both daughters start unlinked.
- E04 attachment resets; supported daughters can attach again through its timer.
- E03 loss changes inherited dormancy to Active for that daughter, without a waking energy gift. Division cannot occur while resting in the first place.
- The existing F03 trap stays solely with the retained parent; F02 transport links follow their existing branching rules. Supplementary modules do not duplicate either structure.
- Released material appears in the world at the end of birth processing and becomes available no earlier than the next tick.

On death, remove incident links and release jacket mineral into grit exactly once. Shared film remains in the world because it was already debited from the producer. Sampling transfers all selected owned pools, never a second copy of the film beneath an organism unless the tool separately samples that field.

## 10. A better first five minutes

The time marks below are UX targets, not scheduled biological events.

| Moment | Player action | What the interface reveals |
|---|---|---|
| Start | Choose a blank dish or curated recipe | Three plain choices: starting life, starting resources, starting variation |
| First placement | Paint a small colony and food patch | Preview count and total added resources before committing |
| First observation | Tap an organism | One sentence explaining current activity, followed by food, energy and inherited traits |
| First consequence | Watch growth, movement or depletion | A restrained optional prompt points to an actual recorded change |
| First comparison | Pin an ancestor or starting branch | Side-by-side values show descendants' differences as they appear |
| First experiment | Fork the current dish and change one condition | The player sees what was copied and which intervention differs |

If no mutation has occurred, say so. Offer to inspect founders, observe population changes, speed up simulation or start a labeled Diverse Founders dish. Never fabricate a discovery to complete onboarding.

Sandbox tools remain unlocked. Guided prompts teach observation without gating organisms behind grind. Extinction leaves the dish available for inspection; offer reset, introduce new life, or fork from an existing snapshot. Introducing life is a recorded intervention.

## 11. Interface and visual hierarchy

At default zoom the dish is the primary surface. Keep an unobtrusive top strip for pause/speed and a bottom tool tray. Selection opens a compact inspector; advanced details expand rather than permanently occupy the view. Portrait layouts use a bottom sheet, landscape layouts may use a side inspector. Keep touch controls at least 48 CSS pixels across and avoid placing small dismiss controls over the dish.

Use three inspection depths:

1. **Now:** eating, searching, resting, linked, held or stressed; current limiting factor.
2. **Inherited:** traits, modules, upkeep, ancestor comparison and branch identity.
3. **Evidence:** intake measurements, costs, birth events, field values and time windows.

The “Why?” button reports rules and observed inputs, not a universal causal conclusion. “No births: energy below division cost” is supported when the gate is measured. “This strain is the best adapted” is generally unsupported.

Provide one active overlay at a time: food, light, chemistry, ancestry, selected trait, or environmental modification. A selected organism can retain a small outline above any overlay. Use color plus pattern and a visible legend. Never require the player to distinguish every species through hue alone.

Pixel art layers render in this order: environment, shared structures, bodies, physical feature rims, status effects, selection, UI. Keep glow local. The camera should not jump to every mutation. A discovery card offers **Follow**, **Compare** and **Dismiss**; it pauses only if the player enabled “Pause on discoveries.”

Sound is event-based and rate-limited. A branch discovery gets one soft cue; ordinary mutation records stay silent. Reduced motion replaces flowing links and pulses with static status marks. Evolution remains understandable with sound and animation disabled.

## 12. Comparison tools that preserve evidence

**Fork dish:** make an exact checkpoint copy, then let the player introduce one or more logged changes. Both copies retain seed state, versions and current resources. Ancestry IDs are namespaced by world after the fork; the shared checkpoint remains identifiable.

**Matched playback:** advance both dishes by the same number of simulated ticks, not equal wall-clock time. Slower rendering must not create unequal experiment durations. Diverging populations will consume random opportunities differently; an identical original seed does not keep every later birth paired.

**Compare panel:** show elapsed simulated time, initial setup differences, interventions, population and biomass, selected trait distributions, module frequencies, deaths by recorded cause, and capacity-limited intervals. Do not equate a higher organism count with a healthier or more complex ecosystem.

**Checkpoint history:** optional automatic ring of ten snapshots at 60 simulated-second intervals. Explicitly labeled automatic checkpoints may rotate; pinned saves are never silently removed. Before making a checkpoint, enforce the existing storage limits. Rewinding opens a new branch from a stored state rather than trying to reverse diffusion or recover discarded random events.

**Evolution postcard:** export a screenshot, ancestor/descendant trait comparison, seed, versions, creation mode and intervention summary. Include a “Contains pre-seeded abilities” badge when applicable. A postcard alone cannot reproduce a dish; offer the recipe/snapshot file separately.

## 13. Edge cases worth resolving before polish

| Situation | Required result |
|---|---|
| A mineral-jacket offspring loses E11 | Its allocated jacket becomes grit; its sibling gets only its own allocation |
| A reserve carrier loses E05 with high energy | Capacity shrinks and excess dissipates; no energy is converted to edible material |
| Two matrix builders fill the same cell | Proportional shared headroom allocation; no overshoot beyond 0.50 from construction |
| A cluster member divides or dies | Incident links break; survivors remain valid independent organisms |
| A gate is painted through a cluster | Affected links break; no organism is dragged or duplicated |
| A light seeker is trapped or resting | Its movement override loses to that state; it does not pay self-propulsion cost while stationary |
| Detritus feeder captures live prey | One meal route for the tick; no second complete detritus ration |
| All available weighted foods have zero preference | No request; inspector explains preference limitation |
| Museum/specimen view is opened repeatedly | No simulation RNG changes and no organisms spawn |
| A world reaches its population cap | Births stop under the existing rule and observations show capacity limitation |
| Old genotype data lacks a new module field | Keep old registry semantics or perform an explicit copy migration; do not roll a random default |
| Mutation produces no profile difference | Record a neutral variation if needed; do not announce a functional breakthrough |

These checks target conservation, reproducibility and understandable behavior. They are not a request for exhaustive tests of cosmetic variations.

## 14. Build order and the next review packet

**Priority 1: corrections.** Implement C01–C08, unchanged-founder checks and valid ancestry. Confirm the existing evolution slice before adding modules.

**Priority 2: broad useful abilities.** Implement E05 reserve, E06 shade, E07 light seeking and E08 debris feeding. These extend algae and consumers without introducing linked physical structures.

**Priority 3: environmental construction.** Implement E09 protein, E10 matrix and E11 mineral jacket, including material ownership and shared allocation.

**Priority 4: colonies and observation.** Implement E12 adhesion, branch discovery refinements, the six recipes and comparison/postcard tools. Preserve the original performance targets; profile dense mixed scenes before increasing entity counts.

Designers deliver eight module icons, functional sprite layers, four reserve-fill levels, four jacket-coverage levels, colony link states, one crowded-dish mockup and the three inspector depths. Reuse ancestor silhouettes and existing effects where their meaning matches. A visual change must not suggest an ability the simulation lacks.

Developers append **Living Worlds** to the existing single `EXPANSION_RESPONSE.md`. Include applied corrections, implemented module IDs, exact eligibility and cost data, any changed balance values, save compatibility, unresolved decisions, and measured performance. Return four recordings with the inspector visible: a costly shared film, a jacket being built and recycled, a cluster separating after food loss, and a forked dish comparison. Label seeded setups and test-only overrides.

Before promotional claims, demonstrate an unscripted lineage change on a recorded production seed and distinguish it from a pre-seeded ability demonstration. A compelling simulation earns its surprises from the rules; the interface should make those surprises legible.
