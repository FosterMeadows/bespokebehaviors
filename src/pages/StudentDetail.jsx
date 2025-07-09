import React, { useEffect, useState, useContext } from "react";
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
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    })();
  }, [user, name]);

  const displayReports = reports.slice(0, 6);
  const total = displayReports.length;

  // Map step number to parentContacted boolean if provided
  const contactStatus = {};
  displayReports.forEach((r, idx) => {
    const num = total - idx;
    if (typeof r.parentContacted !== 'undefined') {
      contactStatus[num] = Boolean(r.parentContacted);
    }
  });

  const sectionBg = { 1: "bg-green-50", 2: "bg-lime-50", 3: "bg-yellow-50", 4: "bg-orange-50", 5: "bg-amber-50", 6: "bg-red-50" };
  const badgeColors = { 1: "bg-green-300 text-green-900", 2: "bg-lime-300 text-lime-900", 3: "bg-yellow-300 text-yellow-900", 4: "bg-orange-300 text-orange-900", 5: "bg-amber-300 text-amber-900", 6: "bg-red-300 text-red-900" };
  const bubbleColors = { 1: "bg-green-200 text-green-800", 2: "bg-lime-200 text-lime-800", 3: "bg-yellow-200 text-yellow-800", 4: "bg-orange-200 text-orange-800", 5: "bg-amber-200 text-amber-800", 6: "bg-red-200 text-red-800" };

  const formatDate = iso => {
    const d = new Date(iso);
    return `${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}.${d.getFullYear()}`;
  };

  // Open delete confirmation
  const confirmDelete = id => setDeleteModal({ show: true, id });
  // Perform deletion
  const handleDelete = async () => {
    const { id } = deleteModal;
    await deleteDoc(doc(db, "reports", id));
    setReports(prev => prev.filter(r => r.id !== id));
    setDeleteModal({ show: false, id: null });
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Styled Header */}
      <div className="flex items-center justify-between mb-4 bg-blue-50 p-4 rounded-md">
        <h2 className="text-2xl font-bold">Reports for {name}</h2>
        <Link to="/student" className="text-blue-600 hover:text-blue-800 font-medium text-sm">
          ← Back to search
        </Link>
      </div>

      {/* Progress */}
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300" />
        </div>
        <div className="relative flex justify-between">
          {Array.from({ length: 6 }, (_, i) => {
            const step = i + 1;
            const filled = step <= total;
            const cls = filled ? bubbleColors[step] : "bg-white border-2 border-gray-300 text-gray-500";
            return (
              <div key={step} className="flex flex-col items-center">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold ${cls}`}>
                  {step}
                </div>
                {/* Parent contact indicator under bubble #3 */}
                {step === 3 && step <= total && (step in contactStatus) && (
                  <div
                    className={`h-2 w-2 rounded-full mt-1 ${
                      contactStatus[3] ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : total === 0 ? (
        <p>No reports found for {name}.</p>
      ) : (
        <div className="space-y-6">
          {displayReports.map((r, idx) => {
            const num = total - idx;
            const bg = sectionBg[num];
            const badge = badgeColors[num];
            const ring = bg.replace("bg-", "ring-");
            return (
              <div key={r.id} className="bg-white shadow rounded overflow-hidden">
                {/* Card Header with Date and Delete X */}
                <div className={`${bg} flex items-center justify-between p-4 border-b`}>
                  <span className={`px-4 py-2 rounded-full text-base font-semibold ${badge} ring-2 ${ring}`}>
                    Reteach #{num}
                  </span>
                  <div className="flex items-center space-x-4">
                    <span className="text-gray-600 text-sm">{formatDate(r.date)}</span>
                    <button
                      onClick={() => confirmDelete(r.id)}
                      className="text-red-600 hover:text-red-700 font-bold text-lg"
                      title="Delete report"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {/* Info Section */}
                <div className="p-4 text-sm text-gray-700 space-y-2">
                  <p><span className="font-medium">Grade:</span> {r.gradeLevel}</p>
                  <p><span className="font-medium">Location:</span> {r.location}</p>
                  <p><span className="font-medium">Assigning Teacher:</span> {r.teacherName}</p>
                </div>
                {/* Details Section */}
                <div className={`${bg} p-4 border-t`}>
                  <p className="text-sm text-gray-700"><span className="font-medium">Details:</span> {r.referralDetails}</p>
                </div>
                {/* Teacher Comment */}
                {r.comment && (
                  <div className={`${bg} p-4 border-t`}>
                    <p className="text-sm text-gray-700"><span className="font-medium">Teacher Comment:</span> {r.comment}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded shadow-lg max-w-sm mx-auto">
            <h3 className="text-lg font-semibold mb-4">Confirm Deletion</h3>
            <p className="mb-6">Are you sure you want to delete this report? This action cannot be undone.</p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setDeleteModal({ show: false, id: null })}
                className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
