import React, { useState, useEffect, useContext } from "react";
import { useParams, Link } from "react-router-dom";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { AuthContext } from "../AuthContext.jsx";

export default function StudentDetail() {
  const { name } = useParams();
  const { user } = useContext(AuthContext);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState({ show: false, id: null });

  useEffect(() => {
    if (!user || !name) return;
    (async () => {
      setLoading(true);
      const q = query(
        collection(db, "reports"),
        where("studentName", "==", name),
        orderBy("timestamp", "desc")
      );
      const snap = await getDocs(q);
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    })();
  }, [user, name]);

  const displayReports = reports.slice(0, 6);
  const total = displayReports.length;

  // Style maps
  const sectionBg = { 1: "bg-green-50", 2: "bg-lime-50", 3: "bg-yellow-50", 4: "bg-orange-50", 5: "bg-amber-50", 6: "bg-red-50" };
  const badgeColors = { 1: "bg-green-300 text-green-900", 2: "bg-lime-300 text-lime-900", 3: "bg-yellow-300 text-yellow-900", 4: "bg-orange-300 text-orange-900", 5: "bg-amber-300 text-amber-900", 6: "bg-red-300 text-red-900" };
  const bubbleColors = { 1: "bg-green-200 text-green-800", 2: "bg-lime-200 text-lime-800", 3: "bg-yellow-200 text-yellow-800", 4: "bg-orange-200 text-orange-800", 5: "bg-amber-200 text-amber-800", 6: "bg-red-200 text-red-800" };

  // Format date as MM.DD.YYYY
  const formatDate = (iso) => {
    const d = new Date(iso);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const y = d.getFullYear();
    return `${m}.${day}.${y}`;
  };

  const confirmDelete = (id) => setDeleteModal({ show: true, id });
  const handleDelete = async () => {
    await deleteDoc(doc(db, "reports", deleteModal.id));
    setReports((prev) => prev.filter((r) => r.id !== deleteModal.id));
    setDeleteModal({ show: false, id: null });
  };

  if (loading) return <p className="text-lg">Loading…</p>;

  return (
    <div className="max-w-5xl mx-auto px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 bg-blue-50 p-6 rounded-md">
        <h2 className="text-3xl font-bold">Reports for {name}</h2>
        <Link to="/student" className="text-blue-600 hover:text-blue-800 font-medium text-base">
          ← Back to search
        </Link>
      </div>

      {/* Progress tracker with larger bubbles */}
      <div className="relative mb-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300" />
        </div>
        <div className="relative flex justify-between mb-6">
          {Array.from({ length: 6 }, (_, i) => {
            const step = i + 1;
            const filled = step <= total;
            const bubbleClass = filled ? bubbleColors[step] : "bg-white border-2 border-gray-300 text-gray-500";
            return (
              <div key={step} className="flex flex-col items-center">
                <div
                  className={`h-12 w-12 rounded-full flex items-center justify-center text-xl font-semibold ${bubbleClass}`}
                >
                  {step}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reports list */}
      {total === 0 ? (
        <p className="text-lg">No reports found for {name}.</p>
      ) : (
        <div className="space-y-6">
          {displayReports.map((r, idx) => {
            const num = total - idx;
            const bg = sectionBg[num];
            const badge = badgeColors[num];
            const ring = bg.replace("bg-", "ring-");
            return (
              <div key={r.id} className="bg-white shadow rounded overflow-hidden">
                <div className={`${bg} flex items-center justify-between p-6 border-b`}>
                  <span className={`px-5 py-2 rounded-full text-lg font-semibold ${badge} ring-2 ${ring}`}>Reteach #{num}</span>
                  <div className="flex items-center space-x-6">
                    <span className="text-gray-600 text-base">{formatDate(r.date)}</span>
                    <button onClick={() => confirmDelete(r.id)} className="text-red-600 hover:text-red-700 font-bold text-xl" title="Delete report">
                      ✕
                    </button>
                  </div>
                </div>
                <div className="p-6 text-base text-gray-700 space-y-3">
                  <p><span className="font-medium">Grade:</span> {r.gradeLevel}</p>
                  <p><span className="font-medium">Location:</span> {r.location}</p>
                  <p><span className="font-medium">Assigning Teacher:</span> {r.teacherName}</p>
                </div>
                <div className={`${bg} p-6 border-t`}>
                  <p className="text-base text-gray-700"><span className="font-medium">Details:</span> {r.referralDetails}</p>
                </div>
                {/* Append contact info on third reteach */}
                {num === 3 && (
                  <div className={`${bg} p-6 border-t space-y-2`}>
                    <p><span className="font-medium">Parent Contacted:</span> {r.parentContacted ? "Yes" : "No"}</p>
                    {r.parentContacted && (
                      <>
                        <p><span className="font-medium">Contact Person:</span> {r.contactPerson || "N/A"}</p>
                        <p><span className="font-medium">Contact Method:</span> {r.contactMethod || "N/A"}</p>
                      </>
                    )}
                  </div>
                )}
                {r.comment && (
                  <div className={`${bg} p-6 border-t`}>
                    <p className="text-base text-gray-700"><span className="font-medium">Teacher Comment:</span> {r.comment}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Deletion modal */}
      {deleteModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded shadow-lg max-w-md mx-auto">
            <h3 className="text-xl font-semibold mb-4">Confirm Deletion</h3>
            <p className="mb-6 text-base">Are you sure you want to delete this report? This action cannot be undone.</p>
            <div className="flex justify-end space-x-4">
              <button onClick={() => setDeleteModal({ show: false, id: null })} className="px-5 py-2 rounded bg-gray-200 hover:bg-gray-300">Cancel</button>
              <button onClick={handleDelete} className="px-5 py-2 rounded bg-red-600 text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
