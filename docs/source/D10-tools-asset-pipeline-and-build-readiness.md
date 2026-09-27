# 01  The missing production handoff
# Pixelmeba
Tools, Asset Pipelineand Build Readiness
Document 10 • Version 1.0 • September 27 2026 • Developers and designers
The next useful addition is a reliable way to produce, inspect and maintain the game. Build a small set of internal tools, agree on the art-to-code contract, and consolidate the design into one implementation specification. This document adds production requirements; it introduces no new biological systems or player progression.
## Four things to settle before parallel production
First, identify the canonical rules and enabled scope. Second, prove one organism can travel from an editable art file into the running dish with correct state cues. Third, make a saved problem reproducible so the team can explain unexpected behavior. Fourth, prove that Android can save, suspend, recover and export before committing to a large catalog.
Priority
Concrete handoff
Essential now
Canonical specification, pinned toolchain, stable content IDs, asset manifest, five-organism preview scene and a headless recipe validator.
As G1 becomes playable
Resource/cause inspector, replayable bug package, UI state gallery and measured Android save/performance evidence.
As G2 and later content arrive
Controlled tuning runner, compatibility fixtures, richer relationship coverage and equipment previews.
Optional later
A visual content editor, hosted community tools or extra design software. Add these only when a repeated production problem justifies them.

## How this fits the existing documents
D1 owns the original architecture and asset contract; D6 owns production order and reconciliation. D7 adds equipment, D8 adds accessible presentation, and D9 adds replay and release appeal. Preserve their numerical rules, limits and source recipes unless an explicit amendment changes them. The team should not independently interpret ten documents while writing code.
Maintain PIXELMEBA_IMPLEMENTATION_SPEC.md, required by D6, as the resolved source for implementation. Keep a short amendment table with rule ID, source document/page, adopted behavior and reason. Unresolved conflicts get an owner and a proposal. Do not silently choose whichever document was read last.
# 02  Tools to use and what each owns
Retain D1’s default stack. Pin compatible exact versions when the repository is created, commit the dependency lockfile, and record the runtime and Android toolchain. A supported existing team setup may replace a recommendation after the team records the reason and demonstrates the same boundaries. No new paid service is required for the core design.
Tool
Responsibility
Decision
TypeScript + Web Worker
Authoritative simulation, commands and versioned content; worker owns mutable world state.
Keep. Simulation must run headlessly without UI or network access.
PixiJS 8 + HTML/CSS
PixiJS renders the dish; semantic HTML presents controls, accessible descriptions and panels.
Keep D1 architecture. Rendering cannot change biology. Official PixiJS guidance supports a Vite setup [S1].
Vite
Development server and production web build [S2].
Keep. Test the built output as well as the development server; pin a compatible Node runtime.
Capacitor + Android tooling
Package the web application and bridge necessary device functions [S3].
Keep. Explicitly test durable saves, file export/import and lifecycle behavior on hardware.
Aseprite OR Piskel
Editable pixel art and animation. Aseprite supports PNG/JSON sheets; Piskel offers a free browser editor [S4–S5].
Choose one primary editor. Use Aseprite if already licensed; Piskel is a budget option. Do not require both.
Audacity
Edit sound effects and loop masters [S6].
Use an existing audio editor if preferred. Keep editable sources and lossless masters.
Vitest + Playwright
Vitest for simulation fixtures; Playwright for a small set of browser user journeys [S7].
Add only focused coverage. Browser automation does not replace Android hardware testing.
Existing Git repository and issue tracker
Source history, decisions, task ownership and reviewable builds.
Use the team’s existing tools. No new project-management subscription or runtime account system.

## Keep the toolchain small
Use the designers’ existing layout tool for mockups, then verify layouts in a small HTML component gallery. Do not add a second game engine, 3D pipeline, backend, runtime language model or paid atlas service merely because one is available. Claude Code may help produce code and scripts; the checked-in specification and reviewed code remain authoritative.
# 03  The art and audio contract
Complete one vertical asset slice before producing the full catalog: B01 source art, exported animation, manifest entry, state mapping, Field Guide icon and in-game preview. Approve it at normal phone size, in a dense patch, on an overlay and in grayscale. Then use that pattern for the other four core organisms.
Deliverable
Required contract
Editable source
Keep layered source in the chosen editor’s native format. Exported PNGs alone are insufficient for later revision. Record creator/source, usage rights and revision.
Frames and atlas
Preserve D1: small organisms 16 × 16 frames; large organisms 32 × 32; existing state/frame counts and direction rules. Transparent PNG, two transparent padding pixels, nearest-neighbor sampling.
Manifest
Stable assetID and speciesID; source/export paths; frame rectangles; anchor; direction; state/animation name; frame durations; looping rule; reduced-motion fallback; revision and export hash.
Names and coordinates
Use lowercase snake_case filenames and existing stable content IDs. Keep anchor and untrimmed frame size consistent across states. If trimming is introduced, retain offsets and prove no position jump.
Meaning
Movement follows actual velocity; feeding and division require committed events. Resting, stress and death cues map to specified states. A frame must never cause a birth, attack or resource transfer.
Audio
Editable session plus lossless WAV master; cue ID, trigger, gain, loop start/end if applicable, and source rights. Export runtime formats only after Android/browser decode and loop checks.
UI and text
Separate text from sprite artwork. Provide focus, pressed, selected, disabled and error states. Use localization keys with placeholders; preserve D8 touch and text-scaling requirements.

