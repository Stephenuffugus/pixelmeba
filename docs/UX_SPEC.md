# UX_SPEC — screens, views, copy, art, motion, sound, accessibility

Version 1.0 · 2026‑09‑27 · Canonical. The implementing agent is also the designer, artist and
sound designer. Mechanics in `PIXELMEBA_IMPLEMENTATION_SPEC.md`; numbers in `CONTENT_TABLES.md`.

---

## 1. Principles
1. **The dish is the hero.** Inviting before any panel opens; life is the brightest color; chrome is quiet.
2. **Three actions, then depth.** Explore = Add Life, Feed, Look. Lab = everything. Same world.
3. **Truthful feedback.** A cue means a committed event. A sentence means a measured value.
4. **Calm.** No alarms, no loss screens, no guilt. Death is a soft dissolve into remains.
5. **Readable without color, sound or motion.** Shape + pattern + words for every meaning.
6. **A child can act; a scientist can verify.** Plain words first, numbers one tap away.

## 2. Information architecture

```
Home ─ Continue (last dish, live thumbnail)
     ─ Play ─ invitation shelf: Garden (+ What if?), playgrounds when supported
     ─ Lab  ─ New Dish · Load · Import file · Import recipe ID
     ─ Notebook ─ Something happened (story cards) · Favorites · Journal · Bookmarks · Gallery · Experiments · Research (Phase 6)
     ─ Field Guide ─ species · materials · structures · equipment · rules glossary
     ─ Settings ─ sound/music/voice · haptics · reduced motion · text size · overlay palette · pause on discoveries · checkpoint ring · diagnostics (opt‑in)
     ─ About ─ version, content hash, privacy summary, "fictional simulation" statement, open‑source licenses
Dish screen ─ Explore view ⇄ Lab view (toggle in top strip; no state change)
```
Blocking panels (New Dish, Load/Save, Comparison setup, Field Guide, Settings) pause and restore
the prior run state on close. The inspector, overlays, notebook tabs and charts do not pause
unless the player chooses.

### 2.1 Home
Continue card (name, sim time, thumbnail, paused badge). Play card. Secondary row: Lab, Notebook,
Field Guide, Settings, About. First launch with no saves: Play is emphasized; Continue hidden.

### 2.2 Play shelf (D08/D09)
Square live‑state thumbnails, one title, one question, **Start**. ≤ 3 cards visible on a phone;
scroll for more. Garden first. Secondary **What if?** link under Garden opens the sheet (§3.4).
Unsupported playgrounds are absent (dev builds list them on a labelled build‑status screen).

### 2.3 New Dish (Lab)
Progressive disclosure: **Basics** (habitat/recipe picker with preview, dish name ≤ 60,
seed with Randomize), **Evolution** (Standard · Accelerated · Fixed Traits, with the one‑line
honesty note; founder mode Identical · Varied · Diverse), **Environment** (lid, light mode,
drying — Phase 5), **Content** (advanced: enabled systems shown read‑only from the manifest).
Summary states exactly what is preloaded and the total initial ledger. Enter paused with the
Life tray open (Lab) or Look active (Explore).

### 2.4 Dish screen — shared chrome
Top strip: dish name · simulated time `mm:ss` (hours when needed) · Pause/Run · speed (1× 2× 4×,
step while paused) · effective‑speed badge when behind · view toggle Explore/Lab · More (save,
duplicate, compare, share, snapshot, undo history, settings, field guide, home). Undo button
always visible (labelled "Undo rewinds time" on long‑press/tooltip). Capacity banner when the
agent cap is reached. Extinction card when no life remains (§5.11).

## 3. Explore view

### 3.1 Layout
Portrait 360×800: top strip ≈ 12 %, viewport ≈ 63 %, bottom actions ≈ 25 % (targets, not fixed
px). Bottom: three large labelled buttons **Add Life** · **Feed** · **Look** (Look selected by
default), Undo at the left edge, three favorite marker slots at the right edge (Phase 4).
Landscape/desktop: actions in a 280–340 px side panel; viewport keeps the dish fully visible.
Honor safe areas. Nothing small sits over the dish.

