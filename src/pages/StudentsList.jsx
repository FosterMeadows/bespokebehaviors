import React, { useContext, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CalendarDays, MapPin, Puzzle, Search, ShieldCheck, UserRound } from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { AuthContext } from "../AuthContext.jsx";
import { db } from "../firebaseConfig";
import { listenBehaviorStudents, normalizeStudent } from "../services/behavior";

const MOCK_STUDENTS = [
  { id: "dev-student-1", displayName: "Timmy Turner", grade: "6", homeroom: "Carter HR" },
  { id: "dev-student-2", displayName: "Billy Batson", grade: "7", homeroom: "Martin HR" },
  { id: "dev-student-3", displayName: "Sara Bell", grade: "8", homeroom: "Patel HR" }
];

const MOCK_ACADEMIC = {
  "dev-student-1": [
    { id: "a1", title: "Missing ELA CER revision", subject: "ELA", state: "in_progress", teacher: "Dev Owner", date: "2026-06-24" },
    { id: "a2", title: "Integer practice correction", subject: "Math", state: "completed", teacher: "M. Davis", date: "2026-06-18" }
  ],
  "dev-student-2": [
    { id: "a3", title: "Science notebook makeup", subject: "Science", state: "not_started", teacher: "S. Patel", date: "2026-06-21" }
  ]
};

const MOCK_BEHAVIOR = {
  "dev-student-1": [
    { id: "b1", context: "Procedures", location: "Classroom", status: "served", assignedByName: "A. Carter", reteachDate: "2026-06-12", note: "Review entry routine and materials setup." },
    { id: "b2", context: "Side conversations", location: "Cafeteria", status: "pending", assignedByName: "Dev Owner", reteachDate: "2026-06-29", note: "Revisit voice level and table expectations." }
  ],
  "dev-student-2": [
    { id: "b3", context: "Respectful participation", location: "Outside", status: "pending", assignedByName: "Dev Owner", reteachDate: "2026-06-29", note: "Practice joining group directions respectfully." }
  ],
  "dev-student-3": [
    { id: "b4", context: "Transition", location: "Hallway", status: "served", assignedByName: "M. Davis", reteachDate: "2026-05-29", note: "Review transition timing and personal space." }
  ]
};

