// ─────────────────────────────────────────────────────────────────────────────
// FieldNotes AI — hybrid inference with Firebase AI Logic.
//
// HOW THE HYBRID SPLIT WORKS
//   • Short notes  → a GenerativeModel with mode = PREFER_ON_DEVICE.
//     Firebase AI Logic runs the prompt on-device with Gemini Nano (via the
//     Chrome Prompt API) when available — private, free, works offline — and
//     silently falls back to a cloud-hosted Gemini model when it is not.
//   • Long documents → a GenerativeModel with mode = ONLY_IN_CLOUD plus an
//     explicit cloud model via inCloudParams. Long input would overflow the
//     on-device model's small context window, so we route it straight to the
//     cloud for a "deep summary".
//
// HOW WE KNOW WHERE A RESPONSE RAN
//   Every response carries `response.inferenceSource` ("on_device" or
//   "in_cloud", JS SDK v12.5.0+). The UI badge is driven by that value —
//   never guessed.
//
// Docs:
//   https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
//   https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options
// ─────────────────────────────────────────────────────────────────────────────

import { getGenerativeModel, InferenceMode, InferenceSource } from "firebase/ai";
import { getFirebase } from "./firebase.js";
import { isFirebaseConfigured } from "./firebase-config.js";

/**
 * Notes at or above this length are treated as "long documents": the Summarize
 * button still works on them (hybrid), but they also unlock Deep Summary,
 * which is always served by the cloud model.
 */
export const LONG_NOTE_CHARS = 1200;

// Gemini Nano's on-device context window is small, so hybrid prompts are
// capped; the cloud model gets a much larger slice for deep summaries.
const ON_DEVICE_INPUT_CAP = 6000;
const CLOUD_INPUT_CAP = 24000;

// Default cloud model for Firebase AI Logic hybrid mode (JS SDK v13+).
const CLOUD_MODEL = "gemini-3.5-flash-lite";

let hybridModel = null;
let cloudModel = null;
let deviceInitPromise = null;

// ── On-device availability (Chrome Prompt API) ──────────────────────────────
/**
 * Asks Chrome whether the on-device model (Gemini Nano) can run here.
 * Returns { state, label } where state is one of:
 * 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported'
 */
export async function checkOnDeviceAvailability() {
  try {
    const LM = globalThis.LanguageModel;
    if (!LM || typeof LM.availability !== "function") {
      return {
        state: "unsupported",
        label: "On-device AI not supported in this browser — cloud fallback active",
      };
    }
    const a = await LM.availability();
    switch (a) {
      case "available":
        return { state: "available", label: "On-device AI ready · Gemini Nano in this browser" };
      case "downloadable":
        return { state: "downloadable", label: "On-device AI available — Gemini Nano downloads on first use" };
      case "downloading":
        return { state: "downloading", label: "On-device AI model is downloading…" };
      default:
        return {
          state: "unavailable",
          label: "On-device AI unavailable on this device — cloud fallback active",
        };
    }
  } catch (e) {
    return {
      state: "unsupported",
      label: "On-device AI not supported in this browser — cloud fallback active",
    };
  }
}

// ── Model factories ─────────────────────────────────────────────────────────
async function getHybridModel() {
  if (hybridModel) return hybridModel;
  const fb = await getFirebase();
  if (!fb?.ai) return null;
  hybridModel = getGenerativeModel(fb.ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
  });
  return hybridModel;
}

async function getCloudModel() {
  if (cloudModel) return cloudModel;
  const fb = await getFirebase();
  if (!fb?.ai) return null;
  cloudModel = getGenerativeModel(fb.ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: CLOUD_MODEL,
      generationConfig: { maxOutputTokens: 1200, temperature: 0.4 },
    },
  });
  return cloudModel;
}

/**
 * The docs require initializeDeviceModel() to be called after a user
 * interaction (our AI buttons qualify) and before generateContent().
 * It triggers/waits for the Gemini Nano download; progress is reported
 * through onProgress(0..1). Safe to call repeatedly — it runs once.
 */
function ensureDeviceModel(model, onProgress) {
  if (!deviceInitPromise) {
    deviceInitPromise = (async () => {
      try {
        await model.initializeDeviceModel((v) => {
          if (typeof onProgress === "function") onProgress(v);
        });
      } catch (e) {
        // Non-fatal: PREFER_ON_DEVICE will simply fall back to the cloud.
        console.warn("[FieldNotes] initializeDeviceModel:", e);
      }
    })();
  }
  return deviceInitPromise;
}

