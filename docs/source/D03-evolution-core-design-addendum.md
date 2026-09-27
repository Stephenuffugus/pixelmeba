# Pixelmeba: evolution as a core system

Developer and designer handoff · September 26, 2026 · Evolution specification 1.0

## 1. Product decision and authority

**A dish must develop new inherited characteristics and combinations of abilities through reproduction, variation, competition and changing conditions.** Players choose the starting organisms, quantities, resources, placement and environment. Those choices establish the conditions; they do not prescribe the final organisms.

This addendum supersedes the “autonomous genetic mutation” exclusion on page 3 and the “Future evolution boundary” on page 23 of *Pixelmeba-Mass-Expansion-Design-Volume-2.docx*. It also overrides fixed lifetime species profiles in Evolution worlds. The original specification and Volume Two still govern resources, habitats, controls and other behavior unless explicitly changed here.

Evolution is the default for new sandbox dishes and belongs in the core release. Preserve Fixed Traits as an experiment setting and preserve existing saves under their recorded rules. The minimum evolution implementation must ship before completing the entire 38-organism catalog. Build depth with a few organisms first.

All numerical settings below are proposed game balance, not biological measurements or tested outcomes. This is a digital ecosystem with fictional organisms.

## 2. What the player should experience

Start with a small mixed community. After several generations, notice that one colony moves differently, another survives a previously difficult patch, and a third has become dependent on food released by a neighbor. Inspect the organisms to see what changed, which ancestor they came from, and what each advantage costs. Let the dish continue; populations may spread, split, coexist, collapse or disappear.

The experience must support these possibilities:

- Descendants differ from their founders, even without additional player intervention.
- Different parts of one dish support different branches of the same starting organism.
- A useful feature in one location becomes a disadvantage elsewhere.
- Organisms change their surroundings, which changes the conditions experienced by later generations.
- Rare variations may disappear by chance. Evolution does not guarantee improvement or survival.
- A dish can stabilize. Do not force a mutation spectacle or catastrophe because nothing dramatic happened recently.

“On its own” means autonomous simulation while the dish runs. It does not mean unlimited computation while the app is closed. The first release pauses when backgrounded and resumes exactly; label this clearly. Offline catch-up is a separate later feature, not an estimate silently presented as simulated history.

## 3. Five systems that must remain distinct

| System | What changes | Inherited? | Example |
|---|---|---|---|
| Growth | An individual's biomass and stored resources | Resources are divided at reproduction | A well-fed cell grows before dividing |
| Immediate response | Current behavior or state | No, but response thresholds can be inherited | A cell moves toward food or enters dormancy |
| Genetic variation | A newborn's trait values or supported ability modules | Yes | One daughter has greater motility investment |
| Selection and drift | Relative abundance of variants | Population outcome | A slow lineage grows in a sheltered pocket; a rare lineage is lost |
| Ecological succession | Community composition and local conditions | Not itself a genome | Waste from one population supports another |

Do not label an individual becoming temporarily darker in shade as genetic evolution. Do not label a population increase as a new species. The inspector separates inherited traits, current state and environmental exposure.

## 4. How the starting setup matters

| Player choice | Mechanism the simulation must preserve |
|---|---|
| Starting organisms | Establish available ancestral capabilities and food-web relationships |
| Starting counts | Affect competition, encounters, reproduction opportunities and the chance a rare variant persists |
| Food quantities | Affect growth, depletion, population booms and the costs of specialized feeding |
| Nutrient and mineral quantities | Limit construction and reproduction even when carbon food is abundant |
| Tight versus scattered placement | Changes access to food, shared secretions, local crowding and encounters |
| Separate food patches | Creates different opportunities for specialization and migration |
| Walls, gates and corridors | Restrict movement and resource exchange; isolation can preserve differences |
| Light, warmth, moisture and salinity | Alter suitability and the relative success of inherited traits |
| Predators, competitors and decomposers | Change mortality and resource cycling |
| Starting variation | Determines whether founders are identical or already diverse |
| World seed | Determines reproducible random choices, including mutation draws |

A starting ingredient is not an evolution recipe. Adding a mineral does not guarantee a shell lineage; it makes an existing or newly available shell capability affordable. Food scarcity does not automatically generate the missing digestive enzyme.

