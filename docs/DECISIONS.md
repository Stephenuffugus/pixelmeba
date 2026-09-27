# DECISIONS — running log of judgment calls made during implementation

Append‑only. One entry per decision the canonical docs did not settle (or a concern about a
canonical rule you implemented anyway). Rulings made *before* implementation are in
`CONFLICT_REGISTER.md`; do not duplicate them here.

Format:
```
## D-#### · YYYY-MM-DD · <task id> · <short title>
Context: what the docs say / don't say.
Decision: what was done.
Reason: why, tied to the non‑negotiables (truthful, deterministic, conserved, understandable, emergent).
Affects: files / fixtures / versions bumped.
Owner review: yes|no (if yes, also listed in EXPANSION_RESPONSE.md §8)
```

---

## D-0001 · 2026-09-27 · baseline · Decision cadence adopted from Phase 0
Context: D01 implies per‑tick movement decisions; D05 §5 specifies a 0.5 s decision interval for
strategies (Ancestral = template controller). With one ruleset (R03), two cadences would mean two
code paths.
Decision: every self‑propelled organism decides direction every 0.5 s from Phase 0; passability is
rechecked every tick; predators re‑target on the same schedule and pursue every tick.
Reason: one controller path, fewer sensing evaluations, identical behavior once D05 lands.
Affects: SPEC §6.4; movement fixtures.
Owner review: no

## D-0002 · 2026-09-27 · baseline · Birth placement candidate order
Context: D01 says "select birth positions by deterministic priority" without naming it.
Decision: candidates = parent cell + 8 neighbors filtered by compatibility/passability/capacity;
ordered by crowding ascending, then a fixed neighbor index (E, S, W, N, NE, SE, SW, NW, center);
fungi rank by usable food then suitability per D01 §8.
Reason: deterministic, favors space, no randomness needed.
Affects: SPEC §6.9; blocked‑division fixture.
Owner review: no

## D-0003 · 2026-09-27 · baseline · Sensing locus rounding
Context: D03 multiplies an integer radius by a continuous factor and clamps 1–6.
Decision: `round(r × (0.5 + g))` then clamp 1–6; at g = 0.5 this equals the native radius for
all templates, satisfying C07.
Reason: cells are discrete; neutral founder equivalence preserved.
Affects: SPEC §8.2; neutral‑founders fixture.
Owner review: no