### 3.2 First minutes (D08 §3)
Arrival: paused garden; one line: **"Press play and look closely."** No auto‑spawning surprises.
One optional prompt at a time (dismissible; **Show me** highlights a control without using it):
1. "Tap a Sprinter." → summary sheet. 2. "Press Run." 3. After a real feeding cue: "It's eating
sugar — tap to see how much." 4. After a real division or 120 s: "A cell split." or "Nothing has
split yet — tap one to see what's stopping it." 5. Feed: preview a patch, place it, return to Look.
6. Offer **Follow this family** after a real division. If no event occurs, suggest inspecting a
constraint or adding life — never fabricate. The three‑minute goal is one understood interaction.

### 3.3 Mode labels (must appear wherever a world is described)
"Standard Evolution", "Accelerated Evolution (game setting, not realism)", "Fixed Traits".
Internal partial registry: "Core prototype — quantitative evolution". Seeded genomes: "present at
creation". Test overrides: "test‑only override".

### 3.4 What if? sheet (D09)
≤ 3 choices per source, each: icon + label + one sentence naming the single difference; small
before/after preview (R‑G3 shows an outline at the old patch and a solid new patch); **Details**
reveals values, seed, versions, "R‑G3 / rev 1 / seed 104729", Copy. **Start** is distinct from
selecting. Starting saves the current dish (or offers export/replace if slots are full; Cancel
loses nothing). Buttons: **Again**, **Another idea**.

## 4. Input and tools

### 4.1 Layout acceptance sizes
360×800 portrait, 800×360 landscape, 1440×900 desktop; each at 100 % and 200 % text. Touch targets
≥ 48 CSS px; body text ≥ 16 px; text contrast ≥ 4.5:1; essential graphics ≥ 3:1. Panels never cover
the selected organism without a visible reposition route (drag handle / collapse).

### 4.2 Input contract
- Look/Inspect: one‑finger drag pans; tap inspects (candidate list on ambiguity: proximity then id).
- A paint/placement tool paints only when explicitly selected. Two fingers **always** pan/zoom
  and cancel an uncommitted paint preview. Explore: tap‑to‑place returns to Look; **Paint** toggle
  enables repeated strokes. Lab: persistent selected tool.
- Brush footprint and total dose preview before release; distance‑sampled; crossed brush on
  invalid terrain; one gesture = one command.
- Mouse: left uses tool; middle‑drag pans; wheel zooms; right‑drag pans. Keyboard: arrows pan,
  +/− zoom, Space pause/run, 1/2/4 speed, `.` step, I inspect mode, L life, F feed, Esc → Look,
  Tab order through chrome, Enter/Space activate, `/` search in Field Guide, U undo.
- Long press = tooltip/help on touch.

### 4.3 Explore tools
**Add Life**: species tiles (shape silhouette + diet symbol + name); count 1/5/20 (default 5);
tap the dish to preview footprint and accepted count; confirm places. **Feed**: Sugar default,
0.10/cell, radius 3; **Dose** reveals 0.02/0.10/0.50 and radius 1/3/6; other foods appear as their
systems arrive (starch, debris; more in Lab). **Look**: inspect/pan.

### 4.4 Lab view
Bottom toolbar categories: **Inspect · Life · Food · Chemistry · Habitat · Tools · Observe**
(**Equipment** from Phase 6: Observe/Feed/Shape/Climate/Transfer subgroups with a Favorites row
of three pinned items). A category opens a shallow tray of labelled icons; selecting an item
shows purpose, suitable habitats, dose, radius, "changes / does not change / watch for".
Tools tray: stone, wall, porous bead, erase structure, sample, transfer, clean water, snapshot,
duplicate, compare, undo. Observe tray: overlays (one at a time, legend, opacity), infection
markers, trait overlay, ancestry overlay, charts, lineage, relationship map, regions, bookmarks.
Landscape: tray as side panel.

## 5. Inspector and explanation

### 5.1 Depths
**Summary sheet** (bottom sheet portrait / side panel landscape): name (nickname), ancestor
type icon, life state chip, age · generation, energy and health bars with numbers, one
constraint sentence. Buttons: **Why?** · **Details** · **Follow** · shortcuts row.
**Why**: two headings **Happening now** and **Passed to offspring**; all constraints as
sentences with values; division blockers list; predation state; ties → "A few things are slowing
it down" + list.
**Details**: tabs Now · Inherited · Evidence (measurements over windows, costs, birth record,
field values, lineage links, capacity flags). Cell inspector and colony panel as SPEC §12.1.

