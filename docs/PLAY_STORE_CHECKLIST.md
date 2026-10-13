# PLAY_STORE_CHECKLIST — Google Play release readiness

Two lists: what the implementing agent produces (Phase 4, P4.10–P4.12) and what only the owner can do in the
Play Console. Verify current Play policy requirements at submission time (target API level, declarations, and
asset specs change yearly); record what was verified and when in `EXPANSION_RESPONSE.md` §7.

Play's asset rules as read on 2026-10-12 (support.google.com/googleplay/android-developer/answer/9866151):
app icon "32-bit PNG (with alpha)", "512px by 512px", "Maximum file size: 1024KB"; feature graphic "JPEG or
24-bit PNG (no alpha)", "1024px by 500px"; screenshots "JPEG or 24-bit PNG (no alpha)", "Minimum dimension:
320px", "Maximum dimension: 3840px", "can't be more than twice as long as the minimum dimension", "up to 8
screenshots for each supported device type"; games' large-format eligibility "three 9:16 portrait screenshots
(minimum 1080x1920px)"; tablets "Use a 16:9 aspect ratio for landscape and a 9:16 aspect ratio for portrait",
"between 1,080 and 7,680px".

## A. Agent deliverables (in repo)

- [x] `android/` Capacitor project: `appId com.lucidwinds.pixelmeba`, `appName Pixelmeba`, version scheme
      `versionCode = major*10000 + minor*100 + patch` read from `package.json` "version" by
      `android/app/build.gradle` (1.0.0 → 10000; `tests/tools/version-scheme.test.ts`; `docs/ANDROID_SETUP.md`
      §7), adaptive icon (foreground/background layers) and splash from `art/src/icons/appIcon.ts`
      (`npm run android:icons`), no INTERNET-dependent features, no cleartext (`allowMixedContent: false`,
      `https://localhost`). **Still open:** the template's `INTERNET` permission stays until a device test
      without it (§B6, ANDROID_SETUP §10 item 6).
- [x] `targetSdkVersion`/`compileSdkVersion` 36 = Capacitor 8.5.2's template = Play's requirement for new apps
      since 2026-08-31 (read 2026-09-27 and 2026-10-12; ANDROID_SETUP §1). Re-check at submission (§B5).
- [x] Release build path documented in `docs/ANDROID_SETUP.md` §2–§8 (JDK 21, SDK, `npm run build`,
      `npx cap sync android`, `npm run android:build:release` / `./gradlew bundleRelease`, `keystore.properties`,
      `npm run android:keystore`, Play App Signing).
- [x] Debug APK built: `npm run android:build:debug` on 2026-10-12, versionCode 10000 / versionName 1.0.0
      (ANDROID_SETUP §9.2: bytes, sha256, aapt badging). Never installed here: no device (§B6).
- [x] `store/icon-512.png` (512 × 512, 32-bit RGBA with every pixel opaque, full square, no text, no rounded
      corners), `store/icon-foreground-512.png` + `store/icon-background-512.png` (the adaptive layers),
      `store/feature-1024x500.png` (24-bit RGB, drawn from a real Share → Picture of the Garden at a recorded
      tick), six screenshots each for phone (1080 × 1920), 7-inch tablet (1152 × 2048) and 10-inch tablet
      (1440 × 2560), all 9:16 24-bit RGB, rendered from the production build by `npm run store:assets`;
      provenance (build commit, recipe or save, seed, tick, state hash, steps) in
      `store/screenshots/manifest.json`; checked by `tests/tools/store-assets.test.ts`.
- [x] `store/listing.md`: app name "Pixelmeba"; short description (61 characters); full description
      (≤ 4000) from UX §10 edited to the shipped 1.0.0 scope; category Games › Simulation (alternative
      Educational); tags; fictional-simulation note; feature table; supported devices; save/export behaviour;
      contact placeholder; release notes for 1.0.0 (also `store/release-notes-1.0.0.md`). Checked by
      `tests/tools/listing.test.ts` (limits, forbidden claims, no later-update features, counts).
