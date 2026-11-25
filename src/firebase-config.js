// ─────────────────────────────────────────────────────────────────────────────
// FieldNotes AI — Firebase configuration
//
// These are the LIVE values for the `fieldnotes-ai-9a2af` Firebase project.
// A Firebase web config is a public client identifier, not a secret: access
// is governed by Firebase App Check and the Firestore security rules
// (see firestore.rules). Never put service-account keys or other real
// secrets in this file.
//
// If you point the app at your own project, replace the values below with
// the ones from Firebase console → Project settings → General → "Your apps"
// → Web app (see CONFIG.md). If the values contain "YOUR_" placeholders, the
// app runs in DEMO MODE instead: local notes + clearly-labelled local AI
// previews, switching to live Firebase automatically once a real config is
// present.
// ─────────────────────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyBwOIHDb59QlDH5sPOwR6r1fnfVLlymsGc",
  authDomain: "fieldnotes-ai-9a2af.firebaseapp.com",
  projectId: "fieldnotes-ai-9a2af",
  storageBucket: "fieldnotes-ai-9a2af.firebasestorage.app",
  messagingSenderId: "517853071434",
  appId: "1:517853071434:web:526c858153b50d0efebeb3",
  // No measurementId — Google Analytics is off for this project.
};

// reCAPTCHA Enterprise site key for Firebase App Check in production.
// This is a public client identifier (safe to commit), registered for the
// fieldnotes-ai-9a2af project. On localhost the app uses the App Check debug
// provider instead (see firebase.js and CONFIG.md §4).
export const appCheckSiteKey = "6LfM6jEuAAAAALFOfrgZg0RFIcY0fQAyDfJOKNj6";

/**
 * True only when the placeholder values above have been replaced with a real
 * Firebase project configuration.
 */
export function isFirebaseConfigured() {
  return (
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.startsWith("YOUR_") &&
    firebaseConfig.projectId &&
    !firebaseConfig.projectId.startsWith("YOUR_") &&
    firebaseConfig.appId &&
    !firebaseConfig.appId.startsWith("YOUR_")
  );
}
