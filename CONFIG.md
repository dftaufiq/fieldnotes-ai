# FieldNotes AI — Configuration Guide

This repo ships **pre-wired to the live `fieldnotes-ai-9a2af` Firebase
project**: the real web config is already in `src/firebase-config.js`, AI Logic
is enabled on the free Gemini Developer API backend, Firestore exists
(production mode), and Anonymous Authentication is on. Two one-time console
actions remain — **publish the Firestore rules** (§5) and **finish App Check**
(§4) — and the steps below document the full setup so you can reproduce it or
point the app at your own project.

(If the config values are ever replaced with `YOUR_` placeholders, the app
falls back to demo mode — local notes + labelled local AI previews — and
switches back to live Firebase automatically once a real config is present.)

Backend cost: $0 (free Spark plan + free Gemini Developer API tier).

---

## 1. Create a Firebase project

1. Go to the [Firebase console](https://console.firebase.google.com) and click
   **Add project** (or select an existing one).
2. Name it (e.g. `fieldnotes-ai`) and complete the wizard.
   You do **not** need to enable Google Analytics.

## 2. Enable Firebase AI Logic (free Gemini Developer API backend)

1. In the console, open **AI Services → AI Logic** and click **Get started**.
2. When asked for a "Gemini API provider", choose the
   **Gemini Developer API** — it is free within generous limits and needs no
   billing account. (The Vertex AI / Agent Platform backend also works but
   requires billing.)
3. Finish the guided workflow. It enables the required APIs and automatically
   enforces **Firebase App Check** for AI Logic (see step 4).

## 3. Register a Web app and paste the config

> ✅ **Already done for this repo** — the `fieldnotes-ai-9a2af` web app is
> registered and its values are already in `src/firebase-config.js`.
> The steps below are for pointing the app at a different project.

1. In **Project settings → General → Your apps**, click the Web icon `</>`
   and register the app (e.g. nickname "FieldNotes Web"). You don't need
   Firebase Hosting for this step.
2. Firebase shows a `firebaseConfig` object. Copy **each value** into
   `src/firebase-config.js`:

   | Value in console        | Paste into field       |
   |-------------------------|------------------------|
   | `apiKey`                | `apiKey`               |
   | `authDomain`            | `authDomain`           |
   | `projectId`             | `projectId`            |
   | `storageBucket`         | `storageBucket`        |
   | `messagingSenderId`     | `messagingSenderId`    |
   | `appId`                 | `appId`                |

3. Reload the app. The header badge changes from "Demo mode" to
   "Live · Firebase connected".

> The web `apiKey` is a project identifier, not a secret — access is governed
> by App Check + Firestore rules. Still, never paste *service account* keys or
> other real secrets into this file.

## 4. App Check (required by AI Logic)

AI Logic requests are rejected unless App Check attestation succeeds.
The app implements the standard setup in `src/firebase.js`:

**Production — reCAPTCHA Enterprise:**

1. In **Security → App Check**, register the web app with
   **reCAPTCHA Enterprise** and copy the site key.
2. Paste it as `appCheckSiteKey` in `src/firebase-config.js`, replacing the
   `"APPCHECK_SITE_KEY"` placeholder, and rebuild. On non-localhost origins
   the app then initialises App Check with `ReCaptchaEnterpriseProvider`.

> ✅ **Status for this project:** the reCAPTCHA Enterprise site key is
> registered in the Firebase console for the production domains
> (`dftaufiq.github.io`, the Firebase Hosting domains, and `localhost`) and
> is wired in as `appCheckSiteKey` in `src/firebase-config.js`. On
> non-localhost origins the app initialises App Check with
> `ReCaptchaEnterpriseProvider`; on localhost it uses debug-token mode
> (below).

**Local development — debug-token mode (automatic on localhost):**

Per the official docs, when the app runs on `localhost` / `127.0.0.1` it sets
`self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` before initialising App Check.
In the modular SDK v13 there is no `DebugProvider` class (the docs sample is
out of date) — with that flag set, the SDK itself generates a debug token and
exchanges it instead of calling the reCAPTCHA provider:

1. Run the app (`npm run dev`), open the browser console, and find:
   `Firebase App Check debug token: <token>` — copy it.
2. In the console: **Security → App Check → Apps tab →** your web app →
   overflow menu → **Manage debug tokens** → register the token.
3. Reload the app — AI calls now pass attestation. (Debug tokens are accepted
   for submissions; each new browser/machine prints a new token that must be
   registered the same way.)

## 5. Firestore sync (optional but included)

Notes are local-first; sync activates when steps 1–3 are done **and**:

1. **Build → Authentication → Sign-in method**: enable **Anonymous**.
   (The app signs in anonymously so each browser gets its own notes space.)
   ✅ Already enabled for this project.
2. **Build → Firestore Database → Create database** (start in production mode).
   ✅ Already created for this project (default database).
3. **Deploy the security rules — REQUIRED, one time.** The database runs in
   **production mode, which denies all reads and writes until rules are
   published** — so note sync stays silent until this is done. The rules live
   in [`firestore.rules`](./firestore.rules) in this repo. Either paste them
   into the console **Rules** tab and click **Publish**, or deploy with the
   Firebase CLI: `firebase deploy --only firestore:rules`. The rules scope
   every user's notes to their own anonymous uid:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/notes/{noteId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

Notes sync to `users/{your-anonymous-uid}/notes`. If Auth or Firestore is not
enabled, the app simply keeps working locally — sync failures never block note-taking.

## 6. On-device inference (Gemini Nano in Chrome)

On-device inference is a property of the *visitor's browser*, not of your
Firebase project:

- Chrome **139+ on desktop**.
- Enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and restart Chrome.
- The first on-device request downloads Gemini Nano (a few GB) in the
  background — the app shows download progress on the AI buttons.
- Check status any time in DevTools: `await LanguageModel.availability()`
  → `"available"`, `"downloadable"` or `"downloading"`.

Everywhere else (other browsers, mobile, model not downloaded yet),
Firebase AI Logic automatically falls back to the cloud model, and the badge
on each result shows where it actually ran (`response.inferenceSource`).

## 7. Run it

```bash
npm install
npm run dev      # local development → http://127.0.0.1:5173
npm run build    # production build into dist/
npm run preview  # serve the production build locally
```

Deploy `dist/` to any static host — Firebase Hosting, GitHub Pages, Netlify…

## 8. GitHub Pages deployment (the live demo)

The live demo runs on GitHub Pages from the `gh-pages` branch of
[dftaufiq/fieldnotes-ai](https://github.com/dftaufiq/fieldnotes-ai):
**https://dftaufiq.github.io/fieldnotes-ai/**

Pages serves the app from the `/fieldnotes-ai/` subpath, so this deployment
uses a dedicated build mode (see `vite.config.js`):

```bash
npm run build:pages   # vite build --mode pages → base "/fieldnotes-ai/"
```

The default `npm run build` keeps base `/` for root deployments (Firebase
Hosting etc.). Supporting details already in the code: public-asset
references in `index.html` and the web manifest are relative, the service
worker is registered via `import.meta.env.BASE_URL`, and `public/sw.js`
resolves its shell URLs against its own scope — so both base paths work
without further changes.

To redeploy: run `npm run build:pages`, then publish the contents of `dist/`
(including the `.nojekyll` file) to the `gh-pages` branch.
