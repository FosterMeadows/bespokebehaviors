// components/SharePage.jsx
import { useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  getDocs,
  query,
  where,
  limit,
  orderBy,
} from "firebase/firestore";
import PrepView from "../components/DailyPlan/PrepView";
import ela8 from "../data/standards/ela8.json";

// simple fallback pastels
const PASTELS = [
  { bg: "hsl(200, 60%, 90%)", text: "hsl(200, 50%, 40%)" },
  { bg: "hsl(160, 60%, 90%)", text: "hsl(160, 50%, 32%)" },
  { bg: "hsl(40, 80%, 92%)", text: "hsl(40, 50%, 38%)" },
  { bg: "hsl(280, 60%, 92%)", text: "hsl(280, 45%, 40%)" },
];

export default function SharePage() {
  const { token } = useParams();
  const [status, setStatus] = useState("loading"); // loading | ready | notfound | error
  const [plans, setPlans] = useState([]);
  const [teacherName, setTeacherName] = useState("");

  // build a quick code -> text index for standards
  const standardsIndex = useMemo(() => {
    const idx = {};
    (ela8 || []).forEach(s => { idx[s.code] = { text: s.text }; });
    return idx;
  }, []);

  useEffect(() => {
    async function fetchPlans() {
      try {
        // 1) find teacher by token
        const teachersSnap = await getDocs(
          query(
            collection(db, "teachers"),
            where("shareEnabled", "==", true),
            where("shareToken", "==", token),
            limit(1)
          )
        );
        if (teachersSnap.empty) {
          setStatus("notfound");
          return;
        }
        const teacherDoc = teachersSnap.docs[0];
        const teacherData = teacherDoc.data();
        setTeacherName(teacherData.displayName || "Shared Plans");

        // 2) load plans (newest first)
        const plansSnap = await getDocs(
          query(
            collection(db, "teachers", teacherDoc.id, "dailyPlans"),
            orderBy("dateKey", "desc")
          )
        );
        setPlans(plansSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setStatus("ready");
      } catch (err) {
        console.error(err);
        setStatus("error");
      }
    }
    fetchPlans();
  }, [token]);

  if (status === "loading") return <p className="p-6">Loading…</p>;
  if (status === "notfound") return <p className="p-6">This share link is invalid or disabled.</p>;
  if (status === "error") return <p className="p-6 text-red-600">Error loading plans.</p>;

  // no-op handlers so PrepView stays read-only here
  const noop = () => {};

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">{teacherName}</h1>
      <p className="text-sm text-gray-500">Read-only daily plans</p>

      <ul className="space-y-3">
        {plans.map((plan, planIdx) => {
          // support both [{...}] and { prep1: {...}, prep2: {...} }
          const prepList = Array.isArray(plan.preps)
            ? plan.preps.map((p, i) => ({ id: p.id || `prep${i + 1}`, name: p.name || `Prep ${i + 1}`, pastel: p.pastel, prep: p }))
            : Object.entries(plan.preps || {}).map(([id, p], i) => ({ id, name: p?.name || id, pastel: p?.pastel, prep: p }));

          return (
            <li key={plan.id} className="rounded-xl border p-4 bg-white shadow space-y-3">
              <div className="text-xs text-gray-500">{plan.dateKey}</div>
              <div className="text-lg font-semibold">{plan.title || "Daily Plan"}</div>

              {prepList.length === 0 ? (
                <div className="text-sm text-gray-500">No sections found for this day.</div>
              ) : (
                <div className="space-y-4">
                  {prepList.map((item, i) => {
                    const pastel = item.pastel || PASTELS[i % PASTELS.length];
                    return (
                      <PrepView
                        key={item.id}
                        id={item.id}
                        name={item.name}
                        pastel={pastel}
                        prep={item.prep || {}}
                        standardsIndex={standardsIndex}
                        collapsed={false}
                        onToggleCollapse={noop}
                        onTogglePrep={noop}
                        onToggleSeq={noop}
                      />
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
