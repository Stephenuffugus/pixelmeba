# CONTENT_TABLES — every number, in one place

Version 1.0 · 2026‑09‑27 · Canonical. These values seed the versioned content packs under
`content/`. Changing any value = new `contentVersion` + fixture update + `DECISIONS.md` entry.
All values are fictional game units. Time in simulated seconds. Grid coordinates are cells.

Phase column = when the entry is enabled in the manifest (see `BUILD_DIRECTIVE.md`).

---

## 1. Species

### 1.1 Identity, category, transport class, phase

| ID | Name | Category | Class | Phase | One‑line role |
|----|------|----------|-------|-------|---------------|
| B01 | Sprinter | bacterium | Small | 1 | Fast aerobic sugar feeder; staple prey; V01 host |
| B02 | Velvet | bacterium (attached) | Fixed | 3 | Surface colony that builds biofilm; V02 host |
| B03 | Dusk | bacterium | Small | 3 | Low‑oxygen sugar feeder; oxygen suppresses it |
| B04 | Recycler | bacterium | Small | 1 | Decomposer: detritus, protein, starch, oil; digests film |
| B05 | Crossfeeder | bacterium | Small | 3 | Eats only metabolite left by others |
| B06 | Crumbsmith | bacterium | Small | 1 | Sugar feeder that secretes starch enzyme (E_STARCH) |
| B07 | Oilwick | bacterium | Small | 3 | Metabolite feeder that secretes lipid enzyme (E_OIL) |
| B08 | Brothmaker | bacterium | Small | 3 | Broth feeder that secretes protein enzyme (E_PROTEIN) |
| B09 | Lantern | bacterium | Small | 5 | Signal producer with costly cosmetic glow |
| B10 | Brinecoil | bacterium | Small | 5 | Salt‑preferring sugar feeder |
| B11 | Sourbud | bacterium | Small | 5 | Acid‑preferring, acid‑emitting sugar feeder |
| B12 | Sleeper | bacterium | Small | 5 | Slow feeder with native dormancy |
| B13 | Rampart | bacterium (attached) | Fixed | 5 | Attached colony secreting RIVAL against B01/B10/B11 |
| Y01 | Bubble | yeast | Medium | 3 | Anaerobic low‑yield sugar feeder; acid emitter |
| Y02 | Creambud | yeast | Medium | 3 | Aerobic broth feeder |
| F01 | Threadlace | fungus (attached) | Fixed | 3 | Branching decomposer; local feeding; digests film |
| F02 | Cordweaver | fungus (attached) | Fixed | 3 | Branching sugar/detritus feeder; E_STARCH; transport links |
| F03 | Traplace | fungus (attached) | Fixed | 5 | Broth feeder that traps P04 |
| F04 | Sporeveil | fungus (attached) | Fixed | 5 | Detritus/starch feeder with resting daughters |
| A01 | Sunbead | alga | Medium | 1 | Photosynthesizer; X01 host |
| A02 | Glasswheel | alga | Medium | 5 | Photosynthesizer needing silicate shells |
| A03 | Shadeleaf | alga | Medium | 5 | Low‑light photosynthesizer |
| A04 | Turnleaf | alga (mixotroph) | Medium | 5 | Photosynthesis in light, sugar in dark; slow swimmer |
| A05 | Raftball | alga (colony agent) | Medium | 5 | Large photosynthesizer that shades its neighborhood |
| P01 | Amoeba | consumer | Medium | 1 | Slow contact grazer of microbes and algae |
| P02 | Ciliate | consumer | Medium | 3 | Fast swimmer; skips attached Velvet |
| P03 | Rotifer | consumer | Medium | 3 | Filter‑feeder abstraction on algae and yeast |
| P04 | Siltworm | consumer | Large | 3 | Sediment grazer; crosses ≤ 2 water cells |
| P05 | Shellglider | consumer | Medium | 5 | Shelled amoeba needing silicate; slow to capture |
| P06 | Bellstalk | consumer (attached) | Fixed while attached | 5 | Stalked ciliate capturing within 1 cell |
| P07 | Dartfin | consumer | Small | 5 | Very fast flagellate; gate‑compatible; costly to run |
| P08 | Waterbear | consumer | Large | 5 | Algae/fungus grazer with dormancy; moisture tolerant |
| P09 | Wheelgrazer | consumer | Medium | 5 | Rotifer on shelled/dim algae and Creambud; detritus fallback |
| P10 | Needlejaw | consumer | Large | 5 | Top predator on P01/P02/P05/P07 with handling time |
| X01 | Hitcher | parasite | Small (free) | 3 | Attaches only to A01 |
| X02 | Threadrider | parasite | Small (free) | 5 | Attaches only to active F02/F04 segments |
| V01 | Pinphage | virus (field) | Viral | 3 | Infects B01 only |
| V02 | Lacephage | virus (field) | Viral | 5 | Infects B02 only where film ≥ 0.10 |

### 1.2 Numeric profiles (neutral, before loci/modules)

| ID | B0 | Q (C/s) | M (E/s) | Min division age (s) | Max age (s) | Metabolism | Energy/C |
|----|----|---------|---------|----------------------|-------------|------------|----------|
| B01 | 1 | 0.18 | 0.50 | 12 | 600 | aerobic | 30 |
| B02 | 1 | 0.12 | 0.35 | 20 | 900 | aerobic | 30 |
| B03 | 1 | 0.12 | 0.35 | 20 | 800 | anaerobic | 18 |
| B04 | 1 | 0.14 | 0.40 | 18 | 800 | aerobic | 30 |
| B05 | 1 | 0.14 | 0.40 | 18 | 800 | aerobic | 30 |
| B06 | 1 | 0.13 | 0.40 | 20 | 800 | aerobic | 30 |
| B07 | 1 | 0.12 | 0.38 | 22 | 800 | aerobic | 30 |
| B08 | 1 | 0.13 | 0.40 | 20 | 800 | aerobic | 30 |
| B09 | 1 | 0.14 | 0.35 | 22 | 800 | aerobic | 30 |
| B10 | 1 | 0.14 | 0.40 | 20 | 800 | aerobic | 30 |
| B11 | 1 | 0.13 | 0.40 | 22 | 800 | aerobic (+0.40 acid/C) | 30 |
| B12 | 1 | 0.08 | 0.20 | 35 | 1800 | aerobic | 30 |
| B13 | 1 | 0.12 | 0.40 | 25 | 900 | aerobic | 30 |
| Y01 | 2 | 0.22 | 0.40 | 25 | 900 | anaerobic (+0.20 acid/C) | 18 |
| Y02 | 2 | 0.20 | 0.40 | 30 | 1000 | aerobic | 30 |
| F01 | 2 | 0.20 | 0.40 | 30 | 1200 | aerobic | 30 |
| F02 | 2 | 0.18 | 0.40 | 35 | 1400 | aerobic | 30 |
| F03 | 2 | 0.15 | 0.40 | 40 | 1400 | aerobic | 30 |
| F04 | 2 | 0.14 | 0.30 | 40 | 1800 | aerobic | 30 |
| A01 | 1.5 | 0.16 | 0.40 | 25 | 900 | photosynthesis | 30 |
| A02 | 2 | 0.16 | 0.40 | 30 | 1000 | photosynthesis + silicate | 30 |
| A03 | 1.5 | 0.10 | 0.30 | 35 | 1100 | photosynthesis (light/0.30) | 30 |
| A04 | 1.5 | 0.13 | 0.45 | 30 | 1000 | mixotroph | 30 |
| A05 | 5 | 0.36 | 0.80 | 60 | 1400 | photosynthesis (canopy) | 30 |
| P01 | 4 | 0.60 | 0.80 | 50 | 1200 | aerobic (meal) | 30 |
| P02 | 3 | 0.65 | 1.00 | 40 | 1000 | aerobic (meal) | 30 |
| P03 | 8 | 1.00 | 1.10 | 70 | 1400 | aerobic (meal) | 30 |
| P04 | 8 | 0.90 | 1.00 | 70 | 1400 | aerobic (meal) | 30 |
| P05 | 4 | 0.50 | 0.65 | 55 | 1400 | aerobic (meal) + silicate | 30 |
| P06 | 3 | 0.45 | 0.55 | 50 | 1400 | aerobic (meal) | 30 |
| P07 | 2 | 0.55 | 1.00 | 40 | 900 | aerobic (meal) | 30 |
| P08 | 10 | 0.90 | 0.70 | 90 | 2400 | aerobic (meal) | 30 |
| P09 | 8 | 0.85 | 0.85 | 75 | 1500 | aerobic (meal / detritus) | 30 |
| P10 | 12 | 1.20 | 1.40 | 100 | 1400 | aerobic (meal) | 30 |
| X01 | 0.2 | drain 0.02 C/s | 0.15 | 30 | 300 | host‑drain (50/30/20) | 30 |
| X02 | 0.2 | drain 0.015 C/s | 0.12 | 35 | 360 | host‑drain (50/30/20) | 30 |
| V01 | 0.01 C/unit | — | — | — | field decay 1 %/s | lysis | — |
| V02 | 0.01 C/unit | — | — | — | field decay 1 %/s | lysis | — |