function sourceOf(result) {
  const s = result?.response?.inferenceSource;
  if (s === InferenceSource.ON_DEVICE || s === "on_device") return "on_device";
  if (s === InferenceSource.IN_CLOUD || s === "in_cloud") return "in_cloud";
  // Should not happen on SDK v12.5+, but never guess silently in the UI:
  return "unknown";
}

async function runHybrid(prompt, onProgress) {
  const model = await getHybridModel();
  if (!model) return null;
  await ensureDeviceModel(model, onProgress);
  const result = await model.generateContent(prompt);
  return { text: result.response.text().trim(), source: sourceOf(result) };
}

async function runCloud(prompt) {
  const model = await getCloudModel();
  if (!model) return null;
  const result = await model.generateContent(prompt);
  return { text: result.response.text().trim(), source: sourceOf(result) };
}

// ── Public AI actions ───────────────────────────────────────────────────────
// Each returns { text, source } where source is:
//   'on_device' | 'in_cloud'  — reported by the SDK (live Firebase mode)
//   'demo'                    — local extractive preview (no Firebase config)

export async function summarizeNote(note, onProgress) {
  const text = (note.body || "").slice(0, ON_DEVICE_INPUT_CAP);
  if (isFirebaseConfigured()) {
    const out = await runHybrid(
      "Summarize the following field note in 2–3 concise sentences. " +
        "Keep names, numbers, dates and locations exact. Do not add information.\n\n" +
        text,
      onProgress
    );
    if (out) return out;
  }
  return { text: localSummary(note.body, 3), source: "demo" };
}

export async function extractActions(note, onProgress) {
  const text = (note.body || "").slice(0, ON_DEVICE_INPUT_CAP);
  if (isFirebaseConfigured()) {
    const out = await runHybrid(
      "Extract the action items from the following field note as a short bullet list. " +
        "Start each bullet with '- ' followed by a verb. Only include things someone must do. " +
        "If there are no action items, reply exactly: No action items found.\n\n" +
        text,
      onProgress
    );
    if (out) return out;
  }
  return { text: localActions(note.body), source: "demo" };
}

export async function deepSummarize(note) {
  const text = (note.body || "").slice(0, CLOUD_INPUT_CAP);
  if (isFirebaseConfigured()) {
    const out = await runCloud(
      "You are given a long field document. Produce a structured deep summary with these sections:\n" +
        "Overview — 3–4 sentences.\n" +
        "Key facts and figures — bullet list.\n" +
        "Risks and issues — bullet list.\n" +
        "Next steps — bullet list.\n" +
        "Keep names, numbers and locations exact. Do not add information.\n\n" +
        text
    );
    if (out) return out;
  }
  return { text: localSummary(note.body, 6), source: "demo" };
}

// ── Demo-mode local fallbacks ───────────────────────────────────────────────
// Small extractive helpers so the app is fully demonstrable before a
// Firebase project is connected. Results are always badged "Local preview".

function splitSentences(text) {
  return (text || "")
    .replace(/\s+/g, " ")
    .match(/[^.!?]+[.!?]+/g)
    ?.map((s) => s.trim())
    .filter((s) => s.length > 25) ?? [];
}

function localSummary(text, maxSentences) {
  const sentences = splitSentences(text);
  if (!sentences.length) return "Not enough text in this note to summarise yet.";
  // Score sentences by word frequency — a tiny extractive summariser.
  const freq = new Map();
  for (const s of sentences) {
    for (const w of s.toLowerCase().match(/[a-z]{4,}/g) ?? []) {
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  const scored = sentences.map((s, i) => {
    let score = 0;
    for (const w of s.toLowerCase().match(/[a-z]{4,}/g) ?? []) score += freq.get(w) ?? 0;
    if (/\d/.test(s)) score *= 1.5; // facts and figures matter in field notes
    return { s, i, score: score / Math.max(1, s.length / 40) };
  });
  const picked = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
  return picked.join(" ");
}

const ACTION_HINTS =
  /\b(need to|needs to|must|should|order|schedule|call|fix|repair|replace|check|inspect|send|follow up|buy|book|pay|submit|contact|tell|ask|deliver|install|measure|clear|rebuild|desilt)\b/i;

function localActions(text) {
  const lines = (text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8 && ACTION_HINTS.test(s));
  if (!lines.length) return "No action items found.";
  return lines.map((s) => "- " + s.replace(/^[-•]\s*/, "")).join("\n");
}