### 5.2 Reason code → copy (Explore wording; Lab wording adds the value inline)
| Code | Explore | Lab detail |
|------|---------|------------|
| FOOD_ACCESS_LOW | "There is not enough food here." | "Food access: {supplied}% of requested {food} supplied ({amount} in {window}s)." |
| FOOD_NONE_COMPATIBLE | "Nothing here it can eat." | "No compatible food in this cell. Eats: {diet}." |
| FOOD_EXCLUDED_BY_PREFERENCE | "It ignores the food here." | "Available food excluded by inherited preference (weights: {weights})." |
| NUTRIENT_LIMITED | "It needs minerals to grow." | "Growth limited by mineral nutrients: {supplied}% supplied." |
| OXYGEN_LIMITED | "Not enough oxygen here." | "Aerobic intake limited by oxygen: {supplied}%." |
| LIGHT_LIMITED | "Too dark to make food." | "Photosynthesis at {light} light ({factors})." |
| CO2_LIMITED | "Not enough carbon dioxide." | "CO2 {amount}; intake {supplied}%." |
| SILICATE_LIMITED | "It needs silicate to grow its shell." | "Shell growth limited by silicate: {supplied}%." |
| CROWDING_INTAKE_HALVED | "It's crowded here." | "Cell over capacity ({load}/8): intake halved, births blocked." |
| SUIT_* | "This water doesn't suit it." | "{factor} {value} outside preferred {range} (suitability {s})." |
| INHIBITOR_EXPOSURE / RIVAL_EXPOSURE | "Something here is hurting it." | "Inhibitor exposure {x}: growth ×{g}, −{d} health/s." |
| ENERGY_ZERO | "Out of energy — losing health." | "Energy 0: −4 health/s." |
| INFECTED | "It's infected and can't split." | "Infected by {virus}; lysis in {t}s." |
| PARASITIZED | "Something is attached to it." | "{parasite} draining {rate} C/s." |
| DIV_BLOCK_ENERGY | "Needs more energy to split." | "Division needs {need} energy; has {e}." |
| DIV_BLOCK_BIOMASS | "Needs to grow more before splitting." | "Division needs {need} biomass; has {b}." |
| DIV_BLOCK_AGE | "Too young to split." | "Minimum division age {a}s; age {age}s." |
| DIV_BLOCK_HEALTH | "Too hurt to split." | "Division needs health ≥ 50; has {h}." |
| DIV_BLOCK_PLACEMENT / CROWDING | "Needs room to split." | "No free compatible neighboring cell / cell over capacity." |
| DIV_BLOCK_CAPACITY | "The dish is full." | "Simulation capacity reached (6,000). Births deferred." |
| DIV_BLOCK_STATE | "Can't split while {state}." | same |
| PRED_NO_PREY | "Nothing to hunt nearby." | "No compatible prey within {r} cells." |
| PRED_OUT_OF_CONTACT | "Chasing food." | "Prey at {d} cells; contact at 0.5." |
| PRED_COOLDOWN | "Resting after a catch." | "Attack cooldown {t}s." |
| PRED_MEAL_FULL | "Full for now." | "Meal {m} ≥ 0.5 B0; digesting." |
| RESTING_FOOD_SCARCE | "Resting until conditions change." | "Resting because food stayed scarce {t}s; wakes after 10 s of food and E ≥ 5." |
| RESTING_DRY | "Resting because it's too dry." | same with moisture |
| NEIGHBORS_DETECTED | "It senses neighbors." | "Signal {v} (threshold 0.30)." |
| SECRETION_* | "Making enzyme." / "No starch nearby to work on." | activity, cost, substrate |
| CAPACITY_REACHED | "The dish is full." | "Simulation capacity reached — this is a limit of the game, not the ecosystem." |
| MIXED_CAUSES | "A few things are slowing it down." | list |
| EVIDENCE_EXPIRED | "Older details were summarized." | "Detailed history compacted; summary retained." |
Inherited change: "This offspring inherited a different trait." → "Inherited {locus} {±Δ}
({ancestor} {a} → {b}); cost: {tradeoff}." Never "adapted", "immune", "superior".
Death: "It died of {cause}." → "Primary: {cause}; also: {contributors}."

### 5.3 Shortcuts
**What does it eat?** (diet + what is present) · **Why did it stop?** (blockers) · **Where is its
family?** (lineage/Find) · **What changed?** (recent events for this organism/branch). Fixed set;
no free‑text chat.

