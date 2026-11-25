// ─────────────────────────────────────────────────────────────────────────────
// FieldNotes AI — UI wiring.
// Notes are local-first (store.js). AI actions go through ai.js, which uses
// Firebase AI Logic hybrid inference when a real config is present and a
// clearly-labelled local preview in demo mode.
// ─────────────────────────────────────────────────────────────────────────────

import "./styles.css";
import {
  loadNotes,
  getNotes,
  getNote,
  createNote,
  updateNote,
  deleteNote,
  setAiResult,
  subscribe,
  startSync,
} from "./store.js";
import {
  summarizeNote,
  extractActions,
  deepSummarize,
  checkOnDeviceAvailability,
  LONG_NOTE_CHARS,
} from "./ai.js";
import { isFirebaseConfigured } from "./firebase-config.js";

const $ = (sel) => document.querySelector(sel);

const els = {
  modeBadge: $("#mode-badge"),
  deviceStatus: $("#device-status"),
  list: $("#notes-list"),
  listEmpty: $("#notes-empty"),
  search: $("#search"),
  newBtn: $("#new-note"),
  editorEmpty: $("#editor-empty"),
  editor: $("#editor"),
  title: $("#note-title"),
  body: $("#note-body"),
  meta: $("#note-meta"),
  routeHint: $("#route-hint"),
  status: $("#ai-status"),
  results: $("#ai-results"),
  btnSummary: $("#btn-summary"),
  btnActions: $("#btn-actions"),
  btnDeep: $("#btn-deep"),
  btnDelete: $("#btn-delete"),
};

let selectedId = null;
let busy = false;

// ── Header status ───────────────────────────────────────────────────────────
function renderModeBadge() {
  if (isFirebaseConfigured()) {
    els.modeBadge.textContent = "Live · Firebase connected";
    els.modeBadge.className = "pill pill-live";
  } else {
    els.modeBadge.textContent = "Demo mode · add Firebase config";
    els.modeBadge.className = "pill pill-demo";
  }
}

async function renderDeviceStatus() {
  const { state, label } = await checkOnDeviceAvailability();
  els.deviceStatus.textContent =
    state === "available" || state === "downloadable" || state === "downloading"
      ? "▣ " + label
      : "☁ " + label;
  els.deviceStatus.className =
    "pill " + (state === "available" ? "pill-device-ok" : "pill-device-no");
}

// ── Notes list ──────────────────────────────────────────────────────────────
function fmtDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderList() {
  const q = els.search.value.trim().toLowerCase();
  const all = getNotes().filter(
    (n) =>
      !q ||
      n.title.toLowerCase().includes(q) ||
      n.body.toLowerCase().includes(q)
  );
  els.list.replaceChildren();
  els.listEmpty.hidden = all.length > 0;

  for (const note of all) {
    const btn = document.createElement("button");
    btn.className = "note-item" + (note.id === selectedId ? " active" : "");
    btn.addEventListener("click", () => selectNote(note.id));

    const title = document.createElement("div");
    title.className = "n-title";
    title.textContent = note.title || "Untitled note";

    const excerpt = document.createElement("div");
    excerpt.className = "n-excerpt";
    excerpt.textContent = note.body || "…";

    const meta = document.createElement("div");
    meta.className = "n-meta";
    const when = document.createElement("span");
    when.textContent = fmtDate(note.updatedAt);
    meta.appendChild(when);
    const chars = document.createElement("span");
    chars.textContent = `${note.body.length} chars`;
    meta.appendChild(chars);
    if (note.body.length >= LONG_NOTE_CHARS) {
      const chip = document.createElement("span");
      chip.className = "chip chip-long";
      chip.textContent = "long · cloud deep summary";
      meta.appendChild(chip);
    }

    btn.append(title, excerpt, meta);
    els.list.appendChild(btn);
  }
}

// ── Editor ──────────────────────────────────────────────────────────────────
function selectNote(id) {
  selectedId = id;
  const note = getNote(id);
  els.editorEmpty.hidden = !!note;
  els.editor.hidden = !note;
  if (!note) {
    renderList();
    return;
  }
  els.title.value = note.title;
  els.body.value = note.body;
  renderEditorMeta(note);
  renderResults(note);
  renderList();
}

function renderEditorMeta(note) {
  els.meta.textContent = `Last edited ${fmtDate(note.updatedAt)} · ${note.body.length} characters`;
  els.routeHint.textContent =
    note.body.length >= LONG_NOTE_CHARS
      ? "Long document — Deep summary routes straight to cloud Gemini."
      : "Short note — Summarize & actions prefer on-device Gemini Nano, with cloud fallback.";
}