- [x] `PRIVACY_POLICY.md` (repo root) and its hostable page `store/privacy-policy.html` (made by
      `npm run store:assets`): no personal data collected; saves local; Android backup stated plainly;
      sharing only through the OS share sheet when the player chooses; Capacitor plugins named; permissions
      explained; contact placeholder. (Owner must host it at a public URL: §B3.)
- [x] `store/data-safety.md`: the Data safety form, question by question.
- [x] `store/content-rating.md`: the IARC questionnaire answers with reasons; expected Everyone / PEGI 3.
- [x] Accessibility statement in About (keyboard, screen-reader summary and selected-cell description, reduced
      motion, quiet audio, simplified overlay colours, 200 % text) and a privacy line
      (`src/ui/strings/about.ts` ABOUT_TEXT; `tests/e2e/about.spec.ts` on desktop and phone-portrait).
- [x] Pre-launch smoke test script: `store/smoke-test.md` (16 numbered steps with what to see).

## B. Owner tasks (Play Console and devices; the agent cannot do these)

Do them in this order. Each item says exactly what to click or run and what to keep.

### B1. Play Console account and identity

1. Sign in at <https://play.google.com/console> with the Google account that will own Pixelmeba.
2. If you have no developer account: **Create developer account** → choose **Organization** (Lucid Winds
   Arcade; needs a D-U-N-S number) or **Personal**; pay the one-time registration fee.
3. Complete **identity verification** (Account details → Verify identity): legal name, address, ID document;
   for an organization also the D-U-N-S number and website. Wait for "Verified".
4. Settings → **Payments profile**: create a merchants account (needed for a paid app); add a bank account
   and tax information. Wait until it is active.
5. Personal accounts created after November 2023 must run a closed test with at least 12 testers for 14 days
   before production access: check Dashboard → "Apply for production". If it applies, plan B7's closed test.

### B2. Create the app

1. Home → **Create app**. App name **Pixelmeba**; default language **English (United States) – en-US**;
   **Game**; **Paid**. Tick the two declarations (Developer Program Policies, US export laws) → Create app.
2. Monetize → **App pricing** → set **USD 0.99** → review the converted local prices (Play rounds them to local
   price points) → Save.
3. Release → **Production** → Countries / regions → **Add countries / regions**: choose all, or your list →
   Save. (Paid apps are only offered where you have a merchant-supported region.)

### B3. Host the privacy policy and paste the URL

1. Run `npm run store:assets -- --only icon` (it also writes `store/privacy-policy.html` from
   `PRIVACY_POLICY.md`; it needs no browser).
2. Replace both `<owner: support email>` placeholders in `PRIVACY_POLICY.md` first, rerun step 1.
3. Host the page at a public **https** URL that stays up. Either:
   - **Lucid Winds site:** upload `store/privacy-policy.html` as e.g. `https://<your site>/pixelmeba/privacy`;
     or
   - **GitHub Pages:** create a public repository (e.g. `pixelmeba-privacy`), add `store/privacy-policy.html`
     as `index.html`, commit, then repository Settings → Pages → Source "Deploy from a branch", branch `main`,
     folder `/ (root)` → Save; the URL is `https://<user>.github.io/pixelmeba-privacy/`.
4. Open the URL on a phone to check it loads without a login.
5. Policy → **App content** → **Privacy policy** → paste the URL → Save. Also put it in `store/listing.md`
   "Contact details".

### B4. App content declarations (Policy → App content), one by one

1. **Privacy policy**: B3.
2. **Ads**: "No, my app does not contain ads".
3. **App access**: "All functionality is available without special access" (no login).
4. **Content rating**: Start questionnaire → your email → category **Game** → answer from
   `store/content-rating.md` → Submit. Expected Everyone / PEGI 3; record the issued ratings in
   `docs/EXPANSION_RESPONSE.md` §7.