Q = intake ceiling before suitability/availability/competition. M excludes movement, secretion,
module surcharges. Initial state: H 100, E 50, B = B0, N = 0.10·B0, age 0; A02/P05 also bound
mineral 0.10·B0.

### 1.3 Movement, sensing, habitat, attachment

| ID | Speed (cells/s) | Sense (cells) | Capture cooldown | Habitats | Attachment / notes |
|----|-----------------|---------------|------------------|----------|--------------------|
| B01 | 0.25 | 2 | — | water, gel, sediment | free |
| B02 | 0 | 0 | — | attached: gel, sediment, stone edge, bead, mesh | requires surface; film producer |
| B03 | 0.25 | 2 | — | water, gel, sediment | free |
| B04 | 0.25 | 2 | — | water, gel, sediment | free |
| B05 | 0.25 | 2 | — | water, gel, sediment | free |
| B06 | 0.25 | 2 | — | water, gel, sediment | free; producer movement scoring |
| B07 | 0.25 | 2 | — | water, gel, sediment | free; producer movement scoring |
| B08 | 0.25 | 2 | — | water, gel, sediment | free; producer movement scoring |
| B09 | 0.25 | 2 | — | water | free |
| B10 | 0.25 | 2 | — | water, gel | free |
| B11 | 0.25 | 2 | — | water, gel | free |
| B12 | 0.25 (0 resting) | 2 | — | water, gel, sediment | free |
| B13 | 0 | 0 (rule: targets within 2 cells) | — | attached: gel, sediment, mesh, stone edge | requires surface |
| Y01 | 0 | 0 | — | water, gel | free, non‑motile |
| Y02 | 0 | 0 | — | water, gel | free, non‑motile |
| F01 | 0 | 0 | — | attached: gel, sediment, bead, mesh | branching |
| F02 | 0 | 0 | — | attached: gel, sediment, mesh, bead | branching + links |
| F03 | 0 | 0 | — | attached: sediment, mesh | trap |
| F04 | 0 | 0 | — | attached: gel, sediment, mesh, bead | resting daughter |
| A01 | 0 | 0 | — | water | non‑motile |
| A02 | 0 | 0 | — | water | non‑motile |
| A03 | 0 | 0 | — | water | non‑motile |
| A04 | 0.35 | 2 | — | water | motile |
| A05 | 0 | 0 | — | water | non‑motile colony agent |
| P01 | 0.6 | 3 | 3 s | water | free |
| P02 | 2.0 | 5 | 2 s | water | free |
| P03 | 0.7 | 3 | 4 s | water | free |
| P04 | 0.8 | 4 | 3 s | sediment (+ ≤ 2 water cells) | free |
| P05 | 0.45 | 3 | 3 s | water | free |
| P06 | 0 | 1 | 3 s | attached: mesh, bead, stone edge (water) | radius‑1 capture |
| P07 | 3.0 | 5 | 2 s | water | free |
| P08 | 0.35 | 3 | 5 s | water, gel, sediment (moisture ≥ 0.2) | free; dormancy |
| P09 | 0.8 | 4 | 4 s | water | free |
| P10 | 1.2 | 6 | 6 s | water | free; handling |
| X01 | 0.4 (free) | 3 | — | water | attaches to A01 |
| X02 | 0.3 (free) | 3 | — | gel, sediment | attaches to F02/F04 |

Sprite frames: 16×16 for bacteria/yeast/algae/parasites; 32×32 for P01–P07, P09; 48×48 for P08, P10.

---

## 2. Tolerance groups

| Group | Members | pH | Warmth | Salinity | Moisture (active) |
|-------|---------|----|--------|----------|-------------------|
| Default | B01, B02, B04–B09, B13, P01–P07, P09, P10, X01 | 6–8 | 0.35–0.65 | 0–0.20 | bacteria 0.4–1; water consumers require water (1.0) |
| Dusk | B03 | 5.5–7.5 | 0.35–0.70 | 0–0.25 | 0.4–1 |
| Brine | B10 | 6–8 | 0.35–0.65 | 0.4–0.8 | 0.4–1 |
| Sour | B11 | 4.5–6.0 | 0.35–0.65 | 0–0.20 | 0.4–1 |
| Sleeper | B12 | 6–8 | 0.25–0.65 | 0–0.20 | 0.2–1 |
| Yeast/fungi | Y01, Y02, F01–F04, X02 | 4.5–7 | 0.30–0.65 | 0–0.25 | 0.4–1 (F04 0.2–1) |
| Algae | A01–A05 | 6.5–8.5 | 0.30–0.65 | 0–0.15 | water |
| Waterbear | P08 | 6–8 | 0.25–0.65 | 0–0.20 | 0.2–1 |

Shoulders: pH 1.0; warmth 0.15; salinity 0.20; moisture 0.2 (below minimum only).

---

## 3. Food web and targets

### 3.1 Diets (field feeders; order = `ordered` policy)
B01 sugar · B02 sugar, protein · B03 sugar · B04 detritus, protein, starch, oil (+film) · B05
metabolite · B06 sugar · B07 metabolite · B08 broth · B09 metabolite, sugar · B10 sugar · B11 sugar
· B12 sugar · B13 sugar, metabolite · Y01 sugar · Y02 broth · F01 detritus, starch, protein (+film)
· F02 sugar, detritus · F03 broth · F04 detritus, starch · A01/A02/A03/A05 photosynthesis (CO2 +
nutrient + light) · A04 photosynthesis (light ≥ 0.35) / sugar (light ≤ 0.25) · P09 detritus when
no meal · E08 carriers detritus when no meal.

