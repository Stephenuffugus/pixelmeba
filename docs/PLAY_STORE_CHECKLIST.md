# PLAY_STORE_CHECKLIST — Google Play release readiness

Two lists: what the implementing agent produces (Phase 4, P4.10–P4.12) and what only the owner
can do in the Play Console. Verify current Play policy requirements at submission time (target
API level, declarations, and asset specs change yearly); record what was verified and when in
`EXPANSION_RESPONSE.md` §7.

## A. Agent deliverables (in repo)

- [ ] `android/` Capacitor project: `appId com.lucidwinds.pixelmeba`, `appName Pixelmeba`,
      `versionCode`/`versionName` scheme (`versionCode = major*10000 + minor*100 + patch`), adaptive
      icon (foreground/background layers), splash, no INTERNET‑dependent features, no cleartext.
- [ ] `targetSdkVersion`/`compileSdkVersion` ≥ current Play requirement for new apps (check
      Capacitor's template and the Play policy page at build time; record the values).
- [ ] Release build path documented in `docs/ANDROID_SETUP.md`: JDK/SDK install, `npm run build`,
      `npx cap sync android`, `./gradlew bundleRelease`, signing config via `keystore.properties`
      (gitignored), keystore generation command for the owner, Play App Signing note.
- [ ] Debug APK built if the SDK is available; otherwise exact blocker documented.
- [ ] `store/icon-512.png` (512×512, 32‑bit PNG, no alpha per Play rules), `store/feature-1024x500.png`,
      phone screenshots (≥ 2, ideally 6; 16:9 or 9:16; min 320 px, max 3840 px), 7" and 10" tablet
      screenshots (recommended), all rendered from the real build via `npm run store:assets`.
- [ ] `store/listing.md`: app name (≤ 30 chars) "Pixelmeba"; short description (≤ 80 chars); full
      description (≤ 4000 chars) from UX §10 edited to shipped scope; category **Games › Simulation**
      (alternative: Education); tags; "fictional simulation" note; feature table; contact email
      placeholder; release notes for 1.0.0.
- [ ] `PRIVACY_POLICY.md`: no personal data collected; saves are local; sharing is user‑initiated
      through the OS share sheet; no accounts, ads, analytics, or third‑party SDKs beyond Capacitor
      plugins; contact placeholder. (Owner must host it at a public URL.)
- [ ] `store/data-safety.md`: answers for the Data safety form — no data collected or shared; no
      encryption‑in‑transit question applies; no deletion request mechanism needed; note Capacitor
      plugins used and that none transmit data.
- [ ] `store/content-rating.md`: notes for the IARC questionnaire (no violence beyond abstract
      pixel dissolves, no user interaction/chat, no purchases, no ads, no location, no user‑generated
      content shared online). Expected rating: Everyone / PEGI 3.
- [ ] Accessibility statement in About (keyboard, screen‑reader summaries, reduced motion, 200 % text).
- [ ] Pre‑launch smoke test script: install debug APK, cold launch offline, create Garden, feed,
      background/resume, save, export file, import file, rotate, 200 % font, TalkBack basic pass.

## B. Owner tasks (Play Console; cannot be done by the agent)

- [ ] Google Play Developer account in good standing; developer identity verification complete.
- [ ] Create app "Pixelmeba", default language, **Game**, **Paid**. Set price **$0.99 USD** and
      review auto‑converted local prices; choose countries.
- [ ] App content declarations: privacy policy URL (host `PRIVACY_POLICY.md`, e.g. on the Lucid
      Winds site or GitHub Pages); ads = **No**; app access = all functionality available without
      login; content rating questionnaire; **target audience** — recommended "Ages 13+" or "Everyone
      but not designed for children" unless you choose to enroll in Designed for Families (extra
      requirements: teacher‑approved review, content policies, no personalized ads — we have no ads);
      news app = No; COVID = No; data safety = no data collected; government app = No; financial
      features = No; health = No.
- [ ] Play App Signing: enroll; create the upload keystore locally with the command in
      `docs/ANDROID_SETUP.md`; keep it out of the repo; back it up.
- [ ] Build the release AAB locally (`./gradlew bundleRelease`) with the SDK/JDK per
      `docs/ANDROID_SETUP.md`; upload to **Internal testing** first; run the Pre‑launch report; test on
      at least one real phone (name it — this becomes the measured‑performance device).
- [ ] Store listing: upload icon, feature graphic, screenshots; paste `store/listing.md` text;
      contact email; optional promo video (the 30‑second trailer per D09 §11 is optional and owner‑made).
- [ ] Usability gates (D09 §12) if desired before launch: 8 adult viewers 10‑second clip test;
      5 supervised child testers + 2 adult novices first experiment; replay invitation; share
      clarity. Record outcomes; they are formative, not required for submission.
- [ ] Promote Internal → Closed/Open testing → Production. Set release notes. Monitor crashes
      (Play vitals; the app has no crash SDK by design).
- [ ] Post‑launch: content updates v1.1–v1.3 ship as ordinary version bumps; each needs updated
      listing text if features are advertised.

## C. Lucid Winds Arcade (web)
- [ ] Owner provides the arcade's manifest/embedding format; until then, `dist/` is a self‑contained
      static bundle with relative paths, PWA offline support, and iframe‑safe behavior.
- [ ] Decide: full web build or `DEMO_MODE` build for the arcade.