5. **Target audience and content**: age groups **13–15, 16–17, 18 and over** (recommended; choose "Everyone
   but not designed for children" wording where offered). Do not choose under-13 groups unless you decide to
   enrol in Designed for Families (extra policy review; teacher-approved optional). "Could your store
   listing unintentionally appeal to children?": answer honestly (the art is friendly; the listing does not
   target children).
6. **Data safety**: answer from `store/data-safety.md` ("Does your app collect or share any of the required
   user data types?" → **No**; independent security review → No) → Save → Submit.
7. **News app**: No. **COVID-19 contact tracing and status**: My app is not a publicly available COVID-19
   contact tracing or status app. **Government app**: No. **Financial features**: My app doesn't provide any
   financial features. **Health**: My app does not have any health features. **Advertising ID** (if asked):
   No (the app does not use it). **Photo and video permissions** / **Foreground service** (if asked): none
   used.

### B5. Signing and the release bundle

1. Install JDK 21 and the Android SDK (`docs/ANDROID_SETUP.md` §2). Check: `java -version` says 21.
2. Create the upload key **outside the repository** and back it up with its passwords in two places:
   `npm run android:keystore -- --out /path/outside/repo/pixelmeba-upload.jks` (ANDROID_SETUP §5).
3. Create `android/keystore.properties` with the four lines the script prints (ANDROID_SETUP §6). It is
   gitignored; never commit it.
4. Re-check the target API page (<https://developer.android.com/google/play/requirements/target-sdk>); if Play
   now requires more than 36, raise `compileSdkVersion`/`targetSdkVersion` in `android/variables.gradle`.
5. Version: `package.json` "version" is the only source (ANDROID_SETUP §7). 1.0.0 → versionCode 10000. For a
   second upload of the same release candidate bump the patch (1.0.1 → 10001), because Play refuses a reused
   versionCode: change `package.json` "version" and `src/persistence/appVersion.ts` `APP_VERSION` together
   (`tests/tools/version-scheme.test.ts` checks that they agree).
6. `npm ci && npm run check && npm run android:build:release`. The script prints the AAB path, size, sha256
   and runs `jarsigner -verify`: it must end with `jar verified.` naming your upload certificate. If it prints
   "UNSIGNED", step 3 is missing.
7. Play App Signing: on the first upload (B7) accept **Google-generated app signing key** (the default). Keep
   the upload key; if it is ever lost, Play Console → Setup → App integrity → request an upload key reset.

### B6. Device tests on a named phone (before any track beyond Internal)

Name the phone (maker, model, Android version, RAM) in `docs/EXPANSION_RESPONSE.md` §7; it becomes the
measured device.

1. `npm run android:build:debug`, then `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.
2. Run every step of `store/smoke-test.md` (launch offline, Garden, feed, background/resume, save, force-stop
   during a save, export through the share sheet, import, share sheet, rotate, 200 % font, TalkBack, the
   15-minute heat and frame-rate readings) and write what you saw.
3. The 15-minute heat/frame-rate/memory readings follow `docs/reports/perf-rc1.md` (its OWNER DEVICE ITEMS:
   heat over 15 min, touch feedback p95 < 100 ms, 30 fps at 6,000 agents on a mid-range phone). Record the
   numbers in EXPANSION_RESPONSE §7.
4. The storage and lifecycle checks of `docs/ANDROID_SETUP.md` §10 item 8 (8.1–8.13), including "Home during
   a save, then a long wait" and "a nearly full phone".
5. The `INTERNET` permission test (ANDROID_SETUP §10 item 6): remove it from
   `android/app/src/main/AndroidManifest.xml`, rebuild, install, cold-launch in airplane mode, play, save,
   reopen. Keep it removed only if all of that works; then update `PRIVACY_POLICY.md` "Permissions".
6. Look at the launcher icon on a real launcher (circle, squircle, teardrop masks), the Android 12+ launch
   screen and, on an old launcher, the legacy icon (ANDROID_SETUP §10 item 5).
7. Decide D-0092's store (keep the Filesystem saves or flip to IndexedDB) after 4. (ANDROID_SETUP §10 item 9).

### B7. Internal testing upload

1. Release → Testing → **Internal testing** → Testers: create an email list with yourself (and testers) →
   Save; copy the opt-in link.
2. **Create new release** → upload `android/app/build/outputs/bundle/release/app-release.aab` → release name
   `1.0.0 (10000)` → release notes from `store/release-notes-1.0.0.md` → Next → Save → **Start rollout to
   Internal testing**.
3. Open the opt-in link on the B6 phone, install from Play, and repeat smoke-test steps 1–6 on the Play-signed
   build.
4. Read the **Pre-launch report** (Release → Testing → Pre-launch report) when it finishes: crashes,
   accessibility and security warnings. Record anything it finds in EXPANSION_RESPONSE §7.

### B8. Store listing upload (Grow users → Store presence → Main store listing)

1. App name, short description, full description: paste the `listing:name`, `listing:short` and
   `listing:full` blocks of `store/listing.md` exactly.
2. App icon: `store/icon-512.png`. Feature graphic: `store/feature-1024x500.png`.
3. Phone screenshots: `store/screenshots/phone/01-…06-…png` in that order. 7-inch tablet:
   `store/screenshots/tablet7/`. 10-inch tablet: `store/screenshots/tablet10/`. Captions are not uploaded
   (Play has no caption field); the optional captions in `store/listing.md` are for the website.
4. Before uploading, regenerate them on the final tree: `npm run store:assets` (about 30–60 minutes on a
   2-core machine; it builds `tmp/dist-store` and serves it on port 5284), check
   `store/screenshots/manifest.json` names the commit you release, and look at every image.
5. Store settings → App category: **Games › Simulation**; tags (up to 5) from `store/listing.md`; contact
   email `<owner: support email>` and website. Save.
6. Optional promo video: the 30-second trailer of D09 §11 is owner-made; leave empty otherwise.

### B9. Usability gates (D09 §12) — formative, not required for submission

Run them before Production if you can. Record each session's date, the build commit, what you showed, the
counts below and short notes in `docs/EXPANSION_RESPONSE.md` §7 ("Usability gates"). Never create child
accounts, never install trackers or analytics, and have a researcher take notes by hand; a parent or guardian
is present for every child and gives consent.

1. **Appeal in ten seconds.** Show 8 adult viewers who do not know Pixelmeba a 10-second clip of real play
   (open on the Garden; add food; a response; a What if? change). Ask "What do you do in this game?". Pass:
   **≥ 6 of 8** describe both changing a dish and watching living consequences. If it fails: revise the opening
   footage and the promise before adding content.
2. **Accessible first experiment.** 5 supervised child testers (separately: 2 adult novices) get the phone on
   Home with no instructions beyond "try it". Count who **starts the Garden, feeds, finds a response
   (e.g. the inspector or organisms moving to the food) and pauses**, with **≤ 1 verbal prompt** each. Pass:
   **≥ 4 of 5** children; record the adults separately. If it fails: fix the controls or feedback, not a longer
   tutorial.
3. **Replay invitation.** 8 novice players finish one Garden session; tell them "you may stop now". Pass:
   **≥ 5 of 8** voluntarily choose a second setup (What if?, Again, another dish). Record why each continued or
   stopped.
4. **Share clarity.** 5 testers get three tasks ("send a friend a picture", "let a friend start the same dish",
   "move this exact world to your other phone"). Pass: **≥ 4 of 5** pick Picture, Starting recipe and Living
   dish respectively.
5. **Technical integrity** is covered by the test suite (determinism, variants change only declared data,
   cancellation loses nothing, a failed import keeps the active world): nothing to run by hand.

### B10. The Lucid Winds Arcade build

1. Choose **full web build** (`npm run build` → `dist/`) or the **DEMO_MODE** build (P4.11:
   `npm run build:demo`: the Garden, its variants, the five Phase 1 organisms, Explore, save/export; same save
   format) for the arcade card. Record the choice in EXPANSION_RESPONSE §8.
2. If you choose the demo, give its page a link to the Play listing
   (`https://play.google.com/store/apps/details?id=com.lucidwinds.pixelmeba`, live once B11 is done).
3. Deploy with `tools/deploy-arcade.mjs` from a checkout that has the `lucid-winds` worktree (owner/lead only).
4. **The arcade deploy plays online only for now (D-0097).** The stamped layout's `<base>` moves the page's folder,
   so no service worker registers there. Send the arcade's manifest/embedding rules (where the game's files live,
   whether a service worker may control that folder) and the lead will enable offline play there. The plain
   `dist/` served from its own folder (any static host) already plays offline after the first load.

### B11. Promote and launch

1. Internal → **Closed testing** (B1.5 if it applies) → **Production**: Release → Production → Create new
   release → **Promote release** from the tested track → release notes `store/release-notes-1.0.0.md` →
   Review → **Start rollout to Production** (100 %, or a staged percentage).
2. Send for review; publishing can take several days for a new app. Then tag the repository as you release.
3. After launch watch **Play vitals** (crashes and ANRs; the app has no crash SDK by design) and reviews.
4. Content updates v1.1–v1.3 ship as ordinary version bumps (minor: 1.1.0 → 10100). Each needs updated listing
   text and screenshots if new features are advertised (`npm run store:assets`, `tests/tools/listing.test.ts`
   moves its later-update list), and a fresh Data safety check if anything about data changes.

### B12. Decisions waiting for the owner since g3 (details: `docs/EXPANSION_RESPONSE.md` §8)

- **D-0064** audio: listen to every cue (`npm run dev`, `/tools/audio-preview.html`); should reduced motion also
  quiet audio?
- **D-0065** accessibility pass 1: the danger colour #B3473F → #AD4239; the dish summary's trend is a count.
- **D-0066** performance pass 1: the < 10 ms tick criterion against a phone-class target; genome-table
  compaction under a rules version; the two rule-changing tick options.
- **D-0067** G3 evidence: curated dishes that empty (L301, L306; L303).
- **D-0068** EXP_104 reaches its gate only in the first ~10 s; keep it in v1.0 or drop it from the card list.
- **D-0074** prompt progress is not kept across loads.
- **D-0079** one cross-source clock for unsolicited notices? Is the quiet first minute right?
- **D-0082** the shelf as Try my dish's "slot"; the transfer preview moved to Phase 5.
- **D-0083** recipe files: exact build match (as built) or the looser What if? rule.
- **D-0087** what a challenge's budget counts; whether a challenge goal survives Undo.
- **D-0091** signing and the device checks (B5, B6).
- **D-0092** keep the Filesystem save store or flip back to IndexedDB after the device test (B6.7).
- **D-0093** allowBackup; settings in localStorage instead of Preferences; INTERNET; the icon art.
- **D-0094** the open performance criteria and their D-0066 options; the device steps.
- **D-0098 / P4.12** (`docs/reports/reviews/g4-wave-7b/store-build.md`): the store icon at 75 % of the
  square; tablet screenshots in 9:16; the listing text; `allowBackup` stated in the privacy policy (D-0098).
- **D-0097** the arcade's manifest/offline rules; full or demo build; the demo's store link (§B10).

## C. Lucid Winds Arcade (web)

- [ ] Owner provides the arcade's manifest/embedding format; until then, `dist/` is a self-contained static
      bundle with relative paths and iframe-safe behaviour (P4.11). It plays offline after the first load when
      served from its own folder; the stamped arcade deploy registers no service worker and plays online (D-0097, §B10.4).
- [ ] Decide: full web build or `DEMO_MODE` build for the arcade (§B10).