### 3.2 Prey lists (ancestor‑ID based; "free" excludes attached)
| Predator | Prey |
|----------|------|
| P01 Amoeba | B01, B02, B03, B04, B05, B06, B07, B08, B09, B10, B11, B12, B13, Y01, Y02, A01, A02, A03, A04 |
| P02 Ciliate | B01, B03, B04, B05, free B06–B12, A01, A03, A04 (never attached B02) |
| P03 Rotifer | A01, A02, A03, A04, Y01, Y02 |
| P04 Siltworm | B01–B05; B06–B13 while in sediment |
| P05 Shellglider | B01, B03, B04, B05, B06, B07, B08, B09, B10, B11, B12 |
| P06 Bellstalk | B01, B03–B12 (not B02, not B13) within 1 cell |
| P07 Dartfin | B01, B03, B04, B05, B06, B07, B08, B09, B10, B11, B12 |
| P08 Waterbear | A01, A02, A03, A04, A05; individual F01/F02/F04 segments |
| P09 Wheelgrazer | A02, A03, A04, Y02 |
| P10 Needlejaw | P01, P02, P05, P07 (P05 requires 4 s continuous contact; others 1 s) |
Phase 1 enables only the enabled species in each list. A05 is prey only for P08.

### 3.3 Hosts, parasites, viruses, traps
| Agent | Target rule |
|-------|-------------|
| X01 Hitcher | attaches to A01 only; one per host; drain 0.02 C/s |
| X02 Threadrider | attaches to active F02/F04 segments only; never resting daughters; drain 0.015 C/s |
| V01 Pinphage | infects B01 only |
| V02 Lacephage | infects B02 only, where film ≥ 0.10 |
| F03 Traplace | traps P04 only |

### 3.4 Inhibitor and RIVAL targets
| Field | Targets |
|-------|---------|
| Bacterial inhibitor | B01–B13 |
| Fungal inhibitor | Y01, Y02, F01–F04 |
| Photosynthetic inhibitor | A01–A05 |
| RIVAL (B13 secretion / M08) | B01, B10, B11 (+0.25 × RIVAL exposure) |
Parasites, viruses and animals are unaffected by the three inhibitors. Film halves total exposure once.

### 3.5 Film digesters
B04, F01 (as detritus). Film is edible to any species flagged `digestsFilm`.

---

## 4. Structures and devices

| ID | Name | Kind | Phase | Rule |
|----|------|------|-------|------|
| STONE | Stone | cell | 2 | blocks movement and transport; edges provide attachment |
| WALL | Impermeable wall | cell | 2 | blocks everything; cannot cross rim or overlap live agent |
| BEAD | Porous bead | cell | 2 | passes solutes; blocks swimmers; provides attachment |
| S01 | Fine membrane | edge | 5 | Dissolved/Activity 25 %; Viral, organisms, deposits blocked |
| S02 | Small gate | edge | 5 | Dissolved/Activity/Viral 50 %; Small pass; Medium/Large/Fixed blocked |
| S03 | Shutter gate | edge | 5 | Open = no barrier; Closed = blocks everything |
| S04 | One‑way channel | edge (directed, water↔water) | 5 | 2 % of eligible pools/s to destination; 1 Small organism/s |
| S05 | Porous shelter | cell furnishing | 5 | passable for Small free organisms; blocks Medium/Large; solutes/viruses normal |
| S06 | Attachment mesh | cell furnishing | 5 | attachment for B02, B13, fungi, P06; no protection |
| S07 | Nutrient basket | cell furnishing | 5 | holds one finite food object; prevents partial sampling of it |
| S08 | Adsorption resin | cell device | 5 | removes selected inhibitors/RIVAL ≤ 0.05/s; capacity 5; darkens as saturated |
| S09 | Heater | cell device | 5 | +0.01 warmth/s locally; toggle |
| S10 | Cooler | cell device | 5 | −0.01 warmth/s locally; toggle |
| S11 | Shade roof | cell furnishing | 5 | shade × 0.25; stops moisture loss on its cell |
| S12 | Moisture wick | cell furnishing | 5 | adjacent gel/sediment → 0.8 moisture at 0.01/s while touching water |
| LAB01 | Dosing reservoir | cell device | 6 | §11.1 SPEC; 20 C; 0.01/0.02/0.05 C/s |
| LAB02 | Light lens | cell device | 6 | §11.2 SPEC; r 3; 0.10/0.25/0.50 |

Caps: devices 256; edge barriers 512; one furnishing/device per cell; two barriers per edge invalid.

---

## 5. Materials

### 5.1 Foundation tray (Phase 1–3)
| ID | Tray item | Adds | Dose per cell | Transport | Phase |
|----|-----------|------|---------------|-----------|-------|
| SUGAR | Sugar | sugar C | 0.02/0.10/0.50 | dissolved | 1 |
| STARCH | Starch | starch C | 0.02/0.10/0.50 | deposit | 1 |
| OIL | Oil | oil C | 0.02/0.10/0.50 | deposit | 3 |
| PROTEIN | Protein | protein C | 0.02/0.10/0.50 | deposit | 3 |
| DEBRIS | Organic debris | detritus C + 0.10 N per C | 0.02/0.10/0.50 | deposit | 1 |
| NUTRIENT | Mineral nutrients | free nutrient | 0.02/0.10/0.50 | dissolved | 1 |
| METABOLITE | Metabolite | metabolite C | 0.02/0.10/0.50 | dissolved | 3 |
| OXYGEN | Oxygen | O2 | 0.02/0.10/0.50 | dissolved | 3 |
| CO2 | Carbon dioxide | CO2 | 0.02/0.10/0.50 | dissolved | 3 |
| ACID | Acidifier | acid equivalent | 0.02/0.10/0.50 | dissolved | 3 |
| BASE | Alkalizer | base equivalent | 0.02/0.10/0.50 | dissolved | 3 |
| BUFFER | Buffer | buffer capacity | 0.02/0.10/0.50 | dissolved | 3 |
| SALT | Salt | salt | 0.02/0.10/0.50 | dissolved, no decay | 3 |
| INH_BACT | Bacterial inhibitor | inhibitor (B01–B13) | 0.02/0.10/0.50 | dissolved, −0.2 %/tick | 3 |
| INH_FUNG | Fungal inhibitor | inhibitor (Y, F) | 0.02/0.10/0.50 | dissolved, −0.2 %/tick | 3 |
| INH_PHOTO | Photosynthetic inhibitor | inhibitor (A) | 0.02/0.10/0.50 | dissolved, −0.2 %/tick | 3 |
| WATER/GEL/SEDIMENT | Habitat paint | substrate | — | — | 2 |
| SHADE | Shade paint | light × 0.1 (erase → 1.0) | — | — | 2 |
Default chemistry dose 0.10. Brush radius 1/3/6, default 3.

