# Pixelmeba Phase 3 build plan: six builder waves plus a lead preflight

I read everything from the committed tree (`git show HEAD:`). HEAD is `6a35126`, the working tree was clean, and Phase 2 is at wave A. Where a builder depends on something Phase 2 waves B or C will create (Lab trays, NewDish modes, `src/ui/journal.ts`, the Notebook, atlas feature layers, and any `src/sim/grid.ts`/`structures.ts` placement code the P2.7 builder adds), the prompt names the expected path and says "verify; find with git grep if the path differs".

---

## 0. What the committed code already does

These facts shape the plan:

- **Content already exists.** `content/` has every species (A01–Y02), material (incl. M01–M12, INH_*, SALT, OIL…) and module (E01–E17). Each record has full `guide` text and a `phase`.
  - Phase 3 is therefore mostly: implement the sim rule, add it to `src/sim/content/implemented.ts`, and insert the ID into `content/manifest.json`.
  - The validator refuses an enabled ID with an unimplemented ability or module, one whose `phase > buildPhase` (currently 2), or an enabled species without atlas frames (`tools/content-validate.ts` `checkAtlas`).
- **Already implemented:**
  - Dusk O2 suppression, inhibitor exposure with the film ×0.5, and salinity/pH suitability (`suitability.ts`).
  - Neutralization, inhibitor/enzyme/breaker/viral decay, and film edge-halving (`transport.ts`).
  - Oil→metabolite, protein→broth and breaker (`conversion.ts`).
  - Anaerobic energy and acid emission (`intake.ts`).
  - Every SPEC §12.2 reason code (`reasons.ts`).
  - Constants `FUNGAL_CAP` 2000 and `FOOD_OBJECT_CAP` 128.
- **Not implemented:** host drain, lysis/infection, biofilm deposition, branching placement, fungal links and transport, P04 crossing, the attachment-surface rule (D-0006), food objects, sample/transfer/clean water, stage 8 beyond starch secretion, and E04–E12.
- **Hash risk, part 1 — the content hash is inside the state hash.** `stateHash()` (`src/sim/serialize.ts`) hashes `world.content.manifest.contentHash`. That hash covers the whole `content/` tree, so **every content edit changes every new world's stateHash**, even when the biology does not change.
- **Hash risk, part 2 — recipes use the global manifest.** `worldContentFor()` (`src/sim/recipes.ts`) copies the global manifest into each new world. So enabling species or systems changes FIRST_DISH_V1's species indices and allocated fields (`allocateFields(enabledSystems)`), and enabling modules changes its mutation module options.
- **Saved worlds carry their own content.** A saved world embeds its manifest and definitions, so old saves are protected, but only if no new code path is gated on a build constant.
  - `FILM_DIGESTION_IMPLEMENTED` is exactly such a constant. It is used in `snapshot.ts`.
- **Tests use the shipped manifest.** `tests/helpers/world.ts` `registry()` means a Phase 3 species cannot be tested until the manifest enables it, unless a helper builds a validated registry with a patched manifest.
- **Every new mechanism needs schema state.** It needs entity columns (links, anchor timers, film timer, E12 pairing, P04 crossing) or world stores (food objects, the sample slot).
  - Doing that once, in wave 1, avoids three schema bumps and a race on `SCHEMA_VERSION`.
- **No new RNG streams are needed** except one optional stream for curated scatter placement.
  - Parasite attach and E12 pairing use the `contact` stream with new KIND keys, or birth-ID ordering.
  - Infection uses the existing `infect` stream.

---

## 1. Dependency sketch (P3.1–P3.12)

```
PREFLIGHT fence (lead): g2 saves + trajectory digests + registryWith() ──────────────► every wave
W1 foundation (schema 3: links, anchor/film/E12/P04 columns; food-object + sample stores; world gates; system-requirement validation)
   ├─► P3.3 (film timer, F01 visual links)   ├─► P3.4 (P04 crossing col, parasite release)
   ├─► P3.5 (sample slot, link tables = ownership units)   ├─► P3.6 (object store, F02 link table)   └─► P3.7 (E04/E12 columns)
W1 stage8 framework (reservation order, shared construction, transport hook, generic secretion)
   ├─► P3.3 B02 film   ├─► P3.6 B07/B08 natives + F02 pass   └─► P3.7 E09/E10 + final order + C08
W1 P3.1 chemistry ──► P3.3 (Y01 acid/pH, inhibitor targets) ──► P3.9 (EXP_104 closed lid) ──► P3.8
W1 P3.2 habitats + attachment surfaces ──► P3.3 (B02/F01 attach) ──► P3.6 (F02) ──► P3.7 (E04 support) ──► P3.5 (transfer validation) ──► P3.9 (gel recipes)
W1 art-organisms (14 species + fungal mask tiles + V01 glyph) ──► enabling any Phase-3 species (W2, W3)
W2 art-features (film/objects/links/infection/module layers, protocol v2) ──► truthful visuals for P3.3–P3.7
P3.3 ─┬─► P3.4 predation matrix (B02 as prey)          P3.4 ──► P3.5 (host+parasite unit, phage)
      └─► P3.6 F02 (fungi.ts placement)                P3.6 ──► P3.5 (links/objects in samples; generic via W1 stores → same wave OK)
P3.7 (+ lead module flip) ──► P3.9 curated (L306 E10; Diverse founders L303/L304) ──► relationship matrix (module rows)
P3.8 guide ──► P3.11 a11y audit        P3.10 audio: independent (placed W5)
All sim (W1–W5 + flip) ──► P3.12 perf, conservation-all-pools, determinism-g3 ──► G3
```

Wave layout. Builders are capped at 4 per wave, and owned files are disjoint within a wave.

| Wave | Builders (port) | BUILD_DIRECTIVE items |
|---|---|---|
| Preflight | lead only | determinism fence |
| 1 | foundation 4211 · environment 4212 · stage8 4213 · art-organisms 4214 | infra, P3.1, P3.2, P3.7 core |
| 2 | film-fungi 4221 · organisms 4222 · parasites-phage 4223 · art-features 4224 | P3.3, P3.4 |
| 3 | e1-producers 4231 · f02-links 4232 · food-objects 4233 · tools-sample 4234 | P3.6, P3.5 |
| 4 | mod-anchor-light 4241 · mod-feeding 4242 · mod-builders 4243 · mod-adhesion 4244 (+ lead module flip) | P3.7 |
| 5 | field-guide 4251 · experiments-curated 4252 · g3-fixtures 4253 · audio 4254 | P3.8, P3.9, P3.10, gate fixtures |
| 6 | a11y 4261 · perf 4262 · g3-evidence 4263 | P3.11, P3.12, G3 evidence |

- Verifiers use builder port + 5, so every port stays within 4201–4299 and no two waves overlap.

### Stage-file owner per wave

Everyone else in the wave makes one-line hook calls into their own new files.

| File | W1 | W2 | W3 | W4 |
|---|---|---|---|---|
| `src/sim/transport.ts` | environment | film-fungi | – | – |
| `src/sim/suitability.ts` | environment | – | – | – |
| `src/sim/structures.ts` (stage 8) | stage8 | – | – | mod-builders |
| `src/sim/movement.ts` | – | organisms | – | mod-anchor-light |
| `src/sim/contacts.ts` | – | parasites-phage | – | mod-adhesion |
| `src/sim/intake.ts` | – | parasites-phage | – | mod-feeding |
| `src/sim/maintenance.ts` | – | parasites-phage | – | mod-adhesion |
| `src/sim/births.ts` | – | film-fungi | f02-links | – |
| `src/sim/conversion.ts` | – | – | food-objects | – |
| `src/sim/commands.ts` | – | – | tools-sample | – |
| `entities`/`world`/`serialize`/`ledger` | foundation | – | – | – |
| `src/worker/protocol.ts` | – | art-features | – | – |
| `art/src/**` | art-organisms | art-features | – | – |

---

## 2. Determinism: where the FIRST_DISH_V1 hash will move, and the fence

| When | What changes in a newly realized FIRST_DISH_V1 | Changes the biology? | Guard |
|---|---|---|---|
| Any `content/` edit (every wave) | contentHash → stateHash | no | never pin stateHash literals; use the trajectory digest |
| W1 foundation: schema 3 | new zero columns and stores enter stateHash | no | g2-replay, trajectory fence |
| W1 environment: `chemistry` system | inhibitor fields allocated (zero, inactive) | no | fence (digest asserts non-g2 fields are all zero) |
| W1 stage8: restructure | B06/E01 secretion code path rewritten | **must be no** (float ops and order identical) | g2-replay + fence |
| W2/W3: species and systems enabled | species indices shift; film/fungi/virus/object fields allocated | no (keys never use species index; digest maps index→ID) | fence |
| W2: `FILM_DIGESTION_IMPLEMENTED` → world gate | B04 `digestsFilm` is already true | no (film pool is 0) | g2-replay (old saves have no film system) |
| W3: producer movement scoring generalized | B06 movement code rewritten | **must be no** | fence |
| **W4 module flip (lead)** | B01, B04, B06, A01, P01 gain eligible modules, so `mut.module` picks change | **yes, forced by rules** | moduleRegistryVersion 1→2 + DECISIONS entry. Proof: under registryWith(pre-flip modules) the digest is unchanged, and under g2 lists it equals g2 |
| W6 perf | hot paths | **must be no** | hash-neutrality proof |

### Preflight (lead, before wave 1; one commit)

1. **Check the start state.** Tag `g2` exists, `main` is clean, `npm run check` is green.
2. **`tests/helpers/trajectory.ts`: `trajectoryDigest(world)`.**
   - Hash with `StateHasher`: seed, tick, canonical settings, grid arrays, and every field in `G2_FIELD_IDS` (the core + enzymes fields a g2 world allocates).
   - Throw if any other allocated field is non-zero.
   - Alive entities in slot order: species **ID string**, birthId, entityId, x, y, heading, B, N, E, H, age, mealC, mealN, boundMineral, lifeState, stateTimer, lockoutTimer, dryTimer, and genomeKey.
   - Lineage arrays with species mapped to IDs; counters; ledger initial/inputs/exports/roundoff/exchangeC; pending commands; branch count plus root birthIds.
   - Exclude contentHash, contentVersion, and columns and stores added after g2 (assert they are empty).
3. **`tests/helpers/registry.ts`: `registryWith(patch, { allowUnimplemented?: boolean })`.**
   - Loads the raw packs, patches the manifest lists and `buildPhase`, and re-validates.
   - Add an optional second parameter to `validateContent(raw, opts)`; the default keeps current behaviour.
   - Export `G2_LISTS`, read from `tests/fixtures/saves/g2-manifest.json`.
4. **`tools/make-g2-saves.ts` → `tests/fixtures/saves/`.** Write through the real `buildSaveFile`:
   - `g2-manifest.json`;
   - FIRST_DISH_V1 at t 3000;
   - STARCH_UNLOCK_V1 (E01 carriers) at t 900;
   - RESERVE_COMPARE_V1 (E05) at t 600, if present at g2;
   - FIRST_DISH_V1 transformed to Accelerated + Varied at t 6000;
   - a hand-built world with E03 carriers mid-Preparing, Resting and Waking;
   - `expected.json` with `{hashAtLoad, hashPlus1000, digestPlus1000}` per save.
5. **`tests/fixtures/g2-replay.test.ts`.** For each save: `loadSaveFile` → stateHash equals `hashAtLoad`; run 1,000 ticks → hash and digest equal the expected values.
6. **`tests/fixtures/trajectory-fence.test.ts` + `tests/fixtures/fence.json`.**
   - Covers every g2 recipe and the R-G1…R-G3 variants: `{ticks (≥ 1,200 for FIRST_DISH_V1; whole test under 60 s), g2Digest, currentDigest, changedBy}`.
   - Check (a): under `registryWith(G2_LISTS)`, the digest equals `g2Digest`. This is permanent and proves no Phase 3 rule leaks into Phase 2 content.
   - Check (b): under the shipped manifest, the digest equals `currentDigest`.
   - Also check that every recipe in `content/recipes` has an entry.
7. **`tools/fence-update.ts`.**
   - `--add <recipe>` records `currentDigest` for a new recipe.
   - `--recipe <id>|--all --reason D-00xx` refuses to run without a reason and never touches `g2Digest`.
8. **Perf baseline.** Run `npm run sim:run -- --recipe FIRST_DISH_V1 --ticks 6000 --perf` and put the numbers in `docs/reports/perf-g3.md` under "Baseline at g2".
9. **Save the workflows.** Write `docs/agent/g3-wave-{1..6}.workflow.js.txt` from section 4, then commit: "test(fixtures): Phase 3 determinism fence".

---

## 3. Shared PRE and VERIFY (paste into every Phase 3 wave file)

```js
// Each wave file sets STATE, e.g. const STATE = 'Preflight and wave 1 (…) are committed on main.'
const PRE = `You are working in /workspaces/pixelmeba (Pixelmeba; follow CLAUDE.md). Phases 0–2 are tagged g0/g1/g2. ${STATE} You build part of Phase 3 "Launch Ecology" (docs/BUILD_DIRECTIVE.md "Phase 3"). Canonical rules: docs/PIXELMEBA_IMPLEMENTATION_SPEC.md (SPEC), docs/CONTENT_TABLES.md (CT, every number), docs/ARCHITECTURE.md (ARCH), docs/UX_SPEC.md (UX), docs/CONFLICT_REGISTER.md; docs/DECISIONS.md holds rulings (read every title; D-0006, D-0007, D-0008 were written for Phase 3). Contract (CLAUDE.md): determinism (randomness only via det(seed, stream, ...keys) in src/sim/rng.ts; prefer an existing stream with a new KIND key, e.g. 'contact' with a new kind constant; add a NEW stream id only if unavoidable and never reuse one), conservation ledger (every material move is internal and balanced, or an input/export), no hidden rescue, honest labels ("coincided with" until a mechanism supports "because"; never "superior/advanced/perfect/adapted/immune"), content is validated JSON, the UI changes the world only through commands, saves are sacred (a world schema change needs a version bump + migration by copy + an old-save test through loadSaveFile, see D-0019).