## One adapter, no manual atlas surgery
The art export step must convert the selected editor’s output to the game manifest deterministically. Do not assume every editor’s JSON is directly compatible with PixiJS. Validate rectangles, dimensions, IDs, required states and referenced files. A missing required asset fails the content build with its ID; placeholders are explicitly marked in internal builds.
## Motion and sound review
Preserve D1’s bounded sound cues and D8’s reduced-motion behavior. A busy colony must not create thousands of sounds. Verify loops in the actual runtime; Audacity warns that MP3 can introduce padding that matters for loops [S6]. Keep music and effects separately controllable and pause game audio on suspension. No generated image or sound service is required.
# 04  The internal tools worth building
Start with command-line reports and simple developer panels. These are production aids, not a second application. Reuse existing simulation queries, event records and save formats; do not create competing calculations that merely look like the game.
Tool and priority
Minimum useful behavior
Acceptance
Content validatorG0
Validate IDs, schemas, references, resource units, allowed behavior modules and required assets. Report the exact record and field.
Missing prey/host/food dependencies, unknown modules and malformed values block the content build.
Recipe runnerG0–G1
Load a named recipe and seed; run an exact tick count without rendering; export event summary, resource ledger and endpoint hash.
Same inputs reproduce within the documented compatibility contract. Invalid recipes never run partially.
Asset previewerG1
Display one species in every supported state, direction, scale and overlay; preview dense groups and reduced motion.
A designer can verify missing frames, jitter, legibility and state meaning without assembling a gameplay situation.
Resource/cause inspectorG1
Show selected organism inputs, costs and current blockers; cell pools; births deferred by capacity; actual incoming/outgoing transfers.
An unexplained decline can be traced to an existing calculation or explicitly identified as missing evidence.
Replay bug exporterG1
Package a consistent baseline, bounded command log, versions, seed/random state, expected/observed result and relevant diagnostic summary.
Another developer can load the baseline and reproduce the reported interval with the same supported build.
Controlled tuning runnerG2
Run the six D6 seeds and fixed observation windows; compare one registered parameter revision at a time; output a compact table.
Report failures and absent/censored events alongside successes. No automatic search for the most impressive result.

## Limits and separation
Developer panels are read-only unless an explicit debug command is chosen. Debug edits use a marked duplicate world and logged commands; never mutate the player’s active arrays behind the worker protocol. Such worlds are identified as edited demonstrations when captured or exported.
Keep diagnostics bounded by existing history limits. If the command interval needed for replay has been discarded, export the current failing save and say “Replay history incomplete.” Do not imply exact reconstruction from a seed alone. Strip private notes and user labels from a diagnostic export by default, preserve required simulation state, and recalculate integrity hashes. No automatic upload is required.
# 05  Design states the team must see
Create a small internal screen gallery using the actual UI components and explicit fixture data. It exists to expose difficult states before players encounter them. Label fixtures as fixtures; they must not be used as fabricated gameplay evidence or store screenshots.
Surface
Required states
Main dish and tools
Ordinary, crowded, empty and extinct dish; selected life under a panel; unavailable tool; invalid terrain; capacity reached; brush preview; pinch while a paint tool is selected.
Inspector and favorites
Alive, divided, deceased or absent selected organism; no food, low oxygen, no room, multiple blockers; inherited trait versus temporary condition; favorite family extinct.
Equipment and replay
Off, running, empty and blocked device; unsupported recipe; variant preview; goal completed/ended; turn paused; missing comparison baseline.
Save and share
Saving, full slots, write failure, corrupt import, unsupported version, migration success/failure, share cancelled, no compatible external file handler.
Accessibility and layout
360 × 800, 800 × 360 and 1440 × 900 CSS-pixel references; 200% text; keyboard focus; reduced motion; sound off; long translated strings; screen-reader panel summaries.

