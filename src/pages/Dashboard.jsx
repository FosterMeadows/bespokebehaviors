import React, { useEffect, useState, useContext } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  doc,
  deleteField,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { AuthContext } from "../AuthContext.jsx";

export default function Dashboard() {
  const { user, profile } = useContext(AuthContext);
  const [pending, setPending] = useState([]);
  const [onDeck, setOnDeck] = useState([]);
  const [comments, setComments] = useState({});
  const [loading, setLoading] = useState(true);
  const [showDuplicateToast, setShowDuplicateToast] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [currentReport, setCurrentReport] = useState(null);
  const [draftComment, setDraftComment] = useState("");

  // Compute today’s key once: "MM.DD.YYYY"
  const today = new Date();
  const todayKey = [
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
    today.getFullYear(),
  ].join(".");

  // Fetch reports and split into on-deck vs pending
  useEffect(() => {
    if (!user || profile === null) return;
    setLoading(true);
    (async () => {
      const baseConstraints = [
        where("served", "==", false),
        orderBy("timestamp", "desc"),
      ];
      if (Array.isArray(profile.gradeLevels) && profile.gradeLevels.length) {
        const grades = profile.gradeLevels.map((g) => String(g));
        baseConstraints.push(where("gradeLevel", "in", grades));
      }
      const q = query(collection(db, "reports"), ...baseConstraints);
      const snap = await getDocs(q);
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOnDeck(all.filter((r) => r.assignedDate === todayKey));
      setPending(all.filter((r) => r.assignedDate !== todayKey));
      const init = {};
      all.forEach((r) => { init[r.id] = r.comment || ""; });
      setComments(init);
      setLoading(false);
    })();
  }, [user, profile, todayKey]);

  // Format a "YYYY-MM-DD" string to "MM.DD.YYYY"
  const formatYMD = (ymd) => {
    const [year, month, day] = ymd.split("-");
    return `${month}.${day}.${year}`;
  };

  // Open comment modal
  const openCommentModal = (report) => {
    setCurrentReport(report);
    setDraftComment(comments[report.id] || "");
    setShowCommentModal(true);
  };

  // Save comment from modal
  const saveComment = async () => {
    const rid = currentReport.id;
    await updateDoc(doc(db, "reports", rid), { comment: draftComment });
    setComments(prev => ({ ...prev, [rid]: draftComment }));
    setShowCommentModal(false);
  };

  // Assign / unassign and serve
  const addToDeck = async (report) => {
    if (onDeck.some(r => r.studentName === report.studentName)) {
      setShowDuplicateToast(true);
      setTimeout(() => setShowDuplicateToast(false), 3000);
      return;
    }
    await updateDoc(doc(db, "reports", report.id), { assignedDate: todayKey });
    setOnDeck(d => [...d, report]);
    setPending(p => p.filter(r => r.id !== report.id));
  };

  const removeFromDeck = async (reportId) => {
    await updateDoc(doc(db, "reports", reportId), { assignedDate: deleteField() });
    setOnDeck(d => d.filter(r => r.id !== reportId));
    setPending(p => [...p, onDeck.find(r => r.id === reportId)]);
  };

  const handleServe = async (reportId) => {
    await updateDoc(doc(db, "reports", reportId), {
      served: true,
      servedDate: todayKey,
      assignedDate: deleteField(),
    });
    setOnDeck(d => d.filter(r => r.id !== reportId));
  };

  if (!user || profile === null || loading) {
    return (
      <div className="max-w-screen-xl mx-auto px-6 py-6 text-center text-gray-600">
        Loading…
      </div>
    );
  }

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-6">
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>

      {/* On-deck Tray */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Serving Today (CORE)</h2>
        {onDeck.length === 0 ? (
          <p className="text-gray-500">No students assigned for today.</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {onDeck.map(r => (
              <div key={r.id} className="bg-white shadow rounded p-2 flex items-center">
                <span className="text-sm font-medium pr-4 truncate max-w-xs">{r.studentName}</span>
                <button onClick={() => handleServe(r.id)} className="p-2 bg-green-500 text-white rounded hover:bg-green-600">✔</button>
                <button onClick={() => openCommentModal(r)} className="ml-2 p-2 bg-yellow-500 text-white rounded hover:bg-yellow-600">✏️</button>
                <button onClick={() => removeFromDeck(r.id)} className="ml-2 p-2 bg-red-500 text-white rounded hover:bg-red-600">✕</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Students to Serve */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Students to Serve</h2>
        {pending.length === 0 ? (
          <p className="text-gray-600">All caught up! No pending reteaches.</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {pending.map(r => (
              <div key={r.id} className="bg-white shadow rounded overflow-hidden flex-shrink-0">
                <div className="bg-gray-50 p-4 flex items-center justify-between border-b">
                  <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-sm font-medium mr-4">{r.studentName}</span>
                  <span className="text-gray-600 text-sm whitespace-nowrap">Date Assigned: {formatYMD(r.date)}</span>
                </div>
                <div className="p-4 text-sm text-gray-700 space-y-1">
                  <p><span className="font-medium">Location:</span> {r.location}</p>
                  <p><span className="font-medium">Assigning Teacher:</span> {r.teacherName}</p>
                  <p><span className="font-medium">Details:</span> {r.referralDetails}</p>
                </div>
                <div className="p-4 border-t">
                  <button onClick={() => addToDeck(r)} disabled={onDeck.some(x => x.id === r.id)} className={`w-full px-3 py-1 rounded text-sm font-medium ${onDeck.some(x => x.id === r.id) ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
                    {onDeck.some(x => x.id === r.id) ? "On Deck" : "Add to Today"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Duplicate Error Toast */}
      {showDuplicateToast && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded shadow-lg">
          Student is already on deck!
        </div>
      )}

      {/* Comment Modal */}
      {showCommentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded p-6 w-96 shadow-lg">
            <h3 className="text-lg font-semibold mb-2">Add Comment</h3>
            <textarea
              value={draftComment}
              onChange={e => setDraftComment(e.target.value)}
              className="w-full h-24 border rounded p-2 mb-4"
            />
            <div className="flex justify-end space-x-2">
              <button onClick={() => setShowCommentModal(false)} className="px-4 py-2">Cancel</button>
              <button onClick={saveComment} className="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