function formatRecordDate(value) {
  if (!value) return "No date";
  const date = value.toDate?.() || (value.seconds ? new Date(value.seconds * 1000) : new Date(`${value}T00:00:00`));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function sortByDateDesc(a, b) {
  const aDate = a.reteachDate || a.date || a.createdAt || a.assignedAt || a.completedAt || "";
  const bDate = b.reteachDate || b.date || b.createdAt || b.assignedAt || b.completedAt || "";
  return String(bDate).localeCompare(String(aDate));
}

function formatStatusLabel(value) {
  if (!value) return "Record";
  const label = String(value).replace(/_/g, " ").trim().toLowerCase();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : "Record";
}

function isPermissionDenied(err) {
  return err?.code === "permission-denied" || /missing or insufficient permissions/i.test(err?.message || "");
}

function TabButton({ active, children, icon: Icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-sky-400 ${
        active ? "bg-white text-sky-800 shadow-sm" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
      }`}
    >
      {React.createElement(Icon, { className: "h-4 w-4", "aria-hidden": true })}
      {children}
    </button>
  );
}

function StudentSearch({ queryText, onQueryChange, suggestions, onSelect }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
      <div className="mb-3">
        <h2 className="text-base font-bold text-slate-950">Find a student</h2>
        <p className="mt-1 text-sm text-slate-600">Search by student name to review academic and behavior records.</p>
      </div>
      <label className="relative block">
        <span className="sr-only">Search student</span>
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={queryText}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search student..."
          className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
          autoComplete="off"
        />
      </label>

      {suggestions.length > 0 && (
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-sm">
          {suggestions.map((student) => (
            <button
              key={student.id}
              type="button"
              onClick={() => onSelect(student)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-sky-50"
            >
              <span className="font-semibold text-slate-950">{student.displayName}</span>
              <span className="text-slate-500">Grade {student.grade || "-"}{student.homeroom ? ` • ${student.homeroom}` : " • Homeroom"}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function StudentHeader({ student, activeTab, academicCount, behaviorCount, onTabChange, onClear }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-md shadow-slate-200/40">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-sky-800 ring-1 ring-sky-200">
            {student.displayName?.trim()?.charAt(0)?.toUpperCase() || "S"}
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Student Record</div>
            <h1 className="mt-0.5 text-xl font-bold text-slate-950">{student.displayName}</h1>
            <div className="mt-0.5 text-sm font-semibold text-slate-500">
              Grade {student.grade || "-"}{student.homeroom ? ` • ${student.homeroom}` : " • Homeroom"}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-400"
        >
          Change Student
        </button>
      </div>
      <div className="mt-4 inline-flex gap-1 rounded-md border border-slate-200 bg-slate-50/70 p-0.5">
        <TabButton icon={BookOpenCheck} active={activeTab === "academic"} onClick={() => onTabChange("academic")}>
          Academic ({academicCount})
        </TabButton>
        <TabButton icon={ShieldCheck} active={activeTab === "behavior"} onClick={() => onTabChange("behavior")}>
          Behavior ({behaviorCount})
        </TabButton>
      </div>
    </section>
  );
}

function EmptyPanel({ children }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-600">
      {children}
    </div>
  );
}

function AcademicRecordCard({ record }) {
  const note = record.note || record.description || "";

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-950">{record.title || "Academic reteach"}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50/80 px-2 py-1 text-sky-950">
              <BookOpenCheck className="h-3.5 w-3.5" />
              {record.subject || "Academic"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50/80 px-2 py-1 text-slate-700">
              <UserRound className="h-3.5 w-3.5" />
              {record.teacher || record.assignedBy || record.completedBy || "Unknown"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50/80 px-2 py-1 text-slate-700">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatRecordDate(record.date || record.assignedAt || record.completedAt)}
            </span>
          </div>
        </div>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">
          {formatStatusLabel(record.state)}
        </span>
      </div>
      {note && (
        <div className="mt-3 border-l-4 border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Academic note</div>
          <p className="mt-0.5 text-[15px] leading-6 text-slate-900">{note}</p>
        </div>
      )}
    </article>
  );
}

function BehaviorRecordCard({ record }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-950">{record.context || "Behavior reteach"}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50/80 px-2 py-1 text-slate-700">
              <UserRound className="h-3.5 w-3.5" />
              {record.assignedByName || record.servedByName || "Unknown"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50/80 px-2 py-1 text-slate-700">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatRecordDate(record.reteachDate || record.createdAt || record.servedAt)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50/80 px-2 py-1 text-sky-950">
              <MapPin className="h-3.5 w-3.5" />
              {record.location || "No location"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50/80 px-2 py-1 text-violet-950">
              <Puzzle className="h-3.5 w-3.5" />
              {record.context || "No context"}
            </span>
          </div>
        </div>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">
          {formatStatusLabel(record.status)}
        </span>
      </div>
      {record.note && (
        <div className="mt-3 border-l-4 border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Reteach note</div>
          <p className="mt-0.5 text-[15px] leading-6 text-slate-900">{record.note}</p>
        </div>
      )}
    </article>
  );
}

export default function StudentsList() {
  const { user, profile } = useContext(AuthContext);
  const isDevOwner = user?.uid === "dev-owner";
  const [students, setStudents] = useState(isDevOwner ? MOCK_STUDENTS : []);
  const [queryText, setQueryText] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [activeTab, setActiveTab] = useState("academic");
  const [academicRecords, setAcademicRecords] = useState([]);
  const [behaviorRecords, setBehaviorRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isDevOwner) {
      setStudents(MOCK_STUDENTS.map(normalizeStudent));
      return undefined;
    }

    return listenBehaviorStudents(
      profile,
      setStudents,
      (err) => setError(`Could not load students: ${err.message}`)
    );
  }, [isDevOwner, profile]);

  useEffect(() => {
    let ignore = false;

    async function loadRecords() {
      if (!selectedStudent) {
        setAcademicRecords([]);
        setBehaviorRecords([]);
        return;
      }

      setRecordsLoading(true);
      setError("");

      try {
        if (isDevOwner) {
          setAcademicRecords([...(MOCK_ACADEMIC[selectedStudent.id] || [])].sort(sortByDateDesc));
          setBehaviorRecords([...(MOCK_BEHAVIOR[selectedStudent.id] || [])].sort(sortByDateDesc));
          return;
        }

        const safeGetDocs = async (request, label) => {
          try {
            return await getDocs(request);
          } catch (err) {
            if (isPermissionDenied(err)) {
              throw new Error(`${label} are unavailable for this student.`);
            }
            throw err;
          }
        };

        const [activeTaskSnap, historySnap, behaviorSnap] = await Promise.all([
          safeGetDocs(query(collection(db, "tasks"), where("studentId", "==", selectedStudent.id)), "Academic tasks"),
          safeGetDocs(collection(db, "students", selectedStudent.id, "academicHistory"), "Academic history"),
          safeGetDocs(query(collection(db, "behaviorReteaches"), where("studentId", "==", selectedStudent.id)), "Behavior records")
        ]);

        if (ignore) return;

        const activeTasks = activeTaskSnap?.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) || [];
        const history = historySnap?.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data(), state: "completed" })) || [];
        const behavior = behaviorSnap?.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) || [];

        setAcademicRecords([...activeTasks, ...history].sort(sortByDateDesc));
        setBehaviorRecords(behavior.sort(sortByDateDesc));
      } catch (err) {
        if (!ignore) setError(`Could not load student records: ${err.message}`);
      } finally {
        if (!ignore) setRecordsLoading(false);
      }
    }

    loadRecords();
    return () => {
      ignore = true;
    };
  }, [isDevOwner, selectedStudent]);

  const suggestions = useMemo(() => {
    const term = queryText.trim().toLowerCase();
    if (!term || selectedStudent?.displayName === queryText) return [];
    return students
      .map(normalizeStudent)
      .filter((student) => student.displayName.toLowerCase().includes(term))
      .slice(0, 8);
  }, [queryText, selectedStudent, students]);

  function selectStudent(student) {
    const normalized = normalizeStudent(student);
    setSelectedStudent(normalized);
    setQueryText(normalized.displayName);
    setActiveTab("academic");
    setError("");
  }

  function clearStudent() {
    setSelectedStudent(null);
    setQueryText("");
    setAcademicRecords([]);
    setBehaviorRecords([]);
    setActiveTab("academic");
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700 shadow-sm ring-1 ring-sky-200">
            <UserRound className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-sky-800">Students workspace</div>
            <div className="mt-0.5 text-sm text-slate-600">Search student records and review intervention history.</div>
          </div>
        </div>
        <div className="text-xs font-semibold text-slate-500">
          {students.length} {students.length === 1 ? "student" : "students"} available
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {!selectedStudent ? (
        <>
          <StudentSearch
            queryText={queryText}
            onQueryChange={setQueryText}
            suggestions={suggestions}
            onSelect={selectStudent}
          />
          <EmptyPanel>Search for a student to view academic and behavior reteach records.</EmptyPanel>
        </>
      ) : (
        <>
          <StudentHeader
            student={selectedStudent}
            activeTab={activeTab}
            academicCount={academicRecords.length}
            behaviorCount={behaviorRecords.length}
            onTabChange={setActiveTab}
            onClear={clearStudent}
          />

          {recordsLoading ? (
            <EmptyPanel>Loading student records...</EmptyPanel>
          ) : activeTab === "academic" ? (
            academicRecords.length === 0 ? (
              <EmptyPanel>No academic reteach records found for this student.</EmptyPanel>
            ) : (
              <div className="space-y-2.5">
                {academicRecords.map((record) => <AcademicRecordCard key={record.id} record={record} />)}
              </div>
            )
          ) : behaviorRecords.length === 0 ? (
            <EmptyPanel>No behavior reteach records found for this student.</EmptyPanel>
          ) : (
            <div className="space-y-2.5">
              {behaviorRecords.map((record) => <BehaviorRecordCard key={record.id} record={record} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