const AI_KINDS = [
  { kind: "summary", label: "Summary" },
  { kind: "actions", label: "Action items" },
  { kind: "deep", label: "Deep summary" },
];

function badgeFor(source) {
  switch (source) {
    case "on_device":
      return { cls: "badge badge-device", text: "▣ On-device · Gemini Nano" };
    case "in_cloud":
      return { cls: "badge badge-cloud", text: "☁ Cloud · Gemini" };
    case "demo":
      return { cls: "badge badge-demo", text: "Local preview · demo mode" };
    default:
      return { cls: "badge badge-unknown", text: "Route not reported" };
  }
}

function renderResults(note) {
  els.results.replaceChildren();
  for (const { kind, label } of AI_KINDS) {
    const r = note.ai?.[kind];
    if (!r) continue;
    const card = document.createElement("div");
    card.className = "ai-card";

    const head = document.createElement("div");
    head.className = "ai-card-head";
    const h = document.createElement("h4");
    h.textContent = label;
    const badge = document.createElement("span");
    const b = badgeFor(r.source);
    badge.className = b.cls;
    badge.textContent = b.text;
    const when = document.createElement("span");
    when.className = "ai-when";
    when.textContent = fmtDate(r.at);
    head.append(h, badge, when);

    const text = document.createElement("div");
    text.className = "ai-text";
    text.textContent = r.text;

    card.append(head, text);
    els.results.appendChild(card);
  }
}

// ── Editing (debounced local save; sync happens inside the store) ──────────
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!selectedId) return;
    updateNote(selectedId, { title: els.title.value, body: els.body.value });
  }, 350);
}
els.title.addEventListener("input", scheduleSave);
els.body.addEventListener("input", () => {
  scheduleSave();
  const note = getNote(selectedId);
  if (note) renderEditorMeta({ ...note, body: els.body.value });
});
els.search.addEventListener("input", renderList);

els.newBtn.addEventListener("click", () => {
  const note = createNote({ title: "", body: "" });
  selectNote(note.id);
  els.title.focus();
});

els.btnDelete.addEventListener("click", () => {
  if (!selectedId) return;
  deleteNote(selectedId);
  const next = getNotes()[0];
  selectNote(next ? next.id : null);
});

// ── AI actions ──────────────────────────────────────────────────────────────
function setBusy(on) {
  busy = on;
  for (const b of [els.btnSummary, els.btnActions, els.btnDeep]) b.disabled = on;
}

function showStatus(msg) {
  els.status.hidden = !msg;
  els.status.textContent = msg ?? "";
}

async function runAi(kind, fn) {
  if (!selectedId || busy) return;
  // Save the latest text first so the model sees exactly what's on screen.
  clearTimeout(saveTimer);
  updateNote(selectedId, { title: els.title.value, body: els.body.value });
  const note = getNote(selectedId);
  if (!note || note.body.trim().length < 10) {
    showStatus("Write a little more in the note first — the AI needs something to work with.");
    return;
  }
  setBusy(true);
  showStatus(
    kind === "deep"
      ? "Sending the long document to cloud Gemini for a deep summary…"
      : "Thinking… (on-device first, cloud fallback)"
  );
  try {
    const result = await fn(note, (progress) => {
      showStatus(`Downloading the on-device Gemini Nano model… ${Math.round(progress * 100)}%`);
    });
    setAiResult(selectedId, kind, result);
    showStatus("");
    renderDeviceStatus(); // availability may have changed after a download
  } catch (e) {
    console.error("[FieldNotes] AI call failed:", e);
    showStatus(
      "The AI call failed (" +
        (e?.message ?? e) +
        "). If you just connected Firebase, check the App Check debug token and AI Logic setup in CONFIG.md."
    );
  } finally {
    setBusy(false);
  }
}

els.btnSummary.addEventListener("click", () => runAi("summary", summarizeNote));
els.btnActions.addEventListener("click", () => runAi("actions", extractActions));
els.btnDeep.addEventListener("click", () => runAi("deep", (n) => deepSummarize(n)));

// ── Boot ────────────────────────────────────────────────────────────────────
loadNotes();
subscribe(() => {
  renderList();
  const note = selectedId ? getNote(selectedId) : null;
  if (note) {
    renderEditorMeta(note);
    renderResults(note);
  }
});
renderModeBadge();
renderDeviceStatus();
const first = getNotes()[0];
if (first) selectNote(first.id);
startSync(); // no-op in demo mode

// Offline shell (production builds only — avoids dev-server caching pain).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // BASE_URL keeps this correct both at a domain root ("/sw.js") and under a
  // subpath such as GitHub Pages ("/fieldnotes-ai/sw.js").
  navigator.serviceWorker
    .register(import.meta.env.BASE_URL + "sw.js")
    .catch(() => {});
}
