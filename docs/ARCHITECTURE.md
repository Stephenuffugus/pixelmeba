# ARCHITECTURE — stack, data, protocol, pipelines, platforms

Version 1.0 · 2026‑09‑27 · Canonical. Mechanics are in `PIXELMEBA_IMPLEMENTATION_SPEC.md`.

---

## 1. Stack and toolchain (pin exact versions at project creation; commit the lockfile)

| Layer | Choice | Notes |
|-------|--------|-------|
| Language | TypeScript, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ES2022 | No `any` in `src/sim`. |
| Build | Vite (current stable) | `base: './'`; worker as ES module; `build.target: 'es2022'`; sourcemaps on. |
| Rendering | PixiJS 8.x | Canvas for the dish only. Nearest‑neighbor scale mode. |
| UI | Preact + `@preact/signals` | Semantic HTML; no CSS framework; CSS custom properties; light chrome per UX §6. |
| Validation | Zod | Content schemas and save/import validation share the same schemas. |
| Tests | Vitest (unit/fixtures), Playwright (e2e + axe‑core) | Fixtures run headless in Node using the same sim code as the worker. |
| Lint/format | ESLint (typescript‑eslint recommended‑type‑checked, `no-floating-promises`, custom rule forbidding `Math.random`, `Date`, `performance.now`, `for…in`, `Map`/`Set` iteration inside `src/sim`), Prettier | `npm run check` = typecheck + lint + vitest. |
| Native | Capacitor (current stable) + Android Gradle | Plugins: `@capacitor/app`, `@capacitor/filesystem`, `@capacitor/share`, `@capacitor/preferences` (settings only), `@capacitor/splash-screen`, `@capacitor/status-bar`. |
| Node | current LTS, recorded in `.nvmrc` and `engines` | |
| PWA | `vite-plugin-pwa` (precache) | Web/arcade offline play. |

No server, analytics, crash SDK, remote config, ads, IAP, or runtime AI. No other engines.

## 2. Repository layout and scripts

```
content/                  # versioned JSON packs (validated by Zod)
  manifest.json           # versions, enabled IDs/systems, contentHash
  species/*.json  materials/*.json  modules/*.json  habitats/*.json  structures/*.json
  recipes/*.json  experiments/*.json  variants/*.json  objectives/*.json  loci.json
art/
  src/palette.ts          # named colors (UX §6.1)
  src/sprites/<speciesId>.ts   # pixel matrices per state/heading
  src/tiles/*.ts  src/effects/*.ts  src/layers/*.ts  src/icons/*.ts
public/atlas/             # generated: organisms.png, world.png, manifest.json (committed)
src/
  sim/      core/ (world, tick, stages) fields/ transport/ entities/ genome/ modules/ tools/ ledger/ hash/ rng/ recipes/ objectives/ equipment/ observe/
  worker/   sim.worker.ts protocol.ts snapshot.ts scheduler.ts
  render/   app.ts scene/ atlas.ts overlays.ts aggregation.ts camera.ts selection.ts
  ui/       main.tsx app/ views/ (explore, lab) panels/ inspector/ trays/ notebook/ settings/ strings/ hooks/
  persistence/ adapter.ts idb.ts capacitorFs.ts save.ts export.ts import.ts migrations/
  audio/    soundkit.ts patches.ts narration.ts
  diagnostics/ ledgerAssert.ts stateHash.ts perf.ts
  platform/ capacitor.ts web.ts (lifecycle, share, files)
tools/      content-validate.ts sim-run.ts sim-tune.ts art-build.ts asset-preview.html store-assets.ts bug-export.ts
tests/      sim/ fixtures/ content/ persistence/ worker/ ui/ recipes/ experiments/  e2e/*.spec.ts
android/    Capacitor project (no local.properties, no keystores)
store/      generated icon, feature graphic, screenshots, listing text
docs/       canonical docs, reports/, WORKLOG, DECISIONS, EXPANSION_RESPONSE
```

Scripts (package.json): `dev`, `build`, `preview`, `check`, `test`, `test:e2e`, `typecheck`, `lint`,
`content:validate`, `sim:run`, `sim:tune`, `art:build`, `store:assets`, `android:sync`,
`android:build:debug`, `android:build:release` (documents signing), `bug:export`.

## 3. Module boundaries (enforced by ESLint import rules)

| Module | May import | Must not import |
|--------|-----------|-----------------|
| `src/sim` | `content` types, `src/sim/**` | DOM, PixiJS, Preact, persistence, worker, network |
| `src/worker` | `src/sim`, `src/persistence` (serialize only) | DOM, PixiJS, Preact |
| `src/render` | snapshot types, atlas manifest | `src/sim` internals (only `types`), Preact |
| `src/ui` | `src/worker` client, `src/render`, `src/persistence`, `src/audio`, strings | `src/sim` internals (only `types` and `deriveProfile` for previews via worker) |
| `src/persistence` | `src/sim` serialize types, Zod schemas | DOM rendering |
| `tools` | `src/sim`, `src/persistence`, Node | browser globals |

The main thread never mutates authoritative arrays. It holds only the latest snapshot.

## 4. Content schema (Zod; all IDs are stable, uppercase, saved in files)

