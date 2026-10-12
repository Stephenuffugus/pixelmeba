# Pixelmeba — Google Play store listing (v1.0.0)

Paste the fenced blocks into Play Console → Grow users → Store presence → Main store listing. Each block is
checked by `tests/tools/listing.test.ts` (length limits, no forbidden claim, nothing from a later update).
Every claim below names something the 1.0.0 build has (UX §10, D09 §11: "Use this wording only where every
claimed capability exists in the release build").

## App name (≤ 30 characters)

<!-- listing:name -->
```text
Pixelmeba
```

## Short description (≤ 80 characters)

<!-- listing:short -->
```text
Grow a tiny living world. Change one thing. See what happens.
```

## Full description (≤ 4000 characters)

<!-- listing:full -->
```text
Grow a tiny living world. Add organisms, feed them, and shape their habitat in a colorful pixel dish. Follow changing families, try a different starting setup, and discover what happens when your choices meet a living ecosystem. Start with a few simple tools, then explore deeper experiments at your own pace.

Every organism, rate and chemical is a fictional game rule, not a real laboratory measurement.

START SMALL
• Open the Little Living Garden: a sugar patch, a few kinds of cells, and one question: who finds something to eat?
• Three simple actions: Add Life, Feed and Look. Run, pause, step one tick, or speed up to 4×.
• Tap any organism to see what it is doing and what limits it right now.
• Undo rewinds time, so trying something costs nothing.

CHANGE ONE THING
• What if? offers one change at a time, like moving dinner farther away, and shows the difference before you start.
• Compare copies a dish, changes one thing, and runs both side by side with a results table.
• 14 guided experiments in the Notebook, each with a question, a prediction you can write down, and measured results.

A REAL LIVING WORLD
• 19 kinds of fictional microscopic life: bacteria, an alga, yeasts, two threadlike fungi, grazers and hunters, a phage and a hitchhiking parasite.
• Food is never free: what one organism eats, another may leave behind.
• Inherited differences arise as cells divide. When a difference persists across generations, the Family tree records a new branch you can name, follow and keep as a specimen.
• Quiet dishes and extinctions happen too; History and what happened shows the record.

THE LAB
• Three habitats: Water Garden, Gel Colony and Sediment Edge, plus four curated dishes.
• Paint gel and sediment, place stones, walls and beads, add chemistry, open or close the lid.
• Overlays, charts, a relationship map and region probes show what is happening.

KEEP AND SHARE
• Favorites, story cards, bookmarks, a specimen gallery, optional goals and your own challenges.
• Share a picture, a starting recipe or a whole living dish file through your phone's share sheet.

PLAYS YOUR WAY
• Fully offline. No accounts, no ads, no in-app purchases, no timers.
• When you leave the app the dish pauses; no time passes while you are away.
• Works with a keyboard and screen readers; Reduced motion, Quiet audio, Simplified overlay colours and text up to 200 %.

SAVES
• Ten save slots, an automatic save and optional checkpoints, kept on your device.
• Export a dish as a .pixelmeba file to keep a copy or move it to another device, and import it again.

Supported devices: Android 7.0 or newer, phones and tablets.
```

## Feature list (for the listing's screenshots captions and the website; same claims as above)

| Feature | Where it is in 1.0.0 |
|---|---|
| The Little Living Garden: Add Life, Feed, Look; Run, Pause, Step, 1×/2×/4× | Home → Play |
| Inspector: what an organism is doing and what limits it (constraint line) | tap an organism |
| Undo rewinds time | the bottom bar, More |
| What if? (one change, before/after preview) and paired Garden variants | Play → What if?, More → What if? |
| Compare: copy a dish, change one thing, results table | More → Compare |
| 14 Notebook experiments with prediction and results | Notebook → Experiments |
| 19 organisms; 3 habitats; 4 curated dishes | New dish, Field Guide |
| Family tree: branches, names, pins, specimens, trait overlay | Lab → Observe → Family tree |
| Lab: habitat paint, stones/walls/beads, chemistry, lid; overlays, charts, relationship map, region probes | Lab view |
| Favorites, story cards, bookmarks, specimen gallery, goals, custom challenges, Try my dish | Notebook, More |
| Share: picture, starting recipe, living dish file | More → Share |
| Ten slots, autosave, optional checkpoints, export/import `.pixelmeba` | More → Save, Saved dishes |
| Keyboard, screen-reader summary, reduced motion, quiet audio, narration (off by default), 200 % text | Settings |

## Supported devices

Android 7.0 (API 24, `minSdkVersion 24`) or newer; phones and tablets, portrait and landscape. Built for
Android 16 (`targetSdkVersion 36`). No network connection is needed or used.

## Save and export behaviour

Dishes are saved in the app's own storage on the device (ten named slots, an automatic save when the app goes
to the background, and optional automatic checkpoints). Nothing is uploaded. A dish leaves the device only when
the player chooses Share or Export, as a file through the system share sheet. Uninstalling the app deletes its
saves; export a `.pixelmeba` file first to keep a copy. The player's own Android backup may include the app's
data (see `PRIVACY_POLICY.md`).

## Fictional-simulation note

Every organism, rate and chemical is a fictional game rule, not a real laboratory measurement. (Also in the
full description and in the app's About page.)

## Category and tags

- Application type: **Game**; category: **Simulation** (alternative: **Educational**, under Games).
- Tags (choose up to 5 in Play Console → Store settings): Simulation, Sandbox, Casual, Offline, Single player.
- Price: $0.99 (Paid; no in-app purchases, no ads).

## Contact details

- Email: `<owner: support email>`
- Website: `<owner: Lucid Winds site or the privacy-policy host>`
- Privacy policy URL: `<owner: the hosted PRIVACY_POLICY.md, see docs/PLAY_STORE_CHECKLIST.md §B3>`

## Screenshot captions (optional; the images carry no text overlay)

1. Grow a tiny living world.
2. Add life, feed it, and watch what happens.
3. What if? Change one thing.
4. Tap any organism to see what limits it.
5. A difference that lasted for generations, recorded in the family tree.
6. Run an experiment and read the results.

## Release notes for 1.0.0 (≤ 500 characters)

The same text is in `store/release-notes-1.0.0.md`.

<!-- listing:release -->
```text
The first release of Pixelmeba. Grow a tiny living world in a pixel dish: add life, feed it and watch what happens. Try What if? ideas, compare dishes side by side, run 14 Notebook experiments, follow families in the family tree and share pictures, recipes or living dishes. Fully offline, no ads, no accounts.
```
