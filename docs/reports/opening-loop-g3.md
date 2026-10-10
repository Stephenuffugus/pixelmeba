# Opening loop, G3 build (W6-15, optional)

Taken by the G3 evidence builder on 2026-10-10 (wave 4 stage 2).

- **Script:** `tmp/review-opening-loop-g3.mjs`. It is a copy of `tools/review-opening-loop.mjs` with two changes:
  port 4263 instead of 4173, and output to `docs/reports/img/g3/` instead of `img/g1/`. The committed G1
  images are untouched.
- **Build:** `tmp/dist-evidence`, built at the start of this session's launch-ecology e2e run. It includes the
  uncommitted wave 4 stage 2 tree: a11y and perf.
- **Run:** desktop 1440×900, SwiftShader WebGL, run with `node tmp/review-opening-loop-g3.mjs 1440 900 desktop`.
- **Images:** `docs/reports/img/g3/desktop-01…11.png`.

This is the same G1 opening loop on the Garden (FIRST_DISH_V1), run on the Phase 3 build: Play → Garden → 4× →
starch patch → Inspect a Crumbsmith → What does it eat? / Why? → Feed sugar → consequence → History → Charts →
Save → reload → Continue → Duplicate. Every step completed. The script's log follows. Numbers are from this run;
the sim time overshoots the script's 40 s target because it polls once a second at 4×.

| Step | Recorded |
|---|---|
| open | 0:00 · 56 alive |
| growth (4×) | 0:54 · 78 alive |
| starch patch, Inspect | a Crumbsmith (#27) was picked |
| What does it eat? | "It eats sugar. It can't eat starch itself, but it releases an enzyme that turns nearby starch into sugar that anyone nearby can eat. Sugar here can come from sugar placed in the dish, Sunbeads (they release sugar as they make food) and Cordweavers’ enzyme (it turns starch into sugar). In its cell now: sugar 0.006. It took in 0.0072 carbon in the last second." |
| Why? | "There is not enough food here. Food access: 6 % of its intake budget found." It also lists body 1.29 of 2.00 and energy 30 of 60 needed to split. |
| Feed sugar | toast "Added sugar to 32 cells." |
| consequence (15 s) | a Sprinter (#155, generation 1) eating at 7 % food access; it took 0.014 C in the last second |
| History → What happened | inherited-difference lines name the traits and values, e.g. "2 Sprinter offspring inherited different traits: Warmth preference 50 → 52; Motility 50 → 48." |
| Save → reload → Continue | saved at 1:12 · 114 alive; after the reload, 1:12 · 114 alive |
| Duplicate | "Little Living Garden (copy) · 1:12 · 114 alive" |

**One finding (MINOR, copy; reported, not fixed):** the inspector's "Sugar here can come from …" line lists
"Cordweavers’ enzyme" in a Garden that has no Cordweaver.
- The line is built from every species in the world's recorded species list (`sugarSourcesOf`,
  src/worker/snapshot.ts:611), not from the species present.
- Every new Phase 3 dish records all 19 shipped species, so Cordweavers (F02, native
  E_STARCH_SECRETION) are listed in every dish.
- The line is true of what *could* make sugar here, but "here" reads as present-tense.
- Also, a Sprinter that gained Starch release (E01) is never named as a source.
- A fix is a copy and data choice for the lead: name only species alive in the dish, or say "in this kind of
  dish". It is not a simulation change.

No other problem was seen in these screenshots: the dish and labels are readable, the inspector keeps its organism in view, and
reload and duplicate keep the moment. The phone layouts were not re-shot: `<lead>`, if wanted.
