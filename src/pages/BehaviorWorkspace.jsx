import { useContext, useState, useEffect, useMemo } from "react";
import { AuthContext } from "../AuthContext.jsx";
import { canOverrideBehaviorThreshold, canCancelBehaviorReteach } from "../utils/access";
import { MOCK_STUDENTS, MOCK_COUNTS } from "../qa/behaviorFixtures.js";
import { todayInputValue, dateSortValue } from "../utils/behaviorPresentation.js";
import {
  ensureBehaviorReteachSummaries,
  listenBehaviorAssignmentStudents,
  listenPendingBehaviorReteaches,
  listenMyBehaviorReteaches,
  listenMyHomeContactRequirements,
  getBehaviorServedCount,
  normalizeStudent,
  BEHAVIOR_THRESHOLD,
  createBehaviorReteach,
  cancelBehaviorReteach,
  markBehaviorReteachServed,
  restoreBehaviorReteachPending,
  recordHomeContactAttempt
} from "../services/behavior";
import { reportClientError } from "../services/clientErrors";
import { X, CheckCircle2, Undo2, PhoneCall } from "lucide-react";
import { downloadReteachReport } from "../utils/reteachReport";
import { TabButton, TabCount } from "../components/behavior/BehaviorTabs.jsx";
import { BehaviorAssignmentForm } from "../components/behavior/BehaviorAssignmentForm.jsx";
import BehaviorStudentStats from "../components/BehaviorStudentStats.jsx";
import { PendingReteaches } from "../components/behavior/PendingReteaches.jsx";
import { MyReteaches } from "../components/behavior/MyReteaches.jsx";
import CancelReteachDialog from "../components/CancelReteachDialog.jsx";

