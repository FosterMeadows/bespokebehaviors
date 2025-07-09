import React, { useContext, useEffect, useState } from "react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { AuthContext } from "../AuthContext.jsx";

export default function ViewReports() {
  const { user } = useContext(AuthContext);
  const [reports, setReports] = useState([]);

  useEffect(() => {
  async function load() {
    if (!user) return;
    const q = query(
      collection(db, "reports"),
      where("teacherId", "==", user.uid),
      orderBy("timestamp", "desc")
    );
    const snapshot = await getDocs(q);
    const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log("fetched reports:", items);
    setReports(items);
  }
  load();
}, [user]);


  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">View Reports</h2>
      {reports.length === 0 ? (
        <p>No reports yet.</p>
      ) : (
        <ul className="space-y-4">
          {reports.map(r => (
            <li key={r.id} className="p-4 bg-white shadow rounded">
              <p>
                <span className="font-medium">Student:</span> {r.studentName}{" "}
                | <span className="font-medium">Date:</span> {r.date}
              </p>
              <p>
                <span className="font-medium">Grade:</span> {r.gradeLevel}{" "}
                | <span className="font-medium">Location:</span> {r.location}
              </p>
              <p>
                <span className="font-medium">Teacher:</span> {r.teacherName}
              </p>
              <p className="mt-2">
                <span className="font-medium">Details:</span>{" "}
                {r.referralDetails}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
