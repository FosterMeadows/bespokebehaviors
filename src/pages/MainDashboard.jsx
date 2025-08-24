import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CalendarDays,
  CheckSquare,
  NotebookPen,
  PlusCircle,
  ArrowRight,
} from "lucide-react";

import { AuthContext } from "../AuthContext.jsx";
import { db } from "../firebaseConfig";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from "firebase/firestore";

import { makeDateKey, formatPrettyDate, formatWeekday } from "../utils/date";

/* ---- UI shells ---- */
function Card({ title, icon: Icon, action, children }) {
  return (
    <div className="rounded-2xl border border-sky-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-sky-100 px-4 py-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-5 w-5 text-sky-600" />}
          <h3 className="text-sm font-semibold text-sky-900">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Line({ label, children }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-sky-400" />
      <div className="min-w-0">
        {label && <div className="text-xs font-medium text-sky-600">{label}</div>}
        <div className="text-sm text-sky-900">{children}</div>
      </div>
    </div>
  );
}

/* ---- minimal date parser for plans ---- */
function parseMaybeDate(raw, fallbackFromId) {
  if (raw?.toDate) return raw.toDate();
  if (typeof raw === "string" && /^\d{2}\.\d{2}\.\d{4}$/.test(raw)) {
    const [m, d, y] = raw.split(".").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d;
  if (typeof fallbackFromId === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fallbackFromId)) {
    const [Y, M, D] = fallbackFromId.split("-").map(Number);
    return new Date(Y, M - 1, D);
  }
  return new Date();
}