```ts
Species { id, contentVersion, name, category, transportClass, b0, intakeRate, maintenanceRate,
  minDivisionAge, maxAge, speed, sensingRadius, attackCooldown?, habitats[], attachment?: {surfaces[]},
  metabolism: 'aerobic'|'anaerobic'|'photosynthesis'|'mixotroph'|'hostDrain'|'viral',
  energyPerCarbon, acidPerCarbon?, foodPriority[], digestsFilm?, preyIds[], hostIds?, viralHost?,
  tolerances: {ph:[a,b], warmth:[a,b], salinity:[a,b], moisture?:[a,b]},
  nativeAbilities[]  // 'E_STARCH_SECRETION','BIOFILM','DORMANCY','SIGNAL_GLOW','RIVALRY','TRAP','TRANSPORT_LINKS','RESTING_DAUGHTER','SHELL','CANOPY','MIXOTROPHY','HANDLING_4S', ...
  lociActivity: boolean[8], frameSize: 16|32|48, headings: 1|4, assetId, guideText, phase }
Material { id, kind:'field'|'deposit'|'object'|'paint'|'structure', target, units, doses[], transportClass,
  decay?, effectModule?, companionNutrientPerCarbon?, iconId, guideText, phase }
Module { id, name, eligibleAncestors[], excludes[], requires[], surchargePerSecond: 0.02,
  params{}, visualLayer, guideText, phase }
Habitat { id, name, geometry: ops[], fields: {…}, lid, lightMode, drying, moisture, guideText }
Structure { id, kind:'cell'|'edge'|'furnishing'|'device', rule params, iconId, phase }
Recipe { id, revision, habitatId, seed, lid, lightMode, drying, mutationPreset, founderMode,
  manifestOverrides, fieldPatches[], founders[], scheduledCommands[], testOnlyOverrides[],
  expectedObservationsText, phase }
Experiment { id, seed, question, recipeId, intervention?, predictedTradeoff, measurements[],
  stoppingPoint, confounds, observationGate: predicate, phase }
Variant { id, revision, sourceId, sourceRevision, requiredCapabilities[], title, question,
  patch: {kind:'fieldPatchScale'|'fieldPatchMove'|'deviceState'|…, …}, previewDifference, objectiveId?, phase }
Objective { id, type, params, durationSeconds? }
Manifest { simulationVersion: 3, evolutionRulesVersion, moduleRegistryVersion, phenotypeMappingVersion,
  contentVersion, contentHash, enabledSpecies[], enabledModules[], enabledSystems: {enzymes, film, fungi,
  parasites, viruses, chemistry, climate, barriers, devices, equipment, developmental, …},
  mutationPreset, founderMode, livingLabVersion? }
```
Validator rules: unknown IDs are errors; a species requiring a native ability not implemented in
the sim registry is "unavailable" (error if enabled); non‑finite or negative values error;
duplicate IDs error; every enabled entry needs `guideText` and (from Phase 1) required assets.
`contentHash` = SHA‑256 over canonical JSON (sorted keys, no whitespace) of all packs.

## 5. Data layout (performance‑critical)

- **Fields**: one `Float64Array(16384)` per allocated field, plus a second buffer for transport.
  Row‑major index `y * 128 + x`. Precomputed `maskIndex: Uint16Array` of playable cells; per‑cell
  `substrate: Uint8Array`, `passable: Uint8Array`, `attachable: Uint8Array`, `shade: Float32Array`,
  edge barrier arrays (4 per cell, `Uint8Array` class codes).
- **Entities**: struct‑of‑arrays with capacity 6,000: `alive: Uint8Array`, `species: Uint16Array`,
  `x,y: Float64Array`, `B,N,E,H,age,mealC,mealN,boundMineral,jacketMineral: Float64Array`,
  `genome: Uint32Array` (index into genome table), `birthId: Uint32Array`, `entityId: Uint32Array`,
  `state: Uint8Array` (life state enum), timers as `Float32Array`/`Uint32Array`, refs as
  `Int32Array` (−1 = none): `hostRef, parasiteRef, targetRef, partnerRef, proposalRef`,
  `links: Int32Array(6000*4)`, `adhesion: Int32Array(6000*2)`, `flags: Uint32Array` (bit set).
  Free list for slots; iteration ascending by index.
- **Genome table**: array of `Genome` objects deduplicated by canonical key; `profileCache:
  Map<string, Profile>` keyed by `${genomeId}:${lifeStateKey}` (Map is allowed here because it is
  never iterated for simulation order).
- **Spatial index**: per cell `head: Int32Array(16384)` + per entity `next: Int32Array(6000)`
  linked lists rebuilt after stage 4; neighborhood queries iterate cells in fixed order.
- **Requests**: per stage, scratch arrays reused (no allocation in the hot loop).
- **Events**: ring buffer of structs (typed arrays + a small string table for names).
- **History**: ring buffers per series; compaction into one‑minute summaries.

## 6. Determinism primitives
```ts
// 32-bit mixer (murmur3 fmix / splitmix32 style) over canonical encoding of args
det(worldSeed: u32, streamId: string, ...keys: (number|string)[]): u32
detFloat(...): number      // [0,1)
detPick<T>(arr: T[], ...): T
stateHash(world): string   // FNV-1a 64 (BigInt) or xxhash32 over canonical serialization
sha256(bytes): Promise<string>  // Web Crypto; pure-JS fallback in Node tests
```
`streamId` strings are frozen constants (SPEC §15). Cosmetic RNG: separate xoshiro128** seeded
per session, never saved, never read by the sim. ESLint forbids `Math.random` outside
`src/render` and `src/audio`.

## 7. Worker protocol (versioned; `protocolVersion: 2`)