### 5.4 Events and charts
Event feed (coalesced) with sim time; interventions marked. Charts: biomass by species, count,
O2, nutrient, deaths; regional trait graphs; module frequency. Species use color + pattern +
label; every chart has a data‑table alternative for screen readers.

### 5.5 Lineage panel
Two levels: named‑branch tree (ancestor → branches with state chips variation/established/
extinct) and selected family (parents, siblings, children with birth times and deltas). Actions:
Follow lineage, Compare ancestor (side‑by‑side trait values), Pin branch, Rename (ID stays
visible), Save specimen. Discovery card: title "New branch: {name}" with Follow · Compare · Dismiss.

### 5.6 Comparison
Setup: baseline shown, intervention queued on B, horizon 60/180/600/Stop, optional prediction
note. Running: phone A/B toggle with synced camera; large screens side by side; both paused when
setup opens. Results: table of measures and differences; "this paired run"; conclusion label
picker (supports / contradicts / can't tell) + note. Save result card.

### 5.7 Field Guide
All entries immediately visible. Per species: silhouette, diet, habitat, preferred conditions,
predators, hosts, products, one example interaction, and two sections **General biology** vs
**Rules of this game**. Materials say "No additional modeled reaction" where true. Equipment
entries: changes / does not change / watch for. Glossary of terms and the fictional‑units notice.

### 5.8 Favorites (Phase 4)
"Follow this family" → nickname prompt (optional) → marker pattern (three accessible patterns).
Marker slots show member count; tap = Find. Family sheet: descendants, generation depth, confirmed
inherited differences (founder traits vs mutations vs branches kept distinct), Follow next.
Extinction: "No members of the {name} family remain." + last conditions + **Look back** ·
**Continue exploring** · **Start a new dish**. No alarm sound.

### 5.9 Story cards (Phase 4)
Tab "Something happened" with a quiet dot for one unseen card. Card: ≤ 3 panels (earlier state or
action · recorded event · later observation), captions with sim time, e.g. "You added sugar" ·
"Sprinters ate sugar" · "Three births were recorded". Buttons: Spotlight · Save picture · Dismiss.
"Memory, not replay" badge when no snapshot.

### 5.10 Share
Sheet with three labelled choices and one‑line descriptions: **Picture** ("a snapshot image;
does not contain the living dish"), **Starting recipe** ("the setup and seed; others can start
the same dish"), **Living dish** ("the full save; continue this exact world on a compatible
build"). Options: include nickname (off), strip metadata (on for pictures). Uses the OS share/
save sheet.

### 5.11 Empty and failure states
Extinct dish: "No life remains." + recorded leading causes + **Add Life** · **Load snapshot** ·
**New dish** (each says whether it rewinds or changes the dish). Capacity reached banner. Save
failed: "Couldn't save; your previous save is intact." Import failed: exact reason; nothing
changed. Slots full: choose export or replace; Cancel. Unsupported recipe/save version: "This
needs a compatible build ({versions})."

## 6. Art direction

### 6.1 Palette (named constants in `art/src/palette.ts`)
Environment: outside `#14252D` · water `#D6E7E5` · gel `#E9E1C8` · sediment `#8B7661` · stone
`#6E7B84` (highlight `#9AA7AE`) · wall `#3A4650` · rim ring `#2C3F49` / highlight `#F5F4EF`.
Interface: surface `#F5F4EF` · text `#172C35` · primary `#256E9E` · muted `#6B7B84` · focus
`#F2B84B` · danger (rare) `#B3473F`.
Organisms (base + accent):
B01 coral `#EF7B6C` / pale band `#FBD5CD` · B02 teal `#32A89A` / `#BFE9E1` · B03 violet `#8B82C6`
/ `#D9D4F2` · B04 amber `#D6A64D` / `#F6E3B0` · B05 blue `#4A90C2` / tip `#F2F7FB` · B06 ochre
`#C8963E` / notches `#5B4420` · B07 navy `#2E4A7A` / amber tip `#E5A83B` · B08 rose `#D98CA6` /
white bands · B09 blue‑green `#3FB3A6` / lime center `#C6F04D` · B10 rust `#B5552F` / cream edge
`#F1E3C8` · B11 red `#C93B3B` / dark bud `#5A1E1E` · B12 olive `#8B9A3C` / seam `#4E5620` · B13
brick `#A8412F` / `#E4B7AF` · Y01 cream `#F2E6C9` / burgundy bud `#7A2E3F` · Y02 ivory `#F5EBD3`
/ orange bud `#E6923A` · F01 ivory `#EFE3C6` / outline `#4A3B2A` / tips `#E08A3C` · F02 copper
`#B87333` / pulse `#F6D7B0` · F03 amber `#C98A2B` / loop `#6B4A12` · F04 silver `#B9BEC4` / ring
`#23272B` · A01 green `#8CBA4B` / gold center `#E9C46A` · A02 gold `#E0B84A` / clear rim `#F7F1D9`
· A03 dark green `#2F6B3A` / mint vein `#9FE3B4` · A04 green `#6FAE4E` / amber `#D9A441` · A05
emerald `#2E9E5B` / hollow `#D6E7E5` · P01 lilac‑gray `#B8AEDC` / `#8F84B8` · P02 cyan `#7FD6E8` /
white cilia · P03 peach `#F3B48E` / crown `#C97A4E` · P04 brown `#8A5A3C` / pale head `#E8D3BD` ·
P05 cream `#EADFC8` / scallop `#9C8B6A` · P06 pale blue `#A9C7E6` / stalk `#5E7EA3` · P07 aqua
`#5CC8D8` / tail `#1F6F7A` · P08 tan `#9C8A6E` / legs `#5E5040` · P09 rose `#D77FA0` / wheel
`#F7DCE8` · P10 blue `#3B5FB4` / fork `#B7C6EE` · X01 gold diamond `#E3C15A` · X02 mauve
`#8C6E9E` · V01 glyph `#3E7BC4` · V02 glyph `#6A4FB3`.
Rule: every species is also distinguishable by silhouette and pattern in grayscale. Review in
the asset previewer with grayscale and each color‑vision‑deficiency simulation.

### 6.2 Sprite specification (D01/D02)
Small (bacteria, yeast, algae, parasites): 16×16 frames, 8–12 px visible body; 4 move/idle, 4
reproduction, 2 stress, 3 death; elongated species have 4 hand‑authored headings (N/E/S/W); round
species 1. Large (P01–P07, P09): 32×32; 6 movement, 4 feeding, 4 reproduction, 2 stress, 4 death.
P08/P10: 48×48 (readable at default zoom via selection magnification). Fungi: 16 connection‑mask
tiles + tip, bud, decaying. Film: isolated, edge, center, eroding. Viruses: inspection glyph +
density overlay only. Two transparent padding px in atlases; nearest‑neighbor; no runtime
rotation or blur. Feature layers: starch notch, protein notches, glow center + 2‑px halo,
resting seam / folded pose, anchor foot, reserve pocket (4 bands), debris granule, shade patch,
light‑seeker trailing pixels, matrix edge texture, jacket rim (4), link pixels, size bands (3),
streamlined variant, role marks (5), partner bracket, cache icon (4 fills), infection glyph.
Show at most two feature cues at normal zoom; the rest on selection.

### 6.3 Silhouette notes per species
B01 compact rod with pale mid band · B02 paired dots in textured colonies · B03 curved rod ·
B04 bead chain · B05 comma with contrasting tip · B06 short rod with three notches · B07 curved
rod with amber tip · B08 capsule with two white bands · B09 double bead with tiny center · B10
spiral with cream edge · B11 wedge with dark bud · B12 oval with central seam (folded when
resting) · B13 angular chain patches · Y01 oval with bud · Y02 pear with bud · F01 branching
threads with dark outline and orange tips · F02 copper threads with pulse on transfer · F03
looped threads · F04 web with ringed specks · A01 disk with gold center (pulse) · A02 faceted
disk · A03 crescent with vein · A04 split spindle (active half brightens) · A05 rosette with hollow
· P01 soft two‑lobed blob · P02 slender body with short cilia · P03 body with feeding crown · P04
segmented worm with pale head · P05 scalloped disk with front lobe · P06 bell on stalk · P07
teardrop with two tail pixels · P08 eight‑leg silhouette (four visible pairs) · P09 round rotifer
with ciliary wheel · P10 long body with forked front · X01 gold diamond outline · X02 mauve
diamond · V01/V02 head‑and‑tail / lace glyphs.

### 6.4 UI icons
24 px glyphs in 48 px targets, inline SVG, `currentColor`; states normal/pressed/selected/
disabled/focus. Set: inspect, life, food, chemistry, habitat, tools, observe, equipment, pause,
play, step, speed, undo, more, zoom‑whole, zoom‑neighborhood, zoom‑close, follow, find, spotlight,
compare, save, share, settings, notebook, guide, family markers ×3 (pattern‑based), what‑if
(change), again (retry), pass (turn), export.

### 6.5 World and effects
Substrate textures 4×4 tileable (water subtle ripple dots, gel soft grain, sediment speckle);
stone tiles with edge highlight; dish rim double ring ≤ 3 % of diameter with soft shadow; deposit
glyphs (starch grains, detritus flecks, protein motes, oil sheen); sugar/broth shown via overlay
haze only; film textures; food object outlines that shrink with inventory; equipment props as
small readable lab pieces with neutral outlines. Effects: deposit ring, diffusion reveal, eating
pulse, division flash, phage burst, resource particles (no simulation content), fungal link pulse
≤ 1/s, handling arc, trap loop, glow halo (local, 2 px). No screen‑wide effects, no gore, no
faces, no grunge.

## 7. Motion

### 7.1 Rules
Locomotion follows actual velocity; feeding and reproduction play only after committed events;
stress after 3 s below threshold, clears after 3 s; death dissolves into remains; idle motion may
move interior pixels but never implies locomotion; cosmetic randomness from the cosmetic RNG only.
Camera never jumps on its own; notifications never seize it.

### 7.2 Animation states → flags
`moving`, `feeding` (intake > 0 this second), `dividing` (birth committed), `stressed`, `dying`,
`resting/preparing/waking`, `glowing`, `secreting`, `attached`, `linked`, `bonded`, `held`,
`handling`, `infected` (glyph on inspect/overlay), `juvenile/settling/dispersing/stranded`.

### 7.3 Layer order
environment → shared structures/film → deposits/objects → bodies → feature rims → status marks →
links → selection → HTML UI.

### 7.4 Reduced motion (fill in during P4.9)
| Effect | Reduced‑motion alternative |
|--------|----------------------------|
| eating pulse | static "feeding" mark |
| division flash | static split frame for 1 s |
| link/transfer pulse | static link with dot |
| handling arc | static ring with progress ticks |
| glow halo | static bright center |
| camera easing | instant |
| particles | none |
| unfolding (wake) | state swap |
| trails (E07, P07) | none |

## 8. Sound and narration

### 8.1 Cues
drop (placement), select, save, discovery (soft chime), compare_result, division (soft click;
coalesced), card_open, gate_click, wake, placement_error (dull). No sound per bacterial division
burst; ≤ 4 world cues/s; coalesce repeats. Ambient loop quiet and optional. Music, effects and
voice volumes separate; mute respected; audio pauses on suspension. Haptics only on intentional
tool actions.

### 8.2 Silence must preserve meaning
Every audible cue has a visible equivalent.

### 8.3 Narration (16 fixed phrases; SpeechSynthesis; off by default)
Press play · Pause · Add life · Add food · Look closely · Eating sugar · Needs more food · Needs
room · Resting · A cell split · Follow this family · The feeder is empty · The light is on · The
light is off · Saved · Undo rewinds time. Played only when the evidence condition is true; text
always shown; never reads dynamic numbers or custom names.

## 9. Accessibility
Semantic controls; visible focus; full keyboard path; ARIA labels for panels, inspector values and
charts (table alternatives); canvas summarized via an accessible species list and selected‑cell
description; live region announces one‑line results (placement accepted, saved, card available).
Reduced motion, quiet audio, simplified overlay palette, 200 % text reflow without hiding primary
controls. Touch targets ≥ 48 px separate from collision geometry. Find button for hard‑to‑reach
selection. No essential meaning by color alone. Test on phone sizes as acceptance, not desktop
only. Contrast audit recorded in `docs/reports/contrast.md`.

## 10. Store presentation (Phase 4; D09 §11)
Promise line: **"Grow a tiny living world. Change one thing. See what happens."** Description
draft (edit to shipped scope): "Grow a tiny living world. Add organisms, feed them, and shape
their habitat in a colorful pixel dish. Follow changing families, try a different starting setup,
and discover what happens when your choices meet a living ecosystem. Start with a few simple
tools, then explore deeper experiments at your own pace." Below: feature list, supported devices,
save/export behavior, and the fictional‑simulation note. Six screenshots: living dish · simple
actions · What if? · inspection · a real inherited change · an experiment. Icon: the dish with
one bright colony, no text. No claims about unreleased content.
