# Pixelmeba — Build Directive

Version 1.0 · 2026‑09‑27 · Lead design authority for the implementing agent

This is the ordered plan. Every task has an ID that appears in `WORKLOG.md`. Every phase ends in
a gate with named evidence. The rules referenced here live in `PIXELMEBA_IMPLEMENTATION_SPEC.md`
(cited as **SPEC §n**), `CONTENT_TABLES.md` (**CT §n**), `ARCHITECTURE.md` (**ARCH §n**) and
`UX_SPEC.md` (**UX §n**). Do not begin a task until its predecessors are ticked.

---

## 0. Orientation

### 0.1 What we are shipping, in one paragraph

A round pixel dish on a dark field. The player adds life and food, watches it feed, divide,
compete and die, inspects *why*, and forks the dish to test one change. Descendants inherit
traits and occasionally vary; the environment filters them. Everything is deterministic,
ledgered and explainable. Two faces on one world: **Explore** (three big actions, plain words)
and **Lab** (precision tools, numbers, charts). Saves are local files. Share = picture, recipe,
or living dish. Android is the store product; the web build lives in the Lucid Winds Arcade.

### 0.2 Release plan

| Tag | Content | Phases |
|-----|---------|--------|
| `g0` … `g3` | Internal gates | 0–3 |
| **`v1.0.0-rc1`** | **Store‑ready release candidate**: 19 organisms (the 14 foundation organisms + wave E1's 5 living‑chemistry organisms), 3 habitats + 4 curated dishes, quantitative evolution + modules E01, E03–E10 and E12 (E02 and E11 arrive with their partner systems in v1.1), Explore/Lab, inspector, comparison, ~12 experiments, What if? variants, goals, favorites, story cards, share, Android package | 4 |
| `v1.1.0` | Expanded ecology: remaining 19 organisms, climate, gates/structures, 8 habitat recipes, E11, 14 more experiments | 5 |
| `v1.2.0` | Living Lab equipment, controllers, research records, two equipment playgrounds | 6 |
| `v1.3.0` | Advanced living worlds: strategies, life stages, body size, colonies, partners, caches | 7 |

**Ship rule.** After tagging `v1.0.0-rc1`, write the complete `EXPANSION_RESPONSE.md`, then
**continue immediately into Phase 5** on `main`. The RC tag is the owner's stable checkout for
Play Store submission. Everything after it is additive and flag‑gated: the build must remain
shippable at every commit.

### 0.3 The five design principles that decide ties

1. **Truthful.** Cues follow committed events; explanations follow reason codes.
2. **Deterministic and conserved.** If a feature threatens either, the feature changes.
3. **Understandable before deep.** Explore first; depth is one tap away, never in the way.
4. **Emergent, not scripted.** The rules create the surprises; the interface makes them legible.
5. **Small world first.** Five organisms working beautifully beat thirty‑eight half‑working.

### 0.4 Working rhythm

- One task ⇒ one or more commits ⇒ tick in `WORKLOG.md`. Keep `npm run check` green.
- Every time you touch a rule: update the fixture that pins it; bump `contentVersion` or the
  relevant rules version in `content/manifest.json`; record it in `DECISIONS.md`.
- Every gate: run `npm run check && npm run test:e2e && npm run content:validate && npm run
  sim:tune`, paste results into `EXPANSION_RESPONSE.md`, tag.
- When something is genuinely blocked by the environment (no Android SDK, no device), do every
  part that is not blocked, document the exact blocker and the owner's command to unblock, and
  move on. Never fabricate a measurement.

---

## Phase 0 — Foundation (gate `g0`)

Goal: a headless, deterministic, ledgered simulation core with validated content and a CLI
runner. No rendering yet.

### P0.1 Repository and toolchain
Build:
- `npm init`; TypeScript (strict, `noUncheckedIndexedAccess`, ES2022, bundler resolution).
- Vite (current stable), Preact + `@preact/signals`, PixiJS 8.x, Zod, Vitest, Playwright,
  ESLint (typescript‑eslint, no floating promises), Prettier. Pin exact versions; commit
  `package-lock.json`. Record Node version in `.nvmrc` and `engines`.
- Scripts from `CLAUDE.md` §Commands (stubs that fail loudly until implemented).
- `tsconfig` paths: `@sim/*`, `@ui/*`, `@render/*`, `@persist/*`, `@content/*`.
- Vite config: `base: './'`, worker bundling, `build.target: 'es2022'`.
- Commit the docs baseline (`docs/`, `CLAUDE.md`, `.gitignore`, `README.md`) as the first commit.
Refs: ARCH §1–2.
Done when: `npm run check` passes on an empty project; `git log` shows the baseline commit.

### P0.2 Content schema and first packs
Build:
- Zod schemas for every content kind (ARCH §4, SPEC §2, CT §1–§12): species, material, habitat,
  structure, module, locus mapping, recipe, experiment, variant, objective, manifest.
- `content/manifest.json` with `simulationVersion: 3`, `evolutionRulesVersion`,
  `moduleRegistryVersion`, `phenotypeMappingVersion`, `contentVersion`, `enabledSpecies`,
  `enabledModules`, `enabledSystems` flags, and a computed `contentHash` (SHA‑256 of canonical
  JSON of all packs).
- Packs: species B01, B04, B06, A01, P01 (CT §1–§3); materials sugar, starch, detritus,
  mineral nutrient (CT §5); habitat WATER_GARDEN (CT §8); recipe FIRST_DISH_V1 (CT §9); loci
  mapping (CT §6); empty module registry (Phase 2 fills it).
- `tools/content-validate.ts`: unknown IDs, missing dependencies (prey/host/food/module),
  non‑finite values, negative pools, duplicate IDs, required assets (warn until art exists).
  Prints exact record and field. Exit code ≠ 0 on failure.
Done when: `npm run content:validate` passes; a deliberately broken fixture pack fails with the
right record/field named (`tests/content/validator.test.ts`).

### P0.3 Determinism primitives
Build (ARCH §6, SPEC §15):
- `det(worldSeed, streamId, ...keys) → uint32` and `detFloat(...) → [0,1)` via a strong 32‑bit
  mixer; `detPick`, `detGaussianless` helpers. Stateless; no saved RNG state.
- Canonical serialization of authoritative state (fixed field order, Float64 hex or base64).
- `stateHash(world) → hex` (FNV‑1a 64 or xxhash over canonical bytes). SHA‑256 (Web Crypto,
  with a pure‑JS fallback for Node tests) for export checksums.
Done when: `tests/sim/rng.test.ts` shows identical outputs across runs and Node/worker; hash
of a fixed world is stable across serialize→deserialize.

### P0.4 World, fields and transport (stage 2)
Build (SPEC §2, §4; CT §8, §13):
- 128×128 grid, circular mask (center 63.5,63.5, r 60), substrate per cell (water/gel/sediment/
  stone/wall), passability, attachment capacity, shade mask.
- Field registry: every scalar field in CT §13 as `Float64Array(16384)`, allocated only when its
  system is enabled; companion nutrient fields for carbon foods; double buffers for transport.
- Conservative 4‑neighbor diffusion with per‑habitat coefficients, boundary rule (lower
  coefficient), no flux through stone/wall, film halving hook, outbound flux scaling so a cell
  never exports more than it has.
- Open/closed lid gas exchange; inhibitor/viral/enzyme/signal decay hooks; acid/base
  neutralization; derived pH, salinity index, effective light (baseline × shade for now).
- Ledger (SPEC §3.4): compartments, external input/export, exchange, tolerance check, roundoff log.
Done when: `tests/sim/transport.test.ts`: a pulse spreads without creating quantity; walls block;
gas exchange logged; pH formula matches.

### P0.5 Entities, suitability, movement (stage 4), spatial index
Build (SPEC §6.1–6.4; ARCH §5):
- Struct‑of‑arrays entity store, capacity 6,000, free list, stable `entityId` and `birthId`.
- Genome table (deduplicated, profile cache) with neutral founders (CT §6).
- Phenotype pipeline `deriveProfile(template, genome, lifeState)` applying factors in the
  documented order (SPEC §6.2). Used by sim, inspector and previews.
- Suitability (pH/warmth/salinity/habitat/inhibitor/moisture hook/oxygen special).
- Movement solver: candidate scoring 0.5F + 0.4S − 0.1C, deterministic ties, seeded wander held
  1 s, wall tracing, soft cell capacity (Σ B/B0 ≤ 8) effects (block births, halve intake).
- Spatial index rebuilt after movement; iteration always by ascending entity index.
Done when: `tests/sim/movement.test.ts`: no tunneling; deterministic ties; capacity halves intake.

### P0.6 Intake, maintenance, death, births (stages 6, 7, 9)
Build (SPEC §6.5–6.9, §8.3):
- Stage 6 shared allocation exactly as SPEC §6.5 (ordered/weighted request, proportional pool
  allocation, then O2/nutrient/silicate limiting fraction, commit once, return unused).
- Conversions (aerobic, anaerobic, photosynthesis, detritus/meal with bound nutrient), energy
  gain and cap, acid emission hooks.
- Stage 7 maintenance (M, movement 0.20 × cells × motility factor), damage/heal rules, aging.
- Death and recycling exactly once; corpses → detritus C and bound N in the cell.
- Stage 9 births with **immutable birth proposals** (D5 A01): proposal keyed by (parent birthId,
  division ordinal), daughter genomes drawn once (mutation itself wired in P1.2 but the draw
  slots exist), placement search, commit costs and split only when both daughters fit; retained
  proposal survives blocked ticks and save/reload; parent death discards it.
Done when: `tests/sim/feeding.test.ts` (finite, fair, no free growth), `tests/sim/births.test.ts`
(blocked proposal identical across ticks; commit once).

### P0.7 Tick loop, commands (stage 1), publish (stage 10)
Build (SPEC §3; ARCH §7):
- `World.step()` runs the ten stages in order; each stage resolves fully; double‑buffer swaps.
- Command queue: `{commandId, worldId, targetTick, seq, kind, payload}`; applied at stage 1 in
  (targetTick, seq) order; accepted/rejected amounts recorded; inoculate and deposit commands
  implemented (others in later phases). Paused edit transactions (commands at current tick
  without advancing biology).
- Stage 10: per‑second history sampling, event records with reason codes, ledger snapshot,
  capacity flags, state hash on demand.
Done when: `tests/sim/tick.test.ts`: stage order observable; a command at tick T affects state
at T not T−1; paused transaction leaves tick unchanged.

### P0.8 Headless runner and save skeleton
Build (ARCH §15, §11):
- `tools/sim-run.ts`: `--recipe ID --seed N --ticks T [--commands file] [--hash-every K]` →
  JSON summary (populations, ledger totals, events by type, endpoint hash) to stdout/file.
- Serialize/deserialize whole world (schema v1) with checksum; round‑trip equality by hash.
Done when: `npm run sim:run -- --recipe FIRST_DISH_V1 --seed 104729 --ticks 6000` completes; a
mid‑run save/reload reproduces the uninterrupted endpoint hash.

### G0 gate — evidence
| Fixture | File | Pass |
|---|---|---|
| Neutral founders | `tests/fixtures/neutral-founders.test.ts` | loci at 50 reproduce CT §1 profiles exactly; inactive loci create no movement/sensing |
| Conservation | `tests/fixtures/conservation-closed-lid.test.ts` | closed lid, no input, 10,000 ticks, all five species present: C and N relative error < 0.001 %; roundoff logged |
| Determinism | `tests/fixtures/determinism.test.ts` | identical hashes for two fresh runs; save at tick 3000 → reload → tick 6000 equals uninterrupted |
| No free growth | `tests/fixtures/no-free-growth.test.ts` | zero food/CO2 or zero nutrient ⇒ no new biomass; energy/health decline as specified |
| Fair shared food | `tests/fixtures/fair-shared-food.test.ts` | identical agents in one cell receive equal allocations; insertion order irrelevant |
| Content validation | `tests/content/validator.test.ts` | broken packs fail with record/field |

Tag `g0`. Fill `EXPANSION_RESPONSE.md` §1, §4.

---

## Phase 1 — First Playable (gate `g1`)

Goal: the Garden is playable, pretty and explainable in the browser. Explore view only.
Quantitative evolution on. Save/load/duplicate/undo. Android spike.

### P1.1 Five organisms complete
Build (SPEC §6, §7.1, §5.3; CT §1–§4):
- B01 Sprinter (sugar, prey, phage host flag), B04 Recycler (detritus/protein/starch/oil, film
  digestion flag), B06 Crumbsmith (sugar; native E_STARCH secretion; movement scores
  convertible substrate), A01 Sunbead (photosynthesis, light scaling, water only, no
  self‑propulsion), P01 Amoeba (contact predation on B01/B04/B06/A01 among enabled species,
  meal storage 2×B0, cooldown, hunt gating).
- Stage 3 conversion: E_STARCH catalysis from pre‑reaction snapshot; enzyme field diffusion at
  half coefficient; 2 %/s decay; emission rule (E > 35, substrate within 4‑neighborhood, cap 1.0,
  0.40 E/s).
- Stage 5 contacts: predation claims with seeded priority; one kill one meal.
Done when: `tests/fixtures/enzyme-source.test.ts` (conversion conserves; no substrate ⇒ none;
B06 pays cost), `tests/fixtures/predation.test.ts` (one prey one meal; cooldown; meal cap;
overflow → detritus), photosynthesis fixture (light 0 ⇒ zero intake; O2/sugar produced).

### P1.2 Quantitative evolution
Build (SPEC §8; CT §6–§7):
- Eight loci with phenotype mapping and activity rules (C07: sensing locus active only when
  native maps to 50).
- Mutation at commit of a birth proposal from separate deterministic streams keyed by
  (worldSeed, birthEventId, daughterIndex): 8 % quantitative (±2 @80 %, else ±5; clamp),
  2 % preference (ordered→weighted establishment per C01; 0.05 transfer), module 0.2 % (registry
  empty ⇒ no effect but the draw is made and recorded), developmental 0 % (disabled until P7).
- Feeding policy `ordered` / `weighted` in stage 6 (C01, C02).
- Genealogy: birth identities for both daughters; parent links; generation depth; lineage
  compaction rules (10,000 recent unpinned birth details).
- Branch candidate records with D4 thresholds (records only; naming/UI in P2.3).
- Mutation modes Standard/Accelerated/Fixed as manifest settings (UI in P2.2).
Done when: `tests/fixtures/inherited-variation.test.ts`: committed births store parentage and
deltas; Fixed ⇒ no mutation; speed 4× ⇒ same mutation outcomes; a fixed birth fixture
reproduces its recorded draw including neutral clamped draws; no self‑parent links.

### P1.3 Worker and protocol
Build (ARCH §7–§8):
- `src/worker/sim.worker.ts` owns the world(s). Typed messages with `requestId`, `dishId`,
  `protocolVersion`. Commands carry `seq` and `targetTick`.
- Run loop with wall‑clock accumulator; speeds pause/step/1×/2×/4×; if behind, cap ticks per
  frame and report `effectiveSpeed`.
- Snapshot builder ≤ 10/s using transferable pooled buffers: render list, per‑cell aggregation
  map, active overlay field, structures/deposits summary, selection detail on request.
- Error policy: uncaught error pauses the dish, emits `error`, preserves last valid state.
Done when: `tests/worker/protocol.test.ts` (stale snapshot discard; command ordering); manual
dev page shows ticks advancing.

### P1.4 Art pipeline and core sprites
Build (ARCH §10; UX §6–§7):
- `art/src/palette.ts` (UX §6.1), `art/src/sprites/*.ts` pixel matrices per species/state/
  heading, `tools/art-build.ts` → `public/atlas/organisms.png` + `manifest.json` (stable
  assetId, speciesId, frame rect, anchor, duration, animation name, 2‑px padding, snake_case).
- Sprites: B01, B04, B06 (16×16, 4 headings, 4 move/idle, 4 reproduction, 2 stress, 3 death),
  A01 (16×16, 1 heading, 4 idle, 4 division, 2 stress, 3 death), P01 (32×32, 6 move, 4 feed,
  4 reproduction, 2 stress, 4 death). Starch notch layer, catalysis dust effect, reserve pocket
  layer (4 bands, used in P2), resting seam layer (P2).
- World tiles: water/gel/sediment textures, stone, dish rim, deposit glyphs (sugar haze via
  overlay; starch grains; detritus flecks), remains particle, deposit ring, division flash,
  eating pulse.
- UI icons as inline SVG (UX §6.4).
Done when: `npm run art:build` is deterministic (same hash twice); `tools/asset-preview.html`
shows every species in every state, grayscale toggle, dense group; validator finds no missing
required frames for enabled species.

### P1.5 Renderer
Build (ARCH §9; UX §5, §7):
- PixiJS 8 app; nearest‑neighbor; integer sprite scales; world unit = cell; zoom presets (whole
  dish / neighborhood / close) with continuous pinch/wheel; pan; follow mode (middle‑half rule;
  touch cancels).
- Layers: environment → shared structures/film → deposits → bodies → feature rims → status →
  selection → (HTML UI above canvas).
- Aggregation below neighborhood zoom: per‑cell dominant‑species color/texture and density.
- One overlay at a time (45 % opacity default, legend, adjustable), infection markers toggle.
- Selection ring/bracket outside body; candidate list on ambiguous tap (sorted proximity then id).
- Interpolation of positions between snapshots only; animation state from snapshot flags.
Done when: 60 fps on the dev machine with 6,000 sprites at neighborhood zoom in a synthetic
scene; aggregation kicks in at whole‑dish zoom; reduced‑motion flag removes pulses/trails.

### P1.6 UI shell and Explore view
Build (UX §2–§4):
- Preact app; routes: Home (Continue, Play; secondary Lab, Notebook, Field Guide, Settings,
  About), Play shelf (Garden card), New Dish (under Lab: habitat, recipe, seed, name, evolution
  mode, founder mode, summary of preloaded contents), Dish screen.
- Dish screen Explore view: top strip (name, sim time, Pause/Run, speed, More), viewport, bottom
  actions **Add Life / Feed / Look**, Undo, family marker slots (P4). Portrait 12/63/25 split;
  landscape side panel 280–340 px. Safe areas. 48‑px targets. 16‑px text, scales to 200 %.
- Input contract (UX §4.2): one finger pans in Look and paints only with a selected tool;
  two fingers always pan/zoom and cancel an uncommitted paint; tap‑to‑place returns to Look;
  Paint option for repeated strokes; mouse/keyboard equivalents; Escape ⇒ Look.
- Panel pause policy: blocking setup panels pause and restore; inspector/overlays do not.
Done when: Playwright `e2e/garden.spec.ts` opens Garden, runs, pauses, changes speed at 360×800,
800×360, 1440×900 and at 200 % text; axe has no serious violations.

### P1.7 Inspector
Build (SPEC §12; UX §5):
- Three depths: **Summary** (name, ancestor, life state, age, generation, energy, health,
  strongest constraint sentence) → **Why** (all constraints; Now vs Passed to offspring) →
  **Details** (measurements, loci, policy, modules, costs, birth record, field values, time
  windows). Cell inspector (substrate, pools, pH, salinity, O2, light, residents, recent deposits).
- Reason codes → Explore wording table (UX §5.2) and Lab wording. Ties within 5 % ⇒ show both /
  "A few things are slowing it down." Division blockers all listed. Predation states
  distinguished. Death attribution with concurrent contributors.
- Shortcuts: What does it eat? / Why did it stop? / Where is its family? / What changed?
- Inspector follows the selection until death/deselect; never covers the selection without a
  reposition route.
Done when: `tests/ui/reasons.test.ts` maps every reason code (SPEC §12.2) to non‑empty copy with
placeholders handling 0/unknown/mixed; manual review of Garden at 120 s explains a blocked
division and a low‑food feeder.

### P1.8 Explore tools and undo
Build (SPEC §10; UX §4):
- Add Life: species picker (five), count 1/5/20 (default 5), footprint preview, accepted count,
  habitat/attachment validation, external‑input ledger entry.
- Feed: Sugar default 0.10/cell, radius 3, dose 0.02/0.10/0.50, distance‑sampled brush,
  crossed brush on invalid terrain, no charge for rejects; Dose button reveals numbers.
- Look: tap inspect, drag pan.
- One‑level undo snapshot taken before each committed gesture; undo rewinds action + elapsed
  ticks; labelled "Undo rewinds time".
Done when: `e2e/place-and-undo.spec.ts`: one gesture adds exactly one accepted dose; pinch
never paints; undo restores hash of pre‑gesture state.

### P1.9 Persistence
Build (ARCH §11; SPEC §14):
- `StorageAdapter` interface; IndexedDB implementation; 10 named slots + rolling autosave +
  retained predecessor per slot; transactional write (serialize consistent tick → validate →
  checksum → write new → swap pointer); failed write keeps predecessor.
- Autosave every 30 s real time and on background/manual/comparison events; `visibilitychange`
  ⇒ save + pause; resume paused with Resume button; no offline growth; device clock irrelevant.
- Export `.pixelmeba` (UTF‑8 JSON, schemaVersion, versions, metadata, full state, SHA‑256 of
  canonical payload; typed arrays base64; ≤ 25 MB) and import with full validation (dimensions,
  limits, IDs, finite, nonnegative, references, checksum), staged into a new slot, current dish
  untouched on failure. Newer unsupported version ⇒ explanatory error.
Done when: `tests/persistence/*.test.ts`: interrupted write recovery; malformed import changes
nothing; export→import hash equality; slot exhaustion UX path exists.

### P1.10 Duplicate, events, history, charts
Build (SPEC §12.3–12.5; UX §5.4):
- Duplicate Dish (independent world + save identity).
- Event feed coalescing repeated events per species/cause over 5 s; last 500 detailed events;
  per‑second history 30 min; one‑minute summaries to 6 h; interventions marked on timeline.
- Charts: living biomass by species, count, O2, nutrient, deaths; patterns + color; units.
Done when: charts render from history buffers; `tests/sim/history.test.ts` checks compaction.

### P1.11 Android spike
Build (ARCH §12):
- `npx cap init` (appId `com.lucidwinds.pixelmeba`, appName `Pixelmeba`), `npx cap add android`,
  `capacitor.config.ts`, plugins list (App, Filesystem, Share, Preferences for settings only).
- Detect JDK/Android SDK in the environment. If present: `npx cap sync android` and a debug
  assemble; if absent: attempt command‑line‑tools install if feasible within ~30 min, otherwise
  write `docs/ANDROID_SETUP.md` with exact owner steps and stop.
Done when: `android/` committed (without local.properties); result recorded in
`EXPANSION_RESPONSE.md` §7 honestly.

### P1.12 Development‑seed report
Build (CT §11; D6 §18):
- `tools/sim-tune.ts`: run FIRST_DISH_V1 at seeds 104729, 130363, 155921, 196613, 262147,
  314159 for 600 s (extend to 1,200 s if no inherited difference by 600 s, keeping the 600 s
  checkpoint) in Standard mode, no interventions. Report per seed: first intake tick, first
  division tick, births, deaths by cause, biomass, food remaining, mutation counts, branch
  candidates, effective speed, endpoint hash. Median/range and censored counts.
- Targets to check (not to force): intake within 15 s and first division within 120 s on ≥ 5/6
  seeds. If missed, tune the *recipe* (new version FIRST_DISH_V2, keep V1) not the mechanics,
  after inspecting placement, nutrient, oxygen, crowding and costs. Record in `DECISIONS.md`.
Done when: `docs/reports/tune-g1.md` exists with the table.

### G1 gate — evidence
| Fixture | Pass |
|---|---|
| `deterministic-state` | identical hashes at 1× vs 4× and via mid‑run save/reload, with a command log including placements |
| `blocked-division-proposal` | proposal identical across blocked ticks; costs/split commit once after space opens; survives save/reload |
| `finite-feeding` | competitors never exceed available food or budget; no negative pools |
| `enzyme-source` | conservation; no substrate ⇒ no conversion; cost paid; bootstrap sugar separately attributable |
| `inherited-variation` | parentage + deltas stored; Fixed ⇒ none; speed‑independent |
| `predation`, `photosynthesis` | as P1.1 |
| e2e `garden`, `place-and-undo`, `save-reload` | pass on three layouts |
| Opening loop review | you can: open Garden, see food→growth and starch→sugar, intervene, inspect the consequence, find an inherited difference or its recorded absence, save, reload, duplicate |

Tag `g1`. Update `EXPANSION_RESPONSE.md` §1–§7.

---

## Phase 2 — Core Abilities, Comparison, What if? (gate `g2`)

### P2.1 Supplementary module framework + E01, E03, E05
Build (SPEC §9; CT §7):
- Registry with versioned eligibility by ancestor ID, three slots, native‑duplicate rejection,
  combination validation, 0.02 E/s active surcharge, gain/loss draws (uniform among eligible),
  loss reconciliation (C05), inspector exposure, visual layer mapping.
- **E01 Starch release** (B01, B04 eligible here; B06 native ⇒ rejected), **E03 Resting stage**
  (complete dormancy state machine SPEC §7.6; B01, B04, B06), **E05 Reserve chamber** (+40 cap,
  0.03 E/s upkeep, four fill bands, split/overflow dissipation rules; all five).
- Manifest `enabledModules: [E01,E03,E05]`; module draws now have effect.
Done when: `tests/fixtures/module-accounting.test.ts`: E05 grants capacity only; E01 cannot
duplicate native; E03 full entry/rest/wake costs; loss frees no material; surcharge applied once.

### P2.2 Founder modes and mutation presets
Build (SPEC §8.6; UX §3.3):
- Founder modes Identical / Varied (45–55 from seeded init stream) / Diverse (10 % of eligible
  founders get one legal module, labelled "present at creation").
- Presets Standard / Accelerated / Fixed; Advanced panel shows rates; changes are timestamped
  interventions in the command log; faster playback never changes per‑birth rates.
- World label "Core prototype — quantitative evolution" while registry is partial; export
  metadata shows enabled registry.
Done when: `tests/fixtures/registry-imports.test.ts`: a save with an unsupported module fails
clearly; changing the active registry never mutates an existing save's candidates.

### P2.3 Branch discovery, lineage, specimens
Build (SPEC §8.5; UX §5.5):
- Candidate qualification (D4: ≥0.10 single active locus, or ≥0.03 mean, or module set differs,
  or policy differs / ≥0.15 weight delta) + persistence (≥5 qualifying descendants across ≥3
  generations) + oldest‑qualifying‑ancestor rule ⇒ **branch established**; states variation
  observed / branch established / branch extinct.
- Generated names "Ancestor · Descriptor · ID"; rename keeps ID visible; pin; extinction keeps
  history.
- Lineage panel: simplified named‑branch tree; detailed selected family; Follow lineage;
  Compare ancestor; trait overlay (per selected locus, banded).
- Save specimen (genome + ancestry summary); spawning is an external introduction via tool ledger.
- Discovery card: Follow / Compare / Dismiss; optional "Pause on discoveries"; one notice per
  burst.
Done when: `tests/fixtures/branch-evidence.test.ts`: thresholds, descendant count and
generation depth all required; renamed/extinct branches retain history; specimen spawn is
ledgered.

### P2.4 Comparison engine
Build (SPEC §13.4; UX §5.6):
- Duplicate freezes baseline (A) and creates B; queued intervention on B; both advance equal tick
  counts (60/180/600 or Stop); sequential scheduling permitted; results: final biomass,
  diversity, O2, deaths, absolute differences, trait distributions, module frequencies,
  capacity‑limited intervals; label "this paired run".
- Prediction note before, shown beside results; player picks conclusion label.
- Phone: A/B toggle with synced camera; large screen: two viewports.
Done when: `tests/sim/comparison.test.ts`: equal ticks regardless of wall clock; baseline
preserved; deleting a comparison never deletes a named dish.

### P2.5 Experiments framework and first cards
Build (SPEC §13.2; CT §10):
- Experiment definition: question, recipe, suggested intervention, predicted tradeoff,
  measurements, stopping point, confounds, observation gate, completion behavior (journal
  stamp, world keeps running). Fixtures run each experiment headlessly to its gate.
- Cards: **Experiment A** What unlocks starch; **B** What changes when a grazer arrives;
  **C** Why variation can matter (RESERVE_COMPARE_V1, labelled "Seeded traits demonstration");
  D1 **Food trail**, **Light and life**, **Cleaning crew**, **Predator balance** (seeds per CT §10).
Done when: `tests/experiments/*.test.ts` reach each observation gate on the nominated content
version, or the report states the measured limiting factor.

### P2.6 What if? (R1)
Build (SPEC §13.3; CT §9.4; UX §3.4):
- `RecipeVariant` registry (stable id, revision, source id/revision, capabilities, title,
  question, one parameter patch, preview difference, optional objective). Realization validates
  and instantiates a fresh paused world with recorded source/variant checksums and realized
  initial‑state checksum. **Again** rebuilds; **Another idea** picks next in catalog order without
  touching sim RNG.
- R‑G0 Garden, R‑G1 smaller meal (0.20), R‑G2 bigger meal (0.80), R‑G3 dinner farther away
  (move patch to (48,82); outline old, solid new; equal cell count validation).
- Starting a variant preserves the current dish via the save flow; slot exhaustion path.
Done when: `tests/recipes/variants.test.ts`: variants change only declared data; realized hash
stable; e2e `whatif.spec.ts`.

### P2.7 Lab view
Build (UX §4.4; SPEC §10):
- Same world; toggle Explore ⇄ Lab changes no state. Categories: Inspect, Life, Food,
  Chemistry (nutrient only until P3), Habitat (water/gel/sediment paint, shade), Tools (stone,
  wall, porous bead, snapshot/duplicate, undo), Observe (overlays, charts, lineage).
- Tray with purpose/suitable habitats/dose/radius per item; radius 1/3/6; persistent selected
  tool; brush preview; wall cannot overlap live agents or cross rim; removing a structure
  restores substrate.
Done when: e2e `lab-tools.spec.ts`; view‑switch hash test.

### P2.8 Regional trait graphs, checkpoint ring, journal
Build (SPEC §12.5; D4 §12): population and median/range of a selected trait per region (regions
defined in P4.8; here whole‑dish plus quadrants); optional automatic checkpoint ring (10 × 60 s,
labelled automatic, never evicts pinned saves); journal of observed relationships.
Done when: charts update from history; ring respects storage limits.

### P2.9 Second tuning report
Run `npm run sim:tune` for Standard and Accelerated on the six seeds (600/1,200 s). Report
module attempts, gains, branch confirmations, per‑daughter rates. `docs/reports/tune-g2.md`.

### G2 gate — evidence
`module-accounting`, `registry-imports`, `branch-evidence`, `comparison`, `variants`, all
experiment fixtures, e2e `whatif`, `lab-tools`, view‑switch hash. Self‑review against D6 §18
comprehension tasks (write the five tester tasks and confirm each is achievable in ≤ 10 min from
a cold start). Tag `g2`.

---

## Phase 3 — Launch Ecology (gate `g3`)

Goal: every foundation organism, habitat, material and tool; wave E1 living chemistry; modules
E06–E10 and E12; guide; audio; accessibility pass.

### P3.1 Chemistry and environment materials
Build (SPEC §4.3–4.5; CT §5): sugar/starch/oil/protein deposits, organic debris (+0.10 N/C),
mineral nutrient, metabolite, O2/CO2 drops, acidifier/alkalizer/buffer (neutralization, buffer),
salt (diffuses, no decay), three inhibitors (0.2 %/tick decay; category targets), closed lid,
shade paint (0.1 multiplier). pH display formula, salinity index. Guide text "No additional
modeled reaction" where relevant.
Done when: `tests/sim/chemistry.test.ts`.

### P3.2 Habitat presets and substrate rules
Build (CT §8): Water Garden, Gel Colony (channel x 59–68), Sediment Edge (y<64 water, stone
(45,43) r13, light 0.15 / O2 0.2 in sediment, detritus 0.10); species habitat compatibility;
attachment surfaces (gel, sediment, stone edge, bead, mesh later); habitat paint replaces
substrate without deleting life or resources.
Done when: preset fixtures load with exact initial fields; suitability responds to habitat.

### P3.3 Foundation organisms wave A
Build (SPEC §7.1–7.3; CT §1–§4): **B02 Velvet** (attached; biofilm deposition/decay/protection/
transport halving; film digestible by B04/F01), **B03 Dusk** (oxygen suppression; no O2; 18 E/C),
**B05 Crossfeeder** (metabolite only), **Y01 Bubble** (anaerobic low yield; 0.20 acid/C; no
self‑propulsion; water/gel), **F01 Threadlace** (attached fungus; branching via reproduction
budget; connection‑mask tiles; parent‑daughter visual link only).
Done when: film fixture (budgeted deposition, 0.50 cap, decay, halving), fungal branching
fixture, Dusk suitability fixture, per‑relationship fixtures.

### P3.4 Foundation organisms wave B
Build (SPEC §7.4–7.5): **P02 Ciliate** (fast; excludes attached B02), **P03 Rotifer**,
**P04 Siltworm** (sediment; crosses ≤ 2 water cells), **X01 Hitcher** (A01‑only parasite; drain
0.02 C/s; host death < 0.25 B0; daughter placement rule), **V01 Pinphage** (viral‑unit field;
infection probability; 20 s lysis; 40 % to units at 0.01 C; decay 1 %/s; infection overlay).
Done when: `tests/fixtures/host-specificity.test.ts` (V01 never infects non‑B01; X01 only A01;
no host ⇒ no replication), predation matrix fixture for P02–P04.

### P3.5 Tools: sampling and dilution
Build (SPEC §10.3–10.6): **Sample** as a paused transaction (D7 LABA04 adopted globally):
begin ⇒ pause + checkpoint; modes Life/Dissolved/Deposits/All; radius 1/3/6; whole ownership
units (host+parasite, later links) or rejection with highlight; confirm ⇒ sample slot (accounted
holding compartment); cancel restores exactly; discard logs export. **Transfer** validates all
destination cells first, move not copy, same‑dish now (cross‑dish in P6.4). **Clean water
replacement** 25/50/100 % dissolved non‑gas fields; restores O2/CO2 baseline; ledgered.
**Erase structure**. Phage inoculation doses 1/5/20 units per cell.
Done when: `tests/sim/tools.test.ts`: sampling conserves; transfer atomic; dilution ledgered.

### P3.6 Wave E1 living chemistry
Build (SPEC §5, §7.7; CT §1–§5): **B07 Oilwick** (E_OIL), **B08 Brothmaker** (E_PROTEIN),
**Y02 Creambud** (broth), **F02 Cordweaver** (E_STARCH; explicit links; one simultaneous
transport pass with donor/receiver caps; degree ≤ 4). Fields: E_OIL, E_PROTEIN activities,
broth + companion N, enzyme breaker. Materials M01 broth, M03–M05 enzymes, M09 breaker, M10 slow
feeder pellet, M11 leaf wafer (finite food objects, cap 128, shrinking outline, stain on empty).
Producer movement scoring (convertible substrate). Inspector reaction ledger; food‑access overlay.
Done when: `E212` fungal supply line fixture exact ledger; food object conservation fixture;
`E201`–`E204` fixtures.

### P3.7 Modules E04, E06–E10, E12
Build (SPEC §9; CT §7): **E04 Surface anchor** (B01, B03–B12, Y01, Y02; attach 5 s beside solid
substrate/bead, +0.10 E/s, detach/lockout rules; no movement effect for non‑motile carriers),
**E06 Shade collector** (A01), **E07 Light seeker** (A01; base speed
0.15, sensing 2, activates loci at stored values; per‑second cost; brighter‑by‑0.01 rule),
**E08 Debris feeder** (P01, P02, P03), **E09 Protein release** (B04, B05, Y01, Y02, F01, F02),
**E10 Matrix builder** (B01, B04, B06, Y01, F02; shared film headroom allocation), **E12 Colony
adhesion** (B01, B04, B06; links ≤ 2, component ≤ 8; costs; severance rules; transport class
restriction). Stage 8 reservation order (mandatory → native optional by action id → E01…E12).
Done when: per‑module fixtures (D4 §13 edge cases relevant to these modules), C08 shared‑budget
fixture (two actions cannot spend the same energy).

### P3.8 Field Guide, journal, badges
Build (UX §5.7): all tools and species listed immediately; shape/diet/habitat/preferences/
predators/hosts/products/example interaction; general biology vs invented rules distinguished;
journal of observed relationships; cosmetic badges only.
Done when: every enabled content ID has guide text (validator enforces).

### P3.9 Experiments and curated dishes
Build (CT §9–§10): D1 **A hidden neighborhood**, **One compatible host**; D2 **E201–E204**,
**E212**; curated **L301 Two Lunches**, **L303 Public Kitchen**, **L304 Empty After the Feast**,
**L306 Borrowed Shelter** (pre‑seeded genomes labelled).
Done when: fixtures reach gates or report measured limiters.

### P3.10 Audio
Build (ARCH §10.3; UX §8): Web Audio `SoundKit` with synthesized cues (drop, select, save,
discovery, comparison result, division chime, gate click later), rate limit 4 world cues/s
with coalescing, ambient loop (filtered noise + slow pad), separate music/effects volume, mute,
respects reduced‑motion/quiet‑audio settings, optional haptics only on intentional tool actions.
Done when: unit test on rate limiter; manual listen.

### P3.11 Accessibility pass 1
Build (UX §9): keyboard navigation and visible focus everywhere; semantic controls; ARIA labels
for panels, inspector values, charts (data table alternative); canvas summarized by species list
and selected‑cell description; reduced motion; simplified overlay palette; 200 % text reflow;
contrast audit of palette pairs (record results in `docs/reports/contrast.md`).
Done when: axe (Playwright) has zero serious/critical issues on all screens; keyboard journey
e2e passes.

### P3.12 Performance pass 1
Build (ARCH §13): headless 15‑minute stress (6,000 agents incl. 2,000 fungal segments, all E1
systems on) — record tick cost distribution; renderer budget with aggregation; snapshot size;
memory trend. Optimize hot paths (SoA, typed arrays, no per‑tick allocation in stages).
Done when: 1× tick < 10 ms at target population on the dev machine (record the machine); no
unbounded memory growth; `docs/reports/perf-g3.md`.

### G3 gate — evidence
`host-specificity`, `transport-obstacles` (pulse, walls, sampling reconciliation),
`conservation-all-pools` (10,000 ticks with film, fungi, parasites, phage, enzymes, food objects,
transport), every catalog relationship fixture (generated table in the response doc), all
module fixtures, experiments, e2e journeys incl. Lab tools and keyboard. Tag `g3`.

---

## Phase 4 — Wonder, Replay, Android → `v1.0.0-rc1`

### P4.1 Favorite families
Build (SPEC §12.6; UX §5.8): up to 3 favorites per dish (lineage root, nickname ≤ 60 chars,
marker pattern, representative); Find; on division/death offer descendants sorted by birth tick
then id; "Follow next"; extinction card with Look back / Continue / New dish; unpinned
favorites remain in notebook; nicknames local, exported only by choice.
Done when: `tests/ui/favorites.test.ts`; favorites never alter behavior (hash test).

### P4.2 Story cards
Build (SPEC §12.7; UX §5.9): templates **A first split**, **An enzyme at work**, **A family
changed**, **A place changed**; ≤ 3 panels with sim‑time captions; evidence IDs; ≤ 1 notification
per 60 s, one visible notice, priority favorite → unseen template → earliest; notebook tab
"Something happened"; Spotlight focuses location without re‑enacting.
Done when: `tests/ui/stories.test.ts`: no card without evidence; caption resolution.

### P4.3 Garden card, session memory, prompts
Build (UX §3): Home Continue/Play; Garden card with live thumbnail; one optional prompt at a
time with "Show me"; session memory on Save and leave; no invented highlight when quiet.

### P4.4 Objective engine and goals
Build (SPEC §13.5): five predicate types (keep species alive; biomass threshold; transfer
across named gate; observe named event; keep field in range for duration); goal states
inactive/running/completed/ended/continued‑freely; **See a Sprinter split**, **Keep Sprinters
going**, **Watch starch become food**; off by default; one dismissible sentence.
Done when: `tests/sim/objectives.test.ts` incl. blocked proposals not counting.

### P4.5 Paired Garden variants (R2)
Build: 180‑s paired comparison of R‑G1/R‑G2/R‑G3 against R‑G0 with equal horizons; sequential
on constrained devices.

### P4.6 Share
Build (SPEC §14.4; UX §5.10): **Picture** 1080×1080 (full dish, question, quiet wordmark, safe
margin, nearest‑neighbor), **Starting recipe** export, **Living dish** export; offline recipe
identifiers "R‑G3 / rev 1 / seed 104729" with Copy and Import ID; metadata‑stripped export with
recomputed checksum; OS share/save flow (Web Share API / Capacitor Share); cancellation is a
no‑op.
Done when: `tests/persistence/share.test.ts`; e2e share sheet opens with three labelled choices.

### P4.7 Try my dish (R4)
Build (SPEC §13.6): immutable baseline in a slot; goal + 60/180/600 s turn; each turn clones
into a new world ID, starts paused; at horizon: Keep / Another turn / Finish; no accounts.

### P4.8 Observation tools (D2 §20)
Build (SPEC §12.8): relationship map (observed transfers/attacks only; 60/180/600 s windows),
region probes (≤ 6 masks; overlap warning), follow family (≤ 200 highlighted), event bookmarks
(50 text / 20 snapshot), recipe card export (world + seed + modules + command schedule + versions
+ expected observations text), specimen gallery (100), custom challenge editor (five objectives;
allowed tools; command budget; export with baseline checksum), transfer preview. Storage usage
display and cleanup.

### P4.9 Narration, sound polish, motion audit
Build (UX §8.3): SpeechSynthesis narration for the 16 fixed phrases, off by default, only when
evidence condition true, text equivalents always; distinct cues for placement/division/card;
reduced‑motion audit of every effect (table in UX §7.4 filled in).

### P4.10 Android
Build (ARCH §12): Capacitor Filesystem storage adapter (Directory.Data; temp‑write‑verify‑rename;
predecessor retained); lifecycle (App plugin pause/resume ⇒ save+pause; forced‑kill recovery to
last committed); Share plugin export; file import via input/plugin; cold offline launch; splash/
icon assets; `targetSdkVersion` ≥ current Play requirement (verify against Capacitor defaults and
Play policy at build time; record); debug APK if SDK present; `docs/ANDROID_SETUP.md` release
signing steps (keystore generation script for the owner; never committed); AAB build script.
Done when: build result honestly recorded; storage/lifecycle tests run in a browser harness that
simulates interruption; owner checklist items enumerated.

### P4.11 Web and arcade build
Build (ARCH §14): `dist/` with relative base; iframe‑safe (no `window.top`, `visibilitychange`
pause, optional `postMessage` pause/resume hooks); PWA manifest + precache service worker for
offline web play; `DEMO_MODE` build flag (Garden + variants + five organisms + Explore +
save/export; no timer; same save format; full saves needing absent content rejected with a
capability message).
Done when: `npm run build` output served from a subpath works offline after first load; a
`DEMO_MODE` build passes the demo scope test.

### P4.12 Store readiness
Build (`PLAY_STORE_CHECKLIST.md`): `tools/store-assets.ts` renders 512×512 icon (adaptive
foreground/background), 1024×500 feature graphic, phone/tablet screenshots via Playwright at
required sizes (six topics: living dish, simple actions, What if?, inspection, a real inherited
change, an experiment); listing text (D9 §11 draft, edited to shipped scope); `PRIVACY_POLICY.md`
(no data collected; local saves; user‑initiated share); data safety answers; content rating
notes; version code/name scheme.
Done when: assets in `store/`; checklist has every owner item with exact instructions.

### P4.13 Performance pass 2 and polish
Profile dense Garden + wave E1 on the web build; particle/label/overlay budgets; effective‑speed
indicator; heat/memory over 15 min; polish first‑minute feel (deposit ring, first feeding
pulse timing, camera easing). `docs/reports/perf-rc1.md`.

### P4.14 Release candidate
Run everything. Complete `EXPANSION_RESPONSE.md` §1–§8 with real outputs. Update `README.md`.
Tag **`v1.0.0-rc1`**. Then continue to Phase 5.

### v1.0 gate — evidence
All prior fixtures + `favorites`, `stories`, `objectives`, `share`, `variants-paired`,
view‑switch, one‑gesture accounting, demo scope; e2e full journey (Home → Garden → feed →
inspect → pause → undo → save → reload → What if? → compare → share); axe clean; perf report;
Android result; store assets. D9 §12 usability gates are **owner** tasks — list them.

---

## Phase 5 — Expanded Ecology → `v1.1.0`

### P5.1 Climate systems
Build (SPEC §4.6–4.8): day/night cycle (240 s; factors; inspector phase), local warmth field
(relax 1 %/tick to ambient 0.5, diffuse 0.05, heater/cooler ±0.01/s, clamp), moisture index
(water 1; gel/sediment 0.8; drying −0.001/s to 0.1; wetting 0.9; roof; wick), moisture
suitability shoulder 0.2, canopy factor from A05 biomass. New Dish options; recipes override.

### P5.2 Structures and transport classes
Build (SPEC §2.4, §4.9; CT §4, §5.3): S01 fine membrane, S02 small gate, S03 shutter, S04
one‑way channel (2 %/s pools; one Small organism/s), S05 porous shelter, S06 attachment mesh,
S07 nutrient basket, S08 adsorption resin (0.05/s, cap 5), S09 heater, S10 cooler, S11 shade
roof, S12 moisture wick. Edge barriers (≤ 512), devices (≤ 256), permission matrix, path checks
every crossed edge, host+parasite as one unit, gate preview tracer (paused, no sim), region
charts with exchange totals.

### P5.3 Wave E2 organisms
Build: **B09 Lantern** (S_GLOW field; hysteresis glow; M06 signal, M07 quencher), **B10
Brinecoil**, **B11 Sourbud**, **B13 Rampart** (RIVAL; M08), **A02 Glasswheel** (silicate M02;
shell grit M12; bound mineral), **A03 Shadeleaf**, **A04 Turnleaf** (saved mode; thresholds),
**A05 Raftball** (canopy). **E02 Signal glow** module (eligible B01–B08, B10–B13) enabled with
the S_GLOW system. Inhibitor category targets extended (A6). Art for each.

### P5.4 Habitat recipes H04–H11
Build (CT §8.2): exact geometry; Empty or Suggested Community (five of each named species,
previewed and recorded).

### P5.5 Wave E3 organisms and E11
Build: **B12 Sleeper** (native dormancy), **F03 Traplace** (trap reserve; P04 hold 8 s; drain;
release; cooldown), **F04 Sporeveil** (resting daughter placement; Small class), **P05
Shellglider** (silicate; 4 s handling), **P06 Bellstalk** (radius‑1 capture, attached), **P07
Dartfin**, **P08 Waterbear** (dormancy; moisture), **P09 Wheelgrazer** (meal‑else‑detritus),
**P10 Needlejaw** (continuous‑contact handling 1 s / 4 s; sampled coverage), **X02 Threadrider**
(F02/F04 hosts), **V02 Lacephage** (B02 host where film ≥ 0.10; half diffusion). **E11 Mineral
jacket** (P01, P02, P07). Food web extensions for P01–P04 (D2 §16). 48×48 frames for P08/P10.

### P5.6 Experiments, curated dishes, prompts
Build: E205–E211, E213–E218 (test‑only overrides disclosed), L302, L305, D2 §23 play prompts
(measured goals), succession notebook (one‑minute templated summaries tied to event IDs).

### P5.7 Art and audio for the expansion
24 organism sets; dormancy Prepare/Rest/Wake; trap Open/Holding/Cooldown; Lantern Dim/Glow;
Turnleaf modes; shell/grit; 12 structure icons/tiles; 12 material icons; region pins; gate
badges; soft gate click; single wake cue.

### P5.8 Regression and acceptance
D2 §25 table: conservation, isolation, state machines, ownership, compatibility (V01/B01 vs
V02/B02 disjoint), replay/recovery, understanding. Mixed dense scene perf. Tag `v1.1.0`.

---

## Phase 6 — Living Lab → `v1.2.0`

### P6.1 LL1 Dosing reservoir
LAB01 (SPEC §11.1): 20 C capacity; sugar (N ratio 0–0.10) or broth; rates 0.01/0.02/0.05;
stage 3 release `min(rate×dt, remaining)`; states Off/Running/Empty/Blocked; panel; **LABR01**
pulse‑vs‑steady recipe with the setup‑only inventory‑release command.

### P6.2 LL2 Light lens
LAB02 (SPEC §11.2): radius 3 path‑distance contribution `intensity × (1 − d/4)`; light formula
LABA02 (lamps add before shading); cache invalidation; overlay preview; **LABR02**.

### P6.3 LL3 Controllers
(SPEC §11.3): ≤ 8 rules; one per device; metrics; High/Low hysteresis; hold 1/5/10; cooldown
10/30/60; sample 1 Hz after stage 10; queue next tick; manual override pauses automation;
audit trail; chart markers; **LABR03**.

### P6.4 LL4 Cross‑dish transfer
Atomic prepare/commit across two saves; recovery to both‑old or both‑new; disabled with a stated
limitation if the platform cannot guarantee atomicity.

### P6.5 LL5 Research records
Six stamps (Observer, Dose planner, Habitat architect, Experiment designer, Lineage tracker,
Control operator) from recorded evidence only; presets; question cards; experiment portfolio
with four‑question summary; notebook spread.

### P6.6 Playgrounds and equipment invitations
D8 **Slow Snack**, **A Light in the Dark**; D9 **R‑L1**, **R‑L2** (Fixed mutation visible).

### P6.7 LL6 validation
D7 §16 table; save migration; dense scene with 256 devices + 8 controllers. Tag `v1.2.0`.

---

## Phase 7 — Advanced Living Worlds → `v1.3.0`

### P7.1 Behavior strategies
(SPEC §7.12): Ancestral / Resource follower / Space finder / Shelter keeper / Night forager /
Trail follower; 0.5 s decision interval; memory fields; 0.02 E/s overhead; low‑energy fallback;
night thresholds (10–40 locus); inspector "Moving toward…".

### P7.2 Life stages E13, E14
E13 Settler (Juvenile/Settling/Adult; exclusions), E14 Dispersing offspring (Dispersing/Settling/
Stranded/Adult; 40 s budget; class rules; F02 link formation on settlement).

### P7.3 Body size and form
Size locus (s = 0.75 + 0.005·locus) for the eligible set; derived B0, Q (s^0.75), M (s), speed
(1/√s), caps (100·s), thresholds; class change at birth; contact geometry 0.25·(s1+s2);
Streamlined form (×1.10 speed, ×1.10 division cost, 1 s heading lock).

### P7.4 Colonies, partners, developmental mutation
E15 Exchange junction (carbon and energy transfer rules; 90 % delivery; no relay; donor gets no
energy); colony roles (Generalist/Forager/Builder/Keeper/Breeder; keeper emergency); E16 Partner
bond (bacterium+alga pairs; costs; transfer; break rules); developmental draw 1 %/2 %/0 with
field operations; native feature whitelist toggles; draw order.

### P7.5 E17 Food cache
Cache objects (4 C cap; deposit rules; 0.02 C/s release to detritus; shared budget of 128).

### P7.6 Lineage portraits, follow story, timeline
Side‑by‑side founder/descendant at same scale; advantage+cost copy; follow rules on division/
split/extinction; aggregated timeline cards with snapshot availability.

### P7.7 Fixtures and acceptance
D501–D506 exact numbers; D5 §18 conservation/state integrity/reproducibility/understanding.
Tag `v1.3.0`.

---

## Appendix A — Phase exit ritual (copy into each gate commit message)

```
gate: <id>
check: npm run check → <pass/fail summary>
e2e: npm run test:e2e → <n passed>
content: npm run content:validate → ok (contentHash <hex>)
tune: npm run sim:tune → docs/reports/<file>
perf: <tick p50/p95 ms @ <agents> on <machine>>
determinism: <hash> (1x) == <hash> (4x) == <hash> (reload)
conservation: C err <x> %, N err <y> %
open owner decisions: <n> (see EXPANSION_RESPONSE §8)
```

## Appendix B — What never to do while executing this directive

- Do not rename species IDs, module IDs, structure IDs or recipe IDs. They are saved in files.
- Do not implement a system from a later phase because it seems small. Flag‑gate and wait.
- Do not tune mechanics to make a demo look good; tune a *new recipe version* and report.
- Do not add a runtime AI, a server, analytics, accounts, ads, IAP, timers or streaks.
- Do not claim the simulation is real biology or real chemistry anywhere in UI or store copy.
- Do not commit keystores, `local.properties`, or the design zip.