### 5.2 Expansion materials
| ID | Material | Dose | Effect | Phase |
|----|----------|------|--------|-------|
| M01 | Soluble broth | 0.02/0.10/0.50 C (+0.10 N/C) | dissolved food for B08, Y02, F03 | 3 |
| M02 | Silicate | 0.02/0.10/0.50 mineral | dissolved; A02/P05 bind 0.10 per new biomass | 5 |
| M03 | Starch enzyme | 0.1/0.5/1.0 activity | E_STARCH | 3 |
| M04 | Lipid enzyme | 0.1/0.5/1.0 | E_OIL | 3 |
| M05 | Protein enzyme | 0.1/0.5/1.0 | E_PROTEIN | 3 |
| M06 | Lantern signal | 0.1/0.5/1.0 | S_GLOW | 5 |
| M07 | Signal quencher | 0.1/0.5/1.0 | sensed signal / (1 + quencher) | 5 |
| M08 | Rivalry extract | 0.1/0.5/1.0 | RIVAL (targets B01/B10/B11) | 5 |
| M09 | Enzyme breaker | 0.1/0.5/1.0 | all enzyme effective activity / (1 + breaker) | 3 |
| M10 | Slow feeder pellet | one object | 10 sugar C + 1 N; 0.02 C/s (~500 s) | 3 |
| M11 | Leaf wafer | one object | 6 starch + 4 protein + 1 N; 0.012 starch + 0.008 protein C/s, 0.10 N/C | 3 |
| M12 | Shell grit | 0.1/0.5/1.0 solid mineral | dissolves to M02 at 0.01 × remaining/s | 5 |

### 5.3 Transport class permissions
| Class | Examples | Fine membrane S01 | Small gate S02 | Shutter closed | Wall/stone |
|-------|----------|-------------------|----------------|----------------|------------|
| Dissolved | sugar, broth, gases, nutrient, salt, acid/base/buffer, silicate, metabolite, inhibitors | 25 % | 50 % | 0 | 0 |
| Activity | enzymes, signal, quencher, breaker, RIVAL | 25 % | 50 % | 0 | 0 |
| Viral | V01, V02 | blocked | 50 % | 0 | 0 |
| Small mobile | free bacteria, P07, free parasites, resting F04 daughter, B02 disperser | blocked | pass | blocked | blocked |
| Medium | Y01, Y02, A01–A05, P01, P02, P03, P05, P06 (free), P09, fungal disperser | blocked | blocked | blocked | blocked |
| Large | P04, P08, P10 | blocked | blocked | blocked | blocked |
| Fixed | attached colonies, active fungi, attached P06, deposits, film, food objects | blocked | blocked | blocked | blocked |
Ordinary diffusion uses the lowest applicable factor. Porous bead: solutes pass, swimmers blocked.
Porous shelter S05: Small pass, Medium/Large blocked, solutes/viruses normal. Lamp light (LAB02)
passes S01/S02 unchanged, blocked by walls and closed shutters.

---

## 6. Loci and developmental fields

### 6.1 Quantitative loci (index order is saved)
| # | Locus | Phenotype mapping (g = locus/100) | Tradeoff | Active when |
|---|-------|-----------------------------------|----------|-------------|
| 0 | Motility investment | speed × (0.5 + g) | movement cost 0.20 × cells × (0.5 + g) | native speed > 0 (or E07) |
| 1 | Feeding investment | Q × (0.75 + 0.5g) | maintenance × (0.75 + 0.5g) | any feeder |
| 2 | Sensing investment | radius round(r × (0.5 + g)), clamp 1–6 | maintenance × (0.75 + 0.5g) | native r ∈ [1,6] and self‑propelled (or E07) |
| 3 | Division investment | min division interval × (1.5 − g) | division energy cost × (0.5 + g) | all cellular |
| 4 | Preferred pH shift | interval shifted by 2(g − 0.5) | width preserved; center clamped to keep interval within 2–12 | all cellular |
| 5 | Preferred salinity shift | shifted by 0.4(g − 0.5) | within 0–1; saltward loses freshwater suitability | all cellular |
| 6 | Preferred warmth shift | shifted by 0.4(g − 0.5) | within 0–1 | all cellular |
| 7 | Dormancy threshold | food‑shortage trigger 20 s × (1.5 − g) | earlier entry loses feeding time | native dormancy or E03 |
Founders 50 (Identical) or 45–55 (Varied/Diverse). Mutation Δ = ±2 (p 0.80) or ±5.

### 6.2 Locus activity by template (neutral registry)
Motility active: B01, B03–B12, A04, P01–P05, P07–P10, X01, X02. Inactive: B02, B13, Y01, Y02,
A01–A03, A05, F01–F04, P06. Sensing active: B01, B03–B12, A04, P01–P05, P07–P10, X01, X02.
Inactive: B02, B13, P06 (radius capture is a rule, not sensing), non‑motile others. Feeding
active: all except viruses. Division active: all cellular. Shifts active: all cellular.
Dormancy: B12, F04, P08 natively; any E03 carrier.

### 6.3 Developmental fields (Phase 7)
| Field | Values | Mutation operation |
|-------|--------|--------------------|
| strategy | ancestral, resource_follower, space_finder, shelter_keeper, night_forager (eligible B01, B04, B05, B06, B09, P02, P07), trail_follower | choose a different legal strategy uniformly |
| nightLightThreshold | 10–40 (default 25) | ±2, only while night_forager active |
| sizeLocus | 0–100 (default 50); eligible B01, B04, B05, B06, B09, B10, B11, P01, P02, P07 | ±2 (p 0.80) else ±5 |
| bodyForm | baseline, streamlined (same eligible set) | switch |
| colonyRole | generalist, forager, builder, keeper, breeder (E12 carriers) | choose a different role whose prerequisites are present |
| nativeFeatureBits | whitelist per SPEC §7.18 | toggle one uniformly |
Developmental draw: Standard 1 %, Accelerated 2 %, Fixed 0. Order of draws: quantitative →
preference → module → developmental, separate streams.

---

## 7. Supplementary modules

### 7.1 Registry
| ID | Module | Eligible ancestors | Phase | Costs beyond 0.02 E/s surcharge |
|----|--------|--------------------|-------|-------------------------------|
| E01 | Starch release | B01, B02, B04, B05, Y01, Y02 (not native B06, F02) | 2 | 0.40 E/s while emitting |
| E02 | Signal glow | B01–B08, B10–B13 (not native B09) | 5 | 0.20 E/s signal; 0.30 E/s glow |
| E03 | Resting stage | B01–B11, B13, Y01, Y02 (not native B12) | 2 | 10 E prepare; 5 E wake; rest 0.01 E/s |
| E04 | Surface anchor | B01, B03–B12, Y01, Y02 | 3 | 0.10 E/s attached |
| E05 | Reserve chamber | B01–B13, Y01, Y02, F01–F04, A01–A05, P01–P10 | 2 | 0.03 E/s upkeep; +40 cap |
| E06 | Shade collector | A01, A02, A04, A05 (not native A03) | 3 | ceiling × 0.70 |
| E07 | Light seeker | A01, A02, A03, A05 | 3 | 0.10 × (0.5 + g_mot)² E/s while moving |
| E08 | Debris feeder | P01, P02, P03, P05, P07 | 3 | none extra |
| E09 | Protein release | B04, B05, F01, F02, Y01, Y02 (not native B08) | 3 | 0.40 E/s while emitting |
| E10 | Matrix builder | B01, B04, B06, B10, B11, Y01, F02 | 3 | 2 E per C transferred |
| E11 | Mineral jacket | P01, P02, P07 | 5 | 10 E per mineral bound; speed × (1 − 0.20c) |
| E12 | Colony adhesion | B01, B04, B06, B09, B10, B11 | 3 | 2 E to link; 0.01 E/s per link |
| E13 | Settler | B01, B04, B05, B06, B09, B10, B11, P02, P07 | 7 | 5 E settle; 0.10 E/s adult upkeep |
| E14 | Dispersing offspring | B02, F01, F02 | 7 | 5 E settle; ordinary movement cost |
| E15 | Exchange junction | E12‑eligible bacteria, only with E12 present | 7 | 1 E per C sent; 10 % energy loss |
| E16 | Partner bond | B01, B05, B06, B09 + A01, A03 | 7 | 3 E bond; 0.05 E/s; 1 E per C |
| E17 | Food cache | P01, P02, P05, P07 (with E08); P09 | 7 | 2 E creation; 0.10 E per C |