Main → Worker:
```
init {requestId, dishId, source: {recipeId, seed, manifest} | {save}}
command {dishId, command: {commandId, targetTick, seq, kind, payload}}
setSpeed {dishId, speed: 0|'step'|1|2|4}
requestSnapshot {dishId, overlay?: FieldId, detail?: {kind:'entity'|'cell'|'colony', id|cell}}
requestHistory {dishId, series[], window}
requestLineage {dishId, rootBirthId, depth}
save {dishId}            → returns serialized bytes + hash
duplicate {dishId}       → new dishId
compare {baselineDishId, interventionCommands[], ticks}
hash {dishId}
undoSnapshot {dishId}    → capture / restore
dispose {dishId}
```
Worker → Main:
```
ready {requestId, dishId, tick, manifest}
snapshot {dishId, tick, generation, effectiveSpeed, renderList (transferable), aggregation (transferable),
          overlayField? (transferable Float32Array), structures, deposits summary, detail?, capacityReached}
events {dishId, fromTick, toTick, events[]}
history {dishId, ...}
saved {dishId, bytes, hash}
error {dishId, message, lastValidTick}   // dish is paused; last valid state preserved
```
Every packet carries `requestId` where applicable and `stateGeneration`; the main thread discards
stale packets. Commands are acknowledged with accepted/rejected amounts. Buffers are pooled and
transferred; the worker never detaches authoritative arrays.

