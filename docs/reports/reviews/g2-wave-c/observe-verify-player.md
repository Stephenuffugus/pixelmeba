# G2 wave C: observe (P2.8) verification, player-facing truth and usability

- **Verifier lens:** player-facing truth and usability.
- **Repository state:** I edited no repository file except this report, and I ran no git command that changes state.
- **Scratch:** every throwaway spec, config, log and screenshot is in `tmp/verify-observe-player/`.
- **Server:** the Playwright server ran on port 4212 and has been stopped. The build went to `tmp/dist-verify-observe-player`.

**Verdict: not done. 3 MAJOR, 0 BLOCKER.**
- **What works:** the charts, the ring and the journal work, and the e2e journey really exercises the "Done when" list.
- **What fails:** three things the player is told are false:
  - a stripped export still contains the player's notes;
  - a chart note claims that no samples were recorded, when they were;
  - opening a checkpoint says "where you left it", and Continue then quietly changes to the rewound copy.

## Commands run in this session

| What | Command | Result |
|---|---|---|
| Task spec, all three projects | `E2E_PORT=4212 E2E_OUTDIR=tmp/dist-verify-observe-player npx playwright test tests/e2e/observe.spec.ts` | **6 passed (5.7 min)** |
| Screens and probes (`screens.vspec.ts`) | `npx playwright test --config tmp/verify-observe-player/pw.config.ts` | 4 passed: phone-portrait at 100 % and 200 %, phone-landscape at 200 %, desktop at 100 %. It saved 92 PNGs to `tmp/verify-observe-player/shots/` and wrote `probe.log`. |
| Keyboard focus (`focus.vspec.ts`, desktop) | same config | 1 passed, output in `focus.log` |
| Continue after opening a checkpoint (`continue.vspec.ts`, phone-portrait) | same config | 1 passed, output in `continue.log` |
| Change marks (`marks.vspec.ts`, desktop) | same config | 1 passed, output in `marks.log` |
| Unit-level checks (`player.vtest.ts`) | `npx vitest run --config tmp/verify-observe-player/vitest.verify.config.ts` | 3 passed. The output is quoted in the findings below. |

## Problems (most severe first)

### MAJOR 1: "Export without names or notes" exports the player's journal notes and the real dish name
- **Where:**
  - `src/persistence/saveFile.ts:141–155`: `buildSaveFile` with `stripNames` blanks only `meta.name` and `meta.note`. But `state` comes from `serializeWorld`, which now includes `history.journal` (D-0027).
  - The button is at `src/ui/panels/MoreSheet.tsx:89–90`.
- **Repro:** `player.vtest.ts` records an observation with `saw: 'MY PRIVATE NOTE'` about the dish "Grandma Garden", then sends `exportDish` with `strip: true`.
  - Output: `STRIP meta.name= Shared dish | contains note: true | contains dish name: true | filename shared-dish.pixelmeba`.
- **Why it matters:** the button's label is false, and the player's private notes leave the device in a file that promises to carry none. This breaks SPEC §14.4 (stripped export: "no nicknames unless opted in") and the honest-label rule.
- The rules verifier found this too (MAJOR 2 in `observe-verify-rules.md`). I reproduced it independently.

### MAJOR 2: After 31 simulated minutes, Regions says "this dish recorded none before", which is false
- **Where:**
  - `src/ui/panels/TraitGraphs.tsx:400–403`.
  - `firstSecond` is `points[0].second` (`src/sim/history.ts:312`).
  - Once the 10-second window compacts, the first point is the kept 1:00 minute sample. The dish did record samples at 0:10 to 0:50.
- **Repro:** `player.vtest.ts` pushes one sample every 10 s up to 1,870 s.
  - Output: `TRAIT firstSecond 60 compacted true → UI shows "this dish recorded none before": true ; also shows "Older minutes keep one sample each": true`.
  - So on every dish older than 31 minutes, the same paragraph says both "Trait samples start at 1:00; this dish recorded none before." and "Older minutes keep one sample each."
