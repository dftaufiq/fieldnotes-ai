// ─────────────────────────────────────────────────────────────────────────────
// FieldNotes AI — local-first notes store.
//
// Notes ALWAYS live in localStorage first: the app boots, reads and writes
// with zero network. When a real Firebase config is present, the store also
// syncs to Firestore (users/{uid}/notes) in the background. Conflicts are
// resolved by `updatedAt` — the newest version of a note wins.
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import { getFirebase, currentUid } from "./firebase.js";

const STORAGE_KEY = "fieldnotes.notes.v1";
const SEEDED_KEY = "fieldnotes.seeded.v1";

let notes = [];
const listeners = new Set();

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch (e) {
    console.warn("[FieldNotes] Could not persist notes locally:", e);
  }
}

function emit() {
  persist();
  for (const fn of listeners) fn(getNotes());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getNotes() {
  // Newest first.
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getNote(id) {
  return notes.find((n) => n.id === id) ?? null;
}

export function createNote({ title = "", body = "" } = {}) {
  const now = Date.now();
  const note = { id: uid(), title, body, createdAt: now, updatedAt: now, ai: {} };
  notes.push(note);
  emit();
  syncUp(note);
  return note;
}

export function updateNote(id, patch) {
  const note = getNote(id);
  if (!note) return null;
  Object.assign(note, patch, { updatedAt: Date.now() });
  emit();
  syncUp(note);
  return note;
}

/** Store an AI result on a note: kind = 'summary' | 'actions' | 'deep'. */
export function setAiResult(id, kind, result) {
  const note = getNote(id);
  if (!note) return;
  note.ai = { ...(note.ai ?? {}), [kind]: { ...result, at: Date.now() } };
  note.updatedAt = Date.now();
  emit();
  syncUp(note);
}

export function deleteNote(id) {
  notes = notes.filter((n) => n.id !== id);
  emit();
  syncDelete(id);
}

// ── Sample content (first run only) ─────────────────────────────────────────
// Two samples chosen to demonstrate BOTH hybrid paths: one short note
// (summarised on-device) and one long document (deep summary in the cloud).
function seedSamples() {
  const short = createNote({
    title: "Pump station 4 — morning check",
    body: [
      "Pressure on line B dropped to 2.1 bar overnight, normally 3.4. Valve V-7 is",
      "weeping slightly at the stem. Motor 2 sounds rough at start-up, bearing",
      "probably on its way out. Topped up lubricant reservoir to 80%. Need to",
      "order a replacement bearing (SKF 6205) and schedule the valve repack",
      "before Friday. Tell Pak Rahman the north tank reading was 61%, not 16% —",
      "the gauge is misreading again.",
    ].join(" "),
  });
  const long = createNote({
    title: "Irrigation cooperative — end-of-season inspection report",
    body: [
      "End-of-season inspection of the Sumber Makmur irrigation cooperative network, covering the main canal,",
      "three secondary channels (S1, S2, S3) and 14 tertiary outlets serving approximately 212 hectares of rice",
      "and secondary crops. The inspection was carried out over four days with the cooperative's water masters",
      "(juru air) and two representatives of the farmers' association.",
      "",
      "MAIN CANAL. The main canal (6.8 km) is in fair condition. Sediment depth averages 18 cm and reaches",
      "40 cm at the bend near the Karanganyar bridge, reducing effective capacity by an estimated 15 percent.",
      "Desilting was last performed two seasons ago. The intake gate at the weir operates but the spindle is",
      "corroded; full closure now requires two operators. The trash rack is intact but undersized for the",
      "debris load during the first rains.",
      "",
      "SECONDARY CHANNELS. S1 is in good condition following last year's lining works; measured conveyance",
      "losses are under 5 percent. S2 has two problem reaches: a 60-metre section where the embankment has",
      "slumped after heavy rain in November, and a leaking division box at station 2+400 that loses an",
      "estimated 20 litres per second. S3 is heavily overgrown for its last 900 metres and effectively",
      "delivers only to the first five outlets.",
      "",
      "TERTIARY OUTLETS. Of the 14 outlets, 9 are fully functional, 3 have damaged measuring flumes, and 2",
      "(T-11 and T-13) are blocked by collapsed masonry. Farmers downstream of T-11 report receiving water",
      "only every third rotation, which matches the delivery records.",
      "",
      "WATER DELIVERY AND EQUITY. Total measured delivery at the head was 412 litres per second against a",
      "design duty of 480. Tail-end farmers received on average 58 percent of their scheduled share, while",
      "head-end farmers received 104 percent. The rotation schedule is being followed on paper but night-time",
      "gate adjustments by individual farmers are undermining it.",
      "",
      "RECOMMENDATIONS. (1) Desilt the main canal bend before the next planting season; estimated 3 days",
      "with an excavator. (2) Repair the S2 division box at 2+400 — highest priority, as the leak wastes",
      "roughly 1,700 cubic metres per day. (3) Clear and regrade the last 900 metres of S3. (4) Rebuild",
      "outlets T-11 and T-13 in masonry with steel gates. (5) Fit a lockable cover to the intake gate and",
      "agree a written night-rotation protocol with the farmers' association. (6) Replace the two damaged",
      "measuring flumes so deliveries can be verified at outlet level. Indicative budget for items 1–4 is",
      "IDR 148 million; items 5–6 can be covered from the cooperative's maintenance fund.",
    ].join("\n"),
  });
  return [short, long];
}

export function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) notes = JSON.parse(raw);
  } catch (e) {
    console.warn("[FieldNotes] Local notes unreadable, starting fresh:", e);
    notes = [];
  }
  if (!localStorage.getItem(SEEDED_KEY)) {
    seedSamples();
    localStorage.setItem(SEEDED_KEY, "1");
  }
  return getNotes();
}

