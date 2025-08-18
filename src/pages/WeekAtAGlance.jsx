// src/pages/WeekAtAGlance.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../AuthContext.jsx";
import { db } from "../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import * as plansSvc from "../services/plans";
import { makeDateKey } from "../utils/date";

const PREP_DEFAULTS = [
  { id: "prep1", name: "Regular ELA" },
  { id: "prep2", name: "Honors ELA" },
];

// --- local date helpers (keeps utils/date untouched) ---
function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = x.getDay(); // 0=Sun..6=Sat
  const diff = (wd === 0 ? -6 : 1) - wd; // move to Monday
  x.setDate(x.getDate() + diff);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function toParam(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}.${day}.${d.getFullYear()}`;
}
function fmtColHeader(d) {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  });
}
function isSameYMD(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function WeekAtAGlance() {
  const { user } = useContext(AuthContext);
  const uid = user?.uid;

  const location = useLocation();
  const navigate = useNavigate();

  // Anchor the week on an incoming ?date=MM.DD.YYYY or today
  const paramDate = useMemo(() => {
    const raw = new URLSearchParams(location.search).get("date");
    if (raw && /^\d{2}\.\d{2}\.\d{4}$/.test(raw)) {
      const [m, d, y] = raw.split(".").map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  }, [location.search]);

  const [anchorDate, setAnchorDate] = useState(paramDate);
  const monday = useMemo(() => mondayOf(anchorDate), [anchorDate]);
  const days = useMemo(() => [0, 1, 2, 3, 4].map((i) => addDays(monday, i)), [monday]);
  const dateKeys = useMemo(() => days.map(makeDateKey), [days]);

  const [preps, setPreps] = useState(PREP_DEFAULTS);
  const [plansByKey, setPlansByKey] = useState({});
  const [loading, setLoading] = useState(true);

  // today for highlighting
  const today = useMemo(() => new Date(), []);
  const isTodayIdx = (i) => isSameYMD(days[i], today);

  // Load user's prep names (same as Daily view)
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

  // Load five plans (Mon–Fri) using existing service
  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    (async () => {
      try {
        const results = await Promise.all(dateKeys.map((k) => plansSvc.getDailyPlan(uid, k)));
        const map = {};
        results.forEach((plan, i) => {
          map[dateKeys[i]] = plan;
        });
        setPlansByKey(map);
      } finally {
        setLoading(false);
      }
    })();
  }, [uid, /* stable dep */ JSON.stringify(dateKeys)]);

  const changeWeek = (deltaWeeks) => {
    const next = addDays(monday, deltaWeeks * 7);
    setAnchorDate(next);
    navigate(`?date=${toParam(next)}`, { replace: true });
  };

  const jumpToThisWeek = () => {
    const now = new Date();
    const mon = mondayOf(now);
    setAnchorDate(mon);
    navigate(`?date=${toParam(mon)}`, { replace: true });
  };

  if (loading) return <div className="p-6 text-center">Loading…</div>;

  return (
    <div className="min-h-screen py-10 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        {/* Header / Nav */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => changeWeek(-1)}
              className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition"
            >
              ← Prev
            </button>
            <button
              onClick={jumpToThisWeek}
              className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition"
              title="Jump to this week"
            >
              This Week
            </button>
            <button
              onClick={() => changeWeek(1)}
              className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition"
            >
              Next →
            </button>
          </div>

          <h1 className="text-2xl font-bold tracking-tight">
            Week of{" "}
            <span className="inline-block rounded-lg bg-indigo-50 px-2 py-0.5 text-indigo-700">
              {monday.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
            </span>
          </h1>

          <div className="flex gap-2">
            <Link
              to={{ pathname: "/dailyplan", search: `?date=${toParam(anchorDate)}` }}
              className="px-3 py-1 rounded-lg bg-yellow-400 text-white hover:bg-yellow-500 active:bg-yellow-600 transition shadow-sm"
            >
              Day view
            </Link>
          </div>
        </div>

        {/* Matrix */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-white sticky top-0 z-10">
              <tr className="border-b border-gray-200">
                <th className="p-3 text-left w-48 font-semibold text-gray-600">Prep</th>
                {days.map((d, i) => {
                  const todayCol = isTodayIdx(i);
                  return (
                    <th
                      key={i}
                      className={`p-3 text-left font-semibold ${
                        todayCol ? "text-indigo-700 bg-indigo-50/60" : "text-gray-600"
                      }`}
                    >
                      <Link
                        to={{ pathname: "/dailyplan", search: `?date=${toParam(d)}` }}
                        className={`inline-flex items-center gap-2 rounded-md px-2 py-1 transition ${
                          todayCol
                            ? "bg-indigo-100 hover:bg-indigo-200"
                            : "hover:bg-gray-100"
                        }`}
                        title="Open day view"
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${
                            todayCol ? "bg-indigo-600" : "bg-gray-300 group-hover:bg-gray-400"
                          }`}
                        />
                        {fmtColHeader(d)}
                      </Link>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {preps.map(({ id, name }) => (
                <tr key={id} className="align-top">
                  {/* Prep name column */}
                  <td className="p-3 font-semibold text-gray-800 bg-gray-50/70 sticky left-0 z-10 border-r border-gray-200">
                    <div className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-gray-300" />
                      {name}
                    </div>
                  </td>

                  {/* Day cells */}
                  {days.map((_, i) => {
                    const k = dateKeys[i];
                    const plan = plansByKey[k];
                    const prep = plan?.preps?.[id];
                    const title = prep?.title?.trim();
                    const objective = prep?.objective?.trim();
                    const seq = (prep?.seqSteps || []).filter(Boolean);
                    const empty = !title && !objective && seq.length === 0;
                    const todayCol = isTodayIdx(i);

                    return (
                      <td
                        key={i}
                        className={`p-4 align-top transition-colors ${
                          todayCol ? "bg-indigo-50/40" : "bg-white"
                        } hover:bg-gray-50`}
                      >
                        {empty ? (
                          <div className="h-full min-h-[60px] flex items-center justify-center">
                            <span className="text-gray-300 select-none">—</span>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {title ? (
                              <div className="inline-flex items-center gap-2">
                                <span className="inline-flex items-center rounded-lg bg-sky-50 px-2 py-0.5 text-sky-700 font-medium shadow-sm">
                                  {title}
                                </span>
                              </div>
                            ) : null}

                            {objective ? (
                              <section className="rounded-lg border border-gray-200/70 bg-gray-50 px-3 py-2">
                                <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                                  Objective
                                </div>
                                <div className="text-gray-800 mt-0.5">{objective}</div>
                              </section>
                            ) : null}

                            {seq.length > 0 ? (
                              <section className="rounded-lg border border-gray-200/70 bg-white px-3 py-2">
                                <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                                  Sequence
                                </div>
                                <ul className="list-disc ml-5 mt-1 space-y-1 marker:text-gray-400">
                                  {seq.map((s, idx) => (
                                    <li key={idx} className="text-gray-800">
                                      {s}
                                    </li>
                                  ))}
                                </ul>
                              </section>
                            ) : null}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Subtle footer hint */}
        <div className="mt-3 text-xs text-gray-500 flex items-center justify-end gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-indigo-600" /> Today
        </div>
      </div>
    </div>
  );
}