export default function BehaviorWorkspace() {
  const { user, profile } = useContext(AuthContext);
  const isDevOwner = user?.uid === "dev-owner";
  const canOverrideThreshold = isDevOwner || canOverrideBehaviorThreshold(profile);
  const teacherName = profile?.displayName || user?.displayName || user?.email || "Unknown teacher";
  const [activeTab, setActiveTab] = useState("assign");
  const [students, setStudents] = useState(isDevOwner ? MOCK_STUDENTS : []);
  const [studentQuery, setStudentQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [servedCount, setServedCount] = useState(null);
  const [generatingReportIds, setGeneratingReportIds] = useState([]);
  const [devCounts, setDevCounts] = useState(MOCK_COUNTS);
  const [countLoading, setCountLoading] = useState(false);
  const [pending, setPending] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(!isDevOwner);
  const [myReteaches, setMyReteaches] = useState([]);
  const [homeContactRequirements, setHomeContactRequirements] = useState([]);
  const [editingHomeContactId, setEditingHomeContactId] = useState(null);
  const [contactSaving, setContactSaving] = useState(false);
  const [myStatusFilter, setMyStatusFilter] = useState("all");
  const [pendingCounts, setPendingCounts] = useState({});
  const [serveFilters, setServeFilters] = useState({
    search: "",
    grade: "",
    sort: "oldest"
  });
  const [form, setForm] = useState({ reteachDate: todayInputValue(), location: "", context: "", note: "" });
  const [situationEditing, setSituationEditing] = useState(true);
  const [thresholdAcknowledged, setThresholdAcknowledged] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [undoRecord, setUndoRecord] = useState(null);
  const [undoing, setUndoing] = useState(false);
  const [servingIds, setServingIds] = useState([]);
  const [cancellingRecord, setCancellingRecord] = useState(null);
  useEffect(() => {
    if (isDevOwner) {
      setStudents(MOCK_STUDENTS);
      return undefined;
    }

    let cancelled = false;
    let unsubscribe = () => {};

    async function startStudentSearch() {
      if (canOverrideThreshold) {
        try {
          await ensureBehaviorReteachSummaries();
        } catch (err) {
          void reportClientError(err, { source: "operation", operation: "behavior-prepare" });
          if (!cancelled) setError(`Could not prepare behavior snapshots: ${err.message}`);
        }
      }
      if (cancelled) return;
      unsubscribe = listenBehaviorAssignmentStudents(
        profile,
        setStudents,
        (err) => setError(`Could not load students: ${err.message}`)
      );
    }

    startStudentSearch();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [canOverrideThreshold, isDevOwner, profile]);

  useEffect(() => {
    if (isDevOwner) {
      setPendingLoading(false);
      return undefined;
    }

    return listenPendingBehaviorReteaches(
      profile,
      rows => {
        setPending(rows);
        setPendingLoading(false);
      },
      (err) => {
        setPendingLoading(false);
        setError(`Could not load To Serve list: ${err.message}`);
      }
    );
  }, [isDevOwner, profile]);

  useEffect(() => {
    if (isDevOwner) return undefined;

    return listenMyBehaviorReteaches(
      user?.uid,
      setMyReteaches,
      (err) => setError(`Could not load your reteaches: ${err.message}`)
    );
  }, [isDevOwner, user?.uid]);

  useEffect(() => {
    if (isDevOwner) return undefined;
    return listenMyHomeContactRequirements(
      user?.uid,
      setHomeContactRequirements,
      (err) => setError(`Could not load required home contacts: ${err.message}`)
    );
  }, [isDevOwner, user?.uid]);

  const homeContactByReteach = useMemo(() => Object.fromEntries(
    homeContactRequirements.map(requirement => [requirement.reteachId, requirement])
  ), [homeContactRequirements]);
  const pendingHomeContacts = useMemo(
    () => homeContactRequirements.filter(requirement => requirement.status === "pending"),
    [homeContactRequirements]
  );

  const visibleMyReteaches = useMemo(() => {
    if (myStatusFilter === "all") return myReteaches;
    return myReteaches.filter((record) => record.status === myStatusFilter);
  }, [myReteaches, myStatusFilter]);
  const myReteachCounts = useMemo(() => ({
    all: myReteaches.length,
    pending: myReteaches.filter((record) => record.status === "pending").length,
    served: myReteaches.filter((record) => record.status === "served").length,
    cancelled: myReteaches.filter((record) => record.status === "cancelled").length
  }), [myReteaches]);

  useEffect(() => {
    let ignore = false;

    async function loadPendingCounts() {
      if (pending.length === 0) {
        setPendingCounts({});
        return;
      }

      if (isDevOwner) {
        const counts = {};
        for (const record of pending) {
          counts[record.studentId] = devCounts[record.studentId] || { adjusted: 0 };
        }
        setPendingCounts(counts);
        return;
      }

      try {
        const studentIds = [...new Set(pending.map((record) => record.studentId).filter(Boolean))];
        const entries = await Promise.all(
          studentIds.map(async (studentId) => [studentId, await getBehaviorServedCount(studentId)])
        );
        if (!ignore) setPendingCounts(Object.fromEntries(entries));
      } catch (err) {
        void reportClientError(err, { source: "operation", operation: "behavior-count" });
        if (!ignore) setError(`Could not load reteach counts: ${err.message}`);
      }
    }

    loadPendingCounts();
    return () => {
      ignore = true;
    };
  }, [devCounts, isDevOwner, pending]);

  useEffect(() => {
    let ignore = false;

    async function loadCount() {
      if (!selectedStudent) {
        setServedCount(null);
        return;
      }

      setCountLoading(true);
      try {
        const count = isDevOwner
          ? devCounts[selectedStudent.id] || { served: 0, buybacks: 0, adjusted: 0 }
          : await getBehaviorServedCount(selectedStudent.id);
        if (!ignore) setServedCount(count);
      } catch (err) {
        void reportClientError(err, { source: "operation", operation: "behavior-count" });
        if (!ignore) setError(`Could not load served count: ${err.message}`);
      } finally {
        if (!ignore) setCountLoading(false);
      }
    }

    loadCount();
    return () => {
      ignore = true;
    };
  }, [devCounts, isDevOwner, selectedStudent, pending]);

  const suggestions = useMemo(() => {
    const term = studentQuery.trim().toLowerCase();
    if (!term || selectedStudent?.displayName === studentQuery) return [];
    return students
      .map(normalizeStudent)
      .filter((student) => student.displayName.toLowerCase().includes(term))
      .slice(0, 8);
  }, [selectedStudent, studentQuery, students]);

  const serveFilterOptions = useMemo(() => {
    const unique = (values) => [...new Set(values.filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b));
    return {
      grades: unique(pending.map((record) => record.grade))
    };
  }, [pending]);

  const visiblePending = useMemo(() => {
    const search = serveFilters.search.trim().toLowerCase();
    const rows = pending.filter((record) => {
      if (search && !String(record.studentName || "").toLowerCase().includes(search)) return false;
      if (serveFilters.grade && String(record.grade || "") !== serveFilters.grade) return false;
      return true;
    });

    return [...rows].sort((a, b) => {
      if (serveFilters.sort === "newest") return dateSortValue(b.reteachDate || b.createdAt) - dateSortValue(a.reteachDate || a.createdAt);
      if (serveFilters.sort === "student") return String(a.studentName || "").localeCompare(String(b.studentName || ""));
      if (serveFilters.sort === "grade") return String(a.grade || "").localeCompare(String(b.grade || "")) || String(a.studentName || "").localeCompare(String(b.studentName || ""));
      if (serveFilters.sort === "context") return String(a.context || "").localeCompare(String(b.context || "")) || String(a.studentName || "").localeCompare(String(b.studentName || ""));
      return dateSortValue(a.reteachDate || a.createdAt) - dateSortValue(b.reteachDate || b.createdAt);
    });
  }, [pending, serveFilters]);

  const pendingStudentGroups = useMemo(() => {
    const groups = new Map();
    // The first occurrence preserves the selected queue sort for student cards.
    for (const record of visiblePending) {
      const key = record.studentId || record.id;
      if (!groups.has(key)) groups.set(key, { key, student: record, records: [] });
      groups.get(key).records.push(record);
    }
    return [...groups.values()].map(group => ({
      ...group,
      records: [...group.records].sort((a, b) =>
        dateSortValue(a.reteachDate || a.createdAt) - dateSortValue(b.reteachDate || b.createdAt)
        || dateSortValue(a.createdAt) - dateSortValue(b.createdAt)
        || String(a.id).localeCompare(String(b.id))
      )
    }));
  }, [visiblePending]);

  const pendingByStudent = useMemo(() => pending.reduce((counts, record) => ({
    ...counts,
    [record.studentId]: (counts[record.studentId] || 0) + 1
  }), {}), [pending]);

  const selectedPendingCount = selectedStudent
    ? servedCount?.pending ?? pendingByStudent[selectedStudent.id] ?? 0
    : 0;

  const isPostThreshold = Boolean(selectedStudent && !countLoading && servedCount?.adjusted >= BEHAVIOR_THRESHOLD);
  const situationComplete = Boolean(form.location && form.context);
  const showSituationEditor = !situationComplete || situationEditing;
  const canSubmit = selectedStudent && form.reteachDate && form.location && form.context && form.note.trim() && (!isPostThreshold || (canOverrideThreshold && thresholdAcknowledged)) && !submitting;
  const disabledReason = useMemo(() => {
    if (submitting) return "";
    if (!selectedStudent) {
      return studentQuery.trim()
        ? "Choose a student from the suggestions so the reteach can be attached to the correct student record."
        : "Select a student from the suggestions.";
    }
    if (!form.reteachDate) return "Select a date.";
    if (!form.location) return "Select a location.";
    if (!form.context) return "Select a behavior category.";
    if (!form.note.trim()) return "Enter a brief reteach note.";
    if (isPostThreshold && !canOverrideThreshold) return "This student has reached the six-reteach threshold.";
    if (isPostThreshold && !thresholdAcknowledged) return "Acknowledge the escalation threshold before adding this reteach.";
    return "";
  }, [canOverrideThreshold, form.context, form.location, form.note, form.reteachDate, isPostThreshold, selectedStudent, studentQuery, submitting, thresholdAcknowledged]);

  function selectStudent(student) {
    const normalized = normalizeStudent(student);
    resetDraft();
    setServedCount(null);
    setSelectedStudent(normalized);
    setStudentQuery(normalized.displayName);
    setMessage("");
    setError("");
  }

  function resetDraft() {
    setForm({ reteachDate: todayInputValue(), location: "", context: "", note: "" });
    setSituationEditing(true);
    setThresholdAcknowledged(false);
  }

  function clearForm() {
    resetDraft();
    setSelectedStudent(null);
    setStudentQuery("");
    setServedCount(null);
  }

  function handleTabChange(nextTab) {
    setActiveTab(nextTab);
    setMessage("");
    setError("");
    setUndoRecord(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!selectedStudent) {
      setError("Select a student before submitting.");
      return;
    }
    if (!canSubmit) {
      setError("Complete all required fields before submitting.");
      return;
    }

    setSubmitting(true);
    let countAtSubmission;
    try {
      countAtSubmission = isDevOwner
        ? devCounts[selectedStudent.id] || { served: 0, buybacks: 0, adjusted: 0 }
        : await getBehaviorServedCount(selectedStudent.id);
      setServedCount(countAtSubmission);
    } catch (err) {
      void reportClientError(err, { source: "operation", operation: "behavior-count" });
      setError(`Could not verify the student reteach count: ${err.message}`);
      setSubmitting(false);
      return;
    }

    const postThresholdAtSubmission = countAtSubmission.adjusted >= BEHAVIOR_THRESHOLD;
    if (postThresholdAtSubmission && !canOverrideThreshold) {
      setError("This student has reached the six-reteach threshold. No additional reteach can be added.");
      setSubmitting(false);
      return;
    }
    if (postThresholdAtSubmission && !thresholdAcknowledged) {
      setError("Acknowledge the escalation threshold before adding this reteach.");
      setSubmitting(false);
      return;
    }

    const payload = {
      studentId: selectedStudent.id,
      studentName: selectedStudent.displayName,
      grade: selectedStudent.grade,
      homeroom: selectedStudent.homeroom,
      assignedByUid: user?.uid || "",
      assignedByName: teacherName,
      reteachDate: form.reteachDate,
      note: form.note.trim(),
      location: form.location,
      context: form.context,
      postThreshold: postThresholdAtSubmission,
      thresholdAcknowledged: postThresholdAtSubmission && thresholdAcknowledged,
      servedCountAtAssignment: countAtSubmission.adjusted
    };

    try {
      if (isDevOwner) {
        const devRecord = {
            id: `dev-reteach-${Date.now()}`,
            ...payload,
            status: "pending",
            createdAt: new Date(),
            servedAt: null,
            servedByUid: null,
            servedByName: null,
            servedPostThreshold: false
          };
        setPending((rows) => [devRecord, ...rows]);
        setMyReteaches((rows) => [devRecord, ...rows]);
      } else {
        const created = await createBehaviorReteach(payload, { allowPostThreshold: canOverrideThreshold });
        if (created.homeContactRequired) {
          setMessage("Reteach Added — Home contact required");
          clearForm();
          setActiveTab("mine");
          return;
        }
      }
      setMessage("Reteach Added");
      clearForm();
      setActiveTab("serve");
    } catch (err) {
      void reportClientError(err, { source: "operation", operation: "behavior-create" });
      setError(`Could not create behavior reteach: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  function mayCancel(record) {
    return (isDevOwner && record.status === "pending") || canCancelBehaviorReteach(profile, user?.uid, record);
  }

  function cancelButton(record, subtle = false) {
    const allowed = mayCancel(record);
    const label = allowed ? `Cancel Reteach for ${record.studentName}` : "Only the Assigning Teacher or an Admin Can Cancel";
    return <span title={label} className="inline-flex shrink-0">
      <button type="button" aria-label={label} disabled={!allowed || servingIds.includes(record.id)} onClick={() => setCancellingRecord(record)}
        className={subtle ? "inline-flex h-12 w-12 items-center justify-center rounded-lg border border-red-100 bg-red-50/40 text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300" : "inline-flex h-12 w-12 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300"}>
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </span>;
  }

  async function handleCancelReteach(details) {
    const record = cancellingRecord;
    if (!record || !mayCancel(record)) throw new Error("You do not have permission to cancel this reteach.");
    if (isDevOwner) {
      const cancellation = { status: "cancelled", cancelledAt: new Date(), cancelledByUid: user.uid, cancelledByName: teacherName, cancellationReason: details.reason, cancellationNote: details.note.trim() };
      setMyReteaches(rows => rows.map(row => row.id === record.id ? { ...row, ...cancellation } : row));
      setHomeContactRequirements(rows => rows.map(row => row.reteachId === record.id && row.status === "pending" ? { ...row, ...cancellation } : row));
    } else {
      await cancelBehaviorReteach(record.id, details, { uid: user.uid, name: teacherName });
    }
    setPending(rows => rows.filter(row => row.id !== record.id));
    setCancellingRecord(null);
    setError("");
    setMessage(`${record.studentName}: Reteach Cancelled — ${details.reason}.`);
  }

  async function handleServed(record) {
    if (servingIds.includes(record.id)) return;
    setMessage("");
    setError("");
    setServingIds((ids) => [...ids, record.id]);

    try {
      if (isDevOwner) {
        setPending((rows) => rows.filter((row) => row.id !== record.id));
        setMyReteaches((rows) => rows.map((row) => row.id === record.id ? {
          ...row,
          status: "served",
          servedAt: new Date(),
          servedByUid: user?.uid || "",
          servedByName: teacherName,
          servedPostThreshold: (pendingCounts[record.studentId]?.adjusted || 0) >= BEHAVIOR_THRESHOLD
        } : row));
        setDevCounts((counts) => {
          const current = counts[record.studentId] || { served: 0, buybacks: 0, adjusted: 0, servedRecords: [] };
          const nextServed = current.served + 1;
          const nextCount = {
            ...current,
            served: nextServed,
            adjusted: Math.max(0, nextServed - current.buybacks),
            servedRecords: [
              ...(current.servedRecords || []),
              {
                id: `${record.id}-served`,
                reteachDate: record.reteachDate,
                assignedByName: record.assignedByName,
                context: record.context,
                location: record.location,
                postThreshold: record.postThreshold,
                servedPostThreshold: (pendingCounts[record.studentId]?.adjusted || 0) >= BEHAVIOR_THRESHOLD
              }
            ]
          };
          return { ...counts, [record.studentId]: nextCount };
        });
      } else {
        await markBehaviorReteachServed(record.id, {
          uid: user?.uid || "",
          name: teacherName,
          servedPostThreshold: (pendingCounts[record.studentId]?.adjusted || 0) >= BEHAVIOR_THRESHOLD
        });
      }
      setPending((rows) => rows.filter((row) => row.id !== record.id));
      setMyReteaches((rows) => rows.map((row) => row.id === record.id ? {
        ...row,
        status: "served",
        servedAt: new Date(),
        servedByUid: user?.uid || "",
        servedByName: teacherName,
        servedPostThreshold: (pendingCounts[record.studentId]?.adjusted || 0) >= BEHAVIOR_THRESHOLD
      } : row));
      setMessage(`${record.studentName} marked served.`);
      setUndoRecord(record);
    } catch (err) {
      void reportClientError(err, { source: "operation", operation: "behavior-serve" });
      setError(`Could not mark served: ${err.message}`);
    } finally {
      setServingIds((ids) => ids.filter((id) => id !== record.id));
    }
  }

  async function handleGenerateReport(record) {
    if (generatingReportIds.includes(record.id)) return;
    setGeneratingReportIds((ids) => [...ids, record.id]);
    setError("");
    try {
      await downloadReteachReport(record);
    } catch (err) {
      void reportClientError(err, { source: "operation", operation: "behavior-pdf" });
      setError(`Could not generate report: ${err.message}`);
    } finally {
      setGeneratingReportIds((ids) => ids.filter((id) => id !== record.id));
    }
  }

  async function handleUndoServed() {
    if (!undoRecord || undoing) return;

    setUndoing(true);
    setError("");
    try {
      if (isDevOwner) {
        setPending((rows) => rows.some((row) => row.id === undoRecord.id) ? rows : [undoRecord, ...rows]);
        setMyReteaches((rows) => rows.map((row) => row.id === undoRecord.id ? {
          ...row,
          status: "pending",
          servedAt: null,
          servedByUid: null,
          servedByName: null,
          servedPostThreshold: false
        } : row));
        setDevCounts((counts) => {
          const current = counts[undoRecord.studentId] || { served: 0, buybacks: 0, adjusted: 0, servedRecords: [] };
          const nextServed = Math.max(0, current.served - 1);
          return {
            ...counts,
            [undoRecord.studentId]: {
              ...current,
              served: nextServed,
              adjusted: Math.max(0, nextServed - current.buybacks),
              servedRecords: (current.servedRecords || []).filter((item) => item.id !== `${undoRecord.id}-served`)
            }
          };
        });
      } else {
        await restoreBehaviorReteachPending(undoRecord.id, { uid: user?.uid || "", name: teacherName });
      }
      setPending((rows) => rows.some((row) => row.id === undoRecord.id) ? rows : [undoRecord, ...rows]);
      setMyReteaches((rows) => rows.map((row) => row.id === undoRecord.id ? {
        ...row,
        status: "pending",
        servedAt: null,
        servedByUid: null,
        servedByName: null,
        servedPostThreshold: false
      } : row));
      setMessage(`${undoRecord.studentName} returned to To Serve.`);
      setUndoRecord(null);
    } catch (err) {
      void reportClientError(err, { source: "operation", operation: "behavior-undo" });
      setError(`Could not undo served status: ${err.message}`);
    } finally {
      setUndoing(false);
    }
  }

  async function handleRecordHomeContact(requirement, details) {
    setContactSaving(true);
    setError("");
    try {
      await recordHomeContactAttempt(requirement.id, details, {
        uid: user?.uid || "",
        name: teacherName
      });
      setEditingHomeContactId(null);
      setMessage(`Home contact attempt recorded for ${requirement.studentName}.`);
    } catch (err) {
      void reportClientError(err, { source: "operation", operation: "behavior-contact" });
      setError(`Could not record home contact: ${err.message}`);
    } finally {
      setContactSaving(false);
    }
  }

  useEffect(() => {
    if (!message) return undefined;
    const timeout = window.setTimeout(() => {
      setMessage("");
      setUndoRecord(null);
    }, undoRecord ? 6500 : 4000);
    return () => window.clearTimeout(timeout);
  }, [message, undoRecord]);

  const visibleMessage = message;

  return (
    <div className={`mx-auto space-y-6 pb-10 ${activeTab === "serve" ? "pt-2 sm:pt-3" : "pt-5 sm:pt-9"} ${activeTab === "assign" && !selectedStudent ? "max-w-5xl" : "max-w-6xl"}`}>
      <header className="space-y-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Behavior Workspace</h1>
          <p className="mt-3 text-base leading-6 text-slate-600">Assign reteaches and track service.</p>
        </div>
        <div role="group" aria-label="Behavior views" className="flex gap-3 overflow-x-auto border-b border-slate-200 sm:gap-5">
          <TabButton active={activeTab === "assign"} onClick={() => handleTabChange("assign")}>New Reteach</TabButton>
          <TabButton active={activeTab === "serve"} onClick={() => handleTabChange("serve")}>To Serve <TabCount active={activeTab === "serve"}>{pendingLoading ? "…" : pending.length}</TabCount></TabButton>
          <TabButton active={activeTab === "mine"} onClick={() => handleTabChange("mine")}>
            My Reteaches
            {pendingHomeContacts.length > 0 && <TabCount active={activeTab === "mine"} attention>{pendingHomeContacts.length}</TabCount>}
          </TabButton>
          <div className="ml-auto shrink-0 pl-5 sm:pl-10">
            <TabButton active={activeTab === "stats"} onClick={() => handleTabChange("stats")}>Student Stats</TabButton>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {visibleMessage && (
        <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-2.5rem)] items-center gap-3 rounded-xl border border-emerald-700 bg-emerald-950 px-4 py-3 text-sm font-semibold text-white shadow-xl">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
          <span>{visibleMessage}</span>
          {undoRecord && activeTab === "serve" && (
            <button
              type="button"
              onClick={handleUndoServed}
              disabled={undoing}
              className="ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white transition active:translate-y-px hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60"
            >
              <Undo2 className="h-3.5 w-3.5" />
              {undoing ? "Undoing…" : "Undo"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMessage("");
              setUndoRecord(null);
            }}
            className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-lg font-normal leading-none text-emerald-100 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}

      {pendingHomeContacts.length > 0 && (
        <button
          type="button"
          onClick={() => handleTabChange("mine")}
          className="flex w-full items-center justify-between gap-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left text-amber-950 shadow-sm transition hover:border-amber-400 hover:bg-amber-100/70"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><PhoneCall className="h-5 w-5" /></span>
            <span>
              <span className="block text-sm font-bold">Required Home Contact Follow-Up</span>
              <span className="mt-0.5 block text-sm">{pendingHomeContacts.length} contact {pendingHomeContacts.length === 1 ? "attempt needs" : "attempts need"} to be recorded.</span>
            </span>
          </span>
          <span className="shrink-0 text-xs font-bold uppercase tracking-wide">View Follow-Up</span>
        </button>
      )}

      {activeTab === "assign" && !pendingLoading && pending.length > 0 && (
        <section aria-label="Host reteaches" className="flex flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-emerald-950">
              {pending.length} {pending.length === 1 ? "Reteach" : "Reteaches"} Awaiting Service
            </h2>
            <p className="mt-1 text-sm leading-6 text-emerald-900">Hosting reteaches today? Open the queue to record service.</p>
          </div>
          <button
            type="button"
            onClick={() => handleTabChange("serve")}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 sm:self-auto"
          >
            View List <span aria-hidden="true">→</span>
          </button>
        </section>
      )}

      {activeTab === "assign" ? (
        <BehaviorAssignmentForm
          handleSubmit={handleSubmit}
          selectedStudent={selectedStudent}
          situationComplete={situationComplete}
          studentQuery={studentQuery}
          setStudentQuery={setStudentQuery}
          setSelectedStudent={setSelectedStudent}
          suggestions={suggestions}
          selectStudent={selectStudent}
          resetDraft={resetDraft}
          setServedCount={setServedCount}
          isPostThreshold={isPostThreshold}
          canOverrideThreshold={canOverrideThreshold}
          thresholdAcknowledged={thresholdAcknowledged}
          setThresholdAcknowledged={setThresholdAcknowledged}
          form={form}
          setForm={setForm}
          setSituationEditing={setSituationEditing}
          teacherName={teacherName}
          showSituationEditor={showSituationEditor}
          disabledReason={disabledReason}
          clearForm={clearForm}
          canSubmit={canSubmit}
          servedCount={servedCount}
          selectedPendingCount={selectedPendingCount}
          countLoading={countLoading}
        />
      ) : activeTab === "stats" ? (
        <BehaviorStudentStats students={students} profile={profile} devCounts={isDevOwner ? devCounts : null} />
      ) : activeTab === "serve" ? (
        <PendingReteaches
          pending={pending}
          serveFilters={serveFilters}
          setServeFilters={setServeFilters}
          serveFilterOptions={serveFilterOptions}
          visiblePending={visiblePending}
          handleTabChange={handleTabChange}
          pendingStudentGroups={pendingStudentGroups}
          pendingCounts={pendingCounts}
          handleGenerateReport={handleGenerateReport}
          generatingReportIds={generatingReportIds}
          handleServed={handleServed}
          servingIds={servingIds}
          cancelButton={cancelButton}
        />
      ) : (
        <MyReteaches
          setMyStatusFilter={setMyStatusFilter}
          myStatusFilter={myStatusFilter}
          myReteachCounts={myReteachCounts}
          visibleMyReteaches={visibleMyReteaches}
          homeContactByReteach={homeContactByReteach}
          cancelButton={cancelButton}
          editingHomeContactId={editingHomeContactId}
          setEditingHomeContactId={setEditingHomeContactId}
          contactSaving={contactSaving}
          handleRecordHomeContact={handleRecordHomeContact}
        />
      )}
      {cancellingRecord && <CancelReteachDialog key={cancellingRecord.id} record={cancellingRecord} onClose={() => setCancellingRecord(null)} onConfirm={handleCancelReteach} />}
    </div>
  );
}
