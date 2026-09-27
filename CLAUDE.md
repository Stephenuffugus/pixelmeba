# Pixelmeba — build instructions for the implementing agent

You are building **Pixelmeba**: a crisp pixel‑art living‑ecosystem sandbox where players add
microscopic life and food to a round dish, shape the habitat, watch real consequences, follow
evolving families, and re‑run the same dish with one thing changed. Fully offline. No accounts,
no ads, no timers, no consumables. Targets: **Android (Google Play, $0.99)** and a **static web
build for the Lucid Winds Arcade**.

One promise, never contradicted by the product:
> **Grow a tiny living world. Change one thing. See what happens.**

The design is finished. Your job is to implement it exactly, in the specified order, with
evidence. You are working alone and unattended; the owner will review asynchronously.

## Start here, every session

1. **`docs/WORKLOG.md`** — find the first unchecked task. That is your current task. Never skip ahead.
2. **`docs/BUILD_DIRECTIVE.md`** — read the section for the current phase and task.
3. Rules live in **`docs/PIXELMEBA_IMPLEMENTATION_SPEC.md`** (mechanics), **`docs/CONTENT_TABLES.md`**
   (every number), **`docs/ARCHITECTURE.md`** (stack, data, protocol, pipelines), **`docs/UX_SPEC.md`**
   (screens, copy, art, accessibility). **`docs/CONFLICT_REGISTER.md`** holds rulings where the
   original documents disagreed. **`docs/source/`** holds the ten original design documents for
   deep reference only; the canonical docs above supersede them.
4. Do the task. Run the checks it names. Commit. Tick the box in `WORKLOG.md`. If you made a
   judgment call the docs did not settle, add a dated entry to `docs/DECISIONS.md`.
5. At every gate: fill in `docs/EXPANSION_RESPONSE.md`, run the full suite, tag the commit.

If your context was compacted or you are unsure where you are: `git log --oneline -20`,
`cat docs/WORKLOG.md`, `cat docs/DECISIONS.md | tail -40`. Then continue.

## Non‑negotiables (the simulation contract)

- **The renderer never owns biological state.** The simulation runs in a Web Worker on a fixed
  0.10 s tick. UI sends commands; it receives snapshots and events. Nothing cosmetic can consume
  simulation randomness or alter outcomes.
- **Determinism.** Same seed + same rules/content versions + same command log ⇒ identical state
  hash at 1×, at 4×, and across save/reload. All simulation randomness is derived by hashing
  `(worldSeed, streamName, ...keys)`; never `Math.random()`, never `Date`, never iteration over a
  `Map`/`Set`/object keys in the sim, never float order that depends on rendering.
- **Conservation.** Carbon, nutrient and mineral are ledgered. Closed‑lid, no‑input worlds must
  conserve to < 0.001 % over 10,000 ticks. Energy is an abstract budget and is *not* conserved,
  but every energy gain and loss is recorded. No free biomass, ever.
- **No hidden rescue, no scripted spectacle.** No mutation rate escalation because nothing happened,
  no spontaneous organisms, no invisible food refill, no random disasters, no killing organisms to
  improve frame rate, no rerolling a mutation until it is useful. Extinction and quiet dishes are
  valid outcomes and must be explainable.
- **Honest labels.** Everything the inspector says traces to a reason code and a measured value.
  "Coincided with" until a recorded mechanism supports "because". A single mutation is not a
  branch; a bigger well‑fed body is not a body‑form mutation; a temporary state is not inherited.
  Never call a lineage "superior", "advanced" or "perfect". All numbers are fictional game units.
- **Saves are sacred.** Atomic writes, checksums, retained predecessor, migration by copy, and a
  failed import or write never touches the current world. Backgrounding pauses; there is no
  offline growth. Old saves keep their recorded ruleset; new rules never rewrite an old world.
- **Every visible feature maps to real state.** No feeding flash without intake, no split without a
  committed birth, no ability marking without that ability in the genome.

## Non‑negotiables (how you work)

- **Evidence or it didn't happen.** Never mark a task done or a fixture passing without running it
  in this session and pasting the command + result summary into the commit message or the
  response document. "Should pass" is a failure.
- **Finish the phase, in order.** Do not start Phase N+1 work while Phase N gate checks fail. Do
  not implement a later document's system early "because it is nearby". Feature flags in the
  world manifest keep later content off until its phase.
