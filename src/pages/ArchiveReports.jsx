// src/pages/ArchiveReports.jsx
import React, { useEffect, useState, useContext } from "react";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { AuthContext } from "../AuthContext.jsx";

export default function ArchiveReports() {
  const { user, profile } = useContext(AuthContext);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  // load all served reports, filtered to this teacher’s grades
  useEffect(() => {
    if (!user || profile === null) return;
    (async () => {
      setLoading(true);
      const constraints = [
        where("served", "==", true),
        orderBy("servedDate", "desc"),
      ];
      if (Array.isArray(profile.gradeLevels) && profile.gradeLevels.length) {
        constraints.push(where("gradeLevel", "in",
          profile.gradeLevels.map(g => String(g))
        ));
      }
      const q = query(collection(db, "reports"), ...constraints);
      const snap = await getDocs(q);
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    })();
  }, [user, profile]);

  // group by servedDate
  const grouped = reports.reduce((acc, r) => {
    const d = r.servedDate || "Unknown Date";
    if (!acc[d]) acc[d] = [];
    acc[d].push(r);
    return acc;
  }, {});

  // humanize date heading
  const humanDate = (mdy) => {
  const [m, d, y] = mdy.split(".");
  // monthIndex is zero-based (0=Jan, 5=Jun)
  const date = new Date(
    Number(y),
    Number(m) - 1,
    Number(d)
  );
  return date.toLocaleDateString(undefined, {
    year:  "numeric",
    month: "long",
    day:   "numeric",
  });
};

  if (!user || profile === null || loading) {
    return <p className="p-6 text-center">Loading archive…</p>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Archive</h1>

      {Object.keys(grouped).length === 0 ? (
        <p className="text-gray-600">No served reteaches yet.</p>
      ) : (
        Object.entries(grouped).map(([date, list]) => (
          <section key={date} className="mb-8">
            <h2 className="text-xl font-semibold mb-4">
              {humanDate(date)}
            </h2>
            <ul className="space-y-4">
              {list.map((r) => (
                <li
                  key={r.id}
                  className="bg-white shadow rounded overflow-hidden"
                >
                  {/* Header */}
                  <div className="bg-gray-50 p-4 flex items-center justify-between border-b">
                    <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-sm font-medium">
                      {r.studentName}
                    </span>
                    <span className="text-gray-600 text-sm">
                      Served: {r.servedDate}
                    </span>
                  </div>
                  {/* Details */}
                  <div className="p-4 text-sm text-gray-700 space-y-1">
                    <p>
                      <span className="font-medium">Location:</span> {r.location}
                    </p>
                    <p>
                      <span className="font-medium">Assigning Teacher:</span>{" "}
                      {r.teacherName}
                    </p>
                    <p>
                      <span className="font-medium">Details:</span>{" "}
                      {r.referralDetails}
                    </p>
                    {r.comment && (
                      <p>
                        <span className="font-medium">Teacher Comment:</span>{" "}
                        {r.comment}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