PHASE 3 DETERMINISM FENCE. tests/fixtures/g2-replay.test.ts (saves written by the g2 build load through the import path and continue bit-identically) and tests/fixtures/trajectory-fence.test.ts (each registered recipe's biology digest, checked under the g2 content lists via tests/helpers/registry.ts registryWith() and under the shipped manifest) must pass after your change. Gate every new rule on the WORLD's own recorded manifest (src/sim/gates.ts worldHasSystem/worldHasSpecies/worldHasModule) or on the presence of the organisms it concerns, never on a build constant, so an old save never gains a Phase 3 rule. Never hard-code stateHash literals in tests: every content edit changes the contentHash and therefore every stateHash; compare relationally or with tests/helpers/trajectory.ts. If your work would change a fence value, do not make that change: report "FENCE: <recipe> <why>". Only the lead updates the fence (tools/fence-update.ts with a DECISIONS id); you may run "npx tsx tools/fence-update.ts --add <recipe>" for recipes you create.

CONTENT AND MANIFEST. content/manifest.json is SHARED: only insert the IDs your assignment names (arrays stay sorted ascending), never remove IDs, never change version fields unless your assignment says so. Add the native abilities/modules you implement to src/sim/content/implemented.ts (additive). Before your flip, and for content another builder enables in this wave, test through registryWith({...}) (validated; allowUnimplemented only for species whose ability another builder of this wave is implementing, and say so). After changing anything under content/ run "npx tsx tools/content-validate.ts --write" (a contentHash or atlas mismatch caused by another agent's in-flight edit is not your bug; say so). An enabled species needs its atlas frames.

OWNERSHIP. The lead commits: do NOT run git add/commit/stash/checkout/reset/rm and do not delete files you did not create. Other agents edit the same working tree right now. Edit ONLY the files your assignment lets you own. SHARED files: additive edits only (new functions, cases, fields, or a one-line hook call into your own new file, which is the preferred pattern for stage files), re-read the file immediately before each edit, keep edits small, never reformat/reorder/rename code you did not write. Entity columns, world stores and SCHEMA_VERSION change only if your assignment says so. Only the wave's art owner edits art/src/** or runs npm run art:build. If you need a change elsewhere, describe it in your report.

BROWSER TESTS only with your own port and build folder: E2E_PORT=<port> E2E_OUTDIR=tmp/dist-<key> npx playwright test <your specs> --project=phone-portrait --project=desktop, then --project=phone-landscape. Stop only your own server: lsof -t -i :<port> | xargs -r kill (never pkill -f). The machine has 2 CPUs shared by four agents: run targeted vitest files, not the whole suite repeatedly.

BEFORE FINISHING: npx tsc -p tsconfig.json --noEmit and npx eslint <your files> clean; npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence.test.ts tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts <your tests> all pass; your e2e specs pass on phone-portrait, phone-landscape and desktop; no serious/critical axe violations on screens you touched (tests/e2e/helpers.ts expectNoSeriousA11yViolations); touch targets ≥ 48 px, text ≥ 16 px, 200 % text works. Put proposed decisions in your report as "PROPOSED DECISION: …". Final message: a plain report listing files created/changed, what each test proves, commands with results (paste the numbers), anything not done and why, FENCE notes, bugs found elsewhere, and proposed decisions.`

const VERIFY = (t, built) => `You are an adversarial verifier for Pixelmeba (/workspaces/pixelmeba; follow CLAUDE.md). Do NOT edit any repository file and do NOT run git add/commit/stash/checkout/reset. Other agents may still be editing. Scratch scripts go in /tmp. 2 CPUs: targeted commands. Playwright: E2E_PORT=${t.port + 5} E2E_OUTDIR=tmp/dist-verify-${t.key}, then stop only that port (lsof -t -i :${t.port + 5} | xargs -r kill).

A builder was given this assignment:
---
${t.prompt}
---
The builder reported:
---
${typeof built === 'string' ? built : JSON.stringify(built)}
---
Try to REFUTE that it is done correctly, completely and honestly. Re-run the key commands and compare numbers. Run tests/fixtures/g2-replay.test.ts and tests/fixtures/trajectory-fence.test.ts yourself. Read the diff (git status / git diff). Check every rule and number against the cited docs (quote the doc line when you claim a mismatch). Look for: vacuous tests or weaker proxies (would the test fail if the mechanism were deleted?); rules gated on a build constant instead of the world's manifest; determinism leaks (Math.random, Date, Map/Set/object-key iteration in src/sim, reused RNG streams, float order changed for existing species); unledgered material moves; dishonest copy; accessibility failures; edits outside ownership; non-additive edits to SHARED files (reformatting, removed lines); manifest or version-field edits the assignment did not allow; hard-coded stateHash literals. Return concrete problems with file:line and a repro, most severe first, each prefixed BLOCKER / MAJOR / MINOR; write "VERIFIED OK — <evidence>" for parts that hold. Set ok=false if any BLOCKER or MAJOR exists.`
```

VERDICT and `pipeline(...)` stay exactly as in `g2-wave-b.workflow.js.txt`.

---

## 4. Waves: paste-ready TASKS

### Wave 1: `g3-wave-1`

**`meta.description`:** "Phase 3 wave 1: world foundation (schema 3, links, food-object and sample stores, world gates), chemistry and habitats (P3.1, P3.2), stage 8 reservation framework (P3.7 core), organism art for the 14 Phase 3 species."

**STATE:** "Preflight (the Phase 3 determinism fence: g2 saves, trajectory digests, registryWith, trajectory helper) is committed on main."

```js
const TASKS = [
  {
    key: 'foundation',
    port: 4211,
    prompt: `ASSIGNMENT: the Phase 3 world foundation. This is the ONE schema bump of Phase 3: it adds inert state for every Phase 3 mechanism so later waves never touch the save format. Read SPEC §2.4–2.5, §3.4 (ledger compartments: finite food objects, the sample slot), §5.1, §6.1 (entity state list), §6.8 (death removes incident links, releases attached parasites), §7.4, §7.7, §9 (E04, E12), §9.19, §10.5, §14.1, §14.5, §15; CT §14; ARCH §5 (links Int32Array(6000×4), adhesion Int32Array(6000×2)), §11.3; D-0019; the existing src/sim/{entities,world,serialize,ledger}.ts, src/persistence/saveFile.ts, tests/persistence/migration.test.ts.
You own: src/sim/entities.ts, src/sim/world.ts, src/sim/serialize.ts, src/sim/ledger.ts, src/sim/links.ts (new), src/sim/objects.ts (new; store only), src/sim/sampleSlot.ts (new; store only), src/sim/gates.ts (new), tests/persistence/migration.test.ts, tests/sim/links.test.ts (new), tests/sim/world-stores.test.ts (new), tests/content/system-requirements.test.ts (new).
SHARED (additive): content/manifest.json (you alone this wave: buildPhase 2 → 3 and contentVersion +1; no ID changes), src/sim/content/registry.ts (system-requirement validation below), src/sim/content/implemented.ts (remove FILM_DIGESTION_IMPLEMENTED only after replacing every use with a world gate), src/sim/maintenance.ts (one call in the death path: removeAllLinks), src/sim/births.ts (daughters start with empty link slots), src/worker/snapshot.ts (replace the FILM_DIGESTION_IMPLEMENTED import with the world gate), src/persistence/saveFile.ts (import integrity for the new state), tests/helpers/world.ts (add helpers linkFungal, linkAdhesion, placeObject only).
Build:
(1) Schema 3 (current + 1 if Phase 2 already bumped; update the header comment). Append entity columns, never reorder, with explicit defaults: filmSeconds f64 (B02 continuous attached seconds), anchorState u8 (0 free, 1 anchored), anchorSeconds f64, anchorLockout f64, adhPartner u32 (birthId of the E12 pairing candidate), adhSeconds f64, adhLockout f64, waterCrossed u8 (P04). Store links as ARCH §5 describes: either columns (fLink0..3 i32 slot, fLinkB0..3 u32 birthId, fLinkKind0..3 u8 with 1 = visual (F01), 2 = transport (F02); aLink0..1 i32 + aLinkB0..1 u32) or two world tables of the same shape. Choose one and document it in the file header. Empty = -1 (add to NEG_ONE_DEFAULT). "No intake for 10 s" is derived from the existing lastIntakeTick; do not add a column for it.
src/sim/links.ts: addFungalLink(world,a,b,kind) (refuses a 5th link and returns false), removeFungalLink, fungalNeighbors(i) in link-index order, fungalDegree, addAdhesionLink/removeAdhesionLink (≤ 2), adhesionComponent(i) and fungalComponent(i) (BFS by ascending slot; member slots sorted), removeAllLinks(world,i) (both tables, both endpoints), linksValid(world) (symmetry, liveness, birthId match). A reference is valid only while alive[slot] && birthId[slot] === stored birthId.
(2) World stores: serialized in canonical order, included in stateHash, empty by default so every Phase 2 world is unchanged.
- world.objects: finite food objects, cap FOOD_OBJECT_CAP 128. Each is {id (counter), cell, kind 'pellet'|'wafer', pools {sugar?, starch?, protein?} carbon, n}. objects.ts provides createObject (refuses cap, an occupied cell, outside the mask, or a structure), removeObject, objectTotals. No release logic.
- world.sample: null or {txId, mode, origin [x,y], radius, rows [{slot, cols: Record<column, number>}] (full rows with their original slot), cells [{dx, dy, fields: Partial<Record<FieldId, number>>}], objects [], genomes needed by held rows}. sampleSlot.ts provides sampleTotals. No tool logic.
- ledger.computeTotals counts object C/N and sample C/N/M (breakdown keys objectsC, objectsN, sampleC, sampleN, sampleM), so a move into either store is balanced. Add an energy category 'construction' for stage 8 shared building.
(3) Migration: COLUMNS_ADDED_IN[3]; migrateWorldState fills new columns and stores by copy with explicit defaults. saveFile import refuses, with a readable message and no world built: more than 128 objects, an object outside the mask or on a structure, asymmetric or dangling links, fungal degree > 4, adhesion degree > 2, a sample row with an unknown species or genome.
(4) World gates: src/sim/gates.ts worldHasSystem(world, flag), worldHasSpecies(world, id), worldHasModule(world, id), reading only world.content.manifest. Replace FILM_DIGESTION_IMPLEMENTED, and any other build-level switch that changes behaviour, with worldHasSystem(world,'film').
(5) Registry: an enabled species, material or module needs the systems it uses; the error names both sides. BIOFILM → film; BRANCHING/TRANSPORT_LINKS → fungi; HOST_DRAIN → parasites; LYSIS or category virus → viruses; E_OIL/E_PROTEIN secretion and M01, M03–M05, M09 → enzymes; INH_* → chemistry; M10, M11 → foodObjects; module E10 → film.
(6) Manifest: buildPhase 3, contentVersion 2, nothing else.
Done when:
- g2-replay and trajectory-fence pass unchanged: the schema-2 g2 saves migrate by copy and continue bit-identically. Prove the fence is live by temporarily changing one constant in stage 7, pasting the failure, and reverting.
- tests/persistence/migration.test.ts covers schema 2 → 3 and 1 → 3 through loadSaveFile, with continuation equality over +500 ticks and the input left untouched.
- tests/sim/links.test.ts: add/remove is symmetric; the 5th fungal and 3rd adhesion link are refused; killing an entity removes its links from both endpoints in the same tick; a reused slot with a new birthId is never treated as linked; component walks are deterministic.
- tests/sim/world-stores.test.ts: moving 1 C + 0.1 N from a cell into an object or into the sample slot keeps checkLedger ok, while deleting it without an export breaks it (proves the stores are counted); serialize → deserialize → stateHash is equal with non-empty stores and links; each import refusal is tested.
- tests/content/system-requirements.test.ts: enabling B02 without 'film' fails with a message naming BIOFILM and film.
Use E2E_PORT=4211 E2E_OUTDIR=tmp/dist-foundation if you run e2e at all.`,
  },
  {
    key: 'environment',
    port: 4212,
    prompt: `ASSIGNMENT: BUILD_DIRECTIVE P3.1 "Chemistry and environment materials" and P3.2 "Habitat presets and substrate rules" end to end. Read SPEC §2.2, §4.1–4.5, §6.3, §10.3–10.4, §10.8; CT §2, §3.4, §5.1, §8.1, §12.2, §13; UX §2.3 (New Dish Basics), §4.4 (Chemistry and Habitat trays; "changes / does not change / watch for"), §5.1 (cell inspector), §5.7; D-0006, D-0008; R31; the existing src/sim/{transport,suitability,recipes,grid}.ts and the Lab tray built in P2.7.
You own: src/sim/transport.ts, src/sim/suitability.ts, src/sim/chemistry.ts (new: pH display, salinity index, exposure breakdown for the inspector), src/sim/attachment.ts (new: per-cell attachable-surface mask cached by grid.geometryVersion), content/habitats/GEL_COLONY.json and content/habitats/SEDIMENT_EDGE.json (new), tests/sim/chemistry.test.ts (new), tests/fixtures/habitat-presets.test.ts (new), tests/sim/attachment.test.ts (new), tests/e2e/chemistry-habitats.spec.ts (new).
SHARED (additive): content/manifest.json (enabledSystems += chemistry; enabledMaterials += ACID, BASE, BUFFER, CO2, INH_BACT, INH_FUNG, INH_PHOTO, METABOLITE, OIL, OXYGEN, PROTEIN, SALT, plus the Phase 2 paints if still missing; enabledHabitats += GEL_COLONY, SEDIMENT_EDGE), src/sim/movement.ts (canOccupy only), src/sim/commands.ts (only if inoculation needs the attachment check), src/sim/recipes.ts (only if a habitat op needs a new capability; prefer none), src/worker/{protocol,snapshot,host,client}.ts (cell inspector values; overlay ids 'salt', 'inhBact', 'inhFung', 'inhPhoto'), src/ui/panels/Inspector.tsx (cell lines), the P2.7 Lab tray files (src/ui/views/Lab*.tsx, src/ui/panels/LabTray*.tsx / Tray*.tsx, src/ui/strings/lab.ts; find them with git grep if named differently), src/ui/views/NewDish.tsx (habitat picker), src/ui/styles.css.
Build P3.1:
- Lab trays. The Chemistry tray lists every enabled chemistry material (nutrient, oxygen, CO2, acidifier, alkalizer, buffer, salt, three inhibitors; enzymes and breaker join in wave 3) with dose 0.02/0.10/0.50 per cell (chemistry default 0.10) and radius 1/3/6 (default 3). The Food tray adds oil, protein and metabolite. The Habitat tray gets a lid open/closed toggle through the existing setLid command, recorded as an intervention. Verify that P2.7's shade paint multiplies light by 0.1 and erase restores 1.0; add it if missing.
- Rules to verify (or implement) and test: deposits never diffuse; organic debris adds 0.10 N per C as detritusN; oxygen additions are not a conserved material (display only) while CO2 is carbon (a ledgered input); equal acid and base neutralize each tick (remove min(acid, base) from both); pH_display = clamp(7 + (base − acid)/(1 + buffer), 2, 12) with stored values never clamped; salinity index = salt amount (may exceed 1; tolerances use the actual value); salt diffuses and never decays; inhibitors lose 0.2 % per TICK and act only on their category (CT §3.4: bacterial B01–B13; fungal Y01, Y02, F01–F04; photosynthetic A01–A05; parasites, viruses and animals unaffected); exposure = Σ targeting amounts, × 0.5 once if the cell holds film (D-0008); growth × 1/(1 + exposure); damage 8 × exposure H/s; open lid exchanges 0.02 × difference per tick toward O2 0.8 / CO2 0.5 (sediment × 0.1); a closed lid exchanges nothing.
- The cell inspector shows substrate, pools, pH display, salinity, O2, light factors (baseline × shade) and inhibitor exposure by category.
- Content test: every enabled material whose only effect is its own field says "No additional modeled reaction." in guide.rules. Keep the list of exceptions (foods, enzymes) explicit in the test.
Build P3.2 (CT §8.1 exactly; unspecified fields 0; lid open; fixed light; moisture water 1.0, gel/sediment 0.8):
- GEL_COLONY: gel base; water channel x 59–68 for all y (rect op); no stones; light 0.5; warmth 0.5; O2 0.8; CO2 0.5; nutrient 0.10; sugar 0.10.
- SEDIMENT_EDGE: water for y < 64; sediment for y ≥ 64; stone disk r 13 at (45,43); light 0.8 over water / 0.15 over sediment; warmth 0.5; O2 0.8 water / 0.2 sediment; CO2 0.5; nutrient 0.10; detritus 0.10 C per sediment cell. PROPOSED DECISION: 0.010 bound N per sediment cell (the DEBRIS ratio).
- Attachment surfaces (SPEC §2.2, D-0006): gel cells, sediment cells, passable cells four-adjacent to stone ("stone edge"), porous bead cells; mesh arrives in Phase 5. An attached species (attachment !== null) may occupy, be inoculated into, be born into or be transferred to a cell only if the cell offers one of its listed surfaces. Open water without a surface is refused, and inoculation reports the rejected count.
- Habitat paint replaces substrate without deleting life, deposits or fields; newly unsuitable life responds only through ordinary suitability (test P2.7's paint).
- New Dish Basics gets a habitat picker (Water Garden, Gel Colony, Sediment Edge) with a small preview from habitatGrid(); the summary states exactly what is preloaded.
- To test attached species before B02 is enabled (wave 2), build its runtime from the record: buildSpeciesTable([registry().species.B02!]).
Done when:
- tests/sim/chemistry.test.ts: acid 0.30 + base 0.20 → 0.10 / 0 after one tick; pH at (acid, base, buffer) (0,0,0) = 7, (0,3,0) = 10, (0,6,0) = 12 (clamped, base still stored as 6), (2,0,1) = 6; salt Σ constant to 1e-12 over 1,000 ticks and never decays; each inhibitor × 0.998 per tick exactly; each inhibitor affects exactly its CT §3.4 targets across all 38 species records; film halves total exposure once; growth factor and the 8 × exposure damage; closed lid: exchangeC unchanged over 100 ticks; sediment exchange rate 0.1×; shade changes only light (× 0.1); every material input ledgered including companion N.
- tests/fixtures/habitat-presets.test.ts: for each preset, every playable cell's substrate, structure, light and fields equal CT §8.1 (count cells per class: channel columns, sediment rows, stone disk); moisture is 1.0 or 0.8; the initial ledger equals the preloaded totals; realization is deterministic. Suitability responds: A01 is 0 on gel; B02 (built from its record) is refused in open water and accepted on gel, sediment, a stone-edge water cell and a bead.
- tests/sim/attachment.test.ts: the stone-edge mask is exact before and after placing and erasing a stone (the cache invalidates).
- tests/e2e/chemistry-habitats.spec.ts: New Dish → Sediment Edge → Lab → Chemistry → Salt (dose 0.50, radius 3) paints while paused → tapping the cell shows salinity 0.50 and pH 7 → Acidifier then Buffer change the pH line as the formula says → the lid toggles closed and back; axe clean at each step.
Use E2E_PORT=4212 E2E_OUTDIR=tmp/dist-environment.`,
  },
  {
    key: 'stage8',
    port: 4213,
    prompt: `ASSIGNMENT: the stage 8 reservation framework. This is the core of P3.7, and P3.3 film, P3.6 producers and F02 transport, and the P3.7 modules all plug into it. Read SPEC §3.2 (stage 8 row), §3.3, §5.3, §7.1, §7.6, §7.7, §9 (E01, E09, E10), §9.19; docs/source/D04 §2 row C08 and §9 "Canonical resource and state resolution" (the reservation-order paragraph and the F02 paragraph); CT §12.6; the existing src/sim/structures.ts, dormancy.ts, phenotype.ts (StarchRules). If P2.7 put structure-placement helpers into structures.ts, leave them untouched.
You own: src/sim/structures.ts (stageStructures), src/sim/actions.ts (new), src/sim/construction.ts (new), src/sim/secretion.ts (new), tests/fixtures/shared-budget.test.ts (new), tests/sim/construction.test.ts (new), tests/sim/stage8-order.test.ts (new).
SHARED (additive): src/sim/phenotype.ts (Profile gains 'oil' and 'protein' producer rules shaped like StarchRules, null for every current species, and a 'builder' construction-rule slot, null), src/sim/constants.ts (FILM_CAP 0.50 and similar if missing), src/sim/moduleView.ts (only to keep inspector summaries compiling).
Build stage 8, per Active organism in ascending slot order:
(1) Mandatory transitions (dormancy, unchanged), then a "release invalid links/anchors" hook (no-op now; wave 4 fills it).
(2) Optional actions from a fixed, documented table. Native optional actions come first, ordered by action ID; use the index in the NativeAbility enum (src/sim/content/schema.ts) as the ID, so E_STARCH_SECRETION < E_OIL_SECRETION < E_PROTEIN_SECRETION < BIOFILM; document it. Module actions follow in ascending order, E01 … E12. Each action checks its conditions against the energy (and body carbon) REMAINING after earlier reservations this tick and reserves its full cost. Self-contained actions (secretion) commit immediately. Nothing is retried and no later action receives a refund.
(3) Shared construction (construction.ts). Building actions (B02 native film deposition in wave 2, E10 in wave 4) submit requests {slot, cell, bodyC, energyReserved, energyPerC}. After the per-organism pass, per cell: headroom = 0.50 − film(snapshot); if Σ bodyC > headroom, scale every request by headroom/Σ; move the accepted body C with the donor's proportional N (N × accepted / B) into film/filmN; charge energyPerC × accepted only; return the unused reservation. Everything reads one snapshot and commits together; the ledger is unchanged (internal move); spent energy is recorded under ledger.energy.construction (foundation adds the category; if it is not there yet, report it).
(4) Transport hook: export fungalTransportPass(world) (a no-op until wave 3) and call it after construction and before births.
(5) secretion.ts: one generic producer action (rules from the profile: emitRate, minEnergy, emitCost, localCap; substrate→activity pairs starch→eStarch, oil→eOil, protein→eProtein) that replaces the starch-only code with bit-identical results: same comparisons, same order, same float operations.
Done when:
- tests/fixtures/g2-replay.test.ts and tests/fixtures/trajectory-fence.test.ts pass unchanged (the restructure is hash-neutral: native B06 and E01 carriers behave bit-identically).
- tests/sim/stage8-order.test.ts proves the order with synthetic, test-only action registrations (not shipped content): mandatory costs come before optional ones, natives before modules, modules ascend, and an action refused because an earlier one reserved the energy reports its reason code.
- tests/fixtures/shared-budget.test.ts (C08, D04 §2): two registered test actions, each needing E > 35 and costing 0.04, on an organism with E = 35.05: the first fires, the second is refused; reversing their order refuses the other one; Σ energy spent in the tick = Σ ledger energy categories; no action ever sees energy another action reserved. Wave 4 extends this file with real modules.
- tests/sim/construction.test.ts: requests of 0.30 + 0.30 into a cell with film 0.10 are both scaled by 0.40/0.60; film ends at exactly 0.50; N moves proportionally; each builder is charged only for accepted carbon; unused reservation is returned; the ledger closes; the result does not depend on the slot order of equal requests.
Use E2E_PORT=4213 E2E_OUTDIR=tmp/dist-stage8 if you run e2e at all.`,
  },
  {
    key: 'art-organisms',
    port: 4214,
    prompt: `ASSIGNMENT: organism art for all 14 Phase 3 species, so later waves can enable them (content:validate refuses an enabled species without frames). Read UX §6.1 (palette: B02 teal #32A89A / #BFE9E1 · B03 violet #8B82C6 / #D9D4F2 · B05 blue #4A90C2 / tip #F2F7FB · B07 navy #2E4A7A / amber tip #E5A83B · B08 rose #D98CA6 / white bands · Y01 cream #F2E6C9 / burgundy bud #7A2E3F · Y02 ivory #F5EBD3 / orange bud #E6923A · F01 ivory #EFE3C6 / outline #4A3B2A / tips #E08A3C · F02 copper #B87333 / pulse #F6D7B0 · P02 cyan #7FD6E8 / white cilia · P03 peach #F3B48E / crown #C97A4E · P04 brown #8A5A3C / pale head #E8D3BD · X01 gold diamond #E3C15A · V01 glyph #3E7BC4), §6.2 (frame sizes and counts, 2 px padding, no runtime rotation or blur), §6.3 (silhouettes: B02 paired dots in textured colonies · B03 curved rod · B05 comma with contrasting tip · B07 curved rod with amber tip · B08 capsule with two white bands · Y01 oval with bud · Y02 pear with bud · F01 branching threads, dark outline, orange tips · F02 copper threads with pulse on transfer · P02 slender body with short cilia · P03 body with feeding crown · P04 segmented worm with pale head · X01 gold diamond outline · V01 head-and-tail glyph), ARCH §10.1 (fungi: 16 connection-mask tiles + tip, bud, decaying; viruses: inspection glyph + density overlay only); CT §1.3 (16×16 bacteria/yeast/parasites; 32×32 P02–P04); each record's frameSize, headings and assetId; the existing art/src/**, tools/art-build.ts, tools/content-validate.ts checkAtlas.
You own: art/src/** (new sprite files, palette constants, index registration), public/atlas/** (only via npm run art:build), tools/art-build.ts, tools/art-preview.ts, tools/asset-preview.{html,ts}, tools/content-validate.ts (atlas section only), tests/content/atlas.test.ts, tests/content/silhouettes.test.ts (new).
SHARED: none. Do NOT enable any species in the manifest.
Build:
- Small 16×16 sprites: 4 move-or-idle, 4 reproduction, 2 stress and 3 death frames per heading. Non-motile B02, Y01, Y02 and X01 loop "idle". B03, B05, B07 and B08 have 4 headings (hand-authored, or variants derived at build time; never runtime rotation); B02, Y01, Y02 and X01 have 1.
- Large sprites: P02, P03, P04 are 32×32 with 4 headings: 6 move, 4 feed, 4 reproduction, 2 stress, 4 death.
- Fungi: F01 and F02 each get 16 connection-mask tiles (bit order N=1, E=2, S=4, W=8; document it, because wave 2 sends this mask), tip, bud and decaying frames, plus a small thumbnail for Add Life.
- V01: one 16×16 inspection glyph plus a thumbnail.
- Extend checkAtlas's requirement table, keeping it independent of art/src: 'small' and 'large' as now, 'fungus' = 16 masks + tip/bud/decaying + thumb, 'virus' = glyph + thumb. Keep the P1.4 checks.
- Output stays deterministic.
Done when:
- npm run art:build twice gives the same export hash, and tools/art-build.ts --check passes.
- tests/content/atlas.test.ts: checkAtlas(atlas, <every Phase 1–3 species record, regardless of the manifest>) reports no issues; removing one required frame of each kind (small, large, fungus, virus) gives a precise error naming sprite, animation, heading and frame.
- tests/content/silhouettes.test.ts (UX §6.1, "distinguishable by silhouette and pattern in grayscale"): for every pair of same-size species, the alpha masks of loop frame 0 differ in ≥ 12 % of the union pixels, and their grayscale luminance patterns differ.
- tools/asset-preview shows every new frame with grayscale and CVD views.
- content:validate still passes with no species enabled.
Use E2E_PORT=4214 E2E_OUTDIR=tmp/dist-art if you run e2e at all.`,
  },
]
```

**Lead after W1:**
- Integrate, record decisions, then run `content:validate --write`, `art:build --check`, `npm run check` and full Playwright.
- Tick P3.1 and P3.2. Mark P3.7 `[~]` ("stage 8 framework").

### Wave 2: `g3-wave-2`

**STATE:** "Preflight and wave 1 (schema 3 with links and food-object/sample stores and world gates; chemistry + habitats + attachment surfaces; stage 8 reservation framework with construction and transport hooks; organism art for all 14 Phase 3 species) are committed on main."

```js
const TASKS = [
  {
    key: 'film-fungi',
    port: 4221,
    prompt: `ASSIGNMENT: BUILD_DIRECTIVE P3.3 part 1: B02 Velvet (biofilm) and F01 Threadlace (fungal branching). Read SPEC §2.2, §4.1, §4.3, §6.5, §6.9 step 2, §7.1, §7.2; CT §1 rows B02/F01 (B02: B0 1, Q 0.12, M 0.35, min division 20 s, max age 900 s, sugar then protein; F01: B0 2, Q 0.20, M 0.40, 30 s, 1200 s, detritus, starch, protein, +film), §1.3, §3.1, §3.5, §12.6 (film numbers), §13 (film decay 0.1 %/s → detritus), §14 (fungal ≤ 2,000); UX §6.2, §7.2; D-0002, D-0006; wave 1's src/sim/{construction,actions,links,gates,attachment}.ts.
You own: src/sim/film.ts (new), src/sim/fungi.ts (new), src/sim/births.ts, src/sim/transport.ts, tests/fixtures/film.test.ts (new), tests/fixtures/fungal-branching.test.ts (new), tests/fixtures/relationships-film.test.ts (new).
SHARED (additive): content/manifest.json (enabledSpecies += B02, F01; enabledSystems += film, fungi), src/sim/content/implemented.ts (BIOFILM, BRANCHING), src/sim/intake.ts (film as a food; parasites-phage owns intake.ts this wave), src/sim/{construction,actions,phenotype}.ts (register the native BIOFILM action), src/sim/history.ts and src/worker/snapshot.ts (fungal population as segment count and connected components separately; film per cell; the E_LINKMASK value from the link table using art-features' constant names in src/worker/protocol.ts).
Build B02 (SPEC §7.1, CT §12.6):
- Attached on gel, sediment, stone edge or bead (mesh in Phase 5). filmSeconds counts continuous attached Active seconds.
- After 10 s with E > 40, it requests 0.05 × dt body C per tick (with proportional N) into its cell's film through the shared construction pass, only while B > B0' (never taking B below B0'), capped by headroom 0.50 − film, which is shared proportionally with other builders.
- Film halves dissolved transport across every edge of its cell (exists: verify all four edges) and halves combined inhibitor exposure once (exists).
- Film loses 0.1 % of its C and N per second into detritus/detritusN. Add this in stage 2; it is exact and ledger-neutral.
- Film is edible "as detritus" by digestsFilm species (B04, F01). It is an extra field food read from 'film'/'filmN' through the normal allocation. PROPOSED DECISION: in the ordered policy it comes after the species' listed foods; in the weighted policy it is one more food under the ordinary rules. Film has no owner and is not an organism.
- B02 is prey for P01 and P04, never P02 (P02 requires 'free'; P02 lands this wave, so test it via registryWith).
Build F01 (SPEC §7.2):
- Attached on gel, sediment or bead.
- Reproduction places the daughter on a free (no other fungal segment) attachable four-neighbor cell, ranked by usable food (sum of compatible pools present) descending, then suitability descending, then the fixed order E, S, W, N. Never the parent cell and never a diagonal. PROPOSED DECISION: the 16 connection-mask tiles define a four-neighbor topology.
- Parent and daughter get a visual link (kind 1, carries nothing).
- Segments count against the 6,000 cap and the 2,000 fungal subcap. At the subcap, births are blocked with DIV_BLOCK_CAPACITY and the capacity-limited flag; nothing is killed.
- Killing a segment removes its links (removeAllLinks from wave 1).
- Population reports segments and connected components separately.
Done when:
- tests/fixtures/film.test.ts: one B02 on gel with B 1.5 and E 60 deposits nothing for the first 100 ticks, then exactly 0.005 C per tick with N moved at N/B; it stops exactly at B = B0' and at film 0.50. Two B02 in one cell share headroom proportionally and film never exceeds 0.50. E ≤ 40 blocks deposition. Decay to detritus is exact over 1,000 ticks, including N. Transport across each of the four edges of a film cell is halved (a pulse with vs without film). Inhibitor exposure is halved once. B04 and F01 eat film: the film pool falls by exactly what they took and the ledger closes.
- tests/fixtures/fungal-branching.test.ts: placement follows usable food, then suitability, then E,S,W,N. A daughter never lands in open water, on a diagonal, in the parent cell or in a cell holding a fungal segment. Blocked placement keeps the proposal (DIV_BLOCK_PLACEMENT) at no cost. The 2,000 subcap blocks births without deaths. Killing a segment removes its links. Connection masks equal the link table.
- tests/fixtures/relationships-film.test.ts: P01 eats B02; B02 eats sugar, then protein (ordered); F01 eats detritus, starch, protein and film.
- A 10,000-tick closed-lid run with B02 + F01 + B04 on gel closes the ledger to < 1e-5.
- Fence unchanged.
Use E2E_PORT=4221 E2E_OUTDIR=tmp/dist-film-fungi if you run e2e.`,
  },
  {
    key: 'organisms',
    port: 4222,
    prompt: `ASSIGNMENT: BUILD_DIRECTIVE P3.3 part 2 (B03 Dusk, B05 Crossfeeder, Y01 Bubble) and P3.4 part 1 (P02 Ciliate, P03 Rotifer, P04 Siltworm). Read SPEC §6.3 (Dusk special factor), §6.4 (P04 crossing), §6.5 (anaerobic conversion), §7.3 (hunting: E < 80, meal < 0.5 B0', contact 0.5 cells, meal cap 2 B0'); CT §1.1–1.3 rows, §2 (Dusk group pH 5.5–7.5, warmth 0.35–0.70, salinity 0–0.25; yeast/fungi group pH 4.5–7, warmth 0.30–0.65, salinity 0–0.25), §3.1, §3.2 (prey lists), §12.3, §12.5; D-0007; R28 (transport classes); UX §4.3 (Add Life tiles: silhouette + diet symbol + name).
You own: src/sim/movement.ts, src/sim/crossing.ts (new), src/ui/panels/AddLifeSheet.tsx, tests/fixtures/predation-matrix.test.ts (new), tests/fixtures/dusk-suitability.test.ts (new), tests/fixtures/relationships-w2.test.ts (new), tests/sim/siltworm-crossing.test.ts (new).
SHARED (additive): content/manifest.json (enabledSpecies += B03, B05, P02, P03, P04, Y01), src/sim/content/implemented.ts (OXYGEN_SUPPRESSED, SEDIMENT_WATER_CROSSING and whatever else these records list), src/sim/contacts.ts (only if a prey requirement is missing; parasites-phage owns it), src/sim/intake.ts (verify only), src/ui/strings/reasons.ts.
Build:
- B03: anaerobic (no O2 debit, 18 E per C); suitability × clamp(1 − O2/0.40, 0, 1) with reason SUIT_OXYGEN_HIGH (exists in suitability.ts; verify); speed 0.25; sense 2.
- B05: eats metabolite only.
- Y01: B0 2, Q 0.22, M 0.40; anaerobic, 18 E per C; emits +0.20 acid equivalent per consumed C (verify intake); no self-propulsion; water/gel; Medium class.
- P02: B0 3, Q 0.65, M 1.00, speed 2.0, sense 5, cooldown 2 s. Prey: B01, B03, B04, B05, free B06–B12, A01, A03, A04; never attached B02.
- P03: B0 8, Q 1.00, M 1.10, speed 0.7, sense 3, cooldown 4 s. Prey: A01–A04, Y01, Y02.
- P04: B0 8, Q 0.90, M 1.00, speed 0.8, sense 4, cooldown 3 s, Large, lives in sediment. Prey: B01–B05 anywhere; B06–B13 only while the prey is in sediment.
- SEDIMENT_WATER_CROSSING (D-0007): P04 may enter up to two consecutive water cells from sediment. Those cells count as habitat-compatible while crossing (no suitability damage); it turns back before a third. waterCrossed resets when it re-enters sediment.
- Add Life: replace the hard-coded DIETS map with a diet line derived from each record (metabolism + foodPriority + prey/hosts). Show V01 as a phage tile whose count means units per cell (1/5/20); the command semantics belong to parasites-phage.
Done when:
- predation-matrix: for every predator enabled after this wave × every enabled species (use registryWith to include B02, F01 and X01 from the other builders; allowUnimplemented only for abilities they are implementing now), a hand-built contact (prey center at 0.3 cells, predator hungry, cooldown 0) captures iff CT §3.2 allows it. This includes P02 vs attached B02 = never, P04 vs B06 in water = never and in sediment = yes, and P03 vs B01 = never. Outcomes are deterministic.
- siltworm crossing: crosses 1 and 2 water cells, never a 3rd, with no SUIT_HABITAT damage while crossing.
- dusk-suitability: the factor is exactly 1, 0.75, 0.5 and 0 at O2 0, 0.1, 0.2 and ≥ 0.4, with SUIT_OXYGEN_HIGH. In a closed-lid dish (20 B01 + 20 B03 at (50,70), sugar 0.50, nutrient 0.20 per cell) O2 falls, B01 records OXYGEN_LIMITED and B03's suitability rises.
- relationships-w2: B05 grows only when metabolite is present and only from metabolite. Y01 adds exactly 0.20 acid per consumed C and the cell's pH follows the formula. B03 and Y01 earn 18 E per C and consume no O2.
- A unit test covers the Add Life diet derivation.
- Fence unchanged.
Use E2E_PORT=4222 E2E_OUTDIR=tmp/dist-organisms.`,
  },
  {
    key: 'parasites-phage',
    port: 4223,
    prompt: `ASSIGNMENT: BUILD_DIRECTIVE P3.4 part 2: X01 Hitcher (parasite), V01 Pinphage (viral-unit field) and phage doses. Read SPEC §6.5 (host-drain conversion), §6.8, §6.9 (infected hosts cannot divide), §7.4, §7.5, §10.2 (phage doses 1/5/20 units per cell), §12.2 (INFECTED, PARASITIZED, DEATH_LYSIS, DEATH_PARASITE_DRAIN); CT §1 rows X01 (B0 0.2, drain 0.02 C/s, M 0.15, min division 30 s, max age 300 s, speed 0.4 free, sense 3, water) and V01 (0.01 C per unit, decay 1 %/s), §3.3, §12.5; docs/source/D01 "Host specificity" acceptance (~line 476).
You own: src/sim/contacts.ts, src/sim/intake.ts, src/sim/maintenance.ts, src/sim/parasites.ts (new), src/sim/viruses.ts (new), tests/fixtures/host-specificity.test.ts (new), tests/fixtures/parasite.test.ts (new), tests/fixtures/phage.test.ts (new).
SHARED (additive): content/manifest.json (enabledSpecies += V01, X01; enabledSystems += parasites, viruses), src/sim/content/implemented.ts (HOST_DRAIN, LYSIS), src/sim/movement.ts (a free X01 seeks a host within sensing 3; an attached parasite moves with its host at no cost), src/sim/births.ts (the retained daughter keeps the parasite; DIV_BLOCK_INFECTED; a dividing parasite releases its offspring free), src/sim/commands.ts (inoculating V01 adds units to the v01 field: count 1/5/20 = units per footprint cell, ledgered as a 0.01 C-per-unit external input; no entities), src/worker/{snapshot,protocol}.ts (CUE2_INFECTED and CUE2_PARASITIZED per entity, using art-features' constant names and values; if they are not in protocol.ts yet, add exactly those lines after re-reading; infection overlay = the v01 field), src/ui/panels/Inspector.tsx and src/ui/strings/reasons.ts ("Infected by Pinphage; lysis in {t}s", "Hitcher draining 0.02 C/s").
Build X01 (SPEC §7.4):
- A free parasite cannot feed and pays maintenance 0.15 E/s.
- It attaches in stage 5 on contact (centers ≤ 0.5 cells): one parasite per host, only to listed host ancestors (A01). Competing claims resolve by det(seed,'contact',tick,KIND_PARASITE,birthId), a new KIND constant on the same stream.
- In stage 6 the drain is reserved first: min(0.02 × dt, host B) with proportional N. The split is 50 % to parasite biomass, 30 % CO2 and 20 % metabolite, +30 E per C, with no O2 debit; unused bound N returns to the cell.
- A host below 0.25 × B0' dies through the ordinary rules with cause DEATH_PARASITE_DRAIN.
- Host death or host rest releases the parasite alive where it is. On host division the retained daughter keeps it. A dividing parasite releases its offspring free.
- The pair moves in the host's transport class.
Build V01 (SPEC §7.5):
- The units field (0.01 C each) diffuses normally and decays 1 %/s into detritus C with no N (exists).
- For each susceptible host each tick, p = 1 − exp(−0.05 × units × dt) using the units in the host's cell, drawn with detFloat(seed,'infect',tick,birthId).
- Infection needs ≥ 1 whole unit in that cell and consumes exactly 1 unit. PROPOSED DECISION: that unit's 0.01 C joins the host's biomass, with no N.
- One infection per host. Infected hosts feed but cannot divide (DIV_BLOCK_INFECTED) or heal.
- 20 s later, lysis runs in stage 7 before ordinary death: floor(0.40 × B / 0.01) whole units go into the host cell; the remaining B, all bound N and any meal go to detritus/detritusN; the host is removed with DEATH_LYSIS.
- The only host is B01 (hostIds, ancestor-based).
Done when:
- host-specificity (D01 acceptance): a dense dish with every enabled species and 5 units per cell, run 600 ticks, infects nothing but B01. X01 placed in contact with every other species never attaches. With no host present, units only decay (no replication) and the ledger closes. Fewer than 1 unit in a cell never infects.
- parasite: drain is exactly 0.002 C per tick with proportional N, the 50/30/20 split and +30 E per C; the host dies below 0.25 B0' with DEATH_PARASITE_DRAIN; the parasite is released alive on host death and on host rest (use an E03 carrier); the retained-daughter rule holds; parasite offspring are released free.
- phage: for a fixed seed, each draw and threshold matches the formula over 1,000 host-ticks; lysis happens exactly 200 ticks after infection; units = floor(0.40 B / 0.01); the remainder and N go to detritus. A closed-lid 10,000-tick run with B01 + V01 closes the ledger < 1e-5 and records ≥ 1 lysis.
- Fence unchanged.
Use E2E_PORT=4223 E2E_OUTDIR=tmp/dist-parasites if you run e2e.`,
  },
  {
    key: 'art-features',
    port: 4224,
    prompt: `ASSIGNMENT: render Phase 3 truthfully from snapshot data only (ARCH §3: src/render imports snapshot types and the atlas manifest, nothing else): film, fungal networks and links, infection, parasites, food objects, new deposits and every Phase 3 module feature layer. Read UX §6.2 (film isolated/edge/center/eroding; feature layers protein notches, anchor foot, debris granule, shade patch, light-seeker trailing pixels, matrix edge texture, link pixels, infection glyph; at most two feature cues at normal zoom), §6.5 (oil sheen, protein motes, food-object outlines that shrink with inventory, fungal link pulse ≤ 1/s, phage burst), §7.1–7.4 (flags, layer order, reduced-motion table), SPEC §9 visual lines for E04, E06–E10, E12; ARCH §8–§10.1; D-0016; the wave C atlas feature-layer pipeline (art/src/layers/modules.ts, src/render/features.ts).
You own: art/src/**, public/atlas/** (via npm run art:build), tools/art-build.ts, tools/asset-preview.{html,ts}, tools/content-validate.ts (atlas section), src/render/**, src/worker/protocol.ts (owner this wave: bump PROTOCOL_VERSION once; ENT_STRIDE 12 → 14 with E_CUE2 and E_LINKMASK), tests/content/atlas.test.ts, tests/render/**, tests/worker/protocol.test.ts.
SHARED (additive): src/worker/snapshot.ts (pack the new fields from world state: link tables → E_LINKMASK, infection/parasite columns → CUE2 bits, world.objects → objects list, film/oil/protein → deposit bands), src/ui/atlas.ts.
Exact constants (other builders use these names):
- E_CUE2 bits: CUE2_INFECTED=1, CUE2_PARASITIZED=2, CUE2_ANCHORED=4, CUE2_LINKED=8, CUE2_MOD_E04=16, CUE2_MOD_E06=32, CUE2_MOD_E07=64, CUE2_MOD_E08=128, CUE2_MOD_E09=256, CUE2_MOD_E10=512, CUE2_MOD_E12=1024, CUE2_SEEKING_LIGHT=2048 (E07 moved this tick), CUE2_DETRITUS_INTAKE=4096 (E08 recorded detritus intake this second), CUE2_RELEASING_PROTEIN=8192.
- E_LINKMASK: low 4 bits are fungal links N=1, E=2, S=4, W=8; bit 4 = a transport transfer happened this second (the pulse, ≤ 1/s).
- Snapshot 'links' is a Float32Array of [x1,y1,x2,y2,kind] for adhesion links (kind 3); fungal links are drawn from masks.
- Snapshot 'objects' is [{id, x, y, kind, fill 0–1}]; 'stains' come from objectEmptied events (cosmetic and fading; never read by the sim).
- Deposit bands cover film, oil and protein.
Build:
- Film textures (isolated/edge/center/eroding), chosen from the four-neighbor film mask, with opacity by film carbon band.
- Fungal tiles chosen by mask, with tip/bud/decaying frames (dying flag). F02 pulses only when bit 4 is set.
- Adhesion link pixels drawn between member positions.
- The infection glyph shows only on inspected hosts or with the infection overlay on. A parasite is drawn at its host.
- Food objects with 4 fill steps and a fading stain. Oil-sheen and protein-mote deposit glyphs.
- Module feature frames: E04 foot only while anchored; E06 broader dark interior patch; E07 two trailing pixels only while moving; E08 granular mark that pulses only on recorded detritus intake; E09 paired notches with brief pale marks only while releasing; E10 edge film texture by film carbon; E12 link pixels.
- At most two feature cues at normal zoom; the rest show on selection.
- Reduced-motion alternatives per UX §7.4: static link with a dot, static bright center, no trails and no particles.
- Nothing is drawn that the snapshot does not report.
Done when:
- tests/render/**: every bit maps to exactly one layer and is absent when the bit is 0 (no pulse without bit 4, no foot without CUE2_ANCHORED, no glyph without infection); reduced-motion variants are chosen when the setting is on; the cue priority keeps ≤ 2 cues at normal zoom.
- tests/worker/protocol.test.ts: the version bump; stride 14; a snapshot of a hand-built world (film cells, a linked F01 pair, an infected B01, an X01 on an A01, a pellet) decodes to the expected masks, bits and objects.
- npm run art:build twice gives the same hash and --check passes; atlas completeness covers the new frames with precise errors.
- grep proves src/render imports nothing from src/sim or art/src.
- The asset preview shows every new frame.
Use E2E_PORT=4224 E2E_OUTDIR=tmp/dist-art-features.`,
  },
]
```

**Lead after W2:** tick P3.3 and P3.4.

### Wave 3: `g3-wave-3`

**STATE:** "…and wave 2 (B02 film, F01 branching, B03, B05, Y01, P02, P03, P04, X01, V01, phage doses; Phase 3 render layers and protocol v2) are committed on main."

```js
const TASKS = [
  {
    key: 'e1-producers',
    port: 4231,
    prompt: `ASSIGNMENT: BUILD_DIRECTIVE P3.6 part 1: B07 Oilwick, B08 Brothmaker, Y02 Creambud; native E_OIL/E_PROTEIN secretion; broth with companion N; breaker; materials M01, M03, M04, M05, M09; producer movement scoring; the inspector reaction ledger; the food-access overlay; experiments E201–E204. Read SPEC §5.3, §6.4 (producers B06–B08 score F = max(usableFood, 0.5 × convertibleSubstrate) while E > 35), §12.1; CT §1 rows B07 (B0 1, Q 0.12, M 0.38, 22 s, 800 s, metabolite), B08 (B0 1, Q 0.13, M 0.40, 20 s, 800 s, broth), Y02 (B0 2, Q 0.20, M 0.40, 30 s, 1000 s, aerobic broth, non-motile, water/gel); §3.1, §5.2, §10.3 (E201–E204 exact setups), §12.6, §13; docs/source/D02 lines ~50, 85, 100; D-0022 and docs/reports/experiments-g2.md (experiment conventions); wave 1's src/sim/{secretion,actions}.ts; src/sim/conversion.ts (oil/protein/breaker already exist).
You own: src/sim/secretion.ts, src/sim/reactions.ts (new: reaction ledger view), src/ui/panels/ReactionLedger*.tsx (new), src/ui/strings/reactions.ts (new), content/recipes/SHARED_LUNCH_V1.json, OIL_NEIGHBORHOOD_V1.json, PROTEIN_CHAIN_V1.json (new), content/experiments/EXP_201.json … EXP_204.json (new), tests/fixtures/producers.test.ts (new), tests/experiments/e201-e204.test.ts (new), tests/e2e/reactions.spec.ts (new).
SHARED (additive): content/manifest.json (enabledSpecies += B07, B08, Y02; enabledMaterials += M01, M03, M04, M05, M09), src/sim/content/implemented.ts (E_OIL_SECRETION, E_PROTEIN_SECRETION), src/sim/phenotype.ts (native oil/protein producer rules from CT constants), src/sim/actions.ts, src/sim/movement.ts (generalize the producer term for every producer rule the profile carries; B06's result must stay bit-identical), src/sim/content/schema.ts and src/sim/experiments.ts (a new change kind 'omitFounders' {founderIndex} for E203's paired arm, and grammar additions such as converted.oil, consumed.broth, intake.<species>.<food>), src/worker/{protocol,snapshot,host,client}.ts (reaction ledger payload; overlay 'foodAccess'), the P2.7 overlay picker (src/ui/panels/Overlay*.tsx), src/ui/panels/Inspector.tsx, the Lab tray files (Food: broth; Chemistry: starch/lipid/protein enzymes and breaker), tests/fixtures/fence.json (only via tools/fence-update.ts --add for your recipes).
Build:
- Natives: B07 is an E_OIL producer (oil → metabolite; oil's N is released free, the existing rule); B08 is an E_PROTEIN producer (protein → broth + brothN).
- Emission: 0.02 activity/s into the producer's cell while Active, E > 35 (stage 8, after maintenance), a compatible deposit in its cell or a four-neighbor cell, local activity < 1.0; cost 0.40 E/s.
- Enzymes diffuse at half the coefficient and lose 2 %/s; breaker diffuses normally and loses 1 %/s.
- Conversion per enzyme and cell: min(substrate, 0.10 × activity/(1 + breaker) × dt), from pre-reaction pools; products are usable in stage 6 of the same tick; no chaining.
- Materials: M01 broth 0.02/0.10/0.50 C per cell with 0.10 N per C; M03/M04/M05 at 0.1/0.5/1.0 activity; M09 breaker at 0.1/0.5/1.0.
- Reaction ledger (cell inspector and Lab), per enzyme in the cell and the dish: activity, substrate present, converted in the last second, product made, bound N moved, cumulative total (world.conversionTotals). Producer credit only with provenance: "Made here by …" only if the producer is in the cell or a four-neighbor cell; otherwise "Enzyme present".
- Food-access overlay. PROPOSED DECISION: per cell, the carbon of pools the selected organism's species can eat now; with no selection, the carbon enzymes made accessible in the last second. Legend low → high; observation only.
Experiments (CT §10.3: seed = the numeric id; Water Garden without stones; fixed light 0.8; open lid; radius-6 patches; Standard preset; Identical founders; nearest-first placement as in D-0022):
- EXP_201 Shared lunch: (45,64), 20 B06 + 20 B01, starch 0.50, nutrient 0.20. Gate: starch converted ≥ 1 C and B01 sugar consumption ≥ 0.5.
- EXP_202 Oil neighborhood: (64,64), 20 B07 + 20 B05, oil 0.50, nutrient 0.20. Gate: oil converted ≥ 1 C, and metabolite intake by both B07 and B05 > 0.
- EXP_203 Protein chain: (64,64), 20 B08 + 10 Y02, protein 0.50 with N 0.05. Gate: broth made > 0 and Y02 broth intake > 0. The paired arm omits the B08 founders and shows zero broth.
- EXP_204 Broken catalyst: E201 paired, arm B gets M09 = 4 per patch cell at 0 s. Compare starch converted at 120 s (B < A).
- Every card has a question, recipe, intervention, predicted tradeoff, measurements, stopping point, confounds and journal stamp.
Done when:
- tests/fixtures/producers.test.ts: each native producer pays exactly 0.40 × dt on each emitting tick and nothing otherwise. Each blocking condition (E ≤ 35, no substrate within the four-neighborhood, local activity ≥ 1.0, not Active) gives its reason code. Each enzyme conserves C and N to 1e-12. Breaker 1.0 halves conversion. Decay and diffusion rates are exact. B06's secretion and movement are bit-identical (fence green).
- tests/experiments/e201-e204.test.ts reach their gates on the nominated content version, or record the measured limiting factor (never change mechanics or constants to force a gate). Add an "E201–E204 (G3)" section to docs/reports/experiments-g2.md.
- tests/e2e/reactions.spec.ts: open the Protein chain card from Notebook → Experiments (or New Dish) → run at 4× → tap a patch cell → the reaction ledger shows protein converted and broth made → the "Food access" overlay toggles with its legend; axe clean.
Use E2E_PORT=4231 E2E_OUTDIR=tmp/dist-e1.`,
  },
  {
    key: 'f02-links',
    port: 4232,
    prompt: `ASSIGNMENT: BUILD_DIRECTIVE P3.6 part 2: F02 Cordweaver, its explicit fungal transport links and the one simultaneous transport pass, proven by E212 with an exact ledger. Read SPEC §6.9, §7.2, §7.7 (every word), §9.19 ("F02 links follow branching rules"), §3.2 stage 8 row ("then F02 transport pass … one pass each"); CT §1 row F02 (B0 2, Q 0.18, M 0.40, min division 35 s, max age 1400 s, eats sugar and detritus, native E_STARCH, attached on gel/sediment/bead), §10.3 row E212, §12.6 (F02 transport); docs/source/D04 §9 last two paragraphs (post-construction pools; adhesion links are not fungal links); src/sim/{fungi,links,structures,construction}.ts.
You own: src/sim/fungalTransport.ts (new), src/sim/fungi.ts, src/sim/births.ts, tests/fixtures/fungal-transport.test.ts (new; E212), tests/sim/fungal-links.test.ts (new).
SHARED (additive): content/manifest.json (enabledSpecies += F02), src/sim/content/implemented.ts (TRANSPORT_LINKS), src/sim/structures.ts (one line: call your pass in the existing hook), src/worker/snapshot.ts (E_LINKMASK bit 4 when a segment sent or received this second), src/sim/history.ts (per-second transfer totals; observation only), src/ui/panels/Inspector.tsx (e.g. "Sent 0.12 C to 2 neighbors in the last 10 s").
Build:
- Links: a link forms only between an F02 parent and its F02 daughter, placed on a four-neighbor cell at branching, and only if both have degree < 4. Otherwise the daughter is placed unlinked, and its birth record says so. Links are undirected (link table kind 2). Only living F02 links carry anything. Removing a segment breaks its links. Crossing threads never connect.
- Transport pass (stage 8, after optional construction, before births), reading ONE snapshot of post-construction B and N:
  - For every link (a,b), in canonical order (lower slot first), the donor is the end with more B.
  - The edge is active iff donor B > B0', receiver B < 1.5 B0', and B_donor − B_receiver ≥ 0.01 B0'.
  - Edge request r = min(0.02 × dt, (B_donor − B_receiver)/2).
  - Scale all of a donor's outgoing requests by min(1, (B_donor − B0') / Σout); then scale all of a receiver's incoming requests by min(1, (1.5 B0' − B_receiver) / Σin). PROPOSED DECISION: donor cap first, receiver cap second, no re-offer.
  - Commit all edges together: carbon plus proportional N (donor N × r / B_donor, from the snapshot). No energy moves. The ledger is unchanged (internal).
  - A segment may send and receive in the same pass; carbon it receives relays only on later ticks. Degree ≤ 4.
- Events: link formed and link broken.
Done when:
- tests/fixtures/fungal-transport.test.ts (E212): a gel dish with four F02 at (60,64)…(63,64) chained with linkFungal; B = 4, 2, 2, 2; N = 0.10 B; E = 50; H = 100; no food; Fixed Traits.
  - For 100 ticks, the per-tick, per-edge transfers equal an oracle written in the test from the SPEC text alone (not calling sim code) to 1e-12.
  - Σ B and Σ N of the chain are constant each tick to 1e-12, and the ledger closes.
  - Each segment's energy equals that of a copy with the links removed (no energy moves).
  - Segment 3 receives nothing on tick 1 (no relay).
  - A star donor with four receivers never sends more than B − B0'; a receiver with four donors never exceeds 1.5 B0'.
  - Killing segment 2 mid-run stops flow across both of its links in the same tick. A 5th link is impossible.
  - Save/reload at tick 50 gives the identical hash at tick 100.
- tests/sim/fungal-links.test.ts: links form at branching (four-neighbor only, degree cap; visual kind for F01, transport kind for F02) and are removed on death.
- Fence unchanged.
Use E2E_PORT=4232 E2E_OUTDIR=tmp/dist-f02 if you run e2e.`,
  },
  {
    key: 'food-objects',
    port: 4233,
    prompt: `ASSIGNMENT: BUILD_DIRECTIVE P3.6 part 3: finite food objects, M10 Slow feeder pellet and M11 Leaf wafer. Read SPEC §2.4, §3.2 stage 3 row, §3.4, §5.1; CT §5.2 rows M10/M11, §14 (128 objects); UX §6.5 (outlines shrink; stain); wave 1's src/sim/objects.ts store; src/sim/conversion.ts.
You own: src/sim/objects.ts, src/sim/conversion.ts, tests/fixtures/food-objects.test.ts (new), tests/e2e/food-objects.spec.ts (new).
SHARED (additive): content/manifest.json (enabledMaterials += M10, M11; enabledSystems += foodObjects), src/sim/commands.ts (tools-sample owns it this wave: add only the kind 'placeObject' {materialId, x, y}, plus a refusal of structure placement onto an object cell), src/worker/{protocol,snapshot,host,client}.ts, the Lab Food tray. The Explore Feed stays Sugar/Starch/Debris/Nutrient (UX §4.3).
Build:
- Placement: one object per cell, refused on occupied cells, structures or outside the mask, and refused at the 128 cap with "The dish holds up to 128 food objects". Creation is an external ledger input: a pellet is 10 sugar C + 1 N; a wafer is 6 starch C + 4 protein C + 1 N.
- Stage 3, before enzymes:
  - A pellet releases 0.02 C/s × dt of sugar with proportional N into sugar/sugarN of its cell.
  - A wafer releases 0.012 starch C/s and 0.008 protein C/s × dt as deposits (starch/starchN, protein/proteinN), each carrying 0.10 N per C.
  - Release never exceeds inventory. The last transfer moves the exact remainder of C and N; the object then leaves the store, and an 'objectEmptied' event lets the renderer draw a fading stain (cosmetic only).
- Objects never move, never diffuse and are not eaten directly. Released products are usable in stage 6 the same tick. Any removal path other than release (sampling in wave 3 is the only one) moves or releases the remaining inventory exactly once.
Done when:
- tests/fixtures/food-objects.test.ts: placement ledgered exactly (+10 C, +1 N); pellet release exactly 0.002 C and 0.0002 N per tick; the empty tick moves the exact remainder (object C and N reach zero, not negative, with no roundoff logged); a pellet lasts 5,000 ticks; the wafer's two pools and 0.10 N per C are exact; carbon and nutrient close every tick for 6,000 ticks with organisms feeding; cap and occupied-cell refusals change nothing; save/reload mid-release gives an identical hash; objectEmptied is emitted once.
- tests/e2e/food-objects.spec.ts: Lab → Food → Leaf wafer → tap → the object shows with an outline → run at 4× → the fill steps fall (read from the snapshot via the test hook, not pixels) → the cell inspector shows the remaining inventory; axe clean.
Use E2E_PORT=4233 E2E_OUTDIR=tmp/dist-objects.`,
  },
  {
    key: 'tools-sample',
    port: 4234,
    prompt: `ASSIGNMENT: BUILD_DIRECTIVE P3.5 "Tools: sampling and dilution" end to end (R18: D07 transaction semantics for every world). Read SPEC §10.1, §10.4 (Erase structure), §10.5, §10.6, §10.7, §3.4 (the sample slot is a compartment), §14.1; docs/source/D07 §09 "Sampling and specimen handling" (~lines 150–160) and D01 ~line 359; UX §4.4 (Tools tray), §5.11; wave 1 stores (src/sim/{sampleSlot,links,objects}.ts); the P2.7 Lab tools (Erase structure may exist already: verify, do not duplicate). Phage doses landed in wave 2.
You own: src/sim/sample.ts (new), src/sim/sampleSlot.ts, src/sim/tools.ts (new: clean water), src/sim/commands.ts (owner this wave), src/ui/panels/Sample*.tsx (new), src/ui/strings/tools.ts (new), tests/sim/tools.test.ts (new), tests/worker/sample-transaction.test.ts (new), tests/e2e/sample-transfer.spec.ts (new).
SHARED (additive): src/worker/{protocol,host,client,snapshot}.ts (transaction state, preview, refusing Run while a sample is held), src/persistence/saveFile.ts (a pending sample restores on load), src/ui/{state.ts,views/DishScreen.tsx,styles.css}, the Lab tray files, src/ui/panels/MoreSheet.tsx.
Build Sample, a paused transaction:
- Begin is host-level, not a command: pause, record the pre-begin stateHash, and preview the selection and held inventory for mode Life / Dissolved / Deposits / All (All excludes structures) at radius 1/3/6.
- Modes: Life = organisms whose centers are in the footprint, plus viral units in its cells. Dissolved = every allocated field of kind dissolved/gas/activity. PROPOSED DECISION: viral units belong to Life, activities to Dissolved. Deposits = starch, oil, protein, detritus and film (with companion N) and food objects in the footprint.
- Whole ownership units (D07): a host and its attached parasite; the complete fungal and adhesion components of any selected member; a predator and its claimed or handled target. If any member of a unit lies outside the footprint, reject the whole selection with a highlight naming the missing members (species, id, cell). Never expand the brush silently.
- Confirm = command 'sampleTake' (paused only). Rows (full column values with their original slots), field amounts by cell offset, and objects move into world.sample. The ledger stays closed. The source stays paused: Run is refused with "A sample is held — transfer, cancel or discard it first".
- Cancel = command 'sampleReturn'. PROPOSED DECISION: an exact inverse move into the original slots and cells instead of storing a second checkpoint, so Cancel also works after reload. The stateHash must equal the pre-begin hash.
- Discard = command 'sampleDiscard', confirmed in the UI. It exports the held C/N/M with ledger entries and records removed life with REMOVED_SAMPLED.
- Transfer = command 'sampleTransfer' {dx, dy} within the same dish. Validate EVERY destination first: inside the mask, not a structure, habitat-compatible and attachable where required, cell capacity 8, the agent cap, one object per cell, linked members keep adjacency. If anything fails, reject the whole move (slot intact, still paused). Otherwise move, never copy: fields keep their offsets; organisms keep relative positions and all state (genome, energy, age, infection, host ownership, links). New slots are allocated lowest-free-first in ascending original-slot order; document this.
- Replacing a held sample needs confirmation. On reload, a pending sample restores and the UI offers Complete / Cancel / Discard without restarting time.
Build Clean water, command 'cleanWater' {points, radius, fraction 0.25|0.5|1}:
- Remove that fraction of every dissolved non-gas field (kinds dissolved, activity and viral; companions in the same fraction) in the footprint, as exports.
- Restore O2 and CO2 in those cells to the habitat baseline; the CO2 difference is ledgered as carbon input or export; O2 is display only.
- Life, deposits and objects are untouched.
Erase structure: use P2.7's if it exists, otherwise add it (restores the previous substrate, never removes resources). All four tools are one gesture = one command and are undoable with the existing one-level undo.
Done when:
- tests/sim/tools.test.ts:
  - Sampling conserves: checkLedger passes at begin, after take, after transfer and after return; world + slot totals stay constant.
  - Take then return restores the exact pre-begin stateHash, also with a save/reload in between.
  - An A01 with an attached X01 moves as a pair.
  - Selecting 2 of 4 chained F02 is rejected, naming the other 2, and nothing changes.
  - Transfer is atomic: one invalid destination means nothing moves, the slot is intact and the hash is unchanged.
  - Transfer moves rather than copies: source cells lose exactly what destination cells gain.
  - Discard exports exactly the held totals.
  - Clean water at 25/50/100 % removes exactly those fractions (ledgered as exports), restores the O2/CO2 baseline and leaves life, deposits and objects untouched.
- tests/worker/sample-transaction.test.ts (through DishHost): Run is refused while a sample is held; reload restores the slot and offers the three actions; Complete, Cancel and Discard each work after reload.
- tests/e2e/sample-transfer.spec.ts: Lab → Tools → Sample (Life, radius 3) → preview → Confirm → Run shows the refusal message → Transfer → the dish runs. The Cancel path leaves the dish unchanged (hash via the test hook). Clean water at 50 % on a salt patch halves its salinity. Axe clean.
Use E2E_PORT=4234 E2E_OUTDIR=tmp/dist-sample.`,
  },
]
```

**Lead after W3:** tick P3.5 and P3.6.

### Wave 4: `g3-wave-4`

**STATE:** "…and wave 3 (B07, B08, Y02, F02 + transport pass, enzymes/broth/breaker materials, food objects, Sample/Transfer/Clean water/Erase) are committed on main."

Append this wave rule to STATE:

> "WAVE 4 RULE: do NOT add module IDs to content/manifest.json. Every enabled module changes FIRST_DISH_V1's mutation options, which is a forced trajectory change and would break the fence for the other three builders. Test through registryWith({ enabledModules: [...shipped, 'E0x'] }). After this wave the lead enables E04, E06, E07, E08, E09, E10 and E12 together, bumps moduleRegistryVersion and updates the fence with a DECISIONS entry."

```js
const TASKS = [
  {
    key: 'mod-anchor-light',
    port: 4241,
    prompt: `ASSIGNMENT: BUILD_DIRECTIVE P3.7 modules E04 Surface anchor and E07 Light seeker. Read SPEC §9 (E04, E07, general rules), §6.4, §6.7 (E07 replaces the distance cost, never both), §9.19; CT §7.1 (E04 eligible B01, B03–B12, Y01, Y02; E07 eligible A01, A02, A03, A05), §12.6 (E04: attach after 5 s with E > 35, 0.10 E/s, detach after 10 s without intake / E < 15 / support lost, 10 s lockout); docs/source/D04 §2 row C06, §5 "E07 Light seeker", §13 ("A light seeker is trapped or resting"); content/modules/E04.json and E07.json params.
You own: src/sim/movement.ts, src/sim/anchor.ts (new), src/sim/lightSeeker.ts (new), tests/fixtures/module-e04.test.ts (new), tests/fixtures/module-e07.test.ts (new).
SHARED (additive): src/sim/content/implemented.ts (IMPLEMENTED_MODULES += E04, E07), src/sim/content/moduleRules.ts (MODULE_REQUIRED_PARAMS E04: attachSeconds, minEnergy, attachedUpkeep, detachNoIntakeSeconds, detachEnergy, lockoutSeconds; E07: baseSpeed, lightSensing, moveCostFactor, brighterBy), src/sim/phenotype.ts (one branch each in the modules loop; E07 activates the motility and sensing loci in activeLoci, as E03 does for dormancy, and supplies their baselines), src/sim/maintenance.ts (mod-adhesion owns it: one-line calls for E04 upkeep and for E07's cost replacing the distance cost), src/sim/structures.ts (the "release invalid anchors" hook: resting releases the anchor), src/sim/births.ts (daughters start unanchored), src/sim/moduleView.ts, src/ui/strings/modules.ts, src/worker/snapshot.ts (CUE2_MOD_E04, CUE2_MOD_E07, CUE2_ANCHORED, CUE2_SEEKING_LIGHT; reason ANCHORED). Do not touch the manifest.
Build E04:
- An Active carrier with E > 35 that is four-adjacent to a support cell accumulates anchorSeconds. PROPOSED DECISION: support = stone, wall or porous bead; mesh arrives in Phase 5. After 5 continuous seconds it anchors; a gap in adjacency, or E ≤ 35, resets the clock.
- Anchored: speed 0 (no self-propulsion and no movement cost); +0.10 E/s upkeep; feeding and predation as ordinary.
- It detaches after 10 s without intake (tick − lastIntakeTick ≥ 100), when its support disappears (e.g. an erased stone), or at E < 15; then a 10 s reattach lockout applies.
- Resting releases the anchor, and a woken organism must attach again. Division resets anchoring for both daughters.
- Non-motile carriers (Y01, Y02) anchor as a state and pay the upkeep, but their movement is unchanged. PROPOSED DECISION: this is the literal rule; flag it for the owner.
- Transport class is unchanged. Reason code: ANCHORED.
Build E07:
- Base speed 0.15 cells/s and light-sensing radius 2 become the mapped baselines of the motility and sensing loci, which become active at their stored values (founders 50).
- Movement cost is 0.10 × (0.5 + g_mot)² E/s, charged only on ticks it actually self-propels; it replaces 0.20 × cells × factor.
- When Active, unheld and unattached, at each 0.5 s decision it scores reachable candidate cells (same solver, edge-checked, habitat rules) by effective light, with ties broken by the existing tiebreak stream. It stays put unless some candidate is brighter than its cell by ≥ 0.01. No crowd avoidance. On module loss it stays where it is.
Done when:
- module-e04: anchors at exactly the 50th tick of continuous adjacency (not the 49th); a gap resets the clock; the E gate holds; upkeep is 0.01 E per tick while anchored with zero movement; each detach cause (100 ticks without intake, stone erased, E < 15) is followed by a 100-tick lockout; resting releases; daughters are unanchored; a Y01 carrier anchors with no movement change.
- module-e07: an A01 carrier in a light gradient (made with shade paint) moves toward brighter cells only when the gain is ≥ 0.01; it pays exactly 0.10 × (0.5 + g)² × dt on moving ticks and nothing when stationary, resting or anchored; it never crosses a wall; the motility and sensing loci are active for carriers in phenotype, mutation and branch qualification.
- module-accounting passes. Fence unchanged (modules not enabled).
Use E2E_PORT=4241 E2E_OUTDIR=tmp/dist-anchor if you run e2e.`,
  },
  {
    key: 'mod-feeding',
    port: 4242,
    prompt: `ASSIGNMENT: BUILD_DIRECTIVE P3.7 modules E06 Shade collector and E08 Debris feeder. Read SPEC §6.5 (routes; photosynthesis lightResponse), §9 (E06, E08), §7.3; CT §7.1 (E06 eligible A01, A02, A04, A05, never native A03; E08 eligible P01, P02, P03, P05, P07); docs/source/D04 §5 (E06 and E08 paragraphs) and §13 ("Detritus feeder captures live prey"); content/modules/E06.json (lightHalf 0.35, ceilingFactor 0.7) and E08.json.
You own: src/sim/intake.ts, src/sim/debrisFeeder.ts (new), tests/fixtures/module-e06.test.ts (new), tests/fixtures/module-e08.test.ts (new).
SHARED (additive): src/sim/content/implemented.ts (E06, E08), src/sim/content/moduleRules.ts (E06: lightHalf, ceilingFactor), src/sim/phenotype.ts (one branch each), src/sim/movement.ts (E08 food score = max(prey score, detritus avail); one call into your file), src/sim/contacts.ts (a capture this tick marks the predator so its detritus request is cancelled), src/sim/moduleView.ts, src/ui/strings/modules.ts, src/worker/snapshot.ts (CUE2_MOD_E06, CUE2_MOD_E08, CUE2_DETRITUS_INTAKE). Do not touch the manifest.
Build:
- E06: on the photosynthetic route only, lightResponse = min(1, light/0.35) and the intake ceiling × 0.70 (the feeding locus applies after); the other limits still apply.
- E08: a carrier with no held meal may request local detritus under its ordinary ceiling × suitability, with aerobic conversion (O2 0.30 per C, 30 E per C, N rules). A held meal has exclusive priority. A capture in stage 5 this tick cancels this tick's detritus request: one meal route per tick. It grants digestion, not new prey. Its movement food score is max(prey score, detritus score), never the sum.
Done when:
- module-e06: at light 0.10 the photosynthetic request is exactly 0.70 × (0.10/0.35) = 0.20 of the ancestral ceiling (0.10 without E06); at light 1.0 it is exactly 0.70.
- module-e08: detritus intake happens only with an empty meal; a capture on the same tick leaves detritus untouched; bound N transfers with detritus carbon; no new prey species; the movement score is the max, not the sum.
- The ledger closes. Fence unchanged.
Use E2E_PORT=4242 E2E_OUTDIR=tmp/dist-feeding if you run e2e.`,
  },
  {
    key: 'mod-builders',
    port: 4243,
    prompt: `ASSIGNMENT: BUILD_DIRECTIVE P3.7 modules E09 Protein release and E10 Matrix builder, the final stage 8 reservation order, and the C08 shared-budget fixture with real modules. Read SPEC §3.2 stage 8 row, §5.3, §7.1, §9 (E09, E10, general rules); CT §7.1 (E09 eligible B04, B05, F01, F02, Y01, Y02, never native B08; E10 eligible B01, B04, B06, B10, B11, Y01, F02), §12.6; docs/source/D04 §2 row C08, §6 (E09, E10), §9 (reservation order), §13 ("Two matrix builders fill the same cell"); content/modules/E09.json (emitRate 0.02, minEnergy 35, emitCost 0.4, localCap 1) and E10.json (minEnergy 35, minBodyMultiple 1.2, filmCap 0.5, rate 0.02, energyPerCarbon 2); wave 1's src/sim/{structures,actions,construction,secretion}.ts.
You own: src/sim/structures.ts, src/sim/actions.ts, src/sim/construction.ts, src/sim/secretion.ts, src/sim/matrixBuilder.ts (new), tests/fixtures/shared-budget.test.ts, tests/fixtures/module-e09-e10.test.ts (new).
SHARED (additive): src/sim/content/implemented.ts (E09, E10), src/sim/content/moduleRules.ts (required params), src/sim/phenotype.ts (E09 → protein producer rules with source 'E09'; E10 → builder rules), src/sim/moduleView.ts (E09: "Produces broth; cannot consume broth" when the species cannot eat broth), src/ui/strings/modules.ts, src/worker/snapshot.ts (CUE2_MOD_E09, CUE2_MOD_E10, CUE2_RELEASING_PROTEIN), tests/fixtures/module-accounting.test.ts (extend). Do not touch the manifest.
Build:
- E09: exactly E_PROTEIN secretion (0.02 activity/s, 0.40 E/s, E > 35, protein deposit in the cell or a four-neighbor cell, local activity < 1.0), using the world's recorded E09 params. It grants no broth feeding.
- E10: while Active, E > 35, B > 1.2 B0' and local film < 0.50, request min(0.02 × dt, B − 1.2 B0', 0.50 − film) body carbon into film with proportional N. Reserve 2 E per requested C first, limiting the request to what the remaining energy can pay. Build through the shared construction pass together with B02 and other builders: one film snapshot, proportional headroom, commit together, charge 2 E per accepted C only, return the rest. No extra protection (film rules unchanged).
- Document the final stage 8 table in structures.ts: mandatory transitions → natives by NativeAbility enum index → modules E01, E09, E10, ascending. Note where the modules that do not act in stage 8 act instead: E04 attach/detach is state in stage 8's release hook plus movement; E06/E08 act in intake; E07 in movement; E12 forms in stage 5.
Done when:
- tests/fixtures/shared-budget.test.ts (C08), extended with real modules via registryWith: a B04 carrying E01 + E09 + E10, with E chosen just above 35, lets E01 fire, E09 fire on the remainder, and refuses E10 with its energy reason. A test-only permutation of the order refuses a different action. Nothing is double-spent, and Σ energy spent = Σ ledger categories.
- tests/fixtures/module-e09-e10.test.ts: E09 costs and conditions; no broth intake unless native. Two E10 builders plus a B02 in one cell never push film above 0.50; proportional scaling is exact; each builder is charged 2 E × accepted C; unused reservation returns; N moves proportionally; diverted B delays division.
- module-accounting: the surcharge is charged once per module.
- Fence unchanged under the shipped manifest.
Use E2E_PORT=4243 E2E_OUTDIR=tmp/dist-builders if you run e2e.`,
  },
  {
    key: 'mod-adhesion',
    port: 4244,
    prompt: `ASSIGNMENT: BUILD_DIRECTIVE P3.7 module E12 Colony adhesion. Read SPEC §3.2 (stage 5 "then E12 link formation"; stage 7 link costs; stage 8 release), §6.8, §9 (E12), §9.19; CT §7.1 (eligible B01, B04, B06, B09, B10, B11), §7.2 (E13 exclusion; Phase 7), §12.6 (E12 numbers); R17 (links share nothing without E15); docs/source/D04 §6 "E12 Colony adhesion" and §13 ("A cluster member divides or dies", "A gate is painted through a cluster"); content/modules/E12.json params; wave 1's src/sim/links.ts and the adhesion columns.
You own: src/sim/contacts.ts, src/sim/maintenance.ts, src/sim/adhesion.ts (new), tests/fixtures/module-e12.test.ts (new).
SHARED (additive): src/sim/content/implemented.ts (E12), src/sim/content/moduleRules.ts (E12 params), src/sim/phenotype.ts, src/sim/movement.ts (linked members stop self-propelling; one call), src/sim/births.ts (division removes the parent's links; newborns are unlinked), src/sim/structures.ts (release invalid links on dormancy, hold or module loss), src/sim/sample.ts (verify adhesion components are whole ownership units; add only if missing), src/sim/moduleView.ts, src/ui/strings/modules.ts, src/worker/snapshot.ts (CUE2_MOD_E12, CUE2_LINKED; 'links' list kind 3). Do not touch the manifest.
Build:
- Pairing: two free, Active carriers of the same ancestor, both with E ≥ 20, whose centers stay within 0.5 cells continuously for 5 s. Each entity tracks its lowest-birthId eligible neighbor in adhPartner/adhSeconds; the clock resets if the pair separates or the candidate changes.
- Linking happens in stage 5 after attacks. Pairs resolve greedily by sorted birthIds. Each partner pays 2 E once; rejected pairs pay nothing.
- Caps: ≤ 2 links per organism and ≤ 8 members per component. A link that would exceed a cap fails with an event and no cost.
- Linked members stop self-propelling. Upkeep is +0.01 E/s per incident link in stage 7. Links convey nothing (R17).
- A member severs its own links after 10 s without intake, at E < 15, on entering dormancy, when captured or held, on module loss, and on death, division, sampling, or forced separation > 0.75 cells. Severed survivors have a 10 s relink lockout.
- Newborns start unlinked. Members count individually. Never link across a prohibited edge (none exist until Phase 5).
Done when:
- tests/fixtures/module-e12.test.ts: the link forms at exactly 50 ticks, not before; the E ≥ 20 gate holds; each partner pays 2 E once; rejected pairs pay nothing; the degree-2 and component-8 caps hold (the 9th member fails with an event and genomes are unchanged); the result depends only on birthIds (permuting slots gives the same pairs); linked members do not move; upkeep is 0.001 E per link per tick; each severance cause is followed by a 100-tick lockout; division and death remove incident links and survivors stay valid (D04 §13); save/reload mid-pairing is identical; sampling half a cluster is rejected.
- Fence unchanged under the shipped manifest.
Use E2E_PORT=4244 E2E_OUTDIR=tmp/dist-adhesion if you run e2e.`,
  },
]
```

**Lead after W4 (the module flip):**
1. Add E04, E06, E07, E08, E09, E10 and E12 to `enabledModules`, bump `moduleRegistryVersion` 1→2, and run `content-validate --write`.
2. Run the fence. Expect `currentDigest` mismatches only for recipes with module rate > 0 whose species gained options: FIRST_DISH_V1 (Standard) and the Standard-preset P2 and E2xx recipes. Fixed Traits recipes must be unchanged.
3. Prove the cause: add to the fence test (or a one-off test) that `registryWith(shipped minus the new modules)` reproduces the old `currentDigest`. `g2Digest` must still pass.
4. Run `tools/fence-update.ts --all --reason D-00xx`. Log it in DECISIONS: "Phase 3 modules enabled; recipe trajectories change only through mutation module options".
5. Rerun the experiments and variants tests and record any gate changes in `docs/reports/experiments-g2.md`.
6. Tick P3.7.

### Wave 5: `g3-wave-5`

**STATE:** "…and wave 4 plus the module flip (E04, E06–E10, E12 enabled; moduleRegistryVersion 2) are committed on main."

```js
const TASKS = [
  {
    key: 'field-guide',
    port: 4251,
    prompt: `ASSIGNMENT: BUILD_DIRECTIVE P3.8 "Field Guide, journal, badges" end to end. Read UX §2 (Field Guide: species · materials · structures · equipment · rules glossary; blocking panels pause and restore), §4.2 ('/' search), §5.7, §6.4, §9; SPEC §12.3, §12.9, §18 (glossary); CT §3, §4, §5; docs/source/D01 ~line 382 ("A local journal records observed relationships such as 'Recycler consumed debris.' Discovery badges are cosmetic"); ARCH §4 (every enabled entry needs guide text; Structure schema); src/ui/journal.ts (P2.5/P2.8), src/ui/strings/lab.ts (P2.7 tray texts).
You own: src/ui/views/FieldGuide*.tsx (new), src/ui/strings/guide.ts (new: glossary and the fictional-units notice), src/ui/badges.ts (new), src/sim/content/guideRules.ts (new), content/structures/STONE.json, WALL.json, BEAD.json and content/tools/*.json (new: SAMPLE, TRANSFER, CLEAN_WATER, ERASE_STRUCTURE, SNAPSHOT, DUPLICATE, COMPARE, UNDO, OVERLAYS, INSPECT — each with guide {summary, biology, rules, example} plus changes / doesNotChange / watchFor), tests/content/guide.test.ts (new), tests/ui/badges.test.ts (new), tests/e2e/field-guide.spec.ts (new).
SHARED (additive): src/sim/content/{schema,registry}.ts (StructureSchema and ToolSchema; validation below), tools/lib/content-fs.ts and src/sim/content/raw-vite.ts (load the new directories), content/**/*.json (guide text edits only where your validator finds a defect; list each one), src/ui/journal.ts (observed-relationship entries), src/worker/{protocol,host,client}.ts (a query returning the relationships observed in the current dish, derived from recorded events: consumption by food, predation pairs, infection, parasite attachment, conversion with producer provenance, film digestion), src/ui/app/App.tsx (route 'guide'), src/ui/views/Home.tsx, src/ui/panels/MoreSheet.tsx, the Lab tray files (read tray texts from content/tools where present, so the guide and trays never disagree).
Build (UX §5.7):
- Every enabled entry is visible at once; no locks. Tabs: Species · Materials · Structures & tools · Rules glossary.
- A species entry shows: the atlas thumbnail silhouette; diet; habitat and attachment; preferred ranges (pH, warmth, salinity, moisture); predators and prey, derived from content prey lists and limited to enabled species; hosts and parasites; products (enzymes, acid, film, metabolite by metabolism); one example interaction; and two headed sections, "General biology" and "Rules of this game".
- Materials say "No additional modeled reaction." where true. Structures and tools show changes / does not change / watch for.
- The glossary covers SPEC §18 plus "All numbers are fictional game units." The '/' key focuses search.
- Opening the guide from a dish pauses it; closing restores the prior run state.
- Validator rules:
  - Every ENABLED species, material, module, habitat, structure and tool has complete guide text.
  - A material's guide.rules says "No additional modeled reaction." unless guideRules lists the reaction it takes part in.
  - summary and example never name a species that is not enabled. PROPOSED DECISION: these are errors, fixed by editing the text; later-phase names in rules text only produce a warning.
- Journal: the first time a dish records a relationship (e.g. "Recycler consumed debris", "Ciliate caught Sprinter", "Pinphage infected Sprinter"), the local journal stores it with the dish, sim time and event id. The guide entry shows "Seen in your dishes" with that record.
- Badges are cosmetic: no effect on any world, no timers, no streaks. They are stored locally, outside saves.
Done when:
- tests/content/guide.test.ts: removing a guide field from any enabled record of each kind fails with file → field. The "No additional modeled reaction." rule and the not-enabled-name rule each have a failing and a passing case. Derived predator, prey and host lists equal CT §3.2–3.3 filtered to enabled species.
- tests/ui/badges.test.ts: badges derive only from recorded events and never write to a world.
- tests/e2e/field-guide.spec.ts: Home → Field Guide; opened from More it pauses the dish and restores it on close → '/' then "vel" → Velvet shows General biology, Rules of this game and its predators → Materials → Salt shows "No additional modeled reaction." → Structures & tools → Sample shows changes / does not change / watch for → after a dish records a Recycler eating debris, the journal entry and badge appear. Axe clean; 200 % text works.
Use E2E_PORT=4251 E2E_OUTDIR=tmp/dist-guide.`,
  },
  {
    key: 'experiments-curated',
    port: 4252,
    prompt: `ASSIGNMENT: BUILD_DIRECTIVE P3.9 "Experiments and curated dishes". Read SPEC §13.1–13.2; CT §9.3 (curated L301, L303, L304, L306; seed = recipe number; Water Garden defaults elsewhere; fixed light 0.8; pre-seeded genomes labelled "present at creation"), §10.1 rows 104 and 105 (radius-6 patches), §10.3 row E212, §11; docs/source/D04 §8 ("Initial organisms scatter uniformly among valid patch cells using the recipe seed; counts and imported genomes are recorded external inputs"; "not demonstrations that spontaneous evolution has already occurred"); D-0022 and docs/reports/experiments-g2.md; UX §2.3 (New Dish recipe picker).
You own: content/recipes/HIDDEN_NEIGHBORHOOD_V1.json, ONE_HOST_V1.json, FUNGAL_SUPPLY_LINE_V1.json, L301_TWO_LUNCHES.json, L303_PUBLIC_KITCHEN.json, L304_EMPTY_AFTER_THE_FEAST.json, L306_BORROWED_SHELTER.json (new), content/experiments/EXP_104.json, EXP_105.json, EXP_212.json (new), tests/experiments/hidden-neighborhood.test.ts, one-host.test.ts, fungal-supply-line.test.ts (new), tests/recipes/curated.test.ts (new), docs/reports/experiments-g3.md (new).
SHARED (additive): src/sim/recipes.ts and src/sim/content/schema.ts (founder extensions below; the defaults keep every existing recipe bit-identical), src/sim/experiments.ts (grammar additions such as infections.<species>, limitSeconds.<REASON>.<species>, transfer.fungal), src/sim/rng.ts (ONE new stream 'founder.place' for scatter placement), src/ui/views/NewDish.tsx (curated dishes in the Basics picker, each with its question and a "Pre-seeded genomes" label), tests/fixtures/fence.json (only via tools/fence-update.ts --add for your recipes).
Build founder extensions (PROPOSED DECISIONS):
- placement: 'nearest' (default; D-0005, D-0022) | 'scatter' (D04 §8: uniform among valid patch cells, drawn with det(seed,'founder.place',founderIndex,k)).
- An optional explicit 'cells' list.
- An optional labelled 'initial' override {B, N, E}, shown as "labelled setup" (CT's "labelled test override").
- An optional 'links': 'chain' for four-adjacent F02 founders (validated as a four-neighbor chain, degree ≤ 4).
Build the experiments:
- EXP_104 A hidden neighborhood (seed 104): closed-lid Water Garden; 20 B01 + 20 B03 at (50,70) r 6; sugar 0.50 and nutrient 0.20 per patch cell; suggests the O2 overlay. Gate: B01 records OXYGEN_LIMITED and B03 records a different O2 limitation (SUIT_OXYGEN_HIGH).
- EXP_105 One compatible host (seed 105): 30 B01 at (35,64) r 6 with sugar 0.50; 30 B05 at (90,64) r 6 with metabolite 0.50; nutrient 0.20 in both; V01 5 units per patch cell in both. Gate: infections.B01 ≥ 1 and infections.B05 = 0, plus a non-vacuity clause that ≥ 1 whole unit was present in some B05 cell.
- EXP_212 Fungal supply line (seed 212): gel; four linked F02 at (60–63,64) with B = 4, 2, 2, 2 (N = 0.10 B), E 50, no food; runs 10 s. Gate on the donor/receiver transfer ledger.
Build the curated dishes (Water Garden defaults elsewhere, lid open, fixed light 0.8, scatter placement, each showing its question, seeded modules labelled "present at creation"):
- L301 (seed 301): two r 8 patches at (40,64) and (88,64), each with 30 B01, sugar 0.5 and nutrient 0.2; Varied Traits.
- L303 (seed 303): r 8 at (64,64) with 20 Y02 + 20 B08, protein 0.5 C with 0.05 bound N, free nutrient 0.1; Diverse.
- L304 (seed 304): r 10 at (64,64) with 60 B01, sugar 0.8, nutrient 0.2; Diverse; no replenishment.
- L306 (seed 306): r 8 gel patch at (64,64) with 40 B06, sugar 0.6, nutrient 0.2; E10 on 20 (alternate assignment) and none on the other 20.
Done when:
- The three experiment fixtures reach their gates, or record the measured limiting factor in docs/reports/experiments-g3.md (e.g. diffusion leaving < 1 whole unit per cell). Never change mechanics or constants to force a gate.
- tests/recipes/curated.test.ts: each curated recipe realizes with exact counts, patch cells, patch totals and seeds; modules only on the labelled founders; deterministic placement (two realizations identical; a different seed scatters differently); the initial ledger equals the preloads.
- Every existing recipe's fence digest is unchanged by the schema and realizer additions.
Use E2E_PORT=4252 E2E_OUTDIR=tmp/dist-curated if you run e2e.`,
  },
  {
    key: 'g3-fixtures',
    port: 4253,
    prompt: `ASSIGNMENT: the three G3 gate fixtures that span every system: the every-catalog-relationship generated matrix, conservation-all-pools, and transport-obstacles. Read BUILD_DIRECTIVE "G3 gate — evidence", SPEC §17, §3.4, §4.1, §10.5–10.6; CT §3 (all tables), §7.1, §14; docs/source/D01 acceptance table (~lines 470–480: "Transport and obstacles: A pulse spreads without creating quantity; walls block transport and motion; sampling and replacement correctly reconcile exports and inputs"; "Resource accounting … Include feeding, predation, parasites, film and phage lysis"); tests/helpers/tables.ts (reads CT from the doc; use it as the oracle).
You own: tests/fixtures/relationship-matrix.test.ts, tests/fixtures/conservation-all-pools.test.ts, tests/fixtures/transport-obstacles.test.ts (all new), tests/helpers/tables.ts (additive parsers), tools/relationship-matrix.ts (new), docs/reports/relationships-g3.md (generated).
SHARED (additive): tests/helpers/world.ts (helpers only). Do NOT change src/** or content/**. A failing relationship is a bug to report with file:line and a repro; mark that case it.fails with the bug id and never weaken an assertion.
Build:
(1) Relationship matrix, generated from CT §3.1–3.5 parsed from the doc (not from content JSON, so content drift is caught), for every enabled species, material and module. One tiny deterministic world per row; the whole file runs in ≤ 90 s. tools/relationship-matrix.ts writes the table (row, expected, observed, pass) to docs/reports/relationships-g3.md. Rows:
- diets: each species × each food in its diet has intake > 0 with only that food present; every food outside its diet gives zero (negative controls);
- prey: each predator × every enabled species, including the 'free' and 'in sediment' modifiers;
- hosts: X01 and V01 × every species;
- inhibitor targets: each of the three inhibitors × every species;
- film digesters: every species × film;
- enzymes: each enzyme × each substrate (it converts only its own);
- producers: native and module producers × their enzyme;
- module eligibility: each enabled module × each enabled species (a gain is possible iff eligible and not a native duplicate, via moduleSetProblem).
(2) conservation-all-pools: closed lid, no inputs after setup, 10,000 ticks, in one dish holding film (B02 + an E10 carrier), fungi (F01 + a linked F02 chain that actually transfers), parasites (X01 on A01), phage (V01 + B01 reaching lysis), enzymes (B06/B07/B08 on their deposits, plus breaker), food objects (a pellet and a wafer), obstacles (walls, stones, beads, gel/sediment), predators P01–P04, and anaerobes/acid (B03, Y01). C, N and M relative error < 1e-5 at every 100th tick. Non-vacuity: assert each mechanism actually happened (film > 0, fungal transfer > 0, infections ≥ 1 and lyses ≥ 1, parasite drain > 0, each enzyme converted > 0, each object released > 0 and one emptied, captures > 0).
(3) transport-obstacles: a sugar pulse spreads with Σ constant to 1e-12 and a falling max; a wall ring isolates inside from outside for dissolved, activity and viral fields and for organisms (zero crossings over 1,000 ticks); stone blocks; a bead passes solutes but not swimmers; film halves edge flux; sampling + transfer and clean water reconcile exports and inputs exactly against the ledger.
Done when: the three files pass (paste row counts, pass/fail and runtimes); docs/reports/relationships-g3.md is generated; every failing row is reported as "BUG: …" with a repro.
Use E2E_PORT=4253 E2E_OUTDIR=tmp/dist-fixtures if you run e2e.`,
  },
  {
    key: 'audio',
    port: 4254,
    prompt: `ASSIGNMENT: BUILD_DIRECTIVE P3.10 "Audio". Read ARCH §10.3; UX §8.1–8.2 (cues; ≤ 4 world cues/s; coalescing; every audible cue has a visible equivalent), §2 (Settings: sound/music/voice · haptics · reduced motion), §9 (quiet audio); CT §12.10 (sound cues ≤ 4/s); R25. ESLint allows Math.random only in src/render and src/audio, for cosmetics.
You own: src/audio/** (new: SoundKit.ts, patches.ts, rateLimiter.ts, ambient.ts, haptics.ts, cues.ts), src/ui/panels/SoundSettings.tsx (new), tests/audio/** (new), tools/audio-preview.html (new).
SHARED (additive): src/ui/state.ts (settings effectsVolume 0.7, musicVolume 0.4, voiceVolume 0.8, muted false, quietAudio false, haptics false), src/ui/views/SimplePage.tsx (Settings section), src/ui/main.tsx (lazy init on the first user gesture; suspend on visibilitychange and pause messages), and one line at each cue call site: placement accepted → drop; placement rejected → placement_error; selection → select; save → save; branch discovery card → discovery; comparison result → compare_result; committed divisions from snapshot events (coalesced) → division; card open → card_open; wake transition → wake.
Build:
- SoundKit synthesizes each stable cue id with Web Audio from a patch {cueId, oscillator|noise, envelope, pitch, filter, gain}.
- World cues (division, wake, discovery) pass a rate limiter: ≤ 4 per rolling second, and repeats of the same cue within the window coalesce into one play with a count. UI cues bypass the limiter.
- Ambient loop: low-passed noise + a slow detuned sine pad at −24 dB on the music bus.
- Separate effects, music and voice gains; mute; quiet audio (effects −12 dB, ambient off).
- No sound before the first gesture (autoplay policy). Audio pauses on suspension.
- Haptics only on intentional tool actions, via feature-detected navigator.vibrate, off by default. PROPOSED DECISION: no new dependency.
- Every cue has a visible equivalent; list the pairs in the file header.
- No cue is triggered by the renderer or consumes simulation randomness.
Done when:
- tests/audio/rate-limiter.test.ts (fake clock): 10 division cues in 1 s give ≤ 4 plays with a coalesced count of 10; different world cues share the 4/s budget; UI cues are not limited.
- tests/audio/settings.test.ts: mute and volumes map to gains (pure functions).
- A test proves src/audio imports nothing from src/sim.
- tools/audio-preview.html plays every cue for the owner's manual listen (list it as an owner item).
- The Settings UI is keyboard accessible, axe clean, and works at 200 % text.
Use E2E_PORT=4254 E2E_OUTDIR=tmp/dist-audio.`,
  },
]
```

**Lead after W5:** tick P3.8, P3.9 and P3.10.

### Wave 6: `g3-wave-6`

**STATE:** "…and wave 5 (Field Guide, P3.9 experiments + curated dishes, gate fixtures, audio) are committed on main. WAVE 6 RULE: nobody edits content/ in this wave, so stateHash comparisons within the wave are valid."

```js
const TASKS = [
  {
    key: 'a11y',
    port: 4261,
    prompt: `ASSIGNMENT: BUILD_DIRECTIVE P3.11 "Accessibility pass 1". Read UX §4.1–4.2 (sizes; input contract incl. the keyboard map), §5.4 (chart tables), §7.4 (reduced motion), §9; D-0014, D-0017.
You own: src/ui/styles.css, src/ui/a11y/** (new: DishSummary.tsx = accessible species list with name, count, biomass trend and extinct state; CellDescription.tsx; LiveRegion.tsx; focus utilities), tools/contrast-audit.ts (new), docs/reports/contrast.md (new), tests/e2e/keyboard.spec.ts (new), tests/e2e/a11y-screens.spec.ts (new), tests/ui/a11y*.test.ts (new).
SHARED (additive, never a behaviour change): every file under src/ui/views and src/ui/panels (labels, roles, focus order, keyboard handlers), src/ui/gestures.ts (keyboard placement), src/render/{renderer,layers}.ts (the simplified overlay palette and reduced-motion switches only), src/ui/state.ts (setting simplifiedOverlayPalette). No content edits.
Build:
- Semantic controls and a visible focus ring (#F2B84B) everywhere.
- The full UX §4.2 keyboard map: arrows pan, +/− zoom, Space pause/run, 1/2/4 speed, '.' step, I inspect, L life, F feed, Esc → Look, U undo, '/' guide search, Tab through the chrome, Enter/Space activate.
- Keyboard placement. PROPOSED DECISION: with a placement tool active and the dish focused, a visible center reticle marks the target cell and Enter commits one gesture there; the arrows pan the dish under the reticle.
- ARIA labels for panels, inspector values and charts; verify every chart's table alternative (D-0014).
- The canvas is summarized by DishSummary and the selected-cell description. A live region announces one-line results (placement accepted with count, saved, card available).
- Reduced motion is honored everywhere (UX §7.4). Add a simplified overlay palette setting.
- 200 % text reflows without hiding primary controls at 360×800, 800×360 and 1440×900.
- Contrast audit of every text/background and essential-graphic pair in art/src/palette.ts and styles.css (text ≥ 4.5:1, essential graphics ≥ 3:1), including organisms against water, gel and sediment. Fix or justify each failure in docs/reports/contrast.md.
Done when:
- tests/e2e/a11y-screens.spec.ts visits every screen and sheet at all three projects with zero serious/critical axe violations: Home, Play, New Dish, Saves, Settings, About, each Field Guide tab, Dish Explore, Dish Lab with each tray, every Inspector depth, History, Lineage, Compare setup/results, What if?, each Notebook tab, Sample preview and the reaction ledger.
- tests/e2e/keyboard.spec.ts completes Home → Play → Garden → run → Add Life (L) → place with Enter → Inspect (I) → Why? → Esc → Undo (U) → More → Save → Field Guide '/' search → back, with no mouse, asserting a visible focus outline at each step.
- 200 % text checks at the three sizes show primary controls reachable.
- docs/reports/contrast.md lists every pair with its ratio.
Use E2E_PORT=4261 E2E_OUTDIR=tmp/dist-a11y.`,
  },
  {
    key: 'perf',
    port: 4262,
    prompt: `ASSIGNMENT: BUILD_DIRECTIVE P3.12 "Performance pass 1". Read ARCH §5, §8, §13; SPEC §2.5, §16; CT §14; docs/source/D02 ~line 761; docs/reports/render-perf-g1.md; docs/EXPANSION_RESPONSE.md §7 (G1: p50 1.28 ms at ≤ 710 agents); docs/reports/perf-g3.md ("Baseline at g2", written in preflight); tools/sim-run.ts (--perf), tools/render-bench*.
You own: tools/perf-stress.ts (new), tools/sim-run.ts, tools/render-bench*.{ts,html}, docs/reports/perf-g3.md, tests/perf/stress-shape.test.ts (new), and, for optimizations only, src/sim/** hot paths and src/worker/snapshot.ts (internal changes; every change hash-neutral). No content edits.
Build:
- tools/perf-stress.ts builds the target population in memory (not a content recipe): 6,000 live agents including 2,000 fungal segments (F01 plus linked F02 networks), with every Phase 3 system on: film (B02 + E10 carriers), fungal transport, X01 on A01, V01 + B01, enzymes B06/B07/B08 with deposits and breaker, pellets and wafers, walls/beads/gel/sediment, P01–P04, and E04/E07/E12 carriers.
- Run 15 simulated minutes (9,000 ticks) at 1× headless. Record: tick p50/p95/p99/max; per-stage breakdown; heap (process.memoryUsage) every simulated minute; snapshot build time and bytes (entities, overlay, aggregation); save serialize/deserialize time. Then measure the renderer budget with aggregation at 6,000 sprites, including fungal tiles and links (render-bench).
- Optimize hot paths (typed arrays, no per-tick allocation in stages, skip inactive fields and cells, no closures per entity) WITHOUT changing any float operation or its order. Known cost: diffusion 'none' fields stay flagged active, so filmCoefficients scans the grid every tick once 'film' is allocated.
- Before your first optimization, record the stress world's stateHash at tick 3,000 and every recipe's trajectory digest. After each optimization, all must be identical. If a gain requires changing results, do not make it; describe it as a proposal.
Done when:
- 1× tick p95 < 10 ms at 6,000 agents on this machine (record the lscpu model, core count and Node version; also report p50 and p99). If the target is not met, report the measured limiting stage and the remaining gap; never fabricate a number.
- No unbounded memory growth: heap slope over minutes 5–15 < 1 % per minute (show the series).
- Snapshot size and cost are recorded.
- docs/reports/perf-g3.md has before/after tables and the hash-neutrality proof (hashes before == after).
- tests/perf/stress-shape.test.ts asserts the builder really creates 6,000 agents with 2,000 fungal segments and every system active (non-vacuity).
- g2-replay, the fence, conservation-all-pools and determinism still pass.
Use E2E_PORT=4262 E2E_OUTDIR=tmp/dist-perf for render-bench.`,
  },
  {
    key: 'g3-evidence',
    port: 4263,
    prompt: `ASSIGNMENT: assemble the G3 gate evidence (BUILD_DIRECTIVE "G3 gate — evidence" and Appendix A) except the tag. Read BUILD_DIRECTIVE G3 and Appendix A; docs/EXPANSION_RESPONSE.md (structure, and the G1/G2 evidence style); CT §11 (tuning protocol); D-0015 (re-measure the recipe proposals at P3).
You own: tests/fixtures/determinism-g3.test.ts (new), tests/e2e/launch-ecology.spec.ts (new), docs/reports/tune-g3.md (new), docs/EXPANSION_RESPONSE.md (G3 sections: §1 build identity; §2 scope table with 19 species, modules E01, E03–E10 and E12, and systems; §4 G3 correctness evidence, one row per gate item; §7 performance, taken from perf's report when it exists; §8 changes and owner decisions), docs/reports/opening-loop-g3.md (optional; screenshots via tools/review-opening-loop.mjs).
SHARED: none. Do not change src/** or content/**; report bugs instead.
Build:
- tests/fixtures/determinism-g3.test.ts: a Phase-3-heavy world (L303, or a hand-built mix with film, fungi, phage, parasites, enzymes, objects and E04/E07/E10/E12 carriers) gives identical stateHash at 1×, at 4× (through the worker host), and through save → reload at the midpoint.
- tests/e2e/launch-ecology.spec.ts: New Dish → Gel Colony → Lab → add Velvet on gel, Threadlace, Cordweaver, Brothmaker + protein, a pellet and a salt paint → Sample → Transfer → Clean water → Field Guide lookup → run at 4× → the inspector shows film, links and the reaction ledger.
- Run npm run sim:tune (Standard, the six development seeds, 600 s, every registered recipe including curated and experiment recipes) and write docs/reports/tune-g3.md, including the D-0015 re-measurement.
- Compile the G3 checklist into EXPANSION_RESPONSE §4: run each listed test file yourself (targeted) and paste commands and numbers. The lead runs the full suites at integration.
Use E2E_PORT=4263 E2E_OUTDIR=tmp/dist-evidence.`,
  },
]
```

**Lead after W6:**
- Integrate and tick P3.11 and P3.12.
- Run the full Appendix A ritual: `npm run check`, `npm run test:e2e`, `content:validate`, `sim:tune`, the perf line, determinism 1×/4×/reload, and conservation errors.
- Finish EXPANSION_RESPONSE §1–§8, tag `g3`, and push.

---

## 5. G3 gate evidence checklist → test files

| Gate item | Evidence (file) | Wave |
|---|---|---|
| host‑specificity | `tests/fixtures/host-specificity.test.ts` | W2 |
| transport‑obstacles (pulse, walls, sampling reconciliation) | `tests/fixtures/transport-obstacles.test.ts` | W5 |
| conservation‑all‑pools (10,000 ticks: film, fungi, parasites, phage, enzymes, food objects, transport) | `tests/fixtures/conservation-all-pools.test.ts` (with non‑vacuity asserts) | W5 |
| every catalog relationship (generated table) | `tests/fixtures/relationship-matrix.test.ts` + `docs/reports/relationships-g3.md` | W5 |
| all module fixtures | `module-accounting` (P2); `shared-budget` (C08; W1 synthetic, W4 real); `module-e04`, `module-e07`, `module-e06`, `module-e08`, `module-e09-e10`, `module-e12` | W1/W4 |
| experiments | P2 cards; `tests/experiments/e201-e204.test.ts` (W3); `hidden-neighborhood`, `one-host`, `fungal-supply-line` (W5); `tests/recipes/curated.test.ts`; reports `experiments-g2.md`/`experiments-g3.md` | W3/W5 |
| e2e journeys incl. Lab tools and keyboard | `lab-tools`, `whatif` (P2); `chemistry-habitats` (W1); `reactions`, `food-objects`, `sample-transfer` (W3); `field-guide` (W5); `keyboard`, `a11y-screens` (W6); `launch-ecology` (W6); all older specs | W1–W6 |
| P3.1 done-when | `tests/sim/chemistry.test.ts` | W1 |
| P3.2 done-when | `tests/fixtures/habitat-presets.test.ts`, `tests/sim/attachment.test.ts` | W1 |
| P3.3 done-when | `film`, `fungal-branching`, `dusk-suitability`, `relationships-film`, `relationships-w2` | W2 |
| P3.4 done-when | `host-specificity`, `predation-matrix`, `parasite`, `phage`, `siltworm-crossing` | W2 |
| P3.5 done-when | `tests/sim/tools.test.ts`, `tests/worker/sample-transaction.test.ts` | W3 |
| P3.6 done-when | `fungal-transport` (E212 exact ledger), `food-objects`, `producers`, `e201-e204` | W3 |
| P3.8 done-when | `tests/content/guide.test.ts`, `tests/ui/badges.test.ts` | W5 |
| P3.10 done-when | `tests/audio/rate-limiter.test.ts` + manual listen (owner item) | W5 |
| P3.11 done-when | `a11y-screens.spec.ts`, `keyboard.spec.ts`, `docs/reports/contrast.md` | W6 |
| P3.12 done-when | `docs/reports/perf-g3.md`, `tests/perf/stress-shape.test.ts` | W6 |
| Determinism (Appendix A) | `determinism.test.ts`, `determinism-g3.test.ts`, `g2-replay.test.ts`, `trajectory-fence.test.ts` | pre/W6 |
| Saves | `migration.test.ts` (2→3, 1→3), `world-stores.test.ts` | W1 |
| Tuning | `docs/reports/tune-g3.md` | W6 |

---

## 6. Risks and open questions, with recommended decisions

### Riskiest items (each has its own builder)

1. **Stage 8 reservation order** (stage8 W1, mod-builders W4). The docs name the order but not the native action IDs.
   - Decision: use the NativeAbility enum index as the ID.
   - Each action sees the energy left after earlier reservations, with no refunds and no retries.
   - W1 must be hash-neutral. C08 is proven with synthetic actions in W1 and real E01/E09/E10 in W4.
2. **F02 simultaneous transport pass** (f02-links W3). The scaling order is unspecified.
   - Decision: scale by donor cap first, then receiver cap; no re-offer; one snapshot.
   - A segment may send and receive in the same pass.
   - Verified against an oracle written only from SPEC §7.7.
3. **Film headroom** (stage8 construction W1 + film-fungi W2 + mod-builders W4). One construction pass, one snapshot, proportional scaling, charge only accepted work; the 0.50 cap is never exceeded.
4. **Viral units** (parasites-phage W2).
   - Decision: infection needs ≥ 1 whole unit in the host's cell, and p uses the cell's (possibly fractional) units.
   - The consumed unit's 0.01 C joins host biomass, with no N.
   - Lysis gives floor(0.40·B/0.01) units.
   - Risk: water diffusion (0.10/tick) may spread 5 units/cell below 1 quickly, so EXP_105 could miss its gate. The builder must record the measured limiter; never change the rule to make it pass.
5. **Sample transactions** (tools-sample W3).
   - Decision: Begin and Cancel are host-level, and Cancel is an exact inverse move into the original slots. This keeps the stateHash equal and works after reload without a stored second checkpoint.
   - Take, Transfer and Discard are commands (undoable).
   - Ownership units are computed generically from W1's link tables, so E12 clusters are covered automatically in W4.
6. **6,000-agent performance** (perf W6).
   - G1 stage costs extrapolate to roughly 8–12 ms per tick at 6,000 agents.
   - Deposit fields (diffusion 'none') stay flagged active, so once 'film' is allocated `filmCoefficients` scans the grid every tick in every new world.
   - Decision: the target is p95 < 10 ms on the codespace (record the machine). Optimizations must be hash-neutral. If the target is not met, report the limiter; never cut biology.

### Determinism and hashes

7. **contentHash is inside stateHash.** Every content edit changes every new world's hash.
   - Decision: keep it, since it is the ruleset identity.
   - Fence behaviour with the trajectory digest and the g2 saves (preflight).
   - Tests must never pin stateHash literals. `EXPANSION_RESPONSE` records new endpoint hashes at G3.
8. **Recipes use the global manifest.**
   - Decision: accept it. The Garden should offer every enabled species, so do not use ARCH §4 `manifestOverrides` to freeze FIRST_DISH_V1.
   - The biology stays identical through W3. It changes at the W4 module flip only through `mut.module` options, which the registryWith proof and the moduleRegistryVersion 2 bump cover.
   - The Garden start ("56 alive") is unchanged.
9. **Build-level behaviour switches** (`FILM_DIGESTION_IMPLEMENTED`). W1 replaces them with world gates; g2-replay guards this. SPEC §15 says cross-version bit-identical replay "is not promised". I still recommend the replay test as the leak detector. A builder that must break it needs a rules version bump plus a DECISIONS entry.
10. **Module flips inside W4 would break the fence for the other builders.** Decision: W4 builders test via registryWith only; the lead flips all seven modules together afterwards.
11. **Protocol v2** (ENT_STRIDE 14, E_CUE2, E_LINKMASK). This is owned by art-features in W2, with fixed constant names so concurrent builders agree.

### Rules the docs leave open

12. **Fungal daughter topology.** Decision: F01/F02 daughters go only to free, attachable four-neighbor cells (the 16 mask tiles are a 4-bit N/E/S/W topology). F02 links form when both degrees are < 4; otherwise the daughter is placed unlinked and its birth record says so.
13. **Film as food.** Decision: for `digestsFilm` species, film comes after the listed foods (ordered policy), or is one more food (weighted policy).
14. **SEDIMENT_EDGE detritus N.** Decision: 0.010 N per cell (the DEBRIS 0.10 N/C ratio).
15. **E04 support and non-motile carriers.**
    - Support = a four-adjacent stone, wall or bead (mesh in Phase 5).
    - Y01/Y02 carriers anchor and pay the upkeep with no movement effect. This is the literal rule, and it makes E04 a pure cost for them; flag for the owner.
16. **Clean water scope.** Decision: remove dissolved, activity and viral kinds (and companions); restore the O2/CO2 baseline. Sample modes: viral units belong to Life, activities to Dissolved.
17. **Food-access overlay** (undefined in the docs). Decision: per cell, the carbon the selected organism's species can eat now; with no selection, the carbon enzymes made accessible in the last second.
18. **EXP_203 "compare branch without B08".** Decision: a new experiment change kind, `omitFounders {founderIndex}`.
19. **E212 as a player card needs pre-linked founders with set B.** Decision: founder `cells`, a labelled `initial` override and `links: 'chain'` (F02 only, validated).
20. **Curated placement.**
    - D04 §8 says seeded uniform scatter, while the realizer is nearest-first. Decision: a founder `placement: 'scatter'` option using one new RNG stream, `founder.place`.
    - "Open water" means Water Garden with its stones and the lid open.
    - Curated dishes appear in the New Dish Basics picker; the Play shelf is unchanged until Phase 4.
21. **Guide texts name later-phase species** (e.g. Lantern and Rampart in OIL/INH texts). Decision: error in summary/example, warning in rules; W5 fixes the offenders.
22. **Journal and badges.** Decision: relationship observations come from committed sim events and are stored in the local UI journal store (P2.8), not in saves. Badges are cosmetic, with no timers or streaks.
23. **Keyboard placement.** Decision: a center reticle plus Enter commits one gesture.
24. **Haptics and audio.** Decision: `navigator.vibrate`, off by default, no new Capacitor dependency (note the VIBRATE permission for P4.10). "Manual listen" becomes an owner item using `tools/audio-preview.html`.
25. **Attached-species tests before their flip.** `registryWith(..., { allowUnimplemented })` is test-only and must be named in the report whenever it is used.

### Environment

26. Four builders on 2 CPUs is slow. Builders run targeted vitest files only, and each e2e run uses its own port and outdir. The fence test must stay under about 60 s.
27. Phase 2 wave B/C file names may differ (Lab tray, Overlay picker, `journal.ts`, NewDish sections). The prompts say to verify with git grep.
28. The Phase 2 lab builder owned `src/sim/structures.ts` for placement helpers. The stage8 prompt tells the W1 builder to leave those untouched.

### Critical files for implementation
- /workspaces/pixelmeba/src/sim/structures.ts (stage 8 reservation order, construction, F02 hook)
- /workspaces/pixelmeba/src/sim/entities.ts (+ /workspaces/pixelmeba/src/sim/serialize.ts: schema 3, links, stores, stateHash)
- /workspaces/pixelmeba/src/sim/recipes.ts (`worldContentFor`, the global-manifest realization behind every FIRST_DISH_V1 hash change)
- /workspaces/pixelmeba/src/sim/content/registry.ts (+ /workspaces/pixelmeba/src/sim/content/implemented.ts and /workspaces/pixelmeba/content/manifest.json: enabling and system requirements)
- /workspaces/pixelmeba/docs/agent/g2-wave-b.workflow.js.txt (the template every Phase 3 wave file copies)