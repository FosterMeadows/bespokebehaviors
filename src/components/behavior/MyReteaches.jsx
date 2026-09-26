import { ClipboardCheck, CalendarDays, MapPin, Puzzle, AlertTriangle, X, CheckCircle2, PhoneCall } from "lucide-react";
import { formatReteachDate, daysSince, formatServedDateTime } from "../../utils/behaviorPresentation.js";
import ReteachCancellationDetails from "../../components/ReteachCancellationDetails.jsx";
import HomeContactForm from "../../components/HomeContactForm.jsx";

export function MyReteaches({
  setMyStatusFilter,
  myStatusFilter,
  myReteachCounts,
  visibleMyReteaches,
  homeContactByReteach,
  cancelButton,
  editingHomeContactId,
  setEditingHomeContactId,
  contactSaving,
  handleRecordHomeContact
}) {
  return (
    <section className="space-y-4">
          <div className="sticky top-20 z-20 rounded-lg border border-slate-200 border-t-4 border-t-emerald-500 bg-gradient-to-r from-emerald-50/50 via-white to-emerald-50/50 p-3 shadow-sm backdrop-blur-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-bold text-slate-950">My Reteaches</h2>
              <div className="inline-flex flex-wrap gap-1 rounded-md bg-slate-100 p-1" aria-label="Filter my reteaches">
                {[{ value: "all", label: "All" }, { value: "pending", label: "Pending" }, { value: "served", label: "Served" }, { value: "cancelled", label: "Cancelled" }].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMyStatusFilter(option.value)}
                    className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold transition ${myStatusFilter === option.value ? "bg-white text-emerald-900 shadow-sm ring-1 ring-emerald-200" : "text-slate-600 hover:bg-white/60 hover:text-slate-900"}`}
                  >
                    {option.label}
                    <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] leading-none ${myStatusFilter === option.value ? "bg-emerald-100 text-emerald-900" : "bg-slate-200/80 text-slate-600"}`}>
                      {myReteachCounts[option.value]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {visibleMyReteaches.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white px-5 py-12 text-center shadow-sm">
              <ClipboardCheck className="mx-auto h-9 w-9 text-slate-400" aria-hidden="true" />
              <div className="mt-3 text-base font-bold text-slate-900">No {myStatusFilter === "all" ? "" : `${myStatusFilter} `}reteaches to show</div>
              <div className="mt-2 text-sm text-slate-600">
                {myStatusFilter === "all" ? "Reteaches you assign will appear here." : `You have no ${myStatusFilter} reteaches.`}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {visibleMyReteaches.map((record) => {
                const served = record.status === "served";
                const cancelled = record.status === "cancelled";
                const contactRequirement = homeContactByReteach[record.id];
                return (
                  <article key={record.id} className={`rounded-lg border border-slate-200 bg-white shadow-sm ${served ? "p-3" : "p-4"}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <h3 className="text-lg font-bold text-slate-950">{record.studentName}</h3>
                          <span className="text-sm font-semibold text-slate-500">Grade {record.grade || "-"}{record.homeroom ? ` • ${record.homeroom}` : ""}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                          <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50/80 px-2 py-1 text-slate-700">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {formatReteachDate(record.reteachDate)}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50/80 px-2 py-1 text-sky-950">
                            <MapPin className="h-3.5 w-3.5" />
                            {record.location}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50/80 px-2 py-1 text-violet-950">
                            <Puzzle className="h-3.5 w-3.5" />
                            {record.context}
                          </span>
                          {record.servedPostThreshold && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 font-bold text-red-800">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Served After Threshold
                            </span>
                          )}
                          {!record.servedPostThreshold && record.postThreshold && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 font-bold text-red-800">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Assigned After Threshold
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${cancelled ? "border-red-200 bg-red-50 text-red-800" : served ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                          {cancelled ? <X className="h-3.5 w-3.5" /> : served ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CalendarDays className="h-3.5 w-3.5" />}
                          {cancelled ? "Cancelled" : served ? "Served" : "Pending"}
                        </span>
                        {record.status === "pending" && cancelButton(record)}
                      </div>
                    </div>
                    <div className={`border-l-4 border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 ${served ? "mt-2 py-2 leading-5" : "mt-3 py-2.5 leading-6"}`}>{record.note}</div>
                    <ReteachCancellationDetails record={record} />
                    {contactRequirement?.status === "cancelled" && <p className="mt-2 text-xs font-semibold text-slate-600">Linked Home Contact Withdrawn</p>}
                    {contactRequirement?.status === "pending" && (
                      <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold">Home Contact Required</div>
                            <div className="mt-0.5 text-xs font-medium">Assigned {daysSince(contactRequirement.requiredAt)} {daysSince(contactRequirement.requiredAt) === 1 ? "Day" : "Days"} Ago</div>
                          </div>
                          {editingHomeContactId !== contactRequirement.id && (
                            <button type="button" onClick={() => setEditingHomeContactId(contactRequirement.id)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-700 px-3 text-xs font-bold text-white shadow-sm hover:bg-amber-800">
                              <PhoneCall className="h-3.5 w-3.5" />Record Home Contact
                            </button>
                          )}
                        </div>
                        {editingHomeContactId === contactRequirement.id && (
                          <HomeContactForm
                            saving={contactSaving}
                            onCancel={() => setEditingHomeContactId(null)}
                            onSubmit={(details) => handleRecordHomeContact(contactRequirement, details)}
                          />
                        )}
                      </div>
                    )}
                    {contactRequirement?.status === "completed" && (
                      <details className="group mt-2 rounded-lg border border-emerald-200 bg-emerald-50/70 text-emerald-950">
                        <summary className="cursor-pointer px-3 py-2 text-sm marker:text-emerald-600">
                          <span className="ml-1 inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-bold">Home Contact Recorded</span>
                            <span className="text-xs font-semibold text-emerald-800">
                              {contactRequirement.successful ? "Successful" : "Attempted — No Contact"} · {contactRequirement.method} · {formatReteachDate(contactRequirement.attemptDate)}
                            </span>
                          </span>
                        </summary>
                        <div className="border-t border-emerald-200 px-3 py-2 text-sm">
                          <div>{contactRequirement.contactedParty} · Recorded by {contactRequirement.recordedByName || "Staff Member"}</div>
                          {contactRequirement.note && <div className="mt-2 border-l-2 border-emerald-300 pl-3 leading-5">{contactRequirement.note}</div>}
                        </div>
                      </details>
                    )}
                    {served && (
                      <div className="mt-2 text-xs font-medium text-slate-500">
                        Marked served by {record.servedByName || "Unknown teacher"} on {formatServedDateTime(record.servedAt)}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
  );
}
