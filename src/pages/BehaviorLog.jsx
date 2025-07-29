import React, { useState, useEffect, useContext } from "react";
import { AuthContext } from "../AuthContext.jsx";
import { db } from "../firebaseConfig";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

export default function BehaviorLog() {
  const { user } = useContext(AuthContext);

  // Search & selection
  const [studentName, setStudentName] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [suggestions, setSuggestions] = useState([]);

  // Stats (hot list)
  const [studentStats, setStudentStats] = useState([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [errorStats, setErrorStats] = useState(null);

  // Logs
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [errorLogs, setErrorLogs] = useState(null);

  // New entry form
  const [time, setTime] = useState("");
  const [context, setContext] = useState("");
  const [response, setResponse] = useState("");
  const [details, setDetails] = useState("");

  // Fetch hot list of students
  useEffect(() => {
    async function fetchStats() {
      setLoadingStats(true);
      setErrorStats(null);
      try {
        const snap = await getDocs(collection(db, "behaviorLogs"));
        const map = new Map();
        snap.docs.forEach((d) => {
          const data = d.data();
          const name = data.studentName;
          const ts = data.createdAt?.toMillis() || 0;
          const rec = map.get(name) || { studentName: name, count: 0, latest: 0 };
          rec.count++;
          rec.latest = Math.max(rec.latest, ts);
          map.set(name, rec);
        });
        const arr = Array.from(map.values()).sort(
          (a, b) => b.count - a.count || b.latest - a.latest
        );
        setStudentStats(arr);
      } catch (err) {
        console.error("Error fetching stats:", err);
        setErrorStats(err);
      }
      setLoadingStats(false);
    }
    fetchStats();
  }, []);

  // Fetch logs for selected student
  useEffect(() => {
    if (!selectedStudent) return;
    async function fetchLogs() {
      setLoadingLogs(true);
      setErrorLogs(null);
      try {
        const q = query(
          collection(db, "behaviorLogs"),
          where("studentName", "==", selectedStudent),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error fetching logs:", err);
        setErrorLogs(err);
      }
      setLoadingLogs(false);
    }
    fetchLogs();
  }, [selectedStudent]);

  // Autosuggest
  useEffect(() => {
    if (studentName.trim()) {
      setSuggestions(
        studentStats.filter((s) =>
          s.studentName.toLowerCase().includes(studentName.toLowerCase())
        )
      );
    } else {
      setSuggestions([]);
    }
  }, [studentName, studentStats]);

  // Select a student
  const handleSelect = (name) => {
    setSelectedStudent(name);
    setStudentName(name);
    setSuggestions([]);
  };

  // Submit new log
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedStudent) return;
    setLoadingLogs(true);
    setErrorLogs(null);
    try {
      await addDoc(collection(db, "behaviorLogs"), {
        teacherId: user.uid,
        studentName: selectedStudent,
        time,
        context,
        response,
        details,
        createdAt: serverTimestamp(),
      });
      // clear form
      setTime("");
      setContext("");
      setResponse("");
      setDetails("");
      // refresh logs
      const q = query(
        collection(db, "behaviorLogs"),
        where("studentName", "==", selectedStudent),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error adding log:", err);
      setErrorLogs(err);
    }
    setLoadingLogs(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
      <h1 className="text-2xl font-semibold text-gray-800">Behavior Log</h1>

      {/* Top Controls: Hot list + Search */}
      <div className="p-4 bg-blue-50 rounded-lg space-y-6">
        {/* Hot list cards */}
        <section>
          <h2 className="text-xl font-medium text-gray-700 mb-2">Recent Students</h2>
          {loadingStats ? (
            <p className="text-gray-500">Loading...</p>
          ) : errorStats ? (
            <p className="text-red-600">Error loading students.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {studentStats.slice(0, 6).map((s) => (
                <button
                  key={s.studentName}
                  onClick={() => handleSelect(s.studentName)}
                  className="border rounded-lg p-4 bg-white hover:shadow flex justify-between items-center"
                >
                  <span className="text-base font-medium text-gray-800">{s.studentName}</span>
                  <span className="text-sm text-gray-500">{s.count}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Search bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSelect(studentName.trim());
          }}
          className="relative flex"
        >
          <input
            type="text"
            placeholder="Search or select a student…"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            className="border rounded-l w-full p-2"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-200 text-indigo-800 rounded-r"
          >
            Select
          </button>
          {suggestions.length > 0 && (!selectedStudent || studentName !== selectedStudent) && (
            <ul className="absolute bg-white border border-gray-200 w-full mt-12 max-h-60 overflow-auto z-10">
              {suggestions.map((s) => (
                <li key={s.studentName}>
                  <button
                    onClick={() => handleSelect(s.studentName)}
                    className="block w-full text-left px-2 py-1 hover:bg-gray-100"
                  >
                    {s.studentName} ({s.count})
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-300" />

      {/* Logs & Form Section */}
      {selectedStudent && (
        <div className="space-y-6">
          <div className="p-4 bg-yellow-50 rounded-lg">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Logs for {selectedStudent}</h2>
            {loadingLogs ? (
              <p className="text-gray-500">Loading logs…</p>
            ) : errorLogs ? (
              <p className="text-red-600">Error loading logs.</p>
            ) : (
              <ul className="space-y-4">
                {logs.map((log) => (
                  <li
                    key={log.id}
                    className="border rounded p-4 bg-white shadow"
                  >
                    <p>
                      <span className="font-medium">Time:</span> {log.time}
                    </p>
                    <p>
                      <span className="font-medium">Context:</span> {log.context}
                    </p>
                    <p>
                      <span className="font-medium">Response:</span> {log.response}
                    </p>
                    <p>
                      <span className="font-medium">Details:</span> {log.details}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* New log form */}
          <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-green-50 rounded-lg">
            <h3 className="text-lg font-medium text-gray-800">Add New Entry</h3>
            <div>
              <label className="block font-medium mb-1 text-gray-700">
                What time did this happen?
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full border rounded p-2"
                required
              />
            </div>
            <div>
              <label className="block font-medium mb-1 text-gray-700">
                What was happening in the room?
              </label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                className="w-full border rounded p-2"
                rows={3}
                required
              />
            </div>
            <div>
              <label className="block font-medium mb-1 text-gray-700">
                What was your response?
              </label>
              <textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                className="w-full border rounded p-2"
                rows={3}
                required
              />
            </div>
            <div>
              <label className="block font-medium mb-1 text-gray-700">Other details</label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="w-full border rounded p-2"
                rows={3}
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded"
              disabled={loadingLogs}
            >
              Add Entry
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