### 7.2 Exclusions and prerequisites
E13 ⟂ E04, E12, E14 (mutual). E15 requires E12. E17 requires E08 except P09. No E16 during E13
stages. Native equivalents never acquired (E01/B06,F02; E02/B09; E03/B12,F04,P08; E06/A03;
E09/B08). Not available to X01, X02, V01, V02. Three slots max.

### 7.3 Colony roles (Phase 7; expressed only while E12‑linked)
| Role | Effect | Cost / prerequisite |
|------|--------|---------------------|
| Generalist | ordinary | default |
| Forager | Q × 1.15 | M × 1.20; min division interval × 1.50 |
| Builder | E10 deposition ceiling × 1.50 | requires E10; Q × 0.85 |
| Keeper | receives shared energy toward 70; donates above 90 (emergency: above 30 when a linked receiver < 20) | requires E05 + E15; Q × 0.90; M × 1.10 |
| Breeder | min division interval × 0.80 | Q × 0.85; division energy cost × 1.10 |

---

## 8. Habitats

### 8.1 Presets (Phase 1–3)
All unspecified fields zero; initial pH display 7; salinity 0; no initial life. Quantities per playable cell.

| ID | Name | Geometry | Light | Warmth | O2 | CO2 | Nutrient | Other |
|----|------|----------|-------|--------|----|-----|----------|-------|
| WATER_GARDEN | Water Garden | all water; stone disks r 9 at (42,45) and (83,82) | 0.8 | 0.5 | 0.8 | 0.5 | 0.10 | sugar 0.02 |
| GEL_COLONY | Gel Colony | gel; water channel x 59–68 (all y); no stones | 0.5 | 0.5 | 0.8 | 0.5 | 0.10 | sugar 0.10 |
| SEDIMENT_EDGE | Sediment Edge | water y < 64; sediment y ≥ 64; stone disk r 13 at (45,43) | 0.8 water / 0.15 sediment | 0.5 | 0.8 water / 0.2 sediment | 0.5 | 0.10 | detritus 0.10 in sediment |
Moisture: water 1.0; gel/sediment 0.8. Lid open. Fixed light.

### 8.2 Expansion recipes (Phase 5) — geometry replaces default stones; else Water Garden fields
| ID | Name | Geometry and conditions | Suggested community (5 each) |
|----|------|-------------------------|------------------------------|
| H04 | Leaf Pool | water; leaf wafer in basket at (45,64) and (80,64); mesh in r 8 patch at (64,64); fixed light 0.6 | B06, B08, Y02, F02, P01 |
| H05 | Brine Mosaic | all gel; water disks r 18 at (40,64) and (88,64) joined by water x 40–88, y 62–65; right disk salinity 0.6; fixed light 0.8 | B10 right; B01 left |
| H06 | Dusk Marsh | water y < 60, sediment below; closed lid; O2 0.15 in sediment, 0.8 above; detritus 0.20 and nutrient 0.10 in sediment; cycle on | B03, B04, A03, P04 |
| H07 | Glass Garden | water; mesh strips at x = 40 and x = 88 for y 35–90; silicate 0.30 everywhere; fixed light 0.8 | A02, P05, P09, B05 |
| H08 | Night Lanterns | water; closed lid; cycle on; metabolite 0.20 and nutrient 0.10 in r 14 patch at (64,64); no shade | B09, A01, B04 |
| H09 | Drying Lace | gel; water channel x 24–31; moisture 0.8; drying on; roof over r 8 patch at (88,64); fixed light 0.5 | B12, F04; wick joining one protected edge |
| H10 | Gate Lab | water; impermeable edge wall along x = 64; edges at y 61–66 replaced by six fine membranes; defaults; cycle off | B06 + starch left; B01 right |
| H11 | Grazing Meadow | water; sediment disk r 16 at (64,64); mesh on passable perimeter cells; detritus 0.10 in disk; nutrient 0.15 everywhere; cycle on | fungal patches, P08, P09, P10 in separate regions |
Suggested Community places five of each named species in valid cells of a radius‑10 patch near
its region; previewed and recorded; never silently.

---

## 9. Recipes

### 9.1 FIRST_DISH_V1 (default onboarding; Garden; R‑G0)
- Seed 104729; habitat WATER_GARDEN geometry (stones r 9 at (42,45), (83,82)); lid open;
  fixed light 0.8; warmth 0.5; moisture 1; pH 7; salinity 0; O2 0.8; CO2 0.5; nutrient 0.10;
  **background sugar 0** (override); Standard evolution; Identical founders; no cycle/drying/flow;
  starts paused at tick 0; initial ledger visible.
- Patches (per included water cell; mask = center squared distance ≤ r²):

| Center | r | Addition | Purpose |
|--------|---|----------|---------|
| (48,64) | 6 | 0.40 sugar C | immediate feeding |
| (66,64) | 5 | 0.60 starch C (no bound N) | Crumbsmith conversion; Recycler use |
| (66,48) | 4 | 0.25 detritus C + 0.025 bound N | Recycler niche |
- Founders (distinct cells; nearest by distance, then y, then x; IDs in this order; loci 50;
  no modules): 24 B01 within r 3 of (48,64); 12 B06 within r 2 of (66,64); 8 B04 within r 2 of
  (66,48); 12 A01 within r 4 of (48,48). **No P01** (the guide invites adding two later).
- Tuning targets (not forced): observable intake ≤ 15 s and first division ≤ 120 s on ≥ 5 of 6 dev seeds.

### 9.2 RESERVE_COMPARE_V1 ("Seeded traits demonstration"; Experiment C)
Clear water, no stones, §9.1 environment (sugar 0), lid open, **Fixed Traits**, seed 104729.
24 neutral B01 in distinct cells nearest (64,64) within r 3; alternating founder IDs: odd → E05,
even → none (all E = 50; E05 raises cap only). Sugar 0.50 C per water cell within r 6 of (64,64).
Duplicate. Pulse arm: no additions. Stable arm: +0.50 sugar per patch cell at 60, 120, 180, 240,
300 s (scheduled commands, shown before start). Run 600 s. Record energy distributions, food
consumed, births, deaths by cause, live descendants per founder group, extinction times.

### 9.3 Curated dishes (D04 §8) — Water Garden defaults elsewhere; open water; fixed light 0.8
| ID | Name | Setup | Question | Phase |
|----|------|-------|----------|-------|
| L301 | Two Lunches | two r 8 patches at (40,64) and (88,64), each 30 B01, sugar 0.5, nutrient 0.2; Varied Traits | Do separate neighborhoods stay different? | 3 |
| L302 | Under the Canopy | r 10 at (64,64): 20 A05, 30 A01; nutrient 0.2; Diverse Founders | Who persists in the shade they create? | 5 |
| L303 | Public Kitchen | r 8 at (64,64): 20 Y02, 20 B08, protein 0.5 C with 0.05 bound N, free nutrient 0.1; Diverse Founders | Who benefits from accessible food? | 3 |
| L304 | Empty After the Feast | r 10 at (64,64): 60 B01, sugar 0.8, nutrient 0.2; Diverse Founders; no replenishment | What happens when success consumes its opportunity? | 3 |
| L305 | The Jacket Garden | r 12 at (64,64): 100 B01, 12 P07, 2 P10; sugar 0.8, nutrient 0.2, silicate 0.3; 6 P07 seeded with E11, 6 without; jackets empty | Is delayed capture worth the cost? | 5 |
| L306 | Borrowed Shelter | r 8 gel patch at (64,64): 40 B06, sugar 0.6, nutrient 0.2; E10 seeded on 20, none on 20 | Who pays for the film, who benefits? | 3 |
Seed = recipe number (301…306). Pre‑seeded genomes labelled "present at creation".