- **Rules broken:**
  - CLAUDE.md "Honest labels".
  - UX §1.3: a sentence means a measured value.
  - SPEC §12.4: compacted history is labelled incomplete and never reconstructed.
- The rules verifier found this too (MAJOR 4). I reproduced it independently.

### MAJOR 3: Opening an automatic checkpoint says "paused where you left it", and Continue then quietly becomes the rewound copy
- **Where:**
  - `src/ui/state.ts:365`: `loadSlot` shows the same toast for a checkpoint as for a named save.
  - `src/ui/views/Saves.tsx:53`: the checkpoint line.
  - `src/worker/host.ts:273–274`: the opened checkpoint keeps the dish's world id and name.
  - `src/ui/state.ts:1178`: a journal note autosaves at once. `DishScreen.tsx:118` autosaves every 30 s.
- **Repro:** `continue.vspec.ts` on phone-portrait, ring on.
  1. Run the dish at 4× to 1:37 and pause. Wait for the autosave.
  2. Saved dishes shows `Little Living Garden (autosave) 97 s simulated` and one checkpoint at 60 s.
  3. Open the checkpoint. The toast says `Opened "Little Living Garden" — paused where you left it.` The dish clock shows `1:00 · 83 alive`. The player left the dish at 1:37, not at 1:00 (screenshot `shots/phone-portrait-s100-opened-checkpoint.png`).
  4. Add one journal note. Saved dishes now shows `Little Living Garden (autosave) 60 s simulated`.
  5. The 1:37 state was never in a named slot. It is gone from Continue and from the list, and nothing warned the player.
  6. If the rewound copy keeps running with the ring on, its own checkpoints use the same dish name and dish times. They rotate out the original's checkpoints, and within 10 simulated minutes nothing of the original line is left. Two rows reading "(automatic checkpoint) · 120 s simulated" can come from different lines.
- **What the checkpoint line leaves out:** it says "Opening it continues from that moment and leaves the checkpoint as it was". It never says that Continue will switch to the older copy.
- **Rules broken:**
  - SPEC §10.7 / D4 §12: "Rewinding opens a new branch from a stored state".
  - CLAUDE.md "Saves are sacred".
  - UX §1.3 "Truthful feedback".
- **Fix direction:**
  - Give checkpoints their own toast, such as "Opened the automatic checkpoint at 1:00".
  - Before opening, either keep the current dish (autosave it, or offer "Save current dish first"), or say plainly that Continue will now follow this copy.

### MINOR 4: A note becomes an ungrammatical sentence when the player types normal punctuation
- **Where:** `src/ui/journal.ts:281–283`. `observationSentence` joins the raw parts as `I saw ${saw} coincide with ${coincidedWith}.`, and `cleanNote` keeps trailing punctuation.
- **Repro:** the Notebook card (`shots/phone-portrait-s100-notebook-journal.png`) reads "I saw Sprinters gathering in the top left. coincide with the sugar patch getting smaller."
- `player.vtest.ts` shows two more cases:
  - `I saw Sprinters gathering. coincide with the sugar running out!.`
  - `I saw I saw sprinters gather coincide with sugar vanish.`
- **Fix:** strip trailing `.!?` and a leading "I saw" from the parts.

### MINOR 5: On touch screens the crosshair ignores a tap and resets when the finger lifts
- **Where:** `src/ui/panels/TraitGraphs.tsx:172–173` handles only `onPointerMove` and `onPointerLeave`.
- **Repro:** `screens.vspec.ts` taps the whole-dish trait panel at 30 % of its width, on phone-portrait and phone-landscape. Every readout stays at `now: …` (`probe.log`, "tap readouts"). On desktop, hovering does move them to `0:20: …`.
- **Effect:** on a phone, which is the main target, a past sample can be read only while dragging sideways, and the readout snaps back to "now" as soon as the finger lifts.
- History's older sparklines behave the same way.

### MINOR 6: Change marks and the range band are below 3:1 contrast
- **Where:**
  - Change marks use `GRID #D9D6CC` on `#F5F4EF`: **1.32:1** (`TraitGraphs.tsx:24` and the `marks` lines).
  - The trait range band is ink at 0.18 opacity: **1.27:1** against the surface (`TraitGraphs.tsx:211`).
