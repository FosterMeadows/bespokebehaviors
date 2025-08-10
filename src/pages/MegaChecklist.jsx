import React, { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../AuthContext.jsx";
import { db } from "../firebaseConfig";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

/** Pastel palette + hook to mirror your app aesthetic */
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

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function MegaChecklist() {
  const { user } = useContext(AuthContext);
  const pastel = useRandomPastel();

  const [text, setText] = useState("");
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all"); // all | active | done
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
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

  // Live subscription
  useEffect(() => {
    if (!user?.uid) return;
    const ref = collection(db, "teachers", user.uid, "checklist");
    // We order by createdAt desc to show newest first. We’ll further sort in-memory to keep done items grouped if needed.
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
        setItems(data);
      },
      (err) => {
        console.error("checklist snapshot error:", err);
        setError("Failed to load checklist.");
      }
    );
    return () => unsub();
  }, [user?.uid]);

  async function addItem() {
    setError("");
    const t = text.trim();
    if (!user?.uid) { setError("Not signed in."); return; }
    if (!t) return;
    try {
      setSaving(true);
      await addDoc(collection(db, "teachers", user.uid, "checklist"), {
        text: t,
        done: false,
        createdAt: serverTimestamp(),
      });
      setText("");
    } catch (e) {
      console.error("addDoc failed:", e);
      setError("Could not add item.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone(item) {
    if (!user?.uid) return;
    try {
      await updateDoc(doc(db, "teachers", user.uid, "checklist", item.id), {
        done: !item.done,
      });
    } catch (e) {
      console.error("toggle failed:", e);
    }
  }

  async function removeItem(id) {
    if (!user?.uid) return;
    const ok = window.confirm("Delete this item?");
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "teachers", user.uid, "checklist", id));
    } catch (e) {
      console.error("delete failed:", e);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditingText(item.text);
  }

  async function saveEdit(item) {
    const newText = editingText.trim();
    if (!newText || newText === item.text) {
      setEditingId(null);
      return;
    }
    try {
      await updateDoc(doc(db, "teachers", user.uid, "checklist", item.id), {
        text: newText,
      });
    } catch (e) {
      console.error("edit failed:", e);
    } finally {
      setEditingId(null);
    }
  }

  async function clearCompleted() {
    if (!user?.uid) return;
    const doneItems = items.filter((i) => i.done);
    if (doneItems.length === 0) return;
    const ok = window.confirm(`Clear ${doneItems.length} completed item(s)?`);
    if (!ok) return;
    try {
      // Firestore has no batch import here; we can import/write batch if needed
      // but to keep dependency surface small, do simple deletes sequentially.
      for (const it of doneItems) {
        await deleteDoc(doc(db, "teachers", user.uid, "checklist", it.id));
      }
    } catch (e) {
      console.error("clearCompleted failed:", e);
    }
  }

  function handleComposerKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addItem();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "enter") {
      e.preventDefault();
      addItem();
    }
  }

  // Derived list: filter + search, then sort with active first if filter=all
  const visible = useMemo(() => {
    let list = items;
    if (filter === "active") list = list.filter((i) => !i.done);
    else if (filter === "done") list = list.filter((i) => i.done);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) => i.text.toLowerCase().includes(q));
    }
    // Keep newest first, but in "all" push done items below active for readability
    if (filter === "all") {
      list = [...list].sort((a, b) => {
        if (a.done && !b.done) return 1;
        if (!a.done && b.done) return -1;
        const at = a.createdAt?.toMillis?.() ?? 0;
        const bt = b.createdAt?.toMillis?.() ?? 0;
        return bt - at;
      });
    }
    return list;
  }, [items, filter, search]);

  const remaining = items.filter((i) => !i.done).length;

  return (
    <div style={gradientStyle}>
      <div className="max-w-4xl mx-auto p-6 space-y-6 bg-gray-50 rounded-xl shadow-lg border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-gray-200">
          <h1 className="text-2xl font-bold" style={{ color: pastel.text }}>
            Mega Checklist
          </h1>
          <div className="text-sm text-gray-600">
            {remaining} item{remaining === 1 ? "" : "s"} left
          </div>
        </div>

        {/* Composer */}
        <section
          className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm"
          style={{ borderLeft: `6px solid ${pastel.bg}` }}
        >
          <label
            htmlFor="newItem"
            className="block text-lg font-medium mb-2"
            style={{ color: pastel.text }}
          >
            New Item
          </label>
          <div className="flex items-start gap-3">
            <textarea
              id="newItem"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Type a task and press Enter…"
              className="flex-1 border rounded-lg p-3 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-gray-300 min-h-[48px] resize-y"
            />
            <button
              type="button"
              onClick={addItem}
              disabled={saving || !text.trim()}
              className={cn(
                "px-5 py-2 rounded-lg font-semibold shadow transition",
                saving || !text.trim()
                  ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                  : "bg-gray-700 hover:bg-gray-900 text-white"
              )}
            >
              {saving ? "Saving…" : "Add"}
            </button>
          </div>
          {error && <p className="mt-2 text-red-600 font-semibold">{error}</p>}
        </section>

        {/* Controls */}
        <section className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              className={cn(
                "px-3 py-1.5 text-sm",
                filter === "all" ? "bg-gray-800 text-white" : "bg-white hover:bg-gray-100"
              )}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              className={cn(
                "px-3 py-1.5 text-sm border-l border-gray-200",
                filter === "active" ? "bg-gray-800 text-white" : "bg-white hover:bg-gray-100"
              )}
              onClick={() => setFilter("active")}
            >
              Active
            </button>
            <button
              className={cn(
                "px-3 py-1.5 text-sm border-l border-gray-200",
                filter === "done" ? "bg-gray-800 text-white" : "bg-white hover:bg-gray-100"
              )}
              onClick={() => setFilter("done")}
            >
              Completed
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border rounded-lg p-2 bg-white text-gray-900 focus:ring-2 focus:ring-gray-300 w-full md:w-64"
            />
            <button
              type="button"
              onClick={clearCompleted}
              className="px-3 py-2 text-sm rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
            >
              Clear Completed
            </button>
          </div>
        </section>

        {/* List */}
        <section className="bg-white rounded-lg border border-gray-200 shadow-sm">
          {visible.length === 0 ? (
            <div className="p-8 text-center text-gray-500 italic">No items to show.</div>
          ) : (
            <ul className="max-h-[60vh] overflow-auto divide-y divide-gray-100">
              {visible.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <li key={item.id} className="p-3 hover:bg-gray-50 transition">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1.5 h-4 w-4 accent-gray-700"
                        checked={!!item.done}
                        onChange={() => toggleDone(item)}
                        disabled={item._pending}
                        title={item._pending ? "Saving…" : "Toggle complete"}
                      />
                      <div className="flex-1">
                        {!isEditing ? (
                          <p
                            className={cn(
                              "text-gray-900 whitespace-pre-wrap",
                              item.done && "line-through text-gray-500"
                            )}
                          >
                            {item.text}
                          </p>
                        ) : (
                          <textarea
                            className="w-full border rounded-lg p-2 bg-white text-gray-900 focus:ring-2 focus:ring-gray-300"
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                saveEdit(item);
                              }
                              if (e.key === "Escape") {
                                setEditingId(null);
                              }
                            }}
                            autoFocus
                          />
                        )}
                        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                          {item._pending && (
                            <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-800">
                              Syncing…
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!isEditing ? (
                          <button
                            type="button"
                            className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-100"
                            onClick={() => startEdit(item)}
                            disabled={item._pending}
                            title="Edit"
                          >
                            Edit
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="px-2 py-1 text-xs rounded border border-gray-200 bg-gray-800 text-white hover:bg-gray-900"
                            onClick={() => saveEdit(item)}
                            title="Save"
                          >
                            Save
                          </button>
                        )}
                        <button
                          type="button"
                          className="px-2 py-1 text-xs rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                          onClick={() => removeItem(item.id)}
                          disabled={item._pending}
                          title="Delete"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