### 9.4 What if? variants (D09 §5)
| ID | Invitation | Source and patch | Question | Phase |
|----|------------|------------------|----------|-------|
| R‑G0 | Garden | FIRST_DISH_V1 unchanged | Who finds something to eat? | 2 |
| R‑G1 | A smaller meal | sugar patch (48,64) r 6: 0.40 → 0.20 C/cell | What changes with less food? | 2 |
| R‑G2 | A bigger meal | same patch: 0.40 → 0.80 C/cell | Does more food help every family? | 2 |
| R‑G3 | Dinner farther away | move the sugar patch to (48,82) r 6 at 0.40; old patch cleared to background (0); equal cell counts validated | Who reaches the food now? | 2 |
| R‑L1 | Slow snack | LABR01 steady arm; feeder starts On; Fixed mutation | What happens when food arrives slowly? | 6 |
| R‑L2 | Light in the dark | LABR02 lamp‑On arm; Fixed mutation | Where does light help life grow? | 6 |

### 9.5 Living Lab recipes (Phase 6; clear water, no stones, §9.1 baseline, sugar 0, lid open, seed 104729, Fixed Traits, paused)
| ID | Setup | Run | Success |
|----|-------|-----|---------|
| LABR01 A pulse or a steady meal | 12 B01 nearest (64,64) r 2; reservoir at (64,64) with 6 sugar C + 0.6 N, rate 0.02/s; duplicate; steady arm: On; pulse arm: setup‑only command releases all 6 C into the cell at tick 0 | 300 s | comparison completed; all 6 C accounted in each arm |
| LABR02 A refuge in the dark | habitat light baseline 0.05; 12 A01 within r 2 of (64,64); lamp at center 0.50; duplicate; lamp On only in intervention | 300 s | measured light and intake differences inspected, or zero intake documented |
| LABR03 Stop when oxygen falls | LABR01 steady arm; O2 0.25; closed lid; circular probe r 3 at (64,64); Low‑oxygen rule: enter ≤ 0.30, reset ≥ 0.45, hold 5 s, cooldown 30 s, action Off, Arm now | 60 s | queued Off action inspected; stock released before it took effect accounted |

### 9.6 Playgrounds (D08 §8)
Little Living Garden = FIRST_DISH_V1 (Phase 1); Slow Snack = LABR01 steady arm (Phase 6);
A Light in the Dark = LABR02 lamp arm (Phase 6). Unsupported playgrounds are hidden, never locked.

---

## 10. Experiments

### 10.1 Foundation experiments (D01 §15; radius‑6 patches; seeds 101–106)
| Seed | Experiment | Setup | Completion evidence | Phase |
|------|------------|-------|---------------------|-------|
| 101 | Food trail | Water Garden; 30 B01 at (36,64); trail x 36–80, y 61–67: +0.50 sugar, +0.20 nutrient per cell | followed group biomass +25 %; inspector identifies food use | 2 |
| 102 | Light and life | two Water Garden branches; 30 A01 at (50,70); +0.20 nutrient in patch; B shaded to 0.1 | compare 180 s; view different photosynthetic totals | 2 |
| 103 | Cleaning crew | 10 B04 at (50,70); 10 detritus C with 1 bound N across patch | ≥ 2 detritus C consumed; resource history opened | 2 |
| 104 | A hidden neighborhood | closed Water Garden; 20 B01 + 20 B03 at (50,70); sugar 0.50, nutrient 0.20 per cell; O2 overlay | both species inspected with different O2 limitations | 3 |
| 105 | One compatible host | 30 B01 at (35,64) with sugar 0.50; 30 B05 at (90,64) with metabolite 0.50; nutrient 0.20; V01 5 units per patch cell | B01 infection observed; zero B05 infections | 3 |
| 106 | Predator balance | 100 B01 at (50,70), sugar 0.50, nutrient 0.20; duplicate; +5 P01 in B | compare 180 s; read consumption and prey history | 2 |

### 10.2 Production‑plan experiments (D06 §8)
| ID | Experiment | Setup | Run | Report |
|----|------------|-------|-----|--------|
| EXP_A | What unlocks starch | clear water, §9.1 environment, no stones, sugar 0; 12 B06 at (64,64) r 3; starch 0.60/cell + 0.10 sugar bootstrap/cell in that patch; Fixed Traits; seed 104729; duplicate with starch omitted | 180 s | enzyme‑derived sugar vs bootstrap, starch remaining, consumed, births, survival |
| EXP_B | What changes when a grazer arrives | FIRST_DISH_V1 snapshot at tick 1200 (scheduled); duplicate; B: +2 P01 at nearest valid cells to (48,64) | +180 s | prey deaths by cause, births, prey biomass, sugar remaining |
| EXP_C | Why variation can matter | RESERVE_COMPARE_V1 | 600 s | per §9.2; labelled seeded variation |

### 10.3 Expansion experiments (D02 §21–22; seed = numeric ID; Water Garden without stones; fixed light 0.8; open lid; radius‑6 patches)
| ID | Experiment | Setup | Gate | Phase |
|----|------------|-------|------|-------|
| E201 | Shared lunch | (45,64): 20 B06, 20 B01, starch 0.50, nutrient 0.20 | conversion ≥ 1 C; B01 sugar consumption ≥ 0.5 | 3 |
| E202 | Oil neighborhood | (64,64): 20 B07, 20 B05, oil 0.50, nutrient 0.20 | converted oil ≥ 1 C; metabolite intake by both | 3 |
| E203 | Protein chain | (64,64): 20 B08, 10 Y02, protein 0.50 with N 0.05 | broth production and Y02 intake; compare branch without B08 | 3 |
| E204 | Broken catalyst | duplicate E201; B gets M09 = 4/cell | compare 120 s converted starch | 3 |
| E205 | Glow threshold | 30 B09 in r 3 at (64,64), sugar 1, nutrient 0.20; light 0.05 | ≥ 1 glow‑on event inspected | 5 |
| E206 | Quiet neighbors | duplicate glowing E205; quencher 4/cell in B | 30 s; sensed signal and glow‑off inspected | 5 |
| E207 | Brine crossing | H05; 20 B01 left, 20 B10 right; sugar 0.50, nutrient 0.20 per pool cell; shutter in channel | salt transport and suitability observed | 5 |
| E208 | Glass budget | 30 A02 at (64,64), nutrient 0.20, silicate 0; duplicate; B silicate 0.50 | compare 180 s mineral limitation | 5 |
| E209 | Gate meal | H10; 30 B06 + starch 0.50 at (55,64); 20 B01 at (72,64); nutrient 0.20 both | sugar crosses membrane; no organisms cross | 5 |
| E210 | Sleeping shortage | gel disk r 15 at (64,64), moisture 0.8; 20 B12; no sugar; at 60 s add sugar 0.50 + nutrient 0.20 | resting transition then ≥ 1 wake | 5 |
| E211 | Sheltered lace | H09; 10 F04 protected + 10 at (64,64); detritus 0.50, nutrient 0.20 both | 600 s; compare moisture and states | 5 |
| E212 | Fungal supply line | gel; four linked F02 at (60–63,64): first B = 4, others B = 2; matching N; E = 50; no food | exact donor/receiver ledger over 10 s | 3 |
| E213 | A temporary trap | sediment r 15 at (64,64); F03 at center B 2.8, N 0.28, E 80; one P04 at center | 12 s: reserve cost, hold, drain, release | 5 |
| E214 | Shell handling | P10 and P05 at (64,64); speeds 0 via labelled test override | no capture < 4 s; then exactly one meal | 5 |
| E215 | Fungal hitchhiker | gel patch: 10 F02, sugar 0.50, nutrient 0.20; 5 X02 at host positions | attachment and drain; hostless branch: zero parasite reproduction | 5 |
| E216 | A different host | mesh at (64,64); 20 B02, 20 B01; film 0.20/cell; V02 5 units/cell in r 6; sugar/nutrient | B02 infection; zero B01 infection by V02 | 5 |
| E217 | Rival without a winner | gel patch: 20 B13, 20 B01, 20 B04; sugar 0.50, detritus 0.50, nutrient 0.20; compare copy without B13 | 180 s; exposure and cost inspected | 5 |
| E218 | Night shift | 20 A04 + 20 A01 at (64,64); sugar 0.50, nutrient 0.20; cycle on | one 240 s cycle; mode changes; intake totals | 5 |

