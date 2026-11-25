// ─────────────────────────────────────────────────────────────────────────────
// Firebase bootstrap for FieldNotes AI.
//
// Everything here is LAZY and DEFENSIVE: if the config still contains
// placeholders (demo mode) or any Firebase service fails to initialise, the
// app keeps working fully offline with local notes. Firebase features light
// up automatically once a real config is pasted into firebase-config.js.
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";
import { getAI, GoogleAIBackend } from "firebase/ai";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { firebaseConfig, appCheckSiteKey, isFirebaseConfigured } from "./firebase-config.js";

let cached = null; // { app, ai, db, auth } once initialised
let initPromise = null;

/**
 * Returns a promise for the Firebase services, or null in demo mode.
 * Never rejects — failures resolve to null so the UI can fall back to local.
 */
export function getFirebase() {
  if (!isFirebaseConfigured()) return Promise.resolve(null);
  if (cached) return Promise.resolve(cached);
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const app = initializeApp(firebaseConfig);

      // ── App Check ────────────────────────────────────────────────────────
      // Firebase AI Logic enforces App Check. Setup for the modular SDK v13:
      //  • The provider is ReCaptchaEnterpriseProvider, using the site key
      //    from firebase-config.js.
      //  • Debug-token mode: setting self.FIREBASE_APPCHECK_DEBUG_TOKEN
      //    BEFORE initializeAppCheck makes the SDK exchange a debug token
      //    (printed to the console; register it once in the Firebase console)
      //    instead of calling the provider. It is enabled on localhost per
      //    the official docs, and — until the real site key replaces the
      //    "APPCHECK_SITE_KEY" placeholder — on other origins too, so a
      //    registered debug token keeps the app working in the meantime.
      //  • API note: the docs' sample imports a `DebugProvider` class, but
      //    @firebase/app-check v13.4.0 ships no such export — the global
      //    debug-token flag above is the supported mechanism (verified
      //    against the installed SDK: getToken() short-circuits to the
      //    debug exchange whenever the flag is set).
      try {
        const isLocalhost =
          typeof location !== "undefined" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
        const hasSiteKey =
          Boolean(appCheckSiteKey) && appCheckSiteKey !== "APPCHECK_SITE_KEY";

        if (
          (isLocalhost || !hasSiteKey) &&
          typeof self !== "undefined" &&
          !self.FIREBASE_APPCHECK_DEBUG_TOKEN
        ) {
          self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
        }
        initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
          isTokenAutoRefreshEnabled: true,
        });
      } catch (e) {
        console.warn("[FieldNotes] App Check init skipped:", e);
      }

      // ── AI Logic service (Gemini Developer API backend — free tier) ─────
      const ai = getAI(app, { backend: new GoogleAIBackend() });

      // ── Firestore + anonymous auth (used only for note sync) ────────────
      let db = null;
      let auth = null;
      try {
        auth = getAuth(app);
        await signInAnonymously(auth);
        db = getFirestore(app);
      } catch (e) {
        console.warn("[FieldNotes] Firestore sync unavailable:", e);
      }

      cached = { app, ai, db, auth };
      return cached;
    } catch (e) {
      console.error("[FieldNotes] Firebase init failed, continuing locally:", e);
      return null;
    }
  })();

  return initPromise;
}

/** Current anonymous user id (for Firestore paths), or null. */
export function currentUid(fb) {
  return fb?.auth?.currentUser?.uid ?? null;
}
