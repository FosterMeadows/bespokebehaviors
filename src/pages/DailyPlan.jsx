import React, { useState, useEffect, useContext, useMemo } from "react";
import { AuthContext } from "../AuthContext.jsx";
import { db } from "../firebaseConfig";
import { useLocation, useNavigate } from "react-router-dom";
import {
  collection, addDoc, updateDoc, doc, serverTimestamp,
  query, where, orderBy, limit, getDoc, setDoc, getDocs
} from "firebase/firestore";
import Select from "react-select";
import ela8 from "../data/standards/ela8.json";

// Pastel palette
const PASTEL_COLORS = [
  { bg: "hsl(200, 60%, 90%)", text: "hsl(200, 50%, 40%)" },
  { bg: "hsl(160, 60%, 90%)", text: "hsl(160, 50%, 32%)" },
  { bg: "hsl(40, 80%, 92%)",  text: "hsl(40, 50%, 38%)" },
  { bg: "hsl(280, 60%, 93%)", text: "hsl(280, 50%, 40%)" },
  { bg: "hsl(340, 60%, 94%)", text: "hsl(340, 50%, 42%)" },
];

function useRandomPastel() {
  const [color, setColor] = useState(null);
  useEffect(() => {
    setColor(PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)]);
    // eslint-disable-next-line
  }, []);
  return color || PASTEL_COLORS[0];
}

const PREP_DEFAULTS = [
  { id: "prep1", name: "Regular ELA" },
  { id: "prep2", name: "Honors ELA" }
];