As built (Phase 4 wave 5a, P4.1 favorites and P4.3 garden-home; `src/worker/protocol.ts`;
`PROTOCOL_VERSION` stays 2, every addition is a new message or an optional field):
```
Main → Worker
notebookGet {requestId, dishId, inspect?: birthId}      → notebook (with `inspect`: that living
                                                          organism's inspector payload as `inspected`)
favorite {requestId, dishId, op: FavoriteOp}            → notebook
  FavoriteOp = follow {birthId, nickname|null, pattern} | rename {id, nickname|null}
             | pattern {id, pattern} | representative {id, birthId} | unpin {id} | pin {id}
  pattern = 'circle' | 'triangle' | 'square'
sessionSummary {requestId, dishId, sinceTick}           → sessionSummary (read-only; unlike `history`
                                                          it records no experiment player step)
exportDish {…, strip, includeNicknames?}                 // default off: nicknames are left out
exportSave {…, slotId, includeNicknames?}                // default off: the stored file's notebook is
                                                          // re-sealed without nicknames (one that could
                                                          // not be read goes out as the empty record read
                                                          // in its place, i.e. left out)
Worker → Main
notebook {requestId, dishId, record: NotebookRecord, refused?, removed?, inspected?: EntityInspect|null}
notebookChanged {dishId, record, change: NotebookChange}   // unsolicited
  NotebookChange = favoriteExtinct {id, removed?}
                 | favoriteRepresentativeGone {id, candidates: birthId[]}
                 | favoritesRestored {removed: name[], unpinnedRemoved?: name[]}   // after Undo/rollback
sessionSummary {requestId, dishId, summary: {births[], deaths[] (per species index),
                branches [{id, name, tick}], fromTick, toTick, compacted}}
loaded {…, notebookDropped?: message}     // the file's notebook could not be read; the dish loaded
snapshot {…, favorites?: {marks: Uint8Array, member: Uint8Array, slots: FavoriteSlotMark[]}}
```
A favorite op is notebook state, never a `CommandPayload`: it is not in the command log, the world
or its state hash. `notebook.refused` says why an op was not applied; `removed` names an unpinned
favorite removed to make room. `snapshot.favorites` is absent when no family is followed; per entity
in `ents` order, `marks` bit k = a highlighted member of active slot k (k = 0…2) and bit 3 + k = that
slot's representative (highlighting stops at FAVORITE_HIGHLIGHT_MAX members; beyond it a slot's
`aggregate` gives the members' mean position and count), and `member` bit k = any member of slot k.
Each `FavoriteSlotMark` carries id, pattern, living `members`, `highlighted`, `aggregate`,
`representativeEntity` (null when it is not alive in the dish), `representativeHeld` (in the held
sample), `next` and `candidates` ([birthId, birthTick, speciesIdx] for Follow next) and generation
`depth`. Thumbnails (`src/worker/thumbnail.ts`, `pt1:<species ids>:<base64 32×32 grid>`, a pure read
of living positions) are optional display copies: `SlotSummary.thumb` (from the slot index),
`NewDishPreview.thumb` (the Play shelf's start) and, in persistence, `SaveRequest.thumb` →
`SlotInfo.thumb`, read from the saved file's own state and outside its checksum.

As built, Phase 4 wave 5b (P4.2 story cards, P4.4 goals; `PROTOCOL_VERSION` stays 2):
```
Main → Worker
storyMark {requestId, dishId, id, mark: 'seen' | 'dismissed'}   → notebook   (no command, no world change)
goalStart {requestId, dishId, objectiveId}                       → notebook (refused? when another goal
                                                                   runs or the dish does not offer it)
goalLeave {requestId, dishId}                                    → notebook
goalShown {dishId, id}                                           // the sentence was dismissed; no answer
goalCatalog {requestId, targetDishId|null, recipeId|null}        → goalCatalog (read-only; the dish's offers,
                                                                   or the Play card's recipe)
Worker → Main
goalCatalog {requestId, goals: GoalOffer[]}   // {id, title, summary, completedText, endedText|null}
notebookChanged … NotebookChange also =
                 | story {id, notify}                 // a card recorded or joined; notify = the one notice
                 | storiesRestored {removed: n}       // after Undo/rollback: cards from the undone time
                 | goal {id, state}                   // completed, ended or left (the record has details)
```
After Undo or an error rollback the worker re-checks the notebook against the restored dish
(`notebookAfterRestore`) and posts every change that applies, in order (favoritesRestored,
storiesRestored, then one `goal` per ended attempt: endReason 'undone' after Undo, 'failed' after a
rollback), each with the final record.

As built, Phase 4 wave 6a (P4.6 share, P4.7 Try my dish, P4.8a relationship map and region probes;
`src/worker/protocol.ts`; `PROTOCOL_VERSION` stays 2, every addition is a new message or an optional field):
```
Main → Worker
recipeExport {requestId, dishId}                         → recipeExported | error {request 'recipeExport',
                                                           kind 'no-start', message} (read-only: only the
                                                           dish's recorded start is read; a comparison copy,
                                                           a start not recorded or one made by other
                                                           content or rules is 'no-start')
recipeImport {requestId, text, newDishId, keepFrom?}     → loaded | keepRefused | error {request
                                                           'recipeImport', kind} (the file is checked and
                                                           realized from this build's content first; a
                                                           refusal keeps and changes nothing; the dish
                                                           opens paused at tick 0)
recipeIdStart {requestId, id, newDishId, keepFrom?}      → ready | keepRefused | error (bundled ids, exact
                                                           revisions, valid seeds only; built first, then
                                                           keepFirst action 'start')
exportDish {…, strip, includeNicknames?}                 // the Share sheet's Living dish: unchanged message,
                                                          // sent while the open sheet holds the dish paused
                                                          // (src/ui/share.ts openShare); `strip` also blanks
                                                          // a turn's prediction note and baseline name
                                                          // (withoutTurnNotes)
trySetup {requestId, dishId}                             → trySetup (read-only)
tryStart {requestId, dishId, newDishId, objectiveId|null, horizonSeconds 60|180|600, prediction, keepFrom?}
                                                         → tryStarted | tryRefused | keepRefused
tryNext {requestId, dishId, newDishId, discard}          → tryStarted | tryRefused (no keep flow)
tryFinish {requestId, dishId}                            → tryTurn
relationshipMap {requestId, dishId, windowSeconds 60|180|600}   → relationshipMap (read-only)
probeSet {requestId, dishId, probes: ProbeMask[] (≤ 6), windowSeconds?}   → probes
probeRead {requestId, dishId, windowSeconds}             → probes (read-only)
Worker → Main
recipeExported {requestId, text, filename, name, question|null, identity|null,
                versions {simulationVersion, evolutionRulesVersion, contentVersion, contentHash}}
trySetup {requestId, dishId, goals: TryGoalOption[] (GoalOffer + durationSeconds|null), refusal|null}
tryStarted {requestId, info: DishInfo, turn: TurnRecord, kept?: WhatIfKept}   // kept: tryStart only
tryRefused {requestId, code: TryRefusalCode, message}    // nothing was changed
  TryRefusalCode = 'not-here' | 'bad-request' | 'shelf' | 'unsaved' | 'baseline-missing' | 'no-turn'
tryTurn {requestId?, dishId, turn: TurnRecord|null}      // the answer to tryFinish, or unsolicited
tryHorizon {dishId, turn, elapsedTicks, goal: GoalRecord|null}   // unsolicited: the horizon card
relationshipMap {requestId, dishId, map: RelationshipMapData}
probes {requestId, dishId, masks: ProbeMask[], readings: ProbeReadings, refused?}
DishInfo.turn?: TurnRecord                               // the dish's turn, when it is a turn dish
```
- `error` gained nothing new: a recipe refusal is the existing `error {dishId, requestId, message,
  lastValidTick 0, paused false, request, kind?}`; a RecipeFileError refusal of `recipeExport` or
  `recipeImport` carries its kind ('size' | 'json' | 'format' | 'version' | 'content' | 'integrity' |
  'checksum' | 'no-start'). Any other `recipeImport` failure (a `newDishId` already in use) goes through
  the generic catch with no kind, and a refused `recipeIdStart` is the readable text (recipeId.ts) with
  no kind.
- Try my dish (D-0081, D-0082) is notebook state, never a `CommandPayload`. `tryStart` refuses
  ('not-here': a comparison copy, a held sample, a failed dish, no storage; 'bad-request': a turn length
  other than 60/180/600 s, a goal the dish does not offer or whose duration does not fit, a new dish id in
  use) before anything changes. Then the dish is paused and its save is built at that tick; the shelf's
  limit and storage preflight ('shelf') are checked before the open dish is kept (keepFirst action
  'tryDish'); the save then goes on the shelf as a baseline (a failed write is 'shelf') and turn 1 is
  cloned from the record just written (paused, at the baseline tick, with the try's goal started at that
  tick). A baseline that is missing or fails its checks is 'baseline-missing'. `tryNext` needs a turn at its horizon ('no-turn' otherwise) and, unless its kept
  slot still holds it exactly, `discard: true` ('unsaved'); the prior turn dish is let go, never written.
- A turn never runs past its horizon: `setSpeed` (non-zero) and `step` on a turn at its horizon leave it
  paused and post `tryHorizon` again; the run loop stops at the horizon tick and posts `tryHorizon`.
  `tryTurn` is posted when the record changes otherwise (kept, Finish, Undo or a rollback below the
  horizon, a change that makes a kept turn unkept). `tryFinish` sets the state 'finished'; the dish stays
  open as an ordinary paused dish.
- The relationship map and the region probes are worker session state for a played dish (never saved,
  hashed or read by the simulation; never commands). An unknown window reads as 60. `probeSet` replaces
  all masks; a refused set (a comparison copy, or `probeSetProblem`) changes nothing and the answer
  carries `refused` with the current masks and readings.

## 8. Snapshots
Published ≤ 10/s (adaptive under load). Contents: `renderList` as a packed `Float32Array`
[entityIndex, speciesIdx, x, y, heading, scale/sizeFactor, stateFlags, cueBits] per living
entity; `aggregation` per cell `Uint8Array` dominant species + `Uint8Array` density band for
wide zoom; `overlayField` only for the active overlay (Float32 copy); film/deposit glyph
summary; structure/device/object list; selection detail on request (full inspector payload with
reason codes and measured values). Renderer interpolates positions between snapshots and plays
state animations from flags; nothing else.

As built (protocol 2, Phase 3 wave 2; `src/worker/protocol.ts`): `ents` has ENT_STRIDE 14 per
entity — slot, species, x, y, heading, flags, growth (B / 2·B0), energy, health, life state, size,
`E_CUE` (Phase 1–2 cue and module bits), `E_CUE2` (Phase 3 bits: infected, parasitized, anchored,
linked, E04/E06/E07/E08/E09/E10/E12 carried, seeking light, detritus intake, releasing protein) and
`E_LINKMASK` (fungal link directions N 1, E 2, S 4, W 8; bit 4 = a transport transfer this second);
every slot is written for every entity (0 when none). `deposits` has 7 bands per cell: starch,
detritus, oil, protein, sugar haze, catalysis, film (low 7 bits = film C, 0.50 C = 127; bit 7 =
eroding, from worker-side scratch). `links` is a `Float32Array` [x1, y1, x2, y2, kind] per adhesion
link (each pair once); `objects` lists the food objects [{id, x, y, kind, fill}] with fill = remaining
C / full inventory. VisualEvent types add `objectEmptied` (a fading stain).

## 9. Rendering (PixiJS 8)
- World unit = one cell. Base scale 4 px/cell at zoom 1 (512 px dish). Zoom presets: whole dish
  (fit), neighborhood (8 px/cell), close (16 px/cell). Sprite scale = `pxPerCell / 8` snapped to
  {0.5, 1, 2, 3, 4}; below 1 (whole dish) individual sprites are hidden and the aggregation layer
  draws per‑cell dominant color/texture with density; overlays are textures from the overlay
  field with a legend.
- 16×16 source frames represent a 2×2‑cell footprint at scale 1 (visible body ≈ 1 cell); 32×32 =
  4×4 cells; 48×48 = 6×6. Anchor at frame center. Nearest‑neighbor everywhere.
- Layers (bottom→top): background/dish, substrate tiles, shade/roof, structures and film,
  deposits and food objects, organism bodies, feature rims (module/size layers), status marks,
  links/bonds, selection, camera‑space HUD is HTML.
- Camera: pan, pinch/wheel zoom, presets, follow (middle‑half rule), Find, Spotlight. Camera
  state lives in UI, never in the sim.
- Selection: ring/bracket outside the body; candidate list for ambiguous taps (proximity, then
  id). Selection radius is separate from collision.
- Effects: particles are cosmetic, budgeted, and dropped first under load.

## 10. Art and audio pipelines

### 10.1 Art authoring model
Every sprite is a TypeScript pixel matrix: an array of strings, one character per pixel, mapped
through a palette (`.` = transparent). Example:
```ts
export const B01 = defineSprite({ id: 'b01_sprinter', species: 'B01', size: 16, headings: 4,
  palette: { a: P.sprinterCoral, b: P.sprinterBand, o: P.outlineDark },
  states: { move: [frame0, frame1, frame2, frame3], reproduction: [...4], stress: [...2], death: [...3] },
  durations: { move: 120, reproduction: 90, stress: 400, death: 120 } });
```
`tools/art-build.ts` packs frames into atlases (2 px transparent padding, power‑of‑two sheets),
derives the other three headings by authored variants (never runtime rotation), emits
`public/atlas/manifest.json` (assetId, speciesId, frame rects, anchor, duration, animation name,
loop rule, reduced‑motion fallback frame, export hash) and fails on missing required states for
enabled species. Output is deterministic (same input → same bytes). `tools/asset-preview.html`
shows every state, heading, scale, grayscale, dense group and overlay.

Required frame counts (UX §6.2): small organisms 4 move/idle, 4 reproduction, 2 stress, 3 death;
large organisms 6 move, 4 feeding, 4 reproduction, 2 stress, 4 death; fungi 16 connection‑mask
tiles + tip/bud/decaying; film isolated/edge/center/eroding; dormancy prepare/rest/wake; trap
open/holding/cooldown; Lantern dim/glow; Turnleaf two modes; reserve 4 bands; jacket 4 levels;
cache 4 fills; role marks ×5; partner bracket; link pixels.

### 10.2 UI icons
Inline SVG components (24 px glyph in 48 px target), single color via `currentColor`, with
selected/disabled/focused states in CSS. Never pixel‑scaled bitmaps for UI.

### 10.3 Audio
`SoundKit` synthesizes cues with Web Audio from patch definitions `{cueId, oscillator/noise,
envelope, pitch, filter, gain}`: `drop`, `select`, `save`, `discovery`, `compare_result`,
`division`, `placement_ok`, `card_open`, `gate_click`, `wake`. Rate limiter: ≤ 4 world cues/s,
coalescing repeats. Ambient loop: low‑passed noise + slow detuned sine pad, −24 dB, separately
controllable. Music/effects/voice volumes; mute; pause on suspension. Cue IDs are stable so
recorded assets can replace patches later. Narration: `SpeechSynthesis` with the fixed 16‑phrase
set, feature‑detected, off by default, text equivalents always present.

## 11. Persistence

### 11.1 Adapter
```ts
interface StorageAdapter {
  list(): Promise<SlotMeta[]>
  read(slotId): Promise<Uint8Array>
  writeAtomic(slotId, bytes, checksum): Promise<void>   // temp → verify → rename/swap; keeps predecessor
  readPredecessor(slotId): Promise<Uint8Array|null>
  remove(slotId): Promise<void>
  usage(): Promise<{bytes, quota?}>
}
```
Web: IndexedDB (one object store for records, one for pointers; write new record, then update
pointer in a second transaction; old record retained as predecessor). Android: Capacitor
Filesystem in `Directory.Data/pixelmeba/slots/<id>/` with `current.json`, `previous.json`,
`current.tmp`; write tmp → read back and verify checksum → rename to current after moving current
to previous. Settings only in Preferences.

### 11.2 Save format
```
{ "format": "pixelmeba-save", "schemaVersion": 1, "appVersion": "…",
  "manifest": {…}, "worldId": "…", "createdAt": "…", "savedAtTick": n,
  "state": { …authoritative world… , typed arrays as {"dtype":"f64","b64":"…"} },
  "presentation": { camera, favorites, notebook refs, viewPreference },
  "checksum": "sha256:<hex of canonical state payload>" }
```
Canonical payload = `state` serialized with sorted keys and no whitespace. The same schemas
validate import. `.pixelmeba` export = the save (or recipe) file. Recipe export uses
`"format": "pixelmeba-recipe"`.

As built, the notebook block (P4.1, D-0070; `src/persistence/notebook.ts`, `saveFile.ts`): the
"presentation" favorites live in an optional top-level `"notebook"` sibling of `"state"`, outside
the state checksum, so neither the world checksum nor the stateHash changes with it; nothing in
`src/sim` imports it.
```
"notebook": { "format": "pixelmeba-notebook", "notebookVersion": 1, "worldId": "…",
  "favorites": [ { id "fav-<n>", rootBirthId, speciesId, nickname|null, pattern, representative,
                   active, createdTick, members [[birthId, birthTick]…], historyIncomplete,
                   extinct {tick, lastBirthId, cause, cell}|null } ],
  "nextFavorite": n,
  "checksum": "sha256:<hex of the canonical record without checksum>" }
```
- It has its own version and checksum. On load (`readNotebook`), the envelope, the version
  (≤ NOTEBOOK_VERSION), the world id, every favorite (unknown fields are problems; at most 3
  followed and 20 unpinned), its references against the dish (species, birth ids below
  `nextBirthId`, no extinction after the dish's tick), the size (canonical JSON at most
  NOTEBOOK_MAX_BYTES = 1,048,576 characters) and the checksum are checked. A missing kind key reads
  as `[]`; an unknown key is a problem.
- Any problem drops the whole record: the world still loads with an empty notebook and the load
  answer carries `notebookDropped` (NOTEBOOK_DROPPED_TEXT, shown to the player). A file without a
  notebook (every save written before P4.1), or with `"notebook": null`, loads with an empty one and
  no message.
- An empty notebook (no favorite) is not written. Device saves (named slots, the autosave, keep
  writes, automatic checkpoints) keep nicknames; an export keeps them only by the player's opt-in
  (`includeNicknames`, "Include family nicknames"; default off, and "without names" always drops
  them). The slot index copies the notebook's checksum (`notebookChecksum`), so a change made only to
  the notebook is still written by the next autosave.

- Wave 5b adds two optional kinds (P4.2, P4.4; a record written before them reads them as `[]`, and
  an empty notebook is still one with no favorite, story card or goal):
  - `"stories"` (`src/persistence/notebookStories.ts`, at most 50 per dish): `{ id "story-<n>",
    template firstSplit|enzymeAtWork|familyChanged|placeChanged, key, worldId, ruleset
    {simulationVersion, evolutionRulesVersion, moduleRegistryVersion, contentHash}, evidence
    ["event:<id>" | "reaction:<enzyme>:<second>:<cell>" | "branch:<id>" | "traits:<region>:<second>" |
    "command:<seq>"]…, summary {the template's fields}, timeRange [from, to], imageRefs [],
    favoriteId|null, notified, seen, dismissed }`. A card without evidence, or with a value, species,
    birth id or time the dish never had, is a problem.
  - `"goals"` (`src/persistence/notebookGoals.ts`, at most 20 per dish, at most one running): `{ id
    "goal-<n>", objectiveId, title, predicate (copied at Start), state
    running|completed|ended|continuedFreely, startTick, endTick|null, endReason?
    zero|undone|failed|cannotResume|left, progress {startTick, holdSinceTick|null, state,
    lastEventId?}, value?, shown }`. The load check also refuses a running goal the dish cannot run
    (its recorded manifest, fields and event ids: `goalWorldRefsOf`).

As built, Phase 4 wave 6a (P4.6, P4.7; D-0081, D-0082):
- **The shelf** (`src/persistence/shelf.ts`): write-once stored saves kept outside the ten named slots,
  modelled on the checkpoint ring. A record is a full save file (the same text, checksum and gzip record
  as a slot) with an index entry (SlotInfo: name, tick, savedAt, recipeId, worldId, bytes, checksum,
  `automatic: true`, `previous: null`) plus `shelfKind` ('baseline' | 'snapshot') and `createdFor` (the
  try id 'try-<n>' or a bookmark id).
  - Slot ids are `shelf-<kind>-<sequence>-<writer>` (SHELF_SLOT_PREFIX 'shelf-'; the sequence is 1 + the
    highest held of that kind, eight digits; the writer is a per-page random token so two tabs never
    choose the same id).
  - Per-device limits (SHELF_LIMITS): 10 'baseline' (Try my dish starting points), 20 'snapshot'.
  - `put` never overwrites, evicts or deletes: over the kind's limit, or failing the storage preflight
    (room for this record and one more save of the same compressed size), or when the id is already held,
    it refuses with readable text and nothing changes. Otherwise it writes the record and its index entry
    in ONE `backend.commit` (atomic: a failed commit changes nothing). `check` is the same refusal,
    read-only.
  - `get` returns a record only when its stored checksum equals the index's, the text decompresses and the
    caller's verify accepts it (Try my dish: kind 'baseline' and the save's own checksum equal to the
    turn's recorded one); otherwise null, never a predecessor or another record.
  - Hidden from the named slots: `SaveStore.list()` (the slot list) and `SaveStore.slot()` ignore shelf
    ids, `freeSlot()` only ever names slot1…slot10, and `SaveStore.remove()` (the `deleteSlot` request) refuses one with
    SHELF_REMOVE_REFUSED. Only `Shelf.remove` deletes a record, on an explicit player action. A shelf id
    sent to `loadSlot` opens as a new branch, as a checkpoint does.
- **The 'turns' notebook kind** (`src/persistence/notebookTurns.ts`; a record written before it reads it as
  `[]`, and a notebook holding a turn is not empty): at most one per dish (TURNS_MAX), only in a Try my dish
  turn dish; a copy of the dish (Duplicate, a checkpoint branch) never carries it (`favoritesOnly`).
  ```
  "turns": [ { tryId "try-<n>", baseline { shelfId "shelf-baseline-<seq>-<writer>",
               checksum "sha256:<64 hex>", worldId, tick, name (≤ 60 characters) },
               turn (1, 2, …), turnWorldId (= the notebook's worldId), startTick (= baseline.tick),
               horizonTicks 600|1800|6000, objectiveId|null, prediction (control characters as spaces,
               trimmed, ≤ 200 characters; '' when none), state running|atHorizon|finished,
               kept {slotId "slot1"…"slot10"}|null } ]
  ```
  Unknown fields are problems. Against the dish the file carries (`turnsWorldProblem`): a turn starting
  after the dish's tick, or a turn not finished whose dish is past `startTick + horizonTicks`, is a
  problem. As for every kind, any problem drops the whole notebook with `notebookDropped` and the world
  still loads. "Without names or notes" exports (`withoutTurnNotes`) write `prediction: ''` and the
  baseline's name as "Shared dish".
- **The Starting recipe file** (`src/persistence/recipeFile.ts`; MIME `application/vnd.pixelmeba+json`,
  file name "<recipe name>-recipe.pixelmeba"): how a dish STARTED, never a later command, descendant,
  notebook or player name.
  ```
  { "format": "pixelmeba-recipe", "recipeFileVersion": 1, "appVersion": "…",
    "name": "<the recipe's or variant's own name>", "question": "…"|null,
    "versions": { simulationVersion, evolutionRulesVersion, moduleRegistryVersion,
                  phenotypeMappingVersion, contentVersion, contentHash },
    "source": { kind "recipe", recipeId, revision, seed, overrides {seed?, habitatId?, mutationPreset?,
                founderMode?, empty?} }
            | { kind "variant", variantId, variantRevision, sourceId, sourceRevision, seed,
                sourceChecksum, variantChecksum },
    "recipe": {the resolved recipe as realized}, "habitat": {its habitat preset},
    "enabledModules": [...], "expectedObservationsText": "…",
    "initialStateHash": "<stateHash of the realized start at tick 0>",
    "checksum": "sha256:<hex of the canonical file without checksum>" }
  ```
  - Export reads only the dish's recorded start (recorded New Dish choices or the variant record). It
    refuses ('no-start') a start that was not recorded, or a dish whose recorded contentHash, content,
    simulation, evolution-rules, module-registry or phenotype-mapping version differs from this build's.
    It realizes the start again and writes that world's stateHash.
  - Import (`parseRecipeFile`, `loadRecipeFile`) executes nothing from the file. It checks the size (at
    most MAX_IMPORT_BYTES, 25 MB), JSON, the envelope and exactly its keys, the file version (a newer
    one is "needs a compatible build"), finite numbers, the source's shape, a seed 0…4294967295, the
    recorded choices, every id and revision, and the checksum. Strict build match: the five version
    numbers and `enabledModules` must equal this build's; the start is then realized from this build's
    own content, and the realized source, recipe and habitat must equal the file's and its stateHash
    must equal `initialStateHash` (stateHash covers the contentHash, so any content change refuses).
    A refusal names its reason: not a recipe file ('format'), not valid JSON ('json'), larger than
    25 MB ('size'), "This recipe needs a compatible build (simulation n, rules n, content n)." (or "This
    recipe file needs a newer version of Pixelmeba." when a newer file's versions cannot be read), or a
    damaged/checksum message. Nothing outside the new world is created or changed.

### 11.3 Migrations
`src/persistence/migrations/<from>-to-<to>.ts`; each ships with an old‑save fixture in
`tests/persistence/fixtures/`. Migration outputs a new validated record and never alters the
input. Unknown newer versions produce a typed error surfaced as copy.

## 12. Android (Capacitor)
- `appId com.lucidwinds.pixelmeba`, `appName Pixelmeba`, `webDir dist`, `android.allowMixedContent
  false`, no cleartext, no network permission beyond what Capacitor needs (none for this app).
- Lifecycle: `App.addListener('pause')` → save + pause; `resume` → show paused with Resume;
  `visibilitychange` fallback in the web layer. Recovery on launch: load `current`, validate; on
  failure load `previous` and tell the user.
- Share: `@capacitor/share` with a temp file in `Directory.Cache`; import via `<input type=file>`
  (WebView) and, if needed, a file‑picker plugin. Cancellation is a no‑op.
- Splash and adaptive icon generated from `store/`. `targetSdkVersion`/`compileSdkVersion` at
  least the current Play requirement (verify against Capacitor's template and Play policy when
  building; record in `EXPANSION_RESPONSE.md`). Release builds as AAB; signing per
  `docs/ANDROID_SETUP.md` (owner‑held keystore; never committed).
- If the SDK is unavailable in the build environment, everything else ships and the exact
  commands for the owner are documented. Never fabricate a device measurement.

## 13. Performance discipline
- No allocation in stage loops; scratch buffers; typed arrays; avoid closures per entity.
- Neighborhood queries via the spatial index; contact checks only within the same and adjacent
  cells; enzyme/device work only on active tiles.
- Snapshot cost bounded: render list only for living entities; overlay only when active;
  aggregation as bytes.
- Renderer: sprite pooling; aggregation texture updated at ≤ 10 Hz; particles budgeted; text
  labels culled.
- Measure: `tools/sim-run --perf` prints tick p50/p95/p99 and stage breakdown; in‑app opt‑in
  diagnostics overlay shows tick ms, effective speed, snapshot ms, fps, memory (where available).
- Targets in SPEC §16; record machine/device for every number.

## 14. Web and arcade build
- `npm run build` → `dist/` with relative asset URLs; works from any subpath and inside an
  iframe; no `window.top`/`parent` access; `visibilitychange` pauses; optional
  `postMessage({type:'pixelmeba:pause'|'pixelmeba:resume'})` hooks.
- PWA: manifest (name, icons, standalone), precache service worker; first load online, then
  offline. No network requests at runtime other than same‑origin asset loads.
- `DEMO_MODE` (`import.meta.env.VITE_DEMO_MODE`): restricts New Dish species and Play shelf to
  the demo scope (SPEC/D09), same save format, imports of fuller saves rejected with a capability
  message. Default off.
- The owner will provide arcade manifest requirements later; until then the deliverable is the
  self‑contained `dist/` folder plus `store/` assets.

## 15. Tooling CLIs
- `content-validate` — see §4.
- `sim-run --recipe --seed --ticks [--commands file] [--hash-every k] [--perf] [--out file]` —
  headless; JSON summary: populations, ledger totals and error, events by type, first
  intake/division ticks, branch candidates, endpoint hash, timing.
- `sim-tune --recipes … --seeds … --seconds 600 [--extend 1200] [--preset]` — compact table +
  markdown report to `docs/reports/`; reports censored events explicitly.
- `art-build` — §10.1; `--check` verifies determinism.
- `store-assets` — icon (512², adaptive layers), feature graphic (1024×500), screenshots via
  Playwright at 1080×1920 and 1920×1080 (and tablet 1600×2560), `--topics` per directive P4.12.
- `bug-export` — packages baseline save, bounded command log, versions, expected/observed,
  diagnostics summary; strips private notes; recomputes hashes; says "Replay history incomplete"
  when the interval was compacted.

## 16. Testing strategy
- **Fixtures** (`tests/fixtures`): one file per SPEC §17 entry; each builds a world from a
  recipe or a hand‑constructed state, runs N ticks headless, asserts invariants and exact numbers
  (with 1e‑9 tolerance for floats, 1e‑5 relative for conservation).
- **Unit** (`tests/sim`): transport, suitability, allocation, movement tracing, birth proposals,
  mutation draws, branch qualification, tools, objectives, controllers, equipment.
- **Content** (`tests/content`): validator, schema round‑trips, every enabled ID has guide text
  and assets.
- **Persistence** (`tests/persistence`): atomic write interruption (mock adapter), predecessor
  recovery, export/import equality, malformed import no‑op, migrations from fixtures.
- **Worker** (`tests/worker`): protocol ordering, stale packet discard, error pause.
- **UI** (`tests/ui`): reason‑code copy coverage, favorites/stories evidence rules (pure
  functions).
- **E2E** (`tests/e2e`): `garden`, `place-and-undo`, `save-reload`, `whatif`, `lab-tools`,
  `keyboard`, `share`, `full-journey`; run at 360×800, 800×360, 1440×900; axe‑core on each
  screen. No animation screenshot assertions.
- Determinism CI job: run `sim-run` twice and compare hashes; run 1× vs 4× vs save/reload.
