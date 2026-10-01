# Comprehension self-review, G2

> **This is a self-review by the build agent, not the five-tester session.** D06 §18 asks the team
> to recruit five willing testers who do not know the design, give them the session task, watch a
> ten-minute session without directing their taps, and ask four questions. That session is still to
> be run and remains an owner item (for EXPANSION_RESPONSE §8 at the G2 gate). The build agent has
> read the whole design, so this review can only show that each task is *achievable* from what the
> screen offers, how long it takes, and where a newcomer is likely to stumble. It cannot show that
> newcomers understand.

The G2 gate asks for this review in BUILD_DIRECTIVE "G2 gate — evidence": *"Self-review against D6
§18 comprehension tasks (write the five tester tasks and confirm each is achievable in ≤ 10 min from
a cold start)."* Same style as the G1 review (`opening-loop-g1.md`).

## What was reviewed

- **Build:** commit `5f967fe` (HEAD when the snapshot was taken, 2026-10-01 00:54 UTC; it adds only
  agent notes to `752878a`, so the code is `752878a`'s). Snapshot: `git archive HEAD` → `vite build`
  → `vite preview --port 4195`. The working tree, which a fixer was editing at the same time, was
  never built or tested.
- **Versions** (from the snapshot's `content/manifest.json`; About shows none, see m25): simulation 3,
  evolution rules 1, module registry 1, phenotype mapping 1, content 1, content hash
  `e88b629838a74fa5…`, build phase 2.
- **Dish:** the Play shelf Garden, FIRST_DISH_V1 revision 1, seed 104729, described by the dish as
  "Standard Evolution · Identical founders · Core prototype — quantitative evolution".
- **Machine:** shared 2-CPU Codespace, headless Chromium with SwiftShader. Another agent ran test
  suites throughout (load average 5.5–9.6), so the 4× setting delivered about 1.9–3.7× (the dish
  itself showed "running at 3.0×") and every real time below is pessimistic for the waiting parts.
- **Tool:** `node tools/review-g2.mjs <base URL> <width> <height> <tag> <text scale> <tasks>` repeats
  every run against any served build. Screenshots and a step log per task and layout
  (`<tag>-<task>.jsonl`: each step, every quote, real and dish time, action count) are in
  `docs/reports/img/g2/`. T2–T4 were re-run after their procedures last changed; T1 and T5 did not
  change. The final file (typed so the repo's lint passes; linted in the snapshot) was run once more on
  360×800 under the tag `smoke`; its T4 is kept as a second 360×800 run.

## How the tasks were performed

- **Cold start:** a new browser context for every task (empty storage, default settings, gentle
  prompts on). The 200 % text run first chose Home → Settings → Text size → 200 % (not timed).
- **Only what the screen offers:** roles, accessible names and visible text; organisms were found
  where they are drawn (their colours, found in a screenshot as an eye finds them). No test ids; the
  source was not read to find the way.
- **Speed:** 4×, the fastest the dish offers, for every wait; paused to read.
- **A first, unscripted pass** at 1440×900 (and a few looks at 800×360) came before the tool was
  written. Its wrong turns are reported with the task they affect; they are the closest thing here to
  a newcomer's experience.
- **Times:** *real* is the scripted run's wall time from the Home screen; *dish* is the dish clock;
  *actions* counts taps and clicks. A person reads more slowly than the script, but this machine was
  slow too; as a deliberately conservative person estimate, add 10 s per action to the real time.
- **Pass:** done within 10 minutes of real interaction, using only what the screen offers.

## The five tester tasks

Phrased as a tester would receive them (no screen names that give the answer away):

1. **T1 — the session task (D06 §18).** "Make one change to the dish. Then show me why something in
   the dish changed afterwards, and keep a second version of the dish so the two can be compared."
2. **T2 — a food source.** "Show me one thing a living thing in the dish feeds on, and where that
   food is."
3. **T3 — a cause of population change.** "The number of living things goes up and down. Show me one
   reason it changed, using what the game tells you."
4. **T4 — an inherited trait, and a temporary state (D06's second directional target).** "Find one
   thing about a creature that its offspring will get from it, and one thing about the same creature
   that is only true right now. Show me how you can tell which is which."
5. **T5 — a difference between the two dishes.** "Make two versions of the dish that differ in one
   thing. Tell me one way they ended up different, and how you know."

## Results

Real time (min:s from the Home screen) · actions · dish time, per layout.

| Task | 1440×900 | 360×800 | Other layout | Person estimate (slowest layout) | Result |
|---|---|---|---|---|---|
| T1 | 3:40 · 25 · dish 0:50 → 1:59 | 1:14 · 26 · dish 0:37 → 1:28 | — | 7:50 | **Pass** |
| T2 | 2:55 · 19 · dish 0:42 | 1:13 · 21 · dish 0:27 | 800×360: 0:48 · 19 · dish 0:25 | 6:05 | **Pass** |
| T3 | rise 1:59 · 14; fall 3:04 · 21 · dish 3:18 | rise 0:50 · 14; fall 1:32 · 22 · dish 3:01 | — | 6:35 | **Pass** |
| T4 | answer 2:04 · 12; a difference 3:44 · 27; branch card 6:50 · 31 · dish 12:08 | 1:01 · 14; 1:30 · 26; 4:20 · 31 · dish 11:51 | 360×800 at 200 % text: answer and difference 0:56 · 14; branch card 3:48 · 19 · dish 11:50 | answer 4:05; difference 8:15 (a second 360×800 run: 14:45); branch card 12:00 (optional) | **Pass** (the strict reading: luck, M2) |
| T5 | 2:31 · 17 · dish 0:54 + 1:00 paired | 1:10 · 18 · dish 0:39 + 1:00 paired | — | 5:20 | **Pass** |

All five tasks were completed from a cold start within ten minutes in every layout tried, with
nothing the screen does not offer. One defect met on the way is a BLOCKER when it happens: a tap on
the dark area outside the dish (on a phone, the space below it) throws inside the cell panel, after
which no tap opens anything and Continue shows a blank screen until the page is reloaded (B1). Five
MAJOR findings concern things a newcomer reads wrongly or finds only by luck: a kept comparison
result cannot be found again (M1); an inherited difference is found by chance and is easy to read
past (M2); at 200 % text on a phone the two tab names that teach "now" against "passed on" are
clipped (M3); the paired results invite reading every row as a direct effect of the change (M4); and
the Garden's main food link — Sunbeads release sugar that the Sprinters live on — is never stated
(M5). T4's branch card is beyond what the task asks; its 12:00 estimate at 1440×900 is mostly dish
time on a loaded machine (11:32 of dish time is 2:53 at a true 4×). The phone's T3 run took 2:07 and
43 actions in all: after the death was on screen, the tool's search for a living Recycler tapped the
dark area below the dish and ran into B1.

### T1 — make a change, show why, keep a second version

**Path (both layouts):** Home → **Play** → shelf card "Little Living Garden · Who finds something to
eat? · Preloaded: 24 Sprinters, 12 Crumbsmiths, 8 Recyclers and 12 Sunbeads, a sugar patch, a starch
patch and some debris. Nothing else will appear unless you add it." → **Start** → the dish opens
paused with one line, "Press play and look closely." → **Run** (▶), **4×** → Pause at 0:50 (phone
0:37) → **More** → **Duplicate dish**: "Duplicated. You are now in the copy; the original was saved to
Slot 1." → **Feed** ("Pick a food, then tap the dish. Food is finite: nothing refills it for you.")
→ **Place sugar** → tap where the Sprinters are: "Added sugar to 22 cells." (phone: 28 cells) → Run
4× for about a minute → **More → History and what happened**: Charts ("Dashed vertical lines mark
changes made to the dish. A chart shows what happened together, not what caused it."; Sprinter "now:
75 alive"), What happened ("119 s A Sprinter split in two.", "113 s 5 Sprinter divisions.", "101 s A
Sprinter offspring inherited a different trait.") → tap a Sprinter by the new sugar → **What does it
eat?**: "It eats sugar. In its cell now: sugar 0.009. It took in 0.015 carbon in the last second."
under "There is not enough food here. Food access: 16 % of its intake budget found." → **More → Saved
dishes**: "Continue · Little Living Garden (copy) (autosave) … 119 s simulated" and "Slot 1 · Little
Living Garden … 50 s simulated" (`desktop-T1-*.png`, `phone-T1-*.png`).

**Why it changed, as the game lets a player say it:** after the sugar went in, Sprinters by it were
eating sugar and the record lists Sprinter divisions; the chart marks when the change was made. That
is "coincided with" evidence, which is exactly what the game claims ("A chart shows what happened
together, not what caused it."). The paired comparison (T5) is the screen that supports a causal
reading.

**Difficulties (screens):**
- *First pass: Compare first.* Asked to "keep a second version so the two can be compared", the
  unscripted pass chose **More → Compare: copy this dish and change one thing**, whose label matches
  the task. Its first tap on dish B landed on the lower stone: "That can't go there." — and the setup
  fell back to "Nothing is queued yet: A and B are identical.", so Feed → Place sugar had to be chosen
  again (m4). After **Save result card** ("Result card saved on this device.") the result was nowhere
  to be found: Notebook → Journal says "No stamps or notes yet. …", Notebook → Experiments lists only
  experiment cards, and the Compare setup lists nothing. The sheet does warn "Closing a comparison
  discards its two copies."; a player who reads that switches to Duplicate dish, one who trusts
  "Result card saved" believes something is kept that cannot be shown again (M1).
- *The player's own change is not in the record.* What happened lists divisions and inherited
  differences but not the sugar ("your change is not among the 26 listed events"); the chart's dashed
  line is unlabelled; on the dish the new sugar is invisible once the toast fades (m1, m2).
- *Phone:* the top strip reads "Little …", so after Duplicate the open dish cannot be told from the
  original (m19).

### T2 — a food source

**Path:** Home → Play → Start → Run, 4× → Pause at 0:25–0:42 → tap a Sprinter → **What does it eat?**
→ "It eats sugar. In its cell now: sugar 0.027. It took in 0.055 carbon in the last second."
(1440×900; phone: "sugar 0.005 … 0.010 carbon"). Two more answers a player meets: a Crumbsmith, "It
eats sugar. It can't eat starch itself, but it releases an enzyme that turns nearby starch into sugar
that anyone nearby can eat. In its cell now: sugar 0.008. It took in 0.011 carbon in the last
second."; a Sunbead, "It makes its own food from light, carbon dioxide and minerals. It took in 0.098
carbon in the last second." Where the food is: the shelf card names "a sugar patch, a starch patch
and some debris"; **Lab** → **Observe** → **Sugar** colours the dish, legend "Sugar · 0 – 0.41 · C per
cell" (`desktop-T2-06-sugar-overlay-closed.png`; phone `phone-T2-06-…`; 800×360 `landscape-T2-*`).

**Difficulties:** the overlay shows something no sentence explains. By 0:42 the original patch is
spent (the ring of Sprinters sits on pale cells) and the richest sugar is round the Sunbeads by the
stone, where the Sprinters gather by 2:00 (`desktop-T1-05-after.png`). Under the game's rules a
Sunbead puts half of the carbon it fixes into the water as sugar (SPEC §6.5, photosynthesis: cell
`sugar += 0.50C`), so after the first half-minute the Sprinters live on Sunbead sugar — and nothing
on screen says so (M5). In Explore, sugar is only a faint unlabelled haze, so "where" needs the Lab's
Observe tray; on a phone that tray covers the whole dish, so choosing **Sugar** shows nothing until
the tray is closed (m20). A Sunbead's panel says "Eating" and "There is not enough food here."
although it "makes its own food" (m6).

### T3 — a cause of population change

**Path:** Home → Play → Start ("0:00 · 56 alive") → Run 4× to about a minute ("1:19 · 118 alive";
phone "1:07 · 107 alive") → **More → History and what happened**: Charts (Sunbead "now: 48 alive",
Sprinter "now: 49 alive"), What happened ("74 s 4 Sprinter divisions.", "64 s 9 Sunbead divisions.",
"56 s A Recycler split in two.") → tap a Sprinter → **Why did it stop?** → "It needs minerals to grow.
Growth limited by mineral nutrients: 43 % of requested growth supplied. Needs to grow more before
splitting. Body 1.39 of 2.00 needed. Needs more energy to split. Energy 46 of 60 needed." (1440×900;
the phone's Sprinter: "There is not enough food here. Food access: 12 % … Body 1.02 of 2.00 needed.").
So numbers rose because organisms split, and they split once they have grown and stored enough
energy, which food and minerals limit. For a fall, keep the record open (it does not pause the dish)
and run on: "168 s 1 Recycler died — it ran out of energy." (dish 2:48, the same in every run of this
seed). A living Recycler then: "Finding only traces of food", "There is not enough food here. Food
access: 0 % of its intake budget found.", "Energy 0", "Food here debris 0.000 · protein 0.000 · starch
0.000 · oil 0.000" (`desktop-T3-06-why-death.png`).

**Difficulties:** the starving Recycler's panel never says it is losing health (Energy 0, Health
56, but no "Out of energy — losing health." line; m5). On the phone, the search for a living Recycler
(1–2-pixel dots on the whole dish; nothing on screen helps find a kind, m21) tapped the dark area
below the dish: the page threw 29 errors and no panel opened again (B1). Event times are in seconds
("168 s") while the clock reads "2:48" (m10).

### T4 — inherited trait and temporary state

**Path:** Home → Play → Start → Run 4× to about 1:20 → **More → History and what happened**: "82 s A
Sprinter offspring inherited a different trait.", "65 s 2 Sunbead offspring inherited different
traits." → tap any creature: its panel has three tabs, **Happening now · Passed to offspring ·
Details**. On the phone's first creature, Sunbead #132: *Passed to offspring* "Same inherited traits
as its parent. Genome ba41fc. Feeding 50 · Division 50 · pH preference 50 · Salt preference 50 ·
Warmth preference 50 · Feeding policy in order: — · Extra abilities none"; *Happening now* "Eating ·
age 19 s · generation 2", "There is not enough food here. Food access: 53 % of its intake budget
found.", "Needs to grow more before splitting. Body 2.29 of 3.00 needed. Too young to split. Age 19 s
of 25 s." That answers the task as asked: the tab names themselves say which is which.

**An inherited difference** (D06's "one inherited trait", read strictly: a value that differs from
its parent's or from the founders') took some luck, and is easy to read past:

| Run | Creatures looked at | First with an inherited difference |
|---|---|---|
| first pass, 1440×900, unscripted | several minutes with the Family tree's trait overlay (two zoom steps, a second trait) | Sprinter #98: "This offspring inherited a different trait from its parent. … Division 45 (-5 from the ancestor)" |
| 1440×900 | 5 (2 founders, 2 with no difference) | Sprinter #166: "This offspring inherited a different trait from its parent. … Motility 48 (-2 from the ancestor)" |
| 360×800 | 4 (3 with no difference) | Sprinter #105: "This offspring inherited a different trait from its parent. … pH preference 48 (-2 from the ancestor)" |
| 360×800, second run (tag `smoke`, final tool) | 16 in 2:29 of tapping (7 founders, 8 with no difference) | Sprinter #171: "Same inherited traits as its parent. … Warmth preference 48 (-2 from the ancestor)" |
| 360×800 at 200 % text | 1 | Sunbead #142: "Same inherited traits as its parent. Genome fa01d5. Feeding 50 · Division 45 (-5 from the ancestor) …" |
| 1440×900, earlier tool version | 1 | Sprinter #164: "Same inherited traits as its parent. … Feeding 45 (-5 from the ancestor)" — that version counted only "differs from its parent" and tapped on |
| 1440×900, earlier tool version | 17 in seven minutes (7 founders) | none differing from its parent; values against the ancestor were not recorded |

Sunbead #142 also shows an inherited trait shaping a temporary state: with Division 45 its *Happening
now* reads "Too young to split. Age 16 s of 27 s.", where the Division 50 Sunbead above needs 25 s.
Nothing on the panel connects the two (m8).

Letting the dish run on at 4× gives the strongest answer, in every run that had time left: at dish
11:32 (3:10–3:25 of running at 4× on this machine) the card "New branch: Sprinter · Patient · CC9 ·
Ancestor: the Sprinter founder of this line. · Inherited difference: Division investment -10 (50 →
40). · Game rule: it can split once it is 13.2 s old (ancestor: 12 s). · Game rule: each split costs
18 energy (ancestor: 20). · … A difference is a record, not a verdict: it does not show that this
branch does better or worse." appears over the dish.

**Difficulties:** the event lines name neither the trait nor the offspring, and nothing leads from
them to it; the trait overlay counts only values outside 47–53, so the usual ±2 change is invisible
and the few coloured rings hide in the crowd; a creature that inherited a difference through its
parent leads with "Same inherited traits as its parent." (M2). At 200 % text on a phone the tab names
are clipped to "ppenin / now" and "Passed / to / ffsprin", and the answer area below them shows a
single line before scrolling (M3). The effect of an inherited value is not stated (m8).

### T5 — one difference between the two dishes

**Path:** Home → Play → Start → Run 4× to about 0:50 → **More → Compare: copy this dish and change
one thing**: "A and B are exact copies of “Little Living Garden” at 0:54. A stays as it is. Change one
thing on B, then both run for exactly the same time." → **Feed → Place sugar** ("Now tap dish B to
place it.") → tap dish B where the Sprinters are: "Added sugar to 24 cells." and "Queued on B: Sugar,
0.1 per cell on 24 cells" → **Run A and B for 60 s** → "A (baseline) and B (Sugar, 0.1 per cell on 24
cells) each ran 1:00 from 0:54. They started identical; your change was the only recorded difference.
These numbers describe this paired run only — another seed, horizon or change could turn out
differently." Table: "Organisms alive 168 | 173 | +5", "Births during the run 90 | 95 | +5", "Carbon
added since the start 0.00 | 2.40 | +2.40"; By kind of organism: "Sunbead alive 76 | 80 | +4",
"Sprinter alive 71 | 72 | +1" → **Save result card** → "Result card saved on this device." → **Done —
back to my dish** ("Done discards the two copies. Your dish is exactly as you left it.") → Home →
Notebook → Journal: "No stamps or notes yet. …". Phone: the same with an A/B toggle; "Organisms alive
149 | 159 | +10", "Sunbead alive 68 | 73 | +5", "Sprinter alive 60 | 65 | +5" (`*-T5-*.png`).

**Difficulties:** the difference is easy to read; *why* is not. In all four paired runs at about one
minute, Sunbeads gained as much as or more than the Sprinters that eat sugar (+4/+1, +5/+5, +5/+3,
+3/+2), although Sunbeads "make their own food from light, carbon dioxide and minerals", and the text
says "your change was the only recorded difference" — a newcomer will read "the sugar fed the
Sunbeads" (M4). Nothing inside A or B can be inspected. The kept result cannot be found again (M1).
"Added sugar to 24 cells." sits beside "Queued on B" (m4).

**What if?** (explored in the first pass, not timed): the sheet is clear — "Each idea starts a separate
new dish: the Little Living Garden as designed, with the same seed and the same starting life, and
exactly one change. What happens next is not decided in advance." and "Your current dish “Little
Living Garden” will first be saved to Slot 1 (empty now) and to Continue." — but its two dishes can
only be compared by opening each in turn (m22).

## Mechanically correct

What the screens showed was consistent with itself and with the rules in every run:

- **Doses add up.** "Carbon added since the start" is exactly 0.1 per cell placed: 2.80 for 28 cells,
  2.60 for 26, 2.40 for 24, 2.90 for 29.
- **Paired copies start identical** ("+0:00 · 118 alive" on both); no deaths in any of the four 60 s
  pairs started by dish 1:20.
- **The same seed told the same story** in every layout and at every effective speed (1.9–3.7×):
  first divisions at 29 s, the first death "168 s 1 Recycler died — it ran out of energy.", and the
  same first branch "Sprinter · Patient · CC9", first appearing at 4:58 and named at 11:32, in all
  nine runs that reached it (it matches `tune-g2.md`, first confirmation at 692.2 s). Pausing,
  inspecting, overlays and view switches changed nothing.
- **Numbers agree across panels:** "Body 99" on the meter is "Body 1.98 of 2.00"; the branch card's
  game-rule lines (13.2 s against 12 s; 18 against 20 energy) follow from Division investment 40
  against 50; Sunbead #142's "Age 16 s of 27 s" follows from its Division 45; the dying Recycler shows
  "Energy 0", "Food access: 0 %", "Food here debris 0.000".
- **One gap:** a Recycler with energy 0 (health 56 of 100) lists no "Out of energy — losing
  health." line, although UX §5.2 gives that copy for ENERGY_ZERO (m5). Worth a look by the
  fixer: either the reason is not raised or it is not shown.
- **One defect:** taps outside the dish are not rejected; the cell panel describes a cell the player
  did not tap, or throws and leaves the screen unusable (B1). No page error occurred in any other run
  (all 1440×900 runs, 800×360, 360×800 at 200 %, and every other 360×800 task).

This review does not re-check conservation, hashes or saves; the G2 fixtures do.

## Understood

Against D06's two directional targets, judged from what a newcomer can reach:

- **"Complete a meaningful intervention and explain one observed cause"** — reachable. Feed is one of
  three large buttons and says what it does; "What does it eat?" and "Why did it stop?" answer in
  measured sentences; the record names causes of death ("it ran out of energy"). The weak links:
  the player's own change is missing from the record and invisible on the dish (m1, m2); the paired
  results invite reading every row as a direct effect (M4); and the Garden's main food link is never
  stated, so the most natural causal story ("they ate the sugar patch") is wrong after the first
  half-minute (M5).
- **"Distinguish a temporary state from an inherited trait"** — the strongest part of the build. The
  inspector's tab names ("Happening now" / "Passed to offspring"), "Same inherited traits as its
  parent.", the branch card's "A difference is a record, not a verdict", and the Family tree's "A
  branch is a family line that kept an inherited difference, not a new species." teach it without a
  tutorial. It breaks at 200 % text on a phone, where the two tab names are clipped (M3), and the lead
  sentence "Same inherited traits as its parent." hides differences inherited through the parent
  (M2).
- **Finding an inherited difference** took 1, 4, 5 and 16 creatures in the scripted runs, several
  minutes in the first pass, and none in 17 creatures in one trial (M2). A newcomer who reads "A
  Sprinter offspring inherited a different trait." looks for it and has nothing to follow.
- **Guidance:** after "Press play and look closely." nothing else is said. UX §3.2's other first-minute
  prompts are Phase 4 work (P4.3), so this is by design today; the cost shows here: every path above
  was found by opening **More** and reading its twelve buttons.
- **Labels that read wrong to a newcomer:** a Sunbead "Eating" under "There is not enough food here."
  (m6), "Doing fine right now." over "A few things are slowing it down." (m7), "Why did it stop?" asked
  of an organism that has not stopped (m9), "2 Sprinters died — it ran out of energy." (m11).

## Interesting

- **The first minute has things to look at:** splits from 29 s, "inherited a different trait" lines
  from 29 s, the Crumbsmith's enzyme story, Sprinters ringing the sugar patch and then gathering on
  the Sunbeads.
- **Real surprises:** in the paired runs the added sugar helped Sunbeads at least as much as the
  Sprinters that eat it, and at dish 11:44 the same dose left B with 15 *fewer* organisms than A
  ("Organisms alive 1818 | 1803 | −15"). Honest results, but interesting only if the screen says such
  differences can be knock-on effects (M4) and that Sunbeads feed the Sprinters (M5).
- **The branch card is the high point** — a named family, its inherited difference and what that
  difference does in game rules — and arrives at 11:32 of dish time: about 3 minutes at 4×, more than
  11 minutes at 1×.
- **Quiet stretches:** Recyclers start dying at 2:48 ("it ran out of energy") without anything drawing
  the eye to it; by 12:00 the dish is one dense mass of 1,000+ organisms round the left stone, which
  a phone shows as a blob.

## Fast enough

- **Task times:** the task answers came within 3:50 scripted on the slowest layout, and within about
  8:15 by the conservative person estimate (table above). The waits are dish time: T1, T3's rise and
  T5 need about one minute of dish time (15–40 s at 4×); T3's fall needs 2:48; T4's branch card 11:32.
- **At 1×** the session task still fits (about two minutes of dish time), but the first named branch
  does not fit a ten-minute session. D-0034 records a confirmed branch by 600 s on 1 of 6 Standard
  seeds and by 1,200 s on 4 of 6; this seed's, at 692 s, is among the earlier ones.
- **The machine, not the game, set the pace of the waits:** the dish showed "running at 3.0×" at 4×
  under the other agent's test load, and a 60 s comparison took 14–60 s of real time.

## Problems found

Each has the screen, what it said, and a proposed change to labels, hierarchy or event evidence only
(D06: "If comprehension fails, revise labels, hierarchy or event evidence before adding another
system"). No mechanics or number changes are proposed, and every proposed sentence states only what
the game already measures, records or has as a rule.

### BLOCKER

**B1 · A tap outside the dish breaks the inspector, then the dish screen, until the page is
reloaded** (a defect rather than a wording problem; 360×800 at the whole-dish view, 1440×900 after
**Zoom out**; met in the 360×800 T3 run and reproduced in both layouts)
- *Screen and words:* on a phone the dark area below the dish belongs to the dish view. A tap there
  opens nothing, and the page throws "Cannot read properties of undefined (reading 'toFixed')" (9–19
  times at once, then again on every update while the dish runs) and later "Failed to execute
  'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of
  this node." From then on no tap opens an inspector or a candidate list. The dish still runs and
  **Home** works, but **Continue** shows a blank screen. Only reloading the page recovers (on Android,
  restarting the app); Continue then reopens the last autosave (in one test the crash came at 3:05
  and Continue reopened "1:35 · 144 alive"), and Look works again. On 1440×900 the same happens after
  **Zoom out** three times and a tap below the dish. The T3 run on 360×800 hit it while looking for a
  Recycler (29 page errors, no panel afterwards).
- *Cause, for the fixer (from the snapshot's source map):* the cell panel formats
  `p.cell.ph.toFixed(1)` and `p.cell.light.toFixed(2)` (`src/ui/panels/Inspector.tsx:550`), and a
  tap beyond the grid yields a cell without those values. Taps outside the dish are not rejected at
  all: on 1440×900 a tap left of the dish opened "Cell 113, 58 · Ground Water · … · Residents none"
  (a cell on the far side of the dish), and one in the dark corner "Cell 119, 117 · Ground Structure ·
  pH · light 7.0 · 0.00".
- *Why BLOCKER:* once it happens, T2–T4 cannot be done (nothing can be inspected) unless the player
  thinks of reloading, and Continue looks like a lost dish. On a phone the dark band below the dish
  (tested) is about a fifth of the screen, so a newcomer is likely to tap it.
- *Proposed change:* a tap outside the dish does nothing (or says "Outside the dish" with no values);
  the cell panel never throws on a missing value; no panel ever describes a cell the player did not
  tap. This fixes a defect and changes no mechanics or numbers; a journey that taps the dark area
  around the dish in each layout would keep it fixed.

### MAJOR

**M1 · A kept comparison result cannot be found again** (T1 first pass, T5; every layout)
- *Screen and words:* Results · this paired run → **Save result card** → "Result card saved on this
  device." Then Notebook → Journal: "No stamps or notes yet. Record something you saw, or start an
  experiment card: …"; Notebook → Experiments lists only experiment cards; the Compare setup lists no
  results. **Done** says "Done discards the two copies."
- *Why it matters:* "preserve another version to compare" is half of the session task. A player who
  chose the comparison (its label matches the task) and pressed Save believes the result is kept and
  cannot show it again.
- *Proposed change (hierarchy):* list saved result cards in Notebook → Journal now, newest first, one
  line each from what a card already holds, e.g. "Comparison · “Little Living Garden” at 0:54 · B:
  sugar, 0.1 per cell on 24 cells · ran 1:00 · Organisms alive 168 → 173 (+5) · your conclusion:
  supports", opening to the saved table. If the list must wait for Phase 4 (D-0020), make the toast
  true about where the card is: "Result card saved on this device. Saved results are not listed yet;
  the Notebook will show them in a later update." Either way, add under **Done**: "To keep a changed
  version as its own dish, use Duplicate dish and change the copy."

**M2 · An inherited difference is found by chance and is easy to read past** (T4; every layout)
- *Screen and words:* (a) History → What happened: "69 s A Sprinter offspring inherited a different
  trait.", "65 s 2 Sunbead offspring inherited different traits." — no trait, no value, no route to
  the offspring. (b) Family tree → Trait overlay: "40–46 · Patient side: 3 · 47–53 · middle: 115" —
  the usual ±2 change stays in the middle band, and the few coloured rings sit inside the crowd (the
  first pass needed two zoom steps, a second trait and several minutes). (c) A creature that
  inherited a difference *through* its parent leads with "Same inherited traits as its parent." and
  shows the difference only further down: Sunbead #142, "Same inherited traits as its parent. Genome
  fa01d5. Feeding 50 · Division 45 (-5 from the ancestor) …"; Sprinter #164, "Same inherited traits as
  its parent. … Feeding 45 (-5 from the ancestor)".
- *Measured:* creatures looked at before one showed a difference: 1 (360×800 at 200 %), 4 and 16
  (two 360×800 runs), 5 (1440×900); one trial that counted only "differs from its parent" looked at 17
  in seven minutes and found none. The 16-creature run took 3:26 and 68 actions to the difference,
  over ten minutes by the person estimate.
- *Why it matters:* a reader who stops at the lead sentence misses the difference; one who looks for
  the offspring the record mentions has nothing to follow. Finding one is luck.
- *Proposed change (event evidence, labels, hierarchy):* (1) the lead sentence states both
  comparisons: "Inherited from its parent unchanged. Differs from the founder of its line: Division 45
  (founder 50)." or "Inherited a change from its parent: pH preference 48 (parent 50)."; (2) the event
  names the trait and values, as UX §5.2's Lab detail already defines: "A Sprinter offspring inherited
  a lower pH preference (parent 50 → 48)."; a coalesced line lists them, e.g. "2 Sunbead offspring
  inherited different traits: Division investment 50 → 45; pH preference 50 → 55."; (3) **Show it**
  on each such line selects the offspring while it lives (as the branch panel's "Show one on the
  dish" does) and says "No longer alive" otherwise; **Show one** on each non-empty band of the
  trait-overlay legend. All of this reads recorded birth records and genomes; nothing new is
  simulated.

**M3 · At 200 % text on a phone the two tab names that teach "now" against "passed on" are clipped**
(T4, 360×800 at 200 %)
- *Screen and words:* the inspector's tabs read "ppenin / now", "Passed / to / ffsprin", "Details";
  the words are cut at both edges of their buttons, and the answer area below them shows one line
  ("Same inherited") before scrolling (`phone200-T4-02-inherited.png`, `-03-inherited-now.png`).
- *Why it matters:* those two names are the main thing that teaches a temporary state from an
  inherited trait (see Understood); clipped, a reader has to guess them. UX §4.1 requires 360×800 at
  200 % text.
- *Proposed change (hierarchy):* at large text sizes stack the three tabs in one full-width column, or
  let a label wrap only between words; never clip a label; let the open tab's content use the sheet's
  height (the question buttons can collapse above it). The 200 % journeys could also check that no
  button's text is wider than the button.

**M4 · The paired results invite reading every row as a direct effect of the change** (T5; every
layout)
- *Screen and words:* Results · this paired run: "They started identical; your change was the only
  recorded difference." By kind of organism: "Sunbead alive 76 | 80 | +4", "Sprinter alive 71 | 72 |
  +1" (1440×900); "+5" and "+5" (360×800); "+5" and "+3" (first pass); "+3" and "+2" (an earlier
  trial). Sunbeads do not eat sugar: their own panel says "It makes its own food from light, carbon
  dioxide and minerals." Nothing in A or B can be inspected (a tap on dish B opens nothing).
- *Why it matters:* the natural reading, "the sugar fed the Sunbeads", is wrong, and the game's own
  sentence makes every row look like a direct effect. D06's target is that testers "explain one
  observed cause"; this screen steers them to a wrong one.
- *Proposed change (labels and evidence):* after "your change was the only recorded difference" add:
  "Every difference below traces back to your change, directly or through knock-on effects; this
  table does not show which." If the paired run's ledger already records intake by kind, add a row
  group "Food eaten during the run, by kind", so the direct effect (who ate the added sugar) sits next
  to the counts; and add "Mean carbon dioxide" beside "Mean oxygen", since Sunbeads make food from it
  and Sprinters breathe it out under the rules (measured fields, no claim of cause). M5's sentence on
  the Sunbead panel makes such knock-on effects readable.

**M5 · The Garden's main food link is never stated: Sunbeads release sugar, and the Sprinters live on
it** (T2, T3, T5; every layout)
- *Screen and words:* the shelf card: "… a sugar patch, a starch patch and some debris."; a Sprinter:
  "It eats sugar. In its cell now: sugar 0.027. It took in 0.055 carbon in the last second."; a
  Sunbead: "It makes its own food from light, carbon dioxide and minerals. It took in 0.098 carbon in
  the last second." Lab → Observe → Sugar at 0:42: the original patch is spent and the richest sugar
  (legend "0 – 0.41 C per cell") is round the Sunbeads by the stone
  (`desktop-T2-06-sugar-overlay-closed.png`), where the Sprinters gather by 2:00
  (`desktop-T1-05-after.png`). The rules put half of the carbon a Sunbead fixes into its cell as
  sugar (SPEC §6.5: photosynthesis, cell `sugar += 0.50C`); no screen says so.
- *Why it matters:* "Who finds something to eat?" is the Garden's own question. A tester asked for a
  food source answers "the sugar patch" — true for the first half-minute, then not — and has no way to
  explain why the Sprinters thrive by the Sunbeads, or why Sunbeads gain in the paired runs (M4).
- *Proposed change (labels):* the Sunbead's "What does it eat?" states the release, as the
  Crumbsmith's answer already does for starch: "It makes its own food from light, carbon dioxide and
  minerals, and releases half of the carbon it takes in into the water as sugar that anyone nearby can
  eat (0.049 sugar in the last second)." — the number is half its measured intake. The Sprinter's
  answer adds the rule: "Sugar here can come from the sugar patch, from Sunbeads (they release sugar
  as they make food) and from Crumbsmiths' enzyme." Both are rules of this game, not claims about
  which sugar a given cell holds.

### MINOR

Grouped by where they arise. "First pass" is the unscripted run before the tool existed.

*The player's own change (T1, T5)*
- **m1 · Your change is missing from the record.** History → What happened after "Added sugar to 22
  cells." lists 26 events and none is the sugar; the chart's dashed line has no label ("Dashed vertical
  lines mark changes made to the dish."). UX §5.4 asks for "interventions marked". *Proposed:* list
  the player's accepted commands in What happened, marked as theirs: "0:50 You added sugar to 22
  cells."; show the same words on the dashed line.
- **m2 · The sugar you place cannot be seen afterwards.** In Explore the haze looks the same after
  "Added sugar to 22 cells." and the toast fades. *Proposed:* outline the cells that received food for
  a few seconds (the command's real footprint) and end the toast "… Lab → Observe → Sugar shows it."
- **m3 · Explore's Feed does not say what to do next or show the chosen food.** After **Place sugar**
  no line appears (the comparison setup does say "Now tap dish B to place it."); the four food choices
  look identical although "Sugar" is chosen (only the "Place sugar" button tells), while the Lab's
  Observe choices show the chosen one dark. *Proposed:* "Now tap the dish to place sugar."; draw the
  chosen food as a pressed choice.
- **m4 · Placing on dish B: a refusal without a reason, and two words for one state.** A tap on the
  stone: "That can't go there." and the choice is dropped ("Nothing is queued yet: A and B are
  identical."). A tap on water: the toast "Added sugar to 24 cells." beside "Queued on B: Sugar, 0.1
  per cell on 24 cells". *Proposed:* "That can't go there: it's stone. Tap open water." with Place sugar
  still chosen; one wording for what was done to B (if B already holds the sugar at +0:00: "Added to
  B: sugar, 0.1 per cell on 24 cells. A has none.").

*Inspector (T2–T4)*
- **m5 · A starving organism's panel never says it is losing health.** Recycler #41: "Finding only
  traces of food", "There is not enough food here. Food access: 0 % …", meters "Energy 0 · Health 56",
  and no "Out of energy — losing health." line (UX §5.2's ENERGY_ZERO copy); in an earlier trial a
  Recycler at health 1 led with "There is not enough food here. Food access: 83 % …". *Proposed:* show
  the ENERGY_ZERO line first, and as the summary, whenever energy is 0; when health is below the split
  threshold, lead with "Too hurt to split. Health 1 of 50 needed." rather than the intake sentence.
  (Whether the reason is not raised or not shown is for the fixer to confirm.)
- **m6 · Sunbeads are described as eating.** Sunbead #138: chip "Eating", "There is not enough food
  here. Food access: 53 % of its intake budget found.", Passed to offspring "Feeding policy in order:
  —"; its own answer: "It makes its own food from light, carbon dioxide and minerals." *Proposed:* for
  organisms that make their own food, chip "Making food", summary "It is making less food than it
  could here: 53 % of its budget.", feeding policy "makes its own food".
- **m7 · "Doing fine right now." above "A few things are slowing it down."** (first pass at 800×360, a
  Sprinter at 0:00 whose list holds only split requirements: "Needs to grow more before splitting. …
  Too young to split. Age 0 s of 12 s."). *Proposed:* when every item is a split requirement, head the
  list "Before it can split" and lead with "Not ready to split yet:".
- **m8 · An inherited value's effect is not stated.** "Division 45 (-5 from the ancestor)" and, on the
  other tab, "Too young to split. Age 16 s of 27 s." are never connected; the branch card does connect
  them ("Game rule: it can split once it is 13.2 s old (ancestor: 12 s)."). *Proposed:* under a value
  that differs, the same computed "Game rule:" lines the branch card shows.
- **m9 · "Why did it stop?" is asked of organisms that have not stopped** (chip "Eating"). *Proposed:*
  "What's holding it back?", the heading it opens (UX §5.3 fixes the shortcut's name; owner's call).

*History and events (T1, T3, T4)*
- **m10 · Two time formats.** What happened "168 s", Table "80 s", Charts "Last 80 simulated seconds",
  while the clock reads "2:48". *Proposed:* the dish clock ("2:48") in History too, as already ruled for
  saves (Known, being fixed, item 2).
- **m11 · Event grammar.** "2 Sprinters died — it ran out of energy."; "1 Recycler died — it ran out of
  energy." beside "A Recycler split in two." *Proposed:* "2 Sprinters died — they ran out of energy.";
  "A Recycler died — it ran out of energy."
- **m12 · Charts list a kind that was never in the dish.** "Amoeba — organisms now: 0 alive", "Amoeba
  — living biomass now: 0.00 carbon" (Amoeba is only offered by Add Life). *Proposed:* "Amoeba — none
  added yet", or chart only kinds that were ever present.

*Dish screen and layout*
- **m13 · The arrival line covers Whole dish** (every layout). "Press play and look closely." sits over
  the Whole dish button and intercepts clicks on it while shown. *Proposed:* end the line before the
  zoom controls.
- **m14 · "Body 99" is a percentage among absolute values.** "Energy 65 · Health 100 · Body 99" next to
  "Body 1.98 of 2.00 needed." *Proposed:* "Body 99 %" (or "1.98 / 2.00").
- **m15 · Raw names in the cell panel** (first pass at 800×360). "Cell 22, 102 · Ground Water · pH ·
  light 7.0 · 0.80 · nutrient 0.1000 · oxygen 0.8000 · co2 0.5000 · Residents none". *Proposed:*
  "Mineral nutrient", "Oxygen", "Carbon dioxide", capitalised like "Ground".
- **m16 · The selection ring can read as a trait band** (first pass). With the trait overlay on, the
  selected organism's thin orange ring (focus `#F2B84B`) is close to the "54–60" band (`#F5B56A`).
  *Proposed:* mark selection by shape (dashed or double ring), not colour.

*Families (T4)*
- **m17 · Branch card: grid coordinates and two kinds of founder.** "First appeared at 4:58 near (58,
  54)" — the dish shows no grid; the panel lists "Founder #885" (the branch's first member) under
  "Ancestor: the Sprinter founder of this line". *Proposed:* "First appeared at 4:58" with **Show
  where**; "first member #885".
- **m18 · In Explore the Family tree opens only through an organism** (first pass): More has no entry;
  it is reached by an organism's "Where is its family?" → "Family tree" (or the Lab's Observe).
  *Proposed:* add "Family tree" to More.

*Phones (360×800)*
- **m19 · The top strip hides which dish is open.** After Duplicate it reads "Little …" (the dish is
  "Little Living Garden (copy)"); at 200 % "Li…", with the clock wrapped over three or four lines
  ("11:50 / · / 1084 / alive"). *Proposed:* abbreviate the name from the middle so "(copy)" stays
  visible, or give it its own line on phones; wrap the clock only between its "·" parts.
- **m20 · The Observe tray covers the dish.** After **Sugar** the tray fills the screen; the coloured
  dish and its legend ("Sugar · 0 – 0.27 · C per cell") appear only after closing it. *Proposed:* on
  phones collapse the tray to the legend after a choice.
- **m21 · Nothing helps find a kind on the dish.** On a phone the whole dish draws organisms as 1–2
  px dots (`phone-T3-01-one-minute.png`), so finding, say, a Recycler means zooming and tapping
  around (which is how the T3 run met B1). *Proposed:* give each kind's chart in History ("Recycler —
  organisms now: 9 alive") **Show one on the dish**, as the branch panel has.

*Saves, About (T1, What if?)*
- **m22 · Two kept dishes can be compared only by opening each in turn.** Saved dishes rows show name,
  mode and "50 s simulated" but no population; opening one replaces the other (it is kept first). The
  same holds for a What if? dish and the dish open beside it. *Proposed:* show "N alive" in each row
  (as measured at the save).
- **m23 · Back from Saved dishes goes Home** (first pass: More → Saved dishes → Back → Home, not the
  open dish). *Proposed:* return to the dish, or label the button "Back to Home".
- **m24 · Assistive technology hears two import buttons.** More lists "Import a dish file…" and
  "Import a dish file"; Saved dishes "Choose a file…" and "Import a dish file". *Proposed:* hide the
  raw file input from the accessibility tree; the visible button operates it.
- **m25 · About names no version.** It reads "Pixelmeba is a playful pixel ecosystem sandbox. Every
  organism, rate and chemical is a fictional game rule, not a real laboratory measurement. Your dishes
  are saved only on this device. Nothing is uploaded." UX §2 lists "version, content hash" there, and a
  tester's report needs them (D06: "exact builds"). *Proposed:* add the app version, the content hash
  and the rule versions from the manifest.

## Known, being fixed

Listed once, as seen in this review (lead rulings another agent is fixing; not reported above as new):

1. **A change made while paused at an unchanged tick reaches Continue only at the next tick or
   save.** Not met here: every change in these tasks was followed by running the dish.
2. **Time formats in saves.** Saved dishes rows read "119 s simulated" and "50 s simulated" while the
   dish clock read "1:59" and "0:50" (1440×900, T1); Home's Continue card read "Little Living Garden —
   95 s simulated. Opens paused." (seen while checking B1).
3. **Straight and curly quotes around dish names.** Every dish name quoted in these tasks used curly
   quotes ("exact copies of “Little Living Garden” at 0:54", "Your current dish “Little Living
   Garden” will first be saved to Slot 1 (empty now) and to Continue.", "Started “A bigger meal” —
   paused."); no straight-quoted name was met.
4. **Toasts are 14 px.** Measured on "Added sugar to 28 cells." on the phone: font size 14px.
5. **Module gains read "…inherited a different trait."** The event lines met here cannot tell a module
   gain from a trait change; no birth record showing "gained E05" was opened in these tasks.

## Not in this build by design

- First-minute prompts after "Press play and look closely." (UX §3.2; P4.3).
- The Field Guide is a placeholder: "Every organism, material and tool will be listed here." (Phase 3).
- Result cards stay on the device until the Notebook lists them (D-0020: Phase 4). This review rates
  the effect of that on the session task as MAJOR M1 and proposes listing them now.

## Owner item

The five-tester comprehension session of D06 §18 is still to be run: recruit five willing testers
unfamiliar with the design, give them the session task (T1), observe a ten-minute session without
directing their taps, then ask T2–T5. The tasks above are written so they can be handed to testers
unchanged; `tools/review-g2.mjs` gives a reference run to compare against.
