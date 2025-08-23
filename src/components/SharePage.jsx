import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { db } from "../firebaseConfig";
import { collection, getDocs, query, where, limit, doc, getDoc, orderBy } from "firebase/firestore";

export default function SharePage() {
  const { token } = useParams();
  const [status, setStatus] = useState("loading");
  const [plans, setPlans] = useState([]);
  const [teacherName, setTeacherName] = useState("");

  useEffect(() => {
    async function fetchPlans() {
      try {
        // step 1: look up teacher by token
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

        // step 2: fetch that teacher's dailyPlans
        const plansSnap = await getDocs(
          query(
            collection(db, "teachers", teacherDoc.id, "dailyPlans"),
            orderBy("dateKey", "desc")
          )
        );
        setPlans(plansSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
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

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">{teacherName}</h1>
      <p className="text-sm text-gray-500">Read-only daily plans</p>
      <ul className="space-y-3">
        {plans.map((plan) => (
          <li key={plan.id} className="rounded-xl border p-4 bg-white shadow">
            <div className="text-xs text-gray-500">{plan.dateKey}</div>
            <div className="text-lg font-medium">{plan.title || "Untitled Plan"}</div>
            {/* expand to show whatever fields you already render in your internal plan view */}
          </li>
        ))}
      </ul>
    </div>
  );
}
