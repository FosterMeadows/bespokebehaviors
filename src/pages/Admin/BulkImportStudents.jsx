// src/pages/Admin/BulkImportStudents.jsx
// Paste-to-import page for students: Lastname, Firstname <tab/space> Grade <tab/space> Homeroom
// Example line: "Zilleruelo, Eliza Gale\t8\tUppercue"

import React, { useMemo, useState } from "react";
import { bulkImportStudents } from "../../services/reteach";

function parseLines(text) {
  return text
    .split(/\r?\n/) // lines
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      // Split on tabs or multiple spaces
      const parts = l.split(/\t+|\s{2,}/).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 3) {
        // First part might be "Lastname, Firstname"
        const [name, grade, homeroom] = parts;
        return { displayName: name, grade, homeroom };
      } else if (parts.length === 2) {
        const [name, grade] = parts;
        return { displayName: name, grade, homeroom: "" };
      } else {
        return { displayName: parts[0], grade: "", homeroom: "" };
      }
    });
}

export default function BulkImportStudents() {
  const [raw, setRaw] = useState("");
  const rows = useMemo(() => parseLines(raw), [raw]);

  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);

  async function handleImport(e) {
    e.preventDefault();
    if (!rows.length) return;
    setBusy(true);
    try {
      const r = await bulkImportStudents(rows);
      setReport(r);
    } catch (e2) {
      setReport({ ok: false, error: e2?.message || String(e2) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-semibold">Bulk Import Students</h1>
      <p className="text-sm text-gray-600">
        Paste one per line: <code>Lastname, Firstname [tab] Grade [tab] Homeroom</code>.
      </p>

      <form onSubmit={handleImport} className="space-y-3">
        <textarea
          className="w-full h-64 border rounded p-2 font-mono"
          placeholder={`Zilleruelo, Eliza Gale\t8\tUppercue\nSmith, John\t7\tHR-B`}
          value={raw}
          onChange={e => setRaw(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <button disabled={busy || rows.length === 0} className="px-3 py-1 border rounded disabled:opacity-50">
            {busy ? "Importing…" : `Import ${rows.length} student${rows.length === 1 ? "" : "s"}`}
          </button>
          {report && (
            <span className="text-sm text-gray-700">
              {report.ok ? `Done: ${report.created} created, ${report.updated} updated, ${report.skipped} skipped.` : `Error: ${report.error}`}
            </span>
          )}
        </div>
      </form>

      <section>
        <h2 className="font-medium mb-2">Preview ({rows.length})</h2>
        <div className="max-h-64 overflow-auto border rounded">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Grade</th>
                <th className="text-left p-2">Homeroom</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="odd:bg-white even:bg-gray-50">
                  <td className="p-2">{r.displayName}</td>
                  <td className="p-2">{r.grade}</td>
                  <td className="p-2">{r.homeroom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}