- **Decide, log, continue.** When the docs are silent or conflict and `CONFLICT_REGISTER.md` has
  no ruling, pick the option most consistent with the non‑negotiables, write it in
  `docs/DECISIONS.md` with the reason, and keep going. Do not block waiting for the owner; list
  owner decisions in `EXPANSION_RESPONSE.md` §8 instead.
- **Commit small and often** on `main` with descriptive messages (`feat(sim): stage 6 shared
  allocation`, `test(fixtures): conservation closed‑lid`). Tag gates: `g0`, `g1`, `g2`, `g3`,
  `v1.0.0-rc1`, `g5`, `g6`, `g7`. Never commit secrets, keystores, or `node_modules`.
- **Keep the build green.** `npm run check` (typecheck + lint + unit tests) must pass at every
  commit on main. If you break it, fix it before anything else.
- **Content is data.** Species, materials, modules, habitats, recipes, experiments and variants
  are validated JSON under `content/`, never hard‑coded in the update loop. Unknown IDs are
  errors. Special behaviors reference named modules implemented in the sim, never executable
  content.
- **Do not over‑test cosmetics.** No screenshot assertions for animation frames. Test accounting,
  determinism, state machines, host/prey specificity, allocation fairness, save recovery,
  import validation, command semantics and a handful of Playwright user journeys.
- **Measure, don't guess** performance. Record tick cost and frame budgets in the response doc.
  Reduce cosmetics before touching biology; never skip ticks or change the timestep.
- **You are also the artist and the sound designer.** Sprites are authored as palette‑indexed
  pixel matrices in code and compiled to atlases (see `ARCHITECTURE.md` §Art pipeline). Sounds
  are synthesized with Web Audio from small patch definitions. Follow the palette, frame counts
  and silhouette rules in `UX_SPEC.md`. First pass may be simple; it must be readable and
  truthful. Refine in the polish tasks.
- **Read widely but do not re‑litigate.** The ten source documents were reconciled into the
  canonical docs. If you believe a canonical rule is wrong, record the concern in `DECISIONS.md`,
  implement the canonical rule, and flag it for the owner. Do not silently substitute your own.

## Repository map (target layout; create as you go)

```
content/            versioned JSON content packs (species, materials, modules, habitats, recipes, experiments, variants)
art/src/            pixel matrices + palette (TypeScript); art/build → public/atlas/*.png + manifest.json
src/sim/            authoritative simulation (no DOM, no network): core, fields, entities, genome, modules, tools, ledger, hash, rng
src/worker/         worker entry, protocol, snapshot builder, comparison scheduler
src/render/         PixiJS scene, atlas loading, overlays, aggregation, camera, selection
src/ui/             Preact app: views (Explore/Lab), panels, inspector, trays, notebook, settings, i18n strings
src/persistence/    storage adapters (IndexedDB, Capacitor Filesystem), save/export/import, migrations
src/audio/          SoundKit (Web Audio synthesis), narration (SpeechSynthesis)
src/diagnostics/    ledger assertions, state hashing, fixtures harness, perf counters
tools/              CLI: content validator, recipe runner, tuning runner, art builder, store‑asset renderer, replay bug exporter
tests/              vitest fixtures (sim, persistence, content); e2e/ Playwright journeys
android/            Capacitor Android project (generated); no keystores committed
docs/               this documentation; WORKLOG, DECISIONS, EXPANSION_RESPONSE
```

## Commands you will create and then use

```
npm run dev              # Vite dev server
npm run build            # production web build → dist/ (relative base, iframe‑safe)
npm run check            # typecheck + lint + unit tests (must pass at every commit)
npm run test             # vitest
npm run test:e2e         # playwright
npm run content:validate # validate all content packs, print exact record/field on failure
npm run sim:run -- --recipe FIRST_DISH_V1 --seed 104729 --ticks 6000   # headless run → summary + hash
npm run sim:tune         # six development seeds × registered recipes → compact table
npm run art:build        # compile pixel matrices → atlases + manifest
npm run store:assets     # icon, feature graphic, screenshots
npm run android:sync     # cap sync android (documents what to do if SDK is absent)
```

## Definition of done for the whole project

Phases 0–4 complete, `v1.0.0-rc1` tagged, `EXPANSION_RESPONSE.md` complete with real evidence,
`PLAY_STORE_CHECKLIST.md` owner items listed, web build in `dist/` runs offline, Android project
builds (or exact blocking reason documented). Then Phases 5–7 land as additive, flag‑gated
content updates (`v1.1`, `v1.2`, `v1.3`) with the build green throughout.
