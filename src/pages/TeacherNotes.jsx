import React, { useEffect, useMemo, useState, useContext } from "react";
import { db } from "../firebaseConfig";
import { AuthContext } from "../AuthContext.jsx";
import {
  collection,
  addDoc,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot,
  deleteDoc,
  doc,
} from "firebase/firestore";

/** Pastel palette + hook */
const PASTEL_COLORS = [
  { bg: "hsl(200, 60%, 90%)", text: "hsl(200, 50%, 40%)" },
  { bg: "hsl(160, 60%, 90%)", text: "hsl(160, 50%, 32%)" },
  { bg: "hsl(40, 80%, 92%)",  text: "hsl(40, 50%, 38%)" },
  { bg: "hsl(280, 60%, 93%)", text: "hsl(280, 50%, 40%)" },
  { bg: "hsl(340, 60%, 94%)", text: "hsl(340, 50%, 42%)" },
];

function useRandomPastel() {
  const [color, setColor] = useState(PASTEL_COLORS[0]);
  useEffect(() => {
    setColor(PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)]);
  }, []);
  return color;
}

function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TeacherNotes() {
  const { user } = useContext(AuthContext);
  const pastel = useRandomPastel();

  const [noteText, setNoteText] = useState("");
  const [notes, setNotes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  const gradientStyle = useMemo(
    () => ({
      minHeight: "100vh",
      width: "100%",
      background: `radial-gradient(circle at 50% 50%, ${pastel.bg} 0%, ${pastel.bg} 30%, #fff 70%, #fff 100%)`,
      transition: "background 0.8s",
      padding: "2.5rem 0",
    }),
    [pastel]
  );

  // Live load with pending writes surfaced
  useEffect(() => {
    if (!user?.uid) return;
    const ref = collection(db, "teachers", user.uid, "notes");
    const qy = query(ref, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qy,
      { includeMetadataChanges: true },
      (snap) => {
        const data = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          _pending: d.metadata.hasPendingWrites,
        }));
        // Sort: pending first, then by createdAt desc (fallback 0)
        data.sort((a, b) => {
          if (a._pending && !b._pending) return -1;
          if (!a._pending && b._pending) return 1;
          const at = a.createdAt?.toMillis?.() ?? 0;
          const bt = b.createdAt?.toMillis?.() ?? 0;
          return bt - at;
        });
        setNotes(data);
      },
      (err) => {
        console.error("Notes snapshot error:", err);
        setError("Failed to load notes.");
      }
    );
    return () => unsub();
  }, [user?.uid]);

  async function createNote() {
    setError("");
    const text = noteText.trim();
    if (!user?.uid) { setError("Not signed in."); return; }
    if (!text) return;

    setSaving(true);
    try {
      await addDoc(collection(db, "teachers", user.uid, "notes"), {
        text,
        createdAt: serverTimestamp(),
      });
      setNoteText("");
    } catch (e) {
      console.error("addDoc failed:", e?.code, e?.message, e);
      setError(e?.message || "Failed to save note. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote(id) {
    if (!user?.uid) { setError("Not signed in."); return; }
    const ok = window.confirm("Delete this note? This cannot be undone.");
    if (!ok) return;
    setDeletingId(id);
    setError("");
    try {
      await deleteDoc(doc(db, "teachers", user.uid, "notes", id));
      // onSnapshot will remove it from UI automatically
    } catch (e) {
      console.error("deleteDoc failed:", e?.code, e?.message, e);
      setError(e?.message || "Failed to delete note. Try again.");
    } finally {
      setDeletingId(null);
    }
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "enter") {
      createNote();
    }
  }

  return (
    <div style={gradientStyle}>
      <div className="max-w-3xl mx-auto p-6 space-y-6 bg-gray-50 rounded-xl shadow-lg border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-gray-200">
          <h1 className="text-2xl font-bold" style={{ color: pastel.text }}>
            Teacher Notes
          </h1>
        </div>

        {/* Composer */}
        <section
          className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm"
          style={{ borderLeft: `6px solid ${pastel.bg}` }}
        >
          <label
            htmlFor="noteText"
            className="block text-lg font-medium mb-2"
            style={{ color: pastel.text }}
          >
            New Note
          </label>
          <textarea
            id="noteText"
            className="w-full border rounded-lg p-3 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-gray-300 resize-y min-h-[120px]"
            placeholder="Type your note here..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Press <span className="font-mono">Ctrl/⌘ + Enter</span> to save.
            </p>
            <button
              type="button"
              onClick={createNote}
              disabled={saving || !noteText.trim()}
              className={`px-5 py-2 rounded-lg font-semibold shadow transition ${
                saving || !noteText.trim()
                  ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                  : "bg-gray-700 hover:bg-gray-900 text-white"
              }`}
            >
              {saving ? "Saving..." : "Create Note"}
            </button>
          </div>
          {error && <p className="mt-2 text-red-600 font-semibold">{error}</p>}
        </section>

        {/* Notes list */}
        <section className="space-y-3">
          {notes.length === 0 ? (
            <div className="text-gray-500 italic text-center py-8">
              No notes yet.
            </div>
          ) : (
            notes.map((n) => (
              <article
                key={n.id}
                className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm"
              >
                <header className="flex items-center justify-between mb-2">
                  <h3
                    className="text-sm font-semibold"
                    style={{ color: pastel.text }}
                  >
                    Note
                  </h3>
                  <div className="flex items-center gap-2">
                    {n._pending && (
                      <span
                        className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-yellow-100 text-yellow-800"
                        title="Saving…"
                      >
                        Saving…
                      </span>
                    )}
                    <time
                      className="text-xs font-mono px-2 py-0.5 rounded"
                      style={{
                        background: pastel.bg,
                        color: pastel.text,
                        opacity: 0.9,
                      }}
                    >
                      {formatDate(n.createdAt)}
                    </time>
                    <button
                      type="button"
                      onClick={() => deleteNote(n.id)}
                      disabled={deletingId === n.id || n._pending}
                      aria-label="Delete note"
                      title="Delete note"
                      className={`ml-1 inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition border ${
                        deletingId === n.id || n._pending
                          ? "bg-gray-200 text-gray-500 border-gray-300 cursor-not-allowed"
                          : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                      }`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="inline-block"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                      </svg>
                      {deletingId === n.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </header>
                <p className="whitespace-pre-wrap text-gray-900">{n.text}</p>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