### 10.4 Living‑behavior fixtures (D05 §16; seed = ID; no stones; open lid; light 0.8) — Phase 7
| ID | Setup | Required observation |
|----|-------|----------------------|
| D501 Night behavior | one B01 at (64,64), night_forager; sugar 0.5, nutrient 0.2 in r 5; light 0.10 at 10 s, 0.80 at 25 s | activity changes only after 5 s dwell; E = 10 start shows emergency activity (labelled override) |
| D502 Settlement | B01 with E13 at (64,64); stone at (65,64); sugar 0.5, nutrient 0.2 r 5 | ≥ 10 juvenile s before settling; costs paid; no division before adult; support removal → Juvenile |
| D503 Dispersing daughter | gel r 12 at (64,64); F02 with E14, B 4, N 0.4, E 80, H 100, age 40; sugar 0.5, nutrient 0.2 | one full‑budget disperser; no remote link while travelling |
| D504 Pending body change | fixed proposal fixture: oversized daughter, blocked placements | no cost/birth while blocked; unblock → same proposal commits; reload does not reroll |
| D505 Qualified sharing | two linked B01 (E12 + E15), B 1 each, E 80 and 10; transfer‑only one tick | dt 0.10: donor sends 0.05 E, receiver gets 0.045, 0.005 dissipates; without E15 zero |
| D506 Finite inheritance | cache at (64,64) with 1 C + 0.10 N; no organisms; transfer‑only 10 s | cache 0.80 C + 0.08 N; detritus 0.20 C + 0.02 N |

### 10.5 Goals (D09 §6; Phase 4)
| Goal | Objective | Completion |
|------|-----------|------------|
| See a Sprinter split | observe committed B01 birth | first matching birth after Start; blocked/cancelled proposals never count |
| Keep Sprinters going | keep B01 alive | count > 0 for 180 s; zero ends the attempt, world stays usable |
| Watch starch become food | observe starch→sugar conversion event | positive actual conversion, not enzyme presence |

### 10.6 Optional play prompts (D02 §23; Phase 5)
Two neighborhoods (B01 and B10 > 5 individuals for 180 s in two regions) · Night garden (glow +
photosynthesis event in one cycle) · Food relay (starch → sugar → biomass → detritus → decomposer
intake, each arrow a record) · A living bridge (0.5 C through F02 links, no breaks/insertions) ·
Leave a refuge (one grazer + compatible prey for 180 s) · Recover a neighborhood (< 5 to ≥ 20
active in a region with ≤ 3 gestures). D01 prompts: sustain three species; grow a branching
colony around a barrier; rescue a stressed dish.

---

## 11. Development seeds and tuning protocol
Seeds: **104729, 130363, 155921, 196613, 262147, 314159**. Protocol per recipe: 600 s (extend to
1,200 s if no inherited difference by 600 s, keeping the 600 s checkpoint); Standard mode; no
interventions; at G2 repeat in Accelerated. Record effective speed, births, deaths by cause,
biomass, food remaining, mutation counts, module attempts/gains, branch confirmations, first
intake and first division (median, range, censored count), endpoint hash. Never drop an extinct
dish; never treat "no event by T" as an event at T. Tune one recipe parameter at a time under a
new recipe revision. Only propose a mechanics change after recording why recipe/presentation
changes cannot meet the goal.

---

## 12. Constants

### 12.1 Time and world
dt 0.10 s · ticks/s 10 · grid 128×128 · mask center (63.5, 63.5) r 60 · logical art canvas 512×512
(4 px/cell at zoom 1) · four authored headings.

### 12.2 Transport and environment
Diffusion/tick: water 0.10, gel 0.025, sediment 0.01; boundary = lower; enzymes/RIVAL half; V02
half of V01 · film halves transport and inhibitor exposure · gas exchange 0.02 × difference/tick
toward O2 0.8, CO2 0.5; sediment × 0.1; closed lid 0 · inhibitor decay 0.2 %/tick · viral decay
1 %/s · enzyme decay 2 %/s · breaker 1 %/s · signal 1 %/s · quencher 1 %/s · RIVAL 2 %/s · pH =
clamp(7 + (base − acid)/(1 + buffer), 2, 12) · shade paint 0.1 · roof 0.25 · cycle 240 s (90/30/
90/30), night 0.05 · canopy 1/(1 + ΣA05 B/10) · warmth relax 1 %/tick to 0.50, diffuse 0.05,
device ±0.01/s · moisture: water 1, gel/sediment 0.8, drying −0.001/s to 0.1, wetting 0.9, wick
→ 0.8 at 0.01/s · channel 2 %/s pools, 1 Small/s · resin 0.05/s, cap 5 · grit → silicate 0.01 ×
remaining/s.

### 12.3 Metabolism
Intake request = Q × suitability × avail(a) × dt, avail(a) = a/(a + 0.10) · aerobic: 0.50 B,
0.30 CO2, 0.20 metabolite, −0.30 O2, +30 E, N 0.05/C · anaerobic: same split, no O2, +18 E ·
photosynthesis: 0.50 B, 0.50 sugar, +0.50 O2, N 0.05/C, +30 E, × light response · host drain:
50/30/20, +30 E/C · Y01 acid 0.20/C · B11 acid 0.40/C · shell/jacket silicate 0.10 per new
biomass · energy cap 100 (× s; +40 E05) · movement 0.20 E/cell × (0.5 + g) · E = 0 → −4 H/s ·
suit < 0.10 → −2 H/s · inhibitor −8 × exposure H/s · heal +1 H/s if E > 20, suit > 0.5,
uninfected, Active · stress display after 3 s below threshold, clears after 3 s · death H ≤ 0 or
age ≥ max.

### 12.4 Reproduction and crowding
Divide at B ≥ 2 B0', E ≥ 60·s, H ≥ 50, age ≥ min interval; cost 20 × (0.5 + g_div) × s × form ×
role; equal split of B, N, meal, energy, shell; ages reset; new birthIds · soft cell capacity 8
biomass‑equivalents → block births, halve intake · contact 0.5 cells (0.25 (s₁+s₂)) · decision
interval 0.5 s · wander hold 1 s · candidate weights 0.5F + 0.4S − 0.1C.

