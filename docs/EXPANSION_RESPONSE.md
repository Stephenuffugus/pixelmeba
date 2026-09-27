# EXPANSION_RESPONSE — the single status and evidence report

Update at every gate (`g0` … `v1.3.0`). Replace placeholders with real, pasted outputs. Separate
**implemented**, **tested**, and **proposed/deferred**. Never claim a pass that did not run in
this session. Keep older gate evidence in `docs/reports/` and link it.

Last updated: _YYYY‑MM‑DD_ · Gate: _none yet_ · Commit: _—_

---

## 1. Build identity
- Repository / commit / tag:
- Pinned dependencies (Node, Vite, PixiJS, Preact, Zod, Vitest, Playwright, Capacitor + plugins):
- `simulationVersion` 3 · `evolutionRulesVersion` · `moduleRegistryVersion` · `phenotypeMappingVersion` · `contentVersion` · `contentHash`:
- Save `schemaVersion` · protocolVersion:
- Build configurations: web (`dist/`), DEMO_MODE, Android (debug/AAB), device/machine used for measurements:

## 2. Implemented scope
| Phase | Status | Species enabled | Modules enabled | Systems enabled | Missing / known limitations |
|-------|--------|-----------------|-----------------|-----------------|-----------------------------|
| 0 | | | | | |
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
| 6 | | | | | |
| 7 | | | | | |
Prototype label shown where the registry is partial: yes/no.

## 3. Resolved specification
- Canonical docs used (with versions): BUILD_DIRECTIVE, PIXELMEBA_IMPLEMENTATION_SPEC, CONTENT_TABLES, ARCHITECTURE, UX_SPEC, CONFLICT_REGISTER.
- Rulings applied from CONFLICT_REGISTER: R01–R40 (note any not yet relevant).
- New decisions this gate (link DECISIONS.md IDs):
- Remaining conflicts / concerns about canonical rules, with proposal and owner:

## 4. Correctness evidence
Paste command + summary for each fixture relevant to the gate (directive gate tables).
```
npm run check → …
npm run content:validate → …
vitest fixtures: <name> → pass/fail, key numbers (conservation C err %, N err %, hashes)
determinism: hash(1x) == hash(4x) == hash(reload) → …
```
Failing cases: file paths of saved reproduction packages (`tools/bug-export`).

## 5. Experience evidence
- Development‑seed tuning table (link `docs/reports/tune-*.md`): first intake / first division
  median and range, censored counts, births, deaths by cause, mutation counts, module attempts/gains,
  branch confirmations, effective speed.
- Opening‑loop review checklist (open Garden → chain visible → intervene → inspect → inherited
  difference or recorded absence → save/reload → duplicate): each item yes/no with notes.
- Screenshots (paths under `store/` or `docs/reports/`), short annotated capture descriptions.
- Comprehension tasks (D06 §18 / D08 §10 / D09 §12) — **owner‑run**; list them with the task text
  and what evidence to record.

## 6. Design handoff
- Art: sources under `art/src`, atlases under `public/atlas`, manifest hash; species distinguishable
  in grayscale (previewer check): yes/no; dense/sparse/low‑light/extinction states reviewed.
- UI: layouts verified at 360×800, 800×360, 1440×900 and 200 % text; keyboard path; reduced‑motion
  table filled (UX §7.4); axe results.
- Copy: reason codes fully mapped (`tests/ui/reasons.test.ts`).
- Sound: cue list implemented; rate limiter test.

## 7. Performance and saves
- Tick cost p50/p95/p99 at target population, stage breakdown, machine/device (`docs/reports/perf-*.md`).
- Renderer fps at each zoom preset; snapshot size and frequency; memory trend over 15 min.
- Effective speed under load; behavior when behind.
- Save/reload, background pause, autosave, predecessor recovery, interrupted write test, import
  validation results, migration fixtures.
- Android: SDK availability, `cap sync` result, debug build result, lifecycle test result, or exact
  blocker and owner steps (`docs/ANDROID_SETUP.md`).
- Web: offline PWA check from a subpath; iframe check; DEMO_MODE scope test.

## 8. Changes and next gate
- Tuning revisions (recipe versions) with reasons and before/after numbers.
- Rules/content version bumps this gate.
- Proposed scope changes (none unless recorded here).
- Estimate and dependencies for the next gate.
- **Owner decisions required** (each with context, options, recommendation, and what is blocked):
  1. Play Store: price ($0.99 assumed), countries, Families program opt‑in, content rating answers.
  2. Privacy policy hosting URL (PRIVACY_POLICY.md needs a public URL).
  3. Signing keystore creation and Play App Signing enrollment (owner‑held).
  4. Minimum Android device for measured performance gates.
  5. Lucid Winds Arcade manifest/embedding format.
  6. Whether the web build is full or DEMO_MODE.
  7. Any concern flagged in §3.