Keep equal-seed reproduction deterministic on the same simulation/content version. Different seeds can produce different histories from the same visible setup. After a player changes a world, small differences can amplify; paired dishes illustrate possibilities, not proof of universal outcomes.

## 5. Genome and phenotype contract

Each cellular organism has an immutable `genomeId`, an `ancestorTemplateId`, inherited quantitative loci, a set of supplementary ability modules, and a parent birth-event reference. Compute its working profile from that genome using a versioned mapping. Never modify the shared ancestor template when one offspring varies.

Quantitative loci are integers from 0 to 100; normalized value `g = locus / 100`. Founder values are 50 unless a founder recipe explicitly supplies variation. Preserve the species' original working values at 50. The gene-to-profile mapping is shared by the simulation, inspector and preview.

| Locus | Initial phenotype mapping | Tradeoff or boundary |
|---|---|---|
| Motility investment | Multiply nonzero native speed by `0.5 + g` | Multiply movement energy cost per simulated second by the square of that factor; native immobility stays zero |
| Feeding investment | Multiply ordinary intake ceiling by `0.75 + 0.5g` | Multiply ordinary maintenance by the same factor; does not increase food availability or conversion yield |
| Sensing investment | Multiply native sensing radius by `0.5 + g`, bounded to 1–6 cells | Multiply ordinary maintenance by `0.75 + 0.5g`; no perception through prohibited barriers |
| Division investment | Multiply minimum division interval by `1.5 - g` | Multiply the native division energy cost by `0.5 + g`; biomass/nutrient thresholds remain binding |
| Preferred pH shift | Shift the native preferred interval by `2 × (g - 0.5)` pH units | Preserve interval width; clamp its center to keep the interval within the world's supported domain |
| Preferred salinity shift | Shift the preferred interval by `0.4 × (g - 0.5)` | Preserve interval width inside 0–1; a saltward shift sacrifices suitability at the opposite end |
| Preferred warmth shift | Shift the preferred interval by `0.4 × (g - 0.5)` | Preserve interval width inside 0–1; no universal heat/cold immunity |
| Dormancy threshold | For organisms with dormancy, multiply food-shortage trigger duration by `1.5 - g` | Earlier entry avoids exposure but loses active feeding time; all entry, waking and lifespan costs still apply |

Apply multiplicative maintenance modifiers together once. Do not multiply secretion, trap or shell construction costs as ordinary maintenance. Existing energy floors, starvation, inhibitors and maximum age still apply. If a template lacks a required native value, mark the locus inactive rather than inventing a default behavior. Inactive loci are excluded from mutation selection until a compatible module makes them meaningful.

Also store a feeding preference vector over **already supported** food pathways. Components are nonnegative and sum to 1. Founders reproduce the template's existing preference order through an explicit published vector. A preference changes how a finite intake budget is requested; it cannot create a digestive pathway.

For feeding, first request each available compatible food according to its weight and the existing total intake ceiling. Redistribute the unrequested share once among other locally available compatible foods, proportional to their weights. Then apply shared-pool allocation and nutrient/oxygen limits from Volume Two. Unfulfilled requests after competition wait until the next tick. Photo-versus-food mode rules still prevent double feeding.

## 6. Reproduction, inheritance and mutation

Use asexual inheritance for the first release, including the game's abstracted larger organisms. Sexual reproduction, cross-species hybrids and gene exchange require separate designs; do not approximate them by blending arbitrary neighbors.

On an eligible division:

1. Confirm resource costs, entity capacity and valid daughter placement. A failed birth creates no mutation event.
2. Snapshot the parent's genome and genealogy. Deduct and split actual resources using the existing rules.
3. Give both daughters a copy of the parent genome. Independently evaluate mutation for each daughter.
4. Make quantitative, preference and module draws from separate deterministic random streams keyed by world seed, birth event and daughter index.
5. Validate the resulting genomes, assign immutable IDs and derive their profiles. Birth state rules such as resting Sporeveil still apply.
6. Publish births and changes together. No daughter acts until the next tick.

The retained entity ID is not a permanent individual identity. Give each daughter a new birth-event identity, including the daughter retaining the parent's entity ID. Record both as children of the pre-division individual. This prevents self-parent links and makes a real family tree possible.

**Standard starting rates, per daughter:** 8% chance of one quantitative mutation; independently 2% chance of a preference mutation; independently 0.2% chance of one supplementary module change. These are tuning proposals. Do not scale them by frame rate, game speed or environmental need.