## State ownership and copy
For each component, specify its input data, available actions, pause behavior, loading/error text and focus destination after closing. Use a shared glossary for organism names, resource names and cause codes. Designers should not invent a different term for the same simulation field on every screen.
A cause explanation requires evidence: code, measured value, relevant threshold and observation tick. If multiple blockers exist, summarize the current leading blocker and make the others available in Details. If evidence is unavailable, say so. Do not convert a correlated population change into a proven causal claim.
## A compact interaction review
Engineering and design review one short flow together: start Garden, place food, inspect a response, pause, undo, save, reload and try a variant. Then review one failure: an invalid placement or full save slots. Fix the actual component and update its gallery state. Avoid producing a large collection of polished mockups that cannot survive implementation constraints.
Keep a small mapping from state/cause IDs to art, text and sound. When a rule changes, that mapping identifies the affected assets and strings. This is more useful than manually searching ten documents for every downstream effect.
# 06  Android, saves and release readiness
Prove the native path early. A working browser build does not demonstrate durable Android storage, correct lifecycle handling or reliable device sharing. Name a real minimum target phone and a desktop configuration; preserve D1’s measured performance gates rather than substituting an emulator result.
Area
Required implementation decision or evidence
Durable storage
Name the Android storage adapter and recovery strategy. Show consistent-tick serialization, checksum validation, atomic replacement and retained predecessor. Do not assume small-settings storage is suitable for full worlds.
Lifecycle
Backgrounding requests pause/save; recovery uses the last complete committed state. Test forced termination during a write. Resume paused with no offline biological growth. Do not depend on a final callback always completing.
Offline package
Bundle required art, fonts, audio and content locally for Android. Test a cold launch without network after installation. A browser demo needs its own explicit offline/cache plan if offline use is advertised.
Performance
Measure dense gameplay and a 15-minute session on the named device. Report frame rate, tick cost, effective simulation speed, input latency, memory trend and thermal behavior using D1 targets.
Version compatibility
Separate app, schema, simulation, content and asset revisions. Maintain supported old-save fixtures. Migration writes a new validated record and keeps the original; unsupported content gives an explicit error.
Export/import
Test Android file selection and sharing, cancellation, malformed data, unsupported versions and size limits. A failed operation must preserve the current world and its previous valid save.
Release ownership
Record application identity, signing/recovery ownership, asset rights, included SDKs and actual data flows. The owner confirms platform declarations and current submission requirements before publishing.

## Targeted automation
Use Vitest for accounting, mutation/birth integrity, deterministic replay and save validation. Use a small Playwright suite for opening a dish, changing a tool, pause/save/reload, invalid import and basic keyboard navigation [S7]. Native lifecycle, share sheets, touch conflicts and long-session behavior still require real-device checks. Do not build brittle screenshot assertions for every animation frame.
No analytics, remote crash collection or new network SDK is required by this brief. Begin with local diagnostics and deliberate tester exports. If remote collection later becomes necessary, specify exactly what is sent and its operational responsibilities before adding it.
# 07  First delivery and official references
## What the team should return
Keep D6’s one EXPANSION_RESPONSE.md and its eight sections. Add toolchain decisions under Build identity; rule reconciliation under Resolved specification; asset/state mappings under Design handoff; and storage/device evidence under Performance and saves. Do not create another competing roadmap.
First work package
Complete when
Rules and repository
Canonical spec, enabled IDs and dependency lockfile are committed. One engineer owns simulation correctness; one design owner approves state meaning.
Asset vertical slice
B01 appears correctly from editable source through export/manifest to runtime, with supported states and inspector labels. Then expand to the remaining core roster.
Reproducible recipe
FIRST_DISH_V1 runs by ID and seed in the headless runner and playable. Endpoint evidence and an importable failing case can be produced.
Native save slice
The named Android device can save, suspend, recover paused, export and import. A failed write or import preserves the prior valid world.

These packages support G0 and G1; they are not a promise of completion within one day. Return concrete estimates after reviewing the repository. If the team already has an equivalent tool, reuse it and demonstrate the required output rather than rebuilding it.
## Official tool references • checked September 27 2026
S1. PixiJS 8 quick start and Vite templatehttps://pixijs.com/8.x/guides/getting-started/quick-start
S2. Vite guide and build toolinghttps://vite.dev/guide/
S3. Capacitor runtime and platform documentationhttps://capacitorjs.com/docs
S4. Aseprite sprite-sheet documentationhttps://www.aseprite.org/docs/sprite-sheet/
S5. Piskel browser sprite editorhttps://www.piskelapp.com/
S6. Audacity and loop-format guidancehttps://www.audacityteam.org/https://manual.audacityteam.org/man/mp3_export_options.html
S7. Vitest guidance on unit tests and Playwright end-to-end coveragehttps://vitest.dev/guide/comparisons
The links establish tool capabilities. The pipeline, ownership and acceptance requirements above are Pixelmeba design decisions. Dependency versions and platform compatibility must be recorded from the actual project setup, not assumed from a document date.