import React, { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { AuthContext } from "../AuthContext.jsx";

export default function StudentView() {
  const { user } = useContext(AuthContext);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [gradeFilter, setGradeFilter] = useState("all");

  // Bubble color map
  const bubbleColors = {
    1: "bg-green-200 text-green-800",
    2: "bg-lime-200 text-lime-800",
    3: "bg-yellow-200 text-yellow-800",
    4: "bg-orange-200 text-orange-800",
    5: "bg-amber-200 text-amber-800",
    6: "bg-red-200 text-red-800",
  };

  // Load and group reports into per-student counts
  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const q = query(
        collection(db, "reports"),
        where("teacherId", "==", user.uid)
      );
      const snap = await getDocs(q);
      const map = {};
      snap.docs.forEach((d) => {
        const { studentName, gradeLevel } = d.data();
        if (!map[studentName]) {
          map[studentName] = { name: studentName, gradeLevel, count: 0 };
        }
        map[studentName].count += 1;
      });
      setStudents(Object.values(map));
      setLoading(false);
    })();
  }, [user]);

  // Toggle sorting
  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // Apply grade filter
  const filtered = students.filter(
    (s) => gradeFilter === "all" || s.gradeLevel === gradeFilter
  );

  // Apply sort
  const sortedStudents = [...filtered].sort((a, b) => {
    let vA = a[sortKey],
      vB = b[sortKey];
    if (vA == null) vA = "";
    if (vB == null) vB = "";

    // numeric for gradeLevel & count
    if (sortKey === "gradeLevel" || sortKey === "count") {
      const nA = Number(vA) || 0,
        nB = Number(vB) || 0;
      return sortDir === "asc" ? nA - nB : nB - nA;
    }

    // string for name
    const sA = vA.toString().toLowerCase(),
      sB = vB.toString().toLowerCase();
    if (sA < sB) return sortDir === "asc" ? -1 : 1;
    if (sA > sB) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  if (loading) return <p className="text-lg">Loading students…</p>;

  return (
    <div className="max-w-5xl mx-auto px-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-semibold">All Students</h2>
        <div className="flex items-center space-x-2">
          <label htmlFor="gradeFilter" className="text-base font-medium">
            Grade:
          </label>
          <select
            id="gradeFilter"
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="border rounded p-2 text-base"
          >
            <option value="all">All</option>
            <option value="6">6</option>
            <option value="7">7</option>
            <option value="8">8</option>
          </select>
        </div>
      </div>

      <table className="w-full table-auto border-collapse text-base">
        <thead>
          <tr>
            <th
              onClick={() => toggleSort("name")}
              className="cursor-pointer px-6 py-3 text-left border-b text-lg"
            >
              Name {sortKey === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
            </th>
            <th
              onClick={() => toggleSort("gradeLevel")}
              className="cursor-pointer px-6 py-3 text-left border-b text-lg"
            >
              Grade{' '}
              {sortKey === "gradeLevel" ? (sortDir === "asc" ? "↑" : "↓") : ""}
            </th>
            <th
              onClick={() => toggleSort("count")}
              className="cursor-pointer px-6 py-3 text-left border-b text-lg"
            >
              Reteaches{' '}
              {sortKey === "count" ? (sortDir === "asc" ? "↑" : "↓") : ""}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedStudents.map((s) => (
            <tr key={s.name} className="hover:bg-gray-50">
              <td className="px-6 py-3 text-lg">
                <Link
                  to={`/student/${encodeURIComponent(s.name)}`}
                  className="text-blue-600 hover:underline"
                >
                  {s.name}
                </Link>
              </td>
              <td className="px-6 py-3 text-lg">{s.gradeLevel}</td>
              <td className="px-6 py-3 flex items-center space-x-2">
                {Array.from({ length: Math.min(s.count, 6) }, (_, i) => (
                  <div
                    key={i}
                    className={`h-7 w-7 rounded-full flex items-center justify-center text-sm font-semibold ${
                      bubbleColors[i + 1]
                    }`}
                  >
                    {i + 1}
                  </div>
                ))}
                {s.count > 6 && (
                  <span className="text-base font-medium ml-2">
                    +{s.count - 6}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
