import React, { useState, useEffect, useContext, useMemo, useRef } from "react";
import { AuthContext } from "../AuthContext.jsx";
import { db } from "../firebaseConfig";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import ela8 from "../data/standards/ela8.json";
import { formatPrettyDate, formatWeekday, makeDateKey, toLocalDateInputValue } from "../utils/date";
import useRandomPastel from "../hooks/useRandomPastel";
import * as plansSvc from "../services/plans";
import PrepNamesModal from "../components/DailyPlan/PrepNamesModal";
import PrepView from "../components/DailyPlan/PrepView";
import PrepEdit from "../components/DailyPlan/PrepEdit";

const PREP_DEFAULTS = [
  { id: "prep1", name: "Regular ELA" },
  { id: "prep2", name: "Honors ELA" }
];

const STANDARD_OPTIONS = ela8.map(s => ({ value: s.code, label: `${s.code}: ${s.text}` }));
const STANDARDS_INDEX = Object.fromEntries(ela8.map(s => [s.code, s]));

// Helpers for URL<->Date
function parseParamDate(search) {
  const params = new URLSearchParams(search);
  const raw = params.get("date");
  if (!raw || !/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) return null;
  const [m, d, y] = raw.split(".").map(Number);
  const next = new Date(y, m - 1, d);
  return Number.isNaN(next.valueOf()) ? null : next;
}
function buildDateParam(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const y = d.getFullYear();
  return `${m}.${day}.${y}`;
}

