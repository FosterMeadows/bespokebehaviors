import React, { useContext, useEffect, useMemo, useState } from "react";
import { Check, Search, UserCog, Users, X } from "lucide-react";
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, writeBatch } from "firebase/firestore";
import { AuthContext } from "../../AuthContext.jsx";
import { db } from "../../firebaseConfig";

const ROLE_OPTIONS = [
  { value: "teacher", label: "Teacher (Academic + Behavior)" },
  { value: "admin", label: "Admin" }
];
const GRADE_OPTIONS = ["6", "7", "8"];

function isPending(teacher) {
  return !teacher.disabled && !(teacher.roles || []).length;
}

export default function TeacherAccess() {
  const { user } = useContext(AuthContext);
  const [teachers, setTeachers] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkGrades, setBulkGrades] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ roles: [], gradeLevels: [], disabled: false });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [accessEvents, setAccessEvents] = useState([]);

  useEffect(() => onSnapshot(
    query(collection(db, "teachers"), orderBy("displayName", "asc")),
    snapshot => setTeachers(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
    error => setMessage(`Teacher accounts could not be loaded: ${error.message}`)
  ), []);

  useEffect(() => onSnapshot(
    query(collection(db, "teacherAccessEvents"), orderBy("occurredAt", "desc"), limit(30)),
    snapshot => setAccessEvents(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
    error => setMessage(`Access history could not be loaded: ${error.message}`)
  ), []);

  const visibleTeachers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return teachers
      .filter(teacher => {
        const pending = isPending(teacher);
        const active = !teacher.disabled && (teacher.roles || []).length > 0;
        const statusMatches = statusFilter === "all"
          || (statusFilter === "pending" && pending)
          || (statusFilter === "active" && active)
          || (statusFilter === "disabled" && teacher.disabled);
        const textMatches = !term || [teacher.displayName, teacher.contactEmail]
          .some(value => String(value || "").toLowerCase().includes(term));
        return statusMatches && textMatches;
      })
      .sort((a, b) => {
        if (isPending(a) !== isPending(b)) return isPending(a) ? -1 : 1;
        return String(a.displayName || a.contactEmail || "").localeCompare(String(b.displayName || b.contactEmail || ""));
      });
  }, [search, statusFilter, teachers]);

  const selectableTeachers = useMemo(
    () => visibleTeachers.filter(teacher => teacher.id !== user?.uid && !(teacher.roles || []).includes("owner")),
    [user?.uid, visibleTeachers]
  );
  const allVisibleSelected = selectableTeachers.length > 0 && selectableTeachers.every(teacher => selectedIds.has(teacher.id));
  const pendingCount = teachers.filter(isPending).length;

  function accessEvent(teacher, nextAccess) {
    return {
      targetUid: teacher.id,
      targetDisplayName: teacher.displayName || "Teacher",
      targetEmail: teacher.contactEmail || "",
      previousRoles: Array.isArray(teacher.roles) ? teacher.roles : [],
      previousGradeLevels: Array.isArray(teacher.gradeLevels) ? teacher.gradeLevels.map(String) : [],
      previousDisabled: teacher.disabled === true,
      nextRoles: nextAccess.roles,
      nextGradeLevels: nextAccess.gradeLevels,
      nextDisabled: nextAccess.disabled,
      actorUid: user?.uid || "",
      occurredAt: serverTimestamp()
    };
  }

  function beginEdit(teacher) {
    const existingRoles = Array.isArray(teacher.roles) ? teacher.roles : [];
    setEditing(teacher);
    setForm({
      roles: [
        ...(existingRoles.includes("academic") || existingRoles.includes("behavior") ? ["teacher"] : []),
        ...(existingRoles.includes("admin") ? ["admin"] : [])
      ],
      gradeLevels: Array.isArray(teacher.gradeLevels) ? teacher.gradeLevels.map(String) : [],
      disabled: teacher.disabled === true
    });
    setMessage("");
  }

  function toggleList(field, value) {
    setForm(current => ({
      ...current,
      [field]: current[field].includes(value) ? current[field].filter(item => item !== value) : [...current[field], value]
    }));
  }

  function toggleSelection(teacherId) {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(teacherId)) next.delete(teacherId);
      else next.add(teacherId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds(current => {
      const next = new Set(current);
      if (allVisibleSelected) selectableTeachers.forEach(teacher => next.delete(teacher.id));
      else selectableTeachers.forEach(teacher => next.add(teacher.id));
      return next;
    });
  }

  function toggleBulkGrade(grade) {
    setBulkGrades(current => current.includes(grade) ? current.filter(item => item !== grade) : [...current, grade].sort());
  }

  async function saveAccess(event) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setMessage("");
    try {
      const preservedRoles = (editing.roles || []).filter(role => role === "owner" || role === "mtssLead");
      const configuredRoles = [
        ...(form.roles.includes("teacher") ? ["academic", "behavior"] : []),
        ...(form.roles.includes("admin") ? ["admin"] : [])
      ];
      if (configuredRoles.some(role => role === "academic" || role === "behavior") && form.gradeLevels.length === 0) {
        throw new Error("Select at least one grade for teacher access.");
      }
      const nextAccess = {
        roles: [...new Set([...preservedRoles, ...configuredRoles])],
        gradeLevels: [...form.gradeLevels].sort(),
        disabled: form.disabled
      };
      const batch = writeBatch(db);
      batch.update(doc(db, "teachers", editing.id), nextAccess);
      batch.set(doc(collection(db, "teacherAccessEvents")), accessEvent(editing, nextAccess));
      await batch.commit();
      setMessage(`${editing.displayName || editing.contactEmail || "Teacher"} access updated.`);
      setEditing(null);
    } catch (error) {
      setMessage(`Access could not be updated: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function applyBulkTeacherAccess() {
    const selectedTeachers = teachers.filter(teacher =>
      selectedIds.has(teacher.id)
      && teacher.id !== user?.uid
      && !(teacher.roles || []).includes("owner")
    );
    if (!selectedTeachers.length || !bulkGrades.length) {
      setMessage("Select teacher accounts and at least one grade.");
      return;
    }
    if (selectedTeachers.length > 200) {
      setMessage("Apply access to no more than 200 accounts at a time.");
      return;
    }
    const gradeLabel = bulkGrades.map(grade => `Grade ${grade}`).join(", ");
    if (!window.confirm(`Assign Academic + Behavior access for ${gradeLabel} to ${selectedTeachers.length} ${selectedTeachers.length === 1 ? "account" : "accounts"}?`)) return;

    setSaving(true);
    setMessage("");
    try {
      const batch = writeBatch(db);
      selectedTeachers.forEach(teacher => {
        const preservedRoles = (teacher.roles || []).filter(role => role === "owner" || role === "mtssLead" || role === "admin");
        const nextAccess = {
          roles: [...new Set([...preservedRoles, "academic", "behavior"])],
          gradeLevels: [...bulkGrades],
          disabled: false
        };
        batch.update(doc(db, "teachers", teacher.id), nextAccess);
        batch.set(doc(collection(db, "teacherAccessEvents")), accessEvent(teacher, nextAccess));
      });
      await batch.commit();
      setMessage(`${selectedTeachers.length} ${selectedTeachers.length === 1 ? "account" : "accounts"} configured for ${gradeLabel}.`);
      setSelectedIds(new Set());
      setBulkGrades([]);
    } catch (error) {
      setMessage(`Bulk access could not be applied: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3 border-b border-slate-200 pb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700 shadow-sm ring-1 ring-sky-200"><UserCog className="h-5 w-5" /></div>
        <div><h1 className="text-xs font-bold uppercase tracking-[0.12em] text-sky-800">Admin workspace</h1><p className="mt-0.5 text-sm text-slate-600">Assign teacher roles, grade scope, and account status.</p></div>
      </header>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-md shadow-slate-200/40">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-4">
          <div><h2 className="text-base font-bold text-slate-950">Manage teachers</h2><p className="mt-0.5 text-sm text-slate-600">{pendingCount} accounts need configuration. Only the owner can change permissions.</p></div>
          <div className="flex gap-2">
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm">
              <option value="pending">Needs Configuration</option><option value="active">Active</option><option value="disabled">Disabled</option><option value="all">All Accounts</option>
            </select>
            <label className="relative w-72"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><span className="sr-only">Search teachers</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search teachers…" className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm shadow-sm" /></label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-sky-200 bg-sky-50/70 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-sky-200 bg-white px-3 text-sm font-bold text-sky-900"><Users className="h-4 w-4" />{selectedIds.size} selected</span>
            <fieldset className="flex items-center gap-2"><legend className="sr-only">Bulk grade access</legend>{GRADE_OPTIONS.map(grade => <label key={grade} className="flex h-9 items-center gap-2 rounded-lg border border-sky-200 bg-white px-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={bulkGrades.includes(grade)} onChange={() => toggleBulkGrade(grade)} />Grade {grade}</label>)}</fieldset>
          </div>
          <button type="button" onClick={applyBulkTeacherAccess} disabled={saving || selectedIds.size === 0 || bulkGrades.length === 0} className="inline-flex h-10 items-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"><Check className="h-4 w-4" />{saving ? "Applying…" : "Apply Teacher Access"}</button>
        </div>

        {editing && <form onSubmit={saveAccess} className="border-b border-sky-200 bg-sky-50/60 p-4">
          <div className="mb-3"><div className="font-bold text-slate-950">{editing.displayName || "Teacher"}</div><div className="text-xs text-slate-500">{editing.contactEmail}</div></div>
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <fieldset><legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Workspace roles</legend><div className="flex flex-wrap gap-2">{ROLE_OPTIONS.map(option => <label key={option.value} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={form.roles.includes(option.value)} onChange={() => toggleList("roles", option.value)} />{option.label}</label>)}</div></fieldset>
            <fieldset><legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Grade access</legend><div className="flex gap-2">{GRADE_OPTIONS.map(grade => <label key={grade} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={form.gradeLevels.includes(grade)} onChange={() => toggleList("gradeLevels", grade)} />Grade {grade}</label>)}</div></fieldset>
            <div className="flex items-center gap-2"><label className="mr-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.disabled} onChange={event => setForm(current => ({ ...current, disabled: event.target.checked }))} />Disabled</label><button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-sky-700 px-3 text-sm font-semibold text-white"><Check className="h-4 w-4" />{saving ? "Saving…" : "Save"}</button><button type="button" onClick={() => setEditing(null)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"><X className="h-4 w-4" />Cancel</button></div>
          </div>
        </form>}
        {message && <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700">{message}</div>}

        <div className="overflow-x-auto"><table className="min-w-full table-fixed text-sm"><thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="w-12 px-4 py-2.5"><input type="checkbox" aria-label="Select all visible teacher accounts" checked={allVisibleSelected} onChange={toggleAllVisible} disabled={!selectableTeachers.length} /></th><th className="px-4 py-2.5">Teacher</th><th className="w-72 px-4 py-2.5">Roles</th><th className="w-56 px-4 py-2.5">Grades</th><th className="w-40 px-4 py-2.5">Status</th><th className="w-24 px-4 py-2.5 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-200">{visibleTeachers.map(teacher => {
          const pending = isPending(teacher);
          const status = teacher.disabled ? "Disabled" : pending ? "Needs Configuration" : "Active";
          const statusClass = teacher.disabled ? "border-red-200 bg-red-50 text-red-800" : pending ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800";
          const selectable = teacher.id !== user?.uid && !(teacher.roles || []).includes("owner");
          return <tr key={teacher.id} className="hover:bg-sky-50/40"><td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${teacher.displayName || teacher.contactEmail || "teacher"}`} checked={selectedIds.has(teacher.id)} disabled={!selectable} onChange={() => toggleSelection(teacher.id)} /></td><td className="px-4 py-3"><div className="font-semibold text-slate-950">{teacher.displayName || "Unnamed Teacher"}</div><div className="text-xs text-slate-500">{teacher.contactEmail || "No Contact Email"}</div></td><td className="px-4 py-3 text-slate-600">{(teacher.roles || []).join(", ") || "No Roles"}</td><td className="px-4 py-3 text-slate-600">{(teacher.gradeLevels || []).map(grade => `Grade ${grade}`).join(", ") || "No Grades"}</td><td className="px-4 py-3"><span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusClass}`}>{status}</span></td><td className="px-4 py-3 text-right"><button type="button" onClick={() => beginEdit(teacher)} disabled={!selectable} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Edit</button></td></tr>;
        })}{visibleTeachers.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">No teacher accounts match this view.</td></tr>}</tbody></table></div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-bold text-slate-950">Recent Access Changes</h2><p className="mt-0.5 text-xs text-slate-500">Immutable before-and-after history for account provisioning.</p></div>
        {accessEvents.length === 0 ? <div className="px-4 py-8 text-center text-sm text-slate-500">No access changes recorded yet.</div> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2.5">Teacher</th><th className="px-4 py-2.5">Previous</th><th className="px-4 py-2.5">New Access</th><th className="px-4 py-2.5 text-right">Time</th></tr></thead><tbody className="divide-y divide-slate-100">{accessEvents.map(item => <tr key={item.id}><td className="px-4 py-3"><div className="font-semibold text-slate-900">{item.targetDisplayName}</div><div className="text-xs text-slate-500">{item.targetEmail}</div></td><td className="px-4 py-3 text-slate-600">{item.previousRoles?.join(", ") || "No roles"} · {item.previousGradeLevels?.map(grade => `Grade ${grade}`).join(", ") || "No grades"}</td><td className="px-4 py-3 text-slate-700">{item.nextDisabled ? "Disabled" : `${item.nextRoles?.join(", ") || "No roles"} · ${item.nextGradeLevels?.map(grade => `Grade ${grade}`).join(", ") || "No grades"}`}</td><td className="px-4 py-3 text-right text-xs text-slate-500">{item.occurredAt?.toDate?.().toLocaleString() || "Pending"}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