function Chevron({ collapsed }) {
  return (
    <svg width="18" height="18" className="inline-block ml-2"
      style={{
        transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
        transition: "transform 0.2s"
      }}
      viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M6 8l4 4 4-4" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg width="18" height="18" fill="none" className="inline-block ml-2" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4" y="6" width="10" height="10" rx="2" fill="#aaa"/>
      <rect x="7" y="4" width="9" height="12" rx="2" stroke="#aaa" strokeWidth="1.5"/>
    </svg>
  );
}
function PasteIcon() {
  return (
    <svg width="18" height="18" fill="none" className="inline-block ml-2" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4" y="6" width="10" height="10" rx="2" fill="#34d399"/>
      <path d="M9 9v3h2V9m0 3v2" stroke="#047857" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

// Helpers
function formatPrettyDate(d) {
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}
function formatWeekday(d) {
  return d.toLocaleDateString(undefined, { weekday: "long" });
}
function makeDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`; // canonical YYYY-MM-DD for storage/query
}
function toLocalDateInputValue(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`; // avoid UTC drift from toISOString()
}

export default function DailyPlan() {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();

  const pastel = useRandomPastel();
  const [preps, setPreps] = useState(PREP_DEFAULTS);
  const [showPrepEdit, setShowPrepEdit] = useState(false);
  const [editPreps, setEditPreps] = useState([]);
  const [showCalendar, setShowCalendar] = useState(false);


  // --- Collapsed state for each prep section ---
  const [collapsedPreps, setCollapsedPreps] = useState({});
  // --- Clipboard for copy/paste ---
  const [prepClipboard, setPrepClipboard] = useState(null);

  // URL param parsing (MM.DD.YYYY) with validation
  const paramDate = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get("date");
    return raw && /^\d{2}\.\d{2}\.\d{4}$/.test(raw) ? raw : null;
  }, [location.search]);

  // Current date state
  const [currentDate, setCurrentDate] = useState(() => {
    if (paramDate) {
      const [m, d, y] = paramDate.split(".").map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  });

  // Derived date fields
  const dateKey = useMemo(() => makeDateKey(currentDate), [currentDate]);
  const [today, setToday] = useState(formatPrettyDate(currentDate));
  const [weekday, setWeekday] = useState(formatWeekday(currentDate));

  // Data & UI state
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState(null);
  const [plan, setPlan] = useState(null);
  const [prepData, setPrepData] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // For standards (memoized)
  const standardOptions = useMemo(
    () => ela8.map((s) => ({ value: s.code, label: `${s.code}: ${s.text}` })),
    []
  );

  // Load user's prep names
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const tRef = doc(db, "teachers", user.uid);
        const snap = await getDoc(tRef);
        if (snap.exists() && snap.data().prepNames) {
          setPreps(snap.data().prepNames);
        }
      } catch {
        setPreps(PREP_DEFAULTS);
      }
    })();
  }, [user]);

  // Update pretty date and weekday when currentDate changes
  useEffect(() => {
    setToday(formatPrettyDate(currentDate));
    setWeekday(formatWeekday(currentDate));
  }, [currentDate]);

  // Keep URL param in sync as MM.DD.YYYY
  useEffect(() => {
    const month = String(currentDate.getMonth() + 1).padStart(2, "0");
    const day = String(currentDate.getDate()).padStart(2, "0");
    const year = currentDate.getFullYear();
    const param = `${month}.${day}.${year}`;
    navigate(`?date=${param}`, { replace: true });
  }, [currentDate, navigate]);

  // If the URL param changes externally, update the date
  useEffect(() => {
    if (paramDate) {
      const [m, d, y] = paramDate.split(".").map(Number);
      const next = new Date(y, m - 1, d);
      if (!isNaN(next.valueOf())) setCurrentDate(next);
    }
  }, [paramDate]);

  // Load plan for dateKey
  useEffect(() => {
    if (!user || !dateKey) return;
    setLoading(true);
    (async () => {
      const ref = collection(db, "teachers", user.uid, "dailyPlans");
      const qy = query(ref, where("dateKey", "==", dateKey), orderBy("createdAt", "desc"), limit(1));
      const snap = await getDocs(qy);
      let planData = null, planDocId = null;
      if (!snap.empty) {
        planDocId = snap.docs[0].id;
        planData = snap.docs[0].data();
      }
      setPlanId(planDocId);
      setPlan(planData);
      setIsEditing(planData == null); // new = editing by default
      setLoading(false);
    })();
  }, [user, dateKey]);

  // Initialize or preserve per-prep state when plan or preps change
  useEffect(() => {
    setPrepData(prev => {
      const base = {};
      preps.forEach(({ id }) => {
        const d = plan?.preps?.[id] || {};
        // Preserve existing edits if present; otherwise initialize from plan or defaults
        base[id] = prev[id] ?? {
          title: d.title || "",
          standards: d.standards || [],
          performanceGoal: d.performanceGoal || "",
          objective: d.objective || "",
          prepSteps: Array.isArray(d.prepSteps) ? d.prepSteps : [""],
          seqSteps: Array.isArray(d.seqSteps) ? d.seqSteps : [""],
          prepDone: Array.isArray(d.prepDone) ? d.prepDone : [],
          seqDone: Array.isArray(d.seqDone) ? d.seqDone : [],
        };
      });
      return base;
    });
  }, [plan, preps]);

  const changeDate = (offset) => {
    let d = new Date(currentDate);
    do { d.setDate(d.getDate() + offset); } while ([0, 6].includes(d.getDay()));
    setCurrentDate(d);
  };

  // Save all prep data together in a single plan doc
  const savePlan = async (e) => {
    e?.preventDefault();

    // Allow blanks: remove pre-save validation gate
    setError("");

    setSaving(true);
    const payload = {
      dateKey,            // canonical for queries
      date: today,        // pretty for display
      weekday,
      isPublic: true,    
      preps: {},
      updatedAt: serverTimestamp(),
    };
    preps.forEach(({ id }) => {
      payload.preps[id] = {
        title: prepData[id]?.title || "",
        standards: prepData[id]?.standards || [],
        performanceGoal: prepData[id]?.performanceGoal || "",
        objective: prepData[id]?.objective || "",
        // keep your trimming of empty rows
        prepSteps: (prepData[id]?.prepSteps || []).filter(Boolean),
        seqSteps: (prepData[id]?.seqSteps || []).filter(Boolean),
        prepDone: prepData[id]?.prepDone || [],
        seqDone: prepData[id]?.seqDone || [],
      };
    });
    try {
      if (planId) {
        await updateDoc(doc(db, "teachers", user.uid, "dailyPlans", planId), payload);
      } else {
        const ref = await addDoc(collection(db, "teachers", user.uid, "dailyPlans"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setPlanId(ref.id);
      }
      setPlan(payload);
      setSuccess(true);
      setIsEditing(false);
      setTimeout(() => setSuccess(false), 2000);
    } catch {
      setError("Save failed, try again.");
    }
    setSaving(false);
  };

  // Prep name editing logic
  useEffect(() => {
    // Initialize editPreps when modal opens (avoid setting state during render)
    if (showPrepEdit) setEditPreps(preps);
  }, [showPrepEdit, preps]);

  const handlePrepNamesSave = async () => {
    setPreps(editPreps);
    setShowPrepEdit(false);
    if (user) {
      const tRef = doc(db, "teachers", user.uid);
      await setDoc(tRef, { prepNames: editPreps }, { merge: true });
    }
  };

  // ---------- RENDER ----------
  const gradientStyle = {
    minHeight: "100vh",
    width: "100%",
    background: `radial-gradient(circle at 50% 50%, ${pastel.bg} 0%, ${pastel.bg} 30%, #fff 70%, #fff 100%)`,
    transition: "background 0.8s",
    padding: "2.5rem 0",
  };

  function toggleCollapse(prepId) {
    setCollapsedPreps(cp => ({
      ...cp,
      [prepId]: !cp[prepId]
    }));
  }

  function handleCopy(id) {
    const data = prepData[id] || {};
    // Deep clone arrays so clipboard isn’t referencing live state
    setPrepClipboard({
      standards: [...(data.standards || [])],
      performanceGoal: data.performanceGoal || "",
      objective: data.objective || "",
      prepSteps: [...(data.prepSteps || [""])],
      seqSteps: [...(data.seqSteps || [""])],
    });
  }
  function handlePaste(id) {
    if (!prepClipboard) return;
    setPrepData(pd => ({
      ...pd,
      [id]: {
        ...pd[id],
        standards: [...(prepClipboard.standards || [])],
        performanceGoal: prepClipboard.performanceGoal || "",
        objective: prepClipboard.objective || "",
        prepSteps: [...(prepClipboard.prepSteps || [""])],
        seqSteps: [...(prepClipboard.seqSteps || [""])],
      }
    }));
  }

  // --- VIEW MODE ---
  if (loading) return <div className="p-6 text-center">Loading…</div>;
  if (!isEditing && plan) {
    return (
      <div style={gradientStyle}>
        <div className="max-w-5xl mx-auto p-6 space-y-6 bg-gray-50 rounded-xl shadow-lg border border-gray-200">
          <div className="flex justify-between items-center pb-2 border-b border-gray-200">
            <button onClick={() => changeDate(-1)}
              className="text-xl text-gray-400 hover:text-gray-700 transition" aria-label="Previous day">←</button>
            <div className="relative">
              <h1
                onClick={() => setShowCalendar(true)}
                className="cursor-pointer text-2xl font-bold"
                style={{ color: pastel.text }}
              >{weekday}, {today}</h1>
              {showCalendar && (
                <input
                  type="date"
                  value={toLocalDateInputValue(currentDate)}
                  onChange={e => {
                    const [y, m, d] = e.target.value.split("-").map(Number);
                    setCurrentDate(new Date(y, m - 1, d));
                  }}
                  onBlur={() => setShowCalendar(false)}
                  className="absolute top-full mt-1 border rounded shadow-lg p-2"
                  autoFocus
                />
              )}
            </div>
            <button onClick={() => changeDate(1)}
              className="text-xl text-gray-400 hover:text-gray-700 transition" aria-label="Next day">→</button>
          </div>
          <div className="flex justify-end space-x-3">
            <button
              onClick={() => setShowPrepEdit(true)}
              className="px-3 py-1 bg-gray-300 hover:bg-gray-400 rounded text-gray-800 text-sm shadow transition"
            >Edit Preps</button>
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-1 bg-yellow-400 hover:bg-yellow-500 text-white rounded shadow transition font-semibold"
            >Edit</button>
          </div>
          {preps.map(({ id, name }) => {
            const d = plan.preps?.[id] || {};
            const collapsed = collapsedPreps[id];
            return (
              <section key={id} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl font-semibold" style={{ color: pastel.text }}>{name}</h2>
                  <button
                    className="ml-2 px-2 py-1 rounded hover:bg-gray-100"
                    aria-label={collapsed ? "Expand section" : "Collapse section"}
                    aria-expanded={!collapsed}
                    onClick={() => toggleCollapse(id)}
                    style={{ fontSize: 15, color: pastel.text, lineHeight: 1.2 }}
                  >
                    <Chevron collapsed={collapsed} />
                  </button>
                </div>
                <div
                  style={{
                    maxHeight: collapsed ? 0 : 2000,
                    opacity: collapsed ? 0 : 1,
                    overflow: "hidden",
                    transition: "max-height 0.35s cubic-bezier(0.5,0,0.5,1), opacity 0.22s",
                  }}
                >
                  <div className="font-semibold mb-1" style={{ color: pastel.text }}>Standards</div>
                  <ul className="list-disc pl-6 space-y-1 mb-4">
                    {(d.standards || []).map(code => {
                      const s = ela8.find(x => x.code === code);
                      return (
                        <li key={code} className="text-gray-800 flex items-center">
                          <span
                            className="rounded px-2 py-0.5 text-xs mr-2 font-mono"
                            style={{
                              background: pastel.bg,
                              color: pastel.text,
                              opacity: 0.85,
                            }}
                          >{code}</span>
                          {s?.text}
                        </li>
                      );
                    })}
                  </ul>
                  {/* OBJECTIVES AREA */}
                  <section
                    className="mb-4 bg-gray-100 p-4 rounded-xl border border-gray-200 shadow-inner"
                    style={{ borderLeft: `6px solid ${pastel.bg}` }}
                  >
                    <div className="mb-2">
                      <div className="font-semibold" style={{ color: pastel.text }}>Performance Goal</div>
                      <div className="text-gray-800">{d.performanceGoal || <span className="italic text-gray-400">None set</span>}</div>
                    </div>
                    <div>
                      <div className="font-semibold" style={{ color: pastel.text }}>Daily Objective</div>
                      <div className="text-gray-800">{d.objective || <span className="italic text-gray-400">None set</span>}</div>
                    </div>
                  </section>
                  {/* SUB-SECTIONS */}
                  {(d.prepSteps || []).length > 0 && (
                    <section className="bg-gray-50 p-3 rounded border border-gray-200 shadow-sm">
                      <h3 className="font-medium mb-2" style={{ color: pastel.text }}>What do I need?</h3>
                      <ul className="pl-6 space-y-1">
                        {(d.prepSteps || []).map((step, i) => (
                          <li key={i} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={d.prepDone?.[i] || false}
                              onChange={async () => {
                                const updated = [...(d.prepDone || [])];
                                updated[i] = !updated[i];
                                await updateDoc(doc(db, "teachers", user.uid, "dailyPlans", planId), {
                                  [`preps.${id}.prepDone`]: updated
                                });
                                setPlan(p => ({
                                  ...p,
                                  preps: {
                                    ...p.preps,
                                    [id]: {
                                      ...p.preps[id],
                                      prepDone: updated
                                    }
                                  }
                                }));
                              }}
                              className="mr-2 scale-110 accent-gray-600"
                              aria-label={`Mark prep item ${i + 1} ${d.prepDone?.[i] ? "incomplete" : "complete"}`}
                            />
                            <span className={d.prepDone?.[i] ? "line-through text-gray-500" : ""}>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {(d.seqSteps || []).length > 0 && (
                    <section className="bg-gray-50 p-3 rounded border border-gray-200 shadow-sm mt-4">
                      <h3 className="font-medium mb-2" style={{ color: pastel.text }}>Planned Lesson Sequence</h3>
                      <ul className="pl-6 space-y-1">
                        {(d.seqSteps || []).map((step, i) => (
                          <li key={i} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={d.seqDone?.[i] || false}
                              onChange={async () => {
                                const updated = [...(d.seqDone || [])];
                                updated[i] = !updated[i];
                                await updateDoc(doc(db, "teachers", user.uid, "dailyPlans", planId), {
                                  [`preps.${id}.seqDone`]: updated
                                });
                                setPlan(p => ({
                                  ...p,
                                  preps: {
                                    ...p.preps,
                                    [id]: {
                                      ...p.preps[id],
                                      seqDone: updated
                                    }
                                  }
                                }));
                              }}
                              className="mr-2 scale-110 accent-gray-600"
                              aria-label={`Mark sequence item ${i + 1} ${d.seqDone?.[i] ? "incomplete" : "complete"}`}
                            />
                            <span className={d.seqDone?.[i] ? "line-through text-gray-500" : ""}>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              </section>
            );
          })}
          {/* Prep Names Modal */}
          {showPrepEdit && (
            <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 min-w-[320px]">
                <h2 className="text-lg font-bold mb-4">Edit Preps</h2>
                {editPreps.map((p, idx) => (
                  <div key={p.id} className="flex items-center space-x-2 mb-2">
                    <input
                      className="border rounded p-1 flex-1"
                      value={p.name}
                      onChange={e => {
                        const arr = [...editPreps];
                        arr[idx].name = e.target.value;
                        setEditPreps(arr);
                      }}
                    />
                    {editPreps.length > 1 && (
                      <button
                        onClick={() => {
                          const arr = [...editPreps];
                          arr.splice(idx, 1);
                          setEditPreps(arr);
                        }}
                        className="px-2 py-1 bg-red-300 hover:bg-red-400 rounded"
                      >✕</button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setEditPreps([...editPreps, { id: `prep${Date.now()}`, name: "" }])}
                  className="px-4 py-2 bg-green-300 hover:bg-green-400 rounded transition mb-3"
                >+ Add Prep</button>
                <div className="flex justify-end space-x-2">
                  <button onClick={() => setShowPrepEdit(false)} className="px-4 py-1 bg-gray-300 rounded">Cancel</button>
                  <button onClick={handlePrepNamesSave} className="px-4 py-1 bg-blue-500 text-white rounded">Save</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- EDIT MODE ---
  return (
    <div style={gradientStyle}>
      <div className="max-w-5xl mx-auto p-6 space-y-6 bg-gray-50 rounded-xl shadow-lg border border-gray-200">
        <div className="flex justify-between items-center pb-2 border-b border-gray-200">
          <button onClick={() => changeDate(-1)}
            className="text-xl text-gray-400 hover:text-gray-700 transition" aria-label="Previous day">←</button>
          <h1 className="text-2xl font-bold" style={{ color: pastel.text }}>Daily Plan - {weekday}, {today}</h1>
          <button onClick={() => changeDate(1)}
            className="text-xl text-gray-400 hover:text-gray-700 transition" aria-label="Next day">→</button>
        </div>
        <div className="flex justify-end mb-2">
          <button
            onClick={() => { setShowPrepEdit(true); }}
            className="px-3 py-1 bg-gray-300 hover:bg-gray-400 rounded text-gray-800 text-sm shadow transition"
          >Edit Preps</button>
        </div>
        <form onSubmit={savePlan} className="space-y-8">
          {preps.map(({ id, name }) => {
            const collapsed = collapsedPreps[id];
            const isCopy = prepClipboard &&
              (prepData[id]?.standards || []).toString() === (prepClipboard.standards || []).toString() &&
              (prepData[id]?.performanceGoal || "") === (prepClipboard.performanceGoal || "") &&
              (prepData[id]?.objective || "") === (prepClipboard.objective || "") &&
              JSON.stringify(prepData[id]?.prepSteps || []) === JSON.stringify(prepClipboard?.prepSteps || []) &&
              JSON.stringify(prepData[id]?.seqSteps || []) === JSON.stringify(prepClipboard?.seqSteps || []);

            return (
              <section key={id} className="bg-white p-5 rounded-lg border border-gray-200 shadow-md space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl font-semibold" style={{ color: pastel.text }}>{name}</h2>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(id)}
                      className="px-2 py-1 rounded hover:bg-gray-100"
                      title="Copy prep"
                      aria-label="Copy prep"
                    >
                      <CopyIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePaste(id)}
                      className={`px-2 py-1 rounded hover:bg-gray-100 ${(!prepClipboard || isCopy) ? "opacity-50 pointer-events-none" : ""}`}
                      title="Paste to prep"
                      aria-label="Paste to prep"
                      disabled={!prepClipboard || isCopy}
                    >
                      <PasteIcon />
                    </button>
                    <button
                      className="ml-2 px-2 py-1 rounded hover:bg-gray-100"
                      aria-label={collapsed ? "Expand section" : "Collapse section"}
                      aria-expanded={!collapsed}
                      type="button"
                      onClick={e => { e.preventDefault(); toggleCollapse(id); }}
                      style={{ fontSize: 15, color: pastel.text, lineHeight: 1.2 }}
                    >
                      <Chevron collapsed={collapsed} />
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    maxHeight: collapsed ? 0 : 2000,
                    opacity: collapsed ? 0 : 1,
                    overflow: "hidden",
                    transition: "max-height 0.35s cubic-bezier(0.5,0,0.5,1), opacity 0.22s",
                  }}
                >
                  <div className="mb-2">
                    <label className="block text-lg font-medium mb-1" style={{ color: pastel.text }}>Lesson Title</label>
                    <input
                      type="text"
                      className="w-full border rounded p-2 text-gray-900 bg-gray-50 focus:ring-2 focus:ring-gray-300"
                      value={prepData[id]?.title || ""}
                      onChange={e => setPrepData(pd => ({ ...pd, [id]: { ...pd[id], title: e.target.value } }))}
                      /* required removed to allow blanks */
                    />
                  </div>
                  <div className="mb-2">
                    <label className="block text-lg font-medium mb-1" style={{ color: pastel.text }}>Standards</label>
                    <Select
                      isMulti
                      options={standardOptions}
                      value={standardOptions.filter(o => (prepData[id]?.standards || []).includes(o.value))}
                      onChange={opts => setPrepData(pd => ({
                        ...pd,
                        [id]: { ...pd[id], standards: opts ? opts.map(x => x.value) : [] }
                      }))}
                      className="react-select-container"
                      classNamePrefix="react-select"
                    />
                  </div>
                  {/* PERFORMANCE GOAL & OBJECTIVE CARD */}
                  <section
                    className="mb-4 bg-gray-100 p-4 rounded-xl border border-gray-200 shadow-inner"
                    style={{ borderLeft: `6px solid ${pastel.bg}` }}
                  >
                    <div className="mb-2">
                      <label className="block font-semibold mb-1" style={{ color: pastel.text }}>Performance Goal</label>
                      <input
                        type="text"
                        className="w-full border rounded p-2 text-gray-900 bg-gray-50 focus:ring-2 focus:ring-gray-300"
                        value={prepData[id]?.performanceGoal || ""}
                        onChange={e => setPrepData(pd => ({ ...pd, [id]: { ...pd[id], performanceGoal: e.target.value } }))}
                        placeholder="End product, assessment, or measurable outcome"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1" style={{ color: pastel.text }}>Daily Objective</label>
                      <input
                        type="text"
                        className="w-full border rounded p-2 text-gray-900 bg-gray-50 focus:ring-2 focus:ring-gray-300"
                        value={prepData[id]?.objective || ""}
                        onChange={e => setPrepData(pd => ({ ...pd, [id]: { ...pd[id], objective: e.target.value } }))}
                        placeholder="We will..."
                      />
                    </div>
                  </section>
                  {/* SUB-SECTIONS */}
                  <div className="mb-2">
                    <label className="block text-lg font-medium mb-1" style={{ color: pastel.text }}>What do I need?</label>
                    {(prepData[id]?.prepSteps || [""]).map((step, i) => (
                      <div key={i} className="flex items-start space-x-2 mb-2">
                        <textarea
                          className="flex-1 border rounded p-2 resize-none overflow-hidden bg-gray-50 focus:ring-2 focus:ring-gray-300"
                          rows={1}
                          value={step}
                          onChange={e => {
                            const arr = [...(prepData[id]?.prepSteps || [])];
                            arr[i] = e.target.value;
                            setPrepData(pd => ({ ...pd, [id]: { ...pd[id], prepSteps: arr } }));
                          }}
                          onInput={e => {
                            e.target.style.height = 'auto';
                            e.target.style.height = `${e.target.scrollHeight}px`;
                          }}
                          placeholder={`Thing ${i + 1}`}
                        />
                        <button type="button" onClick={() => {
                          const arr = (prepData[id]?.prepSteps || []).filter((_, j) => j !== i);
                          const chk = (prepData[id]?.prepDone || []).filter((_, j) => j !== i);
                          setPrepData(pd => ({
                            ...pd,
                            [id]: { ...pd[id], prepSteps: arr.length ? arr : [""], prepDone: chk.length ? chk : [] }
                          }));
                        }} className="px-2 py-1 bg-red-300 hover:bg-red-400 rounded transition">✕</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => {
                      setPrepData(pd => ({
                        ...pd,
                        [id]: {
                          ...pd[id],
                          prepSteps: [...(pd[id]?.prepSteps || []), ""],
                          prepDone: [...(pd[id]?.prepDone || []), false]
                        }
                      }));
                    }} className="px-4 py-2 bg-green-300 hover:bg-green-400 rounded transition mt-2 font-semibold"
                    >+ Add Thing</button>
                  </div>
                  <div className="mb-2 mt-4">
                    <label className="block text-lg font-medium mb-1" style={{ color: pastel.text }}>Planned Lesson Sequence</label>
                    {(prepData[id]?.seqSteps || [""]).map((step, i) => (
                      <div key={i} className="flex items-start space-x-2 mb-2">
                        <textarea
                          className="flex-1 border rounded p-2 resize-none overflow-hidden bg-gray-50 focus:ring-2 focus:ring-gray-300"
                          rows={1}
                          value={step}
                          onChange={e => {
                            const arr = [...(prepData[id]?.seqSteps || [])];
                            arr[i] = e.target.value;
                            setPrepData(pd => ({ ...pd, [id]: { ...pd[id], seqSteps: arr } }));
                          }}
                          onInput={e => {
                            e.target.style.height = 'auto';
                            e.target.style.height = `${e.target.scrollHeight}px`;
                          }}
                          placeholder={`Plan ${i + 1}`}
                        />
                        <button type="button" onClick={() => {
                          const arr = (prepData[id]?.seqSteps || []).filter((_, j) => j !== i);
                          const chk = (prepData[id]?.seqDone || []).filter((_, j) => j !== i);
                          setPrepData(pd => ({
                            ...pd,
                            [id]: { ...pd[id], seqSteps: arr.length ? arr : [""], seqDone: chk.length ? chk : [] }
                          }));
                        }} className="px-2 py-1 bg-red-300 hover:bg-red-400 rounded transition">✕</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => {
                      setPrepData(pd => ({
                        ...pd,
                        [id]: {
                          ...pd[id],
                          seqSteps: [...(pd[id]?.seqSteps || []), ""],
                          seqDone: [...(pd[id]?.seqDone || []), false]
                        }
                      }));
                    }} className="px-4 py-2 bg-green-300 hover:bg-green-400 rounded transition mt-2 font-semibold"
                    >+ Add Plan</button>
                  </div>
                </div>
              </section>
            );
          })}
          {error && <p className="text-red-600 font-semibold">{error}</p>}
          {success && <p className="text-green-600 font-semibold">Saved!</p>}
          <button type="submit" disabled={saving}
            className="px-8 py-2 bg-gray-700 hover:bg-gray-900 text-white rounded-lg font-bold shadow transition"
          >{saving ? 'Saving...' : 'Save'}</button>
        </form>
        {showPrepEdit && (
          <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 min-w-[320px]">
              <h2 className="text-lg font-bold mb-4">Edit Preps</h2>
              {editPreps.map((p, idx) => (
                <div key={p.id} className="flex items-center space-x-2 mb-2">
                  <input
                    className="border rounded p-1 flex-1"
                    value={p.name}
                    onChange={e => {
                      const arr = [...editPreps];
                      arr[idx].name = e.target.value;
                      setEditPreps(arr);
                    }}
                  />
                  {editPreps.length > 1 && (
                    <button
                      onClick={() => {
                        const arr = [...editPreps];
                        arr.splice(idx, 1);
                        setEditPreps(arr);
                      }}
                      className="px-2 py-1 bg-red-300 hover:bg-red-400 rounded"
                    >✕</button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setEditPreps([...editPreps, { id: `prep${Date.now()}`, name: "" }])}
                className="px-4 py-2 bg-green-300 hover:bg-green-400 rounded transition mb-3"
              >+ Add Prep</button>
              <div className="flex justify-end space-x-2">
                <button onClick={() => setShowPrepEdit(false)} className="px-4 py-1 bg-gray-300 rounded">Cancel</button>
                <button onClick={handlePrepNamesSave} className="px-4 py-1 bg-blue-500 text-white rounded">Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
