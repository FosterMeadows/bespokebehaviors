import React, { useContext, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { BadgeMinus, BookOpenCheck, CalendarDays, CheckCircle2, ClipboardList, History, MapPin, PhoneCall, Printer, Search, ShieldCheck, UserRound } from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { AuthContext } from "../AuthContext.jsx";
import ReteachCancellationDetails from "../components/ReteachCancellationDetails.jsx";
import { db } from "../firebaseConfig";
import { BEHAVIOR_THRESHOLD, behaviorSchoolYear, getBehaviorServedCount, listenBehaviorAssignmentStudents, normalizeStudent, recordBehaviorBuyback } from "../services/behavior";
import { canOverrideBehaviorThreshold, canUseAcademic, canUseBehavior, getAllowedGradeLevels, isSchoolwide } from "../utils/access";
import {
  formatAcademicStatus,
  formatSubjectLabel,
  getAcademicStatusTone,
  getSubjectBorderTone,
  getSubjectTone
} from "../utils/academicPresentation";

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
  const getSortDate = record => (
    record.state === "completed" || record.state === "verified"
      ? record.completedAt || record.date || record.assignedAt || record.createdAt || ""
      : record.occurredAt || record.attemptDate || record.reteachDate || record.date || record.startedAt || record.createdAt || record.assignedAt || record.completedAt || ""
  );
  const aDate = getSortDate(a);
  const bDate = getSortDate(b);
  const toMillis = value => {
    if (value?.toMillis) return value.toMillis();
    if (value?.toDate) return value.toDate().getTime();
    if (typeof value?.seconds === "number") return value.seconds * 1000;
    const parsed = value ? new Date(value).getTime() : 0;
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  return toMillis(bDate) - toMillis(aDate);
}

function formatStatusLabel(value) {
  if (!value) return "Record";
  const label = String(value)
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : "Record";
}

function isPermissionDenied(err) {
  return err?.code === "permission-denied" || /missing or insufficient permissions/i.test(err?.message || "");
}

function TabButton({ active, children, icon: Icon, onClick, tone }) {
  const toneClasses = tone === "behavior"
    ? "text-emerald-800 focus:ring-emerald-400"
    : "text-sky-800 focus:ring-sky-400";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 ${
        active ? `bg-white shadow-sm ${toneClasses}` : "text-slate-600 hover:bg-white/70 hover:text-slate-900 focus:ring-violet-400"
      }`}
    >
      {React.createElement(Icon, { className: "h-4 w-4", "aria-hidden": true })}
      {children}
    </button>
  );
}

function StudentSearch({ queryText, onQueryChange, suggestions, onSelect }) {
  return (
    <section className="rounded-lg border border-violet-200 border-t-4 border-t-violet-500 bg-gradient-to-r from-violet-50/50 via-white to-violet-50/50 p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-base font-bold text-slate-950">Search for Student Records</h2>
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
          className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
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
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-violet-50"
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

function StudentHeader({ student, activeTab, academicCount, behaviorCount, onTabChange, onClear, onPrint, printingDisabled }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-800 ring-1 ring-violet-200">
            {student.displayName?.trim()?.charAt(0)?.toUpperCase() || "S"}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{student.displayName}</h1>
            <div className="mt-0.5 text-sm font-semibold text-slate-500">
              Grade {student.grade || "-"}{student.homeroom ? ` • ${student.homeroom}` : " • Homeroom"}
            </div>
          </div>
        </div>
        <div className="no-print grid grid-cols-1 gap-2 sm:grid-cols-[auto_auto] lg:shrink-0">
          <button
            type="button"
            onClick={onPrint}
            disabled={printingDisabled}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4 shrink-0" />Create Student Report PDF
          </button>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            Change Student
          </button>
        </div>
      </div>
      <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
        <TabButton tone="academic" icon={BookOpenCheck} active={activeTab === "academic"} onClick={() => onTabChange("academic")}>
          Academic ({academicCount})
        </TabButton>
        <TabButton tone="behavior" icon={ShieldCheck} active={activeTab === "behavior"} onClick={() => onTabChange("behavior")}>
          Behavior ({behaviorCount})
        </TabButton>
      </div>
    </section>
  );
}

function HistoryHeading({ title, count, schoolYear, schoolYears, onSchoolYearChange }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-3">
      <h2 className="text-base font-bold text-slate-950">{title} <span className="font-normal text-slate-500">· {count} {count === 1 ? "record" : "records"}</span></h2>
      <label className="no-print">
        <span className="sr-only">School Year</span>
        <select value={schoolYear} onChange={event => onSchoolYearChange(event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-400">
          <option value="all">All School Years</option>
          {schoolYears.map(year => <option key={year} value={year}>{year}</option>)}
        </select>
      </label>
    </div>
  );
}

function EmptyPanel({ children }) {
  return (
    <div className="rounded-lg border border-dashed border-violet-200 bg-violet-50/30 px-5 py-10 text-center text-sm text-slate-600">
      {children}
    </div>
  );
}

function AcademicRecordCard({ record, user, profile }) {
  const note = record.notes || record.note || record.description || "";
  const teacherValue = record.teacher || record.assignedByName || record.completedByName || record.assignedBy || record.completedBy || "";
  const teacherName = teacherValue === user?.uid
    ? profile?.displayName || user?.displayName || user?.email || "Current Teacher"
    : (/^[A-Za-z0-9_-]{20,}$/.test(String(teacherValue)) ? "Staff Member" : teacherValue || "Unknown Teacher");
  const recordDate = record.state === "completed" || record.state === "verified"
    ? record.completedAt || record.date || record.assignedAt
    : record.date || record.assignedAt || record.createdAt || record.completedAt;
  const recordDateVerb = record.state === "completed" || record.state === "verified" ? "Completed" : "Assigned";

  return (
    <article className={`rounded-xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm ${getSubjectBorderTone(record.subject)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-slate-950">{record.title || "Academic Reteach"}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getSubjectTone(record.subject)}`}>
              {formatSubjectLabel(record.subject || "Academic")}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
              <UserRound className="h-3.5 w-3.5" />
              Assigned by {teacherName}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
              <CalendarDays className="h-3.5 w-3.5" />
              {recordDateVerb} {formatRecordDate(recordDate)}
            </span>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${getAcademicStatusTone(record.state)}`}>
          {formatAcademicStatus(record.state)}
        </span>
      </div>
      {note && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Academic Note</div>
          <p className="mt-0.5 text-[15px] leading-6 text-slate-900">{note}</p>
        </div>
      )}
    </article>
  );
}

function BehaviorRecordCard({ record, user, profile }) {
  const isServed = record.status === "served";
  const servedByValue = record.servedByName || record.servedByUid || "";
  const servedByName = servedByValue === user?.uid
    ? profile?.displayName || user?.displayName || user?.email || "Current Teacher"
    : (/^[A-Za-z0-9_-]{20,}$/.test(String(servedByValue)) ? "Staff Member" : servedByValue || "Unknown Staff Member");
  const recordDate = isServed
    ? record.servedAt || record.reteachDate || record.createdAt
    : record.reteachDate || record.createdAt || record.servedAt;

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-500">{isServed ? "Served " : "Scheduled "}{formatRecordDate(recordDate)}</p>
          <h3 className="text-lg font-bold text-slate-950">{record.context || "Behavior reteach"}</h3>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" />
              Assigned by {record.assignedByName || "Unknown Teacher"}
            </span>
            {isServed && (
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Served by {servedByName}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {record.location || "No location"}
            </span>
            {record.homeContactRequired && record.status !== "cancelled" && <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-1 font-bold text-amber-800">Home Contact Required</span>}
            {record.postThreshold && <span className="inline-flex rounded-md border border-red-200 bg-red-50 px-2 py-1 font-bold text-red-800">Assigned after threshold{record.thresholdAcknowledged ? " · acknowledged" : ""}</span>}
            {record.servedPostThreshold && <span className="inline-flex rounded-md border border-red-200 bg-red-50 px-2 py-1 font-bold text-red-800">Served after threshold</span>}
          </div>
        </div>
        {!isServed && <span className={`rounded-md border px-2.5 py-1 text-xs font-bold ${record.status === "cancelled" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          {formatStatusLabel(record.status)}
        </span>}
      </div>
      {record.note && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="whitespace-pre-line text-[15px] leading-6 text-slate-700">{record.note}</p>
        </div>
      )}
      <ReteachCancellationDetails record={record} />
    </article>
  );
}

