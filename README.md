# FieldNotes AI

**Notes that think, even off the grid.**

🔗 **Live demo: [dftaufiq.github.io/fieldnotes-ai](https://dftaufiq.github.io/fieldnotes-ai/)**

🏆 Built for the **[#BuildHybridAI 2026](https://firebasehybridaihackathon.devpost.com/)** hackathon on Devpost (Google / Firebase) — hybrid AI apps that run on-device *and* in the cloud with Firebase AI Logic.

FieldNotes AI is an offline-first AI notes app for the people who work where
connectivity is unreliable — field technicians, drivers, farmers, surveyors,
students. Capture a note anywhere; the AI routes itself:

- **Short notes** are summarised **on-device** by Gemini Nano through
  Firebase AI Logic *hybrid inference* — private, free, and fully offline.
- **Long documents** are handed to **Gemini in the cloud** for a structured
  deep summary, because they would overflow an on-device model's context.
- If the on-device model isn't available, the SDK **falls back to the cloud
  automatically** — and every AI result carries a badge showing where it
  actually ran, read from `response.inferenceSource`.

Built for the **#BuildHybridAI 2026** hackathon (Google / Devpost).

---

## How the hybrid inference works

FieldNotes uses two `GenerativeModel` instances from the Firebase AI Logic
Web SDK (`firebase/ai`, JS SDK v13):

| Route | Code | Used for |
|---|---|---|
| Hybrid (prefer on-device) | `getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE })` | Summarize, Extract action items |
| Cloud only | `getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: { model: "gemini-3.5-flash-lite" } })` | Deep summary of long documents (≥ 1,200 chars) |

Details that matter:

- **Backend:** Gemini Developer API (`new GoogleAIBackend()`) — free tier, no
  billing required.
- **On-device path:** Chrome's Prompt API running Gemini Nano. Requires
  Chrome 139+ on desktop. `model.initializeDeviceModel()` is called on the
  first AI button click (the docs require a user interaction first) and the
  model-download progress is shown in the UI.
- **Honest badges:** the SDK reports `result.response.inferenceSource`
  (`"on_device"` / `"in_cloud"`) on every response. The badge on each result
  card comes from that value — it is never guessed from the request.
- **App Check** is enforced by AI Logic: the debug provider is used for local
  development and judging; a reCAPTCHA Enterprise site key can be dropped into
  the config for production.
- **Graceful everywhere:** browsers without on-device support simply get the
  cloud model; with no Firebase config at all, the app still runs in a
  clearly-labelled demo mode with a tiny built-in extractive summariser.

## Features

- 📝 **Local-first notes** — create, edit, delete and search; everything works
  offline from `localStorage`. Two sample notes are included: a short one
  (on-device path) and a long inspection report (cloud path).
- ✦ **Summarize** — 2–3 sentence summary, hybrid routing.
- ☑ **Extract action items** — pulls the to-dos out of messy field notes.
- ☁ **Deep summary** — for long documents: Overview / Key facts / Risks /
  Next steps, always served by the cloud model.
- 🏷️ **Inference badges** — "On-device · Gemini Nano" vs "Cloud · Gemini" on
  every result, plus a live header pill showing on-device availability in the
  current browser (`LanguageModel.availability()`).
- 🔄 **Firestore sync** (optional) — anonymous sign-in, per-user notes at
  `users/{uid}/notes`, newest-edit-wins merging. Local use never blocks on it.
- 📱 **PWA shell** — manifest + service worker so the app opens offline.

## Quick start

```bash
npm install
npm run dev        # http://127.0.0.1:5173
```

The repo ships pre-configured for the live FieldNotes AI Firebase project
(AI Logic on the free Gemini Developer API backend), so live AI works out of
the box once the one-time console steps in **[CONFIG.md](./CONFIG.md)** are
done — publish [`firestore.rules`](./firestore.rules) and register an App Check
debug token (or paste the reCAPTCHA Enterprise site key when issued).
To point the app at your own Firebase project instead, replace the values in
`src/firebase-config.js`; with placeholder values the app runs in a
clearly-labelled demo mode with local notes and local AI previews.

## Architecture

```
index.html            App shell: hero, routing explainer, notes UI
firestore.rules       Firestore security rules — notes scoped to the owner uid
src/
  main.js             UI wiring, rendering, badges, status pills
  styles.css          Product styling (dark, field-ready)
  store.js            Local-first notes store (localStorage) + Firestore sync
  ai.js               Hybrid inference: models, routing, prompts, demo fallback
  firebase.js         Lazy, defensive Firebase/App Check/Auth/Firestore init
  firebase-config.js  ← the only file you edit: your Firebase config
public/
  manifest.webmanifest, icon.svg, sw.js   PWA shell
```

**Tech stack:** Vite · vanilla JavaScript · Firebase JS SDK v13
(`firebase/app`, `firebase/ai`, `firebase/app-check`, `firebase/auth`,
`firebase/firestore`) · Chrome Prompt API (Gemini Nano).

## Documentation references

- Hybrid inference, get started (Web):
  https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
- Hybrid configuration options — inference modes, `inferenceSource`, fallback model:
  https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options
- Get started with Firebase AI Logic:
  https://firebase.google.com/docs/ai-logic/get-started

## License

Apache-2.0 — see [LICENSE](./LICENSE).