- **Repro:** `shots/marks-dish-panel.png` and `shots/marks-dish-trait-panel.png`, taken after a feed at 0:15. The mark is a barely visible grey line.
- **Why it matters:**
  - The words give only the number of changes and the latest time ("one, the latest at 0:16"). Earlier change times exist only as these faint lines.
  - The range values are also in the table, but the band is the only range encoding on the chart.
- The lens requires ≥ 3:1 for graphics. History's P1.10 sparklines already use the same mark color.

### MINOR 7: The readout says "now" for a value up to 10 s old
- **Where:** `TraitGraphs.tsx:163`.
- **Repro:** the desktop dish is paused at 1:09 and every readout says `now: 24 alive` or similar. That value is the 1:00 sample; the summary line correctly says "at 1:00".
- **Fix:** label it with the sample time, as the hover state already does.

### MINOR 8: Keyboard and screen reader: focus is dropped when the composer opens or closes; the crosshair readout is silent
- **Repro:** `focus.log` (desktop):
  - Pressing Enter on "Record what you saw…" gives `body[...]`. Focus is not moved into the form, and its heading is not announced.
  - Submitting with Enter gives `body`. Cancel gives `body`.
  - Notebook → "Record what you saw" also gives `body`.
- Chromium's focus starting point means one Tab lands on the next field. A screen reader user still hears nothing when the form appears or disappears.
- The arrow-key crosshair changes `.trait-readout` text, but that text is not in a live region, so screen reader users get no feedback. Only the table serves them.
- **Where:**
  - `HistorySheet.tsx:198–200`
  - `Notebook.tsx:154–156`
  - `NotebookJournal.tsx` (submit and `onDone`)

### MINOR 9: History tabs are not a full tabs widget, and two controls are named "Table"
- **Tabs widget:** `HistorySheet.tsx:204` has `role="tablist"` / `role="tab"` but no arrow-key or roving-tabindex handling and no `aria-controls`. Only the Regions tabpanel has a name. The Notebook tabs do all of this correctly.
- **Duplicate names:** a History tab row "Charts · Regions · Table · What happened" sits directly above the Regions toggle "Charts · Table" (`shots/desktop-s100-regions-0.png`).
  - History's "Table" tab is the resource table; the Regions "Table" button is the trait table.
  - Two nearby controls share a name but mean different things.
- **Header:** the header above all tabs says "Last 69 simulated seconds…" (`HistorySheet.tsx:194`), while the Regions charts cover the whole recorded trait history (up to 6.5 h).

### MINOR 10: The Saved dishes list with checkpoints is long and hard to tell apart
- **Where:** `Saves.tsx:49–60`.
- **Repro:** `shots/phone-portrait-s200-saves.png`.
- **Problems:**
  - Every checkpoint row repeats the 2-line explanation, which becomes about 15 lines per row at 200 % on a phone. Ten such rows form a very long page.
  - Rows give dish time as "1800 s simulated", while Settings ("Latest: at 1:00") and the charts use the clock format.
  - Each row's "Open" and "Delete…" buttons have no accessible name that says which checkpoint they act on.
- **Fix:** one group heading with the explanation, the clock format, and named buttons.

### MINOR 11: Small wording and formatting issues
- The Trait select is cut off when closed ("Feeding invest") on phone and on desktop, because the sheet is about 340 px wide (`shots/desktop-s100-regions-0.png`).
- `SimplePage.tsx:52` "Latest: at M:SS" counts minutes past 60 (for example "75:00"), while `clockText` uses h:mm:ss.
- The ring note says "the dish you are playing", but comparison and paired-run copies are never checkpointed.
- `EXP_103.intervention` sends the player to "the resource history". The button is labelled "History and what happened" and the chart "Debris (total)". The other two texts say "the Debris chart in History", which the player can find.
- Outside P2.8, and flagged by the builder: `.setting-note` "Follows your device setting…" on the Settings page with the ring is 14 px (`probe.log`).

