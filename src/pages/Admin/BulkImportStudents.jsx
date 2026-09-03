import React, { useEffect, useMemo, useState } from "react";
import { Check, ClipboardPaste, Pencil, Search, ShieldCheck, Trash2, Upload, UsersRound, X } from "lucide-react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { importStudentRoster, previewStudentRosterImport, updateStudentRecord } from "../../services/academic";
import { buildManualRosterRow, parseRosterText, redactRosterText, revalidateRosterRows } from "../../utils/studentRosterImport";

function AdminTabButton({ active, children, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`h-8 rounded-md px-3 text-xs font-semibold transition active:translate-y-px focus:outline-none focus:ring-2 focus:ring-sky-400 ${active ? "bg-white text-sky-800 shadow-sm" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"}`}>
      {children}
    </button>
  );
}

function StatusBadge({ status }) {
  const styles = {
    new: "border-emerald-200 bg-emerald-50 text-emerald-800",
    update: "border-amber-200 bg-amber-50 text-amber-800",
    unchanged: "border-slate-200 bg-slate-50 text-slate-600",
    link: "border-violet-200 bg-violet-50 text-violet-800",
    invalid: "border-red-200 bg-red-50 text-red-800",
    checking: "border-sky-200 bg-sky-50 text-sky-800"
  };
  const labels = { new: "New", update: "Will update", link: "Will link", unchanged: "Unchanged", invalid: "Needs review", checking: "Checking" };
  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${styles[status] || styles.checking}`}>{labels[status] || labels.checking}</span>;
}

export default function BulkImportStudents() {
  const [activeView, setActiveView] = useState("import");
  const [raw, setRaw] = useState("");
  const parsedRows = useMemo(() => parseRosterText(raw), [raw]);
  const [rowChanges, setRowChanges] = useState({});
  const [removedRowNumbers, setRemovedRowNumbers] = useState(() => new Set());
  const editableRows = useMemo(() => revalidateRosterRows(parsedRows
    .filter(row => !removedRowNumbers.has(row.rowNumber))
    .map(row => ({ ...row, ...(rowChanges[row.rowNumber] || {}) }))), [parsedRows, removedRowNumbers, rowChanges]);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [students, setStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [editingStudent, setEditingStudent] = useState(null);
  const [editForm, setEditForm] = useState({ displayName: "", grade: "", homeroom: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [manualDraft, setManualDraft] = useState({ studentName: "", externalStudentId: "", grade: "", homeroom: "" });
  const [manualSaving, setManualSaving] = useState(false);
  const [manualMessage, setManualMessage] = useState(null);

  useEffect(() => onSnapshot(
    query(collection(db, "students"), orderBy("displayName", "asc")),
    snapshot => setStudents(snapshot.docs.map(studentDoc => ({ id: studentDoc.id, ...studentDoc.data() }))),
    error => setEditMessage(`Students could not be loaded: ${error.message}`)
  ), []);

  useEffect(() => {
    let ignore = false;
    if (!editableRows.length) {
      setPreviewRows([]);
      setPreviewing(false);
      return undefined;
    }
    setPreviewing(true);
    const timer = setTimeout(async () => {
      try {
        const preview = await previewStudentRosterImport(editableRows);
        if (!ignore) setPreviewRows(preview);
      } catch {
        if (!ignore) setPreviewRows(editableRows.map(row => ({ ...row, status: row.valid ? "checking" : "invalid" })));
      } finally {
        if (!ignore) setPreviewing(false);
      }
    }, 250);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [editableRows]);

  const previewIsCurrent = previewRows.length === editableRows.length && previewRows.every((row, index) => {
    const editable = editableRows[index];
    return row.rowNumber === editable?.rowNumber
      && row.studentName === editable.studentName
      && row.grade === editable.grade
      && row.homeroomSource === editable.homeroomSource;
  });
  const rows = previewIsCurrent ? previewRows : editableRows.map(row => ({ ...row, status: row.valid ? "checking" : "invalid" }));
  const invalidCount = rows.filter(row => !row.valid).length;
  const importableCount = rows.filter(row => row.valid).length;
  const filteredStudents = useMemo(() => {
    const term = studentSearch.trim().toLowerCase();
    return students.filter(student => !term || [student.displayName, student.grade, student.homeroom].some(value => String(value || "").toLowerCase().includes(term)));
  }, [studentSearch, students]);

  async function handleImport(event) {
    event.preventDefault();
    if (!rows.length || invalidCount || previewing) return;
    setBusy(true);
    setReport(null);
    try {
      const result = await importStudentRoster(rows);
      setReport(result);
      const refreshed = await previewStudentRosterImport(editableRows);
      setPreviewRows(refreshed);
    } catch {
      setReport({ ok: false, error: "The roster could not be imported. No student identifiers were displayed or logged." });
    } finally {
      setBusy(false);
    }
  }

  function updateImportRow(rowNumber, field, value) {
    setRowChanges(current => ({
      ...current,
      [rowNumber]: { ...(current[rowNumber] || {}), [field]: value },
    }));
    setReport(null);
  }

  function removeImportRow(rowNumber) {
    setRemovedRowNumbers(current => new Set(current).add(rowNumber));
    setPreviewRows([]);
    setReport(null);
  }

  function clearImport() {
    setRaw("");
    setRowChanges({});
    setRemovedRowNumbers(new Set());
    setPreviewRows([]);
    setReport(null);
  }

  function beginEdit(student) {
    setEditingStudent(student);
    setEditForm({ displayName: student.displayName || "", grade: student.grade || "", homeroom: student.homeroom || "" });
    setEditMessage("");
  }

  async function saveStudentEdit(event) {
    event.preventDefault();
    if (!editingStudent || !editForm.displayName.trim()) return;
    setEditSaving(true);
    setEditMessage("");
    try {
      await updateStudentRecord(editingStudent.id, editForm);
      setEditMessage(`${editForm.displayName.trim()} was updated.`);
      setEditingStudent(null);
    } catch (error) {
      setEditMessage(`Student could not be updated: ${error.message}`);
    } finally {
      setEditSaving(false);
    }
  }

  async function addIndividualStudent(event) {
    event.preventDefault();
    const row = buildManualRosterRow(manualDraft);
    if (!row.valid) {
      setManualMessage({ ok: false, text: row.errors.join(" · ") });
      return;
    }
    setManualSaving(true);
    setManualMessage(null);
    try {
      const [preview] = await previewStudentRosterImport([row]);
      if (preview.status !== "new") {
        setManualMessage({ ok: false, text: "That Student ID or exact student record already exists. Use Manage Students to edit the existing record." });
        return;
      }
      const result = await importStudentRoster([preview]);
      if (!result.ok || result.created !== 1) throw new Error("Student was not created");
      setManualMessage({ ok: true, text: `${row.displayName} was added to the school roster.` });
      setManualDraft({ studentName: "", externalStudentId: "", grade: "", homeroom: "" });
    } catch (error) {
      setManualMessage({ ok: false, text: `Student could not be added: ${error.message}` });
    } finally {
      setManualSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700 shadow-sm ring-1 ring-sky-200"><Upload className="h-5 w-5" aria-hidden="true" /></div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-sky-800">Admin workspace</div>
            <div className="mt-0.5 text-sm text-slate-600">Import rosters and maintain student directory information.</div>
          </div>
        </div>
        <div className="inline-flex self-start gap-1 rounded-md border border-slate-200 bg-slate-50/70 p-0.5 sm:self-auto">
          <AdminTabButton active={activeView === "import"} onClick={() => setActiveView("import")}>Import Roster</AdminTabButton>
          <AdminTabButton active={activeView === "add"} onClick={() => setActiveView("add")}>Add Student</AdminTabButton>
          <AdminTabButton active={activeView === "manage"} onClick={() => setActiveView("manage")}>Manage Students</AdminTabButton>
        </div>
      </header>

      {activeView === "import" ? (
        <>
          <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="flex gap-2.5">
                <ClipboardPaste className="mt-0.5 h-5 w-5 text-slate-500" aria-hidden="true" />
                <div>
                  <h1 className="text-base font-bold text-slate-950">Paste spreadsheet rows</h1>
                  <p className="mt-1 text-sm text-slate-600">Copy Student Name, Student ID, Grade Level, and Homeroom. Names must use LastName, FirstName format; middle names are omitted, and only the teacher name is stored from Homeroom.</p>
                </div>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" />Student IDs stay hidden</div>
            </div>
            <textarea
              aria-label="Paste student roster"
              className="h-44 w-full resize-y rounded-lg border border-slate-300 bg-white p-3 font-mono text-sm leading-6 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              placeholder={`Student Name\tStudent ID\tGrade Level\tHomeroom\nSmith, Jordan\t[hidden]\t7\tHomeroom 7th Carter`}
              value={redactRosterText(raw)}
              readOnly={Boolean(raw)}
              onPaste={event => {
                event.preventDefault();
                setRaw(event.clipboardData.getData("text"));
                setRowChanges({});
                setRemovedRowNumbers(new Set());
                setPreviewRows([]);
                setReport(null);
              }}
              onChange={event => {
                if (!raw) setRaw(event.target.value);
                setReport(null);
              }}
            />
            {raw && <div className="mt-2 flex items-center justify-between gap-4"><p className="text-xs text-slate-500">Correct rows in the preview below. Student IDs remain protected.</p><button type="button" onClick={clearImport} className="text-xs font-semibold text-slate-600 hover:text-slate-900">Clear pasted roster</button></div>}
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-md shadow-slate-200/40">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div><h2 className="text-base font-bold text-slate-950">Import preview</h2><p className="mt-0.5 text-sm text-slate-600">{rows.length} {rows.length === 1 ? "row" : "rows"}{invalidCount ? ` • ${invalidCount} need review` : " ready for review"}</p></div>
              <button type="button" onClick={handleImport} disabled={busy || previewing || !importableCount || invalidCount > 0} className="inline-flex h-10 items-center rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-45">{busy ? "Importing…" : `Import ${importableCount} ${importableCount === 1 ? "student" : "students"}`}</button>
            </div>
            {report && <div className={`m-4 rounded-lg border px-4 py-3 text-sm ${report.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>{report.ok ? `${report.created} created, ${report.updated} updated, ${report.unchanged} unchanged, ${report.skipped} skipped.` : report.error}</div>}
            <div className="max-h-80 overflow-auto">
              <table className="min-w-full table-fixed text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="w-16 px-3 py-2.5">Row</th><th className="px-3 py-2.5">Student Name</th><th className="w-28 px-3 py-2.5">Grade</th><th className="w-72 px-3 py-2.5">Homeroom</th><th className="w-32 px-3 py-2.5">Status</th><th className="w-16 px-3 py-2.5"><span className="sr-only">Remove</span></th></tr></thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.map(row => <tr key={row.rowNumber} className={row.valid ? "hover:bg-sky-50/40" : "bg-red-50/40"}><td className="px-3 py-3 tabular-nums text-slate-500">{row.rowNumber}</td><td className="px-3 py-3"><input aria-label={`Student name for row ${row.rowNumber}`} value={row.studentName} onChange={event => updateImportRow(row.rowNumber, "studentName", event.target.value)} className={`h-9 w-full rounded-md border bg-white px-2.5 text-sm font-medium outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 ${row.errors.some(error => error.startsWith("Student name")) ? "border-red-300" : "border-slate-300"}`} />{row.errors.length > 0 && <div className="mt-1.5 text-xs leading-5 text-red-700">{row.errors.join(" · ")}</div>}</td><td className="px-3 py-3"><input aria-label={`Grade for row ${row.rowNumber}`} value={row.grade} onChange={event => updateImportRow(row.rowNumber, "grade", event.target.value)} className={`h-9 w-full rounded-md border bg-white px-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 ${row.errors.includes("Grade level is missing") ? "border-red-300" : "border-slate-300"}`} /></td><td className="px-3 py-3"><input aria-label={`Homeroom for row ${row.rowNumber}`} value={row.homeroomSource} onChange={event => updateImportRow(row.rowNumber, "homeroomSource", event.target.value)} className={`h-9 w-full rounded-md border bg-white px-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 ${row.errors.some(error => error.startsWith("Homeroom")) ? "border-red-300" : "border-slate-300"}`} /></td><td className="px-3 py-3"><StatusBadge status={previewing && row.valid ? "checking" : row.status} /></td><td className="px-3 py-3 text-right"><button type="button" onClick={() => removeImportRow(row.rowNumber)} aria-label={`Remove row ${row.rowNumber}`} title="Remove row" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-300"><Trash2 className="h-4 w-4" /></button></td></tr>)}
                  {!rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">{raw ? "All pasted rows have been removed." : "Paste spreadsheet rows above to create a safe import preview."}</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : activeView === "add" ? (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-md shadow-slate-200/40">
          <div className="border-b border-slate-200 px-5 py-4">
            <h1 className="text-base font-bold text-slate-950">Add an individual student</h1>
            <p className="mt-1 text-sm text-slate-600">Create a schoolwide roster record using the same protected identity matching as bulk import.</p>
          </div>
          <form onSubmit={addIndividualStudent} className="p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">Student Name
                <input autoFocus required value={manualDraft.studentName} onChange={event => setManualDraft(draft => ({ ...draft, studentName: event.target.value }))} placeholder="LastName, FirstName" className="mt-1.5 block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200" />
                <span className="mt-1 block text-xs font-normal text-slate-500">Middle names are omitted automatically.</span>
              </label>
              <label className="text-sm font-semibold text-slate-700">Student ID
                <input required autoComplete="off" value={manualDraft.externalStudentId} onChange={event => setManualDraft(draft => ({ ...draft, externalStudentId: event.target.value }))} className="mt-1.5 block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200" />
                <span className="mt-1 block text-xs font-normal text-slate-500">Used for duplicate protection, then stored only as a secure hash.</span>
              </label>
              <label className="text-sm font-semibold text-slate-700">Grade Level
                <input required value={manualDraft.grade} onChange={event => setManualDraft(draft => ({ ...draft, grade: event.target.value }))} placeholder="e.g. 7" className="mt-1.5 block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200" />
              </label>
              <label className="text-sm font-semibold text-slate-700">Homeroom Teacher
                <input required value={manualDraft.homeroom} onChange={event => setManualDraft(draft => ({ ...draft, homeroom: event.target.value }))} placeholder="Teacher name only" className="mt-1.5 block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200" />
              </label>
            </div>
            {manualMessage && <div role={manualMessage.ok ? "status" : "alert"} className={`mt-5 rounded-lg border px-4 py-3 text-sm ${manualMessage.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>{manualMessage.text}</div>}
            <div className="mt-5 flex justify-end"><button type="submit" disabled={manualSaving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-50"><Check className="h-4 w-4" />{manualSaving ? "Adding…" : "Add Student"}</button></div>
          </form>
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-md shadow-slate-200/40">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-base font-bold text-slate-950">Manage students</h1><p className="mt-0.5 text-sm text-slate-600">Edit names, grade levels, and homerooms without changing record identity.</p></div><div className="relative w-80"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="Search students" value={studentSearch} onChange={event => setStudentSearch(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200" placeholder="Search students…" /></div></div>
          </div>
          {editingStudent && <form onSubmit={saveStudentEdit} className="grid grid-cols-[minmax(18rem,1fr)_10rem_18rem_auto] items-end gap-3 border-b border-sky-200 bg-sky-50/60 p-4"><label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Student name</span><input value={editForm.displayName} onChange={event => setEditForm(form => ({ ...form, displayName: event.target.value }))} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" required /></label><label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Grade</span><input value={editForm.grade} onChange={event => setEditForm(form => ({ ...form, grade: event.target.value }))} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></label><label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Homeroom</span><input value={editForm.homeroom} onChange={event => setEditForm(form => ({ ...form, homeroom: event.target.value }))} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></label><div className="flex gap-2"><button type="submit" disabled={editSaving} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-sky-700 px-3 text-sm font-semibold text-white disabled:opacity-50"><Check className="h-4 w-4" />{editSaving ? "Saving…" : "Save"}</button><button type="button" onClick={() => setEditingStudent(null)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"><X className="h-4 w-4" />Cancel</button></div></form>}
          {editMessage && <div aria-live="polite" className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700">{editMessage}</div>}
          <table className="min-w-full table-fixed text-sm"><thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2.5">Student</th><th className="w-36 px-4 py-2.5">Grade</th><th className="w-72 px-4 py-2.5">Homeroom</th><th className="w-28 px-4 py-2.5 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-200">{filteredStudents.map(student => <tr key={student.id} className="hover:bg-sky-50/40"><td className="px-4 py-3 font-semibold text-slate-950">{student.displayName || "Unnamed student"}</td><td className="px-4 py-3 text-slate-600">{student.grade || "—"}</td><td className="px-4 py-3 text-slate-600">{student.homeroom || "—"}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => beginEdit(student)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" />Edit</button></td></tr>)}{!filteredStudents.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">No students match this search.</td></tr>}</tbody></table>
          <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-xs font-semibold text-slate-500"><UsersRound className="h-4 w-4" />{filteredStudents.length} of {students.length} students</div>
        </section>
      )}
    </div>
  );
}
