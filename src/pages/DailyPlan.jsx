import React, { useState, useEffect, useContext, useMemo } from "react";
import { AuthContext } from "../AuthContext.jsx";
import { db } from "../firebaseConfig";
import { useLocation, useNavigate } from "react-router-dom";
import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
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

// Static standards helpers (no need for hooks)
const STANDARD_OPTIONS = ela8.map(s => ({ value: s.code, label: `${s.code}: ${s.text}` }));
const STANDARDS_INDEX = Object.fromEntries(ela8.map(s => [s.code, s]));

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

  // Collapsed state per prep
  const [collapsedPreps, setCollapsedPreps] = useState({});
  // Clipboard for copy/paste
  const [prepClipboard, setPrepClipboard] = useState(null);

  // URL param parsing (MM.DD.YYYY)
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
  const [plan, setPlan] = useState(null);
  const [prepData, setPrepData] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // success banner auto-clear, with cleanup
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
        if (snap.exists() && snap.data().prepNames) {
          setPreps(snap.data().prepNames);
        }
      } catch {
        setPreps(PREP_DEFAULTS);
      }
    })();
  }, [uid]);

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

  // Load plan for dateKey (deterministic doc id)
  useEffect(() => {
    if (!uid || !dateKey) return;
    setLoading(true);
    (async () => {
      try {
        const planData = await plansSvc.getDailyPlan(uid, dateKey);
        setPlan(planData);
        setIsEditing(planData == null); // new = editing by default
      } finally {
        setLoading(false);
      }
    })();
  }, [uid, dateKey]);

  // Reset per-prep state whenever plan, preps, or dateKey changes
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
  }, [plan, preps, dateKey]);

  const changeDate = (offset) => {
    let d = new Date(currentDate);
    do { d.setDate(d.getDate() + offset); } while ([0, 6].includes(d.getDay()));
    setCurrentDate(d);
  };

  // Build editable fields payload (does not touch prepDone/seqDone)
  const buildEditableFieldUpdates = () => {
    const updates = {};
    updates["dateKey"] = dateKey;
    updates["date"] = today;
    updates["weekday"] = weekday;
    updates["isPublic"] = true;
    updates["updatedAt"] = serverTimestamp();

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

  // Save using transaction with revision guard
  const savePlan = async (e) => {
    e?.preventDefault();
    setError("");
    if (!uid || !dateKey) return;

    setSaving(true);
    const planRef = doc(db, "teachers", uid, "dailyPlans", dateKey);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(planRef);
        const now = serverTimestamp();

        if (!snap.exists()) {
          const base = {
            dateKey,
            date: today,
            weekday,
            isPublic: true,
            createdAt: now,
            updatedAt: now,
            rev: 1,
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
          tx.set(planRef, base, { merge: false });
        } else {
          const current = snap.data();
          const currentRev = typeof current.rev === "number" ? current.rev : 0;
          const updates = buildEditableFieldUpdates();
          updates["rev"] = currentRev + 1;
          tx.update(planRef, updates);
        }
      });

      // reflect local plan with patched fields, but keep any done arrays from current plan
      setPlan((prev) => {
        const next = { ...(prev || {}), dateKey, date: today, weekday, isPublic: true };
        next.preps = next.preps || {};
        preps.forEach(({ id }) => {
          const prevPrep = prev?.preps?.[id] || {};
          next.preps[id] = {
            ...prevPrep,
            title: prepData[id]?.title || "",
            standards: prepData[id]?.standards || [],
            performanceGoal: prepData[id]?.performanceGoal || "",
            objective: prepData[id]?.objective || "",
            prepSteps: (prepData[id]?.prepSteps || []).filter(Boolean),
            seqSteps: (prepData[id]?.seqSteps || []).filter(Boolean),
          };
        });
        return next;
      });

      setSuccess(true);
      setIsEditing(false);
    } catch (err) {
      console.error("savePlan tx failed", err);
      setError("Save failed, possibly due to a concurrent change. Reload and try again.");
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
    if (uid) {
      await plansSvc.savePrepNames(uid, editPreps);
    }
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

  // Build branch content (view vs edit)
  const content = !isEditing && plan ? (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-2 border-b border-gray-200">
        <button
          onClick={() => changeDate(-1)}
          className="text-xl text-gray-400 hover:text-gray-700 transition"
          aria-label="Previous day"
        >
          ←
        </button>

        <div className="relative">
          <h1
            onClick={() => setShowCalendar(true)}
            className="cursor-pointer text-2xl font-bold"
            style={{ color: pastel.text }}
          >
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
                  setCurrentDate(new Date(y, m - 1, d));
                  setShowCalendar(false);
                }
              }}
              onBlur={() => setShowCalendar(false)}
              className="absolute top-full mt-1 border rounded shadow-lg p-2"
              autoFocus
            />
          )}
        </div>

        <button
          onClick={() => changeDate(1)}
          className="text-xl text-gray-400 hover:text-gray-700 transition"
          aria-label="Next day"
        >
          →
        </button>
      </div>

      <div className="flex justify-end space-x-3">
        <button
          onClick={() => setShowPrepEdit(true)}
          className="px-3 py-1 bg-gray-300 hover:bg-gray-400 rounded text-gray-800 text-sm shadow transition"
        >
          Edit Preps
        </button>
        <button
          onClick={() => setIsEditing(true)}
          className="px-4 py-1 bg-yellow-400 hover:bg-yellow-500 text-white rounded shadow transition font-semibold"
        >
          Edit
        </button>
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
          onToggleCollapse={(pid) =>
            setCollapsedPreps(cp => ({ ...cp, [pid]: !cp[pid] }))
          }
          onTogglePrep={async (pid, i) => {
            const d = (plan.preps || {})[pid] || {};
            const updated = [...(d.prepDone || [])];
            updated[i] = !updated[i];
            await plansSvc.updatePrepDone(uid, dateKey, pid, updated);
            setPlan(p => ({
              ...p,
              preps: { ...p.preps, [pid]: { ...d, prepDone: updated } }
            }));
          }}
          onToggleSeq={async (pid, i) => {
            const d = (plan.preps || {})[pid] || {};
            const updated = [...(d.seqDone || [])];
            updated[i] = !updated[i];
            await plansSvc.updateSeqDone(uid, dateKey, pid, updated);
            setPlan(p => ({
              ...p,
              preps: { ...p.preps, [pid]: { ...d, seqDone: updated } }
            }));
          }}
        />
      ))}
    </div>
  ) : (
    <form onSubmit={savePlan} className="space-y-8">
      <div className="flex justify-between items-center pb-2 border-b border-gray-200">
        <button
          onClick={() => changeDate(-1)}
          className="text-xl text-gray-400 hover:text-gray-700 transition"
          aria-label="Previous day"
        >
          ←
        </button>
        <h1 className="text-2xl font-bold" style={{ color: pastel.text }}>
          Daily Plan - {weekday}, {today}
        </h1>
        <button
          onClick={() => changeDate(1)}
          className="text-xl text-gray-400 hover:text-gray-700 transition"
          aria-label="Next day"
        >
          →
        </button>
      </div>

      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={() => setShowPrepEdit(true)}
          className="px-3 py-1 bg-gray-300 hover:bg-gray-400 rounded text-gray-800 text-sm shadow transition"
        >
          Edit Preps
        </button>
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
            onToggleCollapse={(pid) =>
              setCollapsedPreps(cp => ({ ...cp, [pid]: !cp[pid] }))
            }
            onCopy={handleCopy}
            onPaste={handlePaste}
            onChangeTitle={(pid, value) =>
              setPrepData(pd => ({ ...pd, [pid]: { ...pd[pid], title: value } }))
            }
            onChangePerformanceGoal={(pid, value) =>
              setPrepData(pd => ({ ...pd, [pid]: { ...pd[pid], performanceGoal: value } }))
            }
            onChangeObjective={(pid, value) =>
              setPrepData(pd => ({ ...pd, [pid]: { ...pd[pid], objective: value } }))
            }
            onChangeStandards={(pid, values) =>
              setPrepData(pd => ({ ...pd, [pid]: { ...pd[pid], standards: values } }))
            }
            onEditPrepStep={(pid, i, value) =>
              setPrepData(pd => {
                const arr = [...(pd[pid]?.prepSteps || [])];
                arr[i] = value;
                return { ...pd, [pid]: { ...pd[pid], prepSteps: arr } };
              })
            }
            onRemovePrepStep={(pid, i) =>
              setPrepData(pd => {
                const arr = (pd[pid]?.prepSteps || []).filter((_, j) => j !== i);
                const chk = (pd[pid]?.prepDone || []).filter((_, j) => j !== i);
                return {
                  ...pd,
                  [pid]: { ...pd[pid], prepSteps: arr.length ? arr : [""], prepDone: chk.length ? chk : [] }
                };
              })
            }
            onAddPrepStep={(pid) =>
              setPrepData(pd => ({
                ...pd,
                [pid]: {
                  ...pd[pid],
                  prepSteps: [...(pd[pid]?.prepSteps || []), ""],
                  prepDone: [...(pd[pid]?.prepDone || []), false]
                }
              }))
            }
            onEditSeqStep={(pid, i, value) =>
              setPrepData(pd => {
                const arr = [...(pd[pid]?.seqSteps || [])];
                arr[i] = value;
                return { ...pd, [pid]: { ...pd[pid], seqSteps: arr } };
              })
            }
            onRemoveSeqStep={(pid, i) =>
              setPrepData(pd => {
                const arr = (pd[pid]?.seqSteps || []).filter((_, j) => j !== i);
                const chk = (pd[pid]?.seqDone || []).filter((_, j) => j !== i);
                return {
                  ...pd,
                  [pid]: { ...pd[pid], seqSteps: arr.length ? arr : [""], seqDone: chk.length ? chk : [] }
                };
              })
            }
            onAddSeqStep={(pid) =>
              setPrepData(pd => ({
                ...pd,
                [pid]: {
                  ...pd[pid],
                  seqSteps: [...(pd[pid]?.seqSteps || []), ""],
                  seqDone: [...(pd[pid]?.seqDone || []), false]
                }
              }))
            }
            /* Reorder handlers (for drag-and-drop later) */
            onReorderPrepStep={(pid, from, to) =>
              setPrepData(pd => {
                const steps = [...(pd[pid]?.prepSteps || [])];
                const done = [...(pd[pid]?.prepDone || [])];
                if (from < 0 || to < 0 || from >= steps.length || to >= steps.length) return pd;
                const [s] = steps.splice(from, 1);
                steps.splice(to, 0, s);
                const [d] = done.splice(from, 1);
                done.splice(to, 0, d);
                return { ...pd, [pid]: { ...pd[pid], prepSteps: steps, prepDone: done } };
              })
            }
            onReorderSeqStep={(pid, from, to) =>
              setPrepData(pd => {
                const steps = [...(pd[pid]?.seqSteps || [])];
                const done = [...(pd[pid]?.seqDone || [])];
                if (from < 0 || to < 0 || from >= steps.length || to >= steps.length) return pd;
                const [s] = steps.splice(from, 1);
                steps.splice(to, 0, s);
                const [d] = done.splice(from, 1);
                done.splice(to, 0, d);
                return { ...pd, [pid]: { ...pd[pid], seqSteps: steps, seqDone: done } };
              })
            }
          />
        );
      })}

      {error && (
        <p className="text-red-600 font-semibold" aria-live="polite">
          {error}
        </p>
      )}
      {success && (
        <p className="text-green-600 font-semibold" aria-live="polite">
          Saved!
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="px-8 py-2 bg-gray-700 hover:bg-gray-900 text-white rounded-lg font-bold shadow transition"
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </form>
  );

  // Single wrapper, single modal
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
