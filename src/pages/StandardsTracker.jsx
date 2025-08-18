import React, { useState, useEffect, useContext, useMemo, useRef } from "react";
import { AuthContext } from "../AuthContext.jsx";
import { db } from "../firebaseConfig";
import { doc, getDoc, updateDoc, collection, getDocs, setDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import ela8 from "../data/standards/ela8.json";

// Softer, less saturated colors
const STATUS_COLORS = {
  red:    "hsl(0, 55%, 95%)",
  yellow: "hsl(42, 55%, 94%)",
  green:  "hsl(136, 40%, 94%)",
};
const STATUS_BORDERS = {
  red:    "hsl(0, 45%, 70%)",
  yellow: "hsl(42, 45%, 62%)",
  green:  "hsl(136, 28%, 54%)",
};

const STANDARDS_PACKAGES = [
  { id: "ela8", label: "ELA Grade 8", data: ela8 },
  // { id: "ccss-math-8", label: "CCSS Math 8th Grade" },
  // { id: "ngss-8", label: "NGSS 8th Grade Science" },
];

// --- date helpers ---
function parseMaybeDate(raw) {
  if (raw?.toDate) return raw.toDate(); // Firestore Timestamp
  if (typeof raw === "string" && /^\d{2}\.\d{2}\.\d{4}$/.test(raw)) {
    const [m, d, y] = raw.split(".").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date() : d;
}
function fmtParam(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = d.getFullYear();
  return `${mm}.${dd}.${yy}`;
}
function fmtDisplay(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = d.getFullYear();
  return `${mm}/${dd}/${yy}`;
}

export default function StandardsTracker() {
  const { user, profile, setProfile } = useContext(AuthContext);

  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Coverage = { code: [ { display, param, id, ts } ] }
  const [coverage, setCoverage] = useState({});
  // Reflections = { code: [ { date, text } ] }
  const [reflections, setReflections] = useState({});
  // Mastered = { code: true/false }
  const [mastered, setMastered] = useState({});
  // Local state for add field per standard
  const [addState, setAddState] = useState({});
  const [commentaryLoading, setCommentaryLoading] = useState(false);

  // Per-standard saving flags
  const [saving, setSaving] = useState({}); // { [code]: { master?: boolean, reflect?: boolean } }

  // Simple filter
  const [query, setQuery] = useState("");

  const navigate = useNavigate();

  // 1. Load saved standards package
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const ref = doc(db, "teachers", user.uid);
        const snap = await getDoc(ref);
        if (alive && snap.exists()) {
          setSelected(snap.data().standardsPackage || "");
        }
      } catch {
        if (alive) setError("Could not load saved package.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [user]);

  // 2. Autosave on selection
  useEffect(() => {
    if (!user || !selected) return;
    const ref = doc(db, "teachers", user.uid);
    updateDoc(ref, { standardsPackage: selected })
      .then(() => setProfile?.(prev => ({ ...(prev || {}), standardsPackage: selected })))
      .catch(() => setError("Failed to save selection."));
  }, [user, selected, setProfile]);

  // 3. Fetch all coverage (for current user)
  useEffect(() => {
    if (!user || !selected) return;
    (async () => {
      try {
        const plansRef = collection(db, "teachers", user.uid, "dailyPlans");
        const snap = await getDocs(plansRef);
        const cov = {};
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          let standardsListInPlan = [];
          if (Array.isArray(data.standards)) {
            standardsListInPlan = data.standards;
          } else if (data.preps) {
            Object.values(data.preps).forEach((prep) => {
              if (Array.isArray(prep.standards)) {
                prep.standards.forEach((code) => {
                  if (!standardsListInPlan.includes(code)) standardsListInPlan.push(code);
                });
              }
            });
          }

          const d = parseMaybeDate(data.date);
          const display = fmtDisplay(d);
          const param = fmtParam(d);
          const ts = d.getTime();

          standardsListInPlan.forEach((code) => {
            if (!cov[code]) cov[code] = [];
            cov[code].push({ display, param, id: docSnap.id, ts });
          });
        });

        Object.values(cov).forEach(arr => arr.sort((a, b) => b.ts - a.ts));
        setCoverage(cov);
      } catch {
        setError("Could not load coverage data.");
      }
    })();
  }, [user, selected]);

  // 4. Fetch reflections & mastered status
  useEffect(() => {
    if (!user || !selected) return;
    let alive = true;
    (async () => {
      setCommentaryLoading(true);
      try {
        const ref = collection(db, "teachers", user.uid, "standardsCommentary");
        const snap = await getDocs(ref);
        if (!alive) return;
        const notes = {};
        const status = {};
        snap.docs.forEach((d) => {
          notes[d.id] = Array.isArray(d.data().reflections) ? d.data().reflections : [];
          status[d.id] = !!d.data().mastered;
        });
        setReflections(notes);
        setMastered(status);
      } catch {
        if (alive) setError("Could not load reflections.");
      } finally {
        if (alive) setCommentaryLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [user, selected]);

  // 5. Helper hooks/derived data MUST be called every render, so they live up here.
  const pkg = useMemo(
    () => STANDARDS_PACKAGES.find((p) => p.id === selected) || null,
    [selected]
  );
  const standardsList = pkg?.data || [];

  const filteredStandards = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return standardsList;
    return standardsList.filter(
      (s) => s.code.toLowerCase().includes(q) || (s.text || "").toLowerCase().includes(q)
    );
  }, [query, standardsList]);

  // 6. Save one reflection line (add or remove)
  const saveReflections = async (code, arr) => {
    setReflections(prev => ({ ...prev, [code]: arr }));
    setSaving(s => ({ ...s, [code]: { ...(s[code] || {}), reflect: true } }));
    try {
      const ref = doc(db, "teachers", user.uid, "standardsCommentary", code);
      await setDoc(ref, { reflections: arr }, { merge: true });
    } catch {
      setError("Could not save note.");
    } finally {
      setSaving(s => ({ ...s, [code]: { ...(s[code] || {}), reflect: false } }));
    }
  };

  // 7. Toggle mastered (green)
  const toggleMastered = async (code) => {
    const newVal = !mastered[code];
    setMastered(prev => ({ ...prev, [code]: newVal }));
    setSaving(s => ({ ...s, [code]: { ...(s[code] || {}), master: true } }));
    try {
      const ref = doc(db, "teachers", user.uid, "standardsCommentary", code);
      await setDoc(ref, { mastered: newVal }, { merge: true });
    } catch {
      setError("Could not save status.");
      setMastered(prev => ({ ...prev, [code]: !newVal })); // rollback
    } finally {
      setSaving(s => ({ ...s, [code]: { ...(s[code] || {}), master: false } }));
    }
  };

  // 8. Status logic
  const getStatus = (code) => {
    if (mastered[code]) return "green";
    if ((coverage[code] || []).length > 0) return "yellow";
    return "red";
  };

  // 9. Only wipe reflections when a standard transitions to red
  const prevStatusRef = useRef({});
  useEffect(() => {
    standardsList.forEach(({ code }) => {
      const status = getStatus(code);
      const prev = prevStatusRef.current[code];
      if (status !== prev) prevStatusRef.current[code] = status;
      if (status === "red" && prev !== "red" && (reflections[code]?.length)) {
        saveReflections(code, []);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverage, mastered, standardsList, reflections]);

  // Early returns now happen AFTER all hooks have been called consistently.

  if (loading) return <div className="p-6 text-center">Loading…</div>;

  if (!selected) {
    return (
      <div className="max-w-md mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Choose Standards Package</h1>
        {error && <p className="text-red-600 mb-2" aria-live="polite">{error}</p>}
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full border rounded p-2"
        >
          <option value="" disabled>-- Select a package --</option>
          {STANDARDS_PACKAGES.map((pkg) => (
            <option key={pkg.id} value={pkg.id}>{pkg.label}</option>
          ))}
        </select>
      </div>
    );
  }

  if (!pkg) {
    return <div className="max-w-md mx-auto p-6 text-red-700">Unknown standards package.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Standards Tracker</h1>
          <span className="text-gray-700">
            Tracking for <span className="font-medium">{pkg.label}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter standards…"
            className="border rounded px-3 py-1 text-sm"
            aria-label="Filter standards"
          />
          <button
            onClick={() => setSelected("")}
            className="text-sm text-blue-600 hover:underline"
            type="button"
          >
            Change Package
          </button>
        </div>
      </div>

      {error && <p className="text-red-600" aria-live="polite">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {filteredStandards.map(({ code, text }) => {
          const status = getStatus(code);
          const hasPlans = (coverage[code] || []).length > 0;
          const isGreen = status === "green";
          const isSavingMaster = !!saving[code]?.master;
          const isSavingReflect = !!saving[code]?.reflect;

          const isAdding = !!addState[code]?.show;
          const availableDates = coverage[code] || [];
          const addDate = addState[code]?.date || availableDates[0]?.display || "";
          const addText = addState[code]?.text || "";
          const existing = reflections[code] || [];

          const isRedEmpty = status === "red" && !hasPlans && (!existing || existing.length === 0);

          return (
            <div
              key={code}
              className="border rounded p-4 bg-white relative flex flex-col transition"
              style={{
                borderLeft: `14px solid ${STATUS_BORDERS[status]}`,
                background: STATUS_COLORS[status],
                boxShadow:
                  status === "green"
                    ? "0 0 0 1.5px hsl(136,34%,57%)"
                    : status === "yellow"
                    ? "0 0 0 1.5px hsl(42,33%,65%)"
                    : "0 0 0 1.5px hsl(0,42%,78%)",
                minHeight: isRedEmpty ? 0 : 260,
                paddingTop: isRedEmpty ? 18 : 24,
                paddingBottom: isRedEmpty ? 14 : 24,
                paddingLeft: 20,
                paddingRight: 20,
                marginBottom: 0,
              }}
            >
              {/* Mastery tag */}
              <button
                onClick={() => toggleMastered(code)}
                disabled={commentaryLoading || isSavingMaster}
                className={`absolute -top-4 -left-4 px-3 py-1 rounded-full shadow font-semibold text-xs transition z-10 bg-white border-2`}
                style={{
                  borderColor: STATUS_BORDERS[status],
                  color: STATUS_BORDERS[status],
                  minWidth: 120,
                  fontWeight: isGreen ? 700 : 500,
                  background: isGreen ? STATUS_COLORS.green : "white",
                  boxShadow: isGreen
                    ? "0 2px 8px 0 rgba(34,197,94,.11)"
                    : "0 1px 4px 0 rgba(16,185,129,.11)",
                  opacity: isSavingMaster ? 0.6 : 1,
                  cursor: isSavingMaster ? "not-allowed" : "pointer",
                }}
                title={isGreen ? "Mark as Unmastered" : "Mark as Mastered"}
                aria-label="Toggle Mastered"
              >
                {isGreen ? "We’re Good" : "Taught To Mastery?"}
              </button>

              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-base">{code}</p>
                  <p className="text-sm text-gray-700 mb-2">{text}</p>
                </div>
              </div>

             {/* Date pills */}
<div className="flex flex-wrap gap-2 my-2">
  {(coverage[code] || [])
    .slice(0, 5)   // 👈 show at most 5 most recent
    .map(({ display, param, id }) => (
      <button
        key={id}
        onClick={() => navigate(`/dailyplan?date=${param}`)}
        className="px-3 py-1 text-white rounded-full text-xs"
        style={{
          backgroundColor:
            status === "green"
              ? "hsl(136, 28%, 54%)"
              : status === "yellow"
              ? "hsl(42, 45%, 62%)"
              : "hsl(0, 45%, 70%)",
          opacity: 0.9,
        }}
        type="button"
      >
        {display}
      </button>
    ))}
  {coverage[code] && coverage[code].length > 5 && (
    <span className="px-2 py-1 text-xs text-gray-600">
      +{coverage[code].length - 5} more
    </span>
  )}
</div>


              {/* Standard Reflections */}
              {status !== "red" && (
                <div className="mt-3 rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 shadow-inner">
                  <div className="flex items-center mb-2">
                    <span className="block text-lg font-bold text-gray-800 tracking-tight">
                      Standard Reflections
                    </span>
                  </div>

                  {existing.length === 0 && !isAdding && (
                    <button
                      type="button"
                      className="flex items-center text-blue-700 font-medium text-sm hover:underline focus:outline-none mb-2"
                      onClick={() =>
                        setAddState(s => ({
                          ...s,
                          [code]: { show: true, date: availableDates[0]?.display || "", text: "" },
                        }))
                      }
                      style={{ paddingLeft: 0 }}
                    >
                      ＋ Add Reflection
                    </button>
                  )}

                  <ul className="mb-2 space-y-2">
                    {existing.map((note, i) => (
                      <li key={`${note.date}-${i}`} className="flex items-start group">
                        <div>
                          <div className="font-bold text-xs text-gray-700 mb-0.5">{note.date}</div>
                          <div className="text-sm text-gray-800">{note.text}</div>
                        </div>
                        <button
                          onClick={async () => {
                            const newArr = [...existing];
                            newArr.splice(i, 1);
                            await saveReflections(code, newArr);
                          }}
                          className="ml-2 text-xs text-red-400 hover:text-red-700 opacity-0 group-hover:opacity-100 transition"
                          title="Remove note"
                          aria-label="Remove note"
                          type="button"
                          disabled={isSavingReflect}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>

                  {isAdding && (
                    <form
                      className="flex flex-col gap-2 mt-1"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const trimmed = addText.trim().replace(/\s+/g, " ");
                        if (!addDate || !trimmed) return;
                        if (
                          existing.some(
                            (r) =>
                              r.date === addDate &&
                              r.text.trim().replace(/\s+/g, " ") === trimmed
                          )
                        ) {
                          setError("Duplicate reflection for this date.");
                          return;
                        }
                        const newNotes = [...existing, { date: addDate, text: trimmed }];
                        setAddState(s => ({ ...s, [code]: { show: false, date: "", text: "" } }));
                        await saveReflections(code, newNotes);
                      }}
                    >
                      {availableDates.length > 1 ? (
                        <select
                          className="border rounded px-2 py-1 text-sm"
                          value={addDate}
                          onChange={(e) =>
                            setAddState(s => ({ ...s, [code]: { ...(s[code] || {}), date: e.target.value } }))
                          }
                          required
                        >
                          {availableDates.map(({ display }) => (
                            <option key={display} value={display}>{display}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={addDate}
                          readOnly
                          className="border rounded px-2 py-1 text-sm bg-gray-100"
                        />
                      )}
                      <textarea
                        className="border rounded px-2 py-1 text-sm"
                        rows={2}
                        value={addText}
                        onChange={(e) =>
                          setAddState(s => ({ ...s, [code]: { ...(s[code] || {}), text: e.target.value } }))
                        }
                        placeholder="Write your reflection here…"
                        required
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="bg-blue-200 text-blue-800 font-semibold px-2 rounded hover:bg-blue-300 disabled:opacity-60"
                          disabled={commentaryLoading || isSavingReflect}
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          className="bg-gray-100 text-gray-700 font-semibold px-2 rounded hover:bg-gray-200"
                          onClick={() =>
                            setAddState(s => ({ ...s, [code]: { show: false, date: "", text: "" } }))
                          }
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {existing.length > 0 && !isAdding && (
                    <button
                      type="button"
                      className="flex items-center text-blue-700 font-medium text-xs hover:underline focus:outline-none mt-2"
                      onClick={() =>
                        setAddState(s => ({
                          ...s,
                          [code]: { show: true, date: availableDates[0]?.display || "", text: "" },
                        }))
                      }
                      style={{ paddingLeft: 0 }}
                    >
                      ＋ Add Reflection
                    </button>
                  )}
                </div>
              )}

              {error && <p className="text-red-600 text-xs mt-2" aria-live="polite">{error}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
