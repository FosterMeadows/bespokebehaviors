import React, { useContext, useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { AuthContext } from "../AuthContext.jsx";
import { useReports } from "../hooks/useReports.jsx";

export default function StudentDetail() {
  const { name } = useParams();
  const { user, profile } = useContext(AuthContext);

  // 1) My own reports for this student
  const {
    reports: myReports,
    loading: loadingMy,
    error: errorMy,
  } = useReports({ studentName: name });

  // 2) Shared reports for this student (grade-level)
  const [sharedReports, setSharedReports] = useState([]);
  const [loadingShared, setLoadingShared] = useState(true);
  const [errorShared, setErrorShared] = useState(null);

  useEffect(() => {
    if (!profile?.gradeLevels?.length) {
      setSharedReports([]);
      setLoadingShared(false);
      return;
    }
    setLoadingShared(true);
    const grades = profile.gradeLevels.map((g) => String(g));
    const q = query(
      collection(db, "reports"),
      where("gradeLevel", "in", grades),
      where("studentName", "==", name),
      orderBy("date", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setSharedReports(data);
        setLoadingShared(false);
      },
      (err) => {
        console.error("Shared reports listener failed:", err);
        setErrorShared(err);
        setLoadingShared(false);
      }
    );
    return unsub;
  }, [profile, name]);

  // 3) Combine & sort reports, then slice to most recent 6
  const allReports = useMemo(() => {
    const map = new Map();
    sharedReports.forEach((r) => map.set(r.id, r));
    myReports.forEach((r) => map.set(r.id, r));
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
  }, [sharedReports, myReports]);

  const loading = loadingMy || loadingShared;
  const error = errorMy || errorShared;
  const total = allReports.length;
  const display = allReports.slice(0, 6);

  const [deleteId, setDeleteId] = useState(null);
  const confirmDelete = (id) => setDeleteId(id);
  const handleDelete = async () => {
    if (!deleteId) return;
    await updateDoc(doc(db, "reports", deleteId), { served: true });
    setDeleteId(null);
  };

  if (loading) return <p className="text-lg">Loading…</p>;
  if (error) return <p className="text-red-600">Error loading reports.</p>;
  if (total === 0)
    return <p className="text-lg">No reports found for {name}.</p>;

  // Helpers for styling
  const formatDate = (iso) => {
    const d = new Date(iso);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${m}.${day}.${d.getFullYear()}`;
  };
  const sectionBg = {
    1: "bg-green-50",
    2: "bg-lime-50",
    3: "bg-yellow-50",
    4: "bg-orange-50",
    5: "bg-amber-50",
    6: "bg-red-50",
  };
  const badgeColors = {
    1: "bg-green-300 text-green-900",
    2: "bg-lime-300 text-lime-900",
    3: "bg-yellow-300 text-yellow-900",
    4: "bg-orange-300 text-orange-900",
    5: "bg-amber-300 text-amber-900",
    6: "bg-red-300 text-red-900",
  };
  const bubbleColors = {
    1: "bg-green-200 text-green-800",
    2: "bg-lime-200 text-lime-800",
    3: "bg-yellow-200 text-yellow-800",
    4: "bg-orange-200 text-orange-800",
    5: "bg-amber-200 text-amber-800",
    6: "bg-red-200 text-red-800",
  };

  // Track parentContacted per step
  const contactStatus = {};
  display.forEach((r, idx) => {
    const step = total - idx;
    if (r.parentContacted !== undefined) {
      contactStatus[step] = Boolean(r.parentContacted);
    }
  });

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 bg-blue-50 p-4 rounded-md">
        <h2 className="text-2xl font-bold">Reports for {name}</h2>
        <Link
          to="/student"
          className="text-blue-600 hover:text-blue-800 font-medium text-sm"
        >
          ← Back to search
        </Link>
      </div>

      {/* Progress bubbles */}
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300" />
        </div>
        <div className="relative flex justify-between">
          {Object.keys(sectionBg).map((i) => {
            const step = Number(i);
            const filled = step <= total;
            const cls = filled
              ? bubbleColors[step]
              : "bg-white border-2 border-gray-300 text-gray-500";
            return (
              <div key={step} className="flex flex-col items-center">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold ${cls}`}
                >
                  {step}
                </div>
                {step === 3 && contactStatus[3] !== undefined && (
                  <div
                    className={`h-2 w-2 rounded-full mt-1 ${
                      contactStatus[3] ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Reteach cards */}
      <div className="space-y-6">
        {display.map((r, idx) => {
          const num = total - idx;
          const bg = sectionBg[num];
          const badge = badgeColors[num];
          const ring = bg.replace("bg-", "ring-");
          return (
            <div key={r.id} className="bg-white shadow rounded overflow-hidden">
              <div className={`${bg} flex items-center justify-between p-4 border-b`}>
                <span
                  className={`px-4 py-2 rounded-full text-base font-semibold ${badge} ring-2 ${ring}`}
                >
                  Reteach #{num}
                </span>
                <div className="flex items-center space-x-4">
                  <span className="text-gray-600 text-sm">{formatDate(r.date)}</span>
                  <button
                    onClick={() => confirmDelete(r.id)}
                    className="text-red-600 hover:text-red-700 font-bold text-lg"
                    title="Mark served"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="p-4 text-sm text-gray-700 space-y-2">
                <p>
                  <span className="font-medium">Grade:</span> {r.gradeLevel}
                </p>
                <p>
                  <span className="font-medium">Location:</span> {r.location}
                </p>
                <p>
                  <span className="font-medium">Assigning Teacher:</span> {r.teacherName}
                </p>
              </div>
              <div className={`${bg} p-4 border-t`}>
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Details:</span> {r.referralDetails}
                </p>
              </div>
              {/* Third reteach contact info */}
              {num === 3 && (
                <div className={`${bg} p-4 border-t space-y-2`}>
                  <p>
                    <span className="font-medium">Parent Contacted:</span>{" "}
                    {r.parentContacted ? "Yes" : "No"}
                  </p>
                  {r.parentContacted && (
                    <>
                      <p>
                        <span className="font-medium">Who:</span> {r.contactPerson}
                      </p>
                      <p>
                        <span className="font-medium">Method:</span> {r.contactMethod}
                      </p>
                    </>
                  )}
                </div>
              )}
              {r.comment && (
                <div className={`${bg} p-4 border-t`}>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">Teacher Comment:</span> {r.comment}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