For a quantitative mutation, choose one active locus uniformly. Choose a change of 2 integer points with probability 80%, otherwise 5 points; choose positive/negative with equal probability. Clamp to 0–100. A clamped unchanged value is a neutral draw, not an acquired feature.

For a preference mutation, select two supported foods and transfer up to 0.05 weight from one to the other. Choose direction independently of current food abundance. With fewer than two supported pathways, this draw has no effect.

For a module change, choose addition or loss with equal probability. Select uniformly from eligible absent modules or removable supplementary modules. At three occupied supplementary slots, an addition draw has no effect. No eligible option means no change. Never reroll until a useful result appears. Loss removes a capability from the newborn; it does not refund spent energy or convert existing structures into extra biomass.

Most variation should be small, neutral or costly. A harsh environment filters variation; it does not direct the random generator toward a useful trait. A later player tool may increase variation, but must be labeled an intervention and recorded in the recipe.

## 7. New abilities from a composable module system

The game can produce new combinations within an authored library of mechanisms. It cannot honestly promise unlimited new biological functions or write new executable abilities during play. Expand the library over time; an existing simulation version keeps its recorded library.

Each genome supports up to three supplementary modules. Native template abilities remain present and do not occupy these slots. A native ability cannot be gained a second time. Module combinations must be validated against declared movement, diet and life-state rules.

The initial module registry should include these four fully defined additions:

| Module | Eligible ancestor templates | Behavior and cost |
|---|---|---|
| Starch release | B01, B02, B04, B05, Y01, Y02 | Gain E_STARCH secretion using Volume Two's producer conditions, rate, energy cost, diffusion and conversion; it grants no direct starch intake |
| Signal glow | B01–B13 except native B09 | Gain B09's signal secretion and threshold-based cosmetic glow, including both energy costs; glow does not provide photosynthetic light |
| Resting stage | B01–B11, B13, Y01, Y02 | Gain Volume Two's complete dormancy state machine, costs, reduced damage, waking rules and continuing age; no reproductive spore behavior |
| Surface anchor | Motile B01–B12, Y01, Y02 | Gain inherited anchored/resting movement behavior defined below; no free film, armor or resource bonus |

All four also add 0.02 energy/s ordinary maintenance while active, even when their special action is idle. Their action costs are additional. Existing dormancy replaces this maintenance with the established resting rule while Resting; preparation and waking retain ordinary costs. Tune this surcharge only through a recorded balance revision.

Surface anchor: when next to solid substrate or mesh and energy exceeds 35, attach after five continuous seconds. While attached, speed is zero and an additional 0.10 energy/s is paid. Detach after ten continuous seconds without food intake, when support disappears, or when energy falls below 15; impose a ten-second reattachment lockout. Feeding and predation remain ordinary. This can retain a feeder near a resource, but also strand it as food disappears. Attachment does not stop directed gate transport unless the base transport rule already excludes attached organisms.

Do not add these modules to viruses or parasites in this release. Existing infection, host, toxin target and inhibitor category lists remain based on ancestral template IDs, including evolved descendants. This is an explicit initial boundary, not a claim that these systems cannot evolve in a later fictional design.

The next authored module packs should extend fungi, algae and consumers with mineral coverings, colony adhesion, resource storage, detritus processing and dispersal stages. Each requires eligibility, paid construction, upkeep, loss behavior, feeding/transport compatibility and artwork before it can enter the random pool. Those future modules are proposals, not enabled features in this addendum.

Quantitative evolution applies across cellular categories from the first release. Structural novelty begins with the four modules above and expands through tested content packs.

## 8. The connected ecosystem creates the surprises

No hidden “evolution score” makes a successful organism divide. Success comes from actual intake, costs, survival and births. Track reproductive success for observation only.

Examples the rules should allow, without scripting their outcome:

| Starting arrangement | Possible history | Why it may fail |
|---|---|---|
| Two sugar patches separated by a corridor | Fast travelers spread; slower feeders persist near a stable patch | Travelers spend too much energy crossing empty space |
| Starch beside a mixed colony | An enzyme-producing branch opens a resource and feeds neighbors | Nonproducers consume the released sugar first |
| A stable salt gradient | Descendants with different preferred salinity occupy different regions | Mixing removes the gradient or one branch disappears by chance |
| Intermittently exhausted food patches | A resting branch persists through some shortages | Dormancy costs or long deprivation kill it anyway |
| High food near a frequently visited grazer | Rapid reproduction temporarily offsets losses | Grazer pressure overwhelms births or food runs out |
| A sheltered mesh beside a food source | Anchored descendants remain near the source | Source depletion leaves them waiting to detach |
| Dense colonies in a dim dish | A signal-glowing branch creates a visible neighborhood | Glow consumes energy and may be selected against |

