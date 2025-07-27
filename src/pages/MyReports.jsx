import React, { useContext, useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { AuthContext } from "../AuthContext.jsx";

export default function MyReports() {
  const { user } = useContext(AuthContext);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [formState, setFormState] = useState({
    parentContacted: false,
    contactPerson: "",
    contactMethod: "",
  });

  // Format ISO date to MM.DD.YYYY
  const formatDate = (iso) => {
    const d = new Date(iso);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const y = d.getFullYear();
    return `${m}.${day}.${y}`;
  };

  // Load teacher's reports
  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const q = query(
        collection(db, "reports"),
        where("teacherId", "==", user.uid),
        orderBy("timestamp", "desc")
      );
      const snap = await getDocs(q);
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    })();
  }, [user]);

  const startEdit = (r) => {
    setEditingId(r.id);
    setFormState({
      parentContacted: !!r.parentContacted,
      contactPerson: r.contactPerson || "",
      contactMethod: r.contactMethod || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormState({ parentContacted: false, contactPerson: "", contactMethod: "" });
  };

  const saveContact = async (id) => {
    const { parentContacted, contactPerson, contactMethod } = formState;
    const ref = doc(db, "reports", id);
    await updateDoc(ref, { parentContacted, contactPerson, contactMethod });
    setReports(
      reports.map((r) =>
        r.id === id ? { ...r, parentContacted, contactPerson, contactMethod } : r
      )
    );
    cancelEdit();
  };

  if (loading) {
    return <p className="text-lg">Loading your reports…</p>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4">
      <h2 className="text-3xl font-semibold mb-4">My Reports</h2>
      <table className="w-full table-auto border-collapse text-base">
        <thead>
          <tr>
            <th className="px-6 py-3 text-left border-b">Student</th>
            <th className="px-6 py-3 text-left border-b">Date</th>
            <th className="px-6 py-3 text-left border-b">Grade</th>
            <th className="px-6 py-3 text-left border-b">Location</th>
            <th className="px-6 py-3 text-left border-b">Served</th>
            <th className="px-6 py-3 text-left border-b">Comments</th>
          </tr>
        </thead>
        {reports.map((r, i) => {
          const summaryBgClass = r.served ? "bg-green-50" : "bg-red-50";
          const summaryTextClass = r.served ? "text-green-800" : "text-red-800";
          const panelBgClass = r.served ? "bg-green-200 text-green-800" : "bg-red-200 text-red-800";

          return (
            <React.Fragment key={r.id}>
              <tbody className="border-b border-gray-200 last:border-0">
                {/* Summary row */}
                <tr className={`${summaryBgClass} hover:bg-gray-50`}>
                  <td className={`px-6 py-3 text-lg font-semibold ${summaryTextClass}`}>{r.studentName}</td>
                  <td className="px-6 py-3">{formatDate(r.date)}</td>
                  <td className="px-6 py-3">{r.gradeLevel}</td>
                  <td className="px-6 py-3">{r.location}</td>
                  <td className="px-6 py-3">{r.served ? 'Yes' : 'No'}</td>
                  <td className="px-6 py-3">{r.comment || '—'}</td>
                </tr>

                {/* Parent Contact panel row */}
                <tr>
                  <td colSpan={6} className={`px-6 py-4 ${panelBgClass}`}>  
                    <div className="flex justify-between items-center">
                     
                      {editingId !== r.id && (
                        r.parentContacted ? null : (
                          <button
                            onClick={() => startEdit(r)}
                            className="text-blue-600 hover:underline text-sm"
                          >
                            Record one?
                          </button>
                        )
                      )}
                    </div>

                    {editingId === r.id ? (
                      <div className="mt-4 space-y-2">
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={formState.parentContacted}
                            onChange={(e) =>
                              setFormState({
                                ...formState,
                                parentContacted: e.target.checked,
                              })
                            }
                          />
                          <span>Parent contacted?</span>
                        </label>

                        {formState.parentContacted && (
                          <>  
                            <input
                              type="text"
                              placeholder="Contact Person"
                              value={formState.contactPerson}
                              onChange={(e) =>
                                setFormState({
                                  ...formState,
                                  contactPerson: e.target.value,
                                })
                              }
                              className="w-full border rounded p-2"
                            />
                            <input
                              type="text"
                              placeholder="Contact Method"
                              value={formState.contactMethod}
                              onChange={(e) =>
                                setFormState({
                                  ...formState,
                                  contactMethod: e.target.value,
                                })
                              }
                              className="w-full border rounded p-2"
                            />
                          </>
                        )}

                        <div className="flex space-x-2">
                          <button
                            onClick={() => saveContact(r.id)}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-6 py-2 bg-gray-200 rounded hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      r.parentContacted ? (
                        <div className="mt-2 flex space-x-8">
                          <p>Contacted: Yes</p>
                          <p>Who: {r.contactPerson || '—'}</p>
                          <p>Method: {r.contactMethod || '—'}</p>
                        </div>
                      ) : (
                        <p className="mt-2">No Parent Contact Recorded.</p>
                      )
                    )}
                  </td>
                </tr>
              </tbody>
              {i < reports.length - 1 && (
                <tbody>
                  <tr>
                    <td colSpan={6} className="py-4"></td>
                  </tr>
                </tbody>
              )}
            </React.Fragment>
          );
        })}
      </table>
    </div>
  );
}
