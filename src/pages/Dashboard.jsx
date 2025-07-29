import React, { useEffect, useState, useContext, useMemo } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  deleteField,
} from "firebase/firestore";

import { db } from "../firebaseConfig";
import { AuthContext } from "../AuthContext.jsx";
import sleepyapple from "../assets/happygreen.svg";
import { useReports } from "../hooks/useReports.jsx";

export default function Dashboard() {
  const { user, profile } = useContext(AuthContext);
  const { reports, loading, error } = useReports(); // your own reports
  const [sharedReports, setSharedReports] = useState([]); // grade-level reports

  const [pending, setPending] = useState([]);
  const [onDeck, setOnDeck] = useState([]);
  const [comments, setComments] = useState({});
  const [showDuplicateToast, setShowDuplicateToast] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [currentReport, setCurrentReport] = useState(null);
  const [draftComment, setDraftComment] = useState("");

  // Card colors
  const [cardColors, setCardColors] = useState({});
  const genColor = () => {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 30%, 50%)`;
  };

  // Compute today's key once
  const today = new Date();
  const todayKey = [
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
    today.getFullYear(),
  ].join(".");

  // 1) Listen for shared (grade-level) reports
  useEffect(() => {
    if (!profile?.gradeLevels?.length) return;
    const grades = profile.gradeLevels.map((g) => String(g));

    // Firestore 'in' operator
    const sharedQ = query(
      collection(db, "reports"),
      where("gradeLevel", "in", grades),
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(
      sharedQ,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setSharedReports(data);
      },
      (err) => {
        console.error("Shared reports listener failed:", err);
      }
    );
    return unsubscribe;
  }, [profile?.gradeLevels]);

  // 2) Combine your reports + shared reports (dedupe by id)
  const allReports = useMemo(() => {
    const map = new Map();
    reports.forEach((r) => map.set(r.id, r));
    sharedReports.forEach((r) => {
      if (!map.has(r.id)) map.set(r.id, r);
    });
    return Array.from(map.values());
  }, [reports, sharedReports]);

  // 3) Recompute pending/onDeck whenever allReports or profile changes
  useEffect(() => {
    if (!profile) return;
    const grades =
      Array.isArray(profile.gradeLevels) && profile.gradeLevels.length
        ? profile.gradeLevels.map((g) => String(g))
        : null;

    // Only unserved + matching grades
    const filtered = allReports.filter(
      (r) => !r.served && (!grades || grades.includes(r.gradeLevel))
    );

    setOnDeck(filtered.filter((r) => r.assignedDate === todayKey));
    setPending(filtered.filter((r) => r.assignedDate !== todayKey));

    // Init comments map
    const initComments = {};
    filtered.forEach((r) => {
      initComments[r.id] = r.comment || "";
    });
    setComments(initComments);

    // Assign card colors
    setCardColors((prev) => {
      const updated = { ...prev };
      filtered.forEach((r) => {
        if (!updated[r.id]) updated[r.id] = genColor();
      });
      return updated;
    });
  }, [allReports, profile, todayKey]);

  // Comment modal handlers
  const openCommentModal = (r) => {
    setCurrentReport(r);
    setDraftComment(comments[r.id] || "");
    setShowCommentModal(true);
  };
  const saveComment = async () => {
    const rid = currentReport.id;
    await updateDoc(doc(db, "reports", rid), { comment: draftComment });
    setComments((prev) => ({ ...prev, [rid]: draftComment }));
    setShowCommentModal(false);
  };

  // Deck functions
  const addToDeck = async (r) => {
    if (onDeck.some((x) => x.studentName === r.studentName)) {
      setShowDuplicateToast(true);
      setTimeout(() => setShowDuplicateToast(false), 3000);
      return;
    }
    await updateDoc(doc(db, "reports", r.id), { assignedDate: todayKey });
  };
  const removeFromDeck = async (id) => {
    await updateDoc(doc(db, "reports", id), {
      assignedDate: deleteField(),
    });
  };
  const handleServe = async (id) => {
    await updateDoc(doc(db, "reports", id), {
      served: true,
      servedDate: todayKey,
      assignedDate: deleteField(),
    });
  };

  if (!user || profile === null || loading) {
    return (
      <div className="max-w-screen-xl mx-auto px-6 py-6 text-center text-gray-600">
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-screen-xl mx-auto px-6 py-6 text-center text-red-600">
        Error loading reports.
      </div>
    );
  }

  // Chunk pending into rows of up to 3
  const rows = [];
  for (let i = 0; i < pending.length; i += 3) {
    rows.push(pending.slice(i, i + 3));
  }

  // YYYY-MM-DD → MM.DD.YYYY
  const formatYMD = (ymd) => {
    const [year, month, day] = ymd.split("-");
    return `${month}.${day}.${year}`;
  };

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-6 space-y-8">
      {/* Serving Today */}
      <section className="space-y-4">
        <div className="rounded-md p-3 bg-[#B1D8B7]">
          <h2 className="text-xl font-semibold text-[#2F5233]">
            Serving Today (CORE)
          </h2>
        </div>
        {onDeck.length === 0 ? (
          <div className="text-center py-12">
            <img
              src={sleepyapple}
              alt="No students assigned"
              className="mx-auto h-40 w-40 opacity-50"
            />
            <p className="mt-4 text-gray-600">
              No students assigned for today.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-4">
            {onDeck.map((r) => (
              <div
                key={r.id}
                className="bg-white shadow rounded p-4 w-48 flex flex-col items-center"
              >
                <span className="px-4 py-2 bg-red-400 text-white rounded-full text-lg font-semibold mb-4 truncate text-center">
                  {r.studentName}
                </span>
                <div className="flex flex-col space-y-2 w-full">
                  <button
                    onClick={() => handleServe(r.id)}
                    className="w-full px-2 py-1 bg-red-300 text-white rounded hover:bg-red-400"
                  >
                    Mark Served
                  </button>
                  <button
                    onClick={() => openCommentModal(r)}
                    className="w-full px-2 py-1 bg-red-300 text-white rounded hover:bg-red-400"
                  >
                    Comment
                  </button>
                  <button
                    onClick={() => removeFromDeck(r.id)}
                    className="w-full px-2 py-1 bg-red-300 text-white rounded hover:bg-red-400"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Students to Serve */}
      <section className="space-y-4">
        <div className="rounded-md p-3 bg-[#B1D8B7]">
          <h2 className="text-xl font-semibold text-[#2F5233]">
            Students to Serve
          </h2>
        </div>

        {pending.length === 0 ? (
          <p className="text-gray-600">
            All caught up! No pending reteaches.
          </p>
        ) : (
          <div className="space-y-4">
            {rows.map((row, rowIdx) => (
              <div key={rowIdx} className="flex gap-4">
                {row.map((r) => {
                  const color = cardColors[r.id] || "#94C973";
                  const full = row.length === 3;
                  return (
                    <div
                      key={r.id}
                      className={`${
                        full ? "flex-1" : "flex-shrink-0"
                      } bg-white shadow rounded overflow-hidden`}
                    >
                      <div className="bg-gray-50 p-4 flex items-center justify-between border-b">
                        <span
                          style={{ backgroundColor: color }}
                          className="px-3 py-1 text-white rounded-full text-sm font-medium mr-4 truncate text-center"
                        >
                          {r.studentName}
                        </span>
                        <span className="text-gray-600 text-sm whitespace-nowrap">
                          Date Assigned: {formatYMD(r.date)}
                        </span>
                      </div>
                      <div className="p-4 text-sm text-gray-700 space-y-1">
                        <p>
                          <span className="font-medium">Location:</span>{" "}
                          {r.location}
                        </p>
                        <p>
                          <span className="font-medium">
                            Assigning Teacher:
                          </span>{" "}
                          {r.teacherName}
                        </p>
                        <p>
                          <span className="font-medium">Details:</span>{" "}
                          {r.referralDetails}
                        </p>
                      </div>
                      <div className="p-4 border-t">
                        <button
                          onClick={() => addToDeck(r)}
                          disabled={onDeck.some((x) => x.id === r.id)}
                          style={{ backgroundColor: color }}
                          className={`w-full px-3 py-1 rounded text-sm font-medium text-white hover:opacity-80 ${
                            onDeck.some((x) => x.id === r.id)
                              ? "opacity-40 cursor-not-allowed"
                              : ""
                          }`}
                        >
                          {onDeck.some((x) => x.id === r.id)
                            ? "On Deck"
                            : "Add to Today"}
                        </button>
                      </div>
                    </div>
                  );
                })}
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
              onChange={(e) => setDraftComment(e.target.value)}
              className="w-full h-24 border rounded p-2 mb-4"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowCommentModal(false)}
                className="px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={saveComment}
                className="px-4 py-2 bg-blue-600 text-white rounded"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