function BehaviorStanding({ standing, canRecord, confirming, saving, onConfirm, onCancel, onRecord }) {
  const served = standing?.served || 0;
  const buybacks = standing?.buybacks || 0;
  const adjusted = standing?.adjusted || 0;
  const maxed = adjusted >= BEHAVIOR_THRESHOLD;
  return (
    <section className={`rounded-xl border p-5 ${maxed ? "border-amber-200 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/40"}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-600">Behavior Standing · {behaviorSchoolYear()}</div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <span className={`text-4xl font-bold tracking-tight ${maxed ? "text-amber-950" : "text-emerald-950"}`}>{adjusted}</span>
            <div><div className="text-sm font-bold text-slate-900">Current Count {maxed && <span className="ml-2 rounded-md bg-amber-200 px-2 py-1 text-xs text-amber-950">Maxed</span>}</div><div className="mt-1 text-sm text-slate-600">{served} served · {buybacks} {buybacks === 1 ? "buyback" : "buybacks"}</div></div>
          </div>
        </div>
        {canRecord && !confirming && (
          <button type="button" onClick={onConfirm} disabled={adjusted <= 0} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
            <BadgeMinus className="h-4 w-4" />Record Buyback
          </button>
        )}
        {canRecord && confirming && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <div className="text-sm font-bold text-amber-950">Record Buyback? <span className="ml-1">{adjusted} → {Math.max(0, adjusted - 1)}</span></div>
            <div className="mt-2 flex justify-end gap-2"><button type="button" onClick={onCancel} className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700">Cancel</button><button type="button" onClick={onRecord} disabled={saving} className="h-8 rounded-md bg-amber-700 px-3 text-xs font-bold text-white disabled:opacity-60">{saving ? "Recording…" : "Confirm Buyback"}</button></div>
          </div>
        )}
      </div>
      {standing?.buybackRecords?.length > 0 && (
        <details className="mt-4 border-t border-slate-200 pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Buyback History ({standing.buybackRecords.length})</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {standing.buybackRecords.map(item => <span key={item.id} className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900"><CalendarDays className="h-3.5 w-3.5" />{formatRecordDate(item.buybackDate)} · {item.recordedByName || "Staff Member"}</span>)}
          </div>
        </details>
      )}
    </section>
  );
}

function recordSchoolYear(record) {
  if (record?.schoolYear) return record.schoolYear;
  return behaviorSchoolYear(
    record?.reteachDate || record?.buybackDate || record?.attemptDate || record?.date ||
    record?.completedAt || record?.servedAt || record?.assignedAt || record?.createdAt || record?.occurredAt
  );
}

function DetailSection({ icon: Icon, title, empty, children }) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer rounded text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
        {React.createElement(Icon, { className: "mx-2 inline h-4 w-4 text-slate-400", "aria-hidden": true })}{title}
      </summary>
      <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">{React.Children.count(children) ? children : <p className="text-sm text-slate-500">{empty}</p>}</div>
    </details>
  );
}

function AcademicSupplement({ attendance, sessions }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <DetailSection icon={CalendarDays} title={`Attendance (${attendance.length})`} empty="No academic attendance records found.">
        {attendance.map(item => (
          <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span className="font-semibold text-slate-900">{formatRecordDate(item.date)}</span>
            <span className="text-slate-600"> · {item.room || "No room"} · Recorded by {item.byName || item.by || "Staff Member"}</span>
          </div>
        ))}
      </DetailSection>
      <DetailSection icon={ClipboardList} title={`Academic Sessions (${sessions.length})`} empty="No academic session records found.">
        {sessions.map(item => (
          <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <div className="font-semibold text-slate-900">{formatRecordDate(item.date || item.startedAt)} · {item.laneLabel || item.laneId || "Academic session"}</div>
            <div className="mt-0.5 text-slate-600">Outcome: {formatStatusLabel(item.studentOutcome?.status || "selected")} · Host: {item.hostName || "Staff Member"}</div>
          </div>
        ))}
      </DetailSection>
    </div>
  );
}

function HomeContactHistory({ contacts }) {
  return (
    <DetailSection icon={PhoneCall} title={`Home Contact History (${contacts.length})`} empty="No behavior home-contact records found.">
      {contacts.map(item => (
        <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <div className="font-semibold text-slate-900">
            {item.status === "cancelled" ? "Home Contact Withdrawn" : item.status === "completed" ? (item.successful ? "Successful contact" : "Attempted — no contact") : "Contact required"}
            {item.method ? ` · ${item.method}` : ""}
          </div>
          <div className="mt-0.5 text-slate-600">
            {formatRecordDate(item.attemptDate || item.requiredAt)} · {item.contactedParty || "No contacted party recorded"} · Recorded by {item.recordedByName || item.assignedByName || "Staff Member"}
          </div>
          {item.note && <div className="mt-1 border-l-2 border-slate-300 pl-2 text-slate-800">{item.note}</div>}
          <ReteachCancellationDetails record={item} />
        </div>
      ))}
    </DetailSection>
  );
}

function EventHistory({ events }) {
  return (
    <DetailSection icon={History} title={`Record Change History (${events.length})`} empty="No durable change events have been recorded yet.">
      {events.map(item => (
        <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <div className="font-semibold text-slate-900">{item.summary || formatStatusLabel(item.eventType)}</div>
          <div className="mt-0.5 text-xs text-slate-600">{formatRecordDate(item.occurredAt)} · {formatStatusLabel(item.domain)} · {item.actorName || "Staff Member"}</div>
        </div>
      ))}
    </DetailSection>
  );
}

function PrintRow({ label, children }) {
  if (children === null || children === undefined || children === "") return null;
  return <div className="grid grid-cols-[9rem_1fr] gap-3 border-b border-slate-200 py-1.5 text-sm"><dt className="font-semibold text-slate-600">{label}</dt><dd className="text-slate-950">{children}</dd></div>;
}

function PrintRecord({ title, children }) {
  return <article className="break-inside-avoid rounded border border-slate-300 p-3"><h3 className="font-bold text-slate-950">{title}</h3><dl className="mt-1">{children}</dl></article>;
}

function StudentPrintReport({ student, schoolYear, academicRecords, behaviorRecords, attendance, sessions, contacts, buybacks, generatedBy }) {
  return (
    <div className="student-history-print-root print-only bg-white text-slate-950">
      <header className="border-b-2 border-slate-900 pb-3">
        <div className="text-xs font-bold uppercase tracking-widest text-slate-600">Confidential Student Intervention Record</div>
        <h1 className="mt-1 text-2xl font-bold">{student.displayName}</h1>
        <p className="mt-1 text-sm">Grade {student.grade || "—"} · {student.homeroom || "No homeroom"} · School year: {schoolYear === "all" ? "All retained years" : schoolYear}</p>
        <p className="mt-1 text-xs text-slate-500">Generated {new Date().toLocaleString()} by {generatedBy || "Staff Member"}. Contains confidential education records.</p>
      </header>

      <section className="mt-5">
        <h2 className="mb-2 text-lg font-bold">Academic assignments ({academicRecords.length})</h2>
        <div className="space-y-2">{academicRecords.length ? academicRecords.map(record => (
          <PrintRecord key={record.id} title={record.title || "Academic assignment"}>
            <PrintRow label="Subject / status">{formatSubjectLabel(record.subject || "Academic")} · {formatAcademicStatus(record.state)}</PrintRow>
            <PrintRow label="Assigned">{formatRecordDate(record.assignedAt || record.createdAt)} by {record.teacher || record.assignedByName || record.assignedBy || "Staff Member"}</PrintRow>
            <PrintRow label="Completed">{record.completedAt ? formatRecordDate(record.completedAt) : ""}</PrintRow>
            <PrintRow label="Note">{record.notes || record.note || record.description}</PrintRow>
          </PrintRecord>
        )) : <p className="text-sm text-slate-500">No academic assignments in this scope.</p>}</div>
      </section>

      <section className="mt-5">
        <h2 className="mb-2 text-lg font-bold">Academic attendance and sessions</h2>
        <div className="space-y-2">
          {attendance.map(item => <PrintRecord key={item.id} title={`Attendance · ${formatRecordDate(item.date)}`}><PrintRow label="Room">{item.room || "No room"}</PrintRow><PrintRow label="Recorded by">{item.byName || item.by || "Staff Member"}</PrintRow></PrintRecord>)}
          {sessions.map(item => <PrintRecord key={item.id} title={`Session · ${formatRecordDate(item.date || item.startedAt)}`}><PrintRow label="Lane">{item.laneLabel || item.laneId || "Academic"}</PrintRow><PrintRow label="Outcome">{formatStatusLabel(item.studentOutcome?.status)}</PrintRow><PrintRow label="Host">{item.hostName || "Staff Member"}</PrintRow></PrintRecord>)}
          {!attendance.length && !sessions.length && <p className="text-sm text-slate-500">No attendance or session records in this scope.</p>}
        </div>
      </section>

      <section className="mt-5">
        <h2 className="mb-2 text-lg font-bold">Behavior reteaches ({behaviorRecords.length})</h2>
        <div className="space-y-2">{behaviorRecords.length ? behaviorRecords.map(record => (
          <PrintRecord key={record.id} title={record.context || "Behavior reteach"}>
            <PrintRow label="Status / date">{formatStatusLabel(record.status)} · {formatRecordDate(record.servedAt || record.reteachDate)}</PrintRow>
            <PrintRow label="Location">{record.location || "No location"}</PrintRow>
            <PrintRow label="Assigned by">{record.assignedByName || "Staff Member"}</PrintRow>
            <PrintRow label="Served by">{record.servedByName}</PrintRow>
            <PrintRow label="Reteach note">{record.note}</PrintRow>
            <PrintRow label="Threshold">{record.postThreshold ? `Assigned after threshold${record.thresholdAcknowledged ? "; acknowledged" : ""}` : record.servedPostThreshold ? "Served after threshold" : ""}</PrintRow>
            <PrintRow label="Home contact">{record.homeContactRequired && record.status !== "cancelled" ? "Required" : ""}</PrintRow>
            {record.status === "cancelled" && <>
              <PrintRow label="Cancelled by">{record.cancelledByName} · {formatRecordDate(record.cancelledAt)}</PrintRow>
              <PrintRow label="Cancellation Reason">{record.cancellationReason}</PrintRow>
              <PrintRow label="Cancellation Details">{record.cancellationNote}</PrintRow>
            </>}
          </PrintRecord>
        )) : <p className="text-sm text-slate-500">No behavior reteaches in this scope.</p>}</div>
      </section>

      <section className="mt-5">
        <h2 className="mb-2 text-lg font-bold">Behavior contacts and buybacks</h2>
        <div className="space-y-2">
          {contacts.map(item => <PrintRecord key={item.id} title={item.status === "cancelled" ? "Home Contact Withdrawn" : item.status === "completed" ? "Home contact recorded" : "Home contact required"}><PrintRow label="Date / method">{formatRecordDate(item.attemptDate || item.requiredAt)}{item.method ? ` · ${item.method}` : ""}</PrintRow><PrintRow label="Contacted party">{item.contactedParty}</PrintRow><PrintRow label="Successful">{item.successful === null || item.successful === undefined ? "" : item.successful ? "Yes" : "No"}</PrintRow><PrintRow label="Recorded by">{item.recordedByName || item.assignedByName}</PrintRow><PrintRow label="Note">{item.note}</PrintRow>{item.status === "cancelled" && <PrintRow label="Cancellation">{item.cancellationReason} · {item.cancelledByName}</PrintRow>}</PrintRecord>)}
          {buybacks.map(item => <PrintRecord key={item.id} title="Behavior buyback"><PrintRow label="Date">{formatRecordDate(item.buybackDate || item.recordedAt)}</PrintRow><PrintRow label="Recorded by">{item.recordedByName || "Staff Member"}</PrintRow></PrintRecord>)}
          {!contacts.length && !buybacks.length && <p className="text-sm text-slate-500">No home-contact or buyback records in this scope.</p>}
        </div>
      </section>

    </div>
  );
}

export default function StudentsList() {
  const { user, profile } = useContext(AuthContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const isDevOwner = user?.uid === "dev-owner";
  const canRecordBuyback = isDevOwner || canOverrideBehaviorThreshold(profile);
  const [students, setStudents] = useState(isDevOwner ? MOCK_STUDENTS : []);
  const [queryText, setQueryText] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [activeTab, setActiveTab] = useState("academic");
  const [academicRecords, setAcademicRecords] = useState([]);
  const [behaviorRecords, setBehaviorRecords] = useState([]);
  const [behaviorStanding, setBehaviorStanding] = useState(null);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [academicSessions, setAcademicSessions] = useState([]);
  const [homeContacts, setHomeContacts] = useState([]);
  const [buybackRecords, setBuybackRecords] = useState([]);
  const [recordEvents, setRecordEvents] = useState([]);
  const [schoolYearFilter, setSchoolYearFilter] = useState("all");
  const [confirmingBuyback, setConfirmingBuyback] = useState(false);
  const [buybackSaving, setBuybackSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [error, setError] = useState("");
  const allowedGrades = useMemo(() => getAllowedGradeLevels(profile), [profile]);
  const selectedHasAcademicAccess = Boolean(selectedStudent) && (
    isDevOwner || (canUseAcademic(profile) && (isSchoolwide(profile) || allowedGrades.includes(String(selectedStudent.grade || ""))))
  );
  const selectedHasFullBehaviorHistory = Boolean(selectedStudent) && (
    isDevOwner || (canUseBehavior(profile) && (isSchoolwide(profile) || allowedGrades.includes(String(selectedStudent.grade || ""))))
  );

  useEffect(() => {
    if (isDevOwner) {
      setStudents(MOCK_STUDENTS.map(normalizeStudent));
      return undefined;
    }

    return listenBehaviorAssignmentStudents(
      profile,
      setStudents,
      (err) => setError(`Could not load students: ${err.message}`)
    );
  }, [isDevOwner, profile]);

  useEffect(() => {
    const studentId = searchParams.get("studentId");
    if (!studentId) return;
    const student = students.find(item => item.id === studentId);
    if (!student) return;
    const normalized = normalizeStudent(student);
    setSelectedStudent(normalized);
    setQueryText(normalized.displayName);
    setActiveTab(searchParams.get("tab") === "behavior" ? "behavior" : "academic");
    setConfirmingBuyback(false);
  }, [searchParams, students]);

  useEffect(() => {
    let ignore = false;

    async function loadRecords() {
      if (!selectedStudent) {
        setAcademicRecords([]);
        setBehaviorRecords([]);
        setBehaviorStanding(null);
        setAttendanceRecords([]);
        setAcademicSessions([]);
        setHomeContacts([]);
        setBuybackRecords([]);
        setRecordEvents([]);
        return;
      }

      setRecordsLoading(true);
      setError("");
      setWarning("");

      try {
        if (isDevOwner) {
          setAcademicRecords([...(MOCK_ACADEMIC[selectedStudent.id] || [])].sort(sortByDateDesc));
          setBehaviorRecords([...(MOCK_BEHAVIOR[selectedStudent.id] || [])].sort(sortByDateDesc));
          const served = (MOCK_BEHAVIOR[selectedStudent.id] || []).filter(item => item.status === "served").length;
          setBehaviorStanding({ served, buybacks: 0, adjusted: served, buybackRecords: [] });
          setAttendanceRecords([]);
          setAcademicSessions([]);
          setHomeContacts([]);
          setBuybackRecords([]);
          setRecordEvents([]);
          return;
        }

        const warnings = [];
        const safeGetDocs = async (request, label) => {
          try {
            return await getDocs(request);
          } catch (err) {
            warnings.push(isPermissionDenied(err) ? `${label} are outside your access scope.` : `${label} could not be loaded.`);
            return null;
          }
        };

        const behaviorQuery = selectedHasFullBehaviorHistory
          ? query(collection(db, "behaviorReteaches"), where("studentId", "==", selectedStudent.id))
          : query(collection(db, "behaviorReteaches"), where("studentId", "==", selectedStudent.id), where("assignedByUid", "==", user.uid));
        const contactQuery = selectedHasFullBehaviorHistory
          ? query(collection(db, "behaviorHomeContactRequirements"), where("studentId", "==", selectedStudent.id))
          : query(collection(db, "behaviorHomeContactRequirements"), where("studentId", "==", selectedStudent.id), where("assignedByUid", "==", user.uid));

        const [activeTaskSnap, historySnap, behaviorSnap, attendanceSnap, sessionsSnap, contactsSnap, buybacksSnap, academicEventsSnap, behaviorEventsSnap, lifecycleSnap, standing] = await Promise.all([
          selectedHasAcademicAccess ? safeGetDocs(query(collection(db, "tasks"), where("studentId", "==", selectedStudent.id)), "Academic tasks") : null,
          selectedHasAcademicAccess ? safeGetDocs(collection(db, "students", selectedStudent.id, "academicHistory"), "Academic history") : null,
          canUseBehavior(profile) ? safeGetDocs(behaviorQuery, "Behavior records") : null,
          selectedHasAcademicAccess ? safeGetDocs(query(collection(db, "attendance"), where("studentId", "==", selectedStudent.id)), "Academic attendance") : null,
          selectedHasAcademicAccess ? safeGetDocs(query(collection(db, "academicSessions"), where("grade", "==", String(selectedStudent.grade || ""))), "Academic sessions") : null,
          canUseBehavior(profile) ? safeGetDocs(contactQuery, "Home-contact history") : null,
          selectedHasFullBehaviorHistory ? safeGetDocs(query(collection(db, "behaviorBuybacks"), where("studentId", "==", selectedStudent.id)), "Behavior buybacks") : null,
          selectedHasAcademicAccess ? safeGetDocs(query(collection(db, "studentRecordEvents"), where("studentId", "==", selectedStudent.id), where("domain", "==", "academic")), "Academic change history") : null,
          selectedHasFullBehaviorHistory
            ? safeGetDocs(query(collection(db, "studentRecordEvents"), where("studentId", "==", selectedStudent.id), where("domain", "==", "behavior")), "Behavior change history")
            : safeGetDocs(query(collection(db, "studentRecordEvents"), where("domain", "==", "behavior"), where("visibleToUids", "array-contains", user.uid)), "Your behavior change history"),
          selectedHasAcademicAccess ? safeGetDocs(query(collection(db, "lifecycle"), where("studentId", "==", selectedStudent.id)), "Academic lifecycle history") : null,
          selectedHasFullBehaviorHistory ? getBehaviorServedCount(selectedStudent.id).catch(() => null) : null
        ]);

        if (ignore) return;

        const activeTasks = activeTaskSnap?.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) || [];
        const history = historySnap?.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data(), state: "completed" })) || [];
        const behavior = behaviorSnap?.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) || [];
        const attendance = attendanceSnap?.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) || [];
        const sessions = (sessionsSnap?.docs || [])
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter(session => session.roster?.includes(selectedStudent.id) || Object.hasOwn(session.outcomes || {}, selectedStudent.id))
          .map(session => ({ ...session, studentOutcome: session.outcomes?.[selectedStudent.id] || null }));
        const contacts = contactsSnap?.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) || [];
        const buybacks = buybacksSnap?.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) || [];
        const durableEvents = [
          ...(academicEventsSnap?.docs || []),
          ...(behaviorEventsSnap?.docs || [])
        ].map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter(event => event.studentId === selectedStudent.id);
        const lifecycleEvents = (lifecycleSnap?.docs || []).map(docSnap => {
          const item = docSnap.data();
          return { id: `lifecycle-${docSnap.id}`, ...item, domain: "academic", occurredAt: item.at, actorUid: item.by || item.byUid || null, actorName: item.byName || null, summary: item.eventType === "taskCanceled" ? "Assignment Removed" : formatStatusLabel(item.eventType) };
        });

        const academicByTask = new Map();
        activeTasks.forEach(record => academicByTask.set(record.id, { ...record, taskId: record.id }));
        history.forEach(record => {
          const key = record.taskId || record.id;
          academicByTask.set(key, { ...(academicByTask.get(key) || {}), ...record, id: key, state: "completed" });
        });

        setAcademicRecords([...academicByTask.values()].sort(sortByDateDesc));
        setBehaviorRecords(behavior.sort(sortByDateDesc));
        setBehaviorStanding(standing || null);
        setAttendanceRecords(attendance.sort(sortByDateDesc));
        setAcademicSessions(sessions.sort(sortByDateDesc));
        setHomeContacts(contacts.sort(sortByDateDesc));
        setBuybackRecords(buybacks.sort(sortByDateDesc));
        setRecordEvents([...durableEvents, ...lifecycleEvents].sort((a, b) => sortByDateDesc(a, b)));
        if (!selectedHasAcademicAccess || (academicByTask.size === 0 && behavior.length > 0)) {
          setActiveTab("behavior");
        }
        if (warnings.length) setWarning(warnings.join(" "));
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
  }, [isDevOwner, profile, refreshKey, selectedHasAcademicAccess, selectedHasFullBehaviorHistory, selectedStudent, user?.uid]);

  const suggestions = useMemo(() => {
    const term = queryText.trim().toLowerCase();
    if (!term || selectedStudent?.displayName === queryText) return [];
    return students
      .map(normalizeStudent)
      .filter((student) => student.displayName.toLowerCase().includes(term))
      .slice(0, 8);
  }, [queryText, selectedStudent, students]);

  const schoolYears = useMemo(() => [...new Set([
    ...academicRecords,
    ...behaviorRecords,
    ...attendanceRecords,
    ...academicSessions,
    ...homeContacts,
    ...buybackRecords,
    ...recordEvents
  ].map(recordSchoolYear).filter(Boolean))].sort().reverse(), [academicRecords, academicSessions, attendanceRecords, behaviorRecords, buybackRecords, homeContacts, recordEvents]);

  const inSelectedYear = record => schoolYearFilter === "all" || recordSchoolYear(record) === schoolYearFilter;
  const filteredAcademic = academicRecords.filter(inSelectedYear);
  const filteredBehavior = behaviorRecords.filter(inSelectedYear);
  const filteredAttendance = attendanceRecords.filter(inSelectedYear);
  const filteredSessions = academicSessions.filter(inSelectedYear);
  const filteredContacts = homeContacts.filter(inSelectedYear);
  const filteredBuybacks = buybackRecords.filter(inSelectedYear);
  const filteredEvents = recordEvents.filter(inSelectedYear);
  const academicEvents = filteredEvents.filter(item => item.domain === "academic");
  const behaviorEvents = filteredEvents.filter(item => item.domain === "behavior");

  function selectStudent(student) {
    setSearchParams({}, { replace: true });
    const normalized = normalizeStudent(student);
    setSelectedStudent(normalized);
    setQueryText(normalized.displayName);
    setActiveTab("academic");
    setConfirmingBuyback(false);
    setError("");
    setWarning("");
    setMessage("");
  }

  function clearStudent() {
    setSearchParams({}, { replace: true });
    setSelectedStudent(null);
    setQueryText("");
    setAcademicRecords([]);
    setBehaviorRecords([]);
    setBehaviorStanding(null);
    setAttendanceRecords([]);
    setAcademicSessions([]);
    setHomeContacts([]);
    setBuybackRecords([]);
    setRecordEvents([]);
    setSchoolYearFilter("all");
    setConfirmingBuyback(false);
    setActiveTab("academic");
    setWarning("");
  }

  async function handleRecordBuyback() {
    if (!selectedStudent || buybackSaving || (behaviorStanding?.adjusted || 0) <= 0) return;
    setBuybackSaving(true);
    setError("");
    try {
      if (isDevOwner) {
        const nowRecord = { id: `dev-buyback-${Date.now()}`, buybackDate: new Date().toLocaleDateString("en-CA"), recordedByName: "Dev Owner" };
        setBehaviorStanding(current => ({ ...current, buybacks: current.buybacks + 1, adjusted: Math.max(0, current.adjusted - 1), buybackRecords: [nowRecord, ...(current.buybackRecords || [])] }));
      } else {
        await recordBehaviorBuyback(selectedStudent, {
          uid: user?.uid || "",
          name: profile?.displayName || user?.displayName || user?.email || "Staff Member"
        });
        setRefreshKey(current => current + 1);
      }
      setMessage(`Buyback recorded for ${selectedStudent.displayName}.`);
      setConfirmingBuyback(false);
    } catch (err) {
      setError(`Buyback could not be recorded: ${err.message}`);
    } finally {
      setBuybackSaving(false);
    }
  }

  function handlePrint() {
    if (!selectedStudent || recordsLoading) return;
    window.print();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10 pt-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}
      {warning && !error && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{warning}</div>}
      {message && !error && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950">{message}</div>}

      {!selectedStudent ? (
        <StudentSearch
          queryText={queryText}
          onQueryChange={setQueryText}
          suggestions={suggestions}
          onSelect={selectStudent}
        />
      ) : (
        <>
          <StudentHeader
            student={selectedStudent}
            activeTab={activeTab}
            academicCount={filteredAcademic.length}
            behaviorCount={filteredBehavior.length}
            onTabChange={setActiveTab}
            onClear={clearStudent}
            onPrint={handlePrint}
            printingDisabled={recordsLoading}
          />

          {recordsLoading ? (
            <EmptyPanel>Loading student records...</EmptyPanel>
          ) : activeTab === "academic" ? (
            !selectedHasAcademicAccess ? <EmptyPanel>Academic history is outside your student access scope.</EmptyPanel> : (
              <div className="space-y-3">
                <HistoryHeading title="Academic History" count={filteredAcademic.length} schoolYear={schoolYearFilter} schoolYears={schoolYears} onSchoolYearChange={setSchoolYearFilter} />
                {filteredAcademic.length === 0 ? <EmptyPanel>No academic reteach records found in this report scope.</EmptyPanel> : (
                  <div className="space-y-2.5">{filteredAcademic.map((record) => <AcademicRecordCard key={record.id} record={record} user={user} profile={profile} />)}</div>
                )}
                <AcademicSupplement attendance={filteredAttendance} sessions={filteredSessions} />
                <EventHistory events={academicEvents} />
              </div>
            )
          ) : (
            <div className="space-y-3">
              {selectedHasFullBehaviorHistory && <BehaviorStanding
                  standing={behaviorStanding}
                  canRecord={canRecordBuyback}
                  confirming={confirmingBuyback}
                  saving={buybackSaving}
                  onConfirm={() => setConfirmingBuyback(true)}
                  onCancel={() => setConfirmingBuyback(false)}
                  onRecord={handleRecordBuyback}
                />}
              {!selectedHasFullBehaviorHistory && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">This student is outside your assigned grades. Only behavior records you created are shown.</div>}
              <div className="space-y-3">
              <HistoryHeading title="Behavior History" count={filteredBehavior.length} schoolYear={schoolYearFilter} schoolYears={schoolYears} onSchoolYearChange={setSchoolYearFilter} />
              {filteredBehavior.length === 0 ? <EmptyPanel>No behavior reteach records found in this report scope.</EmptyPanel> : (
                <div className="space-y-2.5">
                  {filteredBehavior.map((record) => <BehaviorRecordCard key={record.id} record={record} user={user} profile={profile} />)}
                </div>
              )}
              <HomeContactHistory contacts={filteredContacts} />
              <EventHistory events={behaviorEvents} />
              </div>
            </div>
          )}
          <StudentPrintReport
            student={selectedStudent}
            schoolYear={schoolYearFilter}
            academicRecords={selectedHasAcademicAccess ? filteredAcademic : []}
            behaviorRecords={filteredBehavior}
            attendance={selectedHasAcademicAccess ? filteredAttendance : []}
            sessions={selectedHasAcademicAccess ? filteredSessions : []}
            contacts={filteredContacts}
            buybacks={selectedHasFullBehaviorHistory ? filteredBuybacks : []}
            generatedBy={profile?.displayName || user?.displayName || user?.email}
          />
        </>
      )}
    </div>
  );
}