Changing the environment should sometimes reverse which branch does well. Evolution must not be a permanent ladder from weak to superior.

## 9. Strains, branches and names

Distinguish genome identity from a named branch. A small mutation gets a genotype record immediately; it does not announce a new species.

For discovery labels, compare each descendant to its nearest named ancestral branch's founder genome. Use the sum of absolute active-locus differences divided by `100 × number of compared loci`. Ignore inactive loci. A distinct module set also qualifies regardless of this numerical distance.

A candidate branch qualifies when distance is at least 0.08 or its supplementary module set differs. It becomes a named discovery only after its qualifying descendants number at least five and have existed for three parent-to-child generations beyond the candidate founder. A descendant that no longer meets the candidate criterion is not counted toward that candidate. Use a deterministic oldest qualifying ancestor rule to avoid overlapping announcements.

A new discovery uses its qualifying candidate founder as the branch reference genome. Descendants may form later branches from that reference, so the family tree can continue growing. Label it “new strain” or “new branch,” not scientifically verified speciation. Store candidate ancestry separately from active entities. Thresholds control the notebook only; they must never change reproduction or survival.

Suggested generated name: ancestral name + observed trait descriptor + short stable ID, such as “Sprinter · Saltward · 7C2.” Keep the ID visible if the player renames it. Do not call a lineage “Superior,” “Advanced” or “Perfect.”

## 10. Appearance must reflect inherited function

Keep the foundation's crisp pixel style, restrained halos and readable silhouettes. Build layered organism art from an ancestral silhouette, inherited feature layers and temporary state layers. No image-generation service is needed during gameplay.

| Visible change | Actual cause |
|---|---|
| Longer or more visible motility fringe | Higher inherited motility investment; cap artwork to silhouette limits |
| Changed sensor-tip pattern | Sensing investment crosses an authored visual band |
| Small folded seam | Inherited resting capability; full folded pose only while resting |
| Substrate-facing foot or short attachment stalk | Surface anchor module; connected pose only while attached |
| Notched producer marking | Starch-release module; activity particles only when secretion actually occurs |
| Bright center and local halo | Glow is currently active, not simply inherited |
| Stable secondary border pattern | Branch identity; remains identifiable without color alone |

Use three visual bands per quantitative feature rather than changing sprites for every integer. Smoothly changing trait values can cross bands without a new branch announcement. Cosmetic body proportions may vary within the ancestral silhouette, but must not change collision, biomass or gate class. Functional size evolution is deferred until birth and body-construction costs are specified.

Preserve ancestry recognition. A bacterial descendant must not suddenly receive animal legs because a generic random-art system chose them. At normal zoom show the two most relevant feature cues; reveal the full module list when selected. Provide a traits overlay and reduced-motion alternative.

## 11. Controls, inspection and explanations

New-dish setup offers Evolution On by default, Fixed Traits, a reproducible seed, and founder variation: Identical or Varied. Identical is the default; Varied draws each active locus from 45–55 inclusive using a separate seeded initialization stream. Neither option changes starting biomass or grants supplementary modules.

In a running Evolution dish, expose pause, speed, follow lineage, compare ancestor, trait overlay and save specimen. Mutation rates live in an Advanced panel; changing them records a timestamped intervention. Do not bury the entire evolution system behind that panel.

The inspector must show:

- Ancestor template, current strain, genome ID and generation.
- Actual trait values and changes from the ancestor.
- Inherited abilities, their upkeep and their current activity state.
- Current limiting factors and recent intake, survival and birth measurements.
- The exact mutation event when known, with “benefit unknown” until observations exist.

The family view has two levels: a simplified named-branch tree and a detailed selected family. Population graphs show abundance and median/range of selected traits per region. A branch fading from the graph is not proof its traits caused extinction; competitors, shortages and chance may also contribute.