// ── Firestore sync (active only with a real Firebase config) ───────────────
let sync = null; // { db, uid }
let applyingRemote = false;

async function syncUp(note) {
  if (!sync || applyingRemote) return;
  try {
    await setDoc(doc(sync.db, "users", sync.uid, "notes", note.id), note);
  } catch (e) {
    console.warn("[FieldNotes] Firestore push failed (will retry later):", e);
  }
}

async function syncDelete(id) {
  if (!sync) return;
  try {
    await deleteDoc(doc(sync.db, "users", sync.uid, "notes", id));
  } catch (e) {
    console.warn("[FieldNotes] Firestore delete failed:", e);
  }
}

/**
 * Start background sync once Firebase is ready. Local data is pushed up,
 * then a live listener merges remote changes (newest updatedAt wins).
 */
export async function startSync() {
  const fb = await getFirebase();
  const userId = currentUid(fb);
  if (!fb?.db || !userId) return false;
  sync = { db: fb.db, uid: userId };

  // Push everything local up first (covers notes written while offline).
  for (const n of notes) syncUp(n);

  const col = collection(fb.db, "users", userId, "notes");
  onSnapshot(
    col,
    (snap) => {
      let changed = false;
      applyingRemote = true;
      try {
        const remoteIds = new Set();
        snap.forEach((d) => {
          const remote = d.data();
          remoteIds.add(remote.id);
          const local = getNote(remote.id);
          if (!local) {
            notes.push(remote);
            changed = true;
          } else if (remote.updatedAt > local.updatedAt) {
            Object.assign(local, remote);
            changed = true;
          }
        });
        // Notes deleted on another device disappear here too — but only
        // trust deletions after the first full snapshot has been applied,
        // which is exactly this handler's steady state.
        const before = notes.length;
        notes = notes.filter(
          (n) => remoteIds.has(n.id) || n.updatedAt > Date.now() - 5000
        );
        if (notes.length !== before) changed = true;
      } finally {
        applyingRemote = false;
      }
      if (changed) emit();
    },
    (err) => console.warn("[FieldNotes] Firestore listener error:", err)
  );
  return true;
}
