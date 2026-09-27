# Pixelmeba

**Grow a tiny living world. Change one thing. See what happens.**

Pixelmeba is an offline pixel‑art ecosystem sandbox. Add microscopic life and food to a round
dish, shape the habitat, watch real chain reactions, follow evolving families, and re‑run the
same dish with one change. Deterministic, ledgered, explainable. No accounts, ads or timers.

- Platforms: Android (Google Play, paid) and a static web build for the Lucid Winds Arcade.
- Stack: TypeScript · Web Worker simulation · PixiJS 8 · Preact · Vite · Capacitor · Vitest · Playwright.
- Status: design complete; implementation follows `docs/BUILD_DIRECTIVE.md`.

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
| `docs/PLAY_STORE_CHECKLIST.md` | Release readiness: agent tasks and owner tasks. |
| `docs/source/` | The ten original design documents (reference). |

## Quick start (after Phase 0 exists)

```
npm install
npm run check
npm run dev
```
