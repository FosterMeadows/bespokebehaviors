import React, { useState } from "react";
import { Check, X } from "lucide-react";
import { HOME_CONTACT_METHODS } from "../services/behavior";

function todayInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function HomeContactForm({ onSubmit, onCancel, saving = false }) {
  const [form, setForm] = useState({
    contactedParty: "",
    method: "",
    attemptDate: todayInputValue(),
    successful: null,
    note: ""
  });
  const complete = form.contactedParty.trim() && form.method && form.attemptDate && form.successful !== null;

  function submit(event) {
    event.preventDefault();
    if (!complete || saving) return;
    onSubmit(form);
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-4">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
          Attempted Contact
          <input
            value={form.contactedParty}
            onChange={(event) => setForm(current => ({ ...current, contactedParty: event.target.value }))}
            maxLength={80}
            placeholder="Parent, Guardian, Grandmother…"
            className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal"
          />
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
          Method
          <select
            value={form.method}
            onChange={(event) => setForm(current => ({ ...current, method: event.target.value }))}
            className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal"
          >
            <option value="">Select Method</option>
            {HOME_CONTACT_METHODS.map(method => <option key={method} value={method}>{method}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
          Attempt Date
          <input
            type="date"
            value={form.attemptDate}
            onChange={(event) => setForm(current => ({ ...current, attemptDate: event.target.value }))}
            className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal"
          />
        </label>
        <fieldset>
          <legend className="text-xs font-bold uppercase tracking-wide text-slate-600">Successful</legend>
          <div className="mt-1 flex h-10 overflow-hidden rounded-lg border border-slate-300 bg-white">
            {[{ value: true, label: "Yes" }, { value: false, label: "No" }].map(option => (
              <button
                key={option.label}
                type="button"
                onClick={() => setForm(current => ({ ...current, successful: option.value }))}
                className={`flex-1 text-sm font-semibold ${form.successful === option.value ? "bg-sky-700 text-white" : "text-slate-700 hover:bg-slate-50"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-slate-600">
        Brief Note <span className="font-medium normal-case tracking-normal text-slate-400">(Optional)</span>
        <textarea
          value={form.note}
          onChange={(event) => setForm(current => ({ ...current, note: event.target.value }))}
          maxLength={240}
          rows={3}
          placeholder="Record only a brief operational note. Do not enter phone numbers or email addresses."
          className="mt-1 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium leading-6 normal-case tracking-normal"
        />
      </label>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Record the method used—never enter contact details.</p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700">
            <X className="h-3.5 w-3.5" />Cancel
          </button>
          <button type="submit" disabled={!complete || saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-700 px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
            <Check className="h-3.5 w-3.5" />{saving ? "Saving…" : "Record Attempt"}
          </button>
        </div>
      </div>
    </form>
  );
}