### 12.5 Predation, parasites, viruses, traps
Attack: contact, cooldown ready, E < 80, meal < 0.5 B0', valid prey · meal cap 2 B0' · handling P10
1 s; P05 4 s; jacket 1 + 3c · P06 radius 1 · X01 0.02 C/s; X02 0.015 C/s; host dies < 0.25 B0' ·
infection p = 1 − exp(−0.05 × units × dt); consumes 1 unit (0.01 C); lysis 20 s; 40 % → units; V02
needs film ≥ 0.10 · trap: E ≥ 50, B ≥ 1.3 B0', 0.20 C + 8 E; hold 8 s; drain 0.03 C/s; cooldown 30 s.

### 12.6 Structures and secretion
Film: attach 10 s with E > 40; 0.05 B/s; cap 0.50 C/cell; stop at B = B0'; decay 0.1 %/s · E10:
E > 35, B > 1.2 B0', film < 0.50; min(0.02·dt, B − 1.2 B0', 0.50 − film); 2 E/C · enzymes: emit
0.02/s while E > 35, 0.40 E/s, cap 1.0; conversion min(substrate, 0.10 × eff × dt) · signal: 0.02/s,
0.20 E/s, E > 35, cap 1.0; glow on ≥ 0.30 for 5 s, off ≤ 0.15 for 5 s or E < 15, 0.30 E/s ·
RIVAL: 0.02/s, 0.60 E/s, E > 50, targets within 2 cells, local < 1.0; +0.25 × RIVAL exposure ·
F02 transport: donor B > B0', receiver B < 1.5 B0' and ≥ 0.01 B0' lower; edge min(0.02·dt, ½
diff); degree ≤ 4 · E04 anchor: attach 5 s (E > 35), 0.10 E/s, detach 10 s no intake / E < 15 /
support lost, 10 s lockout · E12: 0.5 cells for 5 s, E ≥ 20, 2 E, ≤ 2 links, ≤ 8 members, 0.01 E/s
per link, sever 10 s no intake / E < 15, 0.75 cells, 10 s lockout · E16: 5 s, E ≥ 20, 3 E, 0.05
E/s, transfer 0.005 × B0 × dt above/below 1.20 B0', break < 15 E for 10 s, 0.75 cells · E15:
carbon 0.01 × B0 × dt above/below 1.25 B0', 1 E/C; energy 0.5 × dt above 70 / below 40, 90 %
delivery · E13: juvenile ≥ 10 s, E ≥ 35, B ≥ 0.80 B0'; settle 5 s, 5 E; adult 0.10 E/s; retry
lockout 10 s · E14: 0.15 cells/s; 10 s ancestral then seek support with food ≥ 0.10; settle 5 s,
E ≥ 10, 5 E; stranded at 40 s · E17: E > 40, meal > 1.50 B0', deposit ≤ 0.02 × B0' × dt leaving
≥ 1.00 B0', 2 E creation, 0.10 E/C, cap 4 C, release 0.02 C/s · strategies 0.02 E/s; night
thresholds t and t + 0.10 with 5 s dwell; emergency E < 20 → until E > 35.

### 12.7 Dormancy
Trigger: no intake 20 s × (1.5 − g) or moisture suit < 0.20 for 10 s; E ≥ 15 · Preparing 5 s, 10 E
· Resting 0.01 E/s, damage × 0.10 · wake: suitable + food 10 s and E ≥ 5 · Waking 5 s, 5 E · lockout
30 s.

### 12.8 Evolution
Rates Standard 8/2/0.2/1 %, Accelerated 16/4/1/2 %, Fixed 0 · Δ ±2 (0.80) else ±5 · preference
transfer 0.05; establish weighted 2/(n+1), 1/(n+1) · new food weight 0.10 (others × 0.90) ·
branch: ≥ 0.10 one locus, ≥ 0.03 mean, module set, policy / ≥ 0.15 weight; ≥ 5 descendants, ≥ 3
generations · Varied init 45–55 · Diverse 10 % of eligible founders one module · size s = 0.75 +
0.005 × locus.

### 12.9 Equipment
Reservoir 20 C; rates 0.01/0.02/0.05; sugar N 0–0.10 (default 0.10) · lamp r 3, intensity × (1 −
d/4), 0.10/0.25/0.50 · controllers ≤ 8; hold 1/5/10 s (5); cooldown 10/30/60 s (30); sample 1 Hz.

### 12.10 UI, history, storage
Autosave 30 s · undo 1 level · checkpoint ring 10 × 60 s · events 500 detailed; coalesce 5 s ·
history 1 s samples for 30 min, 1 min summaries to 6 h · birth details 10,000 recent unpinned ·
descendants highlighted ≤ 200 · favorites 3 · bookmarks 50 text / 20 snapshot · gallery 100 ·
notifications ≤ 1 per 60 s · sound cues ≤ 4/s · comparison horizons 60/180/600 s · turn horizons
60/180/600 s · name fields ≤ 60 chars · import ≤ 25 MB · picture 1080×1080.

---

## 13. Field registry
| Field | Kind | Diffusion | Decay | Companion N | Phase |
|-------|------|-----------|-------|-------------|-------|
| sugar | dissolved C | normal | — | yes | 1 |
| starch | deposit C | none | — | yes | 1 |
| oil | deposit C | none | — | yes | 3 |
| protein | deposit C | none | — | yes | 3 |
| broth | dissolved C | normal | — | yes | 3 |
| detritus | deposit C | none | — | yes | 1 |
| metabolite | dissolved C | normal | — | no | 1 (produced) |
| film | deposit C (per cell) | none | 0.1 %/s → detritus | yes | 3 |
| nutrient (free) | dissolved | normal | — | — | 1 |
| oxygen | dissolved gas | normal + exchange | — | — | 1 |
| CO2 | dissolved gas | normal + exchange | — | — | 1 |
| acid, base, buffer | dissolved | normal | neutralization | — | 3 |
| salt | dissolved | normal | none | — | 3 |
| inhibitor ×3 | dissolved | normal | 0.2 %/tick | — | 3 |
| silicate | dissolved mineral | normal | — | — | 5 |
| grit | deposit mineral | none | → silicate 1 %/s | — | 5 |
| V01, V02 | viral units | normal / half | 1 %/s → detritus C | — | 3 / 5 |
| E_STARCH, E_OIL, E_PROTEIN | activity | half | 2 %/s | — | 1 / 3 / 3 |
| breaker | activity | normal | 1 %/s | — | 3 |
| S_GLOW | activity | normal | 1 %/s | — | 5 |
| quencher | activity | normal | 1 %/s | — | 5 |
| RIVAL | activity | half | 2 %/s | — | 5 |
| localWarmth | index | 0.05 | relax 1 %/tick | — | 5 |
| moisture | index | — | drying | — | 5 |
| shadeMask, roofShade, canopy, lamp | derived light factors | — | — | — | 2 / 5 / 5 / 6 |

---

## 14. Limits
Agents 6,000 (fungal ≤ 2,000) · devices 256 · finite food objects 128 (caches included) · edge
barriers 512 · regions 6 · controllers 8 · favorites 3 · slots 10 + autosave + predecessor ·
import 25 MB · fixtures: none may exceed these.
