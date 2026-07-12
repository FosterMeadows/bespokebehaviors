import React, { useContext, useEffect, useMemo, useState } from "react";
import { Check, Search, UserCog, X } from "lucide-react";
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { AuthContext } from "../../AuthContext.jsx";
import { db } from "../../firebaseConfig";

const ROLE_OPTIONS = [
  { value: "academic", label: "Academic" },
  { value: "behavior", label: "Behavior" },
  { value: "admin", label: "Admin" }
];
const GRADE_OPTIONS = ["6", "7", "8"];

export default function TeacherAccess() {
  const { user } = useContext(AuthContext);
  const [teachers, setTeachers] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ roles: [], gradeLevels: [], disabled: false });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => onSnapshot(
    query(collection(db, "teachers"), orderBy("displayName", "asc")),
    snapshot => setTeachers(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
    error => setMessage(`Teacher accounts could not be loaded: ${error.message}`)
  ), []);

  const visibleTeachers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return teachers.filter(teacher => !term || [teacher.displayName, teacher.contactEmail].some(value => String(value || "").toLowerCase().includes(term)));
  }, [search, teachers]);

  function beginEdit(teacher) {
    setEditing(teacher);
    setForm({
      roles: Array.isArray(teacher.roles) ? teacher.roles : [],
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

  async function saveAccess(event) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setMessage("");
    try {
      const preservedRoles = (editing.roles || []).filter(role => role === "owner" || role === "mtssLead");
      await updateDoc(doc(db, "teachers", editing.id), {
        roles: [...new Set([...preservedRoles, ...form.roles.filter(role => role !== "owner" && role !== "mtssLead")])],
        gradeLevels: [...form.gradeLevels].sort(),
        disabled: editing.id === user?.uid ? false : form.disabled
      });
      setMessage(`${editing.displayName || editing.contactEmail || "Teacher"} access updated.`);
      setEditing(null);
    } catch (error) {
      setMessage(`Access could not be updated: ${error.message}`);
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
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 p-4">
          <div><h2 className="text-base font-bold text-slate-950">Manage teachers</h2><p className="mt-0.5 text-sm text-slate-600">Only the owner can change these permissions.</p></div>
          <label className="relative w-80"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><span className="sr-only">Search teachers</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search teachers…" className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm shadow-sm" /></label>
        </div>

        {editing && <form onSubmit={saveAccess} className="border-b border-sky-200 bg-sky-50/60 p-4">
          <div className="mb-3"><div className="font-bold text-slate-950">{editing.displayName || "Teacher"}</div><div className="text-xs text-slate-500">{editing.contactEmail}</div></div>
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-5">
            <fieldset><legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Workspace roles</legend><div className="flex gap-2">{ROLE_OPTIONS.map(option => <label key={option.value} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={form.roles.includes(option.value)} onChange={() => toggleList("roles", option.value)} />{option.label}</label>)}</div></fieldset>
            <fieldset><legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Grade access</legend><div className="flex gap-2">{GRADE_OPTIONS.map(grade => <label key={grade} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={form.gradeLevels.includes(grade)} onChange={() => toggleList("gradeLevels", grade)} />Grade {grade}</label>)}</div></fieldset>
            <div className="flex items-center gap-2"><label className="mr-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.disabled} disabled={editing.id === user?.uid} onChange={event => setForm(current => ({ ...current, disabled: event.target.checked }))} />Disabled</label><button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-sky-700 px-3 text-sm font-semibold text-white"><Check className="h-4 w-4" />{saving ? "Saving…" : "Save"}</button><button type="button" onClick={() => setEditing(null)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"><X className="h-4 w-4" />Cancel</button></div>
          </div>
        </form>}
        {message && <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700">{message}</div>}

        <table className="min-w-full table-fixed text-sm"><thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2.5">Teacher</th><th className="w-72 px-4 py-2.5">Roles</th><th className="w-56 px-4 py-2.5">Grades</th><th className="w-28 px-4 py-2.5">Status</th><th className="w-24 px-4 py-2.5 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-200">{visibleTeachers.map(teacher => <tr key={teacher.id} className="hover:bg-sky-50/40"><td className="px-4 py-3"><div className="font-semibold text-slate-950">{teacher.displayName || "Unnamed teacher"}</div><div className="text-xs text-slate-500">{teacher.contactEmail || "No contact email"}</div></td><td className="px-4 py-3 text-slate-600">{(teacher.roles || []).join(", ") || "No roles"}</td><td className="px-4 py-3 text-slate-600">{(teacher.gradeLevels || []).map(grade => `Grade ${grade}`).join(", ") || "No grades"}</td><td className="px-4 py-3"><span className={`rounded-md border px-2 py-1 text-xs font-semibold ${teacher.disabled ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{teacher.disabled ? "Disabled" : "Active"}</span></td><td className="px-4 py-3 text-right"><button type="button" onClick={() => beginEdit(teacher)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">Edit</button></td></tr>)}</tbody></table>
      </section>
    </div>
  );
}