export default function DailyPlan() {
  const { user } = useContext(AuthContext);
  const uid = user?.uid;

  const location = useLocation();
  const navigate = useNavigate();

  const pastel = useRandomPastel();
  const [preps, setPreps] = useState(PREP_DEFAULTS);
  const [showPrepEdit, setShowPrepEdit] = useState(false);
  const [editPreps, setEditPreps] = useState([]);
  const [showCalendar, setShowCalendar] = useState(false);

  const [collapsedPreps, setCollapsedPreps] = useState({});
  const [prepClipboard, setPrepClipboard] = useState(null);

  // URL is source of truth
  const [currentDate, setCurrentDate] = useState(() => parseParamDate(location.search) || new Date());

  // One-time init: if no ?date=, snap weekends and write param
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    const fromUrl = parseParamDate(location.search);
    if (fromUrl) {
      setCurrentDate(fromUrl);
      return;
    }
    let d = new Date();
    const day = d.getDay();
    if (day === 6) d.setDate(d.getDate() + 2);
    if (day === 0) d.setDate(d.getDate() + 1);
    setCurrentDate(d);
    navigate(`?date=${buildDateParam(d)}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser back/forward updates currentDate
  useEffect(() => {
    const fromUrl = parseParamDate(location.search);
    if (!fromUrl) return;
    if (fromUrl.toDateString() !== currentDate.toDateString()) {
      setCurrentDate(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Explicit navigation helper
  const pushDate = (d, { replace = true } = {}) => {
    setCurrentDate(d);
    navigate(`?date=${buildDateParam(d)}`, { replace });
  };

  const changeDate = (offset) => {
    const d = new Date(currentDate);
    do { d.setDate(d.getDate() + offset); } while ([0, 6].includes(d.getDay()));
    pushDate(d, { replace: true });
  };

  // Derived keys/labels: derive from currentDate, NOT state updated in an effect
  const dateKey = useMemo(() => makeDateKey(currentDate), [currentDate]);
  const today = useMemo(() => formatPrettyDate(currentDate), [currentDate]);
  const weekday = useMemo(() => formatWeekday(currentDate), [currentDate]);
  const dateParam = useMemo(() => buildDateParam(currentDate), [currentDate]);

  // Data & UI
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(null);
  const [prepData, setPrepData] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Reset banners on date change
  useEffect(() => {
    setIsEditing(false);
    setSuccess(false);
    setError("");
  }, [dateKey]);

  // Auto-clear success
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(false), 2000);
    return () => clearTimeout(t);
  }, [success]);

  // Load user's prep names
  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const tRef = doc(db, "teachers", uid);
        const snap = await getDoc(tRef);
        if (snap.exists() && snap.data().prepNames) setPreps(snap.data().prepNames);
      } catch {
        setPreps(PREP_DEFAULTS);
      }
    })();
  }, [uid]);

  // Fetch plan for dateKey
  const fetchSeq = useRef(0);
  useEffect(() => {
    if (!uid || !dateKey) return;
    const seq = ++fetchSeq.current;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const planData = await plansSvc.getDailyPlan(uid, dateKey);
        if (fetchSeq.current !== seq) return;
        setPlan(planData);
        setIsEditing(planData == null);
      } finally {
        if (fetchSeq.current === seq) setLoading(false);
      }
    })();
  }, [uid, dateKey]);

  // Hydrate edit state when plan/preps change
  useEffect(() => {
    setPrepData(() => {
      const base = {};
      preps.forEach(({ id }) => {
        const d = plan?.preps?.[id] || {};
        base[id] = {
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

  // Build partial updates FROM THE CURRENT RENDER
  const buildEditableFieldUpdates = () => {
    const updates = {
      dateKey,
      date: today,
      weekday,
      isPublic: true,
    };
    preps.forEach(({ id }) => {
      updates[`preps.${id}.title`] = prepData[id]?.title || "";
      updates[`preps.${id}.standards`] = prepData[id]?.standards || [];
      updates[`preps.${id}.performanceGoal`] = prepData[id]?.performanceGoal || "";
      updates[`preps.${id}.objective`] = prepData[id]?.objective || "";
      updates[`preps.${id}.prepSteps`] = (prepData[id]?.prepSteps || []).filter(Boolean);
      updates[`preps.${id}.seqSteps`] = (prepData[id]?.seqSteps || []).filter(Boolean);
    });
    return updates;
  };

  const savePlan = async (e) => {
    e?.preventDefault();
    setError("");
    if (!uid || !dateKey) return;

    setSaving(true);
    try {
      if (!plan) {
        const base = {
          dateKey,
          date: today,
          weekday,
          isPublic: true,
          preps: {}
        };
        preps.forEach(({ id }) => {
          base.preps[id] = {
            title: prepData[id]?.title || "",
            standards: prepData[id]?.standards || [],
            performanceGoal: prepData[id]?.performanceGoal || "",
            objective: prepData[id]?.objective || "",
            prepSteps: (prepData[id]?.prepSteps || []).filter(Boolean),
            seqSteps: (prepData[id]?.seqSteps || []).filter(Boolean),
          };
        });
        await plansSvc.initDailyPlan(uid, dateKey, base);
      } else {
        const updates = buildEditableFieldUpdates();
        await plansSvc.updateDailyPlan(uid, dateKey, updates);
      }
      // Hard sync
      const fresh = await plansSvc.getDailyPlan(uid, dateKey);
      setPlan(fresh || null);
      setSuccess(true);
      setIsEditing(false);
    } catch (err) {
      console.error("savePlan failed", err);
      setError("Save failed. Reload and try again.");
    } finally {
      setSaving(false);
    }
  };

  // Prep name editing logic
  useEffect(() => {
    if (showPrepEdit) setEditPreps(preps);
  }, [showPrepEdit, preps]);

  const handlePrepNamesSave = async () => {
    setPreps(editPreps);
    setShowPrepEdit(false);
    if (uid) await plansSvc.savePrepNames(uid, editPreps);
  };

  const gradientStyle = {
    minHeight: "100vh",
    width: "100%",
    background: `radial-gradient(circle at 50% 50%, ${pastel.bg} 0%, ${pastel.bg} 30%, #fff 70%, #fff 100%)`,
    transition: "background 0.8s",
    padding: "2.5rem 0",
  };

  function handleCopy(id) {
    const data = prepData[id] || {};
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

  if (loading) return <div className="p-6 text-center">Loading…</div>;

  // Key the edit form by dateKey so inputs never leak across days
  const content = !isEditing && plan ? (
    <div className="space-y-6" key={`view-${dateKey}`}>
      <div className="flex justify-between items-center pb-2 border-b border-gray-200">
        <button onClick={() => changeDate(-1)} className="text-xl text-gray-400 hover:text-gray-700 transition" aria-label="Previous day">←</button>

        <div className="relative">
          <h1 onClick={() => setShowCalendar(true)} className="cursor-pointer text-2xl font-bold" style={{ color: pastel.text }}>
            {weekday}, {today}
          </h1>

          {showCalendar && (
            <input
              type="date"
              value={toLocalDateInputValue(currentDate)}
              onChange={e => {
                const v = e.target.value;
                if (!v) return;
                const [y, m, d] = v.split("-").map(Number);
                if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
                  const next = new Date(y, m - 1, d);
                  if ([0, 6].includes(next.getDay())) {
                    const n = new Date(next);
                    if (n.getDay() === 6) n.setDate(n.getDate() + 2);
                    if (n.getDay() === 0) n.setDate(n.getDate() + 1);
                    pushDate(n);
                  } else {
                    pushDate(next);
                  }
                  setShowCalendar(false);
                }
              }}
              onBlur={() => setShowCalendar(false)}
              className="absolute top-full mt-1 border rounded shadow-lg p-2"
              autoFocus
            />
          )}
        </div>

        <button onClick={() => changeDate(1)} className="text-xl text-gray-400 hover:text-gray-700 transition" aria-label="Next day">→</button>
      </div>

      <div className="flex justify-end space-x-3">
        <Link to={`/week?date=${dateParam}`} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-gray-800 text-sm shadow transition">Week</Link>

        <button onClick={() => setShowPrepEdit(true)} className="px-3 py-1 bg-gray-300 hover:bg-gray-400 rounded text-gray-800 text-sm shadow transition">Edit Preps</button>
        <button onClick={() => setIsEditing(true)} className="px-4 py-1 bg-yellow-400 hover:bg-yellow-500 text-white rounded shadow transition font-semibold">Edit</button>
      </div>

      {preps.map(({ id, name }) => (
        <PrepView
          key={id}
          id={id}
          name={name}
          pastel={pastel}
          prep={(plan.preps || {})[id] || {}}
          standardsIndex={STANDARDS_INDEX}
          collapsed={!!collapsedPreps[id]}
          onToggleCollapse={(pid) => setCollapsedPreps(cp => ({ ...cp, [pid]: !cp[pid] }))}
          onTogglePrep={async (pid, i) => {
            const d = (plan.preps || {})[pid] || {};
            const updated = [...(d.prepDone || [])];
            updated[i] = !updated[i];
            setPlan(p => ({ ...p, preps: { ...p.preps, [pid]: { ...d, prepDone: updated } }}));
            try { await plansSvc.updatePrepDone(uid, dateKey, pid, updated); } catch {}
          }}
          onToggleSeq={async (pid, i) => {
            const d = (plan.preps || {})[pid] || {};
            const updated = [...(d.seqDone || [])];
            updated[i] = !updated[i];
            setPlan(p => ({ ...p, preps: { ...p.preps, [pid]: { ...d, seqDone: updated } }}));
            try { await plansSvc.updateSeqDone(uid, dateKey, pid, updated); } catch {}
          }}
        />
      ))}
    </div>
  ) : (
    <form onSubmit={savePlan} className="space-y-8" key={`edit-${dateKey}`}>
      <div className="flex justify-between items-center pb-2 border-b border-gray-200">
        <button onClick={() => changeDate(-1)} className="text-xl text-gray-400 hover:text-gray-700 transition" aria-label="Previous day">←</button>
        <h1 className="text-2xl font-bold" style={{ color: pastel.text }}>Daily Plan - {weekday}, {today}</h1>
        <button onClick={() => changeDate(1)} className="text-xl text-gray-400 hover:text-gray-700 transition" aria-label="Next day">→</button>
      </div>

      <div className="flex justify-end mb-2 space-x-2">
        <Link to={`/week?date=${dateParam}`} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-gray-800 text-sm shadow transition">Week</Link>
        <button type="button" onClick={() => setShowPrepEdit(true)} className="px-3 py-1 bg-gray-300 hover:bg-gray-400 rounded text-gray-800 text-sm shadow transition">Edit Preps</button>
      </div>

      {preps.map(({ id, name }) => {
        const data = prepData[id] || {};
        const collapsed = !!collapsedPreps[id];

        const isCopy =
          prepClipboard &&
          (data.standards || []).toString() === (prepClipboard.standards || []).toString() &&
          (data.performanceGoal || "") === (prepClipboard.performanceGoal || "") &&
          (data.objective || "") === (prepClipboard.objective || "") &&
          JSON.stringify(data.prepSteps || []) === JSON.stringify(prepClipboard?.prepSteps || []) &&
          JSON.stringify(data.seqSteps || []) === JSON.stringify(prepClipboard?.seqSteps || []);

        const canPaste = !!prepClipboard && !isCopy;

        return (
          <PrepEdit
            key={id}
            id={id}
            name={name}
            pastel={pastel}
            data={data}
            standardOptions={STANDARD_OPTIONS}
            collapsed={collapsed}
            canPaste={canPaste}
            onToggleCollapse={(pid) => setCollapsedPreps(cp => ({ ...cp, [pid]: !cp[pid] }))}
            onCopy={handleCopy}
            onPaste={handlePaste}
            onChangeTitle={(pid, value) => setPrepData(pd => ({ ...pd, [pid]: { ...pd[pid], title: value } }))}
            onChangePerformanceGoal={(pid, value) => setPrepData(pd => ({ ...pd, [pid]: { ...pd[pid], performanceGoal: value } }))}
            onChangeObjective={(pid, value) => setPrepData(pd => ({ ...pd, [pid]: { ...pd[pid], objective: value } }))}
            onChangeStandards={(pid, values) => setPrepData(pd => ({ ...pd, [pid]: { ...pd[pid], standards: values } }))}
            onEditPrepStep={(pid, i, value) => setPrepData(pd => {
              const arr = [...(pd[pid]?.prepSteps || [])];
              arr[i] = value;
              return { ...pd, [pid]: { ...pd[pid], prepSteps: arr } };
            })}
            onRemovePrepStep={(pid, i) => setPrepData(pd => {
              const arr = (pd[pid]?.prepSteps || []).filter((_, j) => j !== i);
              const chk = (pd[pid]?.prepDone || []).filter((_, j) => j !== i);
              return { ...pd, [pid]: { ...pd[pid], prepSteps: arr.length ? arr : [""], prepDone: chk.length ? chk : [] } };
            })}
            onAddPrepStep={(pid) => setPrepData(pd => ({
              ...pd,
              [pid]: {
                ...pd[pid],
                prepSteps: [...(pd[pid]?.prepSteps || []), ""],
                prepDone: [...(pd[pid]?.prepDone || []), false]
              }
            }))}
            onEditSeqStep={(pid, i, value) => setPrepData(pd => {
              const arr = [...(pd[pid]?.seqSteps || [])];
              arr[i] = value;
              return { ...pd, [pid]: { ...pd[pid], seqSteps: arr } };
            })}
            onRemoveSeqStep={(pid, i) => setPrepData(pd => {
              const arr = (pd[pid]?.seqSteps || []).filter((_, j) => j !== i);
              const chk = (pd[pid]?.seqDone || []).filter((_, j) => j !== i);
              return { ...pd, [pid]: { ...pd[pid], seqSteps: arr.length ? arr : [""], seqDone: chk.length ? chk : [] } };
            })}
            onAddSeqStep={(pid) => setPrepData(pd => ({
              ...pd,
              [pid]: {
                ...pd[pid],
                seqSteps: [...(pd[pid]?.seqSteps || []), ""],
                seqDone:  [...(pd[pid]?.seqDone  || []), false],
              }
            }))}
            onReorderPrepStep={(pid, from, to) => setPrepData(pd => {
              const steps = [...(pd[pid]?.prepSteps || [])];
              const done = [...(pd[pid]?.prepDone || [])];
              if (from < 0 || to < 0 || from >= steps.length) return pd;
              const [s] = steps.splice(from, 1);
              steps.splice(to, 0, s);
              const [d] = done.splice(from, 1);
              done.splice(to, 0, d);
              return { ...pd, [pid]: { ...pd[pid], prepSteps: steps, prepDone: done } };
            })}
            onReorderSeqStep={(pid, from, to) => setPrepData(pd => {
              const steps = [...(pd[pid]?.seqSteps || [])];
              const done = [...(pd[pid]?.seqDone || [])];
              if (from < 0 || to < 0 || from >= steps.length) return pd;
              const [s] = steps.splice(from, 1);
              steps.splice(to, 0, s);
              const [d] = done.splice(from, 1);
              done.splice(to, 0, d);
              return { ...pd, [pid]: { ...pd[pid], seqSteps: steps, seqDone: done } };
            })}
          />
        );
      })}

      {error && <p className="text-red-600 font-semibold" aria-live="polite">{error}</p>}
      {success && <p className="text-green-600 font-semibold" aria-live="polite">Saved!</p>}

      <button type="submit" disabled={saving} className="px-8 py-2 bg-gray-700 hover:bg-gray-900 text-white rounded-lg font-bold shadow transition">
        {saving ? "Saving..." : "Save"}
      </button>
    </form>
  );

  return (
    <div style={gradientStyle}>
      <div className="max-w-5xl mx-auto p-6 bg-gray-50 rounded-xl shadow-lg border border-gray-200">
        {content}
      </div>

      <PrepNamesModal
        isOpen={showPrepEdit}
        editPreps={editPreps}
        setEditPreps={setEditPreps}
        onClose={() => setShowPrepEdit(false)}
        onSave={handlePrepNamesSave}
      />
    </div>
  );
}
