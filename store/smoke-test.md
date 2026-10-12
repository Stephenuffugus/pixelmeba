# Pixelmeba — pre-launch smoke test (one real phone; PLAY_STORE_CHECKLIST §B6)

Run this on the APK or the Internal-testing install of the exact build you will promote. Name the phone (maker,
model, Android version, RAM): it becomes the measured device. Write what you saw next to each step (OK, or what
happened instead) and copy the result into `docs/EXPANSION_RESPONSE.md` §7. Steps 1–13 take about 45 minutes;
step 14 needs 15 minutes more. Extra detail for the storage steps is in `docs/ANDROID_SETUP.md` §10 item 8.

**Install.** Debug build: `npm run android:build:debug`, then
`adb install -r android/app/build/outputs/apk/debug/app-debug.apk`. Internal testing: install from the Play
testing link. Check Settings → Apps → Pixelmeba → App details shows version **1.0.0**.

| # | Do | You should see |
|---|---|---|
| 1 | Turn on **airplane mode**. Cold-launch Pixelmeba (swipe it out of Recents first). | The launcher icon is the dish with one green-and-gold colony, unclipped by the launcher's mask. A dark launch screen, then Home with Play, Notebook, Saved dishes, Field Guide, Settings, About. No network error anywhere. |
| 2 | Home → **About**. | App version 1.0.0, the content hash, the accessibility statement and the privacy line. |
| 3 | Home → Play → **Little Living Garden**. | The dish at 0:00 · 56 alive, paused. |
| 4 | **Run**, then 4×. Tap **Feed**, choose Sugar, **Place sugar**, tap the dish. Then **Look** and tap an organism. | The clock runs; a ring where the sugar landed; organisms move towards it and the alive count changes. The inspector names the organism and shows its constraint line. |
| 5 | Press **Home**, wait 30 s, return to Pixelmeba. | The dish is paused, "Paused while Pixelmeba was in the background. No dish time passed." shows, and the clock did not move. Run continues it. |
| 6 | More → **Save…** → Slot 1. Then Home → **Saved dishes** → open Slot 1. | "Saved" confirmation; the dish reopens at the same time and count. |
| 7 | With the dish running, open Settings → Apps → Pixelmeba → **Force stop**. Relaunch → Saved dishes. | Slot 1 and the automatic save open; nothing is lost except time after the last save; no error. |
| 8 | More → **Export living dish file**. In the share sheet choose "Save to Files" (or Drive). Then cancel a second Export. | The file `….pixelmeba` is saved where you chose. The cancelled one says "Not exported. Nothing changed." |
| 9 | More → **Import a dish file…** and pick the file from step 8. | The dish opens as it was. If the picker greys the file out, note it (ANDROID_SETUP §10 8.8). |
| 10 | More → **Share…** → Picture → Share, pick an app (e.g. Messages draft, then discard). | The system share sheet opens with a PNG of the dish; the dish is paused while the Share sheet is open. |
| 11 | **Rotate** the phone with a dish open, both ways. | The layout reflows; the dish stays at the same time; nothing is cut off. |
| 12 | Android Settings → Display → **Font size** largest (and Display size large); reopen Pixelmeba, then Settings → Text size **200 %**. | Every Home button and the dish's bottom bar still fit; text is not cut off; nothing scrolls sideways. |
| 13 | Turn on **TalkBack**. Visit Home, open the Garden, swipe through the top bar, the dish summary and the bottom bar, open Saved dishes. Turn TalkBack off. | Every control is announced with a name (Run, More, Speed, Add Life, Feed, Look, …); the dish has a spoken summary of who lives there. |
| 14 | **15-minute heat and frame-rate check**: Settings → **Show performance numbers** on; open the Garden; Run at 4× for 15 minutes with the screen on; note `diag-tick` (tick ms), frame rate and memory at 1, 5, 10 and 15 min, and how warm the phone feels. Then turn the setting off. | Steady numbers (the frame rate may drop at 4×; the speed badge then says "running at x.x×", which is honest, not a failure). Memory should not keep climbing after minute 5. Record the four readings (the same steps as `docs/reports/perf-rc1.md` "OWNER DEVICE"). |
| 15 | **Process death during a save**: start Save to Slot 2 and immediately force-stop (as step 7). Relaunch → Saved dishes → Slot 2. | Slot 2 opens either the new save or the one before it — never an error and never a broken slot. |
| 16 | Turn airplane mode **off** and repeat step 1 quickly. | Same as step 1 (the app does not behave differently online). |

Anything that fails: write the step, what you saw and the phone, and do not promote the release until it is
fixed or recorded as a known issue in `docs/EXPANSION_RESPONSE.md` §8.