## VERIFIED OK
- **`tests/e2e/observe.spec.ts`, all three projects:** **6/6 passed** on port 4212. It really runs the "Done when" journey:
  1. Pick the second trait.
  2. Check the regional charts (2 × 5 figcaptions and the image labels).
  3. Open the table view (newest row = last whole 10 s, oldest = 0:10).
  4. Check that the ring is off by default, then turn it on.
  5. Run at 4× past 1:00: exactly one "(automatic checkpoint)" row appears at "60 s simulated".
  6. Open it: paused at 1:00.
  7. Add a journal note from History: it shows in Notebook → Journal and survives a reload.

  The spec also checks the Debris chart and the 200 % reflow.
- **Regional charts are true to the dish:** the whole dish plus four quarters, for population and for the trait, drawn in the one ink.
  - The region glyph paths fill the correct quarter.
  - On desktop, the Sunbead cluster sits top left of the dish centre, and the charts say "Top left: 26 alive", "Top right: no Sunbead alive" (`shots/desktop-s100-regions-hover.png`).
  - The summary, the image labels, the table (6 rows at 1:00) and the readouts all agree.
- **Change marks come from recorded history:** a feed at 0:15 produced "Vertical lines mark changes made to the dish (one, the latest at 0:16)" and one extra line in each of the 10 panels (`marks.log`). A run with no changes says "No changes were made to the dish in this time."
- **Crosshair:** hovering on desktop moves all 10 readouts together to "0:20: 12 alive" and so on. The e2e covers the keyboard arrows.
- **Honest wording:**
  - "coincide with".
  - "Coincided with: seen together. This note does not say that one caused the other."
  - "A chart shows what happened together, not what caused it."
  - "Median and range are over the living Sunbead in each region that carry this trait."
  - No "superior", "advanced" or "perfect" anywhere on these screens.
- **Journal link:** a link to a comparison result card renders "Linked to the comparison result “Added sugar to B” (Little Living Garden, this paired run)." The options come from saved result cards and stamps.
- **16 px text:** on History Charts, Regions, both tables, the History composer, the Notebook list and form, Saved dishes and the ring note, no text is under 15.9 px. Checked at 100 % (phone-portrait, desktop) and 200 % (phone-portrait, phone-landscape) in `probe.log`.
- **48 px targets:** every button, select, input and focusable region on those screens is at least 48 px, and the checkbox labels are at least 48 px tall. The only exceptions are the older overlay-opacity slider and the sr-only file input.
- **200 % reflow:** in phone portrait and landscape, no element sticks out past the sheet or the page. Only the trait table scrolls sideways, inside its own focusable wrapper.
- **axe:** no serious or critical issues on Regions, Saved dishes or the Notebook. The dish screen has two moderate issues from before P2.8 (`landmark-one-main`, `page-has-heading-one`).
- **Keyboard order:** tabs → Organism → Trait → Charts → Table → chart group. Each shows a visible focus ring.
- **Contrast:** ink #256E9E is 5.01:1 and muted #4F5F67 is 6.02:1 on the surface. There is no dark theme to check.
- **Reduced motion:** the P2.8 CSS adds no animations or transitions.
- **Ring settings:**
  - Off by default.
  - The checkbox is described by `#checkpoint-ring-note`.
  - The note reports "Latest: at 1:00 dish time (1 kept)" and, later, "(2 kept)".
  - The Saved dishes row is labelled "(automatic checkpoint)" and says "not one of your ten save slots".

## Not verified
- **Browser storage-full path:** I tried to exercise it through CDP `Storage.overrideQuotaForOrigin` (`quota.vspec.ts`). Headless Chromium ignored the override: the estimate still reported a 2 GB quota and the checkpoint was written. So the "storage is nearly full" toast is verified only by reading the code and by the builder's MemoryBackend unit tests.
- **The rules verifier's other journal-import findings:** a malformed stamp breaking the Journal, and merged notes pushing out the player's own notes. They were not re-run here; see `observe-verify-rules.md`.
