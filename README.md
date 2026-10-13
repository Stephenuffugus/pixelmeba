# Pixelmeba

**Grow a tiny living world. Change one thing. See what happens.**

Pixelmeba is an offline pixel‑art ecosystem sandbox. Add microscopic life and food to a round
dish, shape the habitat, watch real chain reactions, follow evolving families, and re‑run the
same dish with one change. Deterministic, ledgered, explainable. No accounts, ads or timers.

- Platforms: Android (Google Play, paid) and a static web build for the Lucid Winds Arcade.
- Stack: TypeScript · Web Worker simulation · PixiJS 8 · Preact · Vite · Capacitor 8 · Vitest · Playwright.
- Status: **v1.0.0-rc1** (release candidate; Phases 0–4 complete, app version 1.0.0). Evidence, open items and
  owner decisions: `docs/EXPANSION_RESPONSE.md`. Phases 5–7 follow as flag‑gated content updates (v1.1–v1.3).

## Run and build

```
nvm use                      # Node 24 (.nvmrc)
npm ci
npm run dev                  # Vite dev server
npm run check                # typecheck + lint + unit tests (long: about an hour on 2 cores)
npm run test:e2e             # Playwright on phone-portrait, phone-landscape and desktop
npm run build                # typecheck + production web build → dist/
npm run build:demo           # DEMO_MODE web build (Garden, its variants, five organisms, Explore)
npm run content:validate     # validate the content packs
npm run sim:run -- --recipe FIRST_DISH_V1 --seed 104729 --ticks 6000   # headless run → summary + hash
npm run android:build:debug  # web build + cap sync + debug APK (JDK 21 and the Android SDK; docs/ANDROID_SETUP.md)
npm run android:build:release  # AAB without source maps (D-0100); unsigned, or signed with android/keystore.properties (never committed)
npm run store:assets         # store icon, feature graphic, phone/tablet screenshots from real play → store/
```

## Web build for the Lucid Winds Arcade

Upload the contents of `dist/` to any static folder. Asset paths are relative (Vite `base: './'`), so the
game runs from a subfolder or inside an iframe. There is no server code, account or network call; saves
stay in the browser's own storage (IndexedDB) on that device. Served from its own folder, the game plays
offline after the first load (a precaching service worker). A host page may send
`{type:'pixelmeba:pause'}` / `{type:'pixelmeba:resume'}`; resume never runs the dish by itself. The stamped
arcade deploy (`tools/deploy-arcade.mjs`) plays online only until the arcade's manifest/embedding rules are
provided (D‑0097). Full or demo build for the arcade is an owner choice.

## Owner next steps

`docs/PLAY_STORE_CHECKLIST.md` §B lists every owner task in order: Play Console account and app, privacy
policy hosting, content declarations, the upload keystore and a signed AAB, device tests on a named phone
(`store/smoke-test.md`, the perf device readings), Internal testing, the store listing (`store/listing.md`
and the images in `store/`), the D9 §12 usability gates, the arcade build and launch. Open owner decisions
are numbered in `docs/EXPANSION_RESPONSE.md` §8.

## Documentation

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Working rules for the implementing agent. Read first. |
| `docs/BUILD_DIRECTIVE.md` | Phased plan (Phase 0 → 7), tasks, gates, acceptance evidence. |
| `docs/WORKLOG.md` | Live checklist of every task; the current task is the first unchecked box. |
| `docs/PIXELMEBA_IMPLEMENTATION_SPEC.md` | Canonical mechanics rulebook (reconciled from the ten source documents). |
| `docs/CONTENT_TABLES.md` | Every numeric table: organisms, materials, modules, loci, habitats, recipes, experiments, limits. |
| `docs/ARCHITECTURE.md` | Stack, repository layout, data layout, worker protocol, save format, art/audio pipelines, Android, web. |
| `docs/UX_SPEC.md` | Screens, Explore/Lab views, inspector copy, art direction, motion, sound, accessibility. |
| `docs/CONFLICT_REGISTER.md` | Rulings where the source documents disagreed. |
| `docs/DECISIONS.md` | Running log of judgment calls made during implementation. |
| `docs/EXPANSION_RESPONSE.md` | The single status/evidence report, updated at each gate. |
| `docs/PLAY_STORE_CHECKLIST.md` | Release readiness: agent deliverables and owner tasks. |
| `docs/ANDROID_SETUP.md` | Android toolchain, debug/release builds, signing, versioning, build records, device checks. |
| `docs/reports/` | Gate reports (tuning, experiments, performance `perf-rc1.md`, contrast, reviews). |
| `store/` | Store listing, privacy page, data safety, content rating, smoke test, icon, feature graphic, screenshots. |
| `PRIVACY_POLICY.md` | Privacy policy (no personal data collected; saves stay on the device). |
| `docs/source/` | The ten original design documents (reference). |