Use factual event text: “A daughter inherited +5 motility investment,” or “This branch rose from 8 to 23 individuals while the eastern patch remained salty.” Only call an association causal when the recorded rule establishes it. Do not let an AI narrator invent motives or unseen history.

Saving a specimen stores its genome and ancestry summary. Spawning it later uses the normal tool inventory ledger and is recorded as an external introduction. A specimen is not a free duplication loophole or a claim of uninterrupted evolution.

## 12. Integration, persistence and resource limits

Create `simulationVersion 3` for Evolution worlds, with a versioned genome schema, phenotype mapping, module registry and mutation settings. Existing v1/v2 saves remain playable. Copying a v2 world into v3 assigns the corresponding founder genome to each organism, preserves all resources and current states, and begins ancestry tracking at conversion. Do not invent its earlier family history.

Retain Volume Two's ten update stages. Read inherited profiles in sensing, movement, feeding and maintenance. Evaluate mutation only during successful births in stage 9. In stage 10, record genome/birth references, branch candidates and observations. Newborn features cannot emit, feed, glow or divide until a later tick under their normal conditions.

Save complete random-stream state or counter positions, genomes, birth identities, module state timers, branch records and registry versions. Restoring a file must not redraw mutations. A snapshot preview, inspector selection or cosmetic animation must not consume simulation randomness.

Deduplicate identical genomes and cache their derived profiles. Retain every living genome and any genome referenced by a saved specimen, pinned branch or retained event. Keep at most 10,000 recent unpinned birth-event details; compact older unpinned events into branch summaries while preserving named-branch parent relationships. Clearly label unavailable individual-level history. Never merge distinct living genomes simply to reduce storage.

Keep the existing 6,000-agent capacity and other world caps until measured evidence supports a change. Reaching capacity blocks births; display the resulting artificial constraint and mark population/evolution summaries from that interval as capacity-limited. Do not invent ecological deaths to clear slots. Keep evolution computations out of rendering and avoid per-frame whole-population genealogy scans.

## 13. Delivery order and acceptance

**Milestone A: inherited variation.** Implement immutable genomes, the quantitative loci, successful-birth mutation, genealogy and ancestor comparison using B01, B06 and A01. Fixed Traits remains the regression reference. This is part of the core playable slice.

**Milestone B: novel combinations.** Add the four specified modules, compatibility validation, costs, layer-based visuals and discovery branches. Expand to the remaining cellular templates only after their active loci and native abilities are explicitly mapped.

**Milestone C: long-term observation.** Add regional trait graphs, specimen export, branch comparison, compacted history and the complete save migration path. Further structural modules follow their own specifications.

| Acceptance area | Evidence required |
|---|---|
| Inheritance | With mutation disabled, descendants inherit the exact genome while resource pools still split correctly |
| Variation | A controlled birth fixture produces the recorded mutation from its seed, including neutral/clamped draws |
| Selection | Deliberately initialized variants show the mechanically predicted difference in intake or costs under controlled conditions; do not require spontaneous useful mutation in one run |
| Divergence | Separate regions can retain distinct trait distributions without a scripted branch spawn |
| Tradeoffs | Higher speed pays its energy cost; shifted tolerance loses suitability at the opposite edge; modules pay upkeep |
| Novel combinations | A legal combination acts through its actual component rules; incompatible or duplicate-native modules are rejected |
| Conservation | Mutations and module gain/loss create no carbon, nutrient, mineral, energy reserve or duplicate organism |
| Identity | Both daughters have valid birth identities and no self-parent genealogy links |
| Determinism | Same seed, versions and commands reproduce genomes and world state at 1×/4× and through save/reload |
| Visibility | Every visible inherited feature maps to a genome value or module; temporary effects map to real state |
| Honest limits | Capacity and history compaction are disclosed; extinct branches are not resurrected automatically |

For exploratory balance, compare distributions across a disclosed set of seeds and show failures as well as interesting runs. Do not tune to one dramatic recording or assert a guaranteed evolved form. No balance or performance results are claimed by this document.

Append an **Evolution** section to the team's single `EXPANSION_RESPONSE.md`. Return implemented milestones, gene-to-profile mappings, module eligibility, balance changes, deterministic fixture results, performance measurements, known limitations and three short recordings: ancestor versus descendant, two regional branches, and one inherited advantage becoming a disadvantage after conditions change. Keep simulation evidence separate from proposed future features.
