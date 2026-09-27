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

## 7. Worker protocol (versioned; `protocolVersion: 1`)

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

## 8. Snapshots
Published ≤ 10/s (adaptive under load). Contents: `renderList` as a packed `Float32Array`
[entityIndex, speciesIdx, x, y, heading, scale/sizeFactor, stateFlags, cueBits] per living
entity; `aggregation` per cell `Uint8Array` dominant species + `Uint8Array` density band for
wide zoom; `overlayField` only for the active overlay (Float32 copy); film/deposit glyph
summary; structure/device/object list; selection detail on request (full inspector payload with
reason codes and measured values). Renderer interpolates positions between snapshots and plays
state animations from flags; nothing else.

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
