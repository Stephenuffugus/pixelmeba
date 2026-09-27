# Source design documents (reference only)

These are the ten original design handoffs, converted from .docx/.md to Markdown.
They are **reference material**. The canonical, reconciled rules live in `docs/`:

- `docs/BUILD_DIRECTIVE.md` — what to build, in what order, with gates
- `docs/PIXELMEBA_IMPLEMENTATION_SPEC.md` — the resolved rulebook
- `docs/CONTENT_TABLES.md` — every numeric table
- `docs/ARCHITECTURE.md`, `docs/UX_SPEC.md`, `docs/CONFLICT_REGISTER.md`

Where a source document and the canonical docs disagree, the canonical docs win.
Where the canonical docs are silent, consult the source in this precedence order:
D05 explicit amendments → D04 corrections → D03 → D02 → D01, with D06–D10 governing
production order, equipment, presentation, replay and tooling respectively.

| ID  | File | Written | Subject |
|-----|------|---------|---------|
| D01 | D01-pixel-petri-design-and-build-specification.md | 2026‑09‑25 | Foundation: world, resources, 14 organisms, UI, architecture, saves (working title "Pixel Petri") |
| D02 | D02-mass-expansion-design-volume-2.md | 2026‑09‑26 | +24 organisms, enzymes, signals, dormancy, gates, climate, 12 materials, 12 structures, 18 experiments |
| D03 | D03-evolution-core-design-addendum.md | 2026‑09‑26 | Genomes, 8 loci, mutation, lineage, modules E01–E04 |
| D04 | D04-living-worlds-and-evolution-expansion.md | 2026‑09‑26 | Corrections C01–C08, feeding policy, modules E05–E12, curated dishes L301–L306 |
| D05 | D05-living-behaviors-life-cycles-and-colony-evolution.md | 2026‑09‑26 | Amendments A01–A09, strategies, life stages, body size, colonies, partners, E13–E17 |
| D06 | D06-core-experience-evolution-pacing-and-build-priorities.md | 2026‑09‑26 | Production plan: G0–G5, five‑organism core, FIRST_DISH_V1, pacing, fixtures |
| D07 | D07-living-lab-equipment-research-skills-and-interactions.md | 2026‑09‑26 | Living Lab: reservoir, lamp, controllers, sampling transactions, research stamps |
| D08 | D08-wonder-discovery-and-accessible-play.md | 2026‑09‑27 | Explore/Lab views, favorites, story cards, playgrounds, narration, child comprehension |
| D09 | D09-what-if-replay-and-release-appeal.md | 2026‑09‑27 | What if? variants, goals, Try my dish, share artifacts, store/trailer, release gates |
| D10 | D10-tools-asset-pipeline-and-build-readiness.md | 2026‑09‑27 | Toolchain, art/audio contract, internal tools, Android readiness |

Note: the .docx conversions flattened tables into consecutive lines. Numeric values were
re‑verified and re‑tabulated in `docs/CONTENT_TABLES.md`; trust that file for numbers.