export default function Dashboard() {
  const { user } = useContext(AuthContext);
  const today = useMemo(() => new Date(), []);
  const dateKey = useMemo(() => makeDateKey(today), [today]);

  const [plans, setPlans] = useState(null);
  const [checklistTop, setChecklistTop] = useState([]);
  const [latestNote, setLatestNote] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function run() {
      if (!user) return;
      setLoading(true);
      try {
        /* 1) Today’s plan snapshot */
        const planRef = doc(db, "teachers", user.uid, "dailyPlans", dateKey);
        const planSnap = await getDoc(planRef);
        const planData = planSnap.exists() ? planSnap.data() : null;

        /* 2) Checklist highlights from MegaChecklist (done=false, newest first) */
        const itemsCol = collection(db, "teachers", user.uid, "checklist");
        let clRows = [];
        try {
          const clq = query(itemsCol, where("done", "==", false), orderBy("createdAt", "desc"), limit(3));
          const clSnap = await getDocs(clq);
          clRows = clSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch {
          const clq = query(itemsCol, where("done", "==", false), limit(3));
          const clSnap = await getDocs(clq);
          clRows = clSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        /* 3) Latest Note (tries teacherNotes, then notes) */
        let noteDoc = null;
        try {
          const tnCol = collection(db, "teachers", user.uid, "teacherNotes");
          const tnQ = query(tnCol, orderBy("createdAt", "desc"), limit(1));
          const tnSnap = await getDocs(tnQ);
          if (!tnSnap.empty) noteDoc = { id: tnSnap.docs[0].id, ...tnSnap.docs[0].data() };
        } catch {
          /* ignore and try fallback */
        }
        if (!noteDoc) {
          try {
            const nCol = collection(db, "teachers", user.uid, "notes");
            const nQ = query(nCol, orderBy("createdAt", "desc"), limit(1));
            const nSnap = await getDocs(nQ);
            if (!nSnap.empty) noteDoc = { id: nSnap.docs[0].id, ...nSnap.docs[0].data() };
          } catch {
            /* nothing to show, which is fine */
          }
        }

        if (!isMounted) return;
        setPlans(planData);
        setChecklistTop(clRows);
        setLatestNote(noteDoc);
      } catch (e) {
        console.error("Dashboard load error:", e);
        if (!isMounted) return;
        setPlans(null);
        setChecklistTop([]);
        setLatestNote(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    run();
    return () => {
      isMounted = false;
    };
  }, [user, dateKey]);

  const preps = useMemo(() => {
    if (!plans?.preps) return [];
    return Object.values(plans.preps)
      .filter(Boolean)
      .map(p => ({
        id: p.id || p.name,
        name: p.name || "Prep",
        objective: p.objective || "",
        performanceGoal: p.performanceGoal || ""
      }));
  }, [plans]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-sky-600">
            {formatWeekday(today)} • {formatPrettyDate(today)}
          </div>
          <h1 className="text-2xl font-bold text-sky-900">Dashboard</h1>
          <p className="mt-1 text-sm text-sky-700">
            Today’s plan, your top tasks, and your latest note. Everything else can wait.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            to="/dailyplan"
            className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            <PlusCircle className="h-4 w-4" />
            New Plan
          </Link>
          <Link
            to="/teachernotes"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-sky-900 ring-1 ring-sky-300 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            <NotebookPen className="h-4 w-4" />
            Quick Note
          </Link>
          <Link
            to="/gradecalculator"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-sky-900 ring-1 ring-sky-300 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            <CheckSquare className="h-4 w-4" />
            Calculator
          </Link>
        </div>
      </div>

      {/* Single column stack: Today -> Checklist -> Latest Note */}
      <div className="grid grid-cols-1 gap-6">
        <Card
          title="Today at a Glance"
          icon={CalendarDays}
          action={
            <Link
              to="/dailyplan"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-sky-900 ring-1 ring-sky-300 hover:bg-sky-50"
            >
              Open Daily Plan <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {loading ? (
            <div className="text-sm text-sky-700">Loading plans…</div>
          ) : preps.length === 0 ? (
            <div className="text-sm text-sky-700">
              No plan found for today. Start one from the button above.
            </div>
          ) : (
            <div className="space-y-4">
              {preps.map(p => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-sky-100 bg-sky-50/50 p-3"
                >
                  <div className="mb-1 text-sm font-semibold text-sky-900">{p.name}</div>
                  {p.objective && (
                    <Line label="Objective">
                      <span className="line-clamp-2">{p.objective}</span>
                    </Line>
                  )}
                  {p.performanceGoal && (
                    <div className="mt-2">
                      <Line label="Performance Goal">
                        <span className="line-clamp-2">{p.performanceGoal}</span>
                      </Line>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Checklist Highlights"
          icon={CheckSquare}
          action={
            <Link
              to="/megachecklist"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-sky-900 ring-1 ring-sky-300 hover:bg-sky-50"
            >
              Open Checklist <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {loading ? (
            <div className="text-sm text-sky-700">Checking tasks…</div>
          ) : checklistTop.length === 0 ? (
            <div className="text-sm text-sky-700">Nothing urgent. Enjoy the suspicious silence.</div>
          ) : (
            <ul className="space-y-2">
              {checklistTop.map(item => (
                <li key={item.id} className="flex items-start gap-2">
                  <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
                  <div className="min-w-0">
                    <div className="text-sm text-sky-900">
                      {item.text || "Untitled task"}
                    </div>
                    <div className="text-xs text-sky-600">
                      {item.createdAt?.toDate?.()
                        ? item.createdAt.toDate().toLocaleString()
                        : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Latest Note"
          icon={NotebookPen}
          action={
            <Link
              to="/teachernotes"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-sky-900 ring-1 ring-sky-300 hover:bg-sky-50"
            >
              Open Notes <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {loading ? (
            <div className="text-sm text-sky-700">Fetching note…</div>
          ) : !latestNote ? (
            <div className="text-sm text-sky-700">No notes yet. Write one before the next fire drill.</div>
          ) : (
            <div className="space-y-1">
              {latestNote.title && (
                <div className="text-sm font-semibold text-sky-900">
                  {latestNote.title}
                </div>
              )}
              <div className="text-sm text-sky-900 whitespace-pre-wrap line-clamp-6">
                {latestNote.text || latestNote.body || "(empty note)"}
              </div>
              <div className="text-xs text-sky-600">
                {latestNote.createdAt?.toDate?.()
                  ? latestNote.createdAt.toDate().toLocaleString()
                  : ""}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
