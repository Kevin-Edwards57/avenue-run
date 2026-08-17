# Shipping Avenue Run to Google Play

Avenue Run is a PWA, so the Android app is a thin **Trusted Web Activity (TWA)** —
a native shell that loads the live site (`https://avenue-run.vercel.app`)
full-screen with no browser UI. Same codebase powers web, Android, and iOS; you
only maintain one build.

You need a **Google Play Developer account** (one-time $25) before you can
publish.

## Store assets (already generated in this repo)

- App icon (512×512): `public/icon-512.png`
- Feature graphic (1024×500): `store-assets/feature-graphic.png`
- Phone screenshots: `screenshots/menu.png`, `gameplay.png`, `jetpack.png`, `customizer.png`
- Short/long description: see the README

You still need to write a one-line short description and a **privacy policy URL**
(Play requires one even if you collect nothing — a single page stating the game
stores only local high scores on the device is enough).

---

## Build the app bundle

Pick one path. Both output an `.aab` you upload to Play.

### Option A — PWABuilder (no local tools, easiest)

1. Go to **pwabuilder.com** and enter `https://avenue-run.vercel.app`.
2. **Package For Stores → Android → Google Play**.
3. Set:
   - Package ID: `com.avenuerun.game` (must be globally unique on Play; change if taken)
   - App name: `Avenue Run`
   - Signing: **Let PWABuilder generate a new signing key** (first time).
4. Download the zip. It contains the **`.aab`**, the **signing `.keystore`** + its
   passwords, and a ready-made **`assetlinks.json`**.
5. **Save the `.keystore` file and passwords somewhere safe.** That is your upload
   key — you need it for every future update.

### Option B — Bubblewrap (local build)

The Android SDK is already installed at `~/Library/Android/sdk`; you only need a
JDK 17 (Bubblewrap can download one on first run).

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://avenue-run.vercel.app/manifest.webmanifest
bubblewrap build
```

`init` asks for the package ID (`com.avenuerun.game`), app name, and creates a
signing keystore — **keep it safe**. `build` produces `app-release-signed.aab`
and prints the SHA-256 fingerprint you need in the next step.

---

## Link the domain (removes the browser address bar)

The TWA only goes full-screen if the site proves it owns the app. This repo ships
a template at `public/.well-known/assetlinks.json`.

1. Get your **app-signing SHA-256 fingerprint**:
   - PWABuilder puts it in the generated `assetlinks.json`.
   - Bubblewrap prints it after `build`.
   - After you upload to Play, the canonical one is in
     **Play Console → Test and release → App integrity → App signing key certificate**
     (use this one if you enable Play App Signing, which is recommended).
2. Paste it into `public/.well-known/assetlinks.json` (replace
   `REPLACE_WITH_YOUR_APP_SIGNING_SHA256_FINGERPRINT`) and set the correct
   `package_name`.
3. Redeploy (`npx vercel --prod --yes`) and confirm it serves:
   `https://avenue-run.vercel.app/.well-known/assetlinks.json`

> Tip: if you use Play App Signing, add **both** fingerprints (your upload key and
> Google's app-signing key) to the `sha256_cert_fingerprints` array.

---

## Publish

1. **Play Console → Create app** → fill name, default language, "App", "Free".
2. **Create a release** (Internal testing first is fastest) → upload the `.aab`.
3. Fill the store listing: short + full description, the icon, feature graphic,
   and at least 2 phone screenshots (use the ones in `screenshots/`).
4. Complete **Content rating**, **Data safety** (declare: stores high scores
   locally, no data collected/shared), **Target audience**, and add the privacy
   policy URL.
5. Roll out to Internal testing, install on your phone to confirm it opens
   full-screen (address bar gone = asset links verified), then promote to
   Production.

Reviews usually clear within a day or two.
