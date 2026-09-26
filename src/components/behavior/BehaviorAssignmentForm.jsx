import { Search, MapPin, Puzzle, ClipboardCheck, AlertTriangle } from "lucide-react";
import { LOCATION_OPTIONS, BEHAVIOR_CATEGORY_OPTIONS, BEHAVIOR_THRESHOLD } from "../../services/behavior";
import { formatLongInputDate, dateSortValue, formatShortReteachDate } from "../../utils/behaviorPresentation.js";
import { useState } from "react";

export function BehaviorAssignmentForm({
  handleSubmit,
  selectedStudent,
  situationComplete,
  studentQuery,
  setStudentQuery,
  setSelectedStudent,
  suggestions,
  selectStudent,
  resetDraft,
  setServedCount,
  isPostThreshold,
  canOverrideThreshold,
  thresholdAcknowledged,
  setThresholdAcknowledged,
  form,
  setForm,
  setSituationEditing,
  teacherName,
  showSituationEditor,
  disabledReason,
  clearForm,
  canSubmit,
  servedCount,
  selectedPendingCount,
  countLoading
}) {
  return (
    <form onSubmit={handleSubmit} className={`grid gap-5 ${selectedStudent ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}>
          <section className="relative space-y-6 rounded-2xl border border-emerald-200 bg-white p-5 shadow-md shadow-slate-200/60 sm:p-7">
            <div className="relative z-10">
              <BehaviorWorkflowRail currentStep={!selectedStudent ? 1 : situationComplete ? 3 : 2} />
            </div>
            {!selectedStudent ? (
              <div className="relative z-10 pb-2 pt-1">
                <h2 className="text-2xl font-bold text-slate-950">Who needs a Reteach today?</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Start by choosing an active student from the school roster.
                </p>
                <div className="relative mt-5 max-w-2xl">
                  <label className="sr-only" htmlFor="behavior-student-search">Search students</label>
                  <Search className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-emerald-600" />
                  <input
                    id="behavior-student-search"
                    type="text"
                    value={studentQuery}
                    onChange={(event) => {
                      setStudentQuery(event.target.value);
                      setSelectedStudent(null);
                    }}
                    placeholder="Search by student name..."
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 text-sm transition focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                    autoComplete="off"
                  />
                  {suggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      {suggestions.map((student) => (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => selectStudent(student)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-emerald-50 active:bg-emerald-100"
                        >
                          <span className="font-medium text-slate-900">{student.displayName}</span>
                          <span className="text-slate-500">Grade {student.grade || "-"}{student.homeroom ? ` • ${student.homeroom}` : " • Homeroom"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {studentQuery.trim() && suggestions.length === 0 && (
                  <div className="mt-3 text-sm text-slate-600">No matching students in your current scope.</div>
                )}
              </div>
            ) : (
              <>
                <div className="rounded-lg bg-gradient-to-r from-emerald-50/80 to-white px-4 py-3 ring-1 ring-emerald-100">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-emerald-900">Assign a new Reteach</div>
                      <h2 className="mt-0.5 text-xl font-bold text-slate-950">{selectedStudent.displayName}</h2>
                      <div className="mt-0.5 text-xs font-medium text-slate-500">
                        Grade {selectedStudent.grade || "-"}{selectedStudent.homeroom ? ` • ${selectedStudent.homeroom}` : " • Homeroom"}
                      </div>
                    </div>
                    <div className="flex items-start">
                      <button
                        type="button"
                        onClick={() => {
                          resetDraft();
                          setSelectedStudent(null);
                          setStudentQuery("");
                          setServedCount(null);
                        }}
                         className="inline-flex h-8 items-center justify-center rounded-md border border-emerald-200 bg-white/80 px-3 text-xs font-semibold text-emerald-900 shadow-sm transition active:translate-y-px hover:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      >
                        Change Student
                      </button>
                    </div>
                  </div>
                </div>

                {isPostThreshold && canOverrideThreshold && (
                  <PostThresholdNotice
                    studentName={selectedStudent.displayName}
                    acknowledged={thresholdAcknowledged}
                    onAcknowledge={setThresholdAcknowledged}
                  />
                )}

                {isPostThreshold && !canOverrideThreshold ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-6 text-amber-950">
                    <div className="text-sm font-bold uppercase tracking-wide">Threshold Reached</div>
                    <p className="mt-2 text-sm leading-6">
                      This student has six served reteaches. No additional reteach can be added.
                    </p>
                  </div>
                ) : !situationComplete ? (
                  <div className="rounded-lg bg-slate-50 p-4">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">Situation</h2>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800" htmlFor="behavior-location">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" />
                          Location
                        </label>
                        <select
                          id="behavior-location"
                          value={form.location}
                          onChange={(event) => {
                            const nextLocation = event.target.value;
                            setForm((current) => ({ ...current, location: nextLocation }));
                            if (nextLocation && form.context) setSituationEditing(false);
                          }}
                          className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        >
                          <option value="">Select location</option>
                          {LOCATION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800" htmlFor="behavior-context">
                          <Puzzle className="h-3.5 w-3.5 text-slate-400" />
                          Behavior Category
                        </label>
                        <select
                          id="behavior-context"
                          value={form.context}
                          onChange={(event) => {
                            const nextContext = event.target.value;
                            setForm((current) => ({ ...current, context: nextContext }));
                            if (form.location && nextContext) setSituationEditing(false);
                          }}
                          className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        >
                          <option value="">Select behavior category</option>
                          {BEHAVIOR_CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        Assigned by <span className="font-medium text-slate-800">{teacherName}</span> • {formatLongInputDate(form.reteachDate)}
                      </div>
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                        Edit date
                        <input
                          id="reteach-date"
                          type="date"
                          value={form.reteachDate}
                          onChange={(event) => setForm((current) => ({ ...current, reteachDate: event.target.value }))}
                          required
                          className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="behavior-step-in rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">What needs reteaching?</h2>
                      <span className="text-xs text-slate-500">{form.note.length}/500</span>
                    </div>

                    {showSituationEditor ? (
                      <div className="mt-3 rounded-lg bg-slate-50 p-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800" htmlFor="behavior-location">
                              <MapPin className="h-3.5 w-3.5 text-slate-400" />
                              Location
                            </label>
                            <select
                              id="behavior-location"
                              value={form.location}
                              onChange={(event) => {
                                const nextLocation = event.target.value;
                                setForm((current) => ({ ...current, location: nextLocation }));
                                if (nextLocation && form.context) setSituationEditing(false);
                              }}
                              className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            >
                              <option value="">Select location</option>
                              {LOCATION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                            </select>
                          </div>

                          <div>
                            <label className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800" htmlFor="behavior-context">
                              <Puzzle className="h-3.5 w-3.5 text-slate-400" />
                              Behavior Category
                            </label>
                            <select
                              id="behavior-context"
                              value={form.context}
                              onChange={(event) => {
                                const nextContext = event.target.value;
                                setForm((current) => ({ ...current, context: nextContext }));
                                if (form.location && nextContext) setSituationEditing(false);
                              }}
                              className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            >
                              <option value="">Select behavior category</option>
                              {BEHAVIOR_CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            Assigned by <span className="font-medium text-slate-800">{teacherName}</span> • {formatLongInputDate(form.reteachDate)}
                          </div>
                          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                            Edit date
                            <input
                              id="reteach-date"
                              type="date"
                              value={form.reteachDate}
                              onChange={(event) => setForm((current) => ({ ...current, reteachDate: event.target.value }))}
                              required
                              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-950">
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-sky-950">
                              <MapPin className="h-4 w-4 text-sky-600" />
                              {form.location}
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-violet-950">
                              <Puzzle className="h-4 w-4 text-violet-600" />
                              {form.context}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSituationEditing(true)}
                            className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white/80 px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                          >
                            Edit Situation
                          </button>
                        </div>
                        <div className="mt-2 text-sm text-slate-600">
                          Assigned by <span className="font-medium text-slate-800">{teacherName}</span> • {formatLongInputDate(form.reteachDate)}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <label className="sr-only" htmlFor="behavior-note">What needs reteaching?</label>
                      <p className="text-xs leading-5 text-slate-500">
                        Do not enter formal discipline, counseling, IEP, or WVEIS details.
                      </p>
                      <textarea
                        id="behavior-note"
                        value={form.note}
                        onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                        maxLength={500}
                        rows={5}
                        className="mt-2 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 shadow-inner shadow-slate-100 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        placeholder="Describe what happened using specific, observable actions. Include enough context to support the student’s reflection."
                      />
                    </div>

                    <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-end">
                      {disabledReason && (
                        <div className="text-sm text-slate-600 sm:mr-auto">
                          {disabledReason}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={clearForm}
                        className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400"
                      >
                        Clear
                      </button>
                      <button
                        type="submit"
                        disabled={!canSubmit}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm transition active:translate-y-px hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                      >
                        <ClipboardCheck className="h-4 w-4" />
                        {isPostThreshold ? "Add Post-Threshold Reteach" : "Add to List"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {selectedStudent && (
            <StudentSummary key={selectedStudent.id} student={selectedStudent} count={servedCount} pendingCount={selectedPendingCount} loading={countLoading} />
          )}
        </form>
  );
}

function BehaviorWorkflowRail({ currentStep }) {
  const steps = ["Choose a Student", "Set the Situation", "Write the Reteach"];
  const compact = currentStep > 1;
  return (
    <div className={`relative border-b border-slate-200 px-2 ${compact ? "pb-3 pt-0" : "pb-4 pt-1"}`} aria-label="How to create a Reteach">
      <div className={`absolute left-[16.67%] right-[16.67%] h-px bg-slate-200 ${compact ? "top-3" : "top-4"}`} aria-hidden="true" />
      <ol className="relative grid grid-cols-3 gap-2">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCurrent = stepNumber === currentStep;
          const isComplete = stepNumber < currentStep;
          return (
            <li key={step} aria-current={isCurrent ? "step" : undefined} className={`flex flex-col items-center text-center ${compact ? "gap-1" : "gap-2"}`}>
              <span className={`flex items-center justify-center rounded-full border font-bold shadow-sm transition-colors ${compact ? "h-6 w-6 text-[11px]" : "h-7 w-7 text-xs"} ${
                isCurrent
                  ? `border-emerald-700 bg-emerald-700 text-white ${compact ? "ring-2" : "ring-4"} ring-emerald-100`
                  : isComplete
                    ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                    : "border-slate-300 bg-white text-slate-500"
              }`}>
                {stepNumber}
              </span>
              <span className={`${compact ? "text-[11px]" : "text-xs"} font-semibold ${isCurrent ? "text-emerald-950" : isComplete ? "text-emerald-800" : "text-slate-500"}`}>
                {step}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StudentSummary({ student, count, pendingCount, loading }) {
  const [showAllHistory, setShowAllHistory] = useState(false);
  if (!student) return null;

  const records = [...(count?.servedRecords || [])].sort((a, b) => dateSortValue(b.reteachDate || b.servedAt) - dateSortValue(a.reteachDate || a.servedAt));
  const visibleRecords = showAllHistory ? records : records.slice(0, 4);
  const adjusted = count?.adjusted || 0;
  const remaining = Math.max(0, BEHAVIOR_THRESHOLD - adjusted);
  const tone = progressTone(adjusted);
  const thresholdPanelTone = adjusted >= 4 ? tone.tint : "bg-slate-50 ring-1 ring-slate-100";

  return (
    <aside className={`overflow-hidden rounded-lg border border-slate-200 bg-white lg:sticky lg:top-24 lg:self-start ${tone.glow}`}>
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Student Snapshot</h2>
      </div>

      <div className="p-4">
      <div className={`rounded-lg ${thresholdPanelTone} p-3`}>
        {loading ? (
          <div className="text-sm text-slate-600">Loading progress...</div>
        ) : (
          <>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Behavior reteach threshold</div>
            <div className="h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-200/70">
              <div
                className={`h-full rounded-full ${tone.bar} transition-all`}
                style={{ width: `${Math.min(100, (adjusted / BEHAVIOR_THRESHOLD) * 100)}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="mt-2.5">
              <div className="text-sm font-semibold text-slate-900">
                {remaining === 0 ? "Threshold Reached" : `Current Count: ${adjusted} · ${remaining} Until Threshold`}
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-600">
                {pendingCount} Pending Reteach{pendingCount === 1 ? "" : "es"}
              </div>
            </div>
            {count?.buybacks > 0 && (
              <div className="mt-1 text-xs text-slate-600">Includes {count.buybacks} Buyback{count.buybacks === 1 ? "" : "s"}.</div>
            )}
          </>
        )}
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Recent Reteaches</h3>
        {records.length === 0 && !loading ? (
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">No served reteaches recorded yet.</div>
        ) : (
          <div className="mt-3 space-y-0">
            {visibleRecords.map((record, index) => (
            <div key={record.id || `${record.reteachDate}-${index}`} className="relative border-l border-slate-200 pb-4 pl-5 last:pb-0">
              <span className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full ${tone.dot}`} />
              <div className="text-sm font-semibold text-slate-950">{record.context || "Unspecified"}</div>
              <div className="mt-0.5 text-sm text-slate-600">
                {record.location || "No location"} • {formatShortReteachDate(record.reteachDate || record.servedAt)} • {record.assignedByName || record.servedByName || "Unknown teacher"}
              </div>
              {record.servedPostThreshold && <div className="mt-1 text-xs font-bold uppercase tracking-wide text-red-700">Served after threshold</div>}
              {!record.servedPostThreshold && record.postThreshold && <div className="mt-1 text-xs font-bold uppercase tracking-wide text-red-700">Assigned after threshold</div>}
            </div>
            ))}
            {records.length > 4 && (
              <button
                type="button"
                onClick={() => setShowAllHistory((current) => !current)}
                className="mt-4 text-sm font-semibold text-sky-800 hover:text-sky-950 focus:outline-none focus:ring-2 focus:ring-sky-300"
              >
                {showAllHistory ? "Show recent only" : `View all ${records.length} reteaches`}
              </button>
            )}
          </div>
        )}
      </div>
      </div>
    </aside>
  );
}

function PostThresholdNotice({ studentName, acknowledged, onAcknowledge }) {
  return (
    <div className="grid overflow-hidden rounded-lg border border-amber-300 bg-amber-50 text-amber-950 sm:grid-cols-[4rem_1fr]">
      <div className="flex min-h-full items-center justify-center bg-amber-100 px-3 py-5 text-amber-700">
        <AlertTriangle className="h-8 w-8 shrink-0" />
      </div>
      <div className="p-5">
        <div className="text-sm font-bold">6 Reteaches served. Escalation threshold reached.</div>
        <p className="mt-1 text-sm leading-6">
          {studentName} may still receive a Reteach when it remains the appropriate response. This entry will be recorded as post-threshold.
        </p>
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-100/70 px-3 py-2.5 text-sm leading-5">
          <span className="font-bold">Before continuing:</span> Only use this option if your team leader or an administrator has directed you to use a Reteach instead of WVEIS. If you haven&apos;t checked with them yet, please do so.
        </p>
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-md border border-amber-200 bg-white/70 px-3 py-2.5 text-sm font-semibold leading-5">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => onAcknowledge(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-700 focus:ring-amber-400"
          />
          <span>I understand this student has reached the escalation threshold and this reteach is still the appropriate response.</span>
        </label>
      </div>
    </div>
  );
}

function progressTone(adjusted = 0) {
  if (adjusted >= 6) return {
    bar: "bg-red-500",
    dot: "bg-red-500",
    text: "text-red-800",
    tint: "bg-red-50",
    glow: "shadow-[-8px_0_16px_-10px_rgb(203_213_225)]"
  };
  if (adjusted >= 4) return {
    bar: "bg-amber-500",
    dot: "bg-amber-500",
    text: "text-amber-800",
    tint: "bg-amber-50",
    glow: "shadow-[-8px_0_16px_-10px_rgb(253_230_138)]"
  };
  return {
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    text: "text-emerald-800",
    tint: "bg-emerald-50",
    glow: "shadow-[-8px_0_16px_-10px_rgb(167_243_208)]"
  };
}
